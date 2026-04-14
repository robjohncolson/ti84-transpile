#!/usr/bin/env node
/*
Phase 123 - key-handler table initialization hunt

Report status: pending execution.

This probe is intentionally standalone and does not modify any existing files.
When you run it, it will:
- Scan the full 4 MB ROM for literal 24-bit references to 0xD008D6 and 0xD0243A.
- Decode each hit into reader, writer, address-constant, control-flow, or data.
- Estimate writer entry points by scanning backward through static call targets,
  known entry points, and nearby ADL block starts.
- Probe each unique writer entry from a post-boot snapshot after forcing both
  RAM slots back to 0xFFFFFF, then report whether either pointer changes.

Expected recommendation after running:
- If no literal writers are found, the initializer is probably using computed
  RAM addresses rather than absolute 24-bit literals. The next step should be a
  dynamic write hook over early boot / OS-init instead of a literal ROM scan.
*/

import { readFileSync } from 'node:fs';

import { ENTRY_POINTS, PRELIFTED_BLOCKS } from './ROM.transpiled.js';
import { createPeripheralBus } from './peripherals.js';
import { createExecutor } from './cpu-runtime.js';
import { decodeInstruction } from './ez80-decoder.js';

const ROM_URL = new URL('./ROM.rom', import.meta.url);
const rom = readFileSync(ROM_URL);

const RAM_START = 0x400000;
const RAM_END = 0xe00000;

const BOOT_ENTRY = 0x000000;
const BOOT_MODE = 'z80';
const BOOT_MAX_STEPS = 20000;
const BOOT_MAX_LOOP_ITERATIONS = 32;
const OS_INIT_ENTRY = 0x08c331;
const OS_INIT_MAX_STEPS = 100000;
const OS_INIT_MAX_LOOP_ITERATIONS = 10000;
const POST_INIT_ENTRY = 0x0802b2;
const POST_INIT_MAX_STEPS = 50000;
const POST_INIT_MAX_LOOP_ITERATIONS = 500;
const WRITER_PROBE_MAX_STEPS = 5000;
const WRITER_PROBE_MAX_LOOP_ITERATIONS = 500;
const STACK_SENTINEL = 0xd1a87e - 3;

const CONTEXT_BYTES = 10;
const ENTRY_SCAN_WINDOW = 0x120;
const BLOCK_FALLBACK_WINDOW = 0x40;
const DECODE_BACKTRACK = 6;

const CPU_FIELDS = [
  'a',
  'f',
  '_bc',
  '_de',
  '_hl',
  '_a2',
  '_f2',
  '_bc2',
  '_de2',
  '_hl2',
  'sp',
  'pc',
  '_ix',
  '_iy',
  'i',
  'im',
  'iff1',
  'iff2',
  'madl',
  'mbase',
  'halted',
  'cycles',
];

const TARGETS = [
  {
    key: 'ptr_de',
    label: 'PTR_DE',
    addr: 0xd008d6,
    pattern: [0xd6, 0x08, 0xd0],
  },
  {
    key: 'ptr_hl',
    label: 'PTR_HL',
    addr: 0xd0243a,
    pattern: [0x3a, 0x24, 0xd0],
  },
];

const POINTER_RANGES = TARGETS.map((target) => ({
  key: target.key,
  label: target.label,
  start: target.addr,
  end: target.addr + 2,
}));

const BLOCK_STARTS = buildBlockStarts(PRELIFTED_BLOCKS);
const CALL_TARGETS = buildCallTargets(PRELIFTED_BLOCKS);
const KNOWN_ENTRY_POINTS = normalizeEntryPoints(ENTRY_POINTS);

function hex(value, width = 6) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'n/a';
  }

  return `0x${(Number(value) >>> 0).toString(16).padStart(width, '0')}`;
}

function hexForSize(value, size) {
  return hex(value, size * 2);
}

function bytesToHex(bytes) {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join(' ');
}

function read24(mem, addr) {
  return mem[addr] | (mem[addr + 1] << 8) | (mem[addr + 2] << 16);
}

function write24(mem, addr, value) {
  mem[addr] = value & 0xff;
  mem[addr + 1] = (value >> 8) & 0xff;
  mem[addr + 2] = (value >> 16) & 0xff;
}

function snapshotCpu(cpu) {
  return Object.fromEntries(CPU_FIELDS.map((field) => [field, cpu[field]]));
}

function restoreCpu(cpu, snapshot) {
  for (const field of CPU_FIELDS) {
    cpu[field] = snapshot[field];
  }
}

function summarizeRun(run) {
  return {
    steps: run.steps,
    termination: run.termination,
    lastPc: run.lastPc ?? 0,
    lastMode: run.lastMode ?? 'adl',
    loopsForced: run.loopsForced ?? 0,
  };
}

function formatIndexedOperand(indexRegister, displacement) {
  const sign = displacement >= 0 ? '+' : '';
  return `(${indexRegister}${sign}${displacement})`;
}

function formatInstruction(inst) {
  const prefix = inst.modePrefix ? `${inst.modePrefix} ` : '';

  switch (inst.tag) {
    case 'ld-pair-imm':
      return `${prefix}ld ${inst.pair}, ${hex(inst.value)}`;
    case 'ld-pair-mem':
      if (inst.direction === 'to-mem') {
        return `${prefix}ld (${hex(inst.addr)}), ${inst.pair}`;
      }
      return `${prefix}ld ${inst.pair}, (${hex(inst.addr)})`;
    case 'ld-mem-pair':
      return `${prefix}ld (${hex(inst.addr)}), ${inst.pair}`;
    case 'ld-reg-mem':
      return `${prefix}ld ${inst.dest}, (${hex(inst.addr)})`;
    case 'ld-mem-reg':
      return `${prefix}ld (${hex(inst.addr)}), ${inst.src}`;
    case 'ld-reg-imm':
      return `${prefix}ld ${inst.dest}, ${hex(inst.value, 2)}`;
    case 'ld-reg-reg':
      return `${prefix}ld ${inst.dest}, ${inst.src}`;
    case 'ld-reg-ind':
      return `${prefix}ld ${inst.dest}, (${inst.src})`;
    case 'ld-ind-reg':
      return `${prefix}ld (${inst.dest}), ${inst.src}`;
    case 'ld-reg-ixd':
      return `${prefix}ld ${inst.dest}, ${formatIndexedOperand(inst.indexRegister, inst.displacement)}`;
    case 'ld-ixd-reg':
      return `${prefix}ld ${formatIndexedOperand(inst.indexRegister, inst.displacement)}, ${inst.src}`;
    case 'call':
      return `${prefix}call ${hex(inst.target)}`;
    case 'call-conditional':
      return `${prefix}call ${inst.condition}, ${hex(inst.target)}`;
    case 'jp':
      return `${prefix}jp ${hex(inst.target)}`;
    case 'jp-conditional':
      return `${prefix}jp ${inst.condition}, ${hex(inst.target)}`;
    case 'jr':
      return `${prefix}jr ${hex(inst.target)}`;
    case 'jr-conditional':
      return `${prefix}jr ${inst.condition}, ${hex(inst.target)}`;
    case 'push':
      return `${prefix}push ${inst.pair}`;
    case 'pop':
      return `${prefix}pop ${inst.pair}`;
    case 'inc-pair':
      return `${prefix}inc ${inst.pair}`;
    case 'dec-pair':
      return `${prefix}dec ${inst.pair}`;
    case 'inc-reg':
      return `${prefix}inc ${inst.reg}`;
    case 'dec-reg':
      return `${prefix}dec ${inst.reg}`;
    case 'alu-imm':
      return `${prefix}${inst.op} ${hex(inst.value, 2)}`;
    case 'alu-reg':
      return `${prefix}${inst.op} ${inst.src}`;
    case 'add-pair':
      return `${prefix}add ${inst.dest}, ${inst.src}`;
    case 'ret':
      return `${prefix}ret`;
    case 'ret-conditional':
      return `${prefix}ret ${inst.condition}`;
    case 'jp-indirect':
      return `${prefix}jp (${inst.indirectRegister})`;
    case 'indexed-cb-bit':
      return `${prefix}bit ${inst.bit}, ${formatIndexedOperand(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-res':
      return `${prefix}res ${inst.bit}, ${formatIndexedOperand(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-set':
      return `${prefix}set ${inst.bit}, ${formatIndexedOperand(inst.indexRegister, inst.displacement)}`;
    case 'bit-test':
      return `${prefix}bit ${inst.bit}, ${inst.reg}`;
    case 'bit-test-ind':
      return `${prefix}bit ${inst.bit}, (${inst.indirectRegister})`;
    case 'nop':
    case 'halt':
    case 'scf':
    case 'ccf':
    case 'ex-de-hl':
    case 'exx':
    case 'di':
    case 'ei':
      return `${prefix}${inst.tag}`;
    default:
      return `${prefix}${inst.tag}`;
  }
}

function buildBlockStarts(blocks) {
  return Object.keys(blocks)
    .map((key) => key.split(':'))
    .filter((parts) => parts.length === 2 && parts[1] === 'adl')
    .map((parts) => parseInt(parts[0], 16))
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right);
}

function buildCallTargets(blocks) {
  const targets = new Set();

  for (const block of Object.values(blocks)) {
    for (const exit of block.exits ?? []) {
      if (!Number.isFinite(exit.target)) continue;
      if (typeof exit.type !== 'string') continue;
      if (!exit.type.includes('call')) continue;
      targets.add(exit.target & 0xffffff);
    }
  }

  return Array.from(targets).sort((left, right) => left - right);
}

function normalizeEntryPoints(entryPoints) {
  if (!Array.isArray(entryPoints)) {
    return [];
  }

  return entryPoints
    .map((value) => Number(value) & 0xffffff)
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right);
}

function findNearestLessOrEqual(sortedValues, value) {
  let lo = 0;
  let hi = sortedValues.length - 1;
  let best = null;

  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const current = sortedValues[mid];

    if (current <= value) {
      best = current;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  return best;
}

function estimateFunctionStart(pc) {
  const callTarget = findNearestLessOrEqual(CALL_TARGETS, pc);
  if (callTarget !== null && pc - callTarget <= ENTRY_SCAN_WINDOW) {
    return {
      entry: callTarget,
      reason: 'nearest static call target within 0x120 bytes',
    };
  }

  const entryPoint = findNearestLessOrEqual(KNOWN_ENTRY_POINTS, pc);
  if (entryPoint !== null && pc - entryPoint <= ENTRY_SCAN_WINDOW) {
    return {
      entry: entryPoint,
      reason: 'nearest known entry point within 0x120 bytes',
    };
  }

  const blockStart = findNearestLessOrEqual(BLOCK_STARTS, pc);
  if (blockStart !== null && pc - blockStart <= BLOCK_FALLBACK_WINDOW) {
    return {
      entry: blockStart,
      reason: 'nearest ADL block within 0x40 bytes',
    };
  }

  if (blockStart !== null) {
    return {
      entry: blockStart,
      reason: 'nearest ADL block fallback',
    };
  }

  return {
    entry: pc,
    reason: 'instruction PC fallback',
  };
}

function findPatternHits(target) {
  const hits = [];

  for (let offset = 0; offset <= rom.length - target.pattern.length; offset += 1) {
    if (
      rom[offset] !== target.pattern[0] ||
      rom[offset + 1] !== target.pattern[1] ||
      rom[offset + 2] !== target.pattern[2]
    ) {
      continue;
    }

    const beforeStart = Math.max(0, offset - CONTEXT_BYTES);
    const before = rom.slice(beforeStart, offset);
    const afterEnd = Math.min(rom.length, offset + 3 + CONTEXT_BYTES);
    const after = rom.slice(offset + 3, afterEnd);

    hits.push({
      targetKey: target.key,
      targetLabel: target.label,
      targetAddr: target.addr,
      romOffset: offset,
      contextBefore: Array.from(before),
      contextMatch: Array.from(rom.slice(offset, offset + 3)),
      contextAfter: Array.from(after),
    });
  }

  return hits;
}

function sliceMatchesPattern(bytes, relativeOffset, pattern) {
  if (relativeOffset < 0 || relativeOffset + pattern.length > bytes.length) {
    return false;
  }

  for (let index = 0; index < pattern.length; index += 1) {
    if (bytes[relativeOffset + index] !== pattern[index]) {
      return false;
    }
  }

  return true;
}

function classifyInstruction(inst, targetAddr) {
  if (inst.addr === targetAddr) {
    if (inst.tag === 'ld-pair-mem') {
      if (inst.direction === 'to-mem') {
        return {
          kind: 'writer',
          role: 'writer',
          detail: 'absolute store through ld-pair-mem',
          score: 140,
        };
      }

      return {
        kind: 'reader',
        role: 'reader',
        detail: 'absolute load through ld-pair-mem',
        score: 140,
      };
    }

    if (inst.tag === 'ld-mem-pair') {
      return {
        kind: 'writer',
        role: 'writer',
        detail: 'absolute store through ld-mem-pair',
        score: 140,
      };
    }

    if (inst.tag === 'ld-reg-mem') {
      return {
        kind: 'reader',
        role: 'reader',
        detail: 'absolute byte load through ld-reg-mem',
        score: 140,
      };
    }

    if (inst.tag === 'ld-mem-reg') {
      return {
        kind: 'writer',
        role: 'writer',
        detail: 'absolute byte store through ld-mem-reg',
        score: 140,
      };
    }

    return {
      kind: 'memory-ref',
      role: 'other',
      detail: `absolute memory reference via ${inst.tag}`,
      score: 100,
    };
  }

  if (inst.value === targetAddr) {
    if (inst.tag === 'ld-pair-imm') {
      return {
        kind: 'address-constant',
        role: 'other',
        detail: 'loads the pointer address as a literal',
        score: 90,
      };
    }

    return {
      kind: 'constant',
      role: 'other',
      detail: `uses ${hex(targetAddr)} as an immediate literal`,
      score: 70,
    };
  }

  if (inst.target === targetAddr) {
    return {
      kind: 'control-flow',
      role: 'other',
      detail: 'uses the bytes as a control-flow target',
      score: 70,
    };
  }

  return {
    kind: 'instruction-bytes',
    role: 'other',
    detail: 'pattern appears inside the instruction bytes, but the decoder fields do not name it',
    score: 15,
  };
}

function decodeHit(hit, target) {
  const candidates = [];

  for (
    let start = Math.max(0, hit.romOffset - DECODE_BACKTRACK);
    start <= hit.romOffset;
    start += 1
  ) {
    let inst;

    try {
      inst = decodeInstruction(rom, start, 'adl');
    } catch {
      continue;
    }

    if (!inst || !Number.isFinite(inst.length) || inst.length <= 0) {
      continue;
    }

    const end = start + inst.length;
    if (hit.romOffset < start || hit.romOffset + 2 >= end) {
      continue;
    }

    const bytes = rom.slice(start, end);
    const relativeOffset = hit.romOffset - start;
    if (!sliceMatchesPattern(bytes, relativeOffset, target.pattern)) {
      continue;
    }

    const classification = classifyInstruction(inst, target.addr);
    candidates.push({
      start,
      end,
      inst,
      bytes: Array.from(bytes),
      classification,
      score: classification.score - relativeOffset,
    });
  }

  candidates.sort((left, right) => right.score - left.score || left.start - right.start);

  if (candidates.length === 0) {
    return {
      ...hit,
      kind: 'data',
      role: 'other',
      classification: 'data / undecoded bytes',
      instructionPc: null,
      instructionBytes: null,
      instructionText: null,
      entryEstimate: null,
      entryEstimateReason: null,
    };
  }

  const best = candidates[0];
  const entryEstimate = best.classification.kind === 'writer'
    ? estimateFunctionStart(best.start)
    : null;

  return {
    ...hit,
    kind: best.classification.kind,
    role: best.classification.role,
    classification: best.classification.detail,
    instructionPc: best.start,
    instructionBytes: bytesToHex(best.bytes),
    instructionText: formatInstruction(best.inst),
    entryEstimate: entryEstimate?.entry ?? null,
    entryEstimateReason: entryEstimate?.reason ?? null,
  };
}

function analyzeTarget(target) {
  const rawHits = findPatternHits(target);
  const decodedHits = rawHits.map((hit) => decodeHit(hit, target));

  return {
    target,
    hits: decodedHits,
    counts: countByKind(decodedHits),
  };
}

function countByKind(hits) {
  const counts = {
    total: hits.length,
    reader: 0,
    writer: 0,
    'address-constant': 0,
    'control-flow': 0,
    'memory-ref': 0,
    constant: 0,
    'instruction-bytes': 0,
    data: 0,
  };

  for (const hit of hits) {
    if (counts[hit.kind] === undefined) {
      counts[hit.kind] = 0;
    }
    counts[hit.kind] += 1;
  }

  return counts;
}

function formatContext(hit) {
  const before = bytesToHex(hit.contextBefore);
  const match = bytesToHex(hit.contextMatch);
  const after = bytesToHex(hit.contextAfter);
  return [before, `[${match}]`, after].filter(Boolean).join(' ').trim();
}

function groupWriterHits(reports) {
  const groups = new Map();

  for (const report of reports) {
    for (const hit of report.hits) {
      if (hit.kind !== 'writer' || hit.entryEstimate === null) {
        continue;
      }

      const key = hit.entryEstimate;
      const existing = groups.get(key);
      if (existing) {
        existing.hits.push(hit);
        continue;
      }

      groups.set(key, {
        entry: hit.entryEstimate,
        reason: hit.entryEstimateReason,
        hits: [hit],
      });
    }
  }

  return Array.from(groups.values()).sort((left, right) => left.entry - right.entry);
}

function applyCpuFix(cpu) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.mbase = 0xd0;
  cpu._iy = 0xd00080;
  cpu._hl = 0;
}

function prepareStack(cpu, mem) {
  cpu.sp = STACK_SENTINEL;
  write24(mem, cpu.sp, 0xffffff);
}

function bootEnvironment() {
  const mem = new Uint8Array(0x1000000);
  mem.set(rom);

  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(PRELIFTED_BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  const coldBoot = executor.runFrom(BOOT_ENTRY, BOOT_MODE, {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: BOOT_MAX_LOOP_ITERATIONS,
  });

  applyCpuFix(cpu);
  prepareStack(cpu, mem);

  const osInit = executor.runFrom(OS_INIT_ENTRY, 'adl', {
    maxSteps: OS_INIT_MAX_STEPS,
    maxLoopIterations: OS_INIT_MAX_LOOP_ITERATIONS,
  });

  applyCpuFix(cpu);
  prepareStack(cpu, mem);

  const postInit = executor.runFrom(POST_INIT_ENTRY, 'adl', {
    maxSteps: POST_INIT_MAX_STEPS,
    maxLoopIterations: POST_INIT_MAX_LOOP_ITERATIONS,
  });

  applyCpuFix(cpu);
  prepareStack(cpu, mem);

  return {
    mem,
    executor,
    cpu,
    coldBoot,
    osInit,
    postInit,
    baselineRam: new Uint8Array(mem.slice(RAM_START, RAM_END)),
    baselineCpu: snapshotCpu(cpu),
  };
}

function restoreBaseline(env) {
  env.mem.set(env.baselineRam, RAM_START);
  restoreCpu(env.cpu, env.baselineCpu);
  applyCpuFix(env.cpu);
  prepareStack(env.cpu, env.mem);
}

function forceColdPointerState(mem) {
  for (const target of TARGETS) {
    write24(mem, target.addr, 0xffffff);
  }
}

function intersectsRange(addr, size, range) {
  const start = addr & 0xffffff;
  const end = start + size - 1;
  return start <= range.end && end >= range.start;
}

function installPointerWriteHook(env) {
  const writes = [];
  const state = {
    currentPc: 0,
    currentStep: 0,
  };

  const originalWrite8 = env.cpu.write8.bind(env.cpu);
  const originalWrite16 = env.cpu.write16.bind(env.cpu);
  const originalWrite24 = env.cpu.write24.bind(env.cpu);

  function recordWrite(addr, size, value) {
    const maskedAddr = addr & 0xffffff;
    const touchedTargets = POINTER_RANGES
      .filter((range) => intersectsRange(maskedAddr, size, range))
      .map((range) => range.label);

    if (touchedTargets.length === 0) {
      return;
    }

    writes.push({
      addr: maskedAddr,
      size,
      value: value & (size === 1 ? 0xff : size === 2 ? 0xffff : 0xffffff),
      pc: state.currentPc,
      step: state.currentStep,
      targets: touchedTargets,
    });
  }

  env.cpu.write8 = (addr, value) => {
    recordWrite(addr, 1, value);
    return originalWrite8(addr, value);
  };

  env.cpu.write16 = (addr, value) => {
    recordWrite(addr, 2, value);
    return originalWrite16(addr, value);
  };

  env.cpu.write24 = (addr, value) => {
    recordWrite(addr, 3, value);
    return originalWrite24(addr, value);
  };

  return {
    writes,
    onBlock(pc, _mode, _meta, steps) {
      state.currentPc = pc & 0xffffff;
      state.currentStep = steps;
    },
    uninstall() {
      env.cpu.write8 = originalWrite8;
      env.cpu.write16 = originalWrite16;
      env.cpu.write24 = originalWrite24;
    },
  };
}

function probeWriterGroup(env, group) {
  restoreBaseline(env);
  forceColdPointerState(env.mem);

  const before = {
    ptrDe: read24(env.mem, TARGETS[0].addr),
    ptrHl: read24(env.mem, TARGETS[1].addr),
  };

  const hook = installPointerWriteHook(env);
  const run = env.executor.runFrom(group.entry, 'adl', {
    maxSteps: WRITER_PROBE_MAX_STEPS,
    maxLoopIterations: WRITER_PROBE_MAX_LOOP_ITERATIONS,
    onBlock: hook.onBlock,
  });
  hook.uninstall();

  const after = {
    ptrDe: read24(env.mem, TARGETS[0].addr),
    ptrHl: read24(env.mem, TARGETS[1].addr),
  };

  return {
    entry: group.entry,
    reason: group.reason,
    writerSites: group.hits.map((hit) => ({
      targetLabel: hit.targetLabel,
      romOffset: hit.romOffset,
      instructionPc: hit.instructionPc,
      instructionText: hit.instructionText,
    })),
    before,
    after,
    writes: hook.writes,
    run: summarizeRun(run),
  };
}

function buildRecommendation(reports, writerRuns) {
  const writerHits = reports.flatMap((report) => report.hits.filter((hit) => hit.kind === 'writer'));

  if (writerHits.length === 0) {
    return [
      'No literal writer was found for either RAM pointer.',
      'Next step: hook writes to 0xD008D6 and 0xD0243A during early boot / 0x08C331 / 0x0802B2, because the initializer probably computes these addresses instead of embedding them as absolute 24-bit literals.',
    ];
  }

  const successfulRuns = writerRuns.filter(
    (run) => run.after.ptrDe !== 0xffffff || run.after.ptrHl !== 0xffffff,
  );

  if (successfulRuns.length === 0) {
    return [
      'Literal writers do exist, but none of the standalone entry probes moved either pointer away from 0xFFFFFF.',
      'Next step: trace callers into those writer functions or pre-seed any required register / RAM preconditions before probing again.',
    ];
  }

  return [
    'At least one writer probe changed a key-table pointer away from 0xFFFFFF.',
    'Next step: chase the caller path into that function and confirm where it sits in the real cold-boot initialization sequence.',
  ];
}

function buildReport(reports, writerRuns, env) {
  const lines = [];

  lines.push('# Phase 123 - Key-Handler Table Initialization Hunt');
  lines.push('');
  lines.push(`- ROM size: ${rom.length} bytes`);
  lines.push(`- Targets: ${TARGETS.map((target) => `${target.label}=${hex(target.addr)}`).join(', ')}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');

  for (const report of reports) {
    const { target, counts } = report;
    lines.push(
      `- ${target.label} (${hex(target.addr)}): total=${counts.total}, readers=${counts.reader}, writers=${counts.writer}, address_constants=${counts['address-constant']}, control_flow=${counts['control-flow']}, data=${counts.data}`,
    );
  }

  lines.push('');
  lines.push('## Static References');
  lines.push('');

  for (const report of reports) {
    lines.push(`### ${report.target.label} (${hex(report.target.addr)})`);
    lines.push('');
    lines.push('| ROM offset | kind | instruction PC | instruction | entry estimate | context |');
    lines.push('|---|---|---|---|---|---|');

    if (report.hits.length === 0) {
      lines.push(`| (none) | - | - | - | - | - |`);
    } else {
      for (const hit of report.hits) {
        const entryText = hit.entryEstimate === null
          ? '-'
          : `${hex(hit.entryEstimate)} (${hit.entryEstimateReason})`;
        lines.push(
          `| ${hex(hit.romOffset)} | ${hit.kind} | ${hit.instructionPc === null ? '-' : hex(hit.instructionPc)} | ${hit.instructionText ?? hit.classification} | ${entryText} | ${formatContext(hit)} |`,
        );
      }
    }

    lines.push('');
  }

  lines.push('## Readers vs Writers');
  lines.push('');

  const readerHits = reports.flatMap((report) => report.hits.filter((hit) => hit.kind === 'reader'));
  const writerHits = reports.flatMap((report) => report.hits.filter((hit) => hit.kind === 'writer'));

  lines.push(`- Reader sites: ${readerHits.length}`);
  for (const hit of readerHits) {
    lines.push(
      `  - ${hit.targetLabel}: rom=${hex(hit.romOffset)} pc=${hex(hit.instructionPc)} ${hit.instructionText}`,
    );
  }

  lines.push(`- Writer sites: ${writerHits.length}`);
  for (const hit of writerHits) {
    lines.push(
      `  - ${hit.targetLabel}: rom=${hex(hit.romOffset)} pc=${hex(hit.instructionPc)} ${hit.instructionText} entry=${hex(hit.entryEstimate)} (${hit.entryEstimateReason})`,
    );
  }

  lines.push('');
  lines.push('## Dynamic Writer Probes');
  lines.push('');

  if (!env) {
    lines.push('- No writer functions were found, so no dynamic probe was attempted.');
    lines.push('');
  } else {
    lines.push(
      `- Baseline boot: coldBoot=${summarizeRun(env.coldBoot).termination}, osInit=${summarizeRun(env.osInit).termination}, postInit=${summarizeRun(env.postInit).termination}`,
    );
    lines.push('');
    lines.push('| Entry | Reason | Writer sites | Before DE | After DE | Before HL | After HL | Writes observed | Run result |');
    lines.push('|---|---|---|---|---|---|---|---|---|');

    if (writerRuns.length === 0) {
      lines.push('| (none) | - | - | - | - | - | - | - | - |');
    } else {
      for (const run of writerRuns) {
        const writerSites = run.writerSites
          .map((site) => `${site.targetLabel}@${hex(site.instructionPc)}`)
          .join(', ');
        const runSummary = `${run.run.termination}; steps=${run.run.steps}; lastPc=${hex(run.run.lastPc)}`;
        lines.push(
          `| ${hex(run.entry)} | ${run.reason} | ${writerSites} | ${hex(run.before.ptrDe)} | ${hex(run.after.ptrDe)} | ${hex(run.before.ptrHl)} | ${hex(run.after.ptrHl)} | ${run.writes.length} | ${runSummary} |`,
        );
      }
    }

    lines.push('');

    for (const run of writerRuns) {
      lines.push(`### Probe ${hex(run.entry)}`);
      lines.push('');
      lines.push(`- Reason: ${run.reason}`);
      lines.push(`- Before: PTR_DE=${hex(run.before.ptrDe)}, PTR_HL=${hex(run.before.ptrHl)}`);
      lines.push(`- After: PTR_DE=${hex(run.after.ptrDe)}, PTR_HL=${hex(run.after.ptrHl)}`);
      lines.push(`- Run: termination=${run.run.termination}, steps=${run.run.steps}, lastPc=${hex(run.run.lastPc)}, loopsForced=${run.run.loopsForced}`);
      lines.push(`- Writer sites: ${run.writerSites.map((site) => `${site.targetLabel}@${hex(site.instructionPc)} (${site.instructionText})`).join('; ')}`);
      lines.push('- Write log:');

      if (run.writes.length === 0) {
        lines.push('  - (none)');
      } else {
        for (const write of run.writes) {
          lines.push(
            `  - step=${write.step} pc=${hex(write.pc)} addr=${hex(write.addr)} size=${write.size} value=${hexForSize(write.value, write.size)} targets=${write.targets.join(', ')}`,
          );
        }
      }

      lines.push('');
    }
  }

  lines.push('## Recommendation');
  lines.push('');
  for (const line of buildRecommendation(reports, writerRuns)) {
    lines.push(`- ${line}`);
  }

  lines.push('');
  return lines.join('\n');
}

function main() {
  const reports = TARGETS.map((target) => analyzeTarget(target));
  const writerGroups = groupWriterHits(reports);

  let env = null;
  let writerRuns = [];

  if (writerGroups.length > 0) {
    env = bootEnvironment();
    writerRuns = writerGroups.map((group) => probeWriterGroup(env, group));
  }

  const report = buildReport(reports, writerRuns, env);
  console.log(report);
}

main();

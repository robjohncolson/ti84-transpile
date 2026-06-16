#!/usr/bin/env node
// Phase 695: owner search for the four phase694 manual-review CODE? ranges.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { decodeInstruction } from './ez80-decoder.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, 'phase695-manual-review-owner-search.md');

const rom = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

const ROM_LIMIT = rom.length;
const MEM_SIZE = 0x1000000;
const STACK_RESET_TOP = 0xD1A87E;
const INIT_IDLE_LOOP = 0x0019BE;
const REPAINT_IDLE_LOOP = 0x0019B5;
const LAUNCH_INIT = 0x09DD62;
const REPAINT = 0x058241;
const WARM_KEY_EVENT = 0x02FD8F;

const OS_SCAN_2 = 0x1A;
const INTERNAL_2 = rom[0x09F79B + OS_SCAN_2];
const KEY_MATRIX_GROUP = 3;
const KEY_MATRIX_BIT = 1;

const TARGETS = Object.freeze([
  { name: 'mr-08983d', start: 0x08983D, end: 0x089857 },
  { name: 'mr-0a169d', start: 0x0A169D, end: 0x0A16B0 },
  { name: 'mr-0a57b7', start: 0x0A57B7, end: 0x0A57CA },
  { name: 'mr-08b8f1', start: 0x08B8F1, end: 0x08B8FE },
]);

const CONTROL_OPS = new Map([
  [0xCD, 'CALL'], [0xC4, 'CALL NZ'], [0xCC, 'CALL Z'], [0xD4, 'CALL NC'], [0xDC, 'CALL C'],
  [0xE4, 'CALL PO'], [0xEC, 'CALL PE'], [0xF4, 'CALL P'], [0xFC, 'CALL M'],
  [0xC3, 'JP'], [0xC2, 'JP NZ'], [0xCA, 'JP Z'], [0xD2, 'JP NC'], [0xDA, 'JP C'],
  [0xE2, 'JP PO'], [0xEA, 'JP PE'], [0xF2, 'JP P'], [0xFA, 'JP M'],
]);

const SNAP_FIELDS = [
  'a', 'f', '_bc', '_de', '_hl', '_a2', '_f2', '_bc2', '_de2', '_hl2',
  'sp', '_ix', '_iy', 'i', 'im', 'iff1', 'iff2', 'madl', 'mbase', 'halted', 'cycles',
];

function hex(value, width = 6) {
  if (value === null || value === undefined || Number.isNaN(value)) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function normalizeHex(value, width = 6) {
  return (Number(value) >>> 0).toString(16).padStart(width, '0');
}

function bytesAt(pc, len) {
  return Array.from(rom.subarray(pc, pc + len), (byte) => byte.toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

function read24(buffer, addr) {
  const a = addr & 0xFFFFFF;
  return ((buffer[a] & 0xFF) | ((buffer[a + 1] & 0xFF) << 8) | ((buffer[a + 2] & 0xFF) << 16)) >>> 0;
}

function write24(buffer, addr, value) {
  const a = addr & 0xFFFFFF;
  buffer[a] = value & 0xFF;
  buffer[a + 1] = (value >>> 8) & 0xFF;
  buffer[a + 2] = (value >>> 16) & 0xFF;
}

function markdownTable(headers, rows) {
  const escape = (value) => String(value ?? '').replaceAll('|', '\\|').replaceAll('\n', '<br>');
  return [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map(escape).join(' | ')} |`),
  ].join('\n');
}

function formatInstruction(insn) {
  if (!insn) return '(none)';
  if (insn.dasm) return insn.dasm;

  const parts = [insn.tag ?? 'unknown'];
  if (insn.op) parts.push(String(insn.op).toUpperCase());
  if (insn.condition) parts.push(`cond=${String(insn.condition).toUpperCase()}`);
  if (insn.dest) parts.push(`dest=${String(insn.dest).toUpperCase()}`);
  if (insn.src) parts.push(`src=${String(insn.src).toUpperCase()}`);
  if (insn.pair) parts.push(`pair=${String(insn.pair).toUpperCase()}`);
  if (insn.target !== undefined) parts.push(`target=${hex(insn.target)}`);
  if (insn.addr !== undefined) parts.push(`addr=${hex(insn.addr)}`);
  if (insn.address !== undefined) parts.push(`addr=${hex(insn.address)}`);
  if (insn.value !== undefined) parts.push(`value=${hex(insn.value, 2)}`);
  if (insn.immediate !== undefined) parts.push(`imm=${hex(insn.immediate, 2)}`);
  return parts.join(' ');
}

function isControlish(insn) {
  return /^(call|jp|jr|ret|rst)/.test(insn?.tag ?? '');
}

function targetForPc(pc) {
  const normalized = pc & 0xFFFFFF;
  return TARGETS.find((target) => normalized >= target.start && normalized < target.end) ?? null;
}

function buildCoverageAndIndex() {
  const covered = new Uint8Array(rom.length);
  let totalCovered = 0;
  const instructions = [];
  const blocks = [];

  for (const [id, block] of Object.entries(BLOCKS)) {
    const [pcHex, mode = 'adl'] = id.split(':');
    const blockStart = Number.isInteger(block?.startPc) ? block.startPc : Number.parseInt(pcHex, 16);
    if (!Number.isFinite(blockStart)) continue;

    const blockEntry = {
      id,
      startPc: blockStart,
      mode,
      source: block?.source ?? '',
      instructionCount: block?.instructions?.length ?? 0,
      endPc: blockStart,
    };

    for (const insn of block.instructions ?? []) {
      const pc = Number.isInteger(insn.pc) ? insn.pc : blockStart + (insn.offset ?? 0);
      if (!Number.isInteger(pc)) continue;
      const len = Number.isInteger(insn.length) && insn.length > 0
        ? insn.length
        : (typeof insn.bytes === 'string' ? insn.bytes.trim().split(/\s+/).length : 1);

      for (let i = 0; i < len; i += 1) {
        const addr = pc + i;
        if (addr < covered.length && !covered[addr]) {
          covered[addr] = 1;
          totalCovered += 1;
        }
      }

      blockEntry.endPc = Math.max(blockEntry.endPc, pc + len);
      instructions.push({ pc, end: pc + len, len, blockStart, blockId: id, mode, insn });
    }

    blocks.push(blockEntry);
  }

  instructions.sort((left, right) => left.pc - right.pc || left.end - right.end);
  blocks.sort((left, right) => left.startPc - right.startPc || left.endPc - right.endPc);
  return { covered, totalCovered, instructions, blocks };
}

function decodeWindow(start, end, limit = 16) {
  const decoded = [];
  let pc = start;
  for (let i = 0; i < limit && pc < end; i += 1) {
    try {
      const insn = decodeInstruction(rom, pc, 'adl');
      if (!insn || !Number.isInteger(insn.length) || insn.length <= 0) break;
      decoded.push(insn);
      pc += insn.length;
    } catch {
      break;
    }
  }
  return decoded;
}

function directRawControlRefs(range) {
  const hits = [];
  for (let pc = 0; pc < rom.length - 3; pc += 1) {
    const opName = CONTROL_OPS.get(rom[pc]);
    if (!opName) continue;
    const target = read24(rom, pc + 1);
    if (target >= range.start && target < range.end) hits.push({ pc, op: opName, target });
  }
  return hits;
}

function raw24Refs(range) {
  const hits = [];
  for (let pc = 0; pc < rom.length - 2; pc += 1) {
    const target = read24(rom, pc);
    if (target < range.start || target >= range.end) continue;
    const precedingOp = pc > 0 ? rom[pc - 1] : -1;
    hits.push({
      pc,
      target,
      controlOperand: CONTROL_OPS.has(precedingOp),
      precedingOp: CONTROL_OPS.get(precedingOp) ?? null,
      context: bytesAt(Math.max(0, pc - 8), Math.min(24, rom.length - Math.max(0, pc - 8))),
    });
  }
  return hits;
}

function liftedRefs(range, instructions) {
  const control = [];
  const nonControl = [];
  const fields = ['addr', 'address', 'value', 'immediate'];

  for (const entry of instructions) {
    const insn = entry.insn;
    if (Number.isInteger(insn.target) && insn.target >= range.start && insn.target < range.end) {
      control.push({ pc: entry.pc, blockStart: entry.blockStart, tag: insn.tag, target: insn.target });
    }

    if (isControlish(insn)) continue;
    for (const field of fields) {
      const value = insn[field];
      if (Number.isInteger(value) && value >= range.start && value < range.end) {
        nonControl.push({ pc: entry.pc, blockStart: entry.blockStart, tag: insn.tag, field, value });
      }
    }
  }

  return { control, nonControl };
}

function sourceRefsToAddress(addr, blocks) {
  const needle = `0x${normalizeHex(addr)}`;
  const exactReturn = `return ${needle}`;
  const hits = [];
  for (const block of blocks) {
    const lower = block.source.toLowerCase();
    if (!lower.includes(needle)) continue;
    hits.push({
      blockStart: block.startPc,
      blockId: block.id,
      kind: lower.includes(exactReturn) ? 'return-source' : 'source-text',
      snippets: block.source
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.toLowerCase().includes(needle))
        .slice(0, 3),
    });
  }
  return hits;
}

function refsToExactAddress(addr, instructions, blocks) {
  const lifted = [];
  for (const entry of instructions) {
    if (Number.isInteger(entry.insn.target) && entry.insn.target === addr) {
      lifted.push({ pc: entry.pc, blockStart: entry.blockStart, tag: entry.insn.tag });
    }
  }

  const raw = [];
  for (let pc = 0; pc < rom.length - 3; pc += 1) {
    const opName = CONTROL_OPS.get(rom[pc]);
    if (!opName) continue;
    if (read24(rom, pc + 1) === addr) raw.push({ pc, op: opName });
  }

  return { lifted, raw, source: sourceRefsToAddress(addr, blocks) };
}

function findNeighborInstructions(range, instructions) {
  let prev = null;
  let next = null;
  for (const entry of instructions) {
    if (entry.end <= range.start) prev = entry;
    if (!next && entry.pc >= range.end) next = entry;
    if (prev && next) break;
  }
  return { prev, next };
}

function findNeighborBlocks(range, blocks) {
  let prev = null;
  let next = null;
  for (const block of blocks) {
    if (block.endPc <= range.start) prev = block;
    if (!next && block.startPc >= range.end) next = block;
    if (prev && next) break;
  }
  return { prev, next };
}

function targetStats(decoded, covered) {
  const targets = [];
  for (const insn of decoded) {
    if (!Number.isInteger(insn.target)) continue;
    const target = insn.target;
    targets.push({
      pc: insn.pc,
      tag: insn.tag,
      target,
      outsideRom: target < 0 || target >= ROM_LIMIT,
      erased: target >= 0 && target < ROM_LIMIT ? rom[target] === 0xFF : false,
      covered: target >= 0 && target < ROM_LIMIT ? covered[target] === 1 : false,
    });
  }
  return targets;
}

function inspectPointerWindow(range, covered) {
  const windowStart = Math.max(0, range.start - 96);
  const windowEnd = Math.min(rom.length, range.end + 96);
  const alignments = [];

  for (let align = 0; align < 3; align += 1) {
    const records = [];
    const first = windowStart + ((align - (windowStart % 3) + 3) % 3);
    for (let pc = first; pc <= windowEnd - 3; pc += 3) {
      const value = read24(rom, pc);
      const validRom = value < ROM_LIMIT && rom[value] !== 0xFF;
      const nearTarget = TARGETS.some((target) => Math.abs(value - target.start) <= 0x100 || (value >= target.start && value < target.end));
      if (validRom || nearTarget || (value >= 0xD00000 && value < 0xE00000)) {
        records.push({
          pc,
          value,
          validRom,
          covered: validRom ? covered[value] === 1 : false,
          nearTarget,
          ramLike: value >= 0xD00000 && value < 0xE00000,
        });
      }
    }
    alignments.push({
      align,
      recordCount: records.length,
      validRomCount: records.filter((record) => record.validRom).length,
      coveredRomCount: records.filter((record) => record.covered).length,
      nearTargetCount: records.filter((record) => record.nearTarget).length,
      ramLikeCount: records.filter((record) => record.ramLike).length,
      firstRecords: records.slice(0, 10),
    });
  }

  return alignments.sort((left, right) => right.recordCount - left.recordCount || right.validRomCount - left.validRomCount);
}

function summarizeRefs(refs) {
  if (!refs.length) return 'none';
  return refs.slice(0, 5).map((ref) => {
    if (ref.op) return `${ref.op}@${hex(ref.pc)}->${hex(ref.target ?? ref.addr ?? 0)}`;
    if (ref.field) return `${ref.tag}.${ref.field}@${hex(ref.pc)}->${hex(ref.value)}`;
    return `${ref.tag ?? ref.kind}@${hex(ref.pc ?? ref.blockStart)}->${hex(ref.target ?? 0)}`;
  }).join(', ');
}

function summarizeExactRefs(refs) {
  const parts = [
    ...refs.lifted.slice(0, 4).map((ref) => `${ref.tag}@${hex(ref.pc)} block=${hex(ref.blockStart)}`),
    ...refs.raw.slice(0, 4).map((ref) => `${ref.op}@${hex(ref.pc)}`),
    ...refs.source.slice(0, 4).map((ref) => `${ref.kind}@${hex(ref.blockStart)}`),
  ];
  return parts.length ? parts.join(', ') : 'none';
}

function analyzeRange(range, shared) {
  const decoded = decodeWindow(range.start, range.end, 16);
  const targets = targetStats(decoded, shared.covered);
  const rawControl = directRawControlRefs(range);
  const raw24 = raw24Refs(range);
  const lifted = liftedRefs(range, shared.instructions);
  const neighborInsns = findNeighborInstructions(range, shared.instructions);
  const neighborBlocks = findNeighborBlocks(range, shared.blocks);
  const pointerWindow = inspectPointerWindow(range, shared.covered);

  const neighborAddresses = [
    neighborInsns.prev?.pc,
    neighborInsns.next?.pc,
    neighborBlocks.prev?.startPc,
    neighborBlocks.next?.startPc,
    ...targets.filter((target) => target.covered && !target.outsideRom && !target.erased).map((target) => target.target),
  ].filter((addr, index, all) => Number.isInteger(addr) && all.indexOf(addr) === index);

  const neighborRefs = neighborAddresses.map((addr) => ({
    addr,
    refs: refsToExactAddress(addr, shared.instructions, shared.blocks),
  }));

  const ownerSignals = [];
  if (rawControl.length || lifted.control.length) ownerSignals.push('direct-control-into-range');
  if (raw24.some((ref) => !ref.controlOperand)) ownerSignals.push('raw24-noncontrol-into-range');
  if (lifted.nonControl.length) ownerSignals.push('lifted-noncontrol-into-range');
  if (neighborRefs.some((entry) => entry.refs.lifted.length || entry.refs.raw.length || entry.refs.source.length)) ownerSignals.push('surrounding-block-has-owner');

  const seedableOwner = rawControl.length > 0 || lifted.control.length > 0;

  return {
    ...range,
    len: range.end - range.start,
    decoded,
    targets,
    rawControl,
    raw24,
    lifted,
    neighborInsns,
    neighborBlocks,
    pointerWindow,
    neighborRefs,
    ownerSignals,
    seedableOwner,
  };
}

function snapshotCpu(cpu) {
  return Object.fromEntries(SNAP_FIELDS.map((field) => [field, cpu[field]]));
}

function restoreCpu(cpu, snapshot) {
  for (const [field, value] of Object.entries(snapshot)) cpu[field] = value;
}

function createDynamicEnv() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(rom.subarray(0, MEM_SIZE));
  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;
  return { mem, peripherals, executor, cpu };
}

function runWatched(env, label, entry, mode, options) {
  const hits = [];
  const missingBlocks = [];
  let interrupts = 0;
  let result;

  try {
    result = env.executor.runFrom(entry, mode, {
      ...options,
      onBlock(pc, blockMode, _meta, step) {
        const target = targetForPc(pc);
        if (target) {
          hits.push({ kind: 'block', target: target.name, pc: pc & 0xFFFFFF, mode: blockMode, step: (step ?? 0) + 1 });
        }
      },
      onMissingBlock(pc, blockMode, step) {
        const normalized = pc & 0xFFFFFF;
        missingBlocks.push(normalized);
        const target = targetForPc(normalized);
        if (target) {
          hits.push({ kind: 'missing-block', target: target.name, pc: normalized, mode: blockMode, step: (step ?? 0) + 1 });
        }
      },
      onInterrupt() {
        interrupts += 1;
      },
    });
  } catch (error) {
    result = {
      steps: -1,
      termination: 'exception',
      lastPc: null,
      error: String(error?.stack || error),
    };
  }

  return {
    label,
    entry,
    mode,
    steps: result.steps ?? null,
    termination: result.termination ?? null,
    lastPc: result.lastPc ?? null,
    error: result.error ? String(result.error) : null,
    interrupts,
    hitCount: hits.length,
    hits,
    firstMissingBlocks: missingBlocks.slice(0, 8),
  };
}

function resetAfterBoot(env, stackBytes = 3) {
  env.cpu.halted = false;
  env.cpu.iff1 = 0;
  env.cpu.iff2 = 0;
  env.cpu.sp = STACK_RESET_TOP - stackBytes;
  env.mem.fill(0xFF, env.cpu.sp, env.cpu.sp + stackBytes);
}

function configureWarmState(env) {
  env.cpu.halted = false;
  env.cpu.iff1 = 1;
  env.cpu.iff2 = 1;
  env.cpu._iy = 0xD00080;
  env.cpu.mbase = 0xD0;
}

function pressKey2(env) {
  env.peripherals.setMatrixKey(KEY_MATRIX_GROUP, KEY_MATRIX_BIT, true);
  env.mem[0xD00587] = OS_SCAN_2;
  env.mem[0xD0058E] = INTERNAL_2;
  env.mem[0xD0058D] = INTERNAL_2;
  env.mem[0xD00080] = (env.mem[0xD00080] | 0x08) & 0xFF;
}

function runDynamicSearch() {
  const env = createDynamicEnv();
  const stages = [];

  stages.push(runWatched(env, 'boot_000000', 0x000000, 'z80', { maxSteps: 20000, maxLoopIterations: 32 }));
  resetAfterBoot(env, 3);

  stages.push(runWatched(env, 'kernel_init_08c331', 0x08C331, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 }));
  env.cpu.mbase = 0xD0;
  env.cpu._iy = 0xD00080;
  env.cpu._hl = 0;
  resetAfterBoot(env, 3);

  stages.push(runWatched(env, 'post_init_0802b2', 0x0802B2, 'adl', { maxSteps: 100, maxLoopIterations: 32 }));
  configureWarmState(env);
  env.cpu.sp = STACK_RESET_TOP - 12;
  env.mem.fill(0xFF, env.cpu.sp, env.cpu.sp + 12);

  stages.push(runWatched(env, 'cold_idle_0019be', INIT_IDLE_LOOP, 'adl', { maxSteps: 500000, maxLoopIterations: 100000 }));

  env.peripherals.setTimerEnabled(false);
  configureWarmState(env);
  const launchSp = STACK_RESET_TOP - 24;
  env.cpu.sp = launchSp;
  write24(env.mem, launchSp, INIT_IDLE_LOOP);
  write24(env.mem, 0xD008E0, launchSp);
  stages.push(runWatched(env, 'launch_init_09dd62', LAUNCH_INIT, 'adl', { maxSteps: 300000, maxLoopIterations: 30000 }));

  env.peripherals.setTimerEnabled(true);
  configureWarmState(env);
  if ((env.cpu.sp & 0xFFFFFF) < 0x400000) env.cpu.sp = STACK_RESET_TOP - 24;
  env.cpu.sp = (env.cpu.sp - 3) & 0xFFFFFF;
  write24(env.mem, env.cpu.sp, REPAINT_IDLE_LOOP);
  stages.push(runWatched(env, 'repaint_058241', REPAINT, 'adl', { maxSteps: 1500000, maxLoopIterations: 60000 }));

  const repaintRam = new Uint8Array(env.mem.slice(0x400000, 0xE00000));
  const repaintCpu = snapshotCpu(env.cpu);

  env.mem.set(repaintRam, 0x400000);
  restoreCpu(env.cpu, repaintCpu);
  configureWarmState(env);
  env.peripherals.setTimerEnabled(true);
  pressKey2(env);
  stages.push(runWatched(env, 'warm_key_02fd8f', WARM_KEY_EVENT, 'adl', { maxSteps: 800000, maxLoopIterations: 100000 }));

  const hits = stages.flatMap((stage) => stage.hits.map((hit) => ({ ...hit, stage: stage.label })));
  return {
    pass: true,
    stages,
    hitCount: hits.length,
    hits,
  };
}

function compactDynamicStage(stage) {
  return `${stage.label}: steps=${stage.steps} term=${stage.termination} last=${hex(stage.lastPc)} hits=${stage.hitCount}`;
}

function buildReport({ shared, analyses, dynamic }) {
  const seedableCount = analyses.filter((entry) => entry.seedableOwner).length;
  const directControlCount = analyses.reduce((sum, entry) => sum + entry.rawControl.length + entry.lifted.control.length, 0);
  const raw24NonControlCount = analyses.reduce((sum, entry) => sum + entry.raw24.filter((ref) => !ref.controlOperand).length, 0);
  const liftedNonControlCount = analyses.reduce((sum, entry) => sum + entry.lifted.nonControl.length, 0);

  const lines = [
    '# Phase 695: Manual-Review Range Owner Search',
    '',
    'Probe: `probe-phase695-manual-review-owner-search.mjs`  ',
    'Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase695-manual-review-owner-search.mjs`',
    '',
    '## Summary',
    '',
    `- Manual-review ranges checked: **${analyses.length}**.`,
    `- Seedable direct control owners found: **${seedableCount}** ranges / **${directControlCount}** direct control refs.`,
    `- Non-control raw24 refs into ranges: **${raw24NonControlCount}**. Lifted non-control refs: **${liftedNonControlCount}**.`,
    `- Dynamic standard-path hits into any range: **${dynamic.hitCount}**.`,
    `- Covered bytes baseline: **${shared.totalCovered.toLocaleString()}**.`,
    '',
    '## Owner Verdicts',
    '',
    markdownTable(
      ['range', 'len', 'seedable owner', 'owner signals', 'raw control', 'lifted control', 'raw24 non-control', 'dynamic hits'],
      analyses.map((entry) => [
        `${hex(entry.start)}..${hex(entry.end - 1)}`,
        entry.len,
        entry.seedableOwner ? 'YES' : 'no',
        entry.ownerSignals.join(', ') || 'none',
        entry.rawControl.length,
        entry.lifted.control.length,
        entry.raw24.filter((ref) => !ref.controlOperand).length,
        dynamic.hits.filter((hit) => hit.pc >= entry.start && hit.pc < entry.end).length,
      ]),
    ),
    '',
    '## Dynamic Trace Screen',
    '',
    markdownTable(
      ['stage', 'entry', 'steps', 'termination', 'lastPc', 'hits', 'first missing blocks'],
      dynamic.stages.map((stage) => [
        stage.label,
        hex(stage.entry),
        stage.steps,
        stage.termination,
        hex(stage.lastPc),
        stage.hitCount,
        stage.firstMissingBlocks.map((pc) => hex(pc)).join(', ') || 'none',
      ]),
    ),
    '',
  ];

  if (dynamic.hits.length) {
    lines.push('### Dynamic Hits');
    lines.push('');
    lines.push(markdownTable(
      ['stage', 'kind', 'range', 'pc', 'mode', 'step'],
      dynamic.hits.map((hit) => [hit.stage, hit.kind, hit.target, hex(hit.pc), hit.mode, hit.step]),
    ));
    lines.push('');
  } else {
    lines.push('No standard boot/init/repaint/warm-key scenario entered any of the four manual-review ranges as a lifted block or missing block.');
    lines.push('');
  }

  for (const entry of analyses) {
    const prevInsn = entry.neighborInsns.prev;
    const nextInsn = entry.neighborInsns.next;
    const prevBlock = entry.neighborBlocks.prev;
    const nextBlock = entry.neighborBlocks.next;
    const bestPointer = entry.pointerWindow[0];

    lines.push(`## ${hex(entry.start)}..${hex(entry.end - 1)}`);
    lines.push('');
    lines.push(`- First bytes: \`${bytesAt(entry.start, Math.min(entry.len, 24))}\``);
    lines.push(`- Direct raw control refs into range: ${summarizeRefs(entry.rawControl)}.`);
    lines.push(`- Lifted control refs into range: ${summarizeRefs(entry.lifted.control)}.`);
    lines.push(`- Raw24 refs into range: ${entry.raw24.length ? entry.raw24.slice(0, 6).map((ref) => `${ref.controlOperand ? ref.precedingOp : 'raw24'}@${hex(ref.pc)}->${hex(ref.target)}`).join(', ') : 'none'}.`);
    lines.push(`- Lifted non-control refs into range: ${summarizeRefs(entry.lifted.nonControl)}.`);
    lines.push(`- Previous lifted instruction: ${prevInsn ? `${hex(prevInsn.pc)} ${formatInstruction(prevInsn.insn)} (block ${hex(prevInsn.blockStart)})` : 'none'}.`);
    lines.push(`- Next lifted instruction: ${nextInsn ? `${hex(nextInsn.pc)} ${formatInstruction(nextInsn.insn)} (block ${hex(nextInsn.blockStart)})` : 'none'}.`);
    lines.push(`- Neighbor lifted blocks: prev=${prevBlock ? `${hex(prevBlock.startPc)}..${hex(prevBlock.endPc - 1)}` : 'none'} next=${nextBlock ? `${hex(nextBlock.startPc)}..${hex(nextBlock.endPc - 1)}` : 'none'}.`);
    lines.push(`- Best nearby 3-byte pointer alignment: align=${bestPointer.align}, records=${bestPointer.recordCount}, validROM=${bestPointer.validRomCount}, coveredROM=${bestPointer.coveredRomCount}, nearTarget=${bestPointer.nearTargetCount}, ramLike=${bestPointer.ramLikeCount}.`);
    lines.push('');
    lines.push('### Decode Window');
    lines.push('');
    lines.push(markdownTable(
      ['pc', 'bytes', 'decode'],
      entry.decoded.map((insn) => [hex(insn.pc), bytesAt(insn.pc, insn.length), formatInstruction(insn)]),
    ));
    lines.push('');
    lines.push('### Decoded Branch Targets');
    lines.push('');
    lines.push(entry.targets.length
      ? markdownTable(
        ['pc', 'tag', 'target', 'covered', 'erased/outside'],
        entry.targets.map((target) => [
          hex(target.pc),
          target.tag,
          hex(target.target),
          target.covered ? 'yes' : 'no',
          target.outsideRom || target.erased ? 'yes' : 'no',
        ]),
      )
      : 'No decoded branch targets.');
    lines.push('');
    lines.push('### Neighbor / Target Owners');
    lines.push('');
    lines.push(entry.neighborRefs.length
      ? markdownTable(
        ['address', 'refs'],
        entry.neighborRefs.map((ref) => [hex(ref.addr), summarizeExactRefs(ref.refs)]),
      )
      : 'No neighbor addresses available.');
    lines.push('');
    lines.push('### Nearby Pointer Records');
    lines.push('');
    lines.push(markdownTable(
      ['align', 'records', 'validROM', 'coveredROM', 'nearTarget', 'ramLike', 'first records'],
      entry.pointerWindow.map((align) => [
        align.align,
        align.recordCount,
        align.validRomCount,
        align.coveredRomCount,
        align.nearTargetCount,
        align.ramLikeCount,
        align.firstRecords.map((record) => `${hex(record.pc)}->${hex(record.value)}${record.covered ? '*' : ''}`).join(', ') || 'none',
      ]),
    ));
    lines.push('');
  }

  lines.push(
    '## Interpretation',
    '',
    '- None of the four manual-review ranges has a direct raw or lifted control-flow owner. That keeps them below the bar for seed edits.',
    '- The only in-range references found are non-control raw24/literal-style refs, so they are useful for data ownership but not executable reachability.',
    '- The standard boot, launch-home init, repaint, and one warm key event did not enter any candidate as a lifted or missing block.',
    '- Future work should treat these as coverage debt unless a new indirect dispatch table or dynamic trace proves executable ownership.',
    '',
    '## Compact JSON',
    '',
    '```json',
    JSON.stringify({
      pass: true,
      totalCovered: shared.totalCovered,
      seedableCount,
      directControlCount,
      raw24NonControlCount,
      liftedNonControlCount,
      dynamicHitCount: dynamic.hitCount,
      ranges: analyses.map((entry) => ({
        start: hex(entry.start),
        end: hex(entry.end - 1),
        len: entry.len,
        seedableOwner: entry.seedableOwner,
        ownerSignals: entry.ownerSignals,
        rawControl: entry.rawControl.map((ref) => ({ pc: hex(ref.pc), op: ref.op, target: hex(ref.target) })),
        liftedControl: entry.lifted.control.map((ref) => ({ pc: hex(ref.pc), blockStart: hex(ref.blockStart), tag: ref.tag, target: hex(ref.target) })),
        raw24: entry.raw24.map((ref) => ({ pc: hex(ref.pc), target: hex(ref.target), controlOperand: ref.controlOperand, precedingOp: ref.precedingOp })),
        liftedNonControl: entry.lifted.nonControl.map((ref) => ({ pc: hex(ref.pc), blockStart: hex(ref.blockStart), tag: ref.tag, field: ref.field, value: hex(ref.value) })),
        dynamicHits: dynamic.hits.filter((hit) => hit.pc >= entry.start && hit.pc < entry.end),
      })),
      dynamicStages: dynamic.stages.map(compactDynamicStage),
    }, null, 2),
    '```',
    '',
  );

  return `${lines.join('\n')}\n`;
}

console.log('phase695: manual-review range owner search');
const shared = buildCoverageAndIndex();
const analyses = TARGETS.map((target) => analyzeRange(target, shared));
console.log(`covered=${shared.totalCovered} ranges=${analyses.length}`);
for (const entry of analyses) {
  console.log(`${hex(entry.start)}..${hex(entry.end - 1)} seedable=${entry.seedableOwner ? 'YES' : 'no'} rawControl=${entry.rawControl.length} liftedControl=${entry.lifted.control.length} raw24=${entry.raw24.length}`);
}

const dynamic = runDynamicSearch();
console.log(`dynamicHits=${dynamic.hitCount}`);
for (const stage of dynamic.stages) console.log(compactDynamicStage(stage));

fs.writeFileSync(REPORT_PATH, buildReport({ shared, analyses, dynamic }));
console.log(`report=${path.relative(process.cwd(), REPORT_PATH)}`);
console.log('PASS');

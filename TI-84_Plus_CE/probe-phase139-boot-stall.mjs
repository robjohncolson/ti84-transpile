#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');
const REPORT_PATH = path.join(__dirname, 'phase139-report.md');

const BOOT_ENTRY = 0x000000;
const BOOT_MODE = 'z80';
const BOOT_MAX_STEPS = 20000;
const BOOT_MAX_LOOP_ITERATIONS = 32;

const OS_INIT_ENTRY = 0x08c331;
const OS_INIT_MODE = 'adl';
const OS_INIT_MAX_STEPS = 1000;
const OS_INIT_MAX_LOOP_ITERATIONS = 10000;

const STACK_RESET_TOP = 0xd1a87e;
const STACK_SEED_BYTES = 3;
const STACK_DUMP_LEN = 12;
const STACK_WATCH_START = STACK_RESET_TOP - 0x60;
const STACK_WATCH_END = STACK_RESET_TOP + 0x10;

const TRACE_TAIL_COUNT = 50;
const PRE_CRASH_COUNT = 20;

const RELATED_CALLBACK_SLOTS = [
  0xd007ca,
  0xd007cd,
  0xd007d0,
  0xd007d6,
  0xd007eb,
];

const SLOT_WATCH_START = 0xd007c0;
const SLOT_WATCH_END = 0xd00800;

const TERMINATOR_TAGS = new Set([
  'call',
  'call-conditional',
  'jp',
  'jp-conditional',
  'jp-indirect',
  'jr',
  'jr-conditional',
  'ret',
  'ret-conditional',
  'halt',
  'sleep',
]);

const mod = await import(pathToFileURL(TRANSPILED_PATH).href);
const BLOCKS = mod.PRELIFTED_BLOCKS;
const ROM_GENERATED_AT = mod.TRANSPILATION_META?.generatedAt ?? 'unknown';

const romBytes = fs.readFileSync(ROM_PATH);

function hex(value, width = 6) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'n/a';
  }

  return `0x${(Number(value) >>> 0).toString(16).padStart(width, '0')}`;
}

function hexByte(value) {
  return hex(value, 2);
}

function bytesToHex(bytes) {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join(' ');
}

function read24(mem, addr) {
  const start = addr & 0xffffff;
  return mem[start] | (mem[start + 1] << 8) | (mem[start + 2] << 16);
}

function read24FromBytes(bytes, offset = 0) {
  if (offset + 2 >= bytes.length) {
    return null;
  }

  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function readBytes(mem, addr, length) {
  const start = addr & 0xffffff;
  return Array.from(mem.slice(start, start + length));
}

function setReg8(state, reg, value) {
  const next = value & 0xff;

  switch (reg) {
    case 'a':
      state.a = next;
      return;
    case 'b':
      state.bc = (state.bc & 0xff00ff) | (next << 8);
      return;
    case 'c':
      state.bc = (state.bc & 0xffff00) | next;
      return;
    case 'd':
      state.de = (state.de & 0xff00ff) | (next << 8);
      return;
    case 'e':
      state.de = (state.de & 0xffff00) | next;
      return;
    case 'h':
      state.hl = (state.hl & 0xff00ff) | (next << 8);
      return;
    case 'l':
      state.hl = (state.hl & 0xffff00) | next;
      return;
    default:
      return;
  }
}

function snapshotRegisters(cpu, pc) {
  return {
    a: cpu.a & 0xff,
    f: cpu.f & 0xff,
    bc: cpu.bc & 0xffffff,
    de: cpu.de & 0xffffff,
    hl: cpu.hl & 0xffffff,
    sp: cpu.sp & 0xffffff,
    ix: cpu.ix & 0xffffff,
    iy: cpu.iy & 0xffffff,
    pc: pc & 0xffffff,
  };
}

function formatRegisters(regs) {
  return [
    `A=${hexByte(regs.a)}`,
    `F=${hexByte(regs.f)}`,
    `BC=${hex(regs.bc)}`,
    `DE=${hex(regs.de)}`,
    `HL=${hex(regs.hl)}`,
    `SP=${hex(regs.sp)}`,
    `IX=${hex(regs.ix)}`,
    `IY=${hex(regs.iy)}`,
    `PC=${hex(regs.pc)}`,
  ].join(' ');
}

function formatInstruction(inst) {
  if (!inst) {
    return 'decode failed';
  }

  switch (inst.tag) {
    case 'push':
      return `push ${inst.pair}`;
    case 'pop':
      return `pop ${inst.pair}`;
    case 'ld-pair-imm':
      return `ld ${inst.pair}, ${hex(inst.value)}`;
    case 'ld-pair-mem':
      if (inst.direction === 'to-mem') {
        return `ld (${hex(inst.addr)}), ${inst.pair}`;
      }
      return `ld ${inst.pair}, (${hex(inst.addr)})`;
    case 'ld-reg-imm':
      return `ld ${inst.dest}, ${hexByte(inst.value)}`;
    case 'ld-reg-reg':
      return `ld ${inst.dest}, ${inst.src}`;
    case 'ld-reg-mem':
      return `ld ${inst.dest}, (${hex(inst.addr)})`;
    case 'ld-mem-reg':
      return `ld (${hex(inst.addr)}), ${inst.src}`;
    case 'ld-ind-reg':
      return `ld (${inst.dest}), ${inst.src}`;
    case 'alu-imm':
      return `${inst.op} ${hexByte(inst.value)}`;
    case 'alu-reg':
      return `${inst.op} ${inst.src}`;
    case 'call':
      return `call ${hex(inst.target)}`;
    case 'call-conditional':
      return `call ${inst.condition}, ${hex(inst.target)}`;
    case 'jp':
      return `jp ${hex(inst.target)}`;
    case 'jp-conditional':
      return `jp ${inst.condition}, ${hex(inst.target)}`;
    case 'jp-indirect':
      return `jp (${inst.indirectRegister})`;
    case 'jr':
      return `jr ${hex(inst.target)}`;
    case 'jr-conditional':
      return `jr ${inst.condition}, ${hex(inst.target)}`;
    case 'ret':
      return 'ret';
    case 'ret-conditional':
      return `ret ${inst.condition}`;
    case 'inc-pair':
      return `inc ${inst.pair}`;
    case 'dec-pair':
      return `dec ${inst.pair}`;
    case 'ldir':
      return 'ldir';
    case 'indexed-cb-bit': {
      const sign = inst.displacement >= 0 ? '+' : '';
      return `bit ${inst.bit}, (${inst.indexRegister}${sign}${inst.displacement})`;
    }
    case 'indexed-cb-res': {
      const sign = inst.displacement >= 0 ? '+' : '';
      return `res ${inst.bit}, (${inst.indexRegister}${sign}${inst.displacement})`;
    }
    case 'indexed-cb-set': {
      const sign = inst.displacement >= 0 ? '+' : '';
      return `set ${inst.bit}, (${inst.indexRegister}${sign}${inst.displacement})`;
    }
    default:
      return inst.tag;
  }
}

function safeDecode(pc) {
  try {
    return decodeInstruction(romBytes, pc, 'adl');
  } catch {
    return null;
  }
}

function decodeLinearBlock(startPc, maxInstructions = 16) {
  const rows = [];
  let pc = startPc & 0xffffff;

  for (let index = 0; index < maxInstructions; index += 1) {
    const inst = safeDecode(pc);
    if (!inst || !Number.isFinite(inst.length) || inst.length <= 0) {
      rows.push({
        pc,
        bytes: bytesToHex(romBytes.slice(pc, pc + 1)),
        inst: null,
        text: 'decode failed',
      });
      break;
    }

    rows.push({
      pc: inst.pc,
      bytes: bytesToHex(romBytes.slice(inst.pc, inst.pc + inst.length)),
      inst,
      text: formatInstruction(inst),
    });

    if (TERMINATOR_TAGS.has(inst.tag)) {
      break;
    }

    pc = inst.nextPc;
  }

  return rows;
}

function countTrailingPopBytes(blockRows, mode) {
  let bytes = 0;
  const slotSize = mode === 'adl' ? 3 : 2;

  for (let index = blockRows.length - 2; index >= 0; index -= 1) {
    const inst = blockRows[index].inst;
    if (!inst || inst.tag !== 'pop') {
      break;
    }
    bytes += slotSize;
  }

  return bytes;
}

function previewCopySetup(entryRegs, blockRows) {
  const state = {
    a: entryRegs.a & 0xff,
    bc: entryRegs.bc & 0xffffff,
    de: entryRegs.de & 0xffffff,
    hl: entryRegs.hl & 0xffffff,
  };

  for (const row of blockRows) {
    const inst = row.inst;
    if (!inst) {
      return null;
    }

    if (inst.tag === 'ldir') {
      return {
        sourceStart: state.hl & 0xffffff,
        destStart: state.de & 0xffffff,
        count: state.bc & 0xffffff,
      };
    }

    if (inst.tag === 'ld-reg-imm') {
      setReg8(state, inst.dest, inst.value);
      continue;
    }

    if (inst.tag === 'inc-pair' && typeof state[inst.pair] === 'number') {
      state[inst.pair] = (state[inst.pair] + 1) & 0xffffff;
      continue;
    }

    if (inst.tag === 'dec-pair' && typeof state[inst.pair] === 'number') {
      state[inst.pair] = (state[inst.pair] - 1) & 0xffffff;
      continue;
    }
  }

  return null;
}

function rangeContainsWrapped(start, count, addr) {
  if (!Number.isFinite(start) || !Number.isFinite(count) || count <= 0) {
    return false;
  }

  const maskedStart = start & 0xffffff;
  const maskedAddr = addr & 0xffffff;
  const maskedEnd = (maskedStart + count - 1) & 0xffffff;

  if (maskedStart <= maskedEnd) {
    return maskedAddr >= maskedStart && maskedAddr <= maskedEnd;
  }

  return maskedAddr >= maskedStart || maskedAddr <= maskedEnd;
}

function createMachine() {
  const mem = new Uint8Array(0x1000000);
  mem.set(romBytes);

  const peripherals = createPeripheralBus({
    pllDelay: 2,
    timerInterrupt: false,
  });

  const executor = createExecutor(BLOCKS, mem, { peripherals });

  return {
    mem,
    peripherals,
    executor,
    cpu: executor.cpu,
  };
}

function resetForOsInit(machine) {
  const { cpu, mem } = machine;

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - STACK_SEED_BYTES;
  mem.fill(0xff, cpu.sp, cpu.sp + STACK_SEED_BYTES);
}

function installWriteTracker(cpu) {
  const writes = [];
  const state = {
    currentPc: 0,
    currentStep: 0,
  };

  const originalWrite8 = cpu.write8.bind(cpu);
  const originalWrite16 = cpu.write16.bind(cpu);
  const originalWrite24 = cpu.write24.bind(cpu);

  function classifyRegion(addr) {
    const masked = addr & 0xffffff;
    if (masked >= STACK_WATCH_START && masked < STACK_WATCH_END) {
      return 'stack';
    }
    if (masked >= SLOT_WATCH_START && masked < SLOT_WATCH_END) {
      return 'callback';
    }
    return null;
  }

  function record(addr, size, value, via) {
    const start = addr & 0xffffff;

    for (let index = 0; index < size; index += 1) {
      const byteAddr = (start + index) & 0xffffff;
      const region = classifyRegion(byteAddr);
      if (!region) {
        continue;
      }

      writes.push({
        step: state.currentStep,
        pc: state.currentPc,
        addr: byteAddr,
        value: (value >> (index * 8)) & 0xff,
        via,
        region,
      });
    }
  }

  cpu.write8 = (addr, value) => {
    record(addr, 1, value & 0xff, 'write8');
    return originalWrite8(addr, value);
  };

  cpu.write16 = (addr, value) => {
    record(addr, 2, value & 0xffff, 'write16');
    return originalWrite16(addr, value);
  };

  cpu.write24 = (addr, value) => {
    record(addr, 3, value & 0xffffff, 'write24');
    return originalWrite24(addr, value);
  };

  return {
    writes,
    onBlock(pc, steps) {
      state.currentPc = pc & 0xffffff;
      state.currentStep = steps + 1;
    },
    uninstall() {
      cpu.write8 = originalWrite8;
      cpu.write16 = originalWrite16;
      cpu.write24 = originalWrite24;
    },
  };
}

function classifyLiteralRef(offset) {
  const prev1 = offset >= 1 ? romBytes[offset - 1] : null;
  const prev2 = offset >= 2 ? romBytes[offset - 2] : null;

  if (prev1 === 0x22) return 'ld (nn),hl WRITE';
  if (prev1 === 0x2a) return 'ld hl,(nn) READ';
  if (prev1 === 0x21) return 'ld hl,nn LITERAL';
  if (prev1 === 0x11) return 'ld de,nn LITERAL';
  if (prev1 === 0x01) return 'ld bc,nn LITERAL';
  if (prev1 === 0x32) return 'ld (nn),a WRITE';
  if (prev1 === 0x3a) return 'ld a,(nn) READ';
  if (prev2 === 0xed && prev1 === 0x43) return 'ld (nn),bc WRITE';
  if (prev2 === 0xed && prev1 === 0x53) return 'ld (nn),de WRITE';
  if (prev2 === 0xed && prev1 === 0x63) return 'ld (nn),hl WRITE';
  if (prev2 === 0xed && prev1 === 0x73) return 'ld (nn),sp WRITE';
  if (prev2 === 0xed && prev1 === 0x4b) return 'ld bc,(nn) READ';
  if (prev2 === 0xed && prev1 === 0x5b) return 'ld de,(nn) READ';
  if (prev2 === 0xed && prev1 === 0x6b) return 'ld hl,(nn) READ';
  return 'other';
}

function scanLiteralRefs(targetAddr) {
  const littleEndian = [
    targetAddr & 0xff,
    (targetAddr >> 8) & 0xff,
    (targetAddr >> 16) & 0xff,
  ];

  const hits = [];

  for (let offset = 0; offset <= romBytes.length - 3; offset += 1) {
    if (
      romBytes[offset] !== littleEndian[0] ||
      romBytes[offset + 1] !== littleEndian[1] ||
      romBytes[offset + 2] !== littleEndian[2]
    ) {
      continue;
    }

    const contextStart = Math.max(0, offset - 8);
    const contextEnd = Math.min(romBytes.length, offset + 12);

    hits.push({
      offset,
      classification: classifyLiteralRef(offset),
      context: bytesToHex(romBytes.slice(contextStart, contextEnd)),
    });
  }

  return hits;
}

function runProbe() {
  const machine = createMachine();
  const coldBoot = machine.executor.runFrom(BOOT_ENTRY, BOOT_MODE, {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: BOOT_MAX_LOOP_ITERATIONS,
  });

  resetForOsInit(machine);

  const tracker = installWriteTracker(machine.cpu);
  const trace = [];
  let firstMissing = null;

  const result = machine.executor.runFrom(OS_INIT_ENTRY, OS_INIT_MODE, {
    maxSteps: OS_INIT_MAX_STEPS,
    maxLoopIterations: OS_INIT_MAX_LOOP_ITERATIONS,
    onBlock(pc, mode, _meta, steps) {
      tracker.onBlock(pc, steps);

      const snapshot = {
        step: steps + 1,
        pc: pc & 0xffffff,
        mode,
        regs: snapshotRegisters(machine.cpu, pc),
        stackBytes: readBytes(machine.mem, machine.cpu.sp, STACK_DUMP_LEN),
      };

      trace.push(snapshot);
      console.log(`step=${String(snapshot.step).padStart(4, '0')} pc=${hex(snapshot.pc)} mode=${mode}`);
    },
    onMissingBlock(pc, mode, steps) {
      if (!firstMissing) {
        firstMissing = {
          pc: pc & 0xffffff,
          mode,
          step: steps,
        };
      }
    },
  });

  tracker.uninstall();

  return {
    coldBoot,
    result,
    trace,
    firstMissing,
    writes: tracker.writes,
    machine,
  };
}

function analyzeRetCrash(runData, blockRows, finalBlock) {
  const trailingPopBytes = countTrailingPopBytes(blockRows, finalBlock.mode);
  const returnSlot = (finalBlock.regs.sp + trailingPopBytes) & 0xffffff;
  const returnBefore = read24FromBytes(finalBlock.stackBytes, trailingPopBytes);
  const returnAfter = read24(runData.machine.mem, returnSlot);
  const stackWrites = runData.writes.filter(
    (write) => write.addr >= returnSlot - 3 && write.addr < returnSlot + 6,
  );
  const copySetup = previewCopySetup(finalBlock.regs, blockRows);

  return {
    type: 'ret',
    mechanism: 'ret',
    finalInstruction: blockRows.at(-1) ?? null,
    pointerAddress: returnSlot,
    pointerValue: returnAfter,
    pointerBefore: returnBefore,
    trailingPopBytes,
    stackBefore: finalBlock.stackBytes,
    stackAfter: readBytes(runData.machine.mem, finalBlock.regs.sp, STACK_DUMP_LEN),
    stackWrites,
    copySetup,
    stackClobberLikely:
      copySetup !== null && rangeContainsWrapped(copySetup.destStart, copySetup.count, returnSlot),
  };
}

function inferIndirectSource(blockRows, finalPc) {
  let sourceSlot = null;

  for (let index = 0; index < blockRows.length; index += 1) {
    const inst = blockRows[index].inst;
    if (!inst || inst.tag !== 'ld-pair-mem' || inst.pair !== 'hl' || inst.direction !== 'from-mem') {
      continue;
    }

    const next = blockRows[index + 1]?.inst;
    if (!next) {
      continue;
    }

    const isJumpToStub =
      (next.tag === 'call' || next.tag === 'call-conditional' || next.tag === 'jp' || next.tag === 'jp-conditional') &&
      next.target === finalPc;

    if (isJumpToStub) {
      sourceSlot = inst.addr;
    }
  }

  return sourceSlot;
}

function analyzeIndirectJump(runData, blockRows, finalBlock, controlInst) {
  const regName = controlInst.indirectRegister ?? 'hl';
  const pointerValue = finalBlock.regs[regName] ?? null;
  const sourceSlot = inferIndirectSource(blockRows, finalBlock.pc);

  return {
    type: 'jp-indirect',
    mechanism: `jp (${regName})`,
    finalInstruction: blockRows.at(-1) ?? null,
    registerName: regName,
    pointerAddress: sourceSlot,
    pointerValue,
  };
}

function analyzeCrash(runData) {
  const finalBlock = runData.trace.at(-1);
  const blockRows = decodeLinearBlock(finalBlock.pc);
  const controlInst = blockRows.at(-1)?.inst ?? null;

  let crash;
  if (controlInst?.tag === 'ret' || controlInst?.tag === 'ret-conditional') {
    crash = analyzeRetCrash(runData, blockRows, finalBlock);
  } else if (controlInst?.tag === 'jp-indirect') {
    crash = analyzeIndirectJump(runData, blockRows, finalBlock, controlInst);
  } else if (controlInst?.tag === 'jp' || controlInst?.tag === 'call') {
    crash = {
      type: 'literal-control',
      mechanism: formatInstruction(controlInst),
      finalInstruction: blockRows.at(-1) ?? null,
      pointerAddress: null,
      pointerValue: controlInst.target ?? null,
    };
  } else {
    crash = {
      type: 'unknown',
      mechanism: controlInst ? formatInstruction(controlInst) : 'unknown',
      finalInstruction: blockRows.at(-1) ?? null,
      pointerAddress: null,
      pointerValue: runData.result.lastPc ?? null,
    };
  }

  const pointerRefs =
    crash.pointerAddress !== null && crash.pointerAddress < romBytes.length
      ? scanLiteralRefs(crash.pointerAddress)
      : crash.pointerAddress !== null
        ? scanLiteralRefs(crash.pointerAddress)
        : [];

  const relatedSlots = RELATED_CALLBACK_SLOTS.map((addr) => ({
    addr,
    value: read24(runData.machine.mem, addr),
    refs: scanLiteralRefs(addr),
  }));

  return {
    finalBlock,
    blockRows,
    controlInst,
    crash,
    pointerRefs,
    relatedSlots,
  };
}

function renderBlockTrace(trace) {
  return trace.map((entry) => `step=${String(entry.step).padStart(4, '0')} pc=${hex(entry.pc)} mode=${entry.mode}`);
}

function renderBlockRows(rows) {
  return rows.map((row) => `${hex(row.pc)}  ${row.bytes.padEnd(17)}  ${row.text}`);
}

function renderLiteralRefLines(refs) {
  if (refs.length === 0) {
    return ['(none)'];
  }

  return refs.map((ref) => `${hex(ref.offset)} | ${ref.classification} | ${ref.context}`);
}

function buildRecommendation(runData, analysis) {
  const lines = [];

  if (analysis.crash.type === 'ret') {
    lines.push(
      `Immediate stop is a stack return through ${hex(analysis.crash.pointerAddress)}, not a fixed jp(hl) callback slot.`,
    );

    if (analysis.crash.stackClobberLikely && analysis.crash.copySetup) {
      lines.push(
        `${hex(analysis.finalBlock.pc)} overwrites the return frame during LDIR: dest=${hex(analysis.crash.copySetup.destStart)} count=${hex(analysis.crash.copySetup.count)} reaches the stack slot and changes ${hex(analysis.crash.pointerBefore)} -> ${hex(analysis.crash.pointerValue)}.`,
      );
      lines.push(
        'Seeding 0xD007EB alone is unlikely to extend this boot path. The stronger seed target is the copy setup before 0x00287D, especially the stale high BC byte or the stack placement that leaves the return frame inside the destination range.',
      );
    } else {
      lines.push(
        'Seeding the return slot itself is fragile because it is runtime stack memory, not a stable callback cell.',
      );
    }

    lines.push(
      'Related callback slots 0xD007CA/0xD007CD/0xD007D0/0xD007D6/0xD007EB still end as 0xFFFFFF, but they are side context here rather than the immediate 691-step failure edge.',
    );
    return lines;
  }

  if (analysis.crash.type === 'jp-indirect') {
    lines.push(
      `Immediate stop is ${analysis.crash.mechanism} with ${analysis.crash.registerName.toUpperCase()}=${hex(analysis.crash.pointerValue)}.`,
    );

    if (analysis.crash.pointerAddress !== null) {
      lines.push(
        `The bad pointer comes from ${hex(analysis.crash.pointerAddress)}. If that slot is never written on the reachable boot path, pre-seeding it is a plausible way to extend execution.`,
      );
    } else {
      lines.push(
        'No fixed source slot was recovered from the visible block context, so the next move would be a deeper pointer-write trace around the predecessor block.',
      );
    }

    return lines;
  }

  lines.push(
    'The probe found a control-transfer miss, but it was not one of the expected jp(hl)/ret patterns. Re-run with a deeper decoder window if you need stronger source attribution.',
  );
  return lines;
}

function buildReport(runData, analysis) {
  const lines = [];
  const tail50 = runData.trace.slice(-TRACE_TAIL_COUNT);
  const tail20 = runData.trace.slice(-PRE_CRASH_COUNT);
  const finalRegs = analysis.finalBlock.regs;
  const stackWatchWrites = runData.writes.filter((write) => write.region === 'stack');
  const callbackWrites = runData.writes.filter((write) => write.region === 'callback');

  lines.push('# Phase 139 - Boot Stall Root Cause at Step 691');
  lines.push('');
  lines.push('Generated by `probe-phase139-boot-stall.mjs`.');
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- ROM generatedAt: \`${ROM_GENERATED_AT}\``);
  lines.push(`- Cold boot: \`steps=${runData.coldBoot.steps} termination=${runData.coldBoot.termination} lastPc=${hex(runData.coldBoot.lastPc ?? 0)}\``);
  lines.push(`- OS init: \`steps=${runData.result.steps} termination=${runData.result.termination} lastPc=${hex(runData.result.lastPc ?? 0)} lastMode=${runData.result.lastMode ?? 'n/a'}\``);
  lines.push(`- Final executed block before \`${hex(runData.result.lastPc ?? 0)}\`: \`${hex(analysis.finalBlock.pc)}\``);
  lines.push(`- Crash mechanism: \`${analysis.crash.mechanism}\``);

  if (analysis.crash.pointerAddress !== null) {
    lines.push(`- RAM address supplying the bad pointer: \`${hex(analysis.crash.pointerAddress)}\``);
  }

  if (analysis.crash.pointerValue !== null && analysis.crash.pointerValue !== undefined) {
    lines.push(`- Pointer value at failure: \`${hex(analysis.crash.pointerValue)}\``);
  }

  lines.push('');
  lines.push('## Last 50 Blocks');
  lines.push('');
  lines.push('```text');
  lines.push(...renderBlockTrace(tail50));
  lines.push('```');
  lines.push('');
  lines.push('## Last 20 Blocks Before 0xFFFFFF');
  lines.push('');
  lines.push('```text');
  lines.push(...renderBlockTrace(tail20));
  lines.push(`target=${hex(runData.result.lastPc ?? 0)} (missing block)`);
  lines.push('```');
  lines.push('');
  lines.push('## Register State At Final Block Entry');
  lines.push('');
  lines.push(`- ${formatRegisters(finalRegs)}`);
  lines.push(`- Stack bytes at \`${hex(finalRegs.sp)}\`: \`${bytesToHex(analysis.finalBlock.stackBytes)}\``);
  lines.push('');
  lines.push('## Final Block Disassembly');
  lines.push('');
  lines.push('```text');
  lines.push(...renderBlockRows(analysis.blockRows));
  lines.push('```');
  lines.push('');

  if (analysis.crash.type === 'ret') {
    lines.push('## RET Analysis');
    lines.push('');
    lines.push(`- Trailing pop bytes before RET: \`${analysis.crash.trailingPopBytes}\``);
    lines.push(`- Return slot before executing \`${hex(analysis.finalBlock.pc)}\`: \`${hex(analysis.crash.pointerAddress)}\``);
    lines.push(`- Return value before block: \`${hex(analysis.crash.pointerBefore)}\``);
    lines.push(`- Return value after block: \`${hex(analysis.crash.pointerValue)}\``);

    if (analysis.crash.copySetup) {
      lines.push(`- LDIR setup inside the block: source=\`${hex(analysis.crash.copySetup.sourceStart)}\`, dest=\`${hex(analysis.crash.copySetup.destStart)}\`, count=\`${hex(analysis.crash.copySetup.count)}\``);
      lines.push(`- Destination range reaches the return slot: \`${analysis.crash.stackClobberLikely}\``);
    }

    lines.push('');
    lines.push('### Stack Before / After');
    lines.push('');
    lines.push(`- Before: \`${bytesToHex(analysis.crash.stackBefore)}\``);
    lines.push(`- After: \`${bytesToHex(analysis.crash.stackAfter)}\``);
    lines.push('');
    lines.push('### Writes Touching The Return Frame');
    lines.push('');

    if (analysis.crash.stackWrites.length === 0) {
      lines.push('(none)');
    } else {
      lines.push('| Step | PC | Addr | Value | Via |');
      lines.push('| --- | --- | --- | --- | --- |');
      for (const write of analysis.crash.stackWrites) {
        lines.push(`| ${write.step} | \`${hex(write.pc)}\` | \`${hex(write.addr)}\` | \`${hexByte(write.value)}\` | ${write.via} |`);
      }
    }

    lines.push('');
  }

  if (analysis.crash.type === 'jp-indirect') {
    lines.push('## Indirect Jump Analysis');
    lines.push('');
    lines.push(`- Register used by the terminal jump: \`${analysis.crash.registerName.toUpperCase()}\``);

    if (analysis.crash.pointerAddress !== null) {
      lines.push(`- Source slot recovered from visible block context: \`${hex(analysis.crash.pointerAddress)}\``);
    } else {
      lines.push('- No fixed source slot was recovered from the visible block context.');
    }

    lines.push('');
  }

  lines.push('## Watched Writes');
  lines.push('');
  lines.push(`- Stack-region writes captured: \`${stackWatchWrites.length}\``);
  lines.push(`- Callback-region writes captured: \`${callbackWrites.length}\``);
  lines.push('');

  if (callbackWrites.length > 0) {
    lines.push('### Callback-Region Writes');
    lines.push('');
    lines.push('| Step | PC | Addr | Value | Via |');
    lines.push('| --- | --- | --- | --- | --- |');
    for (const write of callbackWrites.slice(0, 40)) {
      lines.push(`| ${write.step} | \`${hex(write.pc)}\` | \`${hex(write.addr)}\` | \`${hexByte(write.value)}\` | ${write.via} |`);
    }
    if (callbackWrites.length > 40) {
      lines.push(`| ... | ... | ... | +${callbackWrites.length - 40} more | |`);
    }
    lines.push('');
  }

  lines.push('## Related Callback Slots After OS Init');
  lines.push('');
  lines.push('| Slot | Final Value | Raw ROM Refs |');
  lines.push('| --- | --- | --- |');
  for (const slot of analysis.relatedSlots) {
    lines.push(`| \`${hex(slot.addr)}\` | \`${hex(slot.value)}\` | ${slot.refs.length} |`);
  }
  lines.push('');

  lines.push('## ROM References For The Bad-Pointer Address');
  lines.push('');

  if (analysis.crash.pointerAddress === null) {
    lines.push('(not applicable)');
  } else {
    lines.push('```text');
    lines.push(...renderLiteralRefLines(analysis.pointerRefs));
    lines.push('```');
  }
  lines.push('');

  lines.push('## ROM References For Related Callback Slot 0xD007EB');
  lines.push('');
  lines.push('```text');
  const d007ebRefs = analysis.relatedSlots.find((slot) => slot.addr === 0xd007eb)?.refs ?? [];
  lines.push(...renderLiteralRefLines(d007ebRefs));
  lines.push('```');
  lines.push('');

  lines.push('## Recommendation');
  lines.push('');
  for (const line of buildRecommendation(runData, analysis)) {
    lines.push(`- ${line}`);
  }
  lines.push('');

  return `${lines.join('\n')}\n`;
}

function buildFailureReport(error) {
  return `# Phase 139 - Boot Stall Root Cause at Step 691\n\nGenerated by \`probe-phase139-boot-stall.mjs\`.\n\n## Failure\n\n\`\`\`text\n${error?.stack ?? String(error)}\n\`\`\`\n`;
}

function main() {
  const runData = runProbe();
  const analysis = analyzeCrash(runData);
  const report = buildReport(runData, analysis);

  fs.writeFileSync(REPORT_PATH, report, 'utf8');

  console.log('');
  console.log(`Report written to ${REPORT_PATH}`);
  console.log(`Crash mechanism: ${analysis.crash.mechanism}`);
  if (analysis.crash.pointerAddress !== null) {
    console.log(`Bad pointer address: ${hex(analysis.crash.pointerAddress)} value=${hex(analysis.crash.pointerValue)}`);
  }
}

try {
  main();
} catch (error) {
  fs.writeFileSync(REPORT_PATH, buildFailureReport(error), 'utf8');
  console.error(error?.stack ?? String(error));
  process.exitCode = 1;
}

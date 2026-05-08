#!/usr/bin/env node

/**
 * Phase 244: Trace 0x088772, the second sub-call from 0x051ADC.
 *
 * Goals:
 *   1. Hex dump ROM bytes at 0x088772-0x0887E0 (110 bytes).
 *   2. Static disassembly of 0x088772-0x0887E0.
 *   3. RUN 1: direct call with D007E0=0x00, D00824=0x00.
 *   4. RUN 2: direct call with D007E0=0x40, D00824=0x00.
 *   5. RUN 3: direct call with D007E0=0x5B, D00824=0x00.
 *   6. RUN 4: direct call with D007E0=0x00, D00824=0x4A.
 *   7. Report what 0x088772 does, what controls Z/NZ, and how it relates
 *      to mode/display state.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');

const romBytes = fs.readFileSync(ROM_PATH);
const romModule = await import(pathToFileURL(TRANSPILED_PATH).href);
const BLOCKS =
  romModule.PRELIFTED_BLOCKS ??
  romModule.default?.PRELIFTED_BLOCKS ??
  romModule.default ??
  romModule;

if (!BLOCKS || typeof BLOCKS !== 'object') {
  throw new Error('Unable to resolve PRELIFTED_BLOCKS from ROM.transpiled.js.');
}

const MEM_SIZE = 0x1000000;
const MEM_MASK = MEM_SIZE - 1;
const FLAG_Z = 0x40;

const BOOT_ENTRY = 0x000000;
const BOOT_MODE = 'z80';
const BOOT_MAX_STEPS = 20000;
const BOOT_MAX_LOOP_ITERATIONS = 32;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;

const BOOT_STACK_TOP = 0xD1A87E;
const RUN_STACK_TOP = 0xD1987E;
const RETURN_SENTINEL = 0x7FFFFE;
const MBASE = 0xD0;
const IX_BASE = 0xD1A860;
const IY_BASE = 0xD00080;

const TARGET_FUNC = 0x088772;
const DUMP_START = 0x088772;
const DUMP_END = 0x0887E0;
const STEP_BUDGET = 200;

const D007E0_ADDR = 0xD007E0;
const D00824_ADDR = 0xD00824;
const STATE_BYTE_ADDR = 0xD02661;
const STACK_SAVE_ADDR = RUN_STACK_TOP - 3;

const NEARBY_STATE_EVIDENCE = [
  {
    addr: 0x08876B,
    text: 'local neighbor clears D02661 with LD (HL),0x00',
  },
  {
    addr: 0x0AF1DC,
    text: 'stores A into D02661 and then SET 7,(HL)',
  },
  {
    addr: 0x0AF76E,
    text: 'RES 7,(HL), reads the low 7 bits, and uses them as a table index',
  },
  {
    addr: 0x0AF879,
    text: 'reads D02661 and compares it against 0x83',
  },
];

const SCENARIOS = [
  {
    label: 'RUN 1: home-screen seed',
    seeds: [
      { addr: D007E0_ADDR, value: 0x00, name: 'D007E0' },
      { addr: D00824_ADDR, value: 0x00, name: 'D00824' },
    ],
  },
  {
    label: 'RUN 2: D007E0=0x40',
    seeds: [
      { addr: D007E0_ADDR, value: 0x40, name: 'D007E0' },
      { addr: D00824_ADDR, value: 0x00, name: 'D00824' },
    ],
  },
  {
    label: 'RUN 3: D007E0=0x5B',
    seeds: [
      { addr: D007E0_ADDR, value: 0x5B, name: 'D007E0' },
      { addr: D00824_ADDR, value: 0x00, name: 'D00824' },
    ],
  },
  {
    label: 'RUN 4: D00824=0x4A',
    seeds: [
      { addr: D007E0_ADDR, value: 0x00, name: 'D007E0' },
      { addr: D00824_ADDR, value: 0x4A, name: 'D00824' },
    ],
  },
];

const CPU_SNAPSHOT_FIELDS = [
  'a', 'f', '_bc', '_de', '_hl', '_a2', '_f2', '_bc2', '_de2', '_hl2',
  'sp', '_ix', '_iy', 'i', 'im', 'iff1', 'iff2', 'madl', 'mbase', 'halted', 'cycles',
];

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function valueWidth(width) {
  if (width === 1) return 2;
  if (width === 2) return 4;
  return 6;
}

function bytesToHex(bytes) {
  return Array.from(bytes, (b) => hexByte(b)).join(' ');
}

function write24(mem, addr, value) {
  const base = addr & MEM_MASK;
  mem[base] = value & 0xFF;
  mem[(base + 1) & MEM_MASK] = (value >>> 8) & 0xFF;
  mem[(base + 2) & MEM_MASK] = (value >>> 16) & 0xFF;
}

function push24(cpu, mem, value) {
  cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
  write24(mem, cpu.sp, value & 0xFFFFFF);
}

function snapshotCpu(cpu) {
  return Object.fromEntries(CPU_SNAPSHOT_FIELDS.map((field) => [field, cpu[field]]));
}

function restoreCpu(cpu, snapshot) {
  for (const [field, value] of Object.entries(snapshot)) {
    cpu[field] = value;
  }
}

function snapshotRegs(cpu) {
  return {
    pc: cpu.pc & 0xFFFFFF,
    a: cpu.a & 0xFF,
    f: cpu.f & 0xFF,
    bc: cpu.bc & 0xFFFFFF,
    de: cpu.de & 0xFFFFFF,
    hl: cpu.hl & 0xFFFFFF,
    sp: cpu.sp & 0xFFFFFF,
    ix: cpu.ix & 0xFFFFFF,
    iy: cpu.iy & 0xFFFFFF,
  };
}

function formatRegs(regs) {
  return (
    `PC=${hex(regs.pc)} A=${hexByte(regs.a)} F=${hexByte(regs.f)} ` +
    `BC=${hex(regs.bc)} DE=${hex(regs.de)} HL=${hex(regs.hl)} ` +
    `SP=${hex(regs.sp)} IX=${hex(regs.ix)} IY=${hex(regs.iy)}`
  );
}

function formatBlock(pc, mode) {
  return `${hex(pc)}:${mode}`;
}

function blockKey(addr, mode) {
  return `${(addr >>> 0).toString(16).padStart(6, '0')}:${mode}`;
}

function resolveNextMode(executor, key, returnedPc, currentMode) {
  const meta = executor.blockMeta?.[key];
  if (!meta?.exits) return currentMode;
  for (const exit of meta.exits) {
    if (exit.target === returnedPc && exit.targetMode) return exit.targetMode;
  }
  return currentMode;
}

function installStepShim(cpu, executor) {
  if (!executor?.compiledBlocks) {
    throw new Error('Executor compiledBlocks are required for manual stepping.');
  }

  cpu.step = function step() {
    const mode = this.madl ? 'adl' : 'z80';
    const pc = this.pc & 0xFFFFFF;
    const key = blockKey(pc, mode);
    const fn = executor.compiledBlocks[key];
    if (typeof fn !== 'function') {
      throw new Error(`Missing block function for ${hex(pc)} (${key})`);
    }
    const result = fn(this);
    if (typeof result !== 'number') {
      throw new Error(`Unexpected step result from ${hex(pc)}: ${String(result)}`);
    }
    if (result >= 0) {
      const nextMode = resolveNextMode(executor, key, result, mode);
      this.pc = result & 0xFFFFFF;
      this.madl = nextMode === 'adl' ? 1 : 0;
    }
    return result;
  };
}

function formatInstruction(inst) {
  if (!inst) return '(decode error)';
  switch (inst.tag) {
    case 'alu-reg':
      return `${String(inst.op).toUpperCase()} ${String(inst.src).toUpperCase()}`;
    case 'alu-imm':
      return `${String(inst.op).toUpperCase()} ${hexByte(inst.value)}`;
    case 'bit-test-ind':
      return `BIT ${inst.bit}, (${String(inst.indirectRegister).toUpperCase()})`;
    case 'indexed-cb-bit':
      return `BIT ${inst.bit}, (${String(inst.indexRegister).toUpperCase()}${inst.displacement >= 0 ? '+' : ''}${inst.displacement})`;
    case 'indexed-cb-res':
      return `RES ${inst.bit}, (${String(inst.indexRegister).toUpperCase()}${inst.displacement >= 0 ? '+' : ''}${inst.displacement})`;
    case 'indexed-cb-set':
      return `SET ${inst.bit}, (${String(inst.indexRegister).toUpperCase()}${inst.displacement >= 0 ? '+' : ''}${inst.displacement})`;
    case 'call':
      return `CALL ${hex(inst.target)}`;
    case 'call-conditional':
      return `CALL ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jp':
      return `JP ${hex(inst.target)}`;
    case 'jp-conditional':
      return `JP ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jr':
      return `JR ${hex(inst.target)}`;
    case 'jr-conditional':
      return `JR ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'ld-pair-imm':
      return `LD ${String(inst.pair).toUpperCase()}, ${hex(inst.value)}`;
    case 'ld-pair-mem': {
      const suffix = inst.modePrefix ? `.${String(inst.modePrefix).toUpperCase()}` : '';
      const addrWidth = (inst.addr ?? 0) <= 0xFFFF ? 4 : 6;
      if (inst.direction === 'to-mem') {
        return `LD${suffix} (${hex(inst.addr, addrWidth)}), ${String(inst.pair).toUpperCase()}`;
      }
      return `LD${suffix} ${String(inst.pair).toUpperCase()}, (${hex(inst.addr, addrWidth)})`;
    }
    case 'ld-reg-imm':
      return `LD ${String(inst.dest).toUpperCase()}, ${hexByte(inst.value)}`;
    case 'ld-reg-mem':
      return `LD ${String(inst.dest).toUpperCase()}, (${hex(inst.addr)})`;
    case 'ld-mem-reg':
      return `LD (${hex(inst.addr)}), ${String(inst.src).toUpperCase()}`;
    case 'nop':
      return 'NOP';
    case 'pop':
      return `POP ${String(inst.pair ?? inst.dest ?? inst.reg).toUpperCase()}`;
    case 'push':
      return `PUSH ${String(inst.pair ?? inst.src ?? inst.reg).toUpperCase()}`;
    case 'ret':
      return 'RET';
    case 'ret-conditional':
      return `RET ${String(inst.condition).toUpperCase()}`;
    default: {
      let text = inst.tag;
      if (inst.bit !== undefined) text += ` bit=${inst.bit}`;
      if (inst.target !== undefined) text += ` ${hex(inst.target)}`;
      if (inst.value !== undefined) text += ` ${hex(inst.value)}`;
      return text;
    }
  }
}

function disassembleRange(start, end) {
  const rows = [];
  for (let pc = start; pc < end;) {
    try {
      const inst = decodeInstruction(romBytes, pc, 'adl');
      const length = inst.length || 1;
      rows.push({
        pc,
        bytes: bytesToHex(romBytes.subarray(pc, pc + length)),
        text: formatInstruction(inst),
      });
      pc += length;
    } catch (error) {
      rows.push({
        pc,
        bytes: hexByte(romBytes[pc]),
        text: `DB ${hexByte(romBytes[pc])} ; ${error?.message ?? 'decode error'}`,
      });
      pc += 1;
    }
  }
  return rows;
}

function createRuntime() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(romBytes.length, MEM_SIZE)));
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;
  installStepShim(cpu, executor);
  return { mem, peripherals, executor, cpu };
}

function coldBoot(executor, cpu, mem) {
  const boot = executor.runFrom(BOOT_ENTRY, BOOT_MODE, {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: BOOT_MAX_LOOP_ITERATIONS,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = BOOT_STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const kernel = executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
    maxSteps: 100000,
    maxLoopIterations: 10000,
  });

  cpu.mbase = MBASE;
  cpu.iy = IY_BASE;
  cpu.hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = BOOT_STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const post = executor.runFrom(POST_INIT_ENTRY, 'adl', {
    maxSteps: 100,
    maxLoopIterations: 32,
  });

  return { boot, kernel, post };
}

function seedRunState(cpu, mem, scenario) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.mbase = MBASE;
  cpu.pc = TARGET_FUNC;
  cpu.sp = RUN_STACK_TOP;
  cpu.ix = IX_BASE;
  cpu.iy = IY_BASE;
  cpu.bc = 0x000000;
  cpu.de = 0x000000;
  cpu.hl = 0x123456;
  cpu.a = 0x5A;
  cpu.f = 0x00;

  for (const seed of scenario.seeds) {
    mem[seed.addr & MEM_MASK] = seed.value & 0xFF;
  }

  push24(cpu, mem, RETURN_SENTINEL);
}

function isRamAddress(addr) {
  const masked = addr & 0xFFFFFF;
  return masked >= 0xD00000 && masked < 0xE00000;
}

function installMemoryTrace(cpu, state) {
  const orig = {
    read8: cpu.read8.bind(cpu),
    write8: cpu.write8.bind(cpu),
    read16: cpu.read16.bind(cpu),
    write16: cpu.write16.bind(cpu),
    read24: cpu.read24.bind(cpu),
    write24: cpu.write24.bind(cpu),
  };

  function logRead(addr, width, value) {
    const maskedAddr = addr & 0xFFFFFF;
    if (!isRamAddress(maskedAddr)) return;
    state.ramReads.push({
      step: state.currentStep,
      block: state.currentBlock,
      addr: maskedAddr,
      width,
      value: value & 0xFFFFFF,
    });
  }

  function logWrite(addr, width, oldVal, newVal) {
    const maskedAddr = addr & 0xFFFFFF;
    if (!isRamAddress(maskedAddr)) return;
    state.ramWrites.push({
      step: state.currentStep,
      block: state.currentBlock,
      addr: maskedAddr,
      width,
      oldVal: oldVal & 0xFFFFFF,
      newVal: newVal & 0xFFFFFF,
    });
  }

  cpu.read8 = (addr) => {
    const value = orig.read8(addr);
    logRead(addr, 1, value);
    return value;
  };

  cpu.write8 = (addr, value) => {
    const oldVal = orig.read8(addr);
    orig.write8(addr, value);
    const newVal = orig.read8(addr);
    logWrite(addr, 1, oldVal, newVal);
  };

  cpu.read16 = (addr) => {
    const value = orig.read16(addr);
    logRead(addr, 2, value);
    return value;
  };

  cpu.write16 = (addr, value) => {
    const oldVal = orig.read16(addr);
    orig.write16(addr, value);
    const newVal = orig.read16(addr);
    logWrite(addr, 2, oldVal, newVal);
  };

  cpu.read24 = (addr) => {
    const value = orig.read24(addr);
    logRead(addr, 3, value);
    return value;
  };

  cpu.write24 = (addr, value) => {
    const oldVal = orig.read24(addr);
    orig.write24(addr, value);
    const newVal = orig.read24(addr);
    logWrite(addr, 3, oldVal, newVal);
  };

  return () => {
    cpu.read8 = orig.read8;
    cpu.write8 = orig.write8;
    cpu.read16 = orig.read16;
    cpu.write16 = orig.write16;
    cpu.read24 = orig.read24;
    cpu.write24 = orig.write24;
  };
}

function traceRun(cpu, executor, mem, budget, scenario) {
  const result = {
    label: scenario.label,
    seeds: scenario.seeds.map((seed) => ({ ...seed })),
    entryRegs: snapshotRegs(cpu),
    stateByteBefore: mem[STATE_BYTE_ADDR & MEM_MASK] & 0xFF,
    currentStep: 0,
    currentBlock: 'seed',
    visitOrder: [],
    visitCounts: new Map(),
    callTargets: [],
    ramReads: [],
    ramWrites: [],
    executedSteps: 0,
    stopReason: 'budget_exhausted',
    error: null,
  };

  const uninstallTrace = installMemoryTrace(cpu, result);

  try {
    while (result.executedSteps < budget) {
      const pc = cpu.pc & 0xFFFFFF;
      const mode = cpu.madl ? 'adl' : 'z80';
      const visitKey = blockKey(pc, mode);

      if (!result.visitCounts.has(visitKey)) {
        result.visitOrder.push({ pc, mode });
      }
      result.visitCounts.set(visitKey, (result.visitCounts.get(visitKey) ?? 0) + 1);

      if (pc === RETURN_SENTINEL) {
        result.stopReason = 'returned_sentinel';
        break;
      }

      const meta = executor.blockMeta?.[visitKey];
      if (meta?.instructions) {
        for (const inst of meta.instructions) {
          if (inst.tag === 'call' || inst.tag === 'call-conditional') {
            result.callTargets.push({
              step: result.executedSteps + 1,
              from: inst.pc,
              target: inst.target,
              tag: inst.tag,
              condition: inst.condition ?? null,
            });
          }
        }
      }

      result.currentStep = result.executedSteps + 1;
      result.currentBlock = formatBlock(pc, mode);

      let stepResult;
      try {
        stepResult = cpu.step();
      } catch (error) {
        result.stopReason = 'error';
        result.error = error instanceof Error ? error.message : String(error);
        break;
      }

      result.executedSteps += 1;

      if (stepResult === -1) {
        result.stopReason = 'halt';
        break;
      }
      if (stepResult === -2) {
        result.stopReason = 'sleep';
        break;
      }
      if ((cpu.pc & 0xFFFFFF) === RETURN_SENTINEL) {
        result.stopReason = 'returned_sentinel';
        break;
      }
    }
  } finally {
    uninstallTrace();
  }

  result.finalRegs = snapshotRegs(cpu);
  result.stateByteAfter = mem[STATE_BYTE_ADDR & MEM_MASK] & 0xFF;
  result.zSet = (cpu.f & FLAG_Z) !== 0;
  result.nz = !result.zSet;
  return result;
}

function printAccessList(title, entries, kind) {
  console.log(`  ${title}:`);
  if (entries.length === 0) {
    console.log('    (none)');
    console.log('');
    return;
  }
  for (const entry of entries) {
    if (kind === 'read') {
      console.log(
        `    step ${String(entry.step).padStart(3)} ${entry.block} ` +
        `READ ${hex(entry.addr)} width=${entry.width} value=${hex(entry.value, valueWidth(entry.width))}`,
      );
    } else {
      console.log(
        `    step ${String(entry.step).padStart(3)} ${entry.block} ` +
        `WRITE ${hex(entry.addr)} width=${entry.width} ` +
        `${hex(entry.oldVal, valueWidth(entry.width))} -> ${hex(entry.newVal, valueWidth(entry.width))}`,
      );
    }
  }
  console.log('');
}

function printRunResult(result) {
  console.log('========================================================================');
  console.log(result.label);
  console.log('========================================================================');
  for (const seed of result.seeds) {
    console.log(`  Seed ${seed.name}: ${hexByte(seed.value)}`);
  }
  console.log(`  D02661 before call: ${hexByte(result.stateByteBefore)}`);
  console.log(`  Entry regs: ${formatRegs(result.entryRegs)}`);
  console.log(`  Steps: ${result.executedSteps}/${STEP_BUDGET}`);
  console.log(`  Stop reason: ${result.stopReason}`);
  if (result.error) {
    console.log(`  Error: ${result.error}`);
  }
  console.log(`  Final regs: ${formatRegs(result.finalRegs)}`);
  console.log(
    `  Return state: A=${hexByte(result.finalRegs.a)} F=${hexByte(result.finalRegs.f)} ` +
    `Z=${result.zSet ? 'set' : 'clear'} NZ=${result.nz ? 'true' : 'false'}`,
  );
  console.log(`  D02661 after call:  ${hexByte(result.stateByteAfter)}`);
  console.log('');

  console.log('  Unique blocks visited:');
  if (result.visitOrder.length === 0) {
    console.log('    (none)');
  } else {
    for (let i = 0; i < result.visitOrder.length; i++) {
      const visit = result.visitOrder[i];
      const key = blockKey(visit.pc, visit.mode);
      const count = result.visitCounts.get(key) ?? 0;
      console.log(`    [${String(i).padStart(2)}] ${formatBlock(visit.pc, visit.mode)} (x${count})`);
    }
  }
  console.log('');

  console.log('  CALL destinations:');
  if (result.callTargets.length === 0) {
    console.log('    (none)');
  } else {
    for (const call of result.callTargets) {
      const cond = call.condition ? ` (${call.condition})` : '';
      console.log(
        `    step ${String(call.step).padStart(3)} ${hex(call.from)} -> CALL${cond} ${hex(call.target)}`,
      );
    }
  }
  console.log('');

  printAccessList('RAM reads', result.ramReads, 'read');
  printAccessList('RAM writes', result.ramWrites, 'write');
}

function printReport(results) {
  const zSummary = results.map((result) => ({
    label: result.label,
    stateByte: result.stateByteBefore,
    zSet: result.zSet,
  }));
  const allSameOutcome = zSummary.every(
    (entry) => entry.stateByte === zSummary[0].stateByte && entry.zSet === zSummary[0].zSet,
  );
  const aPreserved = results.every((result) => result.entryRegs.a === result.finalRegs.a);
  const hlPreserved = results.every((result) => result.entryRegs.hl === result.finalRegs.hl);
  const onlyExpectedReads = results.every((result) =>
    result.ramReads.every((entry) => entry.addr === STATE_BYTE_ADDR || entry.addr === STACK_SAVE_ADDR),
  );
  const onlyExpectedWrites = results.every((result) =>
    result.ramWrites.every((entry) => entry.addr === STACK_SAVE_ADDR),
  );

  console.log('========================================================================');
  console.log('REPORT');
  console.log('========================================================================');
  console.log('  What 0x088772 does:');
  console.log('    - Pushes HL onto the stack.');
  console.log('    - Loads HL = 0xD02661.');
  console.log('    - Tests BIT 7 of byte (0xD02661).');
  console.log('    - Pops HL back and returns.');
  console.log('');

  console.log('  What determines Z/NZ:');
  console.log('    - Z is set when bit 7 of D02661 is clear.');
  console.log('    - NZ is true when bit 7 of D02661 is set.');
  console.log(`    - A preserved across all runs: ${aPreserved}`);
  console.log(`    - HL preserved across all runs: ${hlPreserved}`);
  console.log('');

  console.log('  Dynamic evidence from the four direct calls:');
  for (const entry of zSummary) {
    console.log(
      `    - ${entry.label}: D02661=${hexByte(entry.stateByte)} -> ` +
      `Z=${entry.zSet ? 'set' : 'clear'} NZ=${entry.zSet ? 'false' : 'true'}`,
    );
  }
  console.log(`    - D007E0 / D00824 perturbations alone changed nothing: ${allSameOutcome}`);
  console.log(`    - Non-stack RAM reads stayed on D02661 only: ${onlyExpectedReads}`);
  console.log(`    - Non-stack RAM writes stayed absent: ${onlyExpectedWrites}`);
  console.log('');

  console.log('  Relation to mode/display state:');
  console.log('    - 0x088772 does not read D007E0 or D00824 directly.');
  console.log('    - It is a downstream helper that answers one question: is D02661 bit 7 set?');
  console.log('    - In 0x051ADC, that means the pass-through NZ path depends on the D02661 latch, not directly on D007E0 / D00824.');
  console.log('    - Inference from nearby D02661 handlers: the low 7 bits act like a small state/code value, while bit 7 is an active/pending flag.');
  console.log('');

  console.log('  Nearby D02661 evidence:');
  for (const note of NEARBY_STATE_EVIDENCE) {
    console.log(`    - ${hex(note.addr)}: ${note.text}`);
  }
  console.log('');
}

async function main() {
  console.log('Phase 244: Trace 0x088772, second sub-call from 0x051ADC');
  console.log('========================================================================');
  console.log(`ROM: ${path.basename(ROM_PATH)} (${romBytes.length} bytes)`);
  console.log(`Target: ${hex(TARGET_FUNC)} | MBASE=${hexByte(MBASE)} | return sentinel=${hex(RETURN_SENTINEL)}`);
  console.log(`Direct-call register seed: IX=${hex(IX_BASE)} IY=${hex(IY_BASE)} SP=${hex(RUN_STACK_TOP)} A=${hexByte(0x5A)} HL=${hex(0x123456)}`);
  console.log('Peripheral seed: createPeripheralBus({ timerInterrupt: false })');
  console.log('');

  console.log('========================================================================');
  console.log(`HEX DUMP ${hex(DUMP_START)}..${hex(DUMP_END)} (${DUMP_END - DUMP_START} bytes)`);
  console.log('========================================================================');
  for (let addr = DUMP_START; addr < DUMP_END; addr += 16) {
    const end = Math.min(addr + 16, DUMP_END);
    const slice = romBytes.subarray(addr, end);
    console.log(`  ${hex(addr)}: ${Array.from(slice, (b) => hexByte(b)).join(' ')}`);
  }
  console.log('');

  console.log('========================================================================');
  console.log(`STATIC DISASSEMBLY ${hex(DUMP_START)}..${hex(DUMP_END)}`);
  console.log('========================================================================');
  for (const row of disassembleRange(DUMP_START, DUMP_END)) {
    console.log(`  ${hex(row.pc)}: ${row.bytes.padEnd(24)} ${row.text}`);
  }
  console.log('');

  const runtime = createRuntime();
  const bootSummary = coldBoot(runtime.executor, runtime.cpu, runtime.mem);
  const bootMemory = new Uint8Array(runtime.mem);
  const bootCpuSnapshot = snapshotCpu(runtime.cpu);

  console.log('========================================================================');
  console.log('COLD BOOT');
  console.log('========================================================================');
  console.log(`  boot:   steps=${bootSummary.boot.steps}/${bootSummary.boot.termination}`);
  console.log(`  kernel: steps=${bootSummary.kernel.steps}/${bootSummary.kernel.termination}`);
  console.log(`  post:   steps=${bootSummary.post.steps}/${bootSummary.post.termination}`);
  console.log(`  D02661 after post-init baseline: ${hexByte(bootMemory[STATE_BYTE_ADDR & MEM_MASK])}`);
  console.log('');

  const results = [];

  for (const scenario of SCENARIOS) {
    runtime.mem.set(bootMemory);
    restoreCpu(runtime.cpu, bootCpuSnapshot);
    seedRunState(runtime.cpu, runtime.mem, scenario);
    const result = traceRun(runtime.cpu, runtime.executor, runtime.mem, STEP_BUDGET, scenario);
    results.push(result);
    printRunResult(result);
  }

  printReport(results);
  console.log('Phase 244 complete.');
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
});

#!/usr/bin/env node

/**
 * Phase 247: Trace function 0x0885EA — the sole caller of 0x0AF1DC (D02661 latch armer).
 *
 * Goals:
 *   1. Static analysis: disassemble 0x0885EA ±64 bytes, find function boundary.
 *   2. Find callers: scan ROM for CALL/JP to 0x0885EA.
 *   3. Dynamic traces: execute from 0x0885EA with A=0x00, A=0x01, A=0x83 — 200 steps each.
 *   4. Record: blocks visited, D02661 before/after, whether 0x0AF1DC is reached,
 *      what D02E13 area contains after.
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

const TARGET_FUNC = 0x0885EA;
const LATCH_ADDR = 0xD02661;
const ARMER_FUNC = 0x0AF1DC;
const COPY_DEST = 0xD02E13;
const COPY_LEN = 0xB4;
const STEP_BUDGET = 200;

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
    case 'ld-ind-reg':
      return `LD (${String(inst.indirectRegister).toUpperCase()}), ${String(inst.src).toUpperCase()}`;
    case 'ld-reg-ind':
      return `LD ${String(inst.dest).toUpperCase()}, (${String(inst.indirectRegister).toUpperCase()})`;
    case 'res-ind':
      return `RES ${inst.bit}, (${String(inst.indirectRegister).toUpperCase()})`;
    case 'set-ind':
      return `SET ${inst.bit}, (${String(inst.indirectRegister).toUpperCase()})`;
    default: {
      let text = inst.tag;
      if (inst.bit !== undefined) text += ` bit=${inst.bit}`;
      if (inst.target !== undefined) text += ` ${hex(inst.target)}`;
      if (inst.value !== undefined) text += ` ${hex(inst.value)}`;
      if (inst.addr !== undefined) text += ` addr=${hex(inst.addr)}`;
      if (inst.dest !== undefined) text += ` dest=${inst.dest}`;
      if (inst.src !== undefined) text += ` src=${inst.src}`;
      if (inst.indirectRegister !== undefined) text += ` (${inst.indirectRegister})`;
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

function traceRun(cpu, executor, mem, budget, label) {
  const result = {
    label,
    entryRegs: snapshotRegs(cpu),
    latchBefore: mem[LATCH_ADDR & MEM_MASK] & 0xFF,
    currentStep: 0,
    currentBlock: 'seed',
    visitOrder: [],
    visitCounts: new Map(),
    callTargets: [],
    ramReads: [],
    ramWrites: [],
    executedSteps: 0,
    reachedArmer: false,
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

      // Check if we reached the armer function
      if (pc === ARMER_FUNC) {
        result.reachedArmer = true;
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
  result.latchAfter = mem[LATCH_ADDR & MEM_MASK] & 0xFF;
  result.zSet = (cpu.f & FLAG_Z) !== 0;

  // Snapshot D02E13 area after execution
  const copyAreaStart = COPY_DEST & MEM_MASK;
  result.d02e13Area = Array.from(
    mem.subarray(copyAreaStart, copyAreaStart + Math.min(COPY_LEN, 32)),
    (b) => b,
  );

  return result;
}

function printRunResult(result) {
  console.log('========================================================================');
  console.log(result.label);
  console.log('========================================================================');
  console.log(`  D02661 before: ${hexByte(result.latchBefore)}`);
  console.log(`  Entry regs: ${formatRegs(result.entryRegs)}`);
  console.log(`  Steps: ${result.executedSteps}/${STEP_BUDGET}`);
  console.log(`  Stop reason: ${result.stopReason}`);
  if (result.error) {
    console.log(`  Error: ${result.error}`);
  }
  console.log(`  Final regs: ${formatRegs(result.finalRegs)}`);
  console.log(`  D02661 after:  ${hexByte(result.latchAfter)}`);
  console.log(`  Z=${result.zSet ? 'set' : 'clear'}`);
  console.log(`  Reached 0x0AF1DC (armer): ${result.reachedArmer ? 'YES' : 'NO'}`);
  console.log('');

  console.log('  D02E13 area (first 32 bytes after run):');
  console.log(`    ${result.d02e13Area.map((b) => hexByte(b)).join(' ')}`);
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

  // Filter RAM writes to interesting addresses
  const interestingWrites = result.ramWrites.filter((w) => {
    const a = w.addr;
    return a === LATCH_ADDR || (a >= COPY_DEST && a < COPY_DEST + COPY_LEN);
  });
  console.log('  Interesting RAM writes (D02661 + D02E13 area):');
  if (interestingWrites.length === 0) {
    console.log('    (none)');
  } else {
    for (const entry of interestingWrites) {
      console.log(
        `    step ${String(entry.step).padStart(3)} ${entry.block} ` +
        `WRITE ${hex(entry.addr)} width=${entry.width} ` +
        `${hex(entry.oldVal, valueWidth(entry.width))} -> ${hex(entry.newVal, valueWidth(entry.width))}`,
      );
    }
  }
  console.log('');

  // Also show all RAM writes (abbreviated)
  console.log(`  All RAM writes: ${result.ramWrites.length} total`);
  const shown = result.ramWrites.slice(0, 40);
  for (const entry of shown) {
    console.log(
      `    step ${String(entry.step).padStart(3)} ${entry.block} ` +
      `WRITE ${hex(entry.addr)} width=${entry.width} ` +
      `${hex(entry.oldVal, valueWidth(entry.width))} -> ${hex(entry.newVal, valueWidth(entry.width))}`,
    );
  }
  if (result.ramWrites.length > 40) {
    console.log(`    ... (${result.ramWrites.length - 40} more)`);
  }
  console.log('');
}

function scanCallSites(targetAddr) {
  const lo = targetAddr & 0xFF;
  const mid = (targetAddr >>> 8) & 0xFF;
  const hi = (targetAddr >>> 16) & 0xFF;

  const callPattern = [0xCD, lo, mid, hi];
  const jpPattern = [0xC3, lo, mid, hi];

  const results = [];

  for (let i = 0; i <= romBytes.length - 4; i++) {
    let isCall = true;
    let isJp = true;
    for (let j = 0; j < 4; j++) {
      if (romBytes[i + j] !== callPattern[j]) isCall = false;
      if (romBytes[i + j] !== jpPattern[j]) isJp = false;
    }
    if (isCall) {
      results.push({ addr: i, type: 'CALL', target: targetAddr });
    }
    if (isJp) {
      results.push({ addr: i, type: 'JP', target: targetAddr });
    }
  }

  // Conditional calls/jumps
  const condCallOpcodes = [0xC4, 0xCC, 0xD4, 0xDC, 0xE4, 0xEC, 0xF4, 0xFC];
  const condJpOpcodes = [0xC2, 0xCA, 0xD2, 0xDA, 0xE2, 0xEA, 0xF2, 0xFA];
  const condNames = ['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M'];

  for (let i = 0; i <= romBytes.length - 4; i++) {
    if (romBytes[i + 1] === lo && romBytes[i + 2] === mid && romBytes[i + 3] === hi) {
      const op = romBytes[i];
      const callIdx = condCallOpcodes.indexOf(op);
      if (callIdx >= 0) {
        results.push({ addr: i, type: `CALL ${condNames[callIdx]}`, target: targetAddr });
      }
      const jpIdx = condJpOpcodes.indexOf(op);
      if (jpIdx >= 0) {
        results.push({ addr: i, type: `JP ${condNames[jpIdx]}`, target: targetAddr });
      }
    }
  }

  return results;
}

async function main() {
  console.log('Phase 247: Trace 0x0885EA — sole caller of 0x0AF1DC (D02661 latch armer)');
  console.log('========================================================================');
  console.log(`ROM: ${path.basename(ROM_PATH)} (${romBytes.length} bytes)`);
  console.log('');

  // ---- 1. Static analysis: disassemble around 0x0885EA ----
  console.log('========================================================================');
  console.log('1. DISASSEMBLY: 0x0885EA ±64 bytes (0x0885AA - 0x08862A)');
  console.log('========================================================================');
  const disasmStart = TARGET_FUNC - 64;
  const disasmEnd = TARGET_FUNC + 64;
  const rows = disassembleRange(disasmStart, disasmEnd);
  for (const row of rows) {
    const marker = row.pc === TARGET_FUNC ? ' <-- TARGET' : '';
    console.log(`  ${hex(row.pc)}: ${row.bytes.padEnd(24)} ${row.text}${marker}`);
  }
  console.log('');

  // Try to identify function boundary by looking for RET before and after
  console.log('  Function boundary search (looking for RET near 0x0885EA):');
  const wideRows = disassembleRange(TARGET_FUNC - 128, TARGET_FUNC + 128);
  const retAddrs = [];
  for (const row of wideRows) {
    if (row.text === 'RET' || row.text.startsWith('RET ')) {
      retAddrs.push(row.pc);
    }
  }
  console.log(`  RETs found: ${retAddrs.map((a) => hex(a)).join(', ')}`);
  console.log('');

  // ---- 2. Find callers of 0x0885EA ----
  console.log('========================================================================');
  console.log('2. CALLERS OF 0x0885EA');
  console.log('========================================================================');
  const callers = scanCallSites(TARGET_FUNC);
  if (callers.length === 0) {
    console.log('  (none found)');
  } else {
    for (const site of callers) {
      console.log(`  ${hex(site.addr)}: ${site.type} ${hex(site.target)}`);
      // Disassemble a few instructions around each call site for context
      const ctxRows = disassembleRange(Math.max(0, site.addr - 8), site.addr + 12);
      for (const row of ctxRows) {
        const mark = row.pc === site.addr ? ' <<<' : '';
        console.log(`    ${hex(row.pc)}: ${row.bytes.padEnd(20)} ${row.text}${mark}`);
      }
      console.log('');
    }
  }
  console.log('');

  // Also find callers of 0x0AF1DC for cross-reference
  console.log('========================================================================');
  console.log('2b. CALLERS OF 0x0AF1DC (armer, for cross-reference)');
  console.log('========================================================================');
  const armerCallers = scanCallSites(ARMER_FUNC);
  if (armerCallers.length === 0) {
    console.log('  (none found)');
  } else {
    for (const site of armerCallers) {
      console.log(`  ${hex(site.addr)}: ${site.type} ${hex(site.target)}`);
    }
  }
  console.log('');

  // ---- 3. Dynamic traces ----
  console.log('========================================================================');
  console.log('COLD BOOT');
  console.log('========================================================================');

  const runtime = createRuntime();
  const bootSummary = coldBoot(runtime.executor, runtime.cpu, runtime.mem);
  const bootMemory = new Uint8Array(runtime.mem);
  const bootCpuSnapshot = snapshotCpu(runtime.cpu);

  console.log(`  boot:   steps=${bootSummary.boot.steps}/${bootSummary.boot.termination}`);
  console.log(`  kernel: steps=${bootSummary.kernel.steps}/${bootSummary.kernel.termination}`);
  console.log(`  post:   steps=${bootSummary.post.steps}/${bootSummary.post.termination}`);
  console.log(`  D02661 after boot: ${hexByte(bootMemory[LATCH_ADDR & MEM_MASK])}`);
  console.log(`  D02E13 after boot (first 32 bytes): ${bytesToHex(bootMemory.subarray(COPY_DEST & MEM_MASK, (COPY_DEST & MEM_MASK) + 32))}`);
  console.log('');

  // 0x0885EA is JP 0x0AF1DC — a tail-jump, not a block entry.
  // The parent function likely starts at a block boundary before it.
  // Find the nearest known block entry by scanning backward.
  console.log('  Searching for nearest transpiled block entries near 0x0885EA...');
  const searchBlocks = [];
  for (let addr = TARGET_FUNC; addr >= TARGET_FUNC - 256; addr--) {
    const key = blockKey(addr, 'adl');
    if (runtime.executor.compiledBlocks[key]) {
      searchBlocks.push(addr);
    }
  }
  for (let addr = TARGET_FUNC + 1; addr <= TARGET_FUNC + 64; addr++) {
    const key = blockKey(addr, 'adl');
    if (runtime.executor.compiledBlocks[key]) {
      searchBlocks.push(addr);
    }
  }
  searchBlocks.sort((a, b) => a - b);
  console.log(`  Known blocks near 0x0885EA: ${searchBlocks.map((a) => hex(a)).join(', ')}`);
  console.log('');

  // Also check if 0x0AF1DC (the armer itself) has a block
  const armerKey = blockKey(ARMER_FUNC, 'adl');
  const armerBlockExists = !!runtime.executor.compiledBlocks[armerKey];
  console.log(`  Block exists for 0x0AF1DC (armer): ${armerBlockExists ? 'YES' : 'NO'}`);
  console.log('');

  // Strategy: trace from 0x0AF1DC directly (the actual armer function)
  // with A=0x00, A=0x01, A=0x83 — since 0x0885EA just JP's to it.
  // Also try the closest parent block if one was found.

  const traceEntries = [];

  // Always trace 0x0AF1DC directly
  if (armerBlockExists) {
    traceEntries.push({ addr: ARMER_FUNC, label: '0x0AF1DC (armer direct)' });
  }

  // Add nearest parent blocks that are before TARGET_FUNC
  const parentBlocks = searchBlocks.filter((a) => a <= TARGET_FUNC);
  for (const pAddr of parentBlocks.slice(-3)) { // last 3 (closest)
    traceEntries.push({ addr: pAddr, label: `${hex(pAddr)} (parent block)` });
  }

  // Add any blocks just after TARGET_FUNC for context
  const afterBlocks = searchBlocks.filter((a) => a > TARGET_FUNC);
  for (const aAddr of afterBlocks.slice(0, 2)) {
    traceEntries.push({ addr: aAddr, label: `${hex(aAddr)} (after-target block)` });
  }

  const aValues = [0x00, 0x01, 0x83];

  for (const entry of traceEntries) {
    for (const aVal of aValues) {
      runtime.mem.set(bootMemory);
      restoreCpu(runtime.cpu, bootCpuSnapshot);

      const cpu = runtime.cpu;
      cpu.halted = false;
      cpu.iff1 = 0;
      cpu.iff2 = 0;
      cpu.madl = 1;
      cpu.mbase = MBASE;
      cpu.pc = entry.addr;
      cpu.sp = RUN_STACK_TOP;
      cpu.ix = IX_BASE;
      cpu.iy = IY_BASE;
      cpu.bc = 0x000000;
      cpu.de = 0x000000;
      cpu.hl = 0x000000;
      cpu.a = aVal;
      cpu.f = 0x00;

      // Seed D02661 = 0x00 (clear latch)
      runtime.mem[LATCH_ADDR & MEM_MASK] = 0x00;

      // Clear D02E13 area to detect writes
      const copyStart = COPY_DEST & MEM_MASK;
      runtime.mem.fill(0x00, copyStart, copyStart + COPY_LEN);

      push24(cpu, runtime.mem, RETURN_SENTINEL);

      const result = traceRun(
        cpu, runtime.executor, runtime.mem, STEP_BUDGET,
        `3. Dynamic trace ${entry.label} with A=${hexByte(aVal)}, D02661=0x00`,
      );
      printRunResult(result);
    }
  }

  // ---- 4. Summary ----
  console.log('========================================================================');
  console.log('4. SUMMARY');
  console.log('========================================================================');
  console.log(`  Target function: ${hex(TARGET_FUNC)}`);
  console.log(`  This is the sole caller of ${hex(ARMER_FUNC)} (D02661 latch armer).`);
  console.log(`  0x0AF1DC arms the latch: SET bit 7 on D02661, copies 0xB4 bytes to D02E13.`);
  console.log(`  Callers of 0x0885EA: ${callers.length}`);
  console.log(`  Callers of 0x0AF1DC: ${armerCallers.length}`);
  console.log('');
  console.log('Phase 247 complete.');
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
});

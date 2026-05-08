#!/usr/bin/env node

/**
 * Phase 265: Trace 0x085D3B parent function.
 *
 * Session 248 found 0x088586 (D02661 latch armer) has ONE CALLER:
 *   JP Z,0x088586 at 0x085D4B, gated by LD HL,0xD02661 / BIT 7,(HL).
 *   Preceded by CALL 0x086C45 at 0x085D3F.
 *
 * Goals:
 *   1. Static: Decode 0x085D00-0x085D80 region, find function boundaries.
 *   2. Callers: Scan ROM for CALL/JP targeting the parent function entry.
 *   3. Dynamic A: D02661=0x00 (bit 7 clear → JP Z fires → reaches 0x088586).
 *   4. Dynamic B: D02661=0x80 (bit 7 set → JP Z skips).
 *   5. Trace 0x086C45 sub-call (200 steps).
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

const RETURN_SENTINEL = 0x7FFFFE;
const MBASE = 0xD0;
const IX_BASE = 0xD1A860;
const IY_BASE = 0xD00080;
const BOOT_STACK_TOP = 0xD1A87E;

const STATE_BYTE_ADDR = 0xD02661;
const TARGET_088586 = 0x088586;
const CALL_086C45 = 0x086C45;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function bytesToHex(bytes) {
  return Array.from(bytes, (b) => hexByte(b)).join(' ');
}

function blockKey(addr, mode) {
  return `${(addr >>> 0).toString(16).padStart(6, '0')}:${mode}`;
}

function formatBlock(pc, mode) {
  return `${hex(pc)}:${mode}`;
}

function valueWidth(width) {
  if (width === 1) return 2;
  if (width === 2) return 4;
  return 6;
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

// ---------------------------------------------------------------------------
// Disassembler
// ---------------------------------------------------------------------------

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
        inst,
      });
      pc += length;
    } catch (error) {
      rows.push({
        pc,
        bytes: hexByte(romBytes[pc]),
        text: `DB ${hexByte(romBytes[pc])} ; ${error?.message ?? 'decode error'}`,
        inst: null,
      });
      pc += 1;
    }
  }
  return rows;
}

function printDisassembly(title, rows) {
  console.log(`  ${title}:`);
  for (const row of rows) {
    const pcStr = hex(row.pc);
    const padBytes = row.bytes.padEnd(20);
    console.log(`    ${pcStr}  ${padBytes}  ${row.text}`);
  }
  console.log('');
}

// ---------------------------------------------------------------------------
// Runtime factory
// ---------------------------------------------------------------------------

function createRuntime() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(romBytes.length, MEM_SIZE)));
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;
  installStepShim(cpu, executor);
  return { mem, peripherals, executor, cpu };
}

function seedCpu(cpu, mem, overrides = {}) {
  cpu.madl = 1;
  cpu.mbase = MBASE;
  cpu.ix = overrides.ix ?? IX_BASE;
  cpu.iy = overrides.iy ?? IY_BASE;
  cpu.sp = overrides.sp ?? BOOT_STACK_TOP;
  cpu.a = overrides.a ?? 0;
  cpu.f = overrides.f ?? 0;
  cpu.bc = overrides.bc ?? 0;
  cpu.de = overrides.de ?? 0;
  cpu.hl = overrides.hl ?? 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.pc = overrides.pc ?? 0;

  // Push return sentinel so RET returns cleanly
  push24(cpu, mem, RETURN_SENTINEL);
}

// ---------------------------------------------------------------------------
// Trace runner
// ---------------------------------------------------------------------------

function traceRun(cpu, executor, mem, budget, label) {
  const result = {
    label,
    entryRegs: snapshotRegs(cpu),
    stateByteBefore: mem[STATE_BYTE_ADDR & MEM_MASK] & 0xFF,
    currentStep: 0,
    currentBlock: 'seed',
    visitOrder: [],
    visitCounts: new Map(),
    callTargets: [],
    reached088586: false,
    executedSteps: 0,
    stopReason: 'budget_exhausted',
    error: null,
  };

  try {
    while (result.executedSteps < budget) {
      const pc = cpu.pc & 0xFFFFFF;
      const mode = cpu.madl ? 'adl' : 'z80';
      const visitKey = blockKey(pc, mode);

      if (pc === TARGET_088586) {
        result.reached088586 = true;
      }

      if (!result.visitCounts.has(visitKey)) {
        result.visitOrder.push({ pc, mode });
      }
      result.visitCounts.set(visitKey, (result.visitCounts.get(visitKey) ?? 0) + 1);

      if (pc === RETURN_SENTINEL || pc === (RETURN_SENTINEL & 0xFFFF)) {
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
  } catch (err) {
    result.stopReason = 'exception';
    result.error = err instanceof Error ? err.message : String(err);
  }

  result.finalRegs = snapshotRegs(cpu);
  result.stateByteAfter = mem[STATE_BYTE_ADDR & MEM_MASK] & 0xFF;
  return result;
}

function printRunResult(result, stepBudget) {
  console.log('========================================================================');
  console.log(result.label);
  console.log('========================================================================');
  console.log(`  D02661 before: ${hexByte(result.stateByteBefore)}`);
  console.log(`  Entry regs: ${formatRegs(result.entryRegs)}`);
  console.log(`  Steps: ${result.executedSteps}/${stepBudget}`);
  console.log(`  Stop reason: ${result.stopReason}`);
  if (result.error) {
    console.log(`  Error: ${result.error}`);
  }
  console.log(`  Final regs: ${formatRegs(result.finalRegs)}`);
  console.log(`  D02661 after:  ${hexByte(result.stateByteAfter)}`);
  console.log(`  Reached 0x088586: ${result.reached088586 ? 'YES' : 'NO'}`);
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

  if (result.callTargets.length > 0) {
    console.log('  CALL targets:');
    for (const ct of result.callTargets) {
      const cond = ct.condition ? ` ${ct.condition.toUpperCase()}` : '';
      console.log(`    step ${String(ct.step).padStart(3)}  from=${hex(ct.from)}  ${ct.tag}${cond}  target=${hex(ct.target)}`);
    }
    console.log('');
  }
}

// ---------------------------------------------------------------------------
// Caller scanner
// ---------------------------------------------------------------------------

function findCallers(targetAddr) {
  const callers = [];
  const lo = targetAddr & 0xFF;
  const mid = (targetAddr >>> 8) & 0xFF;
  const hi = (targetAddr >>> 16) & 0xFF;

  // eZ80 ADL: CALL = CD xx xx xx (4 bytes), JP = C3 xx xx xx (4 bytes)
  // Conditional JP: C2/CA/D2/DA/E2/EA/F2/FA xx xx xx
  // Conditional CALL: C4/CC/D4/DC/E4/EC/F4/FC xx xx xx
  const opcodes = [
    { byte: 0xCD, mnemonic: 'CALL' },
    { byte: 0xC3, mnemonic: 'JP' },
    { byte: 0xC2, mnemonic: 'JP NZ' },
    { byte: 0xCA, mnemonic: 'JP Z' },
    { byte: 0xD2, mnemonic: 'JP NC' },
    { byte: 0xDA, mnemonic: 'JP C' },
    { byte: 0xE2, mnemonic: 'JP PO' },
    { byte: 0xEA, mnemonic: 'JP PE' },
    { byte: 0xF2, mnemonic: 'JP P' },
    { byte: 0xFA, mnemonic: 'JP M' },
    { byte: 0xC4, mnemonic: 'CALL NZ' },
    { byte: 0xCC, mnemonic: 'CALL Z' },
    { byte: 0xD4, mnemonic: 'CALL NC' },
    { byte: 0xDC, mnemonic: 'CALL C' },
    { byte: 0xE4, mnemonic: 'CALL PO' },
    { byte: 0xEC, mnemonic: 'CALL PE' },
    { byte: 0xF4, mnemonic: 'CALL P' },
    { byte: 0xFC, mnemonic: 'CALL M' },
  ];

  const romLen = Math.min(romBytes.length, 0x400000);

  for (let i = 0; i < romLen - 3; i++) {
    if (romBytes[i + 1] === lo && romBytes[i + 2] === mid && romBytes[i + 3] === hi) {
      const op = opcodes.find((o) => o.byte === romBytes[i]);
      if (op) {
        callers.push({ addr: i, mnemonic: op.mnemonic, target: targetAddr });
      }
    }
  }

  return callers;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

console.log('=== Phase 265: 0x085D3B Parent Function Trace ===\n');
console.log(`ROM: ${ROM_PATH}`);
console.log(`Transpiled: ${TRANSPILED_PATH}`);
console.log('Timer IRQ: disabled');
console.log('');

// -----------------------------------------------------------------------
// 1. Static analysis: decode 0x085D00-0x085D80
// -----------------------------------------------------------------------

console.log('--- Section 1: Static Disassembly 0x085D00-0x085D80 ---\n');

const fullRows = disassembleRange(0x085D00, 0x085D80);
printDisassembly('0x085D00-0x085D80', fullRows);

// Find function boundary: scan backward from 0x085D3B for RET/JP
console.log('  Scanning backward from 0x085D3B for function boundary (RET=0xC9 or JP=0xC3):');
let funcStart = null;
for (let addr = 0x085D3A; addr >= 0x085C00; addr--) {
  const b = romBytes[addr];
  if (b === 0xC9) {
    funcStart = addr + 1;
    console.log(`    Found RET (0xC9) at ${hex(addr)} -> function likely starts at ${hex(funcStart)}`);
    break;
  }
  // Check for unconditional JP (C3 xx xx xx) - the JP is 4 bytes, function starts after it
  if (b === 0xC3 && addr + 3 < 0x085D3B) {
    funcStart = addr + 4;
    console.log(`    Found JP (0xC3) at ${hex(addr)} -> function likely starts at ${hex(funcStart)}`);
    break;
  }
}
if (!funcStart) {
  funcStart = 0x085D00;
  console.log(`    No RET/JP found, using 0x085D00 as approximate start`);
}
console.log('');

// Scan forward past 0x085D51 for function end
console.log('  Scanning forward from 0x085D51 for function end:');
let funcEnd = null;
const fwdRows = disassembleRange(0x085D51, 0x085DC0);
for (const row of fwdRows) {
  if (row.inst && (row.inst.tag === 'ret' || (row.inst.tag === 'jp' && row.inst.target !== undefined))) {
    funcEnd = row.pc + (row.inst.length || 1);
    console.log(`    Found ${row.text} at ${hex(row.pc)} -> function ends at ${hex(funcEnd)}`);
    break;
  }
}
if (!funcEnd) {
  funcEnd = 0x085DC0;
  console.log(`    No RET/JP found, using 0x085DC0 as approximate end`);
}
console.log('');

// Disassemble full function
console.log(`  Full function disassembly: ${hex(funcStart)}-${hex(funcEnd)}:`);
const funcRows = disassembleRange(funcStart, funcEnd);
printDisassembly(`Function ${hex(funcStart)}-${hex(funcEnd)}`, funcRows);

// -----------------------------------------------------------------------
// 2. Find callers of the parent function entry
// -----------------------------------------------------------------------

console.log(`--- Section 2: Callers of ${hex(funcStart)} ---\n`);

const callers = findCallers(funcStart);
if (callers.length === 0) {
  console.log(`  No CALL/JP references to ${hex(funcStart)} found in ROM.\n`);
  // Try a few alternative entry points
  for (const altEntry of [funcStart - 1, funcStart - 2, funcStart - 3, funcStart + 1, funcStart + 2, funcStart + 3]) {
    const altCallers = findCallers(altEntry);
    if (altCallers.length > 0) {
      console.log(`  Found ${altCallers.length} callers for alternate entry ${hex(altEntry)}:`);
      for (const c of altCallers) {
        console.log(`    ${hex(c.addr)}  ${c.mnemonic} ${hex(c.target)}`);
      }
      console.log('');
    }
  }
} else {
  console.log(`  Found ${callers.length} callers:`);
  for (const c of callers) {
    console.log(`    ${hex(c.addr)}  ${c.mnemonic} ${hex(c.target)}`);
    // Disassemble context around each caller
    const ctxStart = Math.max(0, c.addr - 16);
    const ctxEnd = Math.min(romBytes.length, c.addr + 16);
    const ctxRows = disassembleRange(ctxStart, ctxEnd);
    for (const row of ctxRows) {
      const marker = row.pc === c.addr ? ' >>>' : '    ';
      console.log(`      ${marker} ${hex(row.pc)}  ${row.bytes.padEnd(20)}  ${row.text}`);
    }
    console.log('');
  }
}

// Also check callers of 0x085D3B directly (in case the known address IS the entry)
console.log(`  Also checking callers of 0x085D3B directly:`);
const callers085D3B = findCallers(0x085D3B);
if (callers085D3B.length === 0) {
  console.log(`    No CALL/JP references to 0x085D3B found.\n`);
} else {
  console.log(`    Found ${callers085D3B.length} callers:`);
  for (const c of callers085D3B) {
    console.log(`    ${hex(c.addr)}  ${c.mnemonic} ${hex(c.target)}`);
  }
  console.log('');
}

// Also try 0x085D00 as the real function entry (the full disassembly starts there)
const FUNC_085D00 = 0x085D00;
console.log(`  Checking callers of 0x085D00:`);
const callers085D00 = findCallers(FUNC_085D00);
if (callers085D00.length === 0) {
  console.log(`    No CALL/JP references to 0x085D00 found.\n`);
} else {
  console.log(`    Found ${callers085D00.length} callers:`);
  for (const c of callers085D00) {
    console.log(`    ${hex(c.addr)}  ${c.mnemonic} ${hex(c.target)}`);
    const ctxStart = Math.max(0, c.addr - 16);
    const ctxEnd = Math.min(romBytes.length, c.addr + 16);
    const ctxRows = disassembleRange(ctxStart, ctxEnd);
    for (const row of ctxRows) {
      const marker = row.pc === c.addr ? ' >>>' : '    ';
      console.log(`      ${marker} ${hex(row.pc)}  ${row.bytes.padEnd(20)}  ${row.text}`);
    }
    console.log('');
  }
}

// Determine the best function entry: try 0x085D00 first, then funcStart, then 0x085D34
// Check which addresses have lifted blocks
const candidateEntries = [0x085D00, funcStart, 0x085D22, 0x085D34, 0x085D3F, 0x085D45];
console.log('  Checking which candidate entries have lifted blocks:');
{
  const { executor } = createRuntime();
  for (const entry of candidateEntries) {
    const key = blockKey(entry, 'adl');
    const has = typeof executor.compiledBlocks?.[key] === 'function';
    console.log(`    ${hex(entry)} -> ${has ? 'HAS BLOCK' : 'no block'}`);
  }
}
console.log('');

// -----------------------------------------------------------------------
// 3. Dynamic Test A: D02661=0x00 (bit 7 clear → JP Z should fire)
// -----------------------------------------------------------------------

// Use 0x085D00 as entry (the real function start visible in disassembly)
const dynEntry = 0x085D00;

console.log('--- Section 3: Dynamic Test A (D02661=0x00, bit 7 clear) ---\n');

{
  const { mem, executor, cpu } = createRuntime();
  seedCpu(cpu, mem, { pc: dynEntry });
  mem[STATE_BYTE_ADDR] = 0x00;
  const resultA = traceRun(cpu, executor, mem, 500, `Test A: PC=${hex(dynEntry)}, D02661=0x00 (bit 7 clear → JP Z fires)`);
  printRunResult(resultA, 500);
}

// -----------------------------------------------------------------------
// 4. Dynamic Test B: D02661=0x80 (bit 7 set → JP Z skips)
// -----------------------------------------------------------------------

console.log('--- Section 4: Dynamic Test B (D02661=0x80, bit 7 set) ---\n');

{
  const { mem, executor, cpu } = createRuntime();
  seedCpu(cpu, mem, { pc: dynEntry });
  mem[STATE_BYTE_ADDR] = 0x80;
  const resultB = traceRun(cpu, executor, mem, 500, `Test B: PC=${hex(dynEntry)}, D02661=0x80 (bit 7 set → JP Z skips)`);
  printRunResult(resultB, 500);
}

// -----------------------------------------------------------------------
// 5. Trace 0x086C45 sub-call
// -----------------------------------------------------------------------

console.log('--- Section 5: Trace 0x086C45 Sub-Call ---\n');

// Disassemble 0x086C45 region first
const subRows = disassembleRange(0x086C45, 0x086CA0);
printDisassembly('0x086C45 disassembly', subRows);

{
  const { mem, executor, cpu } = createRuntime();
  seedCpu(cpu, mem, { pc: CALL_086C45 });
  const resultSub = traceRun(cpu, executor, mem, 200, `Sub-call trace: PC=${hex(CALL_086C45)}, 200 steps`);
  printRunResult(resultSub, 200);
}

// -----------------------------------------------------------------------
// Summary
// -----------------------------------------------------------------------

console.log('--- Summary ---\n');
console.log(`  Parent function region: ${hex(funcStart)}-${hex(funcEnd)}`);
console.log(`  Key instruction chain:`);
console.log(`    0x085D3F: CALL 0x086C45`);
console.log(`    0x085D43: LD HL, 0xD02661`);
console.log(`    0x085D47: BIT 7, (HL)`);
console.log(`    0x085D4B: JP Z, 0x088586  (D02661 latch armer)`);
console.log(`  Callers of parent entry (${hex(funcStart)}): ${callers.length}`);
console.log(`  Callers of 0x085D3B: ${callers085D3B.length}`);
console.log(`  Callers of 0x085D00: ${callers085D00.length}`);
console.log('');
console.log('=== Phase 265 complete ===');

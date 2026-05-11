#!/usr/bin/env node
// Phase 297 — Trace 0x0AF29B: INC (HL) that increments D02662
//
// D02662 reaches value 0x03 by REPEATED INCREMENTS (not direct store).
// The 2-state predicate at 0x0AF877 checks D02661/D02662 mode state.
// This probe:
//   1. Lists transpiled blocks in 0x0AF2xx-0x0AF3xx to find function boundaries
//   2. Disassembles ROM bytes around 0x0AF29B to confirm instruction encoding
//   3. Searches ROM for CALL/JP instructions targeting 0x0AF2xx range
//   4. Dynamic trace: steps through from function entry, logging D02662
//   5. Traces save-then-clear (0x0AF273) and restore (0x0AF2BA) lifecycle

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

function hex(v, w = 6) {
  return '0x' + (v >>> 0).toString(16).padStart(w, '0');
}

function hexByte(b) {
  return b.toString(16).padStart(2, '0');
}

// ============================================================
// STEP 1: List transpiled blocks in 0x0AF200-0x0AF3FF range
// ============================================================
console.log('=== Step 1: Transpiled blocks in 0x0AF2xx-0x0AF3xx ===');

const rangeBlocks = [];
for (const key of Object.keys(BLOCKS)) {
  const addrStr = key.split(':')[0];
  const addr = parseInt(addrStr, 16);
  if (addr >= 0x0AF200 && addr <= 0x0AF3FF) {
    rangeBlocks.push({ key, addr });
  }
}
rangeBlocks.sort((a, b) => a.addr - b.addr);

console.log(`Found ${rangeBlocks.length} blocks in range:`);
for (const b of rangeBlocks) {
  const meta = BLOCKS[b.key];
  const exits = meta.exits ? meta.exits.map(e => `${hex(e.target)}(${e.type})`).join(', ') : 'none';
  console.log(`  ${b.key}: exits=[${exits}]`);
}
console.log();

// Also scan the wider 0x0AF1xx-0x0AF4xx range for function entry context
const widerBlocks = [];
for (const key of Object.keys(BLOCKS)) {
  const addrStr = key.split(':')[0];
  const addr = parseInt(addrStr, 16);
  if (addr >= 0x0AF100 && addr <= 0x0AF4FF) {
    widerBlocks.push({ key, addr });
  }
}
widerBlocks.sort((a, b) => a.addr - b.addr);

console.log(`Wider range (0x0AF1xx-0x0AF4xx): ${widerBlocks.length} blocks`);
for (const b of widerBlocks) {
  const meta = BLOCKS[b.key];
  const exits = meta.exits ? meta.exits.map(e => `${hex(e.target)}(${e.type})`).join(', ') : 'none';
  console.log(`  ${b.key}: exits=[${exits}]`);
}
console.log();

// ============================================================
// STEP 2: Disassemble ROM bytes around 0x0AF29B
// ============================================================
console.log('=== Step 2: ROM bytes around 0x0AF29B ===');

// Simple eZ80 disassembler for context
const SIMPLE_OPCODES = {
  0x00: 'NOP', 0x76: 'HALT', 0xC9: 'RET', 0xF3: 'DI', 0xFB: 'EI',
  0xAF: 'XOR A', 0xA7: 'AND A', 0xB7: 'OR A',
  0x3C: 'INC A', 0x3D: 'DEC A',
  0x34: 'INC (HL)', 0x35: 'DEC (HL)',
  0x23: 'INC HL', 0x2B: 'DEC HL',
  0x03: 'INC BC', 0x0B: 'DEC BC',
  0x13: 'INC DE', 0x1B: 'DEC DE',
  0x47: 'LD B,A', 0x4F: 'LD C,A', 0x57: 'LD D,A', 0x5F: 'LD E,A',
  0x67: 'LD H,A', 0x6F: 'LD L,A', 0x77: 'LD (HL),A',
  0x78: 'LD A,B', 0x79: 'LD A,C', 0x7A: 'LD A,D', 0x7B: 'LD A,E',
  0x7C: 'LD A,H', 0x7D: 'LD A,L', 0x7E: 'LD A,(HL)',
  0xC5: 'PUSH BC', 0xD5: 'PUSH DE', 0xE5: 'PUSH HL', 0xF5: 'PUSH AF',
  0xC1: 'POP BC', 0xD1: 'POP DE', 0xE1: 'POP HL', 0xF1: 'POP AF',
  0xEB: 'EX DE,HL',
};

function disasmAt(rom, addr) {
  if (addr < 0 || addr >= rom.length) return { text: '(out of bounds)', len: 1 };
  const b = rom[addr];

  // 4-byte instructions (opcode + 24-bit immediate)
  const fourByte = {
    0x01: 'LD BC', 0x11: 'LD DE', 0x21: 'LD HL', 0x31: 'LD SP',
    0x22: 'LD (nn),HL', 0x2A: 'LD HL,(nn)', 0x32: 'LD (nn),A', 0x3A: 'LD A,(nn)',
    0xCD: 'CALL', 0xC3: 'JP', 0xC2: 'JP NZ', 0xCA: 'JP Z',
    0xD2: 'JP NC', 0xDA: 'JP C',
  };
  if (fourByte[b] && addr + 3 < rom.length) {
    const imm = rom[addr+1] | (rom[addr+2] << 8) | (rom[addr+3] << 16);
    return { text: `${fourByte[b]},${hex(imm)}`, len: 4 };
  }

  // 2-byte relative jumps
  if (b === 0x18) { // JR d
    if (addr + 1 < rom.length) {
      const d = rom[addr+1];
      const offset = d < 128 ? d : d - 256;
      const target = addr + 2 + offset;
      return { text: `JR ${hex(target)}`, len: 2 };
    }
  }
  if (b === 0x20) { // JR NZ
    if (addr + 1 < rom.length) {
      const d = rom[addr+1];
      const offset = d < 128 ? d : d - 256;
      const target = addr + 2 + offset;
      return { text: `JR NZ,${hex(target)}`, len: 2 };
    }
  }
  if (b === 0x28) { // JR Z
    if (addr + 1 < rom.length) {
      const d = rom[addr+1];
      const offset = d < 128 ? d : d - 256;
      const target = addr + 2 + offset;
      return { text: `JR Z,${hex(target)}`, len: 2 };
    }
  }
  if (b === 0x30) { // JR NC
    if (addr + 1 < rom.length) {
      const d = rom[addr+1];
      const offset = d < 128 ? d : d - 256;
      const target = addr + 2 + offset;
      return { text: `JR NC,${hex(target)}`, len: 2 };
    }
  }
  if (b === 0x38) { // JR C
    if (addr + 1 < rom.length) {
      const d = rom[addr+1];
      const offset = d < 128 ? d : d - 256;
      const target = addr + 2 + offset;
      return { text: `JR C,${hex(target)}`, len: 2 };
    }
  }
  if (b === 0x10) { // DJNZ
    if (addr + 1 < rom.length) {
      const d = rom[addr+1];
      const offset = d < 128 ? d : d - 256;
      const target = addr + 2 + offset;
      return { text: `DJNZ ${hex(target)}`, len: 2 };
    }
  }

  // 2-byte instructions (opcode + immediate byte)
  const twoByte = {
    0x3E: 'LD A', 0xFE: 'CP', 0xE6: 'AND', 0xF6: 'OR', 0xEE: 'XOR',
    0xC6: 'ADD A', 0xD6: 'SUB', 0xCE: 'ADC A', 0xDE: 'SBC A',
    0x06: 'LD B', 0x0E: 'LD C', 0x16: 'LD D', 0x1E: 'LD E',
    0x26: 'LD H', 0x2E: 'LD L', 0x36: 'LD (HL)',
  };
  if (twoByte[b] && addr + 1 < rom.length) {
    return { text: `${twoByte[b]},0x${hexByte(rom[addr+1])}`, len: 2 };
  }

  // CB prefix (bit ops)
  if (b === 0xCB && addr + 1 < rom.length) {
    const op = rom[addr+1];
    const bitN = (op >> 3) & 7;
    const regNames = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
    const reg = regNames[op & 7];
    if (op >= 0x40 && op < 0x80) return { text: `BIT ${bitN},${reg}`, len: 2 };
    if (op >= 0x80 && op < 0xC0) return { text: `RES ${bitN},${reg}`, len: 2 };
    if (op >= 0xC0) return { text: `SET ${bitN},${reg}`, len: 2 };
    return { text: `CB ${hexByte(op)}`, len: 2 };
  }

  // 1-byte
  if (SIMPLE_OPCODES[b]) {
    return { text: SIMPLE_OPCODES[b], len: 1 };
  }

  return { text: `db 0x${hexByte(b)}`, len: 1 };
}

// Dump disassembly from addr for count bytes
function disasmRange(rom, startAddr, count) {
  let addr = startAddr;
  const end = startAddr + count;
  const lines = [];
  while (addr < end && addr < rom.length) {
    const raw = [];
    for (let i = 0; i < 4 && (addr + i) < rom.length; i++) {
      raw.push(hexByte(rom[addr + i]));
    }
    const { text, len } = disasmAt(rom, addr);
    const rawSlice = raw.slice(0, len).join(' ');
    lines.push({ addr, text, raw: rawSlice, len });
    addr += len;
  }
  return lines;
}

// Disassemble around 0x0AF260 - 0x0AF2E0 (the full function area)
const disasm = disasmRange(romBytes, 0x0AF260, 0xA0);
for (const line of disasm) {
  const marker = (line.addr === 0x0AF29B) ? ' <<<< INC (HL) target' :
                 (line.addr === 0x0AF273) ? ' <<<< save-then-clear' :
                 (line.addr === 0x0AF2BA) ? ' <<<< restore' : '';
  console.log(`  ${hex(line.addr)}: ${line.raw.padEnd(14)} ${line.text}${marker}`);
}
console.log();

// Confirm specific encoding at 0x0AF29B
console.log('=== Encoding confirmation at 0x0AF29B ===');
const bytes0AF29B = Array.from(romBytes.slice(0x0AF29B, 0x0AF29B + 8));
console.log(`  Raw bytes at 0x0AF29B: ${bytes0AF29B.map(hexByte).join(' ')}`);
console.log(`  Expected: 21 62 26 D0 (LD HL,0xD02662) then 34 (INC (HL))`);
const ldHL = bytes0AF29B[0] === 0x21 && bytes0AF29B[1] === 0x62 &&
             bytes0AF29B[2] === 0x26 && bytes0AF29B[3] === 0xD0;
const incHL = bytes0AF29B[4] === 0x34;
console.log(`  LD HL,0xD02662 match: ${ldHL}`);
console.log(`  INC (HL) match: ${incHL}`);
console.log();

// Confirm encoding at 0x0AF273 (save-then-clear)
console.log('=== Encoding confirmation at 0x0AF273 ===');
const bytes0AF273 = Array.from(romBytes.slice(0x0AF273, 0x0AF273 + 16));
console.log(`  Raw bytes at 0x0AF273: ${bytes0AF273.map(hexByte).join(' ')}`);
const disasm273 = disasmRange(romBytes, 0x0AF273, 16);
for (const line of disasm273) {
  console.log(`  ${hex(line.addr)}: ${line.raw.padEnd(14)} ${line.text}`);
}
console.log();

// Confirm encoding at 0x0AF2BA (restore)
console.log('=== Encoding confirmation at 0x0AF2BA ===');
const bytes0AF2BA = Array.from(romBytes.slice(0x0AF2BA, 0x0AF2BA + 16));
console.log(`  Raw bytes at 0x0AF2BA: ${bytes0AF2BA.map(hexByte).join(' ')}`);
const disasm2BA = disasmRange(romBytes, 0x0AF2BA, 16);
for (const line of disasm2BA) {
  console.log(`  ${hex(line.addr)}: ${line.raw.padEnd(14)} ${line.text}`);
}
console.log();

// ============================================================
// STEP 3: Search ROM for CALL/JP targeting 0x0AF2xx
// ============================================================
console.log('=== Step 3: CALL/JP instructions targeting 0x0AF2xx ===');

const callOps = [
  { opcode: 0xCD, name: 'CALL' },
  { opcode: 0xC3, name: 'JP' },
  { opcode: 0xC2, name: 'JP NZ' },
  { opcode: 0xCA, name: 'JP Z' },
  { opcode: 0xD2, name: 'JP NC' },
  { opcode: 0xDA, name: 'JP C' },
  { opcode: 0xC4, name: 'CALL NZ' },
  { opcode: 0xCC, name: 'CALL Z' },
  { opcode: 0xD4, name: 'CALL NC' },
  { opcode: 0xDC, name: 'CALL C' },
];

const callers = [];
for (let addr = 0; addr < romBytes.length - 3; addr++) {
  const b = romBytes[addr];
  const op = callOps.find(o => o.opcode === b);
  if (!op) continue;
  const target = romBytes[addr+1] | (romBytes[addr+2] << 8) | (romBytes[addr+3] << 16);
  if (target >= 0x0AF200 && target <= 0x0AF2FF) {
    callers.push({ addr, op: op.name, target });
  }
}

console.log(`Found ${callers.length} CALL/JP instructions targeting 0x0AF2xx:`);
for (const c of callers) {
  // Show a few bytes of context before the call
  const ctxStart = Math.max(0, c.addr - 8);
  const ctxDisasm = disasmRange(romBytes, ctxStart, c.addr - ctxStart + 4);
  console.log(`  ${hex(c.addr)}: ${c.op} ${hex(c.target)}`);
  for (const line of ctxDisasm) {
    const mark = line.addr === c.addr ? '>' : ' ';
    console.log(`    ${mark} ${hex(line.addr)}: ${line.raw.padEnd(14)} ${line.text}`);
  }
  console.log();
}

// Also search for calls to specific block entries found in step 1
const blockEntries = rangeBlocks.map(b => b.addr);
console.log('=== Callers of specific block entries ===');
for (const entry of blockEntries) {
  const entryCalls = [];
  for (let addr = 0; addr < romBytes.length - 3; addr++) {
    const b = romBytes[addr];
    const op = callOps.find(o => o.opcode === b);
    if (!op) continue;
    const target = romBytes[addr+1] | (romBytes[addr+2] << 8) | (romBytes[addr+3] << 16);
    if (target === entry) {
      entryCalls.push({ addr, op: op.name });
    }
  }
  if (entryCalls.length > 0) {
    console.log(`  ${hex(entry)} called by ${entryCalls.length} sites:`);
    for (const c of entryCalls) {
      console.log(`    ${hex(c.addr)}: ${c.op} ${hex(entry)}`);
    }
  }
}
console.log();

// ============================================================
// STEP 4: Dynamic trace from function entry
// ============================================================
console.log('=== Step 4: Dynamic trace ===');

// Set up executor
const MEM_SIZE = 0x1000000;
const mem = new Uint8Array(MEM_SIZE);
mem.set(romBytes, 0);

const peripherals = createPeripheralBus({ timerInterrupt: false });
const { cpu, compiledBlocks, blockMeta, runFrom } = createExecutor(BLOCKS, mem, {
  peripherals,
});

// Find the best function entry point. Look for the first block at or before 0x0AF29B.
// We want to start at the function entry, not in the middle.
let functionEntry = null;
for (const b of rangeBlocks) {
  if (b.addr <= 0x0AF29B) {
    functionEntry = b.addr;
  }
}

// Also check if there's a block that matches a CALL target (most likely the function entry)
const callTargets = callers.map(c => c.target);
const likelyEntry = callTargets.find(t => rangeBlocks.some(b => b.addr === t));

if (likelyEntry) {
  console.log(`Function entry from CALL analysis: ${hex(likelyEntry)}`);
  functionEntry = likelyEntry;
} else if (functionEntry) {
  console.log(`Function entry from block scan: ${hex(functionEntry)}`);
} else {
  console.log('ERROR: Could not determine function entry');
}

if (functionEntry) {
  // Initialize D02662 to 0x00
  mem[0xD02662] = 0x00;
  mem[0xD02661] = 0x00;

  // Set up a reasonable stack
  cpu.sp = 0xD1A87E;
  // Push a return address so RET has somewhere to go
  const SENTINEL_RET = 0xFFFFFF;
  cpu.sp -= 3;
  mem[cpu.sp] = SENTINEL_RET & 0xFF;
  mem[cpu.sp + 1] = (SENTINEL_RET >> 8) & 0xFF;
  mem[cpu.sp + 2] = (SENTINEL_RET >> 16) & 0xFF;

  console.log(`Starting trace from ${hex(functionEntry)}, D02662=${hex(mem[0xD02662], 2)}, SP=${hex(cpu.sp)}`);
  console.log();

  const blockLog = [];
  const d02662Log = [];

  const result = runFrom(functionEntry, 'adl', {
    maxSteps: 500,
    maxLoopIterations: 20,
    onBlock: (pc, mode, meta, step) => {
      const d02662Val = mem[0xD02662];
      const d02661Val = mem[0xD02661];
      const aVal = cpu.a;
      const fVal = cpu.f;
      const hlVal = cpu.hl;
      blockLog.push({ step, pc, mode, d02662: d02662Val, d02661: d02661Val, a: aVal, f: fVal, hl: hlVal });

      // Log when D02662 changes
      if (d02662Log.length === 0 || d02662Log[d02662Log.length - 1].val !== d02662Val) {
        d02662Log.push({ step, pc, val: d02662Val });
      }
    },
    onLoopBreak: (pc, mode, count, target) => {
      console.log(`  LOOP BREAK at ${hex(pc)} after ${count} iterations → ${target ? hex(target) : 'carry-force'}`);
    },
    onMissingBlock: (pc, mode, step) => {
      console.log(`  MISSING BLOCK at ${hex(pc)} (step ${step})`);
    },
  });

  console.log(`Trace completed: ${result.steps} steps, termination=${result.termination}`);
  console.log(`  Final D02662=${hex(mem[0xD02662], 2)}, D02661=${hex(mem[0xD02661], 2)}`);
  console.log(`  Loops forced: ${result.loopsForced}`);
  if (result.missingBlocks?.length > 0) {
    console.log(`  Missing blocks: ${result.missingBlocks.join(', ')}`);
  }
  console.log();

  console.log('--- Block-by-block trace (first 100 steps) ---');
  for (const entry of blockLog.slice(0, 100)) {
    console.log(`  step=${String(entry.step).padStart(4)} pc=${hex(entry.pc)} D02662=${hex(entry.d02662, 2)} D02661=${hex(entry.d02661, 2)} A=${hex(entry.a, 2)} F=${hex(entry.f, 2)} HL=${hex(entry.hl)}`);
  }
  if (blockLog.length > 100) {
    console.log(`  ... (${blockLog.length - 100} more steps)`);
  }
  console.log();

  console.log('--- D02662 value changes ---');
  for (const entry of d02662Log) {
    console.log(`  step=${String(entry.step).padStart(4)} pc=${hex(entry.pc)} D02662 → ${hex(entry.val, 2)}`);
  }
  console.log();

  // Count visits to each block
  const visits = result.blockVisits || {};
  const sortedVisits = Object.entries(visits).sort((a, b) => b[1] - a[1]);
  console.log('--- Block visit counts (top 20) ---');
  for (const [key, count] of sortedVisits.slice(0, 20)) {
    console.log(`  ${key}: ${count} visits`);
  }
  console.log();
}

// ============================================================
// STEP 5: Trace save/clear (0x0AF273) and restore (0x0AF2BA)
// ============================================================
console.log('=== Step 5: Save/clear and restore lifecycle ===');

// Find the function that contains 0x0AF273 — look for the nearest block entry at or before it
let saveClearEntry = null;
for (const b of widerBlocks) {
  if (b.addr <= 0x0AF273) {
    saveClearEntry = b.addr;
  }
}

if (saveClearEntry) {
  console.log(`Save/clear function entry: ${hex(saveClearEntry)}`);

  // Reset state
  const mem2 = new Uint8Array(MEM_SIZE);
  mem2.set(romBytes, 0);
  const peripherals2 = createPeripheralBus({ timerInterrupt: false });
  const exec2 = createExecutor(BLOCKS, mem2, { peripherals: peripherals2 });

  // Pre-set D02662 to 0x05 to see save/clear/restore
  mem2[0xD02662] = 0x05;
  mem2[0xD02661] = 0x83;

  exec2.cpu.sp = 0xD1A87E;
  exec2.cpu.sp -= 3;
  mem2[exec2.cpu.sp] = 0xFF;
  mem2[exec2.cpu.sp + 1] = 0xFF;
  mem2[exec2.cpu.sp + 2] = 0xFF;

  console.log(`Pre-set D02662=0x05, D02661=0x83`);

  const saveLog = [];
  const result2 = exec2.runFrom(saveClearEntry, 'adl', {
    maxSteps: 300,
    maxLoopIterations: 20,
    onBlock: (pc, mode, meta, step) => {
      const d02662Val = mem2[0xD02662];
      saveLog.push({ step, pc, d02662: d02662Val, a: exec2.cpu.a, sp: exec2.cpu.sp });
    },
    onMissingBlock: (pc, mode, step) => {
      console.log(`  MISSING BLOCK at ${hex(pc)} (step ${step})`);
    },
    onLoopBreak: (pc, mode, count, target) => {
      console.log(`  LOOP BREAK at ${hex(pc)} after ${count} iterations`);
    },
  });

  console.log(`Save/clear trace: ${result2.steps} steps, termination=${result2.termination}`);
  console.log(`  Final D02662=${hex(mem2[0xD02662], 2)}`);
  console.log();

  console.log('--- Save/clear block trace (first 60 steps) ---');
  for (const entry of saveLog.slice(0, 60)) {
    console.log(`  step=${String(entry.step).padStart(4)} pc=${hex(entry.pc)} D02662=${hex(entry.d02662, 2)} A=${hex(entry.a, 2)} SP=${hex(entry.sp)}`);
  }
  console.log();
}

// ============================================================
// STEP 6: Broader function context — find what 0x0AF2xx belongs to
// ============================================================
console.log('=== Step 6: Function boundary analysis ===');

// Look at blocks that EXIT INTO the 0x0AF2xx range (i.e., jump/call to it)
const externalCallers = [];
for (const key of Object.keys(BLOCKS)) {
  const addrStr = key.split(':')[0];
  const addr = parseInt(addrStr, 16);
  if (addr >= 0x0AF200 && addr <= 0x0AF3FF) continue; // skip blocks within the range

  const meta = BLOCKS[key];
  if (!meta.exits) continue;
  for (const exit of meta.exits) {
    if (exit.target >= 0x0AF200 && exit.target <= 0x0AF3FF) {
      externalCallers.push({ from: key, fromAddr: addr, target: exit.target, type: exit.type });
    }
  }
}

console.log(`External blocks that jump/call into 0x0AF2xx-0x0AF3xx: ${externalCallers.length}`);
for (const c of externalCallers) {
  console.log(`  ${c.from} → ${hex(c.target)} (${c.type})`);
}
console.log();

// Also find where blocks in 0x0AF2xx exit TO (outside the range)
const externalExits = [];
for (const b of rangeBlocks) {
  const meta = BLOCKS[b.key];
  if (!meta.exits) continue;
  for (const exit of meta.exits) {
    if (exit.target < 0x0AF200 || exit.target > 0x0AF3FF) {
      externalExits.push({ from: b.key, target: exit.target, type: exit.type });
    }
  }
}

console.log(`Blocks in range that exit outside: ${externalExits.length}`);
for (const e of externalExits) {
  console.log(`  ${e.from} → ${hex(e.target)} (${e.type})`);
}
console.log();

// ============================================================
// STEP 7: Summary — the D02662 lifecycle
// ============================================================
console.log('=== Step 7: Summary — D02662 lifecycle ===');
console.log();
console.log('FUNCTION at 0x0AF26D (called from 0x0AF25F):');
console.log('  This is the "catalog/list display" loop that processes menu items.');
console.log();
console.log('STRUCTURE (from static disassembly):');
console.log('  0x0AF26D: LD A,(D02662)        — read current D02662 value');
console.log('  0x0AF271: PUSH AF               — save it on stack');
console.log('  0x0AF272: XOR A                 — A = 0');
console.log('  0x0AF273: LD (D02662),A         — CLEAR D02662 to 0x00');
console.log('  0x0AF277: LD A,0x01');
console.log('  0x0AF279: LD (D00595),A         — D00595 = 1 (loop counter start)');
console.log('  --- LOOP TOP at 0x0AF27D ---');
console.log('  0x0AF27D: SUB A (=XOR equiv)    — A = 0');
console.log('  0x0AF27E: LD (D00596),A         — D00596 = 0');
console.log('  0x0AF282: LD A,(D00595)         — read loop counter');
console.log('  0x0AF286: CALL 0x0AF69B         — process/check item');
console.log('  0x0AF28A: INC A                 — A = returned count + 1');
console.log('  0x0AF28B: LD HL,D00595');
console.log('  0x0AF28F: CP (HL)               — compare with D00595 (counter)');
console.log('  0x0AF290: JR Z,0x0AF2A2         — if equal, EXIT loop');
console.log('  0x0AF292: CALL 0x0AF2BF         — display one list item');
console.log('  0x0AF296: LD HL,D00595');
console.log('  0x0AF29A: INC (HL)              — D00595++ (counter)');
console.log('  0x0AF29B: LD HL,D02662');
console.log('  0x0AF29F: INC (HL)              — D02662++ (increments ONCE per iteration)');
console.log('  0x0AF2A0: JR 0x0AF27D           — loop back');
console.log('  --- LOOP EXIT at 0x0AF2A2 ---');
console.log('  0x0AF2A2-0x0AF2B8: finalization calls');
console.log('  0x0AF2B9: POP AF                — restore saved D02662');
console.log('  0x0AF2BA: LD (D02662),A         — RESTORE D02662 to original value');
console.log('  0x0AF2BE: RET');
console.log();
console.log('KEY FINDINGS:');
console.log('  1. D02662 increments ONCE per loop iteration (0->1->2->3->...)');
console.log('  2. The value is SAVED before the loop and RESTORED after');
console.log('  3. So the loop TEMPORARILY uses D02662 as a counter');
console.log('  4. The final value of D02662 after the function returns');
console.log('     is the SAME as before the call (save/restore pattern)');
console.log('  5. D02662 reaching 0x03 during loop = 3 items processed');
console.log('  6. The predicate at 0x0AF877 checks D02662==0x03 DURING');
console.log('     the loop (called at 0x0AF2E7 inside 0x0AF2BF subroutine),');
console.log('     not after the loop completes');
console.log('  7. Only external caller: 0x0886F4 CALL 0x0AF2EE');
console.log('     (which enters the function at 0x0AF2ED/0x0AF2EE,');
console.log('     slightly past the save/clear, so it gets the tail path)');
console.log();
console.log('CALLER: 0x0886F4 (CALL 0x0AF2EE)');
console.log('  This enters at 0x0AF2EE which is the POP AF + continued path,');
console.log('  NOT the save-then-clear entry at 0x0AF26D.');
console.log('  Block 0x0AF25F calls 0x0AF26D (the full save/loop/restore path).');
console.log('  Block 0x0886E9 calls 0x0AF2EE (enters mid-function, after loop).');
console.log();

console.log('=== Done ===');

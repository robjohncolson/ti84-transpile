#!/usr/bin/env node
// Phase 229 — Trace computed dispatch for jump table at 0x0213C0
//
// The table has 40 entries, each a 4-byte JP instruction (C3 xx xx xx).
// Entry [12] at 0x0213F0 targets 0x023B67 with ZERO direct callers.
// Goal: find the code that computes an entry index and dispatches through the table.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { decodeInstruction } from './ez80-decoder.js';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');

const rom = fs.readFileSync(ROM_PATH);
const romModule = await import(pathToFileURL(TRANSPILED_PATH).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS ?? {};

const TABLE_BASE = 0x0213C0;
const TABLE_ENTRIES = 40;
const TABLE_ENTRY_SIZE = 4;
const TABLE_END = TABLE_BASE + TABLE_ENTRIES * TABLE_ENTRY_SIZE;
const ROM_LIMIT = 0x400000;
const MEM_SIZE = 0x1000000;
const JP_STUB_BASE = 0x020104;
const SENTINEL = 0x7FFFFE;

function hex(v, w = 6) {
  return '0x' + (Number(v) >>> 0).toString(16).padStart(w, '0');
}

function read24(buf, off) {
  return (buf[off] | (buf[off + 1] << 8) | (buf[off + 2] << 16)) & 0xffffff;
}

function bytesToHex(buf, start, len) {
  const parts = [];
  for (let i = 0; i < len && start + i < buf.length; i++) {
    parts.push(buf[start + i].toString(16).padStart(2, '0'));
  }
  return parts.join(' ');
}

function disasmRange(startAddr, count) {
  const lines = [];
  let pc = startAddr;
  for (let i = 0; i < count && pc < ROM_LIMIT; i++) {
    try {
      const d = decodeInstruction(rom, pc, 'adl');
      if (!d || !d.length || d.length <= 0) {
        lines.push(`  ${hex(pc)}: ${bytesToHex(rom, pc, 4).padEnd(20)} ???`);
        pc++;
        continue;
      }
      const raw = bytesToHex(rom, pc, d.length);
      const mn = d.mnemonic ?? d.tag ?? '???';
      let ops = '';
      if (d.dst !== undefined && d.src !== undefined) ops = `${d.dst}, ${d.src}`;
      else if (d.dst !== undefined) ops = `${d.dst}`;
      else if (d.src !== undefined) ops = `${d.src}`;
      else if (d.target !== undefined) ops = hex(d.target);
      else if (d.imm !== undefined) ops = hex(d.imm);
      lines.push(`  ${hex(pc)}: ${raw.padEnd(20)} ${mn} ${ops}`);
      pc = d.nextPc ?? (pc + d.length);
    } catch (e) {
      lines.push(`  ${hex(pc)}: ${bytesToHex(rom, pc, 4).padEnd(20)} [error: ${e.message}]`);
      pc++;
    }
  }
  return lines;
}

console.log('=== Phase 229: Trace computed dispatch for jump table 0x0213C0 ===\n');

// ============================================================
// Part 1: Dump the jump table
// ============================================================
console.log('--- Part 1: Jump table at 0x0213C0 (40 entries) ---');
for (let i = 0; i < TABLE_ENTRIES; i++) {
  const addr = TABLE_BASE + i * TABLE_ENTRY_SIZE;
  const target = read24(rom, addr + 1);
  console.log(`  [${String(i).padStart(2)}] ${hex(addr)}: JP ${hex(target)}`);
}

// ============================================================
// Part 2: Static reference search
// ============================================================
console.log('\n--- Part 2: Static references to C0 13 02 in ROM ---');
let refCount = 0;
for (let addr = 0; addr < ROM_LIMIT - 2; addr++) {
  if (rom[addr] === 0xc0 && rom[addr + 1] === 0x13 && rom[addr + 2] === 0x02) {
    if (addr >= TABLE_BASE && addr < TABLE_END) continue;
    const prev = addr > 0 ? rom[addr - 1] : 0;
    console.log(`  ${hex(addr - 1)}: prev=${hex(prev, 2)} ${bytesToHex(rom, Math.max(0, addr - 4), 10)}`);
    refCount++;
  }
}
console.log(`  Total: ${refCount} (zero means no direct reference to table base)`);

// ============================================================
// Part 3: The table is part of the contiguous JP stub region
// ============================================================
console.log('\n--- Part 3: Contiguous JP stub region ---');

let regionStart = TABLE_BASE;
while (regionStart >= 4 && rom[regionStart - 4] === 0xc3) regionStart -= 4;

let regionEnd = TABLE_END;
while (regionEnd + 3 < ROM_LIMIT && rom[regionEnd] === 0xc3) regionEnd += 4;

const totalStubs = (regionEnd - regionStart) / 4;
const ourStartIdx = (TABLE_BASE - regionStart) / 4;

console.log(`  Region: ${hex(regionStart)} - ${hex(regionEnd)} (${totalStubs} JP stub entries)`);
console.log(`  Our 40 entries start at stub index ${ourStartIdx}`);
console.log(`  Region starts at JP_STUB_BASE? ${regionStart === JP_STUB_BASE ? 'YES' : 'NO (' + hex(regionStart) + ')'}`);

// ============================================================
// Part 4: Bcall dispatch chain
// ============================================================
console.log('\n--- Part 4: Bcall dispatch chain ---');
console.log('  RST 28h (EF) at 0x000028:');
for (const l of disasmRange(0x000028, 4)) console.log('    ' + l.trim());

console.log('  Handler at 0x02011C:');
for (const l of disasmRange(0x02011C, 2)) console.log('    ' + l.trim());

console.log('  0x04AB69:');
for (const l of disasmRange(0x04AB69, 2)) console.log('    ' + l.trim());

console.log('  Actual bcall handler at 0x0003AC:');
for (const l of disasmRange(0x0003AC, 40)) console.log('    ' + l.trim());

// ============================================================
// Part 5: Map all 40 entries to bcall IDs and find RST 28h callers
// ============================================================
console.log('\n--- Part 5: Bcall IDs and RST 28h callers for all 40 entries ---');
console.log('  Formula: bcall_id = (entry_addr - 0x020104) / 4');
console.log('  Dispatch: EF <id_lo> <id_hi> -> 0x020104 + id * 4 -> JP target\n');

const allBcallCallers = new Map();

for (let i = 0; i < TABLE_ENTRIES; i++) {
  const entryAddr = TABLE_BASE + i * TABLE_ENTRY_SIZE;
  const target = read24(rom, entryAddr + 1);
  const bcallId = (entryAddr - JP_STUB_BASE) / 4;
  const idLo = bcallId & 0xff;
  const idHi = (bcallId >> 8) & 0xff;

  const callerAddrs = [];
  for (let addr = 0; addr < ROM_LIMIT - 2; addr++) {
    if (rom[addr] === 0xef && rom[addr + 1] === idLo && rom[addr + 2] === idHi) {
      // Filter false positives: check if EF is actually an RST 28h
      // vs. being the low byte of a 3-byte address in a CALL/JP instruction.
      // A 4-byte CALL/JP is: opcode(1) addr_lo(1) addr_mid(1) addr_hi(1)
      // So if EF is addr_lo, the opcode is at addr-1.
      // If EF is addr_mid, the opcode is at addr-2.
      // If EF is addr_hi, the opcode is at addr-3.
      const CALL_JP_OPCODES = new Set([
        0xcd, 0xc3, 0xc2, 0xca, 0xd2, 0xda, 0xe2, 0xea,
        0xf2, 0xfa, 0xc4, 0xcc, 0xd4, 0xdc,
      ]);
      let isFalsePositive = false;
      // Check if 1 byte before is a CALL/JP opcode (EF would be addr_lo)
      if (addr >= 1 && CALL_JP_OPCODES.has(rom[addr - 1])) isFalsePositive = true;
      // Check if 2 bytes before (EF would be addr_mid)
      if (addr >= 2 && CALL_JP_OPCODES.has(rom[addr - 2])) isFalsePositive = true;
      // Check if 3 bytes before (EF would be addr_hi)
      if (addr >= 3 && CALL_JP_OPCODES.has(rom[addr - 3])) isFalsePositive = true;
      // Also skip if inside the JP stub region (all C3 xx xx xx)
      if (addr >= regionStart && addr < regionEnd) isFalsePositive = true;
      if (isFalsePositive) continue;
      callerAddrs.push(addr);
    }
  }

  allBcallCallers.set(i, { bcallId, callerAddrs });
  const callersStr = callerAddrs.length > 0
    ? callerAddrs.slice(0, 5).map(a => hex(a)).join(', ') + (callerAddrs.length > 5 ? '...' : '')
    : 'NONE';
  console.log(`  [${String(i).padStart(2)}] bcall(${hex(bcallId, 4)}) -> ${hex(target)}: ${callerAddrs.length} callers [${callersStr}]`);
}

// ============================================================
// Part 6: Disassemble call sites for entry [12]
// ============================================================
const entry12Info = allBcallCallers.get(12);
console.log(`\n--- Part 6: Call sites for entry [12] (bcall ${hex(entry12Info.bcallId, 4)}) ---`);

if (entry12Info.callerAddrs.length > 0) {
  for (const callerAddr of entry12Info.callerAddrs) {
    console.log(`\n  Call site at ${hex(callerAddr)}:`);
    const lines = disasmRange(Math.max(0, callerAddr - 16), 20);
    for (const l of lines) console.log('    ' + l.trim());
  }
} else {
  console.log('  No RST 28h callers found. Searching alternatives...');

  // Search for CALL/JP to entry address or target
  const entryAddr = TABLE_BASE + 12 * TABLE_ENTRY_SIZE;
  const target = read24(rom, entryAddr + 1);

  for (let addr = 0; addr < ROM_LIMIT - 3; addr++) {
    if (addr >= TABLE_BASE && addr < TABLE_END) continue;
    const op = rom[addr];
    if ((op === 0xcd || op === 0xc3) && read24(rom, addr + 1) === target) {
      console.log(`  ${hex(addr)}: ${op === 0xcd ? 'CALL' : 'JP'} ${hex(target)}`);
    }
  }
}

// ============================================================
// Part 7: Disassemble the target function at 0x023B67
// ============================================================
console.log('\n--- Part 7: Target function at 0x023B67 ---');
for (const l of disasmRange(0x023B67, 30)) console.log(l);

// ============================================================
// Part 8: Dynamic trace
// ============================================================
console.log('\n--- Part 8: Dynamic traces ---');

function buildRuntime() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(rom.subarray(0, ROM_LIMIT));
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  return { mem, executor, cpu: executor.cpu };
}

function runTrace(entryPC, setupFn, maxSteps = 50) {
  const { mem, executor, cpu } = buildRuntime();

  // Push sentinel return address
  cpu.sp = 0xD1A87E;
  cpu.sp -= 3;
  mem[cpu.sp] = SENTINEL & 0xff;
  mem[cpu.sp + 1] = (SENTINEL >> 8) & 0xff;
  mem[cpu.sp + 2] = (SENTINEL >> 16) & 0xff;

  if (setupFn) setupFn(cpu, mem);

  const pcLog = [];
  const origStep = executor.runFrom;

  // Use runFrom with block-level tracing
  try {
    const result = executor.runFrom(entryPC, 'adl', {
      maxSteps,
      maxLoopIterations: 1000,
      onBlock: (pc) => {
        pcLog.push(pc);
        if (pc === SENTINEL) return false; // stop
      },
    });
    return { pcLog, cpu, mem, result };
  } catch (e) {
    pcLog.push(`ERROR: ${e.message}`);
    return { pcLog, cpu, mem, result: null };
  }
}

// Trace 1: Direct jump to entry [12]
console.log('\n  Trace 1: Direct JP to entry [12] at 0x0213F0:');
try {
  const { pcLog, cpu } = runTrace(0x0213F0, null, 20);
  console.log(`    Block PCs visited: ${pcLog.slice(0, 10).map(p => typeof p === 'string' ? p : hex(p)).join(' -> ')}`);
  console.log(`    Final PC: ${hex(cpu.pc)}`);
} catch (e) {
  console.log(`    Error: ${e.message}`);
}

// Trace 2: If we found bcall callers for entry [12], execute from context
if (entry12Info.callerAddrs.length > 0) {
  const site = entry12Info.callerAddrs[0];
  console.log(`\n  Trace 2: Execute from bcall caller at ${hex(site)}:`);
  try {
    const { pcLog, cpu } = runTrace(site, null, 50);
    console.log(`    Block PCs visited: ${pcLog.slice(0, 15).map(p => typeof p === 'string' ? p : hex(p)).join(' -> ')}`);
    console.log(`    Final PC: ${hex(cpu.pc)}`);
  } catch (e) {
    console.log(`    Error: ${e.message}`);
  }
}

// ============================================================
// Summary
// ============================================================
console.log('\n=== FINAL SUMMARY ===\n');
console.log('DISPATCH MECHANISM:');
console.log('  RST 28h (opcode EF) + 2-byte LE bcall ID');
console.log('  -> handler at 0x0003AC (via 0x000028 -> 0x02011C -> 0x04AB69 -> 0x0003AC)');
console.log('  -> computes JP stub address = 0x020104 + bcall_id * 4');
console.log('  -> JP stub entry (C3 xx xx xx) jumps to the target function');
console.log('');
console.log('TABLE AT 0x0213C0:');
console.log(`  Part of contiguous JP stub region: ${hex(regionStart)} - ${hex(regionEnd)} (${totalStubs} entries)`);
const firstBcallId = (TABLE_BASE - JP_STUB_BASE) / 4;
const lastBcallId = firstBcallId + TABLE_ENTRIES - 1;
console.log(`  Bcall IDs ${hex(firstBcallId, 4)} (${firstBcallId}) through ${hex(lastBcallId, 4)} (${lastBcallId})`);
console.log('');
console.log('ENTRY [12] -> 0x023B67:');
console.log(`  Bcall ID: ${hex(entry12Info.bcallId, 4)} (${entry12Info.bcallId})`);
console.log(`  RST 28h callers: ${entry12Info.callerAddrs.length}`);
if (entry12Info.callerAddrs.length > 0) {
  console.log(`  Call sites: ${entry12Info.callerAddrs.map(a => hex(a)).join(', ')}`);
}
console.log('');

const zeroCaller = [...allBcallCallers.values()].filter(v => v.callerAddrs.length === 0).length;
console.log(`Entries with 0 bcall callers: ${zeroCaller} of ${TABLE_ENTRIES}`);
console.log('\nDone.');

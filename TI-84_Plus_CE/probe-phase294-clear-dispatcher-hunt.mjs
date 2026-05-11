#!/usr/bin/env node

import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

process.emitWarning = () => {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { decodeInstruction } = await import('./ez80-decoder.js');

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const rom = readFileSync(ROM_PATH);

// ── Constants ──

const D0058C = 0xD0058C;
const CLEAR_SCAN_CODE = 0x28;
const SEARCH_START = 0x020000;
const SEARCH_END = 0x0B0000;

const DISPATCH_ADDRS = [
  0x0258DA, 0x02659C, 0x0269DB, 0x06C83F, 0x074D65, 0x080E76,
  0x0859AA, 0x088657, 0x08B13F, 0x08C4E9, 0x0A584C, 0x0B3733,
  0x0B630D, 0x0B6ADB,
];

// ── Helpers ──

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function upper(s) {
  return String(s ?? '').toUpperCase();
}

function bytesToHex(bytes) {
  return Array.from(bytes, (v) => v.toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

function formatIndexed(indexRegister, displacement) {
  const mag = hex(Math.abs(displacement), 2);
  const sign = displacement < 0 ? '-' : '+';
  return `(${upper(indexRegister)}${sign}${mag})`;
}

function formatInstruction(inst) {
  if (!inst) return { mnemonic: 'UNKNOWN', operands: '' };
  switch (inst.tag) {
    case 'indexed-cb-bit':
      return { mnemonic: 'BIT', operands: `${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}` };
    case 'indexed-cb-set':
      return { mnemonic: 'SET', operands: `${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}` };
    case 'indexed-cb-res':
      return { mnemonic: 'RES', operands: `${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}` };
    case 'alu-reg':
      return { mnemonic: upper(inst.op), operands: upper(inst.src) };
    case 'alu-imm':
      return { mnemonic: upper(inst.op), operands: hexByte(inst.value) };
    case 'alu-ixd':
      return { mnemonic: upper(inst.op), operands: formatIndexed(inst.indexRegister, inst.displacement) };
    case 'ld-mem-reg':
      return { mnemonic: 'LD', operands: `(${hex(inst.addr)}), ${upper(inst.src)}` };
    case 'ld-mem-pair':
      return { mnemonic: 'LD', operands: `(${hex(inst.addr)}), ${upper(inst.pair)}` };
    case 'ld-reg-mem':
      return { mnemonic: 'LD', operands: `${upper(inst.dest ?? inst.dst)}, (${hex(inst.addr)})` };
    case 'ld-reg-imm':
      return { mnemonic: 'LD', operands: `${upper(inst.dest ?? inst.dst)}, ${hexByte(inst.value)}` };
    case 'ld-reg-reg':
      return { mnemonic: 'LD', operands: `${upper(inst.dest ?? inst.dst)}, ${upper(inst.src)}` };
    case 'ld-pair-imm':
      return { mnemonic: 'LD', operands: `${upper(inst.pair)}, ${hex(inst.value)}` };
    case 'ld-pair-mem':
      return inst.direction === 'from-mem'
        ? { mnemonic: 'LD', operands: `${upper(inst.pair)}, (${hex(inst.addr)})` }
        : { mnemonic: 'LD', operands: `(${hex(inst.addr)}), ${upper(inst.pair)}` };
    case 'ld-ind-reg':
      return { mnemonic: 'LD', operands: `(${upper(inst.pair)}), ${upper(inst.src)}` };
    case 'ld-reg-ind':
      return { mnemonic: 'LD', operands: `${upper(inst.dest ?? inst.dst)}, (${upper(inst.pair)})` };
    case 'ld-ind-imm':
      return { mnemonic: 'LD', operands: `(${upper(inst.pair)}), ${hexByte(inst.value)}` };
    case 'ld-ixd-reg':
      return { mnemonic: 'LD', operands: `${formatIndexed(inst.indexRegister, inst.displacement)}, ${upper(inst.src)}` };
    case 'ld-reg-ixd':
      return { mnemonic: 'LD', operands: `${upper(inst.dest)}, ${formatIndexed(inst.indexRegister, inst.displacement)}` };
    case 'ld-ixd-imm':
      return { mnemonic: 'LD', operands: `${formatIndexed(inst.indexRegister, inst.displacement)}, ${hexByte(inst.value)}` };
    case 'ld-sp-hl':
      return { mnemonic: 'LD', operands: 'SP, HL' };
    case 'push':
      return { mnemonic: 'PUSH', operands: upper(inst.pair) };
    case 'pop':
      return { mnemonic: 'POP', operands: upper(inst.pair) };
    case 'call':
      return { mnemonic: 'CALL', operands: hex(inst.target) };
    case 'call-conditional':
      return { mnemonic: 'CALL', operands: `${upper(inst.condition)}, ${hex(inst.target)}` };
    case 'jp':
      return { mnemonic: 'JP', operands: hex(inst.target) };
    case 'jp-conditional':
      return { mnemonic: 'JP', operands: `${upper(inst.condition)}, ${hex(inst.target)}` };
    case 'jp-indirect':
      return { mnemonic: 'JP', operands: `(${upper(inst.indirectRegister ?? 'HL')})` };
    case 'jr':
      return { mnemonic: 'JR', operands: hex(inst.target) };
    case 'jr-conditional':
      return { mnemonic: 'JR', operands: `${upper(inst.condition)}, ${hex(inst.target)}` };
    case 'djnz':
      return { mnemonic: 'DJNZ', operands: hex(inst.target) };
    case 'ret':
      return { mnemonic: 'RET', operands: '' };
    case 'ret-conditional':
      return { mnemonic: 'RET', operands: upper(inst.condition) };
    case 'rst':
      return { mnemonic: 'RST', operands: hexByte(inst.target ?? inst.vector) };
    case 'inc-reg':
      return { mnemonic: 'INC', operands: upper(inst.reg) };
    case 'dec-reg':
      return { mnemonic: 'DEC', operands: upper(inst.reg) };
    case 'inc-pair':
      return { mnemonic: 'INC', operands: upper(inst.pair) };
    case 'dec-pair':
      return { mnemonic: 'DEC', operands: upper(inst.pair) };
    case 'inc-ixd':
      return { mnemonic: 'INC', operands: formatIndexed(inst.indexRegister, inst.displacement) };
    case 'dec-ixd':
      return { mnemonic: 'DEC', operands: formatIndexed(inst.indexRegister, inst.displacement) };
    case 'add-pair':
      return { mnemonic: 'ADD', operands: `${upper(inst.dest)}, ${upper(inst.src)}` };
    case 'nop':
      return { mnemonic: 'NOP', operands: '' };
    case 'halt':
      return { mnemonic: 'HALT', operands: '' };
    case 'di':
      return { mnemonic: 'DI', operands: '' };
    case 'ei':
      return { mnemonic: 'EI', operands: '' };
    case 'ex-af':
      return { mnemonic: "EX AF, AF'", operands: '' };
    case 'exx':
      return { mnemonic: 'EXX', operands: '' };
    case 'ex-de-hl':
      return { mnemonic: 'EX DE, HL', operands: '' };
    case 'ex-sp-hl':
      return { mnemonic: 'EX (SP), HL', operands: '' };
    case 'scf':
      return { mnemonic: 'SCF', operands: '' };
    case 'ccf':
      return { mnemonic: 'CCF', operands: '' };
    case 'cpl':
      return { mnemonic: 'CPL', operands: '' };
    case 'daa':
      return { mnemonic: 'DAA', operands: '' };
    case 'rlca':
      return { mnemonic: 'RLCA', operands: '' };
    case 'rrca':
      return { mnemonic: 'RRCA', operands: '' };
    case 'rla':
      return { mnemonic: 'RLA', operands: '' };
    case 'rra':
      return { mnemonic: 'RRA', operands: '' };
    case 'out-imm':
      return { mnemonic: 'OUT', operands: `(${hexByte(inst.port)}), A` };
    case 'in-imm':
      return { mnemonic: 'IN', operands: `A, (${hexByte(inst.port)})` };
    case 'in-reg':
      return { mnemonic: 'IN', operands: `${upper(inst.dest)}, (C)` };
    case 'in0':
      return { mnemonic: 'IN0', operands: `${upper(inst.dest)}, (${hexByte(inst.port)})` };
    case 'bit-test':
      return { mnemonic: 'BIT', operands: `${inst.bit}, ${upper(inst.reg)}` };
    case 'bit-set':
      return { mnemonic: 'SET', operands: `${inst.bit}, ${upper(inst.reg)}` };
    case 'bit-res':
      return { mnemonic: 'RES', operands: `${inst.bit}, ${upper(inst.reg)}` };
    case 'bit-test-ind':
      return { mnemonic: 'BIT', operands: `${inst.bit}, (HL)` };
    case 'bit-res-ind':
      return { mnemonic: 'RES', operands: `${inst.bit}, (HL)` };
    case 'bit-set-ind':
      return { mnemonic: 'SET', operands: `${inst.bit}, (HL)` };
    case 'rotate-reg':
      return { mnemonic: upper(inst.op), operands: upper(inst.reg) };
    case 'rotate-ind':
      return { mnemonic: upper(inst.op), operands: '(HL)' };
    case 'indexed-cb-rotate':
      return { mnemonic: upper(inst.op), operands: formatIndexed(inst.indexRegister, inst.displacement) };
    default:
      return { mnemonic: upper(inst.tag ?? 'UNKNOWN'), operands: '' };
  }
}

function fmtRow(pc, inst) {
  const len = Math.max(1, inst?.length ?? 1);
  const bytes = bytesToHex(rom.subarray(pc, pc + len));
  const f = formatInstruction(inst);
  return { pc, len, inst, bytes, mnemonic: f.mnemonic, operands: f.operands };
}

function printRow(row) {
  const ops = row.operands ? ` ${row.operands}` : '';
  return `  ${hex(row.pc)}  ${row.bytes.padEnd(18)}  ${row.mnemonic}${ops}`;
}

function isTerminator(tag) {
  return ['ret', 'jp', 'jp-indirect', 'halt'].includes(tag);
}

function disassembleLinear(startPc, maxInstructions = 150) {
  const rows = [];
  let pc = startPc;
  for (let i = 0; i < maxInstructions; i++) {
    if (pc < 0 || pc >= rom.length) break;
    const inst = decodeInstruction(rom, pc, 'adl');
    const len = Math.max(1, inst?.length ?? 1);
    rows.push(fmtRow(pc, inst));
    if (isTerminator(inst?.tag)) break;
    pc += len;
  }
  return rows;
}

function disassembleForce(startPc, count) {
  const rows = [];
  let pc = startPc;
  for (let i = 0; i < count; i++) {
    if (pc < 0 || pc >= rom.length) break;
    const inst = decodeInstruction(rom, pc, 'adl');
    const len = Math.max(1, inst?.length ?? 1);
    rows.push(fmtRow(pc, inst));
    pc += len;
  }
  return rows;
}

// ── Analysis: trace backward from a CP instruction to find where A was loaded ──

function traceASourceBackward(cpAddr, maxBack = 40) {
  // Decode instructions backward from cpAddr to find the last instruction that set A.
  // We scan backward by trying offsets 1..6 at each step.
  const instructions = [];
  let pc = cpAddr;

  // First, collect instructions by scanning forward from well before cpAddr
  const scanStart = Math.max(0, cpAddr - maxBack * 6);
  const allInstructions = [];
  let cursor = scanStart;
  while (cursor < cpAddr + 10) {
    const inst = decodeInstruction(rom, cursor, 'adl');
    const len = Math.max(1, inst?.length ?? 1);
    allInstructions.push({ pc: cursor, inst, len });
    cursor += len;
  }

  // Filter to instructions before cpAddr, sorted by PC
  const before = allInstructions.filter(i => i.pc < cpAddr);

  // Walk backward through the instruction list to find what set A
  for (let i = before.length - 1; i >= 0 && i >= before.length - maxBack; i--) {
    const entry = before[i];
    const tag = entry.inst?.tag;
    if (!tag) continue;

    // LD A, (addr)
    if (tag === 'ld-reg-mem' && (entry.inst.dest === 'a' || entry.inst.dst === 'a')) {
      return { source: 'memory', addr: entry.inst.addr, pc: entry.pc, isD0058C: entry.inst.addr === D0058C };
    }
    // LD A, imm
    if (tag === 'ld-reg-imm' && (entry.inst.dest === 'a' || entry.inst.dst === 'a')) {
      return { source: 'immediate', value: entry.inst.value, pc: entry.pc, isD0058C: false };
    }
    // LD A, reg
    if (tag === 'ld-reg-reg' && (entry.inst.dest === 'a' || entry.inst.dst === 'a')) {
      return { source: 'register', reg: entry.inst.src, pc: entry.pc, isD0058C: false };
    }
    // LD A, (pair)
    if (tag === 'ld-reg-ind' && (entry.inst.dest === 'a' || entry.inst.dst === 'a')) {
      return { source: 'indirect', pair: entry.inst.pair, pc: entry.pc, isD0058C: false };
    }
    // LD A, (IX/IY+d)
    if (tag === 'ld-reg-ixd' && entry.inst.dest === 'a') {
      return { source: 'indexed', reg: entry.inst.indexRegister, disp: entry.inst.displacement, pc: entry.pc, isD0058C: false };
    }
    // POP AF
    if (tag === 'pop' && entry.inst.pair === 'af') {
      return { source: 'stack (POP AF)', pc: entry.pc, isD0058C: false };
    }
    // EX AF, AF'
    if (tag === 'ex-af') {
      return { source: "EX AF,AF'", pc: entry.pc, isD0058C: false };
    }
    // ALU ops that modify A (not CP which only tests)
    if (['alu-imm', 'alu-reg'].includes(tag) && entry.inst.op !== 'cp') {
      return { source: `ALU ${entry.inst.op}`, pc: entry.pc, isD0058C: false };
    }
    // CALL (A may be modified by the call)
    if (tag === 'call' || tag === 'call-conditional') {
      return { source: `CALL ${hex(entry.inst.target)}`, pc: entry.pc, isD0058C: false };
    }
    // RET — can't trace further
    if (tag === 'ret' || tag === 'ret-conditional') {
      return { source: 'RET (boundary)', pc: entry.pc, isD0058C: false };
    }
    // IN
    if (tag === 'in-imm' || (tag === 'in-reg' && entry.inst.dest === 'a')) {
      return { source: `IN port`, pc: entry.pc, isD0058C: false };
    }
  }

  return { source: 'unknown (too far back)', pc: null, isD0058C: false };
}

// ── Check if an address is near a known dispatcher ──

function nearestDispatcher(addr) {
  let best = null;
  let bestDist = Infinity;
  for (const d of DISPATCH_ADDRS) {
    const dist = Math.abs(addr - d);
    if (dist < bestDist) {
      bestDist = dist;
      best = d;
    }
  }
  return { dispatcher: best, distance: bestDist };
}

// ══════════════════════════════════════════════════════════
// PART 1: Deep analysis of 0x08C4E9 dispatcher and its CP 0x28
// ══════════════════════════════════════════════════════════

console.log('# Phase 294: CLEAR (scan code 0x28) Dispatcher Hunt');
console.log('');
console.log('## Part 1: Deep analysis of dispatcher 0x08C4E9');
console.log('');

// Disassemble a wide region around 0x08C4E9 to understand the full flow
console.log('### 1a. Disassembly of 0x08C4E9 region (60 instructions before, 80 after):');
console.log('');

const regionStart08C4 = Math.max(0, 0x08C4E9 - 200);
const regionRows08C4 = disassembleForce(regionStart08C4, 140);

for (const row of regionRows08C4) {
  const marker = row.pc === 0x08C4E9 ? ' <<<< DISPATCHER ENTRY (LD A,(D0058C))' : '';
  console.log(printRow(row) + marker);
}
console.log('');

// Find all CP 0x28 within the region
const cp28Hits08C4 = regionRows08C4.filter(
  r => r.inst?.tag === 'alu-imm' && r.inst.op === 'cp' && r.inst.value === 0x28
);

console.log(`### 1b. CP 0x28 instructions found in 0x08C4E9 region: ${cp28Hits08C4.length}`);
console.log('');

for (const hit of cp28Hits08C4) {
  console.log(`  CP 0x28 at ${hex(hit.pc)}`);

  // Trace backward to find source of A
  const aSource = traceASourceBackward(hit.pc);
  console.log(`  Source of A: ${JSON.stringify(aSource)}`);

  // Look at what follows the CP
  const afterRows = disassembleForce(hit.pc + hit.len, 5);
  console.log('  Instructions after CP 0x28:');
  for (const row of afterRows) {
    console.log('    ' + printRow(row));
  }

  if (aSource.isD0058C) {
    console.log('  ** A WAS LOADED FROM D0058C -- this IS a scan code comparison! **');

    // Find the branch target for the Z condition (match)
    const nextInst = afterRows[0];
    if (nextInst?.inst?.tag === 'jr-conditional' && nextInst.inst.condition === 'z') {
      console.log(`  On match (CLEAR): JR Z to ${hex(nextInst.inst.target)}`);
      console.log('  Tracing CLEAR handler:');
      const handlerRows = disassembleLinear(nextInst.inst.target, 60);
      for (const row of handlerRows) {
        console.log('    ' + printRow(row));
      }
    } else if (nextInst?.inst?.tag === 'jp-conditional' && nextInst.inst.condition === 'z') {
      console.log(`  On match (CLEAR): JP Z to ${hex(nextInst.inst.target)}`);
      console.log('  Tracing CLEAR handler:');
      const handlerRows = disassembleLinear(nextInst.inst.target, 60);
      for (const row of handlerRows) {
        console.log('    ' + printRow(row));
      }
    }
  }
  console.log('');
}

// ══════════════════════════════════════════════════════════
// PART 2: ROM-wide scan for FE 28 (CP 0x28) in dispatcher range
// ══════════════════════════════════════════════════════════

console.log('## Part 2: ROM-wide scan for FE 28 (CP 0x28) in range 0x020000-0x0B0000');
console.log('');

const fe28Hits = [];
for (let offset = SEARCH_START; offset < SEARCH_END - 1; offset++) {
  if (rom[offset] === 0xFE && rom[offset + 1] === 0x28) {
    fe28Hits.push(offset);
  }
}

console.log(`Total FE 28 byte pattern hits: ${fe28Hits.length}`);
console.log('');

// For each hit, analyze context
for (const hitAddr of fe28Hits) {
  const aSource = traceASourceBackward(hitAddr);
  const nearest = nearestDispatcher(hitAddr);
  const isNearDispatcher = nearest.distance < 0x300;
  const marker = aSource.isD0058C ? '** SCAN CODE MATCH **' :
    (isNearDispatcher ? `(near dispatcher ${hex(nearest.dispatcher)}, dist=${nearest.distance})` : '');

  console.log(`--- CP 0x28 at ${hex(hitAddr)} ${marker}`);
  console.log(`  A source: ${JSON.stringify(aSource)}`);

  // Decode 5 instructions before and 5 after
  const contextBefore = [];
  let scanPc = Math.max(0, hitAddr - 30);
  while (scanPc < hitAddr) {
    const inst = decodeInstruction(rom, scanPc, 'adl');
    const len = Math.max(1, inst?.length ?? 1);
    if (scanPc + len > hitAddr && scanPc !== hitAddr) {
      scanPc++;
      continue;
    }
    contextBefore.push(fmtRow(scanPc, inst));
    scanPc += len;
  }
  // Keep last 8 instructions before
  const beforeSlice = contextBefore.slice(-8);

  console.log('  Before:');
  for (const row of beforeSlice) {
    console.log('    ' + printRow(row));
  }

  console.log('  >> CP 0x28 <<');
  const afterContext = disassembleForce(hitAddr, 8);
  console.log('  At + After:');
  for (const row of afterContext) {
    console.log('    ' + printRow(row));
  }

  // If A came from D0058C, this is a real scan-code dispatcher for CLEAR
  if (aSource.isD0058C) {
    console.log('');
    console.log('  *** THIS IS A CLEAR (0x28) SCAN CODE HANDLER ***');

    // Find branch target for Z (match)
    const afterCpInst = decodeInstruction(rom, hitAddr + 2, 'adl');
    if (afterCpInst?.tag === 'jr-conditional' && afterCpInst.condition === 'z') {
      console.log(`  Branch on match: JR Z -> ${hex(afterCpInst.target)}`);
      console.log('  Handler disassembly:');
      const handler = disassembleLinear(afterCpInst.target, 80);
      for (const row of handler) {
        console.log('    ' + printRow(row));
      }
    } else if (afterCpInst?.tag === 'jp-conditional' && afterCpInst.condition === 'z') {
      console.log(`  Branch on match: JP Z -> ${hex(afterCpInst.target)}`);
      console.log('  Handler disassembly:');
      const handler = disassembleLinear(afterCpInst.target, 80);
      for (const row of handler) {
        console.log('    ' + printRow(row));
      }
    } else if (afterCpInst?.tag === 'jr-conditional' && afterCpInst.condition === 'nz') {
      // NZ branch means: if NOT 0x28, skip. Fall-through IS the handler.
      console.log(`  Branch on NON-match: JR NZ -> ${hex(afterCpInst.target)} (fall-through = CLEAR handler)`);
      console.log('  CLEAR handler (fall-through):');
      const handler = disassembleLinear(afterCpInst.nextPc, 80);
      for (const row of handler) {
        console.log('    ' + printRow(row));
      }
    } else if (afterCpInst?.tag === 'jp-conditional' && afterCpInst.condition === 'nz') {
      console.log(`  Branch on NON-match: JP NZ -> ${hex(afterCpInst.target)} (fall-through = CLEAR handler)`);
      console.log('  CLEAR handler (fall-through):');
      const handler = disassembleLinear(afterCpInst.nextPc, 80);
      for (const row of handler) {
        console.log('    ' + printRow(row));
      }
    } else {
      console.log(`  Next instruction after CP: ${afterCpInst?.tag} (unexpected pattern)`);
    }
  }

  console.log('');
}

// ══════════════════════════════════════════════════════════
// PART 3: Check all 14 dispatchers for CP 0x28 with A from D0058C
// ══════════════════════════════════════════════════════════

console.log('## Part 3: All 14 dispatchers - CP cascade with D0058C source tracking');
console.log('');

for (const dispAddr of DISPATCH_ADDRS) {
  // Scan a region around the dispatcher for CP instructions
  const scanStart = Math.max(0, dispAddr - 0x80);
  const scanEnd = Math.min(rom.length, dispAddr + 0x200);
  const cpHits = [];

  for (let offset = scanStart; offset < scanEnd - 1; offset++) {
    if (rom[offset] === 0xFE) {
      const cpValue = rom[offset + 1];
      const aSource = traceASourceBackward(offset);
      cpHits.push({ addr: offset, value: cpValue, aSource });
    }
  }

  const has28 = cpHits.filter(h => h.value === 0x28);
  const has28FromD0058C = has28.filter(h => h.aSource.isD0058C);

  if (has28.length > 0) {
    console.log(`Dispatcher ${hex(dispAddr)}:`);
    for (const h of has28) {
      console.log(`  CP 0x28 at ${hex(h.addr)} - A from: ${JSON.stringify(h.aSource)}`);
      if (h.aSource.isD0058C) {
        console.log('  ** CONFIRMED: compares scan code from D0058C against 0x28 (CLEAR) **');
      }
    }
    console.log('');
  }
}

// ══════════════════════════════════════════════════════════
// PART 4: Summary
// ══════════════════════════════════════════════════════════

console.log('## Part 4: Summary');
console.log('');

// Collect all confirmed CLEAR handlers
const confirmedClearHandlers = [];
for (const hitAddr of fe28Hits) {
  const aSource = traceASourceBackward(hitAddr);
  if (aSource.isD0058C) {
    confirmedClearHandlers.push({ addr: hitAddr, aSource });
  }
}

if (confirmedClearHandlers.length === 0) {
  console.log('NO CP 0x28 instructions were found that compare A loaded from D0058C.');
  console.log('');
  console.log('This means CLEAR (scan code 0x28) is NOT handled by a simple CP cascade');
  console.log('that reads D0058C directly. Possible explanations:');
  console.log('  (a) CLEAR is handled via a jump table or indirect dispatch');
  console.log('  (b) The scan code is loaded into a different register first, then transferred to A');
  console.log('  (c) The scan code is processed through a lookup table before comparison');
  console.log('  (d) CLEAR is handled by the default/fallthrough path of a dispatcher');
} else {
  console.log(`Found ${confirmedClearHandlers.length} CP 0x28 instruction(s) that compare scan code from D0058C:`);
  for (const h of confirmedClearHandlers) {
    const nearest = nearestDispatcher(h.addr);
    console.log(`  ${hex(h.addr)} (near dispatcher ${hex(nearest.dispatcher)}, distance=${nearest.distance})`);
  }
}

console.log('');
console.log('Done.');

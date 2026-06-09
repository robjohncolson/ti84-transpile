#!/usr/bin/env node

/**
 * Phase 581: Decode 0x06ADC9 & 0x06ADD1 — Graph CALC Result Handlers
 *
 * Session 580 decoded 0x06CF41 (multi-key dispatcher, 271B, 85 insns).
 * Keys 0x89 and 0x8B share JP target 0x06ADC9.
 * Key 0x8D (MODE) dispatches to 0x06ADD1.
 *
 * Both are part of a larger function group rooted at 0x06AD91
 * (shared entry for graph CALC menu result handlers).
 *
 * This probe:
 *   1. Disassembles the function group: 0x06AD7E..0x06AEB8
 *   2. Disassembles helpers: 0x06ADF5, 0x06AE05, 0x06AE96, 0x06AE9D
 *   3. Disassembles exit stub: 0x06C8AB
 *   4. Identifies CALL/JP targets, RAM refs, IY+offset ops
 *   5. Counts callers of both entry points in full 4MB ROM
 *   6. Dumps the string table at 0x06AEB9..0x06AF4F
 */

import fs from 'node:fs';
import { decodeInstruction } from './ez80-decoder.js';

const ROM_SIZE = 0x400000;

function hex(v, w = 6) {
  return '0x' + v.toString(16).toUpperCase().padStart(w, '0');
}

function hexByte(v) {
  return '0x' + (v & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

function formatInstruction(inst) {
  if (!inst) return '(decode error)';

  switch (inst.tag) {
    case 'nop': return 'NOP';
    case 'halt': return 'HALT';
    case 'di': return 'DI';
    case 'ei': return 'EI';
    case 'exx': return 'EXX';
    case 'ex-af': return "EX AF, AF'";
    case 'ex-de-hl': return 'EX DE, HL';
    case 'ret': return 'RET';
    case 'reti': return 'RETI';
    case 'retn': return 'RETN';
    case 'ret-conditional': return `RET ${String(inst.condition).toUpperCase()}`;
    case 'push': return `PUSH ${String(inst.pair).toUpperCase()}`;
    case 'pop': return `POP ${String(inst.pair).toUpperCase()}`;

    case 'jp': return `JP ${hex(inst.target)}`;
    case 'jp-conditional': return `JP ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jp-hl': return 'JP (HL)';
    case 'jp-indirect': return `JP (${String(inst.indirectRegister).toUpperCase()})`;
    case 'jr': return `JR ${hex(inst.target)}`;
    case 'jr-conditional': return `JR ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'djnz': return `DJNZ ${hex(inst.target)}`;
    case 'call': return `CALL ${hex(inst.target)}`;
    case 'call-conditional': return `CALL ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'rst': return `RST ${hexByte(inst.target)}`;

    case 'ld-reg-reg': return `LD ${String(inst.dest).toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    case 'ld-reg-imm': return `LD ${String(inst.dest).toUpperCase()}, ${hex(inst.value, inst.value > 0xFF ? 6 : 2)}`;
    case 'ld-reg-mem': return `LD ${String(inst.dest).toUpperCase()}, (${hex(inst.addr)})`;
    case 'ld-mem-reg': return `LD (${hex(inst.addr)}), ${String(inst.src).toUpperCase()}`;
    case 'ld-pair-imm': return `LD ${String(inst.pair).toUpperCase()}, ${hex(inst.value, 6)}`;
    case 'ld-pair-mem': {
      const pfx = inst.modePrefix ? ' [.SIS]' : '';
      if (inst.direction === 'to-mem') return `LD (${hex(inst.addr, inst.modePrefix ? 4 : 6)}), ${String(inst.pair).toUpperCase()}${pfx}`;
      return `LD ${String(inst.pair).toUpperCase()}, (${hex(inst.addr, inst.modePrefix ? 4 : 6)})${pfx}`;
    }
    case 'ld-reg16-imm': return `LD ${String(inst.dest).toUpperCase()}, ${hex(inst.value, 6)}`;
    case 'ld-sp-hl': return 'LD SP, HL';
    case 'ld-ind-reg': return `LD (${String(inst.dest).toUpperCase()}), ${String(inst.src).toUpperCase()}`;
    case 'ld-reg-ind': return `LD ${String(inst.dest).toUpperCase()}, (${String(inst.src || inst.pair || 'HL').toUpperCase()})`;
    case 'ld-a-indirect': return `LD A, (${String(inst.reg).toUpperCase()})`;
    case 'ld-indirect-a': return `LD (${String(inst.reg).toUpperCase()}), A`;

    case 'ld-index-imm': return `LD ${String(inst.indexRegister).toUpperCase()}, ${hex(inst.value, 6)}`;
    case 'ld-indexed-imm': return `LD (${String(inst.indexRegister).toUpperCase()}+${inst.displacement}), ${hexByte(inst.value)}`;
    case 'ld-indexed-reg': return `LD (${String(inst.indexRegister).toUpperCase()}+${inst.displacement}), ${String(inst.src).toUpperCase()}`;
    case 'ld-reg-indexed': return `LD ${String(inst.dest).toUpperCase()}, (${String(inst.indexRegister).toUpperCase()}+${inst.displacement})`;

    case 'inc-reg': return `INC ${String(inst.reg).toUpperCase()}`;
    case 'dec-reg': return `DEC ${String(inst.reg).toUpperCase()}`;
    case 'inc-pair': return `INC ${String(inst.pair).toUpperCase()}`;
    case 'dec-pair': return `DEC ${String(inst.pair).toUpperCase()}`;

    case 'alu-reg': return `${String(inst.op).toUpperCase()} ${String(inst.src).toUpperCase()}`;
    case 'alu-imm': return `${String(inst.op).toUpperCase()} ${hexByte(inst.value)}`;

    case 'or-reg': return `OR ${String(inst.src).toUpperCase()}`;
    case 'and-reg': return `AND ${String(inst.src).toUpperCase()}`;
    case 'xor-reg': return `XOR ${String(inst.src).toUpperCase()}`;
    case 'cp-reg': return `CP ${String(inst.src).toUpperCase()}`;
    case 'or-imm': return `OR ${hexByte(inst.value)}`;
    case 'and-imm': return `AND ${hexByte(inst.value)}`;
    case 'cp-imm': return `CP ${hexByte(inst.value)}`;

    case 'add-hl-reg16': return `ADD HL, ${String(inst.src).toUpperCase()}`;

    case 'bit-test': return `BIT ${inst.bit}, ${String(inst.reg).toUpperCase()}`;
    case 'bit-set': return `SET ${inst.bit}, ${String(inst.reg).toUpperCase()}`;
    case 'bit-res': return `RES ${inst.bit}, ${String(inst.reg).toUpperCase()}`;

    case 'indexed-cb-bit': return `BIT ${inst.bit}, (${String(inst.indexRegister).toUpperCase()}+${inst.displacement})`;
    case 'indexed-cb-set': return `SET ${inst.bit}, (${String(inst.indexRegister).toUpperCase()}+${inst.displacement})`;
    case 'indexed-cb-res': return `RES ${inst.bit}, (${String(inst.indexRegister).toUpperCase()}+${inst.displacement})`;

    case 'rlca': return 'RLCA';
    case 'rrca': return 'RRCA';
    case 'rla': return 'RLA';
    case 'rra': return 'RRA';
    case 'daa': return 'DAA';
    case 'cpl': return 'CPL';
    case 'scf': return 'SCF';
    case 'ccf': return 'CCF';
    case 'neg': return 'NEG';

    case 'ldi': return 'LDI';
    case 'ldir': return 'LDIR';

    default: {
      let s = inst.tag;
      if (inst.target !== undefined) s += ` target=${hex(inst.target)}`;
      if (inst.value !== undefined) s += ` val=${hex(inst.value, 2)}`;
      if (inst.addr !== undefined) s += ` addr=${hex(inst.addr)}`;
      if (inst.dest !== undefined) s += ` dest=${String(inst.dest).toUpperCase()}`;
      if (inst.src !== undefined) s += ` src=${String(inst.src).toUpperCase()}`;
      if (inst.reg !== undefined) s += ` reg=${String(inst.reg).toUpperCase()}`;
      if (inst.bit !== undefined) s += ` bit=${inst.bit}`;
      if (inst.indexRegister !== undefined) s += ` idx=${String(inst.indexRegister).toUpperCase()}`;
      if (inst.displacement !== undefined) s += ` disp=${inst.displacement}`;
      return s;
    }
  }
}

// --- Main ---

const rom = fs.readFileSync('TI-84_Plus_CE/ROM.rom');

console.log(`=== Phase 581: Decode 0x06ADC9 & 0x06ADD1 — Graph CALC Result Handlers ===\n`);
console.log(`Context: 0x06CF41 multi-key dispatcher sends:`);
console.log(`  Key 0x89 → JP Z, 0x06ADC9`);
console.log(`  Key 0x8B → JR Z to same JP → 0x06ADC9`);
console.log(`  Key 0x8D → JP Z, 0x06ADD1\n`);

// 1. Disassemble the function group from 0x06AD7E to 0x06AEB8
const REGIONS = [
  { name: 'Function group (entries + shared core)', start: 0x06AD7E, end: 0x06AEB9 },
];

const subCalls = [];
const jpTargets = [];
const ramRefs = new Map();
const iyOps = [];

for (const region of REGIONS) {
  console.log(`\n--- Disassembly: ${region.name} (${hex(region.start)}..${hex(region.end - 1)}) ---\n`);

  let pc = region.start;
  while (pc < region.end) {
    const inst = decodeInstruction(rom, pc, 'adl');
    if (!inst || !inst.length) {
      // Check for string data
      if (rom[pc] >= 0x20 && rom[pc] <= 0x7E) {
        let s = '';
        let sp = pc;
        while (sp < region.end && rom[sp] >= 0x20 && rom[sp] <= 0x7E) {
          s += String.fromCharCode(rom[sp]);
          sp++;
        }
        if (sp < region.end && rom[sp] === 0x00) {
          s += '\\0';
          sp++;
        }
        console.log(`  ${hex(pc)}  STRING "${s}" (${sp - pc} bytes)`);
        pc = sp;
        continue;
      }
      console.log(`  ${hex(pc)}  ${rom[pc].toString(16).toUpperCase().padStart(2, '0')}                   DB ${hexByte(rom[pc])}`);
      pc += 1;
      continue;
    }

    const len = inst.length;
    const rawBytes = [...rom.subarray(pc, pc + len)]
      .map(b => b.toString(16).toUpperCase().padStart(2, '0'))
      .join(' ');
    const text = formatInstruction(inst);

    console.log(`  ${hex(pc)}  ${rawBytes.padEnd(20)} ${text}`);

    // Track CALL targets
    if (inst.tag === 'call' || inst.tag === 'call-conditional') {
      subCalls.push({ pc, target: inst.target, text });
    }

    // Track JP targets
    if (inst.tag === 'jp' || inst.tag === 'jp-conditional') {
      jpTargets.push({ pc, target: inst.target, text, conditional: inst.tag === 'jp-conditional' });
    }

    // Track RAM refs (addresses >= 0xD00000)
    const addrs = [inst.addr, inst.target, inst.value].filter(
      v => typeof v === 'number' && v >= 0xD00000
    );
    for (const a of addrs) {
      if (!ramRefs.has(a)) ramRefs.set(a, []);
      ramRefs.get(a).push({ pc, text });
    }

    // Track IY+ operations
    if (inst.indexRegister === 'iy' && inst.displacement !== undefined) {
      iyOps.push({ pc, text, offset: inst.displacement });
    }

    pc += len;
  }
}

// 2. String table dump
console.log(`\n--- String Table (0x06AEB9..0x06AF4F) ---\n`);

function readStr(addr) {
  let s = '';
  while (rom[addr] !== 0 && addr < rom.length) {
    s += String.fromCharCode(rom[addr]);
    addr++;
  }
  return { str: s, end: addr + 1 }; // +1 for NUL
}

const stringAddrs = [
  0x06AEB9, 0x06AEC0, 0x06AEC8, 0x06AED0, 0x06AEDD,
  0x06AEEA, 0x06AEF8, 0x06AF05, 0x06AF12, 0x06AF1E,
  0x06AF2B, 0x06AF32, 0x06AF37, 0x06AF46,
];

for (const a of stringAddrs) {
  const { str } = readStr(a);
  console.log(`  ${hex(a)}: "${str}"`);
}

// 3. Exit stub at 0x06C8AB
console.log(`\n--- Exit stub 0x06C8AB ---\n`);
{
  let pc = 0x06C8AB;
  for (let i = 0; i < 5; i++) {
    const inst = decodeInstruction(rom, pc, 'adl');
    if (!inst || !inst.length) break;
    const len = inst.length;
    const rawBytes = [...rom.subarray(pc, pc + len)]
      .map(b => b.toString(16).toUpperCase().padStart(2, '0'))
      .join(' ');
    console.log(`  ${hex(pc)}  ${rawBytes.padEnd(20)} ${formatInstruction(inst)}`);
    if (inst.tag === 'ret' || inst.tag === 'jp') break;
    pc += len;
  }
}

// 4. Helpers at 0x06AF6C and 0x06AF70
console.log(`\n--- Helper 0x06AF6C (read graph config var) ---\n`);
{
  let pc = 0x06AF6C;
  for (let i = 0; i < 10; i++) {
    const inst = decodeInstruction(rom, pc, 'adl');
    if (!inst || !inst.length) break;
    const len = inst.length;
    const rawBytes = [...rom.subarray(pc, pc + len)]
      .map(b => b.toString(16).toUpperCase().padStart(2, '0'))
      .join(' ');
    console.log(`  ${hex(pc)}  ${rawBytes.padEnd(20)} ${formatInstruction(inst)}`);

    if (inst.indexRegister === 'iy' && inst.displacement !== undefined) {
      iyOps.push({ pc, text: formatInstruction(inst), offset: inst.displacement });
    }
    const addrs2 = [inst.addr, inst.target, inst.value].filter(v => typeof v === 'number' && v >= 0xD00000);
    for (const a of addrs2) {
      if (!ramRefs.has(a)) ramRefs.set(a, []);
      ramRefs.get(a).push({ pc, text: formatInstruction(inst) });
    }

    if (inst.tag === 'ret' || inst.tag === 'jp') break;
    pc += len;
  }
}

// 5. Scan for callers of 0x06ADC9 and 0x06ADD1
console.log(`\n--- Callers/jumpers ---\n`);

function findRefs(target) {
  const lo = target & 0xFF;
  const mid = (target >> 8) & 0xFF;
  const hi = (target >> 16) & 0xFF;
  const refs = [];
  const condCallOps = [0xC4, 0xCC, 0xD4, 0xDC, 0xE4, 0xEC, 0xF4, 0xFC];
  const condJpOps = [0xC2, 0xCA, 0xD2, 0xDA, 0xE2, 0xEA, 0xF2, 0xFA];
  for (let i = 0; i < rom.length - 3; i++) {
    if (rom[i + 1] === lo && rom[i + 2] === mid && rom[i + 3] === hi) {
      if (rom[i] === 0xCD) refs.push({ offset: i, type: 'CALL' });
      else if (rom[i] === 0xC3) refs.push({ offset: i, type: 'JP' });
      else if (condCallOps.includes(rom[i])) refs.push({ offset: i, type: 'CALL cc' });
      else if (condJpOps.includes(rom[i])) refs.push({ offset: i, type: 'JP cc' });
    }
  }
  return refs.sort((a, b) => a.offset - b.offset);
}

for (const target of [0x06ADC9, 0x06ADD1]) {
  const refs = findRefs(target);
  console.log(`  ${hex(target)}: ${refs.length} reference(s)`);
  for (const r of refs) {
    console.log(`    ${hex(r.offset)}: ${r.type} ${hex(target)}`);
  }
}

// 6. Summary
console.log(`\n--- CALL targets ---\n`);
for (const c of subCalls) {
  console.log(`  ${hex(c.pc)}: ${c.text}`);
}

console.log(`\n--- JP targets ---\n`);
for (const j of jpTargets) {
  console.log(`  ${hex(j.pc)}: ${j.text}${j.conditional ? ' (conditional)' : ' (unconditional)'}`);
}

console.log(`\n--- RAM references (>= 0xD00000) ---\n`);
const sortedRam = [...ramRefs.entries()].sort((a, b) => a[0] - b[0]);
for (const [addr, refs] of sortedRam) {
  console.log(`  ${hex(addr)} (${refs.length} ref${refs.length > 1 ? 's' : ''}):`);
  for (const r of refs) {
    console.log(`    ${hex(r.pc)}: ${r.text}`);
  }
}

console.log(`\n--- IY+ operations ---\n`);
const uniqueIY = new Map();
for (const op of iyOps) {
  const key = `IY+${op.offset}`;
  if (!uniqueIY.has(key)) uniqueIY.set(key, []);
  uniqueIY.get(key).push(op);
}
for (const [key, ops] of [...uniqueIY.entries()].sort((a, b) => a[1][0].offset - b[1][0].offset)) {
  console.log(`  ${key} (${ops.length} ref${ops.length > 1 ? 's' : ''}):`);
  for (const op of ops) {
    console.log(`    ${hex(op.pc)}: ${op.text}`);
  }
}

// 7. Analysis
console.log(`\n--- Analysis ---\n`);
console.log(`  0x06ADC9 (keys 0x89/0x8B):`);
console.log(`    HL = 0x06AF46 ("DROP POINTS"), A = 0xBE`);
console.log(`    Falls through via JR to shared handler at 0x06AD91`);
console.log(`    Purpose: graph CALC "drop points" result display\n`);
console.log(`  0x06ADD1 (key 0x8D / MODE):`);
console.log(`    HL = 0x06AF37 ("STORE RESULTS?"), A = 0xBB`);
console.log(`    Calls 0x06ADF5 (set D026B1=3, then CALL 0x06AE05)`);
console.log(`    Then saves/restores graph window coords (.SIS LD HL,(0x2A98)/(0x26AA))`);
console.log(`    Calls 0x06AF6C, 0x07FFB7, 0x0846EA, conditionally 0x06AB91`);
console.log(`    Falls through to JP 0x06C8AB (reset coords + RET)\n`);
console.log(`  Shared handler 0x06AD91:`);
console.log(`    Guards: BIT 1,(IY+53) → CALL NZ 0x02398E (cursor cleanup)`);
console.log(`           BIT 2,(IY+23) → RET NZ (busy guard)`);
console.log(`           BIT 4,(IY+4) → skip graph init if set`);
console.log(`    If graph not active: CALL 0x06FBA8, 0x06AF6C, 0x06AABF`);
console.log(`    Then: LD (D026B1),3, BIT 2,(IY+75) → CALL NZ 0x06AE17`);
console.log(`    Cleanup: RES 2,(IY+75), CALL 0x06D093, RET\n`);
console.log(`  0x06C8AB exit stub:`);
console.log(`    LD HL,0x00FFFF; .SIS LD (0x26AA),HL; RET`);
console.log(`    Resets graph window coordinate to 0xFFFF (sentinel)\n`);

console.log(`=== Phase 581 complete ===`);

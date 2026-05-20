#!/usr/bin/env node

/**
 * Phase 385 — Static disassembly of 0x02FE00–0x02FF20 (translation dispatcher).
 *
 * Session 384 found that the sole caller of the key-code translation function
 * at 0x0300CB is a JP NZ,0x0300CB at 0x02FEDB.  The surrounding code at
 * 0x02FE74 reads LD A,(0xD0058C) (kbdKey), OR A, JP Z (skip if zero),
 * and eventually JP NZ,0x0300CB.
 *
 * This probe disassembles the full region to map the translation dispatcher.
 *
 * Usage:
 *   node TI-84_Plus_CE/probe-phase385-disasm-02FE.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeInstruction } from './ez80-decoder.js';

process.emitWarning = () => {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');

const START = 0x02FE00;
const END   = 0x02FF20;
const MODE  = 'adl';

// Known RAM addresses for annotation
const KNOWN_ADDRS = {
  0xD0058C: 'kbdKey',
  0xD00587: 'kbdScanCode',
  0xD00588: 'kbdLGSC',
  0xD00589: 'kbdPSC',
  0xD0058A: 'kbdWUR',
  0xD0058B: 'kbdDebncCnt',
  0xD0058D: 'kbdGetKy',
  0xD00080: 'flags',
  0xD00590: 'kbdGroup',
};

function h(v, w = 6) {
  if (v === undefined || v === null) return '??';
  return '0x' + v.toString(16).toUpperCase().padStart(w, '0');
}

function formatBytes(rom, pc, len) {
  const bytes = [];
  for (let i = 0; i < len; i++) {
    bytes.push(rom[pc + i].toString(16).toUpperCase().padStart(2, '0'));
  }
  return bytes.join(' ');
}

/**
 * Generic instruction formatter — reads the tag and fields directly
 * from the decoder output. No exhaustive tag list needed.
 */
function formatInstruction(inst) {
  const { tag } = inst;
  if (!tag) return '???';

  // --- Simple no-operand instructions ---
  const simpleOps = {
    'nop': 'NOP', 'halt': 'HALT', 'di': 'DI', 'ei': 'EI',
    'ret': 'RET', 'reti': 'RETI', 'retn': 'RETN',
    'exx': 'EXX', 'ex-af': "EX AF,AF'", 'ex-de-hl': 'EX DE,HL',
    'ex-sp-hl': 'EX (SP),HL',
    'cpl': 'CPL', 'neg': 'NEG', 'ccf': 'CCF', 'scf': 'SCF', 'daa': 'DAA',
    'rla': 'RLA', 'rlca': 'RLCA', 'rra': 'RRA', 'rrca': 'RRCA',
    'rrd': 'RRD', 'rld': 'RLD',
    'ldi': 'LDI', 'ldir': 'LDIR', 'ldd': 'LDD', 'lddr': 'LDDR',
    'cpi': 'CPI', 'cpir': 'CPIR', 'cpd': 'CPD', 'cpdr': 'CPDR',
    'ini': 'INI', 'inir': 'INIR', 'ind': 'IND', 'indr': 'INDR',
    'outi': 'OUTI', 'otir': 'OTIR', 'outd': 'OUTD', 'otdr': 'OTDR',
    'slp': 'SLP',
  };
  if (simpleOps[tag]) return simpleOps[tag];

  // --- LD variants ---
  if (tag === 'ld-reg-reg') return `LD ${(inst.dest||inst.dst||'?').toUpperCase()},${(inst.src||'?').toUpperCase()}`;
  if (tag === 'ld-reg-imm') return `LD ${(inst.dest||inst.reg||'?').toUpperCase()},${h(inst.value, 2)}`;
  if (tag === 'ld-pair-imm') return `LD ${(inst.pair||'?').toUpperCase()},${h(inst.value)}`;
  if (tag === 'ld-ind-imm') return `LD (HL),${h(inst.value, 2)}`;
  if (tag === 'ld-ind-reg') return `LD (${(inst.dest||inst.indirectRegister||'?').toUpperCase()}),${(inst.src||inst.reg||'A').toUpperCase()}`;
  if (tag === 'ld-reg-ind') return `LD ${(inst.dest||inst.reg||'?').toUpperCase()},(${(inst.src||inst.indirectRegister||'?').toUpperCase()})`;

  if (tag === 'ld-reg-mem' || tag === 'ld-a-mem')
    return `LD ${(inst.dest||inst.reg||'A').toUpperCase()},(${h(inst.addr||inst.address)})`;
  if (tag === 'ld-mem-reg' || tag === 'ld-mem-a')
    return `LD (${h(inst.addr||inst.address)}),${(inst.src||inst.reg||'A').toUpperCase()}`;
  if (tag === 'ld-pair-mem') {
    if (inst.direction === 'to-mem') return `LD (${h(inst.addr)}),${(inst.pair||'HL').toUpperCase()}`;
    return `LD ${(inst.pair||'HL').toUpperCase()},(${h(inst.addr)})`;
  }
  if (tag === 'ld-sp-hl') return 'LD SP,HL';

  // Indexed LD
  if (tag === 'ld-idx-imm') return `LD (${(inst.indexRegister||'IX').toUpperCase()}+${h(inst.displacement&0xFF,2)}),${h(inst.value,2)}`;
  if (tag === 'ld-reg-idx') return `LD ${(inst.dest||inst.reg||'?').toUpperCase()},(${(inst.indexRegister||'IX').toUpperCase()}+${h(inst.displacement&0xFF,2)})`;
  if (tag === 'ld-idx-reg') return `LD (${(inst.indexRegister||'IX').toUpperCase()}+${h(inst.displacement&0xFF,2)}),${(inst.src||inst.reg||'?').toUpperCase()}`;

  // --- Push/Pop ---
  if (tag === 'push') return `PUSH ${(inst.pair||inst.reg||'?').toUpperCase()}`;
  if (tag === 'pop') return `POP ${(inst.pair||inst.reg||'?').toUpperCase()}`;

  // --- ALU ---
  if (tag === 'alu-reg') return `${(inst.op||'?').toUpperCase()} A,${(inst.src||inst.reg||'?').toUpperCase()}`;
  if (tag === 'alu-imm' || tag === 'alu-immediate') return `${(inst.op||'?').toUpperCase()} A,${h(inst.value,2)}`;
  if (tag === 'alu-ind') return `${(inst.op||'?').toUpperCase()} A,(HL)`;
  if (tag === 'alu-idx') return `${(inst.op||'?').toUpperCase()} A,(${(inst.indexRegister||'IX').toUpperCase()}+${h(inst.displacement&0xFF,2)})`;

  // --- INC/DEC ---
  if (tag === 'inc-reg') return `INC ${(inst.reg||'?').toUpperCase()}`;
  if (tag === 'dec-reg') return `DEC ${(inst.reg||'?').toUpperCase()}`;
  if (tag === 'inc-pair') return `INC ${(inst.pair||'?').toUpperCase()}`;
  if (tag === 'dec-pair') return `DEC ${(inst.pair||'?').toUpperCase()}`;
  if (tag === 'inc-ind') return 'INC (HL)';
  if (tag === 'dec-ind') return 'DEC (HL)';

  // --- ADD/ADC/SBC pair ---
  if (tag === 'add-pair') return `ADD ${(inst.dest||'HL').toUpperCase()},${(inst.src||inst.reg||'?').toUpperCase()}`;
  if (tag === 'adc-pair') return `ADC ${(inst.dest||'HL').toUpperCase()},${(inst.src||inst.reg||'?').toUpperCase()}`;
  if (tag === 'sbc-pair') return `SBC ${(inst.dest||'HL').toUpperCase()},${(inst.src||inst.reg||'?').toUpperCase()}`;

  // --- Jumps / Calls / Returns ---
  if (tag === 'jp') return `JP ${h(inst.target)}`;
  if (tag === 'jp-conditional') return `JP ${(inst.condition||'?').toUpperCase()},${h(inst.target)}`;
  if (tag === 'jp-cond') return `JP ${(inst.condition||'?').toUpperCase()},${h(inst.target)}`;
  if (tag === 'jp-indirect') return `JP (${(inst.reg||'HL').toUpperCase()})`;
  if (tag === 'jp-idx') return `JP (${(inst.indexRegister||'IX').toUpperCase()})`;
  if (tag === 'jr') return `JR ${h(inst.target)}`;
  if (tag === 'jr-conditional') return `JR ${(inst.condition||'?').toUpperCase()},${h(inst.target)}`;
  if (tag === 'jr-cond') return `JR ${(inst.condition||'?').toUpperCase()},${h(inst.target)}`;
  if (tag === 'djnz') return `DJNZ ${h(inst.target)}`;
  if (tag === 'call') return `CALL ${h(inst.target)}`;
  if (tag === 'call-conditional') return `CALL ${(inst.condition||'?').toUpperCase()},${h(inst.target)}`;
  if (tag === 'call-cond') return `CALL ${(inst.condition||'?').toUpperCase()},${h(inst.target)}`;
  if (tag === 'ret-conditional') return `RET ${(inst.condition||'?').toUpperCase()}`;
  if (tag === 'ret-cond') return `RET ${(inst.condition||'?').toUpperCase()}`;
  if (tag === 'rst') return `RST ${h(inst.vector||inst.target, 2)}`;

  // --- Port I/O ---
  if (tag === 'in-reg') return `IN ${(inst.reg||inst.dest||'?').toUpperCase()},(C)`;
  if (tag === 'in-a-imm') return `IN A,(${h(inst.port, 2)})`;
  if (tag === 'out-reg') return `OUT (C),${(inst.reg||inst.src||'?').toUpperCase()}`;
  if (tag === 'out-a-imm') return `OUT (${h(inst.port, 2)}),A`;

  // --- Rotate/Bit (plain) ---
  if (tag === 'rotate-reg') return `${(inst.op||inst.operation||'?').toUpperCase()} ${(inst.reg||'?').toUpperCase()}`;
  if (tag === 'rotate-ind') return `${(inst.op||inst.operation||'?').toUpperCase()} (HL)`;
  if (tag === 'bit-test') return `BIT ${inst.bit},${(inst.reg||'?').toUpperCase()}`;
  if (tag === 'bit-test-ind') return `BIT ${inst.bit},(HL)`;
  if (tag === 'bit-set') return `SET ${inst.bit},${(inst.reg||'?').toUpperCase()}`;
  if (tag === 'bit-set-ind') return `SET ${inst.bit},(HL)`;
  if (tag === 'bit-reset') return `RES ${inst.bit},${(inst.reg||'?').toUpperCase()}`;
  if (tag === 'bit-reset-ind') return `RES ${inst.bit},(HL)`;

  // --- Indexed CB ---
  if (tag === 'indexed-cb-rotate') return `${(inst.operation||'?').toUpperCase()} (${(inst.indexRegister||'IX').toUpperCase()}+${h(inst.displacement&0xFF,2)})`;
  if (tag === 'indexed-cb-bit') return `BIT ${inst.bit},(${(inst.indexRegister||'IX').toUpperCase()}+${h(inst.displacement&0xFF,2)})`;
  if (tag === 'indexed-cb-set') return `SET ${inst.bit},(${(inst.indexRegister||'IX').toUpperCase()}+${h(inst.displacement&0xFF,2)})`;
  if (tag === 'indexed-cb-res') return `RES ${inst.bit},(${(inst.indexRegister||'IX').toUpperCase()}+${h(inst.displacement&0xFF,2)})`;

  // --- Misc ---
  if (tag === 'im') return `IM ${inst.mode !== undefined ? inst.mode : inst.interruptMode}`;
  if (tag === 'mlt') return `MLT ${(inst.pair||inst.reg||'?').toUpperCase()}`;
  if (tag === 'tst-a-reg') return `TST A,${(inst.reg||'?').toUpperCase()}`;
  if (tag === 'tst-a-imm') return `TST A,${h(inst.value,2)}`;
  if (tag === 'tstio') return `TSTIO ${h(inst.value,2)}`;
  if (tag === 'lea') return `LEA ${(inst.dest||'?').toUpperCase()},${(inst.base||'IX').toUpperCase()}+${h(inst.displacement&0xFF,2)}`;
  if (tag === 'pea') return `PEA ${(inst.base||inst.src||'IX').toUpperCase()}+${h(inst.displacement&0xFF,2)}`;
  if (tag === 'ex-sp-idx') return `EX (SP),${(inst.indexRegister||'IX').toUpperCase()}`;

  // Fallback: dump all non-standard fields
  const skip = new Set(['pc','length','nextPc','tag','mode','modePrefix','terminates','fallthrough']);
  const fields = Object.entries(inst)
    .filter(([k]) => !skip.has(k))
    .map(([k, v]) => `${k}=${typeof v === 'number' ? h(v) : v}`)
    .join(', ');
  return `${tag.toUpperCase()} [${fields}]`;
}

/**
 * Extract all referenced absolute addresses from an instruction
 */
function getAbsoluteAddr(inst) {
  return inst.addr ?? inst.address ?? undefined;
}

function getTarget(inst) {
  return inst.target;
}

// ───── Main ─────

const rom = fs.readFileSync(ROM_PATH);
if (rom.length !== 0x400000) {
  console.error(`ROM size mismatch: expected 4194304, got ${rom.length}`);
  process.exit(1);
}

console.log('='.repeat(80));
console.log('Phase 385 — Static disassembly of 0x02FE00–0x02FF20');
console.log('Translation dispatcher region');
console.log('='.repeat(80));
console.log('');

const callTargets = new Set();
const jpTargets = new Set();
const memRefs = [];  // { pc, address, direction, text }
const portOps = [];
const branches = [];
const instructions = [];

let pc = START;
while (pc < END) {
  let inst;
  try {
    inst = decodeInstruction(rom, pc, MODE);
  } catch (e) {
    const byte = rom[pc];
    console.log(`${h(pc)}  ${byte.toString(16).padStart(2,'0').toUpperCase().padEnd(18)}  DB ${h(byte, 2)}  ; decode error`);
    pc++;
    continue;
  }

  if (!inst || inst.length === 0) {
    const byte = rom[pc];
    console.log(`${h(pc)}  ${byte.toString(16).padStart(2,'0').toUpperCase().padEnd(18)}  DB ${h(byte, 2)}`);
    pc++;
    continue;
  }

  const bytesStr = formatBytes(rom, pc, inst.length).padEnd(18);
  const mnemStr = formatInstruction(inst);
  const { tag } = inst;

  // Annotations
  const annos = [];
  const absAddr = getAbsoluteAddr(inst);
  if (absAddr !== undefined) {
    const name = KNOWN_ADDRS[absAddr];
    if (name) annos.push(`; ${name}`);
    else if (absAddr >= 0xD00000 && absAddr < 0xE00000) annos.push('; RAM');
  }

  // Collect metadata
  if (tag === 'call' || tag === 'call-conditional' || tag === 'call-cond') {
    callTargets.add(inst.target);
    annos.push('; CALL');
  }
  if (tag === 'jp' || tag === 'jp-conditional' || tag === 'jp-cond') {
    jpTargets.add(inst.target);
    annos.push('; JP');
  }

  // Memory refs
  if (absAddr !== undefined) {
    const dir = tag.includes('mem-reg') || (tag === 'ld-pair-mem' && inst.direction === 'to-mem')
      ? 'write' : 'read';
    memRefs.push({ pc, address: absAddr, direction: dir, text: mnemStr });
  }

  // Port I/O
  if (tag.startsWith('in-') || tag.startsWith('out-')) {
    portOps.push({ pc, text: mnemStr });
  }

  // Branches
  if (tag === 'jp-conditional' || tag === 'jr-conditional' || tag === 'call-conditional' ||
      tag === 'jp-cond' || tag === 'jr-cond' || tag === 'call-cond' ||
      tag === 'djnz' || tag === 'ret-conditional' || tag === 'ret-cond') {
    branches.push({ pc, tag, target: inst.target, condition: inst.condition, text: mnemStr });
  }

  // Function boundary marker
  let marker = '';
  if (tag === 'ret' || tag === 'reti' || tag === 'retn') {
    marker = '  <-- possible function boundary';
  }

  instructions.push({ pc, inst, text: mnemStr });
  console.log(`${h(pc)}  ${bytesStr} ${mnemStr}${annos.length ? '  ' + annos.join(' ') : ''}${marker}`);

  pc = inst.nextPc;
}

// ───── Summary ─────

console.log('');
console.log('='.repeat(80));
console.log('SUMMARY');
console.log('='.repeat(80));

// Find function entry by scanning backwards for RET
console.log('');
console.log('--- Function Entry Detection ---');
let foundEntry = false;
for (let scanPc = START - 1; scanPc >= START - 32; scanPc--) {
  const byte = rom[scanPc];
  if (byte === 0xC9) {
    console.log(`  RET at ${h(scanPc)} -> function likely starts at ${h(scanPc + 1)}`);
    foundEntry = true;
    break;
  }
}
if (!foundEntry) {
  // Also try decoding a few instructions before START
  console.log('  No RET found in 32 bytes before START. Decoding pre-region:');
  let pre = START - 16;
  while (pre < START) {
    try {
      const inst = decodeInstruction(rom, pre, MODE);
      if (inst && inst.length > 0) {
        const text = formatInstruction(inst);
        console.log(`    ${h(pre)}  ${text}`);
        if (inst.tag === 'ret' || inst.tag === 'jp') {
          console.log(`    ^^^ function boundary — next function starts at ${h(inst.nextPc)}`);
        }
        pre = inst.nextPc;
      } else {
        pre++;
      }
    } catch {
      pre++;
    }
  }
}

// Internal boundaries
console.log('');
console.log('--- Internal RET / unconditional JP boundaries ---');
for (const { pc: ipc, inst, text } of instructions) {
  if (inst.tag === 'ret' || inst.tag === 'jp') {
    console.log(`  ${h(ipc)}  ${text}`);
  }
}

console.log('');
console.log('--- External CALL targets ---');
for (const t of [...callTargets].sort((a, b) => a - b)) {
  const inRange = t >= START && t < END;
  console.log(`  ${h(t)}${inRange ? '  (within this region)' : ''}`);
}

console.log('');
console.log('--- External JP targets ---');
for (const t of [...jpTargets].sort((a, b) => a - b)) {
  const inRange = t >= START && t < END;
  console.log(`  ${h(t)}${inRange ? '  (within this region)' : ''}`);
}

console.log('');
console.log('--- All memory references (absolute address loads/stores) ---');
for (const { pc: mpc, address, direction, text } of memRefs) {
  const name = KNOWN_ADDRS[address] || '';
  console.log(`  ${h(mpc)}  [${direction.padEnd(5)}]  ${text}  ${name ? '(' + name + ')' : ''}`);
}

console.log('');
console.log('--- Port I/O ---');
if (portOps.length === 0) {
  console.log('  (none in this region)');
} else {
  for (const { pc: ppc, text } of portOps) {
    console.log(`  ${h(ppc)}  ${text}`);
  }
}

console.log('');
console.log('--- Conditional branches ---');
for (const { pc: bpc, target, text } of branches) {
  const dir = target !== undefined ? (target > bpc ? 'forward' : 'backward') : '?';
  console.log(`  ${h(bpc)}  ${text}  [${dir}]`);
}

console.log('');
console.log('--- kbdKey path: 0xD0058C read → JP NZ,0x0300CB ---');
console.log('  Key instructions in the translation dispatch flow:');
for (const { pc: ipc, inst, text } of instructions) {
  const addr = getAbsoluteAddr(inst);
  const tgt = getTarget(inst);
  // Show: reads of kbd* addresses, ALU ops in the key region, and the JP to 0x0300CB
  if ((addr !== undefined && addr >= 0xD00587 && addr <= 0xD00590) ||
      tgt === 0x0300CB ||
      (inst.tag && inst.tag.startsWith('alu') && ipc >= 0x02FE60 && ipc <= 0x02FEE0)) {
    console.log(`    ${h(ipc)}  ${text}`);
  }
}

console.log('');
console.log('--- All unique RAM addresses referenced ---');
const allAddrs = new Set();
for (const { address } of memRefs) allAddrs.add(address);
for (const addr of [...allAddrs].sort((a, b) => a - b)) {
  const name = KNOWN_ADDRS[addr] || (addr >= 0xD00000 && addr < 0xE00000 ? '(RAM)' : '');
  console.log(`  ${h(addr)}  ${name}`);
}

console.log('');
console.log('='.repeat(80));
console.log('End of Phase 385 disassembly');
console.log('='.repeat(80));

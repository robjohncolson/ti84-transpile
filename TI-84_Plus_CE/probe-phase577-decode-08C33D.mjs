/**
 * probe-phase577-decode-08C33D.mjs
 *
 * Decode 0x08C33D — the event loop's common exit/cleanup function.
 * Multiple callers JP here (from 0x0620C4 display dispatcher and others).
 *
 * 1. Disassemble from 0x08C33D until unconditional RET or JP (~195 bytes)
 * 2. Identify all CALL/JP targets, IY flag checks, RAM refs
 * 3. Scan ROM for all CALL/JP references TO 0x08C33D
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROM_PATH = join(__dirname, 'ROM.rom');

const rom = readFileSync(ROM_PATH);
const ENTRY = 0x08C33D;

// -- helpers --

function hex(v, w = 6) {
  return '0x' + v.toString(16).toUpperCase().padStart(w, '0');
}

function bytesHex(start, len) {
  const out = [];
  for (let i = 0; i < len; i++) out.push(rom[start + i].toString(16).toUpperCase().padStart(2, '0'));
  return out.join(' ');
}

function formatInsn(r) {
  if (r.tag === 'indexed-cb-set') return 'SET ' + r.bit + ',(IY+' + hex(r.displacement, 2) + ')';
  if (r.tag === 'indexed-cb-res') return 'RES ' + r.bit + ',(IY+' + hex(r.displacement, 2) + ')';
  if (r.tag === 'indexed-cb-bit') return 'BIT ' + r.bit + ',(IY+' + hex(r.displacement, 2) + ')';
  if (r.tag === 'ret') return 'RET';
  if (r.tag === 'ret-conditional') return 'RET ' + r.condition.toUpperCase();
  if (r.tag === 'call') return 'CALL ' + hex(r.target);
  if (r.tag === 'call-conditional') return 'CALL ' + r.condition.toUpperCase() + ',' + hex(r.target);
  if (r.tag === 'jp') return r.condition ? 'JP ' + r.condition.toUpperCase() + ',' + hex(r.target) : 'JP ' + hex(r.target);
  if (r.tag === 'jr') return r.condition ? 'JR ' + r.condition.toUpperCase() + ',' + hex(r.target) : 'JR ' + hex(r.target);
  if (r.tag === 'jr-conditional') return 'JR ' + r.condition.toUpperCase() + ',' + hex(r.target);
  if (r.tag === 'ld-reg-mem') {
    const pfx = r.modePrefix ? '.' + r.modePrefix.toUpperCase() + ' ' : '';
    return pfx + 'LD ' + r.dest.toUpperCase() + ',(' + hex(r.addr) + ')';
  }
  if (r.tag === 'ld-mem-reg') {
    const pfx = r.modePrefix ? '.' + r.modePrefix.toUpperCase() + ' ' : '';
    return pfx + 'LD (' + hex(r.addr) + '),' + r.src.toUpperCase();
  }
  if (r.tag === 'ld-pair-mem') {
    const pfx = r.modePrefix ? '.' + r.modePrefix.toUpperCase() + ' ' : '';
    if (r.direction === 'to-mem') return pfx + 'LD (' + hex(r.addr) + '),' + r.pair.toUpperCase();
    return pfx + 'LD ' + r.pair.toUpperCase() + ',(' + hex(r.addr) + ')';
  }
  if (r.tag === 'ld-pair-imm') return 'LD ' + r.pair.toUpperCase() + ',' + hex(r.value);
  if (r.tag === 'ld-reg-imm') return 'LD ' + r.dest.toUpperCase() + ',0x' + r.value.toString(16).toUpperCase().padStart(2, '0');
  if (r.tag === 'ld-reg-reg') return 'LD ' + r.dest.toUpperCase() + ',' + r.src.toUpperCase();
  if (r.tag === 'alu-imm') return r.op.toUpperCase() + ' 0x' + r.value.toString(16).toUpperCase().padStart(2, '0');
  if (r.tag === 'alu-reg') return r.op.toUpperCase() + ' ' + r.src.toUpperCase();
  if (r.tag === 'push') return 'PUSH ' + r.pair.toUpperCase();
  if (r.tag === 'pop') return 'POP ' + r.pair.toUpperCase();
  if (r.tag === 'ex-de-hl') return 'EX DE,HL';
  if (r.tag === 'inc-pair') return 'INC ' + r.pair.toUpperCase();
  if (r.tag === 'dec-pair') return 'DEC ' + r.pair.toUpperCase();
  if (r.tag === 'inc-reg') return 'INC ' + (r.reg || r.dest || '?').toUpperCase();
  if (r.tag === 'dec-reg') return 'DEC ' + (r.reg || r.dest || '?').toUpperCase();
  if (r.tag === 'nop') return 'NOP';
  if (r.tag === 'di') return 'DI';
  if (r.tag === 'ei') return 'EI';
  if (r.tag === 'halt') return 'HALT';
  if (r.tag === 'rst') return 'RST ' + hex(r.target, 2);
  if (r.tag === 'ldir') return 'LDIR';
  if (r.tag === 'lddr') return 'LDDR';
  if (r.tag === 'djnz') return 'DJNZ ' + hex(r.target);
  if (r.tag === 'or-reg') return 'OR ' + r.src.toUpperCase();
  if (r.tag === 'and-reg') return 'AND ' + r.src.toUpperCase();
  if (r.tag === 'xor-reg') return 'XOR ' + r.src.toUpperCase();
  if (r.tag === 'cp-reg') return 'CP ' + r.src.toUpperCase();
  if (r.tag === 'cp-imm') return 'CP 0x' + r.value.toString(16).toUpperCase().padStart(2, '0');
  if (r.tag === 'out-port-a') return 'OUT (' + hex(r.port, 2) + '),A';
  if (r.tag === 'in-a-port') return 'IN A,(' + hex(r.port, 2) + ')';
  if (r.tag === 'ex-sp-hl') return 'EX (SP),HL';
  if (r.tag === 'ld-sp-hl') return 'LD SP,HL';
  if (r.tag === 'jp-hl') return 'JP (HL)';
  if (r.tag === 'rla') return 'RLA';
  if (r.tag === 'rlca') return 'RLCA';
  if (r.tag === 'rra') return 'RRA';
  if (r.tag === 'rrca') return 'RRCA';
  if (r.tag === 'cpl') return 'CPL';
  if (r.tag === 'scf') return 'SCF';
  if (r.tag === 'ccf') return 'CCF';
  if (r.tag === 'daa') return 'DAA';
  if (r.tag === 'neg') return 'NEG';
  if (r.tag === 'reti') return 'RETI';
  if (r.tag === 'retn') return 'RETN';
  if (r.tag === 'im') return 'IM ' + r.mode;
  if (r.tag === 'exx') return 'EXX';
  if (r.tag === 'ex-af') return "EX AF,AF'";
  if (r.tag === 'cpir') return 'CPIR';
  if (r.tag === 'cpdr') return 'CPDR';
  if (r.tag === 'inir') return 'INIR';
  if (r.tag === 'otir') return 'OTIR';

  // fallback: show tag + all fields
  const extras = Object.entries(r)
    .filter(function(e) { return !['pc', 'length', 'nextPc', 'mode', 'modePrefix', 'terminates'].includes(e[0]); })
    .map(function(e) { return e[0] + '=' + e[1]; })
    .join(' ');
  return '[' + r.tag + '] ' + extras;
}

// -- 1. Disassemble function at 0x08C33D --

console.log('Probe phase 577: decode 0x08C33D common event-loop exit/cleanup\n');
console.log('=== Disassembly of function at ' + hex(ENTRY) + ' ===\n');

const instructions = [];
let pc = ENTRY;
const MAX_INSNS = 300;
const MAX_BYTES = 300;

for (let i = 0; i < MAX_INSNS && (pc - ENTRY) < MAX_BYTES; i++) {
  const r = decodeInstruction(rom, pc, 'adl');
  if (!r || !r.length) {
    console.log('  ' + hex(pc) + '  ' + bytesHex(pc, 1).padEnd(20) + '  ??? (decode fail)');
    pc++;
    continue;
  }
  const row = {
    address: pc,
    bytes: bytesHex(pc, r.length),
    mnemonic: formatInsn(r),
    decoded: r,
  };
  instructions.push(row);
  console.log('  ' + hex(pc) + '  ' + row.bytes.padEnd(20) + '  ' + row.mnemonic);

  // Stop at unconditional RET or unconditional JP
  if (r.tag === 'ret') break;
  if (r.tag === 'jp' && !r.condition) break;
  pc = r.nextPc;
}

const funcSize = instructions.length
  ? instructions[instructions.length - 1].address + instructions[instructions.length - 1].decoded.length - ENTRY
  : 0;

console.log('\n  Function size: ' + funcSize + ' bytes (' + instructions.length + ' instructions)');

// -- 2. All CALL/JP/JR targets --

console.log('\n=== All CALL/JP/JR Targets ===\n');

const targets = [];
for (const row of instructions) {
  const r = row.decoded;
  if (r.tag === 'call' || r.tag === 'call-conditional') {
    targets.push({ from: hex(row.address), type: row.mnemonic, target: hex(r.target) });
  }
  if (r.tag === 'jp') {
    targets.push({ from: hex(row.address), type: row.mnemonic, target: hex(r.target) });
  }
  if (r.tag === 'jr' || r.tag === 'jr-conditional') {
    targets.push({ from: hex(row.address), type: row.mnemonic, target: hex(r.target) });
  }
  if (r.tag === 'djnz') {
    targets.push({ from: hex(row.address), type: row.mnemonic, target: hex(r.target) });
  }
}
for (const t of targets) {
  console.log('  ' + t.from + ': ' + t.type);
}
if (!targets.length) console.log('  (none)');

// -- 3. IY flag operations --

console.log('\n=== IY Flag Operations ===\n');

let iyCount = 0;
for (const row of instructions) {
  const r = row.decoded;
  if (r.tag && r.tag.startsWith('indexed-cb-')) {
    console.log('  ' + hex(row.address) + ': ' + row.mnemonic);
    iyCount++;
  }
}
if (!iyCount) console.log('  (none)');

// -- 4. RAM references (D0xxxx) --

console.log('\n=== RAM References (D0xxxx) ===\n');

let ramCount = 0;
for (const row of instructions) {
  const r = row.decoded;
  const addr = r.addr;
  if (addr !== undefined && addr >= 0xD00000 && addr <= 0xDFFFFF) {
    const access = r.tag.includes('mem-reg') ? 'WRITE' : (r.tag.includes('reg-mem') || r.tag.includes('pair-mem')) ? 'READ' : 'REF';
    console.log('  ' + hex(row.address) + ': ' + row.mnemonic + '  [' + access + ']');
    ramCount++;
  }
}
if (!ramCount) console.log('  (none)');

// -- 5. Scan ROM for callers of 0x08C33D --

console.log('\n=== Callers of ' + hex(ENTRY) + ' ===\n');

const b0 = ENTRY & 0xFF;
const b1 = (ENTRY >> 8) & 0xFF;
const b2 = (ENTRY >> 16) & 0xFF;

const callerOpcodes = {};
callerOpcodes[0xCD] = 'CALL';
callerOpcodes[0xC3] = 'JP';
callerOpcodes[0xC4] = 'CALL NZ';
callerOpcodes[0xCC] = 'CALL Z';
callerOpcodes[0xD4] = 'CALL NC';
callerOpcodes[0xDC] = 'CALL C';
callerOpcodes[0xCA] = 'JP Z';
callerOpcodes[0xC2] = 'JP NZ';
callerOpcodes[0xD2] = 'JP NC';
callerOpcodes[0xDA] = 'JP C';

const callers = [];
for (let i = 0; i < rom.length - 3; i++) {
  if (rom[i + 1] === b0 && rom[i + 2] === b1 && rom[i + 3] === b2) {
    const opcode = rom[i];
    if (callerOpcodes[opcode]) {
      callers.push({ addr: hex(i), type: callerOpcodes[opcode] });
      console.log('  ' + hex(i) + ': ' + callerOpcodes[opcode] + ' ' + hex(ENTRY));
    }
  }
}
if (!callers.length) console.log('  (none found)');

// -- 6. Summary --

console.log('\n=== Summary ===\n');
console.log('  Entry: ' + hex(ENTRY));
console.log('  Function size: ' + funcSize + ' bytes (' + instructions.length + ' instructions)');

const funcCalls = instructions.filter(function(r) { return ['call', 'call-conditional'].includes(r.decoded.tag); });
const funcJps = instructions.filter(function(r) { return r.decoded.tag === 'jp'; });
const funcIyOps = instructions.filter(function(r) { return r.decoded.tag && r.decoded.tag.startsWith('indexed-cb-'); });
const funcRamRefs = instructions.filter(function(r) {
  const a = r.decoded.addr;
  return a && a >= 0xD00000 && a <= 0xDFFFFF;
});

console.log('  CALL instructions: ' + funcCalls.length);
for (const c of funcCalls) console.log('    ' + hex(c.address) + ': ' + c.mnemonic);
console.log('  JP instructions: ' + funcJps.length);
for (const j of funcJps) console.log('    ' + hex(j.address) + ': ' + j.mnemonic);
console.log('  IY flag ops: ' + funcIyOps.length);
for (const iy of funcIyOps) console.log('    ' + hex(iy.address) + ': ' + iy.mnemonic);
console.log('  RAM refs: ' + funcRamRefs.length);
for (const rr of funcRamRefs) console.log('    ' + hex(rr.address) + ': ' + rr.mnemonic);
console.log('  Callers found in ROM: ' + callers.length);

console.log('\nDone.');
process.exit(0);

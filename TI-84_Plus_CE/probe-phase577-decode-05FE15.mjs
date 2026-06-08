/**
 * probe-phase577-decode-05FE15.mjs
 *
 * Decode the ROM region at 0x05FE15 -- the alternate display handler
 * called when D007E0=0x49 (counterpart to 0x058241 main display refresh).
 *
 * 1. Disassemble from 0x05FE15 until unconditional RET or JP, up to 300 bytes
 * 2. Detect all CALL/JP targets, RAM refs (D0xxxx), IY refs, port I/O
 * 3. Scan ROM for callers of 0x05FE15
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROM_PATH = join(__dirname, 'ROM.rom');

const rom = readFileSync(ROM_PATH);
const TARGET_ADDR = 0x05FE15;
const MAX_BYTES = 300;

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
  if (r.tag === 'in-port') return 'IN A,(' + hex(r.port, 2) + ')';
  if (r.tag === 'out-port') return 'OUT (' + hex(r.port, 2) + '),A';

  // fallback: show tag + all fields
  const extras = Object.entries(r)
    .filter(function(e) { return !['pc', 'length', 'nextPc', 'mode', 'modePrefix', 'terminates'].includes(e[0]); })
    .map(function(e) { return e[0] + '=' + e[1]; })
    .join(' ');
  return '[' + r.tag + '] ' + extras;
}

// -- 1. Disassemble from 0x05FE15 until RET or unconditional JP, up to 300 bytes --

console.log('=== Disassembly of 0x05FE15 (alternate display handler, D007E0=0x49) ===\n');

const instructions = [];
let pc = TARGET_ADDR;
const endLimit = TARGET_ADDR + MAX_BYTES;

while (pc < endLimit && pc < rom.length) {
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

  // Stop on unconditional RET or unconditional JP
  if (r.tag === 'ret') break;
  if (r.tag === 'jp' && !r.condition) break;

  pc = r.nextPc;
}

const funcSize = instructions.length
  ? instructions[instructions.length - 1].address + instructions[instructions.length - 1].decoded.length - TARGET_ADDR
  : 0;

console.log('\n  Function size: ' + funcSize + ' bytes (' + instructions.length + ' instructions)');
const lastInsn = instructions.length ? instructions[instructions.length - 1] : null;
if (lastInsn) {
  console.log('  Terminator: ' + lastInsn.mnemonic + ' at ' + hex(lastInsn.address));
}

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

// -- 5. Port I/O --

console.log('\n=== Port I/O ===\n');

let portCount = 0;
for (const row of instructions) {
  const r = row.decoded;
  if (r.tag === 'in-port' || r.tag === 'out-port') {
    console.log('  ' + hex(row.address) + ': ' + row.mnemonic);
    portCount++;
  }
}
if (!portCount) console.log('  (none)');

// -- 6. Scan ROM for callers of 0x05FE15 --

console.log('\n=== Callers of ' + hex(TARGET_ADDR) + ' in ROM ===\n');

const b0 = TARGET_ADDR & 0xFF;
const b1 = (TARGET_ADDR >> 8) & 0xFF;
const b2 = (TARGET_ADDR >> 16) & 0xFF;

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
      console.log('  ' + hex(i) + ': ' + callerOpcodes[opcode] + ' ' + hex(TARGET_ADDR));
    }
  }
}
if (!callers.length) console.log('  (none found)');

// -- 7. Summary --

console.log('\n=== Summary ===\n');
console.log('  Target address: ' + hex(TARGET_ADDR));
console.log('  Function size: ' + funcSize + ' bytes (' + instructions.length + ' instructions)');

const funcCalls = instructions.filter(function(r) { return ['call', 'call-conditional'].includes(r.decoded.tag); });
const funcJps = instructions.filter(function(r) { return r.decoded.tag === 'jp'; });
const funcJrs = instructions.filter(function(r) { return r.decoded.tag === 'jr' || r.decoded.tag === 'jr-conditional'; });
const funcIyOps = instructions.filter(function(r) { return r.decoded.tag && r.decoded.tag.startsWith('indexed-cb-'); });
const funcRamRefs = instructions.filter(function(r) {
  const a = r.decoded.addr;
  return a && a >= 0xD00000 && a <= 0xDFFFFF;
});
const funcLdirs = instructions.filter(function(r) { return r.decoded.tag === 'ldir'; });

console.log('  CALL instructions: ' + funcCalls.length);
for (const c of funcCalls) console.log('    ' + hex(c.address) + ': ' + c.mnemonic);
console.log('  JP instructions: ' + funcJps.length);
for (const j of funcJps) console.log('    ' + hex(j.address) + ': ' + j.mnemonic);
console.log('  JR instructions: ' + funcJrs.length);
for (const j of funcJrs) console.log('    ' + hex(j.address) + ': ' + j.mnemonic);
console.log('  IY flag ops: ' + funcIyOps.length);
for (const iy of funcIyOps) console.log('    ' + hex(iy.address) + ': ' + iy.mnemonic);
console.log('  RAM refs: ' + funcRamRefs.length);
for (const rr of funcRamRefs) console.log('    ' + hex(rr.address) + ': ' + rr.mnemonic);
console.log('  LDIR instructions: ' + funcLdirs.length);
console.log('  Callers found in ROM: ' + callers.length);

console.log('\nDone.');
process.exit(0);

/**
 * probe-phase578-decode-070372.mjs
 *
 * Decode 0x070372 — subroutine called by the font rendering engine core
 * (0x070241, decoded in session 576). Likely handles glyph data preparation.
 *
 * 1. Disassemble from 0x070372 until unconditional terminator (RET/JP)
 * 2. Print: address, raw bytes, mnemonic, operands
 * 3. Identify: CALL/JP targets, IY flag ops, RAM refs (D0xxxx),
 *    font table addresses (0x004xxx), LDIR/LDI copies,
 *    pixel workspace refs (D02A62-D02A75)
 * 4. Scan ROM for all callers of 0x070372
 * 5. Summary
 */

import { readFileSync } from 'fs';
import { decodeInstruction } from './ez80-decoder.js';

const rom = readFileSync(new URL('./ROM.rom', import.meta.url));

const FUNC_START = 0x070372;
const MAX_INSN   = 200;  // safety limit

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
  if (r.tag === 'ldi') return 'LDI';
  if (r.tag === 'lddr') return 'LDDR';
  if (r.tag === 'djnz') return 'DJNZ ' + hex(r.target);
  if (r.tag === 'or-reg') return 'OR ' + r.src.toUpperCase();
  if (r.tag === 'and-reg') return 'AND ' + r.src.toUpperCase();
  if (r.tag === 'xor-reg') return 'XOR ' + r.src.toUpperCase();
  if (r.tag === 'cp-reg') return 'CP ' + r.src.toUpperCase();
  if (r.tag === 'cp-imm') return 'CP 0x' + r.value.toString(16).toUpperCase().padStart(2, '0');
  if (r.tag === 'sla') return 'SLA ' + (r.reg || '?').toUpperCase();
  if (r.tag === 'sra') return 'SRA ' + (r.reg || '?').toUpperCase();
  if (r.tag === 'srl') return 'SRL ' + (r.reg || '?').toUpperCase();
  if (r.tag === 'rl') return 'RL ' + (r.reg || '?').toUpperCase();
  if (r.tag === 'rr') return 'RR ' + (r.reg || '?').toUpperCase();
  if (r.tag === 'rlc') return 'RLC ' + (r.reg || '?').toUpperCase();
  if (r.tag === 'rrc') return 'RRC ' + (r.reg || '?').toUpperCase();
  if (r.tag === 'bit') return 'BIT ' + r.bit + ',' + (r.reg || '?').toUpperCase();
  if (r.tag === 'set') return 'SET ' + r.bit + ',' + (r.reg || '?').toUpperCase();
  if (r.tag === 'res') return 'RES ' + r.bit + ',' + (r.reg || '?').toUpperCase();
  if (r.tag === 'rla') return 'RLA';
  if (r.tag === 'rra') return 'RRA';
  if (r.tag === 'rlca') return 'RLCA';
  if (r.tag === 'rrca') return 'RRCA';
  if (r.tag === 'cpl') return 'CPL';
  if (r.tag === 'scf') return 'SCF';
  if (r.tag === 'ccf') return 'CCF';
  if (r.tag === 'add-pair') return 'ADD ' + (r.dest || 'HL').toUpperCase() + ',' + (r.src || r.pair || '?').toUpperCase();
  if (r.tag === 'adc-pair') return 'ADC ' + (r.dest || 'HL').toUpperCase() + ',' + (r.src || r.pair || '?').toUpperCase();
  if (r.tag === 'sbc-pair') return 'SBC ' + (r.dest || 'HL').toUpperCase() + ',' + (r.src || r.pair || '?').toUpperCase();
  if (r.tag === 'ex-sp-hl') return 'EX (SP),HL';
  if (r.tag === 'ld-sp-hl') return 'LD SP,HL';
  if (r.tag === 'jp-hl') return 'JP (HL)';
  if (r.tag === 'out') return 'OUT (' + hex(r.port, 2) + '),' + (r.src || 'A').toUpperCase();
  if (r.tag === 'in') return 'IN ' + (r.dest || 'A').toUpperCase() + ',(' + hex(r.port, 2) + ')';
  if (r.tag === 'exx') return 'EXX';
  if (r.tag === 'ex-af') return "EX AF,AF'";
  if (r.tag === 'neg') return 'NEG';
  if (r.tag === 'reti') return 'RETI';
  if (r.tag === 'retn') return 'RETN';
  if (r.tag === 'cpir') return 'CPIR';
  if (r.tag === 'cpdr') return 'CPDR';
  if (r.tag === 'inir') return 'INIR';
  if (r.tag === 'otir') return 'OTIR';
  if (r.tag === 'ld-indexed') {
    const off = r.displacement !== undefined ? r.displacement : 0;
    const sign = off >= 0 ? '+' : '';
    if (r.direction === 'to-mem') return 'LD (IY' + sign + off + '),' + (r.src || hex(r.value, 2));
    return 'LD ' + (r.dest || '?').toUpperCase() + ',(IY' + sign + off + ')';
  }
  if (r.tag === 'add-indexed') {
    const off = r.displacement !== undefined ? r.displacement : 0;
    return 'ADD A,(IY+' + off + ')';
  }
  if (r.tag === 'sub-indexed') {
    const off = r.displacement !== undefined ? r.displacement : 0;
    return 'SUB A,(IY+' + off + ')';
  }

  // fallback: show tag + all fields
  const extras = Object.entries(r)
    .filter(function(e) { return !['pc', 'length', 'nextPc', 'mode', 'modePrefix', 'terminates'].includes(e[0]); })
    .map(function(e) { return e[0] + '=' + e[1]; })
    .join(' ');
  return '[' + r.tag + '] ' + extras;
}

// -- 1. Disassemble from 0x070372 --

console.log('=== phase578: Decode 0x070372 — Glyph Data Prep Subroutine ===\n');

const instructions = [];
let pc = FUNC_START;
let terminated = false;

for (let i = 0; i < MAX_INSN && pc < rom.length; i++) {
  const r = decodeInstruction(rom, pc, 'adl');
  if (!r || !r.length) {
    console.log('  ' + hex(pc) + '  ' + bytesHex(pc, 1).padEnd(20) + '  ??? (decode fail)');
    pc++;
    continue;
  }
  instructions.push({
    address: pc,
    bytes: bytesHex(pc, r.length),
    mnemonic: formatInsn(r),
    decoded: r,
  });
  pc = r.nextPc;

  // Stop at unconditional terminator (RET, JP uncond, JP (HL))
  if (r.tag === 'ret' || r.tag === 'reti' || r.tag === 'retn' ||
      r.tag === 'jp-hl' || (r.tag === 'jp' && !r.condition)) {
    terminated = true;
    break;
  }
}

const funcEnd = pc;
const funcSize = funcEnd - FUNC_START;

console.log('Disassembly from ' + hex(FUNC_START) + ' (' + funcSize + ' bytes, ' + instructions.length + ' instructions)');
console.log('Terminated: ' + (terminated ? 'yes' : 'no (hit MAX_INSN)') + '\n');

console.log('=== Instruction Listing ===\n');

for (const item of instructions) {
  console.log('  ' + hex(item.address) + '  ' + item.bytes.padEnd(20) + '  ' + item.mnemonic);
}

// -- 2. CALL/JP/JR targets --

console.log('\n=== CALL/JP/JR Targets ===\n');

const targets = new Map();
for (const item of instructions) {
  const r = item.decoded;
  let target = null;
  let type = '';
  if (r.tag === 'call' || r.tag === 'call-conditional') { target = r.target; type = 'CALL'; }
  if (r.tag === 'jp' || r.tag === 'jp-hl') { target = r.target; type = 'JP'; }
  if (r.tag === 'jr' || r.tag === 'jr-conditional') { target = r.target; type = 'JR'; }
  if (r.tag === 'rst') { target = r.target; type = 'RST'; }
  if (r.tag === 'djnz') { target = r.target; type = 'DJNZ'; }
  if (target !== null && target !== undefined) {
    const key = hex(target);
    if (!targets.has(key)) targets.set(key, []);
    targets.get(key).push({ from: item.address, type: type, text: item.mnemonic });
  }
}
for (const [addr, refs] of targets) {
  for (const ref of refs) {
    console.log('  ' + hex(ref.from) + ': ' + ref.text);
  }
}
if (!targets.size) console.log('  (none)');

// -- 3. IY flag operations --

console.log('\n=== IY Flag Operations ===\n');

let iyCount = 0;
for (const item of instructions) {
  const r = item.decoded;
  if (r.tag && r.tag.startsWith('indexed-cb-')) {
    console.log('  ' + hex(item.address) + ': ' + item.mnemonic);
    iyCount++;
  }
  // Also catch LD (IY+d),... and LD ...,(IY+d)
  if (r.tag === 'ld-indexed') {
    console.log('  ' + hex(item.address) + ': ' + item.mnemonic + '  [IY indexed]');
    iyCount++;
  }
}
if (!iyCount) console.log('  (none)');

// -- 4. RAM references (D0xxxx) --

console.log('\n=== RAM References (D0xxxx) ===\n');

let ramCount = 0;
for (const item of instructions) {
  const r = item.decoded;
  const addr = r.addr;
  if (addr !== undefined && addr >= 0xD00000 && addr <= 0xDFFFFF) {
    const access = r.tag.includes('mem-reg') ? 'WRITE' :
      (r.tag.includes('reg-mem') || r.tag.includes('pair-mem')) ? 'READ' : 'REF';
    const isPixelWS = (addr >= 0xD02A62 && addr <= 0xD02A75) ? ' *** PIXEL WORKSPACE ***' : '';
    console.log('  ' + hex(item.address) + ': ' + item.mnemonic + '  [' + access + ']' + isPixelWS);
    ramCount++;
  }
}
if (!ramCount) console.log('  (none)');

// -- 5. Pixel workspace references (D02A62-D02A75) --

console.log('\n=== Pixel Workspace Refs (D02A62-D02A75) ===\n');

let pxCount = 0;
for (const item of instructions) {
  const r = item.decoded;
  const addr = r.addr;
  if (addr !== undefined && addr >= 0xD02A62 && addr <= 0xD02A75) {
    const access = r.tag.includes('mem-reg') ? 'WRITE' :
      (r.tag.includes('reg-mem') || r.tag.includes('pair-mem')) ? 'READ' : 'REF';
    console.log('  ' + hex(item.address) + ': ' + item.mnemonic + '  [' + access + ']');
    pxCount++;
  }
}
if (!pxCount) console.log('  (none)');

// -- 6. Font table / low ROM references (0x000000-0x00FFFF) --

console.log('\n=== Font Table / Low ROM Refs ===\n');

let fontCount = 0;
for (const item of instructions) {
  const r = item.decoded;
  const addr = r.addr || r.value || r.target;
  if (addr !== undefined && addr >= 0x000000 && addr <= 0x00FFFF &&
      r.tag !== 'ld-reg-imm' && r.tag !== 'alu-imm' && r.tag !== 'cp-imm') {
    console.log('  ' + hex(item.address) + ': ' + item.mnemonic);
    fontCount++;
  }
}
if (!fontCount) console.log('  (none)');

// -- 7. LDIR/LDI/LDDR copies --

console.log('\n=== Block Copy Instructions (LDIR/LDI/LDDR) ===\n');

let blkCount = 0;
for (const item of instructions) {
  const r = item.decoded;
  if (r.tag === 'ldir' || r.tag === 'ldi' || r.tag === 'lddr') {
    console.log('  ' + hex(item.address) + ': ' + item.mnemonic);
    blkCount++;
  }
}
if (!blkCount) console.log('  (none)');

// -- 8. Scan ROM for callers of 0x070372 --

console.log('\n=== Callers of ' + hex(FUNC_START) + ' (ROM scan) ===\n');

// CALL nn = CD lo mid hi (4 bytes in ADL mode)
// CALL cc,nn = C4/CC/D4/DC/E4/EC/F4/FC lo mid hi (4 bytes in ADL mode)
const targetLo  = FUNC_START & 0xFF;
const targetMid = (FUNC_START >> 8) & 0xFF;
const targetHi  = (FUNC_START >> 16) & 0xFF;

const callOpcodes = [0xCD, 0xC4, 0xCC, 0xD4, 0xDC, 0xE4, 0xEC, 0xF4, 0xFC];
const jpOpcodes   = [0xC3, 0xC2, 0xCA, 0xD2, 0xDA, 0xE2, 0xEA, 0xF2, 0xFA];

let callerCount = 0;
for (let i = 0; i < rom.length - 4; i++) {
  const opcode = rom[i];
  if (callOpcodes.includes(opcode) || jpOpcodes.includes(opcode)) {
    if (rom[i + 1] === targetLo && rom[i + 2] === targetMid && rom[i + 3] === targetHi) {
      const type = callOpcodes.includes(opcode) ? 'CALL' : 'JP';
      // Verify by decoding
      const r = decodeInstruction(rom, i, 'adl');
      if (r && (r.target === FUNC_START)) {
        console.log('  ' + hex(i) + ': ' + bytesHex(i, r.length).padEnd(20) + '  ' + formatInsn(r));
        callerCount++;
      }
    }
  }
}
if (!callerCount) console.log('  (none found)');
console.log('  Total callers: ' + callerCount);

// -- 9. Also scan for callers via RST (if target is RST-aligned) --

// RST targets are 0x00, 0x08, 0x10, 0x18, 0x20, 0x28, 0x30, 0x38
// 0x070372 is not RST-aligned, skip

// -- 10. Summary --

console.log('\n=== Summary ===\n');
console.log('  Function: ' + hex(FUNC_START) + ' - ' + hex(funcEnd - 1));
console.log('  Size: ' + funcSize + ' bytes (' + instructions.length + ' instructions)');
console.log('  Terminated by: ' + (terminated ? instructions[instructions.length - 1].mnemonic : 'MAX_INSN'));
console.log('');
console.log('  CALL/JP/JR targets: ' + targets.size + ' unique');
for (const [addr] of targets) {
  console.log('    ' + addr);
}
console.log('  IY operations: ' + iyCount);
console.log('  RAM refs (D0xxxx): ' + ramCount);
console.log('  Pixel workspace refs: ' + pxCount);
console.log('  Font table / low ROM refs: ' + fontCount);
console.log('  Block copies (LDIR/LDI/LDDR): ' + blkCount);
console.log('  Callers: ' + callerCount);

console.log('\nDone.');
process.exit(0);

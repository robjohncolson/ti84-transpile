/**
 * probe-phase577-decode-parent-062080.mjs
 *
 * Decode the parent function above ROM address 0x062080 (event loop display
 * mode dispatcher). Session 576 found 0x0620C4 is a mid-block address reached
 * by fall-through. Session 260 found 0x062055 is a known function start.
 *
 * 1. Disassemble 0x062000-0x0620FF (256 bytes)
 * 2. Scan backward from 0x062080 for function entry (RET/JP unconditional)
 * 3. Print each instruction: address, hex bytes, formatted instruction
 * 4. List all CALL/JP targets, conditional branches, RAM refs, IY refs
 */

import { readFileSync } from 'fs';
import { decodeInstruction } from './ez80-decoder.js';

const rom = readFileSync(new URL('./ROM.rom', import.meta.url));

const WINDOW_START = 0x062000;
const WINDOW_END   = 0x062100;
const SCAN_FROM    = 0x062080;
const KNOWN_ENTRY  = 0x062055;

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

  // fallback: show tag + all fields
  const extras = Object.entries(r)
    .filter(function(e) { return !['pc', 'length', 'nextPc', 'mode', 'modePrefix', 'terminates'].includes(e[0]); })
    .map(function(e) { return e[0] + '=' + e[1]; })
    .join(' ');
  return '[' + r.tag + '] ' + extras;
}

// -- 1. Disassemble full window --

console.log('=== phase577: Decode parent function above 0x062080 ===');
console.log('Scan window: ' + hex(WINDOW_START) + ' - ' + hex(WINDOW_END) + '\n');

const instructions = [];
let pc = WINDOW_START;
while (pc < WINDOW_END) {
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
}

// -- 2. Find function entry by scanning backward from SCAN_FROM --

console.log('=== Function Entry Search ===\n');

let entry = WINDOW_START;
for (let i = 0; i < instructions.length; i++) {
  const item = instructions[i];
  if (item.address >= SCAN_FROM) break;

  const r = item.decoded;
  const isTerminator = r.tag === 'ret' || r.tag === 'halt' ||
    (r.tag === 'jp' && !r.condition);

  if (isTerminator) {
    const next = instructions[i + 1];
    if (next && next.address <= SCAN_FROM) {
      entry = next.address;
    }
  }
}

console.log('  Detected entry (last terminator + 1 before ' + hex(SCAN_FROM) + '): ' + hex(entry));
console.log('  Known entry from session 260: ' + hex(KNOWN_ENTRY));
console.log('');

// Use the earlier of the two as the function start for listing
const listStart = Math.min(entry, KNOWN_ENTRY);

// -- 3. Full instruction listing from function entry --

console.log('=== Instruction Listing from ' + hex(listStart) + ' ===\n');

let hitTerminator = false;
let terminatorCount = 0;
for (const item of instructions) {
  if (item.address < listStart) continue;

  // Stop after we see 2 unconditional terminators past 0x0620C4
  if (hitTerminator && terminatorCount >= 2) break;

  const marker =
    item.address === KNOWN_ENTRY ? ' <<<< KNOWN ENTRY (session 260)' :
    item.address === SCAN_FROM ? ' <<<< 0x062080' :
    item.address === 0x0620C4 ? ' <<<< 0x0620C4 (display dispatcher)' :
    '';

  console.log('  ' + hex(item.address) + '  ' + item.bytes.padEnd(20) + '  ' + item.mnemonic + marker);

  const r = item.decoded;
  if (item.address >= 0x0620C4) {
    if (r.tag === 'ret' || (r.tag === 'jp' && !r.condition)) {
      hitTerminator = true;
      terminatorCount++;
    }
  }
}

// -- 4. CALL/JP/JR targets --

console.log('\n=== CALL/JP/JR Targets (from ' + hex(listStart) + ') ===\n');

const targets = [];
for (const item of instructions) {
  if (item.address < listStart) continue;
  const r = item.decoded;
  if (r.tag === 'call' || r.tag === 'call-conditional') {
    targets.push({ from: item.address, text: item.mnemonic, type: 'CALL' });
  }
  if (r.tag === 'jp') {
    targets.push({ from: item.address, text: item.mnemonic, type: 'JP' });
  }
  if (r.tag === 'jr' || r.tag === 'jr-conditional') {
    targets.push({ from: item.address, text: item.mnemonic, type: 'JR' });
  }
}
for (const t of targets) {
  console.log('  ' + hex(t.from) + ': ' + t.text);
}
if (!targets.length) console.log('  (none)');

// -- 5. RAM references (D0xxxx) --

console.log('\n=== RAM References (D0xxxx) ===\n');

let ramCount = 0;
for (const item of instructions) {
  if (item.address < listStart) continue;
  const r = item.decoded;
  const addr = r.addr;
  if (addr !== undefined && addr >= 0xD00000 && addr <= 0xDFFFFF) {
    const access = r.tag.includes('mem-reg') ? 'WRITE' :
      (r.tag.includes('reg-mem') || r.tag.includes('pair-mem')) ? 'READ' : 'REF';
    console.log('  ' + hex(item.address) + ': ' + item.mnemonic + '  [' + access + ']');
    ramCount++;
  }
}
if (!ramCount) console.log('  (none)');

// -- 6. IY flag operations --

console.log('\n=== IY Flag Operations ===\n');

let iyCount = 0;
for (const item of instructions) {
  if (item.address < listStart) continue;
  const r = item.decoded;
  if (r.tag && r.tag.startsWith('indexed-cb-')) {
    console.log('  ' + hex(item.address) + ': ' + item.mnemonic);
    iyCount++;
  }
}
if (!iyCount) console.log('  (none)');

// -- 7. Extended decode past 0x0620C4 until function ends --

console.log('\n=== Extended Decode Past 0x0620C4 ===\n');

let epc = 0x0620C4;
const extInsns = [];
for (let i = 0; i < 300 && epc < rom.length; i++) {
  const r = decodeInstruction(rom, epc, 'adl');
  if (!r || !r.length) {
    console.log('  ' + hex(epc) + '  ' + bytesHex(epc, 1).padEnd(20) + '  ??? (decode fail)');
    break;
  }
  const row = {
    address: epc,
    bytes: bytesHex(epc, r.length),
    mnemonic: formatInsn(r),
    decoded: r,
  };
  extInsns.push(row);
  console.log('  ' + hex(epc) + '  ' + row.bytes.padEnd(20) + '  ' + row.mnemonic);

  if (r.tag === 'ret') break;
  if (r.tag === 'jp' && !r.condition) break;
  epc = r.nextPc;
}

const extSize = extInsns.length
  ? extInsns[extInsns.length - 1].address + extInsns[extInsns.length - 1].decoded.length - 0x0620C4
  : 0;
console.log('\n  Block from 0x0620C4: ' + extSize + ' bytes (' + extInsns.length + ' instructions)');

// -- 8. Summary --

console.log('\n=== Summary ===\n');
console.log('  Detected function entry: ' + hex(entry));
console.log('  Known entry (session 260): ' + hex(KNOWN_ENTRY));
console.log('  Total function size (entry to end): estimated from listing');

const allCalls = instructions.filter(function(r) {
  return r.address >= listStart && ['call', 'call-conditional'].includes(r.decoded.tag);
});
const allIy = instructions.filter(function(r) {
  return r.address >= listStart && r.decoded.tag && r.decoded.tag.startsWith('indexed-cb-');
});
const allRam = instructions.filter(function(r) {
  if (r.address < listStart) return false;
  const a = r.decoded.addr;
  return a !== undefined && a >= 0xD00000 && a <= 0xDFFFFF;
});

console.log('  CALL instructions in function: ' + allCalls.length);
for (const c of allCalls) console.log('    ' + hex(c.address) + ': ' + c.mnemonic);
console.log('  IY flag ops: ' + allIy.length);
for (const iy of allIy) console.log('    ' + hex(iy.address) + ': ' + iy.mnemonic);
console.log('  RAM refs (D0xxxx): ' + allRam.length);
for (const rr of allRam) console.log('    ' + hex(rr.address) + ': ' + rr.mnemonic);

console.log('\nDone.');
process.exit(0);

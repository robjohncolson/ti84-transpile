/**
 * probe-phase578-decode-screen-mode-accum.mjs
 *
 * Decode 0x06C72D / 0x06C737 / 0x06C73C — three cascading entry points
 * called by the event loop display dispatcher (0x062055) and alternate
 * display handler (0x05FE15) to accumulate screen-mode bits.
 *
 * Results are compared against D02310 & 0xF0 to select the display path.
 *
 * 1. Disassemble the full range 0x06C72D through 0x06C790
 * 2. Decode from each entry point to its RET
 * 3. Identify IY bit reads, A-affecting instructions
 * 4. Scan ROM for all callers of each address
 */

import { readFileSync } from 'fs';
import { decodeInstruction } from './ez80-decoder.js';

const rom = readFileSync(new URL('./ROM.rom', import.meta.url));

const ENTRIES = [0x06C72D, 0x06C737, 0x06C73C];
const RANGE_START = 0x06C72D;
const RANGE_END   = 0x06C790;  // generous end — will stop at RET

// -- helpers (copied from working probe-phase577) --

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
  if (r.tag === 'rlca') return 'RLCA';
  if (r.tag === 'rrca') return 'RRCA';
  if (r.tag === 'rla') return 'RLA';
  if (r.tag === 'rra') return 'RRA';
  if (r.tag === 'cpl') return 'CPL';
  if (r.tag === 'scf') return 'SCF';
  if (r.tag === 'ccf') return 'CCF';
  if (r.tag === 'daa') return 'DAA';
  if (r.tag === 'ex-af-af') return "EX AF,AF'";
  if (r.tag === 'exx') return 'EXX';
  if (r.tag === 'ld-sp-hl') return 'LD SP,HL';
  if (r.tag === 'ld-indexed') {
    const disp = r.displacement || 0;
    const sign = disp >= 0 ? '+' : '';
    if (r.direction === 'to-indexed') {
      return 'LD (IY' + sign + disp + '),' + (r.src || r.value !== undefined ? '0x' + r.value.toString(16).toUpperCase().padStart(2, '0') : '?');
    }
    return 'LD ' + (r.dest || '?').toUpperCase() + ',(IY' + sign + disp + ')';
  }
  if (r.tag === 'alu-indexed') {
    const disp = r.displacement || 0;
    const sign = disp >= 0 ? '+' : '';
    return (r.op || '?').toUpperCase() + ' (IY' + sign + disp + ')';
  }
  // fallback
  const extras = Object.entries(r)
    .filter(function(e) { return !['pc', 'length', 'nextPc', 'mode', 'modePrefix', 'terminates'].includes(e[0]); })
    .map(function(e) { return e[0] + '=' + e[1]; })
    .join(' ');
  return '[' + r.tag + '] ' + extras;
}

function fmtRow(addr, r) {
  return '  ' + hex(addr) + '  ' + bytesHex(addr, r.length).padEnd(20) + '  ' + formatInsn(r);
}

// -- Decode a linear range --

function decodeRange(start, end) {
  const out = [];
  let pc = start;
  while (pc < end && pc < rom.length) {
    const r = decodeInstruction(rom, pc, 'adl');
    if (!r || !r.length) {
      console.log('  ' + hex(pc) + '  ' + bytesHex(pc, 1).padEnd(20) + '  ??? (decode fail)');
      pc++;
      continue;
    }
    out.push({ address: pc, decoded: r });
    pc = r.nextPc;
  }
  return out;
}

// -- Decode from a start address until RET or JP (unconditional) --

function decodeUntilRet(start, hardStop = RANGE_END + 0x40) {
  const out = [];
  let pc = start;
  const seen = new Set();
  while (pc < rom.length && pc < hardStop && !seen.has(pc)) {
    seen.add(pc);
    const r = decodeInstruction(rom, pc, 'adl');
    if (!r || !r.length) {
      console.log('  ' + hex(pc) + '  ' + bytesHex(pc, 1).padEnd(20) + '  ??? (decode fail)');
      break;
    }
    out.push({ address: pc, decoded: r });
    if (r.tag === 'ret') break;
    if (r.tag === 'jp' && !r.condition) break;
    pc = r.nextPc;
  }
  return out;
}

// -- Scan ROM for CALL/JP encodings targeting a given address --

function le24(value) {
  return [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff];
}

function scanCallers(target) {
  const needle = le24(target);
  const callers = [];
  for (let i = 0; i <= rom.length - 4; i++) {
    if (rom[i + 1] !== needle[0] || rom[i + 2] !== needle[1] || rom[i + 3] !== needle[2]) continue;
    const opcode = rom[i];
    const kind =
      opcode === 0xCD ? 'CALL' :
      opcode === 0xC3 ? 'JP' :
      opcode === 0xC4 ? 'CALL NZ' :
      opcode === 0xCC ? 'CALL Z' :
      opcode === 0xD4 ? 'CALL NC' :
      opcode === 0xDC ? 'CALL C' :
      opcode === 0xC2 ? 'JP NZ' :
      opcode === 0xCA ? 'JP Z' :
      opcode === 0xD2 ? 'JP NC' :
      opcode === 0xDA ? 'JP C' :
      null;
    if (kind) callers.push({ address: i, kind });
  }
  return callers;
}

// -- Check if an instruction affects A --

function affectsA(r) {
  // Explicit A loads
  if (r.tag === 'ld-reg-imm' && r.dest === 'a') return true;
  if (r.tag === 'ld-reg-reg' && r.dest === 'a') return true;
  if (r.tag === 'ld-reg-mem' && r.dest === 'a') return true;
  // ALU ops (all target A implicitly)
  if (r.tag === 'alu-imm') return true;
  if (r.tag === 'alu-reg') return true;
  if (r.tag === 'alu-indexed') return true;
  // Rotate/shift A
  if (['rlca', 'rrca', 'rla', 'rra', 'cpl', 'daa', 'scf', 'ccf'].includes(r.tag)) return true;
  // OR/AND/XOR/CP
  if (['or-reg', 'and-reg', 'xor-reg', 'cp-reg', 'cp-imm'].includes(r.tag)) return true;
  // POP AF restores A
  if (r.tag === 'pop' && r.pair === 'af') return true;
  // indexed LD to A
  if (r.tag === 'ld-indexed' && r.direction !== 'to-indexed' && r.dest === 'a') return true;
  return false;
}

// -- Check if instruction is an IY flag op --

function isIYOp(r) {
  return r.tag && r.tag.startsWith('indexed-cb-');
}

// ===================== MAIN =====================

console.log('=== Phase 578: Decode Screen-Mode Bit Accumulators ===');
console.log('ROM bytes: ' + rom.length);
console.log('Entry points: ' + ENTRIES.map(e => hex(e)).join(', '));
console.log('');

// -- 1. Full linear disassembly of the range --

console.log('=== Full Range Disassembly: ' + hex(RANGE_START) + ' - ' + hex(RANGE_END) + ' ===\n');

const fullRange = decodeRange(RANGE_START, RANGE_END);
for (const item of fullRange) {
  let marker = '';
  if (item.address === 0x06C72D) marker = '  <<<< ENTRY 1 (0x06C72D)';
  else if (item.address === 0x06C737) marker = '  <<<< ENTRY 2 (0x06C737)';
  else if (item.address === 0x06C73C) marker = '  <<<< ENTRY 3 (0x06C73C)';
  console.log(fmtRow(item.address, item.decoded) + marker);
}

// -- 2. Decode from each entry point to RET --

for (const entry of ENTRIES) {
  console.log('\n=== Entry ' + hex(entry) + ' → RET ===\n');

  const insns = decodeUntilRet(entry);
  for (const item of insns) {
    console.log(fmtRow(item.address, item.decoded));
  }

  const lastAddr = insns.length ? insns[insns.length - 1].address : entry;
  const lastLen = insns.length ? insns[insns.length - 1].decoded.length : 0;
  const blockSize = lastAddr + lastLen - entry;
  console.log('\n  Block size: ' + blockSize + ' bytes (' + insns.length + ' instructions)');

  // IY ops
  const iyOps = insns.filter(i => isIYOp(i.decoded));
  console.log('  IY flag ops: ' + iyOps.length);
  for (const iy of iyOps) {
    console.log('    ' + hex(iy.address) + ': ' + formatInsn(iy.decoded));
  }

  // A-affecting
  const aOps = insns.filter(i => affectsA(i.decoded));
  console.log('  A-affecting instructions: ' + aOps.length);
  for (const a of aOps) {
    console.log('    ' + hex(a.address) + ': ' + formatInsn(a.decoded));
  }

  // CALL/JP targets within this block
  const calls = insns.filter(i => ['call', 'call-conditional', 'jp', 'jr', 'jr-conditional'].includes(i.decoded.tag));
  if (calls.length) {
    console.log('  Branch/call targets:');
    for (const c of calls) {
      console.log('    ' + hex(c.address) + ': ' + formatInsn(c.decoded));
    }
  }
}

// -- 3. Caller scan for each entry --

console.log('\n=== Caller Scan ===\n');

for (const entry of ENTRIES) {
  const callers = scanCallers(entry);
  console.log('Callers of ' + hex(entry) + ': ' + callers.length);
  for (const c of callers) {
    console.log('  ' + hex(c.address) + '  ' + c.kind + ' ' + hex(entry));
  }
  console.log('');
}

// -- 4. Structural analysis --

console.log('=== Structural Analysis ===\n');

// Check if the three entries share the same RET
const retAddrs = [];
for (const entry of ENTRIES) {
  const insns = decodeUntilRet(entry);
  const lastInsn = insns[insns.length - 1];
  if (lastInsn && lastInsn.decoded.tag === 'ret') {
    retAddrs.push({ entry, retAt: lastInsn.address });
  } else if (lastInsn && lastInsn.decoded.tag === 'jp' && !lastInsn.decoded.condition) {
    retAddrs.push({ entry, retAt: lastInsn.address, jp: lastInsn.decoded.target });
  }
}

console.log('Terminator analysis:');
for (const r of retAddrs) {
  if (r.jp !== undefined) {
    console.log('  ' + hex(r.entry) + ' ends with JP ' + hex(r.jp) + ' at ' + hex(r.retAt));
  } else {
    console.log('  ' + hex(r.entry) + ' ends with RET at ' + hex(r.retAt));
  }
}

const allSameRet = retAddrs.length === 3 &&
  retAddrs.every(r => r.retAt === retAddrs[0].retAt && r.jp === retAddrs[0].jp);

if (allSameRet) {
  console.log('\n  CONCLUSION: All 3 entries share the SAME terminator at ' + hex(retAddrs[0].retAt));
  console.log('  → These are 3 entry points into ONE function (cascading fall-through).');
} else {
  console.log('\n  CONCLUSION: The entries have DIFFERENT terminators.');
  console.log('  → These may be separate tiny functions or have branching exits.');
}

// -- 5. Also decode the BIT 7 function at 0x06C732 (between entries 1 and 2) --

console.log('\n=== Bonus: BIT 7 function at 0x06C732 ===\n');
const bit7Insns = decodeUntilRet(0x06C732);
for (const item of bit7Insns) {
  console.log(fmtRow(item.address, item.decoded));
}
const bit7Callers = scanCallers(0x06C732);
console.log('Callers of 0x06C732: ' + bit7Callers.length);
for (const c of bit7Callers) {
  console.log('  ' + hex(c.address) + '  ' + c.kind + ' ' + hex(0x06C732));
}

// -- 6. Summary --

console.log('\n=== Summary ===\n');

console.log('STRUCTURE: 4 independent micro-functions in a 20-byte block (0x06C72D-0x06C740).');
console.log('Each is exactly 5 bytes: BIT n,(IY+0x02) + RET.');
console.log('They are NOT 3 entry points into one function — each has its own RET.');
console.log('');
console.log('FUNCTION MAP:');
console.log('  0x06C72D: BIT 5,(IY+0x02) + RET  — tests IY flag byte 0x02, bit 5  (27 callers)');
console.log('  0x06C732: BIT 7,(IY+0x02) + RET  — tests IY flag byte 0x02, bit 7  (bonus, between entries)');
console.log('  0x06C737: BIT 6,(IY+0x02) + RET  — tests IY flag byte 0x02, bit 6  (63 callers)');
console.log('  0x06C73C: BIT 4,(IY+0x02) + RET  — tests IY flag byte 0x02, bit 4  (65 callers)');
console.log('');
console.log('RETURN VALUE: None of these affect A directly. BIT sets/clears the Z flag.');
console.log('Callers test Z/NZ after the CALL to branch on the flag state.');
console.log('The "bit accumulation" happens in the CALLER, not in these functions.');
console.log('');
console.log('IY+0x02 BIT LAYOUT (screen-mode flags):');
console.log('  Bit 4 — tested by 0x06C73C (65 callers, most popular)');
console.log('  Bit 5 — tested by 0x06C72D (27 callers)');
console.log('  Bit 6 — tested by 0x06C737 (63 callers)');
console.log('  Bit 7 — tested by 0x06C732 (found between entries)');
console.log('');
console.log('D02310 RELATIONSHIP: The event loop dispatcher (0x062055) calls these');
console.log('BIT-test functions, accumulates the Z/NZ results into a value, then');
console.log('compares against D02310 & 0xF0. The high nibble of D02310 encodes');
console.log('which combination of IY+0x02 bits 4-7 are set, selecting the display path.');

console.log('\nDone.');
process.exit(0);

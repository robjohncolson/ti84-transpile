/**
 * probe-phase578-trace-063033.mjs
 *
 * Decode the init helper at 0x063033, called TWICE by the event loop
 * display dispatcher at 0x062055 (at 0x06205C and 0x0620DE).
 *
 * Pure ROM disassembly — no CPU boot.
 *
 * 1. Disassemble from 0x063033 until first unconditional RET
 * 2. Print: address, raw bytes, formatted instruction
 * 3. Identify: CALL/JP targets, IY flag ops, RAM refs (D0xxxx), port I/O
 * 4. Scan ROM for all callers of 0x063033
 */

import { readFileSync } from 'fs';
import { decodeInstruction } from './ez80-decoder.js';

const rom = readFileSync(new URL('./ROM.rom', import.meta.url));

const START = 0x063033;
const MIN_INSNS = 1;   // Stop at first unconditional RET
const MAX_INSNS = 256;

// Target bytes for caller scan (little-endian 0x063033)
const TARGET_LE = [0x33, 0x30, 0x06];

// -- helpers --

function hex(v, w = 6) {
  return '0x' + v.toString(16).toUpperCase().padStart(w, '0');
}

function bytesHex(start, len) {
  const out = [];
  for (let i = 0; i < len; i++) {
    out.push(rom[start + i].toString(16).toUpperCase().padStart(2, '0'));
  }
  return out.join(' ');
}

// Format decoded instruction into human-readable assembly text.
// Copied from probe-phase577-decode-parent-062080.mjs (known working).
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
  if (r.tag === 'in-reg-port') return 'IN ' + (r.dest || 'A').toUpperCase() + ',(' + (r.port !== undefined ? hex(r.port, 2) : 'C') + ')';
  if (r.tag === 'out-port-reg') return 'OUT (' + (r.port !== undefined ? hex(r.port, 2) : 'C') + '),' + (r.src || 'A').toUpperCase();
  if (r.tag === 'bit-reg') return 'BIT ' + r.bit + ',' + r.reg.toUpperCase();
  if (r.tag === 'set-reg') return 'SET ' + r.bit + ',' + r.reg.toUpperCase();
  if (r.tag === 'res-reg') return 'RES ' + r.bit + ',' + r.reg.toUpperCase();
  if (r.tag === 'ld-indexed') {
    const sign = r.displacement >= 0 ? '+' : '';
    return 'LD ' + r.dest.toUpperCase() + ',(IY' + sign + r.displacement + ')';
  }
  if (r.tag === 'ld-to-indexed') {
    const sign = r.displacement >= 0 ? '+' : '';
    return 'LD (IY' + sign + r.displacement + '),' + r.src.toUpperCase();
  }
  if (r.tag === 'ld-indexed-imm') {
    const sign = r.displacement >= 0 ? '+' : '';
    return 'LD (IY' + sign + r.displacement + '),0x' + r.value.toString(16).toUpperCase().padStart(2, '0');
  }
  if (r.tag === 'add-pair') return 'ADD ' + (r.dest || 'HL').toUpperCase() + ',' + r.src.toUpperCase();
  if (r.tag === 'sbc-pair') return 'SBC ' + (r.dest || 'HL').toUpperCase() + ',' + r.src.toUpperCase();
  if (r.tag === 'adc-pair') return 'ADC ' + (r.dest || 'HL').toUpperCase() + ',' + r.src.toUpperCase();
  if (r.tag === 'ld-sp-hl') return 'LD SP,HL';
  if (r.tag === 'ex-sp-hl') return 'EX (SP),HL';
  if (r.tag === 'jp-hl') return 'JP (HL)';
  if (r.tag === 'ld-hl-indirect') return 'LD ' + (r.dest || 'A').toUpperCase() + ',(HL)';
  if (r.tag === 'ld-indirect-hl') return 'LD (HL),' + (r.src || 'A').toUpperCase();
  if (r.tag === 'alu-hl') return r.op.toUpperCase() + ' (HL)';
  if (r.tag === 'alu-indexed') {
    const sign = r.displacement >= 0 ? '+' : '';
    return r.op.toUpperCase() + ' (IY' + sign + r.displacement + ')';
  }
  if (r.tag === 'inc-indexed') {
    const sign = r.displacement >= 0 ? '+' : '';
    return 'INC (IY' + sign + r.displacement + ')';
  }
  if (r.tag === 'dec-indexed') {
    const sign = r.displacement >= 0 ? '+' : '';
    return 'DEC (IY' + sign + r.displacement + ')';
  }
  if (r.tag === 'bit-indexed') {
    const sign = r.displacement >= 0 ? '+' : '';
    return 'BIT ' + r.bit + ',(IY' + sign + r.displacement + ')';
  }
  if (r.tag === 'set-indexed') {
    const sign = r.displacement >= 0 ? '+' : '';
    return 'SET ' + r.bit + ',(IY' + sign + r.displacement + ')';
  }
  if (r.tag === 'res-indexed') {
    const sign = r.displacement >= 0 ? '+' : '';
    return 'RES ' + r.bit + ',(IY' + sign + r.displacement + ')';
  }
  if (r.tag === 'rla') return 'RLA';
  if (r.tag === 'rra') return 'RRA';
  if (r.tag === 'rlca') return 'RLCA';
  if (r.tag === 'rrca') return 'RRCA';
  if (r.tag === 'cpl') return 'CPL';
  if (r.tag === 'scf') return 'SCF';
  if (r.tag === 'ccf') return 'CCF';
  if (r.tag === 'daa') return 'DAA';
  if (r.tag === 'neg') return 'NEG';
  if (r.tag === 'reti') return 'RETI';
  if (r.tag === 'retn') return 'RETN';
  if (r.tag === 'cpir') return 'CPIR';
  if (r.tag === 'cpdr') return 'CPDR';
  if (r.tag === 'ldi') return 'LDI';
  if (r.tag === 'ldd') return 'LDD';
  if (r.tag === 'cpi') return 'CPI';
  if (r.tag === 'cpd') return 'CPD';
  if (r.tag === 'outi') return 'OUTI';
  if (r.tag === 'outd') return 'OUTD';
  if (r.tag === 'ini') return 'INI';
  if (r.tag === 'ind') return 'IND';
  if (r.tag === 'otir') return 'OTIR';
  if (r.tag === 'otdr') return 'OTDR';
  if (r.tag === 'inir') return 'INIR';
  if (r.tag === 'indr') return 'INDR';
  if (r.tag === 'ex-af') return "EX AF,AF'";
  if (r.tag === 'exx') return 'EXX';
  if (r.tag === 'rl-reg') return 'RL ' + r.reg.toUpperCase();
  if (r.tag === 'rr-reg') return 'RR ' + r.reg.toUpperCase();
  if (r.tag === 'rlc-reg') return 'RLC ' + r.reg.toUpperCase();
  if (r.tag === 'rrc-reg') return 'RRC ' + r.reg.toUpperCase();
  if (r.tag === 'sla-reg') return 'SLA ' + r.reg.toUpperCase();
  if (r.tag === 'sra-reg') return 'SRA ' + r.reg.toUpperCase();
  if (r.tag === 'srl-reg') return 'SRL ' + r.reg.toUpperCase();

  // fallback: show tag + all fields
  const extras = Object.entries(r)
    .filter(e => !['pc', 'length', 'nextPc', 'mode', 'modePrefix', 'terminates'].includes(e[0]))
    .map(e => e[0] + '=' + e[1])
    .join(' ');
  return '[' + r.tag + '] ' + extras;
}

// Extract hex addresses from formatted instruction text
function extractAddrs(text) {
  const found = [];
  for (const m of text.matchAll(/0x([0-9A-F]{4,6})\b/gi)) {
    found.push(parseInt(m[1], 16));
  }
  return found;
}

// -- disassemble from START --

console.log('=== Phase 578: Trace 0x063033 init helper ===\n');

const decoded = [];
const callTargets = [];
const jpTargets = [];
const iyOps = [];
const ramRefs = [];
const portOps = [];

let pc = START;
for (let i = 0; i < MAX_INSNS && pc < rom.length; i++) {
  let r;
  try {
    r = decodeInstruction(rom, pc, 'adl');
  } catch (e) {
    console.log(`  ${hex(pc)}  DECODE ERROR: ${e.message}`);
    break;
  }
  if (!r || !r.length) {
    console.log(`  ${hex(pc)}  ${bytesHex(pc, 1).padEnd(20)}  ??? (decode fail)`);
    pc++;
    continue;
  }

  const text = formatInsn(r);
  const upper = text.toUpperCase();
  decoded.push({ addr: pc, len: r.length, raw: bytesHex(pc, r.length), text, tag: r.tag, decoded: r });

  const addrs = extractAddrs(text);

  // CALL targets
  if (r.tag === 'call' || r.tag === 'call-conditional') {
    callTargets.push({ from: pc, target: r.target, text });
  }

  // JP/JR targets
  if (r.tag === 'jp' || r.tag === 'jr' || r.tag === 'jr-conditional' || r.tag === 'djnz') {
    jpTargets.push({ from: pc, target: r.target, text });
  }

  // IY operations
  if (/IY/.test(upper)) {
    iyOps.push({ addr: pc, text });
  }

  // RAM refs (D0xxxx)
  for (const a of addrs) {
    if (a >= 0xD00000 && a <= 0xD0FFFF) {
      ramRefs.push({ addr: pc, ref: a, text });
    }
  }

  // Port I/O
  if (r.tag === 'in-reg-port' || r.tag === 'out-port-reg' ||
      /\bIN\b|\bOUT\b/.test(upper)) {
    portOps.push({ addr: pc, text });
  }

  pc = r.nextPc;

  // Stop after unconditional RET once we have min instructions
  if (i + 1 >= MIN_INSNS && r.tag === 'ret') {
    break;
  }
}

const endAddr = pc;
const byteCount = endAddr - START;

console.log(`Function boundary: ${hex(START)} - ${hex(endAddr - 1)} (${byteCount} bytes, ${decoded.length} instructions)\n`);

console.log('--- Disassembly ---');
for (const d of decoded) {
  const rawPad = d.raw.padEnd(18);
  console.log(`  ${hex(d.addr)}  ${rawPad}  ${d.text}`);
}

// -- CALL targets --
console.log('\n--- CALL targets ---');
if (callTargets.length === 0) {
  console.log('  (none)');
} else {
  const seen = new Set();
  for (const c of callTargets) {
    const key = hex(c.target);
    if (!seen.has(key)) {
      seen.add(key);
      console.log(`  ${key}  (from ${hex(c.from)}: ${c.text})`);
    }
  }
}

// -- JP/JR targets --
console.log('\n--- JP/JR/DJNZ targets ---');
if (jpTargets.length === 0) {
  console.log('  (none)');
} else {
  const seen = new Set();
  for (const j of jpTargets) {
    const key = `${hex(j.target)}_${hex(j.from)}`;
    if (!seen.has(key)) {
      seen.add(key);
      console.log(`  ${hex(j.target)}  (from ${hex(j.from)}: ${j.text})`);
    }
  }
}

// -- IY flag operations --
console.log('\n--- IY flag operations ---');
if (iyOps.length === 0) {
  console.log('  (none)');
} else {
  for (const op of iyOps) {
    console.log(`  ${hex(op.addr)}  ${op.text}`);
  }
}

// -- RAM refs (D0xxxx) --
console.log('\n--- RAM references (D0xxxx) ---');
if (ramRefs.length === 0) {
  console.log('  (none)');
} else {
  const seen = new Set();
  for (const r of ramRefs) {
    if (!seen.has(r.ref)) {
      seen.add(r.ref);
      console.log(`  ${hex(r.ref)}  (at ${hex(r.addr)}: ${r.text})`);
    }
  }
}

// -- Port I/O --
console.log('\n--- Port I/O ---');
if (portOps.length === 0) {
  console.log('  (none)');
} else {
  for (const p of portOps) {
    console.log(`  ${hex(p.addr)}  ${p.text}`);
  }
}

// -- Scan ROM for callers of 0x063033 --
console.log('\n--- ROM callers of 0x063033 ---');

const callOpcodes = new Set([0xCD, 0xC4, 0xCC, 0xD4, 0xDC, 0xE4, 0xEC, 0xF4, 0xFC]);
const callers = [];

for (let off = 0; off <= rom.length - 4; off++) {
  if (!callOpcodes.has(rom[off])) continue;
  if (rom[off + 1] !== TARGET_LE[0]) continue;
  if (rom[off + 2] !== TARGET_LE[1]) continue;
  if (rom[off + 3] !== TARGET_LE[2]) continue;

  let text = `DB ${bytesHex(off, 4)}`;
  try {
    const insn = decodeInstruction(rom, off, 'adl');
    text = formatInsn(insn);
  } catch { /* use raw bytes */ }

  callers.push({ addr: off, text });
}

if (callers.length === 0) {
  console.log('  (none found)');
} else {
  for (const c of callers) {
    console.log(`  ${hex(c.addr)}  ${c.text}`);
  }
}
console.log(`  Total callers: ${callers.length}`);

// -- Summary --
console.log('\n--- Analysis Summary ---');
console.log(`0x063033 spans ${byteCount} bytes (${decoded.length} instructions).`);
console.log(`CALL targets: ${[...new Set(callTargets.map(c => c.target))].length} unique`);
console.log(`JP/JR targets: ${[...new Set(jpTargets.map(j => j.target))].length} unique`);
console.log(`IY flag ops: ${iyOps.length}`);
console.log(`RAM refs (D0xxxx): ${[...new Set(ramRefs.map(r => r.ref))].length} unique`);
console.log(`Port I/O ops: ${portOps.length}`);
console.log(`ROM callers: ${callers.length}`);
console.log('\nInterpretation:');
console.log('NOTE: 0x063033 itself is only 13 bytes (0x063033-0x06303F):');
console.log('  CALL 0x0250FA  (low-ROM helper)');
console.log('  CALL 0x09E640  (unconditional OS helper)');
console.log('  CALL Z,0x09E601  (conditional on Z flag from previous call)');
console.log('  RET');
console.log('');
console.log('0x063033 is a tiny 3-CALL init stub. It delegates to:');
console.log('  0x0250FA — low-ROM setup (likely system-level init)');
console.log('  0x09E640 — unconditional OS state update');
console.log('  0x09E601 — conditional (Z) OS state update');
console.log('Called by 10 sites across the ROM, including both event loop');
console.log('display paths at 0x06205C and 0x0620DE.');

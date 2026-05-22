#!/usr/bin/env node

// Phase 402 — Trace 0x049CCA OS Notification Dispatcher
//
// 1. Disassemble 0x049CCA to decode internal logic
// 2. Scan ROM for all CALL 0x049CCA sites
// 3. Extract (type, value) params pushed before each call
// 4. Group callers by notification type

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const ROM_LIMIT = 0x400000;

const TARGET = 0x049CCA;
const DISASM_END = 0x049E20; // disassemble well past expected end
const TYPE_REG_ADDR = 0xD177B9;

const romBytes = fs.readFileSync(ROM_PATH);

// ── Helpers ──────────────────────────────────────────────────────────────────

function hex(v, w = 6) {
  return '0x' + (Number(v) >>> 0).toString(16).padStart(w, '0');
}

function hexByte(v) {
  return '0x' + (v & 0xFF).toString(16).padStart(2, '0');
}

function read24(buf, off) {
  return (buf[off] | (buf[off + 1] << 8) | (buf[off + 2] << 16)) >>> 0;
}

function bytesToHex(buf, start, len) {
  const parts = [];
  for (let i = 0; i < len && start + i < buf.length; i++) {
    parts.push(buf[start + i].toString(16).padStart(2, '0'));
  }
  return parts.join(' ');
}

function safeDecode(pc, mode = 'adl') {
  if (pc < 0 || pc >= romBytes.length) return null;
  try {
    const d = decodeInstruction(romBytes, pc, mode);
    if (!d || !Number.isInteger(d.length) || d.length <= 0) return null;
    return d;
  } catch {
    return null;
  }
}

function formatIndexedOperand(indexReg, disp) {
  const sign = disp >= 0 ? '+' : '';
  return `(${indexReg}${sign}${disp})`;
}

function formatInstruction(d) {
  switch (d.tag) {
    case 'nop': case 'ret': case 'reti': case 'retn':
    case 'di': case 'ei': case 'halt': case 'exx':
    case 'cpl': case 'scf': case 'ccf': case 'daa':
    case 'rrca': case 'rlca': case 'rla': case 'rra':
      return d.tag;

    case 'jr': return `jr ${hex(d.target)}`;
    case 'jr-conditional': return `jr ${d.condition}, ${hex(d.target)}`;
    case 'djnz': return `djnz ${hex(d.target)}`;

    case 'jp': return `jp ${hex(d.target)}`;
    case 'jp-conditional': return `jp ${d.condition}, ${hex(d.target)}`;
    case 'jp-indirect': return `jp (${d.indirectRegister})`;

    case 'call': return `call ${hex(d.target)}`;
    case 'call-conditional': return `call ${d.condition}, ${hex(d.target)}`;
    case 'rst': return `rst ${hexByte(d.target)}`;

    case 'push': return `push ${d.pair}`;
    case 'pop': return `pop ${d.pair}`;

    case 'inc-pair': return `inc ${d.pair}`;
    case 'dec-pair': return `dec ${d.pair}`;
    case 'inc-reg': return `inc ${d.reg}`;
    case 'dec-reg': return `dec ${d.reg}`;

    case 'ld-pair-imm': return `ld ${d.pair}, ${hex(d.value)}`;
    case 'ld-reg-imm': return `ld ${d.dest}, ${hexByte(d.value)}`;
    case 'ld-reg-reg': return `ld ${d.dest}, ${d.src}`;
    case 'ld-reg-ind': return `ld ${d.dest}, (${d.src})`;
    case 'ld-ind-reg': return `ld (${d.dest}), ${d.src}`;
    case 'ld-reg-mem': return `ld ${d.dest}, (${hex(d.addr)})`;
    case 'ld-mem-reg': return `ld (${hex(d.addr)}), ${d.src}`;
    case 'ld-pair-mem':
      return d.direction === 'from-mem'
        ? `ld ${d.pair}, (${hex(d.addr)})`
        : `ld (${hex(d.addr)}), ${d.pair}`;
    case 'ld-pair-ind': return `ld ${d.pair}, (${d.src})`;
    case 'ld-ind-pair': return `ld (${d.dest}), ${d.pair}`;
    case 'ld-sp-hl': return 'ld sp, hl';
    case 'ld-sp-pair': return `ld sp, ${d.pair}`;

    case 'add-pair': return `add ${d.dest}, ${d.src}`;
    case 'alu-reg': return `${d.op} ${d.src}`;
    case 'alu-imm': return `${d.op} ${hexByte(d.value)}`;

    case 'in-imm': return `in a, (${hexByte(d.port)})`;
    case 'out-imm': return `out (${hexByte(d.port)}), a`;

    case 'ex-de-hl': return 'ex de, hl';
    case 'ex-sp-hl': return 'ex (sp), hl';
    case 'ex-sp-pair': return `ex (sp), ${d.pair}`;

    case 'bit-test': return `bit ${d.bit}, ${d.reg}`;
    case 'bit-test-ind': return `bit ${d.bit}, (${d.indirectRegister})`;
    case 'bit-res': return `res ${d.bit}, ${d.reg}`;
    case 'bit-res-ind': return `res ${d.bit}, (${d.indirectRegister})`;
    case 'bit-set': return `set ${d.bit}, ${d.reg}`;
    case 'bit-set-ind': return `set ${d.bit}, (${d.indirectRegister})`;
    case 'rotate-reg': return `${d.op} ${d.reg}`;
    case 'rotate-ind': return `${d.op} (${d.indirectRegister})`;

    case 'indexed-load': return `ld ${d.dest}, ${formatIndexedOperand(d.indexRegister, d.displacement)}`;
    case 'indexed-store': return `ld ${formatIndexedOperand(d.indexRegister, d.displacement)}, ${d.src}`;
    case 'indexed-alu': return `${d.op} ${formatIndexedOperand(d.indexRegister, d.displacement)}`;
    case 'indexed-inc': return `inc ${formatIndexedOperand(d.indexRegister, d.displacement)}`;
    case 'indexed-dec': return `dec ${formatIndexedOperand(d.indexRegister, d.displacement)}`;
    case 'indexed-cb-bit': return `bit ${d.bit}, ${formatIndexedOperand(d.indexRegister, d.displacement)}`;
    case 'indexed-cb-rotate': return `${d.op} ${formatIndexedOperand(d.indexRegister, d.displacement)}`;
    case 'indexed-cb-res': return `res ${d.bit}, ${formatIndexedOperand(d.indexRegister, d.displacement)}`;
    case 'indexed-cb-set': return `set ${d.bit}, ${formatIndexedOperand(d.indexRegister, d.displacement)}`;

    case 'lea': return `lea ${d.dest}, ${formatIndexedOperand(d.base, d.displacement)}`;

    case 'ret-conditional': return `ret ${d.condition}`;

    case 'block-ldi': return 'ldi';
    case 'block-ldir': return 'ldir';
    case 'block-ldd': return 'ldd';
    case 'block-lddr': return 'lddr';
    case 'block-cpi': return 'cpi';
    case 'block-cpir': return 'cpir';
    case 'block-cpd': return 'cpd';
    case 'block-cpdr': return 'cpdr';
    case 'block-ini': return 'ini';
    case 'block-inir': return 'inir';
    case 'block-ind': return 'ind';
    case 'block-indr': return 'indr';
    case 'block-outi': return 'outi';
    case 'block-otir': return 'otir';
    case 'block-outd': return 'outd';
    case 'block-otdr': return 'otdr';

    default: {
      // fallback: show tag + interesting fields
      const ignore = new Set(['pc','length','nextPc','mode','modePrefix','terminates','fallthrough','tag']);
      const parts = [];
      for (const [k,v] of Object.entries(d)) {
        if (ignore.has(k) || v === undefined) continue;
        if (typeof v === 'number') {
          parts.push(`${k}=${k === 'bit' || k === 'displacement' ? v : hex(v)}`);
        } else {
          parts.push(`${k}=${v}`);
        }
      }
      return parts.length ? `${d.tag} ${parts.join(' ')}` : d.tag;
    }
  }
}

// ── Part 1: Disassemble 0x049CCA ────────────────────────────────────────────

console.log('='.repeat(80));
console.log('PART 1: Disassembly of 0x049CCA (OS Notification Dispatcher)');
console.log('='.repeat(80));
console.log();

let pc = TARGET;
const disasmLines = [];
const functionBoundaries = []; // track RET instructions

while (pc < DISASM_END && pc < romBytes.length) {
  const d = safeDecode(pc);
  if (!d) {
    const b = romBytes[pc];
    disasmLines.push({ pc, text: `db ${hexByte(b)}`, len: 1, raw: d });
    pc++;
    continue;
  }

  const bytes = bytesToHex(romBytes, pc, d.length);
  const text = formatInstruction(d);
  disasmLines.push({ pc, text, len: d.length, bytes, raw: d });

  // Track interesting features
  if (d.tag === 'ret' || d.tag === 'reti' || d.tag === 'retn') {
    functionBoundaries.push(pc);
  }

  pc = d.nextPc;
}

// Print disassembly with annotations
for (const line of disasmLines) {
  const bytes = line.bytes || bytesToHex(romBytes, line.pc, line.len);
  const addr = hex(line.pc);
  let annotation = '';

  // Annotate references to known addresses
  if (line.raw) {
    if (line.raw.addr === TYPE_REG_ADDR) {
      annotation = '  ; <-- type register D177B9';
    }
    if (line.raw.target === TARGET) {
      annotation = '  ; <-- recursive call to self';
    }
  }

  console.log(`  ${addr}  ${bytes.padEnd(20)}  ${line.text}${annotation}`);
}

console.log();
console.log(`Function boundaries (RET) found at: ${functionBoundaries.map(a => hex(a)).join(', ')}`);

// ── Part 2: Scan for CALL 0x049CCA ──────────────────────────────────────────

console.log();
console.log('='.repeat(80));
console.log('PART 2: All CALL 0x049CCA sites in ROM');
console.log('='.repeat(80));
console.log();

// CALL nn in eZ80 ADL mode: CD xx xx xx (4 bytes, little-endian 24-bit address)
// 0x049CCA LE = CA 9C 04
const callSites = [];

for (let i = 0; i < ROM_LIMIT - 3; i++) {
  if (romBytes[i] === 0xCD &&
      romBytes[i + 1] === 0xCA &&
      romBytes[i + 2] === 0x9C &&
      romBytes[i + 3] === 0x04) {
    callSites.push(i);
  }
}

console.log(`Found ${callSites.length} CALL 0x049CCA sites\n`);

// ── Part 3: Extract (type, value) params for each call ──────────────────────

// The dispatcher takes 2 stack params. Before a CALL, these are typically
// pushed as immediate values via patterns like:
//   LD HL/BC/DE, imm  ;  PUSH HL/BC/DE   (pair push of immediate)
//   or: PUSH imm (if the decoder supports it)
//   or: LD A, imm ; PUSH AF
// We look back ~30 bytes from each CALL and decode instructions to find PUSHes.

const LOOKBACK = 40;
const callerData = [];

for (const site of callSites) {
  const entry = { site, params: [], context: [] };

  // Decode instructions leading up to the CALL
  // Try multiple starting offsets and pick the chain that lands on the CALL
  const startFloor = Math.max(0, site - LOOKBACK);
  let bestChain = null;

  for (let tryStart = startFloor; tryStart < site; tryStart++) {
    const chain = [];
    let cursor = tryStart;
    while (cursor < site) {
      const d = safeDecode(cursor);
      if (!d) break;
      chain.push(d);
      cursor = d.nextPc;
    }
    if (cursor === site && chain.length > 0) {
      if (!bestChain || chain.length > bestChain.length) {
        bestChain = chain;
      }
    }
  }

  if (bestChain) {
    // Walk the chain looking for PUSHes and preceding LD-pair-imm
    const lastN = bestChain.slice(-12); // last 12 instructions before CALL
    entry.context = lastN;

    // Track register values from LD-pair-imm and LD-reg-imm
    const regState = {};

    for (const instr of lastN) {
      // Track immediate loads into registers
      if (instr.tag === 'ld-pair-imm') {
        regState[instr.pair] = instr.value;
      }
      if (instr.tag === 'ld-reg-imm') {
        regState[instr.dest] = instr.value;
        // If loading A, also mark AF
        if (instr.dest === 'a') {
          regState['af_a'] = instr.value;
        }
      }
      if (instr.tag === 'ld-reg-reg') {
        if (regState[instr.src] !== undefined) {
          regState[instr.dest] = regState[instr.src];
        } else {
          delete regState[instr.dest];
        }
      }

      // Track PUSHes
      if (instr.tag === 'push') {
        const pair = instr.pair;
        let value = 'dynamic';
        if (pair === 'af' && regState['af_a'] !== undefined) {
          // AF push: high byte is A, low byte is flags (unknown)
          value = { a: regState['af_a'], note: 'AF push (A known, F unknown)' };
        } else if (regState[pair] !== undefined) {
          value = regState[pair];
        }
        entry.params.push({ pair, value, instrPc: instr.pc });
      }

      // Calls/jumps break the register tracking
      if (instr.tag === 'call' || instr.tag === 'call-conditional') {
        // Reset after a call (return value unknown)
        for (const k of Object.keys(regState)) delete regState[k];
      }
    }
  }

  callerData.push(entry);
}

// ── Part 4: Print results ────────────────────────────────────────────────────

console.log('='.repeat(80));
console.log('PART 3: Caller Analysis — (type, value) pairs');
console.log('='.repeat(80));
console.log();

// For each caller, show the last few instructions and the extracted params
for (const caller of callerData) {
  const params = caller.params;
  // The last 2 pushes before the call are the 2 stack params
  // Stack convention: last pushed = first param (closest to SP)
  // Typically: push value, push type, call — so type is TOS, value is TOS+3
  const lastTwo = params.slice(-2);

  let typeStr = '?';
  let valueStr = '?';

  if (lastTwo.length >= 2) {
    // Last push = param 1 (type?), second-to-last = param 2 (value?)
    const p1 = lastTwo[1]; // last push → type (TOS)
    const p2 = lastTwo[0]; // second-to-last → value

    typeStr = typeof p1.value === 'number' ? hexByte(p1.value) : (typeof p1.value === 'object' ? `A=${hexByte(p1.value.a)}` : 'dynamic');
    valueStr = typeof p2.value === 'number' ? hex(p2.value) : (typeof p2.value === 'object' ? `A=${hexByte(p2.value.a)}` : 'dynamic');
  } else if (lastTwo.length === 1) {
    typeStr = typeof lastTwo[0].value === 'number' ? hexByte(lastTwo[0].value) : 'dynamic';
    valueStr = '?';
  }

  console.log(`  CALL at ${hex(caller.site)}  type=${typeStr}  value=${valueStr}`);

  // Show context instructions
  if (caller.context.length > 0) {
    const shown = caller.context.slice(-6);
    for (const instr of shown) {
      const bytes = bytesToHex(romBytes, instr.pc, instr.length);
      console.log(`    ${hex(instr.pc)}  ${bytes.padEnd(18)}  ${formatInstruction(instr)}`);
    }
  }
  console.log();
}

// ── Part 5: Summary by notification type ─────────────────────────────────────

console.log('='.repeat(80));
console.log('PART 4: Summary — Callers grouped by notification type');
console.log('='.repeat(80));
console.log();

const typeGroups = {};
let dynamicCount = 0;

for (const caller of callerData) {
  const params = caller.params;
  const lastTwo = params.slice(-2);

  let typeKey = 'unknown';
  let valueKey = 'unknown';

  if (lastTwo.length >= 2) {
    const p1 = lastTwo[1]; // type
    const p2 = lastTwo[0]; // value

    if (typeof p1.value === 'number') {
      typeKey = hexByte(p1.value);
    } else if (typeof p1.value === 'object') {
      typeKey = `A=${hexByte(p1.value.a)}`;
    } else {
      typeKey = 'dynamic';
      dynamicCount++;
    }

    if (typeof p2.value === 'number') {
      valueKey = hex(p2.value);
    } else if (typeof p2.value === 'object') {
      valueKey = `A=${hexByte(p2.value.a)}`;
    } else {
      valueKey = 'dynamic';
    }
  } else {
    typeKey = 'insufficient-pushes';
  }

  if (!typeGroups[typeKey]) {
    typeGroups[typeKey] = [];
  }
  typeGroups[typeKey].push({ site: caller.site, value: valueKey });
}

// Sort by type key
const sortedTypes = Object.keys(typeGroups).sort();

console.log(`Distinct notification types: ${sortedTypes.length}`);
console.log(`Dynamic (non-immediate) type callers: ${dynamicCount}`);
console.log();

for (const typeKey of sortedTypes) {
  const callers = typeGroups[typeKey];
  console.log(`  Type ${typeKey} — ${callers.length} caller(s):`);
  for (const c of callers) {
    console.log(`    ${hex(c.site)}  value=${c.value}`);
  }
  console.log();
}

// ── Part 6: Check if dispatcher routes to type-specific handlers ─────────────

console.log('='.repeat(80));
console.log('PART 5: Dispatcher mechanism analysis');
console.log('='.repeat(80));
console.log();

// Analyze the disassembly for:
// - How stack params are read (look for LD from (SP+offset) or (IX+offset))
// - Jump table / compare chains for type dispatch
// - Writes to D177B9

let hasJumpTable = false;
let hasCompareChain = false;
let readsStackParam = false;
let writesTypeReg = false;
let callsSubroutines = [];

for (const line of disasmLines) {
  const d = line.raw;
  if (!d) continue;

  // Check for reads from stack offsets
  if (d.tag && d.tag.includes('indexed') && (d.indexRegister === 'ix' || d.indexRegister === 'iy')) {
    readsStackParam = true;
  }

  // Check for writes to D177B9
  if (d.tag === 'ld-mem-reg' && d.addr === TYPE_REG_ADDR) {
    writesTypeReg = true;
    console.log(`  Writes to type register at ${hex(line.pc)}: ${line.text}`);
  }
  if (d.tag === 'ld-pair-mem' && d.direction !== 'from-mem' && d.addr === TYPE_REG_ADDR) {
    writesTypeReg = true;
    console.log(`  Writes to type register at ${hex(line.pc)}: ${line.text}`);
  }

  // Check for reads from D177B9
  if (d.tag === 'ld-reg-mem' && d.addr === TYPE_REG_ADDR) {
    console.log(`  Reads type register at ${hex(line.pc)}: ${line.text}`);
  }
  if (d.tag === 'ld-pair-mem' && d.direction === 'from-mem' && d.addr === TYPE_REG_ADDR) {
    console.log(`  Reads type register at ${hex(line.pc)}: ${line.text}`);
  }

  // Check for compare instructions (CP)
  if (d.tag === 'alu-imm' && d.op === 'cp') {
    hasCompareChain = true;
    console.log(`  Compare at ${hex(line.pc)}: ${line.text}`);
  }
  if (d.tag === 'alu-reg' && d.op === 'cp') {
    hasCompareChain = true;
    console.log(`  Compare at ${hex(line.pc)}: ${line.text}`);
  }

  // Check for jump table (JP (HL) or JP (IX))
  if (d.tag === 'jp-indirect') {
    hasJumpTable = true;
    console.log(`  Indirect jump at ${hex(line.pc)}: ${line.text} — possible jump table dispatch`);
  }

  // Track subroutine calls
  if (d.tag === 'call') {
    callsSubroutines.push({ pc: line.pc, target: d.target });
    console.log(`  Calls subroutine at ${hex(line.pc)}: ${line.text}`);
  }
  if (d.tag === 'call-conditional') {
    callsSubroutines.push({ pc: line.pc, target: d.target, condition: d.condition });
    console.log(`  Conditional call at ${hex(line.pc)}: ${line.text}`);
  }

  // Check for conditional jumps (routing)
  if (d.tag === 'jp-conditional' || d.tag === 'jr-conditional') {
    console.log(`  Conditional branch at ${hex(line.pc)}: ${line.text}`);
  }
}

console.log();
console.log('Mechanism summary:');
console.log(`  Reads stack params via IX/IY offsets: ${readsStackParam}`);
console.log(`  Writes to type register (D177B9): ${writesTypeReg}`);
console.log(`  Has compare chain: ${hasCompareChain}`);
console.log(`  Has jump table (indirect JP): ${hasJumpTable}`);
console.log(`  Calls ${callsSubroutines.length} subroutine(s)`);

if (hasCompareChain && !hasJumpTable) {
  console.log('  → Likely a compare-and-branch dispatcher (sequential type checks)');
} else if (hasJumpTable) {
  console.log('  → Likely a jump-table dispatcher (indexed by type)');
} else if (callsSubroutines.length > 0) {
  console.log('  → May delegate to subroutines for handling');
} else {
  console.log('  → Simple state-update (writes type register, no routing)');
}

console.log();
console.log('Done.');

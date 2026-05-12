#!/usr/bin/env node

/**
 * probe-phase302-token-dispatch.mjs
 *
 * Traces the token dispatch function at 0x022331, which is called by
 * CoorMon (0x08C36E) after classifying a token via a 28-comparison CP cascade.
 * The classified token value arrives in register A.
 *
 * Pipeline so far: IRQ 0x000038 -> scanner -> _GetCSC -> CoorMon 0x08C331
 *                  -> classify -> 0x022331 -> ???
 *
 * 1. Disassembles 0x022331 through ~0x022500
 * 2. Identifies what happens to the token (CP cascade, jump table, store, call)
 * 3. Traces CALL/JP targets (first 20 instructions of each)
 * 4. Searches ROM for all callers of 0x022331
 * 5. Prints summary
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const rom = readFileSync(ROM_PATH);

const TOKEN_DISPATCH = 0x022331;
const DISASM_END     = 0x022500;

// ── Helpers ──────────────────────────────────────────────────────────────────

function hex(v, w = 6) {
  return '0x' + (v >>> 0).toString(16).toUpperCase().padStart(w, '0');
}

function hexBytes(buf, start, len) {
  const bytes = [];
  for (let i = 0; i < len && start + i < buf.length; i++) {
    bytes.push(buf[start + i].toString(16).toUpperCase().padStart(2, '0'));
  }
  return bytes.join(' ');
}

function disasmAt(addr) {
  if (addr < 0 || addr >= rom.length) return null;
  try {
    return decodeInstruction(rom, addr, 'adl');
  } catch {
    return null;
  }
}

function formatInst(inst) {
  if (!inst) return '<decode error>';
  if (inst.dasm) return inst.dasm;

  switch (inst.tag) {
    case 'push': return `PUSH ${inst.pair.toUpperCase()}`;
    case 'pop': return `POP ${inst.pair.toUpperCase()}`;
    case 'ld-pair-imm': return `LD ${inst.pair.toUpperCase()}, ${hex(inst.value)}`;
    case 'ld-reg-imm': return `LD ${inst.dest.toUpperCase()}, ${hex(inst.value, 2)}`;
    case 'ld-reg-mem': return `LD ${inst.dest.toUpperCase()}, (${hex(inst.addr)})`;
    case 'ld-mem-reg': return `LD (${hex(inst.addr)}), ${inst.src.toUpperCase()}`;
    case 'ld-reg-reg': return `LD ${inst.dest.toUpperCase()}, ${inst.src.toUpperCase()}`;
    case 'alu-reg': return `${inst.op.toUpperCase()} ${inst.src.toUpperCase()}`;
    case 'alu-imm': return `${inst.op.toUpperCase()} ${hex(inst.value, 2)}`;
    case 'call': return `CALL ${hex(inst.target)}`;
    case 'call-conditional': return `CALL ${inst.condition.toUpperCase()}, ${hex(inst.target)}`;
    case 'jp': return `JP ${hex(inst.target)}`;
    case 'jp-conditional': return `JP ${inst.condition.toUpperCase()}, ${hex(inst.target)}`;
    case 'jr': return `JR ${hex(inst.target)}`;
    case 'jr-conditional': return `JR ${inst.condition.toUpperCase()}, ${hex(inst.target)}`;
    case 'ret': return 'RET';
    case 'ret-conditional': return `RET ${inst.condition.toUpperCase()}`;
    case 'nop': return 'NOP';
    case 'di': return 'DI';
    case 'ei': return 'EI';
    case 'halt': return 'HALT';
    case 'inc-reg': return `INC ${inst.reg.toUpperCase()}`;
    case 'dec-reg': return `DEC ${inst.reg.toUpperCase()}`;
    case 'inc-pair': return `INC ${inst.pair.toUpperCase()}`;
    case 'dec-pair': return `DEC ${inst.pair.toUpperCase()}`;
    case 'ld-indexed-pair':
      return `LD (${inst.indexRegister.toUpperCase()}${inst.displacement >= 0 ? '+' : ''}${inst.displacement}), ${inst.pair.toUpperCase()}`;
    case 'ld-ixd-reg':
      return `LD (${inst.indexRegister.toUpperCase()}${inst.displacement >= 0 ? '+' : ''}${inst.displacement}), ${inst.src.toUpperCase()}`;
    case 'ld-reg-ixd':
      return `LD ${inst.dest.toUpperCase()}, (${inst.indexRegister.toUpperCase()}${inst.displacement >= 0 ? '+' : ''}${inst.displacement})`;
    case 'indexed-cb-bit':
      return `BIT ${inst.bit}, (${inst.indexRegister.toUpperCase()}${inst.displacement >= 0 ? '+' : ''}${inst.displacement})`;
    case 'inc-ixd':
      return `INC (${inst.indexRegister.toUpperCase()}${inst.displacement >= 0 ? '+' : ''}${inst.displacement})`;
    case 'dec-ixd':
      return `DEC (${inst.indexRegister.toUpperCase()}${inst.displacement >= 0 ? '+' : ''}${inst.displacement})`;
    case 'ld-mem-pair': return `LD (${hex(inst.addr)}), ${inst.pair.toUpperCase()}`;
    case 'ld-pair-mem': return `LD ${inst.pair.toUpperCase()}, (${hex(inst.addr)})`;
    case 'rst': return `RST ${hex(inst.target, 2)}`;
    case 'ex-af': return "EX AF, AF'";
    case 'exx': return 'EXX';
    case 'ex-sp-hl': return 'EX (SP), HL';
    case 'ex-de-hl': return 'EX DE, HL';
    case 'djnz': return `DJNZ ${hex(inst.target)}`;
    case 'rotate-a': return `${inst.op.toUpperCase()}A`;
    case 'rotate-reg': return `${inst.op.toUpperCase()} ${inst.reg.toUpperCase()}`;
    case 'rotate-ind': return `${inst.op.toUpperCase()} (${inst.indirectRegister.toUpperCase()})`;
    case 'bit-reg': return `BIT ${inst.bit}, ${inst.reg.toUpperCase()}`;
    case 'set-reg': return `SET ${inst.bit}, ${inst.reg.toUpperCase()}`;
    case 'res-reg': return `RES ${inst.bit}, ${inst.reg.toUpperCase()}`;
    case 'bit-ind': return `BIT ${inst.bit}, (${inst.indirectRegister.toUpperCase()})`;
    case 'set-ind': return `SET ${inst.bit}, (${inst.indirectRegister.toUpperCase()})`;
    case 'res-ind': return `RES ${inst.bit}, (${inst.indirectRegister.toUpperCase()})`;
    case 'out-imm': return `OUT (${hex(inst.port, 2)}), A`;
    case 'in-imm': return `IN A, (${hex(inst.port, 2)})`;
    case 'block-transfer': return inst.op.toUpperCase();
    case 'block-search': return inst.op.toUpperCase();
    case 'block-io': return inst.op.toUpperCase();
    case 'scf': return 'SCF';
    case 'ccf': return 'CCF';
    case 'cpl': return 'CPL';
    case 'neg': return 'NEG';
    case 'reti': return 'RETI';
    case 'retn': return 'RETN';
    case 'im': return `IM ${inst.mode}`;
    case 'daa': return 'DAA';
    case 'ld-sp-hl': return 'LD SP, HL';
    case 'jp-hl': return 'JP (HL)';
    case 'ld-a-i': return 'LD A, I';
    case 'ld-i-a': return 'LD I, A';
    case 'ld-a-r': return 'LD A, R';
    case 'ld-r-a': return 'LD R, A';
    case 'add-pair': return `ADD HL, ${inst.src.toUpperCase()}`;
    case 'adc-pair': return `ADC HL, ${inst.src.toUpperCase()}`;
    case 'sbc-pair': return `SBC HL, ${inst.src.toUpperCase()}`;
    case 'ld-ind-reg': return `LD (HL), ${inst.src.toUpperCase()}`;
    case 'ld-reg-ind': return `LD ${inst.dest.toUpperCase()}, (HL)`;
    case 'alu-ind': return `${inst.op.toUpperCase()} (HL)`;
    case 'add-ix-pair': return `ADD IX, ${inst.src.toUpperCase()}`;
    case 'add-iy-pair': return `ADD IY, ${inst.src.toUpperCase()}`;
    case 'alu-ixd':
      return `${inst.op.toUpperCase()} (${inst.indexRegister.toUpperCase()}${inst.displacement >= 0 ? '+' : ''}${inst.displacement})`;
    default:
      return `[${inst.tag}]`;
  }
}

/**
 * Disassemble a range, returning array of { addr, inst, bytes, text, len }.
 */
function disasmRange(start, end) {
  const results = [];
  let pc = start;
  while (pc < end && pc < rom.length) {
    const inst = disasmAt(pc);
    if (!inst) {
      results.push({ addr: pc, bytes: hexBytes(rom, pc, 1), text: `DB ${hex(rom[pc], 2)}`, len: 1 });
      pc++;
      continue;
    }
    results.push({
      addr: pc,
      bytes: hexBytes(rom, pc, inst.length),
      text: formatInst(inst),
      len: inst.length,
      inst,
    });
    pc += inst.length;
  }
  return results;
}

// ── Section 1: Disassemble 0x022331..0x022500 ─────────────────────────────

console.log('='.repeat(80));
console.log('SECTION 1: Disassembly of token dispatch function at 0x022331');
console.log(`  Range: ${hex(TOKEN_DISPATCH)}..${hex(DISASM_END)}`);
console.log('='.repeat(80));

const mainDisasm = disasmRange(TOKEN_DISPATCH, DISASM_END);

// Collect analysis data
const callTargets = new Set();
const jpTargets = new Set();
const tableAddresses = [];  // { addr, pair, instrAddr }
const cpValues = [];        // { addr, value }
const storeLocations = [];  // { addr, target, text } — LD (addr), reg
const branchTargets = new Set();
const iyOffsets = [];
const retAddresses = [];
const jpHlAddresses = [];

for (const line of mainDisasm) {
  if (!line.inst) continue;
  const tag = line.inst.tag;

  // CALL targets
  if (tag === 'call' || tag === 'call-conditional') {
    callTargets.add(line.inst.target);
  }

  // JP targets (absolute jumps)
  if (tag === 'jp' || tag === 'jp-conditional') {
    jpTargets.add(line.inst.target);
    branchTargets.add(line.inst.target);
  }
  if (tag === 'jr' || tag === 'jr-conditional') {
    branchTargets.add(line.inst.target);
  }

  // JP (HL) — function pointer dispatch
  if (tag === 'jp-hl') {
    jpHlAddresses.push(line.addr);
  }

  // LD pair immediate — potential table address if in ROM
  if (tag === 'ld-pair-imm') {
    tableAddresses.push({ addr: line.inst.value, pair: line.inst.pair, instrAddr: line.addr });
  }

  // LD (addr), reg — token stored to RAM
  if (tag === 'ld-mem-reg') {
    storeLocations.push({ addr: line.addr, target: line.inst.addr, src: line.inst.src, text: line.text });
  }
  if (tag === 'ld-mem-pair') {
    storeLocations.push({ addr: line.addr, target: line.inst.addr, src: line.inst.pair, text: line.text });
  }

  // CP immediate
  if (tag === 'alu-imm' && line.inst.op === 'cp') {
    cpValues.push({ addr: line.addr, value: line.inst.value });
  }

  // IY+offset references
  if (tag === 'ld-reg-ixd' || tag === 'ld-ixd-reg' || tag === 'indexed-cb-bit' ||
      tag === 'inc-ixd' || tag === 'dec-ixd' || tag === 'ld-indexed-pair' || tag === 'alu-ixd') {
    if (line.inst.indexRegister === 'iy') {
      iyOffsets.push({ addr: line.addr, displacement: line.inst.displacement, text: line.text });
    }
  }

  // RET instructions (function boundaries)
  if (tag === 'ret' || tag === 'ret-conditional') {
    retAddresses.push(line.addr);
  }
}

// Print annotated disassembly
for (const line of mainDisasm) {
  let annotation = '';

  if (line.addr === TOKEN_DISPATCH) annotation += ' <<< ENTRY';
  if (branchTargets.has(line.addr)) annotation += ' <<< BRANCH TARGET';

  if (line.inst) {
    const tag = line.inst.tag;
    if (tag === 'alu-imm' && line.inst.op === 'cp') {
      annotation += ` (compare A with ${line.inst.value} / 0x${line.inst.value.toString(16).toUpperCase()})`;
    }
    if (tag === 'jp-hl') {
      annotation += ' <<< FUNCTION POINTER DISPATCH';
    }
    if (tag === 'ret') {
      annotation += ' <<< RET';
    }
    if (tag === 'ld-mem-reg' || tag === 'ld-mem-pair') {
      const tgt = line.inst.addr || line.inst.target;
      if (tgt >= 0xD00000) {
        annotation += ' <<< RAM STORE';
      }
    }
  }

  console.log(`  ${hex(line.addr)}  ${line.bytes.padEnd(18)}  ${line.text}${annotation}`);
}

// ── Section 2: CALL targets — first 20 instructions ─────────────────────

console.log(`\n${'='.repeat(80)}`);
console.log('SECTION 2: CALL targets — first 20 instructions of each callee');
console.log('='.repeat(80));

const sortedCalls = [...callTargets].sort((a, b) => a - b);
console.log(`\nFound ${sortedCalls.length} unique CALL targets: ${sortedCalls.map(a => hex(a)).join(', ')}`);

for (const target of sortedCalls) {
  console.log(`\n${'─'.repeat(70)}`);
  console.log(`Callee at ${hex(target)}:`);
  console.log('─'.repeat(70));

  if (target >= rom.length) {
    console.log('  (address beyond ROM — likely RAM routine)');
    continue;
  }

  const calleeDisasm = disasmRange(target, target + 64);
  const limited = calleeDisasm.slice(0, 20);
  for (const line of limited) {
    let ann = '';
    if (line.inst && (line.inst.tag === 'ret')) ann = ' <<< RET';
    console.log(`  ${hex(line.addr)}  ${line.bytes.padEnd(18)}  ${line.text}${ann}`);
  }
  if (calleeDisasm.length > 20) {
    console.log(`  ... (${calleeDisasm.length - 20} more instructions)`);
  }
}

// ── Section 3: JP targets outside main range ────────────────────────────

console.log(`\n${'='.repeat(80)}`);
console.log('SECTION 3: JP targets outside main disassembly range');
console.log('='.repeat(80));

const externalJPs = [...jpTargets].filter(t => t < TOKEN_DISPATCH || t >= DISASM_END).sort((a, b) => a - b);
console.log(`\nFound ${externalJPs.length} external JP targets: ${externalJPs.map(a => hex(a)).join(', ')}`);

for (const target of externalJPs) {
  console.log(`\n${'─'.repeat(70)}`);
  console.log(`JP target at ${hex(target)}:`);
  console.log('─'.repeat(70));

  if (target >= rom.length) {
    console.log('  (address beyond ROM — likely RAM routine)');
    continue;
  }

  const jpDisasm = disasmRange(target, target + 64);
  const limited = jpDisasm.slice(0, 20);
  for (const line of limited) {
    let ann = '';
    if (line.inst && (line.inst.tag === 'ret')) ann = ' <<< RET';
    if (line.inst && (line.inst.tag === 'jp-hl')) ann = ' <<< JP (HL)';
    console.log(`  ${hex(line.addr)}  ${line.bytes.padEnd(18)}  ${line.text}${ann}`);
  }
}

// ── Section 4: Table / ROM pointer analysis ─────────────────────────────

console.log(`\n${'='.repeat(80)}`);
console.log('SECTION 4: ROM pointer loads (potential tables or function pointers)');
console.log('='.repeat(80));

const romTables = tableAddresses.filter(t => t.addr < 0x400000).sort((a, b) => a.addr - b.addr);
console.log(`\nFound ${romTables.length} ROM pointer loads:`);

for (const tbl of romTables) {
  console.log(`\n${'─'.repeat(70)}`);
  console.log(`LD ${tbl.pair.toUpperCase()}, ${hex(tbl.addr)} at instruction ${hex(tbl.instrAddr)}`);
  console.log('─'.repeat(70));

  if (tbl.addr >= rom.length) {
    console.log('  (beyond ROM)');
    continue;
  }

  // Hex dump first 128 bytes
  const dumpLen = 128;
  console.log(`\nFirst ${dumpLen} bytes (hex dump):`);
  for (let row = 0; row < dumpLen; row += 16) {
    const addr = tbl.addr + row;
    if (addr >= rom.length) break;
    const len = Math.min(16, rom.length - addr);
    const hexPart = hexBytes(rom, addr, len);
    let ascii = '';
    for (let i = 0; i < len; i++) {
      const b = rom[addr + i];
      ascii += (b >= 0x20 && b < 0x7F) ? String.fromCharCode(b) : '.';
    }
    console.log(`  ${hex(addr)}  ${hexPart.padEnd(48)}  ${ascii}`);
  }

  // Try interpreting as 3-byte address table (function pointer table)
  console.log(`\nAs 3-byte address table (first 16 entries):`);
  for (let i = 0; i < 16 && tbl.addr + i * 3 + 2 < rom.length; i++) {
    const base = tbl.addr + i * 3;
    const ptr = rom[base] | (rom[base + 1] << 8) | (rom[base + 2] << 16);
    const inROM = ptr < 0x400000 ? 'ROM' : ptr >= 0xD00000 ? 'RAM' : '???';
    console.log(`    [${i.toString().padStart(2)}] ${hex(ptr)} (${inROM})`);
  }

  // Also try disassembling it
  console.log(`\nAs instructions:`);
  const tblDisasm = disasmRange(tbl.addr, tbl.addr + 32);
  for (const line of tblDisasm) {
    console.log(`    ${hex(line.addr)}  ${line.bytes.padEnd(18)}  ${line.text}`);
  }
}

// Also check RAM pointer loads (tables in RAM)
const ramTables = tableAddresses.filter(t => t.addr >= 0xD00000);
if (ramTables.length > 0) {
  console.log(`\nRAM pointer loads (${ramTables.length}):`);
  for (const tbl of ramTables) {
    console.log(`  LD ${tbl.pair.toUpperCase()}, ${hex(tbl.addr)} at instruction ${hex(tbl.instrAddr)}`);
  }
}

// ── Section 5: RAM store analysis ───────────────────────────────────────

console.log(`\n${'='.repeat(80)}`);
console.log('SECTION 5: RAM store operations (where tokens/values are written)');
console.log('='.repeat(80));

if (storeLocations.length === 0) {
  console.log('\n  No direct RAM stores found.');
} else {
  console.log(`\nFound ${storeLocations.length} store operations:\n`);
  for (const st of storeLocations) {
    console.log(`  ${hex(st.addr)}  ${st.text}  -> stores ${st.src.toUpperCase()} to ${hex(st.target)}`);
  }
}

// ── Section 6: CP cascade analysis ──────────────────────────────────────

console.log(`\n${'='.repeat(80)}`);
console.log('SECTION 6: CP (compare) cascade analysis');
console.log('='.repeat(80));

if (cpValues.length === 0) {
  console.log('\n  No CP instructions found.');
} else {
  console.log(`\nFound ${cpValues.length} CP instructions:\n`);
  for (const cp of cpValues) {
    // Show 2 instructions before and after for context
    const contextStart = Math.max(TOKEN_DISPATCH, cp.addr - 10);
    const contextEnd = Math.min(DISASM_END, cp.addr + 16);
    const contextLines = disasmRange(contextStart, contextEnd);
    console.log(`  CP at ${hex(cp.addr)}: compare A with ${cp.value} (0x${cp.value.toString(16).toUpperCase()}):`);
    for (const line of contextLines) {
      const marker = (line.addr === cp.addr) ? ' <<<' : '';
      console.log(`    ${hex(line.addr)}  ${line.bytes.padEnd(18)}  ${line.text}${marker}`);
    }
    console.log('');
  }
}

// ── Section 7: IY+offset references ────────────────────────────────────

console.log(`${'='.repeat(80)}`);
console.log('SECTION 7: IY+offset references (system flag / modifier state)');
console.log('='.repeat(80));

if (iyOffsets.length === 0) {
  console.log('\n  No IY+offset references found.');
} else {
  console.log(`\nFound ${iyOffsets.length} IY+offset references:\n`);
  for (const iy of iyOffsets) {
    console.log(`  ${hex(iy.addr)}  IY${iy.displacement >= 0 ? '+' : ''}${iy.displacement}  (IY+0x${(iy.displacement & 0xFF).toString(16).toUpperCase()})  ${iy.text}`);
  }
}

// ── Section 8: JP (HL) dispatch analysis ────────────────────────────────

console.log(`\n${'='.repeat(80)}`);
console.log('SECTION 8: JP (HL) function pointer dispatches');
console.log('='.repeat(80));

if (jpHlAddresses.length === 0) {
  console.log('\n  No JP (HL) instructions found.');
} else {
  console.log(`\nFound ${jpHlAddresses.length} JP (HL) instructions:\n`);
  for (const jpAddr of jpHlAddresses) {
    // Show context: 10 instructions before
    const contextStart = Math.max(TOKEN_DISPATCH, jpAddr - 30);
    const contextEnd = Math.min(DISASM_END, jpAddr + 4);
    const contextLines = disasmRange(contextStart, contextEnd);
    console.log(`  JP (HL) at ${hex(jpAddr)} — context leading up to it:`);
    for (const line of contextLines) {
      const marker = (line.addr === jpAddr) ? ' <<< JP (HL)' : '';
      console.log(`    ${hex(line.addr)}  ${line.bytes.padEnd(18)}  ${line.text}${marker}`);
    }
    console.log('');
  }
}

// ── Section 9: Search ROM for all callers of 0x022331 ───────────────────

console.log(`${'='.repeat(80)}`);
console.log('SECTION 9: All ROM callers of 0x022331');
console.log('='.repeat(80));

// Search for 3-byte LE pattern: 31 23 02
const target_lo  = TOKEN_DISPATCH & 0xFF;          // 0x31
const target_mid = (TOKEN_DISPATCH >> 8) & 0xFF;   // 0x23
const target_hi  = (TOKEN_DISPATCH >> 16) & 0xFF;  // 0x02

const callers = [];

for (let i = 0; i < rom.length - 2; i++) {
  if (rom[i] === target_lo && rom[i + 1] === target_mid && rom[i + 2] === target_hi) {
    const prefixByte = i > 0 ? rom[i - 1] : 0;
    let classification = 'UNKNOWN';
    let instAddr = i;
    let description = `raw bytes at offset ${hex(i)}`;

    if (prefixByte === 0xCD) {
      classification = 'CALL';
      description = 'CALL 0x022331';
      instAddr = i - 1;
    } else if (prefixByte === 0xC3) {
      classification = 'JP';
      description = 'JP 0x022331';
      instAddr = i - 1;
    } else if (prefixByte === 0x21) {
      classification = 'LD-HL';
      description = 'LD HL, 0x022331 (pointer)';
      instAddr = i - 1;
    } else if (prefixByte === 0x11) {
      classification = 'LD-DE';
      description = 'LD DE, 0x022331 (pointer)';
      instAddr = i - 1;
    } else if (prefixByte === 0x01) {
      classification = 'LD-BC';
      description = 'LD BC, 0x022331 (pointer)';
      instAddr = i - 1;
    } else {
      // Conditional calls/jumps
      const condCalls = { 0xC4: 'NZ', 0xCC: 'Z', 0xD4: 'NC', 0xDC: 'C', 0xE4: 'PO', 0xEC: 'PE', 0xF4: 'P', 0xFC: 'M' };
      const condJps  = { 0xC2: 'NZ', 0xCA: 'Z', 0xD2: 'NC', 0xDA: 'C', 0xE2: 'PO', 0xEA: 'PE', 0xF2: 'P', 0xFA: 'M' };
      if (condCalls[prefixByte]) {
        classification = 'CALL-COND';
        description = `CALL ${condCalls[prefixByte]}, 0x022331`;
        instAddr = i - 1;
      } else if (condJps[prefixByte]) {
        classification = 'JP-COND';
        description = `JP ${condJps[prefixByte]}, 0x022331`;
        instAddr = i - 1;
      } else {
        description = `opcode ${hex(prefixByte, 2)} before target bytes`;
      }
    }

    callers.push({ matchOffset: i, instAddr, classification, description });
  }
}

console.log(`\nFound ${callers.length} references to ${hex(TOKEN_DISPATCH)}:\n`);

for (const ref of callers) {
  const tag = ref.classification.padEnd(12);
  console.log(`  ${hex(ref.instAddr)}  [${tag}]  ${ref.description}`);
  console.log(`           raw bytes: ${hexBytes(rom, ref.instAddr, 8)}`);
}

// Disassemble context around each CALL/JP caller
for (const ref of callers) {
  if (ref.classification === 'CALL' || ref.classification === 'CALL-COND' ||
      ref.classification === 'JP' || ref.classification === 'JP-COND') {
    const contextStart = Math.max(0, ref.instAddr - 24);
    const contextEnd = Math.min(rom.length, ref.instAddr + 24);

    console.log(`\n${'─'.repeat(70)}`);
    console.log(`Context around caller at ${hex(ref.instAddr)}  [${ref.classification}]`);
    console.log('─'.repeat(70));

    const ctxLines = disasmRange(contextStart, contextEnd);
    for (const line of ctxLines) {
      const marker = (line.addr === ref.instAddr) ? ' <<<' : '';
      console.log(`  ${hex(line.addr)}  ${line.bytes.padEnd(18)}  ${line.text}${marker}`);
    }
  }
}

// ── Section 10: Function boundary detection ─────────────────────────────

console.log(`\n${'='.repeat(80)}`);
console.log('SECTION 10: Function boundary detection');
console.log('='.repeat(80));

console.log(`\nRET instructions found at: ${retAddresses.map(a => hex(a)).join(', ')}`);
if (retAddresses.length > 0) {
  const firstRet = retAddresses[0];
  const fnSize = firstRet - TOKEN_DISPATCH + 1;
  console.log(`\nFirst RET at ${hex(firstRet)} — function body is ${fnSize} bytes (${hex(TOKEN_DISPATCH)}..${hex(firstRet)})`);
  console.log(`(But function may continue past first RET if there are branch targets beyond it)`);

  // Check if any branch targets exist past the first RET
  const pastRet = [...branchTargets].filter(t => t > firstRet && t < DISASM_END).sort((a, b) => a - b);
  if (pastRet.length > 0) {
    console.log(`\nBranch targets past first RET: ${pastRet.map(a => hex(a)).join(', ')}`);
    const lastTarget = pastRet[pastRet.length - 1];
    // Find the last RET after the last branch target
    const retsAfter = retAddresses.filter(r => r >= lastTarget);
    if (retsAfter.length > 0) {
      console.log(`Function likely extends to ${hex(retsAfter[0])} (RET after last branch target)`);
    }
  }
}

// ── Section 11: Extended disassembly past 0x022500 ──────────────────────

// If the function doesn't clearly end by 0x022500, extend
const lastBranchInRange = [...branchTargets].filter(t => t >= DISASM_END).sort((a, b) => a - b);
if (lastBranchInRange.length > 0) {
  const extEnd = Math.min(lastBranchInRange[lastBranchInRange.length - 1] + 32, rom.length);
  console.log(`\n${'='.repeat(80)}`);
  console.log(`SECTION 11: Extended disassembly ${hex(DISASM_END)}..${hex(extEnd)}`);
  console.log('='.repeat(80));

  const extDisasm = disasmRange(DISASM_END, extEnd);
  for (const line of extDisasm) {
    let ann = '';
    if (branchTargets.has(line.addr)) ann += ' <<< BRANCH TARGET';
    if (line.inst && line.inst.tag === 'ret') ann += ' <<< RET';
    console.log(`  ${hex(line.addr)}  ${line.bytes.padEnd(18)}  ${line.text}${ann}`);
  }
}

// ── Section 12: Summary ─────────────────────────────────────────────────

console.log(`\n${'='.repeat(80)}`);
console.log('SECTION 12: Summary');
console.log('='.repeat(80));

console.log(`\nToken dispatch function at ${hex(TOKEN_DISPATCH)}`);
console.log(`Disassembled ${mainDisasm.length} instructions from ${hex(TOKEN_DISPATCH)} to ${hex(DISASM_END)}`);

console.log(`\nDispatch mechanism indicators:`);
console.log(`  JP (HL) instructions: ${jpHlAddresses.length} (function pointer dispatch)`);
for (const a of jpHlAddresses) console.log(`    at ${hex(a)}`);

console.log(`  CP cascade values: ${cpValues.length}`);
for (const cp of cpValues) console.log(`    ${hex(cp.addr)}: CP ${cp.value} (0x${cp.value.toString(16).toUpperCase()})`);

console.log(`  RAM stores: ${storeLocations.length}`);
for (const st of storeLocations) console.log(`    ${hex(st.addr)}: ${st.text}`);

console.log(`  ROM pointer loads: ${romTables.length}`);
for (const t of romTables) console.log(`    ${hex(t.instrAddr)}: LD ${t.pair.toUpperCase()}, ${hex(t.addr)}`);

console.log(`  IY+offset refs: ${iyOffsets.length}`);
for (const iy of iyOffsets) console.log(`    ${hex(iy.addr)}: ${iy.text}`);

const callRefCount = callers.filter(c => c.classification === 'CALL' || c.classification === 'CALL-COND').length;
const jpRefCount = callers.filter(c => c.classification === 'JP' || c.classification === 'JP-COND').length;
const ptrRefCount = callers.filter(c => c.classification.startsWith('LD-')).length;
const unknownRefCount = callers.filter(c => c.classification === 'UNKNOWN').length;

console.log(`\nCallers of ${hex(TOKEN_DISPATCH)}:`);
console.log(`  ${callRefCount} CALL, ${jpRefCount} JP, ${ptrRefCount} pointer loads, ${unknownRefCount} unknown`);

const callSites = callers.filter(c => c.classification === 'CALL' || c.classification === 'CALL-COND');
if (callSites.length > 0) {
  console.log(`  CALL sites: ${callSites.map(c => hex(c.instAddr)).join(', ')}`);
}
const jpSites = callers.filter(c => c.classification === 'JP' || c.classification === 'JP-COND');
if (jpSites.length > 0) {
  console.log(`  JP sites: ${jpSites.map(c => hex(c.instAddr)).join(', ')}`);
}

console.log(`\nFunction boundaries:`);
console.log(`  RET instructions: ${retAddresses.map(a => hex(a)).join(', ')}`);
console.log(`  CALL targets: ${sortedCalls.map(a => hex(a)).join(', ')}`);
console.log(`  External JP targets: ${externalJPs.map(a => hex(a)).join(', ')}`);

console.log('\nDone.');

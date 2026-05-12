#!/usr/bin/env node

/**
 * probe-phase300-scancode-writers.mjs
 *
 * Investigates all references to the scan code buffer at 0xD00587.
 * Known writer sites: 0x003D4B, 0x003D7B, 0x028C2D.
 * Known reader: _GetCSC at 0x03FA09.
 *
 * 1. Disassembles ~40 bytes around each known writer.
 * 2. Searches the entire ROM for all references to 0xD00587.
 * 3. Classifies each reference as READ, WRITE, or POINTER.
 * 4. Attempts to find containing function boundaries.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const rom = readFileSync(ROM_PATH);

const SCANCODE_BUF = 0xD00587;
const KNOWN_WRITERS = [0x003D4B, 0x003D7B, 0x028C2D];

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
    default:
      return `[${inst.tag}]`;
  }
}

/**
 * Disassemble a range, returning an array of { addr, inst, bytes, text }.
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

/**
 * Look backwards from `addr` for a likely function entry point.
 * Scans for RET (C9), unconditional JP (C3), or RETI (ED 4D)
 * in the preceding bytes. The function likely starts right after that.
 */
function findFunctionEntry(addr) {
  const searchBack = 200;
  const start = Math.max(0, addr - searchBack);

  // Disassemble forward from `start` and find the last RET/JP before `addr`
  let pc = start;
  let lastTerminator = -1;
  let lastTerminatorEnd = -1;
  while (pc < addr) {
    const inst = disasmAt(pc);
    if (!inst) { pc++; continue; }
    if (inst.tag === 'ret' || inst.tag === 'jp' || inst.tag === 'reti' || inst.tag === 'retn') {
      lastTerminator = pc;
      lastTerminatorEnd = pc + inst.length;
    }
    pc += inst.length;
  }

  if (lastTerminatorEnd > 0 && lastTerminatorEnd <= addr) {
    return lastTerminatorEnd;
  }
  return null;
}

// ── Section 1: Disassemble around known writers ─────────────────────────────

console.log('='.repeat(80));
console.log('SECTION 1: Disassembly around known D00587 writer sites');
console.log('='.repeat(80));

for (const writer of KNOWN_WRITERS) {
  const rangeStart = Math.max(0, writer - 20);
  const rangeEnd = Math.min(rom.length, writer + 20);

  console.log(`\n${'─'.repeat(70)}`);
  console.log(`Writer at ${hex(writer)}  (range ${hex(rangeStart)}..${hex(rangeEnd)})`);
  console.log('─'.repeat(70));

  const lines = disasmRange(rangeStart, rangeEnd);
  for (const line of lines) {
    const marker = (line.addr === writer) ? ' <<<' : '';
    console.log(`  ${hex(line.addr)}  ${line.bytes.padEnd(18)}  ${line.text}${marker}`);
  }
}

// ── Section 2: Full ROM scan for references to 0xD00587 ─────────────────────

console.log(`\n${'='.repeat(80)}`);
console.log('SECTION 2: Full ROM scan for all references to 0xD00587');
console.log('='.repeat(80));

// Search for the byte pattern 87 05 D0 (little-endian 24-bit for 0xD00587)
const target_lo = SCANCODE_BUF & 0xFF;         // 0x87
const target_mid = (SCANCODE_BUF >> 8) & 0xFF; // 0x05
const target_hi = (SCANCODE_BUF >> 16) & 0xFF; // 0xD0

const references = [];

for (let i = 0; i < rom.length - 2; i++) {
  if (rom[i] === target_lo && rom[i + 1] === target_mid && rom[i + 2] === target_hi) {
    // The instruction opcode is at i-1 (for 1-byte prefix instructions)
    // Check what precedes the immediate bytes
    const prefixByte = i > 0 ? rom[i - 1] : 0;

    let classification = 'UNKNOWN';
    let instAddr = i - 1;
    let description = '';

    // Check for ED-prefixed instructions (2-byte opcode before imm24)
    const edPrefixByte = i > 1 ? rom[i - 2] : 0;

    if (prefixByte === 0x32) {
      classification = 'WRITE';
      description = 'LD (imm24), A';
      instAddr = i - 1;
    } else if (prefixByte === 0x3A) {
      classification = 'READ';
      description = 'LD A, (imm24)';
      instAddr = i - 1;
    } else if (prefixByte === 0x21) {
      classification = 'POINTER';
      description = 'LD HL, imm24';
      instAddr = i - 1;
    } else if (prefixByte === 0x01) {
      classification = 'POINTER';
      description = 'LD BC, imm24';
      instAddr = i - 1;
    } else if (prefixByte === 0x11) {
      classification = 'POINTER';
      description = 'LD DE, imm24';
      instAddr = i - 1;
    } else if (prefixByte === 0x31) {
      classification = 'POINTER';
      description = 'LD SP, imm24';
      instAddr = i - 1;
    } else if (prefixByte === 0x22) {
      classification = 'WRITE';
      description = 'LD (imm24), HL';
      instAddr = i - 1;
    } else if (prefixByte === 0x2A) {
      classification = 'READ';
      description = 'LD HL, (imm24)';
      instAddr = i - 1;
    } else if (prefixByte === 0xCD) {
      classification = 'CALL-TARGET';
      description = 'CALL imm24 (D00587 as code? unlikely)';
      instAddr = i - 1;
    } else if (prefixByte === 0xC3) {
      classification = 'JP-TARGET';
      description = 'JP imm24 (D00587 as code? unlikely)';
      instAddr = i - 1;
    } else if (edPrefixByte === 0xED) {
      // ED-prefixed LD instructions
      if (prefixByte === 0x43) { classification = 'WRITE'; description = 'LD (imm24), BC'; instAddr = i - 2; }
      else if (prefixByte === 0x53) { classification = 'WRITE'; description = 'LD (imm24), DE'; instAddr = i - 2; }
      else if (prefixByte === 0x63) { classification = 'WRITE'; description = 'LD (imm24), HL [ED prefix]'; instAddr = i - 2; }
      else if (prefixByte === 0x73) { classification = 'WRITE'; description = 'LD (imm24), SP'; instAddr = i - 2; }
      else if (prefixByte === 0x4B) { classification = 'READ'; description = 'LD BC, (imm24)'; instAddr = i - 2; }
      else if (prefixByte === 0x5B) { classification = 'READ'; description = 'LD DE, (imm24)'; instAddr = i - 2; }
      else if (prefixByte === 0x6B) { classification = 'READ'; description = 'LD HL, (imm24) [ED prefix]'; instAddr = i - 2; }
      else if (prefixByte === 0x7B) { classification = 'READ'; description = 'LD SP, (imm24)'; instAddr = i - 2; }
      else { classification = 'ED-OTHER'; description = `ED ${hex(prefixByte, 2)}`; instAddr = i - 2; }
    } else {
      // Check for mode prefixes (0x40=SIS, 0x49=LIS, 0x52=SIL, 0x5B=LIL) before the opcode
      const modePrefixes = [0x40, 0x49, 0x52, 0x5B];
      if (i > 1 && modePrefixes.includes(rom[i - 2])) {
        classification = 'MODE-PREFIXED';
        description = `Mode ${hex(rom[i - 2], 2)} + opcode ${hex(prefixByte, 2)}`;
        instAddr = i - 2;
      } else {
        description = `opcode ${hex(prefixByte, 2)} before imm24`;
      }
    }

    references.push({ matchOffset: i, instAddr, classification, description });
  }
}

console.log(`\nFound ${references.length} references to ${hex(SCANCODE_BUF)}:\n`);

for (const ref of references) {
  const tag = ref.classification.padEnd(14);
  console.log(`  ${hex(ref.instAddr)}  [${tag}]  ${ref.description}`);
  console.log(`           raw bytes: ${hexBytes(rom, ref.instAddr, 8)}`);
}

// ── Section 3: Context around each reference ────────────────────────────────

console.log(`\n${'='.repeat(80)}`);
console.log('SECTION 3: Disassembly context around each reference');
console.log('='.repeat(80));

for (const ref of references) {
  const contextStart = Math.max(0, ref.instAddr - 25);
  const contextEnd = Math.min(rom.length, ref.instAddr + 25);

  console.log(`\n${'─'.repeat(70)}`);
  console.log(`Reference at ${hex(ref.instAddr)}  [${ref.classification}]  ${ref.description}`);
  console.log('─'.repeat(70));

  const lines = disasmRange(contextStart, contextEnd);
  for (const line of lines) {
    const marker = (line.addr === ref.instAddr) ? ' <<<' : '';
    console.log(`  ${hex(line.addr)}  ${line.bytes.padEnd(18)}  ${line.text}${marker}`);
  }
}

// ── Section 4: Function boundaries for known writers ────────────────────────

console.log(`\n${'='.repeat(80)}`);
console.log('SECTION 4: Containing functions for known writer sites');
console.log('='.repeat(80));

for (const writer of KNOWN_WRITERS) {
  const entry = findFunctionEntry(writer);
  console.log(`\n${'─'.repeat(70)}`);
  console.log(`Writer at ${hex(writer)}`);

  if (entry !== null) {
    console.log(`Likely function entry: ${hex(entry)}`);
    console.log(`Disassembly from entry to writer + 30 bytes:`);

    const lines = disasmRange(entry, writer + 30);
    for (const line of lines) {
      const marker = (line.addr === writer) ? ' <<< WRITE SITE' : '';
      console.log(`  ${hex(line.addr)}  ${line.bytes.padEnd(18)}  ${line.text}${marker}`);
    }
  } else {
    console.log('  Could not determine function entry (no RET/JP found in 200 bytes before)');
  }
}

// ── Section 5: Summary ──────────────────────────────────────────────────────

console.log(`\n${'='.repeat(80)}`);
console.log('SECTION 5: Summary');
console.log('='.repeat(80));

const writes = references.filter(r => r.classification === 'WRITE');
const reads = references.filter(r => r.classification === 'READ');
const pointers = references.filter(r => r.classification === 'POINTER');
const others = references.filter(r => !['WRITE', 'READ', 'POINTER'].includes(r.classification));

console.log(`\nTotal references to ${hex(SCANCODE_BUF)}: ${references.length}`);
console.log(`  WRITE:   ${writes.length}  — ${writes.map(r => hex(r.instAddr)).join(', ')}`);
console.log(`  READ:    ${reads.length}  — ${reads.map(r => hex(r.instAddr)).join(', ')}`);
console.log(`  POINTER: ${pointers.length}  — ${pointers.map(r => hex(r.instAddr)).join(', ')}`);
if (others.length > 0) {
  console.log(`  OTHER:   ${others.length}  — ${others.map(r => `${hex(r.instAddr)} (${r.classification})`).join(', ')}`);
}

const knownWriterSet = new Set(KNOWN_WRITERS);
const newWriters = writes.filter(w => !knownWriterSet.has(w.instAddr));
const newReads = reads.filter(r => r.instAddr !== 0x03FA09); // exclude known _GetCSC

if (newWriters.length > 0) {
  console.log(`\n  ** NEW writers not in known set: ${newWriters.map(w => hex(w.instAddr)).join(', ')}`);
}
if (newReads.length > 0) {
  console.log(`  ** Reads beyond _GetCSC: ${newReads.map(r => hex(r.instAddr)).join(', ')}`);
}

console.log('\nDone.');

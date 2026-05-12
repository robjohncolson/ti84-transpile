#!/usr/bin/env node

/**
 * probe-phase302-scancode-class-conv.mjs
 *
 * Traces the scan-code-to-class conversion function at 0x058EC6, called as
 * the very first instruction of 0x058D54 (key class lookup). This function
 * takes a raw keyboard scan code in register A and returns a class value
 * (0x09, 0x0A, 0x0B, etc.) used by the CP cascade at 0x0589E5.
 *
 * 1. Disassembles 0x058EC6 through ~0x058F80 (or until clear RET/JP end).
 * 2. Identifies the algorithm: lookup table, CP cascade, computed jump, etc.
 * 3. If a table is found, dumps entries and maps scan codes to classes.
 * 4. Searches ROM for all callers of 0x058EC6.
 * 5. Prints a clear summary.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const rom = readFileSync(ROM_PATH);

const FUNC_ENTRY = 0x058EC6;
const DISASM_END = 0x058F80;

// The function is very short — first unconditional RET is at 0x058ED9.
// We disassemble the wider range to show neighboring functions for context,
// but track the true function boundary for analysis.

// ── Known scan codes from keyboard-matrix.md ────────────────────────────────

const SCAN_CODE_NAMES = {
  0x00: 'DOWN',    0x01: 'LEFT',   0x02: 'RIGHT',  0x03: 'UP',
  0x10: 'ENTER',   0x11: '+',      0x12: '-',       0x13: 'x',
  0x14: '/',       0x15: '^',      0x16: 'CLEAR',
  0x20: '(-)',     0x21: '3',      0x22: '6',       0x23: '9',
  0x24: ')',       0x25: 'TAN',    0x26: 'VARS',
  0x30: '.',       0x31: '2',      0x32: '5',       0x33: '8',
  0x34: '(',       0x35: 'COS',    0x36: 'PRGM',    0x37: 'STAT',
  0x40: '0',       0x41: '1',      0x42: '4',       0x43: '7',
  0x44: ',',       0x45: 'SIN',    0x46: 'APPS',    0x47: 'X,T,0,n',
  0x51: 'STO>',    0x52: 'LN',     0x53: 'LOG',     0x54: 'x^2',
  0x55: 'x^-1',    0x56: 'MATH',   0x57: 'ALPHA',
  0x60: 'GRAPH',   0x61: 'TRACE',  0x62: 'ZOOM',    0x63: 'WINDOW',
  0x64: 'Y=',      0x65: '2ND',    0x66: 'MODE',    0x67: 'DEL',
};

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
    default:
      return `[${inst.tag}]`;
  }
}

/**
 * Disassemble a range, returning an array of { addr, inst, bytes, text, len }.
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

// ── Section 1: Disassemble 0x058EC6 through ~0x058F80 ───────────────────────

console.log('='.repeat(80));
console.log('SECTION 1: Disassembly of scan-code-to-class conversion at 0x058EC6');
console.log('='.repeat(80));

const lines = disasmRange(FUNC_ENTRY, DISASM_END);
const lookupTables = [];   // { tableAddr, loadInstrAddr, pair }
const cpCascades = [];     // { addr, value }
const retAddrs = [];       // addresses of RET instructions

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const marker = (line.addr === FUNC_ENTRY) ? ' <<< ENTRY' : '';
  console.log(`  ${hex(line.addr)}  ${line.bytes.padEnd(18)}  ${line.text}${marker}`);

  if (line.inst) {
    const tag = line.inst.tag;

    // Detect LD pair, imm24 pointing into ROM — potential table base
    if (tag === 'ld-pair-imm' && line.inst.value < 0x400000) {
      lookupTables.push({
        tableAddr: line.inst.value,
        loadInstrAddr: line.addr,
        pair: line.inst.pair.toUpperCase(),
      });
    }

    // CP imm — comparison cascade entry
    if (tag === 'alu-imm' && line.inst.op === 'cp') {
      cpCascades.push({ addr: line.addr, value: line.inst.value });
    }

    // Track RET instructions to understand function boundaries
    if (tag === 'ret' || tag === 'ret-conditional') {
      retAddrs.push({ addr: line.addr, conditional: tag === 'ret-conditional' });
    }
  }
}

// ── Section 2: Lookup tables ────────────────────────────────────────────────

console.log(`\n${'='.repeat(80)}`);
console.log('SECTION 2: Potential lookup tables referenced in the function');
console.log('='.repeat(80));

if (lookupTables.length === 0) {
  console.log('\n  No ROM-address loads found (no lookup table pattern detected).');
} else {
  for (const tbl of lookupTables) {
    console.log(`\n${'─'.repeat(70)}`);
    console.log(`Table at ${hex(tbl.tableAddr)} (loaded into ${tbl.pair} at ${hex(tbl.loadInstrAddr)})`);
    console.log('─'.repeat(70));

    // Dump up to 256 bytes (full scan code range)
    const dumpLen = 256;
    console.log(`\nFirst ${dumpLen} bytes (hex dump):`);
    for (let row = 0; row < dumpLen; row += 16) {
      const addr = tbl.tableAddr + row;
      if (addr >= rom.length) break;
      const bytesStr = hexBytes(rom, addr, Math.min(16, dumpLen - row));
      let ascii = '';
      for (let b = 0; b < 16 && row + b < dumpLen; b++) {
        if (addr + b >= rom.length) break;
        const ch = rom[addr + b];
        ascii += (ch >= 0x20 && ch <= 0x7E) ? String.fromCharCode(ch) : '.';
      }
      console.log(`  ${hex(addr)}  ${bytesStr.padEnd(48)}  ${ascii}`);
    }

    // Map scan codes to class values, cross-referencing keyboard-matrix.md
    console.log(`\nScan code -> class value mapping (non-zero entries):`);
    const nonZero = [];
    for (let sc = 0; sc < dumpLen && tbl.tableAddr + sc < rom.length; sc++) {
      const classVal = rom[tbl.tableAddr + sc];
      if (classVal !== 0) {
        const keyName = SCAN_CODE_NAMES[sc] || '???';
        nonZero.push({ scanCode: sc, classVal, keyName });
      }
    }
    if (nonZero.length === 0) {
      console.log('  All zero in first 256 bytes (may not be a scan-code-to-class table).');
    } else {
      console.log(`  ${nonZero.length} non-zero entries:`);
      for (const entry of nonZero) {
        const scHex = hex(entry.scanCode, 2);
        const clHex = hex(entry.classVal, 2);
        console.log(`    scan ${scHex} (${entry.scanCode.toString().padStart(3)}) -> class ${clHex}  [${entry.keyName}]`);
      }

      // Group by class value
      console.log(`\n  Grouped by class value:`);
      const byClass = {};
      for (const entry of nonZero) {
        const cl = entry.classVal;
        if (!byClass[cl]) byClass[cl] = [];
        byClass[cl].push(entry);
      }
      for (const cl of Object.keys(byClass).map(Number).sort((a, b) => a - b)) {
        const keys = byClass[cl].map(e => `${e.keyName}(${hex(e.scanCode, 2)})`).join(', ');
        console.log(`    class ${hex(cl, 2)}: ${keys}`);
      }
    }
  }
}

// ── Section 3: CP cascade values ────────────────────────────────────────────

console.log(`\n${'='.repeat(80)}`);
console.log('SECTION 3: CP (compare) cascade values found in the function');
console.log('='.repeat(80));

if (cpCascades.length === 0) {
  console.log('\n  No CP instructions found.');
} else {
  console.log(`\n  Found ${cpCascades.length} CP instructions:`);
  for (const cp of cpCascades) {
    console.log(`    ${hex(cp.addr)}  CP ${hex(cp.value, 2)}  (decimal ${cp.value})`);
  }
}

// ── Section 4: RET instructions ─────────────────────────────────────────────

console.log(`\n${'='.repeat(80)}`);
console.log('SECTION 4: RET instructions (function boundary markers)');
console.log('='.repeat(80));

if (retAddrs.length === 0) {
  console.log('\n  No RET instructions found in range.');
} else {
  console.log(`\n  Found ${retAddrs.length} RET instructions:`);
  for (const r of retAddrs) {
    const cond = r.conditional ? ' (conditional)' : ' (unconditional)';
    console.log(`    ${hex(r.addr)}${cond}`);
  }
}

// ── Section 5: ROM scan for all callers of 0x058EC6 ─────────────────────────

console.log(`\n${'='.repeat(80)}`);
console.log('SECTION 5: All ROM references to 0x058EC6 (callers)');
console.log('='.repeat(80));

const target_lo  = FUNC_ENTRY & 0xFF;          // 0xC6
const target_mid = (FUNC_ENTRY >> 8) & 0xFF;   // 0x8E
const target_hi  = (FUNC_ENTRY >> 16) & 0xFF;  // 0x05

const callers = [];

for (let i = 0; i < rom.length - 2; i++) {
  if (rom[i] === target_lo && rom[i + 1] === target_mid && rom[i + 2] === target_hi) {
    const prefixByte = i > 0 ? rom[i - 1] : 0;
    let classification = 'UNKNOWN';
    let instAddr = i;
    let description = `raw bytes at offset ${hex(i)}`;

    if (prefixByte === 0xCD) {
      classification = 'CALL';
      description = 'CALL 0x058EC6';
      instAddr = i - 1;
    } else if (prefixByte === 0xC3) {
      classification = 'JP';
      description = 'JP 0x058EC6';
      instAddr = i - 1;
    } else if (prefixByte === 0x21) {
      classification = 'LD-HL';
      description = 'LD HL, 0x058EC6 (pointer)';
      instAddr = i - 1;
    } else if (prefixByte === 0x11) {
      classification = 'LD-DE';
      description = 'LD DE, 0x058EC6 (pointer)';
      instAddr = i - 1;
    } else if (prefixByte === 0x01) {
      classification = 'LD-BC';
      description = 'LD BC, 0x058EC6 (pointer)';
      instAddr = i - 1;
    } else {
      const condCalls = { 0xC4: 'NZ', 0xCC: 'Z', 0xD4: 'NC', 0xDC: 'C', 0xE4: 'PO', 0xEC: 'PE', 0xF4: 'P', 0xFC: 'M' };
      const condJps  = { 0xC2: 'NZ', 0xCA: 'Z', 0xD2: 'NC', 0xDA: 'C', 0xE2: 'PO', 0xEA: 'PE', 0xF2: 'P', 0xFA: 'M' };
      if (condCalls[prefixByte]) {
        classification = 'CALL-COND';
        description = `CALL ${condCalls[prefixByte]}, 0x058EC6`;
        instAddr = i - 1;
      } else if (condJps[prefixByte]) {
        classification = 'JP-COND';
        description = `JP ${condJps[prefixByte]}, 0x058EC6`;
        instAddr = i - 1;
      } else {
        description = `opcode ${hex(prefixByte, 2)} before target bytes`;
      }
    }

    callers.push({ matchOffset: i, instAddr, classification, description });
  }
}

console.log(`\nFound ${callers.length} references to ${hex(FUNC_ENTRY)}:\n`);

for (const ref of callers) {
  const tag = ref.classification.padEnd(12);
  console.log(`  ${hex(ref.instAddr)}  [${tag}]  ${ref.description}`);
  console.log(`           raw bytes: ${hexBytes(rom, ref.instAddr, 8)}`);
}

// Disassemble context around each caller
for (const ref of callers) {
  if (ref.classification === 'CALL' || ref.classification === 'CALL-COND' ||
      ref.classification === 'JP' || ref.classification === 'JP-COND') {
    const contextStart = Math.max(0, ref.instAddr - 20);
    const contextEnd = Math.min(rom.length, ref.instAddr + 20);

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

// ── Section 6: Summary ─────────────────────────────────────────────────────

console.log(`\n${'='.repeat(80)}`);
console.log('SECTION 6: Summary');
console.log('='.repeat(80));

console.log(`\nFunction at ${hex(FUNC_ENTRY)}: scan-code-to-class conversion`);
console.log(`Disassembled ${lines.length} instructions from ${hex(FUNC_ENTRY)} to ${hex(DISASM_END)}`);

if (lookupTables.length > 0) {
  console.log(`\nLookup tables found: ${lookupTables.length}`);
  for (const tbl of lookupTables) {
    console.log(`  - Table at ${hex(tbl.tableAddr)} loaded into ${tbl.pair} at ${hex(tbl.loadInstrAddr)}`);
  }
}

if (cpCascades.length > 0) {
  console.log(`\nCP cascade values: ${cpCascades.map(c => hex(c.value, 2)).join(', ')}`);
}

if (retAddrs.length > 0) {
  const firstUnconditional = retAddrs.find(r => !r.conditional);
  if (firstUnconditional) {
    console.log(`\nFirst unconditional RET at ${hex(firstUnconditional.addr)} (likely function end)`);
  }
}

const callRefs = callers.filter(c => c.classification === 'CALL' || c.classification === 'CALL-COND');
const jpRefs = callers.filter(c => c.classification === 'JP' || c.classification === 'JP-COND');
const ptrRefs = callers.filter(c => c.classification.startsWith('LD-'));

console.log(`\nCallers: ${callRefs.length} CALL, ${jpRefs.length} JP, ${ptrRefs.length} pointer loads`);
if (callRefs.length > 0) {
  console.log(`  CALL sites: ${callRefs.map(c => hex(c.instAddr)).join(', ')}`);
}
if (jpRefs.length > 0) {
  console.log(`  JP sites: ${jpRefs.map(c => hex(c.instAddr)).join(', ')}`);
}

// ── Section 7: Detailed function analysis ───────────────────────────────────

console.log(`\n${'='.repeat(80)}`);
console.log('SECTION 7: Detailed function analysis (true function body only)');
console.log('='.repeat(80));

// The true function body: from FUNC_ENTRY to first unconditional RET
const firstRet = retAddrs.find(r => !r.conditional);
const funcEnd = firstRet ? firstRet.addr + 1 : DISASM_END;
const funcBody = lines.filter(l => l.addr >= FUNC_ENTRY && l.addr < funcEnd);

console.log(`\nTrue function body: ${hex(FUNC_ENTRY)} to ${hex(funcEnd - 1)} (${funcEnd - FUNC_ENTRY} bytes)`);
console.log('');
for (const line of funcBody) {
  console.log(`  ${hex(line.addr)}  ${line.bytes.padEnd(18)}  ${line.text}`);
}

// Identify the actual algorithm
console.log('\n── Algorithm Identification ──');
console.log('');

// Check for IY-flag operations
const iyOps = funcBody.filter(l => l.text && (l.text.includes('IY') || l.text.includes('indexed-cb')));
if (iyOps.length > 0) {
  console.log('  This function manipulates IY-based flag bytes, NOT a scan-code-to-class');
  console.log('  converter. Analysis of the true function body:');
  console.log('');

  // Decode FD CB dd op manually for the indexed-cb-res entries
  for (const line of funcBody) {
    if (line.bytes && line.bytes.startsWith('FD CB')) {
      const byteParts = line.bytes.split(' ');
      if (byteParts.length >= 4) {
        const disp = parseInt(byteParts[2], 16);
        const op = parseInt(byteParts[3], 16);
        // CB prefix bit ops:
        // 40-7F = BIT, 80-BF = RES, C0-FF = SET
        // bit number = (op >> 3) & 7
        // For BIT/RES/SET (HL) or (IX+d)/(IY+d), reg field = 6
        const bitNum = (op >> 3) & 7;
        let opName;
        if (op >= 0xC0) opName = 'SET';
        else if (op >= 0x80) opName = 'RES';
        else opName = 'BIT';
        console.log(`    ${hex(line.addr)}  ${opName} ${bitNum}, (IY+${disp})  [flag byte at IY+0x${disp.toString(16).toUpperCase()}]`);
      }
    }
  }

  console.log('');
  console.log('  Pseudocode:');
  console.log('    RES 5, (IY+0x53)       ; clear bit 5 of flag byte');
  console.log('    BIT 7, (IY+0x53)       ; test bit 7');
  console.log('    if Z: return            ; nothing to do if bit 7 clear');
  console.log('    PUSH AF                 ; save scan code in A');
  console.log('    CALL 0x0997ED           ; call some handler');
  console.log('    POP AF                  ; restore scan code');
  console.log('    RES 7, (IY+0x53)       ; clear bit 7 (handled)');
  console.log('    return');
  console.log('');
  console.log('  CONCLUSION: 0x058EC6 is a FLAG-CLEARING PRE-HANDLER, not a');
  console.log('  scan-code-to-class conversion function. It checks/clears bits');
  console.log('  in the OS flag byte at (IY+0x53) and conditionally calls');
  console.log('  0x0997ED. The scan code in A passes through UNCHANGED.');
  console.log('');
  console.log('  The actual scan-code-to-class conversion must happen elsewhere');
  console.log('  in the call chain from 0x058D54. Check subsequent CALLs after');
  console.log('  the CALL 0x058EC6 at 0x058D54.');
} else if (lookupTables.length > 0) {
  // Only count tables within the true function body
  const bodyTables = lookupTables.filter(t => t.loadInstrAddr >= FUNC_ENTRY && t.loadInstrAddr < funcEnd);
  if (bodyTables.length > 0) {
    console.log('  Pattern: LOOKUP TABLE');
  } else {
    console.log('  NOTE: Tables detected were OUTSIDE the function body (in neighboring code).');
    console.log('  The function itself does NOT use a lookup table.');
  }
} else if (cpCascades.length > 3) {
  console.log('  Pattern: CP CASCADE');
} else {
  console.log('  Pattern: UNKNOWN — examine disassembly above for details.');
}

// ── Section 8: Investigate what follows CALL 0x058EC6 at 0x058D54 ────────────

console.log(`\n${'='.repeat(80)}`);
console.log('SECTION 8: Instructions following CALL 0x058EC6 at 0x058D54');
console.log('         (to find the REAL scan-code-to-class conversion)');
console.log('='.repeat(80));

const postCallRange = disasmRange(0x058D54, 0x058DC0);
console.log('');
for (const line of postCallRange) {
  const marker = (line.addr === 0x058D54) ? ' <<< CALL 0x058EC6' : '';
  console.log(`  ${hex(line.addr)}  ${line.bytes.padEnd(18)}  ${line.text}${marker}`);
}

// Look for the real conversion: any LD HL pointing to a table, or CP cascades
const realTables = [];
const realCPs = [];
for (const line of postCallRange) {
  if (line.inst) {
    if (line.inst.tag === 'ld-pair-imm' && line.inst.value < 0x400000 && line.inst.value > 0x1000) {
      realTables.push({ tableAddr: line.inst.value, loadInstrAddr: line.addr, pair: line.inst.pair.toUpperCase() });
    }
    if (line.inst.tag === 'alu-imm' && line.inst.op === 'cp') {
      realCPs.push({ addr: line.addr, value: line.inst.value });
    }
  }
}

if (realTables.length > 0) {
  console.log('\nPotential lookup tables in post-call code:');
  for (const tbl of realTables) {
    console.log(`  ${hex(tbl.loadInstrAddr)}: LD ${tbl.pair}, ${hex(tbl.tableAddr)}`);

    // Dump the table
    console.log(`  Table at ${hex(tbl.tableAddr)} — first 128 bytes:`);
    for (let row = 0; row < 128; row += 16) {
      const addr = tbl.tableAddr + row;
      if (addr >= rom.length) break;
      const bytesStr = hexBytes(rom, addr, Math.min(16, 128 - row));
      console.log(`    ${hex(addr)}  ${bytesStr}`);
    }

    // Map scan codes to values
    console.log(`  Non-zero entries (scan code -> value):`);
    for (let sc = 0; sc < 128 && tbl.tableAddr + sc < rom.length; sc++) {
      const val = rom[tbl.tableAddr + sc];
      if (val !== 0) {
        const keyName = SCAN_CODE_NAMES[sc] || '???';
        console.log(`    scan ${hex(sc, 2)} -> ${hex(val, 2)}  [${keyName}]`);
      }
    }
  }
}

if (realCPs.length > 0) {
  console.log('\nCP cascade in post-call code:');
  for (const cp of realCPs) {
    console.log(`  ${hex(cp.addr)}: CP ${hex(cp.value, 2)}`);
  }
}

console.log('\nDone.');

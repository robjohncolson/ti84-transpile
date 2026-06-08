#!/usr/bin/env node
// Phase 566: Decode and document ROM function 0x025758 (app header validator),
// the abort path at 0x025762, and the cleanup routine at 0x025774.
//
// Context: Session 565 decoded 0x02398E (37B font app validator) which calls:
//   LD HL, D02611    ; pointer to app descriptor
//   CALL 0x025758    ; validate header
//   JP Z, 0x025762   ; abort if invalid (Z = failure)
//
// 0x025758 is a shared utility used by multiple sibling validators (0x0239B2+).

import fs from 'fs';
import { decodeInstruction } from './ez80-decoder.js';

const rom = fs.readFileSync('TI-84_Plus_CE/ROM.rom');

// ---------- targets ----------
const VALIDATOR_START = 0x025758;
const VALIDATOR_BYTES = 60;

const ABORT_START = 0x025762;
const ABORT_BYTES = 40;

const CLEANUP_START = 0x025774;
const CLEANUP_BYTES = 30;

// Also decode 0x023955 (abort final jump target) for context
const ABORT_FINAL_START = 0x023955;
const ABORT_FINAL_BYTES = 40;

// ---------- known RAM / addresses ----------
const knownAddresses = new Map([
  [0xd02611, 'app descriptor pointer (used by 0x02398E)'],
  [0xd025cf, 'validation token / status RAM'],
  [0xd0265b, 'error counter (abort path increments this)'],
  [0xd000b5, 'IY+0x35 flags/status byte'],
  [0xd00080, 'IY base'],
  [0xd005f8, 'OP1'],
  [0xd005ff, 'OP2'],
  [0xd00606, 'OP3'],
  [0xd0060d, 'OP4'],
  [0xd00614, 'OP5'],
  [0xd0061b, 'OP6'],
  [0x025758, 'app header validator (THIS function)'],
  [0x025762, 'abort path (Z = invalid)'],
  [0x025774, 'cleanup routine'],
  [0x023955, 'abort final jump target'],
  [0x02398e, 'font app validator (caller)'],
]);

// ---------- helpers ----------

function hex(value, width = 6) {
  return '0x' + value.toString(16).toUpperCase().padStart(width, '0');
}

function hexByte(value) {
  return value.toString(16).toUpperCase().padStart(2, '0');
}

function rawBytes(address, size) {
  return [...rom.subarray(address, address + size)].map(hexByte).join(' ');
}

function formatInstruction(ins) {
  if (ins.text) return ins.text;
  if (ins.mnemonic) {
    const operands = ins.operands ?? ins.args ?? ins.operand;
    if (operands == null) return ins.mnemonic;
    if (Array.isArray(operands)) {
      return ins.mnemonic + ' ' + operands.map(formatValue).join(', ');
    }
    return ins.mnemonic + ' ' + formatValue(operands);
  }

  const skip = new Set(['tag', 'size', 'bytes', 'raw', 'address', 'pc', 'length', 'nextPc']);
  const fields = Object.entries(ins)
    .filter(([key]) => !skip.has(key))
    .map(([key, value]) => key + '=' + formatValue(value));

  return fields.length ? (ins.tag ?? '???') + ' ' + fields.join(' ') : (ins.tag ?? '???');
}

function formatValue(value) {
  if (typeof value === 'number') {
    return hex(value, value <= 0xff ? 2 : value <= 0xffff ? 4 : 6);
  }
  if (Array.isArray(value)) {
    return '[' + value.map(formatValue).join(', ') + ']';
  }
  return String(value);
}

function referencedNumbers(ins, mnemonic) {
  const values = [];
  const seen = new Set();

  function visit(value) {
    if (typeof value === 'number') {
      if (!seen.has(value)) {
        seen.add(value);
        values.push(value);
      }
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (value && typeof value === 'object') {
      for (const item of Object.values(value)) visit(item);
    }
  }

  visit(ins);

  for (const match of mnemonic.matchAll(/\b(?:0x|&H|\$)?([0-9A-Fa-f]{4,6})\b/g)) {
    const value = Number.parseInt(match[1], 16);
    if (!seen.has(value)) {
      seen.add(value);
      values.push(value);
    }
  }

  return values;
}

function annotationsFor(ins, mnemonic) {
  const notes = [];

  for (const value of referencedNumbers(ins, mnemonic)) {
    const note = knownAddresses.get(value);
    if (note) notes.push(hex(value) + '=' + note);
  }

  // IY+offset annotations
  const iyMatch = mnemonic.match(/\(IY\+(?:0x|\$)?([0-9A-Fa-f]+)\)/i);
  if (iyMatch) {
    const offset = parseInt(iyMatch[1], 16);
    const effectiveAddr = 0xD00080 + offset;
    notes.push('IY+0x' + offset.toString(16).toUpperCase() + '=effective ' + hex(effectiveAddr));
  }

  return [...new Set(notes)];
}

function isFunctionTerminator(ins, mnemonic) {
  const text = mnemonic.trim().toUpperCase();

  if (text === 'RET' || text === 'RETI' || text === 'RETN') return true;
  if (text.startsWith('JP ') && !/^JP\s+(NZ|Z|NC|C|PO|PE|P|M)\s*,/i.test(text)) return true;

  return false;
}

function disassemble(start, maxBytes, label) {
  const rows = [];
  let address = start;
  const end = start + maxBytes;

  for (let count = 0; count < 80 && address < end && address < rom.length; count++) {
    const ins = decodeInstruction(rom, address);
    const size = ins.size || ins.length || 1;
    const mnemonic = formatInstruction(ins);
    const notes = annotationsFor(ins, mnemonic);
    const suffix = notes.length ? '  ; ' + notes.join('; ') : '';

    rows.push({
      address,
      size,
      mnemonic,
      suffix,
      raw: rawBytes(address, size),
      isTerminator: isFunctionTerminator(ins, mnemonic),
    });

    address += size;
    if (isFunctionTerminator(ins, mnemonic)) break;
  }

  return { label, start, rows, endAddress: address, byteCount: address - start };
}

function printDisassembly(result) {
  console.log('\n' + '='.repeat(70));
  console.log('  ' + result.label);
  console.log('  Start: ' + hex(result.start) + '  Size: ' + result.byteCount + 'B');
  console.log('='.repeat(70));

  for (const row of result.rows) {
    console.log('  ' + hex(row.address) + '  ' + row.raw.padEnd(16) + '  ' + row.mnemonic + row.suffix);
  }

  console.log('  --- end at ' + hex(result.endAddress) + ' (' + result.byteCount + ' bytes) ---');
}

// ---------- xref search ----------

function findCallPattern(targetAddr) {
  const lo = targetAddr & 0xff;
  const mid = (targetAddr >> 8) & 0xff;
  const hi = (targetAddr >> 16) & 0xff;

  const patterns = [
    { name: 'CALL', opcode: 0xcd },
    { name: 'JP', opcode: 0xc3 },
    { name: 'JP Z,', opcode: 0xca },
    { name: 'JP NZ,', opcode: 0xc2 },
  ];

  const results = [];

  for (const pat of patterns) {
    const bytes = [pat.opcode, lo, mid, hi];
    for (let i = 0; i <= rom.length - bytes.length; i++) {
      let matched = true;
      for (let j = 0; j < bytes.length; j++) {
        if (rom[i + j] !== bytes[j]) { matched = false; break; }
      }
      if (matched) {
        results.push({ type: pat.name, address: i, target: targetAddr });
      }
    }
  }

  return results;
}

// ---------- nearby string scan ----------

function scanNearbyStrings(start, bytes) {
  const region = rom.subarray(start, start + bytes);
  const strings = [];
  let runStart = -1;

  for (let i = 0; i <= region.length; i++) {
    const byte = i < region.length ? region[i] : 0;
    const printable = byte >= 0x20 && byte <= 0x7e;

    if (printable) {
      if (runStart === -1) runStart = i;
      continue;
    }

    if (runStart !== -1) {
      const len = i - runStart;
      if (len >= 4) {
        const text = Buffer.from(region.subarray(runStart, i)).toString('ascii');
        strings.push({ offset: runStart, address: start + runStart, text });
      }
      runStart = -1;
    }
  }

  return strings;
}

// ---------- main ----------

console.log('=== Probe Phase 566: Decode 0x025758 App Header Validator ===');
console.log('ROM size: ' + hex(rom.length) + ' bytes');
console.log('');

// 1. Disassemble the main validator
const validator = disassemble(VALIDATOR_START, VALIDATOR_BYTES,
  'VALIDATOR: 0x025758 -- App Header Check');
printDisassembly(validator);

// 2. Disassemble the abort path
const abort = disassemble(ABORT_START, ABORT_BYTES,
  'ABORT PATH: 0x025762 -- Error Counter + Cleanup');
printDisassembly(abort);

// 3. Disassemble the cleanup routine
const cleanup = disassemble(CLEANUP_START, CLEANUP_BYTES,
  'CLEANUP: 0x025774');
printDisassembly(cleanup);

// 4. Disassemble the abort final target
const abortFinal = disassemble(ABORT_FINAL_START, ABORT_FINAL_BYTES,
  'ABORT FINAL: 0x023955 -- Jump target from abort');
printDisassembly(abortFinal);

// 5. Xrefs to 0x025758
console.log('\n' + '='.repeat(70));
console.log('  XREFS TO 0x025758 (CALL / JP patterns)');
console.log('='.repeat(70));

const xrefs025758 = findCallPattern(0x025758);
console.log('  Found ' + xrefs025758.length + ' xref(s):');
for (const xref of xrefs025758) {
  console.log('    ' + hex(xref.address) + '  ' + xref.type + ' ' + hex(xref.target));
}

// 6. Xrefs to 0x025762
console.log('');
const xrefs025762 = findCallPattern(0x025762);
console.log('  Xrefs to 0x025762: ' + xrefs025762.length + ' hit(s)');
for (const xref of xrefs025762) {
  console.log('    ' + hex(xref.address) + '  ' + xref.type + ' ' + hex(xref.target));
}

// 7. Xrefs to 0x025774
console.log('');
const xrefs025774 = findCallPattern(0x025774);
console.log('  Xrefs to 0x025774: ' + xrefs025774.length + ' hit(s)');
for (const xref of xrefs025774) {
  console.log('    ' + hex(xref.address) + '  ' + xref.type + ' ' + hex(xref.target));
}

// 8. Check for CP instructions (magic byte detection) in the validator
console.log('\n' + '='.repeat(70));
console.log('  MAGIC BYTE ANALYSIS');
console.log('='.repeat(70));

const validatorSlice = rom.subarray(VALIDATOR_START, VALIDATOR_START + VALIDATOR_BYTES);
const magicCandidates = [];
for (let i = 0; i < validatorSlice.length - 1; i++) {
  // FE xx = CP A, xx (immediate)
  if (validatorSlice[i] === 0xfe) {
    magicCandidates.push({
      offset: i,
      address: VALIDATOR_START + i,
      opcode: 'CP',
      value: validatorSlice[i + 1],
    });
  }
}

if (magicCandidates.length) {
  console.log('  CP (compare) instructions found in validator:');
  for (const mc of magicCandidates) {
    console.log('    ' + hex(mc.address) + '  ' + mc.opcode + ' 0x' + hexByte(mc.value)
      + ' (decimal ' + mc.value + ')');
    if (mc.value === 0x83) {
      console.log('      ^^^ MAGIC BYTE 0x83 -- TI app header signature marker');
    }
  }
} else {
  console.log('  No direct CP nn instructions found; validator may use indirect comparison.');
}

// 9. Check the D0265B error counter region
console.log('\n' + '='.repeat(70));
console.log('  ERROR COUNTER D0265B ANALYSIS');
console.log('='.repeat(70));

const abortAllRows = [...abort.rows];
const counterRefs = abortAllRows.filter((row) =>
  row.mnemonic.toUpperCase().includes('D0265B') ||
  row.mnemonic.toUpperCase().includes('265B') ||
  row.suffix.toUpperCase().includes('D0265B')
);

if (counterRefs.length) {
  console.log('  References to D0265B in abort path:');
  for (const ref of counterRefs) {
    console.log('    ' + hex(ref.address) + '  ' + ref.mnemonic + ref.suffix);
  }
} else {
  console.log('  No direct D0265B references in abort path disassembly.');
  console.log('  (May be IY-relative, or accessed via HL pointer.)');
}

// 10. Nearby printable strings
console.log('\n' + '='.repeat(70));
console.log('  NEARBY PRINTABLE STRINGS (0x025740 - 0x0257C0)');
console.log('='.repeat(70));

const nearbyStrings = scanNearbyStrings(0x025740, 0x80);
if (nearbyStrings.length) {
  for (const s of nearbyStrings) {
    console.log('    ' + hex(s.address) + '  "' + s.text + '"');
  }
} else {
  console.log('  No printable strings found in this region.');
}

// 11. Raw hex dump of key regions
console.log('\n' + '='.repeat(70));
console.log('  RAW HEX DUMP');
console.log('='.repeat(70));

function hexDump(start, length) {
  const lines = [];
  for (let i = 0; i < length; i += 16) {
    const addr = start + i;
    const rowEnd = Math.min(i + 16, length);
    const bytes = [];
    const ascii = [];
    for (let j = i; j < rowEnd; j++) {
      bytes.push(hexByte(rom[start + j]));
      const ch = rom[start + j];
      ascii.push(ch >= 0x20 && ch <= 0x7e ? String.fromCharCode(ch) : '.');
    }
    lines.push('  ' + hex(addr) + '  ' + bytes.join(' ').padEnd(48) + '  ' + ascii.join(''));
  }
  return lines.join('\n');
}

console.log('  0x025758 (' + VALIDATOR_BYTES + 'B):');
console.log(hexDump(VALIDATOR_START, VALIDATOR_BYTES));
console.log('\n  0x025762 (' + ABORT_BYTES + 'B):');
console.log(hexDump(ABORT_START, ABORT_BYTES));
console.log('\n  0x025774 (' + CLEANUP_BYTES + 'B):');
console.log(hexDump(CLEANUP_START, CLEANUP_BYTES));

// 12. Structured summary
console.log('\n' + '='.repeat(70));
console.log('  STRUCTURED SUMMARY');
console.log('='.repeat(70));

const allTargets = new Set();
const allRam = new Set();

function collectReferences(rows) {
  for (const row of rows) {
    const combined = row.mnemonic + ' ' + row.suffix;
    for (const match of combined.matchAll(/0x([0-9A-Fa-f]{6})/g)) {
      const value = parseInt(match[1], 16);
      if (value >= 0xd00000 && value < 0xe00000) {
        allRam.add(value);
      } else if (value < 0x400000 && value !== row.address) {
        allTargets.add(value);
      }
    }
  }
}

collectReferences(validator.rows);
collectReferences(abort.rows);
collectReferences(cleanup.rows);
collectReferences(abortFinal.rows);

console.log('\n  ROM targets (CALL/JP destinations):');
for (const target of [...allTargets].sort((a, b) => a - b)) {
  const note = knownAddresses.get(target);
  console.log('    ' + hex(target) + (note ? '  ' + note : ''));
}

console.log('\n  RAM addresses referenced:');
for (const addr of [...allRam].sort((a, b) => a - b)) {
  const note = knownAddresses.get(addr);
  console.log('    ' + hex(addr) + (note ? '  ' + note : ''));
}

console.log('\n  Function sizes:');
console.log('    0x025758 validator:    ' + validator.byteCount + 'B ('
  + hex(VALIDATOR_START) + ' - ' + hex(validator.endAddress) + ')');
console.log('    0x025762 abort:        ' + abort.byteCount + 'B ('
  + hex(ABORT_START) + ' - ' + hex(abort.endAddress) + ')');
console.log('    0x025774 cleanup:      ' + cleanup.byteCount + 'B ('
  + hex(CLEANUP_START) + ' - ' + hex(cleanup.endAddress) + ')');
console.log('    0x023955 abort final:  ' + abortFinal.byteCount + 'B ('
  + hex(ABORT_FINAL_START) + ' - ' + hex(abortFinal.endAddress) + ')');

console.log('\n  Callers of 0x025758:');
console.log('    ' + xrefs025758.length + ' xref(s) -- shared utility across sibling validators');
for (const xref of xrefs025758) {
  console.log('    ' + hex(xref.address) + ' (' + xref.type + ')');
}

console.log('\n  Signal convention:');
console.log('    Z flag = failure (invalid header) -> caller uses JP Z to abort path');
console.log('    NZ flag = success (valid header) -> caller continues');

console.log('\n=== End Phase 566 ===');
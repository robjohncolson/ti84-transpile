#!/usr/bin/env node

/**
 * Phase 311 Probe: Certificate Region Deep Dive (0x3B0001-0x3C0000)
 *
 * Parses the ROM certificate region field-by-field, dumps all payloads,
 * scans for all CALL sites to FindFirstCertField and GetFieldSizeFromType,
 * and cross-references field type IDs against ti84pceg.inc.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rom = readFileSync(path.join(__dirname, 'ROM.rom'));

// --- Constants ---

const CERT_REGION_START = 0x3B0001;
const CERT_REGION_END = 0x3C0000;

const FIND_FIRST_CERT_FIELD = 0x000310;
const GET_FIELD_SIZE_FROM_TYPE = 0x00030C;

// All certificate-related vectors from ti84pceg.inc
const CERT_VECTORS = {
  0x0002EC: 'CleanupCertificate',
  0x000308: 'ChkCertSpace',
  0x00030C: 'GetFieldSizeFromType',
  0x000310: 'FindFirstCertField',
  0x000314: 'FindField',
  0x000318: 'FindNextField',
  0x00031C: 'GetCertificateEnd',
  0x000320: 'GetFieldSizeFromType_',
  0x000324: 'GetFieldFromSize',
  0x000328: 'NextFieldFromSize',
  0x00032C: 'NextFieldFromType',
  0x000330: 'GetOffsetToNextField',
  0x000338: 'boot.GetCertCalcString',
  0x00033C: 'boot.GetCertCalcID',
  0x000340: 'GetSerial',
  0x000368: 'FindAppHeaderSubField',
  0x000370: 'FindAppHeaderTimestamp',
};

// Known TI certificate field type names (from TI documentation and convention)
const KNOWN_FIELD_TYPES = {
  0x0330: 'Calc string / product name',
  0x0340: 'Hardware revision',
  0x0350: 'Boot code version (major.minor.build)',
  0x0370: 'OS version (major.minor.build)',
  0x0B00: 'Serial number',
  0x0C00: 'Device descriptor / feature flags',
  0x0C10: 'Device class list (comma-delimited)',
};

// --- Helpers ---

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function bytesAt(addr, length) {
  return Array.from(rom.subarray(addr, Math.min(addr + length, rom.length)))
    .map((b) => b.toString(16).toUpperCase().padStart(2, '0'))
    .join(' ');
}

function asciiAt(addr, length) {
  const bytes = rom.subarray(addr, Math.min(addr + length, rom.length));
  return Array.from(bytes)
    .map((b) => (b >= 0x20 && b <= 0x7E) ? String.fromCharCode(b) : '.')
    .join('');
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
    case 'call': return `CALL ${hex(inst.target)}`;
    case 'call-conditional': return `CALL ${inst.condition.toUpperCase()}, ${hex(inst.target)}`;
    case 'jp': return `JP ${hex(inst.target)}`;
    case 'jp-conditional': return `JP ${inst.condition.toUpperCase()}, ${hex(inst.target)}`;
    case 'jr': return `JR ${hex(inst.target)}`;
    case 'jr-conditional': return `JR ${inst.condition.toUpperCase()}, ${hex(inst.target)}`;
    case 'ret': return 'RET';
    case 'ret-conditional': return `RET ${inst.condition.toUpperCase()}`;
    case 'ld-reg-imm': return `LD ${inst.dest.toUpperCase()}, ${hex(inst.value, 2)}`;
    case 'ld-reg-reg': return `LD ${inst.dest.toUpperCase()}, ${inst.src.toUpperCase()}`;
    case 'ld-reg-mem': return `LD ${inst.dest.toUpperCase()}, (${hex(inst.addr)})`;
    case 'ld-mem-reg': return `LD (${hex(inst.addr)}), ${inst.src.toUpperCase()}`;
    case 'ld-pair-imm': return `LD ${inst.pair.toUpperCase()}, ${hex(inst.value)}`;
    case 'ld-pair-mem':
      if (inst.direction === 'to-mem') return `LD (${hex(inst.addr)}), ${inst.pair.toUpperCase()}`;
      if (inst.direction === 'from-mem') return `LD ${inst.pair.toUpperCase()}, (${hex(inst.addr)})`;
      return `LD ${inst.pair.toUpperCase()}, (${hex(inst.addr)})`;
    case 'ld-mem-pair': return `LD (${hex(inst.addr)}), ${inst.pair.toUpperCase()}`;
    case 'alu-imm': return `${inst.op.toUpperCase()} ${hex(inst.value, 2)}`;
    case 'alu-reg': return `${inst.op.toUpperCase()} ${inst.src.toUpperCase()}`;
    case 'push': return `PUSH ${inst.pair.toUpperCase()}`;
    case 'pop': return `POP ${inst.pair.toUpperCase()}`;
    case 'add-pair': return `ADD ${inst.dest.toUpperCase()}, ${inst.src.toUpperCase()}`;
    case 'sbc-pair': return `SBC HL, ${inst.src.toUpperCase()}`;
    case 'ld-ind-reg': return `LD (${inst.dest.toUpperCase()}), ${inst.src.toUpperCase()}`;
    case 'ld-reg-ind': return `LD ${inst.dest.toUpperCase()}, (${inst.src.toUpperCase()})`;
    case 'inc-reg': return `INC ${inst.reg.toUpperCase()}`;
    case 'dec-reg': return `DEC ${inst.reg.toUpperCase()}`;
    case 'inc-pair': return `INC ${inst.pair.toUpperCase()}`;
    case 'dec-pair': return `DEC ${inst.pair.toUpperCase()}`;
    case 'nop': return 'NOP';
    case 'scf': return 'SCF';
    case 'djnz': return `DJNZ ${hex(inst.target)}`;
    case 'ex-de-hl': return 'EX DE, HL';
    case 'bit-test': return `BIT ${inst.bit}, ${inst.reg.toUpperCase()}`;
    case 'bit-test-ind': return `BIT ${inst.bit}, (${inst.indirectRegister.toUpperCase()})`;
    default:
      return `[${inst.tag}] ${JSON.stringify(inst)}`;
  }
}

function disasmLinear(start, maxInstructions, stopOnRet = false) {
  const lines = [];
  let pc = start;

  for (let i = 0; i < maxInstructions && pc < rom.length; i++) {
    const inst = disasmAt(pc);
    if (!inst || !inst.length) {
      lines.push({ addr: pc, bytes: bytesAt(pc, 1), text: `DB ${hex(rom[pc], 2)}`, inst: null });
      pc += 1;
      continue;
    }
    lines.push({
      addr: pc,
      bytes: bytesAt(pc, inst.length),
      text: formatInst(inst),
      inst,
    });
    pc += inst.length;
    if (stopOnRet && ['ret', 'reti', 'retn'].includes(inst.tag)) break;
  }

  return lines;
}

function printDisasm(lines, indent = '  ') {
  for (const line of lines) {
    console.log(`${indent}${hex(line.addr)}  ${line.bytes.padEnd(20)}  ${line.text}`);
  }
}

// --- Certificate field parser ---

function parseCertFields(start, end) {
  const fields = [];
  let addr = start;

  while (addr < end) {
    const byte0 = rom[addr];
    if (byte0 === 0xFF) {
      return { fields, endMarker: addr };
    }

    const byte1 = rom[addr + 1];
    const type = (byte0 << 8) | (byte1 & 0xF0);
    const sizeCode = byte1 & 0x0F;

    let size = sizeCode;
    let sizeBytes = 0;
    let payload = addr + 2;

    if (sizeCode === 0x0D) {
      size = rom[payload];
      sizeBytes = 1;
      payload += 1;
    } else if (sizeCode === 0x0E) {
      size = (rom[payload] << 8) | rom[payload + 1];
      sizeBytes = 2;
      payload += 2;
    } else if (sizeCode === 0x0F) {
      size = (rom[payload] << 16) | (rom[payload + 1] << 8) | rom[payload + 2];
      sizeBytes = 3;
      payload += 3;
    }

    const next = payload + size;
    fields.push({
      addr,
      type,
      byte0,
      byte1,
      sizeCode,
      sizeBytes,
      size,
      headerBytes: 2 + sizeBytes,
      payload,
      next,
    });

    addr = next;
  }

  return { fields, endMarker: null };
}

// --- CALL scanner ---

function scanCallers(target) {
  const bytes = [
    0xCD,
    target & 0xFF,
    (target >> 8) & 0xFF,
    (target >> 16) & 0xFF,
  ];
  const callers = [];
  for (let i = 0; i <= rom.length - bytes.length; i++) {
    let match = true;
    for (let j = 0; j < bytes.length; j++) {
      if (rom[i + j] !== bytes[j]) {
        match = false;
        break;
      }
    }
    if (match) callers.push(i);
  }
  return callers;
}

/**
 * Look backwards from a CALL site searching for LD DE, imm24 instructions
 * to determine which field type ID is being requested.
 * LD DE, nn in ADL mode is: 11 nn nn nn (opcode 0x11, 3-byte little-endian)
 */
function findFieldTypeArg(callAddr) {
  const maxScanBack = 32;
  const results = [];
  const startScan = Math.max(0, callAddr - maxScanBack);

  // Scan backward looking for LD DE, imm24 (0x11 xx xx xx)
  for (let addr = callAddr - 4; addr >= startScan; addr--) {
    if (rom[addr] === 0x11) {
      const val = rom[addr + 1] | (rom[addr + 2] << 8) | (rom[addr + 3] << 16);
      // Validate: field types are 16-bit values with low nibble zero
      if (val < 0x10000 && (val & 0x0F) === 0x00) {
        results.push({ addr, value: val });
      }
      // Also accept any value in case the field type is unusual
      if (val < 0x10000) {
        if (!results.find((r) => r.addr === addr)) {
          results.push({ addr, value: val });
        }
      }
      break; // stop at first LD DE found
    }
  }

  return results;
}

// --- Section printing ---

function printSection(title) {
  console.log(`\n${'='.repeat(92)}`);
  console.log(title);
  console.log('='.repeat(92));
}

function printSubSection(title) {
  console.log(`\n${'-'.repeat(72)}`);
  console.log(title);
  console.log('-'.repeat(72));
}

// ===== MAIN =====

printSection('SECTION 1: Certificate Region Field Structure Format');

console.log(`
Certificate region: ${hex(CERT_REGION_START)} .. ${hex(CERT_REGION_END)}

Field encoding (TLV — Type-Length-Value):

  Byte 0:  high byte of field type
  Byte 1:  bits [7:4] = low nibble of field type
           bits [3:0] = size encoding:
             0x00..0x0C: inline size (0-12 bytes)
             0x0D:       next 1 byte is the size
             0x0E:       next 2 bytes (big-endian) are the size
             0x0F:       next 3 bytes (big-endian) are the size
  Then:    <size> bytes of payload

  End marker: 0xFF byte terminates the field list.

  Type reconstruction: type = (byte0 << 8) | (byte1 & 0xF0)
`);

printSection('SECTION 2: Raw Hex Dump of Certificate Region');

const DUMP_START = CERT_REGION_START;
const DUMP_END = Math.min(CERT_REGION_START + 0x80, CERT_REGION_END);
for (let addr = DUMP_START; addr < DUMP_END; addr += 16) {
  const len = Math.min(16, DUMP_END - addr);
  const hexPart = bytesAt(addr, len);
  const asciiPart = asciiAt(addr, len);
  console.log(`  ${hex(addr)}  ${hexPart.padEnd(48)}  ${asciiPart}`);
}

printSection('SECTION 3: Parsed Certificate Fields');

const cert = parseCertFields(CERT_REGION_START, CERT_REGION_END);

console.log(`  Found ${cert.fields.length} field(s), end marker at ${cert.endMarker ? hex(cert.endMarker) : '(not found)'}\n`);

for (const field of cert.fields) {
  const typeName = KNOWN_FIELD_TYPES[field.type] || '(unknown)';
  console.log(`  --- Field at ${hex(field.addr)} ---`);
  console.log(`    Type:       ${hex(field.type, 4)}  ${typeName}`);
  console.log(`    Header:     ${bytesAt(field.addr, field.headerBytes)}  (${field.headerBytes} bytes)`);
  console.log(`    Size code:  ${hex(field.sizeCode, 1)} -> payload size = ${field.size}`);
  console.log(`    Payload at: ${hex(field.payload)}`);
  console.log(`    Hex:        ${bytesAt(field.payload, field.size)}`);
  console.log(`    ASCII:      ${asciiAt(field.payload, field.size)}`);
  console.log();
}

printSubSection('Post-fields region scan (next 32 bytes after end marker)');
if (cert.endMarker) {
  console.log(`  ${hex(cert.endMarker)}: ${bytesAt(cert.endMarker, 32)}`);
  const allFF = Array.from(rom.subarray(cert.endMarker, cert.endMarker + 32)).every((b) => b === 0xFF);
  console.log(`  All 0xFF: ${allFF ? 'yes (erased flash)' : 'no (contains data)'}`);
}

printSection('SECTION 4: FindFirstCertField (0x000310) — All CALL Sites');

const findFieldCallers = scanCallers(FIND_FIRST_CERT_FIELD);
console.log(`  Found ${findFieldCallers.length} CALL site(s) to FindFirstCertField\n`);

for (const caller of findFieldCallers) {
  const fieldArgs = findFieldTypeArg(caller);
  const argStr = fieldArgs.length > 0
    ? fieldArgs.map((a) => {
        const name = KNOWN_FIELD_TYPES[a.value] || '';
        return `DE=${hex(a.value, 4)} at ${hex(a.addr)}${name ? ` (${name})` : ''}`;
      }).join(', ')
    : '(no LD DE found in preceding 32 bytes)';

  console.log(`  ${hex(caller)}: CALL FindFirstCertField`);
  console.log(`    Field type arg: ${argStr}`);

  // Show context: a few instructions before and after
  const contextStart = Math.max(0, caller - 12);
  const contextLines = disasmLinear(contextStart, 12, false);
  // Filter to show only the relevant window
  const relevant = contextLines.filter((l) => l.addr >= caller - 8 && l.addr <= caller + 8);
  printDisasm(relevant, '    ');
  console.log();
}

printSection('SECTION 5: GetFieldSizeFromType (0x00030C) — All CALL Sites');

const getSizeCallers = scanCallers(GET_FIELD_SIZE_FROM_TYPE);
console.log(`  Found ${getSizeCallers.length} CALL site(s) to GetFieldSizeFromType\n`);

for (const caller of getSizeCallers) {
  console.log(`  ${hex(caller)}: CALL GetFieldSizeFromType`);
  const contextStart = Math.max(0, caller - 8);
  const contextLines = disasmLinear(contextStart, 10, false);
  const relevant = contextLines.filter((l) => l.addr >= caller - 4 && l.addr <= caller + 8);
  printDisasm(relevant, '    ');
  console.log();
}

printSection('SECTION 6: Other Certificate Vector CALL Sites');

const otherVectors = Object.entries(CERT_VECTORS).filter(
  ([addr]) => Number(addr) !== FIND_FIRST_CERT_FIELD && Number(addr) !== GET_FIELD_SIZE_FROM_TYPE
);

for (const [addrStr, name] of otherVectors) {
  const addr = Number(addrStr);
  const callers = scanCallers(addr);
  if (callers.length === 0) continue;

  printSubSection(`${name} (${hex(addr)}) — ${callers.length} caller(s)`);
  for (const caller of callers) {
    console.log(`  ${hex(caller)}: CALL ${name}`);
    const contextLines = disasmLinear(Math.max(0, caller - 8), 8, false);
    const relevant = contextLines.filter((l) => l.addr >= caller - 4 && l.addr <= caller + 4);
    printDisasm(relevant, '    ');
    console.log();
  }
}

printSection('SECTION 7: Cross-Reference with ti84pceg.inc');

console.log(`
  Certificate helper vector table (from ti84pceg.inc):
`);
for (const [addrStr, name] of Object.entries(CERT_VECTORS).sort((a, b) => Number(a[0]) - Number(b[0]))) {
  const addr = Number(addrStr);
  const callerCount = scanCallers(addr).length;
  console.log(`    ${hex(addr)}  ${name.padEnd(30)}  ${callerCount} caller(s)`);
}

console.log(`
  Field type cross-reference:
`);
for (const field of cert.fields) {
  const typeName = KNOWN_FIELD_TYPES[field.type] || '(unknown)';
  // Check if there is an inc entry whose address matches the type value
  console.log(`    type ${hex(field.type, 4)}  size=${String(field.size).padStart(3)}  ${typeName}`);
}

printSection('SECTION 8: Field Catalog Summary');

console.log(`
Certificate region ${hex(CERT_REGION_START)}..${hex(CERT_REGION_END)}
Total fields: ${cert.fields.length}
End marker:   ${cert.endMarker ? hex(cert.endMarker) : '(not found)'}
Used bytes:   ${cert.endMarker ? cert.endMarker - CERT_REGION_START : '(unknown)'} (${cert.endMarker ? hex(CERT_REGION_START) : '?'}..${cert.endMarker ? hex(cert.endMarker) : '?'})
Free space:   ${cert.endMarker ? CERT_REGION_END - cert.endMarker : '(unknown)'} bytes (all 0xFF = erased flash)

Complete field catalog:
`);

console.log('  | Field addr  | Type   | Name                                | Payload addr | Size | Hex payload                                | ASCII          |');
console.log('  |-------------|--------|-------------------------------------|--------------|------|--------------------------------------------|----------------|');
for (const field of cert.fields) {
  const typeName = (KNOWN_FIELD_TYPES[field.type] || '(unknown)').padEnd(35);
  const hexPayload = bytesAt(field.payload, field.size).padEnd(42);
  const ascii = asciiAt(field.payload, field.size).padEnd(14);
  console.log(`  | ${hex(field.addr)} | ${hex(field.type, 4)} | ${typeName} | ${hex(field.payload)} | ${String(field.size).padStart(4)} | ${hexPayload} | ${ascii} |`);
}

printSection('SECTION 9: Interpretation of Each Field');

for (const field of cert.fields) {
  const typeName = KNOWN_FIELD_TYPES[field.type] || '(unknown)';
  printSubSection(`${hex(field.type, 4)} — ${typeName}`);

  const payloadBytes = Array.from(rom.subarray(field.payload, field.payload + field.size));

  switch (field.type) {
    case 0x0330: {
      // Product name / calc string
      const str = asciiAt(field.payload, field.size).replace(/\0+$/, '');
      console.log(`  Product string: "${str}"`);
      console.log(`  This is the calculator model string returned by boot.GetCertCalcString (${hex(0x000338)}).`);
      break;
    }
    case 0x0340: {
      // Hardware revision
      console.log(`  Hardware revision byte: ${hex(payloadBytes[0], 2)}`);
      console.log(`  Returned by GetSerial-adjacent helpers. Single-byte hardware rev.`);
      break;
    }
    case 0x0350: {
      // Boot version
      if (field.size >= 3) {
        console.log(`  Boot version: ${payloadBytes[0]}.${payloadBytes[1]}.${payloadBytes[2]}`);
      } else {
        console.log(`  Boot version bytes: ${bytesAt(field.payload, field.size)}`);
      }
      break;
    }
    case 0x0370: {
      // OS version
      if (field.size >= 3) {
        console.log(`  OS version: ${payloadBytes[0]}.${payloadBytes[1]}.${payloadBytes[2]}`);
      } else {
        console.log(`  OS version bytes: ${bytesAt(field.payload, field.size)}`);
      }
      break;
    }
    case 0x0B00: {
      // Serial number
      const serial = asciiAt(field.payload, field.size).replace(/\0+$/, '');
      console.log(`  Serial number: "${serial}" (${field.size} bytes)`);
      console.log(`  Returned by GetSerial (${hex(0x000340)}).`);
      break;
    }
    case 0x0C00: {
      // Device descriptor
      console.log(`  Descriptor bytes: ${bytesAt(field.payload, field.size)}`);
      console.log(`  byte0 = ${hex(payloadBytes[0], 2)}: primary feature flags (bits 0-5 tested by setClassResult)`);
      console.log(`  byte1 = ${hex(payloadBytes[1], 2)}: secondary mode byte (bit7 = subtype present, bit2 = external lookup)`);
      if (field.size >= 3) {
        console.log(`  byte2 = ${hex(payloadBytes[2], 2)}: currently unused by known callers`);
      }
      console.log(`  Consumed by descriptor getter at 0x0421A7 -> setClassResult at 0x042366.`);
      break;
    }
    default: {
      console.log(`  Raw payload: ${bytesAt(field.payload, field.size)}`);
      console.log(`  ASCII: "${asciiAt(field.payload, field.size)}"`);
      break;
    }
  }
}

printSection('SECTION 10: Summary');

console.log(`
1. The certificate region ${hex(CERT_REGION_START)}..${hex(CERT_REGION_END)} is a TLV (Type-Length-Value)
   structure stored in flash. It contains ${cert.fields.length} fields terminated by a 0xFF end marker at
   ${cert.endMarker ? hex(cert.endMarker) : '(not found)'}.

2. Field structure format:
   - 2-byte header: byte0 = type high byte, byte1 = (type low nibble << 4) | size encoding
   - Size encoding 0-12 is inline; 0x0D/0x0E/0x0F indicate 1/2/3-byte extended size follows
   - Then <size> bytes of payload

3. The 6 fields encode:
   - 0x0330: Calculator product string (24 bytes)
   - 0x0340: Hardware revision (1 byte)
   - 0x0350: Boot code version (3 bytes)
   - 0x0B00: Serial number (8 bytes)
   - 0x0C00: Device feature descriptor (3 bytes) — consumed by setClassResult
   - 0x0370: OS version (3 bytes)

4. FindFirstCertField has ${findFieldCallers.length} call site(s) across the ROM.
   GetFieldSizeFromType has ${getSizeCallers.length} call site(s).

5. The region uses only ${cert.endMarker ? cert.endMarker - CERT_REGION_START : '?'} bytes of the
   available ${CERT_REGION_END - CERT_REGION_START} byte region. The rest is 0xFF (erased flash).
`);

console.log('Probe complete.');

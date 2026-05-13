#!/usr/bin/env node

/**
 * Phase 310 Probe: descriptor getter at 0x0421A7
 *
 * This probe disassembles the getter, resolves the certificate field that it
 * returns, dumps the current descriptor payload, lists all static callers, and
 * cross-references how setClassResult consumes the descriptor bytes.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rom = readFileSync(path.join(__dirname, 'ROM.rom'));

const DESCRIPTOR_GETTER = 0x0421A7;
const FALLBACK_DESCRIPTOR = 0x0421BC;
const BYTE1_HELPER = 0x0421BF;
const FEATURE0_HELPER = 0x0422D2;
const LIST_MATCH_HELPER = 0x042323;
const SET_CLASS_RESULT = 0x042366;

const GET_FIELD_SIZE_FROM_TYPE = 0x00030C;
const FIND_FIRST_CERT_FIELD = 0x000310;
const GET_FIELD_SIZE_IMPL = 0x001C4F;
const FIND_FIRST_CERT_FIELD_IMPL = 0x001C55;
const CERT_TAG_COMPARE = 0x001C33;
const FIELD_SIZE_DECODER = 0x001CA6;

const CERT_REGION_START = 0x3B0001;
const CERT_REGION_END = 0x3C0000;
const FIELD_0C00 = 0x0C00;
const FIELD_0C10 = 0x0C10;

const KNOWN_ADDRS = {
  0x00030C: 'GetFieldSizeFromType veneer',
  0x000310: 'FindFirstCertField veneer',
  0x001C33: 'cert field type compare',
  0x001C4F: 'GetFieldSizeFromType implementation',
  0x001C55: 'FindFirstCertField implementation',
  0x001CA6: 'field size decoder',
  0x0421A7: 'descriptor getter (0x0C00 payload)',
  0x0421BC: 'fallback descriptor bytes',
  0x0421BF: 'byte1 subtype helper',
  0x0422D2: 'feature 0 helper',
  0x042323: '0x0C10 list matcher',
  0x042366: 'setClassResult',
  0x04CA21: 'feature 0 result sink',
  0xD005F9: 'feature 0 output byte',
  0xD17713: 'cached descriptor pointer',
  0xD17726: 'cached descriptor size',
  0x3B0001: 'certificate region start',
  0x3C0000: 'certificate region end',
};

const CALLER_NOTES = {
  0x029B0C: 'Loads descriptor byte0 into B and forwards it to 0x028A91.',
  0x0421BF: 'Helper that returns byte1 low 3 bits when byte1 bit7 is set.',
  0x0422DB: 'Feature 0 helper used by setClassResult.',
  0x04236A: 'Main setClassResult entry.',
  0x043768: 'Caches the descriptor payload pointer in RAM and hardcodes size 3.',
  0x0BD3E8: 'Variant helper: byte1 subtype if present, else returns 8 when byte0 has any low 6-bit flag set.',
};

const FEATURE_NOTES = [
  'A=0  -> call 0x0422D2. If byte1.bit2 is set, run an external lookup and test mask 0x20 at offset +0x10E. Otherwise, if byte0.bit4 is clear return true; if byte0.bit4 is set, optionally look up cert field 0x0C10 and compare the caller buffer against a comma-delimited list.',
  'A=1  -> call 0x0421BF. If the returned subtype is 4, force success. Otherwise test byte0.bit4.',
  'A=2  -> test byte0.bit0.',
  'A=3  -> test whether any bit in (byte0 & 0x3F) is set.',
  'A=4  -> no explicit handler; falls through false.',
  'A=5  -> no explicit handler; falls through false.',
  'A=6  -> no explicit handler; falls through false.',
  'A=7  -> test byte0.bit1.',
  'A=8  -> test byte0.bit2.',
  'A=9  -> test byte0.bit3.',
  'A=10 -> test byte0.bit5.',
];

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function bytesAt(addr, length) {
  return Array.from(rom.subarray(addr, Math.min(addr + length, rom.length)))
    .map((byte) => byte.toString(16).toUpperCase().padStart(2, '0'))
    .join(' ');
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
    case 'indexed-cb-bit': return `BIT ${inst.bit}, (${inst.indexRegister.toUpperCase()}${inst.displacement >= 0 ? '+' : ''}${inst.displacement})`;
    case 'indexed-cb-set': return `SET ${inst.bit}, (${inst.indexRegister.toUpperCase()}${inst.displacement >= 0 ? '+' : ''}${inst.displacement})`;
    case 'indexed-cb-res': return `RES ${inst.bit}, (${inst.indexRegister.toUpperCase()}${inst.displacement >= 0 ? '+' : ''}${inst.displacement})`;
    case 'ld-pair-indexed': return `LD ${inst.pair.toUpperCase()}, (${inst.indexRegister.toUpperCase()}${inst.displacement >= 0 ? '+' : ''}${inst.displacement})`;
    case 'ld-indexed-pair': return `LD (${inst.indexRegister.toUpperCase()}${inst.displacement >= 0 ? '+' : ''}${inst.displacement}), ${inst.pair.toUpperCase()}`;
    case 'ld-reg-ixd': return `LD ${inst.dest.toUpperCase()}, (${inst.indexRegister.toUpperCase()}${inst.displacement >= 0 ? '+' : ''}${inst.displacement})`;
    case 'ld-ixd-reg': return `LD (${inst.indexRegister.toUpperCase()}${inst.displacement >= 0 ? '+' : ''}${inst.displacement}), ${inst.src.toUpperCase()}`;
    case 'ld-ixd-imm': return `LD (${inst.indexRegister.toUpperCase()}${inst.displacement >= 0 ? '+' : ''}${inst.displacement}), ${hex(inst.value, 2)}`;
    case 'lea': return `LEA ${inst.dest.toUpperCase()}, ${inst.base.toUpperCase()}${inst.displacement >= 0 ? '+' : ''}${inst.displacement}`;
    default:
      return `[${inst.tag}] ${JSON.stringify(inst)}`;
  }
}

function annotate(inst) {
  const notes = [];
  const check = (addr) => {
    if (KNOWN_ADDRS[addr]) notes.push(KNOWN_ADDRS[addr]);
  };
  if (inst.addr !== undefined) check(inst.addr);
  if (inst.target !== undefined) check(inst.target);
  if (inst.value !== undefined) check(inst.value);
  return notes.join('; ');
}

function disasmLinear(start, maxInstructions, stopOnRet = false) {
  const lines = [];
  let pc = start;

  for (let i = 0; i < maxInstructions && pc < rom.length; i++) {
    const inst = disasmAt(pc);
    if (!inst || !inst.length) {
      lines.push({ addr: pc, bytes: bytesAt(pc, 1), text: `DB ${hex(rom[pc], 2)}`, annotation: '' });
      pc += 1;
      continue;
    }
    lines.push({
      addr: pc,
      bytes: bytesAt(pc, inst.length),
      text: formatInst(inst),
      annotation: annotate(inst),
      inst,
    });
    pc += inst.length;
    if (stopOnRet && ['ret', 'reti', 'retn'].includes(inst.tag)) break;
  }

  return lines;
}

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

function printDisasm(lines, indent = '  ') {
  for (const line of lines) {
    const ann = line.annotation ? `  ; ${line.annotation}` : '';
    console.log(`${indent}${hex(line.addr)}  ${line.bytes.padEnd(20)}  ${line.text.padEnd(42)}${ann}`);
  }
}

function parseCertFields() {
  const fields = [];
  let addr = CERT_REGION_START;

  while (addr < CERT_REGION_END) {
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

const cert = parseCertFields();
const field0C00 = cert.fields.find((field) => field.type === FIELD_0C00);
const field0C10 = cert.fields.find((field) => field.type === FIELD_0C10);
const callers = scanCallers(DESCRIPTOR_GETTER);
const getterLines = disasmLinear(DESCRIPTOR_GETTER, 12, true);
const getterSize =
  getterLines[getterLines.length - 1].addr +
  (getterLines[getterLines.length - 1].inst?.length || 1) -
  DESCRIPTOR_GETTER;

printSection('SECTION 1: Descriptor getter disassembly');
console.log(`
0x0421A7 is a short wrapper around the certificate field helpers.
Expected meaning from the ROM export:
  0x000310 = FindFirstCertField
  0x00030C = GetFieldSizeFromType
`);
printDisasm(getterLines);
console.log(`
  Length: ${getterSize} bytes
  Input:  no explicit argument register; the helper hardcodes field id 0x0C00 in DE
  Output: on success, HL = payload pointer for cert field 0x0C00 and BC = payload size
          on miss,    HL = ${hex(FALLBACK_DESCRIPTOR)} (fallback bytes ${bytesAt(FALLBACK_DESCRIPTOR, 3)})
  Clobbers: DE always; BC/A/flags on the success path via GetFieldSizeFromType
  Preserves: nothing guarantees A/BC/flags; callers that care push AF/BC themselves
`);

printSubSection('Jump veneers and helper implementations');
printDisasm(disasmLinear(GET_FIELD_SIZE_FROM_TYPE, 1, false));
printDisasm(disasmLinear(FIND_FIRST_CERT_FIELD, 1, false));
printDisasm(disasmLinear(CERT_TAG_COMPARE, 16, true));
printDisasm(disasmLinear(GET_FIELD_SIZE_IMPL, 8, true));
printDisasm(disasmLinear(FIND_FIRST_CERT_FIELD_IMPL, 24, false));
printDisasm(disasmLinear(FIELD_SIZE_DECODER, 40, true));

printSection('SECTION 2: Descriptor source field and payload dump');
console.log(`
FindFirstCertField scans the certificate region ${hex(CERT_REGION_START)}..${hex(CERT_REGION_END)}.
Parsed certificate fields in this ROM:
`);
for (const field of cert.fields) {
  console.log(
    `  field=${hex(field.addr)} type=${hex(field.type, 4)} payload=${hex(field.payload)} ` +
    `size=${field.size} sizeCode=${hex(field.sizeCode, 1)} headerBytes=${field.headerBytes}`
  );
}
console.log(`  end marker at ${cert.endMarker ? hex(cert.endMarker) : '(not found)'}`);

if (field0C00) {
  printSubSection('Resolved 0x0C00 descriptor field');
  console.log(`  field header address: ${hex(field0C00.addr)}`);
  console.log(`  field header bytes:   ${bytesAt(field0C00.addr, field0C00.headerBytes)}`);
  console.log(`  payload address:      ${hex(field0C00.payload)}`);
  console.log(`  payload size:         ${field0C00.size}`);
  console.log(`  payload bytes:        ${bytesAt(field0C00.payload, field0C00.size)}`);
} else {
  console.log('  No 0x0C00 field exists in the certificate region.');
}

printSubSection('Fallback descriptor');
console.log(`  fallback address: ${hex(FALLBACK_DESCRIPTOR)}`);
console.log(`  fallback bytes:   ${bytesAt(FALLBACK_DESCRIPTOR, 3)}`);

printSubSection('Descriptor format inferred from callers');
console.log('  Record count: 1 descriptor record in this ROM. There is no runtime-built array.');
console.log('  Record size:  3 bytes.');
console.log('  byte0:        primary feature flags. setClassResult uses bits 0,1,2,3,4,5 and (byte0 & 0x3F).');
console.log('  byte1:        secondary mode byte. 0x0421BF checks bit7 and returns low 3 bits; 0x0422D2 tests bit2.');
console.log('  byte2:        no direct consumer among the six static callers of 0x0421A7 in this ROM; currently 0x00.');
console.log('  Note: byte2 being unused is an inference from observed callers, not a global proof.');
console.log(`  Optional field 0x0C10 present: ${field0C10 ? `yes at ${hex(field0C10.payload)}` : 'no'}`);

printSection('SECTION 3: All static callers of 0x0421A7');
console.log(`  Found ${callers.length} CALL site(s): ${callers.map((addr) => hex(addr)).join(', ')}`);
for (const caller of callers) {
  printSubSection(`Caller ${hex(caller)}`);
  if (CALLER_NOTES[caller]) console.log(`  ${CALLER_NOTES[caller]}`);
  printDisasm(disasmLinear(caller, 10, false));
}

printSection('SECTION 4: Cross-reference with setClassResult (0x042366)');
printDisasm(disasmLinear(SET_CLASS_RESULT, 60, true));

printSubSection('Feature-index map used by setClassResult');
for (const note of FEATURE_NOTES) {
  console.log(`  ${note}`);
}
console.log('\n  Note: the prompt said A=0..9, but the code also has an explicit A=10 case. A=4,5,6 fall through false.');

printSubSection('Related helpers');
printDisasm(disasmLinear(BYTE1_HELPER, 8, true));
printDisasm(disasmLinear(FEATURE0_HELPER, 40, true));
printDisasm(disasmLinear(LIST_MATCH_HELPER, 40, true));

printSection('SECTION 5: Summary');
console.log(`
1. 0x0421A7 is a 13-byte ROM wrapper, not a RAM table builder.
2. It asks FindFirstCertField for cert field 0x0C00, then asks GetFieldSizeFromType to advance HL to the payload.
3. In this ROM, the resolved field is:
     header  at ${field0C00 ? hex(field0C00.addr) : '(missing)'}
     payload at ${field0C00 ? hex(field0C00.payload) : hex(FALLBACK_DESCRIPTOR)}
     size    ${field0C00 ? field0C00.size : 3}
     bytes   ${field0C00 ? bytesAt(field0C00.payload, field0C00.size) : bytesAt(FALLBACK_DESCRIPTOR, 3)}
4. If the field is absent, the getter falls back to ${hex(FALLBACK_DESCRIPTOR)} = ${bytesAt(FALLBACK_DESCRIPTOR, 3)}.
5. There is no runtime population step for the descriptor itself. The data lives in the ROM certificate block ${hex(CERT_REGION_START)}..${hex(CERT_REGION_END)}.
6. Other code may copy or cache the 3-byte payload into RAM, but that is consumption of the static descriptor, not initialization of it.
7. Direct callers: ${callers.length} total, with setClassResult being the main feature-test consumer.
`);

console.log('Probe complete.');

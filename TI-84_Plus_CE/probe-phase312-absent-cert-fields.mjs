#!/usr/bin/env node

/**
 * Phase 312 probe: absent certificate fields.
 *
 * This is a static ROM probe. It:
 *   1. parses the OS certificate region
 *   2. verifies which target field types are present vs absent
 *   3. scans the ROM for direct CALLs to FindFirstCertField
 *   4. prints the callers that request the absent field types
 *   5. prints the already-traced miss-path behavior summary
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rom = readFileSync(path.join(__dirname, 'ROM.rom'));

const CERT_REGION_START = 0x3B0001;
const CERT_REGION_END = 0x3C0000;

const FIND_FIRST_CERT_FIELD = 0x000310;

const TARGET_FIELDS = new Map([
  [0x0C10, 'Optional class-list companion to 0x0C00'],
  [0x0300, 'Replaceable outer certificate transfer record'],
  [0x0230, 'Nested/companion payload paired with 0x0300'],
]);

const KNOWN_FIELDS = new Map([
  [0x0330, 'Calc string / product name'],
  [0x0340, 'Hardware revision'],
  [0x0350, 'Boot code version'],
  [0x0370, 'OS version'],
  [0x0B00, 'Serial number'],
  [0x0C00, 'Device descriptor / feature flags'],
  [0x0C10, 'Optional class list'],
]);

const MISS_BEHAVIOR = {
  0x0C10: [
    {
      callAddr: 0x0422C4,
      parent: '0x04203C update/preserve helper via 0x042057',
      behavior:
        'Miss returns NZ to 0x04205B, which skips the presence flag and continues with 0x0C00 only. CleanupCertificate is skipped because the 0x0C10-present bit stays clear.',
    },
    {
      callAddr: 0x042307,
      parent: '0x0422D2 feature-0 helper inside 0x042366',
      behavior:
        'Miss takes 0x04230D, clears A, and returns false. In this ROM the path is dormant anyway because 0x0C00 = 00 00 00, so byte0.bit4 and byte1.bit2 are both clear.',
    },
  ],
  0x0300: [
    {
      callAddr: 0x028227,
      parent: '0x028215 certificate cleanup helper',
      behavior:
        'Miss jumps to 0x028238, skipping WriteFlashA(0) and leaving the cleanup flag clear. The helper then probes 0x0230.',
    },
  ],
  0x0230: [
    {
      callAddr: 0x02823C,
      parent: '0x028215 certificate cleanup helper',
      behavior:
        'Miss jumps to 0x02824D, skipping WriteFlashA(0) and leaving the cleanup flag unchanged. If 0x0300 was also absent, CleanupCertificate is skipped and the helper returns with no effect.',
    },
    {
      callAddr: 0x0281CB,
      parent: 'Related nested FindField on incoming 0x0300 record',
      behavior:
        'This is not a FindFirstCertField call, but it shows 0x0230 is a required nested payload when an incoming 0x0300 transfer record is validated.',
    },
  ],
};

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

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
    let payload = addr + 2;

    if (sizeCode === 0x0D) {
      size = rom[payload];
      payload += 1;
    } else if (sizeCode === 0x0E) {
      size = (rom[payload] << 8) | rom[payload + 1];
      payload += 2;
    } else if (sizeCode === 0x0F) {
      size = (rom[payload] << 16) | (rom[payload + 1] << 8) | rom[payload + 2];
      payload += 3;
    }

    fields.push({
      addr,
      type,
      payload,
      size,
      next: payload + size,
    });

    addr = payload + size;
  }

  return { fields, endMarker: null };
}

function bytesAt(addr, length) {
  return Array.from(rom.subarray(addr, Math.min(addr + length, rom.length)))
    .map((b) => b.toString(16).toUpperCase().padStart(2, '0'))
    .join(' ');
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

function findFieldTypeArg(callAddr) {
  const start = Math.max(0, callAddr - 32);
  for (let addr = callAddr - 4; addr >= start; addr--) {
    if (rom[addr] !== 0x11) continue;
    const value = rom[addr + 1] | (rom[addr + 2] << 8) | (rom[addr + 3] << 16);
    if (value < 0x10000 && (value & 0x0F) === 0x00) {
      return { addr, value };
    }
  }
  return null;
}

function summarizeCallers() {
  return scanCallers(FIND_FIRST_CERT_FIELD)
    .map((callAddr) => ({
      callAddr,
      arg: findFieldTypeArg(callAddr),
    }))
    .filter((entry) => entry.arg)
    .map((entry) => ({
      callAddr: entry.callAddr,
      fieldType: entry.arg.value,
      ldDeAddr: entry.arg.addr,
    }));
}

function printFieldInventory(fields) {
  console.log('Certificate fields present in ROM:');
  for (const field of fields) {
    const name = KNOWN_FIELDS.get(field.type) ?? '(unknown)';
    console.log(
      `  ${hex(field.type, 4)}  ${name.padEnd(38)} header=${hex(field.addr)} payload=${hex(field.payload)} size=${field.size}`
    );
  }
  console.log('');
}

function main() {
  console.log('Phase 312 Probe: Absent Certificate Fields');
  console.log('');

  const { fields, endMarker } = parseCertFields(CERT_REGION_START, CERT_REGION_END);
  const presentTypes = new Set(fields.map((field) => field.type));
  const descriptor = fields.find((field) => field.type === 0x0C00);

  console.log(`Certificate region: ${hex(CERT_REGION_START)}..${hex(CERT_REGION_END)} (${CERT_REGION_END - CERT_REGION_START} bytes)`);
  console.log(`Parsed fields: ${fields.length}`);
  console.log(`End marker: ${endMarker === null ? '<missing>' : hex(endMarker)}`);
  console.log('');

  printFieldInventory(fields);

  console.log('Target absent-field check:');
  for (const [type, label] of TARGET_FIELDS) {
    const present = presentTypes.has(type);
    console.log(`  ${hex(type, 4)}  ${present ? 'PRESENT' : 'ABSENT '}  ${label}`);
  }
  console.log('');

  if (descriptor) {
    const descriptorBytes = bytesAt(descriptor.payload, descriptor.size);
    const byte0 = rom[descriptor.payload];
    const byte1 = rom[descriptor.payload + 1];
    console.log(`0x0C00 payload bytes: ${descriptorBytes}`);
    console.log(`  byte0.bit4 = ${(byte0 >> 4) & 1}`);
    console.log(`  byte1.bit2 = ${(byte1 >> 2) & 1}`);
    console.log('');
  }

  const callers = summarizeCallers();
  const absentCallerHits = callers.filter((entry) => TARGET_FIELDS.has(entry.fieldType));

  console.log('Direct FindFirstCertField callers for absent target fields:');
  for (const entry of absentCallerHits) {
    const label = TARGET_FIELDS.get(entry.fieldType);
    console.log(
      `  call=${hex(entry.callAddr)}  field=${hex(entry.fieldType, 4)}  ld-de=${hex(entry.ldDeAddr)}  ${label}`
    );
  }
  console.log('');

  console.log('Miss-path summary:');
  for (const [type, notes] of Object.entries(MISS_BEHAVIOR)) {
    console.log(`  ${hex(Number(type), 4)}`);
    for (const note of notes) {
      console.log(`    caller ${hex(note.callAddr)}  ${note.parent}`);
      console.log(`      ${note.behavior}`);
    }
  }
  console.log('');

  console.log('Bottom line:');
  console.log('  - 0x0C10 is optional and inactive in this ROM because 0x0C00 = 00 00 00.');
  console.log('  - 0x0300 and 0x0230 are certificate-maintenance fields; their current-cert miss path is a no-op.');
  console.log('  - No absent field needs to be synthesized for this ROM.');
}

main();

#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const REPORT_PATH = path.join(__dirname, 'phase439-trace-D1407C-report.md');

const TARGET_ADDR = 0xD1407C;
const TARGET_LE = [0x7c, 0x40, 0xd1];
const FUNCTION_SCAN_BACK = 0x800;
const NEARBY_D140_WINDOW = 20;
const NEARBY_PORT_WINDOW = 32;

if (!fs.existsSync(ROM_PATH)) {
  throw new Error(`Missing ROM image: ${ROM_PATH}`);
}

const rom = fs.readFileSync(ROM_PATH);
const ROM_SIZE = rom.length;

const MODE_PREFIX_NAMES = {
  0x40: 'SIS',
  0x49: 'LIS',
  0x52: 'SIL',
  0x5b: 'LIL',
};

const IN_OPS = {
  0x40: 'IN B',
  0x48: 'IN C',
  0x50: 'IN D',
  0x58: 'IN E',
  0x60: 'IN H',
  0x68: 'IN L',
  0x70: 'IN F',
  0x78: 'IN A',
};

const OUT_OPS = {
  0x41: 'OUT B',
  0x49: 'OUT C',
  0x51: 'OUT D',
  0x59: 'OUT E',
  0x61: 'OUT H',
  0x69: 'OUT L',
  0x71: 'OUT F',
  0x79: 'OUT A',
};

const SITE_NOTES = new Map([
  [
    0x0097bc,
    'SOF/front-end gate. If D1407C is clear, the code sets D1407B=1, zeroes D14038, and then acknowledges port 0x313D.',
  ],
  [
    0x009807,
    'Only setter family. Runs inside the 0x0096CB/0x04908C bus-reset handler, writes D1407C=1 and D1407D=1, then read-modify-writes port 0x3120.',
  ],
  [
    0x009892,
    'Teardown gate. If D1407B is already set or D1407C is set, the fall-through clears D1407E, D17796, and D140B2.',
  ],
  [
    0x00c7d2,
    'Pipe-activation handoff. D1407E is set to 1 immediately before D1407C is cleared, then port 0x3100 is touched.',
  ],
  [
    0x00fcff,
    'Bulk state-block reset. The immediate sequence clears D1407C, D14078, D14079, and D1407A; D1407B/D1407E/D1407F follow just outside the +/-20 byte context window.',
  ],
  [
    0x012d0a,
    'Low-ROM helper epilogue. Clears D14081 first, then clears D1407C right before returning.',
  ],
  [
    0x014dc9,
    'Deferred USB/link worker gate (local block 0x014DAB from phase 418). D1407C must be set before the D14038 threshold and D177B8 tests matter.',
  ],
  [
    0x014df8,
    'Late gate in the same deferred worker family. If D1407C is set, the code falls through into the helper-call path before the D14081 gate.',
  ],
  [
    0x02c394,
    'Standalone clear-and-return stub. No nearby D140xx companions or port I/O in the immediate window.',
  ],
  [
    0x041d8a,
    'Flash-only clear site. Clears D14081, D1407C, and D1407B before entering the D1407E/0x3100 service block.',
  ],
]);

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return `0x${(value & 0xff).toString(16).toUpperCase().padStart(2, '0')}`;
}

function formatPort(port) {
  return `0x${port.toString(16).toUpperCase().padStart(4, '0')}`;
}

function readByte(index) {
  if (index < 0 || index >= ROM_SIZE) {
    return -1;
  }
  return rom[index];
}

function hexDump(start, length) {
  const out = [];
  for (let i = 0; i < length; i += 1) {
    const index = start + i;
    if (index < 0 || index >= ROM_SIZE) {
      out.push('??');
    } else {
      out.push(rom[index].toString(16).padStart(2, '0'));
    }
  }
  return out.join(' ');
}

function scanLiteralHits() {
  const hits = [];
  for (let i = 0; i <= ROM_SIZE - 3; i += 1) {
    if (rom[i] === TARGET_LE[0] && rom[i + 1] === TARGET_LE[1] && rom[i + 2] === TARGET_LE[2]) {
      hits.push(i);
    }
  }
  return hits;
}

function classifyLiteralHit(addrPos) {
  const b1 = readByte(addrPos - 1);
  const b2 = readByte(addrPos - 2);
  const modePrefix = MODE_PREFIX_NAMES[b2];

  if (modePrefix && b1 === 0x32) {
    return { type: 'WRITE', mnemonic: `${modePrefix} LD (D1407C),A`, instrStart: addrPos - 2 };
  }
  if (modePrefix && b1 === 0x3a) {
    return { type: 'READ', mnemonic: `${modePrefix} LD A,(D1407C)`, instrStart: addrPos - 2 };
  }
  if (modePrefix && b1 === 0x21) {
    return { type: 'ADDRESS-LOAD', mnemonic: `${modePrefix} LD HL,D1407C`, instrStart: addrPos - 2 };
  }

  if (b1 === 0x32) {
    return { type: 'WRITE', mnemonic: 'LD (D1407C),A', instrStart: addrPos - 1 };
  }
  if (b1 === 0x3a) {
    return { type: 'READ', mnemonic: 'LD A,(D1407C)', instrStart: addrPos - 1 };
  }
  if (b1 === 0x22) {
    return { type: 'WRITE', mnemonic: 'LD (D1407C),HL', instrStart: addrPos - 1 };
  }
  if (b1 === 0x2a) {
    return { type: 'READ', mnemonic: 'LD HL,(D1407C)', instrStart: addrPos - 1 };
  }
  if (b1 === 0x01) {
    return { type: 'ADDRESS-LOAD', mnemonic: 'LD BC,D1407C', instrStart: addrPos - 1 };
  }
  if (b1 === 0x11) {
    return { type: 'ADDRESS-LOAD', mnemonic: 'LD DE,D1407C', instrStart: addrPos - 1 };
  }
  if (b1 === 0x21) {
    return { type: 'ADDRESS-LOAD', mnemonic: 'LD HL,D1407C', instrStart: addrPos - 1 };
  }
  if (b1 === 0x31) {
    return { type: 'ADDRESS-LOAD', mnemonic: 'LD SP,D1407C', instrStart: addrPos - 1 };
  }

  if (b2 === 0xed) {
    const edMap = {
      0x43: ['WRITE', 'LD (D1407C),BC'],
      0x53: ['WRITE', 'LD (D1407C),DE'],
      0x63: ['WRITE', 'LD (D1407C),HL [ED]'],
      0x73: ['WRITE', 'LD (D1407C),SP'],
      0x4b: ['READ', 'LD BC,(D1407C)'],
      0x5b: ['READ', 'LD DE,(D1407C)'],
      0x6b: ['READ', 'LD HL,(D1407C) [ED]'],
      0x7b: ['READ', 'LD SP,(D1407C)'],
    };
    if (edMap[b1]) {
      return { type: edMap[b1][0], mnemonic: edMap[b1][1], instrStart: addrPos - 2 };
    }
  }

  if ((b2 === 0xdd || b2 === 0xfd) && b1 === 0x21) {
    return {
      type: 'ADDRESS-LOAD',
      mnemonic: `LD ${b2 === 0xdd ? 'IX' : 'IY'},D1407C`,
      instrStart: addrPos - 2,
    };
  }
  if ((b2 === 0xdd || b2 === 0xfd) && b1 === 0x2a) {
    return {
      type: 'READ',
      mnemonic: `LD ${b2 === 0xdd ? 'IX' : 'IY'},(D1407C)`,
      instrStart: addrPos - 2,
    };
  }
  if ((b2 === 0xdd || b2 === 0xfd) && b1 === 0x22) {
    return {
      type: 'WRITE',
      mnemonic: `LD (D1407C),${b2 === 0xdd ? 'IX' : 'IY'}`,
      instrStart: addrPos - 2,
    };
  }

  return {
    type: 'UNKNOWN',
    mnemonic: `raw ${hexDump(addrPos - 4, 7)}`,
    instrStart: Math.max(0, addrPos - 1),
  };
}

function classifyIndexedOpcode(prefix, op2, offset) {
  const base = prefix === 0xdd ? 'IX' : 'IY';
  const regLoadMap = {
    0x46: 'B',
    0x4e: 'C',
    0x56: 'D',
    0x5e: 'E',
    0x66: 'H',
    0x6e: 'L',
    0x7e: 'A',
  };
  if (regLoadMap[op2]) {
    return { type: 'READ', mnemonic: `LD ${regLoadMap[op2]},(${base}+${hexByte(offset)})` };
  }

  if (op2 >= 0x70 && op2 <= 0x77) {
    const regStoreMap = {
      0x70: 'B',
      0x71: 'C',
      0x72: 'D',
      0x73: 'E',
      0x74: 'H',
      0x75: 'L',
      0x76: '(HL)',
      0x77: 'A',
    };
    return { type: 'WRITE', mnemonic: `LD (${base}+${hexByte(offset)}),${regStoreMap[op2]}` };
  }

  if (op2 === 0x36) {
    return { type: 'WRITE', mnemonic: `LD (${base}+${hexByte(offset)}),n` };
  }

  if (op2 === 0x34) {
    return { type: 'READ+WRITE', mnemonic: `INC (${base}+${hexByte(offset)})` };
  }
  if (op2 === 0x35) {
    return { type: 'READ+WRITE', mnemonic: `DEC (${base}+${hexByte(offset)})` };
  }

  const aluOps = {
    0x86: 'ADD',
    0x8e: 'ADC',
    0x96: 'SUB',
    0x9e: 'SBC',
    0xa6: 'AND',
    0xae: 'XOR',
    0xb6: 'OR',
    0xbe: 'CP',
  };
  if (aluOps[op2]) {
    return { type: 'READ', mnemonic: `${aluOps[op2]} A,(${base}+${hexByte(offset)})` };
  }

  return null;
}

function scanIndexedHits() {
  const refs = [];
  for (const prefix of [0xdd, 0xfd]) {
    for (let i = 0; i <= ROM_SIZE - 5; i += 1) {
      if (rom[i] !== prefix || rom[i + 1] !== 0x21 || rom[i + 3] !== 0x40 || rom[i + 4] !== 0xd1) {
        continue;
      }

      const baseLow = rom[i + 2];
      if (baseLow < 0x70 || baseLow > 0x7c) {
        continue;
      }

      const offset = TARGET_LE[0] - baseLow;
      if (offset < 0 || offset > 0x7f) {
        continue;
      }

      for (let j = i + 5; j <= Math.min(i + 200, ROM_SIZE - 4); j += 1) {
        if (rom[j] !== prefix) {
          continue;
        }
        const op2 = rom[j + 1];
        const disp = rom[j + 2];
        if (disp !== offset) {
          continue;
        }
        const classified = classifyIndexedOpcode(prefix, op2, offset);
        if (!classified) {
          continue;
        }
        refs.push({
          literalPos: null,
          instrStart: j,
          type: classified.type,
          mnemonic: classified.mnemonic,
          source: 'indexed',
        });
      }
    }
  }
  return refs;
}

function findContainingFunction(instrStart) {
  const low = Math.max(0, instrStart - FUNCTION_SCAN_BACK);
  for (let i = instrStart; i >= low; i -= 1) {
    if (rom[i] === 0xdd && rom[i + 1] === 0xe5) {
      return { start: i, marker: 'PUSH IX' };
    }
    if (rom[i] === 0xcd && rom[i + 1] === 0x8a && rom[i + 2] === 0x21 && rom[i + 3] === 0x00) {
      return { start: i, marker: 'CALL __frameset' };
    }
  }
  for (let i = instrStart; i >= low; i -= 1) {
    if (rom[i] === 0xc9) {
      return { start: i + 1, marker: 'after RET fallback' };
    }
  }
  return { start: null, marker: 'not found' };
}

function inferWriteValue(instrStart) {
  for (let i = instrStart - 1; i >= Math.max(0, instrStart - 24); i -= 1) {
    const b = rom[i];
    if (b === 0xaf) {
      return { value: 0x00, text: '0x00 (XOR A)' };
    }
    if (b === 0x97) {
      return { value: 0x00, text: '0x00 (SUB A)' };
    }
    if (b === 0x3e && i + 1 < ROM_SIZE) {
      return { value: rom[i + 1], text: `${hexByte(rom[i + 1])} (LD A,imm)` };
    }
    if (b === 0xed && readByte(i + 1) === 0x57) {
      return { value: null, text: 'unknown (LD A,I)' };
    }
    if ([0xc9, 0xc3, 0xcd, 0x18, 0x20, 0x28, 0x30, 0x38].includes(b)) {
      break;
    }
  }
  return { value: null, text: 'unknown' };
}

function analyzeReadGate(instrStart) {
  const tokens = [];
  for (let i = instrStart + 1; i <= Math.min(instrStart + 18, ROM_SIZE - 1); i += 1) {
    const b = rom[i];
    if (b === 0xb7) {
      tokens.push('OR A');
      continue;
    }
    if (b === 0xa7) {
      tokens.push('AND A');
      continue;
    }
    const branches = {
      0x20: 'JR NZ',
      0x28: 'JR Z',
      0x30: 'JR NC',
      0x38: 'JR C',
      0xc2: 'JP NZ',
      0xca: 'JP Z',
      0xd2: 'JP NC',
      0xda: 'JP C',
      0xe2: 'JP PO',
      0xea: 'JP PE',
      0xf2: 'JP P',
      0xfa: 'JP M',
      0xc0: 'RET NZ',
      0xc8: 'RET Z',
      0xd0: 'RET NC',
      0xd8: 'RET C',
    };
    if (branches[b]) {
      tokens.push(branches[b]);
      break;
    }
  }
  return tokens.join('; ');
}

function findNearbyD140xx(instrStart) {
  const hits = new Set();
  const start = Math.max(0, instrStart - NEARBY_D140_WINDOW);
  const end = Math.min(ROM_SIZE - 3, instrStart + NEARBY_D140_WINDOW);
  for (let i = start; i <= end; i += 1) {
    if (rom[i + 1] === 0x40 && rom[i + 2] === 0xd1) {
      const addr = 0xd14000 | rom[i];
      if (addr !== TARGET_ADDR) {
        hits.add(hex(addr));
      }
    }
  }
  return [...hits].sort();
}

function findPortOps(instrStart) {
  const rawHits = [];
  const start = Math.max(0, instrStart - NEARBY_PORT_WINDOW);
  const end = Math.min(ROM_SIZE - 1, instrStart + NEARBY_PORT_WINDOW);

  for (let i = start; i <= end - 1; i += 1) {
    if (rom[i] === 0xdb) {
      rawHits.push(`IN A,(${formatPort(rom[i + 1])})`);
    }
    if (rom[i] === 0xd3) {
      rawHits.push(`OUT (${formatPort(rom[i + 1])}),A`);
    }
  }

  for (let i = start; i <= end - 4; i += 1) {
    if (rom[i] !== 0x01 || rom[i + 3] !== 0x00) {
      continue;
    }
    const port = rom[i + 1] | (rom[i + 2] << 8);
    if (port < 0x3000 || port > 0x31ff) {
      continue;
    }
    const jEnd = Math.min(end - 1, i + 16);
    for (let j = i + 4; j <= jEnd; j += 1) {
      if (rom[j] !== 0xed) {
        continue;
      }
      const op = rom[j + 1];
      if (IN_OPS[op]) {
        rawHits.push(`${IN_OPS[op]},(${formatPort(port)})`);
      }
      if (OUT_OPS[op]) {
        const reg = OUT_OPS[op].slice(4);
        rawHits.push(`OUT (${formatPort(port)}),${reg}`);
      }
    }
  }

  return [...new Set(rawHits)].sort();
}

function bankBucket(addr) {
  const bank = addr >> 16;
  if (bank === 0x00) return '0x00xxxx';
  if (bank === 0x02) return '0x02xxxx';
  if (bank === 0x04) return '0x04xxxx';
  if (bank === 0x0b) return '0x0Bxxxx';
  return 'other';
}

function formatFunction(ref) {
  if (ref.function.start === null) {
    return '-';
  }
  return `${hex(ref.function.start)} (${ref.function.marker})`;
}

function buildReferenceRecord(base) {
  const ref = {
    site: base.instrStart,
    type: base.type,
    mnemonic: base.mnemonic,
    function: findContainingFunction(base.instrStart),
    writeValue: null,
    gate: '',
    nearbyD140xx: findNearbyD140xx(base.instrStart),
    portOps: findPortOps(base.instrStart),
    context: hexDump(base.instrStart - 4, 20),
    source: base.source,
  };

  if (ref.type === 'WRITE' || ref.type === 'READ+WRITE') {
    ref.writeValue = inferWriteValue(base.instrStart);
  }
  if (ref.type === 'READ' || ref.type === 'READ+WRITE') {
    ref.gate = analyzeReadGate(base.instrStart);
  }
  return ref;
}

function groupLogicalSites(refs) {
  const groups = new Map();
  for (const ref of refs) {
    const key = JSON.stringify({
      type: ref.type,
      value: ref.writeValue ? ref.writeValue.value : null,
      gate: ref.gate,
      nearby: ref.nearbyD140xx,
      ports: ref.portOps,
    });
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(ref);
  }
  return [...groups.values()]
    .map((items) => items.sort((a, b) => a.site - b.site))
    .sort((a, b) => a[0].site - b[0].site);
}

function buildSummary(refs, groups, literalHits, indexedHits) {
  const writes = refs.filter((ref) => ref.type === 'WRITE');
  const reads = refs.filter((ref) => ref.type === 'READ');
  const addressLoads = refs.filter((ref) => ref.type === 'ADDRESS-LOAD');
  const values = writes
    .map((ref) => ref.writeValue && ref.writeValue.value)
    .filter((value) => value !== null && value !== undefined);
  const uniqueValues = [...new Set(values)].sort((a, b) => a - b);
  const boolean = uniqueValues.every((value) => value === 0 || value === 1);

  const coAccessCounts = new Map();
  for (const ref of refs) {
    for (const addr of ref.nearbyD140xx) {
      coAccessCounts.set(addr, (coAccessCounts.get(addr) || 0) + 1);
    }
  }

  const bankCounts = new Map();
  for (const ref of refs) {
    const bucket = bankBucket(ref.site);
    bankCounts.set(bucket, (bankCounts.get(bucket) || 0) + 1);
  }

  return {
    writes,
    reads,
    addressLoads,
    readWrite: refs.filter((ref) => ref.type === 'READ+WRITE'),
    unknown: refs.filter((ref) => ref.type === 'UNKNOWN'),
    uniqueValues,
    boolean,
    indexedHits,
    literalHits,
    groups,
    coAccessCounts: [...coAccessCounts.entries()].sort((a, b) => b[1] - a[1]),
    bankCounts: [...bankCounts.entries()].sort((a, b) => a[0].localeCompare(b[0])),
  };
}

function listText(items) {
  return items.length ? items.join(', ') : '-';
}

function mirrorText(group) {
  if (group.length <= 1) {
    return '-';
  }
  return group.slice(1).map((ref) => hex(ref.site)).join(', ');
}

function groupNote(group) {
  return SITE_NOTES.get(group[0].site) || '-';
}

function buildMarkdown(refs, summary) {
  const lines = [];
  const setterFamilies = summary.groups.filter((group) => group[0].type === 'WRITE' && group[0].writeValue && group[0].writeValue.value === 1);
  const handoffFamily = summary.groups.find((group) => group[0].site === 0x00c7d2);

  lines.push('# Phase 439 - D1407C USB State Trace');
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- Raw literal hits: ${summary.literalHits.length}`);
  lines.push(`- Indexed references via IX/IY base+offset: ${summary.indexedHits.length}`);
  lines.push(`- Unique memory references: ${refs.length} (${summary.writes.length} writes, ${summary.reads.length} reads, ${summary.addressLoads.length} address-loads)`);
  lines.push(`- Unique logical site families after mirror grouping: ${summary.groups.length}`);
  lines.push(`- Written values: ${summary.uniqueValues.map((value) => hexByte(value)).join(', ') || 'none'} -> ${summary.boolean ? 'boolean' : 'multi-value'}`);
  lines.push('- Safest interpretation: D1407C is the pre-D1407E half of the USB handoff. The only setters live in the bus-reset handler; the strongest clearer is the D1407E activation site.');
  lines.push('');
  lines.push('## Counts');
  lines.push('');
  lines.push('| Kind | Count |');
  lines.push('| --- | ---: |');
  lines.push(`| Writes | ${summary.writes.length} |`);
  lines.push(`| Reads | ${summary.reads.length} |`);
  lines.push(`| Address-loads | ${summary.addressLoads.length} |`);
  lines.push(`| Indexed refs | ${summary.indexedHits.length} |`);
  lines.push(`| Logical site families | ${summary.groups.length} |`);
  lines.push('');
  lines.push('## ROM Bank Distribution');
  lines.push('');
  lines.push('| Bank | Count |');
  lines.push('| --- | ---: |');
  for (const [bucket, count] of summary.bankCounts) {
    lines.push(`| ${bucket} | ${count} |`);
  }
  lines.push('');
  lines.push('## Full Reference Table');
  lines.push('');
  lines.push('| Site | Type | Function | Value / Gate | Nearby D140xx (+/-20) | Nearby Port I/O |');
  lines.push('| --- | --- | --- | --- | --- | --- |');
  for (const ref of refs) {
    const valueOrGate = ref.type === 'WRITE'
      ? ref.writeValue.text
      : ref.gate || '-';
    lines.push(`| ${hex(ref.site)} | ${ref.type} | ${formatFunction(ref)} | ${valueOrGate} | ${listText(ref.nearbyD140xx)} | ${listText(ref.portOps)} |`);
  }
  lines.push('');
  lines.push('## Logical Site Families');
  lines.push('');
  lines.push('| Lead Site | Mirrors | Type | Nearby D140xx | Nearby Port I/O | Interpretation |');
  lines.push('| --- | --- | --- | --- | --- | --- |');
  for (const group of summary.groups) {
    const lead = group[0];
    lines.push(`| ${hex(lead.site)} | ${mirrorText(group)} | ${lead.type} | ${listText(lead.nearbyD140xx)} | ${listText(lead.portOps)} | ${groupNote(group)} |`);
  }
  lines.push('');
  lines.push('## Co-access Frequency (+/-20 bytes)');
  lines.push('');
  lines.push('| D140xx byte | Count |');
  lines.push('| --- | ---: |');
  for (const [addr, count] of summary.coAccessCounts) {
    lines.push(`| ${addr} | ${count} |`);
  }
  lines.push('');
  lines.push('## Read Gates');
  lines.push('');
  lines.push('| Site | Mirrors | Gate | Note |');
  lines.push('| --- | --- | --- | --- |');
  for (const group of summary.groups.filter((items) => items[0].type === 'READ')) {
    const lead = group[0];
    lines.push(`| ${hex(lead.site)} | ${mirrorText(group)} | ${lead.gate || '-'} | ${groupNote(group)} |`);
  }
  lines.push('');
  lines.push('## Lifecycle');
  lines.push('');
  if (setterFamilies.length > 0) {
    const setterLead = setterFamilies[0][0];
    lines.push(`- Set: ${hex(setterLead.site)} and ${mirrorText(setterFamilies[0])} are the only setter sites. They write ${setterLead.writeValue.text}, also write D1407D, and immediately touch port 0x3120.`);
  }
  if (handoffFamily) {
    const handoffLead = handoffFamily[0];
    lines.push(`- Handoff clear: ${hex(handoffLead.site)} and ${mirrorText(handoffFamily)} clear D1407C exactly where D1407E is set to 1, then touch port 0x3100. This is the tightest evidence that D1407C is a pending/pre-active latch rather than a stable active-state flag.`);
  }
  lines.push('- Bulk clear: 0x00FCFF and 0x02C269 clear D1407C together with the D14078-D1407A block, then continue on to clear D1407B/D1407E/D1407F.');
  lines.push('- Worker gates: the 0x014DAB deferred-worker family reads D1407C twice. One read guards the D14038 threshold path; the second read guards the later helper-call branch before D14081 is consulted.');
  lines.push('- SOF/front-end gating: 0x0097BC/0x04917D suppress first-SOF style work when D1407C is already set. If D1407C is clear, those paths seed D1407B and zero D14038 instead.');
  lines.push('');
  lines.push('## Conclusion');
  lines.push('');
  lines.push('- D1407C is a boolean latch: only 0x00 and 0x01 are ever written.');
  lines.push('- The only setters are inside the bus-reset handler family, so `usb_reset_pending` or `usb_connect_pending` is a safer name than a generic transfer flag.');
  lines.push('- Session 438\'s D1407E co-write result still matters: D1407C is cleared at the exact point where D1407E becomes active, so it behaves like the pre-activation companion to D1407E.');

  return lines.join('\n');
}

const literalHits = scanLiteralHits();
const literalRefs = literalHits
  .map((addrPos) => ({ literalPos: addrPos, source: 'literal', ...classifyLiteralHit(addrPos) }))
  .filter((ref) => ref.type !== 'UNKNOWN');

const indexedHits = scanIndexedHits();
const combined = [...literalRefs, ...indexedHits];
const dedup = new Map();
for (const base of combined) {
  if (!dedup.has(base.instrStart)) {
    dedup.set(base.instrStart, base);
  }
}

const refs = [...dedup.values()]
  .sort((a, b) => a.instrStart - b.instrStart)
  .map((base) => buildReferenceRecord(base));

const groups = groupLogicalSites(refs);
const summary = buildSummary(refs, groups, literalHits, indexedHits);
const report = buildMarkdown(refs, summary);

console.log(report);
console.log('');
console.log(`Wrote ${REPORT_PATH}`);
fs.writeFileSync(REPORT_PATH, `${report}\n`);

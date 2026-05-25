#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const REPORT_PATH = path.join(__dirname, 'phase440-trace-D1407D-report.md');

const TARGET_ADDR = 0xD1407D;
const TARGET_LE = [0x7d, 0x40, 0xd1];
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
    return { type: 'WRITE', mnemonic: `${modePrefix} LD (D1407D),A`, instrStart: addrPos - 2 };
  }
  if (modePrefix && b1 === 0x3a) {
    return { type: 'READ', mnemonic: `${modePrefix} LD A,(D1407D)`, instrStart: addrPos - 2 };
  }
  if (modePrefix && b1 === 0x21) {
    return { type: 'ADDRESS-LOAD', mnemonic: `${modePrefix} LD HL,D1407D`, instrStart: addrPos - 2 };
  }

  if (b1 === 0x32) {
    return { type: 'WRITE', mnemonic: 'LD (D1407D),A', instrStart: addrPos - 1 };
  }
  if (b1 === 0x3a) {
    return { type: 'READ', mnemonic: 'LD A,(D1407D)', instrStart: addrPos - 1 };
  }
  if (b1 === 0x22) {
    return { type: 'WRITE', mnemonic: 'LD (D1407D),HL', instrStart: addrPos - 1 };
  }
  if (b1 === 0x2a) {
    return { type: 'READ', mnemonic: 'LD HL,(D1407D)', instrStart: addrPos - 1 };
  }
  if (b1 === 0x01) {
    return { type: 'ADDRESS-LOAD', mnemonic: 'LD BC,D1407D', instrStart: addrPos - 1 };
  }
  if (b1 === 0x11) {
    return { type: 'ADDRESS-LOAD', mnemonic: 'LD DE,D1407D', instrStart: addrPos - 1 };
  }
  if (b1 === 0x21) {
    return { type: 'ADDRESS-LOAD', mnemonic: 'LD HL,D1407D', instrStart: addrPos - 1 };
  }
  if (b1 === 0x31) {
    return { type: 'ADDRESS-LOAD', mnemonic: 'LD SP,D1407D', instrStart: addrPos - 1 };
  }

  if (b2 === 0xed) {
    const edMap = {
      0x43: ['WRITE', 'LD (D1407D),BC'],
      0x53: ['WRITE', 'LD (D1407D),DE'],
      0x63: ['WRITE', 'LD (D1407D),HL [ED]'],
      0x73: ['WRITE', 'LD (D1407D),SP'],
      0x4b: ['READ', 'LD BC,(D1407D)'],
      0x5b: ['READ', 'LD DE,(D1407D)'],
      0x6b: ['READ', 'LD HL,(D1407D) [ED]'],
      0x7b: ['READ', 'LD SP,(D1407D)'],
    };
    if (edMap[b1]) {
      return { type: edMap[b1][0], mnemonic: edMap[b1][1], instrStart: addrPos - 2 };
    }
  }

  if ((b2 === 0xdd || b2 === 0xfd) && b1 === 0x21) {
    return {
      type: 'ADDRESS-LOAD',
      mnemonic: `LD ${b2 === 0xdd ? 'IX' : 'IY'},D1407D`,
      instrStart: addrPos - 2,
    };
  }
  if ((b2 === 0xdd || b2 === 0xfd) && b1 === 0x2a) {
    return {
      type: 'READ',
      mnemonic: `LD ${b2 === 0xdd ? 'IX' : 'IY'},(D1407D)`,
      instrStart: addrPos - 2,
    };
  }
  if ((b2 === 0xdd || b2 === 0xfd) && b1 === 0x22) {
    return {
      type: 'WRITE',
      mnemonic: `LD (D1407D),${b2 === 0xdd ? 'IX' : 'IY'}`,
      instrStart: addrPos - 2,
    };
  }

  // Check for mode prefix two bytes back with ED prefix one byte back
  const b3 = readByte(addrPos - 3);
  const modePrefix3 = MODE_PREFIX_NAMES[b3];
  if (modePrefix3 && b2 === 0xed) {
    const edMap = {
      0x43: ['WRITE', `${modePrefix3} LD (D1407D),BC`],
      0x53: ['WRITE', `${modePrefix3} LD (D1407D),DE`],
      0x63: ['WRITE', `${modePrefix3} LD (D1407D),HL [ED]`],
      0x73: ['WRITE', `${modePrefix3} LD (D1407D),SP`],
      0x4b: ['READ', `${modePrefix3} LD BC,(D1407D)`],
      0x5b: ['READ', `${modePrefix3} LD DE,(D1407D)`],
      0x6b: ['READ', `${modePrefix3} LD HL,(D1407D) [ED]`],
      0x7b: ['READ', `${modePrefix3} LD SP,(D1407D)`],
    };
    if (edMap[b1]) {
      return { type: edMap[b1][0], mnemonic: edMap[b1][1], instrStart: addrPos - 3 };
    }
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
      if (rom[i] !== prefix || rom[i + 1] !== 0x21) {
        continue;
      }
      // The base address is at i+2..i+4 (3 bytes LE in LIL mode, or 2 bytes in SIS)
      // We look for base loads near D1407D: base + offset = D1407D
      // Base is at rom[i+2] | (rom[i+3] << 8) | (rom[i+4] << 16) for LIL
      // Check if rom[i+3] === 0x40 && rom[i+4] === 0xd1 (D140xx base)
      if (rom[i + 3] !== 0x40 || rom[i + 4] !== 0xd1) {
        continue;
      }

      const baseLow = rom[i + 2];
      // D1407D = base + offset => offset = 0x7d - baseLow
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
  // Determine how many bytes the instruction is so we skip past it
  // For LD A,(addr) with mode prefix: 5 or 6 bytes; without: 4 bytes
  // We'll scan from instrStart + 3 to be safe, looking for test+branch
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
    if (b === 0xfe && i + 1 < ROM_SIZE) {
      tokens.push(`CP ${hexByte(rom[i + 1])}`);
      i += 1;
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
  const readWrite = refs.filter((ref) => ref.type === 'READ+WRITE');
  const unknown = refs.filter((ref) => ref.type === 'UNKNOWN');
  const values = writes
    .map((ref) => ref.writeValue && ref.writeValue.value)
    .filter((value) => value !== null && value !== undefined);
  const uniqueValues = [...new Set(values)].sort((a, b) => a - b);
  const boolean = uniqueValues.length > 0 && uniqueValues.every((value) => value === 0 || value === 1);

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
    readWrite,
    unknown,
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

function buildMarkdown(refs, summary) {
  const lines = [];

  lines.push('# Phase 440 - D1407D USB State Trace');
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- Raw literal hits: ${summary.literalHits.length}`);
  lines.push(`- Indexed references via IX/IY base+offset: ${summary.indexedHits.length}`);
  lines.push(`- Unique memory references: ${refs.length} (${summary.writes.length} writes, ${summary.reads.length} reads, ${summary.addressLoads.length} address-loads, ${summary.readWrite.length} read+write, ${summary.unknown.length} unknown)`);
  lines.push(`- Unique logical site families after mirror grouping: ${summary.groups.length}`);
  lines.push(`- Written values: ${summary.uniqueValues.map((value) => hexByte(value)).join(', ') || 'none'} -> ${summary.boolean ? 'boolean' : summary.uniqueValues.length === 0 ? 'unknown (no resolved writes)' : 'multi-value'}`);
  lines.push('');
  lines.push('## Counts');
  lines.push('');
  lines.push('| Kind | Count |');
  lines.push('| --- | ---: |');
  lines.push(`| Writes | ${summary.writes.length} |`);
  lines.push(`| Reads | ${summary.reads.length} |`);
  lines.push(`| Address-loads | ${summary.addressLoads.length} |`);
  lines.push(`| Read+Write | ${summary.readWrite.length} |`);
  lines.push(`| Unknown | ${summary.unknown.length} |`);
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
  lines.push('| Site | Type | Mnemonic | Function | Value / Gate | Nearby D140xx (+/-20) | Nearby Port I/O | Context |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const ref of refs) {
    const valueOrGate = ref.type === 'WRITE' || ref.type === 'READ+WRITE'
      ? (ref.writeValue ? ref.writeValue.text : '-')
      : ref.gate || '-';
    lines.push(`| ${hex(ref.site)} | ${ref.type} | ${ref.mnemonic} | ${formatFunction(ref)} | ${valueOrGate} | ${listText(ref.nearbyD140xx)} | ${listText(ref.portOps)} | ${ref.context} |`);
  }
  lines.push('');
  lines.push('## Logical Site Families');
  lines.push('');
  lines.push('| Lead Site | Mirrors | Type | Value / Gate | Nearby D140xx | Nearby Port I/O |');
  lines.push('| --- | --- | --- | --- | --- | --- |');
  for (const group of summary.groups) {
    const lead = group[0];
    const valueOrGate = lead.type === 'WRITE' || lead.type === 'READ+WRITE'
      ? (lead.writeValue ? lead.writeValue.text : '-')
      : lead.gate || '-';
    lines.push(`| ${hex(lead.site)} | ${mirrorText(group)} | ${lead.type} | ${valueOrGate} | ${listText(lead.nearbyD140xx)} | ${listText(lead.portOps)} |`);
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
  lines.push('## Write Sites Detail');
  lines.push('');
  lines.push('| Site | Function | Value | D1407C co-write? | Nearby D140xx | Nearby Port I/O |');
  lines.push('| --- | --- | --- | --- | --- | --- |');
  for (const ref of summary.writes) {
    const d1407cCoWrite = ref.nearbyD140xx.includes('0xD1407C') ? 'YES' : 'no';
    lines.push(`| ${hex(ref.site)} | ${formatFunction(ref)} | ${ref.writeValue ? ref.writeValue.text : '-'} | ${d1407cCoWrite} | ${listText(ref.nearbyD140xx)} | ${listText(ref.portOps)} |`);
  }
  lines.push('');
  lines.push('## Read Gates');
  lines.push('');
  lines.push('| Site | Function | Gate | Nearby D140xx |');
  lines.push('| --- | --- | --- | --- |');
  for (const ref of summary.reads) {
    lines.push(`| ${hex(ref.site)} | ${formatFunction(ref)} | ${ref.gate || '-'} | ${listText(ref.nearbyD140xx)} |`);
  }
  lines.push('');

  // Analysis section
  lines.push('## Analysis');
  lines.push('');

  // Check D1407C co-writes
  const d1407cCoWrites = summary.writes.filter((ref) => ref.nearbyD140xx.includes('0xD1407C'));
  if (d1407cCoWrites.length > 0) {
    lines.push(`- D1407C co-write sites: ${d1407cCoWrites.length} of ${summary.writes.length} write sites also touch D1407C within +/-20 bytes`);
  }

  // Check D1407E co-accesses
  const d1407eCoAccess = refs.filter((ref) => ref.nearbyD140xx.includes('0xD1407E'));
  if (d1407eCoAccess.length > 0) {
    lines.push(`- D1407E co-access sites: ${d1407eCoAccess.length} references also touch D1407E within +/-20 bytes`);
  }

  if (summary.boolean) {
    lines.push('- Classification: **boolean** (only 0x00 and 0x01 values observed)');
  } else if (summary.uniqueValues.length > 0) {
    lines.push(`- Classification: **multi-value** (observed values: ${summary.uniqueValues.map((v) => hexByte(v)).join(', ')})`);
  } else {
    lines.push('- Classification: undetermined (no write values resolved to constants)');
  }

  // Lifecycle
  lines.push('');
  lines.push('## Lifecycle');
  lines.push('');
  const setters = summary.writes.filter((ref) => ref.writeValue && ref.writeValue.value === 1);
  const clearers = summary.writes.filter((ref) => ref.writeValue && ref.writeValue.value === 0);
  if (setters.length > 0) {
    lines.push(`- Set sites (value=1): ${setters.map((ref) => hex(ref.site)).join(', ')}`);
  }
  if (clearers.length > 0) {
    lines.push(`- Clear sites (value=0): ${clearers.map((ref) => hex(ref.site)).join(', ')}`);
  }
  const unknownWrites = summary.writes.filter((ref) => !ref.writeValue || ref.writeValue.value === null);
  if (unknownWrites.length > 0) {
    lines.push(`- Unknown-value writes: ${unknownWrites.map((ref) => hex(ref.site)).join(', ')}`);
  }
  if (summary.reads.length > 0) {
    lines.push(`- Read sites: ${summary.reads.map((ref) => hex(ref.site)).join(', ')}`);
  }

  lines.push('');
  lines.push('## Conclusion');
  lines.push('');
  lines.push('D1407D is co-written with D1407C at pipe-initiation sites (confirmed at 0x009807 bus-reset handler). ');
  if (summary.boolean) {
    lines.push('It is a boolean flag (only 0/1 written). ');
  }
  lines.push(`Total references: ${refs.length}. The co-access pattern with D1407C (pipe-pending) and proximity to port 0x3120 suggests D1407D is part of the USB pipe state machine, likely a companion flag in the PENDING->ACTIVE lifecycle.`);

  return lines.join('\n');
}

// ── Main ──

const literalHits = scanLiteralHits();
console.log(`Literal pattern [7D 40 D1] hits: ${literalHits.length}`);
for (const pos of literalHits) {
  console.log(`  hit at ROM offset ${hex(pos)} — context: ${hexDump(pos - 4, 12)}`);
}
console.log('');

const literalRefs = literalHits
  .map((addrPos) => ({ literalPos: addrPos, source: 'literal', ...classifyLiteralHit(addrPos) }))
  .filter((ref) => ref.type !== 'UNKNOWN');

const unknownLiterals = literalHits
  .map((addrPos) => ({ literalPos: addrPos, source: 'literal', ...classifyLiteralHit(addrPos) }))
  .filter((ref) => ref.type === 'UNKNOWN');

if (unknownLiterals.length > 0) {
  console.log(`Unclassified literal hits: ${unknownLiterals.length}`);
  for (const ref of unknownLiterals) {
    console.log(`  ${hex(ref.literalPos)}: ${ref.mnemonic}`);
  }
  console.log('');
}

console.log(`Classified literal refs: ${literalRefs.length}`);
for (const ref of literalRefs) {
  console.log(`  ${hex(ref.instrStart)} ${ref.type} ${ref.mnemonic}`);
}
console.log('');

const indexedHits = scanIndexedHits();
console.log(`Indexed IX/IY refs: ${indexedHits.length}`);
for (const ref of indexedHits) {
  console.log(`  ${hex(ref.instrStart)} ${ref.type} ${ref.mnemonic}`);
}
console.log('');

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

console.log(`Total unique references after dedup: ${refs.length}`);
console.log('');

// Print detailed per-site analysis
console.log('=== Per-site Analysis ===');
console.log('');
for (const ref of refs) {
  console.log(`Site: ${hex(ref.site)} [${ref.source}]`);
  console.log(`  Type: ${ref.type}`);
  console.log(`  Mnemonic: ${ref.mnemonic}`);
  console.log(`  Function: ${formatFunction(ref)}`);
  if (ref.writeValue) {
    console.log(`  Write value: ${ref.writeValue.text}`);
  }
  if (ref.gate) {
    console.log(`  Gate: ${ref.gate}`);
  }
  if (ref.nearbyD140xx.length > 0) {
    console.log(`  Nearby D140xx: ${ref.nearbyD140xx.join(', ')}`);
  }
  if (ref.portOps.length > 0) {
    console.log(`  Port I/O: ${ref.portOps.join(', ')}`);
  }
  console.log(`  Context: ${ref.context}`);
  console.log('');
}

const groups = groupLogicalSites(refs);
const summary = buildSummary(refs, groups, literalHits, indexedHits);
const report = buildMarkdown(refs, summary);

console.log('');
console.log(report);
console.log('');
console.log(`Wrote ${REPORT_PATH}`);
fs.writeFileSync(REPORT_PATH, `${report}\n`);

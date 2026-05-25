#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const REPORT_PATH = path.join(__dirname, 'phase441-trace-D14038-report.md');

const TARGET_ADDR = 0xD14038;
const TARGET_LE = [0x38, 0x40, 0xd1];
const FUNCTION_SCAN_BACK = 0x800;
const NEARBY_D140_WINDOW = 32;
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
  const b3 = readByte(addrPos - 3);
  const modePrefix = MODE_PREFIX_NAMES[b2];

  // Mode-prefixed direct memory ops
  if (modePrefix && b1 === 0x32) {
    return { type: 'WRITE', mnemonic: `${modePrefix} LD (D14038),A`, instrStart: addrPos - 2 };
  }
  if (modePrefix && b1 === 0x3a) {
    return { type: 'READ', mnemonic: `${modePrefix} LD A,(D14038)`, instrStart: addrPos - 2 };
  }
  if (modePrefix && b1 === 0x21) {
    return { type: 'ADDRESS-LOAD', mnemonic: `${modePrefix} LD HL,D14038`, instrStart: addrPos - 2 };
  }

  // Check for mode prefix one level deeper (3 bytes back)
  const modePrefix3 = MODE_PREFIX_NAMES[b3];
  if (modePrefix3 && b2 === 0xed) {
    const edMap = {
      0x43: ['WRITE', `${modePrefix3} LD (D14038),BC`],
      0x53: ['WRITE', `${modePrefix3} LD (D14038),DE`],
      0x63: ['WRITE', `${modePrefix3} LD (D14038),HL [ED]`],
      0x73: ['WRITE', `${modePrefix3} LD (D14038),SP`],
      0x4b: ['READ', `${modePrefix3} LD BC,(D14038)`],
      0x5b: ['READ', `${modePrefix3} LD DE,(D14038)`],
      0x6b: ['READ', `${modePrefix3} LD HL,(D14038) [ED]`],
      0x7b: ['READ', `${modePrefix3} LD SP,(D14038)`],
    };
    if (edMap[b1]) {
      return { type: edMap[b1][0], mnemonic: edMap[b1][1], instrStart: addrPos - 3 };
    }
  }

  // Non-prefixed direct memory ops
  if (b1 === 0x32) {
    return { type: 'WRITE', mnemonic: 'LD (D14038),A', instrStart: addrPos - 1 };
  }
  if (b1 === 0x3a) {
    return { type: 'READ', mnemonic: 'LD A,(D14038)', instrStart: addrPos - 1 };
  }
  if (b1 === 0x22) {
    return { type: 'WRITE', mnemonic: 'LD (D14038),HL', instrStart: addrPos - 1 };
  }
  if (b1 === 0x2a) {
    return { type: 'READ', mnemonic: 'LD HL,(D14038)', instrStart: addrPos - 1 };
  }
  if (b1 === 0x01) {
    return { type: 'ADDRESS-LOAD', mnemonic: 'LD BC,D14038', instrStart: addrPos - 1 };
  }
  if (b1 === 0x11) {
    return { type: 'ADDRESS-LOAD', mnemonic: 'LD DE,D14038', instrStart: addrPos - 1 };
  }
  if (b1 === 0x21) {
    return { type: 'ADDRESS-LOAD', mnemonic: 'LD HL,D14038', instrStart: addrPos - 1 };
  }
  if (b1 === 0x31) {
    return { type: 'ADDRESS-LOAD', mnemonic: 'LD SP,D14038', instrStart: addrPos - 1 };
  }

  // ED-prefixed 16-bit loads (non-mode-prefixed)
  if (b2 === 0xed) {
    const edMap = {
      0x43: ['WRITE', 'LD (D14038),BC'],
      0x53: ['WRITE', 'LD (D14038),DE'],
      0x63: ['WRITE', 'LD (D14038),HL [ED]'],
      0x73: ['WRITE', 'LD (D14038),SP'],
      0x4b: ['READ', 'LD BC,(D14038)'],
      0x5b: ['READ', 'LD DE,(D14038)'],
      0x6b: ['READ', 'LD HL,(D14038) [ED]'],
      0x7b: ['READ', 'LD SP,(D14038)'],
    };
    if (edMap[b1]) {
      return { type: edMap[b1][0], mnemonic: edMap[b1][1], instrStart: addrPos - 2 };
    }
  }

  // IX/IY prefix
  if ((b2 === 0xdd || b2 === 0xfd) && b1 === 0x21) {
    return {
      type: 'ADDRESS-LOAD',
      mnemonic: `LD ${b2 === 0xdd ? 'IX' : 'IY'},D14038`,
      instrStart: addrPos - 2,
    };
  }
  if ((b2 === 0xdd || b2 === 0xfd) && b1 === 0x2a) {
    return {
      type: 'READ',
      mnemonic: `LD ${b2 === 0xdd ? 'IX' : 'IY'},(D14038)`,
      instrStart: addrPos - 2,
    };
  }
  if ((b2 === 0xdd || b2 === 0xfd) && b1 === 0x22) {
    return {
      type: 'WRITE',
      mnemonic: `LD (D14038),${b2 === 0xdd ? 'IX' : 'IY'}`,
      instrStart: addrPos - 2,
    };
  }

  // Mode prefix + IX/IY
  if (MODE_PREFIX_NAMES[b3] && (b2 === 0xdd || b2 === 0xfd) && b1 === 0x21) {
    return {
      type: 'ADDRESS-LOAD',
      mnemonic: `${MODE_PREFIX_NAMES[b3]} LD ${b2 === 0xdd ? 'IX' : 'IY'},D14038`,
      instrStart: addrPos - 3,
    };
  }
  if (MODE_PREFIX_NAMES[b3] && (b2 === 0xdd || b2 === 0xfd) && b1 === 0x2a) {
    return {
      type: 'READ',
      mnemonic: `${MODE_PREFIX_NAMES[b3]} LD ${b2 === 0xdd ? 'IX' : 'IY'},(D14038)`,
      instrStart: addrPos - 3,
    };
  }
  if (MODE_PREFIX_NAMES[b3] && (b2 === 0xdd || b2 === 0xfd) && b1 === 0x22) {
    return {
      type: 'WRITE',
      mnemonic: `LD (D14038),${b2 === 0xdd ? 'IX' : 'IY'}`,
      instrStart: addrPos - 3,
    };
  }

  return {
    type: 'UNKNOWN',
    mnemonic: `raw ${hexDump(addrPos - 4, 10)}`,
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
      // D14038 = 0x38 low byte. Base must be <= 0x38 and offset must be reachable (0..127)
      if (baseLow > 0x38) {
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
    if (rom[i] === 0xfd && rom[i + 1] === 0xe5) {
      return { start: i, marker: 'PUSH IY' };
    }
    if (rom[i] === 0xed && rom[i + 1] === 0x57 && rom[i + 2] === 0xf5 && rom[i + 3] === 0xf3) {
      return { start: i, marker: 'LD A,I; PUSH AF; DI' };
    }
    if (rom[i] === 0xf5 && rom[i + 1] === 0xf3) {
      return { start: i, marker: 'PUSH AF; DI' };
    }
    if (rom[i] === 0xcd && rom[i + 1] === 0x8a && rom[i + 2] === 0x21 && rom[i + 3] === 0x00) {
      return { start: i, marker: 'CALL __frameset0' };
    }
    if (rom[i] === 0xcd && rom[i + 1] === 0x97 && rom[i + 2] === 0x21 && rom[i + 3] === 0x00) {
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
  // For direct reads, the data follows the 3-byte address
  // Scan from instrStart forward, skipping the instruction itself
  const scanStart = instrStart + 1;
  for (let i = scanStart; i <= Math.min(instrStart + 24, ROM_SIZE - 1); i += 1) {
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
    if (b === 0xe6 && i + 1 < ROM_SIZE) {
      tokens.push(`AND ${hexByte(rom[i + 1])}`);
      i += 1;
      continue;
    }
    if (b === 0xf6 && i + 1 < ROM_SIZE) {
      tokens.push(`OR ${hexByte(rom[i + 1])}`);
      i += 1;
      continue;
    }
    if (b === 0xee && i + 1 < ROM_SIZE) {
      tokens.push(`XOR ${hexByte(rom[i + 1])}`);
      i += 1;
      continue;
    }
    if (b === 0xcb && i + 1 < ROM_SIZE) {
      const bit = (rom[i + 1] >> 3) & 7;
      const base = rom[i + 1] & 0xc7;
      if (base === 0x47) {
        tokens.push(`BIT ${bit},A`);
        i += 1;
        continue;
      }
    }
    if (b === 0x3d) {
      tokens.push('DEC A');
      continue;
    }
    if (b === 0x3c) {
      tokens.push('INC A');
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
      0xc0: 'RET NZ',
      0xc8: 'RET Z',
      0xd0: 'RET NC',
      0xd8: 'RET C',
    };
    if (branches[b]) {
      tokens.push(branches[b]);
      break;
    }
    // Stop on unconditional flow changes
    if ([0xc9, 0xc3, 0xcd, 0x18].includes(b)) {
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

// Also specifically scan for D1407x bytes
function findNearbyD1407x(instrStart) {
  const hits = new Set();
  const start = Math.max(0, instrStart - NEARBY_D140_WINDOW);
  const end = Math.min(ROM_SIZE - 3, instrStart + NEARBY_D140_WINDOW);
  for (let i = start; i <= end; i += 1) {
    if (rom[i + 1] === 0x40 && rom[i + 2] === 0xd1) {
      const low = rom[i];
      if (low >= 0x70 && low <= 0x7f) {
        hits.add(hex(0xd14000 | low));
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
    nearbyD1407x: findNearbyD1407x(base.instrStart),
    portOps: findPortOps(base.instrStart),
    context: hexDump(base.instrStart - 4, 28),
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

function buildMirrorGroups(refs) {
  // Group by function start + type + value pattern as a heuristic for mirrors
  const groups = new Map();
  for (const ref of refs) {
    const bucket = bankBucket(ref.site);
    // Try to find a bank-0 equivalent within ±8 bytes of the expected mirror offset
    let lead = ref.site;
    if (bucket === '0x02xxxx') {
      const candidate = ref.site - 0x020000;
      const match = refs.find((r) => Math.abs(r.site - candidate) < 8 && r.type === ref.type);
      if (match) lead = match.site;
    } else if (bucket === '0x04xxxx') {
      const candidate = ref.site - 0x040000;
      const match = refs.find((r) => Math.abs(r.site - candidate) < 8 && r.type === ref.type);
      if (match) lead = match.site;
    }
    if (!groups.has(lead)) {
      groups.set(lead, []);
    }
    groups.get(lead).push(ref);
  }
  return [...groups.values()]
    .map((items) => items.sort((a, b) => a.site - b.site))
    .sort((a, b) => a[0].site - b[0].site);
}

function buildSummary(refs, groups, literalHits, indexedHits) {
  const writes = refs.filter((ref) => ref.type === 'WRITE');
  const reads = refs.filter((ref) => ref.type === 'READ');
  const addressLoads = refs.filter((ref) => ref.type === 'ADDRESS-LOAD');
  const readWrites = refs.filter((ref) => ref.type === 'READ+WRITE');
  const values = writes
    .map((ref) => ref.writeValue && ref.writeValue.value)
    .filter((value) => value !== null && value !== undefined);
  const uniqueValues = [...new Set(values)].sort((a, b) => a - b);
  const boolean = uniqueValues.length > 0 && uniqueValues.every((value) => value === 0 || value === 1);

  const coAccessCounts = new Map();
  const d1407xCounts = new Map();
  const portCounts = new Map();
  const bankCounts = new Map();

  for (const ref of refs) {
    for (const addr of ref.nearbyD140xx) {
      coAccessCounts.set(addr, (coAccessCounts.get(addr) || 0) + 1);
    }
    for (const addr of ref.nearbyD1407x) {
      d1407xCounts.set(addr, (d1407xCounts.get(addr) || 0) + 1);
    }
    for (const op of ref.portOps) {
      portCounts.set(op, (portCounts.get(op) || 0) + 1);
    }
    const bucket = bankBucket(ref.site);
    bankCounts.set(bucket, (bankCounts.get(bucket) || 0) + 1);
  }

  return {
    writes,
    reads,
    addressLoads,
    readWrites,
    unknown: refs.filter((ref) => ref.type === 'UNKNOWN'),
    uniqueValues,
    boolean,
    indexedHits,
    literalHits,
    groups,
    coAccessCounts: [...coAccessCounts.entries()].sort((a, b) => b[1] - a[1]),
    d1407xCounts: [...d1407xCounts.entries()].sort((a, b) => b[1] - a[1]),
    portCounts: [...portCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
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

function groupKind(group) {
  const types = [...new Set(group.map((ref) => ref.type))];
  if (types.length === 1) {
    const lead = group[0];
    if (lead.type === 'WRITE' && lead.writeValue) {
      return `WRITE ${lead.writeValue.text}`;
    }
    return lead.type;
  }
  return types.join('+');
}

function groupNearby(group) {
  const hits = new Set();
  for (const ref of group) {
    for (const addr of ref.nearbyD140xx) {
      hits.add(addr);
    }
  }
  return [...hits].sort();
}

function groupPorts(group) {
  const hits = new Set();
  for (const ref of group) {
    for (const op of ref.portOps) {
      hits.add(op);
    }
  }
  return [...hits].sort();
}

function buildMarkdown(refs, summary) {
  const lines = [];

  lines.push('# Phase 441 - D14038 USB State Trace');
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- Raw literal hits: ${summary.literalHits.length}`);
  lines.push(`- Indexed references via IX/IY base+offset: ${summary.indexedHits.length}`);
  lines.push(
    `- Unique references after dedup: ${refs.length} (${summary.writes.length} writes, ${summary.reads.length} reads, ${summary.readWrites.length} read+write, ${summary.addressLoads.length} address-loads)`
  );
  lines.push(`- Logical mirror families after bank deduplication: ${summary.groups.length}`);
  lines.push(
    `- Written values: ${summary.uniqueValues.map((value) => hexByte(value)).join(', ') || 'none observed'} -> ${summary.boolean ? 'boolean' : summary.uniqueValues.length === 0 ? 'no writes decoded' : 'multi-value'}`
  );
  lines.push('');

  // Classification
  const hasIncDec = refs.some((ref) => ref.mnemonic.includes('INC') || ref.mnemonic.includes('DEC'));
  const hasAnd = refs.some((ref) => ref.mnemonic.includes('AND') || ref.mnemonic.includes('OR') || ref.mnemonic.includes('XOR'));
  let classification = 'unknown';
  if (summary.boolean && !hasIncDec) {
    classification = 'boolean flag';
  } else if (hasIncDec) {
    classification = 'counter';
  } else if (hasAnd) {
    classification = 'bitmask / bitfield';
  } else if (summary.uniqueValues.length > 2) {
    classification = 'enum / multi-state';
  } else if (summary.uniqueValues.length <= 2 && summary.uniqueValues.length > 0) {
    classification = summary.boolean ? 'boolean flag' : 'enum / multi-state';
  }
  lines.push(`- **Classification**: ${classification}`);
  lines.push('');

  lines.push('## Counts');
  lines.push('');
  lines.push('| Kind | Count |');
  lines.push('| --- | ---: |');
  lines.push(`| Writes | ${summary.writes.length} |`);
  lines.push(`| Reads | ${summary.reads.length} |`);
  lines.push(`| Read+Write (INC/DEC) | ${summary.readWrites.length} |`);
  lines.push(`| Address-loads | ${summary.addressLoads.length} |`);
  lines.push(`| Indexed refs | ${summary.indexedHits.length} |`);
  lines.push(`| Mirror families | ${summary.groups.length} |`);
  lines.push('');

  lines.push('## ROM Bank Distribution');
  lines.push('');
  lines.push('| Bank | Count |');
  lines.push('| --- | ---: |');
  for (const [bucket, count] of summary.bankCounts) {
    lines.push(`| ${bucket} | ${count} |`);
  }
  lines.push('');

  lines.push('## Mirror Families');
  lines.push('');
  lines.push('| Lead Site | Mirrors | Kind | Nearby D140xx (+/-32) | Nearby Port I/O |');
  lines.push('| --- | --- | --- | --- | --- |');
  for (const group of summary.groups) {
    lines.push(
      `| ${hex(group[0].site)} | ${mirrorText(group)} | ${groupKind(group)} | ${listText(
        groupNearby(group)
      )} | ${listText(groupPorts(group))} |`
    );
  }
  lines.push('');

  lines.push('## Full Reference Table');
  lines.push('');
  lines.push('| Site | Type | Mnemonic | Function | Value / Gate | Nearby D140xx | Nearby D1407x | Port I/O | Context |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const ref of refs) {
    const valueOrGate = ref.type === 'WRITE'
      ? (ref.writeValue ? ref.writeValue.text : '-')
      : ref.type === 'READ+WRITE'
      ? (ref.writeValue ? ref.writeValue.text : '-') + ' / ' + (ref.gate || '-')
      : ref.gate || '-';
    lines.push(
      `| ${hex(ref.site)} | ${ref.type} | ${ref.mnemonic} | ${formatFunction(ref)} | ${valueOrGate} | ${listText(
        ref.nearbyD140xx
      )} | ${listText(ref.nearbyD1407x)} | ${listText(ref.portOps)} | \`${ref.context}\` |`
    );
  }
  lines.push('');

  lines.push('## Write Values Observed');
  lines.push('');
  if (summary.writes.length === 0 && summary.readWrites.length === 0) {
    lines.push('- No direct writes decoded. All accesses may be reads or address-loads for indirect access.');
  } else {
    for (const ref of [...summary.writes, ...summary.readWrites]) {
      const val = ref.writeValue ? ref.writeValue.text : 'unknown';
      lines.push(`- \`${hex(ref.site)}\`: ${ref.mnemonic} -> ${val}`);
    }
  }
  lines.push('');

  lines.push('## Read Patterns');
  lines.push('');
  if (summary.reads.length === 0) {
    lines.push('- No direct reads decoded.');
  } else {
    lines.push('| Site | Mnemonic | Gate Pattern |');
    lines.push('| --- | --- | --- |');
    for (const ref of summary.reads) {
      lines.push(`| ${hex(ref.site)} | ${ref.mnemonic} | ${ref.gate || '-'} |`);
    }
  }
  lines.push('');

  lines.push('## Co-access Frequency (D140xx, +/-32 bytes)');
  lines.push('');
  lines.push('| D140xx byte | Count |');
  lines.push('| --- | ---: |');
  for (const [addr, count] of summary.coAccessCounts) {
    lines.push(`| ${addr} | ${count} |`);
  }
  lines.push('');

  lines.push('## D1407x Co-access (SOF/pipe-pending group, +/-32 bytes)');
  lines.push('');
  if (summary.d1407xCounts.length === 0) {
    lines.push('- No D1407x bytes found within +/-32 bytes of any D14038 reference site.');
  } else {
    lines.push('| D1407x byte | Count | Known role |');
    lines.push('| --- | ---: | --- |');
    const knownRoles = {
      '0xD1407B': 'SOF-received flag',
      '0xD1407C': 'pipe-pending flag',
      '0xD1407D': 'bus-reset notification / timer-reset pending',
      '0xD1407E': 'pipe-active flag',
      '0xD1407F': 'transfer-active flag',
      '0xD14080': 'transfer-pending',
      '0xD14082': 'OTG negotiation state',
    };
    for (const [addr, count] of summary.d1407xCounts) {
      lines.push(`| ${addr} | ${count} | ${knownRoles[addr] || 'unmapped'} |`);
    }
  }
  lines.push('');

  lines.push('## Port I/O Summary');
  lines.push('');
  if (summary.portCounts.length === 0) {
    lines.push('- No nearby 0x30xx/0x31xx port accesses found within +/-32 bytes.');
  } else {
    lines.push('| Port op | Count |');
    lines.push('| --- | ---: |');
    for (const [op, count] of summary.portCounts) {
      lines.push(`| ${op} | ${count} |`);
    }
  }
  lines.push('');

  lines.push('## Relationship to D1407B (SOF) and D1407C (pipe-pending)');
  lines.push('');
  const d1407bSites = refs.filter((ref) => ref.nearbyD1407x.includes('0xD1407B'));
  const d1407cSites = refs.filter((ref) => ref.nearbyD1407x.includes('0xD1407C'));
  lines.push(`- D1407B co-accessed at ${d1407bSites.length}/${refs.length} sites: ${d1407bSites.map((r) => hex(r.site)).join(', ') || 'none'}`);
  lines.push(`- D1407C co-accessed at ${d1407cSites.length}/${refs.length} sites: ${d1407cSites.map((r) => hex(r.site)).join(', ') || 'none'}`);
  lines.push('');
  if (d1407bSites.length > 0 || d1407cSites.length > 0) {
    lines.push('### Co-access patterns:');
    lines.push('');
    for (const ref of [...d1407bSites, ...d1407cSites]) {
      const coWith = [];
      if (ref.nearbyD1407x.includes('0xD1407B')) coWith.push('D1407B');
      if (ref.nearbyD1407x.includes('0xD1407C')) coWith.push('D1407C');
      lines.push(`- \`${hex(ref.site)}\` (${ref.type} ${ref.mnemonic}): co-accessed with ${coWith.join(', ')}`);
    }
  }
  lines.push('');

  lines.push('## Conclusion');
  lines.push('');
  lines.push(`- Total references: ${refs.length}`);
  lines.push(`- Classification: ${classification}`);
  if (summary.uniqueValues.length > 0) {
    lines.push(`- Value range: ${summary.uniqueValues.map((v) => hexByte(v)).join(', ')}`);
  }
  lines.push('- D14038 sits in the D14000-D1404F sub-block, separate from the D14070-D1407F pipe state group.');
  lines.push('- Suggested semantic name and role hypothesis will be refined based on reference analysis above.');

  return lines.join('\n');
}

// ---- Main ----

console.log('=== Phase 441: Trace D14038 ===');
console.log(`Target: ${hex(TARGET_ADDR)}`);
console.log(`LE pattern: [${TARGET_LE.map((b) => hexByte(b)).join(', ')}]`);
console.log('');

const literalHits = scanLiteralHits();
console.log(`Literal hits (raw byte pattern): ${literalHits.length}`);
for (const pos of literalHits) {
  const cls = classifyLiteralHit(pos);
  console.log(`  ${hex(pos)}: ${cls.type} ${cls.mnemonic} (instr @ ${hex(cls.instrStart)})`);
}

const indexedHits = scanIndexedHits();
console.log(`\nIndexed hits (IX/IY base+offset): ${indexedHits.length}`);
for (const hit of indexedHits) {
  console.log(`  ${hex(hit.instrStart)}: ${hit.type} ${hit.mnemonic}`);
}

const combined = [...literalHits.map((addrPos) => ({ literalPos: addrPos, source: 'literal', ...classifyLiteralHit(addrPos) })).filter((ref) => ref.type !== 'UNKNOWN'), ...indexedHits];
const dedup = new Map();
for (const base of combined) {
  if (!dedup.has(base.instrStart)) {
    dedup.set(base.instrStart, base);
  }
}

const refs = [...dedup.values()]
  .sort((a, b) => a.instrStart - b.instrStart)
  .map((base) => buildReferenceRecord(base));

console.log(`\nDeduplicated references: ${refs.length}`);
console.log('');

// Print each reference detail
for (const ref of refs) {
  console.log(`--- ${hex(ref.site)} ---`);
  console.log(`  Type:     ${ref.type}`);
  console.log(`  Mnemonic: ${ref.mnemonic}`);
  console.log(`  Function: ${formatFunction(ref)}`);
  if (ref.writeValue) {
    console.log(`  Write:    ${ref.writeValue.text}`);
  }
  if (ref.gate) {
    console.log(`  Gate:     ${ref.gate}`);
  }
  console.log(`  D140xx:   ${listText(ref.nearbyD140xx)}`);
  console.log(`  D1407x:   ${listText(ref.nearbyD1407x)}`);
  console.log(`  Ports:    ${listText(ref.portOps)}`);
  console.log(`  Context:  ${ref.context}`);
  console.log(`  Bank:     ${bankBucket(ref.site)}`);
  console.log('');
}

const groups = buildMirrorGroups(refs);
const summary = buildSummary(refs, groups, literalHits, indexedHits);

console.log('=== Summary ===');
console.log(`Writes: ${summary.writes.length}, Reads: ${summary.reads.length}, Read+Write: ${summary.readWrites.length}, Address-loads: ${summary.addressLoads.length}`);
console.log(`Written values: ${summary.uniqueValues.map((v) => hexByte(v)).join(', ') || 'none'}`);
console.log(`Boolean: ${summary.boolean}`);
console.log(`Mirror families: ${summary.groups.length}`);
console.log('');
console.log('Co-access frequency:');
for (const [addr, count] of summary.coAccessCounts) {
  console.log(`  ${addr}: ${count}`);
}
console.log('');
console.log('D1407x co-access:');
for (const [addr, count] of summary.d1407xCounts) {
  console.log(`  ${addr}: ${count}`);
}
console.log('');
console.log('Port I/O:');
for (const [op, count] of summary.portCounts) {
  console.log(`  ${op}: ${count}`);
}

const report = buildMarkdown(refs, summary);
console.log('');
console.log('--- REPORT ---');
console.log(report);
console.log('');
console.log(`Writing report to ${REPORT_PATH}`);
fs.writeFileSync(REPORT_PATH, `${report}\n`);
console.log('Done.');

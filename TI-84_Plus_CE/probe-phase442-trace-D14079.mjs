#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const REPORT_PATH = path.join(__dirname, 'phase442-trace-D14079-report.md');

const TARGETS = [
  { addr: 0xD14079, name: 'D14079', le: [0x79, 0x40, 0xd1] },
  { addr: 0xD1407A, name: 'D1407A', le: [0x7a, 0x40, 0xd1] },
];

const FUNCTION_SCAN_BACK = 0x800;
const NEARBY_D140_WINDOW = 30;
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
  0x40: 'IN B', 0x48: 'IN C', 0x50: 'IN D', 0x58: 'IN E',
  0x60: 'IN H', 0x68: 'IN L', 0x70: 'IN F', 0x78: 'IN A',
};

const OUT_OPS = {
  0x41: 'OUT B', 0x49: 'OUT C', 0x51: 'OUT D', 0x59: 'OUT E',
  0x61: 'OUT H', 0x69: 'OUT L', 0x71: 'OUT F', 0x79: 'OUT A',
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
  if (index < 0 || index >= ROM_SIZE) return -1;
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

function classifyLiteralHit(addrPos, targetName) {
  const b1 = readByte(addrPos - 1);
  const b2 = readByte(addrPos - 2);
  const modePrefix = MODE_PREFIX_NAMES[b2];

  if (modePrefix && b1 === 0x32) {
    return { type: 'WRITE', mnemonic: `${modePrefix} LD (${targetName}),A`, instrStart: addrPos - 2 };
  }
  if (modePrefix && b1 === 0x3a) {
    return { type: 'READ', mnemonic: `${modePrefix} LD A,(${targetName})`, instrStart: addrPos - 2 };
  }
  if (modePrefix && b1 === 0x21) {
    return { type: 'ADDRESS-LOAD', mnemonic: `${modePrefix} LD HL,${targetName}`, instrStart: addrPos - 2 };
  }

  if (b1 === 0x32) {
    return { type: 'WRITE', mnemonic: `LD (${targetName}),A`, instrStart: addrPos - 1 };
  }
  if (b1 === 0x3a) {
    return { type: 'READ', mnemonic: `LD A,(${targetName})`, instrStart: addrPos - 1 };
  }
  if (b1 === 0x22) {
    return { type: 'WRITE', mnemonic: `LD (${targetName}),HL`, instrStart: addrPos - 1 };
  }
  if (b1 === 0x2a) {
    return { type: 'READ', mnemonic: `LD HL,(${targetName})`, instrStart: addrPos - 1 };
  }
  if (b1 === 0x01) {
    return { type: 'ADDRESS-LOAD', mnemonic: `LD BC,${targetName}`, instrStart: addrPos - 1 };
  }
  if (b1 === 0x11) {
    return { type: 'ADDRESS-LOAD', mnemonic: `LD DE,${targetName}`, instrStart: addrPos - 1 };
  }
  if (b1 === 0x21) {
    return { type: 'ADDRESS-LOAD', mnemonic: `LD HL,${targetName}`, instrStart: addrPos - 1 };
  }
  if (b1 === 0x31) {
    return { type: 'ADDRESS-LOAD', mnemonic: `LD SP,${targetName}`, instrStart: addrPos - 1 };
  }

  if (b2 === 0xed) {
    const edMap = {
      0x43: ['WRITE', `LD (${targetName}),BC`],
      0x53: ['WRITE', `LD (${targetName}),DE`],
      0x63: ['WRITE', `LD (${targetName}),HL [ED]`],
      0x73: ['WRITE', `LD (${targetName}),SP`],
      0x4b: ['READ', `LD BC,(${targetName})`],
      0x5b: ['READ', `LD DE,(${targetName})`],
      0x6b: ['READ', `LD HL,(${targetName}) [ED]`],
      0x7b: ['READ', `LD SP,(${targetName})`],
    };
    if (edMap[b1]) {
      return { type: edMap[b1][0], mnemonic: edMap[b1][1], instrStart: addrPos - 2 };
    }
  }

  if ((b2 === 0xdd || b2 === 0xfd) && b1 === 0x21) {
    return {
      type: 'ADDRESS-LOAD',
      mnemonic: `LD ${b2 === 0xdd ? 'IX' : 'IY'},${targetName}`,
      instrStart: addrPos - 2,
    };
  }
  if ((b2 === 0xdd || b2 === 0xfd) && b1 === 0x2a) {
    return {
      type: 'READ',
      mnemonic: `LD ${b2 === 0xdd ? 'IX' : 'IY'},(${targetName})`,
      instrStart: addrPos - 2,
    };
  }
  if ((b2 === 0xdd || b2 === 0xfd) && b1 === 0x22) {
    return {
      type: 'WRITE',
      mnemonic: `LD (${targetName}),${b2 === 0xdd ? 'IX' : 'IY'}`,
      instrStart: addrPos - 2,
    };
  }

  const b3 = readByte(addrPos - 3);
  if (MODE_PREFIX_NAMES[b3] && b2 === 0xed) {
    const edMap = {
      0x43: ['WRITE', `${MODE_PREFIX_NAMES[b3]} LD (${targetName}),BC`],
      0x53: ['WRITE', `${MODE_PREFIX_NAMES[b3]} LD (${targetName}),DE`],
      0x63: ['WRITE', `${MODE_PREFIX_NAMES[b3]} LD (${targetName}),HL [ED]`],
      0x73: ['WRITE', `${MODE_PREFIX_NAMES[b3]} LD (${targetName}),SP`],
      0x4b: ['READ', `${MODE_PREFIX_NAMES[b3]} LD BC,(${targetName})`],
      0x5b: ['READ', `${MODE_PREFIX_NAMES[b3]} LD DE,(${targetName})`],
      0x6b: ['READ', `${MODE_PREFIX_NAMES[b3]} LD HL,(${targetName}) [ED]`],
      0x7b: ['READ', `${MODE_PREFIX_NAMES[b3]} LD SP,(${targetName})`],
    };
    if (edMap[b1]) {
      return { type: edMap[b1][0], mnemonic: edMap[b1][1], instrStart: addrPos - 3 };
    }
  }

  if (MODE_PREFIX_NAMES[b3]) {
    if ((b2 === 0xdd || b2 === 0xfd) && b1 === 0x21) {
      return {
        type: 'ADDRESS-LOAD',
        mnemonic: `${MODE_PREFIX_NAMES[b3]} LD ${b2 === 0xdd ? 'IX' : 'IY'},${targetName}`,
        instrStart: addrPos - 3,
      };
    }
    if ((b2 === 0xdd || b2 === 0xfd) && b1 === 0x2a) {
      return {
        type: 'READ',
        mnemonic: `${MODE_PREFIX_NAMES[b3]} LD ${b2 === 0xdd ? 'IX' : 'IY'},(${targetName})`,
        instrStart: addrPos - 3,
      };
    }
    if ((b2 === 0xdd || b2 === 0xfd) && b1 === 0x22) {
      return {
        type: 'WRITE',
        mnemonic: `${MODE_PREFIX_NAMES[b3]} LD (${targetName}),${b2 === 0xdd ? 'IX' : 'IY'}`,
        instrStart: addrPos - 3,
      };
    }
    if (b1 === 0x32) {
      return { type: 'WRITE', mnemonic: `${MODE_PREFIX_NAMES[b3]} LD (${targetName}),A`, instrStart: addrPos - 2 };
    }
    if (b1 === 0x3a) {
      return { type: 'READ', mnemonic: `${MODE_PREFIX_NAMES[b3]} LD A,(${targetName})`, instrStart: addrPos - 2 };
    }
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
    0x46: 'B', 0x4e: 'C', 0x56: 'D', 0x5e: 'E',
    0x66: 'H', 0x6e: 'L', 0x7e: 'A',
  };
  if (regLoadMap[op2]) {
    return { type: 'READ', mnemonic: `LD ${regLoadMap[op2]},(${base}+${hexByte(offset)})` };
  }

  if (op2 >= 0x70 && op2 <= 0x77) {
    const regStoreMap = {
      0x70: 'B', 0x71: 'C', 0x72: 'D', 0x73: 'E',
      0x74: 'H', 0x75: 'L', 0x76: '(HL)', 0x77: 'A',
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
    0x86: 'ADD', 0x8e: 'ADC', 0x96: 'SUB', 0x9e: 'SBC',
    0xa6: 'AND', 0xae: 'XOR', 0xb6: 'OR', 0xbe: 'CP',
  };
  if (aluOps[op2]) {
    return { type: 'READ', mnemonic: `${aluOps[op2]} A,(${base}+${hexByte(offset)})` };
  }

  return null;
}

function scanLiteralHits(targetLE) {
  const hits = [];
  for (let i = 0; i <= ROM_SIZE - 3; i += 1) {
    if (rom[i] === targetLE[0] && rom[i + 1] === targetLE[1] && rom[i + 2] === targetLE[2]) {
      hits.push(i);
    }
  }
  return hits;
}

function scanIndexedHits(targetLE) {
  const refs = [];
  for (const prefix of [0xdd, 0xfd]) {
    for (let i = 0; i <= ROM_SIZE - 5; i += 1) {
      if (rom[i] !== prefix || rom[i + 1] !== 0x21) continue;
      if (rom[i + 3] !== 0x40 || rom[i + 4] !== 0xd1) continue;

      const baseLow = rom[i + 2];
      const offset = targetLE[0] - baseLow;
      if (offset < 0 || offset > 0x7f) continue;

      for (let j = i + 5; j <= Math.min(i + 200, ROM_SIZE - 4); j += 1) {
        if (rom[j] !== prefix) continue;
        const op2 = rom[j + 1];
        const disp = rom[j + 2];
        if (disp !== offset) continue;
        const classified = classifyIndexedOpcode(prefix, op2, offset);
        if (!classified) continue;
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
    if (b === 0xaf) return { value: 0x00, text: '0x00 (XOR A)' };
    if (b === 0x97) return { value: 0x00, text: '0x00 (SUB A)' };
    if (b === 0x3e && i + 1 < ROM_SIZE) {
      return { value: rom[i + 1], text: `${hexByte(rom[i + 1])} (LD A,imm)` };
    }
    if (b === 0xed && readByte(i + 1) === 0x57) {
      return { value: null, text: 'unknown (LD A,I)' };
    }
    if ([0xc9, 0xc3, 0xcd, 0x18, 0x20, 0x28, 0x30, 0x38].includes(b)) break;
  }
  return { value: null, text: 'unknown' };
}

function analyzeReadGate(instrStart) {
  const tokens = [];
  for (let i = instrStart + 1; i <= Math.min(instrStart + 18, ROM_SIZE - 1); i += 1) {
    const b = rom[i];
    if (b === 0xb7) { tokens.push('OR A'); continue; }
    if (b === 0xa7) { tokens.push('AND A'); continue; }
    if (b === 0xfe && i + 1 < ROM_SIZE) {
      tokens.push(`CP ${hexByte(rom[i + 1])}`);
      i += 1;
      continue;
    }
    const branches = {
      0x20: 'JR NZ', 0x28: 'JR Z', 0x30: 'JR NC', 0x38: 'JR C',
      0xc2: 'JP NZ', 0xca: 'JP Z', 0xd2: 'JP NC', 0xda: 'JP C',
      0xc0: 'RET NZ', 0xc8: 'RET Z', 0xd0: 'RET NC', 0xd8: 'RET C',
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
      hits.add(hex(addr));
    }
  }
  return [...hits].sort();
}

function findPortOps(instrStart) {
  const rawHits = [];
  const start = Math.max(0, instrStart - NEARBY_PORT_WINDOW);
  const end = Math.min(ROM_SIZE - 1, instrStart + NEARBY_PORT_WINDOW);

  for (let i = start; i <= end - 1; i += 1) {
    if (rom[i] === 0xdb) rawHits.push(`IN A,(${formatPort(rom[i + 1])})`);
    if (rom[i] === 0xd3) rawHits.push(`OUT (${formatPort(rom[i + 1])}),A`);
  }

  for (let i = start; i <= end - 4; i += 1) {
    if (rom[i] !== 0x01 || rom[i + 3] !== 0x00) continue;
    const port = rom[i + 1] | (rom[i + 2] << 8);
    if (port < 0x3000 || port > 0x31ff) continue;
    const jEnd = Math.min(end - 1, i + 16);
    for (let j = i + 4; j <= jEnd; j += 1) {
      if (rom[j] !== 0xed) continue;
      const op = rom[j + 1];
      if (IN_OPS[op]) rawHits.push(`${IN_OPS[op]},(${formatPort(port)})`);
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
  return `0x${bank.toString(16).toUpperCase().padStart(2, '0')}xxxx`;
}

function formatFunction(ref) {
  if (ref.function.start === null) return '-';
  return `${hex(ref.function.start)} (${ref.function.marker})`;
}

function buildReferenceRecord(base) {
  const ref = {
    site: base.instrStart,
    type: base.type,
    mnemonic: base.mnemonic,
    target: base.target,
    function: findContainingFunction(base.instrStart),
    writeValue: null,
    gate: '',
    nearbyD140xx: findNearbyD140xx(base.instrStart),
    portOps: findPortOps(base.instrStart),
    context: hexDump(base.instrStart - 4, 24),
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

function traceTarget(target) {
  const literalHits = scanLiteralHits(target.le);
  const literalRefs = literalHits
    .map((addrPos) => ({
      literalPos: addrPos,
      source: 'literal',
      target: target.name,
      ...classifyLiteralHit(addrPos, target.name),
    }))
    .filter((ref) => ref.type !== 'UNKNOWN');

  const indexedHits = scanIndexedHits(target.le);
  for (const h of indexedHits) h.target = target.name;

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

  const unknowns = literalHits
    .map((addrPos) => ({ literalPos: addrPos, ...classifyLiteralHit(addrPos, target.name) }))
    .filter((ref) => ref.type === 'UNKNOWN');

  return { target, literalHits, indexedHits, refs, unknowns };
}

function summarizeRefs(refs) {
  const writes = refs.filter((r) => r.type === 'WRITE');
  const reads = refs.filter((r) => r.type === 'READ');
  const addressLoads = refs.filter((r) => r.type === 'ADDRESS-LOAD');
  const readWrite = refs.filter((r) => r.type === 'READ+WRITE');

  const values = writes
    .map((r) => r.writeValue && r.writeValue.value)
    .filter((v) => v !== null && v !== undefined);
  const uniqueValues = [...new Set(values)].sort((a, b) => a - b);
  const boolean = uniqueValues.length > 0 && uniqueValues.every((v) => v === 0 || v === 1);

  const coAccessCounts = new Map();
  const portCounts = new Map();
  const bankCounts = new Map();

  for (const ref of refs) {
    for (const addr of ref.nearbyD140xx) {
      coAccessCounts.set(addr, (coAccessCounts.get(addr) || 0) + 1);
    }
    for (const op of ref.portOps) {
      portCounts.set(op, (portCounts.get(op) || 0) + 1);
    }
    const bucket = bankBucket(ref.site);
    bankCounts.set(bucket, (bankCounts.get(bucket) || 0) + 1);
  }

  return {
    writes, reads, addressLoads, readWrite,
    uniqueValues, boolean,
    coAccessCounts: [...coAccessCounts.entries()].sort((a, b) => b[1] - a[1]),
    portCounts: [...portCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
    bankCounts: [...bankCounts.entries()].sort((a, b) => a[0].localeCompare(b[0])),
  };
}

function buildMarkdown(trace79, trace7A) {
  const lines = [];
  const s79 = summarizeRefs(trace79.refs);
  const s7A = summarizeRefs(trace7A.refs);

  lines.push('# Phase 442 - D14079 & D1407A USB State Trace');
  lines.push('');
  lines.push('## Overview');
  lines.push('');
  lines.push('Last 2 unmapped bytes in the D14070-D1407F USB state block.');
  lines.push('Known: bulk-cleared alongside D14078 on disconnect at 0x00FD04 and 0x02C22E.');
  lines.push('');

  // D14079
  lines.push('---');
  lines.push('## D14079');
  lines.push('');
  lines.push('### Summary');
  lines.push('');
  lines.push(`- Raw literal hits: ${trace79.literalHits.length}`);
  lines.push(`- Indexed references: ${trace79.indexedHits.length}`);
  lines.push(`- Total unique references: ${trace79.refs.length} (${s79.writes.length} writes, ${s79.reads.length} reads, ${s79.addressLoads.length} address-loads, ${s79.readWrite.length} read+write)`);
  lines.push(`- Written values: ${s79.uniqueValues.map((v) => hexByte(v)).join(', ') || 'none observed'} -> ${s79.boolean ? '**boolean**' : s79.uniqueValues.length === 0 ? 'no writes decoded' : '**multi-value**'}`);
  lines.push('');
  lines.push('### ROM Bank Distribution');
  lines.push('');
  lines.push('| Bank | Count |');
  lines.push('| --- | ---: |');
  for (const [bucket, count] of s79.bankCounts) {
    lines.push(`| ${bucket} | ${count} |`);
  }
  lines.push('');
  lines.push('### Co-access Frequency (+/-30 bytes)');
  lines.push('');
  if (s79.coAccessCounts.length === 0) {
    lines.push('- No nearby D140xx co-accesses found.');
  } else {
    lines.push('| D140xx byte | Count |');
    lines.push('| --- | ---: |');
    for (const [addr, count] of s79.coAccessCounts) {
      lines.push(`| ${addr} | ${count} |`);
    }
  }
  lines.push('');
  lines.push('### Port I/O Summary');
  lines.push('');
  if (s79.portCounts.length === 0) {
    lines.push('- No nearby port accesses found.');
  } else {
    lines.push('| Port Op | Count |');
    lines.push('| --- | ---: |');
    for (const [op, count] of s79.portCounts) {
      lines.push(`| ${op} | ${count} |`);
    }
  }
  lines.push('');
  lines.push('### Full Reference Table');
  lines.push('');
  lines.push('| Site | Type | Mnemonic | Function | Value / Gate | Nearby D140xx | Context |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- |');
  for (const ref of trace79.refs) {
    const valueOrGate = ref.type === 'WRITE'
      ? (ref.writeValue ? ref.writeValue.text : 'unknown')
      : ref.gate || '-';
    lines.push(
      `| ${hex(ref.site)} | ${ref.type} | ${ref.mnemonic} | ${formatFunction(ref)} | ${valueOrGate} | ${ref.nearbyD140xx.join(', ') || '-'} | ${ref.context} |`
    );
  }
  lines.push('');

  // D1407A
  lines.push('---');
  lines.push('## D1407A');
  lines.push('');
  lines.push('### Summary');
  lines.push('');
  lines.push(`- Raw literal hits: ${trace7A.literalHits.length}`);
  lines.push(`- Indexed references: ${trace7A.indexedHits.length}`);
  lines.push(`- Total unique references: ${trace7A.refs.length} (${s7A.writes.length} writes, ${s7A.reads.length} reads, ${s7A.addressLoads.length} address-loads, ${s7A.readWrite.length} read+write)`);
  lines.push(`- Written values: ${s7A.uniqueValues.map((v) => hexByte(v)).join(', ') || 'none observed'} -> ${s7A.boolean ? '**boolean**' : s7A.uniqueValues.length === 0 ? 'no writes decoded' : '**multi-value**'}`);
  lines.push('');
  lines.push('### ROM Bank Distribution');
  lines.push('');
  lines.push('| Bank | Count |');
  lines.push('| --- | ---: |');
  for (const [bucket, count] of s7A.bankCounts) {
    lines.push(`| ${bucket} | ${count} |`);
  }
  lines.push('');
  lines.push('### Co-access Frequency (+/-30 bytes)');
  lines.push('');
  if (s7A.coAccessCounts.length === 0) {
    lines.push('- No nearby D140xx co-accesses found.');
  } else {
    lines.push('| D140xx byte | Count |');
    lines.push('| --- | ---: |');
    for (const [addr, count] of s7A.coAccessCounts) {
      lines.push(`| ${addr} | ${count} |`);
    }
  }
  lines.push('');
  lines.push('### Port I/O Summary');
  lines.push('');
  if (s7A.portCounts.length === 0) {
    lines.push('- No nearby port accesses found.');
  } else {
    lines.push('| Port Op | Count |');
    lines.push('| --- | ---: |');
    for (const [op, count] of s7A.portCounts) {
      lines.push(`| ${op} | ${count} |`);
    }
  }
  lines.push('');
  lines.push('### Full Reference Table');
  lines.push('');
  lines.push('| Site | Type | Mnemonic | Function | Value / Gate | Nearby D140xx | Context |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- |');
  for (const ref of trace7A.refs) {
    const valueOrGate = ref.type === 'WRITE'
      ? (ref.writeValue ? ref.writeValue.text : 'unknown')
      : ref.gate || '-';
    lines.push(
      `| ${hex(ref.site)} | ${ref.type} | ${ref.mnemonic} | ${formatFunction(ref)} | ${valueOrGate} | ${ref.nearbyD140xx.join(', ') || '-'} | ${ref.context} |`
    );
  }
  lines.push('');

  // Combined analysis
  lines.push('---');
  lines.push('## Combined Analysis');
  lines.push('');
  lines.push('### Shared Clear Sites');
  lines.push('');
  lines.push('Sites that clear both D14079 and D1407A (and typically D14078):');
  lines.push('');
  const sites79 = new Set(trace79.refs.filter((r) => r.type === 'WRITE').map((r) => r.site));
  const sites7A = new Set(trace7A.refs.filter((r) => r.type === 'WRITE').map((r) => r.site));
  const sharedWriteSites = [];
  // Look for sites within 30 bytes of each other
  for (const s of sites79) {
    for (const t of sites7A) {
      if (Math.abs(s - t) < 30) {
        sharedWriteSites.push({ s79: s, s7A: t });
      }
    }
  }
  if (sharedWriteSites.length > 0) {
    lines.push('| D14079 site | D1407A site | Distance |');
    lines.push('| --- | --- | --- |');
    for (const pair of sharedWriteSites) {
      lines.push(`| ${hex(pair.s79)} | ${hex(pair.s7A)} | ${Math.abs(pair.s79 - pair.s7A)} bytes |`);
    }
  } else {
    lines.push('- No paired clear sites found within 30 bytes of each other.');
  }
  lines.push('');

  lines.push('### Classification');
  lines.push('');
  lines.push(`- **D14079**: ${s79.boolean ? 'Boolean (0/1 only)' : s79.uniqueValues.length === 0 ? 'No write values decoded' : `Multi-value (${s79.uniqueValues.map((v) => hexByte(v)).join(', ')})`}`);
  lines.push(`- **D1407A**: ${s7A.boolean ? 'Boolean (0/1 only)' : s7A.uniqueValues.length === 0 ? 'No write values decoded' : `Multi-value (${s7A.uniqueValues.map((v) => hexByte(v)).join(', ')})`}`);
  lines.push('');
  lines.push('### Semantic Assessment');
  lines.push('');
  lines.push('Based on the reference patterns:');
  lines.push('');

  // Generate assessment based on data
  const d79Reads = trace79.refs.filter((r) => r.type === 'READ');
  const d7AReads = trace7A.refs.filter((r) => r.type === 'READ');
  const d79Writes = trace79.refs.filter((r) => r.type === 'WRITE');
  const d7AWrites = trace7A.refs.filter((r) => r.type === 'WRITE');

  lines.push(`- **D14079**: ${d79Writes.length} write sites, ${d79Reads.length} read sites.`);
  if (s79.boolean) {
    lines.push('  - Strict boolean behavior (only 0x00 and 0x01 written).');
  }
  const d79CoAccess = s79.coAccessCounts.slice(0, 5).map(([a]) => a).join(', ');
  if (d79CoAccess) {
    lines.push(`  - Top co-accessed bytes: ${d79CoAccess}`);
  }
  lines.push('');

  lines.push(`- **D1407A**: ${d7AWrites.length} write sites, ${d7AReads.length} read sites.`);
  if (s7A.boolean) {
    lines.push('  - Strict boolean behavior (only 0x00 and 0x01 written).');
  }
  const d7ACoAccess = s7A.coAccessCounts.slice(0, 5).map(([a]) => a).join(', ');
  if (d7ACoAccess) {
    lines.push(`  - Top co-accessed bytes: ${d7ACoAccess}`);
  }
  lines.push('');

  lines.push('### D14070-D1407F Block Now Complete');
  lines.push('');
  lines.push('| Offset | Address | Semantic Name | Refs |');
  lines.push('| --- | --- | --- | ---: |');
  lines.push('| +0 | D14070 | transfer-direction | - |');
  lines.push('| +1 | D14071 | (reserved/unused) | - |');
  lines.push('| +2 | D14072 | physical-connection flag | 19 |');
  lines.push('| +3 | D14073 | dual-banked endpoint state | 12 |');
  lines.push('| +4 | D14074 | (unused) | - |');
  lines.push('| +5 | D14075 | callback-pending flag | 6 |');
  lines.push('| +6 | D14076 | poll retry counter | 15 |');
  lines.push('| +7 | D14077 | timer-enable flag | 6 |');
  lines.push(`| +8 | D14078 | endpoint-configured / deferred-ready-pending | 11 |`);
  lines.push(`| +9 | D14079 | (this trace) | ${trace79.refs.length} |`);
  lines.push(`| +A | D1407A | (this trace) | ${trace7A.refs.length} |`);
  lines.push('| +B | D1407B | SOF-received flag | 19 |');
  lines.push('| +C | D1407C | pipe-pending flag | 17 |');
  lines.push('| +D | D1407D | bus-reset notification | 6 |');
  lines.push('| +E | D1407E | pipe-active flag | 28 |');
  lines.push('| +F | D1407F | transfer-active flag | 12 |');

  return lines.join('\n');
}

// === Main ===

console.log('Scanning ROM for D14079 and D1407A references...');
console.log(`ROM size: ${ROM_SIZE} bytes (${(ROM_SIZE / 1024 / 1024).toFixed(1)} MB)`);
console.log('');

const trace79 = traceTarget(TARGETS[0]);
const trace7A = traceTarget(TARGETS[1]);

// Print unknowns
for (const trace of [trace79, trace7A]) {
  if (trace.unknowns.length > 0) {
    console.log(`=== UNKNOWN literal hits for ${trace.target.name} (${trace.unknowns.length}) ===`);
    for (const unk of trace.unknowns) {
      console.log(`  ${hex(unk.literalPos)}: ${unk.mnemonic}`);
    }
    console.log('');
  }
}

// Print quick summary
console.log('=== D14079 ===');
console.log(`  Literal hits: ${trace79.literalHits.length}`);
console.log(`  Indexed hits: ${trace79.indexedHits.length}`);
console.log(`  Unique refs:  ${trace79.refs.length}`);
console.log(`  Writes: ${trace79.refs.filter((r) => r.type === 'WRITE').length}, Reads: ${trace79.refs.filter((r) => r.type === 'READ').length}, Addr-loads: ${trace79.refs.filter((r) => r.type === 'ADDRESS-LOAD').length}`);
console.log('');

console.log('=== D1407A ===');
console.log(`  Literal hits: ${trace7A.literalHits.length}`);
console.log(`  Indexed hits: ${trace7A.indexedHits.length}`);
console.log(`  Unique refs:  ${trace7A.refs.length}`);
console.log(`  Writes: ${trace7A.refs.filter((r) => r.type === 'WRITE').length}, Reads: ${trace7A.refs.filter((r) => r.type === 'READ').length}, Addr-loads: ${trace7A.refs.filter((r) => r.type === 'ADDRESS-LOAD').length}`);
console.log('');

const report = buildMarkdown(trace79, trace7A);
console.log(report);
console.log('');
console.log(`Wrote ${REPORT_PATH}`);
fs.writeFileSync(REPORT_PATH, `${report}\n`);

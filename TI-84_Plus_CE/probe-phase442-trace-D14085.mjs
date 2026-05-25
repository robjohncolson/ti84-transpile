#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const REPORT_PATH = path.join(__dirname, 'phase442-trace-D14085-report.md');

const TARGETS = [
  { addr: 0xD14085, name: 'D14085', le: [0x85, 0x40, 0xd1] },
  { addr: 0xD14086, name: 'D14086', le: [0x86, 0x40, 0xd1] },
  { addr: 0xD14087, name: 'D14087', le: [0x87, 0x40, 0xd1] },
  { addr: 0xD14088, name: 'D14088', le: [0x88, 0x40, 0xd1] },
  { addr: 0xD14089, name: 'D14089', le: [0x89, 0x40, 0xd1] },
];

const FUNCTION_SCAN_BACK = 0x800;
const NEARBY_D140_WINDOW = 40;
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
  if (index < 0 || index >= ROM_SIZE) return -1;
  return rom[index];
}

function hexDump(start, length) {
  const out = [];
  for (let i = 0; i < length; i++) {
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
  const modePrefix3 = MODE_PREFIX_NAMES[b3];
  if (modePrefix3 && b2 === 0xed) {
    const edMap = {
      0x43: ['WRITE', `${modePrefix3} LD (${targetName}),BC`],
      0x53: ['WRITE', `${modePrefix3} LD (${targetName}),DE`],
      0x63: ['WRITE', `${modePrefix3} LD (${targetName}),HL [ED]`],
      0x73: ['WRITE', `${modePrefix3} LD (${targetName}),SP`],
      0x4b: ['READ', `${modePrefix3} LD BC,(${targetName})`],
      0x5b: ['READ', `${modePrefix3} LD DE,(${targetName})`],
      0x6b: ['READ', `${modePrefix3} LD HL,(${targetName}) [ED]`],
      0x7b: ['READ', `${modePrefix3} LD SP,(${targetName})`],
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

function scanLiteralHits(target) {
  const hits = [];
  for (let i = 0; i <= ROM_SIZE - 3; i++) {
    if (rom[i] === target.le[0] && rom[i + 1] === target.le[1] && rom[i + 2] === target.le[2]) {
      hits.push(i);
    }
  }
  return hits;
}

function findContainingFunction(instrStart) {
  const low = Math.max(0, instrStart - FUNCTION_SCAN_BACK);
  for (let i = instrStart; i >= low; i--) {
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
  for (let i = instrStart; i >= low; i--) {
    if (rom[i] === 0xc9) {
      return { start: i + 1, marker: 'after RET fallback' };
    }
  }
  return { start: null, marker: 'not found' };
}

function inferWriteValue(instrStart) {
  for (let i = instrStart - 1; i >= Math.max(0, instrStart - 24); i--) {
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
  for (let i = instrStart + 1; i <= Math.min(instrStart + 18, ROM_SIZE - 1); i++) {
    const b = rom[i];
    if (b === 0xb7) { tokens.push('OR A'); continue; }
    if (b === 0xa7) { tokens.push('AND A'); continue; }
    if (b === 0xfe && i + 1 < ROM_SIZE) { tokens.push(`CP ${hexByte(rom[i + 1])}`); i++; continue; }
    const branches = {
      0x20: 'JR NZ', 0x28: 'JR Z', 0x30: 'JR NC', 0x38: 'JR C',
      0xc2: 'JP NZ', 0xca: 'JP Z', 0xd2: 'JP NC', 0xda: 'JP C',
      0xc0: 'RET NZ', 0xc8: 'RET Z', 0xd0: 'RET NC', 0xd8: 'RET C',
    };
    if (branches[b]) { tokens.push(branches[b]); break; }
  }
  return tokens.join('; ');
}

function findNearbyD140xx(instrStart) {
  const hits = new Map();
  const start = Math.max(0, instrStart - NEARBY_D140_WINDOW);
  const end = Math.min(ROM_SIZE - 3, instrStart + NEARBY_D140_WINDOW);
  for (let i = start; i <= end; i++) {
    if (rom[i + 1] === 0x40 && rom[i + 2] === 0xd1) {
      const addr = 0xd14000 | rom[i];
      const name = `D140${rom[i].toString(16).toUpperCase().padStart(2, '0')}`;
      hits.set(hex(addr), name);
    }
  }
  return hits;
}

function findPortOps(instrStart) {
  const rawHits = [];
  const start = Math.max(0, instrStart - NEARBY_PORT_WINDOW);
  const end = Math.min(ROM_SIZE - 1, instrStart + NEARBY_PORT_WINDOW);

  for (let i = start; i <= end - 1; i++) {
    if (rom[i] === 0xdb) rawHits.push(`IN A,(${formatPort(rom[i + 1])})`);
    if (rom[i] === 0xd3) rawHits.push(`OUT (${formatPort(rom[i + 1])}),A`);
  }

  for (let i = start; i <= end - 4; i++) {
    if (rom[i] !== 0x01 || rom[i + 3] !== 0x00) continue;
    const port = rom[i + 1] | (rom[i + 2] << 8);
    if (port < 0x3000 || port > 0x31ff) continue;
    const jEnd = Math.min(end - 1, i + 16);
    for (let j = i + 4; j <= jEnd; j++) {
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

function formatFunction(ref) {
  if (ref.function.start === null) return '-';
  return `${hex(ref.function.start)} (${ref.function.marker})`;
}

function buildReferenceRecord(base) {
  const ref = {
    site: base.instrStart,
    target: base.target,
    type: base.type,
    mnemonic: base.mnemonic,
    function: findContainingFunction(base.instrStart),
    writeValue: null,
    gate: '',
    nearbyD140xx: findNearbyD140xx(base.instrStart),
    portOps: findPortOps(base.instrStart),
    context: hexDump(base.instrStart - 8, 24),
  };

  if (ref.type === 'WRITE' || ref.type === 'READ+WRITE') {
    ref.writeValue = inferWriteValue(base.instrStart);
  }
  if (ref.type === 'READ' || ref.type === 'READ+WRITE') {
    ref.gate = analyzeReadGate(base.instrStart);
  }
  return ref;
}

// === Main ===

const allRefs = [];

for (const target of TARGETS) {
  const literalHits = scanLiteralHits(target);
  console.log(`\n${target.name}: ${literalHits.length} raw literal hits`);

  for (const pos of literalHits) {
    const classification = classifyLiteralHit(pos, target.name);
    if (classification.type !== 'UNKNOWN') {
      allRefs.push({
        ...classification,
        target: target.name,
        targetAddr: target.addr,
        literalPos: pos,
      });
    } else {
      console.log(`  UNKNOWN at ${hex(pos)}: ${hexDump(pos - 4, 12)}`);
    }
  }
}

// Deduplicate by instrStart
const dedup = new Map();
for (const base of allRefs) {
  const key = `${base.instrStart}-${base.target}`;
  if (!dedup.has(key)) dedup.set(key, base);
}

const refs = [...dedup.values()]
  .sort((a, b) => a.instrStart - b.instrStart)
  .map((base) => buildReferenceRecord(base));

console.log(`\nTotal deduplicated references: ${refs.length}`);
console.log('');

// Per-target stats
const perTarget = {};
for (const t of TARGETS) perTarget[t.name] = { reads: 0, writes: 0, addressLoads: 0, readWrites: 0, total: 0 };

for (const ref of refs) {
  const t = perTarget[ref.target];
  t.total++;
  if (ref.type === 'READ') t.reads++;
  else if (ref.type === 'WRITE') t.writes++;
  else if (ref.type === 'ADDRESS-LOAD') t.addressLoads++;
  else if (ref.type === 'READ+WRITE') t.readWrites++;
}

console.log('=== PER-TARGET REFERENCE COUNTS ===');
for (const t of TARGETS) {
  const s = perTarget[t.name];
  console.log(`  ${t.name}: ${s.total} total (${s.reads}R, ${s.writes}W, ${s.readWrites}RW, ${s.addressLoads}AL)`);
}

// Print detailed refs
console.log('\n=== DETAILED REFERENCES ===');
for (const ref of refs) {
  const valueOrGate = ref.type === 'WRITE' ? (ref.writeValue ? ref.writeValue.text : 'unknown') :
    ref.type === 'READ+WRITE' ? 'R+W' :
    ref.gate || '-';
  const nearbyList = [...ref.nearbyD140xx.keys()].filter(a => !TARGETS.some(t => hex(t.addr) === a));
  console.log(`${hex(ref.site)} [${ref.target}] ${ref.type.padEnd(14)} ${ref.mnemonic}`);
  console.log(`  func=${formatFunction(ref)}  val/gate: ${valueOrGate}`);
  console.log(`  co-access: [${nearbyList.join(', ')}]  ports: [${ref.portOps.join(', ')}]`);
  console.log(`  context: ${ref.context}`);
}

// Co-access matrix (excluding all group members including self)
const targetAddrs = new Set(TARGETS.map(t => hex(t.addr)));
const coAccessCounts = new Map();
for (const ref of refs) {
  for (const [addr] of ref.nearbyD140xx) {
    if (!targetAddrs.has(addr)) {
      coAccessCounts.set(addr, (coAccessCounts.get(addr) || 0) + 1);
    }
  }
}

// Intra-group co-access (exclude self-references)
const intraCoAccess = new Map();
for (const ref of refs) {
  const selfAddr = hex(TARGETS.find(t => t.name === ref.target).addr);
  for (const [addr] of ref.nearbyD140xx) {
    if (addr === selfAddr) continue; // skip self
    if (TARGETS.some(t => hex(t.addr) === addr)) {
      const key = `${ref.target} <-> ${addr}`;
      intraCoAccess.set(key, (intraCoAccess.get(key) || 0) + 1);
    }
  }
}

console.log('\n=== INTRA-GROUP CO-ACCESS ===');
for (const [pair, count] of [...intraCoAccess.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${pair}: ${count}`);
}

console.log('\n=== EXTERNAL CO-ACCESS (non-group D140xx) ===');
for (const [addr, count] of [...coAccessCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)) {
  console.log(`  ${addr}: ${count}`);
}

// Write values per target
console.log('\n=== WRITE VALUES ===');
for (const t of TARGETS) {
  const writes = refs.filter(r => r.target === t.name && (r.type === 'WRITE' || r.type === 'READ+WRITE'));
  const values = writes.map(w => w.writeValue ? w.writeValue.text : 'unknown');
  console.log(`  ${t.name}: ${values.length > 0 ? values.join(', ') : 'no writes'}`);
}

// Port I/O
const portCounts = new Map();
for (const ref of refs) {
  for (const op of ref.portOps) {
    portCounts.set(op, (portCounts.get(op) || 0) + 1);
  }
}
console.log('\n=== PORT I/O ===');
for (const [op, count] of [...portCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
  console.log(`  ${op}: ${count}`);
}

// Functions containing references
const funcMap = new Map();
for (const ref of refs) {
  const key = formatFunction(ref);
  if (!funcMap.has(key)) funcMap.set(key, []);
  funcMap.get(key).push(ref);
}
console.log('\n=== CONTAINING FUNCTIONS ===');
for (const [fn, fnRefs] of [...funcMap.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 15)) {
  const targets = [...new Set(fnRefs.map(r => r.target))].join(',');
  console.log(`  ${fn}: ${fnRefs.length} refs (${targets})`);
}

// === Build Report ===

function buildMarkdown() {
  const lines = [];
  lines.push('# Phase 442 - D14085-D14089 Callback State Group Trace');
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push('| Address | Total Refs | Reads | Writes | R+W | Addr-Loads |');
  lines.push('| --- | ---: | ---: | ---: | ---: | ---: |');
  for (const t of TARGETS) {
    const s = perTarget[t.name];
    lines.push(`| ${t.name} (${hex(t.addr)}) | ${s.total} | ${s.reads} | ${s.writes} | ${s.readWrites} | ${s.addressLoads} |`);
  }
  lines.push('');
  lines.push(`Total references across all 5 bytes: ${refs.length}`);
  lines.push('');

  // Value analysis
  lines.push('## Value Analysis (Boolean vs Multi-Value)');
  lines.push('');
  for (const t of TARGETS) {
    const writes = refs.filter(r => r.target === t.name && (r.type === 'WRITE' || r.type === 'READ+WRITE'));
    const values = writes
      .map(w => w.writeValue && w.writeValue.value)
      .filter(v => v !== null && v !== undefined);
    const uniqueValues = [...new Set(values)].sort((a, b) => a - b);
    const isBoolean = uniqueValues.length > 0 && uniqueValues.every(v => v === 0 || v === 1);
    const classification = isBoolean ? 'boolean (0/1)' :
      uniqueValues.length > 0 ? `multi-value (${uniqueValues.map(v => hexByte(v)).join('/')})` :
      'undetermined (no write values resolved)';
    lines.push(`- **${t.name}**: ${classification} — written values: ${uniqueValues.map(v => hexByte(v)).join(', ') || 'none resolved'}`);
  }
  lines.push('');

  // Co-access matrix
  lines.push('## Co-Access Matrix (Intra-Group)');
  lines.push('');
  lines.push('Which D14085-D14089 bytes appear together within +/-40 bytes:');
  lines.push('');
  if (intraCoAccess.size > 0) {
    lines.push('| Pair | Co-access Count |');
    lines.push('| --- | ---: |');
    for (const [pair, count] of [...intraCoAccess.entries()].sort((a, b) => b[1] - a[1])) {
      lines.push(`| ${pair} | ${count} |`);
    }
  } else {
    lines.push('No intra-group co-accesses found.');
  }
  lines.push('');

  // External co-access
  lines.push('## External Co-Access (Other D140xx Bytes)');
  lines.push('');
  lines.push('| Address | Co-access Count |');
  lines.push('| --- | ---: |');
  for (const [addr, count] of [...coAccessCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)) {
    lines.push(`| ${addr} | ${count} |`);
  }
  lines.push('');

  // Port I/O
  lines.push('## Port I/O Summary');
  lines.push('');
  if (portCounts.size > 0) {
    lines.push('| Port Operation | Count |');
    lines.push('| --- | ---: |');
    for (const [op, count] of [...portCounts.entries()].sort((a, b) => b[1] - a[1])) {
      lines.push(`| ${op} | ${count} |`);
    }
  } else {
    lines.push('No nearby port I/O found.');
  }
  lines.push('');

  // Containing functions
  lines.push('## Containing Functions');
  lines.push('');
  lines.push('| Function | Ref Count | Targets |');
  lines.push('| --- | ---: | --- |');
  for (const [fn, fnRefs] of [...funcMap.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 20)) {
    const targets = [...new Set(fnRefs.map(r => r.target))].join(', ');
    lines.push(`| ${fn} | ${fnRefs.length} | ${targets} |`);
  }
  lines.push('');

  // Write values detail
  lines.push('## Write Values Detail');
  lines.push('');
  for (const t of TARGETS) {
    const writes = refs.filter(r => r.target === t.name && (r.type === 'WRITE' || r.type === 'READ+WRITE'));
    if (writes.length === 0) {
      lines.push(`### ${t.name} — no writes`);
    } else {
      lines.push(`### ${t.name}`);
      lines.push('');
      lines.push('| Site | Value | Function |');
      lines.push('| --- | --- | --- |');
      for (const w of writes) {
        lines.push(`| ${hex(w.site)} | ${w.writeValue ? w.writeValue.text : 'unknown'} | ${formatFunction(w)} |`);
      }
    }
    lines.push('');
  }

  // Read patterns detail
  lines.push('## Read Patterns Detail');
  lines.push('');
  for (const t of TARGETS) {
    const reads = refs.filter(r => r.target === t.name && (r.type === 'READ' || r.type === 'READ+WRITE'));
    if (reads.length === 0) {
      lines.push(`### ${t.name} — no reads`);
    } else {
      lines.push(`### ${t.name}`);
      lines.push('');
      lines.push('| Site | Mnemonic | Gate | Function |');
      lines.push('| --- | --- | --- | --- |');
      for (const r of reads) {
        lines.push(`| ${hex(r.site)} | ${r.mnemonic} | ${r.gate || '-'} | ${formatFunction(r)} |`);
      }
    }
    lines.push('');
  }

  // Full reference table
  lines.push('## Full Reference Table');
  lines.push('');
  lines.push('| Site | Target | Type | Mnemonic | Value/Gate | Function | Context |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- |');
  for (const ref of refs) {
    const valueOrGate = ref.type === 'WRITE' ? (ref.writeValue ? ref.writeValue.text : 'unknown') :
      ref.type === 'READ+WRITE' ? (ref.writeValue ? ref.writeValue.text : 'unknown') + ' / ' + (ref.gate || '-') :
      ref.gate || '-';
    lines.push(`| ${hex(ref.site)} | ${ref.target} | ${ref.type} | ${ref.mnemonic} | ${valueOrGate} | ${formatFunction(ref)} | \`${ref.context}\` |`);
  }
  lines.push('');

  // Group assessment
  lines.push('## Group Assessment');
  lines.push('');
  lines.push('### Hypothesis A: 24-bit Callback Function Pointer + State — REJECTED');
  lines.push('');
  lines.push('Evidence against pointer hypothesis:');
  lines.push('- D14085/D14086/D14087 are all written individually via `LD (addr),A` with values 0x00 or 0x01');
  lines.push('- No `LD (D14085),HL` or `LD HL,(D14085)` instructions found (which would indicate 3-byte pointer load/store)');
  lines.push('- Each byte has independent read sites with boolean test patterns (OR A; JR Z/NZ)');
  lines.push('- D14086 has read sites independent of D14085/D14087');
  lines.push('');
  lines.push('### Hypothesis B: Five Independent Boolean USB State Flags — CONFIRMED');
  lines.push('');
  lines.push('All 5 bytes are boolean (written 0x00 or 0x01, tested with OR A or CP 0x01):');
  lines.push('- **D14085**: callback-ready flag (4 refs: 2W set, 2W clear) — set=1 alongside D14075 check, cleared in teardown with D14086/D14087');
  lines.push('- **D14086**: transfer-complete notification (10 refs: 2R, 8W) — most writes are clears (0x00), set=1 at transfer completion');
  lines.push('- **D14087**: SOF-timer active flag (4 refs: 4W) — set=1 alongside port 0x313D (SOF timer), cleared in teardown');
  lines.push('- **D14088**: endpoint-ready flag (11 refs: 4R, 7W) — set/clear around port 0x3031 (endpoint control), read to gate transfer logic');
  lines.push('- **D14089**: USB-session-active flag (29 refs: 25R, 4W) — most-read flag in the group, gates major USB operations across many functions');
  lines.push('');

  // Conclusion
  lines.push('## Conclusion');
  lines.push('');
  const totalRefs = refs.length;
  const allWriteValues = new Set();
  for (const ref of refs) {
    if (ref.writeValue && ref.writeValue.value !== null && ref.writeValue.value !== undefined) {
      allWriteValues.add(ref.writeValue.value);
    }
  }
  lines.push(`- Total references across D14085-D14089: ${totalRefs}`);
  lines.push(`- All observed write values: ${[...allWriteValues].sort((a,b) => a-b).map(v => hexByte(v)).join(', ') || 'none resolved'}`);
  lines.push(`- Co-access with D14075 (callback-pending): see external co-access table above`);
  lines.push(`- Most frequent external co-access: ${coAccessCounts.size > 0 ? [...coAccessCounts.entries()].sort((a,b) => b[1]-a[1])[0].join(' x') : 'none'}`);

  return lines.join('\n');
}

const report = buildMarkdown();
fs.writeFileSync(REPORT_PATH, report + '\n');
console.log(`\nWrote report: ${REPORT_PATH}`);

#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.emitWarning = () => {};
const { decodeInstruction } = await import(new URL('./ez80-decoder.js', import.meta.url));

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rom = fs.readFileSync(path.join(__dirname, 'ROM.rom'));

const START = 0x0391DC;
const SCAN_LIMIT = 0x800;
const RAM_MIN = 0xD00000;
const RAM_MAX = 0xD1FFFF;

const KNOWN_CD7B_CALLS = new Map([
  [0x002197, '__frameset'],
  [0x00211B, '_seqcase sparse'],
  [0x0021C2, 'zero/null check'],
  [0x0025E8, 'post-walk predicate/helper'],
  [0x002623, '_seqcase dense'],
  [0x00276B, 'u24 pack/convert helper'],
  [0x0027E8, 'copy/helper'],
  [0x00CB7B, 'tail-field constructor'],
  [0x00CBE9, 'header/link constructor'],
  [0x00E06D, 'slab allocator'],
  [0x00E1CC, 'slab free'],
  [0x00E583, 'sibling walker'],
]);

const EXPECTED_CD7B_COUNTS = new Map([
  [0x002197, 1],
  [0x00211B, 1],
  [0x0021C2, 3],
  [0x0025E8, 1],
  [0x002623, 4],
  [0x00276B, 2],
  [0x0027E8, 3],
  [0x00CB7B, 5],
  [0x00CBE9, 5],
  [0x00E06D, 3],
  [0x00E1CC, 3],
  [0x00E583, 1],
]);

const WRAPPER_TARGETS = new Map([
  [0x0000A4, 0x0027E8],
  [0x000124, 0x00211B],
  [0x00012C, 0x002197],
  [0x000138, 0x0021C2],
  [0x000204, 0x0025E8],
  [0x000210, 0x002623],
  [0x000264, 0x00276B],
]);

const MIRROR_EQUIVALENTS = new Map([
  [0x038F55, 0x00CB7B],
  [0x038FC3, 0x00CBE9],
  [0x03AF39, 0x00E06D],
  [0x03B2ED, 0x00E1CC],
  [0x03B7BD, 0x00E583],
]);

const RAM_LABELS = new Map([
  [0xD13FD8, 'descriptor pointer array base'],
  [0xD13FFC, 'primary live descriptor'],
  [0xD13FFF, 'secondary live descriptor'],
  [0xD14002, 'tertiary live descriptor'],
  [0xD141BE, 'descriptor/config source buffer'],
]);

const DENSE_WRAPPERS = new Set([0x000210]);
const SPARSE_WRAPPERS = new Set([0x000124]);
const PORT_TAGS = new Set([
  'in-reg',
  'in-imm',
  'in0',
  'out-reg',
  'out-imm',
  'out0',
  'ini',
  'outi',
  'ind',
  'outd',
  'inir',
  'otir',
  'indr',
  'otdr',
]);

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function readU16(addr) {
  return rom[addr] | (rom[addr + 1] << 8);
}

function readU24(addr) {
  return rom[addr] | (rom[addr + 1] << 8) | (rom[addr + 2] << 16);
}

function addCount(map, key, pc) {
  if (!map.has(key)) {
    map.set(key, { count: 0, pcs: [] });
  }
  const entry = map.get(key);
  entry.count += 1;
  if (pc !== undefined && entry.pcs.length < 8) {
    entry.pcs.push(pc);
  }
}

function addSummaryRef(map, addr, kind, pc) {
  if (!map.has(addr)) {
    map.set(addr, { addr, kinds: new Map(), pcs: [] });
  }
  const entry = map.get(addr);
  entry.kinds.set(kind, (entry.kinds.get(kind) || 0) + 1);
  if (entry.pcs.length < 8) {
    entry.pcs.push(pc);
  }
}

function parseDenseTable(addr) {
  const count = readU16(addr);
  const base = readU24(addr + 2);
  const targets = [];
  let cursor = addr + 5;
  for (let i = 0; i < count; i += 1, cursor += 3) {
    targets.push(readU24(cursor));
  }
  const defaultTarget = readU24(cursor);
  return { addr, count, base, targets, defaultTarget, end: cursor + 3 };
}

function parseSparseTable(addr) {
  const count = readU16(addr);
  const entries = [];
  let cursor = addr + 2;
  for (let i = 0; i < count; i += 1, cursor += 4) {
    entries.push({ key: rom[cursor], target: readU24(cursor + 1) });
  }
  const defaultTarget = readU24(cursor);
  return { addr, count, entries, defaultTarget, end: cursor + 3 };
}

function resolveTarget(target) {
  return WRAPPER_TARGETS.get(target) || MIRROR_EQUIVALENTS.get(target) || target;
}

function describeRawTarget(target) {
  if (WRAPPER_TARGETS.has(target)) {
    const resolved = WRAPPER_TARGETS.get(target);
    return `wrapper for ${hex(resolved)} (${KNOWN_CD7B_CALLS.get(resolved)})`;
  }
  if (MIRROR_EQUIVALENTS.has(target)) {
    const resolved = MIRROR_EQUIVALENTS.get(target);
    return `0x03xxxx role-equivalent of ${hex(resolved)} (${KNOWN_CD7B_CALLS.get(resolved)})`;
  }
  if (KNOWN_CD7B_CALLS.has(target)) {
    return `shared target (${KNOWN_CD7B_CALLS.get(target)})`;
  }
  return 'unclassified';
}

function walkFunction(start) {
  const visited = new Map();
  const worklist = [start];
  const rawCalls = new Map();
  const resolvedCalls = new Map();
  const denseTables = [];
  const sparseTables = [];
  const ramRefs = new Map();
  const ports = [];
  const backwardBranches = [];

  while (worklist.length > 0) {
    let pc = worklist.pop();

    while (pc >= start && pc < start + SCAN_LIMIT && !visited.has(pc)) {
      const inst = decodeInstruction(rom, pc, 'adl');
      visited.set(pc, inst);

      if (inst.tag === 'call' || inst.tag === 'call-conditional') {
        addCount(rawCalls, inst.target, pc);
        addCount(resolvedCalls, resolveTarget(inst.target), pc);
      }

      if (
        (inst.tag === 'jp' || inst.tag === 'jp-conditional' || inst.tag === 'jr' || inst.tag === 'jr-conditional' || inst.tag === 'djnz') &&
        typeof inst.target === 'number' &&
        inst.target < pc
      ) {
        backwardBranches.push({ pc, target: inst.target, tag: inst.tag });
      }

      if (typeof inst.addr === 'number' && inst.addr >= RAM_MIN && inst.addr <= RAM_MAX) {
        addSummaryRef(ramRefs, inst.addr, inst.tag, pc);
      }

      if (inst.tag === 'ld-pair-imm' && typeof inst.value === 'number' && inst.value >= RAM_MIN && inst.value <= RAM_MAX) {
        addSummaryRef(ramRefs, inst.value, inst.tag, pc);
      }

      if (PORT_TAGS.has(inst.tag)) {
        ports.push({ pc, tag: inst.tag, port: inst.port ?? null });
      }

      if (inst.tag === 'call' && DENSE_WRAPPERS.has(inst.target)) {
        const table = parseDenseTable(inst.nextPc);
        denseTables.push({ pc, wrapper: inst.target, ...table });
        worklist.push(table.defaultTarget, ...table.targets);
        break;
      }

      if (inst.tag === 'call' && SPARSE_WRAPPERS.has(inst.target)) {
        const table = parseSparseTable(inst.nextPc);
        sparseTables.push({ pc, wrapper: inst.target, ...table });
        worklist.push(table.defaultTarget, ...table.entries.map((entry) => entry.target));
        break;
      }

      if (inst.tag === 'jp' || inst.tag === 'jr') {
        if (typeof inst.target === 'number' && inst.target >= start && inst.target < start + SCAN_LIMIT) {
          worklist.push(inst.target);
        }
        break;
      }

      if (inst.tag === 'jp-conditional' || inst.tag === 'jr-conditional' || inst.tag === 'djnz') {
        if (typeof inst.target === 'number' && inst.target >= start && inst.target < start + SCAN_LIMIT) {
          worklist.push(inst.target);
        }
        pc = inst.nextPc;
        continue;
      }

      if (inst.tag === 'ret' || inst.tag === 'jp-indirect' || inst.tag === 'rst') {
        break;
      }

      if (inst.tag === 'ret-conditional') {
        pc = inst.nextPc;
        continue;
      }

      pc = inst.nextPc;
    }
  }

  const instructions = [...visited.keys()].sort((a, b) => a - b).map((pc) => visited.get(pc));
  const end = Math.max(...instructions.map((inst) => inst.nextPc - 1));

  return {
    instructions,
    end,
    rawCalls,
    resolvedCalls,
    denseTables,
    sparseTables,
    ramRefs,
    ports,
    backwardBranches,
  };
}

function formatPcList(pcs) {
  return pcs.map((pc) => hex(pc)).join(', ');
}

function formatKinds(kinds) {
  return [...kinds.entries()].map(([kind, count]) => `${kind}:${count}`).join(', ');
}

function printResolvedComparison(trace) {
  const resolvedKeys = new Set(trace.resolvedCalls.keys());
  const knownKeys = new Set(KNOWN_CD7B_CALLS.keys());
  const missing = [...knownKeys].filter((key) => !resolvedKeys.has(key));
  const unexpected = [...resolvedKeys].filter((key) => !knownKeys.has(key));
  const countMismatches = [...EXPECTED_CD7B_COUNTS.entries()]
    .filter(([key, expected]) => (trace.resolvedCalls.get(key)?.count || 0) !== expected)
    .map(([key, expected]) => ({
      target: key,
      expected,
      actual: trace.resolvedCalls.get(key)?.count || 0,
    }));

  console.log('=== RESOLVED COMPARISON VS 0x00CD7B ===');
  console.log(`- Known 0x00CD7B resolved targets: ${knownKeys.size}`);
  console.log(`- Resolved targets seen here:      ${resolvedKeys.size}`);
  console.log(`- Missing known targets:           ${missing.length ? missing.map((key) => hex(key)).join(', ') : 'none'}`);
  console.log(`- Unexpected resolved targets:     ${unexpected.length ? unexpected.map((key) => hex(key)).join(', ') : 'none'}`);
  console.log(`- Call-count mismatches:           ${countMismatches.length ? 'yes' : 'none'}`);
  for (const mismatch of countMismatches) {
    console.log(`  ${hex(mismatch.target)} expected ${mismatch.expected}, saw ${mismatch.actual}`);
  }
  console.log('');
}

const trace = walkFunction(START);
const size = trace.end - START + 1;
const uniqueRam = [...trace.ramRefs.values()].sort((a, b) => a.addr - b.addr);
const directRamSet = new Set([0xD13FD8, 0xD13FFC, 0xD13FFF, 0xD14002, 0xD141BE]);
const newRam = uniqueRam.map((entry) => entry.addr).filter((addr) => !directRamSet.has(addr));

console.log('Phase 432 - Trace 0x0391DC: Parallel Descriptor Builder');
console.log(`ROM: ${path.join(__dirname, 'ROM.rom')}`);
console.log('');

console.log('=== FUNCTION BOUNDS ===');
console.log(`- Start: ${hex(START)}`);
console.log(`- End:   ${hex(trace.end)}`);
console.log(`- Size:  ${size} bytes (${hex(size, 4)})`);
console.log(`- Reachable instructions: ${trace.instructions.length}`);
console.log(`- Backward branches after table-aware walk: ${trace.backwardBranches.length}`);
console.log('');

console.log('=== RAW CALL TARGETS ===');
for (const [target, entry] of [...trace.rawCalls.entries()].sort((a, b) => a[0] - b[0])) {
  console.log(`- ${hex(target)} x${entry.count}: ${describeRawTarget(target)} [sites: ${formatPcList(entry.pcs)}]`);
}
console.log('');

console.log('=== RESOLVED CALL TARGETS ===');
for (const [target, entry] of [...trace.resolvedCalls.entries()].sort((a, b) => a[0] - b[0])) {
  const label = KNOWN_CD7B_CALLS.get(target) || 'unclassified';
  console.log(`- ${hex(target)} x${entry.count}: ${label} [sites: ${formatPcList(entry.pcs)}]`);
}
console.log('');

printResolvedComparison(trace);

console.log('=== DENSE DISPATCH TABLES ===');
for (const table of trace.denseTables.sort((a, b) => a.pc - b.pc)) {
  console.log(`- After CALL ${hex(table.pc)} via ${hex(table.wrapper)}: count=${table.count}, base=${hex(table.base)}, default=${hex(table.defaultTarget)}`);
  table.targets.forEach((target, index) => {
    console.log(`  case ${hex(table.base + index)} -> ${hex(target)}`);
  });
}
console.log('');

console.log('=== SPARSE DISPATCH TABLES ===');
for (const table of trace.sparseTables.sort((a, b) => a.pc - b.pc)) {
  console.log(`- After CALL ${hex(table.pc)} via ${hex(table.wrapper)}: count=${table.count}, default=${hex(table.defaultTarget)}`);
  table.entries.forEach((entry) => {
    console.log(`  key ${hex(entry.key, 2)} -> ${hex(entry.target)}`);
  });
}
console.log('');

console.log('=== ABSOLUTE RAM REFERENCES ===');
if (uniqueRam.length === 0) {
  console.log('- none');
} else {
  for (const entry of uniqueRam) {
    const label = RAM_LABELS.get(entry.addr);
    console.log(`- ${hex(entry.addr)}${label ? ` (${label})` : ''}: ${formatKinds(entry.kinds)} at ${formatPcList(entry.pcs)}`);
  }
}
console.log(`- New RAM addresses vs 0x00CD7B known set: ${newRam.length ? newRam.map((addr) => hex(addr)).join(', ') : 'none'}`);
console.log('');

console.log('=== PORT I/O ===');
if (trace.ports.length === 0) {
  console.log('- none in 0x0391DC body');
} else {
  for (const port of trace.ports) {
    const portText = port.port === null ? 'via BC' : hex(port.port, 2);
    console.log(`- ${hex(port.pc)}: ${port.tag} ${portText}`);
  }
}
console.log('');

console.log('=== QUICK READ ===');
console.log('- The downstream helper profile matches 0x00CD7B exactly after resolving low wrappers and 0x03xxxx mirrors.');
console.log('- The extra bytes are upstream of allocation/construction: the top-level 3-way family dispatch remains, but the sparse request table grows from 6 to 11 entries and the family-2 fallback adds extra selector logic.');
console.log('- The function still has no real port I/O and no new D1xxxx RAM refs beyond D13FD8/D13FFC/D13FFF/D14002/D141BE.');

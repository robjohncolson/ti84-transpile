#!/usr/bin/env node

import { readFileSync } from 'fs';

import { decodeInstruction } from './ez80-decoder.js';

const rom = readFileSync(new URL('./ROM.rom', import.meta.url));

const TARGET = 0x0620C4;
const WINDOW_START = 0x062080;
const WINDOW_END = 0x0620D0;
const CLUSTER_START = 0x062000;
const CLUSTER_END = 0x062100;

const EXACT_PATTERNS = [
  { label: 'CALL 0x0620C4', bytes: [0xCD, 0xC4, 0x20, 0x06] },
  { label: 'JP 0x0620C4', bytes: [0xC3, 0xC4, 0x20, 0x06] },
  { label: 'JP Z,0x0620C4', bytes: [0xCA, 0xC4, 0x20, 0x06] },
  { label: 'JP NZ,0x0620C4', bytes: [0xC2, 0xC4, 0x20, 0x06] },
  { label: 'JP C,0x0620C4', bytes: [0xDA, 0xC4, 0x20, 0x06] },
  { label: 'JP NC,0x0620C4', bytes: [0xD2, 0xC4, 0x20, 0x06] },
];

const DIRECT24 = new Map([
  [0xCD, { mnemonic: 'CALL', transferType: 'call' }],
  [0xC4, { mnemonic: 'CALL NZ', transferType: 'call', condition: 'nz' }],
  [0xCC, { mnemonic: 'CALL Z', transferType: 'call', condition: 'z' }],
  [0xD4, { mnemonic: 'CALL NC', transferType: 'call', condition: 'nc' }],
  [0xDC, { mnemonic: 'CALL C', transferType: 'call', condition: 'c' }],
  [0xE4, { mnemonic: 'CALL PO', transferType: 'call', condition: 'po' }],
  [0xEC, { mnemonic: 'CALL PE', transferType: 'call', condition: 'pe' }],
  [0xF4, { mnemonic: 'CALL P', transferType: 'call', condition: 'p' }],
  [0xFC, { mnemonic: 'CALL M', transferType: 'call', condition: 'm' }],
  [0xC3, { mnemonic: 'JP', transferType: 'jp' }],
  [0xC2, { mnemonic: 'JP NZ', transferType: 'jp', condition: 'nz' }],
  [0xCA, { mnemonic: 'JP Z', transferType: 'jp', condition: 'z' }],
  [0xD2, { mnemonic: 'JP NC', transferType: 'jp', condition: 'nc' }],
  [0xDA, { mnemonic: 'JP C', transferType: 'jp', condition: 'c' }],
  [0xE2, { mnemonic: 'JP PO', transferType: 'jp', condition: 'po' }],
  [0xEA, { mnemonic: 'JP PE', transferType: 'jp', condition: 'pe' }],
  [0xF2, { mnemonic: 'JP P', transferType: 'jp', condition: 'p' }],
  [0xFA, { mnemonic: 'JP M', transferType: 'jp', condition: 'm' }],
]);

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex(value & 0xFF, 2);
}

function bytesAt(start, length) {
  const safeStart = Math.max(0, start);
  const safeEnd = Math.min(rom.length, safeStart + Math.max(0, length));
  return Array.from(rom.slice(safeStart, safeEnd), (byte) =>
    byte.toString(16).toUpperCase().padStart(2, '0')
  ).join(' ');
}

function resolveMemAddr(inst) {
  if (!Number.isInteger(inst?.addr)) return null;
  if (inst.modePrefix === 'sis' || inst.modePrefix === 'lis') {
    return ((0x00 << 16) | (inst.addr & 0xFFFF)) >>> 0;
  }
  return inst.addr >>> 0;
}

function formatInstruction(inst) {
  if (!inst) return 'decode-error';

  const prefix = inst.modePrefix ? `${String(inst.modePrefix).toUpperCase()} ` : '';
  const disp = (value) => (value >= 0 ? `+${value}` : `${value}`);

  switch (inst.tag) {
    case 'call':
      return `${prefix}CALL ${hex(inst.target)}`;
    case 'call-conditional':
      return `${prefix}CALL ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jp':
      return `${prefix}JP ${hex(inst.target)}`;
    case 'jp-conditional':
      return `${prefix}JP ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jp-indirect':
      return `${prefix}JP (${String(inst.indirectRegister).toUpperCase()})`;
    case 'jr':
      return `${prefix}JR ${hex(inst.target)}`;
    case 'jr-conditional':
      return `${prefix}JR ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'ret':
      return `${prefix}RET`;
    case 'ret-conditional':
      return `${prefix}RET ${String(inst.condition).toUpperCase()}`;
    case 'push':
      return `${prefix}PUSH ${String(inst.pair).toUpperCase()}`;
    case 'pop':
      return `${prefix}POP ${String(inst.pair).toUpperCase()}`;
    case 'ld-pair-imm':
      return `${prefix}LD ${String(inst.pair).toUpperCase()}, ${hex(inst.value)}`;
    case 'ld-pair-mem':
      return `${prefix}LD ${String(inst.pair).toUpperCase()}, (${hex(resolveMemAddr(inst))})`;
    case 'ld-reg-imm':
      return `${prefix}LD ${String(inst.dest).toUpperCase()}, ${hexByte(inst.value)}`;
    case 'ld-reg-reg':
      return `${prefix}LD ${String(inst.dest).toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    case 'ld-reg-mem':
      return `${prefix}LD ${String(inst.dest).toUpperCase()}, (${hex(resolveMemAddr(inst))})`;
    case 'ld-mem-reg':
      return `${prefix}LD (${hex(resolveMemAddr(inst))}), ${String(inst.src).toUpperCase()}`;
    case 'indexed-cb-bit':
      return `${prefix}BIT ${inst.bit}, (${String(inst.indexRegister).toUpperCase()}${disp(inst.displacement)})`;
    case 'indexed-cb-res':
      return `${prefix}RES ${inst.bit}, (${String(inst.indexRegister).toUpperCase()}${disp(inst.displacement)})`;
    case 'indexed-cb-set':
      return `${prefix}SET ${inst.bit}, (${String(inst.indexRegister).toUpperCase()}${disp(inst.displacement)})`;
    case 'alu-imm':
      return `${prefix}${String(inst.op).toUpperCase()} ${hexByte(inst.value)}`;
    case 'alu-reg':
      return `${prefix}${String(inst.op).toUpperCase()} ${String(inst.src).toUpperCase()}`;
    case 'rrca':
      return `${prefix}RRCA`;
    case 'inc-pair':
      return `${prefix}INC ${String(inst.pair).toUpperCase()}`;
    default:
      return `${prefix}${inst.tag}`;
  }
}

function decodeSafe(pc) {
  try {
    return decodeInstruction(rom, pc, 'adl');
  } catch (error) {
    return {
      pc,
      length: 1,
      tag: 'decode-error',
      errorMessage: error?.message ?? String(error),
    };
  }
}

function reachesLinear(start, target, limit = 0x240) {
  if (start === target) return true;
  let pc = start;
  const cap = Math.min(rom.length, start + limit);

  while (pc < target && pc < cap) {
    const inst = decodeSafe(pc);
    if (inst.tag === 'decode-error') return false;
    pc += Math.max(1, inst.length ?? 1);
  }

  return pc === target;
}

function inferBoundary(target, tags, lookback = 0x140) {
  const floor = Math.max(0, target - lookback);

  for (let pc = target - 1; pc >= floor; pc -= 1) {
    const inst = decodeSafe(pc);
    if (!tags.has(inst.tag)) continue;
    const next = pc + Math.max(1, inst.length ?? 1);
    if (next > target) continue;
    if (!reachesLinear(next, target)) continue;
    return {
      entry: next,
      boundaryPc: pc,
      boundaryInst: inst,
    };
  }

  return null;
}

function scanExactPattern(pattern) {
  const hits = [];

  for (let pc = 0; pc <= rom.length - pattern.bytes.length; pc += 1) {
    let matched = true;
    for (let index = 0; index < pattern.bytes.length; index += 1) {
      if (rom[pc + index] !== pattern.bytes[index]) {
        matched = false;
        break;
      }
    }
    if (!matched) continue;

    hits.push({
      pc,
      bytes: bytesAt(pc, pattern.bytes.length),
      decoded: formatInstruction(decodeSafe(pc)),
    });
  }

  return hits;
}

function scanDirectTransfersTo(target) {
  const lo = target & 0xFF;
  const mid = (target >>> 8) & 0xFF;
  const hi = (target >>> 16) & 0xFF;
  const hits = [];

  for (let pc = 0; pc <= rom.length - 4; pc += 1) {
    const meta = DIRECT24.get(rom[pc]);
    if (!meta) continue;
    if (rom[pc + 1] !== lo || rom[pc + 2] !== mid || rom[pc + 3] !== hi) continue;

    hits.push({
      pc,
      target,
      mnemonic: meta.mnemonic,
      bytes: bytesAt(pc, 4),
      decoded: formatInstruction(decodeSafe(pc)),
    });
  }

  return hits;
}

function scanRawAddressTriples(target) {
  const lo = target & 0xFF;
  const mid = (target >>> 8) & 0xFF;
  const hi = (target >>> 16) & 0xFF;
  const hits = [];

  for (let pc = 0; pc <= rom.length - 3; pc += 1) {
    if (rom[pc] !== lo || rom[pc + 1] !== mid || rom[pc + 2] !== hi) continue;
    hits.push({
      pc,
      bytes: bytesAt(pc, 3),
      prev: pc > 0 ? hexByte(rom[pc - 1]) : '(start)',
    });
  }

  return hits;
}

function scanDirectTransfersInRange(start, end) {
  const hits = [];

  for (let pc = 0; pc <= rom.length - 4; pc += 1) {
    const meta = DIRECT24.get(rom[pc]);
    if (!meta) continue;
    const target = rom[pc + 1] | (rom[pc + 2] << 8) | (rom[pc + 3] << 16);
    if (target < start || target >= end) continue;

    hits.push({
      pc,
      target,
      mnemonic: meta.mnemonic,
      bytes: bytesAt(pc, 4),
      decoded: formatInstruction(decodeSafe(pc)),
      external: pc < start || pc >= end,
    });
  }

  return hits;
}

function renderDisasm(start, end, markers = new Map()) {
  const rows = [];
  let pc = start;

  while (pc < end) {
    const inst = decodeSafe(pc);
    const length = Math.max(1, inst.length ?? 1);
    const mark = markers.get(pc) ?? '  ';
    const bytes = bytesAt(pc, length).padEnd(20, ' ');
    const text = inst.tag === 'decode-error'
      ? `decode-error: ${inst.errorMessage}`
      : formatInstruction(inst);
    rows.push(`${mark} ${hex(pc)}  ${bytes} ${text}`);
    pc += length;
  }

  return rows;
}

function printHitList(title, hits) {
  console.log(title);
  if (hits.length === 0) {
    console.log('  (none)');
    return;
  }

  for (const hit of hits) {
    console.log(`  ${hex(hit.pc)}  ${hit.bytes}  ${hit.decoded}`);
  }
}

function printGroupedRangeHits(title, hits) {
  console.log(title);
  if (hits.length === 0) {
    console.log('  (none)');
    return;
  }

  const byTarget = new Map();
  for (const hit of hits) {
    if (!byTarget.has(hit.target)) byTarget.set(hit.target, []);
    byTarget.get(hit.target).push(hit);
  }

  for (const target of [...byTarget.keys()].sort((a, b) => a - b)) {
    const group = byTarget.get(target);
    console.log(`  ${hex(target)} (${group.length} hit${group.length === 1 ? '' : 's'})`);
    for (const hit of group) {
      const scope = hit.external ? 'external' : 'internal';
      console.log(`    ${hex(hit.pc)}  ${hit.bytes}  ${hit.decoded}  [${scope}]`);
    }
  }
}

const exactHits = EXACT_PATTERNS.map((pattern) => ({
  pattern,
  hits: scanExactPattern(pattern),
}));

const nearestBlock = inferBoundary(TARGET, new Set(['ret', 'jp', 'jp-indirect']));
const retDelimitedRoutine = inferBoundary(TARGET, new Set(['ret']));
const callerTargets = [];

if (nearestBlock) callerTargets.push({ label: 'Nearest block entry', ...nearestBlock });
if (retDelimitedRoutine && (!nearestBlock || retDelimitedRoutine.entry !== nearestBlock.entry)) {
  callerTargets.push({ label: 'Wider RET-delimited routine', ...retDelimitedRoutine });
}

const clusterHits = scanDirectTransfersInRange(CLUSTER_START, CLUSTER_END);
const clusterExternalHits = clusterHits.filter((hit) => hit.external);
const markers = new Map([
  [TARGET, '>>'],
]);

if (nearestBlock) markers.set(nearestBlock.entry, markers.has(nearestBlock.entry) ? '>>' : 'BB');
if (retDelimitedRoutine) {
  markers.set(
    retDelimitedRoutine.entry,
    retDelimitedRoutine.entry === TARGET ? '>>' : (markers.has(retDelimitedRoutine.entry) ? 'BB' : 'FN')
  );
}

console.log(`ROM loaded: ${rom.length} bytes (${hex(rom.length, 7)})`);
console.log(`Target bridge site: ${hex(TARGET)}  ${bytesAt(TARGET, 4)}  ${formatInstruction(decodeSafe(TARGET))}`);

console.log('\n=== Section 1: Exact CALL/JP patterns to 0x0620C4 ===');
for (const { pattern, hits } of exactHits) {
  printHitList(`\n${pattern.label} (${hits.length})`, hits);
}

console.log('\n=== Section 2: Parent boundary inference ===');
if (!nearestBlock) {
  console.log('Nearest block entry: (not found)');
} else {
  console.log(`Nearest block entry: ${hex(nearestBlock.entry)}`);
  console.log(`  boundary @ ${hex(nearestBlock.boundaryPc)}  ${bytesAt(nearestBlock.boundaryPc, nearestBlock.boundaryInst.length)}  ${formatInstruction(nearestBlock.boundaryInst)}`);
}

if (!retDelimitedRoutine) {
  console.log('Wider RET-delimited routine: (not found)');
} else {
  console.log(`Wider RET-delimited routine: ${hex(retDelimitedRoutine.entry)}`);
  console.log(`  boundary @ ${hex(retDelimitedRoutine.boundaryPc)}  ${bytesAt(retDelimitedRoutine.boundaryPc, retDelimitedRoutine.boundaryInst.length)}  ${formatInstruction(retDelimitedRoutine.boundaryInst)}`);
}

console.log('\n=== Section 3: Direct callers of inferred parent entries ===');
if (callerTargets.length === 0) {
  console.log('(no candidate entries inferred)');
} else {
  for (const candidate of callerTargets) {
    const directHits = scanDirectTransfersTo(candidate.entry);
    const rawRefs = scanRawAddressTriples(candidate.entry);
    console.log(`\n${candidate.label}: ${hex(candidate.entry)}`);
    printHitList('  Direct CALL/JP callers', directHits);
    if (directHits.length === 0) {
      if (rawRefs.length === 0) {
        console.log('  Raw 24-bit address bytes: (none)');
      } else {
        console.log(`  Raw 24-bit address bytes (${rawRefs.length})`);
        for (const ref of rawRefs) {
          console.log(`    ${hex(ref.pc)}  ${ref.bytes}  prev=${ref.prev}`);
        }
      }
    }
  }
}

console.log('\n=== Section 4: Local disassembly context 0x062080..0x0620D0 ===');
console.log('Legend: >> target bridge, BB nearest block entry, FN wider RET-delimited routine');
for (const row of renderDisasm(WINDOW_START, WINDOW_END, markers)) {
  console.log(row);
}

console.log('\n=== Section 5: All direct transfers into 0x0620xx cluster ===');
printGroupedRangeHits('External callers into 0x062000..0x0620FF', clusterExternalHits);

console.log('\n=== Summary ===');
const exactHitCount = exactHits.reduce((sum, entry) => sum + entry.hits.length, 0);
console.log(`Exact direct CALL/JP hits to ${hex(TARGET)}: ${exactHitCount}`);
if (nearestBlock) console.log(`Nearest block entry candidate: ${hex(nearestBlock.entry)}`);
if (retDelimitedRoutine) console.log(`Wider RET-delimited routine candidate: ${hex(retDelimitedRoutine.entry)}`);
console.log(`External transfers into 0x0620xx cluster: ${clusterExternalHits.length}`);

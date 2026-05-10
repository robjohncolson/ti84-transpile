#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');

const MATRIX_MIN = 0xE00810;
const MATRIX_MAX = 0xE00817;
const CONTROLLER_MIN = 0xE00800;
const CONTROLLER_MAX = 0xE0093F;
const SCAN_RESULT_ADDR = 0xE00900;
const CONTEXT_BEFORE_BYTES = 0x18;
const CONTEXT_AFTER_BYTES = 0x28;
const BASE_SCAN_BYTES = 0x220;
const KNOWN_WINDOW_BYTES = 0x80;

const ABS_REF_TAGS = new Set(['ld-reg-mem', 'ld-pair-mem', 'ld-mem-reg', 'ld-mem-pair']);
const BASE_LOAD_PAIRS = new Set(['bc', 'de', 'hl', 'ix', 'iy']);
const INDEXED_READ_TAGS = new Set([
  'ld-reg-ixd',
  'ld-pair-indexed',
  'ld-ixiy-indexed',
  'alu-ixd',
  'indexed-cb-bit',
  'indexed-cb-res',
  'indexed-cb-set',
  'inc-ixd',
  'dec-ixd',
]);
const INDEXED_WRITE_TAGS = new Set([
  'ld-ixd-reg',
  'ld-ixd-imm',
  'ld-indexed-pair',
  'ld-indexed-ixiy',
  'inc-ixd',
  'dec-ixd',
]);

const KNOWN_FUNCTIONS = [
  { addr: 0x027111, label: '0x027111', note: 'session 284 says this is not the keyboard scanner' },
  { addr: 0x02FCB3, label: '0x02FCB3', note: 'blocking key wait' },
  { addr: 0x04AB65, label: '0x04AB65', note: '_GetCSC veneer' },
  { addr: 0x02F68A, label: '0x02F68A', note: 'key processing pipeline' },
  { addr: 0x003D55, label: '0x003D55', note: 'ISR keyboard writer' },
];

const REQUESTED_PATTERN_SPECS = [
  {
    name: 'LD A,(0xE008xx)',
    bytes: [0x3A, null, 0x08, 0xE0],
    rawFilter: (rom, pc) => inRange(rom[pc + 1], 0x10, 0x17),
    confirm: (inst) => inst?.tag === 'ld-reg-mem' && inst?.dest === 'a' && inRange(inst?.addr, MATRIX_MIN, MATRIX_MAX),
  },
  {
    name: 'LD HL,(0xE008xx)',
    bytes: [0x2A, null, 0x08, 0xE0],
    rawFilter: (rom, pc) => inRange(rom[pc + 1], 0x10, 0x17),
    confirm: (inst) => inst?.tag === 'ld-pair-mem' && inst?.pair === 'hl' && inRange(inst?.addr, MATRIX_MIN, MATRIX_MAX),
  },
  {
    name: 'LD BC,(0xE008xx) [ED 4B]',
    bytes: [0xED, 0x4B, null, 0x08, 0xE0],
    rawFilter: (rom, pc) => inRange(rom[pc + 2], 0x10, 0x17),
    confirm: (inst) => inst?.tag === 'ld-pair-mem' && inst?.pair === 'bc' && inRange(inst?.addr, MATRIX_MIN, MATRIX_MAX),
  },
  {
    name: 'LD DE,(0xE008xx) [ED 5B]',
    bytes: [0xED, 0x5B, null, 0x08, 0xE0],
    rawFilter: (rom, pc) => inRange(rom[pc + 2], 0x10, 0x17),
    confirm: (inst) => inst?.tag === 'ld-pair-mem' && inst?.pair === 'de' && inRange(inst?.addr, MATRIX_MIN, MATRIX_MAX),
  },
  {
    name: 'LD HL,(0xE008xx) [ED 6B]',
    bytes: [0xED, 0x6B, null, 0x08, 0xE0],
    rawFilter: (rom, pc) => inRange(rom[pc + 2], 0x10, 0x17),
    confirm: (inst) => inst?.tag === 'ld-pair-mem' && inst?.pair === 'hl' && inRange(inst?.addr, MATRIX_MIN, MATRIX_MAX),
  },
  {
    name: 'LD SP,(0xE008xx) [ED 7B]',
    bytes: [0xED, 0x7B, null, 0x08, 0xE0],
    rawFilter: (rom, pc) => inRange(rom[pc + 2], 0x10, 0x17),
    confirm: (inst) => inst?.tag === 'ld-pair-mem' && inst?.pair === 'sp' && inRange(inst?.addr, MATRIX_MIN, MATRIX_MAX),
  },
  {
    name: 'LD HL,0xE00810',
    bytes: [0x21, 0x10, 0x08, 0xE0],
    confirm: (inst) => inst?.tag === 'ld-pair-imm' && inst?.pair === 'hl' && inst?.value === 0xE00810,
  },
  {
    name: 'LD DE,0xE00810',
    bytes: [0x11, 0x10, 0x08, 0xE0],
    confirm: (inst) => inst?.tag === 'ld-pair-imm' && inst?.pair === 'de' && inst?.value === 0xE00810,
  },
  {
    name: 'LD BC,0xE00810',
    bytes: [0x01, 0x10, 0x08, 0xE0],
    confirm: (inst) => inst?.tag === 'ld-pair-imm' && inst?.pair === 'bc' && inst?.value === 0xE00810,
  },
  {
    name: 'LD IY,0xE00800',
    bytes: [0xFD, 0x21, 0x00, 0x08, 0xE0],
    confirm: (inst) => inst?.tag === 'ld-pair-imm' && inst?.pair === 'iy' && inst?.value === 0xE00800,
  },
  {
    name: 'LD IX,0xE00800',
    bytes: [0xDD, 0x21, 0x00, 0x08, 0xE0],
    confirm: (inst) => inst?.tag === 'ld-pair-imm' && inst?.pair === 'ix' && inst?.value === 0xE00800,
  },
  {
    name: 'IN A,(0x01)',
    bytes: [0xDB, 0x01],
    confirm: (inst) => inst?.tag === 'in-imm' && inst?.port === 0x01,
  },
];

function hex(value, width = 6) {
  if (value === null || value === undefined || Number.isNaN(value)) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function bytesToHex(bytes) {
  return Array.from(bytes, (value) => hexByte(value)).join(' ');
}

function inRange(value, min, max) {
  return typeof value === 'number' && value >= min && value <= max;
}

function safeDecodeInstruction(romBytes, pc) {
  try {
    return decodeInstruction(romBytes, pc, 'adl');
  } catch {
    return null;
  }
}

function buildRow(romBytes, pc, inst) {
  const decoded = inst ?? safeDecodeInstruction(romBytes, pc);
  const length = Math.max(1, decoded?.length ?? 1);
  return {
    pc,
    inst: decoded,
    length,
    bytes: bytesToHex(romBytes.subarray(pc, Math.min(romBytes.length, pc + length))),
    text: formatInstruction(decoded),
  };
}

function formatIndexed(indexRegister, displacement) {
  const sign = displacement >= 0 ? '+' : '';
  return `(${String(indexRegister).toUpperCase()}${sign}${displacement})`;
}

function formatInstruction(inst) {
  if (!inst) return '(decode error)';

  switch (inst.tag) {
    case 'alu-reg': return `${String(inst.op).toUpperCase()} ${String(inst.src).toUpperCase()}`;
    case 'alu-imm': return `${String(inst.op).toUpperCase()} ${hexByte(inst.value)}`;
    case 'alu-ixd': return `${String(inst.op).toUpperCase()} ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-reg-mem': return `LD ${String(inst.dest).toUpperCase()}, (${hex(inst.addr)})`;
    case 'ld-mem-reg': return `LD (${hex(inst.addr)}), ${String(inst.src).toUpperCase()}`;
    case 'ld-reg-imm': return `LD ${String(inst.dest).toUpperCase()}, ${hexByte(inst.value)}`;
    case 'ld-reg-reg': return `LD ${String(inst.dest).toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    case 'ld-pair-imm': return `LD ${String(inst.pair).toUpperCase()}, ${hex(inst.value)}`;
    case 'ld-pair-mem': {
      const width = (inst.addr ?? 0) <= 0xFFFF ? 4 : 6;
      return `LD ${String(inst.pair).toUpperCase()}, (${hex(inst.addr, width)})`;
    }
    case 'ld-mem-pair': {
      const width = (inst.addr ?? 0) <= 0xFFFF ? 4 : 6;
      return `LD (${hex(inst.addr, width)}), ${String(inst.pair).toUpperCase()}`;
    }
    case 'ld-reg-ixd': return `LD ${String(inst.dest).toUpperCase()}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-ixd-reg': return `LD ${formatIndexed(inst.indexRegister, inst.displacement)}, ${String(inst.src).toUpperCase()}`;
    case 'ld-ixd-imm': return `LD ${formatIndexed(inst.indexRegister, inst.displacement)}, ${hexByte(inst.value)}`;
    case 'ld-pair-indexed': return `LD ${String(inst.pair).toUpperCase()}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-indexed-pair': return `LD ${formatIndexed(inst.indexRegister, inst.displacement)}, ${String(inst.pair).toUpperCase()}`;
    case 'ld-ixiy-indexed': return `LD ${String(inst.dest).toUpperCase()}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-indexed-ixiy': return `LD ${formatIndexed(inst.indexRegister, inst.displacement)}, ${String(inst.src).toUpperCase()}`;
    case 'ld-ind-reg': return `LD (${String(inst.dest).toUpperCase()}), ${String(inst.src).toUpperCase()}`;
    case 'ld-reg-ind': return `LD ${String(inst.dest).toUpperCase()}, (${String(inst.src).toUpperCase()})`;
    case 'indexed-cb-bit': return `BIT ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-set': return `SET ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-res': return `RES ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'bit-test': return `BIT ${inst.bit}, ${String(inst.reg).toUpperCase()}`;
    case 'bit-set': return `SET ${inst.bit}, ${String(inst.reg).toUpperCase()}`;
    case 'bit-res': return `RES ${inst.bit}, ${String(inst.reg).toUpperCase()}`;
    case 'call': return `CALL ${hex(inst.target)}`;
    case 'call-conditional': return `CALL ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jp': return `JP ${hex(inst.target)}`;
    case 'jp-conditional': return `JP ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jp-indirect': return `JP (${String(inst.indirectRegister).toUpperCase()})`;
    case 'jr': return `JR ${hex(inst.target)}`;
    case 'jr-conditional': return `JR ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'push': return `PUSH ${String(inst.pair).toUpperCase()}`;
    case 'pop': return `POP ${String(inst.pair).toUpperCase()}`;
    case 'in0': return `IN0 ${String(inst.reg).toUpperCase()}, (${hexByte(inst.port)})`;
    case 'out0': return `OUT0 (${hexByte(inst.port)}), ${String(inst.reg).toUpperCase()}`;
    case 'in-imm': return `IN A, (${hexByte(inst.port)})`;
    case 'out-imm': return `OUT (${hexByte(inst.port)}), A`;
    case 'in-reg': return `IN ${String(inst.reg).toUpperCase()}, (C)`;
    case 'out-reg': return `OUT (C), ${String(inst.reg).toUpperCase()}`;
    case 'ret': return 'RET';
    case 'ret-conditional': return `RET ${String(inst.condition).toUpperCase()}`;
    case 'inc-reg': return `INC ${String(inst.reg).toUpperCase()}`;
    case 'dec-reg': return `DEC ${String(inst.reg).toUpperCase()}`;
    case 'inc-pair': return `INC ${String(inst.pair).toUpperCase()}`;
    case 'dec-pair': return `DEC ${String(inst.pair).toUpperCase()}`;
    case 'inc-ixd': return `INC ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'dec-ixd': return `DEC ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'add-pair': return `ADD ${String(inst.dest ?? 'HL').toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    case 'adc-pair': return `ADC HL, ${String(inst.src).toUpperCase()}`;
    case 'sbc-pair': return `SBC HL, ${String(inst.src).toUpperCase()}`;
    case 'di': return 'DI';
    case 'ei': return 'EI';
    case 'nop': return 'NOP';
    case 'rra': return 'RRA';
    case 'rrca': return 'RRCA';
    case 'rla': return 'RLA';
    case 'rlca': return 'RLCA';
    case 'cpl': return 'CPL';
    case 'scf': return 'SCF';
    case 'ccf': return 'CCF';
    case 'daa': return 'DAA';
    case 'xor': return 'XOR A';
    default:
      if (inst.target !== undefined) return `${inst.tag} ${hex(inst.target)}`;
      if (inst.addr !== undefined) return `${inst.tag} ${hex(inst.addr)}`;
      return inst.tag;
  }
}

function scanWildcardPattern(romBytes, pattern, rawFilter) {
  const hits = [];
  for (let pc = 0; pc <= romBytes.length - pattern.length; pc += 1) {
    let match = true;
    for (let index = 0; index < pattern.length; index += 1) {
      const want = pattern[index];
      if (want !== null && romBytes[pc + index] !== want) {
        match = false;
        break;
      }
    }
    if (!match) continue;
    if (typeof rawFilter === 'function' && !rawFilter(romBytes, pc)) continue;
    hits.push(pc);
  }
  return hits;
}

function betterChain(candidate, current, target) {
  const candidateSpan = target - candidate.start;
  const currentSpan = target - current.start;
  if (candidateSpan !== currentSpan) return candidateSpan > currentSpan;
  if (candidate.rows.length !== current.rows.length) return candidate.rows.length < current.rows.length;
  return candidate.start < current.start;
}

function buildPrefixRows(romBytes, targetPc, windowBytes) {
  const startPc = Math.max(0, targetPc - windowBytes);
  const bestAt = new Map();

  for (let pc = startPc; pc < targetPc; pc += 1) {
    const row = buildRow(romBytes, pc);
    if (!row.inst) continue;
    const endPc = pc + row.length;
    if (endPc > targetPc) continue;

    const seeds = [];
    const prior = bestAt.get(pc);
    if (prior) seeds.push(prior);
    seeds.push({ start: pc, rows: [] });

    for (const seed of seeds) {
      const candidate = {
        start: seed.start,
        rows: seed.rows.concat(row),
      };
      const current = bestAt.get(endPc);
      if (!current || betterChain(candidate, current, targetPc)) {
        bestAt.set(endPc, candidate);
      }
    }
  }

  return bestAt.get(targetPc)?.rows ?? [];
}

function decodeForwardRows(romBytes, startPc, byteCount) {
  const rows = [];
  const endPc = Math.min(romBytes.length, startPc + byteCount);
  let pc = startPc;

  while (pc < endPc) {
    const row = buildRow(romBytes, pc);
    rows.push(row);
    pc += row.length;
  }

  return rows;
}

function buildContextRows(romBytes, hitPc, beforeBytes = CONTEXT_BEFORE_BYTES, afterBytes = CONTEXT_AFTER_BYTES) {
  const prefix = buildPrefixRows(romBytes, hitPc, beforeBytes);
  const forward = decodeForwardRows(romBytes, hitPc, afterBytes);
  return prefix.concat(forward);
}

function printContextBlock(title, rows, hitPc) {
  console.log(title);
  for (const row of rows) {
    const marker = row.pc === hitPc ? ' << HIT' : '';
    console.log(`  ${hex(row.pc)}  ${row.bytes.padEnd(18)}  ${row.text}${marker}`);
  }
}

function groupNearby(hits, gap = 0x40) {
  if (hits.length === 0) return [];
  const ordered = [...hits].sort((left, right) => left.pc - right.pc);
  const groups = [];
  let current = {
    start: ordered[0].pc,
    end: ordered[0].pc,
    hits: [ordered[0]],
  };

  for (let index = 1; index < ordered.length; index += 1) {
    const hit = ordered[index];
    if (hit.pc - current.end <= gap) {
      current.hits.push(hit);
      current.end = hit.pc;
      continue;
    }
    groups.push(current);
    current = { start: hit.pc, end: hit.pc, hits: [hit] };
  }

  groups.push(current);
  return groups;
}

function sweepRom(romBytes) {
  const out = {
    matrixAbsRefs: [],
    controllerAbsRefs: [],
    port1ImmediateReads: [],
    inRegHits: [],
    baseLoads: [],
  };

  for (let pc = 0; pc < romBytes.length; pc += 1) {
    const inst = safeDecodeInstruction(romBytes, pc);
    if (!inst) continue;

    if (ABS_REF_TAGS.has(inst.tag) && inRange(inst.addr, CONTROLLER_MIN, CONTROLLER_MAX)) {
      const row = buildRow(romBytes, pc, inst);
      out.controllerAbsRefs.push(row);
      if (inRange(inst.addr, MATRIX_MIN, MATRIX_MAX)) out.matrixAbsRefs.push(row);
    }

    if (inst.tag === 'in-imm' && inst.port === 0x01) {
      out.port1ImmediateReads.push(buildRow(romBytes, pc, inst));
    }

    if (inst.tag === 'in-reg') {
      out.inRegHits.push(buildRow(romBytes, pc, inst));
    }

    if (inst.tag === 'ld-pair-imm' && BASE_LOAD_PAIRS.has(inst.pair) && (inst.value === 0xE00800 || inst.value === 0xE00810)) {
      out.baseLoads.push(buildRow(romBytes, pc, inst));
    }
  }

  return out;
}

function classifyAbsRefDirection(inst) {
  if (!inst) return 'unknown';
  if (inst.tag === 'ld-reg-mem' || inst.tag === 'ld-pair-mem') return 'read';
  if (inst.tag === 'ld-mem-reg' || inst.tag === 'ld-mem-pair') return 'write';
  return 'unknown';
}

function scanRequestedPatterns(romBytes) {
  return REQUESTED_PATTERN_SPECS.map((spec) => {
    const rawHits = scanWildcardPattern(romBytes, spec.bytes, spec.rawFilter);
    const verifiedHits = rawHits.filter((pc) => spec.confirm(safeDecodeInstruction(romBytes, pc)));
    return { ...spec, rawHits, verifiedHits };
  });
}

function findIndexedAccess(inst, basePair, baseValue) {
  if (!inst || inst.indexRegister !== basePair || typeof inst.displacement !== 'number') return null;
  const absAddr = (baseValue + inst.displacement) >>> 0;
  if (!inRange(absAddr, MATRIX_MIN, MATRIX_MAX)) return null;

  const reads = INDEXED_READ_TAGS.has(inst.tag);
  const writes = INDEXED_WRITE_TAGS.has(inst.tag);
  let accessType = 'unknown';
  if (reads && writes) accessType = 'read-write';
  else if (reads) accessType = 'read';
  else if (writes) accessType = 'write';

  return { absAddr, accessType };
}

function scanBaseLoadUsage(romBytes, baseLoadRow) {
  const baseValue = baseLoadRow.inst?.value;
  const basePair = baseLoadRow.inst?.pair;
  const rows = decodeForwardRows(romBytes, baseLoadRow.pc, BASE_SCAN_BYTES);
  const matrixIndexedAccesses = [];
  const localControllerRefs = [];

  for (const row of rows) {
    if (row.pc !== baseLoadRow.pc && ABS_REF_TAGS.has(row.inst?.tag) && inRange(row.inst?.addr, CONTROLLER_MIN, CONTROLLER_MAX)) {
      localControllerRefs.push(row);
    }

    const indexed = findIndexedAccess(row.inst, basePair, baseValue);
    if (indexed) matrixIndexedAccesses.push({ ...row, ...indexed });
  }

  return {
    baseLoadRow,
    matrixIndexedAccesses,
    localControllerRefs,
    contextRows: buildContextRows(romBytes, baseLoadRow.pc),
  };
}

function findNearbyRawPort1Setup(romBytes, pc) {
  const notes = [];
  const start = Math.max(0, pc - 16);

  for (let cursor = start; cursor < pc; cursor += 1) {
    if (cursor + 1 < romBytes.length && romBytes[cursor] === 0x0E && romBytes[cursor + 1] === 0x01) {
      notes.push(`raw LD C,0x01 at ${hex(cursor)}`);
    }
    if (
      cursor + 3 < romBytes.length &&
      romBytes[cursor] === 0x01 &&
      romBytes[cursor + 1] === 0x01 &&
      romBytes[cursor + 2] === 0x00 &&
      romBytes[cursor + 3] === 0x00
    ) {
      notes.push(`raw LD BC,0x000001 at ${hex(cursor)}`);
    }
  }

  return notes;
}

function inferLastBcOrCImmediate(rows, hitPc) {
  let last = null;

  for (const row of rows) {
    if (row.pc >= hitPc || !row.inst) break;
    if (row.inst.tag === 'ld-pair-imm' && row.inst.pair === 'bc') {
      last = { kind: 'bc', value: row.inst.value, pc: row.pc };
      continue;
    }
    if (row.inst.tag === 'ld-reg-imm' && row.inst.dest === 'c') {
      last = { kind: 'c', value: row.inst.value, pc: row.pc };
    }
  }

  return last;
}

function collectInRegPortCandidates(romBytes, inRegHits) {
  const candidates = [];

  for (const row of inRegHits) {
    const contextRows = buildContextRows(romBytes, row.pc);
    const lastImmediate = inferLastBcOrCImmediate(contextRows, row.pc);
    const nearbyRaw = findNearbyRawPort1Setup(romBytes, row.pc);

    if (lastImmediate || nearbyRaw.length > 0) {
      candidates.push({
        row,
        contextRows,
        lastImmediate,
        nearbyRaw,
        confirmedPort1: lastImmediate?.value === 0x000001 || lastImmediate?.value === 0x01,
      });
    }
  }

  return candidates;
}

function summarizeKnownFunction(romBytes, known) {
  const rows = decodeForwardRows(romBytes, known.addr, KNOWN_WINDOW_BYTES);
  const localHits = rows.filter((row) => {
    if (!row.inst) return false;
    if (ABS_REF_TAGS.has(row.inst.tag) && inRange(row.inst.addr, CONTROLLER_MIN, CONTROLLER_MAX)) return true;
    if (row.inst.tag === 'in-imm' && row.inst.port === 0x01) return true;
    if (row.inst.tag === 'in-reg' || row.inst.tag === 'out-reg') return true;
    return false;
  });

  return { ...known, rows, localHits };
}

function main() {
  const romBytes = fs.readFileSync(ROM_PATH);
  const sweep = sweepRom(romBytes);
  const patternResults = scanRequestedPatterns(romBytes);

  const controllerReaders = sweep.controllerAbsRefs.filter(
    (row) => row.inst?.tag === 'ld-reg-mem' || row.inst?.tag === 'ld-pair-mem',
  );
  const controllerWriters = sweep.controllerAbsRefs.filter(
    (row) => row.inst?.tag === 'ld-mem-reg' || row.inst?.tag === 'ld-mem-pair',
  );
  const scanResultReaders = controllerReaders.filter((row) => row.inst?.addr === SCAN_RESULT_ADDR);
  const scanResultWriters = controllerWriters.filter((row) => row.inst?.addr === SCAN_RESULT_ADDR);
  const baseUsage = sweep.baseLoads.map((row) => scanBaseLoadUsage(romBytes, row));
  const port1Candidates = collectInRegPortCandidates(romBytes, sweep.inRegHits);
  const confirmedPort1InReg = port1Candidates.filter((candidate) => candidate.confirmedPort1);
  const knownSummaries = KNOWN_FUNCTIONS.map((known) => summarizeKnownFunction(romBytes, known));

  console.log('=== Phase 285: Real Keyboard Matrix Reader Hunt ===');
  console.log(`ROM: ${ROM_PATH}`);
  console.log(`ROM size: ${hex(romBytes.length)} bytes\n`);

  console.log('--- Requested pattern scan ---');
  for (const result of patternResults) {
    console.log(`- ${result.name}: raw=${result.rawHits.length}, verified=${result.verifiedHits.length}`);
  }
  console.log('');

  console.log('--- Direct absolute refs to 0xE00810..0xE00817 ---');
  console.log(`Total decoded absolute refs: ${sweep.matrixAbsRefs.length}`);
  if (sweep.matrixAbsRefs.length === 0) {
    console.log('No decoded absolute loads or stores touch 0xE00810..0xE00817 anywhere in ROM.');
  } else {
    for (const row of sweep.matrixAbsRefs) {
      console.log(`- ${hex(row.pc)}  ${row.text}  [${classifyAbsRefDirection(row.inst)}]`);
      printContextBlock('  Context:', buildContextRows(romBytes, row.pc), row.pc);
    }
  }
  console.log('');

  console.log('--- Base-register scans for E00800/E00810 ---');
  if (baseUsage.length === 0) {
    console.log('No base-pointer loads for 0xE00800/0xE00810 were found.');
  } else {
    for (const usage of baseUsage) {
      const pair = String(usage.baseLoadRow.inst?.pair).toUpperCase();
      const value = usage.baseLoadRow.inst?.value;
      const reads = usage.matrixIndexedAccesses.filter((row) => row.accessType === 'read' || row.accessType === 'read-write');
      const writes = usage.matrixIndexedAccesses.filter((row) => row.accessType === 'write' || row.accessType === 'read-write');
      const localScanReads = usage.localControllerRefs.filter((row) => row.inst?.addr === SCAN_RESULT_ADDR && classifyAbsRefDirection(row.inst) === 'read');
      const localScanWrites = usage.localControllerRefs.filter((row) => row.inst?.addr === SCAN_RESULT_ADDR && classifyAbsRefDirection(row.inst) === 'write');

      console.log(`- ${hex(usage.baseLoadRow.pc)}  ${pair} = ${hex(value)}`);
      console.log(`  Matrix-range indexed reads: ${reads.length}`);
      console.log(`  Matrix-range indexed writes: ${writes.length}`);
      if (writes.length > 0) {
        for (const row of writes) {
          console.log(`    ${hex(row.pc)}  ${row.text}  -> ${hex(row.absAddr)}`);
        }
      }
      if (reads.length > 0) {
        for (const row of reads) {
          console.log(`    ${hex(row.pc)}  ${row.text}  -> ${hex(row.absAddr)}`);
        }
      }
      console.log(`  Nearby direct E00900 reads: ${localScanReads.length}`);
      console.log(`  Nearby direct E00900 writes: ${localScanWrites.length}`);
      printContextBlock('  Base-load context:', usage.contextRows, usage.baseLoadRow.pc);
    }
  }
  console.log('');

  console.log('--- Direct controller-block readers of 0xE00900 ---');
  console.log(`Total decoded E00900 read sites: ${scanResultReaders.length}`);
  const readerGroups = groupNearby(scanResultReaders, 0x60);
  console.log(`Reader clusters: ${readerGroups.length}`);
  for (const group of readerGroups) {
    console.log(`- Cluster ${hex(group.start)}..${hex(group.end)} (${group.hits.length} hits)`);
    for (const row of group.hits) {
      console.log(`  ${hex(row.pc)}  ${row.text}`);
      printContextBlock('  Context:', buildContextRows(romBytes, row.pc), row.pc);
    }
  }
  console.log('');

  console.log('--- Direct controller-block writers of 0xE00900 ---');
  console.log(`Total decoded E00900 write sites: ${scanResultWriters.length}`);
  const writerGroups = groupNearby(scanResultWriters, 0x60);
  console.log(`Writer clusters: ${writerGroups.length}`);
  for (const group of writerGroups) {
    console.log(`- Cluster ${hex(group.start)}..${hex(group.end)} (${group.hits.length} hits)`);
    for (const row of group.hits) {
      console.log(`  ${hex(row.pc)}  ${row.text}`);
    }
  }
  console.log('');

  console.log('--- Legacy port 0x01 search ---');
  console.log(`Direct IN A,(0x01) sites: ${sweep.port1ImmediateReads.length}`);
  for (const row of sweep.port1ImmediateReads) {
    console.log(`- ${hex(row.pc)}  ${row.text}`);
    printContextBlock('  Context:', buildContextRows(romBytes, row.pc), row.pc);
  }
  console.log('');

  console.log('IN r,(C) candidates with nearby LD C,0x01 / LD BC,0x000001:');
  console.log(`- Raw nearby candidates: ${port1Candidates.length}`);
  console.log(`- Confirmed by local immediate-load reconstruction: ${confirmedPort1InReg.length}`);
  for (const candidate of port1Candidates.slice(0, 12)) {
    const lastImmediate = candidate.lastImmediate
      ? `${candidate.lastImmediate.kind.toUpperCase()}=${hex(candidate.lastImmediate.value)} at ${hex(candidate.lastImmediate.pc)}`
      : 'none';
    const rawNearby = candidate.nearbyRaw.length > 0 ? candidate.nearbyRaw.join('; ') : 'none';
    console.log(`  ${hex(candidate.row.pc)}  ${candidate.row.text}`);
    console.log(`    last decoded BC/C immediate: ${lastImmediate}`);
    console.log(`    raw nearby pattern(s): ${rawNearby}`);
  }
  console.log('');

  console.log('--- Cross-reference against known functions ---');
  for (const summary of knownSummaries) {
    console.log(`- ${summary.label} (${summary.note})`);
    if (summary.localHits.length === 0) {
      console.log('  No local MMIO or port-I/O instructions in the first 0x80 bytes.');
      continue;
    }
    for (const row of summary.localHits) {
      console.log(`  ${hex(row.pc)}  ${row.text}`);
    }
  }
  console.log('');

  const directMatrixReads = sweep.matrixAbsRefs.filter((row) => classifyAbsRefDirection(row.inst) === 'read');
  const indexedMatrixReads = baseUsage.flatMap((usage) =>
    usage.matrixIndexedAccesses.filter((row) => row.accessType === 'read' || row.accessType === 'read-write'),
  );
  const totalMatrixReadSites = directMatrixReads.length + indexedMatrixReads.length;

  console.log('--- Conclusion ---');
  console.log(`- Direct decoded reads from 0xE00810..0xE00817: ${directMatrixReads.length}`);
  console.log(`- Indexed reads from 0xE00810..0xE00817 via IX/IY base loads: ${indexedMatrixReads.length}`);
  console.log(`- Total ROM sites that actually read 0xE00810..0xE00817: ${totalMatrixReadSites}`);
  if (totalMatrixReadSites === 0) {
    console.log('- No ROM routine in this image directly reads the matrix rows at 0xE00810..0xE00817.');
    console.log(`- The keyboard hardware is instead accessed through the E00800 controller block and the scan-result register at ${hex(SCAN_RESULT_ADDR)}.`);
    console.log(`- Confirmed ${hex(SCAN_RESULT_ADDR)} readers: ${scanResultReaders.length} sites across ${readerGroups.length} local clusters.`);
    console.log('- The strongest central scan cluster is the foreground scanner around 0x0159C0/0x0159EE, which loads IY=0xE00800, polls status, and reads E00900.');
    console.log('- The later clusters around 0x040F16 and 0x046508 also read E00900 directly, indicating controller-based scan-result consumption rather than per-row matrix reads.');
    console.log('- 0x027111 itself has no direct matrix or port-0x01 read in its local body; 0x02FCB3 and 0x003D55 also do not read the matrix range directly.');
    console.log('- A legacy direct port helper still exists at 0x04ABFD (`IN A,(0x01)`), but that is separate from the MMIO matrix range and does not change the zero-hit result for 0xE00810..0xE00817.');
  } else {
    console.log('- At least one direct row-read site exists; review the contexts above.');
  }
}

main();

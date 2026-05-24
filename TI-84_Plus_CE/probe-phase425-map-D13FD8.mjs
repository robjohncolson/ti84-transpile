#!/usr/bin/env node

// Phase 425 — Map ROM references to D13FD8 / D13FDE descriptor-table bases.
// Scans the full 4 MB ROM for every 24-bit little-endian operand matching
// D13FD8..D13FDE, classifies the embedding instruction, and groups sites into
// function-oriented clusters so the overlapping table windows are easy to audit.

import { readFileSync } from 'fs';

process.emitWarning = () => {};

const rom = readFileSync(new URL('./ROM.rom', import.meta.url));

const TARGETS = [
  { label: 'D13FD8', addr: 0xD13FD8, note: 'Caller A base / D13FED index -7' },
  { label: 'D13FD9', addr: 0xD13FD9, note: 'inter-base byte +1' },
  { label: 'D13FDA', addr: 0xD13FDA, note: 'inter-base byte +2' },
  { label: 'D13FDB', addr: 0xD13FDB, note: 'companion computed-base literal' },
  { label: 'D13FDC', addr: 0xD13FDC, note: 'inter-base byte +4' },
  { label: 'D13FDD', addr: 0xD13FDD, note: 'inter-base byte +5' },
  { label: 'D13FDE', addr: 0xD13FDE, note: 'Caller B base / D13FED index -5' },
];

const CONTEXT_BEFORE = 12;
const CONTEXT_AFTER = 12;
const CLUSTER_GAP = 0x80;

const KNOWN_FUNCTIONS = [
  { start: 0x00CD7B, end: 0x00D2EC, name: 'Caller A (5-entry builder)' },
  { start: 0x00E300, end: 0x00E3FF, name: 'D13FD8/D13FDE init block' },
  { start: 0x00EB31, end: 0x00ED76, name: 'Caller B (single-descriptor builder)' },
  { start: 0x00ED77, end: 0x00EE1A, name: '0x00ED77 handshake slot selector' },
  { start: 0x00F430, end: 0x00F5FF, name: '0x00F430/0x00F544 event dispatch cluster' },
  { start: 0x00F600, end: 0x00FAFF, name: '0x00F6xx-0x00FAxx direct-slot cluster' },
  { start: 0x00FE10, end: 0x01008D, name: '0x00FE10 transfer dispatcher' },
  { start: 0x0390C0, end: 0x0390DF, name: 'mirror memset init cluster' },
  { start: 0x03A400, end: 0x03ADFF, name: 'mirror event-struct access cluster' },
  { start: 0x03B4C0, end: 0x03B5FF, name: 'mirror D13FD8/D13FDE init block' },
  { start: 0x03BC00, end: 0x03CCFF, name: 'mirror USB/link handler cluster' },
];

function hex(v, width = 6) {
  return '0x' + (Number(v) >>> 0).toString(16).toUpperCase().padStart(width, '0');
}

function hexByte(v) {
  return (v & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

function dumpBytes(buf, start, len) {
  const parts = [];
  for (let i = 0; i < len; i++) {
    const pos = start + i;
    if (pos >= 0 && pos < buf.length) {
      parts.push(hexByte(buf[pos]));
    }
  }
  return parts.join(' ');
}

function formatContext(buf, immOff, before = CONTEXT_BEFORE, after = CONTEXT_AFTER) {
  const leftStart = Math.max(0, immOff - before);
  const leftLen = immOff - leftStart;
  const rightStart = immOff + 3;
  const rightLen = Math.max(0, Math.min(after, buf.length - rightStart));
  const left = dumpBytes(buf, leftStart, leftLen);
  const mid = dumpBytes(buf, immOff, 3);
  const right = dumpBytes(buf, rightStart, rightLen);
  return `${left ? `${left} ` : ''}[${mid}]${right ? ` ${right}` : ''}`;
}

function findLE24(buf, addr) {
  const b0 = addr & 0xFF;
  const b1 = (addr >> 8) & 0xFF;
  const b2 = (addr >> 16) & 0xFF;
  const matches = [];
  for (let i = 0; i < buf.length - 2; i++) {
    if (buf[i] === b0 && buf[i + 1] === b1 && buf[i + 2] === b2) {
      matches.push(i);
    }
  }
  return matches;
}

function classifyInstruction(buf, immOff) {
  const prev1 = immOff >= 1 ? buf[immOff - 1] : -1;
  const prev2 = immOff >= 2 ? buf[immOff - 2] : -1;

  const singleByteOps = {
    0x01: { op: 'LD BC,nn', kind: 'IMM' },
    0x11: { op: 'LD DE,nn', kind: 'IMM' },
    0x21: { op: 'LD HL,nn', kind: 'IMM' },
    0x31: { op: 'LD SP,nn', kind: 'IMM' },
    0x22: { op: 'LD (nn),HL', kind: 'WRITE' },
    0x2A: { op: 'LD HL,(nn)', kind: 'READ' },
    0x32: { op: 'LD (nn),A', kind: 'WRITE' },
    0x3A: { op: 'LD A,(nn)', kind: 'READ' },
    0xC2: { op: 'JP NZ,nn', kind: 'JP' },
    0xC3: { op: 'JP nn', kind: 'JP' },
    0xC4: { op: 'CALL NZ,nn', kind: 'CALL' },
    0xCA: { op: 'JP Z,nn', kind: 'JP' },
    0xCC: { op: 'CALL Z,nn', kind: 'CALL' },
    0xCD: { op: 'CALL nn', kind: 'CALL' },
    0xD2: { op: 'JP NC,nn', kind: 'JP' },
    0xD4: { op: 'CALL NC,nn', kind: 'CALL' },
    0xDA: { op: 'JP C,nn', kind: 'JP' },
    0xDC: { op: 'CALL C,nn', kind: 'CALL' },
    0xE2: { op: 'JP PO,nn', kind: 'JP' },
    0xE4: { op: 'CALL PO,nn', kind: 'CALL' },
    0xEA: { op: 'JP PE,nn', kind: 'JP' },
    0xEC: { op: 'CALL PE,nn', kind: 'CALL' },
    0xF2: { op: 'JP P,nn', kind: 'JP' },
    0xF4: { op: 'CALL P,nn', kind: 'CALL' },
    0xFA: { op: 'JP M,nn', kind: 'JP' },
    0xFC: { op: 'CALL M,nn', kind: 'CALL' },
  };

  const edOps = {
    0x07: { op: 'LD BC,(nn)', kind: 'READ' },
    0x0F: { op: 'LD (nn),BC', kind: 'WRITE' },
    0x17: { op: 'LD DE,(nn)', kind: 'READ' },
    0x1F: { op: 'LD (nn),DE', kind: 'WRITE' },
    0x27: { op: 'LD HL,(nn)', kind: 'READ' },
    0x2F: { op: 'LD (nn),HL', kind: 'WRITE' },
    0x31: { op: 'LD IX/IY,(nn)', kind: 'READ' },
    0x37: { op: 'LD (nn),IX/IY', kind: 'WRITE' },
    0x43: { op: 'LD (nn),BC', kind: 'WRITE' },
    0x4B: { op: 'LD BC,(nn)', kind: 'READ' },
    0x53: { op: 'LD (nn),DE', kind: 'WRITE' },
    0x5B: { op: 'LD DE,(nn)', kind: 'READ' },
    0x63: { op: 'LD (nn),HL', kind: 'WRITE' },
    0x6B: { op: 'LD HL,(nn)', kind: 'READ' },
    0x73: { op: 'LD (nn),SP', kind: 'WRITE' },
    0x7B: { op: 'LD SP,(nn)', kind: 'READ' },
  };

  const ixiyOps = {
    0x21: { op: 'LD rr,nn', kind: 'IMM' },
    0x22: { op: 'LD (nn),rr', kind: 'WRITE' },
    0x2A: { op: 'LD rr,(nn)', kind: 'READ' },
  };

  if (prev2 === 0xED && edOps[prev1]) {
    return { ...edOps[prev1], instructionStart: immOff - 2 };
  }

  if ((prev2 === 0xDD || prev2 === 0xFD) && ixiyOps[prev1]) {
    const reg = prev2 === 0xDD ? 'IX' : 'IY';
    const op = ixiyOps[prev1].op.replaceAll('rr', reg);
    return { op, kind: ixiyOps[prev1].kind, instructionStart: immOff - 2 };
  }

  const suffixNames = {
    0x40: '.SIS',
    0x49: '.LIS',
    0x52: '.SIL',
    0x5B: '.LIL',
  };
  if (suffixNames[prev2] && singleByteOps[prev1]) {
    return {
      op: `${singleByteOps[prev1].op}${suffixNames[prev2]}`,
      kind: singleByteOps[prev1].kind,
      instructionStart: immOff - 2,
    };
  }

  if (singleByteOps[prev1]) {
    return { ...singleByteOps[prev1], instructionStart: immOff - 1 };
  }

  return {
    op: `UNKNOWN (prev ${hexByte(prev2)} ${hexByte(prev1)})`,
    kind: 'UNKNOWN',
    instructionStart: Math.max(0, immOff - 1),
  };
}

function findKnownFunction(addr) {
  for (const fn of KNOWN_FUNCTIONS) {
    if (addr >= fn.start && addr <= fn.end) {
      return fn;
    }
  }
  return null;
}

function groupRefsByFunctionOrGap(refs) {
  const named = new Map();
  const unnamed = [];

  for (const ref of [...refs].sort((a, b) => a.instructionStart - b.instructionStart)) {
    const fn = findKnownFunction(ref.instructionStart);
    if (fn) {
      if (!named.has(fn.name)) {
        named.set(fn.name, { name: fn.name, refs: [], start: fn.start, end: fn.end, known: true });
      }
      named.get(fn.name).refs.push(ref);
    } else {
      unnamed.push(ref);
    }
  }

  const groups = [...named.values()];

  if (unnamed.length > 0) {
    let current = null;
    for (const ref of unnamed) {
      if (!current || ref.instructionStart - current.end > CLUSTER_GAP) {
        current = {
          name: `ROM cluster ${hex(ref.instructionStart)}..${hex(ref.instructionStart)}`,
          refs: [],
          start: ref.instructionStart,
          end: ref.instructionStart,
          known: false,
        };
        groups.push(current);
      }
      current.refs.push(ref);
      current.end = ref.instructionStart;
      current.name = `ROM cluster ${hex(current.start)}..${hex(current.end)}`;
    }
  }

  return groups.sort((a, b) => a.start - b.start);
}

function countKinds(refs) {
  const counts = { READ: 0, WRITE: 0, IMM: 0, CALL: 0, JP: 0, UNKNOWN: 0 };
  for (const ref of refs) {
    counts[ref.kind] = (counts[ref.kind] || 0) + 1;
  }
  return counts;
}

function summarizeCounts(counts) {
  return `READ:${counts.READ} WRITE:${counts.WRITE} IMM:${counts.IMM} CALL:${counts.CALL} JP:${counts.JP} UNKNOWN:${counts.UNKNOWN}`;
}

function summarizeTargetMix(refs) {
  const mix = new Map();
  for (const ref of refs) {
    mix.set(ref.targetLabel, (mix.get(ref.targetLabel) || 0) + 1);
  }
  return [...mix.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([label, count]) => `${label}:${count}`)
    .join(', ');
}

function scanTarget(target) {
  return findLE24(rom, target.addr).map((romOffset) => {
    const cls = classifyInstruction(rom, romOffset);
    return {
      targetAddr: target.addr,
      targetLabel: target.label,
      targetNote: target.note,
      romOffset,
      ...cls,
      functionName: findKnownFunction(cls.instructionStart)?.name ?? null,
    };
  });
}

const results = TARGETS.map((target) => ({
  ...target,
  refs: scanTarget(target),
}));

const allRefs = results.flatMap((item) => item.refs).sort((a, b) => a.instructionStart - b.instructionStart);

console.log('=== Phase 425: D13FD8 / D13FDE Descriptor Base Map ===\n');
console.log(`ROM size: ${hex(rom.length)} bytes`);
console.log('Targets: ' + TARGETS.map((target) => `${target.label}=${hex(target.addr)}`).join(', '));
console.log('');
console.log('=== BASE RELATIONSHIPS ===');
console.log(`D13FDE - D13FD8 = ${hex(0xD13FDE - 0xD13FD8, 4)} (${(0xD13FDE - 0xD13FD8) / 3} table entries)`);
console.log(`D13FED - D13FD8 = ${hex(0xD13FED - 0xD13FD8, 4)} (${(0xD13FED - 0xD13FD8) / 3} table entries)`);
console.log(`D13FED - D13FDE = ${hex(0xD13FED - 0xD13FDE, 4)} (${(0xD13FED - 0xD13FDE) / 3} table entries)`);
console.log(`Caller-A 5-entry span: ${hex(0xD13FD8)}..${hex(0xD13FD8 + 5 * 3 - 1)}`);
console.log(`Caller-B base overlaps Caller-A entry +2: ${hex(0xD13FDE)}`);

console.log('\n=== ADDRESS SUMMARY ===\n');
console.log('Address  Label    Total  READ  WRITE  IMM  CALL  JP  UNKNOWN  Note');
console.log('-------  -------  -----  ----  -----  ---  ----  --  -------  ----');
for (const item of results) {
  const counts = countKinds(item.refs);
  console.log(
    `${hex(item.addr)}  ${item.label.padEnd(7)}  ${String(item.refs.length).padStart(5)}  ` +
    `${String(counts.READ).padStart(4)}  ${String(counts.WRITE).padStart(5)}  ` +
    `${String(counts.IMM).padStart(3)}  ${String(counts.CALL).padStart(4)}  ` +
    `${String(counts.JP).padStart(2)}  ${String(counts.UNKNOWN).padStart(7)}  ${item.note}`
  );
}

for (const item of results) {
  const counts = countKinds(item.refs);
  console.log(`\n=== ${item.label} (${hex(item.addr)}) ===`);
  console.log(`Note: ${item.note}`);
  console.log(`Total refs: ${item.refs.length}  (${summarizeCounts(counts)})`);

  if (item.refs.length === 0) {
    console.log('  No references found.');
    continue;
  }

  for (const group of groupRefsByFunctionOrGap(item.refs)) {
    const groupCounts = countKinds(group.refs);
    console.log(`\n  -- ${group.name} (${group.refs.length} ref(s); ${summarizeCounts(groupCounts)}) --`);
    for (const ref of group.refs.sort((a, b) => a.instructionStart - b.instructionStart)) {
      const fnTag = ref.functionName ? ` ; ${ref.functionName}` : '';
      console.log(`  ${hex(ref.instructionStart)}: ${ref.op}  [${ref.kind}]${fnTag}`);
      console.log(`    operand @ ${hex(ref.romOffset)}  context: ${formatContext(rom, ref.romOffset)}`);
    }
  }
}

console.log('\n=== GLOBAL FUNCTION / CLUSTER VIEW ===\n');
for (const group of groupRefsByFunctionOrGap(allRefs)) {
  const counts = countKinds(group.refs);
  console.log(`${group.name}`);
  console.log(`  span: ${hex(group.start)}..${hex(group.end)}`);
  console.log(`  refs: ${group.refs.length}  (${summarizeCounts(counts)})`);
  console.log(`  targets: ${summarizeTargetMix(group.refs)}`);
}

console.log('\n=== FOCUS POINTS ===\n');
console.log('- D13FD8 and D13FDE should appear as IMM loads where code computes base + 3*slot.');
console.log('- D13FDB is expected to show up as a companion computed-base literal in the paired init/access families.');
console.log('- D13FD9, D13FDC, and D13FDD are mainly scanned to confirm whether the gap bytes are ever addressed directly.');

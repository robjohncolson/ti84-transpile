#!/usr/bin/env node
/**
 * Phase 406 — Notification Consumer Map
 *
 * Scans the entire 4 MB ROM for every reference to:
 *   0xD177B8  (notification payload byte)
 *   0xD177B9  (notification type byte)
 *
 * Classifies each hit as READER or WRITER and groups by ROM region.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.emitWarning = () => {};
const { decodeInstruction } = await import('./ez80-decoder.js');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const REPORT_PATH = path.join(__dirname, 'phase406-notification-consumers-report.md');

const rom = fs.readFileSync(ROM_PATH);

// ── helpers ───────────────────────────────────────────────────────────

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((Number(value) || 0) & 0xFF, 2);
}

function bytesToHex(start, length) {
  const safeStart = Math.max(0, start);
  const safeEnd = Math.min(rom.length, safeStart + Math.max(0, length));
  return Array.from(rom.subarray(safeStart, safeEnd), (v) => hexByte(v)).join(' ');
}

function safeDecode(pc) {
  try {
    const inst = decodeInstruction(rom, pc, 'adl');
    if (!inst || !Number.isInteger(inst.length) || inst.length <= 0) {
      throw new Error('decoder returned invalid length');
    }
    return inst;
  } catch (error) {
    return {
      pc,
      length: 1,
      nextPc: pc + 1,
      tag: 'db',
      value: rom[pc] ?? 0,
      decodeError: error instanceof Error ? error.message : String(error),
    };
  }
}

function formatIndexed(indexRegister, displacement) {
  const signed = Number(displacement ?? 0);
  const prefix = signed >= 0 ? '+' : '-';
  return `(${String(indexRegister)}${prefix}0x${Math.abs(signed).toString(16).toUpperCase()})`;
}

function formatInstruction(inst) {
  if (!inst) return '<null>';
  const tag = inst.tag ?? 'unknown';
  if (tag === 'db') return `db ${hexByte(inst.value)}`;

  switch (tag) {
    case 'ret':
      return 'ret';
    case 'ret-conditional':
      return `ret ${inst.condition}`;
    case 'jr':
      return `jr ${hex(inst.target)}`;
    case 'jr-conditional':
      return `jr ${inst.condition}, ${hex(inst.target)}`;
    case 'jp':
      return `jp ${hex(inst.target)}`;
    case 'jp-conditional':
      return `jp ${inst.condition}, ${hex(inst.target)}`;
    case 'jp-indirect':
      return `jp (${inst.indirectRegister})`;
    case 'call':
      return `call ${hex(inst.target)}`;
    case 'call-conditional':
      return `call ${inst.condition}, ${hex(inst.target)}`;
    case 'push':
      return `push ${inst.pair}`;
    case 'pop':
      return `pop ${inst.pair}`;
    case 'ld-pair-imm':
      return `ld ${inst.pair}, ${hex(inst.value)}`;
    case 'ld-reg-imm':
      return `ld ${inst.dest}, ${hexByte(inst.value)}`;
    case 'ld-reg-reg':
      return `ld ${inst.dest}, ${inst.src}`;
    case 'ld-reg-ind':
      return `ld ${inst.dest}, (${inst.src})`;
    case 'ld-ind-reg':
      return `ld (${inst.dest}), ${inst.src}`;
    case 'ld-ind-imm':
      return `ld (hl), ${hexByte(inst.value)}`;
    case 'ld-reg-mem':
      return `ld ${inst.dest}, (${hex(inst.addr)})`;
    case 'ld-mem-reg':
      return `ld (${hex(inst.addr)}), ${inst.src}`;
    case 'ld-pair-mem':
      return inst.direction === 'to-mem'
        ? `ld (${hex(inst.addr)}), ${inst.pair}`
        : `ld ${inst.pair}, (${hex(inst.addr)})`;
    case 'ld-mem-pair':
      return `ld (${hex(inst.addr)}), ${inst.pair}`;
    case 'ld-reg-ixd':
      return `ld ${inst.dest}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-ixd-reg':
      return `ld ${formatIndexed(inst.indexRegister, inst.displacement)}, ${inst.src}`;
    case 'inc-pair':
      return `inc ${inst.pair}`;
    case 'dec-pair':
      return `dec ${inst.pair}`;
    case 'inc-reg':
      return `inc ${inst.reg}`;
    case 'dec-reg':
      return `dec ${inst.reg}`;
    case 'add-pair':
      return `add ${inst.dest}, ${inst.src}`;
    case 'adc-pair':
      return `adc hl, ${inst.src}`;
    case 'sbc-pair':
      return `sbc hl, ${inst.src}`;
    case 'alu-reg':
      return `${inst.op} ${inst.src}`;
    case 'alu-imm':
      return `${inst.op} ${hexByte(inst.value)}`;
    case 'bit-test':
      return `bit ${inst.bit}, ${inst.reg}`;
    case 'bit-test-ind':
      return `bit ${inst.bit}, (${inst.indirectRegister})`;
    case 'ldi':
    case 'ldir':
    case 'ldd':
    case 'lddr':
    case 'nop':
    case 'halt':
    case 'di':
    case 'ei':
    case 'rlca':
    case 'rrca':
    case 'rla':
    case 'rra':
    case 'daa':
    case 'cpl':
    case 'scf':
    case 'ccf':
    case 'exx':
    case 'ex-de-hl':
    case 'ld-sp-hl':
      return tag;
    default: {
      const ignored = new Set(['pc', 'length', 'nextPc', 'mode', 'modePrefix', 'terminates', 'fallthrough', 'decodeError', 'tag']);
      const extras = Object.entries(inst)
        .filter(([key, value]) => !ignored.has(key) && value !== undefined && value !== null)
        .map(([key, value]) => typeof value === 'number' ? `${key}=${hex(value, value > 0xFF ? 6 : 2)}` : `${key}=${value}`)
        .join(' ');
      return extras ? `${tag} ${extras}` : tag;
    }
  }
}

function renderRow(inst) {
  return `${hex(inst.pc)}  ${bytesToHex(inst.pc, inst.length).padEnd(20)} ${formatInstruction(inst)}`;
}

// Disassemble N instructions forward from a PC
function disassembleForward(startPc, count) {
  const rows = [];
  let pc = startPc;
  for (let i = 0; i < count && pc < rom.length; i++) {
    const inst = safeDecode(pc);
    rows.push(inst);
    pc = inst.nextPc;
  }
  return rows;
}

// Walk backwards by scanning from a safe start point
function disassembleContext(targetPc, beforeCount, afterCount) {
  // For "before", start ~32 bytes back and decode forward until we pass targetPc
  const scanStart = Math.max(0, targetPc - beforeCount * 6);
  const allInsts = [];
  let pc = scanStart;
  while (pc < targetPc + afterCount * 6 && pc < rom.length && allInsts.length < 200) {
    const inst = safeDecode(pc);
    allInsts.push(inst);
    pc = inst.nextPc;
  }
  // Find the instruction that starts at targetPc
  const targetIdx = allInsts.findIndex(i => i.pc === targetPc);
  if (targetIdx < 0) {
    // Fallback: just decode forward
    return disassembleForward(Math.max(0, targetPc - 10), beforeCount + 1 + afterCount);
  }
  const startIdx = Math.max(0, targetIdx - beforeCount);
  const endIdx = Math.min(allInsts.length, targetIdx + afterCount + 1);
  return allInsts.slice(startIdx, endIdx);
}

// ── pattern scan ──────────────────────────────────────────────────────

const TARGETS = [
  { addr: 0xD177B8, label: 'payload (D177B8)', leBytes: [0xB8, 0x77, 0xD1] },
  { addr: 0xD177B9, label: 'type (D177B9)',    leBytes: [0xB9, 0x77, 0xD1] },
];

// Instruction prefixes that embed a 3-byte address
const INSTRUCTION_PATTERNS = [
  { opcode: 0x3A, mnemonic: 'LD A,(nn)',   category: 'READER' },
  { opcode: 0x32, mnemonic: 'LD (nn),A',   category: 'WRITER' },
  { opcode: 0x21, mnemonic: 'LD HL,nn',    category: 'READER' },  // indirect — loads address into HL
  { opcode: 0x11, mnemonic: 'LD DE,nn',    category: 'READER' },  // indirect — loads address into DE
  { opcode: 0x01, mnemonic: 'LD BC,nn',    category: 'READER' },  // indirect — loads address into BC
];

// Additional two-byte prefix patterns (ED prefix group)
const ED_PATTERNS = [
  // LD (nn),HL = ED 63 lo mid hi   — WRITER (stores HL to memory)
  { prefix: 0xED, opcode: 0x63, mnemonic: 'LD (nn),HL', category: 'WRITER' },
  // LD HL,(nn) = ED 6B lo mid hi   — READER
  { prefix: 0xED, opcode: 0x6B, mnemonic: 'LD HL,(nn)', category: 'READER' },
  // LD (nn),DE = ED 53 lo mid hi   — WRITER
  { prefix: 0xED, opcode: 0x53, mnemonic: 'LD (nn),DE', category: 'WRITER' },
  // LD DE,(nn) = ED 5B lo mid hi   — READER
  { prefix: 0xED, opcode: 0x5B, mnemonic: 'LD DE,(nn)', category: 'READER' },
  // LD (nn),BC = ED 43 lo mid hi   — WRITER
  { prefix: 0xED, opcode: 0x43, mnemonic: 'LD (nn),BC', category: 'WRITER' },
  // LD BC,(nn) = ED 4B lo mid hi   — READER
  { prefix: 0xED, opcode: 0x4B, mnemonic: 'LD BC,(nn)', category: 'READER' },
  // LD (nn),SP = ED 73 lo mid hi   — WRITER
  { prefix: 0xED, opcode: 0x73, mnemonic: 'LD (nn),SP', category: 'WRITER' },
  // LD SP,(nn) = ED 7B lo mid hi   — READER
  { prefix: 0xED, opcode: 0x7B, mnemonic: 'LD SP,(nn)', category: 'READER' },
];

const allHits = [];

console.log('=== Phase 406: Notification Consumer Scan ===\n');

for (const target of TARGETS) {
  const [lo, mid, hi] = target.leBytes;

  // Single-byte prefix patterns
  for (const pat of INSTRUCTION_PATTERNS) {
    for (let i = 0; i < rom.length - 3; i++) {
      if (rom[i] === pat.opcode && rom[i + 1] === lo && rom[i + 2] === mid && rom[i + 3] === hi) {
        allHits.push({
          romAddr: i,
          targetAddr: target.addr,
          targetLabel: target.label,
          mnemonic: pat.mnemonic,
          category: pat.category,
          instrLen: 4,
        });
      }
    }
  }

  // ED-prefix patterns (2-byte opcode + 3-byte address = 5 bytes)
  for (const pat of ED_PATTERNS) {
    for (let i = 0; i < rom.length - 4; i++) {
      if (rom[i] === pat.prefix && rom[i + 1] === pat.opcode &&
          rom[i + 2] === lo && rom[i + 3] === mid && rom[i + 4] === hi) {
        allHits.push({
          romAddr: i,
          targetAddr: target.addr,
          targetLabel: target.label,
          mnemonic: pat.mnemonic,
          category: pat.category,
          instrLen: 5,
        });
      }
    }
  }
}

// Sort by ROM address
allHits.sort((a, b) => a.romAddr - b.romAddr);

// ── console output ────────────────────────────────────────────────────

const readers = allHits.filter(h => h.category === 'READER');
const writers = allHits.filter(h => h.category === 'WRITER');

console.log(`Total references found: ${allHits.length}`);
console.log(`  READERS: ${readers.length}`);
console.log(`  WRITERS: ${writers.length}`);
console.log();

function printHit(hit) {
  console.log(`  ${hex(hit.romAddr)}  ${hit.mnemonic.padEnd(16)} -> ${hit.targetLabel}  [${hit.category}]`);
  console.log(`    Raw bytes: ${bytesToHex(hit.romAddr, hit.instrLen)}`);
}

console.log('--- WRITERS (notification system internals) ---');
for (const hit of writers) {
  printHit(hit);
}
console.log();

console.log('--- READERS (notification consumers) ---');
for (const hit of readers) {
  printHit(hit);
}
console.log();

// ── context disassembly for each hit ──────────────────────────────────

console.log('=== Detailed Context Disassembly ===\n');

const contextBlocks = [];

for (const hit of allHits) {
  const context = disassembleContext(hit.romAddr, 5, 5);
  const lines = context.map(inst => {
    const marker = inst.pc === hit.romAddr ? ' <<<' : '';
    return `    ${renderRow(inst)}${marker}`;
  });
  const block = {
    hit,
    lines,
  };
  contextBlocks.push(block);

  console.log(`[${hit.category}] ${hex(hit.romAddr)} — ${hit.mnemonic} — ${hit.targetLabel}`);
  for (const line of lines) {
    console.log(line);
  }
  console.log();
}

// ── region grouping ───────────────────────────────────────────────────

// Group hits into 0x1000-byte regions to identify OS subsystems
function regionKey(addr) {
  const base = addr & 0xFFF000;
  return `${hex(base)}-${hex(base + 0xFFF)}`;
}

const regionMap = new Map();
for (const hit of allHits) {
  const key = regionKey(hit.romAddr);
  if (!regionMap.has(key)) {
    regionMap.set(key, []);
  }
  regionMap.get(key).push(hit);
}

console.log('=== Region Summary ===\n');
for (const [region, hits] of regionMap) {
  const rCount = hits.filter(h => h.category === 'READER').length;
  const wCount = hits.filter(h => h.category === 'WRITER').length;
  console.log(`${region}  (${hits.length} refs: ${rCount}R / ${wCount}W)`);
  for (const h of hits) {
    console.log(`    ${hex(h.romAddr)}  ${h.category.padEnd(6)}  ${h.mnemonic.padEnd(16)}  ${h.targetLabel}`);
  }
}
console.log();

// ── also scan for nearby-address loads (HL = D177Bx ± small offset) ──

console.log('=== Nearby Address Loads (D177B0..D177BF) ===\n');

const nearbyHits = [];

for (let targetByte = 0xB0; targetByte <= 0xBF; targetByte++) {
  // Skip the exact targets — already found
  if (targetByte === 0xB8 || targetByte === 0xB9) continue;

  for (const pat of INSTRUCTION_PATTERNS) {
    for (let i = 0; i < rom.length - 3; i++) {
      if (rom[i] === pat.opcode && rom[i + 1] === targetByte && rom[i + 2] === 0x77 && rom[i + 3] === 0xD1) {
        const fullAddr = 0xD10000 + 0x7700 + targetByte;
        nearbyHits.push({
          romAddr: i,
          targetAddr: fullAddr,
          mnemonic: pat.mnemonic,
          offset: targetByte - 0xB8,
        });
      }
    }
  }
}

nearbyHits.sort((a, b) => a.romAddr - b.romAddr);

if (nearbyHits.length === 0) {
  console.log('  (none found)');
} else {
  for (const nh of nearbyHits) {
    const offsetStr = nh.offset >= 0 ? `+${nh.offset}` : `${nh.offset}`;
    console.log(`  ${hex(nh.romAddr)}  ${nh.mnemonic.padEnd(16)}  ${hex(nh.targetAddr)}  (D177B8${offsetStr})`);
  }
}
console.log();

// ── generate report ───────────────────────────────────────────────────

const reportLines = [];
reportLines.push('# Phase 406 — Notification Consumer Map');
reportLines.push('');
reportLines.push('## Target Addresses');
reportLines.push('');
reportLines.push('| Address | Role |');
reportLines.push('|---------|------|');
reportLines.push('| 0xD177B8 | Notification payload byte (written by _seqcase handlers at 0x049D3A) |');
reportLines.push('| 0xD177B9 | Notification type byte (written by state commit at 0x049CCA) |');
reportLines.push('');
reportLines.push('## Summary');
reportLines.push('');
reportLines.push(`- Total references: ${allHits.length}`);
reportLines.push(`- Readers: ${readers.length}`);
reportLines.push(`- Writers: ${writers.length}`);
reportLines.push('');

reportLines.push('## Writers (Notification System Internals)');
reportLines.push('');
reportLines.push('| ROM Address | Instruction | Target |');
reportLines.push('|-------------|-------------|--------|');
for (const hit of writers) {
  reportLines.push(`| ${hex(hit.romAddr)} | ${hit.mnemonic} | ${hit.targetLabel} |`);
}
reportLines.push('');

reportLines.push('## Readers (Notification Consumers)');
reportLines.push('');
reportLines.push('These are the OS subsystems that consume notification type/payload after a notification fires.');
reportLines.push('');
reportLines.push('| ROM Address | Instruction | Target |');
reportLines.push('|-------------|-------------|--------|');
for (const hit of readers) {
  reportLines.push(`| ${hex(hit.romAddr)} | ${hit.mnemonic} | ${hit.targetLabel} |`);
}
reportLines.push('');

reportLines.push('## Region Grouping');
reportLines.push('');
for (const [region, hits] of regionMap) {
  const rCount = hits.filter(h => h.category === 'READER').length;
  const wCount = hits.filter(h => h.category === 'WRITER').length;
  reportLines.push(`### ${region}  (${rCount}R / ${wCount}W)`);
  reportLines.push('');
  for (const h of hits) {
    reportLines.push(`- ${hex(h.romAddr)} — ${h.category} — ${h.mnemonic} — ${h.targetLabel}`);
  }
  reportLines.push('');
}

reportLines.push('## Detailed Disassembly Context');
reportLines.push('');
for (const block of contextBlocks) {
  reportLines.push(`### ${hex(block.hit.romAddr)} — ${block.hit.category} — ${block.hit.mnemonic} — ${block.hit.targetLabel}`);
  reportLines.push('');
  reportLines.push('```');
  for (const line of block.lines) {
    reportLines.push(line);
  }
  reportLines.push('```');
  reportLines.push('');
}

if (nearbyHits.length > 0) {
  reportLines.push('## Nearby Address References (D177B0..D177BF, excluding B8/B9)');
  reportLines.push('');
  reportLines.push('| ROM Address | Instruction | Target | Offset from D177B8 |');
  reportLines.push('|-------------|-------------|--------|-------------------|');
  for (const nh of nearbyHits) {
    const offsetStr = nh.offset >= 0 ? `+${nh.offset}` : `${nh.offset}`;
    reportLines.push(`| ${hex(nh.romAddr)} | ${nh.mnemonic} | ${hex(nh.targetAddr)} | ${offsetStr} |`);
  }
  reportLines.push('');
}

const report = reportLines.join('\n');
fs.writeFileSync(REPORT_PATH, report);
console.log(`Report written to ${REPORT_PATH}`);
console.log('\n=== Phase 406 complete ===');

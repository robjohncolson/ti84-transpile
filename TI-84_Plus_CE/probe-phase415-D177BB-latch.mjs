#!/usr/bin/env node

/**
 * Phase 415: D177BB latch probe
 *
 * Scans the entire ROM for all references to RAM address D177BB —
 * the master "transfer in progress" latch that controls D176F8 state
 * transitions. Reports readers, writers, and address loads, and for
 * writers infers the value written.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.emitWarning = () => {};
const { decodeInstruction } = await import('./ez80-decoder.js');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const rom = fs.readFileSync(ROM_PATH);

const TARGET = 0xD177BB;
const LO = 0xBB;
const MID = 0x77;
const HI = 0xD1;

// --- Pattern definitions ---
// Each pattern: { bytes, type, register, description }
const PATTERNS = [
  // Writes
  { bytes: [0x32, LO, MID, HI], type: 'WRITE', register: 'a', desc: 'LD (D177BB),A' },
  { bytes: [0x22, LO, MID, HI], type: 'WRITE', register: 'hl', desc: 'LD (D177BB),HL' },
  { bytes: [0xED, 0x43, LO, MID, HI], type: 'WRITE', register: 'bc', desc: 'LD (D177BB),BC' },
  { bytes: [0xED, 0x53, LO, MID, HI], type: 'WRITE', register: 'de', desc: 'LD (D177BB),DE' },
  { bytes: [0xDD, 0x22, LO, MID, HI], type: 'WRITE', register: 'ix', desc: 'LD (D177BB),IX' },
  { bytes: [0xFD, 0x22, LO, MID, HI], type: 'WRITE', register: 'iy', desc: 'LD (D177BB),IY' },

  // Reads
  { bytes: [0x3A, LO, MID, HI], type: 'READ', register: 'a', desc: 'LD A,(D177BB)' },
  { bytes: [0x2A, LO, MID, HI], type: 'READ', register: 'hl', desc: 'LD HL,(D177BB)' },
  { bytes: [0xED, 0x4B, LO, MID, HI], type: 'READ', register: 'bc', desc: 'LD BC,(D177BB)' },
  { bytes: [0xED, 0x5B, LO, MID, HI], type: 'READ', register: 'de', desc: 'LD DE,(D177BB)' },
  { bytes: [0xDD, 0x2A, LO, MID, HI], type: 'READ', register: 'ix', desc: 'LD IX,(D177BB)' },
  { bytes: [0xFD, 0x2A, LO, MID, HI], type: 'READ', register: 'iy', desc: 'LD IY,(D177BB)' },

  // Address loads (loading the address itself into a register)
  { bytes: [0x01, LO, MID, HI], type: 'ADDR_LOAD', register: 'bc', desc: 'LD BC,0xD177BB' },
  { bytes: [0x11, LO, MID, HI], type: 'ADDR_LOAD', register: 'de', desc: 'LD DE,0xD177BB' },
  { bytes: [0x21, LO, MID, HI], type: 'ADDR_LOAD', register: 'hl', desc: 'LD HL,0xD177BB' },
  { bytes: [0xDD, 0x21, LO, MID, HI], type: 'ADDR_LOAD', register: 'ix', desc: 'LD IX,0xD177BB' },
  { bytes: [0xFD, 0x21, LO, MID, HI], type: 'ADDR_LOAD', register: 'iy', desc: 'LD IY,0xD177BB' },
];

// --- Utility functions ---

function hex(value, width = 6) {
  return `0x${value.toString(16).padStart(width, '0')}`;
}

function hexByte(value) {
  return value.toString(16).padStart(2, '0');
}

function rawBytes(start, length) {
  return Array.from(rom.slice(start, start + length)).map(hexByte).join(' ');
}

function romBank(addr) {
  if (addr < 0x020000) return 'USB/OS-core (0x00xxxx-0x01xxxx)';
  if (addr < 0x040000) return 'OS-mid (0x02xxxx-0x03xxxx)';
  if (addr < 0x070000) return 'Link/peripheral (0x04xxxx-0x06xxxx)';
  return `Other (${hex(addr)})`;
}

function findPattern(pattern) {
  const hits = [];
  for (let pc = 0; pc <= rom.length - pattern.length; pc++) {
    let matched = true;
    for (let i = 0; i < pattern.length; i++) {
      if (rom[pc + i] !== pattern[i]) {
        matched = false;
        break;
      }
    }
    if (matched) hits.push(pc);
  }
  return hits;
}

function tryDecode(pc) {
  try {
    const inst = decodeInstruction(rom, pc, 'adl');
    if (!inst || inst.nextPc <= pc) return null;
    return inst;
  } catch {
    return null;
  }
}

function formatIndexed(indexRegister, displacement) {
  return `(${indexRegister}${displacement >= 0 ? '+' : ''}${displacement})`;
}

function formatInstruction(inst) {
  const prefix = inst.modePrefix ? `${inst.modePrefix} ` : '';
  switch (inst.tag) {
    case 'nop': return `${prefix}nop`;
    case 'ret': return `${prefix}ret`;
    case 'ret-conditional': return `${prefix}ret ${inst.condition}`;
    case 'call': return `${prefix}call ${hex(inst.target)}`;
    case 'call-conditional': return `${prefix}call ${inst.condition}, ${hex(inst.target)}`;
    case 'jp': return `${prefix}jp ${hex(inst.target)}`;
    case 'jp-conditional': return `${prefix}jp ${inst.condition}, ${hex(inst.target)}`;
    case 'jr': return `${prefix}jr ${hex(inst.target)}`;
    case 'jr-conditional': return `${prefix}jr ${inst.condition}, ${hex(inst.target)}`;
    case 'push': return `${prefix}push ${inst.pair}`;
    case 'pop': return `${prefix}pop ${inst.pair}`;
    case 'inc-pair': return `${prefix}inc ${inst.pair}`;
    case 'dec-pair': return `${prefix}dec ${inst.pair}`;
    case 'inc-reg': return `${prefix}inc ${inst.reg}`;
    case 'dec-reg': return `${prefix}dec ${inst.reg}`;
    case 'ld-reg-imm': return `${prefix}ld ${inst.dest}, 0x${inst.value.toString(16).padStart(2, '0')}`;
    case 'ld-pair-imm': return `${prefix}ld ${inst.pair}, ${hex(inst.value)}`;
    case 'ld-mem-reg': return `${prefix}ld (${hex(inst.addr)}), ${inst.reg}`;
    case 'ld-reg-mem': return `${prefix}ld ${inst.reg}, (${hex(inst.addr)})`;
    case 'ld-mem-pair': return `${prefix}ld (${hex(inst.addr)}), ${inst.pair}`;
    case 'ld-pair-mem': return `${prefix}ld ${inst.pair}, (${hex(inst.addr)})`;
    case 'ld-reg-reg': return `${prefix}ld ${inst.dest}, ${inst.src}`;
    case 'ld-reg-ind': return `${prefix}ld ${inst.dest}, (${inst.src})`;
    case 'ld-ind-reg': return `${prefix}ld (${inst.dest}), ${inst.src}`;
    case 'ld-ind-imm': return `${prefix}ld (hl), 0x${inst.value.toString(16).padStart(2, '0')}`;
    case 'ld-reg-ixd': return `${prefix}ld ${inst.dest}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-ixd-reg': return `${prefix}ld ${formatIndexed(inst.indexRegister, inst.displacement)}, ${inst.src}`;
    case 'ld-ixd-imm': return `${prefix}ld ${formatIndexed(inst.indexRegister, inst.displacement)}, 0x${inst.value.toString(16).padStart(2, '0')}`;
    case 'ld-pair-indexed': return `${prefix}ld ${inst.pair}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-indexed-pair': return `${prefix}ld ${formatIndexed(inst.indexRegister, inst.displacement)}, ${inst.pair}`;
    case 'ld-sp-pair': return `${prefix}ld sp, ${inst.pair}`;
    case 'add-pair': return `${prefix}add ${inst.dest}, ${inst.src}`;
    case 'sbc-pair': return `${prefix}sbc hl, ${inst.src}`;
    case 'alu-imm': return `${prefix}${inst.op} 0x${inst.value.toString(16).padStart(2, '0')}`;
    case 'alu-reg': return `${prefix}${inst.op} ${inst.src}`;
    case 'lea': return `${prefix}lea ${inst.dest}, ${inst.base}${inst.displacement >= 0 ? '+' : ''}${inst.displacement}`;
    case 'pea': return `${prefix}pea ${inst.base}${inst.displacement >= 0 ? '+' : ''}${inst.displacement}`;
    case 'ld-special': return `${prefix}ld ${inst.dest}, ${inst.src}`;
    case 'bit-test': return `${prefix}bit ${inst.bit}, ${inst.reg}`;
    case 'bit-res': return `${prefix}res ${inst.bit}, ${inst.reg}`;
    case 'bit-set': return `${prefix}set ${inst.bit}, ${inst.reg}`;
    case 'di': return `${prefix}di`;
    case 'ei': return `${prefix}ei`;
    case 'halt': return `${prefix}halt`;
    default: return `${prefix}${inst.tag}`;
  }
}

function selectBestSequence(hit, maxBack = 96) {
  const sequences = [];
  const searchStart = Math.max(0, hit - maxBack);
  for (let start = searchStart; start <= hit; start++) {
    let pc = start;
    const rows = [];
    let valid = true;
    while (pc < hit) {
      const inst = tryDecode(pc);
      if (!inst || inst.nextPc > hit) { valid = false; break; }
      rows.push({ pc, inst });
      pc = inst.nextPc;
    }
    if (valid && pc === hit) sequences.push(rows);
  }
  if (sequences.length === 0) return [];
  return sequences.sort((a, b) => {
    if (b.length !== a.length) return b.length - a.length;
    return (a[0]?.pc ?? hit) - (b[0]?.pc ?? hit);
  })[0];
}

function collectContextRows(hit, beforeCount = 6, afterCount = 4) {
  const prefix = selectBestSequence(hit, 80);
  const rows = prefix.slice(-beforeCount);
  let pc = hit;
  let remaining = afterCount + 1;
  while (remaining > 0 && pc < rom.length) {
    const inst = tryDecode(pc);
    if (!inst) {
      rows.push({ pc, inst: { tag: 'db', length: 1, nextPc: pc + 1 }, decodeError: true });
      pc++;
      remaining--;
      continue;
    }
    rows.push({ pc, inst });
    pc = inst.nextPc;
    remaining--;
  }
  return rows;
}

function inferWrittenValue(hit, register) {
  if (register !== 'a') {
    return { kind: 'non-a-store', value: null, sourcePc: null, sourceText: `store uses ${register.toUpperCase()}` };
  }

  const rows = selectBestSequence(hit, 48).slice(-10);
  for (let i = rows.length - 1; i >= 0; i--) {
    const { pc, inst } = rows[i];

    if (inst.tag === 'ld-reg-imm' && inst.dest === 'a') {
      return { kind: 'immediate', value: inst.value, sourcePc: pc, sourceText: formatInstruction(inst) };
    }
    if (inst.tag === 'alu-reg' && inst.op === 'xor' && inst.src === 'a') {
      return { kind: 'zero', value: 0, sourcePc: pc, sourceText: 'xor a' };
    }
    if (inst.tag === 'alu-reg' && inst.op === 'sub' && inst.src === 'a') {
      return { kind: 'zero', value: 0, sourcePc: pc, sourceText: 'sub a' };
    }
    if (inst.tag === 'ld-reg-mem' && inst.reg === 'a') {
      return { kind: 'memory-copy', value: null, sourcePc: pc, addr: inst.addr, sourceText: formatInstruction(inst) };
    }
    if (inst.tag === 'ld-reg-reg' && inst.dest === 'a') {
      return { kind: 'register-copy', value: null, sourcePc: pc, sourceReg: inst.src, sourceText: formatInstruction(inst) };
    }
    if ((inst.tag === 'inc-reg' || inst.tag === 'dec-reg') && inst.reg === 'a') {
      return { kind: 'computed', value: null, sourcePc: pc, sourceText: formatInstruction(inst) };
    }
    if ((inst.tag === 'alu-imm' || inst.tag === 'alu-reg') && inst.op !== 'cp' && !(inst.op === 'or' && inst.src === 'a')) {
      return { kind: 'computed', value: null, sourcePc: pc, sourceText: formatInstruction(inst) };
    }
    if (inst.tag === 'call' || inst.tag === 'call-conditional') {
      return { kind: 'call-result', value: null, sourcePc: pc, sourceText: formatInstruction(inst) };
    }
  }

  // Fallback: raw byte scan
  for (let j = hit - 1; j >= Math.max(0, hit - 12); j--) {
    if (rom[j] === 0xAF) return { kind: 'zero', value: 0, sourcePc: j, sourceText: 'xor a (raw)' };
    if (rom[j] === 0x97) return { kind: 'zero', value: 0, sourcePc: j, sourceText: 'sub a (raw)' };
    if (rom[j] === 0x3E) return { kind: 'immediate', value: rom[j + 1], sourcePc: j, sourceText: `ld a, 0x${hexByte(rom[j + 1])} (raw)` };
    if (rom[j] === 0xC9 || rom[j] === 0xC3 || rom[j] === 0x18 || rom[j] === 0xE9) break;
  }

  return { kind: 'unresolved', value: null, sourcePc: null, sourceText: 'not inferred' };
}

function formatValue(info) {
  if (typeof info.value === 'number') {
    if (info.value === 0) return '0x00 (clear / idle)';
    if (info.value === 1) return '0x01 (set / transfer active)';
    return `0x${hexByte(info.value)}`;
  }
  if (info.kind === 'memory-copy') return `copy from mem[${hex(info.addr)}]`;
  if (info.kind === 'register-copy') return `copy from ${info.sourceReg}`;
  if (info.kind === 'call-result') return 'result from prior call';
  if (info.kind === 'computed') return 'computed in A';
  if (info.kind === 'non-a-store') return info.sourceText;
  return 'unresolved';
}

function formatSource(info) {
  if (info.sourcePc === null) return info.sourceText;
  return `${hex(info.sourcePc)} ${info.sourceText}`;
}

// --- Main scan ---

console.log('======================================================================');
console.log('Phase 415: D177BB latch — all ROM references');
console.log('======================================================================');
console.log(`ROM: ${ROM_PATH}`);
console.log(`Target: ${hex(TARGET)} (master "transfer in progress" latch)`);
console.log('');

const allHits = [];

for (const pattern of PATTERNS) {
  const hits = findPattern(pattern.bytes);
  for (const pc of hits) {
    allHits.push({
      pc,
      type: pattern.type,
      register: pattern.register,
      desc: pattern.desc,
      instrLen: pattern.bytes.length,
    });
  }
}

// Sort by address
allHits.sort((a, b) => a.pc - b.pc);

const readers = allHits.filter((h) => h.type === 'READ');
const writers = allHits.filter((h) => h.type === 'WRITE');
const addrLoads = allHits.filter((h) => h.type === 'ADDR_LOAD');

console.log(`Total references: ${allHits.length}`);
console.log(`  Readers:       ${readers.length}`);
console.log(`  Writers:       ${writers.length}`);
console.log(`  Address loads: ${addrLoads.length}`);
console.log('');

// --- Pattern counts ---
console.log('Pattern breakdown:');
for (const pattern of PATTERNS) {
  const count = findPattern(pattern.bytes).length;
  if (count > 0) {
    console.log(`  ${pattern.desc.padEnd(25)} : ${count}`);
  }
}
console.log('');

// --- Bank grouping ---
console.log('Bank distribution:');
const bankGroups = new Map();
for (const hit of allHits) {
  const bank = romBank(hit.pc);
  if (!bankGroups.has(bank)) bankGroups.set(bank, []);
  bankGroups.get(bank).push(hit);
}
for (const [bank, hits] of bankGroups) {
  const r = hits.filter((h) => h.type === 'READ').length;
  const w = hits.filter((h) => h.type === 'WRITE').length;
  const a = hits.filter((h) => h.type === 'ADDR_LOAD').length;
  console.log(`  ${bank}: ${hits.length} total (${r}R, ${w}W, ${a}A)`);
}
console.log('');

// --- Writer analysis ---
console.log('======================================================================');
console.log('WRITER DETAILS (who sets/clears D177BB)');
console.log('======================================================================');
console.log('');

const writerDetails = writers.map((w) => {
  const value = inferWrittenValue(w.pc, w.register);
  const context = collectContextRows(w.pc);
  return { ...w, value, context };
});

// Group by value
const setters = writerDetails.filter((w) => w.value.value === 1);
const clearers = writerDetails.filter((w) => w.value.value === 0);
const others = writerDetails.filter((w) => w.value.value !== 0 && w.value.value !== 1);

console.log(`Writers that SET (value=1): ${setters.length}`);
for (const s of setters) {
  console.log(`  ${hex(s.pc)}  ${romBank(s.pc)}  source: ${formatSource(s.value)}`);
}
console.log('');

console.log(`Writers that CLEAR (value=0): ${clearers.length}`);
for (const c of clearers) {
  console.log(`  ${hex(c.pc)}  ${romBank(c.pc)}  source: ${formatSource(c.value)}`);
}
console.log('');

if (others.length > 0) {
  console.log(`Writers with OTHER/UNKNOWN values: ${others.length}`);
  for (const o of others) {
    console.log(`  ${hex(o.pc)}  ${romBank(o.pc)}  value: ${formatValue(o.value)}  source: ${formatSource(o.value)}`);
  }
  console.log('');
}

// --- All references table ---
console.log('======================================================================');
console.log('ALL REFERENCES (sorted by address)');
console.log('======================================================================');
console.log('');
console.log('| Address  | Type       | Instruction              | Bank                              |');
console.log('| -------- | ---------- | ------------------------ | --------------------------------- |');
for (const hit of allHits) {
  const valueNote = hit.type === 'WRITE'
    ? (() => { const wd = writerDetails.find((w) => w.pc === hit.pc); return wd ? ` [${formatValue(wd.value)}]` : ''; })()
    : '';
  console.log(`| ${hex(hit.pc)} | ${hit.type.padEnd(10)} | ${(hit.desc + valueNote).padEnd(24)} | ${romBank(hit.pc).padEnd(33)} |`);
}
console.log('');

// --- Detailed writer windows ---
console.log('======================================================================');
console.log('DETAILED WRITER CONTEXT WINDOWS');
console.log('======================================================================');

for (const detail of writerDetails) {
  console.log('');
  console.log(`--- ${hex(detail.pc)} ---`);
  console.log(`  instruction : ${detail.desc}`);
  console.log(`  value       : ${formatValue(detail.value)}`);
  console.log(`  source      : ${formatSource(detail.value)}`);
  console.log(`  bank        : ${romBank(detail.pc)}`);
  console.log(`  raw bytes   : ${rawBytes(detail.pc, detail.instrLen)}`);
  console.log('  context:');
  for (const row of detail.context) {
    const marker = row.pc === detail.pc ? ' >>>' : '    ';
    if (row.decodeError) {
      console.log(`${marker} ${hex(row.pc)} ${hexByte(rom[row.pc]).padEnd(18)} db 0x${hexByte(rom[row.pc])}`);
    } else {
      console.log(`${marker} ${hex(row.pc)} ${rawBytes(row.pc, row.inst.length).padEnd(18)} ${formatInstruction(row.inst)}`);
    }
  }
}

// --- Reader windows ---
console.log('');
console.log('======================================================================');
console.log('READER CONTEXT WINDOWS');
console.log('======================================================================');

for (const reader of readers) {
  const context = collectContextRows(reader.pc);
  console.log('');
  console.log(`--- ${hex(reader.pc)} ---`);
  console.log(`  instruction : ${reader.desc}`);
  console.log(`  bank        : ${romBank(reader.pc)}`);
  console.log('  context:');
  for (const row of context) {
    const marker = row.pc === reader.pc ? ' >>>' : '    ';
    if (row.decodeError) {
      console.log(`${marker} ${hex(row.pc)} ${hexByte(rom[row.pc]).padEnd(18)} db 0x${hexByte(rom[row.pc])}`);
    } else {
      console.log(`${marker} ${hex(row.pc)} ${rawBytes(row.pc, row.inst.length).padEnd(18)} ${formatInstruction(row.inst)}`);
    }
  }
}

// --- Address load windows ---
if (addrLoads.length > 0) {
  console.log('');
  console.log('======================================================================');
  console.log('ADDRESS LOAD CONTEXT WINDOWS');
  console.log('======================================================================');

  for (const al of addrLoads) {
    const context = collectContextRows(al.pc);
    console.log('');
    console.log(`--- ${hex(al.pc)} ---`);
    console.log(`  instruction : ${al.desc}`);
    console.log(`  bank        : ${romBank(al.pc)}`);
    console.log('  context:');
    for (const row of context) {
      const marker = row.pc === al.pc ? ' >>>' : '    ';
      if (row.decodeError) {
        console.log(`${marker} ${hex(row.pc)} ${hexByte(rom[row.pc]).padEnd(18)} db 0x${hexByte(rom[row.pc])}`);
      } else {
        console.log(`${marker} ${hex(row.pc)} ${rawBytes(row.pc, row.inst.length).padEnd(18)} ${formatInstruction(row.inst)}`);
      }
    }
  }
}

console.log('');
console.log('======================================================================');
console.log('LIFECYCLE SUMMARY');
console.log('======================================================================');
console.log('');
console.log('D177BB is a boolean latch (0 = idle, 1 = transfer in progress).');
console.log(`SET sites (${setters.length}): transfer start points`);
for (const s of setters) {
  console.log(`  ${hex(s.pc)} — ${romBank(s.pc)}`);
}
console.log(`CLEAR sites (${clearers.length}): transfer end / reset points`);
for (const c of clearers) {
  console.log(`  ${hex(c.pc)} — ${romBank(c.pc)}`);
}
console.log(`READ sites (${readers.length}): latch check points (gate D176F8 transitions)`);
for (const r of readers) {
  console.log(`  ${hex(r.pc)} — ${romBank(r.pc)}`);
}
if (addrLoads.length > 0) {
  console.log(`ADDRESS LOAD sites (${addrLoads.length}): indirect references`);
  for (const a of addrLoads) {
    console.log(`  ${hex(a.pc)} — ${romBank(a.pc)}`);
  }
}

console.log('');
console.log('Done.');

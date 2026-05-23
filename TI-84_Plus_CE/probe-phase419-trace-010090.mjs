#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs';

process.emitWarning = () => {};
const { decodeInstruction } = await import('./ez80-decoder.js');

const rom = readFileSync(new URL('./ROM.rom', import.meta.url));
const reportPath = new URL('./phase419-trace-010090-D000BF-report.md', import.meta.url);

// ── Constants ──

const ENTRY = 0x010090;
const MAX_END = 0x010220;   // must end before 0x010220 (RET is at 0x01021F)
const IY_SYSTEM = 0xD00080; // standard system IY

const SYMBOLS = new Map([
  [0xD000BF, 'D000BF_lcd_dma_ctl'],
  [0xD177BC, 'D177BC_master_enable'],
  [0xD177BD, 'D177BD_slot0_ptr'],
  [0xD177C0, 'D177C0_slot1_ptr'],
  [0xD177C3, 'D177C3_slot2_ptr'],
  [0xD177C6, 'D177C6_slot3_ptr'],
  [0xD177C9, 'D177C9_slot4_ptr'],
  [0xD177D6, 'D177D6_pending_bits'],
  [0xD177D7, 'D177D7_lcd_latch'],
  [0xD177D8, 'D177D8'],
  [0xD177DB, 'D177DB'],
  [0xD177E1, 'D177E1'],
]);

// ── Helpers ──

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return (value & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

function formatDisp(value) {
  return `${value >= 0 ? '+' : ''}${value}`;
}

function rawBytes(start, length) {
  return Array.from(rom.slice(start, start + length), hexByte).join(' ');
}

function safeDecode(pc) {
  try {
    return decodeInstruction(rom, pc, 'adl');
  } catch {
    return { pc, length: 1, nextPc: pc + 1, tag: 'db', value: rom[pc] ?? 0 };
  }
}

function formatInstruction(inst) {
  const u = v => String(v).toUpperCase();

  switch (inst.tag) {
    case 'call':         return `CALL ${hex(inst.target)}`;
    case 'call-conditional': return `CALL ${u(inst.condition)},${hex(inst.target)}`;
    case 'jp':           return `JP ${hex(inst.target)}`;
    case 'jp-conditional': return `JP ${u(inst.condition)},${hex(inst.target)}`;
    case 'jr':           return `JR ${hex(inst.target)}`;
    case 'jr-conditional': return `JR ${u(inst.condition)},${hex(inst.target)}`;
    case 'ret':          return 'RET';
    case 'ret-conditional': return `RET ${u(inst.condition)}`;
    case 'push':         return `PUSH ${u(inst.pair)}`;
    case 'pop':          return `POP ${u(inst.pair)}`;
    case 'ld-pair-imm':  return `LD ${u(inst.pair)},${hex(inst.value)}`;
    case 'ld-pair-mem':
      if (inst.direction === 'to-mem') return `LD (${hex(inst.addr)}),${u(inst.pair)}`;
      return `LD ${u(inst.pair)},(${hex(inst.addr)})`;
    case 'ld-reg-imm':   return `LD ${u(inst.dest)},${hex(inst.value, 2)}`;
    case 'ld-reg-mem':   return `LD ${u(inst.dest)},(${hex(inst.addr)})`;
    case 'ld-mem-reg':   return `LD (${hex(inst.addr)}),${u(inst.src)}`;
    case 'ld-reg-reg':   return `LD ${u(inst.dest)},${u(inst.src)}`;
    case 'ld-reg-ixd':   return `LD ${u(inst.dest)},(IX${formatDisp(inst.displacement)})`;
    case 'ld-ixd-reg':   return `LD (IX${formatDisp(inst.displacement)}),${u(inst.src)}`;
    case 'ld-reg-iyd':   return `LD ${u(inst.dest)},(IY${formatDisp(inst.displacement)})`;
    case 'ld-iyd-reg':   return `LD (IY${formatDisp(inst.displacement)}),${u(inst.src)}`;
    case 'inc-pair':     return `INC ${u(inst.pair)}`;
    case 'dec-pair':     return `DEC ${u(inst.pair)}`;
    case 'inc-reg':      return `INC ${u(inst.reg)}`;
    case 'dec-reg':      return `DEC ${u(inst.reg)}`;
    case 'alu-reg':      return `${u(inst.op)} ${u(inst.src)}`;
    case 'alu-imm':      return `${u(inst.op)} ${hex(inst.value, 2)}`;
    case 'bit-test':     return `BIT ${inst.bit},${u(inst.reg)}`;
    case 'bit-res':      return `RES ${inst.bit},${u(inst.reg)}`;
    case 'bit-set':      return `SET ${inst.bit},${u(inst.reg)}`;
    case 'indexed-cb-bit':  return `BIT ${inst.bit},(${u(inst.indexRegister)}${formatDisp(inst.displacement)})`;
    case 'indexed-cb-set':  return `SET ${inst.bit},(${u(inst.indexRegister)}${formatDisp(inst.displacement)})`;
    case 'indexed-cb-res':  return `RES ${inst.bit},(${u(inst.indexRegister)}${formatDisp(inst.displacement)})`;
    case 'ld-sp-pair':   return `LD SP,${u(inst.pair)}`;
    case 'di':           return 'DI';
    case 'ei':           return 'EI';
    case 'nop':          return 'NOP';
    case 'halt':         return 'HALT';
    case 'out-c-reg':    return `OUT (C),${u(inst.reg)}`;
    case 'in-reg-c':     return `IN ${u(inst.reg)},(C)`;
    case 'ex-sp-hl':     return 'EX (SP),HL';
    case 'ex-de-hl':     return 'EX DE,HL';
    case 'db':           return `DB ${hex(inst.value, 2)}`;
    default:             return `[${inst.tag}] ${JSON.stringify(inst)}`;
  }
}

// ── Part A: Disassemble 0x010090 ──

function decodeRange(start, end) {
  const rows = [];
  let pc = start;

  while (pc < end) {
    const inst = safeDecode(pc);
    rows.push({ pc, inst });
    if (!inst || inst.nextPc <= pc) break;
    pc = inst.nextPc;
  }

  return rows;
}

function findFunctionEnd(rows) {
  for (const { pc, inst } of rows) {
    if (inst.tag === 'ret') return pc;
  }
  return null;
}

function renderRows(rows) {
  return rows.map(({ pc, inst }) => {
    const bytes = rawBytes(pc, inst.length).padEnd(18, ' ');
    const parts = [`${hex(pc)}  ${bytes}  ${formatInstruction(inst)}`];

    // Annotate known symbols for RAM addresses
    if ((inst.tag === 'ld-reg-mem' || inst.tag === 'ld-mem-reg' || inst.tag === 'ld-pair-mem') && SYMBOLS.has(inst.addr)) {
      parts.push(`; ${SYMBOLS.get(inst.addr)}`);
    }
    if (inst.tag === 'indexed-cb-set' || inst.tag === 'indexed-cb-res' || inst.tag === 'indexed-cb-bit') {
      const base = inst.indexRegister === 'iy' ? IY_SYSTEM : null;
      if (base !== null) {
        const addr = (base + inst.displacement) >>> 0;
        if (SYMBOLS.has(addr)) parts.push(`; ${SYMBOLS.get(addr)}`);
        else parts.push(`; -> ${hex(addr)}`);
      }
    }

    return parts.join(' ');
  }).join('\n');
}

const allRows010090 = decodeRange(ENTRY, MAX_END);
const retAddr = findFunctionEnd(allRows010090);
const funcEnd = retAddr !== null ? retAddr + 1 : MAX_END;
const funcRows = allRows010090.filter(r => r.pc < funcEnd);

console.log(`=== Part A: Disassembly of 0x010090 (${funcRows.length} instructions, ends at ${hex(funcEnd - 1)}) ===`);
console.log(`Function size: ${funcEnd - ENTRY} bytes (${hex(ENTRY)}-${hex(funcEnd - 1)})`);
console.log('');
console.log(renderRows(funcRows));
console.log('');

// Collect CALL targets
const callTargets = [];
const branchTargets = [];
const ramReads = [];
const ramWrites = [];
const portOps = [];

for (const { pc, inst } of funcRows) {
  if (inst.tag === 'call' || inst.tag === 'call-conditional') {
    callTargets.push({ pc, target: inst.target, cond: inst.condition ?? null });
  }
  if (inst.tag === 'jp' || inst.tag === 'jp-conditional' || inst.tag === 'jr' || inst.tag === 'jr-conditional') {
    branchTargets.push({ pc, target: inst.target, cond: inst.condition ?? null, tag: inst.tag });
  }
  if (inst.tag === 'ld-reg-mem' && inst.addr >= 0xD00000) {
    ramReads.push({ pc, addr: inst.addr, reg: inst.dest });
  }
  if (inst.tag === 'ld-mem-reg' && inst.addr >= 0xD00000) {
    ramWrites.push({ pc, addr: inst.addr, reg: inst.src });
  }
  if (inst.tag === 'ld-pair-mem' && inst.addr >= 0xD00000) {
    if (inst.direction === 'to-mem') ramWrites.push({ pc, addr: inst.addr, reg: inst.pair });
    else ramReads.push({ pc, addr: inst.addr, reg: inst.pair });
  }
  if (inst.tag === 'ld-reg-ixd') {
    ramReads.push({ pc, addr: `IX${formatDisp(inst.displacement)}`, reg: inst.dest });
  }
  if (inst.tag === 'ld-ixd-reg') {
    ramWrites.push({ pc, addr: `IX${formatDisp(inst.displacement)}`, reg: inst.src });
  }
  if (inst.tag === 'indexed-cb-set' || inst.tag === 'indexed-cb-res' || inst.tag === 'indexed-cb-bit') {
    const base = inst.indexRegister === 'iy' ? IY_SYSTEM : null;
    if (base !== null) {
      const resolved = (base + inst.displacement) >>> 0;
      const kind = inst.tag === 'indexed-cb-bit' ? 'reads' : 'writes';
      (kind === 'reads' ? ramReads : ramWrites).push({ pc, addr: resolved, reg: `bit${inst.bit}` });
    }
  }
  if (inst.tag === 'in-reg-c' || inst.tag === 'out-c-reg') {
    portOps.push({ pc, tag: inst.tag, reg: inst.reg });
  }
}

console.log('--- CALL targets ---');
for (const c of callTargets) {
  console.log(`  ${hex(c.pc)}: CALL ${c.cond ? c.cond + ',' : ''}${hex(c.target)}`);
}

console.log('--- Branch targets ---');
for (const b of branchTargets) {
  console.log(`  ${hex(b.pc)}: ${b.tag.toUpperCase()} ${b.cond ? b.cond + ',' : ''}${hex(b.target)}`);
}

console.log('--- RAM reads ---');
for (const r of ramReads) {
  const sym = typeof r.addr === 'number' && SYMBOLS.has(r.addr) ? ` (${SYMBOLS.get(r.addr)})` : '';
  console.log(`  ${hex(r.pc)}: ${r.reg} <- ${typeof r.addr === 'number' ? hex(r.addr) : r.addr}${sym}`);
}

console.log('--- RAM writes ---');
for (const w of ramWrites) {
  const sym = typeof w.addr === 'number' && SYMBOLS.has(w.addr) ? ` (${SYMBOLS.get(w.addr)})` : '';
  console.log(`  ${hex(w.pc)}: ${typeof w.addr === 'number' ? hex(w.addr) : w.addr} <- ${w.reg}${sym}`);
}

console.log('--- Port I/O ---');
for (const p of portOps) {
  console.log(`  ${hex(p.pc)}: ${p.tag} ${p.reg}`);
}

// ── Part B: Scan ROM for D000BF references ──

console.log('');
console.log('=== Part B: All ROM references to D000BF ===');
console.log('');

function scanPattern(pattern, label) {
  const hits = [];
  for (let pc = 0; pc <= rom.length - pattern.length; pc++) {
    let matched = true;
    for (let i = 0; i < pattern.length; i++) {
      if (pattern[i] !== null && rom[pc + i] !== pattern[i]) {
        matched = false;
        break;
      }
    }
    if (matched) hits.push(pc);
  }
  return hits;
}

// Direct absolute addressing: LD A,(D000BF) = 3A BF 00 D0
const ldAFromD000BF = scanPattern([0x3A, 0xBF, 0x00, 0xD0], 'LD A,(D000BF)');
// LD (D000BF),A = 32 BF 00 D0
const ldD000BFFromA = scanPattern([0x32, 0xBF, 0x00, 0xD0], 'LD (D000BF),A');

// IY-relative bit ops: FD CB 3F xx where IY=D00080 => D000BF
// BIT n,(IY+0x3F) = FD CB 3F (46+n*8): n=0:46, n=1:4E, n=2:56, n=3:5E, n=4:66, n=5:6E, n=6:76, n=7:7E
// SET n,(IY+0x3F) = FD CB 3F (C6+n*8): n=0:C6, n=1:CE, n=2:D6, n=3:DE, n=4:E6, n=5:EE, n=6:F6, n=7:FE
// RES n,(IY+0x3F) = FD CB 3F (86+n*8): n=0:86, n=1:8E, n=2:96, n=3:9E, n=4:A6, n=5:AE, n=6:B6, n=7:BE

const iyBitOps = [];
const iyPrefix = [0xFD, 0xCB, 0x3F];
const iyHits = scanPattern(iyPrefix, 'IY+0x3F prefix');

for (const pc of iyHits) {
  if (pc + 3 >= rom.length) continue;
  const opcode = rom[pc + 3];
  let type, bit;

  if (opcode >= 0x40 && opcode <= 0x7F) {
    // BIT range
    bit = (opcode - 0x40) >> 3;
    const reg = (opcode - 0x40) & 7;
    if (reg === 6) { // (IY+d)
      type = 'BIT';
    } else continue;
  } else if (opcode >= 0x80 && opcode <= 0xBF) {
    bit = (opcode - 0x80) >> 3;
    const reg = (opcode - 0x80) & 7;
    if (reg === 6) {
      type = 'RES';
    } else continue;
  } else if (opcode >= 0xC0 && opcode <= 0xFF) {
    bit = (opcode - 0xC0) >> 3;
    const reg = (opcode - 0xC0) & 7;
    if (reg === 6) {
      type = 'SET';
    } else continue;
  } else {
    continue;
  }

  iyBitOps.push({ pc, type, bit, opcode });
}

// Also scan for LD HL/DE/BC,(D000BF) and LD (D000BF),HL/DE/BC
// ED xx BF 00 D0 patterns for 24-bit pair loads
const pairLoadPatterns = [
  { pattern: [0xED, 0x07, 0xBF, 0x00, 0xD0], label: 'LD BC,(D000BF)' },   // ED 4B in z80, ED 07 in eZ80 ADL
  { pattern: [0xED, 0x17, 0xBF, 0x00, 0xD0], label: 'LD DE,(D000BF)' },
  { pattern: [0xED, 0x27, 0xBF, 0x00, 0xD0], label: 'LD HL,(D000BF)' },
  { pattern: [0xED, 0x37, 0xBF, 0x00, 0xD0], label: 'LD IX,(D000BF)' },   // unlikely
  { pattern: [0xED, 0x4B, 0xBF, 0x00, 0xD0], label: 'LD BC,(D000BF) [z80]' },
  { pattern: [0xED, 0x5B, 0xBF, 0x00, 0xD0], label: 'LD DE,(D000BF) [z80]' },
  { pattern: [0xED, 0x6B, 0xBF, 0x00, 0xD0], label: 'LD HL,(D000BF) [z80]' },
];

const pairHits = [];
for (const { pattern, label } of pairLoadPatterns) {
  for (const pc of scanPattern(pattern, label)) {
    pairHits.push({ pc, label });
  }
}

// Print results
console.log('--- LD A,(D000BF) = 3A BF 00 D0 ---');
for (const pc of ldAFromD000BF) {
  console.log(`  ${hex(pc)}: LD A,(0xD000BF)   bytes: ${rawBytes(pc, 4)}`);
}
console.log(`  Total: ${ldAFromD000BF.length}`);

console.log('');
console.log('--- LD (D000BF),A = 32 BF 00 D0 ---');
for (const pc of ldD000BFFromA) {
  console.log(`  ${hex(pc)}: LD (0xD000BF),A   bytes: ${rawBytes(pc, 4)}`);
}
console.log(`  Total: ${ldD000BFFromA.length}`);

console.log('');
console.log('--- IY+0x3F bit ops (IY=D00080 -> D000BF) ---');
for (const op of iyBitOps) {
  console.log(`  ${hex(op.pc)}: ${op.type} ${op.bit},(IY+0x3F)   opcode byte: ${hexByte(op.opcode)}   bytes: ${rawBytes(op.pc, 4)}`);
}
console.log(`  Total: ${iyBitOps.length}`);

console.log('');
console.log('--- Pair loads involving D000BF ---');
for (const h of pairHits) {
  console.log(`  ${hex(h.pc)}: ${h.label}   bytes: ${rawBytes(h.pc, 5)}`);
}
console.log(`  Total: ${pairHits.length}`);

// ── Context: decode a few instructions around each D000BF reference ──

console.log('');
console.log('=== Context around D000BF references ===');

const allD000BFRefs = [
  ...ldAFromD000BF.map(pc => ({ pc, label: 'LD A,(D000BF)' })),
  ...ldD000BFFromA.map(pc => ({ pc, label: 'LD (D000BF),A' })),
  ...iyBitOps.map(op => ({ pc: op.pc, label: `${op.type} ${op.bit},(IY+0x3F)` })),
  ...pairHits.map(h => ({ pc: h.pc, label: h.label })),
].sort((a, b) => a.pc - b.pc);

for (const ref of allD000BFRefs) {
  console.log('');
  console.log(`--- ${hex(ref.pc)}: ${ref.label} ---`);

  // Decode 5 instructions before and 5 after for context
  const contextStart = Math.max(0, ref.pc - 15);
  const contextEnd = Math.min(rom.length, ref.pc + 20);
  const contextRows = decodeRange(contextStart, contextEnd);

  // Find the row closest to but not past the ref PC, then show a window
  const refIdx = contextRows.findIndex(r => r.pc >= ref.pc);
  const startIdx = Math.max(0, refIdx - 3);
  const endIdx = Math.min(contextRows.length, refIdx + 4);
  const window = contextRows.slice(startIdx, endIdx);

  for (const { pc, inst } of window) {
    const marker = pc === ref.pc ? ' >>>' : '    ';
    const bytes = rawBytes(pc, inst.length).padEnd(18, ' ');
    console.log(`${marker} ${hex(pc)}  ${bytes}  ${formatInstruction(inst)}`);
  }
}

// ── Build bit usage summary ──

console.log('');
console.log('=== D000BF Bit Usage Summary ===');

const bitUsage = new Map();
for (let b = 0; b < 8; b++) {
  bitUsage.set(b, { bit: [], set: [], res: [] });
}

for (const op of iyBitOps) {
  const key = op.type.toLowerCase();
  bitUsage.get(op.bit)[key].push(op.pc);
}

for (let b = 0; b < 8; b++) {
  const u = bitUsage.get(b);
  const total = u.bit.length + u.set.length + u.res.length;
  if (total === 0) continue;
  console.log(`  Bit ${b}: BIT(${u.bit.length}) SET(${u.set.length}) RES(${u.res.length})`);
  if (u.bit.length > 0) console.log(`    BIT: ${u.bit.map(p => hex(p)).join(', ')}`);
  if (u.set.length > 0) console.log(`    SET: ${u.set.map(p => hex(p)).join(', ')}`);
  if (u.res.length > 0) console.log(`    RES: ${u.res.map(p => hex(p)).join(', ')}`);
}

// Also account for byte-level reads/writes
console.log('');
console.log(`  Byte-level reads (LD A,(D000BF)): ${ldAFromD000BF.length} at ${ldAFromD000BF.map(p => hex(p)).join(', ')}`);
console.log(`  Byte-level writes (LD (D000BF),A): ${ldD000BFFromA.length} at ${ldD000BFFromA.map(p => hex(p)).join(', ')}`);

// ── Generate Report ──

const totalRefs = allD000BFRefs.length;
const funcSize = funcEnd - ENTRY;

const report = [];
report.push('# Phase 419: Trace 0x010090 + Map D000BF LCD/DMA Control Byte');
report.push('');
report.push('## Part A: 0x010090 Function Trace');
report.push('');
report.push(`- **Address range**: ${hex(ENTRY)}-${hex(funcEnd - 1)}`);
report.push(`- **Size**: ${funcSize} bytes`);
report.push(`- **Instructions**: ${funcRows.length}`);
report.push(`- **CALL targets**: ${callTargets.length}`);
report.push(`- **Branch targets**: ${branchTargets.length}`);
report.push(`- **Port I/O**: ${portOps.length}`);
report.push('');
report.push('### Disassembly');
report.push('');
report.push('```text');
report.push(renderRows(funcRows));
report.push('```');
report.push('');

report.push('### CALL Targets');
report.push('');
report.push('| Address | Target | Condition |');
report.push('| --- | --- | --- |');
for (const c of callTargets) {
  report.push(`| ${hex(c.pc)} | ${hex(c.target)} | ${c.cond ?? 'unconditional'} |`);
}
report.push('');

report.push('### RAM Reads');
report.push('');
report.push('| Address | Source | Register |');
report.push('| --- | --- | --- |');
for (const r of ramReads) {
  const addrStr = typeof r.addr === 'number' ? hex(r.addr) : r.addr;
  const sym = typeof r.addr === 'number' && SYMBOLS.has(r.addr) ? SYMBOLS.get(r.addr) : '';
  report.push(`| ${hex(r.pc)} | ${addrStr} ${sym} | ${r.reg} |`);
}
report.push('');

report.push('### RAM Writes');
report.push('');
report.push('| Address | Target | Register |');
report.push('| --- | --- | --- |');
for (const w of ramWrites) {
  const addrStr = typeof w.addr === 'number' ? hex(w.addr) : w.addr;
  const sym = typeof w.addr === 'number' && SYMBOLS.has(w.addr) ? SYMBOLS.get(w.addr) : '';
  report.push(`| ${hex(w.pc)} | ${addrStr} ${sym} | ${w.reg} |`);
}
report.push('');

report.push('### Branch Targets');
report.push('');
report.push('| Address | Type | Target | Condition |');
report.push('| --- | --- | --- | --- |');
for (const b of branchTargets) {
  report.push(`| ${hex(b.pc)} | ${b.tag} | ${hex(b.target)} | ${b.cond ?? 'unconditional'} |`);
}
report.push('');

report.push('## Part B: D000BF Reference Map');
report.push('');
report.push(`- **Total references**: ${totalRefs}`);
report.push(`- **Byte reads** (LD A,(D000BF)): ${ldAFromD000BF.length}`);
report.push(`- **Byte writes** (LD (D000BF),A): ${ldD000BFFromA.length}`);
report.push(`- **IY-relative bit ops** (IY+0x3F): ${iyBitOps.length}`);
report.push(`- **Pair loads**: ${pairHits.length}`);
report.push('');

report.push('### All References (sorted by address)');
report.push('');
report.push('| Address | Instruction | Type |');
report.push('| --- | --- | --- |');
for (const ref of allD000BFRefs) {
  const type = ref.label.startsWith('LD A') ? 'read' :
               ref.label.startsWith('LD (') ? 'write' :
               ref.label.startsWith('BIT') ? 'test' :
               ref.label.startsWith('SET') ? 'set' :
               ref.label.startsWith('RES') ? 'clear' : 'other';
  report.push(`| ${hex(ref.pc)} | ${ref.label} | ${type} |`);
}
report.push('');

report.push('### Bit Usage Summary');
report.push('');
report.push('| Bit | BIT (test) | SET | RES |');
report.push('| --- | --- | --- | --- |');
for (let b = 0; b < 8; b++) {
  const u = bitUsage.get(b);
  const total = u.bit.length + u.set.length + u.res.length;
  if (total > 0) {
    report.push(`| ${b} | ${u.bit.length} | ${u.set.length} | ${u.res.length} |`);
  }
}
report.push('');

if (ldAFromD000BF.length > 0 || ldD000BFFromA.length > 0) {
  report.push('### Byte-Level Access Sites');
  report.push('');
  if (ldAFromD000BF.length > 0) {
    report.push(`- **Reads**: ${ldAFromD000BF.map(p => hex(p)).join(', ')}`);
  }
  if (ldD000BFFromA.length > 0) {
    report.push(`- **Writes**: ${ldD000BFFromA.map(p => hex(p)).join(', ')}`);
  }
  report.push('');
}

report.push('### Context Snippets');
report.push('');
for (const ref of allD000BFRefs) {
  report.push(`#### ${hex(ref.pc)}: ${ref.label}`);
  report.push('');
  report.push('```text');

  const contextStart = Math.max(0, ref.pc - 15);
  const contextEnd = Math.min(rom.length, ref.pc + 20);
  const contextRows = decodeRange(contextStart, contextEnd);
  const refIdx = contextRows.findIndex(r => r.pc >= ref.pc);
  const startIdx = Math.max(0, refIdx - 3);
  const endIdx = Math.min(contextRows.length, refIdx + 4);
  const window = contextRows.slice(startIdx, endIdx);

  for (const { pc, inst } of window) {
    const marker = pc === ref.pc ? '>>>' : '   ';
    const bytes = rawBytes(pc, inst.length).padEnd(18, ' ');
    report.push(`${marker} ${hex(pc)}  ${bytes}  ${formatInstruction(inst)}`);
  }

  report.push('```');
  report.push('');
}

report.push('## Analysis');
report.push('');
report.push('See report for full analysis (written by probe, then enriched manually).');
report.push('');

const reportText = report.join('\n');
writeFileSync(reportPath, reportText);
console.log('');
console.log(`Report written to: ${reportPath}`);

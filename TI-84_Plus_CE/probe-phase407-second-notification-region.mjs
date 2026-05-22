#!/usr/bin/env node

// Phase 407: Decode second notification handler region (0x008800-0x008960)
// Region contains writers to D177B8 (notification payload byte).
// Goals: find all writers, trace what they store, find table structure,
// identify callers from entire ROM, check for D177B9 reads.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

process.emitWarning = () => {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = 'TI-84_Plus_CE/ROM.rom';
const DECODER_PATH = path.join(__dirname, 'ez80-decoder.js');
const { decodeInstruction } = await import(pathToFileURL(DECODER_PATH).href);
const rom = fs.readFileSync(ROM_PATH);

const MODE = 'adl';
const REGION_START = 0x008800;
const REGION_END = 0x008960;
const REGION_SIZE = REGION_END - REGION_START;

// ---- helpers ----

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return (value & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

function read24(offset) {
  if (offset + 2 >= rom.length) return 0;
  return rom[offset] | (rom[offset + 1] << 8) | (rom[offset + 2] << 16);
}

function formatBytes(pc, length) {
  return Array.from(
    rom.subarray(pc, pc + length),
    (b) => b.toString(16).toUpperCase().padStart(2, '0'),
  ).join(' ');
}

function formatIndexed(indexRegister, displacement) {
  const sign = displacement >= 0 ? '+' : '-';
  return `(${String(indexRegister).toUpperCase()}${sign}${hexByte(Math.abs(displacement))})`;
}

function decodeSafe(pc) {
  try {
    const inst = decodeInstruction(rom, pc, MODE);
    return inst && inst.length ? inst : null;
  } catch {
    return null;
  }
}

function formatInstruction(inst) {
  const prefix = inst.modePrefix ? `${String(inst.modePrefix).toUpperCase()} ` : '';

  switch (inst.tag) {
    case 'nop': return `${prefix}NOP`;
    case 'di': return `${prefix}DI`;
    case 'ei': return `${prefix}EI`;
    case 'halt': return `${prefix}HALT`;
    case 'push': return `${prefix}PUSH ${String(inst.pair).toUpperCase()}`;
    case 'pop': return `${prefix}POP ${String(inst.pair).toUpperCase()}`;
    case 'call': return `${prefix}CALL ${hex(inst.target)}`;
    case 'call-conditional': return `${prefix}CALL ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jp': return `${prefix}JP ${hex(inst.target)}`;
    case 'jp-conditional': return `${prefix}JP ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jp-indirect': return `${prefix}JP (${String(inst.indirectRegister).toUpperCase()})`;
    case 'jr': return `${prefix}JR ${hex(inst.target)}`;
    case 'jr-conditional': return `${prefix}JR ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'ret': return `${prefix}RET`;
    case 'ret-conditional': return `${prefix}RET ${String(inst.condition).toUpperCase()}`;
    case 'reti': return `${prefix}RETI`;
    case 'retn': return `${prefix}RETN`;
    case 'rst': return `${prefix}RST ${hex(inst.target, 2)}`;
    case 'ld-reg-reg': return `${prefix}LD ${String(inst.dest).toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    case 'ld-reg-imm': return `${prefix}LD ${String(inst.dest).toUpperCase()}, ${hexByte(inst.value)}`;
    case 'ld-pair-imm': return `${prefix}LD ${String(inst.pair).toUpperCase()}, ${hex(inst.value)}`;
    case 'ld-reg-mem': return `${prefix}LD ${String(inst.dest).toUpperCase()}, (${hex(inst.addr)})`;
    case 'ld-mem-reg': return `${prefix}LD (${hex(inst.addr)}), ${String(inst.src).toUpperCase()}`;
    case 'ld-pair-mem': return `${prefix}LD ${String(inst.pair).toUpperCase()}, (${hex(inst.addr)})`;
    case 'ld-mem-pair': return `${prefix}LD (${hex(inst.addr)}), ${String(inst.pair).toUpperCase()}`;
    case 'ld-reg-ind': return `${prefix}LD ${String(inst.dest).toUpperCase()}, (${String(inst.src).toUpperCase()})`;
    case 'ld-ind-reg': return `${prefix}LD (${String(inst.dest).toUpperCase()}), ${String(inst.src).toUpperCase()}`;
    case 'ld-ind-imm': return `${prefix}LD (HL), ${hexByte(inst.value)}`;
    case 'ld-reg-ixd': return `${prefix}LD ${String(inst.dest).toUpperCase()}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-ixd-reg': return `${prefix}LD ${formatIndexed(inst.indexRegister, inst.displacement)}, ${String(inst.src).toUpperCase()}`;
    case 'ld-ixd-imm': return `${prefix}LD ${formatIndexed(inst.indexRegister, inst.displacement)}, ${hexByte(inst.value)}`;
    case 'ld-special': return `${prefix}LD ${String(inst.dest).toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    case 'ld-sp-pair': return `${prefix}LD SP, ${String(inst.pair).toUpperCase()}`;
    case 'ld-sp-hl': return `${prefix}LD SP, HL`;
    case 'alu-reg': return `${prefix}${String(inst.op).toUpperCase()} ${String(inst.src).toUpperCase()}`;
    case 'alu-imm': return `${prefix}${String(inst.op).toUpperCase()} ${hexByte(inst.value)}`;
    case 'alu-ixd': return `${prefix}${String(inst.op).toUpperCase()} ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'inc-reg': return `${prefix}INC ${String(inst.reg).toUpperCase()}`;
    case 'dec-reg': return `${prefix}DEC ${String(inst.reg).toUpperCase()}`;
    case 'inc-pair': return `${prefix}INC ${String(inst.pair).toUpperCase()}`;
    case 'dec-pair': return `${prefix}DEC ${String(inst.pair).toUpperCase()}`;
    case 'inc-ind': return `${prefix}INC (HL)`;
    case 'dec-ind': return `${prefix}DEC (HL)`;
    case 'add-pair': return `${prefix}ADD ${String(inst.dest ?? 'hl').toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    case 'adc-pair': return `${prefix}ADC HL, ${String(inst.src).toUpperCase()}`;
    case 'sbc-pair': return `${prefix}SBC HL, ${String(inst.src).toUpperCase()}`;
    case 'bit-test': return `${prefix}BIT ${inst.bit}, ${String(inst.reg).toUpperCase()}`;
    case 'bit-set': return `${prefix}SET ${inst.bit}, ${String(inst.reg).toUpperCase()}`;
    case 'bit-res': return `${prefix}RES ${inst.bit}, ${String(inst.reg).toUpperCase()}`;
    case 'bit-test-ind': return `${prefix}BIT ${inst.bit}, (${String(inst.indirectRegister).toUpperCase()})`;
    case 'bit-set-ind': return `${prefix}SET ${inst.bit}, (${String(inst.indirectRegister).toUpperCase()})`;
    case 'bit-res-ind': return `${prefix}RES ${inst.bit}, (${String(inst.indirectRegister).toUpperCase()})`;
    case 'rotate-reg': return `${prefix}${String(inst.op).toUpperCase()} ${String(inst.reg).toUpperCase()}`;
    case 'rotate-ind': return `${prefix}${String(inst.op).toUpperCase()} (${String(inst.indirectRegister).toUpperCase()})`;
    case 'indexed-cb-bit': return `${prefix}BIT ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-set': return `${prefix}SET ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-res': return `${prefix}RES ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-rotate': return `${prefix}${String(inst.operation).toUpperCase()} ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ex-de-hl': return `${prefix}EX DE, HL`;
    case 'ex-af': return `${prefix}EX AF, AF'`;
    case 'ex-sp-pair': return `${prefix}EX (SP), ${String(inst.pair).toUpperCase()}`;
    case 'exx': return `${prefix}EXX`;
    case 'djnz': return `${prefix}DJNZ ${hex(inst.target)}`;
    case 'rlca': return `${prefix}RLCA`;
    case 'rrca': return `${prefix}RRCA`;
    case 'rla': return `${prefix}RLA`;
    case 'rra': return `${prefix}RRA`;
    case 'daa': return `${prefix}DAA`;
    case 'cpl': return `${prefix}CPL`;
    case 'scf': return `${prefix}SCF`;
    case 'ccf': return `${prefix}CCF`;
    case 'neg': return `${prefix}NEG`;
    case 'ldi': return `${prefix}LDI`;
    case 'ldir': return `${prefix}LDIR`;
    case 'ldd': return `${prefix}LDD`;
    case 'lddr': return `${prefix}LDDR`;
    case 'cpi': return `${prefix}CPI`;
    case 'cpir': return `${prefix}CPIR`;
    case 'cpd': return `${prefix}CPD`;
    case 'cpdr': return `${prefix}CPDR`;
    case 'ini': return `${prefix}INI`;
    case 'outi': return `${prefix}OUTI`;
    case 'otir': return `${prefix}OTIR`;
    case 'ind': return `${prefix}IND`;
    case 'outd': return `${prefix}OUTD`;
    case 'otdr': return `${prefix}OTDR`;
    case 'in-reg': return `${prefix}IN ${String(inst.reg).toUpperCase()}, (C)`;
    case 'out-reg': return `${prefix}OUT (C), ${String(inst.reg).toUpperCase()}`;
    case 'in-imm': return `${prefix}IN A, (${hexByte(inst.port)})`;
    case 'out-imm': return `${prefix}OUT (${hexByte(inst.port)}), A`;
    case 'im': return `${prefix}IM ${inst.mode}`;
    case 'rld': return `${prefix}RLD`;
    case 'rrd': return `${prefix}RRD`;
    case 'inc-ixd': return `${prefix}INC ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'dec-ixd': return `${prefix}DEC ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'mlt': return `${prefix}MLT ${String(inst.pair).toUpperCase()}`;
    case 'tst-reg': return `${prefix}TST ${String(inst.reg).toUpperCase()}`;
    case 'tst-imm': return `${prefix}TST ${hexByte(inst.value)}`;
    case 'tstio': return `${prefix}TSTIO ${hexByte(inst.value)}`;
    case 'slp': return `${prefix}SLP`;
    case 'lea': return `${prefix}LEA ${String(inst.dest).toUpperCase()}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'pea': return `${prefix}PEA ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    default:
      return inst.mnemonic ? `${prefix}${inst.mnemonic}${inst.operands ? ` ${inst.operands}` : ''}` : `${prefix}[${inst.tag}]`;
  }
}

// Disassemble a range, recovering alignment from multiple start candidates
function recoverContextRows(endPc, maxLookback = 48) {
  const candidates = [];
  for (let start = Math.max(0, endPc - maxLookback); start < endPc; start++) {
    const rows = [];
    let pc = start;
    let ok = true;
    while (pc < endPc) {
      const inst = decodeSafe(pc);
      if (!inst || inst.nextPc > endPc) { ok = false; break; }
      rows.push({ pc, inst });
      pc = inst.nextPc;
    }
    if (ok && pc === endPc) candidates.push(rows);
  }
  candidates.sort((a, b) => b.length - a.length);
  return candidates[0] ?? [];
}

function disassembleForward(startPc, maxInstructions = 200) {
  const rows = [];
  let pc = startPc;
  for (let i = 0; i < maxInstructions && pc < REGION_END; i++) {
    const inst = decodeSafe(pc);
    if (!inst) {
      rows.push({ pc, inst: null, raw: rom[pc] });
      pc++;
      continue;
    }
    rows.push({ pc, inst });
    pc = inst.nextPc;
  }
  return rows;
}

function fmtRow(row) {
  if (!row.inst) {
    return `${hex(row.pc)}  ${hexByte(row.raw).padEnd(18)}  DB ${hexByte(row.raw)}h`;
  }
  return `${hex(row.pc)}  ${formatBytes(row.pc, row.inst.length).padEnd(18)}  ${formatInstruction(row.inst)}`;
}

// ---- 1. Full disassembly of region ----

console.log('=== Phase 407: Second Notification Region (0x008800-0x008960) ===\n');
console.log('--- Full Disassembly ---\n');

const allRows = disassembleForward(REGION_START, 500);
for (const row of allRows) {
  console.log(`  ${fmtRow(row)}`);
}

// ---- 2. Find all LD (0xD177B8),A writers via byte scan ----

console.log('\n--- D177B8 Writers (LD (0xD177B8),A = 32 B8 77 D1) ---\n');

const writers = [];
for (let i = REGION_START; i < REGION_END - 3; i++) {
  if (rom[i] === 0x32 && rom[i+1] === 0xB8 && rom[i+2] === 0x77 && rom[i+3] === 0xD1) {
    writers.push(i);
  }
}

console.log(`Found ${writers.length} writers:\n`);

for (const writerAddr of writers) {
  console.log(`  Writer at ${hex(writerAddr)}`);

  // Trace backward to find what A contains
  const traceRows = recoverContextRows(writerAddr, 30);
  let aValue = '(unknown)';

  for (let j = traceRows.length - 1; j >= 0; j--) {
    const inst = traceRows[j].inst;
    if (!inst) continue;

    // LD A, imm
    if (inst.tag === 'ld-reg-imm' && inst.dest === 'a') {
      aValue = `0x${hexByte(inst.value)}`;
      break;
    }
    // LD A, (nn)
    if (inst.tag === 'ld-reg-mem' && inst.dest === 'a') {
      aValue = `loaded from (${hex(inst.addr)})`;
      break;
    }
    // LD A, reg
    if (inst.tag === 'ld-reg-reg' && inst.dest === 'a') {
      aValue = `from ${String(inst.src).toUpperCase()}`;
      break;
    }
    // LD A, (HL)/(DE)/(BC)
    if (inst.tag === 'ld-reg-ind' && inst.dest === 'a') {
      aValue = `loaded from (${String(inst.src).toUpperCase()})`;
      break;
    }
    // XOR A
    if (inst.tag === 'alu-reg' && inst.op === 'xor' && inst.src === 'a') {
      aValue = '0x00 (XOR A)';
      break;
    }
    // INC A / DEC A
    if (inst.tag === 'inc-reg' && inst.reg === 'a') { aValue = 'A+1'; break; }
    if (inst.tag === 'dec-reg' && inst.reg === 'a') { aValue = 'A-1'; break; }
    // ALU imm
    if (inst.tag === 'alu-imm' && (inst.op === 'sub' || inst.op === 'add' || inst.op === 'and' || inst.op === 'or')) {
      aValue = `A ${inst.op} 0x${hexByte(inst.value)}`;
      break;
    }
    // CALL - A set by return value
    if (inst.tag === 'call' || inst.tag === 'call-conditional') {
      aValue = `return from CALL ${hex(inst.target)}`;
      break;
    }
    // RET / JP / JR terminate trace
    if (inst.tag === 'ret' || inst.tag === 'jp') break;
  }

  console.log(`    A = ${aValue}`);
  console.log('    Context:');
  const ctx = traceRows.slice(-6);
  for (const row of ctx) {
    console.log(`      ${fmtRow(row)}`);
  }
  // Also show the writer itself
  const writerInst = decodeSafe(writerAddr);
  if (writerInst) {
    console.log(`    > ${hex(writerAddr)}  ${formatBytes(writerAddr, writerInst.length).padEnd(18)}  ${formatInstruction(writerInst)}`);
  }
  console.log();
}

// ---- 3. Find all LD A,(0xD177B9) reads ----

console.log('--- D177B9 Reads (LD A,(0xD177B9) = 3A B9 77 D1) ---\n');

const d177b9Reads = [];
for (let i = REGION_START; i < REGION_END - 3; i++) {
  if (rom[i] === 0x3A && rom[i+1] === 0xB9 && rom[i+2] === 0x77 && rom[i+3] === 0xD1) {
    d177b9Reads.push(i);
  }
}

console.log(`Found ${d177b9Reads.length} D177B9 reads:\n`);
for (const addr of d177b9Reads) {
  const before = recoverContextRows(addr, 20).slice(-3);
  const afterRows = disassembleForward(addr, 6);
  console.log(`  Read at ${hex(addr)}:`);
  for (const row of before) {
    console.log(`    ${fmtRow(row)}`);
  }
  for (const row of afterRows) {
    const marker = row.pc === addr ? ' <<<' : '';
    console.log(`    ${fmtRow(row)}${marker}`);
  }
  console.log();
}

// ---- 4. Find _seqcase table patterns ----

console.log('--- _seqcase Table Patterns ---\n');

const tablePatterns = [];
for (const row of allRows) {
  if (!row.inst) continue;
  const inst = row.inst;

  // ADD A,A
  if (inst.tag === 'alu-reg' && inst.op === 'add' && inst.src === 'a') {
    tablePatterns.push({ addr: row.pc, desc: 'ADD A,A', note: 'table index doubling' });
  }
  // JP (HL)
  if (inst.tag === 'jp-indirect' && inst.indirectRegister === 'hl') {
    tablePatterns.push({ addr: row.pc, desc: 'JP (HL)', note: 'indirect jump (table dispatch)' });
  }
  // LD HL, nn with ROM target
  if (inst.tag === 'ld-pair-imm' && inst.pair === 'hl' && inst.value < rom.length && inst.value > 0x100) {
    tablePatterns.push({ addr: row.pc, desc: `LD HL, ${hex(inst.value)}`, note: 'potential table base' });
  }
  // SUB n
  if (inst.tag === 'alu-imm' && inst.op === 'sub') {
    tablePatterns.push({ addr: row.pc, desc: `SUB ${hexByte(inst.value)}h`, note: 'range adjust' });
  }
  // CP n
  if (inst.tag === 'alu-imm' && inst.op === 'cp') {
    tablePatterns.push({ addr: row.pc, desc: `CP ${hexByte(inst.value)}h`, note: 'range check' });
  }
}

if (tablePatterns.length === 0) {
  console.log('  No _seqcase patterns found.\n');
} else {
  for (const p of tablePatterns) {
    console.log(`  ${hex(p.addr)}  ${p.desc.padEnd(24)}  ${p.note}`);
  }
  console.log();
}

// ---- 5. Find CALL/JP targets within and leaving the region ----

console.log('--- CALL/JP Targets From Region ---\n');

const callTargets = [];
for (const row of allRows) {
  if (!row.inst) continue;
  const inst = row.inst;

  if (inst.tag === 'call' || inst.tag === 'call-conditional') {
    const within = inst.target >= REGION_START && inst.target < REGION_END;
    callTargets.push({ from: row.pc, target: inst.target, type: inst.tag === 'call' ? 'CALL' : `CALL ${inst.condition}`, within });
  }
  if (inst.tag === 'jp' || inst.tag === 'jp-conditional') {
    const within = inst.target >= REGION_START && inst.target < REGION_END;
    callTargets.push({ from: row.pc, target: inst.target, type: inst.tag === 'jp' ? 'JP' : `JP ${inst.condition}`, within });
  }
  if (inst.tag === 'jr' || inst.tag === 'jr-conditional') {
    const within = inst.target >= REGION_START && inst.target < REGION_END;
    callTargets.push({ from: row.pc, target: inst.target, type: inst.tag === 'jr' ? 'JR' : `JR ${inst.condition}`, within });
  }
}

const internal = callTargets.filter(c => c.within);
const external = callTargets.filter(c => !c.within);

console.log(`  Internal targets (within region): ${internal.length}`);
for (const c of internal) {
  console.log(`    ${hex(c.from)} ${c.type} -> ${hex(c.target)}`);
}
console.log(`\n  External targets (leaving region): ${external.length}`);
for (const c of external) {
  console.log(`    ${hex(c.from)} ${c.type} -> ${hex(c.target)}`);
}
console.log();

// ---- 6. Scan ENTIRE ROM for callers into this region ----

console.log('--- ROM-Wide Callers Into Region (0x008800-0x008960) ---\n');

const callers = [];
for (let i = 0; i < rom.length - 3; i++) {
  const opcode = rom[i];
  if (opcode !== 0xCD && opcode !== 0xC3) continue;
  const target = rom[i+1] | (rom[i+2] << 8) | (rom[i+3] << 16);
  if (target >= REGION_START && target < REGION_END) {
    const callerInRegion = i >= REGION_START && i < REGION_END;
    callers.push({
      from: i,
      target,
      type: opcode === 0xCD ? 'CALL' : 'JP',
      inRegion: callerInRegion,
    });
  }
}

const externalCallers = callers.filter(c => !c.inRegion);
const internalCallers = callers.filter(c => c.inRegion);

console.log(`  Total callers found: ${callers.length} (${externalCallers.length} external, ${internalCallers.length} internal)\n`);

// Group external callers by target
const byTarget = {};
for (const c of externalCallers) {
  const key = hex(c.target);
  if (!byTarget[key]) byTarget[key] = [];
  byTarget[key].push(c);
}

for (const [target, entries] of Object.entries(byTarget).sort()) {
  console.log(`  Target ${target}: ${entries.length} callers`);
  for (const c of entries) {
    const regionLabel = c.from < 0x010000 ? 'low ROM' :
                        c.from < 0x050000 ? 'mid ROM' :
                        c.from < 0x0A0000 ? 'upper ROM' : 'high ROM';
    console.log(`    ${hex(c.from)} ${c.type} (${regionLabel})`);
  }
}
console.log();

// ---- 7. Identify entry points and disassemble them ----

console.log('--- Entry Points (targets of external callers) ---\n');

const entryPoints = [...new Set(externalCallers.map(c => c.target))].sort((a, b) => a - b);
for (const ep of entryPoints) {
  const callerCount = externalCallers.filter(c => c.target === ep).length;
  const epRows = disassembleForward(ep, 12);
  console.log(`  Entry ${hex(ep)} (${callerCount} callers):`);
  for (const row of epRows.slice(0, 10)) {
    console.log(`    ${fmtRow(row)}`);
  }
  console.log();
}

// ---- 8. D177B8 reads in region ----

console.log('--- D177B8 Reads in Region (LD A,(0xD177B8) = 3A B8 77 D1) ---\n');

const d177b8Reads = [];
for (let i = REGION_START; i < REGION_END - 3; i++) {
  if (rom[i] === 0x3A && rom[i+1] === 0xB8 && rom[i+2] === 0x77 && rom[i+3] === 0xD1) {
    d177b8Reads.push(i);
  }
}

console.log(`  Found ${d177b8Reads.length} D177B8 reads in region.\n`);
for (const addr of d177b8Reads) {
  const before = recoverContextRows(addr, 20).slice(-3);
  const afterRows = disassembleForward(addr, 5);
  for (const row of before) console.log(`  ${fmtRow(row)}`);
  for (const row of afterRows) {
    const marker = row.pc === addr ? ' <<<' : '';
    console.log(`  ${fmtRow(row)}${marker}`);
  }
  console.log();
}

// ---- 9. Look for table data at LD HL targets ----

console.log('--- Table Data at LD HL Targets ---\n');

for (const p of tablePatterns) {
  if (!p.desc.startsWith('LD HL,')) continue;
  const match = p.desc.match(/0x([0-9A-F]+)/);
  if (!match) continue;
  const tableAddr = parseInt(match[1], 16);
  if (tableAddr >= rom.length || tableAddr < 0x100) continue;

  console.log(`  Table at ${hex(tableAddr)} (referenced from ${hex(p.addr)}):`);
  // Dump as 24-bit address entries (3 bytes each), up to 16 entries
  const numEntries = 16;
  for (let e = 0; e < numEntries; e++) {
    const entryAddr = tableAddr + e * 3;
    if (entryAddr + 2 >= rom.length) break;
    const val = read24(entryAddr);
    const inRom = val < rom.length && val > 0;
    console.log(`    [${e.toString().padStart(2)}] ${hex(entryAddr)}: ${hex(val)}${inRom ? ' (valid ROM addr)' : ''}`);
  }
  console.log();
}

// ---- 10. Summary ----

console.log('=== Summary ===\n');
console.log(`  Region: ${hex(REGION_START)}-${hex(REGION_END)} (${REGION_SIZE} bytes)`);
console.log(`  D177B8 writers: ${writers.length}`);
console.log(`  D177B9 reads: ${d177b9Reads.length}`);
console.log(`  D177B8 reads: ${d177b8Reads.length}`);
console.log(`  Table patterns: ${tablePatterns.length}`);
console.log(`  Entry points from external callers: ${entryPoints.length}`);
console.log(`  External callers: ${externalCallers.length}`);
console.log(`  Internal branch targets: ${internal.length}`);
console.log(`  External branch targets: ${external.length}`);

// Writer addresses for report
console.log('\n  Writer addresses:');
for (const w of writers) {
  console.log(`    ${hex(w)}`);
}

console.log('\n  Entry point addresses:');
for (const ep of entryPoints) {
  const callerCount = externalCallers.filter(c => c.target === ep).length;
  console.log(`    ${hex(ep)} (${callerCount} callers)`);
}

console.log('\nDone.');

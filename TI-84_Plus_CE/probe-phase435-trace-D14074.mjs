#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

process.emitWarning = () => {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rom = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const { decodeInstruction } = await import(pathToFileURL(path.join(__dirname, 'ez80-decoder.js')).href);

const TARGET_ADDR = 0xD14074;
const TARGET_LO = 0x74;
const TARGET_MID = 0x40;
const TARGET_HI = 0xD1;

const ADJACENT_ADDRS = {
  0xD14073: [0x73, 0x40, 0xD1],
  0xD14074: [0x74, 0x40, 0xD1],
  0xD14075: [0x75, 0x40, 0xD1],
};

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return (value & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

function formatBytes(addr, length) {
  const start = Math.max(0, addr);
  const end = Math.min(rom.length, addr + length);
  return Array.from(rom.subarray(start, end), (byte) => hexByte(byte)).join(' ');
}

function formatInstruction(inst) {
  const tag = inst.tag;
  const upper = (s) => String(s).toUpperCase();

  const withPrefix = (text) => inst.modePrefix ? `${upper(inst.modePrefix)} ${text}` : text;
  const formatImm = (v) => hex(v, v <= 0xFFFF ? 4 : 6);

  switch (tag) {
    case 'call':
      return withPrefix(`CALL ${hex(inst.target)}`);
    case 'jp':
      return withPrefix(`JP ${hex(inst.target)}`);
    case 'jp-conditional':
      return withPrefix(`JP ${upper(inst.condition)},${hex(inst.target)}`);
    case 'jr':
      return withPrefix(`JR ${hex(inst.target, 4)}`);
    case 'jr-conditional':
      return withPrefix(`JR ${upper(inst.condition)},${hex(inst.target, 4)}`);
    case 'ld-pair-imm':
      return withPrefix(`LD ${upper(inst.pair)},${formatImm(inst.value)}`);
    case 'ld-pair-mem':
      return withPrefix(`LD ${upper(inst.pair)},(${hex(inst.addr)})`);
    case 'ld-mem-pair':
      return withPrefix(`LD (${hex(inst.addr)}),${upper(inst.pair)}`);
    case 'ld-reg-imm':
      return withPrefix(`LD ${upper(inst.dest)},${hex(inst.value, 2)}`);
    case 'ld-reg-mem':
      return withPrefix(`LD ${upper(inst.dest)},(${hex(inst.addr)})`);
    case 'ld-mem-reg':
      return withPrefix(`LD (${hex(inst.addr)}),${upper(inst.src)}`);
    case 'push':
      return withPrefix(`PUSH ${upper(inst.pair)}`);
    case 'pop':
      return withPrefix(`POP ${upper(inst.pair)}`);
    case 'ld-reg-ind':
      return withPrefix(`LD ${upper(inst.dest)},(${upper(inst.src)})`);
    case 'ld-ind-reg':
      return withPrefix(`LD (${upper(inst.dest)}),${upper(inst.src)}`);
    case 'ld-reg-reg':
      return withPrefix(`LD ${upper(inst.dest)},${upper(inst.src)}`);
    case 'ret':
      return withPrefix('RET');
    case 'ret-conditional':
      return withPrefix(`RET ${upper(inst.condition)}`);
    case 'alu-reg':
      return withPrefix(`${upper(inst.op)} ${upper(inst.src)}`);
    case 'alu-imm':
      return withPrefix(`${upper(inst.op)} ${hex(inst.value, 2)}`);
    case 'inc-reg':
      return withPrefix(`INC ${upper(inst.reg)}`);
    case 'dec-reg':
      return withPrefix(`DEC ${upper(inst.reg)}`);
    case 'inc-pair':
      return withPrefix(`INC ${upper(inst.pair)}`);
    case 'dec-pair':
      return withPrefix(`DEC ${upper(inst.pair)}`);
    case 'bit':
      return withPrefix(`BIT ${inst.bit},${upper(inst.reg)}`);
    case 'set':
      return withPrefix(`SET ${inst.bit},${upper(inst.reg)}`);
    case 'res':
      return withPrefix(`RES ${inst.bit},${upper(inst.reg)}`);
    default:
      return `${tag} ${JSON.stringify(inst)}`;
  }
}

// Scan for 3-byte LE pattern in ROM
function scanPattern(lo, mid, hi) {
  const hits = [];
  for (let i = 0; i < rom.length - 2; i++) {
    if (rom[i] === lo && rom[i + 1] === mid && rom[i + 2] === hi) {
      hits.push(i);
    }
  }
  return hits;
}

// Classify a reference to D14074 based on the preceding opcode byte(s)
function classifyReference(pos) {
  // pos is the position of the first byte of the 3-byte address literal
  // The opcode is at pos-1 (or pos-2 for ED-prefixed)

  const b_m1 = pos >= 1 ? rom[pos - 1] : -1;
  const b_m2 = pos >= 2 ? rom[pos - 2] : -1;
  const b_m3 = pos >= 3 ? rom[pos - 3] : -1;
  const b_m4 = pos >= 4 ? rom[pos - 4] : -1;

  // Standard LD A,(nn) = 0x3A nn nn nn
  if (b_m1 === 0x3A) {
    return { type: 'READ', instr: 'LD A,(D14074)', instrStart: pos - 1, instrLen: 4 };
  }

  // Standard LD (nn),A = 0x32 nn nn nn
  if (b_m1 === 0x32) {
    return { type: 'WRITE', instr: 'LD (D14074),A', instrStart: pos - 1, instrLen: 4 };
  }

  // LD HL,(nn) = 0x2A nn nn nn
  if (b_m1 === 0x2A) {
    return { type: 'READ', instr: 'LD HL,(D14074)', instrStart: pos - 1, instrLen: 4 };
  }

  // LD (nn),HL = 0x22 nn nn nn
  if (b_m1 === 0x22) {
    return { type: 'WRITE', instr: 'LD (D14074),HL', instrStart: pos - 1, instrLen: 4 };
  }

  // LD BC,nn = 0x01 nn nn nn (loading address as immediate)
  if (b_m1 === 0x01) {
    return { type: 'ADDR_LOAD', instr: 'LD BC,D14074', instrStart: pos - 1, instrLen: 4 };
  }

  // LD DE,nn = 0x11 nn nn nn
  if (b_m1 === 0x11) {
    return { type: 'ADDR_LOAD', instr: 'LD DE,D14074', instrStart: pos - 1, instrLen: 4 };
  }

  // LD HL,nn = 0x21 nn nn nn
  if (b_m1 === 0x21) {
    return { type: 'ADDR_LOAD', instr: 'LD HL,D14074', instrStart: pos - 1, instrLen: 4 };
  }

  // LD SP,nn = 0x31 nn nn nn
  if (b_m1 === 0x31) {
    return { type: 'ADDR_LOAD', instr: 'LD SP,D14074', instrStart: pos - 1, instrLen: 4 };
  }

  // CALL nn = 0xCD nn nn nn (address as call target -- unlikely for RAM addr)
  if (b_m1 === 0xCD) {
    return { type: 'CALL_TARGET', instr: 'CALL D14074', instrStart: pos - 1, instrLen: 4 };
  }

  // JP nn = 0xC3 nn nn nn
  if (b_m1 === 0xC3) {
    return { type: 'JP_TARGET', instr: 'JP D14074', instrStart: pos - 1, instrLen: 4 };
  }

  // ED-prefixed instructions (pos-2 = 0xED)
  if (b_m2 === 0xED) {
    const edOp = b_m1;
    // LD BC,(nn) = ED 4B nn nn nn
    if (edOp === 0x4B) return { type: 'READ', instr: 'LD BC,(D14074)', instrStart: pos - 2, instrLen: 5 };
    // LD DE,(nn) = ED 5B nn nn nn
    if (edOp === 0x5B) return { type: 'READ', instr: 'LD DE,(D14074)', instrStart: pos - 2, instrLen: 5 };
    // LD HL,(nn) = ED 6B nn nn nn (alternate)
    if (edOp === 0x6B) return { type: 'READ', instr: 'LD HL,(D14074) [ED]', instrStart: pos - 2, instrLen: 5 };
    // LD SP,(nn) = ED 7B nn nn nn
    if (edOp === 0x7B) return { type: 'READ', instr: 'LD SP,(D14074)', instrStart: pos - 2, instrLen: 5 };
    // LD (nn),BC = ED 43 nn nn nn
    if (edOp === 0x43) return { type: 'WRITE', instr: 'LD (D14074),BC', instrStart: pos - 2, instrLen: 5 };
    // LD (nn),DE = ED 53 nn nn nn
    if (edOp === 0x53) return { type: 'WRITE', instr: 'LD (D14074),DE', instrStart: pos - 2, instrLen: 5 };
    // LD (nn),HL = ED 63 nn nn nn (alternate)
    if (edOp === 0x63) return { type: 'WRITE', instr: 'LD (D14074),HL [ED]', instrStart: pos - 2, instrLen: 5 };
    // LD (nn),SP = ED 73 nn nn nn
    if (edOp === 0x73) return { type: 'WRITE', instr: 'LD (D14074),SP', instrStart: pos - 2, instrLen: 5 };
  }

  // SIS/SIL/LIS/LIL mode prefixes before opcode
  // 0x40=SIS, 0x49=LIS, 0x52=SIL, 0x5B=LIL
  const modePrefixes = [0x40, 0x49, 0x52, 0x5B];
  if (modePrefixes.includes(b_m2)) {
    // Mode prefix at pos-2, opcode at pos-1
    const prefix = b_m2 === 0x40 ? 'SIS' : b_m2 === 0x49 ? 'LIS' : b_m2 === 0x52 ? 'SIL' : 'LIL';
    if (b_m1 === 0x3A) return { type: 'READ', instr: `${prefix} LD A,(D14074)`, instrStart: pos - 2, instrLen: 5 };
    if (b_m1 === 0x32) return { type: 'WRITE', instr: `${prefix} LD (D14074),A`, instrStart: pos - 2, instrLen: 5 };
    if (b_m1 === 0x2A) return { type: 'READ', instr: `${prefix} LD HL,(D14074)`, instrStart: pos - 2, instrLen: 5 };
    if (b_m1 === 0x22) return { type: 'WRITE', instr: `${prefix} LD (D14074),HL`, instrStart: pos - 2, instrLen: 5 };
  }

  // Conditional JP nn variants: C2/CA/D2/DA/E2/EA/F2/FA
  const condJpOpcodes = { 0xC2: 'NZ', 0xCA: 'Z', 0xD2: 'NC', 0xDA: 'C', 0xE2: 'PO', 0xEA: 'PE', 0xF2: 'P', 0xFA: 'M' };
  if (b_m1 in condJpOpcodes) {
    return { type: 'JP_TARGET', instr: `JP ${condJpOpcodes[b_m1]},D14074`, instrStart: pos - 1, instrLen: 4 };
  }

  // Conditional CALL nn variants: C4/CC/D4/DC/E4/EC/F4/FC
  const condCallOpcodes = { 0xC4: 'NZ', 0xCC: 'Z', 0xD4: 'NC', 0xDC: 'C', 0xE4: 'PO', 0xEC: 'PE', 0xF4: 'P', 0xFC: 'M' };
  if (b_m1 in condCallOpcodes) {
    return { type: 'CALL_TARGET', instr: `CALL ${condCallOpcodes[b_m1]},D14074`, instrStart: pos - 1, instrLen: 4 };
  }

  return { type: 'UNKNOWN', instr: `??? (prev bytes: ${formatBytes(pos - 4, 4)})`, instrStart: pos - 1, instrLen: 4 };
}

// Find the containing function by scanning backward for a RET or function prologue
function findContainingFunction(pos) {
  // Scan backward up to 2048 bytes looking for RET (0xC9) or PUSH IX (0xDD 0xE5)
  // The function likely starts just after the previous RET, or at a PUSH IX
  let funcStart = null;
  let marker = null;

  for (let i = pos - 1; i >= Math.max(0, pos - 2048); i--) {
    // PUSH IX = DD E5
    if (rom[i] === 0xDD && rom[i + 1] === 0xE5) {
      funcStart = i;
      marker = 'PUSH IX';
      break;
    }
    // RET = C9 -- function likely starts at i+1
    if (rom[i] === 0xC9) {
      funcStart = i + 1;
      marker = 'after RET';
      break;
    }
  }

  return funcStart !== null
    ? { addr: funcStart, marker }
    : { addr: null, marker: 'not found' };
}

// Disassemble a window of instructions around a position
function disassembleWindow(center, before, after) {
  const instructions = [];

  // Find a reasonable start point by backing up
  let startPc = Math.max(0, center - before * 4);

  // Decode forward until we pass center + after bytes
  let pc = startPc;
  const endPc = Math.min(rom.length - 1, center + after);
  let count = 0;

  while (pc < endPc && count < 30) {
    try {
      const inst = decodeInstruction(rom, pc, 'adl');
      instructions.push(inst);
      pc = inst.nextPc;
    } catch {
      pc++;
    }
    count++;
  }

  return instructions;
}


// ========== Main scan ==========

const lines = [];
lines.push('Phase 435 - D14074 (USB Active Flag) Reference Trace');
lines.push('=====================================================');
lines.push('');
lines.push('ROM: TI-84_Plus_CE/ROM.rom');
lines.push(`Target address: ${hex(TARGET_ADDR)} (3-byte LE pattern: 74 40 D1)`);
lines.push('');

// Scan for D14074
const hits = scanPattern(TARGET_LO, TARGET_MID, TARGET_HI);
lines.push(`Total pattern matches for D14074: ${hits.length}`);
lines.push('');

// Classify each hit
const reads = [];
const writes = [];
const addrLoads = [];
const unknowns = [];
const allRefs = [];

for (const pos of hits) {
  const classification = classifyReference(pos);
  const funcInfo = findContainingFunction(pos);
  const ref = { pos, ...classification, funcInfo };
  allRefs.push(ref);

  switch (classification.type) {
    case 'READ': reads.push(ref); break;
    case 'WRITE': writes.push(ref); break;
    case 'ADDR_LOAD': addrLoads.push(ref); break;
    default: unknowns.push(ref); break;
  }
}

lines.push('Summary');
lines.push('-------');
lines.push(`  Reads:       ${reads.length}`);
lines.push(`  Writes:      ${writes.length}`);
lines.push(`  Addr loads:  ${addrLoads.length}`);
lines.push(`  Unknown/other: ${unknowns.length}`);
lines.push(`  Total:       ${allRefs.length}`);
lines.push('');

// Detail each reference
lines.push('All references to D14074');
lines.push('========================');
lines.push('');

for (const ref of allRefs) {
  const instrAddr = hex(ref.instrStart);
  const funcAddr = ref.funcInfo.addr !== null ? hex(ref.funcInfo.addr) : 'unknown';
  const funcMarker = ref.funcInfo.marker;

  lines.push(`--- Reference at pattern offset ${hex(ref.pos)} ---`);
  lines.push(`  Instruction addr: ${instrAddr}`);
  lines.push(`  Classification:    ${ref.type}`);
  lines.push(`  Instruction:       ${ref.instr}`);
  lines.push(`  Containing func:   ${funcAddr} (${funcMarker})`);
  lines.push(`  Context bytes:     ${formatBytes(ref.instrStart - 4, ref.instrLen + 8)}`);

  // Disassemble a few instructions around this reference
  const window = disassembleWindow(ref.instrStart, 3, 16);
  const relevantInsts = window.filter(
    (inst) => inst.pc >= ref.instrStart - 12 && inst.pc <= ref.instrStart + 16
  );
  lines.push('  Nearby instructions:');
  for (const inst of relevantInsts) {
    const marker = inst.pc === ref.instrStart ? ' <<< ' : '     ';
    lines.push(`  ${marker} ${hex(inst.pc)}  ${formatBytes(inst.pc, inst.length).padEnd(17)}  ${formatInstruction(inst)}`);
  }
  lines.push('');
}

// Scan adjacent addresses
lines.push('Adjacent RAM address scan');
lines.push('========================');
lines.push('');

for (const [addr, [lo, mid, hi]] of Object.entries(ADJACENT_ADDRS)) {
  if (Number(addr) === TARGET_ADDR) continue;
  const adjHits = scanPattern(lo, mid, hi);
  lines.push(`${hex(Number(addr))}: ${adjHits.length} pattern matches`);
  if (adjHits.length > 0 && adjHits.length <= 20) {
    for (const pos of adjHits) {
      const classification = classifyReference(pos);
      lines.push(`  ${hex(pos)}: ${classification.type} - ${classification.instr}`);
    }
  } else if (adjHits.length > 20) {
    lines.push(`  (too many to list individually - showing first 10)`);
    for (const pos of adjHits.slice(0, 10)) {
      const classification = classifyReference(pos);
      lines.push(`  ${hex(pos)}: ${classification.type} - ${classification.instr}`);
    }
  }
  lines.push('');
}

// Group references by containing function
lines.push('References grouped by containing function');
lines.push('=========================================');
lines.push('');

const funcGroups = new Map();
for (const ref of allRefs) {
  const key = ref.funcInfo.addr !== null ? hex(ref.funcInfo.addr) : 'unknown';
  if (!funcGroups.has(key)) funcGroups.set(key, []);
  funcGroups.get(key).push(ref);
}

for (const [funcAddr, refs] of [...funcGroups.entries()].sort()) {
  const types = refs.map((r) => r.type).join(', ');
  lines.push(`Function at ${funcAddr}: ${refs.length} ref(s) [${types}]`);
  for (const ref of refs) {
    lines.push(`  ${hex(ref.instrStart)}: ${ref.instr}`);
  }
  lines.push('');
}

// Behavioral analysis
lines.push('Behavioral analysis');
lines.push('===================');
lines.push('');
lines.push('D14074 is written by 0x00FBD1 (USB event demultiplexer):');
lines.push('  - Set to 1 on USB connect (bit 2 handler)');
lines.push('  - Cleared to 0 on USB disconnect (bit 3 handler)');
lines.push('  - Cleared to 0 on cleanup (bit 11 handler)');
lines.push('');
lines.push('Readers of D14074 gate OS behavior based on USB connection state.');
lines.push('See the detailed reference list above for all access sites.');

const output = lines.join('\n');
console.log(output);

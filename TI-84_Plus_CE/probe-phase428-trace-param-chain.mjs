#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.emitWarning = () => {};
const { decodeInstruction } = await import(new URL('./ez80-decoder.js', import.meta.url));

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rom = fs.readFileSync(path.join(__dirname, 'ROM.rom'));

const BOOTSTRAP_START = 0x00E2EB;
const BOOTSTRAP_END   = 0x00E4E7;  // Full function: 509 bytes ending at RET
const TARGET_CALLEE   = 0x00DF73;
const RAM_MIN = 0xD00000;
const RAM_MAX = 0xD1FFFF;

const KNOWN_ADDRS = new Map([
  [0xD13FD8, 'descriptor base A'],
  [0xD13FDB, 'descriptor base B'],
  [0xD13FDE, 'descriptor base C'],
  [0xD13FE1, 'descriptor base D'],
  [0xD14017, 'master descriptor source'],
  [0xD1401A, 'slab pool A'],
  [0xD1401D, 'slab pool B'],
  [0xD14020, 'slab pool C'],
  [0xD13FE4, 'conn struct +0'],
  [0xD13FED, 'connection table'],
  [0xD14420, 'fixed RAM (BC source)'],
]);

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return (value & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

function signedByte(value) {
  return value < 0x80 ? value : value - 0x100;
}

function formatBytes(addr, length) {
  return Array.from(rom.subarray(addr, addr + length), (byte) => hexByte(byte)).join(' ');
}

function upper(value) {
  return value == null ? '' : String(value).toUpperCase();
}

function withPrefix(inst, text) {
  return inst.modePrefix ? `${upper(inst.modePrefix)} ${text}` : text;
}

function formatDisp(value) {
  return value >= 0 ? `+${hex(value, 2)}` : `-${hex(-value, 2)}`;
}

function formatIndexed(base, displacement) {
  return `(${upper(base)}${formatDisp(displacement)})`;
}

function safeDecode(pc) {
  try {
    return decodeInstruction(rom, pc, 'adl');
  } catch (error) {
    return {
      pc,
      length: 1,
      nextPc: pc + 1,
      tag: 'db',
      value: rom[pc] ?? 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function formatInstructionParts(inst) {
  switch (inst.tag) {
    case 'call':
      return { mnemonic: 'CALL', operands: hex(inst.target) };
    case 'call-conditional':
      return { mnemonic: 'CALL', operands: `${upper(inst.condition)},${hex(inst.target)}` };
    case 'jp':
      return { mnemonic: 'JP', operands: hex(inst.target) };
    case 'jp-conditional':
      return { mnemonic: 'JP', operands: `${upper(inst.condition)},${hex(inst.target)}` };
    case 'jr':
      return { mnemonic: 'JR', operands: hex(inst.target) };
    case 'jr-conditional':
      return { mnemonic: 'JR', operands: `${upper(inst.condition)},${hex(inst.target)}` };
    case 'djnz':
      return { mnemonic: 'DJNZ', operands: hex(inst.target) };
    case 'ret':
      return { mnemonic: 'RET', operands: '' };
    case 'ret-conditional':
      return { mnemonic: 'RET', operands: upper(inst.condition) };
    case 'push':
      return { mnemonic: 'PUSH', operands: upper(inst.pair) };
    case 'pop':
      return { mnemonic: 'POP', operands: upper(inst.pair) };
    case 'ld-pair-imm':
      return { mnemonic: 'LD', operands: `${upper(inst.pair)},${hex(inst.value)}` };
    case 'ld-pair-mem':
      return {
        mnemonic: 'LD',
        operands: inst.direction === 'to-mem'
          ? `(${hex(inst.addr)}),${upper(inst.pair)}`
          : `${upper(inst.pair)},(${hex(inst.addr)})`,
      };
    case 'ld-reg-mem':
      return { mnemonic: 'LD', operands: `${upper(inst.dest)},(${hex(inst.addr)})` };
    case 'ld-mem-reg':
      return { mnemonic: 'LD', operands: `(${hex(inst.addr)}),${upper(inst.src)}` };
    case 'ld-reg-imm':
      return { mnemonic: 'LD', operands: `${upper(inst.dest)},${hex(inst.value, 2)}` };
    case 'ld-reg-reg':
      return { mnemonic: 'LD', operands: `${upper(inst.dest)},${upper(inst.src)}` };
    case 'ld-reg-ind':
      return { mnemonic: 'LD', operands: `${upper(inst.dest)},(${upper(inst.src)})` };
    case 'ld-ind-reg':
      return { mnemonic: 'LD', operands: `(${upper(inst.dest)}),${upper(inst.src)}` };
    case 'ld-ind-imm':
      return { mnemonic: 'LD', operands: `(HL),${hex(inst.value, 2)}` };
    case 'ld-reg-ixd':
      return { mnemonic: 'LD', operands: `${upper(inst.dest)},${formatIndexed(inst.indexRegister, inst.displacement)}` };
    case 'ld-ixd-reg':
      return { mnemonic: 'LD', operands: `${formatIndexed(inst.indexRegister, inst.displacement)},${upper(inst.src)}` };
    case 'ld-ixd-imm':
      return { mnemonic: 'LD', operands: `${formatIndexed(inst.indexRegister, inst.displacement)},${hex(inst.value, 2)}` };
    case 'ld-pair-indexed':
      return { mnemonic: 'LD', operands: `${upper(inst.pair)},${formatIndexed(inst.indexRegister, inst.displacement)}` };
    case 'ld-indexed-pair':
      return { mnemonic: 'LD', operands: `${formatIndexed(inst.indexRegister, inst.displacement)},${upper(inst.pair)}` };
    case 'ld-ixiy-indexed':
      return { mnemonic: 'LD', operands: `${upper(inst.dest)},${formatIndexed(inst.indexRegister, inst.displacement)}` };
    case 'ld-indexed-ixiy':
      return { mnemonic: 'LD', operands: `${formatIndexed(inst.indexRegister, inst.displacement)},${upper(inst.src)}` };
    case 'ld-ind-pair':
      return { mnemonic: 'LD', operands: `(${upper(inst.dest)}),${upper(inst.pair)}` };
    case 'ld-sp-pair':
      return { mnemonic: 'LD', operands: `SP,${upper(inst.pair)}` };
    case 'inc-pair':
      return { mnemonic: 'INC', operands: upper(inst.pair) };
    case 'dec-pair':
      return { mnemonic: 'DEC', operands: upper(inst.pair) };
    case 'inc-reg':
      return { mnemonic: 'INC', operands: upper(inst.reg) };
    case 'dec-reg':
      return { mnemonic: 'DEC', operands: upper(inst.reg) };
    case 'inc-ixd':
      return { mnemonic: 'INC', operands: formatIndexed(inst.indexRegister, inst.displacement) };
    case 'dec-ixd':
      return { mnemonic: 'DEC', operands: formatIndexed(inst.indexRegister, inst.displacement) };
    case 'add-pair':
      return { mnemonic: 'ADD', operands: `${upper(inst.dest)},${upper(inst.src)}` };
    case 'sbc-pair':
      return { mnemonic: 'SBC', operands: `HL,${upper(inst.src)}` };
    case 'adc-pair':
      return { mnemonic: 'ADC', operands: `HL,${upper(inst.src)}` };
    case 'alu-reg':
      return { mnemonic: upper(inst.op), operands: upper(inst.src) };
    case 'alu-imm':
      return { mnemonic: upper(inst.op), operands: hex(inst.value, 2) };
    case 'alu-ixd':
      return { mnemonic: upper(inst.op), operands: formatIndexed(inst.indexRegister, inst.displacement) };
    case 'lea': {
      const disp = signedByte(inst.displacement);
      return { mnemonic: 'LEA', operands: `${upper(inst.dest)},${upper(inst.base)}${disp >= 0 ? `+${disp}` : disp}` };
    }
    case 'rotate-reg':
      return { mnemonic: upper(inst.op), operands: upper(inst.reg) };
    case 'bit-set':
      return { mnemonic: 'SET', operands: `${inst.bit},${upper(inst.reg)}` };
    case 'bit-res':
      return { mnemonic: 'RES', operands: `${inst.bit},${upper(inst.reg)}` };
    case 'bit-test':
      return { mnemonic: 'BIT', operands: `${inst.bit},${upper(inst.reg)}` };
    case 'in-reg':
      return { mnemonic: 'IN', operands: `${upper(inst.reg)},(C)` };
    case 'in-imm':
      return { mnemonic: 'IN', operands: `A,(${hex(inst.port, 2)})` };
    case 'out-reg':
      return { mnemonic: 'OUT', operands: `(C),${upper(inst.reg)}` };
    case 'out-imm':
      return { mnemonic: 'OUT', operands: `(${hex(inst.port, 2)}),A` };
    case 'nop':
      return { mnemonic: 'NOP', operands: '' };
    case 'rst':
      return { mnemonic: 'RST', operands: hex(inst.target, 2) };
    case 'ex':
      return { mnemonic: 'EX', operands: `${upper(inst.dest)},${upper(inst.src)}` };
    case 'ldir':
      return { mnemonic: 'LDIR', operands: '' };
    case 'ldi':
      return { mnemonic: 'LDI', operands: '' };
    case 'lddr':
      return { mnemonic: 'LDDR', operands: '' };
    case 'cpir':
      return { mnemonic: 'CPIR', operands: '' };
    case 'ei':
      return { mnemonic: 'EI', operands: '' };
    case 'di':
      return { mnemonic: 'DI', operands: '' };
    case 'halt':
      return { mnemonic: 'HALT', operands: '' };
    case 'xor':
      return { mnemonic: 'XOR', operands: upper(inst.src || 'A') };
    case 'or':
      return { mnemonic: 'OR', operands: upper(inst.src || 'A') };
    case 'and':
      return { mnemonic: 'AND', operands: upper(inst.src || 'A') };
    case 'cp':
      return { mnemonic: 'CP', operands: upper(inst.src || 'A') };
    case 'scf':
      return { mnemonic: 'SCF', operands: '' };
    case 'ccf':
      return { mnemonic: 'CCF', operands: '' };
    case 'cpl':
      return { mnemonic: 'CPL', operands: '' };
    case 'neg':
      return { mnemonic: 'NEG', operands: '' };
    case 'rla':
      return { mnemonic: 'RLA', operands: '' };
    case 'rra':
      return { mnemonic: 'RRA', operands: '' };
    case 'rlca':
      return { mnemonic: 'RLCA', operands: '' };
    case 'rrca':
      return { mnemonic: 'RRCA', operands: '' };
    case 'db':
      return { mnemonic: 'DB', operands: hex(inst.value, 2) };
    default:
      return { mnemonic: `[${inst.tag}]`, operands: JSON.stringify(inst) };
  }
}

function annotate(inst, pc) {
  const notes = [];
  const addr = inst.addr || inst.target || inst.value;
  if (typeof addr === 'number' && KNOWN_ADDRS.has(addr)) {
    notes.push(KNOWN_ADDRS.get(addr));
  }
  // IX-relative: parameter chain nodes
  if (inst.indexRegister && upper(inst.indexRegister) === 'IX') {
    const d = inst.displacement;
    if (d === 0x06) notes.push('IX+6 = NEXT POINTER (linked list link)');
    else if (d === 0x00) notes.push('IX+0 = node data byte 0');
    else if (d === 0x03) notes.push('IX+3 = node data field (3-byte?)');
    else notes.push(`IX+${d}`);
  }
  // IY-relative: descriptor fields
  if (inst.indexRegister && upper(inst.indexRegister) === 'IY') {
    const d = inst.displacement;
    if (d >= 0 && d <= 7) notes.push(`link ptr region (offset +${d})`);
    else if (d === 8) notes.push('flags (offset +8)');
    else if (d === 9) notes.push('subtype (offset +9)');
    else if (d >= 10 && d <= 11) notes.push(`primary addr (offset +${d})`);
    else if (d >= 12 && d <= 14) notes.push(`secondary value (offset +${d})`);
    else if (d >= 15 && d <= 31) notes.push(`reserved (offset +${d})`);
  }
  return notes.join('; ');
}

// ─── Disassemble a range ───

function disasmRange(start, end) {
  const rows = [];
  let pc = start;
  while (pc <= end && pc < rom.length) {
    const inst = safeDecode(pc);
    const { mnemonic, operands } = formatInstructionParts(inst);
    const ann = annotate(inst, pc);
    rows.push({
      pc,
      tag: inst.tag,
      length: inst.length,
      bytes: formatBytes(pc, inst.length),
      text: withPrefix(inst, `${mnemonic}${operands ? ` ${operands}` : ''}`),
      annotation: ann,
      inst,
    });
    pc = inst.nextPc;
  }
  return rows;
}

// ─── Scan for address references in a range ───

function scanForAddressRefs(startAddr, endAddr, targetAddrs) {
  const refs = [];
  for (let pc = startAddr; pc < endAddr - 3; pc++) {
    const lo = rom[pc];
    const mid = rom[pc + 1];
    const hi = rom[pc + 2];
    const addr24 = lo | (mid << 8) | (hi << 16);
    for (const targetAddr of targetAddrs) {
      if (addr24 === targetAddr) {
        for (let tryPc = Math.max(startAddr, pc - 4); tryPc <= pc; tryPc++) {
          const inst = safeDecode(tryPc);
          if (inst.nextPc === pc + 3 || (inst.nextPc > pc && inst.nextPc <= pc + 4)) {
            const { mnemonic, operands } = formatInstructionParts(inst);
            refs.push({
              instrPc: tryPc,
              addrPc: pc,
              targetAddr,
              instrLength: inst.length,
              text: withPrefix(inst, `${mnemonic}${operands ? ` ${operands}` : ''}`),
              bytes: formatBytes(tryPc, inst.length),
            });
            break;
          }
        }
      }
    }
  }
  const seen = new Set();
  return refs.filter(r => {
    const key = `${r.instrPc}:${r.targetAddr}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ─── Main ───

const lines = [];
lines.push('Phase 428 - Trace Parameter Chain for 0x00DF73');
lines.push(`ROM: ${path.join(__dirname, 'ROM.rom')}`);
lines.push('');

// ═══ 1. Full disassembly of 0x00E2EB..0x00E382 (descriptor bootstrap) ═══

lines.push('═══════════════════════════════════════════════════════════════');
lines.push('SECTION 1: FULL DISASSEMBLY OF 0x00E2EB..0x00E4E7 (509 bytes)');
lines.push('═══════════════════════════════════════════════════════════════');
lines.push('');

const bootstrapRows = disasmRange(BOOTSTRAP_START, BOOTSTRAP_END);
const callSites = [];

for (const row of bootstrapRows) {
  const ann = row.annotation ? ` ; ${row.annotation}` : '';
  // Mark CALL 0x00DF73 sites
  let marker = '';
  if (row.inst.tag === 'call' && row.inst.target === TARGET_CALLEE) {
    marker = ' <<<< CALL 0x00DF73';
    callSites.push(row.pc);
  }
  if (row.inst.tag === 'call-conditional' && row.inst.target === TARGET_CALLEE) {
    marker = ' <<<< CALL cond 0x00DF73';
    callSites.push(row.pc);
  }
  // Also mark any CALL
  if ((row.inst.tag === 'call' || row.inst.tag === 'call-conditional') && row.inst.target !== TARGET_CALLEE) {
    marker = ` <<<< CALL ${hex(row.inst.target)}`;
  }
  lines.push(`${hex(row.pc)}  ${row.bytes.padEnd(20)} ${row.text.padEnd(42)}${ann}${marker}`);
}

lines.push('');
lines.push(`Total instructions: ${bootstrapRows.length}`);
lines.push(`CALL 0x00DF73 sites found: ${callSites.length} at ${callSites.map(hex).join(', ')}`);

// ═══ 2. Trace IX setup before each CALL 0x00DF73 ═══

lines.push('');
lines.push('═══════════════════════════════════════════════════════════════');
lines.push('SECTION 2: IX SETUP BEFORE EACH CALL 0x00DF73');
lines.push('═══════════════════════════════════════════════════════════════');

for (let i = 0; i < callSites.length; i++) {
  const callPc = callSites[i];
  lines.push('');
  lines.push(`--- Call site ${i + 1}: CALL at ${hex(callPc)} ---`);
  lines.push('');

  // Look back up to 80 instructions before the CALL for IX setup
  const lookbackStart = Math.max(BOOTSTRAP_START, callPc - 200);
  const contextRows = disasmRange(lookbackStart, callPc - 1);

  // Find last IX-related instructions before this CALL
  const ixRelated = [];
  const spRelated = [];
  const pushes = [];
  const leaInstructions = [];

  for (const row of contextRows) {
    const text = row.text.toUpperCase();
    // Track IX loads, LEA IX, PUSH IX, POP IX
    if (text.includes('IX') || text.includes('LEA')) {
      ixRelated.push(row);
    }
    // Track stack operations (SP adjustments, PUSH, POP)
    if (row.inst.tag === 'push' || row.inst.tag === 'pop') {
      pushes.push(row);
    }
    if (text.includes('SP')) {
      spRelated.push(row);
    }
    if (row.inst.tag === 'lea') {
      leaInstructions.push(row);
    }
  }

  // Show last 20 instructions before the CALL for context
  const nearContext = contextRows.slice(-20);
  lines.push('  Last 20 instructions before CALL:');
  for (const row of nearContext) {
    const ann = row.annotation ? ` ; ${row.annotation}` : '';
    const highlight = row.text.toUpperCase().includes('IX') ? ' ****' : '';
    lines.push(`  ${hex(row.pc)}  ${row.bytes.padEnd(20)} ${row.text.padEnd(42)}${ann}${highlight}`);
  }

  lines.push('');
  lines.push('  IX-related instructions in lookback window:');
  if (ixRelated.length === 0) {
    lines.push('    (none found)');
  } else {
    for (const row of ixRelated) {
      const ann = row.annotation ? ` ; ${row.annotation}` : '';
      lines.push(`    ${hex(row.pc)}  ${row.bytes.padEnd(20)} ${row.text.padEnd(42)}${ann}`);
    }
  }

  lines.push('');
  lines.push('  LEA instructions in lookback window:');
  if (leaInstructions.length === 0) {
    lines.push('    (none found)');
  } else {
    for (const row of leaInstructions) {
      const ann = row.annotation ? ` ; ${row.annotation}` : '';
      lines.push(`    ${hex(row.pc)}  ${row.bytes.padEnd(20)} ${row.text.padEnd(42)}${ann}`);
    }
  }

  lines.push('');
  lines.push('  SP-related instructions:');
  if (spRelated.length === 0) {
    lines.push('    (none found)');
  } else {
    for (const row of spRelated.slice(-10)) {
      lines.push(`    ${hex(row.pc)}  ${row.bytes.padEnd(20)} ${row.text}`);
    }
  }
}

// ═══ 3. Look for linked-list node construction patterns ═══

lines.push('');
lines.push('═══════════════════════════════════════════════════════════════');
lines.push('SECTION 3: LINKED-LIST NODE CONSTRUCTION PATTERNS');
lines.push('═══════════════════════════════════════════════════════════════');
lines.push('');

// Search for stores to IX+6 (the link field) in the bootstrap function
lines.push('--- Stores to any IX+6 in 0x00E2EB..0x00E382 ---');
let ixPlus6Count = 0;
for (const row of bootstrapRows) {
  if (row.inst.indexRegister && upper(row.inst.indexRegister) === 'IX' && row.inst.displacement === 6) {
    const ann = row.annotation ? ` ; ${row.annotation}` : '';
    lines.push(`  ${hex(row.pc)}  ${row.bytes.padEnd(20)} ${row.text.padEnd(42)}${ann}`);
    ixPlus6Count++;
  }
}
if (ixPlus6Count === 0) lines.push('  (none found)');

// Search for all IX-indexed writes in the bootstrap
lines.push('');
lines.push('--- All IX-indexed writes in 0x00E2EB..0x00E382 ---');
let ixWriteCount = 0;
for (const row of bootstrapRows) {
  if (row.inst.indexRegister && upper(row.inst.indexRegister) === 'IX') {
    const isWrite = row.inst.tag === 'ld-ixd-reg' || row.inst.tag === 'ld-ixd-imm' ||
                    row.inst.tag === 'ld-indexed-pair' || row.inst.tag === 'ld-indexed-ixiy' ||
                    row.inst.tag === 'inc-ixd' || row.inst.tag === 'dec-ixd';
    if (isWrite) {
      const ann = row.annotation ? ` ; ${row.annotation}` : '';
      lines.push(`  ${hex(row.pc)}  ${row.bytes.padEnd(20)} ${row.text.padEnd(42)}${ann}`);
      ixWriteCount++;
    }
  }
}
if (ixWriteCount === 0) lines.push('  (none found)');

// Search for all IX-indexed reads
lines.push('');
lines.push('--- All IX-indexed reads in 0x00E2EB..0x00E382 ---');
let ixReadCount = 0;
for (const row of bootstrapRows) {
  if (row.inst.indexRegister && upper(row.inst.indexRegister) === 'IX') {
    const isWrite = row.inst.tag === 'ld-ixd-reg' || row.inst.tag === 'ld-ixd-imm' ||
                    row.inst.tag === 'ld-indexed-pair' || row.inst.tag === 'ld-indexed-ixiy' ||
                    row.inst.tag === 'inc-ixd' || row.inst.tag === 'dec-ixd';
    if (!isWrite) {
      const ann = row.annotation ? ` ; ${row.annotation}` : '';
      lines.push(`  ${hex(row.pc)}  ${row.bytes.padEnd(20)} ${row.text.padEnd(42)}${ann}`);
      ixReadCount++;
    }
  }
}
if (ixReadCount === 0) lines.push('  (none found)');

// ═══ 4. Scan wider caller area for IX setup and node builders ═══

lines.push('');
lines.push('═══════════════════════════════════════════════════════════════');
lines.push('SECTION 4: FUNCTION BEFORE 0x00E2EB (potential node builder)');
lines.push('═══════════════════════════════════════════════════════════════');
lines.push('');

// Disassemble 0x00E200..0x00E2EA to see what leads into the bootstrap
lines.push('--- Disassembly 0x00E200..0x00E2EA (context before bootstrap) ---');
const preBootstrap = disasmRange(0x00E200, 0x00E2EA);
for (const row of preBootstrap) {
  const ann = row.annotation ? ` ; ${row.annotation}` : '';
  let marker = '';
  if (row.inst.tag === 'ret') marker = ' <<<< RET';
  if (row.inst.tag === 'call' || row.inst.tag === 'call-conditional') marker = ` <<<< CALL ${hex(row.inst.target)}`;
  lines.push(`${hex(row.pc)}  ${row.bytes.padEnd(20)} ${row.text.padEnd(42)}${ann}${marker}`);
}

// ═══ 5. Scan for LEA IX patterns (stack-allocated nodes) ═══

lines.push('');
lines.push('═══════════════════════════════════════════════════════════════');
lines.push('SECTION 5: LEA INSTRUCTIONS IN BOOTSTRAP + CONTEXT');
lines.push('═══════════════════════════════════════════════════════════════');
lines.push('');

lines.push('--- LEA instructions in 0x00E200..0x00E382 ---');
const fullRange = disasmRange(0x00E200, BOOTSTRAP_END);
let leaCount = 0;
for (const row of fullRange) {
  if (row.inst.tag === 'lea') {
    const ann = row.annotation ? ` ; ${row.annotation}` : '';
    lines.push(`  ${hex(row.pc)}  ${row.bytes.padEnd(20)} ${row.text.padEnd(42)}${ann}`);
    leaCount++;
  }
}
if (leaCount === 0) lines.push('  (none found)');

// ═══ 6. Check for LD IX,imm patterns (ROM constant chain?) ═══

lines.push('');
lines.push('═══════════════════════════════════════════════════════════════');
lines.push('SECTION 6: LD IX,imm PATTERNS IN 0x00E200..0x00E382');
lines.push('═══════════════════════════════════════════════════════════════');
lines.push('');

for (const row of fullRange) {
  if (row.inst.tag === 'ld-pair-imm' && upper(row.inst.pair) === 'IX') {
    const target = row.inst.value;
    const ann = row.annotation ? ` ; ${row.annotation}` : '';
    let region = '';
    if (target < 0x400000) region = ' [ROM address]';
    else if (target >= RAM_MIN && target <= RAM_MAX) region = ' [RAM address]';
    else region = ` [${hex(target)}]`;
    lines.push(`  ${hex(row.pc)}  ${row.bytes.padEnd(20)} ${row.text.padEnd(42)}${ann}${region}`);
  }
}

// ═══ 7. Check for stack frame setup (LD IX,SP patterns) ═══

lines.push('');
lines.push('═══════════════════════════════════════════════════════════════');
lines.push('SECTION 7: STACK FRAME & SP ADJUSTMENT IN 0x00E2EB..0x00E382');
lines.push('═══════════════════════════════════════════════════════════════');
lines.push('');

for (const row of bootstrapRows) {
  const text = row.text.toUpperCase();
  if (text.includes('SP') || row.inst.tag === 'push' || row.inst.tag === 'pop') {
    const ann = row.annotation ? ` ; ${row.annotation}` : '';
    lines.push(`  ${hex(row.pc)}  ${row.bytes.padEnd(20)} ${row.text.padEnd(42)}${ann}`);
  }
}

// ═══ 8. If IX is loaded from ROM, dump the chain data ═══

lines.push('');
lines.push('═══════════════════════════════════════════════════════════════');
lines.push('SECTION 8: ROM CONSTANT DATA CHAIN DUMP');
lines.push('═══════════════════════════════════════════════════════════════');
lines.push('');

// Collect all LD IX,imm values that point to ROM
const romChainHeads = [];
for (const row of fullRange) {
  if (row.inst.tag === 'ld-pair-imm' && upper(row.inst.pair) === 'IX') {
    const target = row.inst.value;
    if (target < 0x400000 && target > 0) {
      romChainHeads.push({ pc: row.pc, target });
    }
  }
}

// Also check for LD IX,(addr) where we load IX from RAM pointer
for (const row of fullRange) {
  if (row.inst.tag === 'ld-pair-mem' && upper(row.inst.pair) === 'IX' && row.inst.direction !== 'to-mem') {
    lines.push(`  LD IX from RAM at ${hex(row.pc)}: ${row.text} (IX loaded from ${hex(row.inst.addr)})`);
  }
}

if (romChainHeads.length > 0) {
  for (const { pc, target } of romChainHeads) {
    lines.push(`--- Chain from LD IX,${hex(target)} at ${hex(pc)} ---`);
    // Walk the chain: each node has a 3-byte pointer at offset +6
    let nodeAddr = target;
    let nodeIndex = 0;
    const maxNodes = 15; // safety limit
    while (nodeAddr > 0 && nodeAddr < 0x400000 && nodeIndex < maxNodes) {
      // Dump 10 bytes of the node
      const nodeBytes = formatBytes(nodeAddr, 10);
      // Read the +6 link pointer
      const nextLo = rom[nodeAddr + 6] || 0;
      const nextMid = rom[nodeAddr + 7] || 0;
      const nextHi = rom[nodeAddr + 8] || 0;
      const nextPtr = nextLo | (nextMid << 8) | (nextHi << 16);

      // Read the +0 data (3 bytes) and +3 data (3 bytes)
      const data0 = rom[nodeAddr] | (rom[nodeAddr + 1] << 8) | (rom[nodeAddr + 2] << 16);
      const data3 = rom[nodeAddr + 3] | (rom[nodeAddr + 4] << 8) | (rom[nodeAddr + 5] << 16);

      let nextLabel = '';
      if (nextPtr === 0) nextLabel = '(NULL - end of chain)';
      else if (nextPtr < 0x400000) nextLabel = '(ROM)';
      else if (nextPtr >= RAM_MIN && nextPtr <= RAM_MAX) nextLabel = '(RAM)';
      else nextLabel = '(invalid?)';

      lines.push(`  Node ${nodeIndex}: addr=${hex(nodeAddr)} bytes=[${nodeBytes}]`);
      lines.push(`    +0 data: ${hex(data0)} | +3 data: ${hex(data3)} | +6 next: ${hex(nextPtr)} ${nextLabel}`);

      if (nextPtr === 0 || nextPtr >= 0x400000) break;
      nodeAddr = nextPtr;
      nodeIndex++;
    }
    lines.push('');
  }
} else {
  lines.push('  No ROM chain heads found via LD IX,imm');
}

// Also try stack-based: look for LEA IX,IY+disp or LEA IX,SP patterns
lines.push('');
lines.push('--- Alternative: Stack-frame-relative IX setup ---');
for (const row of fullRange) {
  if (row.inst.tag === 'lea' && upper(row.inst.dest) === 'IX') {
    lines.push(`  ${hex(row.pc)}  ${row.bytes.padEnd(20)} ${row.text.padEnd(42)} (IX = ${upper(row.inst.base)} + ${signedByte(row.inst.displacement)})`);
  }
}

// ═══ 9. Scan the function at 0x00DF73 itself for IX+6 reads ═══

lines.push('');
lines.push('═══════════════════════════════════════════════════════════════');
lines.push('SECTION 9: 0x00DF73 IX+6 READS (confirming linked-list walk)');
lines.push('═══════════════════════════════════════════════════════════════');
lines.push('');

const calleeRows = disasmRange(TARGET_CALLEE, TARGET_CALLEE + 0x100);
let foundRet = false;
for (const row of calleeRows) {
  if (row.inst.indexRegister && upper(row.inst.indexRegister) === 'IX') {
    const ann = row.annotation ? ` ; ${row.annotation}` : '';
    lines.push(`  ${hex(row.pc)}  ${row.bytes.padEnd(20)} ${row.text.padEnd(42)}${ann}`);
  }
  if (row.inst.tag === 'ld-ixiy-indexed' || (row.inst.tag === 'ld-pair-indexed' && upper(row.inst.pair) === 'IX')) {
    // LD IX,(IX+6) pattern
    if (row.inst.displacement === 6) {
      lines.push(`    ^^^^ THIS IS THE LINKED-LIST ADVANCE: LD IX,(IX+6)`);
    }
  }
  if (row.inst.tag === 'ret') {
    foundRet = true;
    break;
  }
}

// ═══ 10. Scan callers of 0x00E2EB ═══

lines.push('');
lines.push('═══════════════════════════════════════════════════════════════');
lines.push('SECTION 10: CALLERS OF 0x00E2EB (who calls the bootstrap?)');
lines.push('═══════════════════════════════════════════════════════════════');
lines.push('');

const callerRefs = scanForAddressRefs(0x000100, 0x100000, [BOOTSTRAP_START]);
if (callerRefs.length === 0) {
  lines.push('  (none found in 0x000100..0x100000)');
} else {
  for (const ref of callerRefs) {
    lines.push(`  ${hex(ref.instrPc)}: ${ref.bytes.padEnd(20)} ${ref.text}`);
  }
}

// ═══ 11. Summary ═══

lines.push('');
lines.push('═══════════════════════════════════════════════════════════════');
lines.push('SECTION 11: ANALYSIS SUMMARY');
lines.push('═══════════════════════════════════════════════════════════════');
lines.push('');
lines.push(`Bootstrap function: ${hex(BOOTSTRAP_START)}..${hex(BOOTSTRAP_END)} (${BOOTSTRAP_END - BOOTSTRAP_START + 1} bytes)`);
lines.push(`CALL 0x00DF73 count: ${callSites.length}`);
lines.push(`CALL sites: ${callSites.map(hex).join(', ')}`);
lines.push(`ROM chain heads found: ${romChainHeads.length}`);
lines.push(`LEA instructions found: ${leaCount}`);
lines.push(`IX-indexed writes: ${ixWriteCount}`);
lines.push(`IX-indexed reads: ${ixReadCount}`);
lines.push(`IX+6 stores (link writes): ${ixPlus6Count}`);

console.log(lines.join('\n'));

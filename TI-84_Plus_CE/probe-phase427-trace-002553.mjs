#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.emitWarning = () => {};
const { decodeInstruction } = await import(new URL('./ez80-decoder.js', import.meta.url));

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rom = fs.readFileSync(path.join(__dirname, 'ROM.rom'));

const TARGET = 0x002553;
const VECTOR = 0x0001EC;
const NEARBY_START = 0x002540;
const NEARBY_BYTES = 0x40;
const FORWARD_BYTES = 0xC8;

const CALL_SITES = [
  {
    callPc: 0x00E46D,
    windowStart: 0x00E463,
    windowBytes: 0x12,
    label: 'Descriptor A header byte 1',
    bcSource: 'BC <- *(D13FDB) = partner table base = root + 0x40',
    shift: 8,
    destination: '(*(D13FD8) + 1)',
    expression: '((*(D13FDB) >> 8) & 0xFF)',
    meaning: 'store the partner pointer middle byte into descriptor A header byte 1',
  },
  {
    callPc: 0x00E482,
    windowStart: 0x00E474,
    windowBytes: 0x12,
    label: 'Descriptor A header byte 2',
    bcSource: 'BC <- *(D13FDB) = partner table base = root + 0x40',
    shift: 16,
    destination: '(*(D13FD8) + 2)',
    expression: '((*(D13FDB) >> 16) & 0xFF)',
    meaning: 'store the partner pointer high byte into descriptor A header byte 2',
  },
  {
    callPc: 0x00E4B3,
    windowStart: 0x00E4A9,
    windowBytes: 0x12,
    label: 'Descriptor B header byte 1',
    bcSource: 'BC <- *(D13FD8) = primary table base = root',
    shift: 8,
    destination: '(*(D13FDB) + 1)',
    expression: '((*(D13FD8) >> 8) & 0xFF)',
    meaning: 'store the partner pointer middle byte into descriptor B header byte 1',
  },
  {
    callPc: 0x00E4CB,
    windowStart: 0x00E4BC,
    windowBytes: 0x1C,
    label: 'Descriptor B header byte 2',
    bcSource: 'BC <- *(D13FD8) = primary table base = root',
    shift: 16,
    destination: '(*(D13FDB) + 2)',
    expression: '((*(D13FD8) >> 16) & 0xFF)',
    meaning: 'store the partner pointer high byte into descriptor B header byte 2',
  },
];

const REPRESENTATIVE_VECTOR_CALLS = [
  {
    callPc: 0x02EB3B,
    description: 'shift D17721:D1771E right by 16, then write returned C/B to D17756/D17757',
  },
  {
    callPc: 0x033C7F,
    description: 'shift a 32-bit IX argument right by 24, then store the top byte in (IY+0x11)',
  },
  {
    callPc: 0x072BA8,
    description: 'shift a 32-bit IX local right by 27 as part of a packed-field extraction path',
  },
];

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return (value & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

function upper(value) {
  return value == null ? '' : String(value).toUpperCase();
}

function signedByte(value) {
  return value < 0x80 ? value : value - 0x100;
}

function formatDisp(value) {
  return value >= 0 ? `+${value}` : `${value}`;
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

function formatInstruction(inst) {
  switch (inst.tag) {
    case 'call':
      return `CALL ${hex(inst.target)}`;
    case 'call-conditional':
      return `CALL ${upper(inst.condition)},${hex(inst.target)}`;
    case 'jp':
      return `JP ${hex(inst.target)}`;
    case 'jp-conditional':
      return `JP ${upper(inst.condition)},${hex(inst.target)}`;
    case 'jr':
      return `JR ${hex(inst.target)}`;
    case 'jr-conditional':
      return `JR ${upper(inst.condition)},${hex(inst.target)}`;
    case 'djnz':
      return `DJNZ ${hex(inst.target)}`;
    case 'ret':
      return 'RET';
    case 'ret-conditional':
      return `RET ${upper(inst.condition)}`;
    case 'push':
      return `PUSH ${upper(inst.pair)}`;
    case 'pop':
      return `POP ${upper(inst.pair)}`;
    case 'ld-pair-imm':
      return `LD ${upper(inst.pair)},${hex(inst.value)}`;
    case 'ld-mem-pair':
      return `LD (${hex(inst.addr)}),${upper(inst.pair)}`;
    case 'ld-pair-mem':
      return inst.direction === 'to-mem'
        ? `LD (${hex(inst.addr)}),${upper(inst.pair)}`
        : `LD ${upper(inst.pair)},(${hex(inst.addr)})`;
    case 'ld-reg-mem':
      return `LD ${upper(inst.dest)},(${hex(inst.addr)})`;
    case 'ld-mem-reg':
      return `LD (${hex(inst.addr)}),${upper(inst.src)}`;
    case 'ld-reg-imm':
      return `LD ${upper(inst.dest)},${hex(inst.value, 2)}`;
    case 'ld-reg-reg':
      return `LD ${upper(inst.dest)},${upper(inst.src)}`;
    case 'ld-reg-ind':
      return `LD ${upper(inst.dest)},(${upper(inst.src)})`;
    case 'ld-ind-reg':
      return `LD (${upper(inst.dest)}),${upper(inst.src)}`;
    case 'ld-ind-imm':
      return `LD (HL),${hex(inst.value, 2)}`;
    case 'ld-pair-ind':
      return `LD ${upper(inst.pair)},(${upper(inst.src)})`;
    case 'ld-ind-pair':
      return `LD (${upper(inst.dest)}),${upper(inst.pair)}`;
    case 'ld-reg-ixd':
      return `LD ${upper(inst.dest)},${formatIndexed(inst.indexRegister, signedByte(inst.displacement))}`;
    case 'ld-ixd-reg':
      return `LD ${formatIndexed(inst.indexRegister, signedByte(inst.displacement))},${upper(inst.src)}`;
    case 'inc-pair':
      return `INC ${upper(inst.pair)}`;
    case 'dec-pair':
      return `DEC ${upper(inst.pair)}`;
    case 'inc-reg':
      return `INC ${upper(inst.reg)}`;
    case 'dec-reg':
      return `DEC ${upper(inst.reg)}`;
    case 'add-pair':
      return `ADD ${upper(inst.dest)},${upper(inst.src)}`;
    case 'lea':
      return `LEA ${upper(inst.dest)},${upper(inst.base)}${formatDisp(inst.displacement)}`;
    case 'rotate-reg':
      return `${upper(inst.op)} ${upper(inst.reg)}`;
    case 'alu-reg':
      return `${upper(inst.op)} ${upper(inst.src || 'a')}`;
    case 'alu-imm':
      return `${upper(inst.op)} ${hex(inst.value, 2)}`;
    case 'nop':
      return 'NOP';
    case 'db':
      return `DB ${hex(inst.value, 2)}`;
    default:
      return `[${inst.tag}]`;
  }
}

function decodeSpan(start, maxBytes) {
  const lines = [];
  let pc = start;
  const end = Math.min(rom.length, start + maxBytes);

  while (pc < end) {
    const inst = safeDecode(pc);
    const bytes = Array.from(rom.subarray(pc, Math.min(end, pc + inst.length)), hexByte).join(' ');
    lines.push({
      pc,
      bytes,
      text: formatInstruction(inst),
      inst,
    });
    pc = inst.nextPc;
  }

  return lines;
}

function printListing(title, lines) {
  console.log(title);
  for (const line of lines) {
    console.log(`  ${hex(line.pc)}  ${line.bytes.padEnd(19)}  ${line.text}`);
  }
  console.log('');
}

function findPreviousRet(target, lookback = 0x40) {
  for (let pc = target - 1; pc >= Math.max(0, target - lookback); pc -= 1) {
    if (rom[pc] === 0xC9) {
      return pc;
    }
  }
  return null;
}

function scanCalls(target) {
  const hits = [];
  for (let pc = 0; pc < rom.length - 4; pc += 1) {
    if (rom[pc] !== 0xCD) {
      continue;
    }
    const callTarget = rom[pc + 1] | (rom[pc + 2] << 8) | (rom[pc + 3] << 16);
    if (callTarget === target) {
      hits.push(pc);
    }
  }
  return hits;
}

function load24(addr) {
  return rom[addr] | (rom[addr + 1] << 8) | (rom[addr + 2] << 16);
}

function asOperand(a, bc) {
  return ((BigInt(a & 0xFF) << 24n) | BigInt(bc & 0xFFFFFF)) & 0xFFFFFFFFn;
}

function simulateHelper(a, bc, shift) {
  const operand = asOperand(a, bc);
  const result = operand >> BigInt(shift & 0xFF);
  return {
    operand,
    result,
    outA: Number((result >> 24n) & 0xFFn),
    outBC: Number(result & 0xFFFFFFn),
    outB: Number((result >> 8n) & 0xFFn),
    outC: Number(result & 0xFFn),
  };
}

const directCalls = scanCalls(TARGET);
const vectorCalls = scanCalls(VECTOR);
const vectorTarget = load24(VECTOR + 1);
const prevRet = findPreviousRet(TARGET);

console.log('Phase 427 - Trace 0x002553 helper');
console.log('=================================\n');

console.log(`Vector alias: ${hex(VECTOR)} = JP ${hex(vectorTarget)}`);
console.log(`Previous RET before helper: ${prevRet == null ? 'not found' : hex(prevRet)}`);
if (prevRet != null) {
  console.log(`Likely function boundary: ${hex(prevRet + 1)}..0x002574 (34 bytes)\n`);
} else {
  console.log('Likely function boundary: not proven by backward scan\n');
}

printListing('Nearby disassembly (includes the previous helper tail and the 0x002553 entry):', decodeSpan(NEARBY_START, NEARBY_BYTES));
printListing('Forward decode from 0x002553 for ~200 bytes:', decodeSpan(TARGET, FORWARD_BYTES));
printListing('Just the 0x002553 helper body:', decodeSpan(TARGET, 0x22));

console.log('Calling convention');
console.log('------------------');
console.log('- Entry operand: a 32-bit unsigned value split across A:BC.');
console.log('- Entry shift count: L.');
console.log('- H/L are saved on entry; only the original L value is consumed as the shift count.');
console.log('- Exit value: the shifted 32-bit result is returned in A:BC.');
console.log('- Exit byte layout: C = result bits 7..0, B = result bits 15..8, BC upper byte = result bits 23..16, A = result bits 31..24.');
console.log('- Practical use: callers that only read C are computing ((operand >> L) & 0xFF).\n');

console.log('Algorithm');
console.log('---------');
console.log('- This is not a division helper.');
console.log('- The prologue repacks the 24-bit BC register so its hidden top byte becomes accessible.');
console.log('- The loop is exactly L iterations because the code does INC B, enters through DJNZ, then executes:');
console.log('    SRL A');
console.log('    RR  C');
console.log('    RR  H');
console.log('    RR  L');
console.log('- Equivalent C: uint32_t helper(uint32_t x, uint8_t shift) { return x >> shift; }');
console.log('- There are no compare/subtract/remainder steps anywhere in 0x002553.\n');

const sampleShift8 = simulateHelper(0x00, 0xD14080, 8);
const sampleShift16 = simulateHelper(0x00, 0xD14080, 16);
console.log('Concrete sanity checks');
console.log('----------------------');
console.log(`- Example input A:BC = 0x00:D14080, L=8  -> result 0x${sampleShift8.result.toString(16).toUpperCase().padStart(8, '0')}, returned C=${hexByte(sampleShift8.outC)}`);
console.log(`- Example input A:BC = 0x00:D14080, L=16 -> result 0x${sampleShift16.result.toString(16).toUpperCase().padStart(8, '0')}, returned C=${hexByte(sampleShift16.outC)}\n`);

console.log('0x00E2EB call-site analysis');
console.log('---------------------------');
console.log('The descriptor initializer already partitions the pool with explicit +0x40/+0x80/+0xC0 arithmetic earlier in the function.');
console.log('The four 0x002553 calls only extract pointer bytes for descriptor-header packing.\n');

for (const site of CALL_SITES) {
  printListing(`${site.label} at ${hex(site.callPc)}:`, decodeSpan(site.windowStart, site.windowBytes));
  console.log(`  Source setup : ${site.bcSource}`);
  console.log(`  Shift count  : L = ${site.shift}`);
  console.log(`  Effective C  : ${site.expression}`);
  console.log(`  Destination  : ${site.destination}`);
  console.log(`  Meaning      : ${site.meaning}\n`);
}

console.log('Descriptor-header interpretation');
console.log('--------------------------------');
console.log('- Byte 0 is patched separately with AND 0xE0 / OR to carry partner-pointer bits 5..7 while preserving low-bit flags.');
console.log('- Bytes 1 and 2 are filled by 0x002553 with shifts 8 and 16.');
console.log('- So the header is encoding a partner table pointer, not pool_size / entry_count arithmetic.\n');

console.log('Caller inventory');
console.log('----------------');
console.log(`- Direct CALL ${hex(TARGET)} sites: ${directCalls.length}`);
console.log(`  ${directCalls.map((pc) => hex(pc)).join(', ')}`);
console.log(`- CALL ${hex(VECTOR)} sites (low-ROM vector that jumps to ${hex(vectorTarget)}): ${vectorCalls.length}`);
console.log(`  ${vectorCalls.map((pc) => hex(pc)).join(', ')}\n`);

console.log('Representative non-0x00E2EB callers');
console.log('-----------------------------------');
console.log(`- Direct ${hex(0x0153BE)} and ${hex(0x01541D)}: the display-region helper shifts the 32-bit state D17721:D1771E right by 8, then writes the full A:BC result back to D17721/D1771E.`);
for (const item of REPRESENTATIVE_VECTOR_CALLS) {
  console.log(`- Via vector ${hex(item.callPc)}: ${item.description}.`);
}
console.log('');

console.log('Bottom line');
console.log('-----------');
console.log(`0x002553 is a 34-byte 32-bit logical right-shift helper with ABI input A:BC and L, not a divider. In 0x00E2EB it is only used to copy partner-table pointer bytes into descriptor headers after the explicit +0x40/+0x80/+0xC0 table partitioning has already happened.`);

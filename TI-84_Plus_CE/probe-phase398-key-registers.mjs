#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';

process.emitWarning = () => {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');

const EXPECTED_ROM_SIZE = 0x400000;
const MODE = 'adl';

const TARGETS = [
  { addr: 0xD0058F, label: 'kbdState+0x08 (one byte past kbdToken)' },
  { addr: 0xD00587, label: 'kbdGetKy result register' },
];

// Byte patterns to scan for (eZ80 ADL mode: opcode + 3-byte LE address)
// LD (nn),A  = 0x32 + addr[0] + addr[1] + addr[2]
// LD A,(nn)  = 0x3A + addr[0] + addr[1] + addr[2]
// LD HL,nn   = 0x21 + addr[0] + addr[1] + addr[2]
const PATTERNS = [
  { opcode: 0x32, mnemonic: 'LD (nn),A', kind: 'write' },
  { opcode: 0x3A, mnemonic: 'LD A,(nn)', kind: 'read' },
  { opcode: 0x21, mnemonic: 'LD HL,nn', kind: 'ref' },
];

const CONTEXT_INSTRUCTIONS = 10;

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function safeDecode(rom, pc) {
  try {
    return decodeInstruction(rom, pc, MODE);
  } catch {
    return {
      pc,
      length: 1,
      nextPc: pc + 1,
      tag: 'db',
      value: rom[pc] ?? 0,
      mode: MODE,
      modePrefix: null,
    };
  }
}

function formatInstruction(inst) {
  if (!inst || !inst.tag) return '???';

  // Minimal formatter — enough for context display
  const parts = [];
  const skip = new Set(['pc', 'length', 'nextPc', 'mode', 'modePrefix', 'terminates', 'fallthrough', 'tag']);
  for (const [key, value] of Object.entries(inst)) {
    if (skip.has(key) || value === undefined || value === null) continue;
    if (typeof value === 'number') {
      if (key === 'displacement') {
        parts.push(`${key}=${value >= 0 ? `+${value}` : `${value}`}`);
      } else if (key === 'bit') {
        parts.push(`${key}=${value}`);
      } else {
        parts.push(`${key}=${hex(value, value <= 0xFF ? 2 : 6)}`);
      }
    } else {
      parts.push(`${key}=${value}`);
    }
  }

  const prefix = inst.modePrefix ? `${String(inst.modePrefix).toUpperCase()} ` : '';
  return `${prefix}${inst.tag}${parts.length ? ' ' + parts.join(' ') : ''}`;
}

function bytesHex(buffer) {
  return Array.from(buffer, (byte) => byte.toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

function disassembleContext(rom, matchAddr, contextCount) {
  const lines = [];

  // Walk backwards to find ~contextCount instructions before the match
  // We need to estimate where to start scanning from (max instruction length is ~6 bytes)
  const startGuess = Math.max(0, matchAddr - contextCount * 5);
  const beforeInsts = [];
  let pc = startGuess;
  while (pc < matchAddr) {
    const inst = safeDecode(rom, pc);
    beforeInsts.push({ pc, inst });
    pc = inst.nextPc ?? (pc + inst.length);
  }

  // Take last contextCount instructions before the match
  const before = beforeInsts.slice(-contextCount);
  for (const { pc: ipc, inst } of before) {
    const bytes = bytesHex(rom.subarray(ipc, ipc + inst.length));
    lines.push(`    ${hex(ipc)}  ${bytes.padEnd(16)}  ${formatInstruction(inst)}`);
  }

  // The match instruction itself
  const matchInst = safeDecode(rom, matchAddr);
  const matchBytes = bytesHex(rom.subarray(matchAddr, matchAddr + matchInst.length));
  lines.push(`  * ${hex(matchAddr)}  ${matchBytes.padEnd(16)}  ${formatInstruction(matchInst)}  <-- MATCH`);

  // Disassemble contextCount instructions after
  pc = matchInst.nextPc ?? (matchAddr + matchInst.length);
  for (let i = 0; i < contextCount && pc < EXPECTED_ROM_SIZE; i++) {
    const inst = safeDecode(rom, pc);
    const bytes = bytesHex(rom.subarray(pc, pc + inst.length));
    lines.push(`    ${hex(pc)}  ${bytes.padEnd(16)}  ${formatInstruction(inst)}`);
    pc = inst.nextPc ?? (pc + inst.length);
  }

  return lines;
}

function scanForPatterns(rom) {
  const results = [];

  for (const target of TARGETS) {
    const addrLow = target.addr & 0xFF;
    const addrMid = (target.addr >> 8) & 0xFF;
    const addrHigh = (target.addr >> 16) & 0xFF;

    for (const pattern of PATTERNS) {
      // Scan ROM region only (0x000000 - 0x3FFFFF)
      // Need 4 bytes: opcode + 3-byte address
      for (let offset = 0; offset <= EXPECTED_ROM_SIZE - 4; offset++) {
        if (
          rom[offset] === pattern.opcode &&
          rom[offset + 1] === addrLow &&
          rom[offset + 2] === addrMid &&
          rom[offset + 3] === addrHigh
        ) {
          results.push({
            offset,
            targetAddr: target.addr,
            targetLabel: target.label,
            opcode: pattern.opcode,
            mnemonic: pattern.mnemonic,
            kind: pattern.kind,
            bytes: bytesHex(rom.subarray(offset, offset + 4)),
          });
        }
      }
    }
  }

  results.sort((a, b) => a.offset - b.offset);
  return results;
}

function printSectionTitle(title) {
  console.log('');
  console.log('='.repeat(88));
  console.log(title);
  console.log('='.repeat(88));
}

function main() {
  const rom = fs.readFileSync(ROM_PATH);

  if (rom.length !== EXPECTED_ROM_SIZE) {
    throw new Error(
      `Expected ROM size ${hex(EXPECTED_ROM_SIZE, 8)} (${EXPECTED_ROM_SIZE}) bytes, got ${hex(rom.length, 8)} (${rom.length}) bytes.`,
    );
  }

  console.log('Phase 398 - Key Register Writers/Readers Scan');
  console.log(`ROM: ${ROM_PATH}`);
  console.log(`Size: ${hex(rom.length, 8)} (${rom.length}) bytes`);
  console.log(`Decoder mode: ${MODE}`);
  console.log('');
  console.log('Target addresses:');
  for (const target of TARGETS) {
    console.log(`  ${hex(target.addr)} - ${target.label}`);
  }

  const matches = scanForPatterns(rom);

  console.log('');
  console.log(`Total matches found: ${matches.length}`);

  // Group by target address and kind
  const writesByAddr = new Map();
  const readsByAddr = new Map();
  const refsByAddr = new Map();

  for (const match of matches) {
    const key = match.targetAddr;
    if (match.kind === 'write') {
      if (!writesByAddr.has(key)) writesByAddr.set(key, []);
      writesByAddr.get(key).push(match);
    } else if (match.kind === 'read') {
      if (!readsByAddr.has(key)) readsByAddr.set(key, []);
      readsByAddr.get(key).push(match);
    } else {
      if (!refsByAddr.has(key)) refsByAddr.set(key, []);
      refsByAddr.get(key).push(match);
    }
  }

  // Print detailed results per target
  for (const target of TARGETS) {
    printSectionTitle(`${hex(target.addr)} - ${target.label}`);

    const writes = writesByAddr.get(target.addr) ?? [];
    const reads = readsByAddr.get(target.addr) ?? [];
    const refs = refsByAddr.get(target.addr) ?? [];

    console.log('');
    console.log(`WRITE sites (LD (${hex(target.addr)}),A): ${writes.length} found`);
    for (const match of writes) {
      console.log(`  ${hex(match.offset)}  ${match.bytes}  ${match.mnemonic}`);
      const context = disassembleContext(rom, match.offset, CONTEXT_INSTRUCTIONS);
      for (const line of context) {
        console.log(line);
      }
      console.log('');
    }

    console.log(`READ sites (LD A,(${hex(target.addr)})): ${reads.length} found`);
    for (const match of reads) {
      console.log(`  ${hex(match.offset)}  ${match.bytes}  ${match.mnemonic}`);
      const context = disassembleContext(rom, match.offset, CONTEXT_INSTRUCTIONS);
      for (const line of context) {
        console.log(line);
      }
      console.log('');
    }

    console.log(`HL-LOAD references (LD HL,${hex(target.addr)}): ${refs.length} found`);
    for (const match of refs) {
      console.log(`  ${hex(match.offset)}  ${match.bytes}  ${match.mnemonic}`);
      const context = disassembleContext(rom, match.offset, CONTEXT_INSTRUCTIONS);
      for (const line of context) {
        console.log(line);
      }
      console.log('');
    }
  }

  // Summary
  printSectionTitle('SUMMARY');

  for (const target of TARGETS) {
    const writes = writesByAddr.get(target.addr) ?? [];
    const reads = readsByAddr.get(target.addr) ?? [];
    const refs = refsByAddr.get(target.addr) ?? [];

    console.log('');
    console.log(`${hex(target.addr)} (${target.label}):`);
    console.log(`  Writers:    ${writes.length === 0 ? 'NONE FOUND' : writes.map(m => hex(m.offset)).join(', ')}`);
    console.log(`  Readers:    ${reads.length === 0 ? 'NONE FOUND' : reads.map(m => hex(m.offset)).join(', ')}`);
    console.log(`  HL-refs:    ${refs.length === 0 ? 'NONE FOUND' : refs.map(m => hex(m.offset)).join(', ')}`);
  }

  // Lifecycle inference
  printSectionTitle('INFERRED LIFECYCLE');

  for (const target of TARGETS) {
    const writes = writesByAddr.get(target.addr) ?? [];
    const reads = readsByAddr.get(target.addr) ?? [];
    const refs = refsByAddr.get(target.addr) ?? [];

    console.log('');
    console.log(`${hex(target.addr)} (${target.label}):`);

    if (writes.length === 0 && refs.length === 0) {
      console.log('  No direct LD (nn),A writes or HL-load references found.');
      console.log('  This register may be written via indirect addressing (HL/IX/IY pointer),');
      console.log('  or via block transfer (LDIR/LDDR), or by hardware/peripheral.');
    } else {
      if (writes.length > 0) {
        console.log(`  SET by: ${writes.map(m => hex(m.offset)).join(', ')}`);
      }
      if (refs.length > 0) {
        console.log(`  HL-loaded at: ${refs.map(m => hex(m.offset)).join(', ')} (possible indirect write/read nearby)`);
      }
    }

    if (reads.length > 0) {
      console.log(`  CONSUMED by: ${reads.map(m => hex(m.offset)).join(', ')}`);
    }
  }

  console.log('');
  console.log('-'.repeat(88));
  console.log('Done.');
}

main();

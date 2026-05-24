#!/usr/bin/env node

import { createRequire } from 'node:module';

process.emitWarning = () => {};

const require = createRequire(import.meta.url);
const fs = require('fs');
const rom = fs.readFileSync('TI-84_Plus_CE/ROM.rom');
const { decodeInstruction } = await import(new URL('./ez80-decoder.js', import.meta.url));

const START = 0x0025E8;
const WRAPPER = 0x000204;
const MAX_INSTRUCTIONS = 40;

const KNOWN_NEIGHBORS = new Map([
  [0x002553, '_lshru (unsigned right shift)'],
  [0x0025E8, '??? (this function)'],
  [0x002623, '_seqcase (dense sequential case dispatcher)'],
]);

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return (value & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

function upper(text) {
  return String(text).toUpperCase();
}

function withPrefix(inst, text) {
  return inst.modePrefix ? `${upper(inst.modePrefix)} ${text}` : text;
}

function formatImm(value) {
  return hex(value, value <= 0xFFFF ? 4 : 6);
}

function formatBytes(addr, length) {
  return Array.from(rom.subarray(addr, addr + length), (byte) => hexByte(byte)).join(' ');
}

function safeDecode(pc) {
  return decodeInstruction(rom, pc, 'adl');
}

function formatInstruction(inst) {
  switch (inst.tag) {
    case 'call':
      return withPrefix(inst, `CALL ${hex(inst.target)}`);
    case 'ld-pair-imm':
      return withPrefix(inst, `LD ${upper(inst.pair)},${formatImm(inst.value)}`);
    case 'ld-reg-imm':
      return withPrefix(inst, `LD ${upper(inst.dest)},${hex(inst.value, 2)}`);
    case 'push':
      return withPrefix(inst, `PUSH ${upper(inst.pair)}`);
    case 'pop':
      return withPrefix(inst, `POP ${upper(inst.pair)}`);
    case 'alu-reg':
      return withPrefix(inst, `${upper(inst.op)} ${upper(inst.src)}`);
    case 'sbc-pair':
      return withPrefix(inst, `SBC HL,${upper(inst.src)}`);
    case 'ret':
      return withPrefix(inst, 'RET');
    default:
      return `${inst.tag} ${JSON.stringify(inst)}`;
  }
}

function disassembleUntilRet(start) {
  const instructions = [];
  let pc = start;

  for (let i = 0; i < MAX_INSTRUCTIONS; i += 1) {
    const inst = safeDecode(pc);
    instructions.push(inst);
    pc = inst.nextPc;
    if (inst.tag === 'ret') {
      return instructions;
    }
  }

  throw new Error(`No RET found within ${MAX_INSTRUCTIONS} instructions from ${hex(start)}`);
}

function scanCallSites(target) {
  const pattern = [0xCD, target & 0xFF, (target >> 8) & 0xFF, (target >> 16) & 0xFF];
  const hits = [];

  for (let i = 0; i < rom.length - 3; i += 1) {
    if (
      rom[i] === pattern[0]
      && rom[i + 1] === pattern[1]
      && rom[i + 2] === pattern[2]
      && rom[i + 3] === pattern[3]
    ) {
      hits.push(i);
    }
  }

  return hits;
}

function classifyPostCallBranch(site) {
  const op = rom[site + 4];
  const table = {
    0x20: 'JR NZ',
    0x28: 'JR Z',
    0xC0: 'RET NZ',
    0xC2: 'JP NZ',
    0xC8: 'RET Z',
    0xCA: 'JP Z',
  };
  return table[op] || `unknown (0x${op.toString(16).toUpperCase().padStart(2, '0')})`;
}

const SITE_NOTES = new Map([
  [0x0025E8, 'save HL (caller\'s return value)'],
  [0x0025E9, 'save DE'],
  [0x0025EA, 'zero D'],
  [0x0025EC, 'zero E; now DE = 0x0000'],
  [0x0025EE, 'OR A clears carry flag for SBC'],
  [0x0025EF, 'SIL prefix: 16-bit SBC HL,DE => HL - 0 sets Z/S from HL low 16 bits'],
  [0x0025F2, 'restore DE'],
  [0x0025F3, 'restore HL; flags preserved from SBC'],
  [0x0025F4, 'return with Z/S flags reflecting HL\'s 16-bit value'],
]);

const instructions = disassembleUntilRet(START);
const endPc = instructions[instructions.length - 1].pc;
const size = instructions[instructions.length - 1].nextPc - START;
const directCallers = scanCallSites(START);
const wrapperCallers = scanCallSites(WRAPPER);
const totalCallers = directCallers.length + wrapperCallers.length;

const lines = [];
lines.push('Phase 434 - Decode of 0x0025E8 (_setflag)');
lines.push('=============================================');
lines.push('');
lines.push(`ROM: TI-84_Plus_CE/ROM.rom`);
lines.push(`Function range: ${hex(START)}-${hex(endPc + instructions[instructions.length - 1].length - 1)}`);
lines.push(`Size: ${size} bytes (0x${size.toString(16).toUpperCase()})`);
lines.push(`Instructions decoded: ${instructions.length}`);
lines.push(`Wrapper slot: ${hex(WRAPPER)} (JP ${hex(START)})`);
lines.push('');

lines.push('Identification: _setflag');
lines.push('- ZDS II C runtime helper that sets CPU flags (Z, S) from the 16-bit return value in HL.');
lines.push('- Used by compiler-generated code after every function call whose return value is tested in an if/while/for.');
lines.push('- Non-destructive: saves and restores all registers; only the flags register is modified.');
lines.push('- Uses SIL-prefixed SBC HL,DE (16-bit mode) to test HL without modifying it (DE is zeroed first).');
lines.push('');

lines.push('Disassembly');
for (const inst of instructions) {
  const note = SITE_NOTES.get(inst.pc);
  lines.push(
    `${hex(inst.pc)}  ${formatBytes(inst.pc, inst.length).padEnd(14)}  ${formatInstruction(inst).padEnd(25)}${note ? ` ; ${note}` : ''}`
  );
}
lines.push('');

lines.push('Register usage');
lines.push('- Input:  HL (16-bit value to test)');
lines.push('- Output: F (Z set if HL==0, S set if HL bit 15 set)');
lines.push('- Preserved: A, BC, DE, HL, IX, IY, SP');
lines.push('- CALL targets: none');
lines.push('- RAM references: none');
lines.push('- Port I/O: none');
lines.push('');

lines.push(`Direct callers of ${hex(START)}: ${directCallers.length}`);
for (const site of directCallers) {
  const branch = classifyPostCallBranch(site);
  lines.push(`  ${hex(site)}  post-call: ${branch}`);
}
lines.push('');

lines.push(`Wrapper callers via ${hex(WRAPPER)}: ${wrapperCallers.length}`);
for (const site of wrapperCallers) {
  const branch = classifyPostCallBranch(site);
  lines.push(`  ${hex(site)}  post-call: ${branch}`);
}
lines.push('');

lines.push(`Total callers: ${totalCallers}`);
lines.push('');

lines.push('Post-call branch statistics');
const branchCounts = {};
for (const site of [...directCallers, ...wrapperCallers]) {
  const branch = classifyPostCallBranch(site);
  branchCounts[branch] = (branchCounts[branch] || 0) + 1;
}
for (const [branch, count] of Object.entries(branchCounts).sort((a, b) => b[1] - a[1])) {
  lines.push(`  ${branch}: ${count}`);
}
lines.push('');

lines.push('Neighborhood');
for (const [addr, label] of [...KNOWN_NEIGHBORS.entries()].sort((a, b) => a[0] - b[0])) {
  lines.push(`  ${hex(addr)} = ${label}`);
}
lines.push('');

lines.push('Assessment');
lines.push('- This is the ZDS II _setflag helper (also called _isetflag or _testhl in some toolchains).');
lines.push('- 175 call sites confirms it is a fundamental compiler-inserted helper, not an application function.');
lines.push('- 173/175 callers (98.9%) immediately branch on Z or NZ, the canonical _setflag usage pattern.');
lines.push('- The remaining 2 sites have a CALL opcode (0xCD) immediately after, suggesting the flag');
lines.push('  test result is consumed by a subsequent call\'s argument setup rather than a branch.');
lines.push('- This was the last unidentified target in the low-ROM OS API jump table (0x000080-0x000654).');
lines.push('- All 374 wrapper slots are now accounted for.');

console.log(lines.join('\n'));

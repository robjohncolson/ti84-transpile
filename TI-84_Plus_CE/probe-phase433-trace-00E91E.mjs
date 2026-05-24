#!/usr/bin/env node

import { createRequire } from 'node:module';

process.emitWarning = () => {};

const require = createRequire(import.meta.url);
const fs = require('fs');
const rom = fs.readFileSync('TI-84_Plus_CE/ROM.rom');
const { decodeInstruction } = await import(new URL('./ez80-decoder.js', import.meta.url));

const START = 0x00E91E;
const MAX_INSTRUCTIONS = 80;
const DIRECT_RAM_MIN = 0xD00000;
const DIRECT_RAM_MAX = 0xD1FFFF;

const CALL_LABELS = new Map([
  [0x002197, '__frameset / IX-frame prologue'],
  [0x002330, '24-bit right-shift / byte-extract helper'],
  [0x00DB66, 'TX-side control-bit drain helper; arg 0 clears 0x3010 bit5 and polls 0x3015 bit7'],
]);

const RAM_LABELS = new Map([
  [0xD13FD8, 'descriptor root A pointer slot'],
  [0xD13FDB, 'descriptor companion A pointer slot'],
]);

const CALLER_LABELS = new Map([
  [0x008577, '0x008527 special D177B8==0x98 branch'],
  [0x008F8D, 'P4 CDC full re-enumerate branch'],
  [0x009006, 'P5 audio/HID full re-enumerate branch'],
  [0x0093B1, 'another D177B8==0x98 gated wrapper'],
]);

const SITE_NOTES = new Map([
  [0x00E91E, 'allocate a 12-byte IX frame'],
  [0x00E92A, 'push arg 0, then call 0x00DB66(0)'],
  [0x00E930, 'load the D13FDB pointer slot address'],
  [0x00E934, 'dereference D13FDB to the companion descriptor root'],
  [0x00E936, 'read companion byte 0 and keep only low 5 bits'],
  [0x00E93C, 'read low byte of the D13FD8 root pointer slot'],
  [0x00E943, 'reload the D13FDB companion root'],
  [0x00E945, 'write rebuilt packed byte 0 to *(D13FDB)+0'],
  [0x00E948, 'read the full 24-bit root pointer from D13FD8'],
  [0x00E95B, 'extract (ptr >> 8) & 0xFF'],
  [0x00E969, 'store byte 1 to *(D13FDB)+1'],
  [0x00E97D, 'extract (ptr >> 16) & 0xFF'],
  [0x00E98A, 'store byte 2 to *(D13FDB)+2'],
  [0x00E99E, 'extract (ptr >> 24) & 0xFF'],
  [0x00E9AB, 'store byte 3 to *(D13FDB)+3; 24-bit pointers make this zero'],
  [0x00E9AC, 'manual epilogue'],
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
    case 'push':
      return withPrefix(inst, `PUSH ${upper(inst.pair)}`);
    case 'pop':
      return withPrefix(inst, `POP ${upper(inst.pair)}`);
    case 'ld-pair-ind':
      return withPrefix(inst, `LD ${upper(inst.pair)},(${upper(inst.src)})`);
    case 'ld-reg-ixd':
      return withPrefix(
        inst,
        `LD ${upper(inst.dest)},(${upper(inst.indexRegister)}${inst.displacement >= 0 ? '+' : ''}${inst.displacement})`
      );
    case 'ld-ixd-reg':
      return withPrefix(
        inst,
        `LD (${upper(inst.indexRegister)}${inst.displacement >= 0 ? '+' : ''}${inst.displacement}),${upper(inst.src)}`
      );
    case 'alu-imm':
      return withPrefix(inst, `${upper(inst.op)} ${hex(inst.value, 2)}`);
    case 'ld-reg-mem':
      return withPrefix(inst, `LD ${upper(inst.dest)},(${hex(inst.addr)})`);
    case 'ld-reg-reg':
      return withPrefix(inst, `LD ${upper(inst.dest)},${upper(inst.src)}`);
    case 'alu-reg':
      return withPrefix(inst, `${upper(inst.op)} ${upper(inst.src)}`);
    case 'ld-pair-mem':
      return withPrefix(inst, `LD ${upper(inst.pair)},(${hex(inst.addr)})`);
    case 'ld-indexed-pair':
      return withPrefix(
        inst,
        `LD (${upper(inst.indexRegister)}${inst.displacement >= 0 ? '+' : ''}${inst.displacement}),${upper(inst.pair)}`
      );
    case 'ld-pair-indexed':
      return withPrefix(
        inst,
        `LD ${upper(inst.pair)},(${upper(inst.indexRegister)}${inst.displacement >= 0 ? '+' : ''}${inst.displacement})`
      );
    case 'lea':
      return withPrefix(
        inst,
        `LEA ${upper(inst.dest)},${upper(inst.base)}${inst.displacement >= 0 ? '+' : ''}${inst.displacement}`
      );
    case 'inc-pair':
      return withPrefix(inst, `INC ${upper(inst.pair)}`);
    case 'ld-ind-reg':
      return withPrefix(inst, `LD (${upper(inst.dest)}),${upper(inst.src)}`);
    case 'ld-sp-pair':
      return withPrefix(inst, `LD SP,${upper(inst.pair)}`);
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

function collectDirectCalls(instructions) {
  const byTarget = new Map();

  for (const inst of instructions) {
    if (inst.tag !== 'call') {
      continue;
    }
    if (!byTarget.has(inst.target)) {
      byTarget.set(inst.target, []);
    }
    byTarget.get(inst.target).push(inst.pc);
  }

  return byTarget;
}

function collectDirectAbsoluteRam(instructions) {
  const refs = [];

  for (const inst of instructions) {
    if (inst.tag === 'ld-reg-mem' && inst.addr >= DIRECT_RAM_MIN && inst.addr <= DIRECT_RAM_MAX) {
      refs.push({ site: inst.pc, addr: inst.addr, access: 'read8' });
    } else if (inst.tag === 'ld-pair-mem' && inst.addr >= DIRECT_RAM_MIN && inst.addr <= DIRECT_RAM_MAX) {
      refs.push({ site: inst.pc, addr: inst.addr, access: 'read24' });
    }
  }

  return refs;
}

function collectCompanionWrites() {
  return [
    { site: 0x00E945, target: '*(D13FDB)+0', effect: 'write packed byte 0 = preserved low 5 bits OR aligned D13FD8 low-byte high bits' },
    { site: 0x00E969, target: '*(D13FDB)+1', effect: 'write (D13FD8 >> 8) & 0xFF' },
    { site: 0x00E98A, target: '*(D13FDB)+2', effect: 'write (D13FD8 >> 16) & 0xFF' },
    { site: 0x00E9AB, target: '*(D13FDB)+3', effect: 'write (D13FD8 >> 24) & 0xFF; zero for CE 24-bit roots' },
  ];
}

const instructions = disassembleUntilRet(START);
const endPc = instructions[instructions.length - 1].pc;
const size = instructions[instructions.length - 1].nextPc - START;
const calls = collectDirectCalls(instructions);
const directRam = collectDirectAbsoluteRam(instructions);
const companionWrites = collectCompanionWrites();
const callers = scanCallSites(START);

const lines = [];
lines.push('Phase 433 - Trace of 0x00E91E');
lines.push('================================');
lines.push('');
lines.push(`ROM: TI-84_Plus_CE/ROM.rom`);
lines.push(`Function range: ${hex(START)}-${hex(endPc)}`);
lines.push(`Size: ${size} bytes (0x${size.toString(16).toUpperCase()})`);
lines.push(`Instructions decoded: ${instructions.length}`);
lines.push('');
lines.push('High-level read');
lines.push('- Straight-line helper: no local branches, loops, or direct port I/O.');
lines.push('- First action is 0x00DB66(0), the TX-side drain/deassert helper.');
lines.push('- Second action is a 4-byte packed-pointer rewrite into the root pointed to by D13FDB, using the current root pointer stored in D13FD8.');
lines.push('- This matches a pre-re-enumeration descriptor refresh: quiet the line, then restamp companion descriptor header bytes from the active root pointer.');
lines.push('');
lines.push('Direct callers');
for (const site of callers) {
  const label = CALLER_LABELS.get(site) ?? 'unlabeled caller';
  lines.push(`- ${hex(site)} -- ${label}`);
}
lines.push('');
lines.push('Disassembly');
for (const inst of instructions) {
  const note = SITE_NOTES.get(inst.pc);
  lines.push(
    `${hex(inst.pc)}  ${formatBytes(inst.pc, inst.length).padEnd(19)}  ${formatInstruction(inst).padEnd(35)}${note ? ` ; ${note}` : ''}`
  );
}
lines.push('');
lines.push('CALL targets');
for (const [target, sites] of [...calls.entries()].sort((a, b) => a[0] - b[0])) {
  const label = CALL_LABELS.get(target) ?? 'unlabeled helper';
  lines.push(`- ${hex(target)} @ ${sites.map((site) => hex(site)).join(', ')} -- ${label}`);
}
lines.push('');
lines.push('Direct absolute RAM reads');
for (const ref of directRam) {
  const label = RAM_LABELS.get(ref.addr) ?? 'unlabeled RAM';
  lines.push(`- ${hex(ref.addr)} ${ref.access} @ ${hex(ref.site)} -- ${label}`);
}
lines.push('- D13FDB is also dereferenced as a 24-bit pointer slot at 0x00E934, 0x00E943, 0x00E963, 0x00E985, and 0x00E9A6.');
lines.push('');
lines.push('Indirect descriptor writes');
for (const ref of companionWrites) {
  lines.push(`- ${hex(ref.site)} -> ${ref.target} -- ${ref.effect}`);
}
lines.push('');
lines.push('Port I/O');
lines.push('- Direct in 0x00E91E: none.');
lines.push('- Indirect via 0x00DB66(0): clear/deassert 0x3010 bit5 if needed, poll 0x3015 bit7 to idle, clear D1440E on clean completion, and watch D1440F / D177B7 as abort gates.');
lines.push('');
lines.push('Assessment');
lines.push('- 0x00E91E is not a general state machine; it is a compact preparatory stub.');
lines.push('- It refreshes the packed header at the descriptor root pointed to by D13FDB so that bytes +0..+3 once again encode the current D13FD8 root pointer.');
lines.push('- Because the low 5 bits of byte 0 are preserved and the D13FD8 base is 0x20-aligned, byte 0 acts like [existing low-5 control bits] OR [pointer low-byte bits 5..7].');
lines.push('- The three 0x002330 calls then serialize the higher address bytes into +1, +2, and +3.');
lines.push('- This is consistent with a pre-enumerate setup step: restore descriptor/header self-consistency before the later 0x00D9EE / 0x00DA8C / 0x00883C re-enumeration sequence runs.');
lines.push('');
lines.push('Relationship to 0x00E583');
lines.push('- 0x00E583 ends at 0x00E91D, and 0x00E91E starts on the very next byte.');
lines.push('- The two helpers live back-to-back and both use 0x002330 to repack 24-bit pointers into 4-byte headers.');
lines.push('- 0x00E583 patches live sibling-chain nodes during a large walk/cleanup routine; 0x00E91E performs the same kind of pointer-byte refresh on the D13FD8 -> D13FDB descriptor-root pair in a small straight-line helper.');

console.log(lines.join('\n'));

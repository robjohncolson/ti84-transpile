#!/usr/bin/env node

import { readFileSync } from 'fs';

process.emitWarning = () => {};
const { decodeInstruction } = await import('./ez80-decoder.js');

const rom = readFileSync(new URL('./ROM.rom', import.meta.url));

const START = 0x012456;
const TARGET = [0xCD, 0x56, 0x24, 0x01];

const RAM_LABELS = new Map([
  [0xD14082, 'service latch B / D14082'],
  [0xD14078, 'USB/link state byte D14078'],
  [0xD14079, 'USB/link state byte D14079'],
  [0xD1407A, 'USB/link state byte D1407A'],
  [0xD00092, 'IY base + 0x12 (D00092)'],
]);

const PORT_LABELS = new Map([
  [0x3010, 'link port'],
  [0x3080, 'USB controller'],
]);

const CALL_LABELS = new Map([
  [0x00218A, 'ZDS frame helper; stacked args become IX+6 and IX+9'],
  [0x00D9EE, 'larger USB side-band helper (0x3015/0x3014/0x3018 family)'],
  [0x006FAF, 'low-level handshake helper on low ports 0x03/0x0C/0x0A'],
  [0x0123AD, '0x3010 bit1 helper; installer branch exists but is bypassed here'],
  [0x006E84, 'clear D00092 bit2 helper'],
]);

const PORT_MUTATIONS = new Map([
  [0x012460, 'USB controller 0x3080: clear bit 7'],
  [0x01248A, 'USB controller 0x3080: set bit 5'],
  [0x01249F, 'USB controller 0x3080: clear bit 4'],
  [0x0124C4, 'link port 0x3010: clear bit 5'],
  [0x0124D9, 'link port 0x3010: clear bit 4'],
  [0x0124EE, 'link port 0x3010: clear bit 0'],
]);

const NOTES = new Map([
  [0x012456, 'function entry; 0x00218A sets IX frame for stacked 24-bit args'],
  [0x01246F, 'clear D14082 before any port sequencing'],
  [0x012474, 'read second stacked arg at IX+9'],
  [0x012478, 'NZ skips 0x00D9EE side path'],
  [0x01247F, 'all direct callers avoid this helper by passing arg1=1'],
  [0x0124AE, 'read first stacked arg at IX+6'],
  [0x0124B2, 'Z skips 0x006FAF and falls through'],
  [0x0124B4, 'all direct callers avoid this helper by passing arg0=0'],
  [0x0124BC, 'NZ skips the entire 0x3010 cleanup branch'],
  [0x0124FD, 'if reached, push 0 and call 0x0123AD; its installer branch is not taken from here'],
  [0x012507, 'final helper clears D00092 bit 2'],
]);

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return (value & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

function rawBytes(pc, length) {
  return Array.from(rom.slice(pc, pc + length), hexByte).join(' ');
}

function safeDecode(pc) {
  try {
    return decodeInstruction(rom, pc, 'adl');
  } catch {
    return {
      pc,
      length: 1,
      nextPc: pc + 1,
      tag: 'db',
      value: rom[pc] ?? 0,
    };
  }
}

function upper(value) {
  return value == null ? '' : String(value).toUpperCase();
}

function formatInstruction(inst) {
  switch (inst.tag) {
    case 'call':
      return `CALL ${hex(inst.target)}`;
    case 'jp':
      return `JP ${hex(inst.target)}`;
    case 'jp-conditional':
      return `JP ${upper(inst.condition)},${hex(inst.target)}`;
    case 'jr':
      return `JR ${hex(inst.target)}`;
    case 'jr-conditional':
      return `JR ${upper(inst.condition)},${hex(inst.target)}`;
    case 'ret':
      return 'RET';
    case 'push':
      return `PUSH ${upper(inst.pair)}`;
    case 'pop':
      return `POP ${upper(inst.pair)}`;
    case 'rst':
      return `RST ${hex(inst.target, 2)}`;
    case 'nop':
      return 'NOP';
    case 'ld-pair-imm':
      return `LD ${upper(inst.pair)},${hex(inst.value)}`;
    case 'ld-reg-imm':
      return `LD ${upper(inst.dest)},${hex(inst.value, 2)}`;
    case 'ld-reg-reg':
      return `LD ${upper(inst.dest)},${upper(inst.src)}`;
    case 'ld-reg-mem':
      return `LD ${upper(inst.dest)},(${hex(inst.addr)})`;
    case 'ld-mem-reg':
      return `LD (${hex(inst.addr)}),${upper(inst.src)}`;
    case 'ld-reg-ixd': {
      const disp = inst.displacement >= 0 ? `+${inst.displacement}` : `${inst.displacement}`;
      return `LD ${upper(inst.dest)},(${upper(inst.indexRegister)}${disp})`;
    }
    case 'ld-pair-indexed': {
      const disp = inst.displacement >= 0 ? `+${inst.displacement}` : `${inst.displacement}`;
      return `LD ${upper(inst.pair)},(${upper(inst.indexRegister)}${disp})`;
    }
    case 'ld-sp-pair':
      return `LD SP,${upper(inst.pair)}`;
    case 'in-reg':
      return `IN ${upper(inst.reg)},(C)`;
    case 'out-reg':
      return `OUT (C),${upper(inst.reg)}`;
    case 'alu-reg':
      return `${upper(inst.op)} ${upper(inst.src)}`;
    case 'alu-imm':
      return `${upper(inst.op)} ${hex(inst.value, 2)}`;
    case 'bit-res':
      return `RES ${inst.bit},${upper(inst.reg)}`;
    case 'bit-set':
      return `SET ${inst.bit},${upper(inst.reg)}`;
    case 'db':
      return `DB ${hex(inst.value, 2)}`;
    default:
      return `[${inst.tag}]`;
  }
}

const callSites = [];
for (let pc = 0; pc <= rom.length - TARGET.length; pc++) {
  if (TARGET.every((byte, index) => rom[pc + index] === byte)) {
    const arg1 = rom[pc - 9] | (rom[pc - 8] << 8) | (rom[pc - 7] << 16);
    const arg0 = rom[pc - 4] | (rom[pc - 3] << 8) | (rom[pc - 2] << 16);
    callSites.push({ pc, arg0, arg1 });
  }
}

const rows = [];
const callTargets = new Set();
const ramWrites = new Set();
const portWrites = [];
let bcValue = null;
let endPc = START;

for (let pc = START; ; ) {
  const inst = safeDecode(pc);

  if (inst.tag === 'ld-pair-imm' && String(inst.pair).toLowerCase() === 'bc') {
    bcValue = inst.value >>> 0;
  }

  if (inst.tag === 'ld-mem-reg' && inst.addr >= 0xD00000 && inst.addr <= 0xD3FFFF) {
    ramWrites.add(inst.addr >>> 0);
  }

  if (inst.tag === 'call') {
    callTargets.add(inst.target >>> 0);
  }

  if (inst.tag === 'out-reg' && bcValue != null) {
    portWrites.push({ pc, port: bcValue & 0xFFFF, note: PORT_MUTATIONS.get(pc) ?? '' });
  }

  const annotations = [];

  if (inst.tag === 'call' && CALL_LABELS.has(inst.target)) {
    annotations.push(CALL_LABELS.get(inst.target));
  }

  if (inst.tag === 'ld-mem-reg' && inst.addr >= 0xD00000 && inst.addr <= 0xD3FFFF) {
    const label = RAM_LABELS.get(inst.addr);
    annotations.push(label ? `RAM write ${hex(inst.addr)} (${label})` : `RAM write ${hex(inst.addr)}`);
  }

  if (inst.tag === 'out-reg' && bcValue != null) {
    const label = PORT_LABELS.get(bcValue & 0xFFFF);
    annotations.push(label ? `port write ${hex(bcValue & 0xFFFF, 4)} (${label})` : `port write ${hex(bcValue & 0xFFFF, 4)}`);
  }

  if (inst.tag === 'in-reg' && bcValue != null) {
    const label = PORT_LABELS.get(bcValue & 0xFFFF);
    annotations.push(label ? `port read ${hex(bcValue & 0xFFFF, 4)} (${label})` : `port read ${hex(bcValue & 0xFFFF, 4)}`);
  }

  if (PORT_MUTATIONS.has(pc)) {
    annotations.push(PORT_MUTATIONS.get(pc));
  }

  if (NOTES.has(pc)) {
    annotations.push(NOTES.get(pc));
  }

  rows.push(
    `${hex(pc)}  ${rawBytes(pc, inst.length).padEnd(17, ' ')} ${formatInstruction(inst).padEnd(26, ' ')}${annotations.length ? ` ; ${annotations.join(' | ')}` : ''}`
  );

  endPc = pc + inst.length - 1;
  if (inst.tag === 'ret') {
    break;
  }

  pc = inst.nextPc > pc ? inst.nextPc : pc + 1;
}

const lines = [];
lines.push('# Phase 420 Probe: Static Trace of 0x012456', '');
lines.push(`Function span: ${hex(START)}..${hex(endPc)} (${endPc - START + 1} bytes, ${rows.length} decoded instructions)`);
lines.push('');
lines.push('Direct CALL sites to 0x012456:');
for (const site of callSites) {
  lines.push(`- ${hex(site.pc)} pushes arg1=${hex(site.arg1)} then arg0=${hex(site.arg0)} => IX+9=${hex(site.arg1)}, IX+6=${hex(site.arg0)}`);
}
lines.push('');
lines.push('Disassembly:');
lines.push(...rows);
lines.push('');
lines.push('Direct RAM writes:');
for (const addr of [...ramWrites].sort((a, b) => a - b)) {
  const label = RAM_LABELS.get(addr);
  lines.push(`- ${hex(addr)}${label ? ` (${label})` : ''}`);
}
lines.push('');
lines.push('Direct port writes present in the function body:');
for (const entry of portWrites) {
  lines.push(`- ${hex(entry.pc)} -> ${hex(entry.port, 4)}${entry.note ? ` (${entry.note})` : ''}`);
}
lines.push('');
lines.push('Direct call targets:');
for (const target of [...callTargets].sort((a, b) => a - b)) {
  lines.push(`- ${hex(target)}${CALL_LABELS.has(target) ? ` (${CALL_LABELS.get(target)})` : ''}`);
}
lines.push('');
lines.push('Live-path assessment from direct callers:');
lines.push('- Every direct caller passes IX+9=1 and IX+6=0.');
lines.push('- That means the 0x00D9EE branch is skipped, the 0x006FAF branch is skipped, and the JR NZ at 0x0124BC jumps over the entire 0x3010 cleanup block.');
lines.push('- The observed live path only touches port 0x3080 directly: clear bit 7, set bit 5, clear bit 4.');
lines.push('- The only direct RAM initialization in the live path is D14082=0, followed by the 0x006E84 helper clearing D00092 bit 2.');
lines.push('- No 0x316x/0x318x endpoint-family ports are touched here, so this is not a per-endpoint FIFO/config writer.');

console.log(lines.join('\n'));

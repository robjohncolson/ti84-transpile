#!/usr/bin/env node

import { readFileSync } from 'fs';

process.emitWarning = () => {};
const { decodeInstruction } = await import('./ez80-decoder.js');

const rom = readFileSync(new URL('./ROM.rom', import.meta.url));

const START = 0x014D48;
const END = 0x014DAB;

const CHANNELS = [
  { name: 'Channel 1', base: 0xD14405 },
  { name: 'Channel 2', base: 0xD17770 },
  { name: 'Channel 3', base: 0xD176C0 },
];

const FIELD_LABELS = new Map([
  [0x00, 'callback pointer slot'],
  [0x03, '24-bit compare/parameter slot'],
  [0x06, '24-bit D14038 snapshot slot'],
  [0x09, 'armed/active flag'],
  [0x0A, 'completion/status flag'],
]);

const CAVEAT =
  'The local decoder prints the repeated DD 31 06 opcodes as "LD IX,(IX+6)". ' +
  'That exact reading conflicts with the IX-frame epilogue at 0x014DA6, so the ' +
  'stable signal in this window is the IY-relative field traffic (+0/+3/+6/+9/+10) ' +
  'plus the caller-side PUSH BC in 0x014DAB.';

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return (value & 0xff).toString(16).toUpperCase().padStart(2, '0');
}

function signedDisp(value) {
  return value >= 0 ? `+${value}` : `${value}`;
}

function rawBytes(pc, length) {
  return Array.from(rom.slice(pc, pc + length), hexByte).join(' ');
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

function formatIndexed(base, displacement) {
  return `(${String(base).toUpperCase()}${signedDisp(displacement)})`;
}

function formatInstruction(inst) {
  switch (inst.tag) {
    case 'call':
      return `CALL ${hex(inst.target)}`;
    case 'jr':
      return `JR ${hex(inst.target)}`;
    case 'jr-conditional':
      return `JR ${String(inst.condition).toUpperCase()},${hex(inst.target)}`;
    case 'ret':
      return 'RET';
    case 'pop':
      return `POP ${String(inst.pair).toUpperCase()}`;
    case 'ld-pair-imm':
      return `LD ${String(inst.pair).toUpperCase()},${hex(inst.value)}`;
    case 'ld-pair-mem':
      return `LD ${String(inst.pair).toUpperCase()},(${hex(inst.addr)})`;
    case 'ld-reg-ixd':
      return `LD ${String(inst.dest).toUpperCase()},${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-pair-indexed':
      return `LD ${String(inst.pair).toUpperCase()},${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-indexed-pair':
      return `LD ${formatIndexed(inst.indexRegister, inst.displacement)},${String(inst.pair).toUpperCase()}`;
    case 'ld-ixiy-indexed':
      return `LD ${String(inst.dest).toUpperCase()},${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-ixd-imm':
      return `LD ${formatIndexed(inst.indexRegister, inst.displacement)},${hex(inst.value, 2)}`;
    case 'alu-reg':
      return `${String(inst.op).toUpperCase()} ${String(inst.src).toUpperCase()}`;
    case 'sbc-pair':
      return `SBC HL,${String(inst.src).toUpperCase()}`;
    case 'ld-sp-pair':
      return `LD SP,${String(inst.pair).toUpperCase()}`;
    case 'db':
      return `DB ${hex(inst.value, 2)}`;
    default:
      return `[${inst.tag}]`;
  }
}

function channelFieldNote(inst) {
  const displacement = inst?.displacement;
  if (inst?.indexRegister !== 'iy' || !FIELD_LABELS.has(displacement)) {
    return null;
  }

  return `channel_base+${hex(displacement, 2)} ${FIELD_LABELS.get(displacement)}`;
}

function annotate(pc, inst) {
  const fieldNote = channelFieldNote(inst);

  switch (pc) {
    case 0x014D48:
      return 'allocate a 3-byte IX frame';
    case 0x014D4C:
      return 'common ZDS stack-frame helper (0x002197)';
    case 0x014D50:
      return 'repeated compiler-generated indexed setup opcode; see caveat below';
    case 0x014D57:
      return 'return immediately when the armed/active flag is 0';
    case 0x014D60:
      return 'return immediately when the completion/status flag is already non-zero';
    case 0x014D62:
      return 'load global rolling counter D14038';
    case 0x014D69:
      return fieldNote ?? 'load the channel snapshot field';
    case 0x014D6D:
      return 'elapsed = D14038 - channel_base+0x06';
    case 0x014D6F:
      return 'save the elapsed value in a 24-bit scratch slot';
    case 0x014D75:
      return fieldNote ?? 'load the second 24-bit channel field';
    case 0x014D7C:
      return 'elapsed - channel_base+0x03';
    case 0x014D7E:
      return 'return while elapsed is still below the compare threshold';
    case 0x014D83:
      return fieldNote ?? 'mark the channel as completed';
    case 0x014D8A:
      return fieldNote ?? 'load callback pointer';
    case 0x014D8D:
      return 'null-check helper for HL';
    case 0x014D91:
      return 'skip callback dispatch when the callback slot is null';
    case 0x014D96:
      return fieldNote ?? 'follow callback pointer into IY for the trampoline call';
    case 0x014D99:
      return '0x002288 is the shared JP (IY) indirect-call trampoline';
    case 0x014DA2:
      return fieldNote ?? 'null-callback path: clear the armed flag';
    case 0x014DA6:
      return 'collapse the IX frame';
    case 0x014DA8:
      return 'restore caller IX';
    case 0x014DAA:
      return 'return to 0x014DAB';
    default:
      return fieldNote;
  }
}

console.log('# Phase 419 Probe: Static Trace of 0x014D48', '');
console.log(`Function window: ${hex(START)}..${hex(END - 1)} (${END - START} bytes)`);
console.log('');
console.log('Caller-side channel bases from 0x014DAB:');
for (const channel of CHANNELS) {
  console.log(`- ${channel.name}: BC = ${hex(channel.base)}`);
}
console.log('');
console.log('Decoder caveat:');
console.log(`- ${CAVEAT}`);
console.log('');
console.log('Disassembly:');

const callTargets = new Set();
const offsetReads = new Set();
const offsetWrites = new Set();

for (let pc = START; pc < END; ) {
  const inst = safeDecode(pc);
  const bytes = rawBytes(pc, inst.length).padEnd(17, ' ');
  const mnemonic = formatInstruction(inst).padEnd(27, ' ');
  const note = annotate(pc, inst);

  if (inst.tag === 'call') {
    callTargets.add(inst.target >>> 0);
  }

  if (inst.indexRegister === 'iy' && FIELD_LABELS.has(inst.displacement)) {
    if (inst.tag === 'ld-ixd-imm' || inst.tag === 'ld-indexed-pair') {
      offsetWrites.add(inst.displacement);
    } else if (inst.tag === 'ld-reg-ixd' || inst.tag === 'ld-pair-indexed' || inst.tag === 'ld-ixiy-indexed') {
      offsetReads.add(inst.displacement);
    }
  }

  console.log(`${hex(pc)}  ${bytes} ${mnemonic}${note ? ` ; ${note}` : ''}`);
  pc = inst.nextPc;
}

console.log('');
console.log('Observed channel-relative offsets:');
for (const displacement of [0x00, 0x03, 0x06, 0x09, 0x0A]) {
  const reads = offsetReads.has(displacement) ? 'read' : '-';
  const writes = offsetWrites.has(displacement) ? 'write' : '-';
  console.log(`- +${hex(displacement, 2)}: ${FIELD_LABELS.get(displacement)} (reads: ${reads}, writes: ${writes})`);
}

console.log('');
console.log('Call targets:');
for (const target of Array.from(callTargets).sort((a, b) => a - b)) {
  let label = '';
  if (target === 0x002197) label = ' - stack-frame helper';
  if (target === 0x0021C2) label = ' - HL null check';
  if (target === 0x002288) label = ' - JP (IY) trampoline';
  console.log(`- ${hex(target)}${label}`);
}

console.log('');
console.log('High-level behavior:');
console.log('- If channel_base+0x09 == 0, return.');
console.log('- If channel_base+0x0A != 0, return.');
console.log('- Compute elapsed = D14038 - channel_base+0x06.');
console.log('- Compare elapsed against channel_base+0x03; return until elapsed reaches that value.');
console.log('- On success, set channel_base+0x0A = 1.');
console.log('- If channel_base+0x00 is non-null, load it into IY and dispatch through 0x002288.');
console.log('- If channel_base+0x00 is null, clear channel_base+0x09 and return.');

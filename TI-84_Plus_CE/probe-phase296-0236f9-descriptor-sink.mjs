#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

process.emitWarning = () => {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { decodeInstruction } = await import(
  pathToFileURL(path.join(__dirname, 'ez80-decoder.js')).href,
);

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const rom = readFileSync(ROM_PATH);

const START_ADDR = 0x0236F9;
const MAX_INSTRUCTIONS = 128;

const KNOWN_ADDRS = new Map([
  [0xD0058C, 'kbdScanCode / scan code latch'],
  [0xD0058E, 'keyExtend'],
  [0xD007E0, 'cxCurApp'],
]);

const KNOWN_RANGES = [
  { start: 0xD02500, endExclusive: 0xD02511, label: 'token table pointer window (D02500-D02510)' },
];

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function upper(value) {
  return String(value ?? '').toUpperCase();
}

function bytesToHex(bytes) {
  return Array.from(bytes, (value) => hexByte(value)).join(' ');
}

function formatDisplacement(value) {
  const displacement = Number(value) || 0;
  return displacement < 0 ? `-${hexByte(Math.abs(displacement))}` : `+${hexByte(displacement)}`;
}

function indexed(indexRegister, displacement) {
  return `(${upper(indexRegister)}${formatDisplacement(displacement)})`;
}

function formatInstruction(inst) {
  const prefix = inst.modePrefix ? `${inst.modePrefix} ` : '';

  switch (inst.tag) {
    case 'push':
      return `${prefix}PUSH ${upper(inst.pair)}`;
    case 'pop':
      return `${prefix}POP ${upper(inst.pair)}`;
    case 'ret':
      return `${prefix}RET`;
    case 'reti':
      return `${prefix}RETI`;
    case 'retn':
      return `${prefix}RETN`;
    case 'ret-conditional':
      return `${prefix}RET ${upper(inst.condition)}`;
    case 'jp':
      return `${prefix}JP ${hex(inst.target)}`;
    case 'jp-conditional':
      return `${prefix}JP ${upper(inst.condition)}, ${hex(inst.target)}`;
    case 'jp-indirect':
      return `${prefix}JP (${upper(inst.indirectRegister ?? 'HL')})`;
    case 'jr':
      return `${prefix}JR ${hex(inst.target)}`;
    case 'jr-conditional':
      return `${prefix}JR ${upper(inst.condition)}, ${hex(inst.target)}`;
    case 'call':
      return `${prefix}CALL ${hex(inst.target)}`;
    case 'call-conditional':
      return `${prefix}CALL ${upper(inst.condition)}, ${hex(inst.target)}`;
    case 'ld-reg-mem':
      return `${prefix}LD ${upper(inst.dest)}, (${hex(inst.addr)})`;
    case 'ld-reg-imm':
      return `${prefix}LD ${upper(inst.dest)}, ${hexByte(inst.value)}`;
    case 'ld-reg-reg':
      return `${prefix}LD ${upper(inst.dest)}, ${upper(inst.src)}`;
    case 'ld-reg-ind':
      return `${prefix}LD ${upper(inst.dest)}, (${upper(inst.src)})`;
    case 'ld-ind-reg':
      return `${prefix}LD (${upper(inst.dest)}), ${upper(inst.src)}`;
    case 'ld-ind-imm':
      return `${prefix}LD (${upper(inst.pair ?? 'HL')}), ${hexByte(inst.value)}`;
    case 'ld-pair-imm':
      return `${prefix}LD ${upper(inst.pair)}, ${hex(inst.value)}`;
    case 'ld-ixd-reg':
      return `${prefix}LD ${indexed(inst.indexRegister, inst.displacement)}, ${upper(inst.src)}`;
    case 'ld-reg-ixd':
      return `${prefix}LD ${upper(inst.dest)}, ${indexed(inst.indexRegister, inst.displacement)}`;
    case 'inc-pair':
      return `${prefix}INC ${upper(inst.pair)}`;
    case 'dec-pair':
      return `${prefix}DEC ${upper(inst.pair)}`;
    case 'inc-reg':
      return `${prefix}INC ${upper(inst.reg)}`;
    case 'dec-reg':
      return `${prefix}DEC ${upper(inst.reg)}`;
    case 'alu-imm':
      return `${prefix}${upper(inst.op)} ${hexByte(inst.value)}`;
    case 'alu-reg':
      return `${prefix}${upper(inst.op)} ${upper(inst.src)}`;
    case 'in-reg':
      return `${prefix}IN ${upper(inst.reg ?? inst.dest ?? 'A')}, (C)`;
    default: {
      const detail = { ...inst };
      delete detail.pc;
      delete detail.length;
      delete detail.nextPc;
      delete detail.mode;
      delete detail.modePrefix;
      delete detail.terminates;
      delete detail.fallthrough;
      return `${prefix}${upper(inst.tag ?? 'UNKNOWN')} ${JSON.stringify(detail)}`;
    }
  }
}

function decodeRow(pc) {
  const inst = decodeInstruction(rom, pc, 'adl');
  const length = Math.max(1, inst?.length ?? 1);
  return {
    pc,
    inst,
    length,
    nextPc: pc + length,
    bytes: bytesToHex(rom.subarray(pc, pc + length)),
    text: formatInstruction(inst),
  };
}

function isTerminator(inst) {
  return Boolean(inst) && (
    inst.tag === 'ret'
    || inst.tag === 'reti'
    || inst.tag === 'retn'
    || inst.tag === 'jp'
    || inst.tag === 'jp-indirect'
    || inst.tag === 'halt'
  );
}

function disassembleFunction(startPc) {
  const rows = [];
  let pc = startPc;

  for (let i = 0; i < MAX_INSTRUCTIONS; i += 1) {
    const row = decodeRow(pc);
    rows.push(row);
    pc = row.nextPc;
    if (isTerminator(row.inst)) {
      break;
    }
  }

  return rows;
}

function describeAddress(address) {
  if (!Number.isInteger(address)) {
    return null;
  }

  const normalized = address >>> 0;
  if (KNOWN_ADDRS.has(normalized)) {
    return KNOWN_ADDRS.get(normalized);
  }

  for (const range of KNOWN_RANGES) {
    if (normalized >= range.start && normalized < range.endExclusive) {
      return range.label;
    }
  }

  return null;
}

function pointerWriteTarget(inst) {
  if (!inst) {
    return null;
  }

  if (inst.tag === 'ld-ind-reg' || inst.tag === 'ld-ind-imm') {
    return inst.dest ?? inst.pair ?? null;
  }

  if (inst.tag === 'ld-ixd-reg' || inst.tag === 'ld-ixd-imm') {
    return `${inst.indexRegister}${formatDisplacement(inst.displacement)}`;
  }

  return null;
}

function fixedWriteAddress(inst) {
  if (!inst) {
    return null;
  }

  if (inst.tag === 'ld-mem-reg' || inst.tag === 'ld-mem-pair') {
    return inst.addr >>> 0;
  }

  return null;
}

function annotateRow(row, previousRow) {
  const notes = [];
  const { inst } = row;
  if (!inst) {
    return notes;
  }

  if (inst.tag === 'ld-reg-mem') {
    const desc = describeAddress(inst.addr);
    if (desc) {
      notes.push(`reads ${desc}`);
    }
  }

  if (inst.tag === 'ld-mem-reg' || inst.tag === 'ld-mem-pair') {
    const desc = describeAddress(inst.addr);
    if (desc) {
      notes.push(`writes ${desc}`);
    }
  }

  const ptrTarget = pointerWriteTarget(inst);
  if (ptrTarget) {
    notes.push(`writes through caller pointer ${upper(ptrTarget)}`);
  }

  if (inst.tag === 'alu-imm' && inst.op === 'cp') {
    notes.push(`compare against ${hexByte(inst.value)}`);
  }

  if (inst.tag === 'in-reg' && previousRow?.inst?.tag === 'ld-pair-imm' && previousRow.inst.pair === 'bc') {
    notes.push(`samples I/O after loading BC=${hex(previousRow.inst.value)}`);
  }

  if (row.pc === 0x0236FA) {
    notes.push('descriptor/header byte write #1');
  }
  if (row.pc === 0x023700) {
    notes.push('descriptor/header byte write #2');
  }
  if (row.pc === 0x02370C) {
    notes.push('descriptor/header byte write #3');
  }

  return notes;
}

function uniqueBy(array, keyFn) {
  const seen = new Set();
  const result = [];

  for (const item of array) {
    const key = keyFn(item);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(item);
  }

  return result;
}

if (START_ADDR >= rom.length) {
  throw new Error(`Start address ${hex(START_ADDR)} is beyond ROM size ${hex(rom.length)}.`);
}

const rows = disassembleFunction(START_ADDR);
const lastRow = rows.at(-1);
const functionEndInclusive = lastRow.pc + lastRow.length - 1;
const functionSize = functionEndInclusive - START_ADDR + 1;

const stackReads = rows.filter((row) => row.inst?.tag === 'pop' || row.text.includes('(SP'));
const pushRows = rows.filter((row) => row.inst?.tag === 'push');
const pushPairs = new Set(pushRows.map((row) => row.inst.pair));
const hasStackOffsetLoads = rows.some((row) => row.text.includes('(SP'));
const nonRestorePops = stackReads.filter((row) => row.inst?.tag === 'pop' && !pushPairs.has(row.inst.pair));
const consumesDescriptorFromStack = hasStackOffsetLoads || nonRestorePops.length > 0;

const callTargets = rows
  .filter((row) => row.inst?.tag === 'call' || row.inst?.tag === 'call-conditional')
  .map((row) => ({ pc: row.pc, target: row.inst.target >>> 0 }));

const compareRows = rows.filter((row) => row.inst?.tag === 'alu-imm' && row.inst.op === 'cp');

const fixedWrites = rows
  .map((row) => ({ pc: row.pc, addr: fixedWriteAddress(row.inst) }))
  .filter((entry) => Number.isInteger(entry.addr));

const pointerWrites = rows
  .map((row) => ({ pc: row.pc, target: pointerWriteTarget(row.inst) }))
  .filter((entry) => entry.target);

const knownRefs = uniqueBy(
  rows.flatMap((row) => {
    const inst = row.inst;
    const refs = [];
    const addr = inst?.addr;
    if (Number.isInteger(addr)) {
      const desc = describeAddress(addr);
      if (desc) {
        refs.push({ pc: row.pc, addr: addr >>> 0, desc });
      }
    }
    return refs;
  }),
  (entry) => `${entry.pc}:${entry.addr}`,
);

const hasScanCodeRef = knownRefs.some((entry) => entry.addr === 0xD0058C);
const hasTokenTableWindowRef = knownRefs.some(
  (entry) => entry.addr >= 0xD02500 && entry.addr <= 0xD02510,
);

const lines = [];

lines.push('# Phase 296 - 0x0236F9 Descriptor Sink Probe');
lines.push('');
lines.push(`Generated by \`probe-phase296-0236f9-descriptor-sink.mjs\` on ${new Date().toISOString()}.`);
lines.push('');
lines.push('## Scope');
lines.push('');
lines.push(`- ROM: \`${path.basename(ROM_PATH)}\` (${rom.length} bytes)`);
lines.push(`- Function start: \`${hex(START_ADDR)}\``);
lines.push(`- Function end: \`${hex(functionEndInclusive)}\``);
lines.push(`- Function size: \`${functionSize}\` bytes across \`${rows.length}\` decoded instructions`);
lines.push('');
lines.push('## Disassembly');
lines.push('');
lines.push('```text');
for (let index = 0; index < rows.length; index += 1) {
  const row = rows[index];
  const notes = annotateRow(row, rows[index - 1]);
  const rendered = `${hex(row.pc)}: ${row.bytes.padEnd(14, ' ')} ${row.text}`;
  lines.push(notes.length ? `${rendered}  ; ${notes.join('; ')}` : rendered);
}
lines.push('```');
lines.push('');
lines.push('## Key Findings');
lines.push('');
lines.push(`- Stack reads: ${stackReads.length === 0 ? 'none' : stackReads.map((row) => `${hex(row.pc)} ${row.text}`).join(', ')}.`);
lines.push(`- Descriptor-consuming stack reads: ${consumesDescriptorFromStack ? 'present' : 'none detected; stack traffic is only register save/restore'}.`);
lines.push(`- Memory writes: ${fixedWrites.length === 0 ? 'no fixed-address stores' : fixedWrites.map((entry) => `${hex(entry.pc)} -> ${hex(entry.addr)}`).join(', ')}; pointer writes: ${pointerWrites.length === 0 ? 'none' : pointerWrites.map((entry) => `${hex(entry.pc)} via ${upper(entry.target)}`).join(', ')}.`);
lines.push(`- CP filters: ${compareRows.length === 0 ? 'none' : compareRows.map((row) => `${hex(row.pc)} compares A against ${hexByte(row.inst.value)}`).join(', ')}.`);
lines.push(`- CALL targets: ${callTargets.length === 0 ? 'none inside this function' : callTargets.map((entry) => `${hex(entry.pc)} -> ${hex(entry.target)}`).join(', ')}.`);
lines.push(`- Known OS refs: ${knownRefs.length === 0 ? 'none' : knownRefs.map((entry) => `${hex(entry.pc)} -> ${hex(entry.addr)} (${entry.desc})`).join(', ')}.`);
lines.push(`- D0058C reference: ${hasScanCodeRef ? 'yes' : 'no'}.`);
lines.push(`- D02500-D02510 reference: ${hasTokenTableWindowRef ? 'yes' : 'no'}.`);
lines.push('- The routine performs three consecutive writes through caller-supplied `HL`, not to a fixed queue address. That means this code finalizes an in-place descriptor/header rather than enqueueing it into an obvious global buffer.');
lines.push('- `CP 0x4E` gates whether the third byte is left as `0x00` or replaced with `keyExtend` from `0xD0058E`.');
lines.push('- After the writes, the routine backs `HL` up by two bytes, loads `BC=0x00DCA0`, performs `IN A,(C)`, restores `BC`, and returns. There are no nested `CALL`s to a downstream executor here.');
lines.push('- Taken in isolation, `0x0236F9` does not look like the actual token queue sink. It looks like a short descriptor finalizer that stamps context bytes into the caller-owned 6-byte record.');

console.log(lines.join('\n'));

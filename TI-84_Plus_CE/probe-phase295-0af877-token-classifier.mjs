#!/usr/bin/env node

import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

process.emitWarning = () => {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { decodeInstruction } = await import(pathToFileURL(path.join(__dirname, 'ez80-decoder.js')).href);

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const START_ADDR = 0x0AF877;
const CALLER_ADDR = 0x0AF408;
const BYTE_BUDGET = 300;
const END_ADDR = START_ADDR + BYTE_BUDGET;

const D0058E = 0xD0058E;
const D02661 = 0xD02661;
const D02662 = 0xD02662;

const KNOWN_ADDRS = new Map([
  [D0058E, 'D0058E keyExtend'],
  [D02661, 'D02661 state byte'],
  [D02662, 'D02662 state code'],
]);

const rom = readFileSync(ROM_PATH);

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
  return Array.from(bytes, (value) => value.toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

function addrLabel(addr) {
  return KNOWN_ADDRS.get(addr) ? `${hex(addr)} [${KNOWN_ADDRS.get(addr)}]` : hex(addr);
}

function formatInstruction(inst) {
  switch (inst?.tag) {
    case 'push':
      return `PUSH ${upper(inst.pair)}`;
    case 'pop':
      return `POP ${upper(inst.pair)}`;
    case 'ret':
      return 'RET';
    case 'ret-conditional':
      return `RET ${upper(inst.condition)}`;
    case 'call':
      return `CALL ${hex(inst.target)}`;
    case 'call-conditional':
      return `CALL ${upper(inst.condition)}, ${hex(inst.target)}`;
    case 'jr':
      return `JR ${hex(inst.target)}`;
    case 'jr-conditional':
      return `JR ${upper(inst.condition)}, ${hex(inst.target)}`;
    case 'jp':
      return `JP ${hex(inst.target)}`;
    case 'jp-conditional':
      return `JP ${upper(inst.condition)}, ${hex(inst.target)}`;
    case 'ld-reg-reg':
      return `LD ${upper(inst.dest ?? inst.dst)}, ${upper(inst.src)}`;
    case 'ld-reg-mem':
      return `LD ${upper(inst.dest ?? inst.dst)}, (${addrLabel(inst.addr)})`;
    case 'ld-reg-imm':
      return `LD ${upper(inst.dest ?? inst.dst)}, ${hexByte(inst.value)}`;
    case 'ld-pair-imm':
      return `LD ${upper(inst.pair)}, ${hex(inst.value)}`;
    case 'ld-reg-ind':
      return `LD ${upper(inst.dest)}, (${upper(inst.src)})`;
    case 'ld-ind-reg':
      return `LD (${upper(inst.dest)}), ${upper(inst.src)}`;
    case 'ld-ind-imm':
      return `LD (HL), ${hexByte(inst.value)}`;
    case 'alu-imm':
      return `${upper(inst.op)} ${hexByte(inst.value)}`;
    case 'alu-reg':
      return `${upper(inst.op)} ${upper(inst.src)}`;
    case 'inc-reg':
      return `INC ${upper(inst.reg)}`;
    case 'dec-reg':
      return `DEC ${upper(inst.reg)}`;
    case 'inc-pair':
      return `INC ${upper(inst.pair)}`;
    case 'dec-pair':
      return `DEC ${upper(inst.pair)}`;
    case 'indexed-cb-bit':
      return `BIT ${inst.bit}, (${upper(inst.indexRegister)}${inst.displacement >= 0 ? '+' : ''}${inst.displacement})`;
    case 'indexed-cb-set':
      return `SET ${inst.bit}, (${upper(inst.indexRegister)}${inst.displacement >= 0 ? '+' : ''}${inst.displacement})`;
    case 'indexed-cb-res':
      return `RES ${inst.bit}, (${upper(inst.indexRegister)}${inst.displacement >= 0 ? '+' : ''}${inst.displacement})`;
    default: {
      const extras = { ...inst };
      delete extras.pc;
      delete extras.length;
      delete extras.nextPc;
      delete extras.mode;
      delete extras.modePrefix;
      return `${upper(inst?.tag ?? 'unknown')} ${JSON.stringify(extras)}`;
    }
  }
}

function isConditionalTransfer(inst) {
  return inst?.tag === 'jr-conditional' || inst?.tag === 'jp-conditional' || inst?.tag === 'ret-conditional';
}

function isUnconditionalTransfer(inst) {
  return inst?.tag === 'jr' || inst?.tag === 'jp' || inst?.tag === 'ret';
}

function inBudget(addr) {
  return addr >= START_ADDR && addr < END_ADDR;
}

function decodeReachable(entryPc) {
  const queue = [entryPc];
  const blockStarts = new Set();
  const rowsByPc = new Map();

  while (queue.length) {
    const blockPc = queue.shift();
    if (!inBudget(blockPc) || blockStarts.has(blockPc)) continue;

    blockStarts.add(blockPc);
    let pc = blockPc;

    while (inBudget(pc)) {
      if (rowsByPc.has(pc) && pc !== blockPc) break;

      const inst = decodeInstruction(rom, pc, 'adl');
      const length = Number(inst?.length || 0);
      if (!length) {
        throw new Error(`Decoder returned an invalid instruction at ${hex(pc)}`);
      }

      rowsByPc.set(pc, {
        pc,
        length,
        bytes: bytesToHex(rom.subarray(pc, pc + length)),
        inst,
      });

      if (inst.tag === 'jr-conditional' || inst.tag === 'jp-conditional') {
        if (inBudget(inst.target)) queue.push(inst.target);
        if (inBudget(inst.fallthrough)) queue.push(inst.fallthrough);
        break;
      }

      if (inst.tag === 'ret-conditional') {
        if (inBudget(inst.fallthrough)) queue.push(inst.fallthrough);
        break;
      }

      if (inst.tag === 'jr' || inst.tag === 'jp') {
        if (inBudget(inst.target)) queue.push(inst.target);
        break;
      }

      if (inst.tag === 'ret') break;

      pc = inst.nextPc;
    }
  }

  return {
    blockStarts: [...blockStarts].sort((a, b) => a - b),
    rows: [...rowsByPc.values()].sort((a, b) => a.pc - b.pc),
  };
}

function annotateRows(rows) {
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const notes = [];
    const prev = index > 0 ? rows[index - 1] : null;

    if (row.inst.tag === 'ld-reg-mem' && row.inst.dest === 'a') {
      if (row.inst.addr === D0058E) notes.push('reads D0058E keyExtend');
      if (row.inst.addr === D02661) notes.push('loads state byte used by the first compare');
      if (row.inst.addr === D02662) notes.push('loads state code used by the second compare');
    }

    if (row.inst.tag === 'alu-imm' && row.inst.op === 'cp') {
      if (prev?.inst?.tag === 'ld-reg-mem' && prev.inst.dest === 'a' && prev.inst.addr === D02661) {
        notes.push(`tests whether ${addrLabel(D02661)} equals ${hexByte(row.inst.value)}`);
      } else if (prev?.inst?.tag === 'ld-reg-mem' && prev.inst.dest === 'a' && prev.inst.addr === D02662) {
        notes.push(`tests whether ${addrLabel(D02662)} equals ${hexByte(row.inst.value)}`);
      } else {
        notes.push(`compares A against ${hexByte(row.inst.value)}`);
      }
    }

    if (row.inst.tag === 'ld-reg-reg' && row.inst.dest === 'a' && row.inst.src === 'b') {
      notes.push('restores caller-supplied A before returning');
    }

    if (row.inst.tag === 'jr-conditional' || row.inst.tag === 'jp-conditional') {
      notes.push(`if ${upper(row.inst.condition)} -> ${hex(row.inst.target)}, else -> ${hex(row.inst.fallthrough)}`);
    } else if (row.inst.tag === 'ret-conditional') {
      notes.push(`returns if ${upper(row.inst.condition)}, else continues at ${hex(row.inst.fallthrough)}`);
    } else if (row.inst.tag === 'jr' || row.inst.tag === 'jp') {
      notes.push(`unconditional transfer -> ${hex(row.inst.target)}`);
    }

    row.text = formatInstruction(row.inst);
    row.notes = notes;
  }
}

function sequentialSnippet(start, maxInstructions) {
  const rows = [];
  let pc = start;

  for (let i = 0; i < maxInstructions; i += 1) {
    const inst = decodeInstruction(rom, pc, 'adl');
    const length = Number(inst?.length || 0);
    if (!length) break;
    rows.push({
      pc,
      bytes: bytesToHex(rom.subarray(pc, pc + length)),
      text: formatInstruction(inst),
    });
    pc = inst.nextPc;
  }

  return rows;
}

const disassembly = decodeReachable(START_ADDR);
annotateRows(disassembly.rows);

const d0058eReads = disassembly.rows.filter((row) => row.inst.tag === 'ld-reg-mem' && row.inst.dest === 'a' && row.inst.addr === D0058E);
const cpRows = disassembly.rows.filter((row) => row.inst.tag === 'alu-imm' && row.inst.op === 'cp');
const returnCodeLoads = disassembly.rows.filter((row) => row.inst.tag === 'ld-reg-imm' && row.inst.dest === 'a');
const callerSnippet = sequentialSnippet(CALLER_ADDR, 14);

console.log('# Phase 295: 0x0AF877 Token Classifier / Normalizer Probe');
console.log('');
console.log(`ROM: ${path.basename(ROM_PATH)} (${hex(rom.length)} bytes)`);
console.log(`Entry: ${hex(START_ADDR)}`);
console.log(`Decode budget: ${BYTE_BUDGET} bytes (${hex(START_ADDR)}..${hex(END_ADDR - 1)})`);
console.log('');

console.log('## Reachable Blocks');
console.log('');
for (const blockPc of disassembly.blockStarts) {
  console.log(`- ${hex(blockPc)}`);
}
console.log('');

console.log('## Annotated Disassembly');
console.log('');
for (const row of disassembly.rows) {
  const noteText = row.notes.length ? ` ; ${row.notes.join('; ')}` : '';
  console.log(`${hex(row.pc)}  ${row.bytes.padEnd(15)}  ${row.text}${noteText}`);
}
console.log('');

console.log('## Requested D0058E Read Sites');
console.log('');
if (!d0058eReads.length) {
  console.log('None. No reachable instruction in 0x0AF877 reads `0xD0058E`.');
} else {
  for (const row of d0058eReads) {
    console.log(`- ${hex(row.pc)}  ${row.text}`);
  }
}
console.log('');

console.log('## CP Instructions');
console.log('');
for (const row of cpRows) {
  console.log(`- ${hex(row.pc)}  ${row.text}${row.notes.length ? `  (${row.notes.join('; ')})` : ''}`);
}
console.log('');

console.log('## LD A,imm8 Before RET');
console.log('');
if (!returnCodeLoads.length) {
  console.log('None. There is no `LD A, imm8` in the reachable body, so this function does not synthesize an immediate return code.');
} else {
  for (const row of returnCodeLoads) {
    console.log(`- ${hex(row.pc)}  ${row.text}`);
  }
}
console.log('');

console.log('## Requested KeyExtend Range -> Return Code Map');
console.log('');
console.log('| keyExtend (`0xD0058E`) | return A | evidence |');
console.log('|---|---|---|');
console.log('| any value / not read | unchanged input `A` | `0x0AF877` never reads `0xD0058E`; it saves `A` in `B` at `0x0AF878` and restores `A <- B` at `0x0AF887` before `RET`. |');
console.log('');

console.log('## Actual Predicate Implemented At 0x0AF877');
console.log('');
console.log('| Condition on RAM state | A on return | Flag result |');
console.log('|---|---|---|');
console.log(`| ${addrLabel(D02661)} == ${hexByte(0x83)} and ${addrLabel(D02662)} == ${hexByte(0x03)} | unchanged input \`A\` | Z set |`);
console.log(`| any other combination | unchanged input \`A\` | NZ set |`);
console.log('');

console.log('## Caller Context (0x0AF408 Snippet)');
console.log('');
console.log('This is the start of the supposed follow-on dispatcher. The first compare chain after the call operates on the original `A`, while the branch at `0x0AF40C` uses the flags returned by `0x0AF877`.');
console.log('');
for (const row of callerSnippet) {
  console.log(`${hex(row.pc)}  ${row.bytes.padEnd(15)}  ${row.text}`);
}
console.log('');

console.log('## Summary');
console.log('');
console.log('- `0x0AF877` is not a `D0058E` token classifier in the ROM image at this address.');
console.log('- It does not normalize keyExtend ranges and does not return category codes like `0x01..0x05` via `LD A, imm8`.');
console.log('- Its only observable job is: preserve `A`, compare `0xD02661` against `0x83`, optionally compare `0xD02662` against `0x03`, and return with Z/NZ reflecting that predicate.');
console.log('- The later `CP 0x05 / 0x03 / 0x04 / 0x01 / 0x02 ...` cascade in `0x0AF408` is therefore comparing the caller-supplied `A`, not a new classification code produced by `0x0AF877`.');

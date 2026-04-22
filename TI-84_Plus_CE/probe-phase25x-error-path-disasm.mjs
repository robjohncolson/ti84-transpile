#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const INC_PATH = path.join(__dirname, 'references', 'ti84pceg.inc');

const romBytes = fs.readFileSync(ROM_PATH);

const RANGES = [
  {
    title: 'Failure-path entry 0x08226B..0x082280',
    start: 0x08226b,
    end: 0x082280,
  },
  {
    title: 'OPS/FPS helper 0x0820B5..0x0820D0',
    start: 0x0820b5,
    end: 0x0820d0,
  },
  {
    title: 'Tail / adjacent helper 0x0822A2..0x0822B0',
    start: 0x0822a2,
    end: 0x0822b0,
  },
  {
    title: 'Error site 0x082BB5..0x082BC5',
    start: 0x082bb5,
    end: 0x082bc5,
  },
];

const KNOWN_TARGETS = new Map([
  [0x061d3e, 'ErrMemory'],
  [0x080080, 'type/length selector'],
  [0x0820b5, 'OPS-vs-FPS helper'],
  [0x082266, 'allocator fallback walker'],
  [0x0822a4, 'name/length normalizer'],
  [0x0822ba, 'name/length wrapper'],
  [0x082bb5, 'ErrMemory wrapper entry'],
]);

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).padStart(width, '0')}`;
}

function hexByte(value) {
  return hex(value & 0xff, 2);
}

function loadSymbols() {
  const incText = fs.readFileSync(INC_PATH, 'utf8');
  const symbols = new Map();
  let op1Addr = null;

  for (const line of incText.split(/\r?\n/)) {
    const match = line.match(/^\?([^\s;]+)\s*:=\s*0([0-9a-fA-F]+)h/);
    if (!match) continue;

    const name = match[1];
    const addr = Number.parseInt(match[2], 16);
    if (!symbols.has(addr)) symbols.set(addr, name);
    if (name === 'OP1') op1Addr = addr;
  }

  if (op1Addr !== null) {
    symbols.set(op1Addr + 1, 'OP1+1');
    symbols.set(op1Addr + 3, 'OP1+3');
  }

  return symbols;
}

const SYMBOLS = loadSymbols();

function symbolFor(addr) {
  return SYMBOLS.get(addr) || null;
}

function targetNameFor(addr) {
  return KNOWN_TARGETS.get(addr) || null;
}

function formatInstruction(inst) {
  let text = inst.tag;

  switch (inst.tag) {
    case 'call':
      text = `call ${hex(inst.target)}`;
      break;
    case 'call-conditional':
      text = `call ${inst.condition}, ${hex(inst.target)}`;
      break;
    case 'jp':
      text = `jp ${hex(inst.target)}`;
      break;
    case 'jp-conditional':
      text = `jp ${inst.condition}, ${hex(inst.target)}`;
      break;
    case 'jr':
      text = `jr ${hex(inst.target)}`;
      break;
    case 'jr-conditional':
      text = `jr ${inst.condition}, ${hex(inst.target)}`;
      break;
    case 'ret':
      text = 'ret';
      break;
    case 'ret-conditional':
      text = `ret ${inst.condition}`;
      break;
    case 'push':
      text = `push ${inst.pair}`;
      break;
    case 'pop':
      text = `pop ${inst.pair}`;
      break;
    case 'ex-de-hl':
      text = 'ex de, hl';
      break;
    case 'ex-af':
      text = "ex af, af'";
      break;
    case 'ld-pair-imm':
      text = `ld ${inst.pair}, ${hex(inst.value)}`;
      break;
    case 'ld-pair-mem':
      text = inst.direction === 'to-mem'
        ? `ld (${hex(inst.addr)}), ${inst.pair}`
        : `ld ${inst.pair}, (${hex(inst.addr)})`;
      break;
    case 'ld-mem-pair':
      text = `ld (${hex(inst.addr)}), ${inst.pair}`;
      break;
    case 'ld-reg-imm':
      text = `ld ${inst.dest}, ${hexByte(inst.value)}`;
      break;
    case 'ld-reg-mem':
      text = `ld ${inst.dest}, (${hex(inst.addr)})`;
      break;
    case 'ld-mem-reg':
      text = `ld (${hex(inst.addr)}), ${inst.src}`;
      break;
    case 'ld-reg-ind':
      text = `ld ${inst.dest}, (${inst.src})`;
      break;
    case 'ld-reg-reg':
      text = `ld ${inst.dest}, ${inst.src}`;
      break;
    case 'inc-pair':
      text = `inc ${inst.pair}`;
      break;
    case 'dec-pair':
      text = `dec ${inst.pair}`;
      break;
    case 'inc-reg':
      text = `inc ${inst.reg}`;
      break;
    case 'dec-reg':
      text = `dec ${inst.reg}`;
      break;
    case 'add-pair':
      text = `add ${inst.dest}, ${inst.src}`;
      break;
    case 'alu-reg':
      text = `${inst.op} ${inst.src}`;
      break;
    case 'alu-imm':
      text = `${inst.op} ${hexByte(inst.value)}`;
      break;
    case 'sbc-pair':
      text = `sbc hl, ${inst.src}`;
      break;
    case 'adc-pair':
      text = `adc hl, ${inst.src}`;
      break;
    case 'bit-test-ind':
      text = `bit ${inst.bit}, (${inst.indirectRegister})`;
      break;
    case 'nop':
      text = 'nop';
      break;
    default:
      break;
  }

  if (inst.modePrefix) return `${inst.modePrefix} ${text}`;
  return text;
}

function commentFor(inst) {
  const notes = [];

  if (Number.isInteger(inst.addr)) {
    const symbol = symbolFor(inst.addr);
    if (symbol) notes.push(symbol);
  }

  if (Number.isInteger(inst.value) && inst.tag === 'ld-pair-imm') {
    const symbol = symbolFor(inst.value);
    if (symbol) notes.push(symbol);
  }

  if (Number.isInteger(inst.target)) {
    const label = targetNameFor(inst.target);
    if (label) notes.push(label);
  }

  return notes.length > 0 ? ` ; ${notes.join(' / ')}` : '';
}

function disassembleRange(start, end) {
  const rows = [];
  let pc = start;

  while (pc <= end) {
    const inst = decodeInstruction(romBytes, pc, 'adl');
    const bytes = Array.from(
      romBytes.slice(pc, pc + inst.length),
      (value) => value.toString(16).padStart(2, '0'),
    ).join(' ');

    rows.push({
      pc,
      bytes,
      text: formatInstruction(inst),
      comment: commentFor(inst),
    });

    pc += inst.length;
  }

  return rows;
}

function printRange(range) {
  console.log(`\n== ${range.title} ==`);
  console.log(`ROM bytes ${hex(range.start)}..${hex(range.end)} (decode full instruction when start <= end)\n`);

  for (const row of disassembleRange(range.start, range.end)) {
    console.log(`${hex(row.pc)}: ${row.bytes.padEnd(20)} ${row.text}${row.comment}`);
  }
}

function printSummary() {
  console.log('\n== Derived Conditions ==\n');
  console.log('- 0x0820B5 returns max(OPS - FPS + 1, 0) in HL.');
  console.log('- 0x082266 succeeds immediately only when that HL value is >= requested_size in DE.');
  console.log('- If the primary check fails, the fallback path tests pTemp - (OPBase + 1); carry means no fallback room.');
  console.log('- 0x082BB9 is only "ret nc". Carry falls straight through to 0x082BBA, which is an unconditional "jp ErrMemory".');
  console.log('- The adjacent 0x0822A4 helper is name/length logic for the sibling 0x082BBE wrapper, not the recorded 0x082BB5 failure path.');
}

for (const range of RANGES) {
  printRange(range);
}

printSummary();

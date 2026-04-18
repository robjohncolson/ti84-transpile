#!/usr/bin/env node
// Dump raw VRAM pixel values for the mode row strip to see what's there.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

const MEM_SIZE = 0x1000000;
const VRAM_BASE = 0xD40000;
const VRAM_WIDTH = 320;
const VRAM_HEIGHT = 240;
const MODE_BUF_START = 0xD020A6;
const MODE_BUF_TEXT = 'Normal Float Radian       ';

function coldBoot(executor, cpu, mem) {
  executor.runFrom(0x000000, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = 0xD1A87E - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);
}

const mem = new Uint8Array(MEM_SIZE);
mem.set(romBytes);
mem.fill(0xAA, VRAM_BASE, VRAM_BASE + VRAM_WIDTH * VRAM_HEIGHT * 2);

const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
const executor = createExecutor(BLOCKS, mem, { peripherals });
coldBoot(executor, executor.cpu, mem);

const r1 = executor.runFrom(0x0A2B72, 'adl', { maxSteps: 30000, maxLoopIterations: 10000 });
console.log(`stage1: steps=${r1.steps} term=${r1.termination} lastPc=0x${r1.lastPc.toString(16)}`);

for (let i = 0; i < MODE_BUF_TEXT.length; i++) {
  mem[MODE_BUF_START + i] = MODE_BUF_TEXT.charCodeAt(i);
}

const r3 = executor.runFrom(0x0A29EC, 'adl', { maxSteps: 30000, maxLoopIterations: 10000 });
console.log(`stage3: steps=${r3.steps} term=${r3.termination} lastPc=0x${r3.lastPc.toString(16)}`);

const r4 = executor.runFrom(0x0A2854, 'adl', { maxSteps: 50000, maxLoopIterations: 10000 });
console.log(`stage4: steps=${r4.steps} term=${r4.termination} lastPc=0x${r4.lastPc.toString(16)}`);

// Scan rows 17-34 for non-sentinel pixels. For each row, print:
// - count of sentinel / non-sentinel / white / black / other pixels
// - first 80 cols as symbols: . for white, # for black, _ for other, ? for sentinel
function row(r) {
  let sent = 0, white = 0, black = 0, other = 0;
  let firstNonSent = null, lastNonSent = null;
  const distinctOther = new Set();
  for (let c = 0; c < VRAM_WIDTH; c++) {
    const off = VRAM_BASE + (r * VRAM_WIDTH + c) * 2;
    const px = mem[off] | (mem[off + 1] << 8);
    if (px === 0xAAAA) { sent++; continue; }
    if (firstNonSent === null) firstNonSent = c;
    lastNonSent = c;
    if (px === 0xFFFF) white++;
    else if (px === 0x0000) black++;
    else {
      other++;
      if (distinctOther.size < 10) distinctOther.add(px);
    }
  }
  return { sent, white, black, other, firstNonSent, lastNonSent, distinctOther: [...distinctOther] };
}

console.log('\n=== Row summary rows 0-45 ===');
console.log('row  sent white black other firstNS lastNS distinctOther');
for (let r = 0; r < 46; r++) {
  const s = row(r);
  console.log(`r${r.toString().padStart(2)}  ${s.sent.toString().padStart(4)}  ${s.white.toString().padStart(4)}  ${s.black.toString().padStart(4)}  ${s.other.toString().padStart(4)}  ${(s.firstNonSent ?? -1).toString().padStart(4)}   ${(s.lastNonSent ?? -1).toString().padStart(4)}  ${s.distinctOther.map(x => '0x' + x.toString(16)).join(',')}`);
}

// Dump the first 160 cols of rows 17-34 as symbols
console.log('\n=== Rows 17-34 col 0-159 pixel symbols (.=white #=black ?=sent _=other) ===');
for (let r = 17; r <= 34; r++) {
  let line = `r${r.toString().padStart(2)}: `;
  for (let c = 0; c < 160; c++) {
    const off = VRAM_BASE + (r * VRAM_WIDTH + c) * 2;
    const px = mem[off] | (mem[off + 1] << 8);
    if (px === 0xAAAA) line += '?';
    else if (px === 0xFFFF) line += '.';
    else if (px === 0x0000) line += '#';
    else line += '_';
  }
  console.log(line);
}

// Also check the mode buffer contents before/after running stage 3
console.log('\n=== Mode buffer at 0xD020A6 ===');
let mbuf = '';
for (let i = 0; i < 26; i++) {
  mbuf += String.fromCharCode(mem[MODE_BUF_START + i]);
}
console.log(`mem[0xD020A6..0xD020C0) = "${mbuf}"`);

#!/usr/bin/env node
// Phase 98C follow-up: measure what 0x08c366 ACTUALLY does during its 500k-step run.
// Questions:
//   Q1: Does 0x08c366 write VRAM directly? (how many pixels, where?)
//   Q2: Does it write the mode buffer (0xD020A6..BF) itself?
//   Q3: What's at lastPc=0x006138 — is it a hardware polling loop?
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const mod = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = mod.PRELIFTED_BLOCKS;

const VRAM_BASE = 0xD40000;
const VRAM_SIZE = 320 * 240 * 2;
const VRAM_SENTINEL = 0xAAAA;
const MODE_BUF_START = 0xD020A6;
const MODE_BUF_LEN = 26;

function hex(v, w = 6) { return '0x' + (v >>> 0).toString(16).padStart(w, '0'); }

function clearVram(mem) {
  for (let i = 0; i < VRAM_SIZE; i += 2) {
    mem[VRAM_BASE + i] = 0xAA;
    mem[VRAM_BASE + i + 1] = 0xAA;
  }
}

function countVram(mem) {
  let drawn = 0, fg = 0, bg = 0;
  let rMin = 240, rMax = -1;
  let cMin = 320, cMax = -1;
  const rowDrawn = new Array(240).fill(0);
  const rowFg = new Array(240).fill(0);
  for (let row = 0; row < 240; row++) {
    for (let col = 0; col < 320; col++) {
      const off = VRAM_BASE + (row * 320 + col) * 2;
      const px = mem[off] | (mem[off + 1] << 8);
      if (px === VRAM_SENTINEL) continue;
      drawn++;
      rowDrawn[row]++;
      if (px === 0xFFFF) { bg++; } else { fg++; rowFg[row]++; }
      if (row < rMin) rMin = row;
      if (row > rMax) rMax = row;
      if (col < cMin) cMin = col;
      if (col > cMax) cMax = col;
    }
  }
  return { drawn, fg, bg, rMin, rMax, cMin, cMax, rowDrawn, rowFg };
}

console.log('=== Phase 98C follow-up ===');
console.log('');

// ─── Experiment 1: 0x08c366 cold boot, measure VRAM after 500k steps ─────────
console.log('--- Experiment 1: 0x08c366 cold boot → 500k steps, measure VRAM + mode buffer writes ---');
{
  const mem = new Uint8Array(0x1000000);
  mem.set(romBytes);
  clearVram(mem);
  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  // Cold boot
  executor.runFrom(0x000000, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu.sp = 0xD1A87E - 3; mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  // Trap writes to mode buffer
  const origWrite8 = cpu.write8.bind(cpu);
  const modeBufWrites = [];
  let modeBufWriteCount = 0;
  cpu.write8 = (addr, value) => {
    if (addr >= MODE_BUF_START && addr < MODE_BUF_START + MODE_BUF_LEN) {
      modeBufWriteCount++;
      if (modeBufWrites.length < 100) {
        modeBufWrites.push({ addr, value });
      }
    }
    return origWrite8(addr, value);
  };

  // Also trap VRAM writes to count them (efficient: just count)
  let vramWriteCount = 0;
  const origWrite8b = cpu.write8.bind(cpu);
  cpu.write8 = (addr, value) => {
    if (addr >= VRAM_BASE && addr < VRAM_BASE + VRAM_SIZE) {
      vramWriteCount++;
    }
    return origWrite8b(addr, value);
  };

  // Re-install mode buffer trap (chained on top)
  const prevW = cpu.write8.bind(cpu);
  cpu.write8 = (addr, value) => {
    if (addr >= MODE_BUF_START && addr < MODE_BUF_START + MODE_BUF_LEN) {
      modeBufWriteCount++;
      if (modeBufWrites.length < 100) {
        modeBufWrites.push({ addr, value });
      }
    }
    return prevW(addr, value);
  };

  // Run 0x08c366
  clearVram(mem);
  vramWriteCount = 0;
  modeBufWriteCount = 0;
  modeBufWrites.length = 0;
  const t0 = Date.now();
  const result = executor.runFrom(0x08c366, 'adl', { maxSteps: 500000, maxLoopIterations: 10000 });
  const elapsed = Date.now() - t0;

  console.log(`  steps=${result.steps} term=${result.termination} lastPc=${hex(result.lastPc || 0)}`);
  console.log(`  elapsed: ${elapsed}ms`);
  console.log(`  vramWriteCount=${vramWriteCount}`);
  console.log(`  modeBufWriteCount=${modeBufWriteCount}`);

  const vram = countVram(mem);
  console.log(`  VRAM analysis: drawn=${vram.drawn} fg=${vram.fg} bg=${vram.bg}`);
  if (vram.drawn > 0) {
    console.log(`    bbox rows r${vram.rMin}-r${vram.rMax}, cols c${vram.cMin}-c${vram.cMax}`);
    console.log(`    rows with fg:`);
    for (let r = 0; r < 240; r++) {
      if (vram.rowFg[r] > 0) {
        console.log(`      r${r}: drawn=${vram.rowDrawn[r]} fg=${vram.rowFg[r]}`);
      }
    }
  }

  // Mode buffer final state
  const mbuf = Array.from(mem.slice(MODE_BUF_START, MODE_BUF_START + MODE_BUF_LEN));
  console.log(`  mode buffer final: ${mbuf.map(b => hex(b, 2)).join(' ')}`);
  const modeText = mbuf.map(b => (b >= 0x20 && b < 0x7F) ? String.fromCharCode(b) : '.').join('');
  console.log(`  mode text view: "${modeText}"`);

  if (modeBufWrites.length > 0) {
    console.log(`  first 20 mode buffer writes:`);
    for (const w of modeBufWrites.slice(0, 20)) {
      console.log(`    ${hex(w.addr, 6)} <- ${hex(w.value, 2)}`);
    }
  }
}

// ─── Experiment 2: Static disasm of 0x006138 region ──────────────────────────
console.log('');
console.log('--- Experiment 2: Raw ROM bytes at lastPc=0x006138 ±16 ---');
{
  const addr = 0x006138;
  const before = Array.from(romBytes.slice(addr - 16, addr));
  const at = Array.from(romBytes.slice(addr, addr + 32));
  console.log(`  ${hex(addr - 16)}: ${before.map(b => hex(b, 2)).join(' ')}`);
  console.log(`  ${hex(addr)}: ${at.map(b => hex(b, 2)).join(' ')}  ← lastPc`);

  // Check if 0x006138 is in BLOCKS
  const has = Object.prototype.hasOwnProperty.call(BLOCKS, 0x006138);
  console.log(`  0x006138 in PRELIFTED_BLOCKS: ${has}`);
  if (has) {
    const blk = BLOCKS[0x006138];
    const body = typeof blk === 'function' ? blk.toString().slice(0, 400) : String(blk).slice(0, 400);
    console.log(`  block body (first 400 chars):`);
    console.log(`    ${body.replace(/\n/g, '\n    ')}`);
  }
}

// ─── Experiment 3: Progressive step counts to find turning point ─────────────
console.log('');
console.log('--- Experiment 3: 0x08c366 at various step counts ---');
const stepCounts = [1000, 10000, 50000, 100000, 250000, 500000];
for (const maxSteps of stepCounts) {
  const mem = new Uint8Array(0x1000000);
  mem.set(romBytes);
  clearVram(mem);
  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;
  executor.runFrom(0x000000, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu.sp = 0xD1A87E - 3; mem.fill(0xFF, cpu.sp, cpu.sp + 3);
  clearVram(mem);
  const result = executor.runFrom(0x08c366, 'adl', { maxSteps, maxLoopIterations: 10000 });
  const vram = countVram(mem);
  const d02acc = mem[0xD02ACC];
  const mbufStart = hex(mem[MODE_BUF_START], 2);
  console.log(`  maxSteps=${maxSteps}: steps=${result.steps} term=${result.termination} lastPc=${hex(result.lastPc || 0)} vram.drawn=${vram.drawn} vram.fg=${vram.fg} D02ACC=${hex(d02acc, 2)} buf[0]=${mbufStart}`);
}

console.log('');
console.log('=== Done ===');

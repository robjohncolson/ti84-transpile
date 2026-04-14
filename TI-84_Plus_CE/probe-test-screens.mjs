#!/usr/bin/env node
// Phase 47.3 — probe identified test/info screens via the strings-near-callers scan
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const transpiledPath = path.join(__dirname, 'ROM.transpiled.js');

const VRAM_BASE = 0xD40000;
const VRAM_W = 320, VRAM_H = 240, VRAM_SIZE = VRAM_W * VRAM_H * 2;
const VRAM_SENTINEL = 0xAAAA;

const hex = (v, w = 6) => `0x${(v >>> 0).toString(16).padStart(w, '0')}`;

async function loadBlocks() {
  if (!fs.existsSync(transpiledPath)) {
    const r = spawnSync(process.execPath, [path.join(repoRoot, 'scripts', 'transpile-ti84-rom.mjs')], { cwd: repoRoot, stdio: 'inherit' });
    if (r.status !== 0) process.exit(r.status ?? 1);
  }
  const mod = await import(pathToFileURL(transpiledPath).href);
  return mod.PRELIFTED_BLOCKS;
}

function fillSentinel(mem, start, bytes) { mem.fill(0xff, start, start + bytes); }
function clearVram(mem) {
  for (let off = 0; off < VRAM_SIZE; off += 2) {
    mem[VRAM_BASE + off] = VRAM_SENTINEL & 0xff;
    mem[VRAM_BASE + off + 1] = (VRAM_SENTINEL >> 8) & 0xff;
  }
}
function readPixel(mem, row, col) {
  const off = VRAM_BASE + row * VRAM_W * 2 + col * 2;
  return mem[off] | (mem[off + 1] << 8);
}
function vramStats(mem) {
  let drawn = 0, fg = 0, bg = 0, other = 0;
  let minR = VRAM_H, maxR = -1, minC = VRAM_W, maxC = -1;
  for (let row = 0; row < VRAM_H; row++) {
    for (let col = 0; col < VRAM_W; col++) {
      const px = readPixel(mem, row, col);
      if (px === VRAM_SENTINEL) continue;
      drawn++;
      if (px === 0x0000) fg++;
      else if (px === 0xffff) bg++;
      else other++;
      if (row < minR) minR = row;
      if (row > maxR) maxR = row;
      if (col < minC) minC = col;
      if (col > maxC) maxC = col;
    }
  }
  return { drawn, fg, bg, other, bbox: maxR >= 0 ? { minR, maxR, minC, maxC } : null };
}

async function probeOnce(blocks, addr, label) {
  const peripherals = createPeripheralBus({ trace: false, pllDelay: 2, timerInterrupt: false });
  const mem = new Uint8Array(0x1000000);
  mem.set(romBytes);
  const ex = createExecutor(blocks, mem, { peripherals });
  const cpu = ex.cpu;

  ex.runFrom(0x000000, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu.sp = 0xD1A87E - 3; fillSentinel(mem, cpu.sp, 3);
  ex.runFrom(0x08C331, 'adl', { maxSteps: 100000, maxLoopIterations: 500 });

  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu.hl = 0x000000;
  cpu.sp = 0xD1A87E - 3; fillSentinel(mem, cpu.sp, 3);
  ex.runFrom(0x0802B2, 'adl', { maxSteps: 100, maxLoopIterations: 32 });

  clearVram(mem);
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu._iy = 0xD00080;
  cpu.f = 0x40;
  cpu.sp = 0xD1A87E - 12; fillSentinel(mem, cpu.sp, 12);

  const t0 = Date.now();
  const result = ex.runFrom(addr, 'adl', { maxSteps: 400000, maxLoopIterations: 5000 });
  const ms = Date.now() - t0;
  const stats = vramStats(mem);

  const bboxStr = stats.bbox ? `r${stats.bbox.minR}-${stats.bbox.maxR}c${stats.bbox.minC}-${stats.bbox.maxC}` : 'none';
  console.log(`${label} ${hex(addr)}: steps=${result.steps} ${ms}ms drawn=${stats.drawn} fg=${stats.fg} bg=${stats.bg} bbox=${bboxStr} term=${result.termination}@${hex(result.lastPc)}`);
}

// For each candidate, look for the function START by walking back from the caller
// to find the most recent RET, accounting for the string region.
// Strings + RET pattern: function-start = RET-addr + 1 + string_length, but we need
// the address of the first instruction (CALL) of the function, not just the start of code.
//
// For now: probe several candidate function starts before the caller.
async function main() {
  const blocks = await loadBlocks();
  console.log('=== Phase 47.3 — test/info screens probe ===\n');

  // Keyboard Test family — string at 0x046141, callers 0x046188/0x0461eb/0x046222
  // Probe several candidate function starts
  await probeOnce(blocks, 0x04615c, 'KbdTest entry candidate 1 (0x04615c)');
  await probeOnce(blocks, 0x04617c, 'KbdTest entry candidate 2 (0x04617c)');
  await probeOnce(blocks, 0x046182, 'KbdTest entry candidate 3 (0x046182)');

  // FLASH System Test — string at 0x04622b, callers 0x046272/0x046319
  await probeOnce(blocks, 0x046246, 'FlashTest entry candidate 1 (0x046246)');
  await probeOnce(blocks, 0x046266, 'FlashTest entry candidate 2 (0x046266)');
  await probeOnce(blocks, 0x04626c, 'FlashTest entry candidate 3 (0x04626c)');

  // STORE RESULTS? — string at 0x06af37, caller 0x06b004
  // Function probably starts well before since string is 200 bytes earlier
  await probeOnce(blocks, 0x06aff0, 'StoreResults candidate 1 (0x06aff0)');
  await probeOnce(blocks, 0x06afd0, 'StoreResults candidate 2 (0x06afd0)');
}

await main();

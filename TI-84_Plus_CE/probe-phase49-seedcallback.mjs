#!/usr/bin/env node
// Phase 49.2 - probe the post-boot callback seeds with boot-only setup.
// Do not call 0x08c331 explicitly.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const transpiledPath = path.join(__dirname, 'ROM.transpiled.js');

const BOOT_ENTRY = 0x000000;
const SET_TEXT_FG_ENTRY = 0x0802B2;
const CALLBACK_PTR = 0xD02AD7;
const RAM_SNAPSHOT_START = 0x400000;
const RAM_SNAPSHOT_END = 0xE00000;
const SCREEN_STACK_TOP = 0xD1A87E;
const PROBE_IY = 0xD00080;

const VRAM_BASE = 0xD40000;
const VRAM_WIDTH = 320;
const VRAM_HEIGHT = 240;
const VRAM_SIZE = VRAM_WIDTH * VRAM_HEIGHT * 2;
const VRAM_SENTINEL = 0xAAAA;
const TEXT_FG_COLOR = 0x0000;
const TEXT_BG_COLOR = 0xFFFF;

const PROBES = [
  { addr: 0x015AD9, mode: 'adl' },
  { addr: 0x015ADA, mode: 'adl' },
  { addr: 0x015AD9, mode: 'z80' },
];

const hex = (value, width = 6) => `0x${(value >>> 0).toString(16).padStart(width, '0')}`;

async function loadBlocks() {
  if (!fs.existsSync(transpiledPath)) {
    throw new Error(`Missing ${transpiledPath}; run node scripts/transpile-ti84-rom.mjs first.`);
  }

  const mod = await import(pathToFileURL(transpiledPath).href);
  return mod.PRELIFTED_BLOCKS;
}

function read24(mem, addr) {
  return mem[addr] | (mem[addr + 1] << 8) | (mem[addr + 2] << 16);
}

function fillSentinel(mem, start, bytes) {
  mem.fill(0xFF, start, start + bytes);
}

function buildClearedVramSnapshot() {
  const bytes = new Uint8Array(VRAM_SIZE);

  for (let offset = 0; offset < VRAM_SIZE; offset += 2) {
    bytes[offset] = VRAM_SENTINEL & 0xFF;
    bytes[offset + 1] = (VRAM_SENTINEL >> 8) & 0xFF;
  }

  return bytes;
}

function readPixel(mem, row, col) {
  const offset = VRAM_BASE + row * VRAM_WIDTH * 2 + col * 2;
  return mem[offset] | (mem[offset + 1] << 8);
}

function readPixelFromVram(vram, row, col) {
  const offset = row * VRAM_WIDTH * 2 + col * 2;
  return vram[offset] | (vram[offset + 1] << 8);
}

function snapshotCpu(cpu) {
  return {
    a: cpu.a,
    f: cpu.f,
    _bc: cpu._bc,
    _de: cpu._de,
    _hl: cpu._hl,
    _a2: cpu._a2,
    _f2: cpu._f2,
    _bc2: cpu._bc2,
    _de2: cpu._de2,
    _hl2: cpu._hl2,
    sp: cpu.sp,
    _ix: cpu._ix,
    _iy: cpu._iy,
    i: cpu.i,
    im: cpu.im,
    iff1: cpu.iff1,
    iff2: cpu.iff2,
    madl: cpu.madl,
    mbase: cpu.mbase,
    halted: cpu.halted,
    cycles: cpu.cycles,
  };
}

function restoreCpu(cpu, snapshot) {
  cpu.a = snapshot.a;
  cpu.f = snapshot.f;
  cpu._bc = snapshot._bc;
  cpu._de = snapshot._de;
  cpu._hl = snapshot._hl;
  cpu._a2 = snapshot._a2;
  cpu._f2 = snapshot._f2;
  cpu._bc2 = snapshot._bc2;
  cpu._de2 = snapshot._de2;
  cpu._hl2 = snapshot._hl2;
  cpu.sp = snapshot.sp;
  cpu._ix = snapshot._ix;
  cpu._iy = snapshot._iy;
  cpu.i = snapshot.i;
  cpu.im = snapshot.im;
  cpu.iff1 = snapshot.iff1;
  cpu.iff2 = snapshot.iff2;
  cpu.madl = snapshot.madl;
  cpu.mbase = snapshot.mbase;
  cpu.halted = snapshot.halted;
  cpu.cycles = snapshot.cycles;
}

function restoreBaseState(mem, cpu, ramSnapshot, cpuSnapshot, clearedVram, lcdMmio, lcdSnapshot) {
  mem.set(ramSnapshot, RAM_SNAPSHOT_START);
  mem.set(clearedVram, VRAM_BASE);
  restoreCpu(cpu, cpuSnapshot);

  if (!lcdMmio || !lcdSnapshot) {
    return;
  }

  lcdMmio.upbase = lcdSnapshot.upbase;
  lcdMmio.control = lcdSnapshot.control;
}

function collectVramStats(mem) {
  let drawn = 0;
  let fg = 0;
  let bg = 0;
  let other = 0;
  let minR = VRAM_HEIGHT;
  let maxR = -1;
  let minC = VRAM_WIDTH;
  let maxC = -1;

  for (let row = 0; row < VRAM_HEIGHT; row++) {
    for (let col = 0; col < VRAM_WIDTH; col++) {
      const pixel = readPixel(mem, row, col);
      if (pixel === VRAM_SENTINEL) {
        continue;
      }

      drawn++;

      if (pixel === TEXT_FG_COLOR) fg++;
      else if (pixel === TEXT_BG_COLOR) bg++;
      else other++;

      if (row < minR) minR = row;
      if (row > maxR) maxR = row;
      if (col < minC) minC = col;
      if (col > maxC) maxC = col;
    }
  }

  return {
    drawn,
    fg,
    bg,
    other,
    bbox: maxR >= 0 ? { minR, maxR, minC, maxC } : null,
  };
}

function formatBbox(bbox) {
  if (!bbox) {
    return 'none';
  }

  return `r${bbox.minR}-${bbox.maxR} c${bbox.minC}-${bbox.maxC}`;
}

function bboxSize(bbox) {
  if (!bbox) {
    return { width: 0, height: 0 };
  }

  return {
    width: bbox.maxC - bbox.minC + 1,
    height: bbox.maxR - bbox.minR + 1,
  };
}

function buildAscii(vram, bbox, stride = 2) {
  if (!bbox) {
    return null;
  }

  const lines = [];

  for (let row = bbox.minR; row <= bbox.maxR; row++) {
    let line = `${row.toString().padStart(3, '0')}|`;

    for (let col = bbox.minC; col <= bbox.maxC; col += stride) {
      const pixel = readPixelFromVram(vram, row, col);

      if (pixel === VRAM_SENTINEL) line += ' ';
      else if (pixel === TEXT_BG_COLOR) line += '.';
      else if (pixel === TEXT_FG_COLOR) line += '#';
      else line += '+';
    }

    lines.push(line);
  }

  return lines.join('\n');
}

function writeAsciiDump(result) {
  if (result.drawn <= 1000 || result.fg === 0 || result.bg === 0 || !result.bbox) {
    return null;
  }

  const ascii = buildAscii(result.vram, result.bbox, 2);
  const outPath = path.join(
    __dirname,
    `phase49-015ad9-${result.addr.toString(16).padStart(6, '0')}-${result.mode}.txt`,
  );

  const lines = [
    `addr=${hex(result.addr)}`,
    `mode=${result.mode}`,
    `bootCallback=${hex(result.bootCallback)}`,
    `steps=${result.steps}`,
    `term=${result.termination}@${hex(result.lastPc)}`,
    `drawn=${result.drawn} fg=${result.fg} bg=${result.bg} other=${result.other}`,
    `bbox=${formatBbox(result.bbox)}`,
    'legend: " " = sentinel 0xAAAA, "." = bg 0xFFFF, "#" = fg 0x0000, "+" = other',
    '',
    ascii ?? '',
    '',
  ];

  fs.writeFileSync(outPath, `${lines.join('\n')}\n`);
  return outPath;
}

function looksLikeHomeScreen(result) {
  const { width, height } = bboxSize(result.bbox);
  return (
    result.drawn > 5000 &&
    result.fg > 0 &&
    result.bg > 0 &&
    width >= 260 &&
    height >= 160
  );
}

async function main() {
  const blocks = await loadBlocks();
  const peripherals = createPeripheralBus({ trace: false, pllDelay: 2, timerInterrupt: false });
  const mem = new Uint8Array(0x1000000);
  mem.set(romBytes);

  const ex = createExecutor(blocks, mem, { peripherals });
  const cpu = ex.cpu;
  const lcdMmio = ex.lcdMmio ?? null;
  const clearedVram = buildClearedVramSnapshot();

  const boot = ex.runFrom(BOOT_ENTRY, 'z80', {
    maxSteps: 20000,
    maxLoopIterations: 32,
  });

  const bootCallback = read24(mem, CALLBACK_PTR);

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.hl = 0;
  cpu.sp = SCREEN_STACK_TOP - 3;
  fillSentinel(mem, cpu.sp, 3);

  const setTextFg = ex.runFrom(SET_TEXT_FG_ENTRY, 'adl', {
    maxSteps: 100,
    maxLoopIterations: 32,
  });

  const ramSnapshot = new Uint8Array(mem.subarray(RAM_SNAPSHOT_START, RAM_SNAPSHOT_END));
  const cpuSnapshot = snapshotCpu(cpu);
  const lcdSnapshot = lcdMmio
    ? { upbase: lcdMmio.upbase, control: lcdMmio.control }
    : null;

  console.log('=== Phase 49.2 - post-boot callback probe ===');
  console.log(`boot=${boot.termination}@${hex(boot.lastPc)} steps=${boot.steps}`);
  console.log(`boot_callback=${hex(bootCallback)} at ${hex(CALLBACK_PTR)}`);
  console.log(`set_text_fg=${setTextFg.termination}@${hex(setTextFg.lastPc)} steps=${setTextFg.steps}`);
  console.log('');

  const results = [];
  const asciiPaths = [];

  for (const probe of PROBES) {
    restoreBaseState(mem, cpu, ramSnapshot, cpuSnapshot, clearedVram, lcdMmio, lcdSnapshot);

    cpu.halted = false;
    cpu.iff1 = 0;
    cpu.iff2 = 0;
    cpu._iy = PROBE_IY;
    cpu.f = 0x40;
    cpu.sp = SCREEN_STACK_TOP - 12;
    fillSentinel(mem, cpu.sp, 12);

    const run = ex.runFrom(probe.addr, probe.mode, {
      maxSteps: 500000,
      maxLoopIterations: 5000,
    });

    const stats = collectVramStats(mem);
    const result = {
      ...probe,
      ...stats,
      steps: run.steps,
      termination: run.termination,
      lastPc: run.lastPc,
      bootCallback,
      vram: new Uint8Array(mem.subarray(VRAM_BASE, VRAM_BASE + VRAM_SIZE)),
    };

    const asciiPath = writeAsciiDump(result);
    if (asciiPath) {
      asciiPaths.push(asciiPath);
      result.asciiPath = asciiPath;
    }

    results.push(result);

    console.log(
      `addr=${hex(result.addr)} mode=${result.mode} ` +
      `steps=${result.steps} drawn=${result.drawn} fg=${result.fg} bg=${result.bg} other=${result.other} ` +
      `bbox=${formatBbox(result.bbox)} term=${result.termination}@${hex(result.lastPc)}`,
    );
  }

  console.log('\n=== Final Summary ===');
  for (const result of results) {
    console.log(
      `addr=${hex(result.addr)} mode=${result.mode} ` +
      `steps=${result.steps} drawn=${result.drawn} fg=${result.fg} bg=${result.bg} other=${result.other} ` +
      `bbox=${formatBbox(result.bbox)} term=${result.termination}@${hex(result.lastPc)}`,
    );
  }

  const homeLike = results.filter(looksLikeHomeScreen);
  console.log(
    `verdict=${homeLike.length > 0 ? 'possible_home_screen' : 'not_home_screen'} ` +
    '(criteria: drawn>5000, fg>0, bg>0, bbox>=260x160)',
  );

  if (asciiPaths.length === 0) {
    console.log('ascii_dumps=none');
    return;
  }

  for (const asciiPath of asciiPaths) {
    console.log(`ascii_dump=${asciiPath}`);
  }
}

await main();

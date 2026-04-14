#!/usr/bin/env node
// Phase 48 — hunt for the TI-84 Plus CE home screen via the special
// (0xd007e0) == 0x40 "@" menu-mode dispatches.
//
// Probe plan:
// 1. Boot once, run OS init once, set text fg/bg once.
// 2. Snapshot RAM + CPU after that shared setup.
// 3. For each dispatcher/handler address, run twice:
//    - menu mode 0x40 ("@" hypothesis)
//    - menu mode 0x00 (default/control)
// 4. Score each render for "home-screen-likeness":
//    wide bbox, lots of drawn cells, mostly background, sparse text.
// 5. Save ASCII art for the top unique addresses.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const transpiledPath = path.join(__dirname, 'ROM.transpiled.js');

const BOOT_ENTRY = 0x000000;
const OS_INIT_ENTRY = 0x08C331;
const SET_TEXT_FG_ENTRY = 0x0802B2;
const RAM_SNAPSHOT_START = 0x400000;
const RAM_SNAPSHOT_END = 0xE00000;
const SCREEN_STACK_TOP = 0xD1A87E;
const MENU_MODE_ADDR = 0xD007E0;

const VRAM_BASE = 0xD40000;
const VRAM_W = 320;
const VRAM_H = 240;
const VRAM_SIZE = VRAM_W * VRAM_H * 2;
const VRAM_SENTINEL = 0xAAAA;

const HOME_MODE = 0x40;
const CONTROL_MODE = 0x00;
const ASCII_STRIDE = 2;
const MAX_STEPS = 200000;
const MAX_LOOP_ITERATIONS = 5000;

// Derived from scan-d007e0-dispatch.mjs.
// For jpz/jrz the branch target is the @ handler.
// For jpnz/jrnz the fall-through after the branch is the @ handler.
const HOME_MODE_CASES = [
  { dispatcher: 0x030227, dispatchAt: 0x03022b, branchType: 'jpnz', branchTarget: 0x0302e6, handler: 0x030231 },
  { dispatcher: 0x051b02, dispatchAt: 0x051b16, branchType: 'jrnz', branchTarget: 0x051b20, handler: 0x051b1a },
  { dispatcher: 0x05c72f, dispatchAt: 0x05c73f, branchType: 'jrnz', branchTarget: 0x05c749, handler: 0x05c743 },
  { dispatcher: 0x065b01, dispatchAt: 0x065b05, branchType: 'jrz', branchTarget: 0x065b35, handler: 0x065b35 },
  { dispatcher: 0x06f48b, dispatchAt: 0x06f493, branchType: 'jrnz', branchTarget: 0x06f49d, handler: 0x06f497 },
  { dispatcher: 0x085d9b, dispatchAt: 0x085d9f, branchType: 'jrnz', branchTarget: 0x085da9, handler: 0x085da3 },
  { dispatcher: 0x08774b, dispatchAt: 0x08774f, branchType: 'jrnz', branchTarget: 0x087765, handler: 0x087753 },
  { dispatcher: 0x0884a3, dispatchAt: 0x0884a7, branchType: 'jrz', branchTarget: 0x0884b0, handler: 0x0884b0 },
  { dispatcher: 0x08c007, dispatchAt: 0x08c00b, branchType: 'jrnz', branchTarget: 0x08c021, handler: 0x08c00f },
  { dispatcher: 0x091349, dispatchAt: 0x09134d, branchType: 'jrnz', branchTarget: 0x091364, handler: 0x091351 },
  { dispatcher: 0x0af5e2, dispatchAt: 0x0af5e6, branchType: 'jrnz', branchTarget: 0x0af5fa, handler: 0x0af5ea },
  { dispatcher: 0x0b6ad1, dispatchAt: 0x0b6ad5, branchType: 'jpnz', branchTarget: 0x0b8f40, handler: 0x0b6adb },
];

const PROBE_TARGETS = HOME_MODE_CASES.flatMap((entry) => ([
  {
    addr: entry.dispatcher,
    kind: 'dispatch',
    source: entry.dispatcher,
    dispatchAt: entry.dispatchAt,
    branchType: entry.branchType,
    handler: entry.handler,
  },
  {
    addr: entry.handler,
    kind: 'handler',
    source: entry.dispatcher,
    dispatchAt: entry.dispatchAt,
    branchType: entry.branchType,
    handler: entry.handler,
  },
]));

const hex = (value, width = 6) => `0x${(value >>> 0).toString(16).padStart(width, '0')}`;

async function loadBlocks() {
  if (!fs.existsSync(transpiledPath)) {
    throw new Error(`Missing ${transpiledPath}; Phase 48 assumes ROM.transpiled.js already exists.`);
  }

  const mod = await import(pathToFileURL(transpiledPath).href);
  return mod.PRELIFTED_BLOCKS;
}

function fillSentinel(mem, start, bytes) {
  mem.fill(0xFF, start, start + bytes);
}

function buildClearedVramSnapshot() {
  const bytes = new Uint8Array(VRAM_SIZE);

  for (let off = 0; off < VRAM_SIZE; off += 2) {
    bytes[off] = VRAM_SENTINEL & 0xFF;
    bytes[off + 1] = (VRAM_SENTINEL >> 8) & 0xFF;
  }

  return bytes;
}

function readPixel(mem, row, col) {
  const off = VRAM_BASE + row * VRAM_W * 2 + col * 2;
  return mem[off] | (mem[off + 1] << 8);
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

  if (lcdMmio && lcdSnapshot) {
    lcdMmio.upbase = lcdSnapshot.upbase;
    lcdMmio.control = lcdSnapshot.control;
  }
}

function vramStats(mem) {
  let drawn = 0;
  let fg = 0;
  let bg = 0;
  let other = 0;
  let minR = VRAM_H;
  let maxR = -1;
  let minC = VRAM_W;
  let maxC = -1;

  for (let row = 0; row < VRAM_H; row++) {
    for (let col = 0; col < VRAM_W; col++) {
      const px = readPixel(mem, row, col);
      if (px === VRAM_SENTINEL) continue;

      drawn++;
      if (px === 0x0000) fg++;
      else if (px === 0xFFFF) bg++;
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
  if (!bbox) return 'none';
  return `r${bbox.minR}-${bbox.maxR} c${bbox.minC}-${bbox.maxC}`;
}

function modeLabel(mode) {
  return mode === HOME_MODE ? '0x40 (@)' : '0x00';
}

function scoreHomeLike(stats) {
  if (!stats.bbox) return Number.NEGATIVE_INFINITY;

  const width = stats.bbox.maxC - stats.bbox.minC + 1;
  const height = stats.bbox.maxR - stats.bbox.minR + 1;

  let score = 0;
  score += Math.min(stats.drawn, 25000);
  score += width * 50;
  score += height * 15;
  score += Math.max(0, stats.bg - stats.fg) * 6;
  score -= Math.max(0, stats.fg - stats.bg) * 8;
  score -= stats.other * 3;
  score -= Math.abs(stats.bbox.minC - 0) * 80;
  score -= Math.abs(stats.bbox.maxC - 310) * 20;
  score -= Math.abs(stats.bbox.minR - 30) * 30;
  score -= Math.abs(stats.bbox.maxR - 230) * 20;

  if (stats.drawn <= 1000) score -= 100000;
  if (stats.bg <= stats.fg) score -= 75000;

  return score;
}

function describeHit(result) {
  if (!result.bbox || result.drawn === 0) {
    return 'blank / no visible output';
  }

  const width = result.bbox.maxC - result.bbox.minC + 1;
  const height = result.bbox.maxR - result.bbox.minR + 1;

  if (result.other > result.fg + result.bg) {
    if (width <= 24 && height <= 24) return 'tiny non-text block';
    return 'non-text filled region';
  }

  if (result.fg > 0 && result.bg === 0 && height < 40) {
    return 'solid filled banner block';
  }

  if (result.bg > result.fg && width >= 250 && height >= 150) {
    return 'sparse mostly-empty full-screen candidate';
  }

  if (result.fg > result.bg && height < 50) {
    return 'dense text/graphics strip';
  }

  return 'mixed render';
}

function buildAscii(mem, bbox, stride = ASCII_STRIDE) {
  if (!bbox) return null;

  const lines = [];
  for (let row = bbox.minR; row <= bbox.maxR; row++) {
    let line = `${row.toString().padStart(3, '0')}|`;

    for (let col = bbox.minC; col <= bbox.maxC; col += stride) {
      const px = readPixel(mem, row, col);

      if (px === VRAM_SENTINEL) line += ' ';
      else if (px === 0xFFFF) line += '.';
      else if (px === 0x0000) line += '#';
      else line += '+';
    }

    lines.push(line);
  }

  return lines.join('\n');
}

function writeAsciiFile(result) {
  const outPath = path.join(
    __dirname,
    `phase48-homescreen-${result.addr.toString(16).padStart(6, '0')}.txt`,
  );

  const lines = [
    `addr=${hex(result.addr)}`,
    `kind=${result.kind}`,
    `source=${hex(result.source)}`,
    `dispatchAt=${hex(result.dispatchAt)}`,
    `branchType=${result.branchType}`,
    `mode=${modeLabel(result.mode)}`,
    `steps=${result.steps}`,
    `term=${result.termination}@${hex(result.lastPc)}`,
    `drawn=${result.drawn} fg=${result.fg} bg=${result.bg} other=${result.other}`,
    `bbox=${formatBbox(result.bbox)}`,
    `looksLike=${describeHit(result)}`,
    'legend: " " = sentinel, "." = bg 0xffff, "#" = fg 0x0000, "+" = other',
    '',
    result.ascii ?? '',
  ];

  fs.writeFileSync(outPath, `${lines.join('\n')}\n`);
  return outPath;
}

function topUniqueAddresses(results, limit) {
  const chosen = [];
  const seen = new Set();

  for (const result of results) {
    if (!result.bbox || result.drawn === 0) continue;
    if (seen.has(result.addr)) continue;
    seen.add(result.addr);
    chosen.push(result);
    if (chosen.length >= limit) break;
  }

  return chosen;
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

  ex.runFrom(BOOT_ENTRY, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = SCREEN_STACK_TOP - 3;
  fillSentinel(mem, cpu.sp, 3);
  ex.runFrom(OS_INIT_ENTRY, 'adl', { maxSteps: 100000, maxLoopIterations: 500 });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.hl = 0x000000;
  cpu.sp = SCREEN_STACK_TOP - 3;
  fillSentinel(mem, cpu.sp, 3);
  ex.runFrom(SET_TEXT_FG_ENTRY, 'adl', { maxSteps: 100, maxLoopIterations: 32 });

  const ramSnapshot = new Uint8Array(mem.subarray(RAM_SNAPSHOT_START, RAM_SNAPSHOT_END));
  const cpuSnapshot = snapshotCpu(cpu);
  const lcdSnapshot = lcdMmio
    ? { upbase: lcdMmio.upbase, control: lcdMmio.control }
    : null;

  const results = [];

  console.log('=== Phase 48 — home screen hunt ===');
  console.log(`dispatch sites: ${HOME_MODE_CASES.length}, probe targets: ${PROBE_TARGETS.length}, menu states: 2\n`);

  for (const mode of [HOME_MODE, CONTROL_MODE]) {
    for (const target of PROBE_TARGETS) {
      restoreBaseState(mem, cpu, ramSnapshot, cpuSnapshot, clearedVram, lcdMmio, lcdSnapshot);
      mem[MENU_MODE_ADDR] = mode;

      cpu.halted = false;
      cpu.iff1 = 0;
      cpu.iff2 = 0;
      cpu._iy = 0xD00080;
      cpu.f = 0x40;
      cpu.sp = SCREEN_STACK_TOP - 12;
      fillSentinel(mem, cpu.sp, 12);

      const t0 = Date.now();
      const run = ex.runFrom(target.addr, 'adl', {
        maxSteps: MAX_STEPS,
        maxLoopIterations: MAX_LOOP_ITERATIONS,
      });
      const ms = Date.now() - t0;
      const stats = vramStats(mem);
      const score = scoreHomeLike(stats);
      const ascii = buildAscii(mem, stats.bbox);

      const result = {
        mode,
        ...target,
        steps: run.steps,
        termination: run.termination,
        lastPc: run.lastPc,
        ms,
        ...stats,
        ascii,
        score,
      };

      results.push(result);

      console.log(
        `${mode === HOME_MODE ? '@' : '0'} ${target.kind.padEnd(8)} ${hex(target.addr)} ` +
        `score=${String(Number.isFinite(score) ? Math.round(score) : score).padStart(9)} ` +
        `drawn=${String(stats.drawn).padStart(6)} fg=${String(stats.fg).padStart(6)} ` +
        `bg=${String(stats.bg).padStart(6)} other=${String(stats.other).padStart(6)} ` +
        `bbox=${formatBbox(stats.bbox).padEnd(18)} term=${run.termination}@${hex(run.lastPc)} ${ms}ms`,
      );
    }
  }

  results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.drawn !== a.drawn) return b.drawn - a.drawn;
    if (b.bg !== a.bg) return b.bg - a.bg;
    if (a.mode !== b.mode) return b.mode - a.mode;
    return a.addr - b.addr;
  });

  const topAsciiHits = topUniqueAddresses(results, 8);
  for (const hit of topAsciiHits) {
    const outPath = writeAsciiFile(hit);
    console.log(`wrote ${outPath}`);
  }

  const topCandidate = topAsciiHits[0] ?? null;
  const runnersUp = topAsciiHits.slice(1, 6);

  console.log('\n=== Final Summary ===');
  if (!topCandidate) {
    console.log('TOP CANDIDATE: none — every probe was blank.');
    return;
  }

  console.log(
    `TOP CANDIDATE: ${hex(topCandidate.addr)} (${modeLabel(topCandidate.mode)}) — ` +
    `${topCandidate.drawn} drawn cells, fg/bg ${topCandidate.fg}/${topCandidate.bg}, ` +
    `other ${topCandidate.other}, bbox ${formatBbox(topCandidate.bbox)} — ` +
    `looks like ${describeHit(topCandidate)}`,
  );

  if (topCandidate.ascii) {
    console.log('\nTop candidate preview (first 5 rows):');
    console.log(topCandidate.ascii.split('\n').slice(0, 5).join('\n'));
  }

  if (runnersUp.length > 0) {
    console.log('\nRUNNERS-UP:');
    for (const hit of runnersUp) {
      console.log(
        `  ${hex(hit.addr)} (${modeLabel(hit.mode)}) — ${hit.drawn} drawn, ` +
        `fg/bg ${hit.fg}/${hit.bg}, other ${hit.other}, bbox ${formatBbox(hit.bbox)} — ` +
        `${describeHit(hit)}`,
      );
    }
  }

  console.log('\nVerdict: no candidate should be called the TI-84 home screen unless the ASCII art shows the familiar sparse upper-area text/cursor layout.');
}

await main();

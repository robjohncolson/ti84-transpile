#!/usr/bin/env node
// Phase 77 targeted JT probes — test the most-promising token-helper candidates.
// Patterned after probe-phase64-0a1cac-novel-callers.mjs exactly.
//
// Targets:
// - 0x028f02: full TEST label helper (sanity check with known input)
// - 0x0a2a68: slot 635, does `cp 0x5d / cp 0x60` (token range checks)
// - 0x0a2b72: slot 639, wrapper around 0x0a2a68
// - 0x0a32af: slot 647, reads 0xd005f9/fa from RAM
// - 0x0a29ec: slot 627, state-restore (calls 0x0a237e)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romPath = path.join(__dirname, 'ROM.rom');
const transpiledPath = path.join(__dirname, 'ROM.transpiled.js');
const reportPath = path.join(__dirname, 'phase77-jt-probes-report.md');
const romBytes = fs.readFileSync(romPath);

const BOOT_ENTRY = 0x000000;
const OS_INIT_ENTRY = 0x08c331;
const SET_TEXT_FG_ENTRY = 0x0802b2;
const SCREEN_STACK_TOP = 0xd1a87e;
const HELPER_STACK_BYTES = 3;
const PROBE_STACK_BYTES = 12;
const PROBE_IY = 0xd00080;

const RAM_START = 0x400000;
const RAM_END = 0xe00000;
const VRAM_BASE = 0xd40000;
const VRAM_WIDTH = 320;
const VRAM_HEIGHT = 240;
const VRAM_SIZE = VRAM_WIDTH * VRAM_HEIGHT * 2;
const VRAM_SENTINEL = 0xaaaa;
const FIRST_BLOCKS_LIMIT = 15;

const CPU_SNAPSHOT_FIELDS = [
  'a', 'f', '_bc', '_de', '_hl', '_a2', '_f2', '_bc2', '_de2', '_hl2',
  'sp', '_ix', '_iy', 'i', 'im', 'iff1', 'iff2', 'madl', 'mbase', 'halted', 'cycles',
];

const PROBES = [
  // 0x028f02 — full TEST mode label helper. Sanity check with known (A=0x91, HL=0x029132) RADIAN input.
  { name: '028f02_radian_known', entry: 0x028f02, regs: { a: 0x91, _hl: 0x029132 }, note: 'known TEST RADIAN' },
  { name: '028f02_degree_known', entry: 0x028f02, regs: { a: 0x92, _hl: 0x029139 }, note: 'known TEST DEGREE' },
  { name: '028f02_token_normal', entry: 0x028f02, regs: { a: 0x4f, _hl: 0x0a0467 }, note: 'token Normal via 028f02' },

  // 0x0a2a68 — token dispatcher (slot 635). DE input, cp 0x5d/0x60 range checks.
  { name: '0a2a68_de_4f', entry: 0x0a2a68, regs: { _de: 0x004f }, note: 'DE=Normal' },
  { name: '0a2a68_de_52', entry: 0x0a2a68, regs: { _de: 0x0052 }, note: 'DE=Float' },
  { name: '0a2a68_de_4d', entry: 0x0a2a68, regs: { _de: 0x004d }, note: 'DE=Radian' },
  { name: '0a2a68_de_5e', entry: 0x0a2a68, regs: { _de: 0x005e }, note: 'DE=ZPrevious (>0x5d)' },

  // 0x0a2b72 — wrapper around 0x0a2a68 (slot 639).
  { name: '0a2b72_de_4f', entry: 0x0a2b72, regs: { _de: 0x004f }, note: 'DE=Normal' },
  { name: '0a2b72_de_52', entry: 0x0a2b72, regs: { _de: 0x0052 }, note: 'DE=Float' },

  // 0x0a32af — slot 647, reads 0xd005f9/fa from RAM.
  { name: '0a32af_noseed', entry: 0x0a32af, regs: {}, note: 'no seed' },
  { name: '0a32af_seeded', entry: 0x0a32af, regs: {}, seedRam: [[0xd005f9, 0x4f], [0xd005fa, 0x52]], note: '0xd005f9=Normal, fa=Float' },

  // 0x0a29ec — slot 627, state-restore (calls 0x0a237e).
  { name: '0a29ec_noseed', entry: 0x0a29ec, regs: {}, note: 'no seed' },
];

function hex(v, w = 6) { return '0x' + (v >>> 0).toString(16).padStart(w, '0'); }
function formatBbox(b) { return b ? `r${b.minRow}-${b.maxRow} c${b.minCol}-${b.maxCol}` : 'none'; }

function buildClearedVram() {
  const bytes = new Uint8Array(VRAM_SIZE);
  for (let o = 0; o < VRAM_SIZE; o += 2) {
    bytes[o] = VRAM_SENTINEL & 0xff;
    bytes[o + 1] = (VRAM_SENTINEL >> 8) & 0xff;
  }
  return bytes;
}

function fillSentinel(mem, start, bytes) {
  mem.fill(0xff, start, start + bytes);
}

function snapshotCpu(cpu) {
  return Object.fromEntries(CPU_SNAPSHOT_FIELDS.map((f) => [f, cpu[f]]));
}

function restoreCpu(cpu, snap) {
  for (const [f, v] of Object.entries(snap)) cpu[f] = v;
}

function readPixel(mem, row, col) {
  const o = VRAM_BASE + row * VRAM_WIDTH * 2 + col * 2;
  return mem[o] | (mem[o + 1] << 8);
}

function collectVramStats(mem) {
  let drawn = 0, fg = 0, bg = 0;
  let minRow = VRAM_HEIGHT, maxRow = -1, minCol = VRAM_WIDTH, maxCol = -1;
  for (let r = 0; r < VRAM_HEIGHT; r += 1) {
    for (let c = 0; c < VRAM_WIDTH; c += 1) {
      const px = readPixel(mem, r, c);
      if (px === VRAM_SENTINEL) continue;
      drawn += 1;
      if (px === 0xffff) bg += 1; else fg += 1;
      if (r < minRow) minRow = r;
      if (r > maxRow) maxRow = r;
      if (c < minCol) minCol = c;
      if (c > maxCol) maxCol = c;
    }
  }
  return { drawn, fg, bg, bbox: maxRow >= 0 ? { minRow, maxRow, minCol, maxCol } : null };
}

async function loadBlocks() {
  const mod = await import(pathToFileURL(transpiledPath).href);
  return mod.PRELIFTED_BLOCKS;
}

async function buildProbeEnv(blocks) {
  const peripherals = createPeripheralBus({ trace: false, pllDelay: 2, timerInterrupt: false });
  const mem = new Uint8Array(0x1000000);
  mem.set(romBytes);

  const executor = createExecutor(blocks, mem, { peripherals });
  const cpu = executor.cpu;

  executor.runFrom(BOOT_ENTRY, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = SCREEN_STACK_TOP - HELPER_STACK_BYTES;
  fillSentinel(mem, cpu.sp, HELPER_STACK_BYTES);
  executor.runFrom(OS_INIT_ENTRY, 'adl', { maxSteps: 100000, maxLoopIterations: 500 });

  cpu.mbase = 0xd0;
  cpu._iy = PROBE_IY;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = SCREEN_STACK_TOP - HELPER_STACK_BYTES;
  fillSentinel(mem, cpu.sp, HELPER_STACK_BYTES);
  executor.runFrom(SET_TEXT_FG_ENTRY, 'adl', { maxSteps: 100, maxLoopIterations: 32 });

  return {
    executor, mem, cpu,
    ramSnapshot: new Uint8Array(mem.slice(RAM_START, RAM_END)),
    cpuSnapshot: snapshotCpu(cpu),
    clearedVram: buildClearedVram(),
  };
}

function restoreBase(env) {
  env.mem.set(env.ramSnapshot, RAM_START);
  env.mem.set(env.clearedVram, VRAM_BASE);
  restoreCpu(env.cpu, env.cpuSnapshot);
}

function runProbe(env, probe) {
  restoreBase(env);
  const { mem, cpu, executor } = env;

  if (probe.seedRam) {
    for (const [addr, val] of probe.seedRam) mem[addr] = val;
  }

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu._iy = PROBE_IY;
  cpu.f = 0x40;
  cpu.sp = SCREEN_STACK_TOP - PROBE_STACK_BYTES;
  fillSentinel(mem, cpu.sp, PROBE_STACK_BYTES);

  for (const [f, v] of Object.entries(probe.regs || {})) cpu[f] = v;

  const firstBlocks = [];
  const seen = new Set();

  const raw = executor.runFrom(probe.entry, 'adl', {
    maxSteps: 15000,
    maxLoopIterations: 500,
    onBlock: (pc) => {
      if (seen.has(pc)) return;
      seen.add(pc);
      if (firstBlocks.length < FIRST_BLOCKS_LIMIT) firstBlocks.push(pc);
    },
  });

  const stats = collectVramStats(mem);
  return {
    ...probe,
    steps: raw.steps,
    termination: raw.termination,
    lastPc: raw.lastPc,
    drawn: stats.drawn,
    fg: stats.fg,
    bg: stats.bg,
    bbox: stats.bbox,
    firstBlocks,
  };
}

function renderAscii(mem, bbox, maxRows = 40, maxCols = 80) {
  if (!bbox) return null;
  const rows = Math.min(maxRows, bbox.maxRow - bbox.minRow + 1);
  const cols = Math.min(maxCols, bbox.maxCol - bbox.minCol + 1);
  const lines = [];
  for (let r = 0; r < rows; r += 1) {
    let line = '';
    for (let c = 0; c < cols; c += 1) {
      const px = readPixel(mem, bbox.minRow + r, bbox.minCol + c);
      if (px === VRAM_SENTINEL) line += ' ';
      else if (px === 0xffff) line += '.';
      else line += '#';
    }
    lines.push(line);
  }
  return lines.join('\n');
}

async function main() {
  console.log('Loading blocks...');
  const blocks = await loadBlocks();
  console.log(`Loaded ${Array.isArray(blocks) ? blocks.length : Object.keys(blocks).length} blocks`);

  console.log('Building probe env (boot → OS init → SetTextFgColor)...');
  const env = await buildProbeEnv(blocks);
  console.log('Env ready.');

  const out = [];
  const log = (s) => out.push(s);
  log('# Phase 77 JT Probes — Token Helper Candidates\n');
  log('Targets: 0x028f02 (full test), 0x0a2a68/b72/32af/29ec (JT slot targets).\n');
  log('## Probe Results\n');
  log('| probe | entry | note | drawn | fg | bg | bbox | steps | termination |');
  log('|-------|-------|------|------:|---:|---:|------|------:|-------------|');

  const asciiResults = [];
  for (const probe of PROBES) {
    console.log(`Probing ${probe.name}...`);
    const r = runProbe(env, probe);
    log(`| \`${r.name}\` | ${hex(r.entry)} | ${r.note} | ${r.drawn} | ${r.fg} | ${r.bg} | ${formatBbox(r.bbox)} | ${r.steps} | ${r.termination} |`);
    if (r.drawn > 50) {
      const ascii = renderAscii(env.mem, r.bbox);
      asciiResults.push({ name: r.name, drawn: r.drawn, ascii });
    }
  }

  log('\n## First Blocks\n');
  for (const probe of PROBES) {
    const r = runProbe(env, probe);
    log(`- \`${r.name}\`: ${r.firstBlocks.map(hex).slice(0, 10).join(' → ')}`);
  }

  if (asciiResults.length > 0) {
    log('\n## ASCII Previews\n');
    for (const a of asciiResults) {
      log(`### ${a.name} (drawn=${a.drawn})\n`);
      log('```');
      log(a.ascii);
      log('```\n');
    }
  }

  fs.writeFileSync(reportPath, out.join('\n'));
  console.log(`Wrote ${out.length} lines to ${reportPath}`);
}

main().catch((err) => {
  console.error('FATAL:', err);
  console.error(err.stack);
  process.exit(1);
});

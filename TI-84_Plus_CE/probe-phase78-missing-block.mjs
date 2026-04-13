#!/usr/bin/env node
// Phase 78: Find the exact missing_block that terminates 0x0a2b72 at step 3868,
// and scan for callers of 0x0a2b72 / 0x0a29ec.
//
// Strategy 1: run 0a2b72 with a full-history onBlock callback, report the last
// 20 blocks before termination + the raw lastPc.
// Strategy 2: scan PRELIFTED_BLOCKS.exits for blocks whose call target is
// 0x0a2b72 or 0x0a29ec — those are the parent callers.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romPath = path.join(__dirname, 'ROM.rom');
const transpiledPath = path.join(__dirname, 'ROM.transpiled.js');
const reportPath = path.join(__dirname, 'phase78-missing-block-report.md');
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
const CPU_FIELDS = ['a','f','_bc','_de','_hl','_a2','_f2','_bc2','_de2','_hl2','sp','_ix','_iy','i','im','iff1','iff2','madl','mbase','halted','cycles'];

const hex = (v, w = 6) => '0x' + (v >>> 0).toString(16).padStart(w, '0');

function buildClearedVram() {
  const b = new Uint8Array(VRAM_SIZE);
  for (let o = 0; o < VRAM_SIZE; o += 2) { b[o] = VRAM_SENTINEL & 0xff; b[o+1] = (VRAM_SENTINEL>>8)&0xff; }
  return b;
}

const mod = await import(pathToFileURL(transpiledPath).href);
const blocks = mod.PRELIFTED_BLOCKS;
const blockList = Array.isArray(blocks) ? blocks : Object.values(blocks);
console.log(`Loaded ${blockList.length} blocks`);

const out = [];
const log = (s) => out.push(s);
log('# Phase 78 — Missing block + caller scan\n');

// ============================================================
// Section 1: caller scan for 0x0a2b72 and 0x0a29ec
// ============================================================
log('## Section 1 — Callers of 0x0a2b72 and 0x0a29ec\n');

function findCallers(target) {
  const callers = [];
  for (const b of blockList) {
    for (const exit of b.exits || []) {
      if (exit.type === 'call' && exit.target === target) {
        callers.push(b);
        break;
      }
    }
  }
  return callers;
}

const callers_0a2b72 = findCallers(0x0a2b72);
const callers_0a29ec = findCallers(0x0a29ec);
const callers_0a2a68 = findCallers(0x0a2a68);

log(`- Callers of **0x0a2b72**: ${callers_0a2b72.length}`);
log(`- Callers of **0x0a29ec**: ${callers_0a29ec.length}`);
log(`- Callers of **0x0a2a68**: ${callers_0a2a68.length}\n`);

function dumpCaller(label, callers) {
  if (callers.length === 0) {
    log(`\n### No callers of ${label}\n`);
    return;
  }
  log(`\n### Callers of ${label} (${callers.length} total)\n`);
  log('| caller block | dasm |');
  log('|--------------|------|');
  for (const b of callers.slice(0, 20)) {
    const dasm = (b.instructions || []).map((i) => i.dasm || '').join(' ; ');
    log(`| ${hex(b.startPc)} | \`${dasm.slice(0, 160)}\` |`);
  }
}

dumpCaller('0x0a2b72', callers_0a2b72);
dumpCaller('0x0a29ec', callers_0a29ec);
dumpCaller('0x0a2a68', callers_0a2a68);

// ============================================================
// Section 2: Run 0x0a2b72 with full block trace, find the missing block
// ============================================================
log('\n## Section 2 — Missing block trace for 0x0a2b72\n');

const peripherals = createPeripheralBus({ trace: false, pllDelay: 2, timerInterrupt: false });
const mem = new Uint8Array(0x1000000);
mem.set(romBytes);
const executor = createExecutor(blocks, mem, { peripherals });
const cpu = executor.cpu;

executor.runFrom(BOOT_ENTRY, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
cpu.halted=false; cpu.iff1=0; cpu.iff2=0;
cpu.sp = SCREEN_STACK_TOP - HELPER_STACK_BYTES;
mem.fill(0xff, cpu.sp, cpu.sp + HELPER_STACK_BYTES);
executor.runFrom(OS_INIT_ENTRY, 'adl', { maxSteps: 100000, maxLoopIterations: 500 });
cpu.mbase = 0xd0;
cpu._iy = PROBE_IY;
cpu._hl = 0;
cpu.halted=false; cpu.iff1=0; cpu.iff2=0;
cpu.sp = SCREEN_STACK_TOP - HELPER_STACK_BYTES;
mem.fill(0xff, cpu.sp, cpu.sp + HELPER_STACK_BYTES);
executor.runFrom(SET_TEXT_FG_ENTRY, 'adl', { maxSteps: 100, maxLoopIterations: 32 });

mem.set(buildClearedVram(), VRAM_BASE);

cpu.halted=false; cpu.iff1=0; cpu.iff2=0;
cpu._iy = PROBE_IY;
cpu.f = 0x40;
cpu.sp = SCREEN_STACK_TOP - PROBE_STACK_BYTES;
mem.fill(0xff, cpu.sp, cpu.sp + PROBE_STACK_BYTES);
cpu._de = 0x004f;

const fullTrace = [];
const raw = executor.runFrom(0x0a2b72, 'adl', {
  maxSteps: 80000,
  maxLoopIterations: 2000,
  onBlock: (pc) => fullTrace.push(pc),
});

log(`steps: ${raw.steps}`);
log(`termination: ${raw.termination}`);
log(`lastPc: ${hex(raw.lastPc || 0)}`);
log(`lastMode: ${raw.lastMode}`);
log(`error: ${raw.error?.message || 'none'}`);
log(`total blocks visited: ${fullTrace.length}`);

// Last 30 blocks of the trace (around the termination point)
const last30 = fullTrace.slice(-30);
log('\n### Last 30 blocks before termination\n');
for (let i = 0; i < last30.length; i += 1) {
  log(`  [-${last30.length - i}]  ${hex(last30[i])}`);
}

// Also show unique blocks that appeared in trace (dedup)
const unique = new Set(fullTrace);
log(`\n### Unique blocks visited: ${unique.size}\n`);

// Try to find a block near the termination whose dasm matches a call to an unknown target
// Just print dasm of the last 5 distinct unique blocks
const lastBlocks = [];
const seen = new Set();
for (let i = fullTrace.length - 1; i >= 0 && lastBlocks.length < 8; i -= 1) {
  if (seen.has(fullTrace[i])) continue;
  seen.add(fullTrace[i]);
  lastBlocks.unshift(fullTrace[i]);
}
log('### Dasm of last 8 distinct blocks in trace\n');
const byPc = new Map();
for (const b of blockList) {
  if (b && typeof b.startPc === 'number') byPc.set(b.startPc, b);
}
for (const pc of lastBlocks) {
  const b = byPc.get(pc);
  if (!b) { log(`**${hex(pc)}**: <no block>`); continue; }
  log(`\n**${hex(pc)}** (mode=${b.mode}):`);
  log('```');
  for (const inst of b.instructions || []) {
    log(`  ${hex(inst.pc)}  ${inst.dasm || ''}`);
  }
  log('```');
  const exits = (b.exits || []).map((e) => `${e.type}→${hex(e.target || 0)}`).join(', ');
  log(`exits: ${exits}`);
}

// If lastPc != 0xffffff and isn't in the block map, it's the missing block
if (raw.lastPc && raw.lastPc !== 0xffffff && !byPc.has(raw.lastPc)) {
  log(`\n### *** MISSING BLOCK IDENTIFIED: ${hex(raw.lastPc)} ***\n`);
  log('This is the block that needs to be added to seeds and retranspiled.');
}

fs.writeFileSync(reportPath, out.join('\n'));
console.log(`Wrote ${out.length} lines to ${reportPath}`);

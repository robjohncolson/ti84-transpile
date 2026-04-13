#!/usr/bin/env node
// Phase 80-2 - probe the remaining 0x0a2xxx JT slot targets as direct entries.
// The request text says there are 12 remaining slots but enumerates 11 names.
// This script also includes the inferred missing slot623_0a2802 from phase77.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romPath = path.join(__dirname, 'ROM.rom');
const transpiledPath = path.join(__dirname, 'ROM.transpiled.js');
const reportPath = path.join(__dirname, 'phase80-2-jt-slots-report.md');
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
const ASCII_THRESHOLD = 300;
const BLOCK_TRACE_THRESHOLD = 1000;
const MAX_STEPS = 80000;
const MAX_LOOP_ITERATIONS = 2000;
const CPU_FIELDS = [
  'a', 'f', '_bc', '_de', '_hl', '_a2', '_f2', '_bc2', '_de2', '_hl2',
  'sp', '_ix', '_iy', 'i', 'im', 'iff1', 'iff2', 'madl', 'mbase', 'halted', 'cycles',
];

const PROBES = [
  { name: 'slot591_0a2032', entry: 0x0a2032, note: 'slot 591 - register save routine' },
  { name: 'slot595_0a215b', entry: 0x0a215b, note: 'slot 595 - cursor arithmetic at 0xd00595' },
  { name: 'slot599_0a21bb', entry: 0x0a21bb, note: 'slot 599 - short load' },
  { name: 'slot603_0a21f2', entry: 0x0a21f2, note: 'slot 603 - call wrapper' },
  { name: 'slot607_0a22b1', entry: 0x0a22b1, note: 'slot 607 - iy+42 flag check + 0x025c33' },
  { name: 'slot611_0a237e', entry: 0x0a237e, note: 'slot 611 - cursor+text prep (called by 0a29ec)' },
  { name: 'slot615_0a26ee', entry: 0x0a26ee, note: 'slot 615 - push af + call 0a26f5' },
  { name: 'slot619_0a27dd', entry: 0x0a27dd, note: 'slot 619 - iy+27 flag + state setup' },
  { name: 'slot623_0a2802', entry: 0x0a2802, note: 'slot 623 - state snapshot to 0x0007c4/0xd007c7-0xd007c9' },
  { name: 'slot631_0a2a3e', entry: 0x0a2a3e, note: 'slot 631 - wraps 0a2a68' },
  { name: 'slot643_0a2ca6', entry: 0x0a2ca6, note: 'slot 643 - iy+42 flag + 0x025dea' },
  { name: 'slot851_0a5424', entry: 0x0a5424, note: 'slot 851 - iy+53 flag + 0x02398e (icon renderer?)' },
];

const VARIANTS = [
  { name: 'default', note: 'default regs', regs: {} },
  { name: 'de_4f', note: '_de=0x004f (Normal token code)', regs: { _de: 0x004f } },
];

const hex = (value, width = 6) => '0x' + (value >>> 0).toString(16).padStart(width, '0');
const formatBbox = (bbox) => bbox ? `r${bbox.minRow}-${bbox.maxRow} c${bbox.minCol}-${bbox.maxCol}` : 'none';

function fillSentinel(mem, start, bytes) {
  mem.fill(0xff, start, start + bytes);
}

function buildClearedVram() {
  const bytes = new Uint8Array(VRAM_SIZE);
  for (let offset = 0; offset < VRAM_SIZE; offset += 2) {
    bytes[offset] = VRAM_SENTINEL & 0xff;
    bytes[offset + 1] = (VRAM_SENTINEL >> 8) & 0xff;
  }
  return bytes;
}

function snapshotCpu(cpu) {
  return Object.fromEntries(CPU_FIELDS.map((field) => [field, cpu[field]]));
}

function restoreCpu(cpu, snapshot) {
  for (const [field, value] of Object.entries(snapshot)) cpu[field] = value;
}

function readPixel(mem, row, col) {
  const offset = VRAM_BASE + row * VRAM_WIDTH * 2 + col * 2;
  return mem[offset] | (mem[offset + 1] << 8);
}

function collectVramStats(mem) {
  let drawn = 0;
  let fg = 0;
  let bg = 0;
  let minRow = VRAM_HEIGHT;
  let maxRow = -1;
  let minCol = VRAM_WIDTH;
  let maxCol = -1;

  for (let row = 0; row < VRAM_HEIGHT; row += 1) {
    for (let col = 0; col < VRAM_WIDTH; col += 1) {
      const pixel = readPixel(mem, row, col);
      if (pixel === VRAM_SENTINEL) continue;
      drawn += 1;
      if (pixel === 0xffff) bg += 1; else fg += 1;
      if (row < minRow) minRow = row;
      if (row > maxRow) maxRow = row;
      if (col < minCol) minCol = col;
      if (col > maxCol) maxCol = col;
    }
  }

  return {
    drawn,
    fg,
    bg,
    bbox: maxRow >= 0 ? { minRow, maxRow, minCol, maxCol } : null,
  };
}

function renderAscii(mem, bbox, maxRows = 50, maxCols = 80) {
  if (!bbox) return null;

  const rows = Math.min(maxRows, bbox.maxRow - bbox.minRow + 1);
  const cols = Math.min(maxCols, bbox.maxCol - bbox.minCol + 1);
  const lines = [];

  for (let row = 0; row < rows; row += 1) {
    let line = '';
    for (let col = 0; col < cols; col += 1) {
      const pixel = readPixel(mem, bbox.minRow + row, bbox.minCol + col);
      if (pixel === VRAM_SENTINEL) line += ' ';
      else if (pixel === 0xffff) line += '.';
      else line += '#';
    }
    lines.push(line);
  }

  return lines.join('\n');
}

function summarizeVerdict(results) {
  const families = new Map();
  for (const result of results) {
    if (!families.has(result.name)) {
      families.set(result.name, {
        name: result.name,
        entry: result.entry,
        note: result.note,
        variants: [],
      });
    }
    families.get(result.name).variants.push(result);
  }

  const renderers = [];
  const helpers = [];
  const homeScreenCandidates = [];

  for (const family of families.values()) {
    const ranked = family.variants.slice().sort((left, right) => right.drawn - left.drawn);
    const best = ranked[0];
    const anyRender = ranked.some((variant) => variant.drawn > 0);
    const variantSummary = ranked
      .map((variant) => `\`${variant.variant}\`=${variant.drawn}`)
      .join(', ');
    const line =
      `- \`${family.name}\` (${hex(family.entry)}): ${family.note}; ${variantSummary}; ` +
      `best bbox=${formatBbox(best.bbox)}, best termination=${best.termination}.`;

    if (anyRender) renderers.push(line);
    else helpers.push(line);

    if (ranked.some((variant) => variant.drawn > BLOCK_TRACE_THRESHOLD)) {
      homeScreenCandidates.push(
        `- \`${family.name}\` (${hex(family.entry)}): ` +
        `large render observed (${best.drawn} px via \`${best.variant}\`, bbox=${formatBbox(best.bbox)}).`,
      );
    }
  }

  return { renderers, helpers, homeScreenCandidates };
}

const mod = await import(pathToFileURL(transpiledPath).href);
const blocks = mod.PRELIFTED_BLOCKS;
console.log(`Loaded ${Array.isArray(blocks) ? blocks.length : Object.keys(blocks).length} blocks`);

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

const ramSnapshot = new Uint8Array(mem.slice(RAM_START, RAM_END));
const cpuSnapshot = snapshotCpu(cpu);
const clearedVram = buildClearedVram();

const results = [];
for (const probe of PROBES) {
  for (const variant of VARIANTS) {
    console.log(`Probing ${probe.name}/${variant.name}...`);

    mem.set(ramSnapshot, RAM_START);
    mem.set(clearedVram, VRAM_BASE);
    restoreCpu(cpu, cpuSnapshot);
    cpu.halted = false;
    cpu.iff1 = 0;
    cpu.iff2 = 0;
    cpu._iy = PROBE_IY;
    cpu.f = 0x40;
    cpu.sp = SCREEN_STACK_TOP - PROBE_STACK_BYTES;
    fillSentinel(mem, cpu.sp, PROBE_STACK_BYTES);

    for (const [field, value] of Object.entries(variant.regs)) {
      cpu[field] = value;
    }

    const firstBlocks = [];
    const seen = new Set();
    const raw = executor.runFrom(probe.entry, 'adl', {
      maxSteps: MAX_STEPS,
      maxLoopIterations: MAX_LOOP_ITERATIONS,
      onBlock: (pc) => {
        if (seen.has(pc)) return;
        seen.add(pc);
        if (firstBlocks.length < FIRST_BLOCKS_LIMIT) firstBlocks.push(pc);
      },
    });

    const vramStats = collectVramStats(mem);
    results.push({
      ...probe,
      variant: variant.name,
      variantNote: variant.note,
      ...vramStats,
      steps: raw.steps,
      termination: raw.termination,
      lastPc: raw.lastPc,
      firstBlocks,
      ascii: vramStats.drawn > ASCII_THRESHOLD ? renderAscii(mem, vramStats.bbox, 50, 80) : null,
    });
  }
}

const out = [];
const log = (line) => out.push(line);
const verdict = summarizeVerdict(results);
const largeRenders = results.filter((result) => result.drawn > BLOCK_TRACE_THRESHOLD);
const asciiResults = results.filter((result) => result.drawn > ASCII_THRESHOLD);

log('# Phase 80-2 - JT Slot Entry Probes\n');
log('Direct-entry probes for the remaining 0x0a2xxx JT slot targets from the phase77 0x0a2xxx family.\n');
log('Note: the task prompt named 11 slots but described 12 untested entries; this run also includes inferred missing `slot623_0a2802`.\n');
log('## Results\n');
log('| probe | entry | variant | drawn | fg | bg | bbox | steps | termination |');
log('|-------|-------|---------|------:|---:|---:|------|------:|-------------|');

for (const result of results) {
  log(
    `| \`${result.name}\` | ${hex(result.entry)} | \`${result.variant}\` | ` +
    `${result.drawn} | ${result.fg} | ${result.bg} | ${formatBbox(result.bbox)} | ` +
    `${result.steps} | ${result.termination} |`,
  );
}

log('\n## Block Traces (>1000 px)\n');
if (largeRenders.length === 0) {
  log('None.\n');
} else {
  for (const result of largeRenders) {
    log(
      `### ${result.name} / ${result.variant} ` +
      `(${hex(result.entry)}, drawn=${result.drawn}, bbox=${formatBbox(result.bbox)})\n`,
    );
    log(result.firstBlocks.map(hex).join(' -> ') || 'none');
    log('');
  }
}

log('## ASCII Previews (>300 px)\n');
if (asciiResults.length === 0) {
  log('None.\n');
} else {
  for (const result of asciiResults) {
    log(
      `### ${result.name} / ${result.variant} ` +
      `(${hex(result.entry)}, drawn=${result.drawn}, bbox=${formatBbox(result.bbox)})\n`,
    );
    log('```');
    log(result.ascii ?? '');
    log('```');
    log('');
  }
}

log('## Verdict\n');
log('### Renderers\n');
if (verdict.renderers.length === 0) log('- None.');
else for (const line of verdict.renderers) log(line);

log('\n### State Helpers\n');
if (verdict.helpers.length === 0) log('- None.');
else for (const line of verdict.helpers) log(line);

log('\n### Home-Screen Candidates\n');
if (verdict.homeScreenCandidates.length === 0) log('- None.');
else for (const line of verdict.homeScreenCandidates) log(line);

fs.writeFileSync(reportPath, out.join('\n'));
console.log(`Wrote ${out.length} lines to ${reportPath}`);

#!/usr/bin/env node
// Phase 80-1: probe 0x028f0b directly and compare it with 0x029374.
// This mirrors the Phase 78 harness shape exactly:
// boot -> OS init -> SetTextFgColor -> snapshot/restore -> probe.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romPath = path.join(__dirname, 'ROM.rom');
const transpiledPath = path.join(__dirname, 'ROM.transpiled.js');
const reportPath = path.join(__dirname, 'phase80-1-028f0b-report.md');
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
const CPU_FIELDS = ['a', 'f', '_bc', '_de', '_hl', '_a2', '_f2', '_bc2', '_de2', '_hl2', 'sp', '_ix', '_iy', 'i', 'im', 'iff1', 'iff2', 'madl', 'mbase', 'halted', 'cycles'];

const PROBES = [
  { name: '028f0b_radian', entry: 0x028f0b, runEntry: 0x028f0a, regs: { a: 0x91, _hl: 0x029132 }, note: 'RADIAN direct' },
  { name: '028f0b_degree', entry: 0x028f0b, runEntry: 0x028f0a, regs: { a: 0x92, _hl: 0x029139 }, note: 'DEGREE direct' },
  { name: '028f0b_normal', entry: 0x028f0b, runEntry: 0x028f0a, regs: { a: 0x4f, _hl: 0x0a0467 }, note: 'Normal token name' },
  { name: '028f0b_float', entry: 0x028f0b, runEntry: 0x028f0a, regs: { a: 0x52, _hl: 0x0a0479 }, note: 'Float token name' },
  { name: '029374_radian', entry: 0x029374, runEntry: 0x029374, regs: { a: 0x91, _hl: 0x029132 }, note: 'middle phase' },
  { name: '029374_degree', entry: 0x029374, runEntry: 0x029374, regs: { a: 0x92, _hl: 0x029139 }, note: 'middle phase' },
];

const TEXT_LOOP_ENTRY = 0x0a1cac;
const CHAR_DISPATCH_ENTRY = 0x0a1b5b;
const GLYPH_ENTRY = 0x0a1799;

const hex = (value, width = 6) => '0x' + (value >>> 0).toString(16).padStart(width, '0');
const formatBbox = (bbox) => bbox ? `r${bbox.minRow}-${bbox.maxRow} c${bbox.minCol}-${bbox.maxCol}` : 'none';

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
  for (const [field, value] of Object.entries(snapshot)) {
    cpu[field] = value;
  }
}

function readPixel(mem, row, col) {
  const offset = VRAM_BASE + row * VRAM_WIDTH * 2 + col * 2;
  return mem[offset] | (mem[offset + 1] << 8);
}

function stats(mem) {
  let drawn = 0;
  let fg = 0;
  let bg = 0;
  let minRow = VRAM_HEIGHT;
  let maxRow = -1;
  let minCol = VRAM_WIDTH;
  let maxCol = -1;

  for (let row = 0; row < VRAM_HEIGHT; row += 1) {
    for (let col = 0; col < VRAM_WIDTH; col += 1) {
      const px = readPixel(mem, row, col);
      if (px === VRAM_SENTINEL) continue;
      drawn += 1;
      if (px === 0xffff) bg += 1;
      else fg += 1;
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
      const px = readPixel(mem, bbox.minRow + row, bbox.minCol + col);
      if (px === VRAM_SENTINEL) line += ' ';
      else if (px === 0xffff) line += '.';
      else line += '#';
    }
    lines.push(line);
  }

  return lines.join('\n');
}

function bboxWidth(bbox) {
  return bbox ? (bbox.maxCol - bbox.minCol + 1) : 0;
}

function bboxHeight(bbox) {
  return bbox ? (bbox.maxRow - bbox.minRow + 1) : 0;
}

function formatRegs(regs) {
  const pieces = [];
  if (typeof regs.a === 'number') pieces.push(`A=${hex(regs.a, 2)}`);
  if (typeof regs._hl === 'number') pieces.push(`HL=${hex(regs._hl)}`);
  return pieces.join(', ');
}

function tracesMatch(left, right) {
  return (
    left.drawn === right.drawn &&
    left.fg === right.fg &&
    left.bg === right.bg &&
    formatBbox(left.bbox) === formatBbox(right.bbox)
  );
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
mem.fill(0xff, cpu.sp, cpu.sp + HELPER_STACK_BYTES);
executor.runFrom(OS_INIT_ENTRY, 'adl', { maxSteps: 100000, maxLoopIterations: 500 });
cpu.mbase = 0xd0;
cpu._iy = PROBE_IY;
cpu._hl = 0;
cpu.halted = false;
cpu.iff1 = 0;
cpu.iff2 = 0;
cpu.sp = SCREEN_STACK_TOP - HELPER_STACK_BYTES;
mem.fill(0xff, cpu.sp, cpu.sp + HELPER_STACK_BYTES);
executor.runFrom(SET_TEXT_FG_ENTRY, 'adl', { maxSteps: 100, maxLoopIterations: 32 });

const ramSnap = new Uint8Array(mem.slice(RAM_START, RAM_END));
const cpuSnap = snapshotCpu(cpu);
const clearedVram = buildClearedVram();

const results = [];

for (const probe of PROBES) {
  console.log(`Probing ${probe.name}...`);

  mem.set(ramSnap, RAM_START);
  mem.set(clearedVram, VRAM_BASE);
  restoreCpu(cpu, cpuSnap);
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu._iy = PROBE_IY;
  cpu.f = 0x40;
  cpu.sp = SCREEN_STACK_TOP - PROBE_STACK_BYTES;
  mem.fill(0xff, cpu.sp, cpu.sp + PROBE_STACK_BYTES);

  for (const [field, value] of Object.entries(probe.regs)) {
    cpu[field] = value;
  }

  const firstBlocks = [];
  let hitTextLoop = false;
  let hitCharDispatch = false;
  let hitGlyph = false;

  const raw = executor.runFrom(probe.runEntry, 'adl', {
    maxSteps: 50000,
    maxLoopIterations: 2000,
    onBlock: (pc) => {
      if (firstBlocks.length < 15) firstBlocks.push(pc);
      if (pc === TEXT_LOOP_ENTRY) hitTextLoop = true;
      if (pc === CHAR_DISPATCH_ENTRY) hitCharDispatch = true;
      if (pc === GLYPH_ENTRY) hitGlyph = true;
    },
  });

  const vramStats = stats(mem);
  results.push({
    ...probe,
    firstBlocks,
    hitTextLoop,
    hitCharDispatch,
    hitGlyph,
    steps: raw.steps,
    termination: raw.termination,
    lastPc: raw.lastPc,
    lastMode: raw.lastMode,
    drawn: vramStats.drawn,
    fg: vramStats.fg,
    bg: vramStats.bg,
    bbox: vramStats.bbox,
    ascii: vramStats.drawn > 100 ? renderAscii(mem, vramStats.bbox, 50, 80) : null,
  });
}

const byName = new Map(results.map((result) => [result.name, result]));
const directAngleResults = [
  byName.get('028f0b_radian'),
  byName.get('028f0b_degree'),
].filter(Boolean);
const directTokenResults = [
  byName.get('028f0b_normal'),
  byName.get('028f0b_float'),
].filter(Boolean);
const middlePhasePairs = [
  ['028f0b_radian', '029374_radian'],
  ['028f0b_degree', '029374_degree'],
].filter(([directName, middleName]) => byName.has(directName) && byName.has(middleName));

function looksTextLike(result) {
  return (
    result.hitTextLoop &&
    result.hitCharDispatch &&
    result.hitGlyph &&
    result.drawn > 100 &&
    bboxWidth(result.bbox) > 20 &&
    bboxHeight(result.bbox) > 10
  );
}

const directAngleTextLikeCount = directAngleResults.filter(looksTextLike).length;
const directTokenTextLikeCount = directTokenResults.filter(looksTextLike).length;
const matchingMiddlePhaseCount = middlePhasePairs.filter(([directName, middleName]) => {
  const directResult = byName.get(directName);
  const middleResult = byName.get(middleName);
  return tracesMatch(directResult, middleResult);
}).length;

const out = [];
const log = (line = '') => out.push(line);

log('# Phase 80-1 - Direct 0x028f0b Probe');
log('');
log('Harness: boot -> OS init -> SetTextFgColor -> snapshot/restore -> direct entry probe.');
log('');
log('## Results');
log('');
log('| probe | entry | drawn | fg | bg | bbox | steps | termination |');
log('|-------|-------|------:|---:|---:|------|------:|-------------|');
for (const result of results) {
  log(`| \`${result.name}\` | ${hex(result.entry)} | ${result.drawn} | ${result.fg} | ${result.bg} | ${formatBbox(result.bbox)} | ${result.steps} | ${result.termination} |`);
}

log('');
log('## Block Trace');
for (const result of results) {
  log('');
  log(`### ${result.name}`);
  log('');
  log(`- Entry: ${hex(result.entry)}`);
  log(`- Lifted run entry: ${hex(result.runEntry)}`);
  log(`- Note: ${result.note}`);
  log(`- Registers: ${formatRegs(result.regs)}`);
  log(`- Stats: drawn=${result.drawn}, fg=${result.fg}, bg=${result.bg}, bbox=${formatBbox(result.bbox)}`);
  log(`- Steps: ${result.steps}`);
  log(`- Termination: ${result.termination}`);
  log(`- Last PC: ${hex(result.lastPc || 0)}:${result.lastMode || 'unknown'}`);
  log(`- Hit 0x0a1cac: ${result.hitTextLoop ? 'yes' : 'no'}`);
  log(`- Hit 0x0a1b5b: ${result.hitCharDispatch ? 'yes' : 'no'}`);
  log(`- Hit 0x0a1799: ${result.hitGlyph ? 'yes' : 'no'}`);
  log(`- First 15 blocks: ${result.firstBlocks.map((pc) => hex(pc)).join(' -> ')}`);
}

log('');
log('## ASCII Previews');
const asciiResults = results.filter((result) => result.drawn > 100 && result.ascii);
if (asciiResults.length === 0) {
  log('');
  log('No probe crossed the drawn > 100 threshold.');
} else {
  for (const result of asciiResults) {
    log('');
    log(`### ${result.name} (${hex(result.entry)}, drawn=${result.drawn}, bbox=${formatBbox(result.bbox)})`);
    log('');
    log(`First 15 blocks: ${result.firstBlocks.map((pc) => hex(pc)).join(' -> ')}`);
    log('');
    log('```');
    log(result.ascii);
    log('```');
  }
}

log('');
log('## Verdict');
log('');

if (directAngleTextLikeCount === directAngleResults.length && directAngleResults.length > 0) {
  log(`Direct 0x028f0b angle probes look like text renders in ${directAngleTextLikeCount}/${directAngleResults.length} cases: both direct angle entries reached 0x0a1cac -> 0x0a1b5b -> 0x0a1799 and produced text-sized VRAM output.`);
} else if (directAngleTextLikeCount > 0) {
  log(`Direct 0x028f0b angle probes are only partially confirmed: ${directAngleTextLikeCount}/${directAngleResults.length} angle cases reached the full text loop and produced text-sized output.`);
} else {
  log('Direct 0x028f0b angle probes did not produce a clear text-sized render, so the RADIAN/DEGREE end-to-end path is still not confirmed by this probe.');
}

if (directTokenResults.length > 0) {
  if (directTokenTextLikeCount === directTokenResults.length) {
    log(`Token-name inputs also worked at this entry: ${directTokenTextLikeCount}/${directTokenResults.length} direct token probes looked like full text renders.`);
  } else if (directTokenTextLikeCount > 0) {
    log(`Token-name inputs were mixed: ${directTokenTextLikeCount}/${directTokenResults.length} direct token probes looked text-like.`);
  } else {
    log('Token-name inputs did not show a clear text-like render at 0x028f0b.');
  }
}

if (middlePhasePairs.length > 0) {
  log(`The 0x029374 comparison matched ${matchingMiddlePhaseCount}/${middlePhasePairs.length} direct angle probes on drawn/fg/bg/bbox stats.`);
  if (matchingMiddlePhaseCount === middlePhasePairs.length) {
    log('This makes 0x028f0b and 0x029374 behave identically for the tested RADIAN/DEGREE cases.');
  } else if (matchingMiddlePhaseCount === 0) {
    log('This means the direct 0x028f0b tail entry and the 0x029374 middle-phase entry are observably different in the current harness.');
  } else {
    log('This means the direct tail entry is close to, but not identical with, the middle-phase entry across the tested cases.');
  }
}

if (directAngleTextLikeCount === directAngleResults.length && matchingMiddlePhaseCount === middlePhasePairs.length && directAngleResults.length > 0) {
  log('Bottom line: yes, the calling convention (A=label_code, HL=string_addr) appears to work end-to-end for the direct 0x028f0b path under this harness.');
} else if (directAngleTextLikeCount > 0) {
  log('Bottom line: the path is promising but only partially confirmed; inspect the per-probe ASCII previews and traces before treating 0x028f02 as fully validated.');
} else {
  log('Bottom line: no end-to-end confirmation yet; this run did not show convincing direct text output from 0x028f0b.');
}

fs.writeFileSync(reportPath, out.join('\n'));
console.log(`Wrote ${out.length} lines to ${reportPath}`);

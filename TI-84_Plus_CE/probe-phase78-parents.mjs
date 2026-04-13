#!/usr/bin/env node
// Phase 78 — probe the parent callers of 0x0a2b72 and 0x0a29ec.
// 0x0a2b72 is a top-strip bg fill helper (completes normally).
// The parents are what actually render the full home screen.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romPath = path.join(__dirname, 'ROM.rom');
const transpiledPath = path.join(__dirname, 'ROM.transpiled.js');
const reportPath = path.join(__dirname, 'phase78-parents-report.md');
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

// 3 callers of 0x0a2b72, 5 callers of 0x0a29ec
const PROBES = [
  { name: 'p0a2b72_05e7d2', entry: 0x05e7d2, note: 'parent 1 of 0a2b72' },
  { name: 'p0a2b72_05e481', entry: 0x05e481, note: 'parent 2 of 0a2b72' },
  { name: 'p0a2b72_09cb14', entry: 0x09cb14, note: 'parent 3 of 0a2b72' },
  { name: 'p0a29ec_078f69', entry: 0x078f69, note: 'parent of 0a29ec (iy+76 bit 5 set)' },
  { name: 'p0a29ec_025b37', entry: 0x025b37, note: 'parent of 0a29ec (raw call)' },
  { name: 'p0a29ec_060a35', entry: 0x060a35, note: 'parent of 0a29ec (iy+76 bit 5 set)' },
  { name: 'p0a29ec_08847f', entry: 0x08847f, note: 'parent of 0a29ec (iy+76 bit 5 set)' },
  { name: 'p0a29ec_06c865', entry: 0x06c865, note: 'parent of 0a29ec (raw call)' },
];

const hex = (v, w = 6) => '0x' + (v >>> 0).toString(16).padStart(w, '0');
const formatBbox = (b) => b ? `r${b.minRow}-${b.maxRow} c${b.minCol}-${b.maxCol}` : 'none';

function buildClearedVram() {
  const b = new Uint8Array(VRAM_SIZE);
  for (let o = 0; o < VRAM_SIZE; o += 2) { b[o] = VRAM_SENTINEL & 0xff; b[o+1] = (VRAM_SENTINEL>>8)&0xff; }
  return b;
}
function snapshotCpu(cpu) { return Object.fromEntries(CPU_FIELDS.map(f => [f, cpu[f]])); }
function restoreCpu(cpu, snap) { for (const [f,v] of Object.entries(snap)) cpu[f] = v; }
function readPixel(mem, r, c) { const o = VRAM_BASE + r*VRAM_WIDTH*2 + c*2; return mem[o] | (mem[o+1]<<8); }
function stats(mem) {
  let drawn=0,fg=0,bg=0,minR=VRAM_HEIGHT,maxR=-1,minC=VRAM_WIDTH,maxC=-1;
  for (let r=0;r<VRAM_HEIGHT;r++) for (let c=0;c<VRAM_WIDTH;c++) {
    const px = readPixel(mem,r,c);
    if (px === VRAM_SENTINEL) continue;
    drawn++; if (px===0xffff) bg++; else fg++;
    if (r<minR) minR=r; if (r>maxR) maxR=r;
    if (c<minC) minC=c; if (c>maxC) maxC=c;
  }
  return { drawn, fg, bg, bbox: maxR>=0 ? {minRow:minR,maxRow:maxR,minCol:minC,maxCol:maxC} : null };
}
function renderAscii(mem, bbox, maxRows=50, maxCols=80) {
  if (!bbox) return null;
  const rows = Math.min(maxRows, bbox.maxRow - bbox.minRow + 1);
  const cols = Math.min(maxCols, bbox.maxCol - bbox.minCol + 1);
  const lines = [];
  for (let r = 0; r < rows; r++) {
    let line = '';
    for (let c = 0; c < cols; c++) {
      const px = readPixel(mem, bbox.minRow+r, bbox.minCol+c);
      if (px === VRAM_SENTINEL) line += ' ';
      else if (px === 0xffff) line += '.';
      else line += '#';
    }
    lines.push(line);
  }
  return lines.join('\n');
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
const ramSnap = new Uint8Array(mem.slice(RAM_START, RAM_END));
const cpuSnap = snapshotCpu(cpu);
const clearedVram = buildClearedVram();

const out = [];
const log = s => out.push(s);
log('# Phase 78 — Parent Caller Probes\n');
log('Probe the 3+5 callers of 0x0a2b72 / 0x0a29ec as possible home-screen parent renderers.\n');
log('## Results\n');
log('| probe | entry | note | drawn | fg | bg | bbox | steps | termination |');
log('|-------|-------|------|------:|---:|---:|------|------:|-------------|');

const asciiResults = [];
for (const probe of PROBES) {
  console.log(`Probing ${probe.name}...`);
  mem.set(ramSnap, RAM_START);
  mem.set(clearedVram, VRAM_BASE);
  restoreCpu(cpu, cpuSnap);
  cpu.halted=false; cpu.iff1=0; cpu.iff2=0;
  cpu._iy = PROBE_IY;
  cpu.f = 0x40;
  cpu.sp = SCREEN_STACK_TOP - PROBE_STACK_BYTES;
  mem.fill(0xff, cpu.sp, cpu.sp + PROBE_STACK_BYTES);

  const firstBlocks = [];
  const seen = new Set();
  const raw = executor.runFrom(probe.entry, 'adl', {
    maxSteps: 300000,
    maxLoopIterations: 2000,
    onBlock: pc => { if (!seen.has(pc)) { seen.add(pc); if (firstBlocks.length < 20) firstBlocks.push(pc); } },
  });
  const s = stats(mem);
  log(`| \`${probe.name}\` | ${hex(probe.entry)} | ${probe.note} | ${s.drawn} | ${s.fg} | ${s.bg} | ${formatBbox(s.bbox)} | ${raw.steps} | ${raw.termination} |`);
  if (s.drawn > 100) {
    asciiResults.push({
      name: probe.name,
      entry: probe.entry,
      drawn: s.drawn,
      bbox: s.bbox,
      firstBlocks: firstBlocks.slice(),
      ascii: renderAscii(mem, s.bbox, 50, 80),
    });
  }
}

log('\n## ASCII Previews\n');
for (const r of asciiResults) {
  log(`\n### ${r.name} (${hex(r.entry)}, drawn=${r.drawn}, bbox=${formatBbox(r.bbox)})\n`);
  log('First blocks: ' + r.firstBlocks.map(hex).slice(0, 15).join(' → ') + '\n');
  log('```');
  log(r.ascii);
  log('```');
}

fs.writeFileSync(reportPath, out.join('\n'));
console.log(`Wrote ${out.length} lines to ${reportPath}`);

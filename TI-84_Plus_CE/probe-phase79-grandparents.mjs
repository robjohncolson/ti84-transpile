#!/usr/bin/env node
// Phase 79 — find grandparents: what calls 0x05e7d2, 0x05e481, 0x09cb14?
// These are the Phase 78 parent callers that render legible top strips.
// Their callers (grandparents) are the top-level screen dispatchers.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romPath = path.join(__dirname, 'ROM.rom');
const transpiledPath = path.join(__dirname, 'ROM.transpiled.js');
const reportPath = path.join(__dirname, 'phase79-grandparents-report.md');
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

const TARGETS = [0x05e7d2, 0x05e481, 0x09cb14];

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

const mod = await import(pathToFileURL(transpiledPath).href);
const blocks = mod.PRELIFTED_BLOCKS;
const blockList = Array.isArray(blocks) ? blocks : Object.values(blocks);
console.log(`Loaded ${blockList.length} blocks`);

const out = [];
const log = s => out.push(s);
log('# Phase 79 — Grandparent callers of Phase 78 parents\n');

// Section 1: caller scan
log('## Section 1 — Caller scan\n');

const allCallers = [];
for (const target of TARGETS) {
  const callers = [];
  for (const b of blockList) {
    for (const exit of b.exits || []) {
      if (exit.type === 'call' && exit.target === target) {
        callers.push(b);
        break;
      }
    }
  }
  log(`\n### Callers of ${hex(target)} (${callers.length} total)\n`);
  log('| caller | dasm |');
  log('|--------|------|');
  for (const b of callers.slice(0, 20)) {
    const dasm = (b.instructions || []).map(i => i.dasm || '').join(' ; ');
    log(`| ${hex(b.startPc)} | \`${dasm.slice(0, 160)}\` |`);
    allCallers.push({ target, caller: b.startPc });
  }
}

// Section 2: probe each unique grandparent
log('\n## Section 2 — Probe grandparents\n');

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

const uniqueGrandparents = [...new Set(allCallers.map(c => c.caller))];
log(`Unique grandparents to probe: ${uniqueGrandparents.length}\n`);
log('| grandparent | for target | drawn | fg | bg | bbox | steps | term |');
log('|-------------|------------|------:|---:|---:|------|------:|------|');

for (const gp of uniqueGrandparents) {
  const forTargets = allCallers.filter(c => c.caller === gp).map(c => hex(c.target)).join(', ');
  console.log(`Probing grandparent ${hex(gp)}...`);
  mem.set(ramSnap, RAM_START);
  mem.set(clearedVram, VRAM_BASE);
  restoreCpu(cpu, cpuSnap);
  cpu.halted=false; cpu.iff1=0; cpu.iff2=0;
  cpu._iy = PROBE_IY;
  cpu.f = 0x40;
  cpu.sp = SCREEN_STACK_TOP - PROBE_STACK_BYTES;
  mem.fill(0xff, cpu.sp, cpu.sp + PROBE_STACK_BYTES);

  const raw = executor.runFrom(gp, 'adl', { maxSteps: 500000, maxLoopIterations: 2000 });
  const s = stats(mem);
  log(`| ${hex(gp)} | ${forTargets} | ${s.drawn} | ${s.fg} | ${s.bg} | ${formatBbox(s.bbox)} | ${raw.steps} | ${raw.termination} |`);
}

fs.writeFileSync(reportPath, out.join('\n'));
console.log(`Wrote ${out.length} lines to ${reportPath}`);

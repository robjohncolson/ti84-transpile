#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

const MEM_SIZE = 0x1000000;
const STACK_RESET_TOP = 0xD1A87E;
const IDLE_LOOP = 0x0019be;
const VAT_PTRS = [0xD02587, 0xD0258A, 0xD0258D, 0xD02590, 0xD02593, 0xD0259A, 0xD0259D, 0xD025A0];
const EXTRA_DUMPS = [0xD025C5, 0xD007E0, 0xD007CA];
const WATCH = {
  memInit: 0x09DEE0,
  homeModeSetter: 0x058C47,
  errHandler: 0x061D52,
  longjmpRecovery: 0x061DD1,
  idle: IDLE_LOOP,
};

const SNAP_FIELDS = ['a', 'f', '_bc', '_de', '_hl', '_a2', '_f2', '_bc2', '_de2', '_hl2',
  'sp', '_ix', '_iy', 'i', 'im', 'iff1', 'iff2', 'madl', 'mbase', 'halted', 'cycles'];

const hex = (v, w = 6) => `0x${((v ?? 0) >>> 0).toString(16).padStart(w, '0')}`;
function read24(mem, a) { return mem[a] | (mem[a + 1] << 8) | (mem[a + 2] << 16); }
function write24(mem, a, v) { mem[a] = v & 0xFF; mem[a + 1] = (v >> 8) & 0xFF; mem[a + 2] = (v >> 16) & 0xFF; }

const mem = new Uint8Array(MEM_SIZE);
mem.set(romBytes);
const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
const executor = createExecutor(BLOCKS, mem, { peripherals });
const cpu = executor.cpu;

console.log('=== probe-meminit-trace: trace launch-home init divergence ===\n');

executor.runFrom(0x000000, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0; cpu.sp = STACK_RESET_TOP - 3; mem.fill(0xFF, cpu.sp, cpu.sp + 3);
executor.runFrom(0x08C331, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 });
cpu.mbase = 0xD0; cpu._iy = 0xD00080; cpu._hl = 0; cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
cpu.sp = STACK_RESET_TOP - 3; mem.fill(0xFF, cpu.sp, cpu.sp + 3);
executor.runFrom(0x0802B2, 'adl', { maxSteps: 100, maxLoopIterations: 32 });
cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1; cpu._iy = 0xD00080; cpu.mbase = 0xD0;
cpu.sp = STACK_RESET_TOP - 12; mem.fill(0xFF, cpu.sp, cpu.sp + 12);
executor.runFrom(IDLE_LOOP, 'adl', { maxSteps: 1_500_000, maxLoopIterations: 100000 });

const ramSnap = new Uint8Array(mem.slice(0x400000, 0xE00000));
const cpuSnap = Object.fromEntries(SNAP_FIELDS.map((f) => [f, cpu[f]]));

function restoreIdle() {
  mem.set(ramSnap, 0x400000);
  for (const [f, v] of Object.entries(cpuSnap)) cpu[f] = v;
  peripherals.setTimerEnabled(false);
}

function setupCallFrame() {
  peripherals.setTimerEnabled(false);
  cpu.halted = false;
  cpu.iff1 = 1;
  cpu.iff2 = 1;
  cpu._iy = 0xD00080;
  cpu.mbase = 0xD0;
  const sp = STACK_RESET_TOP - 24;
  cpu.sp = sp;
  write24(mem, sp, IDLE_LOOP & 0xFFFFFF);
  write24(mem, 0xD008E0, sp);
}

function dumpBlocks(blocks) {
  for (let i = 0; i < blocks.length; i += 10) {
    console.log(`  ${blocks.slice(i, i + 10).map((pc) => hex(pc)).join(' ')}`);
  }
  if (!blocks.length) console.log('  (none)');
}

function dumpVat(label) {
  console.log(`  VAT after ${label}: ${VAT_PTRS.map((a) => `${hex(a, 5)}=${hex(read24(mem, a))}`).join(' ')}`);
  console.log(`  extras: ${EXTRA_DUMPS.map((a) => `${hex(a, 5)}=${hex(read24(mem, a))}`).join(' ')}`);
}

function findDivergence(blocks) {
  for (let i = 0; i < blocks.length - 1; i++) {
    const pc = blocks[i] & 0xFFFFFF;
    const next = blocks[i + 1] & 0xFFFFFF;
    if (pc >= 0x09D000 && pc <= 0x09DDFF && (next < 0x09D000 || next > 0x09DFFF)) {
      return { from: pc, to: next };
    }
  }
  return null;
}

function runVariant(name, entry, maxSteps) {
  restoreIdle();
  setupCallFrame();
  const blocks = [];
  const allBlocks = [];
  const hits = Object.fromEntries(Object.keys(WATCH).map((k) => [k, 0]));
  let result;

  try {
    result = executor.runFrom(entry, 'adl', {
      maxSteps,
      maxLoopIterations: 30000,
      onBlock(pc) {
        const p = pc & 0xFFFFFF;
        allBlocks.push(p);
        if (blocks.length < 300) blocks.push(p);
        for (const [watchName, watchPc] of Object.entries(WATCH)) {
          if (p === watchPc) hits[watchName]++;
        }
      },
    });
  } catch (e) {
    result = { steps: -1, termination: 'threw', lastPc: null, error: String(e && e.message || e) };
  }

  const divergence = findDivergence(blocks);
  console.log(`### ${name}: entry=${hex(entry)} maxSteps=${maxSteps} ###`);
  console.log(`  run: steps=${result.steps} term=${result.termination} lastPc=${hex(result.lastPc)}${result.error ? ' err=' + result.error : ''}`);
  console.log(`  watch hits: ${Object.entries(hits).map(([k, v]) => `${k}=${v}`).join(' ')}`);
  dumpVat(name);
  console.log('  first block PCs:');
  dumpBlocks(blocks);
  if (divergence) {
    console.log(`  DIVERGENCE AT ${hex(divergence.from)} -> ${hex(divergence.to)}`);
  } else {
    console.log('  DIVERGENCE AT (not found in captured first 300 blocks)');
  }
  console.log('');
  return { name, entry, maxSteps, result, blocks, allBlocks, hits, divergence };
}

const variants = [
  runVariant('VARIANT 1 full 0x09DD14', 0x09DD14, 300000),
  runVariant('VARIANT 2 early 0x09DD14', 0x09DD14, 1500),
  runVariant('VARIANT 3 call-site 0x09DD62', 0x09DD62, 300000),
];

console.log('### ANALYSIS ###');
for (const v of variants.slice(0, 2)) {
  if (v.divergence) {
    console.log(`${v.name}: DIVERGENCE AT ${hex(v.divergence.from)} -> ${hex(v.divergence.to)}`);
  } else {
    console.log(`${v.name}: DIVERGENCE AT (not found in captured first 300 blocks)`);
  }
}
for (const [watchName, watchPc] of Object.entries(WATCH)) {
  const appeared = variants.some((v) => v.allBlocks.includes(watchPc));
  console.log(`${watchName} ${hex(watchPc)} appeared in any list: ${appeared ? 'YES' : 'NO'}`);
}
if (!variants.some((v) => v.allBlocks.includes(WATCH.memInit))) {
  console.log('MEM_INIT 0x09DEE0 never appears in any list.');
}
if (!variants[2].allBlocks.includes(WATCH.memInit)) {
  console.log('VARIANT 3: MEM_INIT 0x09DEE0 does not appear in the block list.');
}


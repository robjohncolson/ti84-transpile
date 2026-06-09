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
const INIT_IDLE_LOOP = 0x0019be;
const REPAINT_IDLE_LOOP = 0x0019b5;
const LAUNCH_INIT = 0x09DD62;
const REPAINT = 0x058241;
const WARM_KEY_EVENT = 0x02FD8F;
const VRAM_BASE = 0xD40000;
const W = 320;
const H = 240;

const OS_SCAN_2 = 0x1A;
const INTERNAL_2 = romBytes[0x09F79B + OS_SCAN_2];
const KEY_MATRIX_GROUP = 3;
const KEY_MATRIX_BIT = 1;

const SNAP_FIELDS = ['a', 'f', '_bc', '_de', '_hl', '_a2', '_f2', '_bc2', '_de2', '_hl2',
  'sp', '_ix', '_iy', 'i', 'im', 'iff1', 'iff2', 'madl', 'mbase', 'halted', 'cycles'];

const WATCH = {
  getcsc: 0x03FA09,
  keypre: 0x06CE73,
  dispatch: 0x099921,
  keyToToken: 0x061D1A,
  tokenProc: 0x03E1B4,
  err061DB2: 0x061DB2,
  err061D52: 0x061D52,
  err061D3A: 0x061D3A,
};

const hex = (v, w = 6) => v == null ? 'n/a' : `0x${(v >>> 0).toString(16).padStart(w, '0')}`;
function read24(mem, a) { return mem[a] | (mem[a + 1] << 8) | (mem[a + 2] << 16); }
function write24(mem, a, v) { mem[a] = v & 0xFF; mem[a + 1] = (v >> 8) & 0xFF; mem[a + 2] = (v >> 16) & 0xFF; }
function word(mem, x, y) { const a = VRAM_BASE + (y * W + x) * 2; return mem[a] | (mem[a + 1] << 8); }

function snapshotCpu(cpu) {
  return Object.fromEntries(SNAP_FIELDS.map((f) => [f, cpu[f]]));
}

function restoreCpu(cpu, snap) {
  for (const [f, v] of Object.entries(snap)) cpu[f] = v;
}

function vramStats(mem) {
  let black = 0;
  let nonWhite = 0;
  let bodyNonWhite = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const v = word(mem, x, y);
      if (v === 0x0000) black++;
      if (v !== 0xFFFF) {
        nonWhite++;
        if (y >= 30) bodyNonWhite++;
      }
    }
  }
  return { black, nonWhite, bodyNonWhite };
}

function hexdump(mem, addr, len) {
  const bytes = [];
  for (let i = 0; i < len; i++) bytes.push(mem[(addr + i) & 0xFFFFFF].toString(16).padStart(2, '0'));
  return bytes.join(' ');
}

function createHits() {
  return Object.fromEntries([...Object.keys(WATCH), 'errRegion'].map((k) => [k, 0]));
}

function formatHits(hits) {
  return Object.entries(hits).map(([k, v]) => `${k}=${v}`).join(' ');
}

function formatTrail(trail) {
  const lines = [];
  for (let i = 0; i < trail.length; i += 10) {
    lines.push(`    ${trail.slice(i, i + 10).map((a) => hex(a)).join(' ')}`);
  }
  return lines.join('\n');
}

function runWithWatches(entry, maxSteps, maxLoopIterations = undefined, traceErrors = false) {
  const hits = createHits();
  const missingBlocks = [];
  const rolling = [];
  let firstError = null;
  let irqs = 0;
  let result;
  try {
    result = executor.runFrom(entry, 'adl', {
      maxSteps,
      ...(maxLoopIterations == null ? {} : { maxLoopIterations }),
      onBlock(pc) {
        const p = pc & 0xFFFFFF;
        rolling.push(p);
        if (rolling.length > 60) rolling.shift();
        for (const [name, watchPc] of Object.entries(WATCH)) {
          if (p === watchPc) hits[name]++;
        }
        if (p >= 0x061D00 && p <= 0x061DB1) {
          hits.errRegion++;
          if (traceErrors && !firstError) {
            firstError = {
              pc: p,
              codeAtHit: mem[0xD008DF],
              trail: [...rolling],
            };
          }
        }
      },
      onMissingBlock(pc) {
        missingBlocks.push(pc & 0xFFFFFF);
      },
      onInterrupt() {
        irqs++;
      },
    });
  } catch (e) {
    result = { steps: -1, termination: 'threw', lastPc: null, error: String(e?.message || e) };
  }
  return { result, hits, irqs, missingBlocks, firstError };
}

function bootToIdle() {
  executor.runFrom(0x000000, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0; cpu.sp = STACK_RESET_TOP - 3; mem.fill(0xFF, cpu.sp, cpu.sp + 3);
  executor.runFrom(0x08C331, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 });
  cpu.mbase = 0xD0; cpu._iy = 0xD00080; cpu._hl = 0; cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3; mem.fill(0xFF, cpu.sp, cpu.sp + 3);
  executor.runFrom(0x0802B2, 'adl', { maxSteps: 100, maxLoopIterations: 32 });
  cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1; cpu._iy = 0xD00080; cpu.mbase = 0xD0;
  cpu.sp = STACK_RESET_TOP - 12; mem.fill(0xFF, cpu.sp, cpu.sp + 12);
  return executor.runFrom(INIT_IDLE_LOOP, 'adl', { maxSteps: 1_500_000, maxLoopIterations: 100000 });
}

function launchInit() {
  peripherals.setTimerEnabled(false);
  cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1; cpu._iy = 0xD00080; cpu.mbase = 0xD0;
  const launchSp = STACK_RESET_TOP - 24;
  cpu.sp = launchSp;
  write24(mem, launchSp, INIT_IDLE_LOOP);
  write24(mem, 0xD008E0, launchSp);
  return executor.runFrom(LAUNCH_INIT, 'adl', { maxSteps: 300000, maxLoopIterations: 30000 });
}

function pushRepaintReturn() {
  peripherals.setTimerEnabled(true);
  cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1; cpu._iy = 0xD00080; cpu.mbase = 0xD0;
  if ((cpu.sp & 0xFFFFFF) < 0x400000) cpu.sp = STACK_RESET_TOP - 24;
  cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
  write24(mem, cpu.sp, REPAINT_IDLE_LOOP);
}

function restoreGoldenSnapshot() {
  mem.set(goldenRamSnap, 0x400000);
  restoreCpu(cpu, goldenCpuSnap);
  peripherals.setTimerEnabled(true);
  cpu.halted = false;
  cpu.iff1 = 1;
  cpu.iff2 = 1;
  cpu._iy = 0xD00080;
  cpu.mbase = 0xD0;
}

function pressKey() {
  peripherals.setMatrixKey(KEY_MATRIX_GROUP, KEY_MATRIX_BIT, true);
  mem[0xD00587] = OS_SCAN_2;
  mem[0xD0058E] = INTERNAL_2;
  mem[0xD0058D] = INTERNAL_2;
  mem[0xD00080] = (mem[0xD00080] | 0x08) & 0xFF;
}

function installControlledLongjmpAnchor() {
  const sp = STACK_RESET_TOP - 24;
  cpu.sp = sp;
  write24(mem, sp, REPAINT_IDLE_LOOP);
  write24(mem, 0xD008E0, sp);
}

function reportRun(prefix, result, missingBlocks) {
  console.log(`${prefix}: steps=${result.steps} term=${result.termination} lastPc=${hex(result.lastPc)}${result.error ? ` err=${result.error}` : ''}`);
  if (result.termination === 'missing_block' || missingBlocks.length) {
    const list = missingBlocks.length ? missingBlocks : [result.lastPc & 0xFFFFFF];
    console.log(`  MISSING_BLOCK: ${list.map((a) => hex(a)).join(' ')}`);
  }
}

function reportState(prefix) {
  const d0231a = read24(mem, 0xD0231A);
  const d0243a = read24(mem, 0xD0243A);
  const stats = vramStats(mem);
  const ptrDump = d0231a ? hexdump(mem, d0231a, 32) : '(zero pointer)';
  console.log(`  ${prefix} D008DF=${hex(mem[0xD008DF], 2)} D007CA=${hex(read24(mem, 0xD007CA))}`);
  console.log(`  edit cursors: D0231A=${hex(d0231a)} D0243A=${hex(d0243a)}`);
  console.log(`  key vars: D0058E=${hex(mem[0xD0058E], 2)} D00587=${hex(mem[0xD00587], 2)} D0146D=${hex(mem[0xD0146D], 2)}`);
  console.log(`  hexdump D02434: ${hexdump(mem, 0xD02434, 32)}`);
  console.log(`  hexdump [D0231A]: ${ptrDump}`);
  console.log(`  VRAM: black=${stats.black} nonWhite=${stats.nonWhite} bodyNonWhite=${stats.bodyNonWhite}`);
}

function runV1() {
  restoreGoldenSnapshot();
  pressKey();
  const run = runWithWatches(WARM_KEY_EVENT, 800000, 100000, true);
  console.log('\n### V1 trace: original D008E0 anchor + key ###');
  reportRun('  run', run.result, run.missingBlocks);
  console.log(`  IRQs=${run.irqs}`);
  console.log(`  watch hits: ${formatHits(run.hits)}`);
  if (run.firstError) {
    console.log(`  first error block pc=${hex(run.firstError.pc)} D008DF-at-hit=${hex(run.firstError.codeAtHit, 2)} D008DF-at-end=${hex(mem[0xD008DF], 2)}`);
    console.log(`  60-block trail:\n${formatTrail(run.firstError.trail)}`);
  } else {
    console.log(`  first error block pc=n/a D008DF-at-hit=n/a D008DF-at-end=${hex(mem[0xD008DF], 2)}`);
    console.log('  60-block trail: n/a');
  }
  console.log(`  final D007CA=${hex(read24(mem, 0xD007CA))}`);
}

function runAnchoredVariant(name, doPressKey) {
  restoreGoldenSnapshot();
  if (doPressKey) pressKey();
  installControlledLongjmpAnchor();
  const run = runWithWatches(WARM_KEY_EVENT, 800000);
  console.log(`\n### ${name}: controlled D008E0 anchor + ${doPressKey ? 'key' : 'no key'} ###`);
  reportRun('  run', run.result, run.missingBlocks);
  console.log(`  IRQs=${run.irqs}`);
  reportState('post-run');
  console.log(`  watch hits: ${formatHits(run.hits)}`);
}

const mem = new Uint8Array(MEM_SIZE);
mem.set(romBytes.subarray(0, MEM_SIZE));
const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
const executor = createExecutor(BLOCKS, mem, { peripherals });
const cpu = executor.cpu;

console.log('=== probe-keypress-error-trace ===');
console.log(`'2': OS scan ${hex(OS_SCAN_2, 2)} -> internal ${hex(INTERNAL_2, 2)}, matrix [${KEY_MATRIX_GROUP},${KEY_MATRIX_BIT}]\n`);

const idleRun = bootToIdle();
reportRun('boot-to-idle', idleRun, []);

const initRun = launchInit();
reportRun('launch-init', initRun, []);
const initCx = read24(mem, 0xD007CA);
console.log(`post-init: D007CA=${hex(initCx)} D008E0=${hex(read24(mem, 0xD008E0))}`);
if (initCx !== 0x0585E9) {
  console.error(`ABORT: expected post-init D007CA=0x0585E9, got ${hex(initCx)}`);
  process.exit(2);
}

pushRepaintReturn();
const repaint = runWithWatches(REPAINT, 1500000, 60000);
reportRun('repaint', repaint.result, repaint.missingBlocks);
console.log(`  chain hits: ${formatHits(repaint.hits)}`);
const repaintD0231A = read24(mem, 0xD0231A);
const repaintD0243A = read24(mem, 0xD0243A);
const repaintStats = vramStats(mem);
console.log(`  edit cursors: D0231A=${hex(repaintD0231A)} D0243A=${hex(repaintD0243A)}`);
console.log(`  VRAM: black=${repaintStats.black} nonWhite=${repaintStats.nonWhite} bodyNonWhite=${repaintStats.bodyNonWhite}`);

const goldenRamSnap = new Uint8Array(mem.slice(0x400000, 0xE00000));
const goldenCpuSnap = snapshotCpu(cpu);

runV1();
runAnchoredVariant('V2 freeze', true);
runAnchoredVariant('V3 control', false);

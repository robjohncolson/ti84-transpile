#!/usr/bin/env node
// Probe MathPrint home-entry populator after paint, with controls.

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
const VRAM_BASE = 0xD40000;
const W = 320, H = 240;
const IDLE_LOOP = 0x0019be;
const BOOT_CONTINUATION = 0x08C33D;
const PAINT_ENTRY = 0x058241;

const WATCH = {
  predicate: 0x06C732,
  populator: 0x044D3F,
  bail: 0x044D3B,
  fpValidate: 0x07F81D,
  popCore: 0x07D583,
  postPop: 0x044FC2,
  walker: 0x07D1B4,
  rasterizer: 0x0A1799,
  classic044CE6: 0x044CE6,
  classic0452F5: 0x0452F5,
  classic04532A: 0x04532A,
  classic045357: 0x045357,
  classic0829C2: 0x0829C2,
  errorHandler: 0x061D52,
  longjmpRecovery: 0x061DD1,
};

const hex = (v, w = 6) => v == null ? 'n/a' : `0x${(v >>> 0).toString(16).padStart(w, '0')}`;
const SNAP_FIELDS = ['a', 'f', '_bc', '_de', '_hl', '_a2', '_f2', '_bc2', '_de2', '_hl2',
  'sp', '_ix', '_iy', 'i', 'im', 'iff1', 'iff2', 'madl', 'mbase', 'halted', 'cycles'];

function read24(mem, a) { return mem[a] | (mem[a + 1] << 8) | (mem[a + 2] << 16); }
function write24(mem, a, v) { mem[a] = v & 0xFF; mem[a + 1] = (v >> 8) & 0xFF; mem[a + 2] = (v >> 16) & 0xFF; }
function read16(mem, a) { return mem[a] | (mem[a + 1] << 8); }
function vramStats(mem) {
  let nonWhite = 0, black = 0;
  for (let i = 0; i < W * H; i++) {
    const a = VRAM_BASE + i * 2;
    const v = read16(mem, a);
    if (v !== 0xFFFF) nonWhite++;
    if (v === 0) black++;
  }
  return { nonWhite, black };
}
function bodyNonWhite(mem) {
  let nonWhite = 0;
  for (let y = 30; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const a = VRAM_BASE + (y * W + x) * 2;
      if (read16(mem, a) !== 0xFFFF) nonWhite++;
    }
  }
  return nonWhite;
}

const mem = new Uint8Array(MEM_SIZE);
mem.set(romBytes);
const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
const executor = createExecutor(BLOCKS, mem, { peripherals });
const cpu = executor.cpu;

console.log('=== MathPrint populator probe: post-paint flag timing ===\n');

executor.runFrom(0x000000, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0; cpu.sp = STACK_RESET_TOP - 3; mem.fill(0xFF, cpu.sp, cpu.sp + 3);
executor.runFrom(BOOT_CONTINUATION - 0x0C, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 });
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
function seedVat() {
  write24(mem, 0xD02587, 0xD1A881); write24(mem, 0xD0258A, 0xD1A881);
  write24(mem, 0xD0258D, 0xD1A881); write24(mem, 0xD025A0, 0xD1A881);
  write24(mem, 0xD0259A, 0xD3FFFF); write24(mem, 0xD02590, 0xD3FFFF);
  write24(mem, 0xD02593, 0xD3FFFF); write24(mem, 0xD0259D, 0xD3FFFF);
  write24(mem, 0xD025C5, 0xD3FFFF - 0xD1A881);
}
function setupCallFrame(returnPc) {
  cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1; cpu._iy = 0xD00080; cpu.mbase = 0xD0;
  cpu.sp = STACK_RESET_TOP - 24;
  cpu.push(returnPc & 0xFFFFFF);
  write24(mem, 0xD008E0, cpu.sp & 0xFFFFFF);
}
function runSafe(entry, opts) {
  try {
    return executor.runFrom(entry, 'adl', opts);
  } catch (e) {
    const msg = String(e && e.message || e);
    const m = msg.match(/missing[_ -]?block[^0-9a-f]*(0x[0-9a-f]+)/i) || msg.match(/\b(0x[0-9a-f]{1,6})\b/i);
    return { steps: -1, termination: 'threw', lastPc: null, error: msg, missingBlock: m ? m[1] : null };
  }
}
function watchState() {
  return {
    hits: Object.fromEntries(Object.keys(WATCH).map((k) => [k, 0])),
    ring: [],
  };
}
function onBlockFor(state) {
  return (pc) => {
    state.ring.push(pc);
    if (state.ring.length > 40) state.ring.shift();
    for (const [n, a] of Object.entries(WATCH)) if (pc === a) state.hits[n]++;
  };
}

function driveVariant(label, entry, { mathprint }) {
  restoreIdle();
  seedVat();
  mem[0xD007E0] = 0x40;

  setupCallFrame(BOOT_CONTINUATION);
  peripherals.setTimerEnabled(true);
  const paintResult = runSafe(PAINT_ENTRY, { maxSteps: 1_200_000, maxLoopIterations: 60000 });
  const mathprintAfterPaintBeforeSet = mem[0xD00082];

  if (mathprint) mem[0xD00082] |= 0x80;
  const mathprintAfterPaint = mem[0xD00082];
  console.log(`${label}: mem[0xD00082] after paint${mathprint ? ' and MathPrint set' : ''} = ${hex(mathprintAfterPaint, 2)}`);

  const before = vramStats(mem);
  const bodyBefore = bodyNonWhite(mem);
  setupCallFrame(IDLE_LOOP);
  peripherals.setTimerEnabled(true);

  const state = watchState();
  const r = runSafe(entry, {
    maxSteps: 1_500_000,
    maxLoopIterations: 60000,
    onBlock: onBlockFor(state),
  });
  const after = vramStats(mem);
  const bodyAfter = bodyNonWhite(mem);
  const d0231a = read24(mem, 0xD0231A);
  const d0243a = read24(mem, 0xD0243A);
  const success = state.hits.populator > 0 || state.hits.fpValidate > 0 || state.hits.popCore > 0 ||
    d0231a !== 0 || d0243a !== 0 || bodyAfter > bodyBefore;
  const result = {
    label,
    entry: hex(entry),
    mathprint,
    paint: {
      steps: paintResult.steps,
      termination: paintResult.termination,
      lastPc: hex(paintResult.lastPc),
      error: paintResult.error || null,
      missingBlock: paintResult.missingBlock || null,
    },
    run: {
      steps: r.steps,
      termination: r.termination,
      lastPc: hex(r.lastPc),
      error: r.error || null,
      missingBlock: r.missingBlock || null,
    },
    watch: state.hits,
    d00082: {
      afterPaintBeforeSet: hex(mathprintAfterPaintBeforeSet, 2),
      afterPaint: hex(mathprintAfterPaint, 2),
      afterEntry: hex(mem[0xD00082], 2),
    },
    editCursor: { D0231A: hex(d0231a), D0243A: hex(d0243a) },
    bytes: { D00603: hex(mem[0xD00603], 2), D005F8: hex(mem[0xD005F8], 2), D005F9: hex(mem[0xD005F9], 2) },
    vram: { before, after, bodyBefore, bodyAfter },
    lastBlocks: state.ring.map((pc) => hex(pc)),
    success,
  };

  const reached = Object.keys(WATCH).filter((k) => state.hits[k] > 0);
  console.log(`--- ${label} (entry ${hex(entry)}, MathPrint=${mathprint ? 'Y' : 'N'}) ---`);
  console.log(`  paint: steps=${paintResult.steps} term=${paintResult.termination} lastPc=${hex(paintResult.lastPc)}${paintResult.error ? ' err=' + paintResult.error : ''}`);
  console.log(`  steps=${r.steps} term=${r.termination} lastPc=${hex(r.lastPc)}${r.error ? ' err=' + r.error : ''}`);
  if (r.missingBlock) console.log(`  missing_block=${r.missingBlock}`);
  console.log(`  watch: ${reached.length ? reached.map((k) => `${k}x${state.hits[k]}`).join(' ') : '(none)'}`);
  console.log(`  mem[0xD00082] afterPaintBeforeSet=${hex(mathprintAfterPaintBeforeSet, 2)} afterPaint=${hex(mathprintAfterPaint, 2)} afterEntry=${hex(mem[0xD00082], 2)}`);
  console.log(`  editCursor D0231A=${hex(d0231a)} D0243A=${hex(d0243a)}`);
  console.log(`  bytes D00603=${hex(mem[0xD00603], 2)} D005F8=${hex(mem[0xD005F8], 2)} D005F9=${hex(mem[0xD005F9], 2)}`);
  console.log(`  VRAM nonWhite ${before.nonWhite}->${after.nonWhite} black ${before.black}->${after.black}`);
  console.log(`  body y>=30 nonWhite ${bodyBefore}->${bodyAfter}`);
  console.log(`  lastBlocks: ${result.lastBlocks.join(' ') || '(none)'}`);
  console.log(`  SUCCESS=${success ? 'YES' : 'NO'}\n`);
  return result;
}

const variants = [
  ['MAIN post-paint MathPrint entry 0x044A69', 0x044A69, { mathprint: true }],
  ['CONTROL A post-paint classic entry 0x044A69', 0x044A69, { mathprint: false }],
  ['CONTROL B direct populator 0x044D3F post-paint MathPrint', 0x044D3F, { mathprint: true }],
];

const results = variants.map(([label, entry, opts]) => driveVariant(label, entry, opts));
const successes = results.filter((r) => r.success);

console.log('=== SUMMARY ===');
for (const r of results) {
  console.log(`${r.success ? 'SUCCESS' : 'fail   '} ${r.label}: pop=${r.watch.populator} fp=${r.watch.fpValidate} core=${r.watch.popCore} cursor=${r.editCursor.D0231A}/${r.editCursor.D0243A} body=${r.vram.bodyBefore}->${r.vram.bodyAfter} term=${r.run.termination} lastPc=${r.run.lastPc}`);
}
console.log(`success_count=${successes.length}`);

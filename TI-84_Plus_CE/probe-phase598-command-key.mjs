#!/usr/bin/env node
// probe-phase598-command-key.mjs
// Tests whether command keys (GRAPH, MATH) reach the 38-entry dispatcher at 0x099921
// when seeded into D0058C/D0058E with D0009F bit 5 set.

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
const OUTER_LOOP = 0x08C331;

const ROM_BASE = 0x09F79B;
const INTERCEPTED_CODES = new Set([0xB4, 0x3F, 0x28, 0x29, 0x7F, 0xFE, 0xFC, 0xFA]);

const WATCH_POINTS = [
  ['outer loop entry', 0x08C331],
  ['key cascade start', 0x08C3C3],
  ['JP (HL) trampoline', 0x08C745],
  ['cxMain handler', 0x0585E9],
  ['general key handler', 0x05877A],
  ['key classifier', 0x058EDA],
  ['38-entry command dispatcher', 0x099921],
  ['quit handler', 0x07BF19],
];

const hex = (v, w = 6) => v == null ? 'n/a' : `0x${(v >>> 0).toString(16).toUpperCase().padStart(w, '0')}`;
const hex8 = (v) => hex(v & 0xFF, 2);

function read24(mem, a) { return mem[a] | (mem[a + 1] << 8) | (mem[a + 2] << 16); }
function write24(mem, a, v) { mem[a] = v & 0xFF; mem[a + 1] = (v >> 8) & 0xFF; mem[a + 2] = (v >> 16) & 0xFF; }

function readTranslatedKey(raw) {
  const index = ((raw >> 4) * 8) + (raw & 0x0F) + 1;
  return { raw, index, code: romBytes[ROM_BASE + index] };
}

function runKeyProbe(label, key) {
  console.log(`\n=== ${label} key probe ===`);
  console.log(`${label} raw=${hex8(key.raw)} tableIndex=${hex8(key.index)} translated=${hex8(key.code)}`);

  // ─── Fresh runtime for each key ───
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, MEM_SIZE));
  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  // ─── Phase 0: Cold boot to idle ───
  console.log('Phase 0: Cold boot to idle...');
  executor.runFrom(0x000000, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3; mem.fill(0xFF, cpu.sp, cpu.sp + 3);
  executor.runFrom(0x08C331, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 });
  cpu.mbase = 0xD0; cpu._iy = 0xD00080; cpu._hl = 0;
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3; mem.fill(0xFF, cpu.sp, cpu.sp + 3);
  executor.runFrom(0x0802B2, 'adl', { maxSteps: 100, maxLoopIterations: 32 });
  cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1;
  cpu._iy = 0xD00080; cpu.mbase = 0xD0;
  cpu.sp = STACK_RESET_TOP - 12; mem.fill(0xFF, cpu.sp, cpu.sp + 12);
  let result = executor.runFrom(INIT_IDLE_LOOP, 'adl', { maxSteps: 1_500_000, maxLoopIterations: 100000 });
  console.log(`  Cold boot: steps=${result.steps} term=${result.termination} lastPc=${hex(result.lastPc)}`);

  // ─── Phase 1: Launch-init (0x09DD62) ───
  console.log('Phase 1: Launch-init (0x09DD62)...');
  peripherals.setTimerEnabled(false);
  cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1;
  cpu._iy = 0xD00080; cpu.mbase = 0xD0;
  const launchSp = STACK_RESET_TOP - 24;
  cpu.sp = launchSp;
  write24(mem, launchSp, INIT_IDLE_LOOP);
  write24(mem, 0xD008E0, launchSp);

  try {
    result = executor.runFrom(LAUNCH_INIT, 'adl', { maxSteps: 300000, maxLoopIterations: 30000 });
  } catch (e) {
    result = { steps: -1, termination: 'threw', lastPc: null, error: String(e?.message || e) };
  }
  console.log(`  Launch-init: steps=${result.steps} term=${result.termination} lastPc=${hex(result.lastPc)}`);
  if (result.error) console.log(`  error: ${result.error}`);

  const postInitCx = read24(mem, 0xD007CA);
  console.log(`  post-init D007CA=${hex(postInitCx)} (expect 0x0585E9)`);
  if (postInitCx !== 0x0585E9) {
    console.error(`ABORT: D007CA=${hex(postInitCx)}, expected 0x0585E9`);
    return { label, key, hitCommandDispatcher: false, hitQuitHandler: false, aborted: true };
  }

  // ─── Phase 2: Paint home screen ───
  console.log('Phase 2: Paint home screen (0x058241)...');
  peripherals.setTimerEnabled(true);
  cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1;
  cpu._iy = 0xD00080; cpu.mbase = 0xD0;
  if ((cpu.sp & 0xFFFFFF) < 0x400000) cpu.sp = STACK_RESET_TOP - 24;
  cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
  write24(mem, cpu.sp, REPAINT_IDLE_LOOP);

  try {
    result = executor.runFrom(REPAINT, 'adl', { maxSteps: 300000, maxLoopIterations: 30000 });
  } catch (e) {
    result = { steps: -1, termination: 'threw', lastPc: null, error: String(e?.message || e) };
  }
  console.log(`  Paint: steps=${result.steps} term=${result.termination} lastPc=${hex(result.lastPc)}`);
  if (result.error) console.log(`  error: ${result.error}`);

  // ─── Phase 3: Seed key state ───
  console.log('Phase 3: Seed key state...');
  mem[0xD0058C] = key.code;
  mem[0xD0058E] = key.code;
  mem[0xD0009F] |= 0x20; // SET bit 5 — tells outer loop "key pending"

  console.log(`  D0058C = ${hex8(mem[0xD0058C])}`);
  console.log(`  D0058E = ${hex8(mem[0xD0058E])}`);
  console.log(`  D0009F = ${hex8(mem[0xD0009F])} (bit5=${(mem[0xD0009F] & 0x20) ? 'SET' : 'clear'})`);
  console.log(`  D007CA = ${hex(read24(mem, 0xD007CA))}`);

  // ─── Phase 4: Run outer loop with watch tracking ───
  console.log('Phase 4: Run outer event loop at 0x08C331...');
  cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1;
  cpu._iy = 0xD00080; cpu.mbase = 0xD0;

  // Re-arm longjmp
  if ((cpu.sp & 0xFFFFFF) < 0x400000) cpu.sp = STACK_RESET_TOP - 24;
  cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
  write24(mem, cpu.sp, REPAINT_IDLE_LOOP);
  write24(mem, 0xD008E0, cpu.sp);

  // Track watch point hits via onBlock
  const watchMap = new Map(WATCH_POINTS.map(([name, address]) => [address, { name, address, hit: false, count: 0 }]));
  const allBlocks = new Set();

  try {
    result = executor.runFrom(OUTER_LOOP, 'adl', {
      maxSteps: 500000,
      maxLoopIterations: 500000,
      onBlock(pc) {
        const p = pc & 0xFFFFFF;
        if (allBlocks.size < 5000) allBlocks.add(p);
        if (watchMap.has(p)) {
          const w = watchMap.get(p);
          w.hit = true;
          w.count++;
        }
      },
    });
  } catch (e) {
    result = { steps: -1, termination: 'threw', lastPc: null, error: String(e?.message || e) };
  }

  // ─── Results ───
  console.log(`\nRun: steps=${result.steps} term=${result.termination} lastPc=${hex(result.lastPc)}`);
  if (result.error) console.log(`  error: ${result.error}`);

  console.log('\nwatch points:');
  for (const point of watchMap.values()) {
    console.log(`  ${point.hit ? 'HIT ' : 'MISS'} ${hex(point.address)} ${point.name} (${point.count}x)`);
  }

  console.log('\npost-run memory:');
  console.log(`  D0058C=${hex8(mem[0xD0058C])}`);
  console.log(`  D0058E=${hex8(mem[0xD0058E])}`);
  console.log(`  D0009F=${hex8(mem[0xD0009F])}`);
  console.log(`  D007CA=${hex(read24(mem, 0xD007CA))}`);
  console.log(`  D007E0=${hex8(mem[0xD007E0])}`);
  console.log(`  D008E0=${hex(read24(mem, 0xD008E0))}`);

  console.log(`\nunique blocks: ${allBlocks.size}`);

  return {
    label,
    key,
    hitCommandDispatcher: watchMap.get(0x099921).hit,
    hitQuitHandler: watchMap.get(0x07BF19).hit,
  };
}

// ─── Main ───
console.log('=== probe-phase598-command-key ===');
console.log(`ROM: ${path.join(__dirname, 'ROM.rom')}`);

const graph = readTranslatedKey(0x60);
const results = [runKeyProbe('GRAPH', graph)];

if (INTERCEPTED_CODES.has(graph.code)) {
  const math = readTranslatedKey(0x22);
  console.log(`\nGRAPH translated to intercepted code ${hex8(graph.code)}; trying MATH as fallback.`);
  results.push(runKeyProbe('MATH', math));
}

console.log('\n=== SUMMARY ===');
for (const r of results) {
  if (r.aborted) {
    console.log(`  ${r.label}: ABORTED (D007CA mismatch)`);
  } else {
    console.log(
      `  ${r.label}: dispatcher ${r.hitCommandDispatcher ? 'HIT' : 'MISS'}, ` +
      `quit ${r.hitQuitHandler ? 'HIT' : 'MISS'}`
    );
  }
}

process.exit(0);

#!/usr/bin/env node
// Phase 33: boot → OS init → wake via IRQ/NMI/direct-event-wait, trace where
// dispatch goes with post-init RAM state (0xD177BA=0xFF, callback pointer set).
//
// Three scenarios tested in sequence, each with a fresh executor so VRAM
// deltas and block counts are attributable to exactly one wake path:
//   A: boot → OS init → trigger NMI (vector 0x000066)
//   B: boot → OS init → trigger IRQ (IM1 vector 0x000038), depends on 0xD177BA
//   C: boot → OS init → runFrom(0x001794) (event-wait helper that wraps 0x001783 ei;halt)
//
// For each, capture: block count, VRAM writes, VRAM non-zero after, regions
// visited, last 20 blocks, missing-block count.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { PRELIFTED_BLOCKS } from './ROM.transpiled.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const hex = (v, w = 6) => '0x' + (v >>> 0).toString(16).padStart(w, '0');

const VRAM_BASE = 0xD40000;
const VRAM_SIZE = 320 * 240 * 2;

function freshEnv() {
  const p = createPeripheralBus({ trace: false, pllDelay: 2, timerInterrupt: false });
  const mem = new Uint8Array(0x1000000);
  mem.set(romBytes);
  const ex = createExecutor(PRELIFTED_BLOCKS, mem, { peripherals: p });
  return { ex, cpu: ex.cpu, mem, p };
}

function countVramNz(mem) {
  let nz = 0;
  for (let i = VRAM_BASE; i < VRAM_BASE + VRAM_SIZE; i++) if (mem[i] !== 0) nz++;
  return nz;
}

function snapshotVram(mem) {
  return new Uint8Array(mem.slice(VRAM_BASE, VRAM_BASE + VRAM_SIZE));
}

function diffVram(mem, before) {
  let changed = 0;
  for (let i = 0; i < VRAM_SIZE; i++) if (mem[VRAM_BASE + i] !== before[i]) changed++;
  return changed;
}

function runStage(label, env, entry, entryMode, opts = {}) {
  const { ex, cpu, mem } = env;
  const { setupFn = null, maxSteps = 100000, captureTrail = 20 } = opts;
  if (setupFn) setupFn(cpu, mem);

  let blocks = 0;
  let vramWrites = 0;
  const regions = new Map();
  const trail = [];
  const origWrite8 = cpu.write8.bind(cpu);
  cpu.write8 = function (addr, value) {
    if (addr >= VRAM_BASE && addr < VRAM_BASE + VRAM_SIZE) vramWrites++;
    return origWrite8(addr, value);
  };

  const vramBefore = snapshotVram(mem);
  const nzBefore = countVramNz(mem);

  const r = ex.runFrom(entry, entryMode, {
    maxSteps,
    maxLoopIterations: 500,
    onBlock: (pc) => {
      blocks++;
      const region = (pc >> 16) & 0xFF;
      regions.set(region, (regions.get(region) || 0) + 1);
      trail.push(`${hex(pc)} A=${hex(cpu.a, 2)} HL=${hex(cpu.hl)} DE=${hex(cpu.de)} BC=${hex(cpu.bc)} SP=${hex(cpu.sp)}`);
      if (trail.length > captureTrail * 2) trail.splice(0, trail.length - captureTrail * 2);
    },
  });

  const nzAfter = countVramNz(mem);
  const changed = diffVram(mem, vramBefore);

  console.log(`\n--- ${label} ---`);
  console.log(`  entry=${hex(entry)} mode=${entryMode}`);
  console.log(`  ${r.steps} steps → ${r.termination} at ${hex(r.lastPc)}`);
  console.log(`  blocks visited: ${blocks}`);
  console.log(`  VRAM writes: ${vramWrites}`);
  console.log(`  VRAM non-zero: ${nzBefore} → ${nzAfter} (delta ${nzAfter - nzBefore})`);
  console.log(`  VRAM cells changed: ${changed}`);
  console.log(`  regions:`);
  for (const [region, count] of [...regions.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)) {
    console.log(`    0x${region.toString(16).padStart(2, '0')}xxxx: ${count}`);
  }
  console.log(`  missing blocks: ${r.missingBlocks?.length ?? 0}`);
  const tailShow = trail.slice(-Math.min(captureTrail, trail.length));
  console.log(`  last ${tailShow.length} blocks:`);
  for (const t of tailShow) console.log(`    ${t}`);

  return { result: r, blocks, vramWrites, nzBefore, nzAfter, changed, regions };
}

function bootAndInit(env) {
  const { ex, cpu, mem } = env;
  // Stage 1: cold boot
  const bootR = ex.runFrom(0x000000, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
  console.log(`Boot: ${bootR.steps} steps → ${bootR.termination} at ${hex(bootR.lastPc)} mbase=${hex(cpu.mbase, 2)}`);

  // Stage 2: OS init handler 0x08C331 with sentinel stack frame
  cpu.halted = false;
  cpu.iff1 = 0; cpu.iff2 = 0;
  cpu.sp = 0xD1A87E;
  cpu.sp -= 3;
  mem[cpu.sp] = 0xFF; mem[cpu.sp + 1] = 0xFF; mem[cpu.sp + 2] = 0xFF;
  const initR = ex.runFrom(0x08C331, 'adl', { maxSteps: 100000, maxLoopIterations: 500 });
  const callback = mem[0xD02AD7] | (mem[0xD02AD8] << 8) | (mem[0xD02AD9] << 16);
  const initFlag = mem[0xD177BA];
  const sysFlag = mem[0xD0009B];
  console.log(`OS init: ${initR.steps} steps → ${initR.termination} at ${hex(initR.lastPc)}`);
  console.log(`  callback=${hex(callback)} initFlag=${hex(initFlag, 2)} sysFlag=${hex(sysFlag, 2)}`);
}

// ============================================================================
// Scenario A: boot → OS init → fire NMI (vector 0x000066)
// ============================================================================
console.log('='.repeat(70));
console.log('Scenario A: boot → OS init → NMI at 0x000066');
console.log('='.repeat(70));
{
  const env = freshEnv();
  bootAndInit(env);
  runStage('NMI dispatch', env, 0x000066, 'adl', {
    setupFn: (cpu, mem) => {
      cpu.halted = false;
      // Set a real callback pointer (0x0019BE = OS event loop per Phase 24B)
      // so the handler has somewhere to dispatch to instead of sentinel.
      mem[0xD02AD7] = 0xBE;
      mem[0xD02AD8] = 0x19;
      mem[0xD02AD9] = 0x00;
      // Push a sentinel return address so NMI handler's final RET/RETI exits cleanly.
      cpu.sp = 0xD1A87E - 3;
      mem[cpu.sp] = 0xFF; mem[cpu.sp + 1] = 0xFF; mem[cpu.sp + 2] = 0xFF;
    },
    maxSteps: 50000,
  });
}

// ============================================================================
// Scenario B: boot → OS init → fire IRQ (IM1 at 0x000038)
// ============================================================================
console.log('\n' + '='.repeat(70));
console.log('Scenario B: boot → OS init → IRQ at 0x000038 (post-init 0xD177BA set)');
console.log('='.repeat(70));
{
  const env = freshEnv();
  bootAndInit(env);
  runStage('IRQ dispatch', env, 0x000038, 'adl', {
    setupFn: (cpu, mem) => {
      cpu.halted = false;
      // Critical: the ISR at 0x710 reads flash port 0x06 and tests A==0xD0.
      // Peripheral bus returns 0xD0 already so the gate passes.
      mem[0xD02AD7] = 0xBE;
      mem[0xD02AD8] = 0x19;
      mem[0xD02AD9] = 0x00;
      // Set (IY+27) bit 6 — the system flag checked at 0x704
      cpu._iy = 0xD00080;
      mem[0xD00080 + 27] |= 0x40;
      cpu.sp = 0xD1A87E - 3;
      mem[cpu.sp] = 0xFF; mem[cpu.sp + 1] = 0xFF; mem[cpu.sp + 2] = 0xFF;
    },
    maxSteps: 50000,
  });
}

// ============================================================================
// Scenario C: boot → OS init → runFrom(0x001794) (event-wait helper)
// ============================================================================
// 0x001783 is `ei; halt; nop` per ROM dump. Its sole caller is 0x0017b0.
// 0x0017b0 has no callers, but 0x001794 is the enclosing function that calls
// 0x001778, 0x001296, 0x001652, 0x001783, 0x0017ce — classic event pump shape.
console.log('\n' + '='.repeat(70));
console.log('Scenario C: boot → OS init → runFrom(0x001794) (event-wait function)');
console.log('='.repeat(70));
{
  const env = freshEnv();
  bootAndInit(env);
  runStage('Event-wait helper', env, 0x001794, 'adl', {
    setupFn: (cpu, mem) => {
      cpu.halted = false;
      cpu.iff1 = 0; cpu.iff2 = 0;
      cpu._iy = 0xD00080;
      cpu.sp = 0xD1A87E - 3;
      mem[cpu.sp] = 0xFF; mem[cpu.sp + 1] = 0xFF; mem[cpu.sp + 2] = 0xFF;
    },
    maxSteps: 50000,
  });
}

console.log('\n' + '='.repeat(70));
console.log('Phase 33 probe complete.');

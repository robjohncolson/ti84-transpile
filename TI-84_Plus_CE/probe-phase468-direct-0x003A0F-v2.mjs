#!/usr/bin/env node
// Phase 468 v2: Direct entry at 0x003A0F after full cold boot
// Tracks key PCs via onBlock (not per-step), instruments _GetCSC and 0x003A7D

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

// --- Constants ---
const STACK_RESET_TOP = 0xD1A87E;

const TRACKED_PCS = new Map([
  [0x003A0F, 'entry (0x003A0F)'],
  [0x003A70, 'key poll loop'],
  [0x003D5A, '_GetCSC'],
  [0x003A7D, 'convergence point'],
  [0x001713, 'ISR guard'],
  [0x001933, 'sleep'],
  [0x003A89, 'reset path'],
  [0x001853, 'OS RAM reset'],
  [0x0059C6, 'display'],
  [0x003AE6, 'string printer'],
]);

const VRAM_START = 0xD40000;
const VRAM_SIZE = 320 * 240 * 2;

function hex(value, width = 6) {
  if (value === undefined || value === null) return 'n/a';
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex(Number(value) & 0xFF, 2);
}

function vramChecksum(mem) {
  let hash = 0x811C9DC5;
  for (let i = VRAM_START; i < VRAM_START + VRAM_SIZE; i++) {
    hash ^= mem[i];
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

async function main() {
  console.log('=== Phase 468 v2: Direct 0x003A0F after cold boot ===');
  console.log('');

  // --- Create runtime ---
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes);

  const peripherals = createPeripheralBus({
    timerInterrupt: true,
    timerInterval: 500,
  });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  // ============================================================
  // Stage 1: Cold boot (3 stages)
  // ============================================================
  console.log('--- Stage 1: Cold boot ---');

  // 1a. Boot entry
  const bootResult = executor.runFrom(0x000000, 'z80', {
    maxSteps: 20000,
    maxLoopIterations: 32,
  });
  console.log(`boot:      steps=${bootResult.steps} term=${bootResult.termination}`);

  // Reset CPU state between boot stages
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  // 1b. Kernel init
  const kernelResult = executor.runFrom(0x08C331, 'adl', {
    maxSteps: 200000,
    maxLoopIterations: 500,
  });
  console.log(`kernel:    steps=${kernelResult.steps} term=${kernelResult.termination}`);

  // Reset CPU state again
  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  // 1c. Post-init
  const postInitResult = executor.runFrom(0x0802B2, 'adl', {
    maxSteps: 200000,
    maxLoopIterations: 500,
  });
  console.log(`post-init: steps=${postInitResult.steps} term=${postInitResult.termination}`);
  console.log('');

  // ============================================================
  // Stage 2: Set up state AFTER boot (boot overwrites RAM)
  // ============================================================
  console.log('--- Stage 2: Post-boot state setup ---');

  mem[0xD00587] = 0x92;                       // key "9" scan code
  mem[0xD00080] = (mem[0xD00080] | 0x08) & 0xFF; // bit 3 = key available
  mem[0xD177BA] = 0x7F;                        // ISR guard NZ → reduced handler
  mem[0xD177B7] = 0x00;                        // avoid HALT trap

  // Clear CPU traps
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  console.log(`D00587 (scan code)  = ${hexByte(mem[0xD00587])}`);
  console.log(`D00080 (key flags)  = ${hexByte(mem[0xD00080])} (bit3=${(mem[0xD00080] >> 3) & 1})`);
  console.log(`D177BA (ISR guard)  = ${hexByte(mem[0xD177BA])}`);
  console.log(`D177B7 (HALT trap)  = ${hexByte(mem[0xD177B7])}`);
  console.log('');

  // ============================================================
  // Stage 3: Run from 0x003A0F with onBlock tracking
  // ============================================================
  console.log('--- Stage 3: Run from 0x003A0F ---');

  const vramBefore = vramChecksum(mem);

  // Tracking state
  const hits = new Map();
  for (const [pc] of TRACKED_PCS) {
    hits.set(pc, 0);
  }

  let getCSCFirstHit = true;
  let getCSCHitCount = 0;
  const logLines = [];  // buffer interesting events, print first 30

  function logEvent(msg) {
    if (logLines.length < 30) {
      logLines.push(msg);
    }
  }

  let runResult;
  try {
    runResult = executor.runFrom(0x003A0F, 'adl', {
      maxSteps: 500000,
      maxLoopIterations: 50000,
      diHaltBypass: true,

      onBlock(pc, mode, meta, steps) {
        const normalizedPc = pc & 0xFFFFFF;

        // Only track our specific PCs
        if (!hits.has(normalizedPc)) return;

        const count = hits.get(normalizedPc) + 1;
        hits.set(normalizedPc, count);

        // Log first 3 hits of each tracked PC
        if (count <= 3) {
          logEvent(`step=${steps} pc=${hex(normalizedPc)} [${TRACKED_PCS.get(normalizedPc)}] hit #${count} A=${hexByte(cpu.a)}`);
        }

        // Special: _GetCSC (0x003D5A)
        if (normalizedPc === 0x003D5A) {
          getCSCHitCount++;
          if (getCSCFirstHit) {
            logEvent(`  _GetCSC first hit: D00587=${hexByte(mem[0xD00587])} (expect 0x92)`);
            getCSCFirstHit = false;
          }
        }

        // Special: convergence point (0x003A7D)
        if (normalizedPc === 0x003A7D) {
          logEvent(`  0x003A7D: A=${hexByte(cpu.a)} (should be scan code from _GetCSC)`);
        }
      },

      onMissingBlock(pc, mode, steps) {
        if (logLines.length < 30) {
          logEvent(`MISSING BLOCK step=${steps} pc=${hex(pc & 0xFFFFFF)} mode=${mode}`);
        }
      },
    });
  } catch (error) {
    runResult = {
      steps: cpu.stepCount ?? 0,
      lastPc: cpu.pc ?? 0x003A0F,
      termination: 'throw',
      error: error instanceof Error ? error.message : String(error),
    };
  }

  console.log(`run: steps=${runResult.steps} term=${runResult.termination} lastPc=${hex(runResult.lastPc)}`);
  if (runResult.error) console.log(`run error: ${runResult.error}`);
  console.log('');

  // ============================================================
  // Event log (first 30 interesting events)
  // ============================================================
  if (logLines.length > 0) {
    console.log('=== Event Log (first 30) ===');
    for (const line of logLines) {
      console.log(line);
    }
    console.log('');
  }

  // ============================================================
  // Summary table
  // ============================================================
  console.log('=== Hit Count Summary ===');
  for (const [pc, label] of TRACKED_PCS) {
    const count = hits.get(pc);
    const marker = count === 0 ? ' <-- NEVER HIT' : '';
    console.log(`${hex(pc)}  ${label.padEnd(25)} hits=${count}${marker}`);
  }
  console.log('');

  // ============================================================
  // VRAM
  // ============================================================
  const vramAfter = vramChecksum(mem);
  console.log('=== VRAM ===');
  console.log(`before: ${hex(vramBefore, 8)}`);
  console.log(`after:  ${hex(vramAfter, 8)}`);
  console.log(`changed: ${vramBefore !== vramAfter}`);
  console.log('');

  // ============================================================
  // Key memory addresses after run
  // ============================================================
  console.log('=== Memory After Run ===');
  console.log(`D00587 (scan code)  = ${hexByte(mem[0xD00587])}`);
  console.log(`D00080 (key flags)  = ${hexByte(mem[0xD00080])} (bit3=${(mem[0xD00080] >> 3) & 1})`);
  console.log(`D177BA (ISR guard)  = ${hexByte(mem[0xD177BA])}`);
  console.log(`D177B7 (HALT trap)  = ${hexByte(mem[0xD177B7])}`);

  process.exitCode = 0;
}

try {
  await main();
} catch (error) {
  console.error('Fatal error:', error.stack || error);
  process.exitCode = 1;
}

#!/usr/bin/env node
// Phase 469: Test the REAL key processing path via entry at 0x02FCB3
//
// Discovery: 0x02FCB3 is the actual key processing entry, NOT 0x030078.
// Call chain: 0x02FCB3 → 0x02FCC2 → CALL 0x02FD8F (sets D00000=0xCC)
//             0x02FD8F → 0x02FD99 (main loop)
//             0x02FDBA: SET 3,(IY+8) [D00088]
//             0x02FDBE: CALL 0x03FA09 (process key - reads D00587)
//             0x030052: secondary wait loop → CALL 0x040D40 → BIT 3,(IY+0) → CALL 0x03FA09

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
  [0x02FCB3, 'entry (real key path)'],
  [0x02FCC2, 'CALL 0x02FD8F'],
  [0x02FD8F, 'mode setup (D00000=0xCC)'],
  [0x02FD99, 'main loop'],
  [0x02FDBA, 'SET 3,(IY+8)'],
  [0x02FDBE, 'CALL 0x03FA09 (key proc #1)'],
  [0x03FA09, 'key processor'],
  [0x030052, 'secondary key wait loop'],
  [0x040D40, 'system yield'],
  [0x003D5A, '_GetCSC'],
  [0x003A0F, 'error handler (BAD)'],
  [0x030078, '_SetScanGroup'],
  [0x0300A1, '_ScanKeyboard'],
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
  console.log('=== Phase 469: Real Key Processing Path (0x02FCB3) ===');
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
  console.log('--- Stage 1a: Boot entry (z80) ---');
  const stage1a = executor.runFrom(0x000000, 'z80', {
    maxSteps: 20000,
    maxLoopIterations: 32,
  });
  console.log(`  steps=${stage1a.steps} term=${stage1a.termination}`);

  // Reset CPU state
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  console.log('--- Stage 1b: Post-init (adl) ---');
  const stage1b = executor.runFrom(0x0802B2, 'adl', {
    maxSteps: 50000,
    maxLoopIterations: 32,
  });
  console.log(`  steps=${stage1b.steps} term=${stage1b.termination} nextPC=${hex(stage1b.nextPC)}`);

  // Reset CPU state
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  console.log('--- Stage 1c: Extended init (adl) ---');
  const stage1c = executor.runFrom(stage1b.nextPC, 'adl', {
    maxSteps: 500000,
    maxLoopIterations: 64,
  });
  console.log(`  steps=${stage1c.steps} term=${stage1c.termination}`);
  console.log('');

  // ============================================================
  // Stage 2: Post-boot state setup
  // ============================================================
  console.log('--- Stage 2: Post-boot state setup ---');

  // Avoid HALT trap
  mem[0xD177B7] = 0x00;

  // Inject scan code for ENTER key
  mem[0xD00587] = 0x92;

  // Set bit 3 of D00080 = key available flag
  mem[0xD00080] = (mem[0xD00080] | 0x08) & 0xFF;

  // Clear CPU traps
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  // Set MBASE and IY for OS context
  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;

  console.log(`D177B7 (HALT trap)  = ${hexByte(mem[0xD177B7])}`);
  console.log(`D00587 (scan code)  = ${hexByte(mem[0xD00587])} (ENTER=0x92)`);
  console.log(`D00080 (key flags)  = ${hexByte(mem[0xD00080])} (bit3=${(mem[0xD00080] >> 3) & 1})`);
  console.log(`D00000 (mode byte)  = ${hexByte(mem[0xD00000])} (before)`);
  console.log(`D141B5 (key dest)   = ${hexByte(mem[0xD141B5])} (before)`);
  console.log('');

  // ============================================================
  // Stage 3: Run from 0x02FCB3 (real key processing entry)
  // ============================================================
  console.log('--- Stage 3: Run from 0x02FCB3 ---');

  const vramBefore = vramChecksum(mem);

  // Tracking state
  const hits = new Map();
  for (const [pc] of TRACKED_PCS) {
    hits.set(pc, 0);
  }

  let keyProcFirstA = null;  // Register A when 0x03FA09 first hit
  const logLines = [];

  function logEvent(msg) {
    if (logLines.length < 50) {
      logLines.push(msg);
    }
  }

  let runResult;
  try {
    runResult = executor.runFrom(0x02FCB3, 'adl', {
      maxSteps: 500000,
      maxLoopIterations: 256,
      diHaltBypass: true,

      onBlock(pc, mode, meta, steps) {
        const normalizedPc = pc & 0xFFFFFF;

        if (!hits.has(normalizedPc)) return;

        const count = hits.get(normalizedPc) + 1;
        hits.set(normalizedPc, count);

        // Log first 5 hits of each tracked PC
        if (count <= 5) {
          logEvent(`step=${steps} pc=${hex(normalizedPc)} [${TRACKED_PCS.get(normalizedPc)}] hit #${count} A=${hexByte(cpu.a)}`);
        }

        // Capture register A on first hit of key processor (0x03FA09)
        if (normalizedPc === 0x03FA09 && keyProcFirstA === null) {
          keyProcFirstA = cpu.a & 0xFF;
          logEvent(`  -> key processor first A=${hexByte(keyProcFirstA)} D00587=${hexByte(mem[0xD00587])}`);
        }

        // Flag error handler hit
        if (normalizedPc === 0x003A0F) {
          logEvent(`  *** ERROR HANDLER HIT (should NOT happen) A=${hexByte(cpu.a)} ***`);
        }

        // _GetCSC detail
        if (normalizedPc === 0x003D5A && count <= 3) {
          logEvent(`  _GetCSC: D00587=${hexByte(mem[0xD00587])} D00080=${hexByte(mem[0xD00080])} bit3=${(mem[0xD00080] >> 3) & 1}`);
        }
      },

      onMissingBlock(pc, mode, steps) {
        if (logLines.length < 50) {
          logEvent(`MISSING BLOCK step=${steps} pc=${hex(pc & 0xFFFFFF)} mode=${mode}`);
        }
      },
    });
  } catch (error) {
    runResult = {
      steps: cpu.stepCount ?? 0,
      lastPc: cpu.pc ?? 0x02FCB3,
      termination: 'throw',
      error: error instanceof Error ? error.message : String(error),
    };
  }

  console.log(`run: steps=${runResult.steps} term=${runResult.termination} lastPc=${hex(runResult.lastPc)}`);
  if (runResult.error) console.log(`run error: ${runResult.error}`);
  console.log('');

  // ============================================================
  // Event log
  // ============================================================
  if (logLines.length > 0) {
    console.log('=== Event Log (first 50) ===');
    for (const line of logLines) {
      console.log(line);
    }
    console.log('');
  }

  // ============================================================
  // Hit Count Summary
  // ============================================================
  console.log('=== Hit Count Summary ===');
  for (const [pc, label] of TRACKED_PCS) {
    const count = hits.get(pc);
    const marker = count === 0 ? ' <-- NEVER HIT' : '';
    const warn = (pc === 0x003A0F && count > 0) ? ' *** UNEXPECTED ***' : '';
    console.log(`${hex(pc)}  ${label.padEnd(30)} hits=${count}${marker}${warn}`);
  }
  console.log('');

  // ============================================================
  // Key Processing Analysis
  // ============================================================
  console.log('=== Key Processing Analysis ===');
  console.log(`key processor (0x03FA09) first A = ${keyProcFirstA !== null ? hexByte(keyProcFirstA) : 'never hit'}`);
  console.log(`error handler (0x003A0F) hit     = ${hits.get(0x003A0F) > 0 ? 'YES (BAD)' : 'no (good)'}`);
  console.log('');

  // ============================================================
  // VRAM
  // ============================================================
  const vramAfter = vramChecksum(mem);
  console.log('=== VRAM ===');
  console.log(`before:  ${hex(vramBefore, 8)}`);
  console.log(`after:   ${hex(vramAfter, 8)}`);
  console.log(`changed: ${vramBefore !== vramAfter}`);
  console.log('');

  // ============================================================
  // Memory After Run
  // ============================================================
  console.log('=== Memory After Run ===');
  console.log(`D00587 (scan code)  = ${hexByte(mem[0xD00587])} ${mem[0xD00587] === 0x00 ? '(consumed!)' : mem[0xD00587] === 0x92 ? '(NOT consumed)' : '(changed)'}`);
  console.log(`D00080 (key flags)  = ${hexByte(mem[0xD00080])} (bit3=${(mem[0xD00080] >> 3) & 1}) ${((mem[0xD00080] >> 3) & 1) === 0 ? '(cleared!)' : '(still set)'}`);
  console.log(`D00000 (mode byte)  = ${hexByte(mem[0xD00000])} ${mem[0xD00000] === 0xCC ? '(0xCC as expected!)' : ''}`);
  console.log(`D00088 (IY+8)       = ${hexByte(mem[0xD00088])} (bit3=${(mem[0xD00088] >> 3) & 1})`);
  console.log(`D141B5 (key dest)   = ${hexByte(mem[0xD141B5])}`);
  console.log(`D177B7 (HALT trap)  = ${hexByte(mem[0xD177B7])}`);
  console.log('');

  // ============================================================
  // Verdict
  // ============================================================
  console.log('=== Verdict ===');
  const entryHit = hits.get(0x02FCB3) > 0;
  const modeSetupHit = hits.get(0x02FD8F) > 0;
  const keyProcHit = hits.get(0x03FA09) > 0;
  const errorHit = hits.get(0x003A0F) > 0;
  const scanConsumed = mem[0xD00587] !== 0x92;

  if (entryHit && modeSetupHit && keyProcHit && !errorHit && scanConsumed) {
    console.log('PASS: Full key processing path reached, scan code consumed, no error handler');
  } else if (entryHit && modeSetupHit && keyProcHit && !errorHit) {
    console.log('PARTIAL: Key processor reached but scan code not consumed');
  } else if (entryHit && !keyProcHit) {
    console.log('PARTIAL: Entry reached but key processor never called');
  } else if (errorHit) {
    console.log('FAIL: Error handler was hit -- key path diverted');
  } else {
    console.log('FAIL: Entry point never reached');
  }

  process.exitCode = 0;
}

try {
  await main();
} catch (error) {
  console.error('Fatal error:', error.stack || error);
  process.exitCode = 1;
}

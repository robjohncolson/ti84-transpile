#!/usr/bin/env node

/**
 * Phase 264: D007D0 Boot Write-Site Tracing
 *
 * Instruments ALL writes to address 0xD007D0 during the full OS boot sequence
 * to determine which of the 12 known write sites fires FIRST and what value
 * it writes. Uses cpu.write8/write16/write24 interception (same pattern as
 * probe-phase262-bypass-08c69e.mjs) so we catch every store regardless of
 * whether it comes from a direct LD (imm24),reg or an indirect store.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createPeripheralBus } from './peripherals.js';

const cpuRuntime = await import('./cpu-runtime.js');
const { createExecutor } = cpuRuntime;

function createCPU(blocks, mem, peripherals) {
  const executor = createExecutor(blocks, mem, { peripherals });
  const cpu = executor.cpu;
  cpu.mem = mem;
  cpu.pc = 0;
  return { cpu, executor, mem };
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');

const MEM_SIZE = 0x1000000;
const MEM_MASK = MEM_SIZE - 1;

// Boot constants (same as phase 262)
const BOOT_ENTRY = 0x000000;
const BOOT_MODE = 'z80';
const BOOT_MAX_STEPS = 20000;
const BOOT_MAX_LOOP_ITERATIONS = 32;

const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const MEM_INIT_ENTRY = 0x09DEE0;
const MEM_INIT_RET = 0x7FFFF6;

const STAGE_1_ENTRY = 0x0A2B72;
const STAGE_2_ENTRY = 0x0A3301;
const STAGE_3_ENTRY = 0x0A29EC;
const STAGE_4_ENTRY = 0x0A2854;
const STAGE_MAX_LOOP_ITERATIONS = 500;

const STACK_TOP = 0xD1A87E;
const MBASE = 0xD0;
const IX_BASE = 0xD1A860;
const IY_BASE = 0xD00080;

const MODE_BUF_START = 0xD020A6;
const DISPLAY_BUF_START = 0xD006C0;
const MODE_BUF_TEXT = 'Normal Float Radian       ';

const D0009B_ADDR = 0xD0009B;
const D007D0_ADDR = 0xD007D0;

// Milestone step counts for checkpoint logging
const MILESTONES = [10000, 50000, 100000, 200000, 500000];

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function read24Raw(mem, addr) {
  const base = addr & MEM_MASK;
  return mem[base] | (mem[(base + 1) & MEM_MASK] << 8) | (mem[(base + 2) & MEM_MASK] << 16);
}

function write24(mem, addr, value) {
  const base = addr & MEM_MASK;
  mem[base] = value & 0xFF;
  mem[(base + 1) & MEM_MASK] = (value >>> 8) & 0xFF;
  mem[(base + 2) & MEM_MASK] = (value >>> 16) & 0xFF;
}

function seedAscii(mem, start, text) {
  for (let index = 0; index < text.length; index += 1) {
    mem[start + index] = text.charCodeAt(index);
  }
}

function ensureTranspiledModule() {
  if (fs.existsSync(TRANSPILED_PATH)) {
    return;
  }

  console.log(`[setup] ${path.basename(TRANSPILED_PATH)} missing, running transpiler first`);
  execFileSync(process.execPath, [path.join(REPO_ROOT, 'scripts', 'transpile-ti84-rom.mjs')], {
    cwd: REPO_ROOT,
    stdio: 'inherit',
  });

  if (!fs.existsSync(TRANSPILED_PATH)) {
    throw new Error(`Transpiler finished without creating ${TRANSPILED_PATH}`);
  }
}

function normalizeBlocks(rawBlocks) {
  if (Array.isArray(rawBlocks)) {
    return Object.fromEntries(
      rawBlocks.filter((block) => block?.id).map((block) => [block.id, block]),
    );
  }
  return rawBlocks ?? {};
}

async function loadBlocks() {
  ensureTranspiledModule();
  const moduleUrl = pathToFileURL(TRANSPILED_PATH).href;
  const romModule = await import(moduleUrl);
  const blocks = normalizeBlocks(
    romModule.PRELIFTED_BLOCKS ??
    romModule.default?.PRELIFTED_BLOCKS ??
    romModule.default ??
    romModule,
  );

  if (!blocks || !Object.keys(blocks).length) {
    throw new Error('Unable to resolve PRELIFTED_BLOCKS from ROM.transpiled.js');
  }

  return blocks;
}

function createRuntime(romBytes, blocks) {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(romBytes.length, MEM_SIZE)));

  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const runtime = createCPU(blocks, mem, peripherals);
  return {
    mem,
    peripherals,
    cpu: runtime.cpu,
    executor: runtime.executor,
  };
}

// ========================
// D007D0 write interceptor
// ========================

function installD007D0WriteTracer(cpu, mem) {
  const writeLog = [];
  const context = {
    step: 0,
    pc: null,
    stage: 'unknown',
  };

  const origWrite8 = cpu.write8.bind(cpu);
  const origWrite16 = cpu.write16.bind(cpu);
  const origWrite24 = cpu.write24.bind(cpu);

  function currentPc() {
    return context.pc ?? (cpu._currentBlockPc ?? null);
  }

  function recordWrite(addr, newByte, kind, startAddr) {
    const normalizedAddr = addr & 0xFFFFFF;
    // Check if this write touches any of the 3 bytes at D007D0..D007D2
    if (normalizedAddr < D007D0_ADDR || normalizedAddr > D007D0_ADDR + 2) {
      return;
    }

    const oldValue24 = read24Raw(mem, D007D0_ADDR);

    writeLog.push({
      step: context.step,
      pc: currentPc(),
      stage: context.stage,
      kind,
      byteAddr: normalizedAddr,
      startAddr: startAddr & 0xFFFFFF,
      oldByte: mem[normalizedAddr] & 0xFF,
      newByte: newByte & 0xFF,
      oldValue24,
    });
  }

  cpu.write8 = (addr, value) => {
    recordWrite(addr, value, 'write8', addr);
    return origWrite8(addr, value);
  };

  cpu.write16 = (addr, value) => {
    recordWrite(addr, value & 0xFF, 'write16', addr);
    recordWrite(addr + 1, (value >>> 8) & 0xFF, 'write16', addr);
    return origWrite16(addr, value);
  };

  cpu.write24 = (addr, value) => {
    recordWrite(addr, value & 0xFF, 'write24', addr);
    recordWrite(addr + 1, (value >>> 8) & 0xFF, 'write24', addr);
    recordWrite(addr + 2, (value >>> 16) & 0xFF, 'write24', addr);
    return origWrite24(addr, value);
  };

  return {
    writeLog,
    setContext(nextContext) {
      Object.assign(context, nextContext);
    },
    restore() {
      cpu.write8 = origWrite8;
      cpu.write16 = origWrite16;
      cpu.write24 = origWrite24;
    },
  };
}

// ========================
// Boot stages with tracing
// ========================

function runStageTraced(executor, cpu, tracer, label, entry, mode, maxSteps, maxLoopIterations) {
  let stepCount = 0;

  tracer.setContext({ stage: label, step: 0, pc: entry });

  const result = executor.runFrom(entry, mode, {
    maxSteps,
    maxLoopIterations,
    onBlock(pc, blockMode, _meta, step) {
      stepCount = (step ?? 0) + 1;
      tracer.setContext({ step: stepCount, pc: pc & 0xFFFFFF, stage: label });
    },
    onMissingBlock(pc, blockMode, step) {
      stepCount = (step ?? 0) + 1;
      tracer.setContext({ step: stepCount, pc: pc & 0xFFFFFF, stage: label });
    },
  });

  const totalSteps = Math.max(stepCount, result.steps ?? 0);

  return {
    label,
    entry,
    steps: totalSteps,
    termination: result.termination ?? 'unknown',
    lastPc: result.lastPc ?? entry,
    lastMode: result.lastMode ?? mode,
  };
}

function runToStopPcTraced(executor, cpu, tracer, label, entry, mode, stopPc, maxSteps, maxLoopIterations) {
  const STOP_TOKEN = '__PHASE264_STOP_PC__';
  let steps = 0;
  let lastPc = entry & 0xFFFFFF;
  let lastMode = mode;
  let termination = 'step_limit';
  let hitStop = false;

  tracer.setContext({ stage: label, step: 0, pc: entry });

  try {
    const result = executor.runFrom(entry, mode, {
      maxSteps,
      maxLoopIterations,
      onBlock(pc, blockMode, _meta, step) {
        steps = Math.max(steps, (step ?? 0) + 1);
        lastPc = pc & 0xFFFFFF;
        lastMode = blockMode ?? lastMode;
        tracer.setContext({ step: steps, pc: lastPc, stage: label });
        if (lastPc === stopPc) {
          throw new Error(STOP_TOKEN);
        }
      },
      onMissingBlock(pc, blockMode, step) {
        steps = Math.max(steps, (step ?? 0) + 1);
        lastPc = pc & 0xFFFFFF;
        lastMode = blockMode ?? lastMode;
        tracer.setContext({ step: steps, pc: lastPc, stage: label });
        if (lastPc === stopPc) {
          throw new Error(STOP_TOKEN);
        }
      },
    });

    steps = Math.max(steps, result.steps ?? 0);
    lastPc = (result.lastPc ?? lastPc) & 0xFFFFFF;
    lastMode = result.lastMode ?? lastMode;
    termination = result.termination ?? termination;
  } catch (error) {
    if (error?.message === STOP_TOKEN) {
      hitStop = true;
      termination = 'stop_pc';
    } else {
      throw error;
    }
  }

  return {
    label,
    entry,
    steps,
    lastPc,
    lastMode,
    termination,
    hitStop,
  };
}

// ========================
// Main
// ========================

async function main() {
  const romBytes = fs.readFileSync(ROM_PATH);
  const blocks = await loadBlocks();

  console.log('=== Phase 264: D007D0 Boot Write-Site Tracing ===\n');
  console.log(`ROM: ${ROM_PATH}`);
  console.log(`Target address: ${hex(D007D0_ADDR)} (3-byte pointer)\n`);

  const { mem, peripherals, cpu, executor } = createRuntime(romBytes, blocks);
  const tracer = installD007D0WriteTracer(cpu, mem);

  // Record initial value
  const initialValue = read24Raw(mem, D007D0_ADDR);
  console.log(`Initial D007D0 value (from ROM): ${hex(initialValue)}\n`);

  // ---- Stage 1: Cold boot (z80 mode) ----
  console.log('--- Running cold boot ---');
  const boot = runStageTraced(executor, cpu, tracer, 'cold_boot', BOOT_ENTRY, BOOT_MODE, BOOT_MAX_STEPS, BOOT_MAX_LOOP_ITERATIONS);
  console.log(`  cold_boot: steps=${boot.steps} term=${boot.termination} lastPc=${hex(boot.lastPc)}`);
  console.log(`  D007D0 after cold_boot: ${hex(read24Raw(mem, D007D0_ADDR))}`);
  console.log(`  Writes so far: ${tracer.writeLog.length}\n`);

  // ---- Stage 2: Kernel init ----
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  console.log('--- Running kernel init ---');
  const kernelInit = runStageTraced(executor, cpu, tracer, 'kernel_init', KERNEL_INIT_ENTRY, 'adl', 100000, 10000);
  console.log(`  kernel_init: steps=${kernelInit.steps} term=${kernelInit.termination} lastPc=${hex(kernelInit.lastPc)}`);
  console.log(`  D007D0 after kernel_init: ${hex(read24Raw(mem, D007D0_ADDR))}`);
  console.log(`  Writes so far: ${tracer.writeLog.length}\n`);

  // ---- Stage 3: Post init ----
  cpu.mbase = MBASE;
  cpu._iy = IY_BASE;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  console.log('--- Running post init ---');
  const postInit = runStageTraced(executor, cpu, tracer, 'post_init', POST_INIT_ENTRY, 'adl', 100, 32);
  console.log(`  post_init: steps=${postInit.steps} term=${postInit.termination} lastPc=${hex(postInit.lastPc)}`);
  console.log(`  D007D0 after post_init: ${hex(read24Raw(mem, D007D0_ADDR))}`);
  console.log(`  Writes so far: ${tracer.writeLog.length}\n`);

  // ---- Stage 4: Mem init ----
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.im = 0;
  cpu.i = 0;
  cpu.madl = 1;
  cpu.mbase = MBASE;
  cpu._iy = IY_BASE;
  cpu._ix = IX_BASE;
  cpu.f = 0x40;
  cpu.sp = STACK_TOP - 12;
  mem.fill(0xFF, cpu.sp, cpu.sp + 12);
  cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
  write24(mem, cpu.sp, MEM_INIT_RET);

  console.log('--- Running mem init ---');
  const memInit = runToStopPcTraced(executor, cpu, tracer, 'mem_init', MEM_INIT_ENTRY, 'adl', MEM_INIT_RET, 100000, 8192);
  console.log(`  mem_init: steps=${memInit.steps} term=${memInit.termination} lastPc=${hex(memInit.lastPc)} hitStop=${memInit.hitStop}`);
  console.log(`  D007D0 after mem_init: ${hex(read24Raw(mem, D007D0_ADDR))}`);
  console.log(`  Writes so far: ${tracer.writeLog.length}\n`);

  // ---- Stage 5-8: Homescreen stages ----
  function resetForHomescreen() {
    cpu.halted = false;
    cpu.iff1 = 0;
    cpu.iff2 = 0;
    cpu._iy = IY_BASE;
    cpu._ix = IX_BASE;
    cpu.f = 0x40;
    cpu.sp = STACK_TOP - 12;
    mem.fill(0xFF, cpu.sp, cpu.sp + 12);
  }

  // Stage 1: status bar
  resetForHomescreen();
  console.log('--- Running homescreen stage 1 (status bar) ---');
  const hs1 = runStageTraced(executor, cpu, tracer, 'hs1_statusbar', STAGE_1_ENTRY, 'adl', 30000, STAGE_MAX_LOOP_ITERATIONS);
  console.log(`  hs1_statusbar: steps=${hs1.steps} term=${hs1.termination} lastPc=${hex(hs1.lastPc)}`);
  console.log(`  D007D0 after hs1: ${hex(read24Raw(mem, D007D0_ADDR))}`);
  console.log(`  Writes so far: ${tracer.writeLog.length}\n`);

  // Stage 2: status dots
  resetForHomescreen();
  mem[D0009B_ADDR] &= ~0x40;
  console.log('--- Running homescreen stage 2 (status dots) ---');
  const hs2 = runStageTraced(executor, cpu, tracer, 'hs2_statusdots', STAGE_2_ENTRY, 'adl', 30000, STAGE_MAX_LOOP_ITERATIONS);
  console.log(`  hs2_statusdots: steps=${hs2.steps} term=${hs2.termination} lastPc=${hex(hs2.lastPc)}`);
  console.log(`  D007D0 after hs2: ${hex(read24Raw(mem, D007D0_ADDR))}`);
  console.log(`  Writes so far: ${tracer.writeLog.length}\n`);

  // Stage 3: home row
  seedAscii(mem, MODE_BUF_START, MODE_BUF_TEXT);
  seedAscii(mem, DISPLAY_BUF_START, MODE_BUF_TEXT);
  resetForHomescreen();
  console.log('--- Running homescreen stage 3 (home row) ---');
  const hs3 = runStageTraced(executor, cpu, tracer, 'hs3_homerow', STAGE_3_ENTRY, 'adl', 50000, STAGE_MAX_LOOP_ITERATIONS);
  console.log(`  hs3_homerow: steps=${hs3.steps} term=${hs3.termination} lastPc=${hex(hs3.lastPc)}`);
  console.log(`  D007D0 after hs3: ${hex(read24Raw(mem, D007D0_ADDR))}`);
  console.log(`  Writes so far: ${tracer.writeLog.length}\n`);

  // Stage 4: history
  resetForHomescreen();
  console.log('--- Running homescreen stage 4 (history) ---');
  const hs4 = runStageTraced(executor, cpu, tracer, 'hs4_history', STAGE_4_ENTRY, 'adl', 50000, STAGE_MAX_LOOP_ITERATIONS);
  console.log(`  hs4_history: steps=${hs4.steps} term=${hs4.termination} lastPc=${hex(hs4.lastPc)}`);
  console.log(`  D007D0 after hs4: ${hex(read24Raw(mem, D007D0_ADDR))}`);
  console.log(`  Writes so far: ${tracer.writeLog.length}\n`);

  // ========================
  // Results
  // ========================

  tracer.restore();

  const allWrites = tracer.writeLog;

  console.log('=== D007D0 Write Log ===\n');
  console.log(`Total byte-level writes to D007D0..D007D2: ${allWrites.length}\n`);

  if (allWrites.length === 0) {
    console.log('*** NO writes to D007D0 detected during the entire boot sequence ***');
    console.log('The address is never written by any instrumented store during boot.');
    console.log('Possible explanations:');
    console.log('  - D007D0 is written by DMA or peripheral hardware not intercepted here');
    console.log('  - D007D0 is written via a bulk memory fill (mem.fill) in a boot stage');
    console.log('  - The write happens in a later OS phase not covered by this boot sequence');
  } else {
    // Deduplicate into 24-bit write events: group consecutive byte writes from same startAddr
    const events = [];
    let lastStartAddr = null;
    let lastStep = null;
    let lastPc = null;
    let lastStage = null;

    for (const w of allWrites) {
      if (w.startAddr === lastStartAddr && w.step === lastStep && w.pc === lastPc) {
        // Same write operation, just a different byte — update the event
        const event = events[events.length - 1];
        event.bytesWritten += 1;
      } else {
        events.push({
          step: w.step,
          pc: w.pc,
          stage: w.stage,
          kind: w.kind,
          startAddr: w.startAddr,
          oldValue24: w.oldValue24,
          bytesWritten: 1,
        });
        lastStartAddr = w.startAddr;
        lastStep = w.step;
        lastPc = w.pc;
        lastStage = w.stage;
      }
    }

    console.log(`Distinct write events: ${events.length}\n`);

    // Print each event with the new 24-bit value after write
    // We need to reconstruct, but we can read from the raw log
    console.log('All write events (chronological):');
    console.log('-'.repeat(100));
    console.log(
      'Event  Stage              Step     PC         Kind      StartAddr  OldVal24    Bytes'
    );
    console.log('-'.repeat(100));

    for (let i = 0; i < events.length; i++) {
      const e = events[i];
      console.log(
        `${String(i + 1).padStart(5, ' ')}  ` +
        `${(e.stage ?? '?').padEnd(17, ' ')}  ` +
        `${String(e.step).padStart(7, ' ')}  ` +
        `${hex(e.pc)}  ` +
        `${(e.kind ?? '?').padEnd(8, ' ')}  ` +
        `${hex(e.startAddr)}  ` +
        `${hex(e.oldValue24)}  ` +
        `${e.bytesWritten}`
      );
    }

    console.log('-'.repeat(100));
    console.log('');

    // Print the raw byte-level log for the first 50 writes (for detailed analysis)
    const detailLimit = Math.min(allWrites.length, 50);
    console.log(`First ${detailLimit} byte-level writes (raw):`);
    console.log('-'.repeat(90));
    console.log(
      '  #   Stage              Step     PC         ByteAddr   Old    New    Kind'
    );
    console.log('-'.repeat(90));

    for (let i = 0; i < detailLimit; i++) {
      const w = allWrites[i];
      console.log(
        `${String(i + 1).padStart(3, ' ')}   ` +
        `${(w.stage ?? '?').padEnd(17, ' ')}  ` +
        `${String(w.step).padStart(7, ' ')}  ` +
        `${hex(w.pc)}  ` +
        `${hex(w.byteAddr)}  ` +
        `${hexByte(w.oldByte)}  ->  ` +
        `${hexByte(w.newByte)}  ` +
        `${w.kind}`
      );
    }

    if (allWrites.length > detailLimit) {
      console.log(`  ... (${allWrites.length - detailLimit} more byte-level writes omitted)`);
    }

    console.log('-'.repeat(90));
    console.log('');

    // Summary: first write event
    const first = events[0];
    console.log('=== KEY FINDING ===');
    console.log(`First write to D007D0 occurs during stage: ${first.stage}`);
    console.log(`  Step: ${first.step}`);
    console.log(`  PC at time of write: ${hex(first.pc)}`);
    console.log(`  Write kind: ${first.kind}`);
    console.log(`  Start address of write instruction: ${hex(first.startAddr)}`);
    console.log(`  Old 24-bit value at D007D0: ${hex(first.oldValue24)}`);

    // Per-stage summary
    console.log('\n--- Writes per boot stage ---');
    const stageCounts = new Map();
    for (const e of events) {
      const key = e.stage ?? 'unknown';
      stageCounts.set(key, (stageCounts.get(key) ?? 0) + 1);
    }
    for (const [stage, count] of stageCounts) {
      console.log(`  ${stage}: ${count} write event(s)`);
    }

    // Unique PCs that write to D007D0
    console.log('\n--- Unique PCs that write to D007D0 ---');
    const uniquePcs = new Map();
    for (const e of events) {
      const pcKey = e.pc;
      if (!uniquePcs.has(pcKey)) {
        uniquePcs.set(pcKey, { count: 0, firstStep: e.step, stage: e.stage, kind: e.kind });
      }
      uniquePcs.get(pcKey).count += 1;
    }

    const sortedPcs = [...uniquePcs.entries()].sort((a, b) => a[1].firstStep - b[1].firstStep);
    for (const [pc, info] of sortedPcs) {
      console.log(
        `  PC=${hex(pc)} count=${info.count} firstStep=${info.firstStep} ` +
        `stage=${info.stage} kind=${info.kind}`
      );
    }
  }

  // Final value
  console.log(`\nFinal D007D0 value after full boot: ${hex(read24Raw(mem, D007D0_ADDR))}`);
  console.log('\nDone.');
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
});

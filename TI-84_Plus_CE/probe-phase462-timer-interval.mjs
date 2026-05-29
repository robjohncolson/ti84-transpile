#!/usr/bin/env node
// Phase 462: Event loop probe with a larger timer interval.
// Run A manually requests IRQs every 5000 blocks.
// Run B enables the peripheral tick()-driven timer at the same interval.

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
const BOOT_ENTRY = 0x000000;
const BOOT_MODE = 'z80';
const BOOT_MAX_STEPS = 20000;
const BOOT_MAX_LOOP_ITERATIONS = 32;
const STACK_RESET_TOP = 0xD1A87E;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;

const EVENT_LOOP_ENTRY = 0x003A73;
const ISR_ENTRY = 0x000038;
const REDUCED_HANDLER = 0x0019BE;
const TIMER_SERVICE = 0x001ACF;
const HALT_ADDR = 0x001942;
const KEY_PROCESSOR = 0x03FA09;

const KEY_SCAN_CODE_ADDR = 0xD00587;
const KEY_AVAIL_BYTE = 0xD00085;
const DISPLAY_DIRTY_FLAG = 0xD177B7;
const POST_INIT_FLAG = 0xD177BA;
const KEY_ENABLE_FLAG = 0xD14091;

const TIMER_IRQ_INTERVAL = 5000;
const POST_BOOT_STEPS = 500000;
const POST_BOOT_MAX_LOOP_ITERATIONS = 2000;

function hex(value, width = 6) {
  if (value === undefined || value === null) return 'n/a';
  return `0x${(value >>> 0).toString(16).padStart(width, '0')}`;
}

function createRuntime() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes);

  const peripherals = createPeripheralBus({
    pllDelay: 2,
    timerInterrupt: false,
    timerInterval: TIMER_IRQ_INTERVAL,
  });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  return { mem, peripherals, executor, cpu };
}

function coldBoot(executor, cpu, mem) {
  executor.runFrom(BOOT_ENTRY, BOOT_MODE, {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: BOOT_MAX_LOOP_ITERATIONS,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
    maxSteps: 100000,
    maxLoopIterations: 10000,
  });

  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  return executor.runFrom(POST_INIT_ENTRY, 'adl', {
    maxSteps: 100,
    maxLoopIterations: 32,
  });
}

function createHitCounts() {
  return {
    isr_entry: 0,
    reduced_handler: 0,
    timer_service: 0,
    halt: 0,
    key_processor: 0,
    event_loop: 0,
  };
}

function logBootState(mem, cpu) {
  const postInitFlag = mem[POST_INIT_FLAG];
  const keyEnableFlag = mem[KEY_ENABLE_FLAG];

  console.log('--- Post-boot state ---');
  console.log(`mem[0xD177BA] (post-init flag):  ${hex(postInitFlag, 2)} ${postInitFlag !== 0 ? '(nonzero - OK)' : '(ZERO - unexpected)'}`);
  console.log(`mem[0xD14091] (key enable flag): ${hex(keyEnableFlag, 2)}`);
  console.log(`cpu.mbase: ${hex(cpu.mbase, 2)} ${cpu.mbase === 0xD0 ? '(OK)' : '(unexpected)'}`);
  console.log(`cpu.iff1: ${cpu.iff1}  cpu.iff2: ${cpu.iff2}`);
  console.log(`cpu.halted: ${cpu.halted}`);
  console.log(`cpu.im: ${cpu.im}`);
  console.log('');
}

function prepareEventLoop(mem, cpu) {
  console.log('--- Event loop setup ---');
  mem[KEY_ENABLE_FLAG] = 1;
  mem[DISPLAY_DIRTY_FLAG] = 0x55;
  console.log('mem[0xD14091] = 1 (key processing enabled)');
  console.log('mem[0xD177B7] = 0x55 (display dirty flag)');

  cpu.iff1 = 1;
  cpu.iff2 = 1;
  cpu.halted = false;
  console.log('cpu.iff1 = 1, cpu.iff2 = 1 (interrupts enabled)');

  mem[KEY_SCAN_CODE_ADDR] = 0x29;
  mem[KEY_AVAIL_BYTE] |= 0x08;
  console.log('mem[0xD00587] = 0x29 (key "1" scan code)');
  console.log('mem[0xD00085] |= 0x08 (key available flag set)');
  console.log('');
}

function logSummary(summary) {
  console.log('');
  console.log('=== Hit Count Summary ===');
  console.log(`  ISR entry      (${hex(ISR_ENTRY)}): ${summary.hitCounts.isr_entry}`);
  console.log(`  Reduced hdlr   (${hex(REDUCED_HANDLER)}): ${summary.hitCounts.reduced_handler}`);
  console.log(`  Timer service  (${hex(TIMER_SERVICE)}): ${summary.hitCounts.timer_service}`);
  console.log(`  HALT           (${hex(HALT_ADDR)}): ${summary.hitCounts.halt}`);
  console.log(`  Key processor  (${hex(KEY_PROCESSOR)}): ${summary.hitCounts.key_processor}`);
  console.log(`  Event loop     (${hex(EVENT_LOOP_ENTRY)}): ${summary.hitCounts.event_loop}`);
  console.log('');
  console.log(`  HALT->wake cycles: ${summary.haltWakeCycles}`);
  console.log(`  IRQs observed:     ${summary.interruptCount}`);
  if (summary.manualIrqsTriggered !== null) {
    console.log(`  triggerIRQ calls:  ${summary.manualIrqsTriggered}`);
  }
  console.log(`  Missing blocks:    ${summary.missingBlockCount}`);
  if (summary.missingBlockAddrs.length > 0) {
    console.log(`  Missing block PCs: ${summary.missingBlockAddrs.map((addr) => hex(addr)).join(', ')}`);
  }
  console.log('');
  console.log('=== Post-Run Memory State ===');
  console.log(`  mem[0xD00587] (scan code):     ${hex(summary.mem[KEY_SCAN_CODE_ADDR], 2)}`);
  console.log(`  mem[0xD00085] (key avail):     ${hex(summary.mem[KEY_AVAIL_BYTE], 2)} (bit3=${(summary.mem[KEY_AVAIL_BYTE] >> 3) & 1})`);
  console.log(`  mem[0xD14091] (key enable):    ${hex(summary.mem[KEY_ENABLE_FLAG], 2)}`);
  console.log(`  mem[0xD177B7] (display dirty): ${hex(summary.mem[DISPLAY_DIRTY_FLAG], 2)}`);
  console.log(`  mem[0xD177BA] (post-init):     ${hex(summary.mem[POST_INIT_FLAG], 2)}`);
  console.log(`  cpu.pc: ${hex(summary.cpu.pc)}  cpu.iff1: ${summary.cpu.iff1}  cpu.halted: ${summary.cpu.halted}`);
  console.log('');
  console.log('=== Verdict ===');
  console.log(`  Event loop progressed (>=2 HALT/wake): ${summary.haltWakeCycles >= 2 ? 'YES' : 'NO'}`);
  console.log(`  KEY_PROCESSOR reached:                 ${summary.hitCounts.key_processor > 0 ? 'YES' : 'NO'}`);
}

function runProbe(label, mode) {
  const { mem, peripherals, executor, cpu } = createRuntime();
  const hitCounts = createHitCounts();
  const missingBlockAddrs = new Set();

  let haltWakeCycles = 0;
  let lastWasHalt = false;
  let missingBlockCount = 0;
  let interruptCount = 0;
  let blocksSinceLastIRQ = 0;
  let manualIrqsTriggered = mode === 'manual' ? 0 : null;

  console.log(`=== ${label} ===`);
  console.log('');
  console.log('--- Cold boot (timer IRQ disabled) ---');
  const bootResult = coldBoot(executor, cpu, mem);
  console.log(`Boot: steps=${bootResult.steps} term=${bootResult.termination} lastPc=${hex(bootResult.lastPc)}`);
  console.log(`Post-boot PC: ${hex(cpu.pc)}`);
  console.log('');

  logBootState(mem, cpu);
  prepareEventLoop(mem, cpu);

  if (mode === 'tick') {
    peripherals.setTimerEnabled(true);
    console.log(`Timer source: peripheral tick() with interval ${TIMER_IRQ_INTERVAL}`);
    console.log('');
  } else {
    console.log(`Timer source: manual triggerIRQ() every ${TIMER_IRQ_INTERVAL} blocks`);
    console.log('');
  }

  console.log(`--- Running ${POST_BOOT_STEPS.toLocaleString()} steps from event loop entry ---`);

  let result;
  try {
    result = executor.runFrom(EVENT_LOOP_ENTRY, 'adl', {
      maxSteps: POST_BOOT_STEPS,
      maxLoopIterations: POST_BOOT_MAX_LOOP_ITERATIONS,
      diHaltBypass: false,

      onBlock(pc, blockMode, meta, steps) {
        if (pc === ISR_ENTRY) hitCounts.isr_entry++;
        if (pc === REDUCED_HANDLER) hitCounts.reduced_handler++;
        if (pc === TIMER_SERVICE) hitCounts.timer_service++;
        if (pc === HALT_ADDR) hitCounts.halt++;
        if (pc === KEY_PROCESSOR) hitCounts.key_processor++;
        if (pc === EVENT_LOOP_ENTRY) hitCounts.event_loop++;

        if (pc === HALT_ADDR) {
          lastWasHalt = true;
        } else if (lastWasHalt) {
          haltWakeCycles++;
          lastWasHalt = false;
          if (haltWakeCycles <= 5) {
            console.log(`  [wake #${haltWakeCycles}] PC after wake: ${hex(pc)} at step ${steps}`);
          }
        }

        if (mode === 'manual') {
          blocksSinceLastIRQ++;
          if (blocksSinceLastIRQ >= TIMER_IRQ_INTERVAL) {
            peripherals.triggerIRQ();
            blocksSinceLastIRQ = 0;
            manualIrqsTriggered++;
          }
        }
      },

      onMissingBlock(pc, blockMode, steps) {
        missingBlockCount++;
        if (missingBlockAddrs.size < 20) {
          missingBlockAddrs.add(pc);
        }
        if (missingBlockCount <= 5) {
          console.log(`  [missing_block] PC=${hex(pc)} mode=${blockMode} step=${steps}`);
        }
      },

      onInterrupt(type, returnPc, vector, steps) {
        interruptCount++;
        if (interruptCount <= 5) {
          console.log(`  [${type}] return=${hex(returnPc)} vector=${hex(vector)} step=${steps}`);
        }
      },
    });
  } catch (err) {
    console.log('');
    console.log(`Execution threw: ${err.message}`);
    console.log(err.stack);
    result = { steps: '?', termination: 'exception', lastPc: cpu.pc };
  }

  console.log('');
  console.log(`Run result: steps=${result.steps} term=${result.termination} lastPc=${hex(result.lastPc)}`);

  const summary = {
    label,
    mode,
    result,
    hitCounts,
    haltWakeCycles,
    interruptCount,
    manualIrqsTriggered,
    missingBlockCount,
    missingBlockAddrs: [...missingBlockAddrs],
    mem,
    cpu,
  };

  logSummary(summary);
  console.log('');

  return summary;
}

async function main() {
  console.log('=== Phase 462: Event Loop Timer Interval Probe ===');
  console.log('');

  const runA = runProbe('Run A: manual triggerIRQ (5000 interval)', 'manual');
  const runB = runProbe('Run B: tick()-based timer (5000 interval)', 'tick');

  const keyProcessorReached = runA.hitCounts.key_processor > 0 || runB.hitCounts.key_processor > 0;

  console.log('=== Overall Verdict ===');
  console.log(`Run A KEY_PROCESSOR hits: ${runA.hitCounts.key_processor}`);
  console.log(`Run B KEY_PROCESSOR hits: ${runB.hitCounts.key_processor}`);
  console.log(`Key processor reached in either run: ${keyProcessorReached ? 'YES' : 'NO'}`);

  process.exitCode = keyProcessorReached ? 0 : 1;
}

try {
  await main();
} catch (error) {
  console.error('Fatal error:', error.stack || error);
  process.exitCode = 1;
}

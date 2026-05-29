#!/usr/bin/env node
// Phase 461: Event loop + timer interrupt probe
// Tests the key-processing cycle: boot → inject key → event loop → HALT → timer IRQ → wake → repeat
//
// Boot with timer interrupts disabled (standard pattern), then manually trigger
// IRQs via peripherals.triggerIRQ() at regular intervals during the post-boot run.

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

// Addresses of interest
const POST_INIT_FLAG = 0xD177BA;
const KEY_ENABLE_FLAG = 0xD14091;
const DISPLAY_DIRTY_FLAG = 0xD177B7;
const KEY_SCAN_CODE_ADDR = 0xD00587;
const KEY_AVAIL_BYTE = 0xD00085;  // IY+5 where IY=0xD00080

// Breakpoint addresses
const ISR_ENTRY = 0x000038;
const REDUCED_HANDLER = 0x0019BE;
const TIMER_SERVICE = 0x001ACF;
const HALT_ADDR = 0x001942;
const KEY_PROCESSOR = 0x03FA09;
const EVENT_LOOP_ENTRY = 0x003A73;

// Timer IRQ interval (trigger every N blocks during post-boot run)
const TIMER_IRQ_INTERVAL = 200;

function hex(value, width = 6) {
  if (value === undefined || value === null) return 'n/a';
  return `0x${(value >>> 0).toString(16).padStart(width, '0')}`;
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

  const result = executor.runFrom(POST_INIT_ENTRY, 'adl', {
    maxSteps: 100,
    maxLoopIterations: 32,
  });

  return result;
}

async function main() {
  console.log('=== Phase 461: Event Loop + Timer Interrupt Probe ===\n');

  // --- 1. Boot with timer interrupts disabled ---
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes);

  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  console.log('--- Step 1: Cold boot (timer IRQ disabled) ---');
  const bootResult = coldBoot(executor, cpu, mem);
  console.log(`Boot: steps=${bootResult.steps} term=${bootResult.termination} lastPc=${hex(bootResult.lastPc)}`);
  console.log(`Post-boot PC: ${hex(cpu.pc)}`);
  console.log('');

  // --- 2. Read and log post-boot state ---
  console.log('--- Step 2: Post-boot state ---');
  const postInitFlag = mem[POST_INIT_FLAG];
  const keyEnableFlag = mem[KEY_ENABLE_FLAG];
  console.log(`mem[0xD177BA] (post-init flag):  ${hex(postInitFlag, 2)} ${postInitFlag !== 0 ? '(nonzero - OK)' : '(ZERO - unexpected)'}`);
  console.log(`mem[0xD14091] (key enable flag): ${hex(keyEnableFlag, 2)}`);
  console.log(`cpu.mbase: ${hex(cpu.mbase, 2)} ${cpu.mbase === 0xD0 ? '(OK)' : '(unexpected)'}`);
  console.log(`cpu.iff1: ${cpu.iff1}  cpu.iff2: ${cpu.iff2}`);
  console.log(`cpu.halted: ${cpu.halted}`);
  console.log(`cpu.im: ${cpu.im}`);
  console.log('');

  // --- 3. Set up event loop state ---
  console.log('--- Step 3: Set up event loop state ---');
  mem[KEY_ENABLE_FLAG] = 1;
  mem[DISPLAY_DIRTY_FLAG] = 0x55;
  console.log(`mem[0xD14091] = 1 (key processing enabled)`);
  console.log(`mem[0xD177B7] = 0x55 (display dirty flag)`);

  // Ensure interrupts are enabled so HALT can wake
  cpu.iff1 = 1;
  cpu.iff2 = 1;
  cpu.halted = false;
  console.log(`cpu.iff1 = 1, cpu.iff2 = 1 (interrupts enabled)`);
  console.log('');

  // --- 4 & 5: Inject key '1' (scan code 0x29) ---
  console.log('--- Step 4/5: Inject key and enable timer IRQ ---');
  mem[KEY_SCAN_CODE_ADDR] = 0x29;
  mem[KEY_AVAIL_BYTE] = mem[KEY_AVAIL_BYTE] | 0x08;  // bit 3 = key available
  console.log(`mem[0xD00587] = 0x29 (key '1' scan code)`);
  console.log(`mem[0xD00085] |= 0x08 (key available flag set)`);
  console.log(`Timer IRQ will be triggered every ${TIMER_IRQ_INTERVAL} blocks`);
  console.log('');

  // --- 6. Run 200K steps with breakpoints ---
  console.log('--- Step 6: Running 200,000 steps from event loop entry ---');

  const hitCounts = {
    isr_entry: 0,        // 0x000038
    reduced_handler: 0,  // 0x0019BE
    timer_service: 0,    // 0x001ACF
    halt: 0,             // 0x001942
    key_processor: 0,    // 0x03FA09
    event_loop: 0,       // 0x003A73
  };

  let haltWakeCycles = 0;
  let lastWasHalt = false;
  let blocksSinceLastIRQ = 0;
  let irqsTriggered = 0;
  let missingBlockCount = 0;
  const missingBlockAddrs = new Set();

  const POST_BOOT_STEPS = 200000;

  let result;
  try {
    result = executor.runFrom(EVENT_LOOP_ENTRY, 'adl', {
      maxSteps: POST_BOOT_STEPS,
      maxLoopIterations: 500,
      diHaltBypass: false,  // Don't use the coldboot bypass - we want real HALT/wake

      onBlock(pc, mode, meta, steps) {
        // Count breakpoint hits
        if (pc === ISR_ENTRY) hitCounts.isr_entry++;
        if (pc === REDUCED_HANDLER) hitCounts.reduced_handler++;
        if (pc === TIMER_SERVICE) hitCounts.timer_service++;
        if (pc === KEY_PROCESSOR) hitCounts.key_processor++;
        if (pc === EVENT_LOOP_ENTRY) hitCounts.event_loop++;

        if (pc === HALT_ADDR) {
          hitCounts.halt++;
          lastWasHalt = true;
        } else if (lastWasHalt) {
          // CPU woke from HALT
          haltWakeCycles++;
          lastWasHalt = false;

          if (haltWakeCycles <= 5) {
            console.log(`  [wake #${haltWakeCycles}] PC after wake: ${hex(pc)} at step ${steps}`);
          }
        }

        // Manually trigger timer IRQ at regular intervals
        blocksSinceLastIRQ++;
        if (blocksSinceLastIRQ >= TIMER_IRQ_INTERVAL) {
          peripherals.triggerIRQ();
          blocksSinceLastIRQ = 0;
          irqsTriggered++;
        }
      },

      onMissingBlock(pc, mode, steps) {
        missingBlockCount++;
        if (missingBlockAddrs.size < 20) {
          missingBlockAddrs.add(pc);
        }
        if (missingBlockCount <= 5) {
          console.log(`  [missing_block] PC=${hex(pc)} mode=${mode} step=${steps}`);
        }
      },

      onInterrupt(type, returnPc, vector, steps) {
        if (hitCounts.isr_entry <= 5) {
          console.log(`  [${type}] return=${hex(returnPc)} vector=${hex(vector)} step=${steps}`);
        }
      },
    });
  } catch (err) {
    console.log(`\nExecution threw: ${err.message}`);
    console.log(err.stack);
    result = { steps: '?', termination: 'exception', lastPc: cpu.pc };
  }

  console.log('');
  console.log(`Run result: steps=${result.steps} term=${result.termination} lastPc=${hex(result.lastPc)}`);
  console.log('');

  // --- 7. Report ---
  console.log('=== Hit Count Summary ===');
  console.log(`  ISR entry     (0x000038): ${hitCounts.isr_entry}`);
  console.log(`  Reduced hdlr  (0x0019BE): ${hitCounts.reduced_handler}`);
  console.log(`  Timer service  (0x001ACF): ${hitCounts.timer_service}`);
  console.log(`  HALT           (0x001942): ${hitCounts.halt}`);
  console.log(`  Key processor  (0x03FA09): ${hitCounts.key_processor}`);
  console.log(`  Event loop     (0x003A73): ${hitCounts.event_loop}`);
  console.log('');
  console.log(`  HALT→wake cycles:  ${haltWakeCycles}`);
  console.log(`  Timer IRQs fired:  ${irqsTriggered}`);
  console.log(`  Missing blocks:    ${missingBlockCount}`);

  if (missingBlockAddrs.size > 0) {
    console.log(`  Missing block PCs: ${[...missingBlockAddrs].map(a => hex(a)).join(', ')}`);
  }

  console.log('');

  // Post-run memory state
  console.log('=== Post-Run Memory State ===');
  console.log(`  mem[0xD00587] (scan code):     ${hex(mem[KEY_SCAN_CODE_ADDR], 2)}`);
  console.log(`  mem[0xD00085] (key avail):     ${hex(mem[KEY_AVAIL_BYTE], 2)} (bit3=${(mem[KEY_AVAIL_BYTE] >> 3) & 1})`);
  console.log(`  mem[0xD14091] (key enable):    ${hex(mem[KEY_ENABLE_FLAG], 2)}`);
  console.log(`  mem[0xD177B7] (display dirty): ${hex(mem[DISPLAY_DIRTY_FLAG], 2)}`);
  console.log(`  mem[0xD177BA] (post-init):     ${hex(mem[POST_INIT_FLAG], 2)}`);
  console.log(`  cpu.pc: ${hex(cpu.pc)}  cpu.iff1: ${cpu.iff1}  cpu.halted: ${cpu.halted}`);
  console.log('');

  // Verdict
  const eventLoopProgressed = haltWakeCycles >= 2;
  const isrFired = hitCounts.isr_entry > 0;
  const reducedHandlerReached = hitCounts.reduced_handler > 0;
  const timerServiceReached = hitCounts.timer_service > 0;

  console.log('=== Verdict ===');
  console.log(`  Event loop progressed (>=2 HALT/wake): ${eventLoopProgressed ? 'YES' : 'NO'}`);
  console.log(`  ISR fired:                             ${isrFired ? 'YES' : 'NO'}`);
  console.log(`  Reduced handler reached:               ${reducedHandlerReached ? 'YES' : 'NO'}`);
  console.log(`  Timer service reached:                 ${timerServiceReached ? 'YES' : 'NO'}`);
  console.log(`  Key processor reached:                 ${hitCounts.key_processor > 0 ? 'YES' : 'NO'}`);

  process.exitCode = eventLoopProgressed && isrFired ? 0 : 1;
}

try {
  await main();
} catch (error) {
  console.error('Fatal error:', error.stack || error);
  process.exitCode = 1;
}

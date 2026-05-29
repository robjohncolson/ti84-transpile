#!/usr/bin/env node
// Phase 462: Full key processing chain probe with TWO critical fixes.
//
// Fix 1: Key-available flag at CORRECT address.
//   WRONG (all previous probes): mem[0xD00085] |= 0x08
//   CORRECT: mem[0xD00080] |= 0x08 — bit 3 of (IY+0) where IY=0xD00080
//
// Fix 2: diHaltBypass defaults to true (do NOT pass diHaltBypass: false).
//   WRONG: diHaltBypass: false — CPU halts permanently at 0x001937
//   CORRECT: omit diHaltBypass — defaults to true when startAddress=0x003A73
//   and startMode='adl'. This re-enters the event loop after DI+HALT,
//   simulating what a timer IRQ would do.

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

// Boot constants
const BOOT_ENTRY = 0x000000;
const BOOT_MODE = 'z80';
const BOOT_MAX_STEPS = 20000;
const BOOT_MAX_LOOP_ITERATIONS = 32;
const STACK_RESET_TOP = 0xD1A87E;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;

// Event loop / ISR addresses to track
const EVENT_LOOP_ENTRY = 0x003A73;
const ISR_ENTRY = 0x000038;
const REDUCED_HANDLER = 0x0019BE;
const TIMER_SERVICE = 0x001ACF;
const HALT_ADDR = 0x001942;
const SLEEP_WRAPPER = 0x001933;
const GETCSC_CALL = 0x003D5A;
const GETCSC_KEY_FOUND = 0x003D75;
const EVENT_LOOP_DISPATCH = 0x003A7D;
const ISR_GUARD_KEY_DISPATCH = 0x001713;
const KEY_HANDLER = 0x001853;
const SDK_GETCSC = 0x03FA09;
const EVENT_CONSUMPTION = 0x030300;
const KEY_DISPATCHER_ENTRY = 0x02FE73;
const KEY_SCAN_CONTINUATION = 0x0158DE;

// Memory addresses
const KEY_SCAN_CODE_ADDR = 0xD00587;
const KEY_AVAIL_IY0 = 0xD00080;       // ★ CORRECT: IY+0, bit 3
const KEY_CODE_DEST = 0xD141B5;
const DISPLAY_DIRTY_FLAG = 0xD177B7;
const KEY_ENABLE_FLAG = 0xD14091;

// VRAM range
const VRAM_START = 0xD40000;
const VRAM_END = 0xD52C00;

const TIMER_IRQ_INTERVAL = 5000;
const POST_BOOT_STEPS = 500000;
const POST_BOOT_MAX_LOOP_ITERATIONS = 5000;

function hex(value, width = 6) {
  if (value === undefined || value === null) return 'n/a';
  return `0x${(value >>> 0).toString(16).padStart(width, '0')}`;
}

function countVramNonzero(mem) {
  let count = 0;
  for (let i = VRAM_START; i < VRAM_END; i++) {
    if (mem[i] !== 0) count++;
  }
  return count;
}

async function main() {
  console.log('=== Phase 462: Full Key Processing Chain (TWO FIXES) ===');
  console.log('');
  console.log('Fix 1: key-available at 0xD00080 bit 3 (IY+0), NOT 0xD00085');
  console.log('Fix 2: diHaltBypass defaults to true (omitted, not false)');
  console.log('       This re-enters event loop after DI+HALT, simulating timer IRQ wake');
  console.log('');

  // --- Create runtime ---
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes);

  const peripherals = createPeripheralBus({
    pllDelay: 2,
    timerInterrupt: false,
    timerInterval: TIMER_IRQ_INTERVAL,
  });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  // --- Cold boot ---
  console.log('--- Cold boot (timer IRQ disabled) ---');

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

  const bootResult = executor.runFrom(POST_INIT_ENTRY, 'adl', {
    maxSteps: 100,
    maxLoopIterations: 32,
  });

  console.log(`Boot: steps=${bootResult.steps} term=${bootResult.termination} lastPc=${hex(bootResult.lastPc)}`);
  console.log(`Post-boot: mbase=${hex(cpu.mbase, 2)} iy=${hex(cpu._iy)} sp=${hex(cpu.sp)}`);
  console.log('');

  // --- VRAM before ---
  const vramBefore = countVramNonzero(mem);
  console.log(`VRAM nonzero bytes before event loop: ${vramBefore}`);
  console.log('');

  // --- Set up event loop state ---
  console.log('--- Event loop setup (CORRECTED key injection) ---');

  mem[KEY_ENABLE_FLAG] = 1;
  console.log('mem[0xD14091] = 1     (key processing enable gate)');

  mem[DISPLAY_DIRTY_FLAG] = 0x55;
  console.log('mem[0xD177B7] = 0x55  (display dirty flag)');

  mem[KEY_SCAN_CODE_ADDR] = 0x29;
  console.log('mem[0xD00587] = 0x29  (key "1" scan code)');

  const iy0Before = mem[KEY_AVAIL_IY0];
  mem[KEY_AVAIL_IY0] |= 0x08;
  console.log(`mem[0xD00080] |= 0x08 (★ CORRECT: bit 3 of IY+0 = key available)`);
  console.log(`  IY+0 before: ${hex(iy0Before, 2)} -> after: ${hex(mem[KEY_AVAIL_IY0], 2)}`);

  const keyCodeBefore = mem[KEY_CODE_DEST];

  cpu.iff1 = 1;
  cpu.iff2 = 1;
  cpu.halted = false;
  console.log('cpu.iff1 = 1, cpu.iff2 = 1, halted = false');
  console.log('');

  // --- Hit tracking ---
  const hitCounts = {
    isr_entry: 0,
    reduced_handler: 0,
    timer_service: 0,
    halt: 0,
    sleep_wrapper: 0,
    event_loop: 0,
    getcsc_call: 0,
    getcsc_key_found: 0,
    event_loop_dispatch: 0,
    isr_guard_key: 0,
    key_handler: 0,
    sdk_getcsc: 0,
    event_consumption: 0,
    key_dispatcher_entry: 0,
    key_scan_continuation: 0,
  };

  let haltWakeCycles = 0;
  let lastWasHalt = false;
  let missingBlockCount = 0;
  const missingBlockAddrs = new Set();
  let interruptCount = 0;
  const first50PCs = [];
  const seenPCs = new Set();
  let firstKeyFoundStep = null;

  // --- Run event loop ---
  console.log(`--- Running ${POST_BOOT_STEPS.toLocaleString()} steps from event loop entry ${hex(EVENT_LOOP_ENTRY)} ---`);
  console.log('    ★ diHaltBypass: NOT passed (defaults to true) — event loop re-enters after DI+HALT');
  console.log('');

  let result;
  try {
    result = executor.runFrom(EVENT_LOOP_ENTRY, 'adl', {
      maxSteps: POST_BOOT_STEPS,
      maxLoopIterations: POST_BOOT_MAX_LOOP_ITERATIONS,
      // ★ Do NOT pass diHaltBypass: false — let it default to true
      // This re-enters 0x003A73 after DI+HALT, simulating timer IRQ wake

      onBlock(pc, blockMode, meta, steps) {
        // Track first 50 unique PCs
        if (seenPCs.size < 50 && !seenPCs.has(pc)) {
          seenPCs.add(pc);
          first50PCs.push({ pc, step: steps });
        }

        // Hit counts
        if (pc === ISR_ENTRY) hitCounts.isr_entry++;
        if (pc === REDUCED_HANDLER) hitCounts.reduced_handler++;
        if (pc === TIMER_SERVICE) hitCounts.timer_service++;
        if (pc === HALT_ADDR) hitCounts.halt++;
        if (pc === SLEEP_WRAPPER) hitCounts.sleep_wrapper++;
        if (pc === EVENT_LOOP_ENTRY) hitCounts.event_loop++;
        if (pc === GETCSC_CALL) hitCounts.getcsc_call++;
        if (pc === GETCSC_KEY_FOUND) {
          hitCounts.getcsc_key_found++;
          if (firstKeyFoundStep === null) {
            firstKeyFoundStep = steps;
            console.log(`  ★★★ _GetCSC KEY FOUND path hit at step ${steps}! ★★★`);
          }
        }
        if (pc === EVENT_LOOP_DISPATCH) hitCounts.event_loop_dispatch++;
        if (pc === ISR_GUARD_KEY_DISPATCH) hitCounts.isr_guard_key++;
        if (pc === KEY_HANDLER) hitCounts.key_handler++;
        if (pc === SDK_GETCSC) hitCounts.sdk_getcsc++;
        if (pc === EVENT_CONSUMPTION) hitCounts.event_consumption++;
        if (pc === KEY_DISPATCHER_ENTRY) hitCounts.key_dispatcher_entry++;
        if (pc === KEY_SCAN_CONTINUATION) hitCounts.key_scan_continuation++;

        // HALT->wake tracking
        if (pc === HALT_ADDR) {
          lastWasHalt = true;
        } else if (lastWasHalt) {
          haltWakeCycles++;
          lastWasHalt = false;
          if (haltWakeCycles <= 10) {
            console.log(`  [wake #${haltWakeCycles}] PC=${hex(pc)} step=${steps}`);
          }
        }
      },

      onMissingBlock(pc, blockMode, steps) {
        missingBlockCount++;
        if (missingBlockAddrs.size < 20) {
          missingBlockAddrs.add(pc);
        }
        if (missingBlockCount <= 10) {
          console.log(`  [missing_block] PC=${hex(pc)} mode=${blockMode} step=${steps}`);
        }
      },

      onInterrupt(type, returnPc, vector, steps) {
        interruptCount++;
        if (interruptCount <= 10) {
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

  // --- First 50 unique PCs ---
  console.log('');
  console.log('=== First 50 Unique PCs Visited ===');
  for (const { pc, step } of first50PCs) {
    console.log(`  ${hex(pc)} at step ${step}`);
  }

  // --- Hit counts ---
  console.log('');
  console.log('=== Hit Count Summary ===');
  console.log(`  ISR entry          (${hex(ISR_ENTRY)}):   ${hitCounts.isr_entry}`);
  console.log(`  Reduced handler    (${hex(REDUCED_HANDLER)}):   ${hitCounts.reduced_handler}`);
  console.log(`  Timer service      (${hex(TIMER_SERVICE)}):   ${hitCounts.timer_service}`);
  console.log(`  HALT               (${hex(HALT_ADDR)}):   ${hitCounts.halt}`);
  console.log(`  Sleep wrapper      (${hex(SLEEP_WRAPPER)}):   ${hitCounts.sleep_wrapper}`);
  console.log(`  Event loop entry   (${hex(EVENT_LOOP_ENTRY)}):   ${hitCounts.event_loop}`);
  console.log(`  _GetCSC call       (${hex(GETCSC_CALL)}):   ${hitCounts.getcsc_call}`);
  console.log(`  _GetCSC KEY FOUND  (${hex(GETCSC_KEY_FOUND)}):   ${hitCounts.getcsc_key_found}`);
  console.log(`  Event loop dispatch(${hex(EVENT_LOOP_DISPATCH)}):   ${hitCounts.event_loop_dispatch}`);
  console.log(`  ISR guard key      (${hex(ISR_GUARD_KEY_DISPATCH)}):   ${hitCounts.isr_guard_key}`);
  console.log(`  Key handler        (${hex(KEY_HANDLER)}):   ${hitCounts.key_handler}`);
  console.log(`  Sleep wrapper      (${hex(SLEEP_WRAPPER)}):   ${hitCounts.sleep_wrapper}`);
  console.log(`  SDK GetCSC         (${hex(SDK_GETCSC)}):   ${hitCounts.sdk_getcsc}`);
  console.log(`  Event consumption  (${hex(EVENT_CONSUMPTION)}):   ${hitCounts.event_consumption}`);
  console.log(`  Key dispatcher     (${hex(KEY_DISPATCHER_ENTRY)}):   ${hitCounts.key_dispatcher_entry}`);
  console.log(`  Key scan cont.     (${hex(KEY_SCAN_CONTINUATION)}):   ${hitCounts.key_scan_continuation}`);

  // --- HALT/wake / DI+HALT bypass ---
  console.log('');
  console.log('=== DI+HALT Bypass & Wake Tracking ===');
  console.log(`  Event loop re-entries (0x003A73 hits): ${hitCounts.event_loop}`);
  console.log(`  HALT events (0x001942 hits):           ${hitCounts.halt}`);
  console.log(`  DI+HALT bypass wake cycles:            ${haltWakeCycles}`);
  console.log(`  IRQs observed:                         ${interruptCount}`);
  console.log(`  Missing blocks:                        ${missingBlockCount}`);
  if (missingBlockAddrs.size > 0) {
    console.log(`  Missing block PCs: ${[...missingBlockAddrs].map((a) => hex(a)).join(', ')}`);
  }

  // --- Post-run memory state ---
  console.log('');
  console.log('=== Post-Run Memory State ===');
  const keyCodeAfter = mem[KEY_CODE_DEST];
  console.log(`  mem[0xD141B5] (key code dest):  ${hex(keyCodeAfter, 2)} (before: ${hex(keyCodeBefore, 2)}) ${keyCodeAfter !== keyCodeBefore ? '★ CHANGED' : '(unchanged)'}`);
  console.log(`  mem[0xD00587] (scan code):      ${hex(mem[KEY_SCAN_CODE_ADDR], 2)} ${mem[KEY_SCAN_CODE_ADDR] === 0x29 ? '(NOT consumed)' : mem[KEY_SCAN_CODE_ADDR] === 0x00 ? '(consumed = 0x00)' : '(changed)'}`);
  console.log(`  mem[0xD00080] (IY+0 flags):     ${hex(mem[KEY_AVAIL_IY0], 2)} (bit3=${(mem[KEY_AVAIL_IY0] >> 3) & 1}) ${((mem[KEY_AVAIL_IY0] >> 3) & 1) === 0 ? '(bit 3 cleared)' : '(bit 3 still set)'}`);
  console.log(`  mem[0xD177B7] (display dirty):   ${hex(mem[DISPLAY_DIRTY_FLAG], 2)}`);
  console.log(`  mem[0xD14091] (key enable gate): ${hex(mem[KEY_ENABLE_FLAG], 2)}`);
  console.log(`  cpu.pc: ${hex(cpu.pc)}  cpu.iff1: ${cpu.iff1}  cpu.halted: ${cpu.halted}`);

  // --- VRAM after ---
  const vramAfter = countVramNonzero(mem);
  const vramChanged = vramAfter !== vramBefore;
  console.log('');
  console.log('=== VRAM Check ===');
  console.log(`  VRAM nonzero bytes before: ${vramBefore}`);
  console.log(`  VRAM nonzero bytes after:  ${vramAfter}`);
  console.log(`  VRAM changed: ${vramChanged ? 'YES' : 'NO'}`);

  // --- First key found ---
  if (firstKeyFoundStep !== null) {
    console.log('');
    console.log(`  ★ First _GetCSC KEY FOUND (${hex(GETCSC_KEY_FOUND)}) at step: ${firstKeyFoundStep}`);
  }

  // --- Verdict ---
  console.log('');
  console.log('=== Verdict ===');

  const level1 = hitCounts.getcsc_key_found > 0;
  const level2 = hitCounts.event_loop_dispatch > 0;
  const level3 = hitCounts.sdk_getcsc > 0 || hitCounts.event_consumption > 0 || hitCounts.key_dispatcher_entry > 0 || hitCounts.key_handler > 0;
  const level4 = keyCodeAfter !== keyCodeBefore;
  const level5 = vramChanged;

  console.log(`  Level 1: _GetCSC found key        (${hex(GETCSC_KEY_FOUND)} > 0):  ${level1 ? 'PASS ★★★' : 'FAIL'}`);
  console.log(`  Level 2: Event loop dispatched     (${hex(EVENT_LOOP_DISPATCH)} > 0):  ${level2 ? 'PASS ★★★' : 'FAIL'}`);
  console.log(`  Level 3: Deep handlers reached:                      ${level3 ? 'PASS ★★★' : 'FAIL'}`);
  if (level3) {
    console.log(`    SDK GetCSC:        ${hitCounts.sdk_getcsc}`);
    console.log(`    Event consumption: ${hitCounts.event_consumption}`);
    console.log(`    Key dispatcher:    ${hitCounts.key_dispatcher_entry}`);
    console.log(`    Key handler:       ${hitCounts.key_handler}`);
  }
  console.log(`  Level 4: D141B5 changed (key code written):          ${level4 ? 'PASS ★★★' : 'FAIL'}`);
  console.log(`  Level 5: VRAM changed (display updated):             ${level5 ? 'PASS ★★★' : 'FAIL'}`);

  console.log('');
  if (level1) {
    console.log('★★★ KEY PROCESSING CHAIN WORKING — _GetCSC found the injected key ★★★');
  } else {
    console.log('Key processing chain did not reach _GetCSC KEY FOUND path.');
    console.log('Check hit counts above for where the chain stalls.');
  }

  process.exitCode = level1 ? 0 : 1;
}

try {
  await main();
} catch (error) {
  console.error('Fatal error:', error.stack || error);
  process.exitCode = 1;
}

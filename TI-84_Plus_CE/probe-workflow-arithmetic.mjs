#!/usr/bin/env node
// Workflow probe: 1 + 1 ENTER → expect "2" on screen.
//
// This is a STUDENT-FACING FORCING FUNCTION, not a passing regression.
// Its job is to fail loudly with diagnostics so each auto-session has a
// concrete "what's missing to wire an end-to-end student workflow" signal.
//
// Expected outcome today: FAIL — the OS event loop / _GetCSC dispatch is
// still being decoded (see CONTINUATION_PROMPT_CODEX.md Phase 25G work).
// When this probe goes green, a student can do arithmetic in the browser.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

const MEM_SIZE = 0x1000000;
const VRAM_BASE = 0xD40000;
const VRAM_BYTE_SIZE = 320 * 240 * 2;
const STACK_RESET_TOP = 0xD1A87E;
const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const STAGE_ENTRIES = [0x0A2B72, 0x0A3301, 0x0A29EC, 0x0A2854];
const EVENT_LOOP_ENTRY = 0x003A73;

// Per keyboard-matrix.md: scan code = (idx << 4) | bit; clear that bit in keyMatrix[idx] to press.
const KEY_ONE   = { idx: 4, bit: 1, label: '1',     scan: 0x41 };
const KEY_PLUS  = { idx: 1, bit: 1, label: '+',     scan: 0x11 };
const KEY_ENTER = { idx: 1, bit: 0, label: 'ENTER', scan: 0x10 };
const SEQUENCE = [KEY_ONE, KEY_PLUS, KEY_ONE, KEY_ENTER];

const STEPS_PER_PRESS = 200000;
const STEPS_AFTER_RELEASE = 50000;
const MAX_LOOPS = 5000;

function hex(value, width = 6) {
  if (value === undefined || value === null) return 'n/a';
  return `0x${(value >>> 0).toString(16).padStart(width, '0')}`;
}

function vramHash(mem) {
  return createHash('sha256').update(mem.subarray(VRAM_BASE, VRAM_BASE + VRAM_BYTE_SIZE)).digest('hex').slice(0, 12);
}

function vramNonWhitePixelCount(mem) {
  let count = 0;
  for (let i = VRAM_BASE; i < VRAM_BASE + VRAM_BYTE_SIZE; i += 2) {
    const px = mem[i] | (mem[i + 1] << 8);
    if (px !== 0xFFFF && px !== 0xAAAA) count++;
  }
  return count;
}

function pressKey(peripherals, key)   { peripherals.keyboard.keyMatrix[key.idx] &= ~(1 << key.bit); peripherals.setKeyboardIRQ(true); }
function releaseKey(peripherals, key) { peripherals.keyboard.keyMatrix[key.idx] |=  (1 << key.bit); peripherals.setKeyboardIRQ(false); }

function bootToHomeScreen(executor, cpu, mem) {
  const bootResult = executor.runFrom(BOOT_ENTRY, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
  console.log(`  boot: steps=${bootResult.steps} term=${bootResult.termination} lastPc=${hex(bootResult.lastPc)}`);
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0; cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const kernelResult = executor.runFrom(KERNEL_INIT_ENTRY, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 });
  console.log(`  kernel: steps=${kernelResult.steps} term=${kernelResult.termination} lastPc=${hex(kernelResult.lastPc)}`);
  cpu.mbase = 0xD0; cpu._iy = 0xD00080; cpu._hl = 0;
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0; cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const postInitResult = executor.runFrom(POST_INIT_ENTRY, 'adl', { maxSteps: 100, maxLoopIterations: 32 });
  console.log(`  postInit: steps=${postInitResult.steps} term=${postInitResult.termination} lastPc=${hex(postInitResult.lastPc)}`);

  let lastResult = postInitResult;
  for (let i = 0; i < STAGE_ENTRIES.length; i++) {
    const entry = STAGE_ENTRIES[i];
    cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
    cpu._iy = 0xD00080; cpu.f = 0x40; cpu._ix = 0xD1A860;
    cpu.sp = STACK_RESET_TOP - 12;
    mem.fill(0xFF, cpu.sp, cpu.sp + 12);
    lastResult = executor.runFrom(entry, 'adl', { maxSteps: 50000, maxLoopIterations: 500 });
    console.log(`  stage${i + 1}: entry=${hex(entry)} steps=${lastResult.steps} term=${lastResult.termination} lastPc=${hex(lastResult.lastPc)}`);
  }

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.f = 0x40;
  cpu._ix = 0xD1A860;
  cpu._iy = 0xD00080;
  cpu.sp = STACK_RESET_TOP - 12;
  mem.fill(0xFF, cpu.sp, cpu.sp + 12);

  return { lastPc: EVENT_LOOP_ENTRY, lastMode: 'adl' };
}

function main() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes);
  mem.fill(0xAA, VRAM_BASE, VRAM_BASE + VRAM_BYTE_SIZE);

  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, {
    peripherals,
    onWake: (haltPc, newPc, newMode) => {
      console.log(`    HALT-wake: haltPc=${hex(haltPc)} -> newPc=${hex(newPc)} mode=${newMode}`);
    },
  });
  const cpu = executor.cpu;

  console.log('--- workflow probe: 1 + 1 ENTER → expect "2" ---');
  console.log('phase 1: boot to home screen');
  const bootState = bootToHomeScreen(executor, cpu, mem);
  mem[0xD14091] = 1;
  mem[0xD177B7] = 0x55;
  console.log(`  D14091=${hex(mem[0xD14091], 2)} (key processing enabled)`);
  console.log(`  D177B7=${hex(mem[0xD177B7], 2)} (display refresh mode)`);
  console.log(`  D141B5=${hex(mem[0xD141B5], 2)} (key buffer, should be 0x00)`);

  const baselineHash = vramHash(mem);
  const baselinePixels = vramNonWhitePixelCount(mem);
  console.log(`  vramHash=${baselineHash} nonWhitePixels=${baselinePixels} resumePc=${hex(bootState.lastPc)} resumeMode=${bootState.lastMode}`);

  console.log('phase 2: inject key sequence');
  const log = [];
  let currentPc = bootState.lastPc;
  let currentMode = bootState.lastMode ?? 'adl';
  for (const key of SEQUENCE) {
    const beforeHash = vramHash(mem);

    pressKey(peripherals, key);
    let pressResult;
    try {
      pressResult = executor.runFrom(currentPc, currentMode, {
        maxSteps: STEPS_PER_PRESS,
        maxLoopIterations: MAX_LOOPS,
        diHaltBypass: true,
      });
    } catch (err) {
      pressResult = { error: err.message, steps: 0, termination: 'throw', lastPc: currentPc, lastMode: currentMode };
    }
    releaseKey(peripherals, key);

    // Resume the release phase from wherever the press phase left the CPU.
    currentPc = pressResult.lastPc ?? currentPc;
    currentMode = pressResult.lastMode ?? currentMode;

    let releaseResult;
    try {
      releaseResult = executor.runFrom(currentPc, currentMode, {
        maxSteps: STEPS_AFTER_RELEASE,
        maxLoopIterations: MAX_LOOPS,
        diHaltBypass: true,
      });
    } catch (err) {
      releaseResult = { error: err.message, steps: 0, termination: 'throw', lastPc: currentPc, lastMode: currentMode };
    }

    // If we ended up at the HALT barrier again, reset to event loop entry.
    if (releaseResult.lastPc >= 0x001933 && releaseResult.lastPc <= 0x001942) {
      currentPc = EVENT_LOOP_ENTRY;
      currentMode = 'adl';
    } else {
      currentPc = releaseResult.lastPc ?? currentPc;
      currentMode = releaseResult.lastMode ?? currentMode;
    }

    console.log(`    D141B5=${hex(mem[0xD141B5], 2)} D14091=${hex(mem[0xD14091], 2)} D177B7=${hex(mem[0xD177B7], 2)} D00587=${hex(mem[0xD00587], 2)} D1441D=${hex(mem[0xD1441D] | (mem[0xD1441E] << 8) | (mem[0xD1441F] << 16), 6)}`);

    const afterHash = vramHash(mem);
    log.push({
      key: key.label, scan: key.scan,
      pressSteps: pressResult.steps, pressTerm: pressResult.termination, pressLastPc: pressResult.lastPc,
      releaseSteps: releaseResult.steps, releaseTerm: releaseResult.termination, releaseLastPc: releaseResult.lastPc,
      vramChanged: beforeHash !== afterHash,
      afterHash,
    });
    console.log(`  press ${key.label.padEnd(5)} (scan=${hex(key.scan, 2)}): pressSteps=${pressResult.steps} term=${pressResult.termination} lastPc=${hex(pressResult.lastPc)} → releaseSteps=${releaseResult.steps} releaseTerm=${releaseResult.termination} lastPc=${hex(releaseResult.lastPc)} vramChanged=${beforeHash !== afterHash}`);
  }

  const finalHash = vramHash(mem);
  const finalPixels = vramNonWhitePixelCount(mem);

  console.log('phase 3: verification');
  console.log(`  baselineVramHash=${baselineHash} finalVramHash=${finalHash} anyChange=${baselineHash !== finalHash}`);
  console.log(`  baselinePixels=${baselinePixels} finalPixels=${finalPixels} delta=${finalPixels - baselinePixels}`);

  const anyVramChanged = log.some((e) => e.vramChanged);
  const allStepped = log.every((e) => e.pressSteps > 0);

  console.log('--- assertions ---');
  console.log(`  [${anyVramChanged ? 'PASS' : 'FAIL'}] vram changed after at least one keypress`);
  console.log(`  [${allStepped ? 'PASS' : 'FAIL'}] cpu advanced steps after every press`);
  console.log(`  [FAIL] "2" visible on screen (no font-decoder check yet — wire this when above pass)`);

  if (!anyVramChanged) {
    console.log('');
    console.log('DIAGNOSTIC: VRAM never changed. Likely causes:');
    console.log('  - OS event loop not entered (need correct resume PC after stage init, not POST_INIT_ENTRY)');
    console.log('  - _GetCSC ISR path not wired (keyboard IRQ raised but handler unreachable)');
    console.log('  - Token dispatch / display refresh paths still being decoded');
    console.log('  - See CONTINUATION_PROMPT_CODEX.md Phase 25G priorities');
  }

  process.exit(anyVramChanged ? 0 : 1);
}

main();

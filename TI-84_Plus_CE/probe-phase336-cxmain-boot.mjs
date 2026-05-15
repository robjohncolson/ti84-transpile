#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

process.emitWarning = () => {};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');
const CPU_RUNTIME_PATH = path.join(__dirname, 'cpu-runtime.js');
const PERIPHERALS_PATH = path.join(__dirname, 'peripherals.js');
const DECODER_PATH = path.join(__dirname, 'ez80-decoder.js');

const MEM_SIZE = 0x1000000;
const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const STACK_RESET_TOP = 0xD1A87E;
const IY_BASE = 0xD00080;
const RETURN_SENTINEL = 0xFFFFFF;

const CXMAIN_PTR = 0xD007CA;
const CXPPG_PTR = 0xD007D0;
const CONTEXT_BYTE_ADDR = 0xD007E0;
const HOME_HANDLER = 0x058241;
const COORMON_ENTRY = 0x08BF22;

const CONTEXT_TABLE_ADDR = 0x0875A8;
const CONTEXT_TABLE_VALUES = [
  0x5A, 0x59, 0x41, 0x42, 0x45, 0x46, 0x47, 0x4B,
  0x4C, 0x4D, 0x4E, 0x4F, 0x52, 0x53, 0x55, 0x57,
  0x54, 0x56,
];

const BOOT_MAX_STEPS = 20000;
const BOOT_MAX_LOOP_ITERATIONS = 32;
const KERNEL_INIT_MAX_STEPS = 100000;
const KERNEL_INIT_MAX_LOOP_ITERATIONS = 10000;

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function read24(buffer, addr) {
  const base = addr >>> 0;
  return (
    (buffer[base] ?? 0) |
    ((buffer[base + 1] ?? 0) << 8) |
    ((buffer[base + 2] ?? 0) << 16)
  ) >>> 0;
}

function write24(buffer, addr, value) {
  const base = addr >>> 0;
  const normalized = value >>> 0;
  buffer[base] = normalized & 0xFF;
  buffer[base + 1] = (normalized >>> 8) & 0xFF;
  buffer[base + 2] = (normalized >>> 16) & 0xFF;
}

function bytesHex(buffer, start, length) {
  const from = Math.max(0, start >>> 0);
  const to = Math.min(buffer.length, from + Math.max(0, length | 0));
  return Array.from(buffer.subarray(from, to), (byte) =>
    byte.toString(16).toUpperCase().padStart(2, '0'),
  ).join(' ');
}

function createMemoryBus(romBytes) {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes);
  return mem;
}

function resetStack(cpu, mem) {
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);
}

// ── Standard boot sequence (phases 1+2) ─────────────────────────────

function runStandardBoot(romBytes, executor, mem) {
  const cpu = executor.cpu;

  // Phase 1: Boot from 0x000000
  console.log('  Phase 1: Boot from 0x000000');
  const boot = executor.runFrom(BOOT_ENTRY, 'z80', {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: BOOT_MAX_LOOP_ITERATIONS,
  });
  console.log(`    steps=${boot.steps} termination=${boot.termination} lastPc=${hex(boot.lastPc)}`);

  // Phase 2: Kernel init from 0x08C331
  console.log('  Phase 2: Kernel init from 0x08C331');
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  resetStack(cpu, mem);

  const kernelInit = executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
    maxSteps: KERNEL_INIT_MAX_STEPS,
    maxLoopIterations: KERNEL_INIT_MAX_LOOP_ITERATIONS,
  });
  console.log(`    steps=${kernelInit.steps} termination=${kernelInit.termination} lastPc=${hex(kernelInit.lastPc)}`);

  return { boot, kernelInit };
}

// ── Main ────────────────────────────────────────────────────────────

if (!fs.existsSync(ROM_PATH)) {
  throw new Error('ROM.rom is missing.');
}

if (!fs.existsSync(TRANSPILED_PATH)) {
  throw new Error('ROM.transpiled.js is missing.');
}

const romBytes = fs.readFileSync(ROM_PATH);
const { createExecutor } = await import(pathToFileURL(CPU_RUNTIME_PATH).href);
const { createPeripheralBus } = await import(pathToFileURL(PERIPHERALS_PATH).href);
const { decodeInstruction } = await import(pathToFileURL(DECODER_PATH).href);
const { PRELIFTED_BLOCKS } = await import(pathToFileURL(TRANSPILED_PATH).href);

console.log('Phase 336: cxMain boot population probe');
console.log(`Target: cxMain @ ${hex(CXMAIN_PTR)}, cxPPG @ ${hex(CXPPG_PTR)}`);
console.log(`Context byte @ ${hex(CONTEXT_BYTE_ADDR)}`);
console.log(`Home handler: ${hex(HOME_HANDLER)}`);
console.log(`CoorMon entry: ${hex(COORMON_ENTRY)}`);

// ════════════════════════════════════════════════════════════════════
// Step 0: Examine ROM near 0x08C8D0 for cxPPG paired value
// ════════════════════════════════════════════════════════════════════

console.log('\n════════════════════════════════════════════');
console.log('Step 0: ROM context around 0x08C8B5 — the context dispatch code');
console.log('════════════════════════════════════════════');

// Decode instructions starting from 0x08C8B5
let pc = 0x08C8B5;
console.log('  Instruction trace from 0x08C8B5:');
for (let step = 0; step < 30 && pc < 0x08C920; step++) {
  const inst = decodeInstruction(romBytes, pc, 'adl');
  if (!inst || !inst.length) {
    console.log(`    ${hex(pc)}: <decode failed>`);
    break;
  }
  const instBytes = bytesHex(romBytes, pc, inst.length);
  console.log(`    ${hex(pc)}: ${instBytes.padEnd(24)} ${inst.tag ?? '?'}`);
  pc += inst.length;
}

// Also look at what the code stores near cxPPG
console.log('\n  Looking for cxPPG (D0 07 D0) references near 0x08C8B5-0x08C920:');
for (let i = 0x08C8B5; i < 0x08C920 - 2; i++) {
  if (romBytes[i] === 0xD0 && romBytes[i + 1] === 0x07 && romBytes[i + 2] === 0xD0) {
    console.log(`    Found cxPPG ref at ${hex(i)}: ${bytesHex(romBytes, Math.max(0, i - 4), 12)}`);
  }
}

// Also check raw bytes around 0x08C8D0 for the paired store
console.log(`\n  Raw bytes 0x08C8C0-0x08C900: ${bytesHex(romBytes, 0x08C8C0, 64)}`);

// ════════════════════════════════════════════════════════════════════
// Step 1: Standard boot — check context byte after boot
// ════════════════════════════════════════════════════════════════════

console.log('\n════════════════════════════════════════════');
console.log('Step 1: Standard boot — check context byte and cxMain');
console.log('════════════════════════════════════════════');

{
  const mem = createMemoryBus(romBytes);
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(PRELIFTED_BLOCKS, mem, { peripherals });

  runStandardBoot(romBytes, executor, mem);

  const contextByte = mem[CONTEXT_BYTE_ADDR];
  const cxMainVal = read24(mem, CXMAIN_PTR);
  const cxPPGVal = read24(mem, CXPPG_PTR);

  console.log(`\n  After standard boot:`);
  console.log(`    Context byte (0xD007E0): ${hex(contextByte, 2)} ('${String.fromCharCode(contextByte)}')`);
  console.log(`    cxMain (0xD007CA):       ${hex(cxMainVal)}`);
  console.log(`    cxPPG  (0xD007D0):       ${hex(cxPPGVal)}`);

  const inTable = CONTEXT_TABLE_VALUES.includes(contextByte);
  console.log(`    Context byte in table?   ${inTable}`);
  if (!inTable) {
    console.log(`    CONFIRMED: context byte ${hex(contextByte, 2)} is NOT in the valid table.`);
    console.log(`    This is why cxMain never gets set to the home handler.`);
  }
}

// ════════════════════════════════════════════════════════════════════
// Step 2: Approach A — Set context byte to 0x41 before kernel init
// ════════════════════════════════════════════════════════════════════

console.log('\n════════════════════════════════════════════');
console.log('Step 2: APPROACH A — Write 0x41 to context byte before kernel init');
console.log('════════════════════════════════════════════');

{
  const mem = createMemoryBus(romBytes);
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(PRELIFTED_BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  // Phase 1: Boot from 0x000000
  console.log('  Phase 1: Boot from 0x000000');
  const boot = executor.runFrom(BOOT_ENTRY, 'z80', {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: BOOT_MAX_LOOP_ITERATIONS,
  });
  console.log(`    steps=${boot.steps} termination=${boot.termination} lastPc=${hex(boot.lastPc)}`);

  // Set context byte to 0x41 ('A') BEFORE kernel init
  console.log(`\n  Writing 0x41 ('A') to context byte @ ${hex(CONTEXT_BYTE_ADDR)}`);
  mem[CONTEXT_BYTE_ADDR] = 0x41;
  console.log(`    Verify: context byte = ${hex(mem[CONTEXT_BYTE_ADDR], 2)}`);

  // Track cxMain changes during kernel init
  let lastCxMainValue = read24(mem, CXMAIN_PTR);
  const cxMainChanges = [];
  let hitContextDispatch = false;

  // Phase 2: Kernel init from 0x08C331
  console.log('\n  Phase 2: Kernel init from 0x08C331 (with context byte = 0x41)');
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  resetStack(cpu, mem);

  const kernelInit = executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
    maxSteps: KERNEL_INIT_MAX_STEPS,
    maxLoopIterations: KERNEL_INIT_MAX_LOOP_ITERATIONS,
    onBlock(blockPc) {
      // Check if we hit the context dispatch area
      if (blockPc >= 0x08C8B0 && blockPc <= 0x08C900) {
        hitContextDispatch = true;
        console.log(`    ** Hit context dispatch at PC=${hex(blockPc)}`);
        console.log(`       Context byte now: ${hex(mem[CONTEXT_BYTE_ADDR], 2)}`);
      }

      const currentVal = read24(mem, CXMAIN_PTR);
      if (currentVal !== lastCxMainValue) {
        cxMainChanges.push({
          pc: blockPc,
          oldValue: lastCxMainValue,
          newValue: currentVal,
        });
        console.log(`    ** cxMain changed at PC=${hex(blockPc)}: ${hex(lastCxMainValue)} -> ${hex(currentVal)}`);
        lastCxMainValue = currentVal;
      }
    },
  });

  console.log(`\n    Kernel init: steps=${kernelInit.steps} termination=${kernelInit.termination} lastPc=${hex(kernelInit.lastPc)}`);

  const cxMainVal = read24(mem, CXMAIN_PTR);
  const cxPPGVal = read24(mem, CXPPG_PTR);
  const contextByte = mem[CONTEXT_BYTE_ADDR];

  console.log(`\n  After Approach A:`);
  console.log(`    Context byte (0xD007E0): ${hex(contextByte, 2)}`);
  console.log(`    cxMain (0xD007CA):       ${hex(cxMainVal)}`);
  console.log(`    cxPPG  (0xD007D0):       ${hex(cxPPGVal)}`);
  console.log(`    Hit context dispatch?    ${hitContextDispatch}`);
  console.log(`    cxMain changes:          ${cxMainChanges.length}`);

  if (cxMainVal === HOME_HANDLER) {
    console.log(`    SUCCESS: cxMain == HOME_HANDLER (${hex(HOME_HANDLER)})`);
  } else {
    console.log(`    cxMain != HOME_HANDLER. The context dispatch may not execute during kernel init.`);
  }
}

// ════════════════════════════════════════════════════════════════════
// Step 3: Approach B — Manual cxMain write + CoorMon dispatch
// ════════════════════════════════════════════════════════════════════

console.log('\n════════════════════════════════════════════');
console.log('Step 3: APPROACH B — Manually set cxMain, then run CoorMon');
console.log('════════════════════════════════════════════');

{
  const mem = createMemoryBus(romBytes);
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(PRELIFTED_BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  // Standard boot first
  console.log('  Running standard boot...');
  runStandardBoot(romBytes, executor, mem);

  // Check what's at cxMain and cxPPG before we touch them
  console.log(`\n  Pre-patch state:`);
  console.log(`    cxMain: ${hex(read24(mem, CXMAIN_PTR))}`);
  console.log(`    cxPPG:  ${hex(read24(mem, CXPPG_PTR))}`);
  console.log(`    Context byte: ${hex(mem[CONTEXT_BYTE_ADDR], 2)}`);

  // Examine nearby RAM for the full context structure
  console.log(`\n  RAM dump around cxMain (0xD007C0-0xD007F0):`);
  console.log(`    ${bytesHex(mem, 0xD007C0, 48)}`);

  // Manually set cxMain = 0x058241
  console.log(`\n  Writing cxMain = ${hex(HOME_HANDLER)}`);
  write24(mem, CXMAIN_PTR, HOME_HANDLER);
  console.log(`    Verify cxMain: ${hex(read24(mem, CXMAIN_PTR))}`);

  // Also set context byte to 0x40 (what the ROM sets after recognizing the context)
  console.log(`  Writing context byte = 0x40`);
  mem[CONTEXT_BYTE_ADDR] = 0x40;

  // Now run CoorMon (0x08BF22) — it reads cxMain and dispatches
  console.log(`\n  Running CoorMon from ${hex(COORMON_ENTRY)} (max 50000 steps)...`);

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.mbase = 0xD0;
  cpu.iy = IY_BASE;
  resetStack(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, RETURN_SENTINEL);

  let reachedHomeHandler = false;
  let homeHandlerStep = -1;
  let stepCount = 0;
  const pcTrace = [];

  const coormon = executor.runFrom(COORMON_ENTRY, 'adl', {
    maxSteps: 50000,
    maxLoopIterations: 50000,
    onBlock(blockPc) {
      // Record first 200 block PCs for trace
      if (pcTrace.length < 200) {
        pcTrace.push(blockPc);
      }

      if (blockPc === HOME_HANDLER && !reachedHomeHandler) {
        reachedHomeHandler = true;
        homeHandlerStep = stepCount;
        console.log(`    ** Reached HOME_HANDLER at step ${stepCount}!`);
      }
      stepCount++;
    },
  });

  console.log(`\n    CoorMon: steps=${coormon.steps} termination=${coormon.termination} lastPc=${hex(coormon.lastPc)}`);
  console.log(`    Reached home handler (${hex(HOME_HANDLER)}): ${reachedHomeHandler}`);

  if (reachedHomeHandler) {
    console.log(`    Home handler reached at step ${homeHandlerStep}`);
  }

  // Show first N block PCs as trace
  const traceLen = Math.min(pcTrace.length, 40);
  console.log(`\n  CoorMon PC trace (first ${traceLen} blocks):`);
  for (let i = 0; i < traceLen; i++) {
    const marker = pcTrace[i] === HOME_HANDLER ? ' <<< HOME_HANDLER' :
                   pcTrace[i] === COORMON_ENTRY ? ' <<< COORMON' : '';
    console.log(`    [${String(i).padStart(3)}] ${hex(pcTrace[i])}${marker}`);
  }

  // Check post-run state
  console.log(`\n  Post-CoorMon state:`);
  console.log(`    cxMain: ${hex(read24(mem, CXMAIN_PTR))}`);
  console.log(`    cxPPG:  ${hex(read24(mem, CXPPG_PTR))}`);
  console.log(`    Context byte: ${hex(mem[CONTEXT_BYTE_ADDR], 2)}`);
}

// ════════════════════════════════════════════════════════════════════
// Step 4: Approach B variant — also set cxPPG and examine ROM pairs
// ════════════════════════════════════════════════════════════════════

console.log('\n════════════════════════════════════════════');
console.log('Step 4: Examine ROM for cxPPG paired with home handler');
console.log('════════════════════════════════════════════');

// Decode the code at 0x08C8C7 (the JR NZ target — what happens when context NOT in table)
console.log('  Decode at 0x08C8C7 (JR NZ target — context NOT in table):');
pc = 0x08C8C7;
for (let step = 0; step < 20 && pc < 0x08C920; step++) {
  const inst = decodeInstruction(romBytes, pc, 'adl');
  if (!inst || !inst.length) {
    console.log(`    ${hex(pc)}: <decode failed>`);
    break;
  }
  const instBytes = bytesHex(romBytes, pc, inst.length);
  console.log(`    ${hex(pc)}: ${instBytes.padEnd(24)} ${inst.tag ?? '?'}`);
  pc += inst.length;
}

// Search for what value gets paired with 0x058241 in ROM stores
// Look in the region around 0x08C8B5-0x08C900 for stores to cxPPG
console.log('\n  Scanning ROM 0x08C8B5-0x08C920 for 3-byte sequences that could be cxPPG value:');
for (let i = 0x08C8B5; i < 0x08C920; i++) {
  // Look for LD (imm24), HL patterns: 0x22 addr24
  if (romBytes[i] === 0x22) {
    const addr = read24(romBytes, i + 1);
    if (addr >= 0xD00700 && addr <= 0xD00800) {
      console.log(`    ${hex(i)}: LD (${hex(addr)}), HL`);
    }
  }
  // Look for ED prefix stores
  if (romBytes[i] === 0xED && i + 1 < 0x08C920) {
    const op = romBytes[i + 1];
    if ((op & 0x0F) === 0x03 && (op & 0xF0) <= 0x70) { // ED 43/53/63/73
      const addr = read24(romBytes, i + 2);
      if (addr >= 0xD00700 && addr <= 0xD00800) {
        const regNames = { 0x43: 'BC', 0x53: 'DE', 0x63: 'HL', 0x73: 'SP' };
        console.log(`    ${hex(i)}: LD (${hex(addr)}), ${regNames[op] ?? '??'}`);
      }
    }
  }
  // Look for LD (imm24), A: 0x32 addr24
  if (romBytes[i] === 0x32) {
    const addr = read24(romBytes, i + 1);
    if (addr >= 0xD00700 && addr <= 0xD00800) {
      console.log(`    ${hex(i)}: LD (${hex(addr)}), A`);
    }
  }
}

// ════════════════════════════════════════════════════════════════════
// Step 5: Decode CoorMon entry to understand dispatch mechanism
// ════════════════════════════════════════════════════════════════════

console.log('\n════════════════════════════════════════════');
console.log('Step 5: CoorMon entry decode — how does it read and call cxMain?');
console.log('════════════════════════════════════════════');

pc = COORMON_ENTRY;
console.log(`  Instruction trace from CoorMon (${hex(COORMON_ENTRY)}):`);
for (let step = 0; step < 40 && pc < COORMON_ENTRY + 0x100; step++) {
  const inst = decodeInstruction(romBytes, pc, 'adl');
  if (!inst || !inst.length) {
    console.log(`    ${hex(pc)}: <decode failed>`);
    break;
  }
  const instBytes = bytesHex(romBytes, pc, inst.length);
  console.log(`    ${hex(pc)}: ${instBytes.padEnd(24)} ${inst.tag ?? '?'}`);
  pc += inst.length;
}

// ════════════════════════════════════════════════════════════════════
// Summary
// ════════════════════════════════════════════════════════════════════

console.log('\n════════════════════════════════════════════');
console.log('Summary');
console.log('════════════════════════════════════════════');
console.log('This probe tested two approaches to populate cxMain during boot:');
console.log('  A) Pre-seed context byte (0xD007E0) = 0x41 before kernel init');
console.log('     so the dispatch at 0x08C8B5 recognizes it and sets cxMain naturally.');
console.log('  B) Manually write cxMain = 0x058241, then run CoorMon to dispatch.');
console.log('Check the output above for which approach successfully reaches the home handler.');

console.log('\nPhase 336 complete.');

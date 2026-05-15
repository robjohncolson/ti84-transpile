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
const HOME_HANDLER = 0x058241;

const BOOT_MAX_STEPS = 20000;
const BOOT_MAX_LOOP_ITERATIONS = 32;
const KERNEL_INIT_MAX_STEPS = 100000;
const KERNEL_INIT_MAX_LOOP_ITERATIONS = 10000;
const FULL_BOOT_MAX_STEPS = 500000;

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

// ── ROM reference scan ──────────────────────────────────────────────

function scanRomForCxMainRefs(rom) {
  // Search for bytes CA 07 D0 (little-endian encoding of 0xD007CA)
  const hits = [];
  for (let i = 0; i < rom.length - 2; i++) {
    if (rom[i] === 0xCA && rom[i + 1] === 0x07 && rom[i + 2] === 0xD0) {
      const contextStart = Math.max(0, i - 8);
      const contextEnd = Math.min(rom.length, i + 3 + 8);
      hits.push({
        offset: i,
        contextBefore: bytesHex(rom, contextStart, i - contextStart),
        matchBytes: bytesHex(rom, i, 3),
        contextAfter: bytesHex(rom, i + 3, contextEnd - (i + 3)),
      });
    }
  }
  return hits;
}

function classifyReference(rom, offset) {
  // Look at the byte(s) before the address to guess if it's a write (LD (addr), A/HL/etc)
  // or a read (LD A/HL, (addr))
  // Common eZ80 patterns:
  //   LD (imm24), A  = 0x32 addr24       (write)
  //   LD (imm24), HL = 0x22 addr24       (write)
  //   LD A, (imm24)  = 0x3A addr24       (read)
  //   LD HL, (imm24) = 0x2A addr24       (read)
  //   LD (imm24), rr = ED prefix ops     (write)
  //   LD rr, (imm24) = ED prefix ops     (read)

  const classifications = [];

  // Check 1 byte before
  if (offset >= 1) {
    const prev1 = rom[offset - 1];
    if (prev1 === 0x32) classifications.push('WRITE: LD (imm24), A');
    if (prev1 === 0x22) classifications.push('WRITE: LD (imm24), HL');
    if (prev1 === 0x3A) classifications.push('READ: LD A, (imm24)');
    if (prev1 === 0x2A) classifications.push('READ: LD HL, (imm24)');
  }

  // Check 2 bytes before for ED-prefix instructions
  if (offset >= 2) {
    const prev2 = rom[offset - 2];
    const prev1 = rom[offset - 1];
    if (prev2 === 0xED) {
      // ED 43 = LD (imm24), BC  (write)
      // ED 53 = LD (imm24), DE  (write)
      // ED 63 = LD (imm24), HL  (write, alt)
      // ED 73 = LD (imm24), SP  (write)
      // ED 4B = LD BC, (imm24)  (read)
      // ED 5B = LD DE, (imm24)  (read)
      // ED 6B = LD HL, (imm24)  (read, alt)
      // ED 7B = LD SP, (imm24)  (read)
      if (prev1 === 0x43) classifications.push('WRITE: LD (imm24), BC [ED prefix]');
      if (prev1 === 0x53) classifications.push('WRITE: LD (imm24), DE [ED prefix]');
      if (prev1 === 0x63) classifications.push('WRITE: LD (imm24), HL [ED prefix]');
      if (prev1 === 0x73) classifications.push('WRITE: LD (imm24), SP [ED prefix]');
      if (prev1 === 0x4B) classifications.push('READ: LD BC, (imm24) [ED prefix]');
      if (prev1 === 0x5B) classifications.push('READ: LD DE, (imm24) [ED prefix]');
      if (prev1 === 0x6B) classifications.push('READ: LD HL, (imm24) [ED prefix]');
      if (prev1 === 0x7B) classifications.push('READ: LD SP, (imm24) [ED prefix]');
    }
  }

  // Check for LD imm24 instructions (loading the address as a value, not dereferencing)
  // LD HL, imm24 = 0x21 imm24
  // LD BC, imm24 = 0x01 imm24
  // LD DE, imm24 = 0x11 imm24
  if (offset >= 1) {
    const prev1 = rom[offset - 1];
    if (prev1 === 0x21) classifications.push('LOAD_ADDR: LD HL, imm24 (loading address into HL)');
    if (prev1 === 0x01) classifications.push('LOAD_ADDR: LD BC, imm24 (loading address into BC)');
    if (prev1 === 0x11) classifications.push('LOAD_ADDR: LD DE, imm24 (loading address into DE)');
  }

  if (classifications.length === 0) {
    classifications.push('UNKNOWN');
  }

  return classifications;
}

// ── Instrumented boot ───────────────────────────────────────────────

function runInstrumentedBoot(romBytes) {
  const mem = createMemoryBus(romBytes);
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(PRELIFTED_BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  const cxMainWrites = [];

  // Save original write functions to intercept writes to CXMAIN_PTR
  const originalWrite8 = mem.write8 ?? null;

  // We need to instrument the memory. The simplest approach:
  // periodically sample cxMain value and detect changes.
  let lastCxMainValue = read24(mem, CXMAIN_PTR);
  let totalSteps = 0;

  // Phase 1: Boot from 0x000000
  console.log('\n── Phase 1: Boot from 0x000000 ──');
  const boot = executor.runFrom(BOOT_ENTRY, 'z80', {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: BOOT_MAX_LOOP_ITERATIONS,
    onBlock(pc) {
      const currentVal = read24(mem, CXMAIN_PTR);
      if (currentVal !== lastCxMainValue) {
        cxMainWrites.push({
          phase: 'boot',
          pc,
          oldValue: lastCxMainValue,
          newValue: currentVal,
          step: totalSteps,
        });
        lastCxMainValue = currentVal;
      }
      totalSteps++;
    },
  });

  console.log(`  Boot: steps=${boot.steps} termination=${boot.termination} lastPc=${hex(boot.lastPc)}`);
  console.log(`  cxMain after boot: ${hex(read24(mem, CXMAIN_PTR))}`);

  // Phase 2: Kernel init from 0x08C331
  console.log('\n── Phase 2: Kernel init from 0x08C331 ──');
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  resetStack(cpu, mem);

  const kernelInit = executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
    maxSteps: KERNEL_INIT_MAX_STEPS,
    maxLoopIterations: KERNEL_INIT_MAX_LOOP_ITERATIONS,
    onBlock(pc) {
      const currentVal = read24(mem, CXMAIN_PTR);
      if (currentVal !== lastCxMainValue) {
        cxMainWrites.push({
          phase: 'kernel_init',
          pc,
          oldValue: lastCxMainValue,
          newValue: currentVal,
          step: totalSteps,
        });
        lastCxMainValue = currentVal;
      }
      totalSteps++;
    },
  });

  console.log(`  Kernel init: steps=${kernelInit.steps} termination=${kernelInit.termination} lastPc=${hex(kernelInit.lastPc)}`);
  console.log(`  cxMain after kernel init: ${hex(read24(mem, CXMAIN_PTR))}`);

  // Phase 3: Extended boot — try running from various OS entry points
  console.log('\n── Phase 3: Extended run from post-boot callback (0x015AD9) ──');
  cpu.mbase = 0xD0;
  cpu.iy = IY_BASE;
  cpu.hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  resetStack(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, RETURN_SENTINEL);

  const extended = executor.runFrom(0x015AD9, 'adl', {
    maxSteps: FULL_BOOT_MAX_STEPS,
    maxLoopIterations: FULL_BOOT_MAX_STEPS,
    onBlock(pc) {
      const currentVal = read24(mem, CXMAIN_PTR);
      if (currentVal !== lastCxMainValue) {
        cxMainWrites.push({
          phase: 'extended_boot',
          pc,
          oldValue: lastCxMainValue,
          newValue: currentVal,
          step: totalSteps,
        });
        lastCxMainValue = currentVal;
      }
      totalSteps++;
    },
  });

  console.log(`  Extended: steps=${extended.steps} termination=${extended.termination} lastPc=${hex(extended.lastPc)}`);
  console.log(`  cxMain after extended: ${hex(read24(mem, CXMAIN_PTR))}`);

  // Phase 4: Try the OS event loop entry
  console.log('\n── Phase 4: Run from OS event loop (0x0019BE) ──');
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  resetStack(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, RETURN_SENTINEL);

  const eventLoop = executor.runFrom(0x0019BE, 'adl', {
    maxSteps: FULL_BOOT_MAX_STEPS,
    maxLoopIterations: FULL_BOOT_MAX_STEPS,
    onBlock(pc) {
      const currentVal = read24(mem, CXMAIN_PTR);
      if (currentVal !== lastCxMainValue) {
        cxMainWrites.push({
          phase: 'event_loop',
          pc,
          oldValue: lastCxMainValue,
          newValue: currentVal,
          step: totalSteps,
        });
        lastCxMainValue = currentVal;
      }
      totalSteps++;
    },
  });

  console.log(`  Event loop: steps=${eventLoop.steps} termination=${eventLoop.termination} lastPc=${hex(eventLoop.lastPc)}`);
  console.log(`  cxMain after event loop: ${hex(read24(mem, CXMAIN_PTR))}`);

  return cxMainWrites;
}

// ── Search for home handler address in ROM ──────────────────────────

function scanForHomeHandlerStores(rom) {
  // Search for 0x058241 stored as bytes 41 82 05 (little-endian) near 0xD007CA references
  const hits = [];
  const homeBytes = [HOME_HANDLER & 0xFF, (HOME_HANDLER >>> 8) & 0xFF, (HOME_HANDLER >>> 16) & 0xFF];

  for (let i = 0; i < rom.length - 2; i++) {
    if (rom[i] === homeBytes[0] && rom[i + 1] === homeBytes[1] && rom[i + 2] === homeBytes[2]) {
      const contextStart = Math.max(0, i - 8);
      const contextEnd = Math.min(rom.length, i + 3 + 8);
      hits.push({
        offset: i,
        context: bytesHex(rom, contextStart, contextEnd - contextStart),
      });
    }
  }
  return hits;
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

console.log('Phase 335: cxMain initialization probe');
console.log(`Target: cxMain pointer @ ${hex(CXMAIN_PTR)}`);
console.log(`Expected home handler: ${hex(HOME_HANDLER)}`);

// ── Step 1: Scan ROM for references to 0xD007CA ──

console.log('\n════════════════════════════════════════════');
console.log('Step 1: ROM references to 0xD007CA (CA 07 D0)');
console.log('════════════════════════════════════════════');

const refs = scanRomForCxMainRefs(romBytes);
console.log(`Found ${refs.length} references to cxMain address in ROM:\n`);

for (const ref of refs) {
  const classifications = classifyReference(romBytes, ref.offset);
  console.log(`  ROM offset: ${hex(ref.offset)}`);
  console.log(`    Before: ${ref.contextBefore}`);
  console.log(`    Match:  ${ref.matchBytes}`);
  console.log(`    After:  ${ref.contextAfter}`);
  console.log(`    Classification: ${classifications.join(', ')}`);
  console.log('');
}

// ── Step 2: Scan for home handler value (0x058241) in ROM ──

console.log('════════════════════════════════════════════');
console.log('Step 2: ROM references to home handler 0x058241 (41 82 05)');
console.log('════════════════════════════════════════════');

const homeRefs = scanForHomeHandlerStores(romBytes);
console.log(`Found ${homeRefs.length} occurrences of home handler address in ROM:\n`);

for (const ref of homeRefs) {
  console.log(`  ROM offset: ${hex(ref.offset)}  context: ${ref.context}`);
}

// ── Step 3: Check for co-located refs (home handler near cxMain ref) ──

console.log('\n════════════════════════════════════════════');
console.log('Step 3: Co-located references (home handler within 32 bytes of cxMain ref)');
console.log('════════════════════════════════════════════');

let colocated = 0;
for (const cxRef of refs) {
  for (const homeRef of homeRefs) {
    const distance = Math.abs(cxRef.offset - homeRef.offset);
    if (distance <= 32) {
      console.log(`  cxMain ref @ ${hex(cxRef.offset)} <-> home handler @ ${hex(homeRef.offset)} (distance: ${distance} bytes)`);
      colocated++;
    }
  }
}
if (colocated === 0) {
  console.log('  No co-located references found within 32 bytes.');
}

// ── Step 4: Instrumented boot to detect cxMain writes ──

console.log('\n════════════════════════════════════════════');
console.log('Step 4: Instrumented boot — detecting writes to cxMain');
console.log('════════════════════════════════════════════');

const writes = runInstrumentedBoot(romBytes);

console.log(`\n── Summary: ${writes.length} cxMain changes detected ──`);
for (const w of writes) {
  console.log(`  phase=${w.phase} block_pc=${hex(w.pc)} old=${hex(w.oldValue)} new=${hex(w.newValue)} step=${w.step}`);
}

if (writes.length === 0) {
  console.log('  No writes to cxMain detected during any boot phase.');
  console.log('  cxMain may be set by code paths not reached in our staged boot.');
}

// ── Step 5: Decode instructions around write references ──

console.log('\n════════════════════════════════════════════');
console.log('Step 5: Instruction decode around WRITE references to cxMain');
console.log('════════════════════════════════════════════');

for (const ref of refs) {
  const classifications = classifyReference(romBytes, ref.offset);
  const isWrite = classifications.some((c) => c.startsWith('WRITE'));
  const isLoadAddr = classifications.some((c) => c.startsWith('LOAD_ADDR'));

  if (!isWrite && !isLoadAddr) continue;

  // Try to decode a few instructions before and after
  const instrStart = ref.offset - (isLoadAddr ? 1 : (classifications[0].includes('ED') ? 2 : 1));
  console.log(`\n  Reference @ ${hex(ref.offset)} (instruction start ~ ${hex(instrStart)}):`);
  console.log(`    Classification: ${classifications.join(', ')}`);
  console.log(`    Surrounding bytes: ${bytesHex(romBytes, Math.max(0, instrStart - 4), 20)}`);

  // Decode a sequence of instructions starting from a few bytes before
  const decodeStart = Math.max(0, instrStart - 8);
  let pc = decodeStart;
  console.log(`    Instruction trace from ${hex(decodeStart)}:`);
  for (let step = 0; step < 8 && pc < instrStart + 12; step++) {
    const inst = decodeInstruction(romBytes, pc, 'adl');
    if (!inst || !inst.length) {
      console.log(`      ${hex(pc)}: <decode failed>`);
      break;
    }
    const instBytes = bytesHex(romBytes, pc, inst.length);
    const marker = (pc >= instrStart && pc <= ref.offset + 2) ? ' <<<' : '';
    console.log(`      ${hex(pc)}: ${instBytes.padEnd(20)} ${inst.tag ?? '?'}${marker}`);
    pc += inst.length;
  }
}

console.log('\nPhase 335 complete.');

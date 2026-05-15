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

const BOOT_MAX_STEPS = 20000;
const BOOT_MAX_LOOP_ITERATIONS = 32;
const KERNEL_INIT_MAX_STEPS = 100000;
const KERNEL_INIT_MAX_LOOP_ITERATIONS = 10000;

// Key dispatch constants
const CXMAIN_PTR = 0xD007CA;
const HOME_HANDLER = 0x058241;
const COORMON_ENTRY = 0x08BF22;
const GETCSC_ENTRY = 0x042366;
const KBD_SCAN_CODE = 0xD00587;
const KBD_KEY = 0xD0058C;
const KBD_GETCSC_RESULT = 0xD0058E;

const EVENT_LOOP_MAX_STEPS = 50000;

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hex8(value) {
  return `0x${(value & 0xFF).toString(16).toUpperCase().padStart(2, '0')}`;
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
  mem.set(romBytes.subarray(0, Math.min(MEM_SIZE, romBytes.length)));
  return mem;
}

function resetStack(cpu, mem) {
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);
}

function prepareDirectEntry(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP;
  cpu.sp -= 3;
  write24(mem, cpu.sp, RETURN_SENTINEL);
}

// --- Load modules ---

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

// --- Boot the OS ---

function createBootedEnvironment() {
  const mem = createMemoryBus(romBytes);
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(PRELIFTED_BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  const boot = executor.runFrom(BOOT_ENTRY, 'z80', {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: BOOT_MAX_LOOP_ITERATIONS,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  resetStack(cpu, mem);

  const kernelInit = executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
    maxSteps: KERNEL_INIT_MAX_STEPS,
    maxLoopIterations: KERNEL_INIT_MAX_LOOP_ITERATIONS,
  });

  cpu.mbase = 0xD0;
  cpu.iy = IY_BASE;
  cpu.hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  resetStack(cpu, mem);

  return { mem, peripherals, executor, cpu, boot, kernelInit };
}

// ====================================================================
// Main probe
// ====================================================================

console.log('Phase 336: Keyboard input injection into OS event loop');
console.log('='.repeat(65));

// ====================================================================
// TEST A: Write scan code to each RAM location, run CoorMon, check result
// ====================================================================

console.log('\n>>> TEST A: Inject scan code 0x09 (ENTER) into key RAM locations <<<');

const ENTER_SCAN = 0x09;
const TEST_LOCATIONS = [
  { name: 'kbdScanCode',    addr: KBD_SCAN_CODE },
  { name: 'kbdKey',         addr: KBD_KEY },
  { name: 'kbdGetCSCResult', addr: KBD_GETCSC_RESULT },
];

for (const loc of TEST_LOCATIONS) {
  console.log(`\n--- Test A: Writing ${hex8(ENTER_SCAN)} to ${loc.name} (${hex(loc.addr)}) ---`);

  const env = createBootedEnvironment();
  const { mem, peripherals, executor, cpu } = env;

  // Install cxMain handler
  write24(mem, CXMAIN_PTR, HOME_HANDLER);
  console.log(`  cxMain at ${hex(CXMAIN_PTR)} = ${hex(read24(mem, CXMAIN_PTR))}`);

  // Write scan code to this location only
  mem[loc.addr] = ENTER_SCAN;
  console.log(`  Wrote ${hex8(ENTER_SCAN)} to ${hex(loc.addr)}`);
  console.log(`  Pre-run RAM: D00587=${hex8(mem[KBD_SCAN_CODE])} D0058C=${hex8(mem[KBD_KEY])} D0058E=${hex8(mem[KBD_GETCSC_RESULT])}`);

  prepareDirectEntry(cpu, mem);

  // Track key PCs
  let hitBF3C = false;
  let aAtBF3C = -1;
  let fAtBF3C = -1;
  let hitBF68 = false;
  let hitGetCSC = false;
  let aAfterGetCSC = -1;

  const blocksVisited = [];
  let prevWasGetCSC = false;

  const result = executor.runFrom(COORMON_ENTRY, 'adl', {
    maxSteps: EVENT_LOOP_MAX_STEPS,
    maxLoopIterations: EVENT_LOOP_MAX_STEPS,
    onBlock(pc, mode, meta, steps) {
      const npc = pc & 0xFFFFFF;
      blocksVisited.push(npc);

      // Capture A right when we enter the block after GetCSC returns
      if (prevWasGetCSC) {
        aAfterGetCSC = cpu.a & 0xFF;
        prevWasGetCSC = false;
      }

      if (npc === GETCSC_ENTRY) {
        hitGetCSC = true;
        prevWasGetCSC = true;
      }
      if (npc === 0x08BF3C) {
        hitBF3C = true;
        aAtBF3C = cpu.a & 0xFF;
        fAtBF3C = cpu.f & 0xFF;
      }
      if (npc === 0x08BF68) {
        hitBF68 = true;
      }
    },
  });

  console.log(`  Result: steps=${result.steps} termination=${result.termination} lastPc=${hex(result.lastPc)}`);
  console.log(`  Unique blocks: ${new Set(blocksVisited).size}`);
  console.log(`  Hit GetCSC (042366): ${hitGetCSC}`);
  console.log(`  Hit 0x08BF3C: ${hitBF3C}, A=${hitBF3C ? hex8(aAtBF3C) : 'n/a'}, F=${hitBF3C ? hex8(fAtBF3C) : 'n/a'}`);
  console.log(`  A after GetCSC return: ${aAfterGetCSC >= 0 ? hex8(aAfterGetCSC) : 'n/a'}`);
  console.log(`  JR NZ taken (hit 0x08BF68): ${hitBF68}`);
  console.log(`  Post-run RAM: D00587=${hex8(mem[KBD_SCAN_CODE])} D0058C=${hex8(mem[KBD_KEY])} D0058E=${hex8(mem[KBD_GETCSC_RESULT])}`);
}

// ====================================================================
// TEST B: Trace all RAM reads in D00580-D00590 range during GetCSC
// ====================================================================

console.log('\n\n>>> TEST B: Instrument RAM reads during GetCSC execution <<<');

{
  const env = createBootedEnvironment();
  const { mem, peripherals, executor, cpu } = env;

  write24(mem, CXMAIN_PTR, HOME_HANDLER);

  // Pre-seed all candidate locations with different values so we can see which is read
  mem[0xD00580] = 0x80;
  mem[0xD00581] = 0x81;
  mem[0xD00582] = 0x82;
  mem[0xD00583] = 0x83;
  mem[0xD00584] = 0x84;
  mem[0xD00585] = 0x85;
  mem[0xD00586] = 0x86;
  mem[KBD_SCAN_CODE] = 0x09;  // 0xD00587
  mem[0xD00588] = 0x88;
  mem[0xD00589] = 0x89;
  mem[0xD0058A] = 0x8A;
  mem[0xD0058B] = 0x8B;
  mem[KBD_KEY] = 0x09;        // 0xD0058C
  mem[0xD0058D] = 0x8D;
  mem[KBD_GETCSC_RESULT] = 0x09;  // 0xD0058E
  mem[0xD0058F] = 0x8F;
  mem[0xD00590] = 0x90;

  console.log(`  Pre-seeded D00580-D00590 with marker values + 0x09 at key locations`);

  prepareDirectEntry(cpu, mem);

  // Instrument reads to D00580-D00590
  const origRead8 = cpu.read8.bind(cpu);
  const origWrite8 = cpu.write8.bind(cpu);
  const ramReadLog = [];
  const ramWriteLog = [];
  let insideGetCSC = false;
  let currentStep = 0;
  let currentPc = 0;

  cpu.read8 = (addr) => {
    const value = origRead8(addr);
    const a = addr & 0xFFFFFF;
    if (a >= 0xD00580 && a <= 0xD00590) {
      ramReadLog.push({ step: currentStep, pc: currentPc, addr: a, value: value & 0xFF, insideGetCSC });
    }
    return value;
  };

  cpu.write8 = (addr, value) => {
    const a = addr & 0xFFFFFF;
    if (a >= 0xD00580 && a <= 0xD00590) {
      ramWriteLog.push({ step: currentStep, pc: currentPc, addr: a, value: value & 0xFF, insideGetCSC });
    }
    return origWrite8(addr, value);
  };

  // Track when we are inside GetCSC (between entering 0x042366 and returning to CoorMon)
  const GETCSC_RANGE_LO = 0x042000;
  const GETCSC_RANGE_HI = 0x042500;

  const result = executor.runFrom(COORMON_ENTRY, 'adl', {
    maxSteps: EVENT_LOOP_MAX_STEPS,
    maxLoopIterations: EVENT_LOOP_MAX_STEPS,
    onBlock(pc, mode, meta, steps) {
      const npc = pc & 0xFFFFFF;
      currentPc = npc;
      currentStep = steps;

      if (npc === GETCSC_ENTRY) {
        insideGetCSC = true;
      } else if (insideGetCSC && (npc < GETCSC_RANGE_LO || npc > GETCSC_RANGE_HI)) {
        // Left the GetCSC address range — probably returned
        insideGetCSC = false;
      }
    },
  });

  cpu.read8 = origRead8;
  cpu.write8 = origWrite8;

  console.log(`  Result: steps=${result.steps} termination=${result.termination}`);

  console.log(`\n  All reads from D00580-D00590 (${ramReadLog.length} total):`);
  for (const e of ramReadLog) {
    const tag = e.insideGetCSC ? ' [GetCSC]' : '';
    console.log(`    step=${String(e.step).padStart(5)} pc=${hex(e.pc)} READ ${hex(e.addr)} = ${hex8(e.value)}${tag}`);
  }

  console.log(`\n  All writes to D00580-D00590 (${ramWriteLog.length} total):`);
  for (const e of ramWriteLog) {
    const tag = e.insideGetCSC ? ' [GetCSC]' : '';
    console.log(`    step=${String(e.step).padStart(5)} pc=${hex(e.pc)} WRITE ${hex(e.addr)} = ${hex8(e.value)}${tag}`);
  }
}

// ====================================================================
// TEST C: Disassemble GetCSC entry (0x042366) — 30 instructions
// ====================================================================

console.log('\n\n>>> TEST C: GetCSC disassembly (0x042366) <<<');

{
  let decAddr = GETCSC_ENTRY;
  for (let i = 0; i < 40 && decAddr < 0x042420; i++) {
    try {
      const inst = decodeInstruction(romBytes, decAddr, 'adl');
      const bytes = [];
      for (let j = 0; j < (inst.length || 1); j++) {
        bytes.push(romBytes[decAddr + j].toString(16).toUpperCase().padStart(2, '0'));
      }
      console.log(`  ${hex(decAddr)}: ${bytes.join(' ').padEnd(18)} ${inst.asm || inst.tag || '???'}`);
      decAddr += inst.length || 1;
    } catch {
      console.log(`  ${hex(decAddr)}: (decode error)`);
      decAddr += 1;
    }
  }
}

// Also disassemble the bytecode interpreter region that GetCSC calls into
console.log('\n--- Bytecode interpreter around 0x0423CC ---');
{
  let decAddr = 0x0423CC;
  for (let i = 0; i < 30 && decAddr < 0x042430; i++) {
    try {
      const inst = decodeInstruction(romBytes, decAddr, 'adl');
      const bytes = [];
      for (let j = 0; j < (inst.length || 1); j++) {
        bytes.push(romBytes[decAddr + j].toString(16).toUpperCase().padStart(2, '0'));
      }
      console.log(`  ${hex(decAddr)}: ${bytes.join(' ').padEnd(18)} ${inst.asm || inst.tag || '???'}`);
      decAddr += inst.length || 1;
    } catch {
      console.log(`  ${hex(decAddr)}: (decode error)`);
      decAddr += 1;
    }
  }
}

// Dump the ROM data that the bytecode interpreter reads
console.log('\n--- ROM data at 0x3B0001 (32 bytes, bytecode interpreter source) ---');
console.log(`  ${hex(0x3B0001)}: ${bytesHex(romBytes, 0x3B0001, 32)}`);

console.log('\n--- ROM data at 0x3B0033 (16 bytes, GetCSC result location) ---');
console.log(`  ${hex(0x3B0033)}: ${bytesHex(romBytes, 0x3B0033, 16)}`);

// ====================================================================
// TEST D: Wider RAM scan — check ALL reads in D00500-D00600 during GetCSC
// ====================================================================

console.log('\n\n>>> TEST D: Wider RAM scan (D00500-D00600) during full CoorMon <<<');

{
  const env = createBootedEnvironment();
  const { mem, peripherals, executor, cpu } = env;

  write24(mem, CXMAIN_PTR, HOME_HANDLER);

  prepareDirectEntry(cpu, mem);

  const origRead8 = cpu.read8.bind(cpu);
  const wideReadLog = [];
  let currentStep = 0;
  let currentPc = 0;

  cpu.read8 = (addr) => {
    const value = origRead8(addr);
    const a = addr & 0xFFFFFF;
    if (a >= 0xD00500 && a < 0xD00600) {
      wideReadLog.push({ step: currentStep, pc: currentPc, addr: a, value: value & 0xFF });
    }
    return value;
  };

  const result = executor.runFrom(COORMON_ENTRY, 'adl', {
    maxSteps: EVENT_LOOP_MAX_STEPS,
    maxLoopIterations: EVENT_LOOP_MAX_STEPS,
    onBlock(pc, mode, meta, steps) {
      currentPc = pc & 0xFFFFFF;
      currentStep = steps;
    },
  });

  cpu.read8 = origRead8;

  console.log(`  Result: steps=${result.steps} termination=${result.termination}`);

  // Summarize by unique address
  const addrCounts = new Map();
  for (const e of wideReadLog) {
    const key = e.addr;
    if (!addrCounts.has(key)) {
      addrCounts.set(key, { count: 0, firstValue: e.value, firstPc: e.pc, firstStep: e.step });
    }
    addrCounts.get(key).count++;
  }

  console.log(`\n  Unique addresses read in D00500-D00600: ${addrCounts.size}`);
  const sorted = [...addrCounts.entries()].sort((a, b) => a[0] - b[0]);
  for (const [addr, info] of sorted) {
    console.log(`    ${hex(addr)}: read ${info.count}x, first value=${hex8(info.firstValue)}, first from pc=${hex(info.firstPc)} step=${info.firstStep}`);
  }

  // Also show the raw log for reads specifically from GetCSC range
  const getCSCReads = wideReadLog.filter(e => e.pc >= 0x042000 && e.pc <= 0x042500);
  console.log(`\n  Reads from GetCSC address range (${getCSCReads.length}):`);
  for (const e of getCSCReads.slice(0, 50)) {
    console.log(`    step=${String(e.step).padStart(5)} pc=${hex(e.pc)} READ ${hex(e.addr)} = ${hex8(e.value)}`);
  }
  if (getCSCReads.length > 50) {
    console.log(`    ... ${getCSCReads.length - 50} more`);
  }
}

console.log('\n' + '='.repeat(65));
console.log('Phase 336 complete.');

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

// Key dispatch RAM locations
const KBD_SCAN_CODE = 0xD00587;
const KBD_KEY = 0xD0058C;
const KBD_GETCSC_RESULT = 0xD0058E;

// Keyboard MMIO
const KBD_MMIO_BASE = 0xE00800;
const KBD_MMIO_SCAN = 0xE00900;

// Event loop entry
const COORMON_ENTRY = 0x08BF22;
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

function chunk(items, width) {
  const rows = [];
  for (let index = 0; index < items.length; index += width) {
    rows.push(items.slice(index, index + width));
  }
  return rows;
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

console.log('Phase 335: Key dispatch trace through CoorMon (0x08BF22)');
console.log('='.repeat(65));

// ====================================================================
// RUN 1: ENTER via correct keyMatrix + MMIO/Memory instrumentation
// ====================================================================

console.log('\n>>> RUN 1: ENTER key (keyMatrix[1] bit 0 cleared) with full instrumentation <<<');

const env = createBootedEnvironment();
const { mem, peripherals, executor, cpu } = env;

// Set ENTER key: SDK Group 6 → keyMatrix[1], bit 0 (active-low: clear the bit)
const km = peripherals.keyboard?.keyMatrix ?? peripherals.keyMatrix;
km.fill(0xFF);
km[1] = 0xFE;  // bit 0 cleared = ENTER pressed
console.log(`  keyMatrix[1] = ${hex8(km[1])} (ENTER pressed)`);

prepareDirectEntry(cpu, mem);

// Install hooks using the CPU's callback methods
const ioLog = [];
const mmioLog = [];
let currentPc = 0;
let currentStep = 0;

// Override onIoRead/onIoWrite for port I/O
cpu.onIoRead = (port, value) => {
  ioLog.push({ step: currentStep, pc: currentPc, kind: 'in', port, value: value & 0xFF });
};
cpu.onIoWrite = (port, value) => {
  ioLog.push({ step: currentStep, pc: currentPc, kind: 'out', port, value: value & 0xFF });
};

// Wrap cpu.read8 to catch reads from key RAM AND keyboard MMIO
const origRead8 = cpu.read8.bind(cpu);
const origWrite8 = cpu.write8.bind(cpu);
const memLog = [];

cpu.read8 = (addr) => {
  const value = origRead8(addr);
  const a = addr & 0xFFFFFF;
  // Track key RAM addresses
  if (a === KBD_SCAN_CODE || a === KBD_KEY || a === KBD_GETCSC_RESULT) {
    memLog.push({ step: currentStep, pc: currentPc, kind: 'read', addr: a, value: value & 0xFF });
  }
  // Track keyboard MMIO
  if (a >= KBD_MMIO_BASE && a <= KBD_MMIO_SCAN) {
    mmioLog.push({ step: currentStep, pc: currentPc, kind: 'read', addr: a, value: value & 0xFF });
  }
  return value;
};

cpu.write8 = (addr, value) => {
  const a = addr & 0xFFFFFF;
  if (a === KBD_SCAN_CODE || a === KBD_KEY || a === KBD_GETCSC_RESULT) {
    memLog.push({ step: currentStep, pc: currentPc, kind: 'write', addr: a, value: value & 0xFF });
  }
  if (a >= KBD_MMIO_BASE && a <= KBD_MMIO_SCAN) {
    mmioLog.push({ step: currentStep, pc: currentPc, kind: 'write', addr: a, value: value & 0xFF });
  }
  return origWrite8(addr, value);
};

// Track blocks and register state at key addresses
const TRACE_PCS = new Set([
  0x08BF22, 0x042366, 0x0421A7, 0x0423CC,
  0x08BF3C, 0x08BF3E, 0x08BF68,
  0x08BF82, 0x08BF8E, 0x08BFAB,
]);

const regTrace = [];
const allBlocks = [];
const missingBlocks = [];

const result = executor.runFrom(COORMON_ENTRY, 'adl', {
  maxSteps: EVENT_LOOP_MAX_STEPS,
  maxLoopIterations: EVENT_LOOP_MAX_STEPS,
  onBlock(pc, mode, meta, steps) {
    const npc = pc & 0xFFFFFF;
    currentPc = npc;
    currentStep = steps;
    allBlocks.push(npc);

    if (TRACE_PCS.has(npc)) {
      regTrace.push({
        step: steps,
        pc: npc,
        a: cpu.a,
        f: cpu.f,
        hl: cpu._hl,
        bc: cpu._bc,
        de: cpu._de,
      });
    }
  },
  onMissingBlock(pc, mode, steps) {
    missingBlocks.push({ step: steps, pc: pc & 0xFFFFFF, mode });
  },
});

// Restore hooks
cpu.read8 = origRead8;
cpu.write8 = origWrite8;

console.log(`\nResult: steps=${result.steps} termination=${result.termination} lastPc=${hex(result.lastPc)}`);
console.log(`Unique blocks: ${new Set(allBlocks).size}`);

// Register trace
console.log(`\nRegister state at key PCs:`);
for (const t of regTrace) {
  console.log(`  step=${String(t.step).padStart(5)} pc=${hex(t.pc)} A=${hex8(t.a)} F=${hex8(t.f)} HL=${hex(t.hl)} BC=${hex(t.bc)} DE=${hex(t.de)}`);
}

// Memory access log
console.log(`\nKey RAM accesses (D00587/D0058C/D0058E): ${memLog.length}`);
for (const e of memLog.slice(0, 50)) {
  console.log(`  step=${String(e.step).padStart(5)} pc=${hex(e.pc)} ${e.kind.padEnd(5)} ${hex(e.addr)} = ${hex8(e.value)}`);
}
if (memLog.length > 50) {
  console.log(`  ... ${memLog.length - 50} more`);
}

// Keyboard MMIO access log
console.log(`\nKeyboard MMIO accesses (E00800-E00900): ${mmioLog.length}`);
for (const e of mmioLog.slice(0, 100)) {
  console.log(`  step=${String(e.step).padStart(5)} pc=${hex(e.pc)} ${e.kind.padEnd(5)} ${hex(e.addr)} = ${hex8(e.value)}`);
}
if (mmioLog.length > 100) {
  console.log(`  ... ${mmioLog.length - 100} more`);
}

// I/O port log
console.log(`\nI/O port accesses: ${ioLog.length}`);
for (const e of ioLog.slice(0, 50)) {
  console.log(`  step=${String(e.step).padStart(5)} pc=${hex(e.pc)} ${e.kind.padEnd(3)} port=${hex(e.port, 4)} val=${hex8(e.value)}`);
}
if (ioLog.length > 50) {
  console.log(`  ... ${ioLog.length - 50} more`);
}

// Missing blocks
if (missingBlocks.length > 0) {
  console.log(`\nMissing blocks: ${missingBlocks.length}`);
  for (const e of missingBlocks) {
    console.log(`  step=${e.step} pc=${hex(e.pc)} mode=${e.mode}`);
  }
}

// Post-run RAM state
console.log(`\nPost-run key RAM:`);
console.log(`  kbdScanCode  (${hex(KBD_SCAN_CODE)}): ${hex8(mem[KBD_SCAN_CODE])}`);
console.log(`  kbdKey       (${hex(KBD_KEY)}):       ${hex8(mem[KBD_KEY])}`);
console.log(`  kbdGetCSC    (${hex(KBD_GETCSC_RESULT)}): ${hex8(mem[KBD_GETCSC_RESULT])}`);

// ====================================================================
// Decode key CoorMon instructions around GetCSC call and return
// ====================================================================

console.log('\n--- CoorMon disassembly (0x08BF22 - 0x08BF80) ---');
let decAddr = 0x08BF22;
while (decAddr < 0x08BF82) {
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

// GetCSC disassembly
console.log('\n--- GetCSC disassembly (0x042366) ---');
decAddr = 0x042366;
for (let i = 0; i < 30 && decAddr < 0x0423D0; i++) {
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

// Inner scan routine
console.log('\n--- Inner scan routine (0x0421A7) ---');
decAddr = 0x0421A7;
for (let i = 0; i < 20 && decAddr < 0x0421C0; i++) {
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

// Key scan loop
console.log('\n--- Key scan loop (0x001C33 - 0x001CF0) ---');
decAddr = 0x001C33;
while (decAddr < 0x001CF0) {
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

// Scan-to-keycode table dump
console.log(`\n--- Bytes at 0x09F736 (64 bytes, confirmed CODE not data table) ---`);
for (let row = 0; row < 64; row += 16) {
  const addr = 0x09F736 + row;
  console.log(`  ${hex(addr)}: ${bytesHex(romBytes, addr, 16)}`);
}

console.log('\nPhase 335 complete.');

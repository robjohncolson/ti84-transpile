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

// Event loop entry
const COORMON_ENTRY = 0x08BF22;

// Scan-to-keycode table and run limits
const SCAN_TABLE_ADDR = 0x09F736;
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

// --- Tracked addresses ---

const TRACKED_ADDRS = new Map([
  [KBD_SCAN_CODE, 'kbdScanCode'],
  [KBD_KEY, 'kbdKey'],
  [KBD_GETCSC_RESULT, 'kbdGetCSC'],
]);

// --- Instrument memory accesses ---

function installMemoryHooks(cpu, tracked) {
  const origRead8 = cpu.read8.bind(cpu);
  const origWrite8 = cpu.write8.bind(cpu);
  const log = [];
  let currentPc = 0;
  let currentStep = 0;

  cpu.read8 = (addr) => {
    const value = origRead8(addr);
    const normalizedAddr = addr & 0xFFFFFF;
    const name = tracked.get(normalizedAddr);
    if (name) {
      log.push({ step: currentStep, pc: currentPc, kind: 'read', name, addr: normalizedAddr, value: value & 0xFF });
    }
    return value;
  };

  cpu.write8 = (addr, value) => {
    const normalizedAddr = addr & 0xFFFFFF;
    const name = tracked.get(normalizedAddr);
    if (name) {
      log.push({ step: currentStep, pc: currentPc, kind: 'write', name, addr: normalizedAddr, value: value & 0xFF });
    }
    return origWrite8(addr, value);
  };

  return {
    log,
    updateContext(pc, step) {
      currentPc = pc;
      currentStep = step;
    },
    uninstall() {
      cpu.read8 = origRead8;
      cpu.write8 = origWrite8;
    },
  };
}

// --- Instrument I/O port accesses ---

function installIoHooks(cpu) {
  const origIoRead = cpu._ioRead;
  const origIoWrite = cpu._ioWrite;
  const log = [];
  let currentPc = 0;
  let currentStep = 0;

  cpu._ioRead = (port) => {
    const value = origIoRead(port);
    // Only log keyboard port (0x01xx range or port & 0xFF == 0x01)
    const portLow = port & 0xFF;
    if (portLow === 0x01 || portLow === 0x12) {
      log.push({ step: currentStep, pc: currentPc, kind: 'in', port, value: value & 0xFF });
    }
    return value;
  };

  cpu._ioWrite = (port, value) => {
    const portLow = port & 0xFF;
    if (portLow === 0x01 || portLow === 0x12) {
      log.push({ step: currentStep, pc: currentPc, kind: 'out', port, value: value & 0xFF });
    }
    return origIoWrite(port, value);
  };

  return {
    log,
    updateContext(pc, step) {
      currentPc = pc;
      currentStep = step;
    },
    uninstall() {
      cpu._ioRead = origIoRead;
      cpu._ioWrite = origIoWrite;
    },
  };
}

// ====================================================================
// Main probe
// ====================================================================

console.log('Phase 335: Key dispatch trace through CoorMon (0x08BF22)');
console.log('='.repeat(65));

// ====================================================================
// RUN 1: Baseline (no key)
// ====================================================================

console.log('\n>>> RUN 1: Baseline (no key pressed) <<<');

const env1 = createBootedEnvironment();
prepareDirectEntry(env1.cpu, env1.mem);

const memHooks1 = installMemoryHooks(env1.cpu, TRACKED_ADDRS);
const ioHooks1 = installIoHooks(env1.cpu);

const blocks1 = [];
const result1 = env1.executor.runFrom(COORMON_ENTRY, 'adl', {
  maxSteps: EVENT_LOOP_MAX_STEPS,
  maxLoopIterations: EVENT_LOOP_MAX_STEPS,
  onBlock(pc, mode, meta, steps) {
    const npc = pc & 0xFFFFFF;
    memHooks1.updateContext(npc, steps);
    ioHooks1.updateContext(npc, steps);
    blocks1.push(npc);
  },
});

memHooks1.uninstall();
ioHooks1.uninstall();

console.log(`Result: steps=${result1.steps} termination=${result1.termination} lastPc=${hex(result1.lastPc)}`);
console.log(`Key RAM reads/writes: ${memHooks1.log.length}`);
for (const e of memHooks1.log) {
  console.log(`  step=${String(e.step).padStart(5)} pc=${hex(e.pc)} ${e.kind.padEnd(5)} ${e.name}(${hex(e.addr)}) = ${hex8(e.value)}`);
}
console.log(`Keyboard I/O port accesses: ${ioHooks1.log.length}`);
for (const e of ioHooks1.log.slice(0, 80)) {
  console.log(`  step=${String(e.step).padStart(5)} pc=${hex(e.pc)} ${e.kind.padEnd(3)} port=${hex(e.port, 4)} val=${hex8(e.value)}`);
}
if (ioHooks1.log.length > 80) {
  console.log(`  ... ${ioHooks1.log.length - 80} more I/O accesses`);
}

// ====================================================================
// RUN 2: ENTER key via correct keyMatrix mapping
// (ENTER = SDK Group 6, bit 0 → keyMatrix[1], bit 0, active-low)
// ====================================================================

console.log('\n>>> RUN 2: ENTER key (keyMatrix[1] bit 0 cleared, active-low) <<<');

const env2 = createBootedEnvironment();
const km2 = env2.peripherals.keyboard?.keyMatrix ?? env2.peripherals.keyMatrix;
km2.fill(0xFF);
km2[1] = 0xFE;  // ENTER: SDK Group 6 → keyMatrix[1], bit 0 cleared
console.log(`  keyMatrix[1] = ${hex8(km2[1])} (ENTER: bit 0 cleared)`);

prepareDirectEntry(env2.cpu, env2.mem);

const memHooks2 = installMemoryHooks(env2.cpu, TRACKED_ADDRS);
const ioHooks2 = installIoHooks(env2.cpu);

const blocks2 = [];
const result2 = env2.executor.runFrom(COORMON_ENTRY, 'adl', {
  maxSteps: EVENT_LOOP_MAX_STEPS,
  maxLoopIterations: EVENT_LOOP_MAX_STEPS,
  onBlock(pc, mode, meta, steps) {
    const npc = pc & 0xFFFFFF;
    memHooks2.updateContext(npc, steps);
    ioHooks2.updateContext(npc, steps);
    blocks2.push(npc);
  },
});

memHooks2.uninstall();
ioHooks2.uninstall();

console.log(`Result: steps=${result2.steps} termination=${result2.termination} lastPc=${hex(result2.lastPc)}`);
console.log(`Key RAM reads/writes: ${memHooks2.log.length}`);
for (const e of memHooks2.log) {
  console.log(`  step=${String(e.step).padStart(5)} pc=${hex(e.pc)} ${e.kind.padEnd(5)} ${e.name}(${hex(e.addr)}) = ${hex8(e.value)}`);
}
console.log(`Keyboard I/O port accesses: ${ioHooks2.log.length}`);
for (const e of ioHooks2.log.slice(0, 80)) {
  console.log(`  step=${String(e.step).padStart(5)} pc=${hex(e.pc)} ${e.kind.padEnd(3)} port=${hex(e.port, 4)} val=${hex8(e.value)}`);
}
if (ioHooks2.log.length > 80) {
  console.log(`  ... ${ioHooks2.log.length - 80} more I/O accesses`);
}

// Check divergence
let diverge2 = -1;
const maxC2 = Math.min(blocks1.length, blocks2.length);
for (let i = 0; i < maxC2; i++) {
  if (blocks1[i] !== blocks2[i]) {
    diverge2 = i;
    break;
  }
}

if (diverge2 >= 0) {
  console.log(`\nBlock sequences diverge at index ${diverge2}:`);
  const s = Math.max(0, diverge2 - 3);
  const e = Math.min(blocks2.length, diverge2 + 20);
  for (let i = s; i < e; i++) {
    const marker = i === diverge2 ? ' <<< DIVERGE' : '';
    const base = i < blocks1.length ? hex(blocks1[i]) : 'n/a';
    console.log(`  [${i}] baseline=${base} enter=${hex(blocks2[i])}${marker}`);
  }

  // Show unique post-divergence blocks
  const postUnique = [];
  const postSeen = new Set();
  for (const pc of blocks2.slice(diverge2)) {
    if (!postSeen.has(pc)) {
      postSeen.add(pc);
      postUnique.push(pc);
    }
  }
  console.log(`\nUnique blocks in ENTER dispatch path (${postUnique.length}):`);
  for (let i = 0; i < postUnique.length; i += 8) {
    const row = postUnique.slice(i, Math.min(i + 8, postUnique.length));
    console.log(`  ${row.map(pc => hex(pc)).join(' ')}`);
  }
} else {
  console.log(`\nNo divergence from baseline in ${maxC2} blocks. Sequences identical.`);
}

// Post-run RAM
console.log(`\nPost-run key RAM:`);
console.log(`  kbdScanCode  (${hex(KBD_SCAN_CODE)}): ${hex8(env2.mem[KBD_SCAN_CODE])}`);
console.log(`  kbdKey       (${hex(KBD_KEY)}):       ${hex8(env2.mem[KBD_KEY])}`);
console.log(`  kbdGetCSC    (${hex(KBD_GETCSC_RESULT)}): ${hex8(env2.mem[KBD_GETCSC_RESULT])}`);

// ====================================================================
// Decode key CoorMon instructions
// ====================================================================

console.log('\n--- Key CoorMon instruction decode ---');
const decodeTargets = [
  [0x08BF22, 'CoorMon entry: ld iy, IY_BASE'],
  [0x08BF27, null], [0x08BF2A, null], [0x08BF2D, null], [0x08BF30, null],
  [0x08BF33, null], [0x08BF36, null], [0x08BF39, null],
  [0x08BF3C, 'GetCSC return check (jr nz → key detected)'],
  [0x08BF3E, 'No key: check flags'],
  [0x08BF42, null], [0x08BF46, null],
  [0x08BF68, 'KEY DETECTED branch target'],
  [0x08BF6C, null], [0x08BF70, null], [0x08BF74, null], [0x08BF78, null], [0x08BF7C, null],
  [0x08BF80, null],
  [0x08BF82, null],
];

for (const [addr, label] of decodeTargets) {
  try {
    const inst = decodeInstruction(romBytes, addr, 'adl');
    const bytes = [];
    for (let j = 0; j < (inst.length || 1); j++) {
      bytes.push(romBytes[addr + j].toString(16).toUpperCase().padStart(2, '0'));
    }
    const labelStr = label ? `  ; ${label}` : '';
    console.log(`  ${hex(addr)}: ${bytes.join(' ').padEnd(18)} ${(inst.asm || inst.tag || '???').padEnd(20)}${labelStr}`);
  } catch {
    console.log(`  ${hex(addr)}: (decode error)`);
  }
}

// ====================================================================
// Scan-to-keycode table dump (0x09F736 is code, not data)
// ====================================================================

console.log(`\n--- Bytes at 0x09F736 (64 bytes) --- [NOTE: This is CODE, not a data table]`);
for (let row = 0; row < 64; row += 16) {
  const addr = SCAN_TABLE_ADDR + row;
  console.log(`  ${hex(addr)}: ${bytesHex(romBytes, addr, 16)}`);
}

// ====================================================================
// Decode instructions around GetCSC (0x042366) to understand return value
// ====================================================================

console.log('\n--- GetCSC entry disassembly (0x042366) ---');
let decAddr = 0x042366;
for (let i = 0; i < 20; i++) {
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
    break;
  }
}

// ====================================================================
// Keyboard RAM neighborhood
// ====================================================================

console.log(`\n--- Key dispatch RAM neighborhood (D00580-D005A0) ---`);
for (let row = 0xD00580; row < 0xD005A0; row += 16) {
  const bytes = [];
  for (let col = 0; col < 16; col++) {
    bytes.push(env2.mem[row + col].toString(16).toUpperCase().padStart(2, '0'));
  }
  console.log(`  ${hex(row)}: ${bytes.join(' ')}`);
}

console.log('\nPhase 335 complete.');

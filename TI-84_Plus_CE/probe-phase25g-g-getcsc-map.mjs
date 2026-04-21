#!/usr/bin/env node

/**
 * Phase 25G-g: Brute-force map from the keyboard scanner at 0x0159C0 to
 * (sdkGroup, bit, rawScan, physicalLabel).
 *
 * Approach:
 *  1. Cold-boot the OS (boot -> 0x08C331 -> 0x0802B2) as in probe-phase99d.
 *  2. Snapshot CPU + memory.
 *  3. For every (sdkGroup, bit) in 8x8:
 *     - Restore snapshot.
 *     - Assert the single key via p.keyboard.keyMatrix[7-sdkGroup] &= ~(1<<bit).
 *     - Run 0x0159C0 in adl, bounded by 10000 blocks.
 *     - Capture B (result) after RET / termination.
 *  4. Write TI-84_Plus_CE/phase25g-g-map.json and summary to stdout.
 *
 * Rules enforced:
 *  - keyMatrix reversal: index 7-sdkGroup.
 *  - mem.fill(val, start, start+length) signature.
 *  - createPeripheralBus({ timerInterrupt: false }).
 *  - Does NOT modify cpu-runtime.js, peripherals.js, or the transpiler.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');
const MAP_PATH = path.join(__dirname, 'phase25g-g-map.json');

const MEM_SIZE = 0x1000000;
const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const RAW_SCAN_ENTRY = 0x0159C0;
const STACK_RESET_TOP = 0xD1A87E;

const PER_ITER_BLOCK_BUDGET = 10000;
const RAW_SCAN_CAPTURE_PC = 0x015AD2;
const STOP_CAPTURE = 'stop_capture';

function createStopError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

// Physical key labels keyed by rawScan = (sdkGroup << 4) | bit. Sourced from
// TI-84_Plus_CE/keyboard-matrix.md.
const LABEL_MAP = {
  0x00: 'DOWN',
  0x01: 'LEFT',
  0x02: 'RIGHT',
  0x03: 'UP',
  0x10: 'ENTER',
  0x11: '+',
  0x12: '-',
  0x13: 'x',
  0x14: '/',
  0x15: '^',
  0x16: 'CLEAR',
  0x20: '(-)',
  0x21: '3',
  0x22: '6',
  0x23: '9',
  0x24: ')',
  0x25: 'TAN',
  0x26: 'VARS',
  0x30: '.',
  0x31: '2',
  0x32: '5',
  0x33: '8',
  0x34: '(',
  0x35: 'COS',
  0x36: 'PRGM',
  0x37: 'STAT',
  0x40: '0',
  0x41: '1',
  0x42: '4',
  0x43: '7',
  0x44: ',',
  0x45: 'SIN',
  0x46: 'APPS',
  0x47: 'X,T,theta,n',
  0x51: 'STO->',
  0x52: 'LN',
  0x53: 'LOG',
  0x54: 'x^2',
  0x55: 'x^-1',
  0x56: 'MATH',
  0x57: 'ALPHA',
  0x60: 'GRAPH',
  0x61: 'TRACE',
  0x62: 'ZOOM',
  0x63: 'WINDOW',
  0x64: 'Y=',
  0x65: '2ND',
  0x66: 'MODE',
  0x67: 'DEL',
};

const CPU_SNAPSHOT_FIELDS = [
  'a', 'f', '_bc', '_de', '_hl', '_a2', '_f2', '_bc2', '_de2', '_hl2',
  'sp', '_ix', '_iy', 'i', 'im', 'iff1', 'iff2', 'madl', 'mbase', 'halted', 'cycles',
];

function hex(value, width = 2) {
  if (value === undefined || value === null) {
    return 'n/a';
  }

  return `0x${(Number(value) >>> 0).toString(16).padStart(width, '0')}`;
}

function snapshotCpu(cpu) {
  return Object.fromEntries(CPU_SNAPSHOT_FIELDS.map((f) => [f, cpu[f]]));
}

function restoreCpu(cpu, snapshot) {
  for (const [f, v] of Object.entries(snapshot)) {
    cpu[f] = v;
  }
}

function physicalLabel(rawScan) {
  if (Object.prototype.hasOwnProperty.call(LABEL_MAP, rawScan)) {
    return LABEL_MAP[rawScan];
  }

  return `key${hex(rawScan, 2)}`;
}

// --- Load ROM and transpiled blocks ---

const romBytes = fs.readFileSync(ROM_PATH);
const romModule = await import(pathToFileURL(TRANSPILED_PATH).href);
const blocks = romModule.PRELIFTED_BLOCKS;

const memory = new Uint8Array(MEM_SIZE);
memory.set(romBytes);

const peripherals = createPeripheralBus({
  pllDelay: 2,
  timerInterrupt: false,
});

const executor = createExecutor(blocks, memory, { peripherals });
const cpu = executor.cpu;

console.log('Phase 25G-g: brute-force _GetCSC map from 0x0159C0');
console.log('==================================================');

// --- Cold boot ---

const boot = executor.runFrom(BOOT_ENTRY, 'z80', {
  maxSteps: 20000,
  maxLoopIterations: 32,
});

console.log(`Boot: steps=${boot.steps} term=${boot.termination} lastPc=${hex(boot.lastPc, 6)}`);

// --- Kernel init (explicit) ---

cpu.halted = false;
cpu.iff1 = 0;
cpu.iff2 = 0;
cpu.sp = STACK_RESET_TOP - 3;
memory.fill(0xFF, cpu.sp, cpu.sp + 3);

const kernel = executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
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
memory.fill(0xFF, cpu.sp, cpu.sp + 3);

console.log(`Kernel init 0x08C331: steps=${kernel.steps} term=${kernel.termination} lastPc=${hex(kernel.lastPc, 6)}`);

// --- Post init ---

const postInit = executor.runFrom(POST_INIT_ENTRY, 'adl', {
  maxSteps: 100,
  maxLoopIterations: 32,
});

console.log(`Post init 0x0802B2: steps=${postInit.steps} term=${postInit.termination} lastPc=${hex(postInit.lastPc, 6)}`);

// Release keys after init so scanner sweeps start from a known state.
peripherals.keyboard.keyMatrix.fill(0xFF);
peripherals.setKeyboardIRQ(false);

// --- Snapshot post-init state ---

const baseCpu = snapshotCpu(cpu);
const baseMem = new Uint8Array(memory);
const baseKeyMatrix = new Uint8Array(peripherals.keyboard.keyMatrix);
const baseGroupSelect = peripherals.keyboard.groupSelect;

console.log('Snapshot taken.');
console.log('');

// --- Iterate 8x8 keyboard cells ---

const results = [];
const getcscToEntry = new Map();
const collisions = [];
const zeroCases = [];

for (let sdkGroup = 0; sdkGroup < 8; sdkGroup++) {
  for (let bit = 0; bit < 8; bit++) {
    // Restore CPU + memory + peripherals.
    memory.set(baseMem);
    restoreCpu(cpu, baseCpu);
    peripherals.keyboard.keyMatrix.set(baseKeyMatrix);
    peripherals.keyboard.groupSelect = baseGroupSelect;
    peripherals.setKeyboardIRQ(false);

    // Fresh stack/frame for the subroutine call.
    // The scanner at 0x0159C0 reads the keyboard MMIO using IY+offset with
    // IY=0xE00800; 25G-d primed it this way to get a live raw scan.
    cpu.halted = false;
    cpu.iff1 = 0;
    cpu.iff2 = 0;
    cpu.madl = true;
    cpu._iy = 0xE00800;
    cpu.sp = STACK_RESET_TOP;
    cpu.sp -= 3;
    memory[cpu.sp] = 0xFF;
    memory[cpu.sp + 1] = 0xFF;
    memory[cpu.sp + 2] = 0xFF;

    // Assert exactly one key (active-low). Reversed: MMIO index = 7 - sdkGroup.
    peripherals.keyboard.keyMatrix.fill(0xFF);
    peripherals.keyboard.keyMatrix[7 - sdkGroup] &= ~(1 << bit);
    peripherals.keyboard.groupSelect = 0x00; // select all groups
    peripherals.setKeyboardIRQ(true);

    // Task spec: rawScan = (sdkGroup << 4) | bit.
    // MMIO scanner: reports ((7-sdkGroup) << 4) | bit because keyboard-matrix.md
    // numbers its labels by MMIO index, not SDK group.
    const rawScan = (sdkGroup << 4) | bit;
    const rawScanMmio = ((7 - sdkGroup) << 4) | bit;

    let blockCount = 0;
    let lastPc = null;
    let terminated = 'limit';
    let capturedB = null;
    let result;

    try {
      result = executor.runFrom(RAW_SCAN_ENTRY, 'adl', {
        maxSteps: 500,
        maxLoopIterations: PER_ITER_BLOCK_BUDGET,
        onBlock(pc) {
          blockCount++;
          lastPc = pc & 0xFFFFFF;
          cpu.pc = lastPc;

          // 25G-d pattern: the scanner loads the raw scan into B by PC 0x015AD2.
          if (lastPc === RAW_SCAN_CAPTURE_PC && capturedB === null) {
            capturedB = cpu.b & 0xFF;
            throw createStopError(STOP_CAPTURE);
          }
        },
      });
    } catch (error) {
      if (error?.code !== STOP_CAPTURE) {
        throw error;
      }

      result = { termination: 'captured', lastPc: RAW_SCAN_CAPTURE_PC };
    }

    if (result.termination === 'captured') {
      terminated = 'captured@015AD2';
    } else if (result.termination === 'missing_block' && lastPc === 0xFFFFFF) {
      terminated = 'ret';
    } else {
      terminated = result.termination;
    }

    const getcscCode = capturedB !== null ? capturedB : (cpu.b & 0xFF);
    const entry = {
      sdkGroup,
      bit,
      rawScan,
      rawScanHex: hex(rawScan, 2),
      rawScanMmio,
      rawScanMmioHex: hex(rawScanMmio, 2),
      physicalLabel: physicalLabel(rawScanMmio),
      getcscCode,
      getcscHex: hex(getcscCode, 2),
      blocks: blockCount,
      terminated,
      lastPc: lastPc === null ? null : hex(lastPc, 6),
    };

    results.push(entry);

    if (getcscCode === 0x00) {
      zeroCases.push(entry);
    }

    if (getcscToEntry.has(getcscCode)) {
      const first = getcscToEntry.get(getcscCode);
      collisions.push({ first, second: entry });
    } else {
      getcscToEntry.set(getcscCode, entry);
    }
  }
}

// --- Build JSON map keyed by getcscCode ---

const jsonMap = {};
for (const [code, entry] of getcscToEntry.entries()) {
  jsonMap[hex(code, 2)] = {
    sdkGroup: entry.sdkGroup,
    bit: entry.bit,
    rawScan: entry.rawScan,
    rawScanHex: entry.rawScanHex,
    rawScanMmio: entry.rawScanMmio,
    rawScanMmioHex: entry.rawScanMmioHex,
    physicalLabel: entry.physicalLabel,
    blocks: entry.blocks,
    terminated: entry.terminated,
  };
}

fs.writeFileSync(MAP_PATH, JSON.stringify(jsonMap, null, 2) + '\n');

// --- Stdout summary ---

console.log('Summary');
console.log('-------');
console.log(`Total iterations: ${results.length}`);

const uniqueCodes = new Set(results.map((r) => r.getcscCode));
console.log(`Unique getcsc codes observed: ${uniqueCodes.size}`);

const hits = results.filter((r) => r.getcscCode !== 0x00);
console.log(`Non-zero hits: ${hits.length}`);
console.log(`Zero-echo (no-key) cells: ${zeroCases.length}`);
console.log(`Collisions (>=2 raw scans -> same getcsc): ${collisions.length}`);
console.log('');

if (zeroCases.length > 0) {
  console.log('Zero-echo raw scans:');
  for (const z of zeroCases) {
    console.log(`  rawScan=${z.rawScanHex} (sdkGroup=${z.sdkGroup}, bit=${z.bit}, label=${z.physicalLabel})`);
  }
  console.log('');
}

if (collisions.length > 0) {
  console.log('Collisions:');
  for (const c of collisions) {
    console.log(
      `  getcsc=${c.first.getcscHex}: first rawScan=${c.first.rawScanHex} (${c.first.physicalLabel}) ` +
      `vs rawScan=${c.second.rawScanHex} (${c.second.physicalLabel})`
    );
  }
  console.log('');
}

console.log('Sample (first 10 sorted by rawScan):');
const samples = [...results].sort((a, b) => a.rawScan - b.rawScan).slice(0, 10);
for (const s of samples) {
  console.log(
    `  raw=${s.rawScanHex} g=${s.sdkGroup} b=${s.bit} label=${s.physicalLabel.padEnd(12)} ` +
    `getcsc=${s.getcscHex} blocks=${s.blocks} term=${s.terminated}`
  );
}
console.log('');
console.log(`Wrote: ${MAP_PATH}`);
console.log('Done.');

// Emit full results JSON-line for the report generator.
fs.writeFileSync(
  path.join(__dirname, 'phase25g-g-results.json'),
  JSON.stringify(results, null, 2) + '\n'
);

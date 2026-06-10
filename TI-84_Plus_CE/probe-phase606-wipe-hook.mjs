import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const HALT_IDLE = 0x0019b5;
const REAL_INIT = 0x09dd62;
const PAINT = 0x058241;
const OUTER_LOOP = 0x08c331;
const WIPE = 0x0018f8;
const CX_MAIN = 0x0585e9;

const STATE_RANGES = [
  { name: 'ctx', addr: 0xd007ca, len: 21 },
  { name: 'mode', addr: 0xd0008d, len: 1 },
  { name: 'editCursorA', addr: 0xd0231a, len: 3 },
  { name: 'editCursorB', addr: 0xd0243a, len: 3 },
  { name: 'descriptor', addr: 0xd02434, len: 32 },
  { name: 'eventFlags', addr: 0xd0009f, len: 1 },
  { name: 'iyFlags', addr: 0xd00080, len: 128 },
];

const keys = [
  { label: '2', scanCode: 0x90 },
  { label: '3', scanCode: 0x91 },
  { label: '+', scanCode: 0x70 },
];

function write24(mem, a, v) {
  mem[a] = v & 0xFF;
  mem[a + 1] = (v >> 8) & 0xFF;
  mem[a + 2] = (v >> 16) & 0xFF;
}

function read24(mem, a) {
  return mem[a] | (mem[a + 1] << 8) | (mem[a + 2] << 16);
}

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).padStart(width, '0')}`;
}

function countVRAM(mem) {
  const base = 0xD40000;
  let count = 0;
  for (let i = 0; i < 320 * 240; i++) {
    const a = base + i * 2;
    const word = mem[a] | (mem[a + 1] << 8);
    if (word !== 0xFFFF) count++;
  }
  return count;
}

function readBytes(mem, addr, len) {
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = mem[addr + i];
  return bytes;
}

function writeBytes(mem, addr, bytes) {
  for (let i = 0; i < bytes.length; i++) mem[addr + i] = bytes[i];
}

function snapshotState(mem) {
  return STATE_RANGES.map((range) => ({
    ...range,
    bytes: readBytes(mem, range.addr, range.len),
  }));
}

function restoreState(mem, snapshot) {
  for (const range of snapshot) writeBytes(mem, range.addr, range.bytes);
}

function pressKey(mem, scanCode) {
  mem[0xd0058c] = scanCode;
  mem[0xd0058e] = scanCode;
  mem[0xd00587] = scanCode;
  mem[0xd0009f] = mem[0xd0009f] | 0x20;
  mem[0xd00080] = mem[0xd00080] | 0x08;
}

// ── Load ROM + transpiled blocks ──
const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

const MEM_SIZE = 0x1000000;
const mem = new Uint8Array(MEM_SIZE);
mem.set(romBytes.subarray(0, MEM_SIZE));
const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
const executor = createExecutor(BLOCKS, mem, { peripherals });
const cpu = executor.cpu;

console.log('phase606: wipe-hook probe — boot + 3 keys with onBlock restore');

// ── Phase 0: Cold boot (exact copy from probe-605/603) ──
executor.runFrom(0x000000, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
cpu.sp = 0xD1A87E - 3; mem.fill(0xFF, cpu.sp, cpu.sp + 3);
executor.runFrom(0x08C331, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 });
cpu.mbase = 0xD0; cpu._iy = 0xD00080; cpu._hl = 0;
cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
cpu.sp = 0xD1A87E - 3; mem.fill(0xFF, cpu.sp, cpu.sp + 3);
executor.runFrom(0x0802B2, 'adl', { maxSteps: 100, maxLoopIterations: 32 });
cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1;
cpu._iy = 0xD00080; cpu.mbase = 0xD0;
cpu.sp = 0xD1A87E - 12; mem.fill(0xFF, cpu.sp, cpu.sp + 12);
executor.runFrom(0x0019be, 'adl', { maxSteps: 1_500_000, maxLoopIterations: 100000 });

// ── Phase 1: Launch-init ──
peripherals.setTimerEnabled(false);
cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1;
cpu._iy = 0xD00080; cpu.mbase = 0xD0;
const launchSp = 0xD1A87E - 24;
cpu.sp = launchSp;
write24(mem, launchSp, 0x0019be);
write24(mem, 0xD008E0, launchSp);
executor.runFrom(REAL_INIT, 'adl', { maxSteps: 300000, maxLoopIterations: 30000 });
console.log('phase606: init done');

// ── Phase 2: Paint ──
peripherals.setTimerEnabled(true);
cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1;
cpu._iy = 0xD00080; cpu.mbase = 0xD0;
if ((cpu.sp & 0xFFFFFF) < 0x400000) cpu.sp = 0xD1A87E - 24;
cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
write24(mem, cpu.sp, HALT_IDLE);
executor.runFrom(PAINT, 'adl', { maxSteps: 300000, maxLoopIterations: 30000 });

const vramAfterPaint = countVRAM(mem);
console.log(`phase606: paint done vram=${vramAfterPaint}px`);

// ── Snapshot state after paint ──
const cleanState = snapshotState(mem);
// Also snapshot D0058C/D0058E
const snapD0058C = mem[0xD0058C];
const snapD0058E = mem[0xD0058E];

console.log(`phase606: snapshot D007CA=${hex(read24(mem, 0xd007ca))} D0231A=${hex(read24(mem, 0xd0231a))} D0243A=${hex(read24(mem, 0xd0243a))}`);

// ── Process 3 keys with onBlock hooks ──
for (let k = 0; k < keys.length; k++) {
  const key = keys[k];
  console.log(`\nphase606: === Key ${k + 1}/3: '${key.label}' (scan=${hex(key.scanCode, 2)}) ===`);

  // Restore full state from snapshot
  restoreState(mem, cleanState);
  mem[0xD0058C] = snapD0058C;
  mem[0xD0058E] = snapD0058E;

  // Seed the key
  pressKey(mem, key.scanCode);

  // Set up SP and return frame
  cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1;
  cpu._iy = 0xD00080; cpu.mbase = 0xD0;
  if ((cpu.sp & 0xFFFFFF) < 0x400000) cpu.sp = 0xD1A87E - 24;
  cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
  write24(mem, cpu.sp, HALT_IDLE);
  write24(mem, 0xD008E0, cpu.sp);

  // Track events via onBlock
  let wipeCount = 0;
  let cxMainHit = false;

  const result = executor.runFrom(OUTER_LOOP, 'adl', {
    maxSteps: 500_000,
    maxLoopIterations: 500_000,
    onBlock(pc) {
      const addr = pc & 0xFFFFFF;
      if (addr === WIPE) wipeCount++;
      if (addr === CX_MAIN) cxMainHit = true;
      // Auto-restore at HALT idle
      if (addr === HALT_IDLE) {
        restoreState(mem, cleanState);
        mem[0xD0058C] = snapD0058C;
        mem[0xD0058E] = snapD0058E;
      }
    },
  });

  const afterVram = countVRAM(mem);
  const afterD007CA = read24(mem, 0xd007ca);

  const report = {
    key: key.label,
    scanCode: hex(key.scanCode, 2),
    steps: result.steps ?? 'unknown',
    cxMainHit,
    wipeCount,
    vram: afterVram,
    finalD007CA: hex(afterD007CA),
    haltPC: hex(result.lastPc),
  };

  console.log(`phase606: key '${key.label}' report ${JSON.stringify(report)}`);
}

console.log(`\nphase606: done — finalVRAM=${countVRAM(mem)}px`);

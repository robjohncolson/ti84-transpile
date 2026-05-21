#!/usr/bin/env node
/**
 * Phase 392 Probe: Investigate 0xD000C6 initialization (LCD mode flag)
 *
 * Part A: Dynamic boot trace — track when 0xD000C6 is written during boot
 * Part B: Static ROM search — find instructions that could write to 0xD000C6
 *
 * Session 391 found that 0x08C308 tests bit 2 of RAM 0xD000C6 to determine
 * LCD color depth: bit2=0 → 16bpp, bit2=1 → 8bpp.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function hex(v, w = 6) {
  if (v === undefined || v === null) return 'n/a';
  return '0x' + (v >>> 0).toString(16).padStart(w, '0').toUpperCase();
}

// ── Part A: Dynamic boot trace ──────────────────────────────────────────────

console.log('=== Part A: Dynamic boot trace ===\n');

const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const rom = new Uint8Array(romBytes.buffer, romBytes.byteOffset, romBytes.byteLength);

const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

const MEM_SIZE = 0x1000000;
const TARGET_ADDR = 0xD000C6;
const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const STACK_RESET_TOP = 0xD1A87E;
const MAX_BLOCKS = 500000;

const peripherals = createPeripheralBus({ timerInterrupt: false });
const mem = new Uint8Array(MEM_SIZE);
// Copy ROM into memory
mem.set(rom.subarray(0, Math.min(rom.length, 0x400000)));

const executor = createExecutor(BLOCKS, mem, { peripherals });
const cpu = executor.cpu;

let prevValue = mem[TARGET_ADDR];
const writeLog = [];
let totalBlocks = 0;

function checkTarget(pc, mode, meta, step) {
  totalBlocks++;
  const cur = mem[TARGET_ADDR];
  if (cur !== prevValue) {
    writeLog.push({
      step,
      pc,
      mode,
      oldValue: prevValue,
      newValue: cur,
      bit2: (cur & 0x04) ? 1 : 0,
    });
    console.log(`  [block ${step}] PC=${hex(pc)} mode=${mode}: 0xD000C6 changed ${hex(prevValue, 2)} -> ${hex(cur, 2)} (bit2=${(cur & 0x04) ? 1 : 0})`);
    prevValue = cur;
  }
}

// Stage 1: Cold boot (Z80 mode reset vector)
console.log('Stage 1: Cold boot from 0x000000 (Z80 mode)...');
prevValue = mem[TARGET_ADDR];

const bootResult = executor.runFrom(BOOT_ENTRY, 'z80', {
  maxSteps: 20000,
  maxLoopIterations: 32,
  onBlock: checkTarget,
});
console.log(`  Boot: steps=${bootResult.steps} term=${bootResult.termination} lastPc=${hex(bootResult.lastPc)}`);

// Stage 2: Kernel init
console.log('\nStage 2: Kernel init from 0x08C331 (ADL mode)...');
cpu.halted = false;
cpu.iff1 = 0;
cpu.iff2 = 0;
cpu.sp = STACK_RESET_TOP - 3;
mem.fill(0xFF, cpu.sp, cpu.sp + 3);

const kernelResult = executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
  maxSteps: 100000,
  maxLoopIterations: 10000,
  onBlock: checkTarget,
});
console.log(`  Kernel: steps=${kernelResult.steps} term=${kernelResult.termination} lastPc=${hex(kernelResult.lastPc)}`);

// Stage 3: Post-init
console.log('\nStage 3: Post-init from 0x0802B2 (ADL mode)...');
cpu.mbase = 0xD0;
cpu._iy = 0xD00080;
cpu._hl = 0;
cpu.halted = false;
cpu.iff1 = 0;
cpu.iff2 = 0;
cpu.sp = STACK_RESET_TOP - 3;
mem.fill(0xFF, cpu.sp, cpu.sp + 3);

const postResult = executor.runFrom(POST_INIT_ENTRY, 'adl', {
  maxSteps: 100,
  maxLoopIterations: 32,
  onBlock: checkTarget,
});
console.log(`  Post-init: steps=${postResult.steps} term=${postResult.termination} lastPc=${hex(postResult.lastPc)}`);

// Stage 4: Further execution stages
const STAGE_ENTRIES = [
  { name: 'Stage1', entry: 0x0A2B72 },
  { name: 'Stage2', entry: 0x0A3301 },
  { name: 'Stage3', entry: 0x0A29EC },
  { name: 'Stage4', entry: 0x0A2854 },
];

for (const { name, entry } of STAGE_ENTRIES) {
  console.log(`\n${name}: entry=${hex(entry)} (ADL mode)...`);
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const res = executor.runFrom(entry, 'adl', {
    maxSteps: 100000,
    maxLoopIterations: 500,
    onBlock: checkTarget,
  });
  console.log(`  ${name}: steps=${res.steps} term=${res.termination} lastPc=${hex(res.lastPc)}`);
}

console.log('\n--- Summary ---');
console.log(`Total blocks executed: ${totalBlocks}`);
console.log(`Total changes to 0xD000C6: ${writeLog.length}`);
console.log(`Final value of 0xD000C6: ${hex(mem[TARGET_ADDR], 2)}`);
console.log(`Final bit 2: ${(mem[TARGET_ADDR] & 0x04) ? '1 (8bpp)' : '0 (16bpp)'}`);

if (writeLog.length > 0) {
  console.log('\nAll PCs that triggered a change:');
  for (const entry of writeLog) {
    console.log(`  Block step ${entry.step}: PC=${hex(entry.pc)} mode=${entry.mode} value ${hex(entry.oldValue, 2)}->${hex(entry.newValue, 2)} bit2=${entry.bit2}`);
  }
} else {
  console.log('\n0xD000C6 was never written during boot (stayed at initial value).');
}


// ── Part B: Static ROM search ───────────────────────────────────────────────

console.log('\n\n=== Part B: Static ROM search ===\n');

const romLen = rom.length;

// Pattern 1: LD (0xD000C6),A in ADL mode: 0x32 0xC6 0x00 0xD0
console.log('Pattern 1: LD (0xD000C6),A — bytes 32 C6 00 D0');
let found1 = 0;
for (let i = 0; i < romLen - 3; i++) {
  if (rom[i] === 0x32 && rom[i + 1] === 0xC6 && rom[i + 2] === 0x00 && rom[i + 3] === 0xD0) {
    console.log(`  ${hex(i)}: 32 C6 00 D0`);
    found1++;
  }
}
if (found1 === 0) console.log('  (none found)');

// Pattern 1b: LD (0x00C6),A in Z80/SIS mode: 0x32 0xC6 0x00
// (MBASE=0xD0 would extend to 0xD000C6)
console.log('\nPattern 1b: LD (0x00C6),A (Z80 mode, MBASE=D0) — bytes 32 C6 00');
let found1b = 0;
for (let i = 0; i < romLen - 2; i++) {
  if (rom[i] === 0x32 && rom[i + 1] === 0xC6 && rom[i + 2] === 0x00) {
    // Exclude cases already found as ADL 4-byte pattern
    if (i + 3 < romLen && rom[i + 3] === 0xD0) continue;
    console.log(`  ${hex(i)}: 32 C6 00 [next=${hex(rom[i + 3], 2)}]`);
    found1b++;
  }
}
if (found1b === 0) console.log('  (none found)');

// Pattern 2: IY-indexed SET/RES bit via (IY+0x46): FD CB 46 xx
// IY=0xD00080 → IY+0x46 = 0xD000C6
console.log('\nPattern 2: SET/RES bit,(IY+0x46) — bytes FD CB 46 xx');
let found2 = 0;
for (let i = 0; i < romLen - 3; i++) {
  if (rom[i] === 0xFD && rom[i + 1] === 0xCB && rom[i + 2] === 0x46) {
    const opByte = rom[i + 3];
    let desc;
    if ((opByte & 0xC0) === 0xC0) {
      const bit = (opByte >> 3) & 7;
      desc = `SET ${bit},(IY+0x46)`;
    } else if ((opByte & 0xC0) === 0x80) {
      const bit = (opByte >> 3) & 7;
      desc = `RES ${bit},(IY+0x46)`;
    } else if ((opByte & 0xC0) === 0x40) {
      const bit = (opByte >> 3) & 7;
      desc = `BIT ${bit},(IY+0x46)`;
    } else {
      desc = `rotate/shift (IY+0x46) op=${hex(opByte, 2)}`;
    }
    console.log(`  ${hex(i)}: FD CB 46 ${hex(opByte, 2)} — ${desc}`);
    found2++;
  }
}
if (found2 === 0) console.log('  (none found)');

// Pattern 3: LD (IY+0x46),imm8: FD 36 46 xx
console.log('\nPattern 3: LD (IY+0x46),imm8 — bytes FD 36 46 xx');
let found3 = 0;
for (let i = 0; i < romLen - 3; i++) {
  if (rom[i] === 0xFD && rom[i + 1] === 0x36 && rom[i + 2] === 0x46) {
    const imm = rom[i + 3];
    console.log(`  ${hex(i)}: FD 36 46 ${hex(imm, 2)} — LD (IY+0x46),${hex(imm, 2)}`);
    found3++;
  }
}
if (found3 === 0) console.log('  (none found)');

// Pattern 4: LD (IY+0x46),r — FD 70..77 46 (r=B..A)
// Encoding: FD 70+r 46 where r is 0-7 (excl 6 which is (HL))
console.log('\nPattern 4: LD (IY+0x46),r — bytes FD 7x 46');
const regNames = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
let found4 = 0;
for (let i = 0; i < romLen - 2; i++) {
  if (rom[i] === 0xFD && rom[i + 1] >= 0x70 && rom[i + 1] <= 0x77 && rom[i + 2] === 0x46) {
    const r = rom[i + 1] - 0x70;
    console.log(`  ${hex(i)}: FD ${hex(rom[i + 1], 2)} 46 — LD (IY+0x46),${regNames[r]}`);
    found4++;
  }
}
if (found4 === 0) console.log('  (none found)');

// Pattern 5: LD (HL),x or LD (DE),A with HL/DE=0xD000C6
// Can't search statically for register-indirect, just note this
console.log('\nPattern 5: Register-indirect writes (LD (HL),x / LD (DE),A / LDIR etc.)');
console.log('  Cannot detect statically — HL/DE value depends on runtime state.');
console.log('  Dynamic trace (Part A) covers these cases.');

const totalStatic = found1 + found1b + found2 + found3 + found4;
console.log(`\nTotal static pattern matches: ${totalStatic}`);

console.log('\n=== Probe complete ===');

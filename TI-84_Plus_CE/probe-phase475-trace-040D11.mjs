#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MEM_SIZE = 0x1000000;
const STACK_RESET_TOP = 0xD1A87E;
const VRAM_START = 0xD40000;
const VRAM_END = 0xD65800;

const mem = new Uint8Array(MEM_SIZE);
const rom = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
mem.set(rom.subarray(0, MEM_SIZE), 0);

const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;
const peripherals = createPeripheralBus({ timerInterrupt: false });
const executor = createExecutor(BLOCKS, mem, { peripherals });
const cpu = executor.cpu;

const bootResult = executor.runFrom(0x000000, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
cpu.sp = STACK_RESET_TOP - 3;
mem.fill(0xFF, cpu.sp, cpu.sp + 3);

cpu.mbase = 0xD0; cpu._iy = 0xD00080;
const kernelResult = executor.runFrom(0x08C331, 'adl', { maxSteps: 200000, maxLoopIterations: 500 });
cpu.mbase = 0xD0; cpu._iy = 0xD00080; cpu._hl = 0;
cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
cpu.sp = STACK_RESET_TOP - 3;
mem.fill(0xFF, cpu.sp, cpu.sp + 3);

const postInitResult = executor.runFrom(0x0802B2, 'adl', { maxSteps: 200000, maxLoopIterations: 500 });

const romBytes = [];
for (let i = 0x040D11; i < 0x040D61; i++) {
  romBytes.push(mem[i].toString(16).padStart(2, '0'));
}
console.log('ROM 0x040D11-0x040D60:', romBytes.join(' '));

const postBootMemory = mem.slice();

function hex(value, width = 6) {
  if (typeof value === 'bigint') {
    value = Number(value);
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return String(value);
  }
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function byteHex(value) {
  return hex(value & 0xFF, 2);
}

function read24(address) {
  return mem[address] | (mem[address + 1] << 8) | (mem[address + 2] << 16);
}

function createPcTracker() {
  const records = [];
  const byPc = new Map();

  return {
    records,
    onBlock(pc, mode, meta, steps) {
      const normalizedPc = typeof pc === 'bigint' ? Number(pc) : pc;
      const key = typeof normalizedPc === 'number' && Number.isFinite(normalizedPc)
        ? normalizedPc >>> 0
        : String(pc);
      let record = byPc.get(key);
      if (!record) {
        record = { pc: key, count: 0, firstMode: mode, firstSteps: steps };
        byPc.set(key, record);
        records.push(record);
      }
      record.count++;
    },
  };
}

function snapshotVram() {
  return mem.slice(VRAM_START, VRAM_END);
}

function diffVram(before) {
  const firstChanges = [];
  let count = 0;

  for (let i = 0; i < before.length; i++) {
    const after = mem[VRAM_START + i];
    if (before[i] !== after) {
      count++;
      if (firstChanges.length < 20) {
        firstChanges.push({
          address: VRAM_START + i,
          before: before[i],
          after,
        });
      }
    }
  }

  return { count, firstChanges };
}

function resetCpuForDirectCall() {
  cpu.mbase = 0xD0; cpu._iy = 0xD00080;
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);
}

function printResultSummary(label, result) {
  const steps = result?.steps ?? result?.stepCount ?? result?.totalSteps ?? 'unknown';
  const reason = result?.reason ?? result?.status ?? result?.terminationReason ?? 'unknown';
  const lastPc = result?.lastPc ?? result?.pc ?? cpu.pc;

  console.log(`${label} steps taken: ${steps}`);
  console.log(`${label} termination reason: ${reason}`);
  console.log(`${label} lastPc: ${hex(lastPc)}`);
}

function printPcCounts(label, records) {
  const shown = records.slice(0, 200);
  console.log(`${label} unique PCs hit: ${records.length}`);
  for (const record of shown) {
    console.log(`  ${hex(record.pc)} count=${record.count}`);
  }
  if (records.length > shown.length) {
    console.log(`  ... ${records.length - shown.length} more unique PCs omitted`);
  }
}

function printVramDiff(label, diff) {
  console.log(`${label} VRAM bytes changed: ${diff.count}`);
  if (diff.count > 0) {
    console.log(`${label} first changed VRAM addresses:`);
    for (const change of diff.firstChanges) {
      console.log(`  ${hex(change.address)}: ${byteHex(change.before)} -> ${byteHex(change.after)}`);
    }
  }
}

function printKeyRamState(label) {
  console.log(`${label} key RAM state after:`);
  console.log(`  D00092=${byteHex(mem[0xD00092])}`);
  console.log(`  D00591-3=${byteHex(mem[0xD00591])} ${byteHex(mem[0xD00592])} ${byteHex(mem[0xD00593])} (${hex(read24(0xD00591))})`);
  console.log(`  D0058C=${byteHex(mem[0xD0058C])}`);
  console.log(`  D00000=${byteHex(mem[0xD00000])}`);
  console.log(`  D00088=${byteHex(mem[0xD00088])}`);
}

function printRunReport(label, result, tracker, vramDiff) {
  console.log('');
  console.log(`=== ${label} ===`);
  printPcCounts(label, tracker.records);
  printResultSummary(label, result);
  printVramDiff(label, vramDiff);
  printKeyRamState(label);
}

console.log('Boot result:', bootResult);
console.log('Kernel init result:', kernelResult);
console.log('Post-init result:', postInitResult);

mem.set(postBootMemory);
resetCpuForDirectCall();

const tracker1 = createPcTracker();
function onBlock1(pc, mode, meta, steps) {
  tracker1.onBlock(pc, mode, meta, steps);
}

const vramBefore1 = snapshotVram();
const run1Result = executor.runFrom(0x040D11, 'adl', { maxSteps: 5000, maxLoopIterations: 100, diHaltBypass: true, onBlock: onBlock1 });
const vramDiff1 = diffVram(vramBefore1);
printRunReport('Run 1 default state', run1Result, tracker1, vramDiff1);

mem.set(postBootMemory);
resetCpuForDirectCall();
mem[0xD00092] = 0x10;         // bit 4 = cursor active
mem[0xD00591] = 0x00;         // cursor address = D40000
mem[0xD00592] = 0x00;
mem[0xD00593] = 0xD4;
mem[0xD0058C] = 0x01;         // cursor position
mem[0xD00000] = 0x01;         // display counter nonzero

const tracker2 = createPcTracker();
function onBlock2(pc, mode, meta, steps) {
  tracker2.onBlock(pc, mode, meta, steps);
}

const vramBefore2 = snapshotVram();
const run2Result = executor.runFrom(0x040D11, 'adl', { maxSteps: 5000, maxLoopIterations: 100, diHaltBypass: true, onBlock: onBlock2 });
const vramDiff2 = diffVram(vramBefore2);
printRunReport('Run 2 display state set', run2Result, tracker2, vramDiff2);

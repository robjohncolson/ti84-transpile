#!/usr/bin/env node
// Phase 196 — trace writes to rowLimit (0xD02504) / colLimit (0xD02505) during
// home-screen boot + render. Read-only investigation.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

const MEM_SIZE = 0x1000000;
const BOOT_ENTRY = 0x000000;
const BOOT_MODE = 'z80';
const BOOT_MAX_STEPS = 20000;
const BOOT_MAX_LOOP_ITERATIONS = 32;
const STACK_RESET_TOP = 0xD1A87E;

const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const STAGE_1_ENTRY = 0x0A2B72;
const STAGE_2_ENTRY = 0x0A3301;
const STAGE_3_ENTRY = 0x0A29EC;
const STAGE_4_ENTRY = 0x0A2854;
const STAGE_MAX_LOOP_ITERATIONS = 500;

const ROW_LIMIT_ADDR = 0xD02504;
const COL_LIMIT_ADDR = 0xD02505;

const VRAM_BASE = 0xD40000;
const VRAM_WIDTH = 320;
const VRAM_HEIGHT = 240;
const VRAM_BYTE_SIZE = VRAM_WIDTH * VRAM_HEIGHT * 2;

const CPU_SNAPSHOT_FIELDS = [
  'a','f','_bc','_de','_hl','_a2','_f2','_bc2','_de2','_hl2',
  'sp','_ix','_iy','i','im','iff1','iff2','madl','mbase','halted','cycles',
];

function hex(value, width = 6) {
  if (value === undefined || value === null) return 'n/a';
  return `0x${(value >>> 0).toString(16).padStart(width, '0')}`;
}

function clearVram(mem) {
  mem.fill(0xAA, VRAM_BASE, VRAM_BASE + VRAM_BYTE_SIZE);
}

function snapshotCpu(cpu) {
  return Object.fromEntries(CPU_SNAPSHOT_FIELDS.map((f) => [f, cpu[f]]));
}

function restoreCpu(cpu, snapshot, mem) {
  for (const [f, v] of Object.entries(snapshot)) {
    cpu[f] = v;
  }
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu._iy = 0xD00080;
  cpu.f = 0x40;
  cpu._ix = 0xD1A860;
  cpu.sp = STACK_RESET_TOP - 12;
  mem.fill(0xFF, cpu.sp, cpu.sp + 12);
}

function installWriteHook(cpu, log, phaseRef) {
  const orig = cpu.write8.bind(cpu);
  cpu.write8 = (addr, value) => {
    if (addr === ROW_LIMIT_ADDR || addr === COL_LIMIT_ADDR) {
      log.push({ phase: phaseRef.phase, pc: cpu.pc, addr, value });
    }
    return orig(addr, value);
  };
}

function coldBoot(executor, cpu, mem, phaseRef) {
  phaseRef.phase = 'boot-z80';
  const result = executor.runFrom(BOOT_ENTRY, BOOT_MODE, {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: BOOT_MAX_LOOP_ITERATIONS,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  phaseRef.phase = 'kernel-init';
  executor.runFrom(KERNEL_INIT_ENTRY, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 });
  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  phaseRef.phase = 'post-init';
  executor.runFrom(POST_INIT_ENTRY, 'adl', { maxSteps: 100, maxLoopIterations: 32 });

  return result;
}

function runStage(executor, label, entry, maxSteps, phaseRef) {
  phaseRef.phase = label;
  const result = executor.runFrom(entry, 'adl', {
    maxSteps,
    maxLoopIterations: STAGE_MAX_LOOP_ITERATIONS,
  });
  console.log(`${label}: entry=${hex(entry, 6)} steps=${result.steps} term=${result.termination} lastPc=${hex(result.lastPc, 6)}`);
  return result;
}

async function main() {
  console.log('=== Phase 196 — rowLimit/colLimit write trace ===');

  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes);
  clearVram(mem);

  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  const writeLog = [];
  const phaseRef = { phase: 'pre-boot' };
  installWriteHook(cpu, writeLog, phaseRef);

  console.log(`initial rowLimit(0x${ROW_LIMIT_ADDR.toString(16)})=0x${mem[ROW_LIMIT_ADDR].toString(16).padStart(2,'0')} colLimit(0x${COL_LIMIT_ADDR.toString(16)})=0x${mem[COL_LIMIT_ADDR].toString(16).padStart(2,'0')}`);

  const bootResult = coldBoot(executor, cpu, mem, phaseRef);
  console.log(`boot: steps=${bootResult.steps} term=${bootResult.termination} lastPc=${hex(bootResult.lastPc, 6)}`);
  console.log(`after boot: rowLimit=0x${mem[ROW_LIMIT_ADDR].toString(16).padStart(2,'0')} colLimit=0x${mem[COL_LIMIT_ADDR].toString(16).padStart(2,'0')}`);

  const ramSnap = new Uint8Array(mem.slice(0x400000, 0xE00000));
  const cpuSnap = snapshotCpu(cpu);

  mem.set(ramSnap, 0x400000);
  clearVram(mem);
  restoreCpu(cpu, cpuSnap, mem);

  runStage(executor, 'stage1-statusbar', STAGE_1_ENTRY, 30000, phaseRef);
  console.log(`after stage1: rowLimit=0x${mem[ROW_LIMIT_ADDR].toString(16).padStart(2,'0')} colLimit=0x${mem[COL_LIMIT_ADDR].toString(16).padStart(2,'0')}`);

  restoreCpu(cpu, cpuSnap, mem);
  mem[0xd0009b] &= ~0x40;
  runStage(executor, 'stage2-statusdots', STAGE_2_ENTRY, 30000, phaseRef);
  console.log(`after stage2: rowLimit=0x${mem[ROW_LIMIT_ADDR].toString(16).padStart(2,'0')} colLimit=0x${mem[COL_LIMIT_ADDR].toString(16).padStart(2,'0')}`);

  restoreCpu(cpu, cpuSnap, mem);
  runStage(executor, 'stage3-homerow', STAGE_3_ENTRY, 50000, phaseRef);
  console.log(`after stage3: rowLimit=0x${mem[ROW_LIMIT_ADDR].toString(16).padStart(2,'0')} colLimit=0x${mem[COL_LIMIT_ADDR].toString(16).padStart(2,'0')}`);

  restoreCpu(cpu, cpuSnap, mem);
  runStage(executor, 'stage4-history', STAGE_4_ENTRY, 50000, phaseRef);
  console.log(`after stage4: rowLimit=0x${mem[ROW_LIMIT_ADDR].toString(16).padStart(2,'0')} colLimit=0x${mem[COL_LIMIT_ADDR].toString(16).padStart(2,'0')}`);

  console.log('');
  console.log(`=== write log (${writeLog.length} entries) ===`);
  for (const entry of writeLog) {
    console.log(`  phase=${entry.phase} pc=${hex(entry.pc, 6)} addr=${hex(entry.addr, 6)} value=0x${(entry.value & 0xff).toString(16).padStart(2,'0')}`);
  }

  console.log('');
  console.log(`=== final values ===`);
  console.log(`  rowLimit(0xD02504)=0x${mem[ROW_LIMIT_ADDR].toString(16).padStart(2,'0')}`);
  console.log(`  colLimit(0xD02505)=0x${mem[COL_LIMIT_ADDR].toString(16).padStart(2,'0')}`);
  console.log(`  total writes to rowLimit: ${writeLog.filter(e => e.addr === ROW_LIMIT_ADDR).length}`);
  console.log(`  total writes to colLimit: ${writeLog.filter(e => e.addr === COL_LIMIT_ADDR).length}`);

  process.exitCode = 0;
}

try {
  await main();
} catch (error) {
  console.error(error.stack || error);
  process.exitCode = 1;
}

#!/usr/bin/env node
// Phase 469: Direct entry at 0x030078 after full cold boot.
// Injects ENTER before entering the real key wait loop and tracks key-path PCs.

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
const STACK_RESET_TOP = 0xD1A87E;
const START_PC = 0x030078;
const MAX_RUN_STEPS = 2000000;
const ENTER_SCAN_CODE = 0x09;
const ENTER_KEY_DOWN_CODE = 0x10;

const KEY_SCAN_CODE_ADDR = 0xD00587;
const KEY_AVAILABLE_FLAG_ADDR = 0xD00080;
const KEY_AVAILABLE_FLAG_MASK = 0x08;

const VRAM_START = 0xD40000;
const VRAM_SIZE = 320 * 240 * 2;
const VRAM_DUMP_SIZE = 256;

const TRACKED_PCS = new Map([
  [0x030078, 'real key wait loop entry'],
  [0x03FA09, 'key processor'],
  [0x003D5A, '_GetCSC'],
  [0x040D40, '0x040D40'],
  [0x003A0F, 'error handler'],
  [0x021A3C, 'post-boot mode dispatcher entry'],
  [0x021AB8, 'mode dispatcher computed jump'],
]);

function hex(value, width = 6) {
  if (value === undefined || value === null) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex(Number(value) & 0xFF, 2);
}

function vramChecksum(mem) {
  let hash = 0x811C9DC5;

  for (let i = VRAM_START; i < VRAM_START + VRAM_SIZE; i++) {
    hash ^= mem[i];
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }

  return hash >>> 0;
}

function hexDump(mem, start, length, bytesPerLine = 16) {
  const lines = [];

  for (let offset = 0; offset < length; offset += bytesPerLine) {
    const bytes = [];
    const ascii = [];
    const lineLength = Math.min(bytesPerLine, length - offset);

    for (let i = 0; i < lineLength; i++) {
      const value = mem[start + offset + i] ?? 0;
      bytes.push((value & 0xFF).toString(16).toUpperCase().padStart(2, '0'));
      ascii.push(value >= 0x20 && value <= 0x7E ? String.fromCharCode(value) : '.');
    }

    lines.push(`${hex(start + offset)}: ${bytes.join(' ').padEnd(bytesPerLine * 3 - 1)}  ${ascii.join('')}`);
  }

  return lines.join('\n');
}

function describeTermination(result) {
  if (result.error) {
    return `error: ${result.error instanceof Error ? result.error.message : String(result.error)}`;
  }

  switch (result.termination) {
    case 'max_steps':
      return `step limit reached (${MAX_RUN_STEPS})`;
    case 'missing_block':
      return 'missing transpiled block at or near the final PC';
    case 'halt':
      return 'CPU HALT returned from a lifted block';
    case 'sleep':
      return 'CPU sleep returned from a lifted block';
    case 'no_return':
      return 'lifted block returned no next PC';
    case 'throw':
      return 'exception escaped from runFrom';
    case 'error':
      return 'exception caught inside runFrom';
    default:
      return result.termination ?? 'unknown';
  }
}

function resetCpuForBootStage(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);
}

function injectEnterKey(cpu, mem, peripherals) {
  const memory = cpu.mem ?? cpu.memory ?? mem;
  cpu.mem = memory;

  memory[KEY_SCAN_CODE_ADDR] = ENTER_SCAN_CODE;
  memory[KEY_AVAILABLE_FLAG_ADDR] = (memory[KEY_AVAILABLE_FLAG_ADDR] | KEY_AVAILABLE_FLAG_MASK) & 0xFF;

  const apiCalls = [];

  if (typeof peripherals.setKeyPressed === 'function') {
    peripherals.setKeyPressed(memory, ENTER_SCAN_CODE);
    apiCalls.push(`setKeyPressed(mem, ${hexByte(ENTER_SCAN_CODE)})`);
  }

  if (typeof peripherals.keyDown === 'function') {
    peripherals.keyDown(ENTER_KEY_DOWN_CODE);
    apiCalls.push(`keyDown(${hexByte(ENTER_KEY_DOWN_CODE)})`);
  } else {
    apiCalls.push('keyDown API not available');
  }

  return apiCalls;
}

async function main() {
  console.log('=== Phase 469: Direct 0x030078 with ENTER injected ===');
  console.log('');

  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes);

  const peripherals = createPeripheralBus({
    timerInterrupt: true,
    timerInterval: 500,
  });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;
  cpu.mem = mem;

  console.log('--- Stage 1: Cold boot ---');

  const bootResult = executor.runFrom(0x000000, 'z80', {
    maxSteps: 20000,
    maxLoopIterations: 32,
  });
  console.log(`boot:      steps=${bootResult.steps} term=${bootResult.termination} lastPc=${hex(bootResult.lastPc)} mode=${bootResult.lastMode}`);

  resetCpuForBootStage(cpu, mem);

  const kernelResult = executor.runFrom(0x08C331, 'adl', {
    maxSteps: 200000,
    maxLoopIterations: 500,
  });
  console.log(`kernel:    steps=${kernelResult.steps} term=${kernelResult.termination} lastPc=${hex(kernelResult.lastPc)} mode=${kernelResult.lastMode}`);

  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;
  cpu._hl = 0;
  resetCpuForBootStage(cpu, mem);

  const postInitResult = executor.runFrom(0x0802B2, 'adl', {
    maxSteps: 200000,
    maxLoopIterations: 500,
  });
  console.log(`post-init: steps=${postInitResult.steps} term=${postInitResult.termination} lastPc=${hex(postInitResult.lastPc)} mode=${postInitResult.lastMode}`);
  console.log('');

  console.log('--- Stage 2: Inject ENTER after boot ---');
  const keyApiCalls = injectEnterKey(cpu, mem, peripherals);

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  console.log(`D00587 (scan code) = ${hexByte(mem[KEY_SCAN_CODE_ADDR])}`);
  console.log(`D00080 (key flags) = ${hexByte(mem[KEY_AVAILABLE_FLAG_ADDR])} (bit3=${(mem[KEY_AVAILABLE_FLAG_ADDR] >> 3) & 1})`);
  console.log(`key injection APIs  = ${keyApiCalls.join(', ')}`);
  console.log('');

  console.log('--- Stage 3: Run from 0x030078 ---');

  const hits = new Map();
  const firstHitSteps = new Map();
  const eventLog = [];

  for (const [pc] of TRACKED_PCS) {
    hits.set(pc, 0);
  }

  function logEvent(message) {
    if (eventLog.length < 80) {
      eventLog.push(message);
    }
  }

  const vramBefore = vramChecksum(mem);
  let runResult;

  try {
    runResult = executor.runFrom(START_PC, 'adl', {
      maxSteps: MAX_RUN_STEPS,
      maxLoopIterations: 200000,
      diHaltBypass: true,

      onBlock(pc, mode, meta, steps) {
        const normalizedPc = pc & 0xFFFFFF;

        if (!hits.has(normalizedPc)) {
          return;
        }

        const count = hits.get(normalizedPc) + 1;
        hits.set(normalizedPc, count);

        if (!firstHitSteps.has(normalizedPc)) {
          firstHitSteps.set(normalizedPc, steps);
        }

        if (count <= 5) {
          logEvent(
            `step=${steps} pc=${hex(normalizedPc)} mode=${mode} ` +
            `[${TRACKED_PCS.get(normalizedPc)}] hit #${count} ` +
            `A=${hexByte(cpu.a)} D00587=${hexByte(mem[KEY_SCAN_CODE_ADDR])} ` +
            `D00080=${hexByte(mem[KEY_AVAILABLE_FLAG_ADDR])}`
          );
        }
      },

      onMissingBlock(pc, mode, steps) {
        logEvent(`missing block at step=${steps} pc=${hex(pc & 0xFFFFFF)} mode=${mode}`);
      },

      onDynamicTarget(target, mode, fromPc, steps) {
        const normalizedTarget = target & 0xFFFFFF;
        if (TRACKED_PCS.has(normalizedTarget)) {
          logEvent(`dynamic target step=${steps} from=${hex(fromPc & 0xFFFFFF)} to=${hex(normalizedTarget)} mode=${mode}`);
        }
      },
    });
  } catch (error) {
    runResult = {
      steps: cpu.stepCount ?? 0,
      lastPc: cpu.pc ?? START_PC,
      lastMode: cpu.madl ? 'adl' : 'z80',
      halted: cpu.halted,
      termination: 'throw',
      error,
      loopsForced: 0,
      blockVisits: {},
      dynamicTargets: [],
      missingBlocks: [],
    };
  }

  const vramAfter = vramChecksum(mem);

  console.log(`run: steps=${runResult.steps} term=${runResult.termination} why=${describeTermination(runResult)}`);
  console.log(`lastPc=${hex(runResult.lastPc)} lastMode=${runResult.lastMode} halted=${runResult.halted}`);
  console.log(`loopsForced=${runResult.loopsForced ?? 0} missingBlocks=${runResult.missingBlocks?.length ?? 0} dynamicTargets=${runResult.dynamicTargets?.length ?? 0}`);
  console.log('');

  console.log('=== Required Reachability ===');
  for (const [pc, label] of TRACKED_PCS) {
    const count = hits.get(pc) ?? 0;
    const first = firstHitSteps.has(pc) ? `firstStep=${firstHitSteps.get(pc)}` : 'firstStep=n/a';
    console.log(`${hex(pc)}  ${label.padEnd(31)} reached=${count > 0} hits=${count} ${first}`);
  }
  console.log('');

  console.log('=== Key Path Summary ===');
  console.log(`0x03FA09 reached: ${hits.get(0x03FA09) > 0}`);
  console.log(`0x003D5A reached: ${hits.get(0x003D5A) > 0}`);
  console.log(`0x040D40 reached: ${hits.get(0x040D40) > 0}`);
  console.log(`0x003A0F reached: ${hits.get(0x003A0F) > 0} (should be false)`);
  console.log('');

  if (eventLog.length > 0) {
    console.log('=== Event Log (first 80 tracked events) ===');
    for (const line of eventLog) {
      console.log(line);
    }
    console.log('');
  }

  console.log('=== Memory After Run ===');
  console.log(`D00587 (scan code) = ${hexByte(mem[KEY_SCAN_CODE_ADDR])}`);
  console.log(`D00080 (key flags) = ${hexByte(mem[KEY_AVAILABLE_FLAG_ADDR])} (bit3=${(mem[KEY_AVAILABLE_FLAG_ADDR] >> 3) & 1})`);
  console.log('');

  console.log('=== VRAM ===');
  console.log(`before checksum: ${hex(vramBefore, 8)}`);
  console.log(`after checksum:  ${hex(vramAfter, 8)}`);
  console.log(`changed: ${vramBefore !== vramAfter}`);
  console.log(`first ${VRAM_DUMP_SIZE} bytes at ${hex(VRAM_START)}:`);
  console.log(hexDump(mem, VRAM_START, VRAM_DUMP_SIZE));
  console.log('');

  console.log('=== Execution Termination ===');
  console.log(`steps=${runResult.steps}`);
  console.log(`termination=${runResult.termination}`);
  console.log(`why=${describeTermination(runResult)}`);
  console.log(`lastPc=${hex(runResult.lastPc)} lastMode=${runResult.lastMode}`);
  if (runResult.error) {
    console.log(`error=${runResult.error instanceof Error ? runResult.error.stack || runResult.error.message : String(runResult.error)}`);
  }
}

try {
  await main();
} catch (error) {
  console.error('Fatal error:', error.stack || error);
  process.exitCode = 1;
}

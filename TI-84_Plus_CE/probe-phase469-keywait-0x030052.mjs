#!/usr/bin/env node
// Phase 469: Key wait loop at 0x030052.
// The REAL key wait loop is 0x030052, not 0x030078.
// Loop structure:
//   0x030052: CALL 0x040D40  (system handler / key wait)
//   0x030056: BIT 3,(IY+0)   (test D00080 bit 3 = key available)
//   0x03005A: JR Z, 0x030052 (loop until key available)
//   0x03005C: CALL 0x03FA09  (key processor!)
//
// This probe injects ENTER key + sets D00088 bit 3 (SET 3,(IY+8) at 0x03004D)
// before entering the loop, then checks whether 0x03FA09 is reached.

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
const START_PC = 0x030052;
const MAX_RUN_STEPS = 500000;
const ENTER_SCAN_CODE = 0x09;
const ENTER_KEY_DOWN_CODE = 0x10;

const KEY_SCAN_CODE_ADDR = 0xD00587;
const KEY_AVAILABLE_FLAG_ADDR = 0xD00080;
const KEY_AVAILABLE_FLAG_MASK = 0x08;
const KEY_FLAGS_D00088 = 0xD00088;

const TRACKED_PCS = new Map([
  [0x030052, 'key wait loop entry'],
  [0x040D40, 'system handler (CALL target)'],
  [0x03FA09, 'key processor (TARGET!)'],
  [0x003D5A, '_GetCSC'],
  [0x003A0F, 'error handler (should NOT hit)'],
]);

function hex(value, width = 6) {
  if (value === undefined || value === null) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex(Number(value) & 0xFF, 2);
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

async function main() {
  console.log('=== Phase 469: Key Wait Loop at 0x030052 ===');
  console.log('Loop: 0x030052 CALL 0x040D40 -> BIT 3,(IY+0) -> JR Z,0x030052 -> CALL 0x03FA09');
  console.log('');

  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes);

  const peripherals = createPeripheralBus({
    timerInterrupt: false,
    timerInterval: 500,
  });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;
  cpu.mem = mem;

  // --- 3-stage boot with higher step limits ---

  console.log('--- Stage 1: Cold boot (0x000000 -> 0x0802B2) ---');
  resetCpuForBootStage(cpu, mem);
  cpu.pc = 0x000000;

  const boot1 = executor.runFrom(0x000000, 'z80', {
    maxSteps: 500000,
    maxLoopIterations: 500,
  });
  console.log(`stage1: steps=${boot1.steps} term=${boot1.termination} lastPc=${hex(boot1.lastPc)} mode=${boot1.lastMode}`);

  console.log('--- Stage 2: Post-init (0x0802B2 -> 0x020118) ---');
  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;
  resetCpuForBootStage(cpu, mem);

  const boot2 = executor.runFrom(0x0802B2, 'adl', {
    maxSteps: 500000,
    maxLoopIterations: 500,
  });
  console.log(`stage2: steps=${boot2.steps} term=${boot2.termination} lastPc=${hex(boot2.lastPc)} mode=${boot2.lastMode}`);

  console.log('--- Stage 3: OS init (0x020118 -> 0x021A3C) ---');
  resetCpuForBootStage(cpu, mem);

  const boot3 = executor.runFrom(0x020118, 'adl', {
    maxSteps: 2000000,
    maxLoopIterations: 2000,
  });
  console.log(`stage3: steps=${boot3.steps} term=${boot3.termination} lastPc=${hex(boot3.lastPc)} mode=${boot3.lastMode}`);
  console.log('');

  // --- Inject ENTER key ---

  console.log('--- Key Injection ---');

  mem[KEY_SCAN_CODE_ADDR] = ENTER_SCAN_CODE;
  mem[KEY_AVAILABLE_FLAG_ADDR] = (mem[KEY_AVAILABLE_FLAG_ADDR] | KEY_AVAILABLE_FLAG_MASK) & 0xFF;
  mem[KEY_FLAGS_D00088] = (mem[KEY_FLAGS_D00088] | 0x08) & 0xFF;

  if (typeof peripherals.setKeyPressed === 'function') {
    peripherals.setKeyPressed(mem, ENTER_SCAN_CODE);
    console.log(`setKeyPressed(mem, ${hexByte(ENTER_SCAN_CODE)})`);
  }

  if (typeof peripherals.keyDown === 'function') {
    peripherals.keyDown(ENTER_KEY_DOWN_CODE);
    console.log(`keyDown(${hexByte(ENTER_KEY_DOWN_CODE)})`);
  }

  console.log(`D00587 (scan code)  = ${hexByte(mem[KEY_SCAN_CODE_ADDR])}`);
  console.log(`D00080 (key flags)  = ${hexByte(mem[KEY_AVAILABLE_FLAG_ADDR])} (bit3=${(mem[KEY_AVAILABLE_FLAG_ADDR] >> 3) & 1})`);
  console.log(`D00088 (IY+8 flags) = ${hexByte(mem[KEY_FLAGS_D00088])} (bit3=${(mem[KEY_FLAGS_D00088] >> 3) & 1})`);
  console.log('');

  // --- Reset CPU state for the key wait loop ---

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  // --- Run from 0x030052 targeting 0x03FA09 ---

  console.log('--- Stage 4: Key wait loop 0x030052 -> 0x03FA09 ---');

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

  console.log(`run: steps=${runResult.steps} term=${runResult.termination} why=${describeTermination(runResult)}`);
  console.log(`lastPc=${hex(runResult.lastPc)} lastMode=${runResult.lastMode} halted=${runResult.halted}`);
  console.log(`loopsForced=${runResult.loopsForced ?? 0} missingBlocks=${runResult.missingBlocks?.length ?? 0} dynamicTargets=${runResult.dynamicTargets?.length ?? 0}`);
  console.log('');

  // --- Results ---

  console.log('=== Tracked Address Reachability ===');
  for (const [pc, label] of TRACKED_PCS) {
    const count = hits.get(pc) ?? 0;
    const first = firstHitSteps.has(pc) ? `firstStep=${firstHitSteps.get(pc)}` : 'firstStep=n/a';
    console.log(`${hex(pc)}  ${label.padEnd(35)} reached=${count > 0} hits=${count} ${first}`);
  }
  console.log('');

  console.log('=== Key Path Summary ===');
  console.log(`0x03FA09 key processor reached: ${hits.get(0x03FA09) > 0}`);
  console.log(`0x040D40 system handler reached: ${hits.get(0x040D40) > 0}`);
  console.log(`0x003D5A _GetCSC reached:        ${hits.get(0x003D5A) > 0}`);
  console.log(`0x003A0F error handler reached:   ${hits.get(0x003A0F) > 0} (should be false)`);
  console.log('');

  if (eventLog.length > 0) {
    console.log('=== Event Log (first 80 tracked events) ===');
    for (const line of eventLog) {
      console.log(line);
    }
    console.log('');
  }

  console.log('=== Memory After Run ===');
  console.log(`D00587 (scan code)  = ${hexByte(mem[KEY_SCAN_CODE_ADDR])}`);
  console.log(`D00080 (key flags)  = ${hexByte(mem[KEY_AVAILABLE_FLAG_ADDR])} (bit3=${(mem[KEY_AVAILABLE_FLAG_ADDR] >> 3) & 1})`);
  console.log(`D00088 (IY+8 flags) = ${hexByte(mem[KEY_FLAGS_D00088])} (bit3=${(mem[KEY_FLAGS_D00088] >> 3) & 1})`);
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

// Run through scripts/run-probe.mjs --max-time 180.
import fs from 'node:fs';
import { PRELIFTED_BLOCKS, decodeEmbeddedRom } from './ROM.transpiled.js';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { createParallelFlash } from './parallel-flash.js';

const memory = new Uint8Array(0x1000000);
memory.set(decodeEmbeddedRom());
const flash = createParallelFlash(memory);
const executor = createExecutor(PRELIFTED_BLOCKS, memory, {
  peripherals: createPeripheralBus({ pllDelay: 2, timerInterrupt: false, gpioValue: 0 }),
  strictExecution: true,
  liftMissingBlocks: true,
  flash,
});
const recent = [];
let firstFlashOperation = null;
const result = executor.runFrom(0, 'z80', {
  maxSteps: 1000000,
  maxLoopIterations: 131072,
  onBlock(pc, mode, meta) {
    const c = executor.cpu;
    if (!firstFlashOperation && flash.operations.length) {
      firstFlashOperation = { operation: flash.operations[0], precedingBlocks: [...recent] };
    }
    recent.push({ pc, mode, sp: c.sp, hl: c.hl, de: c.de, bc: c.bc, a: c.a, f: c.f,
      instructions: meta.instructions.map(instruction => instruction.dasm) });
    if (recent.length > 128) recent.shift();
  },
});
const { blockVisits, dynamicTargets, ...outcome } = result;
const report = { outcome, recent: recent.slice(-16), firstFlashOperation,
  distinctBlocks: Object.keys(blockVisits).length, dynamicTargets,
  flashOperations: flash.operations };
fs.writeFileSync(new URL('../logs/strict-boot.json', import.meta.url), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
// A diagnostic stop is not a successful OS boot. This probe reports execution,
// while the calculator/browser probes remain the functional pass/fail gates.
process.exitCode = ['halt', 'loop_limit', 'missing_block', 'max_steps'].includes(result.termination) ? 0 : 1;

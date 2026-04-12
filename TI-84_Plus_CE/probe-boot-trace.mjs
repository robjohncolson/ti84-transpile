#!/usr/bin/env node
// Trace the full boot path from reset vector, capturing the block-by-block
// execution order plus register state. Goal: find what decides to halt at
// 0x0019b5 instead of continuing to OS init.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { PRELIFTED_BLOCKS } from './ROM.transpiled.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));

const hex = (v, w = 6) => '0x' + (v >>> 0).toString(16).padStart(w, '0');

const p = createPeripheralBus({ trace: false, pllDelay: 2, timerInterrupt: false });
const mem = new Uint8Array(0x1000000);
mem.set(romBytes);
const ex = createExecutor(PRELIFTED_BLOCKS, mem, { peripherals: p });
const cpu = ex.cpu;

const trail = [];
const r = ex.runFrom(0x000000, 'z80', {
  maxSteps: 5000,
  maxLoopIterations: 32,
  onBlock: (pc, mode) => {
    trail.push(`${hex(pc)}:${mode} A=${hex(cpu.a, 2)} HL=${hex(cpu.hl)} DE=${hex(cpu.de)} BC=${hex(cpu.bc)} SP=${hex(cpu.sp)} madl=${cpu.madl}`);
  },
});

console.log(`Boot: ${r.steps} steps → ${r.termination} at ${hex(r.lastPc)}`);
console.log(`Full block trace (${trail.length} blocks):`);
trail.forEach((line, idx) => console.log(`  [${String(idx).padStart(3, ' ')}] ${line}`));

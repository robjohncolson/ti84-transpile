#!/usr/bin/env node
// Test what happens when calling 0x09a3bd (jump-table[250]) with maxSteps=10
// to identify why it stalls in the survey.

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

// Boot + OS init
ex.runFrom(0x000000, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
console.log(`Boot done. mbase=${hex(cpu.mbase, 2)}`);

cpu.halted = false;
cpu.iff1 = 0; cpu.iff2 = 0;
cpu.sp = 0xD1A87E;
cpu.sp -= 3;
mem[cpu.sp] = 0xFF; mem[cpu.sp + 1] = 0xFF; mem[cpu.sp + 2] = 0xFF;
ex.runFrom(0x08C331, 'adl', { maxSteps: 100000, maxLoopIterations: 500 });
console.log(`OS init done. mbase=${hex(cpu.mbase, 2)}`);

// Now call 0x09a3bd with maxSteps=10
cpu.halted = false;
cpu.iff1 = 0; cpu.iff2 = 0;
cpu.sp = 0xD1A87E;
cpu.a = 0;
cpu.bc = 0;
cpu.de = 0;
cpu.hl = 0;
cpu.sp -= 3;
mem[cpu.sp] = 0xFF; mem[cpu.sp + 1] = 0xFF; mem[cpu.sp + 2] = 0xFF;

console.log(`\nCalling 0x09a3bd with maxSteps=10...`);
const start = Date.now();
const trail = [];
const r = ex.runFrom(0x09a3bd, 'adl', {
  maxSteps: 10,
  maxLoopIterations: 100,
  onBlock: (pc) => trail.push(`${hex(pc)} A=${hex(cpu.a, 2)} HL=${hex(cpu.hl)} DE=${hex(cpu.de)} BC=${hex(cpu.bc)}`),
});
const elapsed = Date.now() - start;
console.log(`Result: ${r.steps} steps → ${r.termination} at ${hex(r.lastPc)} in ${elapsed}ms`);
console.log(`Trail:`);
for (const t of trail) console.log(`  ${t}`);

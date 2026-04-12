#!/usr/bin/env node
// Minimal test: run block 0x0008bb and verify HL after each instruction
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

const mem = new Uint8Array(0x1000000);
mem.set(romBytes);

console.log('ROM bytes at 0x020100:', Array.from(mem.slice(0x020100, 0x020108)).map(b=>b.toString(16).padStart(2,'0')).join(' '));
console.log('ROM bytes at 0x0008bb:', Array.from(mem.slice(0x0008bb, 0x0008c8)).map(b=>b.toString(16).padStart(2,'0')).join(' '));

const p = createPeripheralBus({ trace: false });
const ex = createExecutor(PRELIFTED_BLOCKS, mem, { peripherals: p });
const cpu = ex.cpu;

// Set HL to a known starting value so we can see which bytes change
cpu.hl = 0x123456;
cpu.bc = 0x789ABC;
cpu.sp = 0xD1A880;
cpu.madl = 1;
// Push return sentinel
cpu.sp -= 3;
mem[cpu.sp] = 0xFF; mem[cpu.sp + 1] = 0xFF; mem[cpu.sp + 2] = 0xFF;

console.log('\n--- Run 0x0008bb, runFrom mode=adl, madl=1 ---');
cpu.hl = 0x123456; cpu.bc = 0x789ABC; cpu.sp = 0xD1A880; cpu.madl = 1;
cpu.sp -= 3; mem[cpu.sp] = 0xFF; mem[cpu.sp + 1] = 0xFF; mem[cpu.sp + 2] = 0xFF;
const r1 = ex.runFrom(0x0008bb, 'adl', { maxSteps: 10, maxLoopIterations: 5 });
console.log(`Steps=${r1.steps} term=${r1.termination} HL=${hex(cpu.hl, 6)} madl=${cpu.madl}`);

console.log('\n--- Run 0x0008bb, runFrom mode=adl, madl=0 (mismatch!) ---');
cpu.hl = 0x123456; cpu.bc = 0x789ABC; cpu.sp = 0xD1A880; cpu.madl = 0;
cpu.sp -= 3; mem[cpu.sp] = 0xFF; mem[cpu.sp + 1] = 0xFF; mem[cpu.sp + 2] = 0xFF;
const r1b = ex.runFrom(0x0008bb, 'adl', { maxSteps: 10, maxLoopIterations: 5 });
console.log(`Steps=${r1b.steps} term=${r1b.termination} HL=${hex(cpu.hl, 6)} madl=${cpu.madl}`);

console.log('\n--- Run 0x0008bb, runFrom mode=z80, madl=0 ---');
cpu.hl = 0x123456; cpu.bc = 0x789ABC; cpu.sp = 0xD1A880; cpu.madl = 0;
cpu.sp -= 2; mem[cpu.sp] = 0xFF; mem[cpu.sp + 1] = 0xFF;
const r2 = ex.runFrom(0x0008bb, 'z80', { maxSteps: 10, maxLoopIterations: 5 });
console.log(`Steps=${r2.steps} term=${r2.termination} HL=${hex(cpu.hl, 6)} madl=${cpu.madl}`);

console.log('\n--- Check which block function exists ---');
const keys = Object.keys(PRELIFTED_BLOCKS).filter(k => k.startsWith('0008bb'));
console.log('Blocks at 0x0008bb:', keys);

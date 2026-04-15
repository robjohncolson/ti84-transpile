#!/usr/bin/env node
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
const BACKUP_BUF = 0xD02EC7;
const DISPLAY_BUF = 0xD006C0;
const BUF_LEN = 260;
const RESTORE_ENTRY = 0x088720;

const mem = new Uint8Array(MEM_SIZE);
mem.set(romBytes);

// Cold boot + kernel init (same pattern as golden regression)
const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
const executor = createExecutor(BLOCKS, mem, { peripherals });
const cpu = executor.cpu;

executor.runFrom(0x000000, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
cpu.halted = false;
cpu.iff1 = 0;
cpu.iff2 = 0;
cpu.sp = 0xD1A87E - 3;
mem.fill(0xFF, cpu.sp, 3);

executor.runFrom(0x08C331, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 });
cpu.mbase = 0xD0;
cpu._iy = 0xD00080;
cpu._hl = 0;
cpu.halted = false;
cpu.iff1 = 0;
cpu.iff2 = 0;
cpu.sp = 0xD1A87E - 3;
mem.fill(0xFF, cpu.sp, 3);

executor.runFrom(0x0802B2, 'adl', { maxSteps: 100, maxLoopIterations: 32 });

console.log('=== Phase 179 - Restore Path Test ===');

const hasBlock = BLOCKS['088720:adl'] !== undefined || BLOCKS['0x088720:adl'] !== undefined;
console.log(`Block 0x088720:adl exists: ${hasBlock}`);

const testText = 'Normal Float Radian       ';
for (let index = 0; index < testText.length; index++) {
  mem[BACKUP_BUF + index] = testText.charCodeAt(index);
}

for (let index = testText.length; index < BUF_LEN; index++) {
  mem[BACKUP_BUF + index] = 0x20;
}

console.log(`Seeded backup buffer at 0x${BACKUP_BUF.toString(16)} with "${testText.substring(0, 26)}..."`);

const beforeSlice = Array.from(mem.slice(DISPLAY_BUF, DISPLAY_BUF + 26));
const beforeText = beforeSlice
  .map((byte) => (byte >= 0x20 && byte < 0x7F ? String.fromCharCode(byte) : '.'))
  .join('');
console.log(`Display buffer BEFORE: [${beforeSlice.map((byte) => `0x${byte.toString(16).padStart(2, '0')}`).join(',')}]`);
console.log(`Display buffer text BEFORE: "${beforeText}"`);

cpu.halted = false;
cpu.iff1 = 0;
cpu.iff2 = 0;
cpu.sp = 0xD1A87E - 12;
mem.fill(0xFF, cpu.sp, 12);
cpu.mbase = 0xD0;
cpu._iy = 0xD00080;
cpu.f = 0x40;

// Block 088720:adl starts at LD DE — HL must be preset to the backup buffer source
// (the LD HL,0xD02EC7 at 0x08871c is in the preceding block 08871b:adl)
cpu.hl = BACKUP_BUF;

const result = executor.runFrom(RESTORE_ENTRY, 'adl', { maxSteps: 5000, maxLoopIterations: 500 });
console.log(
  `Restore: steps=${result.steps} term=${result.termination} lastPc=0x${(result.lastPc >>> 0).toString(16).padStart(6, '0')}`,
);

const afterSlice = Array.from(mem.slice(DISPLAY_BUF, DISPLAY_BUF + 26));
const afterText = afterSlice
  .map((byte) => (byte >= 0x20 && byte < 0x7F ? String.fromCharCode(byte) : '.'))
  .join('');
console.log(`Display buffer AFTER: [${afterSlice.map((byte) => `0x${byte.toString(16).padStart(2, '0')}`).join(',')}]`);
console.log(`Display buffer text AFTER: "${afterText}"`);

const bytesChanged = afterSlice.filter((byte, index) => byte !== beforeSlice[index]).length;
console.log(`Bytes changed: ${bytesChanged}/26`);

if (afterText.startsWith('Normal Float Radian')) {
  console.log('VERDICT: RESTORE_PATH_WORKS - display buffer populated from backup');
} else if (bytesChanged > 0) {
  console.log('VERDICT: PARTIAL - some bytes changed but text not matching');
} else {
  console.log('VERDICT: RESTORE_PATH_FAILED - display buffer unchanged');
}

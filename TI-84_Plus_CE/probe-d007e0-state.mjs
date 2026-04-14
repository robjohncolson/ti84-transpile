#!/usr/bin/env node
// Phase 42 — investigate (0xd007e0) menu-mode byte after OS init.
// Goal: identify the default screen via the 0x96e5c dispatcher.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const romPath = path.join(__dirname, 'ROM.rom');
const transpiledPath = path.join(__dirname, 'ROM.transpiled.js');
const romBytes = fs.readFileSync(romPath);

const BOOT_ENTRY = 0x000000;
const OS_INIT_ENTRY = 0x08C331;

const hex = (v, w = 6) => `0x${(v >>> 0).toString(16).padStart(w, '0')}`;
const hex2 = (v) => `0x${(v & 0xff).toString(16).padStart(2, '0')}`;

async function loadBlocks() {
  if (!fs.existsSync(transpiledPath)) {
    const r = spawnSync(process.execPath, [path.join(repoRoot, 'scripts', 'transpile-ti84-rom.mjs')], { cwd: repoRoot, stdio: 'inherit' });
    if (r.status !== 0) process.exit(r.status ?? 1);
  }
  const mod = await import(pathToFileURL(transpiledPath).href);
  return mod.PRELIFTED_BLOCKS;
}

function fillSentinel(mem, start, bytes) { mem.fill(0xff, start, start + bytes); }

async function main() {
  const blocks = await loadBlocks();
  const peripherals = createPeripheralBus({ trace: false, pllDelay: 2, timerInterrupt: false });
  const mem = new Uint8Array(0x1000000);
  mem.set(romBytes);
  const ex = createExecutor(blocks, mem, { peripherals });
  const cpu = ex.cpu;

  console.log('=== Phase 42 — (0xd007e0) state probe ===');

  // Boot
  const boot = ex.runFrom(BOOT_ENTRY, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
  console.log(`boot: ${boot.steps} steps -> ${boot.termination} at ${hex(boot.lastPc)}`);

  // OS init
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu.sp = 0xD1A87E - 3; fillSentinel(mem, cpu.sp, 3);
  const init = ex.runFrom(OS_INIT_ENTRY, 'adl', { maxSteps: 100000, maxLoopIterations: 500 });
  console.log(`os init: ${init.steps} steps -> ${init.termination} at ${hex(init.lastPc)}`);

  // Dump (0xd007e0) area
  console.log('');
  console.log('mem[0xd007d0..0xd00800] (48 bytes around 0xd007e0):');
  for (let row = 0; row < 3; row++) {
    const base = 0xd007d0 + row * 16;
    let line = `${hex(base)}: `;
    for (let i = 0; i < 16; i++) line += hex2(mem[base + i]).slice(2) + ' ';
    line += ' | ';
    for (let i = 0; i < 16; i++) {
      const c = mem[base + i];
      line += (c >= 0x20 && c < 0x7f) ? String.fromCharCode(c) : '.';
    }
    console.log(line);
  }

  console.log('');
  console.log(`>>> mem[0xd007e0] = ${hex2(mem[0xd007e0])} (the menu-mode byte)`);

  // Disassemble 0x96e5c switch table by reading raw ROM
  console.log('');
  console.log('=== 0x96e5c dispatcher disassembly (raw bytes) ===');
  const start = 0x096e5c;
  for (let pc = start; pc < start + 80; pc++) {
    const b = romBytes[pc];
    const next = romBytes[pc + 1];
    process.stdout.write(`${hex(pc)}: ${hex2(b).slice(2)}`);
    if (b === 0xfe) {
      // CP n
      console.log(` cp ${hex2(next)}`);
      pc++;
    } else if (b === 0xc3) {
      // JP nnnnnn (3 bytes in ADL)
      const target = romBytes[pc+1] | (romBytes[pc+2]<<8) | (romBytes[pc+3]<<16);
      console.log(` jp ${hex(target)}`);
      pc += 3;
    } else if (b === 0xca) {
      // JP Z, nnnnnn
      const target = romBytes[pc+1] | (romBytes[pc+2]<<8) | (romBytes[pc+3]<<16);
      console.log(` jp z, ${hex(target)}`);
      pc += 3;
    } else if (b === 0xc2) {
      const target = romBytes[pc+1] | (romBytes[pc+2]<<8) | (romBytes[pc+3]<<16);
      console.log(` jp nz, ${hex(target)}`);
      pc += 3;
    } else if (b === 0x3a) {
      // LD A, (nnnnnn)
      const addr = romBytes[pc+1] | (romBytes[pc+2]<<8) | (romBytes[pc+3]<<16);
      console.log(` ld a, (${hex(addr)})`);
      pc += 3;
    } else if (b === 0xcd) {
      const target = romBytes[pc+1] | (romBytes[pc+2]<<8) | (romBytes[pc+3]<<16);
      console.log(` call ${hex(target)}`);
      pc += 3;
    } else {
      console.log('');
    }
  }
}

await main();

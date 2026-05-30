#!/usr/bin/env node
// Phase 466: Map D17744 — spinning wait cursor phase counter
//
// D17744 is a 2-bit counter (0-3) indexing a 4-byte table at 0x0017D9:
//   { 0x7C='|', 0x2F='/', 0x2D='-', 0x5C='\' }
// The classic rotating wait animation. 0x0017DD increments it mod 4
// and passes the glyph to display output function 0x0059C6.

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

// Addresses
const PHASE_TABLE_ADDR = 0x0017D9;
const PHASE_FUNC_ADDR = 0x0017DD;
const DISPLAY_OUTPUT_ADDR = 0x0059C6;
const PHASE_COUNTER_ADDR = 0xD17744;
const ROM_SCAN_LIMIT = 0x400000;

// Boot constants
const BOOT_ENTRY = 0x000000;
const STACK_RESET_TOP = 0xD1A87E;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;

function hex(value, width = 6) {
  if (value === undefined || value === null) return 'n/a';
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hex8(value) {
  return hex(value & 0xFF, 2);
}

function printableAscii(value) {
  if (value < 0x20 || value > 0x7E) return 'not printable';
  const ch = String.fromCharCode(value);
  return ch === '\\' ? "'\\''" : `'${ch}'`;
}

async function main() {
  console.log('=== Phase 466: Map D17744 — Spinning Wait Cursor Phase Counter ===');
  console.log('');

  // ---------------------------------------------------------------
  // Part 1: Table and function disassembly
  // ---------------------------------------------------------------
  console.log('--- Part 1: Table at 0x0017D9 and function at 0x0017DD ---');
  console.log('');

  const tableBytes = [
    romBytes[PHASE_TABLE_ADDR],
    romBytes[PHASE_TABLE_ADDR + 1],
    romBytes[PHASE_TABLE_ADDR + 2],
    romBytes[PHASE_TABLE_ADDR + 3],
  ];
  console.log('4-byte spinning cursor table at 0x0017D9:');
  for (let i = 0; i < 4; i++) {
    const b = tableBytes[i];
    console.log(`  phase ${i}: ${hex8(b)} = ASCII ${printableAscii(b)}`);
  }
  console.log('');
  console.log('Expected: | / - \\ forming a classic rotating wait animation.');
  console.log('');

  // Hex dump of display refresh function at 0x0017DD (32 bytes)
  console.log('ROM hex dump at 0x0017DD (display refresh function), 32 bytes:');
  const funcBytes = romBytes.subarray(PHASE_FUNC_ADDR, PHASE_FUNC_ADDR + 32);
  const hexParts = [];
  for (let i = 0; i < funcBytes.length; i++) {
    hexParts.push(hex8(funcBytes[i]).slice(2));
  }
  console.log(`  ${hex(PHASE_FUNC_ADDR)}: ${hexParts.join(' ')}`);
  console.log('');

  // ---------------------------------------------------------------
  // Part 2: Search for D17744 references in ROM
  // ---------------------------------------------------------------
  console.log('--- Part 2: ROM references to D17744 (little-endian 44 77 D1) ---');
  console.log('');

  const target = [0x44, 0x77, 0xD1];
  let refCount = 0;

  for (let addr = 0; addr <= ROM_SCAN_LIMIT - 3; addr++) {
    if (romBytes[addr] === target[0] &&
        romBytes[addr + 1] === target[1] &&
        romBytes[addr + 2] === target[2]) {
      refCount++;

      // Context: 4 bytes before, 3 match bytes, 4 bytes after
      const beforeStart = Math.max(0, addr - 4);
      const afterEnd = Math.min(romBytes.length, addr + 3 + 4);
      const contextParts = [];
      for (let i = beforeStart; i < afterEnd; i++) {
        const byteStr = hex8(romBytes[i]).slice(2);
        if (i >= addr && i < addr + 3) {
          contextParts.push(`[${byteStr}]`);
        } else {
          contextParts.push(byteStr);
        }
      }

      // Classify: check preceding opcode
      const prevByte = addr > 0 ? romBytes[addr - 1] : 0;
      let accessType = 'unknown';
      if (prevByte === 0x3A) accessType = 'read (LD A,(nn))';
      else if (prevByte === 0x32) accessType = 'write (LD (nn),A)';
      else if (prevByte === 0x2A) accessType = 'read (LD HL,(nn))';
      else if (prevByte === 0x22) accessType = 'write (LD (nn),HL)';
      else if (prevByte === 0x21) accessType = 'address literal (LD HL,nn)';
      else if (prevByte === 0x01) accessType = 'address literal (LD BC,nn)';
      else if (prevByte === 0x11) accessType = 'address literal (LD DE,nn)';
      else if (prevByte === 0xCD) accessType = 'call target (CALL nn)';
      else if (prevByte === 0xC3) accessType = 'jump target (JP nn)';

      console.log(`  Match at ${hex(addr)}: ${contextParts.join(' ')}  -> ${accessType}`);
    }
  }
  console.log(`  Total matches: ${refCount}`);
  console.log('');

  // ---------------------------------------------------------------
  // Part 3: Boot and test display phase cycle
  // ---------------------------------------------------------------
  console.log('--- Part 3: Boot and test display phase cycle ---');
  console.log('');

  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes);

  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  // Stage 1: Cold boot
  const bootResult = executor.runFrom(BOOT_ENTRY, 'z80', {
    maxSteps: 20000,
    maxLoopIterations: 32,
  });
  console.log(`Stage 1 boot: steps=${bootResult.steps} term=${bootResult.termination}`);

  // Reset CPU state between stages
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  // Stage 2: Kernel init
  const kernelResult = executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
    maxSteps: 100000,
    maxLoopIterations: 10000,
  });
  console.log(`Stage 2 kernel: steps=${kernelResult.steps} term=${kernelResult.termination}`);

  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  // Stage 3: Post-init
  const postInitResult = executor.runFrom(POST_INIT_ENTRY, 'adl', {
    maxSteps: 100,
    maxLoopIterations: 32,
  });
  console.log(`Stage 3 post-init: steps=${postInitResult.steps} term=${postInitResult.termination}`);

  // Post-boot setup
  mem[0xD177BA] = 0x7F;
  console.log('');

  // Call 0x0017DD four times, tracking phase counter changes
  console.log('Calling 0x0017DD four times to cycle through cursor phases:');
  console.log('');

  let displayOutputHits = 0;

  for (let i = 0; i < 4; i++) {
    const beforeVal = mem[PHASE_COUNTER_ADDR];
    console.log(`  Call ${i + 1}: D17744 before = ${hex8(beforeVal)} (phase ${beforeVal & 0x03})`);

    // Track if 0x0059C6 is hit
    let hit0059C6 = false;

    const result = executor.runFrom(PHASE_FUNC_ADDR, 'adl', {
      maxSteps: 200,
      maxLoopIterations: 50,
      onBlock(pc) {
        if ((pc & 0xFFFFFF) === DISPLAY_OUTPUT_ADDR) {
          hit0059C6 = true;
          displayOutputHits++;
        }
      },
    });

    const afterVal = mem[PHASE_COUNTER_ADDR];
    const glyphIdx = afterVal & 0x03;
    const glyph = tableBytes[glyphIdx];

    console.log(`           D17744 after  = ${hex8(afterVal)} (phase ${glyphIdx})`);
    console.log(`           glyph = ${hex8(glyph)} ${printableAscii(glyph)}`);
    console.log(`           0x0059C6 hit = ${hit0059C6 ? 'YES' : 'NO'}`);
    console.log(`           steps=${result.steps} term=${result.termination}`);
    console.log('');
  }

  console.log(`Total 0x0059C6 display output hits: ${displayOutputHits}`);
  console.log('');

  // ---------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------
  console.log('=== Summary ===');
  console.log(
    'D17744 is a 2-bit spinning cursor phase counter. The 4 values | / - \\ form the classic ' +
    'rotating wait animation. It is incremented mod 4 by 0x0017DD and passed to display ' +
    'output function 0x0059C6.'
  );
}

try {
  await main();
} catch (error) {
  console.error('Fatal error:', error.stack || error);
  process.exitCode = 1;
}

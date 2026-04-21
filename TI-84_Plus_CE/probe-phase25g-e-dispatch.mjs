#!/usr/bin/env node
// Phase 25G-e: Investigate how the OS dispatches to 0x00B608
// Three parts:
//   1. Dump the rst 0x28 handler block
//   2. Search all blocks for references to the 0xAD-0xB6 range
//   3. Dynamic test — execute from 0x00ADB9 with FP workspace

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const blocks = romModule.PRELIFTED_BLOCKS;
const memory = new Uint8Array(0x1000000);
memory.set(romBytes);
const peripherals = createPeripheralBus({ timerInterrupt: false, pllDelay: 2 });
const executor = createExecutor(blocks, memory, { peripherals });
const cpu = executor.cpu;

function hex(v, w = 6) {
  return '0x' + (v >>> 0).toString(16).padStart(w, '0');
}

function write24(mem, addr, value) {
  mem[addr] = value & 0xFF;
  mem[addr + 1] = (value >> 8) & 0xFF;
  mem[addr + 2] = (value >> 16) & 0xFF;
}

// =========================================================================
// Part 1: Dump the rst 0x28 handler
// =========================================================================
console.log('=== Part 1: rst 0x28 handler ===\n');

const sampleKeys = Object.keys(blocks).slice(0, 10);
console.log('Sample block keys:', sampleKeys);

let foundRst28 = false;
for (const [key, block] of Object.entries(blocks)) {
  if (key.startsWith('000028')) {
    foundRst28 = true;
    console.log(`\nFound rst 0x28 handler: ${key}`);
    if (typeof block === 'function') {
      console.log('Block is a function. Source:');
      console.log(block.toString().slice(0, 2000));
    } else if (block.source) {
      console.log(block.source.slice(0, 2000));
    } else {
      console.log(JSON.stringify(block).slice(0, 2000));
    }
  }
}
if (!foundRst28) {
  console.log('rst 0x28 handler not found in blocks. Checking nearby addresses...');
  for (const [key] of Object.entries(blocks)) {
    const addr = parseInt(key.split(':')[0], 16);
    if (addr >= 0x20 && addr <= 0x40) {
      console.log(`  Near-vector block: ${key}`);
    }
  }
}

// =========================================================================
// Part 2: Search for references to 0xAD-0xB6 range
// =========================================================================
console.log('\n=== Part 2: Block references to 0x00AD-0x00B6 range ===\n');

const targetPattern = /return 0x00(?:ad|ae|af|b[0-6])/i;
const jpHlPattern = /jp\s*\(\s*(?:hl|ix|iy)\s*\)/i;
let callerCount = 0;
let indirectCount = 0;

for (const [key, block] of Object.entries(blocks)) {
  let src = '';
  if (typeof block === 'function') {
    src = block.toString();
  } else if (block.source) {
    src = block.source;
  } else {
    continue;
  }

  if (targetPattern.test(src)) {
    callerCount++;
    const match = src.match(targetPattern);
    console.log(`Caller: ${key} -> ${match?.[0]}`);
    // Show a bit of context around the match
    const idx = src.indexOf(match[0]);
    const contextStart = Math.max(0, idx - 80);
    const contextEnd = Math.min(src.length, idx + match[0].length + 80);
    console.log(`  context: ...${src.slice(contextStart, contextEnd)}...`);
  }
}

// Also search for any block that calls into 0x00ADxx-0x00B6xx via call patterns
const callPattern = /(?:call|jp)\s+0x00(?:ad|ae|af|b[0-6])\w*/i;
const callReturnPattern = /0x00(?:ad|ae|af|b[0-6])[0-9a-f]*/gi;

console.log(`\nDirect return references found: ${callerCount}`);

// Search for call-like references in block source
let callRefCount = 0;
for (const [key, block] of Object.entries(blocks)) {
  let src = '';
  if (typeof block === 'function') {
    src = block.toString();
  } else if (block.source) {
    src = block.source;
  } else {
    continue;
  }

  const matches = src.match(callReturnPattern);
  if (matches) {
    // Filter to only those in the target range
    for (const m of matches) {
      const addr = parseInt(m.slice(2), 16); // strip 0x
      if (addr >= 0x00AD00 && addr <= 0x00B6FF) {
        callRefCount++;
        if (callRefCount <= 30) {
          console.log(`Ref in ${key}: ${m}`);
        }
      }
    }
  }
}
console.log(`Total references to 0x00AD00-0x00B6FF range: ${callRefCount}`);

// Search for indirect jumps
console.log('\nBlocks with indirect jumps (jp (hl), jp (ix), jp (iy)):');
let indirectJumpCount = 0;
for (const [key, block] of Object.entries(blocks)) {
  let src = '';
  if (typeof block === 'function') {
    src = block.toString();
  } else if (block.source) {
    src = block.source;
  } else {
    continue;
  }

  // Look for patterns like cpu._hl or cpu._ix used as jump targets
  if (/return cpu\._hl\b/.test(src) || /return cpu\._ix\b/.test(src) || /return cpu\._iy\b/.test(src)) {
    indirectJumpCount++;
    if (indirectJumpCount <= 20) {
      const addr = parseInt(key.split(':')[0], 16);
      console.log(`  ${key} (indirect jump via register)`);
    }
  }
}
console.log(`Total blocks with indirect register jumps: ${indirectJumpCount}`);

// =========================================================================
// Part 3: Dynamic test — execute from 0x00ADB9
// =========================================================================
console.log('\n=== Part 3: Dynamic execution from 0x00ADB9 ===\n');

// First, do a short OS boot to initialize RAM
console.log('Booting OS (5000 steps)...');
const bootResult = executor.runFrom(0x000000, 'adl', {
  maxSteps: 5000,
  maxLoopIterations: 100,
});
console.log(`Boot: ${bootResult.steps} steps, termination: ${bootResult.termination}`);

// Set up FP workspace pointers with plausible values
const FP_STACK_BASE = 0xD17700;
write24(memory, 0xD176AB, FP_STACK_BASE);     // FP stack base
write24(memory, 0xD1770A, FP_STACK_BASE);     // FP pointer
write24(memory, 0xD17716, FP_STACK_BASE + 8); // FP workspace ptr
write24(memory, 0xD1771A, 0);
write24(memory, 0xD1772A, 0);

// Set up some FP data at the stack base (9-byte TI float: type byte + 8 data)
// A simple float: positive, exponent 0x80 = 1.0
memory[FP_STACK_BASE + 0] = 0x00; // type: real
memory[FP_STACK_BASE + 1] = 0x80; // exponent (biased)
memory[FP_STACK_BASE + 2] = 0x10; // mantissa BCD: 1.0
for (let i = 3; i < 9; i++) memory[FP_STACK_BASE + i] = 0x00;

// Second FP number at +9
memory[FP_STACK_BASE + 9] = 0x00;
memory[FP_STACK_BASE + 10] = 0x80;
memory[FP_STACK_BASE + 11] = 0x20; // mantissa BCD: 2.0
for (let i = 12; i < 18; i++) memory[FP_STACK_BASE + i] = 0x00;

cpu.sp = 0xD1A87E;
cpu._ix = 0xD1A860;
cpu.madl = 1;

// Push a sentinel return address (0x000000 will hit reset vector)
cpu.sp -= 3;
write24(memory, cpu.sp, 0x000000);

let reached_B608 = false;
const trace = [];

console.log('Running from 0x00ADB9...');
const result = executor.runFrom(0x00ADB9, 'adl', {
  maxSteps: 5000,
  maxLoopIterations: 100,
  onBlock(pc, mode, meta, step) {
    const dasm = meta?.instructions?.[0]?.dasm ?? '???';
    if (step < 80) {
      trace.push(`[${step}] ${hex(pc)}:${mode} ${dasm}`);
    }
    if (pc === 0x00B608) {
      reached_B608 = true;
      console.log(`*** REACHED 0x00B608 at step ${step} ***`);
    }
  },
  onMissingBlock(pc, mode, step) {
    trace.push(`[missing ${step}] ${hex(pc)}:${mode}`);
    console.log(`[missing ${step}] ${hex(pc)}:${mode}`);
  },
  onLoopBreak(pc, mode, count, target) {
    trace.push(`[loop-break ${count}] ${hex(pc)}:${mode} -> ${target ? hex(target) : 'flag'}`);
  },
});

console.log('\nExecution trace:');
for (const line of trace) {
  console.log(line);
}

console.log(`\nResult: ${result.steps} steps, termination: ${result.termination}`);
console.log(`Reached 0x00B608: ${reached_B608}`);
if (result.missingBlocks?.size > 0) {
  console.log('Missing blocks:', [...result.missingBlocks].join(', '));
}

// =========================================================================
// Also try from 0x00ADEF (the rst 0x28 entry) to see the full chain
// =========================================================================
console.log('\n=== Part 3b: Dynamic execution from 0x00ADEF (rst 0x28 site) ===\n');

// Re-setup
write24(memory, 0xD176AB, FP_STACK_BASE);
write24(memory, 0xD1770A, FP_STACK_BASE);
write24(memory, 0xD17716, FP_STACK_BASE + 8);
write24(memory, 0xD1771A, 0);
write24(memory, 0xD1772A, 0);

cpu.sp = 0xD1A87E;
cpu._ix = 0xD1A860;
cpu.madl = 1;
cpu.sp -= 3;
write24(memory, cpu.sp, 0x000000);

let reached_B608_v2 = false;
const trace2 = [];

console.log('Running from 0x00ADEF...');
const result2 = executor.runFrom(0x00ADEF, 'adl', {
  maxSteps: 5000,
  maxLoopIterations: 100,
  onBlock(pc, mode, meta, step) {
    const dasm = meta?.instructions?.[0]?.dasm ?? '???';
    if (step < 80) {
      trace2.push(`[${step}] ${hex(pc)}:${mode} ${dasm}`);
    }
    if (pc === 0x00B608) {
      reached_B608_v2 = true;
      console.log(`*** REACHED 0x00B608 at step ${step} ***`);
    }
  },
  onMissingBlock(pc, mode, step) {
    trace2.push(`[missing ${step}] ${hex(pc)}:${mode}`);
  },
});

console.log('\nExecution trace:');
for (const line of trace2) {
  console.log(line);
}

console.log(`\nResult: ${result2.steps} steps, termination: ${result2.termination}`);
console.log(`Reached 0x00B608: ${reached_B608_v2}`);

console.log('\n=== Phase 25G-e probe complete ===');

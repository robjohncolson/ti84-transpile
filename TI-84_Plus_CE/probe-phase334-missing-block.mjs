#!/usr/bin/env node
/**
 * Phase 334 — Investigate Missing Block at 0xFB65ED
 *
 * Session 333 traced the no-scale glyph renderer path and found it
 * terminates at a missing block at 0xFB65ED. This address is OUTSIDE
 * the ROM range (ROM ends at 0x3FFFFF). This probe investigates:
 *
 * 1. What bytes are at 0xFB65ED in memory after boot
 * 2. Disassembly of block 0x052508 (last known block before missing)
 * 3. Disassembly of block 0x05248E (predecessor)
 * 4. Trace from 0x053573 to confirm the path and capture registers
 * 5. Register state at the point of the missing_block termination
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

// ─── Constants ──────────────────────────────────────────────────────────────

const MEM_SIZE = 0x1000000;
const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const STACK_RESET_TOP = 0xD1A87E;
const STAGE_ENTRIES = [0x0A2B72, 0x0A3301, 0x0A29EC, 0x0A2854];
const VRAM_BASE = 0xD40000;
const VRAM_WIDTH = 320;

const FONT_BASE = 0x0040EE;
const GLYPH_STRIDE = 28;

const RAM_SCALE_LEVEL = 0xD005EC;
const RAM_FONT_CONFIG = 0xD005ED;
const RAM_SCALE_PTR = 0xD005F0;

const MISSING_ADDR = 0xFB65ED;

function hex(v, w = 6) {
  if (v === undefined || v === null) return 'n/a';
  return `0x${(v >>> 0).toString(16).padStart(w, '0')}`;
}

function read24(buf, off) {
  return buf[off] | (buf[off + 1] << 8) | (buf[off + 2] << 16);
}

function write24(buf, off, val) {
  buf[off] = val & 0xFF;
  buf[off + 1] = (val >> 8) & 0xFF;
  buf[off + 2] = (val >> 16) & 0xFF;
}

// ─── 1. Boot ────────────────────────────────────────────────────────────────

console.log('=== Phase 334 — Investigate Missing Block 0xFB65ED ===\n');

const mem = new Uint8Array(MEM_SIZE);
mem.set(romBytes);
mem.fill(0xAA, VRAM_BASE, VRAM_BASE + 320 * 240 * 2);

const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
const executor = createExecutor(BLOCKS, mem, { peripherals });
const cpu = executor.cpu;

// Cold boot
executor.runFrom(BOOT_ENTRY, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0; cpu.sp = STACK_RESET_TOP - 3;
mem.fill(0xFF, cpu.sp, cpu.sp + 3);

executor.runFrom(KERNEL_INIT_ENTRY, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 });
cpu.mbase = 0xD0; cpu._iy = 0xD00080; cpu._hl = 0;
cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0; cpu.sp = STACK_RESET_TOP - 3;
mem.fill(0xFF, cpu.sp, cpu.sp + 3);

executor.runFrom(POST_INIT_ENTRY, 'adl', { maxSteps: 100, maxLoopIterations: 32 });

for (const entry of STAGE_ENTRIES) {
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu._iy = 0xD00080; cpu.f = 0x40; cpu._ix = 0xD1A860;
  cpu.sp = STACK_RESET_TOP - 12;
  mem.fill(0xFF, cpu.sp, cpu.sp + 12);
  executor.runFrom(entry, 'adl', { maxSteps: 50000, maxLoopIterations: 500 });
}

console.log('Boot complete.\n');

// ─── 2. Check what's at 0xFB65ED in memory ──────────────────────────────────

console.log('--- Step 2: Memory at 0xFB65ED (8 bytes) ---');
if (MISSING_ADDR + 8 <= MEM_SIZE) {
  const bytes = [];
  for (let i = 0; i < 8; i++) {
    bytes.push(mem[MISSING_ADDR + i].toString(16).padStart(2, '0'));
  }
  console.log(`  ${hex(MISSING_ADDR)}: ${bytes.join(' ')}`);
} else {
  console.log(`  Address ${hex(MISSING_ADDR)} is beyond MEM_SIZE (${hex(MEM_SIZE)})`);
  // Still try to read with masking
  const maskedAddr = MISSING_ADDR & 0xFFFFFF;
  if (maskedAddr + 8 <= MEM_SIZE) {
    const bytes = [];
    for (let i = 0; i < 8; i++) {
      bytes.push(mem[maskedAddr + i].toString(16).padStart(2, '0'));
    }
    console.log(`  Masked to ${hex(maskedAddr)}: ${bytes.join(' ')}`);
  }
}

// Check if 0xFB65ED is in any known address range
console.log(`\n  Address analysis:`);
console.log(`    ROM range:  0x000000 - 0x3FFFFF  -> ${MISSING_ADDR <= 0x3FFFFF ? 'IN' : 'OUT'}`);
console.log(`    RAM range:  0xD00000 - 0xD65800  -> ${MISSING_ADDR >= 0xD00000 && MISSING_ADDR <= 0xD65800 ? 'IN' : 'OUT'}`);
console.log(`    VRAM range: 0xD40000 - 0xD52C00  -> ${MISSING_ADDR >= 0xD40000 && MISSING_ADDR <= 0xD52C00 ? 'IN' : 'OUT'}`);
console.log(`    Flash range:0xFC0000 - 0xFFFFFF  -> ${MISSING_ADDR >= 0xFC0000 ? 'IN' : 'OUT'}`);
console.log(`    24-bit:     ${hex(MISSING_ADDR & 0xFFFFFF)}`);
console.log('');

// ─── 3. Disassemble ROM at 0x052508 (last known block) ─────────────────────

console.log('--- Step 3: Raw ROM bytes at 0x052508 (48 bytes) ---');
{
  const addr = 0x052508;
  const bytes = [];
  for (let i = 0; i < 48; i++) {
    bytes.push(romBytes[addr + i].toString(16).padStart(2, '0'));
  }
  // Print in rows of 16
  for (let i = 0; i < 48; i += 16) {
    const chunk = bytes.slice(i, Math.min(i + 16, 48));
    console.log(`  ${hex(addr + i)}: ${chunk.join(' ')}`);
  }

  // Look for exit instructions
  console.log('\n  Scanning for exit instructions:');
  for (let i = 0; i < 48; i++) {
    const b = romBytes[addr + i];
    if (b === 0xE9) {
      console.log(`    Offset +${i}: 0xE9 = JP (HL)`);
    }
    if (b === 0xC9) {
      console.log(`    Offset +${i}: 0xC9 = RET`);
    }
    if (b === 0xC3 && i + 3 < 48) {
      const target = romBytes[addr + i + 1] | (romBytes[addr + i + 2] << 8) | (romBytes[addr + i + 3] << 16);
      console.log(`    Offset +${i}: 0xC3 = JP ${hex(target)} (ADL 3-byte addr)`);
    }
    if (b === 0xCD && i + 3 < 48) {
      const target = romBytes[addr + i + 1] | (romBytes[addr + i + 2] << 8) | (romBytes[addr + i + 3] << 16);
      console.log(`    Offset +${i}: 0xCD = CALL ${hex(target)} (ADL 3-byte addr)`);
    }
    if (b === 0xED && i + 1 < 48 && romBytes[addr + i + 1] === 0x49) {
      console.log(`    Offset +${i}: 0xED 0x49 = JP (HL) (eZ80 prefix)`);
    }
    // Check for conditional returns
    if (b === 0xC0) console.log(`    Offset +${i}: 0xC0 = RET NZ`);
    if (b === 0xC8) console.log(`    Offset +${i}: 0xC8 = RET Z`);
    if (b === 0xD0) console.log(`    Offset +${i}: 0xD0 = RET NC`);
    if (b === 0xD8) console.log(`    Offset +${i}: 0xD8 = RET C`);
    if (b === 0xE0) console.log(`    Offset +${i}: 0xE0 = RET PO`);
    if (b === 0xE8) console.log(`    Offset +${i}: 0xE8 = RET PE`);
    if (b === 0xF0) console.log(`    Offset +${i}: 0xF0 = RET P`);
    if (b === 0xF8) console.log(`    Offset +${i}: 0xF8 = RET M`);
  }
}
console.log('');

// ─── 4. Disassemble ROM at 0x05248E (predecessor block) ────────────────────

console.log('--- Step 4: Raw ROM bytes at 0x05248E (48 bytes) ---');
{
  const addr = 0x05248E;
  const bytes = [];
  for (let i = 0; i < 48; i++) {
    bytes.push(romBytes[addr + i].toString(16).padStart(2, '0'));
  }
  for (let i = 0; i < 48; i += 16) {
    const chunk = bytes.slice(i, Math.min(i + 16, 48));
    console.log(`  ${hex(addr + i)}: ${chunk.join(' ')}`);
  }

  console.log('\n  Scanning for exit instructions:');
  for (let i = 0; i < 48; i++) {
    const b = romBytes[addr + i];
    if (b === 0xE9) console.log(`    Offset +${i}: 0xE9 = JP (HL)`);
    if (b === 0xC9) console.log(`    Offset +${i}: 0xC9 = RET`);
    if (b === 0xC3 && i + 3 < 48) {
      const target = romBytes[addr + i + 1] | (romBytes[addr + i + 2] << 8) | (romBytes[addr + i + 3] << 16);
      console.log(`    Offset +${i}: 0xC3 = JP ${hex(target)} (ADL 3-byte addr)`);
    }
    if (b === 0xCD && i + 3 < 48) {
      const target = romBytes[addr + i + 1] | (romBytes[addr + i + 2] << 8) | (romBytes[addr + i + 3] << 16);
      console.log(`    Offset +${i}: 0xCD = CALL ${hex(target)} (ADL 3-byte addr)`);
    }
    if (b === 0xED && i + 1 < 48 && romBytes[addr + i + 1] === 0x49) {
      console.log(`    Offset +${i}: 0xED 0x49 = JP (HL) (eZ80 prefix)`);
    }
    if (b === 0xC0) console.log(`    Offset +${i}: 0xC0 = RET NZ`);
    if (b === 0xC8) console.log(`    Offset +${i}: 0xC8 = RET Z`);
    if (b === 0xD0) console.log(`    Offset +${i}: 0xD0 = RET NC`);
    if (b === 0xD8) console.log(`    Offset +${i}: 0xD8 = RET C`);
    if (b === 0xE0) console.log(`    Offset +${i}: 0xE0 = RET PO`);
    if (b === 0xE8) console.log(`    Offset +${i}: 0xE8 = RET PE`);
    if (b === 0xF0) console.log(`    Offset +${i}: 0xF0 = RET P`);
    if (b === 0xF8) console.log(`    Offset +${i}: 0xF8 = RET M`);
  }
}
console.log('');

// ─── 5. Check if block 0x052508 exists in transpiled code ──────────────────

console.log('--- Step 5: Check transpiled blocks ---');
console.log(`  Block 0x052508 exists: ${!!BLOCKS[0x052508]}`);
console.log(`  Block 0x05248E exists: ${!!BLOCKS[0x05248E]}`);
console.log(`  Block 0xFB65ED exists: ${!!BLOCKS[0xFB65ED]}`);

// Check nearby blocks around 0x052508
console.log('\n  Transpiled blocks in 0x052500-0x052600:');
for (let addr = 0x052500; addr <= 0x052600; addr++) {
  if (BLOCKS[addr]) {
    console.log(`    ${hex(addr)}`);
  }
}

// Check nearby blocks around 0xFB65ED
console.log('\n  Transpiled blocks in 0xFB6500-0xFB6700:');
let foundNearMissing = false;
for (let addr = 0xFB6500; addr <= 0xFB6700 && addr < MEM_SIZE; addr++) {
  if (BLOCKS[addr]) {
    console.log(`    ${hex(addr)}`);
    foundNearMissing = true;
  }
}
if (!foundNearMissing) console.log('    (none)');
console.log('');

// ─── 6. Trace from 0x053573 to confirm the path ────────────────────────────

console.log('--- Step 6: Trace from 0x053573 with glyph rendering state ---');
{
  // Set up glyph rendering state (same as phase 333)
  const glyphAddr = FONT_BASE + (0x41 - 0x20) * GLYPH_STRIDE;

  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu._iy = 0xD00080; cpu.mbase = 0xD0;
  cpu.sp = STACK_RESET_TOP - 100;
  mem.fill(0xFF, cpu.sp, cpu.sp + 100);

  // Scale level 0 = no scaling
  mem[RAM_SCALE_LEVEL] = 0;
  write24(mem, RAM_FONT_CONFIG, 0x000FFF);
  write24(mem, RAM_SCALE_PTR, 0x05320F);

  // Set up IX frame
  const frameBase = 0xD1A700;
  cpu._ix = frameBase;

  mem[frameBase - 70] = 1;        // scale_factor = 1 (no-scale)
  mem[frameBase - 71] = 0xFF;     // half_scale = identity sentinel
  write24(mem, frameBase - 3, glyphAddr);  // glyph bitmap pointer
  write24(mem, frameBase - 6, 16);         // adjusted width
  write24(mem, frameBase - 9, 14);         // adjusted height
  write24(mem, frameBase - 12, 2);         // h_stride
  write24(mem, frameBase - 15, 640);       // v_stride
  const outputBase = VRAM_BASE + (100 * VRAM_WIDTH + 50) * 2;
  write24(mem, frameBase - 18, outputBase);
  write24(mem, frameBase - 48, 0);
  write24(mem, frameBase - 51, 0);
  write24(mem, frameBase - 54, 0);
  write24(mem, frameBase - 57, 0x000FFF);

  // Scale kernel pointers
  write24(mem, frameBase - 60, 0x053182);
  write24(mem, frameBase - 63, 0x053182);
  write24(mem, frameBase - 66, 0x053182);
  write24(mem, frameBase - 69, 0x053182);

  // Set fg/bg colors
  mem[0xD02688] = 0x00; mem[0xD02689] = 0x00; // fg = black
  mem[0xD0268A] = 0xFF; mem[0xD0268B] = 0xFF; // bg = white

  const blocksVisited = [];
  const regSnaps = [];

  try {
    const result = executor.runFrom(0x053573, 'adl', {
      maxSteps: 50000,
      maxLoopIterations: 500,
      onBlock: (pc, mode, meta, steps) => {
        const addr = pc & 0xFFFFFF;
        blocksVisited.push(addr);
        regSnaps.push({
          pc: addr, step: steps,
          a: cpu.a, f: cpu.f,
          bc: cpu._bc, de: cpu._de, hl: cpu._hl,
          ix: cpu._ix, iy: cpu._iy, sp: cpu.sp,
        });
      },
    });

    console.log(`  Result: ${result.steps} steps, termination=${result.termination}, lastPc=${hex(result.lastPc)}`);

    // Show all unique blocks in order
    const uniqueBlocks = [...new Set(blocksVisited)];
    console.log(`  Unique blocks visited: ${uniqueBlocks.length}`);
    console.log('  Block sequence (all):');
    for (const addr of blocksVisited) {
      console.log(`    ${hex(addr)}`);
    }

    // Show register state at blocks near the missing block
    console.log('\n  Register snapshots (all blocks):');
    for (const snap of regSnaps) {
      console.log(`    pc=${hex(snap.pc)} step=${snap.step} A=${hex(snap.a, 2)} F=${hex(snap.f, 2)} BC=${hex(snap.bc)} DE=${hex(snap.de)} HL=${hex(snap.hl)} IX=${hex(snap.ix)} IY=${hex(snap.iy)} SP=${hex(snap.sp)}`);
    }

    // Special attention to the last few blocks before termination
    console.log('\n  Last 5 blocks before termination:');
    const lastN = blocksVisited.slice(-5);
    for (let i = 0; i < lastN.length; i++) {
      const snapIdx = blocksVisited.length - 5 + i;
      if (snapIdx >= 0 && snapIdx < regSnaps.length) {
        const snap = regSnaps[snapIdx];
        console.log(`    pc=${hex(snap.pc)} A=${hex(snap.a, 2)} F=${hex(snap.f, 2)} BC=${hex(snap.bc)} DE=${hex(snap.de)} HL=${hex(snap.hl)} IX=${hex(snap.ix)} SP=${hex(snap.sp)}`);
      }
    }

    // If the last block is 0x052508, dump the registers there
    if (blocksVisited.length > 0) {
      const lastBlock = blocksVisited[blocksVisited.length - 1];
      console.log(`\n  Final block: ${hex(lastBlock)}`);
      if (lastBlock === 0x052508) {
        const finalSnap = regSnaps[regSnaps.length - 1];
        console.log(`  At 0x052508: HL=${hex(finalSnap.hl)} — this is likely the JP (HL) target`);
        console.log(`  HL matches missing addr 0xFB65ED: ${finalSnap.hl === MISSING_ADDR}`);
      }
    }

  } catch (err) {
    console.log(`  Trace error: ${err.message}`);
    console.log(`  Stack: ${err.stack}`);
  }
}
console.log('');

// ─── 7. Check if 0xFB65ED could be a return address on the stack ───────────

console.log('--- Step 7: Stack analysis ---');
console.log(`  Current SP: ${hex(cpu.sp)}`);
console.log('  Stack contents (24 bytes from SP):');
for (let i = 0; i < 24; i += 3) {
  const addr = cpu.sp + i;
  const val = read24(mem, addr);
  console.log(`    [${hex(addr)}] = ${hex(val)}`);
}
console.log('');

// ─── 8. Check what instruction the transpiler generated for block 0x052508 ──

console.log('--- Step 8: Inspect transpiled block source for 0x052508 ---');
if (BLOCKS[0x052508]) {
  const blockFn = BLOCKS[0x052508];
  const src = blockFn.toString();
  // Print first 2000 chars to avoid flooding
  const truncated = src.length > 2000 ? src.slice(0, 2000) + '\n  ... (truncated)' : src;
  console.log(`  Block 0x052508 source (${src.length} chars):`);
  console.log(truncated);
} else {
  console.log('  Block 0x052508 not found in BLOCKS!');
}
console.log('');

// Also check block 0x05248E
console.log('--- Step 9: Inspect transpiled block source for 0x05248E ---');
if (BLOCKS[0x05248E]) {
  const blockFn = BLOCKS[0x05248E];
  const src = blockFn.toString();
  const truncated = src.length > 2000 ? src.slice(0, 2000) + '\n  ... (truncated)' : src;
  console.log(`  Block 0x05248E source (${src.length} chars):`);
  console.log(truncated);
} else {
  console.log('  Block 0x05248E not found in BLOCKS!');
}
console.log('');

console.log('=== Phase 334 complete ===');

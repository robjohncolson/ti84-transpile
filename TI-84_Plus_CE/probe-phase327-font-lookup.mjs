#!/usr/bin/env node
// Phase 327 — Decode the font table lookup function at ROM 0x0A5424
//
// Called by:
//   0x054FC6 — variable-width text renderer (stride 25)
//   0x055167 — glyph width calculator
//   0x0A23DC — another caller with stride 25
//
// All callers do: L = char_code, H = 0x19, MLT HL  →  HL = char_code * 25
// Then CALL 0x0A5424, which adds the font table base and copies 25 bytes into RAM.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

import { decodeInstruction } from './ez80-decoder.js';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const rom = fs.readFileSync(ROM_PATH);

// ── helpers ──────────────────────────────────────────────────────────

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function bytesToHex(bytes) {
  return Array.from(bytes, (b) => hexByte(b)).join(' ');
}

function read24(offset) {
  return rom[offset] | (rom[offset + 1] << 8) | (rom[offset + 2] << 16);
}

// ── static disassembly ───────────────────────────────────────────────

const FUNC_START = 0x0A5424;
const FONT_TABLE_BASE = 0x0A3AFA;
const RECORD_SIZE = 25;  // 0x19
const DEST_RAM = 0xD005C5;

function decodeSafe(pc) {
  try {
    return decodeInstruction(rom, pc, 'adl');
  } catch {
    return null;
  }
}

function disassembleLinear(start, maxInstructions = 60) {
  const instructions = [];
  const queue = [start];
  const visited = new Set();

  while (queue.length > 0 && instructions.length < maxInstructions) {
    let pc = queue.shift();
    while (!visited.has(pc) && instructions.length < maxInstructions) {
      visited.add(pc);
      const inst = decodeSafe(pc);
      if (!inst || !inst.length) break;
      instructions.push(inst);

      // Queue conditional branch targets
      if (inst.tag.includes('conditional') && inst.target !== undefined) {
        queue.push(inst.target);
      }

      // Stop linear walk on unconditional exit
      if (['ret', 'reti', 'retn', 'jp', 'jr', 'jp-indirect'].includes(inst.tag)) break;

      pc = inst.nextPc ?? (pc + inst.length);
    }
  }

  return instructions.sort((a, b) => a.pc - b.pc);
}

function formatInst(inst) {
  const bytes = bytesToHex(rom.subarray(inst.pc, inst.pc + inst.length)).padEnd(20);
  let text = inst.tag;

  // Build a readable representation
  const parts = [inst.tag.toUpperCase()];
  if (inst.dest) parts.push(inst.dest.toUpperCase());
  if (inst.src) parts.push(inst.src.toUpperCase());
  if (inst.pair) parts.push(inst.pair.toUpperCase());
  if (inst.reg) parts.push(inst.reg.toUpperCase());
  if (inst.op) parts.push(`op=${inst.op}`);
  if (inst.target !== undefined) parts.push(`-> ${hex(inst.target)}`);
  if (inst.value !== undefined) parts.push(`val=${hex(inst.value, inst.value > 0xFF ? 6 : 2)}`);
  if (inst.bit !== undefined) parts.push(`bit=${inst.bit}`);
  if (inst.condition) parts.push(`cond=${inst.condition}`);
  if (inst.displacement !== undefined) parts.push(`disp=${inst.displacement}`);
  if (inst.indexRegister) parts.push(`idx=${inst.indexRegister}`);
  if (inst.indirectRegister) parts.push(`ind=${inst.indirectRegister}`);
  if (inst.addr !== undefined) parts.push(`addr=${hex(inst.addr)}`);
  if (inst.address !== undefined) parts.push(`address=${hex(inst.address)}`);

  return `${hex(inst.pc)}: ${bytes} ${parts.join(' ')}`;
}

// ── Section 1: Full static disassembly ───────────────────────────────

console.log('Phase 327: Font table lookup function at 0x0A5424');
console.log(`ROM size: ${hex(rom.length, 8)} bytes`);
console.log();

console.log('=== Static disassembly of 0x0A5424 ===');
console.log();

const instructions = disassembleLinear(FUNC_START, 40);
const NOTES = new Map([
  [0x0A5424, 'Save BC on stack.'],
  [0x0A5425, 'Test bit 1 of (IY+53) — flags byte at D000B5. Checks if alternate font mode active.'],
  [0x0A5429, 'If bit 1 clear → skip the alternate-font path, jump to 0x0A5439.'],
  [0x0A542B, 'Save char code from A into B.'],
  [0x0A542C, 'Load A = 0x75 (font-switch OS call argument).'],
  [0x0A542E, 'CALL 0x02398E — OS routine (likely font mode setup/query).'],
  [0x0A5432, 'Restore char code from B back into A.'],
  [0x0A5433, 'DE = 0xD005DE — RAM destination for trailing bytes.'],
  [0x0A5437, 'If Z flag set (from OS call), jump to final cleanup at 0x0A5448.'],
  [0x0A5439, 'DE = 0x0A3AFA — font table base address in ROM.'],
  [0x0A543D, 'HL = HL + DE = char_code*25 + 0x0A3AFA → ROM address of glyph record.'],
  [0x0A543E, 'DE = 0xD005C5 — RAM destination for the 25-byte glyph record.'],
  [0x0A5442, 'BC = 0x000019 = 25 bytes to copy (one full glyph record).'],
  [0x0A5446, 'LDIR: copy 25 bytes from ROM glyph record into RAM at 0xD005C5.'],
  [0x0A5448, 'HL = 0xD005DE — points to byte 25 of the copied record area.'],
  [0x0A544C, 'XOR A — clear A to zero.'],
  [0x0A544D, 'Store 0 at (0xD005DE) — zero the byte right after the 25-byte record.'],
  [0x0A544E, 'INC DE — advance DE past the zeroed byte.'],
  [0x0A544F, 'LDI: copy one byte from (HL) to (DE), dec BC. Transfers padding.'],
  [0x0A5451, 'LDI: copy second padding byte.'],
  [0x0A5453, 'LDI: copy third padding byte.'],
  [0x0A5455, 'HL = 0xD005C5 — return pointer to start of the glyph record in RAM.'],
  [0x0A5459, 'Restore BC from stack.'],
  [0x0A545A, 'Return. HL = 0xD005C5 = pointer to the copied glyph record.'],
]);

for (const inst of instructions) {
  const note = NOTES.get(inst.pc) ?? '';
  console.log(`  ${formatInst(inst)}${note ? `  ; ${note}` : ''}`);
}
console.log();

console.log('=== Function summary ===');
console.log(`  Entry: ${hex(FUNC_START)}`);
console.log(`  Input:  A = character code, HL = char_code * 25 (from MLT HL with H=0x19)`);
console.log(`          IY = 0xD00080 (OS base pointer)`);
console.log(`  Output: HL = 0xD005C5 (pointer to 25-byte glyph record copied into RAM)`);
console.log();
console.log('  Flow:');
console.log('    1. PUSH BC (save)');
console.log('    2. Check bit 1 of (IY+53) [address 0xD000B5] for alternate font mode');
console.log('    3. If set: save A→B, call 0x02398E with A=0x75, restore A←B');
console.log('       If Z from that call → skip to cleanup (alt font already loaded?)');
console.log('    4. Normal path: HL += 0x0A3AFA (font table base) → HL = ROM glyph addr');
console.log('    5. LDIR 25 bytes from ROM[HL] → RAM[0xD005C5]');
console.log('    6. Zero byte at 0xD005DE, then 3 LDI to pad/copy trailing bytes');
console.log('    7. HL = 0xD005C5, POP BC, RET');
console.log();

// ── Section 2: Font table structure ──────────────────────────────────

console.log('=== Font table location and structure ===');
console.log(`  Base address: ${hex(FONT_TABLE_BASE)} (loaded at 0x0A5439)`);
console.log(`  Record size:  ${RECORD_SIZE} bytes (0x19)`);
console.log(`  Indexing:     record_addr = ${hex(FONT_TABLE_BASE)} + char_code * ${RECORD_SIZE}`);
console.log(`  Destination:  RAM ${hex(DEST_RAM)} (25 bytes + 1 zero + 3 trailing bytes = 29 total)`);
console.log();

// Glyph record structure analysis
console.log('=== Glyph record structure (25 bytes) ===');
console.log('  Offset 0:     width (pixel width of the glyph)');
console.log('  Offset 1-2:   padding or flags (usually 0x00 0x00)');
console.log('  Offset 3-24:  bitmap data (row-by-row, 1 or 2 bytes per row depending on width)');
console.log();

// ── Section 3: Sample glyph data ─────────────────────────────────────

const SAMPLE_CHARS = [
  { code: 0x20, label: 'SPACE' },
  { code: 0x30, label: "'0'" },
  { code: 0x41, label: "'A'" },
  { code: 0x42, label: "'B'" },
  { code: 0x48, label: "'H'" },
  { code: 0x61, label: "'a'" },
];

console.log('=== Sample glyph data ===');

for (const { code, label } of SAMPLE_CHARS) {
  const addr = FONT_TABLE_BASE + code * RECORD_SIZE;
  const record = rom.subarray(addr, addr + RECORD_SIZE);
  const width = record[0];

  console.log(`  Char ${hexByte(code)} (${label}) at ${hex(addr)}:`);
  console.log(`    Width: ${width} pixels`);
  console.log(`    Raw:   ${bytesToHex(record)}`);

  // Render bitmap as ASCII art
  if (width > 0 && width <= 8) {
    // 1-byte-per-row bitmap, rows in bytes 3..14 (up to 12 rows)
    console.log('    Bitmap (1 byte/row, 8-bit wide):');
    for (let row = 0; row < 12; row++) {
      const byte = record[3 + row];
      if (byte === 0 && row > 0) continue;
      let line = '      ';
      for (let bit = 7; bit >= 0; bit--) {
        line += (byte >> bit) & 1 ? '#' : '.';
      }
      console.log(`${line}  (${hexByte(byte)})`);
    }
  } else if (width > 8) {
    // 2-byte-per-row bitmap, rows in bytes 3..24
    console.log(`    Bitmap (2 bytes/row, ${width}-bit wide):`);
    for (let row = 0; row < 11; row++) {
      const b1 = record[3 + row * 2];
      const b2 = record[3 + row * 2 + 1];
      if (b1 === 0 && b2 === 0 && row > 0) continue;
      let line = '      ';
      for (let bit = 7; bit >= 0; bit--) line += (b1 >> bit) & 1 ? '#' : '.';
      for (let bit = 7; bit >= 0; bit--) line += (b2 >> bit) & 1 ? '#' : '.';
      console.log(`${line}  (${hexByte(b1)} ${hexByte(b2)})`);
    }
  }
  console.log();
}

// ── Section 4: Font table overview ───────────────────────────────────

console.log('=== Font table overview (printable ASCII range 0x20-0x7E) ===');

const widthHistogram = new Map();
for (let ch = 0x20; ch <= 0x7E; ch++) {
  const addr = FONT_TABLE_BASE + ch * RECORD_SIZE;
  const w = rom[addr];
  widthHistogram.set(w, (widthHistogram.get(w) ?? 0) + 1);
}

console.log('  Width distribution:');
for (const [w, count] of [...widthHistogram.entries()].sort((a, b) => a[0] - b[0])) {
  console.log(`    width ${w.toString().padStart(2)}: ${count} glyphs`);
}
console.log();

// Show first/last valid records
const firstValidAddr = FONT_TABLE_BASE + 0x20 * RECORD_SIZE;
const lastValidAddr = FONT_TABLE_BASE + 0x7E * RECORD_SIZE;
console.log(`  Printable range: ${hex(firstValidAddr)} (0x20) .. ${hex(lastValidAddr)} (0x7E)`);
console.log(`  Total table size for 256 chars: ${256 * RECORD_SIZE} bytes (${hex(256 * RECORD_SIZE, 4)})`);
console.log(`  Table end (char 0xFF): ${hex(FONT_TABLE_BASE + 255 * RECORD_SIZE)}`);
console.log();

// ── Section 5: Font descriptor table at 0x0525D4 ────────────────────

const FONT_DESC_TABLE = 0x0525D4;
console.log('=== Font descriptor table at 0x0525D4 (record 0 = variable-width font) ===');
console.log(`  Raw 25 bytes: ${bytesToHex(rom.subarray(FONT_DESC_TABLE, FONT_DESC_TABLE + RECORD_SIZE))}`);
console.log();
console.log('  Record 0 decoded fields:');
console.log(`    Bytes  0-2: ${hex(read24(FONT_DESC_TABLE))}     (flags/ID — 0 for variable-width)`);
console.log(`    Bytes  3-5: ${hex(read24(FONT_DESC_TABLE + 3))}  (text renderer = 0x054FC6)`);
console.log(`    Bytes  6-8: ${hex(read24(FONT_DESC_TABLE + 6))}  (width calculator = 0x055167)`);
console.log(`    Bytes 9-11: ${hex(read24(FONT_DESC_TABLE + 9))}  (third handler = 0x05518C)`);
console.log(`    Bytes 12-14: ${hex(read24(FONT_DESC_TABLE + 12))} (stride = 1)`);
console.log(`    Bytes 15-17: ${hex(read24(FONT_DESC_TABLE + 15))} (fourth handler = 0x054E21)`);
console.log(`    Bytes 18-20: ${hex(read24(FONT_DESC_TABLE + 18))} (fifth handler = 0x054FBC)`);
console.log(`    Bytes 21-23: ${hex(read24(FONT_DESC_TABLE + 21))} (sixth handler = 0x054FC1)`);
console.log();

// ── Section 6: Dynamic trace ─────────────────────────────────────────

console.log('=== Dynamic trace: 0x0A5424 with char \'A\' (0x41) ===');

const transpiledPath = path.join(__dirname, 'ROM.transpiled.js');

async function loadBlocks() {
  if (!fs.existsSync(transpiledPath)) {
    const r = spawnSync(process.execPath, [path.join(repoRoot, 'scripts', 'transpile-ti84-rom.mjs')], {
      cwd: repoRoot,
      stdio: 'inherit',
    });
    if (r.status !== 0) process.exit(r.status ?? 1);
  }
  const mod = await import(pathToFileURL(transpiledPath).href);
  return mod.PRELIFTED_BLOCKS;
}

async function main() {
  const blocks = await loadBlocks();
  const peripherals = createPeripheralBus({ trace: false, pllDelay: 2, timerInterrupt: false });
  const mem = new Uint8Array(0x1000000);
  mem.set(rom);

  const ex = createExecutor(blocks, mem, { peripherals });
  const cpu = ex.cpu;

  // Set up for char 'A' (0x41)
  const charCode = 0x41;

  // Simulate: L = charCode, H = 0x19, MLT HL → HL = charCode * 25
  const hlValue = charCode * RECORD_SIZE;

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.a = charCode;
  cpu._hl = hlValue;
  cpu._iy = 0xD00080;
  cpu.sp = 0xD1A87E;

  // Set (IY+53) = 0xD000B5 to 0 (normal font mode, bit 1 clear)
  mem[0xD000B5] = 0x00;

  // Push a sentinel return address on the stack
  const sentinel = 0xFEFEFE;
  cpu.sp -= 3;
  mem[cpu.sp] = sentinel & 0xFF;
  mem[cpu.sp + 1] = (sentinel >> 8) & 0xFF;
  mem[cpu.sp + 2] = (sentinel >> 16) & 0xFF;

  console.log(`  Initial state: A=${hexByte(cpu.a)}, HL=${hex(cpu._hl)}, IY=${hex(cpu._iy)}, SP=${hex(cpu.sp)}`);
  console.log(`  (IY+53) = mem[0xD000B5] = ${hexByte(mem[0xD000B5])}`);
  console.log(`  Expected ROM source: ${hex(FONT_TABLE_BASE + hlValue)} = 0x0A3AFA + ${hex(hlValue)}`);
  console.log();

  // Run the function
  try {
    const result = ex.runFrom(FUNC_START, 'adl', { maxSteps: 100, maxLoopIterations: 32 });

    console.log('  Execution result:');
    console.log(`    Steps: ${result.steps}`);
    console.log(`    Termination: ${result.termination}`);
    console.log(`    Final PC: ${hex(result.pc)}`);
    console.log(`    Final HL: ${hex(cpu._hl)}`);
    console.log(`    Final A: ${hexByte(cpu.a)}`);
    console.log(`    Final SP: ${hex(cpu.sp)}`);
    console.log();

    // Check what was written to RAM at 0xD005C5
    const copiedRecord = mem.subarray(DEST_RAM, DEST_RAM + RECORD_SIZE + 4);
    console.log(`  RAM at ${hex(DEST_RAM)} (copied glyph record + trailing bytes):`);
    console.log(`    ${bytesToHex(copiedRecord)}`);
    console.log(`    Width byte: ${copiedRecord[0]}`);

    // Verify against ROM source
    const expectedAddr = FONT_TABLE_BASE + charCode * RECORD_SIZE;
    const romRecord = rom.subarray(expectedAddr, expectedAddr + RECORD_SIZE);
    const match = copiedRecord.slice(0, RECORD_SIZE).every((b, i) => b === romRecord[i]);
    console.log(`    Matches ROM at ${hex(expectedAddr)}: ${match ? 'YES' : 'NO'}`);
    console.log();

    // Check the zeroed byte at 0xD005DE
    console.log(`  Byte at 0xD005DE (zeroed by function): ${hexByte(mem[0xD005DE])}`);
    console.log(`  Trailing 3 bytes after 0xD005DE: ${hexByte(mem[0xD005DF])} ${hexByte(mem[0xD005E0])} ${hexByte(mem[0xD005E1])}`);
    console.log();
  } catch (err) {
    console.log(`  Execution error: ${err.message}`);
    console.log();
  }

  // Second trace: char '0' (0x30)
  console.log('=== Dynamic trace: 0x0A5424 with char \'0\' (0x30) ===');

  const charCode2 = 0x30;
  const hlValue2 = charCode2 * RECORD_SIZE;

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.a = charCode2;
  cpu._hl = hlValue2;
  cpu._iy = 0xD00080;
  cpu.sp = 0xD1A87E;
  mem[0xD000B5] = 0x00;

  cpu.sp -= 3;
  mem[cpu.sp] = sentinel & 0xFF;
  mem[cpu.sp + 1] = (sentinel >> 8) & 0xFF;
  mem[cpu.sp + 2] = (sentinel >> 16) & 0xFF;

  // Clear destination first to confirm the copy happens
  mem.fill(0xAA, DEST_RAM, DEST_RAM + 30);

  console.log(`  Initial state: A=${hexByte(cpu.a)}, HL=${hex(cpu._hl)}`);

  try {
    const result = ex.runFrom(FUNC_START, 'adl', { maxSteps: 100, maxLoopIterations: 32 });

    console.log(`  Steps: ${result.steps}, termination: ${result.termination}`);
    console.log(`  Final HL: ${hex(cpu._hl)}, Final A: ${hexByte(cpu.a)}`);

    const copiedRecord = mem.subarray(DEST_RAM, DEST_RAM + RECORD_SIZE + 4);
    console.log(`  RAM at ${hex(DEST_RAM)}: ${bytesToHex(copiedRecord)}`);
    console.log(`  Width byte: ${copiedRecord[0]}`);

    const expectedAddr = FONT_TABLE_BASE + charCode2 * RECORD_SIZE;
    const romRecord = rom.subarray(expectedAddr, expectedAddr + RECORD_SIZE);
    const match = copiedRecord.slice(0, RECORD_SIZE).every((b, i) => b === romRecord[i]);
    console.log(`  Matches ROM at ${hex(expectedAddr)}: ${match ? 'YES' : 'NO'}`);
  } catch (err) {
    console.log(`  Execution error: ${err.message}`);
  }

  console.log();
  console.log('=== Done ===');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});

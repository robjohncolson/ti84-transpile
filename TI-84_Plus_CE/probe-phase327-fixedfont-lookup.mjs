#!/usr/bin/env node
// Phase 327: Trace the fixed-width font lookup function at 0x07BF3E
//
// Called by renderer 0x054E21 with MLT stride 28 (H=0x1C, L=char_code).
// This is Record 1 (sel=1) in the font descriptor table at 0x0525D4.
// Fixed-width: width=12px (constant), height=14 rows, 2 bytes/row = 28 bytes/glyph.
// Variable-width counterpart: 0x0A5424 (stride 25).

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';
import { createPeripheralBus } from './peripherals.js';
import { createExecutor } from './cpu-runtime.js';
import { PRELIFTED_BLOCKS } from './ROM.transpiled.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const rom = readFileSync(ROM_PATH);

// ----------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------

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

// ----------------------------------------------------------------
// Constants
// ----------------------------------------------------------------

const FIXED_FONT_LOOKUP = 0x07BF3E;
const FONT_TABLE_BASE   = 0x003D6E; // returned by CALL 0x000380 -> JP 0x003D85 -> LD HL,0x003D6E; RET
const FIXED_STRIDE      = 28;       // 14 rows * 2 bytes/row, no width byte
const FIXED_ROWS        = 14;
const FIXED_WIDTH_PX    = 12;       // constant for all glyphs

const VAR_FONT_BASE     = 0x0A3AFA; // variable-width font table
const VAR_STRIDE        = 25;       // 1 width byte + 12 rows * 2 bytes/row
const VAR_ROWS          = 12;

const RENDERER_ADDR     = 0x054E21; // renderer that calls the fixed-width lookup
const FONT_DESC_TABLE   = 0x0525D4; // font descriptor table

const ADDRESS_NOTES = new Map([
  [0x07BF3E, 'BIT 5, (IY+53) — check flag: uppercase/translation mode active?'],
  [0x07BF42, 'JR Z, skip-translation-1 — if bit 5 clear, skip first translation path.'],
  [0x07BF44, 'LD B, A — save original char code in B.'],
  [0x07BF45, 'LD A, 0x01 — parameter for translation call.'],
  [0x07BF47, 'CALL 0x023A1C — invoke character translation routine (mode 1).'],
  [0x07BF4B, 'LD A, B — restore original char code from B.'],
  [0x07BF4C, 'RET Z — if translation returned Z (no glyph), abort early.'],
  [0x07BF4D, 'BIT 1, (IY+53) — check second flag: alternate charset active?'],
  [0x07BF51, 'JR Z, skip-translation-2 — if bit 1 clear, skip second translation path.'],
  [0x07BF53, 'LD B, A — save original char code in B.'],
  [0x07BF54, 'LD A, 0x76 — parameter for alternate translation call.'],
  [0x07BF56, 'CALL 0x02398E — invoke character translation routine (mode 0x76).'],
  [0x07BF5A, 'LD A, B — restore original char code from B.'],
  [0x07BF5B, 'RET Z — if translation returned Z, abort early.'],
  [0x07BF5C, 'EX DE, HL — swap: glyph offset (char*28) into DE, free HL for base pointer.'],
  [0x07BF5D, 'CALL 0x000380 — get font table base address into HL (returns 0x003D6E).'],
  [0x07BF61, 'ADD HL, DE — HL = font_base + char_code*28 = glyph data pointer.'],
  [0x07BF62, 'LD DE, 0x000000 — zero DE for clearing the glyph output buffer.'],
  [0x07BF66, 'LD (0xD005A1), DE — zero bytes at D005A1..D005A3 (first 3 bytes of output).'],
  [0x07BF6B, 'LD (0xD005A3), DE — zero bytes at D005A3..D005A5 (overlap, clears D005A4 too).'],
  [0x07BF70, 'LD DE, 0xD005A5 — destination for the 28-byte glyph bitmap copy.'],
  [0x07BF74, 'LD BC, 0x00001C — BC = 28 = stride (bytes to copy).'],
  [0x07BF78, 'LDIR — copy 28 bytes from ROM glyph data at (HL) to RAM at D005A5.'],
  [0x07BF7A, 'LD HL, 0xD005A1 — point HL at the start of the output buffer.'],
  [0x07BF7E, 'LDI — copy byte from D005A1 to D005C1 (DE continues from after LDIR).'],
  [0x07BF80, 'LDI — copy byte from D005A2 to D005C2.'],
  [0x07BF82, 'LDI — copy byte from D005A3 to D005C3.'],
  [0x07BF84, 'LDI — copy byte from D005A4 to D005C4.'],
  [0x07BF86, 'LD HL, 0xD005A1 — reload HL to point at the glyph record for the caller.'],
  [0x07BF8A, 'RET — return to the renderer with HL = D005A1 (glyph output buffer).'],
]);

// ----------------------------------------------------------------
// Decode + format helpers (reused from phase 326 pattern)
// ----------------------------------------------------------------

function decodeSafe(pc) {
  try {
    return decodeInstruction(rom, pc, 'adl');
  } catch { return null; }
}

function nextPc(inst) {
  return inst.nextPc ?? (inst.pc + inst.length);
}

function isHardExit(inst) {
  return ['ret', 'reti', 'retn', 'jp', 'jp-indirect', 'jr'].includes(inst.tag);
}

function isConditionalFlow(inst) {
  return ['jr-conditional', 'jp-conditional', 'ret-conditional', 'djnz'].includes(inst.tag);
}

function formatInstruction(inst) {
  if (!inst) return '(decode error)';
  const prefix = inst.modePrefix ? `${inst.modePrefix.toUpperCase()} ` : '';
  const bytes = bytesToHex(rom.subarray(inst.pc, inst.pc + inst.length)).padEnd(20);
  return `${hex(inst.pc)}: ${bytes} ${prefix}${inst.tag.toUpperCase()}`;
}

function renderLine(inst) {
  const bytes = bytesToHex(rom.subarray(inst.pc, inst.pc + inst.length)).padEnd(20);
  const note = ADDRESS_NOTES.get(inst.pc) ?? '';
  return `  ${hex(inst.pc)}: ${bytes} ${note}`;
}

// ----------------------------------------------------------------
// Section 1: Full static disassembly of 0x07BF3E
// ----------------------------------------------------------------

function disassembleFunction(start) {
  const queue = [start];
  const queued = new Set(queue);
  const visited = new Set();
  const instructions = new Map();

  while (queue.length) {
    const blockStart = queue.shift();
    if (visited.has(blockStart)) continue;
    visited.add(blockStart);

    let pc = blockStart;
    while (pc >= 0 && pc < rom.length) {
      if (instructions.has(pc)) break;
      const inst = decodeSafe(pc);
      if (!inst || !inst.length) break;
      instructions.set(pc, inst);

      if (inst.tag === 'call' || inst.tag === 'call-conditional') {
        pc = inst.fallthrough ?? nextPc(inst);
        continue;
      }

      if (isConditionalFlow(inst)) {
        if (inst.target !== undefined && !visited.has(inst.target) && !queued.has(inst.target)) {
          queue.push(inst.target);
          queued.add(inst.target);
        }
        pc = inst.fallthrough ?? nextPc(inst);
        continue;
      }

      if (isHardExit(inst)) break;
      pc = nextPc(inst);
    }
  }

  return [...instructions.values()].sort((a, b) => a.pc - b.pc);
}

console.log('Phase 327: Fixed-Width Font Lookup at 0x07BF3E');
console.log(`ROM size: ${hex(rom.length, 8)} bytes`);
console.log();

console.log('=== 1. Static Disassembly of 0x07BF3E ===');
console.log();
console.log('Calling convention:');
console.log('  Input:  HL = char_code * 28 (pre-multiplied by renderer via MLT H=0x1C, L=char)');
console.log('  Output: HL = 0xD005A1 (RAM glyph output buffer, 32 bytes)');
console.log('  Layout at D005A1: [4 zero bytes] [28 bytes glyph bitmap] [4 bytes copied from zeros]');
console.log();

const insts = disassembleFunction(FIXED_FONT_LOOKUP);
for (const inst of insts) {
  console.log(renderLine(inst));
}
console.log();

// ----------------------------------------------------------------
// Section 2: Call targets within the function
// ----------------------------------------------------------------

console.log('=== 2. CALL Targets ===');
console.log();

const calls = insts.filter(i => i.tag === 'call' || i.tag === 'call-conditional');
for (const c of calls) {
  console.log(`  ${hex(c.pc)} -> CALL ${hex(c.target)}`);
}

// Show the font base loader trampoline
console.log();
console.log('Font base trampoline chain:');
console.log(`  0x000380: JP 0x003D85`);
console.log(`  0x003D85: LD HL, ${hex(FONT_TABLE_BASE)}; RET`);
console.log(`  => returns HL = ${hex(FONT_TABLE_BASE)} (fixed-width font table base)`);
console.log();

// ----------------------------------------------------------------
// Section 3: Font table info
// ----------------------------------------------------------------

console.log('=== 3. Fixed-Width Font Table ===');
console.log();
console.log(`  Base address:     ${hex(FONT_TABLE_BASE)}`);
console.log(`  Record stride:    ${FIXED_STRIDE} bytes (0x${FIXED_STRIDE.toString(16).toUpperCase()})`);
console.log(`  Glyph format:     ${FIXED_ROWS} rows x 2 bytes/row = ${FIXED_ROWS * 2} bytes, 1bpp, MSB-first`);
console.log(`  Pixel width:      ${FIXED_WIDTH_PX}px (constant, top 12 bits of each 16-bit row)`);
console.log(`  Pixel height:     ${FIXED_ROWS}px`);
console.log(`  No width metadata (width is implied as constant 12px)`);
console.log(`  Table covers 256 entries: ${hex(FONT_TABLE_BASE)} .. ${hex(FONT_TABLE_BASE + 256 * FIXED_STRIDE - 1)}`);
console.log(`  Total table size: ${256 * FIXED_STRIDE} bytes`);
console.log();

// ----------------------------------------------------------------
// Section 4: Font descriptor table at 0x0525D4
// ----------------------------------------------------------------

console.log('=== 4. Font Descriptor Table at 0x0525D4 ===');
console.log();
console.log('  Raw bytes (first 16):');
console.log(`  ${bytesToHex(rom.subarray(FONT_DESC_TABLE, FONT_DESC_TABLE + 16))}`);
console.log();

// ----------------------------------------------------------------
// Section 5: Sample glyph data
// ----------------------------------------------------------------

function renderGlyph(charCode, label) {
  const addr = FONT_TABLE_BASE + charCode * FIXED_STRIDE;
  const data = rom.subarray(addr, addr + FIXED_STRIDE);

  console.log(`--- '${label}' (0x${charCode.toString(16).toUpperCase().padStart(2, '0')}) at ${hex(addr)} ---`);
  console.log(`  Hex: ${bytesToHex(data)}`);
  console.log(`  Bitmap (${FIXED_WIDTH_PX}px wide, ${FIXED_ROWS} rows):`);

  for (let row = 0; row < FIXED_ROWS; row++) {
    const b1 = data[row * 2];
    const b2 = data[row * 2 + 1];
    const word = (b1 << 8) | b2;
    let bits = '';
    for (let bit = 15; bit >= 16 - FIXED_WIDTH_PX; bit--) {
      bits += (word >> bit) & 1 ? '#' : '.';
    }
    console.log(`    ${bits}  ${hexByte(b1)} ${hexByte(b2)}`);
  }
  console.log();
}

console.log('=== 5. Sample Glyph Data ===');
console.log();
renderGlyph(0x41, 'A');
renderGlyph(0x30, '0');
renderGlyph(0x20, 'Space');
renderGlyph(0x49, 'I');
renderGlyph(0x57, 'W');

// ----------------------------------------------------------------
// Section 6: Variable-width comparison
// ----------------------------------------------------------------

function renderVarGlyph(charCode, label) {
  const addr = VAR_FONT_BASE + charCode * VAR_STRIDE;
  const width = rom[addr];
  const data = rom.subarray(addr, addr + VAR_STRIDE);

  console.log(`--- '${label}' (0x${charCode.toString(16).toUpperCase().padStart(2, '0')}) width=${width}px at ${hex(addr)} ---`);
  console.log(`  Hex: ${bytesToHex(data)}`);
  console.log(`  Bitmap (${VAR_ROWS} rows, 2 bytes/row):`);

  for (let row = 0; row < VAR_ROWS; row++) {
    const b1 = data[1 + row * 2];
    const b2 = data[1 + row * 2 + 1];
    const word = (b1 << 8) | b2;
    let bits = '';
    for (let bit = 15; bit >= 16 - Math.max(width, 8); bit--) {
      bits += (word >> bit) & 1 ? '#' : '.';
    }
    console.log(`    ${bits}  ${hexByte(b1)} ${hexByte(b2)}`);
  }
  console.log();
}

console.log('=== 6. Variable-Width Comparison ===');
console.log();
console.log(`  Variable-width font base: ${hex(VAR_FONT_BASE)}`);
console.log(`  Variable stride:          ${VAR_STRIDE} bytes`);
console.log(`  Variable format:           1 byte width + ${VAR_ROWS} rows x 2 bytes/row = ${1 + VAR_ROWS * 2} bytes`);
console.log();

renderVarGlyph(0x41, 'A');
renderVarGlyph(0x30, '0');

// ----------------------------------------------------------------
// Section 7: Stride analysis — why 28 vs 25
// ----------------------------------------------------------------

console.log('=== 7. Stride Comparison: 28 (Fixed) vs 25 (Variable) ===');
console.log();
console.log('  Fixed-width  (stride 28): 14 rows x 2 bytes/row = 28.  No width byte.');
console.log('  Variable-width (stride 25): 1 width byte + 12 rows x 2 bytes/row = 25.');
console.log();
console.log('  The extra 3 bytes come from TWO differences:');
console.log('    1. Fixed has NO width byte (saves 1 byte) — width is always 12px.');
console.log('    2. Fixed has 2 MORE rows of bitmap (14 vs 12), adding 4 bytes.');
console.log('    Net: -1 (no width) + 4 (extra rows) = +3 bytes per glyph.');
console.log();
console.log('  The taller fixed-width glyphs (14 rows) produce crisper rendering');
console.log('  on the home screen, while variable-width glyphs (12 rows) trade');
console.log('  height for compactness in menus and graph labels.');
console.log();

// ----------------------------------------------------------------
// Section 8: Dynamic trace
// ----------------------------------------------------------------

console.log('=== 8. Dynamic Trace: Execute 0x07BF3E for char A (0x41) ===');
console.log();

try {
  const p = createPeripheralBus({ trace: false, pllDelay: 2, timerInterrupt: false });
  const mem = new Uint8Array(0x1000000);
  mem.set(rom);
  const ex = createExecutor(PRELIFTED_BLOCKS, mem, { peripherals: p });
  const cpu = ex.cpu;

  // Boot OS minimally to set up memory tables
  ex.runFrom(0x000000, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;

  // Set up for fixed-width font lookup of 'A' (0x41)
  // Renderer pre-computes: H=0x1C, L=0x41, MLT -> HL = 0x1C * 0x41 = 0x071C
  const charCode = 0x41;
  const preMultiplied = 0x1C * charCode; // 0x071C = 1820

  cpu._hl = preMultiplied;
  cpu._iy = 0xD00080;
  cpu.sp = 0xD1A87E - 6;

  // Push a return address so RET has somewhere to go
  const SENTINEL_RET = 0xFFFFFF;
  mem[cpu.sp] = SENTINEL_RET & 0xFF;
  mem[cpu.sp + 1] = (SENTINEL_RET >> 8) & 0xFF;
  mem[cpu.sp + 2] = (SENTINEL_RET >> 16) & 0xFF;

  // Clear the flag byte at (IY+53) so we take the fast path (no translation)
  mem[0xD000B5] = 0x00;

  // Trace execution
  const traceLog = [];
  const origPc = cpu._currentBlockPc;
  let steps = 0;
  const MAX_STEPS = 100;

  const result = ex.runFrom(FIXED_FONT_LOOKUP, 'adl', {
    maxSteps: MAX_STEPS,
    maxLoopIterations: 50,
    onStep: (pc) => {
      steps++;
      if (traceLog.length < MAX_STEPS) {
        traceLog.push({
          step: steps,
          pc,
          a: cpu.a,
          hl: cpu._hl,
          de: cpu._de,
          bc: cpu._bc,
          sp: cpu.sp,
        });
      }
    },
  });

  console.log(`  Input:  HL = ${hex(preMultiplied)} (char 0x41 * stride 28)`);
  console.log(`  Steps executed: ${steps}`);
  console.log(`  Final: HL = ${hex(cpu._hl)}, DE = ${hex(cpu._de)}, BC = ${hex(cpu._bc)}`);
  console.log();

  // Dump the glyph output buffer at D005A1
  console.log('  Glyph output buffer at D005A1 (32 bytes):');
  const bufStart = 0xD005A1;
  console.log(`    ${bytesToHex(mem.subarray(bufStart, bufStart + 32))}`);
  console.log();

  // Show the first 4 bytes (should be zeros for fixed-width)
  console.log(`  First 4 bytes (width placeholder): ${bytesToHex(mem.subarray(bufStart, bufStart + 4))}`);
  console.log(`  Glyph bitmap (28 bytes at D005A5): ${bytesToHex(mem.subarray(bufStart + 4, bufStart + 4 + FIXED_STRIDE))}`);
  console.log();

  // Render the bitmap from the output buffer
  console.log('  Rendered from output buffer:');
  for (let row = 0; row < FIXED_ROWS; row++) {
    const b1 = mem[bufStart + 4 + row * 2];
    const b2 = mem[bufStart + 4 + row * 2 + 1];
    const word = (b1 << 8) | b2;
    let bits = '';
    for (let bit = 15; bit >= 16 - FIXED_WIDTH_PX; bit--) {
      bits += (word >> bit) & 1 ? '#' : '.';
    }
    console.log(`    ${bits}  ${hexByte(b1)} ${hexByte(b2)}`);
  }
  console.log();

  // Trace log (first 20 steps)
  const showSteps = Math.min(traceLog.length, 20);
  console.log(`  Trace log (first ${showSteps} of ${traceLog.length} steps):`);
  for (let i = 0; i < showSteps; i++) {
    const t = traceLog[i];
    console.log(`    step ${String(t.step).padStart(3)}: PC=${hex(t.pc)} A=${hexByte(t.a)} HL=${hex(t.hl)} DE=${hex(t.de)} BC=${hex(t.bc)} SP=${hex(t.sp)}`);
  }
  if (traceLog.length > showSteps) {
    console.log(`    ... (${traceLog.length - showSteps} more steps)`);
  }
  console.log();

} catch (err) {
  console.log(`  Dynamic trace failed: ${err.message}`);
  console.log(`  (This is expected if the transpiled ROM lacks the block at ${hex(FIXED_FONT_LOOKUP)})`);
  console.log();
}

// ----------------------------------------------------------------
// Section 9: Renderer call site context
// ----------------------------------------------------------------

console.log('=== 9. Renderer Call Site at 0x054E21 ===');
console.log();
console.log('  The renderer at 0x054E21 calls the fixed-width font lookup like this:');
console.log();
console.log('  0x054E36: LD A, (IX+6)      ; load char code from stack argument');
console.log('  0x054E39: OR A              ; test for null char');
console.log('  0x054E3A: JP Z, 0x054FB7    ; skip if null');
console.log('  0x054E3E: LD L, A           ; char code -> L');
console.log('  0x054E3F: LD H, 0x1C        ; stride 28 -> H');
console.log('  0x054E41: MLT               ; HL = H*L = char_code * 28');
console.log('  0x054E43: PUSH IX           ; save frame pointer');
console.log('  0x054E45: CALL 0x07BF3E     ; fixed-width font lookup');
console.log('  0x054E49: POP IX            ; restore frame pointer');
console.log('  0x054E4B: INC HL (x4)       ; skip 4-byte header, point at bitmap');
console.log();

console.log('Phase 327 complete.');

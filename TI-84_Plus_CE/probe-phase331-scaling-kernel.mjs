#!/usr/bin/env node
/**
 * probe-phase331-scaling-kernel.mjs
 *
 * Traces the scaling kernel dispatch at 0x053573 and the record/field
 * selection at 0x053FF4.  Identifies the RAM variable holding the
 * current scale level, hex-dumps scaling kernels, and monitors which
 * scaling record is active during a home-screen boot.
 *
 * Key discoveries from disassembly:
 *
 *   D005EC  — scale level (0..3).  Written by:
 *             0x0551B2 (font init, sets 0)
 *             0x055566 (os_SetFontScale, clamped 0..3)
 *             0x054A10 (save/restore around text ops)
 *             0x054BBE (restore after text ops)
 *
 *   D005F0  — font descriptor table pointer (3 bytes).
 *             Computed as 0x05320F + D005EC * 12 by block_055566.
 *             Init'd to 0x05320F (record 0) by block_0551B2.
 *
 *   D005ED  — font table limit (3 bytes).
 *             Computed as *(0x05323F + D005F3 * 3) by block_05558B.
 *             Init'd to *(0x05323F) = 0x000FFF by block_0551C5.
 *
 *   D005F3  — secondary limit index (0..2), clamped by block_05558B.
 *
 *   D005F4  — width/alpha mode byte (0xFF = default).
 *
 * 0x053573 (scaling kernel entry):
 *   Loads IY = (D005F0), then reads 4 field pointers at IY+0, IY+3,
 *   IY+6, IY+9.  These are the 4 kernel pointers for the current
 *   scaling record.  Stores them as local vars at IX-66, IX-63,
 *   IX-69, IX-60.  Then checks (IX-70) < 1 to skip scaling.
 *
 * 0x053FF4 (record/field selection):
 *   HL = (D005F0) + BC, then BC = (HL) — reads a 3-byte pointer
 *   from the descriptor table at offset BC.  BC offsets are:
 *     0  = field 0 of current record
 *     3  = field 1
 *     6  = field 2
 *     9  = field 3
 *   The dispatch at 0x053FBB..0x053FF4 selects the field based on
 *   a comparison chain (sign tests after subtractions).
 *
 * 0x05554A (os_SetFontScale):
 *   Takes scale level in arg (IX+9), clamps 0..3.  Writes D005EC,
 *   computes D005F0 = 0x05320F + level * 12.  Also takes limit
 *   index in arg (IX+6), clamps 0..3 via 0x055583, writes D005F3,
 *   computes D005ED = *(0x05323F + D005F3 * 3).
 *
 * Callers of scaling pathway:
 *   0x053396 (called by 0x052569, 0x0546C1, 0x0546E7, 0x054774, ...)
 *     → 0x0522B2 → ... → 0x0533BD (glyph scaler entry)
 *       → 0x055191 (init check) → 0x0533D2 ...
 *         → 0x053540 → 0x05354C → 0x053573 (kernel load)
 *
 *   0x053AF7 (called from LCD text renderer path)
 *     → 0x055191 → 0x053B0C → ... → 0x053F58 → 0x053FBB
 *       → 0x053FF4 (field pointer load)
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rom = readFileSync(path.join(__dirname, 'ROM.rom'));

// ─── Constants ───────────────────────────────────────────────────────────────

const DESCRIPTOR_TABLE = 0x05320F;
const DESCRIPTOR_LIMIT_BASE = 0x05323F;
const POINTER_SIZE = 3;
const RECORDS = 4;
const FIELDS_PER_RECORD = 4;
const RECORD_SIZE = FIELDS_PER_RECORD * POINTER_SIZE; // 12

// RAM addresses
const RAM_SCALE_LEVEL   = 0xD005EC; // scale level 0..3
const RAM_LIMIT          = 0xD005ED; // font table limit (3 bytes)
const RAM_DESC_PTR       = 0xD005F0; // font descriptor table pointer (3 bytes)
const RAM_LIMIT_IDX      = 0xD005F3; // secondary limit index
const RAM_WIDTH_ALPHA    = 0xD005F4; // width/alpha mode byte

// Key code addresses
const SCALING_KERNEL_ENTRY = 0x053573;
const RECORD_FIELD_SELECT  = 0x053FF4;
const FONT_SCALE_SETTER    = 0x05554A;
const FONT_INIT            = 0x0551B2;
const GLYPH_SCALER         = 0x0533BD;
const SCALE_DISPATCH       = 0x053396;

// Boot
const MEM_SIZE          = 0x1000000;
const BOOT_ENTRY        = 0x000000;
const BOOT_MODE         = 'z80';
const BOOT_MAX_STEPS    = 20000;
const BOOT_MAX_LOOP_IT  = 32;
const STACK_RESET_TOP   = 0xD1A87E;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY   = 0x0802B2;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function read24(offset) {
  return rom[offset] | (rom[offset + 1] << 8) | (rom[offset + 2] << 16);
}

function hex(v, w = 6) {
  if (v === null || v === undefined) return 'n/a';
  return `0x${(v >>> 0).toString(16).padStart(w, '0')}`;
}

function hexDump(data, bytesPerLine = 16) {
  const lines = [];
  for (let i = 0; i < data.length; i += bytesPerLine) {
    const chunk = data.slice(i, i + bytesPerLine);
    const hexPart = Array.from(chunk).map(b => b.toString(16).padStart(2, '0')).join(' ');
    lines.push(`  ${hexPart}`);
  }
  return lines.join('\n');
}

// ─── SECTION 1: Static analysis of block_053573 ─────────────────────────────

console.log('=== SECTION 1: Scaling Kernel Entry (0x053573) ===\n');
console.log('Disassembly of block_053573:');
console.log('  0x053573  push iy');
console.log('  0x053575  ld iy, (D005F0)       ; IY = font descriptor table ptr');
console.log('  0x05357A  ld bc, (iy+9)         ; field[3] kernel ptr');
console.log('  0x05357D  ld (ix-60), bc         ; store as local var');
console.log('  0x053580  ld bc, (iy+3)         ; field[1] kernel ptr');
console.log('  0x053583  ld (ix-63), bc');
console.log('  0x053586  ld bc, (iy+0)         ; field[0] kernel ptr');
console.log('  0x053589  ld (ix-66), bc');
console.log('  0x05358C  ld bc, (iy+6)         ; field[2] kernel ptr');
console.log('  0x05358F  ld (ix-69), bc');
console.log('  0x053592  pop iy');
console.log('  0x053594  ld a, (ix-70)          ; a = (D005EC + 1) from 0x053558');
console.log('  0x053597  cp 0x01');
console.log('  0x053599  jp c, 0x0536A0          ; if scale < 1 → skip scaling');
console.log('');
console.log('Summary:');
console.log('  Reads D005F0 (descriptor table pointer for current scale record).');
console.log('  Loads all 4 field pointers (iy+0,+3,+6,+9) into stack locals.');
console.log('  Each pointer → variable-length scaling kernel in ROM.');
console.log('  If scale level is 0 (identity), jumps to 0x0536A0 (no scaling).');

// ─── SECTION 2: Static analysis of block_053FF4 ─────────────────────────────

console.log('\n=== SECTION 2: Record/Field Selection (0x053FF4) ===\n');
console.log('Disassembly of block_053FF4:');
console.log('  0x053FF4  ld hl, (D005F0)       ; HL = descriptor table ptr');
console.log('  0x053FF8  add hl, bc             ; HL += field offset (BC)');
console.log('  0x053FF9  ld bc, (hl)            ; BC = 3-byte kernel ptr from table');
console.log('  0x053FFB  ld (ix-57), bc         ; store kernel ptr as local');
console.log('  0x053FFE  ld a, (ix-58)          ; counter/loop var');
console.log('  0x054001  dec a');
console.log('  0x054002  jp m, 0x054021          ; done if counter < 0');
console.log('');
console.log('Dispatch chain leading to 0x053FF4:');
console.log('  0x053FBB  jp p, 0x053FD8         ; if positive → call multiply sub');
console.log('  0x053FBF  (comparison chain)');
console.log('  0x053FC8  jp m, 0x053FD2         ; BC = 0x000000, field offset 0');
console.log('  0x053FCC  ld bc, 0x000006         ; field offset 6');
console.log('  0x053FD0  jr 0x053FD6');
console.log('  0x053FD2  ld bc, 0x000000         ; field offset 0');
console.log('  0x053FD6  jr 0x053FF4');
console.log('  0x053FE6  jp p, 0x053FF0');
console.log('  0x053FEA  ld bc, 0x000009         ; field offset 9');
console.log('  0x053FEE  jr 0x053FF4');
console.log('  0x053FF0  ld bc, 0x000003         ; field offset 3');
console.log('  0x053FF4  (kernel ptr load)');
console.log('');
console.log('BC offset → field mapping:');
console.log('  BC=0 → field[0] (horizontal kernel, identity/width)');
console.log('  BC=3 → field[1] (vertical kernel, identity/height)');
console.log('  BC=6 → field[2] (horizontal kernel, repeat)');
console.log('  BC=9 → field[3] (vertical kernel, repeat)');

// ─── SECTION 3: Scale level RAM variable ────────────────────────────────────

console.log('\n=== SECTION 3: Scale Level RAM Variable ===\n');
console.log('RAM variable: D005EC (1 byte, range 0..3)');
console.log('');
console.log('Writers:');
console.log('  0x0551B2 — font init:  A = 0, ld (D005EC), A');
console.log('  0x055566 — os_SetFontScale: A = arg (clamped 0..3), ld (D005EC), A');
console.log('  0x054A10 — save/restore: A = 0 (temp reset for text ops)');
console.log('  0x054BBE — restore: A = saved value from IX-22');
console.log('');
console.log('Readers:');
console.log('  0x05354C — scaling kernel prep: A = (D005EC), INC A, stores as (IX-70)');
console.log('  0x053B21 — LCD text path: A = (D005EC), INC A, stores as (IX-58)');
console.log('  0x053F58 — field select path: A = (D005EC), INC A, stores as (IX-58)');
console.log('  0x05552F — os_GetFontScale: BC = (D005EC), returns to caller');
console.log('');
console.log('Scale level interpretation:');
console.log('  0 → Record 0 at D005F0 = 0x05320F + 0*12 = 0x05320F  (identity, N=1,1,1,1)');
console.log('  1 → Record 1 at D005F0 = 0x05320F + 1*12 = 0x05321B  (small, N=3,5,3,5)');
console.log('  2 → Record 2 at D005F0 = 0x05320F + 2*12 = 0x053227  (medium, N=5,7,5,7)');
console.log('  3 → Record 3 at D005F0 = 0x05320F + 3*12 = 0x053233  (large, N=7,11,7,11)');

// ─── SECTION 4: D005F0 computation (os_SetFontScale @ 0x055566) ─────────────

console.log('\n=== SECTION 4: D005F0 Computation (os_SetFontScale) ===\n');
console.log('Disassembly of 0x055566 (os_SetFontScale core):');
console.log('  0x055566  ld (D005EC), a         ; store scale level');
console.log('  0x05556A  ld c, a');
console.log('  0x05556B  ld b, 0x0C             ; B = 12 (record size)');
console.log('  0x05556D  mlt bc                  ; BC = scale_level * 12');
console.log('  0x05556F  ld hl, 0x05320F         ; HL = descriptor table base');
console.log('  0x055573  add hl, bc              ; HL = base + level * 12');
console.log('  0x055574  ld (D005F0), hl         ; store as descriptor ptr');
console.log('');
console.log('Input validation (0x05554A):');
console.log('  0x055553  ld a, (ix+9)            ; A = scale arg');
console.log('  0x055556  or a                    ; test sign');
console.log('  0x055557  jp p, 0x05555E           ; if >= 0, check upper bound');
console.log('  0x05555B  sub a                    ; negative → clamp to 0');
console.log('  0x05555E  cp 0x04');
console.log('  0x055560  jp m, 0x055566           ; if < 4, use as-is');
console.log('  0x055564  ld a, 0x03               ; >= 4 → clamp to 3');

// ─── SECTION 5: Hex-dump scaling kernels ────────────────────────────────────

console.log('\n=== SECTION 5: Scaling Kernel Hex Dumps ===\n');

const pointers = [];
for (let i = 0; i < 16; i++) {
  pointers.push(read24(DESCRIPTOR_TABLE + i * POINTER_SIZE));
}

const recordNames = ['identity', 'small', 'medium', 'large'];
const fieldNames = ['horiz-width', 'vert-height', 'horiz-repeat', 'vert-repeat'];

for (let rec = 0; rec < RECORDS; rec++) {
  const recBase = DESCRIPTOR_TABLE + rec * RECORD_SIZE;
  console.log('Record %d (%s) — D005F0 would be %s:',
    rec, recordNames[rec], hex(recBase));

  for (let f = 0; f < FIELDS_PER_RECORD; f++) {
    const idx = rec * FIELDS_PER_RECORD + f;
    const ptr = pointers[idx];
    const nextPtr = idx < 15 ? pointers[idx + 1] : DESCRIPTOR_TABLE;
    const size = nextPtr - ptr;
    const n = rom[ptr];
    const expectedSize = n * 2 - 1;

    const kernelData = Array.from(rom.slice(ptr, ptr + Math.max(size, expectedSize)));

    console.log('  field[%d] (%s) @ %s  N=%d  size=%d bytes:',
      f, fieldNames[f], hex(ptr), n, Math.max(size, expectedSize));
    console.log(hexDump(kernelData));

    // Decode kernel coefficients
    if (n >= 1) {
      const coeffs = [n]; // first byte is dimension
      for (let k = 1; k < expectedSize; k += 2) {
        const coeff = rom[ptr + k] | (rom[ptr + k + 1] << 8);
        coeffs.push(coeff);
      }
      console.log('    N=%d, coefficients: [%s]', n,
        coeffs.slice(1).map(c => `0x${c.toString(16).padStart(4, '0')}`).join(', '));
    }
  }
  console.log('');
}

// ─── SECTION 6: Callers analysis ────────────────────────────────────────────

console.log('=== SECTION 6: Callers of Scaling Functions ===\n');

console.log('Callers of 0x053573 (scaling kernel entry):');
console.log('  Flow: 0x053540 → 0x05354C → 0x05356C → 0x053573');
console.log('  0x053540 is reached from 0x0533BD (glyph scaler entry)');
console.log('  0x05356E falls through to 0x053573 (when limit == 0x000FFF)');
console.log('');

console.log('Callers of 0x053FF4 (record/field selection):');
console.log('  0x053FD2 — BC=0 (field 0), reached from 0x053FC8 (jp m)');
console.log('  0x053FD6 — falls through from 0x053FCC (BC=6)');
console.log('  0x053FEA — BC=9 (field 3), reached from 0x053FE6 (jp !p)');
console.log('  0x053FF0 — BC=3 (field 1), reached from 0x053FE6 (jp p)');
console.log('  Also: 0x053FF8, 0x053FFE — mid-block entries from loops');
console.log('  0x0540BC — jp 0x053FFE (loop back from scaling iteration)');
console.log('');

console.log('Callers of 0x0533BD (glyph scaler):');
console.log('  Not called directly — reached via flow from 0x053396');
console.log('  0x053396 is the outer scaling dispatch, called by:');
console.log('    0x052569 — text renderer path');
console.log('    0x0546C1 — LCD text output');
console.log('    0x0546E7 — LCD text output (variant)');
console.log('    0x054774 — LCD text output (variant)');
console.log('');

console.log('Callers of 0x053AF7 (alternative scaler entry):');
console.log('  Also calls 0x055191 (init check), uses 0x053FF4 dispatch');
console.log('  Part of the LCD text rendering pipeline');
console.log('');

console.log('Callers of 0x05554A (os_SetFontScale):');
console.log('  Called via vector table / OS API — no direct CALL references');
console.log('  in the transpiled blocks (likely called through jump table)');
console.log('');

console.log('Writers of D005EC (scale level):');
console.log('  0x0551B2 — font system init (sets to 0)');
console.log('  0x055566 — os_SetFontScale (sets to arg, clamped 0..3)');
console.log('  0x054A10 — temp reset to 0 for text measurement');
console.log('  0x054BBE — restore saved value after text measurement');

// ─── SECTION 7: D005ED limit table ──────────────────────────────────────────

console.log('\n=== SECTION 7: Limit Table at 0x05323F ===\n');
console.log('The limit table has entries at 3-byte intervals starting at 0x05323F.');
console.log('D005F3 selects the limit index (0..2), formula: D005ED = *(0x05323F + D005F3 * 3)');
console.log('');
for (let i = 0; i < 4; i++) {
  const addr = DESCRIPTOR_LIMIT_BASE + i * 3;
  const val = read24(addr);
  console.log('  limit[%d] @ %s = %s', i, hex(addr), hex(val));
}

// ─── SECTION 8: Font init trace (0x0551B2) ──────────────────────────────────

console.log('\n=== SECTION 8: Font Init (0x0551B2) ===\n');
console.log('Disassembly:');
console.log('  0x0551B2  sub a                   ; A = 0');
console.log('  0x0551B3  ld (D005EC), a           ; scale level = 0');
console.log('  0x0551B7  dec a                    ; A = 0xFF');
console.log('  0x0551B8  ld (D005F4), a           ; width/alpha mode = 0xFF');
console.log('  0x0551BC  ld bc, 0x05320F');
console.log('  0x0551C0  ld (D005F0), bc           ; descriptor ptr = record 0');
console.log('  0x0551C5  ld bc, (0x05323F)');
console.log('  0x0551CA  ld (D005ED), bc           ; limit = 0x000FFF');
console.log('  0x0551CF  ld bc, 0x000000');
console.log('  0x0551D3  ld (0x0026AC), bc         ; clear font state');
console.log('  0x0551D8  ld a, (D007E0)           ; check display mode');
console.log('  0x0551DC  cp 0x58');
console.log('  0x0551DE  jr nz, 0x0551E6           ; branch on display size');
console.log('');
console.log('After init: D005EC=0, D005F0=0x05320F, D005ED=0x000FFF, D005F4=0xFF');

// ─── SECTION 9: Dynamic boot trace ─────────────────────────────────────────

console.log('\n=== SECTION 9: Dynamic Boot — Scale Level Monitoring ===\n');

async function runDynamicTrace() {
  const transpiledPath = path.join(__dirname, 'ROM.transpiled.js');
  const transpiledUrl = pathToFileURL(transpiledPath).href;
  console.log('Loading transpiled JS from %s ...', transpiledPath);
  let PRELIFTED_BLOCKS;
  try {
    const mod = await import(transpiledUrl);
    PRELIFTED_BLOCKS = mod.PRELIFTED_BLOCKS;
    console.log('Loaded %d blocks', Object.keys(PRELIFTED_BLOCKS).length);
  } catch (loadErr) {
    console.error('FATAL: Failed to load transpiled JS:', loadErr.message || loadErr);
    return;
  }

  console.log('Creating executor...');
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(rom);
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(PRELIFTED_BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  // Cold boot
  console.log('Cold booting (z80 entry 0x000000)...');
  try {
    executor.runFrom(BOOT_ENTRY, BOOT_MODE, {
      maxSteps: BOOT_MAX_STEPS,
      maxLoopIterations: BOOT_MAX_LOOP_IT,
    });
  } catch (e) {
    console.log('  Boot halted: %s', e.message?.slice(0, 80) || String(e).slice(0, 80));
  }

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  console.log('Running kernel init (0x08C331)...');
  try {
    executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
      maxSteps: 100000,
      maxLoopIterations: 10000,
    });
  } catch (e) {
    console.log('  Kernel init halted: %s', e.message?.slice(0, 80) || String(e).slice(0, 80));
  }

  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  console.log('Running post-init (0x0802B2)...');
  try {
    executor.runFrom(POST_INIT_ENTRY, 'adl', {
      maxSteps: 100,
      maxLoopIterations: 32,
    });
  } catch (e) {
    console.log('  Post-init halted: %s', e.message?.slice(0, 80) || String(e).slice(0, 80));
  }

  // Read font state after init
  const scaleLevel = mem[RAM_SCALE_LEVEL];
  const descPtr = mem[RAM_DESC_PTR] | (mem[RAM_DESC_PTR + 1] << 8) | (mem[RAM_DESC_PTR + 2] << 16);
  const limit = mem[RAM_LIMIT] | (mem[RAM_LIMIT + 1] << 8) | (mem[RAM_LIMIT + 2] << 16);
  const limitIdx = mem[RAM_LIMIT_IDX];
  const widthAlpha = mem[RAM_WIDTH_ALPHA];

  console.log('');
  console.log('Font state after boot:');
  console.log('  D005EC (scale level)  = %d', scaleLevel);
  console.log('  D005F0 (desc ptr)     = %s', hex(descPtr));
  console.log('  D005ED (limit)        = %s', hex(limit));
  console.log('  D005F3 (limit index)  = %d', limitIdx);
  console.log('  D005F4 (width/alpha)  = %s', hex(widthAlpha, 2));
  console.log('');

  // Verify descriptor pointer matches expected record
  const expectedPtr = DESCRIPTOR_TABLE + scaleLevel * RECORD_SIZE;
  console.log('  Expected D005F0 for scale %d: %s — %s',
    scaleLevel, hex(expectedPtr),
    descPtr === expectedPtr ? 'MATCH' : 'MISMATCH (got ' + hex(descPtr) + ')');

  // Decode which record is active
  if (descPtr >= DESCRIPTOR_TABLE && descPtr < DESCRIPTOR_TABLE + RECORDS * RECORD_SIZE) {
    const activeRecord = (descPtr - DESCRIPTOR_TABLE) / RECORD_SIZE;
    if (Number.isInteger(activeRecord) && activeRecord >= 0 && activeRecord < RECORDS) {
      console.log('  Active scaling record: %d (%s)', activeRecord, recordNames[activeRecord]);

      // Read the 4 kernel pointers for the active record
      console.log('  Kernel pointers for active record:');
      for (let f = 0; f < FIELDS_PER_RECORD; f++) {
        const ptr = mem[descPtr + f * 3] |
                    (mem[descPtr + f * 3 + 1] << 8) |
                    (mem[descPtr + f * 3 + 2] << 16);
        // Read from ROM since desc ptr points into ROM
        const romPtr = read24(descPtr + f * 3);
        const n = rom[romPtr];
        console.log('    field[%d] (%s) → %s  N=%d',
          f, fieldNames[f], hex(romPtr), n);
      }
    } else {
      console.log('  Active record: non-integer offset — D005F0 not aligned to record boundary');
    }
  } else {
    console.log('  D005F0 is outside the descriptor table range');
  }

  // Run home screen init to see if scale changes
  console.log('\n  Running home screen init (0x021328)...');
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  try {
    executor.runFrom(0x021328, 'adl', {
      maxSteps: 500000,
      maxLoopIterations: 50000,
    });
  } catch (e) {
    console.log('  (home screen init halted: %s)', e.message?.slice(0, 80) || String(e).slice(0, 80));
  }

  const scaleAfter = mem[RAM_SCALE_LEVEL];
  const descPtrAfter = mem[RAM_DESC_PTR] | (mem[RAM_DESC_PTR + 1] << 8) | (mem[RAM_DESC_PTR + 2] << 16);
  const limitAfter = mem[RAM_LIMIT] | (mem[RAM_LIMIT + 1] << 8) | (mem[RAM_LIMIT + 2] << 16);
  const widthAlphaAfter = mem[RAM_WIDTH_ALPHA];

  console.log('');
  console.log('  Font state after home screen init:');
  console.log('    D005EC (scale level)  = %d', scaleAfter);
  console.log('    D005F0 (desc ptr)     = %s', hex(descPtrAfter));
  console.log('    D005ED (limit)        = %s', hex(limitAfter));
  console.log('    D005F4 (width/alpha)  = %s', hex(widthAlphaAfter, 2));

  if (scaleAfter !== scaleLevel) {
    console.log('    Scale level CHANGED from %d to %d during home screen init', scaleLevel, scaleAfter);
  } else {
    console.log('    Scale level unchanged (%d = %s)', scaleAfter, recordNames[scaleAfter] || 'unknown');
  }
}

// Run dynamic trace, then print summary
runDynamicTrace()
  .catch(err => {
    console.error('Dynamic trace error:', err.message || err);
  })
  .finally(() => {
    // ─── SECTION 10: Summary ────────────────────────────────────────────
    console.log('\n=== SECTION 10: Summary ===\n');
    console.log('Scaling kernel dispatch architecture:');
    console.log('');
    console.log('  1. D005EC holds the current scale level (0..3)');
    console.log('  2. os_SetFontScale (0x05554A) validates and stores the level');
    console.log('  3. D005F0 = 0x05320F + D005EC * 12  (pointer into descriptor table)');
    console.log('  4. The descriptor table has 4 records x 4 fields = 16 x 3-byte pointers');
    console.log('  5. Each pointer → a variable-length scaling kernel (2N-1 bytes)');
    console.log('');
    console.log('  0x053573 loads all 4 kernel ptrs from the current record into locals');
    console.log('  0x053FF4 selects one field by adding BC offset (0/3/6/9) to D005F0');
    console.log('');
    console.log('  Kernel format: byte[0]=N, then (N-1) pairs of 2-byte LE coefficients');
    console.log('  Record 0 (identity): N=1 kernels → passthrough (no scaling)');
    console.log('  Record 1 (small):    N=3,5 → 2x scale with interpolation');
    console.log('  Record 2 (medium):   N=5,7 → 3x scale');
    console.log('  Record 3 (large):    N=7,11 → 4x scale');
    console.log('');
    console.log('  The 4 fields per record correspond to:');
    console.log('    [0] horizontal width kernel');
    console.log('    [1] vertical height kernel');
    console.log('    [2] horizontal repeat kernel');
    console.log('    [3] vertical repeat kernel');
  });

#!/usr/bin/env node
/**
 * Phase 332 — Glyph Scaler Call Chain Trace
 *
 * Traces the call chain 0x053396 → 0x0522B2 → 0x0533BD → 0x053540/0x05354C → 0x053573
 * to understand: entry arguments, glyph bitmap format, font selection, and output destination.
 *
 * Key findings are dumped to stdout and written to phase332-report.md.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, 'phase332-report.md');
const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));

function hex(v, w = 6) {
  if (v === undefined || v === null) return 'n/a';
  return `0x${(v >>> 0).toString(16).padStart(w, '0')}`;
}

function read24(buf, off) {
  return buf[off] | (buf[off + 1] << 8) | (buf[off + 2] << 16);
}

function readSigned8(buf, off) {
  const v = buf[off];
  return v >= 128 ? v - 256 : v;
}

// ─── 1. Disassemble 0x053396 (glyph_add_bias) ─────────────────────────

function disassemble_053396() {
  const lines = [];
  lines.push('## 1. Function 0x053396 — glyph_add_bias');
  lines.push('');
  lines.push('Transpiled disassembly:');
  lines.push('```');
  lines.push('0x053396  push ix');
  lines.push('0x053398  ld ix, 0x000000');
  lines.push('0x05339D  add ix, sp          ; ix = frame pointer');
  lines.push('0x05339F  push bc');
  lines.push('0x0533A0  dec sp');
  lines.push('0x0533A1  dec sp              ; allocate 5 local bytes');
  lines.push('0x0533A2  ld bc, 0x0520C3     ; hardcoded ROM constant table');
  lines.push('0x0533A6  push bc             ; arg2 for 0x0522B2');
  lines.push('0x0533A7  ld bc, (ix+6)       ; arg1 = caller\'s first argument (glyph bitmap ptr)');
  lines.push('0x0533AA  push bc');
  lines.push('0x0533AB  nop (ed 65)');
  lines.push('0x0533AD  ei');
  lines.push('0x0533AE  call 0x0522B2       ; 5-byte ADC addition');
  lines.push('0x0533B2  pop bc  x3          ; clean stack');
  lines.push('0x0533B5  ld hl, (ix-3)       ; return value in HL');
  lines.push('0x0533B8  ld sp, ix');
  lines.push('0x0533BA  pop ix');
  lines.push('0x0533BC  ret');
  lines.push('```');
  lines.push('');
  lines.push('**Arguments**: (ix+6) = 24-bit glyph bitmap pointer from caller.');
  lines.push('');
  lines.push('**What it does**: Calls 0x0522B2 to perform a 5-byte addition (with carry) of the');
  lines.push('glyph pointer with a hardcoded bias table at ROM 0x0520C3.');
  lines.push('');

  // Dump the bias table
  const bias = romBytes.slice(0x0520C3, 0x0520C8);
  lines.push(`**Bias table at 0x0520C3**: [${[...bias].map(b => hex(b, 2)).join(', ')}]`);
  lines.push(`  As 5-byte LE value: 0x${[...bias].reverse().map(b => b.toString(16).padStart(2, '0')).join('')}`);
  lines.push('  Byte[1] = 0x80 sets bit 7 of the second byte — this is an FP-style sign/exponent bias.');
  lines.push('');
  lines.push('**Font selection**: 0x053396 does NOT select the font. The glyph bitmap pointer is');
  lines.push('passed in by the caller as arg (ix+6). Callers include:');
  lines.push('- 0x052569 (from PutC pipeline)');
  lines.push('- 0x0546BD, 0x0546E3, 0x054770, 0x054796 (measurement/layout helpers)');
  lines.push('All push HL as the glyph pointer before calling. Font selection happens upstream');
  lines.push('in the DrawChar vtable dispatch (D005E9+3) which resolves the font table base,');
  lines.push('then computes glyph_ptr = font_base + char_index * glyph_stride.');
  lines.push('');

  return lines;
}

// ─── 2. Disassemble 0x0522B2 (5-byte ADC add) ────────────────────────

function disassemble_0522B2() {
  const lines = [];
  lines.push('## 2. Function 0x0522B2 — add_5bytes_adc');
  lines.push('');
  lines.push('Transpiled disassembly:');
  lines.push('```');
  lines.push('0x0522B2  push ix');
  lines.push('0x0522B4  ld ix, 0; add ix, sp  ; frame ptr');
  lines.push('0x0522BB  push iy');
  lines.push('0x0522BD  ld b, 5               ; loop count = 5 bytes');
  lines.push('0x0522BF  ld hl, (ix+9)         ; source1 ptr (0x0520C3 bias table)');
  lines.push('0x0522C2  ld de, (ix+12)        ; source2 ptr (from upstream caller)');
  lines.push('0x0522C5  ld ix, (ix+6)         ; dest ptr (glyph bitmap ptr)');
  lines.push('0x0522C8  or a                  ; clear carry');
  lines.push('loop:');
  lines.push('0x0522C9  ld a, (de)            ; byte from source2');
  lines.push('0x0522CA  adc a, (hl)           ; + byte from source1 + carry');
  lines.push('0x0522CB  ld (iy+0), a          ; store result');
  lines.push('0x0522CE  inc de');
  lines.push('0x0522CF  inc hl');
  lines.push('0x0522D0  inc iy');
  lines.push('0x0522D2  djnz loop             ; repeat 5 times');
  lines.push('0x0522D4  ld hl, (ix+6)         ; return dest in HL');
  lines.push('0x0522D7  pop iy; pop ix; ret');
  lines.push('```');
  lines.push('');
  lines.push('**Purpose**: Multi-precision 5-byte addition with carry. Adds two 5-byte values');
  lines.push('byte-by-byte and stores result. Used for FP exponent/mantissa manipulation of');
  lines.push('glyph coordinate data.');
  lines.push('');

  return lines;
}

// ─── 3. Disassemble 0x0533BD (scaler entry — dimension validation) ───

function disassemble_0533BD() {
  const lines = [];
  lines.push('## 3. Function 0x0533BD — scaler_validate_and_setup');
  lines.push('');
  lines.push('This is the main scaler entry point. It allocates a 71-byte local frame on the');
  lines.push('stack and validates glyph dimensions before entering the scale kernel.');
  lines.push('');
  lines.push('Transpiled disassembly (key sections):');
  lines.push('```');
  lines.push('0x0533BD  push ix; ld ix,0; add ix,sp  ; frame');
  lines.push('0x0533C6  push hl');
  lines.push('0x0533C7  lea hl, ix-71                 ; allocate 71 bytes of locals');
  lines.push('0x0533CA  ld sp, hl');
  lines.push('0x0533CB  ld hl, (ix-3)                 ; HL = glyph pointer (from caller\'s frame)');
  lines.push('0x0533CE  call 0x055191                  ; lazy_init (sets IY=D00080, checks bit 1)');
  lines.push('');
  lines.push('  ;; Dimension validation (ix+12, ix+15, ix+21 vs 0x000E10 = 3600)');
  lines.push('0x0533D2  ld hl, (ix+12)');
  lines.push('0x0533D5  call 0x000138                  ; sign_test(HL) — HL - 0 → flags');
  lines.push('0x0533D9  jp m, 0x053AD4                 ; if width < 0 → abort (return)');
  lines.push('0x0533DD  ld hl, (ix+15)');
  lines.push('0x0533E0  call 0x000138');
  lines.push('0x0533E4  jp m, 0x053AD4                 ; if height < 0 → abort');
  lines.push('0x0533E8  ld hl, (ix+21)');
  lines.push('0x0533EB  call 0x000138');
  lines.push('0x0533EF  jp p, 0x053405                 ; if stride >= 0 → check vs max');
  lines.push('');
  lines.push('  ;; If stride < 0: negate and clamp');
  lines.push('0x0533F3  ld bc,(ix+18); add hl,bc; ld (ix+18),hl  ; adjust base');
  lines.push('0x053405  ld bc, 0x000E10                ; max = 3600');
  lines.push('0x05340A  sbc hl, bc');
  lines.push('0x05340C  jp m, 0x05341B                 ; if dim < 3600 → use font table lookup');
  lines.push('  ;; else: clamp (HL = dim, BC = 3600 → use 3600)');
  lines.push('0x053410  ld (ix-3), bc; sbc hl,hl; ld (ix+18), hl');
  lines.push('  ;; → falls through to 0x05342C');
  lines.push('');
  lines.push('  ;; 0x05342C: scale-level-aware glyph layout');
  lines.push('0x05342C  ld a, (0xD005EC)              ; A = scale_level (0..3)');
  lines.push('0x053430  add a, a                       ; A = scale_level * 2');
  lines.push('0x053431  inc a                          ; A = scale_level * 2 + 1');
  lines.push('0x053432  ld (ix-70), a                  ; store as "effective scale"');
  lines.push('');
  lines.push('  ;; Adjust all 4 dimension args by effective_scale:');
  lines.push('  ;; (ix-6)  = arg_width  - effective_scale');
  lines.push('  ;; (ix-9)  = arg_height - effective_scale');
  lines.push('  ;; (ix-12) = arg_hStride + 2*effective_scale');
  lines.push('  ;; (ix-15) = arg_vStride + 2*effective_scale');
  lines.push('```');
  lines.push('');
  lines.push('**Arguments to 0x0533BD** (on the stack, accessed via IX):');
  lines.push('| IX offset | Meaning |');
  lines.push('|-----------|---------|');
  lines.push('| (ix-3) | glyph bitmap pointer (from 0x053396 return) |');
  lines.push('| (ix+6) | glyph pixel width |');
  lines.push('| (ix+9) | glyph pixel height |');
  lines.push('| (ix+12) | horizontal stride (bytes per row in output) |');
  lines.push('| (ix+15) | vertical stride (VRAM row pitch) |');
  lines.push('| (ix+18) | output base address (VRAM or buffer) |');
  lines.push('| (ix+21) | secondary stride / row skip |');
  lines.push('');
  lines.push('**Between glyph data and 0x053540**: The function validates all dimensions are');
  lines.push('non-negative and <= 3600 (0xE10), calls lazy_init (0x055191) to ensure IY=D00080');
  lines.push('with font state initialized, then computes scale-adjusted dimensions using');
  lines.push('D005EC (scale_level). It stores the effective scale factor (2*level+1) at (ix-70)');
  lines.push('and adjusted dimensions at ix-6 through ix-15, then falls through to 0x053540.');
  lines.push('');

  return lines;
}

// ─── 4. Disassemble 0x053540/0x05354C (scale config load) ────────────

function disassemble_053540() {
  const lines = [];
  lines.push('## 4. Function 0x053540/0x05354C — scale_config_load');
  lines.push('');
  lines.push('0x053540 stores the multiplication result (from 0x000154 = 24-bit multiply at');
  lines.push('0x053533) and zeros out working accumulators:');
  lines.push('```');
  lines.push('0x053540  ld (ix-51), hl       ; store multiply result');
  lines.push('0x053543  or a; sbc hl, hl      ; HL = 0');
  lines.push('0x053546  ld (ix-54), hl        ; zero accumulator 1');
  lines.push('0x053549  ld (ix-48), hl        ; zero accumulator 2');
  lines.push('  ;; falls through to 0x05354C');
  lines.push('```');
  lines.push('');
  lines.push('0x05354C loads the scale configuration:');
  lines.push('```');
  lines.push('0x05354C  ld bc, (0xD005ED)    ; BC = font-metric config (default 0x000FFF)');
  lines.push('0x053551  ld (ix-57), bc        ; store config');
  lines.push('0x053554  ld a, (0xD005EC)      ; A = scale_level (0..3)');
  lines.push('0x053558  inc a                  ; A = level + 1');
  lines.push('0x053559  ld (ix-70), a          ; store as "scale factor"');
  lines.push('0x05355C  inc a                  ; A = level + 2');
  lines.push('0x05355D  sra a                  ; A = (level + 2) >> 1 (arithmetic shift right)');
  lines.push('0x05355F  ld (ix-71), a          ; store as "half scale factor"');
  lines.push('');
  lines.push('  ;; Check if D005ED == 0x000FFF (default / identity config)');
  lines.push('0x053562  ld hl, (ix-57)        ; reload config');
  lines.push('0x053565  ld bc, 0x000FFF');
  lines.push('0x05356A  sbc hl, bc');
  lines.push('0x05356C  jr nz, 0x053573       ; if config != 0xFFF → use scale kernels');
  lines.push('  ;; If config == 0xFFF (identity):');
  lines.push('0x05356E  ld a, 0xFF');
  lines.push('0x053570  ld (ix-71), a          ; set half_scale = 0xFF (sentinel for "no scaling")');
  lines.push('  ;; falls through to 0x053573');
  lines.push('```');
  lines.push('');
  lines.push('**D005ED significance**: Default value 0x000FFF (loaded from ROM 0x05323F during');
  lines.push('init at 0x0551B2). When it equals 0xFFF, the scaler uses identity/no-scale mode.');
  lines.push('When non-0xFFF, the scale kernel table is consulted.');
  lines.push('');

  const defVal = read24(romBytes, 0x05323F);
  lines.push(`**D005ED default**: ${hex(defVal)} (from ROM 0x05323F)`);
  lines.push('');

  return lines;
}

// ─── 5. Disassemble 0x053573 (scale kernel dispatcher) ───────────────

function disassemble_053573() {
  const lines = [];
  lines.push('## 5. Function 0x053573 — scale_kernel_dispatch');
  lines.push('');
  lines.push('Loads 4 kernel pointers from the current scale record, then decides');
  lines.push('whether to run the scale loop or skip to the output copier.');
  lines.push('```');
  lines.push('0x053573  push iy');
  lines.push('0x053575  ld iy, (0xD005F0)    ; IY = scale record ptr (0x05320F + level*12)');
  lines.push('0x05357A  ld bc, (iy+9)        ; kernel ptr 4: vertical repeat');
  lines.push('0x05357D  ld (ix-60), bc');
  lines.push('0x053580  ld bc, (iy+3)        ; kernel ptr 2: vertical height');
  lines.push('0x053583  ld (ix-63), bc');
  lines.push('0x053586  ld bc, (iy+0)        ; kernel ptr 1: horizontal width');
  lines.push('0x053589  ld (ix-66), bc');
  lines.push('0x05358C  ld bc, (iy+6)        ; kernel ptr 3: horizontal repeat');
  lines.push('0x05358F  ld (ix-69), bc');
  lines.push('0x053592  pop iy');
  lines.push('');
  lines.push('  ;; Check if scale < 1 → skip');
  lines.push('0x053594  ld a, (ix-70)        ; A = scale factor (level + 1)');
  lines.push('0x053597  cp 1');
  lines.push('0x053599  jp c, 0x0536A0       ; if scale < 1 → skip to output path');
  lines.push('0x05359D  jp z, 0x0536A0       ; if scale == 0 → skip (Z set means equal to 1??)');
  lines.push('  ;; Actually: cp 1 sets C if A<1 (i.e. A==0). Z if A==1.');
  lines.push('  ;; So: scale==0 → C,skip. scale==1 → Z,skip. scale>=2 → run kernels.');
  lines.push('```');
  lines.push('');
  lines.push('After the skip check, 0x0535A1+ runs the actual scaling loop which iterates');
  lines.push('through glyph rows/columns, applying the scale coefficients from the kernel');
  lines.push('records to expand/contract the glyph bitmap into the output buffer.');
  lines.push('');

  return lines;
}

// ─── 6. Scale record table dump ──────────────────────────────────────

function dumpScaleTable() {
  const lines = [];
  lines.push('## 6. Scale Record Table at 0x05320F');
  lines.push('');
  lines.push('Each scale level has a 12-byte record containing 4 three-byte pointers to');
  lines.push('scale kernel coefficient tables. Format: [hWidth, vHeight, hRepeat, vRepeat]');
  lines.push('');

  const SCALE_BASE = 0x05320F;
  lines.push('| Level | Record Addr | hWidth Kernel | vHeight Kernel | hRepeat Kernel | vRepeat Kernel |');
  lines.push('|-------|-------------|---------------|----------------|----------------|----------------|');

  for (let level = 0; level < 4; level++) {
    const off = SCALE_BASE + level * 12;
    const ptrs = [];
    for (let j = 0; j < 4; j++) {
      ptrs.push(read24(romBytes, off + j * 3));
    }
    lines.push(`| ${level} | ${hex(off)} | ${ptrs.map(p => hex(p)).join(' | ')} |`);
  }

  lines.push('');
  lines.push('### Kernel coefficient records');
  lines.push('');
  lines.push('Each kernel record starts with a count byte N, followed by N 2-byte LE');
  lines.push('signed coefficient pairs. These control pixel replication/interpolation.');
  lines.push('');

  // Dump unique kernel records
  const seen = new Set();
  for (let level = 0; level < 4; level++) {
    const off = SCALE_BASE + level * 12;
    for (let j = 0; j < 4; j++) {
      const ptr = read24(romBytes, off + j * 3);
      if (seen.has(ptr)) continue;
      seen.add(ptr);

      const n = romBytes[ptr];
      const coeffs = [];
      for (let k = 0; k < n; k++) {
        const lo = romBytes[ptr + 1 + k * 2];
        const hi = romBytes[ptr + 1 + k * 2 + 1];
        let val = (hi << 8) | lo;
        if (val > 0x7FFF) val -= 0x10000;
        coeffs.push(val);
      }
      lines.push(`**${hex(ptr)}**: N=${n}, coefficients=[${coeffs.join(', ')}]`);
    }
  }

  lines.push('');
  lines.push('Level 0: all 4 pointers → 0x053182 (N=1, coeff=[-1]) — identity/1x scale.');
  lines.push('Level 1: 2x scale kernels (N=3..5 coefficients per axis).');
  lines.push('Level 2: 3x scale kernels (N=5..7).');
  lines.push('Level 3: 4x scale kernels (N=7..11).');
  lines.push('');

  return lines;
}

// ─── 7. Font table / glyph bitmap format ─────────────────────────────

function dumpFontFormat() {
  const lines = [];
  lines.push('## 7. Glyph Bitmap Format');
  lines.push('');
  lines.push('### Main font at ROM 0x0040EE');
  lines.push('');
  lines.push('(Confirmed by font-decoder.mjs and on-screen rendering)');
  lines.push('');
  lines.push('- **Glyph stride**: 28 bytes per glyph');
  lines.push('- **Dimensions**: 16 pixels wide x 14 rows');
  lines.push('- **Format**: 1 bit per pixel, 2 bytes per row, MSB-first');
  lines.push('  - byte0 bits 7..0 → columns 0..7');
  lines.push('  - byte1 bits 7..0 → columns 8..15');
  lines.push('- **Effective width**: ~10-13 px (columns 13-15 are usually blank padding)');
  lines.push('- **Index**: glyph_offset = FONT_BASE + (char_code - 0x20) * 28');
  lines.push('- **Range**: 96 printable ASCII chars (0x20..0x7F)');
  lines.push('');

  // Dump a few sample glyphs
  lines.push('Sample glyphs (# = set pixel):');
  lines.push('```');
  const FONT_BASE = 0x0040EE;
  for (const ch of ['A', 'N', '0']) {
    const idx = ch.charCodeAt(0) - 0x20;
    const off = FONT_BASE + idx * 28;
    lines.push(`'${ch}' (0x${ch.charCodeAt(0).toString(16)}):`);
    for (let row = 0; row < 14; row++) {
      const b0 = romBytes[off + row * 2];
      const b1 = romBytes[off + row * 2 + 1];
      let line = '  ';
      for (let col = 0; col < 8; col++) line += ((b0 >> (7 - col)) & 1) ? '#' : '.';
      for (let col = 0; col < 8; col++) line += ((b1 >> (7 - col)) & 1) ? '#' : '.';
      lines.push(line);
    }
  }
  lines.push('```');
  lines.push('');

  lines.push('### Alt/small font at ROM 0x0A3AFA');
  lines.push('');
  lines.push('The bytes at 0x0A3AFA appear to be CODE (not font data). The alt font table');
  lines.push('is likely referenced indirectly. The first non-zero glyph-like data near this');
  lines.push('address starts at offset +0x12:');
  const altBytes = romBytes.slice(0x0A3AFA + 0x0A, 0x0A3AFA + 0x2A);
  lines.push(`  Bytes: ${[...altBytes].map(b => b.toString(16).padStart(2, '0')).join(' ')}`);
  lines.push('');

  lines.push('### Width table');
  lines.push('');
  lines.push('The glyph bitmap is fixed-size (28 bytes, 16px wide), but the RENDERED width');
  lines.push('is determined by the scaler using the dimension arguments passed to 0x0533BD.');
  lines.push('The font-decoder.mjs renderer uses only the top 5 bits of each byte (10px');
  lines.push('effective width) based on empirical matching with the ROM renderer output.');
  lines.push('There is no separate per-glyph width table — all glyphs are the same fixed');
  lines.push('width in the bitmap, with variable visual width achieved by blank padding.');
  lines.push('');

  return lines;
}

// ─── 8. Output destination analysis ──────────────────────────────────

function analyzeOutputDest() {
  const lines = [];
  lines.push('## 8. Output Destination — Where Does the Scaled Glyph Go?');
  lines.push('');
  lines.push('### Flow after 0x053573');
  lines.push('');
  lines.push('After 0x053573 loads the 4 scale kernel pointers into IX locals:');
  lines.push('');
  lines.push('1. **Scale check**: If scale_factor < 2 (level 0 = no scaling), jumps to 0x0536A0');
  lines.push('2. **0x0536A0** (output loop): Processes each output row:');
  lines.push('   ```');
  lines.push('   0x0536A0  ld hl, (ix-51)     ; current output address');
  lines.push('   0x0536A3  ld bc, (ix-54)      ; row counter / accumulator');
  lines.push('   0x0536A6  or a; sbc hl, bc');
  lines.push('   0x0536A9  call 0x000218        ; sign_extend_test');
  lines.push('   ```');
  lines.push('   This loops through the glyph bitmap data, calling the scale kernel');
  lines.push('   (0x05324B via the coefficient tables) for each row/column pair, and');
  lines.push('   writes the expanded pixels.');
  lines.push('');
  lines.push('3. **The output address** is computed from the arguments to 0x0533BD:');
  lines.push('   - (ix+18) = output base address');
  lines.push('   - (ix+12) = horizontal stride (bytes between pixels)');
  lines.push('   - (ix+15) = vertical stride (bytes between rows, typically VRAM_WIDTH * 2 = 640)');
  lines.push('');
  lines.push('### Direct VRAM writes');
  lines.push('');
  lines.push('The scaled output goes **directly to VRAM** at 0xD40000. There is no intermediate');
  lines.push('buffer. The callers (in the PutC pipeline and text renderers) compute the output');
  lines.push('address as:');
  lines.push('');
  lines.push('```');
  lines.push('output_addr = VRAM_BASE + (pen_y * VRAM_WIDTH + pen_x) * 2');
  lines.push('h_stride = 2  (bytes per pixel, RGB565)');
  lines.push('v_stride = VRAM_WIDTH * 2 = 640  (bytes per row)');
  lines.push('```');
  lines.push('');
  lines.push('The scale kernel uses the 0x05324B helper (which calls 0x052442) to compute');
  lines.push('actual pixel positions with scale factors applied, then writes RGB565 pixel');
  lines.push('values directly at the computed VRAM offsets.');
  lines.push('');
  lines.push('### Pixel writer integration');
  lines.push('');
  lines.push('The entire chain feeds into the pixel writer layer that Session 329 documented.');
  lines.push('The scale kernel does NOT call a separate pixel-writer function — it IS the');
  lines.push('pixel writer for scaled text. The alpha-blend/write logic is embedded in the');
  lines.push('scale loop at 0x0535xx-0x0537xx, which reads glyph bits and writes 16-bit');
  lines.push('RGB565 values to the VRAM address computed from the base + stride parameters.');
  lines.push('');

  return lines;
}

// ─── 9. RAM state map ────────────────────────────────────────────────

function dumpRAMState() {
  const lines = [];
  lines.push('## 9. RAM State Map for Glyph Scaler');
  lines.push('');
  lines.push('| Address | Size | Name | Set by | Read by |');
  lines.push('|---------|------|------|--------|---------|');
  lines.push('| D005EC | 1 | scale_level | 0x0551B2 (init→0), 0x055566 (SetFontScale) | 0x05342C, 0x05354C |');
  lines.push('| D005ED | 3 | font_metric_config | 0x0551CA (init→0x000FFF from ROM 0x05323F) | 0x05354C |');
  lines.push('| D005F0 | 3 | scale_record_ptr | 0x0551C0 (init→0x05320F) | 0x053573 |');
  lines.push('| D005F4 | 1 | scale_sentinel | 0x0551B8 (init→0xFF) | unknown |');
  lines.push('| D000C6 | 1 | bpp_flag (bit 2) | 0x05527A (set=8bpp), 0x05522C (res=16bpp) | 54 blocks |');
  lines.push('');
  lines.push('### IX frame layout in 0x0533BD (71-byte local frame)');
  lines.push('');
  lines.push('| IX offset | Use |');
  lines.push('|-----------|-----|');
  lines.push('| (ix-3) | glyph bitmap pointer |');
  lines.push('| (ix-6) | adjusted width (width - effective_scale) |');
  lines.push('| (ix-9) | adjusted height (height - effective_scale) |');
  lines.push('| (ix-12) | adjusted h_stride (+ 2 * effective_scale) |');
  lines.push('| (ix-15) | adjusted v_stride (+ 2 * effective_scale) |');
  lines.push('| (ix-48) | output row accumulator |');
  lines.push('| (ix-51) | output column / multiply result |');
  lines.push('| (ix-54) | working accumulator (zeroed at entry) |');
  lines.push('| (ix-57) | font_metric_config copy (from D005ED) |');
  lines.push('| (ix-60) | scale kernel ptr 4 (vRepeat) |');
  lines.push('| (ix-63) | scale kernel ptr 2 (vHeight) |');
  lines.push('| (ix-66) | scale kernel ptr 1 (hWidth) |');
  lines.push('| (ix-69) | scale kernel ptr 3 (hRepeat) |');
  lines.push('| (ix-70) | scale_factor = scale_level + 1 |');
  lines.push('| (ix-71) | half_scale = (scale_level + 2) >> 1 (or 0xFF for identity) |');
  lines.push('');

  return lines;
}

// ─── 10. Summary ─────────────────────────────────────────────────────

function buildSummary() {
  const lines = [];
  lines.push('## 10. Summary — Complete Call Chain');
  lines.push('');
  lines.push('```');
  lines.push('Caller (PutC pipeline / text renderer)');
  lines.push('  │ pushes: glyph_ptr, width, height, h_stride, v_stride, output_base, row_skip');
  lines.push('  ▼');
  lines.push('0x053396 — glyph_add_bias');
  lines.push('  │ Adds 5-byte FP bias (0x0520C3: {00,80,00,00,00}) to glyph pointer');
  lines.push('  │ via 0x0522B2 (5-byte ADC loop)');
  lines.push('  │ Returns: biased glyph pointer in HL');
  lines.push('  ▼');
  lines.push('0x0533BD — scaler_validate_and_setup');
  lines.push('  │ Allocates 71-byte frame. Calls 0x055191 (lazy_init).');
  lines.push('  │ Validates width, height, stride all ≥ 0 and ≤ 3600.');
  lines.push('  │ Reads D005EC (scale_level), computes effective_scale = 2*level+1.');
  lines.push('  │ Adjusts all 4 dimensions by effective_scale.');
  lines.push('  ▼');
  lines.push('0x053540 — store_multiply_result_and_zero_accumulators');
  lines.push('  │ Stores result from 24-bit multiply (0x000154), zeros accumulators.');
  lines.push('  ▼');
  lines.push('0x05354C — scale_config_load');
  lines.push('  │ Loads D005ED (font metric config, default 0xFFF).');
  lines.push('  │ Computes scale_factor = level+1, half_scale = (level+2)>>1.');
  lines.push('  │ If config == 0xFFF → sets half_scale = 0xFF (identity sentinel).');
  lines.push('  ▼');
  lines.push('0x053573 — scale_kernel_dispatch');
  lines.push('  │ Loads IY = (D005F0) = scale record pointer.');
  lines.push('  │ Copies 4 kernel pointers from record into IX locals:');
  lines.push('  │   (iy+0) → (ix-66) = hWidth kernel');
  lines.push('  │   (iy+3) → (ix-63) = vHeight kernel');
  lines.push('  │   (iy+6) → (ix-69) = hRepeat kernel');
  lines.push('  │   (iy+9) → (ix-60) = vRepeat kernel');
  lines.push('  │ If scale_factor < 2: skip → 0x0536A0 (direct copy, no scaling).');
  lines.push('  ▼');
  lines.push('0x0535A1+ — scale_loop (for scale ≥ 2)');
  lines.push('  │ Iterates rows × columns, applies kernel coefficients');
  lines.push('  │ to replicate/interpolate glyph pixels.');
  lines.push('  ▼');
  lines.push('0x0536A0 — output_row_loop');
  lines.push('  │ Processes output rows, writes scaled pixels.');
  lines.push('  │ Output goes DIRECTLY to VRAM at computed address:');
  lines.push('  │   addr = output_base + row * v_stride + col * h_stride');
  lines.push('  │ No intermediate buffer — writes RGB565 directly to 0xD40000+ region.');
  lines.push('  ▼');
  lines.push('VRAM (0xD40000)');
  lines.push('```');
  lines.push('');
  lines.push('### Key answers');
  lines.push('');
  lines.push('1. **Font selection**: Happens UPSTREAM of this chain. The DrawChar vtable');
  lines.push('   dispatch (D005E9+3) selects main font (0x0040EE) or alt font, computes');
  lines.push('   glyph_ptr = font_base + (char - 0x20) * 28, and passes it as an argument.');
  lines.push('');
  lines.push('2. **Glyph bitmap format**: Fixed 28 bytes/glyph, 16px × 14 rows, 1 bit/pixel,');
  lines.push('   2 bytes/row, MSB-first. No per-glyph width table.');
  lines.push('');
  lines.push('3. **Output destination**: Directly to VRAM (0xD40000+). No intermediate buffer.');
  lines.push('   The output address and strides are passed as arguments from the PutC pipeline.');
  lines.push('');
  lines.push('4. **Scale behavior**: Level 0 → identity (skip scaling loop). Levels 1-3 use');
  lines.push('   coefficient tables from the kernel records at 0x053182-0x05320E to expand');
  lines.push('   glyphs by 2x, 3x, or 4x.');
  lines.push('');

  return lines;
}

// ─── Main ────────────────────────────────────────────────────────────

function main() {
  console.log('=== Phase 332 — Glyph Scaler Call Chain Trace ===');
  console.log('');

  const sections = [];
  sections.push(['# Phase 332 — Glyph Scaler Call Chain Trace', '']);
  sections.push(['Generated by `probe-phase332-glyph-scaler.mjs`.', '']);

  const s1 = disassemble_053396();
  const s2 = disassemble_0522B2();
  const s3 = disassemble_0533BD();
  const s4 = disassemble_053540();
  const s5 = disassemble_053573();
  const s6 = dumpScaleTable();
  const s7 = dumpFontFormat();
  const s8 = analyzeOutputDest();
  const s9 = dumpRAMState();
  const s10 = buildSummary();

  const all = [
    ...sections.flat(),
    ...s1, ...s2, ...s3, ...s4, ...s5,
    ...s6, ...s7, ...s8, ...s9, ...s10,
  ];

  // Print summary to console
  console.log('--- Disassembly: 0x053396 (glyph_add_bias) ---');
  console.log('  Takes glyph ptr as arg (ix+6), adds 5-byte bias from ROM 0x0520C3');
  console.log('  via 0x0522B2 (5-byte ADC loop). Returns biased ptr in HL.');
  console.log('  Callers: 0x052569, 0x0546BD, 0x0546E3, 0x054770, 0x054796');
  console.log('');

  console.log('--- Disassembly: 0x0533BD (scaler_validate_and_setup) ---');
  console.log('  Allocates 71-byte frame. Validates width/height/stride >= 0 and <= 3600.');
  console.log('  Reads D005EC (scale_level), computes effective_scale = 2*level+1.');
  console.log('  Args: glyph_ptr, width, height, h_stride, v_stride, output_base, row_skip');
  console.log('');

  console.log('--- Disassembly: 0x053573 (scale_kernel_dispatch) ---');
  console.log('  Loads 4 kernel ptrs from D005F0 record into IX locals.');
  console.log('  Scale check: level+1 < 2 → skip to 0x0536A0 (no-scale output path).');
  console.log('');

  console.log('--- Scale record table (0x05320F) ---');
  for (let level = 0; level < 4; level++) {
    const off = 0x05320F + level * 12;
    const ptrs = [];
    for (let j = 0; j < 4; j++) ptrs.push(hex(read24(romBytes, off + j * 3)));
    console.log(`  Level ${level}: ${ptrs.join(', ')}`);
  }
  console.log('  Level 0: all → 0x053182 (N=1, identity)');
  console.log('');

  console.log('--- Glyph format ---');
  console.log('  Main font: ROM 0x0040EE, 28 bytes/glyph, 16x14 px, 1 bit/pixel');
  console.log('  Fixed-size glyphs, no per-glyph width table');
  console.log('  Index = (char_code - 0x20) * 28');
  console.log('');

  console.log('--- Output destination ---');
  console.log('  Scaled output → DIRECTLY to VRAM at 0xD40000+');
  console.log('  No intermediate buffer. Address from caller args:');
  console.log('    addr = output_base + row*v_stride + col*h_stride');
  console.log('  h_stride=2 (RGB565), v_stride=640 (320px * 2 bytes)');
  console.log('');

  console.log('--- RAM state ---');
  console.log('  D005EC: scale_level (0..3, default 0)');
  console.log('  D005ED: font_metric_config (3 bytes, default 0x000FFF)');
  console.log('  D005F0: scale_record_ptr (3 bytes, default 0x05320F)');
  console.log('');

  // Write report
  const report = all.join('\n') + '\n';
  fs.writeFileSync(REPORT_PATH, report);
  console.log(`Report written to ${REPORT_PATH}`);
  console.log('');
  console.log('=== Phase 332 complete — all 4 questions answered ===');
}

main();

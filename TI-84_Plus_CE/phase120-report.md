# Phase 120 - Font Decoder Rewrite (1bpp 16px wide)

## Changes to `font-decoder.mjs`

1. **`GLYPH_WIDTH` changed from 10 to 16** - reflects the true 16-pixel-wide font data format.

2. **`DEFAULT_MAX_DIST` changed from 20 to 30** - accounts for the larger 16x14=224 pixel glyph area.

3. **`decodeGlyph` rewritten to full 8-bits-per-byte extraction:**
   - byte0 bits 7..0 -> cols 0..7
   - byte1 bits 7..0 -> cols 8..15
   - Produces correct 16-wide ASCII art showing the full font data.

4. **Added `decodeGlyphRendered` (private function):**
   - Uses the 5-bits-per-byte format that matches the ROM's on-screen rendering.
   - byte0 bits 7..3 -> cols 0..4, byte1 bits 7..3 -> cols 5..9.
   - The ROM renderer only uses the top 5 bits of each byte; the lower 3 bits create inter-column spacing.

5. **`buildFontSignatures` uses `decodeGlyphRendered`** so that matching signatures correspond to what actually appears in VRAM. This was essential for the regression test -- the full 8-bit glyphs don't match VRAM rendering because the ROM renderer only uses 5 bits per byte.

6. **`extractCell` gained an optional `extractWidth` parameter** (default `GLYPH_WIDTH`). When the on-screen stride is narrower than `GLYPH_WIDTH`, callers can limit extraction to avoid pulling pixels from adjacent characters.

7. **`decodeTextStrip` automatically limits `extractWidth`** to `stride` when `stride < GLYPH_WIDTH`, preventing adjacent-character contamination in the extracted cell.

8. **Self-test block rewritten** to use `fileURLToPath` / `import.meta.url` comparison with Windows path fixup.

9. **Module comment updated** to describe the correct 1bpp 2-bytes-per-row format.

## Key Discovery

The font DATA is stored as 1bpp, 2 bytes/row, 16 pixels wide. However, the ROM's text RENDERER only uses the top 5 bits from each byte, effectively rendering glyphs at 10 pixels wide (5 left + 5 right). The lower 3 bits of each byte serve as inter-column spacing in the rendered output. This means:

- `decodeGlyph` (full 8-bit) is correct for inspecting the raw font data.
- `decodeGlyphRendered` (5-bit) is correct for matching against VRAM content.
- Both are needed: the former for analysis, the latter for OCR matching.

## Self-Test Output (`node font-decoder.mjs`)

```
Built 95 signatures

'A' (0x41):   'H' (0x48):   'T' (0x54):
  ..###...###.....    ##.........##...    #####...#####...
  .####...####....    ##.........##...    #####...#####...
  ##.........##...    ...                 ....#...#.......
  ...                 #####...#####...    ...
  #####...#####...    #####...#####...
  ...                 ...
```

All glyphs (A, B, C, H, N, T, X, 0, space) render as recognizable 16-wide ASCII art.

## Golden Regression (`node probe-phase99d-home-verify.mjs`)

```
bestMatch=row19 col2
decoded="Normal Float Radian       "
assert Normal: PASS
assert Float: PASS
assert Radian: PASS
```

- exact=26 (all 26 characters match)
- Normal/Float/Radian = PASS

## Exports Preserved

All existing exports unchanged: `decodeGlyph`, `buildFontSignatures`, `extractCell`, `matchCell`, `decodeTextStrip`, `hammingCols`, `hamming`, `FONT_BASE`, `GLYPH_STRIDE`, `GLYPH_WIDTH`, `GLYPH_HEIGHT`, `VRAM_BASE`, `VRAM_WIDTH`, `VRAM_HEIGHT`, `VRAM_SENTINEL`.

No other files modified.

# Phase 562: ROM Table at 0x0A26E4 — Pixel Fill Mask Table

## Summary

The "glyph property table" at 0x0A26E4 is actually a **7-entry pixel fill mask table**, 1-indexed. It provides left-aligned cumulative bitmasks used by the pixel renderer to fill N pixels in a byte.

## Table Location and Bounds

- **Base pointer**: 0x0A26E4 (as loaded by the function at 0x0A1A83: `LD HL,0x0A26E4`)
- **Actual data**: 0x0A26E5 through 0x0A26EB (7 bytes)
- **Table is 1-indexed**: the byte at 0x0A26E4 itself is `C9` (RET opcode — the last byte of the prior function at 0x0A26D6)
- **Code resumes at 0x0A26EC**: `LD B,(HL); INC HL; PUSH AF; CALL 0x0A26F5; POP AF; RET` — a small wrapper function

## Table Contents

| Index (A) | Address  | Value | Binary     | Meaning                |
|-----------|----------|-------|------------|------------------------|
| 0         | 0x0A26E4 | 0xC9  | 11001001   | (not data — RET opcode)|
| 1         | 0x0A26E5 | 0x80  | 10000000   | Fill 1 pixel (leftmost)|
| 2         | 0x0A26E6 | 0xC0  | 11000000   | Fill 2 pixels          |
| 3         | 0x0A26E7 | 0xE0  | 11100000   | Fill 3 pixels          |
| 4         | 0x0A26E8 | 0xF0  | 11110000   | Fill 4 pixels          |
| 5         | 0x0A26E9 | 0xF8  | 11111000   | Fill 5 pixels          |
| 6         | 0x0A26EA | 0xFC  | 11111100   | Fill 6 pixels          |
| 7         | 0x0A26EB | 0xFE  | 11111110   | Fill 7 pixels          |

## Interpretation

This is a **left-fill bitmask lookup**: given a pixel count N (1-7), return a byte with the top N bits set. Used in the 1BPP glyph renderer to mask partial-byte pixel runs.

Pattern: `value[N] = 0xFF << (8 - N)` for N = 1..7.

### Relationship to Pixel Bitmask Table at 0x0A1B14

The two tables are complementary:

| Table         | Address  | Purpose                        | Values                      |
|---------------|----------|--------------------------------|-----------------------------|
| 0x0A1B14      | 8 bytes  | Single-bit position mask       | 80 40 20 10 08 04 02 01     |
| 0x0A26E5      | 7 bytes  | Cumulative left-fill mask      | 80 C0 E0 F0 F8 FC FE       |

- **0x0A1B14**: "which bit is pixel X?" — used to set/test individual pixels
- **0x0A26E5**: "mask for the first N pixels" — used for multi-pixel fill operations

Together they support the 1BPP monochrome glyph renderer: the single-bit table selects individual glyph pixels from font data, and the fill table writes runs of pixels to the framebuffer.

## Neighborhood Context

```
0A26D6: E1 D9 C1 D1 E1 D9 F1 E2 E2 26 0A FB C1 37  [renderer early exit function]
0A26E4: C9                                            [RET — ends 0x0A26D6 function]
0A26E5: 80 C0 E0 F0 F8 FC FE                         [FILL MASK TABLE — 7 entries]
0A26EC: 46 23 F5 CD F5 26 0A F1 C9                   [wrapper: LD B,(HL); INC HL; PUSH AF; CALL 0x0A26F5; POP AF; RET]
0A26F5: D5 DD E5 7E 23 CD E5 23 0A 38 02 10 F6 ...  [string output function]
```

## Corrected Understanding

- **Base address 0x0A26E4 is correct** (matches disassembly of 0x0A1A83).
- **The table is 1-indexed** — A is always 1-7 when this lookup is called. A=0 would erroneously read the RET opcode, but the renderer never calls with A=0 (0 pixels to fill = no-op, skipped before the call).
- **NOT a "glyph property" table** in the sense of per-character properties. It is a pixel-count-to-bitmask conversion table used during glyph rendering. The session 561 label "glyph property" was a reasonable first guess but the actual function is simpler: pixel fill masks.
- **Table size**: 7 bytes (not 17 or 256). The 256-byte dump confirms immediate code patterns resume at 0x0A26EC.

## Function at 0x0A26EC (Newly Identified Wrapper)

```
0A26EC: 46        LD B,(HL)       ; load byte from string pointer
0A26ED: 23        INC HL          ; advance string pointer
0A26EE: F5        PUSH AF         ; save flags/accumulator
0A26EF: CD F5 26 0A  CALL 0x0A26F5  ; call string output function
0A26F3: F1        POP AF          ; restore
0A26F4: C9        RET
```

This is a 9-byte wrapper (0x0A26EC-0x0A26F4) that reads one byte from (HL), advances HL, and calls the string output function at 0x0A26F5. Likely a "print next char from string" helper.

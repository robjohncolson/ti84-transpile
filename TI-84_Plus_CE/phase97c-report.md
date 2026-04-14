# Phase 97C — Font Table Investigation

## Status: RESOLVED — **0x003d6e is NOT a font table**

Phase 80+ item #9 listed `0x003d6e` as a font lookup with "28 bytes/glyph". This
session verified the claim and found it to be **incorrect**. `0x003d6e` is an OS
code routine, not glyph data. The font-lookup decoder plan needs to find the
real font table address.

## Investigation

### Step 1: narrow font-dump probe (`probe-phase97c-font-dump.mjs`)

Rendered the first 16 "glyph entries" at `0x003d6e` under four possible layouts
(14×16, 28×8, 6-byte-header + 11×16, and 14×8 + metadata). Layout A (14×16)
showed what initially looked like an "A" pattern for idx=0x41, but it appeared
as two identical side-by-side letters — suspicious, not a clean glyph.

### Step 2: verify hypothesis (`probe-phase97c-verify.mjs`)

Tested the "paired 14×8, two glyphs per entry" hypothesis — rendered all letters
came out as **random dot patterns**, not recognizable glyphs. Hypothesis rejected.

### Step 3: ROM scan for references to 0x003d6e

Scanned for `LD HL,0x003d6e`, `LD DE,...`, `LD BC,...`, `CALL`, `JP`, and raw
3-byte `6e 3d 00` address data:

- `LD HL,0x003d6e` (ADL 4-byte): **2 hits** — at `0x3d85` and `0x59a6`
- All other patterns: 0 hits
- No CALL/JP targets

**Critical observation**: `0x3d85` is at offset `0x3d85 - 0x3d6e = 0x17 = 23`
within the supposed first "glyph entry". Reading the bytes at 0x3d6e as
instructions:

```
0x3d6e: 20 fb              JR NZ, -5
0x3d70: c1                  POP BC
0x3d71: 10 e9               DJNZ -23
0x3d73: af                  XOR A
0x3d74: c9                  RET
0x3d75: 3a 87 05 d0         LD A, (0xd00587)
0x3d79: 47                  LD B, A
0x3d7a: af                  XOR A
0x3d7b: 32 87 05 d0         LD (0xd00587), A
0x3d7f: 78                  LD A, B
0x3d80: fd cb 00 9e         RES 3, (IY+0)
0x3d84: c9                  RET
0x3d85: 21 6e 3d 00         LD HL, 0x003d6e   ← self-reference
0x3d89: c9                  RET
```

This is a **function**, not a glyph table. The byte at 0x3d85 loads the
function's own address into HL — perhaps used to register a callback pointer
or pass a function address as an argument elsewhere.

The second reference at `0x59a6` is another `LD HL, 0x003d6e` — an external
caller that passes this function's address somewhere.

## Conclusion

**0x003d6e has nothing to do with fonts.** The "28 bytes/glyph" heuristic from
Phase 80+ item #9 was a false lead. The real TI-84 CE font table is somewhere
else — possibly accessed via BCALL (we already confirmed BCALL is not used for
rendering on CE), or via one of the known text renderers (0x0a1799 / 0x0a1cac).

## Follow-up for Phase 98 (font hunt, real version)

1. Instrument `cpu.read8` during a run of `0x0a1799` (the single-char printer)
   to trap reads from anywhere in ROM (0x000000-0x3FFFFF). The font bitmap must
   be there.
2. Correlate reads with the ASCII character being printed to pinpoint the font
   base and stride.
3. Alternative: run `0x0a1cac` (string printer) with a known string and watch
   ROM reads during VRAM pixel writes.

## Deliverables

- `TI-84_Plus_CE/probe-phase97c-font-dump.mjs` — narrow 4-layout probe
- `TI-84_Plus_CE/probe-phase97c-verify.mjs` — paired-glyph hypothesis test + ROM ref scan
- `TI-84_Plus_CE/phase97c-font-dump.txt` — full dump output
- `TI-84_Plus_CE/phase97c-report.md` — this file

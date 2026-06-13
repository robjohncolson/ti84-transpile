# Ground-Truth Edit Context — Real CEmu vs Synthetic Replay (2026-06-13)

Captured from a REAL CEmu emulator (sibling `ti84-trainer-v2` WASM build, read-only)
running the SAME ROM (5.8.2.0029), to compare against the transpile's synthetic
cold-boot+replay state. Method: headless boot to home screen → snapshot HEAPU8 →
press '2' (keypad row4/col1) → snapshot HEAPU8. RAM_BASE in the WASM heap found via
the `D0301B==0x5AA55A` integrity magic and validated by `D007CA=0x0585E9` (cxMain)
and the VRAM region. RAM_BASE = 0x004A0A00 (heap offset; TI 0xD00000 = ram[0]).

## ★★★★★ HEADLINE: the real calc does a SURGICAL one-byte insert; no wipe.

LCD: before = home splash ("TI-84 Plus CE / 5.8.2.0029 / RAM Cleared", entry cursor
top-left). After '2' = **"2▮" on the entry line.** (evidence PNGs: lcd_before.png /
lcd_after.png.) The OS did NOT enter the bulk-clear / "Validating OS" path — pressing
'2' just deposits the character and advances the cursor.

The '2' byte (0x32 = ASCII '2') is written at **0xD1A8CC** — exactly where editCursorB
(D0243A) points. The whole keypress effect on a real calc:

| addr | before | after | meaning |
|------|--------|-------|---------|
| 0xD1A8CC (buffer) | `00` | **`32`** | the '2' char deposited at the cursor |
| D0243A editCursorB | `0xD1A8CC` | `0xD1A8CD` | cursor advanced +1 |
| 0xD1A8C0 (buf header) | `0C 00 07` | `18 00 07` | buffer size byte 0x0C→0x18 |
| D02A29 cursor col | `0x0000` | `0x000C` | display column advanced |
| D000A3 edit flags | `0x0A` | `0x08` | bit1 cleared, bit3 (edit-active) kept |
| D02434 block byte | `cc a8 d1` | `cd a8 d1` | descriptor mirrors editCursorB |

That is the ENTIRE delta. No 0x0018F8 wipe, no D007CA zeroing, no VAT clear.

## The real edit context is FULLY LIVE before any key (this is what synthetic lacks)

Real BEFORE values (home screen, no key yet):

| field | real value | synthetic (per research) | match? |
|-------|-----------|--------------------------|--------|
| D007CA cxMain | `0x0585E9` | `0x0585E9` | ✓ |
| D007E0 display mode | `0x40` | `0x40` | ✓ |
| D00082 MathPrint | `0x12` | `0x12` | ✓ |
| D000A3 edit flags | `0x0A` (edit active) | stale/0 | ✗ |
| **D0231A token cursor** | **`0xD2A83E`** | `0xD1A8CC` | ✗ WRONG REGION |
| D0231D | `0xD2A83D` | — | — |
| D02317 PC trio (beg/cur/end) | `D2A83E / D2A83E / D2A83D` | — | likely absent |
| **D0243A editCursorB** | **`0xD1A8CC`** | `0xD1A8F8` | ✗ wrong offset |
| D0243D editBtm | `0xD2A83E` | — | — |
| D02434 descriptor | `00 00 00 | cc a8 d1 | cc a8 d1 | 3e a8 d2 | 3e a8 d2 | 00` | partial | ✗ |
| D02430..D0245F | `00*7 cc a8 d1 cc a8 d1 3e a8 d2 3e a8 d2 00*11 89 fe d3 00*5 07 00*7 01 00` | — | — |
| edit buffer @0xD1A8C0 | header `0C 00 07` then zeros (first free byte = D1A8CC) | absent/elsewhere | ✗ |
| D0301B integrity magic | `5A A5 5A` | n/a | (anchor) |

**THE DIVERGENCE:** the real token cursor `D0231A` points to `0xD2A83E` — the
tempMem/VAT-adjacent region (real MEM_INIT set `D02587=0xD2A8E2`). The synthetic
state points `D0231A` into `0xD1A8xx` with different offsets, and its edit
buffer/descriptor block do not match the real `0xD1A8C0`-based layout. So the
synthetic edit context is built in the WRONG place / incompletely (the populator
0x044D3F bailed cold), the typed token has no correct buffer to land in, and the OS
routes the key to the bulk-clear/validation path instead of the surgical insert.

## ★ NEXT EXPERIMENT (well-specified, high-confidence)

In the synthetic post-init+repaint state, BEFORE pressing a key, seed the full real
edit-context layout, then press '2' and check for the surgical insert:
1. Write the real BEFORE values above into synthetic RAM (D0231A=0xD2A83E,
   D0231D=0xD2A83D, D02317 trio, D0243A=0xD1A8CC, D0243D=0xD2A83E, the D02430..D0245F
   descriptor block verbatim, D000A3=0x0A, and the edit buffer header `0C 00 07` at
   0xD1A8C0). Note these point into 0xD2A8xx and 0xD1A8xx — confirm those regions are
   the synthetic VAT/tempMem bases (real D02587=0xD2A8E2); if synthetic MEM_INIT put
   tempMem elsewhere, translate the pointers to the synthetic bases.
2. Press '2' (D0058C/scan path as usual).
3. PASS if: 0x32 lands at editCursorB, editCursorB advances +1, buffer header bumps,
   and NO 0x0018F8 wipe fires (D007CA stays 0x0585E9, edit cursors stay non-zero).
If it still wipes, the gap is upstream of the edit buffer (the descriptor/string table
the 0x0158BC scan needs — capture 0x3B00xx from the real calc next).

Evidence files (this dir): edit-context-ground-truth.json (full before/after table),
lcd_before.png, lcd_after.png. RAM_BASE=0x004A0A00, heaps in heap_before/after.bin.

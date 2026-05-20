# TI-84 CE Keyboard Matrix — MMIO at 0xE00810

Source: CE C SDK `keypadc.h` from [ce-programming/toolchain](https://github.com/CE-Programming/toolchain).

## Key Finding: Reversed Group Ordering

The SDK `kb_Data` at 0xF50010 and our MMIO at 0xE00810 use **reversed** group numbering:

```
keyMatrix[N] at 0xE00810+N  =  SDK kb_Data[7-N] at 0xF50010+2*(7-N)
```

Verified anchors:
- `keyMatrix[0]:B2` = RIGHT → SDK Group 7 bit 2 = `kb_Right` ✓
- `keyMatrix[1]:B1` = + → SDK Group 6 bit 1 = `kb_Add` ✓

## Full Matrix (SDK-authoritative)

```
keyMatrix[0] = SDK Group 7 (arrows):
  B0: DOWN    B1: LEFT    B2: RIGHT   B3: UP

keyMatrix[1] = SDK Group 6 (operators):
  B0: ENTER   B1: +       B2: -       B3: ×       B4: ÷       B5: ^       B6: CLEAR

keyMatrix[2] = SDK Group 5:
  B0: (-)     B1: 3       B2: 6       B3: 9       B4: )       B5: TAN     B6: VARS

keyMatrix[3] = SDK Group 4:
  B0: .       B1: 2       B2: 5       B3: 8       B4: (       B5: COS     B6: PRGM    B7: STAT

keyMatrix[4] = SDK Group 3:
  B0: 0       B1: 1       B2: 4       B3: 7       B4: ,       B5: SIN     B6: APPS    B7: X,T,θ,n

keyMatrix[5] = SDK Group 2:
  B0: (empty) B1: STO→    B2: LN      B3: LOG     B4: x²      B5: x⁻¹    B6: MATH    B7: ALPHA

keyMatrix[6] = SDK Group 1 (function keys):
  B0: GRAPH   B1: TRACE   B2: ZOOM    B3: WINDOW  B4: Y=      B5: 2ND     B6: MODE    B7: DEL

keyMatrix[7] = ON key (separate hardware line, bit 7)
```

## Scan Code Format

Scan code = `(keyMatrix_index << 4) | bit`

| Key | Group | Bit | Scan Code |
|-----|-------|-----|-----------|
| DOWN | 0 | 0 | 0x00* |
| LEFT | 0 | 1 | 0x01 |
| RIGHT | 0 | 2 | 0x02 |
| UP | 0 | 3 | 0x03 |
| ENTER | 1 | 0 | 0x10 |
| + | 1 | 1 | 0x11 |
| - | 1 | 2 | 0x12 |
| × | 1 | 3 | 0x13 |
| ÷ | 1 | 4 | 0x14 |
| ^ | 1 | 5 | 0x15 |
| CLEAR | 1 | 6 | 0x16 |
| (-) | 2 | 0 | 0x20 |
| 3 | 2 | 1 | 0x21 |
| 6 | 2 | 2 | 0x22 |
| 9 | 2 | 3 | 0x23 |
| ) | 2 | 4 | 0x24 |
| TAN | 2 | 5 | 0x25 |
| VARS | 2 | 6 | 0x26 |
| . | 3 | 0 | 0x30 |
| 2 | 3 | 1 | 0x31 |
| 5 | 3 | 2 | 0x32 |
| 8 | 3 | 3 | 0x33 |
| ( | 3 | 4 | 0x34 |
| COS | 3 | 5 | 0x35 |
| PRGM | 3 | 6 | 0x36 |
| STAT | 3 | 7 | 0x37 |
| 0 | 4 | 0 | 0x40 |
| 1 | 4 | 1 | 0x41 |
| 4 | 4 | 2 | 0x42 |
| 7 | 4 | 3 | 0x43 |
| , | 4 | 4 | 0x44 |
| SIN | 4 | 5 | 0x45 |
| APPS | 4 | 6 | 0x46 |
| X,T,θ,n | 4 | 7 | 0x47 |
| STO→ | 5 | 1 | 0x51 |
| LN | 5 | 2 | 0x52 |
| LOG | 5 | 3 | 0x53 |
| x² | 5 | 4 | 0x54 |
| x⁻¹ | 5 | 5 | 0x55 |
| MATH | 5 | 6 | 0x56 |
| ALPHA | 5 | 7 | 0x57 |
| GRAPH | 6 | 0 | 0x60 |
| TRACE | 6 | 1 | 0x61 |
| ZOOM | 6 | 2 | 0x62 |
| WINDOW | 6 | 3 | 0x63 |
| Y= | 6 | 4 | 0x64 |
| 2ND | 6 | 5 | 0x65 |
| MODE | 6 | 6 | 0x66 |
| DEL | 6 | 7 | 0x67 |

*DOWN at G0:B0 has scan code 0x00 (indistinguishable from "no key")

## OS Scan Codes (`_GetCSC` return values)

The matrix scan codes above (`(group << 4) | bit`) are **hardware-level** identifiers.
The OS scan routine at `0x003C63` converts these to **sequential OS scan codes** that
`_GetCSC` (SDK entry `0x03FA09`) returns. These sequential codes index the 4-section
translation table at ROM `0x09F79B` (see `scancode-translate.js`).

### Formula

```
OS_scancode = (6 - group) * 8 + bit + 1
```

The scan loop at `0x003D22` iterates keyboard ports in **reverse order** (keyMatrix[6]
first, keyMatrix[0] last), using a counter H that starts at 1 and increments for each
group. The store at `0x003D35`-`0x003D42` computes `(H-1)*8 + bit + 1`. Since
`H = 7 - group`, the net formula is `(6 - group) * 8 + bit + 1`.

This means the function keys (keyMatrix[6]) get the **lowest** OS scan codes (0x01-0x08)
and the arrow keys (keyMatrix[0]) get the **highest** (0x31-0x38). Gaps exist where
matrix positions have no physical key (e.g., keyMatrix[0] bits 4-7, keyMatrix[5] bit 0).
Code 0 means "no key pressed."

### Full OS Scan Code Table

| Key | Matrix Group | Bit | Matrix Code | OS Scan Code (hex) | OS Scan Code (dec) |
|-----|-------------|-----|-------------|--------------------|--------------------|
| GRAPH | 6 | 0 | 0x60 | 0x01 | 1 |
| TRACE | 6 | 1 | 0x61 | 0x02 | 2 |
| ZOOM | 6 | 2 | 0x62 | 0x03 | 3 |
| WINDOW | 6 | 3 | 0x63 | 0x04 | 4 |
| Y= | 6 | 4 | 0x64 | 0x05 | 5 |
| 2ND | 6 | 5 | 0x65 | 0x06 | 6 |
| MODE | 6 | 6 | 0x66 | 0x07 | 7 |
| DEL | 6 | 7 | 0x67 | 0x08 | 8 |
| STO→ | 5 | 1 | 0x51 | 0x0A | 10 |
| LN | 5 | 2 | 0x52 | 0x0B | 11 |
| LOG | 5 | 3 | 0x53 | 0x0C | 12 |
| x² | 5 | 4 | 0x54 | 0x0D | 13 |
| x⁻¹ | 5 | 5 | 0x55 | 0x0E | 14 |
| MATH | 5 | 6 | 0x56 | 0x0F | 15 |
| ALPHA | 5 | 7 | 0x57 | 0x10 | 16 |
| 0 | 4 | 0 | 0x40 | 0x11 | 17 |
| 1 | 4 | 1 | 0x41 | 0x12 | 18 |
| 4 | 4 | 2 | 0x42 | 0x13 | 19 |
| 7 | 4 | 3 | 0x43 | 0x14 | 20 |
| , | 4 | 4 | 0x44 | 0x15 | 21 |
| SIN | 4 | 5 | 0x45 | 0x16 | 22 |
| APPS | 4 | 6 | 0x46 | 0x17 | 23 |
| X,T,θ,n | 4 | 7 | 0x47 | 0x18 | 24 |
| . | 3 | 0 | 0x30 | 0x19 | 25 |
| 2 | 3 | 1 | 0x31 | 0x1A | 26 |
| 5 | 3 | 2 | 0x32 | 0x1B | 27 |
| 8 | 3 | 3 | 0x33 | 0x1C | 28 |
| ( | 3 | 4 | 0x34 | 0x1D | 29 |
| COS | 3 | 5 | 0x35 | 0x1E | 30 |
| PRGM | 3 | 6 | 0x36 | 0x1F | 31 |
| STAT | 3 | 7 | 0x37 | 0x20 | 32 |
| (-) | 2 | 0 | 0x20 | 0x21 | 33 |
| 3 | 2 | 1 | 0x21 | 0x22 | 34 |
| 6 | 2 | 2 | 0x22 | 0x23 | 35 |
| 9 | 2 | 3 | 0x23 | 0x24 | 36 |
| ) | 2 | 4 | 0x24 | 0x25 | 37 |
| TAN | 2 | 5 | 0x25 | 0x26 | 38 |
| VARS | 2 | 6 | 0x26 | 0x27 | 39 |
| ENTER | 1 | 0 | 0x10 | 0x29 | 41 |
| + | 1 | 1 | 0x11 | 0x2A | 42 |
| - | 1 | 2 | 0x12 | 0x2B | 43 |
| × | 1 | 3 | 0x13 | 0x2C | 44 |
| ÷ | 1 | 4 | 0x14 | 0x2D | 45 |
| ^ | 1 | 5 | 0x15 | 0x2E | 46 |
| CLEAR | 1 | 6 | 0x16 | 0x2F | 47 |
| DOWN | 0 | 0 | 0x00* | 0x31 | 49 |
| LEFT | 0 | 1 | 0x01 | 0x32 | 50 |
| RIGHT | 0 | 2 | 0x02 | 0x33 | 51 |
| UP | 0 | 3 | 0x03 | 0x34 | 52 |

*DOWN at G0:B0 has matrix scan code 0x00 (indistinguishable from "no key")
but OS scan code 0x31 (unambiguous).

### Verified anchor points (Phase 379 — probe-phase379-multikey-natural.mjs, 6/6 PASS)

| Key | Matrix Code | OS Scan Code | Verification |
|-----|-------------|-------------|--------------|
| ENTER | 0x10 | 0x29 | Dynamic ROM scan routine match |
| CLEAR | 0x16 | 0x2F | Dynamic ROM scan routine match |
| 2ND | 0x65 | 0x06 | Dynamic ROM scan routine match |
| DEL | 0x67 | 0x08 | Dynamic ROM scan routine match |
| 0 | 0x40 | 0x11 | Dynamic ROM scan routine match |
| ALPHA | 0x57 | 0x10 | Dynamic ROM scan routine match |

### How the two code systems relate

- **Matrix codes** (`(group << 4) | bit`): hardware-level, used by `peripherals.js`
  for `setMatrixKey()` and the keyboard MMIO ports. Range: 0x00-0x67.
- **OS scan codes** (`(6 - group) * 8 + bit + 1`): software-level, produced by the
  scan routine at `0x003C63` which iterates groups in reverse order (6 down to 0),
  stored at `0xD00587`, returned by `_GetCSC`. Range: 0x01-0x38. These index the
  translation table at ROM `0x09F79B` to produce internal key codes.
- **Internal key codes**: what the main event loop sees after modifier translation.
  Stored at `0xD0058E`. See `scancode-translate.js` for the full 4-section table.

The browser shell's `GETCSC_SCAN_CODE_BY_PC_CODE` table maps PC keyboard events
directly to OS scan codes. `setKeyPressed()` writes these to `0xD00587`.

## Phase 24F Note

Phase 24F tested scan codes by setting keyMatrix positions and reading results.
The scan codes were correct but key labels were **guessed** (not verified against
physical keys). The SDK mapping corrects these labels. For example, Phase 24F
labeled G6:B0 as "ENTER" — it's actually GRAPH (SDK Group 1, bit 0).

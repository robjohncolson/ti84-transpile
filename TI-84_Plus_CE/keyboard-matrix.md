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

## Phase 24F Note

Phase 24F tested scan codes by setting keyMatrix positions and reading results.
The scan codes were correct but key labels were **guessed** (not verified against
physical keys). The SDK mapping corrects these labels. For example, Phase 24F
labeled G6:B0 as "ENTER" — it's actually GRAPH (SDK Group 1, bit 0).

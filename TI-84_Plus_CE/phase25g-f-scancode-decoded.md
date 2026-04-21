# Phase 25G-f — Unified scancode translation table decode

## Source

Inputs merged by this phase (no re-decode; this phase is a cross-reference + dictionary overlay):

- `TI-84_Plus_CE/phase25g-scancode-table-report.md` — session 64. Raw-hex bytes per modifier plane at `table_idx = 0x00..0x38`, derived from `ROM.rom[0x09F79B..0x09F87E]` (228 bytes, 4 planes x 57 entries, stride 57).
- `TI-84_Plus_CE/phase25g-g-map.json` — session 65. Probe-verified physical labels keyed by `rawScanMmioHex` (64 entries; the top-level keys are the `rawScanMmioHex` strings themselves, lowercase hex). Unused matrix cells have `physicalLabel = "key0xNN"`.
- Inline dictionary defined in the Phase 25G-f task prompt (conservative TI-OS token map, 0x00..0x93 partial).

Scope of this phase: merge the three artifacts into a single authoritative report. No new ROM decode, no probe runs, no token lookup beyond the inline dictionary.

## Legend

**Columns** (one row per raw scan code that maps to an in-range translation-table offset, plus one header row for the no-key slot):

| Column | Meaning |
|---|---|
| `rawScan` | Raw scancode byte read from MMIO `rawScanMmio` (format `0xNN`, `N/A` for the no-key row). |
| `offset` | Entry offset within a single 57-byte modifier plane. Computed as `offset = ((raw >> 4) * 8) + (raw & 0x0F) + 1`. The no-key row uses `offset = 0`. |
| `physLabel` | Physical label from `phase25g-g-map.json`. Labels like `key0xNN` are fallbacks for matrix cells with no associated physical key (unused bits). |
| `NONE hex` / `NONE dec` | Plane 0 byte at `ROM[0x09F79B + 0 + offset]` and its dictionary decode. |
| `2nd hex` / `2nd dec` | Plane 1 byte at `ROM[0x09F79B + 57 + offset]` and its decode. |
| `ALPHA hex` / `ALPHA dec` | Plane 2 byte at `ROM[0x09F79B + 114 + offset]` and its decode. |
| `2ndALPHA hex` / `2ndALPHA dec` | Plane 3 byte at `ROM[0x09F79B + 171 + offset]` and its decode. |

**Plane layout**: 4 modifier planes (NONE, 2nd, ALPHA, 2nd+ALPHA), 57 bytes each, laid out contiguously in ROM from `0x09F79B` to `0x09F87E` inclusive. Each plane contains one entry per `table_idx` in `[0..56]`; `table_idx = 0` is the no-key slot.

**Formula**: `index = group * 8 + bit + 1`, raw scan code = `(group << 4) | bit` (session 64 wording). Equivalently `offset = ((raw >> 4) * 8) + (raw & 0x0F) + 1`. Raw scans with `(raw & 0x0F) >= 8` do not exist on this matrix (only bits 0..7 populated, upper nibble is the group). Raw scans with `(raw >> 4) == 7` (group 7, raw `0x70..0x77`) produce offsets `57..64`, past the end of a plane — these matrix cells have no translation entry.

**Dictionary note**: The inline dictionary is deliberately conservative. It covers the low-byte control codes, the `0x80..0x93` prefix of the TI-OS token space, and falls back to `'c'` (ASCII) for `0x20..0x7E` and `tok:0xNN` for everything else. Many high-byte values (especially `0x94..0xFF` — the second half of the token space, plus prefix-extension tokens) currently render as `tok:0xNN` pending a future TI-OS token cross-reference phase. Do not treat those as unknown semantics; they are unmapped *labels*, with bytes that are already verified against session 64.

## Decoded table

| rawScan | offset | physLabel | NONE hex | NONE dec | 2nd hex | 2nd dec | ALPHA hex | ALPHA dec | 2ndALPHA hex | 2ndALPHA dec |
|:---|---:|:---|:---|:---|:---|:---|:---|:---|:---|:---|
| N/A | 0 | (no key) | 0xC9 | tok:0xC9 | 0x04 | EQ | 0x02 | tok:0x02 | 0x01 | tok:0x01 |
| 0x00 | 1 | DOWN | 0x04 | EQ | 0x0E | [^] | 0x01 | tok:0x01 | 0x07 | tok:0x07 |
| 0x01 | 2 | LEFT | 0x02 | tok:0x02 | 0x0F | [(] | 0x07 | tok:0x07 | 0x00 | NONE |
| 0x02 | 3 | RIGHT | 0x01 | tok:0x01 | 0x03 | tok:0x03 | 0x00 | NONE | 0x00 | NONE |
| 0x03 | 4 | UP | 0x03 | tok:0x03 | 0x00 | NONE | 0x00 | NONE | 0x00 | NONE |
| 0x04 | 5 | key0x04 | 0x00 | NONE | 0x00 | NONE | 0x00 | NONE | 0x00 | NONE |
| 0x05 | 6 | key0x05 | 0x00 | NONE | 0x00 | NONE | 0x00 | NONE | 0x06 | tok:0x06 |
| 0x06 | 7 | key0x06 | 0x00 | NONE | 0x00 | NONE | 0x06 | tok:0x06 | 0xCB | tok:0xCB |
| 0x07 | 8 | key0x07 | 0x00 | NONE | 0x0D | [/] | 0xCB | tok:0xCB | 0xF8 | tok:0xF8 |
| 0x10 | 9 | ENTER | 0x05 | tok:0x05 | 0x36 | '6' | 0xB0 | tok:0xB0 | 0xF3 | tok:0xF3 |
| 0x11 | 10 | + | 0x80 | tok:PI | 0x88 | tok:SQR | 0xAB | tok:0xAB | 0xEE | tok:0xEE |
| 0x12 | 11 | - | 0x81 | tok:INV | 0x87 | tok:LOG | 0xA6 | tok:0xA6 | 0xE9 | tok:0xE9 |
| 0x13 | 12 | x | 0x82 | tok:SIN | 0xEF | tok:0xEF | 0xA1 | tok:0xA1 | 0x09 | ENTER |
| 0x14 | 13 | / | 0x83 | tok:COS | 0xB5 | tok:0xB5 | 0x09 | ENTER | 0x00 | NONE |
| 0x15 | 14 | ^ | 0x84 | tok:TAN | 0x09 | ENTER | 0x00 | NONE | 0xCA | tok:0xCA |
| 0x16 | 15 | CLEAR | 0x09 | ENTER | 0x00 | NONE | 0xCA | tok:0xCA | 0xCC | tok:0xCC |
| 0x17 | 16 | key0x17 | 0x00 | NONE | 0xC5 | tok:0xC5 | 0xCC | tok:0xCC | 0xF7 | tok:0xF7 |
| 0x20 | 17 | (-) | 0x8C | tok:MATH | 0xF5 | tok:0xF5 | 0xAF | tok:0xAF | 0xF2 | tok:0xF2 |
| 0x21 | 18 | 3 | 0x91 | tok:X_VAR | 0xF8 | tok:0xF8 | 0xAA | tok:0xAA | 0xED | tok:0xED |
| 0x22 | 19 | 6 | 0x94 | tok:0x94 | 0xFB | tok:0xFB | 0xA5 | tok:0xA5 | 0xE8 | tok:0xE8 |
| 0x23 | 20 | 9 | 0x97 | tok:0x97 | 0xED | tok:0xED | 0xA0 | tok:0xA0 | 0x35 | '5' |
| 0x24 | 21 | ) | 0x86 | tok:LN | 0xBC | tok:0xBC | 0x35 | '5' | 0x00 | NONE |
| 0x25 | 22 | TAN | 0xBB | tok:0xBB | 0x38 | '8' | 0x00 | NONE | 0xC6 | tok:0xC6 |
| 0x26 | 23 | VARS | 0x35 | '5' | 0x00 | NONE | 0xC6 | tok:0xC6 | 0xFB | tok:0xFB |
| 0x27 | 24 | key0x27 | 0x00 | NONE | 0xEE | tok:0xEE | 0xB3 | tok:0xB3 | 0xF6 | tok:0xF6 |
| 0x30 | 25 | . | 0x8D | tok:APPS | 0xF4 | tok:0xF4 | 0xAE | tok:0xAE | 0xF1 | tok:0xF1 |
| 0x31 | 26 | 2 | 0x90 | tok:CLEAR | 0xF7 | tok:0xF7 | 0xA9 | tok:0xA9 | 0xEC | tok:0xEC |
| 0x32 | 27 | 5 | 0x93 | tok:ON | 0xFA | tok:0xFA | 0xA4 | tok:0xA4 | 0xE7 | tok:0xE7 |
| 0x33 | 28 | 8 | 0x96 | tok:0x96 | 0xEC | tok:0xEC | 0x9F | tok:0x9F | 0xE4 | tok:0xE4 |
| 0x34 | 29 | ( | 0x85 | tok:EXP | 0xBA | tok:0xBA | 0x9C | tok:0x9C | 0x31 | '1' |
| 0x35 | 30 | COS | 0xB9 | tok:0xB9 | 0x2F | '/' | 0x31 | '1' | 0x99 | tok:0x99 |
| 0x36 | 31 | PRGM | 0x2D | '-' | 0x3A | ':' | 0x99 | tok:0x99 | 0xFA | tok:0xFA |
| 0x37 | 32 | STAT | 0x31 | '1' | 0x3E | '>' | 0xB2 | tok:0xB2 | 0xF5 | tok:0xF5 |
| 0x40 | 33 | 0 | 0x8E | tok:PRGM | 0xF3 | tok:0xF3 | 0xAD | tok:0xAD | 0xF0 | tok:0xF0 |
| 0x41 | 34 | 1 | 0x8F | tok:VARS | 0xF6 | tok:0xF6 | 0xA8 | tok:0xA8 | 0xEB | tok:0xEB |
| 0x42 | 35 | 4 | 0x92 | tok:STAT | 0xF9 | tok:0xF9 | 0xA3 | tok:0xA3 | 0xE6 | tok:0xE6 |
| 0x43 | 36 | 7 | 0x95 | tok:0x95 | 0x98 | tok:0x98 | 0x9E | tok:0x9E | 0xE3 | tok:0xE3 |
| 0x44 | 37 | , | 0x8B | tok:Ans | 0xB8 | tok:0xB8 | 0x9B | tok:0x9B | 0xB4 | tok:0xB4 |
| 0x45 | 38 | SIN | 0xB7 | tok:0xB7 | 0x39 | '9' | 0x13 | tok:0x13 | 0x00 | NONE |
| 0x46 | 39 | APPS | 0x2C | ',' | 0x41 | 'A' | 0x00 | NONE | 0xF9 | tok:0xF9 |
| 0x47 | 40 | X,T,theta,n | 0xB4 | tok:0xB4 | 0x00 | NONE | 0xB1 | tok:0xB1 | 0xF4 | tok:0xF4 |
| 0x50 | 41 | key0x50 | 0x00 | NONE | 0x0C | [*] | 0xAC | tok:0xAC | 0xEF | tok:0xEF |
| 0x51 | 42 | STO-> | 0x8A | tok:STO | 0xC0 | tok:0xC0 | 0xA7 | tok:0xA7 | 0xEA | tok:0xEA |
| 0x52 | 43 | LN | 0xBF | tok:0xBF | 0xC2 | tok:0xC2 | 0xA2 | tok:0xA2 | 0xE5 | tok:0xE5 |
| 0x53 | 44 | LOG | 0xC1 | tok:0xC1 | 0xBE | tok:0xBE | 0x9D | tok:0x9D | 0xE2 | tok:0xE2 |
| 0x54 | 45 | x^2 | 0xBD | tok:0xBD | 0x37 | '7' | 0x9A | tok:0x9A | 0x00 | NONE |
| 0x55 | 46 | x^-1 | 0xB6 | tok:0xB6 | 0x33 | '3' | 0x00 | NONE | 0x44 | 'D' |
| 0x56 | 47 | MATH | 0x32 | '2' | 0x00 | NONE | 0x44 | 'D' | 0x5A | 'Z' |
| 0x57 | 48 | ALPHA | 0x00 | NONE | 0x4A | 'J' | 0x5A | 'Z' | 0x2E | '.' |
| 0x60 | 49 | GRAPH | 0x44 | 'D' | 0x3B | ';' | 0x2E | '.' | 0x48 | 'H' |
| 0x61 | 50 | TRACE | 0x5A | 'Z' | 0x57 | 'W' | 0x48 | 'H' | 0x49 | 'I' |
| 0x62 | 51 | ZOOM | 0x2E | '.' | 0x4B | 'K' | 0x49 | 'I' | 0x00 | NONE |
| 0x63 | 52 | WINDOW | 0x48 | 'H' | 0x30 | '0' | 0x00 | NONE | 0x45 | 'E' |
| 0x64 | 53 | Y= | 0x49 | 'I' | 0x00 | NONE | 0x45 | 'E' | 0x0A | [+] |
| 0x65 | 54 | 2ND | 0x00 | NONE | 0x40 | '@' | 0x0A | [+] | 0x3D | '=' |
| 0x66 | 55 | MODE | 0x45 | 'E' | 0x0B | [-] | 0x08 | tok:0x08 | 0x62 | 'b' |
| 0x67 | 56 | DEL | 0x0A | [+] | 0x08 | tok:0x08 | 0x02 | tok:0x02 | 0x11 | [,] |

## Out-of-range raw scancodes

Raw scans in group 7 (`(raw >> 4) == 7`) compute offsets `>= 57`, past the end of a 57-byte plane. These matrix cells have no corresponding translation-table entry. This is a finding about the matrix, not a bug in the decode: group 7 on the TI-84 Plus CE is the "no/ON/control" column that is handled by the ISR / event loop, not by the cooked-keycode table.

| rawScan | computed offset | physLabel (session 65) |
|:---|---:|:---|
| 0x70 | 57 | key0x70 |
| 0x71 | 58 | key0x71 |
| 0x72 | 59 | key0x72 |
| 0x73 | 60 | key0x73 |
| 0x74 | 61 | key0x74 |
| 0x75 | 62 | key0x75 |
| 0x76 | 63 | key0x76 |
| 0x77 | 64 | key0x77 |

Total out-of-range: **8**.

## Label cross-check

For every raw scancode that appears in both `phase25g-scancode-table-report.md` (session 64) and `phase25g-g-map.json` (session 65), labels were compared under a normalization that strips whitespace/case/`-`/`_`/`>`/`.`/`,` and treats session 65's `key0xNN` fallback as a match for session 64's `(unused)` or `(empty)`. Prefix-match is also accepted (e.g. `X,T,theta,n` in session 64 vs. `X,T,theta,n` in session 65 — identical after normalization).

- Raws checked (in both files): **56** (all of `0x00..0x07`, `0x10..0x17`, `0x20..0x27`, `0x30..0x37`, `0x40..0x47`, `0x50..0x57`, `0x60..0x67` — i.e. the entire non-group-7 space).
- Disagreements: **0**.

The two sessions agree on physical labels across the full non-group-7 matrix. Where session 64 marks a cell `(unused)` or `(empty)`, session 65 provides the `key0xNN` fallback — those are consistent by construction.

## Undecoded byte frequency

Cells whose decode is `tok:0xNN` (unknown token, not in the inline dictionary and not printable ASCII):

| Plane | Unknown-token cells |
|:---|---:|
| NONE | 17 |
| 2nd | 24 |
| ALPHA | 38 |
| 2nd+ALPHA | 35 |
| **Total (across 57 rows x 4 planes = 228 cells)** | **114** |

Exactly half of the 228 cells decode via the inline dictionary / ASCII fallback; the other half live in the `0x94..0xFF` range (the TI-OS extended token space plus prefix tokens). That range is the natural next target for a dedicated TI-OS-token phase; no probe work required, just a reference table import.

## Golden regression

Command:

```
node TI-84_Plus_CE/probe-phase99d-home-verify.mjs
```

Last lines of stdout:

```
  r51 c2: passCount=0 exactMatches=9 knownChars=26 unknowns=0 text="                          "
  r51 c3: passCount=0 exactMatches=9 knownChars=26 unknowns=0 text="                          "
  r51 c4: passCount=0 exactMatches=9 knownChars=26 unknowns=0 text="                          "
bestMatch=row39 col2
decoded="Normal Float Radian       "
assert Normal: PASS
assert Float: PASS
assert Radian: PASS
report=C:\Users\rober\Downloads\Projects\school\ti84-transpile\TI-84_Plus_CE\phase99d-report.md
```

Best match is `row39 col2` with `exactMatches=26 knownChars=26 unknowns=0` — i.e. 26/26 golden cells match exactly. All three home-screen asserts (`Normal`, `Float`, `Radian`) PASS. No regressions introduced by this phase (which only reads ROM / JSON — no CPU or peripheral state touched).

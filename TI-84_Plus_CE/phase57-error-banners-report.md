# Phase 57 Error Banner Render

## Summary
- `0x062160` is a RAM-parameterized banner renderer, not a hardcoded OVERFLOW helper.
- The selector lives at `0xD008DF`: the function reads `(0xD008DF & 0x7F)`, and for nonzero values uses a 1-based index into the 24-bit pointer table at `0x062290`.
- The pointer table contains 42 valid `0x062xxx` entries (`index 0..41`). The next 24-bit word at `0x06230e` is `0xD025A9`, so the table stops there.
- Selector `0` is a separate mode/status path keyed by `0xD00824` (`Error in Xmit`, `MemoryFull`, `VERSION`, `ARCHIVED`, `OS Overlaps Apps`, `Unsupported OS`).
- Every pointer-table-backed render hit the same 18-row banner template (`rows 37-54`, `938` fg pixels, `394` bg pixels) and only shifted horizontally to fit the chosen string.

## Calling Convention Finding
- `0x06218f` loads `A = (0xD008DF)`.
- `0x062193` masks it with `0x7F`.
- If the masked value is nonzero, `0x0621db-0x0621e8` decrements it and resolves `HL = *(0x062290 + 3 * (A - 1))`.
- If the masked value is zero, `0x0621a2-0x0621d4` switches on `0xD00824` instead.
- If the masked value is `>= 0x3A`, `HL` falls back to `0x062c99` (`?`).
- Real callers back this up: `0x0744b3` and `0x085126` call `0x062160` without staging a register argument, while `0x08515e` temporarily clears `0xD008DF` before the call to force the selector-zero path.

## Prologue Disassembly

```text
062160  fd cb 0c e6       set 4, (iy+12)
062164  40 2a 95 05       ld hl, (0x000595)
062168  e5                push hl
062169  af                xor a
06216a  32 95 05 d0       ld (0xd00595), a
06216e  21 a9 26 0b       ld hl, 0x0b26a9        ; "ERROR"
062172  3e 0b             ld a, 0x0b
062174  fd cb 35 4e       bit 1, (iy+53)
062178  c4 8e 39 02       call nz, 0x02398e
06217c  11 42 08 d0       ld de, 0xd00842
062180  ed a0             ldi
062182  7e                ld a, (hl)
062183  b7                or a
062184  20 fa             jr nz, 0x062180
062186  3e 3a             ld a, 0x3a
062188  12                ld (de), a
062189  13                inc de
06218a  3e 20             ld a, 0x20
06218c  12                ld (de), a
06218d  13                inc de
06218e  d5                push de
06218f  3a df 08 d0       ld a, (0xd008df)
062193  e6 7f             and 0x7f
062195  fe 3a             cp 0x3a
062197  38 06             jr c, 0x06219f
062199  21 99 2c 06       ld hl, 0x062c99        ; "?"
06219d  18 4b             jr 0x0621ea
06219f  b7                or a
0621a0  20 39             jr nz, 0x0621db
0621a2  3a 24 08 d0       ld a, (0xd00824)
0621a6  21 a6 2f 06       ld hl, 0x062fa6        ; "Error in Xmit"
0621aa  fe 37             cp 0x37
0621ac  28 3c             jr z, 0x0621ea
0621ae  21 f9 2f 06       ld hl, 0x062ff9        ; "MemoryFull"
0621b2  fe 35             cp 0x35
0621b4  28 34             jr z, 0x0621ea
0621b6  21 0d 2e 06       ld hl, 0x062e0d        ; "VERSION"
0621ba  fe 42             cp 0x42
0621bc  28 2c             jr z, 0x0621ea
0621be  21 c3 2d 06       ld hl, 0x062dc3        ; "ARCHIVED"
0621c2  fe 44             cp 0x44
0621c4  28 24             jr z, 0x0621ea
0621c6  21 a3 2c 06       ld hl, 0x062ca3        ; "OS Overlaps Apps"
0621ca  fe 4b             cp 0x4b
0621cc  28 1c             jr z, 0x0621ea
0621ce  21 4c 2d 06       ld hl, 0x062d4c        ; "Unsupported OS"
0621d2  fe 4c             cp 0x4c
0621d4  28 14             jr z, 0x0621ea
0621d6  d1                pop de
0621d7  c3 7e 22 06       jp 0x06227e
0621db  3d                dec a
0621dc  11 00 00 00       ld de, 0x000000
0621e0  5f                ld e, a
0621e1  21 90 22 06       ld hl, 0x062290
0621e5  19                add hl, de
0621e6  19                add hl, de
0621e7  19                add hl, de
0621e8  ed 27             ld hl, (hl)
0621ea  3e 0c             ld a, 0x0c
```

## Selector-Zero Special Cases

| `0xD00824` value | String address | String |
| --- | --- | --- |
| `0x37` | `0x062FA6` | `Error in Xmit` |
| `0x35` | `0x062FF9` | `MemoryFull` |
| `0x42` | `0x062E0D` | `VERSION` |
| `0x44` | `0x062DC3` | `ARCHIVED` |
| `0x4B` | `0x062CA3` | `OS Overlaps Apps` |
| `0x4C` | `0x062D4C` | `Unsupported OS` |

These are outside the pointer-table-backed `error-banners.json` sweep.

## Pointer Table Dump

| Index | String address | String | BBox x-span | Termination |
| --- | --- | --- | --- | --- |
| 0 | 0x062338 | OVERFLOW | 60-133 | max_steps@0x00038c |
| 1 | 0x062391 | DIVIDE BY 0 | 48-121 | max_steps@0x0a17c5 |
| 2 | 0x0623e1 | SINGULAR MATRIX | 24-97 | max_steps@0x07bf5c |
| 3 | 0x06244e | DOMAIN | 72-145 | max_steps@0x0a17e9 |
| 4 | 0x0624c6 | INCREMENT | 60-133 | max_steps@0x0a17d0 |
| 5 | 0x062504 | BREAK | 84-157 | max_steps@0x0a17f5 |
| 6 | 0x06251e | NONREAL ANSWERS | 24-97 | max_steps@0x07bf5c |
| 7 | 0x06256f | SYNTAX | 72-145 | max_steps@0x0a17e9 |
| 8 | 0x0625bf | DATA TYPE | 60-133 | max_steps@0x0a17d0 |
| 9 | 0x06261f | ARGUMENT | 60-133 | max_steps@0x00038c |
| 10 | 0x06267c | DIMENSION MISMATCH | 0-73 | max_steps@0x0a17b8 |
| 11 | 0x0626f9 | INVALID DIMENSION | 12-85 | max_steps@0x07bf3e |
| 12 | 0x06278d | UNDEFINED | 60-133 | max_steps@0x0a17d0 |
| 13 | 0x0627c2 | MEMORY | 72-145 | max_steps@0x0a17e9 |
| 14 | 0x06282e | INVALID | 72-145 | max_steps@0x005a53 |
| 15 | 0x06287a | ILLEGAL NEST | 36-109 | max_steps@0x07bf61 |
| 16 | 0x0628c0 | BOUND | 84-157 | max_steps@0x0a17f5 |
| 17 | 0x062909 | WINDOW RANGE | 36-109 | max_steps@0x07bf61 |
| 18 | 0x06296b | ZOOM | 84-157 | max_steps@0x0a1842 |
| 19 | 0x0629a3 | LABEL | 84-157 | max_steps@0x0a17f5 |
| 20 | 0x0629d1 | STAT | 84-157 | max_steps@0x0a1842 |
| 21 | 0x062a36 | SOLVER | 72-145 | max_steps@0x0a17e9 |
| 22 | 0x062a3e | SINGULARITY | 48-121 | max_steps@0x0a17c5 |
| 23 | 0x062a70 | NO SIGN CHANGE | 24-97 | max_steps@0x000380 |
| 24 | 0x062af7 | ITERATIONS | 48-121 | max_steps@0x0a2d4c |
| 25 | 0x062b5e | BAD GUESS | 60-133 | max_steps@0x0a17d0 |
| 26 | 0x062ba3 | STAT PLOT | 60-133 | max_steps@0x0a17d0 |
| 27 | 0x062bcd | TOLERANCE NOT MET | 12-85 | max_steps@0x07bf3e |
| 28 | 0x062c27 | RESERVED | 60-133 | max_steps@0x00038c |
| 29 | 0x062c5d | MODE | 84-157 | max_steps@0x0a1842 |
| 30 | 0x062c93 | LINK | 84-157 | max_steps@0x0a1842 |
| 31 | 0x062c93 | LINK | 84-157 | max_steps@0x0a1842 |
| 32 | 0x062c93 | LINK | 84-157 | max_steps@0x0a1842 |
| 33 | 0x062c93 | LINK | 84-157 | max_steps@0x0a1842 |
| 34 | 0x062c93 | LINK | 84-157 | max_steps@0x0a1842 |
| 35 | 0x062c99 | ? | 108-181 | max_steps@0x0a188c |
| 36 | 0x062c9c | SCALE | 84-157 | max_steps@0x0a17f5 |
| 37 | 0x062ca3 | OS Overlaps Apps | 12-85 | max_steps@0x07bf4d |
| 38 | 0x062d01 | NO MODE | 72-145 | max_steps@0x005a53 |
| 39 | 0x062d0a | VALIDATION | 48-121 | max_steps@0x0a2d4c |
| 40 | 0x062d37 | LENGTH | 72-145 | max_steps@0x0a17e9 |
| 41 | 0x062d3f | APPLICATION | 48-121 | max_steps@0x0a17c5 |

## Probe Output Snippet

```json
[
  {
    "index": 0,
    "stringAddr": "0x062338",
    "stringText": "OVERFLOW",
    "bbox": {
      "minRow": 37,
      "maxRow": 54,
      "minCol": 60,
      "maxCol": 133
    },
    "fgPixels": 938,
    "bgPixels": 394,
    "termination": "max_steps@0x00038c"
  },
  {
    "index": 1,
    "stringAddr": "0x062391",
    "stringText": "DIVIDE BY 0",
    "bbox": {
      "minRow": 37,
      "maxRow": 54,
      "minCol": 48,
      "maxCol": 121
    },
    "fgPixels": 938,
    "bgPixels": 394,
    "termination": "max_steps@0x0a17c5"
  },
  {
    "index": 2,
    "stringAddr": "0x0623e1",
    "stringText": "SINGULAR MATRIX",
    "bbox": {
      "minRow": 37,
      "maxRow": 54,
      "minCol": 24,
      "maxCol": 97
    },
    "fgPixels": 938,
    "bgPixels": 394,
    "termination": "max_steps@0x07bf5c"
  },
  {
    "index": 3,
    "stringAddr": "0x06244e",
    "stringText": "DOMAIN",
    "bbox": {
      "minRow": 37,
      "maxRow": 54,
      "minCol": 72,
      "maxCol": 145
    },
    "fgPixels": 938,
    "bgPixels": 394,
    "termination": "max_steps@0x0a17e9"
  },
  {
    "index": 4,
    "stringAddr": "0x0624c6",
    "stringText": "INCREMENT",
    "bbox": {
      "minRow": 37,
      "maxRow": 54,
      "minCol": 60,
      "maxCol": 133
    },
    "fgPixels": 938,
    "bgPixels": 394,
    "termination": "max_steps@0x0a17d0"
  }
]
```

## Browser-Shell Wiring Strategy
- Boot once, run OS init, set `cpu.mbase = 0xD0`, and keep the same clean post-init state used by the probe.
- Populate a dropdown from `error-banners.json` (`index` + label).
- On selection, set `mem[0xD008DF] = selected.index + 1` and clear `mem[0xD00824] = 0` so the renderer stays on the pointer-table path.
- Call `0x062160` directly. No register argument is needed for normal error banners.
- If the shell later needs the mode/status banners too, expose them as a second dropdown that uses `mem[0xD008DF] = 0` plus the `0xD00824` values above.

# Phase 63: `0x0a1cac` Investigation

## Executive take

`0x0a1cac` is the shared string-walk/render primitive underneath the error-banner path, the Phase 60 narrow header strip, the older Phase 42-55 text screens, and many additional UI families.

The core shape is simple:

```text
0x0a1cac:
  save bc/af
  b = (0xd02505)           ; row-limit / bottom bound
loop:
  a = (hl)                 ; read next byte from caller string
  hl++
  if a == 0: return
  call 0x0a1b5b            ; draw / handle control token
  if (0xd00595) < b: loop  ; keep going while current row is inside bound
  return
```

Strong hypothesis:

- `HL` is the input string pointer.
- `(0xd00595)` / `(0xd00596)` are the current text cursor row/column bytes.
- `(0xd02505)` is the maximum row bound for this text area.
- `0xD6` is a control token, likely newline / line-break.
- `HL` advances through the consumed string; `A` is preserved on return; flags are not.

## 1. Disassembly and block walk

### High-level reachable graph

```text
0x0a1cac
  z  -> 0x0a1cc4   ; empty / terminator -> return
  nz -> 0x0a1cb9   ; call helper 0x0a1b5b
           call    0x0a1b5b
           ret  -> 0x0a1cbd
                     c  -> 0x0a1cb3   ; keep reading bytes
                     nc -> 0x0a1cc4   ; stop when row bound reached
```

### First 10 reachable lifted blocks from `0x0a1cac`

These are the first 10 blocks reached by BFS over lifted exits starting at `0x0a1cac:adl`, following `branch`, `fallthrough`, `call`, and `call-return` edges.

#### Block 1: `0x0a1cac`

```asm
0x0a1cac: push bc
0x0a1cad: push af
0x0a1cae: ld a, (0xd02505)
0x0a1cb2: ld b, a
0x0a1cb3: ld a, (hl)
0x0a1cb4: inc hl
0x0a1cb5: or a
0x0a1cb6: scf
0x0a1cb7: jr z, 0x0a1cc4
```

Exits:

- `branch z -> 0x0a1cc4`
- `fallthrough -> 0x0a1cb9`

#### Block 2: `0x0a1cc4`

```asm
0x0a1cc4: pop bc
0x0a1cc5: ld a, b
0x0a1cc6: pop bc
0x0a1cc7: ret
```

Exits:

- `return`

Notes:

- This restores the original `A` by abusing the saved `AF` on stack: `pop bc ; ld a, b`.
- `BC` is preserved; flags are not restored.

#### Block 3: `0x0a1cb9`

```asm
0x0a1cb9: call 0x0a1b5b
```

Exits:

- `call -> 0x0a1b5b`
- `call-return -> 0x0a1cbd`

#### Block 4: `0x0a1b5b`

```asm
0x0a1b5b: push af
0x0a1b5c: push hl
0x0a1b5d: cp 0xd6
0x0a1b5f: jr nz, 0x0a1b77
```

Exits:

- `branch nz -> 0x0a1b77`
- `fallthrough -> 0x0a1b61`

Notes:

- `0xD6` is a special control token.
- Non-`0xD6` bytes take the normal glyph path.

#### Block 5: `0x0a1cbd`

```asm
0x0a1cbd: ld a, (0xd00595)
0x0a1cc1: cp b
0x0a1cc2: jr c, 0x0a1cb3
```

Exits:

- `branch c -> 0x0a1cb3`
- `fallthrough -> 0x0a1cc4`

Notes:

- The outer loop continues while the current row byte is still below the row limit loaded into `B`.

#### Block 6: `0x0a1b77`

```asm
0x0a1b77: call 0x0a1799
```

Exits:

- `call -> 0x0a1799`
- `call-return -> 0x0a1b7b`

Notes:

- This is the normal printable-glyph path.

#### Block 7: `0x0a1b61`

```asm
0x0a1b61: call 0x0a22b1
```

Exits:

- `call -> 0x0a22b1`
- `call-return -> 0x0a1b65`

Notes:

- This is the special-token path for byte `0xD6`.

#### Block 8: `0x0a1cb3`

```asm
0x0a1cb3: ld a, (hl)
0x0a1cb4: inc hl
0x0a1cb5: or a
0x0a1cb6: scf
0x0a1cb7: jr z, 0x0a1cc4
```

Exits:

- `branch z -> 0x0a1cc4`
- `fallthrough -> 0x0a1cb9`

Notes:

- This is the steady-state loop body after the first byte.

#### Block 9: `0x0a1799`

```asm
0x0a1799: di
0x0a179a: push af
0x0a179b: push bc
0x0a179c: push de
0x0a179d: push hl
0x0a179e: push ix
0x0a17a0: res 2, (iy+2)
0x0a17a4: bit 1, (iy+13)
0x0a17a8: jr z, 0x0a17af
```

Exits:

- `branch z -> 0x0a17af`
- `fallthrough -> 0x0a17aa`

Notes:

- This helper is heavily `IY`-flag driven and looks like the actual glyph blitter / glyph dispatch path.

#### Block 10: `0x0a1b7b`

```asm
0x0a1b7b: res 0, (iy+8)
0x0a1b7f: ld hl, 0xd00596
0x0a1b83: inc (hl)
0x0a1b84: ld a, (hl)
0x0a1b85: cp 0x1a
0x0a1b87: call nc, 0x0a2032
```

Exits:

- `call -> 0x0a2032`
- `call-return -> 0x0a1b8b`

Notes:

- The byte at `0xd00596` increments after each normal glyph.
- `0x1A` is almost certainly the text-column width in character cells.
- Hitting `0x1A` triggers the line-advance / wrap helper `0x0a2032`.

### Supporting follow-on blocks that make the API legible

These are not part of the “first 10” requirement, but they pin down the calling convention.

#### `0x0a1b65` and `0x0a1b69`

```asm
0x0a1b65: call 0x0a2032

0x0a1b69: ld a, (0xd02505)
0x0a1b6d: ld l, a
0x0a1b6e: ld a, (0xd00595)
0x0a1b72: cp l
0x0a1b73: jr nc, 0x0a1b8b
```

Interpretation:

- The special `0xD6` token always forces a call to the line-advance helper.
- After line advance, the helper checks whether current row `0xd00595` has reached the row bound `0xd02505`.

#### `0x0a1b8b`

```asm
0x0a1b8b: pop hl
0x0a1b8c: pop af
0x0a1b8d: ret
```

Interpretation:

- The inner helper preserves caller `HL` and `A`.
- The outer loop is what permanently advances `HL`.

#### `0x0a2032` and `0x0a203c`

```asm
0x0a2032: push af
0x0a2033: push bc
0x0a2034: push de
0x0a2035: push hl
0x0a2036: push ix
0x0a2038: call 0x0a2013

0x0a203c: push af
0x0a203d: sub a
0x0a203e: ld (0xd00596), a
0x0a2042: ld hl, 0xd00595
0x0a2046: ld ix, 0xd02504
0x0a204b: ld a, (hl)
0x0a204c: inc a
0x0a204d: cp (ix+1)
0x0a2050: jr c, 0x0a20c2
```

Interpretation:

- `0x0a2032` is the wrap / next-line helper.
- It zeroes `0xd00596`, then tries to increment `0xd00595`.
- It compares against `(0xd02505)` via `ix = 0xd02504` and `cp (ix+1)`.

#### `0x0a2052`, `0x0a2058`, `0x0a2064`, `0x0a20c2`

```asm
0x0a2052: bit 2, (iy+13)
0x0a2056: jr z, 0x0a20c2

0x0a2058: set 2, (iy+5)
0x0a205c: set 6, (iy+76)
0x0a2060: pop af
0x0a2061: push af
0x0a2062: jr z, 0x0a2079

0x0a2064: ld hl, 0xd02684
0x0a2068: ld a, 0xd9
0x0a206a: sub (hl)
0x0a206b: ld b, a
0x0a206c: ld c, 0x14
0x0a206e: ld a, (hl)
0x0a206f: res 7, (iy+76)
0x0a2073: call 0x092f35

0x0a20c2: ld (hl), a
0x0a20c3: pop af
0x0a20c4: call nz, 0x0a1f80
```

Interpretation:

- If there is still room, `0x0a20c2` simply writes the incremented row back to `0xd00595`.
- If there is no room, the helper consults more `IY` flags and can fall into a heavier path that likely scrolls or repaints a text region.

#### `0x0a22b1` and `0x0a22be`

```asm
0x0a22b1: push af
0x0a22b2: bit 1, (iy+42)
0x0a22b6: jr z, 0x0a22be

0x0a22b8: pop af
0x0a22b9: call 0x025c33

0x0a22be: di
0x0a22bf: push bc
0x0a22c0: push de
0x0a22c1: push hl
0x0a22c2: ld a, (0xd00596)
0x0a22c6: call 0x00038c
0x0a22ca: ld de, 0x000139
0x0a22ce: ld a, (0xd00595)
0x0a22d2: call 0x0a2d4c
```

Interpretation:

- The `0xD6` control-token path does not go through the normal glyph helper.
- It looks layout-oriented: it consults the current column/row bytes and a separate helper instead.
- That makes `0xD6` look much more like newline / explicit line-break than a normal glyph token.

## 2. Calling convention hypothesis

### What the primitive expects

| Input | Evidence | Hypothesis |
| --- | --- | --- |
| `HL` | `0x03f312: ld hl, 0xd005f8 ; call 0x0a1cac`, `0x04266a: ld hl, 0xd005f8 ; jp 0x0a1cac`, `0x046184: ld hl, 0x046141 ; call 0x0a1cac` | `HL` is the pointer to the source string / token stream. |
| `(0xd00595)` | Read at `0x0a1cbd`, incremented in wrap helper `0x0a203c`, set by callers like `0x046180: ld (0x000595), hl` | Current text row. |
| `(0xd00596)` | Incremented per normal glyph in `0x0a1b7f`, wrapped at `0x1A`, zeroed in `0x0a203e` | Current text column. |
| `(0xd02505)` | Loaded into `B` at entry, compared again in `0x0a1b69` and `0x0a204d` | Maximum row bound / bottom limit for this text region. |
| `IY+*` flags | `0x0a1799`, `0x0a2013`, `0x0a2052`, `0x0a22b1` all consult `IY` offsets | Global text-render mode / scrolling / clipping / control-token behavior lives in `IY` flags. |

### Concrete caller evidence

#### `HL` is the string pointer

```asm
0x03f312: ld hl, 0xd005f8
0x03f316: call 0x0a1cac

0x04266a: ld hl, 0xd005f8
0x04266e: jp 0x0a1cac

0x046184: ld hl, 0x046141
0x046188: call 0x0a1cac

0x0ae357: ld hl, 0xd005f8
0x0ae35b: call 0x0a1cac
```

This is the strongest signal in the whole investigation. The caller nearly always arranges `HL` immediately before the call or immediately before a helper that returns into the call block.

#### The cursor lives in RAM, not registers

```asm
0x08188a: ld (0xd00595), a
0x08188e: ld (0xd00596), a
0x081892: call 0x0a1cac

0x04617c: ld hl, 0x000000
0x046180: ld (0x000595), hl
0x046184: ld hl, 0x046141
0x046188: call 0x0a1cac

0x046216: ld hl, 0x000103
0x04621a: ld (0x000595), hl
0x04621e: ld hl, 0x0461fe
0x046222: call 0x0a1cac

0x08918a: ld d, (hl)
0x08918b: ld e, 0x02
0x08918d: ld (0x000595), de
0x089192: inc hl
0x089193: call 0x0a1cac
```

`ld (0x000595), hl` / `ld (0x000595), de` is especially revealing in ADL mode:

- low byte at `0xd00595` = row
- next byte at `0xd00596` = column

The `0x000103` setup above reads naturally as row `3`, column `1`.

#### `0xD6` is likely newline / line-break

Why:

- `0x0a1b5b` branches on `cp 0xd6`.
- Non-`0xD6` bytes go through glyph helper `0x0a1799`.
- `0xD6` goes through `0x0a22b1`, then always through the wrap / next-line helper `0x0a2032`.
- The normal path increments column and wraps at `0x1A`; the `0xD6` path skips that and line-advances directly.

### Register preservation / side effects

| Item | Result |
| --- | --- |
| `A` | Preserved by outer function. |
| `BC` | Preserved by outer function. |
| Flags | Not preserved. |
| `HL` | Consumed / advanced through the string. |
| `DE`, `IX` | Used by helpers; callers should not assume preservation unless their specific wrapper documents it. |

## 3. Caller scan

### Scan method

I reused the Phase 60 pattern exactly:

- lifted direct refs from `ROM.transpiled.js` via `instruction.target`
- raw ROM direct refs via literal `CALL` / `JP` opcodes targeting `0x0a1cac`
- de-dupe on `{ callerPc, kind }`

### Totals

- Total direct caller sites: `110`
- Lifted: `108`
- Raw-only: `2`
- `call`: `103`
- `jp`: `7`

Raw-only sites:

- `0x0207c0`: jump-table/export row that dispatches directly to `0x0a1cac`
- `0x0b682f`: unlifted raw call inside heuristic entry `0x0b681e`

### Full caller inventory

| Caller PC | Kind | Block / heuristic entry | Source | Note |
| --- | --- | --- | --- | --- |
| 0x0207c0 | jp | 0x0207c0 | raw | raw jump-table/export row |
| 0x024528 | call | 0x02451a | lifted |  |
| 0x028a17 | call | 0x028a14 | lifted | known Phase 42-55 text-screen family |
| 0x028f0b | call | 0x028f0a | lifted | known Phase 42-55 text-screen family |
| 0x029829 | call | 0x029829 | lifted | known Phase 42-55 text-screen family |
| 0x02985e | call | 0x029858 | lifted | known Phase 42-55 text-screen family |
| 0x029878 | call | 0x029878 | lifted | known Phase 42-55 text-screen family |
| 0x029892 | call | 0x029892 | lifted | known Phase 42-55 text-screen family |
| 0x0298ac | call | 0x0298ac | lifted | known Phase 42-55 text-screen family |
| 0x02fc87 | call | 0x02fc87 | lifted |  |
| 0x03dc1b | call | 0x03dc11 | lifted |  |
| 0x03e182 | call | 0x03e182 | lifted |  |
| 0x03ec07 | call | 0x03ec03 | lifted |  |
| 0x03f316 | call | 0x03f312 | lifted | known DispMessage / OP1-string family |
| 0x03f357 | call | 0x03f34e | lifted | known DispMessage / OP1-string family |
| 0x040aea | call | 0x040ade | lifted |  |
| 0x04266e | jp | 0x04266a | lifted | known DispMessage / OP1-string family |
| 0x04552f | call | 0x04552f | lifted |  |
| 0x0455c6 | call | 0x0455c2 | lifted |  |
| 0x0458bf | call | 0x0458b3 | lifted |  |
| 0x045999 | call | 0x045988 | lifted |  |
| 0x045de1 | call | 0x045dc5 | lifted |  |
| 0x045e01 | call | 0x045de5 | lifted |  |
| 0x045e11 | call | 0x045e05 | lifted |  |
| 0x045e7c | call | 0x045e60 | lifted |  |
| 0x045e9c | call | 0x045e80 | lifted |  |
| 0x045eac | call | 0x045ea0 | lifted |  |
| 0x045ecd | call | 0x045ecd | lifted |  |
| 0x045edd | call | 0x045ed1 | lifted |  |
| 0x045ef7 | call | 0x045ef7 | lifted |  |
| 0x045f3e | call | 0x045f22 | lifted |  |
| 0x046126 | call | 0x046109 | lifted |  |
| 0x046188 | call | 0x04616c | lifted |  |
| 0x0461eb | call | 0x0461df | lifted |  |
| 0x046222 | call | 0x046216 | lifted |  |
| 0x046272 | call | 0x046256 | lifted |  |
| 0x046319 | call | 0x046319 | lifted |  |
| 0x046878 | call | 0x04685c | lifted |  |
| 0x046983 | call | 0x046982 | lifted |  |
| 0x04e21f | call | 0x04e21e | lifted |  |
| 0x05cec6 | call | 0x05cec6 | lifted |  |
| 0x05cef2 | call | 0x05cef2 | lifted |  |
| 0x05cf76 | call | 0x05cf6d | lifted |  |
| 0x05e76e | call | 0x05e76a | lifted |  |
| 0x061f99 | call | 0x061f8d | lifted |  |
| 0x061fa9 | call | 0x061f9c | lifted |  |
| 0x061fc1 | call | 0x061fbc | lifted |  |
| 0x06225f | call | 0x062257 | lifted | known error-banner dispatcher |
| 0x06b004 | call | 0x06b004 | lifted |  |
| 0x06b46d | call | 0x06b46d | lifted |  |
| 0x06b483 | call | 0x06b482 | lifted |  |
| 0x06b648 | call | 0x06b648 | lifted |  |
| 0x06b65e | call | 0x06b65e | lifted |  |
| 0x06b674 | call | 0x06b674 | lifted |  |
| 0x06b70b | call | 0x06b70b | lifted |  |
| 0x06db0d | call | 0x06db0d | lifted |  |
| 0x074bf1 | call | 0x074be1 | lifted |  |
| 0x074cfb | call | 0x074cf7 | lifted |  |
| 0x081892 | call | 0x081889 | lifted | known Phase 60 header-strip family |
| 0x08524b | call | 0x08523e | lifted |  |
| 0x08526a | call | 0x08526a | lifted |  |
| 0x085292 | call | 0x085292 | lifted |  |
| 0x0854cf | call | 0x0854c2 | lifted |  |
| 0x086c05 | call | 0x086c01 | lifted |  |
| 0x08912f | call | 0x08912f | lifted |  |
| 0x089167 | call | 0x089166 | lifted |  |
| 0x089193 | call | 0x089189 | lifted |  |
| 0x08bc88 | call | 0x08bc88 | lifted |  |
| 0x0936a6 | call | 0x0936a6 | lifted |  |
| 0x096948 | call | 0x09693e | lifted |  |
| 0x096a39 | call | 0x096a29 | lifted |  |
| 0x096b0b | call | 0x096b02 | lifted |  |
| 0x097b12 | call | 0x097b12 | lifted |  |
| 0x09cc5c | call | 0x09cc5c | lifted |  |
| 0x09d0dd | call | 0x09d0dc | lifted |  |
| 0x09d539 | call | 0x09d52e | lifted |  |
| 0x09ec0e | call | 0x09ec0e | lifted | known About-screen family |
| 0x09ec4b | call | 0x09ec2f | lifted | known About-screen family |
| 0x09ec67 | call | 0x09ec5b | lifted | known About-screen family |
| 0x09ec77 | call | 0x09ec6b | lifted | known About-screen family |
| 0x09ec93 | call | 0x09ec8a | lifted | known About-screen family |
| 0x09ec9f | call | 0x09ec9f | lifted | known About-screen family |
| 0x09ecef | call | 0x09ece3 | lifted | known About-screen family |
| 0x09ed0f | call | 0x09ecf9 | lifted | known About-screen family |
| 0x09ed2c | call | 0x09ed29 | lifted | known About-screen family |
| 0x09ed3c | call | 0x09ed30 | lifted | known About-screen family |
| 0x09ed4c | jp | 0x09ed40 | lifted | known About-screen family |
| 0x09edb7 | call | 0x09edab | lifted | known About-screen family |
| 0x09edbf | jp | 0x09edbf | lifted | known About-screen family |
| 0x0a2d84 | call | 0x0a2d7a | lifted |  |
| 0x0a59cc | call | 0x0a59cc | lifted |  |
| 0x0a5b5f | call | 0x0a5b5f | lifted |  |
| 0x0a6134 | call | 0x0a6134 | lifted |  |
| 0x0a622c | call | 0x0a622c | lifted |  |
| 0x0a6249 | call | 0x0a6249 | lifted |  |
| 0x0ab29e | call | 0x0ab29a | lifted |  |
| 0x0ac6bc | call | 0x0ac6bc | lifted |  |
| 0x0ae35b | call | 0x0ae357 | lifted |  |
| 0x0b19e3 | call | 0x0b19e3 | lifted |  |
| 0x0b19fb | call | 0x0b19fb | lifted |  |
| 0x0b20c5 | call | 0x0b20ba | lifted |  |
| 0x0b252c | jp | 0x0b252c | lifted | STAT/plot setup label family |
| 0x0b2534 | jp | 0x0b2534 | lifted | STAT/plot setup label family |
| 0x0b253c | jp | 0x0b253c | lifted | STAT/plot setup label family |
| 0x0b3f1b | call | 0x0b3f1b | lifted |  |
| 0x0b682f | call | 0x0b681e | raw | raw-only unlifted caller |
| 0x0b72fc | call | 0x0b72fc | lifted |  |
| 0x0b79f3 | call | 0x0b79f3 | lifted |  |
| 0x0b7a70 | call | 0x0b7a70 | lifted |  |
| 0x0baa2d | call | 0x0baa1f | lifted |  |

## 4. Top novel callers worth probing next

These are the best future-phase targets after excluding the already-known families called out in the task prompt.

### 1. `0x0baa2d` via block `0x0baa1f`

Why:

- Nearby strings are explicit and high-value:
  - `OS and App are not`
  - `compatible. Please update`
  - `to latest versions at`
  - `education.ti.com`
- The setup is clean and informative:

```asm
0x0baa15: ld hl, 0x0a306f
0x0baa19: ld a, 0x54
0x0baa1b: call 0x080244
0x0baa1f: inc hl
0x0baa20: inc hl
0x0baa21: inc hl
0x0baa22: ld a, 0x08
0x0baa24: ld (0xd00595), a
0x0baa29: ld (0xd00596), a=0
0x0baa2d: call 0x0a1cac
```

Why it matters:

- This looks like a modern, standalone compatibility-warning screen rather than an old menu/text-screen family.
- It likely exercises positioning plus style setup in a very controlled way.

### 2. `0x046983` via block `0x04697c`

Why:

- Nearby strings:
  - `Enter Self-Test?`
  - `This will clear all memory`
  - `Press `
  - `ON] to cancel`
  - `Diagnostics`
  - `1. LCD`
  - `2. Bright`
  - `3. Battery`

Setup shape:

```asm
0x04697c: ld (0x000595), hl
0x046980: pop hl
0x046981: inc hl
0x046982: inc hl
0x046983: call 0x0a1cac
```

Why it matters:

- This looks like a diagnostics/self-test menu hub, not just a single label.
- It probably feeds multiple stacked strings through the same cursor pair and will expose menu-layout conventions.

### 3. `0x046188` / `0x046222` / `0x046272` diagnostics subfamily

Why:

- Nearby strings:
  - `Keyboard Test, ON = halt`
  - `Test Halt. Press a key.`
  - `FLASH System Test`

Representative setup:

```asm
0x04617c: ld hl, 0x000000
0x046180: ld (0x000595), hl
0x046184: ld hl, 0x046141
0x046188: call 0x0a1cac

0x046216: ld hl, 0x000103
0x04621a: ld (0x000595), hl
0x04621e: ld hl, 0x0461fe
0x046222: call 0x0a1cac
```

Why it matters:

- These callers explicitly preload row/column as packed bytes in `0xd00595/96`.
- They are ideal for confirming that `0x000103` really means row `3`, column `1`.

### 4. `0x08bc88`

Why:

- Nearby strings:
  - `Auto`
  - `SET CLOCK`
  - `FUNCTION`
  - `GridDot`
  - `HORIZONTAL`
  - `GRAPH-TABLE`
  - `BEGIN`
  - `PARAMETRIC`

Observed setup:

```asm
0x08bc80: set 1, (iy+5)
0x08bc84: call 0x08bcc4
0x08bc88: call 0x0a1cac
```

Why it matters:

- This looks like a graph/settings mode UI family rather than a generic message box.
- The preceding helper likely computes `HL` from a pushed table pointer, so probing it should expose a higher-level string-table API.

### 5. `0x06b004`

Why:

- Nearby strings:
  - `Upper Limit?`
  - `Left Bound?`
  - `Right Bound?`
  - `Guess?`
  - `Zero`
  - `STORE RESULTS?`
  - `DROP POINTS`
  - `SELECT`

Observed setup:

```asm
0x06aff6: ld hl, 0x0a2fb8
0x06affa: ld a, 0x66
0x06affc: bit 1, (iy+53)
0x06b000: call nz, 0x02398e
0x06b004: call 0x0a1cac
```

Why it matters:

- This looks like an interactive numeric-solver prompt family, which should exercise tokenized strings and possibly conditional pre-formatting.
- It is distinct from the already-known error banners, About screen, and early text screens.

## Bottom line

`0x0a1cac` is not just “a text helper.” It is the central null-terminated string/token walker that:

- reads bytes from `HL`
- uses RAM cursor bytes at `0xd00595/0xd00596`
- wraps at `26` columns
- stops at a row bound stored at `0xd02505`
- supports at least one control token, `0xD6`, that likely means newline

That exactly fits the Phase 60 strip renderer, the Phase 57 error banners, the older Phase 42-55 text screens, and a much larger set of UI families across diagnostics, graph/settings, solver prompts, and compatibility warnings.

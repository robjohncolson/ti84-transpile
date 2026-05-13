# Phase 312: Top Low-Address OS API Vectors

## Scope

This pass covers the low-address jump-vector bank at `0x000200..0x0003FF`.

- Vector format: `JP target` encoded as `C3 xx yy zz`
- Slot size: `4` bytes
- Total slots in range: `128`
- ROM source: `TI-84_Plus_CE/ROM.rom`
- Symbol source: `TI-84_Plus_CE/references/ti84pceg.inc`
- Transpiled lift source: `TI-84_Plus_CE/ROM.transpiled.js`

## Method

The transpiled JS is only partially lifted (`16.8%` coverage in `ROM.transpiled.report.json`), and each lifted block stores both instruction metadata and an embedded source string. That means raw text counting in `ROM.transpiled.js` double-counts, while lift-only unique-site counting undercounts.

To keep the ranking accurate:

1. The low-address vector names came from `ti84pceg.inc`.
2. The vector targets came from direct ROM reads at `0x000200..0x0003FF`.
3. The top-10 ranking uses direct ROM scans for `CALL` and conditional `CALL` opcodes targeting the vector slots.
4. The disassembly and categorization were checked against the lifted block comments in `ROM.transpiled.js`.

This matches the expected hot pair:

- `0x000204` -> `140` callers
- `0x000264` -> `140` callers

## Top 10 Summary

| Rank | Vector | Name | Target | CALL refs | Category | Register Contract |
| ---: | --- | --- | --- | ---: | --- | --- |
| 1 | `0x000204` | `_scmpzero` | `0x0025E8` | 140 | scalar compare / flag helper | `HL` in, flags out, `HL`/`DE` preserved |
| 2 | `0x000264` | `_stoiu` | `0x00276B` | 140 | integer conversion | `BC` in, `HL` out (`HL = BC`, zero-extended) |
| 3 | `0x0003F0` | unnamed | `0x015349` | 85 | internal workspace / descriptor staging | stack-framed args via `IX`; returns mainly through `0xD177xx` state |
| 4 | `0x000218` | `_setflag` | `0x002696` | 81 | signed-compare flag fixup | input flags in `AF`; output adjusted flags in `AF`; `BC` preserved |
| 5 | `0x0003EC` | unnamed | `0x0152D8` | 74 | internal span / workspace staging | stack-framed args via `IX`; writes `0xD1770D/10/19` |
| 6 | `0x000288` | `_fmul` | `0x00372B` | 71 | compiler float primitive | inferred packed-float tuple in registers / frame, normalized product out |
| 7 | `0x000270` | `_fadd` | `0x003569` | 56 | compiler float primitive | inferred packed-float tuple in registers / frame, normalized sum out |
| 8 | `0x000210` | `_seqcase` | `0x002623` | 49 | switch / case helper | `HL` selector in, `HL` case target out via 3-byte table |
| 9 | `0x000274` | `_fcmp` | `0x0035C8` | 45 | compiler float compare | inferred float compare inputs, flags out for immediate branch use |
| 10 | `0x0003E4` | `usb_BusPowered` | `0x006EAF` | 34 | USB power-status probe | no meaningful inputs; `A=1/0` result |

## Detailed Disassembly

### `0x000204` -> `_scmpzero` -> `0x0025E8`

Category: scalar compare / zero-test helper.

Interpretation:

- Clears `DE`, subtracts zero from `HL`, restores `DE` and `HL`, and returns.
- This is a classic "set flags as if `HL - 0` had been performed, but preserve the value."

Register contract:

- Input: `HL`
- Output: flags only
- Preserves: `HL`, `DE`, `A`

```asm
0x0025E8  push hl
0x0025E9  push de
0x0025EA  ld d, 0x00
0x0025EC  ld e, 0x00
0x0025EE  or a
0x0025EF  sbc hl, de
0x0025F2  pop de
0x0025F3  pop hl
0x0025F4  ret
```

### `0x000264` -> `_stoiu` -> `0x00276B`

Category: integer conversion / zero-extension helper.

Interpretation:

- Clears `HL`, then copies `BC` into `HL`.
- This behaves like a `short`/`unsigned short` to `int` zero-extension primitive.

Register contract:

- Input: `BC`
- Output: `HL = BC`
- Side effect: carry cleared by the leading `or a`

```asm
0x00276B  or a
0x00276C  sbc hl, hl
0x00276E  ld l, c
0x00276F  ld h, b
0x002770  ret
```

### `0x0003F0` -> unnamed -> `0x015349`

Category: internal workspace / descriptor staging helper.

Interpretation:

- Builds state in the `0xD177xx` workspace from stack-framed arguments.
- It calls `0x002197` first, which re-bases `IX` onto the current stack frame.
- The first bytes strongly suggest a parameter marshaller rather than a leaf arithmetic helper.

Register contract:

- Input: arguments on the stack, accessed via `IX+6`, `IX+9`, `IX+18`, `IX+21`
- Output: state written to `0xD1770D`, `0xD1771E`, `0xD17719`, `0xD17721`
- Return: no obvious scalar return value in the first block; this is side-effect driven

```asm
0x015349  ld hl, 0xFFFFFA
0x01534D  call 0x002197
0x015351  ld a, (ix+18)
0x015354  or a
0x015355  sbc hl, hl
0x015357  ld l, a
0x015358  ld bc, (ix+21)
0x01535B  add hl, bc
0x01535C  ld (0xD1770D), hl
0x015360  ld bc, (ix+6)
0x015363  ld (0xD1771E), bc
0x015368  ld a, (ix+9)
0x01536B  ld (0xD17721), a
0x01536F  ld a, (ix+18)
0x015372  ld (0xD17719), a
0x015376  ld a, (ix+18)
0x015379  cp 0x08
0x01537B  jr nz, 0x0153E2
```

### `0x000218` -> `_setflag` -> `0x002696`

Category: signed-compare flag fixup.

Interpretation:

- Copies `AF` into `BC`, inspects bit 2 of the flags byte (`P/V`), and conditionally toggles bit 7 (`S`).
- This is the usual signed-compare post-processing step: if overflow happened, flip the sign interpretation.

Register contract:

- Input: `AF` from a preceding arithmetic compare
- Output: corrected `AF`
- Preserves: original `BC`

```asm
0x002696  push bc
0x002697  push af
0x002698  pop bc
0x002699  bit 2, c
0x00269B  jr z, 0x0026A1
0x00269D  ld a, c
0x00269E  xor 0x80
0x0026A0  ld c, a
0x0026A1  push bc
0x0026A2  pop af
0x0026A3  pop bc
0x0026A4  ret
```

### `0x0003EC` -> unnamed -> `0x0152D8`

Category: internal span / workspace staging helper.

Interpretation:

- Another `IX`-framed marshaller adjacent to `0x015349`, but with a smaller parameter set.
- Stores a base pointer, a byte count / span byte, and computes a derived pointer in `0xD1770D`.
- The decrement of `0xD17719` makes this look like a counted span/iterator setup helper.

Register contract:

- Input: arguments on the stack, accessed via `IX+6`, `IX+9`, `IX+12`
- Output: writes `0xD17710`, `0xD17719`, `0xD1770D`
- Return: side-effect driven

```asm
0x0152D8  ld hl, 0xFFFFFA
0x0152DC  call 0x002197
0x0152E0  ld bc, (ix+6)
0x0152E3  ld (0xD17710), bc
0x0152E8  ld a, (ix+9)
0x0152EB  ld (0xD17719), a
0x0152EF  ld a, (ix+9)
0x0152F2  or a
0x0152F3  sbc hl, hl
0x0152F5  ld l, a
0x0152F6  ld bc, (ix+12)
0x0152F9  add hl, bc
0x0152FA  ld (0xD1770D), hl
0x0152FE  ld a, (0xD17719)
0x015302  ld b, a
0x015303  ld a, (0xD17719)
0x015307  dec a
0x015308  ld (0xD17719), a
0x01530C  ld a, b
0x01530D  or a
0x01530E  jr z, 0x015344
```

### `0x000288` -> `_fmul` -> `0x00372B`

Category: compiler float multiply primitive.

Interpretation:

- Enters through an `IX` frame, calls the shared helpers at `0x0034A7` and `0x0034CC`, then performs sign/exponent arithmetic and normalization.
- This is not the higher-level OS `OP1/OP2` entry from the phase 25 probes; it looks like the compiler runtime's lower-level multiply kernel.

Register contract:

- Inferred input: packed float pieces staged in registers and/or the current frame
- Inferred output: normalized product returned in the same tuple plus flags
- Confidence: medium, based on prologue and callers

```asm
0x00372B  push ix
0x00372D  push hl
0x00372E  push de
0x00372F  ld ix, 0x000000
0x003734  add ix, sp
0x003736  call 0x0034A7
0x00373A  push bc
0x00373B  ld c, a
0x00373C  ld a, d
0x00373D  call 0x0034CC
0x003741  push hl
0x003742  xor d
0x003743  ld b, 0x00
0x003745  ld d, 0x00
0x003747  ld hl, 0xFFFF80
0x00374B  add hl, bc
0x00374C  add hl, de
0x00374D  ld d, a
0x00374E  ld e, l
0x00374F  ld a, h
0x003750  or a
0x003751  jr z, 0x00375E
0x003753  cp 0x80
0x003755  sbc hl, hl
0x003757  ld e, h
0x003758  ld a, 0x00
0x00375A  jp 0x0037DE
```

### `0x000270` -> `_fadd` -> `0x003569`

Category: compiler float add primitive.

Interpretation:

- Same shared front-end helpers as `_fmul`, but the body is centered on exponent alignment and magnitude comparison before the real addition/subtraction path.
- The `cp e`, `sub e`, and branch structure make it look like exponent-delta handling before mantissa combine.

Register contract:

- Inferred input: packed float tuple in registers / frame
- Inferred output: normalized sum in the same tuple plus flags
- Confidence: medium

```asm
0x003569  push hl
0x00356A  push de
0x00356B  call 0x0034A7
0x00356F  rr d
0x003571  push af
0x003572  call 0x0034CC
0x003576  pop af
0x003577  rl d
0x003579  rrc d
0x00357B  cp e
0x00357C  jr c, 0x003587
0x00357E  rlc d
0x003580  push hl
0x003581  push bc
0x003582  ld b, a
0x003583  ld a, e
0x003584  ld e, b
0x003585  pop hl
0x003586  pop bc
0x003587  sub e
0x003588  jr z, 0x0035B0
0x00358A  cp 0xE8
0x00358C  ccf
0x00358D  jr nc, 0x0035BC
```

### `0x000210` -> `_seqcase` -> `0x002623`

Category: switch / case helper.

Interpretation:

- This is a compact case-dispatch routine.
- It compares the selector in `HL` against a base/range pair taken from the stack frame, clamps to a default index when out of range, multiplies the selected index by `3`, and loads a 24-bit target from the table.
- This is consistent with the name: a sequential-case helper used by compiled switch statements.

Register contract:

- Input: `HL = selector`
- Input frame: `IY`-relative metadata plus a table of 3-byte case targets
- Output: `HL = selected 24-bit target`

```asm
0x002623  ex (sp), iy
0x002625  push af
0x002626  push bc
0x002627  push de
0x002628  lea iy, iy+5
0x00262B  ld de, 0x000000
0x00262F  ld bc, (iy-5)
0x002632  ld e, c
0x002633  ld d, b
0x002634  ld bc, (iy-3)
0x002637  or a
0x002638  sbc hl, bc
0x00263A  jp m, 0x002647
0x00263E  push hl
0x00263F  or a
0x002640  sbc hl, de
0x002642  pop hl
0x002643  jp m, 0x002649
0x002647  push de
0x002648  pop hl
0x002649  push hl
0x00264A  pop bc
0x00264B  add hl, hl
0x00264C  add hl, bc
0x00264D  push hl
0x00264E  pop bc
0x00264F  add iy, bc
0x002651  ld hl, (iy+0)
```

### `0x000274` -> `_fcmp` -> `0x0035C8`

Category: compiler float compare.

Interpretation:

- Front-loads a helper call to `0x0023AD`, then transforms flags and sign-related bits before returning.
- The callers branch immediately after the vector call, so the main product of this routine is the final flag state rather than a stored numeric result.

Register contract:

- Inferred input: unpacked float pieces already prepared by caller / helper
- Output: comparison flags in `AF`
- Confidence: medium

```asm
0x0035C8  call 0x0023AD
0x0035CC  jr z, 0x0035E4
0x0035CE  push bc
0x0035CF  push af
0x0035D0  pop bc
0x0035D1  ld a, b
0x0035D2  and e
0x0035D3  ld a, c
0x0035D4  jp p, 0x0035DA
0x0035D8  xor 0x80
0x0035DA  bit 2, a
0x0035DC  jr z, 0x0035E0
0x0035DE  xor 0x80
0x0035E0  ld c, a
0x0035E1  push bc
0x0035E2  pop af
0x0035E3  pop bc
0x0035E4  ret
```

### `0x0003E4` -> `usb_BusPowered` -> `0x006EAF`

Category: hardware / USB power-status probe.

Interpretation:

- Reads port `0x0F`, masks bit `7`, and returns `A=1` when the bus-powered bit is set, else `A=0`.
- The adjacent alternate entry at `0x006EB6` masks bit `6`; that matches the neighboring named vector `usb_SelfPowered` at `0x0003E8`.

Register contract:

- Input: none
- Output: `A = 1` if bus-powered, else `0`

```asm
0x006EAF  in0 a, (0x0F)
0x006EB2  and 0x80
0x006EB4  jr 0x006EBB
0x006EB6  in0 a, (0x0F)
0x006EB9  and 0x40
0x006EBB  ld a, 0x01
0x006EBD  ret nz
0x006EBE  xor a
0x006EBF  ret
```

## Overall Characterization

The `0x000200..0x000400` vector bank is not a single-theme OS subsystem. Its hottest entries cluster into three groups:

1. Compiler/runtime scalar helpers:
   - `_scmpzero`
   - `_stoiu`
   - `_setflag`
   - `_seqcase`

2. Compiler/runtime floating-point primitives:
   - `_fadd`
   - `_fcmp`
   - `_fmul`

3. Platform-specific state helpers:
   - `usb_BusPowered`
   - two unnamed `0x0152D8/0x015349` workspace marshallers

The strongest takeaway is that this low-address table behaves like an ABI trampoline bank for the toolchain and OS runtime, not just a collection of user-visible OS services. The top-call density is dominated by tiny compare/flag helpers and compiler float kernels, while the unnamed high-traffic entries look like shared internal state setup routines used by larger descriptor/workspace engines.

# Phase 315 - _fpunpack2 Caller Trace

**Probe:** `TI-84_Plus_CE/probe-phase315-fpunpack2.mjs`  
**ROM:** `TI-84_Plus_CE/ROM.rom`  
**Targets:** `_fpunpack = 0x0034A7`, `_fpunpack2 = 0x0034CC`

## Summary

- A full-ROM scan for ADL `CALL 0x0034CC` (`CD CC 34 00`) found exactly **3** direct callers.
- All 3 direct callers are the binary IEEE-754 helpers:
  - `_fadd` at `0x003569`, call site `0x003572`
  - `_fdiv` at `0x0035E5`, call site `0x0035F4`
  - `_fmul` at `0x00372B`, call site `0x00373D`
- Each of those same parent functions also contains a direct `_fpunpack` call a few bytes earlier:
  - `_fadd`: `_fpunpack` at `0x00356B`
  - `_fdiv`: `_fpunpack` at `0x0035EB`
  - `_fmul`: `_fpunpack` at `0x003736`
- Direct `_fpunpack` callers total **5** across the ROM. The two original-only direct callers are `_ftol` (`0x003682`) and `sqrtf` (`0x003827`).
- The caller pattern is consistent with the ABI recovered in Phase 313/314:
  - lhs packed operand comes in via `A:BC` and is unpacked by `_fpunpack`
  - rhs packed operand comes in via `E:HL` and is unpacked by `_fpunpack2`

## Direct callers of `_fpunpack2`

| `_fpunpack2` call | Parent function | Parent prologue / context | Same-function `_fpunpack`? |
| --- | --- | --- | --- |
| `0x003572` | `_fadd` `0x003569..0x0035C7` | `PUSH HL; PUSH DE; CALL 0x0034A7; RR D; PUSH AF` | Yes, `0x00356B` |
| `0x0035F4` | `_fdiv` `0x0035E5..0x003662` | `PUSH IX; PUSH IY; PUSH HL; PUSH DE; CALL 0x0034A7` | Yes, `0x0035EB` |
| `0x00373D` | `_fmul` `0x00372B..0x0037EA` | `PUSH IX; PUSH HL; PUSH DE; LD IX,0; ADD IX,SP` | Yes, `0x003736` |

## Register setup patterns

### `_fadd` caller at `0x003572`

Before `_fpunpack2`:

```asm
0x00356B  CALL 0x0034A7
0x00356F  RR D
0x003571  PUSH AF
0x003572  CALL 0x0034CC
```

After return:

```asm
0x003576  POP AF
0x003577  RL D
0x003579  RRC D
0x00357B  CP A, E
0x00357C  JR C, 0x003587
```

Interpretation:

- `_fadd` unpacks lhs first through `_fpunpack`.
- It preserves lhs sign/exponent through `RR D` plus `PUSH AF`.
- `_fpunpack2` then unpacks rhs from `E:HL`.
- Immediately after return the function restores lhs state and compares `A` vs `E`, so the next step is exponent ordering/alignment between lhs and rhs.

### `_fdiv` caller at `0x0035F4`

Before `_fpunpack2`:

```asm
0x0035EB  CALL 0x0034A7
0x0035EF  JR Z, 0x003658
0x0035F1  PUSH BC
0x0035F2  LD C, A
0x0035F3  LD A, D
0x0035F4  CALL 0x0034CC
```

After return:

```asm
0x0035F8  PUSH HL
0x0035F9  PUSH AF
0x0035FA  XOR A, D
0x0035FB  LD B, 0x00
0x0035FD  LD D, 0x00
0x0035FF  LD HL, 0x000096
0x003603  ADD HL, BC
0x003604  SBC HL, DE
```

Interpretation:

- `_fdiv` unpacks lhs first, with a zero fast path immediately after.
- It saves lhs mantissa on the stack (`PUSH BC`), copies lhs exponent to `C`, and copies lhs sign to `A`.
- `_fpunpack2` then unpacks rhs from `E:HL`.
- The first post-call actions are `XOR A,D` (sign xor) and exponent seeding from `0x96 + lhsExp - rhsExp`, which matches the previously recovered division algorithm.

### `_fmul` caller at `0x00373D`

Before `_fpunpack2`:

```asm
0x003736  CALL 0x0034A7
0x00373A  PUSH BC
0x00373B  LD C, A
0x00373C  LD A, D
0x00373D  CALL 0x0034CC
```

After return:

```asm
0x003741  PUSH HL
0x003742  XOR A, D
0x003743  LD B, 0x00
0x003745  LD D, 0x00
0x003747  LD HL, 0xFFFF80
0x00374B  ADD HL, BC
0x00374C  ADD HL, DE
```

Interpretation:

- `_fmul` follows the same lhs-first setup as `_fdiv`.
- It saves lhs mantissa to the stack, copies lhs exponent to `C`, and copies lhs sign to `A`.
- `_fpunpack2` then unpacks rhs from `E:HL`.
- The first post-call instructions xor the signs and seed the multiply exponent as `lhsExp + rhsExp - 0x80`, matching the multiply path recovered in Phase 313.

## Cross-check against `_fpunpack`

Direct `_fpunpack` callers found in the ROM:

| `_fpunpack` call | Parent function | Also calls `_fpunpack2`? |
| --- | --- | --- |
| `0x00356B` | `_fadd` | Yes |
| `0x0035EB` | `_fdiv` | Yes |
| `0x003682` | `_ftol` | No |
| `0x003736` | `_fmul` | Yes |
| `0x003827` | `sqrtf` | No |

This is the strongest static evidence that `_fpunpack2` is not a generic alternate unpack routine used arbitrarily throughout the library. It is the rhs-side unpacker for functions that consume two packed float operands in different register layouts inside the same helper:

- lhs path: `_fpunpack` from `A:BC`
- rhs path: `_fpunpack2` from `E:HL`

By contrast, unary and conversion routines such as `_ftol` and `sqrtf` only need the lhs/A:BC path, so they call `_fpunpack` only.

## Probe output

Command run:

```bash
node TI-84_Plus_CE/probe-phase315-fpunpack2.mjs
```

Captured summary output:

```text
Phase 315 - _fpunpack2 caller trace
Direct CALL 0x0034CC count: 3
Direct CALL 0x0034A7 count: 5

CALL SITE 0x003572 -> 0x0034CC  parent=_fadd 0x003569..0x0035C7
  Same function also calls _fpunpack: yes
  _fpunpack sites: 0x00356B
  Register/setup pattern before call: CALL 0x0034A7 ; RR D ; PUSH AF
  Immediate use after return: POP AF ; RL D ; RRC D ; CP A, E ; JR C, 0x003587

CALL SITE 0x0035F4 -> 0x0034CC  parent=_fdiv 0x0035E5..0x003662
  Same function also calls _fpunpack: yes
  _fpunpack sites: 0x0035EB
  Register/setup pattern before call: CALL 0x0034A7 ; JR Z, 0x003658 ; PUSH BC ; LD C, A ; LD A, D
  Immediate use after return: PUSH HL ; PUSH AF ; XOR A, D ; LD B, 0x00 ; LD D, 0x00

CALL SITE 0x00373D -> 0x0034CC  parent=_fmul 0x00372B..0x0037EA
  Same function also calls _fpunpack: yes
  _fpunpack sites: 0x003736
  Register/setup pattern before call: CALL 0x0034A7 ; PUSH BC ; LD C, A ; LD A, D
  Immediate use after return: PUSH HL ; XOR A, D ; LD B, 0x00 ; LD D, 0x00 ; LD HL, 0xFFFF80

Original-only _fpunpack direct callers (no _fpunpack2 in same function):
  0x003682  _ftol
  0x003827  sqrtf
```

## Bottom line

`_fpunpack2` at `0x0034CC` has exactly three direct callers in the ROM, and all three are the binary arithmetic helpers `_fadd`, `_fdiv`, and `_fmul`. Every one of those helpers also calls `_fpunpack` earlier in the same parent function, which cleanly matches the two-operand ABI already inferred in earlier phases: `_fpunpack` handles the lhs packed in `A:BC`, while `_fpunpack2` handles the rhs packed in `E:HL`.

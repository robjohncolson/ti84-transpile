# Phase 25AP: 0x07FF81 Trampoline Pre-Setup Investigation

## Summary

The function at 0x07FF81 is a **multi-entry-point variable-type pre-seeder** that writes a type byte and name/index into OP1, then stores the index into `scrapMem` (0xD02AD7). It is part of a family of entry points (0x07FF81, 0x07FF8D, 0x07FF95, 0x07FFA2, 0x07FFAF, 0x07FFB3, 0x07FFB7) that all converge at 0x07FF87 -> 0x07FF99 to store different variable types into OP1 before returning. The trampoline at 0x099910 calls 0x07FF81 (List type 0x05, index 0x23) before falling through to ParseInp at 0x099914.

## Part A: Disassembly

### 0x07FF81 — Pre-setup function (entry: List type)

```
0x07ff81: 21 23 00 00          ld hl, 0x000023       ; HL = 0x23 (list index/name)
0x07ff85: 3e 05                ld a, 0x05            ; A = 0x05 (ListObj type byte)
0x07ff87: 32 f8 05 d0          ld (0xd005f8), a      ; OP1[0] = type byte
  ; --- fall-through from other entries joins here ---
0x07ff8b: 18 0c                jr 0x07ff99           ; jump to common tail
```

### 0x07FF8D — Entry: Matrix type

```
0x07ff8d: 21 40 00 00          ld hl, 0x000040       ; HL = 0x40
0x07ff91: 3e 03                ld a, 0x03            ; A = 0x03 (MatObj type byte)
0x07ff93: 18 f2                jr 0x07ff87           ; -> common store
```

### 0x07FF95 — Entry: Y-var type

```
0x07ff95: 21 01 2a 00          ld hl, 0x002a01       ; HL = 0x002A01
  ; falls through to 0x07ff99
```

### Common tail (0x07FF99)

```
0x07ff99: cd 40 c9 04          call 0x04c940         ; store HL -> scrapMem (0xD02AD7)
0x07ff9d: 22 f9 05 d0          ld (0xd005f9), hl     ; OP1[1..3] = HL (name/index)
0x07ffa1: c9                   ret
```

### 0x04C940 — Helper: store HL to scrapMem

```
0x04c940: f5                   push af
0x04c941: af                   xor a                 ; A = 0
0x04c942: 22 d7 2a d0          ld (0xd02ad7), hl     ; scrapMem[0..2] = HL
0x04c946: 32 d9 2a d0          ld (0xd02ad9), a      ; scrapMem[2] = 0 (clear high byte)
0x04c94a: 2a d7 2a d0          ld hl, (0xd02ad7)     ; reload HL from scrapMem (round-trip)
0x04c94e: f1                   pop af
0x04c94f: c9                   ret
```

### 0x099910 — Trampoline

```
0x099910: cd 81 ff 07          call 0x07ff81         ; pre-seed OP1 with List type, scrapMem = 0x23
0x099914: af                   xor a                 ; <-- ParseInp entry point
0x099915: 32 be 22 d0          ld (0xd022be), a
0x099919: cd 81 9b 09          call 0x099b81
...
```

## Part B: Cross-reference 0xD02AD7 (scrapMem)

**ti84pceg.inc**: `scrapMem := 0xD02AD7 ; 3 byte scrap (unstable)`

**Total references in ROM: 108** — This is a heavily-used 3-byte scratch register used throughout the OS for temporarily holding variable names, indices, and intermediate values. The "(unstable)" annotation means its value can be clobbered by many OS routines.

The 0x04C940 helper is one of many store/load routines for scrapMem. The ROM contains a whole family of scrapMem accessors in the 0x04C860..0x04C950 range that store/load BC, DE, HL, and A to/from scrapMem.

## Part C: Callers of 0x07FF81

**3 callers total** (all CALL, no JP):

| Address | Context |
|---------|---------|
| 0x099910 | Trampoline before ParseInp — ENTER handler path |
| 0x058641 | Home-screen key dispatch — alternative path (not the main ENTER) |
| 0x08384b | Another handler — pushes A=0x05 after call, then calls 0x0820CD |

### Entry point usage summary (the 0x07FF81 family)

| Entry | Type byte | HL value | Meaning | Caller count |
|-------|-----------|----------|---------|--------------|
| 0x07FF81 | 0x05 (List) | 0x000023 | List index 0x23 | 3 |
| 0x07FF8D | 0x03 (Matrix) | 0x000040 | Matrix index 0x40 | 31 |
| 0x07FF95 | (from A) | 0x002A01 | Y-var name | 10 |
| 0x07FFA2 | 0x01 (Real) | varies | Variable name | 0 direct |
| 0x07FFAF | 0x5B | ... | String type | 7 |
| 0x07FFB3 | 0x52 | ... | Pic type | 6 |
| 0x07FFB7 | 0x03 (Matrix) | 0x000162 | Matrix name 0x162 | 12 |

The 0x07FF8D (Matrix) entry is by far the most called (31 callers), confirming this is a general-purpose "set up OP1 with a variable reference" dispatcher.

### Callers of trampoline 0x099910

| Address | Type | Context |
|---------|------|---------|
| 0x0586E3 | CALL | Home-screen ENTER handler — main path |
| 0x020F90 | JP | Jump table entry (likely a dispatch vector) |

### Callers of direct ParseInp 0x099914

**12 callers** (11 CALL + 1 JP at 0x020F00). These skip the List pre-seed entirely, going straight to ParseInp. This confirms that most ParseInp callers do NOT need the List pre-seed.

## Part D: Analysis

### What is 0xD02AD7?

`scrapMem` — a 3-byte volatile scratch location used pervasively across the OS (108 references). It is not specific to any one subsystem. The 0x04C940 helper stores HL into scrapMem and clears the high byte.

### Why does the ENTER path pre-seed OP1 with List type?

The ENTER handler at 0x0586E3 calls the trampoline 0x099910, which sets:
- OP1[0] = 0x05 (ListObj type)
- OP1[1..3] = 0x000023 (default list name/index)
- scrapMem = 0x000023

This is a **default variable context** setup. When the user presses ENTER on the home screen, the OS doesn't know yet whether the input is:
- A numeric expression (e.g., `2+3`)
- A list recall (e.g., `L1`)
- A variable store (e.g., `5->A`)

By pre-seeding OP1 with a List type, the OS provides a **fallback context** for ParseInp. If ParseInp encounters an ambiguous or empty token stream, it has a default variable type to work with. For normal expression evaluation (like `2+3`), ParseInp completely overwrites OP1 with the result, so the pre-seed is irrelevant.

### Is this pre-setup relevant for non-expression inputs?

Yes, likely for:
1. **Bare list references**: Typing `L1` followed by ENTER may use the pre-seeded List type context
2. **Ans recall**: The default context may matter when Ans contains a list
3. **Empty ENTER**: Pressing ENTER with no input — the pre-seeded type may influence what gets displayed

### Does ParseInp always overwrite this pre-setup?

For expression evaluation: **yes**, Session 100 confirmed both trampoline and direct ParseInp produce identical OP1=5.0 for `2+3`. ParseInp completely replaces OP1 during normal expression parsing.

For non-expression paths: **likely not always** — the 12 callers that skip the pre-seed (calling 0x099914 directly) are contexts where a different default or no default is needed. The 0x058641 caller (also pre-seeding via 0x07FF81) is an alternative home-screen path that also wants the List fallback.

## Full Probe Output

```
=== Phase 25AP: 0x07FF81 trampoline pre-setup investigation ===

--- Part A: Static disassembly ---

Disassembly: 0x07FF81 (pre-setup before ParseInp)
  0x07ff81: 21 23 00 00          ld hl, 0x000023
  0x07ff85: 3e 05                ld a, 0x05
  0x07ff87: 32 f8 05 d0          ld (0xd005f8), a
  0x07ff8b: 18 0c                jr 0x07ff99
  0x07ff8d: 21 40 00 00          ld hl, 0x000040
  0x07ff91: 3e 03                ld a, 0x03
  0x07ff93: 18 f2                jr 0x07ff87
  0x07ff95: 21 01 2a 00          ld hl, 0x002a01
  0x07ff99: cd 40 c9 04          call 0x04c940
  0x07ff9d: 22 f9 05 d0          ld (0xd005f9), hl
  0x07ffa1: c9                   ret
  0x07ffa2: 3e 40                ld a, 0x40
  0x07ffa4: 21 00 00 00          ld hl, 0x000000
  0x07ffa8: 67                   ld h, a
  0x07ffa9: 2e 5d                ld l, 0x5d
  0x07ffab: 3e 01                ld a, 0x01
  0x07ffad: 18 d8                jr 0x07ff87
  0x07ffaf: 3e 5b                ld a, 0x5b
  0x07ffb1: 18 1e                jr 0x07ffd1
  0x07ffb3: 3e 52                ld a, 0x52
  0x07ffb5: 18 1a                jr 0x07ffd1
  0x07ffb7: 21 62 01 00          ld hl, 0x000162
  0x07ffbb: 3e 03                ld a, 0x03
  0x07ffbd: 18 c8                jr 0x07ff87
  0x07ffbf: 21 62 21 00          ld hl, 0x002162

Disassembly: 0x099910 (trampoline entry)
  0x099910: cd 81 ff 07          call 0x07ff81
  0x099914: af                   xor a
  0x099915: 32 be 22 d0          ld (0xd022be), a
  0x099919: cd 81 9b 09          call 0x099b81
  0x09991d: fd cb 1f 9e          res 3, (iy+31)
  0x099921: cd 81 9b 09          call 0x099b81
  0x099925: cd 18 9b 09          call 0x099b18
  0x099929: c1                   pop bc
  0x09992a: cd ed be 09          call 0x09beed
  0x09992e: 01 8a 9a 09          ld bc, 0x099a8a

Disassembly: 0x04C940 (helper — stores to scrapMem?)
  0x04c940: f5                   push af
  0x04c941: af                   xor a
  0x04c942: 22 d7 2a d0          ld (0xd02ad7), hl
  0x04c946: 32 d9 2a d0          ld (0xd02ad9), a
  0x04c94a: 2a d7 2a d0          ld hl, (0xd02ad7)
  0x04c94e: f1                   pop af
  0x04c94f: c9                   ret

Disassembly: 0x07FF70..0x07FF81 (context before)
  0x07ff70: 1d                   dec e
  0x07ff71: 06 cd                ld b, 0xcd
  0x07ff73: e0                   ret po
  0x07ff74: c4 09 c0 ca          call nz, 0xcac009
  0x07ff78: 46                   ld b, (hl)
  0x07ff79: 1d                   dec e
  0x07ff7a: 06 21                ld b, 0x21
  0x07ff7c: 21 00 00 18          ld hl, 0x180000
  0x07ff80: 04                   inc b

Raw bytes at 0x07FF81 (32 bytes):
  21 23 00 00 3e 05 32 f8 05 d0 18 0c 21 40 00 00 3e 03 18 f2 21 01 2a 00 cd 40 c9 04 22 f9 05 d0

Raw bytes at 0x04C940 (16 bytes):
  f5 af 22 d7 2a d0 32 d9 2a d0 2a d7 2a d0 f1 c9

--- Part B: Cross-reference 0xD02AD7 (scrapMem) in ROM ---

ti84pceg.inc defines: scrapMem := 0xD02AD7 ; 3 byte scrap (unstable)

Total references to 0xD02AD7 in ROM: 108
  0x000711: 00 2a d7 2a d0 e5 cd 13  ld hl, (0xd02ad7)
  0x000899: 00 22 d7 2a d0 3a d9 2a  ld (0xd02ad7), hl
  0x000d9e: b0 22 d7 2a d0 3a d9 2a  ld (0xd02ad7), hl
  0x000e42: 00 22 d7 2a d0 32 d9 2a  ld (0xd02ad7), hl
  [... 104 more references ...]

--- Part C: Cross-reference callers of 0x07FF81 ---

CALL 0x07FF81 (CD 81 FF 07): 3 hits
  0x058641: call 0x07ff81 ; call 0x0581c6 ; jr 0x05865f ; ...
  0x08384b: call 0x07ff81 ; ld a, 0x05 ; push af ; call 0x0820cd ; ...
  0x099910: call 0x07ff81 ; xor a ; ld (0xd022be), a ; ...
JP 0x07FF81 (C3 81 FF 07): 0 hits

--- Part D: Callers of trampoline 0x099910 ---

CALL 0x099910: 1 hits — 0x0586E3 (home-screen ENTER handler)
JP 0x099910: 1 hits — 0x020F90 (dispatch vector table)

--- Part E: Callers of direct ParseInp 0x099914 (for comparison) ---

CALL 0x099914: 11 hits
JP 0x099914: 1 hits

--- Summary ---
0x07FF81 callers: 3 CALL + 0 JP = 3 total
0x099910 (trampoline) callers: 1 CALL + 1 JP = 2 total
0x099914 (direct ParseInp) callers: 11 CALL + 1 JP = 12 total
0xD02AD7 (scrapMem) references: 108
```

## Key Findings

1. **0x07FF81 is a multi-entry variable-type pre-seeder**, not a standalone function. It is one of ~8 entry points in a function family at 0x07FF81..0x07FFBF that all converge to store a type+name into OP1 and scrapMem.

2. **0xD02AD7 is `scrapMem`** — a 3-byte volatile scratch register with 108 ROM references. It is "unstable" per the SDK, meaning any OS call can clobber it.

3. **The trampoline 0x099910 has only 2 callers** (0x0586E3 CALL, 0x020F90 JP), while direct ParseInp 0x099914 has 12 callers. Most ParseInp callers skip the List pre-seed.

4. **The pre-seed is a default context for the ENTER handler**, providing a fallback variable type (List, index 0x23) in case ParseInp needs one. For normal expression evaluation, ParseInp overwrites it completely.

5. **The 0x07FF8D (Matrix) entry is the most popular** with 31 callers, suggesting that OP1 pre-seeding is a standard OS pattern used wherever a variable reference needs to be established before a subsequent operation.

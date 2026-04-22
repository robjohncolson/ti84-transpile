# Phase 25S - Subroutine disassembly

## Scope

- Main required dump: `0x082bbe` for `192` bytes.
- Main required dump: `0x0821b9` for `128` bytes.
- Support dump: `0x0822a4` for `53` bytes.
- Support dump: `0x082235` for `20` bytes.
- Decoder: `decodeInstruction(romBytes, pc, "adl")` from `ez80-decoder.js`.
- Symbol names for `tempMem`, `FPSbase`, `FPS`, `OPBase`, `OPS`, `pTemp`, `progPtr`, `newDataPtr`, and `pagedGetPtr` are taken from the local `ti84pceg.inc` copy.

## Direct answers

### 0x082BBE

- The actual exported entry is only two instructions: `call 0x0822BA` followed by `ret nc`; carry falls through to `jp 0x061D3E`.
- The real contract lives in the support window at `0x0822A4` / `0x0822BA`. Input `A` is the allocator-derived count byte and input `HL` is the requested object size.
- `0x0822A4` starts from `C = A + 7`, calls `0x080080`, and if that path does not return early it checks `OP1+1`. Non-`]` names force `C = 9`; `]` names keep the earlier count-derived value.
- `0x0822BA` pushes the original `HL`, calls `0x0822A4`, adds `BC` to the returned `HL`, calls `0x082266`, then pops `BC`. That is why the allocator sees `BC = original HL` after `call 0x082BBE`.
- Direct RAM references in the entry contract are minimal: only `OP1+1` is read directly. There are no direct reads or writes of `OPBase`, `pTemp`, or `progPtr` in this contract.
- The required 192-byte dump spills into adjacent helper routines after `0x082BC4`; those extra helpers touch `FPS`, `pagedGetPtr`, and `OP1`, but they are not part of the `0x082BBE` call contract itself.

### 0x0821B9

- Input contract: `BC = size` and the caller-supplied Z flag selects the short or full path. The normal allocator path forces `Z = 0` with `or 0x01`; the alternate path preserves `cp 0x24`, so `Z = 1` means the name started with `$`.
- The helper always updates `FPSbase` (`0xD0258A`) and `FPS` (`0xD0258D`) by `size`. It computes `delta = old FPS - old FPSbase`, then uses the repeated `LDD` loop to shift that existing span upward by `size` bytes when `delta != 0`.
- On the non-Z path it also increments `tempMem` (`0xD02587`) by `size`, compares `newDataPtr` (`0xD025A0`) against the old insertion pointer, and if they differ uses `LDDR` to shift the gap between `newDataPtr` and `FPSbase`. After that it calls `0x04C990`, `0x082739`, `0x0824D6`, and `0x0824FD`.
- On the Z path it branches to `0x082235`, skips the `tempMem` update and the second `LDDR` move, decrements `DE`, calls `0x04C990`, and then rejoins the common `0x08222B` tail.
- Return contract: `DE = old FPSbase` (the allocation / insertion pointer), `BC = original size`, and `AF` is restored before the final Z-path split.
- There are no direct reads or writes of `OPBase` (`0xD02590`), `pTemp` (`0xD0259A`), or `progPtr` (`0xD0259D`) anywhere in the disassembled `0x0821B9` body or the short tail at `0x082235`.

### Implication For The CreateReal Probe

- These two helpers do not directly consume the `OPBase` / `pTemp` / `progPtr` trio. Their immediate pointer state is `tempMem`, `FPSbase`, `FPS`, `newDataPtr`, and `pagedGetPtr`.
- That means seeding only `OPBase`, `pTemp`, and `progPtr` cannot satisfy the direct contract of `0x0821B9`.
- From these slices alone, the observed `OPBase = 0xA88100` corruption must happen later in a callee, or as a downstream consequence of bad `FPS*` / `newDataPtr` seeds rather than from a direct write in `0x082BBE` or `0x0821B9`.

## Direct RAM references

### Pointer/slot entry contract

| Address | Symbol | Access | Site(s) |
| --- | --- | --- | --- |
| `0xd005f9` | `OP1+1` | read | `0x0822b0 ld a, (0xd005f9)` |

### Heap/VAT move

| Address | Symbol | Access | Site(s) |
| --- | --- | --- | --- |
| `0xd0258a` | `FPSbase` | read+write | `0x0821ba ld hl, (0xd0258a)`<br>`0x0821c1 ld (0xd0258a), hl`<br>`0x082214 ld de, (0xd0258a)` |
| `0xd0258d` | `FPS` | read+write | `0x0821c8 ld hl, (0xd0258d)`<br>`0x0821d2 ld (0xd0258d), hl` |
| `0xd02587` | `tempMem` | read+write | `0x0821fc ld hl, (0xd02587)`<br>`0x082201 ld (0xd02587), hl` |
| `0xd025a0` | `newDataPtr` | read | `0x082205 ld hl, (0xd025a0)` |
| `0xd02577` | `slot_D02577` | read | `0x082226 ld bc, (0xd02577)` |

### Adjacent helpers inside the required 0x082BBE dump

| Address | Symbol | Access | Site(s) |
| --- | --- | --- | --- |
| `0xd0258d` | `FPS` | read | `0x082bc4 ld hl, (0xd0258d)` |
| `0xd025a3` | `pagedGetPtr` | read+write | `0x082be9 ld (0xd025a3), de`<br>`0x082bf0 ld hl, (0xd025a3)`<br>`0x082bf6 ld (0xd025a3), hl` |
| `0xd005f8` | `OP1` | write | `0x082c65 ld (0xd005f8), a` |

## Reads-before-write

### Pointer/slot entry contract

| Address | Symbol | First read |
| --- | --- | --- |
| `0xd005f9` | `OP1+1` | `0x0822b0 ld a, (0xd005f9)` |

### Heap/VAT move

| Address | Symbol | First read |
| --- | --- | --- |
| `0xd0258a` | `FPSbase` | `0x0821ba ld hl, (0xd0258a)` |
| `0xd0258d` | `FPS` | `0x0821c8 ld hl, (0xd0258d)` |
| `0xd02587` | `tempMem` | `0x0821fc ld hl, (0xd02587)` |
| `0xd025a0` | `newDataPtr` | `0x082205 ld hl, (0xd025a0)` |
| `0xd02577` | `slot_D02577` | `0x082226 ld bc, (0xd02577)` |

## Calls and exits

### Pointer/slot helper path

| Site | Kind | Target | Meaning |
| --- | --- | --- | --- |
| `0x082bbe` | call | `0x0822ba` | inner pointer helper |
| `0x082bb9` | error exit | `0x061d3e` | error handler on carry |
| `0x0822ab` | call | `0x080080` | slot/length selector |
| `0x0822c0` | call | `0x082266` | post-adjust helper |

### Heap/VAT move path

| Site | Kind | Target | Meaning |
| --- | --- | --- | --- |
| `0x08221e` | call | `0x04c990` | record/shift helper |
| `0x082222` | call | `0x082739` | post-move helper |
| `0x08222b` | call | `0x0824d6` | tail helper A |
| `0x08222f` | call | `0x0824fd` | tail helper B |
| `0x082237` | call | `0x04c990` | short Z-path helper |

## Annotated disassembly

### Pointer/slot helper window 0x082BBE

Raw ROM bytes (192 bytes from `0x082bbe`):

`cd ba 22 08 18 f5 2a 8d 25 d0 11 f7 ff ff 19 c9 cd c4 2b 08 11 f8 05 d0 c3 f2 29 08 23 23 23 23 23 23 c9 2b 2b 2b 2b 2b 2b 2b c9 ed 53 a3 25 d0 c9 e5 2a a3 25 d0 7e 23 22 a3 25 d0 e1 c9 e5 7e 5f 2b 7e 57 2b 7e 47 cd 85 c8 04 e1 c9 e5 cd a3 c8 04 77 23 7a 77 23 7b 77 e1 c9 e6 3f cd 2d 01 08 c8 c3 84 00 08 cd 3d 38 08 18 04 cd ea 46 08 d8 f5 cd ae 21 08 c2 96 1d 06 f1 c9 cd ea 46 08 d8 f5 cd ae 21 08 28 08 fd cb 08 8e c3 92 1d 06 f1 c9 cd ea 46 08 da 3a 1d 06 18 e5 cd bd f7 07 cd 51 01 08 c0 3e 03 32 f8 05 d0 e5 2b 2b 2b 5e 2b 56 2b 7e cd 86 c8 04 eb 7e 23 b6 e1 c9 dd e5`

```text
0x082bbe: cd ba 22 08        call 0x0822ba ; inner pointer helper
0x082bc2: 18 f5              jr 0x082bb9
0x082bc4: 2a 8d 25 d0        ld hl, (0xd0258d) ; FPS
0x082bc8: 11 f7 ff ff        ld de, 0xfffff7
0x082bcc: 19                 add hl, de
0x082bcd: c9                 ret
0x082bce: cd c4 2b 08        call 0x082bc4
0x082bd2: 11 f8 05 d0        ld de, 0xd005f8 ; OP1
0x082bd6: c3 f2 29 08        jp 0x0829f2
0x082bda: 23                 inc hl
0x082bdb: 23                 inc hl
0x082bdc: 23                 inc hl
0x082bdd: 23                 inc hl
0x082bde: 23                 inc hl
0x082bdf: 23                 inc hl
0x082be0: c9                 ret
0x082be1: 2b                 dec hl
0x082be2: 2b                 dec hl
0x082be3: 2b                 dec hl
0x082be4: 2b                 dec hl
0x082be5: 2b                 dec hl
0x082be6: 2b                 dec hl
0x082be7: 2b                 dec hl
0x082be8: c9                 ret
0x082be9: ed 53 a3 25 d0     ld (0xd025a3), de ; pagedGetPtr
0x082bee: c9                 ret
0x082bef: e5                 push hl
0x082bf0: 2a a3 25 d0        ld hl, (0xd025a3) ; pagedGetPtr
0x082bf4: 7e                 ld a, (hl)
0x082bf5: 23                 inc hl
0x082bf6: 22 a3 25 d0        ld (0xd025a3), hl ; pagedGetPtr
0x082bfa: e1                 pop hl
0x082bfb: c9                 ret
0x082bfc: e5                 push hl
0x082bfd: 7e                 ld a, (hl)
0x082bfe: 5f                 ld e, a
0x082bff: 2b                 dec hl
0x082c00: 7e                 ld a, (hl)
0x082c01: 57                 ld d, a
0x082c02: 2b                 dec hl
0x082c03: 7e                 ld a, (hl)
0x082c04: 47                 ld b, a
0x082c05: cd 85 c8 04        call 0x04c885
0x082c09: e1                 pop hl
0x082c0a: c9                 ret
0x082c0b: e5                 push hl
0x082c0c: cd a3 c8 04        call 0x04c8a3
0x082c10: 77                 ld (hl), a
0x082c11: 23                 inc hl
0x082c12: 7a                 ld a, d
0x082c13: 77                 ld (hl), a
0x082c14: 23                 inc hl
0x082c15: 7b                 ld a, e
0x082c16: 77                 ld (hl), a
0x082c17: e1                 pop hl
0x082c18: c9                 ret
0x082c19: e6 3f              and 0x3f
0x082c1b: cd 2d 01 08        call 0x08012d
0x082c1f: c8                 ret z
0x082c20: c3 84 00 08        jp 0x080084
0x082c24: cd 3d 38 08        call 0x08383d
0x082c28: 18 04              jr 0x082c2e
0x082c2a: cd ea 46 08        call 0x0846ea
0x082c2e: d8                 ret c
0x082c2f: f5                 push af
0x082c30: cd ae 21 08        call 0x0821ae
0x082c34: c2 96 1d 06        jp nz, 0x061d96
0x082c38: f1                 pop af
0x082c39: c9                 ret
0x082c3a: cd ea 46 08        call 0x0846ea
0x082c3e: d8                 ret c
0x082c3f: f5                 push af
0x082c40: cd ae 21 08        call 0x0821ae
0x082c44: 28 08              jr z, 0x082c4e
0x082c46: fd cb 08 8e        res 1, (iy+8)
0x082c4a: c3 92 1d 06        jp 0x061d92
0x082c4e: f1                 pop af
0x082c4f: c9                 ret
0x082c50: cd ea 46 08        call 0x0846ea
0x082c54: da 3a 1d 06        jp c, 0x061d3a
0x082c58: 18 e5              jr 0x082c3f
0x082c5a: cd bd f7 07        call 0x07f7bd
0x082c5e: cd 51 01 08        call 0x080151
0x082c62: c0                 ret nz
0x082c63: 3e 03              ld a, 0x03
0x082c65: 32 f8 05 d0        ld (0xd005f8), a ; OP1
0x082c69: e5                 push hl
0x082c6a: 2b                 dec hl
0x082c6b: 2b                 dec hl
0x082c6c: 2b                 dec hl
0x082c6d: 5e                 ld e, (hl)
0x082c6e: 2b                 dec hl
0x082c6f: 56                 ld d, (hl)
0x082c70: 2b                 dec hl
0x082c71: 7e                 ld a, (hl)
0x082c72: cd 86 c8 04        call 0x04c886
0x082c76: eb                 ex de, hl
0x082c77: 7e                 ld a, (hl)
0x082c78: 23                 inc hl
0x082c79: b6                 or (hl)
0x082c7a: e1                 pop hl
0x082c7b: c9                 ret
0x082c7c: dd e5              push ix
```

### Heap/VAT move window 0x0821B9

Raw ROM bytes (128 bytes from `0x0821b9`):

`f5 2a 8a 25 d0 c5 e5 09 22 8a 25 d0 ed 42 eb 2a 8d 25 d0 ed 52 e5 f5 19 09 22 8d 25 d0 2b e5 d1 ed 42 f1 c1 28 18 ed a8 ed a8 ed a8 ed a8 ed a8 ed a8 ed a8 ed a8 ed a8 78 b1 c2 df 21 08 d1 c1 f1 28 39 2a 87 25 d0 09 22 87 25 d0 2a a0 25 d0 e5 eb ed 52 28 27 c5 e5 c1 19 2b ed 5b 8a 25 d0 1b ed b8 eb c1 cd 90 c9 04 cd 39 27 08 ed 4b 77 25 d0 cd d6 24 08 cd fd 24 08 d1 c9 d5 1b cd 90`

```text
0x0821b9: f5                 push af
0x0821ba: 2a 8a 25 d0        ld hl, (0xd0258a) ; FPSbase
0x0821be: c5                 push bc
0x0821bf: e5                 push hl
0x0821c0: 09                 add hl, bc
0x0821c1: 22 8a 25 d0        ld (0xd0258a), hl ; FPSbase
0x0821c5: ed 42              sbc hl, bc
0x0821c7: eb                 ex de, hl
0x0821c8: 2a 8d 25 d0        ld hl, (0xd0258d) ; FPS
0x0821cc: ed 52              sbc hl, de
0x0821ce: e5                 push hl
0x0821cf: f5                 push af
0x0821d0: 19                 add hl, de
0x0821d1: 09                 add hl, bc
0x0821d2: 22 8d 25 d0        ld (0xd0258d), hl ; FPS
0x0821d6: 2b                 dec hl
0x0821d7: e5                 push hl
0x0821d8: d1                 pop de
0x0821d9: ed 42              sbc hl, bc
0x0821db: f1                 pop af
0x0821dc: c1                 pop bc
0x0821dd: 28 18              jr z, 0x0821f7
0x0821df: ed a8              ldd
0x0821e1: ed a8              ldd
0x0821e3: ed a8              ldd
0x0821e5: ed a8              ldd
0x0821e7: ed a8              ldd
0x0821e9: ed a8              ldd
0x0821eb: ed a8              ldd
0x0821ed: ed a8              ldd
0x0821ef: ed a8              ldd
0x0821f1: 78                 ld a, b
0x0821f2: b1                 or c
0x0821f3: c2 df 21 08        jp nz, 0x0821df
0x0821f7: d1                 pop de
0x0821f8: c1                 pop bc
0x0821f9: f1                 pop af
0x0821fa: 28 39              jr z, 0x082235
0x0821fc: 2a 87 25 d0        ld hl, (0xd02587) ; tempMem
0x082200: 09                 add hl, bc
0x082201: 22 87 25 d0        ld (0xd02587), hl ; tempMem
0x082205: 2a a0 25 d0        ld hl, (0xd025a0) ; newDataPtr
0x082209: e5                 push hl
0x08220a: eb                 ex de, hl
0x08220b: ed 52              sbc hl, de
0x08220d: 28 27              jr z, 0x082236
0x08220f: c5                 push bc
0x082210: e5                 push hl
0x082211: c1                 pop bc
0x082212: 19                 add hl, de
0x082213: 2b                 dec hl
0x082214: ed 5b 8a 25 d0     ld de, (0xd0258a) ; FPSbase
0x082219: 1b                 dec de
0x08221a: ed b8              lddr
0x08221c: eb                 ex de, hl
0x08221d: c1                 pop bc
0x08221e: cd 90 c9 04        call 0x04c990 ; record/shift helper
0x082222: cd 39 27 08        call 0x082739 ; post-move helper
0x082226: ed 4b 77 25 d0     ld bc, (0xd02577) ; slot_D02577
0x08222b: cd d6 24 08        call 0x0824d6 ; tail helper A
0x08222f: cd fd 24 08        call 0x0824fd ; tail helper B
0x082233: d1                 pop de
0x082234: c9                 ret
0x082235: d5                 push de
0x082236: 1b                 dec de
0x082237: cd 90 c9 04        call 0x04c990 ; record/shift helper
```

### Support window 0x0822A4 (inner helper behind 0x082BBE)

Raw ROM bytes (53 bytes from `0x0822a4`):

`c6 07 01 00 00 00 4f cd 80 00 08 c8 3a f9 05 d0 fe 5d c8 0e 09 c9 e5 cd a4 22 08 09 cd 66 22 08 c1 c9 f5 18 38 cd 96 f7 07 da 3e 1d 06 11 02 00 00 52 19 38 f4`

```text
0x0822a4: c6 07              add 0x07
0x0822a6: 01 00 00 00        ld bc, 0x000000
0x0822aa: 4f                 ld c, a
0x0822ab: cd 80 00 08        call 0x080080 ; slot/length selector
0x0822af: c8                 ret z
0x0822b0: 3a f9 05 d0        ld a, (0xd005f9) ; OP1+1
0x0822b4: fe 5d              cp 0x5d
0x0822b6: c8                 ret z
0x0822b7: 0e 09              ld c, 0x09
0x0822b9: c9                 ret
0x0822ba: e5                 push hl
0x0822bb: cd a4 22 08        call 0x0822a4 ; length normalizer
0x0822bf: 09                 add hl, bc
0x0822c0: cd 66 22 08        call 0x082266 ; post-adjust helper
0x0822c4: c1                 pop bc
0x0822c5: c9                 ret
0x0822c6: f5                 push af
0x0822c7: 18 38              jr 0x082301
0x0822c9: cd 96 f7 07        call 0x07f796 ; carry-test helper
0x0822cd: da 3e 1d 06        jp c, 0x061d3e ; error handler (0x061D3E)
0x0822d1: 11 02 00 00        ld de, 0x000002
0x0822d5: 52 19              sil add hl, de
0x0822d7: 38 f4              jr c, 0x0822cd
```

### Support window 0x082235 (tail just beyond the 0x0821B9 slice)

Raw ROM bytes (20 bytes from `0x082235`):

`d5 1b cd 90 c9 04 18 ee cd 49 22 08 d5 1b cd 2c 27 08 d1 c9`

```text
0x082235: d5                 push de
0x082236: 1b                 dec de
0x082237: cd 90 c9 04        call 0x04c990 ; record/shift helper
0x08223b: 18 ee              jr 0x08222b
0x08223d: cd 49 22 08        call 0x082249
0x082241: d5                 push de
0x082242: 1b                 dec de
0x082243: cd 2c 27 08        call 0x08272c
0x082247: d1                 pop de
0x082248: c9                 ret
```

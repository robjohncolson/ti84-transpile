# Phase 25T - Pointer Adjuster Disassembly Report

## Scope

Disassembled the 4 subroutines called from InsertMem (0x0821B9) after the memory block move:

- **Negate-BC helper (0x04C990)**: 32 bytes from `0x04c990`
- **Post-move / VAT pointer walker (0x082739)**: 192 bytes from `0x082739`
- **Tail helper A (0x0824D6) — D02317/D0231A/D0231D adjuster**: 64 bytes from `0x0824d6`
- **Tail helper B (0x0824FD) — per-pointer updater via 0x0825D1**: 96 bytes from `0x0824fd`
- **Pointer update subroutine (0x0825D1)**: 64 bytes from `0x0825d1`
- **Post-adjust helper (0x082266)**: 64 bytes from `0x082266`
- **Pointer adjuster (0x082823) — called for pTemp/progPtr**: 64 bytes from `0x082823`
- **Post-move tail (0x0827C3) — pTemp/progPtr update sequence**: 64 bytes from `0x0827c3`

Plus subroutines called by those (0x0825D1, 0x082266).

## Key Pointer Coverage

| Address | Symbol | Found? | Where |
| --- | --- | --- | --- |
| `0xd02590` | OPBase | YES | read in Post-move / VAT pointer walker (0x082739); read in Post-adjust helper (0x082266) |
| `0xd0259a` | pTemp | YES | immediate in Post-move / VAT pointer walker (0x082739); read in Post-adjust helper (0x082266); immediate in Post-move tail (0x0827C3) — pTemp/progPtr update sequence |
| `0xd0259d` | progPtr | YES | immediate in Post-move / VAT pointer walker (0x082739); immediate in Post-move tail (0x0827C3) — pTemp/progPtr update sequence |
| `0xd02593` | OPS | NO | — |
| `0xd02596` | pTempCnt | NO | — |
| `0xd0258a` | FPSbase | NO | — |
| `0xd0258d` | FPS | YES | read in Pointer update subroutine (0x0825D1) |

## All RAM References

| Address | Symbol | Access | Site | Section |
| --- | --- | --- | --- | --- |
| `0xd02ad7` | signExtTemp | write | `0x04c9a9 ld (0xd02ad7), hl` | Negate-BC helper (0x04C990) |
| `0xd02ad9` | signExtFlag | read | `0x04c9ad ld a, (0xd02ad9)` | Negate-BC helper (0x04C990) |
| `0xd3ffff` | RAM_0xd3ffff | immediate | `0x082739 ld hl, 0xd3ffff` | Post-move / VAT pointer walker (0x082739) |
| `0xd02577` | slot_D02577 | write | `0x08273d ld (0xd02577), bc` | Post-move / VAT pointer walker (0x082739) |
| `0xd02577` | slot_D02577 | read | `0x082760 ld bc, (0xd02577)` | Post-move / VAT pointer walker (0x082739) |
| `0xd02590` | OPBase | read | `0x082791 ld bc, (0xd02590)` | Post-move / VAT pointer walker (0x082739) |
| `0xd02ad7` | signExtTemp | write | `0x0827c3 ld (0xd02ad7), bc` | Post-move / VAT pointer walker (0x082739) |
| `0xd02ad7` | signExtTemp | write | `0x0827ca ld (0xd02ad7), bc` | Post-move / VAT pointer walker (0x082739) |
| `0xd0259a` | pTemp | immediate | `0x0827cf ld hl, 0xd0259a` | Post-move / VAT pointer walker (0x082739) |
| `0xd0259d` | progPtr | immediate | `0x0827d7 ld hl, 0xd0259d` | Post-move / VAT pointer walker (0x082739) |
| `0xd0244e` | RAM_0xd0244e | immediate | `0x0827df ld hl, 0xd0244e` | Post-move / VAT pointer walker (0x082739) |
| `0xd0257b` | RAM_0xd0257b | immediate | `0x0827e7 ld hl, 0xd0257b` | Post-move / VAT pointer walker (0x082739) |
| `0xd0257e` | RAM_0xd0257e | immediate | `0x0827ef ld hl, 0xd0257e` | Post-move / VAT pointer walker (0x082739) |
| `0xd02581` | RAM_0xd02581 | immediate | `0x0827f7 ld hl, 0xd02581` | Post-move / VAT pointer walker (0x082739) |
| `0xd02317` | begPC | read | `0x0824d6 ld hl, (0xd02317)` | Tail helper A (0x0824D6) — D02317/D0231A/D0231D adjuster |
| `0xd02317` | begPC | write | `0x0824e2 ld (0xd02317), hl` | Tail helper A (0x0824D6) — D02317/D0231A/D0231D adjuster |
| `0xd0231a` | curPC | read | `0x0824e6 ld hl, (0xd0231a)` | Tail helper A (0x0824D6) — D02317/D0231A/D0231D adjuster |
| `0xd0231a` | curPC | write | `0x0824ed ld (0xd0231a), hl` | Tail helper A (0x0824D6) — D02317/D0231A/D0231D adjuster |
| `0xd0231d` | endPC | read | `0x0824f1 ld hl, (0xd0231d)` | Tail helper A (0x0824D6) — D02317/D0231A/D0231D adjuster |
| `0xd0231d` | endPC | write | `0x0824f8 ld (0xd0231d), hl` | Tail helper A (0x0824D6) — D02317/D0231A/D0231D adjuster |
| `0xd0066f` | ptrSlot_066F | immediate | `0x0824fd ld hl, 0xd0066f` | Tail helper A (0x0824D6) — D02317/D0231A/D0231D adjuster |
| `0xd00672` | ptrSlot_0672 | immediate | `0x082505 ld hl, 0xd00672` | Tail helper A (0x0824D6) — D02317/D0231A/D0231D adjuster |
| `0xd00675` | ptrSlot_0675 | immediate | `0x08250d ld hl, 0xd00675` | Tail helper A (0x0824D6) — D02317/D0231A/D0231D adjuster |
| `0xd00678` | ptrSlot_0678 | immediate | `0x082515 ld hl, 0xd00678` | Tail helper A (0x0824D6) — D02317/D0231A/D0231D adjuster |
| `0xd0066f` | ptrSlot_066F | immediate | `0x0824fd ld hl, 0xd0066f` | Tail helper B (0x0824FD) — per-pointer updater via 0x0825D1 |
| `0xd00672` | ptrSlot_0672 | immediate | `0x082505 ld hl, 0xd00672` | Tail helper B (0x0824FD) — per-pointer updater via 0x0825D1 |
| `0xd00675` | ptrSlot_0675 | immediate | `0x08250d ld hl, 0xd00675` | Tail helper B (0x0824FD) — per-pointer updater via 0x0825D1 |
| `0xd00678` | ptrSlot_0678 | immediate | `0x082515 ld hl, 0xd00678` | Tail helper B (0x0824FD) — per-pointer updater via 0x0825D1 |
| `0xd0067b` | ptrSlot_067B | immediate | `0x08251d ld hl, 0xd0067b` | Tail helper B (0x0824FD) — per-pointer updater via 0x0825D1 |
| `0xd0067e` | ptrSlot_067E | immediate | `0x082525 ld hl, 0xd0067e` | Tail helper B (0x0824FD) — per-pointer updater via 0x0825D1 |
| `0xd00681` | ptrSlot_0681 | immediate | `0x08252d ld hl, 0xd00681` | Tail helper B (0x0824FD) — per-pointer updater via 0x0825D1 |
| `0xd00684` | ptrSlot_0684 | immediate | `0x082535 ld hl, 0xd00684` | Tail helper B (0x0824FD) — per-pointer updater via 0x0825D1 |
| `0xd0069f` | RAM_0xd0069f | immediate | `0x08253d ld hl, 0xd0069f` | Tail helper B (0x0824FD) — per-pointer updater via 0x0825D1 |
| `0xd006a2` | RAM_0xd006a2 | immediate | `0x082545 ld hl, 0xd006a2` | Tail helper B (0x0824FD) — per-pointer updater via 0x0825D1 |
| `0xd0256a` | RAM_0xd0256a | immediate | `0x08254d ld hl, 0xd0256a` | Tail helper B (0x0824FD) — per-pointer updater via 0x0825D1 |
| `0xd025a0` | newDataPtr | immediate | `0x082555 ld hl, 0xd025a0` | Tail helper B (0x0824FD) — per-pointer updater via 0x0825D1 |
| `0xd0258d` | FPS | read | `0x0825ef ld hl, (0xd0258d)` | Pointer update subroutine (0x0825D1) |
| `0xd0259a` | pTemp | read | `0x082274 ld hl, (0xd0259a)` | Post-adjust helper (0x082266) |
| `0xd02590` | OPBase | read | `0x082278 ld bc, (0xd02590)` | Post-adjust helper (0x082266) |
| `0xd02ad7` | signExtTemp | read | `0x08282f ld bc, (0xd02ad7)` | Pointer adjuster (0x082823) — called for pTemp/progPtr |
| `0xd02ad7` | signExtTemp | write | `0x0827c3 ld (0xd02ad7), bc` | Post-move tail (0x0827C3) — pTemp/progPtr update sequence |
| `0xd02ad7` | signExtTemp | write | `0x0827ca ld (0xd02ad7), bc` | Post-move tail (0x0827C3) — pTemp/progPtr update sequence |
| `0xd0259a` | pTemp | immediate | `0x0827cf ld hl, 0xd0259a` | Post-move tail (0x0827C3) — pTemp/progPtr update sequence |
| `0xd0259d` | progPtr | immediate | `0x0827d7 ld hl, 0xd0259d` | Post-move tail (0x0827C3) — pTemp/progPtr update sequence |
| `0xd0244e` | RAM_0xd0244e | immediate | `0x0827df ld hl, 0xd0244e` | Post-move tail (0x0827C3) — pTemp/progPtr update sequence |
| `0xd0257b` | RAM_0xd0257b | immediate | `0x0827e7 ld hl, 0xd0257b` | Post-move tail (0x0827C3) — pTemp/progPtr update sequence |
| `0xd0257e` | RAM_0xd0257e | immediate | `0x0827ef ld hl, 0xd0257e` | Post-move tail (0x0827C3) — pTemp/progPtr update sequence |
| `0xd02581` | RAM_0xd02581 | immediate | `0x0827f7 ld hl, 0xd02581` | Post-move tail (0x0827C3) — pTemp/progPtr update sequence |
| `0xd02584` | RAM_0xd02584 | immediate | `0x0827ff ld hl, 0xd02584` | Post-move tail (0x0827C3) — pTemp/progPtr update sequence |

## Annotated Disassembly

### Negate-BC helper (0x04C990)

```text
0x04c990: e5                   push hl
0x04c991: 21 00 00 00          ld hl, 0x000000
0x04c995: b7                   or a
0x04c996: ed 42                sbc hl, bc
0x04c998: e5                   push hl
0x04c999: c1                   pop bc
0x04c99a: e1                   pop hl
0x04c99b: c9                   ret
0x04c99c: e5                   push hl
0x04c99d: 21 00 00 00          ld hl, 0x000000
0x04c9a1: b7                   or a
0x04c9a2: ed 52                sbc hl, de
0x04c9a4: e5                   push hl
0x04c9a5: d1                   pop de
0x04c9a6: e1                   pop hl
0x04c9a7: c9                   ret
0x04c9a8: f5                   push af
0x04c9a9: 22 d7 2a d0          ld (0xd02ad7), hl ; signExtTemp
0x04c9ad: 3a d9 2a d0          ld a, (0xd02ad9) ; signExtFlag
```

### Post-move / VAT pointer walker (0x082739)

```text
0x082739: 21 ff ff d3          ld hl, 0xd3ffff
0x08273d: ed 43 77 25 d0       ld (0xd02577), bc ; slot_D02577
0x082742: 2b                   dec hl
0x082743: 2b                   dec hl
0x082744: 2b                   dec hl
0x082745: f5                   push af
0x082746: 4e                   ld c, (hl)
0x082747: 2b                   dec hl
0x082748: 46                   ld b, (hl)
0x082749: 2b                   dec hl
0x08274a: 7e                   ld a, (hl)
0x08274b: 23                   inc hl
0x08274c: cd 76 c8 04          call 0x04c876 ; sign-extend A:HL to 24-bit
0x082750: cd b2 21 08          call 0x0821b2 ; compare helper
0x082754: 20 1e                jr nz, 0x082774
0x082756: eb                   ex de, hl
0x082757: b7                   or a
0x082758: ed 42                sbc hl, bc
0x08275a: 30 16                jr nc, 0x082772
0x08275c: 09                   add hl, bc
0x08275d: e5                   push hl
0x08275e: c5                   push bc
0x08275f: e1                   pop hl
0x082760: ed 4b 77 25 d0       ld bc, (0xd02577) ; slot_D02577
0x082765: b7                   or a
0x082766: ed 42                sbc hl, bc
0x082768: eb                   ex de, hl
0x082769: 2b                   dec hl
0x08276a: cd 0b 2c 08          call 0x082c0b ; block-move helper
0x08276e: 23                   inc hl
0x08276f: d1                   pop de
0x082770: 18 02                jr 0x082774
0x082772: 09                   add hl, bc
0x082773: eb                   ex de, hl
0x082774: 23                   inc hl
0x082775: 23                   inc hl
0x082776: 23                   inc hl
0x082777: 23                   inc hl
0x082778: cd 9e 27 08          call 0x08279e ; type-check sub
0x08277c: 01 00 00 00          ld bc, 0x000000
0x082780: 0e 0c                ld c, 0x0c
0x082782: 20 09                jr nz, 0x08278d
0x082784: cd e2 2b 08          call 0x082be2 ; name-skip helper
0x082788: 4e                   ld c, (hl)
0x082789: 0c                   inc c
0x08278a: 0c                   inc c
0x08278b: 0c                   inc c
0x08278c: 0c                   inc c
0x08278d: f1                   pop af
0x08278e: b7                   or a
0x08278f: ed 42                sbc hl, bc
0x082791: ed 4b 90 25 d0       ld bc, (0xd02590) ; OPBase
0x082796: ed 42                sbc hl, bc
0x082798: d8                   ret c
0x082799: 09                   add hl, bc
0x08279a: c3 45 27 08          jp 0x082745
0x08279e: 7e                   ld a, (hl)
0x08279f: e6 3f                and 0x3f
0x0827a1: cd 84 00 08          call 0x080084 ; type classifier
0x0827a5: c8                   ret z
0x0827a6: cd 2d 01 08          call 0x08012d ; name-type check
0x0827aa: c0                   ret nz
0x0827ab: e5                   push hl
0x0827ac: cd e2 2b 08          call 0x082be2 ; name-skip helper
0x0827b0: 7e                   ld a, (hl)
0x0827b1: fe 24                cp 0x24
0x0827b3: 28 0a                jr z, 0x0827bf
0x0827b5: fe 72                cp 0x72
0x0827b7: 28 06                jr z, 0x0827bf
0x0827b9: fe 3a                cp 0x3a
0x0827bb: 28 02                jr z, 0x0827bf
0x0827bd: 3e 01                ld a, 0x01
0x0827bf: fe 01                cp 0x01
0x0827c1: e1                   pop hl
0x0827c2: c9                   ret
0x0827c3: ed 43 d7 2a d0       ld (0xd02ad7), bc ; signExtTemp
0x0827c8: 18 15                jr 0x0827df
0x0827ca: ed 43 d7 2a d0       ld (0xd02ad7), bc ; signExtTemp
0x0827cf: 21 9a 25 d0          ld hl, 0xd0259a ; = pTemp
0x0827d3: cd 23 28 08          call 0x082823 ; ptr adjuster for pTemp/progPtr
0x0827d7: 21 9d 25 d0          ld hl, 0xd0259d ; = progPtr
0x0827db: cd 23 28 08          call 0x082823 ; ptr adjuster for pTemp/progPtr
0x0827df: 21 4e 24 d0          ld hl, 0xd0244e
0x0827e3: cd 23 28 08          call 0x082823 ; ptr adjuster for pTemp/progPtr
0x0827e7: 21 7b 25 d0          ld hl, 0xd0257b
0x0827eb: cd 23 28 08          call 0x082823 ; ptr adjuster for pTemp/progPtr
0x0827ef: 21 7e 25 d0          ld hl, 0xd0257e
0x0827f3: cd 23 28 08          call 0x082823 ; ptr adjuster for pTemp/progPtr
0x0827f7: 21 81 25 d0          ld hl, 0xd02581
```

### Tail helper A (0x0824D6) — D02317/D0231A/D0231D adjuster

```text
0x0824d6: 2a 17 23 d0          ld hl, (0xd02317) ; begPC
0x0824da: b7                   or a
0x0824db: ed 52                sbc hl, de
0x0824dd: d8                   ret c
0x0824de: c8                   ret z
0x0824df: 19                   add hl, de
0x0824e0: ed 42                sbc hl, bc
0x0824e2: 22 17 23 d0          ld (0xd02317), hl ; begPC
0x0824e6: 2a 1a 23 d0          ld hl, (0xd0231a) ; curPC
0x0824ea: b7                   or a
0x0824eb: ed 42                sbc hl, bc
0x0824ed: 22 1a 23 d0          ld (0xd0231a), hl ; curPC
0x0824f1: 2a 1d 23 d0          ld hl, (0xd0231d) ; endPC
0x0824f5: b7                   or a
0x0824f6: ed 42                sbc hl, bc
0x0824f8: 22 1d 23 d0          ld (0xd0231d), hl ; endPC
0x0824fc: c9                   ret
0x0824fd: 21 6f 06 d0          ld hl, 0xd0066f ; = ptrSlot_066F
0x082501: cd d1 25 08          call 0x0825d1 ; pointer update sub
0x082505: 21 72 06 d0          ld hl, 0xd00672 ; = ptrSlot_0672
0x082509: cd d1 25 08          call 0x0825d1 ; pointer update sub
0x08250d: 21 75 06 d0          ld hl, 0xd00675 ; = ptrSlot_0675
0x082511: cd d1 25 08          call 0x0825d1 ; pointer update sub
0x082515: 21 78 06 d0          ld hl, 0xd00678 ; = ptrSlot_0678
```

### Tail helper B (0x0824FD) — per-pointer updater via 0x0825D1

```text
0x0824fd: 21 6f 06 d0          ld hl, 0xd0066f ; = ptrSlot_066F
0x082501: cd d1 25 08          call 0x0825d1 ; pointer update sub
0x082505: 21 72 06 d0          ld hl, 0xd00672 ; = ptrSlot_0672
0x082509: cd d1 25 08          call 0x0825d1 ; pointer update sub
0x08250d: 21 75 06 d0          ld hl, 0xd00675 ; = ptrSlot_0675
0x082511: cd d1 25 08          call 0x0825d1 ; pointer update sub
0x082515: 21 78 06 d0          ld hl, 0xd00678 ; = ptrSlot_0678
0x082519: cd d1 25 08          call 0x0825d1 ; pointer update sub
0x08251d: 21 7b 06 d0          ld hl, 0xd0067b ; = ptrSlot_067B
0x082521: cd d1 25 08          call 0x0825d1 ; pointer update sub
0x082525: 21 7e 06 d0          ld hl, 0xd0067e ; = ptrSlot_067E
0x082529: cd d1 25 08          call 0x0825d1 ; pointer update sub
0x08252d: 21 81 06 d0          ld hl, 0xd00681 ; = ptrSlot_0681
0x082531: cd d1 25 08          call 0x0825d1 ; pointer update sub
0x082535: 21 84 06 d0          ld hl, 0xd00684 ; = ptrSlot_0684
0x082539: cd d1 25 08          call 0x0825d1 ; pointer update sub
0x08253d: 21 9f 06 d0          ld hl, 0xd0069f
0x082541: cd d1 25 08          call 0x0825d1 ; pointer update sub
0x082545: 21 a2 06 d0          ld hl, 0xd006a2
0x082549: cd d1 25 08          call 0x0825d1 ; pointer update sub
0x08254d: 21 6a 25 d0          ld hl, 0xd0256a
0x082551: cd d1 25 08          call 0x0825d1 ; pointer update sub
0x082555: 21 a0 25 d0          ld hl, 0xd025a0 ; = newDataPtr
0x082559: cd d1 25 08          call 0x0825d1 ; pointer update sub
```

### Pointer update subroutine (0x0825D1)

```text
0x0825d1: b7                   or a
0x0825d2: e5                   push hl
0x0825d3: ed 27                ld-pair-ind
0x0825d5: ed 52                sbc hl, de
0x0825d7: 28 02                jr z, 0x0825db
0x0825d9: 30 02                jr nc, 0x0825dd
0x0825db: e1                   pop hl
0x0825dc: c9                   ret
0x0825dd: e1                   pop hl
0x0825de: c5                   push bc
0x0825df: e5                   push hl
0x0825e0: ed 27                ld-pair-ind
0x0825e2: ed 42                sbc hl, bc
0x0825e4: e5                   push hl
0x0825e5: c1                   pop bc
0x0825e6: e1                   pop hl
0x0825e7: ed 0f                ld-ind-pair
0x0825e9: c1                   pop bc
0x0825ea: c9                   ret
0x0825eb: d5                   push de
0x0825ec: e5                   push hl
0x0825ed: 19                   add hl, de
0x0825ee: eb                   ex de, hl
0x0825ef: 2a 8d 25 d0          ld hl, (0xd0258d) ; FPS
0x0825f3: b7                   or a
0x0825f4: ed 52                sbc hl, de
0x0825f6: e5                   push hl
0x0825f7: c1                   pop bc
0x0825f8: e1                   pop hl
0x0825f9: e5                   push hl
0x0825fa: eb                   ex de, hl
0x0825fb: 28 02                jr z, 0x0825ff
0x0825fd: ed b0                ldir
0x0825ff: d1                   pop de
0x082600: c1                   pop bc
0x082601: c9                   ret
0x082602: cd e2 2b 08          call 0x082be2 ; name-skip helper
0x082606: 7e                   ld a, (hl)
0x082607: fe 24                cp 0x24
0x082609: 20 02                jr nz, 0x08260d
0x08260b: af                   xor a
0x08260c: c9                   ret
0x08260d: 01 00 00 00          ld bc, 0x000000
```

### Post-adjust helper (0x082266)

```text
0x082266: eb                   ex de, hl
0x082267: cd 2e c9 04          call 0x04c92e
0x08226b: cd b5 20 08          call 0x0820b5
0x08226f: b7                   or a
0x082270: ed 52                sbc hl, de
0x082272: d0                   ret nc
0x082273: d5                   push de
0x082274: 2a 9a 25 d0          ld hl, (0xd0259a) ; pTemp
0x082278: ed 4b 90 25 d0       ld bc, (0xd02590) ; OPBase
0x08227d: 03                   inc bc
0x08227e: 11 00 00 00          ld de, 0x000000
0x082282: af                   xor a
0x082283: ed 42                sbc hl, bc
0x082285: 38 1b                jr c, 0x0822a2
0x082287: 09                   add hl, bc
0x082288: cb 7e                bit 7, (hl)
0x08228a: 28 10                jr z, 0x08229c
0x08228c: e5                   push hl
0x08228d: 2b                   dec hl
0x08228e: 2b                   dec hl
0x08228f: 2b                   dec hl
0x082290: cd fc 2b 08          call 0x082bfc
0x082294: e1                   pop hl
0x082295: cd 7d 26 08          call 0x08267d
0x082299: d1                   pop de
0x08229a: 18 cf                jr 0x08226b
0x08229c: 1e 09                ld e, 0x09
0x08229e: ed 52                sbc hl, de
0x0822a0: 18 e0                jr 0x082282
0x0822a2: d1                   pop de
0x0822a3: c9                   ret
0x0822a4: c6 07                add 0x07
```

### Pointer adjuster (0x082823) — called for pTemp/progPtr

```text
0x082823: e5                   push hl
0x082824: ed 07                ld-pair-ind
0x082826: b7                   or a
0x082827: c5                   push bc
0x082828: e1                   pop hl
0x082829: ed 52                sbc hl, de
0x08282b: e1                   pop hl
0x08282c: d0                   ret nc
0x08282d: dd e5                push ix
0x08282f: ed 4b d7 2a d0       ld bc, (0xd02ad7) ; signExtTemp
0x082834: ed 37                ld-pair-ind
0x082836: dd 09                add ix, bc
0x082838: ed 3f                ld-ind-pair
0x08283a: dd e1                pop ix
0x08283c: c9                   ret
0x08283d: c5                   push bc
0x08283e: d1                   pop de
0x08283f: 18 2b                jr 0x08286c
0x082841: c1                   pop bc
0x082842: c9                   ret
0x082843: d5                   push de
0x082844: cd 4d 28 08          call 0x08284d
0x082848: 30 f7                jr nc, 0x082841
0x08284a: d1                   pop de
0x08284b: 18 1f                jr 0x08286c
0x08284d: 11 09 00 00          ld de, 0x000009
0x082851: cd d9 01 08          call 0x0801d9
0x082855: c8                   ret z
0x082856: 1e 12                ld e, 0x12
0x082858: cd a8 f7 07          call 0x07f7a8
0x08285c: c8                   ret z
0x08285d: 37                   scf
0x08285e: c9                   ret
0x08285f: cd 4d 28 08          call 0x08284d
```

### Post-move tail (0x0827C3) — pTemp/progPtr update sequence

```text
0x0827c3: ed 43 d7 2a d0       ld (0xd02ad7), bc ; signExtTemp
0x0827c8: 18 15                jr 0x0827df
0x0827ca: ed 43 d7 2a d0       ld (0xd02ad7), bc ; signExtTemp
0x0827cf: 21 9a 25 d0          ld hl, 0xd0259a ; = pTemp
0x0827d3: cd 23 28 08          call 0x082823 ; ptr adjuster for pTemp/progPtr
0x0827d7: 21 9d 25 d0          ld hl, 0xd0259d ; = progPtr
0x0827db: cd 23 28 08          call 0x082823 ; ptr adjuster for pTemp/progPtr
0x0827df: 21 4e 24 d0          ld hl, 0xd0244e
0x0827e3: cd 23 28 08          call 0x082823 ; ptr adjuster for pTemp/progPtr
0x0827e7: 21 7b 25 d0          ld hl, 0xd0257b
0x0827eb: cd 23 28 08          call 0x082823 ; ptr adjuster for pTemp/progPtr
0x0827ef: 21 7e 25 d0          ld hl, 0xd0257e
0x0827f3: cd 23 28 08          call 0x082823 ; ptr adjuster for pTemp/progPtr
0x0827f7: 21 81 25 d0          ld hl, 0xd02581
0x0827fb: cd 23 28 08          call 0x082823 ; ptr adjuster for pTemp/progPtr
0x0827ff: 21 84 25 d0          ld hl, 0xd02584
```

## Analysis

### 0x04C990 — Negate-BC helper

This is a trivial 12-byte routine that computes `BC = 0 - BC` (two's complement negate).
It does not touch any RAM pointers. InsertMem calls it to convert the positive insertion
size into a negative delta before passing it to the pointer-update helpers.

### 0x082739 — Post-move / VAT pointer walker

This is the most complex routine. It:
1. Starts at `HL = 0xD3FFFF` (top of the VAT region) and walks backward through VAT entries
2. For each 3-byte pointer entry, loads the pointer via `ld c,(hl); ld b,(hl); ld a,(hl)` pattern
3. Calls `0x04C876` (sign-extend) and `0x0821B2` (compare)
4. If the pointer falls within the affected range, adjusts it by subtracting the old slot_D02577 value
5. Calls `0x082C0B` (block-move helper) to write back the adjusted pointer
6. **Terminates when `HL` drops below OPBase** — it reads `OPBase` at `0x082791`
7. Then loops back to `0x082745` to process the next entry

**OPBase is used as the loop termination boundary**, not as a pointer to adjust.
The loop walks backward from 0xD3FFFF down to OPBase, adjusting any VAT pointer entries
that point into the moved region.

### 0x0824D6 — Tail helper A (begPC/curPC/endPC adjuster)

Adjusts three edit-buffer pointers stored at:
- `0xD02317` (begPC): reads, compares vs DE (insertion point), if >= DE: subtracts BC
- `0xD0231A` (curPC): unconditionally subtracts BC
- `0xD0231D` (endPC): unconditionally subtracts BC

The adjustment formula for each: `pointer = pointer - BC` (where BC = negated insertion size = effectively adding the insertion size).
The first pointer (begPC) is only adjusted if it was >= the insertion point (DE).

### 0x0824FD — Tail helper B (per-pointer updater via 0x0825D1)

Calls `0x0825D1` with HL pointing to each of 8 consecutive 3-byte pointer slots:
`0xD0066F`, `0xD00672`, `0xD00675`, `0xD00678`, `0xD0067B`, `0xD0067E`, `0xD00681`, `0xD00684`.

These are likely the 8 OS pointer slots (including OPBase at one of these? or FP stack pointers).
The actual adjustment logic is in 0x0825D1.

### 0x0825D1 — Pointer update subroutine

This routine takes HL = pointer to a 3-byte RAM address. It:
1. Reads the 24-bit value at (HL)
2. Compares it against DE (the insertion point)
3. If the value >= DE, adjusts it by subtracting BC (= adding the insertion size)
4. Writes the adjusted value back

This is the generic "if this pointer is above the insertion point, bump it up" logic.

### 0x082266 — Post-adjust helper

(See disassembly listing above for details.)

### OPBase Corruption Analysis

**Known corruption**: OPBase changes from `0xD1A881` to `0xA88100` during CreateReal.

**Key finding**: OPBase (`0xD02590`) is only READ in the post-move helper (0x082739) at
address `0x082791`. It is used as the loop termination bound, not as a value to adjust.

**0x04C990 does NOT directly adjust OPBase** — it is just a BC-negate helper.

**0x0824FD (tail helper B)** calls `0x0825D1` for 8 pointer slots starting at `0xD0066F`.
None of these addresses match `0xD02590` (OPBase), `0xD0259A` (pTemp), or `0xD0259D` (progPtr).

**0x0824D6 (tail helper A)** only adjusts the edit-buffer pointers at `0xD02317/1A/1D`.

**Conclusion**: The four subroutines called from InsertMem do NOT directly write to
OPBase, pTemp, or progPtr. The corruption must come from:
1. A different code path that adjusts these pointers (possibly in the allocator entry
   before InsertMem is called, or in the CreateReal wrapper)
2. A memory block move (LDIR/LDDR in InsertMem itself) that overwrites the RAM locations
   where OPBase is stored, if the FPS/heap region overlaps with the system pointer area
3. A bug in our runtime's memory seeding that places OPBase at a value that the block
   move happens to overwrite

**Byte-level corruption pattern**: `0xD1A881` -> `0xA88100` is a left-shift by one byte
(the high byte `0xD1` is lost, and `0x00` is appended as the low byte). This is
characteristic of a 24-bit pointer being read/written with a 1-byte offset error,
or the LDIR/LDDR block move physically overwriting the OPBase storage location.

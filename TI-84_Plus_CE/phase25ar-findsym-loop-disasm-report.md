# Phase 25AR - FindSym Loop Disassembly: Identifying the Loop Exit Condition

## Date

2026-04-24T09:14:14.475Z

## Purpose

After seeding OPBase=0xD3FFFF (which fixed the old VAT walker infinite loop
at 0x082745), the ENTER handler now enters a NEW infinite loop cycling through
11 PCs inside FindSym/ChkFindSym. This probe disassembles the loop region to
identify the exit condition and what RAM must be seeded to break it.

## Disassembly

### ChkFindSym full region (0x08383D-0x0838D0)
Range: `0x08383D` to `0x0838D0`

```text
0x08383D  cd 80 00 08        call 0x080080  ; ChkFindSym entry (jump table 0x02050C)
0x083841  28 0e              jr z, 0x083851  ; BRANCH: z -> 0x083851
0x083843  c3 ea 46 08        jp 0x0846EA
0x083847  3e 17              ld a, 0x17
0x083849  18 06              jr 0x083851
0x08384B  cd 81 ff 07        call 0x07FF81
0x08384F  3e 05              ld a, 0x05
0x083851  f5                 push af
0x083852  cd cd 20 08        call 0x0820CD
0x083856  ed 5b 9a 25 d0     ld de, (0xD0259A)  ; RAM: pTemp (0xD0259A)
0x08385B  2a 9d 25 d0        ld hl, (0xD0259D)  ; RAM: progPtr (0xD0259D)
0x08385F  c1                 pop bc
0x083860  4f                 ld c, a
0x083861  c5                 push bc
0x083862  13                 inc de
0x083863  af                 xor a
0x083864  47                 ld b, a
0x083865  7e                 ld a, (hl)  ; <<< LOOP PC | LOOP PC #1 (loop top)
0x083866  cd e2 2b 08        call 0x082BE2
0x08386A  e6 3f              and 0x3F  ; <<< LOOP PC | LOOP PC #3
0x08386C  ed 52              sbc hl, de
0x08386E  38 58              jr c, 0x0838C8  ; BRANCH: c -> 0x0838C8
0x083870  19                 add hl, de  ; <<< LOOP PC | LOOP PC #4
0x083871  c1                 pop bc
0x083872  c5                 push bc
0x083873  fe 15              cp 0x15
0x083875  20 05              jr nz, 0x08387C  ; BRANCH: nz -> 0x08387C
0x083877  b8                 cp b
0x083878  20 42              jr nz, 0x0838BC  ; BRANCH: nz -> 0x0838BC
0x08387A  18 12              jr 0x08388E
0x08387C  fe 17              cp 0x17  ; <<< LOOP PC | LOOP PC #5
0x08387E  20 05              jr nz, 0x083885  ; BRANCH: nz -> 0x083885
0x083880  b8                 cp b
0x083881  20 39              jr nz, 0x0838BC  ; BRANCH: nz -> 0x0838BC
0x083883  18 09              jr 0x08388E
0x083885  78                 ld a, b  ; <<< LOOP PC | LOOP PC #6
0x083886  fe 15              cp 0x15
0x083888  28 32              jr z, 0x0838BC  ; BRANCH: z -> 0x0838BC
0x08388A  fe 17              cp 0x17  ; <<< LOOP PC | LOOP PC #7
0x08388C  28 2e              jr z, 0x0838BC  ; BRANCH: z -> 0x0838BC
0x08388E  79                 ld a, c  ; <<< LOOP PC | LOOP PC #8
0x08388F  4e                 ld c, (hl)
0x083890  0c                 inc c
0x083891  be                 cp (hl)
0x083892  20 2a              jr nz, 0x0838BE  ; BRANCH: nz -> 0x0838BE
0x083894  47                 ld b, a
0x083895  cd 1f 01 08        call 0x08011F
0x083899  20 01              jr nz, 0x08389C  ; BRANCH: nz -> 0x08389C
0x08389B  05                 dec b
0x08389C  d5                 push de
0x08389D  e5                 push hl
0x08389E  11 f8 05 d0        ld de, 0xD005F8
0x0838A2  2b                 dec hl
0x0838A3  13                 inc de
0x0838A4  1a                 ld a, (de)
0x0838A5  be                 cp (hl)
0x0838A6  20 10              jr nz, 0x0838B8  ; BRANCH: nz -> 0x0838B8
0x0838A8  10 f8              djnz 0x0838A2
0x0838AA  2b                 dec hl
0x0838AB  7e                 ld a, (hl)
0x0838AC  32 01 06 d0        ld (0xD00601), a  ; RAM: 0xD00601 (unknown)
0x0838B0  e1                 pop hl
0x0838B1  d1                 pop de
0x0838B2  af                 xor a
0x0838B3  c1                 pop bc
0x0838B4  c3 3e 47 08        jp 0x08473E
0x0838B8  e1                 pop hl
0x0838B9  d1                 pop de
0x0838BA  18 02              jr 0x0838BE
0x0838BC  4e                 ld c, (hl)
0x0838BD  0c                 inc c
0x0838BE  af                 xor a  ; <<< LOOP PC | LOOP PC #9
0x0838BF  47                 ld b, a
0x0838C0  cd 1c c9 04        call 0x04C91C
0x0838C4  ed 42              sbc hl, bc  ; <<< LOOP PC | LOOP PC #11 (back to top)
0x0838C6  18 9d              jr 0x083865
0x0838C8  d1                 pop de
0x0838C9  c9                 ret
0x0838CA  dd e5              push ix
0x0838CC  dd 21 00 00 00     ld ix, 0x000000
```

### 0x082BE2 node region (0x082BD0-0x082C10)
Range: `0x082BD0` to `0x082C10`

```text
0x082BD0  2b                 dec hl
0x082BD1  08                 ex af, af'
0x082BD2  11 f8 05 d0        ld de, 0xD005F8
0x082BD6  c3 f2 29 08        jp 0x0829F2
0x082BDA  23                 inc hl
0x082BDB  23                 inc hl
0x082BDC  23                 inc hl
0x082BDD  23                 inc hl
0x082BDE  23                 inc hl
0x082BDF  23                 inc hl
0x082BE0  c9                 ret
0x082BE1  2b                 dec hl
0x082BE2  2b                 dec hl  ; <<< LOOP PC | LOOP PC #2
0x082BE3  2b                 dec hl
0x082BE4  2b                 dec hl
0x082BE5  2b                 dec hl
0x082BE6  2b                 dec hl
0x082BE7  2b                 dec hl
0x082BE8  c9                 ret
0x082BE9  ed 53 a3 25 d0     ld (0xD025A3), de  ; RAM: pagedGetPtr (0xD025A3)
0x082BEE  c9                 ret
0x082BEF  e5                 push hl
0x082BF0  2a a3 25 d0        ld hl, (0xD025A3)  ; RAM: pagedGetPtr (0xD025A3)
0x082BF4  7e                 ld a, (hl)
0x082BF5  23                 inc hl
0x082BF6  22 a3 25 d0        ld (0xD025A3), hl  ; RAM: pagedGetPtr (0xD025A3)
0x082BFA  e1                 pop hl
0x082BFB  c9                 ret
0x082BFC  e5                 push hl
0x082BFD  7e                 ld a, (hl)
0x082BFE  5f                 ld e, a
0x082BFF  2b                 dec hl
0x082C00  7e                 ld a, (hl)
0x082C01  57                 ld d, a
0x082C02  2b                 dec hl
0x082C03  7e                 ld a, (hl)
0x082C04  47                 ld b, a
0x082C05  cd 85 c8 04        call 0x04C885
0x082C09  e1                 pop hl
0x082C0A  c9                 ret
0x082C0B  e5                 push hl
0x082C0C  cd a3 c8 04        call 0x04C8A3
```

### 0x04C91C utility region (0x04C910-0x04C930)
Range: `0x04C910` to `0x04C930`

```text
0x04C910  00                 nop
0x04C911  5e                 ld e, (hl)
0x04C912  23                 inc hl
0x04C913  56                 ld d, (hl)
0x04C914  23                 inc hl
0x04C915  c9                 ret
0x04C916  7e                 ld a, (hl)
0x04C917  23                 inc hl
0x04C918  66                 ld h, (hl)
0x04C919  6f                 ld l, a
0x04C91A  18 24              jr 0x04C940
0x04C91C  f5                 push af  ; <<< LOOP PC | LOOP PC #10 (utility call)
0x04C91D  af                 xor a
0x04C91E  ed 43 d7 2a d0     ld (0xD02AD7), bc  ; RAM: scrapMem (0xD02AD7)
0x04C923  32 d9 2a d0        ld (0xD02AD9), a  ; RAM: 0xD02AD9 (unknown)
0x04C927  ed 4b d7 2a d0     ld bc, (0xD02AD7)  ; RAM: scrapMem (0xD02AD7)
0x04C92C  f1                 pop af
0x04C92D  c9                 ret
0x04C92E  f5                 push af
0x04C92F  af                 xor a
```

## Analysis

### Loop PCs

```text
0x083865: ld a, (hl)
0x082BE2: dec hl
0x08386A: and 0x3F
0x083870: add hl, de
0x08387C: cp 0x17
0x083885: ld a, b
0x08388A: cp 0x17
0x08388E: ld a, c
0x0838BE: xor a
0x04C91C: push af
0x0838C4: sbc hl, bc
```

### Conditional Branches

- `0x083841`: `jr z, 0x083851`
- `0x08386E`: `jr c, 0x0838C8`
- `0x083875`: `jr nz, 0x08387C`
- `0x083878`: `jr nz, 0x0838BC`
- `0x08387E`: `jr nz, 0x083885`
- `0x083881`: `jr nz, 0x0838BC`
- `0x083888`: `jr z, 0x0838BC`
- `0x08388C`: `jr z, 0x0838BC`
- `0x083892`: `jr nz, 0x0838BE`
- `0x083899`: `jr nz, 0x08389C`
- `0x0838A6`: `jr nz, 0x0838B8`

### RAM Addresses Accessed

- `0xD00601`: (unknown)
- `0xD0259A`: pTemp
- `0xD0259D`: progPtr
- `0xD025A3`: pagedGetPtr
- `0xD02AD7`: scrapMem
- `0xD02AD9`: (unknown)

## Conclusion

See console output below for full analysis.

## Console Output

```text
=== Phase 25AR: FindSym Loop Disassembly ===

The ENTER handler is stuck in an infinite loop cycling through 11 PCs
inside ChkFindSym (0x08383D). Goal: find the loop exit condition and
identify what RAM must be seeded to break the loop.

Key RAM addresses:
  OPBase   = 0xD02590 (already seeded to 0xD3FFFF)
  pTemp    = 0xD0259A
  progPtr  = 0xD0259D
  symTable = 0xD3FFFF (end of VAT)
  userMem  = 0xD1A881 (start of user memory)

--- ChkFindSym full region (0x08383D-0x0838D0) ---
    Range: 0x08383D to 0x0838D0

0x08383D  cd 80 00 08        call 0x080080  ; ChkFindSym entry (jump table 0x02050C)
0x083841  28 0e              jr z, 0x083851  ; BRANCH: z -> 0x083851
0x083843  c3 ea 46 08        jp 0x0846EA
0x083847  3e 17              ld a, 0x17
0x083849  18 06              jr 0x083851
0x08384B  cd 81 ff 07        call 0x07FF81
0x08384F  3e 05              ld a, 0x05
0x083851  f5                 push af
0x083852  cd cd 20 08        call 0x0820CD
0x083856  ed 5b 9a 25 d0     ld de, (0xD0259A)  ; RAM: pTemp (0xD0259A)
0x08385B  2a 9d 25 d0        ld hl, (0xD0259D)  ; RAM: progPtr (0xD0259D)
0x08385F  c1                 pop bc
0x083860  4f                 ld c, a
0x083861  c5                 push bc
0x083862  13                 inc de
0x083863  af                 xor a
0x083864  47                 ld b, a
0x083865  7e                 ld a, (hl)  ; <<< LOOP PC | LOOP PC #1 (loop top)
0x083866  cd e2 2b 08        call 0x082BE2
0x08386A  e6 3f              and 0x3F  ; <<< LOOP PC | LOOP PC #3
0x08386C  ed 52              sbc hl, de
0x08386E  38 58              jr c, 0x0838C8  ; BRANCH: c -> 0x0838C8
0x083870  19                 add hl, de  ; <<< LOOP PC | LOOP PC #4
0x083871  c1                 pop bc
0x083872  c5                 push bc
0x083873  fe 15              cp 0x15
0x083875  20 05              jr nz, 0x08387C  ; BRANCH: nz -> 0x08387C
0x083877  b8                 cp b
0x083878  20 42              jr nz, 0x0838BC  ; BRANCH: nz -> 0x0838BC
0x08387A  18 12              jr 0x08388E
0x08387C  fe 17              cp 0x17  ; <<< LOOP PC | LOOP PC #5
0x08387E  20 05              jr nz, 0x083885  ; BRANCH: nz -> 0x083885
0x083880  b8                 cp b
0x083881  20 39              jr nz, 0x0838BC  ; BRANCH: nz -> 0x0838BC
0x083883  18 09              jr 0x08388E
0x083885  78                 ld a, b  ; <<< LOOP PC | LOOP PC #6
0x083886  fe 15              cp 0x15
0x083888  28 32              jr z, 0x0838BC  ; BRANCH: z -> 0x0838BC
0x08388A  fe 17              cp 0x17  ; <<< LOOP PC | LOOP PC #7
0x08388C  28 2e              jr z, 0x0838BC  ; BRANCH: z -> 0x0838BC
0x08388E  79                 ld a, c  ; <<< LOOP PC | LOOP PC #8
0x08388F  4e                 ld c, (hl)
0x083890  0c                 inc c
0x083891  be                 cp (hl)
0x083892  20 2a              jr nz, 0x0838BE  ; BRANCH: nz -> 0x0838BE
0x083894  47                 ld b, a
0x083895  cd 1f 01 08        call 0x08011F
0x083899  20 01              jr nz, 0x08389C  ; BRANCH: nz -> 0x08389C
0x08389B  05                 dec b
0x08389C  d5                 push de
0x08389D  e5                 push hl
0x08389E  11 f8 05 d0        ld de, 0xD005F8
0x0838A2  2b                 dec hl
0x0838A3  13                 inc de
0x0838A4  1a                 ld a, (de)
0x0838A5  be                 cp (hl)
0x0838A6  20 10              jr nz, 0x0838B8  ; BRANCH: nz -> 0x0838B8
0x0838A8  10 f8              djnz 0x0838A2
0x0838AA  2b                 dec hl
0x0838AB  7e                 ld a, (hl)
0x0838AC  32 01 06 d0        ld (0xD00601), a  ; RAM: 0xD00601 (unknown)
0x0838B0  e1                 pop hl
0x0838B1  d1                 pop de
0x0838B2  af                 xor a
0x0838B3  c1                 pop bc
0x0838B4  c3 3e 47 08        jp 0x08473E
0x0838B8  e1                 pop hl
0x0838B9  d1                 pop de
0x0838BA  18 02              jr 0x0838BE
0x0838BC  4e                 ld c, (hl)
0x0838BD  0c                 inc c
0x0838BE  af                 xor a  ; <<< LOOP PC | LOOP PC #9
0x0838BF  47                 ld b, a
0x0838C0  cd 1c c9 04        call 0x04C91C
0x0838C4  ed 42              sbc hl, bc  ; <<< LOOP PC | LOOP PC #11 (back to top)
0x0838C6  18 9d              jr 0x083865
0x0838C8  d1                 pop de
0x0838C9  c9                 ret
0x0838CA  dd e5              push ix
0x0838CC  dd 21 00 00 00     ld ix, 0x000000

--- 0x082BE2 node region (0x082BD0-0x082C10) ---
    Range: 0x082BD0 to 0x082C10

0x082BD0  2b                 dec hl
0x082BD1  08                 ex af, af'
0x082BD2  11 f8 05 d0        ld de, 0xD005F8
0x082BD6  c3 f2 29 08        jp 0x0829F2
0x082BDA  23                 inc hl
0x082BDB  23                 inc hl
0x082BDC  23                 inc hl
0x082BDD  23                 inc hl
0x082BDE  23                 inc hl
0x082BDF  23                 inc hl
0x082BE0  c9                 ret
0x082BE1  2b                 dec hl
0x082BE2  2b                 dec hl  ; <<< LOOP PC | LOOP PC #2
0x082BE3  2b                 dec hl
0x082BE4  2b                 dec hl
0x082BE5  2b                 dec hl
0x082BE6  2b                 dec hl
0x082BE7  2b                 dec hl
0x082BE8  c9                 ret
0x082BE9  ed 53 a3 25 d0     ld (0xD025A3), de  ; RAM: pagedGetPtr (0xD025A3)
0x082BEE  c9                 ret
0x082BEF  e5                 push hl
0x082BF0  2a a3 25 d0        ld hl, (0xD025A3)  ; RAM: pagedGetPtr (0xD025A3)
0x082BF4  7e                 ld a, (hl)
0x082BF5  23                 inc hl
0x082BF6  22 a3 25 d0        ld (0xD025A3), hl  ; RAM: pagedGetPtr (0xD025A3)
0x082BFA  e1                 pop hl
0x082BFB  c9                 ret
0x082BFC  e5                 push hl
0x082BFD  7e                 ld a, (hl)
0x082BFE  5f                 ld e, a
0x082BFF  2b                 dec hl
0x082C00  7e                 ld a, (hl)
0x082C01  57                 ld d, a
0x082C02  2b                 dec hl
0x082C03  7e                 ld a, (hl)
0x082C04  47                 ld b, a
0x082C05  cd 85 c8 04        call 0x04C885
0x082C09  e1                 pop hl
0x082C0A  c9                 ret
0x082C0B  e5                 push hl
0x082C0C  cd a3 c8 04        call 0x04C8A3

--- 0x04C91C utility region (0x04C910-0x04C930) ---
    Range: 0x04C910 to 0x04C930

0x04C910  00                 nop
0x04C911  5e                 ld e, (hl)
0x04C912  23                 inc hl
0x04C913  56                 ld d, (hl)
0x04C914  23                 inc hl
0x04C915  c9                 ret
0x04C916  7e                 ld a, (hl)
0x04C917  23                 inc hl
0x04C918  66                 ld h, (hl)
0x04C919  6f                 ld l, a
0x04C91A  18 24              jr 0x04C940
0x04C91C  f5                 push af  ; <<< LOOP PC | LOOP PC #10 (utility call)
0x04C91D  af                 xor a
0x04C91E  ed 43 d7 2a d0     ld (0xD02AD7), bc  ; RAM: scrapMem (0xD02AD7)
0x04C923  32 d9 2a d0        ld (0xD02AD9), a  ; RAM: 0xD02AD9 (unknown)
0x04C927  ed 4b d7 2a d0     ld bc, (0xD02AD7)  ; RAM: scrapMem (0xD02AD7)
0x04C92C  f1                 pop af
0x04C92D  c9                 ret
0x04C92E  f5                 push af
0x04C92F  af                 xor a

=== Analysis ===

--- Conditional branches in ChkFindSym region ---
  0x083841: jr z, 0x083851
  0x08386E: jr c, 0x0838C8
  0x083875: jr nz, 0x08387C [target IN LOOP]
  0x083878: jr nz, 0x0838BC
  0x08387E: jr nz, 0x083885 [target IN LOOP]
  0x083881: jr nz, 0x0838BC
  0x083888: jr z, 0x0838BC
  0x08388C: jr z, 0x0838BC
  0x083892: jr nz, 0x0838BE [target IN LOOP]
  0x083899: jr nz, 0x08389C
  0x0838A6: jr nz, 0x0838B8

--- Memory accesses at loop PCs ---
  0x083865: ld a, (hl)  [mem: none]
  0x08386A: and 0x3F  [mem: none]
  0x083870: add hl, de  [mem: none]
  0x08387C: cp 0x17  [mem: none]
  0x083885: ld a, b  [mem: none]
  0x08388A: cp 0x17  [mem: none]
  0x08388E: ld a, c  [mem: none]
  0x0838BE: xor a  [mem: none]
  0x0838C4: sbc hl, bc  [mem: none]
  0x082BE2: dec hl  [mem: none]
  0x04C91C: push af  [mem: none]

--- Loop flow reconstruction ---

Expected loop cycle:
  0x083865 -> 0x082BE2 -> 0x08386A -> 0x083870 -> 0x08387C ->
  0x083885 -> 0x08388A -> 0x08388E -> 0x0838BE -> 0x04C91C ->
  0x0838C4 -> 0x083865

  0x083865: ld a, (hl)
  0x082BE2: dec hl
  0x08386A: and 0x3F
  0x083870: add hl, de
  0x08387C: cp 0x17
  0x083885: ld a, b
  0x08388A: cp 0x17
  0x08388E: ld a, c
  0x0838BE: xor a
  0x04C91C: push af
  0x0838C4: sbc hl, bc

--- Potential loop exit conditions ---

  EXIT via FALL-THROUGH at 0x083875: jr nz, 0x08387C
    When nz is FALSE, falls through to 0x083877
  EXIT via FALL-THROUGH at 0x08387E: jr nz, 0x083885
    When nz is FALSE, falls through to 0x083880
  EXIT via FALL-THROUGH at 0x083892: jr nz, 0x0838BE
    When nz is FALSE, falls through to 0x083894

--- Comparison/test instructions in loop region ---
  0x08386A: and 0x3F [IN LOOP]
  0x08386C: sbc hl, de
  0x083873: cp 0x15
  0x083877: cp b
  0x08387C: cp 0x17 [IN LOOP]
  0x083880: cp b
  0x083886: cp 0x15
  0x08388A: cp 0x17 [IN LOOP]
  0x083891: cp (hl)
  0x0838A5: cp (hl)
  0x0838C4: sbc hl, bc [IN LOOP]

--- SBC HL, DE pattern (VAT scan check) ---
  0x08386C: sbc hl, de [in ChkFindSym full region (0x08383D-0x0838D0)]
  0x0838C4: sbc hl, bc [in ChkFindSym full region (0x08383D-0x0838D0)]

--- All RAM addresses accessed in disassembled regions ---
  0xD0259A: pTemp — accessed at 0x083856
  0xD0259D: progPtr — accessed at 0x08385B
  0xD00601: (unknown) — accessed at 0x0838AC
  0xD025A3: pagedGetPtr — accessed at 0x082BE9
  0xD02AD7: scrapMem — accessed at 0x04C91E
  0xD02AD9: (unknown) — accessed at 0x04C923

=== CONCLUSION ===

FindSym/ChkFindSym is a VAT (Variable Allocation Table) scanner.
The VAT starts at symTable (0xD3FFFF) and grows downward.

DETAILED LOOP TRACE:

  Setup (before loop):
    0x083856: DE = (pTemp)      [0xD0259A] — low boundary of VAT scan
    0x08385B: HL = (progPtr)    [0xD0259D] — current scan pointer (top of VAT)
    0x083862: DE incremented by 1
    0x083863: A = 0 (xor a)
    0x083864: B = 0

  Loop body:
    0x083865: A = (HL)          — read type byte from current VAT position
    0x083866: CALL 0x082BE2     — dec HL x7 (skip back 7 bytes in VAT)
    0x08386A: AND 0x3F          — mask type to 6 bits
    0x08386C: SBC HL, DE        — check: has HL passed below DE (pTemp+1)?
    0x08386E: JR C, 0x0838C8    — EXIT if carry (HL < DE) → pop de; ret
    0x083870: ADD HL, DE        — restore HL (undo subtraction)
    ... type matching, name comparison ...
    0x0838BE: XOR A; LD B, A    — B = 0
    0x08388F: C = (HL)          — read name length from VAT entry
    0x083890: INC C             — BC = name_length + 1
    0x0838C0: CALL 0x04C91C     — zero-extend BC to 24 bits
    0x0838C4: SBC HL, BC        — skip backward past the name
    0x0838C6: JR 0x083865       — loop back to top

EXIT CONDITION:
  At 0x08386E: JR C, 0x0838C8
  This fires when HL < DE after SBC HL, DE.
  HL = current scan position (walks downward from progPtr)
  DE = pTemp + 1 (the low boundary)

WHY THE LOOP IS INFINITE:
  HL starts at progPtr (0xD0259D). If progPtr is 0 or uninitialized,
  HL starts near address 0. DE = pTemp + 1. If pTemp is also 0,
  DE = 1. HL decrements by ~7 each iteration, quickly wrapping to
  0xFFFFFF, and the SBC will not set carry for a very long time.

  Even if progPtr = symTable = 0xD3FFFF, the scan reads garbage
  from uninitialized VAT memory and HL walks downward reading
  random name lengths, never reaching DE = pTemp + 1.

FIX:
  Seed progPtr (0xD0259D) = pTemp (0xD0259A) = symTable (0xD3FFFF).
  When the VAT is empty, progPtr == pTemp == symTable. Then on the
  very first iteration:
    HL = 0xD3FFFF (progPtr)
    CALL 0x082BE2 decrements HL by 7 → HL = 0xD3FFF8
    DE = 0xD3FFFF + 1 = 0xD40000
    SBC HL, DE → 0xD3FFF8 - 0xD40000 = negative → carry set
    JR C, 0x0838C8 → EXIT (symbol not found)

SEED RECIPE:
  write24(0xD0259A, 0xD3FFFF)   // pTemp = symTable
  write24(0xD0259D, 0xD3FFFF)   // progPtr = symTable
  (OPBase at 0xD02590 is already seeded to 0xD3FFFF)

```

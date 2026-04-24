# Phase 25AY: Disassembly of 0x099211 — ParseInpGraph Wrapper Analysis

Generated: 2026-04-24T19:08:34.999Z

## Parameters
- Start: 0x099211
- Length: 300 bytes
- Mode: ADL
- IY base: 0xD00080

## Disassembly

```
0x099211  FD CB 09 7E               bit 7, (iy+9)  ; IY+0x09 = 0xD00089 (statFlags (0xD00089)) bit 7
0x099215  C4 EC 00 08               call nz, 0x0800EC  ; OS helper
0x099219  FD CB 09 BE               res 7, (iy+9)  ; IY+0x09 = 0xD00089 (statFlags (0xD00089)) bit 7
0x09921D  FD CB 01 9E               res 3, (iy+1)  ; IY+0x01 = 0xD00081 bit 3
0x099221  FD CB 05 7E               bit 7, (iy+5)  ; IY+0x05 = 0xD00085 bit 7
0x099225  C8                        ret z
0x099226  2A 67 25 D0               ld hl, (0xD02567)
0x09922A  ED 5B 6A 25 D0            ld de, (0xD0256A)
0x09922F  1B                        dec de
0x099230  1B                        dec de
0x099231  CD 85 26 08               call 0x082685  ; OS helper
0x099235  FD CB 05 BE               res 7, (iy+5)  ; IY+0x05 = 0xD00085 bit 7
0x099239  C9                        ret
0x09923A  CD C3 72 09               call 0x0972C3  ; SaveEditCursor
0x09923E  CD 95 87 09               call 0x098795  ; EditHelper
0x099242  2A 3A 24 D0               ld hl, (0xD0243A)
0x099246  22 D6 08 D0               ld (0xD008D6), hl
0x09924A  3A 8A 00 D0               ld a, (0xD0008A)
0x09924E  32 8B 00 D0               ld (0xD0008B), a
0x099252  3A F8 05 D0               ld a, (0xD005F8)  ; => OP1 area (offset +0)
0x099256  E6 3F                     and 0x3F
0x099258  CD D9 01 08               call 0x0801D9  ; TypeCheck helper
0x09925C  20 06                     jr nz, 0x099264
0x09925E  CD DA 93 09               call 0x0993DA
0x099262  18 0D                     jr 0x099271
0x099264  CD A8 F7 07               call 0x07F7A8  ; TypeHelper2
0x099268  20 06                     jr nz, 0x099270
0x09926A  CD A4 92 09               call 0x0992A4
0x09926E  18 01                     jr 0x099271
0x099270  37                        scf
0x099271  CD A2 87 09               call 0x0987A2  ; PostDispatch helper
0x099275  D8                        ret c
0x099276  2A D6 08 D0               ld hl, (0xD008D6)
0x09927A  22 3A 24 D0               ld (0xD0243A), hl
0x09927E  C9                        ret
0x09927F  CD 50 2C 08               call 0x082C50  ; OS helper
0x099283  EB                        ex de, hl
0x099284  EB                        ex de, hl
0x099285  CD C3 72 09               call 0x0972C3  ; SaveEditCursor
0x099289  EB                        ex de, hl
0x09928A  FD CB 0C C6               set 0, (iy+12)  ; IY+0x0C = 0xD0008C bit 0
0x09928E  CD C3 92 09               call 0x0992C3
0x099292  CD A2 87 09               call 0x0987A2  ; PostDispatch helper
0x099296  D8                        ret c
0x099297  2A D6 08 D0               ld hl, (0xD008D6)
0x09929B  22 3A 24 D0               ld (0xD0243A), hl
0x09929F  C9                        ret
0x0992A0  3E 05                     ld a, 0x05
0x0992A2  18 E0                     jr 0x099284
0x0992A4  FD CB 1B FE               set 7, (iy+27)  ; IY+0x1B = 0xD0009B bit 7
0x0992A8  3E 2B                     ld a, 0x2B
0x0992AA  CD 84 8B 09               call 0x098B84  ; FormatHelper2
0x0992AE  FD CB 1B BE               res 7, (iy+27)  ; IY+0x1B = 0xD0009B bit 7
0x0992B2  21 0F 25 D0               ld hl, 0xD0250F
0x0992B6  CD 50 18 0B               call 0x0B1850  ; FormatHelper3
0x0992BA  01 10 25 D0               ld bc, 0xD02510
0x0992BE  CD E0 E2 05               call 0x05E2E0  ; QueueHelper2
0x0992C2  C9                        ret
0x0992C3  F5                        push af
0x0992C4  ED 5B 3A 24 D0            ld de, (0xD0243A)
0x0992C9  ED 53 D6 08 D0            ld (0xD008D6), de
0x0992CE  3A 8A 00 D0               ld a, (0xD0008A)
0x0992D2  32 8B 00 D0               ld (0xD0008B), a
0x0992D6  F1                        pop af
0x0992D7  22 87 06 D0               ld (0xD00687), hl
0x0992DB  CD D9 01 08               call 0x0801D9  ; TypeCheck helper
0x0992DF  20 08                     jr nz, 0x0992E9
0x0992E1  CD FB F9 07               call 0x07F9FB  ; QueueHelper3
0x0992E5  C3 DA 93 09               jp 0x0993DA
0x0992E9  CD A8 F7 07               call 0x07F7A8  ; TypeHelper2
0x0992ED  20 0A                     jr nz, 0x0992F9
0x0992EF  CD FB F9 07               call 0x07F9FB  ; QueueHelper3
0x0992F3  CD 07 FA 07               call 0x07FA07  ; QueueHelper4
0x0992F7  18 AB                     jr 0x0992A4
0x0992F9  CD 2D 01 08               call 0x08012D
0x0992FD  20 4B                     jr nz, 0x09934A
0x0992FF  3E 08                     ld a, 0x08
0x099301  CD C0 E2 05               call 0x05E2C0  ; QueueHelper
0x099305  D8                        ret c
0x099306  4E                        ld c, (hl)
0x099307  23                        inc hl
0x099308  46                        ld b, (hl)
0x099309  23                        inc hl
0x09930A  79                        ld a, c
0x09930B  B0                        or b
0x09930C  28 35                     jr z, 0x099343
0x09930E  C5                        push bc
0x09930F  CD FB F9 07               call 0x07F9FB  ; QueueHelper3
0x099313  CD A4 F7 07               call 0x07F7A4  ; TypeHelper
0x099317  20 0B                     jr nz, 0x099324
0x099319  CD 07 FA 07               call 0x07FA07  ; QueueHelper4
0x09931D  E5                        push hl
0x09931E  CD A4 92 09               call 0x0992A4
0x099322  18 05                     jr 0x099329
0x099324  E5                        push hl
0x099325  CD DA 93 09               call 0x0993DA
0x099329  3E 2B                     ld a, 0x2B
0x09932B  CD C0 E2 05               call 0x05E2C0  ; QueueHelper
0x09932F  E1                        pop hl
0x099330  C1                        pop bc
0x099331  D8                        ret c
0x099332  0B                        dec bc
0x099333  79                        ld a, c
0x099334  B0                        or b
0x099335  20 D7                     jr nz, 0x09930E
0x099337  3E 09                     ld a, 0x09
0x099339  E5                        push hl
0x09933A  2A D6 08 D0               ld hl, (0xD008D6)
```

## IY-Relative Flag Operations

| Address | Instruction | Flag |
|---------|-------------|------|
| 0x099211 | `bit 7, (iy+9)` | IY+0x09 = 0xD00089 (statFlags (0xD00089)) bit 7 |
| 0x099219 | `res 7, (iy+9)` | IY+0x09 = 0xD00089 (statFlags (0xD00089)) bit 7 |
| 0x09921D | `res 3, (iy+1)` | IY+0x01 = 0xD00081 bit 3 |
| 0x099221 | `bit 7, (iy+5)` | IY+0x05 = 0xD00085 bit 7 |
| 0x099235 | `res 7, (iy+5)` | IY+0x05 = 0xD00085 bit 7 |
| 0x09928A | `set 0, (iy+12)` | IY+0x0C = 0xD0008C bit 0 |
| 0x0992A4 | `set 7, (iy+27)` | IY+0x1B = 0xD0009B bit 7 |
| 0x0992AE | `res 7, (iy+27)` | IY+0x1B = 0xD0009B bit 7 |

## CALL Targets

| From | Target | Label |
|------|--------|-------|
| 0x099215 | 0x0800EC | OS helper (nz) |
| 0x099231 | 0x082685 | OS helper |
| 0x09923A | 0x0972C3 | SaveEditCursor |
| 0x09923E | 0x098795 | EditHelper |
| 0x099258 | 0x0801D9 | TypeCheck helper |
| 0x09925E | 0x0993DA | unknown |
| 0x099264 | 0x07F7A8 | TypeHelper2 |
| 0x09926A | 0x0992A4 | unknown |
| 0x099271 | 0x0987A2 | PostDispatch helper |
| 0x09927F | 0x082C50 | OS helper |
| 0x099285 | 0x0972C3 | SaveEditCursor |
| 0x09928E | 0x0992C3 | unknown |
| 0x099292 | 0x0987A2 | PostDispatch helper |
| 0x0992AA | 0x098B84 | FormatHelper2 |
| 0x0992B6 | 0x0B1850 | FormatHelper3 |
| 0x0992BE | 0x05E2E0 | QueueHelper2 |
| 0x0992DB | 0x0801D9 | TypeCheck helper |
| 0x0992E1 | 0x07F9FB | QueueHelper3 |
| 0x0992E9 | 0x07F7A8 | TypeHelper2 |
| 0x0992EF | 0x07F9FB | QueueHelper3 |
| 0x0992F3 | 0x07FA07 | QueueHelper4 |
| 0x0992F9 | 0x08012D | unknown |
| 0x099301 | 0x05E2C0 | QueueHelper |
| 0x09930F | 0x07F9FB | QueueHelper3 |
| 0x099313 | 0x07F7A4 | TypeHelper |
| 0x099319 | 0x07FA07 | QueueHelper4 |
| 0x09931E | 0x0992A4 | unknown |
| 0x099325 | 0x0993DA | unknown |
| 0x09932B | 0x05E2C0 | QueueHelper |

## JP/JR Targets

| From | Type | Target | Label |
|------|------|--------|-------|
| 0x0992E5 | JP | 0x0993DA |  |
| 0x09925C | JR (nz) | 0x099264 | |
| 0x099262 | JR | 0x099271 | |
| 0x099268 | JR (nz) | 0x099270 | |
| 0x09926E | JR | 0x099271 | |
| 0x0992A2 | JR | 0x099284 | |
| 0x0992DF | JR (nz) | 0x0992E9 | |
| 0x0992ED | JR (nz) | 0x0992F9 | |
| 0x0992F7 | JR | 0x0992A4 | |
| 0x0992FD | JR (nz) | 0x09934A | |
| 0x09930C | JR (z) | 0x099343 | |
| 0x099317 | JR (nz) | 0x099324 | |
| 0x099322 | JR | 0x099329 | |
| 0x099335 | JR (nz) | 0x09930E | |

## Absolute Flag References

None found.

## OP1 References

- 0x099252: `ld a, (0xD005F8)` => OP1+0

## ParseInpGraph Wrapper Verdict

- CALL ParseInp (0x099914): **NO**
- JP ParseInp (0x099914): **NO**
- Trampoline ref (0x099910): **NO**
- PushErrorHandler: **NO**
- IY ParsFlag-area operations: **0**

### CONCLUSION: NOT a ParseInpGraph wrapper

No ParseInp reference and no ParsFlag-area IY operations found within 300 bytes.

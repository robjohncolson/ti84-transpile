# Phase 25AF - NewContext / NewContext0 Static Disassembly

Generated from raw `ROM.rom` bytes for `probe-phase25af-newcontext-disasm.mjs`.

## Summary

- `0x08C79F` is a thin wrapper: `ld c, a ; sub a ; ld (0xD0058C), a ; ld b, a ; ld a, c ; jp 0x08C7AD`.
- The first `0x80` bytes at `0x08C7AD` are mostly state cleanup and mode compares. The actual `cxCurApp` stores happen later in the same routine at `0x08C8CB` and `0x08C8F7`.
- Raw ROM pattern scan found 30 `LD (0xD007E0), A` byte matches and no `HL` / `ED` pair-store matches to `0xD007E0`.
- The strongest home-screen context-init candidates are the direct `ld a, 0x40 ; call 0x08C79F` sites at `0x0294EB`, `0x0863A5`, and `0x0AE473`.
- No `CALL 0x02016C` or `CALL 0x020170` byte matches were found in ROM.

## Disassembly - NewContext (0x08C79F, first 0x80 bytes)

```text
0x08C79F  4F                     ld c, a
0x08C7A0  97                     sub a
0x08C7A1  32 8C 05 D0            ld (0xD0058C), a
0x08C7A5  47                     ld b, a
0x08C7A6  79                     ld a, c
0x08C7A7  C3 AD C7 08            jp 0x08C7AD
0x08C7AB  3E 40                  ld a, 0x40
0x08C7AD  F5                     push af
0x08C7AE  C5                     push bc
0x08C7AF  21 FF FF FF            ld hl, 0xFFFFFF
0x08C7B3  40 22 B5 26            sis ld (0x0026B5), hl
0x08C7B7  11 00 00 00            ld de, 0x000000
0x08C7BB  CD 8F 5B 05            call 0x055B8F
0x08C7BF  C1                     pop bc
0x08C7C0  F1                     pop af
0x08C7C1  21 00 00 00            ld hl, 0x000000
0x08C7C5  40 22 B5 26            sis ld (0x0026B5), hl
0x08C7C9  FD CB 51 86            res 0, (iy+81)
0x08C7CD  FD CB 27 BE            res 7, (iy+39)
0x08C7D1  FD CB 4B AE            res 5, (iy+75)
0x08C7D5  6F                     ld l, a
0x08C7D6  3E 03                  ld a, 0x03
0x08C7D8  32 AE 26 D0            ld (0xD026AE), a
0x08C7DC  7D                     ld a, l
0x08C7DD  CD 05 2E 0A            call 0x0A2E05
0x08C7E1  2B                     dec hl
0x08C7E2  40 22 AA 26            sis ld (0x0026AA), hl
0x08C7E6  40 22 8A 26            sis ld (0x00268A), hl
0x08C7EA  FD CB 28 BE            res 7, (iy+40)
0x08C7EE  21 E0 07 D0            ld hl, 0xD007E0
0x08C7F2  BE                     cp (hl)
0x08C7F3  20 1A                  jr nz, 0x08C80F
0x08C7F5  FE 44                  cp 0x44
0x08C7F7  20 0F                  jr nz, 0x08C808
0x08C7F9  C5                     push bc
0x08C7FA  CD AC ED 06            call 0x06EDAC
0x08C7FE  FD CB 4B BE            res 7, (iy+75)
0x08C802  CD D0 FC 06            call 0x06FCD0
0x08C806  C1                     pop bc
0x08C807  C9                     ret
0x08C808  FE 40                  cp 0x40
0x08C80A  28 03                  jr z, 0x08C80F
0x08C80C  06 27                  ld b, 0x27
0x08C80E  C9                     ret
0x08C80F  C5                     push bc
0x08C810  F5                     push af
0x08C811  F1                     pop af
0x08C812  FE 3F                  cp 0x3F
0x08C814  20 06                  jr nz, 0x08C81C
0x08C816  3E 40                  ld a, 0x40
0x08C818  F5                     push af
0x08C819  AF                     xor a
0x08C81A  18 11                  jr 0x08C82D
0x08C81C  F5                     push af
0x08C81D  FE BF                  cp 0xBF
```

## Disassembly - NewContext0 (0x08C7AD, first 0x80 bytes)

```text
0x08C7AD  F5                     push af
0x08C7AE  C5                     push bc
0x08C7AF  21 FF FF FF            ld hl, 0xFFFFFF
0x08C7B3  40 22 B5 26            sis ld (0x0026B5), hl
0x08C7B7  11 00 00 00            ld de, 0x000000
0x08C7BB  CD 8F 5B 05            call 0x055B8F
0x08C7BF  C1                     pop bc
0x08C7C0  F1                     pop af
0x08C7C1  21 00 00 00            ld hl, 0x000000
0x08C7C5  40 22 B5 26            sis ld (0x0026B5), hl
0x08C7C9  FD CB 51 86            res 0, (iy+81)
0x08C7CD  FD CB 27 BE            res 7, (iy+39)
0x08C7D1  FD CB 4B AE            res 5, (iy+75)
0x08C7D5  6F                     ld l, a
0x08C7D6  3E 03                  ld a, 0x03
0x08C7D8  32 AE 26 D0            ld (0xD026AE), a
0x08C7DC  7D                     ld a, l
0x08C7DD  CD 05 2E 0A            call 0x0A2E05
0x08C7E1  2B                     dec hl
0x08C7E2  40 22 AA 26            sis ld (0x0026AA), hl
0x08C7E6  40 22 8A 26            sis ld (0x00268A), hl
0x08C7EA  FD CB 28 BE            res 7, (iy+40)
0x08C7EE  21 E0 07 D0            ld hl, 0xD007E0
0x08C7F2  BE                     cp (hl)
0x08C7F3  20 1A                  jr nz, 0x08C80F
0x08C7F5  FE 44                  cp 0x44
0x08C7F7  20 0F                  jr nz, 0x08C808
0x08C7F9  C5                     push bc
0x08C7FA  CD AC ED 06            call 0x06EDAC
0x08C7FE  FD CB 4B BE            res 7, (iy+75)
0x08C802  CD D0 FC 06            call 0x06FCD0
0x08C806  C1                     pop bc
0x08C807  C9                     ret
0x08C808  FE 40                  cp 0x40
0x08C80A  28 03                  jr z, 0x08C80F
0x08C80C  06 27                  ld b, 0x27
0x08C80E  C9                     ret
0x08C80F  C5                     push bc
0x08C810  F5                     push af
0x08C811  F1                     pop af
0x08C812  FE 3F                  cp 0x3F
0x08C814  20 06                  jr nz, 0x08C81C
0x08C816  3E 40                  ld a, 0x40
0x08C818  F5                     push af
0x08C819  AF                     xor a
0x08C81A  18 11                  jr 0x08C82D
0x08C81C  F5                     push af
0x08C81D  FE BF                  cp 0xBF
0x08C81F  38 04                  jr c, 0x08C825
0x08C821  C6 5C                  add 0x5C
0x08C823  18 08                  jr 0x08C82D
0x08C825  D6 40                  sub 0x40
0x08C827  20 04                  jr nz, 0x08C82D
0x08C829  FD CB 0C B6            res 6, (iy+12)
```

## cxCurApp Write Scan

- `ld (0xD007E0), a` (30): `0x02375F`, `0x0302D0`, `0x04ED3A`, `0x04EE9E`, `0x058C61`, `0x05B7E2`, `0x05B800`, `0x0620AE`, `0x0620C0`, `0x073450`, `0x073465`, `0x07347C`, `0x073499`, `0x0734A2`, `0x078458`, `0x078461`, `0x079002`, `0x079196`, `0x0791A1`, `0x079984`, `0x08657A`, `0x08B0F9`, `0x08B123`, `0x08C8CB`, `0x08C8F7`, `0x09C87F`, `0x09E307`, `0x0A5840`, `0x0B6A58`, `0x0B89CF`
- `ld (0xD007E0), hl` (0): none
- `ed ld (0xD007E0), bc` (0): none
- `ed ld (0xD007E0), de` (0): none
- `ed ld (0xD007E0), hl` (0): none
- `ed ld (0xD007E0), sp` (0): none

## Direct Caller Scan

| Target | Count | Caller sites |
| --- | --- | --- |
| `call 0x08C79F` | 11 | `0x0294EB`, `0x058770`, `0x062050`, `0x0863A5`, `0x08C674`, `0x09CCE2`, `0x09CE32`, `0x09CE4C`, `0x0AE445`, `0x0AE473`, `0x0BC3DD` |
| `call 0x08C7AD` | 5 | `0x06C506`, `0x074D76`, `0x08C601`, `0x08C75E`, `0x0A2DBD` |
| `call 0x02016C` | 0 | none |
| `call 0x020170` | 0 | none |

### Direct `CALL 0x08C79F` Sites

| Caller | Immediate A before call | Note |
| --- | --- | --- |
| `0x0294EB` | `0x40` | home-screen candidate |
| `0x058770` | `0x44` | direct preload |
| `0x062050` | `0x46` | direct preload |
| `0x0863A5` | `0x40` | home-screen candidate |
| `0x08C674` | `0x52` | direct preload |
| `0x09CCE2` | `0x52` | direct preload |
| `0x09CE32` | `0x50` | direct preload |
| `0x09CE4C` | `0x3F` | direct preload |
| `0x0AE445` | `0x44` | direct preload |
| `0x0AE473` | `0x40` | home-screen candidate |
| `0x0BC3DD` | `0x48` | direct preload |

### Direct `CALL 0x08C7AD` Sites

| Caller | Immediate A before call | Note |
| --- | --- | --- |
| `0x06C506` | `0x52` | direct preload |
| `0x074D76` | none at `pc-2` | `ld a, 0x44 ; ld b, a ; call 0x08C7AD` |
| `0x08C601` | none at `pc-2` | inherited from surrounding compare path |
| `0x08C75E` | `0x52` | direct preload |
| `0x0A2DBD` | `0x44` | direct preload |


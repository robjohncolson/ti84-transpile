# Phase 25AL — Second-Pass Handler Disassembly + Runtime Trace

Generated: 2026-04-23

## Context Table at 0x0585D3 (21 bytes)

This table is loaded by the home handler via LDIR (0x08C782) into the cx range 0xD007CA-0xD007E1.

| Field | Offset | Width | Value | Annotation |
|-------|--------|-------|-------|------------|
| cxMain | 0 | 3 | 0x0585e9 | second-pass handler |
| cxPPutaway | 3 | 3 | 0x058b19 |  |
| cxPutaway | 6 | 3 | 0x058b7e |  |
| cxRedisp | 9 | 3 | 0x0582bc |  |
| cxErrorEP | 12 | 3 | 0x058ba9 |  |
| cxSizeWind | 15 | 3 | 0x058c01 |  |
| cxPage | 18 | 2 | 0x0000 |  |
| cxCurApp | 20 | 1 | 0x00 |  |

## Disassembly of 0x0585E9 (Second-Pass Handler)

```text
0x0585e9  FD CB 49 B6              res 6, (iy+73)  ; IY+73
0x0585ed  47                       ld b, a
0x0585ee  3E 01                    ld a, 0x01
0x0585f0  FD CB 34 66              bit 4, (iy+52)  ; IY+52
0x0585f4  C4 B3 39 02              call nz, 0x0239b3
0x0585f8  C0                       ret nz
0x0585f9  78                       ld a, b
0x0585fa  FD CB 49 5E              bit 3, (iy+73)  ; IY+73
0x0585fe  C2 9C 2D 09              jp nz, 0x092d9c
0x058602  FE 05                    cp 0x05
0x058604  C2 7A 87 05              jp nz, 0x05877a
0x058608  CD 54 8D 05              call 0x058d54
0x05860c  CD A3 8B 05              call 0x058ba3
0x058610  CD 5C 8B 05              call 0x058b5c
0x058614  CD F9 FB 03              call 0x03fbf9
0x058618  CD 0B 84 05              call 0x05840b
0x05861c  FB                       ei
0x05861d  CD 12 82 05              call 0x058212
0x058621  F5                       push af
0x058622  CD AE 81 05              call 0x0581ae
0x058626  CD 11 92 09              call 0x099211
0x05862a  FB                       ei
0x05862b  CD CB 21 09              call 0x0921cb
0x05862f  F1                       pop af
0x058630  20 38                    jr nz, 0x05866a
0x058632  3A 0B 1D D0              ld a, (0xd01d0b)
0x058636  B7                       or a
0x058637  CA 65 8C 05              jp z, 0x058c65
0x05863b  CD B8 00 08              call 0x0800b8
0x05863f  28 0A                    jr z, 0x05864b
0x058641  CD 81 FF 07              call 0x07ff81
0x058645  CD C6 81 05              call 0x0581c6
0x058649  18 14                    jr 0x05865f
0x05864b  CD 4B 38 08              call 0x08384b
0x05864f  CD 6A E8 05              call 0x05e86a
0x058653  CD AE E3 05              call 0x05e3ae
0x058657  CD D8 E7 05              call 0x05e7d8
0x05865b  CD AE 81 05              call 0x0581ae
0x05865f  40 ED 5B 80 26           sis ld de, (0x002680)
0x058664  CD E6 8E 05              call 0x058ee6
0x058668  18 29                    jr 0x058693
0x05866a  E5                       push hl
0x05866b  40 ED 5B 80 26           sis ld de, (0x002680)
0x058670  CD E6 8E 05              call 0x058ee6
0x058674  CD 7B FF 07              call 0x07ff7b
0x058678  CD 4F 38 08              call 0x08384f
0x05867c  11 F9 FF FF              ld de, 0xfffff9
0x058680  19                       add hl, de
0x058681  36 23                    ld-ind-imm value=0x000023
0x058683  E1                       pop hl
```

### CALL Targets

| Site | Target | Annotation |
|------|--------|------------|
| 0x0585f4 | 0x0239b3 | (unknown) |
| 0x058608 | 0x058d54 | (unknown) |
| 0x05860c | 0x058ba3 | (unknown) |
| 0x058610 | 0x058b5c | (unknown) |
| 0x058614 | 0x03fbf9 | (unknown) |
| 0x058618 | 0x05840b | (unknown) |
| 0x05861d | 0x058212 | (unknown) |
| 0x058622 | 0x0581ae | (unknown) |
| 0x058626 | 0x099211 | (unknown) |
| 0x05862b | 0x0921cb | (unknown) |
| 0x05863b | 0x0800b8 | (unknown) |
| 0x058641 | 0x07ff81 | (unknown) |
| 0x058645 | 0x0581c6 | (unknown) |
| 0x05864b | 0x08384b | (unknown) |
| 0x05864f | 0x05e86a | (unknown) |
| 0x058653 | 0x05e3ae | (unknown) |
| 0x058657 | 0x05e7d8 | (unknown) |
| 0x05865b | 0x0581ae | (unknown) |
| 0x058664 | 0x058ee6 | (unknown) |
| 0x058670 | 0x058ee6 | (unknown) |
| 0x058674 | 0x07ff7b | (unknown) |
| 0x058678 | 0x08384f | (unknown) |

### Key Reference Summary

- References 0x0973C8 (ENTER key path): **NO**
- References 0x08BF22 (yield): **NO**
- References 0xD0146D (key event code): **NO**
- References 0x05E872 (buffer flush): **NO**
- IY-indexed operations: **3**

## Disassembly of 0x058241 (HomeHandler)

```text
0x058241  21 00 00 00              ld hl, 0x000000
0x058245  40 22 AC 26              sis ld (0x0026ac), hl
0x058249  FD CB 52 BE              res 7, (iy+82)  ; IY+82
0x05824d  3E 03                    ld a, 0x03
0x05824f  FD CB 34 66              bit 4, (iy+52)  ; IY+52
0x058253  C4 B3 39 02              call nz, 0x0239b3
0x058257  C0                       ret nz
0x058258  FD CB 29 56              bit 2, (iy+41)  ; IY+41
0x05825c  28 04                    jr z, 0x058262
0x05825e  CD 18 38 02              call 0x023818
0x058262  FD 7E 3C                 ld a, (iy+60)  ; IY+60
0x058265  E6 F4                    and 0xf4
0x058267  FD 77 3C                 ld (iy+60), a  ; IY+60
0x05826a  FD CB 14 BE              res 7, (iy+20)  ; IY+20
0x05826e  CD C2 00 08              call 0x0800c2
0x058272  CD A3 8B 05              call 0x058ba3
0x058276  32 5B 26 D0              ld (0xd0265b), a
0x05827a  32 06 25 D0              ld (0xd02506), a
0x05827e  CD 22 82 05              call 0x058222
0x058282  FD CB 1C 76              bit 6, (iy+28)  ; IY+28
0x058286  C2 2C 8A 05              jp nz, 0x058a2c
0x05828a  FD CB 09 7E              bit 7, (iy+9)  ; IY+9
0x05828e  C0                       ret nz
0x05828f  FD CB 45 BE              res 7, (iy+69)  ; IY+69
0x058293  FD CB 0C 7E              bit 7, (iy+12)  ; IY+12
0x058297  C2 83 84 05              jp nz, 0x058483
0x05829b  FD CB 0C 76              bit 6, (iy+12)  ; IY+12
0x05829f  C0                       ret nz
0x0582a0  FD CB 09 86              res 0, (iy+9)  ; IY+9
0x0582a4  FD CB 08 8E              res 1, (iy+8)  ; IY+8
0x0582a8  CD AA DC 09              call 0x09dcaa
0x0582ac  CD 23 36 08              call 0x083623
0x0582b0  CD 64 37 08              call 0x083764
0x0582b4  CD 49 8D 05              call 0x058d49
0x0582b8  CD 22 BF 08              call 0x08bf22  ; yield / CoorMon return
0x0582bc  FD CB 4A A6              res 4, (iy+74)  ; IY+74
0x0582c0  FD CB 05 9E              res 3, (iy+5)  ; IY+5
0x0582c4  FD CB 47 8E              res 1, (iy+71)  ; IY+71
0x0582c8  FD CB 49 B6              res 6, (iy+73)  ; IY+73
0x0582cc  FD CB 25 AE              res 5, (iy+37)  ; IY+37
```

References to 0x0585D3 (context table): 0
References to 0x08C782 (LDIR cx copy): 0

## Runtime Trace of 0x0585E9

### Setup

- Cold boot + MEM_INIT
- cx seed: cxMain=0x0585E9 (second-pass handler), cxCurApp=0x40
- Pre-yield IY flags cleared, ENTER key seeded, tokenized "2+3" at userMem
- PC set to 0x0585E9, budget: 50K steps, maxLoopIterations=8192

### Results

- Termination: **return_hit**
- Steps: 54
- Final PC: 0x7ffffe
- Loops forced: 0

### Watched Address Hits

| Address | Label | Hit? | Steps |
|---------|-------|------|-------|
| 0x0973c8 | ENTER key path (with ParseInp) | NO | - |
| 0x099914 | ParseInp | NO | - |
| 0x08bf22 | yield | NO | - |
| 0x05e872 | buffer flush | NO | - |
| 0x05e3a2 | compaction | NO | - |
| 0x05e836 | calls LDDR | NO | - |
| 0x0831a4 | LDDR itself | NO | - |
| 0x001881 | RAM CLEAR (should NOT be hit) | NO | - |

### State Changes

No state changes detected.

### First 50 Block PCs

```text
step=1 pc=0x0585e9 sp=0xd1a86f
step=2 pc=0x0585f8 sp=0xd1a86f
step=3 pc=0x0585f9 sp=0xd1a86f
step=4 pc=0x058602 sp=0xd1a86f
step=5 pc=0x05877a sp=0xd1a86f
step=6 pc=0x0587a3 sp=0xd1a86f
step=7 pc=0x080259 sp=0xd1a86c
step=8 pc=0x0587a7 sp=0xd1a86f
step=9 pc=0x0587e9 sp=0xd1a86f
step=10 pc=0x058b73 sp=0xd1a86c
step=11 pc=0x0587f1 sp=0xd1a86f
step=12 pc=0x0587f3 sp=0xd1a86f
step=13 pc=0x0587f7 sp=0xd1a86f
step=14 pc=0x0800b8 sp=0xd1a86c
step=15 pc=0x0587fb sp=0xd1a86f
step=16 pc=0x058814 sp=0xd1a86f
step=17 pc=0x05881a sp=0xd1a86f
step=18 pc=0x058820 sp=0xd1a86f
step=19 pc=0x058846 sp=0xd1a86f
step=20 pc=0x05884c sp=0xd1a86f
step=21 pc=0x058eda sp=0xd1a86c
step=22 pc=0x058850 sp=0xd1a86f
step=23 pc=0x05899d sp=0xd1a86f
step=24 pc=0x058d54 sp=0xd1a86c
step=25 pc=0x058ec6 sp=0xd1a869
step=26 pc=0x058d58 sp=0xd1a86c
step=27 pc=0x0800a8 sp=0xd1a869
step=28 pc=0x0800ae sp=0xd1a869
step=29 pc=0x080259 sp=0xd1a866
step=30 pc=0x0800b2 sp=0xd1a869
step=31 pc=0x058d60 sp=0xd1a86c
step=32 pc=0x058d89 sp=0xd1a86c
step=33 pc=0x0589a1 sp=0xd1a86f
step=34 pc=0x0589ae sp=0xd1a86f
step=35 pc=0x0589bb sp=0xd1a86f
step=36 pc=0x0589e5 sp=0xd1a86f
step=37 pc=0x058d54 sp=0xd1a86c
step=38 pc=0x058ec6 sp=0xd1a869
step=39 pc=0x058d58 sp=0xd1a86c
step=40 pc=0x0800a8 sp=0xd1a869
step=41 pc=0x0800ae sp=0xd1a869
step=42 pc=0x080259 sp=0xd1a866
step=43 pc=0x0800b2 sp=0xd1a869
step=44 pc=0x058d60 sp=0xd1a86c
step=45 pc=0x058d89 sp=0xd1a86c
step=46 pc=0x0589e9 sp=0xd1a86f
step=47 pc=0x0589ef sp=0xd1a86f
step=48 pc=0x058a0c sp=0xd1a86f
step=49 pc=0x058a60 sp=0xd1a86f
step=50 pc=0x058a6e sp=0xd1a86f
```

### Post-Run State

- cxCurApp: 0x40
- cxMain: 0x0585e9
- errNo: 0x00
- OP1: 00 00 00 00 00 00 00 00 00
- begPC: 0xd1a881
- curPC: 0xd1a881
- endPC: 0xd1a885

## Analysis

### Key Finding: Second-pass handler does NOT reach ParseInp

The handler at 0x0585E9 does not reach ParseInp (0x099914) in 50K steps.

### Handler Purpose

Based on static disassembly and runtime trace, 0x0585E9 appears to be:
The purpose could not be determined from CALL targets alone.
Further investigation of the disassembly and runtime trace is needed.


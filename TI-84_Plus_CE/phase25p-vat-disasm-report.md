# Phase 25P - VAT / CreateReal crash-path disassembly

## Scope

- CreateReal entry: `0x08238A` (128 bytes)
- ParseInp crash path: `0x061D1A` (64 bytes), `0x061D3E` (64 bytes)
- Common crash subroutine: `0x03E1B4` (48 bytes), `0x03E1CA` (32 bytes)
- Known crash pattern: `0x061dba` -> `0x58c35b` (missing block / stack corruption)
- IX = `0xD1A860`, IY = `0xD00080` (postInitState values)

## CreateReal entry 0x08238A

Raw ROM bytes (128 bytes from 0x08238a):

`af 21 09 00 00 18 f5 3e 01 cd 9b 35 08 d8 3e 01 e5 f5 3a f9 05 d0 fe 5d 28 0e fe 24 28 0a fe 3a 28 06 fe 72 c2 46 1d 06 f1 cd c9 22 08 c1 e5 c5 e1 78 b1 20 06 12 13 12 1b e1 c9 eb 73 23 72 23 36 00 3a 19 06 d0 cb 5f 28 02 36 0c 2b 2b eb e1 c9 3e 0d cd 9b 35 08 d8 3e 0d e5 29 18 b3 cd fe 23 08 3e 02 cd 9b 35 08 d8 cd fe 23 08 e5 ed 6c 3e 02 18 b5 e5 d5 ed 6c 11 91 01 00 b7 52 ed 52`

```text
0x08238a: af                 xor a
0x08238b: 21 09 00 00        ld hl, 0x000009
0x08238f: 18 f5              jr 0x082386
0x082391: 3e 01              ld a, 0x01
0x082393: cd 9b 35 08        call 0x08359b
0x082397: d8                 ret c
0x082398: 3e 01              ld a, 0x01
0x08239a: e5                 push hl
0x08239b: f5                 push af
0x08239c: 3a f9 05 d0        ld a, (0xd005f9)
0x0823a0: fe 5d              cp 0x5d
0x0823a2: 28 0e              jr z, 0x0823b2
0x0823a4: fe 24              cp 0x24
0x0823a6: 28 0a              jr z, 0x0823b2
0x0823a8: fe 3a              cp 0x3a
0x0823aa: 28 06              jr z, 0x0823b2
0x0823ac: fe 72              cp 0x72
0x0823ae: c2 46 1d 06        jp nz, 0x061d46
0x0823b2: f1                 pop af
0x0823b3: cd c9 22 08        call 0x0822c9
0x0823b7: c1                 pop bc
0x0823b8: e5                 push hl
0x0823b9: c5                 push bc
0x0823ba: e1                 pop hl
0x0823bb: 78                 ld a, b
0x0823bc: b1                 or c
0x0823bd: 20 06              jr nz, 0x0823c5
0x0823bf: 12                 ld (de), a
0x0823c0: 13                 inc de
0x0823c1: 12                 ld (de), a
0x0823c2: 1b                 dec de
0x0823c3: e1                 pop hl
0x0823c4: c9                 ret
0x0823c5: eb                 ex de, hl
0x0823c6: 73                 ld (hl), e
0x0823c7: 23                 inc hl
0x0823c8: 72                 ld (hl), d
0x0823c9: 23                 inc hl
0x0823ca: 36 00              ld-ind-imm
0x0823cc: 3a 19 06 d0        ld a, (0xd00619)
0x0823d0: cb 5f              bit 3, a
0x0823d2: 28 02              jr z, 0x0823d6
0x0823d4: 36 0c              ld-ind-imm
0x0823d6: 2b                 dec hl
0x0823d7: 2b                 dec hl
0x0823d8: eb                 ex de, hl
0x0823d9: e1                 pop hl
0x0823da: c9                 ret
0x0823db: 3e 0d              ld a, 0x0d
0x0823dd: cd 9b 35 08        call 0x08359b
0x0823e1: d8                 ret c
0x0823e2: 3e 0d              ld a, 0x0d
0x0823e4: e5                 push hl
0x0823e5: 29                 add hl, hl
0x0823e6: 18 b3              jr 0x08239b
0x0823e8: cd fe 23 08        call 0x0823fe
0x0823ec: 3e 02              ld a, 0x02
0x0823ee: cd 9b 35 08        call 0x08359b
0x0823f2: d8                 ret c
0x0823f3: cd fe 23 08        call 0x0823fe
0x0823f7: e5                 push hl
0x0823f8: ed 6c              mlt
0x0823fa: 3e 02              ld a, 0x02
0x0823fc: 18 b5              jr 0x0823b3
0x0823fe: e5                 push hl
0x0823ff: d5                 push de
0x082400: ed 6c              mlt
0x082402: 11 91 01 00        ld de, 0x000191
0x082406: b7                 or a
0x082407: 52 ed 52           sil sbc hl, de
```

## Crash path 0x061D1A

Raw ROM bytes (64 bytes from 0x061d1a):

`3e 88 18 06 3e 9e 18 02 3e 89 c3 b2 1d 06 3e 9d 18 f8 3e 8a c3 b2 1d 06 3e 8b 18 7c 3e 8c 18 78 3e 8d 18 74 3e 8e 18 70 3e 0e 18 6c 3e 8f 18 68 3e 90 18 64 3e 91 18 60 3e 92 18 5c 3e 93 18 58`

```text
0x061d1a: 3e 88              ld a, 0x88
0x061d1c: 18 06              jr 0x061d24
0x061d1e: 3e 9e              ld a, 0x9e
0x061d20: 18 02              jr 0x061d24
0x061d22: 3e 89              ld a, 0x89
0x061d24: c3 b2 1d 06        jp 0x061db2
0x061d28: 3e 9d              ld a, 0x9d
0x061d2a: 18 f8              jr 0x061d24
0x061d2c: 3e 8a              ld a, 0x8a
0x061d2e: c3 b2 1d 06        jp 0x061db2
0x061d32: 3e 8b              ld a, 0x8b
0x061d34: 18 7c              jr 0x061db2
0x061d36: 3e 8c              ld a, 0x8c
0x061d38: 18 78              jr 0x061db2
0x061d3a: 3e 8d              ld a, 0x8d
0x061d3c: 18 74              jr 0x061db2
0x061d3e: 3e 8e              ld a, 0x8e
0x061d40: 18 70              jr 0x061db2
0x061d42: 3e 0e              ld a, 0x0e
0x061d44: 18 6c              jr 0x061db2
0x061d46: 3e 8f              ld a, 0x8f
0x061d48: 18 68              jr 0x061db2
0x061d4a: 3e 90              ld a, 0x90
0x061d4c: 18 64              jr 0x061db2
0x061d4e: 3e 91              ld a, 0x91
0x061d50: 18 60              jr 0x061db2
0x061d52: 3e 92              ld a, 0x92
0x061d54: 18 5c              jr 0x061db2
0x061d56: 3e 93              ld a, 0x93
0x061d58: 18 58              jr 0x061db2
```

## CreateReal crash 0x061D3E

Raw ROM bytes (64 bytes from 0x061d3e):

`3e 8e 18 70 3e 0e 18 6c 3e 8f 18 68 3e 90 18 64 3e 91 18 60 3e 92 18 5c 3e 93 18 58 3e 86 18 54 3e 15 18 50 3e 96 18 4c 3e 98 18 48 3e 99 18 44 3e 9a 18 40 3e 9c 18 3c 3e 1b 18 38 3e aa 18 34`

```text
0x061d3e: 3e 8e              ld a, 0x8e
0x061d40: 18 70              jr 0x061db2
0x061d42: 3e 0e              ld a, 0x0e
0x061d44: 18 6c              jr 0x061db2
0x061d46: 3e 8f              ld a, 0x8f
0x061d48: 18 68              jr 0x061db2
0x061d4a: 3e 90              ld a, 0x90
0x061d4c: 18 64              jr 0x061db2
0x061d4e: 3e 91              ld a, 0x91
0x061d50: 18 60              jr 0x061db2
0x061d52: 3e 92              ld a, 0x92
0x061d54: 18 5c              jr 0x061db2
0x061d56: 3e 93              ld a, 0x93
0x061d58: 18 58              jr 0x061db2
0x061d5a: 3e 86              ld a, 0x86
0x061d5c: 18 54              jr 0x061db2
0x061d5e: 3e 15              ld a, 0x15
0x061d60: 18 50              jr 0x061db2
0x061d62: 3e 96              ld a, 0x96
0x061d64: 18 4c              jr 0x061db2
0x061d66: 3e 98              ld a, 0x98
0x061d68: 18 48              jr 0x061db2
0x061d6a: 3e 99              ld a, 0x99
0x061d6c: 18 44              jr 0x061db2
0x061d6e: 3e 9a              ld a, 0x9a
0x061d70: 18 40              jr 0x061db2
0x061d72: 3e 9c              ld a, 0x9c
0x061d74: 18 3c              jr 0x061db2
0x061d76: 3e 1b              ld a, 0x1b
0x061d78: 18 38              jr 0x061db2
0x061d7a: 3e aa              ld a, 0xaa
0x061d7c: 18 34              jr 0x061db2
```

## Common crash sub 0x03E1B4

Raw ROM bytes (48 bytes from 0x03e1b4):

`32 42 05 d0 ed 57 ea c0 e1 03 ed 57 f3 f5 3a 42 05 d0 cd 87 e1 03 32 42 05 d0 f1 e2 d4 e1 03 fb 3a 42 05 d0 c9 cd bd f7 07 e6 3f fe 15 d0 d6 0f`

```text
0x03e1b4: 32 42 05 d0        ld (0xd00542), a
0x03e1b8: ed 57              ld-special
0x03e1ba: ea c0 e1 03        jp pe, 0x03e1c0
0x03e1be: ed 57              ld-special
0x03e1c0: f3                 di
0x03e1c1: f5                 push af
0x03e1c2: 3a 42 05 d0        ld a, (0xd00542)
0x03e1c6: cd 87 e1 03        call 0x03e187
0x03e1ca: 32 42 05 d0        ld (0xd00542), a
0x03e1ce: f1                 pop af
0x03e1cf: e2 d4 e1 03        jp po, 0x03e1d4
0x03e1d3: fb                 ei
0x03e1d4: 3a 42 05 d0        ld a, (0xd00542)
0x03e1d8: c9                 ret
0x03e1d9: cd bd f7 07        call 0x07f7bd
0x03e1dd: e6 3f              and 0x3f
0x03e1df: fe 15              cp 0x15
0x03e1e1: d0                 ret nc
0x03e1e2: d6 0f              sub 0x0f
```

## Crash path 0x03E1CA

Raw ROM bytes (32 bytes from 0x03e1ca):

`32 42 05 d0 f1 e2 d4 e1 03 fb 3a 42 05 d0 c9 cd bd f7 07 e6 3f fe 15 d0 d6 0f 3f c9 fd cb 12 d6`

```text
0x03e1ca: 32 42 05 d0        ld (0xd00542), a
0x03e1ce: f1                 pop af
0x03e1cf: e2 d4 e1 03        jp po, 0x03e1d4
0x03e1d3: fb                 ei
0x03e1d4: 3a 42 05 d0        ld a, (0xd00542)
0x03e1d8: c9                 ret
0x03e1d9: cd bd f7 07        call 0x07f7bd
0x03e1dd: e6 3f              and 0x3f
0x03e1df: fe 15              cp 0x15
0x03e1e1: d0                 ret nc
0x03e1e2: d6 0f              sub 0x0f
0x03e1e4: 3f                 ccf
0x03e1e5: c9                 ret
0x03e1e6: fd cb 12 d6        set 2, (iy+18)
```

## RAM LD references

### Absolute-address LDs (0xD00000-0xD1FFFF)

| Address | Symbol | Access | Width | Site(s) |
|---|---|---|---:|---|
| `0xd00542` |  | write | 8 | `0x03e1b4 ld (0xd00542), a`<br>`0x03e1ca ld (0xd00542), a` |
| `0xd00542` |  | read | 8 | `0x03e1c2 ld a, (0xd00542)`<br>`0x03e1d4 ld a, (0xd00542)` |
| `0xd005f9` | `?OP1+1` | read | 8 | `0x08239c ld a, (0xd005f9)` |
| `0xd00619` |  | read | 8 | `0x0823cc ld a, (0xd00619)` |

### IX-relative LDs resolved with `IX = 0xD1A860`

(none found)

### IY-relative LDs resolved with `IY = 0xD00080`

| Address | Symbol | Access | Width | Site(s) |
|---|---|---|---:|---|
| `0xd00092` |  | read+write | 8 | `0x03e1e6 set 2, (iy+18)` |

## Reads-before-write analysis

RAM addresses read before any write in the same block (these must be pre-initialized):

### CreateReal entry 0x08238A

| Address | Symbol | Via | First read at |
|---|---|---|---|
| `0xd005f9` | `?OP1+1` | absolute | `0x08239c ld a, (0xd005f9)` |
| `0xd00619` |  | absolute | `0x0823cc ld a, (0xd00619)` |

### Crash path 0x03E1CA

| Address | Symbol | Via | First read at |
|---|---|---|---|
| `0xd00092` |  | iy | `0x03e1e6 set 2, (iy+18)` |

## Call/jump targets

Unique call/jump targets found across all blocks:

### Calls

| Target | Called from |
|---|---|
| `0x03e187` | `0x03e1c6` (Common crash sub 0x03E1B4) |
| `0x07f7bd` | `0x03e1d9` (Common crash sub 0x03E1B4), `0x03e1d9` (Crash path 0x03E1CA) |
| `0x0822c9` | `0x0823b3` (CreateReal entry 0x08238A) |
| `0x0823fe` | `0x0823e8` (CreateReal entry 0x08238A), `0x0823f3` (CreateReal entry 0x08238A) |
| `0x08359b` | `0x082393` (CreateReal entry 0x08238A), `0x0823dd` (CreateReal entry 0x08238A), `0x0823ee` (CreateReal entry 0x08238A) |

### Jumps

| Target | From |
|---|---|
| `0x03e1c0` | `0x03e1ba` (Common crash sub 0x03E1B4) |
| `0x03e1d4` | `0x03e1cf` (Common crash sub 0x03E1B4), `0x03e1cf` (Crash path 0x03E1CA) |
| `0x061d24` | `0x061d1c` (Crash path 0x061D1A), `0x061d20` (Crash path 0x061D1A), `0x061d2a` (Crash path 0x061D1A) |
| `0x061d46` | `0x0823ae` (CreateReal entry 0x08238A) |
| `0x061db2` | `0x061d24` (Crash path 0x061D1A), `0x061d2e` (Crash path 0x061D1A), `0x061d34` (Crash path 0x061D1A), `0x061d38` (Crash path 0x061D1A), `0x061d3c` (Crash path 0x061D1A), `0x061d40` (Crash path 0x061D1A), `0x061d44` (Crash path 0x061D1A), `0x061d48` (Crash path 0x061D1A), `0x061d4c` (Crash path 0x061D1A), `0x061d50` (Crash path 0x061D1A), `0x061d54` (Crash path 0x061D1A), `0x061d58` (Crash path 0x061D1A), `0x061d40` (CreateReal crash 0x061D3E), `0x061d44` (CreateReal crash 0x061D3E), `0x061d48` (CreateReal crash 0x061D3E), `0x061d4c` (CreateReal crash 0x061D3E), `0x061d50` (CreateReal crash 0x061D3E), `0x061d54` (CreateReal crash 0x061D3E), `0x061d58` (CreateReal crash 0x061D3E), `0x061d5c` (CreateReal crash 0x061D3E), `0x061d60` (CreateReal crash 0x061D3E), `0x061d64` (CreateReal crash 0x061D3E), `0x061d68` (CreateReal crash 0x061D3E), `0x061d6c` (CreateReal crash 0x061D3E), `0x061d70` (CreateReal crash 0x061D3E), `0x061d74` (CreateReal crash 0x061D3E), `0x061d78` (CreateReal crash 0x061D3E), `0x061d7c` (CreateReal crash 0x061D3E) |
| `0x082386` | `0x08238f` (CreateReal entry 0x08238A) |
| `0x08239b` | `0x0823e6` (CreateReal entry 0x08238A) |
| `0x0823b2` | `0x0823a2` (CreateReal entry 0x08238A), `0x0823a6` (CreateReal entry 0x08238A), `0x0823aa` (CreateReal entry 0x08238A) |
| `0x0823b3` | `0x0823fc` (CreateReal entry 0x08238A) |
| `0x0823c5` | `0x0823bd` (CreateReal entry 0x08238A) |
| `0x0823d6` | `0x0823d2` (CreateReal entry 0x08238A) |


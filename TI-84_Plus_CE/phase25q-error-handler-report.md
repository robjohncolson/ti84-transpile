# Phase 25Q - Error handler convergence point disassembly

## Scope

- Error convergence point: `0x061DB2` (128 bytes) — all error dispatch table entries jump here
- Gap between dispatch table and convergence: `0x061D80` (50 bytes)
- Crash subroutine: `0x03E1B4` (64 bytes)
- Second crash subroutine: `0x03E1CA` (64 bytes)
- DispErrorScreen entry: `0x062160` (64 bytes)
- Known crash chain: `0x061db2` -> `0x03e1b4` -> `0x03e1ca` -> `0x061dba` -> `0x58c35b`
- Key RAM: errNo=`0xD008DF`, errSP=`0xD008E0`, errOffset=`0xD008E3`, onSP=`0xD007FA`
- IX = `0xD1A860`, IY = `0xD00080` (postInitState values)

## Error convergence 0x061DB2

Raw ROM bytes (128 bytes from 0x061db2):

`32 df 08 d0 cd b4 e1 03 fd cb 4b be fd cb 12 96 fd cb 24 a6 fd cb 49 8e ed 7b e0 08 d0 f1 c9 2a 90 25 d0 d1 19 22 93 25 d0 d1 2a 8a 25 d0 19 22 8d 25 d0 e1 22 e0 08 d0 3a df 08 d0 c9 d1 e5 2a e0 08 d0 e5 ed 4b 8a 25 d0 2a 8d 25 d0 b7 ed 42 e5 ed 4b 90 25 d0 2a 93 25 d0 ed 42 e5 21 d1 1d 06 e5 21 27 1e 06 e5 ed 73 e0 08 d0 eb e9 c1 ed 7b e0 08 d0 c9 f1 f1 f1 e3 22 e0 08 d0 e1 f1 c5`

```text
0x061db2: 32 df 08 d0        ld (0xd008df), a  ; ?errNo
0x061db6: cd b4 e1 03        call 0x03e1b4
0x061dba: fd cb 4b be        res 7, (iy+75)
0x061dbe: fd cb 12 96        res 2, (iy+18)
0x061dc2: fd cb 24 a6        res 4, (iy+36)
0x061dc6: fd cb 49 8e        res 1, (iy+73)
0x061dca: ed 7b e0 08 d0     ld sp, (0xd008e0)  ; ?errSP
0x061dcf: f1                 pop af
0x061dd0: c9                 ret
0x061dd1: 2a 90 25 d0        ld hl, (0xd02590)
0x061dd5: d1                 pop de
0x061dd6: 19                 add hl, de
0x061dd7: 22 93 25 d0        ld (0xd02593), hl
0x061ddb: d1                 pop de
0x061ddc: 2a 8a 25 d0        ld hl, (0xd0258a)
0x061de0: 19                 add hl, de
0x061de1: 22 8d 25 d0        ld (0xd0258d), hl
0x061de5: e1                 pop hl
0x061de6: 22 e0 08 d0        ld (0xd008e0), hl  ; ?errSP
0x061dea: 3a df 08 d0        ld a, (0xd008df)  ; ?errNo
0x061dee: c9                 ret
0x061def: d1                 pop de
0x061df0: e5                 push hl
0x061df1: 2a e0 08 d0        ld hl, (0xd008e0)  ; ?errSP
0x061df5: e5                 push hl
0x061df6: ed 4b 8a 25 d0     ld bc, (0xd0258a)
0x061dfb: 2a 8d 25 d0        ld hl, (0xd0258d)
0x061dff: b7                 or a
0x061e00: ed 42              sbc hl, bc
0x061e02: e5                 push hl
0x061e03: ed 4b 90 25 d0     ld bc, (0xd02590)
0x061e08: 2a 93 25 d0        ld hl, (0xd02593)
0x061e0c: ed 42              sbc hl, bc
0x061e0e: e5                 push hl
0x061e0f: 21 d1 1d 06        ld hl, 0x061dd1
0x061e13: e5                 push hl
0x061e14: 21 27 1e 06        ld hl, 0x061e27
0x061e18: e5                 push hl
0x061e19: ed 73 e0 08 d0     ld (0xd008e0), sp  ; ?errSP
0x061e1e: eb                 ex de, hl
0x061e1f: e9                 jp-indirect
0x061e20: c1                 pop bc
0x061e21: ed 7b e0 08 d0     ld sp, (0xd008e0)  ; ?errSP
0x061e26: c9                 ret
0x061e27: f1                 pop af
0x061e28: f1                 pop af
0x061e29: f1                 pop af
0x061e2a: e3                 ex (sp), hl
0x061e2b: 22 e0 08 d0        ld (0xd008e0), hl  ; ?errSP
0x061e2f: e1                 pop hl
0x061e30: f1                 pop af
0x061e31: c5                 push bc
```

## Gap region 0x061D80

Raw ROM bytes (50 bytes from 0x061d80):

`18 30 3e 28 18 2c 3e 2e 18 28 3e ab 18 24 3e ac 18 20 3e af 18 1c 3e 2f 18 18 3e 30 18 14 3e 31 18 10 3e b4 18 0c 3e 9f 18 08 3e b5 18 04 3e 36 18 00`

```text
0x061d80: 18 30              jr 0x061db2
0x061d82: 3e 28              ld a, 0x28
0x061d84: 18 2c              jr 0x061db2
0x061d86: 3e 2e              ld a, 0x2e
0x061d88: 18 28              jr 0x061db2
0x061d8a: 3e ab              ld a, 0xab
0x061d8c: 18 24              jr 0x061db2
0x061d8e: 3e ac              ld a, 0xac
0x061d90: 18 20              jr 0x061db2
0x061d92: 3e af              ld a, 0xaf
0x061d94: 18 1c              jr 0x061db2
0x061d96: 3e 2f              ld a, 0x2f
0x061d98: 18 18              jr 0x061db2
0x061d9a: 3e 30              ld a, 0x30
0x061d9c: 18 14              jr 0x061db2
0x061d9e: 3e 31              ld a, 0x31
0x061da0: 18 10              jr 0x061db2
0x061da2: 3e b4              ld a, 0xb4
0x061da4: 18 0c              jr 0x061db2
0x061da6: 3e 9f              ld a, 0x9f
0x061da8: 18 08              jr 0x061db2
0x061daa: 3e b5              ld a, 0xb5
0x061dac: 18 04              jr 0x061db2
0x061dae: 3e 36              ld a, 0x36
0x061db0: 18 00              jr 0x061db2
```

## Crash sub 0x03E1B4

Raw ROM bytes (64 bytes from 0x03e1b4):

`32 42 05 d0 ed 57 ea c0 e1 03 ed 57 f3 f5 3a 42 05 d0 cd 87 e1 03 32 42 05 d0 f1 e2 d4 e1 03 fb 3a 42 05 d0 c9 cd bd f7 07 e6 3f fe 15 d0 d6 0f 3f c9 fd cb 12 d6 c9 f5 f3 3e 8c ed 39 24 fe 8c`

```text
0x03e1b4: 32 42 05 d0        ld (0xd00542), a  ; ?scratch
0x03e1b8: ed 57              ld-special
0x03e1ba: ea c0 e1 03        jp pe, 0x03e1c0
0x03e1be: ed 57              ld-special
0x03e1c0: f3                 di
0x03e1c1: f5                 push af
0x03e1c2: 3a 42 05 d0        ld a, (0xd00542)  ; ?scratch
0x03e1c6: cd 87 e1 03        call 0x03e187
0x03e1ca: 32 42 05 d0        ld (0xd00542), a  ; ?scratch
0x03e1ce: f1                 pop af
0x03e1cf: e2 d4 e1 03        jp po, 0x03e1d4
0x03e1d3: fb                 ei
0x03e1d4: 3a 42 05 d0        ld a, (0xd00542)  ; ?scratch
0x03e1d8: c9                 ret
0x03e1d9: cd bd f7 07        call 0x07f7bd
0x03e1dd: e6 3f              and 0x3f
0x03e1df: fe 15              cp 0x15
0x03e1e1: d0                 ret nc
0x03e1e2: d6 0f              sub 0x0f
0x03e1e4: 3f                 ccf
0x03e1e5: c9                 ret
0x03e1e6: fd cb 12 d6        set 2, (iy+18)
0x03e1ea: c9                 ret
0x03e1eb: f5                 push af
0x03e1ec: f3                 di
0x03e1ed: 3e 8c              ld a, 0x8c
0x03e1ef: ed 39 24           out0
0x03e1f2: fe 8c              cp 0x8c
```

## Crash sub 0x03E1CA

Raw ROM bytes (64 bytes from 0x03e1ca):

`32 42 05 d0 f1 e2 d4 e1 03 fb 3a 42 05 d0 c9 cd bd f7 07 e6 3f fe 15 d0 d6 0f 3f c9 fd cb 12 d6 c9 f5 f3 3e 8c ed 39 24 fe 8c c2 66 00 00 ed 38 06 cb d7 ed 39 06 00 00 3e 04 f3 18 00 f3 ed 7e`

```text
0x03e1ca: 32 42 05 d0        ld (0xd00542), a  ; ?scratch
0x03e1ce: f1                 pop af
0x03e1cf: e2 d4 e1 03        jp po, 0x03e1d4
0x03e1d3: fb                 ei
0x03e1d4: 3a 42 05 d0        ld a, (0xd00542)  ; ?scratch
0x03e1d8: c9                 ret
0x03e1d9: cd bd f7 07        call 0x07f7bd
0x03e1dd: e6 3f              and 0x3f
0x03e1df: fe 15              cp 0x15
0x03e1e1: d0                 ret nc
0x03e1e2: d6 0f              sub 0x0f
0x03e1e4: 3f                 ccf
0x03e1e5: c9                 ret
0x03e1e6: fd cb 12 d6        set 2, (iy+18)
0x03e1ea: c9                 ret
0x03e1eb: f5                 push af
0x03e1ec: f3                 di
0x03e1ed: 3e 8c              ld a, 0x8c
0x03e1ef: ed 39 24           out0
0x03e1f2: fe 8c              cp 0x8c
0x03e1f4: c2 66 00 00        jp nz, 0x000066
0x03e1f8: ed 38 06           in0
0x03e1fb: cb d7              set 2, a
0x03e1fd: ed 39 06           out0
0x03e200: 00                 nop
0x03e201: 00                 nop
0x03e202: 3e 04              ld a, 0x04
0x03e204: f3                 di
0x03e205: 18 00              jr 0x03e207
0x03e207: f3                 di
0x03e208: ed 7e              rsmix
```

## DispErrorScreen 0x062160

Raw ROM bytes (64 bytes from 0x062160):

`fd cb 0c e6 40 2a 95 05 e5 af 32 95 05 d0 21 a9 26 0b 3e 0b fd cb 35 4e c4 8e 39 02 11 42 08 d0 ed a0 7e b7 20 fa 3e 3a 12 13 3e 20 12 13 d5 3a df 08 d0 e6 7f fe 3a 38 06 21 99 2c 06 18 4b b7`

```text
0x062160: fd cb 0c e6        set 4, (iy+12)
0x062164: 40 2a 95 05        sis ld hl, (0x000595)
0x062168: e5                 push hl
0x062169: af                 xor a
0x06216a: 32 95 05 d0        ld (0xd00595), a
0x06216e: 21 a9 26 0b        ld hl, 0x0b26a9
0x062172: 3e 0b              ld a, 0x0b
0x062174: fd cb 35 4e        bit 1, (iy+53)
0x062178: c4 8e 39 02        call nz, 0x02398e
0x06217c: 11 42 08 d0        ld de, 0xd00842
0x062180: ed a0              ldi
0x062182: 7e                 ld a, (hl)
0x062183: b7                 or a
0x062184: 20 fa              jr nz, 0x062180
0x062186: 3e 3a              ld a, 0x3a
0x062188: 12                 ld (de), a
0x062189: 13                 inc de
0x06218a: 3e 20              ld a, 0x20
0x06218c: 12                 ld (de), a
0x06218d: 13                 inc de
0x06218e: d5                 push de
0x06218f: 3a df 08 d0        ld a, (0xd008df)  ; ?errNo
0x062193: e6 7f              and 0x7f
0x062195: fe 3a              cp 0x3a
0x062197: 38 06              jr c, 0x06219f
0x062199: 21 99 2c 06        ld hl, 0x062c99
0x06219d: 18 4b              jr 0x0621ea
0x06219f: b7                 or a
```

## RAM LD references

### Absolute-address LDs (0xD00000-0xD1FFFF)

| Address | Symbol | Access | Width | Site(s) |
|---|---|---|---:|---|
| `0xd00542` | `?scratch` | write | 8 | `0x03e1b4 ld (0xd00542), a`<br>`0x03e1ca ld (0xd00542), a` |
| `0xd00542` | `?scratch` | read | 8 | `0x03e1c2 ld a, (0xd00542)`<br>`0x03e1d4 ld a, (0xd00542)` |
| `0xd00595` |  | write | 8 | `0x06216a ld (0xd00595), a` |
| `0xd008df` | `?errNo` | write | 8 | `0x061db2 ld (0xd008df), a` |
| `0xd008df` | `?errNo` | read | 8 | `0x061dea ld a, (0xd008df)`<br>`0x06218f ld a, (0xd008df)` |
| `0xd008e0` | `?errSP` | read | 24 | `0x061dca ld sp, (0xd008e0)`<br>`0x061df1 ld hl, (0xd008e0)`<br>`0x061e21 ld sp, (0xd008e0)` |
| `0xd008e0` | `?errSP` | write | 24 | `0x061de6 ld (0xd008e0), hl`<br>`0x061e19 ld (0xd008e0), sp`<br>`0x061e2b ld (0xd008e0), hl` |
| `0xd0258a` |  | read | 24 | `0x061ddc ld hl, (0xd0258a)`<br>`0x061df6 ld bc, (0xd0258a)` |
| `0xd0258d` |  | write | 24 | `0x061de1 ld (0xd0258d), hl` |
| `0xd0258d` |  | read | 24 | `0x061dfb ld hl, (0xd0258d)` |
| `0xd02590` |  | read | 24 | `0x061dd1 ld hl, (0xd02590)`<br>`0x061e03 ld bc, (0xd02590)` |
| `0xd02593` |  | write | 24 | `0x061dd7 ld (0xd02593), hl` |
| `0xd02593` |  | read | 24 | `0x061e08 ld hl, (0xd02593)` |

### IX-relative LDs resolved with `IX = 0xD1A860`

(none found)

### IY-relative LDs resolved with `IY = 0xD00080`

| Address | Symbol | Access | Width | Site(s) |
|---|---|---|---:|---|
| `0xd0008c` |  | read+write | 8 | `0x062160 set 4, (iy+12)` |
| `0xd00092` |  | read+write | 8 | `0x061dbe res 2, (iy+18)`<br>`0x03e1e6 set 2, (iy+18)` |
| `0xd000a4` |  | read+write | 8 | `0x061dc2 res 4, (iy+36)` |
| `0xd000b5` |  | read | 8 | `0x062174 bit 1, (iy+53)` |
| `0xd000c9` |  | read+write | 8 | `0x061dc6 res 1, (iy+73)` |
| `0xd000cb` |  | read+write | 8 | `0x061dba res 7, (iy+75)` |

## Reads-before-write analysis

RAM addresses read before any write in the same block (these must be pre-initialized):

### Error convergence 0x061DB2

| Address | Symbol | Via | First read at |
|---|---|---|---|
| `0xd000cb` |  | iy | `0x061dba res 7, (iy+75)` |
| `0xd00092` |  | iy | `0x061dbe res 2, (iy+18)` |
| `0xd000a4` |  | iy | `0x061dc2 res 4, (iy+36)` |
| `0xd000c9` |  | iy | `0x061dc6 res 1, (iy+73)` |
| `0xd008e0` | `?errSP` | absolute | `0x061dca ld sp, (0xd008e0)` |
| `0xd02590` |  | absolute | `0x061dd1 ld hl, (0xd02590)` |
| `0xd0258a` |  | absolute | `0x061ddc ld hl, (0xd0258a)` |

### Crash sub 0x03E1B4

| Address | Symbol | Via | First read at |
|---|---|---|---|
| `0xd00092` |  | iy | `0x03e1e6 set 2, (iy+18)` |

### Crash sub 0x03E1CA

| Address | Symbol | Via | First read at |
|---|---|---|---|
| `0xd00092` |  | iy | `0x03e1e6 set 2, (iy+18)` |

### DispErrorScreen 0x062160

| Address | Symbol | Via | First read at |
|---|---|---|---|
| `0xd0008c` |  | iy | `0x062160 set 4, (iy+12)` |
| `0xd000b5` |  | iy | `0x062174 bit 1, (iy+53)` |
| `0xd008df` | `?errNo` | absolute | `0x06218f ld a, (0xd008df)` |

## Call/jump targets

Unique call/jump targets found across all blocks:

### Calls

| Target | Called from |
|---|---|
| `0x02398e` | `0x062178` (DispErrorScreen 0x062160) |
| `0x03e187` | `0x03e1c6` (Crash sub 0x03E1B4) |
| `0x03e1b4` | `0x061db6` (Error convergence 0x061DB2) |
| `0x07f7bd` | `0x03e1d9` (Crash sub 0x03E1B4), `0x03e1d9` (Crash sub 0x03E1CA) |

### Jumps

| Target | From |
|---|---|
| `0x000066` | `0x03e1f4` (Crash sub 0x03E1CA) |
| `0x03e1c0` | `0x03e1ba` (Crash sub 0x03E1B4) |
| `0x03e1d4` | `0x03e1cf` (Crash sub 0x03E1B4), `0x03e1cf` (Crash sub 0x03E1CA) |
| `0x03e207` | `0x03e205` (Crash sub 0x03E1CA) |
| `0x061db2` | `0x061d80` (Gap region 0x061D80), `0x061d84` (Gap region 0x061D80), `0x061d88` (Gap region 0x061D80), `0x061d8c` (Gap region 0x061D80), `0x061d90` (Gap region 0x061D80), `0x061d94` (Gap region 0x061D80), `0x061d98` (Gap region 0x061D80), `0x061d9c` (Gap region 0x061D80), `0x061da0` (Gap region 0x061D80), `0x061da4` (Gap region 0x061D80), `0x061da8` (Gap region 0x061D80), `0x061dac` (Gap region 0x061D80), `0x061db0` (Gap region 0x061D80) |
| `0x062180` | `0x062184` (DispErrorScreen 0x062160) |
| `0x06219f` | `0x062197` (DispErrorScreen 0x062160) |
| `0x0621ea` | `0x06219d` (DispErrorScreen 0x062160) |

## Analysis

### Q1: Does 0x061DB2 CALL/JP to 0x062160 (DispErrorScreen)?

**NO** — no direct CALL/JP to 0x062160 found in disassembled ranges.
(DispErrorScreen may be reached indirectly via a jump table or RST vector.)

### Q2: Does 0x061DB2 manipulate SP (longjmp pattern)?

**YES** — SP manipulation found:
- 0x061dca: ld sp, (0xd008e0) (SP from memory — longjmp!)
- 0x061de6: ld (0xd008e0), hl (loads errSP into HL — possible longjmp setup)
- 0x061df1: ld hl, (0xd008e0) (loads errSP into HL — possible longjmp setup)
- 0x061e21: ld sp, (0xd008e0) (SP from memory — longjmp!)
- 0x061e2b: ld (0xd008e0), hl (loads errSP into HL — possible longjmp setup)

### Q3: RAM reads/writes summary

See the RAM LD references section above for the complete list.

### Q4: Control flow from 0x061DB2 to 0x58c35b

Tracing the known crash chain through the disassembled blocks:

Control flow instructions in convergence block:
- `0x061db6: call 0x03e1b4`

No direct reference to 0x58c35b in the disassembled ranges. The jump to 0x58c35b likely happens
via a block that was not disassembled here (e.g., 0x061DBA or a subroutine it calls).


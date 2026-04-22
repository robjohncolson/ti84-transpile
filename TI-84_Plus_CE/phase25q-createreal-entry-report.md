# Phase 25Q - CreateReal entry sequence disassembly

## Scope

- CreateReal JT slot: `0x020534` -> impl at `0x08238A`
- Entry sequence: xor a; ld hl,9; jr 0x082386
- Type-check at `0x08239c`: reads OP1+1 (0xD005F9)
- Compares against: 0x5D (list `]`), 0x24 (`$` string), 0x3A (`:` program), 0x72 (`r`)
- OP4 read at 0xD00619
- IX = `0xD1A860`, IY = `0xD00080`

## Context before entry (other CreateXxx)

Raw ROM bytes (48 bytes from 0x082340):

`cd f1 20 08 ed 5b fb 05 d0 c9 cd be 2b 08 3a f9 05 d0 fe 24 cd b9 21 08 d5 cd a2 f8 07 11 00 06 d0 21 fb 05 d0 01 03 00 00 ed b8 d1 ed 53 fb 05`

```text
0x082340: cd f1 20 08        call 0x0820f1
0x082344: ed 5b fb 05 d0     ld de, (0xd005fb)  ; ?OP1+3
0x082349: c9                 ret
0x08234a: cd be 2b 08        call 0x082bbe
0x08234e: 3a f9 05 d0        ld a, (0xd005f9)  ; ?OP1+1
0x082352: fe 24              cp 0x24
0x082354: cd b9 21 08        call 0x0821b9
0x082358: d5                 push de
0x082359: cd a2 f8 07        call 0x07f8a2
0x08235d: 11 00 06 d0        ld de, 0xd00600
0x082361: 21 fb 05 d0        ld hl, 0xd005fb
0x082365: 01 03 00 00        ld bc, 0x000003
0x082369: ed b8              lddr
0x08236b: d1                 pop de
0x08236c: ed 53 fb 05 d0     ld (0xd005fb), de  ; ?OP1+3
```

## CreateReal region 0x082370

Raw ROM bytes (128 bytes from 0x082370):

`d0 af 32 f9 05 d0 32 fa 05 d0 cd ed 20 08 18 c4 3e 0c 21 12 00 00 c3 d9 22 08 af 21 09 00 00 18 f5 3e 01 cd 9b 35 08 d8 3e 01 e5 f5 3a f9 05 d0 fe 5d 28 0e fe 24 28 0a fe 3a 28 06 fe 72 c2 46 1d 06 f1 cd c9 22 08 c1 e5 c5 e1 78 b1 20 06 12 13 12 1b e1 c9 eb 73 23 72 23 36 00 3a 19 06 d0 cb 5f 28 02 36 0c 2b 2b eb e1 c9 3e 0d cd 9b 35 08 d8 3e 0d e5 29 18 b3 cd fe 23 08 3e 02 cd 9b`

```text
0x082370: d0                 ret nc
0x082371: af                 xor a
0x082372: 32 f9 05 d0        ld (0xd005f9), a  ; ?OP1+1
0x082376: 32 fa 05 d0        ld (0xd005fa), a  ; ?OP1+2
0x08237a: cd ed 20 08        call 0x0820ed
0x08237e: 18 c4              jr 0x082344
0x082380: 3e 0c              ld a, 0x0c
0x082382: 21 12 00 00        ld hl, 0x000012
0x082386: c3 d9 22 08        jp 0x0822d9
0x08238a: af                 xor a
0x08238b: 21 09 00 00        ld hl, 0x000009
0x08238f: 18 f5              jr 0x082386  ; <- shared entry point
0x082391: 3e 01              ld a, 0x01
0x082393: cd 9b 35 08        call 0x08359b
0x082397: d8                 ret c
0x082398: 3e 01              ld a, 0x01
0x08239a: e5                 push hl
0x08239b: f5                 push af
0x08239c: 3a f9 05 d0        ld a, (0xd005f9)  ; ?OP1+1
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
0x0823cc: 3a 19 06 d0        ld a, (0xd00619)  ; ?OP4
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
```

## CreateReal impl 0x08238A (overlap)

Raw ROM bytes (64 bytes from 0x08238a):

`af 21 09 00 00 18 f5 3e 01 cd 9b 35 08 d8 3e 01 e5 f5 3a f9 05 d0 fe 5d 28 0e fe 24 28 0a fe 3a 28 06 fe 72 c2 46 1d 06 f1 cd c9 22 08 c1 e5 c5 e1 78 b1 20 06 12 13 12 1b e1 c9 eb 73 23 72 23`

```text
0x08238a: af                 xor a
0x08238b: 21 09 00 00        ld hl, 0x000009
0x08238f: 18 f5              jr 0x082386  ; <- shared entry point
0x082391: 3e 01              ld a, 0x01
0x082393: cd 9b 35 08        call 0x08359b
0x082397: d8                 ret c
0x082398: 3e 01              ld a, 0x01
0x08239a: e5                 push hl
0x08239b: f5                 push af
0x08239c: 3a f9 05 d0        ld a, (0xd005f9)  ; ?OP1+1
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
```

## RAM LD references

### Absolute-address LDs (0xD00000-0xD1FFFF)

| Address | Symbol | Access | Width | Site(s) |
|---|---|---|---:|---|
| `0xd005f9` | `?OP1+1` | read | 8 | `0x08234e ld a, (0xd005f9)`<br>`0x08239c ld a, (0xd005f9)` |
| `0xd005f9` | `?OP1+1` | write | 8 | `0x082372 ld (0xd005f9), a` |
| `0xd005fa` | `?OP1+2` | write | 8 | `0x082376 ld (0xd005fa), a` |
| `0xd005fb` | `?OP1+3` | read | 24 | `0x082344 ld de, (0xd005fb)` |
| `0xd005fb` | `?OP1+3` | write | 24 | `0x08236c ld (0xd005fb), de` |
| `0xd00619` | `?OP4` | read | 8 | `0x0823cc ld a, (0xd00619)` |

### IX-relative LDs resolved with `IX = 0xD1A860`

(none found)

### IY-relative LDs resolved with `IY = 0xD00080`

(none found)

## Reads-before-write analysis

RAM addresses read before any write in the same block (these must be pre-initialized):

### Context before entry (other CreateXxx)

| Address | Symbol | Via | First read at |
|---|---|---|---|
| `0xd005fb` | `?OP1+3` | absolute | `0x082344 ld de, (0xd005fb)` |
| `0xd005f9` | `?OP1+1` | absolute | `0x08234e ld a, (0xd005f9)` |

### CreateReal region 0x082370

| Address | Symbol | Via | First read at |
|---|---|---|---|
| `0xd00619` | `?OP4` | absolute | `0x0823cc ld a, (0xd00619)` |

### CreateReal impl 0x08238A (overlap)

| Address | Symbol | Via | First read at |
|---|---|---|---|
| `0xd005f9` | `?OP1+1` | absolute | `0x08239c ld a, (0xd005f9)` |

## Call/jump targets

Unique call/jump targets found across all blocks:

### Calls

| Target | Called from |
|---|---|
| `0x07f8a2` | `0x082359` (Context before entry (other CreateXxx)) |
| `0x0820ed` | `0x08237a` (CreateReal region 0x082370) |
| `0x0820f1` | `0x082340` (Context before entry (other CreateXxx)) |
| `0x0821b9` | `0x082354` (Context before entry (other CreateXxx)) |
| `0x0822c9` | `0x0823b3` (CreateReal region 0x082370), `0x0823b3` (CreateReal impl 0x08238A (overlap)) |
| `0x0823fe` | `0x0823e8` (CreateReal region 0x082370) |
| `0x082bbe` | `0x08234a` (Context before entry (other CreateXxx)) |
| `0x08359b` | `0x082393` (CreateReal region 0x082370), `0x0823dd` (CreateReal region 0x082370), `0x0823ee` (CreateReal region 0x082370), `0x082393` (CreateReal impl 0x08238A (overlap)) |

### Jumps

| Target | From |
|---|---|
| `0x061d46` | `0x0823ae` (CreateReal region 0x082370), `0x0823ae` (CreateReal impl 0x08238A (overlap)) |
| `0x0822d9` | `0x082386` (CreateReal region 0x082370) |
| `0x082344` | `0x08237e` (CreateReal region 0x082370) |
| `0x082386` | `0x08238f` (CreateReal region 0x082370), `0x08238f` (CreateReal impl 0x08238A (overlap)) |
| `0x08239b` | `0x0823e6` (CreateReal region 0x082370) |
| `0x0823b2` | `0x0823a2` (CreateReal region 0x082370), `0x0823a6` (CreateReal region 0x082370), `0x0823aa` (CreateReal region 0x082370), `0x0823a2` (CreateReal impl 0x08238A (overlap)), `0x0823a6` (CreateReal impl 0x08238A (overlap)), `0x0823aa` (CreateReal impl 0x08238A (overlap)) |
| `0x0823c5` | `0x0823bd` (CreateReal region 0x082370), `0x0823bd` (CreateReal impl 0x08238A (overlap)) |
| `0x0823d6` | `0x0823d2` (CreateReal region 0x082370) |

## Key Findings

### Q1: What does code at 0x082386 do with A=0 and HL=9?

At 0x082386: `jp 0x0822d9`

Instruction sequence from 0x082386:
```
0x082386: jp 0x0822d9
0x08238a: xor a
0x08238b: ld hl, 0x000009
0x08238f: jr 0x082386
0x082391: ld a, 0x01
0x082393: call 0x08359b
0x082397: ret c
0x082398: ld a, 0x01
0x08239a: push hl
0x08239b: push af
0x08239c: ld a, (0xd005f9)
0x0823a0: cp 0x5d
```

### Q2: Does A=0 bypass the type check at 0x08239c?

At 0x08239c: `ld a, (0xd005f9)`

Type-check sequence:
```
0x082397: ret c
0x082398: ld a, 0x01
0x08239a: push hl
0x08239b: push af
0x08239c: ld a, (0xd005f9)
0x0823a0: cp 0x5d
0x0823a2: jr z, 0x0823b2
0x0823a4: cp 0x24
0x0823a6: jr z, 0x0823b2
0x0823a8: cp 0x3a
0x0823aa: jr z, 0x0823b2
0x0823ac: cp 0x72
0x0823ae: jp nz, 0x061d46
0x0823b2: pop af
0x0823b3: call 0x0822c9
0x0823b7: pop bc
```

Analysis: A=0 means a read from OP1+1 is loaded into A. The `or a` / `cp` sequence 
determines whether the variable name starts with a special prefix byte. A=0 at entry 
is the INITIAL register state, but it gets overwritten by the OP1+1 read before the compare.

### Q3: What other CreateXxx entries share code near 0x082370?

Entries in the 0x082340-0x082370 region:
```
0x082340: cd f1 20 08        call 0x0820f1
0x082344: ed 5b fb 05 d0     ld de, (0xd005fb)
0x082349: c9                 ret
0x08234a: cd be 2b 08        call 0x082bbe
0x08234e: 3a f9 05 d0        ld a, (0xd005f9)
0x082352: fe 24              cp 0x24
0x082354: cd b9 21 08        call 0x0821b9
0x082358: d5                 push de
0x082359: cd a2 f8 07        call 0x07f8a2
0x08235d: 11 00 06 d0        ld de, 0xd00600
0x082361: 21 fb 05 d0        ld hl, 0xd005fb
0x082365: 01 03 00 00        ld bc, 0x000003
0x082369: ed b8              lddr
0x08236b: d1                 pop de
0x08236c: ed 53 fb 05 d0     ld (0xd005fb), de
```

Look for `xor a` / `ld a, N` patterns followed by `jr` to 0x082386 — 
these are other CreateXxx entry points that share the same dispatcher at 0x082386.

### Q4: What does the OP4 (0xD00619) read do?

At 0x0823cc: `ld a, (0xd00619)`


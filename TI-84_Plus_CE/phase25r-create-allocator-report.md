# Phase 25R - Shared Create allocator static disassembly

## Scope

- Main target: `0x0822D9` for 256 bytes.
- Secondary target: `0x08359B` for 64 bytes.
- Decoder: `decodeInstruction(romBytes, pc, "adl")` from `ez80-decoder.js`.
- Short-mode absolute references (`sis` / `lis`) are resolved against `MBASE = 0xD0`, so `0x2596` is reported as `0xD02596`.

## Direct answers

### 1. What does `0x0822D9` do with `A=type` and `HL=size`?

- `0x0822D9` immediately stores the incoming type byte into `OP1[0]` via `ld (0xD005F8), a`.
- `0x0822DD` calls `0x080084`. If that helper leaves `Z=1`, execution jumps straight to `0x0822F8` and uses `0x0820CD` to derive a small count/value in `A` from the name bytes.
- If the type guard does not set `Z`, the allocator reads `OP1+1`. A `]`-prefixed name stays on the `0x0822EB` path, uses `0x0820CD`, rejects `A >= 7` by jumping to `0x061D1A`, then increments `A`. Any other prefix branches to `0x08234A`, the alternate Create path already seen in the phase25q probe.
- The computed `A` value is pushed at `0x0822FC`. The incoming `HL` is preserved until `call 0x082BBE`; that helper uses `HL` while ultimately returning with `BC = original HL`, so the caller-supplied size (`9` for CreateReal, `18` for CreateCplx) is what the subsequent `call 0x0821B9` uses.
- After `0x0821B9`, the routine snapshots the resulting pointer through `DE` into `OP1+3`, clears `OP1+2`, restores the saved count into `OP1+6`, turns that count into `BC = count + 7`, calls `0x0820F1`, reloads `DE` from `OP1+3`, and returns.

### 2. Which RAM addresses does it read?

- Reads-before-write in the allocator window: `0xd005f9` (`OP1+1`), `0xd00619` (`OP4`).
- Reads-before-write in the `0x08359B` helper window: `0xd02596` (`pTempCnt`).
- The full read/write tables are below; the seed list is the minimum set that must exist before a dynamic probe enters these windows.

### 3. Does it call `0x08359B` or any other known subroutine?

- `0x0822D9` itself does not call `0x08359B`. Its direct calls in the 256-byte body are `0x080084`, `0x0820CD`, `0x082BBE`, `0x0821B9`, `0x07F8A2`, and `0x0820F1`.
- The sibling Create entry points immediately after the allocator body do call `0x08359B`: `0x082393`, `0x0823DD`, and `0x0823EE`.
- The `0x08359B` window is not the allocator itself; it is a temp-name helper. It increments `pTempCnt`, mirrors that counter into `OP1+2`, writes `$` into `OP1+1`, calls `0x0846EA (FindSym)`, then either returns immediately or continues into collision / relocation logic through `0x08285F`, `0x08283D`, and `0x083615`.

### 4. What does it write to the VAT area (`symTable` region near `0xD3FFFF`)?

- No direct VAT-region write appears in either probed window.
- VAT traversal starts deeper in `0x0846EA (FindSym)`, which loads `HL = 0xD3FFFF`; that call is outside the 64-byte `0x08359B` probe window.

### 5. Where does it return?

- Normal allocator return: `0x082349: ret`, immediately after `ld de, (0xD005FB)`, so `DE` is the value returned to the caller.
- Explicit allocator error exits in the 256-byte window: `0x0822F1: jp nc, 0x061D1A` and the nested `0x082BB9 -> jp 0x061D3E` path reached through `0x082BBE` on carry.
- `0x08359B` has an early restore-and-return at `0x0835BF: ret`; otherwise it branches onward to `0x083615`, which is outside the 64-byte probe window.

## RAM read/write table

### Shared Create allocator 0x0822D9

| Address | Symbol | Via | Access | Width | Site(s) |
|---|---|---|---|---:|---|
| `0xd005f8` | `OP1` | absolute | write | 8 | `0x0822d9 ld (0xd005f8), a` |
| `0xd005f9` | `OP1+1` | absolute | read | 8 | `0x0822e3 ld a, (0xd005f9)`<br>`0x08234e ld a, (0xd005f9)`<br>`0x08239c ld a, (0xd005f9)` |
| `0xd005f9` | `OP1+1` | absolute | write | 8 | `0x082330 ld (0xd005f9), a`<br>`0x082372 ld (0xd005f9), a` |
| `0xd005fa` | `OP1+2` | absolute | write | 8 | `0x082321 ld (0xd005fa), a`<br>`0x082327 ld (0xd005fa), a`<br>`0x082376 ld (0xd005fa), a` |
| `0xd005fb` | `OP1+3` | absolute | write | 24 | `0x08231b ld (0xd005fb), de`<br>`0x08236c ld (0xd005fb), de` |
| `0xd005fb` | `OP1+3` | absolute | read | 24 | `0x082344 ld de, (0xd005fb)` |
| `0xd005fd` | `OP1+5` | absolute | write | 8 | `0x08232c ld (0xd005fd), a` |
| `0xd005fe` | `OP1+6` | absolute | write | 8 | `0x082335 ld (0xd005fe), a` |
| `0xd00619` | `OP4` | absolute | read | 8 | `0x0823cc ld a, (0xd00619)` |

### CreateTemp helper 0x08359B

| Address | Symbol | Via | Access | Width | Site(s) |
|---|---|---|---|---:|---|
| `0xd005f9` | `OP1+1` | absolute | write | 8 | `0x0835b2 ld (0xd005f9), a` |
| `0xd005fa` | `OP1+2` | absolute | write | 16 | `0x0835a1 sis ld (0x0005fa), hl` |
| `0xd0068d` |  | absolute | write | 24 | `0x0835c7 ld (0xd0068d), hl` |
| `0xd02596` | `pTempCnt` | absolute | read | 16 | `0x08359d sis ld hl, (0x002596)` |
| `0xd02596` | `pTempCnt` | absolute | write | 16 | `0x0835ac sis ld (0x002596), hl` |

## Reads-before-write

These addresses are read before the local window writes them, so they are the immediate pre-seed candidates for future dynamic probes.

### Shared Create allocator 0x0822D9

| Address | Symbol | Via | First read |
|---|---|---|---|
| `0xd005f9` | `OP1+1` | absolute | `0x0822e3 ld a, (0xd005f9)` |
| `0xd00619` | `OP4` | absolute | `0x0823cc ld a, (0xd00619)` |

### CreateTemp helper 0x08359B

| Address | Symbol | Via | First read |
|---|---|---|---|
| `0xd02596` | `pTempCnt` | absolute | `0x08359d sis ld hl, (0x002596)` |

## Branch targets

### Shared Create allocator 0x0822D9

| From | Kind | Target | Name | Instruction |
|---|---|---|---|---|
| `0x0822dd` | call | `0x080084` | type guard | `call 0x080084` |
| `0x0822e1` | jr-conditional | `0x0822f8` |  | `jr z, 0x0822f8` |
| `0x0822e9` | jr-conditional | `0x08234a` | alternate Create path | `jr nz, 0x08234a` |
| `0x0822eb` | call | `0x0820cd` | special-name length helper | `call 0x0820cd` |
| `0x0822f1` | jp-conditional | `0x061d1a` | error handler (0x061D1A) | `jp nc, 0x061d1a` |
| `0x0822f6` | jr | `0x0822fc` |  | `jr 0x0822fc` |
| `0x0822f8` | call | `0x0820cd` | special-name length helper | `call 0x0820cd` |
| `0x0822fd` | call | `0x082bbe` | pointer/slot helper | `call 0x082bbe` |
| `0x082303` | call | `0x0821b9` | heap/VAT move helper | `call 0x0821b9` |
| `0x082308` | call | `0x07f8a2` |  | `call 0x07f8a2` |
| `0x082325` | jr | `0x082330` |  | `jr 0x082330` |
| `0x082340` | call | `0x0820f1` | allocator tail | `call 0x0820f1` |
| `0x08234a` | call | `0x082bbe` | pointer/slot helper | `call 0x082bbe` |
| `0x082354` | call | `0x0821b9` | heap/VAT move helper | `call 0x0821b9` |
| `0x082359` | call | `0x07f8a2` |  | `call 0x07f8a2` |
| `0x08237a` | call | `0x0820ed` |  | `call 0x0820ed` |
| `0x08237e` | jr | `0x082344` |  | `jr 0x082344` |
| `0x082386` | jp | `0x0822d9` |  | `jp 0x0822d9` |
| `0x08238f` | jr | `0x082386` |  | `jr 0x082386` |
| `0x082393` | call | `0x08359b` | CreateTemp | `call 0x08359b` |
| `0x0823a2` | jr-conditional | `0x0823b2` |  | `jr z, 0x0823b2` |
| `0x0823a6` | jr-conditional | `0x0823b2` |  | `jr z, 0x0823b2` |
| `0x0823aa` | jr-conditional | `0x0823b2` |  | `jr z, 0x0823b2` |
| `0x0823ae` | jp-conditional | `0x061d46` |  | `jp nz, 0x061d46` |
| `0x0823b3` | call | `0x0822c9` |  | `call 0x0822c9` |
| `0x0823bd` | jr-conditional | `0x0823c5` |  | `jr nz, 0x0823c5` |
| `0x0823d2` | jr-conditional | `0x0823d6` |  | `jr z, 0x0823d6` |

### CreateTemp helper 0x08359B

| From | Kind | Target | Name | Instruction |
|---|---|---|---|---|
| `0x0835a8` | jp-conditional | `0x061d3e` | error handler (0x061D3E) | `jp z, 0x061d3e` |
| `0x0835b6` | call | `0x0846ea` | FindSym | `call 0x0846ea` |
| `0x0835ba` | jr-conditional | `0x0835c0` |  | `jr nc, 0x0835c0` |
| `0x0835c3` | call | `0x08285f` | temp size helper | `call 0x08285f` |
| `0x0835d0` | call | `0x08283d` | temp follow-up helper | `call 0x08283d` |
| `0x0835d8` | jr-conditional | `0x083615` |  | `jr nc, 0x083615` |

## Full annotated disassembly

### Shared Create allocator 0x0822D9

Raw bytes (`256` bytes from `0x0822d9`):

`32 f8 05 d0 cd 84 00 08 28 15 3a f9 05 d0 fe 5d 20 5f cd cd 20 08 fe 07 d2 1a 1d 06 3c 18 04 cd cd 20 08 f5 cd be 2b 08 f6 01 cd b9 21 08 d5 cd a2 f8 07 11 06 06 d0 21 00 06 d0 01 08 00 00 ed b8 d1 ed 53 fb 05 d0 af 32 fa 05 d0 18 09 32 fa 05 d0 af 32 fd 05 d0 32 f9 05 d0 f1 32 fe 05 d0 c6 07 01 00 00 00 4f cd f1 20 08 ed 5b fb 05 d0 c9 cd be 2b 08 3a f9 05 d0 fe 24 cd b9 21 08 d5 cd a2 f8 07 11 00 06 d0 21 fb 05 d0 01 03 00 00 ed b8 d1 ed 53 fb 05 d0 af 32 f9 05 d0 32 fa 05 d0 cd ed 20 08 18 c4 3e 0c 21 12 00 00 c3 d9 22 08 af 21 09 00 00 18 f5 3e 01 cd 9b 35 08 d8 3e 01 e5 f5 3a f9 05 d0 fe 5d 28 0e fe 24 28 0a fe 3a 28 06 fe 72 c2 46 1d 06 f1 cd c9 22 08 c1 e5 c5 e1 78 b1 20 06 12 13 12 1b e1 c9 eb 73 23 72 23 36 00 3a 19 06 d0 cb 5f 28 02 36 0c 2b 2b eb`

```text
0x0822d9: 32 f8 05 d0        ld (0xd005f8), a  ; OP1
0x0822dd: cd 84 00 08        call 0x080084  ; type guard
0x0822e1: 28 15              jr z, 0x0822f8
0x0822e3: 3a f9 05 d0        ld a, (0xd005f9)  ; OP1+1
0x0822e7: fe 5d              cp 0x5d
0x0822e9: 20 5f              jr nz, 0x08234a  ; alternate Create path
0x0822eb: cd cd 20 08        call 0x0820cd  ; special-name length helper
0x0822ef: fe 07              cp 0x07
0x0822f1: d2 1a 1d 06        jp nc, 0x061d1a  ; error handler (0x061D1A)
0x0822f5: 3c                 inc a
0x0822f6: 18 04              jr 0x0822fc
0x0822f8: cd cd 20 08        call 0x0820cd  ; special-name length helper
0x0822fc: f5                 push af
0x0822fd: cd be 2b 08        call 0x082bbe  ; pointer/slot helper
0x082301: f6 01              or 0x01
0x082303: cd b9 21 08        call 0x0821b9  ; heap/VAT move helper
0x082307: d5                 push de
0x082308: cd a2 f8 07        call 0x07f8a2
0x08230c: 11 06 06 d0        ld de, 0xd00606
0x082310: 21 00 06 d0        ld hl, 0xd00600
0x082314: 01 08 00 00        ld bc, 0x000008
0x082318: ed b8              lddr
0x08231a: d1                 pop de
0x08231b: ed 53 fb 05 d0     ld (0xd005fb), de  ; OP1+3
0x082320: af                 xor a
0x082321: 32 fa 05 d0        ld (0xd005fa), a  ; OP1+2
0x082325: 18 09              jr 0x082330
0x082327: 32 fa 05 d0        ld (0xd005fa), a  ; OP1+2
0x08232b: af                 xor a
0x08232c: 32 fd 05 d0        ld (0xd005fd), a  ; OP1+5
0x082330: 32 f9 05 d0        ld (0xd005f9), a  ; OP1+1
0x082334: f1                 pop af
0x082335: 32 fe 05 d0        ld (0xd005fe), a  ; OP1+6
0x082339: c6 07              add 0x07
0x08233b: 01 00 00 00        ld bc, 0x000000
0x08233f: 4f                 ld c, a
0x082340: cd f1 20 08        call 0x0820f1  ; allocator tail
0x082344: ed 5b fb 05 d0     ld de, (0xd005fb)  ; OP1+3
0x082349: c9                 ret
0x08234a: cd be 2b 08        call 0x082bbe  ; pointer/slot helper
0x08234e: 3a f9 05 d0        ld a, (0xd005f9)  ; OP1+1
0x082352: fe 24              cp 0x24
0x082354: cd b9 21 08        call 0x0821b9  ; heap/VAT move helper
0x082358: d5                 push de
0x082359: cd a2 f8 07        call 0x07f8a2
0x08235d: 11 00 06 d0        ld de, 0xd00600
0x082361: 21 fb 05 d0        ld hl, 0xd005fb
0x082365: 01 03 00 00        ld bc, 0x000003
0x082369: ed b8              lddr
0x08236b: d1                 pop de
0x08236c: ed 53 fb 05 d0     ld (0xd005fb), de  ; OP1+3
0x082371: af                 xor a
0x082372: 32 f9 05 d0        ld (0xd005f9), a  ; OP1+1
0x082376: 32 fa 05 d0        ld (0xd005fa), a  ; OP1+2
0x08237a: cd ed 20 08        call 0x0820ed
0x08237e: 18 c4              jr 0x082344
0x082380: 3e 0c              ld a, 0x0c
0x082382: 21 12 00 00        ld hl, 0x000012
0x082386: c3 d9 22 08        jp 0x0822d9
0x08238a: af                 xor a
0x08238b: 21 09 00 00        ld hl, 0x000009
0x08238f: 18 f5              jr 0x082386
0x082391: 3e 01              ld a, 0x01
0x082393: cd 9b 35 08        call 0x08359b  ; CreateTemp
0x082397: d8                 ret c
0x082398: 3e 01              ld a, 0x01
0x08239a: e5                 push hl
0x08239b: f5                 push af
0x08239c: 3a f9 05 d0        ld a, (0xd005f9)  ; OP1+1
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
0x0823ca: 36 00              ld (hl), 0x00
0x0823cc: 3a 19 06 d0        ld a, (0xd00619)  ; OP4
0x0823d0: cb 5f              bit 3, a
0x0823d2: 28 02              jr z, 0x0823d6
0x0823d4: 36 0c              ld (hl), 0x0c
0x0823d6: 2b                 dec hl
0x0823d7: 2b                 dec hl
0x0823d8: eb                 ex de, hl
```

### CreateTemp helper 0x08359B

Raw bytes (`64` bytes from `0x08359b`):

`e5 f5 40 2a 96 25 40 22 fa 05 23 7c b5 ca 3e 1d 06 40 22 96 25 3e 24 32 f9 05 d0 cd ea 46 08 30 04 f1 e1 b7 c9 cb be eb cd 5f 28 08 22 8d 06 d0 f1 c1 f5 c5 d5 cd 3d 28 08 e1 52 ed 52 30 3b 19`

```text
0x08359b: e5                 push hl
0x08359c: f5                 push af
0x08359d: 40 2a 96 25        sis ld hl, (0x002596)  ; pTempCnt, resolves 0xd02596
0x0835a1: 40 22 fa 05        sis ld (0x0005fa), hl  ; OP1+2, resolves 0xd005fa
0x0835a5: 23                 inc hl
0x0835a6: 7c                 ld a, h
0x0835a7: b5                 or l
0x0835a8: ca 3e 1d 06        jp z, 0x061d3e  ; error handler (0x061D3E)
0x0835ac: 40 22 96 25        sis ld (0x002596), hl  ; pTempCnt, resolves 0xd02596
0x0835b0: 3e 24              ld a, 0x24
0x0835b2: 32 f9 05 d0        ld (0xd005f9), a  ; OP1+1
0x0835b6: cd ea 46 08        call 0x0846ea  ; FindSym
0x0835ba: 30 04              jr nc, 0x0835c0
0x0835bc: f1                 pop af
0x0835bd: e1                 pop hl
0x0835be: b7                 or a
0x0835bf: c9                 ret
0x0835c0: cb be              res 7, (hl)
0x0835c2: eb                 ex de, hl
0x0835c3: cd 5f 28 08        call 0x08285f  ; temp size helper
0x0835c7: 22 8d 06 d0        ld (0xd0068d), hl
0x0835cb: f1                 pop af
0x0835cc: c1                 pop bc
0x0835cd: f5                 push af
0x0835ce: c5                 push bc
0x0835cf: d5                 push de
0x0835d0: cd 3d 28 08        call 0x08283d  ; temp follow-up helper
0x0835d4: e1                 pop hl
0x0835d5: 52 ed 52           sil sbc hl, de
0x0835d8: 30 3b              jr nc, 0x083615
0x0835da: 19                 add hl, de
```


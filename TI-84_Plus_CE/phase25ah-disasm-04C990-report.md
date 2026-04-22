# Phase 25AH - Disassembly of 0x04C990

## Scope

- Probe: `TI-84_Plus_CE/probe-phase25ah-disasm-04C990.mjs`
- ROM window: `0x04C950..0x04CA4F`
- Decoder: `decodeInstruction(ROM.rom, pc, "adl")`
- Cross-check targets requested by the task:
  - `0x08C331` = `CoorMon`
  - `0x08C72F` = `CoorMon dispatch sub`
  - `0x08C79F` = `NewContext`
  - `0x08C7AD` = `NewContext0`
  - `0x058241` = home-screen handler
  - `0x099914` = `ParseInp`
  - `0x08238A` = `CreateReal`
  - `0x001881` = RAM CLEAR

## Direct answer

`0x04C990` is **not** a `cxCurApp`-zeroing routine.

It is a standalone 12-byte helper bounded by `RET` at `0x04C99B`:

```text
0x04C990  push hl
0x04C991  ld hl, 0x000000
0x04C995  or a
0x04C996  sbc hl, bc
0x04C998  push hl
0x04C999  pop bc
0x04C99A  pop hl
0x04C99B  ret
```

That computes `BC = 0 - BC`. It only touches stack plus `HL/BC/flags`. There is no write to `0xD007E0` (`cxCurApp`) or `0xD007CA` (`cxMain`) anywhere in the `0x04C950..0x04CA4F` window.

## Function boundaries

The window is a dense helper cluster with many tiny RET-delimited routines. The relevant boundaries are:

| Range | Likely role |
| --- | --- |
| `0x04C973..0x04C978` | small `HL-DE` compare helper |
| `0x04C979..0x04C97F` | prefixed variant of the compare helper |
| `0x04C980..0x04C98F` | range / compare helper with carry fixup |
| `0x04C990..0x04C99B` | **negate `BC` helper** |
| `0x04C99C..0x04C9A7` | sibling negate `DE` helper |
| `0x04C9A8..0x04C9C4` | `signExtTemp` scratch helper |
| `0x04C9C5..0x04C9D8` | zero-scan / length helper |
| `0x04C9D9..0x04C9E0` | byte-compare loop |

So `0x04C990` is part of an **arithmetic / pointer-adjust helper family**, not the CoorMon dispatch or context-switch family.

## Why `cxCurApp` is not being zeroed here

Static disassembly falsifies the direct-zero hypothesis:

- No `ld (0xD007E0), a`
- No `ld (0xD007CA), hl`
- No `ld a, (0xD007E0)`
- No `ld hl, (0xD007CA)`
- No direct `CALL`/`JP` inside this window to `CoorMon`, `NewContext`, `NewContext0`, the home-screen handler, `ParseInp`, `CreateReal`, or RAM CLEAR

The five known CoorMon read sites still decode exactly as `ld a, (0xD007E0)` at:

- `0x08C408`
- `0x08C4C7`
- `0x08C59C`
- `0x08C5C8`
- `0x08C5E7`

That means the `0x04C990` helper is **outside** the active-app dispatch logic. If a runtime watchpoint reported `cxCurApp` changing with `PC=0x04C990`, the zero must be:

1. Indirectly attributed from a caller block, or
2. Coming from some other overlapping RAM-moving code path, not from the `0x04C990` instructions themselves

This is not a deliberate context switch, not `NewContext`, and not an explicit app cleanup store.

## What leads to this code path

Whole-ROM xrefs to `0x04C990` are:

- `0x082198`
- `0x08221E`
- `0x082237`
- `0x08272C`
- `0x08322E`
- `0x02796F`
- `0x091D9A`
- `0x021DA8` as a direct `JP`

The important ones are the `0x0821xx` and `0x08272C` callers:

- `0x08221E` and `0x082237` are both inside **InsertMem**
- `0x082198` is in the allocator path just after saving `newDataPtr`
- `0x08272C` is in the post-move pointer-adjust pipeline

So reaching `0x04C990` means the OS is already in **allocator / heap / VAT / editor pointer-adjustment work**. The helper exists to turn a positive size in `BC` into a negative delta before downstream pointer-adjust code uses it.

That matches prior static findings around InsertMem:

- `InsertMem -> call 0x04C990 -> store negated BC -> adjust pointer slots`
- the adjacent `0x04C9A8` helper uses `signExtTemp` scratch RAM at `0xD02AD7..0xD02AD9`

## What conditions or branches matter

There is **no branch inside `0x04C990` itself**. It is straight-line arithmetic.

The only meaningful branches are in the callers, especially InsertMem:

- `0x0821FA: jr z, 0x082235`
  - selects the short path
- `0x08220D: jr z, 0x082236`
  - skips the secondary `LDDR` when `newDataPtr == DE`
- `0x08282C: ret nc`
  - the later pointer-adjust helper skips an update when `ptr >= DE`

Proper OS state can change which **InsertMem** branch executes, but it cannot turn `0x04C990` into a `cxCurApp` clear. The corrective conclusion is:

- focus on **why CoorMon/home-screen dispatch reaches allocator/memory-move code**
- or re-check the runtime watchpoint attribution
- do **not** treat `0x04C990` as a context-reset site

## Conclusion

`0x04C990` belongs to a RET-delimited arithmetic helper cluster and specifically implements `BC = -BC`. It does not read or write `cxCurApp` or `cxMain`, and it is reached from allocator / InsertMem style callers rather than from CoorMon / NewContext context code. The most defensible interpretation is that the reported `cxCurApp` zero at `PC=0x04C990` was misattributed; this helper is not the zeroing mechanism.

## Probe output

Command run:

```text
node TI-84_Plus_CE/probe-phase25ah-disasm-04C990.mjs
```

Stdout:

```text
Phase 25AH - 0x04C990 disassembly
Window: 0x04C950..0x04CA4F
Target helper: 0x04C990

Direct cx writes inside this window:
- cxCurApp 0xD007E0 via "ld (0xD007E0), a": (none)
- cxMain 0xD007CA via "ld (0xD007CA), hl": (none)
Direct cx reads inside this window:
- cxCurApp 0xD007E0 via "ld a, (0xD007E0)": (none)
- cxMain 0xD007CA via "ld hl, (0xD007CA)": (none)

Whole-ROM direct xrefs to 0x04C990:
- call 0x04C990: 0x02796F (generic arithmetic helper caller), 0x082198 (allocator path after newDataPtr save), 0x08221E (InsertMem full path after LDDR), 0x082237 (InsertMem short Z path), 0x08272C (InsertMem post-move pointer-adjust path), 0x08322E (editor/data-shift helper), 0x091D9A (block-move tail helper)
- jp 0x04C990: 0x021DA8 (jump alias into the negate-BC helper)

Known CoorMon cxCurApp read sites:
- 0x08C408  3A E0 07 D0    ld a, (0xD007E0)
- 0x08C4C7  3A E0 07 D0    ld a, (0xD007E0)
- 0x08C59C  3A E0 07 D0    ld a, (0xD007E0)
- 0x08C5C8  3A E0 07 D0    ld a, (0xD007E0)
- 0x08C5E7  3A E0 07 D0    ld a, (0xD007E0)

RET-delimited helper boundaries in this window:
- 0x04C950..0x04C962
- 0x04C963..0x04C972
- 0x04C973..0x04C978
- 0x04C979..0x04C97F
- 0x04C980..0x04C98F
- 0x04C990..0x04C99B <-- contains 0x04C990
- 0x04C99C..0x04C9A7
- 0x04C9A8..0x04C9C4
- 0x04C9C5..0x04C9D8
- 0x04C9D9..0x04C9E0
- 0x04C9E1..0x04C9E9
- 0x04C9EA..0x04C9FC
- 0x04C9FD..0x04CA1A
- 0x04CA1B..0x04CA20
- 0x04CA21..0x04CA25
- 0x04CA26..0x04CA27
- 0x04CA28..0x04CA40
- 0x04CA41..0x04CA4F

Disassembly:
0x04C950  3E 0A                  ld a, 0x0A
0x04C952  C5                     push bc
0x04C953  4F                     ld c, a
0x04C954  97                     sub a
0x04C955  06 10                  ld b, 0x10
0x04C957  52 29                  sil add hl, hl
0x04C959  17                     rla
0x04C95A  B9                     cp c
0x04C95B  38 02                  jr c, 0x04C95F
0x04C95D  91                     sub c
0x04C95E  2C                     inc l
0x04C95F  10 F6                  djnz 0x04C957
0x04C961  C1                     pop bc
0x04C962  C9                     ret
0x04C963  C5                     push bc
0x04C964  4F                     ld c, a
0x04C965  97                     sub a
0x04C966  06 18                  ld b, 0x18
0x04C968  29                     add hl, hl
0x04C969  17                     rla
0x04C96A  B9                     cp c
0x04C96B  38 02                  jr c, 0x04C96F
0x04C96D  91                     sub c
0x04C96E  2C                     inc l
0x04C96F  10 F7                  djnz 0x04C968
0x04C971  C1                     pop bc
0x04C972  C9                     ret
0x04C973  E5                     push hl
0x04C974  B7                     or a
0x04C975  ED 52                  sbc hl, de
0x04C977  E1                     pop hl
0x04C978  C9                     ret
0x04C979  E5                     push hl
0x04C97A  B7                     or a
0x04C97B  52 ED 52               sil sbc hl, de
0x04C97E  E1                     pop hl
0x04C97F  C9                     ret
0x04C980  B7                     or a
0x04C981  E5                     push hl
0x04C982  ED 42                  sbc hl, bc
0x04C984  38 07                  jr c, 0x04C98D
0x04C986  E1                     pop hl
0x04C987  E5                     push hl
0x04C988  D5                     push de
0x04C989  EB                     ex de, hl
0x04C98A  ED 52                  sbc hl, de
0x04C98C  D1                     pop de
0x04C98D  3F                     ccf
0x04C98E  E1                     pop hl
0x04C98F  C9                     ret
0x04C990  E5                     push hl
0x04C991  21 00 00 00            ld hl, 0x000000
0x04C995  B7                     or a
0x04C996  ED 42                  sbc hl, bc
0x04C998  E5                     push hl
0x04C999  C1                     pop bc
0x04C99A  E1                     pop hl
0x04C99B  C9                     ret
0x04C99C  E5                     push hl
0x04C99D  21 00 00 00            ld hl, 0x000000
0x04C9A1  B7                     or a
0x04C9A2  ED 52                  sbc hl, de
0x04C9A4  E5                     push hl
0x04C9A5  D1                     pop de
0x04C9A6  E1                     pop hl
0x04C9A7  C9                     ret
0x04C9A8  F5                     push af
0x04C9A9  22 D7 2A D0            ld (0xD02AD7), hl
0x04C9AD  3A D9 2A D0            ld a, (0xD02AD9)
0x04C9B1  CB 3F                  srl a
0x04C9B3  32 D9 2A D0            ld (0xD02AD9), a
0x04C9B7  CB 1C                  rr h
0x04C9B9  CB 1D                  rr l
0x04C9BB  40 22 D7 2A            sis ld (0x002AD7), hl
0x04C9BF  2A D7 2A D0            ld hl, (0xD02AD7)
0x04C9C3  F1                     pop af
0x04C9C4  C9                     ret
0x04C9C5  F5                     push af
0x04C9C6  E5                     push hl
0x04C9C7  01 00 00 00            ld bc, 0x000000
0x04C9CB  C5                     push bc
0x04C9CC  97                     sub a
0x04C9CD  ED B1                  cpir
0x04C9CF  E1                     pop hl
0x04C9D0  B7                     or a
0x04C9D1  ED 42                  sbc hl, bc
0x04C9D3  2B                     dec hl
0x04C9D4  E5                     push hl
0x04C9D5  C1                     pop bc
0x04C9D6  E1                     pop hl
0x04C9D7  F1                     pop af
0x04C9D8  C9                     ret
0x04C9D9  1A                     ld a, (de)
0x04C9DA  BE                     cp (hl)
0x04C9DB  C0                     ret nz
0x04C9DC  13                     inc de
0x04C9DD  23                     inc hl
0x04C9DE  10 F9                  djnz 0x04C9D9
0x04C9E0  C9                     ret
0x04C9E1  C5                     push bc
0x04C9E2  01 00 00 00            ld bc, 0x000000
0x04C9E6  4F                     ld c, a
0x04C9E7  09                     add hl, bc
0x04C9E8  C1                     pop bc
0x04C9E9  C9                     ret
0x04C9EA  CD B4 C8 04            call 0x04C8B4 ; save-HL-load-sign helper
0x04C9EE  3C                     inc a
0x04C9EF  FE 3B                  cp 0x3B
0x04C9F1  20 01                  jr nz, 0x04C9F4
0x04C9F3  3D                     dec a
0x04C9F4  CD 96 C8 04            call 0x04C896 ; store-HL-with-sign helper
0x04C9F8  26 00                  ld h, 0x00
0x04C9FA  2E 00                  ld l, 0x00
0x04C9FC  C9                     ret
0x04C9FD  D5                     push de
0x04C9FE  E5                     push hl
0x04C9FF  CD 12 DF 09            call 0x09DF12
0x04CA03  E1                     pop hl
0x04CA04  3A C7 25 D0            ld a, (0xD025C7)
0x04CA08  5F                     ld e, a
0x04CA09  CD B4 C8 04            call 0x04C8B4 ; save-HL-load-sign helper
0x04CA0D  BB                     cp e
0x04CA0E  28 01                  jr z, 0x04CA11
0x04CA10  3D                     dec a
0x04CA11  CD 96 C8 04            call 0x04C896 ; store-HL-with-sign helper
0x04CA15  26 FF                  ld h, 0xFF
0x04CA17  2E FF                  ld l, 0xFF
0x04CA19  D1                     pop de
0x04CA1A  C9                     ret
0x04CA1B  F5                     push af
0x04CA1C  7D                     ld a, l
0x04CA1D  6C                     ld l, h
0x04CA1E  67                     ld h, a
0x04CA1F  F1                     pop af
0x04CA20  C9                     ret
0x04CA21  20 03                  jr nz, 0x04CA26
0x04CA23  F6 01                  or 0x01
0x04CA25  C9                     ret
0x04CA26  AF                     xor a
0x04CA27  C9                     ret
0x04CA28  F5                     push af
0x04CA29  D5                     push de
0x04CA2A  E5                     push hl
0x04CA2B  E5                     push hl
0x04CA2C  01 00 00 00            ld bc, 0x000000
0x04CA30  C5                     push bc
0x04CA31  CD 16 53 05            call 0x055316
0x04CA35  C1                     pop bc
0x04CA36  CD D4 4D 05            call 0x054DD4
0x04CA3A  C1                     pop bc
0x04CA3B  E5                     push hl
0x04CA3C  C1                     pop bc
0x04CA3D  E1                     pop hl
0x04CA3E  D1                     pop de
0x04CA3F  F1                     pop af
0x04CA40  C9                     ret
0x04CA41  DD E5                  push ix
0x04CA43  DD 21 00 00 00         ld ix, 0x000000
0x04CA48  DD 39                  add ix, sp
0x04CA4A  DD 17 06               ld de, (ix+6)
0x04CA4D  DD 27 09               ld hl, (ix+9)
```

Note: the command also emitted Node's standard module-type warning for `ez80-decoder.js`; that warning is environment noise and not related to the ROM analysis.

# Phase 25AN - Disassembly of 0x0921CB and post-DisarmScroll ENTER continuation

Generated: 2026-04-24

## Sources

- `TI-84_Plus_CE/ROM.rom`, decoded in ADL mode with `TI-84_Plus_CE/ez80-decoder.js`
- `TI-84_Plus_CE/phase25h-a-jump-table-report.md`
  - `0x092FDD = GetLastEntryPtr`
  - `0x04C973 = CpHLDE`
  - `0x099910 = ParseCmd`
  - `0x099914 = ParseInp`
- `TI-84_Plus_CE/references/ti84pceg.inc`
  - `0xD01508 = lastEntryStkPtr`
  - `0xD0150B = lastEntryStk`
  - `0xD01D0B = numLastEntries`
  - `0xD01D0C = currLastEntry`

## Part A - 0x0921CB

### Disassembly excerpt

```text
0x0921CB  CD 4B 38 08          call 0x08384B
0x0921CF  3A 0B 1D D0          ld a, (0xD01D0B)
0x0921D3  B7                   or a
0x0921D4  C8                   ret z
0x0921D5  E5                   push hl
0x0921D6  D5                   push de
0x0921D7  CD 97 01 08          call 0x080197
0x0921DB  E5                   push hl
0x0921DC  3E 02                ld a, 0x02
0x0921DE  CD DD 2F 09          call 0x092FDD
0x0921E2  EB                   ex de, hl
0x0921E3  21 0B 18 D0          ld hl, 0xD0180B
0x0921E7  B7                   or a
0x0921E8  ED 52                sbc hl, de
0x0921EA  D1                   pop de
0x0921EB  B7                   or a
0x0921EC  52 ED 52             sil sbc hl, de
0x0921EF  30 09                jr nc, 0x0921FA
0x0921F1  E1                   pop hl
0x0921F2  3E 01                ld a, 0x01
0x0921F4  CD 7F 22 09          call 0x09227F
0x0921F8  E1                   pop hl
0x0921F9  C9                   ret
0x0921FA  D5                   push de
0x0921FB  21 0B 15 D0          ld hl, 0xD0150B
0x0921FF  CD CB 2F 09          call 0x092FCB
0x092203  CD B6 2F 09          call 0x092FB6
0x092207  EB                   ex de, hl
0x092208  C1                   pop bc
0x092209  E1                   pop hl
0x09220A  C5                   push bc
0x09220B  03                   inc bc
0x09220C  03                   inc bc
0x09220D  ED B0                ldir
0x09220F  C1                   pop bc
0x092210  40 2A E6 08          sis ld hl, (0x0008E6)
0x092214  52 09                sil add hl, bc
0x092216  40 22 E6 08          sis ld (0x0008E6), hl
0x09221A  3E 01                ld a, 0x01
0x09221C  CD 7F 22 09          call 0x09227F
0x092220  CD 26 22 09          call 0x092226
0x092224  E1                   pop hl
0x092225  C9                   ret
0x092226  40 ED 5B E6 08       sis ld de, (0x0008E6)
0x09222B  13                   inc de
0x09222C  13                   inc de
0x09222D  21 0B 1D D0          ld hl, 0xD01D0B
0x092231  ED 4B 08 15 D0       ld bc, (0xD01508)
0x092236  B7                   or a
0x092237  ED 42                sbc hl, bc
0x092239  CD 79 C9 04          call 0x04C979
0x09223D  30 0C                jr nc, 0x09224B
0x09223F  D5                   push de
0x092240  3A 0B 1D D0          ld a, (0xD01D0B)
0x092244  CD 7F 22 09          call 0x09227F
0x092248  D1                   pop de
0x092249  18 E2                jr 0x09222D
0x09224B  D5                   push de
0x09224C  11 0B 15 D0          ld de, 0xD0150B
0x092250  C5                   push bc
0x092251  E1                   pop hl
0x092252  C1                   pop bc
0x092253  C5                   push bc
0x092254  B7                   or a
0x092255  ED 52                sbc hl, de
0x092257  28 0C                jr z, 0x092265
0x092259  E5                   push hl
0x09225A  19                   add hl, de
0x09225B  2B                   dec hl
0x09225C  E5                   push hl
0x09225D  09                   add hl, bc
0x09225E  EB                   ex de, hl
0x09225F  E1                   pop hl
0x092260  C1                   pop bc
0x092261  28 02                jr z, 0x092265
0x092263  ED B8                lddr
0x092265  11 0B 15 D0          ld de, 0xD0150B
0x092269  C1                   pop bc
0x09226A  2A 08 15 D0          ld hl, (0xD01508)
0x09226E  09                   add hl, bc
0x09226F  22 08 15 D0          ld (0xD01508), hl
0x092273  21 E6 08 D0          ld hl, 0xD008E6
0x092277  ED B0                ldir
0x092279  21 0B 1D D0          ld hl, 0xD01D0B
0x09227D  34                   inc (hl)
0x09227E  C9                   ret
```

### Structure

1. `0x0921CB` begins with `call 0x08384B`, then immediately checks `numLastEntries`:
   - `ld a,(0xD01D0B)`
   - `or a`
   - `ret z`

2. If the count is nonzero, it saves `hl/de`, calls `0x080197`, then calls `0x092FDD` with `a=2`.
   - `0x092FDD` is `GetLastEntryPtr`
   - this is walking the `lastEntryStk` structure, not dispatching into the parser

3. It then compares the computed pointer/size state against `0xD0180B`.
   - if the compare fails, it calls `0x09227F` with `a=1` and returns
   - this is an eviction/removal path

4. If the compare succeeds, it copies data into the `lastEntryStk` area:
   - `call 0x092FCB`
   - `call 0x092FB6`
   - `ldir`
   - update scratch pointer at `0xD008E6`
   - `call 0x09227F`
   - `call 0x092226`
   - `ret`

5. Local helper `0x092226` is a "make room / insert" helper for the same history structure.
   - it computes available space between `lastEntryStkPtr` and the upper bound at `0xD01D0B`
   - while there is not enough room, it reloads `numLastEntries` and calls `0x09227F` to evict one entry
   - once room exists, it uses `lddr` / `ldir` to compact and append data
   - it updates `lastEntryStkPtr`
   - it ends with `inc (0xD01D0B)`

6. Local helper `0x09227F` is the matching remove/compact routine.
   - it calls `GetLastEntryPtr`
   - it compares pointers with `0x04C973` (`CpHLDE`)
   - it updates `lastEntryStkPtr`
   - it ends with `dec (0xD01D0B)`

### ParseInp / 0x097xxx check

- No direct `call 0x099914` appears anywhere in the `0x0921CB` cluster.
- No direct `call 0x0973C8` appears anywhere in the `0x0921CB` cluster.
- No `0x097xxx` call target appears at all in the `0x0921CB` disassembly above.
- No `PushErrorHandler` / `PopErrorHandler` setup appears here.

Conclusion for Part A:

`0x0921CB` is a `lastEntryStk` maintenance routine. It manages the "last entry" history buffer and its count byte. It is not the ENTER-to-ParseInp dispatcher.

## Part B - 0x05862F and the ENTER handler continuation

### Disassembly excerpt

```text
0x05862F  F1                   pop af
0x058630  20 38                jr nz, 0x05866A
0x058632  3A 0B 1D D0          ld a, (0xD01D0B)
0x058636  B7                   or a
0x058637  CA 65 8C 05          jp z, 0x058C65
0x05863B  CD B8 00 08          call 0x0800B8
0x05863F  28 0A                jr z, 0x05864B
0x058641  CD 81 FF 07          call 0x07FF81
0x058645  CD C6 81 05          call 0x0581C6
0x058649  18 14                jr 0x05865F
0x05864B  CD 4B 38 08          call 0x08384B
0x05864F  CD 6A E8 05          call 0x05E86A
0x058653  CD AE E3 05          call 0x05E3AE
0x058657  CD D8 E7 05          call 0x05E7D8
0x05865B  CD AE 81 05          call 0x0581AE
0x05865F  40 ED 5B 80 26       sis ld de, (0x002680)
0x058664  CD E6 8E 05          call 0x058EE6
0x058668  18 29                jr 0x058693
0x05866A  E5                   push hl
0x05866B  40 ED 5B 80 26       sis ld de, (0x002680)
0x058670  CD E6 8E 05          call 0x058EE6
0x058674  CD 7B FF 07          call 0x07FF7B
0x058678  CD 4F 38 08          call 0x08384F
0x05867C  11 F9 FF FF          ld de, 0xFFFFF9
0x058680  19                   add hl, de
0x058681  36 23                ld (hl), 0x23
0x058683  E1                   pop hl
0x058684  19                   add hl, de
0x058685  36 21                ld (hl), 0x21
0x058687  CD 4F 38 08          call 0x08384F
0x05868B  CD 4D E8 05          call 0x05E84D
0x05868F  CD 72 E8 05          call 0x05E872
0x058693  97                   sub a
0x058694  32 8D 05 D0          ld (0xD0058D), a
0x058698  FD CB 0C F6          set 6, (iy+12)
0x05869C  FD CB 00 EE          set 5, (iy+0)
0x0586A0  CD 76 8C 05          call 0x058C76
0x0586A4  FB                   ei
0x0586A5  CD 61 29 08          call 0x082961
0x0586A9  CD 5E 21 09          call 0x09215E
0x0586AD  40 ED 53 8C 26       sis ld (0x00268C), de
0x0586B2  40 22 8E 26          sis ld (0x00268E), hl
0x0586B6  CD 02 29 08          call 0x082902
0x0586BA  3E 02                ld a, 0x02
0x0586BC  FD CB 34 66          bit 4, (iy+52)
0x0586C0  C4 B3 39 02          call nz, 0x0239B3
0x0586C4  FD CB 45 86          res 0, (iy+69)
0x0586C8  FD CB 45 CE          set 1, (iy+69)
0x0586CC  20 25                jr nz, 0x0586F3
0x0586CE  FD CB 49 B6          res 6, (iy+73)
0x0586D2  CD D1 1F 0A          call 0x0A1FD1
0x0586D6  FD CB 02 8E          res 1, (iy+2)
0x0586DA  FD CB 44 96          res 2, (iy+68)
0x0586DE  FB                   ei
0x0586DF  CD DD 27 0A          call 0x0A27DD
0x0586E3  CD 10 99 09          call 0x099910
```

### Flow summary

1. Immediately after `call 0x0921CB`, the handler restores the saved `af` with `pop af`.

2. If the restored flags are NZ, it branches to `0x05866A`.
   - that branch edits bytes near `hl-7`
   - then calls `0x05E84D`
   - then calls `0x05E872`

3. If NZ is not set, the handler checks `numLastEntries`.
   - `0x058632  ld a,(0xD01D0B)`
   - `0x058637  jp z, 0x058C65`
   - so the entire post-`0x0921CB` path is explicitly gated by whether the history count is zero

4. The nonzero path then splits on `call 0x0800B8`.
   - NZ side: `0x07FF81 -> 0x0581C6 -> 0x058EE6`
   - Z side: `0x08384B -> 0x05E86A -> 0x05E3AE -> 0x05E7D8 -> 0x0581AE -> 0x058EE6`

5. The common tail at `0x058693` clears key state, sets a few `iy` flags, then later calls:
   - `0x082961`
   - `0x09215E`
   - `0x082902`
   - `0x0A27DD`
   - `0x099910`

### Important parse-related finding

Inside the requested `0x05862F..0x058680` window there is:

- no direct `call 0x099914`
- no direct `call 0x0973C8`
- no direct `0x097xxx` call at all

However, the larger continuation immediately after that window does eventually hit the parser front end:

```text
0x0586E3  CD 10 99 09          call 0x099910
0x099910  CD 81 FF 07          call 0x07FF81
0x099914  AF                   xor a          ; ParseInp entry
```

`0x099910` is `ParseCmd`, and it falls straight into `0x099914` (`ParseInp`) after a single helper call.

So the correct static answer is:

- `0x05862F..0x058680`: no direct ParseInp and no `0x0973C8`
- larger post-`0x0921CB` continuation: yes, it later enters ParseInp via `0x099910`, but still not via `0x0973C8`

### 0x097xxx check

- No `0x0973C8` call appears in this continuation.
- The first `0x097xxx` call I found later in the same handler is `0x05872F -> 0x097AD0`.
- That is not the known dual-ParseInp ENTER path at `0x0973C8`.

## Part C - What is 0xD01D0B?

### Symbol identity

`ti84pceg.inc` identifies the region as:

```text
0xD01508  lastEntryStkPtr
0xD0150B  lastEntryStk
0xD01D0B  numLastEntries
0xD01D0C  currLastEntry
```

This is strong evidence that `0xD01D0B` is not a boolean flag. It is a count byte for the `lastEntryStk` history buffer. `0xD01D0C` is the current history-selection index.

### All literal ROM references to 0xD01D0B

| Pattern offset | Instruction site | Instruction | Role |
| --- | --- | --- | --- |
| `0x04563E` | `0x04563C` | `xor a` / `ld (0xD01D0B),a` | explicit clear/reset to zero |
| `0x058633` | `0x058632` | `ld a,(0xD01D0B)` | ENTER-handler gate after `0x0921CB` |
| `0x0921D0` | `0x0921CF` | `ld a,(0xD01D0B)` | early return in `0x0921CB` if count is zero |
| `0x09222E` | `0x09222D` | `ld hl,0xD01D0B` | upper bound used while making room in `0x092226` |
| `0x092241` | `0x092240` | `ld a,(0xD01D0B)` | reload count before eviction loop |
| `0x09227A` | `0x092279` | `ld hl,0xD01D0B` / `inc (hl)` | increment count after insertion |
| `0x09229D` | `0x09229C` | `ld hl,0xD01D0B` / `dec (hl)` | decrement count after removal/compaction |
| `0x092966` | `0x092965` | `ld a,(0xD01D0B)` | helper returns Z when history is empty |
| `0x092D7E` | `0x092D7D` | `ld a,(0xD01D0B)` | compare `numLastEntries - 1` vs `currLastEntry` |
| `0x092F82` | `0x092F81` | `ld a,(0xD01D0B)` | compare count vs `currLastEntry` |
| `0x092FF9` | `0x092FF7` | `ld bc,(0xD01D0B)` | loads `numLastEntries` and `currLastEntry` together for iteration |

### What sets it?

Direct mutators found by static disassembly:

- `0x04563D  ld (0xD01D0B),a` after `xor a`
  - explicit clear to `0`
- `0x09227D  inc (hl)`
  - increments `numLastEntries` after insertion into `lastEntryStk`
- `0x0922A0  dec (hl)`
  - decrements `numLastEntries` after removal/compaction

I did not find any other direct literal store to `0xD01D0B` besides the clear-at-zero site above.

### What value does it normally hold?

Static answer only:

- `0` is the normal empty/reset value. The ROM has an explicit `xor a / ld (0xD01D0B),a` clear path at `0x04563C`.
- Positive values mean the `lastEntryStk` history buffer currently holds that many stored entries.
- Its paired byte `0xD01D0C` tracks the current selected history entry.

## Bottom line

- `0x0921CB` is a last-entry history maintenance routine, not a ParseInp dispatcher.
- The `0x05862F` continuation is gated by `numLastEntries`; if the count is zero it jumps away immediately.
- There is no direct `0x0973C8` call anywhere in the inspected post-DisarmScroll path.
- The first statically visible parser handoff after this region is later at `0x0586E3 -> 0x099910 -> 0x099914`.
- `0xD01D0B` is `numLastEntries`, a counter for the `lastEntryStk` history buffer; it is cleared to zero at `0x04563C`, incremented at `0x09227D`, and decremented at `0x0922A0`.

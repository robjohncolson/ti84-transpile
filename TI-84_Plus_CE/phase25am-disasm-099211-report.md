# Phase 25AM: Static disassembly of 0x099211

## Scope

- Disassembled 300 bytes starting at `0x099211` in eZ80 ADL mode.
- Recorded every `CALL` and `JP` target in that window.
- Expanded the local `0x099xxx` call targets `0x0992A4`, `0x0992C3`, and `0x0993DA` for 100 bytes each.
- Cross-checked jump-table names from `phase25h-a-jump-table-report.md`: `0x099211 = DisarmScroll`, `0x09923A = MinToEdit`, `0x09927F = RclVarToEdit`, `0x0992C3 = RclToQueue`.

## Full 300-byte listing

This is the full sequential decode for the 300-byte window starting at `0x099211`. The final decoded instruction starts at `0x09933A`, which is inside the 300-byte window and extends a few bytes past it.

```text
0x099211  FD CB 09 7E     bit       7, (iy+9)
0x099215  C4 EC 00 08     call      nz, 0x0800EC
0x099219  FD CB 09 BE     res       7, (iy+9)
0x09921D  FD CB 01 9E     res       3, (iy+1)
0x099221  FD CB 05 7E     bit       7, (iy+5)
0x099225  C8              ret       z
0x099226  2A 67 25 D0     ld        hl, (0xD02567)
0x09922A  ED 5B 6A 25 D0  ld        de, (0xD0256A)
0x09922F  1B              dec       de
0x099230  1B              dec       de
0x099231  CD 85 26 08     call      0x082685
0x099235  FD CB 05 BE     res       7, (iy+5)
0x099239  C9              ret
0x09923A  CD C3 72 09     call      0x0972C3
0x09923E  CD 95 87 09     call      0x098795
0x099242  2A 3A 24 D0     ld        hl, (0xD0243A)
0x099246  22 D6 08 D0     ld        (0xD008D6), hl
0x09924A  3A 8A 00 D0     ld        a, (0xD0008A)
0x09924E  32 8B 00 D0     ld        (0xD0008B), a
0x099252  3A F8 05 D0     ld        a, (0xD005F8)
0x099256  E6 3F           and       0x3F
0x099258  CD D9 01 08     call      0x0801D9
0x09925C  20 06           jr        nz, 0x099264
0x09925E  CD DA 93 09     call      0x0993DA
0x099262  18 0D           jr        0x099271
0x099264  CD A8 F7 07     call      0x07F7A8
0x099268  20 06           jr        nz, 0x099270
0x09926A  CD A4 92 09     call      0x0992A4
0x09926E  18 01           jr        0x099271
0x099270  37              scf
0x099271  CD A2 87 09     call      0x0987A2
0x099275  D8              ret       c
0x099276  2A D6 08 D0     ld        hl, (0xD008D6)
0x09927A  22 3A 24 D0     ld        (0xD0243A), hl
0x09927E  C9              ret
0x09927F  CD 50 2C 08     call      0x082C50
0x099283  EB              ex        de, hl
0x099284  EB              ex        de, hl
0x099285  CD C3 72 09     call      0x0972C3
0x099289  EB              ex        de, hl
0x09928A  FD CB 0C C6     set       0, (iy+12)
0x09928E  CD C3 92 09     call      0x0992C3
0x099292  CD A2 87 09     call      0x0987A2
0x099296  D8              ret       c
0x099297  2A D6 08 D0     ld        hl, (0xD008D6)
0x09929B  22 3A 24 D0     ld        (0xD0243A), hl
0x09929F  C9              ret
0x0992A0  3E 05           ld        a, 0x05
0x0992A2  18 E0           jr        0x099284
0x0992A4  FD CB 1B FE     set       7, (iy+27)
0x0992A8  3E 2B           ld        a, 0x2B
0x0992AA  CD 84 8B 09     call      0x098B84
0x0992AE  FD CB 1B BE     res       7, (iy+27)
0x0992B2  21 0F 25 D0     ld        hl, 0xD0250F
0x0992B6  CD 50 18 0B     call      0x0B1850
0x0992BA  01 10 25 D0     ld        bc, 0xD02510
0x0992BE  CD E0 E2 05     call      0x05E2E0
0x0992C2  C9              ret
0x0992C3  F5              push      af
0x0992C4  ED 5B 3A 24 D0  ld        de, (0xD0243A)
0x0992C9  ED 53 D6 08 D0  ld        (0xD008D6), de
0x0992CE  3A 8A 00 D0     ld        a, (0xD0008A)
0x0992D2  32 8B 00 D0     ld        (0xD0008B), a
0x0992D6  F1              pop       af
0x0992D7  22 87 06 D0     ld        (0xD00687), hl
0x0992DB  CD D9 01 08     call      0x0801D9
0x0992DF  20 08           jr        nz, 0x0992E9
0x0992E1  CD FB F9 07     call      0x07F9FB
0x0992E5  C3 DA 93 09     jp        0x0993DA
0x0992E9  CD A8 F7 07     call      0x07F7A8
0x0992ED  20 0A           jr        nz, 0x0992F9
0x0992EF  CD FB F9 07     call      0x07F9FB
0x0992F3  CD 07 FA 07     call      0x07FA07
0x0992F7  18 AB           jr        0x0992A4
0x0992F9  CD 2D 01 08     call      0x08012D
0x0992FD  20 4B           jr        nz, 0x09934A
0x0992FF  3E 08           ld        a, 0x08
0x099301  CD C0 E2 05     call      0x05E2C0
0x099305  D8              ret       c
0x099306  4E              ld        c, (hl)
0x099307  23              inc       hl
0x099308  46              ld        b, (hl)
0x099309  23              inc       hl
0x09930A  79              ld        a, c
0x09930B  B0              or        b
0x09930C  28 35           jr        z, 0x099343
0x09930E  C5              push      bc
0x09930F  CD FB F9 07     call      0x07F9FB
0x099313  CD A4 F7 07     call      0x07F7A4
0x099317  20 0B           jr        nz, 0x099324
0x099319  CD 07 FA 07     call      0x07FA07
0x09931D  E5              push      hl
0x09931E  CD A4 92 09     call      0x0992A4
0x099322  18 05           jr        0x099329
0x099324  E5              push      hl
0x099325  CD DA 93 09     call      0x0993DA
0x099329  3E 2B           ld        a, 0x2B
0x09932B  CD C0 E2 05     call      0x05E2C0
0x09932F  E1              pop       hl
0x099330  C1              pop       bc
0x099331  D8              ret       c
0x099332  0B              dec       bc
0x099333  79              ld        a, c
0x099334  B0              or        b
0x099335  20 D7           jr        nz, 0x09930E
0x099337  3E 09           ld        a, 0x09
0x099339  E5              push      hl
0x09933A  2A D6 08 D0     ld        hl, (0xD008D6)
```

## CALL targets found

| Target | Label | Called from |
| --- | --- | --- |
| `0x05E2C0` | queue helper | `0x099301`, `0x09932B` |
| `0x05E2E0` | queue helper | `0x0992BE` |
| `0x07F7A4` | type helper | `0x099313` |
| `0x07F7A8` | type helper | `0x099264`, `0x0992E9` |
| `0x07F9FB` | queue helper | `0x0992E1`, `0x0992EF`, `0x09930F` |
| `0x07FA07` | queue helper | `0x0992F3`, `0x099319` |
| `0x0800EC` | OS helper | `0x099215` (conditional `nz`) |
| `0x08012D` | helper | `0x0992F9` |
| `0x0801D9` | type check helper | `0x099258`, `0x0992DB` |
| `0x082685` | OS helper | `0x099231` |
| `0x082C50` | OS helper | `0x09927F` |
| `0x0972C3` | save edit cursor helper | `0x09923A`, `0x099285` |
| `0x098795` | edit helper | `0x09923E` |
| `0x0987A2` | post-dispatch helper | `0x099271`, `0x099292` |
| `0x098B84` | format helper | `0x0992AA` |
| `0x0992A4` | local `0x099xxx` target | `0x09926A`, `0x09931E` |
| `0x0992C3` | local `0x099xxx` target | `0x09928E` |
| `0x0993DA` | local `0x099xxx` target | `0x09925E`, `0x099325` |
| `0x0B1850` | format helper | `0x0992B6` |

## JP targets found

| Target | Jumped from |
| --- | --- |
| `0x0993DA` | `0x0992E5` |

## Watch checks

| Address | Meaning | Result in `0x099211..0x09933D` |
| --- | --- | --- |
| `0x099914` | ParseInp | not referenced |
| `0x0973C8` | ENTER dual-ParseInp path | not referenced |
| `0x0973BA` | buffer flush helper | not referenced |
| `0x061DEF` | PushErrorHandler | not referenced |
| `0x061DD1` | requested PopErrorHandler watch | not referenced |
| `0x061E20` | actual PopErrorHandler used by `0x0973C8` | not referenced |
| `0x05E872` | CloseEditEqu / tokenize edit buffer | not referenced |
| `0x08383D` | ChkFindSym | not referenced |

## Local 0x099xxx call graph

The local `0x099xxx` call targets in this window are:

- `0x0992A4`: type/format helper that sets `(iy+27).7`, loads `A = 0x2B`, calls `0x098B84`, then formats through `0x0B1850` and `0x05E2E0`.
- `0x0992C3`: `RclToQueue`; snapshots edit-related state, stores `HL` into `0xD00687`, branches through `0x0801D9` / `0x07F7A8`, and feeds either `0x0993DA` or `0x0992A4`.
- `0x0993DA`: formatting helper that calls `0x0987B7`, `0x0B184C`, and `0x05E2E0`. Its first 100 bytes still do not call `0x099914`.

No local call target in the inspected `0x099xxx` subgraph reaches `ParseInp`.

## What 0x099211 actually does

`0x099211` is `DisarmScroll`, not a parser entry. The function body is only `0x29` bytes long (`0x099211..0x099239`) and does this:

1. Test `(iy+9).7`; if set, call `0x0800EC`.
2. Clear `(iy+9).7`.
3. Clear `(iy+1).3`.
4. Test `(iy+5).7`; if clear, return immediately.
5. Otherwise load `HL <- (0xD02567)` and `DE <- (0xD0256A)`.
6. Decrement `DE` twice, call `0x082685`, clear `(iy+5).7`, and return.

The referenced RAM symbols from `ti84pceg.inc` are:

- `0xD02567 = ?fmtMatSym`
- `0xD0256A = ?fmtMatMem`

That looks like UI/edit-state cleanup, not parser initialization.

## What the surrounding code is doing instead

The 300-byte window after `DisarmScroll` is not the front end of `ParseInp`; it is a separate edit/recall cluster:

- `0x09923A = MinToEdit`
- `0x09927F = RclVarToEdit`
- `0x099283 = RclVarToEditPtr`
- `0x0992A0 = RclEntryToEdit`
- `0x0992C3 = RclToQueue`

The nearby helper `0x0972C3`, called twice from this region, only copies edit cursor state:

```text
0x0972C3  ld hl, (0xD02437)
0x0972C7  ld (0xD0243A), hl
0x0972CB  ld hl, (0xD02440)
0x0972CF  ld (0xD0243D), hl
0x0972D3  ret
```

So the surrounding `0x09923A` / `0x09927F` routines are moving edit/queue state around and dispatching on an object type byte (`(0xD005F8) & 0x3F`), not entering the parser.

## ParseInp / error-frame answer

- `ParseInp` (`0x099914`) is **not called directly** anywhere in the disassembled `0x099211..0x09933D` window.
- `ParseInp` is also **not reached indirectly in the inspected local `0x099xxx` callees** (`0x0992A4`, `0x0992C3`, `0x0993DA`).
- `0x0973C8` is **not called** from this local region.
- `PushErrorHandler` (`0x061DEF`) is **not called** from this local region.
- The task-specified `0x061DD1` is **not referenced** here; in the earlier dual-ParseInp disassembly the actual pop helper used by `0x0973C8` was `0x061E20`, and that address is also absent here.

So the static answer is:

- `0x099211` does **not** call `ParseInp` directly.
- The inspected local call graph also does **not** reveal an indirect path to `ParseInp`.
- If the home-screen ENTER flow eventually reaches `ParseInp`, that handoff happens **outside** this `0x099211` region.

## What setup is present, and what is missing

State setup present in this region:

- IY flag clears: `(iy+9).7`, `(iy+1).3`, `(iy+5).7`, `(iy+12).0`, `(iy+27).7`
- `editCursor` / queue snapshots: `0xD0243A -> 0xD008D6`, later restored
- `0xD0008A -> 0xD0008B`
- `HL -> 0xD00687`
- format-string helpers through `0xD0250F` / `0xD02510`

State setup missing from this region:

- no `PushErrorHandler`
- no `PopErrorHandler`
- no `ChkFindSym`
- no `begPC` / `curPC` / `endPC` initialization
- no direct edit-buffer flush through `0x05E872`
- no direct `ParseInp`

That means the extra context CoorMon provides is not coming from `0x099211`. The missing parser setup lives elsewhere, and the known candidate is the separate `0x0973C8` dual-ParseInp path, which is where the earlier disassembly found `call 0x061DEF`, `call 0x099914`, and `call 0x061E20`.

## Summary

`0x099211` is `DisarmScroll`, a short scroll/edit-state cleanup helper that clears IY flags and optionally runs one OS helper before returning. The surrounding `0x09923A` / `0x09927F` / `0x0992C3` code is an edit/recall-to-queue cluster (`MinToEdit`, `RclVarToEdit`, `RclToQueue`), not the local `ParseInp` front end. Static disassembly shows no direct or inspected-local indirect path from `0x099211` to `0x099914`, no call to `0x0973C8`, and no error-frame setup. The home-screen ENTER path must reach `ParseInp` somewhere else in the broader CoorMon flow.

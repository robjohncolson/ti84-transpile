# Phase 312 - `cpHL_DE_modeDependent` vs `cpHL_DE`

## Address correction

The task text names `cpHL_DE_modeDependent` at `0x04C960`, but that address is inside the tail of the previous divider helper. The compare helper actually starts at `0x04C973`.

- `0x04C960..0x04C962` = tail of the previous helper
- `0x04C973..0x04C978` = `cpHL_DE_modeDependent`
- `0x04C979..0x04C97F` = `cpHL_DE`

## Bottom line

Both routines are the same five-instruction compare wrapper except that `0x04C979` inserts one extra `SIL` prefix byte before `SBC HL,DE`.

- `0x04C973` uses plain `ED 52`, so the subtraction width follows the current execution mode.
- `0x04C979` uses `52 ED 52`, so the subtraction itself is forced into the long-form width handled by the repo decoder/transpiler.
- Neither helper reads `MADL`, `MBASE`, or any RAM mode byte.
- The difference is entirely opcode-prefix driven, not branch-driven.

In other words:

- `cpHL_DE_modeDependent` = "compare `HL` vs `DE` using whatever width the current mode gives `SBC HL,DE`"
- `cpHL_DE` = "compare `HL` vs `DE` with the subtraction width forced by `SIL`"

The local decoder/transpiler evidence for that is in:

- `TI-84_Plus_CE/ez80-decoder.js`: `modePrefix === "sil"` maps to width `3`
- `scripts/transpile-ti84-rom.mjs`: `getWordByteWidth()` returns `3` for `SIL`/`LIL`

## Full disassembly

### `0x04C973` - `cpHL_DE_modeDependent`

| Address | Bytes | Instruction | Effect |
| --- | --- | --- | --- |
| `0x04C973` | `E5` | `push hl` | save `HL` |
| `0x04C974` | `B7` | `or a` | clear carry without changing `A` |
| `0x04C975` | `ED 52` | `sbc hl, de` | compare `HL-DE` in current mode width |
| `0x04C977` | `E1` | `pop hl` | restore `HL` |
| `0x04C978` | `C9` | `ret` | return with flags from the subtract |

### `0x04C979` - `cpHL_DE`

| Address | Bytes | Instruction | Effect |
| --- | --- | --- | --- |
| `0x04C979` | `E5` | `push hl` | save `HL` |
| `0x04C97A` | `B7` | `or a` | clear carry without changing `A` |
| `0x04C97B` | `52 ED 52` | `sil sbc hl, de` | compare `HL-DE` with forced long-form subtract width |
| `0x04C97E` | `E1` | `pop hl` | restore `HL` |
| `0x04C97F` | `C9` | `ret` | return with flags from the subtract |

## What actually differs

Only one instruction differs:

```text
0x04C975  ED 52        sbc hl, de
0x04C97B  52 ED 52     sil sbc hl, de
```

Everything else is identical.

That means:

- Both helpers preserve `HL` by saving/restoring it on the stack.
- Both helpers return comparison flags from `HL - DE`.
- Both helpers leave `DE` and `BC` alone.
- Both helpers preserve the value in `A`; only flags change.
- The only semantic delta is whether `SBC HL,DE` follows the current mode or is forced to the `SIL` long form.

## Register contract

| Helper | Inputs | Outputs | Preserves | Clobbers | RAM touched |
| --- | --- | --- | --- | --- | --- |
| `cpHL_DE_modeDependent` | `HL`, `DE` | flags as if `HL-DE`; `Z=1` when equal; `C=1` when `HL<DE` | value of `HL`, `DE`, `BC`, `A` | flags, temporary stack use, transient internal `HL` | stack only |
| `cpHL_DE` | `HL`, `DE` | same flags contract | value of `HL`, `DE`, `BC`, `A` | flags, temporary stack use, transient internal `HL` | stack only |

## Caller counts

Two different counts matter here:

1. Full direct ROM xrefs from raw instruction bytes
2. Lifted `CALL` sites visible in `ROM.transpiled.js`

The lifted `CALL` counts exactly match the raw-ROM `CALL` counts once duplicate lifted blocks are deduped by caller PC.

| Helper | Actual entry | Direct ROM refs | Breakdown | Unique lifted `CALL` PCs in `ROM.transpiled.js` |
| --- | --- | ---: | --- | ---: |
| `cpHL_DE_modeDependent` | `0x04C973` | `134` | `122 CALL + 12 JP` | `122` |
| `cpHL_DE` | `0x04C979` | `252` | `247 CALL + 5 JP` | `247` |

## Distribution by ROM region

### All direct refs (`CALL` + `JP`)

| Region | `0x04C973` | `0x04C979` |
| --- | ---: | ---: |
| `0x02xxxx` | `7` | `15` |
| `0x03xxxx` | `2` | `3` |
| `0x04xxxx` | `4` | `6` |
| `0x05xxxx` | `22` | `37` |
| `0x06xxxx` | `8` | `28` |
| `0x07xxxx` | `16` | `14` |
| `0x08xxxx` | `23` | `41` |
| `0x09xxxx` | `14` | `45` |
| `0x0Axxxx` | `18` | `45` |
| `0x0Bxxxx` | `20` | `18` |

### `CALL` refs only (`ROM.transpiled.js` deduped PCs)

| Region | `0x04C973` calls | `0x04C979` calls |
| --- | ---: | ---: |
| `0x02xxxx` | `5` | `14` |
| `0x03xxxx` | `2` | `3` |
| `0x04xxxx` | `3` | `6` |
| `0x05xxxx` | `18` | `36` |
| `0x06xxxx` | `8` | `28` |
| `0x07xxxx` | `16` | `14` |
| `0x08xxxx` | `22` | `41` |
| `0x09xxxx` | `11` | `45` |
| `0x0Axxxx` | `18` | `44` |
| `0x0Bxxxx` | `19` | `16` |

## Caller pattern analysis

There is no clean "low regions use one, high regions use the other" split. Both helpers are used across `0x02xxxx..0x0Bxxxx`.

The pattern is functional, not geographic:

- `cpHL_DE` dominates nearly every region, especially `0x08xxxx`, `0x09xxxx`, and `0x0Axxxx`.
- `cpHL_DE_modeDependent` is flatter across regions and has noticeably more `JP` aliases/thunks.
- The small `0x02xxxx` counts include shared jump-vector style aliases rather than only normal in-function calls.

### Heuristic caller-shape counts

Looking at the six decoded instructions before every direct xref:

| Heuristic | `0x04C973` | `0x04C979` |
| --- | ---: | ---: |
| caller neighborhood contains `LD HL,(mem)` or `LD DE,(mem)` | `93 / 134` | `133 / 252` |
| caller neighborhood contains `LD HL,imm` | `14 / 134` | `61 / 252` |
| caller neighborhood contains `LD DE,imm` | `41 / 134` | `76 / 252` |
| conditional branch immediately after compare on `Z/NZ` | `79` | `96` |
| conditional branch immediately after compare on `C/NC` | `15` | `87` |

Interpretation:

- `cpHL_DE_modeDependent` is more often used as a pointer/pointer or pointer/table compare where both operands were just loaded from RAM.
- `cpHL_DE` is used much more often in constant-threshold, range, and exact-match tests against literal values.
- `cpHL_DE` is also followed by carry-based ordering branches far more often, which fits "strict bound" checks better than the lighter pointer-gating role of `cpHL_DE_modeDependent`.

## Representative caller contexts

### `cpHL_DE_modeDependent`

These callers look like live pointer/address comparisons:

```text
0x08C558  ld hl, (0xD008D9)
0x08C55C  ex de, hl
0x08C55D  call 0x04C973
0x08C561  jr nc, 0x08C583
```

```text
0x0A6176  ld de, (0xD01FEA)
0x0A617B  call 0x04C973
0x0A617F  jr nz, 0x0A6187
```

```text
0x0BC720  ld hl, (0xD0256D)
0x0BC724  ld de, (0xD0258D)
0x0BC729  call 0x04C973
0x0BC72D  jr nc, 0x0BC733
```

### `cpHL_DE`

These callers look more like literal bound/equality tests:

```text
0x07B7BB  call 0x04C979
```

This is the graph full-width path identified earlier in phase 142:

- `LD HL, 0x000140`
- compare against the screen-width bound

```text
0x055BA4  ld de, 0x00002C
0x055BA8  ld hl, (0xD026B5)
0x055BAC  call 0x04C979
0x055BB0  ret z
```

```text
0x0A63E4  ld hl, 0x000002
0x0A63E8  call 0x04C979
0x0A63EC  jp nz, 0x061D36
```

This matches the higher literal-load counts above: callers commonly preload one operand with a fixed threshold before comparing.

## Answers to the task questions

### What instructions differ?

Only the compare itself:

- `0x04C973`: `ED 52`
- `0x04C979`: `52 ED 52`

### Does one check CPU mode or `MBASE`?

No.

- There is no explicit read of `MADL`, `MBASE`, or any mode register in either helper.
- There are no memory operands except the stack save/restore.
- The mode sensitivity is implicit in the opcode form, not explicit in software logic.

### Do callers from different ROM regions prefer one over the other?

Only weakly.

- `0x04C979` is more popular almost everywhere, especially in `0x08xxxx`, `0x09xxxx`, and `0x0Axxxx`.
- `0x04C973` has a slightly flatter spread and more alias-style `JP` entries.
- There is no hard regional split that suggests "this bank is ADL-aware and that bank is not."

### When and why do callers choose one?

The practical rule is:

- Use `0x04C973` when the caller is happy to inherit the current subtract width and is usually comparing live pointers/addresses already in registers.
- Use `0x04C979` when the caller wants the subtract itself forced to the long-form width and is often comparing against fixed limits, literal codes, or exact-match tables.

That is why `0x04C979` shows up in the heavy compare cascades and bounds checks, while `0x04C973` keeps appearing in pointer-management and RAM-slot gating paths.

## Conclusion

`cpHL_DE_modeDependent` and `cpHL_DE` are not different algorithms. They are the same helper body wrapped around two variants of `SBC HL,DE`:

- prefixless: width follows the current mode
- `SIL`-prefixed: width is forced to the long-form subtract that the local decoder/transpiler treat as 24-bit

No `MBASE` logic is involved. The callers choose between them because they want either:

- a cheap current-mode compare (`0x04C973`), or
- a fixed-width long compare (`0x04C979`)

The region scan shows broad use of both helpers across the ROM, but the higher-volume, literal-heavy compare sites overwhelmingly prefer `0x04C979`.

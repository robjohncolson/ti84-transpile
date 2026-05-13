# Phase 311 - Utility cluster scan

Generated from direct `ROM.rom` byte reads with `decodeInstruction(..., "adl")`, a single ROM-wide `CALL`/`JP` xref pass, and RET-based entry discovery in four candidate windows:

- `0x04C800..0x04C960`
- `0x04CA40..0x04CC00`
- `0x04D000..0x04D200`
- `0x000200..0x000400`

Caller totals below are reported as:

- `direct24`: exact 24-bit ADL `CALL`/`JP` references
- `extra16`: additional non-overlapping low-word 16-bit `CALL`/`JP` byte matches
- `total`: `direct24 + extra16`

`high-traffic` means `>= 10` callers.

## Cluster summary

The scan turned up one substantial new helper corridor and two much smaller follow-on strips:

| Cluster | Region | Entry points | Total callers | High-traffic entries | Notes |
| --- | --- | ---: | ---: | ---: | --- |
| `0x04C824..0x04C94F` | before-known | `25 = 21 canonical + 4 xref-only aliases` | `277` | `9` | Dense `scrapMem` helper strip just before the phase 310 family |
| `0x04CA41..0x04CA86` | after-known | `7 = 6 canonical + 1 xref-only alias` | `16` | `0` | Small post-cluster strip with `LDDR`/`LDIR` wrappers and tiny thunks |
| `0x04CB7A..0x04CBA7` | after-known | `2 = 2 canonical + 0 aliases` | `4` | `0` | Small copy/index pair, not a heavy shared utility bank |

No qualifying multi-entry utility cluster was found in:

- `0x04D000..0x04D200`
- `0x000200..0x000400`

The low-address probe window only exposed a tiny `0x0003F5..0x0003F6` stub with `2` possible 16-bit callers, not a cluster.

## New cluster details

### `0x04C824..0x04C94F` - prelude strip before the known phase 310 family

This is the only newly discovered cluster that behaves like a true general-purpose utility bank. It is dominated by `scrapMem` (`0xD02AD7..0xD02AD9`) pack/extract helpers and tiny stream loaders.

- The hottest new entry is `0x04C90D` (`loadDEInd_s`) with `63 = 63 + 0` callers.
- `0x04C916` (`LoadHLInd_s`) follows with `58 = 58 + 0` callers.
- `0x04C8BD` (`testHLNonZero`) has `37 = 37 + 0` callers.
- Four xref-only alias entries sit inside the strip and are real shared entry points, not noise:
  - `0x04C876` packs `A:B:C` into a 24-bit `BC`
  - `0x04C886` packs `A:D:E` into a 24-bit `DE`
  - `0x04C896` packs `A:H:L` into a 24-bit `HL`
  - `0x04C91C` zero-extends `BC` to 24 bits

Taken together, this looks like a broad pointer-normalization corridor feeding later routines: pack a 16-bit pair plus an explicit high byte, extract the upper byte of a 24-bit pair, test a 24-bit pair for zero, or zero-extend a 16-bit pair back to full ADL width.

### `0x04CA41..0x04CA86` - small post-cluster strip

This strip exists immediately after the phase 310 family but it is much cooler:

- `0x04CA41` is an IX-framed `LDDR` wrapper.
- `0x04CA58` is the matching IX-framed `LDIR` wrapper.
- `0x04CA7B` is the busiest entry here with `8 = 8 + 0` callers.

This is a real utility strip, but not a hot one.

### `0x04CB7A..0x04CBA7` - small helper pair

- `0x04CB7A` copies two bytes from `0xD026AC/AD` into an IX-relative buffer.
- `0x04CB8D` computes a stride/indexed pointer into the `0xD40000` region.

Useful, but not broadly shared.

## Top 20 highest-caller utility entries across discovered clusters

| Rank | Entry | Callers | Bytes | Label | Notes |
| ---: | --- | ---: | ---: | --- | --- |
| 1 | `0x04C90D` | `63 = 63 + 0` | 9 | `loadDEInd_s` | load a 16-bit little-endian word from `(HL)` into `DE`, advance `HL` |
| 2 | `0x04C916` | `58 = 58 + 0` | 24 | `LoadHLInd_s` | load a 16-bit word into `HL`, then tail-jump into `zeroExtendHL24` |
| 3 | `0x04C8BD` | `37 = 37 + 0` | 7 | `testHLNonZero` | OR together the 24-bit `HL` bytes to set flags |
| 4 | `0x04C886` | `15 = 15 + 0` | 15 | `packA_DE_to_DE` | xref-only alias; pack `A:D:E` into a 24-bit `DE` via `scrapMem` |
| 5 | `0x04C896` | `14 = 14 + 0` | 13 | `packA_HL_to_HL` | xref-only alias; pack `A:H:L` into a 24-bit `HL` via `scrapMem` |
| 6 | `0x04C91C` | `13 = 13 + 0` | 18 | `zeroExtendBC24` | xref-only alias; clear the top byte of `BC` via `scrapMem` |
| 7 | `0x04C92E` | `12 = 12 + 0` | 18 | `zeroExtendDE24` | clear the top byte of `DE` via `scrapMem` |
| 8 | `0x04C8B4` | `11 = 11 + 0` | 9 | `getHLUpperByte` | extract the top byte of `HL` |
| 9 | `0x04C8A3` | `10 = 10 + 0` | 10 | `getDEUpperByte` | extract the top byte of `DE` |
| 10 | `0x04CA7B` | `8 = 8 + 0` | 12 | `iyCallThunk_040D11` | load fixed `IY` base then jump into `0x040D11` |
| 11 | `0x04C83A` | `7 = 7 + 0` | 22 | `bit42GuardAndSet` | tiny guard/set routine around `(IY+0x42)` |
| 12 | `0x04C885` | `6 = 6 + 0` | 16 | `packB_DE_to_DE` | wrapper form that uses `B` as the high byte |
| 13 | `0x04C8AD` | `6 = 6 + 0` | 7 | `testDENonZero` | OR together the 24-bit `DE` bytes to set flags |
| 14 | `0x04C86E` | `5 = 5 + 0` | 7 | `testBCNonZero` | OR together the 24-bit `BC` bytes to set flags |
| 15 | `0x04C940` | `5 = 5 + 0` | 16 | `zeroExtendHL24` | clear the top byte of `HL` via `scrapMem` |
| 16 | `0x04CA75` | `5 = 5 + 0` | 5 | `constD1787C` | constant pointer loader |
| 17 | `0x04C876` | `4 = 4 + 0` | 15 | `packA_BC_to_BC` | xref-only alias; pack `A:B:C` into a 24-bit `BC` |
| 18 | `0x04C864` | `3 = 3 + 0` | 10 | `getBCUpperByte` | extract the top byte of `BC` |
| 19 | `0x04CB8D` | `3 = 3 + 0` | 27 | `strideA0IndexToD40000` | compute an indexed pointer in the `0xD40000` area |
| 20 | `0x04CA84` | `2 = 2 + 0` | 3 | `ldA0C_ret` | xref-only alias inside the `0x04CA7B` thunk range |

## Comparison with the known `0x04C960..0x04CA40` cluster

Session 310's reference cluster remains the denser utility bank:

- Known cluster (`0x04C960..0x04CA40`): about `442` callers total across `15` cataloged in-window entries.
- Best new cluster (`0x04C824..0x04C94F`): `277` callers total across `25` utility entry points (`21` canonical + `4` aliases).
- Known hottest helper: `0x04C979` (`cpHL_DE`) with `252` callers.
- Best new helper: `0x04C90D` with `63` callers.

The main takeaway is architectural rather than competitive: the phase 310 strip is not isolated. It sits immediately after another `scrapMem`-centric helper corridor. Taken together, the broader `0x04C824..0x04CA40` neighborhood looks like a long bank of tiny ADL utility primitives, with the known compare/negate family forming the hottest middle section.

## String / memory utility findings

The requested scan did find memory-oriented helpers, but not new `strlen`/`memset` standouts:

- `0x04CA41` is an IX-framed `LDDR` wrapper.
- `0x04CA58` is the matching IX-framed `LDIR` wrapper.
- `0x04C90D` and `0x04C916` are stream/pointer loaders that walk little-endian words out of memory.

No new candidate in the requested windows looked like:

- a dedicated `strlen`/NUL-scan helper
- a dedicated `memset`/fill helper
- a hotter `memcpy` wrapper than the small `LDIR`/`LDDR` pair at `0x04CA41` / `0x04CA58`

The closest string-specific helpers still remain the already-known phase 310 entries such as `findNulTerminator_bc` at `0x04C9C5` and `measureStringDefaultFont` at `0x04CA28`.

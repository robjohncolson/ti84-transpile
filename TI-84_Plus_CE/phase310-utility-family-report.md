# Phase 310 - Utility family map around `0x04C960..0x04CA40`

Generated from direct `ROM.rom` byte reads with `decodeInstruction(..., "adl")` and ROM-wide `CALL`/`JP` pattern scans.

## Scope note

The task text says "`0x04C960..0x04CA40` (128 bytes)", but the literal inclusive span is `0xE1` bytes (`225` decimal). This phase follows the literal address range and treats the earlier byte-count wording as a typo.

The window starts on the last three bytes of the older helper at `0x04C950..0x04C962`, so the first full in-window entry is `0x04C963`.

## Boundary map

- `0x04C960..0x04C962` - tail of the previous divider helper; not a new entry in this window
- `0x04C963..0x04C972` - `divHLByA_24`
- `0x04C973..0x04C978` - `cpHL_DE_modeDependent`
- `0x04C979..0x04C97F` - `cpHL_DE`
- `0x04C980..0x04C98F` - `cpHL_BC_range`
- `0x04C990..0x04C99B` - `negBC`
- `0x04C99C..0x04C9A7` - `negDE`
- `0x04C9A8..0x04C9C4` - `signExtTempShiftRight1`
- `0x04C9C5..0x04C9D8` - `findNulTerminator_bc`
- `0x04C9D9..0x04C9E0` - `memcmpB`
- `0x04C9E1..0x04C9E9` - `addAtoHL`
- `0x04C9EA..0x04C9FC` - `nextPageBaseFromHL`
- `0x04C9FD..0x04CA1A` - `pageCeilingFromInitState`
- `0x04CA1B..0x04CA20` - `swapHLBytes16`
- `0x04CA21..0x04CA27` - `zFlagToA`
- `0x04CA28..0x04CA40` - `measureStringDefaultFont`

`0x04CA26..0x04CA27` is a branch-only tail inside `0x04CA21`, not a separate externally referenced entry point.

## Catalog

Caller totals below are reported as:

- `direct24`: definite 24-bit ADL `CALL`/`JP` references
- `extra16`: additional non-overlapping low-word 16-bit `CALL`/`JP` byte matches
- `total`: `direct24 + extra16`

The `extra16` column is kept separate because those matches come from raw ROM byte scans and may be bank-local short-form callers rather than full-address ADL calls.

| Entry | Size | Callers | Name / purpose | Register contract |
| --- | ---: | ---: | --- | --- |
| `0x04C963` | 16 | `2 = 2 + 0` | `divHLByA_24` - 24-bit shift/subtract divider | `HL = dividend, A = divisor -> HL = quotient, A = remainder, BC preserved` |
| `0x04C973` | 6 | `134 = 134 + 0` | `cpHL_DE_modeDependent` - non-destructive compare without forced ADL prefix | `HL, DE -> flags from HL-DE, HL preserved` |
| `0x04C979` | 7 | `252 = 252 + 0` | `cpHL_DE` - forced-ADL 24-bit compare | `HL, DE -> flags from HL-DE, HL preserved` |
| `0x04C980` | 16 | `2 = 2 + 0` | `cpHL_BC_range` - inclusive range test | `BC = low, HL = probe, DE = high -> C=1 only when BC <= HL <= DE` |
| `0x04C990` | 12 | `8 = 8 + 0` | `negBC` - negate BC | `BC -> BC = -BC, HL preserved` |
| `0x04C99C` | 12 | `3 = 3 + 0` | `negDE` - negate DE | `DE -> DE = -DE, HL preserved` |
| `0x04C9A8` | 29 | `1 = 1 + 0` | `signExtTempShiftRight1` - store HL to `signExtTemp`, shift right once, reload | `HL -> HL shifted right, AF preserved, scratch RAM updated` |
| `0x04C9C5` | 20 | `8 = 8 + 0` | `findNulTerminator_bc` - scan for `0x00` and return its address | `HL -> BC = terminator address, HL/AF restored` |
| `0x04C9D9` | 8 | `3 = 2 + 1` | `memcmpB` - compare `B` bytes at `DE` and `HL` | `B, DE, HL -> Z on full match, NZ on first mismatch` |
| `0x04C9E1` | 9 | `9 = 2 + 7` | `addAtoHL` - add unsigned `A` into `HL` | `HL, A -> HL = HL + A, BC preserved` |
| `0x04C9EA` | 19 | `10 = 10 + 0` | `nextPageBaseFromHL` - increment HL top byte, cap at `0x3A`, return `xx0000` | `HL -> HL = min(topByte(HL)+1, 0x3A) << 16` |
| `0x04C9FD` | 30 | `6 = 5 + 1` | `pageCeilingFromInitState` - consult `0x09DF12` / `D025C7`, return adjusted `xxFFFF` | `HL, DE, D025C7 -> HL = adjusted page ceiling, DE preserved` |
| `0x04CA1B` | 6 | `1 = 1 + 0` | `swapHLBytes16` - swap `H` and `L` | `HL -> low 16-bit byte order swapped, AF preserved` |
| `0x04CA21` | 7 | `1 = 1 + 0` | `zFlagToA` - turn entry Z-state into an A result | `entry Z flag, A -> A|1 when Z set, else A=0` |
| `0x04CA28` | 25 | `2 = 1 + 1` | `measureStringDefaultFont` - select font/style `0`, measure string at `HL`, return width in `BC` | `HL = string ptr -> BC = extent, HL/DE/AF restored` |

## Most-called helpers

By definite 24-bit direct references, the ranking is:

1. `0x04C979` - `252` direct callers
2. `0x04C973` - `134` direct callers
3. `0x04C9EA` - `10` direct callers
4. `0x04C990` and `0x04C9C5` - `8` direct callers each
5. `0x04C9FD` - `5` direct callers

Including the extra non-overlapping low-word 16-bit matches does not change the top result. No helper in this family exceeds `cpHL_DE`'s `252` direct callers.

## New utilities found past `0x04CA00`

The neighborhood scan beyond the original compare/negate cluster turned up three more helpers before the next post-window routine starts at `0x04CA41`:

- `0x04CA1B` - a pure `H/L` byte-swap helper
- `0x04CA21` - a tiny flag-to-A booleanizer with a branch-only alternate tail at `0x04CA26`
- `0x04CA28` - a higher-level wrapper that selects font/style `0`, calls the shared string-width calculator at `0x054DD4`, and returns the measured width in `BC`

That makes the wider `0x04C960..0x04CA40` neighborhood a mixed helper strip: arithmetic/comparison primitives at the front, scratch/string/page helpers in the middle, and a small UI/string wrapper at the end.

# Phase 56 Error Banner Scan

## Scope
- Scan window: `0x061f00-0x062300`
- Entry heuristic: aligned direct `call`/`jp` targets into the window, plus aligned starts immediately after an unconditional `ret` (`0xc9`)
- Probe state: boot -> `0x08c331 (= CoorMon)` OS init -> `cpu.mbase=0xd0` -> `0x0802b2` text-fg helper -> direct call entry, `maxSteps=5000`
- `vramWrites` below counts changed 16-bit VRAM pixels against a sentinel-cleared screen, not raw byte-store events

## Scanned Entries
| Addr | Why It Was Scanned | Termination | Blocks | VRAM Writes | BBox | Classification | Notes |
| --- | --- | --- | ---: | ---: | --- | --- | --- |
| `0x061f6d` | post-`ret` start | `missing_block@0xffffff` | 3 | 0 | none | `noop` | No visible draw. |
| `0x062055` | post-`ret` start | `missing_block@0xffffff` | 15 | 0 | none | `noop` | No visible draw. |
| `0x0620e6` | aligned direct target, `calls=15 jps=2` | `missing_block@0xffffff` | 1 | 0 | none | `noop` | Tiny helper; no standalone rendering. |
| `0x0620ec` | post-`ret` start, aligned direct target, `calls=1` | `missing_block@0xffffff` | 19 | 0 | none | `noop` | Wrapper/helper; no standalone rendering. |
| `0x06214b` | post-`ret` start | `missing_block@0xffffff` | 9 | 0 | none | `noop` | Small helper; no standalone rendering. |
| `0x062160 (= DispErrorScreen)` | post-`ret` start, aligned direct target, `calls=3` | `max_steps@0x0a188c` | 5000 | 1332 | `r37-54 c108-181` | `deep` | Only entry with banner-shaped black/white output. Dominant colors: `0x0000` and `0xffff`. |

## Banner Candidates
| Addr | VRAM Writes | BBox | Strict Class | Why It Matters |
| --- | ---: | --- | --- | --- |
| `0x062160 (= DispErrorScreen)` | 1332 | `r37-54 c108-181` | `deep` | The only function entry in the window that paints a compact top-of-screen banner footprint under a clean direct call. |

No sibling function entries in this range produced a banner under the requested clean post-init call contract. The nearby string table shows why: `0x062160 (= DispErrorScreen)` is not just an OVERFLOW special-case, it is the generic error-banner renderer for a whole family of error messages.

## ROM Error Strings
The dense string cluster immediately after the local pointer table at `0x062290` is the strongest static signal in this scan.

| Requested String | ROM Address | Local Table Tie-In | Notes |
| --- | --- | --- | --- |
| `OVERFLOW` | `0x062338` | table index `0` | First error string in the local table. |
| `DIVIDE BY 0` | `0x062391` | table index `1` | Adjacent to OVERFLOW. |
| `SINGULAR MAT` | `0x0623e1` | table index `2` | Stored as `SINGULAR MATRIX`. |
| `DOMAIN` | `0x06244e` | table index `3` | Same local table. |
| `DIM MISMATCH` | `0x06267c` | table index `10` | Stored as `DIMENSION MISMATCH`. |
| `INVALID DIM` | `0x0626f9` | table index `11` | Stored as `INVALID DIMENSION`. |
| `BREAK` | `0x062504` | table index `5` | Same local table. |
| `ERR:` | `0x075514`, `0x0759c1`, `0x077954`, `0x08a56c`, `0x08a578`, `0x0a2eac` | none | Generic header anchors elsewhere in ROM, not in the `0x062160 (= DispErrorScreen)` local table. |

Related static note:
- `0x0b26a9` starts with `ERROR`, which matches the `0x062160 (= DispErrorScreen)` prologue that copies a fixed header before selecting an error-specific string from the `0x062290` pointer table.

## Seed Ranking
1. `0x062160 (= DispErrorScreen)`
   Strong next-phase browser-shell seed. It is the only actual function entry here with banner-like screen output, and its local table at `0x062290` points at `OVERFLOW`, `DIVIDE BY 0`, `SINGULAR MATRIX`, `DOMAIN`, `BREAK`, `DIMENSION MISMATCH`, `INVALID DIMENSION`, and many other TI-84 error strings.
2. `0x0620ec`
   Not a rendering seed by itself, but it is the nearest callable wrapper/helper in the same family. Only worth instrumenting if the next phase needs to reconstruct pre-banner setup instead of calling `0x062160 (= DispErrorScreen)` directly.
3. `0x06214b`
   Another adjacent helper. It does no standalone drawing under a clean direct call, so it is lower priority than `0x062160 (= DispErrorScreen)` and mainly useful for tracing setup state.

## Probe Output Snippet
Captured from the pre-patch run of the same probe logic:

```text
0x061f6d missing_block@0xffffff steps=3 blocks=3 vramWrites=0 bbox=none class=noop
0x0620ec missing_block@0xffffff steps=19 blocks=19 vramWrites=0 bbox=none class=noop
0x062160 (= DispErrorScreen) max_steps@0x0a188c steps=5000 blocks=5000 vramWrites=1332 bbox=r37-54 c108-181 class=deep bannerLike=true colors=0x0000:938,0xffff:394
```

## Bottom Line
- The scan did not uncover multiple sibling banner entry points in `0x061f00-0x062300`.
- The evidence instead points to one generic renderer at `0x062160 (= DispErrorScreen)`, with a local pointer table starting at `0x062290` that fans out to the actual error strings.
- For the future browser-shell wiring phase, bias toward one seed at `0x062160 (= DispErrorScreen)` plus parameterization of the selected error string, not a long list of sibling seeds from this window.

# Phase 100C - Mode-Display Chain Retranspile + Re-Probe

## Verdict

`0x0b2d8a` is **not** confirmed as the natural mode-buffer populator in the current repo state.

- The direct `0x0b2d8a -> 0x0b485e -> 0x0b5394` chain is already lifted.
- The Phase 100C retranspile only increased the seed count.
- The 500000-step reprobe wrote **0 bytes** into `0xD020A6..0xD020BF`.
- The run never reached printable ASCII and never hit a `missing_block` sentinel.
- The run stalled in a tight loop at `0x082287 / 0x08229c / 0x082282`.

## Static Chain Walk

I walked the current `PRELIFTED_BLOCKS` graph starting from `0x0b2d8a`, `0x0b485e`, and `0x0b5394`.

- Reachable within depth 8: **22 blocks**
- Missing direct targets in that depth-8 chain: **0**

Key covered exits:

| From | Exit | Target | Status |
|---|---|---|---|
| `0x0b2d8a` | `call` | `0x0b485e` | present |
| `0x0b2d8a` | `call-return` | `0x0b2d8e` | present |
| `0x0b485e` | `call` | `0x0b5394` | present |
| `0x0b485e` | `call-return` | `0x0b4862` | present |
| `0x0b2d8f` | `jump` | `0x0b2d9b` | present |
| `0x0b2da0` | `call` | `0x0b3d37` | present |
| `0x0b2db6` | `branch` | `0x0b2e11` | present |
| `0x0b2db8` | `call` | `0x0b341a` | present |
| `0x0b2dc2` | `call` | `0x0801b9` | present |
| `0x0b2e11` | `jump` | `0x0b410d` | present |
| `0x0b341a` | `call` | `0x061def` | present |
| `0x0b410d` | `call` | `0x0b6140` | present |

There is no clean "missing Phase 100C block" left in the direct mode-display chain.

The first missing transitive target I could force out of a blind BFS was `0xf865ed:adl` at depth 87, only after the path had fallen out through global boot and service plumbing. That is not a credible mode-display seed candidate.

## Seeds + Retranspile

Added explicit Phase 100C chain anchors in [phase100c-seeds.txt](/C:/Users/rober/Downloads/Projects/school/follow-alongs/TI-84_Plus_CE/phase100c-seeds.txt):

- `0x0b2d8a`
- `0x0b485e`
- `0x0b5394`
- `0x0b3d37`
- `0x0b341a`
- `0x0b538f`
- `0x0b3f75`
- `0x0b410d`
- `0x082961`
- `0x082bb5`
- `0x082266`

These seeds are wired into [transpile-ti84-rom.mjs](/C:/Users/rober/Downloads/Projects/school/follow-alongs/scripts/transpile-ti84-rom.mjs) and the transpiler was rerun.

| Metric | Before | After | Delta |
|---|---:|---:|---:|
| Seed count | 21346 | 21357 | +11 |
| Block count | 124552 | 124552 | 0 |
| Covered bytes | 692409 | 692409 | 0 |
| Coverage % | 16.5083 | 16.5083 | 0.0000 |

Interpretation: the direct chain was already covered before Phase 100C. The new seeds pin that path explicitly, but they do not unlock any additional blocks.

## Re-Probe Result

Probe script: [probe-phase100c-reprobe.mjs](/C:/Users/rober/Downloads/Projects/school/follow-alongs/TI-84_Plus_CE/probe-phase100c-reprobe.mjs)

Setup run:

- Entry: `0x0b2aea`
- `maxSteps=50000`
- Termination: `max_steps`
- Last PC: `0x08386a`
- Buffer after setup: unchanged `0xff` fill, not zeros

Main reprobe:

- Entry: `0x0b2d8a`
- `maxSteps=500000`
- Termination: `max_steps`
- Last PC: `0x08229c`
- Missing blocks: none
- Loop breaks forced by executor: 993

Top visited blocks:

| Block | Visits |
|---|---:|
| `0x082287` | 166985 |
| `0x08229c` | 166984 |
| `0x082282` | 165991 |
| `0x0b485e` | 2 |
| `0x0b5394` | 2 |

Mode buffer snapshots (`0xD020A6..0xD020BF`):

| Snapshot | Hex | ASCII |
|---|---|---|
| Before `0x0b2d8a` | `ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff` | `..........................` |
| After `0x0b2d8a` | `ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff` | `..........................` |

Observed buffer stats:

- Changed offsets: none
- Buffer writes during `0x0b2d8a`: 0
- Bytes that became non-zero: 0
- Printable ASCII bytes after run: 0
- First non-zero offset after run: 0

## Failure Mode

This phase failed because the supposed populator does not touch the buffer at all under the tested setup.

- It does **not** terminate through a top-level RET.
- It does **not** terminate by falling into a `missing_block` sentinel.
- It does **not** rewrite the buffer with zeros.
- It simply spins in the `0x082287 / 0x08229c / 0x082282` loop and leaves the preexisting `0xff` bytes untouched.

## Follow-Up Candidates

- Trace why `0x0b341a -> 0x061def -> 0x082961 -> 0x082bb5 -> 0x082266` collapses into the `0x082287 / 0x08229c` loop instead of reaching any string-copy path.
- Instrument the loop inputs around `0x082266` to identify the gating RAM or flag that prevents forward progress.
- Revisit the hypothesis that `0x0b2d8a` is the natural populator at all; current evidence says it is a higher-level mode-management path, not the direct writer for `0xD020A6..0xD020BF`.

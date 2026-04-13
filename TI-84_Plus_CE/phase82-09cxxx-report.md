# Phase 82 — 0x09cxxx Y= Editor Entry Point Probe

Probed all 19 external callers of the 0x05e4xx text-rendering family that
reside in the 0x09c000-0x09cfff ROM page, looking for the top-level Y= editor
screen render function (should render the full Y1=, Y2=, … equation list).

## Setup

- ROM booted, OS init, SetTextFgColor(black) — shared state snapshot
- Each probe: reset RAM + CPU + VRAM (sentinel 0xAAAA), then `runFrom(entry, adl, {maxSteps: 30000})`
- Pass 2: for probes with >5000 pixels, re-run with `onBlock` hook at 0x0A1799 to capture char codes

## Results Table

| addr | total px | fg px | bg px | bbox | chars decoded | steps | termination |
|------|----------|-------|-------|------|---------------|-------|-------------|
| `09c7c0` | 0 | 0 | 0 | none | — | 62 | missing_block |
| `09c986` | 0 | 0 | 0 | none | — | 25 | missing_block |
| `09c98c` | 0 | 0 | 0 | none | — | 30000 | max_steps |
| `09c9e8` | 0 | 0 | 0 | none | — | 9 | missing_block |
| `09ca7e` | 0 | 0 | 0 | none | — | 12 | missing_block |
| `09cb08` | 252 | 234 | 18 | r18-35 c168-181 | — | 823 | missing_block |
| `09cb14` * | 10444 | 3954 | 6490 | r0-34 c0-319 | `il [0x00],#roloc,emannqe[0xc1][0x02][0xe...` | 21702 | missing_block |
| `09cb1a` | 252 | 234 | 18 | r18-35 c168-181 | — | 822 | missing_block |
| `09cb6f` | 0 | 0 | 0 | none | — | 53 | missing_block |
| `09cb87` | 0 | 0 | 0 | none | — | 345 | missing_block |
| `09cba6` | 0 | 0 | 0 | none | — | 4 | missing_block |
| `09cbab` | 0 | 0 | 0 | none | — | 35 | missing_block |
| `09cbb7` | 0 | 0 | 0 | none | — | 323 | missing_block |
| `09cbbc` | 0 | 0 | 0 | none | — | 323 | missing_block |
| `09cceb` | 0 | 0 | 0 | none | — | 9 | missing_block |
| `09ccf4` | 0 | 0 | 0 | none | — | 9 | missing_block |
| `09cd0f` | 0 | 0 | 0 | none | — | 6 | missing_block |
| `09cd2a` | 0 | 0 | 0 | none | — | 9 | missing_block |
| `09cd56` | 0 | 0 | 0 | none | — | 23 | missing_block |
| `09cd5a` | 0 | 0 | 0 | none | — | 30000 | max_steps |

\* `09cb14` = known Y= attribute status bar (Phase 78/81)

## Identification

The highest-pixel probe is **`09cb14`** (0x09cb14) with **10444 pixels**.

BBox spans 35 rows × 320 cols — partial screen area.

Decoded chars: `il [0x00],#roloc,emannqe[0xc1][0x02][0xef]:`

### Full-screen candidate(s) (>10000 px)

- **`09cb14`** (0x09cb14): 10444 px
  - Decoded: `il [0x00],#roloc,emannqe[0xc1][0x02][0xef]:`

### Near-zero probes (<100 px — likely subroutines, not top-level renders)

`09c7c0`, `09c986`, `09c98c`, `09c9e8`, `09ca7e`, `09cb6f`, `09cb87`, `09cba6`, `09cbab`, `09cbb7`, `09cbbc`, `09cceb`, `09ccf4`, `09cd0f`, `09cd2a`, `09cd56`, `09cd5a`

## Decoded Text Detail (probes with >5000 px)

### 09cb14 (0x09cb14) — 10444 total px

Full decoded text (23 invocations):

```
il [0x00],#roloc,emannqe[0xc1][0x02][0xef]:
```

| col (DE) | code | char |
|----------|------|------|
| 0 | 0x69 | `i` |
| 0 | 0x6c | `l` |
| 0 | 0x20 | ` ` |
| 0 | 0x00 | `[0x00]` |
| 0 | 0x2c | `,` |
| 0 | 0x23 | `#` |
| 0 | 0x72 | `r` |
| 0 | 0x6f | `o` |
| 0 | 0x6c | `l` |
| 0 | 0x6f | `o` |
| 0 | 0x63 | `c` |
| 0 | 0x2c | `,` |
| 0 | 0x65 | `e` |
| 0 | 0x6d | `m` |
| 0 | 0x61 | `a` |
| 0 | 0x6e | `n` |
| 0 | 0x6e | `n` |
| 0 | 0x71 | `q` |
| 0 | 0x65 | `e` |
| 0 | 0xc1 | `[0xc1]` |
| 0 | 0x02 | `[0x02]` |
| 0 | 0xef | `[0xef]` |
| 65535 | 0x3a | `:` |

## ASCII Art — Top 3 by Pixel Count

(# = dark/fg pixel, . = white/bg pixel, space = unwritten sentinel)
Clipped to 80 chars wide, 50 rows tall from top-left of bounding box.

### 09cb14 (0x09cb14) — 10444 px, bbox r0-34 c0-319

```
................................................................................
................................................................................
................................................................................
................................................................................
................................................................................
................................................................................
................................................................................
................................................................................
................................................................................
................................................................................
................................................................................
................................................................................
................................................................................
................................................................................
................................................................................
................................................................................
................................................................................
                                    ############################################
                                    ############################################
                                    ##################..####################....
                                    #################....###################....
                                    ################......##################..##
                                    #####...#######........#################..##
                                    #####...######..........################..##
                                    #####...######..........##..######..####..##
                                    ################......####..######..####..##
                                    ################......####..######..####..##
                                    ################......####..######..####..##
                                    #####...########......####..######..####..##
                                    #####...########......####..######..####..##
                                    #####...########......####...####...####..##
                                    ###########################.........####....
                                    ############################.....#..####....
                                    ############################################
                                    ############################################
```

### 09cb08 (0x09cb08) — 252 px, bbox r18-35 c168-181

```
##############
##############
##############
##############
##############
#####...######
#####...######
#####...######
##############
##############
##############
#####...######
#####...######
#####...######
##############
##############
##############
##############
```

### 09cb1a (0x09cb1a) — 252 px, bbox r18-35 c168-181

```
##############
##############
##############
##############
##############
#####...######
#####...######
#####...######
##############
##############
##############
#####...######
#####...######
#####...######
##############
##############
##############
##############
```

## Methodology Notes

- `0x0A1799` intercept captures `cpu.a` (A register) at block entry as char code,
  and `cpu._de & 0xFFFF` as approximate column position.
- Some chars may be captured out of order if the renderer draws non-sequentially;
  results are sorted by DE value.
- VRAM sentinel `0xAAAA` distinguishes unwritten pixels from written zeros.
- Probes that halt immediately (0 steps) have no block at that address in PRELIFTED_BLOCKS.
- maxSteps=30000 may be too low for a full-screen render; if the top candidate
  terminates at exactly 30000, re-run with higher maxSteps.

## Next Steps

If no probe rendered a full Y= screen (>50000 px / full 320×240 fill):

1. Check whether the highest-pixel probe needs equation data in RAM
   (Y1 string buffer at a known OS address) before rendering equations.
2. Try calling from a higher-level address (the function that CALLS this page's renderers).
3. Increase maxSteps to 100000 or 300000 for the top candidate.
4. Look for a jump table in 0x09cxxx that dispatches to sub-renderers.
# Phase 66 D177B8 Sweep Report

## Probe Command

`node TI-84_Plus_CE/probe-phase66-d177b8-sweep.mjs`

## Setup

- Boot: steps=8804, termination=halt, lastPc=0x0019b5:adl
- Init: steps=691, termination=missing_block, lastPc=0xffffff:adl
- Post-init callback=0xffffff, sysFlag=0xff, deepInitFlag=0xff
- Post-init watched state={"D0009B":{"value":255,"hex":"0xff"},"D14038":{"value":16777215,"hex":"0xffffff"},"D1407B":{"value":255,"hex":"0xff"},"D1407C":{"value":255,"hex":"0xff"},"D14081":{"value":255,"hex":"0xff"},"D1408D":{"value":255,"hex":"0xff"},"D177B8":{"value":255,"hex":"0xff"},"D177BA":{"value":255,"hex":"0xff"}}

## Baselines

- Phase 59 Pass E baseline block set: `0x0019be`, `0x0019ef`, `0x0019f4`, `0x001aa3`, `0x001aae`, `0x014dab`, `0x014dd0`, `0x014e20`, `0x014dc2`, `0x014dc9`, `0x014d48`, `0x014d50`, `0x014d59`, `0x014da6`, `0x014e29`, `0x001ab7`, `0x001a32`, `0x002197`
- Phase 61 new blocks: `0x014dde`, `0x014e33`, `0x014e3d`

## Raw Watch Mapping

- `0x014DE6` is its own lifted block and should next call `0x006EB6`.
- `0x014DE9` is the raw return slot from that call; the next lifted block is `0x014DEA`.
- `0x014DEE` lives inside lifted block `0x014DED`, which branches to `0x014E20` or `0x014DF4`.
- `0x014E00` lives inside lifted block `0x014DFF`, which calls `0x006F4D` and then resumes at `0x014E08`.

## Per-Variant Results

| Variant | D14038 Seed | D177B8 Seed | Compare Result | Reached 0x014DE6+? | New Blocks Beyond Phase 61 | VRAM Writes | VRAM BBox | Final D14038 |
| --- | --- | --- | --- | --- | --- | ---: | --- | --- |
| A | `0x0007d0` | `0x00` | fallthrough -> 0x014DDE (incremented D14038 > 0x0007D0) | yes | `0x006eb6`, `0x014de6`, `0x014dea`, `0x014ded` | 0 | none | `0x0007d1` |
| B | `0x0007d0` | `0xff` | fallthrough -> 0x014DDE (incremented D14038 > 0x0007D0) | no | none | 0 | none | `0x0007d1` |
| C | `0x0007cf` | `0x00` | JR NC -> 0x014E20 (incremented D14038 <= 0x0007D0) | no | none | 0 | none | `0x0007d0` |
| D | `0x0007d0` | `0x01` | fallthrough -> 0x014DDE (incremented D14038 > 0x0007D0) | yes | `0x006eb6`, `0x014de6`, `0x014dea`, `0x014ded` | 0 | none | `0x0007d1` |

## Full Block Trails

### A
- Expectation: Threshold hit with D177B8 cleared; should unlock 0x014DE6+ if D177B8 is the second gate.
- Compare branch: fallthrough -> 0x014DDE (incremented D14038 > 0x0007D0)
- Watched state: D0009B 0xff -> 0xbf; D14038 0x0007d0 -> 0x0007d1; D1407C=0xff; D14081=0xff; D177B8=0x00; D177BA=0xff
- Phase 61 blocks seen again: `0x014dde`, `0x014e33`, `0x014e3d`
- New blocks beyond the Phase 61 set: `0x006eb6`, `0x014de6`, `0x014dea`, `0x014ded`
- Deep-path branch observations:
- 0x014DDE -> 0x014de6 (D177B8 compare gate: jr nc -> 0x014E20, else -> 0x014DE6)
- 0x014DE6 -> 0x006eb6 (call 0x006EB6; raw return site 0x014DE9 resumes in block 0x014DEA)
- 0x014DEA -> 0x014ded (post-0x006EB6 zero-flag test: jr z -> 0x014E20, else -> 0x014DED)
- 0x014DED -> 0x014e20 (D14081 gate; raw branch site includes 0x014DEE)
- VRAM: writes=0; bbox=none
- Trail: `0x014dab:adl` -> `0x014dc2:adl` -> `0x014dc9:adl` -> `0x014dd0:adl` -> `0x014dde:adl` -> `0x014de6:adl` -> `0x006eb6:adl` -> `0x014dea:adl` -> `0x014ded:adl` -> `0x014e20:adl` -> `0x014d48:adl` -> `0x002197:adl` -> `0x014d50:adl` -> `0x014d59:adl` -> `0x014da6:adl` -> `0x014e29:adl` -> `0x014d48:adl` -> `0x002197:adl` -> `0x014d50:adl` -> `0x014d59:adl` -> `0x014da6:adl` -> `0x014e33:adl` -> `0x014d48:adl` -> `0x002197:adl` -> `0x014d50:adl` -> `0x014d59:adl` -> `0x014da6:adl` -> `0x014e3d:adl` -> `0x001ab7:adl` -> `0x001a32:adl`

### B
- Expectation: Phase 61 baseline reproduction with D177B8 left at 0xFF.
- Compare branch: fallthrough -> 0x014DDE (incremented D14038 > 0x0007D0)
- Watched state: D0009B 0xff -> 0xbf; D14038 0x0007d0 -> 0x0007d1; D1407C=0xff; D14081=0xff; D177B8=0xff; D177BA=0xff
- Phase 61 blocks seen again: `0x014dde`, `0x014e33`, `0x014e3d`
- New blocks beyond the Phase 61 set: none
- Deep-path branch observations:
- 0x014DDE -> 0x014e20 (D177B8 compare gate: jr nc -> 0x014E20, else -> 0x014DE6)
- VRAM: writes=0; bbox=none
- Trail: `0x014dab:adl` -> `0x014dc2:adl` -> `0x014dc9:adl` -> `0x014dd0:adl` -> `0x014dde:adl` -> `0x014e20:adl` -> `0x014d48:adl` -> `0x002197:adl` -> `0x014d50:adl` -> `0x014d59:adl` -> `0x014da6:adl` -> `0x014e29:adl` -> `0x014d48:adl` -> `0x002197:adl` -> `0x014d50:adl` -> `0x014d59:adl` -> `0x014da6:adl` -> `0x014e33:adl` -> `0x014d48:adl` -> `0x002197:adl` -> `0x014d50:adl` -> `0x014d59:adl` -> `0x014da6:adl` -> `0x014e3d:adl` -> `0x001ab7:adl` -> `0x001a32:adl`

### C
- Expectation: Sub-threshold control with D177B8 cleared; should stay on the 0x014E20 side of the compare.
- Compare branch: JR NC -> 0x014E20 (incremented D14038 <= 0x0007D0)
- Watched state: D0009B 0xff -> 0xbf; D14038 0x0007cf -> 0x0007d0; D1407C=0xff; D14081=0xff; D177B8=0x00; D177BA=0xff
- Phase 61 blocks seen again: `0x014e33`, `0x014e3d`
- New blocks beyond the Phase 61 set: none
- Deep-path branch observations:
- none
- VRAM: writes=0; bbox=none
- Trail: `0x014dab:adl` -> `0x014dc2:adl` -> `0x014dc9:adl` -> `0x014dd0:adl` -> `0x014e20:adl` -> `0x014d48:adl` -> `0x002197:adl` -> `0x014d50:adl` -> `0x014d59:adl` -> `0x014da6:adl` -> `0x014e29:adl` -> `0x014d48:adl` -> `0x002197:adl` -> `0x014d50:adl` -> `0x014d59:adl` -> `0x014da6:adl` -> `0x014e33:adl` -> `0x014d48:adl` -> `0x002197:adl` -> `0x014d50:adl` -> `0x014d59:adl` -> `0x014da6:adl` -> `0x014e3d:adl` -> `0x001ab7:adl` -> `0x001a32:adl`

### D
- Expectation: Threshold hit with D177B8 at 0x01 to test whether the gate is specifically 0xFF or any >=0x40 value.
- Compare branch: fallthrough -> 0x014DDE (incremented D14038 > 0x0007D0)
- Watched state: D0009B 0xff -> 0xbf; D14038 0x0007d0 -> 0x0007d1; D1407C=0xff; D14081=0xff; D177B8=0x01; D177BA=0xff
- Phase 61 blocks seen again: `0x014dde`, `0x014e33`, `0x014e3d`
- New blocks beyond the Phase 61 set: `0x006eb6`, `0x014de6`, `0x014dea`, `0x014ded`
- Deep-path branch observations:
- 0x014DDE -> 0x014de6 (D177B8 compare gate: jr nc -> 0x014E20, else -> 0x014DE6)
- 0x014DE6 -> 0x006eb6 (call 0x006EB6; raw return site 0x014DE9 resumes in block 0x014DEA)
- 0x014DEA -> 0x014ded (post-0x006EB6 zero-flag test: jr z -> 0x014E20, else -> 0x014DED)
- 0x014DED -> 0x014e20 (D14081 gate; raw branch site includes 0x014DEE)
- VRAM: writes=0; bbox=none
- Trail: `0x014dab:adl` -> `0x014dc2:adl` -> `0x014dc9:adl` -> `0x014dd0:adl` -> `0x014dde:adl` -> `0x014de6:adl` -> `0x006eb6:adl` -> `0x014dea:adl` -> `0x014ded:adl` -> `0x014e20:adl` -> `0x014d48:adl` -> `0x002197:adl` -> `0x014d50:adl` -> `0x014d59:adl` -> `0x014da6:adl` -> `0x014e29:adl` -> `0x014d48:adl` -> `0x002197:adl` -> `0x014d50:adl` -> `0x014d59:adl` -> `0x014da6:adl` -> `0x014e33:adl` -> `0x014d48:adl` -> `0x002197:adl` -> `0x014d50:adl` -> `0x014d59:adl` -> `0x014da6:adl` -> `0x014e3d:adl` -> `0x001ab7:adl` -> `0x001a32:adl`

## Divergence

- A, D: 0x014dab:adl -> 0x014dc2:adl -> 0x014dc9:adl -> 0x014dd0:adl -> 0x014dde:adl -> 0x014de6:adl -> 0x006eb6:adl -> 0x014dea:adl -> 0x014ded:adl -> 0x014e20:adl -> 0x014d48:adl -> 0x002197:adl -> 0x014d50:adl -> 0x014d59:adl -> 0x014da6:adl -> 0x014e29:adl -> 0x014d48:adl -> 0x002197:adl -> 0x014d50:adl -> 0x014d59:adl -> 0x014da6:adl -> 0x014e33:adl -> 0x014d48:adl -> 0x002197:adl -> 0x014d50:adl -> 0x014d59:adl -> 0x014da6:adl -> 0x014e3d:adl -> 0x001ab7:adl -> 0x001a32:adl
- B: 0x014dab:adl -> 0x014dc2:adl -> 0x014dc9:adl -> 0x014dd0:adl -> 0x014dde:adl -> 0x014e20:adl -> 0x014d48:adl -> 0x002197:adl -> 0x014d50:adl -> 0x014d59:adl -> 0x014da6:adl -> 0x014e29:adl -> 0x014d48:adl -> 0x002197:adl -> 0x014d50:adl -> 0x014d59:adl -> 0x014da6:adl -> 0x014e33:adl -> 0x014d48:adl -> 0x002197:adl -> 0x014d50:adl -> 0x014d59:adl -> 0x014da6:adl -> 0x014e3d:adl -> 0x001ab7:adl -> 0x001a32:adl
- C: 0x014dab:adl -> 0x014dc2:adl -> 0x014dc9:adl -> 0x014dd0:adl -> 0x014e20:adl -> 0x014d48:adl -> 0x002197:adl -> 0x014d50:adl -> 0x014d59:adl -> 0x014da6:adl -> 0x014e29:adl -> 0x014d48:adl -> 0x002197:adl -> 0x014d50:adl -> 0x014d59:adl -> 0x014da6:adl -> 0x014e33:adl -> 0x014d48:adl -> 0x002197:adl -> 0x014d50:adl -> 0x014d59:adl -> 0x014da6:adl -> 0x014e3d:adl -> 0x001ab7:adl -> 0x001a32:adl

## New Code Paths

- A: `0x006eb6`, `0x014de6`, `0x014dea`, `0x014ded`
- D: `0x006eb6`, `0x014de6`, `0x014dea`, `0x014ded`

## Stdout Summary

- Stdout prints the shared boot/init banner, then one Pass E bonus injection for each of variants A-D.
- Once `0x014DAB` is entered, stdout logs the full block trail through the service return to `0x001A32`.
- Every injection log includes the seeded `D14038`/`D177B8` values plus final `D14038`, `D177B8`, VRAM write count, and VRAM bbox.
- Final verdict line: `renderPathUnlocked=no reached014de6Plus=A,D vramWrites=none thresholdCrossers=A,B,D newBlocks=A:0x006eb6/0x014de6/0x014dea/0x014ded | D:0x006eb6/0x014de6/0x014dea/0x014ded nextSeed=0xD14081`

## Verdict

- Did any variant reach `0x014DE6+`? yes: A, D
- Did any variant produce VRAM writes? no
- Threshold-crossing variants: A, B, D
- Verdict on D177B8: D177B8 is the second gate; clearing it below 0x40 opens 0x014DE6+.
- Threshold-crossing variants that still fell straight back to `0x014E20`: B
- New code beyond Phase 61: A -> 0x006eb6, 0x014de6, 0x014dea, 0x014ded | D -> 0x006eb6, 0x014de6, 0x014dea, 0x014ded
- If VRAM still stays dark, preseed next: 0xD14081

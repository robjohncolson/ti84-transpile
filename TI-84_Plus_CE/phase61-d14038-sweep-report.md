# Phase 61 D14038 Sweep Report

## Probe Command

`node TI-84_Plus_CE/probe-phase61-d14038-sweep.mjs`

## Setup

- Boot: steps=8804, termination=halt, lastPc=0x0019b5:adl
- Init: steps=691, termination=missing_block, lastPc=0xffffff:adl
- Post-init callback=0xffffff, sysFlag=0xff, deepInitFlag=0xff
- Post-init watched state={"D14038":{"value":16777215,"hex":"0xffffff"},"D1407B":{"value":255,"hex":"0xff"},"D1407C":{"value":255,"hex":"0xff"},"D14081":{"value":255,"hex":"0xff"},"D1408D":{"value":255,"hex":"0xff"},"D177B8":{"value":255,"hex":"0xff"}}

## Phase 59 Pass E Bonus Baseline Block Set

`0x0019be`, `0x0019ef`, `0x0019f4`, `0x001aa3`, `0x001aae`, `0x014dab`, `0x014dd0`, `0x014e20`, `0x014dc2`, `0x014dc9`, `0x014d48`, `0x014d50`, `0x014d59`, `0x014da6`, `0x014e29`, `0x001ab7`, `0x001a32`, `0x002197`

## Per-Seed Results

| Seed | D14038 After IRQ | Steps | Termination | Compare Branch | New Blocks Beyond Phase 59 Baseline | VRAM Writes |
| --- | --- | ---: | --- | --- | --- | ---: |
| `0x0007ce` | `0x0007cf` | 41 | `halt@0x0019b5:adl` | JR NC -> 0x014E20 (incremented D14038 <= 0x0007D0) | `0x014e33`, `0x014e3d` | 0 |
| `0x0007cf` | `0x0007d0` | 41 | `halt@0x0019b5:adl` | JR NC -> 0x014E20 (incremented D14038 <= 0x0007D0) | `0x014e33`, `0x014e3d` | 0 |
| `0x0007d0` | `0x0007d1` | 42 | `halt@0x0019b5:adl` | fallthrough -> 0x014DDE (incremented D14038 > 0x0007D0) | `0x014dde`, `0x014e33`, `0x014e3d` | 0 |
| `0x0007d1` | `0x0007d2` | 42 | `halt@0x0019b5:adl` | fallthrough -> 0x014DDE (incremented D14038 > 0x0007D0) | `0x014dde`, `0x014e33`, `0x014e3d` | 0 |

## Full Block Trails

### 0x0007ce
- Compare branch: JR NC -> 0x014E20 (incremented D14038 <= 0x0007D0)
- Watched state: D14038 0x0007ce -> 0x0007cf; D1407C=0xff; D14081=0xff; D177B8=0xff
- New blocks beyond Phase 59 baseline: `0x014e33`, `0x014e3d`
- Trail: `0x014dab:adl` -> `0x014dc2:adl` -> `0x014dc9:adl` -> `0x014dd0:adl` -> `0x014e20:adl` -> `0x014d48:adl` -> `0x002197:adl` -> `0x014d50:adl` -> `0x014d59:adl` -> `0x014da6:adl` -> `0x014e29:adl` -> `0x014d48:adl` -> `0x002197:adl` -> `0x014d50:adl` -> `0x014d59:adl` -> `0x014da6:adl` -> `0x014e33:adl` -> `0x014d48:adl` -> `0x002197:adl` -> `0x014d50:adl` -> `0x014d59:adl` -> `0x014da6:adl` -> `0x014e3d:adl` -> `0x001ab7:adl` -> `0x001a32:adl`

### 0x0007cf
- Compare branch: JR NC -> 0x014E20 (incremented D14038 <= 0x0007D0)
- Watched state: D14038 0x0007cf -> 0x0007d0; D1407C=0xff; D14081=0xff; D177B8=0xff
- New blocks beyond Phase 59 baseline: `0x014e33`, `0x014e3d`
- Trail: `0x014dab:adl` -> `0x014dc2:adl` -> `0x014dc9:adl` -> `0x014dd0:adl` -> `0x014e20:adl` -> `0x014d48:adl` -> `0x002197:adl` -> `0x014d50:adl` -> `0x014d59:adl` -> `0x014da6:adl` -> `0x014e29:adl` -> `0x014d48:adl` -> `0x002197:adl` -> `0x014d50:adl` -> `0x014d59:adl` -> `0x014da6:adl` -> `0x014e33:adl` -> `0x014d48:adl` -> `0x002197:adl` -> `0x014d50:adl` -> `0x014d59:adl` -> `0x014da6:adl` -> `0x014e3d:adl` -> `0x001ab7:adl` -> `0x001a32:adl`

### 0x0007d0
- Compare branch: fallthrough -> 0x014DDE (incremented D14038 > 0x0007D0)
- Watched state: D14038 0x0007d0 -> 0x0007d1; D1407C=0xff; D14081=0xff; D177B8=0xff
- New blocks beyond Phase 59 baseline: `0x014dde`, `0x014e33`, `0x014e3d`
- Trail: `0x014dab:adl` -> `0x014dc2:adl` -> `0x014dc9:adl` -> `0x014dd0:adl` -> `0x014dde:adl` -> `0x014e20:adl` -> `0x014d48:adl` -> `0x002197:adl` -> `0x014d50:adl` -> `0x014d59:adl` -> `0x014da6:adl` -> `0x014e29:adl` -> `0x014d48:adl` -> `0x002197:adl` -> `0x014d50:adl` -> `0x014d59:adl` -> `0x014da6:adl` -> `0x014e33:adl` -> `0x014d48:adl` -> `0x002197:adl` -> `0x014d50:adl` -> `0x014d59:adl` -> `0x014da6:adl` -> `0x014e3d:adl` -> `0x001ab7:adl` -> `0x001a32:adl`

### 0x0007d1
- Compare branch: fallthrough -> 0x014DDE (incremented D14038 > 0x0007D0)
- Watched state: D14038 0x0007d1 -> 0x0007d2; D1407C=0xff; D14081=0xff; D177B8=0xff
- New blocks beyond Phase 59 baseline: `0x014dde`, `0x014e33`, `0x014e3d`
- Trail: `0x014dab:adl` -> `0x014dc2:adl` -> `0x014dc9:adl` -> `0x014dd0:adl` -> `0x014dde:adl` -> `0x014e20:adl` -> `0x014d48:adl` -> `0x002197:adl` -> `0x014d50:adl` -> `0x014d59:adl` -> `0x014da6:adl` -> `0x014e29:adl` -> `0x014d48:adl` -> `0x002197:adl` -> `0x014d50:adl` -> `0x014d59:adl` -> `0x014da6:adl` -> `0x014e33:adl` -> `0x014d48:adl` -> `0x002197:adl` -> `0x014d50:adl` -> `0x014d59:adl` -> `0x014da6:adl` -> `0x014e3d:adl` -> `0x001ab7:adl` -> `0x001a32:adl`

## Divergence

- 0x0007ce, 0x0007cf: 0x014dab:adl -> 0x014dc2:adl -> 0x014dc9:adl -> 0x014dd0:adl -> 0x014e20:adl -> 0x014d48:adl -> 0x002197:adl -> 0x014d50:adl -> 0x014d59:adl -> 0x014da6:adl -> 0x014e29:adl -> 0x014d48:adl -> 0x002197:adl -> 0x014d50:adl -> 0x014d59:adl -> 0x014da6:adl -> 0x014e33:adl -> 0x014d48:adl -> 0x002197:adl -> 0x014d50:adl -> 0x014d59:adl -> 0x014da6:adl -> 0x014e3d:adl -> 0x001ab7:adl -> 0x001a32:adl
- 0x0007d0, 0x0007d1: 0x014dab:adl -> 0x014dc2:adl -> 0x014dc9:adl -> 0x014dd0:adl -> 0x014dde:adl -> 0x014e20:adl -> 0x014d48:adl -> 0x002197:adl -> 0x014d50:adl -> 0x014d59:adl -> 0x014da6:adl -> 0x014e29:adl -> 0x014d48:adl -> 0x002197:adl -> 0x014d50:adl -> 0x014d59:adl -> 0x014da6:adl -> 0x014e33:adl -> 0x014d48:adl -> 0x002197:adl -> 0x014d50:adl -> 0x014d59:adl -> 0x014da6:adl -> 0x014e3d:adl -> 0x001ab7:adl -> 0x001a32:adl

## New Code Paths

- 0x0007ce: `0x014e33`, `0x014e3d`
- 0x0007cf: `0x014e33`, `0x014e3d`
- 0x0007d0: `0x014dde`, `0x014e33`, `0x014e3d`
- 0x0007d1: `0x014dde`, `0x014e33`, `0x014e3d`

## Stdout Summary

- Stdout printed the common setup banner, then one IRQ injection for each of the four seeds.
- Once `0x014DAB` was entered, stdout logged every visited block through the service return to `0x001A32`.
- Final verdict line: `renderPathUnlocked=no vramWrites=none thresholdCrossers=0x0007d0,0x0007d1 newBlocks=0x0007ce:0x014e33/0x014e3d | 0x0007cf:0x014e33/0x014e3d | 0x0007d0:0x014dde/0x014e33/0x014e3d | 0x0007d1:0x014dde/0x014e33/0x014e3d`

## Verdict

- Render path unlocked: no
- VRAM writes observed: none
- Seeds that crossed the 0x0007D0 threshold compare: 0x0007d0, 0x0007d1
- Threshold-crossing seeds still jumped straight from `0x014DDE` to `0x014E20`; `D177B8` stayed `0xFF`, so no `0x014DE6+` path unlocked.
- New code reached with no VRAM writes: 0x0007ce -> 0x014e33, 0x014e3d | 0x0007cf -> 0x014e33, 0x014e3d | 0x0007d0 -> 0x014dde, 0x014e33, 0x014e3d | 0x0007d1 -> 0x014dde, 0x014e33, 0x014e3d

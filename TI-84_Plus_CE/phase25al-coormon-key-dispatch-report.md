# Phase 25AL — CoorMon Key Dispatch Report

Generated: 2026-04-23

## Objective

Seed `0xD0146D` with `kEnter = 0x05` and run CoorMon to determine whether
Chain1 (0x06CE73) passes through to Chain2 (0x06C8B4), and whether ParseInp
(0x099914) fires for expression evaluation.

## Setup

Identical seeding to probe-phase25ak-ramclear-trace.mjs:
- Cold boot + MEM_INIT
- cx seed: cxMain=0x058241, cxCurApp=0x40, home-context callbacks
- Pre-yield IY flags cleared
- Keyboard: ENTER seeded (scancode, key code, getKey)
- Parser: tokenized "2+3" at userMem, begPC/curPC/endPC set
- Error frame seeded

**NEW in this probe:** `0xD0146D = 0x05` (kEnter)

CoorMon budget: 100000 steps, maxLoopIterations=8192

## Results Summary

| Metric | Value |
|--------|-------|
| Termination | max_steps |
| Total steps | 100000 |
| Final PC | 0x08277c |
| Loops forced | 1 |
| Total blocks | 100000 |

## Address Hit Results

| Address | Name | Hit? | First Step | Count |
|---------|------|------|------------|-------|
| 0x06ce73 | Chain1_entry | YES | 5 | 1 |
| 0x06ce7f | Chain1_gate_check | YES | 6 | 1 |
| 0x06c8b4 | Chain2_entry | YES | 11 | 1 |
| 0x06ce95 | Chain1_call_site_1 | YES | 10 | 1 |
| 0x06ceeb | Chain1_call_site_2 | NO | - | 0 |
| 0x0973c8 | ENTER_key_path | NO | - | 0 |
| 0x099914 | ParseInp_entry | NO | - | 0 |
| 0x058241 | HomeHandler_dispatch | YES | 3019 | 1 |
| 0x001881 | RAM_CLEAR | NO | - | 0 |

## Critical Questions

### Was Chain2 (0x06C8B4) reached?

**YES** — Chain2 was reached at step 11, hit 1 time(s).

Seeding `0xD0146D = 0x05` successfully passed the Chain1 gate check.

### Was ParseInp (0x099914) reached?

**NO** — ParseInp was NOT reached.

### Was RAM CLEAR (0x001881) hit?

**NO** — RAM CLEAR was not hit. Good.

## Memory Watch Summary

### 0xD0146D key event code

1 write(s):

| Step | Writer PC | Width | Value |
|------|-----------|-------|-------|
| 18744 | 0x083214 | 1 | 0x00 |

### 0xD007E0 cxCurApp

1 write(s):

| Step | Writer PC | Width | Value |
|------|-----------|-------|-------|
| 18744 | 0x083214 | 1 | 0x00 |

### 0xD007CA cxMain

6 write(s):

| Step | Writer PC | Width | Value |
|------|-----------|-------|-------|
| 3028 | 0x08c782 | 1 | 0xe9 |
| 3028 | 0x08c782 | 1 | 0x85 |
| 3028 | 0x08c782 | 1 | 0x05 |
| 18744 | 0x083214 | 1 | 0x00 |
| 18744 | 0x083214 | 1 | 0x00 |
| 18744 | 0x083214 | 1 | 0x00 |

### 0xD005F8 OP1

69 write(s):

| Step | Writer PC | Width | Value |
|------|-----------|-------|-------|
| 71 | 0x07fadf | 1 | 0x00 |
| 71 | 0x07fadf | 1 | 0x00 |
| 71 | 0x07fadf | 1 | 0x00 |
| 72 | 0x07fa7f | 1 | 0x00 |
| 73 | 0x07fa86 | 1 | 0x00 |
| 73 | 0x07fa86 | 1 | 0x00 |
| 73 | 0x07fa86 | 1 | 0x00 |
| 73 | 0x07fa86 | 1 | 0x00 |
| 73 | 0x07fa86 | 1 | 0x00 |
| 74 | 0x07ffd6 | 1 | 0x58 |
| 117 | 0x07f978 | 1 | 0xff |
| 117 | 0x07f978 | 1 | 0xff |
| 117 | 0x07f978 | 1 | 0xff |
| 117 | 0x07f978 | 1 | 0xff |
| 117 | 0x07f978 | 1 | 0xff |
| 117 | 0x07f978 | 1 | 0xff |
| 117 | 0x07f978 | 1 | 0xff |
| 117 | 0x07f978 | 1 | 0xff |
| 117 | 0x07f978 | 1 | 0xff |
| 172 | 0x098e4e | 1 | 0x80 |
| 3046 | 0x07fadf | 1 | 0x00 |
| 3046 | 0x07fadf | 1 | 0x00 |
| 3046 | 0x07fadf | 1 | 0x00 |
| 3047 | 0x07fa7f | 1 | 0x00 |
| 3048 | 0x07fa86 | 1 | 0x00 |
| 3048 | 0x07fa86 | 1 | 0x00 |
| 3048 | 0x07fa86 | 1 | 0x00 |
| 3048 | 0x07fa86 | 1 | 0x00 |
| 3048 | 0x07fa86 | 1 | 0x00 |
| 3051 | 0x08377d | 1 | 0x16 |
| ... | 39 more | | |

### 0xD008DF errNo

2 write(s):

| Step | Writer PC | Width | Value |
|------|-----------|-------|-------|
| 462 | 0x061db2 | 1 | 0x81 |
| 18744 | 0x083214 | 1 | 0x00 |

## Post-Run State

- 0xD0146D (key event): 0x00
- cxCurApp: 0x00
- cxMain: 0x000000
- OP1: 00 00 00 00 00 00 00 00 00
- errNo: 0x00

## Dispatch Path (first 100 blocks)

```text
step=1 pc=0x08c331
step=2 pc=0x05c634
step=3 pc=0x05c67c
step=4 pc=0x08c339
step=5 pc=0x06ce73 <<< Chain1_entry
step=6 pc=0x06ce7f <<< Chain1_gate_check
step=7 pc=0x06ce85
step=8 pc=0x06ce8c
step=9 pc=0x06ce8f
step=10 pc=0x06ce95 <<< Chain1_call_site_1
step=11 pc=0x06c8b4 <<< Chain2_entry
step=12 pc=0x06ce99
step=13 pc=0x06cea3
step=14 pc=0x06ceb1
step=15 pc=0x06af6c
step=16 pc=0x061b8e
step=17 pc=0x06af74
step=18 pc=0x06ceb5
step=19 pc=0x06cebf
step=20 pc=0x06cf41
step=21 pc=0x06cf47
step=22 pc=0x06cf4b
step=23 pc=0x06cf51
step=24 pc=0x06cf55
step=25 pc=0x06cf61
step=26 pc=0x06cf66
step=27 pc=0x06fc9c
step=28 pc=0x06fca6
step=29 pc=0x06fca9
step=30 pc=0x06cf6a
step=31 pc=0x06cf6b
step=32 pc=0x06fca2
step=33 pc=0x06fca9
step=34 pc=0x06cf6f
step=35 pc=0x06cf70
step=36 pc=0x06cf73
step=37 pc=0x06cf77
step=38 pc=0x06aabf
step=39 pc=0x023093
step=40 pc=0x000578
step=41 pc=0x0158a6
step=42 pc=0x0230a9
step=43 pc=0x023158
step=44 pc=0x06aac3
step=45 pc=0x06aac9
step=46 pc=0x06aaad
step=47 pc=0x0285a5
step=48 pc=0x0285b1
step=49 pc=0x0285a9
step=50 pc=0x06aab1
step=51 pc=0x06ab44
step=52 pc=0x06ae96
step=53 pc=0x0a23e5
step=54 pc=0x0a23f3
step=55 pc=0x0a23c0
step=56 pc=0x0a23c7
step=57 pc=0x0a23dc
step=58 pc=0x0a5424
step=59 pc=0x0a5439
step=60 pc=0x0a23e4
step=61 pc=0x0a2400
step=62 pc=0x0a2449
step=63 pc=0x04c979
step=64 pc=0x0a2451
step=65 pc=0x0a26d6
step=66 pc=0x0a26e1
step=67 pc=0x06ae9c
step=68 pc=0x06ab49
step=69 pc=0x07ffd1
step=70 pc=0x07facf
step=71 pc=0x07fadf
step=72 pc=0x07fa7f
step=73 pc=0x07fa86
step=74 pc=0x07ffd6
step=75 pc=0x06ab4e
step=76 pc=0x0a23e5
step=77 pc=0x0a23f3
step=78 pc=0x0a23c0
step=79 pc=0x0a23c7
step=80 pc=0x0a23dc
step=81 pc=0x0a5424
step=82 pc=0x0a5439
step=83 pc=0x0a23e4
step=84 pc=0x0a2400
step=85 pc=0x0a2449
step=86 pc=0x04c979
step=87 pc=0x0a2451
step=88 pc=0x0a26d6
step=89 pc=0x0a26e1
step=90 pc=0x06ab52
step=91 pc=0x0a23e5
step=92 pc=0x0a23f3
step=93 pc=0x0a23c0
step=94 pc=0x0a23c7
step=95 pc=0x0a23dc
step=96 pc=0x0a5424
step=97 pc=0x0a5439
step=98 pc=0x0a23e4
step=99 pc=0x0a2400
step=100 pc=0x0a2449
```

## Analysis

Chain2 was reached but ParseInp was not. There may be additional gates between
Chain2 and ParseInp, or the ENTER key code routes to a different handler.

## Unexpected State Changes

- OP1 was written 69 time(s)
- errNo was written 2 time(s)
- cxCurApp was written 1 time(s)


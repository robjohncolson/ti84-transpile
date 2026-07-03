# Phase 914: No-Key Drain Wipe Owner

Probe: `probe-phase914-no-key-drain-wipe-owner.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase914-no-key-drain-wipe-owner.mjs`

Serves a temporary instrumented copy of `browser-shell.html`. Disk `browser-shell.html` is not edited.

## Summary

- Probe completed: PASS.
- Digit3 leaves the browser state at D0058B=0x05 and D00587=0x00 before the next CLEAR burst.
- Baseline Digit3 -> CLEAR countdown reaches first post-GetCSC 0x03F9AE next=0x03F9B0, 0x03F9B0 count=8, wipes=3, termination=max_steps.
- Focus budgets tested from the same post-Digit3 snapshot: 3520, 3536, 3552, 3568, 3584 steps.
- First budget with D0058B=0: 3536 steps; first coarse safe drain preserving cxMain/cursor/token and avoiding 0x001879/0x0018F8: none.
- Owner-level first-zero stop: pc=0x03F9B0, D0058B=0x00, D007CA=0x0585E9, D0243A=0xD1A8CD, token=0x33.
- Owner-level pre-wipe stop: pc=0x001879, D0058B=0x01, D007CA=0x0585E9, D0243A=0xD1A8CD, token=0x33.
- Standalone CLEAR baseline: first 0x03F9AE next=0x03D058, 0x0A229D=1, wipes=0, uiClearApplied=true.
- Interpretation: There is a narrow owner-level stop immediately after the final D0058B decrement: execution is at 0x03F9B0 with D0058B=0 and the Digit3 edit context still intact, before any 0x001879/0x0018F8 wipe. Continuing the no-key frame past that point refreshes the counter path and eventually reaches the pre-wipe owner. Phase915 should verify whether resetting from this exact stop to the event loop lets the following CLEAR take the normal 0x0A229D route.

## CLEAR Route Summary

| Scenario | After Digit3 D0058B | After delay D0058B | Idle-frame D0058B | First 0x03F9AE next | 0x03F9B0 | 0x03F9B8 | 0x03F9D1 | 0x03F9D5 | 0x0A229D | 0x001879 | 0x0018F8 | Term | UI clear | Wipes | Oracle mismatches |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| standalone-clear | - | - | - | 0x03D058 | 0 | 0 | 0 | 0 | 1 | 0 | 0 | control_pre_stop | yes | 0 | 1 |
| transition-baseline | 0x05 | - | - | 0x03F9B0 | 8 | 7 | 1 | 1 | 0 | 3 | 3 | max_steps | no | 3 | 16 |

## Budget Scan

| Budget | Steps | Term | D0058B | D00587 | D00588 | D00589 | D007CA | D0243A | Token | 0x03F9AE | 0x03F9B0 | 0x03D058 | 0x001879 | 0x0018F8 | Safe drain |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 3520 | 3520 | max_steps | 0x01 | 0x00 | 0x00 | 0x00 | 0x0585E9 | 0xD1A8CD | 0x33 | 9 | 5 | 9 | 0 | 0 | no |
| 3536 | 3536 | max_steps | 0x00 | 0x00 | 0x00 | 0x00 | 0x000000 | 0x000000 | 0x33 | 8 | 4 | 8 | 1 | 1 | no |
| 3552 | 3552 | max_steps | 0x00 | 0x00 | 0x00 | 0x00 | 0x000000 | 0x000000 | 0x33 | 8 | 4 | 8 | 1 | 1 | no |
| 3568 | 3568 | max_steps | 0x01 | 0x00 | 0x00 | 0x00 | 0x0585E9 | 0xD1A8CD | 0x33 | 8 | 4 | 8 | 0 | 0 | no |
| 3584 | 3584 | max_steps | 0x00 | 0x00 | 0x00 | 0x00 | 0x000000 | 0x000000 | 0x33 | 8 | 4 | 8 | 1 | 1 | no |

## Owner-Level Stops

| Stop | Term | Steps | PC | D0058B | D00587 | D00588 | D00589 | D007CA | D0243A | Token | 0x001879 seen | 0x0018F8 seen |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| stop-first-zero-counter | phase914_stop_first-zero-counter | 2061 | 0x03F9B0 | 0x00 | 0x00 | 0x22 | 0x00 | 0x0585E9 | 0xD1A8CD | 0x33 | 0 | 0 |
| stop-pre-wipe-001879 | phase914_stop_pre-wipe-001879 | 3208 | 0x001879 | 0x01 | 0x00 | 0x00 | 0x00 | 0x0585E9 | 0xD1A8CD | 0x33 | 1 | 0 |

## Stop Recent Field Changes

| Stop | Seq | Field | Before | After | Observed At | Owner PC |
| --- | --- | --- | --- | --- | --- | --- |
| stop-first-zero-counter | 111 | D00589 | 0x22 | 0x00 | 0x03F9AE | 0x03F9A5 |
| stop-first-zero-counter | 112 | D0058B | 0x05 | 0x04 | 0x03D058 | 0x03F9AE |
| stop-first-zero-counter | 931 | D0058B | 0x04 | 0x03 | 0x03D058 | 0x03F9AE |
| stop-first-zero-counter | 1055 | D0058B | 0x03 | 0x02 | 0x03D058 | 0x03F9AE |
| stop-first-zero-counter | 1789 | D0058B | 0x02 | 0x01 | 0x03D058 | 0x03F9AE |
| stop-first-zero-counter | 2055 | D0058B | 0x01 | 0x00 | 0x03F9B0 | 0x03F9AE |
| stop-pre-wipe-001879 | 812 | D00589 | 0x22 | 0x00 | 0x03F9AE | 0x03F9A5 |
| stop-pre-wipe-001879 | 813 | D0058B | 0x05 | 0x04 | 0x03D058 | 0x03F9AE |
| stop-pre-wipe-001879 | 1553 | D0058B | 0x04 | 0x03 | 0x03D058 | 0x03F9AE |
| stop-pre-wipe-001879 | 1800 | D0058B | 0x03 | 0x02 | 0x03D058 | 0x03F9AE |
| stop-pre-wipe-001879 | 2010 | D0058B | 0x02 | 0x01 | 0x03D058 | 0x03F9AE |
| stop-pre-wipe-001879 | 2200 | D0058B | 0x01 | 0x00 | 0x03F9B0 | 0x03F9AE |
| stop-pre-wipe-001879 | 2201 | D0058B | 0x00 | 0x01 | 0x03F9D1 | 0x03F9B0 |
| stop-pre-wipe-001879 | 2205 | D00588 | 0x22 | 0x00 | 0x03D058 | 0x03F9DC |
| stop-pre-wipe-001879 | 2623 | D0058B | 0x01 | 0x00 | 0x03F9B0 | 0x03F9AE |
| stop-pre-wipe-001879 | 2624 | D0058B | 0x00 | 0x01 | 0x03F9B8 | 0x03F9B0 |

## Stop Recent Sequence

| Stop | Rel | PC |
| --- | --- | --- |
| stop-first-zero-counter | -47 | 0x001C81 |
| stop-first-zero-counter | -46 | 0x001C82 |
| stop-first-zero-counter | -45 | 0x001C48 |
| stop-first-zero-counter | -44 | 0x001C33 |
| stop-first-zero-counter | -43 | 0x001C38 |
| stop-first-zero-counter | -42 | 0x001C3C |
| stop-first-zero-counter | -41 | 0x001C42 |
| stop-first-zero-counter | -40 | 0x006810 |
| stop-first-zero-counter | -39 | 0x006812 |
| stop-first-zero-counter | -38 | 0x001C4F |
| stop-first-zero-counter | -37 | 0x001CA6 |
| stop-first-zero-counter | -36 | 0x001CC0 |
| stop-first-zero-counter | -35 | 0x001CCA |
| stop-first-zero-counter | -34 | 0x001CE4 |
| stop-first-zero-counter | -33 | 0x001C54 |
| stop-first-zero-counter | -32 | 0x006816 |
| stop-first-zero-counter | -31 | 0x00681E |
| stop-first-zero-counter | -30 | 0x006828 |
| stop-first-zero-counter | -29 | 0x001727 |
| stop-first-zero-counter | -28 | 0x000719 |
| stop-first-zero-counter | -27 | 0x00071D |
| stop-first-zero-counter | -26 | 0x02010C |
| stop-first-zero-counter | -25 | 0x03CF7D |
| stop-first-zero-counter | -24 | 0x03CFA4 |
| stop-first-zero-counter | -23 | 0x03CFCF |
| stop-first-zero-counter | -22 | 0x03CFD4 |
| stop-first-zero-counter | -21 | 0x03CFDB |
| stop-first-zero-counter | -20 | 0x03CFE0 |
| stop-first-zero-counter | -19 | 0x03CFE5 |
| stop-first-zero-counter | -18 | 0x03CFEA |
| stop-first-zero-counter | -17 | 0x03D029 |
| stop-first-zero-counter | -16 | 0x03D033 |
| stop-first-zero-counter | -15 | 0x03D038 |
| stop-first-zero-counter | -14 | 0x03D044 |
| stop-first-zero-counter | -13 | 0x03D04C |
| stop-first-zero-counter | -12 | 0x03D054 |
| stop-first-zero-counter | -11 | 0x03F994 |
| stop-first-zero-counter | -10 | 0x0003D4 |
| stop-first-zero-counter | -9 | 0x003CC2 |
| stop-first-zero-counter | -8 | 0x003CD4 |
| stop-first-zero-counter | -7 | 0x003CE0 |
| stop-first-zero-counter | -6 | 0x003CEE |
| stop-first-zero-counter | -5 | 0x003CF3 |
| stop-first-zero-counter | -4 | 0x03F998 |
| stop-first-zero-counter | -3 | 0x03F99A |
| stop-first-zero-counter | -2 | 0x03F9AB |
| stop-first-zero-counter | -1 | 0x03F9AE |
| stop-first-zero-counter | 0 | 0x03F9B0 |
| stop-pre-wipe-001879 | -47 | 0x001C7D |
| stop-pre-wipe-001879 | -46 | 0x001CA6 |
| stop-pre-wipe-001879 | -45 | 0x001CBC |
| stop-pre-wipe-001879 | -44 | 0x001CE5 |
| stop-pre-wipe-001879 | -43 | 0x001C81 |
| stop-pre-wipe-001879 | -42 | 0x001C82 |
| stop-pre-wipe-001879 | -41 | 0x001C48 |
| stop-pre-wipe-001879 | -40 | 0x001C33 |
| stop-pre-wipe-001879 | -39 | 0x001C38 |
| stop-pre-wipe-001879 | -38 | 0x001C44 |
| stop-pre-wipe-001879 | -37 | 0x001C7D |
| stop-pre-wipe-001879 | -36 | 0x001CA6 |
| stop-pre-wipe-001879 | -35 | 0x001CBC |
| stop-pre-wipe-001879 | -34 | 0x001CE5 |
| stop-pre-wipe-001879 | -33 | 0x001C81 |
| stop-pre-wipe-001879 | -32 | 0x001C82 |
| stop-pre-wipe-001879 | -31 | 0x001C48 |
| stop-pre-wipe-001879 | -30 | 0x001C33 |
| stop-pre-wipe-001879 | -29 | 0x001C38 |
| stop-pre-wipe-001879 | -28 | 0x001C44 |
| stop-pre-wipe-001879 | -27 | 0x001C7D |
| stop-pre-wipe-001879 | -26 | 0x001CA6 |
| stop-pre-wipe-001879 | -25 | 0x001CC0 |
| stop-pre-wipe-001879 | -24 | 0x001CCA |
| stop-pre-wipe-001879 | -23 | 0x001CE4 |
| stop-pre-wipe-001879 | -22 | 0x001C81 |
| stop-pre-wipe-001879 | -21 | 0x001C82 |
| stop-pre-wipe-001879 | -20 | 0x001C48 |
| stop-pre-wipe-001879 | -19 | 0x001C33 |
| stop-pre-wipe-001879 | -18 | 0x001C38 |
| stop-pre-wipe-001879 | -17 | 0x001C44 |
| stop-pre-wipe-001879 | -16 | 0x001C7D |
| stop-pre-wipe-001879 | -15 | 0x001CA6 |
| stop-pre-wipe-001879 | -14 | 0x001CC0 |
| stop-pre-wipe-001879 | -13 | 0x001CCA |
| stop-pre-wipe-001879 | -12 | 0x001CE4 |
| stop-pre-wipe-001879 | -11 | 0x001C81 |
| stop-pre-wipe-001879 | -10 | 0x001C82 |
| stop-pre-wipe-001879 | -9 | 0x001C48 |
| stop-pre-wipe-001879 | -8 | 0x001C33 |
| stop-pre-wipe-001879 | -7 | 0x001C4A |
| stop-pre-wipe-001879 | -6 | 0x0158D2 |
| stop-pre-wipe-001879 | -5 | 0x0158DA |
| stop-pre-wipe-001879 | -4 | 0x0158EC |
| stop-pre-wipe-001879 | -3 | 0x0158EE |
| stop-pre-wipe-001879 | -2 | 0x0158F8 |
| stop-pre-wipe-001879 | -1 | 0x001872 |
| stop-pre-wipe-001879 | 0 | 0x001879 |

## Selected Oracle Fields

| Scenario | Field | Actual | Match |
| --- | --- | --- | --- |
| standalone-clear | D007CA | 0x0585E9 | yes |
| standalone-clear | D008E0 | 0xD1A86C | yes |
| standalone-clear | D010EF | 0xD2A83E | yes |
| standalone-clear | D010FE | 0xD1A8CC | yes |
| standalone-clear | D0243A | 0xD1A8CC | yes |
| standalone-clear | D0243D | 0xD2A83E | yes |
| standalone-clear | D02590 | 0xD3FE81 | yes |
| standalone-clear | D0259D | 0xD3FECD | yes |
| standalone-clear | D0301B | 0x5AA55A | yes |
| standalone-clear | EDIT_TOKEN_D1A8CC | 0x00 | NO |
| transition-baseline | D007CA | 0x000000 | NO |
| transition-baseline | D008E0 | 0x000000 | NO |
| transition-baseline | D010EF | 0x000000 | NO |
| transition-baseline | D010FE | 0x000000 | NO |
| transition-baseline | D0243A | 0x000000 | NO |
| transition-baseline | D0243D | 0x000000 | NO |
| transition-baseline | D02590 | 0x000000 | NO |
| transition-baseline | D0259D | 0x000000 | NO |
| transition-baseline | D0301B | 0x000000 | NO |
| transition-baseline | EDIT_TOKEN_D1A8CC | 0x33 | yes |

## Candidate Idle Frame

No rows.

## Candidate Idle Field Changes

No rows.

## Candidate Idle Target Samples

No rows.

## Baseline Transition Early Changes

| Seq | Field | Before | After | Observed At | Owner PC |
| --- | --- | --- | --- | --- | --- |
| 0 | D00587 | 0x00 | 0x0F | 0x08C331 | - |
| 0 | D0058C | 0x00 | 0x0F | 0x08C331 | - |
| 0 | D0058E | 0x00 | 0x0F | 0x08C331 | - |
| 111 | D00589 | 0x22 | 0x00 | 0x03F9AE | 0x03F9A5 |
| 112 | D0058B | 0x05 | 0x04 | 0x03D058 | 0x03F9AE |
| 1022 | D0058B | 0x04 | 0x03 | 0x03D058 | 0x03F9AE |
| 1164 | D0058B | 0x03 | 0x02 | 0x03D058 | 0x03F9AE |
| 2570 | D0058B | 0x02 | 0x01 | 0x03D058 | 0x03F9AE |
| 2765 | D0058B | 0x01 | 0x00 | 0x03F9B0 | 0x03F9AE |
| 2766 | D0058B | 0x00 | 0x01 | 0x03F9D1 | 0x03F9B0 |
| 2768 | D00587 | 0x0F | 0x00 | 0x03F9D5 | 0x03F9FA |
| 2770 | D00588 | 0x22 | 0x00 | 0x03D058 | 0x03F9DC |
| 3037 | D0058B | 0x01 | 0x00 | 0x03F9B0 | 0x03F9AE |
| 3038 | D0058B | 0x00 | 0x01 | 0x03F9B8 | 0x03F9B0 |
| 3164 | D0058B | 0x01 | 0x00 | 0x03F9B0 | 0x03F9AE |
| 3165 | D0058B | 0x00 | 0x01 | 0x03F9B8 | 0x03F9B0 |
| 3776 | D0058C | 0x0F | 0x00 | 0x02FCB3 | 0x08C359 |
| 3776 | D0058E | 0x0F | 0x00 | 0x02FCB3 | 0x08C359 |
| 3900 | D0058B | 0x01 | 0x00 | 0x03F9B0 | 0x03F9AE |
| 3901 | D0058B | 0x00 | 0x01 | 0x03F9B8 | 0x03F9B0 |
| 4164 | D0058B | 0x01 | 0x00 | 0x03F9B0 | 0x03F9AE |
| 4165 | D0058B | 0x00 | 0x01 | 0x03F9B8 | 0x03F9B0 |
| 4364 | D0058B | 0x01 | 0x00 | 0x03F9B0 | 0x03F9AE |
| 4365 | D0058B | 0x00 | 0x01 | 0x03F9B8 | 0x03F9B0 |
| 4565 | D0058B | 0x01 | 0x00 | 0x03F9B0 | 0x03F9AE |
| 4566 | D0058B | 0x00 | 0x01 | 0x03F9B8 | 0x03F9B0 |
| 4973 | D0058B | 0x01 | 0x00 | 0x03F9B0 | 0x03F9AE |
| 4974 | D0058B | 0x00 | 0x01 | 0x03F9B8 | 0x03F9B0 |
| 5552 | D007CA | 0x0585E9 | 0x000000 | 0x0018F8 | 0x001879 |
| 5552 | D008E0 | 0xD1A86C | 0x000000 | 0x0018F8 | 0x001879 |
| 5552 | D010EF | 0xD2A83E | 0x000000 | 0x0018F8 | 0x001879 |
| 5552 | D010FE | 0xD1A8CC | 0x000000 | 0x0018F8 | 0x001879 |
| 5552 | D010F4 | 0x1F | 0x00 | 0x0018F8 | 0x001879 |
| 5552 | D02317 | 0xD2A83E | 0x000000 | 0x0018F8 | 0x001879 |
| 5552 | D0231A | 0xD2A83E | 0x000000 | 0x0018F8 | 0x001879 |
| 5552 | D0231D | 0xD2A83D | 0x000000 | 0x0018F8 | 0x001879 |
| 5552 | D02437 | 0xD1A8CC | 0x000000 | 0x0018F8 | 0x001879 |
| 5552 | D0243A | 0xD1A8CD | 0x000000 | 0x0018F8 | 0x001879 |
| 5552 | D0243D | 0xD2A83E | 0x000000 | 0x0018F8 | 0x001879 |
| 5552 | D02440 | 0xD2A83E | 0x000000 | 0x0018F8 | 0x001879 |
| 5552 | D02505 | 0x0A | 0x00 | 0x0018F8 | 0x001879 |
| 5552 | D02590 | 0xD3FE81 | 0x000000 | 0x0018F8 | 0x001879 |
| 5552 | D0259D | 0xD3FECD | 0x000000 | 0x0018F8 | 0x001879 |
| 5552 | D0301B | 0x5AA55A | 0x000000 | 0x0018F8 | 0x001879 |
| 5552 | D000CA_IY4A | 0x21 | 0x00 | 0x0018F8 | 0x001879 |
| 5552 | D0058B | 0x01 | 0x00 | 0x0018F8 | 0x001879 |
| 5552 | D00596 | 0x01 | 0x00 | 0x0018F8 | 0x001879 |
| 7300 | D00596 | 0x00 | 0x01 | 0x0059E6 | 0x0059DA |

## Candidate CLEAR Early Changes

No rows.

## Baseline Target Samples

| Seq | PC | Prev | D00587 | D00588 | D00589 | D0058B | D0058C | D0058E | D0243A | Token |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 111 | 0x03F9AE | 0x03F9A5 | 0x0F | 0x22 | 0x00 | 0x05 | 0x0F | 0x0F | 0xD1A8CD | 0x33 |
| 112 | 0x03D058 | 0x03F9AE | 0x0F | 0x22 | 0x00 | 0x04 | 0x0F | 0x0F | 0xD1A8CD | 0x33 |
| 1021 | 0x03F9AE | 0x03F9AB | 0x0F | 0x22 | 0x00 | 0x04 | 0x0F | 0x0F | 0xD1A8CD | 0x33 |
| 1022 | 0x03D058 | 0x03F9AE | 0x0F | 0x22 | 0x00 | 0x03 | 0x0F | 0x0F | 0xD1A8CD | 0x33 |
| 1163 | 0x03F9AE | 0x03F9AB | 0x0F | 0x22 | 0x00 | 0x03 | 0x0F | 0x0F | 0xD1A8CD | 0x33 |
| 1164 | 0x03D058 | 0x03F9AE | 0x0F | 0x22 | 0x00 | 0x02 | 0x0F | 0x0F | 0xD1A8CD | 0x33 |
| 2569 | 0x03F9AE | 0x03F9AB | 0x0F | 0x22 | 0x00 | 0x02 | 0x0F | 0x0F | 0xD1A8CD | 0x33 |
| 2570 | 0x03D058 | 0x03F9AE | 0x0F | 0x22 | 0x00 | 0x01 | 0x0F | 0x0F | 0xD1A8CD | 0x33 |
| 2764 | 0x03F9AE | 0x03F9AB | 0x0F | 0x22 | 0x00 | 0x01 | 0x0F | 0x0F | 0xD1A8CD | 0x33 |
| 2765 | 0x03F9B0 | 0x03F9AE | 0x0F | 0x22 | 0x00 | 0x00 | 0x0F | 0x0F | 0xD1A8CD | 0x33 |
| 2766 | 0x03F9D1 | 0x03F9B0 | 0x0F | 0x22 | 0x00 | 0x01 | 0x0F | 0x0F | 0xD1A8CD | 0x33 |
| 2768 | 0x03F9D5 | 0x03F9FA | 0x00 | 0x22 | 0x00 | 0x01 | 0x0F | 0x0F | 0xD1A8CD | 0x33 |
| 2770 | 0x03D058 | 0x03F9DC | 0x00 | 0x00 | 0x00 | 0x01 | 0x0F | 0x0F | 0xD1A8CD | 0x33 |
| 3036 | 0x03F9AE | 0x03F9AB | 0x00 | 0x00 | 0x00 | 0x01 | 0x0F | 0x0F | 0xD1A8CD | 0x33 |
| 3037 | 0x03F9B0 | 0x03F9AE | 0x00 | 0x00 | 0x00 | 0x00 | 0x0F | 0x0F | 0xD1A8CD | 0x33 |
| 3038 | 0x03F9B8 | 0x03F9B0 | 0x00 | 0x00 | 0x00 | 0x01 | 0x0F | 0x0F | 0xD1A8CD | 0x33 |
| 3039 | 0x03D058 | 0x03F9B8 | 0x00 | 0x00 | 0x00 | 0x01 | 0x0F | 0x0F | 0xD1A8CD | 0x33 |
| 3163 | 0x03F9AE | 0x03F9AB | 0x00 | 0x00 | 0x00 | 0x01 | 0x0F | 0x0F | 0xD1A8CD | 0x33 |
| 3164 | 0x03F9B0 | 0x03F9AE | 0x00 | 0x00 | 0x00 | 0x00 | 0x0F | 0x0F | 0xD1A8CD | 0x33 |
| 3165 | 0x03F9B8 | 0x03F9B0 | 0x00 | 0x00 | 0x00 | 0x01 | 0x0F | 0x0F | 0xD1A8CD | 0x33 |
| 3166 | 0x03D058 | 0x03F9B8 | 0x00 | 0x00 | 0x00 | 0x01 | 0x0F | 0x0F | 0xD1A8CD | 0x33 |
| 3899 | 0x03F9AE | 0x03F9AB | 0x00 | 0x00 | 0x00 | 0x01 | 0x00 | 0x00 | 0xD1A8CD | 0x33 |
| 3900 | 0x03F9B0 | 0x03F9AE | 0x00 | 0x00 | 0x00 | 0x00 | 0x00 | 0x00 | 0xD1A8CD | 0x33 |
| 3901 | 0x03F9B8 | 0x03F9B0 | 0x00 | 0x00 | 0x00 | 0x01 | 0x00 | 0x00 | 0xD1A8CD | 0x33 |
| 3902 | 0x03D058 | 0x03F9B8 | 0x00 | 0x00 | 0x00 | 0x01 | 0x00 | 0x00 | 0xD1A8CD | 0x33 |
| 4163 | 0x03F9AE | 0x03F9AB | 0x00 | 0x00 | 0x00 | 0x01 | 0x00 | 0x00 | 0xD1A8CD | 0x33 |
| 4164 | 0x03F9B0 | 0x03F9AE | 0x00 | 0x00 | 0x00 | 0x00 | 0x00 | 0x00 | 0xD1A8CD | 0x33 |
| 4165 | 0x03F9B8 | 0x03F9B0 | 0x00 | 0x00 | 0x00 | 0x01 | 0x00 | 0x00 | 0xD1A8CD | 0x33 |
| 4166 | 0x03D058 | 0x03F9B8 | 0x00 | 0x00 | 0x00 | 0x01 | 0x00 | 0x00 | 0xD1A8CD | 0x33 |
| 4363 | 0x03F9AE | 0x03F9AB | 0x00 | 0x00 | 0x00 | 0x01 | 0x00 | 0x00 | 0xD1A8CD | 0x33 |
| 4364 | 0x03F9B0 | 0x03F9AE | 0x00 | 0x00 | 0x00 | 0x00 | 0x00 | 0x00 | 0xD1A8CD | 0x33 |
| 4365 | 0x03F9B8 | 0x03F9B0 | 0x00 | 0x00 | 0x00 | 0x01 | 0x00 | 0x00 | 0xD1A8CD | 0x33 |

## Candidate CLEAR Target Samples

No rows.

## Bounded Machine JSON

```json
{
  "pass": true,
  "firstZeroBudget": 3536,
  "firstSafeBudget": null,
  "budgetScan": [
    {
      "budget": 3520,
      "result": {
        "steps": 3520,
        "termination": "max_steps",
        "lastPc": 4983,
        "lastMode": "adl"
      },
      "after": {
        "D00587": 0,
        "D00588": 0,
        "D00589": 0,
        "D0058B": 1,
        "D0058C": 0,
        "D0058E": 0,
        "D00595": 0,
        "D00596": 1,
        "D0243A": 13740237,
        "D0243D": 13805630,
        "token": 51
      },
      "targetCounts": {
        "getCsc03FA09": 1,
        "keyDebounceCounter03F9AE": 9,
        "keyDebounceFallthrough03F9B0": 5,
        "keyDebouncePost03F9B8": 4,
        "keyDebounceRefresh03F9D1": 1,
        "keyDebounceClear03F9D5": 1,
        "keyDebounceReturn03D058": 9,
        "clearFallthrough058A16": 0,
        "clearEntry0A223A": 0,
        "clearAnchor0A229D": 0,
        "preWipe001879": 0,
        "cleanup0018F8": 0,
        "poll006D64": 0
      },
      "safeDrain": false,
      "fieldChanges": [
        {
          "block": 112,
          "seqIndex": 111,
          "name": "D00589",
          "before": 34,
          "after": 0,
          "pc": 260526,
          "ownerPc": 260517
        },
        {
          "block": 113,
          "seqIndex": 112,
          "name": "D0058B",
          "before": 5,
          "after": 4,
          "pc": 249944,
          "ownerPc": 260526
        },
        {
          "block": 1023,
          "seqIndex": 1022,
          "name": "D0058B",
          "before": 4,
          "after": 3,
          "pc": 249944,
          "ownerPc": 260526
        },
        {
          "block": 1165,
          "seqIndex": 1164,
          "name": "D0058B",
          "before": 3,
          "after": 2,
          "pc": 249944,
          "ownerPc": 260526
        },
        {
          "block": 1881,
          "seqIndex": 1880,
          "name": "D0058B",
          "before": 2,
          "after": 1,
          "pc": 249944,
          "ownerPc": 260526
        },
        {
          "block": 2165,
          "seqIndex": 2164,
          "name": "D0058B",
          "before": 1,
          "after": 0,
          "pc": 260528,
          "ownerPc": 260526
        },
        {
          "block": 2166,
          "seqIndex": 2165,
          "name": "D0058B",
          "before": 0,
          "after": 1,
          "pc": 260561,
          "ownerPc": 260528
        },
        {
          "block": 2170,
          "seqIndex": 2169,
          "name": "D00588",
          "before": 34,
          "after": 0,
          "pc": 249944,
          "ownerPc": 260572
        },
        {
          "block": 2391,
          "seqIndex": 2390,
          "name": "D0058B",
          "before": 1,
          "after": 0,
          "pc": 260528,
          "ownerPc": 260526
        },
        {
          "block": 2392,
          "seqIndex": 2391,
          "name": "D0058B",
          "before": 0,
          "after": 1,
          "pc": 260536,
          "ownerPc": 260528
        },
        {
          "block": 2565,
          "seqIndex": 2564,
          "name": "D0058B",
          "before": 1,
          "after": 0,
          "pc": 260528,
          "ownerPc": 260526
        },
        {
          "block": 2566,
          "seqIndex": 2565,
          "name": "D0058B",
          "before": 0,
          "after": 1,
          "pc": 260536,
          "ownerPc": 260528
        }
      ]
    },
    {
      "budget": 3536,
      "result": {
        "steps": 3536,
        "termination": "max_steps",
        "lastPc": 23954,
        "lastMode": "adl"
      },
      "after": {
        "D00587": 0,
        "D00588": 0,
        "D00589": 0,
        "D0058B": 0,
        "D0058C": 0,
        "D0058E": 0,
        "D00595": 0,
        "D00596": 0,
        "D0243A": 0,
        "D0243D": 0,
        "token": 51
      },
      "targetCounts": {
        "getCsc03FA09": 1,
        "keyDebounceCounter03F9AE": 8,
        "keyDebounceFallthrough03F9B0": 4,
        "keyDebouncePost03F9B8": 3,
        "keyDebounceRefresh03F9D1": 1,
        "keyDebounceClear03F9D5": 1,
        "keyDebounceReturn03D058": 8,
        "clearFallthrough058A16": 0,
        "clearEntry0A223A": 0,
        "clearAnchor0A229D": 0,
        "preWipe001879": 1,
        "cleanup0018F8": 1,
        "poll006D64": 0
      },
      "safeDrain": false,
      "fieldChanges": [
        {
          "block": 112,
          "seqIndex": 111,
          "name": "D00589",
          "before": 34,
          "after": 0,
          "pc": 260526,
          "ownerPc": 260517
        },
        {
          "block": 113,
          "seqIndex": 112,
          "name": "D0058B",
          "before": 5,
          "after": 4,
          "pc": 249944,
          "ownerPc": 260526
        },
        {
          "block": 932,
          "seqIndex": 931,
          "name": "D0058B",
          "before": 4,
          "after": 3,
          "pc": 249944,
          "ownerPc": 260526
        },
        {
          "block": 1057,
          "seqIndex": 1056,
          "name": "D0058B",
          "before": 3,
          "after": 2,
          "pc": 249944,
          "ownerPc": 260526
        },
        {
          "block": 1790,
          "seqIndex": 1789,
          "name": "D0058B",
          "before": 2,
          "after": 1,
          "pc": 249944,
          "ownerPc": 260526
        },
        {
          "block": 2057,
          "seqIndex": 2056,
          "name": "D0058B",
          "before": 1,
          "after": 0,
          "pc": 260528,
          "ownerPc": 260526
        },
        {
          "block": 2058,
          "seqIndex": 2057,
          "name": "D0058B",
          "before": 0,
          "after": 1,
          "pc": 260561,
          "ownerPc": 260528
        },
        {
          "block": 2062,
          "seqIndex": 2061,
          "name": "D00588",
          "before": 34,
          "after": 0,
          "pc": 249944,
          "ownerPc": 260572
        },
        {
          "block": 2257,
          "seqIndex": 2256,
          "name": "D0058B",
          "before": 1,
          "after": 0,
          "pc": 260528,
          "ownerPc": 260526
        },
        {
          "block": 2258,
          "seqIndex": 2257,
          "name": "D0058B",
          "before": 0,
          "after": 1,
          "pc": 260536,
          "ownerPc": 260528
        },
        {
          "block": 2457,
          "seqIndex": 2456,
          "name": "D0058B",
          "before": 1,
          "after": 0,
          "pc": 260528,
          "ownerPc": 260526
        },
        {
          "block": 2458,
          "seqIndex": 2457,
          "name": "D0058B",
          "before": 0,
          "after": 1,
          "pc": 260536,
          "ownerPc": 260528
        }
      ]
    },
    {
      "budget": 3552,
      "result": {
        "steps": 3552,
        "termination": "max_steps",
        "lastPc": 23705,
        "lastMode": "adl"
      },
      "after": {
        "D00587": 0,
        "D00588": 0,
        "D00589": 0,
        "D0058B": 0,
        "D0058C": 0,
        "D0058E": 0,
        "D00595": 0,
        "D00596": 0,
        "D0243A": 0,
        "D0243D": 0,
        "token": 51
      },
      "targetCounts": {
        "getCsc03FA09": 1,
        "keyDebounceCounter03F9AE": 8,
        "keyDebounceFallthrough03F9B0": 4,
        "keyDebouncePost03F9B8": 3,
        "keyDebounceRefresh03F9D1": 1,
        "keyDebounceClear03F9D5": 1,
        "keyDebounceReturn03D058": 8,
        "clearFallthrough058A16": 0,
        "clearEntry0A223A": 0,
        "clearAnchor0A229D": 0,
        "preWipe001879": 1,
        "cleanup0018F8": 1,
        "poll006D64": 0
      },
      "safeDrain": false,
      "fieldChanges": [
        {
          "block": 112,
          "seqIndex": 111,
          "name": "D00589",
          "before": 34,
          "after": 0,
          "pc": 260526,
          "ownerPc": 260517
        },
        {
          "block": 113,
          "seqIndex": 112,
          "name": "D0058B",
          "before": 5,
          "after": 4,
          "pc": 249944,
          "ownerPc": 260526
        },
        {
          "block": 330,
          "seqIndex": 329,
          "name": "D0058B",
          "before": 4,
          "after": 3,
          "pc": 249944,
          "ownerPc": 260526
        },
        {
          "block": 1140,
          "seqIndex": 1139,
          "name": "D0058B",
          "before": 3,
          "after": 2,
          "pc": 249944,
          "ownerPc": 260526
        },
        {
          "block": 1880,
          "seqIndex": 1879,
          "name": "D0058B",
          "before": 2,
          "after": 1,
          "pc": 249944,
          "ownerPc": 260526
        },
        {
          "block": 2130,
          "seqIndex": 2129,
          "name": "D0058B",
          "before": 1,
          "after": 0,
          "pc": 260528,
          "ownerPc": 260526
        },
        {
          "block": 2131,
          "seqIndex": 2130,
          "name": "D0058B",
          "before": 0,
          "after": 1,
          "pc": 260561,
          "ownerPc": 260528
        },
        {
          "block": 2135,
          "seqIndex": 2134,
          "name": "D00588",
          "before": 34,
          "after": 0,
          "pc": 249944,
          "ownerPc": 260572
        },
        {
          "block": 2342,
          "seqIndex": 2341,
          "name": "D0058B",
          "before": 1,
          "after": 0,
          "pc": 260528,
          "ownerPc": 260526
        },
        {
          "block": 2343,
          "seqIndex": 2342,
          "name": "D0058B",
          "before": 0,
          "after": 1,
          "pc": 260536,
          "ownerPc": 260528
        },
        {
          "block": 2530,
          "seqIndex": 2529,
          "name": "D0058B",
          "before": 1,
          "after": 0,
          "pc": 260528,
          "ownerPc": 260526
        },
        {
          "block": 2531,
          "seqIndex": 2530,
          "name": "D0058B",
          "before": 0,
          "after": 1,
          "pc": 260536,
          "ownerPc": 260528
        }
      ]
    },
    {
      "budget": 3568,
      "result": {
        "steps": 3568,
        "termination": "max_steps",
        "lastPc": 7334,
        "lastMode": "adl"
      },
      "after": {
        "D00587": 0,
        "D00588": 0,
        "D00589": 0,
        "D0058B": 1,
        "D0058C": 0,
        "D0058E": 0,
        "D00595": 0,
        "D00596": 1,
        "D0243A": 13740237,
        "D0243D": 13805630,
        "token": 51
      },
      "targetCounts": {
        "getCsc03FA09": 1,
        "keyDebounceCounter03F9AE": 8,
        "keyDebounceFallthrough03F9B0": 4,
        "keyDebouncePost03F9B8": 3,
        "keyDebounceRefresh03F9D1": 1,
        "keyDebounceClear03F9D5": 1,
        "keyDebounceReturn03D058": 8,
        "clearFallthrough058A16": 0,
        "clearEntry0A223A": 0,
        "clearAnchor0A229D": 0,
        "preWipe001879": 0,
        "cleanup0018F8": 0,
        "poll006D64": 0
      },
      "safeDrain": false,
      "fieldChanges": [
        {
          "block": 112,
          "seqIndex": 111,
          "name": "D00589",
          "before": 34,
          "after": 0,
          "pc": 260526,
          "ownerPc": 260517
        },
        {
          "block": 113,
          "seqIndex": 112,
          "name": "D0058B",
          "before": 5,
          "after": 4,
          "pc": 249944,
          "ownerPc": 260526
        },
        {
          "block": 1023,
          "seqIndex": 1022,
          "name": "D0058B",
          "before": 4,
          "after": 3,
          "pc": 249944,
          "ownerPc": 260526
        },
        {
          "block": 1763,
          "seqIndex": 1762,
          "name": "D0058B",
          "before": 3,
          "after": 2,
          "pc": 249944,
          "ownerPc": 260526
        },
        {
          "block": 1988,
          "seqIndex": 1987,
          "name": "D0058B",
          "before": 2,
          "after": 1,
          "pc": 249944,
          "ownerPc": 260526
        },
        {
          "block": 2190,
          "seqIndex": 2189,
          "name": "D0058B",
          "before": 1,
          "after": 0,
          "pc": 260528,
          "ownerPc": 260526
        },
        {
          "block": 2191,
          "seqIndex": 2190,
          "name": "D0058B",
          "before": 0,
          "after": 1,
          "pc": 260561,
          "ownerPc": 260528
        },
        {
          "block": 2195,
          "seqIndex": 2194,
          "name": "D00588",
          "before": 34,
          "after": 0,
          "pc": 249944,
          "ownerPc": 260572
        },
        {
          "block": 2391,
          "seqIndex": 2390,
          "name": "D0058B",
          "before": 1,
          "after": 0,
          "pc": 260528,
          "ownerPc": 260526
        },
        {
          "block": 2392,
          "seqIndex": 2391,
          "name": "D0058B",
          "before": 0,
          "after": 1,
          "pc": 260536,
          "ownerPc": 260528
        },
        {
          "block": 2588,
          "seqIndex": 2587,
          "name": "D0058B",
          "before": 1,
          "after": 0,
          "pc": 260528,
          "ownerPc": 260526
        },
        {
          "block": 2589,
          "seqIndex": 2588,
          "name": "D0058B",
          "before": 0,
          "after": 1,
          "pc": 260536,
          "ownerPc": 260528
        }
      ]
    },
    {
      "budget": 3584,
      "result": {
        "steps": 3584,
        "termination": "max_steps",
        "lastPc": 24861,
        "lastMode": "adl"
      },
      "after": {
        "D00587": 0,
        "D00588": 0,
        "D00589": 0,
        "D0058B": 0,
        "D0058C": 0,
        "D0058E": 0,
        "D00595": 0,
        "D00596": 0,
        "D0243A": 0,
        "D0243D": 0,
        "token": 51
      },
      "targetCounts": {
        "getCsc03FA09": 1,
        "keyDebounceCounter03F9AE": 8,
        "keyDebounceFallthrough03F9B0": 4,
        "keyDebouncePost03F9B8": 3,
        "keyDebounceRefresh03F9D1": 1,
        "keyDebounceClear03F9D5": 1,
        "keyDebounceReturn03D058": 8,
        "clearFallthrough058A16": 0,
        "clearEntry0A223A": 0,
        "clearAnchor0A229D": 0,
        "preWipe001879": 1,
        "cleanup0018F8": 1,
        "poll006D64": 0
      },
      "safeDrain": false,
      "fieldChanges": [
        {
          "block": 112,
          "seqIndex": 111,
          "name": "D00589",
          "before": 34,
          "after": 0,
          "pc": 260526,
          "ownerPc": 260517
        },
        {
          "block": 113,
          "seqIndex": 112,
          "name": "D0058B",
          "before": 5,
          "after": 4,
          "pc": 249944,
          "ownerPc": 260526
        },
        {
          "block": 231,
          "seqIndex": 230,
          "name": "D0058B",
          "before": 4,
          "after": 3,
          "pc": 249944,
          "ownerPc": 260526
        },
        {
          "block": 1050,
          "seqIndex": 1049,
          "name": "D0058B",
          "before": 3,
          "after": 2,
          "pc": 249944,
          "ownerPc": 260526
        },
        {
          "block": 1790,
          "seqIndex": 1789,
          "name": "D0058B",
          "before": 2,
          "after": 1,
          "pc": 249944,
          "ownerPc": 260526
        },
        {
          "block": 2031,
          "seqIndex": 2030,
          "name": "D0058B",
          "before": 1,
          "after": 0,
          "pc": 260528,
          "ownerPc": 260526
        },
        {
          "block": 2032,
          "seqIndex": 2031,
          "name": "D0058B",
          "before": 0,
          "after": 1,
          "pc": 260561,
          "ownerPc": 260528
        },
        {
          "block": 2036,
          "seqIndex": 2035,
          "name": "D00588",
          "before": 34,
          "after": 0,
          "pc": 249944,
          "ownerPc": 260572
        },
        {
          "block": 2252,
          "seqIndex": 2251,
          "name": "D0058B",
          "before": 1,
          "after": 0,
          "pc": 260528,
          "ownerPc": 260526
        },
        {
          "block": 2253,
          "seqIndex": 2252,
          "name": "D0058B",
          "before": 0,
          "after": 1,
          "pc": 260536,
          "ownerPc": 260528
        },
        {
          "block": 2431,
          "seqIndex": 2430,
          "name": "D0058B",
          "before": 1,
          "after": 0,
          "pc": 260528,
          "ownerPc": 260526
        },
        {
          "block": 2432,
          "seqIndex": 2431,
          "name": "D0058B",
          "before": 0,
          "after": 1,
          "pc": 260536,
          "ownerPc": 260528
        }
      ]
    }
  ],
  "stopFrames": [
    {
      "label": "budget-scan stop-first-zero-counter",
      "budget": 10000,
      "result": {
        "steps": 2061,
        "termination": "phase914_stop_first-zero-counter",
        "lastPc": 260528,
        "lastMode": "adl"
      },
      "stopEvent": {
        "kind": "first-zero-counter",
        "block": 2056,
        "seqIndex": 2055,
        "pc": 260528,
        "mode": "adl",
        "steps": 2061,
        "fields": {
          "D007CA": 361961,
          "D008E0": 13740140,
          "D010EF": 13805630,
          "D010FE": 13740236,
          "D010F4": 31,
          "D02317": 13805630,
          "D0231A": 13805630,
          "D0231D": 13805629,
          "D02437": 13740236,
          "D0243A": 13740237,
          "D0243D": 13805630,
          "D02440": 13805630,
          "D02505": 10,
          "D02590": 13893249,
          "D0259D": 13893325,
          "D02A29": 0,
          "D0301B": 5940570,
          "D000CA_IY4A": 33,
          "D00587": 0,
          "D00588": 34,
          "D00589": 0,
          "D0058B": 0,
          "D0058C": 0,
          "D0058E": 0,
          "D00595": 0,
          "D00596": 1,
          "EDIT_TOKEN_D1A8CC": 51
        },
        "cpu": {
          "pc": 260528,
          "currentBlockPc": 260528,
          "sp": 13740076,
          "af": 66,
          "bc": 40968,
          "de": 32960,
          "hl": 13632907,
          "ix": 13740101,
          "iy": 13631616,
          "f": 66,
          "halted": false
        },
        "targetCounts": {
          "getCsc03FA09": 1,
          "keyDebounceCounter03F9AE": 5,
          "keyDebounceFallthrough03F9B0": 1,
          "keyDebouncePost03F9B8": 0,
          "keyDebounceRefresh03F9D1": 0,
          "keyDebounceClear03F9D5": 0,
          "keyDebounceReturn03D058": 4,
          "clearFallthrough058A16": 0,
          "clearEntry0A223A": 0,
          "clearAnchor0A229D": 0,
          "preWipe001879": 0,
          "cleanup0018F8": 0,
          "poll006D64": 0
        },
        "recentFieldChanges": [
          {
            "block": 112,
            "seqIndex": 111,
            "name": "D00589",
            "before": 34,
            "after": 0,
            "pc": 260526,
            "ownerPc": 260517
          },
          {
            "block": 113,
            "seqIndex": 112,
            "name": "D0058B",
            "before": 5,
            "after": 4,
            "pc": 249944,
            "ownerPc": 260526
          },
          {
            "block": 932,
            "seqIndex": 931,
            "name": "D0058B",
            "before": 4,
            "after": 3,
            "pc": 249944,
            "ownerPc": 260526
          },
          {
            "block": 1056,
            "seqIndex": 1055,
            "name": "D0058B",
            "before": 3,
            "after": 2,
            "pc": 249944,
            "ownerPc": 260526
          },
          {
            "block": 1790,
            "seqIndex": 1789,
            "name": "D0058B",
            "before": 2,
            "after": 1,
            "pc": 249944,
            "ownerPc": 260526
          },
          {
            "block": 2056,
            "seqIndex": 2055,
            "name": "D0058B",
            "before": 1,
            "after": 0,
            "pc": 260528,
            "ownerPc": 260526
          }
        ],
        "recentSequence": [
          7297,
          7298,
          7240,
          7219,
          7224,
          7228,
          7234,
          26640,
          26642,
          7247,
          7334,
          7360,
          7370,
          7396,
          7252,
          26646,
          26654,
          26664,
          5927,
          1817,
          1821,
          131340,
          249725,
          249764,
          249807,
          249812,
          249819,
          249824,
          249829,
          249834,
          249897,
          249907,
          249912,
          249924,
          249932,
          249940,
          260500,
          980,
          15554,
          15572,
          15584,
          15598,
          15603,
          260504,
          260506,
          260523,
          260526,
          260528
        ]
      },
      "after": {
        "D00587": 0,
        "D00588": 34,
        "D00589": 0,
        "D0058B": 0,
        "D0058C": 0,
        "D0058E": 0,
        "D00595": 0,
        "D00596": 1,
        "D0243A": 13740237,
        "D0243D": 13805630,
        "token": 51
      }
    },
    {
      "label": "budget-scan stop-pre-wipe-001879",
      "budget": 10000,
      "result": {
        "steps": 3208,
        "termination": "phase914_stop_pre-wipe-001879",
        "lastPc": 6265,
        "lastMode": "adl"
      },
      "stopEvent": {
        "kind": "pre-wipe-001879",
        "block": 3202,
        "seqIndex": 3201,
        "pc": 6265,
        "mode": "adl",
        "steps": 3208,
        "fields": {
          "D007CA": 361961,
          "D008E0": 13740140,
          "D010EF": 13805630,
          "D010FE": 13740236,
          "D010F4": 31,
          "D02317": 13805630,
          "D0231A": 13805630,
          "D0231D": 13805629,
          "D02437": 13740236,
          "D0243A": 13740237,
          "D0243D": 13805630,
          "D02440": 13805630,
          "D02505": 10,
          "D02590": 13893249,
          "D0259D": 13893325,
          "D02A29": 0,
          "D0301B": 5940570,
          "D000CA_IY4A": 33,
          "D00587": 0,
          "D00588": 0,
          "D00589": 0,
          "D0058B": 1,
          "D0058C": 0,
          "D0058E": 0,
          "D00595": 0,
          "D00596": 1,
          "EDIT_TOKEN_D1A8CC": 51
        },
        "cpu": {
          "pc": 6265,
          "currentBlockPc": 6265,
          "sp": 13740155,
          "af": 61012,
          "bc": 3,
          "de": 1072,
          "hl": 0,
          "ix": 0,
          "iy": 13631616,
          "f": 84,
          "halted": false
        },
        "targetCounts": {
          "getCsc03FA09": 1,
          "keyDebounceCounter03F9AE": 6,
          "keyDebounceFallthrough03F9B0": 2,
          "keyDebouncePost03F9B8": 1,
          "keyDebounceRefresh03F9D1": 1,
          "keyDebounceClear03F9D5": 1,
          "keyDebounceReturn03D058": 6,
          "clearFallthrough058A16": 0,
          "clearEntry0A223A": 0,
          "clearAnchor0A229D": 0,
          "preWipe001879": 1,
          "cleanup0018F8": 0,
          "poll006D64": 0
        },
        "recentFieldChanges": [
          {
            "block": 813,
            "seqIndex": 812,
            "name": "D00589",
            "before": 34,
            "after": 0,
            "pc": 260526,
            "ownerPc": 260517
          },
          {
            "block": 814,
            "seqIndex": 813,
            "name": "D0058B",
            "before": 5,
            "after": 4,
            "pc": 249944,
            "ownerPc": 260526
          },
          {
            "block": 1554,
            "seqIndex": 1553,
            "name": "D0058B",
            "before": 4,
            "after": 3,
            "pc": 249944,
            "ownerPc": 260526
          },
          {
            "block": 1801,
            "seqIndex": 1800,
            "name": "D0058B",
            "before": 3,
            "after": 2,
            "pc": 249944,
            "ownerPc": 260526
          },
          {
            "block": 2011,
            "seqIndex": 2010,
            "name": "D0058B",
            "before": 2,
            "after": 1,
            "pc": 249944,
            "ownerPc": 260526
          },
          {
            "block": 2201,
            "seqIndex": 2200,
            "name": "D0058B",
            "before": 1,
            "after": 0,
            "pc": 260528,
            "ownerPc": 260526
          },
          {
            "block": 2202,
            "seqIndex": 2201,
            "name": "D0058B",
            "before": 0,
            "after": 1,
            "pc": 260561,
            "ownerPc": 260528
          },
          {
            "block": 2206,
            "seqIndex": 2205,
            "name": "D00588",
            "before": 34,
            "after": 0,
            "pc": 249944,
            "ownerPc": 260572
          },
          {
            "block": 2624,
            "seqIndex": 2623,
            "name": "D0058B",
            "before": 1,
            "after": 0,
            "pc": 260528,
            "ownerPc": 260526
          },
          {
            "block": 2625,
            "seqIndex": 2624,
            "name": "D0058B",
            "before": 0,
            "after": 1,
            "pc": 260536,
            "ownerPc": 260528
          }
        ],
        "recentSequence": [
          7293,
          7334,
          7356,
          7397,
          7297,
          7298,
          7240,
          7219,
          7224,
          7236,
          7293,
          7334,
          7356,
          7397,
          7297,
          7298,
          7240,
          7219,
          7224,
          7236,
          7293,
          7334,
          7360,
          7370,
          7396,
          7297,
          7298,
          7240,
          7219,
          7224,
          7236,
          7293,
          7334,
          7360,
          7370,
          7396,
          7297,
          7298,
          7240,
          7219,
          7242,
          88274,
          88282,
          88300,
          88302,
          88312,
          6258,
          6265
        ]
      },
      "after": {
        "D00587": 0,
        "D00588": 0,
        "D00589": 0,
        "D0058B": 1,
        "D0058C": 0,
        "D0058E": 0,
        "D00595": 0,
        "D00596": 1,
        "D0243A": 13740237,
        "D0243D": 13805630,
        "token": 51
      }
    }
  ],
  "routes": [
    {
      "label": "standalone-clear",
      "afterDigit": null,
      "afterDigitSettled": null,
      "afterWallClockDelay": null,
      "idleFrames": [],
      "afterClear": {
        "termination": "control_pre_stop",
        "steps": 74340,
        "uiClearApplied": true,
        "wipes": 0,
        "D007CA": 361961,
        "D0243A": 13740236,
        "D0058B": 196,
        "token": 0
      },
      "firstCounter": {
        "found": true,
        "anchorIndex": 3842,
        "counterIndex": 3953,
        "counterPc": 260526,
        "nextIndex": 3954,
        "nextPc": 249944
      },
      "targetCounts": {
        "getCsc03FA09": 1,
        "keyDebounceCounter03F9AE": 15,
        "keyDebounceFallthrough03F9B0": 0,
        "keyDebouncePost03F9B8": 0,
        "keyDebounceRefresh03F9D1": 0,
        "keyDebounceClear03F9D5": 0,
        "keyDebounceReturn03D058": 15,
        "clearFallthrough058A16": 1,
        "clearEntry0A223A": 1,
        "clearAnchor0A229D": 1,
        "preWipe001879": 0,
        "cleanup0018F8": 0,
        "poll006D64": 0
      }
    },
    {
      "label": "transition-baseline",
      "afterDigit": {
        "D00587": 0,
        "D00588": 34,
        "D00589": 34,
        "D0058B": 5,
        "D0058C": 0,
        "D0058E": 0,
        "D00595": 0,
        "D00596": 1,
        "D0243A": 13740237,
        "D0243D": 13805630,
        "token": 51
      },
      "afterDigitSettled": {
        "D00587": 0,
        "D00588": 34,
        "D00589": 34,
        "D0058B": 5,
        "D0058C": 0,
        "D0058E": 0,
        "D00595": 0,
        "D00596": 1,
        "D0243A": 13740237,
        "D0243D": 13805630,
        "token": 51
      },
      "afterWallClockDelay": null,
      "idleFrames": [],
      "afterClear": {
        "termination": "max_steps",
        "steps": 350000,
        "uiClearApplied": false,
        "wipes": 3,
        "D007CA": 0,
        "D0243A": 0,
        "D0058B": 0,
        "token": 51
      },
      "firstCounter": {
        "found": true,
        "anchorIndex": 3788,
        "counterIndex": 3899,
        "counterPc": 260526,
        "nextIndex": 3900,
        "nextPc": 260528
      },
      "targetCounts": {
        "getCsc03FA09": 2,
        "keyDebounceCounter03F9AE": 20,
        "keyDebounceFallthrough03F9B0": 8,
        "keyDebouncePost03F9B8": 7,
        "keyDebounceRefresh03F9D1": 1,
        "keyDebounceClear03F9D5": 1,
        "keyDebounceReturn03D058": 20,
        "clearFallthrough058A16": 0,
        "clearEntry0A223A": 0,
        "clearAnchor0A229D": 0,
        "preWipe001879": 3,
        "cleanup0018F8": 3,
        "poll006D64": 20176
      }
    }
  ],
  "routeSummaries": [
    {
      "label": "standalone-clear",
      "firstCounter": {
        "found": true,
        "anchorIndex": 3842,
        "counterIndex": 3953,
        "counterPc": 260526,
        "nextIndex": 3954,
        "nextPc": 249944
      },
      "afterDigit": null,
      "afterWallClockDelay": null,
      "idleFrames": [],
      "key": {
        "termination": "control_pre_stop",
        "steps": 74340,
        "uiClearApplied": true,
        "wipes": 0,
        "controlStopPc": 664221,
        "vramPeak": 8518,
        "vramCurrent": 8482
      },
      "counts": {
        "getCsc03FA09": 1,
        "keyDebounceCounter03F9AE": 15,
        "keyDebounceFallthrough03F9B0": 0,
        "keyDebouncePost03F9B8": 0,
        "keyDebounceRefresh03F9D1": 0,
        "keyDebounceClear03F9D5": 0,
        "keyDebounceReturn03D058": 15,
        "clearFallthrough058A16": 1,
        "clearEntry0A223A": 1,
        "clearAnchor0A229D": 1,
        "preWipe001879": 0,
        "cleanup0018F8": 0,
        "poll006D64": 0
      },
      "oracleMismatches": [
        {
          "name": "EDIT_TOKEN_D1A8CC",
          "oracle": 51,
          "actual": 0
        }
      ]
    },
    {
      "label": "transition-baseline",
      "firstCounter": {
        "found": true,
        "anchorIndex": 3788,
        "counterIndex": 3899,
        "counterPc": 260526,
        "nextIndex": 3900,
        "nextPc": 260528
      },
      "afterDigit": {
        "D00587": 0,
        "D00588": 34,
        "D00589": 34,
        "D0058B": 5,
        "D0058C": 0,
        "D0058E": 0,
        "D00595": 0,
        "D00596": 1,
        "D0243A": 13740237,
        "D0243D": 13805630,
        "token": 51
      },
      "afterWallClockDelay": null,
      "idleFrames": [],
      "key": {
        "termination": "max_steps",
        "steps": 350000,
        "uiClearApplied": false,
        "wipes": 3,
        "controlStopPc": null,
        "vramPeak": 8689,
        "vramCurrent": 3039
      },
      "counts": {
        "getCsc03FA09": 2,
        "keyDebounceCounter03F9AE": 20,
        "keyDebounceFallthrough03F9B0": 8,
        "keyDebouncePost03F9B8": 7,
        "keyDebounceRefresh03F9D1": 1,
        "keyDebounceClear03F9D5": 1,
        "keyDebounceReturn03D058": 20,
        "clearFallthrough058A16": 0,
        "clearEntry0A223A": 0,
        "clearAnchor0A229D": 0,
        "preWipe001879": 3,
        "cleanup0018F8": 3,
        "poll006D64": 20176
      },
      "oracleMismatches": [
        {
          "name": "D007CA",
          "oracle": 361961,
          "actual": 0
        },
        {
          "name": "D008E0",
          "oracle": 13740140,
          "actual": 0
        },
        {
          "name": "D010EF",
          "oracle": 13805630,
          "actual": 0
        },
        {
          "name": "D010FE",
          "oracle": 13740236,
          "actual": 0
        },
        {
          "name": "D010F4",
          "oracle": 31,
          "actual": 0
        },
        {
          "name": "D02317",
          "oracle": 13805630,
          "actual": 0
        },
        {
          "name": "D0231A",
          "oracle": 13805630,
          "actual": 0
        },
        {
          "name": "D0231D",
          "oracle": 13805629,
          "actual": 0
        },
        {
          "name": "D02437",
          "oracle": 13740236,
          "actual": 0
        },
        {
          "name": "D0243A",
          "oracle": 13740236,
          "actual": 0
        },
        {
          "name": "D0243D",
          "oracle": 13805630,
          "actual": 0
        },
        {
          "name": "D02440",
          "oracle": 13805630,
          "actual": 0
        },
        {
          "name": "D02505",
          "oracle": 10,
          "actual": 0
        },
        {
          "name": "D02590",
          "oracle": 13893249,
          "actual": 0
        },
        {
          "name": "D0259D",
          "oracle": 13893325,
          "actual": 0
        },
        {
          "name": "D0301B",
          "oracle": 5940570,
          "actual": 0
        }
      ]
    }
  ]
}
```

No runtime, transpiler, browser-shell, decoder, peripheral, scheduler, ROM artifact, or `follow-alongs/` files were changed.


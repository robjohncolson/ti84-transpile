# Phase 913: D0058B Minimal Debounce Drain

Probe: `probe-phase913-d0058b-minimal-drain.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase913-d0058b-minimal-drain.mjs`

Serves a temporary instrumented copy of `browser-shell.html`. Disk `browser-shell.html` is not edited.

## Summary

- Probe completed: PASS.
- Digit3 leaves the browser state at D0058B=0x05 and D00587=0x00 before the next CLEAR burst.
- Baseline Digit3 -> CLEAR countdown reaches first post-GetCSC 0x03F9AE next=0x03F9B0, 0x03F9B0 count=8, wipes=3, termination=max_steps.
- Budgets tested from the same post-Digit3 snapshot: 256, 512, 768, 1024, 1280, 1536, 1792, 2048, 2304, 2560, 3072, 3136, 3200, 3264, 3328, 3392, 3456, 3520, 3584, 4096, 5120, 6144, 8192, 12288, 16384 steps.
- First budget with D0058B=0: 3584 steps; first safe drain preserving cxMain/cursor/token and avoiding 0x001879/0x0018F8: none.
- Candidate CLEAR after no safe drain: 0x0A229D=-, wipes=-, uiClearApplied=no, oracleMismatches=-.
- Standalone CLEAR baseline: first 0x03F9AE next=0x03D058, 0x0A229D=1, wipes=0, uiClearApplied=true.
- Interpretation: D0058B first reaches zero by 3584 tested steps, but every zero-counter budget in this scan has side effects or lost edit/context state. No narrow no-key drain was found in the tested window.

## CLEAR Route Summary

| Scenario | After Digit3 D0058B | After delay D0058B | Idle-frame D0058B | First 0x03F9AE next | 0x03F9B0 | 0x03F9B8 | 0x03F9D1 | 0x03F9D5 | 0x0A229D | 0x001879 | 0x0018F8 | Term | UI clear | Wipes | Oracle mismatches |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| standalone-clear | - | - | - | 0x03D058 | 0 | 0 | 0 | 0 | 1 | 0 | 0 | control_pre_stop | yes | 0 | 1 |
| transition-baseline | 0x05 | - | - | 0x03F9B0 | 8 | 7 | 1 | 1 | 0 | 3 | 3 | max_steps | no | 3 | 16 |

## Budget Scan

| Budget | Steps | Term | D0058B | D00587 | D00588 | D00589 | D007CA | D0243A | Token | 0x03F9AE | 0x03F9B0 | 0x03D058 | 0x001879 | 0x0018F8 | Safe drain |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 256 | 256 | max_steps | 0x04 | 0x00 | 0x22 | 0x00 | 0x0585E9 | 0xD1A8CD | 0x33 | 1 | 0 | 1 | 0 | 0 | no |
| 512 | 512 | max_steps | 0x04 | 0x00 | 0x22 | 0x00 | 0x0585E9 | 0xD1A8CD | 0x33 | 1 | 0 | 1 | 0 | 0 | no |
| 768 | 768 | max_steps | 0x04 | 0x00 | 0x22 | 0x00 | 0x0585E9 | 0xD1A8CD | 0x33 | 1 | 0 | 1 | 0 | 0 | no |
| 1024 | 1024 | max_steps | 0x03 | 0x00 | 0x22 | 0x00 | 0x0585E9 | 0xD1A8CD | 0x33 | 2 | 0 | 2 | 0 | 0 | no |
| 1280 | 1280 | max_steps | 0x04 | 0x00 | 0x22 | 0x00 | 0x0585E9 | 0xD1A8CD | 0x33 | 1 | 0 | 1 | 0 | 0 | no |
| 1536 | 1536 | max_steps | 0x02 | 0x00 | 0x22 | 0x00 | 0x0585E9 | 0xD1A8CD | 0x33 | 3 | 0 | 3 | 0 | 0 | no |
| 1792 | 1792 | max_steps | 0x02 | 0x00 | 0x22 | 0x00 | 0x0585E9 | 0xD1A8CD | 0x33 | 3 | 0 | 3 | 0 | 0 | no |
| 2048 | 2048 | max_steps | 0x01 | 0x00 | 0x22 | 0x00 | 0x0585E9 | 0xD1A8CD | 0x33 | 4 | 0 | 4 | 0 | 0 | no |
| 2304 | 2304 | max_steps | 0x01 | 0x00 | 0x00 | 0x00 | 0x0585E9 | 0xD1A8CD | 0x33 | 5 | 1 | 5 | 0 | 0 | no |
| 2560 | 2560 | max_steps | 0x01 | 0x00 | 0x00 | 0x00 | 0x0585E9 | 0xD1A8CD | 0x33 | 6 | 2 | 6 | 0 | 0 | no |
| 3072 | 3072 | max_steps | 0x01 | 0x00 | 0x00 | 0x00 | 0x0585E9 | 0xD1A8CD | 0x33 | 7 | 3 | 7 | 0 | 0 | no |
| 3136 | 3136 | max_steps | 0x01 | 0x00 | 0x00 | 0x00 | 0x0585E9 | 0xD1A8CD | 0x33 | 8 | 4 | 8 | 0 | 0 | no |
| 3200 | 3200 | max_steps | 0x01 | 0x00 | 0x00 | 0x00 | 0x0585E9 | 0xD1A8CD | 0x33 | 8 | 4 | 8 | 0 | 0 | no |
| 3264 | 3264 | max_steps | 0x01 | 0x00 | 0x00 | 0x00 | 0x0585E9 | 0xD1A8CD | 0x33 | 8 | 4 | 8 | 0 | 0 | no |
| 3328 | 3328 | max_steps | 0x01 | 0x00 | 0x00 | 0x00 | 0x0585E9 | 0xD1A8CD | 0x33 | 8 | 4 | 8 | 0 | 0 | no |
| 3392 | 3392 | max_steps | 0x01 | 0x00 | 0x00 | 0x00 | 0x0585E9 | 0xD1A8CD | 0x33 | 8 | 4 | 8 | 0 | 0 | no |
| 3456 | 3456 | max_steps | 0x01 | 0x00 | 0x00 | 0x00 | 0x0585E9 | 0xD1A8CD | 0x33 | 8 | 4 | 8 | 0 | 0 | no |
| 3520 | 3520 | max_steps | 0x01 | 0x00 | 0x00 | 0x00 | 0x0585E9 | 0xD1A8CD | 0x33 | 8 | 4 | 8 | 0 | 0 | no |
| 3584 | 3584 | max_steps | 0x00 | 0x00 | 0x00 | 0x00 | 0x000000 | 0x000000 | 0x33 | 8 | 4 | 8 | 1 | 1 | no |
| 4096 | 4096 | max_steps | 0x00 | 0x00 | 0x00 | 0x00 | 0x000000 | 0x000000 | 0x33 | 8 | 4 | 8 | 1 | 1 | no |
| 5120 | 5120 | max_steps | 0x00 | 0x00 | 0x00 | 0x00 | 0x000000 | 0x000000 | 0x33 | 8 | 4 | 8 | 1 | 1 | no |
| 6144 | 6144 | max_steps | 0x00 | 0x00 | 0x00 | 0x00 | 0x000000 | 0x000000 | 0x33 | 8 | 4 | 8 | 1 | 1 | no |
| 8192 | 8192 | max_steps | 0x00 | 0x00 | 0x00 | 0x00 | 0x000000 | 0x000000 | 0x33 | 8 | 4 | 8 | 1 | 1 | no |
| 12288 | 12288 | max_steps | 0x00 | 0x00 | 0x00 | 0x00 | 0x000000 | 0x000000 | 0x33 | 8 | 4 | 8 | 1 | 1 | no |
| 16384 | 16384 | max_steps | 0x00 | 0x00 | 0x00 | 0x00 | 0x000000 | 0x000000 | 0x33 | 9 | 5 | 9 | 1 | 1 | no |

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
  "firstZeroBudget": 3584,
  "firstSafeBudget": null,
  "budgetScan": [
    {
      "budget": 256,
      "result": {
        "steps": 256,
        "termination": "max_steps",
        "lastPc": 661679,
        "lastMode": "adl"
      },
      "after": {
        "D00587": 0,
        "D00588": 34,
        "D00589": 0,
        "D0058B": 4,
        "D0058C": 0,
        "D0058E": 0,
        "D00595": 0,
        "D00596": 1,
        "D0243A": 13740237,
        "D0243D": 13805630,
        "token": 51
      },
      "targetCounts": {
        "getCsc03FA09": 0,
        "keyDebounceCounter03F9AE": 1,
        "keyDebounceFallthrough03F9B0": 0,
        "keyDebouncePost03F9B8": 0,
        "keyDebounceRefresh03F9D1": 0,
        "keyDebounceClear03F9D5": 0,
        "keyDebounceReturn03D058": 1,
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
        }
      ]
    },
    {
      "budget": 512,
      "result": {
        "steps": 512,
        "termination": "max_steps",
        "lastPc": 661737,
        "lastMode": "adl"
      },
      "after": {
        "D00587": 0,
        "D00588": 34,
        "D00589": 0,
        "D0058B": 4,
        "D0058C": 0,
        "D0058E": 0,
        "D00595": 0,
        "D00596": 1,
        "D0243A": 13740237,
        "D0243D": 13805630,
        "token": 51
      },
      "targetCounts": {
        "getCsc03FA09": 0,
        "keyDebounceCounter03F9AE": 1,
        "keyDebounceFallthrough03F9B0": 0,
        "keyDebouncePost03F9B8": 0,
        "keyDebounceRefresh03F9D1": 0,
        "keyDebounceClear03F9D5": 0,
        "keyDebounceReturn03D058": 1,
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
        }
      ]
    },
    {
      "budget": 768,
      "result": {
        "steps": 768,
        "termination": "max_steps",
        "lastPc": 661700,
        "lastMode": "adl"
      },
      "after": {
        "D00587": 0,
        "D00588": 34,
        "D00589": 0,
        "D0058B": 4,
        "D0058C": 0,
        "D0058E": 0,
        "D00595": 0,
        "D00596": 1,
        "D0243A": 13740237,
        "D0243D": 13805630,
        "token": 51
      },
      "targetCounts": {
        "getCsc03FA09": 0,
        "keyDebounceCounter03F9AE": 1,
        "keyDebounceFallthrough03F9B0": 0,
        "keyDebouncePost03F9B8": 0,
        "keyDebounceRefresh03F9D1": 0,
        "keyDebounceClear03F9D5": 0,
        "keyDebounceReturn03D058": 1,
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
        }
      ]
    },
    {
      "budget": 1024,
      "result": {
        "steps": 1024,
        "termination": "max_steps",
        "lastPc": 1821,
        "lastMode": "adl"
      },
      "after": {
        "D00587": 0,
        "D00588": 34,
        "D00589": 0,
        "D0058B": 3,
        "D0058C": 0,
        "D0058E": 0,
        "D00595": 0,
        "D00596": 1,
        "D0243A": 13740237,
        "D0243D": 13805630,
        "token": 51
      },
      "targetCounts": {
        "getCsc03FA09": 0,
        "keyDebounceCounter03F9AE": 2,
        "keyDebounceFallthrough03F9B0": 0,
        "keyDebouncePost03F9B8": 0,
        "keyDebounceRefresh03F9D1": 0,
        "keyDebounceClear03F9D5": 0,
        "keyDebounceReturn03D058": 2,
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
          "block": 234,
          "seqIndex": 233,
          "name": "D0058B",
          "before": 4,
          "after": 3,
          "pc": 249944,
          "ownerPc": 260526
        }
      ]
    },
    {
      "budget": 1280,
      "result": {
        "steps": 1280,
        "termination": "max_steps",
        "lastPc": 662147,
        "lastMode": "adl"
      },
      "after": {
        "D00587": 0,
        "D00588": 34,
        "D00589": 0,
        "D0058B": 4,
        "D0058C": 0,
        "D0058E": 0,
        "D00595": 0,
        "D00596": 1,
        "D0243A": 13740237,
        "D0243D": 13805630,
        "token": 51
      },
      "targetCounts": {
        "getCsc03FA09": 0,
        "keyDebounceCounter03F9AE": 1,
        "keyDebounceFallthrough03F9B0": 0,
        "keyDebouncePost03F9B8": 0,
        "keyDebounceRefresh03F9D1": 0,
        "keyDebounceClear03F9D5": 0,
        "keyDebounceReturn03D058": 1,
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
        }
      ]
    },
    {
      "budget": 1536,
      "result": {
        "steps": 1536,
        "termination": "max_steps",
        "lastPc": 661817,
        "lastMode": "adl"
      },
      "after": {
        "D00587": 0,
        "D00588": 34,
        "D00589": 0,
        "D0058B": 2,
        "D0058C": 0,
        "D0058E": 0,
        "D00595": 0,
        "D00596": 1,
        "D0243A": 13740237,
        "D0243D": 13805630,
        "token": 51
      },
      "targetCounts": {
        "getCsc03FA09": 0,
        "keyDebounceCounter03F9AE": 3,
        "keyDebounceFallthrough03F9B0": 0,
        "keyDebouncePost03F9B8": 0,
        "keyDebounceRefresh03F9D1": 0,
        "keyDebounceClear03F9D5": 0,
        "keyDebounceReturn03D058": 3,
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
          "block": 1140,
          "seqIndex": 1139,
          "name": "D0058B",
          "before": 3,
          "after": 2,
          "pc": 249944,
          "ownerPc": 260526
        }
      ]
    },
    {
      "budget": 1792,
      "result": {
        "steps": 1792,
        "termination": "max_steps",
        "lastPc": 26632,
        "lastMode": "adl"
      },
      "after": {
        "D00587": 0,
        "D00588": 34,
        "D00589": 0,
        "D0058B": 2,
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
        "keyDebounceCounter03F9AE": 3,
        "keyDebounceFallthrough03F9B0": 0,
        "keyDebouncePost03F9B8": 0,
        "keyDebounceRefresh03F9D1": 0,
        "keyDebounceClear03F9D5": 0,
        "keyDebounceReturn03D058": 3,
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
        }
      ]
    },
    {
      "budget": 2048,
      "result": {
        "steps": 2048,
        "termination": "max_steps",
        "lastPc": 10355,
        "lastMode": "adl"
      },
      "after": {
        "D00587": 0,
        "D00588": 34,
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
        "keyDebounceCounter03F9AE": 4,
        "keyDebounceFallthrough03F9B0": 0,
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
      "safeDrain": false,
      "fieldChanges": [
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
          "block": 931,
          "seqIndex": 930,
          "name": "D0058B",
          "before": 4,
          "after": 3,
          "pc": 249944,
          "ownerPc": 260526
        },
        {
          "block": 1762,
          "seqIndex": 1761,
          "name": "D0058B",
          "before": 3,
          "after": 2,
          "pc": 249944,
          "ownerPc": 260526
        },
        {
          "block": 2015,
          "seqIndex": 2014,
          "name": "D0058B",
          "before": 2,
          "after": 1,
          "pc": 249944,
          "ownerPc": 260526
        }
      ]
    },
    {
      "budget": 2304,
      "result": {
        "steps": 2304,
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
        "keyDebounceCounter03F9AE": 5,
        "keyDebounceFallthrough03F9B0": 1,
        "keyDebouncePost03F9B8": 0,
        "keyDebounceRefresh03F9D1": 1,
        "keyDebounceClear03F9D5": 1,
        "keyDebounceReturn03D058": 5,
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
          "block": 1773,
          "seqIndex": 1772,
          "name": "D0058B",
          "before": 3,
          "after": 2,
          "pc": 249944,
          "ownerPc": 260526
        },
        {
          "block": 1981,
          "seqIndex": 1980,
          "name": "D0058B",
          "before": 2,
          "after": 1,
          "pc": 249944,
          "ownerPc": 260526
        },
        {
          "block": 2177,
          "seqIndex": 2176,
          "name": "D0058B",
          "before": 1,
          "after": 0,
          "pc": 260528,
          "ownerPc": 260526
        },
        {
          "block": 2178,
          "seqIndex": 2177,
          "name": "D0058B",
          "before": 0,
          "after": 1,
          "pc": 260561,
          "ownerPc": 260528
        },
        {
          "block": 2182,
          "seqIndex": 2181,
          "name": "D00588",
          "before": 34,
          "after": 0,
          "pc": 249944,
          "ownerPc": 260572
        }
      ]
    },
    {
      "budget": 2560,
      "result": {
        "steps": 2560,
        "termination": "max_steps",
        "lastPc": 176404,
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
        "keyDebounceCounter03F9AE": 6,
        "keyDebounceFallthrough03F9B0": 2,
        "keyDebouncePost03F9B8": 1,
        "keyDebounceRefresh03F9D1": 1,
        "keyDebounceClear03F9D5": 1,
        "keyDebounceReturn03D058": 6,
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
          "block": 1645,
          "seqIndex": 1644,
          "name": "D0058B",
          "before": 4,
          "after": 3,
          "pc": 249944,
          "ownerPc": 260526
        },
        {
          "block": 1876,
          "seqIndex": 1875,
          "name": "D0058B",
          "before": 3,
          "after": 2,
          "pc": 249944,
          "ownerPc": 260526
        },
        {
          "block": 2076,
          "seqIndex": 2075,
          "name": "D0058B",
          "before": 2,
          "after": 1,
          "pc": 249944,
          "ownerPc": 260526
        },
        {
          "block": 2276,
          "seqIndex": 2275,
          "name": "D0058B",
          "before": 1,
          "after": 0,
          "pc": 260528,
          "ownerPc": 260526
        },
        {
          "block": 2277,
          "seqIndex": 2276,
          "name": "D0058B",
          "before": 0,
          "after": 1,
          "pc": 260561,
          "ownerPc": 260528
        },
        {
          "block": 2281,
          "seqIndex": 2280,
          "name": "D00588",
          "before": 34,
          "after": 0,
          "pc": 249944,
          "ownerPc": 260572
        },
        {
          "block": 2476,
          "seqIndex": 2475,
          "name": "D0058B",
          "before": 1,
          "after": 0,
          "pc": 260528,
          "ownerPc": 260526
        },
        {
          "block": 2477,
          "seqIndex": 2476,
          "name": "D0058B",
          "before": 0,
          "after": 1,
          "pc": 260536,
          "ownerPc": 260528
        }
      ]
    },
    {
      "budget": 3072,
      "result": {
        "steps": 3072,
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
        "keyDebounceCounter03F9AE": 7,
        "keyDebounceFallthrough03F9B0": 3,
        "keyDebouncePost03F9B8": 2,
        "keyDebounceRefresh03F9D1": 1,
        "keyDebounceClear03F9D5": 1,
        "keyDebounceReturn03D058": 7,
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
          "block": 123,
          "seqIndex": 122,
          "name": "D00589",
          "before": 34,
          "after": 0,
          "pc": 260526,
          "ownerPc": 260517
        },
        {
          "block": 124,
          "seqIndex": 123,
          "name": "D0058B",
          "before": 5,
          "after": 4,
          "pc": 249944,
          "ownerPc": 260526
        },
        {
          "block": 931,
          "seqIndex": 930,
          "name": "D0058B",
          "before": 4,
          "after": 3,
          "pc": 249944,
          "ownerPc": 260526
        },
        {
          "block": 1671,
          "seqIndex": 1670,
          "name": "D0058B",
          "before": 3,
          "after": 2,
          "pc": 249944,
          "ownerPc": 260526
        },
        {
          "block": 1924,
          "seqIndex": 1923,
          "name": "D0058B",
          "before": 2,
          "after": 1,
          "pc": 249944,
          "ownerPc": 260526
        },
        {
          "block": 2128,
          "seqIndex": 2127,
          "name": "D0058B",
          "before": 1,
          "after": 0,
          "pc": 260528,
          "ownerPc": 260526
        },
        {
          "block": 2129,
          "seqIndex": 2128,
          "name": "D0058B",
          "before": 0,
          "after": 1,
          "pc": 260561,
          "ownerPc": 260528
        },
        {
          "block": 2133,
          "seqIndex": 2132,
          "name": "D00588",
          "before": 34,
          "after": 0,
          "pc": 249944,
          "ownerPc": 260572
        },
        {
          "block": 2324,
          "seqIndex": 2323,
          "name": "D0058B",
          "before": 1,
          "after": 0,
          "pc": 260528,
          "ownerPc": 260526
        },
        {
          "block": 2325,
          "seqIndex": 2324,
          "name": "D0058B",
          "before": 0,
          "after": 1,
          "pc": 260536,
          "ownerPc": 260528
        },
        {
          "block": 2743,
          "seqIndex": 2742,
          "name": "D0058B",
          "before": 1,
          "after": 0,
          "pc": 260528,
          "ownerPc": 260526
        },
        {
          "block": 2744,
          "seqIndex": 2743,
          "name": "D0058B",
          "before": 0,
          "after": 1,
          "pc": 260536,
          "ownerPc": 260528
        }
      ]
    },
    {
      "budget": 3136,
      "result": {
        "steps": 3136,
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
          "block": 932,
          "seqIndex": 931,
          "name": "D0058B",
          "before": 4,
          "after": 3,
          "pc": 249944,
          "ownerPc": 260526
        },
        {
          "block": 1060,
          "seqIndex": 1059,
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
          "block": 2060,
          "seqIndex": 2059,
          "name": "D0058B",
          "before": 1,
          "after": 0,
          "pc": 260528,
          "ownerPc": 260526
        },
        {
          "block": 2061,
          "seqIndex": 2060,
          "name": "D0058B",
          "before": 0,
          "after": 1,
          "pc": 260561,
          "ownerPc": 260528
        },
        {
          "block": 2065,
          "seqIndex": 2064,
          "name": "D00588",
          "before": 34,
          "after": 0,
          "pc": 249944,
          "ownerPc": 260572
        },
        {
          "block": 2260,
          "seqIndex": 2259,
          "name": "D0058B",
          "before": 1,
          "after": 0,
          "pc": 260528,
          "ownerPc": 260526
        },
        {
          "block": 2261,
          "seqIndex": 2260,
          "name": "D0058B",
          "before": 0,
          "after": 1,
          "pc": 260536,
          "ownerPc": 260528
        },
        {
          "block": 2460,
          "seqIndex": 2459,
          "name": "D0058B",
          "before": 1,
          "after": 0,
          "pc": 260528,
          "ownerPc": 260526
        },
        {
          "block": 2461,
          "seqIndex": 2460,
          "name": "D0058B",
          "before": 0,
          "after": 1,
          "pc": 260536,
          "ownerPc": 260528
        }
      ]
    },
    {
      "budget": 3200,
      "result": {
        "steps": 3200,
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
          "block": 333,
          "seqIndex": 332,
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
          "block": 2133,
          "seqIndex": 2132,
          "name": "D0058B",
          "before": 1,
          "after": 0,
          "pc": 260528,
          "ownerPc": 260526
        },
        {
          "block": 2134,
          "seqIndex": 2133,
          "name": "D0058B",
          "before": 0,
          "after": 1,
          "pc": 260561,
          "ownerPc": 260528
        },
        {
          "block": 2138,
          "seqIndex": 2137,
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
          "block": 2533,
          "seqIndex": 2532,
          "name": "D0058B",
          "before": 1,
          "after": 0,
          "pc": 260528,
          "ownerPc": 260526
        },
        {
          "block": 2534,
          "seqIndex": 2533,
          "name": "D0058B",
          "before": 0,
          "after": 1,
          "pc": 260536,
          "ownerPc": 260528
        }
      ]
    },
    {
      "budget": 3264,
      "result": {
        "steps": 3264,
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
          "block": 1143,
          "seqIndex": 1142,
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
          "block": 2143,
          "seqIndex": 2142,
          "name": "D0058B",
          "before": 1,
          "after": 0,
          "pc": 260528,
          "ownerPc": 260526
        },
        {
          "block": 2144,
          "seqIndex": 2143,
          "name": "D0058B",
          "before": 0,
          "after": 1,
          "pc": 260561,
          "ownerPc": 260528
        },
        {
          "block": 2148,
          "seqIndex": 2147,
          "name": "D00588",
          "before": 34,
          "after": 0,
          "pc": 249944,
          "ownerPc": 260572
        },
        {
          "block": 2343,
          "seqIndex": 2342,
          "name": "D0058B",
          "before": 1,
          "after": 0,
          "pc": 260528,
          "ownerPc": 260526
        },
        {
          "block": 2344,
          "seqIndex": 2343,
          "name": "D0058B",
          "before": 0,
          "after": 1,
          "pc": 260536,
          "ownerPc": 260528
        },
        {
          "block": 2546,
          "seqIndex": 2545,
          "name": "D0058B",
          "before": 1,
          "after": 0,
          "pc": 260528,
          "ownerPc": 260526
        },
        {
          "block": 2547,
          "seqIndex": 2546,
          "name": "D0058B",
          "before": 0,
          "after": 1,
          "pc": 260536,
          "ownerPc": 260528
        }
      ]
    },
    {
      "budget": 3328,
      "result": {
        "steps": 3328,
        "termination": "max_steps",
        "lastPc": 5059,
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
          "block": 932,
          "seqIndex": 931,
          "name": "D0058B",
          "before": 4,
          "after": 3,
          "pc": 249944,
          "ownerPc": 260526
        },
        {
          "block": 1672,
          "seqIndex": 1671,
          "name": "D0058B",
          "before": 3,
          "after": 2,
          "pc": 249944,
          "ownerPc": 260526
        },
        {
          "block": 1889,
          "seqIndex": 1888,
          "name": "D0058B",
          "before": 2,
          "after": 1,
          "pc": 249944,
          "ownerPc": 260526
        },
        {
          "block": 2099,
          "seqIndex": 2098,
          "name": "D0058B",
          "before": 1,
          "after": 0,
          "pc": 260528,
          "ownerPc": 260526
        },
        {
          "block": 2100,
          "seqIndex": 2099,
          "name": "D0058B",
          "before": 0,
          "after": 1,
          "pc": 260561,
          "ownerPc": 260528
        },
        {
          "block": 2104,
          "seqIndex": 2103,
          "name": "D00588",
          "before": 34,
          "after": 0,
          "pc": 249944,
          "ownerPc": 260572
        },
        {
          "block": 2300,
          "seqIndex": 2299,
          "name": "D0058B",
          "before": 1,
          "after": 0,
          "pc": 260528,
          "ownerPc": 260526
        },
        {
          "block": 2301,
          "seqIndex": 2300,
          "name": "D0058B",
          "before": 0,
          "after": 1,
          "pc": 260536,
          "ownerPc": 260528
        },
        {
          "block": 2489,
          "seqIndex": 2488,
          "name": "D0058B",
          "before": 1,
          "after": 0,
          "pc": 260528,
          "ownerPc": 260526
        },
        {
          "block": 2490,
          "seqIndex": 2489,
          "name": "D0058B",
          "before": 0,
          "after": 1,
          "pc": 260536,
          "ownerPc": 260528
        }
      ]
    },
    {
      "budget": 3392,
      "result": {
        "steps": 3392,
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
          "block": 1171,
          "seqIndex": 1170,
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
          "block": 2571,
          "seqIndex": 2570,
          "name": "D0058B",
          "before": 1,
          "after": 0,
          "pc": 260528,
          "ownerPc": 260526
        },
        {
          "block": 2572,
          "seqIndex": 2571,
          "name": "D0058B",
          "before": 0,
          "after": 1,
          "pc": 260536,
          "ownerPc": 260528
        }
      ]
    },
    {
      "budget": 3456,
      "result": {
        "steps": 3456,
        "termination": "max_steps",
        "lastPc": 7297,
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
          "block": 1990,
          "seqIndex": 1989,
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
          "block": 2590,
          "seqIndex": 2589,
          "name": "D0058B",
          "before": 1,
          "after": 0,
          "pc": 260528,
          "ownerPc": 260526
        },
        {
          "block": 2591,
          "seqIndex": 2590,
          "name": "D0058B",
          "before": 0,
          "after": 1,
          "pc": 260536,
          "ownerPc": 260528
        }
      ]
    },
    {
      "budget": 3520,
      "result": {
        "steps": 3520,
        "termination": "max_steps",
        "lastPc": 7297,
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
          "block": 1145,
          "seqIndex": 1144,
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
          "block": 2145,
          "seqIndex": 2144,
          "name": "D0058B",
          "before": 1,
          "after": 0,
          "pc": 260528,
          "ownerPc": 260526
        },
        {
          "block": 2146,
          "seqIndex": 2145,
          "name": "D0058B",
          "before": 0,
          "after": 1,
          "pc": 260561,
          "ownerPc": 260528
        },
        {
          "block": 2150,
          "seqIndex": 2149,
          "name": "D00588",
          "before": 34,
          "after": 0,
          "pc": 249944,
          "ownerPc": 260572
        },
        {
          "block": 2345,
          "seqIndex": 2344,
          "name": "D0058B",
          "before": 1,
          "after": 0,
          "pc": 260528,
          "ownerPc": 260526
        },
        {
          "block": 2346,
          "seqIndex": 2345,
          "name": "D0058B",
          "before": 0,
          "after": 1,
          "pc": 260536,
          "ownerPc": 260528
        },
        {
          "block": 2547,
          "seqIndex": 2546,
          "name": "D0058B",
          "before": 1,
          "after": 0,
          "pc": 260528,
          "ownerPc": 260526
        },
        {
          "block": 2548,
          "seqIndex": 2547,
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
        "lastPc": 24873,
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
          "block": 235,
          "seqIndex": 234,
          "name": "D0058B",
          "before": 4,
          "after": 3,
          "pc": 249944,
          "ownerPc": 260526
        },
        {
          "block": 1049,
          "seqIndex": 1048,
          "name": "D0058B",
          "before": 3,
          "after": 2,
          "pc": 249944,
          "ownerPc": 260526
        },
        {
          "block": 1789,
          "seqIndex": 1788,
          "name": "D0058B",
          "before": 2,
          "after": 1,
          "pc": 249944,
          "ownerPc": 260526
        },
        {
          "block": 2035,
          "seqIndex": 2034,
          "name": "D0058B",
          "before": 1,
          "after": 0,
          "pc": 260528,
          "ownerPc": 260526
        },
        {
          "block": 2036,
          "seqIndex": 2035,
          "name": "D0058B",
          "before": 0,
          "after": 1,
          "pc": 260561,
          "ownerPc": 260528
        },
        {
          "block": 2040,
          "seqIndex": 2039,
          "name": "D00588",
          "before": 34,
          "after": 0,
          "pc": 249944,
          "ownerPc": 260572
        },
        {
          "block": 2251,
          "seqIndex": 2250,
          "name": "D0058B",
          "before": 1,
          "after": 0,
          "pc": 260528,
          "ownerPc": 260526
        },
        {
          "block": 2252,
          "seqIndex": 2251,
          "name": "D0058B",
          "before": 0,
          "after": 1,
          "pc": 260536,
          "ownerPc": 260528
        },
        {
          "block": 2435,
          "seqIndex": 2434,
          "name": "D0058B",
          "before": 1,
          "after": 0,
          "pc": 260528,
          "ownerPc": 260526
        },
        {
          "block": 2436,
          "seqIndex": 2435,
          "name": "D0058B",
          "before": 0,
          "after": 1,
          "pc": 260536,
          "ownerPc": 260528
        }
      ]
    },
    {
      "budget": 4096,
      "result": {
        "steps": 4096,
        "termination": "max_steps",
        "lastPc": 24186,
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
          "block": 1060,
          "seqIndex": 1059,
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
          "block": 2060,
          "seqIndex": 2059,
          "name": "D0058B",
          "before": 1,
          "after": 0,
          "pc": 260528,
          "ownerPc": 260526
        },
        {
          "block": 2061,
          "seqIndex": 2060,
          "name": "D0058B",
          "before": 0,
          "after": 1,
          "pc": 260561,
          "ownerPc": 260528
        },
        {
          "block": 2065,
          "seqIndex": 2064,
          "name": "D00588",
          "before": 34,
          "after": 0,
          "pc": 249944,
          "ownerPc": 260572
        },
        {
          "block": 2260,
          "seqIndex": 2259,
          "name": "D0058B",
          "before": 1,
          "after": 0,
          "pc": 260528,
          "ownerPc": 260526
        },
        {
          "block": 2261,
          "seqIndex": 2260,
          "name": "D0058B",
          "before": 0,
          "after": 1,
          "pc": 260536,
          "ownerPc": 260528
        },
        {
          "block": 2460,
          "seqIndex": 2459,
          "name": "D0058B",
          "before": 1,
          "after": 0,
          "pc": 260528,
          "ownerPc": 260526
        },
        {
          "block": 2461,
          "seqIndex": 2460,
          "name": "D0058B",
          "before": 0,
          "after": 1,
          "pc": 260536,
          "ownerPc": 260528
        }
      ]
    },
    {
      "budget": 5120,
      "result": {
        "steps": 5120,
        "termination": "max_steps",
        "lastPc": 24755,
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
          "block": 1023,
          "seqIndex": 1022,
          "name": "D0058B",
          "before": 4,
          "after": 3,
          "pc": 249944,
          "ownerPc": 260526
        },
        {
          "block": 1173,
          "seqIndex": 1172,
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
          "block": 2573,
          "seqIndex": 2572,
          "name": "D0058B",
          "before": 1,
          "after": 0,
          "pc": 260528,
          "ownerPc": 260526
        },
        {
          "block": 2574,
          "seqIndex": 2573,
          "name": "D0058B",
          "before": 0,
          "after": 1,
          "pc": 260536,
          "ownerPc": 260528
        }
      ]
    },
    {
      "budget": 6144,
      "result": {
        "steps": 6144,
        "termination": "max_steps",
        "lastPc": 23002,
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
        "D00596": 11,
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
          "block": 1064,
          "seqIndex": 1063,
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
          "block": 2064,
          "seqIndex": 2063,
          "name": "D0058B",
          "before": 1,
          "after": 0,
          "pc": 260528,
          "ownerPc": 260526
        },
        {
          "block": 2065,
          "seqIndex": 2064,
          "name": "D0058B",
          "before": 0,
          "after": 1,
          "pc": 260561,
          "ownerPc": 260528
        },
        {
          "block": 2069,
          "seqIndex": 2068,
          "name": "D00588",
          "before": 34,
          "after": 0,
          "pc": 249944,
          "ownerPc": 260572
        },
        {
          "block": 2264,
          "seqIndex": 2263,
          "name": "D0058B",
          "before": 1,
          "after": 0,
          "pc": 260528,
          "ownerPc": 260526
        },
        {
          "block": 2265,
          "seqIndex": 2264,
          "name": "D0058B",
          "before": 0,
          "after": 1,
          "pc": 260536,
          "ownerPc": 260528
        },
        {
          "block": 2464,
          "seqIndex": 2463,
          "name": "D0058B",
          "before": 1,
          "after": 0,
          "pc": 260528,
          "ownerPc": 260526
        },
        {
          "block": 2465,
          "seqIndex": 2464,
          "name": "D0058B",
          "before": 0,
          "after": 1,
          "pc": 260536,
          "ownerPc": 260528
        }
      ]
    },
    {
      "budget": 8192,
      "result": {
        "steps": 8192,
        "termination": "max_steps",
        "lastPc": 23371,
        "lastMode": "adl"
      },
      "after": {
        "D00587": 0,
        "D00588": 0,
        "D00589": 0,
        "D0058B": 0,
        "D0058C": 0,
        "D0058E": 0,
        "D00595": 6,
        "D00596": 2,
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
          "block": 329,
          "seqIndex": 328,
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
          "block": 2129,
          "seqIndex": 2128,
          "name": "D0058B",
          "before": 1,
          "after": 0,
          "pc": 260528,
          "ownerPc": 260526
        },
        {
          "block": 2130,
          "seqIndex": 2129,
          "name": "D0058B",
          "before": 0,
          "after": 1,
          "pc": 260561,
          "ownerPc": 260528
        },
        {
          "block": 2134,
          "seqIndex": 2133,
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
          "block": 2529,
          "seqIndex": 2528,
          "name": "D0058B",
          "before": 1,
          "after": 0,
          "pc": 260528,
          "ownerPc": 260526
        },
        {
          "block": 2530,
          "seqIndex": 2529,
          "name": "D0058B",
          "before": 0,
          "after": 1,
          "pc": 260536,
          "ownerPc": 260528
        }
      ]
    },
    {
      "budget": 12288,
      "result": {
        "steps": 12288,
        "termination": "max_steps",
        "lastPc": 23371,
        "lastMode": "adl"
      },
      "after": {
        "D00587": 0,
        "D00588": 0,
        "D00589": 0,
        "D0058B": 0,
        "D0058C": 0,
        "D0058E": 0,
        "D00595": 8,
        "D00596": 6,
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
          "block": 1023,
          "seqIndex": 1022,
          "name": "D0058B",
          "before": 4,
          "after": 3,
          "pc": 249944,
          "ownerPc": 260526
        },
        {
          "block": 1147,
          "seqIndex": 1146,
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
          "block": 2147,
          "seqIndex": 2146,
          "name": "D0058B",
          "before": 1,
          "after": 0,
          "pc": 260528,
          "ownerPc": 260526
        },
        {
          "block": 2148,
          "seqIndex": 2147,
          "name": "D0058B",
          "before": 0,
          "after": 1,
          "pc": 260561,
          "ownerPc": 260528
        },
        {
          "block": 2152,
          "seqIndex": 2151,
          "name": "D00588",
          "before": 34,
          "after": 0,
          "pc": 249944,
          "ownerPc": 260572
        },
        {
          "block": 2347,
          "seqIndex": 2346,
          "name": "D0058B",
          "before": 1,
          "after": 0,
          "pc": 260528,
          "ownerPc": 260526
        },
        {
          "block": 2348,
          "seqIndex": 2347,
          "name": "D0058B",
          "before": 0,
          "after": 1,
          "pc": 260536,
          "ownerPc": 260528
        },
        {
          "block": 2547,
          "seqIndex": 2546,
          "name": "D0058B",
          "before": 1,
          "after": 0,
          "pc": 260528,
          "ownerPc": 260526
        },
        {
          "block": 2548,
          "seqIndex": 2547,
          "name": "D0058B",
          "before": 0,
          "after": 1,
          "pc": 260536,
          "ownerPc": 260528
        }
      ]
    },
    {
      "budget": 16384,
      "result": {
        "steps": 16384,
        "termination": "max_steps",
        "lastPc": 27871,
        "lastMode": "adl"
      },
      "after": {
        "D00587": 0,
        "D00588": 0,
        "D00589": 0,
        "D0058B": 0,
        "D0058C": 0,
        "D0058E": 0,
        "D00595": 4,
        "D00596": 19,
        "D0243A": 0,
        "D0243D": 0,
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
        "preWipe001879": 1,
        "cleanup0018F8": 1,
        "poll006D64": 428
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
          "block": 1069,
          "seqIndex": 1068,
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
          "block": 2069,
          "seqIndex": 2068,
          "name": "D0058B",
          "before": 1,
          "after": 0,
          "pc": 260528,
          "ownerPc": 260526
        },
        {
          "block": 2070,
          "seqIndex": 2069,
          "name": "D0058B",
          "before": 0,
          "after": 1,
          "pc": 260561,
          "ownerPc": 260528
        },
        {
          "block": 2074,
          "seqIndex": 2073,
          "name": "D00588",
          "before": 34,
          "after": 0,
          "pc": 249944,
          "ownerPc": 260572
        },
        {
          "block": 2300,
          "seqIndex": 2299,
          "name": "D0058B",
          "before": 1,
          "after": 0,
          "pc": 260528,
          "ownerPc": 260526
        },
        {
          "block": 2301,
          "seqIndex": 2300,
          "name": "D0058B",
          "before": 0,
          "after": 1,
          "pc": 260536,
          "ownerPc": 260528
        },
        {
          "block": 2469,
          "seqIndex": 2468,
          "name": "D0058B",
          "before": 1,
          "after": 0,
          "pc": 260528,
          "ownerPc": 260526
        },
        {
          "block": 2470,
          "seqIndex": 2469,
          "name": "D0058B",
          "before": 0,
          "after": 1,
          "pc": 260536,
          "ownerPc": 260528
        }
      ]
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


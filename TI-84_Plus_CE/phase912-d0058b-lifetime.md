# Phase 912: D0058B Owner/Lifetime Trace

Probe: `probe-phase912-d0058b-lifetime.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase912-d0058b-lifetime.mjs`

Serves a temporary instrumented copy of `browser-shell.html`. Disk `browser-shell.html` is not edited.

## Summary

- Probe completed: PASS.
- Digit3 leaves the browser state at D0058B=0x05 and D00587=0x00 before the next CLEAR burst.
- Baseline Digit3 -> CLEAR countdown reaches first post-GetCSC 0x03F9AE next=0x03F9B0, 0x03F9B0 count=8, wipes=3, termination=max_steps.
- Wall-clock wait (1200 ms) before CLEAR leaves D0058B=0x05 and next=0x03F9B0; this distinguishes browser sleep from simulated OS ticks.
- One manual idle frame (50000 steps) after Digit3 leaves D0058B=0x00; following CLEAR next=-, 0x0A229D=1, wipes=0, uiClearApplied=true.
- Standalone CLEAR baseline: first 0x03F9AE next=0x03D058, 0x0A229D=1, wipes=0, uiClearApplied=true.
- Interpretation: D0058B is a simulated-time lifetime issue in the browser harness: Digit3 stops at the post-insert gate with D0058B still early in the countdown, wall-clock delay does not tick it, and one explicit coldboot idle frame advances the countdown enough for the following CLEAR to reach the normal 0x0A229D pre-stop instead of the wipe route. The full 50K idle frame is not a safe fix because it also perturbs broader watched state; the next step should find the narrow debounce-drain owner or minimal no-key tick.

## Route Summary

| Scenario | After Digit3 D0058B | After delay D0058B | Idle-frame D0058B | First 0x03F9AE next | 0x03F9B0 | 0x03F9B8 | 0x03F9D1 | 0x03F9D5 | 0x0A229D | 0x001879 | 0x0018F8 | Term | UI clear | Wipes | Oracle mismatches |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| standalone-clear | - | - | - | 0x03D058 | 0 | 0 | 0 | 0 | 1 | 0 | 0 | control_pre_stop | yes | 0 | 1 |
| transition-baseline | 0x05 | - | - | 0x03F9B0 | 8 | 7 | 1 | 1 | 0 | 3 | 3 | max_steps | no | 3 | 16 |
| transition-wallclock-delay | 0x05 | 0x05 | - | 0x03F9B0 | 8 | 7 | 1 | 1 | 0 | 3 | 3 | max_steps | no | 3 | 16 |
| transition-one-idle-frame | 0x05 | - | idle-50k:0x00 | - | 0 | 0 | 0 | 0 | 1 | 0 | 0 | control_pre_stop | yes | 0 | 14 |

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
| transition-wallclock-delay | D007CA | 0x000000 | NO |
| transition-wallclock-delay | D008E0 | 0x000000 | NO |
| transition-wallclock-delay | D010EF | 0x000000 | NO |
| transition-wallclock-delay | D010FE | 0x000000 | NO |
| transition-wallclock-delay | D0243A | 0x000000 | NO |
| transition-wallclock-delay | D0243D | 0x000000 | NO |
| transition-wallclock-delay | D02590 | 0x000000 | NO |
| transition-wallclock-delay | D0259D | 0x000000 | NO |
| transition-wallclock-delay | D0301B | 0x000000 | NO |
| transition-wallclock-delay | EDIT_TOKEN_D1A8CC | 0x33 | yes |
| transition-one-idle-frame | D007CA | 0x0585E9 | yes |
| transition-one-idle-frame | D008E0 | 0xD1A86C | yes |
| transition-one-idle-frame | D010EF | 0x000000 | NO |
| transition-one-idle-frame | D010FE | 0x000000 | NO |
| transition-one-idle-frame | D0243A | 0xD1A8CC | yes |
| transition-one-idle-frame | D0243D | 0x000000 | NO |
| transition-one-idle-frame | D02590 | 0x000000 | NO |
| transition-one-idle-frame | D0259D | 0x000000 | NO |
| transition-one-idle-frame | D0301B | 0x000000 | NO |
| transition-one-idle-frame | EDIT_TOKEN_D1A8CC | 0x00 | NO |

## Idle Frame Probe

| Scenario | Idle Frame | Budget | Steps | Term | D0058B After | D00587 After | 0x03F9AE | 0x03D058 | 0x03F9B0 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| transition-one-idle-frame | idle-50k | 50000 | 50000 | max_steps | 0x00 | 0x00 | 9 | 9 | 5 |

## Idle Frame Field Changes

| Seq | Field | Before | After | Observed At | Owner PC |
| --- | --- | --- | --- | --- | --- |
| 111 | D00589 | 0x22 | 0x00 | 0x03F9AE | 0x03F9A5 |
| 112 | D0058B | 0x05 | 0x04 | 0x03D058 | 0x03F9AE |
| 1022 | D0058B | 0x04 | 0x03 | 0x03D058 | 0x03F9AE |
| 1164 | D0058B | 0x03 | 0x02 | 0x03D058 | 0x03F9AE |
| 1880 | D0058B | 0x02 | 0x01 | 0x03D058 | 0x03F9AE |
| 2164 | D0058B | 0x01 | 0x00 | 0x03F9B0 | 0x03F9AE |
| 2165 | D0058B | 0x00 | 0x01 | 0x03F9D1 | 0x03F9B0 |
| 2169 | D00588 | 0x22 | 0x00 | 0x03D058 | 0x03F9DC |
| 2390 | D0058B | 0x01 | 0x00 | 0x03F9B0 | 0x03F9AE |
| 2391 | D0058B | 0x00 | 0x01 | 0x03F9B8 | 0x03F9B0 |
| 2564 | D0058B | 0x01 | 0x00 | 0x03F9B0 | 0x03F9AE |
| 2565 | D0058B | 0x00 | 0x01 | 0x03F9B8 | 0x03F9B0 |
| 2954 | D0058B | 0x01 | 0x00 | 0x03F9B0 | 0x03F9AE |
| 2955 | D0058B | 0x00 | 0x01 | 0x03F9B8 | 0x03F9B0 |
| 3165 | D0058B | 0x01 | 0x00 | 0x03F9B0 | 0x03F9AE |
| 3166 | D0058B | 0x00 | 0x01 | 0x03F9B8 | 0x03F9B0 |
| 3744 | D007CA | 0x0585E9 | 0x000000 | 0x0018F8 | 0x001879 |
| 3744 | D008E0 | 0xD1A86C | 0x000000 | 0x0018F8 | 0x001879 |
| 3744 | D010EF | 0xD2A83E | 0x000000 | 0x0018F8 | 0x001879 |
| 3744 | D010FE | 0xD1A8CC | 0x000000 | 0x0018F8 | 0x001879 |
| 3744 | D010F4 | 0x1F | 0x00 | 0x0018F8 | 0x001879 |
| 3744 | D02317 | 0xD2A83E | 0x000000 | 0x0018F8 | 0x001879 |
| 3744 | D0231A | 0xD2A83E | 0x000000 | 0x0018F8 | 0x001879 |
| 3744 | D0231D | 0xD2A83D | 0x000000 | 0x0018F8 | 0x001879 |
| 3744 | D02437 | 0xD1A8CC | 0x000000 | 0x0018F8 | 0x001879 |
| 3744 | D0243A | 0xD1A8CD | 0x000000 | 0x0018F8 | 0x001879 |
| 3744 | D0243D | 0xD2A83E | 0x000000 | 0x0018F8 | 0x001879 |
| 3744 | D02440 | 0xD2A83E | 0x000000 | 0x0018F8 | 0x001879 |
| 3744 | D02505 | 0x0A | 0x00 | 0x0018F8 | 0x001879 |
| 3744 | D02590 | 0xD3FE81 | 0x000000 | 0x0018F8 | 0x001879 |
| 3744 | D0259D | 0xD3FECD | 0x000000 | 0x0018F8 | 0x001879 |
| 3744 | D0301B | 0x5AA55A | 0x000000 | 0x0018F8 | 0x001879 |

## Idle Frame Target Samples

| Seq | PC | Prev | D00587 | D00588 | D00589 | D0058B | D0058C | D0058E | D0243A | Token |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 111 | 0x03F9AE | 0x03F9A5 | 0x00 | 0x22 | 0x00 | 0x05 | 0x00 | 0x00 | 0xD1A8CD | 0x33 |
| 112 | 0x03D058 | 0x03F9AE | 0x00 | 0x22 | 0x00 | 0x04 | 0x00 | 0x00 | 0xD1A8CD | 0x33 |
| 1021 | 0x03F9AE | 0x03F9AB | 0x00 | 0x22 | 0x00 | 0x04 | 0x00 | 0x00 | 0xD1A8CD | 0x33 |
| 1022 | 0x03D058 | 0x03F9AE | 0x00 | 0x22 | 0x00 | 0x03 | 0x00 | 0x00 | 0xD1A8CD | 0x33 |
| 1163 | 0x03F9AE | 0x03F9AB | 0x00 | 0x22 | 0x00 | 0x03 | 0x00 | 0x00 | 0xD1A8CD | 0x33 |
| 1164 | 0x03D058 | 0x03F9AE | 0x00 | 0x22 | 0x00 | 0x02 | 0x00 | 0x00 | 0xD1A8CD | 0x33 |
| 1879 | 0x03F9AE | 0x03F9AB | 0x00 | 0x22 | 0x00 | 0x02 | 0x00 | 0x00 | 0xD1A8CD | 0x33 |
| 1880 | 0x03D058 | 0x03F9AE | 0x00 | 0x22 | 0x00 | 0x01 | 0x00 | 0x00 | 0xD1A8CD | 0x33 |
| 2163 | 0x03F9AE | 0x03F9AB | 0x00 | 0x22 | 0x00 | 0x01 | 0x00 | 0x00 | 0xD1A8CD | 0x33 |
| 2164 | 0x03F9B0 | 0x03F9AE | 0x00 | 0x22 | 0x00 | 0x00 | 0x00 | 0x00 | 0xD1A8CD | 0x33 |
| 2165 | 0x03F9D1 | 0x03F9B0 | 0x00 | 0x22 | 0x00 | 0x01 | 0x00 | 0x00 | 0xD1A8CD | 0x33 |
| 2167 | 0x03F9D5 | 0x03F9FA | 0x00 | 0x22 | 0x00 | 0x01 | 0x00 | 0x00 | 0xD1A8CD | 0x33 |
| 2169 | 0x03D058 | 0x03F9DC | 0x00 | 0x00 | 0x00 | 0x01 | 0x00 | 0x00 | 0xD1A8CD | 0x33 |
| 2389 | 0x03F9AE | 0x03F9AB | 0x00 | 0x00 | 0x00 | 0x01 | 0x00 | 0x00 | 0xD1A8CD | 0x33 |
| 2390 | 0x03F9B0 | 0x03F9AE | 0x00 | 0x00 | 0x00 | 0x00 | 0x00 | 0x00 | 0xD1A8CD | 0x33 |
| 2391 | 0x03F9B8 | 0x03F9B0 | 0x00 | 0x00 | 0x00 | 0x01 | 0x00 | 0x00 | 0xD1A8CD | 0x33 |
| 2392 | 0x03D058 | 0x03F9B8 | 0x00 | 0x00 | 0x00 | 0x01 | 0x00 | 0x00 | 0xD1A8CD | 0x33 |
| 2563 | 0x03F9AE | 0x03F9AB | 0x00 | 0x00 | 0x00 | 0x01 | 0x00 | 0x00 | 0xD1A8CD | 0x33 |
| 2564 | 0x03F9B0 | 0x03F9AE | 0x00 | 0x00 | 0x00 | 0x00 | 0x00 | 0x00 | 0xD1A8CD | 0x33 |
| 2565 | 0x03F9B8 | 0x03F9B0 | 0x00 | 0x00 | 0x00 | 0x01 | 0x00 | 0x00 | 0xD1A8CD | 0x33 |
| 2566 | 0x03D058 | 0x03F9B8 | 0x00 | 0x00 | 0x00 | 0x01 | 0x00 | 0x00 | 0xD1A8CD | 0x33 |
| 2953 | 0x03F9AE | 0x03F9AB | 0x00 | 0x00 | 0x00 | 0x01 | 0x00 | 0x00 | 0xD1A8CD | 0x33 |
| 2954 | 0x03F9B0 | 0x03F9AE | 0x00 | 0x00 | 0x00 | 0x00 | 0x00 | 0x00 | 0xD1A8CD | 0x33 |
| 2955 | 0x03F9B8 | 0x03F9B0 | 0x00 | 0x00 | 0x00 | 0x01 | 0x00 | 0x00 | 0xD1A8CD | 0x33 |

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

## Wall-Clock Delay Transition Early Changes

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

## One-Idle-Frame Transition Early Changes

| Seq | Field | Before | After | Observed At | Owner PC |
| --- | --- | --- | --- | --- | --- |
| 0 | D007CA | 0x000000 | 0x0585E9 | 0x08C331 | - |
| 0 | D008E0 | 0x000000 | 0xD1A86C | 0x08C331 | - |
| 0 | D00587 | 0x00 | 0x0F | 0x08C331 | - |
| 0 | D0058C | 0x00 | 0x0F | 0x08C331 | - |
| 0 | D0058E | 0x00 | 0x0F | 0x08C331 | - |
| 765 | D000CA_IY4A | 0x00 | 0x01 | 0x05C634 | 0x08C3A0 |
| 2348 | D0058C | 0x0F | 0x00 | 0x02FCB3 | 0x08C359 |
| 2348 | D0058E | 0x0F | 0x00 | 0x02FCB3 | 0x08C359 |
| 2957 | D00587 | 0x0F | 0x00 | 0x000038 | 0x03FA09 |
| 3019 | D0058C | 0x00 | 0x09 | 0x08C38A | 0x08C366 |
| 3884 | D00595 | 0x04 | 0x00 | 0x0A223E | 0x0A235E |
| 3884 | D00596 | 0x13 | 0x00 | 0x0A223E | 0x0A235E |

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

## One-Idle-Frame CLEAR Target Samples

No rows.

## Bounded Machine JSON

```json
{
  "pass": true,
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
    },
    {
      "label": "transition-wallclock-delay",
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
      "afterWallClockDelay": {
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
    },
    {
      "label": "transition-one-idle-frame",
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
      "idleFrames": [
        {
          "label": "transition-one-idle-frame idle-50k",
          "budget": 50000,
          "result": {
            "steps": 50000,
            "termination": "max_steps",
            "lastPc": 27983,
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
            "poll006D64": 4618
          }
        }
      ],
      "afterClear": {
        "termination": "control_pre_stop",
        "steps": 5924,
        "uiClearApplied": true,
        "wipes": 0,
        "D007CA": 361961,
        "D0243A": 13740236,
        "D0058B": 0,
        "token": 0
      },
      "firstCounter": {
        "found": false,
        "anchorIndex": 2956,
        "reason": "0x03F9AE after anchor missing"
      },
      "targetCounts": {
        "getCsc03FA09": 1,
        "keyDebounceCounter03F9AE": 0,
        "keyDebounceFallthrough03F9B0": 0,
        "keyDebouncePost03F9B8": 0,
        "keyDebounceRefresh03F9D1": 0,
        "keyDebounceClear03F9D5": 0,
        "keyDebounceReturn03D058": 0,
        "clearFallthrough058A16": 1,
        "clearEntry0A223A": 1,
        "clearAnchor0A229D": 1,
        "preWipe001879": 0,
        "cleanup0018F8": 0,
        "poll006D64": 0
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
    },
    {
      "label": "transition-wallclock-delay",
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
      "afterWallClockDelay": {
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
    },
    {
      "label": "transition-one-idle-frame",
      "firstCounter": {
        "found": false,
        "anchorIndex": 2956,
        "reason": "0x03F9AE after anchor missing"
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
      "idleFrames": [
        {
          "label": "transition-one-idle-frame idle-50k",
          "budget": 50000,
          "result": {
            "steps": 50000,
            "termination": "max_steps",
            "lastPc": 27983,
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
            "poll006D64": 4618
          },
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
            },
            {
              "block": 2955,
              "seqIndex": 2954,
              "name": "D0058B",
              "before": 1,
              "after": 0,
              "pc": 260528,
              "ownerPc": 260526
            },
            {
              "block": 2956,
              "seqIndex": 2955,
              "name": "D0058B",
              "before": 0,
              "after": 1,
              "pc": 260536,
              "ownerPc": 260528
            },
            {
              "block": 3166,
              "seqIndex": 3165,
              "name": "D0058B",
              "before": 1,
              "after": 0,
              "pc": 260528,
              "ownerPc": 260526
            },
            {
              "block": 3167,
              "seqIndex": 3166,
              "name": "D0058B",
              "before": 0,
              "after": 1,
              "pc": 260536,
              "ownerPc": 260528
            },
            {
              "block": 3745,
              "seqIndex": 3744,
              "name": "D007CA",
              "before": 361961,
              "after": 0,
              "pc": 6392,
              "ownerPc": 6265
            },
            {
              "block": 3745,
              "seqIndex": 3744,
              "name": "D008E0",
              "before": 13740140,
              "after": 0,
              "pc": 6392,
              "ownerPc": 6265
            },
            {
              "block": 3745,
              "seqIndex": 3744,
              "name": "D010EF",
              "before": 13805630,
              "after": 0,
              "pc": 6392,
              "ownerPc": 6265
            },
            {
              "block": 3745,
              "seqIndex": 3744,
              "name": "D010FE",
              "before": 13740236,
              "after": 0,
              "pc": 6392,
              "ownerPc": 6265
            },
            {
              "block": 3745,
              "seqIndex": 3744,
              "name": "D010F4",
              "before": 31,
              "after": 0,
              "pc": 6392,
              "ownerPc": 6265
            },
            {
              "block": 3745,
              "seqIndex": 3744,
              "name": "D02317",
              "before": 13805630,
              "after": 0,
              "pc": 6392,
              "ownerPc": 6265
            },
            {
              "block": 3745,
              "seqIndex": 3744,
              "name": "D0231A",
              "before": 13805630,
              "after": 0,
              "pc": 6392,
              "ownerPc": 6265
            },
            {
              "block": 3745,
              "seqIndex": 3744,
              "name": "D0231D",
              "before": 13805629,
              "after": 0,
              "pc": 6392,
              "ownerPc": 6265
            },
            {
              "block": 3745,
              "seqIndex": 3744,
              "name": "D02437",
              "before": 13740236,
              "after": 0,
              "pc": 6392,
              "ownerPc": 6265
            },
            {
              "block": 3745,
              "seqIndex": 3744,
              "name": "D0243A",
              "before": 13740237,
              "after": 0,
              "pc": 6392,
              "ownerPc": 6265
            },
            {
              "block": 3745,
              "seqIndex": 3744,
              "name": "D0243D",
              "before": 13805630,
              "after": 0,
              "pc": 6392,
              "ownerPc": 6265
            },
            {
              "block": 3745,
              "seqIndex": 3744,
              "name": "D02440",
              "before": 13805630,
              "after": 0,
              "pc": 6392,
              "ownerPc": 6265
            },
            {
              "block": 3745,
              "seqIndex": 3744,
              "name": "D02505",
              "before": 10,
              "after": 0,
              "pc": 6392,
              "ownerPc": 6265
            },
            {
              "block": 3745,
              "seqIndex": 3744,
              "name": "D02590",
              "before": 13893249,
              "after": 0,
              "pc": 6392,
              "ownerPc": 6265
            },
            {
              "block": 3745,
              "seqIndex": 3744,
              "name": "D0259D",
              "before": 13893325,
              "after": 0,
              "pc": 6392,
              "ownerPc": 6265
            },
            {
              "block": 3745,
              "seqIndex": 3744,
              "name": "D0301B",
              "before": 5940570,
              "after": 0,
              "pc": 6392,
              "ownerPc": 6265
            }
          ]
        }
      ],
      "key": {
        "termination": "control_pre_stop",
        "steps": 5924,
        "uiClearApplied": true,
        "wipes": 0,
        "controlStopPc": 664221,
        "vramPeak": 3103,
        "vramCurrent": 3103
      },
      "counts": {
        "getCsc03FA09": 1,
        "keyDebounceCounter03F9AE": 0,
        "keyDebounceFallthrough03F9B0": 0,
        "keyDebouncePost03F9B8": 0,
        "keyDebounceRefresh03F9D1": 0,
        "keyDebounceClear03F9D5": 0,
        "keyDebounceReturn03D058": 0,
        "clearFallthrough058A16": 1,
        "clearEntry0A223A": 1,
        "clearAnchor0A229D": 1,
        "preWipe001879": 0,
        "cleanup0018F8": 0,
        "poll006D64": 0
      },
      "oracleMismatches": [
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
        },
        {
          "name": "EDIT_TOKEN_D1A8CC",
          "oracle": 51,
          "actual": 0
        }
      ]
    }
  ]
}
```

No runtime, transpiler, browser-shell, decoder, peripheral, scheduler, ROM artifact, or `follow-alongs/` files were changed.


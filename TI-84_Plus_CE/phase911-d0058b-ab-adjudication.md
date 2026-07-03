# Phase 911: D0058B Route-Controller A/B Adjudication

Probe: `probe-phase911-d0058b-ab-adjudication.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase911-d0058b-ab-adjudication.mjs`

Serves a temporary instrumented copy of `browser-shell.html`. Disk `browser-shell.html` is not edited.

## Summary

- Probe completed: PASS.
- Baseline transition first post-GetCSC counter next PC: 0x03F9B0; termination=max_steps; wipes=3.
- Post-GetCSC force changed only in-memory D0058B at the Phase910 split: 0x01 -> 0xCB; next PC=0x03D058; termination=max_steps; uiClearApplied=false; wipes=3.
- First-counter force changed the first D0058B==0x01 occurrence in the CLEAR burst: 0x01 -> 0xCB; post-GetCSC next PC=0x03D058; termination=control_pre_stop; uiClearApplied=true; wipes=0; oracle residuals=D0243D, EDIT_TOKEN_D1A8CC.
- Standalone CLEAR control reached 0x0A229D=1, uiClearApplied=true, oracle mismatches=1.
- Interpretation: D0058B is confirmed as more than the post-anchor branch controller. Forcing the first D0058B==0x01 countdown event in the CLEAR burst prevents the later wipe route and reaches the normal 0x058A16 -> 0x0A223A -> 0x0A229D CLEAR pre-stop, but it is not yet a full oracle fix because residual after-CLEAR mismatches remain.

## Route Summary

| Scenario | Forced | First 0x03F9AE next | 0x0A229D | 0x001879 | 0x0018F8 | Term | UI clear | Wipes | Oracle mismatches |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| standalone-clear | no | 0x03D058 | 1 | 0 | 0 | control_pre_stop | yes | 0 | 1 |
| transition-baseline | no | 0x03F9B0 | 0 | 3 | 3 | max_steps | no | 3 | 16 |
| transition-force-d0058b-cb | 0x01 -> 0xCB | 0x03D058 | 0 | 3 | 3 | max_steps | no | 3 | 16 |
| transition-force-first-d0058b-cb | 0x01 -> 0xCB | 0x03D058 | 1 | 0 | 0 | control_pre_stop | yes | 0 | 2 |

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
| transition-force-d0058b-cb | D007CA | 0x000000 | NO |
| transition-force-d0058b-cb | D008E0 | 0x000000 | NO |
| transition-force-d0058b-cb | D010EF | 0x000000 | NO |
| transition-force-d0058b-cb | D010FE | 0x000000 | NO |
| transition-force-d0058b-cb | D0243A | 0x000000 | NO |
| transition-force-d0058b-cb | D0243D | 0x000000 | NO |
| transition-force-d0058b-cb | D02590 | 0x000000 | NO |
| transition-force-d0058b-cb | D0259D | 0x000000 | NO |
| transition-force-d0058b-cb | D0301B | 0x000000 | NO |
| transition-force-d0058b-cb | EDIT_TOKEN_D1A8CC | 0x33 | yes |
| transition-force-first-d0058b-cb | D007CA | 0x0585E9 | yes |
| transition-force-first-d0058b-cb | D008E0 | 0xD1A86C | yes |
| transition-force-first-d0058b-cb | D010EF | 0xD2A83E | yes |
| transition-force-first-d0058b-cb | D010FE | 0xD1A8CC | yes |
| transition-force-first-d0058b-cb | D0243A | 0xD1A8CC | yes |
| transition-force-first-d0058b-cb | D0243D | 0xD2A83D | NO |
| transition-force-first-d0058b-cb | D02590 | 0xD3FE81 | yes |
| transition-force-first-d0058b-cb | D0259D | 0xD3FECD | yes |
| transition-force-first-d0058b-cb | D0301B | 0x5AA55A | yes |
| transition-force-first-d0058b-cb | EDIT_TOKEN_D1A8CC | 0x00 | NO |

## Baseline Transition Early Changes

| Seq | Field | Before | After | PC | Prev |
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

## Forced Transition Early Changes

| Seq | Field | Before | After | PC | Prev |
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
| 3899 | D0058B | 0x01 | 0xCB | 0x03F9AE | 0x03F9AB |
| 3900 | D0058B | 0xCB | 0xCA | 0x03D058 | 0x03F9AE |
| 4164 | D0058B | 0xCA | 0xC9 | 0x03D058 | 0x03F9AE |
| 4364 | D0058B | 0xC9 | 0xC8 | 0x03D058 | 0x03F9AE |
| 4564 | D0058B | 0xC8 | 0xC7 | 0x03D058 | 0x03F9AE |
| 4965 | D0058B | 0xC7 | 0xC6 | 0x03D058 | 0x03F9AE |

## First-Counter Forced Early Changes

| Seq | Field | Before | After | PC | Prev |
| --- | --- | --- | --- | --- | --- |
| 0 | D00587 | 0x00 | 0x0F | 0x08C331 | - |
| 0 | D0058C | 0x00 | 0x0F | 0x08C331 | - |
| 0 | D0058E | 0x00 | 0x0F | 0x08C331 | - |
| 111 | D00589 | 0x22 | 0x00 | 0x03F9AE | 0x03F9A5 |
| 112 | D0058B | 0x05 | 0x04 | 0x03D058 | 0x03F9AE |
| 1022 | D0058B | 0x04 | 0x03 | 0x03D058 | 0x03F9AE |
| 1164 | D0058B | 0x03 | 0x02 | 0x03D058 | 0x03F9AE |
| 2570 | D0058B | 0x02 | 0x01 | 0x03D058 | 0x03F9AE |
| 2764 | D0058B | 0x01 | 0xCB | 0x03F9AE | 0x03F9AB |
| 2765 | D0058B | 0xCB | 0xCA | 0x03D058 | 0x03F9AE |
| 3032 | D0058B | 0xCA | 0xC9 | 0x03D058 | 0x03F9AE |
| 3164 | D0058B | 0xC9 | 0xC8 | 0x03D058 | 0x03F9AE |
| 3767 | D0058C | 0x0F | 0x00 | 0x02FCB3 | 0x08C359 |
| 3767 | D0058E | 0x0F | 0x00 | 0x02FCB3 | 0x08C359 |
| 3780 | D00587 | 0x0F | 0x00 | 0x000038 | 0x03FA09 |
| 3891 | D0058B | 0xC8 | 0xC7 | 0x03D058 | 0x03F9AE |
| 4048 | D0058C | 0x00 | 0x09 | 0x08C38A | 0x08C366 |
| 4164 | D0058B | 0xC7 | 0xC6 | 0x03D058 | 0x03F9AE |
| 4977 | D0058B | 0xC6 | 0xC5 | 0x03D058 | 0x03F9AE |
| 5165 | D0058B | 0xC5 | 0xC4 | 0x03D058 | 0x03F9AE |
| 5240 | D0243A | 0xD1A8CD | 0xD1A8CC | 0x05E7D1 | 0x05E26C |
| 5240 | D0243D | 0xD2A83E | 0xD2A83D | 0x05E7D1 | 0x05E26C |
| 5252 | D00596 | 0x01 | 0x00 | 0x0A1799 | 0x0A2BF9 |

## Bounded Machine JSON

```json
{
  "pass": true,
  "routes": [
    {
      "label": "standalone-clear",
      "afterDigit": null,
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
      "forceEvents": [],
      "targetCounts": {
        "getCsc03FA09": 1,
        "keyDebounceCounter03F9AE": 15,
        "keyDebounceFallthrough03F9B0": 0,
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
        "termination": "post_insert_gate_stop",
        "D0243A": 13740237,
        "token": 51,
        "D0058B": 5,
        "D00596": 1
      },
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
      "forceEvents": [],
      "targetCounts": {
        "getCsc03FA09": 2,
        "keyDebounceCounter03F9AE": 20,
        "keyDebounceFallthrough03F9B0": 8,
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
      "label": "transition-force-d0058b-cb",
      "afterDigit": {
        "termination": "post_insert_gate_stop",
        "D0243A": 13740237,
        "token": 51,
        "D0058B": 5,
        "D00596": 1
      },
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
        "nextPc": 249944
      },
      "forceEvents": [
        {
          "pc": 260526,
          "prevPc": 260523,
          "seqIndex": 3899,
          "requestedValue": 203,
          "matchValue": 1,
          "beforeD0058B": 1,
          "afterD0058B": 203
        }
      ],
      "targetCounts": {
        "getCsc03FA09": 2,
        "keyDebounceCounter03F9AE": 20,
        "keyDebounceFallthrough03F9B0": 3,
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
      "label": "transition-force-first-d0058b-cb",
      "afterDigit": {
        "termination": "post_insert_gate_stop",
        "D0243A": 13740237,
        "token": 51,
        "D0058B": 5,
        "D00596": 1
      },
      "afterClear": {
        "termination": "control_pre_stop",
        "steps": 74536,
        "uiClearApplied": true,
        "wipes": 0,
        "D007CA": 361961,
        "D0243A": 13740236,
        "D0058B": 196,
        "token": 0
      },
      "firstCounter": {
        "found": true,
        "anchorIndex": 3779,
        "counterIndex": 3890,
        "counterPc": 260526,
        "nextIndex": 3891,
        "nextPc": 249944
      },
      "forceEvents": [
        {
          "pc": 260526,
          "prevPc": 260523,
          "seqIndex": 2764,
          "requestedValue": 203,
          "matchValue": 1,
          "beforeD0058B": 1,
          "afterD0058B": 203
        }
      ],
      "targetCounts": {
        "getCsc03FA09": 1,
        "keyDebounceCounter03F9AE": 11,
        "keyDebounceFallthrough03F9B0": 0,
        "keyDebounceReturn03D058": 11,
        "clearFallthrough058A16": 0,
        "clearEntry0A223A": 0,
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
      "force": null,
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
      "force": null,
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
      "label": "transition-force-d0058b-cb",
      "firstCounter": {
        "found": true,
        "anchorIndex": 3788,
        "counterIndex": 3899,
        "counterPc": 260526,
        "nextIndex": 3900,
        "nextPc": 249944
      },
      "force": {
        "pc": 260526,
        "prevPc": 260523,
        "seqIndex": 3899,
        "requestedValue": 203,
        "matchValue": 1,
        "beforeD0058B": 1,
        "afterD0058B": 203,
        "beforeD0243A": 13740237,
        "afterD0243A": 13740237
      },
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
        "keyDebounceFallthrough03F9B0": 3,
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
      "label": "transition-force-first-d0058b-cb",
      "firstCounter": {
        "found": true,
        "anchorIndex": 3779,
        "counterIndex": 3890,
        "counterPc": 260526,
        "nextIndex": 3891,
        "nextPc": 249944
      },
      "force": {
        "pc": 260526,
        "prevPc": 260523,
        "seqIndex": 2764,
        "requestedValue": 203,
        "matchValue": 1,
        "beforeD0058B": 1,
        "afterD0058B": 203,
        "beforeD0243A": 13740237,
        "afterD0243A": 13740237
      },
      "key": {
        "termination": "control_pre_stop",
        "steps": 74536,
        "uiClearApplied": true,
        "wipes": 0,
        "controlStopPc": 664221,
        "vramPeak": 8585,
        "vramCurrent": 8482
      },
      "counts": {
        "getCsc03FA09": 1,
        "keyDebounceCounter03F9AE": 11,
        "keyDebounceFallthrough03F9B0": 0,
        "keyDebounceReturn03D058": 11,
        "clearFallthrough058A16": 0,
        "clearEntry0A223A": 0,
        "clearAnchor0A229D": 1,
        "preWipe001879": 0,
        "cleanup0018F8": 0,
        "poll006D64": 0
      },
      "oracleMismatches": [
        {
          "name": "D0243D",
          "oracle": 13805630,
          "actual": 13805629
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


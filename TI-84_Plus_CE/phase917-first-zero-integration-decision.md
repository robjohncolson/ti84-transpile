# Phase 917: First-Zero Integration Decision

Probe: `probe-phase917-first-zero-integration-decision.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase917-first-zero-integration-decision.mjs`

Serves a temporary instrumented copy of `browser-shell.html`. Disk `browser-shell.html` is not edited.

## Summary

- Probe completed: PASS.
- Current browser Digit3 -> Escape route is still destructive: 0x0A229D=0, 0x001879=3, 0x0018F8=3, uiClearApplied=false, wipes=3.
- Coarse no-key frame after Digit3 is not a natural handoff: frame termination=max_steps, D007CA=0x000000, D0243A=0x000000, 0x001879=1, 0x0018F8=1.
- Exact first-zero stop reproduced: pc=0x03F9B0, D0058B=0x00, D00588=0x22, D007CA=0x0585E9, D0243A=0xD1A8CD, token=0x33.
- Exact first-zero handoff -> Escape route is correct: first 0x03F9AE next=0x03D058, 0x0A229D=1, 0x001879=0, 0x0018F8=0, uiClearApplied=true, wipes=0.
- Decision: Promote PHASE918: browser-demo logic should add a narrow post-insert debounce drain that stops exactly at 0x03F9B0 with D0058B=0, then returns to COLDBOOT_EVENT_LOOP_ENTRY before the next key. Existing browser logic does not perform that handoff naturally, and the available coarse 50K no-key frame over-continues into the 0x001879/0x0018F8 wipe path.

## Route Comparison

| Scenario | After Digit3 D0058B | After delay D0058B | Idle-frame D0058B | First 0x03F9AE next | 0x03F9B0 | 0x03F9B8 | 0x03F9D1 | 0x03F9D5 | 0x0A229D | 0x001879 | 0x0018F8 | Term | UI clear | Wipes | Oracle mismatches |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| current-browser-immediate-clear | 0x05 | - | - | 0x03F9B0 | 8 | 7 | 1 | 1 | 0 | 3 | 3 | max_steps | no | 3 | 16 |
| exact-first-zero-handoff-clear | 0x05 | - | first-zero-baseline stop-first-zero-counter:0x00 | 0x03D058 | 0 | 0 | 0 | 0 | 1 | 0 | 0 | control_pre_stop | yes | 0 | 2 |

## Natural Frame Probe

| Label | Budget | Term | Last PC | D0058B | D007CA | D0243A | Token | 0x03F9B0 | 0x001879 | 0x0018F8 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| natural-browser-50k-no-key-frame | 50000 | max_steps | 0x006D5D | 0x00 | 0x000000 | 0x000000 | 0x33 | 4 | 1 | 1 |

## First-Zero Stop

| Stop | Term | Steps | PC | D0058B | D00587 | D00588 | D00589 | D007CA | D0243A | Token | 0x001879 seen | 0x0018F8 seen |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| first-zero-baseline stop-first-zero-counter | phase914_stop_first-zero-counter | 2226 | 0x03F9B0 | 0x00 | 0x00 | 0x22 | 0x00 | 0x0585E9 | 0xD1A8CD | 0x33 | 0 | 0 |

## Static Browser-Shell Audit

| Contains D0058B logic | Contains 0x03F9B0 logic | Contains first-zero label | Post-insert returns to event loop | Control-stop returns to event loop |
| --- | --- | --- | --- | --- |
| no | no | no | yes | yes |

## Current Route Oracle Fields

| Scenario | Field | Actual | Match |
| --- | --- | --- | --- |
| current-browser-immediate-clear | D007CA | 0x000000 | NO |
| current-browser-immediate-clear | D008E0 | 0x000000 | NO |
| current-browser-immediate-clear | D010EF | 0x000000 | NO |
| current-browser-immediate-clear | D010FE | 0x000000 | NO |
| current-browser-immediate-clear | D0243A | 0x000000 | NO |
| current-browser-immediate-clear | D0243D | 0x000000 | NO |
| current-browser-immediate-clear | D02590 | 0x000000 | NO |
| current-browser-immediate-clear | D0259D | 0x000000 | NO |
| current-browser-immediate-clear | D0301B | 0x000000 | NO |
| current-browser-immediate-clear | EDIT_TOKEN_D1A8CC | 0x33 | yes |

## Handoff Route Oracle Fields

| Scenario | Field | Actual | Match |
| --- | --- | --- | --- |
| exact-first-zero-handoff-clear | D007CA | 0x0585E9 | yes |
| exact-first-zero-handoff-clear | D008E0 | 0xD1A86C | yes |
| exact-first-zero-handoff-clear | D010EF | 0xD2A83E | yes |
| exact-first-zero-handoff-clear | D010FE | 0xD1A8CC | yes |
| exact-first-zero-handoff-clear | D0243A | 0xD1A8CC | yes |
| exact-first-zero-handoff-clear | D0243D | 0xD2A83D | NO |
| exact-first-zero-handoff-clear | D02590 | 0xD3FE81 | yes |
| exact-first-zero-handoff-clear | D0259D | 0xD3FECD | yes |
| exact-first-zero-handoff-clear | D0301B | 0x5AA55A | yes |
| exact-first-zero-handoff-clear | EDIT_TOKEN_D1A8CC | 0x00 | NO |

## Current Route Samples

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

## Handoff Route Samples

| Seq | PC | Prev | D00587 | D00588 | D00589 | D0058B | D0058C | D0058E | D0243A | Token |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 3241 | 0x03F9AE | 0x03F9AB | 0x00 | 0x22 | 0x00 | 0x00 | 0x00 | 0x00 | 0xD1A8CD | 0x33 |
| 3242 | 0x03D058 | 0x03F9AE | 0x00 | 0x22 | 0x00 | 0xFF | 0x00 | 0x00 | 0xD1A8CD | 0x33 |
| 3379 | 0x03F9AE | 0x03F9AB | 0x00 | 0x22 | 0x00 | 0xFF | 0x00 | 0x00 | 0xD1A8CD | 0x33 |
| 3380 | 0x03D058 | 0x03F9AE | 0x00 | 0x22 | 0x00 | 0xFE | 0x00 | 0x00 | 0xD1A8CD | 0x33 |
| 4237 | 0x03F9AE | 0x03F9AB | 0x00 | 0x22 | 0x00 | 0xFE | 0x09 | 0x00 | 0xD1A8CD | 0x33 |
| 4238 | 0x03D058 | 0x03F9AE | 0x00 | 0x22 | 0x00 | 0xFD | 0x09 | 0x00 | 0xD1A8CD | 0x33 |
| 4380 | 0x03F9AE | 0x03F9AB | 0x00 | 0x22 | 0x00 | 0xFD | 0x09 | 0x00 | 0xD1A8CD | 0x33 |
| 4381 | 0x03D058 | 0x03F9AE | 0x00 | 0x22 | 0x00 | 0xFC | 0x09 | 0x00 | 0xD1A8CD | 0x33 |
| 4580 | 0x03F9AE | 0x03F9AB | 0x00 | 0x22 | 0x00 | 0xFC | 0x09 | 0x00 | 0xD1A8CD | 0x33 |
| 4581 | 0x03D058 | 0x03F9AE | 0x00 | 0x22 | 0x00 | 0xFB | 0x09 | 0x00 | 0xD1A8CD | 0x33 |
| 4617 | 0x05E26C | 0x05E24C | 0x00 | 0x22 | 0x00 | 0xFB | 0x09 | 0x00 | 0xD1A8CD | 0x33 |
| 4618 | 0x05E7D1 | 0x05E26C | 0x00 | 0x22 | 0x00 | 0xFB | 0x09 | 0x00 | 0xD1A8CC | 0x33 |
| 5195 | 0x05E7D1 | 0x05E246 | 0x00 | 0x22 | 0x00 | 0xFB | 0x09 | 0x00 | 0xD1A8CC | 0x33 |
| 18000 | 0x0A229D | 0x0A2A37 | 0x00 | 0x22 | 0x00 | 0xFB | 0x09 | 0x00 | 0xD1A8CC | 0x33 |

## Bounded Machine JSON

```json
{
  "pass": true,
  "decision": "Promote PHASE918: browser-demo logic should add a narrow post-insert debounce drain that stops exactly at 0x03F9B0 with D0058B=0, then returns to COLDBOOT_EVENT_LOOP_ENTRY before the next key. Existing browser logic does not perform that handoff naturally, and the available coarse 50K no-key frame over-continues into the 0x001879/0x0018F8 wipe path.",
  "currentRoute": {
    "label": "current-browser-immediate-clear",
    "firstCounter": {
      "found": true,
      "anchorIndex": 3788,
      "counterIndex": 3899,
      "counterPc": 260526,
      "nextIndex": 3900,
      "nextPc": 260528
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
      "keyDebounceFallthrough03F9B0": 8,
      "keyDebouncePost03F9B8": 7,
      "keyDebounceRefresh03F9D1": 1,
      "keyDebounceClear03F9D5": 1,
      "keyDebounceReturn03D058": 20,
      "clearFallthrough058A16": 0,
      "clearEntry0A223A": 0,
      "clearAnchor0A229D": 0,
      "residualOwner05E26C": 0,
      "residualObserved05E7D1": 0,
      "preWipe001879": 3,
      "cleanup0018F8": 3,
      "poll006D64": 20176
    },
    "oracleMismatches": [
      {
        "name": "D007CA",
        "oracle": 361961,
        "actual": 0,
        "match": false
      },
      {
        "name": "D008E0",
        "oracle": 13740140,
        "actual": 0,
        "match": false
      },
      {
        "name": "D010EF",
        "oracle": 13805630,
        "actual": 0,
        "match": false
      },
      {
        "name": "D010FE",
        "oracle": 13740236,
        "actual": 0,
        "match": false
      },
      {
        "name": "D010F4",
        "oracle": 31,
        "actual": 0,
        "match": false
      },
      {
        "name": "D02317",
        "oracle": 13805630,
        "actual": 0,
        "match": false
      },
      {
        "name": "D0231A",
        "oracle": 13805630,
        "actual": 0,
        "match": false
      },
      {
        "name": "D0231D",
        "oracle": 13805629,
        "actual": 0,
        "match": false
      },
      {
        "name": "D02437",
        "oracle": 13740236,
        "actual": 0,
        "match": false
      },
      {
        "name": "D0243A",
        "oracle": 13740236,
        "actual": 0,
        "match": false
      },
      {
        "name": "D0243D",
        "oracle": 13805630,
        "actual": 0,
        "match": false
      },
      {
        "name": "D02440",
        "oracle": 13805630,
        "actual": 0,
        "match": false
      },
      {
        "name": "D02505",
        "oracle": 10,
        "actual": 0,
        "match": false
      },
      {
        "name": "D02590",
        "oracle": 13893249,
        "actual": 0,
        "match": false
      },
      {
        "name": "D0259D",
        "oracle": 13893325,
        "actual": 0,
        "match": false
      },
      {
        "name": "D0301B",
        "oracle": 5940570,
        "actual": 0,
        "match": false
      }
    ]
  },
  "naturalFrame": {
    "label": "natural-browser-50k-no-key-frame",
    "budget": 50000,
    "result": {
      "steps": 50000,
      "termination": "max_steps",
      "lastPc": 27997,
      "lastMode": "adl"
    },
    "fields": {
      "D007CA": 0,
      "D008E0": 0,
      "D010EF": 0,
      "D010FE": 0,
      "D010F4": 0,
      "D02317": 0,
      "D0231A": 0,
      "D0231D": 0,
      "D02437": 0,
      "D0243A": 0,
      "D0243D": 0,
      "D02440": 0,
      "D02505": 0,
      "D02590": 0,
      "D0259D": 0,
      "D02A29": 0,
      "D0301B": 0,
      "D000CA_IY4A": 0,
      "D00587": 0,
      "D00588": 0,
      "D00589": 0,
      "D0058B": 0,
      "D0058C": 0,
      "D0058E": 0,
      "D00595": 4,
      "D00596": 19,
      "EDIT_TOKEN_D1A8CC": 51
    },
    "counts": {
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
      "residualOwner05E26C": 0,
      "residualObserved05E7D1": 0,
      "preWipe001879": 1,
      "cleanup0018F8": 1,
      "poll006D64": 4633
    }
  },
  "exactHandoffRoute": {
    "label": "exact-first-zero-handoff-clear",
    "firstCounter": {
      "found": true,
      "anchorIndex": 3130,
      "counterIndex": 3241,
      "counterPc": 260526,
      "nextIndex": 3242,
      "nextPc": 249944
    },
    "key": {
      "termination": "control_pre_stop",
      "steps": 73906,
      "uiClearApplied": true,
      "wipes": 0,
      "controlStopPc": 664221,
      "vramPeak": 8585,
      "vramCurrent": 8482
    },
    "counts": {
      "getCsc03FA09": 1,
      "keyDebounceCounter03F9AE": 5,
      "keyDebounceFallthrough03F9B0": 0,
      "keyDebouncePost03F9B8": 0,
      "keyDebounceRefresh03F9D1": 0,
      "keyDebounceClear03F9D5": 0,
      "keyDebounceReturn03D058": 5,
      "clearFallthrough058A16": 0,
      "clearEntry0A223A": 0,
      "clearAnchor0A229D": 1,
      "residualOwner05E26C": 1,
      "residualObserved05E7D1": 2,
      "preWipe001879": 0,
      "cleanup0018F8": 0,
      "poll006D64": 0
    },
    "oracleMismatches": [
      {
        "name": "D0243D",
        "oracle": 13805630,
        "actual": 13805629,
        "match": false
      },
      {
        "name": "EDIT_TOKEN_D1A8CC",
        "oracle": 51,
        "actual": 0,
        "match": false
      }
    ]
  },
  "firstZero": {
    "stop": {
      "termination": "phase914_stop_first-zero-counter",
      "pc": 260528,
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
      }
    }
  },
  "staticAudit": {
    "containsD0058B": false,
    "contains03F9B0": false,
    "containsFirstZero": false,
    "postInsertResetsToEventLoop": true,
    "controlStopResetsToEventLoop": true
  }
}
```

No runtime, transpiler, browser-shell, decoder, peripheral, scheduler, ROM artifact, or `follow-alongs/` files were changed.


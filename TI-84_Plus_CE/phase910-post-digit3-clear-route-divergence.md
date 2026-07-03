# Phase 910: Post-Digit3 CLEAR Route Divergence

Probe: `probe-phase910-post-digit3-clear-route-divergence.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase910-post-digit3-clear-route-divergence.mjs`

Serves a temporary instrumented copy of `browser-shell.html`, runs a fresh standalone Escape/CLEAR route, then runs a fresh Digit3 -> Escape/CLEAR transition route. Disk `browser-shell.html` is not edited.

## Summary

- Probe completed: PASS.
- Standalone CLEAR: termination=control_pre_stop, steps=74340, controlStopPc=0x0A229D, uiClearApplied=true, wipes=0.
- Transition CLEAR: termination=max_steps, steps=350000, controlStopPc=-, uiClearApplied=false, wipes=3.
- First divergence after first 0x03FA09 key-consumption anchor: previous=0x03F9AE, standalone next=0x03D058, transition next=0x03F9B0.
- Controller: 0x03F9AE is the first split: the lifted block is DEC (D0058B); RET NZ. Standalone enters with D0058B=0xCB, so DEC leaves a nonzero value and returns to 0x03D058. Transition enters with D0058B=0x01, so DEC reaches zero, RET NZ falls through to 0x03F9B0, and that later routes to 0x001879 -> 0x0018F8.
- Interpretation: post-Digit3 CLEAR does not reach the later `0x058A14` home CLEAR handler at all. It diverges first in the key-scan debounce/countdown path at `0x03F9AE`: `D0058B=0x01` after Digit3 causes `DEC (D0058B)` to reach zero, so `RET NZ` falls through to `0x03F9B0`; that path later reaches `0x001879 -> 0x0018F8` and wipes the watched context. Standalone CLEAR has a nonzero post-decrement counter and returns immediately to `0x03D058`, then reaches the normal `0x058A16 -> 0x0A223A -> 0x0A229D` pre-stop path.

## Route Counts

| Route | 0x058A16 | 0x058A2C | 0x0A223A | 0x0A229D | 0x001879 | 0x0018F8 | 0x006D64 | Termination | Wipes | UI clear |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| standalone CLEAR | 1 | 0 | 1 | 1 | 0 | 0 | 0 | control_pre_stop | 0 | yes |
| Digit3->CLEAR transition | 0 | 0 | 0 | 0 | 3 | 3 | 20176 | max_steps | 3 | no |

## First Divergence Window

| Rel | Standalone # | Standalone PC | Transition # | Transition PC | Same |
| --- | --- | --- | --- | --- | --- |
| -10 | 3944 | 0x0003D4 (0x0003D4) | 3890 | 0x0003D4 (0x0003D4) | yes |
| -9 | 3945 | 0x003CC2 (0x003CC2) | 3891 | 0x003CC2 (0x003CC2) | yes |
| -8 | 3946 | 0x003CD4 (0x003CD4) | 3892 | 0x003CD4 (0x003CD4) | yes |
| -7 | 3947 | 0x003CE0 (0x003CE0) | 3893 | 0x003CE0 (0x003CE0) | yes |
| -6 | 3948 | 0x003CEE (0x003CEE) | 3894 | 0x003CEE (0x003CEE) | yes |
| -5 | 3949 | 0x003CF3 (0x003CF3) | 3895 | 0x003CF3 (0x003CF3) | yes |
| -4 | 3950 | 0x03F998 (keyDebounceBranch03F998) | 3896 | 0x03F998 (keyDebounceBranch03F998) | yes |
| -3 | 3951 | 0x03F99A (keyDebounceCompare03F99A) | 3897 | 0x03F99A (keyDebounceCompare03F99A) | yes |
| -2 | 3952 | 0x03F9AB (keyDebounceOr03F9AB) | 3898 | 0x03F9AB (keyDebounceOr03F9AB) | yes |
| -1 | 3953 | 0x03F9AE (keyDebounceCounter03F9AE) | 3899 | 0x03F9AE (keyDebounceCounter03F9AE) | yes |
| 0 | 3954 | 0x03D058 (keyDebounceReturn03D058) | 3900 | 0x03F9B0 (keyDebounceFallthrough03F9B0) | NO |
| 1 | 3955 | 0x05C623 (0x05C623) | 3901 | 0x03F9B8 (keyDebouncePost03F9B8) | NO |
| 2 | 3956 | 0x03D060 (0x03D060) | 3902 | 0x03D058 (keyDebounceReturn03D058) | NO |
| 3 | 3957 | 0x03D066 (0x03D066) | 3903 | 0x05C623 (0x05C623) | NO |
| 4 | 3958 | 0x03D073 (0x03D073) | 3904 | 0x03D060 (0x03D060) | NO |
| 5 | 3959 | 0x03D079 (0x03D079) | 3905 | 0x03D066 (0x03D066) | NO |
| 6 | 3960 | 0x03D0E0 (0x03D0E0) | 3906 | 0x03D073 (0x03D073) | NO |
| 7 | 3961 | 0x000038 (0x000038) | 3907 | 0x03D079 (0x03D079) | NO |
| 8 | 3962 | 0x0006F3 (0x0006F3) | 3908 | 0x03D0E0 (0x03D0E0) | NO |
| 9 | 3963 | 0x000704 (0x000704) | 3909 | 0x000038 (0x000038) | NO |
| 10 | 3964 | 0x000710 (0x000710) | 3910 | 0x0006F3 (0x0006F3) | NO |

## Key-Scan Counter Window

| Route | Seq | PC | Prev | AF | HL | D00588 | D00589 | D0058B | D0058C | D0058E | D0243A |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| standalone CLEAR | 3953 | 0x03F9AE | 0x03F9AB | 0x0044 | 0xD0058B | 0x00 | 0x00 | 0xCB | 0x00 | 0x00 | 0xD1A8CC |
| Digit3->CLEAR transition | 3899 | 0x03F9AE | 0x03F9AB | 0x0044 | 0xD0058B | 0x00 | 0x00 | 0x01 | 0x00 | 0x00 | 0xD1A8CD |

## 0x04C973 Compare Trace

Not reached before the first split.

## Standalone 0x058212 Window

window not found

## Transition 0x058212 Window

window not found

## Diffs At Previous Common Block

| Kind | Name | Standalone | Transition |
| --- | --- | --- | --- |
| field | D0243A | 0xD1A8CC | 0xD1A8CD |
| field | D0058B | 0xCB | 0x01 |
| field | D00596 | 0x00 | 0x01 |
| field | EDIT_TOKEN_D1A8CC | 0x00 | 0x33 |

## Transition Field Changes Before Wipe

| Block | Seq | Field | Before | After | PC | Prev PC |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 0 | D00587 | 0x00 | 0x0F | 0x08C331 | - |
| 1 | 0 | D0058C | 0x00 | 0x0F | 0x08C331 | - |
| 1 | 0 | D0058E | 0x00 | 0x0F | 0x08C331 | - |
| 112 | 111 | D00589 | 0x22 | 0x00 | 0x03F9AE | 0x03F9A5 |
| 113 | 112 | D0058B | 0x05 | 0x04 | 0x03D058 | 0x03F9AE |
| 1023 | 1022 | D0058B | 0x04 | 0x03 | 0x03D058 | 0x03F9AE |
| 1165 | 1164 | D0058B | 0x03 | 0x02 | 0x03D058 | 0x03F9AE |
| 2571 | 2570 | D0058B | 0x02 | 0x01 | 0x03D058 | 0x03F9AE |
| 2766 | 2765 | D0058B | 0x01 | 0x00 | 0x03F9B0 | 0x03F9AE |
| 2767 | 2766 | D0058B | 0x00 | 0x01 | 0x03F9D1 | 0x03F9B0 |
| 2769 | 2768 | D00587 | 0x0F | 0x00 | 0x03F9D5 | 0x03F9FA |
| 2771 | 2770 | D00588 | 0x22 | 0x00 | 0x03D058 | 0x03F9DC |
| 3038 | 3037 | D0058B | 0x01 | 0x00 | 0x03F9B0 | 0x03F9AE |
| 3039 | 3038 | D0058B | 0x00 | 0x01 | 0x03F9B8 | 0x03F9B0 |
| 3165 | 3164 | D0058B | 0x01 | 0x00 | 0x03F9B0 | 0x03F9AE |
| 3166 | 3165 | D0058B | 0x00 | 0x01 | 0x03F9B8 | 0x03F9B0 |
| 3777 | 3776 | D0058C | 0x0F | 0x00 | 0x02FCB3 | 0x08C359 |
| 3777 | 3776 | D0058E | 0x0F | 0x00 | 0x02FCB3 | 0x08C359 |
| 3901 | 3900 | D0058B | 0x01 | 0x00 | 0x03F9B0 | 0x03F9AE |
| 3902 | 3901 | D0058B | 0x00 | 0x01 | 0x03F9B8 | 0x03F9B0 |
| 4165 | 4164 | D0058B | 0x01 | 0x00 | 0x03F9B0 | 0x03F9AE |
| 4166 | 4165 | D0058B | 0x00 | 0x01 | 0x03F9B8 | 0x03F9B0 |
| 4365 | 4364 | D0058B | 0x01 | 0x00 | 0x03F9B0 | 0x03F9AE |
| 4366 | 4365 | D0058B | 0x00 | 0x01 | 0x03F9B8 | 0x03F9B0 |
| 4566 | 4565 | D0058B | 0x01 | 0x00 | 0x03F9B0 | 0x03F9AE |
| 4567 | 4566 | D0058B | 0x00 | 0x01 | 0x03F9B8 | 0x03F9B0 |
| 4974 | 4973 | D0058B | 0x01 | 0x00 | 0x03F9B0 | 0x03F9AE |
| 4975 | 4974 | D0058B | 0x00 | 0x01 | 0x03F9B8 | 0x03F9B0 |
| 5553 | 5552 | D007CA | 0x0585E9 | 0x000000 | 0x0018F8 | 0x001879 |
| 5553 | 5552 | D008E0 | 0xD1A86C | 0x000000 | 0x0018F8 | 0x001879 |
| 5553 | 5552 | D010EF | 0xD2A83E | 0x000000 | 0x0018F8 | 0x001879 |
| 5553 | 5552 | D010FE | 0xD1A8CC | 0x000000 | 0x0018F8 | 0x001879 |
| 5553 | 5552 | D010F4 | 0x1F | 0x00 | 0x0018F8 | 0x001879 |
| 5553 | 5552 | D02317 | 0xD2A83E | 0x000000 | 0x0018F8 | 0x001879 |
| 5553 | 5552 | D0231A | 0xD2A83E | 0x000000 | 0x0018F8 | 0x001879 |
| 5553 | 5552 | D0231D | 0xD2A83D | 0x000000 | 0x0018F8 | 0x001879 |
| 5553 | 5552 | D02437 | 0xD1A8CC | 0x000000 | 0x0018F8 | 0x001879 |
| 5553 | 5552 | D0243A | 0xD1A8CD | 0x000000 | 0x0018F8 | 0x001879 |
| 5553 | 5552 | D0243D | 0xD2A83E | 0x000000 | 0x0018F8 | 0x001879 |
| 5553 | 5552 | D02440 | 0xD2A83E | 0x000000 | 0x0018F8 | 0x001879 |

## Final Field Comparison

| Field | Oracle after CLEAR | Standalone CLEAR | Transition CLEAR |
| --- | --- | --- | --- |
| D007CA | 0x0585E9 | 0x0585E9 | 0x000000 |
| D008E0 | 0xD1A86C | 0xD1A86C | 0x000000 |
| D02437 | 0xD1A8CC | 0xD1A8CC | 0x000000 |
| D0243A | 0xD1A8CC | 0xD1A8CC | 0x000000 |
| D0243D | 0xD2A83E | 0xD2A83E | 0x000000 |
| D02505 | 0x0A | 0x0A | 0x00 |
| D02590 | 0xD3FE81 | 0xD3FE81 | 0x000000 |
| D0259D | 0xD3FECD | 0xD3FECD | 0x000000 |
| D02A29 | 0x0000 | 0x0000 | 0x0000 |
| D0301B | 0x5AA55A | 0x5AA55A | 0x000000 |
| EDIT_TOKEN_D1A8CC | 0x33 | 0x00 | 0x33 |

## Bounded Machine JSON

```json
{
  "pass": true,
  "divergence": {
    "found": true,
    "anchorPc": "0x03FA09",
    "offset": 112,
    "standaloneIndex": 3954,
    "transitionIndex": 3900,
    "previousStandaloneIndex": 3953,
    "previousTransitionIndex": 3899,
    "previousPc": "0x03F9AE",
    "standaloneNextPc": "0x03D058",
    "transitionNextPc": "0x03F9B0"
  },
  "controller": {
    "kind": "key-debounce-counter",
    "controller": "0x03F9AE is the first split: the lifted block is DEC (D0058B); RET NZ. Standalone enters with D0058B=0xCB, so DEC leaves a nonzero value and returns to 0x03D058. Transition enters with D0058B=0x01, so DEC reaches zero, RET NZ falls through to 0x03F9B0, and that later routes to 0x001879 -> 0x0018F8.",
    "standaloneSample": {
      "label": "keyDebounceCounter03F9AE",
      "block": 3954,
      "seqIndex": 3953,
      "pc": "0x03F9AE",
      "prevPc": "0x03F9AB",
      "status": "Coldboot complete. OS event loop is ready.",
      "cpu": {
        "pc": "0x03F9AE",
        "currentBlockPc": "0x03F9AE",
        "sp": "0xD1A848",
        "af": "0x0044",
        "bc": "0x00A008",
        "de": "0x0080C0",
        "hl": "0xD0058B",
        "ix": "0xD1A860",
        "iy": "0xD00080",
        "f": "0x44",
        "halted": false
      },
      "fields": {
        "D007CA": "0x0585E9",
        "D008E0": "0xD1A86C",
        "D010EF": "0xD2A83E",
        "D010FE": "0xD1A8CC",
        "D010F4": "0x1F",
        "D02317": "0xD2A83E",
        "D0231A": "0xD2A83E",
        "D0231D": "0xD2A83D",
        "D02437": "0xD1A8CC",
        "D0243A": "0xD1A8CC",
        "D0243D": "0xD2A83E",
        "D02440": "0xD2A83E",
        "D02505": "0x0A",
        "D02590": "0xD3FE81",
        "D0259D": "0xD3FECD",
        "D02A29": "0x0000",
        "D0301B": "0x5AA55A",
        "D000C2_IY42": "0x00",
        "D000C4_IY44": "0x00",
        "D000CA_IY4A": "0x21",
        "D00587": "0x00",
        "D00588": "0x00",
        "D00589": "0x00",
        "D0058B": "0xCB",
        "D0058C": "0x00",
        "D0058E": "0x00",
        "D00595": "0x00",
        "D00596": "0x00",
        "D0059A": "0x00",
        "EDIT_TOKEN_D1A8CC": "0x00"
      },
      "stackTop": [
        {
          "addr": "0xD1A848",
          "value": "0x03D058"
        },
        {
          "addr": "0xD1A84B",
          "value": "0xD1A8A1"
        },
        {
          "addr": "0xD1A84E",
          "value": "0xD00080"
        },
        {
          "addr": "0xD1A851",
          "value": "0xD1A860"
        },
        {
          "addr": "0xD1A854",
          "value": "0x03FB9A"
        }
      ],
      "editLine": {
        "D007CA": "0x0585E9",
        "D008E0": "0xD1A86C",
        "D0243A": "0xD1A8CC",
        "D0243D": "0xD2A83E",
        "D02590": "0xD3FE81",
        "D00595": 0,
        "D00596": 0,
        "buffer": [
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0
        ],
        "entryLineRoi": {
          "x": 0,
          "y": 34,
          "width": 128,
          "height": 26,
          "nonWhite": 140
        },
        "vramCurrent": 8622
      },
      "persistence": {
        "tokenGate": 0,
        "tokenA": 0,
        "tokenB": 0,
        "tuple": {
          "D02A29": 0,
          "D02A2B": 0,
          "D02A1B": 0,
          "D0059A": 0,
          "D01150": 0,
          "D0243D": 13805630,
          "D02A40": 13805630,
          "D02A28": 0
        }
      },
      "vram": 8622,
      "phase6": {
        "steps": 47298,
        "termination": "halt",
        "lastPc": 6581,
        "vram": 8482,
        "vatSnapshotCaptured": true,
        "naturalD0301BOwner": {
          "entry": 283838,
          "steps": 39171,
          "termination": "stopped_before_target",
          "lastPc": 646880,
          "beforeD0301B": 0,
          "afterD0301B": 5940570
        }
      },
      "lastKey": null,
      "pageErrors": []
    },
    "transitionSample": {
      "label": "keyDebounceCounter03F9AE",
      "block": 3900,
      "seqIndex": 3899,
      "pc": "0x03F9AE",
      "prevPc": "0x03F9AB",
      "status": "Key: 3 → 7526 steps (post_insert_gate_stop, insert=0x33 @0xd1a8cc, peak 8689px)",
      "cpu": {
        "pc": "0x03F9AE",
        "currentBlockPc": "0x03F9AE",
        "sp": "0xD1A848",
        "af": "0x0044",
        "bc": "0x00A008",
        "de": "0x0080C0",
        "hl": "0xD0058B",
        "ix": "0xD1A860",
        "iy": "0xD00080",
        "f": "0x44",
        "halted": false
      },
      "fields": {
        "D007CA": "0x0585E9",
        "D008E0": "0xD1A86C",
        "D010EF": "0xD2A83E",
        "D010FE": "0xD1A8CC",
        "D010F4": "0x1F",
        "D02317": "0xD2A83E",
        "D0231A": "0xD2A83E",
        "D0231D": "0xD2A83D",
        "D02437": "0xD1A8CC",
        "D0243A": "0xD1A8CD",
        "D0243D": "0xD2A83E",
        "D02440": "0xD2A83E",
        "D02505": "0x0A",
        "D02590": "0xD3FE81",
        "D0259D": "0xD3FECD",
        "D02A29": "0x0000",
        "D0301B": "0x5AA55A",
        "D000C2_IY42": "0x00",
        "D000C4_IY44": "0x00",
        "D000CA_IY4A": "0x21",
        "D00587": "0x00",
        "D00588": "0x00",
        "D00589": "0x00",
        "D0058B": "0x01",
        "D0058C": "0x00",
        "D0058E": "0x00",
        "D00595": "0x00",
        "D00596": "0x01",
        "D0059A": "0x00",
        "EDIT_TOKEN_D1A8CC": "0x33"
      },
      "stackTop": [
        {
          "addr": "0xD1A848",
          "value": "0x03D058"
        },
        {
          "addr": "0xD1A84B",
          "value": "0xD1A8A1"
        },
        {
          "addr": "0xD1A84E",
          "value": "0xD00080"
        },
        {
          "addr": "0xD1A851",
          "value": "0xD1A860"
        },
        {
          "addr": "0xD1A854",
          "value": "0x03FA1C"
        }
      ],
      "editLine": {
        "D007CA": "0x0585E9",
        "D008E0": "0xD1A86C",
        "D0243A": "0xD1A8CD",
        "D0243D": "0xD2A83E",
        "D02590": "0xD3FE81",
        "D00595": 0,
        "D00596": 1,
        "buffer": [
          51,
          0,
          0,
          0,
          0,
          0,
          0,
          0
        ],
        "entryLineRoi": {
          "x": 0,
          "y": 34,
          "width": 128,
          "height": 26,
          "nonWhite": 207
        },
        "vramCurrent": 8689
      },
      "persistence": {
        "tokenGate": 0,
        "tokenA": 0,
        "tokenB": 0,
        "tuple": {
          "D02A29": 0,
          "D02A2B": 0,
          "D02A1B": 0,
          "D0059A": 0,
          "D01150": 0,
          "D0243D": 13805630,
          "D02A40": 13805630,
          "D02A28": 0
        }
      },
      "vram": 8689,
      "phase6": {
        "steps": 47298,
        "termination": "halt",
        "lastPc": 6581,
        "vram": 8482,
        "vatSnapshotCaptured": true,
        "naturalD0301BOwner": {
          "entry": 283838,
          "steps": 39171,
          "termination": "stopped_before_target",
          "lastPc": 646880,
          "beforeD0301B": 0,
          "afterD0301B": 5940570
        }
      },
      "lastKey": {
        "code": "Digit3",
        "label": "3",
        "expectedInsertByte": 51,
        "controlPreStopPc": null,
        "controlPreStopLabel": null,
        "cursorBefore": 13740236,
        "insertBlock": 2908,
        "postInsertGateBlock": 7504,
        "stoppedAtPostInsertGate": true,
        "D000C2Bit7Restored": true,
        "controlStopBlock": null,
        "controlStopPc": null,
        "controlStopCursorBefore": null,
        "controlStopCursorAfter": null,
        "controlStopCursorRestored": false,
        "uiClearApplied": false,
        "uiClearResult": null,
        "stoppedBeforeControlClear": false,
        "contextVectorRestoreEnabled": false,
        "contextVectorRestored": false,
        "contextVectorRestoreBlock": null,
        "contextVectorRestorePc": null,
        "contextVectorD007CABefore": null,
        "contextVectorD007CAAfter": null,
        "steps": 7526,
        "termination": "post_insert_gate_stop",
        "wipes": 0,
        "D0243A": 13740237,
        "D0243D": 13805630,
        "D007CA": 361961,
        "D008E0": 13740140,
        "D02590": 13893249,
        "D000C2": 0,
        "buffer": [
          51,
          0,
          0,
          0,
          0,
          0,
          0,
          0
        ],
        "vramPeak": 8689,
        "vramCurrent": 8689
      },
      "pageErrors": []
    }
  },
  "standalone": {
    "afterBoot": {
      "label": "standalone:afterBoot",
      "block": null,
      "seqIndex": null,
      "pc": null,
      "prevPc": null,
      "status": "Coldboot complete. OS event loop is ready.",
      "cpu": {
        "pc": "0x0019B5",
        "currentBlockPc": "0x0019B5",
        "sp": "0xD1A866",
        "af": "0x1054",
        "bc": "0x000000",
        "de": "0xD2A815",
        "hl": "0xD1A8A3",
        "ix": "0xD1A860",
        "iy": "0xD00080",
        "f": "0x54",
        "halted": true
      },
      "fields": {
        "D007CA": "0x0585E9",
        "D008E0": "0x000000",
        "D010EF": "0xD2A83E",
        "D010FE": "0xD1A8CC",
        "D010F4": "0x1F",
        "D02317": "0xD2A83E",
        "D0231A": "0xD2A83E",
        "D0231D": "0xD2A83D",
        "D02437": "0xD1A8CC",
        "D0243A": "0xD1A8CC",
        "D0243D": "0xD2A83E",
        "D02440": "0xD2A83E",
        "D02505": "0x0A",
        "D02590": "0xD3FE81",
        "D0259D": "0xD3FECD",
        "D02A29": "0x0000",
        "D0301B": "0x5AA55A",
        "D000C2_IY42": "0x00",
        "D000C4_IY44": "0x00",
        "D000CA_IY4A": "0x20",
        "D00587": "0x00",
        "D00588": "0x00",
        "D00589": "0x00",
        "D0058B": "0xD3",
        "D0058C": "0x00",
        "D0058E": "0x00",
        "D00595": "0x00",
        "D00596": "0x00",
        "D0059A": "0x00",
        "EDIT_TOKEN_D1A8CC": "0x00"
      },
      "stackTop": [
        {
          "addr": "0xD1A866",
          "value": "0xFFFFFF"
        },
        {
          "addr": "0xD1A869",
          "value": "0xFFFFFF"
        },
        {
          "addr": "0xD1A86C",
          "value": "0xFFFFFF"
        },
        {
          "addr": "0xD1A86F",
          "value": "0xFFFFFF"
        },
        {
          "addr": "0xD1A872",
          "value": "0xFFFFFF"
        }
      ],
      "editLine": {
        "D007CA": "0x0585E9",
        "D008E0": "0x000000",
        "D0243A": "0xD1A8CC",
        "D0243D": "0xD2A83E",
        "D02590": "0xD3FE81",
        "D00595": 0,
        "D00596": 0,
        "buffer": [
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0
        ],
        "entryLineRoi": {
          "x": 0,
          "y": 34,
          "width": 128,
          "height": 26,
          "nonWhite": 0
        },
        "vramCurrent": 8482
      },
      "persistence": {
        "tokenGate": 0,
        "tokenA": 0,
        "tokenB": 0,
        "tuple": {
          "D02A29": 0,
          "D02A2B": 0,
          "D02A1B": 0,
          "D0059A": 0,
          "D01150": 0,
          "D0243D": 13805630,
          "D02A40": 13805630,
          "D02A28": 0
        }
      },
      "vram": 8482,
      "phase6": {
        "steps": 47298,
        "termination": "halt",
        "lastPc": 6581,
        "vram": 8482,
        "vatSnapshotCaptured": true,
        "naturalD0301BOwner": {
          "entry": 283838,
          "steps": 39171,
          "termination": "stopped_before_target",
          "lastPc": 646880,
          "beforeD0301B": 0,
          "afterD0301B": 5940570
        }
      },
      "lastKey": null,
      "pageErrors": []
    },
    "afterClear": {
      "label": "standalone Escape/CLEAR:afterKey",
      "block": null,
      "seqIndex": null,
      "pc": null,
      "prevPc": null,
      "status": "Key: CLEAR → 74340 steps (control_pre_stop, peak 8518px)",
      "cpu": {
        "pc": "0x0A229D",
        "currentBlockPc": "0x0A229D",
        "sp": "0xD1A851",
        "af": "0x0A0C",
        "bc": "0x000018",
        "de": "0x00013F",
        "hl": "0x000104",
        "ix": "0xD1A860",
        "iy": "0xD00080",
        "f": "0x0C",
        "halted": false
      },
      "fields": {
        "D007CA": "0x0585E9",
        "D008E0": "0xD1A86C",
        "D010EF": "0xD2A83E",
        "D010FE": "0xD1A8CC",
        "D010F4": "0x1F",
        "D02317": "0xD2A83E",
        "D0231A": "0xD2A83E",
        "D0231D": "0xD2A83D",
        "D02437": "0xD1A8CC",
        "D0243A": "0xD1A8CC",
        "D0243D": "0xD2A83E",
        "D02440": "0xD2A83E",
        "D02505": "0x0A",
        "D02590": "0xD3FE81",
        "D0259D": "0xD3FECD",
        "D02A29": "0x0000",
        "D0301B": "0x5AA55A",
        "D000C2_IY42": "0x00",
        "D000C4_IY44": "0x00",
        "D000CA_IY4A": "0x21",
        "D00587": "0x00",
        "D00588": "0x00",
        "D00589": "0x00",
        "D0058B": "0xC4",
        "D0058C": "0x09",
        "D0058E": "0x00",
        "D00595": "0x00",
        "D00596": "0x00",
        "D0059A": "0x02",
        "EDIT_TOKEN_D1A8CC": "0x00"
      },
      "stackTop": [
        {
          "addr": "0xD1A851",
          "value": "0x058A1A"
        },
        {
          "addr": "0xD1A854",
          "value": "0x08C73D"
        },
        {
          "addr": "0xD1A857",
          "value": "0x000009"
        },
        {
          "addr": "0xD1A85A",
          "value": "0x09F7AA"
        },
        {
          "addr": "0xD1A85D",
          "value": "0x08C53A"
        }
      ],
      "editLine": {
        "D007CA": "0x0585E9",
        "D008E0": "0xD1A86C",
        "D0243A": "0xD1A8CC",
        "D0243D": "0xD2A83E",
        "D02590": "0xD3FE81",
        "D00595": 0,
        "D00596": 0,
        "buffer": [
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0
        ],
        "entryLineRoi": {
          "x": 0,
          "y": 34,
          "width": 128,
          "height": 26,
          "nonWhite": 0
        },
        "vramCurrent": 8482
      },
      "persistence": {
        "tokenGate": 0,
        "tokenA": 0,
        "tokenB": 0,
        "tuple": {
          "D02A29": 0,
          "D02A2B": 0,
          "D02A1B": 0,
          "D0059A": 2,
          "D01150": 0,
          "D0243D": 13805630,
          "D02A40": 13805630,
          "D02A28": 0
        }
      },
      "vram": 8482,
      "phase6": {
        "steps": 47298,
        "termination": "halt",
        "lastPc": 6581,
        "vram": 8482,
        "vatSnapshotCaptured": true,
        "naturalD0301BOwner": {
          "entry": 283838,
          "steps": 39171,
          "termination": "stopped_before_target",
          "lastPc": 646880,
          "beforeD0301B": 0,
          "afterD0301B": 5940570
        }
      },
      "lastKey": {
        "code": "Escape",
        "label": "CLEAR",
        "expectedInsertByte": null,
        "controlPreStopPc": 664221,
        "controlPreStopLabel": "clear-eol-bc-zero-owner",
        "cursorBefore": null,
        "insertBlock": null,
        "postInsertGateBlock": null,
        "stoppedAtPostInsertGate": false,
        "D000C2Bit7Restored": false,
        "controlStopBlock": 74324,
        "controlStopPc": 664221,
        "controlStopCursorBefore": null,
        "controlStopCursorAfter": null,
        "controlStopCursorRestored": false,
        "uiClearApplied": true,
        "uiClearResult": {
          "ok": true,
          "reason": "clear-key",
          "editBase": 13740236,
          "clearLen": 128,
          "roiBefore": 0,
          "roiAfter": 0,
          "D0243A": 13740236,
          "D00595": 0,
          "D00596": 0
        },
        "stoppedBeforeControlClear": true,
        "contextVectorRestoreEnabled": false,
        "contextVectorRestored": false,
        "contextVectorRestoreBlock": null,
        "contextVectorRestorePc": null,
        "contextVectorD007CABefore": null,
        "contextVectorD007CAAfter": null,
        "steps": 74340,
        "termination": "control_pre_stop",
        "wipes": 0,
        "D0243A": 13740236,
        "D0243D": 13805630,
        "D007CA": 361961,
        "D008E0": 13740140,
        "D02590": 13893249,
        "D000C2": 0,
        "buffer": [
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0
        ],
        "vramPeak": 8518,
        "vramCurrent": 8482
      },
      "pageErrors": []
    },
    "record": {
      "label": "standalone Escape/CLEAR",
      "blockCount": 74324,
      "sequenceLength": 16000,
      "sequenceLimitReached": true,
      "start": {
        "label": "start",
        "block": null,
        "seqIndex": null,
        "pc": null,
        "prevPc": null,
        "status": "Coldboot complete. OS event loop is ready.",
        "cpu": {
          "pc": "0x0019B5",
          "currentBlockPc": "0x0019B5",
          "sp": "0xD1A866",
          "af": "0x1054",
          "bc": "0x000000",
          "de": "0xD2A815",
          "hl": "0xD1A8A3",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "f": "0x54",
          "halted": true
        },
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0x000000",
          "D010EF": "0xD2A83E",
          "D010FE": "0xD1A8CC",
          "D010F4": "0x1F",
          "D02317": "0xD2A83E",
          "D0231A": "0xD2A83E",
          "D0231D": "0xD2A83D",
          "D02437": "0xD1A8CC",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02440": "0xD2A83E",
          "D02505": "0x0A",
          "D02590": "0xD3FE81",
          "D0259D": "0xD3FECD",
          "D02A29": "0x0000",
          "D0301B": "0x5AA55A",
          "D000C2_IY42": "0x00",
          "D000C4_IY44": "0x00",
          "D000CA_IY4A": "0x20",
          "D00587": "0x00",
          "D00588": "0x00",
          "D00589": "0x00",
          "D0058B": "0xD3",
          "D0058C": "0x00",
          "D0058E": "0x00",
          "D00595": "0x00",
          "D00596": "0x00",
          "D0059A": "0x00",
          "EDIT_TOKEN_D1A8CC": "0x00"
        },
        "stackTop": [
          {
            "addr": "0xD1A866",
            "value": "0xFFFFFF"
          },
          {
            "addr": "0xD1A869",
            "value": "0xFFFFFF"
          },
          {
            "addr": "0xD1A86C",
            "value": "0xFFFFFF"
          },
          {
            "addr": "0xD1A86F",
            "value": "0xFFFFFF"
          },
          {
            "addr": "0xD1A872",
            "value": "0xFFFFFF"
          }
        ],
        "editLine": {
          "D007CA": "0x0585E9",
          "D008E0": "0x000000",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02590": "0xD3FE81",
          "D00595": 0,
          "D00596": 0,
          "buffer": [
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0
          ],
          "entryLineRoi": {
            "x": 0,
            "y": 34,
            "width": 128,
            "height": 26,
            "nonWhite": 0
          },
          "vramCurrent": 8482
        },
        "persistence": {
          "tokenGate": 0,
          "tokenA": 0,
          "tokenB": 0,
          "tuple": {
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 0,
            "D0059A": 0,
            "D01150": 0,
            "D0243D": 13805630,
            "D02A40": 13805630,
            "D02A28": 0
          }
        },
        "vram": 8482,
        "phase6": {
          "steps": 47298,
          "termination": "halt",
          "lastPc": 6581,
          "vram": 8482,
          "vatSnapshotCaptured": true,
          "naturalD0301BOwner": {
            "entry": 283838,
            "steps": 39171,
            "termination": "stopped_before_target",
            "lastPc": 646880,
            "beforeD0301B": 0,
            "afterD0301B": 5940570
          }
        },
        "lastKey": null,
        "pageErrors": []
      },
      "end": {
        "label": "end",
        "block": null,
        "seqIndex": null,
        "pc": null,
        "prevPc": null,
        "status": "Key: CLEAR → 74340 steps (control_pre_stop, peak 8518px)",
        "cpu": {
          "pc": "0x0A229D",
          "currentBlockPc": "0x0A229D",
          "sp": "0xD1A851",
          "af": "0x0A0C",
          "bc": "0x000018",
          "de": "0x00013F",
          "hl": "0x000104",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "f": "0x0C",
          "halted": false
        },
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A86C",
          "D010EF": "0xD2A83E",
          "D010FE": "0xD1A8CC",
          "D010F4": "0x1F",
          "D02317": "0xD2A83E",
          "D0231A": "0xD2A83E",
          "D0231D": "0xD2A83D",
          "D02437": "0xD1A8CC",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02440": "0xD2A83E",
          "D02505": "0x0A",
          "D02590": "0xD3FE81",
          "D0259D": "0xD3FECD",
          "D02A29": "0x0000",
          "D0301B": "0x5AA55A",
          "D000C2_IY42": "0x00",
          "D000C4_IY44": "0x00",
          "D000CA_IY4A": "0x21",
          "D00587": "0x00",
          "D00588": "0x00",
          "D00589": "0x00",
          "D0058B": "0xC4",
          "D0058C": "0x09",
          "D0058E": "0x00",
          "D00595": "0x00",
          "D00596": "0x00",
          "D0059A": "0x02",
          "EDIT_TOKEN_D1A8CC": "0x00"
        },
        "stackTop": [
          {
            "addr": "0xD1A851",
            "value": "0x058A1A"
          },
          {
            "addr": "0xD1A854",
            "value": "0x08C73D"
          },
          {
            "addr": "0xD1A857",
            "value": "0x000009"
          },
          {
            "addr": "0xD1A85A",
            "value": "0x09F7AA"
          },
          {
            "addr": "0xD1A85D",
            "value": "0x08C53A"
          }
        ],
        "editLine": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A86C",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02590": "0xD3FE81",
          "D00595": 0,
          "D00596": 0,
          "buffer": [
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0
          ],
          "entryLineRoi": {
            "x": 0,
            "y": 34,
            "width": 128,
            "height": 26,
            "nonWhite": 0
          },
          "vramCurrent": 8482
        },
        "persistence": {
          "tokenGate": 0,
          "tokenA": 0,
          "tokenB": 0,
          "tuple": {
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 0,
            "D0059A": 2,
            "D01150": 0,
            "D0243D": 13805630,
            "D02A40": 13805630,
            "D02A28": 0
          }
        },
        "vram": 8482,
        "phase6": {
          "steps": 47298,
          "termination": "halt",
          "lastPc": 6581,
          "vram": 8482,
          "vatSnapshotCaptured": true,
          "naturalD0301BOwner": {
            "entry": 283838,
            "steps": 39171,
            "termination": "stopped_before_target",
            "lastPc": 646880,
            "beforeD0301B": 0,
            "afterD0301B": 5940570
          }
        },
        "lastKey": {
          "code": "Escape",
          "label": "CLEAR",
          "expectedInsertByte": null,
          "controlPreStopPc": 664221,
          "controlPreStopLabel": "clear-eol-bc-zero-owner",
          "cursorBefore": null,
          "insertBlock": null,
          "postInsertGateBlock": null,
          "stoppedAtPostInsertGate": false,
          "D000C2Bit7Restored": false,
          "controlStopBlock": 74324,
          "controlStopPc": 664221,
          "controlStopCursorBefore": null,
          "controlStopCursorAfter": null,
          "controlStopCursorRestored": false,
          "uiClearApplied": true,
          "uiClearResult": {
            "ok": true,
            "reason": "clear-key",
            "editBase": 13740236,
            "clearLen": 128,
            "roiBefore": 0,
            "roiAfter": 0,
            "D0243A": 13740236,
            "D00595": 0,
            "D00596": 0
          },
          "stoppedBeforeControlClear": true,
          "contextVectorRestoreEnabled": false,
          "contextVectorRestored": false,
          "contextVectorRestoreBlock": null,
          "contextVectorRestorePc": null,
          "contextVectorD007CABefore": null,
          "contextVectorD007CAAfter": null,
          "steps": 74340,
          "termination": "control_pre_stop",
          "wipes": 0,
          "D0243A": 13740236,
          "D0243D": 13805630,
          "D007CA": 361961,
          "D008E0": 13740140,
          "D02590": 13893249,
          "D000C2": 0,
          "buffer": [
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0
          ],
          "vramPeak": 8518,
          "vramCurrent": 8482
        },
        "pageErrors": []
      },
      "targetCounts": {
        "eventLoop08C331": 1,
        "getCsc03FA09": 1,
        "keyDebounceBranch03F998": 15,
        "keyDebounceCompare03F99A": 15,
        "keyDebounceOr03F9AB": 15,
        "keyDebounceCounter03F9AE": 15,
        "keyDebounceFallthrough03F9B0": 0,
        "keyDebouncePost03F9B8": 0,
        "keyDebounceReturn03D058": 15,
        "insertGate0158DE": 0,
        "insertGateReturn0013DA": 0,
        "flagCaller058A10": 1,
        "flagOwner058212": 1,
        "flagGate0800B8": 2,
        "flagBranch058216": 1,
        "flagCompare05E3E3": 1,
        "flagCompareD0243D05E3F5": 1,
        "flagCompareD0243A05E3E8": 1,
        "flagCompare04C973": 6,
        "flagCompareReturn05E3E7": 1,
        "flagCompareReturn058221": 1,
        "flagReturn058A14": 1,
        "clearFallthrough058A16": 1,
        "clearTaken058A2C": 0,
        "clearEntry0A223A": 1,
        "clearAnchor0A229D": 1,
        "preWipe001879": 0,
        "cleanup0018F8": 0,
        "poll006D64": 0
      },
      "targetFirst": {
        "eventLoop08C331": {
          "label": "eventLoop08C331",
          "block": 1,
          "seqIndex": 0,
          "pc": "0x08C331",
          "prevPc": null,
          "status": "Coldboot complete. OS event loop is ready.",
          "cpu": {
            "pc": "0x08C331",
            "currentBlockPc": "0x08C331",
            "sp": "0xD1A863",
            "af": "0x1040",
            "bc": "0x000000",
            "de": "0xD2A815",
            "hl": "0xD1A8A3",
            "ix": "0xD1A860",
            "iy": "0xD00080",
            "f": "0x40",
            "halted": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D010EF": "0xD2A83E",
            "D010FE": "0xD1A8CC",
            "D010F4": "0x1F",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D0301B": "0x5AA55A",
            "D000C2_IY42": "0x00",
            "D000C4_IY44": "0x00",
            "D000CA_IY4A": "0x20",
            "D00587": "0x0F",
            "D00588": "0x00",
            "D00589": "0x00",
            "D0058B": "0xD3",
            "D0058C": "0x0F",
            "D0058E": "0x0F",
            "D00595": "0x00",
            "D00596": "0x00",
            "D0059A": "0x00",
            "EDIT_TOKEN_D1A8CC": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A863",
              "value": "0x0019B5"
            },
            {
              "addr": "0xD1A866",
              "value": "0xFFFFFF"
            },
            {
              "addr": "0xD1A869",
              "value": "0xFFFFFF"
            },
            {
              "addr": "0xD1A86C",
              "value": "0xFFFFFF"
            },
            {
              "addr": "0xD1A86F",
              "value": "0xFFFFFF"
            }
          ],
          "editLine": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02590": "0xD3FE81",
            "D00595": 0,
            "D00596": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 0
            },
            "vramCurrent": 8482
          },
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          },
          "vram": 8482,
          "phase6": {
            "steps": 47298,
            "termination": "halt",
            "lastPc": 6581,
            "vram": 8482,
            "vatSnapshotCaptured": true,
            "naturalD0301BOwner": {
              "entry": 283838,
              "steps": 39171,
              "termination": "stopped_before_target",
              "lastPc": 646880,
              "beforeD0301B": 0,
              "afterD0301B": 5940570
            }
          },
          "lastKey": null,
          "pageErrors": []
        },
        "keyDebounceBranch03F998": {
          "label": "keyDebounceBranch03F998",
          "block": 109,
          "seqIndex": 108,
          "pc": "0x03F998",
          "prevPc": "0x003CF3",
          "status": "Coldboot complete. OS event loop is ready.",
          "cpu": {
            "pc": "0x03F998",
            "currentBlockPc": "0x03F998",
            "sp": "0xD1A851",
            "af": "0x0044",
            "bc": "0x00A008",
            "de": "0x0080C0",
            "hl": "0x00FF00",
            "ix": "0xD1A860",
            "iy": "0xD00080",
            "f": "0x44",
            "halted": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D010EF": "0xD2A83E",
            "D010FE": "0xD1A8CC",
            "D010F4": "0x1F",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D0301B": "0x5AA55A",
            "D000C2_IY42": "0x00",
            "D000C4_IY44": "0x00",
            "D000CA_IY4A": "0x20",
            "D00587": "0x0F",
            "D00588": "0x00",
            "D00589": "0x00",
            "D0058B": "0xD3",
            "D0058C": "0x0F",
            "D0058E": "0x0F",
            "D00595": "0x00",
            "D00596": "0x00",
            "D0059A": "0x00",
            "EDIT_TOKEN_D1A8CC": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A851",
              "value": "0x03D058"
            },
            {
              "addr": "0xD1A854",
              "value": "0xD1A8A1"
            },
            {
              "addr": "0xD1A857",
              "value": "0xD00080"
            },
            {
              "addr": "0xD1A85A",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A85D",
              "value": "0x05C634"
            }
          ],
          "editLine": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02590": "0xD3FE81",
            "D00595": 0,
            "D00596": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 0
            },
            "vramCurrent": 8482
          },
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          },
          "vram": 8482,
          "phase6": {
            "steps": 47298,
            "termination": "halt",
            "lastPc": 6581,
            "vram": 8482,
            "vatSnapshotCaptured": true,
            "naturalD0301BOwner": {
              "entry": 283838,
              "steps": 39171,
              "termination": "stopped_before_target",
              "lastPc": 646880,
              "beforeD0301B": 0,
              "afterD0301B": 5940570
            }
          },
          "lastKey": null,
          "pageErrors": []
        },
        "keyDebounceCompare03F99A": {
          "label": "keyDebounceCompare03F99A",
          "block": 110,
          "seqIndex": 109,
          "pc": "0x03F99A",
          "prevPc": "0x03F998",
          "status": "Coldboot complete. OS event loop is ready.",
          "cpu": {
            "pc": "0x03F99A",
            "currentBlockPc": "0x03F99A",
            "sp": "0xD1A851",
            "af": "0x0044",
            "bc": "0x00A008",
            "de": "0x0080C0",
            "hl": "0x00FF00",
            "ix": "0xD1A860",
            "iy": "0xD00080",
            "f": "0x44",
            "halted": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D010EF": "0xD2A83E",
            "D010FE": "0xD1A8CC",
            "D010F4": "0x1F",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D0301B": "0x5AA55A",
            "D000C2_IY42": "0x00",
            "D000C4_IY44": "0x00",
            "D000CA_IY4A": "0x20",
            "D00587": "0x0F",
            "D00588": "0x00",
            "D00589": "0x00",
            "D0058B": "0xD3",
            "D0058C": "0x0F",
            "D0058E": "0x0F",
            "D00595": "0x00",
            "D00596": "0x00",
            "D0059A": "0x00",
            "EDIT_TOKEN_D1A8CC": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A851",
              "value": "0x03D058"
            },
            {
              "addr": "0xD1A854",
              "value": "0xD1A8A1"
            },
            {
              "addr": "0xD1A857",
              "value": "0xD00080"
            },
            {
              "addr": "0xD1A85A",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A85D",
              "value": "0x05C634"
            }
          ],
          "editLine": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02590": "0xD3FE81",
            "D00595": 0,
            "D00596": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 0
            },
            "vramCurrent": 8482
          },
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          },
          "vram": 8482,
          "phase6": {
            "steps": 47298,
            "termination": "halt",
            "lastPc": 6581,
            "vram": 8482,
            "vatSnapshotCaptured": true,
            "naturalD0301BOwner": {
              "entry": 283838,
              "steps": 39171,
              "termination": "stopped_before_target",
              "lastPc": 646880,
              "beforeD0301B": 0,
              "afterD0301B": 5940570
            }
          },
          "lastKey": null,
          "pageErrors": []
        },
        "keyDebounceOr03F9AB": {
          "label": "keyDebounceOr03F9AB",
          "block": 111,
          "seqIndex": 110,
          "pc": "0x03F9AB",
          "prevPc": "0x03F99A",
          "status": "Coldboot complete. OS event loop is ready.",
          "cpu": {
            "pc": "0x03F9AB",
            "currentBlockPc": "0x03F9AB",
            "sp": "0xD1A851",
            "af": "0x0042",
            "bc": "0x00A008",
            "de": "0x0080C0",
            "hl": "0xD0058B",
            "ix": "0xD1A860",
            "iy": "0xD00080",
            "f": "0x42",
            "halted": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D010EF": "0xD2A83E",
            "D010FE": "0xD1A8CC",
            "D010F4": "0x1F",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D0301B": "0x5AA55A",
            "D000C2_IY42": "0x00",
            "D000C4_IY44": "0x00",
            "D000CA_IY4A": "0x20",
            "D00587": "0x0F",
            "D00588": "0x00",
            "D00589": "0x00",
            "D0058B": "0xD3",
            "D0058C": "0x0F",
            "D0058E": "0x0F",
            "D00595": "0x00",
            "D00596": "0x00",
            "D0059A": "0x00",
            "EDIT_TOKEN_D1A8CC": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A851",
              "value": "0x03D058"
            },
            {
              "addr": "0xD1A854",
              "value": "0xD1A8A1"
            },
            {
              "addr": "0xD1A857",
              "value": "0xD00080"
            },
            {
              "addr": "0xD1A85A",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A85D",
              "value": "0x05C634"
            }
          ],
          "editLine": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02590": "0xD3FE81",
            "D00595": 0,
            "D00596": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 0
            },
            "vramCurrent": 8482
          },
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          },
          "vram": 8482,
          "phase6": {
            "steps": 47298,
            "termination": "halt",
            "lastPc": 6581,
            "vram": 8482,
            "vatSnapshotCaptured": true,
            "naturalD0301BOwner": {
              "entry": 283838,
              "steps": 39171,
              "termination": "stopped_before_target",
              "lastPc": 646880,
              "beforeD0301B": 0,
              "afterD0301B": 5940570
            }
          },
          "lastKey": null,
          "pageErrors": []
        },
        "keyDebounceCounter03F9AE": {
          "label": "keyDebounceCounter03F9AE",
          "block": 112,
          "seqIndex": 111,
          "pc": "0x03F9AE",
          "prevPc": "0x03F9AB",
          "status": "Coldboot complete. OS event loop is ready.",
          "cpu": {
            "pc": "0x03F9AE",
            "currentBlockPc": "0x03F9AE",
            "sp": "0xD1A851",
            "af": "0x0044",
            "bc": "0x00A008",
            "de": "0x0080C0",
            "hl": "0xD0058B",
            "ix": "0xD1A860",
            "iy": "0xD00080",
            "f": "0x44",
            "halted": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D010EF": "0xD2A83E",
            "D010FE": "0xD1A8CC",
            "D010F4": "0x1F",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D0301B": "0x5AA55A",
            "D000C2_IY42": "0x00",
            "D000C4_IY44": "0x00",
            "D000CA_IY4A": "0x20",
            "D00587": "0x0F",
            "D00588": "0x00",
            "D00589": "0x00",
            "D0058B": "0xD3",
            "D0058C": "0x0F",
            "D0058E": "0x0F",
            "D00595": "0x00",
            "D00596": "0x00",
            "D0059A": "0x00",
            "EDIT_TOKEN_D1A8CC": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A851",
              "value": "0x03D058"
            },
            {
              "addr": "0xD1A854",
              "value": "0xD1A8A1"
            },
            {
              "addr": "0xD1A857",
              "value": "0xD00080"
            },
            {
              "addr": "0xD1A85A",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A85D",
              "value": "0x05C634"
            }
          ],
          "editLine": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02590": "0xD3FE81",
            "D00595": 0,
            "D00596": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 0
            },
            "vramCurrent": 8482
          },
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          },
          "vram": 8482,
          "phase6": {
            "steps": 47298,
            "termination": "halt",
            "lastPc": 6581,
            "vram": 8482,
            "vatSnapshotCaptured": true,
            "naturalD0301BOwner": {
              "entry": 283838,
              "steps": 39171,
              "termination": "stopped_before_target",
              "lastPc": 646880,
              "beforeD0301B": 0,
              "afterD0301B": 5940570
            }
          },
          "lastKey": null,
          "pageErrors": []
        },
        "keyDebounceReturn03D058": {
          "label": "keyDebounceReturn03D058",
          "block": 113,
          "seqIndex": 112,
          "pc": "0x03D058",
          "prevPc": "0x03F9AE",
          "status": "Coldboot complete. OS event loop is ready.",
          "cpu": {
            "pc": "0x03D058",
            "currentBlockPc": "0x03D058",
            "sp": "0xD1A854",
            "af": "0x0082",
            "bc": "0x00A008",
            "de": "0x0080C0",
            "hl": "0xD0058B",
            "ix": "0xD1A860",
            "iy": "0xD00080",
            "f": "0x82",
            "halted": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D010EF": "0xD2A83E",
            "D010FE": "0xD1A8CC",
            "D010F4": "0x1F",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D0301B": "0x5AA55A",
            "D000C2_IY42": "0x00",
            "D000C4_IY44": "0x00",
            "D000CA_IY4A": "0x20",
            "D00587": "0x0F",
            "D00588": "0x00",
            "D00589": "0x00",
            "D0058B": "0xD2",
            "D0058C": "0x0F",
            "D0058E": "0x0F",
            "D00595": "0x00",
            "D00596": "0x00",
            "D0059A": "0x00",
            "EDIT_TOKEN_D1A8CC": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A854",
              "value": "0xD1A8A1"
            },
            {
              "addr": "0xD1A857",
              "value": "0xD00080"
            },
            {
              "addr": "0xD1A85A",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A85D",
              "value": "0x05C634"
            },
            {
              "addr": "0xD1A860",
              "value": "0x08C339"
            }
          ],
          "editLine": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02590": "0xD3FE81",
            "D00595": 0,
            "D00596": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 0
            },
            "vramCurrent": 8482
          },
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          },
          "vram": 8482,
          "phase6": {
            "steps": 47298,
            "termination": "halt",
            "lastPc": 6581,
            "vram": 8482,
            "vatSnapshotCaptured": true,
            "naturalD0301BOwner": {
              "entry": 283838,
              "steps": 39171,
              "termination": "stopped_before_target",
              "lastPc": 646880,
              "beforeD0301B": 0,
              "afterD0301B": 5940570
            }
          },
          "lastKey": null,
          "pageErrors": []
        },
        "flagCompare04C973": {
          "label": "flagCompare04C973",
          "block": 492,
          "seqIndex": 491,
          "pc": "0x04C973",
          "prevPc": "0x05E3D6",
          "status": "Coldboot complete. OS event loop is ready.",
          "cpu": {
            "pc": "0x04C973",
            "currentBlockPc": "0x04C973",
            "sp": "0xD1A84E",
            "af": "0x0075",
            "bc": "0x000000",
            "de": "0xD2A83E",
            "hl": "0xD1A8CC",
            "ix": "0xD1A860",
            "iy": "0xD00080",
            "f": "0x75",
            "halted": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D010EF": "0xD2A83E",
            "D010FE": "0xD1A8CC",
            "D010F4": "0x1F",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D0301B": "0x5AA55A",
            "D000C2_IY42": "0x00",
            "D000C4_IY44": "0x00",
            "D000CA_IY4A": "0x20",
            "D00587": "0x0F",
            "D00588": "0x00",
            "D00589": "0x00",
            "D0058B": "0xD0",
            "D0058C": "0x0F",
            "D0058E": "0x0F",
            "D00595": "0x00",
            "D00596": "0x00",
            "D0059A": "0x00",
            "EDIT_TOKEN_D1A8CC": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A84E",
              "value": "0x05C836"
            },
            {
              "addr": "0xD1A851",
              "value": "0x000000"
            },
            {
              "addr": "0xD1A854",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A857",
              "value": "0x00FFFF"
            },
            {
              "addr": "0xD1A85A",
              "value": "0xD2A815"
            }
          ],
          "editLine": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02590": "0xD3FE81",
            "D00595": 0,
            "D00596": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 0
            },
            "vramCurrent": 8482
          },
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          },
          "vram": 8482,
          "phase6": {
            "steps": 47298,
            "termination": "halt",
            "lastPc": 6581,
            "vram": 8482,
            "vatSnapshotCaptured": true,
            "naturalD0301BOwner": {
              "entry": 283838,
              "steps": 39171,
              "termination": "stopped_before_target",
              "lastPc": 646880,
              "beforeD0301B": 0,
              "afterD0301B": 5940570
            }
          },
          "lastKey": null,
          "pageErrors": []
        },
        "flagGate0800B8": {
          "label": "flagGate0800B8",
          "block": 2295,
          "seqIndex": 2294,
          "pc": "0x0800B8",
          "prevPc": "0x0581A3",
          "status": "Coldboot complete. OS event loop is ready.",
          "cpu": {
            "pc": "0x0800B8",
            "currentBlockPc": "0x0800B8",
            "sp": "0xD1A84E",
            "af": "0x0F42",
            "bc": "0x000F00",
            "de": "0xD2A815",
            "hl": "0x0585E9",
            "ix": "0xD1A860",
            "iy": "0xD00080",
            "f": "0x42",
            "halted": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D010EF": "0xD2A83E",
            "D010FE": "0xD1A8CC",
            "D010F4": "0x1F",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D0301B": "0x5AA55A",
            "D000C2_IY42": "0x00",
            "D000C4_IY44": "0x00",
            "D000CA_IY4A": "0x21",
            "D00587": "0x0F",
            "D00588": "0x00",
            "D00589": "0x00",
            "D0058B": "0xCD",
            "D0058C": "0x0F",
            "D0058E": "0x0F",
            "D00595": "0x00",
            "D00596": "0x00",
            "D0059A": "0x00",
            "EDIT_TOKEN_D1A8CC": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A84E",
              "value": "0x0581A7"
            },
            {
              "addr": "0xD1A851",
              "value": "0x0589B6"
            },
            {
              "addr": "0xD1A854",
              "value": "0x08C73D"
            },
            {
              "addr": "0xD1A857",
              "value": "0x000F0F"
            },
            {
              "addr": "0xD1A85A",
              "value": "0x00FFFF"
            }
          ],
          "editLine": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02590": "0xD3FE81",
            "D00595": 0,
            "D00596": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 36
            },
            "vramCurrent": 8518
          },
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          },
          "vram": 8518,
          "phase6": {
            "steps": 47298,
            "termination": "halt",
            "lastPc": 6581,
            "vram": 8482,
            "vatSnapshotCaptured": true,
            "naturalD0301BOwner": {
              "entry": 283838,
              "steps": 39171,
              "termination": "stopped_before_target",
              "lastPc": 646880,
              "beforeD0301B": 0,
              "afterD0301B": 5940570
            }
          },
          "lastKey": null,
          "pageErrors": []
        },
        "getCsc03FA09": {
          "label": "getCsc03FA09",
          "block": 3843,
          "seqIndex": 3842,
          "pc": "0x03FA09",
          "prevPc": "0x02FDB6",
          "status": "Coldboot complete. OS event loop is ready.",
          "cpu": {
            "pc": "0x03FA09",
            "currentBlockPc": "0x03FA09",
            "sp": "0xD1A85A",
            "af": "0x1A10",
            "bc": "0x00E000",
            "de": "0xD2A83E",
            "hl": "0x00FFFF",
            "ix": "0xD1A860",
            "iy": "0xD00080",
            "f": "0x10",
            "halted": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D010EF": "0xD2A83E",
            "D010FE": "0xD1A8CC",
            "D010F4": "0x1F",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D0301B": "0x5AA55A",
            "D000C2_IY42": "0x00",
            "D000C4_IY44": "0x00",
            "D000CA_IY4A": "0x21",
            "D00587": "0x0F",
            "D00588": "0x00",
            "D00589": "0x00",
            "D0058B": "0xCB",
            "D0058C": "0x00",
            "D0058E": "0x00",
            "D00595": "0x00",
            "D00596": "0x00",
            "D0059A": "0x00",
            "EDIT_TOKEN_D1A8CC": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A85A",
              "value": "0x02FDC2"
            },
            {
              "addr": "0xD1A85D",
              "value": "0x02FCC6"
            },
            {
              "addr": "0xD1A860",
              "value": "0x08C366"
            },
            {
              "addr": "0xD1A863",
              "value": "0x0019B5"
            },
            {
              "addr": "0xD1A866",
              "value": "0xFFFFFF"
            }
          ],
          "editLine": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02590": "0xD3FE81",
            "D00595": 0,
            "D00596": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 140
            },
            "vramCurrent": 8622
          },
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          },
          "vram": 8622,
          "phase6": {
            "steps": 47298,
            "termination": "halt",
            "lastPc": 6581,
            "vram": 8482,
            "vatSnapshotCaptured": true,
            "naturalD0301BOwner": {
              "entry": 283838,
              "steps": 39171,
              "termination": "stopped_before_target",
              "lastPc": 646880,
              "beforeD0301B": 0,
              "afterD0301B": 5940570
            }
          },
          "lastKey": null,
          "pageErrors": []
        },
        "flagCaller058A10": {
          "label": "flagCaller058A10",
          "block": 5278,
          "seqIndex": 5277,
          "pc": "0x058A10",
          "prevPc": "0x058A0C",
          "status": "Coldboot complete. OS event loop is ready.",
          "cpu": {
            "pc": "0x058A10",
            "currentBlockPc": "0x058A10",
            "sp": "0xD1A854",
            "af": "0x0942",
            "bc": "0x000900",
            "de": "0xD2003E",
            "hl": "0x0585E9",
            "ix": "0xD1A860",
            "iy": "0xD00080",
            "f": "0x42",
            "halted": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D010EF": "0xD2A83E",
            "D010FE": "0xD1A8CC",
            "D010F4": "0x1F",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D0301B": "0x5AA55A",
            "D000C2_IY42": "0x00",
            "D000C4_IY44": "0x00",
            "D000CA_IY4A": "0x21",
            "D00587": "0x00",
            "D00588": "0x00",
            "D00589": "0x00",
            "D0058B": "0xC6",
            "D0058C": "0x09",
            "D0058E": "0x00",
            "D00595": "0x00",
            "D00596": "0x00",
            "D0059A": "0x00",
            "EDIT_TOKEN_D1A8CC": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A854",
              "value": "0x08C73D"
            },
            {
              "addr": "0xD1A857",
              "value": "0x000009"
            },
            {
              "addr": "0xD1A85A",
              "value": "0x09F7AA"
            },
            {
              "addr": "0xD1A85D",
              "value": "0x08C53A"
            },
            {
              "addr": "0xD1A860",
              "value": "0x0009A3"
            }
          ],
          "editLine": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02590": "0xD3FE81",
            "D00595": 0,
            "D00596": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 36
            },
            "vramCurrent": 8518
          },
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          },
          "vram": 8518,
          "phase6": {
            "steps": 47298,
            "termination": "halt",
            "lastPc": 6581,
            "vram": 8482,
            "vatSnapshotCaptured": true,
            "naturalD0301BOwner": {
              "entry": 283838,
              "steps": 39171,
              "termination": "stopped_before_target",
              "lastPc": 646880,
              "beforeD0301B": 0,
              "afterD0301B": 5940570
            }
          },
          "lastKey": null,
          "pageErrors": []
        },
        "flagOwner058212": {
          "label": "flagOwner058212",
          "block": 5279,
          "seqIndex": 5278,
          "pc": "0x058212",
          "prevPc": "0x058A10",
          "status": "Coldboot complete. OS event loop is ready.",
          "cpu": {
            "pc": "0x058212",
            "currentBlockPc": "0x058212",
            "sp": "0xD1A851",
            "af": "0x0942",
            "bc": "0x000900",
            "de": "0xD2003E",
            "hl": "0x0585E9",
            "ix": "0xD1A860",
            "iy": "0xD00080",
            "f": "0x42",
            "halted": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D010EF": "0xD2A83E",
            "D010FE": "0xD1A8CC",
            "D010F4": "0x1F",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D0301B": "0x5AA55A",
            "D000C2_IY42": "0x00",
            "D000C4_IY44": "0x00",
            "D000CA_IY4A": "0x21",
            "D00587": "0x00",
            "D00588": "0x00",
            "D00589": "0x00",
            "D0058B": "0xC6",
            "D0058C": "0x09",
            "D0058E": "0x00",
            "D00595": "0x00",
            "D00596": "0x00",
            "D0059A": "0x00",
            "EDIT_TOKEN_D1A8CC": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A851",
              "value": "0x058A14"
            },
            {
              "addr": "0xD1A854",
              "value": "0x08C73D"
            },
            {
              "addr": "0xD1A857",
              "value": "0x000009"
            },
            {
              "addr": "0xD1A85A",
              "value": "0x09F7AA"
            },
            {
              "addr": "0xD1A85D",
              "value": "0x08C53A"
            }
          ],
          "editLine": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02590": "0xD3FE81",
            "D00595": 0,
            "D00596": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 36
            },
            "vramCurrent": 8518
          },
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          },
          "vram": 8518,
          "phase6": {
            "steps": 47298,
            "termination": "halt",
            "lastPc": 6581,
            "vram": 8482,
            "vatSnapshotCaptured": true,
            "naturalD0301BOwner": {
              "entry": 283838,
              "steps": 39171,
              "termination": "stopped_before_target",
              "lastPc": 646880,
              "beforeD0301B": 0,
              "afterD0301B": 5940570
            }
          },
          "lastKey": null,
          "pageErrors": []
        },
        "flagBranch058216": {
          "label": "flagBranch058216",
          "block": 5281,
          "seqIndex": 5280,
          "pc": "0x058216",
          "prevPc": "0x0800B8",
          "status": "Coldboot complete. OS event loop is ready.",
          "cpu": {
            "pc": "0x058216",
            "currentBlockPc": "0x058216",
            "sp": "0xD1A851",
            "af": "0x0954",
            "bc": "0x000900",
            "de": "0xD2003E",
            "hl": "0x0585E9",
            "ix": "0xD1A860",
            "iy": "0xD00080",
            "f": "0x54",
            "halted": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D010EF": "0xD2A83E",
            "D010FE": "0xD1A8CC",
            "D010F4": "0x1F",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D0301B": "0x5AA55A",
            "D000C2_IY42": "0x00",
            "D000C4_IY44": "0x00",
            "D000CA_IY4A": "0x21",
            "D00587": "0x00",
            "D00588": "0x00",
            "D00589": "0x00",
            "D0058B": "0xC6",
            "D0058C": "0x09",
            "D0058E": "0x00",
            "D00595": "0x00",
            "D00596": "0x00",
            "D0059A": "0x00",
            "EDIT_TOKEN_D1A8CC": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A851",
              "value": "0x058A14"
            },
            {
              "addr": "0xD1A854",
              "value": "0x08C73D"
            },
            {
              "addr": "0xD1A857",
              "value": "0x000009"
            },
            {
              "addr": "0xD1A85A",
              "value": "0x09F7AA"
            },
            {
              "addr": "0xD1A85D",
              "value": "0x08C53A"
            }
          ],
          "editLine": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02590": "0xD3FE81",
            "D00595": 0,
            "D00596": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 36
            },
            "vramCurrent": 8518
          },
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          },
          "vram": 8518,
          "phase6": {
            "steps": 47298,
            "termination": "halt",
            "lastPc": 6581,
            "vram": 8482,
            "vatSnapshotCaptured": true,
            "naturalD0301BOwner": {
              "entry": 283838,
              "steps": 39171,
              "termination": "stopped_before_target",
              "lastPc": 646880,
              "beforeD0301B": 0,
              "afterD0301B": 5940570
            }
          },
          "lastKey": null,
          "pageErrors": []
        },
        "flagCompare05E3E3": {
          "label": "flagCompare05E3E3",
          "block": 5283,
          "seqIndex": 5282,
          "pc": "0x05E3E3",
          "prevPc": "0x05821D",
          "status": "Coldboot complete. OS event loop is ready.",
          "cpu": {
            "pc": "0x05E3E3",
            "currentBlockPc": "0x05E3E3",
            "sp": "0xD1A84E",
            "af": "0x0954",
            "bc": "0x000900",
            "de": "0xD2003E",
            "hl": "0x0585E9",
            "ix": "0xD1A860",
            "iy": "0xD00080",
            "f": "0x54",
            "halted": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D010EF": "0xD2A83E",
            "D010FE": "0xD1A8CC",
            "D010F4": "0x1F",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D0301B": "0x5AA55A",
            "D000C2_IY42": "0x00",
            "D000C4_IY44": "0x00",
            "D000CA_IY4A": "0x21",
            "D00587": "0x00",
            "D00588": "0x00",
            "D00589": "0x00",
            "D0058B": "0xC6",
            "D0058C": "0x09",
            "D0058E": "0x00",
            "D00595": "0x00",
            "D00596": "0x00",
            "D0059A": "0x00",
            "EDIT_TOKEN_D1A8CC": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A84E",
              "value": "0x058221"
            },
            {
              "addr": "0xD1A851",
              "value": "0x058A14"
            },
            {
              "addr": "0xD1A854",
              "value": "0x08C73D"
            },
            {
              "addr": "0xD1A857",
              "value": "0x000009"
            },
            {
              "addr": "0xD1A85A",
              "value": "0x09F7AA"
            }
          ],
          "editLine": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02590": "0xD3FE81",
            "D00595": 0,
            "D00596": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 36
            },
            "vramCurrent": 8518
          },
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          },
          "vram": 8518,
          "phase6": {
            "steps": 47298,
            "termination": "halt",
            "lastPc": 6581,
            "vram": 8482,
            "vatSnapshotCaptured": true,
            "naturalD0301BOwner": {
              "entry": 283838,
              "steps": 39171,
              "termination": "stopped_before_target",
              "lastPc": 646880,
              "beforeD0301B": 0,
              "afterD0301B": 5940570
            }
          },
          "lastKey": null,
          "pageErrors": []
        },
        "flagCompareD0243D05E3F5": {
          "label": "flagCompareD0243D05E3F5",
          "block": 5284,
          "seqIndex": 5283,
          "pc": "0x05E3F5",
          "prevPc": "0x05E3E3",
          "status": "Coldboot complete. OS event loop is ready.",
          "cpu": {
            "pc": "0x05E3F5",
            "currentBlockPc": "0x05E3F5",
            "sp": "0xD1A84B",
            "af": "0x0954",
            "bc": "0x000900",
            "de": "0xD2003E",
            "hl": "0x0585E9",
            "ix": "0xD1A860",
            "iy": "0xD00080",
            "f": "0x54",
            "halted": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D010EF": "0xD2A83E",
            "D010FE": "0xD1A8CC",
            "D010F4": "0x1F",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D0301B": "0x5AA55A",
            "D000C2_IY42": "0x00",
            "D000C4_IY44": "0x00",
            "D000CA_IY4A": "0x21",
            "D00587": "0x00",
            "D00588": "0x00",
            "D00589": "0x00",
            "D0058B": "0xC6",
            "D0058C": "0x09",
            "D0058E": "0x00",
            "D00595": "0x00",
            "D00596": "0x00",
            "D0059A": "0x00",
            "EDIT_TOKEN_D1A8CC": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A84B",
              "value": "0x05E3E7"
            },
            {
              "addr": "0xD1A84E",
              "value": "0x058221"
            },
            {
              "addr": "0xD1A851",
              "value": "0x058A14"
            },
            {
              "addr": "0xD1A854",
              "value": "0x08C73D"
            },
            {
              "addr": "0xD1A857",
              "value": "0x000009"
            }
          ],
          "editLine": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02590": "0xD3FE81",
            "D00595": 0,
            "D00596": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 36
            },
            "vramCurrent": 8518
          },
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          },
          "vram": 8518,
          "phase6": {
            "steps": 47298,
            "termination": "halt",
            "lastPc": 6581,
            "vram": 8482,
            "vatSnapshotCaptured": true,
            "naturalD0301BOwner": {
              "entry": 283838,
              "steps": 39171,
              "termination": "stopped_before_target",
              "lastPc": 646880,
              "beforeD0301B": 0,
              "afterD0301B": 5940570
            }
          },
          "lastKey": null,
          "pageErrors": []
        },
        "flagCompareReturn05E3E7": {
          "label": "flagCompareReturn05E3E7",
          "block": 5286,
          "seqIndex": 5285,
          "pc": "0x05E3E7",
          "prevPc": "0x04C973",
          "status": "Coldboot complete. OS event loop is ready.",
          "cpu": {
            "pc": "0x05E3E7",
            "currentBlockPc": "0x05E3E7",
            "sp": "0xD1A84E",
            "af": "0x094A",
            "bc": "0x000900",
            "de": "0xD2A83E",
            "hl": "0xD2A83E",
            "ix": "0xD1A860",
            "iy": "0xD00080",
            "f": "0x4A",
            "halted": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D010EF": "0xD2A83E",
            "D010FE": "0xD1A8CC",
            "D010F4": "0x1F",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D0301B": "0x5AA55A",
            "D000C2_IY42": "0x00",
            "D000C4_IY44": "0x00",
            "D000CA_IY4A": "0x21",
            "D00587": "0x00",
            "D00588": "0x00",
            "D00589": "0x00",
            "D0058B": "0xC6",
            "D0058C": "0x09",
            "D0058E": "0x00",
            "D00595": "0x00",
            "D00596": "0x00",
            "D0059A": "0x00",
            "EDIT_TOKEN_D1A8CC": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A84E",
              "value": "0x058221"
            },
            {
              "addr": "0xD1A851",
              "value": "0x058A14"
            },
            {
              "addr": "0xD1A854",
              "value": "0x08C73D"
            },
            {
              "addr": "0xD1A857",
              "value": "0x000009"
            },
            {
              "addr": "0xD1A85A",
              "value": "0x09F7AA"
            }
          ],
          "editLine": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02590": "0xD3FE81",
            "D00595": 0,
            "D00596": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 36
            },
            "vramCurrent": 8518
          },
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          },
          "vram": 8518,
          "phase6": {
            "steps": 47298,
            "termination": "halt",
            "lastPc": 6581,
            "vram": 8482,
            "vatSnapshotCaptured": true,
            "naturalD0301BOwner": {
              "entry": 283838,
              "steps": 39171,
              "termination": "stopped_before_target",
              "lastPc": 646880,
              "beforeD0301B": 0,
              "afterD0301B": 5940570
            }
          },
          "lastKey": null,
          "pageErrors": []
        },
        "flagCompareD0243A05E3E8": {
          "label": "flagCompareD0243A05E3E8",
          "block": 5287,
          "seqIndex": 5286,
          "pc": "0x05E3E8",
          "prevPc": "0x05E3E7",
          "status": "Coldboot complete. OS event loop is ready.",
          "cpu": {
            "pc": "0x05E3E8",
            "currentBlockPc": "0x05E3E8",
            "sp": "0xD1A84E",
            "af": "0x094A",
            "bc": "0x000900",
            "de": "0xD2A83E",
            "hl": "0xD2A83E",
            "ix": "0xD1A860",
            "iy": "0xD00080",
            "f": "0x4A",
            "halted": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D010EF": "0xD2A83E",
            "D010FE": "0xD1A8CC",
            "D010F4": "0x1F",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D0301B": "0x5AA55A",
            "D000C2_IY42": "0x00",
            "D000C4_IY44": "0x00",
            "D000CA_IY4A": "0x21",
            "D00587": "0x00",
            "D00588": "0x00",
            "D00589": "0x00",
            "D0058B": "0xC6",
            "D0058C": "0x09",
            "D0058E": "0x00",
            "D00595": "0x00",
            "D00596": "0x00",
            "D0059A": "0x00",
            "EDIT_TOKEN_D1A8CC": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A84E",
              "value": "0x058221"
            },
            {
              "addr": "0xD1A851",
              "value": "0x058A14"
            },
            {
              "addr": "0xD1A854",
              "value": "0x08C73D"
            },
            {
              "addr": "0xD1A857",
              "value": "0x000009"
            },
            {
              "addr": "0xD1A85A",
              "value": "0x09F7AA"
            }
          ],
          "editLine": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02590": "0xD3FE81",
            "D00595": 0,
            "D00596": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 36
            },
            "vramCurrent": 8518
          },
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          },
          "vram": 8518,
          "phase6": {
            "steps": 47298,
            "termination": "halt",
            "lastPc": 6581,
            "vram": 8482,
            "vatSnapshotCaptured": true,
            "naturalD0301BOwner": {
              "entry": 283838,
              "steps": 39171,
              "termination": "stopped_before_target",
              "lastPc": 646880,
              "beforeD0301B": 0,
              "afterD0301B": 5940570
            }
          },
          "lastKey": null,
          "pageErrors": []
        },
        "flagCompareReturn058221": {
          "label": "flagCompareReturn058221",
          "block": 5289,
          "seqIndex": 5288,
          "pc": "0x058221",
          "prevPc": "0x04C973",
          "status": "Coldboot complete. OS event loop is ready.",
          "cpu": {
            "pc": "0x058221",
            "currentBlockPc": "0x058221",
            "sp": "0xD1A851",
            "af": "0x094A",
            "bc": "0x000900",
            "de": "0xD1A8CC",
            "hl": "0xD1A8CC",
            "ix": "0xD1A860",
            "iy": "0xD00080",
            "f": "0x4A",
            "halted": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D010EF": "0xD2A83E",
            "D010FE": "0xD1A8CC",
            "D010F4": "0x1F",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D0301B": "0x5AA55A",
            "D000C2_IY42": "0x00",
            "D000C4_IY44": "0x00",
            "D000CA_IY4A": "0x21",
            "D00587": "0x00",
            "D00588": "0x00",
            "D00589": "0x00",
            "D0058B": "0xC6",
            "D0058C": "0x09",
            "D0058E": "0x00",
            "D00595": "0x00",
            "D00596": "0x00",
            "D0059A": "0x00",
            "EDIT_TOKEN_D1A8CC": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A851",
              "value": "0x058A14"
            },
            {
              "addr": "0xD1A854",
              "value": "0x08C73D"
            },
            {
              "addr": "0xD1A857",
              "value": "0x000009"
            },
            {
              "addr": "0xD1A85A",
              "value": "0x09F7AA"
            },
            {
              "addr": "0xD1A85D",
              "value": "0x08C53A"
            }
          ],
          "editLine": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02590": "0xD3FE81",
            "D00595": 0,
            "D00596": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 36
            },
            "vramCurrent": 8518
          },
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          },
          "vram": 8518,
          "phase6": {
            "steps": 47298,
            "termination": "halt",
            "lastPc": 6581,
            "vram": 8482,
            "vatSnapshotCaptured": true,
            "naturalD0301BOwner": {
              "entry": 283838,
              "steps": 39171,
              "termination": "stopped_before_target",
              "lastPc": 646880,
              "beforeD0301B": 0,
              "afterD0301B": 5940570
            }
          },
          "lastKey": null,
          "pageErrors": []
        },
        "flagReturn058A14": {
          "label": "flagReturn058A14",
          "block": 5290,
          "seqIndex": 5289,
          "pc": "0x058A14",
          "prevPc": "0x058221",
          "status": "Coldboot complete. OS event loop is ready.",
          "cpu": {
            "pc": "0x058A14",
            "currentBlockPc": "0x058A14",
            "sp": "0xD1A854",
            "af": "0x094A",
            "bc": "0x000900",
            "de": "0xD1A8CC",
            "hl": "0xD1A8CC",
            "ix": "0xD1A860",
            "iy": "0xD00080",
            "f": "0x4A",
            "halted": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D010EF": "0xD2A83E",
            "D010FE": "0xD1A8CC",
            "D010F4": "0x1F",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D0301B": "0x5AA55A",
            "D000C2_IY42": "0x00",
            "D000C4_IY44": "0x00",
            "D000CA_IY4A": "0x21",
            "D00587": "0x00",
            "D00588": "0x00",
            "D00589": "0x00",
            "D0058B": "0xC6",
            "D0058C": "0x09",
            "D0058E": "0x00",
            "D00595": "0x00",
            "D00596": "0x00",
            "D0059A": "0x00",
            "EDIT_TOKEN_D1A8CC": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A854",
              "value": "0x08C73D"
            },
            {
              "addr": "0xD1A857",
              "value": "0x000009"
            },
            {
              "addr": "0xD1A85A",
              "value": "0x09F7AA"
            },
            {
              "addr": "0xD1A85D",
              "value": "0x08C53A"
            },
            {
              "addr": "0xD1A860",
              "value": "0x0009A3"
            }
          ],
          "editLine": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02590": "0xD3FE81",
            "D00595": 0,
            "D00596": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 36
            },
            "vramCurrent": 8518
          },
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          },
          "vram": 8518,
          "phase6": {
            "steps": 47298,
            "termination": "halt",
            "lastPc": 6581,
            "vram": 8482,
            "vatSnapshotCaptured": true,
            "naturalD0301BOwner": {
              "entry": 283838,
              "steps": 39171,
              "termination": "stopped_before_target",
              "lastPc": 646880,
              "beforeD0301B": 0,
              "afterD0301B": 5940570
            }
          },
          "lastKey": null,
          "pageErrors": []
        },
        "clearFallthrough058A16": {
          "label": "clearFallthrough058A16",
          "block": 5291,
          "seqIndex": 5290,
          "pc": "0x058A16",
          "prevPc": "0x058A14",
          "status": "Coldboot complete. OS event loop is ready.",
          "cpu": {
            "pc": "0x058A16",
            "currentBlockPc": "0x058A16",
            "sp": "0xD1A854",
            "af": "0x094A",
            "bc": "0x000900",
            "de": "0xD1A8CC",
            "hl": "0xD1A8CC",
            "ix": "0xD1A860",
            "iy": "0xD00080",
            "f": "0x4A",
            "halted": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D010EF": "0xD2A83E",
            "D010FE": "0xD1A8CC",
            "D010F4": "0x1F",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D0301B": "0x5AA55A",
            "D000C2_IY42": "0x00",
            "D000C4_IY44": "0x00",
            "D000CA_IY4A": "0x21",
            "D00587": "0x00",
            "D00588": "0x00",
            "D00589": "0x00",
            "D0058B": "0xC6",
            "D0058C": "0x09",
            "D0058E": "0x00",
            "D00595": "0x00",
            "D00596": "0x00",
            "D0059A": "0x00",
            "EDIT_TOKEN_D1A8CC": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A854",
              "value": "0x08C73D"
            },
            {
              "addr": "0xD1A857",
              "value": "0x000009"
            },
            {
              "addr": "0xD1A85A",
              "value": "0x09F7AA"
            },
            {
              "addr": "0xD1A85D",
              "value": "0x08C53A"
            },
            {
              "addr": "0xD1A860",
              "value": "0x0009A3"
            }
          ],
          "editLine": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02590": "0xD3FE81",
            "D00595": 0,
            "D00596": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 36
            },
            "vramCurrent": 8518
          },
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          },
          "vram": 8518,
          "phase6": {
            "steps": 47298,
            "termination": "halt",
            "lastPc": 6581,
            "vram": 8482,
            "vatSnapshotCaptured": true,
            "naturalD0301BOwner": {
              "entry": 283838,
              "steps": 39171,
              "termination": "stopped_before_target",
              "lastPc": 646880,
              "beforeD0301B": 0,
              "afterD0301B": 5940570
            }
          },
          "lastKey": null,
          "pageErrors": []
        },
        "clearEntry0A223A": {
          "label": "clearEntry0A223A",
          "block": 5292,
          "seqIndex": 5291,
          "pc": "0x0A223A",
          "prevPc": "0x058A16",
          "status": "Coldboot complete. OS event loop is ready.",
          "cpu": {
            "pc": "0x0A223A",
            "currentBlockPc": "0x0A223A",
            "sp": "0xD1A851",
            "af": "0x094A",
            "bc": "0x000900",
            "de": "0xD1A8CC",
            "hl": "0xD1A8CC",
            "ix": "0xD1A860",
            "iy": "0xD00080",
            "f": "0x4A",
            "halted": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D010EF": "0xD2A83E",
            "D010FE": "0xD1A8CC",
            "D010F4": "0x1F",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D0301B": "0x5AA55A",
            "D000C2_IY42": "0x00",
            "D000C4_IY44": "0x00",
            "D000CA_IY4A": "0x21",
            "D00587": "0x00",
            "D00588": "0x00",
            "D00589": "0x00",
            "D0058B": "0xC6",
            "D0058C": "0x09",
            "D0058E": "0x00",
            "D00595": "0x00",
            "D00596": "0x00",
            "D0059A": "0x00",
            "EDIT_TOKEN_D1A8CC": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A851",
              "value": "0x058A1A"
            },
            {
              "addr": "0xD1A854",
              "value": "0x08C73D"
            },
            {
              "addr": "0xD1A857",
              "value": "0x000009"
            },
            {
              "addr": "0xD1A85A",
              "value": "0x09F7AA"
            },
            {
              "addr": "0xD1A85D",
              "value": "0x08C53A"
            }
          ],
          "editLine": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02590": "0xD3FE81",
            "D00595": 0,
            "D00596": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 36
            },
            "vramCurrent": 8518
          },
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          },
          "vram": 8518,
          "phase6": {
            "steps": 47298,
            "termination": "halt",
            "lastPc": 6581,
            "vram": 8482,
            "vatSnapshotCaptured": true,
            "naturalD0301BOwner": {
              "entry": 283838,
              "steps": 39171,
              "termination": "stopped_before_target",
              "lastPc": 646880,
              "beforeD0301B": 0,
              "afterD0301B": 5940570
            }
          },
          "lastKey": null,
          "pageErrors": []
        },
        "clearAnchor0A229D": {
          "label": "clearAnchor0A229D",
          "block": 74324,
          "seqIndex": 16000,
          "pc": "0x0A229D",
          "prevPc": "0x0A2A37",
          "status": "Coldboot complete. OS event loop is ready.",
          "cpu": {
            "pc": "0x0A229D",
            "currentBlockPc": "0x0A229D",
            "sp": "0xD1A851",
            "af": "0x0A0C",
            "bc": "0x000018",
            "de": "0x00013F",
            "hl": "0x000104",
            "ix": "0xD1A860",
            "iy": "0xD00080",
            "f": "0x0C",
            "halted": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D010EF": "0xD2A83E",
            "D010FE": "0xD1A8CC",
            "D010F4": "0x1F",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D0301B": "0x5AA55A",
            "D000C2_IY42": "0x00",
            "D000C4_IY44": "0x00",
            "D000CA_IY4A": "0x21",
            "D00587": "0x00",
            "D00588": "0x00",
            "D00589": "0x00",
            "D0058B": "0xC4",
            "D0058C": "0x09",
            "D0058E": "0x00",
            "D00595": "0x00",
            "D00596": "0x00",
            "D0059A": "0x02",
            "EDIT_TOKEN_D1A8CC": "0x00"
          },
          "stackTop": [
            {
              "addr": "0xD1A851",
              "value": "0x058A1A"
            },
            {
              "addr": "0xD1A854",
              "value": "0x08C73D"
            },
            {
              "addr": "0xD1A857",
              "value": "0x000009"
            },
            {
              "addr": "0xD1A85A",
              "value": "0x09F7AA"
            },
            {
              "addr": "0xD1A85D",
              "value": "0x08C53A"
            }
          ],
          "editLine": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02590": "0xD3FE81",
            "D00595": 0,
            "D00596": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 0
            },
            "vramCurrent": 8482
          },
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 2,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          },
          "vram": 8482,
          "phase6": {
            "steps": 47298,
            "termination": "halt",
            "lastPc": 6581,
            "vram": 8482,
            "vatSnapshotCaptured": true,
            "naturalD0301BOwner": {
              "entry": 283838,
              "steps": 39171,
              "termination": "stopped_before_target",
              "lastPc": 646880,
              "beforeD0301B": 0,
              "afterD0301B": 5940570
            }
          },
          "lastKey": null,
          "pageErrors": []
        }
      },
      "fieldChanges": [
        {
          "block": 1,
          "seqIndex": 0,
          "name": "D008E0",
          "before": "0x000000",
          "after": "0xD1A86C",
          "pc": "0x08C331",
          "prevPc": null
        },
        {
          "block": 1,
          "seqIndex": 0,
          "name": "D00587",
          "before": "0x00",
          "after": "0x0F",
          "pc": "0x08C331",
          "prevPc": null
        },
        {
          "block": 1,
          "seqIndex": 0,
          "name": "D0058C",
          "before": "0x00",
          "after": "0x0F",
          "pc": "0x08C331",
          "prevPc": null
        },
        {
          "block": 1,
          "seqIndex": 0,
          "name": "D0058E",
          "before": "0x00",
          "after": "0x0F",
          "pc": "0x08C331",
          "prevPc": null
        },
        {
          "block": 113,
          "seqIndex": 112,
          "name": "D0058B",
          "before": "0xD3",
          "after": "0xD2",
          "pc": "0x03D058",
          "prevPc": "0x03F9AE"
        },
        {
          "block": 348,
          "seqIndex": 347,
          "name": "D0058B",
          "before": "0xD2",
          "after": "0xD1",
          "pc": "0x03D058",
          "prevPc": "0x03F9AE"
        },
        {
          "block": 469,
          "seqIndex": 468,
          "name": "D0058B",
          "before": "0xD1",
          "after": "0xD0",
          "pc": "0x03D058",
          "prevPc": "0x03F9AE"
        },
        {
          "block": 1068,
          "seqIndex": 1067,
          "name": "D000CA_IY4A",
          "before": "0x20",
          "after": "0x21",
          "pc": "0x05C634",
          "prevPc": "0x08C3A0"
        },
        {
          "block": 1863,
          "seqIndex": 1862,
          "name": "D0058B",
          "before": "0xD0",
          "after": "0xCF",
          "pc": "0x03D058",
          "prevPc": "0x03F9AE"
        },
        {
          "block": 2071,
          "seqIndex": 2070,
          "name": "D0058B",
          "before": "0xCF",
          "after": "0xCE",
          "pc": "0x03D058",
          "prevPc": "0x03F9AE"
        },
        {
          "block": 2270,
          "seqIndex": 2269,
          "name": "D0058B",
          "before": "0xCE",
          "after": "0xCD",
          "pc": "0x03D058",
          "prevPc": "0x03F9AE"
        },
        {
          "block": 2531,
          "seqIndex": 2530,
          "name": "D0058B",
          "before": "0xCD",
          "after": "0xCC",
          "pc": "0x03D058",
          "prevPc": "0x03F9AE"
        },
        {
          "block": 2669,
          "seqIndex": 2668,
          "name": "D0058B",
          "before": "0xCC",
          "after": "0xCB",
          "pc": "0x03D058",
          "prevPc": "0x03F9AE"
        },
        {
          "block": 3248,
          "seqIndex": 3247,
          "name": "D0058C",
          "before": "0x0F",
          "after": "0x00",
          "pc": "0x02FCB3",
          "prevPc": "0x08C359"
        },
        {
          "block": 3248,
          "seqIndex": 3247,
          "name": "D0058E",
          "before": "0x0F",
          "after": "0x00",
          "pc": "0x02FCB3",
          "prevPc": "0x08C359"
        },
        {
          "block": 3844,
          "seqIndex": 3843,
          "name": "D00587",
          "before": "0x0F",
          "after": "0x00",
          "pc": "0x000038",
          "prevPc": "0x03FA09"
        },
        {
          "block": 3955,
          "seqIndex": 3954,
          "name": "D0058B",
          "before": "0xCB",
          "after": "0xCA",
          "pc": "0x03D058",
          "prevPc": "0x03F9AE"
        },
        {
          "block": 4073,
          "seqIndex": 4072,
          "name": "D0058B",
          "before": "0xCA",
          "after": "0xC9",
          "pc": "0x03D058",
          "prevPc": "0x03F9AE"
        },
        {
          "block": 4125,
          "seqIndex": 4124,
          "name": "D0058C",
          "before": "0x00",
          "after": "0x09",
          "pc": "0x08C38A",
          "prevPc": "0x08C366"
        },
        {
          "block": 4922,
          "seqIndex": 4921,
          "name": "D0058B",
          "before": "0xC9",
          "after": "0xC8",
          "pc": "0x03D058",
          "prevPc": "0x03F9AE"
        },
        {
          "block": 5070,
          "seqIndex": 5069,
          "name": "D0058B",
          "before": "0xC8",
          "after": "0xC7",
          "pc": "0x03D058",
          "prevPc": "0x03F9AE"
        },
        {
          "block": 5270,
          "seqIndex": 5269,
          "name": "D0058B",
          "before": "0xC7",
          "after": "0xC6",
          "pc": "0x03D058",
          "prevPc": "0x03F9AE"
        },
        {
          "block": 5294,
          "seqIndex": 5293,
          "name": "D0059A",
          "before": "0x00",
          "after": "0x02",
          "pc": "0x0A223E",
          "prevPc": "0x0A235E"
        },
        {
          "block": 39654,
          "seqIndex": 16000,
          "name": "D0058B",
          "before": "0xC6",
          "after": "0xC5",
          "pc": "0x03D058",
          "prevPc": "0x03F9AE"
        },
        {
          "block": 74316,
          "seqIndex": 16000,
          "name": "D0058B",
          "before": "0xC5",
          "after": "0xC4",
          "pc": "0x03D058",
          "prevPc": "0x03F9AE"
        }
      ]
    }
  },
  "transition": {
    "afterBoot": {
      "label": "transition:afterBoot",
      "block": null,
      "seqIndex": null,
      "pc": null,
      "prevPc": null,
      "status": "Coldboot complete. OS event loop is ready.",
      "cpu": {
        "pc": "0x0019B5",
        "currentBlockPc": "0x0019B5",
        "sp": "0xD1A866",
        "af": "0x1054",
        "bc": "0x000000",
        "de": "0xD2A815",
        "hl": "0xD1A8A3",
        "ix": "0xD1A860",
        "iy": "0xD00080",
        "f": "0x54",
        "halted": true
      },
      "fields": {
        "D007CA": "0x0585E9",
        "D008E0": "0x000000",
        "D010EF": "0xD2A83E",
        "D010FE": "0xD1A8CC",
        "D010F4": "0x1F",
        "D02317": "0xD2A83E",
        "D0231A": "0xD2A83E",
        "D0231D": "0xD2A83D",
        "D02437": "0xD1A8CC",
        "D0243A": "0xD1A8CC",
        "D0243D": "0xD2A83E",
        "D02440": "0xD2A83E",
        "D02505": "0x0A",
        "D02590": "0xD3FE81",
        "D0259D": "0xD3FECD",
        "D02A29": "0x0000",
        "D0301B": "0x5AA55A",
        "D000C2_IY42": "0x00",
        "D000C4_IY44": "0x00",
        "D000CA_IY4A": "0x20",
        "D00587": "0x00",
        "D00588": "0x00",
        "D00589": "0x00",
        "D0058B": "0xD3",
        "D0058C": "0x00",
        "D0058E": "0x00",
        "D00595": "0x00",
        "D00596": "0x00",
        "D0059A": "0x00",
        "EDIT_TOKEN_D1A8CC": "0x00"
      },
      "stackTop": [
        {
          "addr": "0xD1A866",
          "value": "0xFFFFFF"
        },
        {
          "addr": "0xD1A869",
          "value": "0xFFFFFF"
        },
        {
          "addr": "0xD1A86C",
          "value": "0xFFFFFF"
        },
        {
          "addr": "0xD1A86F",
          "value": "0xFFFFFF"
        },
        {
          "addr": "0xD1A872",
          "value": "0xFFFFFF"
        }
      ],
      "editLine": {
        "D007CA": "0x0585E9",
        "D008E0": "0x000000",
        "D0243A": "0xD1A8CC",
        "D0243D": "0xD2A83E",
        "D02590": "0xD3FE81",
        "D00595": 0,
        "D00596": 0,
        "buffer": [
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0
        ],
        "entryLineRoi": {
          "x": 0,
          "y": 34,
          "width": 128,
          "height": 26,
          "nonWhite": 0
        },
        "vramCurrent": 8482
      },
      "persistence": {
        "tokenGate": 0,
        "tokenA": 0,
        "tokenB": 0,
        "tuple": {
          "D02A29": 0,
          "D02A2B": 0,
          "D02A1B": 0,
          "D0059A": 0,
          "D01150": 0,
          "D0243D": 13805630,
          "D02A40": 13805630,
          "D02A28": 0
        }
      },
      "vram": 8482,
      "phase6": {
        "steps": 47298,
        "termination": "halt",
        "lastPc": 6581,
        "vram": 8482,
        "vatSnapshotCaptured": true,
        "naturalD0301BOwner": {
          "entry": 283838,
          "steps": 39171,
          "termination": "stopped_before_target",
          "lastPc": 646880,
          "beforeD0301B": 0,
          "afterD0301B": 5940570
        }
      },
      "lastKey": null,
      "pageErrors": []
    },
    "afterDigit": {
      "label": "transition Digit3:afterKey",
      "block": null,
      "seqIndex": null,
      "pc": null,
      "prevPc": null,
      "status": "Key: 3 → 7526 steps (post_insert_gate_stop, insert=0x33 @0xd1a8cc, peak 8689px)",
      "cpu": {
        "pc": "0x0013DA",
        "currentBlockPc": "0x0013DA",
        "sp": "0xD1A87E",
        "af": "0xD090",
        "bc": "0x00A005",
        "de": "0xD1A7FC",
        "hl": "0x000000",
        "ix": "0x000000",
        "iy": "0xD00080",
        "f": "0x90",
        "halted": false
      },
      "fields": {
        "D007CA": "0x0585E9",
        "D008E0": "0xD1A86C",
        "D010EF": "0xD2A83E",
        "D010FE": "0xD1A8CC",
        "D010F4": "0x1F",
        "D02317": "0xD2A83E",
        "D0231A": "0xD2A83E",
        "D0231D": "0xD2A83D",
        "D02437": "0xD1A8CC",
        "D0243A": "0xD1A8CD",
        "D0243D": "0xD2A83E",
        "D02440": "0xD2A83E",
        "D02505": "0x0A",
        "D02590": "0xD3FE81",
        "D0259D": "0xD3FECD",
        "D02A29": "0x0000",
        "D0301B": "0x5AA55A",
        "D000C2_IY42": "0x00",
        "D000C4_IY44": "0x00",
        "D000CA_IY4A": "0x21",
        "D00587": "0x00",
        "D00588": "0x22",
        "D00589": "0x22",
        "D0058B": "0x05",
        "D0058C": "0x00",
        "D0058E": "0x00",
        "D00595": "0x00",
        "D00596": "0x01",
        "D0059A": "0x00",
        "EDIT_TOKEN_D1A8CC": "0x33"
      },
      "stackTop": [
        {
          "addr": "0xD1A87E",
          "value": "0x030000"
        },
        {
          "addr": "0xD1A881",
          "value": "0x000000"
        },
        {
          "addr": "0xD1A884",
          "value": "0x000000"
        },
        {
          "addr": "0xD1A887",
          "value": "0x000000"
        },
        {
          "addr": "0xD1A88A",
          "value": "0x000000"
        }
      ],
      "editLine": {
        "D007CA": "0x0585E9",
        "D008E0": "0xD1A86C",
        "D0243A": "0xD1A8CD",
        "D0243D": "0xD2A83E",
        "D02590": "0xD3FE81",
        "D00595": 0,
        "D00596": 1,
        "buffer": [
          51,
          0,
          0,
          0,
          0,
          0,
          0,
          0
        ],
        "entryLineRoi": {
          "x": 0,
          "y": 34,
          "width": 128,
          "height": 26,
          "nonWhite": 207
        },
        "vramCurrent": 8689
      },
      "persistence": {
        "tokenGate": 0,
        "tokenA": 0,
        "tokenB": 0,
        "tuple": {
          "D02A29": 0,
          "D02A2B": 0,
          "D02A1B": 0,
          "D0059A": 0,
          "D01150": 0,
          "D0243D": 13805630,
          "D02A40": 13805630,
          "D02A28": 0
        }
      },
      "vram": 8689,
      "phase6": {
        "steps": 47298,
        "termination": "halt",
        "lastPc": 6581,
        "vram": 8482,
        "vatSnapshotCaptured": true,
        "naturalD0301BOwner": {
          "entry": 283838,
          "steps": 39171,
          "termination": "stopped_before_target",
          "lastPc": 646880,
          "beforeD0301B": 0,
          "afterD0301B": 5940570
        }
      },
      "lastKey": {
        "code": "Digit3",
        "label": "3",
        "expectedInsertByte": 51,
        "controlPreStopPc": null,
        "controlPreStopLabel": null,
        "cursorBefore": 13740236,
        "insertBlock": 2908,
        "postInsertGateBlock": 7504,
        "stoppedAtPostInsertGate": true,
        "D000C2Bit7Restored": true,
        "controlStopBlock": null,
        "controlStopPc": null,
        "controlStopCursorBefore": null,
        "controlStopCursorAfter": null,
        "controlStopCursorRestored": false,
        "uiClearApplied": false,
        "uiClearResult": null,
        "stoppedBeforeControlClear": false,
        "contextVectorRestoreEnabled": false,
        "contextVectorRestored": false,
        "contextVectorRestoreBlock": null,
        "contextVectorRestorePc": null,
        "contextVectorD007CABefore": null,
        "contextVectorD007CAAfter": null,
        "steps": 7526,
        "termination": "post_insert_gate_stop",
        "wipes": 0,
        "D0243A": 13740237,
        "D0243D": 13805630,
        "D007CA": 361961,
        "D008E0": 13740140,
        "D02590": 13893249,
        "D000C2": 0,
        "buffer": [
          51,
          0,
          0,
          0,
          0,
          0,
          0,
          0
        ],
        "vramPeak": 8689,
        "vramCurrent": 8689
      },
      "pageErrors": []
    },
    "afterClear": {
      "label": "transition Escape/CLEAR:afterKey",
      "block": null,
      "seqIndex": null,
      "pc": null,
      "prevPc": null,
      "status": "Key: CLEAR → 350000 steps (max_steps, peak 8689px)",
      "cpu": {
        "pc": "0x000BFE",
        "currentBlockPc": "0x000BFE",
        "sp": "0xD1A3BC",
        "af": "0x1500",
        "bc": "0xFFFFFF",
        "de": "0x000014",
        "hl": "0x000015",
        "ix": "0xD1A3E9",
        "iy": "0xD00080",
        "f": "0x00",
        "halted": false
      },
      "fields": {
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D010EF": "0x000000",
        "D010FE": "0x000000",
        "D010F4": "0x00",
        "D02317": "0x000000",
        "D0231A": "0x000000",
        "D0231D": "0x000000",
        "D02437": "0x000000",
        "D0243A": "0x000000",
        "D0243D": "0x000000",
        "D02440": "0x000000",
        "D02505": "0x00",
        "D02590": "0x000000",
        "D0259D": "0x000000",
        "D02A29": "0x0000",
        "D0301B": "0x000000",
        "D000C2_IY42": "0x00",
        "D000C4_IY44": "0x00",
        "D000CA_IY4A": "0x00",
        "D00587": "0x00",
        "D00588": "0x00",
        "D00589": "0x00",
        "D0058B": "0x00",
        "D0058C": "0x00",
        "D0058E": "0x00",
        "D00595": "0x04",
        "D00596": "0x13",
        "D0059A": "0x00",
        "EDIT_TOKEN_D1A8CC": "0x33"
      },
      "stackTop": [
        {
          "addr": "0xD1A3BC",
          "value": "0x000015"
        },
        {
          "addr": "0xD1A3BF",
          "value": "0x000000"
        },
        {
          "addr": "0xD1A3C2",
          "value": "0x000026"
        },
        {
          "addr": "0xD1A3C5",
          "value": "0x00EADA"
        },
        {
          "addr": "0xD1A3C8",
          "value": "0x8FFCF0"
        }
      ],
      "editLine": {
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D0243D": "0x000000",
        "D02590": "0x000000",
        "D00595": 4,
        "D00596": 19,
        "buffer": [
          51,
          0,
          0,
          0,
          0,
          0,
          0,
          0
        ],
        "entryLineRoi": {
          "x": 0,
          "y": 34,
          "width": 128,
          "height": 26,
          "nonWhite": 0
        },
        "vramCurrent": 3039
      },
      "persistence": {
        "tokenGate": 0,
        "tokenA": 0,
        "tokenB": 0,
        "tuple": {
          "D02A29": 0,
          "D02A2B": 0,
          "D02A1B": 0,
          "D0059A": 0,
          "D01150": 0,
          "D0243D": 0,
          "D02A40": 0,
          "D02A28": 0
        }
      },
      "vram": 3039,
      "phase6": {
        "steps": 47298,
        "termination": "halt",
        "lastPc": 6581,
        "vram": 8482,
        "vatSnapshotCaptured": true,
        "naturalD0301BOwner": {
          "entry": 283838,
          "steps": 39171,
          "termination": "stopped_before_target",
          "lastPc": 646880,
          "beforeD0301B": 0,
          "afterD0301B": 5940570
        }
      },
      "lastKey": {
        "code": "Escape",
        "label": "CLEAR",
        "expectedInsertByte": null,
        "controlPreStopPc": 664221,
        "controlPreStopLabel": "clear-eol-bc-zero-owner",
        "cursorBefore": null,
        "insertBlock": null,
        "postInsertGateBlock": null,
        "stoppedAtPostInsertGate": false,
        "D000C2Bit7Restored": false,
        "controlStopBlock": null,
        "controlStopPc": null,
        "controlStopCursorBefore": null,
        "controlStopCursorAfter": null,
        "controlStopCursorRestored": false,
        "uiClearApplied": false,
        "uiClearResult": null,
        "stoppedBeforeControlClear": false,
        "contextVectorRestoreEnabled": false,
        "contextVectorRestored": false,
        "contextVectorRestoreBlock": null,
        "contextVectorRestorePc": null,
        "contextVectorD007CABefore": null,
        "contextVectorD007CAAfter": null,
        "steps": 350000,
        "termination": "max_steps",
        "wipes": 3,
        "D0243A": 0,
        "D0243D": 0,
        "D007CA": 0,
        "D008E0": 0,
        "D02590": 0,
        "D000C2": 0,
        "buffer": [
          51,
          0,
          0,
          0,
          0,
          0,
          0,
          0
        ],
        "vramPeak": 8689,
        "vramCurrent": 3039
      },
      "pageErrors": []
    },
    "record": {
      "label": "transition Digit3->Escape/CLEAR",
      "blockCount": 349976,
      "sequenceLength": 16000,
      "sequenceLimitReached": true,
      "start": {
        "label": "start",
        "block": null,
        "seqIndex": null,
        "pc": null,
        "prevPc": null,
        "status": "Key: 3 → 7526 steps (post_insert_gate_stop, insert=0x33 @0xd1a8cc, peak 8689px)",
        "cpu": {
          "pc": "0x0013DA",
          "currentBlockPc": "0x0013DA",
          "sp": "0xD1A87E",
          "af": "0xD090",
          "bc": "0x00A005",
          "de": "0xD1A7FC",
          "hl": "0x000000",
          "ix": "0x000000",
          "iy": "0xD00080",
          "f": "0x90",
          "halted": false
        },
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A86C",
          "D010EF": "0xD2A83E",
          "D010FE": "0xD1A8CC",
          "D010F4": "0x1F",
          "D02317": "0xD2A83E",
          "D0231A": "0xD2A83E",
          "D0231D": "0xD2A83D",
          "D02437": "0xD1A8CC",
          "D0243A": "0xD1A8CD",
          "D0243D": "0xD2A83E",
          "D02440": "0xD2A83E",
          "D02505": "0x0A",
          "D02590": "0xD3FE81",
          "D0259D": "0xD3FECD",
          "D02A29": "0x0000",
          "D0301B": "0x5AA55A",
          "D000C2_IY42": "0x00",
          "D000C4_IY44": "0x00",
          "D000CA_IY4A": "0x21",
          "D00587": "0x00",
          "D00588": "0x22",
          "D00589": "0x22",
          "D0058B": "0x05",
          "D0058C": "0x00",
          "D0058E": "0x00",
          "D00595": "0x00",
          "D00596": "0x01",
          "D0059A": "0x00",
          "EDIT_TOKEN_D1A8CC": "0x33"
        },
        "stackTop": [
          {
            "addr": "0xD1A87E",
            "value": "0x030000"
          },
          {
            "addr": "0xD1A881",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A884",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A887",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A88A",
            "value": "0x000000"
          }
        ],
        "editLine": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A86C",
          "D0243A": "0xD1A8CD",
          "D0243D": "0xD2A83E",
          "D02590": "0xD3FE81",
          "D00595": 0,
          "D00596": 1,
          "buffer": [
            51,
            0,
            0,
            0,
            0,
            0,
            0,
            0
          ],
          "entryLineRoi": {
            "x": 0,
            "y": 34,
            "width": 128,
            "height": 26,
            "nonWhite": 207
          },
          "vramCurrent": 8689
        },
        "persistence": {
          "tokenGate": 0,
          "tokenA": 0,
          "tokenB": 0,
          "tuple": {
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 0,
            "D0059A": 0,
            "D01150": 0,
            "D0243D": 13805630,
            "D02A40": 13805630,
            "D02A28": 0
          }
        },
        "vram": 8689,
        "phase6": {
          "steps": 47298,
          "termination": "halt",
          "lastPc": 6581,
          "vram": 8482,
          "vatSnapshotCaptured": true,
          "naturalD0301BOwner": {
            "entry": 283838,
            "steps": 39171,
            "termination": "stopped_before_target",
            "lastPc": 646880,
            "beforeD0301B": 0,
            "afterD0301B": 5940570
          }
        },
        "lastKey": {
          "code": "Digit3",
          "label": "3",
          "expectedInsertByte": 51,
          "controlPreStopPc": null,
          "controlPreStopLabel": null,
          "cursorBefore": 13740236,
          "insertBlock": 2908,
          "postInsertGateBlock": 7504,
          "stoppedAtPostInsertGate": true,
          "D000C2Bit7Restored": true,
          "controlStopBlock": null,
          "controlStopPc": null,
          "controlStopCursorBefore": null,
          "controlStopCursorAfter": null,
          "controlStopCursorRestored": false,
          "uiClearApplied": false,
          "uiClearResult": null,
          "stoppedBeforeControlClear": false,
          "contextVectorRestoreEnabled": false,
          "contextVectorRestored": false,
          "contextVectorRestoreBlock": null,
          "contextVectorRestorePc": null,
          "contextVectorD007CABefore": null,
          "contextVectorD007CAAfter": null,
          "steps": 7526,
          "termination": "post_insert_gate_stop",
          "wipes": 0,
          "D0243A": 13740237,
          "D0243D": 13805630,
          "D007CA": 361961,
          "D008E0": 13740140,
          "D02590": 13893249,
          "D000C2": 0,
          "buffer": [
            51,
            0,
            0,
            0,
            0,
            0,
            0,
            0
          ],
          "vramPeak": 8689,
          "vramCurrent": 8689
        },
        "pageErrors": []
      },
      "end": {
        "label": "end",
        "block": null,
        "seqIndex": null,
        "pc": null,
        "prevPc": null,
        "status": "Key: CLEAR → 350000 steps (max_steps, peak 8689px)",
        "cpu": {
          "pc": "0x000BFE",
          "currentBlockPc": "0x000BFE",
          "sp": "0xD1A3BC",
          "af": "0x1500",
          "bc": "0xFFFFFF",
          "de": "0x000014",
          "hl": "0x000015",
          "ix": "0xD1A3E9",
          "iy": "0xD00080",
          "f": "0x00",
          "halted": false
        },
        "fields": {
          "D007CA": "0x000000",
          "D008E0": "0x000000",
          "D010EF": "0x000000",
          "D010FE": "0x000000",
          "D010F4": "0x00",
          "D02317": "0x000000",
          "D0231A": "0x000000",
          "D0231D": "0x000000",
          "D02437": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02440": "0x000000",
          "D02505": "0x00",
          "D02590": "0x000000",
          "D0259D": "0x000000",
          "D02A29": "0x0000",
          "D0301B": "0x000000",
          "D000C2_IY42": "0x00",
          "D000C4_IY44": "0x00",
          "D000CA_IY4A": "0x00",
          "D00587": "0x00",
          "D00588": "0x00",
          "D00589": "0x00",
          "D0058B": "0x00",
          "D0058C": "0x00",
          "D0058E": "0x00",
          "D00595": "0x04",
          "D00596": "0x13",
          "D0059A": "0x00",
          "EDIT_TOKEN_D1A8CC": "0x33"
        },
        "stackTop": [
          {
            "addr": "0xD1A3BC",
            "value": "0x000015"
          },
          {
            "addr": "0xD1A3BF",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A3C2",
            "value": "0x000026"
          },
          {
            "addr": "0xD1A3C5",
            "value": "0x00EADA"
          },
          {
            "addr": "0xD1A3C8",
            "value": "0x8FFCF0"
          }
        ],
        "editLine": {
          "D007CA": "0x000000",
          "D008E0": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D00595": 4,
          "D00596": 19,
          "buffer": [
            51,
            0,
            0,
            0,
            0,
            0,
            0,
            0
          ],
          "entryLineRoi": {
            "x": 0,
            "y": 34,
            "width": 128,
            "height": 26,
            "nonWhite": 0
          },
          "vramCurrent": 3039
        },
        "persistence": {
          "tokenGate": 0,
          "tokenA": 0,
          "tokenB": 0,
          "tuple": {
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 0,
            "D0059A": 0,
            "D01150": 0,
            "D0243D": 0,
            "D02A40": 0,
            "D02A28": 0
          }
        },
        "vram": 3039,
        "phase6": {
          "steps": 47298,
          "termination": "halt",
          "lastPc": 6581,
          "vram": 8482,
          "vatSnapshotCaptured": true,
          "naturalD0301BOwner": {
            "entry": 283838,
            "steps": 39171,
            "termination": "stopped_before_target",
            "lastPc": 646880,
            "beforeD0301B": 0,
            "afterD0301B": 5940570
          }
        },
        "lastKey": {
          "code": "Escape",
          "label": "CLEAR",
          "expectedInsertByte": null,
          "controlPreStopPc": 664221,
          "controlPreStopLabel": "clear-eol-bc-zero-owner",
          "cursorBefore": null,
          "insertBlock": null,
          "postInsertGateBlock": null,
          "stoppedAtPostInsertGate": false,
          "D000C2Bit7Restored": false,
          "controlStopBlock": null,
          "controlStopPc": null,
          "controlStopCursorBefore": null,
          "controlStopCursorAfter": null,
          "controlStopCursorRestored": false,
          "uiClearApplied": false,
          "uiClearResult": null,
          "stoppedBeforeControlClear": false,
          "contextVectorRestoreEnabled": false,
          "contextVectorRestored": false,
          "contextVectorRestoreBlock": null,
          "contextVectorRestorePc": null,
          "contextVectorD007CABefore": null,
          "contextVectorD007CAAfter": null,
          "steps": 350000,
          "termination": "max_steps",
          "wipes": 3,
          "D0243A": 0,
          "D0243D": 0,
          "D007CA": 0,
          "D008E0": 0,
          "D02590": 0,
          "D000C2": 0,
          "buffer": [
            51,
            0,
            0,
            0,
            0,
            0,
            0,
            0
          ],
          "vramPeak": 8689,
          "vramCurrent": 3039
        },
        "pageErrors": []
      },
      "targetCounts": {
        "eventLoop08C331": 2,
        "getCsc03FA09": 2,
        "keyDebounceBranch03F998": 20,
        "keyDebounceCompare03F99A": 20,
        "keyDebounceOr03F9AB": 19,
        "keyDebounceCounter03F9AE": 20,
        "keyDebounceFallthrough03F9B0": 8,
        "keyDebouncePost03F9B8": 7,
        "keyDebounceReturn03D058": 20,
        "insertGate0158DE": 5,
        "insertGateReturn0013DA": 2,
        "flagCaller058A10": 0,
        "flagOwner058212": 0,
        "flagGate0800B8": 1,
        "flagBranch058216": 0,
        "flagCompare05E3E3": 0,
        "flagCompareD0243D05E3F5": 2,
        "flagCompareD0243A05E3E8": 0,
        "flagCompare04C973": 7,
        "flagCompareReturn05E3E7": 0,
        "flagCompareReturn058221": 0,
        "flagReturn058A14": 0,
        "clearFallthrough058A16": 0,
        "clearTaken058A2C": 0,
        "clearEntry0A223A": 0,
        "clearAnchor0A229D": 0,
        "preWipe001879": 3,
        "cleanup0018F8": 3,
        "poll006D64": 20176
      },
      "targetFirst": {
        "eventLoop08C331": {
          "label": "eventLoop08C331",
          "block": 1,
          "seqIndex": 0,
          "pc": "0x08C331",
          "prevPc": null,
          "status": "Key: 3 → 7526 steps (post_insert_gate_stop, insert=0x33 @0xd1a8cc, peak 8689px)",
          "cpu": {
            "pc": "0x08C331",
            "currentBlockPc": "0x08C331",
            "sp": "0xD1A863",
            "af": "0xD040",
            "bc": "0x00A005",
            "de": "0xD1A7FC",
            "hl": "0x000000",
            "ix": "0xD1A860",
            "iy": "0xD00080",
            "f": "0x40",
            "halted": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D010EF": "0xD2A83E",
            "D010FE": "0xD1A8CC",
            "D010F4": "0x1F",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CD",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D0301B": "0x5AA55A",
            "D000C2_IY42": "0x00",
            "D000C4_IY44": "0x00",
            "D000CA_IY4A": "0x21",
            "D00587": "0x0F",
            "D00588": "0x22",
            "D00589": "0x22",
            "D0058B": "0x05",
            "D0058C": "0x0F",
            "D0058E": "0x0F",
            "D00595": "0x00",
            "D00596": "0x01",
            "D0059A": "0x00",
            "EDIT_TOKEN_D1A8CC": "0x33"
          },
          "stackTop": [
            {
              "addr": "0xD1A863",
              "value": "0x0019B5"
            },
            {
              "addr": "0xD1A866",
              "value": "0xFFFFFF"
            },
            {
              "addr": "0xD1A869",
              "value": "0xFFFFFF"
            },
            {
              "addr": "0xD1A86C",
              "value": "0xFFFFFF"
            },
            {
              "addr": "0xD1A86F",
              "value": "0xFFFFFF"
            }
          ],
          "editLine": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0xD1A8CD",
            "D0243D": "0xD2A83E",
            "D02590": "0xD3FE81",
            "D00595": 0,
            "D00596": 1,
            "buffer": [
              51,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 207
            },
            "vramCurrent": 8689
          },
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          },
          "vram": 8689,
          "phase6": {
            "steps": 47298,
            "termination": "halt",
            "lastPc": 6581,
            "vram": 8482,
            "vatSnapshotCaptured": true,
            "naturalD0301BOwner": {
              "entry": 283838,
              "steps": 39171,
              "termination": "stopped_before_target",
              "lastPc": 646880,
              "beforeD0301B": 0,
              "afterD0301B": 5940570
            }
          },
          "lastKey": {
            "code": "Digit3",
            "label": "3",
            "expectedInsertByte": 51,
            "controlPreStopPc": null,
            "controlPreStopLabel": null,
            "cursorBefore": 13740236,
            "insertBlock": 2908,
            "postInsertGateBlock": 7504,
            "stoppedAtPostInsertGate": true,
            "D000C2Bit7Restored": true,
            "controlStopBlock": null,
            "controlStopPc": null,
            "controlStopCursorBefore": null,
            "controlStopCursorAfter": null,
            "controlStopCursorRestored": false,
            "uiClearApplied": false,
            "uiClearResult": null,
            "stoppedBeforeControlClear": false,
            "contextVectorRestoreEnabled": false,
            "contextVectorRestored": false,
            "contextVectorRestoreBlock": null,
            "contextVectorRestorePc": null,
            "contextVectorD007CABefore": null,
            "contextVectorD007CAAfter": null,
            "steps": 7526,
            "termination": "post_insert_gate_stop",
            "wipes": 0,
            "D0243A": 13740237,
            "D0243D": 13805630,
            "D007CA": 361961,
            "D008E0": 13740140,
            "D02590": 13893249,
            "D000C2": 0,
            "buffer": [
              51,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "vramPeak": 8689,
            "vramCurrent": 8689
          },
          "pageErrors": []
        },
        "keyDebounceBranch03F998": {
          "label": "keyDebounceBranch03F998",
          "block": 109,
          "seqIndex": 108,
          "pc": "0x03F998",
          "prevPc": "0x003CF3",
          "status": "Key: 3 → 7526 steps (post_insert_gate_stop, insert=0x33 @0xd1a8cc, peak 8689px)",
          "cpu": {
            "pc": "0x03F998",
            "currentBlockPc": "0x03F998",
            "sp": "0xD1A851",
            "af": "0x0044",
            "bc": "0x00A008",
            "de": "0x0080C0",
            "hl": "0x00FF00",
            "ix": "0xD1A860",
            "iy": "0xD00080",
            "f": "0x44",
            "halted": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D010EF": "0xD2A83E",
            "D010FE": "0xD1A8CC",
            "D010F4": "0x1F",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CD",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D0301B": "0x5AA55A",
            "D000C2_IY42": "0x00",
            "D000C4_IY44": "0x00",
            "D000CA_IY4A": "0x21",
            "D00587": "0x0F",
            "D00588": "0x22",
            "D00589": "0x22",
            "D0058B": "0x05",
            "D0058C": "0x0F",
            "D0058E": "0x0F",
            "D00595": "0x00",
            "D00596": "0x01",
            "D0059A": "0x00",
            "EDIT_TOKEN_D1A8CC": "0x33"
          },
          "stackTop": [
            {
              "addr": "0xD1A851",
              "value": "0x03D058"
            },
            {
              "addr": "0xD1A854",
              "value": "0xD1A8A1"
            },
            {
              "addr": "0xD1A857",
              "value": "0xD00080"
            },
            {
              "addr": "0xD1A85A",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A85D",
              "value": "0x05C634"
            }
          ],
          "editLine": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0xD1A8CD",
            "D0243D": "0xD2A83E",
            "D02590": "0xD3FE81",
            "D00595": 0,
            "D00596": 1,
            "buffer": [
              51,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 207
            },
            "vramCurrent": 8689
          },
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          },
          "vram": 8689,
          "phase6": {
            "steps": 47298,
            "termination": "halt",
            "lastPc": 6581,
            "vram": 8482,
            "vatSnapshotCaptured": true,
            "naturalD0301BOwner": {
              "entry": 283838,
              "steps": 39171,
              "termination": "stopped_before_target",
              "lastPc": 646880,
              "beforeD0301B": 0,
              "afterD0301B": 5940570
            }
          },
          "lastKey": {
            "code": "Digit3",
            "label": "3",
            "expectedInsertByte": 51,
            "controlPreStopPc": null,
            "controlPreStopLabel": null,
            "cursorBefore": 13740236,
            "insertBlock": 2908,
            "postInsertGateBlock": 7504,
            "stoppedAtPostInsertGate": true,
            "D000C2Bit7Restored": true,
            "controlStopBlock": null,
            "controlStopPc": null,
            "controlStopCursorBefore": null,
            "controlStopCursorAfter": null,
            "controlStopCursorRestored": false,
            "uiClearApplied": false,
            "uiClearResult": null,
            "stoppedBeforeControlClear": false,
            "contextVectorRestoreEnabled": false,
            "contextVectorRestored": false,
            "contextVectorRestoreBlock": null,
            "contextVectorRestorePc": null,
            "contextVectorD007CABefore": null,
            "contextVectorD007CAAfter": null,
            "steps": 7526,
            "termination": "post_insert_gate_stop",
            "wipes": 0,
            "D0243A": 13740237,
            "D0243D": 13805630,
            "D007CA": 361961,
            "D008E0": 13740140,
            "D02590": 13893249,
            "D000C2": 0,
            "buffer": [
              51,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "vramPeak": 8689,
            "vramCurrent": 8689
          },
          "pageErrors": []
        },
        "keyDebounceCompare03F99A": {
          "label": "keyDebounceCompare03F99A",
          "block": 110,
          "seqIndex": 109,
          "pc": "0x03F99A",
          "prevPc": "0x03F998",
          "status": "Key: 3 → 7526 steps (post_insert_gate_stop, insert=0x33 @0xd1a8cc, peak 8689px)",
          "cpu": {
            "pc": "0x03F99A",
            "currentBlockPc": "0x03F99A",
            "sp": "0xD1A851",
            "af": "0x0044",
            "bc": "0x00A008",
            "de": "0x0080C0",
            "hl": "0x00FF00",
            "ix": "0xD1A860",
            "iy": "0xD00080",
            "f": "0x44",
            "halted": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D010EF": "0xD2A83E",
            "D010FE": "0xD1A8CC",
            "D010F4": "0x1F",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CD",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D0301B": "0x5AA55A",
            "D000C2_IY42": "0x00",
            "D000C4_IY44": "0x00",
            "D000CA_IY4A": "0x21",
            "D00587": "0x0F",
            "D00588": "0x22",
            "D00589": "0x22",
            "D0058B": "0x05",
            "D0058C": "0x0F",
            "D0058E": "0x0F",
            "D00595": "0x00",
            "D00596": "0x01",
            "D0059A": "0x00",
            "EDIT_TOKEN_D1A8CC": "0x33"
          },
          "stackTop": [
            {
              "addr": "0xD1A851",
              "value": "0x03D058"
            },
            {
              "addr": "0xD1A854",
              "value": "0xD1A8A1"
            },
            {
              "addr": "0xD1A857",
              "value": "0xD00080"
            },
            {
              "addr": "0xD1A85A",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A85D",
              "value": "0x05C634"
            }
          ],
          "editLine": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0xD1A8CD",
            "D0243D": "0xD2A83E",
            "D02590": "0xD3FE81",
            "D00595": 0,
            "D00596": 1,
            "buffer": [
              51,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 207
            },
            "vramCurrent": 8689
          },
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          },
          "vram": 8689,
          "phase6": {
            "steps": 47298,
            "termination": "halt",
            "lastPc": 6581,
            "vram": 8482,
            "vatSnapshotCaptured": true,
            "naturalD0301BOwner": {
              "entry": 283838,
              "steps": 39171,
              "termination": "stopped_before_target",
              "lastPc": 646880,
              "beforeD0301B": 0,
              "afterD0301B": 5940570
            }
          },
          "lastKey": {
            "code": "Digit3",
            "label": "3",
            "expectedInsertByte": 51,
            "controlPreStopPc": null,
            "controlPreStopLabel": null,
            "cursorBefore": 13740236,
            "insertBlock": 2908,
            "postInsertGateBlock": 7504,
            "stoppedAtPostInsertGate": true,
            "D000C2Bit7Restored": true,
            "controlStopBlock": null,
            "controlStopPc": null,
            "controlStopCursorBefore": null,
            "controlStopCursorAfter": null,
            "controlStopCursorRestored": false,
            "uiClearApplied": false,
            "uiClearResult": null,
            "stoppedBeforeControlClear": false,
            "contextVectorRestoreEnabled": false,
            "contextVectorRestored": false,
            "contextVectorRestoreBlock": null,
            "contextVectorRestorePc": null,
            "contextVectorD007CABefore": null,
            "contextVectorD007CAAfter": null,
            "steps": 7526,
            "termination": "post_insert_gate_stop",
            "wipes": 0,
            "D0243A": 13740237,
            "D0243D": 13805630,
            "D007CA": 361961,
            "D008E0": 13740140,
            "D02590": 13893249,
            "D000C2": 0,
            "buffer": [
              51,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "vramPeak": 8689,
            "vramCurrent": 8689
          },
          "pageErrors": []
        },
        "keyDebounceCounter03F9AE": {
          "label": "keyDebounceCounter03F9AE",
          "block": 112,
          "seqIndex": 111,
          "pc": "0x03F9AE",
          "prevPc": "0x03F9A5",
          "status": "Key: 3 → 7526 steps (post_insert_gate_stop, insert=0x33 @0xd1a8cc, peak 8689px)",
          "cpu": {
            "pc": "0x03F9AE",
            "currentBlockPc": "0x03F9AE",
            "sp": "0xD1A851",
            "af": "0x0044",
            "bc": "0x00A008",
            "de": "0x0080C0",
            "hl": "0xD0058B",
            "ix": "0xD1A860",
            "iy": "0xD00080",
            "f": "0x44",
            "halted": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D010EF": "0xD2A83E",
            "D010FE": "0xD1A8CC",
            "D010F4": "0x1F",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CD",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D0301B": "0x5AA55A",
            "D000C2_IY42": "0x00",
            "D000C4_IY44": "0x00",
            "D000CA_IY4A": "0x21",
            "D00587": "0x0F",
            "D00588": "0x22",
            "D00589": "0x00",
            "D0058B": "0x05",
            "D0058C": "0x0F",
            "D0058E": "0x0F",
            "D00595": "0x00",
            "D00596": "0x01",
            "D0059A": "0x00",
            "EDIT_TOKEN_D1A8CC": "0x33"
          },
          "stackTop": [
            {
              "addr": "0xD1A851",
              "value": "0x03D058"
            },
            {
              "addr": "0xD1A854",
              "value": "0xD1A8A1"
            },
            {
              "addr": "0xD1A857",
              "value": "0xD00080"
            },
            {
              "addr": "0xD1A85A",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A85D",
              "value": "0x05C634"
            }
          ],
          "editLine": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0xD1A8CD",
            "D0243D": "0xD2A83E",
            "D02590": "0xD3FE81",
            "D00595": 0,
            "D00596": 1,
            "buffer": [
              51,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 207
            },
            "vramCurrent": 8689
          },
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          },
          "vram": 8689,
          "phase6": {
            "steps": 47298,
            "termination": "halt",
            "lastPc": 6581,
            "vram": 8482,
            "vatSnapshotCaptured": true,
            "naturalD0301BOwner": {
              "entry": 283838,
              "steps": 39171,
              "termination": "stopped_before_target",
              "lastPc": 646880,
              "beforeD0301B": 0,
              "afterD0301B": 5940570
            }
          },
          "lastKey": {
            "code": "Digit3",
            "label": "3",
            "expectedInsertByte": 51,
            "controlPreStopPc": null,
            "controlPreStopLabel": null,
            "cursorBefore": 13740236,
            "insertBlock": 2908,
            "postInsertGateBlock": 7504,
            "stoppedAtPostInsertGate": true,
            "D000C2Bit7Restored": true,
            "controlStopBlock": null,
            "controlStopPc": null,
            "controlStopCursorBefore": null,
            "controlStopCursorAfter": null,
            "controlStopCursorRestored": false,
            "uiClearApplied": false,
            "uiClearResult": null,
            "stoppedBeforeControlClear": false,
            "contextVectorRestoreEnabled": false,
            "contextVectorRestored": false,
            "contextVectorRestoreBlock": null,
            "contextVectorRestorePc": null,
            "contextVectorD007CABefore": null,
            "contextVectorD007CAAfter": null,
            "steps": 7526,
            "termination": "post_insert_gate_stop",
            "wipes": 0,
            "D0243A": 13740237,
            "D0243D": 13805630,
            "D007CA": 361961,
            "D008E0": 13740140,
            "D02590": 13893249,
            "D000C2": 0,
            "buffer": [
              51,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "vramPeak": 8689,
            "vramCurrent": 8689
          },
          "pageErrors": []
        },
        "keyDebounceReturn03D058": {
          "label": "keyDebounceReturn03D058",
          "block": 113,
          "seqIndex": 112,
          "pc": "0x03D058",
          "prevPc": "0x03F9AE",
          "status": "Key: 3 → 7526 steps (post_insert_gate_stop, insert=0x33 @0xd1a8cc, peak 8689px)",
          "cpu": {
            "pc": "0x03D058",
            "currentBlockPc": "0x03D058",
            "sp": "0xD1A854",
            "af": "0x0002",
            "bc": "0x00A008",
            "de": "0x0080C0",
            "hl": "0xD0058B",
            "ix": "0xD1A860",
            "iy": "0xD00080",
            "f": "0x02",
            "halted": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D010EF": "0xD2A83E",
            "D010FE": "0xD1A8CC",
            "D010F4": "0x1F",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CD",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D0301B": "0x5AA55A",
            "D000C2_IY42": "0x00",
            "D000C4_IY44": "0x00",
            "D000CA_IY4A": "0x21",
            "D00587": "0x0F",
            "D00588": "0x22",
            "D00589": "0x00",
            "D0058B": "0x04",
            "D0058C": "0x0F",
            "D0058E": "0x0F",
            "D00595": "0x00",
            "D00596": "0x01",
            "D0059A": "0x00",
            "EDIT_TOKEN_D1A8CC": "0x33"
          },
          "stackTop": [
            {
              "addr": "0xD1A854",
              "value": "0xD1A8A1"
            },
            {
              "addr": "0xD1A857",
              "value": "0xD00080"
            },
            {
              "addr": "0xD1A85A",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A85D",
              "value": "0x05C634"
            },
            {
              "addr": "0xD1A860",
              "value": "0x08C339"
            }
          ],
          "editLine": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0xD1A8CD",
            "D0243D": "0xD2A83E",
            "D02590": "0xD3FE81",
            "D00595": 0,
            "D00596": 1,
            "buffer": [
              51,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 207
            },
            "vramCurrent": 8689
          },
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          },
          "vram": 8689,
          "phase6": {
            "steps": 47298,
            "termination": "halt",
            "lastPc": 6581,
            "vram": 8482,
            "vatSnapshotCaptured": true,
            "naturalD0301BOwner": {
              "entry": 283838,
              "steps": 39171,
              "termination": "stopped_before_target",
              "lastPc": 646880,
              "beforeD0301B": 0,
              "afterD0301B": 5940570
            }
          },
          "lastKey": {
            "code": "Digit3",
            "label": "3",
            "expectedInsertByte": 51,
            "controlPreStopPc": null,
            "controlPreStopLabel": null,
            "cursorBefore": 13740236,
            "insertBlock": 2908,
            "postInsertGateBlock": 7504,
            "stoppedAtPostInsertGate": true,
            "D000C2Bit7Restored": true,
            "controlStopBlock": null,
            "controlStopPc": null,
            "controlStopCursorBefore": null,
            "controlStopCursorAfter": null,
            "controlStopCursorRestored": false,
            "uiClearApplied": false,
            "uiClearResult": null,
            "stoppedBeforeControlClear": false,
            "contextVectorRestoreEnabled": false,
            "contextVectorRestored": false,
            "contextVectorRestoreBlock": null,
            "contextVectorRestorePc": null,
            "contextVectorD007CABefore": null,
            "contextVectorD007CAAfter": null,
            "steps": 7526,
            "termination": "post_insert_gate_stop",
            "wipes": 0,
            "D0243A": 13740237,
            "D0243D": 13805630,
            "D007CA": 361961,
            "D008E0": 13740140,
            "D02590": 13893249,
            "D000C2": 0,
            "buffer": [
              51,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "vramPeak": 8689,
            "vramCurrent": 8689
          },
          "pageErrors": []
        },
        "keyDebounceOr03F9AB": {
          "label": "keyDebounceOr03F9AB",
          "block": 1021,
          "seqIndex": 1020,
          "pc": "0x03F9AB",
          "prevPc": "0x03F99A",
          "status": "Key: 3 → 7526 steps (post_insert_gate_stop, insert=0x33 @0xd1a8cc, peak 8689px)",
          "cpu": {
            "pc": "0x03F9AB",
            "currentBlockPc": "0x03F9AB",
            "sp": "0xD1A854",
            "af": "0x0042",
            "bc": "0x00A008",
            "de": "0x0080C0",
            "hl": "0xD0058B",
            "ix": "0xD1A860",
            "iy": "0xD00080",
            "f": "0x42",
            "halted": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D010EF": "0xD2A83E",
            "D010FE": "0xD1A8CC",
            "D010F4": "0x1F",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CD",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D0301B": "0x5AA55A",
            "D000C2_IY42": "0x00",
            "D000C4_IY44": "0x00",
            "D000CA_IY4A": "0x21",
            "D00587": "0x0F",
            "D00588": "0x22",
            "D00589": "0x00",
            "D0058B": "0x04",
            "D0058C": "0x0F",
            "D0058E": "0x0F",
            "D00595": "0x00",
            "D00596": "0x01",
            "D0059A": "0x00",
            "EDIT_TOKEN_D1A8CC": "0x33"
          },
          "stackTop": [
            {
              "addr": "0xD1A854",
              "value": "0x03D058"
            },
            {
              "addr": "0xD1A857",
              "value": "0xD1A8A1"
            },
            {
              "addr": "0xD1A85A",
              "value": "0xD00080"
            },
            {
              "addr": "0xD1A85D",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A860",
              "value": "0x08C341"
            }
          ],
          "editLine": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0xD1A8CD",
            "D0243D": "0xD2A83E",
            "D02590": "0xD3FE81",
            "D00595": 0,
            "D00596": 1,
            "buffer": [
              51,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 103
            },
            "vramCurrent": 8585
          },
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          },
          "vram": 8585,
          "phase6": {
            "steps": 47298,
            "termination": "halt",
            "lastPc": 6581,
            "vram": 8482,
            "vatSnapshotCaptured": true,
            "naturalD0301BOwner": {
              "entry": 283838,
              "steps": 39171,
              "termination": "stopped_before_target",
              "lastPc": 646880,
              "beforeD0301B": 0,
              "afterD0301B": 5940570
            }
          },
          "lastKey": {
            "code": "Digit3",
            "label": "3",
            "expectedInsertByte": 51,
            "controlPreStopPc": null,
            "controlPreStopLabel": null,
            "cursorBefore": 13740236,
            "insertBlock": 2908,
            "postInsertGateBlock": 7504,
            "stoppedAtPostInsertGate": true,
            "D000C2Bit7Restored": true,
            "controlStopBlock": null,
            "controlStopPc": null,
            "controlStopCursorBefore": null,
            "controlStopCursorAfter": null,
            "controlStopCursorRestored": false,
            "uiClearApplied": false,
            "uiClearResult": null,
            "stoppedBeforeControlClear": false,
            "contextVectorRestoreEnabled": false,
            "contextVectorRestored": false,
            "contextVectorRestoreBlock": null,
            "contextVectorRestorePc": null,
            "contextVectorD007CABefore": null,
            "contextVectorD007CAAfter": null,
            "steps": 7526,
            "termination": "post_insert_gate_stop",
            "wipes": 0,
            "D0243A": 13740237,
            "D0243D": 13805630,
            "D007CA": 361961,
            "D008E0": 13740140,
            "D02590": 13893249,
            "D000C2": 0,
            "buffer": [
              51,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "vramPeak": 8689,
            "vramCurrent": 8689
          },
          "pageErrors": []
        },
        "flagCompare04C973": {
          "label": "flagCompare04C973",
          "block": 1050,
          "seqIndex": 1049,
          "pc": "0x04C973",
          "prevPc": "0x05E3D6",
          "status": "Key: 3 → 7526 steps (post_insert_gate_stop, insert=0x33 @0xd1a8cc, peak 8689px)",
          "cpu": {
            "pc": "0x04C973",
            "currentBlockPc": "0x04C973",
            "sp": "0xD1A84E",
            "af": "0x0075",
            "bc": "0x00A005",
            "de": "0xD2A83E",
            "hl": "0xD1A8CD",
            "ix": "0xD1A860",
            "iy": "0xD00080",
            "f": "0x75",
            "halted": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D010EF": "0xD2A83E",
            "D010FE": "0xD1A8CC",
            "D010F4": "0x1F",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CD",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D0301B": "0x5AA55A",
            "D000C2_IY42": "0x00",
            "D000C4_IY44": "0x00",
            "D000CA_IY4A": "0x21",
            "D00587": "0x0F",
            "D00588": "0x22",
            "D00589": "0x00",
            "D0058B": "0x03",
            "D0058C": "0x0F",
            "D0058E": "0x0F",
            "D00595": "0x00",
            "D00596": "0x01",
            "D0059A": "0x00",
            "EDIT_TOKEN_D1A8CC": "0x33"
          },
          "stackTop": [
            {
              "addr": "0xD1A84E",
              "value": "0x05C836"
            },
            {
              "addr": "0xD1A851",
              "value": "0x000000"
            },
            {
              "addr": "0xD1A854",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A857",
              "value": "0x00FFFF"
            },
            {
              "addr": "0xD1A85A",
              "value": "0xD1A7FC"
            }
          ],
          "editLine": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0xD1A8CD",
            "D0243D": "0xD2A83E",
            "D02590": "0xD3FE81",
            "D00595": 0,
            "D00596": 1,
            "buffer": [
              51,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 103
            },
            "vramCurrent": 8585
          },
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          },
          "vram": 8585,
          "phase6": {
            "steps": 47298,
            "termination": "halt",
            "lastPc": 6581,
            "vram": 8482,
            "vatSnapshotCaptured": true,
            "naturalD0301BOwner": {
              "entry": 283838,
              "steps": 39171,
              "termination": "stopped_before_target",
              "lastPc": 646880,
              "beforeD0301B": 0,
              "afterD0301B": 5940570
            }
          },
          "lastKey": {
            "code": "Digit3",
            "label": "3",
            "expectedInsertByte": 51,
            "controlPreStopPc": null,
            "controlPreStopLabel": null,
            "cursorBefore": 13740236,
            "insertBlock": 2908,
            "postInsertGateBlock": 7504,
            "stoppedAtPostInsertGate": true,
            "D000C2Bit7Restored": true,
            "controlStopBlock": null,
            "controlStopPc": null,
            "controlStopCursorBefore": null,
            "controlStopCursorAfter": null,
            "controlStopCursorRestored": false,
            "uiClearApplied": false,
            "uiClearResult": null,
            "stoppedBeforeControlClear": false,
            "contextVectorRestoreEnabled": false,
            "contextVectorRestored": false,
            "contextVectorRestoreBlock": null,
            "contextVectorRestorePc": null,
            "contextVectorD007CABefore": null,
            "contextVectorD007CAAfter": null,
            "steps": 7526,
            "termination": "post_insert_gate_stop",
            "wipes": 0,
            "D0243A": 13740237,
            "D0243D": 13805630,
            "D007CA": 361961,
            "D008E0": 13740140,
            "D02590": 13893249,
            "D000C2": 0,
            "buffer": [
              51,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "vramPeak": 8689,
            "vramCurrent": 8689
          },
          "pageErrors": []
        },
        "keyDebounceFallthrough03F9B0": {
          "label": "keyDebounceFallthrough03F9B0",
          "block": 2766,
          "seqIndex": 2765,
          "pc": "0x03F9B0",
          "prevPc": "0x03F9AE",
          "status": "Key: 3 → 7526 steps (post_insert_gate_stop, insert=0x33 @0xd1a8cc, peak 8689px)",
          "cpu": {
            "pc": "0x03F9B0",
            "currentBlockPc": "0x03F9B0",
            "sp": "0xD1A845",
            "af": "0x0042",
            "bc": "0x00A008",
            "de": "0x0080C0",
            "hl": "0xD0058B",
            "ix": "0xD1A860",
            "iy": "0xD00080",
            "f": "0x42",
            "halted": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D010EF": "0xD2A83E",
            "D010FE": "0xD1A8CC",
            "D010F4": "0x1F",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CD",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D0301B": "0x5AA55A",
            "D000C2_IY42": "0x00",
            "D000C4_IY44": "0x00",
            "D000CA_IY4A": "0x21",
            "D00587": "0x0F",
            "D00588": "0x22",
            "D00589": "0x00",
            "D0058B": "0x00",
            "D0058C": "0x0F",
            "D0058E": "0x0F",
            "D00595": "0x00",
            "D00596": "0x01",
            "D0059A": "0x00",
            "EDIT_TOKEN_D1A8CC": "0x33"
          },
          "stackTop": [
            {
              "addr": "0xD1A845",
              "value": "0x03D058"
            },
            {
              "addr": "0xD1A848",
              "value": "0xD1A8A1"
            },
            {
              "addr": "0xD1A84B",
              "value": "0xD00080"
            },
            {
              "addr": "0xD1A84E",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A851",
              "value": "0x05877A"
            }
          ],
          "editLine": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0xD1A8CD",
            "D0243D": "0xD2A83E",
            "D02590": "0xD3FE81",
            "D00595": 0,
            "D00596": 1,
            "buffer": [
              51,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 103
            },
            "vramCurrent": 8585
          },
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          },
          "vram": 8585,
          "phase6": {
            "steps": 47298,
            "termination": "halt",
            "lastPc": 6581,
            "vram": 8482,
            "vatSnapshotCaptured": true,
            "naturalD0301BOwner": {
              "entry": 283838,
              "steps": 39171,
              "termination": "stopped_before_target",
              "lastPc": 646880,
              "beforeD0301B": 0,
              "afterD0301B": 5940570
            }
          },
          "lastKey": {
            "code": "Digit3",
            "label": "3",
            "expectedInsertByte": 51,
            "controlPreStopPc": null,
            "controlPreStopLabel": null,
            "cursorBefore": 13740236,
            "insertBlock": 2908,
            "postInsertGateBlock": 7504,
            "stoppedAtPostInsertGate": true,
            "D000C2Bit7Restored": true,
            "controlStopBlock": null,
            "controlStopPc": null,
            "controlStopCursorBefore": null,
            "controlStopCursorAfter": null,
            "controlStopCursorRestored": false,
            "uiClearApplied": false,
            "uiClearResult": null,
            "stoppedBeforeControlClear": false,
            "contextVectorRestoreEnabled": false,
            "contextVectorRestored": false,
            "contextVectorRestoreBlock": null,
            "contextVectorRestorePc": null,
            "contextVectorD007CABefore": null,
            "contextVectorD007CAAfter": null,
            "steps": 7526,
            "termination": "post_insert_gate_stop",
            "wipes": 0,
            "D0243A": 13740237,
            "D0243D": 13805630,
            "D007CA": 361961,
            "D008E0": 13740140,
            "D02590": 13893249,
            "D000C2": 0,
            "buffer": [
              51,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "vramPeak": 8689,
            "vramCurrent": 8689
          },
          "pageErrors": []
        },
        "flagGate0800B8": {
          "label": "flagGate0800B8",
          "block": 2802,
          "seqIndex": 2801,
          "pc": "0x0800B8",
          "prevPc": "0x0581A3",
          "status": "Key: 3 → 7526 steps (post_insert_gate_stop, insert=0x33 @0xd1a8cc, peak 8689px)",
          "cpu": {
            "pc": "0x0800B8",
            "currentBlockPc": "0x0800B8",
            "sp": "0xD1A84E",
            "af": "0x0F42",
            "bc": "0x000F05",
            "de": "0xD1A7FC",
            "hl": "0x0585E9",
            "ix": "0xD1A860",
            "iy": "0xD00080",
            "f": "0x42",
            "halted": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D010EF": "0xD2A83E",
            "D010FE": "0xD1A8CC",
            "D010F4": "0x1F",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CD",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D0301B": "0x5AA55A",
            "D000C2_IY42": "0x00",
            "D000C4_IY44": "0x00",
            "D000CA_IY4A": "0x21",
            "D00587": "0x00",
            "D00588": "0x00",
            "D00589": "0x00",
            "D0058B": "0x01",
            "D0058C": "0x0F",
            "D0058E": "0x0F",
            "D00595": "0x00",
            "D00596": "0x01",
            "D0059A": "0x00",
            "EDIT_TOKEN_D1A8CC": "0x33"
          },
          "stackTop": [
            {
              "addr": "0xD1A84E",
              "value": "0x0581A7"
            },
            {
              "addr": "0xD1A851",
              "value": "0x0589B6"
            },
            {
              "addr": "0xD1A854",
              "value": "0x08C73D"
            },
            {
              "addr": "0xD1A857",
              "value": "0x000F0F"
            },
            {
              "addr": "0xD1A85A",
              "value": "0x00FFFF"
            }
          ],
          "editLine": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0xD1A8CD",
            "D0243D": "0xD2A83E",
            "D02590": "0xD3FE81",
            "D00595": 0,
            "D00596": 1,
            "buffer": [
              51,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 103
            },
            "vramCurrent": 8585
          },
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          },
          "vram": 8585,
          "phase6": {
            "steps": 47298,
            "termination": "halt",
            "lastPc": 6581,
            "vram": 8482,
            "vatSnapshotCaptured": true,
            "naturalD0301BOwner": {
              "entry": 283838,
              "steps": 39171,
              "termination": "stopped_before_target",
              "lastPc": 646880,
              "beforeD0301B": 0,
              "afterD0301B": 5940570
            }
          },
          "lastKey": {
            "code": "Digit3",
            "label": "3",
            "expectedInsertByte": 51,
            "controlPreStopPc": null,
            "controlPreStopLabel": null,
            "cursorBefore": 13740236,
            "insertBlock": 2908,
            "postInsertGateBlock": 7504,
            "stoppedAtPostInsertGate": true,
            "D000C2Bit7Restored": true,
            "controlStopBlock": null,
            "controlStopPc": null,
            "controlStopCursorBefore": null,
            "controlStopCursorAfter": null,
            "controlStopCursorRestored": false,
            "uiClearApplied": false,
            "uiClearResult": null,
            "stoppedBeforeControlClear": false,
            "contextVectorRestoreEnabled": false,
            "contextVectorRestored": false,
            "contextVectorRestoreBlock": null,
            "contextVectorRestorePc": null,
            "contextVectorD007CABefore": null,
            "contextVectorD007CAAfter": null,
            "steps": 7526,
            "termination": "post_insert_gate_stop",
            "wipes": 0,
            "D0243A": 13740237,
            "D0243D": 13805630,
            "D007CA": 361961,
            "D008E0": 13740140,
            "D02590": 13893249,
            "D000C2": 0,
            "buffer": [
              51,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "vramPeak": 8689,
            "vramCurrent": 8689
          },
          "pageErrors": []
        },
        "keyDebouncePost03F9B8": {
          "label": "keyDebouncePost03F9B8",
          "block": 3039,
          "seqIndex": 3038,
          "pc": "0x03F9B8",
          "prevPc": "0x03F9B0",
          "status": "Key: 3 → 7526 steps (post_insert_gate_stop, insert=0x33 @0xd1a8cc, peak 8689px)",
          "cpu": {
            "pc": "0x03F9B8",
            "currentBlockPc": "0x03F9B8",
            "sp": "0xD1A848",
            "af": "0x0042",
            "bc": "0x00A008",
            "de": "0x0080C0",
            "hl": "0xD00588",
            "ix": "0xD1A860",
            "iy": "0xD00080",
            "f": "0x42",
            "halted": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D010EF": "0xD2A83E",
            "D010FE": "0xD1A8CC",
            "D010F4": "0x1F",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CD",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D0301B": "0x5AA55A",
            "D000C2_IY42": "0x00",
            "D000C4_IY44": "0x00",
            "D000CA_IY4A": "0x21",
            "D00587": "0x00",
            "D00588": "0x00",
            "D00589": "0x00",
            "D0058B": "0x01",
            "D0058C": "0x0F",
            "D0058E": "0x0F",
            "D00595": "0x00",
            "D00596": "0x01",
            "D0059A": "0x00",
            "EDIT_TOKEN_D1A8CC": "0x33"
          },
          "stackTop": [
            {
              "addr": "0xD1A848",
              "value": "0x03D058"
            },
            {
              "addr": "0xD1A84B",
              "value": "0xD1A8A1"
            },
            {
              "addr": "0xD1A84E",
              "value": "0xD00080"
            },
            {
              "addr": "0xD1A851",
              "value": "0xD1A860"
            },
            {
              "addr": "0xD1A854",
              "value": "0x0A34AE"
            }
          ],
          "editLine": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0xD1A8CD",
            "D0243D": "0xD2A83E",
            "D02590": "0xD3FE81",
            "D00595": 0,
            "D00596": 1,
            "buffer": [
              51,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 103
            },
            "vramCurrent": 8585
          },
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          },
          "vram": 8585,
          "phase6": {
            "steps": 47298,
            "termination": "halt",
            "lastPc": 6581,
            "vram": 8482,
            "vatSnapshotCaptured": true,
            "naturalD0301BOwner": {
              "entry": 283838,
              "steps": 39171,
              "termination": "stopped_before_target",
              "lastPc": 646880,
              "beforeD0301B": 0,
              "afterD0301B": 5940570
            }
          },
          "lastKey": {
            "code": "Digit3",
            "label": "3",
            "expectedInsertByte": 51,
            "controlPreStopPc": null,
            "controlPreStopLabel": null,
            "cursorBefore": 13740236,
            "insertBlock": 2908,
            "postInsertGateBlock": 7504,
            "stoppedAtPostInsertGate": true,
            "D000C2Bit7Restored": true,
            "controlStopBlock": null,
            "controlStopPc": null,
            "controlStopCursorBefore": null,
            "controlStopCursorAfter": null,
            "controlStopCursorRestored": false,
            "uiClearApplied": false,
            "uiClearResult": null,
            "stoppedBeforeControlClear": false,
            "contextVectorRestoreEnabled": false,
            "contextVectorRestored": false,
            "contextVectorRestoreBlock": null,
            "contextVectorRestorePc": null,
            "contextVectorD007CABefore": null,
            "contextVectorD007CAAfter": null,
            "steps": 7526,
            "termination": "post_insert_gate_stop",
            "wipes": 0,
            "D0243A": 13740237,
            "D0243D": 13805630,
            "D007CA": 361961,
            "D008E0": 13740140,
            "D02590": 13893249,
            "D000C2": 0,
            "buffer": [
              51,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "vramPeak": 8689,
            "vramCurrent": 8689
          },
          "pageErrors": []
        },
        "getCsc03FA09": {
          "label": "getCsc03FA09",
          "block": 3789,
          "seqIndex": 3788,
          "pc": "0x03FA09",
          "prevPc": "0x02FDB6",
          "status": "Key: 3 → 7526 steps (post_insert_gate_stop, insert=0x33 @0xd1a8cc, peak 8689px)",
          "cpu": {
            "pc": "0x03FA09",
            "currentBlockPc": "0x03FA09",
            "sp": "0xD1A85A",
            "af": "0x1A10",
            "bc": "0x00E005",
            "de": "0xD2A83E",
            "hl": "0x00FFFF",
            "ix": "0xD1A860",
            "iy": "0xD00080",
            "f": "0x10",
            "halted": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D010EF": "0xD2A83E",
            "D010FE": "0xD1A8CC",
            "D010F4": "0x1F",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CD",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D0301B": "0x5AA55A",
            "D000C2_IY42": "0x00",
            "D000C4_IY44": "0x00",
            "D000CA_IY4A": "0x21",
            "D00587": "0x00",
            "D00588": "0x00",
            "D00589": "0x00",
            "D0058B": "0x01",
            "D0058C": "0x00",
            "D0058E": "0x00",
            "D00595": "0x00",
            "D00596": "0x01",
            "D0059A": "0x00",
            "EDIT_TOKEN_D1A8CC": "0x33"
          },
          "stackTop": [
            {
              "addr": "0xD1A85A",
              "value": "0x02FDC2"
            },
            {
              "addr": "0xD1A85D",
              "value": "0x02FCC6"
            },
            {
              "addr": "0xD1A860",
              "value": "0x08C366"
            },
            {
              "addr": "0xD1A863",
              "value": "0x0019B5"
            },
            {
              "addr": "0xD1A866",
              "value": "0xFFFFFF"
            }
          ],
          "editLine": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0xD1A8CD",
            "D0243D": "0xD2A83E",
            "D02590": "0xD3FE81",
            "D00595": 0,
            "D00596": 1,
            "buffer": [
              51,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 207
            },
            "vramCurrent": 8689
          },
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          },
          "vram": 8689,
          "phase6": {
            "steps": 47298,
            "termination": "halt",
            "lastPc": 6581,
            "vram": 8482,
            "vatSnapshotCaptured": true,
            "naturalD0301BOwner": {
              "entry": 283838,
              "steps": 39171,
              "termination": "stopped_before_target",
              "lastPc": 646880,
              "beforeD0301B": 0,
              "afterD0301B": 5940570
            }
          },
          "lastKey": {
            "code": "Digit3",
            "label": "3",
            "expectedInsertByte": 51,
            "controlPreStopPc": null,
            "controlPreStopLabel": null,
            "cursorBefore": 13740236,
            "insertBlock": 2908,
            "postInsertGateBlock": 7504,
            "stoppedAtPostInsertGate": true,
            "D000C2Bit7Restored": true,
            "controlStopBlock": null,
            "controlStopPc": null,
            "controlStopCursorBefore": null,
            "controlStopCursorAfter": null,
            "controlStopCursorRestored": false,
            "uiClearApplied": false,
            "uiClearResult": null,
            "stoppedBeforeControlClear": false,
            "contextVectorRestoreEnabled": false,
            "contextVectorRestored": false,
            "contextVectorRestoreBlock": null,
            "contextVectorRestorePc": null,
            "contextVectorD007CABefore": null,
            "contextVectorD007CAAfter": null,
            "steps": 7526,
            "termination": "post_insert_gate_stop",
            "wipes": 0,
            "D0243A": 13740237,
            "D0243D": 13805630,
            "D007CA": 361961,
            "D008E0": 13740140,
            "D02590": 13893249,
            "D000C2": 0,
            "buffer": [
              51,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "vramPeak": 8689,
            "vramCurrent": 8689
          },
          "pageErrors": []
        },
        "insertGate0158DE": {
          "label": "insertGate0158DE",
          "block": 5346,
          "seqIndex": 5345,
          "pc": "0x0158DE",
          "prevPc": "0x0013C7",
          "status": "Key: 3 → 7526 steps (post_insert_gate_stop, insert=0x33 @0xd1a8cc, peak 8689px)",
          "cpu": {
            "pc": "0x0158DE",
            "currentBlockPc": "0x0158DE",
            "sp": "0xD1A87B",
            "af": "0xD042",
            "bc": "0x00A005",
            "de": "0xD1A7FC",
            "hl": "0x000000",
            "ix": "0x000000",
            "iy": "0xD00080",
            "f": "0x42",
            "halted": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D010EF": "0xD2A83E",
            "D010FE": "0xD1A8CC",
            "D010F4": "0x1F",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CD",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D0301B": "0x5AA55A",
            "D000C2_IY42": "0x00",
            "D000C4_IY44": "0x00",
            "D000CA_IY4A": "0x21",
            "D00587": "0x00",
            "D00588": "0x00",
            "D00589": "0x00",
            "D0058B": "0x01",
            "D0058C": "0x00",
            "D0058E": "0x00",
            "D00595": "0x00",
            "D00596": "0x01",
            "D0059A": "0x00",
            "EDIT_TOKEN_D1A8CC": "0x33"
          },
          "stackTop": [
            {
              "addr": "0xD1A87B",
              "value": "0x0013DA"
            },
            {
              "addr": "0xD1A87E",
              "value": "0x030000"
            },
            {
              "addr": "0xD1A881",
              "value": "0x000000"
            },
            {
              "addr": "0xD1A884",
              "value": "0x000000"
            },
            {
              "addr": "0xD1A887",
              "value": "0x000000"
            }
          ],
          "editLine": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0xD1A8CD",
            "D0243D": "0xD2A83E",
            "D02590": "0xD3FE81",
            "D00595": 0,
            "D00596": 1,
            "buffer": [
              51,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 207
            },
            "vramCurrent": 8689
          },
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          },
          "vram": 8689,
          "phase6": {
            "steps": 47298,
            "termination": "halt",
            "lastPc": 6581,
            "vram": 8482,
            "vatSnapshotCaptured": true,
            "naturalD0301BOwner": {
              "entry": 283838,
              "steps": 39171,
              "termination": "stopped_before_target",
              "lastPc": 646880,
              "beforeD0301B": 0,
              "afterD0301B": 5940570
            }
          },
          "lastKey": {
            "code": "Digit3",
            "label": "3",
            "expectedInsertByte": 51,
            "controlPreStopPc": null,
            "controlPreStopLabel": null,
            "cursorBefore": 13740236,
            "insertBlock": 2908,
            "postInsertGateBlock": 7504,
            "stoppedAtPostInsertGate": true,
            "D000C2Bit7Restored": true,
            "controlStopBlock": null,
            "controlStopPc": null,
            "controlStopCursorBefore": null,
            "controlStopCursorAfter": null,
            "controlStopCursorRestored": false,
            "uiClearApplied": false,
            "uiClearResult": null,
            "stoppedBeforeControlClear": false,
            "contextVectorRestoreEnabled": false,
            "contextVectorRestored": false,
            "contextVectorRestoreBlock": null,
            "contextVectorRestorePc": null,
            "contextVectorD007CABefore": null,
            "contextVectorD007CAAfter": null,
            "steps": 7526,
            "termination": "post_insert_gate_stop",
            "wipes": 0,
            "D0243A": 13740237,
            "D0243D": 13805630,
            "D007CA": 361961,
            "D008E0": 13740140,
            "D02590": 13893249,
            "D000C2": 0,
            "buffer": [
              51,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "vramPeak": 8689,
            "vramCurrent": 8689
          },
          "pageErrors": []
        },
        "insertGateReturn0013DA": {
          "label": "insertGateReturn0013DA",
          "block": 5447,
          "seqIndex": 5446,
          "pc": "0x0013DA",
          "prevPc": "0x0158F8",
          "status": "Key: 3 → 7526 steps (post_insert_gate_stop, insert=0x33 @0xd1a8cc, peak 8689px)",
          "cpu": {
            "pc": "0x0013DA",
            "currentBlockPc": "0x0013DA",
            "sp": "0xD1A87E",
            "af": "0x0044",
            "bc": "0x000003",
            "de": "0x000430",
            "hl": "0x000000",
            "ix": "0x000000",
            "iy": "0xD00080",
            "f": "0x44",
            "halted": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D010EF": "0xD2A83E",
            "D010FE": "0xD1A8CC",
            "D010F4": "0x1F",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CD",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D0301B": "0x5AA55A",
            "D000C2_IY42": "0x00",
            "D000C4_IY44": "0x00",
            "D000CA_IY4A": "0x21",
            "D00587": "0x00",
            "D00588": "0x00",
            "D00589": "0x00",
            "D0058B": "0x01",
            "D0058C": "0x00",
            "D0058E": "0x00",
            "D00595": "0x00",
            "D00596": "0x01",
            "D0059A": "0x00",
            "EDIT_TOKEN_D1A8CC": "0x33"
          },
          "stackTop": [
            {
              "addr": "0xD1A87E",
              "value": "0x030000"
            },
            {
              "addr": "0xD1A881",
              "value": "0x000000"
            },
            {
              "addr": "0xD1A884",
              "value": "0x000000"
            },
            {
              "addr": "0xD1A887",
              "value": "0x000000"
            },
            {
              "addr": "0xD1A88A",
              "value": "0x000000"
            }
          ],
          "editLine": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0xD1A8CD",
            "D0243D": "0xD2A83E",
            "D02590": "0xD3FE81",
            "D00595": 0,
            "D00596": 1,
            "buffer": [
              51,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 207
            },
            "vramCurrent": 8689
          },
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          },
          "vram": 8689,
          "phase6": {
            "steps": 47298,
            "termination": "halt",
            "lastPc": 6581,
            "vram": 8482,
            "vatSnapshotCaptured": true,
            "naturalD0301BOwner": {
              "entry": 283838,
              "steps": 39171,
              "termination": "stopped_before_target",
              "lastPc": 646880,
              "beforeD0301B": 0,
              "afterD0301B": 5940570
            }
          },
          "lastKey": {
            "code": "Digit3",
            "label": "3",
            "expectedInsertByte": 51,
            "controlPreStopPc": null,
            "controlPreStopLabel": null,
            "cursorBefore": 13740236,
            "insertBlock": 2908,
            "postInsertGateBlock": 7504,
            "stoppedAtPostInsertGate": true,
            "D000C2Bit7Restored": true,
            "controlStopBlock": null,
            "controlStopPc": null,
            "controlStopCursorBefore": null,
            "controlStopCursorAfter": null,
            "controlStopCursorRestored": false,
            "uiClearApplied": false,
            "uiClearResult": null,
            "stoppedBeforeControlClear": false,
            "contextVectorRestoreEnabled": false,
            "contextVectorRestored": false,
            "contextVectorRestoreBlock": null,
            "contextVectorRestorePc": null,
            "contextVectorD007CABefore": null,
            "contextVectorD007CAAfter": null,
            "steps": 7526,
            "termination": "post_insert_gate_stop",
            "wipes": 0,
            "D0243A": 13740237,
            "D0243D": 13805630,
            "D007CA": 361961,
            "D008E0": 13740140,
            "D02590": 13893249,
            "D000C2": 0,
            "buffer": [
              51,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "vramPeak": 8689,
            "vramCurrent": 8689
          },
          "pageErrors": []
        },
        "preWipe001879": {
          "label": "preWipe001879",
          "block": 5552,
          "seqIndex": 5551,
          "pc": "0x001879",
          "prevPc": "0x001872",
          "status": "Key: 3 → 7526 steps (post_insert_gate_stop, insert=0x33 @0xd1a8cc, peak 8689px)",
          "cpu": {
            "pc": "0x001879",
            "currentBlockPc": "0x001879",
            "sp": "0xD1A87B",
            "af": "0xEE54",
            "bc": "0x000003",
            "de": "0x000430",
            "hl": "0x000000",
            "ix": "0x000000",
            "iy": "0xD00080",
            "f": "0x54",
            "halted": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D010EF": "0xD2A83E",
            "D010FE": "0xD1A8CC",
            "D010F4": "0x1F",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CD",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D02A29": "0x0000",
            "D0301B": "0x5AA55A",
            "D000C2_IY42": "0x00",
            "D000C4_IY44": "0x00",
            "D000CA_IY4A": "0x21",
            "D00587": "0x00",
            "D00588": "0x00",
            "D00589": "0x00",
            "D0058B": "0x01",
            "D0058C": "0x00",
            "D0058E": "0x00",
            "D00595": "0x00",
            "D00596": "0x01",
            "D0059A": "0x00",
            "EDIT_TOKEN_D1A8CC": "0x33"
          },
          "stackTop": [
            {
              "addr": "0xD1A87B",
              "value": "0x0013E8"
            },
            {
              "addr": "0xD1A87E",
              "value": "0x030000"
            },
            {
              "addr": "0xD1A881",
              "value": "0x000000"
            },
            {
              "addr": "0xD1A884",
              "value": "0x000000"
            },
            {
              "addr": "0xD1A887",
              "value": "0x000000"
            }
          ],
          "editLine": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0xD1A8CD",
            "D0243D": "0xD2A83E",
            "D02590": "0xD3FE81",
            "D00595": 0,
            "D00596": 1,
            "buffer": [
              51,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 207
            },
            "vramCurrent": 8689
          },
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805630,
              "D02A40": 13805630,
              "D02A28": 0
            }
          },
          "vram": 8689,
          "phase6": {
            "steps": 47298,
            "termination": "halt",
            "lastPc": 6581,
            "vram": 8482,
            "vatSnapshotCaptured": true,
            "naturalD0301BOwner": {
              "entry": 283838,
              "steps": 39171,
              "termination": "stopped_before_target",
              "lastPc": 646880,
              "beforeD0301B": 0,
              "afterD0301B": 5940570
            }
          },
          "lastKey": {
            "code": "Digit3",
            "label": "3",
            "expectedInsertByte": 51,
            "controlPreStopPc": null,
            "controlPreStopLabel": null,
            "cursorBefore": 13740236,
            "insertBlock": 2908,
            "postInsertGateBlock": 7504,
            "stoppedAtPostInsertGate": true,
            "D000C2Bit7Restored": true,
            "controlStopBlock": null,
            "controlStopPc": null,
            "controlStopCursorBefore": null,
            "controlStopCursorAfter": null,
            "controlStopCursorRestored": false,
            "uiClearApplied": false,
            "uiClearResult": null,
            "stoppedBeforeControlClear": false,
            "contextVectorRestoreEnabled": false,
            "contextVectorRestored": false,
            "contextVectorRestoreBlock": null,
            "contextVectorRestorePc": null,
            "contextVectorD007CABefore": null,
            "contextVectorD007CAAfter": null,
            "steps": 7526,
            "termination": "post_insert_gate_stop",
            "wipes": 0,
            "D0243A": 13740237,
            "D0243D": 13805630,
            "D007CA": 361961,
            "D008E0": 13740140,
            "D02590": 13893249,
            "D000C2": 0,
            "buffer": [
              51,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "vramPeak": 8689,
            "vramCurrent": 8689
          },
          "pageErrors": []
        },
        "cleanup0018F8": {
          "label": "cleanup0018F8",
          "block": 5553,
          "seqIndex": 5552,
          "pc": "0x0018F8",
          "prevPc": "0x001879",
          "status": "Key: 3 → 7526 steps (post_insert_gate_stop, insert=0x33 @0xd1a8cc, peak 8689px)",
          "cpu": {
            "pc": "0x0018F8",
            "currentBlockPc": "0x0018F8",
            "sp": "0xD1A87B",
            "af": "0x5200",
            "bc": "0x0000FF",
            "de": "0xD3FF00",
            "hl": "0xD3FEFF",
            "ix": "0x000000",
            "iy": "0xD00080",
            "f": "0x00",
            "halted": false
          },
          "fields": {
            "D007CA": "0x000000",
            "D008E0": "0x000000",
            "D010EF": "0x000000",
            "D010FE": "0x000000",
            "D010F4": "0x00",
            "D02317": "0x000000",
            "D0231A": "0x000000",
            "D0231D": "0x000000",
            "D02437": "0x000000",
            "D0243A": "0x000000",
            "D0243D": "0x000000",
            "D02440": "0x000000",
            "D02505": "0x00",
            "D02590": "0x000000",
            "D0259D": "0x000000",
            "D02A29": "0x0000",
            "D0301B": "0x000000",
            "D000C2_IY42": "0x00",
            "D000C4_IY44": "0x00",
            "D000CA_IY4A": "0x00",
            "D00587": "0x00",
            "D00588": "0x00",
            "D00589": "0x00",
            "D0058B": "0x00",
            "D0058C": "0x00",
            "D0058E": "0x00",
            "D00595": "0x00",
            "D00596": "0x00",
            "D0059A": "0x00",
            "EDIT_TOKEN_D1A8CC": "0x33"
          },
          "stackTop": [
            {
              "addr": "0xD1A87B",
              "value": "0x0013E8"
            },
            {
              "addr": "0xD1A87E",
              "value": "0x030000"
            },
            {
              "addr": "0xD1A881",
              "value": "0x000000"
            },
            {
              "addr": "0xD1A884",
              "value": "0x000000"
            },
            {
              "addr": "0xD1A887",
              "value": "0x000000"
            }
          ],
          "editLine": {
            "D007CA": "0x000000",
            "D008E0": "0x000000",
            "D0243A": "0x000000",
            "D0243D": "0x000000",
            "D02590": "0x000000",
            "D00595": 0,
            "D00596": 0,
            "buffer": [
              51,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 207
            },
            "vramCurrent": 8689
          },
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 0,
              "D02A40": 0,
              "D02A28": 0
            }
          },
          "vram": 8689,
          "phase6": {
            "steps": 47298,
            "termination": "halt",
            "lastPc": 6581,
            "vram": 8482,
            "vatSnapshotCaptured": true,
            "naturalD0301BOwner": {
              "entry": 283838,
              "steps": 39171,
              "termination": "stopped_before_target",
              "lastPc": 646880,
              "beforeD0301B": 0,
              "afterD0301B": 5940570
            }
          },
          "lastKey": {
            "code": "Digit3",
            "label": "3",
            "expectedInsertByte": 51,
            "controlPreStopPc": null,
            "controlPreStopLabel": null,
            "cursorBefore": 13740236,
            "insertBlock": 2908,
            "postInsertGateBlock": 7504,
            "stoppedAtPostInsertGate": true,
            "D000C2Bit7Restored": true,
            "controlStopBlock": null,
            "controlStopPc": null,
            "controlStopCursorBefore": null,
            "controlStopCursorAfter": null,
            "controlStopCursorRestored": false,
            "uiClearApplied": false,
            "uiClearResult": null,
            "stoppedBeforeControlClear": false,
            "contextVectorRestoreEnabled": false,
            "contextVectorRestored": false,
            "contextVectorRestoreBlock": null,
            "contextVectorRestorePc": null,
            "contextVectorD007CABefore": null,
            "contextVectorD007CAAfter": null,
            "steps": 7526,
            "termination": "post_insert_gate_stop",
            "wipes": 0,
            "D0243A": 13740237,
            "D0243D": 13805630,
            "D007CA": 361961,
            "D008E0": 13740140,
            "D02590": 13893249,
            "D000C2": 0,
            "buffer": [
              51,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "vramPeak": 8689,
            "vramCurrent": 8689
          },
          "pageErrors": []
        },
        "poll006D64": {
          "label": "poll006D64",
          "block": 14862,
          "seqIndex": 14861,
          "pc": "0x006D64",
          "prevPc": "0x0021C2",
          "status": "Key: 3 → 7526 steps (post_insert_gate_stop, insert=0x33 @0xd1a8cc, peak 8689px)",
          "cpu": {
            "pc": "0x006D64",
            "currentBlockPc": "0x006D64",
            "sp": "0xD1A82B",
            "af": "0x0002",
            "bc": "0x020000",
            "de": "0x000240",
            "hl": "0x000100",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "f": "0x02",
            "halted": false
          },
          "fields": {
            "D007CA": "0x000000",
            "D008E0": "0x000000",
            "D010EF": "0x000000",
            "D010FE": "0x000000",
            "D010F4": "0x00",
            "D02317": "0x000000",
            "D0231A": "0x000000",
            "D0231D": "0x000000",
            "D02437": "0x000000",
            "D0243A": "0x000000",
            "D0243D": "0x000000",
            "D02440": "0x000000",
            "D02505": "0x00",
            "D02590": "0x000000",
            "D0259D": "0x000000",
            "D02A29": "0x0000",
            "D0301B": "0x000000",
            "D000C2_IY42": "0x00",
            "D000C4_IY44": "0x00",
            "D000CA_IY4A": "0x00",
            "D00587": "0x00",
            "D00588": "0x00",
            "D00589": "0x00",
            "D0058B": "0x00",
            "D0058C": "0x00",
            "D0058E": "0x00",
            "D00595": "0x04",
            "D00596": "0x13",
            "D0059A": "0x00",
            "EDIT_TOKEN_D1A8CC": "0x33"
          },
          "stackTop": [
            {
              "addr": "0xD1A82B",
              "value": "0x000000"
            },
            {
              "addr": "0xD1A82E",
              "value": "0x020000"
            },
            {
              "addr": "0xD1A831",
              "value": "0xD1A866"
            },
            {
              "addr": "0xD1A834",
              "value": "0x0064DE"
            },
            {
              "addr": "0xD1A837",
              "value": "0x020000"
            }
          ],
          "editLine": {
            "D007CA": "0x000000",
            "D008E0": "0x000000",
            "D0243A": "0x000000",
            "D0243D": "0x000000",
            "D02590": "0x000000",
            "D00595": 4,
            "D00596": 19,
            "buffer": [
              51,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 0
            },
            "vramCurrent": 3031
          },
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 0,
              "D02A40": 0,
              "D02A28": 0
            }
          },
          "vram": 3031,
          "phase6": {
            "steps": 47298,
            "termination": "halt",
            "lastPc": 6581,
            "vram": 8482,
            "vatSnapshotCaptured": true,
            "naturalD0301BOwner": {
              "entry": 283838,
              "steps": 39171,
              "termination": "stopped_before_target",
              "lastPc": 646880,
              "beforeD0301B": 0,
              "afterD0301B": 5940570
            }
          },
          "lastKey": {
            "code": "Digit3",
            "label": "3",
            "expectedInsertByte": 51,
            "controlPreStopPc": null,
            "controlPreStopLabel": null,
            "cursorBefore": 13740236,
            "insertBlock": 2908,
            "postInsertGateBlock": 7504,
            "stoppedAtPostInsertGate": true,
            "D000C2Bit7Restored": true,
            "controlStopBlock": null,
            "controlStopPc": null,
            "controlStopCursorBefore": null,
            "controlStopCursorAfter": null,
            "controlStopCursorRestored": false,
            "uiClearApplied": false,
            "uiClearResult": null,
            "stoppedBeforeControlClear": false,
            "contextVectorRestoreEnabled": false,
            "contextVectorRestored": false,
            "contextVectorRestoreBlock": null,
            "contextVectorRestorePc": null,
            "contextVectorD007CABefore": null,
            "contextVectorD007CAAfter": null,
            "steps": 7526,
            "termination": "post_insert_gate_stop",
            "wipes": 0,
            "D0243A": 13740237,
            "D0243D": 13805630,
            "D007CA": 361961,
            "D008E0": 13740140,
            "D02590": 13893249,
            "D000C2": 0,
            "buffer": [
              51,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "vramPeak": 8689,
            "vramCurrent": 8689
          },
          "pageErrors": []
        },
        "flagCompareD0243D05E3F5": {
          "label": "flagCompareD0243D05E3F5",
          "block": 197640,
          "seqIndex": 16000,
          "pc": "0x05E3F5",
          "prevPc": "0x05C83E",
          "status": "Key: 3 → 7526 steps (post_insert_gate_stop, insert=0x33 @0xd1a8cc, peak 8689px)",
          "cpu": {
            "pc": "0x05E3F5",
            "currentBlockPc": "0x05E3F5",
            "sp": "0xD1A869",
            "af": "0x0054",
            "bc": "0x00B026",
            "de": "0x000000",
            "hl": "0x000000",
            "ix": "0x000000",
            "iy": "0xD00080",
            "f": "0x54",
            "halted": false
          },
          "fields": {
            "D007CA": "0x000000",
            "D008E0": "0x000000",
            "D010EF": "0x000000",
            "D010FE": "0x000000",
            "D010F4": "0x00",
            "D02317": "0x000000",
            "D0231A": "0x000000",
            "D0231D": "0x000000",
            "D02437": "0x000000",
            "D0243A": "0x000000",
            "D0243D": "0x000000",
            "D02440": "0x000000",
            "D02505": "0x00",
            "D02590": "0x000000",
            "D0259D": "0x000000",
            "D02A29": "0x0000",
            "D0301B": "0x000000",
            "D000C2_IY42": "0x00",
            "D000C4_IY44": "0x00",
            "D000CA_IY4A": "0x00",
            "D00587": "0x00",
            "D00588": "0x00",
            "D00589": "0x00",
            "D0058B": "0xFE",
            "D0058C": "0x00",
            "D0058E": "0x00",
            "D00595": "0x00",
            "D00596": "0x00",
            "D0059A": "0x00",
            "EDIT_TOKEN_D1A8CC": "0x33"
          },
          "stackTop": [
            {
              "addr": "0xD1A869",
              "value": "0x05C842"
            },
            {
              "addr": "0xD1A86C",
              "value": "0x000000"
            },
            {
              "addr": "0xD1A86F",
              "value": "0x000000"
            },
            {
              "addr": "0xD1A872",
              "value": "0x00FFFF"
            },
            {
              "addr": "0xD1A875",
              "value": "0xD65800"
            }
          ],
          "editLine": {
            "D007CA": "0x000000",
            "D008E0": "0x000000",
            "D0243A": "0x000000",
            "D0243D": "0x000000",
            "D02590": "0x000000",
            "D00595": 0,
            "D00596": 0,
            "buffer": [
              51,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "entryLineRoi": {
              "x": 0,
              "y": 34,
              "width": 128,
              "height": 26,
              "nonWhite": 0
            },
            "vramCurrent": 36
          },
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 0,
              "D02A40": 0,
              "D02A28": 0
            }
          },
          "vram": 36,
          "phase6": {
            "steps": 47298,
            "termination": "halt",
            "lastPc": 6581,
            "vram": 8482,
            "vatSnapshotCaptured": true,
            "naturalD0301BOwner": {
              "entry": 283838,
              "steps": 39171,
              "termination": "stopped_before_target",
              "lastPc": 646880,
              "beforeD0301B": 0,
              "afterD0301B": 5940570
            }
          },
          "lastKey": {
            "code": "Digit3",
            "label": "3",
            "expectedInsertByte": 51,
            "controlPreStopPc": null,
            "controlPreStopLabel": null,
            "cursorBefore": 13740236,
            "insertBlock": 2908,
            "postInsertGateBlock": 7504,
            "stoppedAtPostInsertGate": true,
            "D000C2Bit7Restored": true,
            "controlStopBlock": null,
            "controlStopPc": null,
            "controlStopCursorBefore": null,
            "controlStopCursorAfter": null,
            "controlStopCursorRestored": false,
            "uiClearApplied": false,
            "uiClearResult": null,
            "stoppedBeforeControlClear": false,
            "contextVectorRestoreEnabled": false,
            "contextVectorRestored": false,
            "contextVectorRestoreBlock": null,
            "contextVectorRestorePc": null,
            "contextVectorD007CABefore": null,
            "contextVectorD007CAAfter": null,
            "steps": 7526,
            "termination": "post_insert_gate_stop",
            "wipes": 0,
            "D0243A": 13740237,
            "D0243D": 13805630,
            "D007CA": 361961,
            "D008E0": 13740140,
            "D02590": 13893249,
            "D000C2": 0,
            "buffer": [
              51,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "vramPeak": 8689,
            "vramCurrent": 8689
          },
          "pageErrors": []
        }
      },
      "fieldChanges": [
        {
          "block": 1,
          "seqIndex": 0,
          "name": "D00587",
          "before": "0x00",
          "after": "0x0F",
          "pc": "0x08C331",
          "prevPc": null
        },
        {
          "block": 1,
          "seqIndex": 0,
          "name": "D0058C",
          "before": "0x00",
          "after": "0x0F",
          "pc": "0x08C331",
          "prevPc": null
        },
        {
          "block": 1,
          "seqIndex": 0,
          "name": "D0058E",
          "before": "0x00",
          "after": "0x0F",
          "pc": "0x08C331",
          "prevPc": null
        },
        {
          "block": 112,
          "seqIndex": 111,
          "name": "D00589",
          "before": "0x22",
          "after": "0x00",
          "pc": "0x03F9AE",
          "prevPc": "0x03F9A5"
        },
        {
          "block": 113,
          "seqIndex": 112,
          "name": "D0058B",
          "before": "0x05",
          "after": "0x04",
          "pc": "0x03D058",
          "prevPc": "0x03F9AE"
        },
        {
          "block": 1023,
          "seqIndex": 1022,
          "name": "D0058B",
          "before": "0x04",
          "after": "0x03",
          "pc": "0x03D058",
          "prevPc": "0x03F9AE"
        },
        {
          "block": 1165,
          "seqIndex": 1164,
          "name": "D0058B",
          "before": "0x03",
          "after": "0x02",
          "pc": "0x03D058",
          "prevPc": "0x03F9AE"
        },
        {
          "block": 2571,
          "seqIndex": 2570,
          "name": "D0058B",
          "before": "0x02",
          "after": "0x01",
          "pc": "0x03D058",
          "prevPc": "0x03F9AE"
        },
        {
          "block": 2766,
          "seqIndex": 2765,
          "name": "D0058B",
          "before": "0x01",
          "after": "0x00",
          "pc": "0x03F9B0",
          "prevPc": "0x03F9AE"
        },
        {
          "block": 2767,
          "seqIndex": 2766,
          "name": "D0058B",
          "before": "0x00",
          "after": "0x01",
          "pc": "0x03F9D1",
          "prevPc": "0x03F9B0"
        },
        {
          "block": 2769,
          "seqIndex": 2768,
          "name": "D00587",
          "before": "0x0F",
          "after": "0x00",
          "pc": "0x03F9D5",
          "prevPc": "0x03F9FA"
        },
        {
          "block": 2771,
          "seqIndex": 2770,
          "name": "D00588",
          "before": "0x22",
          "after": "0x00",
          "pc": "0x03D058",
          "prevPc": "0x03F9DC"
        },
        {
          "block": 3038,
          "seqIndex": 3037,
          "name": "D0058B",
          "before": "0x01",
          "after": "0x00",
          "pc": "0x03F9B0",
          "prevPc": "0x03F9AE"
        },
        {
          "block": 3039,
          "seqIndex": 3038,
          "name": "D0058B",
          "before": "0x00",
          "after": "0x01",
          "pc": "0x03F9B8",
          "prevPc": "0x03F9B0"
        },
        {
          "block": 3165,
          "seqIndex": 3164,
          "name": "D0058B",
          "before": "0x01",
          "after": "0x00",
          "pc": "0x03F9B0",
          "prevPc": "0x03F9AE"
        },
        {
          "block": 3166,
          "seqIndex": 3165,
          "name": "D0058B",
          "before": "0x00",
          "after": "0x01",
          "pc": "0x03F9B8",
          "prevPc": "0x03F9B0"
        },
        {
          "block": 3777,
          "seqIndex": 3776,
          "name": "D0058C",
          "before": "0x0F",
          "after": "0x00",
          "pc": "0x02FCB3",
          "prevPc": "0x08C359"
        },
        {
          "block": 3777,
          "seqIndex": 3776,
          "name": "D0058E",
          "before": "0x0F",
          "after": "0x00",
          "pc": "0x02FCB3",
          "prevPc": "0x08C359"
        },
        {
          "block": 3901,
          "seqIndex": 3900,
          "name": "D0058B",
          "before": "0x01",
          "after": "0x00",
          "pc": "0x03F9B0",
          "prevPc": "0x03F9AE"
        },
        {
          "block": 3902,
          "seqIndex": 3901,
          "name": "D0058B",
          "before": "0x00",
          "after": "0x01",
          "pc": "0x03F9B8",
          "prevPc": "0x03F9B0"
        },
        {
          "block": 4165,
          "seqIndex": 4164,
          "name": "D0058B",
          "before": "0x01",
          "after": "0x00",
          "pc": "0x03F9B0",
          "prevPc": "0x03F9AE"
        },
        {
          "block": 4166,
          "seqIndex": 4165,
          "name": "D0058B",
          "before": "0x00",
          "after": "0x01",
          "pc": "0x03F9B8",
          "prevPc": "0x03F9B0"
        },
        {
          "block": 4365,
          "seqIndex": 4364,
          "name": "D0058B",
          "before": "0x01",
          "after": "0x00",
          "pc": "0x03F9B0",
          "prevPc": "0x03F9AE"
        },
        {
          "block": 4366,
          "seqIndex": 4365,
          "name": "D0058B",
          "before": "0x00",
          "after": "0x01",
          "pc": "0x03F9B8",
          "prevPc": "0x03F9B0"
        },
        {
          "block": 4566,
          "seqIndex": 4565,
          "name": "D0058B",
          "before": "0x01",
          "after": "0x00",
          "pc": "0x03F9B0",
          "prevPc": "0x03F9AE"
        },
        {
          "block": 4567,
          "seqIndex": 4566,
          "name": "D0058B",
          "before": "0x00",
          "after": "0x01",
          "pc": "0x03F9B8",
          "prevPc": "0x03F9B0"
        },
        {
          "block": 4974,
          "seqIndex": 4973,
          "name": "D0058B",
          "before": "0x01",
          "after": "0x00",
          "pc": "0x03F9B0",
          "prevPc": "0x03F9AE"
        },
        {
          "block": 4975,
          "seqIndex": 4974,
          "name": "D0058B",
          "before": "0x00",
          "after": "0x01",
          "pc": "0x03F9B8",
          "prevPc": "0x03F9B0"
        },
        {
          "block": 5553,
          "seqIndex": 5552,
          "name": "D007CA",
          "before": "0x0585E9",
          "after": "0x000000",
          "pc": "0x0018F8",
          "prevPc": "0x001879"
        },
        {
          "block": 5553,
          "seqIndex": 5552,
          "name": "D008E0",
          "before": "0xD1A86C",
          "after": "0x000000",
          "pc": "0x0018F8",
          "prevPc": "0x001879"
        },
        {
          "block": 5553,
          "seqIndex": 5552,
          "name": "D010EF",
          "before": "0xD2A83E",
          "after": "0x000000",
          "pc": "0x0018F8",
          "prevPc": "0x001879"
        },
        {
          "block": 5553,
          "seqIndex": 5552,
          "name": "D010FE",
          "before": "0xD1A8CC",
          "after": "0x000000",
          "pc": "0x0018F8",
          "prevPc": "0x001879"
        },
        {
          "block": 5553,
          "seqIndex": 5552,
          "name": "D010F4",
          "before": "0x1F",
          "after": "0x00",
          "pc": "0x0018F8",
          "prevPc": "0x001879"
        },
        {
          "block": 5553,
          "seqIndex": 5552,
          "name": "D02317",
          "before": "0xD2A83E",
          "after": "0x000000",
          "pc": "0x0018F8",
          "prevPc": "0x001879"
        },
        {
          "block": 5553,
          "seqIndex": 5552,
          "name": "D0231A",
          "before": "0xD2A83E",
          "after": "0x000000",
          "pc": "0x0018F8",
          "prevPc": "0x001879"
        },
        {
          "block": 5553,
          "seqIndex": 5552,
          "name": "D0231D",
          "before": "0xD2A83D",
          "after": "0x000000",
          "pc": "0x0018F8",
          "prevPc": "0x001879"
        },
        {
          "block": 5553,
          "seqIndex": 5552,
          "name": "D02437",
          "before": "0xD1A8CC",
          "after": "0x000000",
          "pc": "0x0018F8",
          "prevPc": "0x001879"
        },
        {
          "block": 5553,
          "seqIndex": 5552,
          "name": "D0243A",
          "before": "0xD1A8CD",
          "after": "0x000000",
          "pc": "0x0018F8",
          "prevPc": "0x001879"
        },
        {
          "block": 5553,
          "seqIndex": 5552,
          "name": "D0243D",
          "before": "0xD2A83E",
          "after": "0x000000",
          "pc": "0x0018F8",
          "prevPc": "0x001879"
        },
        {
          "block": 5553,
          "seqIndex": 5552,
          "name": "D02440",
          "before": "0xD2A83E",
          "after": "0x000000",
          "pc": "0x0018F8",
          "prevPc": "0x001879"
        },
        {
          "block": 5553,
          "seqIndex": 5552,
          "name": "D02505",
          "before": "0x0A",
          "after": "0x00",
          "pc": "0x0018F8",
          "prevPc": "0x001879"
        },
        {
          "block": 5553,
          "seqIndex": 5552,
          "name": "D02590",
          "before": "0xD3FE81",
          "after": "0x000000",
          "pc": "0x0018F8",
          "prevPc": "0x001879"
        },
        {
          "block": 5553,
          "seqIndex": 5552,
          "name": "D0259D",
          "before": "0xD3FECD",
          "after": "0x000000",
          "pc": "0x0018F8",
          "prevPc": "0x001879"
        },
        {
          "block": 5553,
          "seqIndex": 5552,
          "name": "D0301B",
          "before": "0x5AA55A",
          "after": "0x000000",
          "pc": "0x0018F8",
          "prevPc": "0x001879"
        },
        {
          "block": 5553,
          "seqIndex": 5552,
          "name": "D000CA_IY4A",
          "before": "0x21",
          "after": "0x00",
          "pc": "0x0018F8",
          "prevPc": "0x001879"
        },
        {
          "block": 5553,
          "seqIndex": 5552,
          "name": "D0058B",
          "before": "0x01",
          "after": "0x00",
          "pc": "0x0018F8",
          "prevPc": "0x001879"
        },
        {
          "block": 5553,
          "seqIndex": 5552,
          "name": "D00596",
          "before": "0x01",
          "after": "0x00",
          "pc": "0x0018F8",
          "prevPc": "0x001879"
        },
        {
          "block": 7301,
          "seqIndex": 7300,
          "name": "D00596",
          "before": "0x00",
          "after": "0x01",
          "pc": "0x0059E6",
          "prevPc": "0x0059DA"
        },
        {
          "block": 7387,
          "seqIndex": 7386,
          "name": "D00596",
          "before": "0x01",
          "after": "0x02",
          "pc": "0x0059E6",
          "prevPc": "0x0059DA"
        },
        {
          "block": 7473,
          "seqIndex": 7472,
          "name": "D00596",
          "before": "0x02",
          "after": "0x03",
          "pc": "0x0059E6",
          "prevPc": "0x0059DA"
        },
        {
          "block": 7559,
          "seqIndex": 7558,
          "name": "D00596",
          "before": "0x03",
          "after": "0x04",
          "pc": "0x0059E6",
          "prevPc": "0x0059DA"
        },
        {
          "block": 7645,
          "seqIndex": 7644,
          "name": "D00596",
          "before": "0x04",
          "after": "0x05",
          "pc": "0x0059E6",
          "prevPc": "0x0059DA"
        },
        {
          "block": 7731,
          "seqIndex": 7730,
          "name": "D00596",
          "before": "0x05",
          "after": "0x06",
          "pc": "0x0059E6",
          "prevPc": "0x0059DA"
        },
        {
          "block": 7817,
          "seqIndex": 7816,
          "name": "D00596",
          "before": "0x06",
          "after": "0x07",
          "pc": "0x0059E6",
          "prevPc": "0x0059DA"
        },
        {
          "block": 7903,
          "seqIndex": 7902,
          "name": "D00596",
          "before": "0x07",
          "after": "0x08",
          "pc": "0x0059E6",
          "prevPc": "0x0059DA"
        },
        {
          "block": 7989,
          "seqIndex": 7988,
          "name": "D00596",
          "before": "0x08",
          "after": "0x09",
          "pc": "0x0059E6",
          "prevPc": "0x0059DA"
        },
        {
          "block": 8075,
          "seqIndex": 8074,
          "name": "D00596",
          "before": "0x09",
          "after": "0x0A",
          "pc": "0x0059E6",
          "prevPc": "0x0059DA"
        },
        {
          "block": 8161,
          "seqIndex": 8160,
          "name": "D00596",
          "before": "0x0A",
          "after": "0x0B",
          "pc": "0x0059E6",
          "prevPc": "0x0059DA"
        },
        {
          "block": 8247,
          "seqIndex": 8246,
          "name": "D00596",
          "before": "0x0B",
          "after": "0x0C",
          "pc": "0x0059E6",
          "prevPc": "0x0059DA"
        },
        {
          "block": 8333,
          "seqIndex": 8332,
          "name": "D00596",
          "before": "0x0C",
          "after": "0x0D",
          "pc": "0x0059E6",
          "prevPc": "0x0059DA"
        },
        {
          "block": 8419,
          "seqIndex": 8418,
          "name": "D00596",
          "before": "0x0D",
          "after": "0x0E",
          "pc": "0x0059E6",
          "prevPc": "0x0059DA"
        },
        {
          "block": 8422,
          "seqIndex": 8421,
          "name": "D00595",
          "before": "0x00",
          "after": "0x04",
          "pc": "0x0059E9",
          "prevPc": "0x013D1F"
        },
        {
          "block": 8422,
          "seqIndex": 8421,
          "name": "D00596",
          "before": "0x0E",
          "after": "0x00",
          "pc": "0x0059E9",
          "prevPc": "0x013D1F"
        },
        {
          "block": 8507,
          "seqIndex": 8506,
          "name": "D00596",
          "before": "0x00",
          "after": "0x01",
          "pc": "0x0059E6",
          "prevPc": "0x0059DA"
        },
        {
          "block": 8594,
          "seqIndex": 8593,
          "name": "D00596",
          "before": "0x01",
          "after": "0x02",
          "pc": "0x0059E6",
          "prevPc": "0x0059DA"
        },
        {
          "block": 8681,
          "seqIndex": 8680,
          "name": "D00596",
          "before": "0x02",
          "after": "0x03",
          "pc": "0x0059E6",
          "prevPc": "0x0059DA"
        },
        {
          "block": 8768,
          "seqIndex": 8767,
          "name": "D00596",
          "before": "0x03",
          "after": "0x04",
          "pc": "0x0059E6",
          "prevPc": "0x0059DA"
        },
        {
          "block": 8855,
          "seqIndex": 8854,
          "name": "D00596",
          "before": "0x04",
          "after": "0x05",
          "pc": "0x0059E6",
          "prevPc": "0x0059DA"
        },
        {
          "block": 8942,
          "seqIndex": 8941,
          "name": "D00596",
          "before": "0x05",
          "after": "0x06",
          "pc": "0x0059E6",
          "prevPc": "0x0059DA"
        },
        {
          "block": 9029,
          "seqIndex": 9028,
          "name": "D00596",
          "before": "0x06",
          "after": "0x07",
          "pc": "0x0059E6",
          "prevPc": "0x0059DA"
        },
        {
          "block": 9116,
          "seqIndex": 9115,
          "name": "D00596",
          "before": "0x07",
          "after": "0x08",
          "pc": "0x0059E6",
          "prevPc": "0x0059DA"
        },
        {
          "block": 9203,
          "seqIndex": 9202,
          "name": "D00596",
          "before": "0x08",
          "after": "0x09",
          "pc": "0x0059E6",
          "prevPc": "0x0059DA"
        },
        {
          "block": 9290,
          "seqIndex": 9289,
          "name": "D00596",
          "before": "0x09",
          "after": "0x0A",
          "pc": "0x0059E6",
          "prevPc": "0x0059DA"
        },
        {
          "block": 9377,
          "seqIndex": 9376,
          "name": "D00596",
          "before": "0x0A",
          "after": "0x0B",
          "pc": "0x0059E6",
          "prevPc": "0x0059DA"
        },
        {
          "block": 9464,
          "seqIndex": 9463,
          "name": "D00596",
          "before": "0x0B",
          "after": "0x0C",
          "pc": "0x0059E6",
          "prevPc": "0x0059DA"
        },
        {
          "block": 9551,
          "seqIndex": 9550,
          "name": "D00596",
          "before": "0x0C",
          "after": "0x0D",
          "pc": "0x0059E6",
          "prevPc": "0x0059DA"
        },
        {
          "block": 9638,
          "seqIndex": 9637,
          "name": "D00596",
          "before": "0x0D",
          "after": "0x0E",
          "pc": "0x0059E6",
          "prevPc": "0x0059DA"
        },
        {
          "block": 9725,
          "seqIndex": 9724,
          "name": "D00596",
          "before": "0x0E",
          "after": "0x0F",
          "pc": "0x0059E6",
          "prevPc": "0x0059DA"
        },
        {
          "block": 9812,
          "seqIndex": 9811,
          "name": "D00596",
          "before": "0x0F",
          "after": "0x10",
          "pc": "0x0059E6",
          "prevPc": "0x0059DA"
        },
        {
          "block": 9899,
          "seqIndex": 9898,
          "name": "D00596",
          "before": "0x10",
          "after": "0x11",
          "pc": "0x0059E6",
          "prevPc": "0x0059DA"
        },
        {
          "block": 9905,
          "seqIndex": 9904,
          "name": "D00595",
          "before": "0x04",
          "after": "0x05",
          "pc": "0x0059E9",
          "prevPc": "0x013D29"
        },
        {
          "block": 9905,
          "seqIndex": 9904,
          "name": "D00596",
          "before": "0x11",
          "after": "0x00",
          "pc": "0x0059E9",
          "prevPc": "0x013D29"
        },
        {
          "block": 9990,
          "seqIndex": 9989,
          "name": "D00596",
          "before": "0x00",
          "after": "0x01",
          "pc": "0x0059E6",
          "prevPc": "0x0059DA"
        },
        {
          "block": 9996,
          "seqIndex": 9995,
          "name": "D00595",
          "before": "0x05",
          "after": "0x06",
          "pc": "0x0059E9",
          "prevPc": "0x013D29"
        },
        {
          "block": 9996,
          "seqIndex": 9995,
          "name": "D00596",
          "before": "0x01",
          "after": "0x00",
          "pc": "0x0059E9",
          "prevPc": "0x013D29"
        },
        {
          "block": 10081,
          "seqIndex": 10080,
          "name": "D00596",
          "before": "0x00",
          "after": "0x01",
          "pc": "0x0059E6",
          "prevPc": "0x0059DA"
        },
        {
          "block": 10168,
          "seqIndex": 10167,
          "name": "D00596",
          "before": "0x01",
          "after": "0x02",
          "pc": "0x0059E6",
          "prevPc": "0x0059DA"
        },
        {
          "block": 10255,
          "seqIndex": 10254,
          "name": "D00596",
          "before": "0x02",
          "after": "0x03",
          "pc": "0x0059E6",
          "prevPc": "0x0059DA"
        },
        {
          "block": 10342,
          "seqIndex": 10341,
          "name": "D00596",
          "before": "0x03",
          "after": "0x04",
          "pc": "0x0059E6",
          "prevPc": "0x0059DA"
        },
        {
          "block": 10429,
          "seqIndex": 10428,
          "name": "D00596",
          "before": "0x04",
          "after": "0x05",
          "pc": "0x0059E6",
          "prevPc": "0x0059DA"
        },
        {
          "block": 10516,
          "seqIndex": 10515,
          "name": "D00596",
          "before": "0x05",
          "after": "0x06",
          "pc": "0x0059E6",
          "prevPc": "0x0059DA"
        },
        {
          "block": 10603,
          "seqIndex": 10602,
          "name": "D00596",
          "before": "0x06",
          "after": "0x07",
          "pc": "0x0059E6",
          "prevPc": "0x0059DA"
        },
        {
          "block": 10690,
          "seqIndex": 10689,
          "name": "D00596",
          "before": "0x07",
          "after": "0x08",
          "pc": "0x0059E6",
          "prevPc": "0x0059DA"
        },
        {
          "block": 10777,
          "seqIndex": 10776,
          "name": "D00596",
          "before": "0x08",
          "after": "0x09",
          "pc": "0x0059E6",
          "prevPc": "0x0059DA"
        },
        {
          "block": 10864,
          "seqIndex": 10863,
          "name": "D00596",
          "before": "0x09",
          "after": "0x0A",
          "pc": "0x0059E6",
          "prevPc": "0x0059DA"
        },
        {
          "block": 10951,
          "seqIndex": 10950,
          "name": "D00596",
          "before": "0x0A",
          "after": "0x0B",
          "pc": "0x0059E6",
          "prevPc": "0x0059DA"
        },
        {
          "block": 11038,
          "seqIndex": 11037,
          "name": "D00596",
          "before": "0x0B",
          "after": "0x0C",
          "pc": "0x0059E6",
          "prevPc": "0x0059DA"
        },
        {
          "block": 11125,
          "seqIndex": 11124,
          "name": "D00596",
          "before": "0x0C",
          "after": "0x0D",
          "pc": "0x0059E6",
          "prevPc": "0x0059DA"
        },
        {
          "block": 11212,
          "seqIndex": 11211,
          "name": "D00596",
          "before": "0x0D",
          "after": "0x0E",
          "pc": "0x0059E6",
          "prevPc": "0x0059DA"
        },
        {
          "block": 11299,
          "seqIndex": 11298,
          "name": "D00596",
          "before": "0x0E",
          "after": "0x0F",
          "pc": "0x0059E6",
          "prevPc": "0x0059DA"
        },
        {
          "block": 11386,
          "seqIndex": 11385,
          "name": "D00596",
          "before": "0x0F",
          "after": "0x10",
          "pc": "0x0059E6",
          "prevPc": "0x0059DA"
        },
        {
          "block": 11473,
          "seqIndex": 11472,
          "name": "D00596",
          "before": "0x10",
          "after": "0x11",
          "pc": "0x0059E6",
          "prevPc": "0x0059DA"
        },
        {
          "block": 11560,
          "seqIndex": 11559,
          "name": "D00596",
          "before": "0x11",
          "after": "0x12",
          "pc": "0x0059E6",
          "prevPc": "0x0059DA"
        },
        {
          "block": 11647,
          "seqIndex": 11646,
          "name": "D00596",
          "before": "0x12",
          "after": "0x13",
          "pc": "0x0059E6",
          "prevPc": "0x0059DA"
        },
        {
          "block": 11734,
          "seqIndex": 11733,
          "name": "D00596",
          "before": "0x13",
          "after": "0x14",
          "pc": "0x0059E6",
          "prevPc": "0x0059DA"
        },
        {
          "block": 11821,
          "seqIndex": 11820,
          "name": "D00596",
          "before": "0x14",
          "after": "0x15",
          "pc": "0x0059E6",
          "prevPc": "0x0059DA"
        },
        {
          "block": 11908,
          "seqIndex": 11907,
          "name": "D00596",
          "before": "0x15",
          "after": "0x16",
          "pc": "0x0059E6",
          "prevPc": "0x0059DA"
        },
        {
          "block": 11996,
          "seqIndex": 11995,
          "name": "D00596",
          "before": "0x16",
          "after": "0x17",
          "pc": "0x0059E6",
          "prevPc": "0x0059DA"
        },
        {
          "block": 12084,
          "seqIndex": 12083,
          "name": "D00596",
          "before": "0x17",
          "after": "0x18",
          "pc": "0x0059E6",
          "prevPc": "0x0059DA"
        },
        {
          "block": 12090,
          "seqIndex": 12089,
          "name": "D00595",
          "before": "0x06",
          "after": "0x07",
          "pc": "0x0059E9",
          "prevPc": "0x013D29"
        },
        {
          "block": 12090,
          "seqIndex": 12089,
          "name": "D00596",
          "before": "0x18",
          "after": "0x00",
          "pc": "0x0059E9",
          "prevPc": "0x013D29"
        },
        {
          "block": 12175,
          "seqIndex": 12174,
          "name": "D00596",
          "before": "0x00",
          "after": "0x01",
          "pc": "0x0059E6",
          "prevPc": "0x0059DA"
        },
        {
          "block": 12262,
          "seqIndex": 12261,
          "name": "D00596",
          "before": "0x01",
          "after": "0x02",
          "pc": "0x0059E6",
          "prevPc": "0x0059DA"
        },
        {
          "block": 12349,
          "seqIndex": 12348,
          "name": "D00596",
          "before": "0x02",
          "after": "0x03",
          "pc": "0x0059E6",
          "prevPc": "0x0059DA"
        },
        {
          "block": 12436,
          "seqIndex": 12435,
          "name": "D00596",
          "before": "0x03",
          "after": "0x04",
          "pc": "0x0059E6",
          "prevPc": "0x0059DA"
        },
        {
          "block": 12523,
          "seqIndex": 12522,
          "name": "D00596",
          "before": "0x04",
          "after": "0x05",
          "pc": "0x0059E6",
          "prevPc": "0x0059DA"
        },
        {
          "block": 12610,
          "seqIndex": 12609,
          "name": "D00596",
          "before": "0x05",
          "after": "0x06",
          "pc": "0x0059E6",
          "prevPc": "0x0059DA"
        },
        {
          "block": 12697,
          "seqIndex": 12696,
          "name": "D00596",
          "before": "0x06",
          "after": "0x07",
          "pc": "0x0059E6",
          "prevPc": "0x0059DA"
        },
        {
          "block": 12784,
          "seqIndex": 12783,
          "name": "D00596",
          "before": "0x07",
          "after": "0x08",
          "pc": "0x0059E6",
          "prevPc": "0x0059DA"
        },
        {
          "block": 12871,
          "seqIndex": 12870,
          "name": "D00596",
          "before": "0x08",
          "after": "0x09",
          "pc": "0x0059E6",
          "prevPc": "0x0059DA"
        }
      ]
    }
  }
}
```

No runtime, transpiler, browser-shell, decoder, peripheral, scheduler, ROM artifact, or `follow-alongs/` files were changed.


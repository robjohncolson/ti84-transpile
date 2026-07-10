# Phase 920: Browser alpha-A Cursor-Relative Field Audit

Probe: `probe-phase920-browser-alpha-a-cursor-relative-audit.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase920-browser-alpha-a-cursor-relative-audit.mjs`

Serves an observation-only in-memory copy of `browser-shell.html`, boots coldboot with Preserve Display, arms the shell ALPHA context, dispatches browser `KeyA`, and compares the result to the clean real-hardware alpha-A RAM capture. Disk browser code is not edited.

## Summary

- Probe execution: PASS (clean route).
- Capture cursor/base: 0xD1A8D0 / 0xD1A8CF; browser cursor/base: 0xD1A8CD / 0xD1A8CC; raw session delta: 3.
- Absolute OS/VAT comparison: 6 mismatches of 15: 2 exact session-layout shifts and 4 non-layout mismatches.
- Cursor-relative edit comparison: 2 mismatches of 6.
- Browser mapping under ALPHA: KeyA scan=0x27 -> internal=0x9B; KeyM scan=0x2F -> internal=0x9A.
- Key route: termination=control_pre_stop, steps=70933, control stop=0x001879, label=keya-prewipe-stop, wipes=0.
- Page errors: [].
- Adjudication: The literal browser Alpha+KeyA chord does not represent real alpha-A: it produced 0x42 while the capture has 0x41. Mapping evidence identifies KeyA as scan 0x27 / internal 0x9B, while the A-bearing KeyM route is scan 0x2F / internal 0x9A. D02A29 is also still divergent before the existing pre-wipe stop. 4 non-layout absolute mismatch(es) arise during Phase 6 after the stable-replay boundary and before the key route.

## Absolute OS-State Fields

| Field | Mode | Real alpha-A | Browser | Match | First owner / classification |
| --- | --- | --- | --- | --- | --- |
| D007CA | absolute | 0x0585E9 | 0x0585E9 | yes | - |
| D008E0 | absolute | 0xD1A86C | 0xD1A86C | yes | first write observed at pc 0x08C331 (prev -) |
| D010EF | absolute | 0xD2A841 | 0xD2A83E | NO | capture/browser session-layout delta (-3 in browser); already present before KeyA |
| D010FE | absolute | 0xD1A8CF | 0xD1A8CC | NO | capture/browser session-layout delta (-3 in browser); already present before KeyA |
| D010F4 | absolute | 0x1F | 0x1F | yes | - |
| D02587 | absolute | 0xD2A8E5 | 0xD3A854 | NO | Phase 6 first write at pc 0x082739 (prev 0x082722): 0xD2A8E2->0xD3A854 |
| D0258A | absolute | 0xD2A8E5 | 0xD3A854 | NO | Phase 6 first write at pc 0x0824D6 (prev 0x0826FD): 0xD2A8E2->0xD3A854 |
| D0258D | absolute | 0xD2A8E5 | 0xD3A854 | NO | Phase 6 first write at pc 0x0824D6 (prev 0x0826FD): 0xD2A8E2->0xD3A854 |
| D02590 | absolute | 0xD3FE81 | 0xD3FE81 | yes | - |
| D02593 | absolute | 0xD3FE81 | 0xD3FE81 | yes | - |
| D0259A | absolute | 0xD3FE81 | 0xD3FE81 | yes | - |
| D0259D | absolute | 0xD3FECD | 0xD3FECD | yes | - |
| D025A0 | absolute | 0xD2A8A7 | 0xD3A816 | NO | Phase 6 first write at pc 0x08255D (prev 0x0825DD): 0xD2A8A4->0xD3A816 |
| D025C5 | absolute | 0x0C0000 | 0x0C0000 | yes | - |
| D0301B | absolute | 0x5AA55A | 0x5AA55A | yes | - |

## Cursor-Relative Edit-Line Fields

For this one-token oracle, each side infers its own line base as `D0243A-1`. Pointer descriptors are normalized by subtracting that side's own `D0243A`; token bytes are read at cursor-relative offsets. `D02A29` remains a scalar pixel offset but is grouped with the edit-line contract.

| Field | Mode | Raw real | Raw browser | Normalized real | Normalized browser | Match | First owner / classification |
| --- | --- | --- | --- | --- | --- | --- | --- |
| D0243A cursor-from-single-token-base | cursor-relative | 0xD1A8D0 | 0xD1A8CD | 0x01 | 0x01 | yes | first write observed at pc 0x05E372 (prev 0x05E348) |
| TOKEN[cursor-1] | cursor-relative | 0x41 | 0x42 | 0x41 | 0x42 | NO | first write observed at pc 0x05E372 (prev 0x05E348) |
| TOKEN[cursor+0] | cursor-relative | 0x00 | 0x00 | 0x00 | 0x00 | yes | first write observed at pc 0x05E372 (prev 0x05E348) |
| D0243D-cursor | cursor-relative | 0xD2A841 | 0xD2A83E | 0x00FF71 | 0x00FF71 | yes | browser edit-context baseline before KeyA; no key-route writer observed |
| D02440-cursor | cursor-relative | 0xD2A841 | 0xD2A83E | 0x00FF71 | 0x00FF71 | yes | browser edit-context baseline before KeyA; no key-route writer observed |
| D02A29 cursor-pixel-offset | cursor-relative | 0x000C | 0x0000 | 0x000C | 0x0000 | NO | browser edit-context baseline before KeyA; no key-route writer observed |

## First Observed Key-Route Writes

| Field | Before | After | PC | Prev PC | Block |
| --- | --- | --- | --- | --- | --- |
| D008E0 | 0x000000 | 0xD1A86C | 0x08C331 | - | 1 |
| D0243A | 0xD1A8CC | 0xD1A8CD | 0x05E372 | 0x05E348 | 2952 |
| TOKEN_AT_ANCHOR | 0x00 | 0x42 | 0x05E372 | 0x05E348 | 2952 |

## Bounded Machine JSON

```json
{
  "pass": true,
  "cleanExecution": true,
  "alphaContext": {
    "modifierFlags": 16,
    "alphaMask": 16,
    "keyAScan": 39,
    "keyAInternal": 155,
    "keyMScan": 47,
    "keyMInternal": 154
  },
  "capture": {
    "cursor": 13740240,
    "fields": {
      "D007CA": 361961,
      "D008E0": 13740140,
      "D010EF": 13805633,
      "D010FE": 13740239,
      "D010F4": 31,
      "D02587": 13805797,
      "D0258A": 13805797,
      "D0258D": 13805797,
      "D02590": 13893249,
      "D02593": 13893249,
      "D0259A": 13893249,
      "D0259D": 13893325,
      "D025A0": 13805735,
      "D025C5": 786432,
      "D0301B": 5940570,
      "D0243A": 13740240,
      "D0243D": 13805633,
      "D02440": 13805633,
      "D02A29": 12
    },
    "cursorBytes": {
      "0": 0,
      "1": 0,
      "2": 0,
      "3": 0,
      "4": 0,
      "-4": 0,
      "-3": 0,
      "-2": 0,
      "-1": 65
    }
  },
  "afterBoot": {
    "label": "afterBoot",
    "status": "Coldboot complete. OS event loop is ready.",
    "fields": {
      "D007CA": 361961,
      "D008E0": 0,
      "D010EF": 13805630,
      "D010FE": 13740236,
      "D010F4": 31,
      "D02587": 13871188,
      "D0258A": 13871188,
      "D0258D": 13871188,
      "D02590": 13893249,
      "D02593": 13893249,
      "D0259A": 13893249,
      "D0259D": 13893325,
      "D025A0": 13871126,
      "D025C5": 786432,
      "D0301B": 5940570,
      "D0243A": 13740236,
      "D0243D": 13805630,
      "D02440": 13805630,
      "D02A29": 0
    },
    "cursor": 13740236,
    "cursorBytes": {
      "0": 0,
      "1": 0,
      "2": 0,
      "3": 0,
      "4": 0,
      "-4": 0,
      "-3": 0,
      "-2": 0,
      "-1": 0
    },
    "modifierFlags": 0,
    "stableSnapshot": {
      "D007CA": 361961,
      "D008E0": 13740134,
      "D02505": 10,
      "D02587": 13805794,
      "D0258A": 13805794,
      "D0258D": 13805794,
      "D02590": 13893249,
      "D02593": 13893249,
      "D0259A": 13893249,
      "D0259D": 13893325,
      "D025A0": 13805732,
      "D025C5": 786432,
      "D010EF": 13805630,
      "D010FE": 13740236,
      "D010F4": 31
    },
    "postReplayFields": {
      "D007CA": 361961,
      "D008E0": 13740134,
      "D010EF": 13805630,
      "D010FE": 13740236,
      "D010F4": 31,
      "D02587": 13805794,
      "D0258A": 13805794,
      "D0258D": 13805794,
      "D02590": 13893249,
      "D02593": 13893249,
      "D0259A": 13893249,
      "D0259D": 13893325,
      "D025A0": 13805732,
      "D025C5": 786432,
      "D0301B": 5940570,
      "D0243A": 0,
      "D0243D": 0,
      "D02440": 0,
      "D02A29": 0
    },
    "phase6Trace": {
      "blocks": 47243,
      "prevPc": 6581,
      "firstChanges": [
        {
          "name": "D008E0",
          "before": 13740140,
          "after": 0,
          "pc": 361132,
          "prevPc": 646314,
          "block": 18
        },
        {
          "name": "D025A0",
          "before": 13805732,
          "after": 13871126,
          "pc": 533853,
          "prevPc": 533981,
          "block": 46157
        },
        {
          "name": "D0258A",
          "before": 13805794,
          "after": 13871188,
          "pc": 533718,
          "prevPc": 534269,
          "block": 46218
        },
        {
          "name": "D0258D",
          "before": 13805794,
          "after": 13871188,
          "pc": 533718,
          "prevPc": 534269,
          "block": 46218
        },
        {
          "name": "D02587",
          "before": 13805794,
          "after": 13871188,
          "pc": 534329,
          "prevPc": 534306,
          "block": 46222
        },
        {
          "name": "D0243A",
          "before": 0,
          "after": 13740236,
          "pc": 313715,
          "prevPc": 387153,
          "block": 47235
        },
        {
          "name": "D0243D",
          "before": 0,
          "after": 13805630,
          "pc": 385966,
          "prevPc": 387169,
          "block": 47238
        },
        {
          "name": "D02440",
          "before": 0,
          "after": 13805630,
          "pc": 385966,
          "prevPc": 387169,
          "block": 47238
        }
      ],
      "lastFields": {
        "D007CA": 361961,
        "D008E0": 0,
        "D010EF": 13805630,
        "D010FE": 13740236,
        "D010F4": 31,
        "D02587": 13871188,
        "D0258A": 13871188,
        "D0258D": 13871188,
        "D02590": 13893249,
        "D02593": 13893249,
        "D0259A": 13893249,
        "D0259D": 13893325,
        "D025A0": 13871126,
        "D025C5": 786432,
        "D0301B": 5940570,
        "D0243A": 13740195,
        "D0243D": 13805589,
        "D02440": 13805630,
        "D02A29": 0
      }
    },
    "lastKey": null,
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
    "pageErrors": []
  },
  "afterKey": {
    "label": "afterKey",
    "status": "Key: APPS → 70933 steps (control_pre_stop, peak 13584px)",
    "fields": {
      "D007CA": 361961,
      "D008E0": 13740140,
      "D010EF": 13805630,
      "D010FE": 13740236,
      "D010F4": 31,
      "D02587": 13871188,
      "D0258A": 13871188,
      "D0258D": 13871188,
      "D02590": 13893249,
      "D02593": 13893249,
      "D0259A": 13893249,
      "D0259D": 13893325,
      "D025A0": 13871126,
      "D025C5": 786432,
      "D0301B": 5940570,
      "D0243A": 13740237,
      "D0243D": 13805630,
      "D02440": 13805630,
      "D02A29": 0
    },
    "cursor": 13740237,
    "cursorBytes": {
      "0": 0,
      "1": 0,
      "2": 0,
      "3": 0,
      "4": 0,
      "-4": 0,
      "-3": 0,
      "-2": 0,
      "-1": 66
    },
    "modifierFlags": 0,
    "stableSnapshot": {
      "D007CA": 361961,
      "D008E0": 13740134,
      "D02505": 10,
      "D02587": 13805794,
      "D0258A": 13805794,
      "D0258D": 13805794,
      "D02590": 13893249,
      "D02593": 13893249,
      "D0259A": 13893249,
      "D0259D": 13893325,
      "D025A0": 13805732,
      "D025C5": 786432,
      "D010EF": 13805630,
      "D010FE": 13740236,
      "D010F4": 31
    },
    "postReplayFields": {
      "D007CA": 361961,
      "D008E0": 13740134,
      "D010EF": 13805630,
      "D010FE": 13740236,
      "D010F4": 31,
      "D02587": 13805794,
      "D0258A": 13805794,
      "D0258D": 13805794,
      "D02590": 13893249,
      "D02593": 13893249,
      "D0259A": 13893249,
      "D0259D": 13893325,
      "D025A0": 13805732,
      "D025C5": 786432,
      "D0301B": 5940570,
      "D0243A": 0,
      "D0243D": 0,
      "D02440": 0,
      "D02A29": 0
    },
    "phase6Trace": {
      "blocks": 47243,
      "prevPc": 6581,
      "firstChanges": [
        {
          "name": "D008E0",
          "before": 13740140,
          "after": 0,
          "pc": 361132,
          "prevPc": 646314,
          "block": 18
        },
        {
          "name": "D025A0",
          "before": 13805732,
          "after": 13871126,
          "pc": 533853,
          "prevPc": 533981,
          "block": 46157
        },
        {
          "name": "D0258A",
          "before": 13805794,
          "after": 13871188,
          "pc": 533718,
          "prevPc": 534269,
          "block": 46218
        },
        {
          "name": "D0258D",
          "before": 13805794,
          "after": 13871188,
          "pc": 533718,
          "prevPc": 534269,
          "block": 46218
        },
        {
          "name": "D02587",
          "before": 13805794,
          "after": 13871188,
          "pc": 534329,
          "prevPc": 534306,
          "block": 46222
        },
        {
          "name": "D0243A",
          "before": 0,
          "after": 13740236,
          "pc": 313715,
          "prevPc": 387153,
          "block": 47235
        },
        {
          "name": "D0243D",
          "before": 0,
          "after": 13805630,
          "pc": 385966,
          "prevPc": 387169,
          "block": 47238
        },
        {
          "name": "D02440",
          "before": 0,
          "after": 13805630,
          "pc": 385966,
          "prevPc": 387169,
          "block": 47238
        }
      ],
      "lastFields": {
        "D007CA": 361961,
        "D008E0": 0,
        "D010EF": 13805630,
        "D010FE": 13740236,
        "D010F4": 31,
        "D02587": 13871188,
        "D0258A": 13871188,
        "D0258D": 13871188,
        "D02590": 13893249,
        "D02593": 13893249,
        "D0259A": 13893249,
        "D0259D": 13893325,
        "D025A0": 13871126,
        "D025C5": 786432,
        "D0301B": 5940570,
        "D0243A": 13740195,
        "D0243D": 13805589,
        "D02440": 13805630,
        "D02A29": 0
      }
    },
    "lastKey": {
      "code": "KeyA",
      "label": "APPS",
      "expectedInsertByte": null,
      "controlPreStopPc": 6265,
      "controlPreStopLabel": "keya-prewipe-stop",
      "cursorBefore": null,
      "insertBlock": null,
      "postInsertGateBlock": null,
      "stoppedAtPostInsertGate": false,
      "D000C2Bit7Restored": false,
      "controlStopBlock": 70897,
      "controlStopPc": 6265,
      "controlStopCursorBefore": null,
      "controlStopCursorAfter": null,
      "controlStopCursorRestored": false,
      "uiClearApplied": false,
      "uiClearResult": null,
      "stoppedBeforeControlClear": true,
      "contextVectorRestoreEnabled": false,
      "contextVectorRestored": false,
      "contextVectorRestoreBlock": null,
      "contextVectorRestorePc": null,
      "contextVectorD007CABefore": null,
      "contextVectorD007CAAfter": null,
      "postInsertFirstZeroDrain": null,
      "steps": 70933,
      "termination": "control_pre_stop",
      "wipes": 0,
      "D0243A": 13740237,
      "D0243D": 13805630,
      "D007CA": 361961,
      "D008E0": 13740140,
      "D02590": 13893249,
      "D000C2": 0,
      "buffer": [
        66,
        0,
        0,
        0,
        0,
        0,
        0,
        0
      ],
      "vramPeak": 13584,
      "vramCurrent": 13584
    },
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
    "pageErrors": []
  },
  "absoluteMismatches": [
    {
      "name": "D010EF",
      "mode": "absolute",
      "oracle": 13805633,
      "actual": 13805630,
      "match": false,
      "owner": "capture/browser session-layout delta (-3 in browser); already present before KeyA"
    },
    {
      "name": "D010FE",
      "mode": "absolute",
      "oracle": 13740239,
      "actual": 13740236,
      "match": false,
      "owner": "capture/browser session-layout delta (-3 in browser); already present before KeyA"
    },
    {
      "name": "D02587",
      "mode": "absolute",
      "oracle": 13805797,
      "actual": 13871188,
      "match": false,
      "owner": "Phase 6 first write at pc 0x082739 (prev 0x082722): 0xD2A8E2->0xD3A854"
    },
    {
      "name": "D0258A",
      "mode": "absolute",
      "oracle": 13805797,
      "actual": 13871188,
      "match": false,
      "owner": "Phase 6 first write at pc 0x0824D6 (prev 0x0826FD): 0xD2A8E2->0xD3A854"
    },
    {
      "name": "D0258D",
      "mode": "absolute",
      "oracle": 13805797,
      "actual": 13871188,
      "match": false,
      "owner": "Phase 6 first write at pc 0x0824D6 (prev 0x0826FD): 0xD2A8E2->0xD3A854"
    },
    {
      "name": "D025A0",
      "mode": "absolute",
      "oracle": 13805735,
      "actual": 13871126,
      "match": false,
      "owner": "Phase 6 first write at pc 0x08255D (prev 0x0825DD): 0xD2A8A4->0xD3A816"
    }
  ],
  "layoutAbsoluteMismatches": [
    {
      "name": "D010EF",
      "mode": "absolute",
      "oracle": 13805633,
      "actual": 13805630,
      "match": false,
      "owner": "capture/browser session-layout delta (-3 in browser); already present before KeyA"
    },
    {
      "name": "D010FE",
      "mode": "absolute",
      "oracle": 13740239,
      "actual": 13740236,
      "match": false,
      "owner": "capture/browser session-layout delta (-3 in browser); already present before KeyA"
    }
  ],
  "realAbsoluteMismatches": [
    {
      "name": "D02587",
      "mode": "absolute",
      "oracle": 13805797,
      "actual": 13871188,
      "match": false,
      "owner": "Phase 6 first write at pc 0x082739 (prev 0x082722): 0xD2A8E2->0xD3A854"
    },
    {
      "name": "D0258A",
      "mode": "absolute",
      "oracle": 13805797,
      "actual": 13871188,
      "match": false,
      "owner": "Phase 6 first write at pc 0x0824D6 (prev 0x0826FD): 0xD2A8E2->0xD3A854"
    },
    {
      "name": "D0258D",
      "mode": "absolute",
      "oracle": 13805797,
      "actual": 13871188,
      "match": false,
      "owner": "Phase 6 first write at pc 0x0824D6 (prev 0x0826FD): 0xD2A8E2->0xD3A854"
    },
    {
      "name": "D025A0",
      "mode": "absolute",
      "oracle": 13805735,
      "actual": 13871126,
      "match": false,
      "owner": "Phase 6 first write at pc 0x08255D (prev 0x0825DD): 0xD2A8A4->0xD3A816"
    }
  ],
  "relativeMismatches": [
    {
      "name": "TOKEN[cursor-1]",
      "rawOracle": 65,
      "rawActual": 66,
      "oracle": 65,
      "actual": 66,
      "width": 2,
      "ownerName": "TOKEN_AT_ANCHOR",
      "mode": "cursor-relative",
      "match": false,
      "owner": "first write observed at pc 0x05E372 (prev 0x05E348)"
    },
    {
      "name": "D02A29 cursor-pixel-offset",
      "rawOracle": 12,
      "rawActual": 0,
      "oracle": 12,
      "actual": 0,
      "width": 4,
      "ownerName": "D02A29",
      "mode": "cursor-relative",
      "match": false,
      "owner": "browser edit-context baseline before KeyA; no key-route writer observed"
    }
  ],
  "firstChanges": [
    {
      "name": "D008E0",
      "before": 0,
      "after": 13740140,
      "pc": 574257,
      "prevPc": null,
      "block": 1
    },
    {
      "name": "D0243A",
      "before": 13740236,
      "after": 13740237,
      "pc": 385906,
      "prevPc": 385864,
      "block": 2952
    },
    {
      "name": "TOKEN_AT_ANCHOR",
      "before": 0,
      "after": 66,
      "pc": 385906,
      "prevPc": 385864,
      "block": 2952
    }
  ],
  "conclusion": "The literal browser Alpha+KeyA chord does not represent real alpha-A: it produced 0x42 while the capture has 0x41. Mapping evidence identifies KeyA as scan 0x27 / internal 0x9B, while the A-bearing KeyM route is scan 0x2F / internal 0x9A. D02A29 is also still divergent before the existing pre-wipe stop. 4 non-layout absolute mismatch(es) arise during Phase 6 after the stable-replay boundary and before the key route."
}
```

No runtime, transpiler, browser-shell, decoder, peripheral, scheduler, ROM artifact, or `follow-alongs/` files were changed.


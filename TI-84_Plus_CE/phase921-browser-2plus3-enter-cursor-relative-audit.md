# Phase 921: Browser 2+3 ENTER Cursor-Relative Field Audit

Probe: `probe-phase921-browser-2plus3-enter-cursor-relative-audit.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase921-browser-2plus3-enter-cursor-relative-audit.mjs`

Serves an observation-only in-memory copy of `browser-shell.html`, boots coldboot with Preserve Display, dispatches `2`, `+`, `3`, `ENTER`, and compares the final RAM state to the real-hardware compute capture. Disk browser code is not edited.

## Summary

- Probe execution: PASS (bounded negative audit).
- Real post-compute cursor/base: 0xD1A8CF; browser initial line base: 0xD1A8CC; browser post-ENTER cursor: 0x000000 (offset +3036980).
- Absolute OS/VAT comparison: 12 mismatches of 15: 2 exact session-layout shifts and 10 non-layout mismatches.
- Cursor-relative edit comparison: 6 mismatches of 8.
- First divergence: after 2 and + complete, Digit3 inserts the intended 0x33 at 0x05E372 (block 1979) but revisits the same owner at block 6377, writes an unexpected 0x31 at the next slot, and exhausts 300000 steps before 0x0158DE.
- ENTER route (downstream of that divergence): termination=max_steps, steps=300000, control stop=-, label=enter-prewipe-cursor-restore-stop, cursor restore=false.
- Page errors: [].
- Adjudication: The first browser/hardware integration divergence is before ENTER: after 2 and + complete, Digit3 inserts the intended 0x33 at 0x05E372 (block 1979) but revisits the same owner at block 6377, writes an unexpected 0x31 at the next slot, and exhausts 300000 steps before 0x0158DE. ENTER then starts from the already-divergent cursor/buffer, also exhausts 300000 steps, and never reaches its expected 0x001879 pre-stop. Therefore the 6 final cursor-relative mismatch(es) and late RAM clearing are downstream of the repeated 0x05E372 Digit3 insert owner, not evidence of a standalone ENTER owner. 10 non-layout absolute mismatch(es) were measured at the final bounded stop.

## Per-Key Route

| Key | Code | Label | Termination | Steps | Cursor | Buffer[0..3] | Control stop |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2 | Digit2 | 2 | post_insert_gate_stop | 7526 | 0xD1A8CD | 0x32 0x00 0x00 0x00 | - |
| + | NumpadAdd | + | post_insert_gate_stop | 7654 | 0xD1A8CE | 0x32 0x9E 0x00 0x00 | - |
| 3 | Digit3 | 3 | max_steps | 300000 | 0xD1A8D0 | 0x32 0x9E 0x33 0x31 | - |
| ENTER | Enter | ENTER | max_steps | 300000 | 0x000000 | 0x00 0x00 0x00 0x01 | - |

## Absolute OS-State Fields

| Field | Mode | Real 2+3 ENTER | Browser | Match | First owner / classification |
| --- | --- | --- | --- | --- | --- |
| D007CA | absolute | 0x0585E9 | 0x0585E9 | yes | - |
| D008E0 | absolute | 0xD1A86C | 0xD1A86C | yes | Phase 6 first write at pc 0x0582AC (prev 0x09DCAA): 0xD1A86C->0x000000 |
| D010EF | absolute | 0xD2A841 | 0xD2A83E | NO | capture/browser session-layout delta (-3 in browser); already present before keys |
| D010FE | absolute | 0xD1A8CF | 0xD1A8CC | NO | capture/browser session-layout delta (-3 in browser); already present before keys |
| D010F4 | absolute | 0x1F | 0x1F | yes | - |
| D02587 | absolute | 0xD2A8E5 | 0x000000 | NO | Phase 6 first write at pc 0x082739 (prev 0x082722): 0xD2A8E2->0xD3A854 |
| D0258A | absolute | 0xD2A8E5 | 0x000000 | NO | Phase 6 first write at pc 0x0824D6 (prev 0x0826FD): 0xD2A8E2->0xD3A854 |
| D0258D | absolute | 0xD2A8E5 | 0x000000 | NO | Phase 6 first write at pc 0x0824D6 (prev 0x0826FD): 0xD2A8E2->0xD3A854 |
| D02590 | absolute | 0xD3FE81 | 0x000000 | NO | ENTER first write at pc 0xD1A860 (prev 0x092263) |
| D02593 | absolute | 0xD3FE81 | 0x000000 | NO | ENTER first write at pc 0x099AFE (prev 0x09BF40) |
| D0259A | absolute | 0xD3FE81 | 0x000000 | NO | ENTER first write at pc 0xD1A860 (prev 0x092263) |
| D0259D | absolute | 0xD3FECD | 0x000000 | NO | ENTER first write at pc 0xD1A860 (prev 0x092263) |
| D025A0 | absolute | 0xD2A8A7 | 0x000000 | NO | Phase 6 first write at pc 0x08255D (prev 0x0825DD): 0xD2A8A4->0xD3A816 |
| D025C5 | absolute | 0x0C0000 | 0x000000 | NO | ENTER first write at pc 0xD1A860 (prev 0x092263) |
| D0301B | absolute | 0x5AA55A | 0x000000 | NO | ENTER first write at pc 0xD1A860 (prev 0x092263) |

## Cursor-Relative Edit-Line Fields

The real post-compute capture has an empty line, so its own `D0243A` is the line base. The browser line base is its pre-sequence `D0243A`. Cursor displacement is normalized from those per-side bases; token bytes are compared at offsets from each side's final cursor; descriptor pointers are normalized by subtracting each side's final cursor. Because the browser first diverges during Digit3, final ENTER mismatches below are downstream measurements, not independent ENTER owners.

| Field | Mode | Raw real | Raw browser | Normalized real | Normalized browser | Match | First owner / classification |
| --- | --- | --- | --- | --- | --- | --- | --- |
| D0243A cursor-from-line-base | cursor-relative | 0xD1A8CF | 0x000000 | 0x000000 | 0x2E5734 | NO | Digit3 repeated insert owner at pc 0x05E372 (prev 0x05E348, block 6377) wrote 0x31 after the intended 0x33; final browser cursor offset is +3036980 |
| TOKEN[cursor-3] | cursor-relative | 0x00 | 0x40 | 0x00 | 0x40 | NO | Digit3 repeated insert owner at pc 0x05E372 (prev 0x05E348, block 6377) wrote 0x31 after the intended 0x33; final byte is downstream damage |
| TOKEN[cursor-2] | cursor-relative | 0x00 | 0xD1 | 0x00 | 0xD1 | NO | Digit3 repeated insert owner at pc 0x05E372 (prev 0x05E348, block 6377) wrote 0x31 after the intended 0x33; final byte is downstream damage |
| TOKEN[cursor-1] | cursor-relative | 0x00 | 0x00 | 0x00 | 0x00 | yes | - |
| TOKEN[cursor+0] | cursor-relative | 0x00 | 0xF3 | 0x00 | 0xF3 | NO | Digit3 repeated insert owner at pc 0x05E372 (prev 0x05E348, block 6377) wrote 0x31 after the intended 0x33; final byte is downstream damage |
| D0243D-cursor | cursor-relative | 0xD2A841 | 0x000000 | 0x00FF72 | 0x000000 | NO | Digit3 repeated insert owner at pc 0x05E372 (prev 0x05E348, block 6377) wrote 0x31 after the intended 0x33; descriptor state is downstream of the repeated insert |
| D02440-cursor | cursor-relative | 0xD2A841 | 0x000000 | 0x00FF72 | 0x000000 | NO | Digit3 repeated insert owner at pc 0x05E372 (prev 0x05E348, block 6377) wrote 0x31 after the intended 0x33; descriptor state is downstream of the repeated insert |
| D02A29 cursor-pixel-offset | cursor-relative | 0x0000 | 0x0000 | 0x0000 | 0x0000 | yes | - |

## First Observed ENTER-Route Writes

| Field | Before | After | PC | Prev PC | Block |
| --- | --- | --- | --- | --- | --- |
| D025A0 | 0xD3A816 | 0xD2A8A8 | 0x08255D | 0x0825DD | 1666 |
| D0258A | 0xD3A854 | 0xD2A8E6 | 0x0824D6 | 0x0826FD | 1873 |
| D0258D | 0xD3A854 | 0xD2A8E6 | 0x0824D6 | 0x0826FD | 1873 |
| D02587 | 0xD3A854 | 0xD2A8E6 | 0x082739 | 0x082722 | 1879 |
| D0243A | 0xD1A8D0 | 0xD1A8A1 | 0x04C973 | 0x05E851 | 10898 |
| D0243D | 0xD2A83E | 0xD2A83C | 0x05868F | 0x05E861 | 10901 |
| D02440 | 0xD2A83E | 0xD2A83C | 0x05868F | 0x05E861 | 10901 |
| D02593 | 0xD3FE81 | 0xD3FE80 | 0x099AFE | 0x09BF40 | 16893 |
| D008E0 | 0xD1A86C | 0xD1A83F | 0x08377D | 0x061DEF | 18106 |
| D02590 | 0xD3FE81 | 0x000000 | 0xD1A860 | 0x092263 | 20504 |
| D0259A | 0xD3FE81 | 0x000000 | 0xD1A860 | 0x092263 | 20504 |
| D0259D | 0xD3FECD | 0x000000 | 0xD1A860 | 0x092263 | 20504 |
| D025C5 | 0x0C0000 | 0x000000 | 0xD1A860 | 0x092263 | 20504 |
| D0301B | 0x5AA55A | 0x000000 | 0xD1A860 | 0x092263 | 20504 |
| TOKEN_BASE_0 | 0x32 | 0x00 | 0xD1A860 | 0x092263 | 20504 |
| TOKEN_BASE_1 | 0x9E | 0x00 | 0xD1A860 | 0x092263 | 20504 |
| TOKEN_BASE_2 | 0x33 | 0x00 | 0xD1A860 | 0x092263 | 20504 |
| TOKEN_BASE_3 | 0x31 | 0x01 | 0xD1A860 | 0x092263 | 20504 |
| TOKEN_BASE_5 | 0x00 | 0x01 | 0xD1A860 | 0x092263 | 20504 |

## Bounded Machine JSON

```json
{
  "pass": true,
  "cleanExecution": true,
  "capture": {
    "cursor": 13740239,
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
      "D0243A": 13740239,
      "D0243D": 13805633,
      "D02440": 13805633,
      "D02A29": 0
    },
    "cursorBytes": {
      "0": 0,
      "1": 0,
      "2": 0,
      "3": 0,
      "4": 0,
      "5": 0,
      "6": 0,
      "7": 0,
      "8": 0,
      "-8": 0,
      "-7": 0,
      "-6": 0,
      "-5": 0,
      "-4": 0,
      "-3": 0,
      "-2": 0,
      "-1": 0
    }
  },
  "afterBoot": {
    "cursor": 13740236,
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
    }
  },
  "keyRuns": [
    {
      "keySpec": {
        "code": "Digit2",
        "key": "2",
        "vk": 50,
        "label": "2"
      },
      "lastKey": {
        "code": "Digit2",
        "label": "2",
        "expectedInsertByte": 50,
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
        "postInsertFirstZeroDrain": {
          "ok": true,
          "stopKind": "first_zero_handoff",
          "stopPc": 260528,
          "guardPc": null,
          "stopD0058B": 0,
          "blockCount": 2165,
          "steps": 2171,
          "termination": "first_zero_handoff",
          "lastPc": 574257,
          "lastMode": "adl",
          "wipes": 0,
          "D007CA": 361961,
          "D0243A": 13740237,
          "token": 50
        },
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
          50,
          0,
          0,
          0,
          0,
          0,
          0,
          0
        ],
        "vramPeak": 8687,
        "vramCurrent": 8687
      },
      "cursor": 13740237,
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
          "block": 2908
        },
        {
          "name": "TOKEN_BASE_0",
          "before": 0,
          "after": 50,
          "pc": 385906,
          "prevPc": 385864,
          "block": 2908
        }
      ]
    },
    {
      "keySpec": {
        "code": "NumpadAdd",
        "key": "+",
        "vk": 107,
        "label": "+"
      },
      "lastKey": {
        "code": "NumpadAdd",
        "label": "+",
        "expectedInsertByte": 158,
        "controlPreStopPc": null,
        "controlPreStopLabel": null,
        "cursorBefore": 13740237,
        "insertBlock": 1982,
        "postInsertGateBlock": 7650,
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
        "postInsertFirstZeroDrain": {
          "ok": true,
          "stopKind": "first_zero_handoff",
          "stopPc": 260528,
          "guardPc": null,
          "stopD0058B": 0,
          "blockCount": 2751,
          "steps": 2757,
          "termination": "first_zero_handoff",
          "lastPc": 574257,
          "lastMode": "adl",
          "wipes": 0,
          "D007CA": 361961,
          "D0243A": 13740238,
          "token": 50
        },
        "steps": 7654,
        "termination": "post_insert_gate_stop",
        "wipes": 0,
        "D0243A": 13740238,
        "D0243D": 13805630,
        "D007CA": 361961,
        "D008E0": 13740140,
        "D02590": 13893249,
        "D000C2": 0,
        "buffer": [
          50,
          158,
          0,
          0,
          0,
          0,
          0,
          0
        ],
        "vramPeak": 8791,
        "vramCurrent": 8969
      },
      "cursor": 13740238,
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
        "D0243A": 13740238,
        "D0243D": 13805630,
        "D02440": 13805630,
        "D02A29": 0
      },
      "firstChanges": [
        {
          "name": "D0243A",
          "before": 13740237,
          "after": 13740238,
          "pc": 385906,
          "prevPc": 385864,
          "block": 1982
        },
        {
          "name": "TOKEN_BASE_1",
          "before": 0,
          "after": 158,
          "pc": 385906,
          "prevPc": 385864,
          "block": 1982
        }
      ]
    },
    {
      "keySpec": {
        "code": "Digit3",
        "key": "3",
        "vk": 51,
        "label": "3"
      },
      "lastKey": {
        "code": "Digit3",
        "label": "3",
        "expectedInsertByte": 51,
        "controlPreStopPc": null,
        "controlPreStopLabel": null,
        "cursorBefore": 13740238,
        "insertBlock": 1979,
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
        "postInsertFirstZeroDrain": null,
        "steps": 300000,
        "termination": "max_steps",
        "wipes": 0,
        "D0243A": 13740240,
        "D0243D": 13805630,
        "D007CA": 361961,
        "D008E0": 13740140,
        "D02590": 13893249,
        "D000C2": 0,
        "buffer": [
          50,
          158,
          51,
          49,
          0,
          0,
          0,
          0
        ],
        "vramPeak": 9083,
        "vramCurrent": 8979
      },
      "cursor": 13740240,
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
        "D0243A": 13740240,
        "D0243D": 13805630,
        "D02440": 13805630,
        "D02A29": 0
      },
      "firstChanges": [
        {
          "name": "D0243A",
          "before": 13740238,
          "after": 13740239,
          "pc": 385906,
          "prevPc": 385864,
          "block": 1979
        },
        {
          "name": "TOKEN_BASE_2",
          "before": 0,
          "after": 51,
          "pc": 385906,
          "prevPc": 385864,
          "block": 1979
        },
        {
          "name": "TOKEN_BASE_3",
          "before": 0,
          "after": 49,
          "pc": 385906,
          "prevPc": 385864,
          "block": 6377
        }
      ]
    },
    {
      "keySpec": {
        "code": "Enter",
        "key": "Enter",
        "vk": 13,
        "label": "ENTER"
      },
      "lastKey": {
        "code": "Enter",
        "label": "ENTER",
        "expectedInsertByte": null,
        "controlPreStopPc": 6265,
        "controlPreStopLabel": "enter-prewipe-cursor-restore-stop",
        "cursorBefore": 13740240,
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
        "postInsertFirstZeroDrain": null,
        "steps": 300000,
        "termination": "max_steps",
        "wipes": 0,
        "D0243A": 0,
        "D0243D": 0,
        "D007CA": 361961,
        "D008E0": 13740140,
        "D02590": 0,
        "D000C2": 0,
        "buffer": [
          0,
          0,
          0,
          1,
          0,
          1,
          0,
          0
        ],
        "vramPeak": 9026,
        "vramCurrent": 8529
      },
      "cursor": 0,
      "fields": {
        "D007CA": 361961,
        "D008E0": 13740140,
        "D010EF": 13805630,
        "D010FE": 13740236,
        "D010F4": 31,
        "D02587": 0,
        "D0258A": 0,
        "D0258D": 0,
        "D02590": 0,
        "D02593": 0,
        "D0259A": 0,
        "D0259D": 0,
        "D025A0": 0,
        "D025C5": 0,
        "D0301B": 0,
        "D0243A": 0,
        "D0243D": 0,
        "D02440": 0,
        "D02A29": 0
      },
      "firstChanges": [
        {
          "name": "D025A0",
          "before": 13871126,
          "after": 13805736,
          "pc": 533853,
          "prevPc": 533981,
          "block": 1666
        },
        {
          "name": "D0258A",
          "before": 13871188,
          "after": 13805798,
          "pc": 533718,
          "prevPc": 534269,
          "block": 1873
        },
        {
          "name": "D0258D",
          "before": 13871188,
          "after": 13805798,
          "pc": 533718,
          "prevPc": 534269,
          "block": 1873
        },
        {
          "name": "D02587",
          "before": 13871188,
          "after": 13805798,
          "pc": 534329,
          "prevPc": 534306,
          "block": 1879
        },
        {
          "name": "D0243A",
          "before": 13740240,
          "after": 13740193,
          "pc": 313715,
          "prevPc": 387153,
          "block": 10898
        },
        {
          "name": "D0243D",
          "before": 13805630,
          "after": 13805628,
          "pc": 362127,
          "prevPc": 387169,
          "block": 10901
        },
        {
          "name": "D02440",
          "before": 13805630,
          "after": 13805628,
          "pc": 362127,
          "prevPc": 387169,
          "block": 10901
        },
        {
          "name": "D02593",
          "before": 13893249,
          "after": 13893248,
          "pc": 629502,
          "prevPc": 638784,
          "block": 16893
        },
        {
          "name": "D008E0",
          "before": 13740140,
          "after": 13740095,
          "pc": 538493,
          "prevPc": 400879,
          "block": 18106
        },
        {
          "name": "D02590",
          "before": 13893249,
          "after": 0,
          "pc": 13740128,
          "prevPc": 598627,
          "block": 20504
        },
        {
          "name": "D0259A",
          "before": 13893249,
          "after": 0,
          "pc": 13740128,
          "prevPc": 598627,
          "block": 20504
        },
        {
          "name": "D0259D",
          "before": 13893325,
          "after": 0,
          "pc": 13740128,
          "prevPc": 598627,
          "block": 20504
        },
        {
          "name": "D025C5",
          "before": 786432,
          "after": 0,
          "pc": 13740128,
          "prevPc": 598627,
          "block": 20504
        },
        {
          "name": "D0301B",
          "before": 5940570,
          "after": 0,
          "pc": 13740128,
          "prevPc": 598627,
          "block": 20504
        },
        {
          "name": "TOKEN_BASE_0",
          "before": 50,
          "after": 0,
          "pc": 13740128,
          "prevPc": 598627,
          "block": 20504
        },
        {
          "name": "TOKEN_BASE_1",
          "before": 158,
          "after": 0,
          "pc": 13740128,
          "prevPc": 598627,
          "block": 20504
        },
        {
          "name": "TOKEN_BASE_2",
          "before": 51,
          "after": 0,
          "pc": 13740128,
          "prevPc": 598627,
          "block": 20504
        },
        {
          "name": "TOKEN_BASE_3",
          "before": 49,
          "after": 1,
          "pc": 13740128,
          "prevPc": 598627,
          "block": 20504
        },
        {
          "name": "TOKEN_BASE_5",
          "before": 0,
          "after": 1,
          "pc": 13740128,
          "prevPc": 598627,
          "block": 20504
        }
      ]
    }
  ],
  "absoluteMismatches": [
    {
      "name": "D010EF",
      "mode": "absolute",
      "oracle": 13805633,
      "actual": 13805630,
      "match": false,
      "owner": "capture/browser session-layout delta (-3 in browser); already present before keys"
    },
    {
      "name": "D010FE",
      "mode": "absolute",
      "oracle": 13740239,
      "actual": 13740236,
      "match": false,
      "owner": "capture/browser session-layout delta (-3 in browser); already present before keys"
    },
    {
      "name": "D02587",
      "mode": "absolute",
      "oracle": 13805797,
      "actual": 0,
      "match": false,
      "owner": "Phase 6 first write at pc 0x082739 (prev 0x082722): 0xD2A8E2->0xD3A854"
    },
    {
      "name": "D0258A",
      "mode": "absolute",
      "oracle": 13805797,
      "actual": 0,
      "match": false,
      "owner": "Phase 6 first write at pc 0x0824D6 (prev 0x0826FD): 0xD2A8E2->0xD3A854"
    },
    {
      "name": "D0258D",
      "mode": "absolute",
      "oracle": 13805797,
      "actual": 0,
      "match": false,
      "owner": "Phase 6 first write at pc 0x0824D6 (prev 0x0826FD): 0xD2A8E2->0xD3A854"
    },
    {
      "name": "D02590",
      "mode": "absolute",
      "oracle": 13893249,
      "actual": 0,
      "match": false,
      "owner": "ENTER first write at pc 0xD1A860 (prev 0x092263)"
    },
    {
      "name": "D02593",
      "mode": "absolute",
      "oracle": 13893249,
      "actual": 0,
      "match": false,
      "owner": "ENTER first write at pc 0x099AFE (prev 0x09BF40)"
    },
    {
      "name": "D0259A",
      "mode": "absolute",
      "oracle": 13893249,
      "actual": 0,
      "match": false,
      "owner": "ENTER first write at pc 0xD1A860 (prev 0x092263)"
    },
    {
      "name": "D0259D",
      "mode": "absolute",
      "oracle": 13893325,
      "actual": 0,
      "match": false,
      "owner": "ENTER first write at pc 0xD1A860 (prev 0x092263)"
    },
    {
      "name": "D025A0",
      "mode": "absolute",
      "oracle": 13805735,
      "actual": 0,
      "match": false,
      "owner": "Phase 6 first write at pc 0x08255D (prev 0x0825DD): 0xD2A8A4->0xD3A816"
    },
    {
      "name": "D025C5",
      "mode": "absolute",
      "oracle": 786432,
      "actual": 0,
      "match": false,
      "owner": "ENTER first write at pc 0xD1A860 (prev 0x092263)"
    },
    {
      "name": "D0301B",
      "mode": "absolute",
      "oracle": 5940570,
      "actual": 0,
      "match": false,
      "owner": "ENTER first write at pc 0xD1A860 (prev 0x092263)"
    }
  ],
  "layoutAbsoluteMismatches": [
    {
      "name": "D010EF",
      "mode": "absolute",
      "oracle": 13805633,
      "actual": 13805630,
      "match": false,
      "owner": "capture/browser session-layout delta (-3 in browser); already present before keys"
    },
    {
      "name": "D010FE",
      "mode": "absolute",
      "oracle": 13740239,
      "actual": 13740236,
      "match": false,
      "owner": "capture/browser session-layout delta (-3 in browser); already present before keys"
    }
  ],
  "realAbsoluteMismatches": [
    {
      "name": "D02587",
      "mode": "absolute",
      "oracle": 13805797,
      "actual": 0,
      "match": false,
      "owner": "Phase 6 first write at pc 0x082739 (prev 0x082722): 0xD2A8E2->0xD3A854"
    },
    {
      "name": "D0258A",
      "mode": "absolute",
      "oracle": 13805797,
      "actual": 0,
      "match": false,
      "owner": "Phase 6 first write at pc 0x0824D6 (prev 0x0826FD): 0xD2A8E2->0xD3A854"
    },
    {
      "name": "D0258D",
      "mode": "absolute",
      "oracle": 13805797,
      "actual": 0,
      "match": false,
      "owner": "Phase 6 first write at pc 0x0824D6 (prev 0x0826FD): 0xD2A8E2->0xD3A854"
    },
    {
      "name": "D02590",
      "mode": "absolute",
      "oracle": 13893249,
      "actual": 0,
      "match": false,
      "owner": "ENTER first write at pc 0xD1A860 (prev 0x092263)"
    },
    {
      "name": "D02593",
      "mode": "absolute",
      "oracle": 13893249,
      "actual": 0,
      "match": false,
      "owner": "ENTER first write at pc 0x099AFE (prev 0x09BF40)"
    },
    {
      "name": "D0259A",
      "mode": "absolute",
      "oracle": 13893249,
      "actual": 0,
      "match": false,
      "owner": "ENTER first write at pc 0xD1A860 (prev 0x092263)"
    },
    {
      "name": "D0259D",
      "mode": "absolute",
      "oracle": 13893325,
      "actual": 0,
      "match": false,
      "owner": "ENTER first write at pc 0xD1A860 (prev 0x092263)"
    },
    {
      "name": "D025A0",
      "mode": "absolute",
      "oracle": 13805735,
      "actual": 0,
      "match": false,
      "owner": "Phase 6 first write at pc 0x08255D (prev 0x0825DD): 0xD2A8A4->0xD3A816"
    },
    {
      "name": "D025C5",
      "mode": "absolute",
      "oracle": 786432,
      "actual": 0,
      "match": false,
      "owner": "ENTER first write at pc 0xD1A860 (prev 0x092263)"
    },
    {
      "name": "D0301B",
      "mode": "absolute",
      "oracle": 5940570,
      "actual": 0,
      "match": false,
      "owner": "ENTER first write at pc 0xD1A860 (prev 0x092263)"
    }
  ],
  "relativeMismatches": [
    {
      "name": "D0243A cursor-from-line-base",
      "rawOracle": 13740239,
      "rawActual": 0,
      "oracle": 0,
      "actual": 3036980,
      "width": 6,
      "ownerName": "D0243A",
      "owner": "Digit3 repeated insert owner at pc 0x05E372 (prev 0x05E348, block 6377) wrote 0x31 after the intended 0x33; final browser cursor offset is +3036980",
      "mode": "cursor-relative",
      "match": false
    },
    {
      "name": "TOKEN[cursor-3]",
      "rawOracle": 0,
      "rawActual": 64,
      "oracle": 0,
      "actual": 64,
      "width": 2,
      "ownerName": null,
      "owner": "Digit3 repeated insert owner at pc 0x05E372 (prev 0x05E348, block 6377) wrote 0x31 after the intended 0x33; final byte is downstream damage",
      "mode": "cursor-relative",
      "match": false
    },
    {
      "name": "TOKEN[cursor-2]",
      "rawOracle": 0,
      "rawActual": 209,
      "oracle": 0,
      "actual": 209,
      "width": 2,
      "ownerName": null,
      "owner": "Digit3 repeated insert owner at pc 0x05E372 (prev 0x05E348, block 6377) wrote 0x31 after the intended 0x33; final byte is downstream damage",
      "mode": "cursor-relative",
      "match": false
    },
    {
      "name": "TOKEN[cursor+0]",
      "rawOracle": 0,
      "rawActual": 243,
      "oracle": 0,
      "actual": 243,
      "width": 2,
      "ownerName": null,
      "owner": "Digit3 repeated insert owner at pc 0x05E372 (prev 0x05E348, block 6377) wrote 0x31 after the intended 0x33; final byte is downstream damage",
      "mode": "cursor-relative",
      "match": false
    },
    {
      "name": "D0243D-cursor",
      "rawOracle": 13805633,
      "rawActual": 0,
      "oracle": 65394,
      "actual": 0,
      "width": 6,
      "ownerName": "D0243D",
      "owner": "Digit3 repeated insert owner at pc 0x05E372 (prev 0x05E348, block 6377) wrote 0x31 after the intended 0x33; descriptor state is downstream of the repeated insert",
      "mode": "cursor-relative",
      "match": false
    },
    {
      "name": "D02440-cursor",
      "rawOracle": 13805633,
      "rawActual": 0,
      "oracle": 65394,
      "actual": 0,
      "width": 6,
      "ownerName": "D02440",
      "owner": "Digit3 repeated insert owner at pc 0x05E372 (prev 0x05E348, block 6377) wrote 0x31 after the intended 0x33; descriptor state is downstream of the repeated insert",
      "mode": "cursor-relative",
      "match": false
    }
  ],
  "firstDivergence": "after 2 and + complete, Digit3 inserts the intended 0x33 at 0x05E372 (block 1979) but revisits the same owner at block 6377, writes an unexpected 0x31 at the next slot, and exhausts 300000 steps before 0x0158DE",
  "conclusion": "The first browser/hardware integration divergence is before ENTER: after 2 and + complete, Digit3 inserts the intended 0x33 at 0x05E372 (block 1979) but revisits the same owner at block 6377, writes an unexpected 0x31 at the next slot, and exhausts 300000 steps before 0x0158DE. ENTER then starts from the already-divergent cursor/buffer, also exhausts 300000 steps, and never reaches its expected 0x001879 pre-stop. Therefore the 6 final cursor-relative mismatch(es) and late RAM clearing are downstream of the repeated 0x05E372 Digit3 insert owner, not evidence of a standalone ENTER owner. 10 non-layout absolute mismatch(es) were measured at the final bounded stop."
}
```

No runtime, transpiler, browser-shell, decoder, peripheral, scheduler, ROM artifact, or `follow-alongs/` files were changed.


# Phase 922: Browser 123 LEFT Cursor-Relative Field Audit

Probe: `probe-phase922-browser-123-left-cursor-relative-audit.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase922-browser-123-left-cursor-relative-audit.mjs`

Serves an observation-only in-memory copy of `browser-shell.html`, boots coldboot with Preserve Display, dispatches `1`, `2`, `3`, `ArrowLeft`, and compares the final RAM state to the clean real-hardware left-arrow capture. Disk browser code is not edited.

## Summary

- Probe execution: PASS (bounded audit).
- Real cursor/base: 0xD1A8D1 / 0xD1A8CF; browser final cursor/base: 0xD1A8D1 / 0xD1A8CC; normalized offsets: real +2, browser +5.
- Absolute OS/VAT comparison: 6 mismatches of 15: 2 exact session-layout shifts and 4 non-layout mismatches.
- Cursor-relative edit comparison: 7 mismatches of 9.
- First divergence: before LEFT: after 1 and 2 complete, Digit3 writes intended 0x33 at pc 0x05E372 (prev 0x05E348, block 1931), revisits the same owner at block 5810, writes unexpected 0x31, advances the cursor twice, and exhausts 300000 steps before the post-insert gate.
- LEFT route: termination=max_steps, steps=300000, control stop=-, label=arrow-left-prewipe-vector-restore-stop, cursor before key=0xD1A8D0, before restore=-, after restore=-, restored=false.
- Page errors: [].
- Adjudication: Digit1 and Digit2 are faithful, but Digit3 repeats insert owner 0x05E372, appends 0x31, and max-steps before LEFT. ArrowLeft therefore starts from base+4 instead of the clean base+3; it initially decrements cursor and D0243D by one at 0x05E453, then later writes unexpected 0x84 at 0x05E372 and max-steps without reaching 0x001879. The clean hardware left-arrow fidelity cannot be isolated until the pre-LEFT Digit3 owner is fixed. 7 relative mismatch(es) and 4 non-layout absolute mismatch(es) were measured.

## Per-Key Route

| Key | Code | Label | Termination | Steps | Cursor | Buffer[0..3] | Control stop |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Digit1 | 1 | post_insert_gate_stop | 7526 | 0xD1A8CD | 0x31 0x00 0x00 0x00 | - |
| 2 | Digit2 | 2 | post_insert_gate_stop | 4824 | 0xD1A8CE | 0x31 0x32 0x00 0x00 | - |
| 3 | Digit3 | 3 | max_steps | 300000 | 0xD1A8D0 | 0x31 0x32 0x33 0x31 | - |
| LEFT | ArrowLeft | LEFT | max_steps | 300000 | 0xD1A8D1 | 0x31 0x32 0x33 0x31 | - |

## Absolute OS-State Fields

| Field | Mode | Real 123 LEFT | Browser | Match | First owner / classification |
| --- | --- | --- | --- | --- | --- |
| D007CA | absolute | 0x0585E9 | 0x0585E9 | yes | LEFT first write at pc 0x06C764 (prev 0x08C782) |
| D008E0 | absolute | 0xD1A86C | 0xD1A86C | yes | Phase 6 first write at pc 0x0582AC (prev 0x09DCAA): 0xD1A86C->0x000000 |
| D010EF | absolute | 0xD2A841 | 0xD2A83E | NO | capture/browser session-layout delta (-3 in browser); already present before keys |
| D010FE | absolute | 0xD1A8CF | 0xD1A8CC | NO | capture/browser session-layout delta (-3 in browser); already present before keys |
| D010F4 | absolute | 0x1F | 0x1F | yes | - |
| D02587 | absolute | 0xD2A8E5 | 0xD2A8E6 | NO | Phase 6 first write at pc 0x082739 (prev 0x082722): 0xD2A8E2->0xD3A854 |
| D0258A | absolute | 0xD2A8E5 | 0xD2A8E6 | NO | Phase 6 first write at pc 0x0824D6 (prev 0x0826FD): 0xD2A8E2->0xD3A854 |
| D0258D | absolute | 0xD2A8E5 | 0xD2A8E6 | NO | Phase 6 first write at pc 0x0824D6 (prev 0x0826FD): 0xD2A8E2->0xD3A854 |
| D02590 | absolute | 0xD3FE81 | 0xD3FE81 | yes | - |
| D02593 | absolute | 0xD3FE81 | 0xD3FE81 | yes | - |
| D0259A | absolute | 0xD3FE81 | 0xD3FE81 | yes | - |
| D0259D | absolute | 0xD3FECD | 0xD3FECD | yes | - |
| D025A0 | absolute | 0xD2A8A7 | 0xD2A8A8 | NO | Phase 6 first write at pc 0x08255D (prev 0x0825DD): 0xD2A8A4->0xD3A816 |
| D025C5 | absolute | 0x0C0000 | 0x0C0000 | yes | - |
| D0301B | absolute | 0x5AA55A | 0x5AA55A | yes | - |

## Cursor-Relative Edit-Line Fields

The real capture cursor is two bytes after its session-specific line base (between `2` and `3`); the browser line base is its pre-sequence `D0243A`. Cursor displacement is normalized from those per-side bases, token bytes are compared at offsets from each side's final cursor, and descriptor pointers are normalized by subtracting each side's final cursor.

| Field | Mode | Raw real | Raw browser | Normalized real | Normalized browser | Match | First owner / classification |
| --- | --- | --- | --- | --- | --- | --- | --- |
| D0243A cursor-from-line-base | cursor-relative | 0xD1A8D1 | 0xD1A8D1 | 0x000002 | 0x000005 | NO | pre-LEFT input divergence: after 1 and 2 complete, Digit3 writes intended 0x33 at pc 0x05E372 (prev 0x05E348, block 1931), revisits the same owner at block 5810, writes unexpected 0x31, advances the cursor twice, and exhausts 300000 steps before the post-insert gate; final browser cursor offset is +5 |
| TOKEN[cursor-3] | cursor-relative | 0x00 | 0x33 | 0x00 | 0x33 | NO | pre-LEFT input divergence: after 1 and 2 complete, Digit3 writes intended 0x33 at pc 0x05E372 (prev 0x05E348, block 1931), revisits the same owner at block 5810, writes unexpected 0x31, advances the cursor twice, and exhausts 300000 steps before the post-insert gate; compared byte was first written by 3 at pc 0x05E372 (prev 0x05E348) |
| TOKEN[cursor-2] | cursor-relative | 0x31 | 0x31 | 0x31 | 0x31 | yes | - |
| TOKEN[cursor-1] | cursor-relative | 0x32 | 0x84 | 0x32 | 0x84 | NO | pre-LEFT input divergence: after 1 and 2 complete, Digit3 writes intended 0x33 at pc 0x05E372 (prev 0x05E348, block 1931), revisits the same owner at block 5810, writes unexpected 0x31, advances the cursor twice, and exhausts 300000 steps before the post-insert gate; compared byte was first written by LEFT at pc 0x05E372 (prev 0x05E348) |
| TOKEN[cursor+0] | cursor-relative | 0x33 | 0x00 | 0x33 | 0x00 | NO | pre-LEFT input divergence: after 1 and 2 complete, Digit3 writes intended 0x33 at pc 0x05E372 (prev 0x05E348, block 1931), revisits the same owner at block 5810, writes unexpected 0x31, advances the cursor twice, and exhausts 300000 steps before the post-insert gate; no bounded token writer was observed |
| TOKEN[cursor+1] | cursor-relative | 0x00 | 0x00 | 0x00 | 0x00 | yes | - |
| D0243D-cursor | cursor-relative | 0xD2A840 | 0xD2A83E | 0x00FF6F | 0x00FF6D | NO | pre-LEFT input divergence: after 1 and 2 complete, Digit3 writes intended 0x33 at pc 0x05E372 (prev 0x05E348, block 1931), revisits the same owner at block 5810, writes unexpected 0x31, advances the cursor twice, and exhausts 300000 steps before the post-insert gate; descriptor delta differs after LEFT |
| D02440-cursor | cursor-relative | 0xD2A841 | 0xD2A83E | 0x00FF70 | 0x00FF6D | NO | pre-LEFT input divergence: after 1 and 2 complete, Digit3 writes intended 0x33 at pc 0x05E372 (prev 0x05E348, block 1931), revisits the same owner at block 5810, writes unexpected 0x31, advances the cursor twice, and exhausts 300000 steps before the post-insert gate; descriptor delta differs after LEFT |
| D02A29 cursor-pixel-offset | cursor-relative | 0x0024 | 0x0000 | 0x0024 | 0x0000 | NO | no bounded writer observed |

## First Observed ArrowLeft-Route Writes

| Field | Before | After | PC | Prev PC | Block |
| --- | --- | --- | --- | --- | --- |
| D0243A | 0xD1A8D0 | 0xD1A8CF | 0x05E453 | 0x05E26C | 1849 |
| D0243D | 0xD2A83E | 0xD2A83D | 0x05E453 | 0x05E26C | 1849 |
| D025A0 | 0xD3A816 | 0xD2A8A8 | 0x08255D | 0x0825DD | 12331 |
| D0258A | 0xD3A854 | 0xD2A8E6 | 0x0824D6 | 0x0826FD | 12688 |
| D0258D | 0xD3A854 | 0xD2A8E6 | 0x0824D6 | 0x0826FD | 12688 |
| D02587 | 0xD3A854 | 0xD2A8E6 | 0x082739 | 0x082722 | 12694 |
| D008E0 | 0xD1A86C | 0xD1A839 | 0x08377D | 0x061DEF | 18885 |
| D007CA | 0x0585E9 | 0x06C92C | 0x06C764 | 0x08C782 | 22505 |
| TOKEN_BASE_4 | 0x00 | 0x84 | 0x05E372 | 0x05E348 | 53899 |

## Bounded Machine JSON

```json
{
  "pass": true,
  "cleanExecution": true,
  "capture": {
    "cursor": 13740241,
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
      "D0243A": 13740241,
      "D0243D": 13805632,
      "D02440": 13805633,
      "D02A29": 36
    },
    "cursorBytes": {
      "0": 51,
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
      "-2": 49,
      "-1": 50
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
        "code": "Digit1",
        "key": "1",
        "vk": 49,
        "label": "1"
      },
      "lastKey": {
        "code": "Digit1",
        "label": "1",
        "expectedInsertByte": 49,
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
          "token": 49
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
          49,
          0,
          0,
          0,
          0,
          0,
          0,
          0
        ],
        "vramPeak": 8669,
        "vramCurrent": 8669
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
          "after": 49,
          "pc": 385906,
          "prevPc": 385864,
          "block": 2908
        }
      ]
    },
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
        "cursorBefore": 13740237,
        "insertBlock": 1979,
        "postInsertGateBlock": 4820,
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
          "blockCount": 2781,
          "steps": 2787,
          "termination": "first_zero_handoff",
          "lastPc": 574257,
          "lastMode": "adl",
          "wipes": 0,
          "D007CA": 361961,
          "D0243A": 13740238,
          "token": 49
        },
        "steps": 4824,
        "termination": "post_insert_gate_stop",
        "wipes": 0,
        "D0243A": 13740238,
        "D0243D": 13805630,
        "D007CA": 361961,
        "D008E0": 13740140,
        "D02590": 13893249,
        "D000C2": 0,
        "buffer": [
          49,
          50,
          0,
          0,
          0,
          0,
          0,
          0
        ],
        "vramPeak": 0,
        "vramCurrent": 8734
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
          "block": 1979
        },
        {
          "name": "TOKEN_BASE_1",
          "before": 0,
          "after": 50,
          "pc": 385906,
          "prevPc": 385864,
          "block": 1979
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
        "insertBlock": 1931,
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
          49,
          50,
          51,
          49,
          0,
          0,
          0,
          0
        ],
        "vramPeak": 8848,
        "vramCurrent": 8848
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
          "block": 1931
        },
        {
          "name": "TOKEN_BASE_2",
          "before": 0,
          "after": 51,
          "pc": 385906,
          "prevPc": 385864,
          "block": 1931
        },
        {
          "name": "TOKEN_BASE_3",
          "before": 0,
          "after": 49,
          "pc": 385906,
          "prevPc": 385864,
          "block": 5810
        }
      ]
    },
    {
      "keySpec": {
        "code": "ArrowLeft",
        "key": "ArrowLeft",
        "vk": 37,
        "label": "LEFT"
      },
      "lastKey": {
        "code": "ArrowLeft",
        "label": "LEFT",
        "expectedInsertByte": null,
        "controlPreStopPc": 6265,
        "controlPreStopLabel": "arrow-left-prewipe-vector-restore-stop",
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
        "contextVectorRestoreEnabled": true,
        "contextVectorRestored": true,
        "contextVectorRestoreBlock": 22505,
        "contextVectorRestorePc": 444260,
        "contextVectorD007CABefore": 444716,
        "contextVectorD007CAAfter": 361961,
        "postInsertFirstZeroDrain": null,
        "steps": 300000,
        "termination": "max_steps",
        "wipes": 0,
        "D0243A": 13740241,
        "D0243D": 13805630,
        "D007CA": 361961,
        "D008E0": 13740140,
        "D02590": 13893249,
        "D000C2": 0,
        "buffer": [
          49,
          50,
          51,
          49,
          132,
          0,
          0,
          0
        ],
        "vramPeak": 8845,
        "vramCurrent": 8845
      },
      "cursor": 13740241,
      "fields": {
        "D007CA": 361961,
        "D008E0": 13740140,
        "D010EF": 13805630,
        "D010FE": 13740236,
        "D010F4": 31,
        "D02587": 13805798,
        "D0258A": 13805798,
        "D0258D": 13805798,
        "D02590": 13893249,
        "D02593": 13893249,
        "D0259A": 13893249,
        "D0259D": 13893325,
        "D025A0": 13805736,
        "D025C5": 786432,
        "D0301B": 5940570,
        "D0243A": 13740241,
        "D0243D": 13805630,
        "D02440": 13805630,
        "D02A29": 0
      },
      "firstChanges": [
        {
          "name": "D0243A",
          "before": 13740240,
          "after": 13740239,
          "pc": 386131,
          "prevPc": 385644,
          "block": 1849
        },
        {
          "name": "D0243D",
          "before": 13805630,
          "after": 13805629,
          "pc": 386131,
          "prevPc": 385644,
          "block": 1849
        },
        {
          "name": "D025A0",
          "before": 13871126,
          "after": 13805736,
          "pc": 533853,
          "prevPc": 533981,
          "block": 12331
        },
        {
          "name": "D0258A",
          "before": 13871188,
          "after": 13805798,
          "pc": 533718,
          "prevPc": 534269,
          "block": 12688
        },
        {
          "name": "D0258D",
          "before": 13871188,
          "after": 13805798,
          "pc": 533718,
          "prevPc": 534269,
          "block": 12688
        },
        {
          "name": "D02587",
          "before": 13871188,
          "after": 13805798,
          "pc": 534329,
          "prevPc": 534306,
          "block": 12694
        },
        {
          "name": "D008E0",
          "before": 13740140,
          "after": 13740089,
          "pc": 538493,
          "prevPc": 400879,
          "block": 18885
        },
        {
          "name": "D007CA",
          "before": 361961,
          "after": 444716,
          "pc": 444260,
          "prevPc": 575362,
          "block": 22505
        },
        {
          "name": "TOKEN_BASE_4",
          "before": 0,
          "after": 132,
          "pc": 385906,
          "prevPc": 385864,
          "block": 53899
        }
      ]
    }
  ],
  "leftAnalysis": {
    "browserLineBase": 13740236,
    "preLeftCursor": 13740240,
    "cleanSequencePreLeftCursor": 13740239,
    "expectedLeftCursor": 13740238,
    "finalCursor": 13740241,
    "startedFromPreLeftDivergence": true,
    "reachedControlPreStop": false,
    "firstObservedCursorChange": {
      "name": "D0243A",
      "before": 13740240,
      "after": 13740239,
      "pc": 386131,
      "prevPc": 385644,
      "block": 1849
    },
    "firstObservedDescriptorChange": {
      "name": "D0243D",
      "before": 13805630,
      "after": 13805629,
      "pc": 386131,
      "prevPc": 385644,
      "block": 1849
    },
    "initialOneByteLeftMove": true,
    "lateUnexpectedInsert": {
      "name": "TOKEN_BASE_4",
      "before": 0,
      "after": 132,
      "pc": 385906,
      "prevPc": 385864,
      "block": 53899
    }
  },
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
      "actual": 13805798,
      "match": false,
      "owner": "Phase 6 first write at pc 0x082739 (prev 0x082722): 0xD2A8E2->0xD3A854"
    },
    {
      "name": "D0258A",
      "mode": "absolute",
      "oracle": 13805797,
      "actual": 13805798,
      "match": false,
      "owner": "Phase 6 first write at pc 0x0824D6 (prev 0x0826FD): 0xD2A8E2->0xD3A854"
    },
    {
      "name": "D0258D",
      "mode": "absolute",
      "oracle": 13805797,
      "actual": 13805798,
      "match": false,
      "owner": "Phase 6 first write at pc 0x0824D6 (prev 0x0826FD): 0xD2A8E2->0xD3A854"
    },
    {
      "name": "D025A0",
      "mode": "absolute",
      "oracle": 13805735,
      "actual": 13805736,
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
      "actual": 13805798,
      "match": false,
      "owner": "Phase 6 first write at pc 0x082739 (prev 0x082722): 0xD2A8E2->0xD3A854"
    },
    {
      "name": "D0258A",
      "mode": "absolute",
      "oracle": 13805797,
      "actual": 13805798,
      "match": false,
      "owner": "Phase 6 first write at pc 0x0824D6 (prev 0x0826FD): 0xD2A8E2->0xD3A854"
    },
    {
      "name": "D0258D",
      "mode": "absolute",
      "oracle": 13805797,
      "actual": 13805798,
      "match": false,
      "owner": "Phase 6 first write at pc 0x0824D6 (prev 0x0826FD): 0xD2A8E2->0xD3A854"
    },
    {
      "name": "D025A0",
      "mode": "absolute",
      "oracle": 13805735,
      "actual": 13805736,
      "match": false,
      "owner": "Phase 6 first write at pc 0x08255D (prev 0x0825DD): 0xD2A8A4->0xD3A816"
    }
  ],
  "relativeMismatches": [
    {
      "name": "D0243A cursor-from-line-base",
      "rawOracle": 13740241,
      "rawActual": 13740241,
      "oracle": 2,
      "actual": 5,
      "width": 6,
      "ownerName": "D0243A",
      "owner": "pre-LEFT input divergence: after 1 and 2 complete, Digit3 writes intended 0x33 at pc 0x05E372 (prev 0x05E348, block 1931), revisits the same owner at block 5810, writes unexpected 0x31, advances the cursor twice, and exhausts 300000 steps before the post-insert gate; final browser cursor offset is +5",
      "mode": "cursor-relative",
      "match": false
    },
    {
      "name": "TOKEN[cursor-3]",
      "rawOracle": 0,
      "rawActual": 51,
      "oracle": 0,
      "actual": 51,
      "width": 2,
      "ownerName": "TOKEN_BASE_2",
      "owner": "pre-LEFT input divergence: after 1 and 2 complete, Digit3 writes intended 0x33 at pc 0x05E372 (prev 0x05E348, block 1931), revisits the same owner at block 5810, writes unexpected 0x31, advances the cursor twice, and exhausts 300000 steps before the post-insert gate; compared byte was first written by 3 at pc 0x05E372 (prev 0x05E348)",
      "mode": "cursor-relative",
      "match": false
    },
    {
      "name": "TOKEN[cursor-1]",
      "rawOracle": 50,
      "rawActual": 132,
      "oracle": 50,
      "actual": 132,
      "width": 2,
      "ownerName": "TOKEN_BASE_4",
      "owner": "pre-LEFT input divergence: after 1 and 2 complete, Digit3 writes intended 0x33 at pc 0x05E372 (prev 0x05E348, block 1931), revisits the same owner at block 5810, writes unexpected 0x31, advances the cursor twice, and exhausts 300000 steps before the post-insert gate; compared byte was first written by LEFT at pc 0x05E372 (prev 0x05E348)",
      "mode": "cursor-relative",
      "match": false
    },
    {
      "name": "TOKEN[cursor+0]",
      "rawOracle": 51,
      "rawActual": 0,
      "oracle": 51,
      "actual": 0,
      "width": 2,
      "ownerName": "TOKEN_BASE_5",
      "owner": "pre-LEFT input divergence: after 1 and 2 complete, Digit3 writes intended 0x33 at pc 0x05E372 (prev 0x05E348, block 1931), revisits the same owner at block 5810, writes unexpected 0x31, advances the cursor twice, and exhausts 300000 steps before the post-insert gate; no bounded token writer was observed",
      "mode": "cursor-relative",
      "match": false
    },
    {
      "name": "D0243D-cursor",
      "rawOracle": 13805632,
      "rawActual": 13805630,
      "oracle": 65391,
      "actual": 65389,
      "width": 6,
      "ownerName": "D0243D",
      "owner": "pre-LEFT input divergence: after 1 and 2 complete, Digit3 writes intended 0x33 at pc 0x05E372 (prev 0x05E348, block 1931), revisits the same owner at block 5810, writes unexpected 0x31, advances the cursor twice, and exhausts 300000 steps before the post-insert gate; descriptor delta differs after LEFT",
      "mode": "cursor-relative",
      "match": false
    },
    {
      "name": "D02440-cursor",
      "rawOracle": 13805633,
      "rawActual": 13805630,
      "oracle": 65392,
      "actual": 65389,
      "width": 6,
      "ownerName": "D02440",
      "owner": "pre-LEFT input divergence: after 1 and 2 complete, Digit3 writes intended 0x33 at pc 0x05E372 (prev 0x05E348, block 1931), revisits the same owner at block 5810, writes unexpected 0x31, advances the cursor twice, and exhausts 300000 steps before the post-insert gate; descriptor delta differs after LEFT",
      "mode": "cursor-relative",
      "match": false
    },
    {
      "name": "D02A29 cursor-pixel-offset",
      "rawOracle": 36,
      "rawActual": 0,
      "oracle": 36,
      "actual": 0,
      "width": 4,
      "ownerName": "D02A29",
      "owner": "no bounded writer observed",
      "mode": "cursor-relative",
      "match": false
    }
  ],
  "firstDivergence": "before LEFT: after 1 and 2 complete, Digit3 writes intended 0x33 at pc 0x05E372 (prev 0x05E348, block 1931), revisits the same owner at block 5810, writes unexpected 0x31, advances the cursor twice, and exhausts 300000 steps before the post-insert gate",
  "conclusion": "Digit1 and Digit2 are faithful, but Digit3 repeats insert owner 0x05E372, appends 0x31, and max-steps before LEFT. ArrowLeft therefore starts from base+4 instead of the clean base+3; it initially decrements cursor and D0243D by one at 0x05E453, then later writes unexpected 0x84 at 0x05E372 and max-steps without reaching 0x001879. The clean hardware left-arrow fidelity cannot be isolated until the pre-LEFT Digit3 owner is fixed. 7 relative mismatch(es) and 4 non-layout absolute mismatch(es) were measured."
}
```

No runtime, transpiler, browser-shell, decoder, peripheral, scheduler, ROM artifact, or `follow-alongs/` files were changed.


# Phase 770 Browser KeyE Pre-Stop Scope

Probe: `probe-phase770-browser-keye-prestop-scope.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase770-browser-keye-prestop-scope.mjs`

Serves an in-memory instrumented current `browser-shell.html`, boots coldboot with Preserve Display, presses `KeyE`, and compares the phase769 no-stop corruption baseline against an in-memory `KeyE` control pre-stop at `0x001879`.

This probe intentionally does not patch disk `browser-shell.html`; it tests whether a later disk patch can be limited to a control pre-stop with no context-vector restore or cursor restore.

## Result

- KeyE pre-wipe stop at 0x001879 is bounded and preserves the home cx/VAT/cursor state without context-vector or cursor restore.
- Baseline/no-stop: termination=max_steps, steps=190000, D007CA=0x000000, D02590=0x000000, firstCriticalZero=observed-before-block, cleanupTail=1.
- Pre-stop-only: termination=control_pre_stop, stop=0x001879, D007CA=0x0585E9, D008E0=0xD1A863, D02590=0xD3FE81, D0243A=0xD1A8CE, D0243D=0xD2A83E, VRAM=8754, cleanupTail=0.

## Strategy Matrix

| Strategy | Pre-stop | Safe candidate | Termination | Steps | Stop | Last PC | D007CA | D008E0 | D02590 | D0243A | D0243D | VRAM | Wipe tail | Page errors |
|---|---|---|---|---:|---|---|---|---|---|---|---|---:|---:|---:|
| baselineNoStop | no | NO | max_steps | 190000 | - | 0x005B4B | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 2632 | 1 | 0 |
| preStop001879Only | yes | YES | control_pre_stop | 13179 | 0x001879 | 0x08C331 | 0x0585E9 | 0xD1A863 | 0xD3FE81 | 0xD1A8CE | 0xD2A83E | 8754 | 0 | 0 |

## Strategy: baselineNoStop

- Config: preStopKeyE=false, stepCap=190000.
- Assessment: stoppedAtPrewipe=false, saneHomeState=false, cursorStayedAtBaseline=false, cursorMovedToKeyEObservedValue=false, noZeroOrSpaceCorruption=false, noWipeTail=false, noUnexpectedRestores=true, vramNotWiped=false, noPageErrors=true, safeCandidate=false.
- Key result: termination=max_steps, steps=190000, controlStop=-, controlLabel=-, lastPc=0x005B4B, contextRestoreEnabled=false, contextRestored=false.
- Final fields: D007CA=0x000000, D008E0=0x000000, D02590=0x000000, D0243A=0x000000, D0243D=0x000000, VRAM=2632, pageErrors=0.
- First D007CA transition: block 13143, prevPc=0x001879, nextPc=0x0018F8, 0x0585E9->0x000000.
- First D0243A transition: block 2778, prevPc=0x05E348, nextPc=0x05E372, 0xD1A8CC->0xD1A8CD.
- Target hits: spaceFillBridge0a2a37=12, cleanup001879=1, cleanupTail0018f8=1, vectorOwner08c782=0, vectorRestore06c764=0, alternateCxMain06c92c=0, sentinel0158bc=2, postInsertGate0158de=2, low000a92=32512, low000b7c=3085.

### Target Hits

| Target | Hits | First block | PC | Prev PC | BC | HL | DE | SP | D007CA | D02590 |
|---|---:|---:|---|---|---|---|---|---|---|---|
| reset000000 | 1 | 12573 | 0x000000 | 0x03D0E0 | 0x000000 | 0x000002 | 0xD1A7FC | 0xF9DD11 | 0x0585E9 | 0xD3FE81 |
| low000a92 | 32512 | 103957 | 0x000A92 | 0x000A72 | 0x000000 | 0x0000E2 | 0xD1A3FD | 0xD1A3BC | 0x000000 | 0x000000 |
| low000b7c | 3085 | 103896 | 0x000B7C | 0x000B60 | 0x00105C | 0xFFFF16 | 0x0000EA | 0xD1A3BC | 0x000000 | 0x000000 |
| coldIdle0019b5 | 0 | - | - | - | - | - | - | - | - | - |
| wipe0019be | 0 | - | - | - | - | - | - | - | - | - |
| cleanup001879 | 1 | 13142 | 0x001879 | 0x001872 | 0x000003 | 0x000000 | 0x000430 | 0xD1A87B | 0x0585E9 | 0xD3FE81 |
| cleanupTail0018f8 | 1 | 13143 | 0x0018F8 | 0x001879 | 0x0000FF | 0xD3FEFF | 0xD3FF00 | 0xD1A87B | 0x000000 | 0x000000 |
| sentinel001c33 | 215 | 22 | 0x001C33 | 0x006808 | 0x09D6B4 | 0x020006 | 0x0080C0 | 0xD1A845 | 0x0585E9 | 0xD3FE81 |
| sentinel0158bc | 2 | 12938 | 0x0158BC | 0x0158E8 | 0x00A005 | 0x000000 | 0xD1A7FC | 0xD1A878 | 0x0585E9 | 0xD3FE81 |
| postInsertGate0158de | 2 | 12936 | 0x0158DE | 0x0013C7 | 0x00A005 | 0x000000 | 0xD1A7FC | 0xD1A87B | 0x0585E9 | 0xD3FE81 |
| spaceFillBridge0a2a37 | 12 | 582 | 0x0A2A37 | 0x0A237E | 0x000000 | 0x000000 | 0xD2A815 | 0xD1A842 | 0x0585E9 | 0xD3FE81 |
| vectorOwner08c782 | 0 | - | - | - | - | - | - | - | - | - |
| vectorRestore06c764 | 0 | - | - | - | - | - | - | - | - | - |
| alternateCxMain06c92c | 0 | - | - | - | - | - | - | - | - | - |
| cxDispatchWrapper08c72f | 2 | 2379 | 0x08C72F | 0x08C536 | 0x008400 | 0x00FFFF | 0xD2A815 | 0xD1A85D | 0x0585E9 | 0xD3FE81 |
| cxJpTrampoline08c745 | 2 | 2386 | 0x08C745 | 0x08C734 | 0x008400 | 0x0585E9 | 0xD2A815 | 0xD1A854 | 0x0585E9 | 0xD3FE81 |
| display09efde | 0 | - | - | - | - | - | - | - | - | - |
| display09efcb | 0 | - | - | - | - | - | - | - | - | - |
| display09efe8 | 0 | - | - | - | - | - | - | - | - | - |

### Core Field Transitions

| Block | PC | Prev PC | Timing | Diffs |
|---:|---|---|---|---|
| 1 | 0x08C331 | - | entry-vs-previous-block | D008E0:0x000000->0xD1A863; D0058C:0x000000->0x000084; D0058D:0x000000->0x000084; D0058E:0x000000->0x000084 |
| 147 | 0x03F9D5 | 0x03FA04 | entry-vs-previous-block | D0058D:0x000084->0x00002E |
| 2778 | 0x05E372 | 0x05E348 | entry-vs-previous-block | D0243A:0xD1A8CC->0xD1A8CD |
| 4947 | 0x02FCB3 | 0x08C359 | entry-vs-previous-block | D0058C:0x000084->0x000000; D0058E:0x000084->0x000000 |
| 6156 | 0x08C38A | 0x08C366 | entry-vs-previous-block | D0058C:0x000000->0x0000B6 |
| 7788 | 0x05E372 | 0x05E348 | entry-vs-previous-block | D0243A:0xD1A8CD->0xD1A8CE |
| 9956 | 0x02FCB3 | 0x08C359 | entry-vs-previous-block | D0058C:0x0000B6->0x000000 |
| 13143 | 0x0018F8 | 0x001879 | entry-vs-previous-block | D007CA:0x0585E9->0x000000; D008E0:0xD1A863->0x000000; D0243A:0xD1A8CE->0x000000; D0243D:0xD2A83E->0x000000; D02590:0xD3FE81->0x000000; D0058D:0x00002E->0x000000 |

## Strategy: preStop001879Only

- Config: preStopKeyE=true, stepCap=90000.
- Assessment: stoppedAtPrewipe=true, saneHomeState=true, cursorStayedAtBaseline=false, cursorMovedToKeyEObservedValue=true, noZeroOrSpaceCorruption=true, noWipeTail=true, noUnexpectedRestores=true, vramNotWiped=true, noPageErrors=true, safeCandidate=true.
- Key result: termination=control_pre_stop, steps=13179, controlStop=0x001879, controlLabel=keye-prewipe-stop, lastPc=0x08C331, contextRestoreEnabled=false, contextRestored=false.
- Final fields: D007CA=0x0585E9, D008E0=0xD1A863, D02590=0xD3FE81, D0243A=0xD1A8CE, D0243D=0xD2A83E, VRAM=8754, pageErrors=0.
- First D007CA transition: none captured.
- First D0243A transition: block 2778, prevPc=0x05E348, nextPc=0x05E372, 0xD1A8CC->0xD1A8CD.
- Target hits: spaceFillBridge0a2a37=12, cleanup001879=1, cleanupTail0018f8=0, vectorOwner08c782=0, vectorRestore06c764=0, alternateCxMain06c92c=0, sentinel0158bc=2, postInsertGate0158de=2, low000a92=0, low000b7c=0.

### Target Hits

| Target | Hits | First block | PC | Prev PC | BC | HL | DE | SP | D007CA | D02590 |
|---|---:|---:|---|---|---|---|---|---|---|---|
| reset000000 | 1 | 12573 | 0x000000 | 0x03D0E0 | 0x000000 | 0x000002 | 0xD1A7FC | 0xF9DD11 | 0x0585E9 | 0xD3FE81 |
| low000a92 | 0 | - | - | - | - | - | - | - | - | - |
| low000b7c | 0 | - | - | - | - | - | - | - | - | - |
| coldIdle0019b5 | 0 | - | - | - | - | - | - | - | - | - |
| wipe0019be | 0 | - | - | - | - | - | - | - | - | - |
| cleanup001879 | 1 | 13142 | 0x001879 | 0x001872 | 0x000003 | 0x000000 | 0x000430 | 0xD1A87B | 0x0585E9 | 0xD3FE81 |
| cleanupTail0018f8 | 0 | - | - | - | - | - | - | - | - | - |
| sentinel001c33 | 211 | 22 | 0x001C33 | 0x006808 | 0x09D6B4 | 0x020006 | 0x0080C0 | 0xD1A845 | 0x0585E9 | 0xD3FE81 |
| sentinel0158bc | 2 | 12938 | 0x0158BC | 0x0158E8 | 0x00A005 | 0x000000 | 0xD1A7FC | 0xD1A878 | 0x0585E9 | 0xD3FE81 |
| postInsertGate0158de | 2 | 12936 | 0x0158DE | 0x0013C7 | 0x00A005 | 0x000000 | 0xD1A7FC | 0xD1A87B | 0x0585E9 | 0xD3FE81 |
| spaceFillBridge0a2a37 | 12 | 582 | 0x0A2A37 | 0x0A237E | 0x000000 | 0x000000 | 0xD2A815 | 0xD1A842 | 0x0585E9 | 0xD3FE81 |
| vectorOwner08c782 | 0 | - | - | - | - | - | - | - | - | - |
| vectorRestore06c764 | 0 | - | - | - | - | - | - | - | - | - |
| alternateCxMain06c92c | 0 | - | - | - | - | - | - | - | - | - |
| cxDispatchWrapper08c72f | 2 | 2379 | 0x08C72F | 0x08C536 | 0x008400 | 0x00FFFF | 0xD2A815 | 0xD1A85D | 0x0585E9 | 0xD3FE81 |
| cxJpTrampoline08c745 | 2 | 2386 | 0x08C745 | 0x08C734 | 0x008400 | 0x0585E9 | 0xD2A815 | 0xD1A854 | 0x0585E9 | 0xD3FE81 |
| display09efde | 0 | - | - | - | - | - | - | - | - | - |
| display09efcb | 0 | - | - | - | - | - | - | - | - | - |
| display09efe8 | 0 | - | - | - | - | - | - | - | - | - |

### Core Field Transitions

| Block | PC | Prev PC | Timing | Diffs |
|---:|---|---|---|---|
| 1 | 0x08C331 | - | entry-vs-previous-block | D008E0:0x000000->0xD1A863; D0058C:0x000000->0x000084; D0058D:0x000000->0x000084; D0058E:0x000000->0x000084 |
| 147 | 0x03F9D5 | 0x03FA04 | entry-vs-previous-block | D0058D:0x000084->0x00002E |
| 2778 | 0x05E372 | 0x05E348 | entry-vs-previous-block | D0243A:0xD1A8CC->0xD1A8CD |
| 4947 | 0x02FCB3 | 0x08C359 | entry-vs-previous-block | D0058C:0x000084->0x000000; D0058E:0x000084->0x000000 |
| 6156 | 0x08C38A | 0x08C366 | entry-vs-previous-block | D0058C:0x000000->0x0000B6 |
| 7788 | 0x05E372 | 0x05E348 | entry-vs-previous-block | D0243A:0xD1A8CD->0xD1A8CE |
| 9956 | 0x02FCB3 | 0x08C359 | entry-vs-previous-block | D0058C:0x0000B6->0x000000 |


## Compact Evidence

```json
{
  "finding": "KeyE pre-wipe stop at 0x001879 is bounded and preserves the home cx/VAT/cursor state without context-vector or cursor restore.",
  "prestop": {
    "code": "KeyE",
    "pc": 6265,
    "label": "keye-prewipe-stop"
  },
  "results": [
    {
      "strategy": {
        "name": "baselineNoStop",
        "preStopKeyE": false,
        "stepCap": 190000
      },
      "browserConfig": {
        "preStopKeyE": false,
        "stepCap": 190000
      },
      "assessment": {
        "stoppedAtPrewipe": false,
        "saneHomeState": false,
        "cursorStayedAtBaseline": false,
        "cursorMovedToKeyEObservedValue": false,
        "noZeroOrSpaceCorruption": false,
        "noWipeTail": false,
        "noUnexpectedRestores": true,
        "vramNotWiped": false,
        "noPageErrors": true,
        "safeCandidate": false
      },
      "before": {
        "status": "Coldboot complete. OS event loop is ready.",
        "lastPc": "0x08C331",
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0x000000",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D000C2": "0x00",
          "D02A28": "0x00",
          "D02A29": "0x000000",
          "D02A40": "0xD2A83E",
          "D00595": "0x00",
          "D00596": "0x00"
        },
        "vram": 8549
      },
      "after": {
        "status": "Key: ^ → 190000 steps (max_steps, peak 8754px)",
        "lastPc": "0x005B4B",
        "cpu": {
          "pc": "0x005B16",
          "sp": "0xD1A84B",
          "af": "0x00007C",
          "bc": "0xFF0500",
          "de": "0x0000FF",
          "hl": "0xD524D6",
          "ix": "0xD005A3",
          "iy": "0xD00080",
          "f": "0x7C",
          "stepCount": 189999
        },
        "fields": {
          "D007CA": "0x000000",
          "D008E0": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D000C2": "0x00",
          "D02A28": "0x00",
          "D02A29": "0x000000",
          "D02A40": "0x000000",
          "D00595": "0x04",
          "D00596": "0x03"
        },
        "diagnostics": {
          "D007CA": 0,
          "D008E0": 0,
          "D0243A": 0,
          "D0243D": 0,
          "D02590": 0,
          "D00595": 4,
          "D00596": 3,
          "buffer": [
            240,
            12,
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
            "nonWhite": 421
          },
          "vramCurrent": 2632,
          "lastKey": {
            "code": "KeyE",
            "label": "^",
            "expectedInsertByte": null,
            "controlPreStopPc": null,
            "controlPreStopLabel": null,
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
            "steps": 190000,
            "termination": "max_steps",
            "wipes": 1,
            "D0243A": 0,
            "D0243D": 0,
            "D007CA": 0,
            "D008E0": 0,
            "D02590": 0,
            "D000C2": 0,
            "buffer": [
              240,
              12,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "vramPeak": 8754,
            "vramCurrent": 2632
          }
        },
        "lastKey": {
          "code": "KeyE",
          "label": "^",
          "expectedInsertByte": null,
          "controlPreStopPc": null,
          "controlPreStopLabel": null,
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
          "steps": 190000,
          "termination": "max_steps",
          "wipes": 1,
          "D0243A": 0,
          "D0243D": 0,
          "D007CA": 0,
          "D008E0": 0,
          "D02590": 0,
          "D000C2": 0,
          "buffer": [
            240,
            12,
            0,
            0,
            0,
            0,
            0,
            0
          ],
          "vramPeak": 8754,
          "vramCurrent": 2632
        },
        "pageErrors": []
      },
      "targetCounts": {
        "reset000000": 1,
        "low000a92": 32512,
        "low000b7c": 3085,
        "coldIdle0019b5": 0,
        "wipe0019be": 0,
        "cleanup001879": 1,
        "cleanupTail0018f8": 1,
        "sentinel001c33": 215,
        "sentinel0158bc": 2,
        "postInsertGate0158de": 2,
        "spaceFillBridge0a2a37": 12,
        "vectorOwner08c782": 0,
        "vectorRestore06c764": 0,
        "alternateCxMain06c92c": 0,
        "cxDispatchWrapper08c72f": 2,
        "cxJpTrampoline08c745": 2,
        "display09efde": 0,
        "display09efcb": 0,
        "display09efe8": 0
      },
      "hotBlocks": [
        {
          "pc": "0x000A92",
          "count": 32512
        },
        {
          "pc": "0x000BFE",
          "count": 32258
        },
        {
          "pc": "0x0021C2",
          "count": 10094
        },
        {
          "pc": "0x006D5D",
          "count": 10088
        },
        {
          "pc": "0x006D64",
          "count": 10088
        },
        {
          "pc": "0x006CDF",
          "count": 10083
        },
        {
          "pc": "0x006D0F",
          "count": 10083
        },
        {
          "pc": "0x006D38",
          "count": 10080
        },
        {
          "pc": "0x006D4F",
          "count": 10080
        },
        {
          "pc": "0x006CF7",
          "count": 10078
        },
        {
          "pc": "0x000B72",
          "count": 3855
        },
        {
          "pc": "0x000B7C",
          "count": 3085
        },
        {
          "pc": "0x000B81",
          "count": 3085
        },
        {
          "pc": "0x005AE8",
          "count": 2641
        },
        {
          "pc": "0x005B16",
          "count": 2641
        },
        {
          "pc": "0x005B4B",
          "count": 2640
        },
        {
          "pc": "0x005AB6",
          "count": 2475
        },
        {
          "pc": "0x000B7F",
          "count": 1027
        },
        {
          "pc": "0x0A19A4",
          "count": 752
        },
        {
          "pc": "0x0A18C4",
          "count": 400
        },
        {
          "pc": "0x000AC5",
          "count": 384
        },
        {
          "pc": "0x000AEE",
          "count": 381
        },
        {
          "pc": "0x000A79",
          "count": 381
        },
        {
          "pc": "0x0A1A83",
          "count": 352
        },
        {
          "pc": "0x000BCB",
          "count": 259
        },
        {
          "pc": "0x000C80",
          "count": 258
        },
        {
          "pc": "0x000B60",
          "count": 257
        },
        {
          "pc": "0x000B83",
          "count": 257
        },
        {
          "pc": "0x000B37",
          "count": 256
        },
        {
          "pc": "0x0060B3",
          "count": 255
        },
        {
          "pc": "0x001377",
          "count": 254
        },
        {
          "pc": "0x000BD3",
          "count": 254
        },
        {
          "pc": "0x000C4A",
          "count": 254
        },
        {
          "pc": "0x001CA6",
          "count": 252
        },
        {
          "pc": "0x003D28",
          "count": 252
        },
        {
          "pc": "0x003D25",
          "count": 252
        },
        {
          "pc": "0x000ACE",
          "count": 250
        },
        {
          "pc": "0x001CC0",
          "count": 240
        },
        {
          "pc": "0x001CCA",
          "count": 239
        },
        {
          "pc": "0x001C33",
          "count": 215
        }
      ],
      "firstCriticalZero": {
        "source": "observed-before-block",
        "snapshot": {
          "block": 13143,
          "pc": 6392,
          "prevPc": 6265,
          "cpu": {
            "pc": 6392,
            "sp": 13740155,
            "af": 20992,
            "bc": 255,
            "de": 13893376,
            "hl": 13893375,
            "ix": 0,
            "iy": 13631616,
            "f": 0,
            "halted": false,
            "madl": 1,
            "stepCount": 13180
          },
          "fields": {
            "D007CA": 0,
            "D008E0": 0,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D00587": 0,
            "D0058C": 0,
            "D0058D": 0,
            "D0058E": 0,
            "D00080": 0,
            "D0009F": 0,
            "D000C2": 0,
            "D02A28": 0,
            "D02A29": 0,
            "D02A40": 0,
            "D00595": 0,
            "D00596": 0
          },
          "stackTop": [
            {
              "addr": 13740155,
              "value": 5096
            },
            {
              "addr": 13740158,
              "value": 0
            },
            {
              "addr": 13740161,
              "value": 0
            },
            {
              "addr": 13740164,
              "value": 0
            },
            {
              "addr": 13740167,
              "value": 0
            },
            {
              "addr": 13740170,
              "value": 0
            },
            {
              "addr": 13740173,
              "value": 32768
            },
            {
              "addr": 13740176,
              "value": 0
            }
          ],
          "vram": 8754,
          "diagnostics": {
            "D007CA": 0,
            "D008E0": 0,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D00595": 0,
            "D00596": 0,
            "buffer": [
              240,
              12,
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
              "nonWhite": 205
            },
            "vramCurrent": 8754,
            "lastKey": null
          }
        }
      },
      "first202020": null,
      "firstBadD007CA": {
        "source": "observed-before-block",
        "expected": 361961,
        "snapshot": {
          "block": 13143,
          "pc": 6392,
          "prevPc": 6265,
          "cpu": {
            "pc": 6392,
            "sp": 13740155,
            "af": 20992,
            "bc": 255,
            "de": 13893376,
            "hl": 13893375,
            "ix": 0,
            "iy": 13631616,
            "f": 0,
            "halted": false,
            "madl": 1,
            "stepCount": 13180
          },
          "fields": {
            "D007CA": 0,
            "D008E0": 0,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D00587": 0,
            "D0058C": 0,
            "D0058D": 0,
            "D0058E": 0,
            "D00080": 0,
            "D0009F": 0,
            "D000C2": 0,
            "D02A28": 0,
            "D02A29": 0,
            "D02A40": 0,
            "D00595": 0,
            "D00596": 0
          },
          "stackTop": [
            {
              "addr": 13740155,
              "value": 5096
            },
            {
              "addr": 13740158,
              "value": 0
            },
            {
              "addr": 13740161,
              "value": 0
            },
            {
              "addr": 13740164,
              "value": 0
            },
            {
              "addr": 13740167,
              "value": 0
            },
            {
              "addr": 13740170,
              "value": 0
            },
            {
              "addr": 13740173,
              "value": 32768
            },
            {
              "addr": 13740176,
              "value": 0
            }
          ],
          "vram": 8754,
          "diagnostics": {
            "D007CA": 0,
            "D008E0": 0,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D00595": 0,
            "D00596": 0,
            "buffer": [
              240,
              12,
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
              "nonWhite": 205
            },
            "vramCurrent": 8754,
            "lastKey": null
          }
        }
      },
      "firstD0243AChange": {
        "source": "observed-before-block",
        "expected": 13740236,
        "snapshot": {
          "block": 2778,
          "pc": 385906,
          "prevPc": 385864,
          "cpu": {
            "pc": 385906,
            "sp": 13740098,
            "af": 68,
            "bc": 33792,
            "de": 240,
            "hl": 13740237,
            "ix": 13740128,
            "iy": 13631616,
            "f": 68,
            "halted": false,
            "madl": 1,
            "stepCount": 2785
          },
          "fields": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740237,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D00587": 46,
            "D0058C": 132,
            "D0058D": 46,
            "D0058E": 132,
            "D00080": 24,
            "D0009F": 0,
            "D000C2": 0,
            "D02A28": 0,
            "D02A29": 0,
            "D02A40": 13805630,
            "D00595": 0,
            "D00596": 0
          },
          "stackTop": [
            {
              "addr": 13740098,
              "value": 385874
            },
            {
              "addr": 13740101,
              "value": 10858
            },
            {
              "addr": 13740104,
              "value": 386644
            },
            {
              "addr": 13740107,
              "value": 240
            },
            {
              "addr": 13740110,
              "value": 10858
            },
            {
              "addr": 13740113,
              "value": 363288
            },
            {
              "addr": 13740116,
              "value": 575293
            },
            {
              "addr": 13740119,
              "value": 33924
            }
          ],
          "vram": 8585,
          "diagnostics": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740237,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D00595": 0,
            "D00596": 0,
            "buffer": [
              240,
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
            "vramCurrent": 8585,
            "lastKey": null
          }
        }
      },
      "d007caTransitions": [
        {
          "block": 13143,
          "pc": "0x0018F8",
          "prevPc": "0x001879",
          "timing": "entry-vs-previous-block",
          "diff": {
            "D007CA": {
              "before": 361961,
              "after": 0
            },
            "D008E0": {
              "before": 13740131,
              "after": 0
            },
            "D0243A": {
              "before": 13740238,
              "after": 0
            },
            "D0243D": {
              "before": 13805630,
              "after": 0
            },
            "D02590": {
              "before": 13893249,
              "after": 0
            },
            "D0058D": {
              "before": 46,
              "after": 0
            },
            "D02A40": {
              "before": 13805630,
              "after": 0
            },
            "D00596": {
              "before": 2,
              "after": 0
            }
          }
        }
      ],
      "cursorTransitions": [
        {
          "block": 2778,
          "pc": "0x05E372",
          "prevPc": "0x05E348",
          "timing": "entry-vs-previous-block",
          "diff": {
            "D0243A": {
              "before": 13740236,
              "after": 13740237
            }
          }
        },
        {
          "block": 7788,
          "pc": "0x05E372",
          "prevPc": "0x05E348",
          "timing": "entry-vs-previous-block",
          "diff": {
            "D0243A": {
              "before": 13740237,
              "after": 13740238
            }
          }
        },
        {
          "block": 13143,
          "pc": "0x0018F8",
          "prevPc": "0x001879",
          "timing": "entry-vs-previous-block",
          "diff": {
            "D007CA": {
              "before": 361961,
              "after": 0
            },
            "D008E0": {
              "before": 13740131,
              "after": 0
            },
            "D0243A": {
              "before": 13740238,
              "after": 0
            },
            "D0243D": {
              "before": 13805630,
              "after": 0
            },
            "D02590": {
              "before": 13893249,
              "after": 0
            },
            "D0058D": {
              "before": 46,
              "after": 0
            },
            "D02A40": {
              "before": 13805630,
              "after": 0
            },
            "D00596": {
              "before": 2,
              "after": 0
            }
          }
        }
      ],
      "lastBlocks": [
        "0x005AE8",
        "0x005B16",
        "0x005B4B",
        "0x005AB6",
        "0x005AE8",
        "0x005B16",
        "0x005B4B",
        "0x005AB6",
        "0x005AE8",
        "0x005B16",
        "0x005B4B",
        "0x005AB6",
        "0x005AE8",
        "0x005B16",
        "0x005B4B",
        "0x005AB6",
        "0x005AE8",
        "0x005B16",
        "0x005B4B",
        "0x005AB6",
        "0x005AE8",
        "0x005B16",
        "0x005B4B",
        "0x005AB6",
        "0x005AE8",
        "0x005B16",
        "0x005B4B",
        "0x005AB6",
        "0x005AE8",
        "0x005B16",
        "0x005B4B",
        "0x005AB6",
        "0x005AE8",
        "0x005B16",
        "0x005B4B",
        "0x005AB6",
        "0x005AE8",
        "0x005B16",
        "0x005B4B",
        "0x005AB6",
        "0x005AE8",
        "0x005B16",
        "0x005B4B",
        "0x005AB6",
        "0x005AE8",
        "0x005B16",
        "0x005B4B",
        "0x005B92",
        "0x005A19",
        "0x0059DA",
        "0x0059E6",
        "0x0059F7",
        "0x0059ED",
        "0x0059F3",
        "0x0059C6",
        "0x0059D6",
        "0x005A75",
        "0x005A82",
        "0x00596E",
        "0x001713",
        "0x0008BB",
        "0x001717",
        "0x001718",
        "0x005974",
        "0x005998",
        "0x005A8B",
        "0x005A48",
        "0x005A96",
        "0x005A53",
        "0x005AA2",
        "0x005AAE",
        "0x005AE8",
        "0x005B16",
        "0x005B4B",
        "0x005AB6",
        "0x005AE8",
        "0x005B16",
        "0x005B4B",
        "0x005AB6",
        "0x005AE8",
        "0x005B16",
        "0x005B4B",
        "0x005AB6",
        "0x005AE8",
        "0x005B16",
        "0x005B4B",
        "0x005AB6",
        "0x005AE8",
        "0x005B16",
        "0x005B4B",
        "0x005AB6",
        "0x005AE8",
        "0x005B16",
        "0x005B4B",
        "0x005AB6",
        "0x005AE8",
        "0x005B16",
        "0x005B4B",
        "0x005AB6",
        "0x005AE8",
        "0x005B16",
        "0x005B4B",
        "0x005AB6",
        "0x005AE8",
        "0x005B16",
        "0x005B4B",
        "0x005AB6",
        "0x005AE8",
        "0x005B16",
        "0x005B4B",
        "0x005AB6",
        "0x005AE8",
        "0x005B16",
        "0x005B4B",
        "0x005AB6",
        "0x005AE8",
        "0x005B16",
        "0x005B4B",
        "0x005AB6",
        "0x005AE8",
        "0x005B16",
        "0x005B4B",
        "0x005AB6",
        "0x005AE8",
        "0x005B16",
        "0x005B4B",
        "0x005AB6",
        "0x005AE8",
        "0x005B16",
        "0x005B4B",
        "0x005AB6",
        "0x005AE8",
        "0x005B16",
        "0x005B4B",
        "0x005B92",
        "0x005A19",
        "0x0059DA",
        "0x0059E6",
        "0x0059F7",
        "0x0059ED",
        "0x0059F3",
        "0x0059C6",
        "0x0059D6",
        "0x005A75",
        "0x005A82",
        "0x00596E",
        "0x001713",
        "0x0008BB",
        "0x001717",
        "0x001718",
        "0x005974",
        "0x005998",
        "0x005A8B",
        "0x005A48",
        "0x005A96",
        "0x005A53",
        "0x005AA2",
        "0x005AAE",
        "0x005AE8",
        "0x005B16"
      ],
      "pageErrors": []
    },
    {
      "strategy": {
        "name": "preStop001879Only",
        "preStopKeyE": true,
        "stepCap": 90000
      },
      "browserConfig": {
        "preStopKeyE": true,
        "stepCap": 90000
      },
      "assessment": {
        "stoppedAtPrewipe": true,
        "saneHomeState": true,
        "cursorStayedAtBaseline": false,
        "cursorMovedToKeyEObservedValue": true,
        "noZeroOrSpaceCorruption": true,
        "noWipeTail": true,
        "noUnexpectedRestores": true,
        "vramNotWiped": true,
        "noPageErrors": true,
        "safeCandidate": true
      },
      "before": {
        "status": "Coldboot complete. OS event loop is ready.",
        "lastPc": "0x08C331",
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0x000000",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D000C2": "0x00",
          "D02A28": "0x00",
          "D02A29": "0x000000",
          "D02A40": "0xD2A83E",
          "D00595": "0x00",
          "D00596": "0x00"
        },
        "vram": 8549
      },
      "after": {
        "status": "Key: ^ → 13179 steps (control_pre_stop, peak 8754px)",
        "lastPc": "0x08C331",
        "cpu": {
          "pc": "0x001879",
          "sp": "0xD1A87B",
          "af": "0x00EE54",
          "bc": "0x000003",
          "de": "0x000430",
          "hl": "0x000000",
          "ix": "0x000000",
          "iy": "0xD00080",
          "f": "0x54",
          "stepCount": 13179
        },
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0243A": "0xD1A8CE",
          "D0243D": "0xD2A83E",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x2E",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D000C2": "0x00",
          "D02A28": "0x00",
          "D02A29": "0x000000",
          "D02A40": "0xD2A83E",
          "D00595": "0x00",
          "D00596": "0x02"
        },
        "diagnostics": {
          "D007CA": 361961,
          "D008E0": 13740131,
          "D0243A": 13740238,
          "D0243D": 13805630,
          "D02590": 13893249,
          "D00595": 0,
          "D00596": 2,
          "buffer": [
            240,
            12,
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
            "nonWhite": 205
          },
          "vramCurrent": 8754,
          "lastKey": {
            "code": "KeyE",
            "label": "^",
            "expectedInsertByte": null,
            "controlPreStopPc": 6265,
            "controlPreStopLabel": "keye-prewipe-stop",
            "cursorBefore": null,
            "insertBlock": null,
            "postInsertGateBlock": null,
            "stoppedAtPostInsertGate": false,
            "D000C2Bit7Restored": false,
            "controlStopBlock": 13142,
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
            "steps": 13179,
            "termination": "control_pre_stop",
            "wipes": 0,
            "D0243A": 13740238,
            "D0243D": 13805630,
            "D007CA": 361961,
            "D008E0": 13740131,
            "D02590": 13893249,
            "D000C2": 0,
            "buffer": [
              240,
              12,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "vramPeak": 8754,
            "vramCurrent": 8754
          }
        },
        "lastKey": {
          "code": "KeyE",
          "label": "^",
          "expectedInsertByte": null,
          "controlPreStopPc": 6265,
          "controlPreStopLabel": "keye-prewipe-stop",
          "cursorBefore": null,
          "insertBlock": null,
          "postInsertGateBlock": null,
          "stoppedAtPostInsertGate": false,
          "D000C2Bit7Restored": false,
          "controlStopBlock": 13142,
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
          "steps": 13179,
          "termination": "control_pre_stop",
          "wipes": 0,
          "D0243A": 13740238,
          "D0243D": 13805630,
          "D007CA": 361961,
          "D008E0": 13740131,
          "D02590": 13893249,
          "D000C2": 0,
          "buffer": [
            240,
            12,
            0,
            0,
            0,
            0,
            0,
            0
          ],
          "vramPeak": 8754,
          "vramCurrent": 8754
        },
        "pageErrors": []
      },
      "targetCounts": {
        "reset000000": 1,
        "low000a92": 0,
        "low000b7c": 0,
        "coldIdle0019b5": 0,
        "wipe0019be": 0,
        "cleanup001879": 1,
        "cleanupTail0018f8": 0,
        "sentinel001c33": 211,
        "sentinel0158bc": 2,
        "postInsertGate0158de": 2,
        "spaceFillBridge0a2a37": 12,
        "vectorOwner08c782": 0,
        "vectorRestore06c764": 0,
        "alternateCxMain06c92c": 0,
        "cxDispatchWrapper08c72f": 2,
        "cxJpTrampoline08c745": 2,
        "display09efde": 0,
        "display09efcb": 0,
        "display09efe8": 0
      },
      "hotBlocks": [
        {
          "pc": "0x0A19A4",
          "count": 752
        },
        {
          "pc": "0x0A18C4",
          "count": 400
        },
        {
          "pc": "0x0A1A83",
          "count": 352
        },
        {
          "pc": "0x001377",
          "count": 254
        },
        {
          "pc": "0x001CA6",
          "count": 247
        },
        {
          "pc": "0x003D28",
          "count": 245
        },
        {
          "pc": "0x003D25",
          "count": 245
        },
        {
          "pc": "0x001CC0",
          "count": 235
        },
        {
          "pc": "0x001CCA",
          "count": 235
        },
        {
          "pc": "0x001C33",
          "count": 211
        },
        {
          "pc": "0x001C38",
          "count": 209
        },
        {
          "pc": "0x001C3C",
          "count": 199
        },
        {
          "pc": "0x001CE4",
          "count": 197
        },
        {
          "pc": "0x003D40",
          "count": 175
        },
        {
          "pc": "0x0A3404",
          "count": 168
        },
        {
          "pc": "0x001C44",
          "count": 167
        },
        {
          "pc": "0x001C7D",
          "count": 167
        },
        {
          "pc": "0x001C81",
          "count": 167
        },
        {
          "pc": "0x001C82",
          "count": 167
        },
        {
          "pc": "0x001C48",
          "count": 167
        },
        {
          "pc": "0x0A3408",
          "count": 156
        },
        {
          "pc": "0x0A1854",
          "count": 144
        },
        {
          "pc": "0x0A187C",
          "count": 144
        },
        {
          "pc": "0x0A188A",
          "count": 144
        },
        {
          "pc": "0x0A189E",
          "count": 144
        },
        {
          "pc": "0x0A18A6",
          "count": 144
        },
        {
          "pc": "0x0A18AF",
          "count": 144
        },
        {
          "pc": "0x0A18C1",
          "count": 144
        },
        {
          "pc": "0x0A18CA",
          "count": 144
        },
        {
          "pc": "0x0A18E9",
          "count": 144
        },
        {
          "pc": "0x0A191F",
          "count": 144
        },
        {
          "pc": "0x0A1939",
          "count": 144
        },
        {
          "pc": "0x0A1969",
          "count": 144
        },
        {
          "pc": "0x0A1976",
          "count": 144
        },
        {
          "pc": "0x0A1980",
          "count": 144
        },
        {
          "pc": "0x0A1988",
          "count": 144
        },
        {
          "pc": "0x0A1994",
          "count": 144
        },
        {
          "pc": "0x0A19AA",
          "count": 144
        },
        {
          "pc": "0x0A19B5",
          "count": 144
        },
        {
          "pc": "0x0A19B7",
          "count": 144
        }
      ],
      "firstCriticalZero": null,
      "first202020": null,
      "firstBadD007CA": null,
      "firstD0243AChange": {
        "source": "observed-before-block",
        "expected": 13740236,
        "snapshot": {
          "block": 2778,
          "pc": 385906,
          "prevPc": 385864,
          "cpu": {
            "pc": 385906,
            "sp": 13740098,
            "af": 68,
            "bc": 33792,
            "de": 240,
            "hl": 13740237,
            "ix": 13740128,
            "iy": 13631616,
            "f": 68,
            "halted": false,
            "madl": 1,
            "stepCount": 2785
          },
          "fields": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740237,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D00587": 46,
            "D0058C": 132,
            "D0058D": 46,
            "D0058E": 132,
            "D00080": 24,
            "D0009F": 0,
            "D000C2": 0,
            "D02A28": 0,
            "D02A29": 0,
            "D02A40": 13805630,
            "D00595": 0,
            "D00596": 0
          },
          "stackTop": [
            {
              "addr": 13740098,
              "value": 385874
            },
            {
              "addr": 13740101,
              "value": 10858
            },
            {
              "addr": 13740104,
              "value": 386644
            },
            {
              "addr": 13740107,
              "value": 240
            },
            {
              "addr": 13740110,
              "value": 10858
            },
            {
              "addr": 13740113,
              "value": 363288
            },
            {
              "addr": 13740116,
              "value": 575293
            },
            {
              "addr": 13740119,
              "value": 33924
            }
          ],
          "vram": 8585,
          "diagnostics": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740237,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D00595": 0,
            "D00596": 0,
            "buffer": [
              240,
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
            "vramCurrent": 8585,
            "lastKey": null
          }
        }
      },
      "d007caTransitions": [],
      "cursorTransitions": [
        {
          "block": 2778,
          "pc": "0x05E372",
          "prevPc": "0x05E348",
          "timing": "entry-vs-previous-block",
          "diff": {
            "D0243A": {
              "before": 13740236,
              "after": 13740237
            }
          }
        },
        {
          "block": 7788,
          "pc": "0x05E372",
          "prevPc": "0x05E348",
          "timing": "entry-vs-previous-block",
          "diff": {
            "D0243A": {
              "before": 13740237,
              "after": 13740238
            }
          }
        }
      ],
      "lastBlocks": [
        "0x001CBC",
        "0x001CE5",
        "0x001C81",
        "0x001C82",
        "0x001C48",
        "0x001C33",
        "0x001C38",
        "0x001C44",
        "0x001C7D",
        "0x001CA6",
        "0x001CBC",
        "0x001CE5",
        "0x001C81",
        "0x001C82",
        "0x001C48",
        "0x001C33",
        "0x001C38",
        "0x001C44",
        "0x001C7D",
        "0x001CA6",
        "0x001CBC",
        "0x001CE5",
        "0x001C81",
        "0x001C82",
        "0x001C48",
        "0x001C33",
        "0x001C38",
        "0x001C44",
        "0x001C7D",
        "0x001CA6",
        "0x001CC0",
        "0x001CCA",
        "0x001CE4",
        "0x001C81",
        "0x001C82",
        "0x001C48",
        "0x001C33",
        "0x001C38",
        "0x001C44",
        "0x001C7D",
        "0x001CA6",
        "0x001CC0",
        "0x001CCA",
        "0x001CE4",
        "0x001C81",
        "0x001C82",
        "0x001C48",
        "0x001C33",
        "0x001C4A",
        "0x0158D2",
        "0x0158DA",
        "0x0158EC",
        "0x0158EE",
        "0x0158F8",
        "0x0013DA",
        "0x0013E4",
        "0x001853",
        "0x0158DE",
        "0x0158E8",
        "0x0158BC",
        "0x001C55",
        "0x001C33",
        "0x001C38",
        "0x001C3C",
        "0x001C42",
        "0x001C5D",
        "0x001C5E",
        "0x001C6B",
        "0x0158C4",
        "0x0158C6",
        "0x001C4F",
        "0x001CA6",
        "0x001CBC",
        "0x001CE5",
        "0x001C54",
        "0x0158CA",
        "0x001C33",
        "0x001C38",
        "0x001C3C",
        "0x001C44",
        "0x001C7D",
        "0x001CA6",
        "0x001CC0",
        "0x001CCA",
        "0x001CE4",
        "0x001C81",
        "0x001C82",
        "0x001C48",
        "0x001C33",
        "0x001C38",
        "0x001C3C",
        "0x001C44",
        "0x001C7D",
        "0x001CA6",
        "0x001CBC",
        "0x001CE5",
        "0x001C81",
        "0x001C82",
        "0x001C48",
        "0x001C33",
        "0x001C38",
        "0x001C44",
        "0x001C7D",
        "0x001CA6",
        "0x001CBC",
        "0x001CE5",
        "0x001C81",
        "0x001C82",
        "0x001C48",
        "0x001C33",
        "0x001C38",
        "0x001C44",
        "0x001C7D",
        "0x001CA6",
        "0x001CBC",
        "0x001CE5",
        "0x001C81",
        "0x001C82",
        "0x001C48",
        "0x001C33",
        "0x001C38",
        "0x001C44",
        "0x001C7D",
        "0x001CA6",
        "0x001CBC",
        "0x001CE5",
        "0x001C81",
        "0x001C82",
        "0x001C48",
        "0x001C33",
        "0x001C38",
        "0x001C44",
        "0x001C7D",
        "0x001CA6",
        "0x001CC0",
        "0x001CCA",
        "0x001CE4",
        "0x001C81",
        "0x001C82",
        "0x001C48",
        "0x001C33",
        "0x001C38",
        "0x001C44",
        "0x001C7D",
        "0x001CA6",
        "0x001CC0",
        "0x001CCA",
        "0x001CE4",
        "0x001C81",
        "0x001C82",
        "0x001C48",
        "0x001C33",
        "0x001C4A",
        "0x0158D2",
        "0x0158DA",
        "0x0158EC",
        "0x0158EE",
        "0x0158F8",
        "0x001872",
        "0x001879"
      ],
      "pageErrors": []
    }
  ]
}
```

# Phase 766 Browser Enter Pre-Wipe Stop Scope

Probe: `probe-phase766-browser-enter-prewipe-stop-scope.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase766-browser-enter-prewipe-stop-scope.mjs`

Serves an in-memory instrumented current `browser-shell.html`, boots coldboot with Preserve Display, presses `Enter`, and compares the phase765 no-stop corruption baseline against an in-memory `Enter` control pre-stop at `0x001879`.

This probe intentionally does not patch disk `browser-shell.html`; it tests whether a later disk patch can be limited to a control pre-stop with no context-vector restore or cursor restore.

## Result

- Enter pre-wipe stop at 0x001879 did not meet exact patch-readiness criteria; safeCandidate=false.
- Baseline/no-stop: termination=max_steps, steps=190000, D007CA=0x000000, D02590=0x000000, firstCriticalZero=observed-before-block, cleanupTail=1.
- Pre-stop-only: termination=control_pre_stop, stop=0x001879, D007CA=0x0585E9, D008E0=0xD1A863, D02590=0xD3FE81, D0243A=0xD1A8A3, D0243D=0xD2A83E, VRAM=8689, cleanupTail=0.

## Strategy Matrix

| Strategy | Pre-stop | Safe candidate | Termination | Steps | Stop | Last PC | D007CA | D008E0 | D02590 | D0243A | D0243D | VRAM | Wipe tail | Page errors |
|---|---|---|---|---:|---|---|---|---|---|---|---|---:|---:|---:|
| baselineNoStop | no | NO | max_steps | 190000 | - | 0x000B7C | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 3039 | 1 | 0 |
| preStop001879Only | yes | NO | control_pre_stop | 21830 | 0x001879 | 0x08C331 | 0x0585E9 | 0xD1A863 | 0xD3FE81 | 0xD1A8A3 | 0xD2A83E | 8689 | 0 | 0 |

## Strategy: baselineNoStop

- Config: preStopEnter=false, stepCap=190000.
- Assessment: stoppedAtPrewipe=false, saneHomeState=false, cursorStayedAtBaseline=false, cursorMovedToEnterObservedValue=false, noZeroOrSpaceCorruption=false, noWipeTail=false, noUnexpectedRestores=true, vramNotWiped=false, noPageErrors=true, safeCandidate=false.
- Key result: termination=max_steps, steps=190000, controlStop=-, controlLabel=enter-context-ldir, lastPc=0x000B7C, contextRestoreEnabled=false, contextRestored=false.
- Final fields: D007CA=0x000000, D008E0=0x000000, D02590=0x000000, D0243A=0x000000, D0243D=0x000000, VRAM=3039, pageErrors=0.
- First D007CA transition: block 21739, prevPc=0x001879, nextPc=0x0018F8, 0x0585E9->0x000000.
- First D0243A transition: block 16570, prevPc=0x05E851, nextPc=0x04C973, 0xD1A8CC->0xD1A8A3.
- Target hits: spaceFillBridge0a2a37=7, cleanup001879=1, cleanupTail0018f8=1, vectorOwner08c782=0, vectorRestore06c764=0, alternateCxMain06c92c=0, sentinel0158bc=2, postInsertGate0158de=2, low000a92=32512, low000b7c=2971.

### Target Hits

| Target | Hits | First block | PC | Prev PC | BC | HL | DE | SP | D007CA | D02590 |
|---|---:|---:|---|---|---|---|---|---|---|---|
| reset000000 | 1 | 21169 | 0x000000 | 0x03D0E0 | 0x000000 | 0x000002 | 0xD1A7FC | 0xF9DD11 | 0x0585E9 | 0xD3FE81 |
| low000a92 | 32512 | 112553 | 0x000A92 | 0x000A72 | 0x000000 | 0x0000E2 | 0xD1A3FD | 0xD1A3BC | 0x000000 | 0x000000 |
| low000b7c | 2971 | 112492 | 0x000B7C | 0x000B60 | 0x00105C | 0xFFFF16 | 0x0000EA | 0xD1A3BC | 0x000000 | 0x000000 |
| coldIdle0019b5 | 0 | - | - | - | - | - | - | - | - | - |
| wipe0019be | 0 | - | - | - | - | - | - | - | - | - |
| cleanup001879 | 1 | 21738 | 0x001879 | 0x001872 | 0x000003 | 0x000000 | 0x000430 | 0xD1A87B | 0x0585E9 | 0xD3FE81 |
| cleanupTail0018f8 | 1 | 21739 | 0x0018F8 | 0x001879 | 0x0000FF | 0xD3FEFF | 0xD3FF00 | 0xD1A87B | 0x000000 | 0x000000 |
| sentinel001c33 | 490 | 22 | 0x001C33 | 0x006808 | 0x09D6B4 | 0x020006 | 0x0080C0 | 0xD1A845 | 0x0585E9 | 0xD3FE81 |
| sentinel0158bc | 2 | 21534 | 0x0158BC | 0x0158E8 | 0x00A005 | 0x000000 | 0xD1A7FC | 0xD1A878 | 0x0585E9 | 0xD3FE81 |
| postInsertGate0158de | 2 | 21532 | 0x0158DE | 0x0013C7 | 0x00A005 | 0x000000 | 0xD1A7FC | 0xD1A87B | 0x0585E9 | 0xD3FE81 |
| spaceFillBridge0a2a37 | 7 | 567 | 0x0A2A37 | 0x0A237E | 0x000000 | 0x000000 | 0xD2A815 | 0xD1A842 | 0x0585E9 | 0xD3FE81 |
| vectorOwner08c782 | 0 | - | - | - | - | - | - | - | - | - |
| vectorRestore06c764 | 0 | - | - | - | - | - | - | - | - | - |
| alternateCxMain06c92c | 0 | - | - | - | - | - | - | - | - | - |
| cxDispatchWrapper08c72f | 1 | 2185 | 0x08C72F | 0x08C536 | 0x000500 | 0x00FFFF | 0xD2A815 | 0xD1A85D | 0x0585E9 | 0xD3FE81 |
| cxJpTrampoline08c745 | 1 | 2192 | 0x08C745 | 0x08C734 | 0x000500 | 0x0585E9 | 0xD2A815 | 0xD1A854 | 0x0585E9 | 0xD3FE81 |
| display09efde | 0 | - | - | - | - | - | - | - | - | - |
| display09efcb | 0 | - | - | - | - | - | - | - | - | - |
| display09efe8 | 0 | - | - | - | - | - | - | - | - | - |

### Core Field Transitions

| Block | PC | Prev PC | Timing | Diffs |
|---:|---|---|---|---|
| 1 | 0x08C331 | - | entry-vs-previous-block | D008E0:0x000000->0xD1A863; D0058C:0x000000->0x000005; D0058D:0x000000->0x000005; D0058E:0x000000->0x000005 |
| 142 | 0x03F9D5 | 0x03FA04 | entry-vs-previous-block | D0058D:0x000005->0x000029 |
| 16570 | 0x04C973 | 0x05E851 | entry-vs-previous-block | D0243A:0xD1A8CC->0xD1A8A3 |
| 17722 | 0x02FCB3 | 0x08C359 | entry-vs-previous-block | D0058C:0x000005->0x000000; D0058E:0x000005->0x000000 |
| 21739 | 0x0018F8 | 0x001879 | entry-vs-previous-block | D007CA:0x0585E9->0x000000; D008E0:0xD1A863->0x000000; D0243A:0xD1A8A3->0x000000; D0243D:0xD2A83E->0x000000; D02590:0xD3FE81->0x000000; D0058D:0x000029->0x000000 |

## Strategy: preStop001879Only

- Config: preStopEnter=true, stepCap=90000.
- Assessment: stoppedAtPrewipe=true, saneHomeState=false, cursorStayedAtBaseline=false, cursorMovedToEnterObservedValue=true, noZeroOrSpaceCorruption=true, noWipeTail=true, noUnexpectedRestores=true, vramNotWiped=true, noPageErrors=true, safeCandidate=false.
- Key result: termination=control_pre_stop, steps=21830, controlStop=0x001879, controlLabel=enter-prewipe-stop-scope, lastPc=0x08C331, contextRestoreEnabled=false, contextRestored=false.
- Final fields: D007CA=0x0585E9, D008E0=0xD1A863, D02590=0xD3FE81, D0243A=0xD1A8A3, D0243D=0xD2A83E, VRAM=8689, pageErrors=0.
- First D007CA transition: none captured.
- First D0243A transition: block 16570, prevPc=0x05E851, nextPc=0x04C973, 0xD1A8CC->0xD1A8A3.
- Target hits: spaceFillBridge0a2a37=7, cleanup001879=1, cleanupTail0018f8=0, vectorOwner08c782=0, vectorRestore06c764=0, alternateCxMain06c92c=0, sentinel0158bc=2, postInsertGate0158de=2, low000a92=0, low000b7c=0.

### Target Hits

| Target | Hits | First block | PC | Prev PC | BC | HL | DE | SP | D007CA | D02590 |
|---|---:|---:|---|---|---|---|---|---|---|---|
| reset000000 | 1 | 21169 | 0x000000 | 0x03D0E0 | 0x000000 | 0x000002 | 0xD1A7FC | 0xF9DD11 | 0x0585E9 | 0xD3FE81 |
| low000a92 | 0 | - | - | - | - | - | - | - | - | - |
| low000b7c | 0 | - | - | - | - | - | - | - | - | - |
| coldIdle0019b5 | 0 | - | - | - | - | - | - | - | - | - |
| wipe0019be | 0 | - | - | - | - | - | - | - | - | - |
| cleanup001879 | 1 | 21738 | 0x001879 | 0x001872 | 0x000003 | 0x000000 | 0x000430 | 0xD1A87B | 0x0585E9 | 0xD3FE81 |
| cleanupTail0018f8 | 0 | - | - | - | - | - | - | - | - | - |
| sentinel001c33 | 486 | 22 | 0x001C33 | 0x006808 | 0x09D6B4 | 0x020006 | 0x0080C0 | 0xD1A845 | 0x0585E9 | 0xD3FE81 |
| sentinel0158bc | 2 | 21534 | 0x0158BC | 0x0158E8 | 0x00A005 | 0x000000 | 0xD1A7FC | 0xD1A878 | 0x0585E9 | 0xD3FE81 |
| postInsertGate0158de | 2 | 21532 | 0x0158DE | 0x0013C7 | 0x00A005 | 0x000000 | 0xD1A7FC | 0xD1A87B | 0x0585E9 | 0xD3FE81 |
| spaceFillBridge0a2a37 | 7 | 567 | 0x0A2A37 | 0x0A237E | 0x000000 | 0x000000 | 0xD2A815 | 0xD1A842 | 0x0585E9 | 0xD3FE81 |
| vectorOwner08c782 | 0 | - | - | - | - | - | - | - | - | - |
| vectorRestore06c764 | 0 | - | - | - | - | - | - | - | - | - |
| alternateCxMain06c92c | 0 | - | - | - | - | - | - | - | - | - |
| cxDispatchWrapper08c72f | 1 | 2185 | 0x08C72F | 0x08C536 | 0x000500 | 0x00FFFF | 0xD2A815 | 0xD1A85D | 0x0585E9 | 0xD3FE81 |
| cxJpTrampoline08c745 | 1 | 2192 | 0x08C745 | 0x08C734 | 0x000500 | 0x0585E9 | 0xD2A815 | 0xD1A854 | 0x0585E9 | 0xD3FE81 |
| display09efde | 0 | - | - | - | - | - | - | - | - | - |
| display09efcb | 0 | - | - | - | - | - | - | - | - | - |
| display09efe8 | 0 | - | - | - | - | - | - | - | - | - |

### Core Field Transitions

| Block | PC | Prev PC | Timing | Diffs |
|---:|---|---|---|---|
| 1 | 0x08C331 | - | entry-vs-previous-block | D008E0:0x000000->0xD1A863; D0058C:0x000000->0x000005; D0058D:0x000000->0x000005; D0058E:0x000000->0x000005 |
| 142 | 0x03F9D5 | 0x03FA04 | entry-vs-previous-block | D0058D:0x000005->0x000029 |
| 16570 | 0x04C973 | 0x05E851 | entry-vs-previous-block | D0243A:0xD1A8CC->0xD1A8A3 |
| 17722 | 0x02FCB3 | 0x08C359 | entry-vs-previous-block | D0058C:0x000005->0x000000; D0058E:0x000005->0x000000 |


## Compact Evidence

```json
{
  "finding": "Enter pre-wipe stop at 0x001879 did not meet exact patch-readiness criteria; safeCandidate=false.",
  "prestop": {
    "code": "Enter",
    "pc": 6265,
    "label": "enter-prewipe-stop-scope"
  },
  "results": [
    {
      "strategy": {
        "name": "baselineNoStop",
        "preStopEnter": false,
        "stepCap": 190000
      },
      "browserConfig": {
        "preStopEnter": false,
        "stepCap": 190000
      },
      "assessment": {
        "stoppedAtPrewipe": false,
        "saneHomeState": false,
        "cursorStayedAtBaseline": false,
        "cursorMovedToEnterObservedValue": false,
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
        "status": "Key: ENTER → 190000 steps (max_steps, peak 8689px)",
        "lastPc": "0x000B7C",
        "cpu": {
          "pc": "0x000B72",
          "sp": "0xD1A3BC",
          "af": "0x0060B3",
          "bc": "0x00040E",
          "de": "0x0000EA",
          "hl": "0xFFFFD6",
          "ix": "0xD1A3E9",
          "iy": "0xD00080",
          "f": "0xB3",
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
          "D00596": "0x13"
        },
        "diagnostics": {
          "D007CA": 0,
          "D008E0": 0,
          "D0243A": 0,
          "D0243D": 0,
          "D02590": 0,
          "D00595": 4,
          "D00596": 19,
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
          "vramCurrent": 3039,
          "lastKey": {
            "code": "Enter",
            "label": "ENTER",
            "expectedInsertByte": null,
            "controlPreStopPc": 663888,
            "controlPreStopLabel": "enter-context-ldir",
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
              0,
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
          }
        },
        "lastKey": {
          "code": "Enter",
          "label": "ENTER",
          "expectedInsertByte": null,
          "controlPreStopPc": 663888,
          "controlPreStopLabel": "enter-context-ldir",
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
            0,
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
        "reset000000": 1,
        "low000a92": 32512,
        "low000b7c": 2971,
        "coldIdle0019b5": 0,
        "wipe0019be": 0,
        "cleanup001879": 1,
        "cleanupTail0018f8": 1,
        "sentinel001c33": 490,
        "sentinel0158bc": 2,
        "postInsertGate0158de": 2,
        "spaceFillBridge0a2a37": 7,
        "vectorOwner08c782": 0,
        "vectorRestore06c764": 0,
        "alternateCxMain06c92c": 0,
        "cxDispatchWrapper08c72f": 1,
        "cxJpTrampoline08c745": 1,
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
          "count": 30988
        },
        {
          "pc": "0x0021C2",
          "count": 10092
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
          "count": 3717
        },
        {
          "pc": "0x000B7C",
          "count": 2971
        },
        {
          "pc": "0x000B81",
          "count": 2971
        },
        {
          "pc": "0x005AE8",
          "count": 1424
        },
        {
          "pc": "0x005B16",
          "count": 1424
        },
        {
          "pc": "0x005B4B",
          "count": 1424
        },
        {
          "pc": "0x005AB6",
          "count": 1335
        },
        {
          "pc": "0x000B7F",
          "count": 993
        },
        {
          "pc": "0x003D28",
          "count": 637
        },
        {
          "pc": "0x003D25",
          "count": 637
        },
        {
          "pc": "0x001CA6",
          "count": 582
        },
        {
          "pc": "0x001CC0",
          "count": 570
        },
        {
          "pc": "0x001CCA",
          "count": 569
        },
        {
          "pc": "0x0A19A4",
          "count": 560
        },
        {
          "pc": "0x001C33",
          "count": 490
        },
        {
          "pc": "0x001C38",
          "count": 488
        },
        {
          "pc": "0x001C3C",
          "count": 477
        },
        {
          "pc": "0x001CE4",
          "count": 473
        },
        {
          "pc": "0x001C7D",
          "count": 390
        },
        {
          "pc": "0x001C81",
          "count": 390
        },
        {
          "pc": "0x001C82",
          "count": 390
        },
        {
          "pc": "0x001C44",
          "count": 389
        },
        {
          "pc": "0x001C48",
          "count": 389
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
          "pc": "0x0A3404",
          "count": 360
        },
        {
          "pc": "0x0A3411",
          "count": 316
        },
        {
          "pc": "0x0060B3",
          "count": 255
        },
        {
          "pc": "0x001377",
          "count": 254
        }
      ],
      "firstCriticalZero": {
        "source": "observed-before-block",
        "snapshot": {
          "block": 21739,
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
            "stepCount": 21831
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
          "vram": 8689,
          "diagnostics": {
            "D007CA": 0,
            "D008E0": 0,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
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
            "vramCurrent": 8689,
            "lastKey": null
          }
        }
      },
      "first202020": null,
      "firstBadD007CA": {
        "source": "observed-before-block",
        "expected": 361961,
        "snapshot": {
          "block": 21739,
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
            "stepCount": 21831
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
          "vram": 8689,
          "diagnostics": {
            "D007CA": 0,
            "D008E0": 0,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
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
            "vramCurrent": 8689,
            "lastKey": null
          }
        }
      },
      "firstD0243AChange": {
        "source": "observed-before-block",
        "expected": 13740236,
        "snapshot": {
          "block": 16570,
          "pc": 313715,
          "prevPc": 387153,
          "cpu": {
            "pc": 313715,
            "sp": 13740104,
            "af": 1427,
            "bc": 13893249,
            "de": 13740195,
            "hl": 13805630,
            "ix": 13740128,
            "iy": 13631616,
            "f": 147,
            "halted": false,
            "madl": 1,
            "stepCount": 16646
          },
          "fields": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740195,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D00587": 41,
            "D0058C": 5,
            "D0058D": 41,
            "D0058E": 5,
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
              "addr": 13740104,
              "value": 387166
            },
            {
              "addr": 13740107,
              "value": 363680
            },
            {
              "addr": 13740110,
              "value": 1364
            },
            {
              "addr": 13740113,
              "value": 363630
            },
            {
              "addr": 13740116,
              "value": 575293
            },
            {
              "addr": 13740119,
              "value": 1285
            },
            {
              "addr": 13740122,
              "value": 65535
            },
            {
              "addr": 13740125,
              "value": 574778
            }
          ],
          "vram": 8585,
          "diagnostics": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740195,
            "D0243D": 13805630,
            "D02590": 13893249,
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
            "vramCurrent": 8585,
            "lastKey": null
          }
        }
      },
      "d007caTransitions": [
        {
          "block": 21739,
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
              "before": 13740195,
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
              "before": 41,
              "after": 0
            },
            "D02A40": {
              "before": 13805630,
              "after": 0
            }
          }
        }
      ],
      "cursorTransitions": [
        {
          "block": 16570,
          "pc": "0x04C973",
          "prevPc": "0x05E851",
          "timing": "entry-vs-previous-block",
          "diff": {
            "D0243A": {
              "before": 13740236,
              "after": 13740195
            }
          }
        },
        {
          "block": 21739,
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
              "before": 13740195,
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
              "before": 41,
              "after": 0
            },
            "D02A40": {
              "before": 13805630,
              "after": 0
            }
          }
        }
      ],
      "lastBlocks": [
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000BFE",
        "0x000C4A",
        "0x000C80",
        "0x000B37",
        "0x000B60",
        "0x000B7C",
        "0x000B81",
        "0x000B72",
        "0x000B7C",
        "0x000B81",
        "0x000B72",
        "0x000B7C",
        "0x000B81",
        "0x000B72",
        "0x000B7C",
        "0x000B81",
        "0x000B72",
        "0x000B7C",
        "0x000B81",
        "0x000B72",
        "0x000B7C",
        "0x000B81",
        "0x000B72",
        "0x000B7C",
        "0x000B81",
        "0x000B72",
        "0x000B7C",
        "0x000B81",
        "0x000B72",
        "0x000B7C",
        "0x000B81",
        "0x000B72",
        "0x000B7F",
        "0x000B72",
        "0x000B7F",
        "0x000B72",
        "0x000B7F",
        "0x000B72"
      ],
      "pageErrors": []
    },
    {
      "strategy": {
        "name": "preStop001879Only",
        "preStopEnter": true,
        "stepCap": 90000
      },
      "browserConfig": {
        "preStopEnter": true,
        "stepCap": 90000
      },
      "assessment": {
        "stoppedAtPrewipe": true,
        "saneHomeState": false,
        "cursorStayedAtBaseline": false,
        "cursorMovedToEnterObservedValue": true,
        "noZeroOrSpaceCorruption": true,
        "noWipeTail": true,
        "noUnexpectedRestores": true,
        "vramNotWiped": true,
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
        "status": "Key: ENTER → 21830 steps (control_pre_stop, peak 8689px)",
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
          "stepCount": 21830
        },
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0243A": "0xD1A8A3",
          "D0243D": "0xD2A83E",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x29",
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
        "diagnostics": {
          "D007CA": 361961,
          "D008E0": 13740131,
          "D0243A": 13740195,
          "D0243D": 13805630,
          "D02590": 13893249,
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
          "vramCurrent": 8689,
          "lastKey": {
            "code": "Enter",
            "label": "ENTER",
            "expectedInsertByte": null,
            "controlPreStopPc": 6265,
            "controlPreStopLabel": "enter-prewipe-stop-scope",
            "cursorBefore": null,
            "insertBlock": null,
            "postInsertGateBlock": null,
            "stoppedAtPostInsertGate": false,
            "D000C2Bit7Restored": false,
            "controlStopBlock": 21738,
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
            "steps": 21830,
            "termination": "control_pre_stop",
            "wipes": 0,
            "D0243A": 13740195,
            "D0243D": 13805630,
            "D007CA": 361961,
            "D008E0": 13740131,
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
            "vramPeak": 8689,
            "vramCurrent": 8689
          }
        },
        "lastKey": {
          "code": "Enter",
          "label": "ENTER",
          "expectedInsertByte": null,
          "controlPreStopPc": 6265,
          "controlPreStopLabel": "enter-prewipe-stop-scope",
          "cursorBefore": null,
          "insertBlock": null,
          "postInsertGateBlock": null,
          "stoppedAtPostInsertGate": false,
          "D000C2Bit7Restored": false,
          "controlStopBlock": 21738,
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
          "steps": 21830,
          "termination": "control_pre_stop",
          "wipes": 0,
          "D0243A": 13740195,
          "D0243D": 13805630,
          "D007CA": 361961,
          "D008E0": 13740131,
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
          "vramPeak": 8689,
          "vramCurrent": 8689
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
        "sentinel001c33": 486,
        "sentinel0158bc": 2,
        "postInsertGate0158de": 2,
        "spaceFillBridge0a2a37": 7,
        "vectorOwner08c782": 0,
        "vectorRestore06c764": 0,
        "alternateCxMain06c92c": 0,
        "cxDispatchWrapper08c72f": 1,
        "cxJpTrampoline08c745": 1,
        "display09efde": 0,
        "display09efcb": 0,
        "display09efe8": 0
      },
      "hotBlocks": [
        {
          "pc": "0x003D28",
          "count": 630
        },
        {
          "pc": "0x003D25",
          "count": 630
        },
        {
          "pc": "0x001CA6",
          "count": 577
        },
        {
          "pc": "0x001CC0",
          "count": 565
        },
        {
          "pc": "0x001CCA",
          "count": 565
        },
        {
          "pc": "0x0A19A4",
          "count": 560
        },
        {
          "pc": "0x001C33",
          "count": 486
        },
        {
          "pc": "0x001C38",
          "count": 484
        },
        {
          "pc": "0x001C3C",
          "count": 474
        },
        {
          "pc": "0x001CE4",
          "count": 472
        },
        {
          "pc": "0x001C44",
          "count": 387
        },
        {
          "pc": "0x001C7D",
          "count": 387
        },
        {
          "pc": "0x001C81",
          "count": 387
        },
        {
          "pc": "0x001C82",
          "count": 387
        },
        {
          "pc": "0x001C48",
          "count": 387
        },
        {
          "pc": "0x0A3404",
          "count": 360
        },
        {
          "pc": "0x0A3411",
          "count": 316
        },
        {
          "pc": "0x001377",
          "count": 254
        },
        {
          "pc": "0x0A3408",
          "count": 224
        },
        {
          "pc": "0x001C4F",
          "count": 190
        },
        {
          "pc": "0x001C54",
          "count": 190
        },
        {
          "pc": "0x0A1A83",
          "count": 160
        },
        {
          "pc": "0x0A3418",
          "count": 112
        },
        {
          "pc": "0x001CE5",
          "count": 105
        },
        {
          "pc": "0x001C42",
          "count": 97
        },
        {
          "pc": "0x000038",
          "count": 93
        },
        {
          "pc": "0x0006F3",
          "count": 93
        },
        {
          "pc": "0x000704",
          "count": 93
        },
        {
          "pc": "0x000710",
          "count": 93
        },
        {
          "pc": "0x001713",
          "count": 93
        },
        {
          "pc": "0x0008BB",
          "count": 93
        },
        {
          "pc": "0x001717",
          "count": 93
        },
        {
          "pc": "0x001718",
          "count": 93
        },
        {
          "pc": "0x00171E",
          "count": 93
        },
        {
          "pc": "0x0067F8",
          "count": 93
        },
        {
          "pc": "0x001CCE",
          "count": 93
        },
        {
          "pc": "0x001CD5",
          "count": 93
        },
        {
          "pc": "0x006808",
          "count": 93
        },
        {
          "pc": "0x006810",
          "count": 93
        },
        {
          "pc": "0x006812",
          "count": 93
        }
      ],
      "firstCriticalZero": null,
      "first202020": null,
      "firstBadD007CA": null,
      "firstD0243AChange": {
        "source": "observed-before-block",
        "expected": 13740236,
        "snapshot": {
          "block": 16570,
          "pc": 313715,
          "prevPc": 387153,
          "cpu": {
            "pc": 313715,
            "sp": 13740104,
            "af": 1427,
            "bc": 13893249,
            "de": 13740195,
            "hl": 13805630,
            "ix": 13740128,
            "iy": 13631616,
            "f": 147,
            "halted": false,
            "madl": 1,
            "stepCount": 16646
          },
          "fields": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740195,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D00587": 41,
            "D0058C": 5,
            "D0058D": 41,
            "D0058E": 5,
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
              "addr": 13740104,
              "value": 387166
            },
            {
              "addr": 13740107,
              "value": 363680
            },
            {
              "addr": 13740110,
              "value": 1364
            },
            {
              "addr": 13740113,
              "value": 363630
            },
            {
              "addr": 13740116,
              "value": 575293
            },
            {
              "addr": 13740119,
              "value": 1285
            },
            {
              "addr": 13740122,
              "value": 65535
            },
            {
              "addr": 13740125,
              "value": 574778
            }
          ],
          "vram": 8585,
          "diagnostics": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740195,
            "D0243D": 13805630,
            "D02590": 13893249,
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
            "vramCurrent": 8585,
            "lastKey": null
          }
        }
      },
      "d007caTransitions": [],
      "cursorTransitions": [
        {
          "block": 16570,
          "pc": "0x04C973",
          "prevPc": "0x05E851",
          "timing": "entry-vs-previous-block",
          "diff": {
            "D0243A": {
              "before": 13740236,
              "after": 13740195
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


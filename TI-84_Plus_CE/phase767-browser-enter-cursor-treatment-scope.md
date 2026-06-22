# Phase 767 Browser Enter Cursor-Treatment Scope

Probe: `probe-phase767-browser-enter-cursor-treatment-scope.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase767-browser-enter-cursor-treatment-scope.mjs`

Serves an in-memory instrumented current `browser-shell.html`, boots coldboot with Preserve Display, presses `Enter`, and compares the phase766 bounded pre-stop against an in-memory cursor-treatment candidate that restores only `D0243A` at `0x001879`.

This probe intentionally does not patch disk `browser-shell.html`; it tests whether a later disk patch can be limited to a control pre-stop plus a narrow cursor writeback with no context-vector restore.

## Result

- Enter cursor-treatment candidate is bounded and sane: stop at 0x001879, restore only D0243A to 0xD1A8CC, no context-vector restore.
- Pre-stop-only cursor delta: D0243A 0xD1A8CC->0xD1A8A3 appears at nextPc=0x04C973; owner is previous block 0x05E851 (block 16570).
- Pre-stop-only: termination=control_pre_stop, stop=0x001879, D007CA=0x0585E9, D008E0=0xD1A863, D02590=0xD3FE81, D0243A=0xD1A8A3, D0243D=0xD2A83E, VRAM=8689, cleanupTail=0.
- Cursor-fix final: termination=control_pre_stop, stop=0x001879, D007CA=0x0585E9, D008E0=0xD1A863, D02590=0xD3FE81, D0243A=0xD1A8CC, D0243D=0xD2A83E, VRAM=8689, cleanupTail=0, correction=0xD1A8A3->0xD1A8CC at 0x001879.

## Strategy Matrix

| Strategy | Cursor fix | Safe candidate | Termination | Steps | Stop | Last PC | D007CA | D008E0 | D02590 | D0243A | D0243D | VRAM | Corrections | Wipe tail | Page errors |
|---|---|---|---|---:|---|---|---|---|---|---|---|---:|---:|---:|---:|
| preStop001879Only | no | NO | control_pre_stop | 21830 | 0x001879 | 0x08C331 | 0x0585E9 | 0xD1A863 | 0xD3FE81 | 0xD1A8A3 | 0xD2A83E | 8689 | 0 | 0 | 0 |
| cursorFixAt001879 | yes | YES | control_pre_stop | 21830 | 0x001879 | 0x08C331 | 0x0585E9 | 0xD1A863 | 0xD3FE81 | 0xD1A8CC | 0xD2A83E | 8689 | 1 | 0 | 0 |

## Strategy: preStop001879Only

- Config: preStopEnter=true, cursorFixAtStop=false, stepCap=90000.
- Assessment: stoppedAtPrewipe=true, saneHomeState=false, cursorStayedAtBaseline=false, cursorMovedToEnterObservedValue=true, cursorFixApplied=false, cursorTreatmentAsExpected=true, noZeroOrSpaceCorruption=true, noWipeTail=true, noContextVectorRestore=true, vramNotWiped=true, noPageErrors=true, safeCandidate=false.
- Key result: termination=control_pre_stop, steps=21830, controlStop=0x001879, controlLabel=enter-prewipe-cursor-treatment-scope, lastPc=0x08C331, contextRestoreEnabled=false, contextRestored=false.
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

### Cursor Corrections

_No cursor correction applied._

## Strategy: cursorFixAt001879

- Config: preStopEnter=true, cursorFixAtStop=true, stepCap=90000.
- Assessment: stoppedAtPrewipe=true, saneHomeState=true, cursorStayedAtBaseline=true, cursorMovedToEnterObservedValue=false, cursorFixApplied=true, cursorTreatmentAsExpected=true, noZeroOrSpaceCorruption=true, noWipeTail=true, noContextVectorRestore=true, vramNotWiped=true, noPageErrors=true, safeCandidate=true.
- Key result: termination=control_pre_stop, steps=21830, controlStop=0x001879, controlLabel=enter-prewipe-cursor-treatment-scope, lastPc=0x08C331, contextRestoreEnabled=false, contextRestored=false.
- Final fields: D007CA=0x0585E9, D008E0=0xD1A863, D02590=0xD3FE81, D0243A=0xD1A8CC, D0243D=0xD2A83E, VRAM=8689, pageErrors=0.
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
| 21738 | 0x001879 | 0x001872 | after-persistence-hook | D0243A:0xD1A8A3->0xD1A8CC |

### Cursor Corrections

| Block | PC | Prev PC | D0243A before | D0243A after | Target |
|---:|---|---|---|---|---|
| 21738 | 0x001879 | 0x001872 | 0xD1A8A3 | 0xD1A8CC | 0xD1A8CC |


## Compact Evidence

```json
{
  "finding": "Enter cursor-treatment candidate is bounded and sane: stop at 0x001879, restore only D0243A to 0xD1A8CC, no context-vector restore.",
  "prestop": {
    "code": "Enter",
    "pc": 6265,
    "label": "enter-prewipe-cursor-treatment-scope"
  },
  "results": [
    {
      "strategy": {
        "name": "preStop001879Only",
        "preStopEnter": true,
        "cursorFixAtStop": false,
        "stepCap": 90000
      },
      "browserConfig": {
        "preStopEnter": true,
        "cursorFixAtStop": false,
        "stepCap": 90000
      },
      "assessment": {
        "stoppedAtPrewipe": true,
        "saneHomeState": false,
        "cursorStayedAtBaseline": false,
        "cursorMovedToEnterObservedValue": true,
        "cursorFixApplied": false,
        "cursorTreatmentAsExpected": true,
        "noZeroOrSpaceCorruption": true,
        "noWipeTail": true,
        "noContextVectorRestore": true,
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
            "controlPreStopLabel": "enter-prewipe-cursor-treatment-scope",
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
          "controlPreStopLabel": "enter-prewipe-cursor-treatment-scope",
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
      "cursorCorrections": [],
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
    },
    {
      "strategy": {
        "name": "cursorFixAt001879",
        "preStopEnter": true,
        "cursorFixAtStop": true,
        "stepCap": 90000
      },
      "browserConfig": {
        "preStopEnter": true,
        "cursorFixAtStop": true,
        "stepCap": 90000
      },
      "assessment": {
        "stoppedAtPrewipe": true,
        "saneHomeState": true,
        "cursorStayedAtBaseline": true,
        "cursorMovedToEnterObservedValue": false,
        "cursorFixApplied": true,
        "cursorTreatmentAsExpected": true,
        "noZeroOrSpaceCorruption": true,
        "noWipeTail": true,
        "noContextVectorRestore": true,
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
          "D0243A": "0xD1A8CC",
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
          "D0243A": 13740236,
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
            "controlPreStopLabel": "enter-prewipe-cursor-treatment-scope",
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
            "D0243A": 13740236,
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
          "controlPreStopLabel": "enter-prewipe-cursor-treatment-scope",
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
          "D0243A": 13740236,
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
        },
        {
          "block": 21738,
          "pc": "0x001879",
          "prevPc": "0x001872",
          "timing": "after-persistence-hook",
          "diff": {
            "D0243A": {
              "before": 13740195,
              "after": 13740236
            }
          }
        }
      ],
      "cursorCorrections": [
        {
          "block": 21738,
          "pc": "0x001879",
          "prevPc": "0x001872",
          "before": 13740195,
          "after": 13740236,
          "target": 13740236
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


# Phase 777 Browser KeyV Pre-Stop Scope

Probe: `probe-phase777-browser-keyv-corruption-scope.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase777-browser-keyv-corruption-scope.mjs`

Serves an in-memory instrumented current `browser-shell.html`, boots coldboot with Preserve Display, presses `KeyV`, and compares a no-stop corruption baseline against an in-memory `KeyV` control pre-stop at `0x001879`.

This probe intentionally does not patch disk `browser-shell.html`; it tests whether a later disk patch can be limited to a control pre-stop with no context-vector restore or cursor restore.

## Result

- KeyV pre-wipe stop at 0x001879 is bounded and preserves home cx/VAT/cursor state without context-vector or cursor restore.
- Baseline/no-stop: termination=max_steps, steps=190000, D007CA=0x000000, D02590=0x000000, firstCriticalZero=observed-before-block, cleanupTail=1.
- Pre-stop-only: termination=control_pre_stop, stop=0x001879, D007CA=0x0585E9, D008E0=0xD1A863, D02590=0xD3FE81, D0243A=0xD1A8CC, D0243D=0xD2A83E, VRAM=9486, cleanupTail=0.

## Strategy Matrix

| Strategy | Pre-stop | Safe candidate | Termination | Steps | Stop | Last PC | D007CA | D008E0 | D02590 | D0243A | D0243D | VRAM | Wipe tail | Page errors |
|---|---|---|---|---:|---|---|---|---|---|---|---|---:|---:|---:|
| baselineNoStop | no | NO | max_steps | 190000 | - | 0x006CDF | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 3031 | 1 | 0 |
| preStop001879Only | yes | YES | control_pre_stop | 104376 | 0x001879 | 0x08C331 | 0x0585E9 | 0xD1A863 | 0xD3FE81 | 0xD1A8CC | 0xD2A83E | 9486 | 0 | 0 |

## Strategy: baselineNoStop

- Config: preStopKeyV=false, stepCap=190000.
- Assessment: stoppedAtPrewipe=false, saneHomeState=false, cursorPreserved=false, noZeroOrSpaceCorruption=false, noWipeTail=false, noUnexpectedRestores=true, vramNotWiped=false, noPageErrors=true, safeCandidate=false.
- Key result: termination=max_steps, steps=190000, controlStop=-, controlLabel=-, lastPc=0x006CDF, contextRestoreEnabled=false, contextRestored=false, cursorRestored=false.
- Final fields: D007CA=0x000000, D008E0=0x000000, D02590=0x000000, D0243A=0x000000, D0243D=0x000000, VRAM=3031, pageErrors=0.
- First D007CA transition: block 104331, prevPc=0x001879, nextPc=0x0018F8, 0x0585E9->0x000000.
- First D0243A transition: block 104331, prevPc=0x001879, nextPc=0x0018F8, 0xD1A8CC->0x000000.
- Target hits: spaceFillBridge0a2a37=3, cleanup001879=1, cleanupTail0018f8=1, vectorOwner08c782=0, vectorRestore06c764=0, alternateCxMain06c92c=0, sentinel0158bc=2, postInsertGate0158de=2, low000a92=0, low000b7c=0.

### Target Hits

| Target | Hits | First block | PC | Prev PC | BC | HL | DE | SP | D007CA | D02590 |
|---|---:|---:|---|---|---|---|---|---|---|---|
| reset000000 | 1 | 103761 | 0x000000 | 0x03D0E0 | 0x000000 | 0x000002 | 0xD1A7FC | 0xF9DD11 | 0x0585E9 | 0xD3FE81 |
| rst000038 | 47 | 3 | 0x000038 | 0x05C634 | 0x000000 | 0xD1A8A3 | 0xD2A815 | 0xD1A85D | 0x0585E9 | 0xD3FE81 |
| low000a92 | 0 | - | - | - | - | - | - | - | - | - |
| low000b7c | 0 | - | - | - | - | - | - | - | - | - |
| coldIdle0019b5 | 0 | - | - | - | - | - | - | - | - | - |
| wipe0019be | 0 | - | - | - | - | - | - | - | - | - |
| cleanup001879 | 1 | 104330 | 0x001879 | 0x001872 | 0x000003 | 0x000000 | 0x000430 | 0xD1A87B | 0x0585E9 | 0xD3FE81 |
| cleanupTail0018f8 | 1 | 104331 | 0x0018F8 | 0x001879 | 0x0000FF | 0xD3FEFF | 0xD3FF00 | 0xD1A87B | 0x000000 | 0x000000 |
| sentinel001c33 | 269 | 22 | 0x001C33 | 0x006808 | 0x09D6B4 | 0x020006 | 0x0080C0 | 0xD1A845 | 0x0585E9 | 0xD3FE81 |
| sentinel0158bc | 2 | 104126 | 0x0158BC | 0x0158E8 | 0x00A005 | 0x000000 | 0xD1A7FC | 0xD1A878 | 0x0585E9 | 0xD3FE81 |
| postInsertGate0158de | 2 | 104124 | 0x0158DE | 0x0013C7 | 0x00A005 | 0x000000 | 0xD1A7FC | 0xD1A87B | 0x0585E9 | 0xD3FE81 |
| cursorOwner05e348 | 0 | - | - | - | - | - | - | - | - | - |
| cursorNext05e372 | 0 | - | - | - | - | - | - | - | - | - |
| eolOwner0a229d | 0 | - | - | - | - | - | - | - | - | - |
| eolTail0a22a4 | 0 | - | - | - | - | - | - | - | - | - |
| spaceFillBridge0a2a37 | 3 | 585 | 0x0A2A37 | 0x0A237E | 0x000000 | 0x000000 | 0xD2A815 | 0xD1A842 | 0x0585E9 | 0xD3FE81 |
| vectorOwner08c782 | 0 | - | - | - | - | - | - | - | - | - |
| vectorRestore06c764 | 0 | - | - | - | - | - | - | - | - | - |
| alternateCxMain06c92c | 0 | - | - | - | - | - | - | - | - | - |
| cxDispatchWrapper08c72f | 0 | - | - | - | - | - | - | - | - | - |
| cxJpTrampoline08c745 | 0 | - | - | - | - | - | - | - | - | - |
| display09efde | 68988 | 2805 | 0x09EFDE | 0x09EFB7 | 0x009595 | 0xD42304 | 0x0052AA | 0xD1A833 | 0x0585E9 | 0xD3FE81 |
| display09efcb | 429 | 2956 | 0x09EFCB | 0x09EFEC | 0x00012B | 0xD42584 | 0x0052AA | 0xD1A839 | 0x0585E9 | 0xD3FE81 |
| display09efe8 | 432 | 2954 | 0x09EFE8 | 0x09EFDE | 0x000095 | 0xD42558 | 0x0052AA | 0xD1A833 | 0x0585E9 | 0xD3FE81 |

### Core Field Transitions

| Block | PC | Prev PC | Timing | Diffs |
|---:|---|---|---|---|
| 1 | 0x08C331 | - | entry-vs-previous-block | D008E0:0x000000->0xD1A863; D0058C:0x000000->0x000035; D0058D:0x000000->0x000035; D0058E:0x000000->0x000035 |
| 148 | 0x03F9D5 | 0x03FA04 | entry-vs-previous-block | D0058D:0x000035->0x000027 |
| 61357 | 0x02FCB3 | 0x08C359 | entry-vs-previous-block | D0058C:0x000035->0x000000; D0058E:0x000035->0x000000 |
| 61572 | 0x08C38A | 0x08C366 | entry-vs-previous-block | D0058C:0x000000->0x00002C |
| 102353 | 0x02FCB3 | 0x08C359 | entry-vs-previous-block | D0058C:0x00002C->0x000000 |
| 104331 | 0x0018F8 | 0x001879 | entry-vs-previous-block | D007CA:0x0585E9->0x000000; D008E0:0xD1A863->0x000000; D0243A:0xD1A8CC->0x000000; D0243D:0xD2A83E->0x000000; D02590:0xD3FE81->0x000000; D0058D:0x000027->0x000000 |

## Strategy: preStop001879Only

- Config: preStopKeyV=true, stepCap=130000.
- Assessment: stoppedAtPrewipe=true, saneHomeState=true, cursorPreserved=true, noZeroOrSpaceCorruption=true, noWipeTail=true, noUnexpectedRestores=true, vramNotWiped=true, noPageErrors=true, safeCandidate=true.
- Key result: termination=control_pre_stop, steps=104376, controlStop=0x001879, controlLabel=keyv-prewipe-stop, lastPc=0x08C331, contextRestoreEnabled=false, contextRestored=false, cursorRestored=false.
- Final fields: D007CA=0x0585E9, D008E0=0xD1A863, D02590=0xD3FE81, D0243A=0xD1A8CC, D0243D=0xD2A83E, VRAM=9486, pageErrors=0.
- First D007CA transition: none captured.
- First D0243A transition: none captured.
- Target hits: spaceFillBridge0a2a37=3, cleanup001879=1, cleanupTail0018f8=0, vectorOwner08c782=0, vectorRestore06c764=0, alternateCxMain06c92c=0, sentinel0158bc=2, postInsertGate0158de=2, low000a92=0, low000b7c=0.

### Target Hits

| Target | Hits | First block | PC | Prev PC | BC | HL | DE | SP | D007CA | D02590 |
|---|---:|---:|---|---|---|---|---|---|---|---|
| reset000000 | 1 | 103761 | 0x000000 | 0x03D0E0 | 0x000000 | 0x000002 | 0xD1A7FC | 0xF9DD11 | 0x0585E9 | 0xD3FE81 |
| rst000038 | 47 | 3 | 0x000038 | 0x05C634 | 0x000000 | 0xD1A8A3 | 0xD2A815 | 0xD1A85D | 0x0585E9 | 0xD3FE81 |
| low000a92 | 0 | - | - | - | - | - | - | - | - | - |
| low000b7c | 0 | - | - | - | - | - | - | - | - | - |
| coldIdle0019b5 | 0 | - | - | - | - | - | - | - | - | - |
| wipe0019be | 0 | - | - | - | - | - | - | - | - | - |
| cleanup001879 | 1 | 104330 | 0x001879 | 0x001872 | 0x000003 | 0x000000 | 0x000430 | 0xD1A87B | 0x0585E9 | 0xD3FE81 |
| cleanupTail0018f8 | 0 | - | - | - | - | - | - | - | - | - |
| sentinel001c33 | 266 | 22 | 0x001C33 | 0x006808 | 0x09D6B4 | 0x020006 | 0x0080C0 | 0xD1A845 | 0x0585E9 | 0xD3FE81 |
| sentinel0158bc | 2 | 104126 | 0x0158BC | 0x0158E8 | 0x00A005 | 0x000000 | 0xD1A7FC | 0xD1A878 | 0x0585E9 | 0xD3FE81 |
| postInsertGate0158de | 2 | 104124 | 0x0158DE | 0x0013C7 | 0x00A005 | 0x000000 | 0xD1A7FC | 0xD1A87B | 0x0585E9 | 0xD3FE81 |
| cursorOwner05e348 | 0 | - | - | - | - | - | - | - | - | - |
| cursorNext05e372 | 0 | - | - | - | - | - | - | - | - | - |
| eolOwner0a229d | 0 | - | - | - | - | - | - | - | - | - |
| eolTail0a22a4 | 0 | - | - | - | - | - | - | - | - | - |
| spaceFillBridge0a2a37 | 3 | 585 | 0x0A2A37 | 0x0A237E | 0x000000 | 0x000000 | 0xD2A815 | 0xD1A842 | 0x0585E9 | 0xD3FE81 |
| vectorOwner08c782 | 0 | - | - | - | - | - | - | - | - | - |
| vectorRestore06c764 | 0 | - | - | - | - | - | - | - | - | - |
| alternateCxMain06c92c | 0 | - | - | - | - | - | - | - | - | - |
| cxDispatchWrapper08c72f | 0 | - | - | - | - | - | - | - | - | - |
| cxJpTrampoline08c745 | 0 | - | - | - | - | - | - | - | - | - |
| display09efde | 68988 | 2805 | 0x09EFDE | 0x09EFB7 | 0x009595 | 0xD42304 | 0x0052AA | 0xD1A833 | 0x0585E9 | 0xD3FE81 |
| display09efcb | 429 | 2956 | 0x09EFCB | 0x09EFEC | 0x00012B | 0xD42584 | 0x0052AA | 0xD1A839 | 0x0585E9 | 0xD3FE81 |
| display09efe8 | 432 | 2954 | 0x09EFE8 | 0x09EFDE | 0x000095 | 0xD42558 | 0x0052AA | 0xD1A833 | 0x0585E9 | 0xD3FE81 |

### Core Field Transitions

| Block | PC | Prev PC | Timing | Diffs |
|---:|---|---|---|---|
| 1 | 0x08C331 | - | entry-vs-previous-block | D008E0:0x000000->0xD1A863; D0058C:0x000000->0x000035; D0058D:0x000000->0x000035; D0058E:0x000000->0x000035 |
| 148 | 0x03F9D5 | 0x03FA04 | entry-vs-previous-block | D0058D:0x000035->0x000027 |
| 61357 | 0x02FCB3 | 0x08C359 | entry-vs-previous-block | D0058C:0x000035->0x000000; D0058E:0x000035->0x000000 |
| 61572 | 0x08C38A | 0x08C366 | entry-vs-previous-block | D0058C:0x000000->0x00002C |
| 102353 | 0x02FCB3 | 0x08C359 | entry-vs-previous-block | D0058C:0x00002C->0x000000 |


## Compact Evidence

```json
{
  "finding": "KeyV pre-wipe stop at 0x001879 is bounded and preserves home cx/VAT/cursor state without context-vector or cursor restore.",
  "prestop": {
    "code": "KeyV",
    "pc": 6265,
    "label": "keyv-prewipe-stop"
  },
  "results": [
    {
      "strategy": {
        "name": "baselineNoStop",
        "preStopKeyV": false,
        "stepCap": 190000
      },
      "browserConfig": {
        "preStopKeyV": false,
        "stepCap": 190000
      },
      "assessment": {
        "stoppedAtPrewipe": false,
        "saneHomeState": false,
        "cursorPreserved": false,
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
        "status": "Key: VARS → 190000 steps (max_steps, peak 12557px)",
        "lastPc": "0x006CDF",
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
        "lastKey": {
          "code": "KeyV",
          "label": "VARS",
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
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0
          ],
          "vramPeak": 12557,
          "vramCurrent": 3031
        },
        "pageErrors": []
      },
      "targetCounts": {
        "reset000000": 1,
        "rst000038": 47,
        "low000a92": 0,
        "low000b7c": 0,
        "coldIdle0019b5": 0,
        "wipe0019be": 0,
        "cleanup001879": 1,
        "cleanupTail0018f8": 1,
        "sentinel001c33": 269,
        "sentinel0158bc": 2,
        "postInsertGate0158de": 2,
        "cursorOwner05e348": 0,
        "cursorNext05e372": 0,
        "eolOwner0a229d": 0,
        "eolTail0a22a4": 0,
        "spaceFillBridge0a2a37": 3,
        "vectorOwner08c782": 0,
        "vectorRestore06c764": 0,
        "alternateCxMain06c92c": 0,
        "cxDispatchWrapper08c72f": 0,
        "cxJpTrampoline08c745": 0,
        "display09efde": 68988,
        "display09efcb": 429,
        "display09efe8": 432
      },
      "hotBlocks": [
        {
          "pc": "0x09EFDE",
          "count": 68988
        },
        {
          "pc": "0x0021C2",
          "count": 9542
        },
        {
          "pc": "0x006D5D",
          "count": 9538
        },
        {
          "pc": "0x006D64",
          "count": 9538
        },
        {
          "pc": "0x006CDF",
          "count": 9535
        },
        {
          "pc": "0x006D0F",
          "count": 9535
        },
        {
          "pc": "0x006D38",
          "count": 9534
        },
        {
          "pc": "0x006D4F",
          "count": 9534
        },
        {
          "pc": "0x006CF7",
          "count": 9533
        },
        {
          "pc": "0x0A189E",
          "count": 1532
        },
        {
          "pc": "0x0A190D",
          "count": 1532
        },
        {
          "pc": "0x0A191F",
          "count": 1532
        },
        {
          "pc": "0x0A1969",
          "count": 1532
        },
        {
          "pc": "0x0A1980",
          "count": 1532
        },
        {
          "pc": "0x0A19D7",
          "count": 1532
        },
        {
          "pc": "0x0A1A1D",
          "count": 1532
        },
        {
          "pc": "0x0A1854",
          "count": 1510
        },
        {
          "pc": "0x0A19CC",
          "count": 1500
        },
        {
          "pc": "0x0A187C",
          "count": 1424
        },
        {
          "pc": "0x0A1976",
          "count": 1424
        },
        {
          "pc": "0x005AE8",
          "count": 1392
        },
        {
          "pc": "0x005B16",
          "count": 1392
        },
        {
          "pc": "0x005B4B",
          "count": 1392
        },
        {
          "pc": "0x0A188A",
          "count": 1316
        },
        {
          "pc": "0x0A1939",
          "count": 1316
        },
        {
          "pc": "0x005AB6",
          "count": 1305
        },
        {
          "pc": "0x09EFE8",
          "count": 432
        },
        {
          "pc": "0x09EFCB",
          "count": 429
        },
        {
          "pc": "0x09EFEF",
          "count": 420
        },
        {
          "pc": "0x003D28",
          "count": 315
        },
        {
          "pc": "0x003D25",
          "count": 315
        },
        {
          "pc": "0x001CA6",
          "count": 314
        },
        {
          "pc": "0x001CC0",
          "count": 294
        },
        {
          "pc": "0x001CCA",
          "count": 293
        },
        {
          "pc": "0x001C33",
          "count": 269
        },
        {
          "pc": "0x001C38",
          "count": 267
        },
        {
          "pc": "0x003D40",
          "count": 264
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
          "pc": "0x001C3C",
          "count": 248
        }
      ],
      "firstCriticalZero": {
        "source": "observed-before-block",
        "snapshot": {
          "block": 104331,
          "step": 104377,
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
            "stepCount": 104377
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
          "vram": 9486,
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
              "nonWhite": 261
            },
            "vramCurrent": 9486,
            "lastKey": null
          }
        }
      },
      "first202020": null,
      "firstBadD007CA": {
        "source": "observed-before-block",
        "expected": 361961,
        "snapshot": {
          "block": 104331,
          "step": 104377,
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
            "stepCount": 104377
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
          "vram": 9486,
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
              "nonWhite": 261
            },
            "vramCurrent": 9486,
            "lastKey": null
          }
        }
      },
      "firstD0243AChange": {
        "source": "observed-before-block",
        "expected": 13740236,
        "snapshot": {
          "block": 104331,
          "step": 104377,
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
            "stepCount": 104377
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
          "vram": 9486,
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
              "nonWhite": 261
            },
            "vramCurrent": 9486,
            "lastKey": null
          }
        }
      },
      "d007caTransitions": [
        {
          "block": 104331,
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
              "before": 13740236,
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
              "before": 39,
              "after": 0
            },
            "D02A40": {
              "before": 13805630,
              "after": 0
            },
            "D00595": {
              "before": 1,
              "after": 0
            },
            "D00596": {
              "before": 10,
              "after": 0
            }
          }
        }
      ],
      "cursorTransitions": [
        {
          "block": 104331,
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
              "before": 13740236,
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
              "before": 39,
              "after": 0
            },
            "D02A40": {
              "before": 13805630,
              "after": 0
            },
            "D00595": {
              "before": 1,
              "after": 0
            },
            "D00596": {
              "before": 10,
              "after": 0
            }
          }
        }
      ],
      "lastBlocks": [
        "0x006CDF",
        "0x006CF7",
        "0x006D0F",
        "0x006D38",
        "0x006D4F",
        "0x006D5D",
        "0x0021C2",
        "0x006D64",
        "0x006CDF",
        "0x006CF7",
        "0x006D0F",
        "0x006D38",
        "0x006D4F",
        "0x006D5D",
        "0x0021C2",
        "0x006D64",
        "0x006CDF",
        "0x006CF7",
        "0x006D0F",
        "0x006D38",
        "0x006D4F",
        "0x006D5D",
        "0x0021C2",
        "0x006D64",
        "0x006CDF",
        "0x006CF7",
        "0x006D0F",
        "0x006D38",
        "0x006D4F",
        "0x006D5D",
        "0x0021C2",
        "0x006D64",
        "0x006CDF",
        "0x006CF7",
        "0x006D0F",
        "0x006D38",
        "0x006D4F",
        "0x006D5D",
        "0x0021C2",
        "0x006D64",
        "0x006CDF",
        "0x006CF7",
        "0x006D0F",
        "0x006D38",
        "0x006D4F",
        "0x006D5D",
        "0x0021C2",
        "0x006D64",
        "0x006CDF",
        "0x006CF7",
        "0x006D0F",
        "0x006D38",
        "0x006D4F",
        "0x006D5D",
        "0x0021C2",
        "0x006D64",
        "0x006CDF",
        "0x006CF7",
        "0x006D0F",
        "0x006D38",
        "0x006D4F",
        "0x006D5D",
        "0x0021C2",
        "0x006D64",
        "0x006CDF",
        "0x006CF7",
        "0x006D0F",
        "0x006D38",
        "0x006D4F",
        "0x006D5D",
        "0x0021C2",
        "0x006D64",
        "0x006CDF",
        "0x006CF7",
        "0x006D0F",
        "0x006D38",
        "0x006D4F",
        "0x006D5D",
        "0x0021C2",
        "0x006D64",
        "0x006CDF",
        "0x006CF7",
        "0x006D0F",
        "0x006D38",
        "0x006D4F",
        "0x006D5D",
        "0x0021C2",
        "0x006D64",
        "0x006CDF",
        "0x006CF7",
        "0x006D0F",
        "0x006D38",
        "0x006D4F",
        "0x006D5D",
        "0x0021C2",
        "0x006D64",
        "0x006CDF",
        "0x006CF7",
        "0x006D0F",
        "0x006D38",
        "0x006D4F",
        "0x006D5D",
        "0x0021C2",
        "0x006D64",
        "0x006CDF",
        "0x006CF7",
        "0x006D0F",
        "0x006D38",
        "0x006D4F",
        "0x006D5D",
        "0x0021C2",
        "0x006D64",
        "0x006CDF",
        "0x006CF7",
        "0x006D0F",
        "0x006D38",
        "0x006D4F",
        "0x006D5D",
        "0x0021C2",
        "0x006D64",
        "0x006CDF",
        "0x006CF7",
        "0x006D0F",
        "0x006D38",
        "0x006D4F",
        "0x006D5D",
        "0x0021C2",
        "0x006D64",
        "0x006CDF",
        "0x006CF7",
        "0x006D0F",
        "0x006D38",
        "0x006D4F",
        "0x006D5D",
        "0x0021C2",
        "0x006D64",
        "0x006CDF",
        "0x006CF7",
        "0x006D0F",
        "0x006D38",
        "0x006D4F",
        "0x006D5D",
        "0x0021C2",
        "0x006D64",
        "0x006CDF",
        "0x006CF7",
        "0x006D0F",
        "0x006D38",
        "0x006D4F",
        "0x006D5D",
        "0x0021C2",
        "0x006D64",
        "0x006CDF",
        "0x006CF7",
        "0x006D0F",
        "0x006D38",
        "0x006D4F",
        "0x006D5D",
        "0x0021C2",
        "0x006D64"
      ],
      "pageErrors": []
    },
    {
      "strategy": {
        "name": "preStop001879Only",
        "preStopKeyV": true,
        "stepCap": 130000
      },
      "browserConfig": {
        "preStopKeyV": true,
        "stepCap": 130000
      },
      "assessment": {
        "stoppedAtPrewipe": true,
        "saneHomeState": true,
        "cursorPreserved": true,
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
        "status": "Key: VARS → 104376 steps (control_pre_stop, peak 12557px)",
        "lastPc": "0x08C331",
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x27",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D000C2": "0x00",
          "D02A28": "0x00",
          "D02A29": "0x000000",
          "D02A40": "0xD2A83E",
          "D00595": "0x01",
          "D00596": "0x0A"
        },
        "lastKey": {
          "code": "KeyV",
          "label": "VARS",
          "expectedInsertByte": null,
          "controlPreStopPc": 6265,
          "controlPreStopLabel": "keyv-prewipe-stop",
          "cursorBefore": null,
          "insertBlock": null,
          "postInsertGateBlock": null,
          "stoppedAtPostInsertGate": false,
          "D000C2Bit7Restored": false,
          "controlStopBlock": 104330,
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
          "steps": 104376,
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
          "vramPeak": 12557,
          "vramCurrent": 9486
        },
        "pageErrors": []
      },
      "targetCounts": {
        "reset000000": 1,
        "rst000038": 47,
        "low000a92": 0,
        "low000b7c": 0,
        "coldIdle0019b5": 0,
        "wipe0019be": 0,
        "cleanup001879": 1,
        "cleanupTail0018f8": 0,
        "sentinel001c33": 266,
        "sentinel0158bc": 2,
        "postInsertGate0158de": 2,
        "cursorOwner05e348": 0,
        "cursorNext05e372": 0,
        "eolOwner0a229d": 0,
        "eolTail0a22a4": 0,
        "spaceFillBridge0a2a37": 3,
        "vectorOwner08c782": 0,
        "vectorRestore06c764": 0,
        "alternateCxMain06c92c": 0,
        "cxDispatchWrapper08c72f": 0,
        "cxJpTrampoline08c745": 0,
        "display09efde": 68988,
        "display09efcb": 429,
        "display09efe8": 432
      },
      "hotBlocks": [
        {
          "pc": "0x09EFDE",
          "count": 68988
        },
        {
          "pc": "0x0A189E",
          "count": 1532
        },
        {
          "pc": "0x0A190D",
          "count": 1532
        },
        {
          "pc": "0x0A191F",
          "count": 1532
        },
        {
          "pc": "0x0A1969",
          "count": 1532
        },
        {
          "pc": "0x0A1980",
          "count": 1532
        },
        {
          "pc": "0x0A19D7",
          "count": 1532
        },
        {
          "pc": "0x0A1A1D",
          "count": 1532
        },
        {
          "pc": "0x0A1854",
          "count": 1510
        },
        {
          "pc": "0x0A19CC",
          "count": 1500
        },
        {
          "pc": "0x0A187C",
          "count": 1424
        },
        {
          "pc": "0x0A1976",
          "count": 1424
        },
        {
          "pc": "0x0A188A",
          "count": 1316
        },
        {
          "pc": "0x0A1939",
          "count": 1316
        },
        {
          "pc": "0x09EFE8",
          "count": 432
        },
        {
          "pc": "0x09EFCB",
          "count": 429
        },
        {
          "pc": "0x09EFEF",
          "count": 420
        },
        {
          "pc": "0x001CA6",
          "count": 311
        },
        {
          "pc": "0x003D28",
          "count": 308
        },
        {
          "pc": "0x003D25",
          "count": 308
        },
        {
          "pc": "0x001CC0",
          "count": 291
        },
        {
          "pc": "0x001CCA",
          "count": 291
        },
        {
          "pc": "0x001C33",
          "count": 266
        },
        {
          "pc": "0x001C38",
          "count": 264
        },
        {
          "pc": "0x003D40",
          "count": 264
        },
        {
          "pc": "0x001377",
          "count": 254
        },
        {
          "pc": "0x001C3C",
          "count": 246
        },
        {
          "pc": "0x001CE4",
          "count": 244
        },
        {
          "pc": "0x0A19A4",
          "count": 224
        },
        {
          "pc": "0x0A3404",
          "count": 216
        },
        {
          "pc": "0x0A188C",
          "count": 216
        },
        {
          "pc": "0x0A1929",
          "count": 216
        },
        {
          "pc": "0x001C44",
          "count": 211
        },
        {
          "pc": "0x001C7D",
          "count": 211
        },
        {
          "pc": "0x001C81",
          "count": 211
        },
        {
          "pc": "0x001C82",
          "count": 211
        },
        {
          "pc": "0x001C48",
          "count": 211
        },
        {
          "pc": "0x0A3408",
          "count": 178
        },
        {
          "pc": "0x0A3411",
          "count": 146
        },
        {
          "pc": "0x0A1872",
          "count": 108
        }
      ],
      "firstCriticalZero": null,
      "first202020": null,
      "firstBadD007CA": null,
      "firstD0243AChange": null,
      "d007caTransitions": [],
      "cursorTransitions": [],
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


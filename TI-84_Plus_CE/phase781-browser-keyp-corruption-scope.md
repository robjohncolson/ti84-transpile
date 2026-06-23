# Phase 781 Browser KeyP Pre-Stop Scope

Probe: `probe-phase781-browser-keyp-corruption-scope.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase781-browser-keyp-corruption-scope.mjs`

Serves an in-memory instrumented current `browser-shell.html`, boots coldboot with Preserve Display, presses `KeyP`, and compares a no-stop corruption baseline against an in-memory `KeyP` control pre-stop at `0x001879`.

This probe intentionally does not patch disk `browser-shell.html`; it tests whether a later disk patch can be limited to a control pre-stop with no context-vector restore or cursor restore.

## Result

- KeyP pre-wipe stop at 0x001879 is bounded and leaves valid home cx/VAT/cursor state without context-vector or cursor restore.
- Baseline/no-stop: termination=max_steps, steps=190000, D007CA=0x000000, D02590=0x000000, firstCriticalZero=observed-before-block, cleanupTail=1.
- Pre-stop-only: termination=control_pre_stop, stop=0x001879, D007CA=0x0585E9, D008E0=0xD1A863, D02590=0xD3FE81, D0243A=0xD1A8CC, D0243D=0xD2A83E, VRAM=8877, cleanupTail=0.

## Strategy Matrix

| Strategy | Pre-stop | Safe candidate | Termination | Steps | Stop | Last PC | D007CA | D008E0 | D02590 | D0243A | D0243D | VRAM | Wipe tail | Page errors |
|---|---|---|---|---:|---|---|---|---|---|---|---|---:|---:|---:|
| baselineNoStop | no | NO | max_steps | 190000 | - | 0x006D0F | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 3031 | 1 | 0 |
| preStop001879Only | yes | YES | control_pre_stop | 110494 | 0x001879 | 0x08C331 | 0x0585E9 | 0xD1A863 | 0xD3FE81 | 0xD1A8CC | 0xD2A83E | 8877 | 0 | 0 |

## Strategy: baselineNoStop

- Config: preStopKeyP=false, stepCap=190000.
- Assessment: stoppedAtPrewipe=false, saneHomeState=false, cursorValid=false, cursorPreserved=false, cursorDelta=-13740236, noZeroOrSpaceCorruption=false, noWipeTail=false, noUnexpectedRestores=true, vramNotWiped=false, noPageErrors=true, safeCandidate=false.
- Key result: termination=max_steps, steps=190000, controlStop=-, controlLabel=-, lastPc=0x006D0F, contextRestoreEnabled=false, contextRestored=false, cursorRestored=false.
- Final fields: D007CA=0x000000, D008E0=0x000000, D02590=0x000000, D0243A=0x000000, D0243D=0x000000, VRAM=3031, pageErrors=0.
- First D007CA transition: block 110356, prevPc=0x001879, nextPc=0x0018F8, 0x0585E9->0x000000.
- First D0243A transition: block 110356, prevPc=0x001879, nextPc=0x0018F8, 0xD1A8CC->0x000000.
- Target hits: spaceFillBridge0a2a37=3, cleanup001879=1, cleanupTail0018f8=1, vectorOwner08c782=0, vectorRestore06c764=0, alternateCxMain06c92c=0, sentinel0158bc=2, postInsertGate0158de=2, low000a92=0, low000b7c=0.

### Target Hits

| Target | Hits | First block | PC | Prev PC | BC | HL | DE | SP | D007CA | D02590 |
|---|---:|---:|---|---|---|---|---|---|---|---|
| reset000000 | 1 | 109786 | 0x000000 | 0x03D0E0 | 0x000000 | 0x000002 | 0xD1A7FC | 0xF9DD11 | 0x0585E9 | 0xD3FE81 |
| rst000038 | 140 | 3 | 0x000038 | 0x05C634 | 0x000000 | 0xD1A8A3 | 0xD2A815 | 0xD1A85D | 0x0585E9 | 0xD3FE81 |
| low000a92 | 0 | - | - | - | - | - | - | - | - | - |
| low000b7c | 0 | - | - | - | - | - | - | - | - | - |
| coldIdle0019b5 | 0 | - | - | - | - | - | - | - | - | - |
| wipe0019be | 0 | - | - | - | - | - | - | - | - | - |
| cleanup001879 | 1 | 110355 | 0x001879 | 0x001872 | 0x000003 | 0x000000 | 0x000430 | 0xD1A87B | 0x0585E9 | 0xD3FE81 |
| cleanupTail0018f8 | 1 | 110356 | 0x0018F8 | 0x001879 | 0x0000FF | 0xD3FEFF | 0xD3FF00 | 0xD1A87B | 0x000000 | 0x000000 |
| sentinel001c33 | 777 | 22 | 0x001C33 | 0x006808 | 0x09D6B4 | 0x020006 | 0x0080C0 | 0xD1A845 | 0x0585E9 | 0xD3FE81 |
| sentinel0158bc | 2 | 110151 | 0x0158BC | 0x0158E8 | 0x00A005 | 0x000000 | 0xD1A7FC | 0xD1A878 | 0x0585E9 | 0xD3FE81 |
| postInsertGate0158de | 2 | 110149 | 0x0158DE | 0x0013C7 | 0x00A005 | 0x000000 | 0xD1A7FC | 0xD1A87B | 0x0585E9 | 0xD3FE81 |
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
| display09efde | 73584 | 6593 | 0x09EFDE | 0x09EFB7 | 0x009595 | 0xD42304 | 0x0052AA | 0xD1A833 | 0x0585E9 | 0xD3FE81 |
| display09efcb | 462 | 6744 | 0x09EFCB | 0x09EFEC | 0x00012B | 0xD42584 | 0x0052AA | 0xD1A839 | 0x0585E9 | 0xD3FE81 |
| display09efe8 | 468 | 6742 | 0x09EFE8 | 0x09EFDE | 0x000095 | 0xD42558 | 0x0052AA | 0xD1A833 | 0x0585E9 | 0xD3FE81 |

### Core Field Transitions

| Block | PC | Prev PC | Timing | Diffs |
|---:|---|---|---|---|
| 1 | 0x08C331 | - | entry-vs-previous-block | D008E0:0x000000->0xD1A863; D0058C:0x000000->0x00002D; D0058D:0x000000->0x00002D; D0058E:0x000000->0x00002D |
| 148 | 0x03F9D5 | 0x03FA04 | entry-vs-previous-block | D0058D:0x00002D->0x00001F |
| 54989 | 0x02FCB3 | 0x08C359 | entry-vs-previous-block | D0058C:0x00002D->0x000000; D0058E:0x00002D->0x000000 |
| 55353 | 0x08C38A | 0x08C366 | entry-vs-previous-block | D0058C:0x000000->0x00002D |
| 107989 | 0x02FCB3 | 0x08C359 | entry-vs-previous-block | D0058C:0x00002D->0x000000 |
| 110356 | 0x0018F8 | 0x001879 | entry-vs-previous-block | D007CA:0x0585E9->0x000000; D008E0:0xD1A863->0x000000; D0243A:0xD1A8CC->0x000000; D0243D:0xD2A83E->0x000000; D02590:0xD3FE81->0x000000; D0058D:0x00001F->0x000000 |

## Strategy: preStop001879Only

- Config: preStopKeyP=true, stepCap=130000.
- Assessment: stoppedAtPrewipe=true, saneHomeState=true, cursorValid=true, cursorPreserved=true, cursorDelta=0, noZeroOrSpaceCorruption=true, noWipeTail=true, noUnexpectedRestores=true, vramNotWiped=true, noPageErrors=true, safeCandidate=true.
- Key result: termination=control_pre_stop, steps=110494, controlStop=0x001879, controlLabel=keyp-prewipe-stop, lastPc=0x08C331, contextRestoreEnabled=false, contextRestored=false, cursorRestored=false.
- Final fields: D007CA=0x0585E9, D008E0=0xD1A863, D02590=0xD3FE81, D0243A=0xD1A8CC, D0243D=0xD2A83E, VRAM=8877, pageErrors=0.
- First D007CA transition: none captured.
- First D0243A transition: none captured.
- Target hits: spaceFillBridge0a2a37=3, cleanup001879=1, cleanupTail0018f8=0, vectorOwner08c782=0, vectorRestore06c764=0, alternateCxMain06c92c=0, sentinel0158bc=2, postInsertGate0158de=2, low000a92=0, low000b7c=0.

### Target Hits

| Target | Hits | First block | PC | Prev PC | BC | HL | DE | SP | D007CA | D02590 |
|---|---:|---:|---|---|---|---|---|---|---|---|
| reset000000 | 1 | 109786 | 0x000000 | 0x03D0E0 | 0x000000 | 0x000002 | 0xD1A7FC | 0xF9DD11 | 0x0585E9 | 0xD3FE81 |
| rst000038 | 140 | 3 | 0x000038 | 0x05C634 | 0x000000 | 0xD1A8A3 | 0xD2A815 | 0xD1A85D | 0x0585E9 | 0xD3FE81 |
| low000a92 | 0 | - | - | - | - | - | - | - | - | - |
| low000b7c | 0 | - | - | - | - | - | - | - | - | - |
| coldIdle0019b5 | 0 | - | - | - | - | - | - | - | - | - |
| wipe0019be | 0 | - | - | - | - | - | - | - | - | - |
| cleanup001879 | 1 | 110355 | 0x001879 | 0x001872 | 0x000003 | 0x000000 | 0x000430 | 0xD1A87B | 0x0585E9 | 0xD3FE81 |
| cleanupTail0018f8 | 0 | - | - | - | - | - | - | - | - | - |
| sentinel001c33 | 774 | 22 | 0x001C33 | 0x006808 | 0x09D6B4 | 0x020006 | 0x0080C0 | 0xD1A845 | 0x0585E9 | 0xD3FE81 |
| sentinel0158bc | 2 | 110151 | 0x0158BC | 0x0158E8 | 0x00A005 | 0x000000 | 0xD1A7FC | 0xD1A878 | 0x0585E9 | 0xD3FE81 |
| postInsertGate0158de | 2 | 110149 | 0x0158DE | 0x0013C7 | 0x00A005 | 0x000000 | 0xD1A7FC | 0xD1A87B | 0x0585E9 | 0xD3FE81 |
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
| display09efde | 73584 | 6593 | 0x09EFDE | 0x09EFB7 | 0x009595 | 0xD42304 | 0x0052AA | 0xD1A833 | 0x0585E9 | 0xD3FE81 |
| display09efcb | 462 | 6744 | 0x09EFCB | 0x09EFEC | 0x00012B | 0xD42584 | 0x0052AA | 0xD1A839 | 0x0585E9 | 0xD3FE81 |
| display09efe8 | 468 | 6742 | 0x09EFE8 | 0x09EFDE | 0x000095 | 0xD42558 | 0x0052AA | 0xD1A833 | 0x0585E9 | 0xD3FE81 |

### Core Field Transitions

| Block | PC | Prev PC | Timing | Diffs |
|---:|---|---|---|---|
| 1 | 0x08C331 | - | entry-vs-previous-block | D008E0:0x000000->0xD1A863; D0058C:0x000000->0x00002D; D0058D:0x000000->0x00002D; D0058E:0x000000->0x00002D |
| 148 | 0x03F9D5 | 0x03FA04 | entry-vs-previous-block | D0058D:0x00002D->0x00001F |
| 54989 | 0x02FCB3 | 0x08C359 | entry-vs-previous-block | D0058C:0x00002D->0x000000; D0058E:0x00002D->0x000000 |
| 55353 | 0x08C38A | 0x08C366 | entry-vs-previous-block | D0058C:0x000000->0x00002D |
| 107989 | 0x02FCB3 | 0x08C359 | entry-vs-previous-block | D0058C:0x00002D->0x000000 |


## Compact Evidence

```json
{
  "finding": "KeyP pre-wipe stop at 0x001879 is bounded and leaves valid home cx/VAT/cursor state without context-vector or cursor restore.",
  "prestop": {
    "code": "KeyP",
    "pc": 6265,
    "label": "keyp-prewipe-stop"
  },
  "results": [
    {
      "strategy": {
        "name": "baselineNoStop",
        "preStopKeyP": false,
        "stepCap": 190000
      },
      "browserConfig": {
        "preStopKeyP": false,
        "stepCap": 190000
      },
      "assessment": {
        "stoppedAtPrewipe": false,
        "saneHomeState": false,
        "cursorValid": false,
        "cursorPreserved": false,
        "cursorDelta": -13740236,
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
        "status": "Key: PRGM → 190000 steps (max_steps, peak 8877px)",
        "lastPc": "0x006D0F",
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
          "code": "KeyP",
          "label": "PRGM",
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
          "vramPeak": 8877,
          "vramCurrent": 3031
        },
        "pageErrors": []
      },
      "targetCounts": {
        "reset000000": 1,
        "rst000038": 140,
        "low000a92": 0,
        "low000b7c": 0,
        "coldIdle0019b5": 0,
        "wipe0019be": 0,
        "cleanup001879": 1,
        "cleanupTail0018f8": 1,
        "sentinel001c33": 777,
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
        "display09efde": 73584,
        "display09efcb": 462,
        "display09efe8": 468
      },
      "hotBlocks": [
        {
          "pc": "0x09EFDE",
          "count": 73584
        },
        {
          "pc": "0x0021C2",
          "count": 8777
        },
        {
          "pc": "0x006D5D",
          "count": 8773
        },
        {
          "pc": "0x006D64",
          "count": 8773
        },
        {
          "pc": "0x006CDF",
          "count": 8771
        },
        {
          "pc": "0x006D0F",
          "count": 8770
        },
        {
          "pc": "0x006CF7",
          "count": 8769
        },
        {
          "pc": "0x006D38",
          "count": 8769
        },
        {
          "pc": "0x006D4F",
          "count": 8769
        },
        {
          "pc": "0x0A2677",
          "count": 1536
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
          "pc": "0x005AB6",
          "count": 1305
        },
        {
          "pc": "0x0A267D",
          "count": 1006
        },
        {
          "pc": "0x001CA6",
          "count": 913
        },
        {
          "pc": "0x003D28",
          "count": 896
        },
        {
          "pc": "0x003D25",
          "count": 896
        },
        {
          "pc": "0x001CC0",
          "count": 863
        },
        {
          "pc": "0x001CCA",
          "count": 862
        },
        {
          "pc": "0x001C33",
          "count": 777
        },
        {
          "pc": "0x001C38",
          "count": 773
        },
        {
          "pc": "0x003D40",
          "count": 762
        },
        {
          "pc": "0x001C3C",
          "count": 724
        },
        {
          "pc": "0x001CE4",
          "count": 720
        },
        {
          "pc": "0x001C7D",
          "count": 620
        },
        {
          "pc": "0x001C81",
          "count": 620
        },
        {
          "pc": "0x001C82",
          "count": 620
        },
        {
          "pc": "0x001C44",
          "count": 619
        },
        {
          "pc": "0x001C48",
          "count": 619
        },
        {
          "pc": "0x0A2689",
          "count": 530
        },
        {
          "pc": "0x0A3404",
          "count": 528
        },
        {
          "pc": "0x09EFE8",
          "count": 468
        },
        {
          "pc": "0x09EFCB",
          "count": 462
        },
        {
          "pc": "0x0A3411",
          "count": 460
        },
        {
          "pc": "0x09EFEF",
          "count": 420
        },
        {
          "pc": "0x0A3408",
          "count": 332
        },
        {
          "pc": "0x001C4F",
          "count": 293
        },
        {
          "pc": "0x001C54",
          "count": 293
        },
        {
          "pc": "0x0060B3",
          "count": 255
        }
      ],
      "firstCriticalZero": {
        "source": "observed-before-block",
        "snapshot": {
          "block": 110356,
          "step": 110495,
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
            "stepCount": 110495
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
          "vram": 8877,
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
              "nonWhite": 328
            },
            "vramCurrent": 8877,
            "lastKey": null
          }
        }
      },
      "first202020": null,
      "firstBadD007CA": {
        "source": "observed-before-block",
        "expected": 361961,
        "snapshot": {
          "block": 110356,
          "step": 110495,
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
            "stepCount": 110495
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
          "vram": 8877,
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
              "nonWhite": 328
            },
            "vramCurrent": 8877,
            "lastKey": null
          }
        }
      },
      "firstD0243AChange": {
        "source": "observed-before-block",
        "expected": 13740236,
        "snapshot": {
          "block": 110356,
          "step": 110495,
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
            "stepCount": 110495
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
          "vram": 8877,
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
              "nonWhite": 328
            },
            "vramCurrent": 8877,
            "lastKey": null
          }
        }
      },
      "d007caTransitions": [
        {
          "block": 110356,
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
              "before": 31,
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
              "before": 5,
              "after": 0
            }
          }
        }
      ],
      "cursorTransitions": [
        {
          "block": 110356,
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
              "before": 31,
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
              "before": 5,
              "after": 0
            }
          }
        }
      ],
      "lastBlocks": [
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
        "0x006D64",
        "0x006CDF",
        "0x006CF7"
      ],
      "pageErrors": []
    },
    {
      "strategy": {
        "name": "preStop001879Only",
        "preStopKeyP": true,
        "stepCap": 130000
      },
      "browserConfig": {
        "preStopKeyP": true,
        "stepCap": 130000
      },
      "assessment": {
        "stoppedAtPrewipe": true,
        "saneHomeState": true,
        "cursorValid": true,
        "cursorPreserved": true,
        "cursorDelta": 0,
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
        "status": "Key: PRGM → 110494 steps (control_pre_stop, peak 8877px)",
        "lastPc": "0x08C331",
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x1F",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D000C2": "0x00",
          "D02A28": "0x00",
          "D02A29": "0x000000",
          "D02A40": "0xD2A83E",
          "D00595": "0x01",
          "D00596": "0x05"
        },
        "lastKey": {
          "code": "KeyP",
          "label": "PRGM",
          "expectedInsertByte": null,
          "controlPreStopPc": 6265,
          "controlPreStopLabel": "keyp-prewipe-stop",
          "cursorBefore": null,
          "insertBlock": null,
          "postInsertGateBlock": null,
          "stoppedAtPostInsertGate": false,
          "D000C2Bit7Restored": false,
          "controlStopBlock": 110355,
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
          "steps": 110494,
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
          "vramPeak": 8877,
          "vramCurrent": 8877
        },
        "pageErrors": []
      },
      "targetCounts": {
        "reset000000": 1,
        "rst000038": 140,
        "low000a92": 0,
        "low000b7c": 0,
        "coldIdle0019b5": 0,
        "wipe0019be": 0,
        "cleanup001879": 1,
        "cleanupTail0018f8": 0,
        "sentinel001c33": 774,
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
        "display09efde": 73584,
        "display09efcb": 462,
        "display09efe8": 468
      },
      "hotBlocks": [
        {
          "pc": "0x09EFDE",
          "count": 73584
        },
        {
          "pc": "0x0A2677",
          "count": 1536
        },
        {
          "pc": "0x0A267D",
          "count": 1006
        },
        {
          "pc": "0x001CA6",
          "count": 910
        },
        {
          "pc": "0x003D28",
          "count": 889
        },
        {
          "pc": "0x003D25",
          "count": 889
        },
        {
          "pc": "0x001CC0",
          "count": 860
        },
        {
          "pc": "0x001CCA",
          "count": 860
        },
        {
          "pc": "0x001C33",
          "count": 774
        },
        {
          "pc": "0x001C38",
          "count": 770
        },
        {
          "pc": "0x003D40",
          "count": 762
        },
        {
          "pc": "0x001C3C",
          "count": 722
        },
        {
          "pc": "0x001CE4",
          "count": 720
        },
        {
          "pc": "0x001C44",
          "count": 617
        },
        {
          "pc": "0x001C7D",
          "count": 617
        },
        {
          "pc": "0x001C81",
          "count": 617
        },
        {
          "pc": "0x001C82",
          "count": 617
        },
        {
          "pc": "0x001C48",
          "count": 617
        },
        {
          "pc": "0x0A2689",
          "count": 530
        },
        {
          "pc": "0x0A3404",
          "count": 528
        },
        {
          "pc": "0x09EFE8",
          "count": 468
        },
        {
          "pc": "0x09EFCB",
          "count": 462
        },
        {
          "pc": "0x0A3411",
          "count": 460
        },
        {
          "pc": "0x09EFEF",
          "count": 420
        },
        {
          "pc": "0x0A3408",
          "count": 332
        },
        {
          "pc": "0x001C4F",
          "count": 293
        },
        {
          "pc": "0x001C54",
          "count": 293
        },
        {
          "pc": "0x001377",
          "count": 254
        },
        {
          "pc": "0x08C308",
          "count": 236
        },
        {
          "pc": "0x0A19A4",
          "count": 224
        },
        {
          "pc": "0x0A189E",
          "count": 212
        },
        {
          "pc": "0x0A190D",
          "count": 212
        },
        {
          "pc": "0x0A191F",
          "count": 212
        },
        {
          "pc": "0x0A1969",
          "count": 212
        },
        {
          "pc": "0x0A1980",
          "count": 212
        },
        {
          "pc": "0x0A19D7",
          "count": 212
        },
        {
          "pc": "0x0A1A1D",
          "count": 212
        },
        {
          "pc": "0x0A1854",
          "count": 202
        },
        {
          "pc": "0x0A2548",
          "count": 192
        },
        {
          "pc": "0x0A258F",
          "count": 192
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


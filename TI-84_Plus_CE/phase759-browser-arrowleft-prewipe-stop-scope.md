# Phase 759 Browser ArrowLeft Pre-Wipe Stop Scope

Probe: `probe-phase759-browser-arrowleft-prewipe-stop-scope.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase759-browser-arrowleft-prewipe-stop-scope.mjs`

Serves an in-memory instrumented current `browser-shell.html`, boots coldboot with Preserve Display, presses `ArrowLeft`, and compares baseline behavior, the phase758 restore-without-stop negative control, and a new `restorePreStop001879` variant. The candidate restores the pre-key 21-byte `D007CA..D007DE` context vector at `0x06C764`, then stops before the destructive wipe at `0x001879`.

The disk `browser-shell.html` is not patched by this probe.

## Result

- ArrowLeft pre-wipe stop bounded the run; restoreFired=true, safeCandidate=false.
- Baseline: termination=max_steps, lastPc=0x09EFDE, D007CA=0x06C92C, hot=0x09EFDEx22072, 0x0A2588x2904, 0x0A255Fx2904.
- Restore/no-stop: termination=max_steps, lastPc=0x006D38, D007CA=0x000000, restorePc=0x06C764, hot=0x0021C2x8526, 0x006D5Dx8522, 0x006D64x8522.
- Restore/pre-stop: termination=control_pre_stop, stop=0x001879, lastPc=0x08C331, D007CA=0x0585E9, D02590=0xD3FE81, D0243A=0xD1A8CD, VRAM=8593, restorePc=0x06C764.

## Strategy Matrix

| Strategy | Restore fired | Safe candidate | Termination | Steps | Last PC | D007CA | D02590 | D0243A | Hot loop | Page errors |
|---|---|---|---|---:|---|---|---|---|---|---:|
| baseline | no | NO | max_steps | 70000 | 0x09EFDE | 0x06C92C | 0xD3FE81 | 0xD1A8CC | 0x09EFDEx22072, 0x0A2588x2904, 0x0A255Fx2904 | 0 |
| restoreNoStop | yes | NO | max_steps | 130000 | 0x006D38 | 0x000000 | 0x000000 | 0x000000 | 0x0021C2x8526, 0x006D5Dx8522, 0x006D64x8522 | 0 |
| restorePreStop001879 | yes | NO | control_pre_stop | 52499 | 0x08C331 | 0x0585E9 | 0xD3FE81 | 0xD1A8CD | 0x0A2588x2904, 0x0A255Fx2904, 0x0A2563x2261 | 0 |

## Strategy: baseline

- Config: restoreArrowLeft=false, preStopArrowLeft=false, stepCap=70000.
- Assessment: restoreFired=false, finalHomeVector=false, saneCore=true, bounded=false, badRoute=true, noCorruption=true, noPageErrors=true, safeCandidate=false.
- Key result: termination=max_steps, steps=70000, stop=-, lastPc=0x09EFDE, contextRestore=-, D007CA -->-.
- Final fields: D007CA=0x06C92C, D008E0=0xD1A863, D02590=0xD3FE81, D0243A=0xD1A8CC, D0243D=0xD2A83E, VRAM=48973.
- Target hits: vectorOwner08c782=1, vectorRestore06c764=1, alternateCxMain06c92c=1, cxDispatchWrapper08c72f=2, cleanup001879=0, cleanupTail0018f8=0, sentinel001c33=790, display09efde=22072, low000b7c=0, eolOwner0a229d=0, eolTail0a22a4=0.

### D007CA/D008E0 Transitions

| Block | PC | Prev PC | Timing | Diff |
|---:|---|---|---|---|
| 1 | 0x08C331 | - | entry-vs-previous-block | D008E0:0x000000->0xD1A863 |
| 14601 | 0x08377D | 0x061DEF | entry-vs-previous-block | D008E0:0xD1A863->0xD1A839 |
| 16188 | 0x08379A | 0x061E27 | entry-vs-previous-block | D008E0:0xD1A839->0xD1A863 |
| 18167 | 0x06C764 | 0x08C782 | entry-vs-previous-block | D007CA:0x0585E9->0x06C92C |

## Strategy: restoreNoStop

- Config: restoreArrowLeft=true, preStopArrowLeft=false, stepCap=130000.
- Assessment: restoreFired=true, finalHomeVector=false, saneCore=false, bounded=false, badRoute=false, noCorruption=false, noPageErrors=true, safeCandidate=false.
- Key result: termination=max_steps, steps=130000, stop=-, lastPc=0x006D38, contextRestore=0x06C764, D007CA 0x06C92C->0x0585E9.
- Final fields: D007CA=0x000000, D008E0=0x000000, D02590=0x000000, D0243A=0x000000, D0243D=0x000000, VRAM=3031.
- Target hits: vectorOwner08c782=1, vectorRestore06c764=1, alternateCxMain06c92c=0, cxDispatchWrapper08c72f=2, cleanup001879=1, cleanupTail0018f8=1, sentinel001c33=859, display09efde=1860, low000b7c=0, eolOwner0a229d=0, eolTail0a22a4=0.

### D007CA/D008E0 Transitions

| Block | PC | Prev PC | Timing | Diff |
|---:|---|---|---|---|
| 1 | 0x08C331 | - | entry-vs-previous-block | D008E0:0x000000->0xD1A863 |
| 14601 | 0x08377D | 0x061DEF | entry-vs-previous-block | D008E0:0xD1A863->0xD1A839 |
| 16188 | 0x08379A | 0x061E27 | entry-vs-previous-block | D008E0:0xD1A839->0xD1A863 |
| 18167 | 0x06C764 | 0x08C782 | entry-vs-previous-block | D007CA:0x0585E9->0x06C92C |
| 18168 | 0x06C927 | 0x06C764 | entry-vs-previous-block | D007CA:0x06C92C->0x0585E9 |
| 52337 | 0x0018F8 | 0x001879 | entry-vs-previous-block | D007CA:0x0585E9->0x000000; D008E0:0xD1A863->0x000000 |

## Strategy: restorePreStop001879

- Config: restoreArrowLeft=true, preStopArrowLeft=true, stepCap=90000.
- Assessment: restoreFired=true, finalHomeVector=true, saneCore=false, bounded=true, badRoute=false, noCorruption=true, noPageErrors=true, safeCandidate=false.
- Key result: termination=control_pre_stop, steps=52499, stop=0x001879, lastPc=0x08C331, contextRestore=0x06C764, D007CA 0x06C92C->0x0585E9.
- Final fields: D007CA=0x0585E9, D008E0=0xD1A863, D02590=0xD3FE81, D0243A=0xD1A8CD, D0243D=0xD2A83E, VRAM=8593.
- Target hits: vectorOwner08c782=1, vectorRestore06c764=1, alternateCxMain06c92c=0, cxDispatchWrapper08c72f=2, cleanup001879=1, cleanupTail0018f8=0, sentinel001c33=856, display09efde=1860, low000b7c=0, eolOwner0a229d=0, eolTail0a22a4=0.

### D007CA/D008E0 Transitions

| Block | PC | Prev PC | Timing | Diff |
|---:|---|---|---|---|
| 1 | 0x08C331 | - | entry-vs-previous-block | D008E0:0x000000->0xD1A863 |
| 14601 | 0x08377D | 0x061DEF | entry-vs-previous-block | D008E0:0xD1A863->0xD1A839 |
| 16188 | 0x08379A | 0x061E27 | entry-vs-previous-block | D008E0:0xD1A839->0xD1A863 |
| 18167 | 0x06C764 | 0x08C782 | entry-vs-previous-block | D007CA:0x0585E9->0x06C92C |
| 18168 | 0x06C927 | 0x06C764 | entry-vs-previous-block | D007CA:0x06C92C->0x0585E9 |


## Compact Evidence

```json
{
  "finding": "ArrowLeft pre-wipe stop bounded the run; restoreFired=true, safeCandidate=false.",
  "results": [
    {
      "strategy": {
        "name": "baseline",
        "restoreArrowLeft": false,
        "preStopArrowLeft": false,
        "stepCap": 70000
      },
      "browserConfig": {
        "restoreArrowLeft": false,
        "preStopArrowLeft": false,
        "stepCap": 70000
      },
      "assessment": {
        "restoreFired": false,
        "finalHomeVector": false,
        "saneCore": true,
        "bounded": false,
        "badRoute": true,
        "noCorruption": true,
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
          "D02A40": "0xD2A83E"
        },
        "vram": 8549
      },
      "after": {
        "status": "Key: LEFT → 70000 steps (max_steps, peak 39503px)",
        "lastPc": "0x09EFDE",
        "cpu": {
          "pc": "0x09EFDE",
          "sp": "0xD1A830",
          "af": "0x003580",
          "bc": "0x000C80",
          "de": "0x000000",
          "hl": "0xD5D550",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "f": "0x80",
          "stepCount": 69999
        },
        "fields": {
          "D007CA": "0x06C92C",
          "D008E0": "0xD1A863",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x5A",
          "D0058D": "0x32",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D000C2": "0x00",
          "D02A28": "0x00",
          "D02A29": "0x000000",
          "D02A40": "0xD2A83E"
        },
        "diagnostics": {
          "D007CA": 444716,
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
            "nonWhite": 3328
          },
          "vramCurrent": 48973,
          "lastKey": {
            "code": "ArrowLeft",
            "label": "LEFT",
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
            "uiClearApplied": false,
            "uiClearResult": null,
            "stoppedBeforeControlClear": false,
            "contextVectorRestoreEnabled": false,
            "contextVectorRestored": false,
            "contextVectorRestoreBlock": null,
            "contextVectorRestorePc": null,
            "contextVectorD007CABefore": null,
            "contextVectorD007CAAfter": null,
            "steps": 70000,
            "termination": "max_steps",
            "wipes": 0,
            "D0243A": 13740236,
            "D0243D": 13805630,
            "D007CA": 444716,
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
            "vramPeak": 39503,
            "vramCurrent": 48973
          }
        },
        "lastKey": {
          "code": "ArrowLeft",
          "label": "LEFT",
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
          "uiClearApplied": false,
          "uiClearResult": null,
          "stoppedBeforeControlClear": false,
          "contextVectorRestoreEnabled": false,
          "contextVectorRestored": false,
          "contextVectorRestoreBlock": null,
          "contextVectorRestorePc": null,
          "contextVectorD007CABefore": null,
          "contextVectorD007CAAfter": null,
          "steps": 70000,
          "termination": "max_steps",
          "wipes": 0,
          "D0243A": 13740236,
          "D0243D": 13805630,
          "D007CA": 444716,
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
          "vramPeak": 39503,
          "vramCurrent": 48973
        },
        "stack0": "0x000100",
        "pageErrors": []
      },
      "targetCounts": {
        "rst000038": 155,
        "coldIdle0019b5": 0,
        "cleanup001879": 0,
        "cleanupTail0018f8": 0,
        "sentinel001c33": 790,
        "sentinel0158bc": 0,
        "vectorOwner08c782": 1,
        "vectorRestore06c764": 1,
        "alternateCxMain06c92c": 1,
        "cxDispatchWrapper08c72f": 2,
        "cxJpTrampoline08c745": 5,
        "display09efde": 22072,
        "display09efcb": 179,
        "display09efe8": 181,
        "low000b7c": 0,
        "eolOwner0a229d": 0,
        "eolTail0a22a4": 0
      },
      "hotBlocks": [
        {
          "pc": "0x09EFDE",
          "count": 22072
        },
        {
          "pc": "0x0A2588",
          "count": 2904
        },
        {
          "pc": "0x0A255F",
          "count": 2904
        },
        {
          "pc": "0x0A2563",
          "count": 2261
        },
        {
          "pc": "0x0A257E",
          "count": 2261
        },
        {
          "pc": "0x0A2572",
          "count": 1051
        },
        {
          "pc": "0x003D28",
          "count": 1015
        },
        {
          "pc": "0x003D25",
          "count": 1015
        },
        {
          "pc": "0x001CA6",
          "count": 945
        },
        {
          "pc": "0x001CC0",
          "count": 933
        },
        {
          "pc": "0x001CCA",
          "count": 933
        },
        {
          "pc": "0x001C33",
          "count": 790
        },
        {
          "pc": "0x001C38",
          "count": 790
        },
        {
          "pc": "0x001C3C",
          "count": 778
        },
        {
          "pc": "0x001CE4",
          "count": 778
        },
        {
          "pc": "0x001C44",
          "count": 632
        },
        {
          "pc": "0x001C7D",
          "count": 632
        },
        {
          "pc": "0x001C81",
          "count": 632
        },
        {
          "pc": "0x001C82",
          "count": 632
        },
        {
          "pc": "0x001C48",
          "count": 632
        },
        {
          "pc": "0x0A3404",
          "count": 624
        },
        {
          "pc": "0x0A3411",
          "count": 582
        },
        {
          "pc": "0x0A19A4",
          "count": 560
        },
        {
          "pc": "0x0A2548",
          "count": 492
        },
        {
          "pc": "0x0A254F",
          "count": 492
        },
        {
          "pc": "0x0A258B",
          "count": 492
        },
        {
          "pc": "0x0A2695",
          "count": 492
        },
        {
          "pc": "0x0A2555",
          "count": 408
        },
        {
          "pc": "0x0A2585",
          "count": 408
        },
        {
          "pc": "0x0A269A",
          "count": 408
        }
      ],
      "lastBlocks": [
        "0x09EFDE",
        "0x09EFDE",
        "0x09EFDE",
        "0x09EFDE",
        "0x09EFDE",
        "0x09EFDE",
        "0x09EFDE",
        "0x09EFDE",
        "0x09EFDE",
        "0x09EFDE",
        "0x09EFDE",
        "0x09EFDE",
        "0x09EFDE",
        "0x09EFDE",
        "0x09EFDE",
        "0x09EFDE",
        "0x09EFDE",
        "0x09EFDE",
        "0x09EFDE",
        "0x09EFDE",
        "0x09EFDE",
        "0x09EFDE",
        "0x09EFDE",
        "0x09EFDE",
        "0x09EFDE",
        "0x09EFDE",
        "0x09EFDE",
        "0x09EFDE",
        "0x09EFDE",
        "0x09EFDE",
        "0x09EFDE",
        "0x09EFDE",
        "0x09EFDE",
        "0x09EFDE",
        "0x09EFDE",
        "0x09EFDE",
        "0x09EFDE",
        "0x09EFDE",
        "0x09EFDE",
        "0x09EFDE",
        "0x09EFDE",
        "0x09EFDE",
        "0x09EFDE",
        "0x09EFDE",
        "0x09EFDE",
        "0x09EFDE",
        "0x09EFDE",
        "0x09EFDE",
        "0x09EFDE",
        "0x09EFDE",
        "0x09EFDE",
        "0x09EFDE",
        "0x09EFDE",
        "0x09EFDE",
        "0x09EFDE",
        "0x09EFDE",
        "0x09EFDE",
        "0x09EFDE",
        "0x09EFDE",
        "0x09EFDE",
        "0x09EFDE",
        "0x09EFDE",
        "0x09EFDE",
        "0x09EFDE",
        "0x09EFDE",
        "0x09EFDE",
        "0x09EFDE",
        "0x09EFDE",
        "0x09EFDE",
        "0x09EFDE",
        "0x09EFDE",
        "0x09EFDE",
        "0x09EFDE",
        "0x09EFDE",
        "0x09EFDE",
        "0x09EFDE",
        "0x09EFDE",
        "0x09EFDE",
        "0x09EFDE",
        "0x09EFDE",
        "0x09EFDE",
        "0x09EFDE",
        "0x09EFDE",
        "0x09EFDE",
        "0x09EFDE",
        "0x09EFDE",
        "0x09EFDE",
        "0x09EFDE",
        "0x09EFDE",
        "0x09EFDE",
        "0x09EFDE",
        "0x09EFDE",
        "0x09EFDE",
        "0x09EFDE",
        "0x09EFDE",
        "0x09EFDE"
      ],
      "d007caTransitions": [
        {
          "block": 18167,
          "pc": "0x06C764",
          "prevPc": "0x08C782",
          "timing": "entry-vs-previous-block",
          "diff": {
            "D007CA": {
              "before": 361961,
              "after": 444716
            }
          }
        }
      ],
      "firstCriticalZero": null,
      "first202020": null,
      "pageErrors": []
    },
    {
      "strategy": {
        "name": "restoreNoStop",
        "restoreArrowLeft": true,
        "preStopArrowLeft": false,
        "stepCap": 130000
      },
      "browserConfig": {
        "restoreArrowLeft": true,
        "preStopArrowLeft": false,
        "stepCap": 130000
      },
      "assessment": {
        "restoreFired": true,
        "finalHomeVector": false,
        "saneCore": false,
        "bounded": false,
        "badRoute": false,
        "noCorruption": false,
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
          "D02A40": "0xD2A83E"
        },
        "vram": 8549
      },
      "after": {
        "status": "Key: LEFT → 130000 steps (max_steps, peak 8625px)",
        "lastPc": "0x006D38",
        "cpu": {
          "pc": "0x006D0F",
          "sp": "0xD1A82B",
          "af": "0x000042",
          "bc": "0x000040",
          "de": "0x002010",
          "hl": "0x000000",
          "ix": "0xD1A831",
          "iy": "0xD00080",
          "f": "0x42",
          "stepCount": 129999
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
          "D02A40": "0x000000"
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
            132,
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
          "vramCurrent": 3031,
          "lastKey": {
            "code": "ArrowLeft",
            "label": "LEFT",
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
            "uiClearApplied": false,
            "uiClearResult": null,
            "stoppedBeforeControlClear": false,
            "contextVectorRestoreEnabled": true,
            "contextVectorRestored": true,
            "contextVectorRestoreBlock": 18167,
            "contextVectorRestorePc": 444260,
            "contextVectorD007CABefore": 444716,
            "contextVectorD007CAAfter": 361961,
            "steps": 130000,
            "termination": "max_steps",
            "wipes": 1,
            "D0243A": 0,
            "D0243D": 0,
            "D007CA": 0,
            "D008E0": 0,
            "D02590": 0,
            "D000C2": 0,
            "buffer": [
              132,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "vramPeak": 8625,
            "vramCurrent": 3031
          }
        },
        "lastKey": {
          "code": "ArrowLeft",
          "label": "LEFT",
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
          "uiClearApplied": false,
          "uiClearResult": null,
          "stoppedBeforeControlClear": false,
          "contextVectorRestoreEnabled": true,
          "contextVectorRestored": true,
          "contextVectorRestoreBlock": 18167,
          "contextVectorRestorePc": 444260,
          "contextVectorD007CABefore": 444716,
          "contextVectorD007CAAfter": 361961,
          "steps": 130000,
          "termination": "max_steps",
          "wipes": 1,
          "D0243A": 0,
          "D0243D": 0,
          "D007CA": 0,
          "D008E0": 0,
          "D02590": 0,
          "D000C2": 0,
          "buffer": [
            132,
            0,
            0,
            0,
            0,
            0,
            0,
            0
          ],
          "vramPeak": 8625,
          "vramCurrent": 3031
        },
        "stack0": "0x000040",
        "pageErrors": []
      },
      "targetCounts": {
        "rst000038": 164,
        "coldIdle0019b5": 0,
        "cleanup001879": 1,
        "cleanupTail0018f8": 1,
        "sentinel001c33": 859,
        "sentinel0158bc": 2,
        "vectorOwner08c782": 1,
        "vectorRestore06c764": 1,
        "alternateCxMain06c92c": 0,
        "cxDispatchWrapper08c72f": 2,
        "cxJpTrampoline08c745": 5,
        "display09efde": 1860,
        "display09efcb": 22,
        "display09efe8": 24,
        "low000b7c": 0,
        "eolOwner0a229d": 0,
        "eolTail0a22a4": 0
      },
      "hotBlocks": [
        {
          "pc": "0x0021C2",
          "count": 8526
        },
        {
          "pc": "0x006D5D",
          "count": 8522
        },
        {
          "pc": "0x006D64",
          "count": 8522
        },
        {
          "pc": "0x006CDF",
          "count": 8520
        },
        {
          "pc": "0x006D0F",
          "count": 8520
        },
        {
          "pc": "0x006CF7",
          "count": 8518
        },
        {
          "pc": "0x006D38",
          "count": 8518
        },
        {
          "pc": "0x006D4F",
          "count": 8518
        },
        {
          "pc": "0x0A2588",
          "count": 2904
        },
        {
          "pc": "0x0A255F",
          "count": 2904
        },
        {
          "pc": "0x0A2563",
          "count": 2261
        },
        {
          "pc": "0x0A257E",
          "count": 2261
        },
        {
          "pc": "0x09EFDE",
          "count": 1860
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
          "pc": "0x003D28",
          "count": 1085
        },
        {
          "pc": "0x003D25",
          "count": 1085
        },
        {
          "pc": "0x0A2572",
          "count": 1051
        },
        {
          "pc": "0x001CA6",
          "count": 1021
        },
        {
          "pc": "0x001CC0",
          "count": 997
        },
        {
          "pc": "0x001CCA",
          "count": 996
        },
        {
          "pc": "0x001C33",
          "count": 859
        },
        {
          "pc": "0x001C38",
          "count": 857
        },
        {
          "pc": "0x001C3C",
          "count": 834
        },
        {
          "pc": "0x001CE4",
          "count": 830
        },
        {
          "pc": "0x001C7D",
          "count": 686
        },
        {
          "pc": "0x001C81",
          "count": 686
        },
        {
          "pc": "0x001C82",
          "count": 686
        }
      ],
      "lastBlocks": [
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
        "0x006D0F"
      ],
      "d007caTransitions": [
        {
          "block": 18167,
          "pc": "0x06C764",
          "prevPc": "0x08C782",
          "timing": "entry-vs-previous-block",
          "diff": {
            "D007CA": {
              "before": 361961,
              "after": 444716
            }
          }
        },
        {
          "block": 18168,
          "pc": "0x06C927",
          "prevPc": "0x06C764",
          "timing": "entry-vs-previous-block",
          "diff": {
            "D007CA": {
              "before": 444716,
              "after": 361961
            }
          }
        },
        {
          "block": 52337,
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
              "before": 13740237,
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
              "before": 50,
              "after": 0
            },
            "D02A40": {
              "before": 13805630,
              "after": 0
            }
          }
        }
      ],
      "firstCriticalZero": {
        "source": "observed-before-block",
        "snapshot": {
          "block": 52337,
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
            "stepCount": 52500
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
            "D02A40": 0
          },
          "stack0": 5096,
          "vram": 8593
        }
      },
      "first202020": null,
      "pageErrors": []
    },
    {
      "strategy": {
        "name": "restorePreStop001879",
        "restoreArrowLeft": true,
        "preStopArrowLeft": true,
        "stepCap": 90000
      },
      "browserConfig": {
        "restoreArrowLeft": true,
        "preStopArrowLeft": true,
        "stepCap": 90000
      },
      "assessment": {
        "restoreFired": true,
        "finalHomeVector": true,
        "saneCore": false,
        "bounded": true,
        "badRoute": false,
        "noCorruption": true,
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
          "D02A40": "0xD2A83E"
        },
        "vram": 8549
      },
      "after": {
        "status": "Key: LEFT → 52499 steps (control_pre_stop, peak 8625px)",
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
          "stepCount": 52499
        },
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0243A": "0xD1A8CD",
          "D0243D": "0xD2A83E",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x32",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D000C2": "0x00",
          "D02A28": "0x00",
          "D02A29": "0x000000",
          "D02A40": "0xD2A83E"
        },
        "diagnostics": {
          "D007CA": 361961,
          "D008E0": 13740131,
          "D0243A": 13740237,
          "D0243D": 13805630,
          "D02590": 13893249,
          "D00595": 0,
          "D00596": 1,
          "buffer": [
            132,
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
            "nonWhite": 44
          },
          "vramCurrent": 8593,
          "lastKey": {
            "code": "ArrowLeft",
            "label": "LEFT",
            "expectedInsertByte": null,
            "controlPreStopPc": 6265,
            "controlPreStopLabel": "arrow-left-prewipe-vector-restore-stop",
            "cursorBefore": null,
            "insertBlock": null,
            "postInsertGateBlock": null,
            "stoppedAtPostInsertGate": false,
            "D000C2Bit7Restored": false,
            "controlStopBlock": 52336,
            "controlStopPc": 6265,
            "uiClearApplied": false,
            "uiClearResult": null,
            "stoppedBeforeControlClear": true,
            "contextVectorRestoreEnabled": true,
            "contextVectorRestored": true,
            "contextVectorRestoreBlock": 18167,
            "contextVectorRestorePc": 444260,
            "contextVectorD007CABefore": 444716,
            "contextVectorD007CAAfter": 361961,
            "steps": 52499,
            "termination": "control_pre_stop",
            "wipes": 0,
            "D0243A": 13740237,
            "D0243D": 13805630,
            "D007CA": 361961,
            "D008E0": 13740131,
            "D02590": 13893249,
            "D000C2": 0,
            "buffer": [
              132,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ],
            "vramPeak": 8625,
            "vramCurrent": 8593
          }
        },
        "lastKey": {
          "code": "ArrowLeft",
          "label": "LEFT",
          "expectedInsertByte": null,
          "controlPreStopPc": 6265,
          "controlPreStopLabel": "arrow-left-prewipe-vector-restore-stop",
          "cursorBefore": null,
          "insertBlock": null,
          "postInsertGateBlock": null,
          "stoppedAtPostInsertGate": false,
          "D000C2Bit7Restored": false,
          "controlStopBlock": 52336,
          "controlStopPc": 6265,
          "uiClearApplied": false,
          "uiClearResult": null,
          "stoppedBeforeControlClear": true,
          "contextVectorRestoreEnabled": true,
          "contextVectorRestored": true,
          "contextVectorRestoreBlock": 18167,
          "contextVectorRestorePc": 444260,
          "contextVectorD007CABefore": 444716,
          "contextVectorD007CAAfter": 361961,
          "steps": 52499,
          "termination": "control_pre_stop",
          "wipes": 0,
          "D0243A": 13740237,
          "D0243D": 13805630,
          "D007CA": 361961,
          "D008E0": 13740131,
          "D02590": 13893249,
          "D000C2": 0,
          "buffer": [
            132,
            0,
            0,
            0,
            0,
            0,
            0,
            0
          ],
          "vramPeak": 8625,
          "vramCurrent": 8593
        },
        "stack0": "0x0013E8",
        "pageErrors": []
      },
      "targetCounts": {
        "rst000038": 164,
        "coldIdle0019b5": 0,
        "cleanup001879": 1,
        "cleanupTail0018f8": 0,
        "sentinel001c33": 856,
        "sentinel0158bc": 2,
        "vectorOwner08c782": 1,
        "vectorRestore06c764": 1,
        "alternateCxMain06c92c": 0,
        "cxDispatchWrapper08c72f": 2,
        "cxJpTrampoline08c745": 5,
        "display09efde": 1860,
        "display09efcb": 22,
        "display09efe8": 24,
        "low000b7c": 0,
        "eolOwner0a229d": 0,
        "eolTail0a22a4": 0
      },
      "hotBlocks": [
        {
          "pc": "0x0A2588",
          "count": 2904
        },
        {
          "pc": "0x0A255F",
          "count": 2904
        },
        {
          "pc": "0x0A2563",
          "count": 2261
        },
        {
          "pc": "0x0A257E",
          "count": 2261
        },
        {
          "pc": "0x09EFDE",
          "count": 1860
        },
        {
          "pc": "0x003D28",
          "count": 1078
        },
        {
          "pc": "0x003D25",
          "count": 1078
        },
        {
          "pc": "0x0A2572",
          "count": 1051
        },
        {
          "pc": "0x001CA6",
          "count": 1018
        },
        {
          "pc": "0x001CC0",
          "count": 994
        },
        {
          "pc": "0x001CCA",
          "count": 994
        },
        {
          "pc": "0x001C33",
          "count": 856
        },
        {
          "pc": "0x001C38",
          "count": 854
        },
        {
          "pc": "0x001C3C",
          "count": 832
        },
        {
          "pc": "0x001CE4",
          "count": 830
        },
        {
          "pc": "0x001C44",
          "count": 683
        },
        {
          "pc": "0x001C7D",
          "count": 683
        },
        {
          "pc": "0x001C81",
          "count": 683
        },
        {
          "pc": "0x001C82",
          "count": 683
        },
        {
          "pc": "0x001C48",
          "count": 683
        },
        {
          "pc": "0x0A19A4",
          "count": 672
        },
        {
          "pc": "0x0A3404",
          "count": 648
        },
        {
          "pc": "0x0A3411",
          "count": 582
        },
        {
          "pc": "0x0A2548",
          "count": 492
        },
        {
          "pc": "0x0A254F",
          "count": 492
        },
        {
          "pc": "0x0A258B",
          "count": 492
        },
        {
          "pc": "0x0A2695",
          "count": 492
        },
        {
          "pc": "0x0A2555",
          "count": 408
        },
        {
          "pc": "0x0A2585",
          "count": 408
        },
        {
          "pc": "0x0A269A",
          "count": 408
        }
      ],
      "lastBlocks": [
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
      "d007caTransitions": [
        {
          "block": 18167,
          "pc": "0x06C764",
          "prevPc": "0x08C782",
          "timing": "entry-vs-previous-block",
          "diff": {
            "D007CA": {
              "before": 361961,
              "after": 444716
            }
          }
        },
        {
          "block": 18168,
          "pc": "0x06C927",
          "prevPc": "0x06C764",
          "timing": "entry-vs-previous-block",
          "diff": {
            "D007CA": {
              "before": 444716,
              "after": 361961
            }
          }
        }
      ],
      "firstCriticalZero": null,
      "first202020": null,
      "pageErrors": []
    }
  ]
}
```


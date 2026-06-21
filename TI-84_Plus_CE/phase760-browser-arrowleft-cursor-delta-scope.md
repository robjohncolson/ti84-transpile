# Phase 760 Browser ArrowLeft Cursor-Delta Scope

Probe: `probe-phase760-browser-arrowleft-cursor-delta-scope.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase760-browser-arrowleft-cursor-delta-scope.mjs`

Serves an in-memory instrumented current `browser-shell.html`, boots coldboot with Preserve Display, presses `ArrowLeft`, and compares the phase759 bounded no-fix control against a narrow candidate that restores only `D0243A` to the pre-key value at the `0x001879` control pre-stop after the existing context-vector restore at `0x06C764`.

The disk `browser-shell.html` is not patched by this probe.

## Result

- ArrowLeft cursor correction candidate is bounded and sane: restore context vector at 0x06C764, stop at 0x001879, and restore only D0243A to 0xD1A8CC.
- Trace/no-fix cursor delta: D0243A 0xD1A8CC->0xD1A8CD appears at nextPc=0x05E372; owner is previous block 0x05E348 (block 49193).
- Trace/no-fix final: termination=control_pre_stop, stop=0x001879, D007CA=0x0585E9, D02590=0xD3FE81, D0243A=0xD1A8CD, VRAM=8593.
- Cursor-fix final: termination=control_pre_stop, stop=0x001879, D007CA=0x0585E9, D008E0=0xD1A863, D02590=0xD3FE81, D0243A=0xD1A8CC, D0243D=0xD2A83E, VRAM=8593, correction=0xD1A8CD->0xD1A8CC at 0x001879.

## Strategy Matrix

| Strategy | Cursor fix | Restore fired | Safe candidate | Termination | Steps | Last PC | D007CA | D02590 | D0243A | Corrections | Page errors |
|---|---|---|---|---|---:|---|---|---|---|---:|---:|
| traceNoFix | no | yes | NO | control_pre_stop | 52499 | 0x08C331 | 0x0585E9 | 0xD3FE81 | 0xD1A8CD | 0 | 0 |
| cursorFixAt001879 | yes | yes | YES | control_pre_stop | 52499 | 0x08C331 | 0x0585E9 | 0xD3FE81 | 0xD1A8CC | 1 | 0 |

## Strategy: traceNoFix

- Config: restoreArrowLeft=true, preStopArrowLeft=true, cursorFixAtStop=false, stepCap=90000.
- Assessment: restoreFired=true, finalHomeVector=true, saneCore=false, bounded=true, badRoute=false, noCorruption=true, noPageErrors=true, safeCandidate=false.
- Key result: termination=control_pre_stop, steps=52499, stop=0x001879, lastPc=0x08C331, contextRestore=0x06C764, D007CA 0x06C92C->0x0585E9.
- Final fields: D007CA=0x0585E9, D008E0=0xD1A863, D02590=0xD3FE81, D0243A=0xD1A8CD, D0243D=0xD2A83E, VRAM=8593.
- First D0243A delta: block 49193, prevPc=0x05E348, nextPc=0x05E372, 0xD1A8CC->0xD1A8CD.
- Target hits: vectorOwner08c782=1, vectorRestore06c764=1, alternateCxMain06c92c=0, cxDispatchWrapper08c72f=2, cleanup001879=1, cleanupTail0018f8=0, sentinel001c33=856, display09efde=1860, low000b7c=0, eolOwner0a229d=0, eolTail0a22a4=0.

### Core Field Transitions

| Block | PC | Prev PC | Timing | Diff |
|---:|---|---|---|---|
| 1 | 0x08C331 | - | entry-vs-previous-block | D008E0:0x000000->0xD1A863 |
| 14601 | 0x08377D | 0x061DEF | entry-vs-previous-block | D008E0:0xD1A863->0xD1A839 |
| 16188 | 0x08379A | 0x061E27 | entry-vs-previous-block | D008E0:0xD1A839->0xD1A863 |
| 18167 | 0x06C764 | 0x08C782 | entry-vs-previous-block | D007CA:0x0585E9->0x06C92C |
| 18168 | 0x06C927 | 0x06C764 | entry-vs-previous-block | D007CA:0x06C92C->0x0585E9 |
| 49193 | 0x05E372 | 0x05E348 | entry-vs-previous-block | D0243A:0xD1A8CC->0xD1A8CD |

### Cursor Corrections

_No cursor correction applied._

## Strategy: cursorFixAt001879

- Config: restoreArrowLeft=true, preStopArrowLeft=true, cursorFixAtStop=true, stepCap=90000.
- Assessment: restoreFired=true, finalHomeVector=true, saneCore=true, bounded=true, badRoute=false, noCorruption=true, noPageErrors=true, safeCandidate=true.
- Key result: termination=control_pre_stop, steps=52499, stop=0x001879, lastPc=0x08C331, contextRestore=0x06C764, D007CA 0x06C92C->0x0585E9.
- Final fields: D007CA=0x0585E9, D008E0=0xD1A863, D02590=0xD3FE81, D0243A=0xD1A8CC, D0243D=0xD2A83E, VRAM=8593.
- First D0243A delta: block 49193, prevPc=0x05E348, nextPc=0x05E372, 0xD1A8CC->0xD1A8CD.
- Target hits: vectorOwner08c782=1, vectorRestore06c764=1, alternateCxMain06c92c=0, cxDispatchWrapper08c72f=2, cleanup001879=1, cleanupTail0018f8=0, sentinel001c33=856, display09efde=1860, low000b7c=0, eolOwner0a229d=0, eolTail0a22a4=0.

### Core Field Transitions

| Block | PC | Prev PC | Timing | Diff |
|---:|---|---|---|---|
| 1 | 0x08C331 | - | entry-vs-previous-block | D008E0:0x000000->0xD1A863 |
| 14601 | 0x08377D | 0x061DEF | entry-vs-previous-block | D008E0:0xD1A863->0xD1A839 |
| 16188 | 0x08379A | 0x061E27 | entry-vs-previous-block | D008E0:0xD1A839->0xD1A863 |
| 18167 | 0x06C764 | 0x08C782 | entry-vs-previous-block | D007CA:0x0585E9->0x06C92C |
| 18168 | 0x06C927 | 0x06C764 | entry-vs-previous-block | D007CA:0x06C92C->0x0585E9 |
| 49193 | 0x05E372 | 0x05E348 | entry-vs-previous-block | D0243A:0xD1A8CC->0xD1A8CD |

### Cursor Corrections

| Block | PC | Prev PC | D0243A before | D0243A after |
|---:|---|---|---|---|
| 52336 | 0x001879 | 0x001872 | 0xD1A8CD | 0xD1A8CC |


## Compact Evidence

```json
{
  "finding": "ArrowLeft cursor correction candidate is bounded and sane: restore context vector at 0x06C764, stop at 0x001879, and restore only D0243A to 0xD1A8CC.",
  "results": [
    {
      "strategy": {
        "name": "traceNoFix",
        "restoreArrowLeft": true,
        "preStopArrowLeft": true,
        "cursorFixAtStop": false,
        "stepCap": 90000
      },
      "browserConfig": {
        "restoreArrowLeft": true,
        "preStopArrowLeft": true,
        "cursorFixAtStop": false,
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
      "cursorTransitions": [
        {
          "block": 49193,
          "pc": "0x05E372",
          "prevPc": "0x05E348",
          "timing": "entry-vs-previous-block",
          "diff": {
            "D0243A": {
              "before": 13740236,
              "after": 13740237
            }
          }
        }
      ],
      "cursorCorrections": [],
      "firstCriticalZero": null,
      "first202020": null,
      "pageErrors": []
    },
    {
      "strategy": {
        "name": "cursorFixAt001879",
        "restoreArrowLeft": true,
        "preStopArrowLeft": true,
        "cursorFixAtStop": true,
        "stepCap": 90000
      },
      "browserConfig": {
        "restoreArrowLeft": true,
        "preStopArrowLeft": true,
        "cursorFixAtStop": true,
        "stepCap": 90000
      },
      "assessment": {
        "restoreFired": true,
        "finalHomeVector": true,
        "saneCore": true,
        "bounded": true,
        "badRoute": false,
        "noCorruption": true,
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
          "D0243A": "0xD1A8CC",
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
          "D0243A": 13740236,
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
            "D0243A": 13740236,
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
          "D0243A": 13740236,
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
      "cursorTransitions": [
        {
          "block": 49193,
          "pc": "0x05E372",
          "prevPc": "0x05E348",
          "timing": "entry-vs-previous-block",
          "diff": {
            "D0243A": {
              "before": 13740236,
              "after": 13740237
            }
          }
        }
      ],
      "cursorCorrections": [
        {
          "block": 52336,
          "pc": "0x001879",
          "prevPc": "0x001872",
          "before": 13740237,
          "after": 13740236
        }
      ],
      "firstCriticalZero": null,
      "first202020": null,
      "pageErrors": []
    }
  ]
}
```


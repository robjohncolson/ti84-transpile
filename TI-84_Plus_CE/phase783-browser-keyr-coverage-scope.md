# Phase 783 Browser KeyR Coverage Scope

Probe: `probe-phase783-browser-keyr-coverage-scope.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase783-browser-keyr-coverage-scope.mjs`

Serves an in-memory instrumented current `browser-shell.html`, boots coldboot with Preserve Display, presses `KeyR` / `STAT`, and classifies the first coverage-sweep key.

The probe compares the current disk behavior against an in-memory coldboot scan-code mapping (`KeyR -> 0x20`) and an in-memory `0x001879` control pre-stop. It intentionally does not patch disk `browser-shell.html`.

## Result

- KeyR already reaches the 0x001879 wipe path through the current disk matrix path; a pre-stop-only treatment is patch-ready, and adding a coldboot scan-code mapping is not required for this fix.
- Current disk mapping: keyMapHasKeyR=true, coldbootScan=-, coorMonScan=0x37, termination=max_steps, steps=60000, cleanupTail=1.
- Current/pre-stop-only: termination=control_pre_stop, stop=0x001879, D007CA=0x0585E9, D008E0=0xD1A863, D02590=0xD3FE81, D0243A=0xD1A8CC, D0243D=0xD2A83E, VRAM=11355, cleanupTail=0.
- Mapped/no-stop: termination=max_steps, steps=190000, D007CA=0x000000, D02590=0x000000, firstCriticalZero=observed-before-block, cleanupTail=1.
- Mapped/pre-stop-only: termination=control_pre_stop, stop=0x001879, D007CA=0x0585E9, D008E0=0xD1A863, D02590=0xD3FE81, D0243A=0xD1A8CC, D0243D=0xD2A83E, VRAM=11355, cleanupTail=0.

## Strategy Matrix

| Strategy | Scan map | Pre-stop | Classification flags | Termination | Steps | Stop | Last PC | D00587 | D007CA | D008E0 | D02590 | D0243A | D0243D | VRAM | Wipe tail | Page errors |
|---|---|---|---|---|---:|---|---|---|---|---|---|---|---|---:|---:|---:|
| currentUnmapped | disk | no | currentMissingScan | max_steps | 60000 | - | 0x005B4B | 0x00 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 11355 | 1 | 0 |
| currentPreStop001879Only | disk | 0x001879 | currentMissingScan, safeCandidate | control_pre_stop | 57982 | 0x001879 | 0x08C331 | 0x00 | 0x0585E9 | 0xD1A863 | 0xD3FE81 | 0xD1A8CC | 0xD2A83E | 11355 | 0 | 0 |
| mappedNoStop | 0x20 | no | mappedHitsWipe | max_steps | 190000 | - | 0x0021C2 | 0x00 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 3031 | 1 | 0 |
| mappedPreStop001879Only | 0x20 | 0x001879 | safeCandidate | control_pre_stop | 108794 | 0x001879 | 0x08C331 | 0x00 | 0x0585E9 | 0xD1A863 | 0xD3FE81 | 0xD1A8CC | 0xD2A83E | 11355 | 0 | 0 |

## Strategy: currentUnmapped

- Config: scanMapKeyR=false, preStopKeyR=false, stepCap=60000.
- Pre-run mapping: keyMapHasKeyR=true, coldbootScan=-, coorMonScan=0x37.
- Assessment: {"currentMissingScan":true,"mappedHitsWipe":false,"stoppedAtPrewipe":false,"saneHomeState":false,"noZeroOrSpaceCorruption":false,"noWipeTail":false,"noUnexpectedRestores":true,"vramNotWiped":true,"noPageErrors":true,"safeCandidate":false}.
- Key result: label=STAT, termination=max_steps, steps=60000, controlStop=-, controlLabel=-, contextRestoreEnabled=false, contextRestored=false, cursorRestored=false.
- Final fields: D00587=0x00, D007CA=0x000000, D008E0=0x000000, D02590=0x000000, D0243A=0x000000, D0243D=0x000000, VRAM=11355, pageErrors=0.
- First D007CA transition: block 57955, prevPc=0x001879, nextPc=0x0018F8, 0x0585E9->0x000000.
- First D0243A transition: block 57955, prevPc=0x001879, nextPc=0x0018F8, 0xD1A8CC->0x000000.
- Target hits: cleanup001879=1, cleanupTail0018f8=1, sentinel0158bc=2, postInsertGate0158de=2, display09efde=35388.

## Strategy: currentPreStop001879Only

- Config: scanMapKeyR=false, preStopKeyR=true, stepCap=130000.
- Pre-run mapping: keyMapHasKeyR=true, coldbootScan=-, coorMonScan=0x37.
- Assessment: {"currentMissingScan":true,"mappedHitsWipe":false,"stoppedAtPrewipe":true,"saneHomeState":true,"noZeroOrSpaceCorruption":true,"noWipeTail":true,"noUnexpectedRestores":true,"vramNotWiped":true,"noPageErrors":true,"safeCandidate":true}.
- Key result: label=STAT, termination=control_pre_stop, steps=57982, controlStop=0x001879, controlLabel=keyr-prewipe-stop, contextRestoreEnabled=false, contextRestored=false, cursorRestored=false.
- Final fields: D00587=0x00, D007CA=0x0585E9, D008E0=0xD1A863, D02590=0xD3FE81, D0243A=0xD1A8CC, D0243D=0xD2A83E, VRAM=11355, pageErrors=0.
- First D007CA transition: none captured.
- First D0243A transition: none captured.
- Target hits: cleanup001879=1, cleanupTail0018f8=0, sentinel0158bc=2, postInsertGate0158de=2, display09efde=35388.

## Strategy: mappedNoStop

- Config: scanMapKeyR=true, preStopKeyR=false, stepCap=190000.
- Pre-run mapping: keyMapHasKeyR=true, coldbootScan=0x20, coorMonScan=0x37.
- Assessment: {"currentMissingScan":false,"mappedHitsWipe":true,"stoppedAtPrewipe":false,"saneHomeState":false,"noZeroOrSpaceCorruption":false,"noWipeTail":false,"noUnexpectedRestores":true,"vramNotWiped":false,"noPageErrors":true,"safeCandidate":false}.
- Key result: label=STAT, termination=max_steps, steps=190000, controlStop=-, controlLabel=-, contextRestoreEnabled=false, contextRestored=false, cursorRestored=false.
- Final fields: D00587=0x00, D007CA=0x000000, D008E0=0x000000, D02590=0x000000, D0243A=0x000000, D0243D=0x000000, VRAM=3031, pageErrors=0.
- First D007CA transition: block 108751, prevPc=0x001879, nextPc=0x0018F8, 0x0585E9->0x000000.
- First D0243A transition: block 108751, prevPc=0x001879, nextPc=0x0018F8, 0xD1A8CC->0x000000.
- Target hits: cleanup001879=1, cleanupTail0018f8=1, sentinel0158bc=2, postInsertGate0158de=2, display09efde=68988.

## Strategy: mappedPreStop001879Only

- Config: scanMapKeyR=true, preStopKeyR=true, stepCap=130000.
- Pre-run mapping: keyMapHasKeyR=true, coldbootScan=0x20, coorMonScan=0x37.
- Assessment: {"currentMissingScan":false,"mappedHitsWipe":false,"stoppedAtPrewipe":true,"saneHomeState":true,"noZeroOrSpaceCorruption":true,"noWipeTail":true,"noUnexpectedRestores":true,"vramNotWiped":true,"noPageErrors":true,"safeCandidate":true}.
- Key result: label=STAT, termination=control_pre_stop, steps=108794, controlStop=0x001879, controlLabel=keyr-prewipe-stop, contextRestoreEnabled=false, contextRestored=false, cursorRestored=false.
- Final fields: D00587=0x00, D007CA=0x0585E9, D008E0=0xD1A863, D02590=0xD3FE81, D0243A=0xD1A8CC, D0243D=0xD2A83E, VRAM=11355, pageErrors=0.
- First D007CA transition: none captured.
- First D0243A transition: none captured.
- Target hits: cleanup001879=1, cleanupTail0018f8=0, sentinel0158bc=2, postInsertGate0158de=2, display09efde=68988.


## Compact Evidence

```json
{
  "finding": "KeyR already reaches the 0x001879 wipe path through the current disk matrix path; a pre-stop-only treatment is patch-ready, and adding a coldboot scan-code mapping is not required for this fix.",
  "key": {
    "code": "KeyR",
    "char": "r",
    "label": "STAT",
    "scanCode": 32
  },
  "prestop": {
    "pc": 6265,
    "label": "keyr-prewipe-stop"
  },
  "results": [
    {
      "strategy": {
        "name": "currentUnmapped",
        "scanMapKeyR": false,
        "preStopKeyR": false,
        "stepCap": 60000
      },
      "browserConfig": {
        "scanMapKeyR": false,
        "preStopKeyR": false,
        "stepCap": 60000,
        "name": "currentUnmapped"
      },
      "assessment": {
        "currentMissingScan": true,
        "mappedHitsWipe": false,
        "stoppedAtPrewipe": false,
        "saneHomeState": false,
        "noZeroOrSpaceCorruption": false,
        "noWipeTail": false,
        "noUnexpectedRestores": true,
        "vramNotWiped": true,
        "noPageErrors": true,
        "safeCandidate": false
      },
      "before": {
        "status": "Coldboot complete. OS event loop is ready.",
        "lastPc": "0x08C331",
        "keyMapHasKeyR": true,
        "scanCodeForKeyR": null,
        "coorMonScanForKeyR": 55,
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
        "status": "Key: STAT → 60000 steps (max_steps, peak 11355px)",
        "lastPc": "0x005B4B",
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
          "D00595": "0x00",
          "D00596": "0x03"
        },
        "lastKey": {
          "code": "KeyR",
          "label": "STAT",
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
          "steps": 60000,
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
          "vramPeak": 11355,
          "vramCurrent": 11355
        },
        "pageErrors": []
      },
      "targetCounts": {
        "reset000000": 1,
        "rst000038": 29,
        "coldIdle0019b5": 0,
        "cleanup001879": 1,
        "cleanupTail0018f8": 1,
        "sentinel001c33": 171,
        "sentinel0158bc": 2,
        "postInsertGate0158de": 2,
        "display09efde": 35388,
        "display09efcb": 220,
        "display09efe8": 222
      },
      "hotBlocks": [
        {
          "pc": "0x09EFDE",
          "count": 35388
        },
        {
          "pc": "0x0A189E",
          "count": 910
        },
        {
          "pc": "0x0A190D",
          "count": 910
        },
        {
          "pc": "0x0A191F",
          "count": 910
        },
        {
          "pc": "0x0A1969",
          "count": 910
        },
        {
          "pc": "0x0A1980",
          "count": 910
        },
        {
          "pc": "0x0A19D7",
          "count": 910
        },
        {
          "pc": "0x0A1A1D",
          "count": 910
        },
        {
          "pc": "0x0A1854",
          "count": 895
        },
        {
          "pc": "0x0A19CC",
          "count": 862
        },
        {
          "pc": "0x0A187C",
          "count": 856
        },
        {
          "pc": "0x0A1976",
          "count": 856
        },
        {
          "pc": "0x0A188A",
          "count": 784
        },
        {
          "pc": "0x0A1939",
          "count": 784
        },
        {
          "pc": "0x0A19A4",
          "count": 336
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
          "pc": "0x09EFE8",
          "count": 222
        },
        {
          "pc": "0x09EFCB",
          "count": 220
        },
        {
          "pc": "0x09EFEF",
          "count": 210
        },
        {
          "pc": "0x001CA6",
          "count": 198
        },
        {
          "pc": "0x003D28",
          "count": 196
        },
        {
          "pc": "0x003D25",
          "count": 196
        },
        {
          "pc": "0x003D40",
          "count": 189
        },
        {
          "pc": "0x001CC0",
          "count": 182
        },
        {
          "pc": "0x001CCA",
          "count": 182
        },
        {
          "pc": "0x006129",
          "count": 173
        },
        {
          "pc": "0x00612E",
          "count": 173
        },
        {
          "pc": "0x001C33",
          "count": 171
        },
        {
          "pc": "0x001C38",
          "count": 169
        },
        {
          "pc": "0x001C3C",
          "count": 155
        },
        {
          "pc": "0x001CE4",
          "count": 153
        },
        {
          "pc": "0x08761B",
          "count": 150
        },
        {
          "pc": "0x001C44",
          "count": 135
        },
        {
          "pc": "0x001C7D",
          "count": 135
        },
        {
          "pc": "0x001C81",
          "count": 135
        },
        {
          "pc": "0x001C82",
          "count": 135
        },
        {
          "pc": "0x001C48",
          "count": 135
        },
        {
          "pc": "0x087613",
          "count": 135
        },
        {
          "pc": "0x0A188C",
          "count": 126
        }
      ],
      "firstCriticalZero": {
        "source": "observed-before-block",
        "snapshot": {
          "block": 57955,
          "step": 57983,
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
            "stepCount": 57983
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
          "vram": 11355,
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
              "nonWhite": 365
            },
            "vramCurrent": 11355,
            "lastKey": null
          }
        }
      },
      "first202020": null,
      "d007caTransitions": [
        {
          "block": 57955,
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
              "before": 32,
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
              "before": 14,
              "after": 0
            }
          }
        }
      ],
      "cursorTransitions": [
        {
          "block": 57955,
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
              "before": 32,
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
              "before": 14,
              "after": 0
            }
          }
        }
      ],
      "lastBlocks": [
        "0x0059E6",
        "0x013D1D",
        "0x013D19",
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
        "0x013D1D",
        "0x013D19",
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
        "0x005B16"
      ],
      "pageErrors": []
    },
    {
      "strategy": {
        "name": "currentPreStop001879Only",
        "scanMapKeyR": false,
        "preStopKeyR": true,
        "stepCap": 130000
      },
      "browserConfig": {
        "scanMapKeyR": false,
        "preStopKeyR": true,
        "stepCap": 130000,
        "name": "currentPreStop001879Only"
      },
      "assessment": {
        "currentMissingScan": true,
        "mappedHitsWipe": false,
        "stoppedAtPrewipe": true,
        "saneHomeState": true,
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
        "keyMapHasKeyR": true,
        "scanCodeForKeyR": null,
        "coorMonScanForKeyR": 55,
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
        "status": "Key: STAT → 57982 steps (control_pre_stop, peak 11355px)",
        "lastPc": "0x08C331",
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x20",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D000C2": "0x00",
          "D02A28": "0x00",
          "D02A29": "0x000000",
          "D02A40": "0xD2A83E",
          "D00595": "0x01",
          "D00596": "0x0E"
        },
        "lastKey": {
          "code": "KeyR",
          "label": "STAT",
          "expectedInsertByte": null,
          "controlPreStopPc": 6265,
          "controlPreStopLabel": "keyr-prewipe-stop",
          "cursorBefore": null,
          "insertBlock": null,
          "postInsertGateBlock": null,
          "stoppedAtPostInsertGate": false,
          "D000C2Bit7Restored": false,
          "controlStopBlock": 57954,
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
          "steps": 57982,
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
          "vramPeak": 11355,
          "vramCurrent": 11355
        },
        "pageErrors": []
      },
      "targetCounts": {
        "reset000000": 1,
        "rst000038": 29,
        "coldIdle0019b5": 0,
        "cleanup001879": 1,
        "cleanupTail0018f8": 0,
        "sentinel001c33": 171,
        "sentinel0158bc": 2,
        "postInsertGate0158de": 2,
        "display09efde": 35388,
        "display09efcb": 220,
        "display09efe8": 222
      },
      "hotBlocks": [
        {
          "pc": "0x09EFDE",
          "count": 35388
        },
        {
          "pc": "0x0A189E",
          "count": 910
        },
        {
          "pc": "0x0A190D",
          "count": 910
        },
        {
          "pc": "0x0A191F",
          "count": 910
        },
        {
          "pc": "0x0A1969",
          "count": 910
        },
        {
          "pc": "0x0A1980",
          "count": 910
        },
        {
          "pc": "0x0A19D7",
          "count": 910
        },
        {
          "pc": "0x0A1A1D",
          "count": 910
        },
        {
          "pc": "0x0A1854",
          "count": 895
        },
        {
          "pc": "0x0A19CC",
          "count": 862
        },
        {
          "pc": "0x0A187C",
          "count": 856
        },
        {
          "pc": "0x0A1976",
          "count": 856
        },
        {
          "pc": "0x0A188A",
          "count": 784
        },
        {
          "pc": "0x0A1939",
          "count": 784
        },
        {
          "pc": "0x0A19A4",
          "count": 336
        },
        {
          "pc": "0x001377",
          "count": 254
        },
        {
          "pc": "0x09EFE8",
          "count": 222
        },
        {
          "pc": "0x09EFCB",
          "count": 220
        },
        {
          "pc": "0x09EFEF",
          "count": 210
        },
        {
          "pc": "0x001CA6",
          "count": 198
        },
        {
          "pc": "0x003D28",
          "count": 189
        },
        {
          "pc": "0x003D25",
          "count": 189
        },
        {
          "pc": "0x003D40",
          "count": 189
        },
        {
          "pc": "0x001CC0",
          "count": 182
        },
        {
          "pc": "0x001CCA",
          "count": 182
        },
        {
          "pc": "0x001C33",
          "count": 171
        },
        {
          "pc": "0x001C38",
          "count": 169
        },
        {
          "pc": "0x001C3C",
          "count": 155
        },
        {
          "pc": "0x001CE4",
          "count": 153
        },
        {
          "pc": "0x08761B",
          "count": 150
        },
        {
          "pc": "0x001C44",
          "count": 135
        },
        {
          "pc": "0x001C7D",
          "count": 135
        },
        {
          "pc": "0x001C81",
          "count": 135
        },
        {
          "pc": "0x001C82",
          "count": 135
        },
        {
          "pc": "0x001C48",
          "count": 135
        },
        {
          "pc": "0x087613",
          "count": 135
        },
        {
          "pc": "0x0A188C",
          "count": 126
        },
        {
          "pc": "0x0A1929",
          "count": 126
        },
        {
          "pc": "0x0A3408",
          "count": 96
        },
        {
          "pc": "0x0A3404",
          "count": 96
        }
      ],
      "firstCriticalZero": null,
      "first202020": null,
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
    },
    {
      "strategy": {
        "name": "mappedNoStop",
        "scanMapKeyR": true,
        "preStopKeyR": false,
        "stepCap": 190000
      },
      "browserConfig": {
        "scanMapKeyR": true,
        "preStopKeyR": false,
        "stepCap": 190000,
        "name": "mappedNoStop"
      },
      "assessment": {
        "currentMissingScan": false,
        "mappedHitsWipe": true,
        "stoppedAtPrewipe": false,
        "saneHomeState": false,
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
        "keyMapHasKeyR": true,
        "scanCodeForKeyR": 32,
        "coorMonScanForKeyR": 55,
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
        "status": "Key: STAT → 190000 steps (max_steps, peak 11355px)",
        "lastPc": "0x0021C2",
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
          "code": "KeyR",
          "label": "STAT",
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
          "vramPeak": 11355,
          "vramCurrent": 3031
        },
        "pageErrors": []
      },
      "targetCounts": {
        "reset000000": 1,
        "rst000038": 45,
        "coldIdle0019b5": 0,
        "cleanup001879": 1,
        "cleanupTail0018f8": 1,
        "sentinel001c33": 259,
        "sentinel0158bc": 2,
        "postInsertGate0158de": 2,
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
          "count": 8989
        },
        {
          "pc": "0x006D5D",
          "count": 8986
        },
        {
          "pc": "0x006D64",
          "count": 8985
        },
        {
          "pc": "0x006CDF",
          "count": 8983
        },
        {
          "pc": "0x006D0F",
          "count": 8983
        },
        {
          "pc": "0x006D38",
          "count": 8982
        },
        {
          "pc": "0x006D4F",
          "count": 8982
        },
        {
          "pc": "0x006CF7",
          "count": 8981
        },
        {
          "pc": "0x0A189E",
          "count": 1756
        },
        {
          "pc": "0x0A190D",
          "count": 1756
        },
        {
          "pc": "0x0A191F",
          "count": 1756
        },
        {
          "pc": "0x0A1969",
          "count": 1756
        },
        {
          "pc": "0x0A1980",
          "count": 1756
        },
        {
          "pc": "0x0A19D7",
          "count": 1756
        },
        {
          "pc": "0x0A1A1D",
          "count": 1756
        },
        {
          "pc": "0x0A1854",
          "count": 1726
        },
        {
          "pc": "0x0A19CC",
          "count": 1724
        },
        {
          "pc": "0x0A187C",
          "count": 1648
        },
        {
          "pc": "0x0A1976",
          "count": 1648
        },
        {
          "pc": "0x0A188A",
          "count": 1504
        },
        {
          "pc": "0x0A1939",
          "count": 1504
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
          "count": 308
        },
        {
          "pc": "0x003D25",
          "count": 308
        },
        {
          "pc": "0x001CA6",
          "count": 302
        },
        {
          "pc": "0x003D40",
          "count": 301
        },
        {
          "pc": "0x08761B",
          "count": 300
        },
        {
          "pc": "0x001CC0",
          "count": 282
        },
        {
          "pc": "0x001CCA",
          "count": 281
        },
        {
          "pc": "0x087613",
          "count": 270
        },
        {
          "pc": "0x001C33",
          "count": 259
        },
        {
          "pc": "0x001C38",
          "count": 257
        },
        {
          "pc": "0x0060B3",
          "count": 255
        }
      ],
      "firstCriticalZero": {
        "source": "observed-before-block",
        "snapshot": {
          "block": 108751,
          "step": 108795,
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
            "stepCount": 108795
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
          "vram": 11355,
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
              "nonWhite": 365
            },
            "vramCurrent": 11355,
            "lastKey": null
          }
        }
      },
      "first202020": null,
      "d007caTransitions": [
        {
          "block": 108751,
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
              "before": 32,
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
              "before": 14,
              "after": 0
            }
          }
        }
      ],
      "cursorTransitions": [
        {
          "block": 108751,
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
              "before": 32,
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
              "before": 14,
              "after": 0
            }
          }
        }
      ],
      "lastBlocks": [
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
        "0x006CF7",
        "0x006D0F",
        "0x006D38",
        "0x006D4F",
        "0x006D5D"
      ],
      "pageErrors": []
    },
    {
      "strategy": {
        "name": "mappedPreStop001879Only",
        "scanMapKeyR": true,
        "preStopKeyR": true,
        "stepCap": 130000
      },
      "browserConfig": {
        "scanMapKeyR": true,
        "preStopKeyR": true,
        "stepCap": 130000,
        "name": "mappedPreStop001879Only"
      },
      "assessment": {
        "currentMissingScan": false,
        "mappedHitsWipe": false,
        "stoppedAtPrewipe": true,
        "saneHomeState": true,
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
        "keyMapHasKeyR": true,
        "scanCodeForKeyR": 32,
        "coorMonScanForKeyR": 55,
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
        "status": "Key: STAT → 108794 steps (control_pre_stop, peak 11355px)",
        "lastPc": "0x08C331",
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x20",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00",
          "D000C2": "0x00",
          "D02A28": "0x00",
          "D02A29": "0x000000",
          "D02A40": "0xD2A83E",
          "D00595": "0x01",
          "D00596": "0x0E"
        },
        "lastKey": {
          "code": "KeyR",
          "label": "STAT",
          "expectedInsertByte": null,
          "controlPreStopPc": 6265,
          "controlPreStopLabel": "keyr-prewipe-stop",
          "cursorBefore": null,
          "insertBlock": null,
          "postInsertGateBlock": null,
          "stoppedAtPostInsertGate": false,
          "D000C2Bit7Restored": false,
          "controlStopBlock": 108750,
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
          "steps": 108794,
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
          "vramPeak": 11355,
          "vramCurrent": 11355
        },
        "pageErrors": []
      },
      "targetCounts": {
        "reset000000": 1,
        "rst000038": 45,
        "coldIdle0019b5": 0,
        "cleanup001879": 1,
        "cleanupTail0018f8": 0,
        "sentinel001c33": 256,
        "sentinel0158bc": 2,
        "postInsertGate0158de": 2,
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
          "count": 1756
        },
        {
          "pc": "0x0A190D",
          "count": 1756
        },
        {
          "pc": "0x0A191F",
          "count": 1756
        },
        {
          "pc": "0x0A1969",
          "count": 1756
        },
        {
          "pc": "0x0A1980",
          "count": 1756
        },
        {
          "pc": "0x0A19D7",
          "count": 1756
        },
        {
          "pc": "0x0A1A1D",
          "count": 1756
        },
        {
          "pc": "0x0A1854",
          "count": 1726
        },
        {
          "pc": "0x0A19CC",
          "count": 1724
        },
        {
          "pc": "0x0A187C",
          "count": 1648
        },
        {
          "pc": "0x0A1976",
          "count": 1648
        },
        {
          "pc": "0x0A188A",
          "count": 1504
        },
        {
          "pc": "0x0A1939",
          "count": 1504
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
          "count": 301
        },
        {
          "pc": "0x003D25",
          "count": 301
        },
        {
          "pc": "0x003D40",
          "count": 301
        },
        {
          "pc": "0x08761B",
          "count": 300
        },
        {
          "pc": "0x001CA6",
          "count": 299
        },
        {
          "pc": "0x001CC0",
          "count": 279
        },
        {
          "pc": "0x001CCA",
          "count": 279
        },
        {
          "pc": "0x087613",
          "count": 270
        },
        {
          "pc": "0x001C33",
          "count": 256
        },
        {
          "pc": "0x001C38",
          "count": 254
        },
        {
          "pc": "0x001377",
          "count": 254
        },
        {
          "pc": "0x0A188C",
          "count": 252
        },
        {
          "pc": "0x0A1929",
          "count": 252
        },
        {
          "pc": "0x001C3C",
          "count": 236
        },
        {
          "pc": "0x001CE4",
          "count": 234
        },
        {
          "pc": "0x0A19A4",
          "count": 224
        },
        {
          "pc": "0x001C44",
          "count": 203
        },
        {
          "pc": "0x001C7D",
          "count": 203
        },
        {
          "pc": "0x001C81",
          "count": 203
        },
        {
          "pc": "0x001C82",
          "count": 203
        },
        {
          "pc": "0x001C48",
          "count": 203
        },
        {
          "pc": "0x0A3404",
          "count": 192
        },
        {
          "pc": "0x0A3408",
          "count": 166
        }
      ],
      "firstCriticalZero": null,
      "first202020": null,
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


# Phase 834 Browser EOL Route

Probe: `probe-phase834-browser-eol-route.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase834-browser-eol-route.mjs`

Serves the real disk `browser-shell.html`, boots coldboot with Preserve Display, presses browser EOL (`Escape`), and classifies the current route without patching the browser shell.

## Result

- Classification: PRE_STOP_0A229D.
- Escape termination=control_pre_stop, steps=7363, controlStopPc=0x0A229D, controlStopLabel=clear-eol-bc-zero-owner, stoppedBeforeControlClear=true.
- UI clear: applied=true, roi=36->0, D0243A=0xD1A8CC, buffer=0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00.
- Fields: D007CA=0x0585E9, D008E0=0xD1A863, D02590=0xD3FE81, D0243D=0xD2A83E.
- Tuple/engine evidence: tupleCoreSignal=false, tupleRestoreLog=false, tupleDiffs={"D0059A":{"before":0,"after":2}}, persistence={"tokenGate":0,"tokenA":0,"tokenB":0,"tuple":{"D02A29":0,"D02A2B":0,"D02A1B":0,"D0059A":2,"D01150":0,"D0243D":13805630,"D02A40":13805630,"D02A28":0}}.
- Cleanup/display: wipes=0, VRAM current=8549, keyPeak=8585.
- Page errors: []

## Checks

| Check | Status |
| --- | --- |
| code | PASS |
| label | PASS |
| controlPreStopPc | PASS |
| controlPreStopLabel | PASS |
| termination | PASS |
| controlStopPc | PASS |
| stoppedBeforeControlClear | PASS |
| uiClearApplied | PASS |
| noWipes | PASS |
| D007CA | PASS |
| D02590 | PASS |
| vramPreserved | PASS |
| noPageErrors | PASS |

## Pre-Key Browser State

```json
{
  "editLine": {
    "D007CA": 361961,
    "D008E0": 0,
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
      "nonWhite": 0
    },
    "vramCurrent": 8549,
    "lastKey": null
  },
  "persistence": {
    "tokenGate": 0,
    "tokenA": 0,
    "tokenB": 0,
    "tuple": {
      "D02A29": 0,
      "D02A2B": 0,
      "D02A1B": 0,
      "D0059A": 0,
      "D01150": 0,
      "D0243D": 13805630,
      "D02A40": 13805630,
      "D02A28": 0
    }
  },
  "status": "Coldboot complete. OS event loop is ready."
}
```

## Full JSON

```json
{
  "probe": "phase834-browser-eol-route",
  "chromePath": "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "pageUrl": "http://127.0.0.1:52597/browser-shell.html",
  "pass": true,
  "classification": {
    "classification": "PRE_STOP_0A229D",
    "checks": {
      "code": true,
      "label": true,
      "controlPreStopPc": true,
      "controlPreStopLabel": true,
      "termination": true,
      "controlStopPc": true,
      "stoppedBeforeControlClear": true,
      "uiClearApplied": true,
      "noWipes": true,
      "D007CA": true,
      "D02590": true,
      "vramPreserved": true,
      "noPageErrors": true
    },
    "preStop0A229D": true,
    "engine08F54B": false,
    "tupleCoreSignal": false,
    "tupleDiffs": {
      "D0059A": {
        "before": 0,
        "after": 2
      }
    },
    "hasTupleRestoreLog": false,
    "low006D": false,
    "missing202020": false
  },
  "state": {
    "status": "Key: CLEAR → 7363 steps (control_pre_stop, peak 8585px)",
    "scanText": "0x00",
    "lastKey": {
      "code": "Escape",
      "label": "CLEAR",
      "expectedInsertByte": null,
      "controlPreStopPc": 664221,
      "controlPreStopLabel": "clear-eol-bc-zero-owner",
      "cursorBefore": null,
      "insertBlock": null,
      "postInsertGateBlock": null,
      "stoppedAtPostInsertGate": false,
      "D000C2Bit7Restored": false,
      "controlStopBlock": 7349,
      "controlStopPc": 664221,
      "controlStopCursorBefore": null,
      "controlStopCursorAfter": null,
      "controlStopCursorRestored": false,
      "uiClearApplied": true,
      "uiClearResult": {
        "ok": true,
        "reason": "clear-key",
        "editBase": 13740236,
        "clearLen": 128,
        "roiBefore": 36,
        "roiAfter": 0,
        "D0243A": 13740236,
        "D00595": 0,
        "D00596": 0
      },
      "stoppedBeforeControlClear": true,
      "contextVectorRestoreEnabled": false,
      "contextVectorRestored": false,
      "contextVectorRestoreBlock": null,
      "contextVectorRestorePc": null,
      "contextVectorD007CABefore": null,
      "contextVectorD007CAAfter": null,
      "steps": 7363,
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
      "vramPeak": 8585,
      "vramCurrent": 8549
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
        "nonWhite": 0
      },
      "vramCurrent": 8549,
      "lastKey": {
        "code": "Escape",
        "label": "CLEAR",
        "expectedInsertByte": null,
        "controlPreStopPc": 664221,
        "controlPreStopLabel": "clear-eol-bc-zero-owner",
        "cursorBefore": null,
        "insertBlock": null,
        "postInsertGateBlock": null,
        "stoppedAtPostInsertGate": false,
        "D000C2Bit7Restored": false,
        "controlStopBlock": 7349,
        "controlStopPc": 664221,
        "controlStopCursorBefore": null,
        "controlStopCursorAfter": null,
        "controlStopCursorRestored": false,
        "uiClearApplied": true,
        "uiClearResult": {
          "ok": true,
          "reason": "clear-key",
          "editBase": 13740236,
          "clearLen": 128,
          "roiBefore": 36,
          "roiAfter": 0,
          "D0243A": 13740236,
          "D00595": 0,
          "D00596": 0
        },
        "stoppedBeforeControlClear": true,
        "contextVectorRestoreEnabled": false,
        "contextVectorRestored": false,
        "contextVectorRestoreBlock": null,
        "contextVectorRestorePc": null,
        "contextVectorD007CABefore": null,
        "contextVectorD007CAAfter": null,
        "steps": 7363,
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
        "vramPeak": 8585,
        "vramCurrent": 8549
      }
    },
    "persistence": {
      "tokenGate": 0,
      "tokenA": 0,
      "tokenB": 0,
      "tuple": {
        "D02A29": 0,
        "D02A2B": 0,
        "D02A1B": 0,
        "D0059A": 2,
        "D01150": 0,
        "D0243D": 13805630,
        "D02A40": 13805630,
        "D02A28": 0
      }
    },
    "logText": "Click Boot to load ROM (~15 MB compressed)--- Decoding ROM (145932 blocks, 17.0149% coverage) ------ Coldboot Phase 1: Z80 cold boot (0x000000, 20K steps) ------ Phase 1 done: 20000 steps, max_steps at 0x001cc0 ------ Coldboot Phase 2: Kernel init (0x08C331, 100K steps) ------ Phase 2 done: 100000 steps, max_steps at 0x000a92 ------ Coldboot Phase 3: Post-init (0x0802B2, 100 steps) ------ Phase 3 done: 100 steps, max_steps at 0x0158bc ------ Coldboot Phase 4: Warm idle continuation (0x0019be, 1.5M step cap) ------ Phase 4 done: 192290 steps, halt at 0x0019b5 ------ Coldboot Phase 5: Launch-home init (0x09dd62, 300K step cap) ------ Phase 5 done: 275843 steps, halt at 0x0019b5 (VAT snapshot captured) ------ Coldboot Phase 6: Home repaint (0x058241, 300K step cap) ------ Phase 6 done: 49474 steps, halt at 0x0019b5; D007CA=0x0585e9, VAT=0xd3fe81, VRAM=8549px ------ Edit context seeded (cursor=0xD1A8CC, ready for typed input) ------ Coldboot seeded (entry=0x08c331, halt=0x0019b5, SP=0xd1a866, IY=0xD00080, timerInterrupt=true) ---Re-armed D007CA for next keypressCLEAR reset entry line: roi 36->0, cursor=0xd1a8cc",
    "pageErrors": [],
    "preKey": {
      "editLine": {
        "D007CA": 361961,
        "D008E0": 0,
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
          "nonWhite": 0
        },
        "vramCurrent": 8549,
        "lastKey": null
      },
      "persistence": {
        "tokenGate": 0,
        "tokenA": 0,
        "tokenB": 0,
        "tuple": {
          "D02A29": 0,
          "D02A2B": 0,
          "D02A1B": 0,
          "D0059A": 0,
          "D01150": 0,
          "D0243D": 13805630,
          "D02A40": 13805630,
          "D02A28": 0
        }
      },
      "status": "Coldboot complete. OS event loop is ready."
    }
  }
}
```


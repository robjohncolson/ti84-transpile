# Phase 675: Enter/Clear Non-Insertable Control Behavior

Probe: `probe-phase675-enter-clear-controls.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase675-enter-clear-controls.mjs`

## Result

- Overall: **PASS**
- Scope: browser-shell diagnostics only; no browser-shell/runtime/transpiler edits.
- Page errors: []

## Findings

- ENTER: expectedInsertByte=null, insertBlock=null, stoppedAfterInsert=false; changed state: cursor 0xD1A8CD -> 0x000000, bufferChanged=true, wipes=3; termination=max_steps, steps=300000.
- CLEAR: expectedInsertByte=null, insertBlock=null, stoppedAfterInsert=false; changed state: cursor 0xD1A8CD -> 0x000000, bufferChanged=false, wipes=3; termination=max_steps, steps=350000.

## Control Key Summary

| control | shell expected insert | insert block | stopped after insert | termination | steps | wipes | D0243A before | D0243A after | buffer before | buffer after | canvas ink delta | status |
|---|---:|---:|---|---|---:|---:|---:|---:|---|---|---:|---|
| ENTER | - | - | no | max_steps | 300000 | 3 | 0xD1A8CD | 0x000000 | 0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00 | 0x00 0x00 0x00 0x01 0x00 0x01 0x00 0x00 | 3834 | NON-INSERT |
| CLEAR | - | - | no | max_steps | 350000 | 3 | 0xD1A8CD | 0x000000 | 0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00 | 0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00 | 0 | NON-INSERT |

## Persistence Diagnostics

| control | tokenGate | tokenA | tokenB | D02A29 | D02A40 | D02A28 | VRAM | status text |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| ENTER | 0x00 | 0x00 | 0x00 | 0x0000 | 0x000000 | 0x00 | 3031 | Key: ENTER ? 300000 steps (max_steps, peak 14681px) |
| CLEAR | 0x00 | 0x00 | 0x00 | 0x0000 | 0x000000 | 0x00 | 3039 | Key: CLEAR ? 350000 steps (max_steps, peak 8754px) |

## Canvas Deltas

| sample | ROI | diff previous | ink previous | light previous | incremental bbox | final bbox |
|---|---|---:|---:|---:|---|---|
| ENTER after 2 | x=0, y=34, w=160, h=24 | 65 | 65 | 0 | 2,39..11,52 | 2,39..11,52 |
| ENTER after ENTER | x=0, y=34, w=160, h=24 | 3834 | 3834 | 0 | 0,34..159,57 | 0,34..159,57 |
| CLEAR after 2 | x=0, y=34, w=160, h=24 | 65 | 65 | 0 | 2,39..11,52 | 2,39..11,52 |
| CLEAR after CLEAR | x=0, y=34, w=160, h=24 | 65 | 0 | 65 | 2,39..11,52 | - |

## Full JSON

```json
{
  "probe": "phase675-enter-clear-controls",
  "chromePath": "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "pageUrl": "http://127.0.0.1:50213/browser-shell.html",
  "pass": true,
  "findings": [
    "ENTER: expectedInsertByte=null, insertBlock=null, stoppedAfterInsert=false; changed state: cursor 0xD1A8CD -> 0x000000, bufferChanged=true, wipes=3; termination=max_steps, steps=300000.",
    "CLEAR: expectedInsertByte=null, insertBlock=null, stoppedAfterInsert=false; changed state: cursor 0xD1A8CD -> 0x000000, bufferChanged=false, wipes=3; termination=max_steps, steps=350000."
  ],
  "scenarios": [
    {
      "control": {
        "label": "ENTER",
        "code": "Enter",
        "key": "Enter",
        "expectedScan": 9
      },
      "pass": true,
      "primePass": true,
      "controlNonInsertable": true,
      "baseline": {
        "label": "baseline",
        "roi": {
          "x": 0,
          "y": 34,
          "w": 160,
          "h": 24
        },
        "inkPixels": 0,
        "diffFromBaseline": 0,
        "inkDiffFromBaseline": 0,
        "lightDiffFromBaseline": 0,
        "diffFromPrevious": 0,
        "inkDiffFromPrevious": 0,
        "lightDiffFromPrevious": 0,
        "bbox": null,
        "incrementalBbox": null,
        "rows": [],
        "incrementalRows": []
      },
      "bootState": {
        "label": "boot",
        "status": "Coldboot complete. OS event loop is ready.",
        "lastKey": null,
        "diagnostics": {
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
        "vram": 8549,
        "errors": []
      },
      "primeRow": {
        "code": "Digit2",
        "label": "2",
        "expectedInsertByte": 50,
        "cursorBefore": 13740236,
        "insertBlock": 2601,
        "stoppedAfterInsert": true,
        "steps": 3609,
        "termination": "insert_stop",
        "wipes": 0,
        "D0243A": 13740237,
        "D007CA": 361961,
        "buffer": [
          50,
          0,
          0,
          0,
          0,
          0,
          0,
          0
        ],
        "vramPeak": 0,
        "vramCurrent": 8614
      },
      "afterPrimeSample": {
        "label": "after 2",
        "roi": {
          "x": 0,
          "y": 34,
          "w": 160,
          "h": 24
        },
        "inkPixels": 65,
        "diffFromBaseline": 65,
        "inkDiffFromBaseline": 65,
        "lightDiffFromBaseline": 0,
        "diffFromPrevious": 65,
        "inkDiffFromPrevious": 65,
        "lightDiffFromPrevious": 0,
        "bbox": {
          "x0": 2,
          "y0": 39,
          "x1": 11,
          "y1": 52
        },
        "incrementalBbox": {
          "x0": 2,
          "y0": 39,
          "x1": 11,
          "y1": 52
        },
        "rows": [
          {
            "y": 39,
            "count": 6
          },
          {
            "y": 40,
            "count": 8
          },
          {
            "y": 41,
            "count": 4
          },
          {
            "y": 42,
            "count": 4
          },
          {
            "y": 43,
            "count": 2
          },
          {
            "y": 44,
            "count": 3
          },
          {
            "y": 45,
            "count": 3
          },
          {
            "y": 46,
            "count": 3
          },
          {
            "y": 47,
            "count": 3
          },
          {
            "y": 48,
            "count": 3
          },
          {
            "y": 49,
            "count": 3
          },
          {
            "y": 50,
            "count": 3
          },
          {
            "y": 51,
            "count": 10
          },
          {
            "y": 52,
            "count": 10
          }
        ],
        "incrementalRows": [
          {
            "y": 39,
            "count": 6
          },
          {
            "y": 40,
            "count": 8
          },
          {
            "y": 41,
            "count": 4
          },
          {
            "y": 42,
            "count": 4
          },
          {
            "y": 43,
            "count": 2
          },
          {
            "y": 44,
            "count": 3
          },
          {
            "y": 45,
            "count": 3
          },
          {
            "y": 46,
            "count": 3
          },
          {
            "y": 47,
            "count": 3
          },
          {
            "y": 48,
            "count": 3
          },
          {
            "y": 49,
            "count": 3
          },
          {
            "y": 50,
            "count": 3
          },
          {
            "y": 51,
            "count": 10
          },
          {
            "y": 52,
            "count": 10
          }
        ]
      },
      "afterPrimeState": {
        "label": "after 2",
        "status": "Key: 2 ? 3609 steps (insert_stop, insert=0x32 @0xd1a8cc, peak 0px)",
        "lastKey": {
          "code": "Digit2",
          "label": "2",
          "expectedInsertByte": 50,
          "cursorBefore": 13740236,
          "insertBlock": 2601,
          "stoppedAfterInsert": true,
          "steps": 3609,
          "termination": "insert_stop",
          "wipes": 0,
          "D0243A": 13740237,
          "D007CA": 361961,
          "buffer": [
            50,
            0,
            0,
            0,
            0,
            0,
            0,
            0
          ],
          "vramPeak": 0,
          "vramCurrent": 8614
        },
        "diagnostics": {
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
        "vram": 8614,
        "errors": []
      },
      "controlRow": {
        "code": "Enter",
        "label": "ENTER",
        "expectedInsertByte": null,
        "cursorBefore": null,
        "insertBlock": null,
        "stoppedAfterInsert": false,
        "steps": 300000,
        "termination": "max_steps",
        "wipes": 3,
        "D0243A": 0,
        "D007CA": 0,
        "buffer": [
          0,
          0,
          0,
          1,
          0,
          1,
          0,
          0
        ],
        "vramPeak": 14681,
        "vramCurrent": 3031
      },
      "afterControlSample": {
        "label": "after ENTER",
        "roi": {
          "x": 0,
          "y": 34,
          "w": 160,
          "h": 24
        },
        "inkPixels": 3837,
        "diffFromBaseline": 3837,
        "inkDiffFromBaseline": 3837,
        "lightDiffFromBaseline": 0,
        "diffFromPrevious": 3834,
        "inkDiffFromPrevious": 3834,
        "lightDiffFromPrevious": 0,
        "bbox": {
          "x0": 0,
          "y0": 34,
          "x1": 159,
          "y1": 57
        },
        "incrementalBbox": {
          "x0": 0,
          "y0": 34,
          "x1": 159,
          "y1": 57
        },
        "rows": [
          {
            "y": 34,
            "count": 160
          },
          {
            "y": 35,
            "count": 160
          },
          {
            "y": 36,
            "count": 160
          },
          {
            "y": 37,
            "count": 160
          },
          {
            "y": 38,
            "count": 160
          },
          {
            "y": 39,
            "count": 160
          },
          {
            "y": 40,
            "count": 160
          },
          {
            "y": 41,
            "count": 160
          },
          {
            "y": 42,
            "count": 160
          },
          {
            "y": 43,
            "count": 160
          },
          {
            "y": 44,
            "count": 160
          },
          {
            "y": 45,
            "count": 160
          },
          {
            "y": 46,
            "count": 160
          },
          {
            "y": 47,
            "count": 160
          },
          {
            "y": 48,
            "count": 160
          },
          {
            "y": 49,
            "count": 160
          },
          {
            "y": 50,
            "count": 160
          },
          {
            "y": 51,
            "count": 160
          },
          {
            "y": 52,
            "count": 160
          },
          {
            "y": 53,
            "count": 160
          },
          {
            "y": 54,
            "count": 159
          },
          {
            "y": 55,
            "count": 159
          },
          {
            "y": 56,
            "count": 160
          },
          {
            "y": 57,
            "count": 159
          }
        ],
        "incrementalRows": [
          {
            "y": 34,
            "count": 160
          },
          {
            "y": 35,
            "count": 160
          },
          {
            "y": 36,
            "count": 160
          },
          {
            "y": 37,
            "count": 160
          },
          {
            "y": 38,
            "count": 160
          },
          {
            "y": 39,
            "count": 160
          },
          {
            "y": 40,
            "count": 158
          },
          {
            "y": 41,
            "count": 160
          },
          {
            "y": 42,
            "count": 159
          },
          {
            "y": 43,
            "count": 160
          },
          {
            "y": 44,
            "count": 160
          },
          {
            "y": 45,
            "count": 160
          },
          {
            "y": 46,
            "count": 160
          },
          {
            "y": 47,
            "count": 160
          },
          {
            "y": 48,
            "count": 160
          },
          {
            "y": 49,
            "count": 160
          },
          {
            "y": 50,
            "count": 160
          },
          {
            "y": 51,
            "count": 160
          },
          {
            "y": 52,
            "count": 160
          },
          {
            "y": 53,
            "count": 160
          },
          {
            "y": 54,
            "count": 159
          },
          {
            "y": 55,
            "count": 159
          },
          {
            "y": 56,
            "count": 160
          },
          {
            "y": 57,
            "count": 159
          }
        ]
      },
      "afterControlState": {
        "label": "after ENTER",
        "status": "Key: ENTER ? 300000 steps (max_steps, peak 14681px)",
        "lastKey": {
          "code": "Enter",
          "label": "ENTER",
          "expectedInsertByte": null,
          "cursorBefore": null,
          "insertBlock": null,
          "stoppedAfterInsert": false,
          "steps": 300000,
          "termination": "max_steps",
          "wipes": 3,
          "D0243A": 0,
          "D007CA": 0,
          "buffer": [
            0,
            0,
            0,
            1,
            0,
            1,
            0,
            0
          ],
          "vramPeak": 14681,
          "vramCurrent": 3031
        },
        "diagnostics": {
          "tokenGate": 0,
          "tokenA": 0,
          "tokenB": 0,
          "tuple": {
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 0,
            "D0059A": 0,
            "D01150": 0,
            "D0243D": 0,
            "D02A40": 0,
            "D02A28": 0
          }
        },
        "vram": 3031,
        "errors": []
      },
      "analysis": {
        "slot": 1,
        "expectedInsertByteNull": true,
        "insertBlockNull": true,
        "stoppedAfterInsertFalse": true,
        "cursorBefore": 13740237,
        "cursorAfter": 0,
        "cursorDelta": -13740237,
        "bufferChanged": true,
        "wroteNextByte": false,
        "advancedLikeInsert": false,
        "looksLikeInsert": false,
        "controlEffect": true
      }
    },
    {
      "control": {
        "label": "CLEAR",
        "code": "Escape",
        "key": "Escape",
        "expectedScan": 15
      },
      "pass": true,
      "primePass": true,
      "controlNonInsertable": true,
      "baseline": {
        "label": "baseline",
        "roi": {
          "x": 0,
          "y": 34,
          "w": 160,
          "h": 24
        },
        "inkPixels": 0,
        "diffFromBaseline": 0,
        "inkDiffFromBaseline": 0,
        "lightDiffFromBaseline": 0,
        "diffFromPrevious": 0,
        "inkDiffFromPrevious": 0,
        "lightDiffFromPrevious": 0,
        "bbox": null,
        "incrementalBbox": null,
        "rows": [],
        "incrementalRows": []
      },
      "bootState": {
        "label": "boot",
        "status": "Coldboot complete. OS event loop is ready.",
        "lastKey": null,
        "diagnostics": {
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
        "vram": 8549,
        "errors": []
      },
      "primeRow": {
        "code": "Digit2",
        "label": "2",
        "expectedInsertByte": 50,
        "cursorBefore": 13740236,
        "insertBlock": 2601,
        "stoppedAfterInsert": true,
        "steps": 3609,
        "termination": "insert_stop",
        "wipes": 0,
        "D0243A": 13740237,
        "D007CA": 361961,
        "buffer": [
          50,
          0,
          0,
          0,
          0,
          0,
          0,
          0
        ],
        "vramPeak": 0,
        "vramCurrent": 8614
      },
      "afterPrimeSample": {
        "label": "after 2",
        "roi": {
          "x": 0,
          "y": 34,
          "w": 160,
          "h": 24
        },
        "inkPixels": 65,
        "diffFromBaseline": 65,
        "inkDiffFromBaseline": 65,
        "lightDiffFromBaseline": 0,
        "diffFromPrevious": 65,
        "inkDiffFromPrevious": 65,
        "lightDiffFromPrevious": 0,
        "bbox": {
          "x0": 2,
          "y0": 39,
          "x1": 11,
          "y1": 52
        },
        "incrementalBbox": {
          "x0": 2,
          "y0": 39,
          "x1": 11,
          "y1": 52
        },
        "rows": [
          {
            "y": 39,
            "count": 6
          },
          {
            "y": 40,
            "count": 8
          },
          {
            "y": 41,
            "count": 4
          },
          {
            "y": 42,
            "count": 4
          },
          {
            "y": 43,
            "count": 2
          },
          {
            "y": 44,
            "count": 3
          },
          {
            "y": 45,
            "count": 3
          },
          {
            "y": 46,
            "count": 3
          },
          {
            "y": 47,
            "count": 3
          },
          {
            "y": 48,
            "count": 3
          },
          {
            "y": 49,
            "count": 3
          },
          {
            "y": 50,
            "count": 3
          },
          {
            "y": 51,
            "count": 10
          },
          {
            "y": 52,
            "count": 10
          }
        ],
        "incrementalRows": [
          {
            "y": 39,
            "count": 6
          },
          {
            "y": 40,
            "count": 8
          },
          {
            "y": 41,
            "count": 4
          },
          {
            "y": 42,
            "count": 4
          },
          {
            "y": 43,
            "count": 2
          },
          {
            "y": 44,
            "count": 3
          },
          {
            "y": 45,
            "count": 3
          },
          {
            "y": 46,
            "count": 3
          },
          {
            "y": 47,
            "count": 3
          },
          {
            "y": 48,
            "count": 3
          },
          {
            "y": 49,
            "count": 3
          },
          {
            "y": 50,
            "count": 3
          },
          {
            "y": 51,
            "count": 10
          },
          {
            "y": 52,
            "count": 10
          }
        ]
      },
      "afterPrimeState": {
        "label": "after 2",
        "status": "Key: 2 ? 3609 steps (insert_stop, insert=0x32 @0xd1a8cc, peak 0px)",
        "lastKey": {
          "code": "Digit2",
          "label": "2",
          "expectedInsertByte": 50,
          "cursorBefore": 13740236,
          "insertBlock": 2601,
          "stoppedAfterInsert": true,
          "steps": 3609,
          "termination": "insert_stop",
          "wipes": 0,
          "D0243A": 13740237,
          "D007CA": 361961,
          "buffer": [
            50,
            0,
            0,
            0,
            0,
            0,
            0,
            0
          ],
          "vramPeak": 0,
          "vramCurrent": 8614
        },
        "diagnostics": {
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
        "vram": 8614,
        "errors": []
      },
      "controlRow": {
        "code": "Escape",
        "label": "CLEAR",
        "expectedInsertByte": null,
        "cursorBefore": null,
        "insertBlock": null,
        "stoppedAfterInsert": false,
        "steps": 350000,
        "termination": "max_steps",
        "wipes": 3,
        "D0243A": 0,
        "D007CA": 0,
        "buffer": [
          50,
          0,
          0,
          0,
          0,
          0,
          0,
          0
        ],
        "vramPeak": 8754,
        "vramCurrent": 3039
      },
      "afterControlSample": {
        "label": "after CLEAR",
        "roi": {
          "x": 0,
          "y": 34,
          "w": 160,
          "h": 24
        },
        "inkPixels": 0,
        "diffFromBaseline": 0,
        "inkDiffFromBaseline": 0,
        "lightDiffFromBaseline": 0,
        "diffFromPrevious": 65,
        "inkDiffFromPrevious": 0,
        "lightDiffFromPrevious": 65,
        "bbox": null,
        "incrementalBbox": {
          "x0": 2,
          "y0": 39,
          "x1": 11,
          "y1": 52
        },
        "rows": [],
        "incrementalRows": [
          {
            "y": 39,
            "count": 6
          },
          {
            "y": 40,
            "count": 8
          },
          {
            "y": 41,
            "count": 4
          },
          {
            "y": 42,
            "count": 4
          },
          {
            "y": 43,
            "count": 2
          },
          {
            "y": 44,
            "count": 3
          },
          {
            "y": 45,
            "count": 3
          },
          {
            "y": 46,
            "count": 3
          },
          {
            "y": 47,
            "count": 3
          },
          {
            "y": 48,
            "count": 3
          },
          {
            "y": 49,
            "count": 3
          },
          {
            "y": 50,
            "count": 3
          },
          {
            "y": 51,
            "count": 10
          },
          {
            "y": 52,
            "count": 10
          }
        ]
      },
      "afterControlState": {
        "label": "after CLEAR",
        "status": "Key: CLEAR ? 350000 steps (max_steps, peak 8754px)",
        "lastKey": {
          "code": "Escape",
          "label": "CLEAR",
          "expectedInsertByte": null,
          "cursorBefore": null,
          "insertBlock": null,
          "stoppedAfterInsert": false,
          "steps": 350000,
          "termination": "max_steps",
          "wipes": 3,
          "D0243A": 0,
          "D007CA": 0,
          "buffer": [
            50,
            0,
            0,
            0,
            0,
            0,
            0,
            0
          ],
          "vramPeak": 8754,
          "vramCurrent": 3039
        },
        "diagnostics": {
          "tokenGate": 0,
          "tokenA": 0,
          "tokenB": 0,
          "tuple": {
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 0,
            "D0059A": 0,
            "D01150": 0,
            "D0243D": 0,
            "D02A40": 0,
            "D02A28": 0
          }
        },
        "vram": 3039,
        "errors": []
      },
      "analysis": {
        "slot": 1,
        "expectedInsertByteNull": true,
        "insertBlockNull": true,
        "stoppedAfterInsertFalse": true,
        "cursorBefore": 13740237,
        "cursorAfter": 0,
        "cursorDelta": -13740237,
        "bufferChanged": false,
        "wroteNextByte": false,
        "advancedLikeInsert": false,
        "looksLikeInsert": false,
        "controlEffect": true
      }
    }
  ],
  "errors": []
}
```


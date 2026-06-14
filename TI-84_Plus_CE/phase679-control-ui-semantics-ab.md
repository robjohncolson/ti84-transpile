# Phase 679: Control-Key UI Semantics A/B

Probe: `probe-phase679-control-ui-semantics-ab.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase679-control-ui-semantics-ab.mjs`

## Result

- Overall: **PASS**
- Scope: headless browser run using `browser-shell.html`; the probe serves an instrumented in-memory copy to expose phase679 state helpers. No source edit to `browser-shell.html`.

## Scenario Matrix

| scenario | pass | control stop | after control buffer | after control cursor | after control ROI nonwhite | UI clear ROI nonwhite | next buffer | next cursor | next ROI bbox | page errors |
|---|---|---:|---|---:|---:|---:|---|---:|---|---|
| enter-current-preserve | yes | 0x0A2150 | 0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00 | 0xD1A8CD | 0 | - | 0x32 0x33 0x00 0x00 0x00 0x00 0x00 0x00 | 0xD1A8CE | 2,39,11,52 | [] |
| clear-current-preserve | yes | 0x001879 | 0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00 | 0xD1A8CD | 205 | - | 0x32 0x33 0x00 0x00 0x00 0x00 0x00 0x00 | 0xD1A8CE | 2,39,35,52 | [] |
| clear-ui-level-reset | yes | 0x001879 | 0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00 | 0xD1A8CD | 205 | 0 | 0x33 0x00 0x00 0x00 0x00 0x00 0x00 0x00 | 0xD1A8CD | 2,39,23,52 | [] |

## Findings

- Enter currently behaves as a safe preserve/no-op control in the browser demo: after a primed `2`, it stops before `0x0A2150`, keeps the buffer/cursor/context live, and the next `3` appends as `23`.
- Current CLEAR/Escape is also state-safe, but it is not semantic clear: after a primed `2`, it stops before `0x001879`, keeps the `2` visible/in the buffer, and the next `3` appends as `23`.
- The injected UI-level CLEAR candidate is viable: after the same pre-stop, clearing the edit buffer, resetting `D0243A` to `0xD1A8CC`, resetting renderer row/col `D00595/D00596` to zero, and whitening the entry-line ROI makes the next `3` insert as a fresh single-character buffer (`33 00 ...`) with cxMain/VAT intact.
- This does not prove OS-native CLEAR semantics. It proves a browser-demo semantic polish path can be implemented separately from the insert-byte map and separately from the destructive ROM clear path; visual placement must be checked from the ROI bbox if this is wired into the shell.

## Compact JSON

```json
[
  {
    "scenario": "enter-current-preserve",
    "strategy": "current",
    "pass": true,
    "prime": {
      "code": "Digit2",
      "termination": "insert_stop",
      "steps": 3609,
      "expectedInsertByte": "0x32",
      "insertBlock": 2601,
      "controlStopPc": null,
      "stoppedAfterInsert": true,
      "stoppedBeforeControlClear": false,
      "D007CA": "0x0585E9",
      "D008E0": "0xD1A863",
      "D0243A": "0xD1A8CD",
      "D0243D": "0xD2A83E",
      "D02590": "0xD3FE81",
      "wipes": 0,
      "buffer": "0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
      "vramCurrent": 8614
    },
    "afterPrime": {
      "hasMemory": true,
      "runtimeMode": "coldboot",
      "D007CA": "0x0585E9",
      "D008E0": "0xD1A863",
      "D0243A": "0xD1A8CD",
      "D0243D": "0xD2A83E",
      "D02590": "0xD3FE81",
      "D02A40": "0xD2A83E",
      "D00595": "0x00",
      "D00596": "0x01",
      "buffer": "0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
      "vramCurrent": 8614,
      "roi": {
        "x": 0,
        "y": 34,
        "w": 128,
        "h": 28,
        "nonWhite": 65,
        "dark": 65,
        "bbox": [
          2,
          39,
          11,
          52
        ]
      }
    },
    "control": {
      "code": "Enter",
      "termination": "control_pre_stop",
      "steps": 12604,
      "expectedInsertByte": null,
      "insertBlock": null,
      "controlStopPc": "0x0A2150",
      "stoppedAfterInsert": false,
      "stoppedBeforeControlClear": true,
      "D007CA": "0x0585E9",
      "D008E0": "0xD1A863",
      "D0243A": "0xD1A8CD",
      "D0243D": "0xD2A83E",
      "D02590": "0xD3FE81",
      "wipes": 0,
      "buffer": "0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
      "vramCurrent": 10149
    },
    "afterControl": {
      "hasMemory": true,
      "runtimeMode": "coldboot",
      "D007CA": "0x0585E9",
      "D008E0": "0xD1A863",
      "D0243A": "0xD1A8CD",
      "D0243D": "0xD2A83E",
      "D02590": "0xD3FE81",
      "D02A40": "0xD2A83E",
      "D00595": "0x00",
      "D00596": "0x00",
      "buffer": "0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
      "vramCurrent": 10149,
      "roi": {
        "x": 0,
        "y": 34,
        "w": 128,
        "h": 28,
        "nonWhite": 0,
        "dark": 0,
        "bbox": null
      }
    },
    "uiClear": null,
    "afterUiClear": null,
    "next": {
      "code": "Digit3",
      "termination": "insert_stop",
      "steps": 3850,
      "expectedInsertByte": "0x33",
      "insertBlock": 2839,
      "controlStopPc": null,
      "stoppedAfterInsert": true,
      "stoppedBeforeControlClear": false,
      "D007CA": "0x0585E9",
      "D008E0": "0xD1A863",
      "D0243A": "0xD1A8CE",
      "D0243D": "0xD2A83E",
      "D02590": "0xD3FE81",
      "wipes": 0,
      "buffer": "0x32 0x33 0x00 0x00 0x00 0x00 0x00 0x00",
      "vramCurrent": 10218
    },
    "afterNext": {
      "hasMemory": true,
      "runtimeMode": "coldboot",
      "D007CA": "0x0585E9",
      "D008E0": "0xD1A863",
      "D0243A": "0xD1A8CE",
      "D0243D": "0xD2A83E",
      "D02590": "0xD3FE81",
      "D02A40": "0xD2A83E",
      "D00595": "0x00",
      "D00596": "0x00",
      "buffer": "0x32 0x33 0x00 0x00 0x00 0x00 0x00 0x00",
      "vramCurrent": 10218,
      "roi": {
        "x": 0,
        "y": 34,
        "w": 128,
        "h": 28,
        "nonWhite": 69,
        "dark": 69,
        "bbox": [
          2,
          39,
          11,
          52
        ]
      }
    },
    "errors": []
  },
  {
    "scenario": "clear-current-preserve",
    "strategy": "current",
    "pass": true,
    "prime": {
      "code": "Digit2",
      "termination": "insert_stop",
      "steps": 3609,
      "expectedInsertByte": "0x32",
      "insertBlock": 2601,
      "controlStopPc": null,
      "stoppedAfterInsert": true,
      "stoppedBeforeControlClear": false,
      "D007CA": "0x0585E9",
      "D008E0": "0xD1A863",
      "D0243A": "0xD1A8CD",
      "D0243D": "0xD2A83E",
      "D02590": "0xD3FE81",
      "wipes": 0,
      "buffer": "0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
      "vramCurrent": 8614
    },
    "afterPrime": {
      "hasMemory": true,
      "runtimeMode": "coldboot",
      "D007CA": "0x0585E9",
      "D008E0": "0xD1A863",
      "D0243A": "0xD1A8CD",
      "D0243D": "0xD2A83E",
      "D02590": "0xD3FE81",
      "D02A40": "0xD2A83E",
      "D00595": "0x00",
      "D00596": "0x01",
      "buffer": "0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
      "vramCurrent": 8614,
      "roi": {
        "x": 0,
        "y": 34,
        "w": 128,
        "h": 28,
        "nonWhite": 65,
        "dark": 65,
        "bbox": [
          2,
          39,
          11,
          52
        ]
      }
    },
    "control": {
      "code": "Escape",
      "termination": "control_pre_stop",
      "steps": 5542,
      "expectedInsertByte": null,
      "insertBlock": null,
      "controlStopPc": "0x001879",
      "stoppedAfterInsert": false,
      "stoppedBeforeControlClear": true,
      "D007CA": "0x0585E9",
      "D008E0": "0xD1A863",
      "D0243A": "0xD1A8CD",
      "D0243D": "0xD2A83E",
      "D02590": "0xD3FE81",
      "wipes": 0,
      "buffer": "0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
      "vramCurrent": 8754
    },
    "afterControl": {
      "hasMemory": true,
      "runtimeMode": "coldboot",
      "D007CA": "0x0585E9",
      "D008E0": "0xD1A863",
      "D0243A": "0xD1A8CD",
      "D0243D": "0xD2A83E",
      "D02590": "0xD3FE81",
      "D02A40": "0xD2A83E",
      "D00595": "0x00",
      "D00596": "0x01",
      "buffer": "0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
      "vramCurrent": 8754,
      "roi": {
        "x": 0,
        "y": 34,
        "w": 128,
        "h": 28,
        "nonWhite": 205,
        "dark": 205,
        "bbox": [
          2,
          39,
          23,
          52
        ]
      }
    },
    "uiClear": null,
    "afterUiClear": null,
    "next": {
      "code": "Digit3",
      "termination": "insert_stop",
      "steps": 3274,
      "expectedInsertByte": "0x33",
      "insertBlock": 2269,
      "controlStopPc": null,
      "stoppedAfterInsert": true,
      "stoppedBeforeControlClear": false,
      "D007CA": "0x0585E9",
      "D008E0": "0xD1A863",
      "D0243A": "0xD1A8CE",
      "D0243D": "0xD2A83E",
      "D02590": "0xD3FE81",
      "wipes": 0,
      "buffer": "0x32 0x33 0x00 0x00 0x00 0x00 0x00 0x00",
      "vramCurrent": 8716
    },
    "afterNext": {
      "hasMemory": true,
      "runtimeMode": "coldboot",
      "D007CA": "0x0585E9",
      "D008E0": "0xD1A863",
      "D0243A": "0xD1A8CE",
      "D0243D": "0xD2A83E",
      "D02590": "0xD3FE81",
      "D02A40": "0xD2A83E",
      "D00595": "0x00",
      "D00596": "0x02",
      "buffer": "0x32 0x33 0x00 0x00 0x00 0x00 0x00 0x00",
      "vramCurrent": 8716,
      "roi": {
        "x": 0,
        "y": 34,
        "w": 128,
        "h": 28,
        "nonWhite": 167,
        "dark": 167,
        "bbox": [
          2,
          39,
          35,
          52
        ]
      }
    },
    "errors": []
  },
  {
    "scenario": "clear-ui-level-reset",
    "strategy": "ui-clear",
    "pass": true,
    "prime": {
      "code": "Digit2",
      "termination": "insert_stop",
      "steps": 3609,
      "expectedInsertByte": "0x32",
      "insertBlock": 2601,
      "controlStopPc": null,
      "stoppedAfterInsert": true,
      "stoppedBeforeControlClear": false,
      "D007CA": "0x0585E9",
      "D008E0": "0xD1A863",
      "D0243A": "0xD1A8CD",
      "D0243D": "0xD2A83E",
      "D02590": "0xD3FE81",
      "wipes": 0,
      "buffer": "0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
      "vramCurrent": 8614
    },
    "afterPrime": {
      "hasMemory": true,
      "runtimeMode": "coldboot",
      "D007CA": "0x0585E9",
      "D008E0": "0xD1A863",
      "D0243A": "0xD1A8CD",
      "D0243D": "0xD2A83E",
      "D02590": "0xD3FE81",
      "D02A40": "0xD2A83E",
      "D00595": "0x00",
      "D00596": "0x01",
      "buffer": "0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
      "vramCurrent": 8614,
      "roi": {
        "x": 0,
        "y": 34,
        "w": 128,
        "h": 28,
        "nonWhite": 65,
        "dark": 65,
        "bbox": [
          2,
          39,
          11,
          52
        ]
      }
    },
    "control": {
      "code": "Escape",
      "termination": "control_pre_stop",
      "steps": 5542,
      "expectedInsertByte": null,
      "insertBlock": null,
      "controlStopPc": "0x001879",
      "stoppedAfterInsert": false,
      "stoppedBeforeControlClear": true,
      "D007CA": "0x0585E9",
      "D008E0": "0xD1A863",
      "D0243A": "0xD1A8CD",
      "D0243D": "0xD2A83E",
      "D02590": "0xD3FE81",
      "wipes": 0,
      "buffer": "0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
      "vramCurrent": 8754
    },
    "afterControl": {
      "hasMemory": true,
      "runtimeMode": "coldboot",
      "D007CA": "0x0585E9",
      "D008E0": "0xD1A863",
      "D0243A": "0xD1A8CD",
      "D0243D": "0xD2A83E",
      "D02590": "0xD3FE81",
      "D02A40": "0xD2A83E",
      "D00595": "0x00",
      "D00596": "0x01",
      "buffer": "0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
      "vramCurrent": 8754,
      "roi": {
        "x": 0,
        "y": 34,
        "w": 128,
        "h": 28,
        "nonWhite": 205,
        "dark": 205,
        "bbox": [
          2,
          39,
          23,
          52
        ]
      }
    },
    "uiClear": {
      "ok": true,
      "state": {
        "hasMemory": true,
        "runtimeMode": "coldboot",
        "D007CA": 361961,
        "D008E0": 13740131,
        "D0243A": 13740236,
        "D0243D": 13805630,
        "D02590": 13893249,
        "D02A40": 13805630,
        "D00595": 0,
        "D00596": 0,
        "D00587": 0,
        "D0058C": 0,
        "D0058D": 15,
        "D0058E": 0,
        "D00080": 16,
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
        "vramCurrent": 8549,
        "roi": {
          "x": 0,
          "y": 34,
          "w": 128,
          "h": 28,
          "nonWhite": 0,
          "dark": 0,
          "bbox": null
        },
        "lastKey": {
          "code": "Escape",
          "label": "CLEAR",
          "expectedInsertByte": null,
          "controlPreStopPc": 6265,
          "controlPreStopLabel": "clear-bulk-clear-body",
          "cursorBefore": null,
          "insertBlock": null,
          "controlStopBlock": 5529,
          "controlStopPc": 6265,
          "stoppedAfterInsert": false,
          "stoppedBeforeControlClear": true,
          "steps": 5542,
          "termination": "control_pre_stop",
          "wipes": 0,
          "D0243A": 13740237,
          "D0243D": 13805630,
          "D007CA": 361961,
          "D008E0": 13740131,
          "D02590": 13893249,
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
          "vramCurrent": 8754
        }
      }
    },
    "afterUiClear": {
      "hasMemory": true,
      "runtimeMode": "coldboot",
      "D007CA": "0x0585E9",
      "D008E0": "0xD1A863",
      "D0243A": "0xD1A8CC",
      "D0243D": "0xD2A83E",
      "D02590": "0xD3FE81",
      "D02A40": "0xD2A83E",
      "D00595": "0x00",
      "D00596": "0x00",
      "buffer": "0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
      "vramCurrent": 8549,
      "roi": {
        "x": 0,
        "y": 34,
        "w": 128,
        "h": 28,
        "nonWhite": 0,
        "dark": 0,
        "bbox": null
      }
    },
    "next": {
      "code": "Digit3",
      "termination": "insert_stop",
      "steps": 3225,
      "expectedInsertByte": "0x33",
      "insertBlock": 2221,
      "controlStopPc": null,
      "stoppedAfterInsert": true,
      "stoppedBeforeControlClear": false,
      "D007CA": "0x0585E9",
      "D008E0": "0xD1A863",
      "D0243A": "0xD1A8CD",
      "D0243D": "0xD2A83E",
      "D02590": "0xD3FE81",
      "wipes": 0,
      "buffer": "0x33 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
      "vramCurrent": 8656
    },
    "afterNext": {
      "hasMemory": true,
      "runtimeMode": "coldboot",
      "D007CA": "0x0585E9",
      "D008E0": "0xD1A863",
      "D0243A": "0xD1A8CD",
      "D0243D": "0xD2A83E",
      "D02590": "0xD3FE81",
      "D02A40": "0xD2A83E",
      "D00595": "0x00",
      "D00596": "0x01",
      "buffer": "0x33 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
      "vramCurrent": 8656,
      "roi": {
        "x": 0,
        "y": 34,
        "w": 128,
        "h": 28,
        "nonWhite": 107,
        "dark": 107,
        "bbox": [
          2,
          39,
          23,
          52
        ]
      }
    },
    "errors": []
  }
]
```


# Phase 690: Browser D000C2 Gate Integration

Probe: `probe-phase690-browser-d000c2-gate-integration.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase690-browser-d000c2-gate-integration.mjs`

## Result

- Overall: **PASS**
- Keys: 2:post_insert_gate_stop/0x00, +:post_insert_gate_stop/0x00, 3:post_insert_gate_stop/0x00
- Page errors: []

## Full JSON

```json
{
  "probe": "phase690-browser-d000c2-gate-integration",
  "chromePath": "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "pageUrl": "http://127.0.0.1:53869/browser-shell.html",
  "pass": true,
  "keys": [
    {
      "key": "2",
      "status": "Key: 2 → 6947 steps (post_insert_gate_stop, insert=0x32 @0xd1a8cc, peak 8754px)",
      "lastKey": {
        "code": "Digit2",
        "label": "2",
        "expectedInsertByte": 50,
        "controlPreStopPc": null,
        "controlPreStopLabel": null,
        "cursorBefore": 13740236,
        "insertBlock": 2601,
        "postInsertGateBlock": 6929,
        "stoppedAtPostInsertGate": true,
        "D000C2Bit7Restored": true,
        "controlStopBlock": null,
        "controlStopPc": null,
        "uiClearApplied": false,
        "uiClearResult": null,
        "stoppedBeforeControlClear": false,
        "steps": 6947,
        "termination": "post_insert_gate_stop",
        "wipes": 0,
        "D0243A": 13740237,
        "D0243D": 13805630,
        "D007CA": 361961,
        "D008E0": 13740131,
        "D02590": 13893249,
        "D000C2": 0,
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
          50,
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
          "nonWhite": 205
        },
        "vramCurrent": 8754,
        "lastKey": {
          "code": "Digit2",
          "label": "2",
          "expectedInsertByte": 50,
          "controlPreStopPc": null,
          "controlPreStopLabel": null,
          "cursorBefore": 13740236,
          "insertBlock": 2601,
          "postInsertGateBlock": 6929,
          "stoppedAtPostInsertGate": true,
          "D000C2Bit7Restored": true,
          "controlStopBlock": null,
          "controlStopPc": null,
          "uiClearApplied": false,
          "uiClearResult": null,
          "stoppedBeforeControlClear": false,
          "steps": 6947,
          "termination": "post_insert_gate_stop",
          "wipes": 0,
          "D0243A": 13740237,
          "D0243D": 13805630,
          "D007CA": 361961,
          "D008E0": 13740131,
          "D02590": 13893249,
          "D000C2": 0,
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
      },
      "errors": []
    },
    {
      "key": "+",
      "status": "Key: + → 7609 steps (post_insert_gate_stop, insert=0x9e @0xd1a8cd, peak 8680px)",
      "lastKey": {
        "code": "NumpadAdd",
        "label": "+",
        "expectedInsertByte": 158,
        "controlPreStopPc": null,
        "controlPreStopLabel": null,
        "cursorBefore": 13740237,
        "insertBlock": 3454,
        "postInsertGateBlock": 7587,
        "stoppedAtPostInsertGate": true,
        "D000C2Bit7Restored": true,
        "controlStopBlock": null,
        "controlStopPc": null,
        "uiClearApplied": false,
        "uiClearResult": null,
        "stoppedBeforeControlClear": false,
        "steps": 7609,
        "termination": "post_insert_gate_stop",
        "wipes": 0,
        "D0243A": 13740238,
        "D0243D": 13805630,
        "D007CA": 361961,
        "D008E0": 13740131,
        "D02590": 13893249,
        "D000C2": 0,
        "buffer": [
          50,
          158,
          0,
          0,
          0,
          0,
          0,
          0
        ],
        "vramPeak": 8680,
        "vramCurrent": 8820
      },
      "diagnostics": {
        "D007CA": 361961,
        "D008E0": 13740131,
        "D0243A": 13740238,
        "D0243D": 13805630,
        "D02590": 13893249,
        "D00595": 0,
        "D00596": 2,
        "buffer": [
          50,
          158,
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
          "nonWhite": 271
        },
        "vramCurrent": 8820,
        "lastKey": {
          "code": "NumpadAdd",
          "label": "+",
          "expectedInsertByte": 158,
          "controlPreStopPc": null,
          "controlPreStopLabel": null,
          "cursorBefore": 13740237,
          "insertBlock": 3454,
          "postInsertGateBlock": 7587,
          "stoppedAtPostInsertGate": true,
          "D000C2Bit7Restored": true,
          "controlStopBlock": null,
          "controlStopPc": null,
          "uiClearApplied": false,
          "uiClearResult": null,
          "stoppedBeforeControlClear": false,
          "steps": 7609,
          "termination": "post_insert_gate_stop",
          "wipes": 0,
          "D0243A": 13740238,
          "D0243D": 13805630,
          "D007CA": 361961,
          "D008E0": 13740131,
          "D02590": 13893249,
          "D000C2": 0,
          "buffer": [
            50,
            158,
            0,
            0,
            0,
            0,
            0,
            0
          ],
          "vramPeak": 8680,
          "vramCurrent": 8820
        }
      },
      "errors": []
    },
    {
      "key": "3",
      "status": "Key: 3 → 7248 steps (post_insert_gate_stop, insert=0x33 @0xd1a8ce, peak 8887px)",
      "lastKey": {
        "code": "Digit3",
        "label": "3",
        "expectedInsertByte": 51,
        "controlPreStopPc": null,
        "controlPreStopLabel": null,
        "cursorBefore": 13740238,
        "insertBlock": 3259,
        "postInsertGateBlock": 7227,
        "stoppedAtPostInsertGate": true,
        "D000C2Bit7Restored": true,
        "controlStopBlock": null,
        "controlStopPc": null,
        "uiClearApplied": false,
        "uiClearResult": null,
        "stoppedBeforeControlClear": false,
        "steps": 7248,
        "termination": "post_insert_gate_stop",
        "wipes": 0,
        "D0243A": 13740239,
        "D0243D": 13805630,
        "D007CA": 361961,
        "D008E0": 13740131,
        "D02590": 13893249,
        "D000C2": 0,
        "buffer": [
          50,
          158,
          51,
          0,
          0,
          0,
          0,
          0
        ],
        "vramPeak": 8887,
        "vramCurrent": 8887
      },
      "diagnostics": {
        "D007CA": 361961,
        "D008E0": 13740131,
        "D0243A": 13740239,
        "D0243D": 13805630,
        "D02590": 13893249,
        "D00595": 0,
        "D00596": 3,
        "buffer": [
          50,
          158,
          51,
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
          "nonWhite": 338
        },
        "vramCurrent": 8887,
        "lastKey": {
          "code": "Digit3",
          "label": "3",
          "expectedInsertByte": 51,
          "controlPreStopPc": null,
          "controlPreStopLabel": null,
          "cursorBefore": 13740238,
          "insertBlock": 3259,
          "postInsertGateBlock": 7227,
          "stoppedAtPostInsertGate": true,
          "D000C2Bit7Restored": true,
          "controlStopBlock": null,
          "controlStopPc": null,
          "uiClearApplied": false,
          "uiClearResult": null,
          "stoppedBeforeControlClear": false,
          "steps": 7248,
          "termination": "post_insert_gate_stop",
          "wipes": 0,
          "D0243A": 13740239,
          "D0243D": 13805630,
          "D007CA": 361961,
          "D008E0": 13740131,
          "D02590": 13893249,
          "D000C2": 0,
          "buffer": [
            50,
            158,
            51,
            0,
            0,
            0,
            0,
            0
          ],
          "vramPeak": 8887,
          "vramCurrent": 8887
        }
      },
      "errors": []
    }
  ],
  "errors": []
}
```


# Phase 837 Browser EOL Injected Route Trace

Probe: `probe-phase837-browser-eol-injected-route-trace.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase837-browser-eol-injected-route-trace.mjs`

Serves an instrumented in-memory copy of `browser-shell.html`, boots coldboot with Preserve Display, injects the smallest Phase 836 reproducer (`D0243A=0xD1A8F8`), dispatches browser EOL (`Escape`), and records the route without editing the shell.

## Result

- The smallest Phase 836 injection reproduced as OTHER: termination=max_steps, steps=350000, wipes=3.
- Hits: 0x0A229D=0, 0x08F54B=0, 0x0018F8=3.
- First wipe owner: block 11129, owner return 0x0013E8, prevPc 0x001879.
- First all-zero point for D0243A/D0243D/D007CA/D02590: block 11129, pc 0x0018F8, prevPc 0x001879, fields D0243A=0x000000, D0243D=0x000000, D007CA=0x000000, D02590=0x000000.

## Case

| Case | Writes | Classification | Termination | Steps | Wipes | Control PC | Post D0243A | Post D0243D | Post D007CA | Post D02590 |
| --- | --- | --- | --- | ---: | ---: | --- | --- | --- | --- | --- |
| D0243A_engine_cursor_only | D0243A=0xD1A8F8 | OTHER | max_steps | 350000 | 3 | 0x000000 | 0x000000 | 0x000000 | 0x000000 | 0x000000 |

## Target Hits

| Target | Hits |
| --- | ---: |
| controlPreStop0A229D | 0 |
| engine08F54B | 0 |
| cleanup0018F8 | 3 |
| prewipe001879 | 3 |
| low000862 | 1 |
| low000A92 | 62472 |
| low03D044 | 28 |
| caller058A16 | 0 |
| spaceFill0A2A37 | 11 |
| tokenOuter08F3B8 | 0 |

## Wipes

First wipe: block 11129, owner return 0x0013E8, prevPc 0x001879.

| # | Block | PC | Prev PC | Stack owner return | Prior wipe count | Fields |
| ---: | ---: | --- | --- | --- | ---: | --- |
| 1 | 11129 | 0x0018F8 | 0x001879 | 0x0013E8 | 0 | D007CA=0x000000, D008E0=0x000000, D0243A=0x000000, D0243D=0x000000, D02590=0x000000, D02A40=0x000000, D00595=0x00, D00596=0x00, D00587=0x00, D0058C=0x00, D0058E=0x00, D00080=0x00, D0009F=0x00, D02A28=0x00, D02A29=0x000000, D02A2B=0x000000, D02A1B=0x000000, D01150=0x000000, D0059A=0x00 |
| 2 | 201257 | 0x0018F8 | 0x001879 | 0x000862 | 1 | D007CA=0x000000, D008E0=0x000000, D0243A=0x000000, D0243D=0x000000, D02590=0x000000, D02A40=0x000000, D00595=0x00, D00596=0x00, D00587=0x00, D0058C=0x00, D0058E=0x00, D00080=0x00, D0009F=0x00, D02A28=0x00, D02A29=0x000000, D02A2B=0x000000, D02A1B=0x000000, D01150=0x000000, D0059A=0x00 |
| 3 | 205689 | 0x0018F8 | 0x001879 | 0x0013E8 | 2 | D007CA=0x000000, D008E0=0x000000, D0243A=0x000000, D0243D=0x000000, D02590=0x000000, D02A40=0x000000, D00595=0x00, D00596=0x00, D00587=0x00, D0058C=0x00, D0058E=0x00, D00080=0x00, D0009F=0x00, D02A28=0x00, D02A29=0x000000, D02A2B=0x000000, D02A1B=0x000000, D01150=0x000000, D0059A=0x00 |

## Field Zero Points

First all-zero: block 11129, pc 0x0018F8, prevPc 0x001879, fields D0243A=0x000000, D0243D=0x000000, D007CA=0x000000, D02590=0x000000.

| Field | Timing | Block | PC | Prev PC | Value |
| --- | --- | ---: | --- | --- | --- |
| D0243A | entry-vs-previous-block | 4986 | 0x0A31A2 | 0x0A31E2 | 0xD1A8F7 -> 0x000000 |
| D0243D | entry-vs-previous-block | 4986 | 0x0A31A2 | 0x0A31E2 | 0xD2A83D -> 0x000000 |
| D02590 | entry-vs-previous-block | 4986 | 0x0A31A2 | 0x0A31E2 | 0xD3FE81 -> 0x000000 |
| D007CA | entry-vs-previous-block | 11129 | 0x0018F8 | 0x001879 | 0x0585E9 -> 0x000000 |

## Top Repeated PCs

| PC | Count |
| --- | ---: |
| 0x000A92 | 62472 |
| 0x000BFE | 48260 |
| 0x0021C2 | 20186 |
| 0x006D5D | 20176 |
| 0x006D64 | 20176 |
| 0x006CDF | 20166 |
| 0x006D0F | 20166 |
| 0x006D38 | 20160 |
| 0x006D4F | 20160 |
| 0x006CF7 | 20156 |
| 0x005AE8 | 6224 |
| 0x005B16 | 6224 |
| 0x005B4B | 6224 |
| 0x005AB6 | 5835 |
| 0x000B72 | 5790 |
| 0x000B7C | 4642 |
| 0x000B81 | 4642 |
| 0x09EFDE | 2880 |
| 0x000B7F | 1534 |
| 0x0060B3 | 765 |

## Last 30 PCs

349938:0x000A92 349939:0x000A92 349940:0x000A92 349941:0x000A92 349942:0x000A92 349943:0x000A92 349944:0x000A92 349945:0x000A92 349946:0x000A92 349947:0x000A92 349948:0x000A92 349949:0x000A92 349950:0x000A92 349951:0x000A92 349952:0x000A92 349953:0x000A92 349954:0x000A92 349955:0x000A92 349956:0x000A92 349957:0x000A92 349958:0x000A92 349959:0x000A92 349960:0x000A92 349961:0x000A92 349962:0x000A92 349963:0x000A92 349964:0x000A92 349965:0x000A92 349966:0x000A92 349967:0x000A92

## Full JSON

```json
{
  "probe": "phase837-browser-eol-injected-route-trace",
  "chromePath": "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "pageUrl": "http://127.0.0.1:52374/browser-shell.html",
  "pass": true,
  "result": {
    "name": "D0243A_engine_cursor_only",
    "label": "D0243A engine cursor only",
    "writes": [
      {
        "field": "D0243A",
        "value": 13740280
      }
    ],
    "beforeInjection": {
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
      "traceRead": {
        "label": "beforeInjection",
        "status": "Coldboot complete. OS event loop is ready.",
        "runtimeMode": "coldboot",
        "lastPc": 574257,
        "lastMode": "adl",
        "totalSteps": 637707,
        "cpu": {
          "pc": 6581,
          "sp": 13740134,
          "af": 4180,
          "bc": 0,
          "de": 13805589,
          "hl": 13740195,
          "ix": 13740128,
          "iy": 13631616,
          "f": 84,
          "halted": true,
          "madl": 1,
          "stepCount": 49473
        },
        "fields": {
          "D007CA": 361961,
          "D008E0": 0,
          "D0243A": 13740236,
          "D0243D": 13805630,
          "D02590": 13893249,
          "D02A40": 13805630,
          "D00595": 0,
          "D00596": 0,
          "D00587": 0,
          "D0058C": 0,
          "D0058E": 0,
          "D00080": 0,
          "D0009F": 0,
          "D02A28": 0,
          "D02A29": 0,
          "D02A2B": 0,
          "D02A1B": 0,
          "D01150": 0,
          "D0059A": 0
        },
        "stackTop": [
          {
            "addr": 13740134,
            "value": 16777215
          },
          {
            "addr": 13740137,
            "value": 16777215
          },
          {
            "addr": 13740140,
            "value": 16777215
          },
          {
            "addr": 13740143,
            "value": 16777215
          },
          {
            "addr": 13740146,
            "value": 16777215
          },
          {
            "addr": 13740149,
            "value": 16777215
          },
          {
            "addr": 13740152,
            "value": 16777215
          },
          {
            "addr": 13740155,
            "value": 16777215
          }
        ],
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
        "vram": 8549,
        "lastKey": null,
        "pageErrors": []
      },
      "status": "Coldboot complete. OS event loop is ready.",
      "pageErrors": [],
      "extra": {
        "stage": "beforeInjection"
      }
    },
    "traceStart": {
      "label": "start",
      "status": "Coldboot complete. OS event loop is ready.",
      "runtimeMode": "coldboot",
      "lastPc": 574257,
      "lastMode": "adl",
      "totalSteps": 637707,
      "cpu": {
        "pc": 6581,
        "sp": 13740134,
        "af": 4180,
        "bc": 0,
        "de": 13805589,
        "hl": 13740195,
        "ix": 13740128,
        "iy": 13631616,
        "f": 84,
        "halted": true,
        "madl": 1,
        "stepCount": 49473
      },
      "fields": {
        "D007CA": 361961,
        "D008E0": 0,
        "D0243A": 13740236,
        "D0243D": 13805630,
        "D02590": 13893249,
        "D02A40": 13805630,
        "D00595": 0,
        "D00596": 0,
        "D00587": 0,
        "D0058C": 0,
        "D0058E": 0,
        "D00080": 0,
        "D0009F": 0,
        "D02A28": 0,
        "D02A29": 0,
        "D02A2B": 0,
        "D02A1B": 0,
        "D01150": 0,
        "D0059A": 0
      },
      "stackTop": [
        {
          "addr": 13740134,
          "value": 16777215
        },
        {
          "addr": 13740137,
          "value": 16777215
        },
        {
          "addr": 13740140,
          "value": 16777215
        },
        {
          "addr": 13740143,
          "value": 16777215
        },
        {
          "addr": 13740146,
          "value": 16777215
        },
        {
          "addr": 13740149,
          "value": 16777215
        },
        {
          "addr": 13740152,
          "value": 16777215
        },
        {
          "addr": 13740155,
          "value": 16777215
        }
      ],
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
      "vram": 8549,
      "lastKey": null,
      "pageErrors": []
    },
    "injection": {
      "ok": true,
      "before": {
        "D007CA": 361961,
        "D008E0": 0,
        "D0243A": 13740236,
        "D0243D": 13805630,
        "D02590": 13893249,
        "D02A40": 13805630,
        "D00595": 0,
        "D00596": 0,
        "D02A29": 0,
        "D02A2B": 0,
        "D02A1B": 0,
        "D01150": 0,
        "D0059A": 0,
        "D02A28": 0,
        "buffer": [
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0
        ]
      },
      "after": {
        "D007CA": 361961,
        "D008E0": 0,
        "D0243A": 13740280,
        "D0243D": 13805630,
        "D02590": 13893249,
        "D02A40": 13805630,
        "D00595": 0,
        "D00596": 0,
        "D02A29": 0,
        "D02A2B": 0,
        "D02A1B": 0,
        "D01150": 0,
        "D0059A": 0,
        "D02A28": 0,
        "buffer": [
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0
        ]
      },
      "writes": [
        {
          "field": "D0243A",
          "value": 13740280
        }
      ]
    },
    "preKey": {
      "editLine": {
        "D007CA": 361961,
        "D008E0": 0,
        "D0243A": 13740280,
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
      "traceRead": {
        "label": "afterInjection",
        "status": "Coldboot complete. OS event loop is ready.",
        "runtimeMode": "coldboot",
        "lastPc": 574257,
        "lastMode": "adl",
        "totalSteps": 637707,
        "cpu": {
          "pc": 6581,
          "sp": 13740134,
          "af": 4180,
          "bc": 0,
          "de": 13805589,
          "hl": 13740195,
          "ix": 13740128,
          "iy": 13631616,
          "f": 84,
          "halted": true,
          "madl": 1,
          "stepCount": 49473
        },
        "fields": {
          "D007CA": 361961,
          "D008E0": 0,
          "D0243A": 13740280,
          "D0243D": 13805630,
          "D02590": 13893249,
          "D02A40": 13805630,
          "D00595": 0,
          "D00596": 0,
          "D00587": 0,
          "D0058C": 0,
          "D0058E": 0,
          "D00080": 0,
          "D0009F": 0,
          "D02A28": 0,
          "D02A29": 0,
          "D02A2B": 0,
          "D02A1B": 0,
          "D01150": 0,
          "D0059A": 0
        },
        "stackTop": [
          {
            "addr": 13740134,
            "value": 16777215
          },
          {
            "addr": 13740137,
            "value": 16777215
          },
          {
            "addr": 13740140,
            "value": 16777215
          },
          {
            "addr": 13740143,
            "value": 16777215
          },
          {
            "addr": 13740146,
            "value": 16777215
          },
          {
            "addr": 13740149,
            "value": 16777215
          },
          {
            "addr": 13740152,
            "value": 16777215
          },
          {
            "addr": 13740155,
            "value": 16777215
          }
        ],
        "editLine": {
          "D007CA": 361961,
          "D008E0": 0,
          "D0243A": 13740280,
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
        "vram": 8549,
        "lastKey": null,
        "pageErrors": []
      },
      "status": "Coldboot complete. OS event loop is ready.",
      "pageErrors": [],
      "extra": {
        "stage": "afterInjection",
        "injection": {
          "ok": true,
          "before": {
            "D007CA": 361961,
            "D008E0": 0,
            "D0243A": 13740236,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D02A40": 13805630,
            "D00595": 0,
            "D00596": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 0,
            "D01150": 0,
            "D0059A": 0,
            "D02A28": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ]
          },
          "after": {
            "D007CA": 361961,
            "D008E0": 0,
            "D0243A": 13740280,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D02A40": 13805630,
            "D00595": 0,
            "D00596": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 0,
            "D01150": 0,
            "D0059A": 0,
            "D02A28": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ]
          },
          "writes": [
            {
              "field": "D0243A",
              "value": 13740280
            }
          ]
        }
      }
    },
    "classification": {
      "classification": "OTHER",
      "checks": {
        "code": true,
        "label": true,
        "controlPreStopPc": true,
        "controlPreStopLabel": true,
        "termination": false,
        "controlStopPc": false,
        "stoppedBeforeControlClear": false,
        "uiClearApplied": false,
        "noWipes": false,
        "D007CA": false,
        "D02590": false,
        "vramPreserved": true,
        "noPageErrors": true
      },
      "preStop0A229D": false,
      "engine08F54B": false,
      "tupleCoreSignal": false,
      "tupleDiffs": {
        "D0243D": {
          "before": 13805630,
          "after": 0
        },
        "D02A40": {
          "before": 13805630,
          "after": 0
        }
      },
      "hasTupleRestoreLog": false,
      "low006D": false,
      "missing202020": false
    },
    "state": {
      "status": "Key: CLEAR → 350000 steps (max_steps, peak 10861px)",
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
        "steps": 350000,
        "termination": "max_steps",
        "wipes": 3,
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
        "vramPeak": 10861,
        "vramCurrent": 3039
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
        "vramCurrent": 3039,
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
          "steps": 350000,
          "termination": "max_steps",
          "wipes": 3,
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
          "vramPeak": 10861,
          "vramCurrent": 3039
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
          "D0059A": 0,
          "D01150": 0,
          "D0243D": 0,
          "D02A40": 0,
          "D02A28": 0
        }
      },
      "logText": "Click Boot to load ROM (~15 MB compressed)--- Decoding ROM (145932 blocks, 17.0149% coverage) ------ Coldboot Phase 1: Z80 cold boot (0x000000, 20K steps) ------ Phase 1 done: 20000 steps, max_steps at 0x001cc0 ------ Coldboot Phase 2: Kernel init (0x08C331, 100K steps) ------ Phase 2 done: 100000 steps, max_steps at 0x000a92 ------ Coldboot Phase 3: Post-init (0x0802B2, 100 steps) ------ Phase 3 done: 100 steps, max_steps at 0x0158bc ------ Coldboot Phase 4: Warm idle continuation (0x0019be, 1.5M step cap) ------ Phase 4 done: 192290 steps, halt at 0x0019b5 ------ Coldboot Phase 5: Launch-home init (0x09dd62, 300K step cap) ------ Phase 5 done: 275843 steps, halt at 0x0019b5 (VAT snapshot captured) ------ Coldboot Phase 6: Home repaint (0x058241, 300K step cap) ------ Phase 6 done: 49474 steps, halt at 0x0019b5; D007CA=0x0585e9, VAT=0xd3fe81, VRAM=8549px ------ Edit context seeded (cursor=0xD1A8CC, ready for typed input) ------ Coldboot seeded (entry=0x08c331, halt=0x0019b5, SP=0xd1a866, IY=0xD00080, timerInterrupt=true) ---Re-armed D007CA for next keypress",
      "pageErrors": [],
      "preKey": {
        "editLine": {
          "D007CA": 361961,
          "D008E0": 0,
          "D0243A": 13740280,
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
        "status": "Coldboot complete. OS event loop is ready.",
        "injection": {
          "ok": true,
          "before": {
            "D007CA": 361961,
            "D008E0": 0,
            "D0243A": 13740236,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D02A40": 13805630,
            "D00595": 0,
            "D00596": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 0,
            "D01150": 0,
            "D0059A": 0,
            "D02A28": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ]
          },
          "after": {
            "D007CA": 361961,
            "D008E0": 0,
            "D0243A": 13740280,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D02A40": 13805630,
            "D00595": 0,
            "D00596": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 0,
            "D01150": 0,
            "D0059A": 0,
            "D02A28": 0,
            "buffer": [
              0,
              0,
              0,
              0,
              0,
              0,
              0,
              0
            ]
          },
          "writes": [
            {
              "field": "D0243A",
              "value": 13740280
            }
          ]
        }
      }
    },
    "traceRecord": {
      "label": "D0243A engine cursor only",
      "start": {
        "label": "start",
        "status": "Coldboot complete. OS event loop is ready.",
        "runtimeMode": "coldboot",
        "lastPc": 574257,
        "lastMode": "adl",
        "totalSteps": 637707,
        "cpu": {
          "pc": 6581,
          "sp": 13740134,
          "af": 4180,
          "bc": 0,
          "de": 13805589,
          "hl": 13740195,
          "ix": 13740128,
          "iy": 13631616,
          "f": 84,
          "halted": true,
          "madl": 1,
          "stepCount": 49473
        },
        "fields": {
          "D007CA": 361961,
          "D008E0": 0,
          "D0243A": 13740236,
          "D0243D": 13805630,
          "D02590": 13893249,
          "D02A40": 13805630,
          "D00595": 0,
          "D00596": 0,
          "D00587": 0,
          "D0058C": 0,
          "D0058E": 0,
          "D00080": 0,
          "D0009F": 0,
          "D02A28": 0,
          "D02A29": 0,
          "D02A2B": 0,
          "D02A1B": 0,
          "D01150": 0,
          "D0059A": 0
        },
        "stackTop": [
          {
            "addr": 13740134,
            "value": 16777215
          },
          {
            "addr": 13740137,
            "value": 16777215
          },
          {
            "addr": 13740140,
            "value": 16777215
          },
          {
            "addr": 13740143,
            "value": 16777215
          },
          {
            "addr": 13740146,
            "value": 16777215
          },
          {
            "addr": 13740149,
            "value": 16777215
          },
          {
            "addr": 13740152,
            "value": 16777215
          },
          {
            "addr": 13740155,
            "value": 16777215
          }
        ],
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
        "vram": 8549,
        "lastKey": null,
        "pageErrors": []
      },
      "end": {
        "label": "end",
        "status": "Key: CLEAR → 350000 steps (max_steps, peak 10861px)",
        "runtimeMode": "coldboot",
        "lastPc": 2706,
        "lastMode": "adl",
        "totalSteps": 987707,
        "cpu": {
          "pc": 2706,
          "sp": 13738940,
          "af": 26378,
          "bc": 41,
          "de": 13739227,
          "hl": 204,
          "ix": 13738985,
          "iy": 13631616,
          "f": 10,
          "halted": false,
          "madl": 1,
          "stepCount": 349999
        },
        "fields": {
          "D007CA": 0,
          "D008E0": 0,
          "D0243A": 0,
          "D0243D": 0,
          "D02590": 0,
          "D02A40": 0,
          "D00595": 4,
          "D00596": 19,
          "D00587": 0,
          "D0058C": 0,
          "D0058E": 0,
          "D00080": 0,
          "D0009F": 0,
          "D02A28": 0,
          "D02A29": 0,
          "D02A2B": 0,
          "D02A1B": 0,
          "D01150": 0,
          "D0059A": 0
        },
        "stackTop": [
          {
            "addr": 13738940,
            "value": 0
          },
          {
            "addr": 13738943,
            "value": 0
          },
          {
            "addr": 13738946,
            "value": 100
          },
          {
            "addr": 13738949,
            "value": 60122
          },
          {
            "addr": 13738952,
            "value": 6634878
          },
          {
            "addr": 13738955,
            "value": 13739133
          },
          {
            "addr": 13738958,
            "value": 27790
          },
          {
            "addr": 13738961,
            "value": 16777070
          }
        ],
        "editLine": {
          "D007CA": 0,
          "D008E0": 0,
          "D0243A": 0,
          "D0243D": 0,
          "D02590": 0,
          "D00595": 4,
          "D00596": 19,
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
          "vramCurrent": 3039,
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
            "steps": 350000,
            "termination": "max_steps",
            "wipes": 3,
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
            "vramPeak": 10861,
            "vramCurrent": 3039
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
            "D0059A": 0,
            "D01150": 0,
            "D0243D": 0,
            "D02A40": 0,
            "D02A28": 0
          }
        },
        "vram": 3039,
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
          "steps": 350000,
          "termination": "max_steps",
          "wipes": 3,
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
          "vramPeak": 10861,
          "vramCurrent": 3039
        },
        "pageErrors": []
      },
      "totalBlocks": 349967,
      "prevPc": "0x000A92",
      "lastPcs": [
        {
          "block": 349938,
          "pc": "0x000A92",
          "prevPc": "0x000A92"
        },
        {
          "block": 349939,
          "pc": "0x000A92",
          "prevPc": "0x000A92"
        },
        {
          "block": 349940,
          "pc": "0x000A92",
          "prevPc": "0x000A92"
        },
        {
          "block": 349941,
          "pc": "0x000A92",
          "prevPc": "0x000A92"
        },
        {
          "block": 349942,
          "pc": "0x000A92",
          "prevPc": "0x000A92"
        },
        {
          "block": 349943,
          "pc": "0x000A92",
          "prevPc": "0x000A92"
        },
        {
          "block": 349944,
          "pc": "0x000A92",
          "prevPc": "0x000A92"
        },
        {
          "block": 349945,
          "pc": "0x000A92",
          "prevPc": "0x000A92"
        },
        {
          "block": 349946,
          "pc": "0x000A92",
          "prevPc": "0x000A92"
        },
        {
          "block": 349947,
          "pc": "0x000A92",
          "prevPc": "0x000A92"
        },
        {
          "block": 349948,
          "pc": "0x000A92",
          "prevPc": "0x000A92"
        },
        {
          "block": 349949,
          "pc": "0x000A92",
          "prevPc": "0x000A92"
        },
        {
          "block": 349950,
          "pc": "0x000A92",
          "prevPc": "0x000A92"
        },
        {
          "block": 349951,
          "pc": "0x000A92",
          "prevPc": "0x000A92"
        },
        {
          "block": 349952,
          "pc": "0x000A92",
          "prevPc": "0x000A92"
        },
        {
          "block": 349953,
          "pc": "0x000A92",
          "prevPc": "0x000A92"
        },
        {
          "block": 349954,
          "pc": "0x000A92",
          "prevPc": "0x000A92"
        },
        {
          "block": 349955,
          "pc": "0x000A92",
          "prevPc": "0x000A92"
        },
        {
          "block": 349956,
          "pc": "0x000A92",
          "prevPc": "0x000A92"
        },
        {
          "block": 349957,
          "pc": "0x000A92",
          "prevPc": "0x000A92"
        },
        {
          "block": 349958,
          "pc": "0x000A92",
          "prevPc": "0x000A92"
        },
        {
          "block": 349959,
          "pc": "0x000A92",
          "prevPc": "0x000A92"
        },
        {
          "block": 349960,
          "pc": "0x000A92",
          "prevPc": "0x000A92"
        },
        {
          "block": 349961,
          "pc": "0x000A92",
          "prevPc": "0x000A92"
        },
        {
          "block": 349962,
          "pc": "0x000A92",
          "prevPc": "0x000A92"
        },
        {
          "block": 349963,
          "pc": "0x000A92",
          "prevPc": "0x000A92"
        },
        {
          "block": 349964,
          "pc": "0x000A92",
          "prevPc": "0x000A92"
        },
        {
          "block": 349965,
          "pc": "0x000A92",
          "prevPc": "0x000A92"
        },
        {
          "block": 349966,
          "pc": "0x000A92",
          "prevPc": "0x000A92"
        },
        {
          "block": 349967,
          "pc": "0x000A92",
          "prevPc": "0x000A92"
        }
      ],
      "hotBlocks": {
        "0x08C331": 2,
        "0x05C634": 4,
        "0x000038": 32,
        "0x0006F3": 32,
        "0x000704": 32,
        "0x000710": 32,
        "0x001713": 421,
        "0x0008BB": 423,
        "0x001717": 421,
        "0x001718": 421,
        "0x00171E": 32,
        "0x0067F8": 32,
        "0x001C4F": 78,
        "0x001CA6": 272,
        "0x001CC0": 227,
        "0x001CCA": 225,
        "0x001CCE": 38,
        "0x001CD5": 38,
        "0x001CE5": 85,
        "0x001C54": 78,
        "0x006808": 32,
        "0x001C33": 238,
        "0x001C38": 231,
        "0x001C3C": 188,
        "0x001C44": 185,
        "0x001C7D": 187,
        "0x001CE4": 187,
        "0x001C81": 194,
        "0x001C82": 194,
        "0x001C48": 185,
        "0x001C42": 46,
        "0x006810": 32,
        "0x006812": 32,
        "0x006816": 32,
        "0x00681E": 32,
        "0x006828": 32,
        "0x001727": 32,
        "0x000719": 32,
        "0x00071D": 32,
        "0x02010C": 32,
        "0x03CF7D": 32,
        "0x03CFA4": 32,
        "0x03CFCF": 32,
        "0x03CFD4": 28,
        "0x03CFDB": 28,
        "0x03CFE0": 28,
        "0x03CFE5": 28,
        "0x03CFEA": 28,
        "0x03D029": 28,
        "0x03D033": 28,
        "0x03D038": 28,
        "0x03D044": 28,
        "0x03D04C": 28,
        "0x03D054": 28,
        "0x03F994": 28,
        "0x0003D4": 28,
        "0x003CC2": 28,
        "0x003CD4": 30,
        "0x003CE0": 30,
        "0x003CEE": 30,
        "0x003CF3": 30,
        "0x03F998": 28,
        "0x03F99A": 28,
        "0x03F9AB": 28,
        "0x03F9AE": 28,
        "0x03D058": 28,
        "0x03D060": 28,
        "0x03D0E0": 32,
        "0x05C67C": 4,
        "0x08C339": 2,
        "0x06CE73": 2,
        "0x06CE7F": 2,
        "0x06CE7B": 2,
        "0x06C8AB": 2,
        "0x08C33D": 4,
        "0x0A349A": 4,
        "0x0A349F": 4,
        "0x0A32F9": 6,
        "0x0A3301": 3,
        "0x08C308": 7,
        "0x0A331E": 6,
        "0x0A336F": 6,
        "0x0A3383": 6,
        "0x0A338A": 6,
        "0x0A33FB": 24,
        "0x0A3408": 168,
        "0x0A3404": 144,
        "0x0A340F": 56,
        "0x0A3392": 6,
        "0x0A339A": 6,
        "0x0A33E6": 24,
        "0x0A33FF": 24,
        "0x0A33EE": 24,
        "0x0A3403": 24,
        "0x0A33A2": 6,
        "0x0A33AA": 6,
        "0x0A33B2": 6,
        "0x0A33BA": 6,
        "0x0A33C2": 6,
        "0x0A33CA": 6,
        "0x0A33DA": 6,
        "0x0A33E4": 3,
        "0x0A34AE": 4,
        "0x08C341": 4,
        "0x05C75B": 4,
        "0x05C760": 4,
        "0x05C768": 4,
        "0x05C771": 7,
        "0x05C795": 7,
        "0x05C7A5": 7,
        "0x05C7AD": 7,
        "0x05C7B5": 7,
        "0x05C7C1": 7,
        "0x05C7D7": 7,
        "0x05C7DD": 4,
        "0x05C7ED": 4,
        "0x05C815": 4,
        "0x0A237E": 9,
        "0x0A2A37": 11,
        "0x0A2389": 9,
        "0x05C819": 4,
        "0x05C82C": 7,
        "0x05C832": 7,
        "0x05E3D6": 7,
        "0x04C973": 17,
        "0x05C836": 7,
        "0x05C84D": 3,
        "0x05CA44": 3,
        "0x05CA4E": 3,
        "0x05CA57": 3,
        "0x05C851": 3,
        "0x05CBC0": 3,
        "0x05CBC3": 3,
        "0x05CBC9": 3,
        "0x05C855": 3,
        "0x05C875": 7,
        "0x05C87E": 7,
        "0x0A1799": 10,
        "0x0A17AA": 5,
        "0x0A17AE": 5,
        "0x0A17B2": 8,
        "0x0A17B8": 8,
        "0x07BF3E": 10,
        "0x07BF4D": 10,
        "0x07BF5C": 10,
        "0x000380": 10,
        "0x003D85": 10,
        "0x07BF61": 10,
        "0x0A17C5": 10,
        "0x0A2D4C": 12,
        "0x0A17D0": 10,
        "0x00038C": 10,
        "0x005A53": 399,
        "0x0A17E9": 10,
        "0x0A17EF": 10,
        "0x0A17F7": 10,
        "0x0A1805": 10,
        "0x0A180B": 5,
        "0x0A1838": 5,
        "0x0A1A8F": 5,
        "0x0A183D": 5,
        "0x0A184A": 10,
        "0x0A1854": 160,
        "0x0A187C": 160,
        "0x0A188A": 160,
        "0x0A189E": 160,
        "0x0A18A6": 80,
        "0x0A1A83": 160,
        "0x0A18AF": 80,
        "0x0A18C1": 80,
        "0x0A18C4": 80,
        "0x0A18CA": 80,
        "0x0A18E9": 80,
        "0x0A18EB": 80,
        "0x0A190D": 160,
        "0x0A191F": 160,
        "0x0A1939": 160,
        "0x0A1969": 160,
        "0x0A1976": 160,
        "0x0A1980": 160,
        "0x0A1988": 80,
        "0x0A1994": 80,
        "0x0A19A4": 560,
        "0x0A19AA": 80,
        "0x0A19B5": 80,
        "0x0A19B7": 80,
        "0x0A19D7": 160,
        "0x0A1A1D": 160,
        "0x0A1A30": 10,
        "0x05C883": 7,
        "0x08C345": 4,
        "0x08C34F": 1,
        "0x08C366": 2,
        "0x08C38A": 2,
        "0x08C3A0": 2,
        "0x05C689": 2,
        "0x05C696": 2,
        "0x05C6A6": 2,
        "0x05C6AE": 2,
        "0x05C6B6": 2,
        "0x05C6C2": 2,
        "0x05C6D3": 2,
        "0x05C6E6": 2,
        "0x05C6FC": 2,
        "0x0A17B6": 2,
        "0x05C700": 2,
        "0x08C3A8": 2,
        "0x0A27DD": 2,
        "0x0A27E7": 2,
        "0x03D1C3": 7,
        "0x03D1C9": 2,
        "0x0A32FF": 3,
        "0x0A3411": 48,
        "0x0A3418": 16,
        "0x03D1D1": 2,
        "0x0A27F9": 2,
        "0x0A1A36": 3,
        "0x08C3AC": 2,
        "0x08C3C3": 2,
        "0x08C3C9": 2,
        "0x08C3EE": 2,
        "0x08C3F2": 2,
        "0x084989": 2,
        "0x084998": 2,
        "0x0849A5": 2,
        "0x0849B3": 2,
        "0x0849B9": 2,
        "0x0849C4": 2,
        "0x089092": 2,
        "0x0849C8": 2,
        "0x0849CA": 2,
        "0x08909E": 2,
        "0x0849CE": 2,
        "0x0849D2": 2,
        "0x0890C2": 2,
        "0x0849D6": 2,
        "0x0849DA": 2,
        "0x0890AA": 2,
        "0x0849DE": 2,
        "0x0849E6": 2,
        "0x084B7F": 2,
        "0x084B82": 2,
        "0x0849EA": 2,
        "0x0849EE": 2,
        "0x0849F8": 2,
        "0x084ADF": 2,
        "0x084AE7": 2,
        "0x0849FC": 2,
        "0x084A00": 4,
        "0x0851D2": 4,
        "0x08C3F6": 2,
        "0x08C3FA": 2,
        "0x08C3FC": 2,
        "0x08C401": 2,
        "0x04E0E4": 2,
        "0x04E0E8": 2,
        "0x084AD6": 2,
        "0x04E0EC": 2,
        "0x04E0F0": 2,
        "0x04E0F4": 2,
        "0x08C405": 2,
        "0x08C407": 2,
        "0x08C413": 2,
        "0x08C417": 2,
        "0x08C41B": 2,
        "0x08C44D": 2,
        "0x08C59B": 2,
        "0x08C5A7": 2,
        "0x08C509": 2,
        "0x08C511": 2,
        "0x08C519": 2,
        "0x08C526": 2,
        "0x08C532": 2,
        "0x022331": 2,
        "0x000578": 3,
        "0x0158A6": 5,
        "0x022336": 2,
        "0x022344": 2,
        "0x08C536": 2,
        "0x08C72F": 2,
        "0x05622E": 2,
        "0x05623D": 2,
        "0x056244": 2,
        "0x056248": 2,
        "0x056253": 2,
        "0x08C734": 2,
        "0x08C745": 2,
        "0x0585E9": 2,
        "0x0585F8": 2,
        "0x0585F9": 2,
        "0x058602": 2,
        "0x05877A": 2,
        "0x0587A3": 2,
        "0x080259": 5,
        "0x0587A7": 2,
        "0x0587E9": 2,
        "0x058B73": 2,
        "0x0587F1": 2,
        "0x0587F3": 2,
        "0x05884C": 2,
        "0x058EDA": 2,
        "0x058850": 2,
        "0x05899D": 2,
        "0x058D54": 3,
        "0x058EC6": 3,
        "0x058D58": 3,
        "0x0800A8": 3,
        "0x0800AE": 3,
        "0x0800B2": 3,
        "0x058D60": 3,
        "0x058D89": 3,
        "0x0589A1": 2,
        "0x0589AE": 2,
        "0x0589B2": 1,
        "0x0581A3": 1,
        "0x0800B8": 3,
        "0x0581A7": 1,
        "0x0589B6": 1,
        "0x05E42A": 1,
        "0x05E37D": 1,
        "0x05E38A": 1,
        "0x05E432": 1,
        "0x0589BA": 1,
        "0x08C73D": 2,
        "0x08C53A": 2,
        "0x08C543": 2,
        "0x08C593": 2,
        "0x08C359": 3,
        "0x02FCB3": 3,
        "0x02FCB9": 3,
        "0x02FD8F": 3,
        "0x02FDA6": 3,
        "0x03013A": 3,
        "0x03013F": 3,
        "0x030145": 3,
        "0x03014B": 3,
        "0x030151": 3,
        "0x030157": 3,
        "0x02FDAC": 3,
        "0x05C76C": 3,
        "0x05C81E": 3,
        "0x02FDB6": 3,
        "0x03FA09": 3,
        "0x05C623": 15,
        "0x03FB9A": 1,
        "0x03FBC0": 1,
        "0x03FBC3": 1,
        "0x03FBE8": 1,
        "0x02FDC2": 1,
        "0x02FDC8": 1,
        "0x02FDD8": 1,
        "0x02FDE6": 1,
        "0x02FE89": 1,
        "0x02FE9D": 1,
        "0x02FEB7": 1,
        "0x02FECF": 1,
        "0x02FED7": 1,
        "0x02FEDF": 1,
        "0x02FEF3": 1,
        "0x02FF09": 1,
        "0x022346": 1,
        "0x02234B": 1,
        "0x022357": 1,
        "0x02FF1A": 1,
        "0x0302EB": 1,
        "0x0302F0": 1,
        "0x02FF1F": 1,
        "0x02FF23": 1,
        "0x02FFAE": 1,
        "0x02FFB7": 1,
        "0x02FFBF": 1,
        "0x02FFC4": 1,
        "0x02FFCC": 1,
        "0x02FFD2": 1,
        "0x02FFDA": 1,
        "0x02FFDE": 1,
        "0x02FFE3": 1,
        "0x02FFE7": 1,
        "0x02FFED": 1,
        "0x02FE84": 1,
        "0x030300": 1,
        "0x02FE88": 1,
        "0x02FCC6": 1,
        "0x02FCF9": 1,
        "0x02FCFD": 1,
        "0x02FCE0": 1,
        "0x0589BB": 1,
        "0x0589E5": 1,
        "0x0589E9": 1,
        "0x0589EF": 1,
        "0x058A0C": 1,
        "0x058A10": 1,
        "0x058212": 1,
        "0x058216": 1,
        "0x05821D": 1,
        "0x05E3E3": 1,
        "0x05E3F5": 5,
        "0x05E3E7": 1,
        "0x05E3E8": 3,
        "0x058221": 1,
        "0x058A14": 1,
        "0x058A2C": 1,
        "0x058A30": 1,
        "0x058A4C": 1,
        "0x05E7CD": 2,
        "0x05E242": 2,
        "0x05E246": 2,
        "0x05E247": 1,
        "0x05E3EC": 1,
        "0x05E24C": 1,
        "0x05E250": 1,
        "0x080064": 1,
        "0x05E256": 1,
        "0x05E26C": 1,
        "0x05E7D1": 2,
        "0x05E7D2": 1,
        "0x0A2B72": 1,
        "0x0A2A68": 1,
        "0x0A2AF9": 1,
        "0x0A2B16": 1,
        "0x0A2B51": 1,
        "0x0A2B7E": 1,
        "0x0A2B8F": 1,
        "0x0A2BEB": 1,
        "0x0A2C0C": 1,
        "0x0A2C10": 1,
        "0x0A20CC": 1,
        "0x0A20E4": 1,
        "0x0A20EA": 1,
        "0x0A321D": 1,
        "0x0A322B": 1,
        "0x0A31FD": 1,
        "0x0A3205": 1,
        "0x0A3216": 1,
        "0x0A3146": 1,
        "0x0A314D": 1,
        "0x0A31F6": 3,
        "0x0A3158": 1,
        "0x0A31A6": 1,
        "0x0A31AC": 1,
        "0x0A31B8": 1,
        "0x0A31E2": 1,
        "0x0A31A2": 1,
        "0x0A323A": 1,
        "0x0A3241": 1,
        "0x0A3257": 1,
        "0x09EF20": 1,
        "0x09EF44": 1,
        "0x09EF4A": 1,
        "0x09EF5E": 1,
        "0x09EF70": 1,
        "0x09EFB7": 1,
        "0x09EFDE": 2880,
        "0x09EFE8": 18,
        "0x09EFEF": 18,
        "0x09EFCB": 17,
        "0x09F001": 1,
        "0x09F736": 1,
        "0x09EF2E": 1,
        "0x0A3274": 1,
        "0x0A327B": 1,
        "0x0A3293": 1,
        "0x0A3298": 1,
        "0x0A329E": 25,
        "0x0A32A2": 1,
        "0x0A32A7": 1,
        "0x03CFFE": 4,
        "0x0A20EE": 1,
        "0x0A20F1": 1,
        "0x0A2C16": 1,
        "0x0A2BFD": 1,
        "0x0A17AF": 5,
        "0x0A1842": 5,
        "0x0A19CC": 80,
        "0x0A2C03": 1,
        "0x0A2C05": 1,
        "0x05E7D6": 1,
        "0x058A50": 1,
        "0x0A2330": 1,
        "0x0A2356": 1,
        "0x0A1F80": 1,
        "0x0A1F48": 1,
        "0x0A1F85": 1,
        "0x0A1FA9": 1,
        "0x0A235A": 1,
        "0x058A54": 1,
        "0x0972C3": 1,
        "0x058A58": 1,
        "0x03FBF9": 1,
        "0x03FC06": 1,
        "0x05C838": 4,
        "0x05C83E": 4,
        "0x05C842": 4,
        "0x05C849": 4,
        "0x03FA1C": 2,
        "0x03FA93": 2,
        "0x03FA9C": 2,
        "0x03FAA2": 2,
        "0x03FABC": 2,
        "0x02515C": 2,
        "0x025196": 2,
        "0x0251A1": 2,
        "0x0251CB": 2,
        "0x03FAC1": 2,
        "0x0005F4": 2,
        "0x0158B1": 2,
        "0x03FAC5": 2,
        "0x03FAC9": 2,
        "0x03FAD6": 2,
        "0x03FAE2": 2,
        "0x03FAE8": 2,
        "0x048AC4": 2,
        "0x00012C": 24,
        "0x002197": 26,
        "0x048ACC": 2,
        "0x048AE0": 2,
        "0x048AE5": 2,
        "0x03F26D": 4,
        "0x048AE9": 2,
        "0x048B07": 2,
        "0x048B11": 2,
        "0x048B21": 2,
        "0x048B26": 2,
        "0x05206E": 6,
        "0x052089": 6,
        "0x048B3C": 2,
        "0x048B5B": 2,
        "0x0000B0": 22,
        "0x00285F": 22,
        "0x002873": 22,
        "0x00287D": 22,
        "0x048B69": 2,
        "0x048B81": 2,
        "0x048B91": 2,
        "0x048BA1": 2,
        "0x048BB1": 2,
        "0x048BC1": 2,
        "0x048BD1": 2,
        "0x0457B2": 2,
        "0x04586B": 2,
        "0x048BD7": 2,
        "0x048BEB": 2,
        "0x04E07B": 2,
        "0x000130": 6,
        "0x00218A": 6,
        "0x04E07F": 2,
        "0x04E091": 2,
        "0x04E0A1": 2,
        "0x04E0B1": 2,
        "0x052013": 4,
        "0x04E0CC": 2,
        "0x0BCD24": 2,
        "0x04E0D1": 2,
        "0x04E0D6": 2,
        "0x048BFB": 2,
        "0x049CCA": 2,
        "0x049CD2": 2,
        "0x049D11": 2,
        "0x049D19": 2,
        "0x049A23": 2,
        "0x049A2B": 2,
        "0x049A3A": 2,
        "0x000124": 4,
        "0x00211B": 4,
        "0x002147": 4,
        "0x049AA7": 2,
        "0x000210": 2,
        "0x002623": 2,
        "0x00263E": 2,
        "0x002649": 2,
        "0x049AC9": 2,
        "0x049CC2": 2,
        "0x049D23": 2,
        "0x049D2F": 2,
        "0x049D77": 2,
        "0x049DF9": 2,
        "0x049DFE": 2,
        "0x048C0A": 2,
        "0x048C20": 2,
        "0x048C2C": 2,
        "0x04985C": 2,
        "0x048C44": 2,
        "0x048C4E": 2,
        "0x048964": 2,
        "0x048968": 2,
        "0x048C5D": 2,
        "0x048C6B": 2,
        "0x05202F": 26,
        "0x048C75": 2,
        "0x048C7F": 2,
        "0x048C89": 2,
        "0x048C93": 2,
        "0x048C9D": 2,
        "0x048CA7": 2,
        "0x048CB1": 2,
        "0x048CBB": 2,
        "0x048CC5": 2,
        "0x048CCF": 2,
        "0x048CD9": 2,
        "0x048CE3": 2,
        "0x048CED": 2,
        "0x04CA7B": 2,
        "0x040D11": 2,
        "0x040D1F": 2,
        "0x040D29": 2,
        "0x040D3E": 2,
        "0x048CF2": 2,
        "0x048CF7": 2,
        "0x049FFA": 2,
        "0x04A00A": 2,
        "0x04A00F": 2,
        "0x04A01F": 2,
        "0x04A024": 2,
        "0x048D05": 2,
        "0x048D15": 2,
        "0x048D1A": 2,
        "0x048D2A": 2,
        "0x048D2F": 2,
        "0x048D3F": 2,
        "0x048D44": 2,
        "0x048D54": 2,
        "0x048D59": 2,
        "0x048D69": 2,
        "0x048D6E": 2,
        "0x040FAD": 2,
        "0x040FB1": 2,
        "0x040FC1": 2,
        "0x040FC6": 2,
        "0x000138": 8,
        "0x0021C2": 20186,
        "0x040FCD": 2,
        "0x040FF9": 2,
        "0x048D77": 2,
        "0x048D8C": 2,
        "0x048D91": 2,
        "0x048DA1": 2,
        "0x048DA6": 2,
        "0x048DB6": 2,
        "0x048DBB": 2,
        "0x048DC9": 2,
        "0x048DCE": 2,
        "0x048DD3": 2,
        "0x048DE4": 2,
        "0x048DE9": 2,
        "0x048DED": 2,
        "0x048DFC": 2,
        "0x0419F1": 2,
        "0x0419F9": 2,
        "0x000178": 2,
        "0x0022F9": 2,
        "0x002301": 2,
        "0x002307": 2,
        "0x002306": 16,
        "0x002309": 2,
        "0x0022FF": 2,
        "0x041A09": 2,
        "0x000168": 2,
        "0x00229D": 2,
        "0x041A1D": 2,
        "0x04B664": 2,
        "0x04B67F": 2,
        "0x04B684": 2,
        "0x041A28": 2,
        "0x041A48": 2,
        "0x041A4D": 2,
        "0x041A5D": 2,
        "0x041A62": 2,
        "0x041A72": 2,
        "0x041A77": 2,
        "0x041A8D": 2,
        "0x041A8F": 2,
        "0x041AB1": 2,
        "0x041AB6": 2,
        "0x041AC6": 2,
        "0x041ACB": 2,
        "0x041AD4": 2,
        "0x041ADE": 2,
        "0x02AF88": 2,
        "0x02AF90": 2,
        "0x0BCB0B": 2,
        "0x0BCB13": 2,
        "0x02AF98": 2,
        "0x02AFB5": 2,
        "0x02AFA8": 9,
        "0x02AFBE": 7,
        "0x02AFB3": 2,
        "0x02AFE3": 2,
        "0x02AFEC": 2,
        "0x0BC93C": 2,
        "0x0BC944": 2,
        "0x02AFF0": 2,
        "0x02B00D": 2,
        "0x02B000": 3,
        "0x02B00B": 2,
        "0x02B03B": 2,
        "0x000100": 2,
        "0x00257F": 2,
        "0x002584": 2,
        "0x002583": 12,
        "0x002586": 2,
        "0x02B04E": 2,
        "0x0BCA42": 2,
        "0x0BCA4A": 2,
        "0x02B070": 2,
        "0x02B090": 2,
        "0x02B083": 2,
        "0x02B08E": 2,
        "0x02B0BE": 2,
        "0x0BCA85": 2,
        "0x0BCA8D": 2,
        "0x02B0C2": 2,
        "0x02B0E2": 2,
        "0x02B0D5": 4,
        "0x02B0EB": 2,
        "0x02B0E0": 2,
        "0x02B110": 2,
        "0x0BCAC8": 2,
        "0x0BCAD0": 2,
        "0x02B114": 2,
        "0x02B134": 2,
        "0x02B127": 2,
        "0x02B132": 2,
        "0x02B162": 2,
        "0x02AEC8": 2,
        "0x02AED0": 2,
        "0x000338": 2,
        "0x001CEB": 2,
        "0x001C55": 10,
        "0x001C5D": 10,
        "0x001C5E": 8,
        "0x001C6B": 8,
        "0x001CF3": 2,
        "0x001CF5": 2,
        "0x001CBC": 45,
        "0x001CF9": 2,
        "0x001D01": 2,
        "0x001D03": 2,
        "0x001D07": 2,
        "0x001D0C": 2,
        "0x02AED4": 2,
        "0x02AEE5": 2,
        "0x02AEE9": 2,
        "0x0000D4": 2,
        "0x0029E9": 2,
        "0x02AEF1": 2,
        "0x02AF22": 2,
        "0x02AF0F": 28,
        "0x000218": 28,
        "0x002696": 28,
        "0x0026A1": 28,
        "0x02AF1C": 28,
        "0x02AF2B": 26,
        "0x02AF20": 2,
        "0x02AF62": 2,
        "0x02B16B": 2,
        "0x02B175": 2,
        "0x02B17E": 2,
        "0x02B19A": 2,
        "0x02B18B": 4,
        "0x02B1A3": 2,
        "0x02B196": 2,
        "0x02B319": 2,
        "0x0BCB2F": 2,
        "0x0BCB37": 2,
        "0x02B31D": 2,
        "0x02B33A": 2,
        "0x02B32D": 6,
        "0x02B343": 4,
        "0x02B338": 2,
        "0x02B368": 2,
        "0x02B36D": 2,
        "0x000000": 2,
        "0x000658": 2,
        "0x000673": 2,
        "0x000679": 2,
        "0x00067E": 2,
        "0x0012CA": 2,
        "0x0012DD": 2,
        "0x0012E3": 2,
        "0x0012F3": 2,
        "0x001305": 2,
        "0x00131B": 2,
        "0x001324": 2,
        "0x00132D": 2,
        "0x001336": 2,
        "0x001352": 2,
        "0x001359": 158,
        "0x00135B": 2,
        "0x00136A": 2,
        "0x001370": 2,
        "0x001377": 508,
        "0x001379": 2,
        "0x00138A": 2,
        "0x001393": 2,
        "0x00139D": 2,
        "0x0013C3": 2,
        "0x001988": 2,
        "0x001991": 2,
        "0x00199E": 2,
        "0x0019A4": 2,
        "0x0019A9": 2,
        "0x0019B3": 2,
        "0x0013C7": 2,
        "0x0158DE": 5,
        "0x0158E8": 5,
        "0x0158BC": 5,
        "0x0158C4": 5,
        "0x0158C6": 5,
        "0x0158CA": 5,
        "0x001C4A": 7,
        "0x0158D2": 5,
        "0x0158DA": 5,
        "0x0158EC": 5,
        "0x0158EE": 5,
        "0x0158F8": 5,
        "0x0013DA": 2,
        "0x0013E4": 2,
        "0x001853": 3,
        "0x001872": 3,
        "0x001879": 3,
        "0x0018F8": 3,
        "0x005B96": 4,
        "0x00190B": 3,
        "0x005BB1": 3,
        "0x005C44": 3,
        "0x005C59": 3,
        "0x005C5E": 3,
        "0x005C6C": 3,
        "0x005C71": 3,
        "0x005C84": 3,
        "0x005C99": 3,
        "0x005CAE": 3,
        "0x005CC8": 3,
        "0x005CDB": 3,
        "0x005CEC": 3,
        "0x005CF1": 3,
        "0x005D0D": 3,
        "0x0061E3": 17,
        "0x0061E9": 31,
        "0x0061FD": 31,
        "0x006202": 31,
        "0x005D19": 3,
        "0x0061E5": 14,
        "0x005D27": 3,
        "0x005D35": 3,
        "0x005D43": 3,
        "0x005D54": 3,
        "0x005D6A": 3,
        "0x005D6F": 3,
        "0x005D7A": 3,
        "0x0060F7": 69,
        "0x0060FB": 69,
        "0x006114": 258,
        "0x00612F": 258,
        "0x00611D": 258,
        "0x006129": 519,
        "0x00612E": 519,
        "0x006118": 261,
        "0x006133": 261,
        "0x00613E": 261,
        "0x006145": 261,
        "0x00611C": 261,
        "0x005D80": 3,
        "0x005D86": 3,
        "0x005D8C": 3,
        "0x0060FA": 189,
        "0x005D92": 3,
        "0x005D98": 3,
        "0x005D9E": 3,
        "0x005DA4": 3,
        "0x005DA9": 3,
        "0x005DAE": 3,
        "0x005DB4": 3,
        "0x005DBA": 3,
        "0x005DC0": 3,
        "0x005DC6": 3,
        "0x005DCC": 3,
        "0x005DD2": 3,
        "0x005DD8": 3,
        "0x005DDE": 3,
        "0x005DE4": 3,
        "0x005DEA": 3,
        "0x005DF0": 3,
        "0x005DF6": 3,
        "0x005DFC": 3,
        "0x005E02": 3,
        "0x005E08": 3,
        "0x005E0E": 3,
        "0x005E14": 3,
        "0x005E1A": 3,
        "0x005E20": 3,
        "0x005E26": 3,
        "0x005E2C": 3,
        "0x005E32": 3,
        "0x005E38": 3,
        "0x005E3E": 3,
        "0x005E44": 3,
        "0x005E4A": 3,
        "0x005E50": 3,
        "0x005E56": 3,
        "0x005E5C": 3,
        "0x005E62": 3,
        "0x005E68": 3,
        "0x005E6E": 3,
        "0x005E74": 3,
        "0x006147": 3,
        "0x006156": 3,
        "0x00615B": 3,
        "0x00617D": 3,
        "0x00618B": 3,
        "0x006196": 3,
        "0x00619B": 3,
        "0x00619F": 3,
        "0x005E7A": 3,
        "0x005E80": 3,
        "0x005E86": 3,
        "0x005E8C": 3,
        "0x005E92": 3,
        "0x005E98": 3,
        "0x005E9E": 3,
        "0x005EA4": 3,
        "0x005EAA": 3,
        "0x005EB0": 3,
        "0x005EB6": 3,
        "0x005EBC": 3,
        "0x005EC2": 3,
        "0x005EC8": 3,
        "0x005ECE": 3,
        "0x005ED4": 3,
        "0x005EDA": 3,
        "0x005EE0": 3,
        "0x005EE6": 3,
        "0x005EEC": 3,
        "0x005EF2": 3,
        "0x005EF8": 3,
        "0x005EFE": 3,
        "0x005F04": 3,
        "0x005F0A": 3,
        "0x005F10": 3,
        "0x005F16": 3,
        "0x005F1C": 3,
        "0x005F22": 3,
        "0x005F28": 3,
        "0x005F2E": 3,
        "0x005F34": 3,
        "0x005F3A": 3,
        "0x005F40": 3,
        "0x005F46": 3,
        "0x005F4C": 3,
        "0x005F52": 3,
        "0x005F58": 3,
        "0x005F5E": 3,
        "0x005F64": 3,
        "0x005F6A": 3,
        "0x005F70": 3,
        "0x005F76": 3,
        "0x005F7C": 3,
        "0x005F82": 3,
        "0x005F88": 3,
        "0x006094": 3,
        "0x00609A": 3,
        "0x0060A8": 3,
        "0x0060AD": 3,
        "0x0060AF": 93,
        "0x0060B1": 3,
        "0x0060B3": 765,
        "0x0060B5": 3,
        "0x0060C7": 3,
        "0x0060D8": 3,
        "0x0060E5": 3,
        "0x0060EA": 3,
        "0x0060F6": 3,
        "0x00190F": 3,
        "0x0013E8": 2,
        "0x0013F0": 2,
        "0x003B05": 2,
        "0x003B19": 2,
        "0x003B2A": 2,
        "0x003C4B": 2,
        "0x003B45": 2,
        "0x003B47": 2,
        "0x003B5D": 2,
        "0x003B86": 2,
        "0x003B9C": 2,
        "0x003BB0": 2,
        "0x003BB8": 2,
        "0x003BC9": 2,
        "0x003BD1": 2,
        "0x003BE4": 2,
        "0x003BEC": 2,
        "0x003BF5": 2,
        "0x003BFD": 2,
        "0x003C0E": 2,
        "0x003C16": 2,
        "0x003C1F": 2,
        "0x003C27": 2,
        "0x003C42": 2,
        "0x003B0D": 2,
        "0x003B17": 2,
        "0x0013F4": 2,
        "0x0013F8": 2,
        "0x0028D1": 2,
        "0x0013FC": 2,
        "0x001405": 2,
        "0x003CBC": 2,
        "0x003CC6": 2,
        "0x001409": 2,
        "0x001424": 2,
        "0x001428": 2,
        "0x00142C": 2,
        "0x000721": 2,
        "0x013D00": 2,
        "0x005BA6": 2,
        "0x013D11": 2,
        "0x0059C6": 389,
        "0x0059D6": 389,
        "0x005A75": 389,
        "0x005A82": 389,
        "0x00596E": 389,
        "0x005974": 389,
        "0x005998": 389,
        "0x005A8B": 389,
        "0x005A48": 389,
        "0x005A96": 389,
        "0x005AA2": 389,
        "0x005AAE": 389,
        "0x005AE8": 6224,
        "0x005B16": 6224,
        "0x005B4B": 6224,
        "0x005AB6": 5835,
        "0x005B92": 389,
        "0x005A19": 389,
        "0x0059DA": 389,
        "0x0059E6": 389,
        "0x013D1D": 28,
        "0x013D19": 26,
        "0x013D1F": 2,
        "0x0059E9": 15,
        "0x0059F3": 230,
        "0x0059F7": 230,
        "0x0059ED": 230,
        "0x0059FE": 15,
        "0x013D32": 10,
        "0x013D29": 8,
        "0x005A60": 10,
        "0x013D35": 2,
        "0x013D87": 2,
        "0x013D8D": 2,
        "0x000725": 2,
        "0x00072D": 2,
        "0x0138F1": 2,
        "0x0138F9": 2,
        "0x013918": 2,
        "0x013927": 2,
        "0x01394E": 2,
        "0x01395B": 2,
        "0x006447": 2,
        "0x00646C": 2,
        "0x006475": 2,
        "0x006479": 2,
        "0x00647D": 2,
        "0x0017DD": 9,
        "0x0017FC": 9,
        "0x006486": 2,
        "0x001CC4": 2,
        "0x00649B": 2,
        "0x00649D": 2,
        "0x0064BE": 2,
        "0x006C8E": 2,
        "0x006C9C": 2,
        "0x006CA1": 2,
        "0x006CB2": 2,
        "0x006CB7": 2,
        "0x0064C7": 2,
        "0x0064D0": 2,
        "0x006CC6": 10,
        "0x006D5D": 20176,
        "0x006D64": 20176,
        "0x006CDF": 20166,
        "0x006CF7": 20156,
        "0x006D0F": 20166,
        "0x006D38": 20160,
        "0x006D4F": 20160,
        "0x006CF4": 10,
        "0x006D68": 10,
        "0x0064DE": 2,
        "0x0064EE": 2,
        "0x006512": 2,
        "0x00651C": 2,
        "0x006D6D": 2,
        "0x006DA0": 4,
        "0x006DB2": 2,
        "0x006DCB": 2,
        "0x006DDF": 2,
        "0x006DED": 2,
        "0x006DFE": 2,
        "0x006E1A": 2,
        "0x006E1F": 2,
        "0x006523": 2,
        "0x00652C": 2,
        "0x006533": 2,
        "0x00653B": 2,
        "0x00653D": 2,
        "0x006541": 2,
        "0x00654E": 2,
        "0x00655D": 2,
        "0x00640B": 2,
        "0x0067E9": 2,
        "0x00641C": 2,
        "0x00641E": 2,
        "0x0062EA": 2,
        "0x00098B": 2,
        "0x00096C": 9,
        "0x000984": 9,
        "0x0009BE": 2,
        "0x0009C9": 2,
        "0x0009D4": 4,
        "0x000A2E": 6,
        "0x000A5D": 6,
        "0x000A72": 6,
        "0x000AC5": 747,
        "0x000AD9": 267,
        "0x000AEE": 742,
        "0x000A79": 742,
        "0x000AFD": 5,
        "0x000B19": 5,
        "0x000B60": 386,
        "0x000B7C": 4642,
        "0x000B81": 4642,
        "0x000B72": 5790,
        "0x000B83": 386,
        "0x000BCB": 389,
        "0x000C80": 388,
        "0x000C8D": 5,
        "0x000CA0": 101,
        "0x000CA4": 5,
        "0x0009E8": 3,
        "0x0009F3": 3,
        "0x0009F9": 2,
        "0x000A92": 62472,
        "0x000ACE": 480,
        "0x000B37": 384,
        "0x000B7F": 1534,
        "0x000BD3": 380,
        "0x000BFE": 48260,
        "0x000C4A": 380,
        "0x000BC1": 177,
        "0x000BC3": 177,
        "0x000BBC": 177,
        "0x000B5A": 3,
        "0x000B88": 3,
        "0x000A0A": 2,
        "0x000A15": 2,
        "0x000A24": 2,
        "0x0009CE": 2,
        "0x000C64": 1,
        "0x000C75": 127,
        "0x000C7C": 1,
        "0x000C99": 96,
        "0x000A26": 1,
        "0x006318": 1,
        "0x00632E": 1,
        "0x00633C": 1,
        "0x00634F": 1,
        "0x006364": 1,
        "0x00642F": 1,
        "0x00643B": 1,
        "0x006442": 1,
        "0x006561": 1,
        "0x006567": 1,
        "0x00656E": 1,
        "0x006585": 1,
        "0x013968": 1,
        "0x013971": 1,
        "0x013993": 1,
        "0x01399C": 1,
        "0x0139A3": 1,
        "0x013ADD": 1,
        "0x013AF7": 1,
        "0x013B06": 1,
        "0x013B2D": 1,
        "0x013B3A": 1,
        "0x0068D0": 1,
        "0x0138EC": 1,
        "0x0068DE": 1,
        "0x0068F3": 1,
        "0x000E3D": 62,
        "0x000E67": 62,
        "0x000E73": 62,
        "0x000E77": 62,
        "0x000E7F": 62,
        "0x000E94": 62,
        "0x000D7E": 64,
        "0x000DC2": 64,
        "0x000DCA": 64,
        "0x000D82": 64,
        "0x000DAE": 64,
        "0xD18C22": 62,
        "0x000E9D": 62,
        "0x0068FA": 1,
        "0x0068FF": 1,
        "0x006901": 1,
        "0x013B4D": 1,
        "0x013B54": 1,
        "0x013B76": 1,
        "0x013B7F": 1,
        "0x000731": 1,
        "0x000737": 1,
        "0x013D8E": 1,
        "0x013D9F": 1,
        "0x013DB6": 5,
        "0x013DAD": 4,
        "0x013DB9": 1,
        "0x013E1C": 1,
        "0x013E22": 1,
        "0x00073B": 1,
        "0x000741": 1,
        "0x00074E": 1,
        "0x00075D": 1,
        "0x000784": 1,
        "0x000791": 1,
        "0x000E01": 1,
        "0x000E0C": 61,
        "0x000E12": 61,
        "0x000E24": 61,
        "0x015856": 122,
        "0x015864": 99,
        "0x01586A": 122,
        "0x000E33": 61,
        "0x000E38": 62,
        "0x000E06": 61,
        "0x015862": 23,
        "0x000E3C": 1,
        "0x000799": 1,
        "0x00079E": 1,
        "0x0007C0": 1,
        "0x0007CE": 1,
        "0x0007DD": 1,
        "0x000804": 1,
        "0x000811": 1,
        "0x0008D9": 1,
        "0x0008F6": 1,
        "0x0008F8": 1,
        "0x0008FF": 1,
        "0x00090C": 3,
        "0x000904": 2,
        "0x000914": 1,
        "0x00091A": 1,
        "0x001D66": 1,
        "0x001C84": 1,
        "0x001C7C": 7,
        "0x001C95": 1,
        "0x001D77": 1,
        "0x001BFB": 1,
        "0x001C24": 2,
        "0x001C31": 2,
        "0x001C0E": 1,
        "0x001C10": 1,
        "0x001D7E": 1,
        "0x001D80": 1,
        "0x001D84": 1,
        "0x001D2F": 2,
        "0x001D37": 2,
        "0x001D5A": 2,
        "0xD18C41": 2,
        "0x001D63": 2,
        "0x001D8F": 1,
        "0x00092F": 1,
        "0x000932": 1,
        "0x001D94": 1,
        "0x001DAC": 1,
        "0x00093B": 1,
        "0x000945": 1,
        "0x00094B": 1,
        "0x000951": 1,
        "0x001DB1": 1,
        "0x001DC9": 7,
        "0x001DD0": 6,
        "0x001DC1": 6,
        "0x001DC5": 6,
        "0x001E63": 1,
        "0x000963": 1,
        "0x00081E": 1,
        "0x000831": 1,
        "0x000836": 1,
        "0x00083B": 1,
        "0x00085D": 1,
        "0x000862": 1,
        "0x0019B5": 1,
        "0x02B016": 1
      },
      "topHotBlocks": [
        {
          "pc": "0x000A92",
          "count": 62472
        },
        {
          "pc": "0x000BFE",
          "count": 48260
        },
        {
          "pc": "0x0021C2",
          "count": 20186
        },
        {
          "pc": "0x006D5D",
          "count": 20176
        },
        {
          "pc": "0x006D64",
          "count": 20176
        },
        {
          "pc": "0x006CDF",
          "count": 20166
        },
        {
          "pc": "0x006D0F",
          "count": 20166
        },
        {
          "pc": "0x006D38",
          "count": 20160
        },
        {
          "pc": "0x006D4F",
          "count": 20160
        },
        {
          "pc": "0x006CF7",
          "count": 20156
        },
        {
          "pc": "0x005AE8",
          "count": 6224
        },
        {
          "pc": "0x005B16",
          "count": 6224
        },
        {
          "pc": "0x005B4B",
          "count": 6224
        },
        {
          "pc": "0x005AB6",
          "count": 5835
        },
        {
          "pc": "0x000B72",
          "count": 5790
        },
        {
          "pc": "0x000B7C",
          "count": 4642
        },
        {
          "pc": "0x000B81",
          "count": 4642
        },
        {
          "pc": "0x09EFDE",
          "count": 2880
        },
        {
          "pc": "0x000B7F",
          "count": 1534
        },
        {
          "pc": "0x0060B3",
          "count": 765
        },
        {
          "pc": "0x000AC5",
          "count": 747
        },
        {
          "pc": "0x000AEE",
          "count": 742
        },
        {
          "pc": "0x000A79",
          "count": 742
        },
        {
          "pc": "0x0A19A4",
          "count": 560
        },
        {
          "pc": "0x006129",
          "count": 519
        },
        {
          "pc": "0x00612E",
          "count": 519
        },
        {
          "pc": "0x001377",
          "count": 508
        },
        {
          "pc": "0x000ACE",
          "count": 480
        },
        {
          "pc": "0x0008BB",
          "count": 423
        },
        {
          "pc": "0x001713",
          "count": 421
        },
        {
          "pc": "0x001717",
          "count": 421
        },
        {
          "pc": "0x001718",
          "count": 421
        },
        {
          "pc": "0x005A53",
          "count": 399
        },
        {
          "pc": "0x0059C6",
          "count": 389
        },
        {
          "pc": "0x0059D6",
          "count": 389
        },
        {
          "pc": "0x005A75",
          "count": 389
        },
        {
          "pc": "0x005A82",
          "count": 389
        },
        {
          "pc": "0x00596E",
          "count": 389
        },
        {
          "pc": "0x005974",
          "count": 389
        },
        {
          "pc": "0x005998",
          "count": 389
        }
      ],
      "targetCounts": {
        "controlPreStop0A229D": 0,
        "engine08F54B": 0,
        "cleanup0018F8": 3,
        "prewipe001879": 3,
        "low000862": 1,
        "low000A92": 62472,
        "low03D044": 28,
        "caller058A16": 0,
        "spaceFill0A2A37": 11,
        "tokenOuter08F3B8": 0
      },
      "targetFirst": {
        "low03D044": {
          "block": 100,
          "step": 100,
          "pc": 249924,
          "prevPc": "0x03D038",
          "cpu": {
            "pc": 249924,
            "sp": 13740116,
            "af": 65467,
            "bc": 20488,
            "de": 32960,
            "hl": 0,
            "ix": 13740128,
            "iy": 13631616,
            "f": 187,
            "halted": false,
            "madl": 1,
            "stepCount": 100
          },
          "fields": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740280,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D02A40": 13805630,
            "D00595": 0,
            "D00596": 0,
            "D00587": 15,
            "D0058C": 15,
            "D0058E": 15,
            "D00080": 8,
            "D0009F": 32,
            "D02A28": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 0,
            "D01150": 0,
            "D0059A": 0
          },
          "stackTop": [
            {
              "addr": 13740116,
              "value": 13740193
            },
            {
              "addr": 13740119,
              "value": 13631616
            },
            {
              "addr": 13740122,
              "value": 13740128
            },
            {
              "addr": 13740125,
              "value": 378492
            },
            {
              "addr": 13740128,
              "value": 574265
            },
            {
              "addr": 13740131,
              "value": 6581
            },
            {
              "addr": 13740134,
              "value": 16777215
            },
            {
              "addr": 13740137,
              "value": 16777215
            }
          ],
          "vram": 8549,
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
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740280,
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
          }
        },
        "spaceFill0A2A37": {
          "block": 365,
          "step": 366,
          "pc": 666167,
          "prevPc": "0x0A237E",
          "cpu": {
            "pc": 666167,
            "sp": 13740098,
            "af": 117,
            "bc": 0,
            "de": 13805589,
            "hl": 0,
            "ix": 13740128,
            "iy": 13631616,
            "f": 117,
            "halted": false,
            "madl": 1,
            "stepCount": 366
          },
          "fields": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740280,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D02A40": 13805630,
            "D00595": 0,
            "D00596": 0,
            "D00587": 15,
            "D0058C": 15,
            "D0058E": 15,
            "D00080": 8,
            "D0009F": 32,
            "D02A28": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 0,
            "D01150": 0,
            "D0059A": 0
          },
          "stackTop": [
            {
              "addr": 13740098,
              "value": 664457
            },
            {
              "addr": 13740101,
              "value": 13805589
            },
            {
              "addr": 13740104,
              "value": 0
            },
            {
              "addr": 13740107,
              "value": 117
            },
            {
              "addr": 13740110,
              "value": 378905
            },
            {
              "addr": 13740113,
              "value": 0
            },
            {
              "addr": 13740116,
              "value": 13740128
            },
            {
              "addr": 13740119,
              "value": 65535
            }
          ],
          "vram": 8549,
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
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740280,
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
          }
        },
        "prewipe001879": {
          "block": 11128,
          "step": 11149,
          "pc": 6265,
          "prevPc": "0x001872",
          "cpu": {
            "pc": 6265,
            "sp": 13740155,
            "af": 61012,
            "bc": 3,
            "de": 1072,
            "hl": 0,
            "ix": 0,
            "iy": 13631616,
            "f": 84,
            "halted": false,
            "madl": 1,
            "stepCount": 11149
          },
          "fields": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D02A40": 0,
            "D00595": 0,
            "D00596": 0,
            "D00587": 0,
            "D0058C": 0,
            "D0058E": 0,
            "D00080": 0,
            "D0009F": 4,
            "D02A28": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 19974,
            "D01150": 0,
            "D0059A": 0
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
          "vram": 10861,
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 19974,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 0,
              "D02A40": 0,
              "D02A28": 0
            }
          },
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
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
              "nonWhite": 456
            },
            "vramCurrent": 10861,
            "lastKey": null
          }
        },
        "cleanup0018F8": {
          "block": 11129,
          "step": 11150,
          "pc": 6392,
          "prevPc": "0x001879",
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
            "stepCount": 11150
          },
          "fields": {
            "D007CA": 0,
            "D008E0": 0,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D02A40": 0,
            "D00595": 0,
            "D00596": 0,
            "D00587": 0,
            "D0058C": 0,
            "D0058E": 0,
            "D00080": 0,
            "D0009F": 0,
            "D02A28": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 0,
            "D01150": 0,
            "D0059A": 0
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
          "vram": 10861,
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
              "D0243D": 0,
              "D02A40": 0,
              "D02A28": 0
            }
          },
          "editLine": {
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
              "nonWhite": 456
            },
            "vramCurrent": 10861,
            "lastKey": null
          }
        },
        "low000A92": {
          "block": 101920,
          "step": 101941,
          "pc": 2706,
          "prevPc": "0x000A72",
          "cpu": {
            "pc": 2706,
            "sp": 13738940,
            "af": 57662,
            "bc": 0,
            "de": 13739005,
            "hl": 226,
            "ix": 13738985,
            "iy": 13631616,
            "f": 62,
            "halted": false,
            "madl": 1,
            "stepCount": 101941
          },
          "fields": {
            "D007CA": 0,
            "D008E0": 0,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D02A40": 0,
            "D00595": 4,
            "D00596": 19,
            "D00587": 0,
            "D0058C": 0,
            "D0058E": 0,
            "D00080": 0,
            "D0009F": 0,
            "D02A28": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 0,
            "D01150": 0,
            "D0059A": 0
          },
          "stackTop": [
            {
              "addr": 13738940,
              "value": 0
            },
            {
              "addr": 13738943,
              "value": 0
            },
            {
              "addr": 13738946,
              "value": 46
            },
            {
              "addr": 13738949,
              "value": 60122
            },
            {
              "addr": 13738952,
              "value": 11978
            },
            {
              "addr": 13738955,
              "value": 13739133
            },
            {
              "addr": 13738958,
              "value": 27790
            },
            {
              "addr": 13738961,
              "value": 16776960
            }
          ],
          "vram": 3039,
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
              "D0243D": 0,
              "D02A40": 0,
              "D02A28": 0
            }
          },
          "editLine": {
            "D007CA": 0,
            "D008E0": 0,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D00595": 4,
            "D00596": 19,
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
            "vramCurrent": 3039,
            "lastKey": null
          }
        },
        "low000862": {
          "block": 202840,
          "step": 202861,
          "pc": 2146,
          "prevPc": "0x00190F",
          "cpu": {
            "pc": 2146,
            "sp": 13740158,
            "af": 61012,
            "bc": 45094,
            "de": 14047232,
            "hl": 14047231,
            "ix": 0,
            "iy": 13631616,
            "f": 84,
            "halted": false,
            "madl": 1,
            "stepCount": 202861
          },
          "fields": {
            "D007CA": 0,
            "D008E0": 0,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D02A40": 0,
            "D00595": 0,
            "D00596": 0,
            "D00587": 0,
            "D0058C": 0,
            "D0058E": 0,
            "D00080": 0,
            "D0009F": 0,
            "D02A28": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 0,
            "D01150": 0,
            "D0059A": 0
          },
          "stackTop": [
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
            },
            {
              "addr": 13740179,
              "value": 0
            }
          ],
          "vram": 0,
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
              "D0243D": 0,
              "D02A40": 0,
              "D02A28": 0
            }
          },
          "editLine": {
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
              "nonWhite": 0
            },
            "vramCurrent": 0,
            "lastKey": null
          }
        }
      },
      "targetSamples": [
        {
          "target": "low03D044",
          "block": 100,
          "step": 100,
          "pc": 249924,
          "prevPc": "0x03D038",
          "cpu": {
            "pc": 249924,
            "sp": 13740116,
            "af": 65467,
            "bc": 20488,
            "de": 32960,
            "hl": 0,
            "ix": 13740128,
            "iy": 13631616,
            "f": 187,
            "halted": false,
            "madl": 1,
            "stepCount": 100
          },
          "fields": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740280,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D02A40": 13805630,
            "D00595": 0,
            "D00596": 0,
            "D00587": 15,
            "D0058C": 15,
            "D0058E": 15,
            "D00080": 8,
            "D0009F": 32,
            "D02A28": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 0,
            "D01150": 0,
            "D0059A": 0
          },
          "stackTop": [
            {
              "addr": 13740116,
              "value": 13740193
            },
            {
              "addr": 13740119,
              "value": 13631616
            },
            {
              "addr": 13740122,
              "value": 13740128
            },
            {
              "addr": 13740125,
              "value": 378492
            },
            {
              "addr": 13740128,
              "value": 574265
            },
            {
              "addr": 13740131,
              "value": 6581
            },
            {
              "addr": 13740134,
              "value": 16777215
            },
            {
              "addr": 13740137,
              "value": 16777215
            }
          ],
          "vram": 8549,
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
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740280,
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
          }
        },
        {
          "target": "low03D044",
          "block": 332,
          "step": 333,
          "pc": 249924,
          "prevPc": "0x03D038",
          "cpu": {
            "pc": 249924,
            "sp": 13740107,
            "af": 65467,
            "bc": 20488,
            "de": 32960,
            "hl": 0,
            "ix": 13740128,
            "iy": 13631616,
            "f": 187,
            "halted": false,
            "madl": 1,
            "stepCount": 333
          },
          "fields": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740280,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D02A40": 13805630,
            "D00595": 0,
            "D00596": 0,
            "D00587": 15,
            "D0058C": 15,
            "D0058E": 15,
            "D00080": 8,
            "D0009F": 32,
            "D02A28": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 0,
            "D01150": 0,
            "D0059A": 0
          },
          "stackTop": [
            {
              "addr": 13740107,
              "value": 13740193
            },
            {
              "addr": 13740110,
              "value": 13631616
            },
            {
              "addr": 13740113,
              "value": 13740128
            },
            {
              "addr": 13740116,
              "value": 668846
            },
            {
              "addr": 13740119,
              "value": 65535
            },
            {
              "addr": 13740122,
              "value": 13805589
            },
            {
              "addr": 13740125,
              "value": 0
            },
            {
              "addr": 13740128,
              "value": 574273
            }
          ],
          "vram": 8549,
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
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740280,
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
          }
        },
        {
          "target": "spaceFill0A2A37",
          "block": 365,
          "step": 366,
          "pc": 666167,
          "prevPc": "0x0A237E",
          "cpu": {
            "pc": 666167,
            "sp": 13740098,
            "af": 117,
            "bc": 0,
            "de": 13805589,
            "hl": 0,
            "ix": 13740128,
            "iy": 13631616,
            "f": 117,
            "halted": false,
            "madl": 1,
            "stepCount": 366
          },
          "fields": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740280,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D02A40": 13805630,
            "D00595": 0,
            "D00596": 0,
            "D00587": 15,
            "D0058C": 15,
            "D0058E": 15,
            "D00080": 8,
            "D0009F": 32,
            "D02A28": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 0,
            "D01150": 0,
            "D0059A": 0
          },
          "stackTop": [
            {
              "addr": 13740098,
              "value": 664457
            },
            {
              "addr": 13740101,
              "value": 13805589
            },
            {
              "addr": 13740104,
              "value": 0
            },
            {
              "addr": 13740107,
              "value": 117
            },
            {
              "addr": 13740110,
              "value": 378905
            },
            {
              "addr": 13740113,
              "value": 0
            },
            {
              "addr": 13740116,
              "value": 13740128
            },
            {
              "addr": 13740119,
              "value": 65535
            }
          ],
          "vram": 8549,
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
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740280,
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
          }
        },
        {
          "target": "spaceFill0A2A37",
          "block": 387,
          "step": 388,
          "pc": 666167,
          "prevPc": "0x0A237E",
          "cpu": {
            "pc": 666167,
            "sp": 13740080,
            "af": 16,
            "bc": 57344,
            "de": 13805630,
            "hl": 13697272,
            "ix": 13740128,
            "iy": 13631616,
            "f": 16,
            "halted": false,
            "madl": 1,
            "stepCount": 388
          },
          "fields": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740280,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D02A40": 13805630,
            "D00595": 0,
            "D00596": 0,
            "D00587": 15,
            "D0058C": 15,
            "D0058E": 15,
            "D00080": 8,
            "D0009F": 32,
            "D02A28": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 0,
            "D01150": 0,
            "D0059A": 0
          },
          "stackTop": [
            {
              "addr": 13740080,
              "value": 664457
            },
            {
              "addr": 13740083,
              "value": 13805630
            },
            {
              "addr": 13740086,
              "value": 57344
            },
            {
              "addr": 13740089,
              "value": 57360
            },
            {
              "addr": 13740092,
              "value": 661422
            },
            {
              "addr": 13740095,
              "value": 13740128
            },
            {
              "addr": 13740098,
              "value": 13697272
            },
            {
              "addr": 13740101,
              "value": 13805630
            }
          ],
          "vram": 8549,
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
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740280,
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
          }
        },
        {
          "target": "spaceFill0A2A37",
          "block": 961,
          "step": 962,
          "pc": 666167,
          "prevPc": "0x0A237E",
          "cpu": {
            "pc": 666167,
            "sp": 13740092,
            "af": 49,
            "bc": 57344,
            "de": 13805589,
            "hl": 65535,
            "ix": 13740128,
            "iy": 13631616,
            "f": 49,
            "halted": false,
            "madl": 1,
            "stepCount": 962
          },
          "fields": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740280,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D02A40": 13805630,
            "D00595": 0,
            "D00596": 0,
            "D00587": 15,
            "D0058C": 15,
            "D0058E": 15,
            "D00080": 8,
            "D0009F": 0,
            "D02A28": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 0,
            "D01150": 0,
            "D0059A": 0
          },
          "stackTop": [
            {
              "addr": 13740092,
              "value": 664457
            },
            {
              "addr": 13740095,
              "value": 13805589
            },
            {
              "addr": 13740098,
              "value": 57344
            },
            {
              "addr": 13740101,
              "value": 49
            },
            {
              "addr": 13740104,
              "value": 661422
            },
            {
              "addr": 13740107,
              "value": 13740128
            },
            {
              "addr": 13740110,
              "value": 65535
            },
            {
              "addr": 13740113,
              "value": 13805589
            }
          ],
          "vram": 8689,
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
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740280,
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
            "lastKey": null
          }
        },
        {
          "target": "low03D044",
          "block": 1727,
          "step": 1729,
          "pc": 249924,
          "prevPc": "0x03D038",
          "cpu": {
            "pc": 249924,
            "sp": 13740104,
            "af": 65467,
            "bc": 20488,
            "de": 32960,
            "hl": 0,
            "ix": 13740128,
            "iy": 13631616,
            "f": 187,
            "halted": false,
            "madl": 1,
            "stepCount": 1729
          },
          "fields": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740280,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D02A40": 13805630,
            "D00595": 0,
            "D00596": 0,
            "D00587": 15,
            "D0058C": 15,
            "D0058E": 15,
            "D00080": 8,
            "D0009F": 0,
            "D02A28": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 0,
            "D01150": 0,
            "D0059A": 0
          },
          "stackTop": [
            {
              "addr": 13740104,
              "value": 13740193
            },
            {
              "addr": 13740107,
              "value": 13631616
            },
            {
              "addr": 13740110,
              "value": 13740128
            },
            {
              "addr": 13740113,
              "value": 662070
            },
            {
              "addr": 13740116,
              "value": 65535
            },
            {
              "addr": 13740119,
              "value": 13805589
            },
            {
              "addr": 13740122,
              "value": 57344
            },
            {
              "addr": 13740125,
              "value": 3856
            }
          ],
          "vram": 8585,
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
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740280,
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
        },
        {
          "target": "low03D044",
          "block": 1900,
          "step": 1903,
          "pc": 249924,
          "prevPc": "0x03D038",
          "cpu": {
            "pc": 249924,
            "sp": 13740116,
            "af": 65467,
            "bc": 20488,
            "de": 32960,
            "hl": 0,
            "ix": 13740128,
            "iy": 13631616,
            "f": 187,
            "halted": false,
            "madl": 1,
            "stepCount": 1903
          },
          "fields": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740280,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D02A40": 13805630,
            "D00595": 0,
            "D00596": 0,
            "D00587": 15,
            "D0058C": 15,
            "D0058E": 15,
            "D00080": 8,
            "D0009F": 0,
            "D02A28": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 0,
            "D01150": 0,
            "D0059A": 0
          },
          "stackTop": [
            {
              "addr": 13740116,
              "value": 13740193
            },
            {
              "addr": 13740119,
              "value": 13631616
            },
            {
              "addr": 13740122,
              "value": 13740128
            },
            {
              "addr": 13740125,
              "value": 574770
            },
            {
              "addr": 13740128,
              "value": 4003
            },
            {
              "addr": 13740131,
              "value": 6581
            },
            {
              "addr": 13740134,
              "value": 16777215
            },
            {
              "addr": 13740137,
              "value": 16777215
            }
          ],
          "vram": 8585,
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
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740280,
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
        },
        {
          "target": "low03D044",
          "block": 2184,
          "step": 2188,
          "pc": 249924,
          "prevPc": "0x03D038",
          "cpu": {
            "pc": 249924,
            "sp": 13740107,
            "af": 65467,
            "bc": 20488,
            "de": 32960,
            "hl": 0,
            "ix": 13740128,
            "iy": 13631616,
            "f": 187,
            "halted": false,
            "madl": 1,
            "stepCount": 2188
          },
          "fields": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740280,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D02A40": 13805630,
            "D00595": 0,
            "D00596": 0,
            "D00587": 15,
            "D0058C": 15,
            "D0058E": 15,
            "D00080": 8,
            "D0009F": 0,
            "D02A28": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 0,
            "D01150": 0,
            "D0059A": 0
          },
          "stackTop": [
            {
              "addr": 13740107,
              "value": 13740193
            },
            {
              "addr": 13740110,
              "value": 13631616
            },
            {
              "addr": 13740113,
              "value": 13740128
            },
            {
              "addr": 13740116,
              "value": 668846
            },
            {
              "addr": 13740119,
              "value": 65535
            },
            {
              "addr": 13740122,
              "value": 13805630
            },
            {
              "addr": 13740125,
              "value": 3840
            },
            {
              "addr": 13740128,
              "value": 574273
            }
          ],
          "vram": 8585,
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
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740280,
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
        },
        {
          "target": "low03D044",
          "block": 2300,
          "step": 2305,
          "pc": 249924,
          "prevPc": "0x03D038",
          "cpu": {
            "pc": 249924,
            "sp": 13740116,
            "af": 65467,
            "bc": 20488,
            "de": 32960,
            "hl": 0,
            "ix": 13740128,
            "iy": 13631616,
            "f": 187,
            "halted": false,
            "madl": 1,
            "stepCount": 2305
          },
          "fields": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740280,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D02A40": 13805630,
            "D00595": 0,
            "D00596": 0,
            "D00587": 15,
            "D0058C": 15,
            "D0058E": 15,
            "D00080": 8,
            "D0009F": 0,
            "D02A28": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 0,
            "D01150": 0,
            "D0059A": 0
          },
          "stackTop": [
            {
              "addr": 13740116,
              "value": 13740193
            },
            {
              "addr": 13740119,
              "value": 13631616
            },
            {
              "addr": 13740122,
              "value": 13740128
            },
            {
              "addr": 13740125,
              "value": 378715
            },
            {
              "addr": 13740128,
              "value": 574277
            },
            {
              "addr": 13740131,
              "value": 6581
            },
            {
              "addr": 13740134,
              "value": 16777215
            },
            {
              "addr": 13740137,
              "value": 16777215
            }
          ],
          "vram": 8585,
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
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740280,
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
        },
        {
          "target": "spaceFill0A2A37",
          "block": 2331,
          "step": 2336,
          "pc": 666167,
          "prevPc": "0x0A237E",
          "cpu": {
            "pc": 666167,
            "sp": 13740098,
            "af": 117,
            "bc": 3840,
            "de": 13805630,
            "hl": 0,
            "ix": 13740128,
            "iy": 13631616,
            "f": 117,
            "halted": false,
            "madl": 1,
            "stepCount": 2336
          },
          "fields": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740280,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D02A40": 13805630,
            "D00595": 0,
            "D00596": 0,
            "D00587": 15,
            "D0058C": 15,
            "D0058E": 15,
            "D00080": 8,
            "D0009F": 0,
            "D02A28": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 0,
            "D01150": 0,
            "D0059A": 0
          },
          "stackTop": [
            {
              "addr": 13740098,
              "value": 664457
            },
            {
              "addr": 13740101,
              "value": 13805630
            },
            {
              "addr": 13740104,
              "value": 3840
            },
            {
              "addr": 13740107,
              "value": 117
            },
            {
              "addr": 13740110,
              "value": 378905
            },
            {
              "addr": 13740113,
              "value": 0
            },
            {
              "addr": 13740116,
              "value": 13740128
            },
            {
              "addr": 13740119,
              "value": 65535
            }
          ],
          "vram": 8585,
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
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740280,
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
        },
        {
          "target": "spaceFill0A2A37",
          "block": 2353,
          "step": 2358,
          "pc": 666167,
          "prevPc": "0x0A237E",
          "cpu": {
            "pc": 666167,
            "sp": 13740080,
            "af": 16,
            "bc": 57344,
            "de": 13805630,
            "hl": 13697272,
            "ix": 13740128,
            "iy": 13631616,
            "f": 16,
            "halted": false,
            "madl": 1,
            "stepCount": 2358
          },
          "fields": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740280,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D02A40": 13805630,
            "D00595": 0,
            "D00596": 0,
            "D00587": 15,
            "D0058C": 15,
            "D0058E": 15,
            "D00080": 8,
            "D0009F": 0,
            "D02A28": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 0,
            "D01150": 0,
            "D0059A": 0
          },
          "stackTop": [
            {
              "addr": 13740080,
              "value": 664457
            },
            {
              "addr": 13740083,
              "value": 13805630
            },
            {
              "addr": 13740086,
              "value": 57344
            },
            {
              "addr": 13740089,
              "value": 57360
            },
            {
              "addr": 13740092,
              "value": 661422
            },
            {
              "addr": 13740095,
              "value": 13740128
            },
            {
              "addr": 13740098,
              "value": 13697272
            },
            {
              "addr": 13740101,
              "value": 13805630
            }
          ],
          "vram": 8585,
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
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740280,
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
        },
        {
          "target": "spaceFill0A2A37",
          "block": 2949,
          "step": 2954,
          "pc": 666167,
          "prevPc": "0x0A237E",
          "cpu": {
            "pc": 666167,
            "sp": 13740074,
            "af": 16,
            "bc": 57344,
            "de": 13805630,
            "hl": 13697272,
            "ix": 13740128,
            "iy": 13631616,
            "f": 16,
            "halted": false,
            "madl": 1,
            "stepCount": 2954
          },
          "fields": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740280,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D02A40": 13805630,
            "D00595": 0,
            "D00596": 0,
            "D00587": 15,
            "D0058C": 0,
            "D0058E": 0,
            "D00080": 8,
            "D0009F": 0,
            "D02A28": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 0,
            "D01150": 0,
            "D0059A": 0
          },
          "stackTop": [
            {
              "addr": 13740074,
              "value": 664457
            },
            {
              "addr": 13740077,
              "value": 13805630
            },
            {
              "addr": 13740080,
              "value": 57344
            },
            {
              "addr": 13740083,
              "value": 57360
            },
            {
              "addr": 13740086,
              "value": 661422
            },
            {
              "addr": 13740089,
              "value": 13740128
            },
            {
              "addr": 13740092,
              "value": 13697272
            },
            {
              "addr": 13740095,
              "value": 13805630
            }
          ],
          "vram": 8689,
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
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740280,
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
            "lastKey": null
          }
        },
        {
          "target": "low03D044",
          "block": 3603,
          "step": 3609,
          "pc": 249924,
          "prevPc": "0x03D038",
          "cpu": {
            "pc": 249924,
            "sp": 13740107,
            "af": 65467,
            "bc": 20488,
            "de": 32960,
            "hl": 0,
            "ix": 13740128,
            "iy": 13631616,
            "f": 187,
            "halted": false,
            "madl": 1,
            "stepCount": 3609
          },
          "fields": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740280,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D02A40": 13805630,
            "D00595": 0,
            "D00596": 0,
            "D00587": 0,
            "D0058C": 0,
            "D0058E": 0,
            "D00080": 0,
            "D0009F": 0,
            "D02A28": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 0,
            "D01150": 0,
            "D0059A": 0
          },
          "stackTop": [
            {
              "addr": 13740107,
              "value": 13740193
            },
            {
              "addr": 13740110,
              "value": 13631616
            },
            {
              "addr": 13740113,
              "value": 13740128
            },
            {
              "addr": 13740116,
              "value": 261018
            },
            {
              "addr": 13740119,
              "value": 3856
            },
            {
              "addr": 13740122,
              "value": 196034
            },
            {
              "addr": 13740125,
              "value": 195782
            },
            {
              "addr": 13740128,
              "value": 574310
            }
          ],
          "vram": 8689,
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
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740280,
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
            "lastKey": null
          }
        },
        {
          "target": "low03D044",
          "block": 3718,
          "step": 3725,
          "pc": 249924,
          "prevPc": "0x03D038",
          "cpu": {
            "pc": 249924,
            "sp": 13740107,
            "af": 65467,
            "bc": 20488,
            "de": 32960,
            "hl": 0,
            "ix": 13740128,
            "iy": 13631616,
            "f": 187,
            "halted": false,
            "madl": 1,
            "stepCount": 3725
          },
          "fields": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740280,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D02A40": 13805630,
            "D00595": 0,
            "D00596": 0,
            "D00587": 0,
            "D0058C": 0,
            "D0058E": 0,
            "D00080": 0,
            "D0009F": 0,
            "D02A28": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 0,
            "D01150": 0,
            "D0059A": 0
          },
          "stackTop": [
            {
              "addr": 13740107,
              "value": 13740193
            },
            {
              "addr": 13740110,
              "value": 13631616
            },
            {
              "addr": 13740113,
              "value": 13740128
            },
            {
              "addr": 13740116,
              "value": 261018
            },
            {
              "addr": 13740119,
              "value": 3856
            },
            {
              "addr": 13740122,
              "value": 196034
            },
            {
              "addr": 13740125,
              "value": 195782
            },
            {
              "addr": 13740128,
              "value": 574310
            }
          ],
          "vram": 8689,
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
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740280,
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
            "lastKey": null
          }
        },
        {
          "target": "spaceFill0A2A37",
          "block": 3797,
          "step": 3804,
          "pc": 666167,
          "prevPc": "0x0A237E",
          "cpu": {
            "pc": 666167,
            "sp": 13740092,
            "af": 49,
            "bc": 57344,
            "de": 13762622,
            "hl": 653226,
            "ix": 13740128,
            "iy": 13631616,
            "f": 49,
            "halted": false,
            "madl": 1,
            "stepCount": 3804
          },
          "fields": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740280,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D02A40": 13805630,
            "D00595": 0,
            "D00596": 0,
            "D00587": 0,
            "D0058C": 9,
            "D0058E": 0,
            "D00080": 0,
            "D0009F": 0,
            "D02A28": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 0,
            "D01150": 0,
            "D0059A": 0
          },
          "stackTop": [
            {
              "addr": 13740092,
              "value": 664457
            },
            {
              "addr": 13740095,
              "value": 13762622
            },
            {
              "addr": 13740098,
              "value": 57344
            },
            {
              "addr": 13740101,
              "value": 49
            },
            {
              "addr": 13740104,
              "value": 661422
            },
            {
              "addr": 13740107,
              "value": 13740128
            },
            {
              "addr": 13740110,
              "value": 653226
            },
            {
              "addr": 13740113,
              "value": 13762622
            }
          ],
          "vram": 8689,
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
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740280,
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
            "lastKey": null
          }
        },
        {
          "target": "low03D044",
          "block": 4563,
          "step": 4571,
          "pc": 249924,
          "prevPc": "0x03D038",
          "cpu": {
            "pc": 249924,
            "sp": 13740104,
            "af": 65467,
            "bc": 20488,
            "de": 32960,
            "hl": 0,
            "ix": 13740128,
            "iy": 13631616,
            "f": 187,
            "halted": false,
            "madl": 1,
            "stepCount": 4571
          },
          "fields": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740280,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D02A40": 13805630,
            "D00595": 0,
            "D00596": 0,
            "D00587": 0,
            "D0058C": 9,
            "D0058E": 0,
            "D00080": 0,
            "D0009F": 0,
            "D02A28": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 0,
            "D01150": 0,
            "D0059A": 0
          },
          "stackTop": [
            {
              "addr": 13740104,
              "value": 13740193
            },
            {
              "addr": 13740107,
              "value": 13631616
            },
            {
              "addr": 13740110,
              "value": 13740128
            },
            {
              "addr": 13740113,
              "value": 662070
            },
            {
              "addr": 13740116,
              "value": 653226
            },
            {
              "addr": 13740119,
              "value": 13762622
            },
            {
              "addr": 13740122,
              "value": 57344
            },
            {
              "addr": 13740125,
              "value": 2353
            }
          ],
          "vram": 8585,
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
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740280,
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
        },
        {
          "target": "low03D044",
          "block": 4700,
          "step": 4709,
          "pc": 249924,
          "prevPc": "0x03D038",
          "cpu": {
            "pc": 249924,
            "sp": 13740116,
            "af": 65467,
            "bc": 20488,
            "de": 32960,
            "hl": 0,
            "ix": 13740128,
            "iy": 13631616,
            "f": 187,
            "halted": false,
            "madl": 1,
            "stepCount": 4709
          },
          "fields": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740280,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D02A40": 13805630,
            "D00595": 0,
            "D00596": 0,
            "D00587": 0,
            "D0058C": 9,
            "D0058E": 0,
            "D00080": 0,
            "D0009F": 0,
            "D02A28": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 0,
            "D01150": 0,
            "D0059A": 0
          },
          "stackTop": [
            {
              "addr": 13740116,
              "value": 13740193
            },
            {
              "addr": 13740119,
              "value": 13631616
            },
            {
              "addr": 13740122,
              "value": 13740128
            },
            {
              "addr": 13740125,
              "value": 543198
            },
            {
              "addr": 13740128,
              "value": 574454
            },
            {
              "addr": 13740131,
              "value": 6581
            },
            {
              "addr": 13740134,
              "value": 16777215
            },
            {
              "addr": 13740137,
              "value": 16777215
            }
          ],
          "vram": 8585,
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
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740280,
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
        },
        {
          "target": "low03D044",
          "block": 4900,
          "step": 4910,
          "pc": 249924,
          "prevPc": "0x03D038",
          "cpu": {
            "pc": 249924,
            "sp": 13740095,
            "af": 65467,
            "bc": 20488,
            "de": 32960,
            "hl": 0,
            "ix": 13740128,
            "iy": 13631616,
            "f": 187,
            "halted": false,
            "madl": 1,
            "stepCount": 4910
          },
          "fields": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740280,
            "D0243D": 13805630,
            "D02590": 13893249,
            "D02A40": 13805630,
            "D00595": 0,
            "D00596": 0,
            "D00587": 0,
            "D0058C": 9,
            "D0058E": 0,
            "D00080": 0,
            "D0009F": 0,
            "D02A28": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 0,
            "D01150": 0,
            "D0059A": 0
          },
          "stackTop": [
            {
              "addr": 13740095,
              "value": 13740193
            },
            {
              "addr": 13740098,
              "value": 13631616
            },
            {
              "addr": 13740101,
              "value": 13740128
            },
            {
              "addr": 13740104,
              "value": 524889
            },
            {
              "addr": 13740107,
              "value": 524466
            },
            {
              "addr": 13740110,
              "value": 363872
            },
            {
              "addr": 13740113,
              "value": 362985
            },
            {
              "addr": 13740116,
              "value": 575293
            }
          ],
          "vram": 8585,
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
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740280,
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
        },
        {
          "target": "spaceFill0A2A37",
          "block": 7935,
          "step": 7945,
          "pc": 666167,
          "prevPc": "0x0A3274",
          "cpu": {
            "pc": 666167,
            "sp": 13740059,
            "af": 64,
            "bc": 9526,
            "de": 319,
            "hl": 0,
            "ix": 13640964,
            "iy": 13631616,
            "f": 64,
            "halted": false,
            "madl": 1,
            "stepCount": 7945
          },
          "fields": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D02A40": 0,
            "D00595": 0,
            "D00596": 25,
            "D00587": 0,
            "D0058C": 9,
            "D0058E": 0,
            "D00080": 0,
            "D0009F": 0,
            "D02A28": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 19974,
            "D01150": 0,
            "D0059A": 0
          },
          "stackTop": [
            {
              "addr": 13740059,
              "value": 668283
            },
            {
              "addr": 13740062,
              "value": 68
            },
            {
              "addr": 13740065,
              "value": 13740128
            },
            {
              "addr": 13740068,
              "value": 13640964
            },
            {
              "addr": 13740071,
              "value": 13632917
            },
            {
              "addr": 13740074,
              "value": 256
            },
            {
              "addr": 13740077,
              "value": 65336
            },
            {
              "addr": 13740080,
              "value": 663790
            }
          ],
          "vram": 10789,
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 19974,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 0,
              "D02A40": 0,
              "D02A28": 0
            }
          },
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D00595": 0,
            "D00596": 25,
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
              "nonWhite": 384
            },
            "vramCurrent": 10789,
            "lastKey": null
          }
        },
        {
          "target": "spaceFill0A2A37",
          "block": 7937,
          "step": 7947,
          "pc": 666167,
          "prevPc": "0x0A327B",
          "cpu": {
            "pc": 666167,
            "sp": 13740056,
            "af": 65466,
            "bc": 16777190,
            "de": 13633215,
            "hl": 13633189,
            "ix": 13640964,
            "iy": 13631616,
            "f": 186,
            "halted": false,
            "madl": 1,
            "stepCount": 7947
          },
          "fields": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D02A40": 0,
            "D00595": 0,
            "D00596": 25,
            "D00587": 0,
            "D0058C": 9,
            "D0058E": 0,
            "D00080": 0,
            "D0009F": 0,
            "D02A28": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 19974,
            "D01150": 0,
            "D0059A": 0
          },
          "stackTop": [
            {
              "addr": 13740056,
              "value": 668307
            },
            {
              "addr": 13740059,
              "value": 13633189
            },
            {
              "addr": 13740062,
              "value": 68
            },
            {
              "addr": 13740065,
              "value": 13740128
            },
            {
              "addr": 13740068,
              "value": 13640964
            },
            {
              "addr": 13740071,
              "value": 13632917
            },
            {
              "addr": 13740074,
              "value": 256
            },
            {
              "addr": 13740077,
              "value": 65336
            }
          ],
          "vram": 10789,
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 19974,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 0,
              "D02A40": 0,
              "D02A28": 0
            }
          },
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D00595": 0,
            "D00596": 25,
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
              "nonWhite": 384
            },
            "vramCurrent": 10789,
            "lastKey": null
          }
        },
        {
          "target": "low03D044",
          "block": 8064,
          "step": 8075,
          "pc": 249924,
          "prevPc": "0x03D038",
          "cpu": {
            "pc": 249924,
            "sp": 13740071,
            "af": 65467,
            "bc": 20488,
            "de": 32960,
            "hl": 0,
            "ix": 13740128,
            "iy": 13631616,
            "f": 187,
            "halted": false,
            "madl": 1,
            "stepCount": 8075
          },
          "fields": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D02A40": 0,
            "D00595": 0,
            "D00596": 0,
            "D00587": 0,
            "D0058C": 0,
            "D0058E": 0,
            "D00080": 0,
            "D0009F": 4,
            "D02A28": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 19974,
            "D01150": 0,
            "D0059A": 0
          },
          "stackTop": [
            {
              "addr": 13740071,
              "value": 0
            },
            {
              "addr": 13740074,
              "value": 13631616
            },
            {
              "addr": 13740077,
              "value": 13740128
            },
            {
              "addr": 13740080,
              "value": 663790
            },
            {
              "addr": 13740083,
              "value": 659812
            },
            {
              "addr": 13740086,
              "value": 0
            },
            {
              "addr": 13740089,
              "value": 68
            },
            {
              "addr": 13740092,
              "value": 666646
            }
          ],
          "vram": 10789,
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 19974,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 0,
              "D02A40": 0,
              "D02A28": 0
            }
          },
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
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
              "nonWhite": 384
            },
            "vramCurrent": 10789,
            "lastKey": null
          }
        },
        {
          "target": "low03D044",
          "block": 8642,
          "step": 8655,
          "pc": 249924,
          "prevPc": "0x03D038",
          "cpu": {
            "pc": 249924,
            "sp": 13740119,
            "af": 65467,
            "bc": 20488,
            "de": 32960,
            "hl": 0,
            "ix": 13740128,
            "iy": 13631616,
            "f": 187,
            "halted": false,
            "madl": 1,
            "stepCount": 8655
          },
          "fields": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D02A40": 0,
            "D00595": 0,
            "D00596": 0,
            "D00587": 0,
            "D0058C": 0,
            "D0058E": 0,
            "D00080": 0,
            "D0009F": 4,
            "D02A28": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 19974,
            "D01150": 0,
            "D0059A": 0
          },
          "stackTop": [
            {
              "addr": 13740119,
              "value": 0
            },
            {
              "addr": 13740122,
              "value": 13631616
            },
            {
              "addr": 13740125,
              "value": 13740128
            },
            {
              "addr": 13740128,
              "value": 574273
            },
            {
              "addr": 13740131,
              "value": 6581
            },
            {
              "addr": 13740134,
              "value": 16777215
            },
            {
              "addr": 13740137,
              "value": 16777215
            },
            {
              "addr": 13740140,
              "value": 16777215
            }
          ],
          "vram": 10837,
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 19974,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 0,
              "D02A40": 0,
              "D02A28": 0
            }
          },
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
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
              "nonWhite": 432
            },
            "vramCurrent": 10837,
            "lastKey": null
          }
        },
        {
          "target": "spaceFill0A2A37",
          "block": 8765,
          "step": 8779,
          "pc": 666167,
          "prevPc": "0x0A237E",
          "cpu": {
            "pc": 666167,
            "sp": 13740098,
            "af": 117,
            "bc": 2304,
            "de": 0,
            "hl": 0,
            "ix": 13740128,
            "iy": 13631616,
            "f": 117,
            "halted": false,
            "madl": 1,
            "stepCount": 8779
          },
          "fields": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D02A40": 0,
            "D00595": 0,
            "D00596": 0,
            "D00587": 0,
            "D0058C": 0,
            "D0058E": 0,
            "D00080": 0,
            "D0009F": 4,
            "D02A28": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 19974,
            "D01150": 0,
            "D0059A": 0
          },
          "stackTop": [
            {
              "addr": 13740098,
              "value": 664457
            },
            {
              "addr": 13740101,
              "value": 0
            },
            {
              "addr": 13740104,
              "value": 2304
            },
            {
              "addr": 13740107,
              "value": 117
            },
            {
              "addr": 13740110,
              "value": 378905
            },
            {
              "addr": 13740113,
              "value": 0
            },
            {
              "addr": 13740116,
              "value": 13740128
            },
            {
              "addr": 13740119,
              "value": 653226
            }
          ],
          "vram": 10837,
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 19974,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 0,
              "D02A40": 0,
              "D02A28": 0
            }
          },
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
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
              "nonWhite": 432
            },
            "vramCurrent": 10837,
            "lastKey": null
          }
        },
        {
          "target": "low03D044",
          "block": 9377,
          "step": 9392,
          "pc": 249924,
          "prevPc": "0x03D038",
          "cpu": {
            "pc": 249924,
            "sp": 13740107,
            "af": 65467,
            "bc": 20488,
            "de": 32960,
            "hl": 0,
            "ix": 13740128,
            "iy": 13631616,
            "f": 187,
            "halted": false,
            "madl": 1,
            "stepCount": 9392
          },
          "fields": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D02A40": 0,
            "D00595": 0,
            "D00596": 0,
            "D00587": 0,
            "D0058C": 0,
            "D0058E": 0,
            "D00080": 0,
            "D0009F": 4,
            "D02A28": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 19974,
            "D01150": 0,
            "D0059A": 0
          },
          "stackTop": [
            {
              "addr": 13740107,
              "value": 0
            },
            {
              "addr": 13740110,
              "value": 13631616
            },
            {
              "addr": 13740113,
              "value": 13740128
            },
            {
              "addr": 13740116,
              "value": 260636
            },
            {
              "addr": 13740119,
              "value": 16
            },
            {
              "addr": 13740122,
              "value": 196034
            },
            {
              "addr": 13740125,
              "value": 195782
            },
            {
              "addr": 13740128,
              "value": 574310
            }
          ],
          "vram": 10861,
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 19974,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 0,
              "D02A40": 0,
              "D02A28": 0
            }
          },
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
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
              "nonWhite": 456
            },
            "vramCurrent": 10861,
            "lastKey": null
          }
        },
        {
          "target": "low03D044",
          "block": 9500,
          "step": 9516,
          "pc": 249924,
          "prevPc": "0x03D038",
          "cpu": {
            "pc": 249924,
            "sp": 13740098,
            "af": 65467,
            "bc": 20488,
            "de": 32960,
            "hl": 0,
            "ix": 13740113,
            "iy": 13631616,
            "f": 187,
            "halted": false,
            "madl": 1,
            "stepCount": 9516
          },
          "fields": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D02A40": 0,
            "D00595": 0,
            "D00596": 0,
            "D00587": 0,
            "D0058C": 0,
            "D0058E": 0,
            "D00080": 0,
            "D0009F": 4,
            "D02A28": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 19974,
            "D01150": 0,
            "D0059A": 0
          },
          "stackTop": [
            {
              "addr": 13740098,
              "value": 0
            },
            {
              "addr": 13740101,
              "value": 13631616
            },
            {
              "addr": 13740104,
              "value": 13740113
            },
            {
              "addr": 13740107,
              "value": 152011
            },
            {
              "addr": 13740110,
              "value": 13631616
            },
            {
              "addr": 13740113,
              "value": 13740128
            },
            {
              "addr": 13740116,
              "value": 260801
            },
            {
              "addr": 13740119,
              "value": 16
            }
          ],
          "vram": 10861,
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 19974,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 0,
              "D02A40": 0,
              "D02A28": 0
            }
          },
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
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
              "nonWhite": 456
            },
            "vramCurrent": 10861,
            "lastKey": null
          }
        },
        {
          "target": "low03D044",
          "block": 9707,
          "step": 9724,
          "pc": 249924,
          "prevPc": "0x03D038",
          "cpu": {
            "pc": 249924,
            "sp": 13740082,
            "af": 65467,
            "bc": 20488,
            "de": 32960,
            "hl": 0,
            "ix": 13740101,
            "iy": 13631616,
            "f": 187,
            "halted": false,
            "madl": 1,
            "stepCount": 9724
          },
          "fields": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D02A40": 0,
            "D00595": 0,
            "D00596": 0,
            "D00587": 0,
            "D0058C": 0,
            "D0058E": 0,
            "D00080": 0,
            "D0009F": 4,
            "D02A28": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 19974,
            "D01150": 0,
            "D0059A": 0
          },
          "stackTop": [
            {
              "addr": 13740082,
              "value": 0
            },
            {
              "addr": 13740085,
              "value": 13631616
            },
            {
              "addr": 13740088,
              "value": 13740101
            },
            {
              "addr": 13740091,
              "value": 297979
            },
            {
              "addr": 13740094,
              "value": 2000
            },
            {
              "addr": 13740097,
              "value": 0
            },
            {
              "addr": 13740100,
              "value": 11034624
            },
            {
              "addr": 13740103,
              "value": 16445905
            }
          ],
          "vram": 10861,
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 19974,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 0,
              "D02A40": 0,
              "D02A28": 0
            }
          },
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
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
              "nonWhite": 456
            },
            "vramCurrent": 10861,
            "lastKey": null
          }
        },
        {
          "target": "low03D044",
          "block": 9900,
          "step": 9918,
          "pc": 249924,
          "prevPc": "0x03D038",
          "cpu": {
            "pc": 249924,
            "sp": 13740082,
            "af": 65467,
            "bc": 20488,
            "de": 32960,
            "hl": 0,
            "ix": 13740101,
            "iy": 13631616,
            "f": 187,
            "halted": false,
            "madl": 1,
            "stepCount": 9918
          },
          "fields": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D02A40": 0,
            "D00595": 0,
            "D00596": 0,
            "D00587": 0,
            "D0058C": 0,
            "D0058E": 0,
            "D00080": 0,
            "D0009F": 4,
            "D02A28": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 19974,
            "D01150": 0,
            "D0059A": 0
          },
          "stackTop": [
            {
              "addr": 13740082,
              "value": 0
            },
            {
              "addr": 13740085,
              "value": 13631616
            },
            {
              "addr": 13740088,
              "value": 13740101
            },
            {
              "addr": 13740091,
              "value": 303098
            },
            {
              "addr": 13740094,
              "value": 298245
            },
            {
              "addr": 13740097,
              "value": 0
            },
            {
              "addr": 13740100,
              "value": 11034624
            },
            {
              "addr": 13740103,
              "value": 16445905
            }
          ],
          "vram": 10861,
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 19974,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 0,
              "D02A40": 0,
              "D02A28": 0
            }
          },
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
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
              "nonWhite": 456
            },
            "vramCurrent": 10861,
            "lastKey": null
          }
        },
        {
          "target": "low03D044",
          "block": 10100,
          "step": 10119,
          "pc": 249924,
          "prevPc": "0x03D038",
          "cpu": {
            "pc": 249924,
            "sp": 13740073,
            "af": 65467,
            "bc": 20488,
            "de": 32960,
            "hl": 0,
            "ix": 13740091,
            "iy": 13631616,
            "f": 187,
            "halted": false,
            "madl": 1,
            "stepCount": 10119
          },
          "fields": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D02A40": 0,
            "D00595": 0,
            "D00596": 0,
            "D00587": 0,
            "D0058C": 0,
            "D0058E": 0,
            "D00080": 0,
            "D0009F": 4,
            "D02A28": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 19974,
            "D01150": 0,
            "D0059A": 0
          },
          "stackTop": [
            {
              "addr": 13740073,
              "value": 0
            },
            {
              "addr": 13740076,
              "value": 13631616
            },
            {
              "addr": 13740079,
              "value": 13740091
            },
            {
              "addr": 13740082,
              "value": 176008
            },
            {
              "addr": 13740085,
              "value": 269026
            },
            {
              "addr": 13740088,
              "value": 32
            },
            {
              "addr": 13740091,
              "value": 13740101
            },
            {
              "addr": 13740094,
              "value": 298496
            }
          ],
          "vram": 10861,
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 19974,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 0,
              "D02A40": 0,
              "D02A28": 0
            }
          },
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
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
              "nonWhite": 456
            },
            "vramCurrent": 10861,
            "lastKey": null
          }
        },
        {
          "target": "low03D044",
          "block": 10450,
          "step": 10470,
          "pc": 249924,
          "prevPc": "0x03D038",
          "cpu": {
            "pc": 249924,
            "sp": 16375045,
            "af": 65467,
            "bc": 20488,
            "de": 32960,
            "hl": 0,
            "ix": 0,
            "iy": 13631616,
            "f": 187,
            "halted": false,
            "madl": 1,
            "stepCount": 10470
          },
          "fields": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D02A40": 0,
            "D00595": 0,
            "D00596": 0,
            "D00587": 0,
            "D0058C": 0,
            "D0058E": 0,
            "D00080": 0,
            "D0009F": 4,
            "D02A28": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 19974,
            "D01150": 0,
            "D0059A": 0
          },
          "stackTop": [
            {
              "addr": 16375045,
              "value": 0
            },
            {
              "addr": 16375048,
              "value": 3866650
            },
            {
              "addr": 16375051,
              "value": 0
            },
            {
              "addr": 16375054,
              "value": 0
            },
            {
              "addr": 16375057,
              "value": 0
            },
            {
              "addr": 16375060,
              "value": 0
            },
            {
              "addr": 16375063,
              "value": 0
            },
            {
              "addr": 16375066,
              "value": 0
            }
          ],
          "vram": 10861,
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 19974,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 0,
              "D02A40": 0,
              "D02A28": 0
            }
          },
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
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
              "nonWhite": 456
            },
            "vramCurrent": 10861,
            "lastKey": null
          }
        },
        {
          "target": "prewipe001879",
          "block": 11128,
          "step": 11149,
          "pc": 6265,
          "prevPc": "0x001872",
          "cpu": {
            "pc": 6265,
            "sp": 13740155,
            "af": 61012,
            "bc": 3,
            "de": 1072,
            "hl": 0,
            "ix": 0,
            "iy": 13631616,
            "f": 84,
            "halted": false,
            "madl": 1,
            "stepCount": 11149
          },
          "fields": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D02A40": 0,
            "D00595": 0,
            "D00596": 0,
            "D00587": 0,
            "D0058C": 0,
            "D0058E": 0,
            "D00080": 0,
            "D0009F": 4,
            "D02A28": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 19974,
            "D01150": 0,
            "D0059A": 0
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
          "vram": 10861,
          "persistence": {
            "tokenGate": 0,
            "tokenA": 0,
            "tokenB": 0,
            "tuple": {
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 19974,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 0,
              "D02A40": 0,
              "D02A28": 0
            }
          },
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
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
              "nonWhite": 456
            },
            "vramCurrent": 10861,
            "lastKey": null
          }
        },
        {
          "target": "cleanup0018F8",
          "block": 11129,
          "step": 11150,
          "pc": 6392,
          "prevPc": "0x001879",
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
            "stepCount": 11150
          },
          "fields": {
            "D007CA": 0,
            "D008E0": 0,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D02A40": 0,
            "D00595": 0,
            "D00596": 0,
            "D00587": 0,
            "D0058C": 0,
            "D0058E": 0,
            "D00080": 0,
            "D0009F": 0,
            "D02A28": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 0,
            "D01150": 0,
            "D0059A": 0
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
          "vram": 10861,
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
              "D0243D": 0,
              "D02A40": 0,
              "D02A28": 0
            }
          },
          "editLine": {
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
              "nonWhite": 456
            },
            "vramCurrent": 10861,
            "lastKey": null
          }
        },
        {
          "target": "low000A92",
          "block": 101920,
          "step": 101941,
          "pc": 2706,
          "prevPc": "0x000A72",
          "cpu": {
            "pc": 2706,
            "sp": 13738940,
            "af": 57662,
            "bc": 0,
            "de": 13739005,
            "hl": 226,
            "ix": 13738985,
            "iy": 13631616,
            "f": 62,
            "halted": false,
            "madl": 1,
            "stepCount": 101941
          },
          "fields": {
            "D007CA": 0,
            "D008E0": 0,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D02A40": 0,
            "D00595": 4,
            "D00596": 19,
            "D00587": 0,
            "D0058C": 0,
            "D0058E": 0,
            "D00080": 0,
            "D0009F": 0,
            "D02A28": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 0,
            "D01150": 0,
            "D0059A": 0
          },
          "stackTop": [
            {
              "addr": 13738940,
              "value": 0
            },
            {
              "addr": 13738943,
              "value": 0
            },
            {
              "addr": 13738946,
              "value": 46
            },
            {
              "addr": 13738949,
              "value": 60122
            },
            {
              "addr": 13738952,
              "value": 11978
            },
            {
              "addr": 13738955,
              "value": 13739133
            },
            {
              "addr": 13738958,
              "value": 27790
            },
            {
              "addr": 13738961,
              "value": 16776960
            }
          ],
          "vram": 3039,
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
              "D0243D": 0,
              "D02A40": 0,
              "D02A28": 0
            }
          },
          "editLine": {
            "D007CA": 0,
            "D008E0": 0,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D00595": 4,
            "D00596": 19,
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
            "vramCurrent": 3039,
            "lastKey": null
          }
        },
        {
          "target": "low000A92",
          "block": 101921,
          "step": 101942,
          "pc": 2706,
          "prevPc": "0x000A92",
          "cpu": {
            "pc": 2706,
            "sp": 13738940,
            "af": 53290,
            "bc": 0,
            "de": 13739006,
            "hl": 194,
            "ix": 13738985,
            "iy": 13631616,
            "f": 42,
            "halted": false,
            "madl": 1,
            "stepCount": 101942
          },
          "fields": {
            "D007CA": 0,
            "D008E0": 0,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D02A40": 0,
            "D00595": 4,
            "D00596": 19,
            "D00587": 0,
            "D0058C": 0,
            "D0058E": 0,
            "D00080": 0,
            "D0009F": 0,
            "D02A28": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 0,
            "D01150": 0,
            "D0059A": 0
          },
          "stackTop": [
            {
              "addr": 13738940,
              "value": 0
            },
            {
              "addr": 13738943,
              "value": 0
            },
            {
              "addr": 13738946,
              "value": 46
            },
            {
              "addr": 13738949,
              "value": 60122
            },
            {
              "addr": 13738952,
              "value": 11978
            },
            {
              "addr": 13738955,
              "value": 13739133
            },
            {
              "addr": 13738958,
              "value": 27790
            },
            {
              "addr": 13738961,
              "value": 16776960
            }
          ],
          "vram": 3039,
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
              "D0243D": 0,
              "D02A40": 0,
              "D02A28": 0
            }
          },
          "editLine": {
            "D007CA": 0,
            "D008E0": 0,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D00595": 4,
            "D00596": 19,
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
            "vramCurrent": 3039,
            "lastKey": null
          }
        },
        {
          "target": "low000A92",
          "block": 101922,
          "step": 101943,
          "pc": 2706,
          "prevPc": "0x000A92",
          "cpu": {
            "pc": 2706,
            "sp": 13738940,
            "af": 30506,
            "bc": 0,
            "de": 13739007,
            "hl": 5,
            "ix": 13738985,
            "iy": 13631616,
            "f": 42,
            "halted": false,
            "madl": 1,
            "stepCount": 101943
          },
          "fields": {
            "D007CA": 0,
            "D008E0": 0,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D02A40": 0,
            "D00595": 4,
            "D00596": 19,
            "D00587": 0,
            "D0058C": 0,
            "D0058E": 0,
            "D00080": 0,
            "D0009F": 0,
            "D02A28": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 0,
            "D01150": 0,
            "D0059A": 0
          },
          "stackTop": [
            {
              "addr": 13738940,
              "value": 0
            },
            {
              "addr": 13738943,
              "value": 0
            },
            {
              "addr": 13738946,
              "value": 46
            },
            {
              "addr": 13738949,
              "value": 60122
            },
            {
              "addr": 13738952,
              "value": 11978
            },
            {
              "addr": 13738955,
              "value": 13739133
            },
            {
              "addr": 13738958,
              "value": 27790
            },
            {
              "addr": 13738961,
              "value": 16776960
            }
          ],
          "vram": 3039,
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
              "D0243D": 0,
              "D02A40": 0,
              "D02A28": 0
            }
          },
          "editLine": {
            "D007CA": 0,
            "D008E0": 0,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D00595": 4,
            "D00596": 19,
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
            "vramCurrent": 3039,
            "lastKey": null
          }
        },
        {
          "target": "low000A92",
          "block": 101923,
          "step": 101944,
          "pc": 2706,
          "prevPc": "0x000A92",
          "cpu": {
            "pc": 2706,
            "sp": 13738940,
            "af": 59690,
            "bc": 0,
            "de": 13739008,
            "hl": 33,
            "ix": 13738985,
            "iy": 13631616,
            "f": 42,
            "halted": false,
            "madl": 1,
            "stepCount": 101944
          },
          "fields": {
            "D007CA": 0,
            "D008E0": 0,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D02A40": 0,
            "D00595": 4,
            "D00596": 19,
            "D00587": 0,
            "D0058C": 0,
            "D0058E": 0,
            "D00080": 0,
            "D0009F": 0,
            "D02A28": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 0,
            "D01150": 0,
            "D0059A": 0
          },
          "stackTop": [
            {
              "addr": 13738940,
              "value": 0
            },
            {
              "addr": 13738943,
              "value": 0
            },
            {
              "addr": 13738946,
              "value": 46
            },
            {
              "addr": 13738949,
              "value": 60122
            },
            {
              "addr": 13738952,
              "value": 11978
            },
            {
              "addr": 13738955,
              "value": 13739133
            },
            {
              "addr": 13738958,
              "value": 27790
            },
            {
              "addr": 13738961,
              "value": 16776960
            }
          ],
          "vram": 3039,
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
              "D0243D": 0,
              "D02A40": 0,
              "D02A28": 0
            }
          },
          "editLine": {
            "D007CA": 0,
            "D008E0": 0,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D00595": 4,
            "D00596": 19,
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
            "vramCurrent": 3039,
            "lastKey": null
          }
        },
        {
          "target": "low000A92",
          "block": 101924,
          "step": 101945,
          "pc": 2706,
          "prevPc": "0x000A92",
          "cpu": {
            "pc": 2706,
            "sp": 13738940,
            "af": 4394,
            "bc": 0,
            "de": 13739009,
            "hl": 226,
            "ix": 13738985,
            "iy": 13631616,
            "f": 42,
            "halted": false,
            "madl": 1,
            "stepCount": 101945
          },
          "fields": {
            "D007CA": 0,
            "D008E0": 0,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D02A40": 0,
            "D00595": 4,
            "D00596": 19,
            "D00587": 0,
            "D0058C": 0,
            "D0058E": 0,
            "D00080": 0,
            "D0009F": 0,
            "D02A28": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 0,
            "D01150": 0,
            "D0059A": 0
          },
          "stackTop": [
            {
              "addr": 13738940,
              "value": 0
            },
            {
              "addr": 13738943,
              "value": 0
            },
            {
              "addr": 13738946,
              "value": 46
            },
            {
              "addr": 13738949,
              "value": 60122
            },
            {
              "addr": 13738952,
              "value": 11978
            },
            {
              "addr": 13738955,
              "value": 13739133
            },
            {
              "addr": 13738958,
              "value": 27790
            },
            {
              "addr": 13738961,
              "value": 16776960
            }
          ],
          "vram": 3039,
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
              "D0243D": 0,
              "D02A40": 0,
              "D02A28": 0
            }
          },
          "editLine": {
            "D007CA": 0,
            "D008E0": 0,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D00595": 4,
            "D00596": 19,
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
            "vramCurrent": 3039,
            "lastKey": null
          }
        },
        {
          "target": "low000A92",
          "block": 101925,
          "step": 101946,
          "pc": 2706,
          "prevPc": "0x000A92",
          "cpu": {
            "pc": 2706,
            "sp": 13738940,
            "af": 65322,
            "bc": 0,
            "de": 13739010,
            "hl": 223,
            "ix": 13738985,
            "iy": 13631616,
            "f": 42,
            "halted": false,
            "madl": 1,
            "stepCount": 101946
          },
          "fields": {
            "D007CA": 0,
            "D008E0": 0,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D02A40": 0,
            "D00595": 4,
            "D00596": 19,
            "D00587": 0,
            "D0058C": 0,
            "D0058E": 0,
            "D00080": 0,
            "D0009F": 0,
            "D02A28": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 0,
            "D01150": 0,
            "D0059A": 0
          },
          "stackTop": [
            {
              "addr": 13738940,
              "value": 0
            },
            {
              "addr": 13738943,
              "value": 0
            },
            {
              "addr": 13738946,
              "value": 46
            },
            {
              "addr": 13738949,
              "value": 60122
            },
            {
              "addr": 13738952,
              "value": 11978
            },
            {
              "addr": 13738955,
              "value": 13739133
            },
            {
              "addr": 13738958,
              "value": 27790
            },
            {
              "addr": 13738961,
              "value": 16776960
            }
          ],
          "vram": 3039,
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
              "D0243D": 0,
              "D02A40": 0,
              "D02A28": 0
            }
          },
          "editLine": {
            "D007CA": 0,
            "D008E0": 0,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D00595": 4,
            "D00596": 19,
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
            "vramCurrent": 3039,
            "lastKey": null
          }
        },
        {
          "target": "low000A92",
          "block": 101926,
          "step": 101947,
          "pc": 2706,
          "prevPc": "0x000A92",
          "cpu": {
            "pc": 2706,
            "sp": 13738940,
            "af": 29994,
            "bc": 0,
            "de": 13739011,
            "hl": 232,
            "ix": 13738985,
            "iy": 13631616,
            "f": 42,
            "halted": false,
            "madl": 1,
            "stepCount": 101947
          },
          "fields": {
            "D007CA": 0,
            "D008E0": 0,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D02A40": 0,
            "D00595": 4,
            "D00596": 19,
            "D00587": 0,
            "D0058C": 0,
            "D0058E": 0,
            "D00080": 0,
            "D0009F": 0,
            "D02A28": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 0,
            "D01150": 0,
            "D0059A": 0
          },
          "stackTop": [
            {
              "addr": 13738940,
              "value": 0
            },
            {
              "addr": 13738943,
              "value": 0
            },
            {
              "addr": 13738946,
              "value": 46
            },
            {
              "addr": 13738949,
              "value": 60122
            },
            {
              "addr": 13738952,
              "value": 11978
            },
            {
              "addr": 13738955,
              "value": 13739133
            },
            {
              "addr": 13738958,
              "value": 27790
            },
            {
              "addr": 13738961,
              "value": 16776960
            }
          ],
          "vram": 3039,
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
              "D0243D": 0,
              "D02A40": 0,
              "D02A28": 0
            }
          },
          "editLine": {
            "D007CA": 0,
            "D008E0": 0,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D00595": 4,
            "D00596": 19,
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
            "vramCurrent": 3039,
            "lastKey": null
          }
        },
        {
          "target": "low000A92",
          "block": 101927,
          "step": 101948,
          "pc": 2706,
          "prevPc": "0x000A92",
          "cpu": {
            "pc": 2706,
            "sp": 13738940,
            "af": 32554,
            "bc": 0,
            "de": 13739012,
            "hl": 7,
            "ix": 13738985,
            "iy": 13631616,
            "f": 42,
            "halted": false,
            "madl": 1,
            "stepCount": 101948
          },
          "fields": {
            "D007CA": 0,
            "D008E0": 0,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D02A40": 0,
            "D00595": 4,
            "D00596": 19,
            "D00587": 0,
            "D0058C": 0,
            "D0058E": 0,
            "D00080": 0,
            "D0009F": 0,
            "D02A28": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 0,
            "D01150": 0,
            "D0059A": 0
          },
          "stackTop": [
            {
              "addr": 13738940,
              "value": 0
            },
            {
              "addr": 13738943,
              "value": 0
            },
            {
              "addr": 13738946,
              "value": 46
            },
            {
              "addr": 13738949,
              "value": 60122
            },
            {
              "addr": 13738952,
              "value": 11978
            },
            {
              "addr": 13738955,
              "value": 13739133
            },
            {
              "addr": 13738958,
              "value": 27790
            },
            {
              "addr": 13738961,
              "value": 16776960
            }
          ],
          "vram": 3039,
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
              "D0243D": 0,
              "D02A40": 0,
              "D02A28": 0
            }
          },
          "editLine": {
            "D007CA": 0,
            "D008E0": 0,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D00595": 4,
            "D00596": 19,
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
            "vramCurrent": 3039,
            "lastKey": null
          }
        },
        {
          "target": "low000A92",
          "block": 101928,
          "step": 101949,
          "pc": 2706,
          "prevPc": "0x000A92",
          "cpu": {
            "pc": 2706,
            "sp": 13738940,
            "af": 40994,
            "bc": 0,
            "de": 13739013,
            "hl": 38,
            "ix": 13738985,
            "iy": 13631616,
            "f": 34,
            "halted": false,
            "madl": 1,
            "stepCount": 101949
          },
          "fields": {
            "D007CA": 0,
            "D008E0": 0,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D02A40": 0,
            "D00595": 4,
            "D00596": 19,
            "D00587": 0,
            "D0058C": 0,
            "D0058E": 0,
            "D00080": 0,
            "D0009F": 0,
            "D02A28": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 0,
            "D01150": 0,
            "D0059A": 0
          },
          "stackTop": [
            {
              "addr": 13738940,
              "value": 0
            },
            {
              "addr": 13738943,
              "value": 0
            },
            {
              "addr": 13738946,
              "value": 46
            },
            {
              "addr": 13738949,
              "value": 60122
            },
            {
              "addr": 13738952,
              "value": 11978
            },
            {
              "addr": 13738955,
              "value": 13739133
            },
            {
              "addr": 13738958,
              "value": 27790
            },
            {
              "addr": 13738961,
              "value": 16776960
            }
          ],
          "vram": 3039,
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
              "D0243D": 0,
              "D02A40": 0,
              "D02A28": 0
            }
          },
          "editLine": {
            "D007CA": 0,
            "D008E0": 0,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D00595": 4,
            "D00596": 19,
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
            "vramCurrent": 3039,
            "lastKey": null
          }
        },
        {
          "target": "low000A92",
          "block": 101929,
          "step": 101950,
          "pc": 2706,
          "prevPc": "0x000A92",
          "cpu": {
            "pc": 2706,
            "sp": 13738940,
            "af": 31522,
            "bc": 0,
            "de": 13739014,
            "hl": 155,
            "ix": 13738985,
            "iy": 13631616,
            "f": 34,
            "halted": false,
            "madl": 1,
            "stepCount": 101950
          },
          "fields": {
            "D007CA": 0,
            "D008E0": 0,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D02A40": 0,
            "D00595": 4,
            "D00596": 19,
            "D00587": 0,
            "D0058C": 0,
            "D0058E": 0,
            "D00080": 0,
            "D0009F": 0,
            "D02A28": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 0,
            "D01150": 0,
            "D0059A": 0
          },
          "stackTop": [
            {
              "addr": 13738940,
              "value": 0
            },
            {
              "addr": 13738943,
              "value": 0
            },
            {
              "addr": 13738946,
              "value": 46
            },
            {
              "addr": 13738949,
              "value": 60122
            },
            {
              "addr": 13738952,
              "value": 11978
            },
            {
              "addr": 13738955,
              "value": 13739133
            },
            {
              "addr": 13738958,
              "value": 27790
            },
            {
              "addr": 13738961,
              "value": 16776960
            }
          ],
          "vram": 3039,
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
              "D0243D": 0,
              "D02A40": 0,
              "D02A28": 0
            }
          },
          "editLine": {
            "D007CA": 0,
            "D008E0": 0,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D00595": 4,
            "D00596": 19,
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
            "vramCurrent": 3039,
            "lastKey": null
          }
        },
        {
          "target": "low000A92",
          "block": 101930,
          "step": 101951,
          "pc": 2706,
          "prevPc": "0x000A92",
          "cpu": {
            "pc": 2706,
            "sp": 13738940,
            "af": 47650,
            "bc": 0,
            "de": 13739015,
            "hl": 14,
            "ix": 13738985,
            "iy": 13631616,
            "f": 34,
            "halted": false,
            "madl": 1,
            "stepCount": 101951
          },
          "fields": {
            "D007CA": 0,
            "D008E0": 0,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D02A40": 0,
            "D00595": 4,
            "D00596": 19,
            "D00587": 0,
            "D0058C": 0,
            "D0058E": 0,
            "D00080": 0,
            "D0009F": 0,
            "D02A28": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 0,
            "D01150": 0,
            "D0059A": 0
          },
          "stackTop": [
            {
              "addr": 13738940,
              "value": 0
            },
            {
              "addr": 13738943,
              "value": 0
            },
            {
              "addr": 13738946,
              "value": 46
            },
            {
              "addr": 13738949,
              "value": 60122
            },
            {
              "addr": 13738952,
              "value": 11978
            },
            {
              "addr": 13738955,
              "value": 13739133
            },
            {
              "addr": 13738958,
              "value": 27790
            },
            {
              "addr": 13738961,
              "value": 16776960
            }
          ],
          "vram": 3039,
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
              "D0243D": 0,
              "D02A40": 0,
              "D02A28": 0
            }
          },
          "editLine": {
            "D007CA": 0,
            "D008E0": 0,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D00595": 4,
            "D00596": 19,
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
            "vramCurrent": 3039,
            "lastKey": null
          }
        },
        {
          "target": "low000A92",
          "block": 101931,
          "step": 101952,
          "pc": 2706,
          "prevPc": "0x000A92",
          "cpu": {
            "pc": 2706,
            "sp": 13738940,
            "af": 30754,
            "bc": 0,
            "de": 13739016,
            "hl": 9,
            "ix": 13738985,
            "iy": 13631616,
            "f": 34,
            "halted": false,
            "madl": 1,
            "stepCount": 101952
          },
          "fields": {
            "D007CA": 0,
            "D008E0": 0,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D02A40": 0,
            "D00595": 4,
            "D00596": 19,
            "D00587": 0,
            "D0058C": 0,
            "D0058E": 0,
            "D00080": 0,
            "D0009F": 0,
            "D02A28": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 0,
            "D01150": 0,
            "D0059A": 0
          },
          "stackTop": [
            {
              "addr": 13738940,
              "value": 0
            },
            {
              "addr": 13738943,
              "value": 0
            },
            {
              "addr": 13738946,
              "value": 46
            },
            {
              "addr": 13738949,
              "value": 60122
            },
            {
              "addr": 13738952,
              "value": 11978
            },
            {
              "addr": 13738955,
              "value": 13739133
            },
            {
              "addr": 13738958,
              "value": 27790
            },
            {
              "addr": 13738961,
              "value": 16776960
            }
          ],
          "vram": 3039,
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
              "D0243D": 0,
              "D02A40": 0,
              "D02A28": 0
            }
          },
          "editLine": {
            "D007CA": 0,
            "D008E0": 0,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D00595": 4,
            "D00596": 19,
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
            "vramCurrent": 3039,
            "lastKey": null
          }
        },
        {
          "target": "low000A92",
          "block": 101932,
          "step": 101953,
          "pc": 2706,
          "prevPc": "0x000A92",
          "cpu": {
            "pc": 2706,
            "sp": 13738940,
            "af": 5410,
            "bc": 0,
            "de": 13739017,
            "hl": 192,
            "ix": 13738985,
            "iy": 13631616,
            "f": 34,
            "halted": false,
            "madl": 1,
            "stepCount": 101953
          },
          "fields": {
            "D007CA": 0,
            "D008E0": 0,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D02A40": 0,
            "D00595": 4,
            "D00596": 19,
            "D00587": 0,
            "D0058C": 0,
            "D0058E": 0,
            "D00080": 0,
            "D0009F": 0,
            "D02A28": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 0,
            "D01150": 0,
            "D0059A": 0
          },
          "stackTop": [
            {
              "addr": 13738940,
              "value": 0
            },
            {
              "addr": 13738943,
              "value": 0
            },
            {
              "addr": 13738946,
              "value": 46
            },
            {
              "addr": 13738949,
              "value": 60122
            },
            {
              "addr": 13738952,
              "value": 11978
            },
            {
              "addr": 13738955,
              "value": 13739133
            },
            {
              "addr": 13738958,
              "value": 27790
            },
            {
              "addr": 13738961,
              "value": 16776960
            }
          ],
          "vram": 3039,
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
              "D0243D": 0,
              "D02A40": 0,
              "D02A28": 0
            }
          },
          "editLine": {
            "D007CA": 0,
            "D008E0": 0,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D00595": 4,
            "D00596": 19,
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
            "vramCurrent": 3039,
            "lastKey": null
          }
        },
        {
          "target": "low000A92",
          "block": 101933,
          "step": 101954,
          "pc": 2706,
          "prevPc": "0x000A92",
          "cpu": {
            "pc": 2706,
            "sp": 13738940,
            "af": 29218,
            "bc": 0,
            "de": 13739018,
            "hl": 198,
            "ix": 13738985,
            "iy": 13631616,
            "f": 34,
            "halted": false,
            "madl": 1,
            "stepCount": 101954
          },
          "fields": {
            "D007CA": 0,
            "D008E0": 0,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D02A40": 0,
            "D00595": 4,
            "D00596": 19,
            "D00587": 0,
            "D0058C": 0,
            "D0058E": 0,
            "D00080": 0,
            "D0009F": 0,
            "D02A28": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 0,
            "D01150": 0,
            "D0059A": 0
          },
          "stackTop": [
            {
              "addr": 13738940,
              "value": 0
            },
            {
              "addr": 13738943,
              "value": 0
            },
            {
              "addr": 13738946,
              "value": 46
            },
            {
              "addr": 13738949,
              "value": 60122
            },
            {
              "addr": 13738952,
              "value": 11978
            },
            {
              "addr": 13738955,
              "value": 13739133
            },
            {
              "addr": 13738958,
              "value": 27790
            },
            {
              "addr": 13738961,
              "value": 16776960
            }
          ],
          "vram": 3039,
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
              "D0243D": 0,
              "D02A40": 0,
              "D02A28": 0
            }
          },
          "editLine": {
            "D007CA": 0,
            "D008E0": 0,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D00595": 4,
            "D00596": 19,
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
            "vramCurrent": 3039,
            "lastKey": null
          }
        },
        {
          "target": "low000A92",
          "block": 101934,
          "step": 101955,
          "pc": 2706,
          "prevPc": "0x000A92",
          "cpu": {
            "pc": 2706,
            "sp": 13738940,
            "af": 62754,
            "bc": 0,
            "de": 13739019,
            "hl": 29,
            "ix": 13738985,
            "iy": 13631616,
            "f": 34,
            "halted": false,
            "madl": 1,
            "stepCount": 101955
          },
          "fields": {
            "D007CA": 0,
            "D008E0": 0,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D02A40": 0,
            "D00595": 4,
            "D00596": 19,
            "D00587": 0,
            "D0058C": 0,
            "D0058E": 0,
            "D00080": 0,
            "D0009F": 0,
            "D02A28": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 0,
            "D01150": 0,
            "D0059A": 0
          },
          "stackTop": [
            {
              "addr": 13738940,
              "value": 0
            },
            {
              "addr": 13738943,
              "value": 0
            },
            {
              "addr": 13738946,
              "value": 46
            },
            {
              "addr": 13738949,
              "value": 60122
            },
            {
              "addr": 13738952,
              "value": 11978
            },
            {
              "addr": 13738955,
              "value": 13739133
            },
            {
              "addr": 13738958,
              "value": 27790
            },
            {
              "addr": 13738961,
              "value": 16776960
            }
          ],
          "vram": 3039,
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
              "D0243D": 0,
              "D02A40": 0,
              "D02A28": 0
            }
          },
          "editLine": {
            "D007CA": 0,
            "D008E0": 0,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D00595": 4,
            "D00596": 19,
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
            "vramCurrent": 3039,
            "lastKey": null
          }
        },
        {
          "target": "low000A92",
          "block": 101935,
          "step": 101956,
          "pc": 2706,
          "prevPc": "0x000A92",
          "cpu": {
            "pc": 2706,
            "sp": 13738940,
            "af": 61474,
            "bc": 0,
            "de": 13739020,
            "hl": 2,
            "ix": 13738985,
            "iy": 13631616,
            "f": 34,
            "halted": false,
            "madl": 1,
            "stepCount": 101956
          },
          "fields": {
            "D007CA": 0,
            "D008E0": 0,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D02A40": 0,
            "D00595": 4,
            "D00596": 19,
            "D00587": 0,
            "D0058C": 0,
            "D0058E": 0,
            "D00080": 0,
            "D0009F": 0,
            "D02A28": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 0,
            "D01150": 0,
            "D0059A": 0
          },
          "stackTop": [
            {
              "addr": 13738940,
              "value": 0
            },
            {
              "addr": 13738943,
              "value": 0
            },
            {
              "addr": 13738946,
              "value": 46
            },
            {
              "addr": 13738949,
              "value": 60122
            },
            {
              "addr": 13738952,
              "value": 11978
            },
            {
              "addr": 13738955,
              "value": 13739133
            },
            {
              "addr": 13738958,
              "value": 27790
            },
            {
              "addr": 13738961,
              "value": 16776960
            }
          ],
          "vram": 3039,
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
              "D0243D": 0,
              "D02A40": 0,
              "D02A28": 0
            }
          },
          "editLine": {
            "D007CA": 0,
            "D008E0": 0,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D00595": 4,
            "D00596": 19,
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
            "vramCurrent": 3039,
            "lastKey": null
          }
        },
        {
          "target": "low000A92",
          "block": 101936,
          "step": 101957,
          "pc": 2706,
          "prevPc": "0x000A92",
          "cpu": {
            "pc": 2706,
            "sp": 13738940,
            "af": 33338,
            "bc": 0,
            "de": 13739021,
            "hl": 120,
            "ix": 13738985,
            "iy": 13631616,
            "f": 58,
            "halted": false,
            "madl": 1,
            "stepCount": 101957
          },
          "fields": {
            "D007CA": 0,
            "D008E0": 0,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D02A40": 0,
            "D00595": 4,
            "D00596": 19,
            "D00587": 0,
            "D0058C": 0,
            "D0058E": 0,
            "D00080": 0,
            "D0009F": 0,
            "D02A28": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 0,
            "D01150": 0,
            "D0059A": 0
          },
          "stackTop": [
            {
              "addr": 13738940,
              "value": 0
            },
            {
              "addr": 13738943,
              "value": 0
            },
            {
              "addr": 13738946,
              "value": 46
            },
            {
              "addr": 13738949,
              "value": 60122
            },
            {
              "addr": 13738952,
              "value": 11978
            },
            {
              "addr": 13738955,
              "value": 13739133
            },
            {
              "addr": 13738958,
              "value": 27790
            },
            {
              "addr": 13738961,
              "value": 16776960
            }
          ],
          "vram": 3039,
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
              "D0243D": 0,
              "D02A40": 0,
              "D02A28": 0
            }
          },
          "editLine": {
            "D007CA": 0,
            "D008E0": 0,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D00595": 4,
            "D00596": 19,
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
            "vramCurrent": 3039,
            "lastKey": null
          }
        },
        {
          "target": "low000A92",
          "block": 101937,
          "step": 101958,
          "pc": 2706,
          "prevPc": "0x000A92",
          "cpu": {
            "pc": 2706,
            "sp": 13738940,
            "af": 39978,
            "bc": 0,
            "de": 13739022,
            "hl": 94,
            "ix": 13738985,
            "iy": 13631616,
            "f": 42,
            "halted": false,
            "madl": 1,
            "stepCount": 101958
          },
          "fields": {
            "D007CA": 0,
            "D008E0": 0,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D02A40": 0,
            "D00595": 4,
            "D00596": 19,
            "D00587": 0,
            "D0058C": 0,
            "D0058E": 0,
            "D00080": 0,
            "D0009F": 0,
            "D02A28": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 0,
            "D01150": 0,
            "D0059A": 0
          },
          "stackTop": [
            {
              "addr": 13738940,
              "value": 0
            },
            {
              "addr": 13738943,
              "value": 0
            },
            {
              "addr": 13738946,
              "value": 46
            },
            {
              "addr": 13738949,
              "value": 60122
            },
            {
              "addr": 13738952,
              "value": 11978
            },
            {
              "addr": 13738955,
              "value": 13739133
            },
            {
              "addr": 13738958,
              "value": 27790
            },
            {
              "addr": 13738961,
              "value": 16776960
            }
          ],
          "vram": 3039,
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
              "D0243D": 0,
              "D02A40": 0,
              "D02A28": 0
            }
          },
          "editLine": {
            "D007CA": 0,
            "D008E0": 0,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D00595": 4,
            "D00596": 19,
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
            "vramCurrent": 3039,
            "lastKey": null
          }
        },
        {
          "target": "low000A92",
          "block": 101938,
          "step": 101959,
          "pc": 2706,
          "prevPc": "0x000A92",
          "cpu": {
            "pc": 2706,
            "sp": 13738940,
            "af": 48170,
            "bc": 0,
            "de": 13739023,
            "hl": 58,
            "ix": 13738985,
            "iy": 13631616,
            "f": 42,
            "halted": false,
            "madl": 1,
            "stepCount": 101959
          },
          "fields": {
            "D007CA": 0,
            "D008E0": 0,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D02A40": 0,
            "D00595": 4,
            "D00596": 19,
            "D00587": 0,
            "D0058C": 0,
            "D0058E": 0,
            "D00080": 0,
            "D0009F": 0,
            "D02A28": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 0,
            "D01150": 0,
            "D0059A": 0
          },
          "stackTop": [
            {
              "addr": 13738940,
              "value": 0
            },
            {
              "addr": 13738943,
              "value": 0
            },
            {
              "addr": 13738946,
              "value": 46
            },
            {
              "addr": 13738949,
              "value": 60122
            },
            {
              "addr": 13738952,
              "value": 11978
            },
            {
              "addr": 13738955,
              "value": 13739133
            },
            {
              "addr": 13738958,
              "value": 27790
            },
            {
              "addr": 13738961,
              "value": 16776960
            }
          ],
          "vram": 3039,
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
              "D0243D": 0,
              "D02A40": 0,
              "D02A28": 0
            }
          },
          "editLine": {
            "D007CA": 0,
            "D008E0": 0,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D00595": 4,
            "D00596": 19,
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
            "vramCurrent": 3039,
            "lastKey": null
          }
        },
        {
          "target": "low000A92",
          "block": 101939,
          "step": 101960,
          "pc": 2706,
          "prevPc": "0x000A92",
          "cpu": {
            "pc": 2706,
            "sp": 13738940,
            "af": 35114,
            "bc": 0,
            "de": 13739024,
            "hl": 59,
            "ix": 13738985,
            "iy": 13631616,
            "f": 42,
            "halted": false,
            "madl": 1,
            "stepCount": 101960
          },
          "fields": {
            "D007CA": 0,
            "D008E0": 0,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D02A40": 0,
            "D00595": 4,
            "D00596": 19,
            "D00587": 0,
            "D0058C": 0,
            "D0058E": 0,
            "D00080": 0,
            "D0009F": 0,
            "D02A28": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 0,
            "D01150": 0,
            "D0059A": 0
          },
          "stackTop": [
            {
              "addr": 13738940,
              "value": 0
            },
            {
              "addr": 13738943,
              "value": 0
            },
            {
              "addr": 13738946,
              "value": 46
            },
            {
              "addr": 13738949,
              "value": 60122
            },
            {
              "addr": 13738952,
              "value": 11978
            },
            {
              "addr": 13738955,
              "value": 13739133
            },
            {
              "addr": 13738958,
              "value": 27790
            },
            {
              "addr": 13738961,
              "value": 16776960
            }
          ],
          "vram": 3039,
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
              "D0243D": 0,
              "D02A40": 0,
              "D02A28": 0
            }
          },
          "editLine": {
            "D007CA": 0,
            "D008E0": 0,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D00595": 4,
            "D00596": 19,
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
            "vramCurrent": 3039,
            "lastKey": null
          }
        },
        {
          "target": "low000A92",
          "block": 101940,
          "step": 101961,
          "pc": 2706,
          "prevPc": "0x000A92",
          "cpu": {
            "pc": 2706,
            "sp": 13738940,
            "af": 11306,
            "bc": 0,
            "de": 13739025,
            "hl": 1,
            "ix": 13738985,
            "iy": 13631616,
            "f": 42,
            "halted": false,
            "madl": 1,
            "stepCount": 101961
          },
          "fields": {
            "D007CA": 0,
            "D008E0": 0,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D02A40": 0,
            "D00595": 4,
            "D00596": 19,
            "D00587": 0,
            "D0058C": 0,
            "D0058E": 0,
            "D00080": 0,
            "D0009F": 0,
            "D02A28": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 0,
            "D01150": 0,
            "D0059A": 0
          },
          "stackTop": [
            {
              "addr": 13738940,
              "value": 0
            },
            {
              "addr": 13738943,
              "value": 0
            },
            {
              "addr": 13738946,
              "value": 46
            },
            {
              "addr": 13738949,
              "value": 60122
            },
            {
              "addr": 13738952,
              "value": 11978
            },
            {
              "addr": 13738955,
              "value": 13739133
            },
            {
              "addr": 13738958,
              "value": 27790
            },
            {
              "addr": 13738961,
              "value": 16776960
            }
          ],
          "vram": 3039,
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
              "D0243D": 0,
              "D02A40": 0,
              "D02A28": 0
            }
          },
          "editLine": {
            "D007CA": 0,
            "D008E0": 0,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D00595": 4,
            "D00596": 19,
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
            "vramCurrent": 3039,
            "lastKey": null
          }
        },
        {
          "target": "low000A92",
          "block": 101941,
          "step": 101962,
          "pc": 2706,
          "prevPc": "0x000A92",
          "cpu": {
            "pc": 2706,
            "sp": 13738940,
            "af": 57130,
            "bc": 0,
            "de": 13739026,
            "hl": 178,
            "ix": 13738985,
            "iy": 13631616,
            "f": 42,
            "halted": false,
            "madl": 1,
            "stepCount": 101962
          },
          "fields": {
            "D007CA": 0,
            "D008E0": 0,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D02A40": 0,
            "D00595": 4,
            "D00596": 19,
            "D00587": 0,
            "D0058C": 0,
            "D0058E": 0,
            "D00080": 0,
            "D0009F": 0,
            "D02A28": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 0,
            "D01150": 0,
            "D0059A": 0
          },
          "stackTop": [
            {
              "addr": 13738940,
              "value": 0
            },
            {
              "addr": 13738943,
              "value": 0
            },
            {
              "addr": 13738946,
              "value": 46
            },
            {
              "addr": 13738949,
              "value": 60122
            },
            {
              "addr": 13738952,
              "value": 11978
            },
            {
              "addr": 13738955,
              "value": 13739133
            },
            {
              "addr": 13738958,
              "value": 27790
            },
            {
              "addr": 13738961,
              "value": 16776960
            }
          ],
          "vram": 3039,
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
              "D0243D": 0,
              "D02A40": 0,
              "D02A28": 0
            }
          },
          "editLine": {
            "D007CA": 0,
            "D008E0": 0,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D00595": 4,
            "D00596": 19,
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
            "vramCurrent": 3039,
            "lastKey": null
          }
        },
        {
          "target": "low000A92",
          "block": 101942,
          "step": 101963,
          "pc": 2706,
          "prevPc": "0x000A92",
          "cpu": {
            "pc": 2706,
            "sp": 13738940,
            "af": 1322,
            "bc": 0,
            "de": 13739027,
            "hl": 124,
            "ix": 13738985,
            "iy": 13631616,
            "f": 42,
            "halted": false,
            "madl": 1,
            "stepCount": 101963
          },
          "fields": {
            "D007CA": 0,
            "D008E0": 0,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D02A40": 0,
            "D00595": 4,
            "D00596": 19,
            "D00587": 0,
            "D0058C": 0,
            "D0058E": 0,
            "D00080": 0,
            "D0009F": 0,
            "D02A28": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 0,
            "D01150": 0,
            "D0059A": 0
          },
          "stackTop": [
            {
              "addr": 13738940,
              "value": 0
            },
            {
              "addr": 13738943,
              "value": 0
            },
            {
              "addr": 13738946,
              "value": 46
            },
            {
              "addr": 13738949,
              "value": 60122
            },
            {
              "addr": 13738952,
              "value": 11978
            },
            {
              "addr": 13738955,
              "value": 13739133
            },
            {
              "addr": 13738958,
              "value": 27790
            },
            {
              "addr": 13738961,
              "value": 16776960
            }
          ],
          "vram": 3039,
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
              "D0243D": 0,
              "D02A40": 0,
              "D02A28": 0
            }
          },
          "editLine": {
            "D007CA": 0,
            "D008E0": 0,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D00595": 4,
            "D00596": 19,
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
            "vramCurrent": 3039,
            "lastKey": null
          }
        },
        {
          "target": "low000A92",
          "block": 101943,
          "step": 101964,
          "pc": 2706,
          "prevPc": "0x000A92",
          "cpu": {
            "pc": 2706,
            "sp": 13738940,
            "af": 56106,
            "bc": 0,
            "de": 13739028,
            "hl": 74,
            "ix": 13738985,
            "iy": 13631616,
            "f": 42,
            "halted": false,
            "madl": 1,
            "stepCount": 101964
          },
          "fields": {
            "D007CA": 0,
            "D008E0": 0,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D02A40": 0,
            "D00595": 4,
            "D00596": 19,
            "D00587": 0,
            "D0058C": 0,
            "D0058E": 0,
            "D00080": 0,
            "D0009F": 0,
            "D02A28": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 0,
            "D01150": 0,
            "D0059A": 0
          },
          "stackTop": [
            {
              "addr": 13738940,
              "value": 0
            },
            {
              "addr": 13738943,
              "value": 0
            },
            {
              "addr": 13738946,
              "value": 46
            },
            {
              "addr": 13738949,
              "value": 60122
            },
            {
              "addr": 13738952,
              "value": 11978
            },
            {
              "addr": 13738955,
              "value": 13739133
            },
            {
              "addr": 13738958,
              "value": 27790
            },
            {
              "addr": 13738961,
              "value": 16776960
            }
          ],
          "vram": 3039,
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
              "D0243D": 0,
              "D02A40": 0,
              "D02A28": 0
            }
          },
          "editLine": {
            "D007CA": 0,
            "D008E0": 0,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D00595": 4,
            "D00596": 19,
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
            "vramCurrent": 3039,
            "lastKey": null
          }
        },
        {
          "target": "low000A92",
          "block": 101944,
          "step": 101965,
          "pc": 2706,
          "prevPc": "0x000A92",
          "cpu": {
            "pc": 2706,
            "sp": 13738940,
            "af": 30498,
            "bc": 0,
            "de": 13739029,
            "hl": 238,
            "ix": 13738985,
            "iy": 13631616,
            "f": 34,
            "halted": false,
            "madl": 1,
            "stepCount": 101965
          },
          "fields": {
            "D007CA": 0,
            "D008E0": 0,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D02A40": 0,
            "D00595": 4,
            "D00596": 19,
            "D00587": 0,
            "D0058C": 0,
            "D0058E": 0,
            "D00080": 0,
            "D0009F": 0,
            "D02A28": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 0,
            "D01150": 0,
            "D0059A": 0
          },
          "stackTop": [
            {
              "addr": 13738940,
              "value": 0
            },
            {
              "addr": 13738943,
              "value": 0
            },
            {
              "addr": 13738946,
              "value": 46
            },
            {
              "addr": 13738949,
              "value": 60122
            },
            {
              "addr": 13738952,
              "value": 11978
            },
            {
              "addr": 13738955,
              "value": 13739133
            },
            {
              "addr": 13738958,
              "value": 27790
            },
            {
              "addr": 13738961,
              "value": 16776960
            }
          ],
          "vram": 3039,
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
              "D0243D": 0,
              "D02A40": 0,
              "D02A28": 0
            }
          },
          "editLine": {
            "D007CA": 0,
            "D008E0": 0,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D00595": 4,
            "D00596": 19,
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
            "vramCurrent": 3039,
            "lastKey": null
          }
        },
        {
          "target": "low000A92",
          "block": 101945,
          "step": 101966,
          "pc": 2706,
          "prevPc": "0x000A92",
          "cpu": {
            "pc": 2706,
            "sp": 13738940,
            "af": 44322,
            "bc": 0,
            "de": 13739030,
            "hl": 165,
            "ix": 13738985,
            "iy": 13631616,
            "f": 34,
            "halted": false,
            "madl": 1,
            "stepCount": 101966
          },
          "fields": {
            "D007CA": 0,
            "D008E0": 0,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D02A40": 0,
            "D00595": 4,
            "D00596": 19,
            "D00587": 0,
            "D0058C": 0,
            "D0058E": 0,
            "D00080": 0,
            "D0009F": 0,
            "D02A28": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 0,
            "D01150": 0,
            "D0059A": 0
          },
          "stackTop": [
            {
              "addr": 13738940,
              "value": 0
            },
            {
              "addr": 13738943,
              "value": 0
            },
            {
              "addr": 13738946,
              "value": 46
            },
            {
              "addr": 13738949,
              "value": 60122
            },
            {
              "addr": 13738952,
              "value": 11978
            },
            {
              "addr": 13738955,
              "value": 13739133
            },
            {
              "addr": 13738958,
              "value": 27790
            },
            {
              "addr": 13738961,
              "value": 16776960
            }
          ],
          "vram": 3039,
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
              "D0243D": 0,
              "D02A40": 0,
              "D02A28": 0
            }
          },
          "editLine": {
            "D007CA": 0,
            "D008E0": 0,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D00595": 4,
            "D00596": 19,
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
            "vramCurrent": 3039,
            "lastKey": null
          }
        },
        {
          "target": "low000A92",
          "block": 101946,
          "step": 101967,
          "pc": 2706,
          "prevPc": "0x000A92",
          "cpu": {
            "pc": 2706,
            "sp": 13738940,
            "af": 45090,
            "bc": 0,
            "de": 13739031,
            "hl": 176,
            "ix": 13738985,
            "iy": 13631616,
            "f": 34,
            "halted": false,
            "madl": 1,
            "stepCount": 101967
          },
          "fields": {
            "D007CA": 0,
            "D008E0": 0,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D02A40": 0,
            "D00595": 4,
            "D00596": 19,
            "D00587": 0,
            "D0058C": 0,
            "D0058E": 0,
            "D00080": 0,
            "D0009F": 0,
            "D02A28": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 0,
            "D01150": 0,
            "D0059A": 0
          },
          "stackTop": [
            {
              "addr": 13738940,
              "value": 0
            },
            {
              "addr": 13738943,
              "value": 0
            },
            {
              "addr": 13738946,
              "value": 46
            },
            {
              "addr": 13738949,
              "value": 60122
            },
            {
              "addr": 13738952,
              "value": 11978
            },
            {
              "addr": 13738955,
              "value": 13739133
            },
            {
              "addr": 13738958,
              "value": 27790
            },
            {
              "addr": 13738961,
              "value": 16776960
            }
          ],
          "vram": 3039,
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
              "D0243D": 0,
              "D02A40": 0,
              "D02A28": 0
            }
          },
          "editLine": {
            "D007CA": 0,
            "D008E0": 0,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D00595": 4,
            "D00596": 19,
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
            "vramCurrent": 3039,
            "lastKey": null
          }
        },
        {
          "target": "low000A92",
          "block": 101947,
          "step": 101968,
          "pc": 2706,
          "prevPc": "0x000A92",
          "cpu": {
            "pc": 2706,
            "sp": 13738940,
            "af": 59426,
            "bc": 0,
            "de": 13739032,
            "hl": 173,
            "ix": 13738985,
            "iy": 13631616,
            "f": 34,
            "halted": false,
            "madl": 1,
            "stepCount": 101968
          },
          "fields": {
            "D007CA": 0,
            "D008E0": 0,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D02A40": 0,
            "D00595": 4,
            "D00596": 19,
            "D00587": 0,
            "D0058C": 0,
            "D0058E": 0,
            "D00080": 0,
            "D0009F": 0,
            "D02A28": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 0,
            "D01150": 0,
            "D0059A": 0
          },
          "stackTop": [
            {
              "addr": 13738940,
              "value": 0
            },
            {
              "addr": 13738943,
              "value": 0
            },
            {
              "addr": 13738946,
              "value": 46
            },
            {
              "addr": 13738949,
              "value": 60122
            },
            {
              "addr": 13738952,
              "value": 11978
            },
            {
              "addr": 13738955,
              "value": 13739133
            },
            {
              "addr": 13738958,
              "value": 27790
            },
            {
              "addr": 13738961,
              "value": 16776960
            }
          ],
          "vram": 3039,
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
              "D0243D": 0,
              "D02A40": 0,
              "D02A28": 0
            }
          },
          "editLine": {
            "D007CA": 0,
            "D008E0": 0,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D00595": 4,
            "D00596": 19,
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
            "vramCurrent": 3039,
            "lastKey": null
          }
        },
        {
          "target": "low000A92",
          "block": 101948,
          "step": 101969,
          "pc": 2706,
          "prevPc": "0x000A92",
          "cpu": {
            "pc": 2706,
            "sp": 13738940,
            "af": 58146,
            "bc": 0,
            "de": 13739033,
            "hl": 141,
            "ix": 13738985,
            "iy": 13631616,
            "f": 34,
            "halted": false,
            "madl": 1,
            "stepCount": 101969
          },
          "fields": {
            "D007CA": 0,
            "D008E0": 0,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D02A40": 0,
            "D00595": 4,
            "D00596": 19,
            "D00587": 0,
            "D0058C": 0,
            "D0058E": 0,
            "D00080": 0,
            "D0009F": 0,
            "D02A28": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 0,
            "D01150": 0,
            "D0059A": 0
          },
          "stackTop": [
            {
              "addr": 13738940,
              "value": 0
            },
            {
              "addr": 13738943,
              "value": 0
            },
            {
              "addr": 13738946,
              "value": 46
            },
            {
              "addr": 13738949,
              "value": 60122
            },
            {
              "addr": 13738952,
              "value": 11978
            },
            {
              "addr": 13738955,
              "value": 13739133
            },
            {
              "addr": 13738958,
              "value": 27790
            },
            {
              "addr": 13738961,
              "value": 16776960
            }
          ],
          "vram": 3039,
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
              "D0243D": 0,
              "D02A40": 0,
              "D02A28": 0
            }
          },
          "editLine": {
            "D007CA": 0,
            "D008E0": 0,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D00595": 4,
            "D00596": 19,
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
            "vramCurrent": 3039,
            "lastKey": null
          }
        },
        {
          "target": "low000A92",
          "block": 101949,
          "step": 101970,
          "pc": 2706,
          "prevPc": "0x000A92",
          "cpu": {
            "pc": 2706,
            "sp": 13738940,
            "af": 51490,
            "bc": 0,
            "de": 13739034,
            "hl": 237,
            "ix": 13738985,
            "iy": 13631616,
            "f": 34,
            "halted": false,
            "madl": 1,
            "stepCount": 101970
          },
          "fields": {
            "D007CA": 0,
            "D008E0": 0,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D02A40": 0,
            "D00595": 4,
            "D00596": 19,
            "D00587": 0,
            "D0058C": 0,
            "D0058E": 0,
            "D00080": 0,
            "D0009F": 0,
            "D02A28": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 0,
            "D01150": 0,
            "D0059A": 0
          },
          "stackTop": [
            {
              "addr": 13738940,
              "value": 0
            },
            {
              "addr": 13738943,
              "value": 0
            },
            {
              "addr": 13738946,
              "value": 46
            },
            {
              "addr": 13738949,
              "value": 60122
            },
            {
              "addr": 13738952,
              "value": 11978
            },
            {
              "addr": 13738955,
              "value": 13739133
            },
            {
              "addr": 13738958,
              "value": 27790
            },
            {
              "addr": 13738961,
              "value": 16776960
            }
          ],
          "vram": 3039,
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
              "D0243D": 0,
              "D02A40": 0,
              "D02A28": 0
            }
          },
          "editLine": {
            "D007CA": 0,
            "D008E0": 0,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D00595": 4,
            "D00596": 19,
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
            "vramCurrent": 3039,
            "lastKey": null
          }
        },
        {
          "target": "low000A92",
          "block": 101950,
          "step": 101971,
          "pc": 2706,
          "prevPc": "0x000A92",
          "cpu": {
            "pc": 2706,
            "sp": 13738940,
            "af": 22306,
            "bc": 0,
            "de": 13739035,
            "hl": 10,
            "ix": 13738985,
            "iy": 13631616,
            "f": 34,
            "halted": false,
            "madl": 1,
            "stepCount": 101971
          },
          "fields": {
            "D007CA": 0,
            "D008E0": 0,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D02A40": 0,
            "D00595": 4,
            "D00596": 19,
            "D00587": 0,
            "D0058C": 0,
            "D0058E": 0,
            "D00080": 0,
            "D0009F": 0,
            "D02A28": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 0,
            "D01150": 0,
            "D0059A": 0
          },
          "stackTop": [
            {
              "addr": 13738940,
              "value": 0
            },
            {
              "addr": 13738943,
              "value": 0
            },
            {
              "addr": 13738946,
              "value": 46
            },
            {
              "addr": 13738949,
              "value": 60122
            },
            {
              "addr": 13738952,
              "value": 11978
            },
            {
              "addr": 13738955,
              "value": 13739133
            },
            {
              "addr": 13738958,
              "value": 27790
            },
            {
              "addr": 13738961,
              "value": 16776960
            }
          ],
          "vram": 3039,
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
              "D0243D": 0,
              "D02A40": 0,
              "D02A28": 0
            }
          },
          "editLine": {
            "D007CA": 0,
            "D008E0": 0,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D00595": 4,
            "D00596": 19,
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
            "vramCurrent": 3039,
            "lastKey": null
          }
        },
        {
          "target": "low000A92",
          "block": 101951,
          "step": 101972,
          "pc": 2706,
          "prevPc": "0x000A92",
          "cpu": {
            "pc": 2706,
            "sp": 13738940,
            "af": 60706,
            "bc": 0,
            "de": 13739036,
            "hl": 17,
            "ix": 13738985,
            "iy": 13631616,
            "f": 34,
            "halted": false,
            "madl": 1,
            "stepCount": 101972
          },
          "fields": {
            "D007CA": 0,
            "D008E0": 0,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D02A40": 0,
            "D00595": 4,
            "D00596": 19,
            "D00587": 0,
            "D0058C": 0,
            "D0058E": 0,
            "D00080": 0,
            "D0009F": 0,
            "D02A28": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 0,
            "D01150": 0,
            "D0059A": 0
          },
          "stackTop": [
            {
              "addr": 13738940,
              "value": 0
            },
            {
              "addr": 13738943,
              "value": 0
            },
            {
              "addr": 13738946,
              "value": 46
            },
            {
              "addr": 13738949,
              "value": 60122
            },
            {
              "addr": 13738952,
              "value": 11978
            },
            {
              "addr": 13738955,
              "value": 13739133
            },
            {
              "addr": 13738958,
              "value": 27790
            },
            {
              "addr": 13738961,
              "value": 16776960
            }
          ],
          "vram": 3039,
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
              "D0243D": 0,
              "D02A40": 0,
              "D02A28": 0
            }
          },
          "editLine": {
            "D007CA": 0,
            "D008E0": 0,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D00595": 4,
            "D00596": 19,
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
            "vramCurrent": 3039,
            "lastKey": null
          }
        },
        {
          "target": "low000A92",
          "block": 101952,
          "step": 101973,
          "pc": 2706,
          "prevPc": "0x000A92",
          "cpu": {
            "pc": 2706,
            "sp": 13738940,
            "af": 11290,
            "bc": 0,
            "de": 13739037,
            "hl": 191,
            "ix": 13738985,
            "iy": 13631616,
            "f": 26,
            "halted": false,
            "madl": 1,
            "stepCount": 101973
          },
          "fields": {
            "D007CA": 0,
            "D008E0": 0,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D02A40": 0,
            "D00595": 4,
            "D00596": 19,
            "D00587": 0,
            "D0058C": 0,
            "D0058E": 0,
            "D00080": 0,
            "D0009F": 0,
            "D02A28": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 0,
            "D01150": 0,
            "D0059A": 0
          },
          "stackTop": [
            {
              "addr": 13738940,
              "value": 0
            },
            {
              "addr": 13738943,
              "value": 0
            },
            {
              "addr": 13738946,
              "value": 46
            },
            {
              "addr": 13738949,
              "value": 60122
            },
            {
              "addr": 13738952,
              "value": 11978
            },
            {
              "addr": 13738955,
              "value": 13739133
            },
            {
              "addr": 13738958,
              "value": 27790
            },
            {
              "addr": 13738961,
              "value": 16776960
            }
          ],
          "vram": 3039,
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
              "D0243D": 0,
              "D02A40": 0,
              "D02A28": 0
            }
          },
          "editLine": {
            "D007CA": 0,
            "D008E0": 0,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D00595": 4,
            "D00596": 19,
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
            "vramCurrent": 3039,
            "lastKey": null
          }
        },
        {
          "target": "low000A92",
          "block": 101953,
          "step": 101974,
          "pc": 2706,
          "prevPc": "0x000A92",
          "cpu": {
            "pc": 2706,
            "sp": 13738940,
            "af": 24074,
            "bc": 0,
            "de": 13739038,
            "hl": 135,
            "ix": 13738985,
            "iy": 13631616,
            "f": 10,
            "halted": false,
            "madl": 1,
            "stepCount": 101974
          },
          "fields": {
            "D007CA": 0,
            "D008E0": 0,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D02A40": 0,
            "D00595": 4,
            "D00596": 19,
            "D00587": 0,
            "D0058C": 0,
            "D0058E": 0,
            "D00080": 0,
            "D0009F": 0,
            "D02A28": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 0,
            "D01150": 0,
            "D0059A": 0
          },
          "stackTop": [
            {
              "addr": 13738940,
              "value": 0
            },
            {
              "addr": 13738943,
              "value": 0
            },
            {
              "addr": 13738946,
              "value": 46
            },
            {
              "addr": 13738949,
              "value": 60122
            },
            {
              "addr": 13738952,
              "value": 11978
            },
            {
              "addr": 13738955,
              "value": 13739133
            },
            {
              "addr": 13738958,
              "value": 27790
            },
            {
              "addr": 13738961,
              "value": 16776960
            }
          ],
          "vram": 3039,
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
              "D0243D": 0,
              "D02A40": 0,
              "D02A28": 0
            }
          },
          "editLine": {
            "D007CA": 0,
            "D008E0": 0,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D00595": 4,
            "D00596": 19,
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
            "vramCurrent": 3039,
            "lastKey": null
          }
        },
        {
          "target": "low000A92",
          "block": 101954,
          "step": 101975,
          "pc": 2706,
          "prevPc": "0x000A92",
          "cpu": {
            "pc": 2706,
            "sp": 13738940,
            "af": 42250,
            "bc": 0,
            "de": 13739039,
            "hl": 239,
            "ix": 13738985,
            "iy": 13631616,
            "f": 10,
            "halted": false,
            "madl": 1,
            "stepCount": 101975
          },
          "fields": {
            "D007CA": 0,
            "D008E0": 0,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D02A40": 0,
            "D00595": 4,
            "D00596": 19,
            "D00587": 0,
            "D0058C": 0,
            "D0058E": 0,
            "D00080": 0,
            "D0009F": 0,
            "D02A28": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 0,
            "D01150": 0,
            "D0059A": 0
          },
          "stackTop": [
            {
              "addr": 13738940,
              "value": 0
            },
            {
              "addr": 13738943,
              "value": 0
            },
            {
              "addr": 13738946,
              "value": 46
            },
            {
              "addr": 13738949,
              "value": 60122
            },
            {
              "addr": 13738952,
              "value": 11978
            },
            {
              "addr": 13738955,
              "value": 13739133
            },
            {
              "addr": 13738958,
              "value": 27790
            },
            {
              "addr": 13738961,
              "value": 16776960
            }
          ],
          "vram": 3039,
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
              "D0243D": 0,
              "D02A40": 0,
              "D02A28": 0
            }
          },
          "editLine": {
            "D007CA": 0,
            "D008E0": 0,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D00595": 4,
            "D00596": 19,
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
            "vramCurrent": 3039,
            "lastKey": null
          }
        },
        {
          "target": "low000A92",
          "block": 101955,
          "step": 101976,
          "pc": 2706,
          "prevPc": "0x000A92",
          "cpu": {
            "pc": 2706,
            "sp": 13738940,
            "af": 29706,
            "bc": 0,
            "de": 13739040,
            "hl": 201,
            "ix": 13738985,
            "iy": 13631616,
            "f": 10,
            "halted": false,
            "madl": 1,
            "stepCount": 101976
          },
          "fields": {
            "D007CA": 0,
            "D008E0": 0,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D02A40": 0,
            "D00595": 4,
            "D00596": 19,
            "D00587": 0,
            "D0058C": 0,
            "D0058E": 0,
            "D00080": 0,
            "D0009F": 0,
            "D02A28": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 0,
            "D01150": 0,
            "D0059A": 0
          },
          "stackTop": [
            {
              "addr": 13738940,
              "value": 0
            },
            {
              "addr": 13738943,
              "value": 0
            },
            {
              "addr": 13738946,
              "value": 46
            },
            {
              "addr": 13738949,
              "value": 60122
            },
            {
              "addr": 13738952,
              "value": 11978
            },
            {
              "addr": 13738955,
              "value": 13739133
            },
            {
              "addr": 13738958,
              "value": 27790
            },
            {
              "addr": 13738961,
              "value": 16776960
            }
          ],
          "vram": 3039,
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
              "D0243D": 0,
              "D02A40": 0,
              "D02A28": 0
            }
          },
          "editLine": {
            "D007CA": 0,
            "D008E0": 0,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D00595": 4,
            "D00596": 19,
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
            "vramCurrent": 3039,
            "lastKey": null
          }
        },
        {
          "target": "low000A92",
          "block": 101956,
          "step": 101977,
          "pc": 2706,
          "prevPc": "0x000A92",
          "cpu": {
            "pc": 2706,
            "sp": 13738940,
            "af": 58378,
            "bc": 0,
            "de": 13739041,
            "hl": 191,
            "ix": 13738985,
            "iy": 13631616,
            "f": 10,
            "halted": false,
            "madl": 1,
            "stepCount": 101977
          },
          "fields": {
            "D007CA": 0,
            "D008E0": 0,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D02A40": 0,
            "D00595": 4,
            "D00596": 19,
            "D00587": 0,
            "D0058C": 0,
            "D0058E": 0,
            "D00080": 0,
            "D0009F": 0,
            "D02A28": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 0,
            "D01150": 0,
            "D0059A": 0
          },
          "stackTop": [
            {
              "addr": 13738940,
              "value": 0
            },
            {
              "addr": 13738943,
              "value": 0
            },
            {
              "addr": 13738946,
              "value": 46
            },
            {
              "addr": 13738949,
              "value": 60122
            },
            {
              "addr": 13738952,
              "value": 11978
            },
            {
              "addr": 13738955,
              "value": 13739133
            },
            {
              "addr": 13738958,
              "value": 27790
            },
            {
              "addr": 13738961,
              "value": 16776960
            }
          ],
          "vram": 3039,
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
              "D0243D": 0,
              "D02A40": 0,
              "D02A28": 0
            }
          },
          "editLine": {
            "D007CA": 0,
            "D008E0": 0,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D00595": 4,
            "D00596": 19,
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
            "vramCurrent": 3039,
            "lastKey": null
          }
        },
        {
          "target": "low000A92",
          "block": 101957,
          "step": 101978,
          "pc": 2706,
          "prevPc": "0x000A92",
          "cpu": {
            "pc": 2706,
            "sp": 13738940,
            "af": 266,
            "bc": 0,
            "de": 13739042,
            "hl": 93,
            "ix": 13738985,
            "iy": 13631616,
            "f": 10,
            "halted": false,
            "madl": 1,
            "stepCount": 101978
          },
          "fields": {
            "D007CA": 0,
            "D008E0": 0,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D02A40": 0,
            "D00595": 4,
            "D00596": 19,
            "D00587": 0,
            "D0058C": 0,
            "D0058E": 0,
            "D00080": 0,
            "D0009F": 0,
            "D02A28": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 0,
            "D01150": 0,
            "D0059A": 0
          },
          "stackTop": [
            {
              "addr": 13738940,
              "value": 0
            },
            {
              "addr": 13738943,
              "value": 0
            },
            {
              "addr": 13738946,
              "value": 46
            },
            {
              "addr": 13738949,
              "value": 60122
            },
            {
              "addr": 13738952,
              "value": 11978
            },
            {
              "addr": 13738955,
              "value": 13739133
            },
            {
              "addr": 13738958,
              "value": 27790
            },
            {
              "addr": 13738961,
              "value": 16776960
            }
          ],
          "vram": 3039,
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
              "D0243D": 0,
              "D02A40": 0,
              "D02A28": 0
            }
          },
          "editLine": {
            "D007CA": 0,
            "D008E0": 0,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D00595": 4,
            "D00596": 19,
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
            "vramCurrent": 3039,
            "lastKey": null
          }
        },
        {
          "target": "low000A92",
          "block": 101958,
          "step": 101979,
          "pc": 2706,
          "prevPc": "0x000A92",
          "cpu": {
            "pc": 2706,
            "sp": 13738940,
            "af": 24330,
            "bc": 0,
            "de": 13739043,
            "hl": 32,
            "ix": 13738985,
            "iy": 13631616,
            "f": 10,
            "halted": false,
            "madl": 1,
            "stepCount": 101979
          },
          "fields": {
            "D007CA": 0,
            "D008E0": 0,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D02A40": 0,
            "D00595": 4,
            "D00596": 19,
            "D00587": 0,
            "D0058C": 0,
            "D0058E": 0,
            "D00080": 0,
            "D0009F": 0,
            "D02A28": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 0,
            "D01150": 0,
            "D0059A": 0
          },
          "stackTop": [
            {
              "addr": 13738940,
              "value": 0
            },
            {
              "addr": 13738943,
              "value": 0
            },
            {
              "addr": 13738946,
              "value": 46
            },
            {
              "addr": 13738949,
              "value": 60122
            },
            {
              "addr": 13738952,
              "value": 11978
            },
            {
              "addr": 13738955,
              "value": 13739133
            },
            {
              "addr": 13738958,
              "value": 27790
            },
            {
              "addr": 13738961,
              "value": 16776960
            }
          ],
          "vram": 3039,
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
              "D0243D": 0,
              "D02A40": 0,
              "D02A28": 0
            }
          },
          "editLine": {
            "D007CA": 0,
            "D008E0": 0,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D00595": 4,
            "D00596": 19,
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
            "vramCurrent": 3039,
            "lastKey": null
          }
        },
        {
          "target": "low000A92",
          "block": 101959,
          "step": 101980,
          "pc": 2706,
          "prevPc": "0x000A92",
          "cpu": {
            "pc": 2706,
            "sp": 13738940,
            "af": 26378,
            "bc": 0,
            "de": 13739044,
            "hl": 172,
            "ix": 13738985,
            "iy": 13631616,
            "f": 10,
            "halted": false,
            "madl": 1,
            "stepCount": 101980
          },
          "fields": {
            "D007CA": 0,
            "D008E0": 0,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D02A40": 0,
            "D00595": 4,
            "D00596": 19,
            "D00587": 0,
            "D0058C": 0,
            "D0058E": 0,
            "D00080": 0,
            "D0009F": 0,
            "D02A28": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 0,
            "D01150": 0,
            "D0059A": 0
          },
          "stackTop": [
            {
              "addr": 13738940,
              "value": 0
            },
            {
              "addr": 13738943,
              "value": 0
            },
            {
              "addr": 13738946,
              "value": 46
            },
            {
              "addr": 13738949,
              "value": 60122
            },
            {
              "addr": 13738952,
              "value": 11978
            },
            {
              "addr": 13738955,
              "value": 13739133
            },
            {
              "addr": 13738958,
              "value": 27790
            },
            {
              "addr": 13738961,
              "value": 16776960
            }
          ],
          "vram": 3039,
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
              "D0243D": 0,
              "D02A40": 0,
              "D02A28": 0
            }
          },
          "editLine": {
            "D007CA": 0,
            "D008E0": 0,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D00595": 4,
            "D00596": 19,
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
            "vramCurrent": 3039,
            "lastKey": null
          }
        },
        {
          "target": "low000A92",
          "block": 101960,
          "step": 101981,
          "pc": 2706,
          "prevPc": "0x000A92",
          "cpu": {
            "pc": 2706,
            "sp": 13738940,
            "af": 38402,
            "bc": 0,
            "de": 13739045,
            "hl": 130,
            "ix": 13738985,
            "iy": 13631616,
            "f": 2,
            "halted": false,
            "madl": 1,
            "stepCount": 101981
          },
          "fields": {
            "D007CA": 0,
            "D008E0": 0,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D02A40": 0,
            "D00595": 4,
            "D00596": 19,
            "D00587": 0,
            "D0058C": 0,
            "D0058E": 0,
            "D00080": 0,
            "D0009F": 0,
            "D02A28": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 0,
            "D01150": 0,
            "D0059A": 0
          },
          "stackTop": [
            {
              "addr": 13738940,
              "value": 0
            },
            {
              "addr": 13738943,
              "value": 0
            },
            {
              "addr": 13738946,
              "value": 46
            },
            {
              "addr": 13738949,
              "value": 60122
            },
            {
              "addr": 13738952,
              "value": 11978
            },
            {
              "addr": 13738955,
              "value": 13739133
            },
            {
              "addr": 13738958,
              "value": 27790
            },
            {
              "addr": 13738961,
              "value": 16776960
            }
          ],
          "vram": 3039,
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
              "D0243D": 0,
              "D02A40": 0,
              "D02A28": 0
            }
          },
          "editLine": {
            "D007CA": 0,
            "D008E0": 0,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D00595": 4,
            "D00596": 19,
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
            "vramCurrent": 3039,
            "lastKey": null
          }
        },
        {
          "target": "low000A92",
          "block": 101961,
          "step": 101982,
          "pc": 2706,
          "prevPc": "0x000A92",
          "cpu": {
            "pc": 2706,
            "sp": 13738940,
            "af": 53250,
            "bc": 0,
            "de": 13739046,
            "hl": 43,
            "ix": 13738985,
            "iy": 13631616,
            "f": 2,
            "halted": false,
            "madl": 1,
            "stepCount": 101982
          },
          "fields": {
            "D007CA": 0,
            "D008E0": 0,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D02A40": 0,
            "D00595": 4,
            "D00596": 19,
            "D00587": 0,
            "D0058C": 0,
            "D0058E": 0,
            "D00080": 0,
            "D0009F": 0,
            "D02A28": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 0,
            "D01150": 0,
            "D0059A": 0
          },
          "stackTop": [
            {
              "addr": 13738940,
              "value": 0
            },
            {
              "addr": 13738943,
              "value": 0
            },
            {
              "addr": 13738946,
              "value": 46
            },
            {
              "addr": 13738949,
              "value": 60122
            },
            {
              "addr": 13738952,
              "value": 11978
            },
            {
              "addr": 13738955,
              "value": 13739133
            },
            {
              "addr": 13738958,
              "value": 27790
            },
            {
              "addr": 13738961,
              "value": 16776960
            }
          ],
          "vram": 3039,
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
              "D0243D": 0,
              "D02A40": 0,
              "D02A28": 0
            }
          },
          "editLine": {
            "D007CA": 0,
            "D008E0": 0,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D00595": 4,
            "D00596": 19,
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
            "vramCurrent": 3039,
            "lastKey": null
          }
        },
        {
          "target": "low000A92",
          "block": 101962,
          "step": 101983,
          "pc": 2706,
          "prevPc": "0x000A92",
          "cpu": {
            "pc": 2706,
            "sp": 13738940,
            "af": 16898,
            "bc": 0,
            "de": 13739047,
            "hl": 127,
            "ix": 13738985,
            "iy": 13631616,
            "f": 2,
            "halted": false,
            "madl": 1,
            "stepCount": 101983
          },
          "fields": {
            "D007CA": 0,
            "D008E0": 0,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D02A40": 0,
            "D00595": 4,
            "D00596": 19,
            "D00587": 0,
            "D0058C": 0,
            "D0058E": 0,
            "D00080": 0,
            "D0009F": 0,
            "D02A28": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 0,
            "D01150": 0,
            "D0059A": 0
          },
          "stackTop": [
            {
              "addr": 13738940,
              "value": 0
            },
            {
              "addr": 13738943,
              "value": 0
            },
            {
              "addr": 13738946,
              "value": 46
            },
            {
              "addr": 13738949,
              "value": 60122
            },
            {
              "addr": 13738952,
              "value": 11978
            },
            {
              "addr": 13738955,
              "value": 13739133
            },
            {
              "addr": 13738958,
              "value": 27790
            },
            {
              "addr": 13738961,
              "value": 16776960
            }
          ],
          "vram": 3039,
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
              "D0243D": 0,
              "D02A40": 0,
              "D02A28": 0
            }
          },
          "editLine": {
            "D007CA": 0,
            "D008E0": 0,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D00595": 4,
            "D00596": 19,
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
            "vramCurrent": 3039,
            "lastKey": null
          }
        },
        {
          "target": "low000A92",
          "block": 101963,
          "step": 101984,
          "pc": 2706,
          "prevPc": "0x000A92",
          "cpu": {
            "pc": 2706,
            "sp": 13738940,
            "af": 46850,
            "bc": 0,
            "de": 13739048,
            "hl": 173,
            "ix": 13738985,
            "iy": 13631616,
            "f": 2,
            "halted": false,
            "madl": 1,
            "stepCount": 101984
          },
          "fields": {
            "D007CA": 0,
            "D008E0": 0,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D02A40": 0,
            "D00595": 4,
            "D00596": 19,
            "D00587": 0,
            "D0058C": 0,
            "D0058E": 0,
            "D00080": 0,
            "D0009F": 0,
            "D02A28": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 0,
            "D01150": 0,
            "D0059A": 0
          },
          "stackTop": [
            {
              "addr": 13738940,
              "value": 0
            },
            {
              "addr": 13738943,
              "value": 0
            },
            {
              "addr": 13738946,
              "value": 46
            },
            {
              "addr": 13738949,
              "value": 60122
            },
            {
              "addr": 13738952,
              "value": 11978
            },
            {
              "addr": 13738955,
              "value": 13739133
            },
            {
              "addr": 13738958,
              "value": 27790
            },
            {
              "addr": 13738961,
              "value": 16776960
            }
          ],
          "vram": 3039,
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
              "D0243D": 0,
              "D02A40": 0,
              "D02A28": 0
            }
          },
          "editLine": {
            "D007CA": 0,
            "D008E0": 0,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D00595": 4,
            "D00596": 19,
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
            "vramCurrent": 3039,
            "lastKey": null
          }
        },
        {
          "target": "low000A92",
          "block": 101964,
          "step": 101985,
          "pc": 2706,
          "prevPc": "0x000A92",
          "cpu": {
            "pc": 2706,
            "sp": 13738940,
            "af": 11266,
            "bc": 0,
            "de": 13739049,
            "hl": 105,
            "ix": 13738985,
            "iy": 13631616,
            "f": 2,
            "halted": false,
            "madl": 1,
            "stepCount": 101985
          },
          "fields": {
            "D007CA": 0,
            "D008E0": 0,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D02A40": 0,
            "D00595": 4,
            "D00596": 19,
            "D00587": 0,
            "D0058C": 0,
            "D0058E": 0,
            "D00080": 0,
            "D0009F": 0,
            "D02A28": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 0,
            "D01150": 0,
            "D0059A": 0
          },
          "stackTop": [
            {
              "addr": 13738940,
              "value": 0
            },
            {
              "addr": 13738943,
              "value": 0
            },
            {
              "addr": 13738946,
              "value": 46
            },
            {
              "addr": 13738949,
              "value": 60122
            },
            {
              "addr": 13738952,
              "value": 11978
            },
            {
              "addr": 13738955,
              "value": 13739133
            },
            {
              "addr": 13738958,
              "value": 27790
            },
            {
              "addr": 13738961,
              "value": 16776960
            }
          ],
          "vram": 3039,
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
              "D0243D": 0,
              "D02A40": 0,
              "D02A28": 0
            }
          },
          "editLine": {
            "D007CA": 0,
            "D008E0": 0,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D00595": 4,
            "D00596": 19,
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
            "vramCurrent": 3039,
            "lastKey": null
          }
        },
        {
          "target": "low000A92",
          "block": 101965,
          "step": 101986,
          "pc": 2706,
          "prevPc": "0x000A92",
          "cpu": {
            "pc": 2706,
            "sp": 13738940,
            "af": 55810,
            "bc": 0,
            "de": 13739050,
            "hl": 121,
            "ix": 13738985,
            "iy": 13631616,
            "f": 2,
            "halted": false,
            "madl": 1,
            "stepCount": 101986
          },
          "fields": {
            "D007CA": 0,
            "D008E0": 0,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D02A40": 0,
            "D00595": 4,
            "D00596": 19,
            "D00587": 0,
            "D0058C": 0,
            "D0058E": 0,
            "D00080": 0,
            "D0009F": 0,
            "D02A28": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 0,
            "D01150": 0,
            "D0059A": 0
          },
          "stackTop": [
            {
              "addr": 13738940,
              "value": 0
            },
            {
              "addr": 13738943,
              "value": 0
            },
            {
              "addr": 13738946,
              "value": 46
            },
            {
              "addr": 13738949,
              "value": 60122
            },
            {
              "addr": 13738952,
              "value": 11978
            },
            {
              "addr": 13738955,
              "value": 13739133
            },
            {
              "addr": 13738958,
              "value": 27790
            },
            {
              "addr": 13738961,
              "value": 16776960
            }
          ],
          "vram": 3039,
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
              "D0243D": 0,
              "D02A40": 0,
              "D02A28": 0
            }
          },
          "editLine": {
            "D007CA": 0,
            "D008E0": 0,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D00595": 4,
            "D00596": 19,
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
            "vramCurrent": 3039,
            "lastKey": null
          }
        },
        {
          "target": "low000A92",
          "block": 101966,
          "step": 101987,
          "pc": 2706,
          "prevPc": "0x000A92",
          "cpu": {
            "pc": 2706,
            "sp": 13738940,
            "af": 4098,
            "bc": 0,
            "de": 13739051,
            "hl": 7,
            "ix": 13738985,
            "iy": 13631616,
            "f": 2,
            "halted": false,
            "madl": 1,
            "stepCount": 101987
          },
          "fields": {
            "D007CA": 0,
            "D008E0": 0,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D02A40": 0,
            "D00595": 4,
            "D00596": 19,
            "D00587": 0,
            "D0058C": 0,
            "D0058E": 0,
            "D00080": 0,
            "D0009F": 0,
            "D02A28": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 0,
            "D01150": 0,
            "D0059A": 0
          },
          "stackTop": [
            {
              "addr": 13738940,
              "value": 0
            },
            {
              "addr": 13738943,
              "value": 0
            },
            {
              "addr": 13738946,
              "value": 46
            },
            {
              "addr": 13738949,
              "value": 60122
            },
            {
              "addr": 13738952,
              "value": 11978
            },
            {
              "addr": 13738955,
              "value": 13739133
            },
            {
              "addr": 13738958,
              "value": 27790
            },
            {
              "addr": 13738961,
              "value": 16776960
            }
          ],
          "vram": 3039,
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
              "D0243D": 0,
              "D02A40": 0,
              "D02A28": 0
            }
          },
          "editLine": {
            "D007CA": 0,
            "D008E0": 0,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D00595": 4,
            "D00596": 19,
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
            "vramCurrent": 3039,
            "lastKey": null
          }
        },
        {
          "target": "low000A92",
          "block": 101967,
          "step": 101988,
          "pc": 2706,
          "prevPc": "0x000A92",
          "cpu": {
            "pc": 2706,
            "sp": 13738940,
            "af": 48642,
            "bc": 0,
            "de": 13739052,
            "hl": 36,
            "ix": 13738985,
            "iy": 13631616,
            "f": 2,
            "halted": false,
            "madl": 1,
            "stepCount": 101988
          },
          "fields": {
            "D007CA": 0,
            "D008E0": 0,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D02A40": 0,
            "D00595": 4,
            "D00596": 19,
            "D00587": 0,
            "D0058C": 0,
            "D0058E": 0,
            "D00080": 0,
            "D0009F": 0,
            "D02A28": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 0,
            "D01150": 0,
            "D0059A": 0
          },
          "stackTop": [
            {
              "addr": 13738940,
              "value": 0
            },
            {
              "addr": 13738943,
              "value": 0
            },
            {
              "addr": 13738946,
              "value": 46
            },
            {
              "addr": 13738949,
              "value": 60122
            },
            {
              "addr": 13738952,
              "value": 11978
            },
            {
              "addr": 13738955,
              "value": 13739133
            },
            {
              "addr": 13738958,
              "value": 27790
            },
            {
              "addr": 13738961,
              "value": 16776960
            }
          ],
          "vram": 3039,
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
              "D0243D": 0,
              "D02A40": 0,
              "D02A28": 0
            }
          },
          "editLine": {
            "D007CA": 0,
            "D008E0": 0,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D00595": 4,
            "D00596": 19,
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
            "vramCurrent": 3039,
            "lastKey": null
          }
        },
        {
          "target": "low000A92",
          "block": 101968,
          "step": 101989,
          "pc": 2706,
          "prevPc": "0x000A92",
          "cpu": {
            "pc": 2706,
            "sp": 13738940,
            "af": 46874,
            "bc": 0,
            "de": 13739053,
            "hl": 183,
            "ix": 13738985,
            "iy": 13631616,
            "f": 26,
            "halted": false,
            "madl": 1,
            "stepCount": 101989
          },
          "fields": {
            "D007CA": 0,
            "D008E0": 0,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D02A40": 0,
            "D00595": 4,
            "D00596": 19,
            "D00587": 0,
            "D0058C": 0,
            "D0058E": 0,
            "D00080": 0,
            "D0009F": 0,
            "D02A28": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 0,
            "D01150": 0,
            "D0059A": 0
          },
          "stackTop": [
            {
              "addr": 13738940,
              "value": 0
            },
            {
              "addr": 13738943,
              "value": 0
            },
            {
              "addr": 13738946,
              "value": 46
            },
            {
              "addr": 13738949,
              "value": 60122
            },
            {
              "addr": 13738952,
              "value": 11978
            },
            {
              "addr": 13738955,
              "value": 13739133
            },
            {
              "addr": 13738958,
              "value": 27790
            },
            {
              "addr": 13738961,
              "value": 16776960
            }
          ],
          "vram": 3039,
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
              "D0243D": 0,
              "D02A40": 0,
              "D02A28": 0
            }
          },
          "editLine": {
            "D007CA": 0,
            "D008E0": 0,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D00595": 4,
            "D00596": 19,
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
            "vramCurrent": 3039,
            "lastKey": null
          }
        }
      ],
      "wipeSamples": [
        {
          "block": 11129,
          "pc": "0x0018F8",
          "prevPc": "0x001879",
          "ownerReturn": 5096,
          "ownerReturnHex": "0x0013E8",
          "beforeWipeCount": 0,
          "sample": {
            "block": 11129,
            "step": 11150,
            "pc": 6392,
            "prevPc": "0x001879",
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
              "stepCount": 11150
            },
            "fields": {
              "D007CA": 0,
              "D008E0": 0,
              "D0243A": 0,
              "D0243D": 0,
              "D02590": 0,
              "D02A40": 0,
              "D00595": 0,
              "D00596": 0,
              "D00587": 0,
              "D0058C": 0,
              "D0058E": 0,
              "D00080": 0,
              "D0009F": 0,
              "D02A28": 0,
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D01150": 0,
              "D0059A": 0
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
            "vram": 10861,
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
                "D0243D": 0,
                "D02A40": 0,
                "D02A28": 0
              }
            },
            "editLine": {
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
                "nonWhite": 456
              },
              "vramCurrent": 10861,
              "lastKey": null
            }
          }
        },
        {
          "block": 201257,
          "pc": "0x0018F8",
          "prevPc": "0x001879",
          "ownerReturn": 2146,
          "ownerReturnHex": "0x000862",
          "beforeWipeCount": 1,
          "sample": {
            "block": 201257,
            "step": 201278,
            "pc": 6392,
            "prevPc": "0x001879",
            "cpu": {
              "pc": 6392,
              "sp": 13740155,
              "af": 30208,
              "bc": 255,
              "de": 13893376,
              "hl": 13893375,
              "ix": 0,
              "iy": 13631616,
              "f": 0,
              "halted": false,
              "madl": 1,
              "stepCount": 201278
            },
            "fields": {
              "D007CA": 0,
              "D008E0": 0,
              "D0243A": 0,
              "D0243D": 0,
              "D02590": 0,
              "D02A40": 0,
              "D00595": 0,
              "D00596": 0,
              "D00587": 0,
              "D0058C": 0,
              "D0058E": 0,
              "D00080": 0,
              "D0009F": 0,
              "D02A28": 0,
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D01150": 0,
              "D0059A": 0
            },
            "stackTop": [
              {
                "addr": 13740155,
                "value": 2146
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
            "vram": 3337,
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
                "D0243D": 0,
                "D02A40": 0,
                "D02A28": 0
              }
            },
            "editLine": {
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
                "nonWhite": 421
              },
              "vramCurrent": 3337,
              "lastKey": null
            }
          }
        },
        {
          "block": 205689,
          "pc": "0x0018F8",
          "prevPc": "0x001879",
          "ownerReturn": 5096,
          "ownerReturnHex": "0x0013E8",
          "beforeWipeCount": 2,
          "sample": {
            "block": 205689,
            "step": 205721,
            "pc": 6392,
            "prevPc": "0x001879",
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
              "stepCount": 205721
            },
            "fields": {
              "D007CA": 0,
              "D008E0": 0,
              "D0243A": 0,
              "D0243D": 0,
              "D02590": 0,
              "D02A40": 0,
              "D00595": 0,
              "D00596": 0,
              "D00587": 0,
              "D0058C": 0,
              "D0058E": 0,
              "D00080": 0,
              "D0009F": 0,
              "D02A28": 0,
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D01150": 0,
              "D0059A": 0
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
            "vram": 108,
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
                "D0243D": 0,
                "D02A40": 0,
                "D02A28": 0
              }
            },
            "editLine": {
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
                "nonWhite": 72
              },
              "vramCurrent": 108,
              "lastKey": null
            }
          }
        }
      ],
      "firstWipe": {
        "block": 11129,
        "pc": "0x0018F8",
        "prevPc": "0x001879",
        "ownerReturn": 5096,
        "ownerReturnHex": "0x0013E8",
        "beforeWipeCount": 0,
        "sample": {
          "block": 11129,
          "step": 11150,
          "pc": 6392,
          "prevPc": "0x001879",
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
            "stepCount": 11150
          },
          "fields": {
            "D007CA": 0,
            "D008E0": 0,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D02A40": 0,
            "D00595": 0,
            "D00596": 0,
            "D00587": 0,
            "D0058C": 0,
            "D0058E": 0,
            "D00080": 0,
            "D0009F": 0,
            "D02A28": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 0,
            "D01150": 0,
            "D0059A": 0
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
          "vram": 10861,
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
              "D0243D": 0,
              "D02A40": 0,
              "D02A28": 0
            }
          },
          "editLine": {
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
              "nonWhite": 456
            },
            "vramCurrent": 10861,
            "lastKey": null
          }
        }
      },
      "firstZeroByField": {
        "D0243A": {
          "timing": "entry-vs-previous-block",
          "block": 4986,
          "pc": "0x0A31A2",
          "prevPc": "0x0A31E2",
          "before": 13740279,
          "after": 0,
          "fields": {
            "D0243A": 0,
            "D0243D": 0,
            "D007CA": 361961,
            "D02590": 0
          },
          "snapshot": {
            "block": 4986,
            "step": 4996,
            "pc": 668066,
            "prevPc": "0x0A31E2",
            "cpu": {
              "pc": 668066,
              "sp": 13740056,
              "af": 1664,
              "bc": 0,
              "de": 13635117,
              "hl": 13634317,
              "ix": 13640964,
              "iy": 13631616,
              "f": 128,
              "halted": false,
              "madl": 1,
              "stepCount": 4996
            },
            "fields": {
              "D007CA": 361961,
              "D008E0": 13740131,
              "D0243A": 0,
              "D0243D": 0,
              "D02590": 0,
              "D02A40": 0,
              "D00595": 0,
              "D00596": 25,
              "D00587": 0,
              "D0058C": 9,
              "D0058E": 0,
              "D00080": 0,
              "D0009F": 0,
              "D02A28": 0,
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 19974,
              "D01150": 0,
              "D0059A": 0
            },
            "stackTop": [
              {
                "addr": 13740056,
                "value": 64
              },
              {
                "addr": 13740059,
                "value": 668218
              },
              {
                "addr": 13740062,
                "value": 68
              },
              {
                "addr": 13740065,
                "value": 13740128
              },
              {
                "addr": 13740068,
                "value": 13640964
              },
              {
                "addr": 13740071,
                "value": 13632917
              },
              {
                "addr": 13740074,
                "value": 256
              },
              {
                "addr": 13740077,
                "value": 65336
              }
            ],
            "vram": 10825,
            "persistence": {
              "tokenGate": 0,
              "tokenA": 0,
              "tokenB": 0,
              "tuple": {
                "D02A29": 0,
                "D02A2B": 0,
                "D02A1B": 19974,
                "D0059A": 0,
                "D01150": 0,
                "D0243D": 0,
                "D02A40": 0,
                "D02A28": 0
              }
            },
            "editLine": {
              "D007CA": 361961,
              "D008E0": 13740131,
              "D0243A": 0,
              "D0243D": 0,
              "D02590": 0,
              "D00595": 0,
              "D00596": 25,
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
                "nonWhite": 420
              },
              "vramCurrent": 10825,
              "lastKey": null
            }
          }
        },
        "D0243D": {
          "timing": "entry-vs-previous-block",
          "block": 4986,
          "pc": "0x0A31A2",
          "prevPc": "0x0A31E2",
          "before": 13805629,
          "after": 0,
          "fields": {
            "D0243A": 0,
            "D0243D": 0,
            "D007CA": 361961,
            "D02590": 0
          },
          "snapshot": {
            "block": 4986,
            "step": 4996,
            "pc": 668066,
            "prevPc": "0x0A31E2",
            "cpu": {
              "pc": 668066,
              "sp": 13740056,
              "af": 1664,
              "bc": 0,
              "de": 13635117,
              "hl": 13634317,
              "ix": 13640964,
              "iy": 13631616,
              "f": 128,
              "halted": false,
              "madl": 1,
              "stepCount": 4996
            },
            "fields": {
              "D007CA": 361961,
              "D008E0": 13740131,
              "D0243A": 0,
              "D0243D": 0,
              "D02590": 0,
              "D02A40": 0,
              "D00595": 0,
              "D00596": 25,
              "D00587": 0,
              "D0058C": 9,
              "D0058E": 0,
              "D00080": 0,
              "D0009F": 0,
              "D02A28": 0,
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 19974,
              "D01150": 0,
              "D0059A": 0
            },
            "stackTop": [
              {
                "addr": 13740056,
                "value": 64
              },
              {
                "addr": 13740059,
                "value": 668218
              },
              {
                "addr": 13740062,
                "value": 68
              },
              {
                "addr": 13740065,
                "value": 13740128
              },
              {
                "addr": 13740068,
                "value": 13640964
              },
              {
                "addr": 13740071,
                "value": 13632917
              },
              {
                "addr": 13740074,
                "value": 256
              },
              {
                "addr": 13740077,
                "value": 65336
              }
            ],
            "vram": 10825,
            "persistence": {
              "tokenGate": 0,
              "tokenA": 0,
              "tokenB": 0,
              "tuple": {
                "D02A29": 0,
                "D02A2B": 0,
                "D02A1B": 19974,
                "D0059A": 0,
                "D01150": 0,
                "D0243D": 0,
                "D02A40": 0,
                "D02A28": 0
              }
            },
            "editLine": {
              "D007CA": 361961,
              "D008E0": 13740131,
              "D0243A": 0,
              "D0243D": 0,
              "D02590": 0,
              "D00595": 0,
              "D00596": 25,
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
                "nonWhite": 420
              },
              "vramCurrent": 10825,
              "lastKey": null
            }
          }
        },
        "D02590": {
          "timing": "entry-vs-previous-block",
          "block": 4986,
          "pc": "0x0A31A2",
          "prevPc": "0x0A31E2",
          "before": 13893249,
          "after": 0,
          "fields": {
            "D0243A": 0,
            "D0243D": 0,
            "D007CA": 361961,
            "D02590": 0
          },
          "snapshot": {
            "block": 4986,
            "step": 4996,
            "pc": 668066,
            "prevPc": "0x0A31E2",
            "cpu": {
              "pc": 668066,
              "sp": 13740056,
              "af": 1664,
              "bc": 0,
              "de": 13635117,
              "hl": 13634317,
              "ix": 13640964,
              "iy": 13631616,
              "f": 128,
              "halted": false,
              "madl": 1,
              "stepCount": 4996
            },
            "fields": {
              "D007CA": 361961,
              "D008E0": 13740131,
              "D0243A": 0,
              "D0243D": 0,
              "D02590": 0,
              "D02A40": 0,
              "D00595": 0,
              "D00596": 25,
              "D00587": 0,
              "D0058C": 9,
              "D0058E": 0,
              "D00080": 0,
              "D0009F": 0,
              "D02A28": 0,
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 19974,
              "D01150": 0,
              "D0059A": 0
            },
            "stackTop": [
              {
                "addr": 13740056,
                "value": 64
              },
              {
                "addr": 13740059,
                "value": 668218
              },
              {
                "addr": 13740062,
                "value": 68
              },
              {
                "addr": 13740065,
                "value": 13740128
              },
              {
                "addr": 13740068,
                "value": 13640964
              },
              {
                "addr": 13740071,
                "value": 13632917
              },
              {
                "addr": 13740074,
                "value": 256
              },
              {
                "addr": 13740077,
                "value": 65336
              }
            ],
            "vram": 10825,
            "persistence": {
              "tokenGate": 0,
              "tokenA": 0,
              "tokenB": 0,
              "tuple": {
                "D02A29": 0,
                "D02A2B": 0,
                "D02A1B": 19974,
                "D0059A": 0,
                "D01150": 0,
                "D0243D": 0,
                "D02A40": 0,
                "D02A28": 0
              }
            },
            "editLine": {
              "D007CA": 361961,
              "D008E0": 13740131,
              "D0243A": 0,
              "D0243D": 0,
              "D02590": 0,
              "D00595": 0,
              "D00596": 25,
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
                "nonWhite": 420
              },
              "vramCurrent": 10825,
              "lastKey": null
            }
          }
        },
        "D007CA": {
          "timing": "entry-vs-previous-block",
          "block": 11129,
          "pc": "0x0018F8",
          "prevPc": "0x001879",
          "before": 361961,
          "after": 0,
          "fields": {
            "D0243A": 0,
            "D0243D": 0,
            "D007CA": 0,
            "D02590": 0
          },
          "snapshot": {
            "block": 11129,
            "step": 11150,
            "pc": 6392,
            "prevPc": "0x001879",
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
              "stepCount": 11150
            },
            "fields": {
              "D007CA": 0,
              "D008E0": 0,
              "D0243A": 0,
              "D0243D": 0,
              "D02590": 0,
              "D02A40": 0,
              "D00595": 0,
              "D00596": 0,
              "D00587": 0,
              "D0058C": 0,
              "D0058E": 0,
              "D00080": 0,
              "D0009F": 0,
              "D02A28": 0,
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D01150": 0,
              "D0059A": 0
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
            "vram": 10861,
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
                "D0243D": 0,
                "D02A40": 0,
                "D02A28": 0
              }
            },
            "editLine": {
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
                "nonWhite": 456
              },
              "vramCurrent": 10861,
              "lastKey": null
            }
          }
        }
      },
      "firstAllZero": {
        "timing": "entry-vs-previous-block",
        "block": 11129,
        "pc": "0x0018F8",
        "prevPc": "0x001879",
        "before": {
          "D0243A": 0,
          "D0243D": 0,
          "D007CA": 361961,
          "D02590": 0
        },
        "after": {
          "D0243A": 0,
          "D0243D": 0,
          "D007CA": 0,
          "D02590": 0
        },
        "snapshot": {
          "block": 11129,
          "step": 11150,
          "pc": 6392,
          "prevPc": "0x001879",
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
            "stepCount": 11150
          },
          "fields": {
            "D007CA": 0,
            "D008E0": 0,
            "D0243A": 0,
            "D0243D": 0,
            "D02590": 0,
            "D02A40": 0,
            "D00595": 0,
            "D00596": 0,
            "D00587": 0,
            "D0058C": 0,
            "D0058E": 0,
            "D00080": 0,
            "D0009F": 0,
            "D02A28": 0,
            "D02A29": 0,
            "D02A2B": 0,
            "D02A1B": 0,
            "D01150": 0,
            "D0059A": 0
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
          "vram": 10861,
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
              "D0243D": 0,
              "D02A40": 0,
              "D02A28": 0
            }
          },
          "editLine": {
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
              "nonWhite": 456
            },
            "vramCurrent": 10861,
            "lastKey": null
          }
        }
      },
      "fieldTransitions": [],
      "lastWatchFields": {
        "D0243A": 0,
        "D0243D": 0,
        "D007CA": 0,
        "D02590": 0
      }
    }
  }
}
```

No runtime, transpiler, browser-shell, decoder, peripheral, scheduler, or ROM artifact files were changed.


# Phase 840 Browser EOL Post-Replay Loop Trace

Probe: `probe-phase840-browser-eol-post-replay-loop-trace.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase840-browser-eol-post-replay-loop-trace.mjs`

Serves an instrumented in-memory copy of `browser-shell.html`, boots coldboot with Preserve Display, injects the smallest Phase 836 reproducer (`D0243A=0xD1A8F8`), restores the Phase 839 pointer triple on entry to `0x0A31A2`, and stops once the downstream `0x0A1854` loop family is proven hot. The real shell file is not edited.

## Result

- Ran the single real-Chrome replay case requested for phase840: inject D0243A=0xD1A8F8, replay D0243A/D0243D/D02590 on entry to 0x0A31A2, then stop after the 0x0A1854 loop is hot.
- Replay point: replay_pointer_triple=0x0A31A2 after 0x0A31E2.
- Hot-loop evidence: replay_pointer_triple=first post-replay 0x0A1854 after 0x0A184A, threshold 0x0A1854 count=512.
- Outcomes: replay_pointer_triple=HOT_0A1854_LOOP (hot_0a1854_loop_threshold).

## Cases

| Case | Initial writes | Replay writes | Classification | Stop reason | Termination | Steps | Wipes | First pointer zero | Replay event | First wipe owner |
| --- | --- | --- | --- | --- | --- | ---: | ---: | --- | --- | --- |
| replay_pointer_triple | D0243A=0xD1A8F8 | D0243A=0xD1A8F7, D0243D=0xD2A83D, D02590=0xD3FE81 | HOT_0A1854_LOOP | hot_0a1854_loop_threshold | control_pre_stop | 16471 | 0 | 0x0A31A2 after 0x0A31E2 | 0x0A31A2 (D0243A=0xD1A8F7, D0243D=0xD2A83D, D007CA=0x0585E9, D02590=0xD3FE81) | - |

## Replay Events

| Case | # | Block | PC | Prev PC | Writes | Before watch fields | After watch fields |
| --- | ---: | ---: | --- | --- | --- | --- | --- |
| replay_pointer_triple | 1 | 4986 | 0x0A31A2 | 0x0A31E2 | D0243A=0xD1A8F7, D0243D=0xD2A83D, D02590=0xD3FE81 | D0243A=0x000000, D0243D=0x000000, D007CA=0x0585E9, D02590=0x000000 | D0243A=0xD1A8F7, D0243D=0xD2A83D, D007CA=0x0585E9, D02590=0xD3FE81 |

## Pointer Zeroes

| Case | Kind | Block | PC | Prev PC | Before | After |
| --- | --- | ---: | --- | --- | --- | --- |
| replay_pointer_triple | first | 4986 | 0x0A31A2 | 0x0A31E2 | D0243A=0xD1A8F7, D0243D=0xD2A83D, D007CA=0x0585E9, D02590=0xD3FE81 | D0243A=0x000000, D0243D=0x000000, D007CA=0x0585E9, D02590=0x000000 |

## Target Hits

| Case | Target | Hits |
| --- | --- | ---: |
| replay_pointer_triple | controlPreStop0A229D | 0 |
| replay_pointer_triple | engine08F54B | 0 |
| replay_pointer_triple | zeroPrev0A31E2 | 1 |
| replay_pointer_triple | zeroEntry0A31A2 | 1 |
| replay_pointer_triple | cleanup0018F8 | 0 |
| replay_pointer_triple | prewipe001879 | 0 |
| replay_pointer_triple | low000862 | 0 |
| replay_pointer_triple | low000A92 | 0 |
| replay_pointer_triple | low03D044 | 12 |
| replay_pointer_triple | caller058A16 | 0 |
| replay_pointer_triple | spaceFill0A2A37 | 9 |
| replay_pointer_triple | tokenOuter08F3B8 | 0 |
| replay_pointer_triple | hot0A1854 | 592 |
| replay_pointer_triple | hot0A187C | 591 |
| replay_pointer_triple | hot0A188A | 591 |
| replay_pointer_triple | hot0A189E | 591 |
| replay_pointer_triple | hot0A190D | 591 |
| replay_pointer_triple | hot0A191F | 591 |
| replay_pointer_triple | hot0A1939 | 591 |
| replay_pointer_triple | hot0A1969 | 591 |

## Wipes

| Case | # | Block | PC | Prev PC | Stack owner return | Prior wipe count | Fields |
| --- | ---: | ---: | --- | --- | --- | ---: | --- |
| - | - | - | - | - | - | - | - |

## Hot Loop

| Case | First post-replay hot-loop entry | Threshold hit | First-entry fields | Threshold/end fields |
| --- | --- | --- | --- | --- |
| replay_pointer_triple | 0x0A1854 after 0x0A184A | 0x0A1854 count=512 | D007CA=0x0585E9, D008E0=0xD1A863, D0243A=0xD1A8F7, D0243D=0xD2A83D, D02590=0xD3FE81, D02A40=0x000000, D00595=0x00, D00596=0x00, D00587=0x00, D0058C=0x00, D0058E=0x00, D00080=0x00, D0009F=0x04, D02A28=0x00, D02A29=0x000000, D02A2B=0x000000, D02A1B=0x004E06, D01150=0x000000, D0059A=0x00 | D007CA=0x0585E9, D008E0=0xD1A863, D0243A=0xD1A8D6, D0243D=0xD2A81C, D02590=0xD3FE81, D02A40=0x000000, D00595=0xFE, D00596=0x13, D00587=0x00, D0058C=0x00, D0058E=0x00, D00080=0x00, D0009F=0x04, D02A28=0x00, D02A29=0x000000, D02A2B=0x000000, D02A1B=0x004E06, D01150=0x000000, D0059A=0x00 |

## Full JSON

```json
{
  "probe": "phase840-browser-eol-post-replay-loop-trace",
  "chromePath": "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "pageUrl": "http://127.0.0.1:59353/browser-shell.html",
  "pass": true,
  "results": [
    {
      "name": "replay_pointer_triple",
      "label": "Replay D0243A/D0243D/D02590 and trace post-replay loop",
      "writes": [
        {
          "field": "D0243A",
          "value": 13740280
        }
      ],
      "replayWrites": [
        {
          "field": "D0243A",
          "value": 13740279
        },
        {
          "field": "D0243D",
          "value": 13805629
        },
        {
          "field": "D02590",
          "value": 13893249
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
        "classification": "HOT_0A1854_LOOP",
        "checks": {
          "code": true,
          "label": true,
          "controlPreStopPc": true,
          "controlPreStopLabel": true,
          "termination": true,
          "controlStopPc": false,
          "stoppedBeforeControlClear": false,
          "uiClearApplied": false,
          "noWipes": true,
          "D007CA": true,
          "D02590": true,
          "vramPreserved": true,
          "noPageErrors": true
        },
        "preStop0A229D": false,
        "engine08F54B": false,
        "tupleCoreSignal": false,
        "tupleDiffs": {
          "D02A1B": {
            "before": 0,
            "after": 19974
          },
          "D0243D": {
            "before": 13805630,
            "after": 13805596
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
        "status": "Key: CLEAR → 16471 steps (control_pre_stop, peak 10825px)",
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
          "steps": 16471,
          "termination": "control_pre_stop",
          "wipes": 0,
          "D0243A": 13740246,
          "D0243D": 13805596,
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
          "vramPeak": 10825,
          "vramCurrent": 8288
        },
        "diagnostics": {
          "D007CA": 361961,
          "D008E0": 13740131,
          "D0243A": 13740246,
          "D0243D": 13805596,
          "D02590": 13893249,
          "D00595": 254,
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
            "nonWhite": 432
          },
          "vramCurrent": 8288,
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
            "steps": 16471,
            "termination": "control_pre_stop",
            "wipes": 0,
            "D0243A": 13740246,
            "D0243D": 13805596,
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
            "vramPeak": 10825,
            "vramCurrent": 8288
          }
        },
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
            "D0243D": 13805596,
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
        "label": "Replay D0243A/D0243D/D02590 and trace post-replay loop",
        "caseConfig": {
          "replayWrites": [
            {
              "field": "D0243A",
              "value": 13740279
            },
            {
              "field": "D0243D",
              "value": 13805629
            },
            {
              "field": "D02590",
              "value": 13893249
            }
          ]
        },
        "replayWrites": [
          {
            "field": "D0243A",
            "value": 13740279
          },
          {
            "field": "D0243D",
            "value": 13805629
          },
          {
            "field": "D02590",
            "value": 13893249
          }
        ],
        "replayApplied": true,
        "replayEvents": [
          {
            "block": 4986,
            "pc": "0x0A31A2",
            "prevPc": "0x0A31E2",
            "before": {
              "D0243A": 0,
              "D0243D": 0,
              "D007CA": 361961,
              "D02590": 0
            },
            "replay": {
              "ok": true,
              "before": {
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
              "after": {
                "D007CA": 361961,
                "D008E0": 13740131,
                "D0243A": 13740279,
                "D0243D": 13805629,
                "D02590": 13893249,
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
              "writes": [
                {
                  "field": "D0243A",
                  "value": 13740279
                },
                {
                  "field": "D0243D",
                  "value": 13805629
                },
                {
                  "field": "D02590",
                  "value": 13893249
                }
              ]
            },
            "afterWatchFields": {
              "D0243A": 13740279,
              "D0243D": 13805629,
              "D007CA": 361961,
              "D02590": 13893249
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
                "D0243A": 13740279,
                "D0243D": 13805629,
                "D02590": 13893249,
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
                  "D0243D": 13805629,
                  "D02A40": 0,
                  "D02A28": 0
                }
              },
              "editLine": {
                "D007CA": 361961,
                "D008E0": 13740131,
                "D0243A": 13740279,
                "D0243D": 13805629,
                "D02590": 13893249,
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
          }
        ],
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
          "status": "Key: CLEAR → 16471 steps (control_pre_stop, peak 10825px)",
          "runtimeMode": "coldboot",
          "lastPc": 662045,
          "lastMode": "adl",
          "totalSteps": 654178,
          "cpu": {
            "pc": 661588,
            "sp": 13740077,
            "af": 65282,
            "bc": 16711941,
            "de": 40,
            "hl": 20440,
            "ix": 13632959,
            "iy": 13631616,
            "f": 2,
            "halted": false,
            "madl": 1,
            "stepCount": 16472
          },
          "fields": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740246,
            "D0243D": 13805596,
            "D02590": 13893249,
            "D02A40": 0,
            "D00595": 254,
            "D00596": 19,
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
              "addr": 13740077,
              "value": 13740128
            },
            {
              "addr": 13740080,
              "value": 659811
            },
            {
              "addr": 13740083,
              "value": 0
            },
            {
              "addr": 13740086,
              "value": 256
            },
            {
              "addr": 13740089,
              "value": 16130
            },
            {
              "addr": 13740092,
              "value": 666627
            },
            {
              "addr": 13740095,
              "value": 0
            },
            {
              "addr": 13740098,
              "value": 68
            }
          ],
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13740246,
            "D0243D": 13805596,
            "D02590": 13893249,
            "D00595": 254,
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
              "nonWhite": 432
            },
            "vramCurrent": 8288,
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
              "steps": 16471,
              "termination": "control_pre_stop",
              "wipes": 0,
              "D0243A": 13740246,
              "D0243D": 13805596,
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
              "vramPeak": 10825,
              "vramCurrent": 8288
            }
          },
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
              "D0243D": 13805596,
              "D02A40": 0,
              "D02A28": 0
            }
          },
          "vram": 8288,
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
            "steps": 16471,
            "termination": "control_pre_stop",
            "wipes": 0,
            "D0243A": 13740246,
            "D0243D": 13805596,
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
            "vramPeak": 10825,
            "vramCurrent": 8288
          },
          "pageErrors": []
        },
        "totalBlocks": 16460,
        "prevPc": "0x0A1A1D",
        "lastPcs": [
          {
            "block": 16341,
            "pc": "0x0A19D7",
            "prevPc": "0x0A19CC"
          },
          {
            "block": 16342,
            "pc": "0x0A1A1D",
            "prevPc": "0x0A19D7"
          },
          {
            "block": 16343,
            "pc": "0x0A1854",
            "prevPc": "0x0A1A1D"
          },
          {
            "block": 16344,
            "pc": "0x0A187C",
            "prevPc": "0x0A1854"
          },
          {
            "block": 16345,
            "pc": "0x0A188A",
            "prevPc": "0x0A187C"
          },
          {
            "block": 16346,
            "pc": "0x0A189E",
            "prevPc": "0x0A188A"
          },
          {
            "block": 16347,
            "pc": "0x0A190D",
            "prevPc": "0x0A189E"
          },
          {
            "block": 16348,
            "pc": "0x0A191F",
            "prevPc": "0x0A190D"
          },
          {
            "block": 16349,
            "pc": "0x0A1939",
            "prevPc": "0x0A191F"
          },
          {
            "block": 16350,
            "pc": "0x0A1969",
            "prevPc": "0x0A1939"
          },
          {
            "block": 16351,
            "pc": "0x0A1976",
            "prevPc": "0x0A1969"
          },
          {
            "block": 16352,
            "pc": "0x0A1980",
            "prevPc": "0x0A1976"
          },
          {
            "block": 16353,
            "pc": "0x0A19CC",
            "prevPc": "0x0A1980"
          },
          {
            "block": 16354,
            "pc": "0x0A19D7",
            "prevPc": "0x0A19CC"
          },
          {
            "block": 16355,
            "pc": "0x0A1A1D",
            "prevPc": "0x0A19D7"
          },
          {
            "block": 16356,
            "pc": "0x0A1854",
            "prevPc": "0x0A1A1D"
          },
          {
            "block": 16357,
            "pc": "0x0A187C",
            "prevPc": "0x0A1854"
          },
          {
            "block": 16358,
            "pc": "0x0A188A",
            "prevPc": "0x0A187C"
          },
          {
            "block": 16359,
            "pc": "0x0A189E",
            "prevPc": "0x0A188A"
          },
          {
            "block": 16360,
            "pc": "0x0A190D",
            "prevPc": "0x0A189E"
          },
          {
            "block": 16361,
            "pc": "0x0A191F",
            "prevPc": "0x0A190D"
          },
          {
            "block": 16362,
            "pc": "0x0A1939",
            "prevPc": "0x0A191F"
          },
          {
            "block": 16363,
            "pc": "0x0A1969",
            "prevPc": "0x0A1939"
          },
          {
            "block": 16364,
            "pc": "0x0A1976",
            "prevPc": "0x0A1969"
          },
          {
            "block": 16365,
            "pc": "0x0A1980",
            "prevPc": "0x0A1976"
          },
          {
            "block": 16366,
            "pc": "0x0A19CC",
            "prevPc": "0x0A1980"
          },
          {
            "block": 16367,
            "pc": "0x0A19D7",
            "prevPc": "0x0A19CC"
          },
          {
            "block": 16368,
            "pc": "0x0A1A1D",
            "prevPc": "0x0A19D7"
          },
          {
            "block": 16369,
            "pc": "0x0A1854",
            "prevPc": "0x0A1A1D"
          },
          {
            "block": 16370,
            "pc": "0x0A187C",
            "prevPc": "0x0A1854"
          },
          {
            "block": 16371,
            "pc": "0x0A188A",
            "prevPc": "0x0A187C"
          },
          {
            "block": 16372,
            "pc": "0x0A189E",
            "prevPc": "0x0A188A"
          },
          {
            "block": 16373,
            "pc": "0x0A190D",
            "prevPc": "0x0A189E"
          },
          {
            "block": 16374,
            "pc": "0x0A191F",
            "prevPc": "0x0A190D"
          },
          {
            "block": 16375,
            "pc": "0x0A1939",
            "prevPc": "0x0A191F"
          },
          {
            "block": 16376,
            "pc": "0x0A1969",
            "prevPc": "0x0A1939"
          },
          {
            "block": 16377,
            "pc": "0x0A1976",
            "prevPc": "0x0A1969"
          },
          {
            "block": 16378,
            "pc": "0x0A1980",
            "prevPc": "0x0A1976"
          },
          {
            "block": 16379,
            "pc": "0x0A19CC",
            "prevPc": "0x0A1980"
          },
          {
            "block": 16380,
            "pc": "0x0A19D7",
            "prevPc": "0x0A19CC"
          },
          {
            "block": 16381,
            "pc": "0x0A1A1D",
            "prevPc": "0x0A19D7"
          },
          {
            "block": 16382,
            "pc": "0x0A1854",
            "prevPc": "0x0A1A1D"
          },
          {
            "block": 16383,
            "pc": "0x0A187C",
            "prevPc": "0x0A1854"
          },
          {
            "block": 16384,
            "pc": "0x0A188A",
            "prevPc": "0x0A187C"
          },
          {
            "block": 16385,
            "pc": "0x0A189E",
            "prevPc": "0x0A188A"
          },
          {
            "block": 16386,
            "pc": "0x0A190D",
            "prevPc": "0x0A189E"
          },
          {
            "block": 16387,
            "pc": "0x0A191F",
            "prevPc": "0x0A190D"
          },
          {
            "block": 16388,
            "pc": "0x0A1939",
            "prevPc": "0x0A191F"
          },
          {
            "block": 16389,
            "pc": "0x0A1969",
            "prevPc": "0x0A1939"
          },
          {
            "block": 16390,
            "pc": "0x0A1976",
            "prevPc": "0x0A1969"
          },
          {
            "block": 16391,
            "pc": "0x0A1980",
            "prevPc": "0x0A1976"
          },
          {
            "block": 16392,
            "pc": "0x0A19CC",
            "prevPc": "0x0A1980"
          },
          {
            "block": 16393,
            "pc": "0x0A19D7",
            "prevPc": "0x0A19CC"
          },
          {
            "block": 16394,
            "pc": "0x0A1A1D",
            "prevPc": "0x0A19D7"
          },
          {
            "block": 16395,
            "pc": "0x0A1854",
            "prevPc": "0x0A1A1D"
          },
          {
            "block": 16396,
            "pc": "0x0A187C",
            "prevPc": "0x0A1854"
          },
          {
            "block": 16397,
            "pc": "0x0A188A",
            "prevPc": "0x0A187C"
          },
          {
            "block": 16398,
            "pc": "0x0A189E",
            "prevPc": "0x0A188A"
          },
          {
            "block": 16399,
            "pc": "0x0A190D",
            "prevPc": "0x0A189E"
          },
          {
            "block": 16400,
            "pc": "0x0A191F",
            "prevPc": "0x0A190D"
          },
          {
            "block": 16401,
            "pc": "0x0A1939",
            "prevPc": "0x0A191F"
          },
          {
            "block": 16402,
            "pc": "0x0A1969",
            "prevPc": "0x0A1939"
          },
          {
            "block": 16403,
            "pc": "0x0A1976",
            "prevPc": "0x0A1969"
          },
          {
            "block": 16404,
            "pc": "0x0A1980",
            "prevPc": "0x0A1976"
          },
          {
            "block": 16405,
            "pc": "0x0A19CC",
            "prevPc": "0x0A1980"
          },
          {
            "block": 16406,
            "pc": "0x0A19D7",
            "prevPc": "0x0A19CC"
          },
          {
            "block": 16407,
            "pc": "0x0A1A1D",
            "prevPc": "0x0A19D7"
          },
          {
            "block": 16408,
            "pc": "0x0A1854",
            "prevPc": "0x0A1A1D"
          },
          {
            "block": 16409,
            "pc": "0x0A187C",
            "prevPc": "0x0A1854"
          },
          {
            "block": 16410,
            "pc": "0x0A188A",
            "prevPc": "0x0A187C"
          },
          {
            "block": 16411,
            "pc": "0x0A189E",
            "prevPc": "0x0A188A"
          },
          {
            "block": 16412,
            "pc": "0x0A190D",
            "prevPc": "0x0A189E"
          },
          {
            "block": 16413,
            "pc": "0x0A191F",
            "prevPc": "0x0A190D"
          },
          {
            "block": 16414,
            "pc": "0x0A1939",
            "prevPc": "0x0A191F"
          },
          {
            "block": 16415,
            "pc": "0x0A1969",
            "prevPc": "0x0A1939"
          },
          {
            "block": 16416,
            "pc": "0x0A1976",
            "prevPc": "0x0A1969"
          },
          {
            "block": 16417,
            "pc": "0x0A1980",
            "prevPc": "0x0A1976"
          },
          {
            "block": 16418,
            "pc": "0x0A19CC",
            "prevPc": "0x0A1980"
          },
          {
            "block": 16419,
            "pc": "0x0A19D7",
            "prevPc": "0x0A19CC"
          },
          {
            "block": 16420,
            "pc": "0x0A1A1D",
            "prevPc": "0x0A19D7"
          },
          {
            "block": 16421,
            "pc": "0x0A1854",
            "prevPc": "0x0A1A1D"
          },
          {
            "block": 16422,
            "pc": "0x0A187C",
            "prevPc": "0x0A1854"
          },
          {
            "block": 16423,
            "pc": "0x0A188A",
            "prevPc": "0x0A187C"
          },
          {
            "block": 16424,
            "pc": "0x0A189E",
            "prevPc": "0x0A188A"
          },
          {
            "block": 16425,
            "pc": "0x0A190D",
            "prevPc": "0x0A189E"
          },
          {
            "block": 16426,
            "pc": "0x0A191F",
            "prevPc": "0x0A190D"
          },
          {
            "block": 16427,
            "pc": "0x0A1939",
            "prevPc": "0x0A191F"
          },
          {
            "block": 16428,
            "pc": "0x0A1969",
            "prevPc": "0x0A1939"
          },
          {
            "block": 16429,
            "pc": "0x0A1976",
            "prevPc": "0x0A1969"
          },
          {
            "block": 16430,
            "pc": "0x0A1980",
            "prevPc": "0x0A1976"
          },
          {
            "block": 16431,
            "pc": "0x0A19CC",
            "prevPc": "0x0A1980"
          },
          {
            "block": 16432,
            "pc": "0x0A19D7",
            "prevPc": "0x0A19CC"
          },
          {
            "block": 16433,
            "pc": "0x0A1A1D",
            "prevPc": "0x0A19D7"
          },
          {
            "block": 16434,
            "pc": "0x0A1854",
            "prevPc": "0x0A1A1D"
          },
          {
            "block": 16435,
            "pc": "0x0A187C",
            "prevPc": "0x0A1854"
          },
          {
            "block": 16436,
            "pc": "0x0A188A",
            "prevPc": "0x0A187C"
          },
          {
            "block": 16437,
            "pc": "0x0A189E",
            "prevPc": "0x0A188A"
          },
          {
            "block": 16438,
            "pc": "0x0A190D",
            "prevPc": "0x0A189E"
          },
          {
            "block": 16439,
            "pc": "0x0A191F",
            "prevPc": "0x0A190D"
          },
          {
            "block": 16440,
            "pc": "0x0A1939",
            "prevPc": "0x0A191F"
          },
          {
            "block": 16441,
            "pc": "0x0A1969",
            "prevPc": "0x0A1939"
          },
          {
            "block": 16442,
            "pc": "0x0A1976",
            "prevPc": "0x0A1969"
          },
          {
            "block": 16443,
            "pc": "0x0A1980",
            "prevPc": "0x0A1976"
          },
          {
            "block": 16444,
            "pc": "0x0A19CC",
            "prevPc": "0x0A1980"
          },
          {
            "block": 16445,
            "pc": "0x0A19D7",
            "prevPc": "0x0A19CC"
          },
          {
            "block": 16446,
            "pc": "0x0A1A1D",
            "prevPc": "0x0A19D7"
          },
          {
            "block": 16447,
            "pc": "0x0A1854",
            "prevPc": "0x0A1A1D"
          },
          {
            "block": 16448,
            "pc": "0x0A187C",
            "prevPc": "0x0A1854"
          },
          {
            "block": 16449,
            "pc": "0x0A188A",
            "prevPc": "0x0A187C"
          },
          {
            "block": 16450,
            "pc": "0x0A189E",
            "prevPc": "0x0A188A"
          },
          {
            "block": 16451,
            "pc": "0x0A190D",
            "prevPc": "0x0A189E"
          },
          {
            "block": 16452,
            "pc": "0x0A191F",
            "prevPc": "0x0A190D"
          },
          {
            "block": 16453,
            "pc": "0x0A1939",
            "prevPc": "0x0A191F"
          },
          {
            "block": 16454,
            "pc": "0x0A1969",
            "prevPc": "0x0A1939"
          },
          {
            "block": 16455,
            "pc": "0x0A1976",
            "prevPc": "0x0A1969"
          },
          {
            "block": 16456,
            "pc": "0x0A1980",
            "prevPc": "0x0A1976"
          },
          {
            "block": 16457,
            "pc": "0x0A19CC",
            "prevPc": "0x0A1980"
          },
          {
            "block": 16458,
            "pc": "0x0A19D7",
            "prevPc": "0x0A19CC"
          },
          {
            "block": 16459,
            "pc": "0x0A1A1D",
            "prevPc": "0x0A19D7"
          },
          {
            "block": 16460,
            "pc": "0x0A1854",
            "prevPc": "0x0A1A1D"
          }
        ],
        "hotBlocks": {
          "0x08C331": 1,
          "0x05C634": 3,
          "0x000038": 13,
          "0x0006F3": 13,
          "0x000704": 13,
          "0x000710": 13,
          "0x001713": 13,
          "0x0008BB": 13,
          "0x001717": 13,
          "0x001718": 13,
          "0x00171E": 13,
          "0x0067F8": 13,
          "0x001C4F": 26,
          "0x001CA6": 78,
          "0x001CC0": 78,
          "0x001CCA": 78,
          "0x001CCE": 13,
          "0x001CD5": 13,
          "0x001CE5": 13,
          "0x001C54": 26,
          "0x006808": 13,
          "0x001C33": 65,
          "0x001C38": 65,
          "0x001C3C": 65,
          "0x001C44": 52,
          "0x001C7D": 52,
          "0x001CE4": 65,
          "0x001C81": 52,
          "0x001C82": 52,
          "0x001C48": 52,
          "0x001C42": 13,
          "0x006810": 13,
          "0x006812": 13,
          "0x006816": 13,
          "0x00681E": 13,
          "0x006828": 13,
          "0x001727": 13,
          "0x000719": 13,
          "0x00071D": 13,
          "0x02010C": 13,
          "0x03CF7D": 13,
          "0x03CFA4": 13,
          "0x03CFCF": 13,
          "0x03CFD4": 12,
          "0x03CFDB": 12,
          "0x03CFE0": 12,
          "0x03CFE5": 12,
          "0x03CFEA": 12,
          "0x03D029": 12,
          "0x03D033": 12,
          "0x03D038": 12,
          "0x03D044": 12,
          "0x03D04C": 12,
          "0x03D054": 12,
          "0x03F994": 12,
          "0x0003D4": 12,
          "0x003CC2": 12,
          "0x003CD4": 12,
          "0x003CE0": 12,
          "0x003CEE": 12,
          "0x003CF3": 12,
          "0x03F998": 12,
          "0x03F99A": 12,
          "0x03F9AB": 12,
          "0x03F9AE": 12,
          "0x03D058": 12,
          "0x03D060": 12,
          "0x03D0E0": 13,
          "0x05C67C": 3,
          "0x08C339": 1,
          "0x06CE73": 1,
          "0x06CE7F": 1,
          "0x06CE7B": 1,
          "0x06C8AB": 1,
          "0x08C33D": 2,
          "0x0A349A": 2,
          "0x0A349F": 2,
          "0x0A32F9": 4,
          "0x0A3301": 2,
          "0x08C308": 5,
          "0x0A331E": 4,
          "0x0A336F": 4,
          "0x0A3383": 4,
          "0x0A338A": 4,
          "0x0A33FB": 16,
          "0x0A3408": 96,
          "0x0A3404": 96,
          "0x0A340F": 32,
          "0x0A3392": 4,
          "0x0A339A": 4,
          "0x0A33E6": 16,
          "0x0A33FF": 16,
          "0x0A33EE": 16,
          "0x0A3403": 16,
          "0x0A33A2": 4,
          "0x0A33AA": 4,
          "0x0A33B2": 4,
          "0x0A33BA": 4,
          "0x0A33C2": 4,
          "0x0A33CA": 4,
          "0x0A33DA": 4,
          "0x0A33E4": 2,
          "0x0A34AE": 2,
          "0x08C341": 2,
          "0x05C75B": 2,
          "0x05C760": 2,
          "0x05C768": 2,
          "0x05C771": 3,
          "0x05C795": 3,
          "0x05C7A5": 3,
          "0x05C7AD": 3,
          "0x05C7B5": 3,
          "0x05C7C1": 3,
          "0x05C7D7": 3,
          "0x05C7DD": 2,
          "0x05C7ED": 2,
          "0x05C815": 2,
          "0x0A237E": 7,
          "0x0A2A37": 9,
          "0x0A2389": 7,
          "0x05C819": 2,
          "0x05C82C": 3,
          "0x05C832": 3,
          "0x05E3D6": 3,
          "0x04C973": 74,
          "0x05C836": 3,
          "0x05C84D": 3,
          "0x05CA44": 3,
          "0x05CA4E": 3,
          "0x05CA57": 3,
          "0x05C851": 3,
          "0x05CBC0": 3,
          "0x05CBC3": 3,
          "0x05CBC9": 3,
          "0x05C855": 3,
          "0x05C875": 3,
          "0x05C87E": 3,
          "0x0A1799": 37,
          "0x0A17AA": 5,
          "0x0A17AE": 5,
          "0x0A17B2": 35,
          "0x0A17B8": 35,
          "0x07BF3E": 37,
          "0x07BF4D": 37,
          "0x07BF5C": 37,
          "0x000380": 37,
          "0x003D85": 37,
          "0x07BF61": 37,
          "0x0A17C5": 37,
          "0x0A2D4C": 39,
          "0x0A17D0": 37,
          "0x00038C": 37,
          "0x005A53": 37,
          "0x0A17E9": 37,
          "0x0A17EF": 37,
          "0x0A17F7": 37,
          "0x0A1805": 37,
          "0x0A180B": 5,
          "0x0A1838": 5,
          "0x0A1A8F": 5,
          "0x0A183D": 5,
          "0x0A184A": 37,
          "0x0A1854": 592,
          "0x0A187C": 591,
          "0x0A188A": 591,
          "0x0A189E": 591,
          "0x0A18A6": 80,
          "0x0A1A83": 160,
          "0x0A18AF": 80,
          "0x0A18C1": 80,
          "0x0A18C4": 80,
          "0x0A18CA": 80,
          "0x0A18E9": 80,
          "0x0A18EB": 80,
          "0x0A190D": 591,
          "0x0A191F": 591,
          "0x0A1939": 591,
          "0x0A1969": 591,
          "0x0A1976": 591,
          "0x0A1980": 591,
          "0x0A1988": 80,
          "0x0A1994": 80,
          "0x0A19A4": 560,
          "0x0A19AA": 80,
          "0x0A19B5": 80,
          "0x0A19B7": 80,
          "0x0A19D7": 591,
          "0x0A1A1D": 591,
          "0x0A1A30": 36,
          "0x05C883": 3,
          "0x08C345": 2,
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
          "0x0A32FF": 2,
          "0x0A3411": 48,
          "0x0A3418": 16,
          "0x03D1D1": 2,
          "0x0A27F9": 2,
          "0x0A1A36": 2,
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
          "0x0158A6": 3,
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
          "0x08C73D": 1,
          "0x08C53A": 1,
          "0x08C543": 1,
          "0x08C593": 1,
          "0x08C359": 1,
          "0x02FCB3": 1,
          "0x02FCB9": 1,
          "0x02FD8F": 1,
          "0x02FDA6": 1,
          "0x03013A": 1,
          "0x03013F": 1,
          "0x030145": 1,
          "0x03014B": 1,
          "0x030151": 1,
          "0x030157": 1,
          "0x02FDAC": 1,
          "0x05C76C": 1,
          "0x05C81E": 1,
          "0x02FDB6": 1,
          "0x03FA09": 1,
          "0x05C623": 2,
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
          "0x05E3F5": 1,
          "0x05E3E7": 1,
          "0x05E3E8": 35,
          "0x058221": 1,
          "0x058A14": 1,
          "0x058A2C": 1,
          "0x058A30": 1,
          "0x058A4C": 1,
          "0x05E7CD": 34,
          "0x05E242": 34,
          "0x05E246": 34,
          "0x05E247": 34,
          "0x05E3EC": 34,
          "0x05E24C": 34,
          "0x05E250": 34,
          "0x080064": 34,
          "0x05E256": 34,
          "0x05E26C": 34,
          "0x05E7D1": 34,
          "0x05E7D2": 34,
          "0x0A2B72": 34,
          "0x0A2A68": 34,
          "0x0A2AF9": 34,
          "0x0A2B16": 34,
          "0x0A2B51": 34,
          "0x0A2B7E": 34,
          "0x0A2B8F": 34,
          "0x0A2BEB": 34,
          "0x0A2C0C": 3,
          "0x0A2C10": 3,
          "0x0A20CC": 3,
          "0x0A20E4": 3,
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
          "0x03CFFE": 1,
          "0x0A20EE": 1,
          "0x0A20F1": 1,
          "0x0A2C16": 3,
          "0x0A2BFD": 1,
          "0x0A17AF": 32,
          "0x0A1842": 32,
          "0x0A19CC": 511,
          "0x0A2C03": 31,
          "0x0A2C05": 31,
          "0x05E7D6": 33,
          "0x0A20F0": 2,
          "0x0A2C25": 2,
          "0x0A2C08": 2,
          "0x0A2BF6": 31,
          "0x0A2BF9": 31,
          "0x005A60": 6
        },
        "topHotBlocks": [
          {
            "pc": "0x09EFDE",
            "count": 2880
          },
          {
            "pc": "0x0A1854",
            "count": 592
          },
          {
            "pc": "0x0A187C",
            "count": 591
          },
          {
            "pc": "0x0A188A",
            "count": 591
          },
          {
            "pc": "0x0A189E",
            "count": 591
          },
          {
            "pc": "0x0A190D",
            "count": 591
          },
          {
            "pc": "0x0A191F",
            "count": 591
          },
          {
            "pc": "0x0A1939",
            "count": 591
          },
          {
            "pc": "0x0A1969",
            "count": 591
          },
          {
            "pc": "0x0A1976",
            "count": 591
          },
          {
            "pc": "0x0A1980",
            "count": 591
          },
          {
            "pc": "0x0A19D7",
            "count": 591
          },
          {
            "pc": "0x0A1A1D",
            "count": 591
          },
          {
            "pc": "0x0A19A4",
            "count": 560
          },
          {
            "pc": "0x0A19CC",
            "count": 511
          },
          {
            "pc": "0x0A1A83",
            "count": 160
          },
          {
            "pc": "0x0A3408",
            "count": 96
          },
          {
            "pc": "0x0A3404",
            "count": 96
          },
          {
            "pc": "0x0A18A6",
            "count": 80
          },
          {
            "pc": "0x0A18AF",
            "count": 80
          },
          {
            "pc": "0x0A18C1",
            "count": 80
          },
          {
            "pc": "0x0A18C4",
            "count": 80
          },
          {
            "pc": "0x0A18CA",
            "count": 80
          },
          {
            "pc": "0x0A18E9",
            "count": 80
          },
          {
            "pc": "0x0A18EB",
            "count": 80
          },
          {
            "pc": "0x0A1988",
            "count": 80
          },
          {
            "pc": "0x0A1994",
            "count": 80
          },
          {
            "pc": "0x0A19AA",
            "count": 80
          },
          {
            "pc": "0x0A19B5",
            "count": 80
          },
          {
            "pc": "0x0A19B7",
            "count": 80
          },
          {
            "pc": "0x001CA6",
            "count": 78
          },
          {
            "pc": "0x001CC0",
            "count": 78
          },
          {
            "pc": "0x001CCA",
            "count": 78
          },
          {
            "pc": "0x04C973",
            "count": 74
          },
          {
            "pc": "0x001C33",
            "count": 65
          },
          {
            "pc": "0x001C38",
            "count": 65
          },
          {
            "pc": "0x001C3C",
            "count": 65
          },
          {
            "pc": "0x001CE4",
            "count": 65
          },
          {
            "pc": "0x001C44",
            "count": 52
          },
          {
            "pc": "0x001C7D",
            "count": 52
          }
        ],
        "targetCounts": {
          "controlPreStop0A229D": 0,
          "engine08F54B": 0,
          "zeroPrev0A31E2": 1,
          "zeroEntry0A31A2": 1,
          "cleanup0018F8": 0,
          "prewipe001879": 0,
          "low000862": 0,
          "low000A92": 0,
          "low03D044": 12,
          "caller058A16": 0,
          "spaceFill0A2A37": 9,
          "tokenOuter08F3B8": 0,
          "hot0A1854": 592,
          "hot0A187C": 591,
          "hot0A188A": 591,
          "hot0A189E": 591,
          "hot0A190D": 591,
          "hot0A191F": 591,
          "hot0A1939": 591,
          "hot0A1969": 591
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
          "hot0A1854": {
            "block": 412,
            "step": 413,
            "pc": 661588,
            "prevPc": "0x0A184A",
            "cpu": {
              "pc": 661588,
              "sp": 13740095,
              "af": 84,
              "bc": 16716028,
              "de": 13644278,
              "hl": 13644558,
              "ix": 13632929,
              "iy": 13631616,
              "f": 84,
              "halted": false,
              "madl": 1,
              "stepCount": 413
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
              },
              {
                "addr": 13740104,
                "value": 57344
              },
              {
                "addr": 13740107,
                "value": 57412
              },
              {
                "addr": 13740110,
                "value": 379011
              },
              {
                "addr": 13740113,
                "value": 0
              },
              {
                "addr": 13740116,
                "value": 13740128
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
          "hot0A187C": {
            "block": 413,
            "step": 414,
            "pc": 661628,
            "prevPc": "0x0A1854",
            "cpu": {
              "pc": 661628,
              "sp": 13740095,
              "af": 84,
              "bc": 16716028,
              "de": 640,
              "hl": 13917316,
              "ix": 13632930,
              "iy": 13631616,
              "f": 84,
              "halted": false,
              "madl": 1,
              "stepCount": 414
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
              },
              {
                "addr": 13740104,
                "value": 57344
              },
              {
                "addr": 13740107,
                "value": 57412
              },
              {
                "addr": 13740110,
                "value": 379011
              },
              {
                "addr": 13740113,
                "value": 0
              },
              {
                "addr": 13740116,
                "value": 13740128
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
          "hot0A188A": {
            "block": 414,
            "step": 415,
            "pc": 661642,
            "prevPc": "0x0A187C",
            "cpu": {
              "pc": 661642,
              "sp": 13740095,
              "af": 84,
              "bc": 16716028,
              "de": 640,
              "hl": 13917316,
              "ix": 13632930,
              "iy": 13631616,
              "f": 84,
              "halted": false,
              "madl": 1,
              "stepCount": 415
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
              },
              {
                "addr": 13740104,
                "value": 57344
              },
              {
                "addr": 13740107,
                "value": 57412
              },
              {
                "addr": 13740110,
                "value": 379011
              },
              {
                "addr": 13740113,
                "value": 0
              },
              {
                "addr": 13740116,
                "value": 13740128
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
          "hot0A189E": {
            "block": 415,
            "step": 416,
            "pc": 661662,
            "prevPc": "0x0A188A",
            "cpu": {
              "pc": 661662,
              "sp": 13740092,
              "af": 1364,
              "bc": 16715781,
              "de": 640,
              "hl": 13917316,
              "ix": 13632930,
              "iy": 13631616,
              "f": 84,
              "halted": false,
              "madl": 1,
              "stepCount": 416
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
                "addr": 13740092,
                "value": 16715781
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
              },
              {
                "addr": 13740104,
                "value": 57344
              },
              {
                "addr": 13740107,
                "value": 57412
              },
              {
                "addr": 13740110,
                "value": 379011
              },
              {
                "addr": 13740113,
                "value": 0
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
          "hot0A190D": {
            "block": 424,
            "step": 425,
            "pc": 661773,
            "prevPc": "0x0A18EB",
            "cpu": {
              "pc": 661773,
              "sp": 13740092,
              "af": 1809,
              "bc": 16711680,
              "de": 13644558,
              "hl": 13642353,
              "ix": 13632930,
              "iy": 13631616,
              "f": 17,
              "halted": false,
              "madl": 1,
              "stepCount": 425
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
                "addr": 13740092,
                "value": 16715781
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
              },
              {
                "addr": 13740104,
                "value": 57344
              },
              {
                "addr": 13740107,
                "value": 57412
              },
              {
                "addr": 13740110,
                "value": 379011
              },
              {
                "addr": 13740113,
                "value": 0
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
          "hot0A191F": {
            "block": 425,
            "step": 426,
            "pc": 661791,
            "prevPc": "0x0A190D",
            "cpu": {
              "pc": 661791,
              "sp": 13740092,
              "af": 85,
              "bc": 16712960,
              "de": 13644558,
              "hl": 13917316,
              "ix": 13632930,
              "iy": 13631616,
              "f": 85,
              "halted": false,
              "madl": 1,
              "stepCount": 426
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
                "addr": 13740092,
                "value": 16715781
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
              },
              {
                "addr": 13740104,
                "value": 57344
              },
              {
                "addr": 13740107,
                "value": 57412
              },
              {
                "addr": 13740110,
                "value": 379011
              },
              {
                "addr": 13740113,
                "value": 0
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
          "hot0A1939": {
            "block": 426,
            "step": 427,
            "pc": 661817,
            "prevPc": "0x0A191F",
            "cpu": {
              "pc": 661817,
              "sp": 13740092,
              "af": 85,
              "bc": 16712960,
              "de": 255,
              "hl": 13917316,
              "ix": 13632930,
              "iy": 13631616,
              "f": 85,
              "halted": false,
              "madl": 1,
              "stepCount": 427
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
                "addr": 13740092,
                "value": 16715781
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
              },
              {
                "addr": 13740104,
                "value": 57344
              },
              {
                "addr": 13740107,
                "value": 57412
              },
              {
                "addr": 13740110,
                "value": 379011
              },
              {
                "addr": 13740113,
                "value": 0
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
          "hot0A1969": {
            "block": 427,
            "step": 428,
            "pc": 661865,
            "prevPc": "0x0A1939",
            "cpu": {
              "pc": 661865,
              "sp": 13740092,
              "af": 65448,
              "bc": 16712960,
              "de": 255,
              "hl": 13917326,
              "ix": 13632930,
              "iy": 13631616,
              "f": 168,
              "halted": false,
              "madl": 1,
              "stepCount": 428
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
                "addr": 13740092,
                "value": 16715781
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
              },
              {
                "addr": 13740104,
                "value": 57344
              },
              {
                "addr": 13740107,
                "value": 57412
              },
              {
                "addr": 13740110,
                "value": 379011
              },
              {
                "addr": 13740113,
                "value": 0
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
          "zeroPrev0A31E2": {
            "block": 4985,
            "step": 4995,
            "pc": 668130,
            "prevPc": "0x0A31B8",
            "cpu": {
              "pc": 668130,
              "sp": 13740053,
              "af": 1620,
              "bc": 60436,
              "de": 13644278,
              "hl": 279,
              "ix": 13640964,
              "iy": 13631616,
              "f": 84,
              "halted": false,
              "madl": 1,
              "stepCount": 4995
            },
            "fields": {
              "D007CA": 361961,
              "D008E0": 13740131,
              "D0243A": 13740279,
              "D0243D": 13805629,
              "D02590": 13893249,
              "D02A40": 13805630,
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
              "D02A1B": 0,
              "D01150": 0,
              "D0059A": 0
            },
            "stackTop": [
              {
                "addr": 13740053,
                "value": 800
              },
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
                "D02A1B": 0,
                "D0059A": 0,
                "D01150": 0,
                "D0243D": 13805629,
                "D02A40": 13805630,
                "D02A28": 0
              }
            },
            "editLine": {
              "D007CA": 361961,
              "D008E0": 13740131,
              "D0243A": 13740279,
              "D0243D": 13805629,
              "D02590": 13893249,
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
          },
          "zeroEntry0A31A2": {
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
              "D0243A": 13740279,
              "D0243D": 13805629,
              "D02590": 13893249,
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
                "D0243D": 13805629,
                "D02A40": 0,
                "D02A28": 0
              }
            },
            "editLine": {
              "D007CA": 361961,
              "D008E0": 13740131,
              "D0243A": 13740279,
              "D0243D": 13805629,
              "D02590": 13893249,
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
            "target": "hot0A1854",
            "block": 412,
            "step": 413,
            "pc": 661588,
            "prevPc": "0x0A184A",
            "cpu": {
              "pc": 661588,
              "sp": 13740095,
              "af": 84,
              "bc": 16716028,
              "de": 13644278,
              "hl": 13644558,
              "ix": 13632929,
              "iy": 13631616,
              "f": 84,
              "halted": false,
              "madl": 1,
              "stepCount": 413
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
              },
              {
                "addr": 13740104,
                "value": 57344
              },
              {
                "addr": 13740107,
                "value": 57412
              },
              {
                "addr": 13740110,
                "value": 379011
              },
              {
                "addr": 13740113,
                "value": 0
              },
              {
                "addr": 13740116,
                "value": 13740128
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
            "target": "hot0A187C",
            "block": 413,
            "step": 414,
            "pc": 661628,
            "prevPc": "0x0A1854",
            "cpu": {
              "pc": 661628,
              "sp": 13740095,
              "af": 84,
              "bc": 16716028,
              "de": 640,
              "hl": 13917316,
              "ix": 13632930,
              "iy": 13631616,
              "f": 84,
              "halted": false,
              "madl": 1,
              "stepCount": 414
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
              },
              {
                "addr": 13740104,
                "value": 57344
              },
              {
                "addr": 13740107,
                "value": 57412
              },
              {
                "addr": 13740110,
                "value": 379011
              },
              {
                "addr": 13740113,
                "value": 0
              },
              {
                "addr": 13740116,
                "value": 13740128
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
            "target": "hot0A188A",
            "block": 414,
            "step": 415,
            "pc": 661642,
            "prevPc": "0x0A187C",
            "cpu": {
              "pc": 661642,
              "sp": 13740095,
              "af": 84,
              "bc": 16716028,
              "de": 640,
              "hl": 13917316,
              "ix": 13632930,
              "iy": 13631616,
              "f": 84,
              "halted": false,
              "madl": 1,
              "stepCount": 415
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
              },
              {
                "addr": 13740104,
                "value": 57344
              },
              {
                "addr": 13740107,
                "value": 57412
              },
              {
                "addr": 13740110,
                "value": 379011
              },
              {
                "addr": 13740113,
                "value": 0
              },
              {
                "addr": 13740116,
                "value": 13740128
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
            "target": "hot0A189E",
            "block": 415,
            "step": 416,
            "pc": 661662,
            "prevPc": "0x0A188A",
            "cpu": {
              "pc": 661662,
              "sp": 13740092,
              "af": 1364,
              "bc": 16715781,
              "de": 640,
              "hl": 13917316,
              "ix": 13632930,
              "iy": 13631616,
              "f": 84,
              "halted": false,
              "madl": 1,
              "stepCount": 416
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
                "addr": 13740092,
                "value": 16715781
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
              },
              {
                "addr": 13740104,
                "value": 57344
              },
              {
                "addr": 13740107,
                "value": 57412
              },
              {
                "addr": 13740110,
                "value": 379011
              },
              {
                "addr": 13740113,
                "value": 0
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
            "target": "hot0A190D",
            "block": 424,
            "step": 425,
            "pc": 661773,
            "prevPc": "0x0A18EB",
            "cpu": {
              "pc": 661773,
              "sp": 13740092,
              "af": 1809,
              "bc": 16711680,
              "de": 13644558,
              "hl": 13642353,
              "ix": 13632930,
              "iy": 13631616,
              "f": 17,
              "halted": false,
              "madl": 1,
              "stepCount": 425
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
                "addr": 13740092,
                "value": 16715781
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
              },
              {
                "addr": 13740104,
                "value": 57344
              },
              {
                "addr": 13740107,
                "value": 57412
              },
              {
                "addr": 13740110,
                "value": 379011
              },
              {
                "addr": 13740113,
                "value": 0
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
            "target": "hot0A191F",
            "block": 425,
            "step": 426,
            "pc": 661791,
            "prevPc": "0x0A190D",
            "cpu": {
              "pc": 661791,
              "sp": 13740092,
              "af": 85,
              "bc": 16712960,
              "de": 13644558,
              "hl": 13917316,
              "ix": 13632930,
              "iy": 13631616,
              "f": 85,
              "halted": false,
              "madl": 1,
              "stepCount": 426
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
                "addr": 13740092,
                "value": 16715781
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
              },
              {
                "addr": 13740104,
                "value": 57344
              },
              {
                "addr": 13740107,
                "value": 57412
              },
              {
                "addr": 13740110,
                "value": 379011
              },
              {
                "addr": 13740113,
                "value": 0
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
            "target": "hot0A1939",
            "block": 426,
            "step": 427,
            "pc": 661817,
            "prevPc": "0x0A191F",
            "cpu": {
              "pc": 661817,
              "sp": 13740092,
              "af": 85,
              "bc": 16712960,
              "de": 255,
              "hl": 13917316,
              "ix": 13632930,
              "iy": 13631616,
              "f": 85,
              "halted": false,
              "madl": 1,
              "stepCount": 427
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
                "addr": 13740092,
                "value": 16715781
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
              },
              {
                "addr": 13740104,
                "value": 57344
              },
              {
                "addr": 13740107,
                "value": 57412
              },
              {
                "addr": 13740110,
                "value": 379011
              },
              {
                "addr": 13740113,
                "value": 0
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
            "target": "hot0A1969",
            "block": 427,
            "step": 428,
            "pc": 661865,
            "prevPc": "0x0A1939",
            "cpu": {
              "pc": 661865,
              "sp": 13740092,
              "af": 65448,
              "bc": 16712960,
              "de": 255,
              "hl": 13917326,
              "ix": 13632930,
              "iy": 13631616,
              "f": 168,
              "halted": false,
              "madl": 1,
              "stepCount": 428
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
                "addr": 13740092,
                "value": 16715781
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
              },
              {
                "addr": 13740104,
                "value": 57344
              },
              {
                "addr": 13740107,
                "value": 57412
              },
              {
                "addr": 13740110,
                "value": 379011
              },
              {
                "addr": 13740113,
                "value": 0
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
            "target": "hot0A1854",
            "block": 445,
            "step": 446,
            "pc": 661588,
            "prevPc": "0x0A1A1D",
            "cpu": {
              "pc": 661588,
              "sp": 13740095,
              "af": 65306,
              "bc": 16715525,
              "de": 40,
              "hl": 13644598,
              "ix": 13632931,
              "iy": 13631616,
              "f": 26,
              "halted": false,
              "madl": 1,
              "stepCount": 446
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
              },
              {
                "addr": 13740104,
                "value": 57344
              },
              {
                "addr": 13740107,
                "value": 57412
              },
              {
                "addr": 13740110,
                "value": 379011
              },
              {
                "addr": 13740113,
                "value": 0
              },
              {
                "addr": 13740116,
                "value": 13740128
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
            "target": "hot0A187C",
            "block": 446,
            "step": 447,
            "pc": 661628,
            "prevPc": "0x0A1854",
            "cpu": {
              "pc": 661628,
              "sp": 13740095,
              "af": 92,
              "bc": 16715525,
              "de": 640,
              "hl": 13917956,
              "ix": 13632932,
              "iy": 13631616,
              "f": 92,
              "halted": false,
              "madl": 1,
              "stepCount": 447
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
              },
              {
                "addr": 13740104,
                "value": 57344
              },
              {
                "addr": 13740107,
                "value": 57412
              },
              {
                "addr": 13740110,
                "value": 379011
              },
              {
                "addr": 13740113,
                "value": 0
              },
              {
                "addr": 13740116,
                "value": 13740128
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
            "target": "hot0A188A",
            "block": 447,
            "step": 448,
            "pc": 661642,
            "prevPc": "0x0A187C",
            "cpu": {
              "pc": 661642,
              "sp": 13740095,
              "af": 92,
              "bc": 16715525,
              "de": 640,
              "hl": 13917956,
              "ix": 13632932,
              "iy": 13631616,
              "f": 92,
              "halted": false,
              "madl": 1,
              "stepCount": 448
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
              },
              {
                "addr": 13740104,
                "value": 57344
              },
              {
                "addr": 13740107,
                "value": 57412
              },
              {
                "addr": 13740110,
                "value": 379011
              },
              {
                "addr": 13740113,
                "value": 0
              },
              {
                "addr": 13740116,
                "value": 13740128
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
            "target": "hot0A189E",
            "block": 448,
            "step": 449,
            "pc": 661662,
            "prevPc": "0x0A188A",
            "cpu": {
              "pc": 661662,
              "sp": 13740092,
              "af": 1372,
              "bc": 16715525,
              "de": 640,
              "hl": 13917956,
              "ix": 13632932,
              "iy": 13631616,
              "f": 92,
              "halted": false,
              "madl": 1,
              "stepCount": 449
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
                "addr": 13740092,
                "value": 16715525
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
              },
              {
                "addr": 13740104,
                "value": 57344
              },
              {
                "addr": 13740107,
                "value": 57412
              },
              {
                "addr": 13740110,
                "value": 379011
              },
              {
                "addr": 13740113,
                "value": 0
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
            "target": "hot0A190D",
            "block": 457,
            "step": 458,
            "pc": 661773,
            "prevPc": "0x0A18EB",
            "cpu": {
              "pc": 661773,
              "sp": 13740092,
              "af": 1809,
              "bc": 16711680,
              "de": 13644598,
              "hl": 13642353,
              "ix": 13632932,
              "iy": 13631616,
              "f": 17,
              "halted": false,
              "madl": 1,
              "stepCount": 458
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
                "addr": 13740092,
                "value": 16715525
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
              },
              {
                "addr": 13740104,
                "value": 57344
              },
              {
                "addr": 13740107,
                "value": 57412
              },
              {
                "addr": 13740110,
                "value": 379011
              },
              {
                "addr": 13740113,
                "value": 0
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
            "target": "hot0A191F",
            "block": 458,
            "step": 459,
            "pc": 661791,
            "prevPc": "0x0A190D",
            "cpu": {
              "pc": 661791,
              "sp": 13740092,
              "af": 85,
              "bc": 16712960,
              "de": 13644598,
              "hl": 13917956,
              "ix": 13632932,
              "iy": 13631616,
              "f": 85,
              "halted": false,
              "madl": 1,
              "stepCount": 459
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
                "addr": 13740092,
                "value": 16715525
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
              },
              {
                "addr": 13740104,
                "value": 57344
              },
              {
                "addr": 13740107,
                "value": 57412
              },
              {
                "addr": 13740110,
                "value": 379011
              },
              {
                "addr": 13740113,
                "value": 0
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
            "target": "hot0A1939",
            "block": 459,
            "step": 460,
            "pc": 661817,
            "prevPc": "0x0A191F",
            "cpu": {
              "pc": 661817,
              "sp": 13740092,
              "af": 85,
              "bc": 16712960,
              "de": 255,
              "hl": 13917956,
              "ix": 13632932,
              "iy": 13631616,
              "f": 85,
              "halted": false,
              "madl": 1,
              "stepCount": 460
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
                "addr": 13740092,
                "value": 16715525
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
              },
              {
                "addr": 13740104,
                "value": 57344
              },
              {
                "addr": 13740107,
                "value": 57412
              },
              {
                "addr": 13740110,
                "value": 379011
              },
              {
                "addr": 13740113,
                "value": 0
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
            "target": "hot0A1969",
            "block": 460,
            "step": 461,
            "pc": 661865,
            "prevPc": "0x0A1939",
            "cpu": {
              "pc": 661865,
              "sp": 13740092,
              "af": 65448,
              "bc": 16712960,
              "de": 255,
              "hl": 13917966,
              "ix": 13632932,
              "iy": 13631616,
              "f": 168,
              "halted": false,
              "madl": 1,
              "stepCount": 461
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
                "addr": 13740092,
                "value": 16715525
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
              },
              {
                "addr": 13740104,
                "value": 57344
              },
              {
                "addr": 13740107,
                "value": 57412
              },
              {
                "addr": 13740110,
                "value": 379011
              },
              {
                "addr": 13740113,
                "value": 0
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
            "target": "hot0A1854",
            "block": 478,
            "step": 479,
            "pc": 661588,
            "prevPc": "0x0A1A1D",
            "cpu": {
              "pc": 661588,
              "sp": 13740095,
              "af": 65290,
              "bc": 16715269,
              "de": 40,
              "hl": 13644638,
              "ix": 13632933,
              "iy": 13631616,
              "f": 10,
              "halted": false,
              "madl": 1,
              "stepCount": 479
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
              },
              {
                "addr": 13740104,
                "value": 57344
              },
              {
                "addr": 13740107,
                "value": 57412
              },
              {
                "addr": 13740110,
                "value": 379011
              },
              {
                "addr": 13740113,
                "value": 0
              },
              {
                "addr": 13740116,
                "value": 13740128
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
            "target": "hot0A187C",
            "block": 479,
            "step": 480,
            "pc": 661628,
            "prevPc": "0x0A1854",
            "cpu": {
              "pc": 661628,
              "sp": 13740095,
              "af": 63580,
              "bc": 16715269,
              "de": 640,
              "hl": 13918596,
              "ix": 13632934,
              "iy": 13631616,
              "f": 92,
              "halted": false,
              "madl": 1,
              "stepCount": 480
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
              },
              {
                "addr": 13740104,
                "value": 57344
              },
              {
                "addr": 13740107,
                "value": 57412
              },
              {
                "addr": 13740110,
                "value": 379011
              },
              {
                "addr": 13740113,
                "value": 0
              },
              {
                "addr": 13740116,
                "value": 13740128
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
            "target": "hot0A188A",
            "block": 480,
            "step": 481,
            "pc": 661642,
            "prevPc": "0x0A187C",
            "cpu": {
              "pc": 661642,
              "sp": 13740095,
              "af": 63580,
              "bc": 16715269,
              "de": 640,
              "hl": 13918596,
              "ix": 13632934,
              "iy": 13631616,
              "f": 92,
              "halted": false,
              "madl": 1,
              "stepCount": 481
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
              },
              {
                "addr": 13740104,
                "value": 57344
              },
              {
                "addr": 13740107,
                "value": 57412
              },
              {
                "addr": 13740110,
                "value": 379011
              },
              {
                "addr": 13740113,
                "value": 0
              },
              {
                "addr": 13740116,
                "value": 13740128
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
            "target": "hot0A189E",
            "block": 481,
            "step": 482,
            "pc": 661662,
            "prevPc": "0x0A188A",
            "cpu": {
              "pc": 661662,
              "sp": 13740092,
              "af": 1372,
              "bc": 16715269,
              "de": 640,
              "hl": 13918596,
              "ix": 13632934,
              "iy": 13631616,
              "f": 92,
              "halted": false,
              "madl": 1,
              "stepCount": 482
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
                "addr": 13740092,
                "value": 16715269
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
              },
              {
                "addr": 13740104,
                "value": 57344
              },
              {
                "addr": 13740107,
                "value": 57412
              },
              {
                "addr": 13740110,
                "value": 379011
              },
              {
                "addr": 13740113,
                "value": 0
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
            "target": "hot0A190D",
            "block": 490,
            "step": 491,
            "pc": 661773,
            "prevPc": "0x0A18EB",
            "cpu": {
              "pc": 661773,
              "sp": 13740092,
              "af": 1809,
              "bc": 16711680,
              "de": 13644638,
              "hl": 13642353,
              "ix": 13632934,
              "iy": 13631616,
              "f": 17,
              "halted": false,
              "madl": 1,
              "stepCount": 491
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
                "addr": 13740092,
                "value": 16715269
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
              },
              {
                "addr": 13740104,
                "value": 57344
              },
              {
                "addr": 13740107,
                "value": 57412
              },
              {
                "addr": 13740110,
                "value": 379011
              },
              {
                "addr": 13740113,
                "value": 0
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
            "target": "hot0A191F",
            "block": 491,
            "step": 492,
            "pc": 661791,
            "prevPc": "0x0A190D",
            "cpu": {
              "pc": 661791,
              "sp": 13740092,
              "af": 63573,
              "bc": 16713208,
              "de": 13644638,
              "hl": 13918596,
              "ix": 13632934,
              "iy": 13631616,
              "f": 85,
              "halted": false,
              "madl": 1,
              "stepCount": 492
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
                "addr": 13740092,
                "value": 16715269
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
              },
              {
                "addr": 13740104,
                "value": 57344
              },
              {
                "addr": 13740107,
                "value": 57412
              },
              {
                "addr": 13740110,
                "value": 379011
              },
              {
                "addr": 13740113,
                "value": 0
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
            "target": "hot0A1939",
            "block": 492,
            "step": 493,
            "pc": 661817,
            "prevPc": "0x0A191F",
            "cpu": {
              "pc": 661817,
              "sp": 13740092,
              "af": 63573,
              "bc": 16713208,
              "de": 255,
              "hl": 13918596,
              "ix": 13632934,
              "iy": 13631616,
              "f": 85,
              "halted": false,
              "madl": 1,
              "stepCount": 493
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
                "addr": 13740092,
                "value": 16715269
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
              },
              {
                "addr": 13740104,
                "value": 57344
              },
              {
                "addr": 13740107,
                "value": 57412
              },
              {
                "addr": 13740110,
                "value": 379011
              },
              {
                "addr": 13740113,
                "value": 0
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
            "target": "hot0A1969",
            "block": 493,
            "step": 494,
            "pc": 661865,
            "prevPc": "0x0A1939",
            "cpu": {
              "pc": 661865,
              "sp": 13740092,
              "af": 81,
              "bc": 16712960,
              "de": 255,
              "hl": 13918606,
              "ix": 13632934,
              "iy": 13631616,
              "f": 81,
              "halted": false,
              "madl": 1,
              "stepCount": 494
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
                "addr": 13740092,
                "value": 16715269
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
              },
              {
                "addr": 13740104,
                "value": 57344
              },
              {
                "addr": 13740107,
                "value": 57412
              },
              {
                "addr": 13740110,
                "value": 379011
              },
              {
                "addr": 13740113,
                "value": 0
              }
            ],
            "vram": 8554,
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
                "nonWhite": 5
              },
              "vramCurrent": 8554,
              "lastKey": null
            }
          },
          {
            "target": "hot0A1854",
            "block": 511,
            "step": 512,
            "pc": 661588,
            "prevPc": "0x0A1A1D",
            "cpu": {
              "pc": 661588,
              "sp": 13740095,
              "af": 65290,
              "bc": 16715013,
              "de": 40,
              "hl": 13644678,
              "ix": 13632935,
              "iy": 13631616,
              "f": 10,
              "halted": false,
              "madl": 1,
              "stepCount": 512
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
              },
              {
                "addr": 13740104,
                "value": 57344
              },
              {
                "addr": 13740107,
                "value": 57412
              },
              {
                "addr": 13740110,
                "value": 379011
              },
              {
                "addr": 13740113,
                "value": 0
              },
              {
                "addr": 13740116,
                "value": 13740128
              }
            ],
            "vram": 8559,
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
                "nonWhite": 10
              },
              "vramCurrent": 8559,
              "lastKey": null
            }
          },
          {
            "target": "hot0A187C",
            "block": 512,
            "step": 513,
            "pc": 661628,
            "prevPc": "0x0A1854",
            "cpu": {
              "pc": 661628,
              "sp": 13740095,
              "af": 63580,
              "bc": 16715013,
              "de": 640,
              "hl": 13919236,
              "ix": 13632936,
              "iy": 13631616,
              "f": 92,
              "halted": false,
              "madl": 1,
              "stepCount": 513
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
              },
              {
                "addr": 13740104,
                "value": 57344
              },
              {
                "addr": 13740107,
                "value": 57412
              },
              {
                "addr": 13740110,
                "value": 379011
              },
              {
                "addr": 13740113,
                "value": 0
              },
              {
                "addr": 13740116,
                "value": 13740128
              }
            ],
            "vram": 8559,
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
                "nonWhite": 10
              },
              "vramCurrent": 8559,
              "lastKey": null
            }
          },
          {
            "target": "hot0A188A",
            "block": 513,
            "step": 514,
            "pc": 661642,
            "prevPc": "0x0A187C",
            "cpu": {
              "pc": 661642,
              "sp": 13740095,
              "af": 63580,
              "bc": 16715013,
              "de": 640,
              "hl": 13919236,
              "ix": 13632936,
              "iy": 13631616,
              "f": 92,
              "halted": false,
              "madl": 1,
              "stepCount": 514
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
              },
              {
                "addr": 13740104,
                "value": 57344
              },
              {
                "addr": 13740107,
                "value": 57412
              },
              {
                "addr": 13740110,
                "value": 379011
              },
              {
                "addr": 13740113,
                "value": 0
              },
              {
                "addr": 13740116,
                "value": 13740128
              }
            ],
            "vram": 8559,
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
                "nonWhite": 10
              },
              "vramCurrent": 8559,
              "lastKey": null
            }
          },
          {
            "target": "hot0A189E",
            "block": 514,
            "step": 515,
            "pc": 661662,
            "prevPc": "0x0A188A",
            "cpu": {
              "pc": 661662,
              "sp": 13740092,
              "af": 1372,
              "bc": 16715013,
              "de": 640,
              "hl": 13919236,
              "ix": 13632936,
              "iy": 13631616,
              "f": 92,
              "halted": false,
              "madl": 1,
              "stepCount": 515
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
                "addr": 13740092,
                "value": 16715013
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
              },
              {
                "addr": 13740104,
                "value": 57344
              },
              {
                "addr": 13740107,
                "value": 57412
              },
              {
                "addr": 13740110,
                "value": 379011
              },
              {
                "addr": 13740113,
                "value": 0
              }
            ],
            "vram": 8559,
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
                "nonWhite": 10
              },
              "vramCurrent": 8559,
              "lastKey": null
            }
          },
          {
            "target": "hot0A190D",
            "block": 523,
            "step": 524,
            "pc": 661773,
            "prevPc": "0x0A18EB",
            "cpu": {
              "pc": 661773,
              "sp": 13740092,
              "af": 1809,
              "bc": 16711680,
              "de": 13644678,
              "hl": 13642353,
              "ix": 13632936,
              "iy": 13631616,
              "f": 17,
              "halted": false,
              "madl": 1,
              "stepCount": 524
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
                "addr": 13740092,
                "value": 16715013
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
              },
              {
                "addr": 13740104,
                "value": 57344
              },
              {
                "addr": 13740107,
                "value": 57412
              },
              {
                "addr": 13740110,
                "value": 379011
              },
              {
                "addr": 13740113,
                "value": 0
              }
            ],
            "vram": 8559,
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
                "nonWhite": 10
              },
              "vramCurrent": 8559,
              "lastKey": null
            }
          },
          {
            "target": "hot0A191F",
            "block": 524,
            "step": 525,
            "pc": 661791,
            "prevPc": "0x0A190D",
            "cpu": {
              "pc": 661791,
              "sp": 13740092,
              "af": 63573,
              "bc": 16713208,
              "de": 13644678,
              "hl": 13919236,
              "ix": 13632936,
              "iy": 13631616,
              "f": 85,
              "halted": false,
              "madl": 1,
              "stepCount": 525
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
                "addr": 13740092,
                "value": 16715013
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
              },
              {
                "addr": 13740104,
                "value": 57344
              },
              {
                "addr": 13740107,
                "value": 57412
              },
              {
                "addr": 13740110,
                "value": 379011
              },
              {
                "addr": 13740113,
                "value": 0
              }
            ],
            "vram": 8559,
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
                "nonWhite": 10
              },
              "vramCurrent": 8559,
              "lastKey": null
            }
          },
          {
            "target": "hot0A1939",
            "block": 525,
            "step": 526,
            "pc": 661817,
            "prevPc": "0x0A191F",
            "cpu": {
              "pc": 661817,
              "sp": 13740092,
              "af": 63573,
              "bc": 16713208,
              "de": 255,
              "hl": 13919236,
              "ix": 13632936,
              "iy": 13631616,
              "f": 85,
              "halted": false,
              "madl": 1,
              "stepCount": 526
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
                "addr": 13740092,
                "value": 16715013
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
              },
              {
                "addr": 13740104,
                "value": 57344
              },
              {
                "addr": 13740107,
                "value": 57412
              },
              {
                "addr": 13740110,
                "value": 379011
              },
              {
                "addr": 13740113,
                "value": 0
              }
            ],
            "vram": 8559,
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
                "nonWhite": 10
              },
              "vramCurrent": 8559,
              "lastKey": null
            }
          },
          {
            "target": "hot0A1969",
            "block": 526,
            "step": 527,
            "pc": 661865,
            "prevPc": "0x0A1939",
            "cpu": {
              "pc": 661865,
              "sp": 13740092,
              "af": 81,
              "bc": 16712960,
              "de": 255,
              "hl": 13919246,
              "ix": 13632936,
              "iy": 13631616,
              "f": 81,
              "halted": false,
              "madl": 1,
              "stepCount": 527
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
                "addr": 13740092,
                "value": 16715013
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
              },
              {
                "addr": 13740104,
                "value": 57344
              },
              {
                "addr": 13740107,
                "value": 57412
              },
              {
                "addr": 13740110,
                "value": 379011
              },
              {
                "addr": 13740113,
                "value": 0
              }
            ],
            "vram": 8564,
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
                "nonWhite": 15
              },
              "vramCurrent": 8564,
              "lastKey": null
            }
          },
          {
            "target": "hot0A1854",
            "block": 544,
            "step": 545,
            "pc": 661588,
            "prevPc": "0x0A1A1D",
            "cpu": {
              "pc": 661588,
              "sp": 13740095,
              "af": 65290,
              "bc": 16714757,
              "de": 40,
              "hl": 13644718,
              "ix": 13632937,
              "iy": 13631616,
              "f": 10,
              "halted": false,
              "madl": 1,
              "stepCount": 545
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
              },
              {
                "addr": 13740104,
                "value": 57344
              },
              {
                "addr": 13740107,
                "value": 57412
              },
              {
                "addr": 13740110,
                "value": 379011
              },
              {
                "addr": 13740113,
                "value": 0
              },
              {
                "addr": 13740116,
                "value": 13740128
              }
            ],
            "vram": 8569,
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
                "nonWhite": 20
              },
              "vramCurrent": 8569,
              "lastKey": null
            }
          },
          {
            "target": "hot0A187C",
            "block": 545,
            "step": 546,
            "pc": 661628,
            "prevPc": "0x0A1854",
            "cpu": {
              "pc": 661628,
              "sp": 13740095,
              "af": 63580,
              "bc": 16714757,
              "de": 640,
              "hl": 13919876,
              "ix": 13632938,
              "iy": 13631616,
              "f": 92,
              "halted": false,
              "madl": 1,
              "stepCount": 546
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
              },
              {
                "addr": 13740104,
                "value": 57344
              },
              {
                "addr": 13740107,
                "value": 57412
              },
              {
                "addr": 13740110,
                "value": 379011
              },
              {
                "addr": 13740113,
                "value": 0
              },
              {
                "addr": 13740116,
                "value": 13740128
              }
            ],
            "vram": 8569,
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
                "nonWhite": 20
              },
              "vramCurrent": 8569,
              "lastKey": null
            }
          },
          {
            "target": "hot0A188A",
            "block": 546,
            "step": 547,
            "pc": 661642,
            "prevPc": "0x0A187C",
            "cpu": {
              "pc": 661642,
              "sp": 13740095,
              "af": 63580,
              "bc": 16714757,
              "de": 640,
              "hl": 13919876,
              "ix": 13632938,
              "iy": 13631616,
              "f": 92,
              "halted": false,
              "madl": 1,
              "stepCount": 547
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
              },
              {
                "addr": 13740104,
                "value": 57344
              },
              {
                "addr": 13740107,
                "value": 57412
              },
              {
                "addr": 13740110,
                "value": 379011
              },
              {
                "addr": 13740113,
                "value": 0
              },
              {
                "addr": 13740116,
                "value": 13740128
              }
            ],
            "vram": 8569,
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
                "nonWhite": 20
              },
              "vramCurrent": 8569,
              "lastKey": null
            }
          },
          {
            "target": "hot0A189E",
            "block": 547,
            "step": 548,
            "pc": 661662,
            "prevPc": "0x0A188A",
            "cpu": {
              "pc": 661662,
              "sp": 13740092,
              "af": 1372,
              "bc": 16714757,
              "de": 640,
              "hl": 13919876,
              "ix": 13632938,
              "iy": 13631616,
              "f": 92,
              "halted": false,
              "madl": 1,
              "stepCount": 548
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
                "addr": 13740092,
                "value": 16714757
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
              },
              {
                "addr": 13740104,
                "value": 57344
              },
              {
                "addr": 13740107,
                "value": 57412
              },
              {
                "addr": 13740110,
                "value": 379011
              },
              {
                "addr": 13740113,
                "value": 0
              }
            ],
            "vram": 8569,
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
                "nonWhite": 20
              },
              "vramCurrent": 8569,
              "lastKey": null
            }
          },
          {
            "target": "hot0A190D",
            "block": 556,
            "step": 557,
            "pc": 661773,
            "prevPc": "0x0A18EB",
            "cpu": {
              "pc": 661773,
              "sp": 13740092,
              "af": 1809,
              "bc": 16711680,
              "de": 13644718,
              "hl": 13642353,
              "ix": 13632938,
              "iy": 13631616,
              "f": 17,
              "halted": false,
              "madl": 1,
              "stepCount": 557
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
                "addr": 13740092,
                "value": 16714757
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
              },
              {
                "addr": 13740104,
                "value": 57344
              },
              {
                "addr": 13740107,
                "value": 57412
              },
              {
                "addr": 13740110,
                "value": 379011
              },
              {
                "addr": 13740113,
                "value": 0
              }
            ],
            "vram": 8569,
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
                "nonWhite": 20
              },
              "vramCurrent": 8569,
              "lastKey": null
            }
          },
          {
            "target": "hot0A191F",
            "block": 557,
            "step": 558,
            "pc": 661791,
            "prevPc": "0x0A190D",
            "cpu": {
              "pc": 661791,
              "sp": 13740092,
              "af": 63573,
              "bc": 16713208,
              "de": 13644718,
              "hl": 13919876,
              "ix": 13632938,
              "iy": 13631616,
              "f": 85,
              "halted": false,
              "madl": 1,
              "stepCount": 558
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
                "addr": 13740092,
                "value": 16714757
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
              },
              {
                "addr": 13740104,
                "value": 57344
              },
              {
                "addr": 13740107,
                "value": 57412
              },
              {
                "addr": 13740110,
                "value": 379011
              },
              {
                "addr": 13740113,
                "value": 0
              }
            ],
            "vram": 8569,
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
                "nonWhite": 20
              },
              "vramCurrent": 8569,
              "lastKey": null
            }
          },
          {
            "target": "hot0A1939",
            "block": 558,
            "step": 559,
            "pc": 661817,
            "prevPc": "0x0A191F",
            "cpu": {
              "pc": 661817,
              "sp": 13740092,
              "af": 63573,
              "bc": 16713208,
              "de": 255,
              "hl": 13919876,
              "ix": 13632938,
              "iy": 13631616,
              "f": 85,
              "halted": false,
              "madl": 1,
              "stepCount": 559
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
                "addr": 13740092,
                "value": 16714757
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
              },
              {
                "addr": 13740104,
                "value": 57344
              },
              {
                "addr": 13740107,
                "value": 57412
              },
              {
                "addr": 13740110,
                "value": 379011
              },
              {
                "addr": 13740113,
                "value": 0
              }
            ],
            "vram": 8569,
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
                "nonWhite": 20
              },
              "vramCurrent": 8569,
              "lastKey": null
            }
          },
          {
            "target": "hot0A1969",
            "block": 559,
            "step": 560,
            "pc": 661865,
            "prevPc": "0x0A1939",
            "cpu": {
              "pc": 661865,
              "sp": 13740092,
              "af": 81,
              "bc": 16712960,
              "de": 255,
              "hl": 13919886,
              "ix": 13632938,
              "iy": 13631616,
              "f": 81,
              "halted": false,
              "madl": 1,
              "stepCount": 560
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
                "addr": 13740092,
                "value": 16714757
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
              },
              {
                "addr": 13740104,
                "value": 57344
              },
              {
                "addr": 13740107,
                "value": 57412
              },
              {
                "addr": 13740110,
                "value": 379011
              },
              {
                "addr": 13740113,
                "value": 0
              }
            ],
            "vram": 8574,
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
                "nonWhite": 25
              },
              "vramCurrent": 8574,
              "lastKey": null
            }
          },
          {
            "target": "hot0A1854",
            "block": 577,
            "step": 578,
            "pc": 661588,
            "prevPc": "0x0A1A1D",
            "cpu": {
              "pc": 661588,
              "sp": 13740095,
              "af": 65290,
              "bc": 16714501,
              "de": 40,
              "hl": 13644758,
              "ix": 13632939,
              "iy": 13631616,
              "f": 10,
              "halted": false,
              "madl": 1,
              "stepCount": 578
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
              },
              {
                "addr": 13740104,
                "value": 57344
              },
              {
                "addr": 13740107,
                "value": 57412
              },
              {
                "addr": 13740110,
                "value": 379011
              },
              {
                "addr": 13740113,
                "value": 0
              },
              {
                "addr": 13740116,
                "value": 13740128
              }
            ],
            "vram": 8579,
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
                "nonWhite": 30
              },
              "vramCurrent": 8579,
              "lastKey": null
            }
          },
          {
            "target": "hot0A187C",
            "block": 578,
            "step": 579,
            "pc": 661628,
            "prevPc": "0x0A1854",
            "cpu": {
              "pc": 661628,
              "sp": 13740095,
              "af": 63580,
              "bc": 16714501,
              "de": 640,
              "hl": 13920516,
              "ix": 13632940,
              "iy": 13631616,
              "f": 92,
              "halted": false,
              "madl": 1,
              "stepCount": 579
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
              },
              {
                "addr": 13740104,
                "value": 57344
              },
              {
                "addr": 13740107,
                "value": 57412
              },
              {
                "addr": 13740110,
                "value": 379011
              },
              {
                "addr": 13740113,
                "value": 0
              },
              {
                "addr": 13740116,
                "value": 13740128
              }
            ],
            "vram": 8579,
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
                "nonWhite": 30
              },
              "vramCurrent": 8579,
              "lastKey": null
            }
          },
          {
            "target": "hot0A188A",
            "block": 579,
            "step": 580,
            "pc": 661642,
            "prevPc": "0x0A187C",
            "cpu": {
              "pc": 661642,
              "sp": 13740095,
              "af": 63580,
              "bc": 16714501,
              "de": 640,
              "hl": 13920516,
              "ix": 13632940,
              "iy": 13631616,
              "f": 92,
              "halted": false,
              "madl": 1,
              "stepCount": 580
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
              },
              {
                "addr": 13740104,
                "value": 57344
              },
              {
                "addr": 13740107,
                "value": 57412
              },
              {
                "addr": 13740110,
                "value": 379011
              },
              {
                "addr": 13740113,
                "value": 0
              },
              {
                "addr": 13740116,
                "value": 13740128
              }
            ],
            "vram": 8579,
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
                "nonWhite": 30
              },
              "vramCurrent": 8579,
              "lastKey": null
            }
          },
          {
            "target": "hot0A189E",
            "block": 580,
            "step": 581,
            "pc": 661662,
            "prevPc": "0x0A188A",
            "cpu": {
              "pc": 661662,
              "sp": 13740092,
              "af": 1372,
              "bc": 16714501,
              "de": 640,
              "hl": 13920516,
              "ix": 13632940,
              "iy": 13631616,
              "f": 92,
              "halted": false,
              "madl": 1,
              "stepCount": 581
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
                "addr": 13740092,
                "value": 16714501
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
              },
              {
                "addr": 13740104,
                "value": 57344
              },
              {
                "addr": 13740107,
                "value": 57412
              },
              {
                "addr": 13740110,
                "value": 379011
              },
              {
                "addr": 13740113,
                "value": 0
              }
            ],
            "vram": 8579,
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
                "nonWhite": 30
              },
              "vramCurrent": 8579,
              "lastKey": null
            }
          },
          {
            "target": "hot0A190D",
            "block": 589,
            "step": 590,
            "pc": 661773,
            "prevPc": "0x0A18EB",
            "cpu": {
              "pc": 661773,
              "sp": 13740092,
              "af": 1809,
              "bc": 16711680,
              "de": 13644758,
              "hl": 13642353,
              "ix": 13632940,
              "iy": 13631616,
              "f": 17,
              "halted": false,
              "madl": 1,
              "stepCount": 590
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
                "addr": 13740092,
                "value": 16714501
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
              },
              {
                "addr": 13740104,
                "value": 57344
              },
              {
                "addr": 13740107,
                "value": 57412
              },
              {
                "addr": 13740110,
                "value": 379011
              },
              {
                "addr": 13740113,
                "value": 0
              }
            ],
            "vram": 8579,
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
                "nonWhite": 30
              },
              "vramCurrent": 8579,
              "lastKey": null
            }
          },
          {
            "target": "hot0A191F",
            "block": 590,
            "step": 591,
            "pc": 661791,
            "prevPc": "0x0A190D",
            "cpu": {
              "pc": 661791,
              "sp": 13740092,
              "af": 63573,
              "bc": 16713208,
              "de": 13644758,
              "hl": 13920516,
              "ix": 13632940,
              "iy": 13631616,
              "f": 85,
              "halted": false,
              "madl": 1,
              "stepCount": 591
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
                "addr": 13740092,
                "value": 16714501
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
              },
              {
                "addr": 13740104,
                "value": 57344
              },
              {
                "addr": 13740107,
                "value": 57412
              },
              {
                "addr": 13740110,
                "value": 379011
              },
              {
                "addr": 13740113,
                "value": 0
              }
            ],
            "vram": 8579,
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
                "nonWhite": 30
              },
              "vramCurrent": 8579,
              "lastKey": null
            }
          },
          {
            "target": "hot0A1939",
            "block": 591,
            "step": 592,
            "pc": 661817,
            "prevPc": "0x0A191F",
            "cpu": {
              "pc": 661817,
              "sp": 13740092,
              "af": 63573,
              "bc": 16713208,
              "de": 255,
              "hl": 13920516,
              "ix": 13632940,
              "iy": 13631616,
              "f": 85,
              "halted": false,
              "madl": 1,
              "stepCount": 592
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
                "addr": 13740092,
                "value": 16714501
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
              },
              {
                "addr": 13740104,
                "value": 57344
              },
              {
                "addr": 13740107,
                "value": 57412
              },
              {
                "addr": 13740110,
                "value": 379011
              },
              {
                "addr": 13740113,
                "value": 0
              }
            ],
            "vram": 8579,
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
                "nonWhite": 30
              },
              "vramCurrent": 8579,
              "lastKey": null
            }
          },
          {
            "target": "hot0A1969",
            "block": 592,
            "step": 593,
            "pc": 661865,
            "prevPc": "0x0A1939",
            "cpu": {
              "pc": 661865,
              "sp": 13740092,
              "af": 81,
              "bc": 16712960,
              "de": 255,
              "hl": 13920526,
              "ix": 13632940,
              "iy": 13631616,
              "f": 81,
              "halted": false,
              "madl": 1,
              "stepCount": 593
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
                "addr": 13740092,
                "value": 16714501
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
              },
              {
                "addr": 13740104,
                "value": 57344
              },
              {
                "addr": 13740107,
                "value": 57412
              },
              {
                "addr": 13740110,
                "value": 379011
              },
              {
                "addr": 13740113,
                "value": 0
              }
            ],
            "vram": 8584,
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
                "nonWhite": 35
              },
              "vramCurrent": 8584,
              "lastKey": null
            }
          },
          {
            "target": "hot0A1854",
            "block": 610,
            "step": 611,
            "pc": 661588,
            "prevPc": "0x0A1A1D",
            "cpu": {
              "pc": 661588,
              "sp": 13740095,
              "af": 65290,
              "bc": 16714245,
              "de": 40,
              "hl": 13644798,
              "ix": 13632941,
              "iy": 13631616,
              "f": 10,
              "halted": false,
              "madl": 1,
              "stepCount": 611
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
              },
              {
                "addr": 13740104,
                "value": 57344
              },
              {
                "addr": 13740107,
                "value": 57412
              },
              {
                "addr": 13740110,
                "value": 379011
              },
              {
                "addr": 13740113,
                "value": 0
              },
              {
                "addr": 13740116,
                "value": 13740128
              }
            ],
            "vram": 8589,
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
                "nonWhite": 40
              },
              "vramCurrent": 8589,
              "lastKey": null
            }
          },
          {
            "target": "hot0A187C",
            "block": 611,
            "step": 612,
            "pc": 661628,
            "prevPc": "0x0A1854",
            "cpu": {
              "pc": 661628,
              "sp": 13740095,
              "af": 63580,
              "bc": 16714245,
              "de": 640,
              "hl": 13921156,
              "ix": 13632942,
              "iy": 13631616,
              "f": 92,
              "halted": false,
              "madl": 1,
              "stepCount": 612
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
              },
              {
                "addr": 13740104,
                "value": 57344
              },
              {
                "addr": 13740107,
                "value": 57412
              },
              {
                "addr": 13740110,
                "value": 379011
              },
              {
                "addr": 13740113,
                "value": 0
              },
              {
                "addr": 13740116,
                "value": 13740128
              }
            ],
            "vram": 8589,
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
                "nonWhite": 40
              },
              "vramCurrent": 8589,
              "lastKey": null
            }
          },
          {
            "target": "hot0A188A",
            "block": 612,
            "step": 613,
            "pc": 661642,
            "prevPc": "0x0A187C",
            "cpu": {
              "pc": 661642,
              "sp": 13740095,
              "af": 63580,
              "bc": 16714245,
              "de": 640,
              "hl": 13921156,
              "ix": 13632942,
              "iy": 13631616,
              "f": 92,
              "halted": false,
              "madl": 1,
              "stepCount": 613
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
              },
              {
                "addr": 13740104,
                "value": 57344
              },
              {
                "addr": 13740107,
                "value": 57412
              },
              {
                "addr": 13740110,
                "value": 379011
              },
              {
                "addr": 13740113,
                "value": 0
              },
              {
                "addr": 13740116,
                "value": 13740128
              }
            ],
            "vram": 8589,
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
                "nonWhite": 40
              },
              "vramCurrent": 8589,
              "lastKey": null
            }
          },
          {
            "target": "hot0A189E",
            "block": 613,
            "step": 614,
            "pc": 661662,
            "prevPc": "0x0A188A",
            "cpu": {
              "pc": 661662,
              "sp": 13740092,
              "af": 1372,
              "bc": 16714245,
              "de": 640,
              "hl": 13921156,
              "ix": 13632942,
              "iy": 13631616,
              "f": 92,
              "halted": false,
              "madl": 1,
              "stepCount": 614
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
                "addr": 13740092,
                "value": 16714245
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
              },
              {
                "addr": 13740104,
                "value": 57344
              },
              {
                "addr": 13740107,
                "value": 57412
              },
              {
                "addr": 13740110,
                "value": 379011
              },
              {
                "addr": 13740113,
                "value": 0
              }
            ],
            "vram": 8589,
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
                "nonWhite": 40
              },
              "vramCurrent": 8589,
              "lastKey": null
            }
          },
          {
            "target": "hot0A190D",
            "block": 622,
            "step": 623,
            "pc": 661773,
            "prevPc": "0x0A18EB",
            "cpu": {
              "pc": 661773,
              "sp": 13740092,
              "af": 1809,
              "bc": 16711680,
              "de": 13644798,
              "hl": 13642353,
              "ix": 13632942,
              "iy": 13631616,
              "f": 17,
              "halted": false,
              "madl": 1,
              "stepCount": 623
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
                "addr": 13740092,
                "value": 16714245
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
              },
              {
                "addr": 13740104,
                "value": 57344
              },
              {
                "addr": 13740107,
                "value": 57412
              },
              {
                "addr": 13740110,
                "value": 379011
              },
              {
                "addr": 13740113,
                "value": 0
              }
            ],
            "vram": 8589,
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
                "nonWhite": 40
              },
              "vramCurrent": 8589,
              "lastKey": null
            }
          },
          {
            "target": "hot0A191F",
            "block": 623,
            "step": 624,
            "pc": 661791,
            "prevPc": "0x0A190D",
            "cpu": {
              "pc": 661791,
              "sp": 13740092,
              "af": 63573,
              "bc": 16713208,
              "de": 13644798,
              "hl": 13921156,
              "ix": 13632942,
              "iy": 13631616,
              "f": 85,
              "halted": false,
              "madl": 1,
              "stepCount": 624
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
                "addr": 13740092,
                "value": 16714245
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
              },
              {
                "addr": 13740104,
                "value": 57344
              },
              {
                "addr": 13740107,
                "value": 57412
              },
              {
                "addr": 13740110,
                "value": 379011
              },
              {
                "addr": 13740113,
                "value": 0
              }
            ],
            "vram": 8589,
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
                "nonWhite": 40
              },
              "vramCurrent": 8589,
              "lastKey": null
            }
          },
          {
            "target": "hot0A1939",
            "block": 624,
            "step": 625,
            "pc": 661817,
            "prevPc": "0x0A191F",
            "cpu": {
              "pc": 661817,
              "sp": 13740092,
              "af": 63573,
              "bc": 16713208,
              "de": 255,
              "hl": 13921156,
              "ix": 13632942,
              "iy": 13631616,
              "f": 85,
              "halted": false,
              "madl": 1,
              "stepCount": 625
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
                "addr": 13740092,
                "value": 16714245
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
              },
              {
                "addr": 13740104,
                "value": 57344
              },
              {
                "addr": 13740107,
                "value": 57412
              },
              {
                "addr": 13740110,
                "value": 379011
              },
              {
                "addr": 13740113,
                "value": 0
              }
            ],
            "vram": 8589,
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
                "nonWhite": 40
              },
              "vramCurrent": 8589,
              "lastKey": null
            }
          },
          {
            "target": "hot0A1969",
            "block": 625,
            "step": 626,
            "pc": 661865,
            "prevPc": "0x0A1939",
            "cpu": {
              "pc": 661865,
              "sp": 13740092,
              "af": 81,
              "bc": 16712960,
              "de": 255,
              "hl": 13921166,
              "ix": 13632942,
              "iy": 13631616,
              "f": 81,
              "halted": false,
              "madl": 1,
              "stepCount": 626
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
                "addr": 13740092,
                "value": 16714245
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
              },
              {
                "addr": 13740104,
                "value": 57344
              },
              {
                "addr": 13740107,
                "value": 57412
              },
              {
                "addr": 13740110,
                "value": 379011
              },
              {
                "addr": 13740113,
                "value": 0
              }
            ],
            "vram": 8594,
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
                "nonWhite": 45
              },
              "vramCurrent": 8594,
              "lastKey": null
            }
          },
          {
            "target": "hot0A1854",
            "block": 643,
            "step": 644,
            "pc": 661588,
            "prevPc": "0x0A1A1D",
            "cpu": {
              "pc": 661588,
              "sp": 13740095,
              "af": 65290,
              "bc": 16713989,
              "de": 40,
              "hl": 13644838,
              "ix": 13632943,
              "iy": 13631616,
              "f": 10,
              "halted": false,
              "madl": 1,
              "stepCount": 644
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
              },
              {
                "addr": 13740104,
                "value": 57344
              },
              {
                "addr": 13740107,
                "value": 57412
              },
              {
                "addr": 13740110,
                "value": 379011
              },
              {
                "addr": 13740113,
                "value": 0
              },
              {
                "addr": 13740116,
                "value": 13740128
              }
            ],
            "vram": 8599,
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
                "nonWhite": 50
              },
              "vramCurrent": 8599,
              "lastKey": null
            }
          },
          {
            "target": "hot0A187C",
            "block": 644,
            "step": 645,
            "pc": 661628,
            "prevPc": "0x0A1854",
            "cpu": {
              "pc": 661628,
              "sp": 13740095,
              "af": 63580,
              "bc": 16713989,
              "de": 640,
              "hl": 13921796,
              "ix": 13632944,
              "iy": 13631616,
              "f": 92,
              "halted": false,
              "madl": 1,
              "stepCount": 645
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
              },
              {
                "addr": 13740104,
                "value": 57344
              },
              {
                "addr": 13740107,
                "value": 57412
              },
              {
                "addr": 13740110,
                "value": 379011
              },
              {
                "addr": 13740113,
                "value": 0
              },
              {
                "addr": 13740116,
                "value": 13740128
              }
            ],
            "vram": 8599,
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
                "nonWhite": 50
              },
              "vramCurrent": 8599,
              "lastKey": null
            }
          },
          {
            "target": "hot0A188A",
            "block": 645,
            "step": 646,
            "pc": 661642,
            "prevPc": "0x0A187C",
            "cpu": {
              "pc": 661642,
              "sp": 13740095,
              "af": 63580,
              "bc": 16713989,
              "de": 640,
              "hl": 13921796,
              "ix": 13632944,
              "iy": 13631616,
              "f": 92,
              "halted": false,
              "madl": 1,
              "stepCount": 646
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
              },
              {
                "addr": 13740104,
                "value": 57344
              },
              {
                "addr": 13740107,
                "value": 57412
              },
              {
                "addr": 13740110,
                "value": 379011
              },
              {
                "addr": 13740113,
                "value": 0
              },
              {
                "addr": 13740116,
                "value": 13740128
              }
            ],
            "vram": 8599,
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
                "nonWhite": 50
              },
              "vramCurrent": 8599,
              "lastKey": null
            }
          },
          {
            "target": "hot0A189E",
            "block": 646,
            "step": 647,
            "pc": 661662,
            "prevPc": "0x0A188A",
            "cpu": {
              "pc": 661662,
              "sp": 13740092,
              "af": 1372,
              "bc": 16713989,
              "de": 640,
              "hl": 13921796,
              "ix": 13632944,
              "iy": 13631616,
              "f": 92,
              "halted": false,
              "madl": 1,
              "stepCount": 647
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
                "addr": 13740092,
                "value": 16713989
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
              },
              {
                "addr": 13740104,
                "value": 57344
              },
              {
                "addr": 13740107,
                "value": 57412
              },
              {
                "addr": 13740110,
                "value": 379011
              },
              {
                "addr": 13740113,
                "value": 0
              }
            ],
            "vram": 8599,
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
                "nonWhite": 50
              },
              "vramCurrent": 8599,
              "lastKey": null
            }
          },
          {
            "target": "hot0A190D",
            "block": 655,
            "step": 656,
            "pc": 661773,
            "prevPc": "0x0A18EB",
            "cpu": {
              "pc": 661773,
              "sp": 13740092,
              "af": 1809,
              "bc": 16711680,
              "de": 13644838,
              "hl": 13642353,
              "ix": 13632944,
              "iy": 13631616,
              "f": 17,
              "halted": false,
              "madl": 1,
              "stepCount": 656
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
                "addr": 13740092,
                "value": 16713989
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
              },
              {
                "addr": 13740104,
                "value": 57344
              },
              {
                "addr": 13740107,
                "value": 57412
              },
              {
                "addr": 13740110,
                "value": 379011
              },
              {
                "addr": 13740113,
                "value": 0
              }
            ],
            "vram": 8599,
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
                "nonWhite": 50
              },
              "vramCurrent": 8599,
              "lastKey": null
            }
          },
          {
            "target": "hot0A191F",
            "block": 656,
            "step": 657,
            "pc": 661791,
            "prevPc": "0x0A190D",
            "cpu": {
              "pc": 661791,
              "sp": 13740092,
              "af": 63573,
              "bc": 16713208,
              "de": 13644838,
              "hl": 13921796,
              "ix": 13632944,
              "iy": 13631616,
              "f": 85,
              "halted": false,
              "madl": 1,
              "stepCount": 657
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
                "addr": 13740092,
                "value": 16713989
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
              },
              {
                "addr": 13740104,
                "value": 57344
              },
              {
                "addr": 13740107,
                "value": 57412
              },
              {
                "addr": 13740110,
                "value": 379011
              },
              {
                "addr": 13740113,
                "value": 0
              }
            ],
            "vram": 8599,
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
                "nonWhite": 50
              },
              "vramCurrent": 8599,
              "lastKey": null
            }
          },
          {
            "target": "hot0A1939",
            "block": 657,
            "step": 658,
            "pc": 661817,
            "prevPc": "0x0A191F",
            "cpu": {
              "pc": 661817,
              "sp": 13740092,
              "af": 63573,
              "bc": 16713208,
              "de": 255,
              "hl": 13921796,
              "ix": 13632944,
              "iy": 13631616,
              "f": 85,
              "halted": false,
              "madl": 1,
              "stepCount": 658
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
                "addr": 13740092,
                "value": 16713989
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
              },
              {
                "addr": 13740104,
                "value": 57344
              },
              {
                "addr": 13740107,
                "value": 57412
              },
              {
                "addr": 13740110,
                "value": 379011
              },
              {
                "addr": 13740113,
                "value": 0
              }
            ],
            "vram": 8599,
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
                "nonWhite": 50
              },
              "vramCurrent": 8599,
              "lastKey": null
            }
          },
          {
            "target": "hot0A1969",
            "block": 658,
            "step": 659,
            "pc": 661865,
            "prevPc": "0x0A1939",
            "cpu": {
              "pc": 661865,
              "sp": 13740092,
              "af": 81,
              "bc": 16712960,
              "de": 255,
              "hl": 13921806,
              "ix": 13632944,
              "iy": 13631616,
              "f": 81,
              "halted": false,
              "madl": 1,
              "stepCount": 659
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
                "addr": 13740092,
                "value": 16713989
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
              },
              {
                "addr": 13740104,
                "value": 57344
              },
              {
                "addr": 13740107,
                "value": 57412
              },
              {
                "addr": 13740110,
                "value": 379011
              },
              {
                "addr": 13740113,
                "value": 0
              }
            ],
            "vram": 8604,
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
                "nonWhite": 55
              },
              "vramCurrent": 8604,
              "lastKey": null
            }
          },
          {
            "target": "hot0A1854",
            "block": 676,
            "step": 677,
            "pc": 661588,
            "prevPc": "0x0A1A1D",
            "cpu": {
              "pc": 661588,
              "sp": 13740095,
              "af": 65290,
              "bc": 16713733,
              "de": 40,
              "hl": 13644878,
              "ix": 13632945,
              "iy": 13631616,
              "f": 10,
              "halted": false,
              "madl": 1,
              "stepCount": 677
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
              },
              {
                "addr": 13740104,
                "value": 57344
              },
              {
                "addr": 13740107,
                "value": 57412
              },
              {
                "addr": 13740110,
                "value": 379011
              },
              {
                "addr": 13740113,
                "value": 0
              },
              {
                "addr": 13740116,
                "value": 13740128
              }
            ],
            "vram": 8609,
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
                "nonWhite": 60
              },
              "vramCurrent": 8609,
              "lastKey": null
            }
          },
          {
            "target": "hot0A187C",
            "block": 677,
            "step": 678,
            "pc": 661628,
            "prevPc": "0x0A1854",
            "cpu": {
              "pc": 661628,
              "sp": 13740095,
              "af": 63580,
              "bc": 16713733,
              "de": 640,
              "hl": 13922436,
              "ix": 13632946,
              "iy": 13631616,
              "f": 92,
              "halted": false,
              "madl": 1,
              "stepCount": 678
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
              },
              {
                "addr": 13740104,
                "value": 57344
              },
              {
                "addr": 13740107,
                "value": 57412
              },
              {
                "addr": 13740110,
                "value": 379011
              },
              {
                "addr": 13740113,
                "value": 0
              },
              {
                "addr": 13740116,
                "value": 13740128
              }
            ],
            "vram": 8609,
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
                "nonWhite": 60
              },
              "vramCurrent": 8609,
              "lastKey": null
            }
          },
          {
            "target": "hot0A188A",
            "block": 678,
            "step": 679,
            "pc": 661642,
            "prevPc": "0x0A187C",
            "cpu": {
              "pc": 661642,
              "sp": 13740095,
              "af": 63580,
              "bc": 16713733,
              "de": 640,
              "hl": 13922436,
              "ix": 13632946,
              "iy": 13631616,
              "f": 92,
              "halted": false,
              "madl": 1,
              "stepCount": 679
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
              },
              {
                "addr": 13740104,
                "value": 57344
              },
              {
                "addr": 13740107,
                "value": 57412
              },
              {
                "addr": 13740110,
                "value": 379011
              },
              {
                "addr": 13740113,
                "value": 0
              },
              {
                "addr": 13740116,
                "value": 13740128
              }
            ],
            "vram": 8609,
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
                "nonWhite": 60
              },
              "vramCurrent": 8609,
              "lastKey": null
            }
          },
          {
            "target": "hot0A189E",
            "block": 679,
            "step": 680,
            "pc": 661662,
            "prevPc": "0x0A188A",
            "cpu": {
              "pc": 661662,
              "sp": 13740092,
              "af": 1372,
              "bc": 16713733,
              "de": 640,
              "hl": 13922436,
              "ix": 13632946,
              "iy": 13631616,
              "f": 92,
              "halted": false,
              "madl": 1,
              "stepCount": 680
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
                "addr": 13740092,
                "value": 16713733
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
              },
              {
                "addr": 13740104,
                "value": 57344
              },
              {
                "addr": 13740107,
                "value": 57412
              },
              {
                "addr": 13740110,
                "value": 379011
              },
              {
                "addr": 13740113,
                "value": 0
              }
            ],
            "vram": 8609,
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
                "nonWhite": 60
              },
              "vramCurrent": 8609,
              "lastKey": null
            }
          },
          {
            "target": "hot0A190D",
            "block": 688,
            "step": 689,
            "pc": 661773,
            "prevPc": "0x0A18EB",
            "cpu": {
              "pc": 661773,
              "sp": 13740092,
              "af": 1809,
              "bc": 16711680,
              "de": 13644878,
              "hl": 13642353,
              "ix": 13632946,
              "iy": 13631616,
              "f": 17,
              "halted": false,
              "madl": 1,
              "stepCount": 689
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
                "addr": 13740092,
                "value": 16713733
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
              },
              {
                "addr": 13740104,
                "value": 57344
              },
              {
                "addr": 13740107,
                "value": 57412
              },
              {
                "addr": 13740110,
                "value": 379011
              },
              {
                "addr": 13740113,
                "value": 0
              }
            ],
            "vram": 8609,
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
                "nonWhite": 60
              },
              "vramCurrent": 8609,
              "lastKey": null
            }
          },
          {
            "target": "hot0A191F",
            "block": 689,
            "step": 690,
            "pc": 661791,
            "prevPc": "0x0A190D",
            "cpu": {
              "pc": 661791,
              "sp": 13740092,
              "af": 63573,
              "bc": 16713208,
              "de": 13644878,
              "hl": 13922436,
              "ix": 13632946,
              "iy": 13631616,
              "f": 85,
              "halted": false,
              "madl": 1,
              "stepCount": 690
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
                "addr": 13740092,
                "value": 16713733
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
              },
              {
                "addr": 13740104,
                "value": 57344
              },
              {
                "addr": 13740107,
                "value": 57412
              },
              {
                "addr": 13740110,
                "value": 379011
              },
              {
                "addr": 13740113,
                "value": 0
              }
            ],
            "vram": 8609,
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
                "nonWhite": 60
              },
              "vramCurrent": 8609,
              "lastKey": null
            }
          },
          {
            "target": "hot0A1939",
            "block": 690,
            "step": 691,
            "pc": 661817,
            "prevPc": "0x0A191F",
            "cpu": {
              "pc": 661817,
              "sp": 13740092,
              "af": 63573,
              "bc": 16713208,
              "de": 255,
              "hl": 13922436,
              "ix": 13632946,
              "iy": 13631616,
              "f": 85,
              "halted": false,
              "madl": 1,
              "stepCount": 691
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
                "addr": 13740092,
                "value": 16713733
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
              },
              {
                "addr": 13740104,
                "value": 57344
              },
              {
                "addr": 13740107,
                "value": 57412
              },
              {
                "addr": 13740110,
                "value": 379011
              },
              {
                "addr": 13740113,
                "value": 0
              }
            ],
            "vram": 8609,
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
                "nonWhite": 60
              },
              "vramCurrent": 8609,
              "lastKey": null
            }
          },
          {
            "target": "hot0A1969",
            "block": 691,
            "step": 692,
            "pc": 661865,
            "prevPc": "0x0A1939",
            "cpu": {
              "pc": 661865,
              "sp": 13740092,
              "af": 81,
              "bc": 16712960,
              "de": 255,
              "hl": 13922446,
              "ix": 13632946,
              "iy": 13631616,
              "f": 81,
              "halted": false,
              "madl": 1,
              "stepCount": 692
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
                "addr": 13740092,
                "value": 16713733
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
              },
              {
                "addr": 13740104,
                "value": 57344
              },
              {
                "addr": 13740107,
                "value": 57412
              },
              {
                "addr": 13740110,
                "value": 379011
              },
              {
                "addr": 13740113,
                "value": 0
              }
            ],
            "vram": 8614,
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
                "nonWhite": 65
              },
              "vramCurrent": 8614,
              "lastKey": null
            }
          },
          {
            "target": "hot0A1854",
            "block": 709,
            "step": 710,
            "pc": 661588,
            "prevPc": "0x0A1A1D",
            "cpu": {
              "pc": 661588,
              "sp": 13740095,
              "af": 65282,
              "bc": 16713477,
              "de": 40,
              "hl": 13644918,
              "ix": 13632947,
              "iy": 13631616,
              "f": 2,
              "halted": false,
              "madl": 1,
              "stepCount": 710
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
              },
              {
                "addr": 13740104,
                "value": 57344
              },
              {
                "addr": 13740107,
                "value": 57412
              },
              {
                "addr": 13740110,
                "value": 379011
              },
              {
                "addr": 13740113,
                "value": 0
              },
              {
                "addr": 13740116,
                "value": 13740128
              }
            ],
            "vram": 8619,
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
                "nonWhite": 70
              },
              "vramCurrent": 8619,
              "lastKey": null
            }
          },
          {
            "target": "hot0A187C",
            "block": 710,
            "step": 711,
            "pc": 661628,
            "prevPc": "0x0A1854",
            "cpu": {
              "pc": 661628,
              "sp": 13740095,
              "af": 63572,
              "bc": 16713477,
              "de": 640,
              "hl": 13923076,
              "ix": 13632948,
              "iy": 13631616,
              "f": 84,
              "halted": false,
              "madl": 1,
              "stepCount": 711
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
              },
              {
                "addr": 13740104,
                "value": 57344
              },
              {
                "addr": 13740107,
                "value": 57412
              },
              {
                "addr": 13740110,
                "value": 379011
              },
              {
                "addr": 13740113,
                "value": 0
              },
              {
                "addr": 13740116,
                "value": 13740128
              }
            ],
            "vram": 8619,
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
                "nonWhite": 70
              },
              "vramCurrent": 8619,
              "lastKey": null
            }
          },
          {
            "target": "hot0A188A",
            "block": 711,
            "step": 712,
            "pc": 661642,
            "prevPc": "0x0A187C",
            "cpu": {
              "pc": 661642,
              "sp": 13740095,
              "af": 63572,
              "bc": 16713477,
              "de": 640,
              "hl": 13923076,
              "ix": 13632948,
              "iy": 13631616,
              "f": 84,
              "halted": false,
              "madl": 1,
              "stepCount": 712
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
              },
              {
                "addr": 13740104,
                "value": 57344
              },
              {
                "addr": 13740107,
                "value": 57412
              },
              {
                "addr": 13740110,
                "value": 379011
              },
              {
                "addr": 13740113,
                "value": 0
              },
              {
                "addr": 13740116,
                "value": 13740128
              }
            ],
            "vram": 8619,
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
                "nonWhite": 70
              },
              "vramCurrent": 8619,
              "lastKey": null
            }
          },
          {
            "target": "hot0A189E",
            "block": 712,
            "step": 713,
            "pc": 661662,
            "prevPc": "0x0A188A",
            "cpu": {
              "pc": 661662,
              "sp": 13740092,
              "af": 1364,
              "bc": 16713477,
              "de": 640,
              "hl": 13923076,
              "ix": 13632948,
              "iy": 13631616,
              "f": 84,
              "halted": false,
              "madl": 1,
              "stepCount": 713
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
                "addr": 13740092,
                "value": 16713477
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
              },
              {
                "addr": 13740104,
                "value": 57344
              },
              {
                "addr": 13740107,
                "value": 57412
              },
              {
                "addr": 13740110,
                "value": 379011
              },
              {
                "addr": 13740113,
                "value": 0
              }
            ],
            "vram": 8619,
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
                "nonWhite": 70
              },
              "vramCurrent": 8619,
              "lastKey": null
            }
          }
        ],
        "hotLoop": {
          "firstEntry": {
            "target": "hot0A1854",
            "block": 412,
            "pc": "0x0A1854",
            "prevPc": "0x0A184A",
            "history120": [
              {
                "block": 293,
                "pc": "0x001C44",
                "prevPc": "0x001C3C"
              },
              {
                "block": 294,
                "pc": "0x001C7D",
                "prevPc": "0x001C44"
              },
              {
                "block": 295,
                "pc": "0x001CA6",
                "prevPc": "0x001C7D"
              },
              {
                "block": 296,
                "pc": "0x001CC0",
                "prevPc": "0x001CA6"
              },
              {
                "block": 297,
                "pc": "0x001CCA",
                "prevPc": "0x001CC0"
              },
              {
                "block": 298,
                "pc": "0x001CE4",
                "prevPc": "0x001CCA"
              },
              {
                "block": 299,
                "pc": "0x001C81",
                "prevPc": "0x001CE4"
              },
              {
                "block": 300,
                "pc": "0x001C82",
                "prevPc": "0x001C81"
              },
              {
                "block": 301,
                "pc": "0x001C48",
                "prevPc": "0x001C82"
              },
              {
                "block": 302,
                "pc": "0x001C33",
                "prevPc": "0x001C48"
              },
              {
                "block": 303,
                "pc": "0x001C38",
                "prevPc": "0x001C33"
              },
              {
                "block": 304,
                "pc": "0x001C3C",
                "prevPc": "0x001C38"
              },
              {
                "block": 305,
                "pc": "0x001C42",
                "prevPc": "0x001C3C"
              },
              {
                "block": 306,
                "pc": "0x006810",
                "prevPc": "0x001C42"
              },
              {
                "block": 307,
                "pc": "0x006812",
                "prevPc": "0x006810"
              },
              {
                "block": 308,
                "pc": "0x001C4F",
                "prevPc": "0x006812"
              },
              {
                "block": 309,
                "pc": "0x001CA6",
                "prevPc": "0x001C4F"
              },
              {
                "block": 310,
                "pc": "0x001CC0",
                "prevPc": "0x001CA6"
              },
              {
                "block": 311,
                "pc": "0x001CCA",
                "prevPc": "0x001CC0"
              },
              {
                "block": 312,
                "pc": "0x001CE4",
                "prevPc": "0x001CCA"
              },
              {
                "block": 313,
                "pc": "0x001C54",
                "prevPc": "0x001CE4"
              },
              {
                "block": 314,
                "pc": "0x006816",
                "prevPc": "0x001C54"
              },
              {
                "block": 315,
                "pc": "0x00681E",
                "prevPc": "0x006816"
              },
              {
                "block": 316,
                "pc": "0x006828",
                "prevPc": "0x00681E"
              },
              {
                "block": 317,
                "pc": "0x001727",
                "prevPc": "0x006828"
              },
              {
                "block": 318,
                "pc": "0x000719",
                "prevPc": "0x001727"
              },
              {
                "block": 319,
                "pc": "0x00071D",
                "prevPc": "0x000719"
              },
              {
                "block": 320,
                "pc": "0x02010C",
                "prevPc": "0x00071D"
              },
              {
                "block": 321,
                "pc": "0x03CF7D",
                "prevPc": "0x02010C"
              },
              {
                "block": 322,
                "pc": "0x03CFA4",
                "prevPc": "0x03CF7D"
              },
              {
                "block": 323,
                "pc": "0x03CFCF",
                "prevPc": "0x03CFA4"
              },
              {
                "block": 324,
                "pc": "0x03CFD4",
                "prevPc": "0x03CFCF"
              },
              {
                "block": 325,
                "pc": "0x03CFDB",
                "prevPc": "0x03CFD4"
              },
              {
                "block": 326,
                "pc": "0x03CFE0",
                "prevPc": "0x03CFDB"
              },
              {
                "block": 327,
                "pc": "0x03CFE5",
                "prevPc": "0x03CFE0"
              },
              {
                "block": 328,
                "pc": "0x03CFEA",
                "prevPc": "0x03CFE5"
              },
              {
                "block": 329,
                "pc": "0x03D029",
                "prevPc": "0x03CFEA"
              },
              {
                "block": 330,
                "pc": "0x03D033",
                "prevPc": "0x03D029"
              },
              {
                "block": 331,
                "pc": "0x03D038",
                "prevPc": "0x03D033"
              },
              {
                "block": 332,
                "pc": "0x03D044",
                "prevPc": "0x03D038"
              },
              {
                "block": 333,
                "pc": "0x03D04C",
                "prevPc": "0x03D044"
              },
              {
                "block": 334,
                "pc": "0x03D054",
                "prevPc": "0x03D04C"
              },
              {
                "block": 335,
                "pc": "0x03F994",
                "prevPc": "0x03D054"
              },
              {
                "block": 336,
                "pc": "0x0003D4",
                "prevPc": "0x03F994"
              },
              {
                "block": 337,
                "pc": "0x003CC2",
                "prevPc": "0x0003D4"
              },
              {
                "block": 338,
                "pc": "0x003CD4",
                "prevPc": "0x003CC2"
              },
              {
                "block": 339,
                "pc": "0x003CE0",
                "prevPc": "0x003CD4"
              },
              {
                "block": 340,
                "pc": "0x003CEE",
                "prevPc": "0x003CE0"
              },
              {
                "block": 341,
                "pc": "0x003CF3",
                "prevPc": "0x003CEE"
              },
              {
                "block": 342,
                "pc": "0x03F998",
                "prevPc": "0x003CF3"
              },
              {
                "block": 343,
                "pc": "0x03F99A",
                "prevPc": "0x03F998"
              },
              {
                "block": 344,
                "pc": "0x03F9AB",
                "prevPc": "0x03F99A"
              },
              {
                "block": 345,
                "pc": "0x03F9AE",
                "prevPc": "0x03F9AB"
              },
              {
                "block": 346,
                "pc": "0x03D058",
                "prevPc": "0x03F9AE"
              },
              {
                "block": 347,
                "pc": "0x03D060",
                "prevPc": "0x03D058"
              },
              {
                "block": 348,
                "pc": "0x03D0E0",
                "prevPc": "0x03D060"
              },
              {
                "block": 349,
                "pc": "0x0A34AE",
                "prevPc": "0x03D0E0"
              },
              {
                "block": 350,
                "pc": "0x08C341",
                "prevPc": "0x0A34AE"
              },
              {
                "block": 351,
                "pc": "0x05C75B",
                "prevPc": "0x08C341"
              },
              {
                "block": 352,
                "pc": "0x05C760",
                "prevPc": "0x05C75B"
              },
              {
                "block": 353,
                "pc": "0x05C768",
                "prevPc": "0x05C760"
              },
              {
                "block": 354,
                "pc": "0x05C771",
                "prevPc": "0x05C768"
              },
              {
                "block": 355,
                "pc": "0x05C795",
                "prevPc": "0x05C771"
              },
              {
                "block": 356,
                "pc": "0x05C7A5",
                "prevPc": "0x05C795"
              },
              {
                "block": 357,
                "pc": "0x05C7AD",
                "prevPc": "0x05C7A5"
              },
              {
                "block": 358,
                "pc": "0x05C7B5",
                "prevPc": "0x05C7AD"
              },
              {
                "block": 359,
                "pc": "0x05C7C1",
                "prevPc": "0x05C7B5"
              },
              {
                "block": 360,
                "pc": "0x05C7D7",
                "prevPc": "0x05C7C1"
              },
              {
                "block": 361,
                "pc": "0x05C7DD",
                "prevPc": "0x05C7D7"
              },
              {
                "block": 362,
                "pc": "0x05C7ED",
                "prevPc": "0x05C7DD"
              },
              {
                "block": 363,
                "pc": "0x05C815",
                "prevPc": "0x05C7ED"
              },
              {
                "block": 364,
                "pc": "0x0A237E",
                "prevPc": "0x05C815"
              },
              {
                "block": 365,
                "pc": "0x0A2A37",
                "prevPc": "0x0A237E"
              },
              {
                "block": 366,
                "pc": "0x0A2389",
                "prevPc": "0x0A2A37"
              },
              {
                "block": 367,
                "pc": "0x05C819",
                "prevPc": "0x0A2389"
              },
              {
                "block": 368,
                "pc": "0x05C82C",
                "prevPc": "0x05C819"
              },
              {
                "block": 369,
                "pc": "0x05C832",
                "prevPc": "0x05C82C"
              },
              {
                "block": 370,
                "pc": "0x05E3D6",
                "prevPc": "0x05C832"
              },
              {
                "block": 371,
                "pc": "0x04C973",
                "prevPc": "0x05E3D6"
              },
              {
                "block": 372,
                "pc": "0x05C836",
                "prevPc": "0x04C973"
              },
              {
                "block": 373,
                "pc": "0x05C84D",
                "prevPc": "0x05C836"
              },
              {
                "block": 374,
                "pc": "0x05CA44",
                "prevPc": "0x05C84D"
              },
              {
                "block": 375,
                "pc": "0x05CA4E",
                "prevPc": "0x05CA44"
              },
              {
                "block": 376,
                "pc": "0x05CA57",
                "prevPc": "0x05CA4E"
              },
              {
                "block": 377,
                "pc": "0x05C851",
                "prevPc": "0x05CA57"
              },
              {
                "block": 378,
                "pc": "0x05CBC0",
                "prevPc": "0x05C851"
              },
              {
                "block": 379,
                "pc": "0x05CBC3",
                "prevPc": "0x05CBC0"
              },
              {
                "block": 380,
                "pc": "0x05CBC9",
                "prevPc": "0x05CBC3"
              },
              {
                "block": 381,
                "pc": "0x05C855",
                "prevPc": "0x05CBC9"
              },
              {
                "block": 382,
                "pc": "0x05C875",
                "prevPc": "0x05C855"
              },
              {
                "block": 383,
                "pc": "0x05C87E",
                "prevPc": "0x05C875"
              },
              {
                "block": 384,
                "pc": "0x0A1799",
                "prevPc": "0x05C87E"
              },
              {
                "block": 385,
                "pc": "0x0A17AA",
                "prevPc": "0x0A1799"
              },
              {
                "block": 386,
                "pc": "0x0A237E",
                "prevPc": "0x0A17AA"
              },
              {
                "block": 387,
                "pc": "0x0A2A37",
                "prevPc": "0x0A237E"
              },
              {
                "block": 388,
                "pc": "0x0A2389",
                "prevPc": "0x0A2A37"
              },
              {
                "block": 389,
                "pc": "0x0A17AE",
                "prevPc": "0x0A2389"
              },
              {
                "block": 390,
                "pc": "0x0A17B2",
                "prevPc": "0x0A17AE"
              },
              {
                "block": 391,
                "pc": "0x0A17B8",
                "prevPc": "0x0A17B2"
              },
              {
                "block": 392,
                "pc": "0x07BF3E",
                "prevPc": "0x0A17B8"
              },
              {
                "block": 393,
                "pc": "0x07BF4D",
                "prevPc": "0x07BF3E"
              },
              {
                "block": 394,
                "pc": "0x07BF5C",
                "prevPc": "0x07BF4D"
              },
              {
                "block": 395,
                "pc": "0x000380",
                "prevPc": "0x07BF5C"
              },
              {
                "block": 396,
                "pc": "0x003D85",
                "prevPc": "0x000380"
              },
              {
                "block": 397,
                "pc": "0x07BF61",
                "prevPc": "0x003D85"
              },
              {
                "block": 398,
                "pc": "0x0A17C5",
                "prevPc": "0x07BF61"
              },
              {
                "block": 399,
                "pc": "0x0A2D4C",
                "prevPc": "0x0A17C5"
              },
              {
                "block": 400,
                "pc": "0x0A17D0",
                "prevPc": "0x0A2D4C"
              },
              {
                "block": 401,
                "pc": "0x00038C",
                "prevPc": "0x0A17D0"
              },
              {
                "block": 402,
                "pc": "0x005A53",
                "prevPc": "0x00038C"
              },
              {
                "block": 403,
                "pc": "0x0A17E9",
                "prevPc": "0x005A53"
              },
              {
                "block": 404,
                "pc": "0x0A17EF",
                "prevPc": "0x0A17E9"
              },
              {
                "block": 405,
                "pc": "0x0A17F7",
                "prevPc": "0x0A17EF"
              },
              {
                "block": 406,
                "pc": "0x0A1805",
                "prevPc": "0x0A17F7"
              },
              {
                "block": 407,
                "pc": "0x0A180B",
                "prevPc": "0x0A1805"
              },
              {
                "block": 408,
                "pc": "0x0A1838",
                "prevPc": "0x0A180B"
              },
              {
                "block": 409,
                "pc": "0x0A1A8F",
                "prevPc": "0x0A1838"
              },
              {
                "block": 410,
                "pc": "0x0A183D",
                "prevPc": "0x0A1A8F"
              },
              {
                "block": 411,
                "pc": "0x0A184A",
                "prevPc": "0x0A183D"
              },
              {
                "block": 412,
                "pc": "0x0A1854",
                "prevPc": "0x0A184A"
              }
            ],
            "snapshot": {
              "block": 412,
              "step": 413,
              "pc": 661588,
              "prevPc": "0x0A184A",
              "cpu": {
                "pc": 661588,
                "sp": 13740095,
                "af": 84,
                "bc": 16716028,
                "de": 13644278,
                "hl": 13644558,
                "ix": 13632929,
                "iy": 13631616,
                "f": 84,
                "halted": false,
                "madl": 1,
                "stepCount": 413
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
                },
                {
                  "addr": 13740104,
                  "value": 57344
                },
                {
                  "addr": 13740107,
                  "value": 57412
                },
                {
                  "addr": 13740110,
                  "value": 379011
                },
                {
                  "addr": 13740113,
                  "value": 0
                },
                {
                  "addr": 13740116,
                  "value": 13740128
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
            }
          },
          "threshold": 512,
          "thresholdHit": {
            "target": "hot0A1854",
            "count": 512,
            "block": 16460,
            "pc": "0x0A1854",
            "prevPc": "0x0A1A1D",
            "history120": [
              {
                "block": 16341,
                "pc": "0x0A19D7",
                "prevPc": "0x0A19CC"
              },
              {
                "block": 16342,
                "pc": "0x0A1A1D",
                "prevPc": "0x0A19D7"
              },
              {
                "block": 16343,
                "pc": "0x0A1854",
                "prevPc": "0x0A1A1D"
              },
              {
                "block": 16344,
                "pc": "0x0A187C",
                "prevPc": "0x0A1854"
              },
              {
                "block": 16345,
                "pc": "0x0A188A",
                "prevPc": "0x0A187C"
              },
              {
                "block": 16346,
                "pc": "0x0A189E",
                "prevPc": "0x0A188A"
              },
              {
                "block": 16347,
                "pc": "0x0A190D",
                "prevPc": "0x0A189E"
              },
              {
                "block": 16348,
                "pc": "0x0A191F",
                "prevPc": "0x0A190D"
              },
              {
                "block": 16349,
                "pc": "0x0A1939",
                "prevPc": "0x0A191F"
              },
              {
                "block": 16350,
                "pc": "0x0A1969",
                "prevPc": "0x0A1939"
              },
              {
                "block": 16351,
                "pc": "0x0A1976",
                "prevPc": "0x0A1969"
              },
              {
                "block": 16352,
                "pc": "0x0A1980",
                "prevPc": "0x0A1976"
              },
              {
                "block": 16353,
                "pc": "0x0A19CC",
                "prevPc": "0x0A1980"
              },
              {
                "block": 16354,
                "pc": "0x0A19D7",
                "prevPc": "0x0A19CC"
              },
              {
                "block": 16355,
                "pc": "0x0A1A1D",
                "prevPc": "0x0A19D7"
              },
              {
                "block": 16356,
                "pc": "0x0A1854",
                "prevPc": "0x0A1A1D"
              },
              {
                "block": 16357,
                "pc": "0x0A187C",
                "prevPc": "0x0A1854"
              },
              {
                "block": 16358,
                "pc": "0x0A188A",
                "prevPc": "0x0A187C"
              },
              {
                "block": 16359,
                "pc": "0x0A189E",
                "prevPc": "0x0A188A"
              },
              {
                "block": 16360,
                "pc": "0x0A190D",
                "prevPc": "0x0A189E"
              },
              {
                "block": 16361,
                "pc": "0x0A191F",
                "prevPc": "0x0A190D"
              },
              {
                "block": 16362,
                "pc": "0x0A1939",
                "prevPc": "0x0A191F"
              },
              {
                "block": 16363,
                "pc": "0x0A1969",
                "prevPc": "0x0A1939"
              },
              {
                "block": 16364,
                "pc": "0x0A1976",
                "prevPc": "0x0A1969"
              },
              {
                "block": 16365,
                "pc": "0x0A1980",
                "prevPc": "0x0A1976"
              },
              {
                "block": 16366,
                "pc": "0x0A19CC",
                "prevPc": "0x0A1980"
              },
              {
                "block": 16367,
                "pc": "0x0A19D7",
                "prevPc": "0x0A19CC"
              },
              {
                "block": 16368,
                "pc": "0x0A1A1D",
                "prevPc": "0x0A19D7"
              },
              {
                "block": 16369,
                "pc": "0x0A1854",
                "prevPc": "0x0A1A1D"
              },
              {
                "block": 16370,
                "pc": "0x0A187C",
                "prevPc": "0x0A1854"
              },
              {
                "block": 16371,
                "pc": "0x0A188A",
                "prevPc": "0x0A187C"
              },
              {
                "block": 16372,
                "pc": "0x0A189E",
                "prevPc": "0x0A188A"
              },
              {
                "block": 16373,
                "pc": "0x0A190D",
                "prevPc": "0x0A189E"
              },
              {
                "block": 16374,
                "pc": "0x0A191F",
                "prevPc": "0x0A190D"
              },
              {
                "block": 16375,
                "pc": "0x0A1939",
                "prevPc": "0x0A191F"
              },
              {
                "block": 16376,
                "pc": "0x0A1969",
                "prevPc": "0x0A1939"
              },
              {
                "block": 16377,
                "pc": "0x0A1976",
                "prevPc": "0x0A1969"
              },
              {
                "block": 16378,
                "pc": "0x0A1980",
                "prevPc": "0x0A1976"
              },
              {
                "block": 16379,
                "pc": "0x0A19CC",
                "prevPc": "0x0A1980"
              },
              {
                "block": 16380,
                "pc": "0x0A19D7",
                "prevPc": "0x0A19CC"
              },
              {
                "block": 16381,
                "pc": "0x0A1A1D",
                "prevPc": "0x0A19D7"
              },
              {
                "block": 16382,
                "pc": "0x0A1854",
                "prevPc": "0x0A1A1D"
              },
              {
                "block": 16383,
                "pc": "0x0A187C",
                "prevPc": "0x0A1854"
              },
              {
                "block": 16384,
                "pc": "0x0A188A",
                "prevPc": "0x0A187C"
              },
              {
                "block": 16385,
                "pc": "0x0A189E",
                "prevPc": "0x0A188A"
              },
              {
                "block": 16386,
                "pc": "0x0A190D",
                "prevPc": "0x0A189E"
              },
              {
                "block": 16387,
                "pc": "0x0A191F",
                "prevPc": "0x0A190D"
              },
              {
                "block": 16388,
                "pc": "0x0A1939",
                "prevPc": "0x0A191F"
              },
              {
                "block": 16389,
                "pc": "0x0A1969",
                "prevPc": "0x0A1939"
              },
              {
                "block": 16390,
                "pc": "0x0A1976",
                "prevPc": "0x0A1969"
              },
              {
                "block": 16391,
                "pc": "0x0A1980",
                "prevPc": "0x0A1976"
              },
              {
                "block": 16392,
                "pc": "0x0A19CC",
                "prevPc": "0x0A1980"
              },
              {
                "block": 16393,
                "pc": "0x0A19D7",
                "prevPc": "0x0A19CC"
              },
              {
                "block": 16394,
                "pc": "0x0A1A1D",
                "prevPc": "0x0A19D7"
              },
              {
                "block": 16395,
                "pc": "0x0A1854",
                "prevPc": "0x0A1A1D"
              },
              {
                "block": 16396,
                "pc": "0x0A187C",
                "prevPc": "0x0A1854"
              },
              {
                "block": 16397,
                "pc": "0x0A188A",
                "prevPc": "0x0A187C"
              },
              {
                "block": 16398,
                "pc": "0x0A189E",
                "prevPc": "0x0A188A"
              },
              {
                "block": 16399,
                "pc": "0x0A190D",
                "prevPc": "0x0A189E"
              },
              {
                "block": 16400,
                "pc": "0x0A191F",
                "prevPc": "0x0A190D"
              },
              {
                "block": 16401,
                "pc": "0x0A1939",
                "prevPc": "0x0A191F"
              },
              {
                "block": 16402,
                "pc": "0x0A1969",
                "prevPc": "0x0A1939"
              },
              {
                "block": 16403,
                "pc": "0x0A1976",
                "prevPc": "0x0A1969"
              },
              {
                "block": 16404,
                "pc": "0x0A1980",
                "prevPc": "0x0A1976"
              },
              {
                "block": 16405,
                "pc": "0x0A19CC",
                "prevPc": "0x0A1980"
              },
              {
                "block": 16406,
                "pc": "0x0A19D7",
                "prevPc": "0x0A19CC"
              },
              {
                "block": 16407,
                "pc": "0x0A1A1D",
                "prevPc": "0x0A19D7"
              },
              {
                "block": 16408,
                "pc": "0x0A1854",
                "prevPc": "0x0A1A1D"
              },
              {
                "block": 16409,
                "pc": "0x0A187C",
                "prevPc": "0x0A1854"
              },
              {
                "block": 16410,
                "pc": "0x0A188A",
                "prevPc": "0x0A187C"
              },
              {
                "block": 16411,
                "pc": "0x0A189E",
                "prevPc": "0x0A188A"
              },
              {
                "block": 16412,
                "pc": "0x0A190D",
                "prevPc": "0x0A189E"
              },
              {
                "block": 16413,
                "pc": "0x0A191F",
                "prevPc": "0x0A190D"
              },
              {
                "block": 16414,
                "pc": "0x0A1939",
                "prevPc": "0x0A191F"
              },
              {
                "block": 16415,
                "pc": "0x0A1969",
                "prevPc": "0x0A1939"
              },
              {
                "block": 16416,
                "pc": "0x0A1976",
                "prevPc": "0x0A1969"
              },
              {
                "block": 16417,
                "pc": "0x0A1980",
                "prevPc": "0x0A1976"
              },
              {
                "block": 16418,
                "pc": "0x0A19CC",
                "prevPc": "0x0A1980"
              },
              {
                "block": 16419,
                "pc": "0x0A19D7",
                "prevPc": "0x0A19CC"
              },
              {
                "block": 16420,
                "pc": "0x0A1A1D",
                "prevPc": "0x0A19D7"
              },
              {
                "block": 16421,
                "pc": "0x0A1854",
                "prevPc": "0x0A1A1D"
              },
              {
                "block": 16422,
                "pc": "0x0A187C",
                "prevPc": "0x0A1854"
              },
              {
                "block": 16423,
                "pc": "0x0A188A",
                "prevPc": "0x0A187C"
              },
              {
                "block": 16424,
                "pc": "0x0A189E",
                "prevPc": "0x0A188A"
              },
              {
                "block": 16425,
                "pc": "0x0A190D",
                "prevPc": "0x0A189E"
              },
              {
                "block": 16426,
                "pc": "0x0A191F",
                "prevPc": "0x0A190D"
              },
              {
                "block": 16427,
                "pc": "0x0A1939",
                "prevPc": "0x0A191F"
              },
              {
                "block": 16428,
                "pc": "0x0A1969",
                "prevPc": "0x0A1939"
              },
              {
                "block": 16429,
                "pc": "0x0A1976",
                "prevPc": "0x0A1969"
              },
              {
                "block": 16430,
                "pc": "0x0A1980",
                "prevPc": "0x0A1976"
              },
              {
                "block": 16431,
                "pc": "0x0A19CC",
                "prevPc": "0x0A1980"
              },
              {
                "block": 16432,
                "pc": "0x0A19D7",
                "prevPc": "0x0A19CC"
              },
              {
                "block": 16433,
                "pc": "0x0A1A1D",
                "prevPc": "0x0A19D7"
              },
              {
                "block": 16434,
                "pc": "0x0A1854",
                "prevPc": "0x0A1A1D"
              },
              {
                "block": 16435,
                "pc": "0x0A187C",
                "prevPc": "0x0A1854"
              },
              {
                "block": 16436,
                "pc": "0x0A188A",
                "prevPc": "0x0A187C"
              },
              {
                "block": 16437,
                "pc": "0x0A189E",
                "prevPc": "0x0A188A"
              },
              {
                "block": 16438,
                "pc": "0x0A190D",
                "prevPc": "0x0A189E"
              },
              {
                "block": 16439,
                "pc": "0x0A191F",
                "prevPc": "0x0A190D"
              },
              {
                "block": 16440,
                "pc": "0x0A1939",
                "prevPc": "0x0A191F"
              },
              {
                "block": 16441,
                "pc": "0x0A1969",
                "prevPc": "0x0A1939"
              },
              {
                "block": 16442,
                "pc": "0x0A1976",
                "prevPc": "0x0A1969"
              },
              {
                "block": 16443,
                "pc": "0x0A1980",
                "prevPc": "0x0A1976"
              },
              {
                "block": 16444,
                "pc": "0x0A19CC",
                "prevPc": "0x0A1980"
              },
              {
                "block": 16445,
                "pc": "0x0A19D7",
                "prevPc": "0x0A19CC"
              },
              {
                "block": 16446,
                "pc": "0x0A1A1D",
                "prevPc": "0x0A19D7"
              },
              {
                "block": 16447,
                "pc": "0x0A1854",
                "prevPc": "0x0A1A1D"
              },
              {
                "block": 16448,
                "pc": "0x0A187C",
                "prevPc": "0x0A1854"
              },
              {
                "block": 16449,
                "pc": "0x0A188A",
                "prevPc": "0x0A187C"
              },
              {
                "block": 16450,
                "pc": "0x0A189E",
                "prevPc": "0x0A188A"
              },
              {
                "block": 16451,
                "pc": "0x0A190D",
                "prevPc": "0x0A189E"
              },
              {
                "block": 16452,
                "pc": "0x0A191F",
                "prevPc": "0x0A190D"
              },
              {
                "block": 16453,
                "pc": "0x0A1939",
                "prevPc": "0x0A191F"
              },
              {
                "block": 16454,
                "pc": "0x0A1969",
                "prevPc": "0x0A1939"
              },
              {
                "block": 16455,
                "pc": "0x0A1976",
                "prevPc": "0x0A1969"
              },
              {
                "block": 16456,
                "pc": "0x0A1980",
                "prevPc": "0x0A1976"
              },
              {
                "block": 16457,
                "pc": "0x0A19CC",
                "prevPc": "0x0A1980"
              },
              {
                "block": 16458,
                "pc": "0x0A19D7",
                "prevPc": "0x0A19CC"
              },
              {
                "block": 16459,
                "pc": "0x0A1A1D",
                "prevPc": "0x0A19D7"
              },
              {
                "block": 16460,
                "pc": "0x0A1854",
                "prevPc": "0x0A1A1D"
              }
            ],
            "snapshot": {
              "block": 16460,
              "step": 16472,
              "pc": 661588,
              "prevPc": "0x0A1A1D",
              "cpu": {
                "pc": 661588,
                "sp": 13740077,
                "af": 65282,
                "bc": 16711941,
                "de": 40,
                "hl": 20440,
                "ix": 13632959,
                "iy": 13631616,
                "f": 2,
                "halted": false,
                "madl": 1,
                "stepCount": 16472
              },
              "fields": {
                "D007CA": 361961,
                "D008E0": 13740131,
                "D0243A": 13740246,
                "D0243D": 13805596,
                "D02590": 13893249,
                "D02A40": 0,
                "D00595": 254,
                "D00596": 19,
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
                  "addr": 13740077,
                  "value": 13740128
                },
                {
                  "addr": 13740080,
                  "value": 659811
                },
                {
                  "addr": 13740083,
                  "value": 0
                },
                {
                  "addr": 13740086,
                  "value": 256
                },
                {
                  "addr": 13740089,
                  "value": 16130
                },
                {
                  "addr": 13740092,
                  "value": 666627
                },
                {
                  "addr": 13740095,
                  "value": 0
                },
                {
                  "addr": 13740098,
                  "value": 68
                }
              ],
              "vram": 8288,
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
                  "D0243D": 13805596,
                  "D02A40": 0,
                  "D02A28": 0
                }
              },
              "editLine": {
                "D007CA": 361961,
                "D008E0": 13740131,
                "D0243A": 13740246,
                "D0243D": 13805596,
                "D02590": 13893249,
                "D00595": 254,
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
                  "nonWhite": 432
                },
                "vramCurrent": 8288,
                "lastKey": null
              }
            }
          },
          "postReplayFirstEntry": {
            "target": "hot0A1854",
            "block": 8197,
            "pc": "0x0A1854",
            "prevPc": "0x0A184A",
            "history120": [
              {
                "block": 8078,
                "pc": "0x03D058",
                "prevPc": "0x03F9AE"
              },
              {
                "block": 8079,
                "pc": "0x03D060",
                "prevPc": "0x03D058"
              },
              {
                "block": 8080,
                "pc": "0x03D0E0",
                "prevPc": "0x03D060"
              },
              {
                "block": 8081,
                "pc": "0x000038",
                "prevPc": "0x03D0E0"
              },
              {
                "block": 8082,
                "pc": "0x0006F3",
                "prevPc": "0x000038"
              },
              {
                "block": 8083,
                "pc": "0x000704",
                "prevPc": "0x0006F3"
              },
              {
                "block": 8084,
                "pc": "0x000710",
                "prevPc": "0x000704"
              },
              {
                "block": 8085,
                "pc": "0x001713",
                "prevPc": "0x000710"
              },
              {
                "block": 8086,
                "pc": "0x0008BB",
                "prevPc": "0x001713"
              },
              {
                "block": 8087,
                "pc": "0x001717",
                "prevPc": "0x0008BB"
              },
              {
                "block": 8088,
                "pc": "0x001718",
                "prevPc": "0x001717"
              },
              {
                "block": 8089,
                "pc": "0x00171E",
                "prevPc": "0x001718"
              },
              {
                "block": 8090,
                "pc": "0x0067F8",
                "prevPc": "0x00171E"
              },
              {
                "block": 8091,
                "pc": "0x001C4F",
                "prevPc": "0x0067F8"
              },
              {
                "block": 8092,
                "pc": "0x001CA6",
                "prevPc": "0x001C4F"
              },
              {
                "block": 8093,
                "pc": "0x001CC0",
                "prevPc": "0x001CA6"
              },
              {
                "block": 8094,
                "pc": "0x001CCA",
                "prevPc": "0x001CC0"
              },
              {
                "block": 8095,
                "pc": "0x001CCE",
                "prevPc": "0x001CCA"
              },
              {
                "block": 8096,
                "pc": "0x001CD5",
                "prevPc": "0x001CCE"
              },
              {
                "block": 8097,
                "pc": "0x001CE5",
                "prevPc": "0x001CD5"
              },
              {
                "block": 8098,
                "pc": "0x001C54",
                "prevPc": "0x001CE5"
              },
              {
                "block": 8099,
                "pc": "0x006808",
                "prevPc": "0x001C54"
              },
              {
                "block": 8100,
                "pc": "0x001C33",
                "prevPc": "0x006808"
              },
              {
                "block": 8101,
                "pc": "0x001C38",
                "prevPc": "0x001C33"
              },
              {
                "block": 8102,
                "pc": "0x001C3C",
                "prevPc": "0x001C38"
              },
              {
                "block": 8103,
                "pc": "0x001C44",
                "prevPc": "0x001C3C"
              },
              {
                "block": 8104,
                "pc": "0x001C7D",
                "prevPc": "0x001C44"
              },
              {
                "block": 8105,
                "pc": "0x001CA6",
                "prevPc": "0x001C7D"
              },
              {
                "block": 8106,
                "pc": "0x001CC0",
                "prevPc": "0x001CA6"
              },
              {
                "block": 8107,
                "pc": "0x001CCA",
                "prevPc": "0x001CC0"
              },
              {
                "block": 8108,
                "pc": "0x001CE4",
                "prevPc": "0x001CCA"
              },
              {
                "block": 8109,
                "pc": "0x001C81",
                "prevPc": "0x001CE4"
              },
              {
                "block": 8110,
                "pc": "0x001C82",
                "prevPc": "0x001C81"
              },
              {
                "block": 8111,
                "pc": "0x001C48",
                "prevPc": "0x001C82"
              },
              {
                "block": 8112,
                "pc": "0x001C33",
                "prevPc": "0x001C48"
              },
              {
                "block": 8113,
                "pc": "0x001C38",
                "prevPc": "0x001C33"
              },
              {
                "block": 8114,
                "pc": "0x001C3C",
                "prevPc": "0x001C38"
              },
              {
                "block": 8115,
                "pc": "0x001C44",
                "prevPc": "0x001C3C"
              },
              {
                "block": 8116,
                "pc": "0x001C7D",
                "prevPc": "0x001C44"
              },
              {
                "block": 8117,
                "pc": "0x001CA6",
                "prevPc": "0x001C7D"
              },
              {
                "block": 8118,
                "pc": "0x001CC0",
                "prevPc": "0x001CA6"
              },
              {
                "block": 8119,
                "pc": "0x001CCA",
                "prevPc": "0x001CC0"
              },
              {
                "block": 8120,
                "pc": "0x001CE4",
                "prevPc": "0x001CCA"
              },
              {
                "block": 8121,
                "pc": "0x001C81",
                "prevPc": "0x001CE4"
              },
              {
                "block": 8122,
                "pc": "0x001C82",
                "prevPc": "0x001C81"
              },
              {
                "block": 8123,
                "pc": "0x001C48",
                "prevPc": "0x001C82"
              },
              {
                "block": 8124,
                "pc": "0x001C33",
                "prevPc": "0x001C48"
              },
              {
                "block": 8125,
                "pc": "0x001C38",
                "prevPc": "0x001C33"
              },
              {
                "block": 8126,
                "pc": "0x001C3C",
                "prevPc": "0x001C38"
              },
              {
                "block": 8127,
                "pc": "0x001C44",
                "prevPc": "0x001C3C"
              },
              {
                "block": 8128,
                "pc": "0x001C7D",
                "prevPc": "0x001C44"
              },
              {
                "block": 8129,
                "pc": "0x001CA6",
                "prevPc": "0x001C7D"
              },
              {
                "block": 8130,
                "pc": "0x001CC0",
                "prevPc": "0x001CA6"
              },
              {
                "block": 8131,
                "pc": "0x001CCA",
                "prevPc": "0x001CC0"
              },
              {
                "block": 8132,
                "pc": "0x001CE4",
                "prevPc": "0x001CCA"
              },
              {
                "block": 8133,
                "pc": "0x001C81",
                "prevPc": "0x001CE4"
              },
              {
                "block": 8134,
                "pc": "0x001C82",
                "prevPc": "0x001C81"
              },
              {
                "block": 8135,
                "pc": "0x001C48",
                "prevPc": "0x001C82"
              },
              {
                "block": 8136,
                "pc": "0x001C33",
                "prevPc": "0x001C48"
              },
              {
                "block": 8137,
                "pc": "0x001C38",
                "prevPc": "0x001C33"
              },
              {
                "block": 8138,
                "pc": "0x001C3C",
                "prevPc": "0x001C38"
              },
              {
                "block": 8139,
                "pc": "0x001C44",
                "prevPc": "0x001C3C"
              },
              {
                "block": 8140,
                "pc": "0x001C7D",
                "prevPc": "0x001C44"
              },
              {
                "block": 8141,
                "pc": "0x001CA6",
                "prevPc": "0x001C7D"
              },
              {
                "block": 8142,
                "pc": "0x001CC0",
                "prevPc": "0x001CA6"
              },
              {
                "block": 8143,
                "pc": "0x001CCA",
                "prevPc": "0x001CC0"
              },
              {
                "block": 8144,
                "pc": "0x001CE4",
                "prevPc": "0x001CCA"
              },
              {
                "block": 8145,
                "pc": "0x001C81",
                "prevPc": "0x001CE4"
              },
              {
                "block": 8146,
                "pc": "0x001C82",
                "prevPc": "0x001C81"
              },
              {
                "block": 8147,
                "pc": "0x001C48",
                "prevPc": "0x001C82"
              },
              {
                "block": 8148,
                "pc": "0x001C33",
                "prevPc": "0x001C48"
              },
              {
                "block": 8149,
                "pc": "0x001C38",
                "prevPc": "0x001C33"
              },
              {
                "block": 8150,
                "pc": "0x001C3C",
                "prevPc": "0x001C38"
              },
              {
                "block": 8151,
                "pc": "0x001C42",
                "prevPc": "0x001C3C"
              },
              {
                "block": 8152,
                "pc": "0x006810",
                "prevPc": "0x001C42"
              },
              {
                "block": 8153,
                "pc": "0x006812",
                "prevPc": "0x006810"
              },
              {
                "block": 8154,
                "pc": "0x001C4F",
                "prevPc": "0x006812"
              },
              {
                "block": 8155,
                "pc": "0x001CA6",
                "prevPc": "0x001C4F"
              },
              {
                "block": 8156,
                "pc": "0x001CC0",
                "prevPc": "0x001CA6"
              },
              {
                "block": 8157,
                "pc": "0x001CCA",
                "prevPc": "0x001CC0"
              },
              {
                "block": 8158,
                "pc": "0x001CE4",
                "prevPc": "0x001CCA"
              },
              {
                "block": 8159,
                "pc": "0x001C54",
                "prevPc": "0x001CE4"
              },
              {
                "block": 8160,
                "pc": "0x006816",
                "prevPc": "0x001C54"
              },
              {
                "block": 8161,
                "pc": "0x00681E",
                "prevPc": "0x006816"
              },
              {
                "block": 8162,
                "pc": "0x006828",
                "prevPc": "0x00681E"
              },
              {
                "block": 8163,
                "pc": "0x001727",
                "prevPc": "0x006828"
              },
              {
                "block": 8164,
                "pc": "0x000719",
                "prevPc": "0x001727"
              },
              {
                "block": 8165,
                "pc": "0x00071D",
                "prevPc": "0x000719"
              },
              {
                "block": 8166,
                "pc": "0x02010C",
                "prevPc": "0x00071D"
              },
              {
                "block": 8167,
                "pc": "0x03CF7D",
                "prevPc": "0x02010C"
              },
              {
                "block": 8168,
                "pc": "0x03CFA4",
                "prevPc": "0x03CF7D"
              },
              {
                "block": 8169,
                "pc": "0x03CFCF",
                "prevPc": "0x03CFA4"
              },
              {
                "block": 8170,
                "pc": "0x03CFFE",
                "prevPc": "0x03CFCF"
              },
              {
                "block": 8171,
                "pc": "0x03D0E0",
                "prevPc": "0x03CFFE"
              },
              {
                "block": 8172,
                "pc": "0x0A20EE",
                "prevPc": "0x03D0E0"
              },
              {
                "block": 8173,
                "pc": "0x0A20F1",
                "prevPc": "0x0A20EE"
              },
              {
                "block": 8174,
                "pc": "0x0A2C16",
                "prevPc": "0x0A20F1"
              },
              {
                "block": 8175,
                "pc": "0x0A2BFD",
                "prevPc": "0x0A2C16"
              },
              {
                "block": 8176,
                "pc": "0x0A1799",
                "prevPc": "0x0A2BFD"
              },
              {
                "block": 8177,
                "pc": "0x0A17AF",
                "prevPc": "0x0A1799"
              },
              {
                "block": 8178,
                "pc": "0x0A17B2",
                "prevPc": "0x0A17AF"
              },
              {
                "block": 8179,
                "pc": "0x0A17B8",
                "prevPc": "0x0A17B2"
              },
              {
                "block": 8180,
                "pc": "0x07BF3E",
                "prevPc": "0x0A17B8"
              },
              {
                "block": 8181,
                "pc": "0x07BF4D",
                "prevPc": "0x07BF3E"
              },
              {
                "block": 8182,
                "pc": "0x07BF5C",
                "prevPc": "0x07BF4D"
              },
              {
                "block": 8183,
                "pc": "0x000380",
                "prevPc": "0x07BF5C"
              },
              {
                "block": 8184,
                "pc": "0x003D85",
                "prevPc": "0x000380"
              },
              {
                "block": 8185,
                "pc": "0x07BF61",
                "prevPc": "0x003D85"
              },
              {
                "block": 8186,
                "pc": "0x0A17C5",
                "prevPc": "0x07BF61"
              },
              {
                "block": 8187,
                "pc": "0x0A2D4C",
                "prevPc": "0x0A17C5"
              },
              {
                "block": 8188,
                "pc": "0x0A17D0",
                "prevPc": "0x0A2D4C"
              },
              {
                "block": 8189,
                "pc": "0x00038C",
                "prevPc": "0x0A17D0"
              },
              {
                "block": 8190,
                "pc": "0x005A53",
                "prevPc": "0x00038C"
              },
              {
                "block": 8191,
                "pc": "0x0A17E9",
                "prevPc": "0x005A53"
              },
              {
                "block": 8192,
                "pc": "0x0A17EF",
                "prevPc": "0x0A17E9"
              },
              {
                "block": 8193,
                "pc": "0x0A17F7",
                "prevPc": "0x0A17EF"
              },
              {
                "block": 8194,
                "pc": "0x0A1805",
                "prevPc": "0x0A17F7"
              },
              {
                "block": 8195,
                "pc": "0x0A1842",
                "prevPc": "0x0A1805"
              },
              {
                "block": 8196,
                "pc": "0x0A184A",
                "prevPc": "0x0A1842"
              },
              {
                "block": 8197,
                "pc": "0x0A1854",
                "prevPc": "0x0A184A"
              }
            ],
            "snapshot": {
              "block": 8197,
              "step": 8209,
              "pc": 661588,
              "prevPc": "0x0A184A",
              "cpu": {
                "pc": 661588,
                "sp": 13740077,
                "af": 596,
                "bc": 16716028,
                "de": 13916676,
                "hl": 2,
                "ix": 13632929,
                "iy": 13631616,
                "f": 84,
                "halted": false,
                "madl": 1,
                "stepCount": 8209
              },
              "fields": {
                "D007CA": 361961,
                "D008E0": 13740131,
                "D0243A": 13740279,
                "D0243D": 13805629,
                "D02590": 13893249,
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
                  "addr": 13740077,
                  "value": 13740128
                },
                {
                  "addr": 13740080,
                  "value": 659811
                },
                {
                  "addr": 13740083,
                  "value": 0
                },
                {
                  "addr": 13740086,
                  "value": 256
                },
                {
                  "addr": 13740089,
                  "value": 16194
                },
                {
                  "addr": 13740092,
                  "value": 666627
                },
                {
                  "addr": 13740095,
                  "value": 0
                },
                {
                  "addr": 13740098,
                  "value": 68
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
                  "D0243D": 13805629,
                  "D02A40": 0,
                  "D02A28": 0
                }
              },
              "editLine": {
                "D007CA": 361961,
                "D008E0": 13740131,
                "D0243A": 13740279,
                "D0243D": 13805629,
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
                  "nonWhite": 384
                },
                "vramCurrent": 10789,
                "lastKey": null
              }
            }
          }
        },
        "postReplayHotCounts": {
          "hot0A1854": 512,
          "hot0A187C": 511,
          "hot0A188A": 511,
          "hot0A189E": 511,
          "hot0A190D": 511,
          "hot0A191F": 511,
          "hot0A1939": 511,
          "hot0A1969": 511
        },
        "zeroNeighborhoodSamples": [
          {
            "block": 4970,
            "step": 4980,
            "pc": "0x0A321D",
            "prevPc": "0x0A20EA",
            "cpu": {
              "pc": 668189,
              "sp": 13740080,
              "af": 65336,
              "bc": 256,
              "de": 13632917,
              "hl": 13640964,
              "ix": 13740128,
              "iy": 13631616,
              "f": 56,
              "halted": false,
              "madl": 1,
              "stepCount": 4980
            },
            "fields": {
              "D007CA": 361961,
              "D008E0": 13740131,
              "D0243A": 13740279,
              "D0243D": 13805629,
              "D02590": 13893249,
              "D02A40": 13805630,
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
              "D02A1B": 0,
              "D01150": 0,
              "D0059A": 0
            },
            "stackTop": [
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
              },
              {
                "addr": 13740095,
                "value": 0
              },
              {
                "addr": 13740098,
                "value": 68
              },
              {
                "addr": 13740101,
                "value": 13805629
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
                "D0243D": 13805629,
                "D02A40": 13805630,
                "D02A28": 0
              }
            },
            "editLine": {
              "D007CA": 361961,
              "D008E0": 13740131,
              "D0243A": 13740279,
              "D0243D": 13805629,
              "D02590": 13893249,
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
                "nonWhite": 36
              },
              "vramCurrent": 8585,
              "lastKey": null
            },
            "historyTail": [
              {
                "block": 4955,
                "pc": "0x05E7D1",
                "prevPc": "0x05E26C"
              },
              {
                "block": 4956,
                "pc": "0x05E7D2",
                "prevPc": "0x05E7D1"
              },
              {
                "block": 4957,
                "pc": "0x0A2B72",
                "prevPc": "0x05E7D2"
              },
              {
                "block": 4958,
                "pc": "0x0A2A68",
                "prevPc": "0x0A2B72"
              },
              {
                "block": 4959,
                "pc": "0x0A2AF9",
                "prevPc": "0x0A2A68"
              },
              {
                "block": 4960,
                "pc": "0x0A2B16",
                "prevPc": "0x0A2AF9"
              },
              {
                "block": 4961,
                "pc": "0x0A2B51",
                "prevPc": "0x0A2B16"
              },
              {
                "block": 4962,
                "pc": "0x0A2B7E",
                "prevPc": "0x0A2B51"
              },
              {
                "block": 4963,
                "pc": "0x0A2B8F",
                "prevPc": "0x0A2B7E"
              },
              {
                "block": 4964,
                "pc": "0x0A2BEB",
                "prevPc": "0x0A2B8F"
              },
              {
                "block": 4965,
                "pc": "0x0A2C0C",
                "prevPc": "0x0A2BEB"
              },
              {
                "block": 4966,
                "pc": "0x0A2C10",
                "prevPc": "0x0A2C0C"
              },
              {
                "block": 4967,
                "pc": "0x0A20CC",
                "prevPc": "0x0A2C10"
              },
              {
                "block": 4968,
                "pc": "0x0A20E4",
                "prevPc": "0x0A20CC"
              },
              {
                "block": 4969,
                "pc": "0x0A20EA",
                "prevPc": "0x0A20E4"
              },
              {
                "block": 4970,
                "pc": "0x0A321D",
                "prevPc": "0x0A20EA"
              }
            ]
          },
          {
            "block": 4972,
            "step": 4982,
            "pc": "0x0A31FD",
            "prevPc": "0x0A322B",
            "cpu": {
              "pc": 668157,
              "sp": 13740059,
              "af": 68,
              "bc": 256,
              "de": 13632917,
              "hl": 13640964,
              "ix": 13640964,
              "iy": 13631616,
              "f": 68,
              "halted": false,
              "madl": 1,
              "stepCount": 4982
            },
            "fields": {
              "D007CA": 361961,
              "D008E0": 13740131,
              "D0243A": 13740279,
              "D0243D": 13805629,
              "D02590": 13893249,
              "D02A40": 13805630,
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
              "D02A1B": 0,
              "D01150": 0,
              "D0059A": 0
            },
            "stackTop": [
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
              },
              {
                "addr": 13740080,
                "value": 663790
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
                "D0243D": 13805629,
                "D02A40": 13805630,
                "D02A28": 0
              }
            },
            "editLine": {
              "D007CA": 361961,
              "D008E0": 13740131,
              "D0243A": 13740279,
              "D0243D": 13805629,
              "D02590": 13893249,
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
                "nonWhite": 36
              },
              "vramCurrent": 8585,
              "lastKey": null
            },
            "historyTail": [
              {
                "block": 4957,
                "pc": "0x0A2B72",
                "prevPc": "0x05E7D2"
              },
              {
                "block": 4958,
                "pc": "0x0A2A68",
                "prevPc": "0x0A2B72"
              },
              {
                "block": 4959,
                "pc": "0x0A2AF9",
                "prevPc": "0x0A2A68"
              },
              {
                "block": 4960,
                "pc": "0x0A2B16",
                "prevPc": "0x0A2AF9"
              },
              {
                "block": 4961,
                "pc": "0x0A2B51",
                "prevPc": "0x0A2B16"
              },
              {
                "block": 4962,
                "pc": "0x0A2B7E",
                "prevPc": "0x0A2B51"
              },
              {
                "block": 4963,
                "pc": "0x0A2B8F",
                "prevPc": "0x0A2B7E"
              },
              {
                "block": 4964,
                "pc": "0x0A2BEB",
                "prevPc": "0x0A2B8F"
              },
              {
                "block": 4965,
                "pc": "0x0A2C0C",
                "prevPc": "0x0A2BEB"
              },
              {
                "block": 4966,
                "pc": "0x0A2C10",
                "prevPc": "0x0A2C0C"
              },
              {
                "block": 4967,
                "pc": "0x0A20CC",
                "prevPc": "0x0A2C10"
              },
              {
                "block": 4968,
                "pc": "0x0A20E4",
                "prevPc": "0x0A20CC"
              },
              {
                "block": 4969,
                "pc": "0x0A20EA",
                "prevPc": "0x0A20E4"
              },
              {
                "block": 4970,
                "pc": "0x0A321D",
                "prevPc": "0x0A20EA"
              },
              {
                "block": 4971,
                "pc": "0x0A322B",
                "prevPc": "0x0A321D"
              },
              {
                "block": 4972,
                "pc": "0x0A31FD",
                "prevPc": "0x0A322B"
              }
            ]
          },
          {
            "block": 4973,
            "step": 4983,
            "pc": "0x0A3205",
            "prevPc": "0x0A31FD",
            "cpu": {
              "pc": 668165,
              "sp": 13740059,
              "af": 65466,
              "bc": 256,
              "de": 13632917,
              "hl": 13640964,
              "ix": 13640964,
              "iy": 13631616,
              "f": 186,
              "halted": false,
              "madl": 1,
              "stepCount": 4983
            },
            "fields": {
              "D007CA": 361961,
              "D008E0": 13740131,
              "D0243A": 13740279,
              "D0243D": 13805629,
              "D02590": 13893249,
              "D02A40": 13805630,
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
              "D02A1B": 0,
              "D01150": 0,
              "D0059A": 0
            },
            "stackTop": [
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
              },
              {
                "addr": 13740080,
                "value": 663790
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
                "D0243D": 13805629,
                "D02A40": 13805630,
                "D02A28": 0
              }
            },
            "editLine": {
              "D007CA": 361961,
              "D008E0": 13740131,
              "D0243A": 13740279,
              "D0243D": 13805629,
              "D02590": 13893249,
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
                "nonWhite": 36
              },
              "vramCurrent": 8585,
              "lastKey": null
            },
            "historyTail": [
              {
                "block": 4958,
                "pc": "0x0A2A68",
                "prevPc": "0x0A2B72"
              },
              {
                "block": 4959,
                "pc": "0x0A2AF9",
                "prevPc": "0x0A2A68"
              },
              {
                "block": 4960,
                "pc": "0x0A2B16",
                "prevPc": "0x0A2AF9"
              },
              {
                "block": 4961,
                "pc": "0x0A2B51",
                "prevPc": "0x0A2B16"
              },
              {
                "block": 4962,
                "pc": "0x0A2B7E",
                "prevPc": "0x0A2B51"
              },
              {
                "block": 4963,
                "pc": "0x0A2B8F",
                "prevPc": "0x0A2B7E"
              },
              {
                "block": 4964,
                "pc": "0x0A2BEB",
                "prevPc": "0x0A2B8F"
              },
              {
                "block": 4965,
                "pc": "0x0A2C0C",
                "prevPc": "0x0A2BEB"
              },
              {
                "block": 4966,
                "pc": "0x0A2C10",
                "prevPc": "0x0A2C0C"
              },
              {
                "block": 4967,
                "pc": "0x0A20CC",
                "prevPc": "0x0A2C10"
              },
              {
                "block": 4968,
                "pc": "0x0A20E4",
                "prevPc": "0x0A20CC"
              },
              {
                "block": 4969,
                "pc": "0x0A20EA",
                "prevPc": "0x0A20E4"
              },
              {
                "block": 4970,
                "pc": "0x0A321D",
                "prevPc": "0x0A20EA"
              },
              {
                "block": 4971,
                "pc": "0x0A322B",
                "prevPc": "0x0A321D"
              },
              {
                "block": 4972,
                "pc": "0x0A31FD",
                "prevPc": "0x0A322B"
              },
              {
                "block": 4973,
                "pc": "0x0A3205",
                "prevPc": "0x0A31FD"
              }
            ]
          },
          {
            "block": 4975,
            "step": 4985,
            "pc": "0x0A3216",
            "prevPc": "0x0A2D4C",
            "cpu": {
              "pc": 668182,
              "sp": 13740059,
              "af": 9504,
              "bc": 60416,
              "de": 13632917,
              "hl": 5100,
              "ix": 13640964,
              "iy": 13631616,
              "f": 32,
              "halted": false,
              "madl": 1,
              "stepCount": 4985
            },
            "fields": {
              "D007CA": 361961,
              "D008E0": 13740131,
              "D0243A": 13740279,
              "D0243D": 13805629,
              "D02590": 13893249,
              "D02A40": 13805630,
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
              "D02A1B": 0,
              "D01150": 0,
              "D0059A": 0
            },
            "stackTop": [
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
              },
              {
                "addr": 13740080,
                "value": 663790
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
                "D0243D": 13805629,
                "D02A40": 13805630,
                "D02A28": 0
              }
            },
            "editLine": {
              "D007CA": 361961,
              "D008E0": 13740131,
              "D0243A": 13740279,
              "D0243D": 13805629,
              "D02590": 13893249,
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
                "nonWhite": 36
              },
              "vramCurrent": 8585,
              "lastKey": null
            },
            "historyTail": [
              {
                "block": 4960,
                "pc": "0x0A2B16",
                "prevPc": "0x0A2AF9"
              },
              {
                "block": 4961,
                "pc": "0x0A2B51",
                "prevPc": "0x0A2B16"
              },
              {
                "block": 4962,
                "pc": "0x0A2B7E",
                "prevPc": "0x0A2B51"
              },
              {
                "block": 4963,
                "pc": "0x0A2B8F",
                "prevPc": "0x0A2B7E"
              },
              {
                "block": 4964,
                "pc": "0x0A2BEB",
                "prevPc": "0x0A2B8F"
              },
              {
                "block": 4965,
                "pc": "0x0A2C0C",
                "prevPc": "0x0A2BEB"
              },
              {
                "block": 4966,
                "pc": "0x0A2C10",
                "prevPc": "0x0A2C0C"
              },
              {
                "block": 4967,
                "pc": "0x0A20CC",
                "prevPc": "0x0A2C10"
              },
              {
                "block": 4968,
                "pc": "0x0A20E4",
                "prevPc": "0x0A20CC"
              },
              {
                "block": 4969,
                "pc": "0x0A20EA",
                "prevPc": "0x0A20E4"
              },
              {
                "block": 4970,
                "pc": "0x0A321D",
                "prevPc": "0x0A20EA"
              },
              {
                "block": 4971,
                "pc": "0x0A322B",
                "prevPc": "0x0A321D"
              },
              {
                "block": 4972,
                "pc": "0x0A31FD",
                "prevPc": "0x0A322B"
              },
              {
                "block": 4973,
                "pc": "0x0A3205",
                "prevPc": "0x0A31FD"
              },
              {
                "block": 4974,
                "pc": "0x0A2D4C",
                "prevPc": "0x0A3205"
              },
              {
                "block": 4975,
                "pc": "0x0A3216",
                "prevPc": "0x0A2D4C"
              }
            ]
          },
          {
            "block": 4978,
            "step": 4988,
            "pc": "0x0A31F6",
            "prevPc": "0x0A314D",
            "cpu": {
              "pc": 668150,
              "sp": 13740047,
              "af": 64,
              "bc": 60436,
              "de": 13640853,
              "hl": 4884,
              "ix": 13640964,
              "iy": 13631616,
              "f": 64,
              "halted": false,
              "madl": 1,
              "stepCount": 4988
            },
            "fields": {
              "D007CA": 361961,
              "D008E0": 13740131,
              "D0243A": 13740279,
              "D0243D": 13805629,
              "D02590": 13893249,
              "D02A40": 13805630,
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
              "D02A1B": 0,
              "D01150": 0,
              "D0059A": 0
            },
            "stackTop": [
              {
                "addr": 13740047,
                "value": 667992
              },
              {
                "addr": 13740050,
                "value": 60436
              },
              {
                "addr": 13740053,
                "value": 13640853
              },
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
                "D0243D": 13805629,
                "D02A40": 13805630,
                "D02A28": 0
              }
            },
            "editLine": {
              "D007CA": 361961,
              "D008E0": 13740131,
              "D0243A": 13740279,
              "D0243D": 13805629,
              "D02590": 13893249,
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
                "nonWhite": 36
              },
              "vramCurrent": 8585,
              "lastKey": null
            },
            "historyTail": [
              {
                "block": 4963,
                "pc": "0x0A2B8F",
                "prevPc": "0x0A2B7E"
              },
              {
                "block": 4964,
                "pc": "0x0A2BEB",
                "prevPc": "0x0A2B8F"
              },
              {
                "block": 4965,
                "pc": "0x0A2C0C",
                "prevPc": "0x0A2BEB"
              },
              {
                "block": 4966,
                "pc": "0x0A2C10",
                "prevPc": "0x0A2C0C"
              },
              {
                "block": 4967,
                "pc": "0x0A20CC",
                "prevPc": "0x0A2C10"
              },
              {
                "block": 4968,
                "pc": "0x0A20E4",
                "prevPc": "0x0A20CC"
              },
              {
                "block": 4969,
                "pc": "0x0A20EA",
                "prevPc": "0x0A20E4"
              },
              {
                "block": 4970,
                "pc": "0x0A321D",
                "prevPc": "0x0A20EA"
              },
              {
                "block": 4971,
                "pc": "0x0A322B",
                "prevPc": "0x0A321D"
              },
              {
                "block": 4972,
                "pc": "0x0A31FD",
                "prevPc": "0x0A322B"
              },
              {
                "block": 4973,
                "pc": "0x0A3205",
                "prevPc": "0x0A31FD"
              },
              {
                "block": 4974,
                "pc": "0x0A2D4C",
                "prevPc": "0x0A3205"
              },
              {
                "block": 4975,
                "pc": "0x0A3216",
                "prevPc": "0x0A2D4C"
              },
              {
                "block": 4976,
                "pc": "0x0A3146",
                "prevPc": "0x0A3216"
              },
              {
                "block": 4977,
                "pc": "0x0A314D",
                "prevPc": "0x0A3146"
              },
              {
                "block": 4978,
                "pc": "0x0A31F6",
                "prevPc": "0x0A314D"
              }
            ]
          },
          {
            "block": 4980,
            "step": 4990,
            "pc": "0x0A31A6",
            "prevPc": "0x0A3158",
            "cpu": {
              "pc": 668070,
              "sp": 13740047,
              "af": 144,
              "bc": 60436,
              "de": 13640853,
              "hl": 12800,
              "ix": 13640964,
              "iy": 13631616,
              "f": 144,
              "halted": false,
              "madl": 1,
              "stepCount": 4990
            },
            "fields": {
              "D007CA": 361961,
              "D008E0": 13740131,
              "D0243A": 13740279,
              "D0243D": 13805629,
              "D02590": 13893249,
              "D02A40": 13805630,
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
              "D02A1B": 0,
              "D01150": 0,
              "D0059A": 0
            },
            "stackTop": [
              {
                "addr": 13740047,
                "value": 12800
              },
              {
                "addr": 13740050,
                "value": 60436
              },
              {
                "addr": 13740053,
                "value": 13640853
              },
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
                "D0243D": 13805629,
                "D02A40": 13805630,
                "D02A28": 0
              }
            },
            "editLine": {
              "D007CA": 361961,
              "D008E0": 13740131,
              "D0243A": 13740279,
              "D0243D": 13805629,
              "D02590": 13893249,
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
                "nonWhite": 36
              },
              "vramCurrent": 8585,
              "lastKey": null
            },
            "historyTail": [
              {
                "block": 4965,
                "pc": "0x0A2C0C",
                "prevPc": "0x0A2BEB"
              },
              {
                "block": 4966,
                "pc": "0x0A2C10",
                "prevPc": "0x0A2C0C"
              },
              {
                "block": 4967,
                "pc": "0x0A20CC",
                "prevPc": "0x0A2C10"
              },
              {
                "block": 4968,
                "pc": "0x0A20E4",
                "prevPc": "0x0A20CC"
              },
              {
                "block": 4969,
                "pc": "0x0A20EA",
                "prevPc": "0x0A20E4"
              },
              {
                "block": 4970,
                "pc": "0x0A321D",
                "prevPc": "0x0A20EA"
              },
              {
                "block": 4971,
                "pc": "0x0A322B",
                "prevPc": "0x0A321D"
              },
              {
                "block": 4972,
                "pc": "0x0A31FD",
                "prevPc": "0x0A322B"
              },
              {
                "block": 4973,
                "pc": "0x0A3205",
                "prevPc": "0x0A31FD"
              },
              {
                "block": 4974,
                "pc": "0x0A2D4C",
                "prevPc": "0x0A3205"
              },
              {
                "block": 4975,
                "pc": "0x0A3216",
                "prevPc": "0x0A2D4C"
              },
              {
                "block": 4976,
                "pc": "0x0A3146",
                "prevPc": "0x0A3216"
              },
              {
                "block": 4977,
                "pc": "0x0A314D",
                "prevPc": "0x0A3146"
              },
              {
                "block": 4978,
                "pc": "0x0A31F6",
                "prevPc": "0x0A314D"
              },
              {
                "block": 4979,
                "pc": "0x0A3158",
                "prevPc": "0x0A31F6"
              },
              {
                "block": 4980,
                "pc": "0x0A31A6",
                "prevPc": "0x0A3158"
              }
            ]
          },
          {
            "block": 4981,
            "step": 4991,
            "pc": "0x0A31F6",
            "prevPc": "0x0A31A6",
            "cpu": {
              "pc": 668150,
              "sp": 13740044,
              "af": 32,
              "bc": 60436,
              "de": 13640853,
              "hl": 12837,
              "ix": 13640964,
              "iy": 13631616,
              "f": 32,
              "halted": false,
              "madl": 1,
              "stepCount": 4991
            },
            "fields": {
              "D007CA": 361961,
              "D008E0": 13740131,
              "D0243A": 13740279,
              "D0243D": 13805629,
              "D02590": 13893249,
              "D02A40": 13805630,
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
              "D02A1B": 0,
              "D01150": 0,
              "D0059A": 0
            },
            "stackTop": [
              {
                "addr": 13740044,
                "value": 668076
              },
              {
                "addr": 13740047,
                "value": 12800
              },
              {
                "addr": 13740050,
                "value": 60436
              },
              {
                "addr": 13740053,
                "value": 13640853
              },
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
                "D0243D": 13805629,
                "D02A40": 13805630,
                "D02A28": 0
              }
            },
            "editLine": {
              "D007CA": 361961,
              "D008E0": 13740131,
              "D0243A": 13740279,
              "D0243D": 13805629,
              "D02590": 13893249,
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
                "nonWhite": 36
              },
              "vramCurrent": 8585,
              "lastKey": null
            },
            "historyTail": [
              {
                "block": 4966,
                "pc": "0x0A2C10",
                "prevPc": "0x0A2C0C"
              },
              {
                "block": 4967,
                "pc": "0x0A20CC",
                "prevPc": "0x0A2C10"
              },
              {
                "block": 4968,
                "pc": "0x0A20E4",
                "prevPc": "0x0A20CC"
              },
              {
                "block": 4969,
                "pc": "0x0A20EA",
                "prevPc": "0x0A20E4"
              },
              {
                "block": 4970,
                "pc": "0x0A321D",
                "prevPc": "0x0A20EA"
              },
              {
                "block": 4971,
                "pc": "0x0A322B",
                "prevPc": "0x0A321D"
              },
              {
                "block": 4972,
                "pc": "0x0A31FD",
                "prevPc": "0x0A322B"
              },
              {
                "block": 4973,
                "pc": "0x0A3205",
                "prevPc": "0x0A31FD"
              },
              {
                "block": 4974,
                "pc": "0x0A2D4C",
                "prevPc": "0x0A3205"
              },
              {
                "block": 4975,
                "pc": "0x0A3216",
                "prevPc": "0x0A2D4C"
              },
              {
                "block": 4976,
                "pc": "0x0A3146",
                "prevPc": "0x0A3216"
              },
              {
                "block": 4977,
                "pc": "0x0A314D",
                "prevPc": "0x0A3146"
              },
              {
                "block": 4978,
                "pc": "0x0A31F6",
                "prevPc": "0x0A314D"
              },
              {
                "block": 4979,
                "pc": "0x0A3158",
                "prevPc": "0x0A31F6"
              },
              {
                "block": 4980,
                "pc": "0x0A31A6",
                "prevPc": "0x0A3158"
              },
              {
                "block": 4981,
                "pc": "0x0A31F6",
                "prevPc": "0x0A31A6"
              }
            ]
          },
          {
            "block": 4982,
            "step": 4992,
            "pc": "0x0A31AC",
            "prevPc": "0x0A31F6",
            "cpu": {
              "pc": 668076,
              "sp": 13740047,
              "af": 32,
              "bc": 60436,
              "de": 13640853,
              "hl": 23680,
              "ix": 13640964,
              "iy": 13631616,
              "f": 32,
              "halted": false,
              "madl": 1,
              "stepCount": 4992
            },
            "fields": {
              "D007CA": 361961,
              "D008E0": 13740131,
              "D0243A": 13740279,
              "D0243D": 13805629,
              "D02590": 13893249,
              "D02A40": 13805630,
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
              "D02A1B": 0,
              "D01150": 0,
              "D0059A": 0
            },
            "stackTop": [
              {
                "addr": 13740047,
                "value": 12800
              },
              {
                "addr": 13740050,
                "value": 60436
              },
              {
                "addr": 13740053,
                "value": 13640853
              },
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
                "D0243D": 13805629,
                "D02A40": 13805630,
                "D02A28": 0
              }
            },
            "editLine": {
              "D007CA": 361961,
              "D008E0": 13740131,
              "D0243A": 13740279,
              "D0243D": 13805629,
              "D02590": 13893249,
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
                "nonWhite": 36
              },
              "vramCurrent": 8585,
              "lastKey": null
            },
            "historyTail": [
              {
                "block": 4967,
                "pc": "0x0A20CC",
                "prevPc": "0x0A2C10"
              },
              {
                "block": 4968,
                "pc": "0x0A20E4",
                "prevPc": "0x0A20CC"
              },
              {
                "block": 4969,
                "pc": "0x0A20EA",
                "prevPc": "0x0A20E4"
              },
              {
                "block": 4970,
                "pc": "0x0A321D",
                "prevPc": "0x0A20EA"
              },
              {
                "block": 4971,
                "pc": "0x0A322B",
                "prevPc": "0x0A321D"
              },
              {
                "block": 4972,
                "pc": "0x0A31FD",
                "prevPc": "0x0A322B"
              },
              {
                "block": 4973,
                "pc": "0x0A3205",
                "prevPc": "0x0A31FD"
              },
              {
                "block": 4974,
                "pc": "0x0A2D4C",
                "prevPc": "0x0A3205"
              },
              {
                "block": 4975,
                "pc": "0x0A3216",
                "prevPc": "0x0A2D4C"
              },
              {
                "block": 4976,
                "pc": "0x0A3146",
                "prevPc": "0x0A3216"
              },
              {
                "block": 4977,
                "pc": "0x0A314D",
                "prevPc": "0x0A3146"
              },
              {
                "block": 4978,
                "pc": "0x0A31F6",
                "prevPc": "0x0A314D"
              },
              {
                "block": 4979,
                "pc": "0x0A3158",
                "prevPc": "0x0A31F6"
              },
              {
                "block": 4980,
                "pc": "0x0A31A6",
                "prevPc": "0x0A3158"
              },
              {
                "block": 4981,
                "pc": "0x0A31F6",
                "prevPc": "0x0A31A6"
              },
              {
                "block": 4982,
                "pc": "0x0A31AC",
                "prevPc": "0x0A31F6"
              }
            ]
          },
          {
            "block": 4983,
            "step": 4993,
            "pc": "0x0A31F6",
            "prevPc": "0x0A31AC",
            "cpu": {
              "pc": 668150,
              "sp": 13740044,
              "af": 32,
              "bc": 60436,
              "de": 13917311,
              "hl": 13893868,
              "ix": 13640964,
              "iy": 13631616,
              "f": 32,
              "halted": false,
              "madl": 1,
              "stepCount": 4993
            },
            "fields": {
              "D007CA": 361961,
              "D008E0": 13740131,
              "D0243A": 13740279,
              "D0243D": 13805629,
              "D02590": 13893249,
              "D02A40": 13805630,
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
              "D02A1B": 0,
              "D01150": 0,
              "D0059A": 0
            },
            "stackTop": [
              {
                "addr": 13740044,
                "value": 668088
              },
              {
                "addr": 13740047,
                "value": 12800
              },
              {
                "addr": 13740050,
                "value": 60436
              },
              {
                "addr": 13740053,
                "value": 13640853
              },
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
                "D0243D": 13805629,
                "D02A40": 13805630,
                "D02A28": 0
              }
            },
            "editLine": {
              "D007CA": 361961,
              "D008E0": 13740131,
              "D0243A": 13740279,
              "D0243D": 13805629,
              "D02590": 13893249,
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
                "nonWhite": 36
              },
              "vramCurrent": 8585,
              "lastKey": null
            },
            "historyTail": [
              {
                "block": 4968,
                "pc": "0x0A20E4",
                "prevPc": "0x0A20CC"
              },
              {
                "block": 4969,
                "pc": "0x0A20EA",
                "prevPc": "0x0A20E4"
              },
              {
                "block": 4970,
                "pc": "0x0A321D",
                "prevPc": "0x0A20EA"
              },
              {
                "block": 4971,
                "pc": "0x0A322B",
                "prevPc": "0x0A321D"
              },
              {
                "block": 4972,
                "pc": "0x0A31FD",
                "prevPc": "0x0A322B"
              },
              {
                "block": 4973,
                "pc": "0x0A3205",
                "prevPc": "0x0A31FD"
              },
              {
                "block": 4974,
                "pc": "0x0A2D4C",
                "prevPc": "0x0A3205"
              },
              {
                "block": 4975,
                "pc": "0x0A3216",
                "prevPc": "0x0A2D4C"
              },
              {
                "block": 4976,
                "pc": "0x0A3146",
                "prevPc": "0x0A3216"
              },
              {
                "block": 4977,
                "pc": "0x0A314D",
                "prevPc": "0x0A3146"
              },
              {
                "block": 4978,
                "pc": "0x0A31F6",
                "prevPc": "0x0A314D"
              },
              {
                "block": 4979,
                "pc": "0x0A3158",
                "prevPc": "0x0A31F6"
              },
              {
                "block": 4980,
                "pc": "0x0A31A6",
                "prevPc": "0x0A3158"
              },
              {
                "block": 4981,
                "pc": "0x0A31F6",
                "prevPc": "0x0A31A6"
              },
              {
                "block": 4982,
                "pc": "0x0A31AC",
                "prevPc": "0x0A31F6"
              },
              {
                "block": 4983,
                "pc": "0x0A31F6",
                "prevPc": "0x0A31AC"
              }
            ]
          },
          {
            "block": 4984,
            "step": 4994,
            "pc": "0x0A31B8",
            "prevPc": "0x0A31F6",
            "cpu": {
              "pc": 668088,
              "sp": 13740047,
              "af": 32,
              "bc": 60436,
              "de": 13917311,
              "hl": 151040,
              "ix": 13640964,
              "iy": 13631616,
              "f": 32,
              "halted": false,
              "madl": 1,
              "stepCount": 4994
            },
            "fields": {
              "D007CA": 361961,
              "D008E0": 13740131,
              "D0243A": 13740279,
              "D0243D": 13805629,
              "D02590": 13893249,
              "D02A40": 13805630,
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
              "D02A1B": 0,
              "D01150": 0,
              "D0059A": 0
            },
            "stackTop": [
              {
                "addr": 13740047,
                "value": 12800
              },
              {
                "addr": 13740050,
                "value": 60436
              },
              {
                "addr": 13740053,
                "value": 13640853
              },
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
                "D0243D": 13805629,
                "D02A40": 13805630,
                "D02A28": 0
              }
            },
            "editLine": {
              "D007CA": 361961,
              "D008E0": 13740131,
              "D0243A": 13740279,
              "D0243D": 13805629,
              "D02590": 13893249,
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
                "nonWhite": 36
              },
              "vramCurrent": 8585,
              "lastKey": null
            },
            "historyTail": [
              {
                "block": 4969,
                "pc": "0x0A20EA",
                "prevPc": "0x0A20E4"
              },
              {
                "block": 4970,
                "pc": "0x0A321D",
                "prevPc": "0x0A20EA"
              },
              {
                "block": 4971,
                "pc": "0x0A322B",
                "prevPc": "0x0A321D"
              },
              {
                "block": 4972,
                "pc": "0x0A31FD",
                "prevPc": "0x0A322B"
              },
              {
                "block": 4973,
                "pc": "0x0A3205",
                "prevPc": "0x0A31FD"
              },
              {
                "block": 4974,
                "pc": "0x0A2D4C",
                "prevPc": "0x0A3205"
              },
              {
                "block": 4975,
                "pc": "0x0A3216",
                "prevPc": "0x0A2D4C"
              },
              {
                "block": 4976,
                "pc": "0x0A3146",
                "prevPc": "0x0A3216"
              },
              {
                "block": 4977,
                "pc": "0x0A314D",
                "prevPc": "0x0A3146"
              },
              {
                "block": 4978,
                "pc": "0x0A31F6",
                "prevPc": "0x0A314D"
              },
              {
                "block": 4979,
                "pc": "0x0A3158",
                "prevPc": "0x0A31F6"
              },
              {
                "block": 4980,
                "pc": "0x0A31A6",
                "prevPc": "0x0A3158"
              },
              {
                "block": 4981,
                "pc": "0x0A31F6",
                "prevPc": "0x0A31A6"
              },
              {
                "block": 4982,
                "pc": "0x0A31AC",
                "prevPc": "0x0A31F6"
              },
              {
                "block": 4983,
                "pc": "0x0A31F6",
                "prevPc": "0x0A31AC"
              },
              {
                "block": 4984,
                "pc": "0x0A31B8",
                "prevPc": "0x0A31F6"
              }
            ]
          },
          {
            "block": 4985,
            "step": 4995,
            "pc": "0x0A31E2",
            "prevPc": "0x0A31B8",
            "cpu": {
              "pc": 668130,
              "sp": 13740053,
              "af": 1620,
              "bc": 60436,
              "de": 13644278,
              "hl": 279,
              "ix": 13640964,
              "iy": 13631616,
              "f": 84,
              "halted": false,
              "madl": 1,
              "stepCount": 4995
            },
            "fields": {
              "D007CA": 361961,
              "D008E0": 13740131,
              "D0243A": 13740279,
              "D0243D": 13805629,
              "D02590": 13893249,
              "D02A40": 13805630,
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
              "D02A1B": 0,
              "D01150": 0,
              "D0059A": 0
            },
            "stackTop": [
              {
                "addr": 13740053,
                "value": 800
              },
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
                "D02A1B": 0,
                "D0059A": 0,
                "D01150": 0,
                "D0243D": 13805629,
                "D02A40": 13805630,
                "D02A28": 0
              }
            },
            "editLine": {
              "D007CA": 361961,
              "D008E0": 13740131,
              "D0243A": 13740279,
              "D0243D": 13805629,
              "D02590": 13893249,
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
            },
            "historyTail": [
              {
                "block": 4970,
                "pc": "0x0A321D",
                "prevPc": "0x0A20EA"
              },
              {
                "block": 4971,
                "pc": "0x0A322B",
                "prevPc": "0x0A321D"
              },
              {
                "block": 4972,
                "pc": "0x0A31FD",
                "prevPc": "0x0A322B"
              },
              {
                "block": 4973,
                "pc": "0x0A3205",
                "prevPc": "0x0A31FD"
              },
              {
                "block": 4974,
                "pc": "0x0A2D4C",
                "prevPc": "0x0A3205"
              },
              {
                "block": 4975,
                "pc": "0x0A3216",
                "prevPc": "0x0A2D4C"
              },
              {
                "block": 4976,
                "pc": "0x0A3146",
                "prevPc": "0x0A3216"
              },
              {
                "block": 4977,
                "pc": "0x0A314D",
                "prevPc": "0x0A3146"
              },
              {
                "block": 4978,
                "pc": "0x0A31F6",
                "prevPc": "0x0A314D"
              },
              {
                "block": 4979,
                "pc": "0x0A3158",
                "prevPc": "0x0A31F6"
              },
              {
                "block": 4980,
                "pc": "0x0A31A6",
                "prevPc": "0x0A3158"
              },
              {
                "block": 4981,
                "pc": "0x0A31F6",
                "prevPc": "0x0A31A6"
              },
              {
                "block": 4982,
                "pc": "0x0A31AC",
                "prevPc": "0x0A31F6"
              },
              {
                "block": 4983,
                "pc": "0x0A31F6",
                "prevPc": "0x0A31AC"
              },
              {
                "block": 4984,
                "pc": "0x0A31B8",
                "prevPc": "0x0A31F6"
              },
              {
                "block": 4985,
                "pc": "0x0A31E2",
                "prevPc": "0x0A31B8"
              }
            ]
          },
          {
            "block": 4986,
            "step": 4996,
            "pc": "0x0A31A2",
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
              "D0243A": 13740279,
              "D0243D": 13805629,
              "D02590": 13893249,
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
                "D0243D": 13805629,
                "D02A40": 0,
                "D02A28": 0
              }
            },
            "editLine": {
              "D007CA": 361961,
              "D008E0": 13740131,
              "D0243A": 13740279,
              "D0243D": 13805629,
              "D02590": 13893249,
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
            },
            "historyTail": [
              {
                "block": 4971,
                "pc": "0x0A322B",
                "prevPc": "0x0A321D"
              },
              {
                "block": 4972,
                "pc": "0x0A31FD",
                "prevPc": "0x0A322B"
              },
              {
                "block": 4973,
                "pc": "0x0A3205",
                "prevPc": "0x0A31FD"
              },
              {
                "block": 4974,
                "pc": "0x0A2D4C",
                "prevPc": "0x0A3205"
              },
              {
                "block": 4975,
                "pc": "0x0A3216",
                "prevPc": "0x0A2D4C"
              },
              {
                "block": 4976,
                "pc": "0x0A3146",
                "prevPc": "0x0A3216"
              },
              {
                "block": 4977,
                "pc": "0x0A314D",
                "prevPc": "0x0A3146"
              },
              {
                "block": 4978,
                "pc": "0x0A31F6",
                "prevPc": "0x0A314D"
              },
              {
                "block": 4979,
                "pc": "0x0A3158",
                "prevPc": "0x0A31F6"
              },
              {
                "block": 4980,
                "pc": "0x0A31A6",
                "prevPc": "0x0A3158"
              },
              {
                "block": 4981,
                "pc": "0x0A31F6",
                "prevPc": "0x0A31A6"
              },
              {
                "block": 4982,
                "pc": "0x0A31AC",
                "prevPc": "0x0A31F6"
              },
              {
                "block": 4983,
                "pc": "0x0A31F6",
                "prevPc": "0x0A31AC"
              },
              {
                "block": 4984,
                "pc": "0x0A31B8",
                "prevPc": "0x0A31F6"
              },
              {
                "block": 4985,
                "pc": "0x0A31E2",
                "prevPc": "0x0A31B8"
              },
              {
                "block": 4986,
                "pc": "0x0A31A2",
                "prevPc": "0x0A31E2"
              }
            ]
          }
        ],
        "wipeSamples": [],
        "firstWipe": null,
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
          }
        },
        "firstPointerTripleZero": {
          "timing": "entry-vs-previous-block",
          "block": 4986,
          "pc": "0x0A31A2",
          "prevPc": "0x0A31E2",
          "before": {
            "D0243A": 13740279,
            "D0243D": 13805629,
            "D007CA": 361961,
            "D02590": 13893249
          },
          "after": {
            "D0243A": 0,
            "D0243D": 0,
            "D007CA": 361961,
            "D02590": 0
          },
          "history120": [
            {
              "block": 4867,
              "pc": "0x001C81",
              "prevPc": "0x001CE4"
            },
            {
              "block": 4868,
              "pc": "0x001C82",
              "prevPc": "0x001C81"
            },
            {
              "block": 4869,
              "pc": "0x001C48",
              "prevPc": "0x001C82"
            },
            {
              "block": 4870,
              "pc": "0x001C33",
              "prevPc": "0x001C48"
            },
            {
              "block": 4871,
              "pc": "0x001C38",
              "prevPc": "0x001C33"
            },
            {
              "block": 4872,
              "pc": "0x001C3C",
              "prevPc": "0x001C38"
            },
            {
              "block": 4873,
              "pc": "0x001C42",
              "prevPc": "0x001C3C"
            },
            {
              "block": 4874,
              "pc": "0x006810",
              "prevPc": "0x001C42"
            },
            {
              "block": 4875,
              "pc": "0x006812",
              "prevPc": "0x006810"
            },
            {
              "block": 4876,
              "pc": "0x001C4F",
              "prevPc": "0x006812"
            },
            {
              "block": 4877,
              "pc": "0x001CA6",
              "prevPc": "0x001C4F"
            },
            {
              "block": 4878,
              "pc": "0x001CC0",
              "prevPc": "0x001CA6"
            },
            {
              "block": 4879,
              "pc": "0x001CCA",
              "prevPc": "0x001CC0"
            },
            {
              "block": 4880,
              "pc": "0x001CE4",
              "prevPc": "0x001CCA"
            },
            {
              "block": 4881,
              "pc": "0x001C54",
              "prevPc": "0x001CE4"
            },
            {
              "block": 4882,
              "pc": "0x006816",
              "prevPc": "0x001C54"
            },
            {
              "block": 4883,
              "pc": "0x00681E",
              "prevPc": "0x006816"
            },
            {
              "block": 4884,
              "pc": "0x006828",
              "prevPc": "0x00681E"
            },
            {
              "block": 4885,
              "pc": "0x001727",
              "prevPc": "0x006828"
            },
            {
              "block": 4886,
              "pc": "0x000719",
              "prevPc": "0x001727"
            },
            {
              "block": 4887,
              "pc": "0x00071D",
              "prevPc": "0x000719"
            },
            {
              "block": 4888,
              "pc": "0x02010C",
              "prevPc": "0x00071D"
            },
            {
              "block": 4889,
              "pc": "0x03CF7D",
              "prevPc": "0x02010C"
            },
            {
              "block": 4890,
              "pc": "0x03CFA4",
              "prevPc": "0x03CF7D"
            },
            {
              "block": 4891,
              "pc": "0x03CFCF",
              "prevPc": "0x03CFA4"
            },
            {
              "block": 4892,
              "pc": "0x03CFD4",
              "prevPc": "0x03CFCF"
            },
            {
              "block": 4893,
              "pc": "0x03CFDB",
              "prevPc": "0x03CFD4"
            },
            {
              "block": 4894,
              "pc": "0x03CFE0",
              "prevPc": "0x03CFDB"
            },
            {
              "block": 4895,
              "pc": "0x03CFE5",
              "prevPc": "0x03CFE0"
            },
            {
              "block": 4896,
              "pc": "0x03CFEA",
              "prevPc": "0x03CFE5"
            },
            {
              "block": 4897,
              "pc": "0x03D029",
              "prevPc": "0x03CFEA"
            },
            {
              "block": 4898,
              "pc": "0x03D033",
              "prevPc": "0x03D029"
            },
            {
              "block": 4899,
              "pc": "0x03D038",
              "prevPc": "0x03D033"
            },
            {
              "block": 4900,
              "pc": "0x03D044",
              "prevPc": "0x03D038"
            },
            {
              "block": 4901,
              "pc": "0x03D1C3",
              "prevPc": "0x03D044"
            },
            {
              "block": 4902,
              "pc": "0x03D04C",
              "prevPc": "0x03D1C3"
            },
            {
              "block": 4903,
              "pc": "0x03D054",
              "prevPc": "0x03D04C"
            },
            {
              "block": 4904,
              "pc": "0x03F994",
              "prevPc": "0x03D054"
            },
            {
              "block": 4905,
              "pc": "0x0003D4",
              "prevPc": "0x03F994"
            },
            {
              "block": 4906,
              "pc": "0x003CC2",
              "prevPc": "0x0003D4"
            },
            {
              "block": 4907,
              "pc": "0x003CD4",
              "prevPc": "0x003CC2"
            },
            {
              "block": 4908,
              "pc": "0x003CE0",
              "prevPc": "0x003CD4"
            },
            {
              "block": 4909,
              "pc": "0x003CEE",
              "prevPc": "0x003CE0"
            },
            {
              "block": 4910,
              "pc": "0x003CF3",
              "prevPc": "0x003CEE"
            },
            {
              "block": 4911,
              "pc": "0x03F998",
              "prevPc": "0x003CF3"
            },
            {
              "block": 4912,
              "pc": "0x03F99A",
              "prevPc": "0x03F998"
            },
            {
              "block": 4913,
              "pc": "0x03F9AB",
              "prevPc": "0x03F99A"
            },
            {
              "block": 4914,
              "pc": "0x03F9AE",
              "prevPc": "0x03F9AB"
            },
            {
              "block": 4915,
              "pc": "0x03D058",
              "prevPc": "0x03F9AE"
            },
            {
              "block": 4916,
              "pc": "0x03D060",
              "prevPc": "0x03D058"
            },
            {
              "block": 4917,
              "pc": "0x03D0E0",
              "prevPc": "0x03D060"
            },
            {
              "block": 4918,
              "pc": "0x080259",
              "prevPc": "0x03D0E0"
            },
            {
              "block": 4919,
              "pc": "0x0800B2",
              "prevPc": "0x080259"
            },
            {
              "block": 4920,
              "pc": "0x058D60",
              "prevPc": "0x0800B2"
            },
            {
              "block": 4921,
              "pc": "0x058D89",
              "prevPc": "0x058D60"
            },
            {
              "block": 4922,
              "pc": "0x0589E9",
              "prevPc": "0x058D89"
            },
            {
              "block": 4923,
              "pc": "0x0589EF",
              "prevPc": "0x0589E9"
            },
            {
              "block": 4924,
              "pc": "0x058A0C",
              "prevPc": "0x0589EF"
            },
            {
              "block": 4925,
              "pc": "0x058A10",
              "prevPc": "0x058A0C"
            },
            {
              "block": 4926,
              "pc": "0x058212",
              "prevPc": "0x058A10"
            },
            {
              "block": 4927,
              "pc": "0x0800B8",
              "prevPc": "0x058212"
            },
            {
              "block": 4928,
              "pc": "0x058216",
              "prevPc": "0x0800B8"
            },
            {
              "block": 4929,
              "pc": "0x05821D",
              "prevPc": "0x058216"
            },
            {
              "block": 4930,
              "pc": "0x05E3E3",
              "prevPc": "0x05821D"
            },
            {
              "block": 4931,
              "pc": "0x05E3F5",
              "prevPc": "0x05E3E3"
            },
            {
              "block": 4932,
              "pc": "0x04C973",
              "prevPc": "0x05E3F5"
            },
            {
              "block": 4933,
              "pc": "0x05E3E7",
              "prevPc": "0x04C973"
            },
            {
              "block": 4934,
              "pc": "0x05E3E8",
              "prevPc": "0x05E3E7"
            },
            {
              "block": 4935,
              "pc": "0x04C973",
              "prevPc": "0x05E3E8"
            },
            {
              "block": 4936,
              "pc": "0x058221",
              "prevPc": "0x04C973"
            },
            {
              "block": 4937,
              "pc": "0x058A14",
              "prevPc": "0x058221"
            },
            {
              "block": 4938,
              "pc": "0x058A2C",
              "prevPc": "0x058A14"
            },
            {
              "block": 4939,
              "pc": "0x0800B8",
              "prevPc": "0x058A2C"
            },
            {
              "block": 4940,
              "pc": "0x058A30",
              "prevPc": "0x0800B8"
            },
            {
              "block": 4941,
              "pc": "0x058A4C",
              "prevPc": "0x058A30"
            },
            {
              "block": 4942,
              "pc": "0x05E7CD",
              "prevPc": "0x058A4C"
            },
            {
              "block": 4943,
              "pc": "0x05E242",
              "prevPc": "0x05E7CD"
            },
            {
              "block": 4944,
              "pc": "0x05E3E8",
              "prevPc": "0x05E242"
            },
            {
              "block": 4945,
              "pc": "0x04C973",
              "prevPc": "0x05E3E8"
            },
            {
              "block": 4946,
              "pc": "0x05E246",
              "prevPc": "0x04C973"
            },
            {
              "block": 4947,
              "pc": "0x05E247",
              "prevPc": "0x05E246"
            },
            {
              "block": 4948,
              "pc": "0x05E3EC",
              "prevPc": "0x05E247"
            },
            {
              "block": 4949,
              "pc": "0x04C973",
              "prevPc": "0x05E3EC"
            },
            {
              "block": 4950,
              "pc": "0x05E24C",
              "prevPc": "0x04C973"
            },
            {
              "block": 4951,
              "pc": "0x05E250",
              "prevPc": "0x05E24C"
            },
            {
              "block": 4952,
              "pc": "0x080064",
              "prevPc": "0x05E250"
            },
            {
              "block": 4953,
              "pc": "0x05E256",
              "prevPc": "0x080064"
            },
            {
              "block": 4954,
              "pc": "0x05E26C",
              "prevPc": "0x05E256"
            },
            {
              "block": 4955,
              "pc": "0x05E7D1",
              "prevPc": "0x05E26C"
            },
            {
              "block": 4956,
              "pc": "0x05E7D2",
              "prevPc": "0x05E7D1"
            },
            {
              "block": 4957,
              "pc": "0x0A2B72",
              "prevPc": "0x05E7D2"
            },
            {
              "block": 4958,
              "pc": "0x0A2A68",
              "prevPc": "0x0A2B72"
            },
            {
              "block": 4959,
              "pc": "0x0A2AF9",
              "prevPc": "0x0A2A68"
            },
            {
              "block": 4960,
              "pc": "0x0A2B16",
              "prevPc": "0x0A2AF9"
            },
            {
              "block": 4961,
              "pc": "0x0A2B51",
              "prevPc": "0x0A2B16"
            },
            {
              "block": 4962,
              "pc": "0x0A2B7E",
              "prevPc": "0x0A2B51"
            },
            {
              "block": 4963,
              "pc": "0x0A2B8F",
              "prevPc": "0x0A2B7E"
            },
            {
              "block": 4964,
              "pc": "0x0A2BEB",
              "prevPc": "0x0A2B8F"
            },
            {
              "block": 4965,
              "pc": "0x0A2C0C",
              "prevPc": "0x0A2BEB"
            },
            {
              "block": 4966,
              "pc": "0x0A2C10",
              "prevPc": "0x0A2C0C"
            },
            {
              "block": 4967,
              "pc": "0x0A20CC",
              "prevPc": "0x0A2C10"
            },
            {
              "block": 4968,
              "pc": "0x0A20E4",
              "prevPc": "0x0A20CC"
            },
            {
              "block": 4969,
              "pc": "0x0A20EA",
              "prevPc": "0x0A20E4"
            },
            {
              "block": 4970,
              "pc": "0x0A321D",
              "prevPc": "0x0A20EA"
            },
            {
              "block": 4971,
              "pc": "0x0A322B",
              "prevPc": "0x0A321D"
            },
            {
              "block": 4972,
              "pc": "0x0A31FD",
              "prevPc": "0x0A322B"
            },
            {
              "block": 4973,
              "pc": "0x0A3205",
              "prevPc": "0x0A31FD"
            },
            {
              "block": 4974,
              "pc": "0x0A2D4C",
              "prevPc": "0x0A3205"
            },
            {
              "block": 4975,
              "pc": "0x0A3216",
              "prevPc": "0x0A2D4C"
            },
            {
              "block": 4976,
              "pc": "0x0A3146",
              "prevPc": "0x0A3216"
            },
            {
              "block": 4977,
              "pc": "0x0A314D",
              "prevPc": "0x0A3146"
            },
            {
              "block": 4978,
              "pc": "0x0A31F6",
              "prevPc": "0x0A314D"
            },
            {
              "block": 4979,
              "pc": "0x0A3158",
              "prevPc": "0x0A31F6"
            },
            {
              "block": 4980,
              "pc": "0x0A31A6",
              "prevPc": "0x0A3158"
            },
            {
              "block": 4981,
              "pc": "0x0A31F6",
              "prevPc": "0x0A31A6"
            },
            {
              "block": 4982,
              "pc": "0x0A31AC",
              "prevPc": "0x0A31F6"
            },
            {
              "block": 4983,
              "pc": "0x0A31F6",
              "prevPc": "0x0A31AC"
            },
            {
              "block": 4984,
              "pc": "0x0A31B8",
              "prevPc": "0x0A31F6"
            },
            {
              "block": 4985,
              "pc": "0x0A31E2",
              "prevPc": "0x0A31B8"
            },
            {
              "block": 4986,
              "pc": "0x0A31A2",
              "prevPc": "0x0A31E2"
            }
          ],
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
          },
          "inferredOwner": "0x0A31E2",
          "evidence": "onBlock observes state before each lifted block executes; the pointer triple was live after the previous observed block and zero on entry to this block"
        },
        "postReplayPointerTripleZero": null,
        "firstAllZero": null,
        "stopRequested": {
          "reason": "hot_0a1854_loop_threshold",
          "block": 16460,
          "pc": "0x0A1854",
          "prevPc": "0x0A1A1D",
          "count": 512,
          "threshold": 512
        },
        "fieldTransitions": [],
        "lastWatchFields": {
          "D0243A": 13740246,
          "D0243D": 13805596,
          "D007CA": 361961,
          "D02590": 13893249
        }
      }
    }
  ]
}
```

No runtime, transpiler, browser-shell, decoder, peripheral, scheduler, or ROM artifact files were changed.


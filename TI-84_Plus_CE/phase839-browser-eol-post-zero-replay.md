# Phase 839 Browser EOL Post-Zero Replay

Probe: `probe-phase839-browser-eol-post-zero-replay.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase839-browser-eol-post-zero-replay.mjs`

Serves an instrumented in-memory copy of `browser-shell.html`, boots coldboot with Preserve Display, injects the smallest Phase 836 reproducer (`D0243A=0xD1A8F8`), then A/B tests restoring the fields cleared by `0x0A31E2` on entry to `0x0A31A2`. The real shell file is not edited.

## Result

- Ran 3 real-Chrome A/B cases: no replay, replay D0243A/D0243D/D02590, and replay those plus D02A40.
- Every case reached the same first pointer-triple clear point when observed: no_replay=0x0A31A2 after 0x0A31E2; replay_pointer_triple=0x0A31A2 after 0x0A31E2; replay_pointer_triple_plus_d02a40=0x0A31A2 after 0x0A31E2.
- Outcomes: no_replay=STILL_WIPES (first_wipe_0018f8); replay_pointer_triple=MAX_STEPS_NO_WIPE (max_steps_no_wipe); replay_pointer_triple_plus_d02a40=MAX_STEPS_NO_WIPE (max_steps_no_wipe).

## Cases

| Case | Initial writes | Replay writes | Classification | Stop reason | Termination | Steps | Wipes | First pointer zero | Replay event | First wipe owner |
| --- | --- | --- | --- | --- | --- | ---: | ---: | --- | --- | --- |
| no_replay | D0243A=0xD1A8F8 | - | STILL_WIPES | first_wipe_0018f8 | control_pre_stop | 11149 | 0 | 0x0A31A2 after 0x0A31E2 | - | 0x0013E8 |
| replay_pointer_triple | D0243A=0xD1A8F8 | D0243A=0xD1A8F7, D0243D=0xD2A83D, D02590=0xD3FE81 | MAX_STEPS_NO_WIPE | max_steps_no_wipe | max_steps | 350000 | 0 | 0x0A31A2 after 0x0A31E2 | 0x0A31A2 (D0243A=0xD1A8F7, D0243D=0xD2A83D, D007CA=0x0585E9, D02590=0xD3FE81) | - |
| replay_pointer_triple_plus_d02a40 | D0243A=0xD1A8F8 | D0243A=0xD1A8F7, D0243D=0xD2A83D, D02590=0xD3FE81, D02A40=0xD2A83E | MAX_STEPS_NO_WIPE | max_steps_no_wipe | max_steps | 350000 | 0 | 0x0A31A2 after 0x0A31E2 | 0x0A31A2 (D0243A=0xD1A8F7, D0243D=0xD2A83D, D007CA=0x0585E9, D02590=0xD3FE81) | - |

## Replay Events

| Case | # | Block | PC | Prev PC | Writes | Before watch fields | After watch fields |
| --- | ---: | ---: | --- | --- | --- | --- | --- |
| replay_pointer_triple | 1 | 4986 | 0x0A31A2 | 0x0A31E2 | D0243A=0xD1A8F7, D0243D=0xD2A83D, D02590=0xD3FE81 | D0243A=0x000000, D0243D=0x000000, D007CA=0x0585E9, D02590=0x000000 | D0243A=0xD1A8F7, D0243D=0xD2A83D, D007CA=0x0585E9, D02590=0xD3FE81 |
| replay_pointer_triple_plus_d02a40 | 1 | 4986 | 0x0A31A2 | 0x0A31E2 | D0243A=0xD1A8F7, D0243D=0xD2A83D, D02590=0xD3FE81, D02A40=0xD2A83E | D0243A=0x000000, D0243D=0x000000, D007CA=0x0585E9, D02590=0x000000 | D0243A=0xD1A8F7, D0243D=0xD2A83D, D007CA=0x0585E9, D02590=0xD3FE81 |

## Pointer Zeroes

| Case | Kind | Block | PC | Prev PC | Before | After |
| --- | --- | ---: | --- | --- | --- | --- |
| no_replay | first | 4986 | 0x0A31A2 | 0x0A31E2 | D0243A=0xD1A8F7, D0243D=0xD2A83D, D007CA=0x0585E9, D02590=0xD3FE81 | D0243A=0x000000, D0243D=0x000000, D007CA=0x0585E9, D02590=0x000000 |
| replay_pointer_triple | first | 4986 | 0x0A31A2 | 0x0A31E2 | D0243A=0xD1A8F7, D0243D=0xD2A83D, D007CA=0x0585E9, D02590=0xD3FE81 | D0243A=0x000000, D0243D=0x000000, D007CA=0x0585E9, D02590=0x000000 |
| replay_pointer_triple_plus_d02a40 | first | 4986 | 0x0A31A2 | 0x0A31E2 | D0243A=0xD1A8F7, D0243D=0xD2A83D, D007CA=0x0585E9, D02590=0xD3FE81 | D0243A=0x000000, D0243D=0x000000, D007CA=0x0585E9, D02590=0x000000 |

## Target Hits

| Case | Target | Hits |
| --- | --- | ---: |
| no_replay | controlPreStop0A229D | 0 |
| no_replay | engine08F54B | 0 |
| no_replay | zeroPrev0A31E2 | 1 |
| no_replay | zeroEntry0A31A2 | 1 |
| no_replay | cleanup0018F8 | 1 |
| no_replay | prewipe001879 | 1 |
| no_replay | low000862 | 0 |
| no_replay | low000A92 | 0 |
| no_replay | low03D044 | 19 |
| no_replay | caller058A16 | 0 |
| no_replay | spaceFill0A2A37 | 10 |
| no_replay | tokenOuter08F3B8 | 0 |
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
| replay_pointer_triple_plus_d02a40 | controlPreStop0A229D | 0 |
| replay_pointer_triple_plus_d02a40 | engine08F54B | 0 |
| replay_pointer_triple_plus_d02a40 | zeroPrev0A31E2 | 1 |
| replay_pointer_triple_plus_d02a40 | zeroEntry0A31A2 | 1 |
| replay_pointer_triple_plus_d02a40 | cleanup0018F8 | 0 |
| replay_pointer_triple_plus_d02a40 | prewipe001879 | 0 |
| replay_pointer_triple_plus_d02a40 | low000862 | 0 |
| replay_pointer_triple_plus_d02a40 | low000A92 | 0 |
| replay_pointer_triple_plus_d02a40 | low03D044 | 12 |
| replay_pointer_triple_plus_d02a40 | caller058A16 | 0 |
| replay_pointer_triple_plus_d02a40 | spaceFill0A2A37 | 9 |
| replay_pointer_triple_plus_d02a40 | tokenOuter08F3B8 | 0 |

## Wipes

| Case | # | Block | PC | Prev PC | Stack owner return | Prior wipe count | Fields |
| --- | ---: | ---: | --- | --- | --- | ---: | --- |
| no_replay | 1 | 11129 | 0x0018F8 | 0x001879 | 0x0013E8 | 0 | D007CA=0x000000, D008E0=0x000000, D0243A=0x000000, D0243D=0x000000, D02590=0x000000, D02A40=0x000000, D00595=0x00, D00596=0x00, D00587=0x00, D0058C=0x00, D0058E=0x00, D00080=0x00, D0009F=0x00, D02A28=0x00, D02A29=0x000000, D02A2B=0x000000, D02A1B=0x000000, D01150=0x000000, D0059A=0x00 |

## Full JSON

```json
{
  "probe": "phase839-browser-eol-post-zero-replay",
  "chromePath": "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "pageUrl": "http://127.0.0.1:58574/browser-shell.html",
  "pass": true,
  "results": [
    {
      "name": "no_replay",
      "label": "No replay after 0x0A31E2 clear",
      "writes": [
        {
          "field": "D0243A",
          "value": 13740280
        }
      ],
      "replayWrites": [],
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
        "classification": "STILL_WIPES",
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
        "status": "Key: CLEAR → 11149 steps (control_pre_stop, peak 10861px)",
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
          "steps": 11149,
          "termination": "control_pre_stop",
          "wipes": 0,
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
          "vramCurrent": 10861
        },
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
            "nonWhite": 456
          },
          "vramCurrent": 10861,
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
            "steps": 11149,
            "termination": "control_pre_stop",
            "wipes": 0,
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
            "vramCurrent": 10861
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
        "label": "No replay after 0x0A31E2 clear",
        "caseConfig": {
          "replayWrites": []
        },
        "replayWrites": [],
        "replayApplied": false,
        "replayEvents": [],
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
          "status": "Key: CLEAR → 11149 steps (control_pre_stop, peak 10861px)",
          "runtimeMode": "coldboot",
          "lastPc": 6265,
          "lastMode": "adl",
          "totalSteps": 648856,
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
              "steps": 11149,
              "termination": "control_pre_stop",
              "wipes": 0,
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
              "vramCurrent": 10861
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
          "vram": 10861,
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
            "steps": 11149,
            "termination": "control_pre_stop",
            "wipes": 0,
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
            "vramCurrent": 10861
          },
          "pageErrors": []
        },
        "totalBlocks": 11129,
        "prevPc": "0x001879",
        "lastPcs": [
          {
            "block": 11010,
            "pc": "0x001CC0",
            "prevPc": "0x001CA6"
          },
          {
            "block": 11011,
            "pc": "0x001CCA",
            "prevPc": "0x001CC0"
          },
          {
            "block": 11012,
            "pc": "0x001CE4",
            "prevPc": "0x001CCA"
          },
          {
            "block": 11013,
            "pc": "0x001C81",
            "prevPc": "0x001CE4"
          },
          {
            "block": 11014,
            "pc": "0x001C82",
            "prevPc": "0x001C81"
          },
          {
            "block": 11015,
            "pc": "0x001C48",
            "prevPc": "0x001C82"
          },
          {
            "block": 11016,
            "pc": "0x001C33",
            "prevPc": "0x001C48"
          },
          {
            "block": 11017,
            "pc": "0x001C4A",
            "prevPc": "0x001C33"
          },
          {
            "block": 11018,
            "pc": "0x0158D2",
            "prevPc": "0x001C4A"
          },
          {
            "block": 11019,
            "pc": "0x0158DA",
            "prevPc": "0x0158D2"
          },
          {
            "block": 11020,
            "pc": "0x0158EC",
            "prevPc": "0x0158DA"
          },
          {
            "block": 11021,
            "pc": "0x0158EE",
            "prevPc": "0x0158EC"
          },
          {
            "block": 11022,
            "pc": "0x0158F8",
            "prevPc": "0x0158EE"
          },
          {
            "block": 11023,
            "pc": "0x0013DA",
            "prevPc": "0x0158F8"
          },
          {
            "block": 11024,
            "pc": "0x0013E4",
            "prevPc": "0x0013DA"
          },
          {
            "block": 11025,
            "pc": "0x001853",
            "prevPc": "0x0013E4"
          },
          {
            "block": 11026,
            "pc": "0x0158DE",
            "prevPc": "0x001853"
          },
          {
            "block": 11027,
            "pc": "0x0158E8",
            "prevPc": "0x0158DE"
          },
          {
            "block": 11028,
            "pc": "0x0158BC",
            "prevPc": "0x0158E8"
          },
          {
            "block": 11029,
            "pc": "0x001C55",
            "prevPc": "0x0158BC"
          },
          {
            "block": 11030,
            "pc": "0x001C33",
            "prevPc": "0x001C55"
          },
          {
            "block": 11031,
            "pc": "0x001C38",
            "prevPc": "0x001C33"
          },
          {
            "block": 11032,
            "pc": "0x001C3C",
            "prevPc": "0x001C38"
          },
          {
            "block": 11033,
            "pc": "0x001C42",
            "prevPc": "0x001C3C"
          },
          {
            "block": 11034,
            "pc": "0x001C5D",
            "prevPc": "0x001C42"
          },
          {
            "block": 11035,
            "pc": "0x001C5E",
            "prevPc": "0x001C5D"
          },
          {
            "block": 11036,
            "pc": "0x001C6B",
            "prevPc": "0x001C5E"
          },
          {
            "block": 11037,
            "pc": "0x0158C4",
            "prevPc": "0x001C6B"
          },
          {
            "block": 11038,
            "pc": "0x0158C6",
            "prevPc": "0x0158C4"
          },
          {
            "block": 11039,
            "pc": "0x001C4F",
            "prevPc": "0x0158C6"
          },
          {
            "block": 11040,
            "pc": "0x001CA6",
            "prevPc": "0x001C4F"
          },
          {
            "block": 11041,
            "pc": "0x001CBC",
            "prevPc": "0x001CA6"
          },
          {
            "block": 11042,
            "pc": "0x001CE5",
            "prevPc": "0x001CBC"
          },
          {
            "block": 11043,
            "pc": "0x001C54",
            "prevPc": "0x001CE5"
          },
          {
            "block": 11044,
            "pc": "0x0158CA",
            "prevPc": "0x001C54"
          },
          {
            "block": 11045,
            "pc": "0x001C33",
            "prevPc": "0x0158CA"
          },
          {
            "block": 11046,
            "pc": "0x001C38",
            "prevPc": "0x001C33"
          },
          {
            "block": 11047,
            "pc": "0x001C3C",
            "prevPc": "0x001C38"
          },
          {
            "block": 11048,
            "pc": "0x001C44",
            "prevPc": "0x001C3C"
          },
          {
            "block": 11049,
            "pc": "0x001C7D",
            "prevPc": "0x001C44"
          },
          {
            "block": 11050,
            "pc": "0x001CA6",
            "prevPc": "0x001C7D"
          },
          {
            "block": 11051,
            "pc": "0x001CC0",
            "prevPc": "0x001CA6"
          },
          {
            "block": 11052,
            "pc": "0x001CCA",
            "prevPc": "0x001CC0"
          },
          {
            "block": 11053,
            "pc": "0x001CE4",
            "prevPc": "0x001CCA"
          },
          {
            "block": 11054,
            "pc": "0x001C81",
            "prevPc": "0x001CE4"
          },
          {
            "block": 11055,
            "pc": "0x001C82",
            "prevPc": "0x001C81"
          },
          {
            "block": 11056,
            "pc": "0x001C48",
            "prevPc": "0x001C82"
          },
          {
            "block": 11057,
            "pc": "0x001C33",
            "prevPc": "0x001C48"
          },
          {
            "block": 11058,
            "pc": "0x001C38",
            "prevPc": "0x001C33"
          },
          {
            "block": 11059,
            "pc": "0x001C3C",
            "prevPc": "0x001C38"
          },
          {
            "block": 11060,
            "pc": "0x001C44",
            "prevPc": "0x001C3C"
          },
          {
            "block": 11061,
            "pc": "0x001C7D",
            "prevPc": "0x001C44"
          },
          {
            "block": 11062,
            "pc": "0x001CA6",
            "prevPc": "0x001C7D"
          },
          {
            "block": 11063,
            "pc": "0x001CBC",
            "prevPc": "0x001CA6"
          },
          {
            "block": 11064,
            "pc": "0x001CE5",
            "prevPc": "0x001CBC"
          },
          {
            "block": 11065,
            "pc": "0x001C81",
            "prevPc": "0x001CE5"
          },
          {
            "block": 11066,
            "pc": "0x001C82",
            "prevPc": "0x001C81"
          },
          {
            "block": 11067,
            "pc": "0x001C48",
            "prevPc": "0x001C82"
          },
          {
            "block": 11068,
            "pc": "0x001C33",
            "prevPc": "0x001C48"
          },
          {
            "block": 11069,
            "pc": "0x001C38",
            "prevPc": "0x001C33"
          },
          {
            "block": 11070,
            "pc": "0x001C44",
            "prevPc": "0x001C38"
          },
          {
            "block": 11071,
            "pc": "0x001C7D",
            "prevPc": "0x001C44"
          },
          {
            "block": 11072,
            "pc": "0x001CA6",
            "prevPc": "0x001C7D"
          },
          {
            "block": 11073,
            "pc": "0x001CBC",
            "prevPc": "0x001CA6"
          },
          {
            "block": 11074,
            "pc": "0x001CE5",
            "prevPc": "0x001CBC"
          },
          {
            "block": 11075,
            "pc": "0x001C81",
            "prevPc": "0x001CE5"
          },
          {
            "block": 11076,
            "pc": "0x001C82",
            "prevPc": "0x001C81"
          },
          {
            "block": 11077,
            "pc": "0x001C48",
            "prevPc": "0x001C82"
          },
          {
            "block": 11078,
            "pc": "0x001C33",
            "prevPc": "0x001C48"
          },
          {
            "block": 11079,
            "pc": "0x001C38",
            "prevPc": "0x001C33"
          },
          {
            "block": 11080,
            "pc": "0x001C44",
            "prevPc": "0x001C38"
          },
          {
            "block": 11081,
            "pc": "0x001C7D",
            "prevPc": "0x001C44"
          },
          {
            "block": 11082,
            "pc": "0x001CA6",
            "prevPc": "0x001C7D"
          },
          {
            "block": 11083,
            "pc": "0x001CBC",
            "prevPc": "0x001CA6"
          },
          {
            "block": 11084,
            "pc": "0x001CE5",
            "prevPc": "0x001CBC"
          },
          {
            "block": 11085,
            "pc": "0x001C81",
            "prevPc": "0x001CE5"
          },
          {
            "block": 11086,
            "pc": "0x001C82",
            "prevPc": "0x001C81"
          },
          {
            "block": 11087,
            "pc": "0x001C48",
            "prevPc": "0x001C82"
          },
          {
            "block": 11088,
            "pc": "0x001C33",
            "prevPc": "0x001C48"
          },
          {
            "block": 11089,
            "pc": "0x001C38",
            "prevPc": "0x001C33"
          },
          {
            "block": 11090,
            "pc": "0x001C44",
            "prevPc": "0x001C38"
          },
          {
            "block": 11091,
            "pc": "0x001C7D",
            "prevPc": "0x001C44"
          },
          {
            "block": 11092,
            "pc": "0x001CA6",
            "prevPc": "0x001C7D"
          },
          {
            "block": 11093,
            "pc": "0x001CBC",
            "prevPc": "0x001CA6"
          },
          {
            "block": 11094,
            "pc": "0x001CE5",
            "prevPc": "0x001CBC"
          },
          {
            "block": 11095,
            "pc": "0x001C81",
            "prevPc": "0x001CE5"
          },
          {
            "block": 11096,
            "pc": "0x001C82",
            "prevPc": "0x001C81"
          },
          {
            "block": 11097,
            "pc": "0x001C48",
            "prevPc": "0x001C82"
          },
          {
            "block": 11098,
            "pc": "0x001C33",
            "prevPc": "0x001C48"
          },
          {
            "block": 11099,
            "pc": "0x001C38",
            "prevPc": "0x001C33"
          },
          {
            "block": 11100,
            "pc": "0x001C44",
            "prevPc": "0x001C38"
          },
          {
            "block": 11101,
            "pc": "0x001C7D",
            "prevPc": "0x001C44"
          },
          {
            "block": 11102,
            "pc": "0x001CA6",
            "prevPc": "0x001C7D"
          },
          {
            "block": 11103,
            "pc": "0x001CC0",
            "prevPc": "0x001CA6"
          },
          {
            "block": 11104,
            "pc": "0x001CCA",
            "prevPc": "0x001CC0"
          },
          {
            "block": 11105,
            "pc": "0x001CE4",
            "prevPc": "0x001CCA"
          },
          {
            "block": 11106,
            "pc": "0x001C81",
            "prevPc": "0x001CE4"
          },
          {
            "block": 11107,
            "pc": "0x001C82",
            "prevPc": "0x001C81"
          },
          {
            "block": 11108,
            "pc": "0x001C48",
            "prevPc": "0x001C82"
          },
          {
            "block": 11109,
            "pc": "0x001C33",
            "prevPc": "0x001C48"
          },
          {
            "block": 11110,
            "pc": "0x001C38",
            "prevPc": "0x001C33"
          },
          {
            "block": 11111,
            "pc": "0x001C44",
            "prevPc": "0x001C38"
          },
          {
            "block": 11112,
            "pc": "0x001C7D",
            "prevPc": "0x001C44"
          },
          {
            "block": 11113,
            "pc": "0x001CA6",
            "prevPc": "0x001C7D"
          },
          {
            "block": 11114,
            "pc": "0x001CC0",
            "prevPc": "0x001CA6"
          },
          {
            "block": 11115,
            "pc": "0x001CCA",
            "prevPc": "0x001CC0"
          },
          {
            "block": 11116,
            "pc": "0x001CE4",
            "prevPc": "0x001CCA"
          },
          {
            "block": 11117,
            "pc": "0x001C81",
            "prevPc": "0x001CE4"
          },
          {
            "block": 11118,
            "pc": "0x001C82",
            "prevPc": "0x001C81"
          },
          {
            "block": 11119,
            "pc": "0x001C48",
            "prevPc": "0x001C82"
          },
          {
            "block": 11120,
            "pc": "0x001C33",
            "prevPc": "0x001C48"
          },
          {
            "block": 11121,
            "pc": "0x001C4A",
            "prevPc": "0x001C33"
          },
          {
            "block": 11122,
            "pc": "0x0158D2",
            "prevPc": "0x001C4A"
          },
          {
            "block": 11123,
            "pc": "0x0158DA",
            "prevPc": "0x0158D2"
          },
          {
            "block": 11124,
            "pc": "0x0158EC",
            "prevPc": "0x0158DA"
          },
          {
            "block": 11125,
            "pc": "0x0158EE",
            "prevPc": "0x0158EC"
          },
          {
            "block": 11126,
            "pc": "0x0158F8",
            "prevPc": "0x0158EE"
          },
          {
            "block": 11127,
            "pc": "0x001872",
            "prevPc": "0x0158F8"
          },
          {
            "block": 11128,
            "pc": "0x001879",
            "prevPc": "0x001872"
          },
          {
            "block": 11129,
            "pc": "0x0018F8",
            "prevPc": "0x001879"
          }
        ],
        "hotBlocks": {
          "0x08C331": 1,
          "0x05C634": 3,
          "0x000038": 22,
          "0x0006F3": 22,
          "0x000704": 22,
          "0x000710": 22,
          "0x001713": 22,
          "0x0008BB": 22,
          "0x001717": 22,
          "0x001718": 22,
          "0x00171E": 22,
          "0x0067F8": 22,
          "0x001C4F": 48,
          "0x001CA6": 151,
          "0x001CC0": 139,
          "0x001CCA": 139,
          "0x001CCE": 22,
          "0x001CD5": 22,
          "0x001CE5": 34,
          "0x001C54": 48,
          "0x006808": 22,
          "0x001C33": 131,
          "0x001C38": 129,
          "0x001C3C": 119,
          "0x001C44": 103,
          "0x001C7D": 103,
          "0x001CE4": 117,
          "0x001C81": 103,
          "0x001C82": 103,
          "0x001C48": 103,
          "0x001C42": 26,
          "0x006810": 22,
          "0x006812": 22,
          "0x006816": 22,
          "0x00681E": 22,
          "0x006828": 22,
          "0x001727": 22,
          "0x000719": 22,
          "0x00071D": 22,
          "0x02010C": 22,
          "0x03CF7D": 22,
          "0x03CFA4": 22,
          "0x03CFCF": 22,
          "0x03CFD4": 19,
          "0x03CFDB": 19,
          "0x03CFE0": 19,
          "0x03CFE5": 19,
          "0x03CFEA": 19,
          "0x03D029": 19,
          "0x03D033": 19,
          "0x03D038": 19,
          "0x03D044": 19,
          "0x03D04C": 19,
          "0x03D054": 19,
          "0x03F994": 19,
          "0x0003D4": 19,
          "0x003CC2": 19,
          "0x003CD4": 19,
          "0x003CE0": 19,
          "0x003CEE": 19,
          "0x003CF3": 19,
          "0x03F998": 19,
          "0x03F99A": 19,
          "0x03F9AB": 19,
          "0x03F9AE": 19,
          "0x03D058": 19,
          "0x03D060": 19,
          "0x03D0E0": 22,
          "0x05C67C": 3,
          "0x08C339": 1,
          "0x06CE73": 1,
          "0x06CE7F": 1,
          "0x06CE7B": 1,
          "0x06C8AB": 1,
          "0x08C33D": 3,
          "0x0A349A": 3,
          "0x0A349F": 3,
          "0x0A32F9": 5,
          "0x0A3301": 2,
          "0x08C308": 6,
          "0x0A331E": 5,
          "0x0A336F": 5,
          "0x0A3383": 5,
          "0x0A338A": 5,
          "0x0A33FB": 20,
          "0x0A3408": 132,
          "0x0A3404": 120,
          "0x0A340F": 44,
          "0x0A3392": 5,
          "0x0A339A": 5,
          "0x0A33E6": 20,
          "0x0A33FF": 20,
          "0x0A33EE": 20,
          "0x0A3403": 20,
          "0x0A33A2": 5,
          "0x0A33AA": 5,
          "0x0A33B2": 5,
          "0x0A33BA": 5,
          "0x0A33C2": 5,
          "0x0A33CA": 5,
          "0x0A33DA": 5,
          "0x0A33E4": 2,
          "0x0A34AE": 3,
          "0x08C341": 3,
          "0x05C75B": 3,
          "0x05C760": 3,
          "0x05C768": 3,
          "0x05C771": 5,
          "0x05C795": 5,
          "0x05C7A5": 5,
          "0x05C7AD": 5,
          "0x05C7B5": 5,
          "0x05C7C1": 5,
          "0x05C7D7": 5,
          "0x05C7DD": 3,
          "0x05C7ED": 3,
          "0x05C815": 3,
          "0x0A237E": 8,
          "0x0A2A37": 10,
          "0x0A2389": 8,
          "0x05C819": 3,
          "0x05C82C": 5,
          "0x05C832": 5,
          "0x05E3D6": 5,
          "0x04C973": 13,
          "0x05C836": 5,
          "0x05C84D": 3,
          "0x05CA44": 3,
          "0x05CA4E": 3,
          "0x05CA57": 3,
          "0x05C851": 3,
          "0x05CBC0": 3,
          "0x05CBC3": 3,
          "0x05CBC9": 3,
          "0x05C855": 3,
          "0x05C875": 5,
          "0x05C87E": 5,
          "0x0A1799": 8,
          "0x0A17AA": 5,
          "0x0A17AE": 5,
          "0x0A17B2": 6,
          "0x0A17B8": 6,
          "0x07BF3E": 8,
          "0x07BF4D": 8,
          "0x07BF5C": 8,
          "0x000380": 8,
          "0x003D85": 8,
          "0x07BF61": 8,
          "0x0A17C5": 8,
          "0x0A2D4C": 10,
          "0x0A17D0": 8,
          "0x00038C": 8,
          "0x005A53": 8,
          "0x0A17E9": 8,
          "0x0A17EF": 8,
          "0x0A17F7": 8,
          "0x0A1805": 8,
          "0x0A180B": 5,
          "0x0A1838": 5,
          "0x0A1A8F": 5,
          "0x0A183D": 5,
          "0x0A184A": 8,
          "0x0A1854": 128,
          "0x0A187C": 128,
          "0x0A188A": 128,
          "0x0A189E": 128,
          "0x0A18A6": 80,
          "0x0A1A83": 160,
          "0x0A18AF": 80,
          "0x0A18C1": 80,
          "0x0A18C4": 80,
          "0x0A18CA": 80,
          "0x0A18E9": 80,
          "0x0A18EB": 80,
          "0x0A190D": 128,
          "0x0A191F": 128,
          "0x0A1939": 128,
          "0x0A1969": 128,
          "0x0A1976": 128,
          "0x0A1980": 128,
          "0x0A1988": 80,
          "0x0A1994": 80,
          "0x0A19A4": 560,
          "0x0A19AA": 80,
          "0x0A19B5": 80,
          "0x0A19B7": 80,
          "0x0A19D7": 128,
          "0x0A1A1D": 128,
          "0x0A1A30": 8,
          "0x05C883": 5,
          "0x08C345": 3,
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
          "0x08C73D": 2,
          "0x08C53A": 2,
          "0x08C543": 2,
          "0x08C593": 2,
          "0x08C359": 2,
          "0x02FCB3": 2,
          "0x02FCB9": 2,
          "0x02FD8F": 2,
          "0x02FDA6": 2,
          "0x03013A": 2,
          "0x03013F": 2,
          "0x030145": 2,
          "0x03014B": 2,
          "0x030151": 2,
          "0x030157": 2,
          "0x02FDAC": 2,
          "0x05C76C": 2,
          "0x05C81E": 2,
          "0x02FDB6": 2,
          "0x03FA09": 2,
          "0x05C623": 8,
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
          "0x05E3F5": 3,
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
          "0x03CFFE": 3,
          "0x0A20EE": 1,
          "0x0A20F1": 1,
          "0x0A2C16": 1,
          "0x0A2BFD": 1,
          "0x0A17AF": 3,
          "0x0A1842": 3,
          "0x0A19CC": 48,
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
          "0x05C838": 2,
          "0x05C83E": 2,
          "0x05C842": 2,
          "0x05C849": 2,
          "0x03FA1C": 1,
          "0x03FA93": 1,
          "0x03FA9C": 1,
          "0x03FAA2": 1,
          "0x03FABC": 1,
          "0x02515C": 1,
          "0x025196": 1,
          "0x0251A1": 1,
          "0x0251CB": 1,
          "0x03FAC1": 1,
          "0x0005F4": 1,
          "0x0158B1": 1,
          "0x03FAC5": 1,
          "0x03FAC9": 1,
          "0x03FAD6": 1,
          "0x03FAE2": 1,
          "0x03FAE8": 1,
          "0x048AC4": 1,
          "0x00012C": 12,
          "0x002197": 12,
          "0x048ACC": 1,
          "0x048AE0": 1,
          "0x048AE5": 1,
          "0x03F26D": 2,
          "0x048AE9": 1,
          "0x048B07": 1,
          "0x048B11": 1,
          "0x048B21": 1,
          "0x048B26": 1,
          "0x05206E": 3,
          "0x052089": 3,
          "0x048B3C": 1,
          "0x048B5B": 1,
          "0x0000B0": 11,
          "0x00285F": 11,
          "0x002873": 11,
          "0x00287D": 11,
          "0x048B69": 1,
          "0x048B81": 1,
          "0x048B91": 1,
          "0x048BA1": 1,
          "0x048BB1": 1,
          "0x048BC1": 1,
          "0x048BD1": 1,
          "0x0457B2": 1,
          "0x04586B": 1,
          "0x048BD7": 1,
          "0x048BEB": 1,
          "0x04E07B": 1,
          "0x000130": 3,
          "0x00218A": 3,
          "0x04E07F": 1,
          "0x04E091": 1,
          "0x04E0A1": 1,
          "0x04E0B1": 1,
          "0x052013": 2,
          "0x04E0CC": 1,
          "0x0BCD24": 1,
          "0x04E0D1": 1,
          "0x04E0D6": 1,
          "0x048BFB": 1,
          "0x049CCA": 1,
          "0x049CD2": 1,
          "0x049D11": 1,
          "0x049D19": 1,
          "0x049A23": 1,
          "0x049A2B": 1,
          "0x049A3A": 1,
          "0x000124": 2,
          "0x00211B": 2,
          "0x002147": 2,
          "0x049AA7": 1,
          "0x000210": 1,
          "0x002623": 1,
          "0x00263E": 1,
          "0x002649": 1,
          "0x049AC9": 1,
          "0x049CC2": 1,
          "0x049D23": 1,
          "0x049D2F": 1,
          "0x049D77": 1,
          "0x049DF9": 1,
          "0x049DFE": 1,
          "0x048C0A": 1,
          "0x048C20": 1,
          "0x048C2C": 1,
          "0x04985C": 1,
          "0x048C44": 1,
          "0x048C4E": 1,
          "0x048964": 1,
          "0x048968": 1,
          "0x048C5D": 1,
          "0x048C6B": 1,
          "0x05202F": 13,
          "0x048C75": 1,
          "0x048C7F": 1,
          "0x048C89": 1,
          "0x048C93": 1,
          "0x048C9D": 1,
          "0x048CA7": 1,
          "0x048CB1": 1,
          "0x048CBB": 1,
          "0x048CC5": 1,
          "0x048CCF": 1,
          "0x048CD9": 1,
          "0x048CE3": 1,
          "0x048CED": 1,
          "0x04CA7B": 1,
          "0x040D11": 1,
          "0x040D1F": 1,
          "0x040D29": 1,
          "0x040D3E": 1,
          "0x048CF2": 1,
          "0x048CF7": 1,
          "0x049FFA": 1,
          "0x04A00A": 1,
          "0x04A00F": 1,
          "0x04A01F": 1,
          "0x04A024": 1,
          "0x048D05": 1,
          "0x048D15": 1,
          "0x048D1A": 1,
          "0x048D2A": 1,
          "0x048D2F": 1,
          "0x048D3F": 1,
          "0x048D44": 1,
          "0x048D54": 1,
          "0x048D59": 1,
          "0x048D69": 1,
          "0x048D6E": 1,
          "0x040FAD": 1,
          "0x040FB1": 1,
          "0x040FC1": 1,
          "0x040FC6": 1,
          "0x000138": 4,
          "0x0021C2": 4,
          "0x040FCD": 1,
          "0x040FF9": 1,
          "0x048D77": 1,
          "0x048D8C": 1,
          "0x048D91": 1,
          "0x048DA1": 1,
          "0x048DA6": 1,
          "0x048DB6": 1,
          "0x048DBB": 1,
          "0x048DC9": 1,
          "0x048DCE": 1,
          "0x048DD3": 1,
          "0x048DE4": 1,
          "0x048DE9": 1,
          "0x048DED": 1,
          "0x048DFC": 1,
          "0x0419F1": 1,
          "0x0419F9": 1,
          "0x000178": 1,
          "0x0022F9": 1,
          "0x002301": 1,
          "0x002307": 1,
          "0x002306": 8,
          "0x002309": 1,
          "0x0022FF": 1,
          "0x041A09": 1,
          "0x000168": 1,
          "0x00229D": 1,
          "0x041A1D": 1,
          "0x04B664": 1,
          "0x04B67F": 1,
          "0x04B684": 1,
          "0x041A28": 1,
          "0x041A48": 1,
          "0x041A4D": 1,
          "0x041A5D": 1,
          "0x041A62": 1,
          "0x041A72": 1,
          "0x041A77": 1,
          "0x041A8D": 1,
          "0x041A8F": 1,
          "0x041AB1": 1,
          "0x041AB6": 1,
          "0x041AC6": 1,
          "0x041ACB": 1,
          "0x041AD4": 1,
          "0x041ADE": 1,
          "0x02AF88": 1,
          "0x02AF90": 1,
          "0x0BCB0B": 1,
          "0x0BCB13": 1,
          "0x02AF98": 1,
          "0x02AFB5": 1,
          "0x02AFA8": 4,
          "0x02AFBE": 3,
          "0x02AFB3": 1,
          "0x02AFE3": 1,
          "0x02AFEC": 1,
          "0x0BC93C": 1,
          "0x0BC944": 1,
          "0x02AFF0": 1,
          "0x02B00D": 1,
          "0x02B000": 1,
          "0x02B00B": 1,
          "0x02B03B": 1,
          "0x000100": 1,
          "0x00257F": 1,
          "0x002584": 1,
          "0x002583": 6,
          "0x002586": 1,
          "0x02B04E": 1,
          "0x0BCA42": 1,
          "0x0BCA4A": 1,
          "0x02B070": 1,
          "0x02B090": 1,
          "0x02B083": 1,
          "0x02B08E": 1,
          "0x02B0BE": 1,
          "0x0BCA85": 1,
          "0x0BCA8D": 1,
          "0x02B0C2": 1,
          "0x02B0E2": 1,
          "0x02B0D5": 2,
          "0x02B0EB": 1,
          "0x02B0E0": 1,
          "0x02B110": 1,
          "0x0BCAC8": 1,
          "0x0BCAD0": 1,
          "0x02B114": 1,
          "0x02B134": 1,
          "0x02B127": 1,
          "0x02B132": 1,
          "0x02B162": 1,
          "0x02AEC8": 1,
          "0x02AED0": 1,
          "0x000338": 1,
          "0x001CEB": 1,
          "0x001C55": 3,
          "0x001C5D": 3,
          "0x001C5E": 3,
          "0x001C6B": 3,
          "0x001CF3": 1,
          "0x001CF5": 1,
          "0x001CBC": 12,
          "0x001CF9": 1,
          "0x001D01": 1,
          "0x001D03": 1,
          "0x001D07": 1,
          "0x001D0C": 1,
          "0x02AED4": 1,
          "0x02AEE5": 1,
          "0x02AEE9": 1,
          "0x0000D4": 1,
          "0x0029E9": 1,
          "0x02AEF1": 1,
          "0x02AF22": 1,
          "0x02AF0F": 14,
          "0x000218": 14,
          "0x002696": 14,
          "0x0026A1": 14,
          "0x02AF1C": 14,
          "0x02AF2B": 13,
          "0x02AF20": 1,
          "0x02AF62": 1,
          "0x02B16B": 1,
          "0x02B175": 1,
          "0x02B17E": 1,
          "0x02B19A": 1,
          "0x02B18B": 2,
          "0x02B1A3": 1,
          "0x02B196": 1,
          "0x02B319": 1,
          "0x0BCB2F": 1,
          "0x0BCB37": 1,
          "0x02B31D": 1,
          "0x02B33A": 1,
          "0x02B32D": 3,
          "0x02B343": 2,
          "0x02B338": 1,
          "0x02B368": 1,
          "0x02B36D": 1,
          "0x000000": 1,
          "0x000658": 1,
          "0x000673": 1,
          "0x000679": 1,
          "0x00067E": 1,
          "0x0012CA": 1,
          "0x0012DD": 1,
          "0x0012E3": 1,
          "0x0012F3": 1,
          "0x001305": 1,
          "0x00131B": 1,
          "0x001324": 1,
          "0x00132D": 1,
          "0x001336": 1,
          "0x001352": 1,
          "0x001359": 79,
          "0x00135B": 1,
          "0x00136A": 1,
          "0x001370": 1,
          "0x001377": 254,
          "0x001379": 1,
          "0x00138A": 1,
          "0x001393": 1,
          "0x00139D": 1,
          "0x0013C3": 1,
          "0x001988": 1,
          "0x001991": 1,
          "0x00199E": 1,
          "0x0019A4": 1,
          "0x0019A9": 1,
          "0x0019B3": 1,
          "0x0013C7": 1,
          "0x0158DE": 2,
          "0x0158E8": 2,
          "0x0158BC": 2,
          "0x0158C4": 2,
          "0x0158C6": 2,
          "0x0158CA": 2,
          "0x001C4A": 2,
          "0x0158D2": 2,
          "0x0158DA": 2,
          "0x0158EC": 2,
          "0x0158EE": 2,
          "0x0158F8": 2,
          "0x0013DA": 1,
          "0x0013E4": 1,
          "0x001853": 1,
          "0x001872": 1,
          "0x001879": 1,
          "0x0018F8": 1
        },
        "topHotBlocks": [
          {
            "pc": "0x09EFDE",
            "count": 2880
          },
          {
            "pc": "0x0A19A4",
            "count": 560
          },
          {
            "pc": "0x001377",
            "count": 254
          },
          {
            "pc": "0x0A1A83",
            "count": 160
          },
          {
            "pc": "0x001CA6",
            "count": 151
          },
          {
            "pc": "0x001CC0",
            "count": 139
          },
          {
            "pc": "0x001CCA",
            "count": 139
          },
          {
            "pc": "0x0A3408",
            "count": 132
          },
          {
            "pc": "0x001C33",
            "count": 131
          },
          {
            "pc": "0x001C38",
            "count": 129
          },
          {
            "pc": "0x0A1854",
            "count": 128
          },
          {
            "pc": "0x0A187C",
            "count": 128
          },
          {
            "pc": "0x0A188A",
            "count": 128
          },
          {
            "pc": "0x0A189E",
            "count": 128
          },
          {
            "pc": "0x0A190D",
            "count": 128
          },
          {
            "pc": "0x0A191F",
            "count": 128
          },
          {
            "pc": "0x0A1939",
            "count": 128
          },
          {
            "pc": "0x0A1969",
            "count": 128
          },
          {
            "pc": "0x0A1976",
            "count": 128
          },
          {
            "pc": "0x0A1980",
            "count": 128
          },
          {
            "pc": "0x0A19D7",
            "count": 128
          },
          {
            "pc": "0x0A1A1D",
            "count": 128
          },
          {
            "pc": "0x0A3404",
            "count": 120
          },
          {
            "pc": "0x001C3C",
            "count": 119
          },
          {
            "pc": "0x001CE4",
            "count": 117
          },
          {
            "pc": "0x001C44",
            "count": 103
          },
          {
            "pc": "0x001C7D",
            "count": 103
          },
          {
            "pc": "0x001C81",
            "count": 103
          },
          {
            "pc": "0x001C82",
            "count": 103
          },
          {
            "pc": "0x001C48",
            "count": 103
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
          }
        ],
        "targetCounts": {
          "controlPreStop0A229D": 0,
          "engine08F54B": 0,
          "zeroPrev0A31E2": 1,
          "zeroEntry0A31A2": 1,
          "cleanup0018F8": 1,
          "prewipe001879": 1,
          "low000862": 0,
          "low000A92": 0,
          "low03D044": 19,
          "caller058A16": 0,
          "spaceFill0A2A37": 10,
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
            "target": "zeroPrev0A31E2",
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
          {
            "target": "zeroEntry0A31A2",
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
          }
        ],
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
        "stopRequested": {
          "reason": "first_wipe_0018f8",
          "block": 11129,
          "pc": "0x0018F8",
          "prevPc": "0x001879",
          "ownerReturn": "0x0013E8"
        },
        "fieldTransitions": [],
        "lastWatchFields": {
          "D0243A": 0,
          "D0243D": 0,
          "D007CA": 361961,
          "D02590": 0
        }
      }
    },
    {
      "name": "replay_pointer_triple",
      "label": "Replay D0243A/D0243D/D02590",
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
        "classification": "MAX_STEPS_NO_WIPE",
        "checks": {
          "code": true,
          "label": true,
          "controlPreStopPc": true,
          "controlPreStopLabel": true,
          "termination": false,
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
            "after": 13805131
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
        "status": "Key: CLEAR → 350000 steps (max_steps, peak 22198px)",
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
          "wipes": 0,
          "D0243A": 13739781,
          "D0243D": 13805131,
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
          "vramPeak": 22198,
          "vramCurrent": 19628
        },
        "diagnostics": {
          "D007CA": 361961,
          "D008E0": 13740131,
          "D0243A": 13739781,
          "D0243D": 13805131,
          "D02590": 13893249,
          "D00595": 199,
          "D00596": 3,
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
            "nonWhite": 908
          },
          "vramCurrent": 19628,
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
            "wipes": 0,
            "D0243A": 13739781,
            "D0243D": 13805131,
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
            "vramPeak": 22198,
            "vramCurrent": 19628
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
            "D0243D": 13805131,
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
        "label": "Replay D0243A/D0243D/D02590",
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
          "status": "Key: CLEAR → 350000 steps (max_steps, peak 22198px)",
          "runtimeMode": "coldboot",
          "lastPc": 661791,
          "lastMode": "adl",
          "totalSteps": 987707,
          "cpu": {
            "pc": 661773,
            "sp": 13740074,
            "af": 92,
            "bc": 16712960,
            "de": 640,
            "hl": 14010188,
            "ix": 13632940,
            "iy": 13631616,
            "f": 92,
            "halted": false,
            "madl": 1,
            "stepCount": 349999
          },
          "fields": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13739781,
            "D0243D": 13805131,
            "D02590": 13893249,
            "D02A40": 0,
            "D00595": 199,
            "D00596": 3,
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
              "addr": 13740074,
              "value": 16714501
            },
            {
              "addr": 13740077,
              "value": 13740128
            },
            {
              "addr": 13740080,
              "value": 656936
            },
            {
              "addr": 13740083,
              "value": 0
            },
            {
              "addr": 13740086,
              "value": 1536
            },
            {
              "addr": 13740089,
              "value": 25858
            },
            {
              "addr": 13740092,
              "value": 666627
            },
            {
              "addr": 13740095,
              "value": 0
            }
          ],
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13739781,
            "D0243D": 13805131,
            "D02590": 13893249,
            "D00595": 199,
            "D00596": 3,
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
              "nonWhite": 908
            },
            "vramCurrent": 19628,
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
              "wipes": 0,
              "D0243A": 13739781,
              "D0243D": 13805131,
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
              "vramPeak": 22198,
              "vramCurrent": 19628
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
              "D0243D": 13805131,
              "D02A40": 0,
              "D02A28": 0
            }
          },
          "vram": 19628,
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
            "wipes": 0,
            "D0243A": 13739781,
            "D0243D": 13805131,
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
            "vramPeak": 22198,
            "vramCurrent": 19628
          },
          "pageErrors": []
        },
        "totalBlocks": 349987,
        "prevPc": "0x0A190D",
        "lastPcs": [
          {
            "block": 349868,
            "pc": "0x0A190D",
            "prevPc": "0x0A189E"
          },
          {
            "block": 349869,
            "pc": "0x0A191F",
            "prevPc": "0x0A190D"
          },
          {
            "block": 349870,
            "pc": "0x0A1939",
            "prevPc": "0x0A191F"
          },
          {
            "block": 349871,
            "pc": "0x0A1969",
            "prevPc": "0x0A1939"
          },
          {
            "block": 349872,
            "pc": "0x0A1976",
            "prevPc": "0x0A1969"
          },
          {
            "block": 349873,
            "pc": "0x0A1980",
            "prevPc": "0x0A1976"
          },
          {
            "block": 349874,
            "pc": "0x0A19CC",
            "prevPc": "0x0A1980"
          },
          {
            "block": 349875,
            "pc": "0x0A19D7",
            "prevPc": "0x0A19CC"
          },
          {
            "block": 349876,
            "pc": "0x0A1A1D",
            "prevPc": "0x0A19D7"
          },
          {
            "block": 349877,
            "pc": "0x0A1854",
            "prevPc": "0x0A1A1D"
          },
          {
            "block": 349878,
            "pc": "0x0A187C",
            "prevPc": "0x0A1854"
          },
          {
            "block": 349879,
            "pc": "0x0A188A",
            "prevPc": "0x0A187C"
          },
          {
            "block": 349880,
            "pc": "0x0A189E",
            "prevPc": "0x0A188A"
          },
          {
            "block": 349881,
            "pc": "0x0A190D",
            "prevPc": "0x0A189E"
          },
          {
            "block": 349882,
            "pc": "0x0A191F",
            "prevPc": "0x0A190D"
          },
          {
            "block": 349883,
            "pc": "0x0A1939",
            "prevPc": "0x0A191F"
          },
          {
            "block": 349884,
            "pc": "0x0A1969",
            "prevPc": "0x0A1939"
          },
          {
            "block": 349885,
            "pc": "0x0A1976",
            "prevPc": "0x0A1969"
          },
          {
            "block": 349886,
            "pc": "0x0A1980",
            "prevPc": "0x0A1976"
          },
          {
            "block": 349887,
            "pc": "0x0A19CC",
            "prevPc": "0x0A1980"
          },
          {
            "block": 349888,
            "pc": "0x0A19D7",
            "prevPc": "0x0A19CC"
          },
          {
            "block": 349889,
            "pc": "0x0A1A1D",
            "prevPc": "0x0A19D7"
          },
          {
            "block": 349890,
            "pc": "0x0A1A30",
            "prevPc": "0x0A1A1D"
          },
          {
            "block": 349891,
            "pc": "0x0A2C03",
            "prevPc": "0x0A1A30"
          },
          {
            "block": 349892,
            "pc": "0x0A2B85",
            "prevPc": "0x0A2C03"
          },
          {
            "block": 349893,
            "pc": "0x0A2B8F",
            "prevPc": "0x0A2B85"
          },
          {
            "block": 349894,
            "pc": "0x0A2BEB",
            "prevPc": "0x0A2B8F"
          },
          {
            "block": 349895,
            "pc": "0x0A2BF6",
            "prevPc": "0x0A2BEB"
          },
          {
            "block": 349896,
            "pc": "0x0A2BF9",
            "prevPc": "0x0A2BF6"
          },
          {
            "block": 349897,
            "pc": "0x0A1799",
            "prevPc": "0x0A2BF9"
          },
          {
            "block": 349898,
            "pc": "0x0A17AF",
            "prevPc": "0x0A1799"
          },
          {
            "block": 349899,
            "pc": "0x0A17B2",
            "prevPc": "0x0A17AF"
          },
          {
            "block": 349900,
            "pc": "0x0A17B8",
            "prevPc": "0x0A17B2"
          },
          {
            "block": 349901,
            "pc": "0x07BF3E",
            "prevPc": "0x0A17B8"
          },
          {
            "block": 349902,
            "pc": "0x07BF4D",
            "prevPc": "0x07BF3E"
          },
          {
            "block": 349903,
            "pc": "0x07BF5C",
            "prevPc": "0x07BF4D"
          },
          {
            "block": 349904,
            "pc": "0x000380",
            "prevPc": "0x07BF5C"
          },
          {
            "block": 349905,
            "pc": "0x003D85",
            "prevPc": "0x000380"
          },
          {
            "block": 349906,
            "pc": "0x07BF61",
            "prevPc": "0x003D85"
          },
          {
            "block": 349907,
            "pc": "0x0A17C5",
            "prevPc": "0x07BF61"
          },
          {
            "block": 349908,
            "pc": "0x0A2D4C",
            "prevPc": "0x0A17C5"
          },
          {
            "block": 349909,
            "pc": "0x0A17D0",
            "prevPc": "0x0A2D4C"
          },
          {
            "block": 349910,
            "pc": "0x00038C",
            "prevPc": "0x0A17D0"
          },
          {
            "block": 349911,
            "pc": "0x005A53",
            "prevPc": "0x00038C"
          },
          {
            "block": 349912,
            "pc": "0x0A17E9",
            "prevPc": "0x005A53"
          },
          {
            "block": 349913,
            "pc": "0x0A17EF",
            "prevPc": "0x0A17E9"
          },
          {
            "block": 349914,
            "pc": "0x0A17F7",
            "prevPc": "0x0A17EF"
          },
          {
            "block": 349915,
            "pc": "0x0A1805",
            "prevPc": "0x0A17F7"
          },
          {
            "block": 349916,
            "pc": "0x0A1842",
            "prevPc": "0x0A1805"
          },
          {
            "block": 349917,
            "pc": "0x0A184A",
            "prevPc": "0x0A1842"
          },
          {
            "block": 349918,
            "pc": "0x0A1854",
            "prevPc": "0x0A184A"
          },
          {
            "block": 349919,
            "pc": "0x0A187C",
            "prevPc": "0x0A1854"
          },
          {
            "block": 349920,
            "pc": "0x0A188A",
            "prevPc": "0x0A187C"
          },
          {
            "block": 349921,
            "pc": "0x0A189E",
            "prevPc": "0x0A188A"
          },
          {
            "block": 349922,
            "pc": "0x0A190D",
            "prevPc": "0x0A189E"
          },
          {
            "block": 349923,
            "pc": "0x0A191F",
            "prevPc": "0x0A190D"
          },
          {
            "block": 349924,
            "pc": "0x0A1939",
            "prevPc": "0x0A191F"
          },
          {
            "block": 349925,
            "pc": "0x0A1969",
            "prevPc": "0x0A1939"
          },
          {
            "block": 349926,
            "pc": "0x0A1976",
            "prevPc": "0x0A1969"
          },
          {
            "block": 349927,
            "pc": "0x0A1980",
            "prevPc": "0x0A1976"
          },
          {
            "block": 349928,
            "pc": "0x0A19CC",
            "prevPc": "0x0A1980"
          },
          {
            "block": 349929,
            "pc": "0x0A19D7",
            "prevPc": "0x0A19CC"
          },
          {
            "block": 349930,
            "pc": "0x0A1A1D",
            "prevPc": "0x0A19D7"
          },
          {
            "block": 349931,
            "pc": "0x0A1854",
            "prevPc": "0x0A1A1D"
          },
          {
            "block": 349932,
            "pc": "0x0A187C",
            "prevPc": "0x0A1854"
          },
          {
            "block": 349933,
            "pc": "0x0A188A",
            "prevPc": "0x0A187C"
          },
          {
            "block": 349934,
            "pc": "0x0A189E",
            "prevPc": "0x0A188A"
          },
          {
            "block": 349935,
            "pc": "0x0A190D",
            "prevPc": "0x0A189E"
          },
          {
            "block": 349936,
            "pc": "0x0A191F",
            "prevPc": "0x0A190D"
          },
          {
            "block": 349937,
            "pc": "0x0A1939",
            "prevPc": "0x0A191F"
          },
          {
            "block": 349938,
            "pc": "0x0A1969",
            "prevPc": "0x0A1939"
          },
          {
            "block": 349939,
            "pc": "0x0A1976",
            "prevPc": "0x0A1969"
          },
          {
            "block": 349940,
            "pc": "0x0A1980",
            "prevPc": "0x0A1976"
          },
          {
            "block": 349941,
            "pc": "0x0A19CC",
            "prevPc": "0x0A1980"
          },
          {
            "block": 349942,
            "pc": "0x0A19D7",
            "prevPc": "0x0A19CC"
          },
          {
            "block": 349943,
            "pc": "0x0A1A1D",
            "prevPc": "0x0A19D7"
          },
          {
            "block": 349944,
            "pc": "0x0A1854",
            "prevPc": "0x0A1A1D"
          },
          {
            "block": 349945,
            "pc": "0x0A187C",
            "prevPc": "0x0A1854"
          },
          {
            "block": 349946,
            "pc": "0x0A188A",
            "prevPc": "0x0A187C"
          },
          {
            "block": 349947,
            "pc": "0x0A189E",
            "prevPc": "0x0A188A"
          },
          {
            "block": 349948,
            "pc": "0x0A190D",
            "prevPc": "0x0A189E"
          },
          {
            "block": 349949,
            "pc": "0x0A191F",
            "prevPc": "0x0A190D"
          },
          {
            "block": 349950,
            "pc": "0x0A1939",
            "prevPc": "0x0A191F"
          },
          {
            "block": 349951,
            "pc": "0x0A1969",
            "prevPc": "0x0A1939"
          },
          {
            "block": 349952,
            "pc": "0x0A1976",
            "prevPc": "0x0A1969"
          },
          {
            "block": 349953,
            "pc": "0x0A1980",
            "prevPc": "0x0A1976"
          },
          {
            "block": 349954,
            "pc": "0x0A19CC",
            "prevPc": "0x0A1980"
          },
          {
            "block": 349955,
            "pc": "0x0A19D7",
            "prevPc": "0x0A19CC"
          },
          {
            "block": 349956,
            "pc": "0x0A1A1D",
            "prevPc": "0x0A19D7"
          },
          {
            "block": 349957,
            "pc": "0x0A1854",
            "prevPc": "0x0A1A1D"
          },
          {
            "block": 349958,
            "pc": "0x0A187C",
            "prevPc": "0x0A1854"
          },
          {
            "block": 349959,
            "pc": "0x0A188A",
            "prevPc": "0x0A187C"
          },
          {
            "block": 349960,
            "pc": "0x0A189E",
            "prevPc": "0x0A188A"
          },
          {
            "block": 349961,
            "pc": "0x0A190D",
            "prevPc": "0x0A189E"
          },
          {
            "block": 349962,
            "pc": "0x0A191F",
            "prevPc": "0x0A190D"
          },
          {
            "block": 349963,
            "pc": "0x0A1939",
            "prevPc": "0x0A191F"
          },
          {
            "block": 349964,
            "pc": "0x0A1969",
            "prevPc": "0x0A1939"
          },
          {
            "block": 349965,
            "pc": "0x0A1976",
            "prevPc": "0x0A1969"
          },
          {
            "block": 349966,
            "pc": "0x0A1980",
            "prevPc": "0x0A1976"
          },
          {
            "block": 349967,
            "pc": "0x0A19CC",
            "prevPc": "0x0A1980"
          },
          {
            "block": 349968,
            "pc": "0x0A19D7",
            "prevPc": "0x0A19CC"
          },
          {
            "block": 349969,
            "pc": "0x0A1A1D",
            "prevPc": "0x0A19D7"
          },
          {
            "block": 349970,
            "pc": "0x0A1854",
            "prevPc": "0x0A1A1D"
          },
          {
            "block": 349971,
            "pc": "0x0A187C",
            "prevPc": "0x0A1854"
          },
          {
            "block": 349972,
            "pc": "0x0A188A",
            "prevPc": "0x0A187C"
          },
          {
            "block": 349973,
            "pc": "0x0A189E",
            "prevPc": "0x0A188A"
          },
          {
            "block": 349974,
            "pc": "0x0A190D",
            "prevPc": "0x0A189E"
          },
          {
            "block": 349975,
            "pc": "0x0A191F",
            "prevPc": "0x0A190D"
          },
          {
            "block": 349976,
            "pc": "0x0A1939",
            "prevPc": "0x0A191F"
          },
          {
            "block": 349977,
            "pc": "0x0A1969",
            "prevPc": "0x0A1939"
          },
          {
            "block": 349978,
            "pc": "0x0A1976",
            "prevPc": "0x0A1969"
          },
          {
            "block": 349979,
            "pc": "0x0A1980",
            "prevPc": "0x0A1976"
          },
          {
            "block": 349980,
            "pc": "0x0A19CC",
            "prevPc": "0x0A1980"
          },
          {
            "block": 349981,
            "pc": "0x0A19D7",
            "prevPc": "0x0A19CC"
          },
          {
            "block": 349982,
            "pc": "0x0A1A1D",
            "prevPc": "0x0A19D7"
          },
          {
            "block": 349983,
            "pc": "0x0A1854",
            "prevPc": "0x0A1A1D"
          },
          {
            "block": 349984,
            "pc": "0x0A187C",
            "prevPc": "0x0A1854"
          },
          {
            "block": 349985,
            "pc": "0x0A188A",
            "prevPc": "0x0A187C"
          },
          {
            "block": 349986,
            "pc": "0x0A189E",
            "prevPc": "0x0A188A"
          },
          {
            "block": 349987,
            "pc": "0x0A190D",
            "prevPc": "0x0A189E"
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
          "0x04C973": 978,
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
          "0x0A1799": 1405,
          "0x0A17AA": 5,
          "0x0A17AE": 5,
          "0x0A17B2": 1403,
          "0x0A17B8": 1403,
          "0x07BF3E": 1405,
          "0x07BF4D": 1405,
          "0x07BF5C": 1405,
          "0x000380": 1405,
          "0x003D85": 1405,
          "0x07BF61": 1405,
          "0x0A17C5": 1405,
          "0x0A2D4C": 1407,
          "0x0A17D0": 1405,
          "0x00038C": 1405,
          "0x005A53": 1405,
          "0x0A17E9": 1405,
          "0x0A17EF": 1405,
          "0x0A17F7": 1405,
          "0x0A1805": 1405,
          "0x0A180B": 5,
          "0x0A1838": 5,
          "0x0A1A8F": 5,
          "0x0A183D": 5,
          "0x0A184A": 1405,
          "0x0A1854": 22470,
          "0x0A187C": 22470,
          "0x0A188A": 22470,
          "0x0A189E": 22470,
          "0x0A18A6": 80,
          "0x0A1A83": 160,
          "0x0A18AF": 80,
          "0x0A18C1": 80,
          "0x0A18C4": 80,
          "0x0A18CA": 80,
          "0x0A18E9": 80,
          "0x0A18EB": 80,
          "0x0A190D": 22470,
          "0x0A191F": 22469,
          "0x0A1939": 22469,
          "0x0A1969": 22469,
          "0x0A1976": 22469,
          "0x0A1980": 22469,
          "0x0A1988": 80,
          "0x0A1994": 80,
          "0x0A19A4": 560,
          "0x0A19AA": 80,
          "0x0A19B5": 80,
          "0x0A19B7": 80,
          "0x0A19D7": 22469,
          "0x0A1A1D": 22469,
          "0x0A1A30": 1404,
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
          "0x05E3E8": 487,
          "0x058221": 1,
          "0x058A14": 1,
          "0x058A2C": 1,
          "0x058A30": 1,
          "0x058A4C": 1,
          "0x05E7CD": 486,
          "0x05E242": 486,
          "0x05E246": 486,
          "0x05E247": 486,
          "0x05E3EC": 486,
          "0x05E24C": 486,
          "0x05E250": 486,
          "0x080064": 486,
          "0x05E256": 486,
          "0x05E26C": 499,
          "0x05E7D1": 486,
          "0x05E7D2": 486,
          "0x0A2B72": 486,
          "0x0A2A68": 486,
          "0x0A2AF9": 473,
          "0x0A2B16": 486,
          "0x0A2B51": 486,
          "0x0A2B7E": 486,
          "0x0A2B8F": 1456,
          "0x0A2BEB": 1455,
          "0x0A2C0C": 57,
          "0x0A2C10": 57,
          "0x0A20CC": 58,
          "0x0A20E4": 58,
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
          "0x0A2C16": 57,
          "0x0A2BFD": 1,
          "0x0A17AF": 1400,
          "0x0A1842": 1400,
          "0x0A19CC": 22389,
          "0x0A2C03": 1398,
          "0x0A2C05": 428,
          "0x05E7D6": 485,
          "0x0A20F0": 57,
          "0x0A2C25": 57,
          "0x0A2C08": 57,
          "0x0A2BF6": 1398,
          "0x0A2BF9": 1398,
          "0x005A60": 170,
          "0x0A2B85": 970,
          "0x05E259": 13,
          "0x05E25E": 13,
          "0x05E266": 13,
          "0x0A2A73": 13,
          "0x0A2A7D": 13,
          "0x0A2A83": 12,
          "0x0A2AAE": 12,
          "0x0A2AB6": 10,
          "0x0A2ABC": 10,
          "0x0A2AC4": 8,
          "0x0A2ACA": 7,
          "0x0A2ACE": 6,
          "0x0A2AFD": 13,
          "0x0A2B94": 1,
          "0x0A2B9F": 1,
          "0x0A2BA3": 1,
          "0x0A2AD6": 4,
          "0x0A2AE7": 2,
          "0x0A2ADC": 2,
          "0x0A2ADF": 2,
          "0x0A2AF3": 1
        },
        "topHotBlocks": [
          {
            "pc": "0x0A1854",
            "count": 22470
          },
          {
            "pc": "0x0A187C",
            "count": 22470
          },
          {
            "pc": "0x0A188A",
            "count": 22470
          },
          {
            "pc": "0x0A189E",
            "count": 22470
          },
          {
            "pc": "0x0A190D",
            "count": 22470
          },
          {
            "pc": "0x0A191F",
            "count": 22469
          },
          {
            "pc": "0x0A1939",
            "count": 22469
          },
          {
            "pc": "0x0A1969",
            "count": 22469
          },
          {
            "pc": "0x0A1976",
            "count": 22469
          },
          {
            "pc": "0x0A1980",
            "count": 22469
          },
          {
            "pc": "0x0A19D7",
            "count": 22469
          },
          {
            "pc": "0x0A1A1D",
            "count": 22469
          },
          {
            "pc": "0x0A19CC",
            "count": 22389
          },
          {
            "pc": "0x09EFDE",
            "count": 2880
          },
          {
            "pc": "0x0A2B8F",
            "count": 1456
          },
          {
            "pc": "0x0A2BEB",
            "count": 1455
          },
          {
            "pc": "0x0A2D4C",
            "count": 1407
          },
          {
            "pc": "0x0A1799",
            "count": 1405
          },
          {
            "pc": "0x07BF3E",
            "count": 1405
          },
          {
            "pc": "0x07BF4D",
            "count": 1405
          },
          {
            "pc": "0x07BF5C",
            "count": 1405
          },
          {
            "pc": "0x000380",
            "count": 1405
          },
          {
            "pc": "0x003D85",
            "count": 1405
          },
          {
            "pc": "0x07BF61",
            "count": 1405
          },
          {
            "pc": "0x0A17C5",
            "count": 1405
          },
          {
            "pc": "0x0A17D0",
            "count": 1405
          },
          {
            "pc": "0x00038C",
            "count": 1405
          },
          {
            "pc": "0x005A53",
            "count": 1405
          },
          {
            "pc": "0x0A17E9",
            "count": 1405
          },
          {
            "pc": "0x0A17EF",
            "count": 1405
          },
          {
            "pc": "0x0A17F7",
            "count": 1405
          },
          {
            "pc": "0x0A1805",
            "count": 1405
          },
          {
            "pc": "0x0A184A",
            "count": 1405
          },
          {
            "pc": "0x0A1A30",
            "count": 1404
          },
          {
            "pc": "0x0A17B2",
            "count": 1403
          },
          {
            "pc": "0x0A17B8",
            "count": 1403
          },
          {
            "pc": "0x0A17AF",
            "count": 1400
          },
          {
            "pc": "0x0A1842",
            "count": 1400
          },
          {
            "pc": "0x0A2C03",
            "count": 1398
          },
          {
            "pc": "0x0A2BF6",
            "count": 1398
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
            "target": "zeroPrev0A31E2",
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
          {
            "target": "zeroEntry0A31A2",
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
        ],
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
        "stopRequested": null,
        "fieldTransitions": [],
        "lastWatchFields": {
          "D0243A": 13739781,
          "D0243D": 13805131,
          "D007CA": 361961,
          "D02590": 13893249
        },
        "derivedStopReason": "max_steps_no_wipe"
      }
    },
    {
      "name": "replay_pointer_triple_plus_d02a40",
      "label": "Replay D0243A/D0243D/D02590/D02A40",
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
        },
        {
          "field": "D02A40",
          "value": 13805630
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
        "classification": "MAX_STEPS_NO_WIPE",
        "checks": {
          "code": true,
          "label": true,
          "controlPreStopPc": true,
          "controlPreStopLabel": true,
          "termination": false,
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
            "after": 13805131
          }
        },
        "hasTupleRestoreLog": false,
        "low006D": false,
        "missing202020": false
      },
      "state": {
        "status": "Key: CLEAR → 350000 steps (max_steps, peak 22198px)",
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
          "wipes": 0,
          "D0243A": 13739781,
          "D0243D": 13805131,
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
          "vramPeak": 22198,
          "vramCurrent": 19628
        },
        "diagnostics": {
          "D007CA": 361961,
          "D008E0": 13740131,
          "D0243A": 13739781,
          "D0243D": 13805131,
          "D02590": 13893249,
          "D00595": 199,
          "D00596": 3,
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
            "nonWhite": 908
          },
          "vramCurrent": 19628,
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
            "wipes": 0,
            "D0243A": 13739781,
            "D0243D": 13805131,
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
            "vramPeak": 22198,
            "vramCurrent": 19628
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
            "D0243D": 13805131,
            "D02A40": 13805630,
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
        "label": "Replay D0243A/D0243D/D02590/D02A40",
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
            },
            {
              "field": "D02A40",
              "value": 13805630
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
          },
          {
            "field": "D02A40",
            "value": 13805630
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
                },
                {
                  "field": "D02A40",
                  "value": 13805630
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
          "status": "Key: CLEAR → 350000 steps (max_steps, peak 22198px)",
          "runtimeMode": "coldboot",
          "lastPc": 661791,
          "lastMode": "adl",
          "totalSteps": 987707,
          "cpu": {
            "pc": 661773,
            "sp": 13740074,
            "af": 92,
            "bc": 16712960,
            "de": 640,
            "hl": 14010188,
            "ix": 13632940,
            "iy": 13631616,
            "f": 92,
            "halted": false,
            "madl": 1,
            "stepCount": 349999
          },
          "fields": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13739781,
            "D0243D": 13805131,
            "D02590": 13893249,
            "D02A40": 13805630,
            "D00595": 199,
            "D00596": 3,
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
              "addr": 13740074,
              "value": 16714501
            },
            {
              "addr": 13740077,
              "value": 13740128
            },
            {
              "addr": 13740080,
              "value": 656936
            },
            {
              "addr": 13740083,
              "value": 0
            },
            {
              "addr": 13740086,
              "value": 1536
            },
            {
              "addr": 13740089,
              "value": 25858
            },
            {
              "addr": 13740092,
              "value": 666627
            },
            {
              "addr": 13740095,
              "value": 0
            }
          ],
          "editLine": {
            "D007CA": 361961,
            "D008E0": 13740131,
            "D0243A": 13739781,
            "D0243D": 13805131,
            "D02590": 13893249,
            "D00595": 199,
            "D00596": 3,
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
              "nonWhite": 908
            },
            "vramCurrent": 19628,
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
              "wipes": 0,
              "D0243A": 13739781,
              "D0243D": 13805131,
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
              "vramPeak": 22198,
              "vramCurrent": 19628
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
              "D0243D": 13805131,
              "D02A40": 13805630,
              "D02A28": 0
            }
          },
          "vram": 19628,
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
            "wipes": 0,
            "D0243A": 13739781,
            "D0243D": 13805131,
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
            "vramPeak": 22198,
            "vramCurrent": 19628
          },
          "pageErrors": []
        },
        "totalBlocks": 349987,
        "prevPc": "0x0A190D",
        "lastPcs": [
          {
            "block": 349868,
            "pc": "0x0A190D",
            "prevPc": "0x0A189E"
          },
          {
            "block": 349869,
            "pc": "0x0A191F",
            "prevPc": "0x0A190D"
          },
          {
            "block": 349870,
            "pc": "0x0A1939",
            "prevPc": "0x0A191F"
          },
          {
            "block": 349871,
            "pc": "0x0A1969",
            "prevPc": "0x0A1939"
          },
          {
            "block": 349872,
            "pc": "0x0A1976",
            "prevPc": "0x0A1969"
          },
          {
            "block": 349873,
            "pc": "0x0A1980",
            "prevPc": "0x0A1976"
          },
          {
            "block": 349874,
            "pc": "0x0A19CC",
            "prevPc": "0x0A1980"
          },
          {
            "block": 349875,
            "pc": "0x0A19D7",
            "prevPc": "0x0A19CC"
          },
          {
            "block": 349876,
            "pc": "0x0A1A1D",
            "prevPc": "0x0A19D7"
          },
          {
            "block": 349877,
            "pc": "0x0A1854",
            "prevPc": "0x0A1A1D"
          },
          {
            "block": 349878,
            "pc": "0x0A187C",
            "prevPc": "0x0A1854"
          },
          {
            "block": 349879,
            "pc": "0x0A188A",
            "prevPc": "0x0A187C"
          },
          {
            "block": 349880,
            "pc": "0x0A189E",
            "prevPc": "0x0A188A"
          },
          {
            "block": 349881,
            "pc": "0x0A190D",
            "prevPc": "0x0A189E"
          },
          {
            "block": 349882,
            "pc": "0x0A191F",
            "prevPc": "0x0A190D"
          },
          {
            "block": 349883,
            "pc": "0x0A1939",
            "prevPc": "0x0A191F"
          },
          {
            "block": 349884,
            "pc": "0x0A1969",
            "prevPc": "0x0A1939"
          },
          {
            "block": 349885,
            "pc": "0x0A1976",
            "prevPc": "0x0A1969"
          },
          {
            "block": 349886,
            "pc": "0x0A1980",
            "prevPc": "0x0A1976"
          },
          {
            "block": 349887,
            "pc": "0x0A19CC",
            "prevPc": "0x0A1980"
          },
          {
            "block": 349888,
            "pc": "0x0A19D7",
            "prevPc": "0x0A19CC"
          },
          {
            "block": 349889,
            "pc": "0x0A1A1D",
            "prevPc": "0x0A19D7"
          },
          {
            "block": 349890,
            "pc": "0x0A1A30",
            "prevPc": "0x0A1A1D"
          },
          {
            "block": 349891,
            "pc": "0x0A2C03",
            "prevPc": "0x0A1A30"
          },
          {
            "block": 349892,
            "pc": "0x0A2B85",
            "prevPc": "0x0A2C03"
          },
          {
            "block": 349893,
            "pc": "0x0A2B8F",
            "prevPc": "0x0A2B85"
          },
          {
            "block": 349894,
            "pc": "0x0A2BEB",
            "prevPc": "0x0A2B8F"
          },
          {
            "block": 349895,
            "pc": "0x0A2BF6",
            "prevPc": "0x0A2BEB"
          },
          {
            "block": 349896,
            "pc": "0x0A2BF9",
            "prevPc": "0x0A2BF6"
          },
          {
            "block": 349897,
            "pc": "0x0A1799",
            "prevPc": "0x0A2BF9"
          },
          {
            "block": 349898,
            "pc": "0x0A17AF",
            "prevPc": "0x0A1799"
          },
          {
            "block": 349899,
            "pc": "0x0A17B2",
            "prevPc": "0x0A17AF"
          },
          {
            "block": 349900,
            "pc": "0x0A17B8",
            "prevPc": "0x0A17B2"
          },
          {
            "block": 349901,
            "pc": "0x07BF3E",
            "prevPc": "0x0A17B8"
          },
          {
            "block": 349902,
            "pc": "0x07BF4D",
            "prevPc": "0x07BF3E"
          },
          {
            "block": 349903,
            "pc": "0x07BF5C",
            "prevPc": "0x07BF4D"
          },
          {
            "block": 349904,
            "pc": "0x000380",
            "prevPc": "0x07BF5C"
          },
          {
            "block": 349905,
            "pc": "0x003D85",
            "prevPc": "0x000380"
          },
          {
            "block": 349906,
            "pc": "0x07BF61",
            "prevPc": "0x003D85"
          },
          {
            "block": 349907,
            "pc": "0x0A17C5",
            "prevPc": "0x07BF61"
          },
          {
            "block": 349908,
            "pc": "0x0A2D4C",
            "prevPc": "0x0A17C5"
          },
          {
            "block": 349909,
            "pc": "0x0A17D0",
            "prevPc": "0x0A2D4C"
          },
          {
            "block": 349910,
            "pc": "0x00038C",
            "prevPc": "0x0A17D0"
          },
          {
            "block": 349911,
            "pc": "0x005A53",
            "prevPc": "0x00038C"
          },
          {
            "block": 349912,
            "pc": "0x0A17E9",
            "prevPc": "0x005A53"
          },
          {
            "block": 349913,
            "pc": "0x0A17EF",
            "prevPc": "0x0A17E9"
          },
          {
            "block": 349914,
            "pc": "0x0A17F7",
            "prevPc": "0x0A17EF"
          },
          {
            "block": 349915,
            "pc": "0x0A1805",
            "prevPc": "0x0A17F7"
          },
          {
            "block": 349916,
            "pc": "0x0A1842",
            "prevPc": "0x0A1805"
          },
          {
            "block": 349917,
            "pc": "0x0A184A",
            "prevPc": "0x0A1842"
          },
          {
            "block": 349918,
            "pc": "0x0A1854",
            "prevPc": "0x0A184A"
          },
          {
            "block": 349919,
            "pc": "0x0A187C",
            "prevPc": "0x0A1854"
          },
          {
            "block": 349920,
            "pc": "0x0A188A",
            "prevPc": "0x0A187C"
          },
          {
            "block": 349921,
            "pc": "0x0A189E",
            "prevPc": "0x0A188A"
          },
          {
            "block": 349922,
            "pc": "0x0A190D",
            "prevPc": "0x0A189E"
          },
          {
            "block": 349923,
            "pc": "0x0A191F",
            "prevPc": "0x0A190D"
          },
          {
            "block": 349924,
            "pc": "0x0A1939",
            "prevPc": "0x0A191F"
          },
          {
            "block": 349925,
            "pc": "0x0A1969",
            "prevPc": "0x0A1939"
          },
          {
            "block": 349926,
            "pc": "0x0A1976",
            "prevPc": "0x0A1969"
          },
          {
            "block": 349927,
            "pc": "0x0A1980",
            "prevPc": "0x0A1976"
          },
          {
            "block": 349928,
            "pc": "0x0A19CC",
            "prevPc": "0x0A1980"
          },
          {
            "block": 349929,
            "pc": "0x0A19D7",
            "prevPc": "0x0A19CC"
          },
          {
            "block": 349930,
            "pc": "0x0A1A1D",
            "prevPc": "0x0A19D7"
          },
          {
            "block": 349931,
            "pc": "0x0A1854",
            "prevPc": "0x0A1A1D"
          },
          {
            "block": 349932,
            "pc": "0x0A187C",
            "prevPc": "0x0A1854"
          },
          {
            "block": 349933,
            "pc": "0x0A188A",
            "prevPc": "0x0A187C"
          },
          {
            "block": 349934,
            "pc": "0x0A189E",
            "prevPc": "0x0A188A"
          },
          {
            "block": 349935,
            "pc": "0x0A190D",
            "prevPc": "0x0A189E"
          },
          {
            "block": 349936,
            "pc": "0x0A191F",
            "prevPc": "0x0A190D"
          },
          {
            "block": 349937,
            "pc": "0x0A1939",
            "prevPc": "0x0A191F"
          },
          {
            "block": 349938,
            "pc": "0x0A1969",
            "prevPc": "0x0A1939"
          },
          {
            "block": 349939,
            "pc": "0x0A1976",
            "prevPc": "0x0A1969"
          },
          {
            "block": 349940,
            "pc": "0x0A1980",
            "prevPc": "0x0A1976"
          },
          {
            "block": 349941,
            "pc": "0x0A19CC",
            "prevPc": "0x0A1980"
          },
          {
            "block": 349942,
            "pc": "0x0A19D7",
            "prevPc": "0x0A19CC"
          },
          {
            "block": 349943,
            "pc": "0x0A1A1D",
            "prevPc": "0x0A19D7"
          },
          {
            "block": 349944,
            "pc": "0x0A1854",
            "prevPc": "0x0A1A1D"
          },
          {
            "block": 349945,
            "pc": "0x0A187C",
            "prevPc": "0x0A1854"
          },
          {
            "block": 349946,
            "pc": "0x0A188A",
            "prevPc": "0x0A187C"
          },
          {
            "block": 349947,
            "pc": "0x0A189E",
            "prevPc": "0x0A188A"
          },
          {
            "block": 349948,
            "pc": "0x0A190D",
            "prevPc": "0x0A189E"
          },
          {
            "block": 349949,
            "pc": "0x0A191F",
            "prevPc": "0x0A190D"
          },
          {
            "block": 349950,
            "pc": "0x0A1939",
            "prevPc": "0x0A191F"
          },
          {
            "block": 349951,
            "pc": "0x0A1969",
            "prevPc": "0x0A1939"
          },
          {
            "block": 349952,
            "pc": "0x0A1976",
            "prevPc": "0x0A1969"
          },
          {
            "block": 349953,
            "pc": "0x0A1980",
            "prevPc": "0x0A1976"
          },
          {
            "block": 349954,
            "pc": "0x0A19CC",
            "prevPc": "0x0A1980"
          },
          {
            "block": 349955,
            "pc": "0x0A19D7",
            "prevPc": "0x0A19CC"
          },
          {
            "block": 349956,
            "pc": "0x0A1A1D",
            "prevPc": "0x0A19D7"
          },
          {
            "block": 349957,
            "pc": "0x0A1854",
            "prevPc": "0x0A1A1D"
          },
          {
            "block": 349958,
            "pc": "0x0A187C",
            "prevPc": "0x0A1854"
          },
          {
            "block": 349959,
            "pc": "0x0A188A",
            "prevPc": "0x0A187C"
          },
          {
            "block": 349960,
            "pc": "0x0A189E",
            "prevPc": "0x0A188A"
          },
          {
            "block": 349961,
            "pc": "0x0A190D",
            "prevPc": "0x0A189E"
          },
          {
            "block": 349962,
            "pc": "0x0A191F",
            "prevPc": "0x0A190D"
          },
          {
            "block": 349963,
            "pc": "0x0A1939",
            "prevPc": "0x0A191F"
          },
          {
            "block": 349964,
            "pc": "0x0A1969",
            "prevPc": "0x0A1939"
          },
          {
            "block": 349965,
            "pc": "0x0A1976",
            "prevPc": "0x0A1969"
          },
          {
            "block": 349966,
            "pc": "0x0A1980",
            "prevPc": "0x0A1976"
          },
          {
            "block": 349967,
            "pc": "0x0A19CC",
            "prevPc": "0x0A1980"
          },
          {
            "block": 349968,
            "pc": "0x0A19D7",
            "prevPc": "0x0A19CC"
          },
          {
            "block": 349969,
            "pc": "0x0A1A1D",
            "prevPc": "0x0A19D7"
          },
          {
            "block": 349970,
            "pc": "0x0A1854",
            "prevPc": "0x0A1A1D"
          },
          {
            "block": 349971,
            "pc": "0x0A187C",
            "prevPc": "0x0A1854"
          },
          {
            "block": 349972,
            "pc": "0x0A188A",
            "prevPc": "0x0A187C"
          },
          {
            "block": 349973,
            "pc": "0x0A189E",
            "prevPc": "0x0A188A"
          },
          {
            "block": 349974,
            "pc": "0x0A190D",
            "prevPc": "0x0A189E"
          },
          {
            "block": 349975,
            "pc": "0x0A191F",
            "prevPc": "0x0A190D"
          },
          {
            "block": 349976,
            "pc": "0x0A1939",
            "prevPc": "0x0A191F"
          },
          {
            "block": 349977,
            "pc": "0x0A1969",
            "prevPc": "0x0A1939"
          },
          {
            "block": 349978,
            "pc": "0x0A1976",
            "prevPc": "0x0A1969"
          },
          {
            "block": 349979,
            "pc": "0x0A1980",
            "prevPc": "0x0A1976"
          },
          {
            "block": 349980,
            "pc": "0x0A19CC",
            "prevPc": "0x0A1980"
          },
          {
            "block": 349981,
            "pc": "0x0A19D7",
            "prevPc": "0x0A19CC"
          },
          {
            "block": 349982,
            "pc": "0x0A1A1D",
            "prevPc": "0x0A19D7"
          },
          {
            "block": 349983,
            "pc": "0x0A1854",
            "prevPc": "0x0A1A1D"
          },
          {
            "block": 349984,
            "pc": "0x0A187C",
            "prevPc": "0x0A1854"
          },
          {
            "block": 349985,
            "pc": "0x0A188A",
            "prevPc": "0x0A187C"
          },
          {
            "block": 349986,
            "pc": "0x0A189E",
            "prevPc": "0x0A188A"
          },
          {
            "block": 349987,
            "pc": "0x0A190D",
            "prevPc": "0x0A189E"
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
          "0x04C973": 978,
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
          "0x0A1799": 1405,
          "0x0A17AA": 5,
          "0x0A17AE": 5,
          "0x0A17B2": 1403,
          "0x0A17B8": 1403,
          "0x07BF3E": 1405,
          "0x07BF4D": 1405,
          "0x07BF5C": 1405,
          "0x000380": 1405,
          "0x003D85": 1405,
          "0x07BF61": 1405,
          "0x0A17C5": 1405,
          "0x0A2D4C": 1407,
          "0x0A17D0": 1405,
          "0x00038C": 1405,
          "0x005A53": 1405,
          "0x0A17E9": 1405,
          "0x0A17EF": 1405,
          "0x0A17F7": 1405,
          "0x0A1805": 1405,
          "0x0A180B": 5,
          "0x0A1838": 5,
          "0x0A1A8F": 5,
          "0x0A183D": 5,
          "0x0A184A": 1405,
          "0x0A1854": 22470,
          "0x0A187C": 22470,
          "0x0A188A": 22470,
          "0x0A189E": 22470,
          "0x0A18A6": 80,
          "0x0A1A83": 160,
          "0x0A18AF": 80,
          "0x0A18C1": 80,
          "0x0A18C4": 80,
          "0x0A18CA": 80,
          "0x0A18E9": 80,
          "0x0A18EB": 80,
          "0x0A190D": 22470,
          "0x0A191F": 22469,
          "0x0A1939": 22469,
          "0x0A1969": 22469,
          "0x0A1976": 22469,
          "0x0A1980": 22469,
          "0x0A1988": 80,
          "0x0A1994": 80,
          "0x0A19A4": 560,
          "0x0A19AA": 80,
          "0x0A19B5": 80,
          "0x0A19B7": 80,
          "0x0A19D7": 22469,
          "0x0A1A1D": 22469,
          "0x0A1A30": 1404,
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
          "0x05E3E8": 487,
          "0x058221": 1,
          "0x058A14": 1,
          "0x058A2C": 1,
          "0x058A30": 1,
          "0x058A4C": 1,
          "0x05E7CD": 486,
          "0x05E242": 486,
          "0x05E246": 486,
          "0x05E247": 486,
          "0x05E3EC": 486,
          "0x05E24C": 486,
          "0x05E250": 486,
          "0x080064": 486,
          "0x05E256": 486,
          "0x05E26C": 499,
          "0x05E7D1": 486,
          "0x05E7D2": 486,
          "0x0A2B72": 486,
          "0x0A2A68": 486,
          "0x0A2AF9": 473,
          "0x0A2B16": 486,
          "0x0A2B51": 486,
          "0x0A2B7E": 486,
          "0x0A2B8F": 1456,
          "0x0A2BEB": 1455,
          "0x0A2C0C": 57,
          "0x0A2C10": 57,
          "0x0A20CC": 58,
          "0x0A20E4": 58,
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
          "0x0A2C16": 57,
          "0x0A2BFD": 1,
          "0x0A17AF": 1400,
          "0x0A1842": 1400,
          "0x0A19CC": 22389,
          "0x0A2C03": 1398,
          "0x0A2C05": 428,
          "0x05E7D6": 485,
          "0x0A20F0": 57,
          "0x0A2C25": 57,
          "0x0A2C08": 57,
          "0x0A2BF6": 1398,
          "0x0A2BF9": 1398,
          "0x005A60": 170,
          "0x0A2B85": 970,
          "0x05E259": 13,
          "0x05E25E": 13,
          "0x05E266": 13,
          "0x0A2A73": 13,
          "0x0A2A7D": 13,
          "0x0A2A83": 12,
          "0x0A2AAE": 12,
          "0x0A2AB6": 10,
          "0x0A2ABC": 10,
          "0x0A2AC4": 8,
          "0x0A2ACA": 7,
          "0x0A2ACE": 6,
          "0x0A2AFD": 13,
          "0x0A2B94": 1,
          "0x0A2B9F": 1,
          "0x0A2BA3": 1,
          "0x0A2AD6": 4,
          "0x0A2AE7": 2,
          "0x0A2ADC": 2,
          "0x0A2ADF": 2,
          "0x0A2AF3": 1
        },
        "topHotBlocks": [
          {
            "pc": "0x0A1854",
            "count": 22470
          },
          {
            "pc": "0x0A187C",
            "count": 22470
          },
          {
            "pc": "0x0A188A",
            "count": 22470
          },
          {
            "pc": "0x0A189E",
            "count": 22470
          },
          {
            "pc": "0x0A190D",
            "count": 22470
          },
          {
            "pc": "0x0A191F",
            "count": 22469
          },
          {
            "pc": "0x0A1939",
            "count": 22469
          },
          {
            "pc": "0x0A1969",
            "count": 22469
          },
          {
            "pc": "0x0A1976",
            "count": 22469
          },
          {
            "pc": "0x0A1980",
            "count": 22469
          },
          {
            "pc": "0x0A19D7",
            "count": 22469
          },
          {
            "pc": "0x0A1A1D",
            "count": 22469
          },
          {
            "pc": "0x0A19CC",
            "count": 22389
          },
          {
            "pc": "0x09EFDE",
            "count": 2880
          },
          {
            "pc": "0x0A2B8F",
            "count": 1456
          },
          {
            "pc": "0x0A2BEB",
            "count": 1455
          },
          {
            "pc": "0x0A2D4C",
            "count": 1407
          },
          {
            "pc": "0x0A1799",
            "count": 1405
          },
          {
            "pc": "0x07BF3E",
            "count": 1405
          },
          {
            "pc": "0x07BF4D",
            "count": 1405
          },
          {
            "pc": "0x07BF5C",
            "count": 1405
          },
          {
            "pc": "0x000380",
            "count": 1405
          },
          {
            "pc": "0x003D85",
            "count": 1405
          },
          {
            "pc": "0x07BF61",
            "count": 1405
          },
          {
            "pc": "0x0A17C5",
            "count": 1405
          },
          {
            "pc": "0x0A17D0",
            "count": 1405
          },
          {
            "pc": "0x00038C",
            "count": 1405
          },
          {
            "pc": "0x005A53",
            "count": 1405
          },
          {
            "pc": "0x0A17E9",
            "count": 1405
          },
          {
            "pc": "0x0A17EF",
            "count": 1405
          },
          {
            "pc": "0x0A17F7",
            "count": 1405
          },
          {
            "pc": "0x0A1805",
            "count": 1405
          },
          {
            "pc": "0x0A184A",
            "count": 1405
          },
          {
            "pc": "0x0A1A30",
            "count": 1404
          },
          {
            "pc": "0x0A17B2",
            "count": 1403
          },
          {
            "pc": "0x0A17B8",
            "count": 1403
          },
          {
            "pc": "0x0A17AF",
            "count": 1400
          },
          {
            "pc": "0x0A1842",
            "count": 1400
          },
          {
            "pc": "0x0A2C03",
            "count": 1398
          },
          {
            "pc": "0x0A2BF6",
            "count": 1398
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
            "target": "zeroPrev0A31E2",
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
          {
            "target": "zeroEntry0A31A2",
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
              "D0243A": 13740279,
              "D0243D": 13805629,
              "D02590": 13893249,
              "D02A40": 13805630,
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
        ],
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
        "stopRequested": null,
        "fieldTransitions": [],
        "lastWatchFields": {
          "D0243A": 13739781,
          "D0243D": 13805131,
          "D007CA": 361961,
          "D02590": 13893249
        },
        "derivedStopReason": "max_steps_no_wipe"
      }
    }
  ]
}
```

No runtime, transpiler, browser-shell, decoder, peripheral, scheduler, or ROM artifact files were changed.


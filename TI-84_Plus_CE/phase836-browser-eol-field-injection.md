# Phase 836 Browser EOL Field Injection

Probe: `probe-phase836-browser-eol-field-injection.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase836-browser-eol-field-injection.mjs`

Serves the real disk `browser-shell.html`, boots coldboot with Preserve Display, injects candidate engine-side edit fields before dispatching browser EOL (`Escape`), and classifies the observed route without editing the shell.

## Result

- Completed cases: 4/4.
- Classifications: baseline_browser_no_injection=PRE_STOP_0A229D, D0243A_engine_cursor_only=OTHER, D0243D_D02A40_engine_descriptor=OTHER, full_engine_edit_set=OTHER
- Engine cases: none.
- Pre-stop cases: baseline_browser_no_injection.
- OTHER cases: D0243A_engine_cursor_only, D0243D_D02A40_engine_descriptor, full_engine_edit_set.

## Interpretation

- Baseline browser Escape still stops at the existing `0x0A229D` control pre-stop.
- Each engine-side edit-field injection changed the route away from that pre-stop, but none reached `0x08F54B`; all injected cases ran to `max_steps` with `wipes=3` and zeroed post-key pointers.
- The browser-side blocker is therefore not solved by directly copying the phase833 cursor/descriptor fields into the current shell state. The injection destabilizes the current direct-Escape path instead of recovering the tuple-save engine route.

## Cases

| Case | Classification | Termination | Control PC | Steps | Wipes | Post D0243A | Post D0243D | Pre D02A40 | Writes |
| --- | --- | --- | --- | ---: | ---: | --- | --- | --- | --- |
| baseline_browser_no_injection | PRE_STOP_0A229D | control_pre_stop | 0x0A229D | 7363 | 0 | 0xD1A8CC | 0xD2A83E | 0xD2A83E | - |
| D0243A_engine_cursor_only | OTHER | max_steps | 0x000000 | 350000 | 3 | 0x000000 | 0x000000 | 0xD2A83E | D0243A=0xD1A8F8 |
| D0243D_D02A40_engine_descriptor | OTHER | max_steps | 0x000000 | 350000 | 3 | 0x000000 | 0x000000 | 0xD2A7F7 | D0243D=0xD2A7E1, D02A40=0xD2A7F7 |
| full_engine_edit_set | OTHER | max_steps | 0x000000 | 350000 | 3 | 0x000000 | 0x000000 | 0xD2A7F7 | D0243A=0xD1A8F8, D0243D=0xD2A7E1, D02A40=0xD2A7F7, D00595=0x06 |

## Full JSON

```json
{
  "probe": "phase836-browser-eol-field-injection",
  "chromePath": "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "pageUrl": "http://127.0.0.1:53208/browser-shell.html",
  "pass": true,
  "allPreStop": false,
  "engineCases": [],
  "preStopCases": [
    {
      "name": "baseline_browser_no_injection",
      "label": "Baseline browser state",
      "writes": [],
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
        "status": "Coldboot complete. OS event loop is ready.",
        "pageErrors": [],
        "extra": {
          "stage": "beforeInjection"
        }
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
        "writes": []
      },
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
            "writes": []
          }
        }
      },
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
            "writes": []
          }
        }
      }
    }
  ],
  "otherCases": [
    {
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
        "status": "Coldboot complete. OS event loop is ready.",
        "pageErrors": [],
        "extra": {
          "stage": "beforeInjection"
        }
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
      }
    },
    {
      "name": "D0243D_D02A40_engine_descriptor",
      "label": "D0243D + D02A40 engine descriptor",
      "writes": [
        {
          "field": "D0243D",
          "value": 13805537
        },
        {
          "field": "D02A40",
          "value": 13805559
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
        "status": "Coldboot complete. OS event loop is ready.",
        "pageErrors": [],
        "extra": {
          "stage": "beforeInjection"
        }
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
          "D0243A": 13740236,
          "D0243D": 13805537,
          "D02590": 13893249,
          "D02A40": 13805559,
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
            "field": "D0243D",
            "value": 13805537
          },
          {
            "field": "D02A40",
            "value": 13805559
          }
        ]
      },
      "preKey": {
        "editLine": {
          "D007CA": 361961,
          "D008E0": 0,
          "D0243A": 13740236,
          "D0243D": 13805537,
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
            "D0243D": 13805537,
            "D02A40": 13805559,
            "D02A28": 0
          }
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
              "D0243A": 13740236,
              "D0243D": 13805537,
              "D02590": 13893249,
              "D02A40": 13805559,
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
                "field": "D0243D",
                "value": 13805537
              },
              {
                "field": "D02A40",
                "value": 13805559
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
            "before": 13805537,
            "after": 0
          },
          "D02A40": {
            "before": 13805559,
            "after": 0
          }
        },
        "hasTupleRestoreLog": false,
        "low006D": false,
        "missing202020": false
      },
      "state": {
        "status": "Key: CLEAR → 350000 steps (max_steps, peak 12101px)",
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
          "vramPeak": 12101,
          "vramCurrent": 3031
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
          "vramCurrent": 3031,
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
            "vramPeak": 12101,
            "vramCurrent": 3031
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
            "D0243A": 13740236,
            "D0243D": 13805537,
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
              "D0243D": 13805537,
              "D02A40": 13805559,
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
              "D0243A": 13740236,
              "D0243D": 13805537,
              "D02590": 13893249,
              "D02A40": 13805559,
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
                "field": "D0243D",
                "value": 13805537
              },
              {
                "field": "D02A40",
                "value": 13805559
              }
            ]
          }
        }
      }
    },
    {
      "name": "full_engine_edit_set",
      "label": "Full engine edit set",
      "writes": [
        {
          "field": "D0243A",
          "value": 13740280
        },
        {
          "field": "D0243D",
          "value": 13805537
        },
        {
          "field": "D02A40",
          "value": 13805559
        },
        {
          "field": "D00595",
          "value": 6
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
        "status": "Coldboot complete. OS event loop is ready.",
        "pageErrors": [],
        "extra": {
          "stage": "beforeInjection"
        }
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
          "D0243D": 13805537,
          "D02590": 13893249,
          "D02A40": 13805559,
          "D00595": 6,
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
          },
          {
            "field": "D0243D",
            "value": 13805537
          },
          {
            "field": "D02A40",
            "value": 13805559
          },
          {
            "field": "D00595",
            "value": 6
          }
        ]
      },
      "preKey": {
        "editLine": {
          "D007CA": 361961,
          "D008E0": 0,
          "D0243A": 13740280,
          "D0243D": 13805537,
          "D02590": 13893249,
          "D00595": 6,
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
            "D0243D": 13805537,
            "D02A40": 13805559,
            "D02A28": 0
          }
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
              "D0243D": 13805537,
              "D02590": 13893249,
              "D02A40": 13805559,
              "D00595": 6,
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
              },
              {
                "field": "D0243D",
                "value": 13805537
              },
              {
                "field": "D02A40",
                "value": 13805559
              },
              {
                "field": "D00595",
                "value": 6
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
            "before": 13805537,
            "after": 0
          },
          "D02A40": {
            "before": 13805559,
            "after": 0
          }
        },
        "hasTupleRestoreLog": false,
        "low006D": false,
        "missing202020": false
      },
      "state": {
        "status": "Key: CLEAR → 350000 steps (max_steps, peak 17592px)",
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
          "vramPeak": 17592,
          "vramCurrent": 3031
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
          "vramCurrent": 3031,
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
            "vramPeak": 17592,
            "vramCurrent": 3031
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
            "D0243D": 13805537,
            "D02590": 13893249,
            "D00595": 6,
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
              "D0243D": 13805537,
              "D02A40": 13805559,
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
              "D0243D": 13805537,
              "D02590": 13893249,
              "D02A40": 13805559,
              "D00595": 6,
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
              },
              {
                "field": "D0243D",
                "value": 13805537
              },
              {
                "field": "D02A40",
                "value": 13805559
              },
              {
                "field": "D00595",
                "value": 6
              }
            ]
          }
        }
      }
    }
  ],
  "results": [
    {
      "name": "baseline_browser_no_injection",
      "label": "Baseline browser state",
      "writes": [],
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
        "status": "Coldboot complete. OS event loop is ready.",
        "pageErrors": [],
        "extra": {
          "stage": "beforeInjection"
        }
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
        "writes": []
      },
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
            "writes": []
          }
        }
      },
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
            "writes": []
          }
        }
      }
    },
    {
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
        "status": "Coldboot complete. OS event loop is ready.",
        "pageErrors": [],
        "extra": {
          "stage": "beforeInjection"
        }
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
      }
    },
    {
      "name": "D0243D_D02A40_engine_descriptor",
      "label": "D0243D + D02A40 engine descriptor",
      "writes": [
        {
          "field": "D0243D",
          "value": 13805537
        },
        {
          "field": "D02A40",
          "value": 13805559
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
        "status": "Coldboot complete. OS event loop is ready.",
        "pageErrors": [],
        "extra": {
          "stage": "beforeInjection"
        }
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
          "D0243A": 13740236,
          "D0243D": 13805537,
          "D02590": 13893249,
          "D02A40": 13805559,
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
            "field": "D0243D",
            "value": 13805537
          },
          {
            "field": "D02A40",
            "value": 13805559
          }
        ]
      },
      "preKey": {
        "editLine": {
          "D007CA": 361961,
          "D008E0": 0,
          "D0243A": 13740236,
          "D0243D": 13805537,
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
            "D0243D": 13805537,
            "D02A40": 13805559,
            "D02A28": 0
          }
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
              "D0243A": 13740236,
              "D0243D": 13805537,
              "D02590": 13893249,
              "D02A40": 13805559,
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
                "field": "D0243D",
                "value": 13805537
              },
              {
                "field": "D02A40",
                "value": 13805559
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
            "before": 13805537,
            "after": 0
          },
          "D02A40": {
            "before": 13805559,
            "after": 0
          }
        },
        "hasTupleRestoreLog": false,
        "low006D": false,
        "missing202020": false
      },
      "state": {
        "status": "Key: CLEAR → 350000 steps (max_steps, peak 12101px)",
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
          "vramPeak": 12101,
          "vramCurrent": 3031
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
          "vramCurrent": 3031,
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
            "vramPeak": 12101,
            "vramCurrent": 3031
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
            "D0243A": 13740236,
            "D0243D": 13805537,
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
              "D0243D": 13805537,
              "D02A40": 13805559,
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
              "D0243A": 13740236,
              "D0243D": 13805537,
              "D02590": 13893249,
              "D02A40": 13805559,
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
                "field": "D0243D",
                "value": 13805537
              },
              {
                "field": "D02A40",
                "value": 13805559
              }
            ]
          }
        }
      }
    },
    {
      "name": "full_engine_edit_set",
      "label": "Full engine edit set",
      "writes": [
        {
          "field": "D0243A",
          "value": 13740280
        },
        {
          "field": "D0243D",
          "value": 13805537
        },
        {
          "field": "D02A40",
          "value": 13805559
        },
        {
          "field": "D00595",
          "value": 6
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
        "status": "Coldboot complete. OS event loop is ready.",
        "pageErrors": [],
        "extra": {
          "stage": "beforeInjection"
        }
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
          "D0243D": 13805537,
          "D02590": 13893249,
          "D02A40": 13805559,
          "D00595": 6,
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
          },
          {
            "field": "D0243D",
            "value": 13805537
          },
          {
            "field": "D02A40",
            "value": 13805559
          },
          {
            "field": "D00595",
            "value": 6
          }
        ]
      },
      "preKey": {
        "editLine": {
          "D007CA": 361961,
          "D008E0": 0,
          "D0243A": 13740280,
          "D0243D": 13805537,
          "D02590": 13893249,
          "D00595": 6,
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
            "D0243D": 13805537,
            "D02A40": 13805559,
            "D02A28": 0
          }
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
              "D0243D": 13805537,
              "D02590": 13893249,
              "D02A40": 13805559,
              "D00595": 6,
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
              },
              {
                "field": "D0243D",
                "value": 13805537
              },
              {
                "field": "D02A40",
                "value": 13805559
              },
              {
                "field": "D00595",
                "value": 6
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
            "before": 13805537,
            "after": 0
          },
          "D02A40": {
            "before": 13805559,
            "after": 0
          }
        },
        "hasTupleRestoreLog": false,
        "low006D": false,
        "missing202020": false
      },
      "state": {
        "status": "Key: CLEAR → 350000 steps (max_steps, peak 17592px)",
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
          "vramPeak": 17592,
          "vramCurrent": 3031
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
          "vramCurrent": 3031,
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
            "vramPeak": 17592,
            "vramCurrent": 3031
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
            "D0243D": 13805537,
            "D02590": 13893249,
            "D00595": 6,
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
              "D0243D": 13805537,
              "D02A40": 13805559,
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
              "D0243D": 13805537,
              "D02590": 13893249,
              "D02A40": 13805559,
              "D00595": 6,
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
              },
              {
                "field": "D0243D",
                "value": 13805537
              },
              {
                "field": "D02A40",
                "value": 13805559
              },
              {
                "field": "D00595",
                "value": 6
              }
            ]
          }
        }
      }
    }
  ]
}
```

No runtime, transpiler, browser-shell, decoder, peripheral, or ROM artifact files were changed.


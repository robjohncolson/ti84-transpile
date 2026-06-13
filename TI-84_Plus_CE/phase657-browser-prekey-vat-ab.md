# Phase 657: Browser Pre-Key VAT Replay / No-AutoRun A/B

Probe: `probe-phase657-browser-prekey-vat-ab.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase657-browser-prekey-vat-ab.mjs`  
Exit: 0

## Summary

- PASS: no-autorun-escape (autoRun=false, replayBeforeEachKey=false) Phase 6 halt at 0x0019B5, 0x084711 hits=34.
  - Escape/CLEAR: VAT live at seeded route; path=low-transfer path; token/tail hits=0; low-path hits=60889; cleanup hits=3; cxMain hits=1.
- PASS: no-autorun-digit2 (autoRun=false, replayBeforeEachKey=false) Phase 6 halt at 0x0019B5, 0x084711 hits=34.
  - Digit2: VAT live at seeded route; path=low-transfer path; token/tail hits=0; low-path hits=60889; cleanup hits=3; cxMain hits=2.
- PASS: autorun-prekey-replay-burst (autoRun=true, replayBeforeEachKey=true) Phase 6 halt at 0x0019B5, 0x084711 hits=34.
  - Escape/CLEAR: VAT live at seeded route; path=low-transfer path; token/tail hits=0; low-path hits=60889; cleanup hits=3; cxMain hits=1.
  - Digit2: VAT live at seeded route; path=low-transfer path; token/tail hits=0; low-path hits=60889; cleanup hits=3; cxMain hits=2.
- PASS: All page error collectors saw no browser exceptions.

## Interpretation

Both no-AutoRun fresh-key routes and the AutoRun-plus-pre-key-replay burst started with live VAT but still routed to the low-transfer/status path. Live VAT alone is therefore not sufficient to enter the token/tail engine in the browser flow.

## Key Records

```json
{
  "scenarios": [
    {
      "label": "no-autorun-escape",
      "autoRun": false,
      "replayBeforeEachKey": false,
      "replayOk": true,
      "p6": {
        "steps": 49474,
        "termination": "halt",
        "lastPc": 6581,
        "lastMode": "adl"
      },
      "p6VatLoopHits": 34,
      "afterColdboot": {
        "status": "Coldboot complete. OS event loop is ready.",
        "vramPixels": 8549,
        "replayFields": {
          "D007CA": "0x0585E9",
          "D008E0": "0x000000",
          "D02587": "0xD3A854",
          "D0258A": "0xD3A854",
          "D0258D": "0xD3A854",
          "D02590": "0xD3FE81",
          "D02593": "0xD3FE81",
          "D0259A": "0xD3FE81",
          "D0259D": "0xD3FECD",
          "D025A0": "0xD3A816",
          "D025C5": "0x0C0000"
        },
        "routeFields": {
          "D00587": 0,
          "D0058C": 0,
          "D0058D": 0,
          "D0058E": 0,
          "D00080": 0,
          "D0009F": 0,
          "D007CA": 361961,
          "D008E0": 0,
          "D02A28": 0,
          "D001B8": 0,
          "D001D3": 0,
          "D02A29": 0,
          "D02A2B": 0,
          "D02A1B": 0,
          "D0059A": 0,
          "D01150": 0,
          "D0243D": 13805589,
          "D02A40": 0,
          "VAT_D02590": 13893249,
          "VAT_D0259D": 13893325
        }
      },
      "afterAutoRun": null,
      "errors": [],
      "keys": [
        {
          "label": "Escape/CLEAR",
          "expected": 15,
          "seeded": true,
          "vatLive": true,
          "answered": true,
          "path": "low-transfer path",
          "preReplayOk": null,
          "summary": {
            "label": "no-autorun-escape:Escape/CLEAR",
            "totalBlocks": 349973,
            "tokenHookHits": 0,
            "lowPathHits": 60889,
            "cleanupHits": 3,
            "getCscHits": 2,
            "cxMainHits": 1,
            "keyHandlerHits": 1,
            "loopHits": 2,
            "haltHits": 1,
            "counts": {
              "launch09dd62": 0,
              "memInit09dee0": 0,
              "clear001879": 3,
              "cleanup0018f8": 3,
              "repaint058241": 0,
              "vatLoop084711": 0,
              "vatRewind082be2": 0,
              "halt0019b5": 1,
              "getCsc03fa09": 2,
              "loop08c331": 2,
              "cxMain0585e9": 1,
              "keyHandler05877a": 1,
              "outer08f3b8": 0,
              "tokenReader090883": 0,
              "tokenExit08f5e1": 0,
              "tokenGate090992": 0,
              "tokenStore09098e": 0,
              "eolTuple08f54b": 0,
              "displaySeed013d11": 2,
              "displayLoop0059c6": 389,
              "lowBranch0013fc": 2,
              "low006d38": 20160,
              "low006d4f": 20160,
              "low006d5d": 20176
            },
            "regionCounts": {
              "token08f000_090fff": 0,
              "display090000_091fff": 0,
              "low006d00_006dff": 100864,
              "cleanupLow001000_001fff": 4719,
              "home058000_058fff": 27
            },
            "startFields": {
              "D00587": 0,
              "D0058C": 0,
              "D0058D": 0,
              "D0058E": 0,
              "D00080": 0,
              "D0009F": 0,
              "D007CA": 361961,
              "D008E0": 0,
              "D02A28": 0,
              "D001B8": 0,
              "D001D3": 0,
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805589,
              "D02A40": 0,
              "VAT_D02590": 13893249,
              "VAT_D0259D": 13893325
            },
            "endFields": {
              "D00587": 0,
              "D0058C": 0,
              "D0058D": 0,
              "D0058E": 0,
              "D00080": 0,
              "D0009F": 0,
              "D007CA": 0,
              "D008E0": 0,
              "D02A28": 0,
              "D001B8": 0,
              "D001D3": 0,
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 0,
              "D02A40": 0,
              "VAT_D02590": 0,
              "VAT_D0259D": 0
            },
            "status": "Key: CLEAR → 350000 steps (peak 11493px)",
            "firstBlocks": [
              "0x08C331",
              "0x05C634",
              "0x000038",
              "0x0006F3",
              "0x000704",
              "0x000710",
              "0x001713",
              "0x0008BB",
              "0x001717",
              "0x001718",
              "0x00171E",
              "0x0067F8",
              "0x001C4F",
              "0x001CA6",
              "0x001CC0",
              "0x001CCA",
              "0x001CCE",
              "0x001CD5"
            ],
            "lastBlocks": [
              "0x000B72",
              "0x000B7C",
              "0x000B81",
              "0x000B72",
              "0x000B7C",
              "0x000B81",
              "0x000B72",
              "0x000B7C",
              "0x000B81",
              "0x000B72",
              "0x000B7C",
              "0x000B81",
              "0x000B72",
              "0x000B7C",
              "0x000B81",
              "0x000B72",
              "0x000B7C",
              "0x000B81"
            ],
            "hotBlocks": [
              {
                "pc": "0x000A92",
                "count": 48768
              },
              {
                "pc": "0x000BFE",
                "count": 41910
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
              }
            ],
            "targetSamples": [
              {
                "block": 1,
                "pc": "0x08C331",
                "target": "loop08c331",
                "before": {
                  "D00587": 0,
                  "D0058C": 15,
                  "D0058D": 15,
                  "D0058E": 15,
                  "D00080": 8,
                  "D0009F": 32,
                  "D007CA": 361961,
                  "D008E0": 13740131,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 13805589,
                  "D02A40": 0,
                  "VAT_D02590": 13893249,
                  "VAT_D0259D": 13893325
                },
                "runtime": {
                  "lastPc": 574257,
                  "lastMode": "adl",
                  "totalSteps": 637707
                }
              },
              {
                "block": 1933,
                "pc": "0x0585E9",
                "target": "cxMain0585e9",
                "before": {
                  "D00587": 0,
                  "D0058C": 15,
                  "D0058D": 15,
                  "D0058E": 15,
                  "D00080": 8,
                  "D0009F": 0,
                  "D007CA": 361961,
                  "D008E0": 13740131,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 13805589,
                  "D02A40": 0,
                  "VAT_D02590": 13893249,
                  "VAT_D0259D": 13893325
                },
                "runtime": {
                  "lastPc": 574257,
                  "lastMode": "adl",
                  "totalSteps": 637707
                }
              },
              {
                "block": 1937,
                "pc": "0x05877A",
                "target": "keyHandler05877a",
                "before": {
                  "D00587": 0,
                  "D0058C": 15,
                  "D0058D": 15,
                  "D0058E": 15,
                  "D00080": 8,
                  "D0009F": 0,
                  "D007CA": 361961,
                  "D008E0": 13740131,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 13805589,
                  "D02A40": 0,
                  "VAT_D02590": 13893249,
                  "VAT_D0259D": 13893325
                },
                "runtime": {
                  "lastPc": 574257,
                  "lastMode": "adl",
                  "totalSteps": 637707
                }
              },
              {
                "block": 32348,
                "pc": "0x03FA09",
                "target": "getCsc03fa09",
                "before": {
                  "D00587": 0,
                  "D0058C": 0,
                  "D0058D": 15,
                  "D0058E": 0,
                  "D00080": 8,
                  "D0009F": 0,
                  "D007CA": 0,
                  "D008E0": 0,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 13805630,
                  "D02A40": 0,
                  "VAT_D02590": 13893249,
                  "VAT_D0259D": 13893325
                },
                "runtime": {
                  "lastPc": 574257,
                  "lastMode": "adl",
                  "totalSteps": 637707
                }
              },
              {
                "block": 34288,
                "pc": "0x001879",
                "target": "clear001879",
                "before": {
                  "D00587": 0,
                  "D0058C": 0,
                  "D0058D": 15,
                  "D0058E": 0,
                  "D00080": 0,
                  "D0009F": 0,
                  "D007CA": 0,
                  "D008E0": 0,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 13805630,
                  "D02A40": 0,
                  "VAT_D02590": 13893249,
                  "VAT_D0259D": 13893325
                },
                "runtime": {
                  "lastPc": 574257,
                  "lastMode": "adl",
                  "totalSteps": 637707
                }
              },
              {
                "block": 34289,
                "pc": "0x0018F8",
                "target": "cleanup0018f8",
                "before": {
                  "D00587": 0,
                  "D0058C": 0,
                  "D0058D": 0,
                  "D0058E": 0,
                  "D00080": 0,
                  "D0009F": 0,
                  "D007CA": 0,
                  "D008E0": 0,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 0,
                  "D02A40": 0,
                  "VAT_D02590": 0,
                  "VAT_D0259D": 0
                },
                "runtime": {
                  "lastPc": 574257,
                  "lastMode": "adl",
                  "totalSteps": 637707
                }
              },
              {
                "block": 35937,
                "pc": "0x0013FC",
                "target": "lowBranch0013fc",
                "before": {
                  "D00587": 0,
                  "D0058C": 0,
                  "D0058D": 0,
                  "D0058E": 0,
                  "D00080": 0,
                  "D0009F": 0,
                  "D007CA": 0,
                  "D008E0": 0,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 0,
                  "D02A40": 0,
                  "VAT_D02590": 0,
                  "VAT_D0259D": 0
                },
                "runtime": {
                  "lastPc": 574257,
                  "lastMode": "adl",
                  "totalSteps": 637707
                }
              },
              {
                "block": 35953,
                "pc": "0x013D11",
                "target": "displaySeed013d11",
                "before": {
                  "D00587": 0,
                  "D0058C": 0,
                  "D0058D": 0,
                  "D0058E": 0,
                  "D00080": 0,
                  "D0009F": 0,
                  "D007CA": 0,
                  "D008E0": 0,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 0,
                  "D02A40": 0,
                  "VAT_D02590": 0,
                  "VAT_D0259D": 0
                },
                "runtime": {
                  "lastPc": 574257,
                  "lastMode": "adl",
                  "totalSteps": 637707
                }
              },
              {
                "block": 35954,
                "pc": "0x0059C6",
                "target": "displayLoop0059c6",
                "before": {
                  "D00587": 0,
                  "D0058C": 0,
                  "D0058D": 0,
                  "D0058E": 0,
                  "D00080": 0,
                  "D0009F": 0,
                  "D007CA": 0,
                  "D008E0": 0,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 0,
                  "D02A40": 0,
                  "VAT_D02590": 0,
                  "VAT_D0259D": 0
                },
                "runtime": {
                  "lastPc": 574257,
                  "lastMode": "adl",
                  "totalSteps": 637707
                }
              },
              {
                "block": 36040,
                "pc": "0x0059C6",
                "target": "displayLoop0059c6",
                "before": {
                  "D00587": 0,
                  "D0058C": 0,
                  "D0058D": 0,
                  "D0058E": 0,
                  "D00080": 0,
                  "D0009F": 0,
                  "D007CA": 0,
                  "D008E0": 0,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 0,
                  "D02A40": 0,
                  "VAT_D02590": 0,
                  "VAT_D0259D": 0
                },
                "runtime": {
                  "lastPc": 574257,
                  "lastMode": "adl",
                  "totalSteps": 637707
                }
              },
              {
                "block": 36126,
                "pc": "0x0059C6",
                "target": "displayLoop0059c6",
                "before": {
                  "D00587": 0,
                  "D0058C": 0,
                  "D0058D": 0,
                  "D0058E": 0,
                  "D00080": 0,
                  "D0009F": 0,
                  "D007CA": 0,
                  "D008E0": 0,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 0,
                  "D02A40": 0,
                  "VAT_D02590": 0,
                  "VAT_D0259D": 0
                },
                "runtime": {
                  "lastPc": 574257,
                  "lastMode": "adl",
                  "totalSteps": 637707
                }
              },
              {
                "block": 36212,
                "pc": "0x0059C6",
                "target": "displayLoop0059c6",
                "before": {
                  "D00587": 0,
                  "D0058C": 0,
                  "D0058D": 0,
                  "D0058E": 0,
                  "D00080": 0,
                  "D0009F": 0,
                  "D007CA": 0,
                  "D008E0": 0,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 0,
                  "D02A40": 0,
                  "VAT_D02590": 0,
                  "VAT_D0259D": 0
                },
                "runtime": {
                  "lastPc": 574257,
                  "lastMode": "adl",
                  "totalSteps": 637707
                }
              },
              {
                "block": 43596,
                "pc": "0x006D5D",
                "target": "low006d5d",
                "before": {
                  "D00587": 0,
                  "D0058C": 0,
                  "D0058D": 0,
                  "D0058E": 0,
                  "D00080": 0,
                  "D0009F": 0,
                  "D007CA": 0,
                  "D008E0": 0,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 0,
                  "D02A40": 0,
                  "VAT_D02590": 0,
                  "VAT_D0259D": 0
                },
                "runtime": {
                  "lastPc": 574257,
                  "lastMode": "adl",
                  "totalSteps": 637707
                }
              },
              {
                "block": 43602,
                "pc": "0x006D38",
                "target": "low006d38",
                "before": {
                  "D00587": 0,
                  "D0058C": 0,
                  "D0058D": 0,
                  "D0058E": 0,
                  "D00080": 0,
                  "D0009F": 0,
                  "D007CA": 0,
                  "D008E0": 0,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 0,
                  "D02A40": 0,
                  "VAT_D02590": 0,
                  "VAT_D0259D": 0
                },
                "runtime": {
                  "lastPc": 574257,
                  "lastMode": "adl",
                  "totalSteps": 637707
                }
              },
              {
                "block": 43603,
                "pc": "0x006D4F",
                "target": "low006d4f",
                "before": {
                  "D00587": 0,
                  "D0058C": 0,
                  "D0058D": 0,
                  "D0058E": 0,
                  "D00080": 0,
                  "D0009F": 0,
                  "D007CA": 0,
                  "D008E0": 0,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 0,
                  "D02A40": 0,
                  "VAT_D02590": 0,
                  "VAT_D0259D": 0
                },
                "runtime": {
                  "lastPc": 574257,
                  "lastMode": "adl",
                  "totalSteps": 637707
                }
              },
              {
                "block": 43604,
                "pc": "0x006D5D",
                "target": "low006d5d",
                "before": {
                  "D00587": 0,
                  "D0058C": 0,
                  "D0058D": 0,
                  "D0058E": 0,
                  "D00080": 0,
                  "D0009F": 0,
                  "D007CA": 0,
                  "D008E0": 0,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 0,
                  "D02A40": 0,
                  "VAT_D02590": 0,
                  "VAT_D0259D": 0
                },
                "runtime": {
                  "lastPc": 574257,
                  "lastMode": "adl",
                  "totalSteps": 637707
                }
              },
              {
                "block": 43610,
                "pc": "0x006D38",
                "target": "low006d38",
                "before": {
                  "D00587": 0,
                  "D0058C": 0,
                  "D0058D": 0,
                  "D0058E": 0,
                  "D00080": 0,
                  "D0009F": 0,
                  "D007CA": 0,
                  "D008E0": 0,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 0,
                  "D02A40": 0,
                  "VAT_D02590": 0,
                  "VAT_D0259D": 0
                },
                "runtime": {
                  "lastPc": 574257,
                  "lastMode": "adl",
                  "totalSteps": 637707
                }
              },
              {
                "block": 43611,
                "pc": "0x006D4F",
                "target": "low006d4f",
                "before": {
                  "D00587": 0,
                  "D0058C": 0,
                  "D0058D": 0,
                  "D0058E": 0,
                  "D00080": 0,
                  "D0009F": 0,
                  "D007CA": 0,
                  "D008E0": 0,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 0,
                  "D02A40": 0,
                  "VAT_D02590": 0,
                  "VAT_D0259D": 0
                },
                "runtime": {
                  "lastPc": 574257,
                  "lastMode": "adl",
                  "totalSteps": 637707
                }
              }
            ],
            "fieldTransitions": [
              {
                "block": 1,
                "pc": "0x08C331",
                "diff": {
                  "D0058C": [
                    0,
                    15
                  ],
                  "D0058D": [
                    0,
                    15
                  ],
                  "D0058E": [
                    0,
                    15
                  ],
                  "D00080": [
                    0,
                    8
                  ],
                  "D0009F": [
                    0,
                    32
                  ],
                  "D008E0": [
                    0,
                    13740131
                  ]
                },
                "beforeHook": {
                  "D00587": 0,
                  "D0058C": 15,
                  "D0058D": 15,
                  "D0058E": 15,
                  "D00080": 8,
                  "D0009F": 32,
                  "D007CA": 361961,
                  "D008E0": 13740131,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 13805589,
                  "D02A40": 0,
                  "VAT_D02590": 13893249,
                  "VAT_D0259D": 13893325
                },
                "afterHook": {
                  "D00587": 0,
                  "D0058C": 15,
                  "D0058D": 15,
                  "D0058E": 15,
                  "D00080": 8,
                  "D0009F": 32,
                  "D007CA": 361961,
                  "D008E0": 13740131,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 13805589,
                  "D02A40": 0,
                  "VAT_D02590": 13893249,
                  "VAT_D0259D": 13893325
                }
              },
              {
                "block": 944,
                "pc": "0x08C366",
                "diff": {
                  "D0009F": [
                    32,
                    0
                  ]
                },
                "beforeHook": {
                  "D00587": 0,
                  "D0058C": 15,
                  "D0058D": 15,
                  "D0058E": 15,
                  "D00080": 8,
                  "D0009F": 0,
                  "D007CA": 361961,
                  "D008E0": 13740131,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 13805589,
                  "D02A40": 0,
                  "VAT_D02590": 13893249,
                  "VAT_D0259D": 13893325
                },
                "afterHook": {
                  "D00587": 0,
                  "D0058C": 15,
                  "D0058D": 15,
                  "D0058E": 15,
                  "D00080": 8,
                  "D0009F": 0,
                  "D007CA": 361961,
                  "D008E0": 13740131,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 13805589,
                  "D02A40": 0,
                  "VAT_D02590": 13893249,
                  "VAT_D0259D": 13893325
                }
              },
              {
                "block": 1985,
                "pc": "0x05E2B8",
                "diff": {
                  "D0243D": [
                    13805589,
                    13805590
                  ]
                },
                "beforeHook": {
                  "D00587": 0,
                  "D0058C": 15,
                  "D0058D": 15,
                  "D0058E": 15,
                  "D00080": 8,
                  "D0009F": 0,
                  "D007CA": 361961,
                  "D008E0": 13740131,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 13805590,
                  "D02A40": 0,
                  "VAT_D02590": 13893249,
                  "VAT_D0259D": 13893325
                },
                "afterHook": {
                  "D00587": 0,
                  "D0058C": 15,
                  "D0058D": 15,
                  "D0058E": 15,
                  "D00080": 8,
                  "D0009F": 0,
                  "D007CA": 361961,
                  "D008E0": 13740131,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 13805590,
                  "D02A40": 0,
                  "VAT_D02590": 13893249,
                  "VAT_D0259D": 13893325
                }
              },
              {
                "block": 2583,
                "pc": "0x05E2B8",
                "diff": {
                  "D0243D": [
                    13805590,
                    13805591
                  ]
                },
                "beforeHook": {
                  "D00587": 0,
                  "D0058C": 15,
                  "D0058D": 15,
                  "D0058E": 15,
                  "D00080": 8,
                  "D0009F": 0,
                  "D007CA": 361961,
                  "D008E0": 13740131,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 13805591,
                  "D02A40": 0,
                  "VAT_D02590": 13893249,
                  "VAT_D0259D": 13893325
                },
                "afterHook": {
                  "D00587": 0,
                  "D0058C": 15,
                  "D0058D": 15,
                  "D0058E": 15,
                  "D00080": 8,
                  "D0009F": 0,
                  "D007CA": 361961,
                  "D008E0": 13740131,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 13805591,
                  "D02A40": 0,
                  "VAT_D02590": 13893249,
                  "VAT_D0259D": 13893325
                }
              },
              {
                "block": 3197,
                "pc": "0x05E2B8",
                "diff": {
                  "D0243D": [
                    13805591,
                    13805592
                  ]
                },
                "beforeHook": {
                  "D00587": 0,
                  "D0058C": 15,
                  "D0058D": 15,
                  "D0058E": 15,
                  "D00080": 8,
                  "D0009F": 0,
                  "D007CA": 361961,
                  "D008E0": 13740131,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 13805592,
                  "D02A40": 0,
                  "VAT_D02590": 13893249,
                  "VAT_D0259D": 13893325
                },
                "afterHook": {
                  "D00587": 0,
                  "D0058C": 15,
                  "D0058D": 15,
                  "D0058E": 15,
                  "D00080": 8,
                  "D0009F": 0,
                  "D007CA": 361961,
                  "D008E0": 13740131,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 13805592,
                  "D02A40": 0,
                  "VAT_D02590": 13893249,
                  "VAT_D0259D": 13893325
                }
              },
              {
                "block": 3795,
                "pc": "0x05E2B8",
                "diff": {
                  "D0243D": [
                    13805592,
                    13805593
                  ]
                },
                "beforeHook": {
                  "D00587": 0,
                  "D0058C": 15,
                  "D0058D": 15,
                  "D0058E": 15,
                  "D00080": 8,
                  "D0009F": 0,
                  "D007CA": 361961,
                  "D008E0": 13740131,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 13805593,
                  "D02A40": 0,
                  "VAT_D02590": 13893249,
                  "VAT_D0259D": 13893325
                },
                "afterHook": {
                  "D00587": 0,
                  "D0058C": 15,
                  "D0058D": 15,
                  "D0058E": 15,
                  "D00080": 8,
                  "D0009F": 0,
                  "D007CA": 361961,
                  "D008E0": 13740131,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 13805593,
                  "D02A40": 0,
                  "VAT_D02590": 13893249,
                  "VAT_D0259D": 13893325
                }
              },
              {
                "block": 4409,
                "pc": "0x05E2B8",
                "diff": {
                  "D0243D": [
                    13805593,
                    13805594
                  ]
                },
                "beforeHook": {
                  "D00587": 0,
                  "D0058C": 15,
                  "D0058D": 15,
                  "D0058E": 15,
                  "D00080": 8,
                  "D0009F": 0,
                  "D007CA": 361961,
                  "D008E0": 13740131,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 13805594,
                  "D02A40": 0,
                  "VAT_D02590": 13893249,
                  "VAT_D0259D": 13893325
                },
                "afterHook": {
                  "D00587": 0,
                  "D0058C": 15,
                  "D0058D": 15,
                  "D0058E": 15,
                  "D00080": 8,
                  "D0009F": 0,
                  "D007CA": 361961,
                  "D008E0": 13740131,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 13805594,
                  "D02A40": 0,
                  "VAT_D02590": 13893249,
                  "VAT_D0259D": 13893325
                }
              },
              {
                "block": 5007,
                "pc": "0x05E2B8",
                "diff": {
                  "D0243D": [
                    13805594,
                    13805595
                  ]
                },
                "beforeHook": {
                  "D00587": 0,
                  "D0058C": 15,
                  "D0058D": 15,
                  "D0058E": 15,
                  "D00080": 8,
                  "D0009F": 0,
                  "D007CA": 361961,
                  "D008E0": 13740131,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 13805595,
                  "D02A40": 0,
                  "VAT_D02590": 13893249,
                  "VAT_D0259D": 13893325
                },
                "afterHook": {
                  "D00587": 0,
                  "D0058C": 15,
                  "D0058D": 15,
                  "D0058E": 15,
                  "D00080": 8,
                  "D0009F": 0,
                  "D007CA": 361961,
                  "D008E0": 13740131,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 13805595,
                  "D02A40": 0,
                  "VAT_D02590": 13893249,
                  "VAT_D0259D": 13893325
                }
              },
              {
                "block": 5621,
                "pc": "0x05E2B8",
                "diff": {
                  "D0243D": [
                    13805595,
                    13805596
                  ]
                },
                "beforeHook": {
                  "D00587": 0,
                  "D0058C": 15,
                  "D0058D": 15,
                  "D0058E": 15,
                  "D00080": 8,
                  "D0009F": 0,
                  "D007CA": 361961,
                  "D008E0": 13740131,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 13805596,
                  "D02A40": 0,
                  "VAT_D02590": 13893249,
                  "VAT_D0259D": 13893325
                },
                "afterHook": {
                  "D00587": 0,
                  "D0058C": 15,
                  "D0058D": 15,
                  "D0058E": 15,
                  "D00080": 8,
                  "D0009F": 0,
                  "D007CA": 361961,
                  "D008E0": 13740131,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 13805596,
                  "D02A40": 0,
                  "VAT_D02590": 13893249,
                  "VAT_D0259D": 13893325
                }
              },
              {
                "block": 6219,
                "pc": "0x05E2B8",
                "diff": {
                  "D0243D": [
                    13805596,
                    13805597
                  ]
                },
                "beforeHook": {
                  "D00587": 0,
                  "D0058C": 15,
                  "D0058D": 15,
                  "D0058E": 15,
                  "D00080": 8,
                  "D0009F": 0,
                  "D007CA": 361961,
                  "D008E0": 13740131,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 13805597,
                  "D02A40": 0,
                  "VAT_D02590": 13893249,
                  "VAT_D0259D": 13893325
                },
                "afterHook": {
                  "D00587": 0,
                  "D0058C": 15,
                  "D0058D": 15,
                  "D0058E": 15,
                  "D00080": 8,
                  "D0009F": 0,
                  "D007CA": 361961,
                  "D008E0": 13740131,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 13805597,
                  "D02A40": 0,
                  "VAT_D02590": 13893249,
                  "VAT_D0259D": 13893325
                }
              },
              {
                "block": 6833,
                "pc": "0x05E2B8",
                "diff": {
                  "D0243D": [
                    13805597,
                    13805598
                  ]
                },
                "beforeHook": {
                  "D00587": 0,
                  "D0058C": 15,
                  "D0058D": 15,
                  "D0058E": 15,
                  "D00080": 8,
                  "D0009F": 0,
                  "D007CA": 361961,
                  "D008E0": 13740131,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 13805598,
                  "D02A40": 0,
                  "VAT_D02590": 13893249,
                  "VAT_D0259D": 13893325
                },
                "afterHook": {
                  "D00587": 0,
                  "D0058C": 15,
                  "D0058D": 15,
                  "D0058E": 15,
                  "D00080": 8,
                  "D0009F": 0,
                  "D007CA": 361961,
                  "D008E0": 13740131,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 13805598,
                  "D02A40": 0,
                  "VAT_D02590": 13893249,
                  "VAT_D0259D": 13893325
                }
              },
              {
                "block": 7431,
                "pc": "0x05E2B8",
                "diff": {
                  "D0243D": [
                    13805598,
                    13805599
                  ]
                },
                "beforeHook": {
                  "D00587": 0,
                  "D0058C": 15,
                  "D0058D": 15,
                  "D0058E": 15,
                  "D00080": 8,
                  "D0009F": 0,
                  "D007CA": 361961,
                  "D008E0": 13740131,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 13805599,
                  "D02A40": 0,
                  "VAT_D02590": 13893249,
                  "VAT_D0259D": 13893325
                },
                "afterHook": {
                  "D00587": 0,
                  "D0058C": 15,
                  "D0058D": 15,
                  "D0058E": 15,
                  "D00080": 8,
                  "D0009F": 0,
                  "D007CA": 361961,
                  "D008E0": 13740131,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 13805599,
                  "D02A40": 0,
                  "VAT_D02590": 13893249,
                  "VAT_D0259D": 13893325
                }
              },
              {
                "block": 8045,
                "pc": "0x05E2B8",
                "diff": {
                  "D0243D": [
                    13805599,
                    13805600
                  ]
                },
                "beforeHook": {
                  "D00587": 0,
                  "D0058C": 15,
                  "D0058D": 15,
                  "D0058E": 15,
                  "D00080": 8,
                  "D0009F": 0,
                  "D007CA": 361961,
                  "D008E0": 13740131,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 13805600,
                  "D02A40": 0,
                  "VAT_D02590": 13893249,
                  "VAT_D0259D": 13893325
                },
                "afterHook": {
                  "D00587": 0,
                  "D0058C": 15,
                  "D0058D": 15,
                  "D0058E": 15,
                  "D00080": 8,
                  "D0009F": 0,
                  "D007CA": 361961,
                  "D008E0": 13740131,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 13805600,
                  "D02A40": 0,
                  "VAT_D02590": 13893249,
                  "VAT_D0259D": 13893325
                }
              },
              {
                "block": 8643,
                "pc": "0x05E2B8",
                "diff": {
                  "D0243D": [
                    13805600,
                    13805601
                  ]
                },
                "beforeHook": {
                  "D00587": 0,
                  "D0058C": 15,
                  "D0058D": 15,
                  "D0058E": 15,
                  "D00080": 8,
                  "D0009F": 0,
                  "D007CA": 361961,
                  "D008E0": 13740131,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 13805601,
                  "D02A40": 0,
                  "VAT_D02590": 13893249,
                  "VAT_D0259D": 13893325
                },
                "afterHook": {
                  "D00587": 0,
                  "D0058C": 15,
                  "D0058D": 15,
                  "D0058E": 15,
                  "D00080": 8,
                  "D0009F": 0,
                  "D007CA": 361961,
                  "D008E0": 13740131,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 13805601,
                  "D02A40": 0,
                  "VAT_D02590": 13893249,
                  "VAT_D0259D": 13893325
                }
              },
              {
                "block": 9257,
                "pc": "0x05E2B8",
                "diff": {
                  "D0243D": [
                    13805601,
                    13805602
                  ]
                },
                "beforeHook": {
                  "D00587": 0,
                  "D0058C": 15,
                  "D0058D": 15,
                  "D0058E": 15,
                  "D00080": 8,
                  "D0009F": 0,
                  "D007CA": 361961,
                  "D008E0": 13740131,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 13805602,
                  "D02A40": 0,
                  "VAT_D02590": 13893249,
                  "VAT_D0259D": 13893325
                },
                "afterHook": {
                  "D00587": 0,
                  "D0058C": 15,
                  "D0058D": 15,
                  "D0058E": 15,
                  "D00080": 8,
                  "D0009F": 0,
                  "D007CA": 361961,
                  "D008E0": 13740131,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 13805602,
                  "D02A40": 0,
                  "VAT_D02590": 13893249,
                  "VAT_D0259D": 13893325
                }
              },
              {
                "block": 9855,
                "pc": "0x05E2B8",
                "diff": {
                  "D0243D": [
                    13805602,
                    13805603
                  ]
                },
                "beforeHook": {
                  "D00587": 0,
                  "D0058C": 15,
                  "D0058D": 15,
                  "D0058E": 15,
                  "D00080": 8,
                  "D0009F": 0,
                  "D007CA": 361961,
                  "D008E0": 13740131,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 13805603,
                  "D02A40": 0,
                  "VAT_D02590": 13893249,
                  "VAT_D0259D": 13893325
                },
                "afterHook": {
                  "D00587": 0,
                  "D0058C": 15,
                  "D0058D": 15,
                  "D0058E": 15,
                  "D00080": 8,
                  "D0009F": 0,
                  "D007CA": 361961,
                  "D008E0": 13740131,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 13805603,
                  "D02A40": 0,
                  "VAT_D02590": 13893249,
                  "VAT_D0259D": 13893325
                }
              },
              {
                "block": 10469,
                "pc": "0x05E2B8",
                "diff": {
                  "D0243D": [
                    13805603,
                    13805604
                  ]
                },
                "beforeHook": {
                  "D00587": 0,
                  "D0058C": 15,
                  "D0058D": 15,
                  "D0058E": 15,
                  "D00080": 8,
                  "D0009F": 0,
                  "D007CA": 361961,
                  "D008E0": 13740131,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 13805604,
                  "D02A40": 0,
                  "VAT_D02590": 13893249,
                  "VAT_D0259D": 13893325
                },
                "afterHook": {
                  "D00587": 0,
                  "D0058C": 15,
                  "D0058D": 15,
                  "D0058E": 15,
                  "D00080": 8,
                  "D0009F": 0,
                  "D007CA": 361961,
                  "D008E0": 13740131,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 13805604,
                  "D02A40": 0,
                  "VAT_D02590": 13893249,
                  "VAT_D0259D": 13893325
                }
              },
              {
                "block": 11067,
                "pc": "0x05E2B8",
                "diff": {
                  "D0243D": [
                    13805604,
                    13805605
                  ]
                },
                "beforeHook": {
                  "D00587": 0,
                  "D0058C": 15,
                  "D0058D": 15,
                  "D0058E": 15,
                  "D00080": 8,
                  "D0009F": 0,
                  "D007CA": 361961,
                  "D008E0": 13740131,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 13805605,
                  "D02A40": 0,
                  "VAT_D02590": 13893249,
                  "VAT_D0259D": 13893325
                },
                "afterHook": {
                  "D00587": 0,
                  "D0058C": 15,
                  "D0058D": 15,
                  "D0058E": 15,
                  "D00080": 8,
                  "D0009F": 0,
                  "D007CA": 361961,
                  "D008E0": 13740131,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 13805605,
                  "D02A40": 0,
                  "VAT_D02590": 13893249,
                  "VAT_D0259D": 13893325
                }
              },
              {
                "block": 11681,
                "pc": "0x05E2B8",
                "diff": {
                  "D0243D": [
                    13805605,
                    13805606
                  ]
                },
                "beforeHook": {
                  "D00587": 0,
                  "D0058C": 15,
                  "D0058D": 15,
                  "D0058E": 15,
                  "D00080": 8,
                  "D0009F": 0,
                  "D007CA": 361961,
                  "D008E0": 13740131,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 13805606,
                  "D02A40": 0,
                  "VAT_D02590": 13893249,
                  "VAT_D0259D": 13893325
                },
                "afterHook": {
                  "D00587": 0,
                  "D0058C": 15,
                  "D0058D": 15,
                  "D0058E": 15,
                  "D00080": 8,
                  "D0009F": 0,
                  "D007CA": 361961,
                  "D008E0": 13740131,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 13805606,
                  "D02A40": 0,
                  "VAT_D02590": 13893249,
                  "VAT_D0259D": 13893325
                }
              },
              {
                "block": 12279,
                "pc": "0x05E2B8",
                "diff": {
                  "D0243D": [
                    13805606,
                    13805607
                  ]
                },
                "beforeHook": {
                  "D00587": 0,
                  "D0058C": 15,
                  "D0058D": 15,
                  "D0058E": 15,
                  "D00080": 8,
                  "D0009F": 0,
                  "D007CA": 361961,
                  "D008E0": 13740131,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 13805607,
                  "D02A40": 0,
                  "VAT_D02590": 13893249,
                  "VAT_D0259D": 13893325
                },
                "afterHook": {
                  "D00587": 0,
                  "D0058C": 15,
                  "D0058D": 15,
                  "D0058E": 15,
                  "D00080": 8,
                  "D0009F": 0,
                  "D007CA": 361961,
                  "D008E0": 13740131,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 13805607,
                  "D02A40": 0,
                  "VAT_D02590": 13893249,
                  "VAT_D0259D": 13893325
                }
              },
              {
                "block": 12893,
                "pc": "0x05E2B8",
                "diff": {
                  "D0243D": [
                    13805607,
                    13805608
                  ]
                },
                "beforeHook": {
                  "D00587": 0,
                  "D0058C": 15,
                  "D0058D": 15,
                  "D0058E": 15,
                  "D00080": 8,
                  "D0009F": 0,
                  "D007CA": 361961,
                  "D008E0": 13740131,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 13805608,
                  "D02A40": 0,
                  "VAT_D02590": 13893249,
                  "VAT_D0259D": 13893325
                },
                "afterHook": {
                  "D00587": 0,
                  "D0058C": 15,
                  "D0058D": 15,
                  "D0058E": 15,
                  "D00080": 8,
                  "D0009F": 0,
                  "D007CA": 361961,
                  "D008E0": 13740131,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 13805608,
                  "D02A40": 0,
                  "VAT_D02590": 13893249,
                  "VAT_D0259D": 13893325
                }
              },
              {
                "block": 13491,
                "pc": "0x05E2B8",
                "diff": {
                  "D0243D": [
                    13805608,
                    13805609
                  ]
                },
                "beforeHook": {
                  "D00587": 0,
                  "D0058C": 15,
                  "D0058D": 15,
                  "D0058E": 15,
                  "D00080": 8,
                  "D0009F": 0,
                  "D007CA": 361961,
                  "D008E0": 13740131,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 13805609,
                  "D02A40": 0,
                  "VAT_D02590": 13893249,
                  "VAT_D0259D": 13893325
                },
                "afterHook": {
                  "D00587": 0,
                  "D0058C": 15,
                  "D0058D": 15,
                  "D0058E": 15,
                  "D00080": 8,
                  "D0009F": 0,
                  "D007CA": 361961,
                  "D008E0": 13740131,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 13805609,
                  "D02A40": 0,
                  "VAT_D02590": 13893249,
                  "VAT_D0259D": 13893325
                }
              },
              {
                "block": 14105,
                "pc": "0x05E2B8",
                "diff": {
                  "D0243D": [
                    13805609,
                    13805610
                  ]
                },
                "beforeHook": {
                  "D00587": 0,
                  "D0058C": 15,
                  "D0058D": 15,
                  "D0058E": 15,
                  "D00080": 8,
                  "D0009F": 0,
                  "D007CA": 361961,
                  "D008E0": 13740131,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 13805610,
                  "D02A40": 0,
                  "VAT_D02590": 13893249,
                  "VAT_D0259D": 13893325
                },
                "afterHook": {
                  "D00587": 0,
                  "D0058C": 15,
                  "D0058D": 15,
                  "D0058E": 15,
                  "D00080": 8,
                  "D0009F": 0,
                  "D007CA": 361961,
                  "D008E0": 13740131,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 13805610,
                  "D02A40": 0,
                  "VAT_D02590": 13893249,
                  "VAT_D0259D": 13893325
                }
              },
              {
                "block": 14703,
                "pc": "0x05E2B8",
                "diff": {
                  "D0243D": [
                    13805610,
                    13805611
                  ]
                },
                "beforeHook": {
                  "D00587": 0,
                  "D0058C": 15,
                  "D0058D": 15,
                  "D0058E": 15,
                  "D00080": 8,
                  "D0009F": 0,
                  "D007CA": 361961,
                  "D008E0": 13740131,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 13805611,
                  "D02A40": 0,
                  "VAT_D02590": 13893249,
                  "VAT_D0259D": 13893325
                },
                "afterHook": {
                  "D00587": 0,
                  "D0058C": 15,
                  "D0058D": 15,
                  "D0058E": 15,
                  "D00080": 8,
                  "D0009F": 0,
                  "D007CA": 361961,
                  "D008E0": 13740131,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 13805611,
                  "D02A40": 0,
                  "VAT_D02590": 13893249,
                  "VAT_D0259D": 13893325
                }
              }
            ]
          },
          "afterState": {
            "status": "Key: CLEAR → 350000 steps (peak 11493px)",
            "vramPixels": 3039,
            "routeFields": {
              "D00587": 0,
              "D0058C": 0,
              "D0058D": 0,
              "D0058E": 0,
              "D00080": 0,
              "D0009F": 0,
              "D007CA": 361961,
              "D008E0": 0,
              "D02A28": 0,
              "D001B8": 0,
              "D001D3": 0,
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805589,
              "D02A40": 0,
              "VAT_D02590": 13893249,
              "VAT_D0259D": 13893325
            }
          }
        }
      ]
    },
    {
      "label": "no-autorun-digit2",
      "autoRun": false,
      "replayBeforeEachKey": false,
      "replayOk": true,
      "p6": {
        "steps": 49474,
        "termination": "halt",
        "lastPc": 6581,
        "lastMode": "adl"
      },
      "p6VatLoopHits": 34,
      "afterColdboot": {
        "status": "Coldboot complete. OS event loop is ready.",
        "vramPixels": 8549,
        "replayFields": {
          "D007CA": "0x0585E9",
          "D008E0": "0x000000",
          "D02587": "0xD3A854",
          "D0258A": "0xD3A854",
          "D0258D": "0xD3A854",
          "D02590": "0xD3FE81",
          "D02593": "0xD3FE81",
          "D0259A": "0xD3FE81",
          "D0259D": "0xD3FECD",
          "D025A0": "0xD3A816",
          "D025C5": "0x0C0000"
        },
        "routeFields": {
          "D00587": 0,
          "D0058C": 0,
          "D0058D": 0,
          "D0058E": 0,
          "D00080": 0,
          "D0009F": 0,
          "D007CA": 361961,
          "D008E0": 0,
          "D02A28": 0,
          "D001B8": 0,
          "D001D3": 0,
          "D02A29": 0,
          "D02A2B": 0,
          "D02A1B": 0,
          "D0059A": 0,
          "D01150": 0,
          "D0243D": 13805589,
          "D02A40": 0,
          "VAT_D02590": 13893249,
          "VAT_D0259D": 13893325
        }
      },
      "afterAutoRun": null,
      "errors": [],
      "keys": [
        {
          "label": "Digit2",
          "expected": 144,
          "seeded": true,
          "vatLive": true,
          "answered": true,
          "path": "low-transfer path",
          "preReplayOk": null,
          "summary": {
            "label": "no-autorun-digit2:Digit2",
            "totalBlocks": 299956,
            "tokenHookHits": 0,
            "lowPathHits": 60889,
            "cleanupHits": 3,
            "getCscHits": 3,
            "cxMainHits": 2,
            "keyHandlerHits": 2,
            "loopHits": 2,
            "haltHits": 1,
            "counts": {
              "launch09dd62": 0,
              "memInit09dee0": 0,
              "clear001879": 3,
              "cleanup0018f8": 3,
              "repaint058241": 0,
              "vatLoop084711": 0,
              "vatRewind082be2": 0,
              "halt0019b5": 1,
              "getCsc03fa09": 3,
              "loop08c331": 2,
              "cxMain0585e9": 2,
              "keyHandler05877a": 2,
              "outer08f3b8": 0,
              "tokenReader090883": 0,
              "tokenExit08f5e1": 0,
              "tokenGate090992": 0,
              "tokenStore09098e": 0,
              "eolTuple08f54b": 0,
              "displaySeed013d11": 2,
              "displayLoop0059c6": 389,
              "lowBranch0013fc": 2,
              "low006d38": 20160,
              "low006d4f": 20160,
              "low006d5d": 20176
            },
            "regionCounts": {
              "token08f000_090fff": 0,
              "display090000_091fff": 0,
              "low006d00_006dff": 100864,
              "cleanupLow001000_001fff": 5884,
              "home058000_058fff": 98
            },
            "startFields": {
              "D00587": 0,
              "D0058C": 0,
              "D0058D": 0,
              "D0058E": 0,
              "D00080": 0,
              "D0009F": 0,
              "D007CA": 361961,
              "D008E0": 0,
              "D02A28": 0,
              "D001B8": 0,
              "D001D3": 0,
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805589,
              "D02A40": 0,
              "VAT_D02590": 13893249,
              "VAT_D0259D": 13893325
            },
            "endFields": {
              "D00587": 0,
              "D0058C": 0,
              "D0058D": 0,
              "D0058E": 0,
              "D00080": 0,
              "D0009F": 0,
              "D007CA": 0,
              "D008E0": 0,
              "D02A28": 0,
              "D001B8": 0,
              "D001D3": 0,
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 0,
              "D02A40": 0,
              "VAT_D02590": 0,
              "VAT_D0259D": 0
            },
            "status": "Key: 2 → 300000 steps (peak 8754px)",
            "firstBlocks": [
              "0x08C331",
              "0x05C634",
              "0x000038",
              "0x0006F3",
              "0x000704",
              "0x000710",
              "0x001713",
              "0x0008BB",
              "0x001717",
              "0x001718",
              "0x00171E",
              "0x0067F8",
              "0x001C4F",
              "0x001CA6",
              "0x001CC0",
              "0x001CCA",
              "0x001CCE",
              "0x001CD5"
            ],
            "lastBlocks": [
              "0x000ACE",
              "0x000AEE",
              "0x000A79",
              "0x000A92",
              "0x000A92",
              "0x000A92",
              "0x000A92",
              "0x000A92",
              "0x000A92",
              "0x000A92",
              "0x000A92",
              "0x000A92",
              "0x000A92",
              "0x000A92",
              "0x000A92",
              "0x000A92",
              "0x000A92",
              "0x000A92"
            ],
            "hotBlocks": [
              {
                "pc": "0x000A92",
                "count": 33289
              },
              {
                "pc": "0x000BFE",
                "count": 32258
              },
              {
                "pc": "0x0021C2",
                "count": 20182
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
              }
            ],
            "targetSamples": [
              {
                "block": 1,
                "pc": "0x08C331",
                "target": "loop08c331",
                "before": {
                  "D00587": 26,
                  "D0058C": 144,
                  "D0058D": 144,
                  "D0058E": 144,
                  "D00080": 8,
                  "D0009F": 32,
                  "D007CA": 361961,
                  "D008E0": 13740131,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 13805589,
                  "D02A40": 0,
                  "VAT_D02590": 13893249,
                  "VAT_D0259D": 13893325
                },
                "runtime": {
                  "lastPc": 574257,
                  "lastMode": "adl",
                  "totalSteps": 637707
                }
              },
              {
                "block": 2363,
                "pc": "0x0585E9",
                "target": "cxMain0585e9",
                "before": {
                  "D00587": 26,
                  "D0058C": 144,
                  "D0058D": 26,
                  "D0058E": 144,
                  "D00080": 24,
                  "D0009F": 0,
                  "D007CA": 361961,
                  "D008E0": 13740131,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 13805589,
                  "D02A40": 0,
                  "VAT_D02590": 13893249,
                  "VAT_D0259D": 13893325
                },
                "runtime": {
                  "lastPc": 574257,
                  "lastMode": "adl",
                  "totalSteps": 637707
                }
              },
              {
                "block": 2367,
                "pc": "0x05877A",
                "target": "keyHandler05877a",
                "before": {
                  "D00587": 26,
                  "D0058C": 144,
                  "D0058D": 26,
                  "D0058E": 144,
                  "D00080": 24,
                  "D0009F": 0,
                  "D007CA": 361961,
                  "D008E0": 13740131,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 13805589,
                  "D02A40": 0,
                  "VAT_D02590": 13893249,
                  "VAT_D0259D": 13893325
                },
                "runtime": {
                  "lastPc": 574257,
                  "lastMode": "adl",
                  "totalSteps": 637707
                }
              },
              {
                "block": 5571,
                "pc": "0x03FA09",
                "target": "getCsc03fa09",
                "before": {
                  "D00587": 26,
                  "D0058C": 0,
                  "D0058D": 26,
                  "D0058E": 0,
                  "D00080": 24,
                  "D0009F": 0,
                  "D007CA": 361961,
                  "D008E0": 13740131,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 13805590,
                  "D02A40": 0,
                  "VAT_D02590": 13893249,
                  "VAT_D0259D": 13893325
                },
                "runtime": {
                  "lastPc": 574257,
                  "lastMode": "adl",
                  "totalSteps": 637707
                }
              },
              {
                "block": 7387,
                "pc": "0x0585E9",
                "target": "cxMain0585e9",
                "before": {
                  "D00587": 0,
                  "D0058C": 144,
                  "D0058D": 26,
                  "D0058E": 0,
                  "D00080": 0,
                  "D0009F": 0,
                  "D007CA": 361961,
                  "D008E0": 13740131,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 13805590,
                  "D02A40": 0,
                  "VAT_D02590": 13893249,
                  "VAT_D0259D": 13893325
                },
                "runtime": {
                  "lastPc": 574257,
                  "lastMode": "adl",
                  "totalSteps": 637707
                }
              },
              {
                "block": 7391,
                "pc": "0x05877A",
                "target": "keyHandler05877a",
                "before": {
                  "D00587": 0,
                  "D0058C": 144,
                  "D0058D": 26,
                  "D0058E": 0,
                  "D00080": 0,
                  "D0009F": 0,
                  "D007CA": 361961,
                  "D008E0": 13740131,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 13805590,
                  "D02A40": 0,
                  "VAT_D02590": 13893249,
                  "VAT_D0259D": 13893325
                },
                "runtime": {
                  "lastPc": 574257,
                  "lastMode": "adl",
                  "totalSteps": 637707
                }
              },
              {
                "block": 11109,
                "pc": "0x03FA09",
                "target": "getCsc03fa09",
                "before": {
                  "D00587": 0,
                  "D0058C": 0,
                  "D0058D": 26,
                  "D0058E": 0,
                  "D00080": 0,
                  "D0009F": 0,
                  "D007CA": 361961,
                  "D008E0": 13740131,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 13805591,
                  "D02A40": 0,
                  "VAT_D02590": 13893249,
                  "VAT_D0259D": 13893325
                },
                "runtime": {
                  "lastPc": 574257,
                  "lastMode": "adl",
                  "totalSteps": 637707
                }
              },
              {
                "block": 13138,
                "pc": "0x001879",
                "target": "clear001879",
                "before": {
                  "D00587": 0,
                  "D0058C": 0,
                  "D0058D": 26,
                  "D0058E": 0,
                  "D00080": 0,
                  "D0009F": 0,
                  "D007CA": 361961,
                  "D008E0": 13740131,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 13805591,
                  "D02A40": 0,
                  "VAT_D02590": 13893249,
                  "VAT_D0259D": 13893325
                },
                "runtime": {
                  "lastPc": 574257,
                  "lastMode": "adl",
                  "totalSteps": 637707
                }
              },
              {
                "block": 13139,
                "pc": "0x0018F8",
                "target": "cleanup0018f8",
                "before": {
                  "D00587": 0,
                  "D0058C": 0,
                  "D0058D": 0,
                  "D0058E": 0,
                  "D00080": 0,
                  "D0009F": 0,
                  "D007CA": 0,
                  "D008E0": 0,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 0,
                  "D02A40": 0,
                  "VAT_D02590": 0,
                  "VAT_D0259D": 0
                },
                "runtime": {
                  "lastPc": 574257,
                  "lastMode": "adl",
                  "totalSteps": 637707
                }
              },
              {
                "block": 14787,
                "pc": "0x0013FC",
                "target": "lowBranch0013fc",
                "before": {
                  "D00587": 0,
                  "D0058C": 0,
                  "D0058D": 0,
                  "D0058E": 0,
                  "D00080": 0,
                  "D0009F": 0,
                  "D007CA": 0,
                  "D008E0": 0,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 0,
                  "D02A40": 0,
                  "VAT_D02590": 0,
                  "VAT_D0259D": 0
                },
                "runtime": {
                  "lastPc": 574257,
                  "lastMode": "adl",
                  "totalSteps": 637707
                }
              },
              {
                "block": 14826,
                "pc": "0x013D11",
                "target": "displaySeed013d11",
                "before": {
                  "D00587": 0,
                  "D0058C": 0,
                  "D0058D": 0,
                  "D0058E": 0,
                  "D00080": 0,
                  "D0009F": 0,
                  "D007CA": 0,
                  "D008E0": 0,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 0,
                  "D02A40": 0,
                  "VAT_D02590": 0,
                  "VAT_D0259D": 0
                },
                "runtime": {
                  "lastPc": 574257,
                  "lastMode": "adl",
                  "totalSteps": 637707
                }
              },
              {
                "block": 14827,
                "pc": "0x0059C6",
                "target": "displayLoop0059c6",
                "before": {
                  "D00587": 0,
                  "D0058C": 0,
                  "D0058D": 0,
                  "D0058E": 0,
                  "D00080": 0,
                  "D0009F": 0,
                  "D007CA": 0,
                  "D008E0": 0,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 0,
                  "D02A40": 0,
                  "VAT_D02590": 0,
                  "VAT_D0259D": 0
                },
                "runtime": {
                  "lastPc": 574257,
                  "lastMode": "adl",
                  "totalSteps": 637707
                }
              },
              {
                "block": 14913,
                "pc": "0x0059C6",
                "target": "displayLoop0059c6",
                "before": {
                  "D00587": 0,
                  "D0058C": 0,
                  "D0058D": 0,
                  "D0058E": 0,
                  "D00080": 0,
                  "D0009F": 0,
                  "D007CA": 0,
                  "D008E0": 0,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 0,
                  "D02A40": 0,
                  "VAT_D02590": 0,
                  "VAT_D0259D": 0
                },
                "runtime": {
                  "lastPc": 574257,
                  "lastMode": "adl",
                  "totalSteps": 637707
                }
              },
              {
                "block": 14999,
                "pc": "0x0059C6",
                "target": "displayLoop0059c6",
                "before": {
                  "D00587": 0,
                  "D0058C": 0,
                  "D0058D": 0,
                  "D0058E": 0,
                  "D00080": 0,
                  "D0009F": 0,
                  "D007CA": 0,
                  "D008E0": 0,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 0,
                  "D02A40": 0,
                  "VAT_D02590": 0,
                  "VAT_D0259D": 0
                },
                "runtime": {
                  "lastPc": 574257,
                  "lastMode": "adl",
                  "totalSteps": 637707
                }
              },
              {
                "block": 15085,
                "pc": "0x0059C6",
                "target": "displayLoop0059c6",
                "before": {
                  "D00587": 0,
                  "D0058C": 0,
                  "D0058D": 0,
                  "D0058E": 0,
                  "D00080": 0,
                  "D0009F": 0,
                  "D007CA": 0,
                  "D008E0": 0,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 0,
                  "D02A40": 0,
                  "VAT_D02590": 0,
                  "VAT_D0259D": 0
                },
                "runtime": {
                  "lastPc": 574257,
                  "lastMode": "adl",
                  "totalSteps": 637707
                }
              },
              {
                "block": 22469,
                "pc": "0x006D5D",
                "target": "low006d5d",
                "before": {
                  "D00587": 0,
                  "D0058C": 0,
                  "D0058D": 0,
                  "D0058E": 0,
                  "D00080": 0,
                  "D0009F": 0,
                  "D007CA": 0,
                  "D008E0": 0,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 0,
                  "D02A40": 0,
                  "VAT_D02590": 0,
                  "VAT_D0259D": 0
                },
                "runtime": {
                  "lastPc": 574257,
                  "lastMode": "adl",
                  "totalSteps": 637707
                }
              },
              {
                "block": 22475,
                "pc": "0x006D38",
                "target": "low006d38",
                "before": {
                  "D00587": 0,
                  "D0058C": 0,
                  "D0058D": 0,
                  "D0058E": 0,
                  "D00080": 0,
                  "D0009F": 0,
                  "D007CA": 0,
                  "D008E0": 0,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 0,
                  "D02A40": 0,
                  "VAT_D02590": 0,
                  "VAT_D0259D": 0
                },
                "runtime": {
                  "lastPc": 574257,
                  "lastMode": "adl",
                  "totalSteps": 637707
                }
              },
              {
                "block": 22476,
                "pc": "0x006D4F",
                "target": "low006d4f",
                "before": {
                  "D00587": 0,
                  "D0058C": 0,
                  "D0058D": 0,
                  "D0058E": 0,
                  "D00080": 0,
                  "D0009F": 0,
                  "D007CA": 0,
                  "D008E0": 0,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 0,
                  "D02A40": 0,
                  "VAT_D02590": 0,
                  "VAT_D0259D": 0
                },
                "runtime": {
                  "lastPc": 574257,
                  "lastMode": "adl",
                  "totalSteps": 637707
                }
              }
            ],
            "fieldTransitions": [
              {
                "block": 1,
                "pc": "0x08C331",
                "diff": {
                  "D00587": [
                    0,
                    26
                  ],
                  "D0058C": [
                    0,
                    144
                  ],
                  "D0058D": [
                    0,
                    144
                  ],
                  "D0058E": [
                    0,
                    144
                  ],
                  "D00080": [
                    0,
                    8
                  ],
                  "D0009F": [
                    0,
                    32
                  ],
                  "D008E0": [
                    0,
                    13740131
                  ]
                },
                "beforeHook": {
                  "D00587": 26,
                  "D0058C": 144,
                  "D0058D": 144,
                  "D0058E": 144,
                  "D00080": 8,
                  "D0009F": 32,
                  "D007CA": 361961,
                  "D008E0": 13740131,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 13805589,
                  "D02A40": 0,
                  "VAT_D02590": 13893249,
                  "VAT_D0259D": 13893325
                },
                "afterHook": {
                  "D00587": 26,
                  "D0058C": 144,
                  "D0058D": 144,
                  "D0058E": 144,
                  "D00080": 8,
                  "D0009F": 32,
                  "D007CA": 361961,
                  "D008E0": 13740131,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 13805589,
                  "D02A40": 0,
                  "VAT_D02590": 13893249,
                  "VAT_D0259D": 13893325
                }
              },
              {
                "block": 143,
                "pc": "0x03F9D5",
                "diff": {
                  "D0058D": [
                    144,
                    26
                  ]
                },
                "beforeHook": {
                  "D00587": 26,
                  "D0058C": 144,
                  "D0058D": 26,
                  "D0058E": 144,
                  "D00080": 8,
                  "D0009F": 32,
                  "D007CA": 361961,
                  "D008E0": 13740131,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 13805589,
                  "D02A40": 0,
                  "VAT_D02590": 13893249,
                  "VAT_D0259D": 13893325
                },
                "afterHook": {
                  "D00587": 26,
                  "D0058C": 144,
                  "D0058D": 26,
                  "D0058E": 144,
                  "D00080": 8,
                  "D0009F": 32,
                  "D007CA": 361961,
                  "D008E0": 13740131,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 13805589,
                  "D02A40": 0,
                  "VAT_D02590": 13893249,
                  "VAT_D0259D": 13893325
                }
              },
              {
                "block": 145,
                "pc": "0x03D058",
                "diff": {
                  "D00080": [
                    8,
                    24
                  ]
                },
                "beforeHook": {
                  "D00587": 26,
                  "D0058C": 144,
                  "D0058D": 26,
                  "D0058E": 144,
                  "D00080": 24,
                  "D0009F": 32,
                  "D007CA": 361961,
                  "D008E0": 13740131,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 13805589,
                  "D02A40": 0,
                  "VAT_D02590": 13893249,
                  "VAT_D0259D": 13893325
                },
                "afterHook": {
                  "D00587": 26,
                  "D0058C": 144,
                  "D0058D": 26,
                  "D0058E": 144,
                  "D00080": 24,
                  "D0009F": 32,
                  "D007CA": 361961,
                  "D008E0": 13740131,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 13805589,
                  "D02A40": 0,
                  "VAT_D02590": 13893249,
                  "VAT_D0259D": 13893325
                }
              },
              {
                "block": 1149,
                "pc": "0x08C366",
                "diff": {
                  "D0009F": [
                    32,
                    0
                  ]
                },
                "beforeHook": {
                  "D00587": 26,
                  "D0058C": 144,
                  "D0058D": 26,
                  "D0058E": 144,
                  "D00080": 24,
                  "D0009F": 0,
                  "D007CA": 361961,
                  "D008E0": 13740131,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 13805589,
                  "D02A40": 0,
                  "VAT_D02590": 13893249,
                  "VAT_D0259D": 13893325
                },
                "afterHook": {
                  "D00587": 26,
                  "D0058C": 144,
                  "D0058D": 26,
                  "D0058E": 144,
                  "D00080": 24,
                  "D0009F": 0,
                  "D007CA": 361961,
                  "D008E0": 13740131,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 13805589,
                  "D02A40": 0,
                  "VAT_D02590": 13893249,
                  "VAT_D0259D": 13893325
                }
              },
              {
                "block": 2758,
                "pc": "0x05E352",
                "diff": {
                  "D0243D": [
                    13805589,
                    13805590
                  ]
                },
                "beforeHook": {
                  "D00587": 26,
                  "D0058C": 144,
                  "D0058D": 26,
                  "D0058E": 144,
                  "D00080": 24,
                  "D0009F": 0,
                  "D007CA": 361961,
                  "D008E0": 13740131,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 13805590,
                  "D02A40": 0,
                  "VAT_D02590": 13893249,
                  "VAT_D0259D": 13893325
                },
                "afterHook": {
                  "D00587": 26,
                  "D0058C": 144,
                  "D0058D": 26,
                  "D0058E": 144,
                  "D00080": 24,
                  "D0009F": 0,
                  "D007CA": 361961,
                  "D008E0": 13740131,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 13805590,
                  "D02A40": 0,
                  "VAT_D02590": 13893249,
                  "VAT_D0259D": 13893325
                }
              },
              {
                "block": 4960,
                "pc": "0x02FCB3",
                "diff": {
                  "D0058C": [
                    144,
                    0
                  ],
                  "D0058E": [
                    144,
                    0
                  ]
                },
                "beforeHook": {
                  "D00587": 26,
                  "D0058C": 0,
                  "D0058D": 26,
                  "D0058E": 0,
                  "D00080": 24,
                  "D0009F": 0,
                  "D007CA": 361961,
                  "D008E0": 13740131,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 13805590,
                  "D02A40": 0,
                  "VAT_D02590": 13893249,
                  "VAT_D0259D": 13893325
                },
                "afterHook": {
                  "D00587": 26,
                  "D0058C": 0,
                  "D0058D": 26,
                  "D0058E": 0,
                  "D00080": 24,
                  "D0009F": 0,
                  "D007CA": 361961,
                  "D008E0": 13740131,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 13805590,
                  "D02A40": 0,
                  "VAT_D02590": 13893249,
                  "VAT_D0259D": 13893325
                }
              },
              {
                "block": 5572,
                "pc": "0x000038",
                "diff": {
                  "D00587": [
                    26,
                    0
                  ],
                  "D00080": [
                    24,
                    16
                  ]
                },
                "beforeHook": {
                  "D00587": 0,
                  "D0058C": 0,
                  "D0058D": 26,
                  "D0058E": 0,
                  "D00080": 16,
                  "D0009F": 0,
                  "D007CA": 361961,
                  "D008E0": 13740131,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 13805590,
                  "D02A40": 0,
                  "VAT_D02590": 13893249,
                  "VAT_D0259D": 13893325
                },
                "afterHook": {
                  "D00587": 0,
                  "D0058C": 0,
                  "D0058D": 26,
                  "D0058E": 0,
                  "D00080": 16,
                  "D0009F": 0,
                  "D007CA": 361961,
                  "D008E0": 13740131,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 13805590,
                  "D02A40": 0,
                  "VAT_D02590": 13893249,
                  "VAT_D0259D": 13893325
                }
              },
              {
                "block": 5972,
                "pc": "0x02FECF",
                "diff": {
                  "D00080": [
                    16,
                    0
                  ]
                },
                "beforeHook": {
                  "D00587": 0,
                  "D0058C": 0,
                  "D0058D": 26,
                  "D0058E": 0,
                  "D00080": 0,
                  "D0009F": 0,
                  "D007CA": 361961,
                  "D008E0": 13740131,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 13805590,
                  "D02A40": 0,
                  "VAT_D02590": 13893249,
                  "VAT_D0259D": 13893325
                },
                "afterHook": {
                  "D00587": 0,
                  "D0058C": 0,
                  "D0058D": 26,
                  "D0058E": 0,
                  "D00080": 0,
                  "D0009F": 0,
                  "D007CA": 361961,
                  "D008E0": 13740131,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 13805590,
                  "D02A40": 0,
                  "VAT_D02590": 13893249,
                  "VAT_D0259D": 13893325
                }
              },
              {
                "block": 6157,
                "pc": "0x08C38A",
                "diff": {
                  "D0058C": [
                    0,
                    144
                  ]
                },
                "beforeHook": {
                  "D00587": 0,
                  "D0058C": 144,
                  "D0058D": 26,
                  "D0058E": 0,
                  "D00080": 0,
                  "D0009F": 0,
                  "D007CA": 361961,
                  "D008E0": 13740131,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 13805590,
                  "D02A40": 0,
                  "VAT_D02590": 13893249,
                  "VAT_D0259D": 13893325
                },
                "afterHook": {
                  "D00587": 0,
                  "D0058C": 144,
                  "D0058D": 26,
                  "D0058E": 0,
                  "D00080": 0,
                  "D0009F": 0,
                  "D007CA": 361961,
                  "D008E0": 13740131,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 13805590,
                  "D02A40": 0,
                  "VAT_D02590": 13893249,
                  "VAT_D0259D": 13893325
                }
              },
              {
                "block": 7782,
                "pc": "0x05E352",
                "diff": {
                  "D0243D": [
                    13805590,
                    13805591
                  ]
                },
                "beforeHook": {
                  "D00587": 0,
                  "D0058C": 144,
                  "D0058D": 26,
                  "D0058E": 0,
                  "D00080": 0,
                  "D0009F": 0,
                  "D007CA": 361961,
                  "D008E0": 13740131,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 13805591,
                  "D02A40": 0,
                  "VAT_D02590": 13893249,
                  "VAT_D0259D": 13893325
                },
                "afterHook": {
                  "D00587": 0,
                  "D0058C": 144,
                  "D0058D": 26,
                  "D0058E": 0,
                  "D00080": 0,
                  "D0009F": 0,
                  "D007CA": 361961,
                  "D008E0": 13740131,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 13805591,
                  "D02A40": 0,
                  "VAT_D02590": 13893249,
                  "VAT_D0259D": 13893325
                }
              },
              {
                "block": 10514,
                "pc": "0x02FCB3",
                "diff": {
                  "D0058C": [
                    144,
                    0
                  ]
                },
                "beforeHook": {
                  "D00587": 0,
                  "D0058C": 0,
                  "D0058D": 26,
                  "D0058E": 0,
                  "D00080": 0,
                  "D0009F": 0,
                  "D007CA": 361961,
                  "D008E0": 13740131,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 13805591,
                  "D02A40": 0,
                  "VAT_D02590": 13893249,
                  "VAT_D0259D": 13893325
                },
                "afterHook": {
                  "D00587": 0,
                  "D0058C": 0,
                  "D0058D": 26,
                  "D0058E": 0,
                  "D00080": 0,
                  "D0009F": 0,
                  "D007CA": 361961,
                  "D008E0": 13740131,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 13805591,
                  "D02A40": 0,
                  "VAT_D02590": 13893249,
                  "VAT_D0259D": 13893325
                }
              },
              {
                "block": 13139,
                "pc": "0x0018F8",
                "diff": {
                  "D0058D": [
                    26,
                    0
                  ],
                  "D007CA": [
                    361961,
                    0
                  ],
                  "D008E0": [
                    13740131,
                    0
                  ],
                  "D0243D": [
                    13805591,
                    0
                  ],
                  "VAT_D02590": [
                    13893249,
                    0
                  ],
                  "VAT_D0259D": [
                    13893325,
                    0
                  ]
                },
                "beforeHook": {
                  "D00587": 0,
                  "D0058C": 0,
                  "D0058D": 0,
                  "D0058E": 0,
                  "D00080": 0,
                  "D0009F": 0,
                  "D007CA": 0,
                  "D008E0": 0,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 0,
                  "D02A40": 0,
                  "VAT_D02590": 0,
                  "VAT_D0259D": 0
                },
                "afterHook": {
                  "D00587": 0,
                  "D0058C": 0,
                  "D0058D": 0,
                  "D0058E": 0,
                  "D00080": 0,
                  "D0009F": 0,
                  "D007CA": 0,
                  "D008E0": 0,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 0,
                  "D02A40": 0,
                  "VAT_D02590": 0,
                  "VAT_D0259D": 0
                }
              },
              {
                "block": 205015,
                "pc": "0x03FA04",
                "diff": {
                  "D00587": [
                    0,
                    26
                  ],
                  "D00080": [
                    0,
                    8
                  ]
                },
                "beforeHook": {
                  "D00587": 26,
                  "D0058C": 0,
                  "D0058D": 0,
                  "D0058E": 0,
                  "D00080": 8,
                  "D0009F": 0,
                  "D007CA": 0,
                  "D008E0": 0,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 0,
                  "D02A40": 0,
                  "VAT_D02590": 0,
                  "VAT_D0259D": 0
                },
                "afterHook": {
                  "D00587": 26,
                  "D0058C": 0,
                  "D0058D": 0,
                  "D0058E": 0,
                  "D00080": 8,
                  "D0009F": 0,
                  "D007CA": 0,
                  "D008E0": 0,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 0,
                  "D02A40": 0,
                  "VAT_D02590": 0,
                  "VAT_D0259D": 0
                }
              },
              {
                "block": 205016,
                "pc": "0x03F9D5",
                "diff": {
                  "D0058D": [
                    0,
                    26
                  ]
                },
                "beforeHook": {
                  "D00587": 26,
                  "D0058C": 0,
                  "D0058D": 26,
                  "D0058E": 0,
                  "D00080": 8,
                  "D0009F": 0,
                  "D007CA": 0,
                  "D008E0": 0,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 0,
                  "D02A40": 0,
                  "VAT_D02590": 0,
                  "VAT_D0259D": 0
                },
                "afterHook": {
                  "D00587": 26,
                  "D0058C": 0,
                  "D0058D": 26,
                  "D0058E": 0,
                  "D00080": 8,
                  "D0009F": 0,
                  "D007CA": 0,
                  "D008E0": 0,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 0,
                  "D02A40": 0,
                  "VAT_D02590": 0,
                  "VAT_D0259D": 0
                }
              },
              {
                "block": 205018,
                "pc": "0x03D058",
                "diff": {
                  "D00080": [
                    8,
                    24
                  ]
                },
                "beforeHook": {
                  "D00587": 26,
                  "D0058C": 0,
                  "D0058D": 26,
                  "D0058E": 0,
                  "D00080": 24,
                  "D0009F": 0,
                  "D007CA": 0,
                  "D008E0": 0,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 0,
                  "D02A40": 0,
                  "VAT_D02590": 0,
                  "VAT_D0259D": 0
                },
                "afterHook": {
                  "D00587": 26,
                  "D0058C": 0,
                  "D0058D": 26,
                  "D0058E": 0,
                  "D00080": 24,
                  "D0009F": 0,
                  "D007CA": 0,
                  "D008E0": 0,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 0,
                  "D02A40": 0,
                  "VAT_D02590": 0,
                  "VAT_D0259D": 0
                }
              },
              {
                "block": 206248,
                "pc": "0x000038",
                "diff": {
                  "D00587": [
                    26,
                    0
                  ],
                  "D00080": [
                    24,
                    16
                  ]
                },
                "beforeHook": {
                  "D00587": 0,
                  "D0058C": 0,
                  "D0058D": 26,
                  "D0058E": 0,
                  "D00080": 16,
                  "D0009F": 0,
                  "D007CA": 0,
                  "D008E0": 0,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 0,
                  "D02A40": 0,
                  "VAT_D02590": 0,
                  "VAT_D0259D": 0
                },
                "afterHook": {
                  "D00587": 0,
                  "D0058C": 0,
                  "D0058D": 26,
                  "D0058E": 0,
                  "D00080": 16,
                  "D0009F": 0,
                  "D007CA": 0,
                  "D008E0": 0,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 0,
                  "D02A40": 0,
                  "VAT_D02590": 0,
                  "VAT_D0259D": 0
                }
              },
              {
                "block": 206557,
                "pc": "0x02FECF",
                "diff": {
                  "D00080": [
                    16,
                    0
                  ]
                },
                "beforeHook": {
                  "D00587": 0,
                  "D0058C": 0,
                  "D0058D": 26,
                  "D0058E": 0,
                  "D00080": 0,
                  "D0009F": 0,
                  "D007CA": 0,
                  "D008E0": 0,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 0,
                  "D02A40": 0,
                  "VAT_D02590": 0,
                  "VAT_D0259D": 0
                },
                "afterHook": {
                  "D00587": 0,
                  "D0058C": 0,
                  "D0058D": 26,
                  "D0058E": 0,
                  "D00080": 0,
                  "D0009F": 0,
                  "D007CA": 0,
                  "D008E0": 0,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 0,
                  "D02A40": 0,
                  "VAT_D02590": 0,
                  "VAT_D0259D": 0
                }
              },
              {
                "block": 206597,
                "pc": "0x08C38A",
                "diff": {
                  "D0058C": [
                    0,
                    144
                  ]
                },
                "beforeHook": {
                  "D00587": 0,
                  "D0058C": 144,
                  "D0058D": 26,
                  "D0058E": 0,
                  "D00080": 0,
                  "D0009F": 0,
                  "D007CA": 0,
                  "D008E0": 0,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 0,
                  "D02A40": 0,
                  "VAT_D02590": 0,
                  "VAT_D0259D": 0
                },
                "afterHook": {
                  "D00587": 0,
                  "D0058C": 144,
                  "D0058D": 26,
                  "D0058E": 0,
                  "D00080": 0,
                  "D0009F": 0,
                  "D007CA": 0,
                  "D008E0": 0,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 0,
                  "D02A40": 0,
                  "VAT_D02590": 0,
                  "VAT_D0259D": 0
                }
              },
              {
                "block": 208342,
                "pc": "0x0018F8",
                "diff": {
                  "D0058C": [
                    144,
                    0
                  ],
                  "D0058D": [
                    26,
                    0
                  ]
                },
                "beforeHook": {
                  "D00587": 0,
                  "D0058C": 0,
                  "D0058D": 0,
                  "D0058E": 0,
                  "D00080": 0,
                  "D0009F": 0,
                  "D007CA": 0,
                  "D008E0": 0,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 0,
                  "D02A40": 0,
                  "VAT_D02590": 0,
                  "VAT_D0259D": 0
                },
                "afterHook": {
                  "D00587": 0,
                  "D0058C": 0,
                  "D0058D": 0,
                  "D0058E": 0,
                  "D00080": 0,
                  "D0009F": 0,
                  "D007CA": 0,
                  "D008E0": 0,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 0,
                  "D02A40": 0,
                  "VAT_D02590": 0,
                  "VAT_D0259D": 0
                }
              }
            ]
          },
          "afterState": {
            "status": "Key: 2 → 300000 steps (peak 8754px)",
            "vramPixels": 3040,
            "routeFields": {
              "D00587": 0,
              "D0058C": 0,
              "D0058D": 0,
              "D0058E": 0,
              "D00080": 0,
              "D0009F": 0,
              "D007CA": 361961,
              "D008E0": 0,
              "D02A28": 0,
              "D001B8": 0,
              "D001D3": 0,
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805589,
              "D02A40": 0,
              "VAT_D02590": 13893249,
              "VAT_D0259D": 13893325
            }
          }
        }
      ]
    },
    {
      "label": "autorun-prekey-replay-burst",
      "autoRun": true,
      "replayBeforeEachKey": true,
      "replayOk": true,
      "p6": {
        "steps": 49474,
        "termination": "halt",
        "lastPc": 6581,
        "lastMode": "adl"
      },
      "p6VatLoopHits": 34,
      "afterColdboot": {
        "status": "Coldboot complete. OS event loop is ready.",
        "vramPixels": 8549,
        "replayFields": {
          "D007CA": "0x0585E9",
          "D008E0": "0x000000",
          "D02587": "0xD3A854",
          "D0258A": "0xD3A854",
          "D0258D": "0xD3A854",
          "D02590": "0xD3FE81",
          "D02593": "0xD3FE81",
          "D0259A": "0xD3FE81",
          "D0259D": "0xD3FECD",
          "D025A0": "0xD3A816",
          "D025C5": "0x0C0000"
        },
        "routeFields": {
          "D00587": 0,
          "D0058C": 0,
          "D0058D": 0,
          "D0058E": 0,
          "D00080": 0,
          "D0009F": 0,
          "D007CA": 361961,
          "D008E0": 0,
          "D02A28": 0,
          "D001B8": 0,
          "D001D3": 0,
          "D02A29": 0,
          "D02A2B": 0,
          "D02A1B": 0,
          "D0059A": 0,
          "D01150": 0,
          "D0243D": 13805589,
          "D02A40": 0,
          "VAT_D02590": 13893249,
          "VAT_D0259D": 13893325
        }
      },
      "afterAutoRun": {
        "status": "Coldboot: 50000 steps, max_steps | Total: 687707 | PC=0x006d38",
        "vramPixels": 3031,
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
        }
      },
      "errors": [],
      "keys": [
        {
          "label": "Escape/CLEAR",
          "expected": 15,
          "seeded": true,
          "vatLive": true,
          "answered": true,
          "path": "low-transfer path",
          "preReplayOk": true,
          "summary": {
            "label": "autorun-prekey-replay-burst:Escape/CLEAR",
            "totalBlocks": 349982,
            "tokenHookHits": 0,
            "lowPathHits": 60889,
            "cleanupHits": 3,
            "getCscHits": 2,
            "cxMainHits": 1,
            "keyHandlerHits": 1,
            "loopHits": 2,
            "haltHits": 1,
            "counts": {
              "launch09dd62": 0,
              "memInit09dee0": 0,
              "clear001879": 3,
              "cleanup0018f8": 3,
              "repaint058241": 0,
              "vatLoop084711": 0,
              "vatRewind082be2": 0,
              "halt0019b5": 1,
              "getCsc03fa09": 2,
              "loop08c331": 2,
              "cxMain0585e9": 1,
              "keyHandler05877a": 1,
              "outer08f3b8": 0,
              "tokenReader090883": 0,
              "tokenExit08f5e1": 0,
              "tokenGate090992": 0,
              "tokenStore09098e": 0,
              "eolTuple08f54b": 0,
              "displaySeed013d11": 2,
              "displayLoop0059c6": 389,
              "lowBranch0013fc": 2,
              "low006d38": 20160,
              "low006d4f": 20160,
              "low006d5d": 20176
            },
            "regionCounts": {
              "token08f000_090fff": 0,
              "display090000_091fff": 0,
              "low006d00_006dff": 100864,
              "cleanupLow001000_001fff": 3598,
              "home058000_058fff": 27
            },
            "startFields": {
              "D00587": 0,
              "D0058C": 0,
              "D0058D": 0,
              "D0058E": 0,
              "D00080": 0,
              "D0009F": 0,
              "D007CA": 361961,
              "D008E0": 13740134,
              "D02A28": 0,
              "D001B8": 0,
              "D001D3": 0,
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 0,
              "D02A40": 0,
              "VAT_D02590": 13893249,
              "VAT_D0259D": 13893325
            },
            "endFields": {
              "D00587": 0,
              "D0058C": 0,
              "D0058D": 0,
              "D0058E": 0,
              "D00080": 0,
              "D0009F": 0,
              "D007CA": 0,
              "D008E0": 0,
              "D02A28": 0,
              "D001B8": 0,
              "D001D3": 0,
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 0,
              "D02A40": 0,
              "VAT_D02590": 0,
              "VAT_D0259D": 0
            },
            "status": "Key: CLEAR → 350000 steps (peak 3353px)",
            "firstBlocks": [
              "0x08C331",
              "0x000038",
              "0x0006F3",
              "0x000704",
              "0x000710",
              "0x001713",
              "0x0008BB",
              "0x001717",
              "0x001718",
              "0x000719",
              "0x0019BE",
              "0x0019EF",
              "0x0019F4",
              "0x0019FE",
              "0x001ACF",
              "0x001AD9",
              "0x001ADE",
              "0x001A32"
            ],
            "lastBlocks": [
              "0x000B72",
              "0x000B7F",
              "0x000B72",
              "0x000B7C",
              "0x000B81",
              "0x000B72",
              "0x000B7F",
              "0x000B72",
              "0x000B7F",
              "0x000B83",
              "0x000BCB",
              "0x000BD3",
              "0x000BFE",
              "0x000BFE",
              "0x000BFE",
              "0x000BFE",
              "0x000BFE",
              "0x000BFE"
            ],
            "hotBlocks": [
              {
                "pc": "0x000A92",
                "count": 65024
              },
              {
                "pc": "0x000BFE",
                "count": 51441
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
              }
            ],
            "targetSamples": [
              {
                "block": 1,
                "pc": "0x08C331",
                "target": "loop08c331",
                "before": {
                  "D00587": 0,
                  "D0058C": 15,
                  "D0058D": 15,
                  "D0058E": 15,
                  "D00080": 8,
                  "D0009F": 32,
                  "D007CA": 361961,
                  "D008E0": 13740131,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 0,
                  "D02A40": 0,
                  "VAT_D02590": 13893249,
                  "VAT_D0259D": 13893325
                },
                "runtime": {
                  "lastPc": 574257,
                  "lastMode": "adl",
                  "totalSteps": 687707
                }
              },
              {
                "block": 1553,
                "pc": "0x0585E9",
                "target": "cxMain0585e9",
                "before": {
                  "D00587": 0,
                  "D0058C": 15,
                  "D0058D": 15,
                  "D0058E": 15,
                  "D00080": 8,
                  "D0009F": 0,
                  "D007CA": 361961,
                  "D008E0": 13740131,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 0,
                  "D02A40": 0,
                  "VAT_D02590": 13893249,
                  "VAT_D0259D": 13893325
                },
                "runtime": {
                  "lastPc": 574257,
                  "lastMode": "adl",
                  "totalSteps": 687707
                }
              },
              {
                "block": 1557,
                "pc": "0x05877A",
                "target": "keyHandler05877a",
                "before": {
                  "D00587": 0,
                  "D0058C": 15,
                  "D0058D": 15,
                  "D0058E": 15,
                  "D00080": 8,
                  "D0009F": 0,
                  "D007CA": 361961,
                  "D008E0": 13740131,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 0,
                  "D02A40": 0,
                  "VAT_D02590": 13893249,
                  "VAT_D0259D": 13893325
                },
                "runtime": {
                  "lastPc": 574257,
                  "lastMode": "adl",
                  "totalSteps": 687707
                }
              },
              {
                "block": 2940,
                "pc": "0x03FA09",
                "target": "getCsc03fa09",
                "before": {
                  "D00587": 0,
                  "D0058C": 0,
                  "D0058D": 15,
                  "D0058E": 0,
                  "D00080": 8,
                  "D0009F": 0,
                  "D007CA": 361961,
                  "D008E0": 13740131,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 0,
                  "D02A40": 0,
                  "VAT_D02590": 13893249,
                  "VAT_D0259D": 13893325
                },
                "runtime": {
                  "lastPc": 574257,
                  "lastMode": "adl",
                  "totalSteps": 687707
                }
              },
              {
                "block": 4080,
                "pc": "0x001879",
                "target": "clear001879",
                "before": {
                  "D00587": 0,
                  "D0058C": 0,
                  "D0058D": 15,
                  "D0058E": 0,
                  "D00080": 0,
                  "D0009F": 0,
                  "D007CA": 361961,
                  "D008E0": 13740131,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 0,
                  "D02A40": 0,
                  "VAT_D02590": 13893249,
                  "VAT_D0259D": 13893325
                },
                "runtime": {
                  "lastPc": 574257,
                  "lastMode": "adl",
                  "totalSteps": 687707
                }
              },
              {
                "block": 4081,
                "pc": "0x0018F8",
                "target": "cleanup0018f8",
                "before": {
                  "D00587": 0,
                  "D0058C": 0,
                  "D0058D": 0,
                  "D0058E": 0,
                  "D00080": 0,
                  "D0009F": 0,
                  "D007CA": 0,
                  "D008E0": 0,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 0,
                  "D02A40": 0,
                  "VAT_D02590": 0,
                  "VAT_D0259D": 0
                },
                "runtime": {
                  "lastPc": 574257,
                  "lastMode": "adl",
                  "totalSteps": 687707
                }
              },
              {
                "block": 5729,
                "pc": "0x0013FC",
                "target": "lowBranch0013fc",
                "before": {
                  "D00587": 0,
                  "D0058C": 0,
                  "D0058D": 0,
                  "D0058E": 0,
                  "D00080": 0,
                  "D0009F": 0,
                  "D007CA": 0,
                  "D008E0": 0,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 0,
                  "D02A40": 0,
                  "VAT_D02590": 0,
                  "VAT_D0259D": 0
                },
                "runtime": {
                  "lastPc": 574257,
                  "lastMode": "adl",
                  "totalSteps": 687707
                }
              },
              {
                "block": 5745,
                "pc": "0x013D11",
                "target": "displaySeed013d11",
                "before": {
                  "D00587": 0,
                  "D0058C": 0,
                  "D0058D": 0,
                  "D0058E": 0,
                  "D00080": 0,
                  "D0009F": 0,
                  "D007CA": 0,
                  "D008E0": 0,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 0,
                  "D02A40": 0,
                  "VAT_D02590": 0,
                  "VAT_D0259D": 0
                },
                "runtime": {
                  "lastPc": 574257,
                  "lastMode": "adl",
                  "totalSteps": 687707
                }
              },
              {
                "block": 5746,
                "pc": "0x0059C6",
                "target": "displayLoop0059c6",
                "before": {
                  "D00587": 0,
                  "D0058C": 0,
                  "D0058D": 0,
                  "D0058E": 0,
                  "D00080": 0,
                  "D0009F": 0,
                  "D007CA": 0,
                  "D008E0": 0,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 0,
                  "D02A40": 0,
                  "VAT_D02590": 0,
                  "VAT_D0259D": 0
                },
                "runtime": {
                  "lastPc": 574257,
                  "lastMode": "adl",
                  "totalSteps": 687707
                }
              },
              {
                "block": 5832,
                "pc": "0x0059C6",
                "target": "displayLoop0059c6",
                "before": {
                  "D00587": 0,
                  "D0058C": 0,
                  "D0058D": 0,
                  "D0058E": 0,
                  "D00080": 0,
                  "D0009F": 0,
                  "D007CA": 0,
                  "D008E0": 0,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 0,
                  "D02A40": 0,
                  "VAT_D02590": 0,
                  "VAT_D0259D": 0
                },
                "runtime": {
                  "lastPc": 574257,
                  "lastMode": "adl",
                  "totalSteps": 687707
                }
              },
              {
                "block": 5918,
                "pc": "0x0059C6",
                "target": "displayLoop0059c6",
                "before": {
                  "D00587": 0,
                  "D0058C": 0,
                  "D0058D": 0,
                  "D0058E": 0,
                  "D00080": 0,
                  "D0009F": 0,
                  "D007CA": 0,
                  "D008E0": 0,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 0,
                  "D02A40": 0,
                  "VAT_D02590": 0,
                  "VAT_D0259D": 0
                },
                "runtime": {
                  "lastPc": 574257,
                  "lastMode": "adl",
                  "totalSteps": 687707
                }
              },
              {
                "block": 6004,
                "pc": "0x0059C6",
                "target": "displayLoop0059c6",
                "before": {
                  "D00587": 0,
                  "D0058C": 0,
                  "D0058D": 0,
                  "D0058E": 0,
                  "D00080": 0,
                  "D0009F": 0,
                  "D007CA": 0,
                  "D008E0": 0,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 0,
                  "D02A40": 0,
                  "VAT_D02590": 0,
                  "VAT_D0259D": 0
                },
                "runtime": {
                  "lastPc": 574257,
                  "lastMode": "adl",
                  "totalSteps": 687707
                }
              },
              {
                "block": 13388,
                "pc": "0x006D5D",
                "target": "low006d5d",
                "before": {
                  "D00587": 0,
                  "D0058C": 0,
                  "D0058D": 0,
                  "D0058E": 0,
                  "D00080": 0,
                  "D0009F": 0,
                  "D007CA": 0,
                  "D008E0": 0,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 0,
                  "D02A40": 0,
                  "VAT_D02590": 0,
                  "VAT_D0259D": 0
                },
                "runtime": {
                  "lastPc": 574257,
                  "lastMode": "adl",
                  "totalSteps": 687707
                }
              },
              {
                "block": 13394,
                "pc": "0x006D38",
                "target": "low006d38",
                "before": {
                  "D00587": 0,
                  "D0058C": 0,
                  "D0058D": 0,
                  "D0058E": 0,
                  "D00080": 0,
                  "D0009F": 0,
                  "D007CA": 0,
                  "D008E0": 0,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 0,
                  "D02A40": 0,
                  "VAT_D02590": 0,
                  "VAT_D0259D": 0
                },
                "runtime": {
                  "lastPc": 574257,
                  "lastMode": "adl",
                  "totalSteps": 687707
                }
              },
              {
                "block": 13395,
                "pc": "0x006D4F",
                "target": "low006d4f",
                "before": {
                  "D00587": 0,
                  "D0058C": 0,
                  "D0058D": 0,
                  "D0058E": 0,
                  "D00080": 0,
                  "D0009F": 0,
                  "D007CA": 0,
                  "D008E0": 0,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 0,
                  "D02A40": 0,
                  "VAT_D02590": 0,
                  "VAT_D0259D": 0
                },
                "runtime": {
                  "lastPc": 574257,
                  "lastMode": "adl",
                  "totalSteps": 687707
                }
              },
              {
                "block": 13396,
                "pc": "0x006D5D",
                "target": "low006d5d",
                "before": {
                  "D00587": 0,
                  "D0058C": 0,
                  "D0058D": 0,
                  "D0058E": 0,
                  "D00080": 0,
                  "D0009F": 0,
                  "D007CA": 0,
                  "D008E0": 0,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 0,
                  "D02A40": 0,
                  "VAT_D02590": 0,
                  "VAT_D0259D": 0
                },
                "runtime": {
                  "lastPc": 574257,
                  "lastMode": "adl",
                  "totalSteps": 687707
                }
              },
              {
                "block": 13402,
                "pc": "0x006D38",
                "target": "low006d38",
                "before": {
                  "D00587": 0,
                  "D0058C": 0,
                  "D0058D": 0,
                  "D0058E": 0,
                  "D00080": 0,
                  "D0009F": 0,
                  "D007CA": 0,
                  "D008E0": 0,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 0,
                  "D02A40": 0,
                  "VAT_D02590": 0,
                  "VAT_D0259D": 0
                },
                "runtime": {
                  "lastPc": 574257,
                  "lastMode": "adl",
                  "totalSteps": 687707
                }
              },
              {
                "block": 13403,
                "pc": "0x006D4F",
                "target": "low006d4f",
                "before": {
                  "D00587": 0,
                  "D0058C": 0,
                  "D0058D": 0,
                  "D0058E": 0,
                  "D00080": 0,
                  "D0009F": 0,
                  "D007CA": 0,
                  "D008E0": 0,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 0,
                  "D02A40": 0,
                  "VAT_D02590": 0,
                  "VAT_D0259D": 0
                },
                "runtime": {
                  "lastPc": 574257,
                  "lastMode": "adl",
                  "totalSteps": 687707
                }
              }
            ],
            "fieldTransitions": [
              {
                "block": 1,
                "pc": "0x08C331",
                "diff": {
                  "D0058C": [
                    0,
                    15
                  ],
                  "D0058D": [
                    0,
                    15
                  ],
                  "D0058E": [
                    0,
                    15
                  ],
                  "D00080": [
                    0,
                    8
                  ],
                  "D0009F": [
                    0,
                    32
                  ],
                  "D008E0": [
                    13740134,
                    13740131
                  ]
                },
                "beforeHook": {
                  "D00587": 0,
                  "D0058C": 15,
                  "D0058D": 15,
                  "D0058E": 15,
                  "D00080": 8,
                  "D0009F": 32,
                  "D007CA": 361961,
                  "D008E0": 13740131,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 0,
                  "D02A40": 0,
                  "VAT_D02590": 13893249,
                  "VAT_D0259D": 13893325
                },
                "afterHook": {
                  "D00587": 0,
                  "D0058C": 15,
                  "D0058D": 15,
                  "D0058E": 15,
                  "D00080": 8,
                  "D0009F": 32,
                  "D007CA": 361961,
                  "D008E0": 13740131,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 0,
                  "D02A40": 0,
                  "VAT_D02590": 13893249,
                  "VAT_D0259D": 13893325
                }
              },
              {
                "block": 761,
                "pc": "0x08C366",
                "diff": {
                  "D0009F": [
                    32,
                    0
                  ]
                },
                "beforeHook": {
                  "D00587": 0,
                  "D0058C": 15,
                  "D0058D": 15,
                  "D0058E": 15,
                  "D00080": 8,
                  "D0009F": 0,
                  "D007CA": 361961,
                  "D008E0": 13740131,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 0,
                  "D02A40": 0,
                  "VAT_D02590": 13893249,
                  "VAT_D0259D": 13893325
                },
                "afterHook": {
                  "D00587": 0,
                  "D0058C": 15,
                  "D0058D": 15,
                  "D0058E": 15,
                  "D00080": 8,
                  "D0009F": 0,
                  "D007CA": 361961,
                  "D008E0": 13740131,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 0,
                  "D02A40": 0,
                  "VAT_D02590": 13893249,
                  "VAT_D0259D": 13893325
                }
              },
              {
                "block": 2332,
                "pc": "0x02FCB3",
                "diff": {
                  "D0058C": [
                    15,
                    0
                  ],
                  "D0058E": [
                    15,
                    0
                  ]
                },
                "beforeHook": {
                  "D00587": 0,
                  "D0058C": 0,
                  "D0058D": 15,
                  "D0058E": 0,
                  "D00080": 8,
                  "D0009F": 0,
                  "D007CA": 361961,
                  "D008E0": 13740131,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 0,
                  "D02A40": 0,
                  "VAT_D02590": 13893249,
                  "VAT_D0259D": 13893325
                },
                "afterHook": {
                  "D00587": 0,
                  "D0058C": 0,
                  "D0058D": 15,
                  "D0058E": 0,
                  "D00080": 8,
                  "D0009F": 0,
                  "D007CA": 361961,
                  "D008E0": 13740131,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 0,
                  "D02A40": 0,
                  "VAT_D02590": 13893249,
                  "VAT_D0259D": 13893325
                }
              },
              {
                "block": 2941,
                "pc": "0x000038",
                "diff": {
                  "D00080": [
                    8,
                    0
                  ]
                },
                "beforeHook": {
                  "D00587": 0,
                  "D0058C": 0,
                  "D0058D": 15,
                  "D0058E": 0,
                  "D00080": 0,
                  "D0009F": 0,
                  "D007CA": 361961,
                  "D008E0": 13740131,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 0,
                  "D02A40": 0,
                  "VAT_D02590": 13893249,
                  "VAT_D0259D": 13893325
                },
                "afterHook": {
                  "D00587": 0,
                  "D0058C": 0,
                  "D0058D": 15,
                  "D0058E": 0,
                  "D00080": 0,
                  "D0009F": 0,
                  "D007CA": 361961,
                  "D008E0": 13740131,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 0,
                  "D02A40": 0,
                  "VAT_D02590": 13893249,
                  "VAT_D0259D": 13893325
                }
              },
              {
                "block": 4081,
                "pc": "0x0018F8",
                "diff": {
                  "D0058D": [
                    15,
                    0
                  ],
                  "D007CA": [
                    361961,
                    0
                  ],
                  "D008E0": [
                    13740131,
                    0
                  ],
                  "VAT_D02590": [
                    13893249,
                    0
                  ],
                  "VAT_D0259D": [
                    13893325,
                    0
                  ]
                },
                "beforeHook": {
                  "D00587": 0,
                  "D0058C": 0,
                  "D0058D": 0,
                  "D0058E": 0,
                  "D00080": 0,
                  "D0009F": 0,
                  "D007CA": 0,
                  "D008E0": 0,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 0,
                  "D02A40": 0,
                  "VAT_D02590": 0,
                  "VAT_D0259D": 0
                },
                "afterHook": {
                  "D00587": 0,
                  "D0058C": 0,
                  "D0058D": 0,
                  "D0058E": 0,
                  "D00080": 0,
                  "D0009F": 0,
                  "D007CA": 0,
                  "D008E0": 0,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 0,
                  "D02A40": 0,
                  "VAT_D02590": 0,
                  "VAT_D0259D": 0
                }
              }
            ]
          },
          "afterState": {
            "status": "Key: CLEAR → 350000 steps (peak 3353px)",
            "vramPixels": 3039,
            "routeFields": {
              "D00587": 0,
              "D0058C": 0,
              "D0058D": 0,
              "D0058E": 0,
              "D00080": 0,
              "D0009F": 0,
              "D007CA": 361961,
              "D008E0": 0,
              "D02A28": 0,
              "D001B8": 0,
              "D001D3": 0,
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805589,
              "D02A40": 0,
              "VAT_D02590": 13893249,
              "VAT_D0259D": 13893325
            }
          }
        },
        {
          "label": "Digit2",
          "expected": 144,
          "seeded": true,
          "vatLive": true,
          "answered": true,
          "path": "low-transfer path",
          "preReplayOk": true,
          "summary": {
            "label": "autorun-prekey-replay-burst:Digit2",
            "totalBlocks": 299976,
            "tokenHookHits": 0,
            "lowPathHits": 60889,
            "cleanupHits": 3,
            "getCscHits": 3,
            "cxMainHits": 2,
            "keyHandlerHits": 2,
            "loopHits": 2,
            "haltHits": 1,
            "counts": {
              "launch09dd62": 0,
              "memInit09dee0": 0,
              "clear001879": 3,
              "cleanup0018f8": 3,
              "repaint058241": 0,
              "vatLoop084711": 0,
              "vatRewind082be2": 0,
              "halt0019b5": 1,
              "getCsc03fa09": 3,
              "loop08c331": 2,
              "cxMain0585e9": 2,
              "keyHandler05877a": 2,
              "outer08f3b8": 0,
              "tokenReader090883": 0,
              "tokenExit08f5e1": 0,
              "tokenGate090992": 0,
              "tokenStore09098e": 0,
              "eolTuple08f54b": 0,
              "displaySeed013d11": 2,
              "displayLoop0059c6": 389,
              "lowBranch0013fc": 2,
              "low006d38": 20160,
              "low006d4f": 20160,
              "low006d5d": 20176
            },
            "regionCounts": {
              "token08f000_090fff": 0,
              "display090000_091fff": 0,
              "low006d00_006dff": 100864,
              "cleanupLow001000_001fff": 3684,
              "home058000_058fff": 98
            },
            "startFields": {
              "D00587": 0,
              "D0058C": 0,
              "D0058D": 0,
              "D0058E": 0,
              "D00080": 0,
              "D0009F": 0,
              "D007CA": 361961,
              "D008E0": 13740134,
              "D02A28": 0,
              "D001B8": 0,
              "D001D3": 0,
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 0,
              "D02A40": 0,
              "VAT_D02590": 13893249,
              "VAT_D0259D": 13893325
            },
            "endFields": {
              "D00587": 0,
              "D0058C": 0,
              "D0058D": 0,
              "D0058E": 0,
              "D00080": 0,
              "D0009F": 0,
              "D007CA": 0,
              "D008E0": 0,
              "D02A28": 0,
              "D001B8": 0,
              "D001D3": 0,
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 0,
              "D02A40": 0,
              "VAT_D02590": 0,
              "VAT_D0259D": 0
            },
            "status": "Key: 2 → 300000 steps (peak 3359px)",
            "firstBlocks": [
              "0x08C331",
              "0x000038",
              "0x0006F3",
              "0x000704",
              "0x000710",
              "0x001713",
              "0x0008BB",
              "0x001717",
              "0x001718",
              "0x000719",
              "0x0019BE",
              "0x0019EF",
              "0x0019F4",
              "0x0019FE",
              "0x001ACF",
              "0x001AD9",
              "0x001ADE",
              "0x001A32"
            ],
            "lastBlocks": [
              "0x000A92",
              "0x000A92",
              "0x000A92",
              "0x000A92",
              "0x000A92",
              "0x000A92",
              "0x000A92",
              "0x000A92",
              "0x000A92",
              "0x000A92",
              "0x000A92",
              "0x000A92",
              "0x000A92",
              "0x000A92",
              "0x000A92",
              "0x000A92",
              "0x000A92",
              "0x000A92"
            ],
            "hotBlocks": [
              {
                "pc": "0x000A92",
                "count": 40078
              },
              {
                "pc": "0x000BFE",
                "count": 32258
              },
              {
                "pc": "0x0021C2",
                "count": 20182
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
              }
            ],
            "targetSamples": [
              {
                "block": 1,
                "pc": "0x08C331",
                "target": "loop08c331",
                "before": {
                  "D00587": 26,
                  "D0058C": 144,
                  "D0058D": 144,
                  "D0058E": 144,
                  "D00080": 8,
                  "D0009F": 32,
                  "D007CA": 361961,
                  "D008E0": 13740131,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 0,
                  "D02A40": 0,
                  "VAT_D02590": 13893249,
                  "VAT_D0259D": 13893325
                },
                "runtime": {
                  "lastPc": 574257,
                  "lastMode": "adl",
                  "totalSteps": 1037707
                }
              },
              {
                "block": 1575,
                "pc": "0x0585E9",
                "target": "cxMain0585e9",
                "before": {
                  "D00587": 26,
                  "D0058C": 144,
                  "D0058D": 144,
                  "D0058E": 144,
                  "D00080": 8,
                  "D0009F": 0,
                  "D007CA": 361961,
                  "D008E0": 13740131,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 0,
                  "D02A40": 0,
                  "VAT_D02590": 13893249,
                  "VAT_D0259D": 13893325
                },
                "runtime": {
                  "lastPc": 574257,
                  "lastMode": "adl",
                  "totalSteps": 1037707
                }
              },
              {
                "block": 1579,
                "pc": "0x05877A",
                "target": "keyHandler05877a",
                "before": {
                  "D00587": 26,
                  "D0058C": 144,
                  "D0058D": 144,
                  "D0058E": 144,
                  "D00080": 8,
                  "D0009F": 0,
                  "D007CA": 361961,
                  "D008E0": 13740131,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 0,
                  "D02A40": 0,
                  "VAT_D02590": 13893249,
                  "VAT_D0259D": 13893325
                },
                "runtime": {
                  "lastPc": 574257,
                  "lastMode": "adl",
                  "totalSteps": 1037707
                }
              },
              {
                "block": 3031,
                "pc": "0x03FA09",
                "target": "getCsc03fa09",
                "before": {
                  "D00587": 26,
                  "D0058C": 0,
                  "D0058D": 144,
                  "D0058E": 0,
                  "D00080": 8,
                  "D0009F": 0,
                  "D007CA": 361961,
                  "D008E0": 13740131,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 0,
                  "D02A40": 0,
                  "VAT_D02590": 13893249,
                  "VAT_D0259D": 13893325
                },
                "runtime": {
                  "lastPc": 574257,
                  "lastMode": "adl",
                  "totalSteps": 1037707
                }
              },
              {
                "block": 3922,
                "pc": "0x0585E9",
                "target": "cxMain0585e9",
                "before": {
                  "D00587": 0,
                  "D0058C": 144,
                  "D0058D": 144,
                  "D0058E": 0,
                  "D00080": 0,
                  "D0009F": 0,
                  "D007CA": 361961,
                  "D008E0": 13740131,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 0,
                  "D02A40": 0,
                  "VAT_D02590": 13893249,
                  "VAT_D0259D": 13893325
                },
                "runtime": {
                  "lastPc": 574257,
                  "lastMode": "adl",
                  "totalSteps": 1037707
                }
              },
              {
                "block": 3926,
                "pc": "0x05877A",
                "target": "keyHandler05877a",
                "before": {
                  "D00587": 0,
                  "D0058C": 144,
                  "D0058D": 144,
                  "D0058E": 0,
                  "D00080": 0,
                  "D0009F": 0,
                  "D007CA": 361961,
                  "D008E0": 13740131,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 0,
                  "D02A40": 0,
                  "VAT_D02590": 13893249,
                  "VAT_D0259D": 13893325
                },
                "runtime": {
                  "lastPc": 574257,
                  "lastMode": "adl",
                  "totalSteps": 1037707
                }
              },
              {
                "block": 5361,
                "pc": "0x03FA09",
                "target": "getCsc03fa09",
                "before": {
                  "D00587": 0,
                  "D0058C": 0,
                  "D0058D": 144,
                  "D0058E": 0,
                  "D00080": 0,
                  "D0009F": 0,
                  "D007CA": 361961,
                  "D008E0": 13740131,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 0,
                  "D02A40": 0,
                  "VAT_D02590": 13893249,
                  "VAT_D0259D": 13893325
                },
                "runtime": {
                  "lastPc": 574257,
                  "lastMode": "adl",
                  "totalSteps": 1037707
                }
              },
              {
                "block": 6499,
                "pc": "0x001879",
                "target": "clear001879",
                "before": {
                  "D00587": 0,
                  "D0058C": 0,
                  "D0058D": 144,
                  "D0058E": 0,
                  "D00080": 0,
                  "D0009F": 0,
                  "D007CA": 361961,
                  "D008E0": 13740131,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 0,
                  "D02A40": 0,
                  "VAT_D02590": 13893249,
                  "VAT_D0259D": 13893325
                },
                "runtime": {
                  "lastPc": 574257,
                  "lastMode": "adl",
                  "totalSteps": 1037707
                }
              },
              {
                "block": 6500,
                "pc": "0x0018F8",
                "target": "cleanup0018f8",
                "before": {
                  "D00587": 0,
                  "D0058C": 0,
                  "D0058D": 0,
                  "D0058E": 0,
                  "D00080": 0,
                  "D0009F": 0,
                  "D007CA": 0,
                  "D008E0": 0,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 0,
                  "D02A40": 0,
                  "VAT_D02590": 0,
                  "VAT_D0259D": 0
                },
                "runtime": {
                  "lastPc": 574257,
                  "lastMode": "adl",
                  "totalSteps": 1037707
                }
              },
              {
                "block": 8148,
                "pc": "0x0013FC",
                "target": "lowBranch0013fc",
                "before": {
                  "D00587": 0,
                  "D0058C": 0,
                  "D0058D": 0,
                  "D0058E": 0,
                  "D00080": 0,
                  "D0009F": 0,
                  "D007CA": 0,
                  "D008E0": 0,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 0,
                  "D02A40": 0,
                  "VAT_D02590": 0,
                  "VAT_D0259D": 0
                },
                "runtime": {
                  "lastPc": 574257,
                  "lastMode": "adl",
                  "totalSteps": 1037707
                }
              },
              {
                "block": 8187,
                "pc": "0x013D11",
                "target": "displaySeed013d11",
                "before": {
                  "D00587": 0,
                  "D0058C": 0,
                  "D0058D": 0,
                  "D0058E": 0,
                  "D00080": 0,
                  "D0009F": 0,
                  "D007CA": 0,
                  "D008E0": 0,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 0,
                  "D02A40": 0,
                  "VAT_D02590": 0,
                  "VAT_D0259D": 0
                },
                "runtime": {
                  "lastPc": 574257,
                  "lastMode": "adl",
                  "totalSteps": 1037707
                }
              },
              {
                "block": 8188,
                "pc": "0x0059C6",
                "target": "displayLoop0059c6",
                "before": {
                  "D00587": 0,
                  "D0058C": 0,
                  "D0058D": 0,
                  "D0058E": 0,
                  "D00080": 0,
                  "D0009F": 0,
                  "D007CA": 0,
                  "D008E0": 0,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 0,
                  "D02A40": 0,
                  "VAT_D02590": 0,
                  "VAT_D0259D": 0
                },
                "runtime": {
                  "lastPc": 574257,
                  "lastMode": "adl",
                  "totalSteps": 1037707
                }
              },
              {
                "block": 8274,
                "pc": "0x0059C6",
                "target": "displayLoop0059c6",
                "before": {
                  "D00587": 0,
                  "D0058C": 0,
                  "D0058D": 0,
                  "D0058E": 0,
                  "D00080": 0,
                  "D0009F": 0,
                  "D007CA": 0,
                  "D008E0": 0,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 0,
                  "D02A40": 0,
                  "VAT_D02590": 0,
                  "VAT_D0259D": 0
                },
                "runtime": {
                  "lastPc": 574257,
                  "lastMode": "adl",
                  "totalSteps": 1037707
                }
              },
              {
                "block": 8360,
                "pc": "0x0059C6",
                "target": "displayLoop0059c6",
                "before": {
                  "D00587": 0,
                  "D0058C": 0,
                  "D0058D": 0,
                  "D0058E": 0,
                  "D00080": 0,
                  "D0009F": 0,
                  "D007CA": 0,
                  "D008E0": 0,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 0,
                  "D02A40": 0,
                  "VAT_D02590": 0,
                  "VAT_D0259D": 0
                },
                "runtime": {
                  "lastPc": 574257,
                  "lastMode": "adl",
                  "totalSteps": 1037707
                }
              },
              {
                "block": 8446,
                "pc": "0x0059C6",
                "target": "displayLoop0059c6",
                "before": {
                  "D00587": 0,
                  "D0058C": 0,
                  "D0058D": 0,
                  "D0058E": 0,
                  "D00080": 0,
                  "D0009F": 0,
                  "D007CA": 0,
                  "D008E0": 0,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 0,
                  "D02A40": 0,
                  "VAT_D02590": 0,
                  "VAT_D0259D": 0
                },
                "runtime": {
                  "lastPc": 574257,
                  "lastMode": "adl",
                  "totalSteps": 1037707
                }
              },
              {
                "block": 15830,
                "pc": "0x006D5D",
                "target": "low006d5d",
                "before": {
                  "D00587": 0,
                  "D0058C": 0,
                  "D0058D": 0,
                  "D0058E": 0,
                  "D00080": 0,
                  "D0009F": 0,
                  "D007CA": 0,
                  "D008E0": 0,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 0,
                  "D02A40": 0,
                  "VAT_D02590": 0,
                  "VAT_D0259D": 0
                },
                "runtime": {
                  "lastPc": 574257,
                  "lastMode": "adl",
                  "totalSteps": 1037707
                }
              },
              {
                "block": 15836,
                "pc": "0x006D38",
                "target": "low006d38",
                "before": {
                  "D00587": 0,
                  "D0058C": 0,
                  "D0058D": 0,
                  "D0058E": 0,
                  "D00080": 0,
                  "D0009F": 0,
                  "D007CA": 0,
                  "D008E0": 0,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 0,
                  "D02A40": 0,
                  "VAT_D02590": 0,
                  "VAT_D0259D": 0
                },
                "runtime": {
                  "lastPc": 574257,
                  "lastMode": "adl",
                  "totalSteps": 1037707
                }
              },
              {
                "block": 15837,
                "pc": "0x006D4F",
                "target": "low006d4f",
                "before": {
                  "D00587": 0,
                  "D0058C": 0,
                  "D0058D": 0,
                  "D0058E": 0,
                  "D00080": 0,
                  "D0009F": 0,
                  "D007CA": 0,
                  "D008E0": 0,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 0,
                  "D02A40": 0,
                  "VAT_D02590": 0,
                  "VAT_D0259D": 0
                },
                "runtime": {
                  "lastPc": 574257,
                  "lastMode": "adl",
                  "totalSteps": 1037707
                }
              }
            ],
            "fieldTransitions": [
              {
                "block": 1,
                "pc": "0x08C331",
                "diff": {
                  "D00587": [
                    0,
                    26
                  ],
                  "D0058C": [
                    0,
                    144
                  ],
                  "D0058D": [
                    0,
                    144
                  ],
                  "D0058E": [
                    0,
                    144
                  ],
                  "D00080": [
                    0,
                    8
                  ],
                  "D0009F": [
                    0,
                    32
                  ],
                  "D008E0": [
                    13740134,
                    13740131
                  ]
                },
                "beforeHook": {
                  "D00587": 26,
                  "D0058C": 144,
                  "D0058D": 144,
                  "D0058E": 144,
                  "D00080": 8,
                  "D0009F": 32,
                  "D007CA": 361961,
                  "D008E0": 13740131,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 0,
                  "D02A40": 0,
                  "VAT_D02590": 13893249,
                  "VAT_D0259D": 13893325
                },
                "afterHook": {
                  "D00587": 26,
                  "D0058C": 144,
                  "D0058D": 144,
                  "D0058E": 144,
                  "D00080": 8,
                  "D0009F": 32,
                  "D007CA": 361961,
                  "D008E0": 13740131,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 0,
                  "D02A40": 0,
                  "VAT_D02590": 13893249,
                  "VAT_D0259D": 13893325
                }
              },
              {
                "block": 763,
                "pc": "0x08C366",
                "diff": {
                  "D0009F": [
                    32,
                    0
                  ]
                },
                "beforeHook": {
                  "D00587": 26,
                  "D0058C": 144,
                  "D0058D": 144,
                  "D0058E": 144,
                  "D00080": 8,
                  "D0009F": 0,
                  "D007CA": 361961,
                  "D008E0": 13740131,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 0,
                  "D02A40": 0,
                  "VAT_D02590": 13893249,
                  "VAT_D0259D": 13893325
                },
                "afterHook": {
                  "D00587": 26,
                  "D0058C": 144,
                  "D0058D": 144,
                  "D0058E": 144,
                  "D00080": 8,
                  "D0009F": 0,
                  "D007CA": 361961,
                  "D008E0": 13740131,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 0,
                  "D02A40": 0,
                  "VAT_D02590": 13893249,
                  "VAT_D0259D": 13893325
                }
              },
              {
                "block": 2423,
                "pc": "0x02FCB3",
                "diff": {
                  "D0058C": [
                    144,
                    0
                  ],
                  "D0058E": [
                    144,
                    0
                  ]
                },
                "beforeHook": {
                  "D00587": 26,
                  "D0058C": 0,
                  "D0058D": 144,
                  "D0058E": 0,
                  "D00080": 8,
                  "D0009F": 0,
                  "D007CA": 361961,
                  "D008E0": 13740131,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 0,
                  "D02A40": 0,
                  "VAT_D02590": 13893249,
                  "VAT_D0259D": 13893325
                },
                "afterHook": {
                  "D00587": 26,
                  "D0058C": 0,
                  "D0058D": 144,
                  "D0058E": 0,
                  "D00080": 8,
                  "D0009F": 0,
                  "D007CA": 361961,
                  "D008E0": 13740131,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 0,
                  "D02A40": 0,
                  "VAT_D02590": 13893249,
                  "VAT_D0259D": 13893325
                }
              },
              {
                "block": 3032,
                "pc": "0x000038",
                "diff": {
                  "D00587": [
                    26,
                    0
                  ],
                  "D00080": [
                    8,
                    0
                  ]
                },
                "beforeHook": {
                  "D00587": 0,
                  "D0058C": 0,
                  "D0058D": 144,
                  "D0058E": 0,
                  "D00080": 0,
                  "D0009F": 0,
                  "D007CA": 361961,
                  "D008E0": 13740131,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 0,
                  "D02A40": 0,
                  "VAT_D02590": 13893249,
                  "VAT_D0259D": 13893325
                },
                "afterHook": {
                  "D00587": 0,
                  "D0058C": 0,
                  "D0058D": 144,
                  "D0058E": 0,
                  "D00080": 0,
                  "D0009F": 0,
                  "D007CA": 361961,
                  "D008E0": 13740131,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 0,
                  "D02A40": 0,
                  "VAT_D02590": 13893249,
                  "VAT_D0259D": 13893325
                }
              },
              {
                "block": 3094,
                "pc": "0x08C38A",
                "diff": {
                  "D0058C": [
                    0,
                    144
                  ]
                },
                "beforeHook": {
                  "D00587": 0,
                  "D0058C": 144,
                  "D0058D": 144,
                  "D0058E": 0,
                  "D00080": 0,
                  "D0009F": 0,
                  "D007CA": 361961,
                  "D008E0": 13740131,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 0,
                  "D02A40": 0,
                  "VAT_D02590": 13893249,
                  "VAT_D0259D": 13893325
                },
                "afterHook": {
                  "D00587": 0,
                  "D0058C": 144,
                  "D0058D": 144,
                  "D0058E": 0,
                  "D00080": 0,
                  "D0009F": 0,
                  "D007CA": 361961,
                  "D008E0": 13740131,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 0,
                  "D02A40": 0,
                  "VAT_D02590": 13893249,
                  "VAT_D0259D": 13893325
                }
              },
              {
                "block": 4753,
                "pc": "0x02FCB3",
                "diff": {
                  "D0058C": [
                    144,
                    0
                  ]
                },
                "beforeHook": {
                  "D00587": 0,
                  "D0058C": 0,
                  "D0058D": 144,
                  "D0058E": 0,
                  "D00080": 0,
                  "D0009F": 0,
                  "D007CA": 361961,
                  "D008E0": 13740131,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 0,
                  "D02A40": 0,
                  "VAT_D02590": 13893249,
                  "VAT_D0259D": 13893325
                },
                "afterHook": {
                  "D00587": 0,
                  "D0058C": 0,
                  "D0058D": 144,
                  "D0058E": 0,
                  "D00080": 0,
                  "D0009F": 0,
                  "D007CA": 361961,
                  "D008E0": 13740131,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 0,
                  "D02A40": 0,
                  "VAT_D02590": 13893249,
                  "VAT_D0259D": 13893325
                }
              },
              {
                "block": 6500,
                "pc": "0x0018F8",
                "diff": {
                  "D0058D": [
                    144,
                    0
                  ],
                  "D007CA": [
                    361961,
                    0
                  ],
                  "D008E0": [
                    13740131,
                    0
                  ],
                  "VAT_D02590": [
                    13893249,
                    0
                  ],
                  "VAT_D0259D": [
                    13893325,
                    0
                  ]
                },
                "beforeHook": {
                  "D00587": 0,
                  "D0058C": 0,
                  "D0058D": 0,
                  "D0058E": 0,
                  "D00080": 0,
                  "D0009F": 0,
                  "D007CA": 0,
                  "D008E0": 0,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 0,
                  "D02A40": 0,
                  "VAT_D02590": 0,
                  "VAT_D0259D": 0
                },
                "afterHook": {
                  "D00587": 0,
                  "D0058C": 0,
                  "D0058D": 0,
                  "D0058E": 0,
                  "D00080": 0,
                  "D0009F": 0,
                  "D007CA": 0,
                  "D008E0": 0,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 0,
                  "D02A40": 0,
                  "VAT_D02590": 0,
                  "VAT_D0259D": 0
                }
              },
              {
                "block": 198376,
                "pc": "0x03FA04",
                "diff": {
                  "D00587": [
                    0,
                    26
                  ],
                  "D00080": [
                    0,
                    8
                  ]
                },
                "beforeHook": {
                  "D00587": 26,
                  "D0058C": 0,
                  "D0058D": 0,
                  "D0058E": 0,
                  "D00080": 8,
                  "D0009F": 0,
                  "D007CA": 0,
                  "D008E0": 0,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 0,
                  "D02A40": 0,
                  "VAT_D02590": 0,
                  "VAT_D0259D": 0
                },
                "afterHook": {
                  "D00587": 26,
                  "D0058C": 0,
                  "D0058D": 0,
                  "D0058E": 0,
                  "D00080": 8,
                  "D0009F": 0,
                  "D007CA": 0,
                  "D008E0": 0,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 0,
                  "D02A40": 0,
                  "VAT_D02590": 0,
                  "VAT_D0259D": 0
                }
              },
              {
                "block": 198377,
                "pc": "0x03F9D5",
                "diff": {
                  "D0058D": [
                    0,
                    26
                  ]
                },
                "beforeHook": {
                  "D00587": 26,
                  "D0058C": 0,
                  "D0058D": 26,
                  "D0058E": 0,
                  "D00080": 8,
                  "D0009F": 0,
                  "D007CA": 0,
                  "D008E0": 0,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 0,
                  "D02A40": 0,
                  "VAT_D02590": 0,
                  "VAT_D0259D": 0
                },
                "afterHook": {
                  "D00587": 26,
                  "D0058C": 0,
                  "D0058D": 26,
                  "D0058E": 0,
                  "D00080": 8,
                  "D0009F": 0,
                  "D007CA": 0,
                  "D008E0": 0,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 0,
                  "D02A40": 0,
                  "VAT_D02590": 0,
                  "VAT_D0259D": 0
                }
              },
              {
                "block": 198379,
                "pc": "0x03D058",
                "diff": {
                  "D00080": [
                    8,
                    24
                  ]
                },
                "beforeHook": {
                  "D00587": 26,
                  "D0058C": 0,
                  "D0058D": 26,
                  "D0058E": 0,
                  "D00080": 24,
                  "D0009F": 0,
                  "D007CA": 0,
                  "D008E0": 0,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 0,
                  "D02A40": 0,
                  "VAT_D02590": 0,
                  "VAT_D0259D": 0
                },
                "afterHook": {
                  "D00587": 26,
                  "D0058C": 0,
                  "D0058D": 26,
                  "D0058E": 0,
                  "D00080": 24,
                  "D0009F": 0,
                  "D007CA": 0,
                  "D008E0": 0,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 0,
                  "D02A40": 0,
                  "VAT_D02590": 0,
                  "VAT_D0259D": 0
                }
              },
              {
                "block": 199320,
                "pc": "0x000038",
                "diff": {
                  "D00587": [
                    26,
                    0
                  ],
                  "D00080": [
                    24,
                    16
                  ]
                },
                "beforeHook": {
                  "D00587": 0,
                  "D0058C": 0,
                  "D0058D": 26,
                  "D0058E": 0,
                  "D00080": 16,
                  "D0009F": 0,
                  "D007CA": 0,
                  "D008E0": 0,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 0,
                  "D02A40": 0,
                  "VAT_D02590": 0,
                  "VAT_D0259D": 0
                },
                "afterHook": {
                  "D00587": 0,
                  "D0058C": 0,
                  "D0058D": 26,
                  "D0058E": 0,
                  "D00080": 16,
                  "D0009F": 0,
                  "D007CA": 0,
                  "D008E0": 0,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 0,
                  "D02A40": 0,
                  "VAT_D02590": 0,
                  "VAT_D0259D": 0
                }
              },
              {
                "block": 199629,
                "pc": "0x02FECF",
                "diff": {
                  "D00080": [
                    16,
                    0
                  ]
                },
                "beforeHook": {
                  "D00587": 0,
                  "D0058C": 0,
                  "D0058D": 26,
                  "D0058E": 0,
                  "D00080": 0,
                  "D0009F": 0,
                  "D007CA": 0,
                  "D008E0": 0,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 0,
                  "D02A40": 0,
                  "VAT_D02590": 0,
                  "VAT_D0259D": 0
                },
                "afterHook": {
                  "D00587": 0,
                  "D0058C": 0,
                  "D0058D": 26,
                  "D0058E": 0,
                  "D00080": 0,
                  "D0009F": 0,
                  "D007CA": 0,
                  "D008E0": 0,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 0,
                  "D02A40": 0,
                  "VAT_D02590": 0,
                  "VAT_D0259D": 0
                }
              },
              {
                "block": 199814,
                "pc": "0x08C38A",
                "diff": {
                  "D0058C": [
                    0,
                    144
                  ]
                },
                "beforeHook": {
                  "D00587": 0,
                  "D0058C": 144,
                  "D0058D": 26,
                  "D0058E": 0,
                  "D00080": 0,
                  "D0009F": 0,
                  "D007CA": 0,
                  "D008E0": 0,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 0,
                  "D02A40": 0,
                  "VAT_D02590": 0,
                  "VAT_D0259D": 0
                },
                "afterHook": {
                  "D00587": 0,
                  "D0058C": 144,
                  "D0058D": 26,
                  "D0058E": 0,
                  "D00080": 0,
                  "D0009F": 0,
                  "D007CA": 0,
                  "D008E0": 0,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 0,
                  "D02A40": 0,
                  "VAT_D02590": 0,
                  "VAT_D0259D": 0
                }
              },
              {
                "block": 201361,
                "pc": "0x0018F8",
                "diff": {
                  "D0058C": [
                    144,
                    0
                  ],
                  "D0058D": [
                    26,
                    0
                  ]
                },
                "beforeHook": {
                  "D00587": 0,
                  "D0058C": 0,
                  "D0058D": 0,
                  "D0058E": 0,
                  "D00080": 0,
                  "D0009F": 0,
                  "D007CA": 0,
                  "D008E0": 0,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 0,
                  "D02A40": 0,
                  "VAT_D02590": 0,
                  "VAT_D0259D": 0
                },
                "afterHook": {
                  "D00587": 0,
                  "D0058C": 0,
                  "D0058D": 0,
                  "D0058E": 0,
                  "D00080": 0,
                  "D0009F": 0,
                  "D007CA": 0,
                  "D008E0": 0,
                  "D02A28": 0,
                  "D001B8": 0,
                  "D001D3": 0,
                  "D02A29": 0,
                  "D02A2B": 0,
                  "D02A1B": 0,
                  "D0059A": 0,
                  "D01150": 0,
                  "D0243D": 0,
                  "D02A40": 0,
                  "VAT_D02590": 0,
                  "VAT_D0259D": 0
                }
              }
            ]
          },
          "afterState": {
            "status": "Key: 2 → 300000 steps (peak 3359px)",
            "vramPixels": 3040,
            "routeFields": {
              "D00587": 0,
              "D0058C": 0,
              "D0058D": 0,
              "D0058E": 0,
              "D00080": 0,
              "D0009F": 0,
              "D007CA": 361961,
              "D008E0": 0,
              "D02A28": 0,
              "D001B8": 0,
              "D001D3": 0,
              "D02A29": 0,
              "D02A2B": 0,
              "D02A1B": 0,
              "D0059A": 0,
              "D01150": 0,
              "D0243D": 13805589,
              "D02A40": 0,
              "VAT_D02590": 13893249,
              "VAT_D0259D": 13893325
            }
          }
        }
      ]
    }
  ],
  "errors": []
}
```

No source files from the browser shell, runtime, transpiler, or scheduler were modified; this probe serves an instrumented HTML copy from memory.


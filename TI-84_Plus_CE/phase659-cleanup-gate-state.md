# Phase 659: Cleanup Gate State Under Live VAT

Probe: `probe-phase659-cleanup-gate-state.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase659-cleanup-gate-state.mjs`  
Exit: 0

## Summary

- PASS: no-autorun-digit2 (autoRun=false, replayBeforeEachKey=false) Phase 6 halt at 0x0019B5, 0x084711 hits=34.
  - Digit2: VAT live at seeded route; path=low-transfer path; token/tail hits=0; low-path hits=60889; cleanup hits=3; cxMain hits=2.
- PASS: All page error collectors saw no browser exceptions.
- First cleanup entries: clear001879@0x001879#13138, cleanup0018f8@0x0018F8#13139, clear001879@0x001879#203289, cleanup0018f8@0x0018F8#203290, clear001879@0x001879#208341, cleanup0018f8@0x0018F8#208342.
- First clear sites: D007CA@0x001879#13139, D008E0@0x001879#13139, VAT_D02590@0x001879#13139, VAT_D0259D@0x001879#13139.
- First nonzero writes: D008E0@0x08C331#1.
- Gate sequence: gate001c33@0x001C33#22 -> gate001c4a@0x001C4A#13027 -> gate0158d2@0x0158D2#13028 -> gate0158da@0x0158DA#13029 -> gate0158ec@0x0158EC#13030 -> gate0158ee@0x0158EE#13031 -> gate0158f8@0x0158F8#13032 -> gate001872@0x001872#13137 -> clear001879@0x001879#13138 -> cleanup0018f8@0x0018F8#13139.
- First 0x001872 sample: AF=0x0044 A=0x00 F=0x44 Z=true C=false SP=0xD1A87B stack0=0x0013E8 port03=read:0xEE@0x001988 port09=write:0x42@0x001853.
- First 0x001879 sample: AF=0xEE54 A=0xEE F=0x54 Z=true C=false SP=0xD1A87B stack0=0x0013E8 port03=read:0xEE@0x001872 port09=write:0x42@0x001853.
- First 0x0018F8 sample: AF=0x5200 A=0x52 F=0x00 Z=false C=false SP=0xD1A87B stack0=0x0013E8 port03=read:0xEE@0x001872 port09=write:0x52@0x001879.

## Interpretation

The no-AutoRun Digit2 browser route starts with live VAT, reaches cxMain/key handling, then routes into the low-transfer/status cleanup path. The gate samples capture the branch/caller state from 0x001C33 through 0x001879; compare the first 0x001872 and 0x001879 records to see the port guard state immediately before the bulk clear.

## Key Records

```json
{
  "scenarios": [
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
              "gate001c33": 290,
              "gate001c4a": 7,
              "gate0158d2": 5,
              "gate0158da": 5,
              "gate0158ec": 5,
              "gate0158ee": 5,
              "gate0158f8": 5,
              "gate001872": 3,
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
                "recentBlocks": [
                  "0x08C331"
                ],
                "stack24": [
                  {
                    "offset": 0,
                    "addr": "0xD1A863",
                    "value": "0x0019B5"
                  },
                  {
                    "offset": 3,
                    "addr": "0xD1A866",
                    "value": "0xFFFFFF"
                  },
                  {
                    "offset": 6,
                    "addr": "0xD1A869",
                    "value": "0xFFFFFF"
                  },
                  {
                    "offset": 9,
                    "addr": "0xD1A86C",
                    "value": "0xFFFFFF"
                  },
                  {
                    "offset": 12,
                    "addr": "0xD1A86F",
                    "value": "0xFFFFFF"
                  },
                  {
                    "offset": 15,
                    "addr": "0xD1A872",
                    "value": "0xFFFFFF"
                  },
                  {
                    "offset": 18,
                    "addr": "0xD1A875",
                    "value": "0xFFFFFF"
                  },
                  {
                    "offset": 21,
                    "addr": "0xD1A878",
                    "value": "0xFFFFFF"
                  },
                  {
                    "offset": 24,
                    "addr": "0xD1A87B",
                    "value": "0xFFFFFF"
                  },
                  {
                    "offset": 27,
                    "addr": "0xD1A87E",
                    "value": "0x000000"
                  }
                ],
                "runtime": {
                  "lastPc": 574257,
                  "lastMode": "adl",
                  "totalSteps": 637707
                }
              },
              {
                "block": 22,
                "pc": "0x001C33",
                "target": "gate001c33",
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
                "recentBlocks": [
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
                  "0x001CD5",
                  "0x001CE5",
                  "0x001C54",
                  "0x006808",
                  "0x001C33"
                ],
                "stack24": [
                  {
                    "offset": 0,
                    "addr": "0xD1A845",
                    "value": "0x006810"
                  },
                  {
                    "offset": 3,
                    "addr": "0xD1A848",
                    "value": "0xD1A860"
                  },
                  {
                    "offset": 6,
                    "addr": "0xD1A84B",
                    "value": "0x001727"
                  },
                  {
                    "offset": 9,
                    "addr": "0xD1A84E",
                    "value": "0x020000"
                  },
                  {
                    "offset": 12,
                    "addr": "0xD1A851",
                    "value": "0x000719"
                  },
                  {
                    "offset": 15,
                    "addr": "0xD1A854",
                    "value": "0xD1A8A1"
                  },
                  {
                    "offset": 18,
                    "addr": "0xD1A857",
                    "value": "0xD00080"
                  },
                  {
                    "offset": 21,
                    "addr": "0xD1A85A",
                    "value": "0xD1A860"
                  },
                  {
                    "offset": 24,
                    "addr": "0xD1A85D",
                    "value": "0x05C67C"
                  },
                  {
                    "offset": 27,
                    "addr": "0xD1A860",
                    "value": "0x08C339"
                  }
                ],
                "runtime": {
                  "lastPc": 574257,
                  "lastMode": "adl",
                  "totalSteps": 637707
                }
              },
              {
                "block": 34,
                "pc": "0x001C33",
                "target": "gate001c33",
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
                "recentBlocks": [
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
                  "0x001CD5",
                  "0x001CE5",
                  "0x001C54",
                  "0x006808",
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
                  "0x001C33"
                ],
                "stack24": [
                  {
                    "offset": 0,
                    "addr": "0xD1A845",
                    "value": "0x006810"
                  },
                  {
                    "offset": 3,
                    "addr": "0xD1A848",
                    "value": "0xD1A860"
                  },
                  {
                    "offset": 6,
                    "addr": "0xD1A84B",
                    "value": "0x001727"
                  },
                  {
                    "offset": 9,
                    "addr": "0xD1A84E",
                    "value": "0x020000"
                  },
                  {
                    "offset": 12,
                    "addr": "0xD1A851",
                    "value": "0x000719"
                  },
                  {
                    "offset": 15,
                    "addr": "0xD1A854",
                    "value": "0xD1A8A1"
                  },
                  {
                    "offset": 18,
                    "addr": "0xD1A857",
                    "value": "0xD00080"
                  },
                  {
                    "offset": 21,
                    "addr": "0xD1A85A",
                    "value": "0xD1A860"
                  },
                  {
                    "offset": 24,
                    "addr": "0xD1A85D",
                    "value": "0x05C67C"
                  },
                  {
                    "offset": 27,
                    "addr": "0xD1A860",
                    "value": "0x08C339"
                  }
                ],
                "runtime": {
                  "lastPc": 574257,
                  "lastMode": "adl",
                  "totalSteps": 637707
                }
              },
              {
                "block": 46,
                "pc": "0x001C33",
                "target": "gate001c33",
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
                "recentBlocks": [
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
                  "0x001CD5",
                  "0x001CE5",
                  "0x001C54",
                  "0x006808",
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
                  "0x001CC0",
                  "0x001CCA",
                  "0x001CE4",
                  "0x001C81",
                  "0x001C82",
                  "0x001C48",
                  "0x001C33"
                ],
                "stack24": [
                  {
                    "offset": 0,
                    "addr": "0xD1A845",
                    "value": "0x006810"
                  },
                  {
                    "offset": 3,
                    "addr": "0xD1A848",
                    "value": "0xD1A860"
                  },
                  {
                    "offset": 6,
                    "addr": "0xD1A84B",
                    "value": "0x001727"
                  },
                  {
                    "offset": 9,
                    "addr": "0xD1A84E",
                    "value": "0x020000"
                  },
                  {
                    "offset": 12,
                    "addr": "0xD1A851",
                    "value": "0x000719"
                  },
                  {
                    "offset": 15,
                    "addr": "0xD1A854",
                    "value": "0xD1A8A1"
                  },
                  {
                    "offset": 18,
                    "addr": "0xD1A857",
                    "value": "0xD00080"
                  },
                  {
                    "offset": 21,
                    "addr": "0xD1A85A",
                    "value": "0xD1A860"
                  },
                  {
                    "offset": 24,
                    "addr": "0xD1A85D",
                    "value": "0x05C67C"
                  },
                  {
                    "offset": 27,
                    "addr": "0xD1A860",
                    "value": "0x08C339"
                  }
                ],
                "runtime": {
                  "lastPc": 574257,
                  "lastMode": "adl",
                  "totalSteps": 637707
                }
              },
              {
                "block": 58,
                "pc": "0x001C33",
                "target": "gate001c33",
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
                "recentBlocks": [
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
                  "0x001CD5",
                  "0x001CE5",
                  "0x001C54",
                  "0x006808",
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
                  "0x001CC0",
                  "0x001CCA",
                  "0x001CE4",
                  "0x001C81",
                  "0x001C82",
                  "0x001C48",
                  "0x001C33"
                ],
                "stack24": [
                  {
                    "offset": 0,
                    "addr": "0xD1A845",
                    "value": "0x006810"
                  },
                  {
                    "offset": 3,
                    "addr": "0xD1A848",
                    "value": "0xD1A860"
                  },
                  {
                    "offset": 6,
                    "addr": "0xD1A84B",
                    "value": "0x001727"
                  },
                  {
                    "offset": 9,
                    "addr": "0xD1A84E",
                    "value": "0x020000"
                  },
                  {
                    "offset": 12,
                    "addr": "0xD1A851",
                    "value": "0x000719"
                  },
                  {
                    "offset": 15,
                    "addr": "0xD1A854",
                    "value": "0xD1A8A1"
                  },
                  {
                    "offset": 18,
                    "addr": "0xD1A857",
                    "value": "0xD00080"
                  },
                  {
                    "offset": 21,
                    "addr": "0xD1A85A",
                    "value": "0xD1A860"
                  },
                  {
                    "offset": 24,
                    "addr": "0xD1A85D",
                    "value": "0x05C67C"
                  },
                  {
                    "offset": 27,
                    "addr": "0xD1A860",
                    "value": "0x08C339"
                  }
                ],
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
                "recentBlocks": [
                  "0x006828",
                  "0x001727",
                  "0x000719",
                  "0x00071D",
                  "0x02010C",
                  "0x03CF7D",
                  "0x03CFA4",
                  "0x03CFCF",
                  "0x03CFD4",
                  "0x03CFDB",
                  "0x03CFE0",
                  "0x03CFE5",
                  "0x03CFEA",
                  "0x03D029",
                  "0x03D033",
                  "0x03D038",
                  "0x03D044",
                  "0x03D1C3",
                  "0x03D04C",
                  "0x03D054",
                  "0x03F994",
                  "0x0003D4",
                  "0x003CC2",
                  "0x003CD4",
                  "0x003CE0",
                  "0x003CEE",
                  "0x003CF3",
                  "0x003CF7",
                  "0x003D09",
                  "0x003D11",
                  "0x003D1C",
                  "0x003D21",
                  "0x003D28",
                  "0x003D25",
                  "0x003D28",
                  "0x003D25",
                  "0x003D28",
                  "0x003D25",
                  "0x003D28",
                  "0x003D2E",
                  "0x003D31",
                  "0x003D25",
                  "0x003D28",
                  "0x003D25",
                  "0x003D28",
                  "0x003D25",
                  "0x003D28",
                  "0x003D25",
                  "0x003D34",
                  "0x003D36",
                  "0x003D3D",
                  "0x003D40",
                  "0x003D45",
                  "0x03F998",
                  "0x03F99A",
                  "0x03F9AB",
                  "0x03F9B1",
                  "0x03F9B8",
                  "0x03F9BA",
                  "0x03F9BE",
                  "0x03F9C2",
                  "0x03D058",
                  "0x03D060",
                  "0x03D0E0",
                  "0x08C532",
                  "0x022331",
                  "0x000578",
                  "0x0158A6",
                  "0x022336",
                  "0x022344",
                  "0x08C536",
                  "0x08C72F",
                  "0x05622E",
                  "0x05623D",
                  "0x056244",
                  "0x056248",
                  "0x056253",
                  "0x08C734",
                  "0x08C745",
                  "0x0585E9"
                ],
                "stack24": [
                  {
                    "offset": 0,
                    "addr": "0xD1A854",
                    "value": "0x08C73D"
                  },
                  {
                    "offset": 3,
                    "addr": "0xD1A857",
                    "value": "0x009090"
                  },
                  {
                    "offset": 6,
                    "addr": "0xD1A85A",
                    "value": "0x00FFFF"
                  },
                  {
                    "offset": 9,
                    "addr": "0xD1A85D",
                    "value": "0x08C53A"
                  },
                  {
                    "offset": 12,
                    "addr": "0xD1A860",
                    "value": "0x009036"
                  },
                  {
                    "offset": 15,
                    "addr": "0xD1A863",
                    "value": "0x0019B5"
                  },
                  {
                    "offset": 18,
                    "addr": "0xD1A866",
                    "value": "0xFFFFFF"
                  },
                  {
                    "offset": 21,
                    "addr": "0xD1A869",
                    "value": "0xFFFFFF"
                  },
                  {
                    "offset": 24,
                    "addr": "0xD1A86C",
                    "value": "0xFFFFFF"
                  },
                  {
                    "offset": 27,
                    "addr": "0xD1A86F",
                    "value": "0xFFFFFF"
                  }
                ],
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
                "recentBlocks": [
                  "0x02010C",
                  "0x03CF7D",
                  "0x03CFA4",
                  "0x03CFCF",
                  "0x03CFD4",
                  "0x03CFDB",
                  "0x03CFE0",
                  "0x03CFE5",
                  "0x03CFEA",
                  "0x03D029",
                  "0x03D033",
                  "0x03D038",
                  "0x03D044",
                  "0x03D1C3",
                  "0x03D04C",
                  "0x03D054",
                  "0x03F994",
                  "0x0003D4",
                  "0x003CC2",
                  "0x003CD4",
                  "0x003CE0",
                  "0x003CEE",
                  "0x003CF3",
                  "0x003CF7",
                  "0x003D09",
                  "0x003D11",
                  "0x003D1C",
                  "0x003D21",
                  "0x003D28",
                  "0x003D25",
                  "0x003D28",
                  "0x003D25",
                  "0x003D28",
                  "0x003D25",
                  "0x003D28",
                  "0x003D2E",
                  "0x003D31",
                  "0x003D25",
                  "0x003D28",
                  "0x003D25",
                  "0x003D28",
                  "0x003D25",
                  "0x003D28",
                  "0x003D25",
                  "0x003D34",
                  "0x003D36",
                  "0x003D3D",
                  "0x003D40",
                  "0x003D45",
                  "0x03F998",
                  "0x03F99A",
                  "0x03F9AB",
                  "0x03F9B1",
                  "0x03F9B8",
                  "0x03F9BA",
                  "0x03F9BE",
                  "0x03F9C2",
                  "0x03D058",
                  "0x03D060",
                  "0x03D0E0",
                  "0x08C532",
                  "0x022331",
                  "0x000578",
                  "0x0158A6",
                  "0x022336",
                  "0x022344",
                  "0x08C536",
                  "0x08C72F",
                  "0x05622E",
                  "0x05623D",
                  "0x056244",
                  "0x056248",
                  "0x056253",
                  "0x08C734",
                  "0x08C745",
                  "0x0585E9",
                  "0x0585F8",
                  "0x0585F9",
                  "0x058602",
                  "0x05877A"
                ],
                "stack24": [
                  {
                    "offset": 0,
                    "addr": "0xD1A854",
                    "value": "0x08C73D"
                  },
                  {
                    "offset": 3,
                    "addr": "0xD1A857",
                    "value": "0x009090"
                  },
                  {
                    "offset": 6,
                    "addr": "0xD1A85A",
                    "value": "0x00FFFF"
                  },
                  {
                    "offset": 9,
                    "addr": "0xD1A85D",
                    "value": "0x08C53A"
                  },
                  {
                    "offset": 12,
                    "addr": "0xD1A860",
                    "value": "0x009036"
                  },
                  {
                    "offset": 15,
                    "addr": "0xD1A863",
                    "value": "0x0019B5"
                  },
                  {
                    "offset": 18,
                    "addr": "0xD1A866",
                    "value": "0xFFFFFF"
                  },
                  {
                    "offset": 21,
                    "addr": "0xD1A869",
                    "value": "0xFFFFFF"
                  },
                  {
                    "offset": 24,
                    "addr": "0xD1A86C",
                    "value": "0xFFFFFF"
                  },
                  {
                    "offset": 27,
                    "addr": "0xD1A86F",
                    "value": "0xFFFFFF"
                  }
                ],
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
                "recentBlocks": [
                  "0x0A19A4",
                  "0x0A19A4",
                  "0x0A19A4",
                  "0x0A19AA",
                  "0x0A19B5",
                  "0x0A19B7",
                  "0x0A19D7",
                  "0x0A1A1D",
                  "0x0A1854",
                  "0x0A187C",
                  "0x0A188A",
                  "0x0A189E",
                  "0x0A18A6",
                  "0x0A1A83",
                  "0x0A18AF",
                  "0x0A18C1",
                  "0x0A18C4",
                  "0x0A18C4",
                  "0x0A18C4",
                  "0x0A18C4",
                  "0x0A18C4",
                  "0x0A18CA",
                  "0x0A18E9",
                  "0x0A18F9",
                  "0x0A1A83",
                  "0x0A18FD",
                  "0x0A191F",
                  "0x0A1939",
                  "0x0A1969",
                  "0x0A1976",
                  "0x0A1980",
                  "0x0A1988",
                  "0x0A1A83",
                  "0x0A1994",
                  "0x0A19A4",
                  "0x0A19A4",
                  "0x0A19A4",
                  "0x0A19AA",
                  "0x0A19B5",
                  "0x0A19B7",
                  "0x0A19D7",
                  "0x0A1A1D",
                  "0x0A1854",
                  "0x0A187C",
                  "0x0A188A",
                  "0x0A189E",
                  "0x0A18A6",
                  "0x0A1A83",
                  "0x0A18AF",
                  "0x0A18C1",
                  "0x0A18C4",
                  "0x0A18C4",
                  "0x0A18C4",
                  "0x0A18C4",
                  "0x0A18C4",
                  "0x0A18CA",
                  "0x0A18E9",
                  "0x0A18F9",
                  "0x0A1A83",
                  "0x0A18FD",
                  "0x0A191F",
                  "0x0A1939",
                  "0x0A1969",
                  "0x0A1976",
                  "0x0A1980",
                  "0x0A1988",
                  "0x0A1A83",
                  "0x0A1994",
                  "0x0A19A4",
                  "0x0A19A4",
                  "0x0A19A4",
                  "0x0A19AA",
                  "0x0A19B5",
                  "0x0A19B7",
                  "0x0A19D7",
                  "0x0A1A1D",
                  "0x0A1A30",
                  "0x05C883",
                  "0x02FDB6",
                  "0x03FA09"
                ],
                "stack24": [
                  {
                    "offset": 0,
                    "addr": "0xD1A85A",
                    "value": "0x02FDC2"
                  },
                  {
                    "offset": 3,
                    "addr": "0xD1A85D",
                    "value": "0x02FCC6"
                  },
                  {
                    "offset": 6,
                    "addr": "0xD1A860",
                    "value": "0x08C366"
                  },
                  {
                    "offset": 9,
                    "addr": "0xD1A863",
                    "value": "0x0019B5"
                  },
                  {
                    "offset": 12,
                    "addr": "0xD1A866",
                    "value": "0xFFFFFF"
                  },
                  {
                    "offset": 15,
                    "addr": "0xD1A869",
                    "value": "0xFFFFFF"
                  },
                  {
                    "offset": 18,
                    "addr": "0xD1A86C",
                    "value": "0xFFFFFF"
                  },
                  {
                    "offset": 21,
                    "addr": "0xD1A86F",
                    "value": "0xFFFFFF"
                  },
                  {
                    "offset": 24,
                    "addr": "0xD1A872",
                    "value": "0xFFFFFF"
                  },
                  {
                    "offset": 27,
                    "addr": "0xD1A875",
                    "value": "0xFFFFFF"
                  }
                ],
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
                "recentBlocks": [
                  "0x003CE0",
                  "0x003CEE",
                  "0x003CF3",
                  "0x003CF7",
                  "0x003D09",
                  "0x003D11",
                  "0x003D1C",
                  "0x003D21",
                  "0x003D28",
                  "0x003D25",
                  "0x003D28",
                  "0x003D25",
                  "0x003D28",
                  "0x003D25",
                  "0x003D28",
                  "0x003D2E",
                  "0x003D31",
                  "0x003D25",
                  "0x003D28",
                  "0x003D25",
                  "0x003D28",
                  "0x003D25",
                  "0x003D28",
                  "0x003D25",
                  "0x003D34",
                  "0x003D36",
                  "0x003D3D",
                  "0x003D40",
                  "0x003D45",
                  "0x03F998",
                  "0x03F99A",
                  "0x03F9AB",
                  "0x03F9B1",
                  "0x03F9B8",
                  "0x03F9BA",
                  "0x03F9BE",
                  "0x03F9C2",
                  "0x03D058",
                  "0x03D060",
                  "0x03D0E0",
                  "0x084A14",
                  "0x084A20",
                  "0x085F27",
                  "0x086BC5",
                  "0x085F2B",
                  "0x085F35",
                  "0x04E0F4",
                  "0x08C405",
                  "0x08C407",
                  "0x08C413",
                  "0x08C417",
                  "0x08C41B",
                  "0x08C44D",
                  "0x08C453",
                  "0x08C459",
                  "0x08C45F",
                  "0x08C49F",
                  "0x08C4ED",
                  "0x08C4F5",
                  "0x08C4FD",
                  "0x08C509",
                  "0x08C511",
                  "0x08C519",
                  "0x08C526",
                  "0x08C532",
                  "0x022331",
                  "0x000578",
                  "0x0158A6",
                  "0x022336",
                  "0x022344",
                  "0x08C536",
                  "0x08C72F",
                  "0x05622E",
                  "0x05623D",
                  "0x056244",
                  "0x056248",
                  "0x056253",
                  "0x08C734",
                  "0x08C745",
                  "0x0585E9"
                ],
                "stack24": [
                  {
                    "offset": 0,
                    "addr": "0xD1A854",
                    "value": "0x08C73D"
                  },
                  {
                    "offset": 3,
                    "addr": "0xD1A857",
                    "value": "0x000090"
                  },
                  {
                    "offset": 6,
                    "addr": "0xD1A85A",
                    "value": "0x000049"
                  },
                  {
                    "offset": 9,
                    "addr": "0xD1A85D",
                    "value": "0x08C53A"
                  },
                  {
                    "offset": 12,
                    "addr": "0xD1A860",
                    "value": "0x009036"
                  },
                  {
                    "offset": 15,
                    "addr": "0xD1A863",
                    "value": "0x0019B5"
                  },
                  {
                    "offset": 18,
                    "addr": "0xD1A866",
                    "value": "0xFFFFFF"
                  },
                  {
                    "offset": 21,
                    "addr": "0xD1A869",
                    "value": "0xFFFFFF"
                  },
                  {
                    "offset": 24,
                    "addr": "0xD1A86C",
                    "value": "0xFFFFFF"
                  },
                  {
                    "offset": 27,
                    "addr": "0xD1A86F",
                    "value": "0xFFFFFF"
                  }
                ],
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
                "recentBlocks": [
                  "0x003D09",
                  "0x003D11",
                  "0x003D1C",
                  "0x003D21",
                  "0x003D28",
                  "0x003D25",
                  "0x003D28",
                  "0x003D25",
                  "0x003D28",
                  "0x003D25",
                  "0x003D28",
                  "0x003D2E",
                  "0x003D31",
                  "0x003D25",
                  "0x003D28",
                  "0x003D25",
                  "0x003D28",
                  "0x003D25",
                  "0x003D28",
                  "0x003D25",
                  "0x003D34",
                  "0x003D36",
                  "0x003D3D",
                  "0x003D40",
                  "0x003D45",
                  "0x03F998",
                  "0x03F99A",
                  "0x03F9AB",
                  "0x03F9B1",
                  "0x03F9B8",
                  "0x03F9BA",
                  "0x03F9BE",
                  "0x03F9C2",
                  "0x03D058",
                  "0x03D060",
                  "0x03D0E0",
                  "0x084A14",
                  "0x084A20",
                  "0x085F27",
                  "0x086BC5",
                  "0x085F2B",
                  "0x085F35",
                  "0x04E0F4",
                  "0x08C405",
                  "0x08C407",
                  "0x08C413",
                  "0x08C417",
                  "0x08C41B",
                  "0x08C44D",
                  "0x08C453",
                  "0x08C459",
                  "0x08C45F",
                  "0x08C49F",
                  "0x08C4ED",
                  "0x08C4F5",
                  "0x08C4FD",
                  "0x08C509",
                  "0x08C511",
                  "0x08C519",
                  "0x08C526",
                  "0x08C532",
                  "0x022331",
                  "0x000578",
                  "0x0158A6",
                  "0x022336",
                  "0x022344",
                  "0x08C536",
                  "0x08C72F",
                  "0x05622E",
                  "0x05623D",
                  "0x056244",
                  "0x056248",
                  "0x056253",
                  "0x08C734",
                  "0x08C745",
                  "0x0585E9",
                  "0x0585F8",
                  "0x0585F9",
                  "0x058602",
                  "0x05877A"
                ],
                "stack24": [
                  {
                    "offset": 0,
                    "addr": "0xD1A854",
                    "value": "0x08C73D"
                  },
                  {
                    "offset": 3,
                    "addr": "0xD1A857",
                    "value": "0x000090"
                  },
                  {
                    "offset": 6,
                    "addr": "0xD1A85A",
                    "value": "0x000049"
                  },
                  {
                    "offset": 9,
                    "addr": "0xD1A85D",
                    "value": "0x08C53A"
                  },
                  {
                    "offset": 12,
                    "addr": "0xD1A860",
                    "value": "0x009036"
                  },
                  {
                    "offset": 15,
                    "addr": "0xD1A863",
                    "value": "0x0019B5"
                  },
                  {
                    "offset": 18,
                    "addr": "0xD1A866",
                    "value": "0xFFFFFF"
                  },
                  {
                    "offset": 21,
                    "addr": "0xD1A869",
                    "value": "0xFFFFFF"
                  },
                  {
                    "offset": 24,
                    "addr": "0xD1A86C",
                    "value": "0xFFFFFF"
                  },
                  {
                    "offset": 27,
                    "addr": "0xD1A86F",
                    "value": "0xFFFFFF"
                  }
                ],
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
                "recentBlocks": [
                  "0x0A19A4",
                  "0x0A19A4",
                  "0x0A19A4",
                  "0x0A19A4",
                  "0x0A19A4",
                  "0x0A19AA",
                  "0x0A19B5",
                  "0x0A19B7",
                  "0x0A19D7",
                  "0x0A1A1D",
                  "0x0A1854",
                  "0x0A187C",
                  "0x0A188A",
                  "0x0A189E",
                  "0x0A18A6",
                  "0x0A1A83",
                  "0x0A18AF",
                  "0x0A18C1",
                  "0x0A18C4",
                  "0x0A18CA",
                  "0x0A18E9",
                  "0x0A18EB",
                  "0x0A190D",
                  "0x0A191F",
                  "0x0A1939",
                  "0x0A1969",
                  "0x0A1976",
                  "0x0A1980",
                  "0x0A1988",
                  "0x0A1A83",
                  "0x0A1994",
                  "0x0A19A4",
                  "0x0A19A4",
                  "0x0A19A4",
                  "0x0A19A4",
                  "0x0A19A4",
                  "0x0A19A4",
                  "0x0A19A4",
                  "0x0A19AA",
                  "0x0A19B5",
                  "0x0A19B7",
                  "0x0A19D7",
                  "0x0A1A1D",
                  "0x0A1854",
                  "0x0A187C",
                  "0x0A188A",
                  "0x0A189E",
                  "0x0A18A6",
                  "0x0A1A83",
                  "0x0A18AF",
                  "0x0A18C1",
                  "0x0A18C4",
                  "0x0A18CA",
                  "0x0A18E9",
                  "0x0A18EB",
                  "0x0A190D",
                  "0x0A191F",
                  "0x0A1939",
                  "0x0A1969",
                  "0x0A1976",
                  "0x0A1980",
                  "0x0A1988",
                  "0x0A1A83",
                  "0x0A1994",
                  "0x0A19A4",
                  "0x0A19A4",
                  "0x0A19A4",
                  "0x0A19A4",
                  "0x0A19A4",
                  "0x0A19A4",
                  "0x0A19A4",
                  "0x0A19AA",
                  "0x0A19B5",
                  "0x0A19B7",
                  "0x0A19D7",
                  "0x0A1A1D",
                  "0x0A1A30",
                  "0x05C883",
                  "0x02FDB6",
                  "0x03FA09"
                ],
                "stack24": [
                  {
                    "offset": 0,
                    "addr": "0xD1A85A",
                    "value": "0x02FDC2"
                  },
                  {
                    "offset": 3,
                    "addr": "0xD1A85D",
                    "value": "0x02FCC6"
                  },
                  {
                    "offset": 6,
                    "addr": "0xD1A860",
                    "value": "0x08C366"
                  },
                  {
                    "offset": 9,
                    "addr": "0xD1A863",
                    "value": "0x0019B5"
                  },
                  {
                    "offset": 12,
                    "addr": "0xD1A866",
                    "value": "0xFFFFFF"
                  },
                  {
                    "offset": 15,
                    "addr": "0xD1A869",
                    "value": "0xFFFFFF"
                  },
                  {
                    "offset": 18,
                    "addr": "0xD1A86C",
                    "value": "0xFFFFFF"
                  },
                  {
                    "offset": 21,
                    "addr": "0xD1A86F",
                    "value": "0xFFFFFF"
                  },
                  {
                    "offset": 24,
                    "addr": "0xD1A872",
                    "value": "0xFFFFFF"
                  },
                  {
                    "offset": 27,
                    "addr": "0xD1A875",
                    "value": "0xFFFFFF"
                  }
                ],
                "runtime": {
                  "lastPc": 574257,
                  "lastMode": "adl",
                  "totalSteps": 637707
                }
              },
              {
                "block": 13027,
                "pc": "0x001C4A",
                "target": "gate001c4a",
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
                "recentBlocks": [
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
                  "0x001C4A"
                ],
                "stack24": [
                  {
                    "offset": 0,
                    "addr": "0xD1A875",
                    "value": "0x0158D2"
                  },
                  {
                    "offset": 3,
                    "addr": "0xD1A878",
                    "value": "0x0158EC"
                  },
                  {
                    "offset": 6,
                    "addr": "0xD1A87B",
                    "value": "0x0013DA"
                  },
                  {
                    "offset": 9,
                    "addr": "0xD1A87E",
                    "value": "0x000000"
                  },
                  {
                    "offset": 12,
                    "addr": "0xD1A881",
                    "value": "0x000000"
                  },
                  {
                    "offset": 15,
                    "addr": "0xD1A884",
                    "value": "0x000000"
                  },
                  {
                    "offset": 18,
                    "addr": "0xD1A887",
                    "value": "0x000000"
                  },
                  {
                    "offset": 21,
                    "addr": "0xD1A88A",
                    "value": "0x000000"
                  },
                  {
                    "offset": 24,
                    "addr": "0xD1A88D",
                    "value": "0x008000"
                  },
                  {
                    "offset": 27,
                    "addr": "0xD1A890",
                    "value": "0x000000"
                  }
                ],
                "runtime": {
                  "lastPc": 574257,
                  "lastMode": "adl",
                  "totalSteps": 637707
                }
              },
              {
                "block": 13028,
                "pc": "0x0158D2",
                "target": "gate0158d2",
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
                "recentBlocks": [
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
                  "0x0158D2"
                ],
                "stack24": [
                  {
                    "offset": 0,
                    "addr": "0xD1A878",
                    "value": "0x0158EC"
                  },
                  {
                    "offset": 3,
                    "addr": "0xD1A87B",
                    "value": "0x0013DA"
                  },
                  {
                    "offset": 6,
                    "addr": "0xD1A87E",
                    "value": "0x000000"
                  },
                  {
                    "offset": 9,
                    "addr": "0xD1A881",
                    "value": "0x000000"
                  },
                  {
                    "offset": 12,
                    "addr": "0xD1A884",
                    "value": "0x000000"
                  },
                  {
                    "offset": 15,
                    "addr": "0xD1A887",
                    "value": "0x000000"
                  },
                  {
                    "offset": 18,
                    "addr": "0xD1A88A",
                    "value": "0x000000"
                  },
                  {
                    "offset": 21,
                    "addr": "0xD1A88D",
                    "value": "0x008000"
                  },
                  {
                    "offset": 24,
                    "addr": "0xD1A890",
                    "value": "0x000000"
                  },
                  {
                    "offset": 27,
                    "addr": "0xD1A893",
                    "value": "0x000000"
                  }
                ],
                "runtime": {
                  "lastPc": 574257,
                  "lastMode": "adl",
                  "totalSteps": 637707
                }
              },
              {
                "block": 13029,
                "pc": "0x0158DA",
                "target": "gate0158da",
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
                "recentBlocks": [
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
                  "0x0158DA"
                ],
                "stack24": [
                  {
                    "offset": 0,
                    "addr": "0xD1A878",
                    "value": "0x0158EC"
                  },
                  {
                    "offset": 3,
                    "addr": "0xD1A87B",
                    "value": "0x0013DA"
                  },
                  {
                    "offset": 6,
                    "addr": "0xD1A87E",
                    "value": "0x000000"
                  },
                  {
                    "offset": 9,
                    "addr": "0xD1A881",
                    "value": "0x000000"
                  },
                  {
                    "offset": 12,
                    "addr": "0xD1A884",
                    "value": "0x000000"
                  },
                  {
                    "offset": 15,
                    "addr": "0xD1A887",
                    "value": "0x000000"
                  },
                  {
                    "offset": 18,
                    "addr": "0xD1A88A",
                    "value": "0x000000"
                  },
                  {
                    "offset": 21,
                    "addr": "0xD1A88D",
                    "value": "0x008000"
                  },
                  {
                    "offset": 24,
                    "addr": "0xD1A890",
                    "value": "0x000000"
                  },
                  {
                    "offset": 27,
                    "addr": "0xD1A893",
                    "value": "0x000000"
                  }
                ],
                "runtime": {
                  "lastPc": 574257,
                  "lastMode": "adl",
                  "totalSteps": 637707
                }
              },
              {
                "block": 13030,
                "pc": "0x0158EC",
                "target": "gate0158ec",
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
                "recentBlocks": [
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
                  "0x0158EC"
                ],
                "stack24": [
                  {
                    "offset": 0,
                    "addr": "0xD1A87B",
                    "value": "0x0013DA"
                  },
                  {
                    "offset": 3,
                    "addr": "0xD1A87E",
                    "value": "0x000000"
                  },
                  {
                    "offset": 6,
                    "addr": "0xD1A881",
                    "value": "0x000000"
                  },
                  {
                    "offset": 9,
                    "addr": "0xD1A884",
                    "value": "0x000000"
                  },
                  {
                    "offset": 12,
                    "addr": "0xD1A887",
                    "value": "0x000000"
                  },
                  {
                    "offset": 15,
                    "addr": "0xD1A88A",
                    "value": "0x000000"
                  },
                  {
                    "offset": 18,
                    "addr": "0xD1A88D",
                    "value": "0x008000"
                  },
                  {
                    "offset": 21,
                    "addr": "0xD1A890",
                    "value": "0x000000"
                  },
                  {
                    "offset": 24,
                    "addr": "0xD1A893",
                    "value": "0x000000"
                  },
                  {
                    "offset": 27,
                    "addr": "0xD1A896",
                    "value": "0x008000"
                  }
                ],
                "runtime": {
                  "lastPc": 574257,
                  "lastMode": "adl",
                  "totalSteps": 637707
                }
              },
              {
                "block": 13031,
                "pc": "0x0158EE",
                "target": "gate0158ee",
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
                "recentBlocks": [
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
                  "0x0158EE"
                ],
                "stack24": [
                  {
                    "offset": 0,
                    "addr": "0xD1A87B",
                    "value": "0x0013DA"
                  },
                  {
                    "offset": 3,
                    "addr": "0xD1A87E",
                    "value": "0x000000"
                  },
                  {
                    "offset": 6,
                    "addr": "0xD1A881",
                    "value": "0x000000"
                  },
                  {
                    "offset": 9,
                    "addr": "0xD1A884",
                    "value": "0x000000"
                  },
                  {
                    "offset": 12,
                    "addr": "0xD1A887",
                    "value": "0x000000"
                  },
                  {
                    "offset": 15,
                    "addr": "0xD1A88A",
                    "value": "0x000000"
                  },
                  {
                    "offset": 18,
                    "addr": "0xD1A88D",
                    "value": "0x008000"
                  },
                  {
                    "offset": 21,
                    "addr": "0xD1A890",
                    "value": "0x000000"
                  },
                  {
                    "offset": 24,
                    "addr": "0xD1A893",
                    "value": "0x000000"
                  },
                  {
                    "offset": 27,
                    "addr": "0xD1A896",
                    "value": "0x008000"
                  }
                ],
                "runtime": {
                  "lastPc": 574257,
                  "lastMode": "adl",
                  "totalSteps": 637707
                }
              },
              {
                "block": 13032,
                "pc": "0x0158F8",
                "target": "gate0158f8",
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
                "recentBlocks": [
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
                  "0x0158F8"
                ],
                "stack24": [
                  {
                    "offset": 0,
                    "addr": "0xD1A87B",
                    "value": "0x0013DA"
                  },
                  {
                    "offset": 3,
                    "addr": "0xD1A87E",
                    "value": "0x000000"
                  },
                  {
                    "offset": 6,
                    "addr": "0xD1A881",
                    "value": "0x000000"
                  },
                  {
                    "offset": 9,
                    "addr": "0xD1A884",
                    "value": "0x000000"
                  },
                  {
                    "offset": 12,
                    "addr": "0xD1A887",
                    "value": "0x000000"
                  },
                  {
                    "offset": 15,
                    "addr": "0xD1A88A",
                    "value": "0x000000"
                  },
                  {
                    "offset": 18,
                    "addr": "0xD1A88D",
                    "value": "0x008000"
                  },
                  {
                    "offset": 21,
                    "addr": "0xD1A890",
                    "value": "0x000000"
                  },
                  {
                    "offset": 24,
                    "addr": "0xD1A893",
                    "value": "0x000000"
                  },
                  {
                    "offset": 27,
                    "addr": "0xD1A896",
                    "value": "0x008000"
                  }
                ],
                "runtime": {
                  "lastPc": 574257,
                  "lastMode": "adl",
                  "totalSteps": 637707
                }
              },
              {
                "block": 13131,
                "pc": "0x001C4A",
                "target": "gate001c4a",
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
                "recentBlocks": [
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
                  "0x001C4A"
                ],
                "stack24": [
                  {
                    "offset": 0,
                    "addr": "0xD1A872",
                    "value": "0x0158D2"
                  },
                  {
                    "offset": 3,
                    "addr": "0xD1A875",
                    "value": "0x0158EC"
                  },
                  {
                    "offset": 6,
                    "addr": "0xD1A878",
                    "value": "0x001872"
                  },
                  {
                    "offset": 9,
                    "addr": "0xD1A87B",
                    "value": "0x0013E8"
                  },
                  {
                    "offset": 12,
                    "addr": "0xD1A87E",
                    "value": "0x000000"
                  },
                  {
                    "offset": 15,
                    "addr": "0xD1A881",
                    "value": "0x000000"
                  },
                  {
                    "offset": 18,
                    "addr": "0xD1A884",
                    "value": "0x000000"
                  },
                  {
                    "offset": 21,
                    "addr": "0xD1A887",
                    "value": "0x000000"
                  },
                  {
                    "offset": 24,
                    "addr": "0xD1A88A",
                    "value": "0x000000"
                  },
                  {
                    "offset": 27,
                    "addr": "0xD1A88D",
                    "value": "0x008000"
                  }
                ],
                "runtime": {
                  "lastPc": 574257,
                  "lastMode": "adl",
                  "totalSteps": 637707
                }
              }
            ],
            "clearEntries": [
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
                "recentBlocks": [
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
                "stack24": [
                  {
                    "offset": 0,
                    "addr": "0xD1A87B",
                    "value": "0x0013E8"
                  },
                  {
                    "offset": 3,
                    "addr": "0xD1A87E",
                    "value": "0x000000"
                  },
                  {
                    "offset": 6,
                    "addr": "0xD1A881",
                    "value": "0x000000"
                  },
                  {
                    "offset": 9,
                    "addr": "0xD1A884",
                    "value": "0x000000"
                  },
                  {
                    "offset": 12,
                    "addr": "0xD1A887",
                    "value": "0x000000"
                  },
                  {
                    "offset": 15,
                    "addr": "0xD1A88A",
                    "value": "0x000000"
                  },
                  {
                    "offset": 18,
                    "addr": "0xD1A88D",
                    "value": "0x008000"
                  },
                  {
                    "offset": 21,
                    "addr": "0xD1A890",
                    "value": "0x000000"
                  },
                  {
                    "offset": 24,
                    "addr": "0xD1A893",
                    "value": "0x000000"
                  },
                  {
                    "offset": 27,
                    "addr": "0xD1A896",
                    "value": "0x008000"
                  }
                ],
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
                "recentBlocks": [
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
                  "0x001879",
                  "0x0018F8"
                ],
                "stack24": [
                  {
                    "offset": 0,
                    "addr": "0xD1A87B",
                    "value": "0x0013E8"
                  },
                  {
                    "offset": 3,
                    "addr": "0xD1A87E",
                    "value": "0x000000"
                  },
                  {
                    "offset": 6,
                    "addr": "0xD1A881",
                    "value": "0x000000"
                  },
                  {
                    "offset": 9,
                    "addr": "0xD1A884",
                    "value": "0x000000"
                  },
                  {
                    "offset": 12,
                    "addr": "0xD1A887",
                    "value": "0x000000"
                  },
                  {
                    "offset": 15,
                    "addr": "0xD1A88A",
                    "value": "0x000000"
                  },
                  {
                    "offset": 18,
                    "addr": "0xD1A88D",
                    "value": "0x008000"
                  },
                  {
                    "offset": 21,
                    "addr": "0xD1A890",
                    "value": "0x000000"
                  },
                  {
                    "offset": 24,
                    "addr": "0xD1A893",
                    "value": "0x000000"
                  },
                  {
                    "offset": 27,
                    "addr": "0xD1A896",
                    "value": "0x008000"
                  }
                ],
                "runtime": {
                  "lastPc": 574257,
                  "lastMode": "adl",
                  "totalSteps": 637707
                }
              },
              {
                "block": 203289,
                "pc": "0x001879",
                "target": "clear001879",
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
                "recentBlocks": [
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
                "stack24": [
                  {
                    "offset": 0,
                    "addr": "0xD1A87B",
                    "value": "0x000862"
                  },
                  {
                    "offset": 3,
                    "addr": "0xD1A87E",
                    "value": "0x000000"
                  },
                  {
                    "offset": 6,
                    "addr": "0xD1A881",
                    "value": "0x000000"
                  },
                  {
                    "offset": 9,
                    "addr": "0xD1A884",
                    "value": "0x000000"
                  },
                  {
                    "offset": 12,
                    "addr": "0xD1A887",
                    "value": "0x000000"
                  },
                  {
                    "offset": 15,
                    "addr": "0xD1A88A",
                    "value": "0x000000"
                  },
                  {
                    "offset": 18,
                    "addr": "0xD1A88D",
                    "value": "0x008000"
                  },
                  {
                    "offset": 21,
                    "addr": "0xD1A890",
                    "value": "0x000000"
                  },
                  {
                    "offset": 24,
                    "addr": "0xD1A893",
                    "value": "0x000000"
                  },
                  {
                    "offset": 27,
                    "addr": "0xD1A896",
                    "value": "0x008000"
                  }
                ],
                "runtime": {
                  "lastPc": 574257,
                  "lastMode": "adl",
                  "totalSteps": 637707
                }
              },
              {
                "block": 203290,
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
                "recentBlocks": [
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
                  "0x001879",
                  "0x0018F8"
                ],
                "stack24": [
                  {
                    "offset": 0,
                    "addr": "0xD1A87B",
                    "value": "0x000862"
                  },
                  {
                    "offset": 3,
                    "addr": "0xD1A87E",
                    "value": "0x000000"
                  },
                  {
                    "offset": 6,
                    "addr": "0xD1A881",
                    "value": "0x000000"
                  },
                  {
                    "offset": 9,
                    "addr": "0xD1A884",
                    "value": "0x000000"
                  },
                  {
                    "offset": 12,
                    "addr": "0xD1A887",
                    "value": "0x000000"
                  },
                  {
                    "offset": 15,
                    "addr": "0xD1A88A",
                    "value": "0x000000"
                  },
                  {
                    "offset": 18,
                    "addr": "0xD1A88D",
                    "value": "0x008000"
                  },
                  {
                    "offset": 21,
                    "addr": "0xD1A890",
                    "value": "0x000000"
                  },
                  {
                    "offset": 24,
                    "addr": "0xD1A893",
                    "value": "0x000000"
                  },
                  {
                    "offset": 27,
                    "addr": "0xD1A896",
                    "value": "0x008000"
                  }
                ],
                "runtime": {
                  "lastPc": 574257,
                  "lastMode": "adl",
                  "totalSteps": 637707
                }
              },
              {
                "block": 208341,
                "pc": "0x001879",
                "target": "clear001879",
                "before": {
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
                "recentBlocks": [
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
                "stack24": [
                  {
                    "offset": 0,
                    "addr": "0xD1A87B",
                    "value": "0x0013E8"
                  },
                  {
                    "offset": 3,
                    "addr": "0xD1A87E",
                    "value": "0x000000"
                  },
                  {
                    "offset": 6,
                    "addr": "0xD1A881",
                    "value": "0x000000"
                  },
                  {
                    "offset": 9,
                    "addr": "0xD1A884",
                    "value": "0x000000"
                  },
                  {
                    "offset": 12,
                    "addr": "0xD1A887",
                    "value": "0x000000"
                  },
                  {
                    "offset": 15,
                    "addr": "0xD1A88A",
                    "value": "0x000000"
                  },
                  {
                    "offset": 18,
                    "addr": "0xD1A88D",
                    "value": "0x008000"
                  },
                  {
                    "offset": 21,
                    "addr": "0xD1A890",
                    "value": "0x000000"
                  },
                  {
                    "offset": 24,
                    "addr": "0xD1A893",
                    "value": "0x000000"
                  },
                  {
                    "offset": 27,
                    "addr": "0xD1A896",
                    "value": "0x008000"
                  }
                ],
                "runtime": {
                  "lastPc": 574257,
                  "lastMode": "adl",
                  "totalSteps": 637707
                }
              },
              {
                "block": 208342,
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
                "recentBlocks": [
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
                  "0x001879",
                  "0x0018F8"
                ],
                "stack24": [
                  {
                    "offset": 0,
                    "addr": "0xD1A87B",
                    "value": "0x0013E8"
                  },
                  {
                    "offset": 3,
                    "addr": "0xD1A87E",
                    "value": "0x000000"
                  },
                  {
                    "offset": 6,
                    "addr": "0xD1A881",
                    "value": "0x000000"
                  },
                  {
                    "offset": 9,
                    "addr": "0xD1A884",
                    "value": "0x000000"
                  },
                  {
                    "offset": 12,
                    "addr": "0xD1A887",
                    "value": "0x000000"
                  },
                  {
                    "offset": 15,
                    "addr": "0xD1A88A",
                    "value": "0x000000"
                  },
                  {
                    "offset": 18,
                    "addr": "0xD1A88D",
                    "value": "0x008000"
                  },
                  {
                    "offset": 21,
                    "addr": "0xD1A890",
                    "value": "0x000000"
                  },
                  {
                    "offset": 24,
                    "addr": "0xD1A893",
                    "value": "0x000000"
                  },
                  {
                    "offset": 27,
                    "addr": "0xD1A896",
                    "value": "0x008000"
                  }
                ],
                "runtime": {
                  "lastPc": 574257,
                  "lastMode": "adl",
                  "totalSteps": 637707
                }
              }
            ],
            "firstWrites": {
              "D008E0": {
                "event": "D008E0 first nonzero write",
                "block": 1,
                "pc": "0x08C331",
                "detectionPc": "0x08C331",
                "before": {
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
                "after": {
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
                "recentBlocks": [
                  "0x08C331"
                ],
                "stack24": [
                  {
                    "offset": 0,
                    "addr": "0xD1A863",
                    "value": "0x0019B5"
                  },
                  {
                    "offset": 3,
                    "addr": "0xD1A866",
                    "value": "0xFFFFFF"
                  },
                  {
                    "offset": 6,
                    "addr": "0xD1A869",
                    "value": "0xFFFFFF"
                  },
                  {
                    "offset": 9,
                    "addr": "0xD1A86C",
                    "value": "0xFFFFFF"
                  },
                  {
                    "offset": 12,
                    "addr": "0xD1A86F",
                    "value": "0xFFFFFF"
                  },
                  {
                    "offset": 15,
                    "addr": "0xD1A872",
                    "value": "0xFFFFFF"
                  },
                  {
                    "offset": 18,
                    "addr": "0xD1A875",
                    "value": "0xFFFFFF"
                  },
                  {
                    "offset": 21,
                    "addr": "0xD1A878",
                    "value": "0xFFFFFF"
                  },
                  {
                    "offset": 24,
                    "addr": "0xD1A87B",
                    "value": "0xFFFFFF"
                  },
                  {
                    "offset": 27,
                    "addr": "0xD1A87E",
                    "value": "0x000000"
                  }
                ],
                "cpu": {
                  "pc": "0x08C331",
                  "sp": "0xD1A863",
                  "ix": "0xD1A860",
                  "iy": "0xD00080",
                  "f": "0x40",
                  "halted": false,
                  "madl": 1
                },
                "from": 0,
                "to": 13740131,
                "writerPc": "0x08C331",
                "observedBeforeHook": {
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
              }
            },
            "firstClears": {
              "D007CA": {
                "event": "D007CA first clear",
                "block": 13139,
                "pc": "0x001879",
                "detectionPc": "0x0018F8",
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
                "after": {
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
                "recentBlocks": [
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
                  "0x001879",
                  "0x0018F8"
                ],
                "stack24": [
                  {
                    "offset": 0,
                    "addr": "0xD1A87B",
                    "value": "0x0013E8"
                  },
                  {
                    "offset": 3,
                    "addr": "0xD1A87E",
                    "value": "0x000000"
                  },
                  {
                    "offset": 6,
                    "addr": "0xD1A881",
                    "value": "0x000000"
                  },
                  {
                    "offset": 9,
                    "addr": "0xD1A884",
                    "value": "0x000000"
                  },
                  {
                    "offset": 12,
                    "addr": "0xD1A887",
                    "value": "0x000000"
                  },
                  {
                    "offset": 15,
                    "addr": "0xD1A88A",
                    "value": "0x000000"
                  },
                  {
                    "offset": 18,
                    "addr": "0xD1A88D",
                    "value": "0x008000"
                  },
                  {
                    "offset": 21,
                    "addr": "0xD1A890",
                    "value": "0x000000"
                  },
                  {
                    "offset": 24,
                    "addr": "0xD1A893",
                    "value": "0x000000"
                  },
                  {
                    "offset": 27,
                    "addr": "0xD1A896",
                    "value": "0x008000"
                  }
                ],
                "cpu": {
                  "pc": "0x0018F8",
                  "sp": "0xD1A87B",
                  "ix": "0x000000",
                  "iy": "0xD00080",
                  "f": "0x00",
                  "halted": false,
                  "madl": 1
                },
                "from": 361961,
                "to": 0,
                "writerPc": "0x001879",
                "observedBeforeHook": {
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
              "D008E0": {
                "event": "D008E0 first clear",
                "block": 13139,
                "pc": "0x001879",
                "detectionPc": "0x0018F8",
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
                "after": {
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
                "recentBlocks": [
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
                  "0x001879",
                  "0x0018F8"
                ],
                "stack24": [
                  {
                    "offset": 0,
                    "addr": "0xD1A87B",
                    "value": "0x0013E8"
                  },
                  {
                    "offset": 3,
                    "addr": "0xD1A87E",
                    "value": "0x000000"
                  },
                  {
                    "offset": 6,
                    "addr": "0xD1A881",
                    "value": "0x000000"
                  },
                  {
                    "offset": 9,
                    "addr": "0xD1A884",
                    "value": "0x000000"
                  },
                  {
                    "offset": 12,
                    "addr": "0xD1A887",
                    "value": "0x000000"
                  },
                  {
                    "offset": 15,
                    "addr": "0xD1A88A",
                    "value": "0x000000"
                  },
                  {
                    "offset": 18,
                    "addr": "0xD1A88D",
                    "value": "0x008000"
                  },
                  {
                    "offset": 21,
                    "addr": "0xD1A890",
                    "value": "0x000000"
                  },
                  {
                    "offset": 24,
                    "addr": "0xD1A893",
                    "value": "0x000000"
                  },
                  {
                    "offset": 27,
                    "addr": "0xD1A896",
                    "value": "0x008000"
                  }
                ],
                "cpu": {
                  "pc": "0x0018F8",
                  "sp": "0xD1A87B",
                  "ix": "0x000000",
                  "iy": "0xD00080",
                  "f": "0x00",
                  "halted": false,
                  "madl": 1
                },
                "from": 13740131,
                "to": 0,
                "writerPc": "0x001879",
                "observedBeforeHook": {
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
              "VAT_D02590": {
                "event": "VAT_D02590 first clear",
                "block": 13139,
                "pc": "0x001879",
                "detectionPc": "0x0018F8",
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
                "after": {
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
                "recentBlocks": [
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
                  "0x001879",
                  "0x0018F8"
                ],
                "stack24": [
                  {
                    "offset": 0,
                    "addr": "0xD1A87B",
                    "value": "0x0013E8"
                  },
                  {
                    "offset": 3,
                    "addr": "0xD1A87E",
                    "value": "0x000000"
                  },
                  {
                    "offset": 6,
                    "addr": "0xD1A881",
                    "value": "0x000000"
                  },
                  {
                    "offset": 9,
                    "addr": "0xD1A884",
                    "value": "0x000000"
                  },
                  {
                    "offset": 12,
                    "addr": "0xD1A887",
                    "value": "0x000000"
                  },
                  {
                    "offset": 15,
                    "addr": "0xD1A88A",
                    "value": "0x000000"
                  },
                  {
                    "offset": 18,
                    "addr": "0xD1A88D",
                    "value": "0x008000"
                  },
                  {
                    "offset": 21,
                    "addr": "0xD1A890",
                    "value": "0x000000"
                  },
                  {
                    "offset": 24,
                    "addr": "0xD1A893",
                    "value": "0x000000"
                  },
                  {
                    "offset": 27,
                    "addr": "0xD1A896",
                    "value": "0x008000"
                  }
                ],
                "cpu": {
                  "pc": "0x0018F8",
                  "sp": "0xD1A87B",
                  "ix": "0x000000",
                  "iy": "0xD00080",
                  "f": "0x00",
                  "halted": false,
                  "madl": 1
                },
                "from": 13893249,
                "to": 0,
                "writerPc": "0x001879",
                "observedBeforeHook": {
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
              "VAT_D0259D": {
                "event": "VAT_D0259D first clear",
                "block": 13139,
                "pc": "0x001879",
                "detectionPc": "0x0018F8",
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
                "after": {
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
                "recentBlocks": [
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
                  "0x001879",
                  "0x0018F8"
                ],
                "stack24": [
                  {
                    "offset": 0,
                    "addr": "0xD1A87B",
                    "value": "0x0013E8"
                  },
                  {
                    "offset": 3,
                    "addr": "0xD1A87E",
                    "value": "0x000000"
                  },
                  {
                    "offset": 6,
                    "addr": "0xD1A881",
                    "value": "0x000000"
                  },
                  {
                    "offset": 9,
                    "addr": "0xD1A884",
                    "value": "0x000000"
                  },
                  {
                    "offset": 12,
                    "addr": "0xD1A887",
                    "value": "0x000000"
                  },
                  {
                    "offset": 15,
                    "addr": "0xD1A88A",
                    "value": "0x000000"
                  },
                  {
                    "offset": 18,
                    "addr": "0xD1A88D",
                    "value": "0x008000"
                  },
                  {
                    "offset": 21,
                    "addr": "0xD1A890",
                    "value": "0x000000"
                  },
                  {
                    "offset": 24,
                    "addr": "0xD1A893",
                    "value": "0x000000"
                  },
                  {
                    "offset": 27,
                    "addr": "0xD1A896",
                    "value": "0x008000"
                  }
                ],
                "cpu": {
                  "pc": "0x0018F8",
                  "sp": "0xD1A87B",
                  "ix": "0x000000",
                  "iy": "0xD00080",
                  "f": "0x00",
                  "halted": false,
                  "madl": 1
                },
                "from": 13893325,
                "to": 0,
                "writerPc": "0x001879",
                "observedBeforeHook": {
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
            },
            "gateSamples": [
              {
                "block": 22,
                "target": "gate001c33",
                "pc": "0x001C33",
                "previousPc": "0x006808",
                "routeFields": {
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
                "cpu": {
                  "pc": "0x001C33",
                  "sp": "0xD1A845",
                  "ix": "0xD1A848",
                  "iy": "0xD00080",
                  "a": "0x09",
                  "f": "0x0C",
                  "af": "0x090C",
                  "bc": "0x09D6B4",
                  "de": "0x0080C0",
                  "hl": "0x020006",
                  "flags": {
                    "s": false,
                    "z": false,
                    "h": false,
                    "pv": true,
                    "n": false,
                    "c": false
                  },
                  "halted": false,
                  "madl": 1,
                  "mbase": "0xD0"
                },
                "iyFlags": {
                  "IY+00": {
                    "addr": "0xD00080",
                    "value": "0x08"
                  },
                  "IY+0D": {
                    "addr": "0xD0008D",
                    "value": "0x0E"
                  },
                  "IY+1B": {
                    "addr": "0xD0009B",
                    "value": "0x40"
                  },
                  "IY+1F": {
                    "addr": "0xD0009F",
                    "value": "0x20"
                  },
                  "IY+23": {
                    "addr": "0xD000A3",
                    "value": "0x00"
                  },
                  "IY+27": {
                    "addr": "0xD000A7",
                    "value": "0x00"
                  },
                  "IY+28": {
                    "addr": "0xD000A8",
                    "value": "0x00"
                  },
                  "IY+2C": {
                    "addr": "0xD000AC",
                    "value": "0x00"
                  },
                  "IY+42": {
                    "addr": "0xD000C2",
                    "value": "0x00"
                  },
                  "IY+44": {
                    "addr": "0xD000C4",
                    "value": "0x00"
                  }
                },
                "bytesAtPc": [
                  "0x7E",
                  "0xFE",
                  "0xFF",
                  "0x28",
                  "0x12",
                  "0x23",
                  "0xBA",
                  "0x20",
                  "0x08",
                  "0x7E",
                  "0xE6",
                  "0xF0",
                  "0xBB",
                  "0x20",
                  "0x02",
                  "0x2B"
                ],
                "recentBlocks": [
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
                  "0x001CD5",
                  "0x001CE5",
                  "0x001C54",
                  "0x006808",
                  "0x001C33"
                ],
                "stack24": [
                  {
                    "offset": 0,
                    "addr": "0xD1A845",
                    "value": "0x006810"
                  },
                  {
                    "offset": 3,
                    "addr": "0xD1A848",
                    "value": "0xD1A860"
                  },
                  {
                    "offset": 6,
                    "addr": "0xD1A84B",
                    "value": "0x001727"
                  },
                  {
                    "offset": 9,
                    "addr": "0xD1A84E",
                    "value": "0x020000"
                  },
                  {
                    "offset": 12,
                    "addr": "0xD1A851",
                    "value": "0x000719"
                  },
                  {
                    "offset": 15,
                    "addr": "0xD1A854",
                    "value": "0xD1A8A1"
                  },
                  {
                    "offset": 18,
                    "addr": "0xD1A857",
                    "value": "0xD00080"
                  },
                  {
                    "offset": 21,
                    "addr": "0xD1A85A",
                    "value": "0xD1A860"
                  },
                  {
                    "offset": 24,
                    "addr": "0xD1A85D",
                    "value": "0x05C67C"
                  },
                  {
                    "offset": 27,
                    "addr": "0xD1A860",
                    "value": "0x08C339"
                  },
                  {
                    "offset": 30,
                    "addr": "0xD1A863",
                    "value": "0x0019B5"
                  },
                  {
                    "offset": 33,
                    "addr": "0xD1A866",
                    "value": "0xFFFFFF"
                  }
                ],
                "returnHints": [
                  "0x006810",
                  "0xD1A860",
                  "0x001727",
                  "0x020000",
                  "0x000719",
                  "0xD1A8A1"
                ],
                "ioTail": [],
                "lastIoByPort": {}
              },
              {
                "block": 34,
                "target": "gate001c33",
                "pc": "0x001C33",
                "previousPc": "0x001C48",
                "routeFields": {
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
                "cpu": {
                  "pc": "0x001C33",
                  "sp": "0xD1A845",
                  "ix": "0xD1A848",
                  "iy": "0xD00080",
                  "a": "0x02",
                  "f": "0x00",
                  "af": "0x0200",
                  "bc": "0x000002",
                  "de": "0x0080C0",
                  "hl": "0x02000A",
                  "flags": {
                    "s": false,
                    "z": false,
                    "h": false,
                    "pv": false,
                    "n": false,
                    "c": false
                  },
                  "halted": false,
                  "madl": 1,
                  "mbase": "0xD0"
                },
                "iyFlags": {
                  "IY+00": {
                    "addr": "0xD00080",
                    "value": "0x08"
                  },
                  "IY+0D": {
                    "addr": "0xD0008D",
                    "value": "0x0E"
                  },
                  "IY+1B": {
                    "addr": "0xD0009B",
                    "value": "0x40"
                  },
                  "IY+1F": {
                    "addr": "0xD0009F",
                    "value": "0x20"
                  },
                  "IY+23": {
                    "addr": "0xD000A3",
                    "value": "0x00"
                  },
                  "IY+27": {
                    "addr": "0xD000A7",
                    "value": "0x00"
                  },
                  "IY+28": {
                    "addr": "0xD000A8",
                    "value": "0x00"
                  },
                  "IY+2C": {
                    "addr": "0xD000AC",
                    "value": "0x00"
                  },
                  "IY+42": {
                    "addr": "0xD000C2",
                    "value": "0x00"
                  },
                  "IY+44": {
                    "addr": "0xD000C4",
                    "value": "0x00"
                  }
                },
                "bytesAtPc": [
                  "0x7E",
                  "0xFE",
                  "0xFF",
                  "0x28",
                  "0x12",
                  "0x23",
                  "0xBA",
                  "0x20",
                  "0x08",
                  "0x7E",
                  "0xE6",
                  "0xF0",
                  "0xBB",
                  "0x20",
                  "0x02",
                  "0x2B"
                ],
                "recentBlocks": [
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
                  "0x001CD5",
                  "0x001CE5",
                  "0x001C54",
                  "0x006808",
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
                  "0x001C33"
                ],
                "stack24": [
                  {
                    "offset": 0,
                    "addr": "0xD1A845",
                    "value": "0x006810"
                  },
                  {
                    "offset": 3,
                    "addr": "0xD1A848",
                    "value": "0xD1A860"
                  },
                  {
                    "offset": 6,
                    "addr": "0xD1A84B",
                    "value": "0x001727"
                  },
                  {
                    "offset": 9,
                    "addr": "0xD1A84E",
                    "value": "0x020000"
                  },
                  {
                    "offset": 12,
                    "addr": "0xD1A851",
                    "value": "0x000719"
                  },
                  {
                    "offset": 15,
                    "addr": "0xD1A854",
                    "value": "0xD1A8A1"
                  },
                  {
                    "offset": 18,
                    "addr": "0xD1A857",
                    "value": "0xD00080"
                  },
                  {
                    "offset": 21,
                    "addr": "0xD1A85A",
                    "value": "0xD1A860"
                  },
                  {
                    "offset": 24,
                    "addr": "0xD1A85D",
                    "value": "0x05C67C"
                  },
                  {
                    "offset": 27,
                    "addr": "0xD1A860",
                    "value": "0x08C339"
                  },
                  {
                    "offset": 30,
                    "addr": "0xD1A863",
                    "value": "0x0019B5"
                  },
                  {
                    "offset": 33,
                    "addr": "0xD1A866",
                    "value": "0xFFFFFF"
                  }
                ],
                "returnHints": [
                  "0x006810",
                  "0xD1A860",
                  "0x001727",
                  "0x020000",
                  "0x000719",
                  "0xD1A8A1"
                ],
                "ioTail": [],
                "lastIoByPort": {}
              },
              {
                "block": 46,
                "target": "gate001c33",
                "pc": "0x001C33",
                "previousPc": "0x001C48",
                "routeFields": {
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
                "cpu": {
                  "pc": "0x001C33",
                  "sp": "0xD1A845",
                  "ix": "0xD1A848",
                  "iy": "0xD00080",
                  "a": "0x01",
                  "f": "0x00",
                  "af": "0x0100",
                  "bc": "0x000001",
                  "de": "0x0080C0",
                  "hl": "0x02000D",
                  "flags": {
                    "s": false,
                    "z": false,
                    "h": false,
                    "pv": false,
                    "n": false,
                    "c": false
                  },
                  "halted": false,
                  "madl": 1,
                  "mbase": "0xD0"
                },
                "iyFlags": {
                  "IY+00": {
                    "addr": "0xD00080",
                    "value": "0x08"
                  },
                  "IY+0D": {
                    "addr": "0xD0008D",
                    "value": "0x0E"
                  },
                  "IY+1B": {
                    "addr": "0xD0009B",
                    "value": "0x40"
                  },
                  "IY+1F": {
                    "addr": "0xD0009F",
                    "value": "0x20"
                  },
                  "IY+23": {
                    "addr": "0xD000A3",
                    "value": "0x00"
                  },
                  "IY+27": {
                    "addr": "0xD000A7",
                    "value": "0x00"
                  },
                  "IY+28": {
                    "addr": "0xD000A8",
                    "value": "0x00"
                  },
                  "IY+2C": {
                    "addr": "0xD000AC",
                    "value": "0x00"
                  },
                  "IY+42": {
                    "addr": "0xD000C2",
                    "value": "0x00"
                  },
                  "IY+44": {
                    "addr": "0xD000C4",
                    "value": "0x00"
                  }
                },
                "bytesAtPc": [
                  "0x7E",
                  "0xFE",
                  "0xFF",
                  "0x28",
                  "0x12",
                  "0x23",
                  "0xBA",
                  "0x20",
                  "0x08",
                  "0x7E",
                  "0xE6",
                  "0xF0",
                  "0xBB",
                  "0x20",
                  "0x02",
                  "0x2B"
                ],
                "recentBlocks": [
                  "0x001CC0",
                  "0x001CCA",
                  "0x001CCE",
                  "0x001CD5",
                  "0x001CE5",
                  "0x001C54",
                  "0x006808",
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
                  "0x001CC0",
                  "0x001CCA",
                  "0x001CE4",
                  "0x001C81",
                  "0x001C82",
                  "0x001C48",
                  "0x001C33"
                ],
                "stack24": [
                  {
                    "offset": 0,
                    "addr": "0xD1A845",
                    "value": "0x006810"
                  },
                  {
                    "offset": 3,
                    "addr": "0xD1A848",
                    "value": "0xD1A860"
                  },
                  {
                    "offset": 6,
                    "addr": "0xD1A84B",
                    "value": "0x001727"
                  },
                  {
                    "offset": 9,
                    "addr": "0xD1A84E",
                    "value": "0x020000"
                  },
                  {
                    "offset": 12,
                    "addr": "0xD1A851",
                    "value": "0x000719"
                  },
                  {
                    "offset": 15,
                    "addr": "0xD1A854",
                    "value": "0xD1A8A1"
                  },
                  {
                    "offset": 18,
                    "addr": "0xD1A857",
                    "value": "0xD00080"
                  },
                  {
                    "offset": 21,
                    "addr": "0xD1A85A",
                    "value": "0xD1A860"
                  },
                  {
                    "offset": 24,
                    "addr": "0xD1A85D",
                    "value": "0x05C67C"
                  },
                  {
                    "offset": 27,
                    "addr": "0xD1A860",
                    "value": "0x08C339"
                  },
                  {
                    "offset": 30,
                    "addr": "0xD1A863",
                    "value": "0x0019B5"
                  },
                  {
                    "offset": 33,
                    "addr": "0xD1A866",
                    "value": "0xFFFFFF"
                  }
                ],
                "returnHints": [
                  "0x006810",
                  "0xD1A860",
                  "0x001727",
                  "0x020000",
                  "0x000719",
                  "0xD1A8A1"
                ],
                "ioTail": [],
                "lastIoByPort": {}
              },
              {
                "block": 13027,
                "target": "gate001c4a",
                "pc": "0x001C4A",
                "previousPc": "0x001C33",
                "routeFields": {
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
                "cpu": {
                  "pc": "0x001C4A",
                  "sp": "0xD1A875",
                  "ix": "0x000000",
                  "iy": "0xD00080",
                  "a": "0xFF",
                  "f": "0x42",
                  "af": "0xFF42",
                  "bc": "0x000003",
                  "de": "0x000430",
                  "hl": "0x3B003B",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": false,
                    "n": true,
                    "c": false
                  },
                  "halted": false,
                  "madl": 1,
                  "mbase": "0xD0"
                },
                "iyFlags": {
                  "IY+00": {
                    "addr": "0xD00080",
                    "value": "0x00"
                  },
                  "IY+0D": {
                    "addr": "0xD0008D",
                    "value": "0x0E"
                  },
                  "IY+1B": {
                    "addr": "0xD0009B",
                    "value": "0x00"
                  },
                  "IY+1F": {
                    "addr": "0xD0009F",
                    "value": "0x00"
                  },
                  "IY+23": {
                    "addr": "0xD000A3",
                    "value": "0x00"
                  },
                  "IY+27": {
                    "addr": "0xD000A7",
                    "value": "0x00"
                  },
                  "IY+28": {
                    "addr": "0xD000A8",
                    "value": "0x00"
                  },
                  "IY+2C": {
                    "addr": "0xD000AC",
                    "value": "0x00"
                  },
                  "IY+42": {
                    "addr": "0xD000C2",
                    "value": "0x00"
                  },
                  "IY+44": {
                    "addr": "0xD000C4",
                    "value": "0x00"
                  }
                },
                "bytesAtPc": [
                  "0x3E",
                  "0xFF",
                  "0xCB",
                  "0x7F",
                  "0xC9",
                  "0x23",
                  "0xCD",
                  "0xA6",
                  "0x1C",
                  "0x00",
                  "0xC9",
                  "0x21",
                  "0x01",
                  "0x00",
                  "0x3B",
                  "0xCD"
                ],
                "recentBlocks": [
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
                  "0x001C4A"
                ],
                "stack24": [
                  {
                    "offset": 0,
                    "addr": "0xD1A875",
                    "value": "0x0158D2"
                  },
                  {
                    "offset": 3,
                    "addr": "0xD1A878",
                    "value": "0x0158EC"
                  },
                  {
                    "offset": 6,
                    "addr": "0xD1A87B",
                    "value": "0x0013DA"
                  },
                  {
                    "offset": 9,
                    "addr": "0xD1A87E",
                    "value": "0x000000"
                  },
                  {
                    "offset": 12,
                    "addr": "0xD1A881",
                    "value": "0x000000"
                  },
                  {
                    "offset": 15,
                    "addr": "0xD1A884",
                    "value": "0x000000"
                  },
                  {
                    "offset": 18,
                    "addr": "0xD1A887",
                    "value": "0x000000"
                  },
                  {
                    "offset": 21,
                    "addr": "0xD1A88A",
                    "value": "0x000000"
                  },
                  {
                    "offset": 24,
                    "addr": "0xD1A88D",
                    "value": "0x008000"
                  },
                  {
                    "offset": 27,
                    "addr": "0xD1A890",
                    "value": "0x000000"
                  },
                  {
                    "offset": 30,
                    "addr": "0xD1A893",
                    "value": "0x000000"
                  },
                  {
                    "offset": 33,
                    "addr": "0xD1A896",
                    "value": "0x008000"
                  }
                ],
                "returnHints": [
                  "0x0158D2",
                  "0x0158EC",
                  "0x0013DA",
                  "0x008000",
                  "0x008000"
                ],
                "ioTail": [
                  {
                    "type": "read",
                    "block": 11490,
                    "pc": "0x03CFA4",
                    "port": "0x5015",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 11491,
                    "pc": "0x03CFCF",
                    "port": "0x5014",
                    "value": "0x10",
                    "a": "0x00",
                    "f": "0x02",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 11700,
                    "pc": "0x006816",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x02",
                    "f": "0x00",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 11707,
                    "pc": "0x03CF7D",
                    "port": "0x5016",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 11708,
                    "pc": "0x03CFA4",
                    "port": "0x5015",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 11709,
                    "pc": "0x03CFCF",
                    "port": "0x5014",
                    "value": "0x10",
                    "a": "0x00",
                    "f": "0x02",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 11893,
                    "pc": "0x006816",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x02",
                    "f": "0x00",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 11900,
                    "pc": "0x03CF7D",
                    "port": "0x5016",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 11901,
                    "pc": "0x03CFA4",
                    "port": "0x5015",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 11902,
                    "pc": "0x03CFCF",
                    "port": "0x5014",
                    "value": "0x10",
                    "a": "0x00",
                    "f": "0x02",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12082,
                    "pc": "0x006816",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x02",
                    "f": "0x00",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12089,
                    "pc": "0x03CF7D",
                    "port": "0x5016",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12090,
                    "pc": "0x03CFA4",
                    "port": "0x5015",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12091,
                    "pc": "0x03CFCF",
                    "port": "0x5014",
                    "value": "0x10",
                    "a": "0x00",
                    "f": "0x02",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12217,
                    "pc": "0x02B03B",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x00",
                    "f": "0x12",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12503,
                    "pc": "0x006816",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x02",
                    "f": "0x00",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12510,
                    "pc": "0x03CF7D",
                    "port": "0x5016",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12511,
                    "pc": "0x03CFA4",
                    "port": "0x5015",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12512,
                    "pc": "0x03CFCF",
                    "port": "0x5014",
                    "value": "0x10",
                    "a": "0x00",
                    "f": "0x02",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "write",
                    "block": 12570,
                    "pc": "0x000658",
                    "port": "0x0009",
                    "value": "0x02",
                    "a": "0x02",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12573,
                    "pc": "0x00067E",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x05",
                    "f": "0x04",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12576,
                    "pc": "0x0012E3",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x06",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12920,
                    "pc": "0x001379",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x76",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12925,
                    "pc": "0x001988",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x08",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  }
                ],
                "lastIoByPort": {
                  "0x0003": {
                    "type": "read",
                    "block": 12925,
                    "pc": "0x001988",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x08",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  "0x5016": {
                    "type": "read",
                    "block": 12510,
                    "pc": "0x03CF7D",
                    "port": "0x5016",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  "0x5015": {
                    "type": "read",
                    "block": 12511,
                    "pc": "0x03CFA4",
                    "port": "0x5015",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  "0x5014": {
                    "type": "read",
                    "block": 12512,
                    "pc": "0x03CFCF",
                    "port": "0x5014",
                    "value": "0x10",
                    "a": "0x00",
                    "f": "0x02",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  "0x5004": {
                    "type": "read",
                    "block": 11349,
                    "pc": "0x03FAA2",
                    "port": "0x5004",
                    "value": "0x11",
                    "a": "0xCC",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  "0x5005": {
                    "type": "write",
                    "block": 11366,
                    "pc": "0x048ACC",
                    "port": "0x5005",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x45",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": true
                    }
                  },
                  "0x0009": {
                    "type": "write",
                    "block": 12570,
                    "pc": "0x000658",
                    "port": "0x0009",
                    "value": "0x02",
                    "a": "0x02",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  }
                }
              },
              {
                "block": 13028,
                "target": "gate0158d2",
                "pc": "0x0158D2",
                "previousPc": "0x001C4A",
                "routeFields": {
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
                "cpu": {
                  "pc": "0x0158D2",
                  "sp": "0xD1A878",
                  "ix": "0x000000",
                  "iy": "0xD00080",
                  "a": "0xFF",
                  "f": "0x90",
                  "af": "0xFF90",
                  "bc": "0x000003",
                  "de": "0x000430",
                  "hl": "0x3B003B",
                  "flags": {
                    "s": true,
                    "z": false,
                    "h": true,
                    "pv": false,
                    "n": false,
                    "c": false
                  },
                  "halted": false,
                  "madl": 1,
                  "mbase": "0xD0"
                },
                "iyFlags": {
                  "IY+00": {
                    "addr": "0xD00080",
                    "value": "0x00"
                  },
                  "IY+0D": {
                    "addr": "0xD0008D",
                    "value": "0x0E"
                  },
                  "IY+1B": {
                    "addr": "0xD0009B",
                    "value": "0x00"
                  },
                  "IY+1F": {
                    "addr": "0xD0009F",
                    "value": "0x00"
                  },
                  "IY+23": {
                    "addr": "0xD000A3",
                    "value": "0x00"
                  },
                  "IY+27": {
                    "addr": "0xD000A7",
                    "value": "0x00"
                  },
                  "IY+28": {
                    "addr": "0xD000A8",
                    "value": "0x00"
                  },
                  "IY+2C": {
                    "addr": "0xD000AC",
                    "value": "0x00"
                  },
                  "IY+42": {
                    "addr": "0xD000C2",
                    "value": "0x00"
                  },
                  "IY+44": {
                    "addr": "0xD000C4",
                    "value": "0x00"
                  }
                },
                "bytesAtPc": [
                  "0x20",
                  "0x06",
                  "0xCD",
                  "0x4F",
                  "0x1C",
                  "0x00",
                  "0x18",
                  "0x03",
                  "0xB7",
                  "0xED",
                  "0x62",
                  "0xC9",
                  "0xFD",
                  "0x21",
                  "0x80",
                  "0x00"
                ],
                "recentBlocks": [
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
                  "0x0158D2"
                ],
                "stack24": [
                  {
                    "offset": 0,
                    "addr": "0xD1A878",
                    "value": "0x0158EC"
                  },
                  {
                    "offset": 3,
                    "addr": "0xD1A87B",
                    "value": "0x0013DA"
                  },
                  {
                    "offset": 6,
                    "addr": "0xD1A87E",
                    "value": "0x000000"
                  },
                  {
                    "offset": 9,
                    "addr": "0xD1A881",
                    "value": "0x000000"
                  },
                  {
                    "offset": 12,
                    "addr": "0xD1A884",
                    "value": "0x000000"
                  },
                  {
                    "offset": 15,
                    "addr": "0xD1A887",
                    "value": "0x000000"
                  },
                  {
                    "offset": 18,
                    "addr": "0xD1A88A",
                    "value": "0x000000"
                  },
                  {
                    "offset": 21,
                    "addr": "0xD1A88D",
                    "value": "0x008000"
                  },
                  {
                    "offset": 24,
                    "addr": "0xD1A890",
                    "value": "0x000000"
                  },
                  {
                    "offset": 27,
                    "addr": "0xD1A893",
                    "value": "0x000000"
                  },
                  {
                    "offset": 30,
                    "addr": "0xD1A896",
                    "value": "0x008000"
                  },
                  {
                    "offset": 33,
                    "addr": "0xD1A899",
                    "value": "0x000000"
                  }
                ],
                "returnHints": [
                  "0x0158EC",
                  "0x0013DA",
                  "0x008000",
                  "0x008000"
                ],
                "ioTail": [
                  {
                    "type": "read",
                    "block": 11490,
                    "pc": "0x03CFA4",
                    "port": "0x5015",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 11491,
                    "pc": "0x03CFCF",
                    "port": "0x5014",
                    "value": "0x10",
                    "a": "0x00",
                    "f": "0x02",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 11700,
                    "pc": "0x006816",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x02",
                    "f": "0x00",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 11707,
                    "pc": "0x03CF7D",
                    "port": "0x5016",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 11708,
                    "pc": "0x03CFA4",
                    "port": "0x5015",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 11709,
                    "pc": "0x03CFCF",
                    "port": "0x5014",
                    "value": "0x10",
                    "a": "0x00",
                    "f": "0x02",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 11893,
                    "pc": "0x006816",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x02",
                    "f": "0x00",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 11900,
                    "pc": "0x03CF7D",
                    "port": "0x5016",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 11901,
                    "pc": "0x03CFA4",
                    "port": "0x5015",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 11902,
                    "pc": "0x03CFCF",
                    "port": "0x5014",
                    "value": "0x10",
                    "a": "0x00",
                    "f": "0x02",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12082,
                    "pc": "0x006816",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x02",
                    "f": "0x00",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12089,
                    "pc": "0x03CF7D",
                    "port": "0x5016",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12090,
                    "pc": "0x03CFA4",
                    "port": "0x5015",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12091,
                    "pc": "0x03CFCF",
                    "port": "0x5014",
                    "value": "0x10",
                    "a": "0x00",
                    "f": "0x02",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12217,
                    "pc": "0x02B03B",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x00",
                    "f": "0x12",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12503,
                    "pc": "0x006816",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x02",
                    "f": "0x00",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12510,
                    "pc": "0x03CF7D",
                    "port": "0x5016",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12511,
                    "pc": "0x03CFA4",
                    "port": "0x5015",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12512,
                    "pc": "0x03CFCF",
                    "port": "0x5014",
                    "value": "0x10",
                    "a": "0x00",
                    "f": "0x02",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "write",
                    "block": 12570,
                    "pc": "0x000658",
                    "port": "0x0009",
                    "value": "0x02",
                    "a": "0x02",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12573,
                    "pc": "0x00067E",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x05",
                    "f": "0x04",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12576,
                    "pc": "0x0012E3",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x06",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12920,
                    "pc": "0x001379",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x76",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12925,
                    "pc": "0x001988",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x08",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  }
                ],
                "lastIoByPort": {
                  "0x0003": {
                    "type": "read",
                    "block": 12925,
                    "pc": "0x001988",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x08",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  "0x5016": {
                    "type": "read",
                    "block": 12510,
                    "pc": "0x03CF7D",
                    "port": "0x5016",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  "0x5015": {
                    "type": "read",
                    "block": 12511,
                    "pc": "0x03CFA4",
                    "port": "0x5015",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  "0x5014": {
                    "type": "read",
                    "block": 12512,
                    "pc": "0x03CFCF",
                    "port": "0x5014",
                    "value": "0x10",
                    "a": "0x00",
                    "f": "0x02",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  "0x5004": {
                    "type": "read",
                    "block": 11349,
                    "pc": "0x03FAA2",
                    "port": "0x5004",
                    "value": "0x11",
                    "a": "0xCC",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  "0x5005": {
                    "type": "write",
                    "block": 11366,
                    "pc": "0x048ACC",
                    "port": "0x5005",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x45",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": true
                    }
                  },
                  "0x0009": {
                    "type": "write",
                    "block": 12570,
                    "pc": "0x000658",
                    "port": "0x0009",
                    "value": "0x02",
                    "a": "0x02",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  }
                }
              },
              {
                "block": 13029,
                "target": "gate0158da",
                "pc": "0x0158DA",
                "previousPc": "0x0158D2",
                "routeFields": {
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
                "cpu": {
                  "pc": "0x0158DA",
                  "sp": "0xD1A878",
                  "ix": "0x000000",
                  "iy": "0xD00080",
                  "a": "0xFF",
                  "f": "0x90",
                  "af": "0xFF90",
                  "bc": "0x000003",
                  "de": "0x000430",
                  "hl": "0x3B003B",
                  "flags": {
                    "s": true,
                    "z": false,
                    "h": true,
                    "pv": false,
                    "n": false,
                    "c": false
                  },
                  "halted": false,
                  "madl": 1,
                  "mbase": "0xD0"
                },
                "iyFlags": {
                  "IY+00": {
                    "addr": "0xD00080",
                    "value": "0x00"
                  },
                  "IY+0D": {
                    "addr": "0xD0008D",
                    "value": "0x0E"
                  },
                  "IY+1B": {
                    "addr": "0xD0009B",
                    "value": "0x00"
                  },
                  "IY+1F": {
                    "addr": "0xD0009F",
                    "value": "0x00"
                  },
                  "IY+23": {
                    "addr": "0xD000A3",
                    "value": "0x00"
                  },
                  "IY+27": {
                    "addr": "0xD000A7",
                    "value": "0x00"
                  },
                  "IY+28": {
                    "addr": "0xD000A8",
                    "value": "0x00"
                  },
                  "IY+2C": {
                    "addr": "0xD000AC",
                    "value": "0x00"
                  },
                  "IY+42": {
                    "addr": "0xD000C2",
                    "value": "0x00"
                  },
                  "IY+44": {
                    "addr": "0xD000C4",
                    "value": "0x00"
                  }
                },
                "bytesAtPc": [
                  "0xB7",
                  "0xED",
                  "0x62",
                  "0xC9",
                  "0xFD",
                  "0x21",
                  "0x80",
                  "0x00",
                  "0xD0",
                  "0xFD",
                  "0xCB",
                  "0x42",
                  "0x7E",
                  "0xC0",
                  "0xCD",
                  "0xBC"
                ],
                "recentBlocks": [
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
                  "0x0158DA"
                ],
                "stack24": [
                  {
                    "offset": 0,
                    "addr": "0xD1A878",
                    "value": "0x0158EC"
                  },
                  {
                    "offset": 3,
                    "addr": "0xD1A87B",
                    "value": "0x0013DA"
                  },
                  {
                    "offset": 6,
                    "addr": "0xD1A87E",
                    "value": "0x000000"
                  },
                  {
                    "offset": 9,
                    "addr": "0xD1A881",
                    "value": "0x000000"
                  },
                  {
                    "offset": 12,
                    "addr": "0xD1A884",
                    "value": "0x000000"
                  },
                  {
                    "offset": 15,
                    "addr": "0xD1A887",
                    "value": "0x000000"
                  },
                  {
                    "offset": 18,
                    "addr": "0xD1A88A",
                    "value": "0x000000"
                  },
                  {
                    "offset": 21,
                    "addr": "0xD1A88D",
                    "value": "0x008000"
                  },
                  {
                    "offset": 24,
                    "addr": "0xD1A890",
                    "value": "0x000000"
                  },
                  {
                    "offset": 27,
                    "addr": "0xD1A893",
                    "value": "0x000000"
                  },
                  {
                    "offset": 30,
                    "addr": "0xD1A896",
                    "value": "0x008000"
                  },
                  {
                    "offset": 33,
                    "addr": "0xD1A899",
                    "value": "0x000000"
                  }
                ],
                "returnHints": [
                  "0x0158EC",
                  "0x0013DA",
                  "0x008000",
                  "0x008000"
                ],
                "ioTail": [
                  {
                    "type": "read",
                    "block": 11490,
                    "pc": "0x03CFA4",
                    "port": "0x5015",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 11491,
                    "pc": "0x03CFCF",
                    "port": "0x5014",
                    "value": "0x10",
                    "a": "0x00",
                    "f": "0x02",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 11700,
                    "pc": "0x006816",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x02",
                    "f": "0x00",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 11707,
                    "pc": "0x03CF7D",
                    "port": "0x5016",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 11708,
                    "pc": "0x03CFA4",
                    "port": "0x5015",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 11709,
                    "pc": "0x03CFCF",
                    "port": "0x5014",
                    "value": "0x10",
                    "a": "0x00",
                    "f": "0x02",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 11893,
                    "pc": "0x006816",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x02",
                    "f": "0x00",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 11900,
                    "pc": "0x03CF7D",
                    "port": "0x5016",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 11901,
                    "pc": "0x03CFA4",
                    "port": "0x5015",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 11902,
                    "pc": "0x03CFCF",
                    "port": "0x5014",
                    "value": "0x10",
                    "a": "0x00",
                    "f": "0x02",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12082,
                    "pc": "0x006816",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x02",
                    "f": "0x00",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12089,
                    "pc": "0x03CF7D",
                    "port": "0x5016",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12090,
                    "pc": "0x03CFA4",
                    "port": "0x5015",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12091,
                    "pc": "0x03CFCF",
                    "port": "0x5014",
                    "value": "0x10",
                    "a": "0x00",
                    "f": "0x02",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12217,
                    "pc": "0x02B03B",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x00",
                    "f": "0x12",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12503,
                    "pc": "0x006816",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x02",
                    "f": "0x00",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12510,
                    "pc": "0x03CF7D",
                    "port": "0x5016",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12511,
                    "pc": "0x03CFA4",
                    "port": "0x5015",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12512,
                    "pc": "0x03CFCF",
                    "port": "0x5014",
                    "value": "0x10",
                    "a": "0x00",
                    "f": "0x02",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "write",
                    "block": 12570,
                    "pc": "0x000658",
                    "port": "0x0009",
                    "value": "0x02",
                    "a": "0x02",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12573,
                    "pc": "0x00067E",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x05",
                    "f": "0x04",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12576,
                    "pc": "0x0012E3",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x06",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12920,
                    "pc": "0x001379",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x76",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12925,
                    "pc": "0x001988",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x08",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  }
                ],
                "lastIoByPort": {
                  "0x0003": {
                    "type": "read",
                    "block": 12925,
                    "pc": "0x001988",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x08",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  "0x5016": {
                    "type": "read",
                    "block": 12510,
                    "pc": "0x03CF7D",
                    "port": "0x5016",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  "0x5015": {
                    "type": "read",
                    "block": 12511,
                    "pc": "0x03CFA4",
                    "port": "0x5015",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  "0x5014": {
                    "type": "read",
                    "block": 12512,
                    "pc": "0x03CFCF",
                    "port": "0x5014",
                    "value": "0x10",
                    "a": "0x00",
                    "f": "0x02",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  "0x5004": {
                    "type": "read",
                    "block": 11349,
                    "pc": "0x03FAA2",
                    "port": "0x5004",
                    "value": "0x11",
                    "a": "0xCC",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  "0x5005": {
                    "type": "write",
                    "block": 11366,
                    "pc": "0x048ACC",
                    "port": "0x5005",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x45",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": true
                    }
                  },
                  "0x0009": {
                    "type": "write",
                    "block": 12570,
                    "pc": "0x000658",
                    "port": "0x0009",
                    "value": "0x02",
                    "a": "0x02",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  }
                }
              },
              {
                "block": 13030,
                "target": "gate0158ec",
                "pc": "0x0158EC",
                "previousPc": "0x0158DA",
                "routeFields": {
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
                "cpu": {
                  "pc": "0x0158EC",
                  "sp": "0xD1A87B",
                  "ix": "0x000000",
                  "iy": "0xD00080",
                  "a": "0xFF",
                  "f": "0x6A",
                  "af": "0xFF6A",
                  "bc": "0x000003",
                  "de": "0x000430",
                  "hl": "0x000000",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": false,
                    "n": true,
                    "c": false
                  },
                  "halted": false,
                  "madl": 1,
                  "mbase": "0xD0"
                },
                "iyFlags": {
                  "IY+00": {
                    "addr": "0xD00080",
                    "value": "0x00"
                  },
                  "IY+0D": {
                    "addr": "0xD0008D",
                    "value": "0x0E"
                  },
                  "IY+1B": {
                    "addr": "0xD0009B",
                    "value": "0x00"
                  },
                  "IY+1F": {
                    "addr": "0xD0009F",
                    "value": "0x00"
                  },
                  "IY+23": {
                    "addr": "0xD000A3",
                    "value": "0x00"
                  },
                  "IY+27": {
                    "addr": "0xD000A7",
                    "value": "0x00"
                  },
                  "IY+28": {
                    "addr": "0xD000A8",
                    "value": "0x00"
                  },
                  "IY+2C": {
                    "addr": "0xD000AC",
                    "value": "0x00"
                  },
                  "IY+42": {
                    "addr": "0xD000C2",
                    "value": "0x00"
                  },
                  "IY+44": {
                    "addr": "0xD000C4",
                    "value": "0x00"
                  }
                },
                "bytesAtPc": [
                  "0x38",
                  "0x0A",
                  "0x28",
                  "0x08",
                  "0xFD",
                  "0xCB",
                  "0x42",
                  "0xFE",
                  "0x3E",
                  "0x01",
                  "0xB7",
                  "0xC9",
                  "0xAF",
                  "0xC9",
                  "0x22",
                  "0x95"
                ],
                "recentBlocks": [
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
                  "0x0158EC"
                ],
                "stack24": [
                  {
                    "offset": 0,
                    "addr": "0xD1A87B",
                    "value": "0x0013DA"
                  },
                  {
                    "offset": 3,
                    "addr": "0xD1A87E",
                    "value": "0x000000"
                  },
                  {
                    "offset": 6,
                    "addr": "0xD1A881",
                    "value": "0x000000"
                  },
                  {
                    "offset": 9,
                    "addr": "0xD1A884",
                    "value": "0x000000"
                  },
                  {
                    "offset": 12,
                    "addr": "0xD1A887",
                    "value": "0x000000"
                  },
                  {
                    "offset": 15,
                    "addr": "0xD1A88A",
                    "value": "0x000000"
                  },
                  {
                    "offset": 18,
                    "addr": "0xD1A88D",
                    "value": "0x008000"
                  },
                  {
                    "offset": 21,
                    "addr": "0xD1A890",
                    "value": "0x000000"
                  },
                  {
                    "offset": 24,
                    "addr": "0xD1A893",
                    "value": "0x000000"
                  },
                  {
                    "offset": 27,
                    "addr": "0xD1A896",
                    "value": "0x008000"
                  },
                  {
                    "offset": 30,
                    "addr": "0xD1A899",
                    "value": "0x000000"
                  },
                  {
                    "offset": 33,
                    "addr": "0xD1A89C",
                    "value": "0x000000"
                  }
                ],
                "returnHints": [
                  "0x0013DA",
                  "0x008000",
                  "0x008000"
                ],
                "ioTail": [
                  {
                    "type": "read",
                    "block": 11490,
                    "pc": "0x03CFA4",
                    "port": "0x5015",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 11491,
                    "pc": "0x03CFCF",
                    "port": "0x5014",
                    "value": "0x10",
                    "a": "0x00",
                    "f": "0x02",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 11700,
                    "pc": "0x006816",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x02",
                    "f": "0x00",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 11707,
                    "pc": "0x03CF7D",
                    "port": "0x5016",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 11708,
                    "pc": "0x03CFA4",
                    "port": "0x5015",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 11709,
                    "pc": "0x03CFCF",
                    "port": "0x5014",
                    "value": "0x10",
                    "a": "0x00",
                    "f": "0x02",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 11893,
                    "pc": "0x006816",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x02",
                    "f": "0x00",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 11900,
                    "pc": "0x03CF7D",
                    "port": "0x5016",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 11901,
                    "pc": "0x03CFA4",
                    "port": "0x5015",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 11902,
                    "pc": "0x03CFCF",
                    "port": "0x5014",
                    "value": "0x10",
                    "a": "0x00",
                    "f": "0x02",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12082,
                    "pc": "0x006816",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x02",
                    "f": "0x00",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12089,
                    "pc": "0x03CF7D",
                    "port": "0x5016",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12090,
                    "pc": "0x03CFA4",
                    "port": "0x5015",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12091,
                    "pc": "0x03CFCF",
                    "port": "0x5014",
                    "value": "0x10",
                    "a": "0x00",
                    "f": "0x02",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12217,
                    "pc": "0x02B03B",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x00",
                    "f": "0x12",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12503,
                    "pc": "0x006816",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x02",
                    "f": "0x00",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12510,
                    "pc": "0x03CF7D",
                    "port": "0x5016",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12511,
                    "pc": "0x03CFA4",
                    "port": "0x5015",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12512,
                    "pc": "0x03CFCF",
                    "port": "0x5014",
                    "value": "0x10",
                    "a": "0x00",
                    "f": "0x02",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "write",
                    "block": 12570,
                    "pc": "0x000658",
                    "port": "0x0009",
                    "value": "0x02",
                    "a": "0x02",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12573,
                    "pc": "0x00067E",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x05",
                    "f": "0x04",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12576,
                    "pc": "0x0012E3",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x06",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12920,
                    "pc": "0x001379",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x76",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12925,
                    "pc": "0x001988",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x08",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  }
                ],
                "lastIoByPort": {
                  "0x0003": {
                    "type": "read",
                    "block": 12925,
                    "pc": "0x001988",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x08",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  "0x5016": {
                    "type": "read",
                    "block": 12510,
                    "pc": "0x03CF7D",
                    "port": "0x5016",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  "0x5015": {
                    "type": "read",
                    "block": 12511,
                    "pc": "0x03CFA4",
                    "port": "0x5015",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  "0x5014": {
                    "type": "read",
                    "block": 12512,
                    "pc": "0x03CFCF",
                    "port": "0x5014",
                    "value": "0x10",
                    "a": "0x00",
                    "f": "0x02",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  "0x5004": {
                    "type": "read",
                    "block": 11349,
                    "pc": "0x03FAA2",
                    "port": "0x5004",
                    "value": "0x11",
                    "a": "0xCC",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  "0x5005": {
                    "type": "write",
                    "block": 11366,
                    "pc": "0x048ACC",
                    "port": "0x5005",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x45",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": true
                    }
                  },
                  "0x0009": {
                    "type": "write",
                    "block": 12570,
                    "pc": "0x000658",
                    "port": "0x0009",
                    "value": "0x02",
                    "a": "0x02",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  }
                }
              },
              {
                "block": 13031,
                "target": "gate0158ee",
                "pc": "0x0158EE",
                "previousPc": "0x0158EC",
                "routeFields": {
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
                "cpu": {
                  "pc": "0x0158EE",
                  "sp": "0xD1A87B",
                  "ix": "0x000000",
                  "iy": "0xD00080",
                  "a": "0xFF",
                  "f": "0x6A",
                  "af": "0xFF6A",
                  "bc": "0x000003",
                  "de": "0x000430",
                  "hl": "0x000000",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": false,
                    "n": true,
                    "c": false
                  },
                  "halted": false,
                  "madl": 1,
                  "mbase": "0xD0"
                },
                "iyFlags": {
                  "IY+00": {
                    "addr": "0xD00080",
                    "value": "0x00"
                  },
                  "IY+0D": {
                    "addr": "0xD0008D",
                    "value": "0x0E"
                  },
                  "IY+1B": {
                    "addr": "0xD0009B",
                    "value": "0x00"
                  },
                  "IY+1F": {
                    "addr": "0xD0009F",
                    "value": "0x00"
                  },
                  "IY+23": {
                    "addr": "0xD000A3",
                    "value": "0x00"
                  },
                  "IY+27": {
                    "addr": "0xD000A7",
                    "value": "0x00"
                  },
                  "IY+28": {
                    "addr": "0xD000A8",
                    "value": "0x00"
                  },
                  "IY+2C": {
                    "addr": "0xD000AC",
                    "value": "0x00"
                  },
                  "IY+42": {
                    "addr": "0xD000C2",
                    "value": "0x00"
                  },
                  "IY+44": {
                    "addr": "0xD000C4",
                    "value": "0x00"
                  }
                },
                "bytesAtPc": [
                  "0x28",
                  "0x08",
                  "0xFD",
                  "0xCB",
                  "0x42",
                  "0xFE",
                  "0x3E",
                  "0x01",
                  "0xB7",
                  "0xC9",
                  "0xAF",
                  "0xC9",
                  "0x22",
                  "0x95",
                  "0x05",
                  "0xD0"
                ],
                "recentBlocks": [
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
                  "0x0158EE"
                ],
                "stack24": [
                  {
                    "offset": 0,
                    "addr": "0xD1A87B",
                    "value": "0x0013DA"
                  },
                  {
                    "offset": 3,
                    "addr": "0xD1A87E",
                    "value": "0x000000"
                  },
                  {
                    "offset": 6,
                    "addr": "0xD1A881",
                    "value": "0x000000"
                  },
                  {
                    "offset": 9,
                    "addr": "0xD1A884",
                    "value": "0x000000"
                  },
                  {
                    "offset": 12,
                    "addr": "0xD1A887",
                    "value": "0x000000"
                  },
                  {
                    "offset": 15,
                    "addr": "0xD1A88A",
                    "value": "0x000000"
                  },
                  {
                    "offset": 18,
                    "addr": "0xD1A88D",
                    "value": "0x008000"
                  },
                  {
                    "offset": 21,
                    "addr": "0xD1A890",
                    "value": "0x000000"
                  },
                  {
                    "offset": 24,
                    "addr": "0xD1A893",
                    "value": "0x000000"
                  },
                  {
                    "offset": 27,
                    "addr": "0xD1A896",
                    "value": "0x008000"
                  },
                  {
                    "offset": 30,
                    "addr": "0xD1A899",
                    "value": "0x000000"
                  },
                  {
                    "offset": 33,
                    "addr": "0xD1A89C",
                    "value": "0x000000"
                  }
                ],
                "returnHints": [
                  "0x0013DA",
                  "0x008000",
                  "0x008000"
                ],
                "ioTail": [
                  {
                    "type": "read",
                    "block": 11490,
                    "pc": "0x03CFA4",
                    "port": "0x5015",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 11491,
                    "pc": "0x03CFCF",
                    "port": "0x5014",
                    "value": "0x10",
                    "a": "0x00",
                    "f": "0x02",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 11700,
                    "pc": "0x006816",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x02",
                    "f": "0x00",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 11707,
                    "pc": "0x03CF7D",
                    "port": "0x5016",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 11708,
                    "pc": "0x03CFA4",
                    "port": "0x5015",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 11709,
                    "pc": "0x03CFCF",
                    "port": "0x5014",
                    "value": "0x10",
                    "a": "0x00",
                    "f": "0x02",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 11893,
                    "pc": "0x006816",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x02",
                    "f": "0x00",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 11900,
                    "pc": "0x03CF7D",
                    "port": "0x5016",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 11901,
                    "pc": "0x03CFA4",
                    "port": "0x5015",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 11902,
                    "pc": "0x03CFCF",
                    "port": "0x5014",
                    "value": "0x10",
                    "a": "0x00",
                    "f": "0x02",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12082,
                    "pc": "0x006816",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x02",
                    "f": "0x00",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12089,
                    "pc": "0x03CF7D",
                    "port": "0x5016",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12090,
                    "pc": "0x03CFA4",
                    "port": "0x5015",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12091,
                    "pc": "0x03CFCF",
                    "port": "0x5014",
                    "value": "0x10",
                    "a": "0x00",
                    "f": "0x02",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12217,
                    "pc": "0x02B03B",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x00",
                    "f": "0x12",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12503,
                    "pc": "0x006816",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x02",
                    "f": "0x00",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12510,
                    "pc": "0x03CF7D",
                    "port": "0x5016",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12511,
                    "pc": "0x03CFA4",
                    "port": "0x5015",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12512,
                    "pc": "0x03CFCF",
                    "port": "0x5014",
                    "value": "0x10",
                    "a": "0x00",
                    "f": "0x02",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "write",
                    "block": 12570,
                    "pc": "0x000658",
                    "port": "0x0009",
                    "value": "0x02",
                    "a": "0x02",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12573,
                    "pc": "0x00067E",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x05",
                    "f": "0x04",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12576,
                    "pc": "0x0012E3",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x06",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12920,
                    "pc": "0x001379",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x76",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12925,
                    "pc": "0x001988",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x08",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  }
                ],
                "lastIoByPort": {
                  "0x0003": {
                    "type": "read",
                    "block": 12925,
                    "pc": "0x001988",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x08",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  "0x5016": {
                    "type": "read",
                    "block": 12510,
                    "pc": "0x03CF7D",
                    "port": "0x5016",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  "0x5015": {
                    "type": "read",
                    "block": 12511,
                    "pc": "0x03CFA4",
                    "port": "0x5015",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  "0x5014": {
                    "type": "read",
                    "block": 12512,
                    "pc": "0x03CFCF",
                    "port": "0x5014",
                    "value": "0x10",
                    "a": "0x00",
                    "f": "0x02",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  "0x5004": {
                    "type": "read",
                    "block": 11349,
                    "pc": "0x03FAA2",
                    "port": "0x5004",
                    "value": "0x11",
                    "a": "0xCC",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  "0x5005": {
                    "type": "write",
                    "block": 11366,
                    "pc": "0x048ACC",
                    "port": "0x5005",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x45",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": true
                    }
                  },
                  "0x0009": {
                    "type": "write",
                    "block": 12570,
                    "pc": "0x000658",
                    "port": "0x0009",
                    "value": "0x02",
                    "a": "0x02",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  }
                }
              },
              {
                "block": 13032,
                "target": "gate0158f8",
                "pc": "0x0158F8",
                "previousPc": "0x0158EE",
                "routeFields": {
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
                "cpu": {
                  "pc": "0x0158F8",
                  "sp": "0xD1A87B",
                  "ix": "0x000000",
                  "iy": "0xD00080",
                  "a": "0xFF",
                  "f": "0x6A",
                  "af": "0xFF6A",
                  "bc": "0x000003",
                  "de": "0x000430",
                  "hl": "0x000000",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": false,
                    "n": true,
                    "c": false
                  },
                  "halted": false,
                  "madl": 1,
                  "mbase": "0xD0"
                },
                "iyFlags": {
                  "IY+00": {
                    "addr": "0xD00080",
                    "value": "0x00"
                  },
                  "IY+0D": {
                    "addr": "0xD0008D",
                    "value": "0x0E"
                  },
                  "IY+1B": {
                    "addr": "0xD0009B",
                    "value": "0x00"
                  },
                  "IY+1F": {
                    "addr": "0xD0009F",
                    "value": "0x00"
                  },
                  "IY+23": {
                    "addr": "0xD000A3",
                    "value": "0x00"
                  },
                  "IY+27": {
                    "addr": "0xD000A7",
                    "value": "0x00"
                  },
                  "IY+28": {
                    "addr": "0xD000A8",
                    "value": "0x00"
                  },
                  "IY+2C": {
                    "addr": "0xD000AC",
                    "value": "0x00"
                  },
                  "IY+42": {
                    "addr": "0xD000C2",
                    "value": "0x00"
                  },
                  "IY+44": {
                    "addr": "0xD000C4",
                    "value": "0x00"
                  }
                },
                "bytesAtPc": [
                  "0xAF",
                  "0xC9",
                  "0x22",
                  "0x95",
                  "0x05",
                  "0xD0",
                  "0x24",
                  "0xCD",
                  "0xC6",
                  "0x59",
                  "0x00",
                  "0xC9",
                  "0xC5",
                  "0x11",
                  "0xFC",
                  "0x05"
                ],
                "recentBlocks": [
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
                  "0x0158F8"
                ],
                "stack24": [
                  {
                    "offset": 0,
                    "addr": "0xD1A87B",
                    "value": "0x0013DA"
                  },
                  {
                    "offset": 3,
                    "addr": "0xD1A87E",
                    "value": "0x000000"
                  },
                  {
                    "offset": 6,
                    "addr": "0xD1A881",
                    "value": "0x000000"
                  },
                  {
                    "offset": 9,
                    "addr": "0xD1A884",
                    "value": "0x000000"
                  },
                  {
                    "offset": 12,
                    "addr": "0xD1A887",
                    "value": "0x000000"
                  },
                  {
                    "offset": 15,
                    "addr": "0xD1A88A",
                    "value": "0x000000"
                  },
                  {
                    "offset": 18,
                    "addr": "0xD1A88D",
                    "value": "0x008000"
                  },
                  {
                    "offset": 21,
                    "addr": "0xD1A890",
                    "value": "0x000000"
                  },
                  {
                    "offset": 24,
                    "addr": "0xD1A893",
                    "value": "0x000000"
                  },
                  {
                    "offset": 27,
                    "addr": "0xD1A896",
                    "value": "0x008000"
                  },
                  {
                    "offset": 30,
                    "addr": "0xD1A899",
                    "value": "0x000000"
                  },
                  {
                    "offset": 33,
                    "addr": "0xD1A89C",
                    "value": "0x000000"
                  }
                ],
                "returnHints": [
                  "0x0013DA",
                  "0x008000",
                  "0x008000"
                ],
                "ioTail": [
                  {
                    "type": "read",
                    "block": 11490,
                    "pc": "0x03CFA4",
                    "port": "0x5015",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 11491,
                    "pc": "0x03CFCF",
                    "port": "0x5014",
                    "value": "0x10",
                    "a": "0x00",
                    "f": "0x02",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 11700,
                    "pc": "0x006816",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x02",
                    "f": "0x00",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 11707,
                    "pc": "0x03CF7D",
                    "port": "0x5016",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 11708,
                    "pc": "0x03CFA4",
                    "port": "0x5015",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 11709,
                    "pc": "0x03CFCF",
                    "port": "0x5014",
                    "value": "0x10",
                    "a": "0x00",
                    "f": "0x02",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 11893,
                    "pc": "0x006816",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x02",
                    "f": "0x00",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 11900,
                    "pc": "0x03CF7D",
                    "port": "0x5016",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 11901,
                    "pc": "0x03CFA4",
                    "port": "0x5015",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 11902,
                    "pc": "0x03CFCF",
                    "port": "0x5014",
                    "value": "0x10",
                    "a": "0x00",
                    "f": "0x02",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12082,
                    "pc": "0x006816",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x02",
                    "f": "0x00",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12089,
                    "pc": "0x03CF7D",
                    "port": "0x5016",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12090,
                    "pc": "0x03CFA4",
                    "port": "0x5015",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12091,
                    "pc": "0x03CFCF",
                    "port": "0x5014",
                    "value": "0x10",
                    "a": "0x00",
                    "f": "0x02",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12217,
                    "pc": "0x02B03B",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x00",
                    "f": "0x12",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12503,
                    "pc": "0x006816",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x02",
                    "f": "0x00",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12510,
                    "pc": "0x03CF7D",
                    "port": "0x5016",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12511,
                    "pc": "0x03CFA4",
                    "port": "0x5015",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12512,
                    "pc": "0x03CFCF",
                    "port": "0x5014",
                    "value": "0x10",
                    "a": "0x00",
                    "f": "0x02",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "write",
                    "block": 12570,
                    "pc": "0x000658",
                    "port": "0x0009",
                    "value": "0x02",
                    "a": "0x02",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12573,
                    "pc": "0x00067E",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x05",
                    "f": "0x04",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12576,
                    "pc": "0x0012E3",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x06",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12920,
                    "pc": "0x001379",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x76",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12925,
                    "pc": "0x001988",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x08",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  }
                ],
                "lastIoByPort": {
                  "0x0003": {
                    "type": "read",
                    "block": 12925,
                    "pc": "0x001988",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x08",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  "0x5016": {
                    "type": "read",
                    "block": 12510,
                    "pc": "0x03CF7D",
                    "port": "0x5016",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  "0x5015": {
                    "type": "read",
                    "block": 12511,
                    "pc": "0x03CFA4",
                    "port": "0x5015",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  "0x5014": {
                    "type": "read",
                    "block": 12512,
                    "pc": "0x03CFCF",
                    "port": "0x5014",
                    "value": "0x10",
                    "a": "0x00",
                    "f": "0x02",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  "0x5004": {
                    "type": "read",
                    "block": 11349,
                    "pc": "0x03FAA2",
                    "port": "0x5004",
                    "value": "0x11",
                    "a": "0xCC",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  "0x5005": {
                    "type": "write",
                    "block": 11366,
                    "pc": "0x048ACC",
                    "port": "0x5005",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x45",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": true
                    }
                  },
                  "0x0009": {
                    "type": "write",
                    "block": 12570,
                    "pc": "0x000658",
                    "port": "0x0009",
                    "value": "0x02",
                    "a": "0x02",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  }
                }
              },
              {
                "block": 13131,
                "target": "gate001c4a",
                "pc": "0x001C4A",
                "previousPc": "0x001C33",
                "routeFields": {
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
                "cpu": {
                  "pc": "0x001C4A",
                  "sp": "0xD1A872",
                  "ix": "0x000000",
                  "iy": "0xD00080",
                  "a": "0xFF",
                  "f": "0x42",
                  "af": "0xFF42",
                  "bc": "0x000003",
                  "de": "0x000430",
                  "hl": "0x3B003B",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": false,
                    "n": true,
                    "c": false
                  },
                  "halted": false,
                  "madl": 1,
                  "mbase": "0xD0"
                },
                "iyFlags": {
                  "IY+00": {
                    "addr": "0xD00080",
                    "value": "0x00"
                  },
                  "IY+0D": {
                    "addr": "0xD0008D",
                    "value": "0x0E"
                  },
                  "IY+1B": {
                    "addr": "0xD0009B",
                    "value": "0x00"
                  },
                  "IY+1F": {
                    "addr": "0xD0009F",
                    "value": "0x00"
                  },
                  "IY+23": {
                    "addr": "0xD000A3",
                    "value": "0x00"
                  },
                  "IY+27": {
                    "addr": "0xD000A7",
                    "value": "0x00"
                  },
                  "IY+28": {
                    "addr": "0xD000A8",
                    "value": "0x00"
                  },
                  "IY+2C": {
                    "addr": "0xD000AC",
                    "value": "0x00"
                  },
                  "IY+42": {
                    "addr": "0xD000C2",
                    "value": "0x00"
                  },
                  "IY+44": {
                    "addr": "0xD000C4",
                    "value": "0x00"
                  }
                },
                "bytesAtPc": [
                  "0x3E",
                  "0xFF",
                  "0xCB",
                  "0x7F",
                  "0xC9",
                  "0x23",
                  "0xCD",
                  "0xA6",
                  "0x1C",
                  "0x00",
                  "0xC9",
                  "0x21",
                  "0x01",
                  "0x00",
                  "0x3B",
                  "0xCD"
                ],
                "recentBlocks": [
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
                  "0x001C4A"
                ],
                "stack24": [
                  {
                    "offset": 0,
                    "addr": "0xD1A872",
                    "value": "0x0158D2"
                  },
                  {
                    "offset": 3,
                    "addr": "0xD1A875",
                    "value": "0x0158EC"
                  },
                  {
                    "offset": 6,
                    "addr": "0xD1A878",
                    "value": "0x001872"
                  },
                  {
                    "offset": 9,
                    "addr": "0xD1A87B",
                    "value": "0x0013E8"
                  },
                  {
                    "offset": 12,
                    "addr": "0xD1A87E",
                    "value": "0x000000"
                  },
                  {
                    "offset": 15,
                    "addr": "0xD1A881",
                    "value": "0x000000"
                  },
                  {
                    "offset": 18,
                    "addr": "0xD1A884",
                    "value": "0x000000"
                  },
                  {
                    "offset": 21,
                    "addr": "0xD1A887",
                    "value": "0x000000"
                  },
                  {
                    "offset": 24,
                    "addr": "0xD1A88A",
                    "value": "0x000000"
                  },
                  {
                    "offset": 27,
                    "addr": "0xD1A88D",
                    "value": "0x008000"
                  },
                  {
                    "offset": 30,
                    "addr": "0xD1A890",
                    "value": "0x000000"
                  },
                  {
                    "offset": 33,
                    "addr": "0xD1A893",
                    "value": "0x000000"
                  }
                ],
                "returnHints": [
                  "0x0158D2",
                  "0x0158EC",
                  "0x001872",
                  "0x0013E8",
                  "0x008000"
                ],
                "ioTail": [
                  {
                    "type": "read",
                    "block": 11700,
                    "pc": "0x006816",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x02",
                    "f": "0x00",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 11707,
                    "pc": "0x03CF7D",
                    "port": "0x5016",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 11708,
                    "pc": "0x03CFA4",
                    "port": "0x5015",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 11709,
                    "pc": "0x03CFCF",
                    "port": "0x5014",
                    "value": "0x10",
                    "a": "0x00",
                    "f": "0x02",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 11893,
                    "pc": "0x006816",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x02",
                    "f": "0x00",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 11900,
                    "pc": "0x03CF7D",
                    "port": "0x5016",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 11901,
                    "pc": "0x03CFA4",
                    "port": "0x5015",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 11902,
                    "pc": "0x03CFCF",
                    "port": "0x5014",
                    "value": "0x10",
                    "a": "0x00",
                    "f": "0x02",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12082,
                    "pc": "0x006816",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x02",
                    "f": "0x00",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12089,
                    "pc": "0x03CF7D",
                    "port": "0x5016",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12090,
                    "pc": "0x03CFA4",
                    "port": "0x5015",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12091,
                    "pc": "0x03CFCF",
                    "port": "0x5014",
                    "value": "0x10",
                    "a": "0x00",
                    "f": "0x02",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12217,
                    "pc": "0x02B03B",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x00",
                    "f": "0x12",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12503,
                    "pc": "0x006816",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x02",
                    "f": "0x00",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12510,
                    "pc": "0x03CF7D",
                    "port": "0x5016",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12511,
                    "pc": "0x03CFA4",
                    "port": "0x5015",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12512,
                    "pc": "0x03CFCF",
                    "port": "0x5014",
                    "value": "0x10",
                    "a": "0x00",
                    "f": "0x02",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "write",
                    "block": 12570,
                    "pc": "0x000658",
                    "port": "0x0009",
                    "value": "0x02",
                    "a": "0x02",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12573,
                    "pc": "0x00067E",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x05",
                    "f": "0x04",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12576,
                    "pc": "0x0012E3",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x06",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12920,
                    "pc": "0x001379",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x76",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12925,
                    "pc": "0x001988",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x08",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 13035,
                    "pc": "0x001853",
                    "port": "0x0009",
                    "value": "0x02",
                    "a": "0x7F",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "write",
                    "block": 13035,
                    "pc": "0x001853",
                    "port": "0x0009",
                    "value": "0x42",
                    "a": "0x42",
                    "f": "0x00",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  }
                ],
                "lastIoByPort": {
                  "0x0003": {
                    "type": "read",
                    "block": 12925,
                    "pc": "0x001988",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x08",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  "0x5016": {
                    "type": "read",
                    "block": 12510,
                    "pc": "0x03CF7D",
                    "port": "0x5016",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  "0x5015": {
                    "type": "read",
                    "block": 12511,
                    "pc": "0x03CFA4",
                    "port": "0x5015",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  "0x5014": {
                    "type": "read",
                    "block": 12512,
                    "pc": "0x03CFCF",
                    "port": "0x5014",
                    "value": "0x10",
                    "a": "0x00",
                    "f": "0x02",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  "0x5004": {
                    "type": "read",
                    "block": 11349,
                    "pc": "0x03FAA2",
                    "port": "0x5004",
                    "value": "0x11",
                    "a": "0xCC",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  "0x5005": {
                    "type": "write",
                    "block": 11366,
                    "pc": "0x048ACC",
                    "port": "0x5005",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x45",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": true
                    }
                  },
                  "0x0009": {
                    "type": "write",
                    "block": 13035,
                    "pc": "0x001853",
                    "port": "0x0009",
                    "value": "0x42",
                    "a": "0x42",
                    "f": "0x00",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  }
                }
              },
              {
                "block": 13132,
                "target": "gate0158d2",
                "pc": "0x0158D2",
                "previousPc": "0x001C4A",
                "routeFields": {
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
                "cpu": {
                  "pc": "0x0158D2",
                  "sp": "0xD1A875",
                  "ix": "0x000000",
                  "iy": "0xD00080",
                  "a": "0xFF",
                  "f": "0x90",
                  "af": "0xFF90",
                  "bc": "0x000003",
                  "de": "0x000430",
                  "hl": "0x3B003B",
                  "flags": {
                    "s": true,
                    "z": false,
                    "h": true,
                    "pv": false,
                    "n": false,
                    "c": false
                  },
                  "halted": false,
                  "madl": 1,
                  "mbase": "0xD0"
                },
                "iyFlags": {
                  "IY+00": {
                    "addr": "0xD00080",
                    "value": "0x00"
                  },
                  "IY+0D": {
                    "addr": "0xD0008D",
                    "value": "0x0E"
                  },
                  "IY+1B": {
                    "addr": "0xD0009B",
                    "value": "0x00"
                  },
                  "IY+1F": {
                    "addr": "0xD0009F",
                    "value": "0x00"
                  },
                  "IY+23": {
                    "addr": "0xD000A3",
                    "value": "0x00"
                  },
                  "IY+27": {
                    "addr": "0xD000A7",
                    "value": "0x00"
                  },
                  "IY+28": {
                    "addr": "0xD000A8",
                    "value": "0x00"
                  },
                  "IY+2C": {
                    "addr": "0xD000AC",
                    "value": "0x00"
                  },
                  "IY+42": {
                    "addr": "0xD000C2",
                    "value": "0x00"
                  },
                  "IY+44": {
                    "addr": "0xD000C4",
                    "value": "0x00"
                  }
                },
                "bytesAtPc": [
                  "0x20",
                  "0x06",
                  "0xCD",
                  "0x4F",
                  "0x1C",
                  "0x00",
                  "0x18",
                  "0x03",
                  "0xB7",
                  "0xED",
                  "0x62",
                  "0xC9",
                  "0xFD",
                  "0x21",
                  "0x80",
                  "0x00"
                ],
                "recentBlocks": [
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
                  "0x0158D2"
                ],
                "stack24": [
                  {
                    "offset": 0,
                    "addr": "0xD1A875",
                    "value": "0x0158EC"
                  },
                  {
                    "offset": 3,
                    "addr": "0xD1A878",
                    "value": "0x001872"
                  },
                  {
                    "offset": 6,
                    "addr": "0xD1A87B",
                    "value": "0x0013E8"
                  },
                  {
                    "offset": 9,
                    "addr": "0xD1A87E",
                    "value": "0x000000"
                  },
                  {
                    "offset": 12,
                    "addr": "0xD1A881",
                    "value": "0x000000"
                  },
                  {
                    "offset": 15,
                    "addr": "0xD1A884",
                    "value": "0x000000"
                  },
                  {
                    "offset": 18,
                    "addr": "0xD1A887",
                    "value": "0x000000"
                  },
                  {
                    "offset": 21,
                    "addr": "0xD1A88A",
                    "value": "0x000000"
                  },
                  {
                    "offset": 24,
                    "addr": "0xD1A88D",
                    "value": "0x008000"
                  },
                  {
                    "offset": 27,
                    "addr": "0xD1A890",
                    "value": "0x000000"
                  },
                  {
                    "offset": 30,
                    "addr": "0xD1A893",
                    "value": "0x000000"
                  },
                  {
                    "offset": 33,
                    "addr": "0xD1A896",
                    "value": "0x008000"
                  }
                ],
                "returnHints": [
                  "0x0158EC",
                  "0x001872",
                  "0x0013E8",
                  "0x008000",
                  "0x008000"
                ],
                "ioTail": [
                  {
                    "type": "read",
                    "block": 11700,
                    "pc": "0x006816",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x02",
                    "f": "0x00",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 11707,
                    "pc": "0x03CF7D",
                    "port": "0x5016",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 11708,
                    "pc": "0x03CFA4",
                    "port": "0x5015",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 11709,
                    "pc": "0x03CFCF",
                    "port": "0x5014",
                    "value": "0x10",
                    "a": "0x00",
                    "f": "0x02",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 11893,
                    "pc": "0x006816",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x02",
                    "f": "0x00",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 11900,
                    "pc": "0x03CF7D",
                    "port": "0x5016",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 11901,
                    "pc": "0x03CFA4",
                    "port": "0x5015",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 11902,
                    "pc": "0x03CFCF",
                    "port": "0x5014",
                    "value": "0x10",
                    "a": "0x00",
                    "f": "0x02",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12082,
                    "pc": "0x006816",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x02",
                    "f": "0x00",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12089,
                    "pc": "0x03CF7D",
                    "port": "0x5016",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12090,
                    "pc": "0x03CFA4",
                    "port": "0x5015",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12091,
                    "pc": "0x03CFCF",
                    "port": "0x5014",
                    "value": "0x10",
                    "a": "0x00",
                    "f": "0x02",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12217,
                    "pc": "0x02B03B",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x00",
                    "f": "0x12",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12503,
                    "pc": "0x006816",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x02",
                    "f": "0x00",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12510,
                    "pc": "0x03CF7D",
                    "port": "0x5016",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12511,
                    "pc": "0x03CFA4",
                    "port": "0x5015",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12512,
                    "pc": "0x03CFCF",
                    "port": "0x5014",
                    "value": "0x10",
                    "a": "0x00",
                    "f": "0x02",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "write",
                    "block": 12570,
                    "pc": "0x000658",
                    "port": "0x0009",
                    "value": "0x02",
                    "a": "0x02",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12573,
                    "pc": "0x00067E",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x05",
                    "f": "0x04",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12576,
                    "pc": "0x0012E3",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x06",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12920,
                    "pc": "0x001379",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x76",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12925,
                    "pc": "0x001988",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x08",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 13035,
                    "pc": "0x001853",
                    "port": "0x0009",
                    "value": "0x02",
                    "a": "0x7F",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "write",
                    "block": 13035,
                    "pc": "0x001853",
                    "port": "0x0009",
                    "value": "0x42",
                    "a": "0x42",
                    "f": "0x00",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  }
                ],
                "lastIoByPort": {
                  "0x0003": {
                    "type": "read",
                    "block": 12925,
                    "pc": "0x001988",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x08",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  "0x5016": {
                    "type": "read",
                    "block": 12510,
                    "pc": "0x03CF7D",
                    "port": "0x5016",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  "0x5015": {
                    "type": "read",
                    "block": 12511,
                    "pc": "0x03CFA4",
                    "port": "0x5015",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  "0x5014": {
                    "type": "read",
                    "block": 12512,
                    "pc": "0x03CFCF",
                    "port": "0x5014",
                    "value": "0x10",
                    "a": "0x00",
                    "f": "0x02",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  "0x5004": {
                    "type": "read",
                    "block": 11349,
                    "pc": "0x03FAA2",
                    "port": "0x5004",
                    "value": "0x11",
                    "a": "0xCC",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  "0x5005": {
                    "type": "write",
                    "block": 11366,
                    "pc": "0x048ACC",
                    "port": "0x5005",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x45",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": true
                    }
                  },
                  "0x0009": {
                    "type": "write",
                    "block": 13035,
                    "pc": "0x001853",
                    "port": "0x0009",
                    "value": "0x42",
                    "a": "0x42",
                    "f": "0x00",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  }
                }
              },
              {
                "block": 13133,
                "target": "gate0158da",
                "pc": "0x0158DA",
                "previousPc": "0x0158D2",
                "routeFields": {
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
                "cpu": {
                  "pc": "0x0158DA",
                  "sp": "0xD1A875",
                  "ix": "0x000000",
                  "iy": "0xD00080",
                  "a": "0xFF",
                  "f": "0x90",
                  "af": "0xFF90",
                  "bc": "0x000003",
                  "de": "0x000430",
                  "hl": "0x3B003B",
                  "flags": {
                    "s": true,
                    "z": false,
                    "h": true,
                    "pv": false,
                    "n": false,
                    "c": false
                  },
                  "halted": false,
                  "madl": 1,
                  "mbase": "0xD0"
                },
                "iyFlags": {
                  "IY+00": {
                    "addr": "0xD00080",
                    "value": "0x00"
                  },
                  "IY+0D": {
                    "addr": "0xD0008D",
                    "value": "0x0E"
                  },
                  "IY+1B": {
                    "addr": "0xD0009B",
                    "value": "0x00"
                  },
                  "IY+1F": {
                    "addr": "0xD0009F",
                    "value": "0x00"
                  },
                  "IY+23": {
                    "addr": "0xD000A3",
                    "value": "0x00"
                  },
                  "IY+27": {
                    "addr": "0xD000A7",
                    "value": "0x00"
                  },
                  "IY+28": {
                    "addr": "0xD000A8",
                    "value": "0x00"
                  },
                  "IY+2C": {
                    "addr": "0xD000AC",
                    "value": "0x00"
                  },
                  "IY+42": {
                    "addr": "0xD000C2",
                    "value": "0x00"
                  },
                  "IY+44": {
                    "addr": "0xD000C4",
                    "value": "0x00"
                  }
                },
                "bytesAtPc": [
                  "0xB7",
                  "0xED",
                  "0x62",
                  "0xC9",
                  "0xFD",
                  "0x21",
                  "0x80",
                  "0x00",
                  "0xD0",
                  "0xFD",
                  "0xCB",
                  "0x42",
                  "0x7E",
                  "0xC0",
                  "0xCD",
                  "0xBC"
                ],
                "recentBlocks": [
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
                  "0x0158DA"
                ],
                "stack24": [
                  {
                    "offset": 0,
                    "addr": "0xD1A875",
                    "value": "0x0158EC"
                  },
                  {
                    "offset": 3,
                    "addr": "0xD1A878",
                    "value": "0x001872"
                  },
                  {
                    "offset": 6,
                    "addr": "0xD1A87B",
                    "value": "0x0013E8"
                  },
                  {
                    "offset": 9,
                    "addr": "0xD1A87E",
                    "value": "0x000000"
                  },
                  {
                    "offset": 12,
                    "addr": "0xD1A881",
                    "value": "0x000000"
                  },
                  {
                    "offset": 15,
                    "addr": "0xD1A884",
                    "value": "0x000000"
                  },
                  {
                    "offset": 18,
                    "addr": "0xD1A887",
                    "value": "0x000000"
                  },
                  {
                    "offset": 21,
                    "addr": "0xD1A88A",
                    "value": "0x000000"
                  },
                  {
                    "offset": 24,
                    "addr": "0xD1A88D",
                    "value": "0x008000"
                  },
                  {
                    "offset": 27,
                    "addr": "0xD1A890",
                    "value": "0x000000"
                  },
                  {
                    "offset": 30,
                    "addr": "0xD1A893",
                    "value": "0x000000"
                  },
                  {
                    "offset": 33,
                    "addr": "0xD1A896",
                    "value": "0x008000"
                  }
                ],
                "returnHints": [
                  "0x0158EC",
                  "0x001872",
                  "0x0013E8",
                  "0x008000",
                  "0x008000"
                ],
                "ioTail": [
                  {
                    "type": "read",
                    "block": 11700,
                    "pc": "0x006816",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x02",
                    "f": "0x00",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 11707,
                    "pc": "0x03CF7D",
                    "port": "0x5016",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 11708,
                    "pc": "0x03CFA4",
                    "port": "0x5015",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 11709,
                    "pc": "0x03CFCF",
                    "port": "0x5014",
                    "value": "0x10",
                    "a": "0x00",
                    "f": "0x02",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 11893,
                    "pc": "0x006816",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x02",
                    "f": "0x00",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 11900,
                    "pc": "0x03CF7D",
                    "port": "0x5016",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 11901,
                    "pc": "0x03CFA4",
                    "port": "0x5015",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 11902,
                    "pc": "0x03CFCF",
                    "port": "0x5014",
                    "value": "0x10",
                    "a": "0x00",
                    "f": "0x02",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12082,
                    "pc": "0x006816",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x02",
                    "f": "0x00",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12089,
                    "pc": "0x03CF7D",
                    "port": "0x5016",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12090,
                    "pc": "0x03CFA4",
                    "port": "0x5015",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12091,
                    "pc": "0x03CFCF",
                    "port": "0x5014",
                    "value": "0x10",
                    "a": "0x00",
                    "f": "0x02",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12217,
                    "pc": "0x02B03B",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x00",
                    "f": "0x12",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12503,
                    "pc": "0x006816",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x02",
                    "f": "0x00",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12510,
                    "pc": "0x03CF7D",
                    "port": "0x5016",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12511,
                    "pc": "0x03CFA4",
                    "port": "0x5015",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12512,
                    "pc": "0x03CFCF",
                    "port": "0x5014",
                    "value": "0x10",
                    "a": "0x00",
                    "f": "0x02",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "write",
                    "block": 12570,
                    "pc": "0x000658",
                    "port": "0x0009",
                    "value": "0x02",
                    "a": "0x02",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12573,
                    "pc": "0x00067E",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x05",
                    "f": "0x04",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12576,
                    "pc": "0x0012E3",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x06",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12920,
                    "pc": "0x001379",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x76",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12925,
                    "pc": "0x001988",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x08",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 13035,
                    "pc": "0x001853",
                    "port": "0x0009",
                    "value": "0x02",
                    "a": "0x7F",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "write",
                    "block": 13035,
                    "pc": "0x001853",
                    "port": "0x0009",
                    "value": "0x42",
                    "a": "0x42",
                    "f": "0x00",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  }
                ],
                "lastIoByPort": {
                  "0x0003": {
                    "type": "read",
                    "block": 12925,
                    "pc": "0x001988",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x08",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  "0x5016": {
                    "type": "read",
                    "block": 12510,
                    "pc": "0x03CF7D",
                    "port": "0x5016",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  "0x5015": {
                    "type": "read",
                    "block": 12511,
                    "pc": "0x03CFA4",
                    "port": "0x5015",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  "0x5014": {
                    "type": "read",
                    "block": 12512,
                    "pc": "0x03CFCF",
                    "port": "0x5014",
                    "value": "0x10",
                    "a": "0x00",
                    "f": "0x02",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  "0x5004": {
                    "type": "read",
                    "block": 11349,
                    "pc": "0x03FAA2",
                    "port": "0x5004",
                    "value": "0x11",
                    "a": "0xCC",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  "0x5005": {
                    "type": "write",
                    "block": 11366,
                    "pc": "0x048ACC",
                    "port": "0x5005",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x45",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": true
                    }
                  },
                  "0x0009": {
                    "type": "write",
                    "block": 13035,
                    "pc": "0x001853",
                    "port": "0x0009",
                    "value": "0x42",
                    "a": "0x42",
                    "f": "0x00",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  }
                }
              },
              {
                "block": 13134,
                "target": "gate0158ec",
                "pc": "0x0158EC",
                "previousPc": "0x0158DA",
                "routeFields": {
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
                "cpu": {
                  "pc": "0x0158EC",
                  "sp": "0xD1A878",
                  "ix": "0x000000",
                  "iy": "0xD00080",
                  "a": "0xFF",
                  "f": "0x6A",
                  "af": "0xFF6A",
                  "bc": "0x000003",
                  "de": "0x000430",
                  "hl": "0x000000",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": false,
                    "n": true,
                    "c": false
                  },
                  "halted": false,
                  "madl": 1,
                  "mbase": "0xD0"
                },
                "iyFlags": {
                  "IY+00": {
                    "addr": "0xD00080",
                    "value": "0x00"
                  },
                  "IY+0D": {
                    "addr": "0xD0008D",
                    "value": "0x0E"
                  },
                  "IY+1B": {
                    "addr": "0xD0009B",
                    "value": "0x00"
                  },
                  "IY+1F": {
                    "addr": "0xD0009F",
                    "value": "0x00"
                  },
                  "IY+23": {
                    "addr": "0xD000A3",
                    "value": "0x00"
                  },
                  "IY+27": {
                    "addr": "0xD000A7",
                    "value": "0x00"
                  },
                  "IY+28": {
                    "addr": "0xD000A8",
                    "value": "0x00"
                  },
                  "IY+2C": {
                    "addr": "0xD000AC",
                    "value": "0x00"
                  },
                  "IY+42": {
                    "addr": "0xD000C2",
                    "value": "0x00"
                  },
                  "IY+44": {
                    "addr": "0xD000C4",
                    "value": "0x00"
                  }
                },
                "bytesAtPc": [
                  "0x38",
                  "0x0A",
                  "0x28",
                  "0x08",
                  "0xFD",
                  "0xCB",
                  "0x42",
                  "0xFE",
                  "0x3E",
                  "0x01",
                  "0xB7",
                  "0xC9",
                  "0xAF",
                  "0xC9",
                  "0x22",
                  "0x95"
                ],
                "recentBlocks": [
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
                  "0x0158EC"
                ],
                "stack24": [
                  {
                    "offset": 0,
                    "addr": "0xD1A878",
                    "value": "0x001872"
                  },
                  {
                    "offset": 3,
                    "addr": "0xD1A87B",
                    "value": "0x0013E8"
                  },
                  {
                    "offset": 6,
                    "addr": "0xD1A87E",
                    "value": "0x000000"
                  },
                  {
                    "offset": 9,
                    "addr": "0xD1A881",
                    "value": "0x000000"
                  },
                  {
                    "offset": 12,
                    "addr": "0xD1A884",
                    "value": "0x000000"
                  },
                  {
                    "offset": 15,
                    "addr": "0xD1A887",
                    "value": "0x000000"
                  },
                  {
                    "offset": 18,
                    "addr": "0xD1A88A",
                    "value": "0x000000"
                  },
                  {
                    "offset": 21,
                    "addr": "0xD1A88D",
                    "value": "0x008000"
                  },
                  {
                    "offset": 24,
                    "addr": "0xD1A890",
                    "value": "0x000000"
                  },
                  {
                    "offset": 27,
                    "addr": "0xD1A893",
                    "value": "0x000000"
                  },
                  {
                    "offset": 30,
                    "addr": "0xD1A896",
                    "value": "0x008000"
                  },
                  {
                    "offset": 33,
                    "addr": "0xD1A899",
                    "value": "0x000000"
                  }
                ],
                "returnHints": [
                  "0x001872",
                  "0x0013E8",
                  "0x008000",
                  "0x008000"
                ],
                "ioTail": [
                  {
                    "type": "read",
                    "block": 11700,
                    "pc": "0x006816",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x02",
                    "f": "0x00",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 11707,
                    "pc": "0x03CF7D",
                    "port": "0x5016",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 11708,
                    "pc": "0x03CFA4",
                    "port": "0x5015",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 11709,
                    "pc": "0x03CFCF",
                    "port": "0x5014",
                    "value": "0x10",
                    "a": "0x00",
                    "f": "0x02",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 11893,
                    "pc": "0x006816",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x02",
                    "f": "0x00",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 11900,
                    "pc": "0x03CF7D",
                    "port": "0x5016",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 11901,
                    "pc": "0x03CFA4",
                    "port": "0x5015",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 11902,
                    "pc": "0x03CFCF",
                    "port": "0x5014",
                    "value": "0x10",
                    "a": "0x00",
                    "f": "0x02",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12082,
                    "pc": "0x006816",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x02",
                    "f": "0x00",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12089,
                    "pc": "0x03CF7D",
                    "port": "0x5016",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12090,
                    "pc": "0x03CFA4",
                    "port": "0x5015",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12091,
                    "pc": "0x03CFCF",
                    "port": "0x5014",
                    "value": "0x10",
                    "a": "0x00",
                    "f": "0x02",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12217,
                    "pc": "0x02B03B",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x00",
                    "f": "0x12",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12503,
                    "pc": "0x006816",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x02",
                    "f": "0x00",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12510,
                    "pc": "0x03CF7D",
                    "port": "0x5016",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12511,
                    "pc": "0x03CFA4",
                    "port": "0x5015",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12512,
                    "pc": "0x03CFCF",
                    "port": "0x5014",
                    "value": "0x10",
                    "a": "0x00",
                    "f": "0x02",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "write",
                    "block": 12570,
                    "pc": "0x000658",
                    "port": "0x0009",
                    "value": "0x02",
                    "a": "0x02",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12573,
                    "pc": "0x00067E",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x05",
                    "f": "0x04",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12576,
                    "pc": "0x0012E3",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x06",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12920,
                    "pc": "0x001379",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x76",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12925,
                    "pc": "0x001988",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x08",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 13035,
                    "pc": "0x001853",
                    "port": "0x0009",
                    "value": "0x02",
                    "a": "0x7F",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "write",
                    "block": 13035,
                    "pc": "0x001853",
                    "port": "0x0009",
                    "value": "0x42",
                    "a": "0x42",
                    "f": "0x00",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  }
                ],
                "lastIoByPort": {
                  "0x0003": {
                    "type": "read",
                    "block": 12925,
                    "pc": "0x001988",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x08",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  "0x5016": {
                    "type": "read",
                    "block": 12510,
                    "pc": "0x03CF7D",
                    "port": "0x5016",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  "0x5015": {
                    "type": "read",
                    "block": 12511,
                    "pc": "0x03CFA4",
                    "port": "0x5015",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  "0x5014": {
                    "type": "read",
                    "block": 12512,
                    "pc": "0x03CFCF",
                    "port": "0x5014",
                    "value": "0x10",
                    "a": "0x00",
                    "f": "0x02",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  "0x5004": {
                    "type": "read",
                    "block": 11349,
                    "pc": "0x03FAA2",
                    "port": "0x5004",
                    "value": "0x11",
                    "a": "0xCC",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  "0x5005": {
                    "type": "write",
                    "block": 11366,
                    "pc": "0x048ACC",
                    "port": "0x5005",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x45",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": true
                    }
                  },
                  "0x0009": {
                    "type": "write",
                    "block": 13035,
                    "pc": "0x001853",
                    "port": "0x0009",
                    "value": "0x42",
                    "a": "0x42",
                    "f": "0x00",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  }
                }
              },
              {
                "block": 13135,
                "target": "gate0158ee",
                "pc": "0x0158EE",
                "previousPc": "0x0158EC",
                "routeFields": {
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
                "cpu": {
                  "pc": "0x0158EE",
                  "sp": "0xD1A878",
                  "ix": "0x000000",
                  "iy": "0xD00080",
                  "a": "0xFF",
                  "f": "0x6A",
                  "af": "0xFF6A",
                  "bc": "0x000003",
                  "de": "0x000430",
                  "hl": "0x000000",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": false,
                    "n": true,
                    "c": false
                  },
                  "halted": false,
                  "madl": 1,
                  "mbase": "0xD0"
                },
                "iyFlags": {
                  "IY+00": {
                    "addr": "0xD00080",
                    "value": "0x00"
                  },
                  "IY+0D": {
                    "addr": "0xD0008D",
                    "value": "0x0E"
                  },
                  "IY+1B": {
                    "addr": "0xD0009B",
                    "value": "0x00"
                  },
                  "IY+1F": {
                    "addr": "0xD0009F",
                    "value": "0x00"
                  },
                  "IY+23": {
                    "addr": "0xD000A3",
                    "value": "0x00"
                  },
                  "IY+27": {
                    "addr": "0xD000A7",
                    "value": "0x00"
                  },
                  "IY+28": {
                    "addr": "0xD000A8",
                    "value": "0x00"
                  },
                  "IY+2C": {
                    "addr": "0xD000AC",
                    "value": "0x00"
                  },
                  "IY+42": {
                    "addr": "0xD000C2",
                    "value": "0x00"
                  },
                  "IY+44": {
                    "addr": "0xD000C4",
                    "value": "0x00"
                  }
                },
                "bytesAtPc": [
                  "0x28",
                  "0x08",
                  "0xFD",
                  "0xCB",
                  "0x42",
                  "0xFE",
                  "0x3E",
                  "0x01",
                  "0xB7",
                  "0xC9",
                  "0xAF",
                  "0xC9",
                  "0x22",
                  "0x95",
                  "0x05",
                  "0xD0"
                ],
                "recentBlocks": [
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
                  "0x0158EE"
                ],
                "stack24": [
                  {
                    "offset": 0,
                    "addr": "0xD1A878",
                    "value": "0x001872"
                  },
                  {
                    "offset": 3,
                    "addr": "0xD1A87B",
                    "value": "0x0013E8"
                  },
                  {
                    "offset": 6,
                    "addr": "0xD1A87E",
                    "value": "0x000000"
                  },
                  {
                    "offset": 9,
                    "addr": "0xD1A881",
                    "value": "0x000000"
                  },
                  {
                    "offset": 12,
                    "addr": "0xD1A884",
                    "value": "0x000000"
                  },
                  {
                    "offset": 15,
                    "addr": "0xD1A887",
                    "value": "0x000000"
                  },
                  {
                    "offset": 18,
                    "addr": "0xD1A88A",
                    "value": "0x000000"
                  },
                  {
                    "offset": 21,
                    "addr": "0xD1A88D",
                    "value": "0x008000"
                  },
                  {
                    "offset": 24,
                    "addr": "0xD1A890",
                    "value": "0x000000"
                  },
                  {
                    "offset": 27,
                    "addr": "0xD1A893",
                    "value": "0x000000"
                  },
                  {
                    "offset": 30,
                    "addr": "0xD1A896",
                    "value": "0x008000"
                  },
                  {
                    "offset": 33,
                    "addr": "0xD1A899",
                    "value": "0x000000"
                  }
                ],
                "returnHints": [
                  "0x001872",
                  "0x0013E8",
                  "0x008000",
                  "0x008000"
                ],
                "ioTail": [
                  {
                    "type": "read",
                    "block": 11700,
                    "pc": "0x006816",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x02",
                    "f": "0x00",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 11707,
                    "pc": "0x03CF7D",
                    "port": "0x5016",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 11708,
                    "pc": "0x03CFA4",
                    "port": "0x5015",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 11709,
                    "pc": "0x03CFCF",
                    "port": "0x5014",
                    "value": "0x10",
                    "a": "0x00",
                    "f": "0x02",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 11893,
                    "pc": "0x006816",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x02",
                    "f": "0x00",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 11900,
                    "pc": "0x03CF7D",
                    "port": "0x5016",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 11901,
                    "pc": "0x03CFA4",
                    "port": "0x5015",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 11902,
                    "pc": "0x03CFCF",
                    "port": "0x5014",
                    "value": "0x10",
                    "a": "0x00",
                    "f": "0x02",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12082,
                    "pc": "0x006816",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x02",
                    "f": "0x00",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12089,
                    "pc": "0x03CF7D",
                    "port": "0x5016",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12090,
                    "pc": "0x03CFA4",
                    "port": "0x5015",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12091,
                    "pc": "0x03CFCF",
                    "port": "0x5014",
                    "value": "0x10",
                    "a": "0x00",
                    "f": "0x02",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12217,
                    "pc": "0x02B03B",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x00",
                    "f": "0x12",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12503,
                    "pc": "0x006816",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x02",
                    "f": "0x00",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12510,
                    "pc": "0x03CF7D",
                    "port": "0x5016",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12511,
                    "pc": "0x03CFA4",
                    "port": "0x5015",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12512,
                    "pc": "0x03CFCF",
                    "port": "0x5014",
                    "value": "0x10",
                    "a": "0x00",
                    "f": "0x02",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "write",
                    "block": 12570,
                    "pc": "0x000658",
                    "port": "0x0009",
                    "value": "0x02",
                    "a": "0x02",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12573,
                    "pc": "0x00067E",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x05",
                    "f": "0x04",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12576,
                    "pc": "0x0012E3",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x06",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12920,
                    "pc": "0x001379",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x76",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12925,
                    "pc": "0x001988",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x08",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 13035,
                    "pc": "0x001853",
                    "port": "0x0009",
                    "value": "0x02",
                    "a": "0x7F",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "write",
                    "block": 13035,
                    "pc": "0x001853",
                    "port": "0x0009",
                    "value": "0x42",
                    "a": "0x42",
                    "f": "0x00",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  }
                ],
                "lastIoByPort": {
                  "0x0003": {
                    "type": "read",
                    "block": 12925,
                    "pc": "0x001988",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x08",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  "0x5016": {
                    "type": "read",
                    "block": 12510,
                    "pc": "0x03CF7D",
                    "port": "0x5016",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  "0x5015": {
                    "type": "read",
                    "block": 12511,
                    "pc": "0x03CFA4",
                    "port": "0x5015",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  "0x5014": {
                    "type": "read",
                    "block": 12512,
                    "pc": "0x03CFCF",
                    "port": "0x5014",
                    "value": "0x10",
                    "a": "0x00",
                    "f": "0x02",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  "0x5004": {
                    "type": "read",
                    "block": 11349,
                    "pc": "0x03FAA2",
                    "port": "0x5004",
                    "value": "0x11",
                    "a": "0xCC",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  "0x5005": {
                    "type": "write",
                    "block": 11366,
                    "pc": "0x048ACC",
                    "port": "0x5005",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x45",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": true
                    }
                  },
                  "0x0009": {
                    "type": "write",
                    "block": 13035,
                    "pc": "0x001853",
                    "port": "0x0009",
                    "value": "0x42",
                    "a": "0x42",
                    "f": "0x00",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  }
                }
              },
              {
                "block": 13136,
                "target": "gate0158f8",
                "pc": "0x0158F8",
                "previousPc": "0x0158EE",
                "routeFields": {
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
                "cpu": {
                  "pc": "0x0158F8",
                  "sp": "0xD1A878",
                  "ix": "0x000000",
                  "iy": "0xD00080",
                  "a": "0xFF",
                  "f": "0x6A",
                  "af": "0xFF6A",
                  "bc": "0x000003",
                  "de": "0x000430",
                  "hl": "0x000000",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": false,
                    "n": true,
                    "c": false
                  },
                  "halted": false,
                  "madl": 1,
                  "mbase": "0xD0"
                },
                "iyFlags": {
                  "IY+00": {
                    "addr": "0xD00080",
                    "value": "0x00"
                  },
                  "IY+0D": {
                    "addr": "0xD0008D",
                    "value": "0x0E"
                  },
                  "IY+1B": {
                    "addr": "0xD0009B",
                    "value": "0x00"
                  },
                  "IY+1F": {
                    "addr": "0xD0009F",
                    "value": "0x00"
                  },
                  "IY+23": {
                    "addr": "0xD000A3",
                    "value": "0x00"
                  },
                  "IY+27": {
                    "addr": "0xD000A7",
                    "value": "0x00"
                  },
                  "IY+28": {
                    "addr": "0xD000A8",
                    "value": "0x00"
                  },
                  "IY+2C": {
                    "addr": "0xD000AC",
                    "value": "0x00"
                  },
                  "IY+42": {
                    "addr": "0xD000C2",
                    "value": "0x00"
                  },
                  "IY+44": {
                    "addr": "0xD000C4",
                    "value": "0x00"
                  }
                },
                "bytesAtPc": [
                  "0xAF",
                  "0xC9",
                  "0x22",
                  "0x95",
                  "0x05",
                  "0xD0",
                  "0x24",
                  "0xCD",
                  "0xC6",
                  "0x59",
                  "0x00",
                  "0xC9",
                  "0xC5",
                  "0x11",
                  "0xFC",
                  "0x05"
                ],
                "recentBlocks": [
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
                  "0x0158F8"
                ],
                "stack24": [
                  {
                    "offset": 0,
                    "addr": "0xD1A878",
                    "value": "0x001872"
                  },
                  {
                    "offset": 3,
                    "addr": "0xD1A87B",
                    "value": "0x0013E8"
                  },
                  {
                    "offset": 6,
                    "addr": "0xD1A87E",
                    "value": "0x000000"
                  },
                  {
                    "offset": 9,
                    "addr": "0xD1A881",
                    "value": "0x000000"
                  },
                  {
                    "offset": 12,
                    "addr": "0xD1A884",
                    "value": "0x000000"
                  },
                  {
                    "offset": 15,
                    "addr": "0xD1A887",
                    "value": "0x000000"
                  },
                  {
                    "offset": 18,
                    "addr": "0xD1A88A",
                    "value": "0x000000"
                  },
                  {
                    "offset": 21,
                    "addr": "0xD1A88D",
                    "value": "0x008000"
                  },
                  {
                    "offset": 24,
                    "addr": "0xD1A890",
                    "value": "0x000000"
                  },
                  {
                    "offset": 27,
                    "addr": "0xD1A893",
                    "value": "0x000000"
                  },
                  {
                    "offset": 30,
                    "addr": "0xD1A896",
                    "value": "0x008000"
                  },
                  {
                    "offset": 33,
                    "addr": "0xD1A899",
                    "value": "0x000000"
                  }
                ],
                "returnHints": [
                  "0x001872",
                  "0x0013E8",
                  "0x008000",
                  "0x008000"
                ],
                "ioTail": [
                  {
                    "type": "read",
                    "block": 11700,
                    "pc": "0x006816",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x02",
                    "f": "0x00",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 11707,
                    "pc": "0x03CF7D",
                    "port": "0x5016",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 11708,
                    "pc": "0x03CFA4",
                    "port": "0x5015",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 11709,
                    "pc": "0x03CFCF",
                    "port": "0x5014",
                    "value": "0x10",
                    "a": "0x00",
                    "f": "0x02",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 11893,
                    "pc": "0x006816",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x02",
                    "f": "0x00",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 11900,
                    "pc": "0x03CF7D",
                    "port": "0x5016",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 11901,
                    "pc": "0x03CFA4",
                    "port": "0x5015",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 11902,
                    "pc": "0x03CFCF",
                    "port": "0x5014",
                    "value": "0x10",
                    "a": "0x00",
                    "f": "0x02",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12082,
                    "pc": "0x006816",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x02",
                    "f": "0x00",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12089,
                    "pc": "0x03CF7D",
                    "port": "0x5016",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12090,
                    "pc": "0x03CFA4",
                    "port": "0x5015",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12091,
                    "pc": "0x03CFCF",
                    "port": "0x5014",
                    "value": "0x10",
                    "a": "0x00",
                    "f": "0x02",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12217,
                    "pc": "0x02B03B",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x00",
                    "f": "0x12",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12503,
                    "pc": "0x006816",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x02",
                    "f": "0x00",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12510,
                    "pc": "0x03CF7D",
                    "port": "0x5016",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12511,
                    "pc": "0x03CFA4",
                    "port": "0x5015",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12512,
                    "pc": "0x03CFCF",
                    "port": "0x5014",
                    "value": "0x10",
                    "a": "0x00",
                    "f": "0x02",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "write",
                    "block": 12570,
                    "pc": "0x000658",
                    "port": "0x0009",
                    "value": "0x02",
                    "a": "0x02",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12573,
                    "pc": "0x00067E",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x05",
                    "f": "0x04",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12576,
                    "pc": "0x0012E3",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x06",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12920,
                    "pc": "0x001379",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x76",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12925,
                    "pc": "0x001988",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x08",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 13035,
                    "pc": "0x001853",
                    "port": "0x0009",
                    "value": "0x02",
                    "a": "0x7F",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "write",
                    "block": 13035,
                    "pc": "0x001853",
                    "port": "0x0009",
                    "value": "0x42",
                    "a": "0x42",
                    "f": "0x00",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  }
                ],
                "lastIoByPort": {
                  "0x0003": {
                    "type": "read",
                    "block": 12925,
                    "pc": "0x001988",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x08",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  "0x5016": {
                    "type": "read",
                    "block": 12510,
                    "pc": "0x03CF7D",
                    "port": "0x5016",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  "0x5015": {
                    "type": "read",
                    "block": 12511,
                    "pc": "0x03CFA4",
                    "port": "0x5015",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  "0x5014": {
                    "type": "read",
                    "block": 12512,
                    "pc": "0x03CFCF",
                    "port": "0x5014",
                    "value": "0x10",
                    "a": "0x00",
                    "f": "0x02",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  "0x5004": {
                    "type": "read",
                    "block": 11349,
                    "pc": "0x03FAA2",
                    "port": "0x5004",
                    "value": "0x11",
                    "a": "0xCC",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  "0x5005": {
                    "type": "write",
                    "block": 11366,
                    "pc": "0x048ACC",
                    "port": "0x5005",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x45",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": true
                    }
                  },
                  "0x0009": {
                    "type": "write",
                    "block": 13035,
                    "pc": "0x001853",
                    "port": "0x0009",
                    "value": "0x42",
                    "a": "0x42",
                    "f": "0x00",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  }
                }
              },
              {
                "block": 13137,
                "target": "gate001872",
                "pc": "0x001872",
                "previousPc": "0x0158F8",
                "routeFields": {
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
                "cpu": {
                  "pc": "0x001872",
                  "sp": "0xD1A87B",
                  "ix": "0x000000",
                  "iy": "0xD00080",
                  "a": "0x00",
                  "f": "0x44",
                  "af": "0x0044",
                  "bc": "0x000003",
                  "de": "0x000430",
                  "hl": "0x000000",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": true,
                    "n": false,
                    "c": false
                  },
                  "halted": false,
                  "madl": 1,
                  "mbase": "0xD0"
                },
                "iyFlags": {
                  "IY+00": {
                    "addr": "0xD00080",
                    "value": "0x00"
                  },
                  "IY+0D": {
                    "addr": "0xD0008D",
                    "value": "0x0E"
                  },
                  "IY+1B": {
                    "addr": "0xD0009B",
                    "value": "0x00"
                  },
                  "IY+1F": {
                    "addr": "0xD0009F",
                    "value": "0x00"
                  },
                  "IY+23": {
                    "addr": "0xD000A3",
                    "value": "0x00"
                  },
                  "IY+27": {
                    "addr": "0xD000A7",
                    "value": "0x00"
                  },
                  "IY+28": {
                    "addr": "0xD000A8",
                    "value": "0x00"
                  },
                  "IY+2C": {
                    "addr": "0xD000AC",
                    "value": "0x00"
                  },
                  "IY+42": {
                    "addr": "0xD000C2",
                    "value": "0x00"
                  },
                  "IY+44": {
                    "addr": "0xD000C4",
                    "value": "0x00"
                  }
                },
                "bytesAtPc": [
                  "0xED",
                  "0x38",
                  "0x03",
                  "0xCB",
                  "0x67",
                  "0x20",
                  "0x36",
                  "0xED",
                  "0x38",
                  "0x09",
                  "0xCB",
                  "0xE7",
                  "0xED",
                  "0x39",
                  "0x09",
                  "0x21"
                ],
                "recentBlocks": [
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
                  "0x001872"
                ],
                "stack24": [
                  {
                    "offset": 0,
                    "addr": "0xD1A87B",
                    "value": "0x0013E8"
                  },
                  {
                    "offset": 3,
                    "addr": "0xD1A87E",
                    "value": "0x000000"
                  },
                  {
                    "offset": 6,
                    "addr": "0xD1A881",
                    "value": "0x000000"
                  },
                  {
                    "offset": 9,
                    "addr": "0xD1A884",
                    "value": "0x000000"
                  },
                  {
                    "offset": 12,
                    "addr": "0xD1A887",
                    "value": "0x000000"
                  },
                  {
                    "offset": 15,
                    "addr": "0xD1A88A",
                    "value": "0x000000"
                  },
                  {
                    "offset": 18,
                    "addr": "0xD1A88D",
                    "value": "0x008000"
                  },
                  {
                    "offset": 21,
                    "addr": "0xD1A890",
                    "value": "0x000000"
                  },
                  {
                    "offset": 24,
                    "addr": "0xD1A893",
                    "value": "0x000000"
                  },
                  {
                    "offset": 27,
                    "addr": "0xD1A896",
                    "value": "0x008000"
                  },
                  {
                    "offset": 30,
                    "addr": "0xD1A899",
                    "value": "0x000000"
                  },
                  {
                    "offset": 33,
                    "addr": "0xD1A89C",
                    "value": "0x000000"
                  }
                ],
                "returnHints": [
                  "0x0013E8",
                  "0x008000",
                  "0x008000"
                ],
                "ioTail": [
                  {
                    "type": "read",
                    "block": 11700,
                    "pc": "0x006816",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x02",
                    "f": "0x00",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 11707,
                    "pc": "0x03CF7D",
                    "port": "0x5016",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 11708,
                    "pc": "0x03CFA4",
                    "port": "0x5015",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 11709,
                    "pc": "0x03CFCF",
                    "port": "0x5014",
                    "value": "0x10",
                    "a": "0x00",
                    "f": "0x02",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 11893,
                    "pc": "0x006816",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x02",
                    "f": "0x00",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 11900,
                    "pc": "0x03CF7D",
                    "port": "0x5016",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 11901,
                    "pc": "0x03CFA4",
                    "port": "0x5015",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 11902,
                    "pc": "0x03CFCF",
                    "port": "0x5014",
                    "value": "0x10",
                    "a": "0x00",
                    "f": "0x02",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12082,
                    "pc": "0x006816",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x02",
                    "f": "0x00",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12089,
                    "pc": "0x03CF7D",
                    "port": "0x5016",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12090,
                    "pc": "0x03CFA4",
                    "port": "0x5015",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12091,
                    "pc": "0x03CFCF",
                    "port": "0x5014",
                    "value": "0x10",
                    "a": "0x00",
                    "f": "0x02",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12217,
                    "pc": "0x02B03B",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x00",
                    "f": "0x12",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12503,
                    "pc": "0x006816",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x02",
                    "f": "0x00",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12510,
                    "pc": "0x03CF7D",
                    "port": "0x5016",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12511,
                    "pc": "0x03CFA4",
                    "port": "0x5015",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12512,
                    "pc": "0x03CFCF",
                    "port": "0x5014",
                    "value": "0x10",
                    "a": "0x00",
                    "f": "0x02",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "write",
                    "block": 12570,
                    "pc": "0x000658",
                    "port": "0x0009",
                    "value": "0x02",
                    "a": "0x02",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12573,
                    "pc": "0x00067E",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x05",
                    "f": "0x04",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12576,
                    "pc": "0x0012E3",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x06",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12920,
                    "pc": "0x001379",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x76",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12925,
                    "pc": "0x001988",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x08",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 13035,
                    "pc": "0x001853",
                    "port": "0x0009",
                    "value": "0x02",
                    "a": "0x7F",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "write",
                    "block": 13035,
                    "pc": "0x001853",
                    "port": "0x0009",
                    "value": "0x42",
                    "a": "0x42",
                    "f": "0x00",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  }
                ],
                "lastIoByPort": {
                  "0x0003": {
                    "type": "read",
                    "block": 12925,
                    "pc": "0x001988",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x08",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  "0x5016": {
                    "type": "read",
                    "block": 12510,
                    "pc": "0x03CF7D",
                    "port": "0x5016",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  "0x5015": {
                    "type": "read",
                    "block": 12511,
                    "pc": "0x03CFA4",
                    "port": "0x5015",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  "0x5014": {
                    "type": "read",
                    "block": 12512,
                    "pc": "0x03CFCF",
                    "port": "0x5014",
                    "value": "0x10",
                    "a": "0x00",
                    "f": "0x02",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  "0x5004": {
                    "type": "read",
                    "block": 11349,
                    "pc": "0x03FAA2",
                    "port": "0x5004",
                    "value": "0x11",
                    "a": "0xCC",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  "0x5005": {
                    "type": "write",
                    "block": 11366,
                    "pc": "0x048ACC",
                    "port": "0x5005",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x45",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": true
                    }
                  },
                  "0x0009": {
                    "type": "write",
                    "block": 13035,
                    "pc": "0x001853",
                    "port": "0x0009",
                    "value": "0x42",
                    "a": "0x42",
                    "f": "0x00",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  }
                }
              },
              {
                "block": 13138,
                "target": "clear001879",
                "pc": "0x001879",
                "previousPc": "0x001872",
                "routeFields": {
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
                "cpu": {
                  "pc": "0x001879",
                  "sp": "0xD1A87B",
                  "ix": "0x000000",
                  "iy": "0xD00080",
                  "a": "0xEE",
                  "f": "0x54",
                  "af": "0xEE54",
                  "bc": "0x000003",
                  "de": "0x000430",
                  "hl": "0x000000",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": true,
                    "pv": true,
                    "n": false,
                    "c": false
                  },
                  "halted": false,
                  "madl": 1,
                  "mbase": "0xD0"
                },
                "iyFlags": {
                  "IY+00": {
                    "addr": "0xD00080",
                    "value": "0x00"
                  },
                  "IY+0D": {
                    "addr": "0xD0008D",
                    "value": "0x0E"
                  },
                  "IY+1B": {
                    "addr": "0xD0009B",
                    "value": "0x00"
                  },
                  "IY+1F": {
                    "addr": "0xD0009F",
                    "value": "0x00"
                  },
                  "IY+23": {
                    "addr": "0xD000A3",
                    "value": "0x00"
                  },
                  "IY+27": {
                    "addr": "0xD000A7",
                    "value": "0x00"
                  },
                  "IY+28": {
                    "addr": "0xD000A8",
                    "value": "0x00"
                  },
                  "IY+2C": {
                    "addr": "0xD000AC",
                    "value": "0x00"
                  },
                  "IY+42": {
                    "addr": "0xD000C2",
                    "value": "0x00"
                  },
                  "IY+44": {
                    "addr": "0xD000C4",
                    "value": "0x00"
                  }
                },
                "bytesAtPc": [
                  "0xED",
                  "0x38",
                  "0x09",
                  "0xCB",
                  "0xE7",
                  "0xED",
                  "0x39",
                  "0x09",
                  "0x21",
                  "0x00",
                  "0x00",
                  "0xD0",
                  "0x11",
                  "0x01",
                  "0x00",
                  "0xD0"
                ],
                "recentBlocks": [
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
                "stack24": [
                  {
                    "offset": 0,
                    "addr": "0xD1A87B",
                    "value": "0x0013E8"
                  },
                  {
                    "offset": 3,
                    "addr": "0xD1A87E",
                    "value": "0x000000"
                  },
                  {
                    "offset": 6,
                    "addr": "0xD1A881",
                    "value": "0x000000"
                  },
                  {
                    "offset": 9,
                    "addr": "0xD1A884",
                    "value": "0x000000"
                  },
                  {
                    "offset": 12,
                    "addr": "0xD1A887",
                    "value": "0x000000"
                  },
                  {
                    "offset": 15,
                    "addr": "0xD1A88A",
                    "value": "0x000000"
                  },
                  {
                    "offset": 18,
                    "addr": "0xD1A88D",
                    "value": "0x008000"
                  },
                  {
                    "offset": 21,
                    "addr": "0xD1A890",
                    "value": "0x000000"
                  },
                  {
                    "offset": 24,
                    "addr": "0xD1A893",
                    "value": "0x000000"
                  },
                  {
                    "offset": 27,
                    "addr": "0xD1A896",
                    "value": "0x008000"
                  },
                  {
                    "offset": 30,
                    "addr": "0xD1A899",
                    "value": "0x000000"
                  },
                  {
                    "offset": 33,
                    "addr": "0xD1A89C",
                    "value": "0x000000"
                  }
                ],
                "returnHints": [
                  "0x0013E8",
                  "0x008000",
                  "0x008000"
                ],
                "ioTail": [
                  {
                    "type": "read",
                    "block": 11707,
                    "pc": "0x03CF7D",
                    "port": "0x5016",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 11708,
                    "pc": "0x03CFA4",
                    "port": "0x5015",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 11709,
                    "pc": "0x03CFCF",
                    "port": "0x5014",
                    "value": "0x10",
                    "a": "0x00",
                    "f": "0x02",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 11893,
                    "pc": "0x006816",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x02",
                    "f": "0x00",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 11900,
                    "pc": "0x03CF7D",
                    "port": "0x5016",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 11901,
                    "pc": "0x03CFA4",
                    "port": "0x5015",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 11902,
                    "pc": "0x03CFCF",
                    "port": "0x5014",
                    "value": "0x10",
                    "a": "0x00",
                    "f": "0x02",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12082,
                    "pc": "0x006816",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x02",
                    "f": "0x00",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12089,
                    "pc": "0x03CF7D",
                    "port": "0x5016",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12090,
                    "pc": "0x03CFA4",
                    "port": "0x5015",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12091,
                    "pc": "0x03CFCF",
                    "port": "0x5014",
                    "value": "0x10",
                    "a": "0x00",
                    "f": "0x02",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12217,
                    "pc": "0x02B03B",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x00",
                    "f": "0x12",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12503,
                    "pc": "0x006816",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x02",
                    "f": "0x00",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12510,
                    "pc": "0x03CF7D",
                    "port": "0x5016",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12511,
                    "pc": "0x03CFA4",
                    "port": "0x5015",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12512,
                    "pc": "0x03CFCF",
                    "port": "0x5014",
                    "value": "0x10",
                    "a": "0x00",
                    "f": "0x02",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "write",
                    "block": 12570,
                    "pc": "0x000658",
                    "port": "0x0009",
                    "value": "0x02",
                    "a": "0x02",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12573,
                    "pc": "0x00067E",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x05",
                    "f": "0x04",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12576,
                    "pc": "0x0012E3",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x06",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12920,
                    "pc": "0x001379",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x76",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12925,
                    "pc": "0x001988",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x08",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 13035,
                    "pc": "0x001853",
                    "port": "0x0009",
                    "value": "0x02",
                    "a": "0x7F",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "write",
                    "block": 13035,
                    "pc": "0x001853",
                    "port": "0x0009",
                    "value": "0x42",
                    "a": "0x42",
                    "f": "0x00",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 13137,
                    "pc": "0x001872",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x00",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  }
                ],
                "lastIoByPort": {
                  "0x0003": {
                    "type": "read",
                    "block": 13137,
                    "pc": "0x001872",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x00",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  "0x5016": {
                    "type": "read",
                    "block": 12510,
                    "pc": "0x03CF7D",
                    "port": "0x5016",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  "0x5015": {
                    "type": "read",
                    "block": 12511,
                    "pc": "0x03CFA4",
                    "port": "0x5015",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  "0x5014": {
                    "type": "read",
                    "block": 12512,
                    "pc": "0x03CFCF",
                    "port": "0x5014",
                    "value": "0x10",
                    "a": "0x00",
                    "f": "0x02",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  "0x5004": {
                    "type": "read",
                    "block": 11349,
                    "pc": "0x03FAA2",
                    "port": "0x5004",
                    "value": "0x11",
                    "a": "0xCC",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  "0x5005": {
                    "type": "write",
                    "block": 11366,
                    "pc": "0x048ACC",
                    "port": "0x5005",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x45",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": true
                    }
                  },
                  "0x0009": {
                    "type": "write",
                    "block": 13035,
                    "pc": "0x001853",
                    "port": "0x0009",
                    "value": "0x42",
                    "a": "0x42",
                    "f": "0x00",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  }
                }
              },
              {
                "block": 13139,
                "target": "cleanup0018f8",
                "pc": "0x0018F8",
                "previousPc": "0x001879",
                "routeFields": {
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
                "cpu": {
                  "pc": "0x0018F8",
                  "sp": "0xD1A87B",
                  "ix": "0x000000",
                  "iy": "0xD00080",
                  "a": "0x52",
                  "f": "0x00",
                  "af": "0x5200",
                  "bc": "0x0000FF",
                  "de": "0xD3FF00",
                  "hl": "0xD3FEFF",
                  "flags": {
                    "s": false,
                    "z": false,
                    "h": false,
                    "pv": false,
                    "n": false,
                    "c": false
                  },
                  "halted": false,
                  "madl": 1,
                  "mbase": "0xD0"
                },
                "iyFlags": {
                  "IY+00": {
                    "addr": "0xD00080",
                    "value": "0x00"
                  },
                  "IY+0D": {
                    "addr": "0xD0008D",
                    "value": "0x00"
                  },
                  "IY+1B": {
                    "addr": "0xD0009B",
                    "value": "0x00"
                  },
                  "IY+1F": {
                    "addr": "0xD0009F",
                    "value": "0x00"
                  },
                  "IY+23": {
                    "addr": "0xD000A3",
                    "value": "0x00"
                  },
                  "IY+27": {
                    "addr": "0xD000A7",
                    "value": "0x00"
                  },
                  "IY+28": {
                    "addr": "0xD000A8",
                    "value": "0x00"
                  },
                  "IY+2C": {
                    "addr": "0xD000AC",
                    "value": "0x00"
                  },
                  "IY+42": {
                    "addr": "0xD000C2",
                    "value": "0x00"
                  },
                  "IY+44": {
                    "addr": "0xD000C4",
                    "value": "0x00"
                  }
                },
                "bytesAtPc": [
                  "0x36",
                  "0x00",
                  "0xED",
                  "0xB0",
                  "0xAF",
                  "0x32",
                  "0xB7",
                  "0x77",
                  "0xD1",
                  "0x3E",
                  "0x95",
                  "0x32",
                  "0x8F",
                  "0x05",
                  "0xD0",
                  "0xCD"
                ],
                "recentBlocks": [
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
                  "0x001879",
                  "0x0018F8"
                ],
                "stack24": [
                  {
                    "offset": 0,
                    "addr": "0xD1A87B",
                    "value": "0x0013E8"
                  },
                  {
                    "offset": 3,
                    "addr": "0xD1A87E",
                    "value": "0x000000"
                  },
                  {
                    "offset": 6,
                    "addr": "0xD1A881",
                    "value": "0x000000"
                  },
                  {
                    "offset": 9,
                    "addr": "0xD1A884",
                    "value": "0x000000"
                  },
                  {
                    "offset": 12,
                    "addr": "0xD1A887",
                    "value": "0x000000"
                  },
                  {
                    "offset": 15,
                    "addr": "0xD1A88A",
                    "value": "0x000000"
                  },
                  {
                    "offset": 18,
                    "addr": "0xD1A88D",
                    "value": "0x008000"
                  },
                  {
                    "offset": 21,
                    "addr": "0xD1A890",
                    "value": "0x000000"
                  },
                  {
                    "offset": 24,
                    "addr": "0xD1A893",
                    "value": "0x000000"
                  },
                  {
                    "offset": 27,
                    "addr": "0xD1A896",
                    "value": "0x008000"
                  },
                  {
                    "offset": 30,
                    "addr": "0xD1A899",
                    "value": "0x000000"
                  },
                  {
                    "offset": 33,
                    "addr": "0xD1A89C",
                    "value": "0x000000"
                  }
                ],
                "returnHints": [
                  "0x0013E8",
                  "0x008000",
                  "0x008000"
                ],
                "ioTail": [
                  {
                    "type": "read",
                    "block": 11709,
                    "pc": "0x03CFCF",
                    "port": "0x5014",
                    "value": "0x10",
                    "a": "0x00",
                    "f": "0x02",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 11893,
                    "pc": "0x006816",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x02",
                    "f": "0x00",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 11900,
                    "pc": "0x03CF7D",
                    "port": "0x5016",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 11901,
                    "pc": "0x03CFA4",
                    "port": "0x5015",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 11902,
                    "pc": "0x03CFCF",
                    "port": "0x5014",
                    "value": "0x10",
                    "a": "0x00",
                    "f": "0x02",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12082,
                    "pc": "0x006816",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x02",
                    "f": "0x00",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12089,
                    "pc": "0x03CF7D",
                    "port": "0x5016",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12090,
                    "pc": "0x03CFA4",
                    "port": "0x5015",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12091,
                    "pc": "0x03CFCF",
                    "port": "0x5014",
                    "value": "0x10",
                    "a": "0x00",
                    "f": "0x02",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12217,
                    "pc": "0x02B03B",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x00",
                    "f": "0x12",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12503,
                    "pc": "0x006816",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x02",
                    "f": "0x00",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12510,
                    "pc": "0x03CF7D",
                    "port": "0x5016",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12511,
                    "pc": "0x03CFA4",
                    "port": "0x5015",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12512,
                    "pc": "0x03CFCF",
                    "port": "0x5014",
                    "value": "0x10",
                    "a": "0x00",
                    "f": "0x02",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "write",
                    "block": 12570,
                    "pc": "0x000658",
                    "port": "0x0009",
                    "value": "0x02",
                    "a": "0x02",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12573,
                    "pc": "0x00067E",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x05",
                    "f": "0x04",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12576,
                    "pc": "0x0012E3",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x06",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12920,
                    "pc": "0x001379",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x76",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 12925,
                    "pc": "0x001988",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x08",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 13035,
                    "pc": "0x001853",
                    "port": "0x0009",
                    "value": "0x02",
                    "a": "0x7F",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "write",
                    "block": 13035,
                    "pc": "0x001853",
                    "port": "0x0009",
                    "value": "0x42",
                    "a": "0x42",
                    "f": "0x00",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 13137,
                    "pc": "0x001872",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x00",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 13138,
                    "pc": "0x001879",
                    "port": "0x0009",
                    "value": "0x42",
                    "a": "0xEE",
                    "f": "0x54",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": true,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "write",
                    "block": 13138,
                    "pc": "0x001879",
                    "port": "0x0009",
                    "value": "0x52",
                    "a": "0x52",
                    "f": "0x04",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  }
                ],
                "lastIoByPort": {
                  "0x0003": {
                    "type": "read",
                    "block": 13137,
                    "pc": "0x001872",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x00",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  "0x5016": {
                    "type": "read",
                    "block": 12510,
                    "pc": "0x03CF7D",
                    "port": "0x5016",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  "0x5015": {
                    "type": "read",
                    "block": 12511,
                    "pc": "0x03CFA4",
                    "port": "0x5015",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  "0x5014": {
                    "type": "read",
                    "block": 12512,
                    "pc": "0x03CFCF",
                    "port": "0x5014",
                    "value": "0x10",
                    "a": "0x00",
                    "f": "0x02",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  "0x5004": {
                    "type": "read",
                    "block": 11349,
                    "pc": "0x03FAA2",
                    "port": "0x5004",
                    "value": "0x11",
                    "a": "0xCC",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  "0x5005": {
                    "type": "write",
                    "block": 11366,
                    "pc": "0x048ACC",
                    "port": "0x5005",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x45",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": true
                    }
                  },
                  "0x0009": {
                    "type": "write",
                    "block": 13138,
                    "pc": "0x001879",
                    "port": "0x0009",
                    "value": "0x52",
                    "a": "0x52",
                    "f": "0x04",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  }
                }
              },
              {
                "block": 203010,
                "target": "gate001c4a",
                "pc": "0x001C4A",
                "previousPc": "0x001C33",
                "routeFields": {
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
                "cpu": {
                  "pc": "0x001C4A",
                  "sp": "0xD1A844",
                  "ix": "0xD1A859",
                  "iy": "0xD00080",
                  "a": "0xFF",
                  "f": "0x42",
                  "af": "0xFF42",
                  "bc": "0x000003",
                  "de": "0x00FFF0",
                  "hl": "0x3B003B",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": false,
                    "n": true,
                    "c": false
                  },
                  "halted": false,
                  "madl": 1,
                  "mbase": "0xD0"
                },
                "iyFlags": {
                  "IY+00": {
                    "addr": "0xD00080",
                    "value": "0x00"
                  },
                  "IY+0D": {
                    "addr": "0xD0008D",
                    "value": "0x00"
                  },
                  "IY+1B": {
                    "addr": "0xD0009B",
                    "value": "0x00"
                  },
                  "IY+1F": {
                    "addr": "0xD0009F",
                    "value": "0x00"
                  },
                  "IY+23": {
                    "addr": "0xD000A3",
                    "value": "0x00"
                  },
                  "IY+27": {
                    "addr": "0xD000A7",
                    "value": "0x00"
                  },
                  "IY+28": {
                    "addr": "0xD000A8",
                    "value": "0x00"
                  },
                  "IY+2C": {
                    "addr": "0xD000AC",
                    "value": "0x01"
                  },
                  "IY+42": {
                    "addr": "0xD000C2",
                    "value": "0x00"
                  },
                  "IY+44": {
                    "addr": "0xD000C4",
                    "value": "0x00"
                  }
                },
                "bytesAtPc": [
                  "0x3E",
                  "0xFF",
                  "0xCB",
                  "0x7F",
                  "0xC9",
                  "0x23",
                  "0xCD",
                  "0xA6",
                  "0x1C",
                  "0x00",
                  "0xC9",
                  "0x21",
                  "0x01",
                  "0x00",
                  "0x3B",
                  "0xCD"
                ],
                "recentBlocks": [
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
                  "0x001C4A"
                ],
                "stack24": [
                  {
                    "offset": 0,
                    "addr": "0xD1A844",
                    "value": "0x001C5D"
                  },
                  {
                    "offset": 3,
                    "addr": "0xD1A847",
                    "value": "0x001C31"
                  },
                  {
                    "offset": 6,
                    "addr": "0xD1A84A",
                    "value": "0x000005"
                  },
                  {
                    "offset": 9,
                    "addr": "0xD1A84D",
                    "value": "0x001C0E"
                  },
                  {
                    "offset": 12,
                    "addr": "0xD1A850",
                    "value": "0xD1A86D"
                  },
                  {
                    "offset": 15,
                    "addr": "0xD1A853",
                    "value": "0xD1A87E"
                  },
                  {
                    "offset": 18,
                    "addr": "0xD1A856",
                    "value": "0x000005"
                  },
                  {
                    "offset": 21,
                    "addr": "0xD1A859",
                    "value": "0xD1A862"
                  },
                  {
                    "offset": 24,
                    "addr": "0xD1A85C",
                    "value": "0x001D7E"
                  },
                  {
                    "offset": 27,
                    "addr": "0xD1A85F",
                    "value": "0x000005"
                  },
                  {
                    "offset": 30,
                    "addr": "0xD1A862",
                    "value": "0xD1A875"
                  },
                  {
                    "offset": 33,
                    "addr": "0xD1A865",
                    "value": "0x00092F"
                  }
                ],
                "returnHints": [
                  "0x001C5D",
                  "0x001C31",
                  "0x000005",
                  "0x001C0E",
                  "0xD1A86D",
                  "0xD1A87E"
                ],
                "ioTail": [
                  {
                    "type": "read",
                    "block": 198233,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x27",
                    "f": "0xB0",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 198426,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x28",
                    "f": "0xB8",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 198619,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x29",
                    "f": "0xB8",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 198812,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x2A",
                    "f": "0xB8",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 199005,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x2B",
                    "f": "0xB8",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 199198,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x2C",
                    "f": "0xB8",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 199391,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x2D",
                    "f": "0xB8",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 199584,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x2E",
                    "f": "0xB8",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 199777,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x2F",
                    "f": "0xB8",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 199970,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x30",
                    "f": "0xB0",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 200163,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x31",
                    "f": "0xB0",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 200356,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x32",
                    "f": "0xB0",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 200549,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x33",
                    "f": "0xB0",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 200742,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x34",
                    "f": "0xB0",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 200935,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x35",
                    "f": "0xB0",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 201128,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x36",
                    "f": "0xB0",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 201321,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x37",
                    "f": "0xB0",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 201514,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x38",
                    "f": "0xB8",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 201707,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x39",
                    "f": "0xB8",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 201900,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x3A",
                    "f": "0xB8",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 202095,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x3C",
                    "f": "0xB8",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 202288,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x3D",
                    "f": "0xB8",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 202481,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x3E",
                    "f": "0xB8",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 202674,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x3F",
                    "f": "0xB8",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  }
                ],
                "lastIoByPort": {
                  "0x0003": {
                    "type": "read",
                    "block": 202674,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x3F",
                    "f": "0xB8",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  "0x5016": {
                    "type": "read",
                    "block": 12510,
                    "pc": "0x03CF7D",
                    "port": "0x5016",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  "0x5015": {
                    "type": "read",
                    "block": 12511,
                    "pc": "0x03CFA4",
                    "port": "0x5015",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  "0x5014": {
                    "type": "read",
                    "block": 12512,
                    "pc": "0x03CFCF",
                    "port": "0x5014",
                    "value": "0x10",
                    "a": "0x00",
                    "f": "0x02",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  "0x5004": {
                    "type": "write",
                    "block": 13145,
                    "pc": "0x005C5E",
                    "port": "0x5004",
                    "value": "0x11",
                    "a": "0x11",
                    "f": "0x04",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  "0x5005": {
                    "type": "write",
                    "block": 11366,
                    "pc": "0x048ACC",
                    "port": "0x5005",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x45",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": true
                    }
                  },
                  "0x0009": {
                    "type": "write",
                    "block": 14776,
                    "pc": "0x003C27",
                    "port": "0x0009",
                    "value": "0x76",
                    "a": "0x76",
                    "f": "0x30",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  }
                }
              },
              {
                "block": 203283,
                "target": "gate0158d2",
                "pc": "0x0158D2",
                "previousPc": "0x001C4A",
                "routeFields": {
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
                "cpu": {
                  "pc": "0x0158D2",
                  "sp": "0xD1A875",
                  "ix": "0x000000",
                  "iy": "0xD00080",
                  "a": "0xFF",
                  "f": "0x90",
                  "af": "0xFF90",
                  "bc": "0x000003",
                  "de": "0x000430",
                  "hl": "0x3B003B",
                  "flags": {
                    "s": true,
                    "z": false,
                    "h": true,
                    "pv": false,
                    "n": false,
                    "c": false
                  },
                  "halted": false,
                  "madl": 1,
                  "mbase": "0xD0"
                },
                "iyFlags": {
                  "IY+00": {
                    "addr": "0xD00080",
                    "value": "0x00"
                  },
                  "IY+0D": {
                    "addr": "0xD0008D",
                    "value": "0x00"
                  },
                  "IY+1B": {
                    "addr": "0xD0009B",
                    "value": "0x00"
                  },
                  "IY+1F": {
                    "addr": "0xD0009F",
                    "value": "0x00"
                  },
                  "IY+23": {
                    "addr": "0xD000A3",
                    "value": "0x00"
                  },
                  "IY+27": {
                    "addr": "0xD000A7",
                    "value": "0x00"
                  },
                  "IY+28": {
                    "addr": "0xD000A8",
                    "value": "0x00"
                  },
                  "IY+2C": {
                    "addr": "0xD000AC",
                    "value": "0x01"
                  },
                  "IY+42": {
                    "addr": "0xD000C2",
                    "value": "0x00"
                  },
                  "IY+44": {
                    "addr": "0xD000C4",
                    "value": "0x00"
                  }
                },
                "bytesAtPc": [
                  "0x20",
                  "0x06",
                  "0xCD",
                  "0x4F",
                  "0x1C",
                  "0x00",
                  "0x18",
                  "0x03",
                  "0xB7",
                  "0xED",
                  "0x62",
                  "0xC9",
                  "0xFD",
                  "0x21",
                  "0x80",
                  "0x00"
                ],
                "recentBlocks": [
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
                  "0x0158D2"
                ],
                "stack24": [
                  {
                    "offset": 0,
                    "addr": "0xD1A875",
                    "value": "0x0158EC"
                  },
                  {
                    "offset": 3,
                    "addr": "0xD1A878",
                    "value": "0x001872"
                  },
                  {
                    "offset": 6,
                    "addr": "0xD1A87B",
                    "value": "0x000862"
                  },
                  {
                    "offset": 9,
                    "addr": "0xD1A87E",
                    "value": "0x000000"
                  },
                  {
                    "offset": 12,
                    "addr": "0xD1A881",
                    "value": "0x000000"
                  },
                  {
                    "offset": 15,
                    "addr": "0xD1A884",
                    "value": "0x000000"
                  },
                  {
                    "offset": 18,
                    "addr": "0xD1A887",
                    "value": "0x000000"
                  },
                  {
                    "offset": 21,
                    "addr": "0xD1A88A",
                    "value": "0x000000"
                  },
                  {
                    "offset": 24,
                    "addr": "0xD1A88D",
                    "value": "0x008000"
                  },
                  {
                    "offset": 27,
                    "addr": "0xD1A890",
                    "value": "0x000000"
                  },
                  {
                    "offset": 30,
                    "addr": "0xD1A893",
                    "value": "0x000000"
                  },
                  {
                    "offset": 33,
                    "addr": "0xD1A896",
                    "value": "0x008000"
                  }
                ],
                "returnHints": [
                  "0x0158EC",
                  "0x001872",
                  "0x000862",
                  "0x008000",
                  "0x008000"
                ],
                "ioTail": [
                  {
                    "type": "read",
                    "block": 199005,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x2B",
                    "f": "0xB8",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 199198,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x2C",
                    "f": "0xB8",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 199391,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x2D",
                    "f": "0xB8",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 199584,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x2E",
                    "f": "0xB8",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 199777,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x2F",
                    "f": "0xB8",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 199970,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x30",
                    "f": "0xB0",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 200163,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x31",
                    "f": "0xB0",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 200356,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x32",
                    "f": "0xB0",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 200549,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x33",
                    "f": "0xB0",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 200742,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x34",
                    "f": "0xB0",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 200935,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x35",
                    "f": "0xB0",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 201128,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x36",
                    "f": "0xB0",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 201321,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x37",
                    "f": "0xB0",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 201514,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x38",
                    "f": "0xB8",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 201707,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x39",
                    "f": "0xB8",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 201900,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x3A",
                    "f": "0xB8",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 202095,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x3C",
                    "f": "0xB8",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 202288,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x3D",
                    "f": "0xB8",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 202481,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x3E",
                    "f": "0xB8",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 202674,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x3F",
                    "f": "0xB8",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 203087,
                    "pc": "0x001D37",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0xFF",
                    "f": "0x90",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 203101,
                    "pc": "0x001D37",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x00",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 203186,
                    "pc": "0x001853",
                    "port": "0x0009",
                    "value": "0x76",
                    "a": "0x7F",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "write",
                    "block": 203186,
                    "pc": "0x001853",
                    "port": "0x0009",
                    "value": "0x76",
                    "a": "0x76",
                    "f": "0x00",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  }
                ],
                "lastIoByPort": {
                  "0x0003": {
                    "type": "read",
                    "block": 203101,
                    "pc": "0x001D37",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x00",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  "0x5016": {
                    "type": "read",
                    "block": 12510,
                    "pc": "0x03CF7D",
                    "port": "0x5016",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  "0x5015": {
                    "type": "read",
                    "block": 12511,
                    "pc": "0x03CFA4",
                    "port": "0x5015",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  "0x5014": {
                    "type": "read",
                    "block": 12512,
                    "pc": "0x03CFCF",
                    "port": "0x5014",
                    "value": "0x10",
                    "a": "0x00",
                    "f": "0x02",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  "0x5004": {
                    "type": "write",
                    "block": 13145,
                    "pc": "0x005C5E",
                    "port": "0x5004",
                    "value": "0x11",
                    "a": "0x11",
                    "f": "0x04",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  "0x5005": {
                    "type": "write",
                    "block": 11366,
                    "pc": "0x048ACC",
                    "port": "0x5005",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x45",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": true
                    }
                  },
                  "0x0009": {
                    "type": "write",
                    "block": 203186,
                    "pc": "0x001853",
                    "port": "0x0009",
                    "value": "0x76",
                    "a": "0x76",
                    "f": "0x00",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  }
                }
              },
              {
                "block": 203284,
                "target": "gate0158da",
                "pc": "0x0158DA",
                "previousPc": "0x0158D2",
                "routeFields": {
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
                "cpu": {
                  "pc": "0x0158DA",
                  "sp": "0xD1A875",
                  "ix": "0x000000",
                  "iy": "0xD00080",
                  "a": "0xFF",
                  "f": "0x90",
                  "af": "0xFF90",
                  "bc": "0x000003",
                  "de": "0x000430",
                  "hl": "0x3B003B",
                  "flags": {
                    "s": true,
                    "z": false,
                    "h": true,
                    "pv": false,
                    "n": false,
                    "c": false
                  },
                  "halted": false,
                  "madl": 1,
                  "mbase": "0xD0"
                },
                "iyFlags": {
                  "IY+00": {
                    "addr": "0xD00080",
                    "value": "0x00"
                  },
                  "IY+0D": {
                    "addr": "0xD0008D",
                    "value": "0x00"
                  },
                  "IY+1B": {
                    "addr": "0xD0009B",
                    "value": "0x00"
                  },
                  "IY+1F": {
                    "addr": "0xD0009F",
                    "value": "0x00"
                  },
                  "IY+23": {
                    "addr": "0xD000A3",
                    "value": "0x00"
                  },
                  "IY+27": {
                    "addr": "0xD000A7",
                    "value": "0x00"
                  },
                  "IY+28": {
                    "addr": "0xD000A8",
                    "value": "0x00"
                  },
                  "IY+2C": {
                    "addr": "0xD000AC",
                    "value": "0x01"
                  },
                  "IY+42": {
                    "addr": "0xD000C2",
                    "value": "0x00"
                  },
                  "IY+44": {
                    "addr": "0xD000C4",
                    "value": "0x00"
                  }
                },
                "bytesAtPc": [
                  "0xB7",
                  "0xED",
                  "0x62",
                  "0xC9",
                  "0xFD",
                  "0x21",
                  "0x80",
                  "0x00",
                  "0xD0",
                  "0xFD",
                  "0xCB",
                  "0x42",
                  "0x7E",
                  "0xC0",
                  "0xCD",
                  "0xBC"
                ],
                "recentBlocks": [
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
                  "0x0158DA"
                ],
                "stack24": [
                  {
                    "offset": 0,
                    "addr": "0xD1A875",
                    "value": "0x0158EC"
                  },
                  {
                    "offset": 3,
                    "addr": "0xD1A878",
                    "value": "0x001872"
                  },
                  {
                    "offset": 6,
                    "addr": "0xD1A87B",
                    "value": "0x000862"
                  },
                  {
                    "offset": 9,
                    "addr": "0xD1A87E",
                    "value": "0x000000"
                  },
                  {
                    "offset": 12,
                    "addr": "0xD1A881",
                    "value": "0x000000"
                  },
                  {
                    "offset": 15,
                    "addr": "0xD1A884",
                    "value": "0x000000"
                  },
                  {
                    "offset": 18,
                    "addr": "0xD1A887",
                    "value": "0x000000"
                  },
                  {
                    "offset": 21,
                    "addr": "0xD1A88A",
                    "value": "0x000000"
                  },
                  {
                    "offset": 24,
                    "addr": "0xD1A88D",
                    "value": "0x008000"
                  },
                  {
                    "offset": 27,
                    "addr": "0xD1A890",
                    "value": "0x000000"
                  },
                  {
                    "offset": 30,
                    "addr": "0xD1A893",
                    "value": "0x000000"
                  },
                  {
                    "offset": 33,
                    "addr": "0xD1A896",
                    "value": "0x008000"
                  }
                ],
                "returnHints": [
                  "0x0158EC",
                  "0x001872",
                  "0x000862",
                  "0x008000",
                  "0x008000"
                ],
                "ioTail": [
                  {
                    "type": "read",
                    "block": 199005,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x2B",
                    "f": "0xB8",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 199198,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x2C",
                    "f": "0xB8",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 199391,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x2D",
                    "f": "0xB8",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 199584,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x2E",
                    "f": "0xB8",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 199777,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x2F",
                    "f": "0xB8",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 199970,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x30",
                    "f": "0xB0",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 200163,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x31",
                    "f": "0xB0",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 200356,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x32",
                    "f": "0xB0",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 200549,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x33",
                    "f": "0xB0",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 200742,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x34",
                    "f": "0xB0",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 200935,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x35",
                    "f": "0xB0",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 201128,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x36",
                    "f": "0xB0",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 201321,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x37",
                    "f": "0xB0",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 201514,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x38",
                    "f": "0xB8",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 201707,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x39",
                    "f": "0xB8",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 201900,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x3A",
                    "f": "0xB8",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 202095,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x3C",
                    "f": "0xB8",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 202288,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x3D",
                    "f": "0xB8",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 202481,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x3E",
                    "f": "0xB8",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 202674,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x3F",
                    "f": "0xB8",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 203087,
                    "pc": "0x001D37",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0xFF",
                    "f": "0x90",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 203101,
                    "pc": "0x001D37",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x00",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 203186,
                    "pc": "0x001853",
                    "port": "0x0009",
                    "value": "0x76",
                    "a": "0x7F",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "write",
                    "block": 203186,
                    "pc": "0x001853",
                    "port": "0x0009",
                    "value": "0x76",
                    "a": "0x76",
                    "f": "0x00",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  }
                ],
                "lastIoByPort": {
                  "0x0003": {
                    "type": "read",
                    "block": 203101,
                    "pc": "0x001D37",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x00",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  "0x5016": {
                    "type": "read",
                    "block": 12510,
                    "pc": "0x03CF7D",
                    "port": "0x5016",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  "0x5015": {
                    "type": "read",
                    "block": 12511,
                    "pc": "0x03CFA4",
                    "port": "0x5015",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  "0x5014": {
                    "type": "read",
                    "block": 12512,
                    "pc": "0x03CFCF",
                    "port": "0x5014",
                    "value": "0x10",
                    "a": "0x00",
                    "f": "0x02",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  "0x5004": {
                    "type": "write",
                    "block": 13145,
                    "pc": "0x005C5E",
                    "port": "0x5004",
                    "value": "0x11",
                    "a": "0x11",
                    "f": "0x04",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  "0x5005": {
                    "type": "write",
                    "block": 11366,
                    "pc": "0x048ACC",
                    "port": "0x5005",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x45",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": true
                    }
                  },
                  "0x0009": {
                    "type": "write",
                    "block": 203186,
                    "pc": "0x001853",
                    "port": "0x0009",
                    "value": "0x76",
                    "a": "0x76",
                    "f": "0x00",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  }
                }
              },
              {
                "block": 203285,
                "target": "gate0158ec",
                "pc": "0x0158EC",
                "previousPc": "0x0158DA",
                "routeFields": {
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
                "cpu": {
                  "pc": "0x0158EC",
                  "sp": "0xD1A878",
                  "ix": "0x000000",
                  "iy": "0xD00080",
                  "a": "0xFF",
                  "f": "0x6A",
                  "af": "0xFF6A",
                  "bc": "0x000003",
                  "de": "0x000430",
                  "hl": "0x000000",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": false,
                    "n": true,
                    "c": false
                  },
                  "halted": false,
                  "madl": 1,
                  "mbase": "0xD0"
                },
                "iyFlags": {
                  "IY+00": {
                    "addr": "0xD00080",
                    "value": "0x00"
                  },
                  "IY+0D": {
                    "addr": "0xD0008D",
                    "value": "0x00"
                  },
                  "IY+1B": {
                    "addr": "0xD0009B",
                    "value": "0x00"
                  },
                  "IY+1F": {
                    "addr": "0xD0009F",
                    "value": "0x00"
                  },
                  "IY+23": {
                    "addr": "0xD000A3",
                    "value": "0x00"
                  },
                  "IY+27": {
                    "addr": "0xD000A7",
                    "value": "0x00"
                  },
                  "IY+28": {
                    "addr": "0xD000A8",
                    "value": "0x00"
                  },
                  "IY+2C": {
                    "addr": "0xD000AC",
                    "value": "0x01"
                  },
                  "IY+42": {
                    "addr": "0xD000C2",
                    "value": "0x00"
                  },
                  "IY+44": {
                    "addr": "0xD000C4",
                    "value": "0x00"
                  }
                },
                "bytesAtPc": [
                  "0x38",
                  "0x0A",
                  "0x28",
                  "0x08",
                  "0xFD",
                  "0xCB",
                  "0x42",
                  "0xFE",
                  "0x3E",
                  "0x01",
                  "0xB7",
                  "0xC9",
                  "0xAF",
                  "0xC9",
                  "0x22",
                  "0x95"
                ],
                "recentBlocks": [
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
                  "0x0158EC"
                ],
                "stack24": [
                  {
                    "offset": 0,
                    "addr": "0xD1A878",
                    "value": "0x001872"
                  },
                  {
                    "offset": 3,
                    "addr": "0xD1A87B",
                    "value": "0x000862"
                  },
                  {
                    "offset": 6,
                    "addr": "0xD1A87E",
                    "value": "0x000000"
                  },
                  {
                    "offset": 9,
                    "addr": "0xD1A881",
                    "value": "0x000000"
                  },
                  {
                    "offset": 12,
                    "addr": "0xD1A884",
                    "value": "0x000000"
                  },
                  {
                    "offset": 15,
                    "addr": "0xD1A887",
                    "value": "0x000000"
                  },
                  {
                    "offset": 18,
                    "addr": "0xD1A88A",
                    "value": "0x000000"
                  },
                  {
                    "offset": 21,
                    "addr": "0xD1A88D",
                    "value": "0x008000"
                  },
                  {
                    "offset": 24,
                    "addr": "0xD1A890",
                    "value": "0x000000"
                  },
                  {
                    "offset": 27,
                    "addr": "0xD1A893",
                    "value": "0x000000"
                  },
                  {
                    "offset": 30,
                    "addr": "0xD1A896",
                    "value": "0x008000"
                  },
                  {
                    "offset": 33,
                    "addr": "0xD1A899",
                    "value": "0x000000"
                  }
                ],
                "returnHints": [
                  "0x001872",
                  "0x000862",
                  "0x008000",
                  "0x008000"
                ],
                "ioTail": [
                  {
                    "type": "read",
                    "block": 199005,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x2B",
                    "f": "0xB8",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 199198,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x2C",
                    "f": "0xB8",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 199391,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x2D",
                    "f": "0xB8",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 199584,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x2E",
                    "f": "0xB8",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 199777,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x2F",
                    "f": "0xB8",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 199970,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x30",
                    "f": "0xB0",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 200163,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x31",
                    "f": "0xB0",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 200356,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x32",
                    "f": "0xB0",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 200549,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x33",
                    "f": "0xB0",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 200742,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x34",
                    "f": "0xB0",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 200935,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x35",
                    "f": "0xB0",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 201128,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x36",
                    "f": "0xB0",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 201321,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x37",
                    "f": "0xB0",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 201514,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x38",
                    "f": "0xB8",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 201707,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x39",
                    "f": "0xB8",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 201900,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x3A",
                    "f": "0xB8",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 202095,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x3C",
                    "f": "0xB8",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 202288,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x3D",
                    "f": "0xB8",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 202481,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x3E",
                    "f": "0xB8",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 202674,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x3F",
                    "f": "0xB8",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 203087,
                    "pc": "0x001D37",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0xFF",
                    "f": "0x90",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 203101,
                    "pc": "0x001D37",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x00",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 203186,
                    "pc": "0x001853",
                    "port": "0x0009",
                    "value": "0x76",
                    "a": "0x7F",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "write",
                    "block": 203186,
                    "pc": "0x001853",
                    "port": "0x0009",
                    "value": "0x76",
                    "a": "0x76",
                    "f": "0x00",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  }
                ],
                "lastIoByPort": {
                  "0x0003": {
                    "type": "read",
                    "block": 203101,
                    "pc": "0x001D37",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x00",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  "0x5016": {
                    "type": "read",
                    "block": 12510,
                    "pc": "0x03CF7D",
                    "port": "0x5016",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  "0x5015": {
                    "type": "read",
                    "block": 12511,
                    "pc": "0x03CFA4",
                    "port": "0x5015",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  "0x5014": {
                    "type": "read",
                    "block": 12512,
                    "pc": "0x03CFCF",
                    "port": "0x5014",
                    "value": "0x10",
                    "a": "0x00",
                    "f": "0x02",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  "0x5004": {
                    "type": "write",
                    "block": 13145,
                    "pc": "0x005C5E",
                    "port": "0x5004",
                    "value": "0x11",
                    "a": "0x11",
                    "f": "0x04",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  "0x5005": {
                    "type": "write",
                    "block": 11366,
                    "pc": "0x048ACC",
                    "port": "0x5005",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x45",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": true
                    }
                  },
                  "0x0009": {
                    "type": "write",
                    "block": 203186,
                    "pc": "0x001853",
                    "port": "0x0009",
                    "value": "0x76",
                    "a": "0x76",
                    "f": "0x00",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  }
                }
              },
              {
                "block": 203286,
                "target": "gate0158ee",
                "pc": "0x0158EE",
                "previousPc": "0x0158EC",
                "routeFields": {
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
                "cpu": {
                  "pc": "0x0158EE",
                  "sp": "0xD1A878",
                  "ix": "0x000000",
                  "iy": "0xD00080",
                  "a": "0xFF",
                  "f": "0x6A",
                  "af": "0xFF6A",
                  "bc": "0x000003",
                  "de": "0x000430",
                  "hl": "0x000000",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": false,
                    "n": true,
                    "c": false
                  },
                  "halted": false,
                  "madl": 1,
                  "mbase": "0xD0"
                },
                "iyFlags": {
                  "IY+00": {
                    "addr": "0xD00080",
                    "value": "0x00"
                  },
                  "IY+0D": {
                    "addr": "0xD0008D",
                    "value": "0x00"
                  },
                  "IY+1B": {
                    "addr": "0xD0009B",
                    "value": "0x00"
                  },
                  "IY+1F": {
                    "addr": "0xD0009F",
                    "value": "0x00"
                  },
                  "IY+23": {
                    "addr": "0xD000A3",
                    "value": "0x00"
                  },
                  "IY+27": {
                    "addr": "0xD000A7",
                    "value": "0x00"
                  },
                  "IY+28": {
                    "addr": "0xD000A8",
                    "value": "0x00"
                  },
                  "IY+2C": {
                    "addr": "0xD000AC",
                    "value": "0x01"
                  },
                  "IY+42": {
                    "addr": "0xD000C2",
                    "value": "0x00"
                  },
                  "IY+44": {
                    "addr": "0xD000C4",
                    "value": "0x00"
                  }
                },
                "bytesAtPc": [
                  "0x28",
                  "0x08",
                  "0xFD",
                  "0xCB",
                  "0x42",
                  "0xFE",
                  "0x3E",
                  "0x01",
                  "0xB7",
                  "0xC9",
                  "0xAF",
                  "0xC9",
                  "0x22",
                  "0x95",
                  "0x05",
                  "0xD0"
                ],
                "recentBlocks": [
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
                  "0x0158EE"
                ],
                "stack24": [
                  {
                    "offset": 0,
                    "addr": "0xD1A878",
                    "value": "0x001872"
                  },
                  {
                    "offset": 3,
                    "addr": "0xD1A87B",
                    "value": "0x000862"
                  },
                  {
                    "offset": 6,
                    "addr": "0xD1A87E",
                    "value": "0x000000"
                  },
                  {
                    "offset": 9,
                    "addr": "0xD1A881",
                    "value": "0x000000"
                  },
                  {
                    "offset": 12,
                    "addr": "0xD1A884",
                    "value": "0x000000"
                  },
                  {
                    "offset": 15,
                    "addr": "0xD1A887",
                    "value": "0x000000"
                  },
                  {
                    "offset": 18,
                    "addr": "0xD1A88A",
                    "value": "0x000000"
                  },
                  {
                    "offset": 21,
                    "addr": "0xD1A88D",
                    "value": "0x008000"
                  },
                  {
                    "offset": 24,
                    "addr": "0xD1A890",
                    "value": "0x000000"
                  },
                  {
                    "offset": 27,
                    "addr": "0xD1A893",
                    "value": "0x000000"
                  },
                  {
                    "offset": 30,
                    "addr": "0xD1A896",
                    "value": "0x008000"
                  },
                  {
                    "offset": 33,
                    "addr": "0xD1A899",
                    "value": "0x000000"
                  }
                ],
                "returnHints": [
                  "0x001872",
                  "0x000862",
                  "0x008000",
                  "0x008000"
                ],
                "ioTail": [
                  {
                    "type": "read",
                    "block": 199005,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x2B",
                    "f": "0xB8",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 199198,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x2C",
                    "f": "0xB8",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 199391,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x2D",
                    "f": "0xB8",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 199584,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x2E",
                    "f": "0xB8",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 199777,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x2F",
                    "f": "0xB8",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 199970,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x30",
                    "f": "0xB0",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 200163,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x31",
                    "f": "0xB0",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 200356,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x32",
                    "f": "0xB0",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 200549,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x33",
                    "f": "0xB0",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 200742,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x34",
                    "f": "0xB0",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 200935,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x35",
                    "f": "0xB0",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 201128,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x36",
                    "f": "0xB0",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 201321,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x37",
                    "f": "0xB0",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 201514,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x38",
                    "f": "0xB8",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 201707,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x39",
                    "f": "0xB8",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 201900,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x3A",
                    "f": "0xB8",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 202095,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x3C",
                    "f": "0xB8",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 202288,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x3D",
                    "f": "0xB8",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 202481,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x3E",
                    "f": "0xB8",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 202674,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x3F",
                    "f": "0xB8",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 203087,
                    "pc": "0x001D37",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0xFF",
                    "f": "0x90",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 203101,
                    "pc": "0x001D37",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x00",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 203186,
                    "pc": "0x001853",
                    "port": "0x0009",
                    "value": "0x76",
                    "a": "0x7F",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "write",
                    "block": 203186,
                    "pc": "0x001853",
                    "port": "0x0009",
                    "value": "0x76",
                    "a": "0x76",
                    "f": "0x00",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  }
                ],
                "lastIoByPort": {
                  "0x0003": {
                    "type": "read",
                    "block": 203101,
                    "pc": "0x001D37",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x00",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  "0x5016": {
                    "type": "read",
                    "block": 12510,
                    "pc": "0x03CF7D",
                    "port": "0x5016",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  "0x5015": {
                    "type": "read",
                    "block": 12511,
                    "pc": "0x03CFA4",
                    "port": "0x5015",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  "0x5014": {
                    "type": "read",
                    "block": 12512,
                    "pc": "0x03CFCF",
                    "port": "0x5014",
                    "value": "0x10",
                    "a": "0x00",
                    "f": "0x02",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  "0x5004": {
                    "type": "write",
                    "block": 13145,
                    "pc": "0x005C5E",
                    "port": "0x5004",
                    "value": "0x11",
                    "a": "0x11",
                    "f": "0x04",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  "0x5005": {
                    "type": "write",
                    "block": 11366,
                    "pc": "0x048ACC",
                    "port": "0x5005",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x45",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": true
                    }
                  },
                  "0x0009": {
                    "type": "write",
                    "block": 203186,
                    "pc": "0x001853",
                    "port": "0x0009",
                    "value": "0x76",
                    "a": "0x76",
                    "f": "0x00",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  }
                }
              },
              {
                "block": 203287,
                "target": "gate0158f8",
                "pc": "0x0158F8",
                "previousPc": "0x0158EE",
                "routeFields": {
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
                "cpu": {
                  "pc": "0x0158F8",
                  "sp": "0xD1A878",
                  "ix": "0x000000",
                  "iy": "0xD00080",
                  "a": "0xFF",
                  "f": "0x6A",
                  "af": "0xFF6A",
                  "bc": "0x000003",
                  "de": "0x000430",
                  "hl": "0x000000",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": false,
                    "n": true,
                    "c": false
                  },
                  "halted": false,
                  "madl": 1,
                  "mbase": "0xD0"
                },
                "iyFlags": {
                  "IY+00": {
                    "addr": "0xD00080",
                    "value": "0x00"
                  },
                  "IY+0D": {
                    "addr": "0xD0008D",
                    "value": "0x00"
                  },
                  "IY+1B": {
                    "addr": "0xD0009B",
                    "value": "0x00"
                  },
                  "IY+1F": {
                    "addr": "0xD0009F",
                    "value": "0x00"
                  },
                  "IY+23": {
                    "addr": "0xD000A3",
                    "value": "0x00"
                  },
                  "IY+27": {
                    "addr": "0xD000A7",
                    "value": "0x00"
                  },
                  "IY+28": {
                    "addr": "0xD000A8",
                    "value": "0x00"
                  },
                  "IY+2C": {
                    "addr": "0xD000AC",
                    "value": "0x01"
                  },
                  "IY+42": {
                    "addr": "0xD000C2",
                    "value": "0x00"
                  },
                  "IY+44": {
                    "addr": "0xD000C4",
                    "value": "0x00"
                  }
                },
                "bytesAtPc": [
                  "0xAF",
                  "0xC9",
                  "0x22",
                  "0x95",
                  "0x05",
                  "0xD0",
                  "0x24",
                  "0xCD",
                  "0xC6",
                  "0x59",
                  "0x00",
                  "0xC9",
                  "0xC5",
                  "0x11",
                  "0xFC",
                  "0x05"
                ],
                "recentBlocks": [
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
                  "0x0158F8"
                ],
                "stack24": [
                  {
                    "offset": 0,
                    "addr": "0xD1A878",
                    "value": "0x001872"
                  },
                  {
                    "offset": 3,
                    "addr": "0xD1A87B",
                    "value": "0x000862"
                  },
                  {
                    "offset": 6,
                    "addr": "0xD1A87E",
                    "value": "0x000000"
                  },
                  {
                    "offset": 9,
                    "addr": "0xD1A881",
                    "value": "0x000000"
                  },
                  {
                    "offset": 12,
                    "addr": "0xD1A884",
                    "value": "0x000000"
                  },
                  {
                    "offset": 15,
                    "addr": "0xD1A887",
                    "value": "0x000000"
                  },
                  {
                    "offset": 18,
                    "addr": "0xD1A88A",
                    "value": "0x000000"
                  },
                  {
                    "offset": 21,
                    "addr": "0xD1A88D",
                    "value": "0x008000"
                  },
                  {
                    "offset": 24,
                    "addr": "0xD1A890",
                    "value": "0x000000"
                  },
                  {
                    "offset": 27,
                    "addr": "0xD1A893",
                    "value": "0x000000"
                  },
                  {
                    "offset": 30,
                    "addr": "0xD1A896",
                    "value": "0x008000"
                  },
                  {
                    "offset": 33,
                    "addr": "0xD1A899",
                    "value": "0x000000"
                  }
                ],
                "returnHints": [
                  "0x001872",
                  "0x000862",
                  "0x008000",
                  "0x008000"
                ],
                "ioTail": [
                  {
                    "type": "read",
                    "block": 199005,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x2B",
                    "f": "0xB8",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 199198,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x2C",
                    "f": "0xB8",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 199391,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x2D",
                    "f": "0xB8",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 199584,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x2E",
                    "f": "0xB8",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 199777,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x2F",
                    "f": "0xB8",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 199970,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x30",
                    "f": "0xB0",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 200163,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x31",
                    "f": "0xB0",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 200356,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x32",
                    "f": "0xB0",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 200549,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x33",
                    "f": "0xB0",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 200742,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x34",
                    "f": "0xB0",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 200935,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x35",
                    "f": "0xB0",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 201128,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x36",
                    "f": "0xB0",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 201321,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x37",
                    "f": "0xB0",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 201514,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x38",
                    "f": "0xB8",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 201707,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x39",
                    "f": "0xB8",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 201900,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x3A",
                    "f": "0xB8",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 202095,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x3C",
                    "f": "0xB8",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 202288,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x3D",
                    "f": "0xB8",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 202481,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x3E",
                    "f": "0xB8",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 202674,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x3F",
                    "f": "0xB8",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 203087,
                    "pc": "0x001D37",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0xFF",
                    "f": "0x90",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 203101,
                    "pc": "0x001D37",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x00",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 203186,
                    "pc": "0x001853",
                    "port": "0x0009",
                    "value": "0x76",
                    "a": "0x7F",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "write",
                    "block": 203186,
                    "pc": "0x001853",
                    "port": "0x0009",
                    "value": "0x76",
                    "a": "0x76",
                    "f": "0x00",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  }
                ],
                "lastIoByPort": {
                  "0x0003": {
                    "type": "read",
                    "block": 203101,
                    "pc": "0x001D37",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x00",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  "0x5016": {
                    "type": "read",
                    "block": 12510,
                    "pc": "0x03CF7D",
                    "port": "0x5016",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  "0x5015": {
                    "type": "read",
                    "block": 12511,
                    "pc": "0x03CFA4",
                    "port": "0x5015",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  "0x5014": {
                    "type": "read",
                    "block": 12512,
                    "pc": "0x03CFCF",
                    "port": "0x5014",
                    "value": "0x10",
                    "a": "0x00",
                    "f": "0x02",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  "0x5004": {
                    "type": "write",
                    "block": 13145,
                    "pc": "0x005C5E",
                    "port": "0x5004",
                    "value": "0x11",
                    "a": "0x11",
                    "f": "0x04",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  "0x5005": {
                    "type": "write",
                    "block": 11366,
                    "pc": "0x048ACC",
                    "port": "0x5005",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x45",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": true
                    }
                  },
                  "0x0009": {
                    "type": "write",
                    "block": 203186,
                    "pc": "0x001853",
                    "port": "0x0009",
                    "value": "0x76",
                    "a": "0x76",
                    "f": "0x00",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  }
                }
              },
              {
                "block": 203288,
                "target": "gate001872",
                "pc": "0x001872",
                "previousPc": "0x0158F8",
                "routeFields": {
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
                "cpu": {
                  "pc": "0x001872",
                  "sp": "0xD1A87B",
                  "ix": "0x000000",
                  "iy": "0xD00080",
                  "a": "0x00",
                  "f": "0x44",
                  "af": "0x0044",
                  "bc": "0x000003",
                  "de": "0x000430",
                  "hl": "0x000000",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": true,
                    "n": false,
                    "c": false
                  },
                  "halted": false,
                  "madl": 1,
                  "mbase": "0xD0"
                },
                "iyFlags": {
                  "IY+00": {
                    "addr": "0xD00080",
                    "value": "0x00"
                  },
                  "IY+0D": {
                    "addr": "0xD0008D",
                    "value": "0x00"
                  },
                  "IY+1B": {
                    "addr": "0xD0009B",
                    "value": "0x00"
                  },
                  "IY+1F": {
                    "addr": "0xD0009F",
                    "value": "0x00"
                  },
                  "IY+23": {
                    "addr": "0xD000A3",
                    "value": "0x00"
                  },
                  "IY+27": {
                    "addr": "0xD000A7",
                    "value": "0x00"
                  },
                  "IY+28": {
                    "addr": "0xD000A8",
                    "value": "0x00"
                  },
                  "IY+2C": {
                    "addr": "0xD000AC",
                    "value": "0x01"
                  },
                  "IY+42": {
                    "addr": "0xD000C2",
                    "value": "0x00"
                  },
                  "IY+44": {
                    "addr": "0xD000C4",
                    "value": "0x00"
                  }
                },
                "bytesAtPc": [
                  "0xED",
                  "0x38",
                  "0x03",
                  "0xCB",
                  "0x67",
                  "0x20",
                  "0x36",
                  "0xED",
                  "0x38",
                  "0x09",
                  "0xCB",
                  "0xE7",
                  "0xED",
                  "0x39",
                  "0x09",
                  "0x21"
                ],
                "recentBlocks": [
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
                  "0x001872"
                ],
                "stack24": [
                  {
                    "offset": 0,
                    "addr": "0xD1A87B",
                    "value": "0x000862"
                  },
                  {
                    "offset": 3,
                    "addr": "0xD1A87E",
                    "value": "0x000000"
                  },
                  {
                    "offset": 6,
                    "addr": "0xD1A881",
                    "value": "0x000000"
                  },
                  {
                    "offset": 9,
                    "addr": "0xD1A884",
                    "value": "0x000000"
                  },
                  {
                    "offset": 12,
                    "addr": "0xD1A887",
                    "value": "0x000000"
                  },
                  {
                    "offset": 15,
                    "addr": "0xD1A88A",
                    "value": "0x000000"
                  },
                  {
                    "offset": 18,
                    "addr": "0xD1A88D",
                    "value": "0x008000"
                  },
                  {
                    "offset": 21,
                    "addr": "0xD1A890",
                    "value": "0x000000"
                  },
                  {
                    "offset": 24,
                    "addr": "0xD1A893",
                    "value": "0x000000"
                  },
                  {
                    "offset": 27,
                    "addr": "0xD1A896",
                    "value": "0x008000"
                  },
                  {
                    "offset": 30,
                    "addr": "0xD1A899",
                    "value": "0x000000"
                  },
                  {
                    "offset": 33,
                    "addr": "0xD1A89C",
                    "value": "0x000000"
                  }
                ],
                "returnHints": [
                  "0x000862",
                  "0x008000",
                  "0x008000"
                ],
                "ioTail": [
                  {
                    "type": "read",
                    "block": 199005,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x2B",
                    "f": "0xB8",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 199198,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x2C",
                    "f": "0xB8",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 199391,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x2D",
                    "f": "0xB8",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 199584,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x2E",
                    "f": "0xB8",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 199777,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x2F",
                    "f": "0xB8",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 199970,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x30",
                    "f": "0xB0",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 200163,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x31",
                    "f": "0xB0",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 200356,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x32",
                    "f": "0xB0",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 200549,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x33",
                    "f": "0xB0",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 200742,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x34",
                    "f": "0xB0",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 200935,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x35",
                    "f": "0xB0",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 201128,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x36",
                    "f": "0xB0",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 201321,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x37",
                    "f": "0xB0",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 201514,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x38",
                    "f": "0xB8",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 201707,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x39",
                    "f": "0xB8",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 201900,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x3A",
                    "f": "0xB8",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 202095,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x3C",
                    "f": "0xB8",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 202288,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x3D",
                    "f": "0xB8",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 202481,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x3E",
                    "f": "0xB8",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 202674,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x3F",
                    "f": "0xB8",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 203087,
                    "pc": "0x001D37",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0xFF",
                    "f": "0x90",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 203101,
                    "pc": "0x001D37",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x00",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 203186,
                    "pc": "0x001853",
                    "port": "0x0009",
                    "value": "0x76",
                    "a": "0x7F",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "write",
                    "block": 203186,
                    "pc": "0x001853",
                    "port": "0x0009",
                    "value": "0x76",
                    "a": "0x76",
                    "f": "0x00",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  }
                ],
                "lastIoByPort": {
                  "0x0003": {
                    "type": "read",
                    "block": 203101,
                    "pc": "0x001D37",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x00",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  "0x5016": {
                    "type": "read",
                    "block": 12510,
                    "pc": "0x03CF7D",
                    "port": "0x5016",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  "0x5015": {
                    "type": "read",
                    "block": 12511,
                    "pc": "0x03CFA4",
                    "port": "0x5015",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  "0x5014": {
                    "type": "read",
                    "block": 12512,
                    "pc": "0x03CFCF",
                    "port": "0x5014",
                    "value": "0x10",
                    "a": "0x00",
                    "f": "0x02",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  "0x5004": {
                    "type": "write",
                    "block": 13145,
                    "pc": "0x005C5E",
                    "port": "0x5004",
                    "value": "0x11",
                    "a": "0x11",
                    "f": "0x04",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  "0x5005": {
                    "type": "write",
                    "block": 11366,
                    "pc": "0x048ACC",
                    "port": "0x5005",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x45",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": true
                    }
                  },
                  "0x0009": {
                    "type": "write",
                    "block": 203186,
                    "pc": "0x001853",
                    "port": "0x0009",
                    "value": "0x76",
                    "a": "0x76",
                    "f": "0x00",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  }
                }
              },
              {
                "block": 203289,
                "target": "clear001879",
                "pc": "0x001879",
                "previousPc": "0x001872",
                "routeFields": {
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
                "cpu": {
                  "pc": "0x001879",
                  "sp": "0xD1A87B",
                  "ix": "0x000000",
                  "iy": "0xD00080",
                  "a": "0xEE",
                  "f": "0x54",
                  "af": "0xEE54",
                  "bc": "0x000003",
                  "de": "0x000430",
                  "hl": "0x000000",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": true,
                    "pv": true,
                    "n": false,
                    "c": false
                  },
                  "halted": false,
                  "madl": 1,
                  "mbase": "0xD0"
                },
                "iyFlags": {
                  "IY+00": {
                    "addr": "0xD00080",
                    "value": "0x00"
                  },
                  "IY+0D": {
                    "addr": "0xD0008D",
                    "value": "0x00"
                  },
                  "IY+1B": {
                    "addr": "0xD0009B",
                    "value": "0x00"
                  },
                  "IY+1F": {
                    "addr": "0xD0009F",
                    "value": "0x00"
                  },
                  "IY+23": {
                    "addr": "0xD000A3",
                    "value": "0x00"
                  },
                  "IY+27": {
                    "addr": "0xD000A7",
                    "value": "0x00"
                  },
                  "IY+28": {
                    "addr": "0xD000A8",
                    "value": "0x00"
                  },
                  "IY+2C": {
                    "addr": "0xD000AC",
                    "value": "0x01"
                  },
                  "IY+42": {
                    "addr": "0xD000C2",
                    "value": "0x00"
                  },
                  "IY+44": {
                    "addr": "0xD000C4",
                    "value": "0x00"
                  }
                },
                "bytesAtPc": [
                  "0xED",
                  "0x38",
                  "0x09",
                  "0xCB",
                  "0xE7",
                  "0xED",
                  "0x39",
                  "0x09",
                  "0x21",
                  "0x00",
                  "0x00",
                  "0xD0",
                  "0x11",
                  "0x01",
                  "0x00",
                  "0xD0"
                ],
                "recentBlocks": [
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
                "stack24": [
                  {
                    "offset": 0,
                    "addr": "0xD1A87B",
                    "value": "0x000862"
                  },
                  {
                    "offset": 3,
                    "addr": "0xD1A87E",
                    "value": "0x000000"
                  },
                  {
                    "offset": 6,
                    "addr": "0xD1A881",
                    "value": "0x000000"
                  },
                  {
                    "offset": 9,
                    "addr": "0xD1A884",
                    "value": "0x000000"
                  },
                  {
                    "offset": 12,
                    "addr": "0xD1A887",
                    "value": "0x000000"
                  },
                  {
                    "offset": 15,
                    "addr": "0xD1A88A",
                    "value": "0x000000"
                  },
                  {
                    "offset": 18,
                    "addr": "0xD1A88D",
                    "value": "0x008000"
                  },
                  {
                    "offset": 21,
                    "addr": "0xD1A890",
                    "value": "0x000000"
                  },
                  {
                    "offset": 24,
                    "addr": "0xD1A893",
                    "value": "0x000000"
                  },
                  {
                    "offset": 27,
                    "addr": "0xD1A896",
                    "value": "0x008000"
                  },
                  {
                    "offset": 30,
                    "addr": "0xD1A899",
                    "value": "0x000000"
                  },
                  {
                    "offset": 33,
                    "addr": "0xD1A89C",
                    "value": "0x000000"
                  }
                ],
                "returnHints": [
                  "0x000862",
                  "0x008000",
                  "0x008000"
                ],
                "ioTail": [
                  {
                    "type": "read",
                    "block": 199198,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x2C",
                    "f": "0xB8",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 199391,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x2D",
                    "f": "0xB8",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 199584,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x2E",
                    "f": "0xB8",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 199777,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x2F",
                    "f": "0xB8",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 199970,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x30",
                    "f": "0xB0",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 200163,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x31",
                    "f": "0xB0",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 200356,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x32",
                    "f": "0xB0",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 200549,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x33",
                    "f": "0xB0",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 200742,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x34",
                    "f": "0xB0",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 200935,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x35",
                    "f": "0xB0",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 201128,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x36",
                    "f": "0xB0",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 201321,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x37",
                    "f": "0xB0",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 201514,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x38",
                    "f": "0xB8",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 201707,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x39",
                    "f": "0xB8",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 201900,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x3A",
                    "f": "0xB8",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 202095,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x3C",
                    "f": "0xB8",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 202288,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x3D",
                    "f": "0xB8",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 202481,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x3E",
                    "f": "0xB8",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 202674,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x3F",
                    "f": "0xB8",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 203087,
                    "pc": "0x001D37",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0xFF",
                    "f": "0x90",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 203101,
                    "pc": "0x001D37",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x00",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 203186,
                    "pc": "0x001853",
                    "port": "0x0009",
                    "value": "0x76",
                    "a": "0x7F",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "write",
                    "block": 203186,
                    "pc": "0x001853",
                    "port": "0x0009",
                    "value": "0x76",
                    "a": "0x76",
                    "f": "0x00",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 203288,
                    "pc": "0x001872",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x00",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  }
                ],
                "lastIoByPort": {
                  "0x0003": {
                    "type": "read",
                    "block": 203288,
                    "pc": "0x001872",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x00",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  "0x5016": {
                    "type": "read",
                    "block": 12510,
                    "pc": "0x03CF7D",
                    "port": "0x5016",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  "0x5015": {
                    "type": "read",
                    "block": 12511,
                    "pc": "0x03CFA4",
                    "port": "0x5015",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  "0x5014": {
                    "type": "read",
                    "block": 12512,
                    "pc": "0x03CFCF",
                    "port": "0x5014",
                    "value": "0x10",
                    "a": "0x00",
                    "f": "0x02",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  "0x5004": {
                    "type": "write",
                    "block": 13145,
                    "pc": "0x005C5E",
                    "port": "0x5004",
                    "value": "0x11",
                    "a": "0x11",
                    "f": "0x04",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  "0x5005": {
                    "type": "write",
                    "block": 11366,
                    "pc": "0x048ACC",
                    "port": "0x5005",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x45",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": true
                    }
                  },
                  "0x0009": {
                    "type": "write",
                    "block": 203186,
                    "pc": "0x001853",
                    "port": "0x0009",
                    "value": "0x76",
                    "a": "0x76",
                    "f": "0x00",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  }
                }
              },
              {
                "block": 203290,
                "target": "cleanup0018f8",
                "pc": "0x0018F8",
                "previousPc": "0x001879",
                "routeFields": {
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
                "cpu": {
                  "pc": "0x0018F8",
                  "sp": "0xD1A87B",
                  "ix": "0x000000",
                  "iy": "0xD00080",
                  "a": "0x76",
                  "f": "0x00",
                  "af": "0x7600",
                  "bc": "0x0000FF",
                  "de": "0xD3FF00",
                  "hl": "0xD3FEFF",
                  "flags": {
                    "s": false,
                    "z": false,
                    "h": false,
                    "pv": false,
                    "n": false,
                    "c": false
                  },
                  "halted": false,
                  "madl": 1,
                  "mbase": "0xD0"
                },
                "iyFlags": {
                  "IY+00": {
                    "addr": "0xD00080",
                    "value": "0x00"
                  },
                  "IY+0D": {
                    "addr": "0xD0008D",
                    "value": "0x00"
                  },
                  "IY+1B": {
                    "addr": "0xD0009B",
                    "value": "0x00"
                  },
                  "IY+1F": {
                    "addr": "0xD0009F",
                    "value": "0x00"
                  },
                  "IY+23": {
                    "addr": "0xD000A3",
                    "value": "0x00"
                  },
                  "IY+27": {
                    "addr": "0xD000A7",
                    "value": "0x00"
                  },
                  "IY+28": {
                    "addr": "0xD000A8",
                    "value": "0x00"
                  },
                  "IY+2C": {
                    "addr": "0xD000AC",
                    "value": "0x00"
                  },
                  "IY+42": {
                    "addr": "0xD000C2",
                    "value": "0x00"
                  },
                  "IY+44": {
                    "addr": "0xD000C4",
                    "value": "0x00"
                  }
                },
                "bytesAtPc": [
                  "0x36",
                  "0x00",
                  "0xED",
                  "0xB0",
                  "0xAF",
                  "0x32",
                  "0xB7",
                  "0x77",
                  "0xD1",
                  "0x3E",
                  "0x95",
                  "0x32",
                  "0x8F",
                  "0x05",
                  "0xD0",
                  "0xCD"
                ],
                "recentBlocks": [
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
                  "0x001879",
                  "0x0018F8"
                ],
                "stack24": [
                  {
                    "offset": 0,
                    "addr": "0xD1A87B",
                    "value": "0x000862"
                  },
                  {
                    "offset": 3,
                    "addr": "0xD1A87E",
                    "value": "0x000000"
                  },
                  {
                    "offset": 6,
                    "addr": "0xD1A881",
                    "value": "0x000000"
                  },
                  {
                    "offset": 9,
                    "addr": "0xD1A884",
                    "value": "0x000000"
                  },
                  {
                    "offset": 12,
                    "addr": "0xD1A887",
                    "value": "0x000000"
                  },
                  {
                    "offset": 15,
                    "addr": "0xD1A88A",
                    "value": "0x000000"
                  },
                  {
                    "offset": 18,
                    "addr": "0xD1A88D",
                    "value": "0x008000"
                  },
                  {
                    "offset": 21,
                    "addr": "0xD1A890",
                    "value": "0x000000"
                  },
                  {
                    "offset": 24,
                    "addr": "0xD1A893",
                    "value": "0x000000"
                  },
                  {
                    "offset": 27,
                    "addr": "0xD1A896",
                    "value": "0x008000"
                  },
                  {
                    "offset": 30,
                    "addr": "0xD1A899",
                    "value": "0x000000"
                  },
                  {
                    "offset": 33,
                    "addr": "0xD1A89C",
                    "value": "0x000000"
                  }
                ],
                "returnHints": [
                  "0x000862",
                  "0x008000",
                  "0x008000"
                ],
                "ioTail": [
                  {
                    "type": "read",
                    "block": 199584,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x2E",
                    "f": "0xB8",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 199777,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x2F",
                    "f": "0xB8",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 199970,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x30",
                    "f": "0xB0",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 200163,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x31",
                    "f": "0xB0",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 200356,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x32",
                    "f": "0xB0",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 200549,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x33",
                    "f": "0xB0",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 200742,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x34",
                    "f": "0xB0",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 200935,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x35",
                    "f": "0xB0",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 201128,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x36",
                    "f": "0xB0",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 201321,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x37",
                    "f": "0xB0",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 201514,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x38",
                    "f": "0xB8",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 201707,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x39",
                    "f": "0xB8",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 201900,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x3A",
                    "f": "0xB8",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 202095,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x3C",
                    "f": "0xB8",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 202288,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x3D",
                    "f": "0xB8",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 202481,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x3E",
                    "f": "0xB8",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 202674,
                    "pc": "0x000E7F",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x3F",
                    "f": "0xB8",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 203087,
                    "pc": "0x001D37",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0xFF",
                    "f": "0x90",
                    "flags": {
                      "s": true,
                      "z": false,
                      "h": true,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 203101,
                    "pc": "0x001D37",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x00",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 203186,
                    "pc": "0x001853",
                    "port": "0x0009",
                    "value": "0x76",
                    "a": "0x7F",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "write",
                    "block": 203186,
                    "pc": "0x001853",
                    "port": "0x0009",
                    "value": "0x76",
                    "a": "0x76",
                    "f": "0x00",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 203288,
                    "pc": "0x001872",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x00",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 203289,
                    "pc": "0x001879",
                    "port": "0x0009",
                    "value": "0x76",
                    "a": "0xEE",
                    "f": "0x54",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": true,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "write",
                    "block": 203289,
                    "pc": "0x001879",
                    "port": "0x0009",
                    "value": "0x76",
                    "a": "0x76",
                    "f": "0x00",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  }
                ],
                "lastIoByPort": {
                  "0x0003": {
                    "type": "read",
                    "block": 203288,
                    "pc": "0x001872",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x00",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  "0x5016": {
                    "type": "read",
                    "block": 12510,
                    "pc": "0x03CF7D",
                    "port": "0x5016",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  "0x5015": {
                    "type": "read",
                    "block": 12511,
                    "pc": "0x03CFA4",
                    "port": "0x5015",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  "0x5014": {
                    "type": "read",
                    "block": 12512,
                    "pc": "0x03CFCF",
                    "port": "0x5014",
                    "value": "0x10",
                    "a": "0x00",
                    "f": "0x02",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  "0x5004": {
                    "type": "write",
                    "block": 13145,
                    "pc": "0x005C5E",
                    "port": "0x5004",
                    "value": "0x11",
                    "a": "0x11",
                    "f": "0x04",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  "0x5005": {
                    "type": "write",
                    "block": 11366,
                    "pc": "0x048ACC",
                    "port": "0x5005",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x45",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": true
                    }
                  },
                  "0x0009": {
                    "type": "write",
                    "block": 203289,
                    "pc": "0x001879",
                    "port": "0x0009",
                    "value": "0x76",
                    "a": "0x76",
                    "f": "0x00",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  }
                }
              },
              {
                "block": 208340,
                "target": "gate001872",
                "pc": "0x001872",
                "previousPc": "0x0158F8",
                "routeFields": {
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
                "cpu": {
                  "pc": "0x001872",
                  "sp": "0xD1A87B",
                  "ix": "0x000000",
                  "iy": "0xD00080",
                  "a": "0x00",
                  "f": "0x44",
                  "af": "0x0044",
                  "bc": "0x000003",
                  "de": "0x000430",
                  "hl": "0x000000",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": false,
                    "pv": true,
                    "n": false,
                    "c": false
                  },
                  "halted": false,
                  "madl": 1,
                  "mbase": "0xD0"
                },
                "iyFlags": {
                  "IY+00": {
                    "addr": "0xD00080",
                    "value": "0x00"
                  },
                  "IY+0D": {
                    "addr": "0xD0008D",
                    "value": "0x00"
                  },
                  "IY+1B": {
                    "addr": "0xD0009B",
                    "value": "0x00"
                  },
                  "IY+1F": {
                    "addr": "0xD0009F",
                    "value": "0x00"
                  },
                  "IY+23": {
                    "addr": "0xD000A3",
                    "value": "0x00"
                  },
                  "IY+27": {
                    "addr": "0xD000A7",
                    "value": "0x00"
                  },
                  "IY+28": {
                    "addr": "0xD000A8",
                    "value": "0x00"
                  },
                  "IY+2C": {
                    "addr": "0xD000AC",
                    "value": "0x00"
                  },
                  "IY+42": {
                    "addr": "0xD000C2",
                    "value": "0x00"
                  },
                  "IY+44": {
                    "addr": "0xD000C4",
                    "value": "0x00"
                  }
                },
                "bytesAtPc": [
                  "0xED",
                  "0x38",
                  "0x03",
                  "0xCB",
                  "0x67",
                  "0x20",
                  "0x36",
                  "0xED",
                  "0x38",
                  "0x09",
                  "0xCB",
                  "0xE7",
                  "0xED",
                  "0x39",
                  "0x09",
                  "0x21"
                ],
                "recentBlocks": [
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
                  "0x001872"
                ],
                "stack24": [
                  {
                    "offset": 0,
                    "addr": "0xD1A87B",
                    "value": "0x0013E8"
                  },
                  {
                    "offset": 3,
                    "addr": "0xD1A87E",
                    "value": "0x000000"
                  },
                  {
                    "offset": 6,
                    "addr": "0xD1A881",
                    "value": "0x000000"
                  },
                  {
                    "offset": 9,
                    "addr": "0xD1A884",
                    "value": "0x000000"
                  },
                  {
                    "offset": 12,
                    "addr": "0xD1A887",
                    "value": "0x000000"
                  },
                  {
                    "offset": 15,
                    "addr": "0xD1A88A",
                    "value": "0x000000"
                  },
                  {
                    "offset": 18,
                    "addr": "0xD1A88D",
                    "value": "0x008000"
                  },
                  {
                    "offset": 21,
                    "addr": "0xD1A890",
                    "value": "0x000000"
                  },
                  {
                    "offset": 24,
                    "addr": "0xD1A893",
                    "value": "0x000000"
                  },
                  {
                    "offset": 27,
                    "addr": "0xD1A896",
                    "value": "0x008000"
                  },
                  {
                    "offset": 30,
                    "addr": "0xD1A899",
                    "value": "0x000000"
                  },
                  {
                    "offset": 33,
                    "addr": "0xD1A89C",
                    "value": "0x000000"
                  }
                ],
                "returnHints": [
                  "0x0013E8",
                  "0x008000",
                  "0x008000"
                ],
                "ioTail": [
                  {
                    "type": "read",
                    "block": 206691,
                    "pc": "0x03CFCF",
                    "port": "0x5014",
                    "value": "0x10",
                    "a": "0x00",
                    "f": "0x02",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 207178,
                    "pc": "0x006816",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x02",
                    "f": "0x00",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 207185,
                    "pc": "0x03CF7D",
                    "port": "0x5016",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 207186,
                    "pc": "0x03CFA4",
                    "port": "0x5015",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 207187,
                    "pc": "0x03CFCF",
                    "port": "0x5014",
                    "value": "0x10",
                    "a": "0x00",
                    "f": "0x02",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 207323,
                    "pc": "0x006816",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x02",
                    "f": "0x00",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 207330,
                    "pc": "0x03CF7D",
                    "port": "0x5016",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 207331,
                    "pc": "0x03CFA4",
                    "port": "0x5015",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 207332,
                    "pc": "0x03CFCF",
                    "port": "0x5014",
                    "value": "0x10",
                    "a": "0x00",
                    "f": "0x02",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 207482,
                    "pc": "0x006816",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x02",
                    "f": "0x00",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 207489,
                    "pc": "0x03CF7D",
                    "port": "0x5016",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 207490,
                    "pc": "0x03CFA4",
                    "port": "0x5015",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 207491,
                    "pc": "0x03CFCF",
                    "port": "0x5014",
                    "value": "0x10",
                    "a": "0x00",
                    "f": "0x02",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 207682,
                    "pc": "0x006816",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x02",
                    "f": "0x00",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 207689,
                    "pc": "0x03CF7D",
                    "port": "0x5016",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 207690,
                    "pc": "0x03CFA4",
                    "port": "0x5015",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 207691,
                    "pc": "0x03CFCF",
                    "port": "0x5014",
                    "value": "0x10",
                    "a": "0x00",
                    "f": "0x02",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "write",
                    "block": 207773,
                    "pc": "0x000658",
                    "port": "0x0009",
                    "value": "0x02",
                    "a": "0x02",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 207776,
                    "pc": "0x00067E",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x05",
                    "f": "0x04",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 207779,
                    "pc": "0x0012E3",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x06",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 208123,
                    "pc": "0x001379",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x76",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 208128,
                    "pc": "0x001988",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x08",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 208238,
                    "pc": "0x001853",
                    "port": "0x0009",
                    "value": "0x02",
                    "a": "0x7F",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "write",
                    "block": 208238,
                    "pc": "0x001853",
                    "port": "0x0009",
                    "value": "0x42",
                    "a": "0x42",
                    "f": "0x00",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  }
                ],
                "lastIoByPort": {
                  "0x0003": {
                    "type": "read",
                    "block": 208128,
                    "pc": "0x001988",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x08",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  "0x5016": {
                    "type": "read",
                    "block": 207689,
                    "pc": "0x03CF7D",
                    "port": "0x5016",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  "0x5015": {
                    "type": "read",
                    "block": 207690,
                    "pc": "0x03CFA4",
                    "port": "0x5015",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  "0x5014": {
                    "type": "read",
                    "block": 207691,
                    "pc": "0x03CFCF",
                    "port": "0x5014",
                    "value": "0x10",
                    "a": "0x00",
                    "f": "0x02",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  "0x5004": {
                    "type": "write",
                    "block": 203296,
                    "pc": "0x005C5E",
                    "port": "0x5004",
                    "value": "0x11",
                    "a": "0x11",
                    "f": "0x04",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  "0x5005": {
                    "type": "write",
                    "block": 11366,
                    "pc": "0x048ACC",
                    "port": "0x5005",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x45",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": true
                    }
                  },
                  "0x0009": {
                    "type": "write",
                    "block": 208238,
                    "pc": "0x001853",
                    "port": "0x0009",
                    "value": "0x42",
                    "a": "0x42",
                    "f": "0x00",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  }
                }
              },
              {
                "block": 208341,
                "target": "clear001879",
                "pc": "0x001879",
                "previousPc": "0x001872",
                "routeFields": {
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
                "cpu": {
                  "pc": "0x001879",
                  "sp": "0xD1A87B",
                  "ix": "0x000000",
                  "iy": "0xD00080",
                  "a": "0xEE",
                  "f": "0x54",
                  "af": "0xEE54",
                  "bc": "0x000003",
                  "de": "0x000430",
                  "hl": "0x000000",
                  "flags": {
                    "s": false,
                    "z": true,
                    "h": true,
                    "pv": true,
                    "n": false,
                    "c": false
                  },
                  "halted": false,
                  "madl": 1,
                  "mbase": "0xD0"
                },
                "iyFlags": {
                  "IY+00": {
                    "addr": "0xD00080",
                    "value": "0x00"
                  },
                  "IY+0D": {
                    "addr": "0xD0008D",
                    "value": "0x00"
                  },
                  "IY+1B": {
                    "addr": "0xD0009B",
                    "value": "0x00"
                  },
                  "IY+1F": {
                    "addr": "0xD0009F",
                    "value": "0x00"
                  },
                  "IY+23": {
                    "addr": "0xD000A3",
                    "value": "0x00"
                  },
                  "IY+27": {
                    "addr": "0xD000A7",
                    "value": "0x00"
                  },
                  "IY+28": {
                    "addr": "0xD000A8",
                    "value": "0x00"
                  },
                  "IY+2C": {
                    "addr": "0xD000AC",
                    "value": "0x00"
                  },
                  "IY+42": {
                    "addr": "0xD000C2",
                    "value": "0x00"
                  },
                  "IY+44": {
                    "addr": "0xD000C4",
                    "value": "0x00"
                  }
                },
                "bytesAtPc": [
                  "0xED",
                  "0x38",
                  "0x09",
                  "0xCB",
                  "0xE7",
                  "0xED",
                  "0x39",
                  "0x09",
                  "0x21",
                  "0x00",
                  "0x00",
                  "0xD0",
                  "0x11",
                  "0x01",
                  "0x00",
                  "0xD0"
                ],
                "recentBlocks": [
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
                "stack24": [
                  {
                    "offset": 0,
                    "addr": "0xD1A87B",
                    "value": "0x0013E8"
                  },
                  {
                    "offset": 3,
                    "addr": "0xD1A87E",
                    "value": "0x000000"
                  },
                  {
                    "offset": 6,
                    "addr": "0xD1A881",
                    "value": "0x000000"
                  },
                  {
                    "offset": 9,
                    "addr": "0xD1A884",
                    "value": "0x000000"
                  },
                  {
                    "offset": 12,
                    "addr": "0xD1A887",
                    "value": "0x000000"
                  },
                  {
                    "offset": 15,
                    "addr": "0xD1A88A",
                    "value": "0x000000"
                  },
                  {
                    "offset": 18,
                    "addr": "0xD1A88D",
                    "value": "0x008000"
                  },
                  {
                    "offset": 21,
                    "addr": "0xD1A890",
                    "value": "0x000000"
                  },
                  {
                    "offset": 24,
                    "addr": "0xD1A893",
                    "value": "0x000000"
                  },
                  {
                    "offset": 27,
                    "addr": "0xD1A896",
                    "value": "0x008000"
                  },
                  {
                    "offset": 30,
                    "addr": "0xD1A899",
                    "value": "0x000000"
                  },
                  {
                    "offset": 33,
                    "addr": "0xD1A89C",
                    "value": "0x000000"
                  }
                ],
                "returnHints": [
                  "0x0013E8",
                  "0x008000",
                  "0x008000"
                ],
                "ioTail": [
                  {
                    "type": "read",
                    "block": 207178,
                    "pc": "0x006816",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x02",
                    "f": "0x00",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 207185,
                    "pc": "0x03CF7D",
                    "port": "0x5016",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 207186,
                    "pc": "0x03CFA4",
                    "port": "0x5015",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 207187,
                    "pc": "0x03CFCF",
                    "port": "0x5014",
                    "value": "0x10",
                    "a": "0x00",
                    "f": "0x02",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 207323,
                    "pc": "0x006816",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x02",
                    "f": "0x00",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 207330,
                    "pc": "0x03CF7D",
                    "port": "0x5016",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 207331,
                    "pc": "0x03CFA4",
                    "port": "0x5015",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 207332,
                    "pc": "0x03CFCF",
                    "port": "0x5014",
                    "value": "0x10",
                    "a": "0x00",
                    "f": "0x02",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 207482,
                    "pc": "0x006816",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x02",
                    "f": "0x00",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 207489,
                    "pc": "0x03CF7D",
                    "port": "0x5016",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 207490,
                    "pc": "0x03CFA4",
                    "port": "0x5015",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 207491,
                    "pc": "0x03CFCF",
                    "port": "0x5014",
                    "value": "0x10",
                    "a": "0x00",
                    "f": "0x02",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 207682,
                    "pc": "0x006816",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x02",
                    "f": "0x00",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 207689,
                    "pc": "0x03CF7D",
                    "port": "0x5016",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 207690,
                    "pc": "0x03CFA4",
                    "port": "0x5015",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 207691,
                    "pc": "0x03CFCF",
                    "port": "0x5014",
                    "value": "0x10",
                    "a": "0x00",
                    "f": "0x02",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "write",
                    "block": 207773,
                    "pc": "0x000658",
                    "port": "0x0009",
                    "value": "0x02",
                    "a": "0x02",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 207776,
                    "pc": "0x00067E",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x05",
                    "f": "0x04",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 207779,
                    "pc": "0x0012E3",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x06",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 208123,
                    "pc": "0x001379",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x76",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 208128,
                    "pc": "0x001988",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x08",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 208238,
                    "pc": "0x001853",
                    "port": "0x0009",
                    "value": "0x02",
                    "a": "0x7F",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "write",
                    "block": 208238,
                    "pc": "0x001853",
                    "port": "0x0009",
                    "value": "0x42",
                    "a": "0x42",
                    "f": "0x00",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 208340,
                    "pc": "0x001872",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x00",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  }
                ],
                "lastIoByPort": {
                  "0x0003": {
                    "type": "read",
                    "block": 208340,
                    "pc": "0x001872",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x00",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  "0x5016": {
                    "type": "read",
                    "block": 207689,
                    "pc": "0x03CF7D",
                    "port": "0x5016",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  "0x5015": {
                    "type": "read",
                    "block": 207690,
                    "pc": "0x03CFA4",
                    "port": "0x5015",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  "0x5014": {
                    "type": "read",
                    "block": 207691,
                    "pc": "0x03CFCF",
                    "port": "0x5014",
                    "value": "0x10",
                    "a": "0x00",
                    "f": "0x02",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  "0x5004": {
                    "type": "write",
                    "block": 203296,
                    "pc": "0x005C5E",
                    "port": "0x5004",
                    "value": "0x11",
                    "a": "0x11",
                    "f": "0x04",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  "0x5005": {
                    "type": "write",
                    "block": 11366,
                    "pc": "0x048ACC",
                    "port": "0x5005",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x45",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": true
                    }
                  },
                  "0x0009": {
                    "type": "write",
                    "block": 208238,
                    "pc": "0x001853",
                    "port": "0x0009",
                    "value": "0x42",
                    "a": "0x42",
                    "f": "0x00",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  }
                }
              },
              {
                "block": 208342,
                "target": "cleanup0018f8",
                "pc": "0x0018F8",
                "previousPc": "0x001879",
                "routeFields": {
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
                "cpu": {
                  "pc": "0x0018F8",
                  "sp": "0xD1A87B",
                  "ix": "0x000000",
                  "iy": "0xD00080",
                  "a": "0x52",
                  "f": "0x00",
                  "af": "0x5200",
                  "bc": "0x0000FF",
                  "de": "0xD3FF00",
                  "hl": "0xD3FEFF",
                  "flags": {
                    "s": false,
                    "z": false,
                    "h": false,
                    "pv": false,
                    "n": false,
                    "c": false
                  },
                  "halted": false,
                  "madl": 1,
                  "mbase": "0xD0"
                },
                "iyFlags": {
                  "IY+00": {
                    "addr": "0xD00080",
                    "value": "0x00"
                  },
                  "IY+0D": {
                    "addr": "0xD0008D",
                    "value": "0x00"
                  },
                  "IY+1B": {
                    "addr": "0xD0009B",
                    "value": "0x00"
                  },
                  "IY+1F": {
                    "addr": "0xD0009F",
                    "value": "0x00"
                  },
                  "IY+23": {
                    "addr": "0xD000A3",
                    "value": "0x00"
                  },
                  "IY+27": {
                    "addr": "0xD000A7",
                    "value": "0x00"
                  },
                  "IY+28": {
                    "addr": "0xD000A8",
                    "value": "0x00"
                  },
                  "IY+2C": {
                    "addr": "0xD000AC",
                    "value": "0x00"
                  },
                  "IY+42": {
                    "addr": "0xD000C2",
                    "value": "0x00"
                  },
                  "IY+44": {
                    "addr": "0xD000C4",
                    "value": "0x00"
                  }
                },
                "bytesAtPc": [
                  "0x36",
                  "0x00",
                  "0xED",
                  "0xB0",
                  "0xAF",
                  "0x32",
                  "0xB7",
                  "0x77",
                  "0xD1",
                  "0x3E",
                  "0x95",
                  "0x32",
                  "0x8F",
                  "0x05",
                  "0xD0",
                  "0xCD"
                ],
                "recentBlocks": [
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
                  "0x001879",
                  "0x0018F8"
                ],
                "stack24": [
                  {
                    "offset": 0,
                    "addr": "0xD1A87B",
                    "value": "0x0013E8"
                  },
                  {
                    "offset": 3,
                    "addr": "0xD1A87E",
                    "value": "0x000000"
                  },
                  {
                    "offset": 6,
                    "addr": "0xD1A881",
                    "value": "0x000000"
                  },
                  {
                    "offset": 9,
                    "addr": "0xD1A884",
                    "value": "0x000000"
                  },
                  {
                    "offset": 12,
                    "addr": "0xD1A887",
                    "value": "0x000000"
                  },
                  {
                    "offset": 15,
                    "addr": "0xD1A88A",
                    "value": "0x000000"
                  },
                  {
                    "offset": 18,
                    "addr": "0xD1A88D",
                    "value": "0x008000"
                  },
                  {
                    "offset": 21,
                    "addr": "0xD1A890",
                    "value": "0x000000"
                  },
                  {
                    "offset": 24,
                    "addr": "0xD1A893",
                    "value": "0x000000"
                  },
                  {
                    "offset": 27,
                    "addr": "0xD1A896",
                    "value": "0x008000"
                  },
                  {
                    "offset": 30,
                    "addr": "0xD1A899",
                    "value": "0x000000"
                  },
                  {
                    "offset": 33,
                    "addr": "0xD1A89C",
                    "value": "0x000000"
                  }
                ],
                "returnHints": [
                  "0x0013E8",
                  "0x008000",
                  "0x008000"
                ],
                "ioTail": [
                  {
                    "type": "read",
                    "block": 207186,
                    "pc": "0x03CFA4",
                    "port": "0x5015",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 207187,
                    "pc": "0x03CFCF",
                    "port": "0x5014",
                    "value": "0x10",
                    "a": "0x00",
                    "f": "0x02",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 207323,
                    "pc": "0x006816",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x02",
                    "f": "0x00",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 207330,
                    "pc": "0x03CF7D",
                    "port": "0x5016",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 207331,
                    "pc": "0x03CFA4",
                    "port": "0x5015",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 207332,
                    "pc": "0x03CFCF",
                    "port": "0x5014",
                    "value": "0x10",
                    "a": "0x00",
                    "f": "0x02",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 207482,
                    "pc": "0x006816",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x02",
                    "f": "0x00",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 207489,
                    "pc": "0x03CF7D",
                    "port": "0x5016",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 207490,
                    "pc": "0x03CFA4",
                    "port": "0x5015",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 207491,
                    "pc": "0x03CFCF",
                    "port": "0x5014",
                    "value": "0x10",
                    "a": "0x00",
                    "f": "0x02",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 207682,
                    "pc": "0x006816",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x02",
                    "f": "0x00",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 207689,
                    "pc": "0x03CF7D",
                    "port": "0x5016",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 207690,
                    "pc": "0x03CFA4",
                    "port": "0x5015",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 207691,
                    "pc": "0x03CFCF",
                    "port": "0x5014",
                    "value": "0x10",
                    "a": "0x00",
                    "f": "0x02",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "write",
                    "block": 207773,
                    "pc": "0x000658",
                    "port": "0x0009",
                    "value": "0x02",
                    "a": "0x02",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 207776,
                    "pc": "0x00067E",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x05",
                    "f": "0x04",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 207779,
                    "pc": "0x0012E3",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x06",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 208123,
                    "pc": "0x001379",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x76",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 208128,
                    "pc": "0x001988",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x08",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 208238,
                    "pc": "0x001853",
                    "port": "0x0009",
                    "value": "0x02",
                    "a": "0x7F",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "write",
                    "block": 208238,
                    "pc": "0x001853",
                    "port": "0x0009",
                    "value": "0x42",
                    "a": "0x42",
                    "f": "0x00",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 208340,
                    "pc": "0x001872",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x00",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "read",
                    "block": 208341,
                    "pc": "0x001879",
                    "port": "0x0009",
                    "value": "0x42",
                    "a": "0xEE",
                    "f": "0x54",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": true,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  {
                    "type": "write",
                    "block": 208341,
                    "pc": "0x001879",
                    "port": "0x0009",
                    "value": "0x52",
                    "a": "0x52",
                    "f": "0x04",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  }
                ],
                "lastIoByPort": {
                  "0x0003": {
                    "type": "read",
                    "block": 208340,
                    "pc": "0x001872",
                    "port": "0x0003",
                    "value": "0xEE",
                    "a": "0x00",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  "0x5016": {
                    "type": "read",
                    "block": 207689,
                    "pc": "0x03CF7D",
                    "port": "0x5016",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x42",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  "0x5015": {
                    "type": "read",
                    "block": 207690,
                    "pc": "0x03CFA4",
                    "port": "0x5015",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x44",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  "0x5014": {
                    "type": "read",
                    "block": 207691,
                    "pc": "0x03CFCF",
                    "port": "0x5014",
                    "value": "0x10",
                    "a": "0x00",
                    "f": "0x02",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": false,
                      "n": true,
                      "c": false
                    }
                  },
                  "0x5004": {
                    "type": "write",
                    "block": 203296,
                    "pc": "0x005C5E",
                    "port": "0x5004",
                    "value": "0x11",
                    "a": "0x11",
                    "f": "0x04",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  },
                  "0x5005": {
                    "type": "write",
                    "block": 11366,
                    "pc": "0x048ACC",
                    "port": "0x5005",
                    "value": "0x00",
                    "a": "0x00",
                    "f": "0x45",
                    "flags": {
                      "s": false,
                      "z": true,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": true
                    }
                  },
                  "0x0009": {
                    "type": "write",
                    "block": 208341,
                    "pc": "0x001879",
                    "port": "0x0009",
                    "value": "0x52",
                    "a": "0x52",
                    "f": "0x04",
                    "flags": {
                      "s": false,
                      "z": false,
                      "h": false,
                      "pv": true,
                      "n": false,
                      "c": false
                    }
                  }
                }
              }
            ],
            "ioEventsTail": [
              {
                "type": "read",
                "block": 207776,
                "pc": "0x00067E",
                "port": "0x0003",
                "value": "0xEE",
                "a": "0x05",
                "f": "0x04",
                "flags": {
                  "s": false,
                  "z": false,
                  "h": false,
                  "pv": true,
                  "n": false,
                  "c": false
                }
              },
              {
                "type": "read",
                "block": 207779,
                "pc": "0x0012E3",
                "port": "0x0003",
                "value": "0xEE",
                "a": "0x06",
                "f": "0x42",
                "flags": {
                  "s": false,
                  "z": true,
                  "h": false,
                  "pv": false,
                  "n": true,
                  "c": false
                }
              },
              {
                "type": "read",
                "block": 208123,
                "pc": "0x001379",
                "port": "0x0003",
                "value": "0xEE",
                "a": "0x76",
                "f": "0x42",
                "flags": {
                  "s": false,
                  "z": true,
                  "h": false,
                  "pv": false,
                  "n": true,
                  "c": false
                }
              },
              {
                "type": "read",
                "block": 208128,
                "pc": "0x001988",
                "port": "0x0003",
                "value": "0xEE",
                "a": "0x08",
                "f": "0x42",
                "flags": {
                  "s": false,
                  "z": true,
                  "h": false,
                  "pv": false,
                  "n": true,
                  "c": false
                }
              },
              {
                "type": "read",
                "block": 208238,
                "pc": "0x001853",
                "port": "0x0009",
                "value": "0x02",
                "a": "0x7F",
                "f": "0x44",
                "flags": {
                  "s": false,
                  "z": true,
                  "h": false,
                  "pv": true,
                  "n": false,
                  "c": false
                }
              },
              {
                "type": "write",
                "block": 208238,
                "pc": "0x001853",
                "port": "0x0009",
                "value": "0x42",
                "a": "0x42",
                "f": "0x00",
                "flags": {
                  "s": false,
                  "z": false,
                  "h": false,
                  "pv": false,
                  "n": false,
                  "c": false
                }
              },
              {
                "type": "read",
                "block": 208340,
                "pc": "0x001872",
                "port": "0x0003",
                "value": "0xEE",
                "a": "0x00",
                "f": "0x44",
                "flags": {
                  "s": false,
                  "z": true,
                  "h": false,
                  "pv": true,
                  "n": false,
                  "c": false
                }
              },
              {
                "type": "read",
                "block": 208341,
                "pc": "0x001879",
                "port": "0x0009",
                "value": "0x42",
                "a": "0xEE",
                "f": "0x54",
                "flags": {
                  "s": false,
                  "z": true,
                  "h": true,
                  "pv": true,
                  "n": false,
                  "c": false
                }
              },
              {
                "type": "write",
                "block": 208341,
                "pc": "0x001879",
                "port": "0x0009",
                "value": "0x52",
                "a": "0x52",
                "f": "0x04",
                "flags": {
                  "s": false,
                  "z": false,
                  "h": false,
                  "pv": true,
                  "n": false,
                  "c": false
                }
              },
              {
                "type": "read",
                "block": 208345,
                "pc": "0x005BB1",
                "port": "0x0003",
                "value": "0xEE",
                "a": "0x95",
                "f": "0x40",
                "flags": {
                  "s": false,
                  "z": true,
                  "h": false,
                  "pv": false,
                  "n": false,
                  "c": false
                }
              },
              {
                "type": "read",
                "block": 208348,
                "pc": "0x005C5E",
                "port": "0x5004",
                "value": "0x11",
                "a": "0x0C",
                "f": "0x42",
                "flags": {
                  "s": false,
                  "z": true,
                  "h": false,
                  "pv": false,
                  "n": true,
                  "c": false
                }
              },
              {
                "type": "write",
                "block": 208348,
                "pc": "0x005C5E",
                "port": "0x5004",
                "value": "0x11",
                "a": "0x11",
                "f": "0x04",
                "flags": {
                  "s": false,
                  "z": false,
                  "h": false,
                  "pv": true,
                  "n": false,
                  "c": false
                }
              },
              {
                "type": "read",
                "block": 208357,
                "pc": "0x005CF1",
                "port": "0x0003",
                "value": "0xEE",
                "a": "0xFF",
                "f": "0x84",
                "flags": {
                  "s": true,
                  "z": false,
                  "h": false,
                  "pv": true,
                  "n": false,
                  "c": false
                }
              },
              {
                "type": "read",
                "block": 208358,
                "pc": "0x005D0D",
                "port": "0x0009",
                "value": "0x52",
                "a": "0xEE",
                "f": "0x54",
                "flags": {
                  "s": false,
                  "z": true,
                  "h": true,
                  "pv": true,
                  "n": false,
                  "c": false
                }
              },
              {
                "type": "write",
                "block": 208358,
                "pc": "0x005D0D",
                "port": "0x0009",
                "value": "0x56",
                "a": "0x56",
                "f": "0x00",
                "flags": {
                  "s": false,
                  "z": false,
                  "h": false,
                  "pv": false,
                  "n": false,
                  "c": false
                }
              },
              {
                "type": "read",
                "block": 208360,
                "pc": "0x0061E9",
                "port": "0x0003",
                "value": "0xEE",
                "a": "0x01",
                "f": "0x00",
                "flags": {
                  "s": false,
                  "z": false,
                  "h": false,
                  "pv": false,
                  "n": false,
                  "c": false
                }
              },
              {
                "type": "read",
                "block": 208363,
                "pc": "0x005D19",
                "port": "0x0009",
                "value": "0x56",
                "a": "0x01",
                "f": "0x02",
                "flags": {
                  "s": false,
                  "z": false,
                  "h": false,
                  "pv": false,
                  "n": true,
                  "c": false
                }
              },
              {
                "type": "write",
                "block": 208363,
                "pc": "0x005D19",
                "port": "0x0009",
                "value": "0x52",
                "a": "0x52",
                "f": "0x04",
                "flags": {
                  "s": false,
                  "z": false,
                  "h": false,
                  "pv": true,
                  "n": false,
                  "c": false
                }
              },
              {
                "type": "read",
                "block": 208365,
                "pc": "0x0061E9",
                "port": "0x0003",
                "value": "0xEE",
                "a": "0x05",
                "f": "0x04",
                "flags": {
                  "s": false,
                  "z": false,
                  "h": false,
                  "pv": true,
                  "n": false,
                  "c": false
                }
              },
              {
                "type": "read",
                "block": 208368,
                "pc": "0x005D27",
                "port": "0x0009",
                "value": "0x52",
                "a": "0x05",
                "f": "0x02",
                "flags": {
                  "s": false,
                  "z": false,
                  "h": false,
                  "pv": false,
                  "n": true,
                  "c": false
                }
              },
              {
                "type": "write",
                "block": 208368,
                "pc": "0x005D27",
                "port": "0x0009",
                "value": "0x56",
                "a": "0x56",
                "f": "0x00",
                "flags": {
                  "s": false,
                  "z": false,
                  "h": false,
                  "pv": false,
                  "n": false,
                  "c": false
                }
              },
              {
                "type": "read",
                "block": 208370,
                "pc": "0x0061E9",
                "port": "0x0003",
                "value": "0xEE",
                "a": "0x0C",
                "f": "0x0C",
                "flags": {
                  "s": false,
                  "z": false,
                  "h": false,
                  "pv": true,
                  "n": false,
                  "c": false
                }
              },
              {
                "type": "read",
                "block": 208395,
                "pc": "0x0061E9",
                "port": "0x0003",
                "value": "0xEE",
                "a": "0x0C",
                "f": "0x0C",
                "flags": {
                  "s": false,
                  "z": false,
                  "h": false,
                  "pv": true,
                  "n": false,
                  "c": false
                }
              },
              {
                "type": "read",
                "block": 209924,
                "pc": "0x00190F",
                "port": "0x0003",
                "value": "0xEE",
                "a": "0xFF",
                "f": "0x10",
                "flags": {
                  "s": false,
                  "z": false,
                  "h": true,
                  "pv": false,
                  "n": false,
                  "c": false
                }
              },
              {
                "type": "read",
                "block": 209932,
                "pc": "0x003B47",
                "port": "0x0009",
                "value": "0x56",
                "a": "0x02",
                "f": "0x10",
                "flags": {
                  "s": false,
                  "z": false,
                  "h": true,
                  "pv": false,
                  "n": false,
                  "c": false
                }
              },
              {
                "type": "write",
                "block": 209932,
                "pc": "0x003B47",
                "port": "0x0009",
                "value": "0xD6",
                "a": "0xD6",
                "f": "0x90",
                "flags": {
                  "s": true,
                  "z": false,
                  "h": true,
                  "pv": false,
                  "n": false,
                  "c": false
                }
              },
              {
                "type": "read",
                "block": 209934,
                "pc": "0x0061E9",
                "port": "0x0003",
                "value": "0xEE",
                "a": "0x01",
                "f": "0x00",
                "flags": {
                  "s": false,
                  "z": false,
                  "h": false,
                  "pv": false,
                  "n": false,
                  "c": false
                }
              },
              {
                "type": "read",
                "block": 209938,
                "pc": "0x003B86",
                "port": "0x0009",
                "value": "0xD6",
                "a": "0x7F",
                "f": "0xAD",
                "flags": {
                  "s": true,
                  "z": false,
                  "h": false,
                  "pv": true,
                  "n": false,
                  "c": true
                }
              },
              {
                "type": "write",
                "block": 209938,
                "pc": "0x003B86",
                "port": "0x0009",
                "value": "0xF6",
                "a": "0xF6",
                "f": "0xA4",
                "flags": {
                  "s": true,
                  "z": false,
                  "h": false,
                  "pv": true,
                  "n": false,
                  "c": false
                }
              },
              {
                "type": "read",
                "block": 209940,
                "pc": "0x0061E9",
                "port": "0x0003",
                "value": "0xEE",
                "a": "0x09",
                "f": "0x0C",
                "flags": {
                  "s": false,
                  "z": false,
                  "h": false,
                  "pv": true,
                  "n": false,
                  "c": false
                }
              },
              {
                "type": "read",
                "block": 209943,
                "pc": "0x003B9C",
                "port": "0x0009",
                "value": "0xF6",
                "a": "0x09",
                "f": "0x0A",
                "flags": {
                  "s": false,
                  "z": false,
                  "h": false,
                  "pv": false,
                  "n": true,
                  "c": false
                }
              },
              {
                "type": "write",
                "block": 209943,
                "pc": "0x003B9C",
                "port": "0x0009",
                "value": "0xF6",
                "a": "0xF6",
                "f": "0xA4",
                "flags": {
                  "s": true,
                  "z": false,
                  "h": false,
                  "pv": true,
                  "n": false,
                  "c": false
                }
              },
              {
                "type": "read",
                "block": 209945,
                "pc": "0x0061E9",
                "port": "0x0003",
                "value": "0xEE",
                "a": "0x01",
                "f": "0x00",
                "flags": {
                  "s": false,
                  "z": false,
                  "h": false,
                  "pv": false,
                  "n": false,
                  "c": false
                }
              },
              {
                "type": "read",
                "block": 209949,
                "pc": "0x003BB8",
                "port": "0x0009",
                "value": "0xF6",
                "a": "0x03",
                "f": "0xAD",
                "flags": {
                  "s": true,
                  "z": false,
                  "h": false,
                  "pv": true,
                  "n": false,
                  "c": true
                }
              },
              {
                "type": "write",
                "block": 209949,
                "pc": "0x003BB8",
                "port": "0x0009",
                "value": "0x76",
                "a": "0x76",
                "f": "0x30",
                "flags": {
                  "s": false,
                  "z": false,
                  "h": true,
                  "pv": false,
                  "n": false,
                  "c": false
                }
              },
              {
                "type": "read",
                "block": 209951,
                "pc": "0x0061E9",
                "port": "0x0003",
                "value": "0xEE",
                "a": "0x01",
                "f": "0x00",
                "flags": {
                  "s": false,
                  "z": false,
                  "h": false,
                  "pv": false,
                  "n": false,
                  "c": false
                }
              },
              {
                "type": "read",
                "block": 209955,
                "pc": "0x003BD1",
                "port": "0x0009",
                "value": "0x76",
                "a": "0x80",
                "f": "0xAD",
                "flags": {
                  "s": true,
                  "z": false,
                  "h": false,
                  "pv": true,
                  "n": false,
                  "c": true
                }
              },
              {
                "type": "write",
                "block": 209955,
                "pc": "0x003BD1",
                "port": "0x0009",
                "value": "0xD6",
                "a": "0xD6",
                "f": "0x90",
                "flags": {
                  "s": true,
                  "z": false,
                  "h": true,
                  "pv": false,
                  "n": false,
                  "c": false
                }
              },
              {
                "type": "read",
                "block": 209957,
                "pc": "0x0061E9",
                "port": "0x0003",
                "value": "0xEE",
                "a": "0x01",
                "f": "0x00",
                "flags": {
                  "s": false,
                  "z": false,
                  "h": false,
                  "pv": false,
                  "n": false,
                  "c": false
                }
              },
              {
                "type": "read",
                "block": 209963,
                "pc": "0x0061E9",
                "port": "0x0003",
                "value": "0xEE",
                "a": "0x01",
                "f": "0x00",
                "flags": {
                  "s": false,
                  "z": false,
                  "h": false,
                  "pv": false,
                  "n": false,
                  "c": false
                }
              },
              {
                "type": "read",
                "block": 209967,
                "pc": "0x003BFD",
                "port": "0x0009",
                "value": "0xD6",
                "a": "0x83",
                "f": "0xAD",
                "flags": {
                  "s": true,
                  "z": false,
                  "h": false,
                  "pv": true,
                  "n": false,
                  "c": true
                }
              },
              {
                "type": "write",
                "block": 209967,
                "pc": "0x003BFD",
                "port": "0x0009",
                "value": "0x56",
                "a": "0x56",
                "f": "0x14",
                "flags": {
                  "s": false,
                  "z": false,
                  "h": true,
                  "pv": true,
                  "n": false,
                  "c": false
                }
              },
              {
                "type": "read",
                "block": 209969,
                "pc": "0x0061E9",
                "port": "0x0003",
                "value": "0xEE",
                "a": "0x01",
                "f": "0x00",
                "flags": {
                  "s": false,
                  "z": false,
                  "h": false,
                  "pv": false,
                  "n": false,
                  "c": false
                }
              },
              {
                "type": "read",
                "block": 209975,
                "pc": "0x0061E9",
                "port": "0x0003",
                "value": "0xEE",
                "a": "0x01",
                "f": "0x00",
                "flags": {
                  "s": false,
                  "z": false,
                  "h": false,
                  "pv": false,
                  "n": false,
                  "c": false
                }
              },
              {
                "type": "read",
                "block": 209979,
                "pc": "0x003C27",
                "port": "0x0009",
                "value": "0x56",
                "a": "0x04",
                "f": "0xAD",
                "flags": {
                  "s": true,
                  "z": false,
                  "h": false,
                  "pv": true,
                  "n": false,
                  "c": true
                }
              },
              {
                "type": "write",
                "block": 209979,
                "pc": "0x003C27",
                "port": "0x0009",
                "value": "0x76",
                "a": "0x76",
                "f": "0x30",
                "flags": {
                  "s": false,
                  "z": false,
                  "h": true,
                  "pv": false,
                  "n": false,
                  "c": false
                }
              },
              {
                "type": "read",
                "block": 209981,
                "pc": "0x0061E9",
                "port": "0x0003",
                "value": "0xEE",
                "a": "0x09",
                "f": "0x0C",
                "flags": {
                  "s": false,
                  "z": false,
                  "h": false,
                  "pv": true,
                  "n": false,
                  "c": false
                }
              },
              {
                "type": "read",
                "block": 209990,
                "pc": "0x0013FC",
                "port": "0x0003",
                "value": "0xEE",
                "a": "0x04",
                "f": "0x80",
                "flags": {
                  "s": true,
                  "z": false,
                  "h": false,
                  "pv": false,
                  "n": false,
                  "c": false
                }
              }
            ],
            "lastIoByPort": {
              "0x0003": {
                "type": "read",
                "block": 209990,
                "pc": "0x0013FC",
                "port": "0x0003",
                "value": "0xEE",
                "a": "0x04",
                "f": "0x80",
                "flags": {
                  "s": true,
                  "z": false,
                  "h": false,
                  "pv": false,
                  "n": false,
                  "c": false
                }
              },
              "0x5016": {
                "type": "read",
                "block": 207689,
                "pc": "0x03CF7D",
                "port": "0x5016",
                "value": "0x00",
                "a": "0x00",
                "f": "0x42",
                "flags": {
                  "s": false,
                  "z": true,
                  "h": false,
                  "pv": false,
                  "n": true,
                  "c": false
                }
              },
              "0x5015": {
                "type": "read",
                "block": 207690,
                "pc": "0x03CFA4",
                "port": "0x5015",
                "value": "0x00",
                "a": "0x00",
                "f": "0x44",
                "flags": {
                  "s": false,
                  "z": true,
                  "h": false,
                  "pv": true,
                  "n": false,
                  "c": false
                }
              },
              "0x5014": {
                "type": "read",
                "block": 207691,
                "pc": "0x03CFCF",
                "port": "0x5014",
                "value": "0x10",
                "a": "0x00",
                "f": "0x02",
                "flags": {
                  "s": false,
                  "z": false,
                  "h": false,
                  "pv": false,
                  "n": true,
                  "c": false
                }
              },
              "0x5004": {
                "type": "write",
                "block": 208348,
                "pc": "0x005C5E",
                "port": "0x5004",
                "value": "0x11",
                "a": "0x11",
                "f": "0x04",
                "flags": {
                  "s": false,
                  "z": false,
                  "h": false,
                  "pv": true,
                  "n": false,
                  "c": false
                }
              },
              "0x5005": {
                "type": "write",
                "block": 11366,
                "pc": "0x048ACC",
                "port": "0x5005",
                "value": "0x00",
                "a": "0x00",
                "f": "0x45",
                "flags": {
                  "s": false,
                  "z": true,
                  "h": false,
                  "pv": true,
                  "n": false,
                  "c": true
                }
              },
              "0x0009": {
                "type": "write",
                "block": 209979,
                "pc": "0x003C27",
                "port": "0x0009",
                "value": "0x76",
                "a": "0x76",
                "f": "0x30",
                "flags": {
                  "s": false,
                  "z": false,
                  "h": true,
                  "pv": false,
                  "n": false,
                  "c": false
                }
              }
            },
            "routeEvents": [
              {
                "event": "D008E0 first nonzero write",
                "block": 1,
                "pc": "0x08C331",
                "detectionPc": "0x08C331",
                "before": {
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
                "after": {
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
                "recentBlocks": [
                  "0x08C331"
                ],
                "stack24": [
                  {
                    "offset": 0,
                    "addr": "0xD1A863",
                    "value": "0x0019B5"
                  },
                  {
                    "offset": 3,
                    "addr": "0xD1A866",
                    "value": "0xFFFFFF"
                  },
                  {
                    "offset": 6,
                    "addr": "0xD1A869",
                    "value": "0xFFFFFF"
                  },
                  {
                    "offset": 9,
                    "addr": "0xD1A86C",
                    "value": "0xFFFFFF"
                  },
                  {
                    "offset": 12,
                    "addr": "0xD1A86F",
                    "value": "0xFFFFFF"
                  },
                  {
                    "offset": 15,
                    "addr": "0xD1A872",
                    "value": "0xFFFFFF"
                  },
                  {
                    "offset": 18,
                    "addr": "0xD1A875",
                    "value": "0xFFFFFF"
                  },
                  {
                    "offset": 21,
                    "addr": "0xD1A878",
                    "value": "0xFFFFFF"
                  },
                  {
                    "offset": 24,
                    "addr": "0xD1A87B",
                    "value": "0xFFFFFF"
                  },
                  {
                    "offset": 27,
                    "addr": "0xD1A87E",
                    "value": "0x000000"
                  }
                ],
                "cpu": {
                  "pc": "0x08C331",
                  "sp": "0xD1A863",
                  "ix": "0xD1A860",
                  "iy": "0xD00080",
                  "f": "0x40",
                  "halted": false,
                  "madl": 1
                },
                "from": 0,
                "to": 13740131,
                "writerPc": "0x08C331",
                "observedBeforeHook": {
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
                "event": "D007CA first clear",
                "block": 13139,
                "pc": "0x001879",
                "detectionPc": "0x0018F8",
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
                "after": {
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
                "recentBlocks": [
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
                  "0x001879",
                  "0x0018F8"
                ],
                "stack24": [
                  {
                    "offset": 0,
                    "addr": "0xD1A87B",
                    "value": "0x0013E8"
                  },
                  {
                    "offset": 3,
                    "addr": "0xD1A87E",
                    "value": "0x000000"
                  },
                  {
                    "offset": 6,
                    "addr": "0xD1A881",
                    "value": "0x000000"
                  },
                  {
                    "offset": 9,
                    "addr": "0xD1A884",
                    "value": "0x000000"
                  },
                  {
                    "offset": 12,
                    "addr": "0xD1A887",
                    "value": "0x000000"
                  },
                  {
                    "offset": 15,
                    "addr": "0xD1A88A",
                    "value": "0x000000"
                  },
                  {
                    "offset": 18,
                    "addr": "0xD1A88D",
                    "value": "0x008000"
                  },
                  {
                    "offset": 21,
                    "addr": "0xD1A890",
                    "value": "0x000000"
                  },
                  {
                    "offset": 24,
                    "addr": "0xD1A893",
                    "value": "0x000000"
                  },
                  {
                    "offset": 27,
                    "addr": "0xD1A896",
                    "value": "0x008000"
                  }
                ],
                "cpu": {
                  "pc": "0x0018F8",
                  "sp": "0xD1A87B",
                  "ix": "0x000000",
                  "iy": "0xD00080",
                  "f": "0x00",
                  "halted": false,
                  "madl": 1
                },
                "from": 361961,
                "to": 0,
                "writerPc": "0x001879",
                "observedBeforeHook": {
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
                "event": "D008E0 first clear",
                "block": 13139,
                "pc": "0x001879",
                "detectionPc": "0x0018F8",
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
                "after": {
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
                "recentBlocks": [
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
                  "0x001879",
                  "0x0018F8"
                ],
                "stack24": [
                  {
                    "offset": 0,
                    "addr": "0xD1A87B",
                    "value": "0x0013E8"
                  },
                  {
                    "offset": 3,
                    "addr": "0xD1A87E",
                    "value": "0x000000"
                  },
                  {
                    "offset": 6,
                    "addr": "0xD1A881",
                    "value": "0x000000"
                  },
                  {
                    "offset": 9,
                    "addr": "0xD1A884",
                    "value": "0x000000"
                  },
                  {
                    "offset": 12,
                    "addr": "0xD1A887",
                    "value": "0x000000"
                  },
                  {
                    "offset": 15,
                    "addr": "0xD1A88A",
                    "value": "0x000000"
                  },
                  {
                    "offset": 18,
                    "addr": "0xD1A88D",
                    "value": "0x008000"
                  },
                  {
                    "offset": 21,
                    "addr": "0xD1A890",
                    "value": "0x000000"
                  },
                  {
                    "offset": 24,
                    "addr": "0xD1A893",
                    "value": "0x000000"
                  },
                  {
                    "offset": 27,
                    "addr": "0xD1A896",
                    "value": "0x008000"
                  }
                ],
                "cpu": {
                  "pc": "0x0018F8",
                  "sp": "0xD1A87B",
                  "ix": "0x000000",
                  "iy": "0xD00080",
                  "f": "0x00",
                  "halted": false,
                  "madl": 1
                },
                "from": 13740131,
                "to": 0,
                "writerPc": "0x001879",
                "observedBeforeHook": {
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
                "event": "VAT_D02590 first clear",
                "block": 13139,
                "pc": "0x001879",
                "detectionPc": "0x0018F8",
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
                "after": {
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
                "recentBlocks": [
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
                  "0x001879",
                  "0x0018F8"
                ],
                "stack24": [
                  {
                    "offset": 0,
                    "addr": "0xD1A87B",
                    "value": "0x0013E8"
                  },
                  {
                    "offset": 3,
                    "addr": "0xD1A87E",
                    "value": "0x000000"
                  },
                  {
                    "offset": 6,
                    "addr": "0xD1A881",
                    "value": "0x000000"
                  },
                  {
                    "offset": 9,
                    "addr": "0xD1A884",
                    "value": "0x000000"
                  },
                  {
                    "offset": 12,
                    "addr": "0xD1A887",
                    "value": "0x000000"
                  },
                  {
                    "offset": 15,
                    "addr": "0xD1A88A",
                    "value": "0x000000"
                  },
                  {
                    "offset": 18,
                    "addr": "0xD1A88D",
                    "value": "0x008000"
                  },
                  {
                    "offset": 21,
                    "addr": "0xD1A890",
                    "value": "0x000000"
                  },
                  {
                    "offset": 24,
                    "addr": "0xD1A893",
                    "value": "0x000000"
                  },
                  {
                    "offset": 27,
                    "addr": "0xD1A896",
                    "value": "0x008000"
                  }
                ],
                "cpu": {
                  "pc": "0x0018F8",
                  "sp": "0xD1A87B",
                  "ix": "0x000000",
                  "iy": "0xD00080",
                  "f": "0x00",
                  "halted": false,
                  "madl": 1
                },
                "from": 13893249,
                "to": 0,
                "writerPc": "0x001879",
                "observedBeforeHook": {
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
                "event": "VAT_D0259D first clear",
                "block": 13139,
                "pc": "0x001879",
                "detectionPc": "0x0018F8",
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
                "after": {
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
                "recentBlocks": [
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
                  "0x001879",
                  "0x0018F8"
                ],
                "stack24": [
                  {
                    "offset": 0,
                    "addr": "0xD1A87B",
                    "value": "0x0013E8"
                  },
                  {
                    "offset": 3,
                    "addr": "0xD1A87E",
                    "value": "0x000000"
                  },
                  {
                    "offset": 6,
                    "addr": "0xD1A881",
                    "value": "0x000000"
                  },
                  {
                    "offset": 9,
                    "addr": "0xD1A884",
                    "value": "0x000000"
                  },
                  {
                    "offset": 12,
                    "addr": "0xD1A887",
                    "value": "0x000000"
                  },
                  {
                    "offset": 15,
                    "addr": "0xD1A88A",
                    "value": "0x000000"
                  },
                  {
                    "offset": 18,
                    "addr": "0xD1A88D",
                    "value": "0x008000"
                  },
                  {
                    "offset": 21,
                    "addr": "0xD1A890",
                    "value": "0x000000"
                  },
                  {
                    "offset": 24,
                    "addr": "0xD1A893",
                    "value": "0x000000"
                  },
                  {
                    "offset": 27,
                    "addr": "0xD1A896",
                    "value": "0x008000"
                  }
                ],
                "cpu": {
                  "pc": "0x0018F8",
                  "sp": "0xD1A87B",
                  "ix": "0x000000",
                  "iy": "0xD00080",
                  "f": "0x00",
                  "halted": false,
                  "madl": 1
                },
                "from": 13893325,
                "to": 0,
                "writerPc": "0x001879",
                "observedBeforeHook": {
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
    }
  ],
  "errors": []
}
```

No source files from the browser shell, runtime, transpiler, or scheduler were modified; this probe serves an instrumented HTML copy from memory.


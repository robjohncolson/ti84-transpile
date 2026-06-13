# Phase 656: Browser Token/Tuple Retest With VAT Replay

Probe: `probe-phase656-browser-token-retest.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase656-browser-token-retest.mjs`  
Exit: 0

## Summary

- PASS: Captured the Phase 5 replay snapshot at block 84130 / 0x001879: D007CA=0x0585E9, VAT=0xD3FE81.
- PASS: Replayed the snapshot before Phase 6; replay restored D007CA=0x0585E9, VAT=0xD3FE81.
- PASS: Browser Phase 6 ended halt after 49474 steps at 0x0019B5; 0x084711 hits=34, VRAM=8549px.
- PASS: Escape/CLEAR seed used live D007CA+D008E0 (VAT zero by key entry); route=low-transfer path; token/tail hits=0, low-path hits=60889, cleanup hits=3.
- PASS: Digit2 seed used live D007CA+D008E0 (VAT zero by key entry); route=low-transfer path; token/tail hits=0, low-path hits=60889, cleanup hits=3.
- PASS: Page error collector saw no browser exceptions.

## Interpretation

With the phase655 replay active, Phase 6 starts from live VAT and halts cleanly. In the phase637-style retest, the one-shot pre-key AutoRun frame still falls into the low-transfer/status path and zeroes the replayed VAT/core RAM before the key bursts. The browser key handler re-arms D007CA and D008E0 for each key, so cxMain is reached, but both Escape/CLEAR and Digit2 still route through the low-transfer/status path instead of the token/tail hooks (`0x08F5E1`, `0x090992`, `0x09098E`, `0x08F54B`).

## Key Records

```json
{
  "beforeBoot": {
    "status": "Ready. Click Boot to start.",
    "bootDisabled": false,
    "preserve": true,
    "autoRunText": "AutoRun",
    "diagnostics": null,
    "vramPixels": 0,
    "errors": [],
    "phase656": {
      "records": [],
      "routeRecords": [],
      "phaseStats": {},
      "snapshot": null,
      "restore": null,
      "currentRoute": null,
      "read": {},
      "beginRoute": {},
      "finishRoute": {}
    },
    "logTail": [
      "Click Boot to load ROM (~15 MB compressed)"
    ]
  },
  "afterColdboot": {
    "status": "Coldboot complete. OS event loop is ready.",
    "bootDisabled": true,
    "preserve": true,
    "autoRunText": "AutoRun",
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
        "D0243D": 13805589,
        "D02A40": 0,
        "D02A28": 0
      }
    },
    "vramPixels": 8549,
    "errors": [],
    "phase656": {
      "records": [
        {
          "label": "browser-before-p5-launch-home",
          "result": null,
          "runtimeMode": "coldboot",
          "lastPc": 0,
          "lastMode": "z80",
          "totalSteps": 312390,
          "cpu": {
            "pc": 6581,
            "sp": 13740134,
            "iy": 13631616,
            "ix": 16777215,
            "f": 68,
            "halted": false,
            "iff1": 1,
            "iff2": 1,
            "mbase": 208,
            "madl": 1
          },
          "replayFields": {
            "D007CA": "0x000000",
            "D008E0": "0xD1A866",
            "D02587": "0x000000",
            "D0258A": "0x000000",
            "D0258D": "0x000000",
            "D02590": "0x000000",
            "D02593": "0x000000",
            "D0259A": "0x000000",
            "D0259D": "0x000000",
            "D025A0": "0x000000",
            "D025C5": "0x000000"
          },
          "routeFields": {
            "D00587": 0,
            "D0058C": 0,
            "D0058D": 0,
            "D0058E": 0,
            "D00080": 0,
            "D0009F": 0,
            "D007CA": 0,
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
            "VAT_D02590": 0,
            "VAT_D0259D": 0
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
          "vramPixels": 0,
          "status": "Parsing ROM module...",
          "autoRunText": "AutoRun"
        },
        {
          "label": "browser-after-p5-launch-home",
          "result": {
            "steps": 275843,
            "termination": "halt",
            "lastPc": 6581,
            "lastMode": "adl"
          },
          "runtimeMode": "coldboot",
          "lastPc": 0,
          "lastMode": "z80",
          "totalSteps": 312390,
          "cpu": {
            "pc": 6581,
            "sp": 13740158,
            "iy": 13631616,
            "ix": 16777215,
            "f": 68,
            "halted": true,
            "iff1": 0,
            "iff2": 0,
            "mbase": 208,
            "madl": 1
          },
          "replayFields": {
            "D007CA": "0x000000",
            "D008E0": "0x000000",
            "D02587": "0x000000",
            "D0258A": "0x000000",
            "D0258D": "0x000000",
            "D02590": "0x000000",
            "D02593": "0x000000",
            "D0259A": "0x000000",
            "D0259D": "0x000000",
            "D025A0": "0x000000",
            "D025C5": "0x000000"
          },
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
          "vramPixels": 0,
          "status": "Parsing ROM module...",
          "autoRunText": "AutoRun"
        },
        {
          "label": "browser-after-p5-snapshot-replay",
          "result": null,
          "runtimeMode": "coldboot",
          "lastPc": 0,
          "lastMode": "z80",
          "totalSteps": 588233,
          "cpu": {
            "pc": 6581,
            "sp": 13740158,
            "iy": 13631616,
            "ix": 16777215,
            "f": 68,
            "halted": true,
            "iff1": 0,
            "iff2": 0,
            "mbase": 208,
            "madl": 1
          },
          "replayFields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A866",
            "D02587": "0xD2A8E2",
            "D0258A": "0xD2A8E2",
            "D0258D": "0xD2A8E2",
            "D02590": "0xD3FE81",
            "D02593": "0xD3FE81",
            "D0259A": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D025A0": "0xD2A8A4",
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
          "vramPixels": 0,
          "status": "Parsing ROM module...",
          "autoRunText": "AutoRun"
        },
        {
          "label": "browser-after-p6-event-frame",
          "result": null,
          "runtimeMode": "coldboot",
          "lastPc": 574257,
          "lastMode": "adl",
          "totalSteps": 588233,
          "cpu": {
            "pc": 6581,
            "sp": 13740131,
            "iy": 13631616,
            "ix": 13740128,
            "f": 64,
            "halted": false,
            "iff1": 1,
            "iff2": 1,
            "mbase": 208,
            "madl": 1
          },
          "replayFields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D02587": "0xD2A8E2",
            "D0258A": "0xD2A8E2",
            "D0258D": "0xD2A8E2",
            "D02590": "0xD3FE81",
            "D02593": "0xD3FE81",
            "D0259A": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D025A0": "0xD2A8A4",
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
          "vramPixels": 0,
          "status": "Parsing ROM module...",
          "autoRunText": "AutoRun"
        },
        {
          "label": "browser-after-p6-home-repaint",
          "result": {
            "steps": 49474,
            "termination": "halt",
            "lastPc": 6581,
            "lastMode": "adl"
          },
          "runtimeMode": "coldboot",
          "lastPc": 574257,
          "lastMode": "adl",
          "totalSteps": 588233,
          "cpu": {
            "pc": 6581,
            "sp": 13740134,
            "iy": 13631616,
            "ix": 13740128,
            "f": 84,
            "halted": true,
            "iff1": 0,
            "iff2": 0,
            "mbase": 208,
            "madl": 1
          },
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
              "D0243D": 13805589,
              "D02A40": 0,
              "D02A28": 0
            }
          },
          "vramPixels": 8549,
          "status": "Parsing ROM module...",
          "autoRunText": "AutoRun"
        }
      ],
      "routeRecords": [],
      "phaseStats": {
        "browser-p5-launch-home": {
          "label": "browser-p5-launch-home",
          "totalBlocks": 275843,
          "targetCounts": {
            "launch09dd62": 1,
            "memInit09dee0": 1,
            "clear001879": 2,
            "cleanup0018f8": 2,
            "repaint058241": 0,
            "vatLoop084711": 65,
            "vatRewind082be2": 573,
            "halt0019b5": 1,
            "getCsc03fa09": 0,
            "loop08c331": 0,
            "cxMain0585e9": 0,
            "keyHandler05877a": 0,
            "outer08f3b8": 0,
            "tokenReader090883": 1,
            "tokenExit08f5e1": 1,
            "tokenGate090992": 4,
            "tokenStore09098e": 1,
            "eolTuple08f54b": 0,
            "displaySeed013d11": 1,
            "displayLoop0059c6": 300,
            "lowBranch0013fc": 1,
            "low006d38": 10080,
            "low006d4f": 10080,
            "low006d5d": 10088
          },
          "firstBlocks": [
            "0x09DD62",
            "0x09DEE0",
            "0x08A98F",
            "0x08A999",
            "0x07F976",
            "0x09DF0C",
            "0x09DF12",
            "0x000600",
            "0x0138EC",
            "0x09DF18",
            "0x09DF29",
            "0x04C9EA",
            "0x04C8B4",
            "0x04C9EE",
            "0x04C9F4",
            "0x04C896",
            "0x04C9F8",
            "0x09DF2E",
            "0x09DD66",
            "0x0003D4",
            "0x003CC2",
            "0x003CD4",
            "0x003CE0",
            "0x003CEE",
            "0x003CF3",
            "0x09DD7F",
            "0x09DD81",
            "0x09DD8D",
            "0x027F96",
            "0x027FAD",
            "0x027FBC",
            "0x03D202"
          ],
          "lastBlocks": [
            "0x0060B3",
            "0x0060B3",
            "0x0060B3",
            "0x0060B3",
            "0x0060B3",
            "0x0060B3",
            "0x0060B3",
            "0x0060B3",
            "0x0060B3",
            "0x0060B3",
            "0x0060B3",
            "0x0060B3",
            "0x0060B3",
            "0x0060B3",
            "0x0060B3",
            "0x0060B3",
            "0x0060B3",
            "0x0060B3",
            "0x0060B3",
            "0x0060B3",
            "0x0060B3",
            "0x0060B3",
            "0x0060B3",
            "0x0060B3",
            "0x0060B3",
            "0x0060B3",
            "0x0060B3",
            "0x0060B3",
            "0x0060B3",
            "0x0060B3",
            "0x0060B3",
            "0x0060B5",
            "0x0060C7",
            "0x0060D8",
            "0x0060E5",
            "0x0060EA",
            "0x0060F6",
            "0x00190F",
            "0x000862",
            "0x0019B5"
          ],
          "hotBlocks": [
            {
              "pc": "0x09EFDE",
              "count": 33600
            },
            {
              "pc": "0x000A92",
              "count": 32512
            },
            {
              "pc": "0x000BFE",
              "count": 32258
            },
            {
              "pc": "0x0021C2",
              "count": 10090
            },
            {
              "pc": "0x006D5D",
              "count": 10088
            },
            {
              "pc": "0x006D64",
              "count": 10088
            },
            {
              "pc": "0x006CDF",
              "count": 10083
            },
            {
              "pc": "0x006D0F",
              "count": 10083
            },
            {
              "pc": "0x006D38",
              "count": 10080
            },
            {
              "pc": "0x006D4F",
              "count": 10080
            },
            {
              "pc": "0x006CF7",
              "count": 10078
            },
            {
              "pc": "0x005AE8",
              "count": 4800
            },
            {
              "pc": "0x005B16",
              "count": 4800
            },
            {
              "pc": "0x005B4B",
              "count": 4800
            },
            {
              "pc": "0x005AB6",
              "count": 4500
            },
            {
              "pc": "0x000B72",
              "count": 3855
            },
            {
              "pc": "0x000B7C",
              "count": 3085
            },
            {
              "pc": "0x000B81",
              "count": 3085
            },
            {
              "pc": "0x0825D9",
              "count": 1200
            },
            {
              "pc": "0x07CB22",
              "count": 1183
            }
          ]
        },
        "browser-p6-home-repaint": {
          "label": "browser-p6-home-repaint",
          "totalBlocks": 49398,
          "targetCounts": {
            "launch09dd62": 0,
            "memInit09dee0": 0,
            "clear001879": 0,
            "cleanup0018f8": 0,
            "repaint058241": 1,
            "vatLoop084711": 34,
            "vatRewind082be2": 65,
            "halt0019b5": 1,
            "getCsc03fa09": 0,
            "loop08c331": 0,
            "cxMain0585e9": 0,
            "keyHandler05877a": 0,
            "outer08f3b8": 0,
            "tokenReader090883": 0,
            "tokenExit08f5e1": 0,
            "tokenGate090992": 0,
            "tokenStore09098e": 0,
            "eolTuple08f54b": 0,
            "displaySeed013d11": 0,
            "displayLoop0059c6": 0,
            "lowBranch0013fc": 0,
            "low006d38": 0,
            "low006d4f": 0,
            "low006d5d": 0
          },
          "firstBlocks": [
            "0x058241",
            "0x058257",
            "0x058258",
            "0x058262",
            "0x0800C2",
            "0x058272",
            "0x058BA3",
            "0x058276",
            "0x058222",
            "0x08C782",
            "0x05822A",
            "0x058282",
            "0x05828A",
            "0x05828F",
            "0x05829B",
            "0x0582A0",
            "0x09DCAA",
            "0x0582AC",
            "0x083623",
            "0x0582B0",
            "0x083764",
            "0x08376D",
            "0x07F8A2",
            "0x07F8C8",
            "0x07F974",
            "0x083771",
            "0x07FACF",
            "0x07FADF",
            "0x07FA7F",
            "0x07FA86",
            "0x083775",
            "0x061DEF"
          ],
          "lastBlocks": [
            "0x080087",
            "0x08008A",
            "0x080090",
            "0x0827A5",
            "0x08277C",
            "0x082784",
            "0x082BE2",
            "0x082788",
            "0x082799",
            "0x082745",
            "0x04C876",
            "0x082750",
            "0x0821B2",
            "0x0821B4",
            "0x0821B7",
            "0x082754",
            "0x082756",
            "0x082772",
            "0x08279E",
            "0x080084",
            "0x080087",
            "0x08008A",
            "0x080090",
            "0x0827A5",
            "0x08277C",
            "0x082784",
            "0x082BE2",
            "0x082788",
            "0x05E83A",
            "0x05E3A6",
            "0x05E851",
            "0x04C973",
            "0x05E85E",
            "0x05E861",
            "0x05E3AE",
            "0x05E3BB",
            "0x05E803",
            "0x058427",
            "0x058433",
            "0x0019B5"
          ],
          "hotBlocks": [
            {
              "pc": "0x0A28BF",
              "count": 8400
            },
            {
              "pc": "0x0A28B7",
              "count": 8399
            },
            {
              "pc": "0x09EFDE",
              "count": 4872
            },
            {
              "pc": "0x0A2588",
              "count": 2904
            },
            {
              "pc": "0x0A255F",
              "count": 2904
            },
            {
              "pc": "0x0A2563",
              "count": 2261
            },
            {
              "pc": "0x0A257E",
              "count": 2261
            },
            {
              "pc": "0x0A2572",
              "count": 1051
            },
            {
              "pc": "0x0A2548",
              "count": 492
            },
            {
              "pc": "0x0A254F",
              "count": 492
            },
            {
              "pc": "0x0A258B",
              "count": 492
            },
            {
              "pc": "0x0A2695",
              "count": 492
            },
            {
              "pc": "0x001CA6",
              "count": 461
            },
            {
              "pc": "0x001CC0",
              "count": 457
            },
            {
              "pc": "0x001CCA",
              "count": 457
            },
            {
              "pc": "0x0A2555",
              "count": 408
            },
            {
              "pc": "0x0A2585",
              "count": 408
            },
            {
              "pc": "0x0A269A",
              "count": 408
            },
            {
              "pc": "0x0A26B4",
              "count": 408
            },
            {
              "pc": "0x001C33",
              "count": 385
            }
          ]
        }
      },
      "snapshot": {
        "block": 84130,
        "pc": "0x001879",
        "fields": [
          {
            "name": "D007CA",
            "addr": 13633482,
            "len": 3,
            "value": 361961,
            "bytes": [
              233,
              133,
              5
            ]
          },
          {
            "name": "D008E0",
            "addr": 13633760,
            "len": 3,
            "value": 13740134,
            "bytes": [
              102,
              168,
              209
            ]
          },
          {
            "name": "D02587",
            "addr": 13641095,
            "len": 3,
            "value": 13805794,
            "bytes": [
              226,
              168,
              210
            ]
          },
          {
            "name": "D0258A",
            "addr": 13641098,
            "len": 3,
            "value": 13805794,
            "bytes": [
              226,
              168,
              210
            ]
          },
          {
            "name": "D0258D",
            "addr": 13641101,
            "len": 3,
            "value": 13805794,
            "bytes": [
              226,
              168,
              210
            ]
          },
          {
            "name": "D02590",
            "addr": 13641104,
            "len": 3,
            "value": 13893249,
            "bytes": [
              129,
              254,
              211
            ]
          },
          {
            "name": "D02593",
            "addr": 13641107,
            "len": 3,
            "value": 13893249,
            "bytes": [
              129,
              254,
              211
            ]
          },
          {
            "name": "D0259A",
            "addr": 13641114,
            "len": 3,
            "value": 13893249,
            "bytes": [
              129,
              254,
              211
            ]
          },
          {
            "name": "D0259D",
            "addr": 13641117,
            "len": 3,
            "value": 13893325,
            "bytes": [
              205,
              254,
              211
            ]
          },
          {
            "name": "D025A0",
            "addr": 13641120,
            "len": 3,
            "value": 13805732,
            "bytes": [
              164,
              168,
              210
            ]
          },
          {
            "name": "D025C5",
            "addr": 13641157,
            "len": 3,
            "value": 786432,
            "bytes": [
              0,
              0,
              12
            ]
          }
        ],
        "fieldsObject": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A866",
          "D02587": "0xD2A8E2",
          "D0258A": "0xD2A8E2",
          "D0258D": "0xD2A8E2",
          "D02590": "0xD3FE81",
          "D02593": "0xD3FE81",
          "D0259A": "0xD3FE81",
          "D0259D": "0xD3FECD",
          "D025A0": "0xD2A8A4",
          "D025C5": "0x0C0000"
        },
        "vramPixels": 0
      },
      "restore": {
        "label": "browser-before-p6-replay",
        "ok": true,
        "before": {
          "label": "browser-before-p6-replay-before",
          "result": null,
          "runtimeMode": "coldboot",
          "lastPc": 0,
          "lastMode": "z80",
          "totalSteps": 588233,
          "cpu": {
            "pc": 6581,
            "sp": 13740158,
            "iy": 13631616,
            "ix": 16777215,
            "f": 68,
            "halted": true,
            "iff1": 0,
            "iff2": 0,
            "mbase": 208,
            "madl": 1
          },
          "replayFields": {
            "D007CA": "0x000000",
            "D008E0": "0x000000",
            "D02587": "0x000000",
            "D0258A": "0x000000",
            "D0258D": "0x000000",
            "D02590": "0x000000",
            "D02593": "0x000000",
            "D0259A": "0x000000",
            "D0259D": "0x000000",
            "D025A0": "0x000000",
            "D025C5": "0x000000"
          },
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
          "vramPixels": 0,
          "status": "Parsing ROM module...",
          "autoRunText": "AutoRun"
        },
        "after": {
          "label": "browser-before-p6-replay-after",
          "result": null,
          "runtimeMode": "coldboot",
          "lastPc": 0,
          "lastMode": "z80",
          "totalSteps": 588233,
          "cpu": {
            "pc": 6581,
            "sp": 13740158,
            "iy": 13631616,
            "ix": 16777215,
            "f": 68,
            "halted": true,
            "iff1": 0,
            "iff2": 0,
            "mbase": 208,
            "madl": 1
          },
          "replayFields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A866",
            "D02587": "0xD2A8E2",
            "D0258A": "0xD2A8E2",
            "D0258D": "0xD2A8E2",
            "D02590": "0xD3FE81",
            "D02593": "0xD3FE81",
            "D0259A": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D025A0": "0xD2A8A4",
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
          "vramPixels": 0,
          "status": "Parsing ROM module...",
          "autoRunText": "AutoRun"
        }
      },
      "currentRoute": null,
      "read": {},
      "beginRoute": {},
      "finishRoute": {}
    },
    "logTail": [
      "Click Boot to load ROM (~15 MB compressed)",
      "--- Decoding ROM (145932 blocks, 17.0149% coverage) ---",
      "--- Coldboot Phase 1: Z80 cold boot (0x000000, 20K steps) ---",
      "--- Phase 1 done: 20000 steps, max_steps at 0x001cc0 ---",
      "--- Coldboot Phase 2: Kernel init (0x08C331, 100K steps) ---",
      "--- Phase 2 done: 100000 steps, max_steps at 0x000a92 ---",
      "--- Coldboot Phase 3: Post-init (0x0802B2, 100 steps) ---",
      "--- Phase 3 done: 100 steps, max_steps at 0x0158bc ---",
      "--- Coldboot Phase 4: Warm idle continuation (0x0019be, 1.5M step cap) ---",
      "--- Phase 4 done: 192290 steps, halt at 0x0019b5 ---",
      "--- Coldboot Phase 5: Launch-home init (0x09dd62, 300K step cap) ---",
      "--- Phase 5 done: 275843 steps, halt at 0x0019b5 ---",
      "--- Coldboot Phase 6: Home repaint (0x058241, 300K step cap) ---",
      "--- Phase 6 done: 49474 steps, halt at 0x0019b5; D007CA=0x0585e9, VAT=0xd3fe81, VRAM=8549px ---",
      "--- Coldboot seeded (entry=0x08c331, halt=0x0019b5, SP=0xd1a866, IY=0xD00080, timerInterrupt=true) ---"
    ]
  },
  "afterAutoRun": {
    "status": "Coldboot: 50000 steps, max_steps | Total: 687707 | PC=0x006d38",
    "bootDisabled": true,
    "preserve": true,
    "autoRunText": "AutoRun",
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
    "vramPixels": 3031,
    "errors": [],
    "phase656": {
      "records": [
        {
          "label": "browser-before-p5-launch-home",
          "result": null,
          "runtimeMode": "coldboot",
          "lastPc": 0,
          "lastMode": "z80",
          "totalSteps": 312390,
          "cpu": {
            "pc": 6581,
            "sp": 13740134,
            "iy": 13631616,
            "ix": 16777215,
            "f": 68,
            "halted": false,
            "iff1": 1,
            "iff2": 1,
            "mbase": 208,
            "madl": 1
          },
          "replayFields": {
            "D007CA": "0x000000",
            "D008E0": "0xD1A866",
            "D02587": "0x000000",
            "D0258A": "0x000000",
            "D0258D": "0x000000",
            "D02590": "0x000000",
            "D02593": "0x000000",
            "D0259A": "0x000000",
            "D0259D": "0x000000",
            "D025A0": "0x000000",
            "D025C5": "0x000000"
          },
          "routeFields": {
            "D00587": 0,
            "D0058C": 0,
            "D0058D": 0,
            "D0058E": 0,
            "D00080": 0,
            "D0009F": 0,
            "D007CA": 0,
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
            "VAT_D02590": 0,
            "VAT_D0259D": 0
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
          "vramPixels": 0,
          "status": "Parsing ROM module...",
          "autoRunText": "AutoRun"
        },
        {
          "label": "browser-after-p5-launch-home",
          "result": {
            "steps": 275843,
            "termination": "halt",
            "lastPc": 6581,
            "lastMode": "adl"
          },
          "runtimeMode": "coldboot",
          "lastPc": 0,
          "lastMode": "z80",
          "totalSteps": 312390,
          "cpu": {
            "pc": 6581,
            "sp": 13740158,
            "iy": 13631616,
            "ix": 16777215,
            "f": 68,
            "halted": true,
            "iff1": 0,
            "iff2": 0,
            "mbase": 208,
            "madl": 1
          },
          "replayFields": {
            "D007CA": "0x000000",
            "D008E0": "0x000000",
            "D02587": "0x000000",
            "D0258A": "0x000000",
            "D0258D": "0x000000",
            "D02590": "0x000000",
            "D02593": "0x000000",
            "D0259A": "0x000000",
            "D0259D": "0x000000",
            "D025A0": "0x000000",
            "D025C5": "0x000000"
          },
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
          "vramPixels": 0,
          "status": "Parsing ROM module...",
          "autoRunText": "AutoRun"
        },
        {
          "label": "browser-after-p5-snapshot-replay",
          "result": null,
          "runtimeMode": "coldboot",
          "lastPc": 0,
          "lastMode": "z80",
          "totalSteps": 588233,
          "cpu": {
            "pc": 6581,
            "sp": 13740158,
            "iy": 13631616,
            "ix": 16777215,
            "f": 68,
            "halted": true,
            "iff1": 0,
            "iff2": 0,
            "mbase": 208,
            "madl": 1
          },
          "replayFields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A866",
            "D02587": "0xD2A8E2",
            "D0258A": "0xD2A8E2",
            "D0258D": "0xD2A8E2",
            "D02590": "0xD3FE81",
            "D02593": "0xD3FE81",
            "D0259A": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D025A0": "0xD2A8A4",
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
          "vramPixels": 0,
          "status": "Parsing ROM module...",
          "autoRunText": "AutoRun"
        },
        {
          "label": "browser-after-p6-event-frame",
          "result": null,
          "runtimeMode": "coldboot",
          "lastPc": 574257,
          "lastMode": "adl",
          "totalSteps": 588233,
          "cpu": {
            "pc": 6581,
            "sp": 13740131,
            "iy": 13631616,
            "ix": 13740128,
            "f": 64,
            "halted": false,
            "iff1": 1,
            "iff2": 1,
            "mbase": 208,
            "madl": 1
          },
          "replayFields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D02587": "0xD2A8E2",
            "D0258A": "0xD2A8E2",
            "D0258D": "0xD2A8E2",
            "D02590": "0xD3FE81",
            "D02593": "0xD3FE81",
            "D0259A": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D025A0": "0xD2A8A4",
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
          "vramPixels": 0,
          "status": "Parsing ROM module...",
          "autoRunText": "AutoRun"
        },
        {
          "label": "browser-after-p6-home-repaint",
          "result": {
            "steps": 49474,
            "termination": "halt",
            "lastPc": 6581,
            "lastMode": "adl"
          },
          "runtimeMode": "coldboot",
          "lastPc": 574257,
          "lastMode": "adl",
          "totalSteps": 588233,
          "cpu": {
            "pc": 6581,
            "sp": 13740134,
            "iy": 13631616,
            "ix": 13740128,
            "f": 84,
            "halted": true,
            "iff1": 0,
            "iff2": 0,
            "mbase": 208,
            "madl": 1
          },
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
              "D0243D": 13805589,
              "D02A40": 0,
              "D02A28": 0
            }
          },
          "vramPixels": 8549,
          "status": "Parsing ROM module...",
          "autoRunText": "AutoRun"
        }
      ],
      "routeRecords": [],
      "phaseStats": {
        "browser-p5-launch-home": {
          "label": "browser-p5-launch-home",
          "totalBlocks": 275843,
          "targetCounts": {
            "launch09dd62": 1,
            "memInit09dee0": 1,
            "clear001879": 2,
            "cleanup0018f8": 2,
            "repaint058241": 0,
            "vatLoop084711": 65,
            "vatRewind082be2": 573,
            "halt0019b5": 1,
            "getCsc03fa09": 0,
            "loop08c331": 0,
            "cxMain0585e9": 0,
            "keyHandler05877a": 0,
            "outer08f3b8": 0,
            "tokenReader090883": 1,
            "tokenExit08f5e1": 1,
            "tokenGate090992": 4,
            "tokenStore09098e": 1,
            "eolTuple08f54b": 0,
            "displaySeed013d11": 1,
            "displayLoop0059c6": 300,
            "lowBranch0013fc": 1,
            "low006d38": 10080,
            "low006d4f": 10080,
            "low006d5d": 10088
          },
          "firstBlocks": [
            "0x09DD62",
            "0x09DEE0",
            "0x08A98F",
            "0x08A999",
            "0x07F976",
            "0x09DF0C",
            "0x09DF12",
            "0x000600",
            "0x0138EC",
            "0x09DF18",
            "0x09DF29",
            "0x04C9EA",
            "0x04C8B4",
            "0x04C9EE",
            "0x04C9F4",
            "0x04C896",
            "0x04C9F8",
            "0x09DF2E",
            "0x09DD66",
            "0x0003D4",
            "0x003CC2",
            "0x003CD4",
            "0x003CE0",
            "0x003CEE",
            "0x003CF3",
            "0x09DD7F",
            "0x09DD81",
            "0x09DD8D",
            "0x027F96",
            "0x027FAD",
            "0x027FBC",
            "0x03D202"
          ],
          "lastBlocks": [
            "0x0060B3",
            "0x0060B3",
            "0x0060B3",
            "0x0060B3",
            "0x0060B3",
            "0x0060B3",
            "0x0060B3",
            "0x0060B3",
            "0x0060B3",
            "0x0060B3",
            "0x0060B3",
            "0x0060B3",
            "0x0060B3",
            "0x0060B3",
            "0x0060B3",
            "0x0060B3",
            "0x0060B3",
            "0x0060B3",
            "0x0060B3",
            "0x0060B3",
            "0x0060B3",
            "0x0060B3",
            "0x0060B3",
            "0x0060B3",
            "0x0060B3",
            "0x0060B3",
            "0x0060B3",
            "0x0060B3",
            "0x0060B3",
            "0x0060B3",
            "0x0060B3",
            "0x0060B5",
            "0x0060C7",
            "0x0060D8",
            "0x0060E5",
            "0x0060EA",
            "0x0060F6",
            "0x00190F",
            "0x000862",
            "0x0019B5"
          ],
          "hotBlocks": [
            {
              "pc": "0x09EFDE",
              "count": 33600
            },
            {
              "pc": "0x000A92",
              "count": 32512
            },
            {
              "pc": "0x000BFE",
              "count": 32258
            },
            {
              "pc": "0x0021C2",
              "count": 10090
            },
            {
              "pc": "0x006D5D",
              "count": 10088
            },
            {
              "pc": "0x006D64",
              "count": 10088
            },
            {
              "pc": "0x006CDF",
              "count": 10083
            },
            {
              "pc": "0x006D0F",
              "count": 10083
            },
            {
              "pc": "0x006D38",
              "count": 10080
            },
            {
              "pc": "0x006D4F",
              "count": 10080
            },
            {
              "pc": "0x006CF7",
              "count": 10078
            },
            {
              "pc": "0x005AE8",
              "count": 4800
            },
            {
              "pc": "0x005B16",
              "count": 4800
            },
            {
              "pc": "0x005B4B",
              "count": 4800
            },
            {
              "pc": "0x005AB6",
              "count": 4500
            },
            {
              "pc": "0x000B72",
              "count": 3855
            },
            {
              "pc": "0x000B7C",
              "count": 3085
            },
            {
              "pc": "0x000B81",
              "count": 3085
            },
            {
              "pc": "0x0825D9",
              "count": 1200
            },
            {
              "pc": "0x07CB22",
              "count": 1183
            }
          ]
        },
        "browser-p6-home-repaint": {
          "label": "browser-p6-home-repaint",
          "totalBlocks": 49398,
          "targetCounts": {
            "launch09dd62": 0,
            "memInit09dee0": 0,
            "clear001879": 0,
            "cleanup0018f8": 0,
            "repaint058241": 1,
            "vatLoop084711": 34,
            "vatRewind082be2": 65,
            "halt0019b5": 1,
            "getCsc03fa09": 0,
            "loop08c331": 0,
            "cxMain0585e9": 0,
            "keyHandler05877a": 0,
            "outer08f3b8": 0,
            "tokenReader090883": 0,
            "tokenExit08f5e1": 0,
            "tokenGate090992": 0,
            "tokenStore09098e": 0,
            "eolTuple08f54b": 0,
            "displaySeed013d11": 0,
            "displayLoop0059c6": 0,
            "lowBranch0013fc": 0,
            "low006d38": 0,
            "low006d4f": 0,
            "low006d5d": 0
          },
          "firstBlocks": [
            "0x058241",
            "0x058257",
            "0x058258",
            "0x058262",
            "0x0800C2",
            "0x058272",
            "0x058BA3",
            "0x058276",
            "0x058222",
            "0x08C782",
            "0x05822A",
            "0x058282",
            "0x05828A",
            "0x05828F",
            "0x05829B",
            "0x0582A0",
            "0x09DCAA",
            "0x0582AC",
            "0x083623",
            "0x0582B0",
            "0x083764",
            "0x08376D",
            "0x07F8A2",
            "0x07F8C8",
            "0x07F974",
            "0x083771",
            "0x07FACF",
            "0x07FADF",
            "0x07FA7F",
            "0x07FA86",
            "0x083775",
            "0x061DEF"
          ],
          "lastBlocks": [
            "0x080087",
            "0x08008A",
            "0x080090",
            "0x0827A5",
            "0x08277C",
            "0x082784",
            "0x082BE2",
            "0x082788",
            "0x082799",
            "0x082745",
            "0x04C876",
            "0x082750",
            "0x0821B2",
            "0x0821B4",
            "0x0821B7",
            "0x082754",
            "0x082756",
            "0x082772",
            "0x08279E",
            "0x080084",
            "0x080087",
            "0x08008A",
            "0x080090",
            "0x0827A5",
            "0x08277C",
            "0x082784",
            "0x082BE2",
            "0x082788",
            "0x05E83A",
            "0x05E3A6",
            "0x05E851",
            "0x04C973",
            "0x05E85E",
            "0x05E861",
            "0x05E3AE",
            "0x05E3BB",
            "0x05E803",
            "0x058427",
            "0x058433",
            "0x0019B5"
          ],
          "hotBlocks": [
            {
              "pc": "0x0A28BF",
              "count": 8400
            },
            {
              "pc": "0x0A28B7",
              "count": 8399
            },
            {
              "pc": "0x09EFDE",
              "count": 4872
            },
            {
              "pc": "0x0A2588",
              "count": 2904
            },
            {
              "pc": "0x0A255F",
              "count": 2904
            },
            {
              "pc": "0x0A2563",
              "count": 2261
            },
            {
              "pc": "0x0A257E",
              "count": 2261
            },
            {
              "pc": "0x0A2572",
              "count": 1051
            },
            {
              "pc": "0x0A2548",
              "count": 492
            },
            {
              "pc": "0x0A254F",
              "count": 492
            },
            {
              "pc": "0x0A258B",
              "count": 492
            },
            {
              "pc": "0x0A2695",
              "count": 492
            },
            {
              "pc": "0x001CA6",
              "count": 461
            },
            {
              "pc": "0x001CC0",
              "count": 457
            },
            {
              "pc": "0x001CCA",
              "count": 457
            },
            {
              "pc": "0x0A2555",
              "count": 408
            },
            {
              "pc": "0x0A2585",
              "count": 408
            },
            {
              "pc": "0x0A269A",
              "count": 408
            },
            {
              "pc": "0x0A26B4",
              "count": 408
            },
            {
              "pc": "0x001C33",
              "count": 385
            }
          ]
        }
      },
      "snapshot": {
        "block": 84130,
        "pc": "0x001879",
        "fields": [
          {
            "name": "D007CA",
            "addr": 13633482,
            "len": 3,
            "value": 361961,
            "bytes": [
              233,
              133,
              5
            ]
          },
          {
            "name": "D008E0",
            "addr": 13633760,
            "len": 3,
            "value": 13740134,
            "bytes": [
              102,
              168,
              209
            ]
          },
          {
            "name": "D02587",
            "addr": 13641095,
            "len": 3,
            "value": 13805794,
            "bytes": [
              226,
              168,
              210
            ]
          },
          {
            "name": "D0258A",
            "addr": 13641098,
            "len": 3,
            "value": 13805794,
            "bytes": [
              226,
              168,
              210
            ]
          },
          {
            "name": "D0258D",
            "addr": 13641101,
            "len": 3,
            "value": 13805794,
            "bytes": [
              226,
              168,
              210
            ]
          },
          {
            "name": "D02590",
            "addr": 13641104,
            "len": 3,
            "value": 13893249,
            "bytes": [
              129,
              254,
              211
            ]
          },
          {
            "name": "D02593",
            "addr": 13641107,
            "len": 3,
            "value": 13893249,
            "bytes": [
              129,
              254,
              211
            ]
          },
          {
            "name": "D0259A",
            "addr": 13641114,
            "len": 3,
            "value": 13893249,
            "bytes": [
              129,
              254,
              211
            ]
          },
          {
            "name": "D0259D",
            "addr": 13641117,
            "len": 3,
            "value": 13893325,
            "bytes": [
              205,
              254,
              211
            ]
          },
          {
            "name": "D025A0",
            "addr": 13641120,
            "len": 3,
            "value": 13805732,
            "bytes": [
              164,
              168,
              210
            ]
          },
          {
            "name": "D025C5",
            "addr": 13641157,
            "len": 3,
            "value": 786432,
            "bytes": [
              0,
              0,
              12
            ]
          }
        ],
        "fieldsObject": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A866",
          "D02587": "0xD2A8E2",
          "D0258A": "0xD2A8E2",
          "D0258D": "0xD2A8E2",
          "D02590": "0xD3FE81",
          "D02593": "0xD3FE81",
          "D0259A": "0xD3FE81",
          "D0259D": "0xD3FECD",
          "D025A0": "0xD2A8A4",
          "D025C5": "0x0C0000"
        },
        "vramPixels": 0
      },
      "restore": {
        "label": "browser-before-p6-replay",
        "ok": true,
        "before": {
          "label": "browser-before-p6-replay-before",
          "result": null,
          "runtimeMode": "coldboot",
          "lastPc": 0,
          "lastMode": "z80",
          "totalSteps": 588233,
          "cpu": {
            "pc": 6581,
            "sp": 13740158,
            "iy": 13631616,
            "ix": 16777215,
            "f": 68,
            "halted": true,
            "iff1": 0,
            "iff2": 0,
            "mbase": 208,
            "madl": 1
          },
          "replayFields": {
            "D007CA": "0x000000",
            "D008E0": "0x000000",
            "D02587": "0x000000",
            "D0258A": "0x000000",
            "D0258D": "0x000000",
            "D02590": "0x000000",
            "D02593": "0x000000",
            "D0259A": "0x000000",
            "D0259D": "0x000000",
            "D025A0": "0x000000",
            "D025C5": "0x000000"
          },
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
          "vramPixels": 0,
          "status": "Parsing ROM module...",
          "autoRunText": "AutoRun"
        },
        "after": {
          "label": "browser-before-p6-replay-after",
          "result": null,
          "runtimeMode": "coldboot",
          "lastPc": 0,
          "lastMode": "z80",
          "totalSteps": 588233,
          "cpu": {
            "pc": 6581,
            "sp": 13740158,
            "iy": 13631616,
            "ix": 16777215,
            "f": 68,
            "halted": true,
            "iff1": 0,
            "iff2": 0,
            "mbase": 208,
            "madl": 1
          },
          "replayFields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A866",
            "D02587": "0xD2A8E2",
            "D0258A": "0xD2A8E2",
            "D0258D": "0xD2A8E2",
            "D02590": "0xD3FE81",
            "D02593": "0xD3FE81",
            "D0259A": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D025A0": "0xD2A8A4",
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
          "vramPixels": 0,
          "status": "Parsing ROM module...",
          "autoRunText": "AutoRun"
        }
      },
      "currentRoute": null,
      "read": {},
      "beginRoute": {},
      "finishRoute": {}
    },
    "logTail": [
      "Click Boot to load ROM (~15 MB compressed)",
      "--- Decoding ROM (145932 blocks, 17.0149% coverage) ---",
      "--- Coldboot Phase 1: Z80 cold boot (0x000000, 20K steps) ---",
      "--- Phase 1 done: 20000 steps, max_steps at 0x001cc0 ---",
      "--- Coldboot Phase 2: Kernel init (0x08C331, 100K steps) ---",
      "--- Phase 2 done: 100000 steps, max_steps at 0x000a92 ---",
      "--- Coldboot Phase 3: Post-init (0x0802B2, 100 steps) ---",
      "--- Phase 3 done: 100 steps, max_steps at 0x0158bc ---",
      "--- Coldboot Phase 4: Warm idle continuation (0x0019be, 1.5M step cap) ---",
      "--- Phase 4 done: 192290 steps, halt at 0x0019b5 ---",
      "--- Coldboot Phase 5: Launch-home init (0x09dd62, 300K step cap) ---",
      "--- Phase 5 done: 275843 steps, halt at 0x0019b5 ---",
      "--- Coldboot Phase 6: Home repaint (0x058241, 300K step cap) ---",
      "--- Phase 6 done: 49474 steps, halt at 0x0019b5; D007CA=0x0585e9, VAT=0xd3fe81, VRAM=8549px ---",
      "--- Coldboot seeded (entry=0x08c331, halt=0x0019b5, SP=0xd1a866, IY=0xD00080, timerInterrupt=true) ---"
    ]
  },
  "afterEol": {
    "status": "Key: CLEAR → 350000 steps (peak 3353px)",
    "bootDisabled": true,
    "preserve": true,
    "autoRunText": "AutoRun",
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
    "vramPixels": 3039,
    "errors": [],
    "phase656": {
      "records": [
        {
          "label": "browser-before-p5-launch-home",
          "result": null,
          "runtimeMode": "coldboot",
          "lastPc": 0,
          "lastMode": "z80",
          "totalSteps": 312390,
          "cpu": {
            "pc": 6581,
            "sp": 13740134,
            "iy": 13631616,
            "ix": 16777215,
            "f": 68,
            "halted": false,
            "iff1": 1,
            "iff2": 1,
            "mbase": 208,
            "madl": 1
          },
          "replayFields": {
            "D007CA": "0x000000",
            "D008E0": "0xD1A866",
            "D02587": "0x000000",
            "D0258A": "0x000000",
            "D0258D": "0x000000",
            "D02590": "0x000000",
            "D02593": "0x000000",
            "D0259A": "0x000000",
            "D0259D": "0x000000",
            "D025A0": "0x000000",
            "D025C5": "0x000000"
          },
          "routeFields": {
            "D00587": 0,
            "D0058C": 0,
            "D0058D": 0,
            "D0058E": 0,
            "D00080": 0,
            "D0009F": 0,
            "D007CA": 0,
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
            "VAT_D02590": 0,
            "VAT_D0259D": 0
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
          "vramPixels": 0,
          "status": "Parsing ROM module...",
          "autoRunText": "AutoRun"
        },
        {
          "label": "browser-after-p5-launch-home",
          "result": {
            "steps": 275843,
            "termination": "halt",
            "lastPc": 6581,
            "lastMode": "adl"
          },
          "runtimeMode": "coldboot",
          "lastPc": 0,
          "lastMode": "z80",
          "totalSteps": 312390,
          "cpu": {
            "pc": 6581,
            "sp": 13740158,
            "iy": 13631616,
            "ix": 16777215,
            "f": 68,
            "halted": true,
            "iff1": 0,
            "iff2": 0,
            "mbase": 208,
            "madl": 1
          },
          "replayFields": {
            "D007CA": "0x000000",
            "D008E0": "0x000000",
            "D02587": "0x000000",
            "D0258A": "0x000000",
            "D0258D": "0x000000",
            "D02590": "0x000000",
            "D02593": "0x000000",
            "D0259A": "0x000000",
            "D0259D": "0x000000",
            "D025A0": "0x000000",
            "D025C5": "0x000000"
          },
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
          "vramPixels": 0,
          "status": "Parsing ROM module...",
          "autoRunText": "AutoRun"
        },
        {
          "label": "browser-after-p5-snapshot-replay",
          "result": null,
          "runtimeMode": "coldboot",
          "lastPc": 0,
          "lastMode": "z80",
          "totalSteps": 588233,
          "cpu": {
            "pc": 6581,
            "sp": 13740158,
            "iy": 13631616,
            "ix": 16777215,
            "f": 68,
            "halted": true,
            "iff1": 0,
            "iff2": 0,
            "mbase": 208,
            "madl": 1
          },
          "replayFields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A866",
            "D02587": "0xD2A8E2",
            "D0258A": "0xD2A8E2",
            "D0258D": "0xD2A8E2",
            "D02590": "0xD3FE81",
            "D02593": "0xD3FE81",
            "D0259A": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D025A0": "0xD2A8A4",
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
          "vramPixels": 0,
          "status": "Parsing ROM module...",
          "autoRunText": "AutoRun"
        },
        {
          "label": "browser-after-p6-event-frame",
          "result": null,
          "runtimeMode": "coldboot",
          "lastPc": 574257,
          "lastMode": "adl",
          "totalSteps": 588233,
          "cpu": {
            "pc": 6581,
            "sp": 13740131,
            "iy": 13631616,
            "ix": 13740128,
            "f": 64,
            "halted": false,
            "iff1": 1,
            "iff2": 1,
            "mbase": 208,
            "madl": 1
          },
          "replayFields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D02587": "0xD2A8E2",
            "D0258A": "0xD2A8E2",
            "D0258D": "0xD2A8E2",
            "D02590": "0xD3FE81",
            "D02593": "0xD3FE81",
            "D0259A": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D025A0": "0xD2A8A4",
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
          "vramPixels": 0,
          "status": "Parsing ROM module...",
          "autoRunText": "AutoRun"
        },
        {
          "label": "browser-after-p6-home-repaint",
          "result": {
            "steps": 49474,
            "termination": "halt",
            "lastPc": 6581,
            "lastMode": "adl"
          },
          "runtimeMode": "coldboot",
          "lastPc": 574257,
          "lastMode": "adl",
          "totalSteps": 588233,
          "cpu": {
            "pc": 6581,
            "sp": 13740134,
            "iy": 13631616,
            "ix": 13740128,
            "f": 84,
            "halted": true,
            "iff1": 0,
            "iff2": 0,
            "mbase": 208,
            "madl": 1
          },
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
              "D0243D": 13805589,
              "D02A40": 0,
              "D02A28": 0
            }
          },
          "vramPixels": 8549,
          "status": "Parsing ROM module...",
          "autoRunText": "AutoRun"
        }
      ],
      "routeRecords": [
        {
          "label": "EOL/CLEAR",
          "start": {
            "label": "EOL/CLEAR-start",
            "result": null,
            "runtimeMode": "coldboot",
            "lastPc": 27960,
            "lastMode": "adl",
            "totalSteps": 687707,
            "cpu": {
              "pc": 27919,
              "sp": 13740075,
              "iy": 13631616,
              "ix": 13740081,
              "f": 66,
              "halted": false,
              "iff1": 0,
              "iff2": 0,
              "mbase": 208,
              "madl": 1
            },
            "replayFields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D02587": "0x000000",
              "D0258A": "0x000000",
              "D0258D": "0x000000",
              "D02590": "0x000000",
              "D02593": "0x000000",
              "D0259A": "0x000000",
              "D0259D": "0x000000",
              "D025A0": "0x000000",
              "D025C5": "0x000000"
            },
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
            "vramPixels": 3031,
            "status": "Coldboot: 50000 steps, max_steps | Total: 687707 | PC=0x006d38",
            "autoRunText": "AutoRun"
          },
          "end": {
            "label": "EOL/CLEAR-end",
            "result": null,
            "runtimeMode": "coldboot",
            "lastPc": 3070,
            "lastMode": "adl",
            "totalSteps": 1037707,
            "cpu": {
              "pc": 3070,
              "sp": 13738940,
              "iy": 13631616,
              "ix": 13738985,
              "f": 40,
              "halted": false,
              "iff1": 0,
              "iff2": 0,
              "mbase": 208,
              "madl": 1
            },
            "replayFields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D02587": "0x000000",
              "D0258A": "0x000000",
              "D0258D": "0x000000",
              "D02590": "0x000000",
              "D02593": "0x000000",
              "D0259A": "0x000000",
              "D0259D": "0x000000",
              "D025A0": "0x000000",
              "D025C5": "0x000000"
            },
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
            "vramPixels": 3039,
            "status": "Key: CLEAR → 350000 steps (peak 3353px)",
            "autoRunText": "AutoRun"
          },
          "totalBlocks": 349982,
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
            "0x001A32",
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
            "0x001A17",
            "0x001A23",
            "0x001A2D",
            "0x001A32",
            "0x05C634",
            "0x05C67C",
            "0x08C339",
            "0x06CE73",
            "0x06CE7F",
            "0x06CE7B",
            "0x06C8AB",
            "0x08C33D",
            "0x0A349A",
            "0x0A349F",
            "0x0A32F9",
            "0x0A3301",
            "0x08C308",
            "0x0A331E",
            "0x0A336F",
            "0x0A3383",
            "0x0A338A",
            "0x0A33FB",
            "0x0A3408",
            "0x0A3404",
            "0x0A3408",
            "0x0A3404",
            "0x0A3408",
            "0x0A3404",
            "0x0A3408",
            "0x0A3404",
            "0x0A3408",
            "0x0A340F",
            "0x0A3392",
            "0x0A33FB",
            "0x0A3408"
          ],
          "lastBlocks": [
            "0x000BFE",
            "0x000BFE",
            "0x000BFE",
            "0x000BFE",
            "0x000BFE",
            "0x000BFE",
            "0x000BFE",
            "0x000BFE",
            "0x000BFE",
            "0x000BFE",
            "0x000C4A",
            "0x000C80",
            "0x000B37",
            "0x000B60",
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
            "0x000B81",
            "0x000B72",
            "0x000B7C",
            "0x000B81",
            "0x000B72",
            "0x000B7C",
            "0x000B81",
            "0x000B72",
            "0x000B7F",
            "0x000B72",
            "0x000B7F",
            "0x000B72",
            "0x000B7C",
            "0x000B81",
            "0x000B72",
            "0x000B7F",
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
            },
            {
              "pc": "0x005B4B",
              "count": 6224
            },
            {
              "pc": "0x000B72",
              "count": 6195
            },
            {
              "pc": "0x005AB6",
              "count": 5835
            },
            {
              "pc": "0x000B7C",
              "count": 4967
            },
            {
              "pc": "0x000B81",
              "count": 4967
            },
            {
              "pc": "0x000B7F",
              "count": 1641
            },
            {
              "pc": "0x000AC5",
              "count": 768
            },
            {
              "pc": "0x0060B3",
              "count": 765
            },
            {
              "pc": "0x000AEE",
              "count": 762
            },
            {
              "pc": "0x000A79",
              "count": 762
            },
            {
              "pc": "0x006129",
              "count": 519
            },
            {
              "pc": "0x00612E",
              "count": 519
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
            },
            {
              "block": 13404,
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
              "block": 13410,
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
              "block": 13411,
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
              "block": 13412,
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
              "block": 13418,
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
              "block": 13419,
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
              "block": 194208,
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
              "runtime": {
                "lastPc": 574257,
                "lastMode": "adl",
                "totalSteps": 687707
              }
            },
            {
              "block": 194209,
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
              "block": 195793,
              "pc": "0x0019B5",
              "target": "halt0019b5",
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
              "block": 195794,
              "pc": "0x08C331",
              "target": "loop08c331",
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
              "block": 196854,
              "pc": "0x03FA09",
              "target": "getCsc03fa09",
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
              "block": 198501,
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
              "runtime": {
                "lastPc": 574257,
                "lastMode": "adl",
                "totalSteps": 687707
              }
            },
            {
              "block": 198502,
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
              "block": 200150,
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
              "block": 200166,
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
            }
          ],
          "targetSampleLimits": {
            "loop08c331": 2,
            "cxMain0585e9": 1,
            "keyHandler05877a": 1,
            "getCsc03fa09": 2,
            "clear001879": 3,
            "cleanup0018f8": 3,
            "lowBranch0013fc": 2,
            "displaySeed013d11": 2,
            "displayLoop0059c6": 4,
            "low006d5d": 4,
            "low006d38": 4,
            "low006d4f": 4,
            "halt0019b5": 1
          },
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
                "D007CA": [
                  0,
                  361961
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
                "D0243D": 0,
                "D02A40": 0,
                "VAT_D02590": 0,
                "VAT_D0259D": 0
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
                "VAT_D02590": 0,
                "VAT_D0259D": 0
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
                "VAT_D02590": 0,
                "VAT_D0259D": 0
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
                "VAT_D02590": 0,
                "VAT_D0259D": 0
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
                "VAT_D02590": 0,
                "VAT_D0259D": 0
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
                "VAT_D02590": 0,
                "VAT_D0259D": 0
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
                "VAT_D02590": 0,
                "VAT_D0259D": 0
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
                "VAT_D02590": 0,
                "VAT_D0259D": 0
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
          ],
          "lastFields": {
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
      "phaseStats": {
        "browser-p5-launch-home": {
          "label": "browser-p5-launch-home",
          "totalBlocks": 275843,
          "targetCounts": {
            "launch09dd62": 1,
            "memInit09dee0": 1,
            "clear001879": 2,
            "cleanup0018f8": 2,
            "repaint058241": 0,
            "vatLoop084711": 65,
            "vatRewind082be2": 573,
            "halt0019b5": 1,
            "getCsc03fa09": 0,
            "loop08c331": 0,
            "cxMain0585e9": 0,
            "keyHandler05877a": 0,
            "outer08f3b8": 0,
            "tokenReader090883": 1,
            "tokenExit08f5e1": 1,
            "tokenGate090992": 4,
            "tokenStore09098e": 1,
            "eolTuple08f54b": 0,
            "displaySeed013d11": 1,
            "displayLoop0059c6": 300,
            "lowBranch0013fc": 1,
            "low006d38": 10080,
            "low006d4f": 10080,
            "low006d5d": 10088
          },
          "firstBlocks": [
            "0x09DD62",
            "0x09DEE0",
            "0x08A98F",
            "0x08A999",
            "0x07F976",
            "0x09DF0C",
            "0x09DF12",
            "0x000600",
            "0x0138EC",
            "0x09DF18",
            "0x09DF29",
            "0x04C9EA",
            "0x04C8B4",
            "0x04C9EE",
            "0x04C9F4",
            "0x04C896",
            "0x04C9F8",
            "0x09DF2E",
            "0x09DD66",
            "0x0003D4",
            "0x003CC2",
            "0x003CD4",
            "0x003CE0",
            "0x003CEE",
            "0x003CF3",
            "0x09DD7F",
            "0x09DD81",
            "0x09DD8D",
            "0x027F96",
            "0x027FAD",
            "0x027FBC",
            "0x03D202"
          ],
          "lastBlocks": [
            "0x0060B3",
            "0x0060B3",
            "0x0060B3",
            "0x0060B3",
            "0x0060B3",
            "0x0060B3",
            "0x0060B3",
            "0x0060B3",
            "0x0060B3",
            "0x0060B3",
            "0x0060B3",
            "0x0060B3",
            "0x0060B3",
            "0x0060B3",
            "0x0060B3",
            "0x0060B3",
            "0x0060B3",
            "0x0060B3",
            "0x0060B3",
            "0x0060B3",
            "0x0060B3",
            "0x0060B3",
            "0x0060B3",
            "0x0060B3",
            "0x0060B3",
            "0x0060B3",
            "0x0060B3",
            "0x0060B3",
            "0x0060B3",
            "0x0060B3",
            "0x0060B3",
            "0x0060B5",
            "0x0060C7",
            "0x0060D8",
            "0x0060E5",
            "0x0060EA",
            "0x0060F6",
            "0x00190F",
            "0x000862",
            "0x0019B5"
          ],
          "hotBlocks": [
            {
              "pc": "0x09EFDE",
              "count": 33600
            },
            {
              "pc": "0x000A92",
              "count": 32512
            },
            {
              "pc": "0x000BFE",
              "count": 32258
            },
            {
              "pc": "0x0021C2",
              "count": 10090
            },
            {
              "pc": "0x006D5D",
              "count": 10088
            },
            {
              "pc": "0x006D64",
              "count": 10088
            },
            {
              "pc": "0x006CDF",
              "count": 10083
            },
            {
              "pc": "0x006D0F",
              "count": 10083
            },
            {
              "pc": "0x006D38",
              "count": 10080
            },
            {
              "pc": "0x006D4F",
              "count": 10080
            },
            {
              "pc": "0x006CF7",
              "count": 10078
            },
            {
              "pc": "0x005AE8",
              "count": 4800
            },
            {
              "pc": "0x005B16",
              "count": 4800
            },
            {
              "pc": "0x005B4B",
              "count": 4800
            },
            {
              "pc": "0x005AB6",
              "count": 4500
            },
            {
              "pc": "0x000B72",
              "count": 3855
            },
            {
              "pc": "0x000B7C",
              "count": 3085
            },
            {
              "pc": "0x000B81",
              "count": 3085
            },
            {
              "pc": "0x0825D9",
              "count": 1200
            },
            {
              "pc": "0x07CB22",
              "count": 1183
            }
          ]
        },
        "browser-p6-home-repaint": {
          "label": "browser-p6-home-repaint",
          "totalBlocks": 49398,
          "targetCounts": {
            "launch09dd62": 0,
            "memInit09dee0": 0,
            "clear001879": 0,
            "cleanup0018f8": 0,
            "repaint058241": 1,
            "vatLoop084711": 34,
            "vatRewind082be2": 65,
            "halt0019b5": 1,
            "getCsc03fa09": 0,
            "loop08c331": 0,
            "cxMain0585e9": 0,
            "keyHandler05877a": 0,
            "outer08f3b8": 0,
            "tokenReader090883": 0,
            "tokenExit08f5e1": 0,
            "tokenGate090992": 0,
            "tokenStore09098e": 0,
            "eolTuple08f54b": 0,
            "displaySeed013d11": 0,
            "displayLoop0059c6": 0,
            "lowBranch0013fc": 0,
            "low006d38": 0,
            "low006d4f": 0,
            "low006d5d": 0
          },
          "firstBlocks": [
            "0x058241",
            "0x058257",
            "0x058258",
            "0x058262",
            "0x0800C2",
            "0x058272",
            "0x058BA3",
            "0x058276",
            "0x058222",
            "0x08C782",
            "0x05822A",
            "0x058282",
            "0x05828A",
            "0x05828F",
            "0x05829B",
            "0x0582A0",
            "0x09DCAA",
            "0x0582AC",
            "0x083623",
            "0x0582B0",
            "0x083764",
            "0x08376D",
            "0x07F8A2",
            "0x07F8C8",
            "0x07F974",
            "0x083771",
            "0x07FACF",
            "0x07FADF",
            "0x07FA7F",
            "0x07FA86",
            "0x083775",
            "0x061DEF"
          ],
          "lastBlocks": [
            "0x080087",
            "0x08008A",
            "0x080090",
            "0x0827A5",
            "0x08277C",
            "0x082784",
            "0x082BE2",
            "0x082788",
            "0x082799",
            "0x082745",
            "0x04C876",
            "0x082750",
            "0x0821B2",
            "0x0821B4",
            "0x0821B7",
            "0x082754",
            "0x082756",
            "0x082772",
            "0x08279E",
            "0x080084",
            "0x080087",
            "0x08008A",
            "0x080090",
            "0x0827A5",
            "0x08277C",
            "0x082784",
            "0x082BE2",
            "0x082788",
            "0x05E83A",
            "0x05E3A6",
            "0x05E851",
            "0x04C973",
            "0x05E85E",
            "0x05E861",
            "0x05E3AE",
            "0x05E3BB",
            "0x05E803",
            "0x058427",
            "0x058433",
            "0x0019B5"
          ],
          "hotBlocks": [
            {
              "pc": "0x0A28BF",
              "count": 8400
            },
            {
              "pc": "0x0A28B7",
              "count": 8399
            },
            {
              "pc": "0x09EFDE",
              "count": 4872
            },
            {
              "pc": "0x0A2588",
              "count": 2904
            },
            {
              "pc": "0x0A255F",
              "count": 2904
            },
            {
              "pc": "0x0A2563",
              "count": 2261
            },
            {
              "pc": "0x0A257E",
              "count": 2261
            },
            {
              "pc": "0x0A2572",
              "count": 1051
            },
            {
              "pc": "0x0A2548",
              "count": 492
            },
            {
              "pc": "0x0A254F",
              "count": 492
            },
            {
              "pc": "0x0A258B",
              "count": 492
            },
            {
              "pc": "0x0A2695",
              "count": 492
            },
            {
              "pc": "0x001CA6",
              "count": 461
            },
            {
              "pc": "0x001CC0",
              "count": 457
            },
            {
              "pc": "0x001CCA",
              "count": 457
            },
            {
              "pc": "0x0A2555",
              "count": 408
            },
            {
              "pc": "0x0A2585",
              "count": 408
            },
            {
              "pc": "0x0A269A",
              "count": 408
            },
            {
              "pc": "0x0A26B4",
              "count": 408
            },
            {
              "pc": "0x001C33",
              "count": 385
            }
          ]
        }
      },
      "snapshot": {
        "block": 84130,
        "pc": "0x001879",
        "fields": [
          {
            "name": "D007CA",
            "addr": 13633482,
            "len": 3,
            "value": 361961,
            "bytes": [
              233,
              133,
              5
            ]
          },
          {
            "name": "D008E0",
            "addr": 13633760,
            "len": 3,
            "value": 13740134,
            "bytes": [
              102,
              168,
              209
            ]
          },
          {
            "name": "D02587",
            "addr": 13641095,
            "len": 3,
            "value": 13805794,
            "bytes": [
              226,
              168,
              210
            ]
          },
          {
            "name": "D0258A",
            "addr": 13641098,
            "len": 3,
            "value": 13805794,
            "bytes": [
              226,
              168,
              210
            ]
          },
          {
            "name": "D0258D",
            "addr": 13641101,
            "len": 3,
            "value": 13805794,
            "bytes": [
              226,
              168,
              210
            ]
          },
          {
            "name": "D02590",
            "addr": 13641104,
            "len": 3,
            "value": 13893249,
            "bytes": [
              129,
              254,
              211
            ]
          },
          {
            "name": "D02593",
            "addr": 13641107,
            "len": 3,
            "value": 13893249,
            "bytes": [
              129,
              254,
              211
            ]
          },
          {
            "name": "D0259A",
            "addr": 13641114,
            "len": 3,
            "value": 13893249,
            "bytes": [
              129,
              254,
              211
            ]
          },
          {
            "name": "D0259D",
            "addr": 13641117,
            "len": 3,
            "value": 13893325,
            "bytes": [
              205,
              254,
              211
            ]
          },
          {
            "name": "D025A0",
            "addr": 13641120,
            "len": 3,
            "value": 13805732,
            "bytes": [
              164,
              168,
              210
            ]
          },
          {
            "name": "D025C5",
            "addr": 13641157,
            "len": 3,
            "value": 786432,
            "bytes": [
              0,
              0,
              12
            ]
          }
        ],
        "fieldsObject": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A866",
          "D02587": "0xD2A8E2",
          "D0258A": "0xD2A8E2",
          "D0258D": "0xD2A8E2",
          "D02590": "0xD3FE81",
          "D02593": "0xD3FE81",
          "D0259A": "0xD3FE81",
          "D0259D": "0xD3FECD",
          "D025A0": "0xD2A8A4",
          "D025C5": "0x0C0000"
        },
        "vramPixels": 0
      },
      "restore": {
        "label": "browser-before-p6-replay",
        "ok": true,
        "before": {
          "label": "browser-before-p6-replay-before",
          "result": null,
          "runtimeMode": "coldboot",
          "lastPc": 0,
          "lastMode": "z80",
          "totalSteps": 588233,
          "cpu": {
            "pc": 6581,
            "sp": 13740158,
            "iy": 13631616,
            "ix": 16777215,
            "f": 68,
            "halted": true,
            "iff1": 0,
            "iff2": 0,
            "mbase": 208,
            "madl": 1
          },
          "replayFields": {
            "D007CA": "0x000000",
            "D008E0": "0x000000",
            "D02587": "0x000000",
            "D0258A": "0x000000",
            "D0258D": "0x000000",
            "D02590": "0x000000",
            "D02593": "0x000000",
            "D0259A": "0x000000",
            "D0259D": "0x000000",
            "D025A0": "0x000000",
            "D025C5": "0x000000"
          },
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
          "vramPixels": 0,
          "status": "Parsing ROM module...",
          "autoRunText": "AutoRun"
        },
        "after": {
          "label": "browser-before-p6-replay-after",
          "result": null,
          "runtimeMode": "coldboot",
          "lastPc": 0,
          "lastMode": "z80",
          "totalSteps": 588233,
          "cpu": {
            "pc": 6581,
            "sp": 13740158,
            "iy": 13631616,
            "ix": 16777215,
            "f": 68,
            "halted": true,
            "iff1": 0,
            "iff2": 0,
            "mbase": 208,
            "madl": 1
          },
          "replayFields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A866",
            "D02587": "0xD2A8E2",
            "D0258A": "0xD2A8E2",
            "D0258D": "0xD2A8E2",
            "D02590": "0xD3FE81",
            "D02593": "0xD3FE81",
            "D0259A": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D025A0": "0xD2A8A4",
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
          "vramPixels": 0,
          "status": "Parsing ROM module...",
          "autoRunText": "AutoRun"
        }
      },
      "currentRoute": null,
      "read": {},
      "beginRoute": {},
      "finishRoute": {}
    },
    "logTail": [
      "Click Boot to load ROM (~15 MB compressed)",
      "--- Decoding ROM (145932 blocks, 17.0149% coverage) ---",
      "--- Coldboot Phase 1: Z80 cold boot (0x000000, 20K steps) ---",
      "--- Phase 1 done: 20000 steps, max_steps at 0x001cc0 ---",
      "--- Coldboot Phase 2: Kernel init (0x08C331, 100K steps) ---",
      "--- Phase 2 done: 100000 steps, max_steps at 0x000a92 ---",
      "--- Coldboot Phase 3: Post-init (0x0802B2, 100 steps) ---",
      "--- Phase 3 done: 100 steps, max_steps at 0x0158bc ---",
      "--- Coldboot Phase 4: Warm idle continuation (0x0019be, 1.5M step cap) ---",
      "--- Phase 4 done: 192290 steps, halt at 0x0019b5 ---",
      "--- Coldboot Phase 5: Launch-home init (0x09dd62, 300K step cap) ---",
      "--- Phase 5 done: 275843 steps, halt at 0x0019b5 ---",
      "--- Coldboot Phase 6: Home repaint (0x058241, 300K step cap) ---",
      "--- Phase 6 done: 49474 steps, halt at 0x0019b5; D007CA=0x0585e9, VAT=0xd3fe81, VRAM=8549px ---",
      "--- Coldboot seeded (entry=0x08c331, halt=0x0019b5, SP=0xd1a866, IY=0xD00080, timerInterrupt=true) ---"
    ]
  },
  "afterDigit2": {
    "status": "Key: 2 → 300000 steps (peak 3359px)",
    "bootDisabled": true,
    "preserve": true,
    "autoRunText": "AutoRun",
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
    "vramPixels": 3040,
    "errors": [],
    "phase656": {
      "records": [
        {
          "label": "browser-before-p5-launch-home",
          "result": null,
          "runtimeMode": "coldboot",
          "lastPc": 0,
          "lastMode": "z80",
          "totalSteps": 312390,
          "cpu": {
            "pc": 6581,
            "sp": 13740134,
            "iy": 13631616,
            "ix": 16777215,
            "f": 68,
            "halted": false,
            "iff1": 1,
            "iff2": 1,
            "mbase": 208,
            "madl": 1
          },
          "replayFields": {
            "D007CA": "0x000000",
            "D008E0": "0xD1A866",
            "D02587": "0x000000",
            "D0258A": "0x000000",
            "D0258D": "0x000000",
            "D02590": "0x000000",
            "D02593": "0x000000",
            "D0259A": "0x000000",
            "D0259D": "0x000000",
            "D025A0": "0x000000",
            "D025C5": "0x000000"
          },
          "routeFields": {
            "D00587": 0,
            "D0058C": 0,
            "D0058D": 0,
            "D0058E": 0,
            "D00080": 0,
            "D0009F": 0,
            "D007CA": 0,
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
            "VAT_D02590": 0,
            "VAT_D0259D": 0
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
          "vramPixels": 0,
          "status": "Parsing ROM module...",
          "autoRunText": "AutoRun"
        },
        {
          "label": "browser-after-p5-launch-home",
          "result": {
            "steps": 275843,
            "termination": "halt",
            "lastPc": 6581,
            "lastMode": "adl"
          },
          "runtimeMode": "coldboot",
          "lastPc": 0,
          "lastMode": "z80",
          "totalSteps": 312390,
          "cpu": {
            "pc": 6581,
            "sp": 13740158,
            "iy": 13631616,
            "ix": 16777215,
            "f": 68,
            "halted": true,
            "iff1": 0,
            "iff2": 0,
            "mbase": 208,
            "madl": 1
          },
          "replayFields": {
            "D007CA": "0x000000",
            "D008E0": "0x000000",
            "D02587": "0x000000",
            "D0258A": "0x000000",
            "D0258D": "0x000000",
            "D02590": "0x000000",
            "D02593": "0x000000",
            "D0259A": "0x000000",
            "D0259D": "0x000000",
            "D025A0": "0x000000",
            "D025C5": "0x000000"
          },
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
          "vramPixels": 0,
          "status": "Parsing ROM module...",
          "autoRunText": "AutoRun"
        },
        {
          "label": "browser-after-p5-snapshot-replay",
          "result": null,
          "runtimeMode": "coldboot",
          "lastPc": 0,
          "lastMode": "z80",
          "totalSteps": 588233,
          "cpu": {
            "pc": 6581,
            "sp": 13740158,
            "iy": 13631616,
            "ix": 16777215,
            "f": 68,
            "halted": true,
            "iff1": 0,
            "iff2": 0,
            "mbase": 208,
            "madl": 1
          },
          "replayFields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A866",
            "D02587": "0xD2A8E2",
            "D0258A": "0xD2A8E2",
            "D0258D": "0xD2A8E2",
            "D02590": "0xD3FE81",
            "D02593": "0xD3FE81",
            "D0259A": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D025A0": "0xD2A8A4",
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
          "vramPixels": 0,
          "status": "Parsing ROM module...",
          "autoRunText": "AutoRun"
        },
        {
          "label": "browser-after-p6-event-frame",
          "result": null,
          "runtimeMode": "coldboot",
          "lastPc": 574257,
          "lastMode": "adl",
          "totalSteps": 588233,
          "cpu": {
            "pc": 6581,
            "sp": 13740131,
            "iy": 13631616,
            "ix": 13740128,
            "f": 64,
            "halted": false,
            "iff1": 1,
            "iff2": 1,
            "mbase": 208,
            "madl": 1
          },
          "replayFields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D02587": "0xD2A8E2",
            "D0258A": "0xD2A8E2",
            "D0258D": "0xD2A8E2",
            "D02590": "0xD3FE81",
            "D02593": "0xD3FE81",
            "D0259A": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D025A0": "0xD2A8A4",
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
          "vramPixels": 0,
          "status": "Parsing ROM module...",
          "autoRunText": "AutoRun"
        },
        {
          "label": "browser-after-p6-home-repaint",
          "result": {
            "steps": 49474,
            "termination": "halt",
            "lastPc": 6581,
            "lastMode": "adl"
          },
          "runtimeMode": "coldboot",
          "lastPc": 574257,
          "lastMode": "adl",
          "totalSteps": 588233,
          "cpu": {
            "pc": 6581,
            "sp": 13740134,
            "iy": 13631616,
            "ix": 13740128,
            "f": 84,
            "halted": true,
            "iff1": 0,
            "iff2": 0,
            "mbase": 208,
            "madl": 1
          },
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
              "D0243D": 13805589,
              "D02A40": 0,
              "D02A28": 0
            }
          },
          "vramPixels": 8549,
          "status": "Parsing ROM module...",
          "autoRunText": "AutoRun"
        }
      ],
      "routeRecords": [
        {
          "label": "EOL/CLEAR",
          "start": {
            "label": "EOL/CLEAR-start",
            "result": null,
            "runtimeMode": "coldboot",
            "lastPc": 27960,
            "lastMode": "adl",
            "totalSteps": 687707,
            "cpu": {
              "pc": 27919,
              "sp": 13740075,
              "iy": 13631616,
              "ix": 13740081,
              "f": 66,
              "halted": false,
              "iff1": 0,
              "iff2": 0,
              "mbase": 208,
              "madl": 1
            },
            "replayFields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D02587": "0x000000",
              "D0258A": "0x000000",
              "D0258D": "0x000000",
              "D02590": "0x000000",
              "D02593": "0x000000",
              "D0259A": "0x000000",
              "D0259D": "0x000000",
              "D025A0": "0x000000",
              "D025C5": "0x000000"
            },
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
            "vramPixels": 3031,
            "status": "Coldboot: 50000 steps, max_steps | Total: 687707 | PC=0x006d38",
            "autoRunText": "AutoRun"
          },
          "end": {
            "label": "EOL/CLEAR-end",
            "result": null,
            "runtimeMode": "coldboot",
            "lastPc": 3070,
            "lastMode": "adl",
            "totalSteps": 1037707,
            "cpu": {
              "pc": 3070,
              "sp": 13738940,
              "iy": 13631616,
              "ix": 13738985,
              "f": 40,
              "halted": false,
              "iff1": 0,
              "iff2": 0,
              "mbase": 208,
              "madl": 1
            },
            "replayFields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D02587": "0x000000",
              "D0258A": "0x000000",
              "D0258D": "0x000000",
              "D02590": "0x000000",
              "D02593": "0x000000",
              "D0259A": "0x000000",
              "D0259D": "0x000000",
              "D025A0": "0x000000",
              "D025C5": "0x000000"
            },
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
            "vramPixels": 3039,
            "status": "Key: CLEAR → 350000 steps (peak 3353px)",
            "autoRunText": "AutoRun"
          },
          "totalBlocks": 349982,
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
            "0x001A32",
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
            "0x001A17",
            "0x001A23",
            "0x001A2D",
            "0x001A32",
            "0x05C634",
            "0x05C67C",
            "0x08C339",
            "0x06CE73",
            "0x06CE7F",
            "0x06CE7B",
            "0x06C8AB",
            "0x08C33D",
            "0x0A349A",
            "0x0A349F",
            "0x0A32F9",
            "0x0A3301",
            "0x08C308",
            "0x0A331E",
            "0x0A336F",
            "0x0A3383",
            "0x0A338A",
            "0x0A33FB",
            "0x0A3408",
            "0x0A3404",
            "0x0A3408",
            "0x0A3404",
            "0x0A3408",
            "0x0A3404",
            "0x0A3408",
            "0x0A3404",
            "0x0A3408",
            "0x0A340F",
            "0x0A3392",
            "0x0A33FB",
            "0x0A3408"
          ],
          "lastBlocks": [
            "0x000BFE",
            "0x000BFE",
            "0x000BFE",
            "0x000BFE",
            "0x000BFE",
            "0x000BFE",
            "0x000BFE",
            "0x000BFE",
            "0x000BFE",
            "0x000BFE",
            "0x000C4A",
            "0x000C80",
            "0x000B37",
            "0x000B60",
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
            "0x000B81",
            "0x000B72",
            "0x000B7C",
            "0x000B81",
            "0x000B72",
            "0x000B7C",
            "0x000B81",
            "0x000B72",
            "0x000B7F",
            "0x000B72",
            "0x000B7F",
            "0x000B72",
            "0x000B7C",
            "0x000B81",
            "0x000B72",
            "0x000B7F",
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
            },
            {
              "pc": "0x005B4B",
              "count": 6224
            },
            {
              "pc": "0x000B72",
              "count": 6195
            },
            {
              "pc": "0x005AB6",
              "count": 5835
            },
            {
              "pc": "0x000B7C",
              "count": 4967
            },
            {
              "pc": "0x000B81",
              "count": 4967
            },
            {
              "pc": "0x000B7F",
              "count": 1641
            },
            {
              "pc": "0x000AC5",
              "count": 768
            },
            {
              "pc": "0x0060B3",
              "count": 765
            },
            {
              "pc": "0x000AEE",
              "count": 762
            },
            {
              "pc": "0x000A79",
              "count": 762
            },
            {
              "pc": "0x006129",
              "count": 519
            },
            {
              "pc": "0x00612E",
              "count": 519
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
            },
            {
              "block": 13404,
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
              "block": 13410,
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
              "block": 13411,
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
              "block": 13412,
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
              "block": 13418,
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
              "block": 13419,
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
              "block": 194208,
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
              "runtime": {
                "lastPc": 574257,
                "lastMode": "adl",
                "totalSteps": 687707
              }
            },
            {
              "block": 194209,
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
              "block": 195793,
              "pc": "0x0019B5",
              "target": "halt0019b5",
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
              "block": 195794,
              "pc": "0x08C331",
              "target": "loop08c331",
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
              "block": 196854,
              "pc": "0x03FA09",
              "target": "getCsc03fa09",
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
              "block": 198501,
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
              "runtime": {
                "lastPc": 574257,
                "lastMode": "adl",
                "totalSteps": 687707
              }
            },
            {
              "block": 198502,
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
              "block": 200150,
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
              "block": 200166,
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
            }
          ],
          "targetSampleLimits": {
            "loop08c331": 2,
            "cxMain0585e9": 1,
            "keyHandler05877a": 1,
            "getCsc03fa09": 2,
            "clear001879": 3,
            "cleanup0018f8": 3,
            "lowBranch0013fc": 2,
            "displaySeed013d11": 2,
            "displayLoop0059c6": 4,
            "low006d5d": 4,
            "low006d38": 4,
            "low006d4f": 4,
            "halt0019b5": 1
          },
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
                "D007CA": [
                  0,
                  361961
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
                "D0243D": 0,
                "D02A40": 0,
                "VAT_D02590": 0,
                "VAT_D0259D": 0
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
                "VAT_D02590": 0,
                "VAT_D0259D": 0
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
                "VAT_D02590": 0,
                "VAT_D0259D": 0
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
                "VAT_D02590": 0,
                "VAT_D0259D": 0
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
                "VAT_D02590": 0,
                "VAT_D0259D": 0
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
                "VAT_D02590": 0,
                "VAT_D0259D": 0
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
                "VAT_D02590": 0,
                "VAT_D0259D": 0
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
                "VAT_D02590": 0,
                "VAT_D0259D": 0
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
          ],
          "lastFields": {
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
          "label": "Digit2",
          "start": {
            "label": "Digit2-start",
            "result": null,
            "runtimeMode": "coldboot",
            "lastPc": 3070,
            "lastMode": "adl",
            "totalSteps": 1037707,
            "cpu": {
              "pc": 3070,
              "sp": 13738940,
              "iy": 13631616,
              "ix": 13738985,
              "f": 40,
              "halted": false,
              "iff1": 0,
              "iff2": 0,
              "mbase": 208,
              "madl": 1
            },
            "replayFields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D02587": "0x000000",
              "D0258A": "0x000000",
              "D0258D": "0x000000",
              "D02590": "0x000000",
              "D02593": "0x000000",
              "D0259A": "0x000000",
              "D0259D": "0x000000",
              "D025A0": "0x000000",
              "D025C5": "0x000000"
            },
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
            "vramPixels": 3039,
            "status": "Key: CLEAR → 350000 steps (peak 3353px)",
            "autoRunText": "AutoRun"
          },
          "end": {
            "label": "Digit2-end",
            "result": null,
            "runtimeMode": "coldboot",
            "lastPc": 2706,
            "lastMode": "adl",
            "totalSteps": 1337707,
            "cpu": {
              "pc": 2706,
              "sp": 13738940,
              "iy": 13631616,
              "ix": 13738985,
              "f": 34,
              "halted": false,
              "iff1": 0,
              "iff2": 0,
              "mbase": 208,
              "madl": 1
            },
            "replayFields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D02587": "0x000000",
              "D0258A": "0x000000",
              "D0258D": "0x000000",
              "D02590": "0x000000",
              "D02593": "0x000000",
              "D0259A": "0x000000",
              "D0259D": "0x000000",
              "D025A0": "0x000000",
              "D025C5": "0x000000"
            },
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
            "vramPixels": 3040,
            "status": "Key: 2 → 300000 steps (peak 3359px)",
            "autoRunText": "AutoRun"
          },
          "totalBlocks": 299976,
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
            "0x001A32",
            "0x05C634",
            "0x05C67C",
            "0x08C339",
            "0x06CE73",
            "0x06CE7F",
            "0x06CE7B",
            "0x06C8AB",
            "0x08C33D",
            "0x0A349A",
            "0x0A349F",
            "0x0A32F9",
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
            "0x001A32",
            "0x0A3301",
            "0x08C308",
            "0x0A331E",
            "0x0A336F",
            "0x0A3383",
            "0x0A338A",
            "0x0A33FB",
            "0x0A3408",
            "0x0A3404",
            "0x0A3408",
            "0x0A3404",
            "0x0A3408",
            "0x0A3404",
            "0x0A3408",
            "0x0A3404",
            "0x0A3408",
            "0x0A340F",
            "0x0A3392"
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
              "count": 3870
            },
            {
              "pc": "0x000B7C",
              "count": 3101
            },
            {
              "pc": "0x000B81",
              "count": 3101
            },
            {
              "pc": "0x000B7F",
              "count": 1027
            },
            {
              "pc": "0x0060B3",
              "count": 765
            },
            {
              "pc": "0x000AC5",
              "count": 571
            },
            {
              "pc": "0x000AEE",
              "count": 567
            },
            {
              "pc": "0x000A79",
              "count": 567
            },
            {
              "pc": "0x0A18C4",
              "count": 560
            },
            {
              "pc": "0x006129",
              "count": 519
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
            },
            {
              "block": 15838,
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
              "block": 15844,
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
              "block": 15845,
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
            },
            {
              "block": 15846,
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
              "block": 15852,
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
              "block": 15853,
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
            },
            {
              "block": 15854,
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
              "block": 15860,
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
              "block": 15861,
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
            },
            {
              "block": 196650,
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
              "runtime": {
                "lastPc": 574257,
                "lastMode": "adl",
                "totalSteps": 1037707
              }
            },
            {
              "block": 196651,
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
              "block": 198235,
              "pc": "0x0019B5",
              "target": "halt0019b5",
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
              "block": 198236,
              "pc": "0x08C331",
              "target": "loop08c331",
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
              "block": 199319,
              "pc": "0x03FA09",
              "target": "getCsc03fa09",
              "before": {
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
              "runtime": {
                "lastPc": 574257,
                "lastMode": "adl",
                "totalSteps": 1037707
              }
            },
            {
              "block": 201360,
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
              "runtime": {
                "lastPc": 574257,
                "lastMode": "adl",
                "totalSteps": 1037707
              }
            },
            {
              "block": 201361,
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
              "block": 203009,
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
              "block": 203048,
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
            }
          ],
          "targetSampleLimits": {
            "loop08c331": 2,
            "cxMain0585e9": 2,
            "keyHandler05877a": 2,
            "getCsc03fa09": 3,
            "clear001879": 3,
            "cleanup0018f8": 3,
            "lowBranch0013fc": 2,
            "displaySeed013d11": 2,
            "displayLoop0059c6": 4,
            "low006d5d": 4,
            "low006d38": 4,
            "low006d4f": 4,
            "halt0019b5": 1
          },
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
                "D007CA": [
                  0,
                  361961
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
                "D0243D": 0,
                "D02A40": 0,
                "VAT_D02590": 0,
                "VAT_D0259D": 0
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
                "VAT_D02590": 0,
                "VAT_D0259D": 0
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
                "VAT_D02590": 0,
                "VAT_D0259D": 0
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
                "VAT_D02590": 0,
                "VAT_D0259D": 0
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
                "VAT_D02590": 0,
                "VAT_D0259D": 0
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
                "VAT_D02590": 0,
                "VAT_D0259D": 0
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
                "VAT_D02590": 0,
                "VAT_D0259D": 0
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
                "VAT_D02590": 0,
                "VAT_D0259D": 0
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
                "VAT_D02590": 0,
                "VAT_D0259D": 0
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
                "VAT_D02590": 0,
                "VAT_D0259D": 0
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
                "VAT_D02590": 0,
                "VAT_D0259D": 0
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
                "VAT_D02590": 0,
                "VAT_D0259D": 0
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
          ],
          "lastFields": {
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
      "phaseStats": {
        "browser-p5-launch-home": {
          "label": "browser-p5-launch-home",
          "totalBlocks": 275843,
          "targetCounts": {
            "launch09dd62": 1,
            "memInit09dee0": 1,
            "clear001879": 2,
            "cleanup0018f8": 2,
            "repaint058241": 0,
            "vatLoop084711": 65,
            "vatRewind082be2": 573,
            "halt0019b5": 1,
            "getCsc03fa09": 0,
            "loop08c331": 0,
            "cxMain0585e9": 0,
            "keyHandler05877a": 0,
            "outer08f3b8": 0,
            "tokenReader090883": 1,
            "tokenExit08f5e1": 1,
            "tokenGate090992": 4,
            "tokenStore09098e": 1,
            "eolTuple08f54b": 0,
            "displaySeed013d11": 1,
            "displayLoop0059c6": 300,
            "lowBranch0013fc": 1,
            "low006d38": 10080,
            "low006d4f": 10080,
            "low006d5d": 10088
          },
          "firstBlocks": [
            "0x09DD62",
            "0x09DEE0",
            "0x08A98F",
            "0x08A999",
            "0x07F976",
            "0x09DF0C",
            "0x09DF12",
            "0x000600",
            "0x0138EC",
            "0x09DF18",
            "0x09DF29",
            "0x04C9EA",
            "0x04C8B4",
            "0x04C9EE",
            "0x04C9F4",
            "0x04C896",
            "0x04C9F8",
            "0x09DF2E",
            "0x09DD66",
            "0x0003D4",
            "0x003CC2",
            "0x003CD4",
            "0x003CE0",
            "0x003CEE",
            "0x003CF3",
            "0x09DD7F",
            "0x09DD81",
            "0x09DD8D",
            "0x027F96",
            "0x027FAD",
            "0x027FBC",
            "0x03D202"
          ],
          "lastBlocks": [
            "0x0060B3",
            "0x0060B3",
            "0x0060B3",
            "0x0060B3",
            "0x0060B3",
            "0x0060B3",
            "0x0060B3",
            "0x0060B3",
            "0x0060B3",
            "0x0060B3",
            "0x0060B3",
            "0x0060B3",
            "0x0060B3",
            "0x0060B3",
            "0x0060B3",
            "0x0060B3",
            "0x0060B3",
            "0x0060B3",
            "0x0060B3",
            "0x0060B3",
            "0x0060B3",
            "0x0060B3",
            "0x0060B3",
            "0x0060B3",
            "0x0060B3",
            "0x0060B3",
            "0x0060B3",
            "0x0060B3",
            "0x0060B3",
            "0x0060B3",
            "0x0060B3",
            "0x0060B5",
            "0x0060C7",
            "0x0060D8",
            "0x0060E5",
            "0x0060EA",
            "0x0060F6",
            "0x00190F",
            "0x000862",
            "0x0019B5"
          ],
          "hotBlocks": [
            {
              "pc": "0x09EFDE",
              "count": 33600
            },
            {
              "pc": "0x000A92",
              "count": 32512
            },
            {
              "pc": "0x000BFE",
              "count": 32258
            },
            {
              "pc": "0x0021C2",
              "count": 10090
            },
            {
              "pc": "0x006D5D",
              "count": 10088
            },
            {
              "pc": "0x006D64",
              "count": 10088
            },
            {
              "pc": "0x006CDF",
              "count": 10083
            },
            {
              "pc": "0x006D0F",
              "count": 10083
            },
            {
              "pc": "0x006D38",
              "count": 10080
            },
            {
              "pc": "0x006D4F",
              "count": 10080
            },
            {
              "pc": "0x006CF7",
              "count": 10078
            },
            {
              "pc": "0x005AE8",
              "count": 4800
            },
            {
              "pc": "0x005B16",
              "count": 4800
            },
            {
              "pc": "0x005B4B",
              "count": 4800
            },
            {
              "pc": "0x005AB6",
              "count": 4500
            },
            {
              "pc": "0x000B72",
              "count": 3855
            },
            {
              "pc": "0x000B7C",
              "count": 3085
            },
            {
              "pc": "0x000B81",
              "count": 3085
            },
            {
              "pc": "0x0825D9",
              "count": 1200
            },
            {
              "pc": "0x07CB22",
              "count": 1183
            }
          ]
        },
        "browser-p6-home-repaint": {
          "label": "browser-p6-home-repaint",
          "totalBlocks": 49398,
          "targetCounts": {
            "launch09dd62": 0,
            "memInit09dee0": 0,
            "clear001879": 0,
            "cleanup0018f8": 0,
            "repaint058241": 1,
            "vatLoop084711": 34,
            "vatRewind082be2": 65,
            "halt0019b5": 1,
            "getCsc03fa09": 0,
            "loop08c331": 0,
            "cxMain0585e9": 0,
            "keyHandler05877a": 0,
            "outer08f3b8": 0,
            "tokenReader090883": 0,
            "tokenExit08f5e1": 0,
            "tokenGate090992": 0,
            "tokenStore09098e": 0,
            "eolTuple08f54b": 0,
            "displaySeed013d11": 0,
            "displayLoop0059c6": 0,
            "lowBranch0013fc": 0,
            "low006d38": 0,
            "low006d4f": 0,
            "low006d5d": 0
          },
          "firstBlocks": [
            "0x058241",
            "0x058257",
            "0x058258",
            "0x058262",
            "0x0800C2",
            "0x058272",
            "0x058BA3",
            "0x058276",
            "0x058222",
            "0x08C782",
            "0x05822A",
            "0x058282",
            "0x05828A",
            "0x05828F",
            "0x05829B",
            "0x0582A0",
            "0x09DCAA",
            "0x0582AC",
            "0x083623",
            "0x0582B0",
            "0x083764",
            "0x08376D",
            "0x07F8A2",
            "0x07F8C8",
            "0x07F974",
            "0x083771",
            "0x07FACF",
            "0x07FADF",
            "0x07FA7F",
            "0x07FA86",
            "0x083775",
            "0x061DEF"
          ],
          "lastBlocks": [
            "0x080087",
            "0x08008A",
            "0x080090",
            "0x0827A5",
            "0x08277C",
            "0x082784",
            "0x082BE2",
            "0x082788",
            "0x082799",
            "0x082745",
            "0x04C876",
            "0x082750",
            "0x0821B2",
            "0x0821B4",
            "0x0821B7",
            "0x082754",
            "0x082756",
            "0x082772",
            "0x08279E",
            "0x080084",
            "0x080087",
            "0x08008A",
            "0x080090",
            "0x0827A5",
            "0x08277C",
            "0x082784",
            "0x082BE2",
            "0x082788",
            "0x05E83A",
            "0x05E3A6",
            "0x05E851",
            "0x04C973",
            "0x05E85E",
            "0x05E861",
            "0x05E3AE",
            "0x05E3BB",
            "0x05E803",
            "0x058427",
            "0x058433",
            "0x0019B5"
          ],
          "hotBlocks": [
            {
              "pc": "0x0A28BF",
              "count": 8400
            },
            {
              "pc": "0x0A28B7",
              "count": 8399
            },
            {
              "pc": "0x09EFDE",
              "count": 4872
            },
            {
              "pc": "0x0A2588",
              "count": 2904
            },
            {
              "pc": "0x0A255F",
              "count": 2904
            },
            {
              "pc": "0x0A2563",
              "count": 2261
            },
            {
              "pc": "0x0A257E",
              "count": 2261
            },
            {
              "pc": "0x0A2572",
              "count": 1051
            },
            {
              "pc": "0x0A2548",
              "count": 492
            },
            {
              "pc": "0x0A254F",
              "count": 492
            },
            {
              "pc": "0x0A258B",
              "count": 492
            },
            {
              "pc": "0x0A2695",
              "count": 492
            },
            {
              "pc": "0x001CA6",
              "count": 461
            },
            {
              "pc": "0x001CC0",
              "count": 457
            },
            {
              "pc": "0x001CCA",
              "count": 457
            },
            {
              "pc": "0x0A2555",
              "count": 408
            },
            {
              "pc": "0x0A2585",
              "count": 408
            },
            {
              "pc": "0x0A269A",
              "count": 408
            },
            {
              "pc": "0x0A26B4",
              "count": 408
            },
            {
              "pc": "0x001C33",
              "count": 385
            }
          ]
        }
      },
      "snapshot": {
        "block": 84130,
        "pc": "0x001879",
        "fields": [
          {
            "name": "D007CA",
            "addr": 13633482,
            "len": 3,
            "value": 361961,
            "bytes": [
              233,
              133,
              5
            ]
          },
          {
            "name": "D008E0",
            "addr": 13633760,
            "len": 3,
            "value": 13740134,
            "bytes": [
              102,
              168,
              209
            ]
          },
          {
            "name": "D02587",
            "addr": 13641095,
            "len": 3,
            "value": 13805794,
            "bytes": [
              226,
              168,
              210
            ]
          },
          {
            "name": "D0258A",
            "addr": 13641098,
            "len": 3,
            "value": 13805794,
            "bytes": [
              226,
              168,
              210
            ]
          },
          {
            "name": "D0258D",
            "addr": 13641101,
            "len": 3,
            "value": 13805794,
            "bytes": [
              226,
              168,
              210
            ]
          },
          {
            "name": "D02590",
            "addr": 13641104,
            "len": 3,
            "value": 13893249,
            "bytes": [
              129,
              254,
              211
            ]
          },
          {
            "name": "D02593",
            "addr": 13641107,
            "len": 3,
            "value": 13893249,
            "bytes": [
              129,
              254,
              211
            ]
          },
          {
            "name": "D0259A",
            "addr": 13641114,
            "len": 3,
            "value": 13893249,
            "bytes": [
              129,
              254,
              211
            ]
          },
          {
            "name": "D0259D",
            "addr": 13641117,
            "len": 3,
            "value": 13893325,
            "bytes": [
              205,
              254,
              211
            ]
          },
          {
            "name": "D025A0",
            "addr": 13641120,
            "len": 3,
            "value": 13805732,
            "bytes": [
              164,
              168,
              210
            ]
          },
          {
            "name": "D025C5",
            "addr": 13641157,
            "len": 3,
            "value": 786432,
            "bytes": [
              0,
              0,
              12
            ]
          }
        ],
        "fieldsObject": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A866",
          "D02587": "0xD2A8E2",
          "D0258A": "0xD2A8E2",
          "D0258D": "0xD2A8E2",
          "D02590": "0xD3FE81",
          "D02593": "0xD3FE81",
          "D0259A": "0xD3FE81",
          "D0259D": "0xD3FECD",
          "D025A0": "0xD2A8A4",
          "D025C5": "0x0C0000"
        },
        "vramPixels": 0
      },
      "restore": {
        "label": "browser-before-p6-replay",
        "ok": true,
        "before": {
          "label": "browser-before-p6-replay-before",
          "result": null,
          "runtimeMode": "coldboot",
          "lastPc": 0,
          "lastMode": "z80",
          "totalSteps": 588233,
          "cpu": {
            "pc": 6581,
            "sp": 13740158,
            "iy": 13631616,
            "ix": 16777215,
            "f": 68,
            "halted": true,
            "iff1": 0,
            "iff2": 0,
            "mbase": 208,
            "madl": 1
          },
          "replayFields": {
            "D007CA": "0x000000",
            "D008E0": "0x000000",
            "D02587": "0x000000",
            "D0258A": "0x000000",
            "D0258D": "0x000000",
            "D02590": "0x000000",
            "D02593": "0x000000",
            "D0259A": "0x000000",
            "D0259D": "0x000000",
            "D025A0": "0x000000",
            "D025C5": "0x000000"
          },
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
          "vramPixels": 0,
          "status": "Parsing ROM module...",
          "autoRunText": "AutoRun"
        },
        "after": {
          "label": "browser-before-p6-replay-after",
          "result": null,
          "runtimeMode": "coldboot",
          "lastPc": 0,
          "lastMode": "z80",
          "totalSteps": 588233,
          "cpu": {
            "pc": 6581,
            "sp": 13740158,
            "iy": 13631616,
            "ix": 16777215,
            "f": 68,
            "halted": true,
            "iff1": 0,
            "iff2": 0,
            "mbase": 208,
            "madl": 1
          },
          "replayFields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A866",
            "D02587": "0xD2A8E2",
            "D0258A": "0xD2A8E2",
            "D0258D": "0xD2A8E2",
            "D02590": "0xD3FE81",
            "D02593": "0xD3FE81",
            "D0259A": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "D025A0": "0xD2A8A4",
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
          "vramPixels": 0,
          "status": "Parsing ROM module...",
          "autoRunText": "AutoRun"
        }
      },
      "currentRoute": null,
      "read": {},
      "beginRoute": {},
      "finishRoute": {}
    },
    "logTail": [
      "Click Boot to load ROM (~15 MB compressed)",
      "--- Decoding ROM (145932 blocks, 17.0149% coverage) ---",
      "--- Coldboot Phase 1: Z80 cold boot (0x000000, 20K steps) ---",
      "--- Phase 1 done: 20000 steps, max_steps at 0x001cc0 ---",
      "--- Coldboot Phase 2: Kernel init (0x08C331, 100K steps) ---",
      "--- Phase 2 done: 100000 steps, max_steps at 0x000a92 ---",
      "--- Coldboot Phase 3: Post-init (0x0802B2, 100 steps) ---",
      "--- Phase 3 done: 100 steps, max_steps at 0x0158bc ---",
      "--- Coldboot Phase 4: Warm idle continuation (0x0019be, 1.5M step cap) ---",
      "--- Phase 4 done: 192290 steps, halt at 0x0019b5 ---",
      "--- Coldboot Phase 5: Launch-home init (0x09dd62, 300K step cap) ---",
      "--- Phase 5 done: 275843 steps, halt at 0x0019b5 ---",
      "--- Coldboot Phase 6: Home repaint (0x058241, 300K step cap) ---",
      "--- Phase 6 done: 49474 steps, halt at 0x0019b5; D007CA=0x0585e9, VAT=0xd3fe81, VRAM=8549px ---",
      "--- Coldboot seeded (entry=0x08c331, halt=0x0019b5, SP=0xd1a866, IY=0xD00080, timerInterrupt=true) ---"
    ]
  },
  "eol": {
    "label": "EOL/CLEAR",
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
          "D007CA": [
            0,
            361961
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
          "D0243D": 0,
          "D02A40": 0,
          "VAT_D02590": 0,
          "VAT_D0259D": 0
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
          "VAT_D02590": 0,
          "VAT_D0259D": 0
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
          "VAT_D02590": 0,
          "VAT_D0259D": 0
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
          "VAT_D02590": 0,
          "VAT_D0259D": 0
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
          "VAT_D02590": 0,
          "VAT_D0259D": 0
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
          "VAT_D02590": 0,
          "VAT_D0259D": 0
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
          "VAT_D02590": 0,
          "VAT_D0259D": 0
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
          "VAT_D02590": 0,
          "VAT_D0259D": 0
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
  "digit2": {
    "label": "Digit2",
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
          "D007CA": [
            0,
            361961
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
          "D0243D": 0,
          "D02A40": 0,
          "VAT_D02590": 0,
          "VAT_D0259D": 0
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
          "VAT_D02590": 0,
          "VAT_D0259D": 0
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
          "VAT_D02590": 0,
          "VAT_D0259D": 0
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
          "VAT_D02590": 0,
          "VAT_D0259D": 0
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
          "VAT_D02590": 0,
          "VAT_D0259D": 0
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
          "VAT_D02590": 0,
          "VAT_D0259D": 0
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
          "VAT_D02590": 0,
          "VAT_D0259D": 0
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
          "VAT_D02590": 0,
          "VAT_D0259D": 0
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
          "VAT_D02590": 0,
          "VAT_D0259D": 0
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
          "VAT_D02590": 0,
          "VAT_D0259D": 0
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
          "VAT_D02590": 0,
          "VAT_D0259D": 0
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
          "VAT_D02590": 0,
          "VAT_D0259D": 0
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
  "errors": []
}
```

No source files from the browser shell, runtime, transpiler, or scheduler were modified; this probe serves an instrumented HTML copy from memory.


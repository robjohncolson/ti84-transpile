# Phase 655: Browser VAT Replay Before Repaint

Probe: `probe-phase655-browser-vat-replay.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase655-browser-vat-replay.mjs`

## Summary

- **** Captured Phase 5 snapshot at block 84130 / 0x001879: D02590=0xD3FE81, D0259D=0xD3FECD, D007CA=0x0585E9.
- **** Replayed the snapshot inside the browser coldboot path before Phase 6 event-frame setup; after replay D02590=0xD3FE81, D007CA=0x0585E9.
- **** Browser Phase 6 repaint ended halt after 49474 steps at 0x0019B5; `0x084711` hits=34, VRAM=8549px.
- *** Page error collector saw no browser exceptions.

## Full JSON

```json
{
  "probe": "phase655-browser-vat-replay",
  "chromePath": "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "pageUrl": "http://127.0.0.1:51992/browser-shell.html",
  "pass": true,
  "status": "Coldboot complete. OS event loop is ready.",
  "bootDisabled": true,
  "autoRunText": "AutoRun",
  "vramPixels": 8549,
  "errors": [],
  "phase655": {
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
          "halted": false,
          "iff1": 1,
          "iff2": 1,
          "mbase": 208,
          "madl": 1
        },
        "fields": {
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
        "vramPixels": 0,
        "status": "Parsing ROM module..."
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
          "halted": true,
          "iff1": 0,
          "iff2": 0,
          "mbase": 208,
          "madl": 1
        },
        "fields": {
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
        "vramPixels": 0,
        "status": "Parsing ROM module..."
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
          "halted": true,
          "iff1": 0,
          "iff2": 0,
          "mbase": 208,
          "madl": 1
        },
        "fields": {
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
        "vramPixels": 0,
        "status": "Parsing ROM module..."
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
          "halted": false,
          "iff1": 1,
          "iff2": 1,
          "mbase": 208,
          "madl": 1
        },
        "fields": {
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
        "vramPixels": 0,
        "status": "Parsing ROM module..."
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
          "halted": true,
          "iff1": 0,
          "iff2": 0,
          "mbase": 208,
          "madl": 1
        },
        "fields": {
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
        "vramPixels": 8549,
        "status": "Parsing ROM module..."
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
          "halt0019b5": 1
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
          "0x003CEE"
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
          "halt0019b5": 1
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
          "0x07F8C8"
        ],
        "lastBlocks": [
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
          "halted": true,
          "iff1": 0,
          "iff2": 0,
          "mbase": 208,
          "madl": 1
        },
        "fields": {
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
        "vramPixels": 0,
        "status": "Parsing ROM module..."
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
          "halted": true,
          "iff1": 0,
          "iff2": 0,
          "mbase": 208,
          "madl": 1
        },
        "fields": {
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
        "vramPixels": 0,
        "status": "Parsing ROM module..."
      }
    },
    "readState": {}
  },
  "logTail": [
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
}
```

No source files from the browser shell, runtime, transpiler, or scheduler were modified; this probe serves an instrumented HTML copy from memory.


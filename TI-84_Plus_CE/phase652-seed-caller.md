# Phase 652: Caller Above One-Shot Renderer Seed

Probe: `probe-phase652-seed-caller.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase652-seed-caller.mjs`

## Summary

- 4-star Both traced keys still hit the one-shot seed exactly once: `0x000721 -> 0x013D00 -> 0x005BA6 -> 0x013D11`.
- 4-star The dynamic immediate predecessor of `0x000721` is `0x00142C` in both key cases; the call stack is empty at `0x000721`, so this is a direct low-ROM branch/return path, not a normal CALL frame.
- 4-star The wider pre-seed chain is visible in both traces and converges through `0x001428 -> 0x00142C -> 0x000721` after the `0x003Cxx` interrupt/status path.
- 4-star Both keys still select the low transfer frame and stop at first `0x006CC6` with preserved `D007CA`/`D008E0`/VAT live.
- 3-star Token/tail hooks remain bypassed: `0x08F5E1`, `0x090992`, and `0x08F54B` stay at zero hits.
- No runtime, transpiler, browser, or scheduler source files were modified.

## Scenario Results

| Key | Repaint | Trace | Restores | 0x00142C | 0x000721 | 0x013D00 | 0x005BA6 | 0x013D11 | 0x0059C6 | 0x005B92 | 0x0017FC | 0x0064D0 | 0x006CC6 | Token/tail | Immediate pre-seed | Final D007CA | Final D008E0 | Final VAT |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|---|
| EOL/CLEAR | halt 0x0019B5 | after-low-frame-selection 0x006CC6 | 2 | 1 | 1 | 1 | 1 | 1 | 87 | 87 | 2 | 1 | 1 | 0 | 0x00142C | 0x0585E9 | 0xD1A863 | 0xD3FE81 |
| Digit2 | halt 0x0019B5 | after-low-frame-selection 0x006CC6 | 1 | 1 | 1 | 1 | 1 | 1 | 87 | 87 | 2 | 1 | 1 | 0 | 0x00142C | 0x0585E9 | 0xD1A863 | 0xD3FE81 |

## Compact Dynamic Trace

```json
[
  {
    "key": "EOL/CLEAR",
    "result": {
      "steps": 57860,
      "termination": "after-low-frame-selection",
      "lastPc": "0x006CC6",
      "lastMode": "adl"
    },
    "counts": {
      "outerLoop08c331": 1,
      "cxMain0585e9": 2,
      "eolClear0a2150": 1,
      "bulkClear001879": 1,
      "pre0028d1": 1,
      "pre0013fc": 1,
      "pre001405": 1,
      "pre003cbc": 1,
      "pre003cc6": 1,
      "pre003cd4": 21,
      "pre003ce0": 21,
      "pre003cee": 21,
      "pre003cf3": 21,
      "pre001428": 1,
      "pre00142c": 1,
      "seed000721": 1,
      "seed013d00": 1,
      "seed005ba6": 1,
      "seed013d11": 1,
      "display0059c6": 87,
      "display005b92": 87,
      "transfer0017fc": 2,
      "low0064d0": 1,
      "low006cc6": 1,
      "token08f5e1": 0,
      "token090992": 0,
      "token08f54b": 0
    },
    "restorations": [
      {
        "label": "after-0x0A2150-LDIR",
        "atBlock": 20932,
        "atPc": "0x0A2156",
        "afterD007CA": "0x0585E9",
        "afterD008E0": "0xD1A863",
        "afterD02590": "0xD3FE81"
      },
      {
        "label": "after-0x001879-bulk-clear",
        "atBlock": 48554,
        "atPc": "0x0018F8",
        "afterD007CA": "0x0585E9",
        "afterD008E0": "0xD1A863",
        "afterD02590": "0xD3FE81"
      }
    ],
    "immediatePredecessor": "0x00142C",
    "preSeedSamples": {
      "pre0028d1": {
        "block": 50201,
        "pc": "0x0028D1",
        "state": {
          "pc": "0x0028D1",
          "sp": "0xD1A87B",
          "ix": "0x000000",
          "iy": "0xD00080",
          "af": "0x0480",
          "bc": "0x000044",
          "de": "0xD65800",
          "hl": "0xD657FF",
          "flags": {
            "z": false,
            "c": false,
            "n": false
          },
          "D00080": "0x00",
          "D0008D": "0x00",
          "D0009F": "0x00",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000000",
          "D005A0": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D02590": "0xD3FE81",
          "D0259A": "0xD3FE81",
          "vramPixels": 0
        },
        "memory": {
          "low0059c": "0x095CC3",
          "low005a0": "0x06F3C3",
          "D00596": "0x00",
          "D0059C": "0x000000",
          "D005A0": "0x00",
          "D005A1": "0x00",
          "D005A2": "0x00",
          "ixBytes": [
            "0xF3",
            "0xED",
            "0x7E",
            "0x5B",
            "0xC3",
            "0x58",
            "0x06",
            "0x00",
            "0xF3",
            "0xED",
            "0x7E",
            "0x5B"
          ]
        },
        "stackTop": [
          {
            "addr": "0xD1A87B",
            "value": "0x0013FC"
          },
          {
            "addr": "0xD1A87E",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A881",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A884",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A887",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A88A",
            "value": "0x000000"
          }
        ],
        "ixFrame": {
          "IX-45": "0x000000",
          "IX-42": "0x000000",
          "IX-39": "0x000000",
          "IX-30": "0xB30000",
          "IX-27": "0x00D140",
          "IX-24": "0x00",
          "IX-20": "0x000000",
          "IX-17": "0x000000",
          "IX-11": "0x001C00",
          "IX-8": "0x00",
          "IX-7": "0xB3",
          "IX-6": "0x00D140",
          "IX-3": "0x000000",
          "IX+0": "0x7EEDF3",
          "IX+3": "0x58C35B",
          "IX+6": "0xF30006",
          "IX+9": "0x5B7EED"
        },
        "callStackTail": [
          "0x0013F8"
        ],
        "recentBlocks": [
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003BF5",
          "0x003BFD",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C0E",
          "0x003C16",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C1F",
          "0x003C27",
          "0x0061E5",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C42",
          "0x003B0D",
          "0x003B17",
          "0x0013F4",
          "0x0013F8",
          "0x0028D1"
        ]
      },
      "pre0013fc": {
        "block": 50202,
        "pc": "0x0013FC",
        "state": {
          "pc": "0x0013FC",
          "sp": "0xD1A87E",
          "ix": "0x000000",
          "iy": "0xD00080",
          "af": "0x0480",
          "bc": "0x000044",
          "de": "0xD65800",
          "hl": "0xD657FF",
          "flags": {
            "z": false,
            "c": false,
            "n": false
          },
          "D00080": "0x00",
          "D0008D": "0x00",
          "D0009F": "0x00",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000000",
          "D005A0": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D02590": "0xD3FE81",
          "D0259A": "0xD3FE81",
          "vramPixels": 0
        },
        "memory": {
          "low0059c": "0x095CC3",
          "low005a0": "0x06F3C3",
          "D00596": "0x00",
          "D0059C": "0x000000",
          "D005A0": "0x00",
          "D005A1": "0x00",
          "D005A2": "0x00",
          "ixBytes": [
            "0xF3",
            "0xED",
            "0x7E",
            "0x5B",
            "0xC3",
            "0x58",
            "0x06",
            "0x00",
            "0xF3",
            "0xED",
            "0x7E",
            "0x5B"
          ]
        },
        "stackTop": [
          {
            "addr": "0xD1A87E",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A881",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A884",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A887",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A88A",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A88D",
            "value": "0x008000"
          }
        ],
        "ixFrame": {
          "IX-45": "0x000000",
          "IX-42": "0x000000",
          "IX-39": "0x000000",
          "IX-30": "0xB30000",
          "IX-27": "0x00D140",
          "IX-24": "0x00",
          "IX-20": "0x000000",
          "IX-17": "0x000000",
          "IX-11": "0x001C00",
          "IX-8": "0x00",
          "IX-7": "0xB3",
          "IX-6": "0x00D140",
          "IX-3": "0x000000",
          "IX+0": "0x7EEDF3",
          "IX+3": "0x58C35B",
          "IX+6": "0xF30006",
          "IX+9": "0x5B7EED"
        },
        "callStackTail": [],
        "recentBlocks": [
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003BF5",
          "0x003BFD",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C0E",
          "0x003C16",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C1F",
          "0x003C27",
          "0x0061E5",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C42",
          "0x003B0D",
          "0x003B17",
          "0x0013F4",
          "0x0013F8",
          "0x0028D1",
          "0x0013FC"
        ]
      },
      "pre001405": {
        "block": 50203,
        "pc": "0x001405",
        "state": {
          "pc": "0x001405",
          "sp": "0xD1A87E",
          "ix": "0x000000",
          "iy": "0xD00080",
          "af": "0xEE54",
          "bc": "0x000044",
          "de": "0xD65800",
          "hl": "0xD657FF",
          "flags": {
            "z": true,
            "c": false,
            "n": false
          },
          "D00080": "0x00",
          "D0008D": "0x00",
          "D0009F": "0x00",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000000",
          "D005A0": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D02590": "0xD3FE81",
          "D0259A": "0xD3FE81",
          "vramPixels": 0
        },
        "memory": {
          "low0059c": "0x095CC3",
          "low005a0": "0x06F3C3",
          "D00596": "0x00",
          "D0059C": "0x000000",
          "D005A0": "0x00",
          "D005A1": "0x00",
          "D005A2": "0x00",
          "ixBytes": [
            "0xF3",
            "0xED",
            "0x7E",
            "0x5B",
            "0xC3",
            "0x58",
            "0x06",
            "0x00",
            "0xF3",
            "0xED",
            "0x7E",
            "0x5B"
          ]
        },
        "stackTop": [
          {
            "addr": "0xD1A87E",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A881",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A884",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A887",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A88A",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A88D",
            "value": "0x008000"
          }
        ],
        "ixFrame": {
          "IX-45": "0x000000",
          "IX-42": "0x000000",
          "IX-39": "0x000000",
          "IX-30": "0xB30000",
          "IX-27": "0x00D140",
          "IX-24": "0x00",
          "IX-20": "0x000000",
          "IX-17": "0x000000",
          "IX-11": "0x001C00",
          "IX-8": "0x00",
          "IX-7": "0xB3",
          "IX-6": "0x00D140",
          "IX-3": "0x000000",
          "IX+0": "0x7EEDF3",
          "IX+3": "0x58C35B",
          "IX+6": "0xF30006",
          "IX+9": "0x5B7EED"
        },
        "callStackTail": [],
        "recentBlocks": [
          "0x0061FD",
          "0x006202",
          "0x003BF5",
          "0x003BFD",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C0E",
          "0x003C16",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C1F",
          "0x003C27",
          "0x0061E5",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C42",
          "0x003B0D",
          "0x003B17",
          "0x0013F4",
          "0x0013F8",
          "0x0028D1",
          "0x0013FC",
          "0x001405"
        ]
      },
      "pre003cbc": {
        "block": 50204,
        "pc": "0x003CBC",
        "state": {
          "pc": "0x003CBC",
          "sp": "0xD1A87B",
          "ix": "0x000000",
          "iy": "0xD00080",
          "af": "0xEE54",
          "bc": "0x000044",
          "de": "0xD65800",
          "hl": "0xD657FF",
          "flags": {
            "z": true,
            "c": false,
            "n": false
          },
          "D00080": "0x00",
          "D0008D": "0x00",
          "D0009F": "0x00",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000000",
          "D005A0": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D02590": "0xD3FE81",
          "D0259A": "0xD3FE81",
          "vramPixels": 0
        },
        "memory": {
          "low0059c": "0x095CC3",
          "low005a0": "0x06F3C3",
          "D00596": "0x00",
          "D0059C": "0x000000",
          "D005A0": "0x00",
          "D005A1": "0x00",
          "D005A2": "0x00",
          "ixBytes": [
            "0xF3",
            "0xED",
            "0x7E",
            "0x5B",
            "0xC3",
            "0x58",
            "0x06",
            "0x00",
            "0xF3",
            "0xED",
            "0x7E",
            "0x5B"
          ]
        },
        "stackTop": [
          {
            "addr": "0xD1A87B",
            "value": "0x001409"
          },
          {
            "addr": "0xD1A87E",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A881",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A884",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A887",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A88A",
            "value": "0x000000"
          }
        ],
        "ixFrame": {
          "IX-45": "0x000000",
          "IX-42": "0x000000",
          "IX-39": "0x000000",
          "IX-30": "0xB30000",
          "IX-27": "0x00D140",
          "IX-24": "0x00",
          "IX-20": "0x000000",
          "IX-17": "0x000000",
          "IX-11": "0x001C00",
          "IX-8": "0x00",
          "IX-7": "0xB3",
          "IX-6": "0x00D140",
          "IX-3": "0x000000",
          "IX+0": "0x7EEDF3",
          "IX+3": "0x58C35B",
          "IX+6": "0xF30006",
          "IX+9": "0x5B7EED"
        },
        "callStackTail": [
          "0x001405"
        ],
        "recentBlocks": [
          "0x006202",
          "0x003BF5",
          "0x003BFD",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C0E",
          "0x003C16",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C1F",
          "0x003C27",
          "0x0061E5",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C42",
          "0x003B0D",
          "0x003B17",
          "0x0013F4",
          "0x0013F8",
          "0x0028D1",
          "0x0013FC",
          "0x001405",
          "0x003CBC"
        ]
      },
      "pre003cc6": {
        "block": 50205,
        "pc": "0x003CC6",
        "state": {
          "pc": "0x003CC6",
          "sp": "0xD1A87B",
          "ix": "0x000000",
          "iy": "0xD00080",
          "af": "0xEE54",
          "bc": "0x000044",
          "de": "0xD65800",
          "hl": "0xD657FF",
          "flags": {
            "z": true,
            "c": false,
            "n": false
          },
          "D00080": "0x00",
          "D0008D": "0x00",
          "D0009F": "0x00",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000000",
          "D005A0": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D02590": "0xD3FE81",
          "D0259A": "0xD3FE81",
          "vramPixels": 0
        },
        "memory": {
          "low0059c": "0x095CC3",
          "low005a0": "0x06F3C3",
          "D00596": "0x00",
          "D0059C": "0x000000",
          "D005A0": "0x00",
          "D005A1": "0x00",
          "D005A2": "0x00",
          "ixBytes": [
            "0xF3",
            "0xED",
            "0x7E",
            "0x5B",
            "0xC3",
            "0x58",
            "0x06",
            "0x00",
            "0xF3",
            "0xED",
            "0x7E",
            "0x5B"
          ]
        },
        "stackTop": [
          {
            "addr": "0xD1A87B",
            "value": "0x001409"
          },
          {
            "addr": "0xD1A87E",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A881",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A884",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A887",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A88A",
            "value": "0x000000"
          }
        ],
        "ixFrame": {
          "IX-45": "0x000000",
          "IX-42": "0x000000",
          "IX-39": "0x000000",
          "IX-30": "0xB30000",
          "IX-27": "0x00D140",
          "IX-24": "0x00",
          "IX-20": "0x000000",
          "IX-17": "0x000000",
          "IX-11": "0x001C00",
          "IX-8": "0x00",
          "IX-7": "0xB3",
          "IX-6": "0x00D140",
          "IX-3": "0x000000",
          "IX+0": "0x7EEDF3",
          "IX+3": "0x58C35B",
          "IX+6": "0xF30006",
          "IX+9": "0x5B7EED"
        },
        "callStackTail": [
          "0x001405"
        ],
        "recentBlocks": [
          "0x003BF5",
          "0x003BFD",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C0E",
          "0x003C16",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C1F",
          "0x003C27",
          "0x0061E5",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C42",
          "0x003B0D",
          "0x003B17",
          "0x0013F4",
          "0x0013F8",
          "0x0028D1",
          "0x0013FC",
          "0x001405",
          "0x003CBC",
          "0x003CC6"
        ]
      },
      "pre003cd4": {
        "block": 106,
        "pc": "0x003CD4",
        "state": {
          "pc": "0x003CD4",
          "sp": "0xD1A84E",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "af": "0xA042",
          "bc": "0x00A000",
          "de": "0x0080C0",
          "hl": "0x000000",
          "flags": {
            "z": true,
            "c": false,
            "n": true
          },
          "D00080": "0x08",
          "D0008D": "0x0E",
          "D0009F": "0x20",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x0F",
          "D0058C": "0x0F",
          "D0058D": "0x0F",
          "D0058E": "0x0F",
          "D00596": "0x00",
          "D0059C": "0xD4202C",
          "D005A0": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0xD1A8A3",
          "D02590": "0xD3FE81",
          "D0259A": "0xD3FE81",
          "vramPixels": 8549
        },
        "memory": {
          "low0059c": "0x095CC3",
          "low005a0": "0x06F3C3",
          "D00596": "0x00",
          "D0059C": "0xD4202C",
          "D005A0": "0x00",
          "D005A1": "0x00",
          "D005A2": "0x00",
          "ixBytes": [
            "0x39",
            "0xC3",
            "0x08",
            "0xB5",
            "0x19",
            "0x00",
            "0xFF",
            "0xFF",
            "0xFF",
            "0xFF",
            "0xFF",
            "0xFF"
          ]
        },
        "stackTop": [
          {
            "addr": "0xD1A84E",
            "value": "0x03F998"
          },
          {
            "addr": "0xD1A851",
            "value": "0x03D058"
          },
          {
            "addr": "0xD1A854",
            "value": "0xD1A8A1"
          },
          {
            "addr": "0xD1A857",
            "value": "0xD00080"
          },
          {
            "addr": "0xD1A85A",
            "value": "0xD1A860"
          },
          {
            "addr": "0xD1A85D",
            "value": "0x05C67C"
          }
        ],
        "ixFrame": {
          "IX-45": "0xD1A83C",
          "IX-42": "0x001C54",
          "IX-39": "0x000002",
          "IX-30": "0x001C54",
          "IX-27": "0x006816",
          "IX-24": "0x60",
          "IX-20": "0x980017",
          "IX-17": "0x5803F9",
          "IX-11": "0x80D1A8",
          "IX-8": "0x00",
          "IX-7": "0xD0",
          "IX-6": "0xD1A860",
          "IX-3": "0x05C67C",
          "IX+0": "0x08C339",
          "IX+3": "0x0019B5",
          "IX+6": "0xFFFFFF",
          "IX+9": "0xFFFFFF"
        },
        "callStackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentBlocks": [
          "0x001CCA",
          "0x001CE4",
          "0x001C54",
          "0x006816",
          "0x00681E",
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
          "0x03D04C",
          "0x03D054",
          "0x03F994",
          "0x0003D4",
          "0x003CC2",
          "0x003CD4"
        ]
      },
      "pre003ce0": {
        "block": 107,
        "pc": "0x003CE0",
        "state": {
          "pc": "0x003CE0",
          "sp": "0xD1A84E",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "af": "0xA042",
          "bc": "0x00A00C",
          "de": "0x0080C0",
          "hl": "0x000000",
          "flags": {
            "z": true,
            "c": false,
            "n": true
          },
          "D00080": "0x08",
          "D0008D": "0x0E",
          "D0009F": "0x20",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x0F",
          "D0058C": "0x0F",
          "D0058D": "0x0F",
          "D0058E": "0x0F",
          "D00596": "0x00",
          "D0059C": "0xD4202C",
          "D005A0": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0xD1A8A3",
          "D02590": "0xD3FE81",
          "D0259A": "0xD3FE81",
          "vramPixels": 8549
        },
        "memory": {
          "low0059c": "0x095CC3",
          "low005a0": "0x06F3C3",
          "D00596": "0x00",
          "D0059C": "0xD4202C",
          "D005A0": "0x00",
          "D005A1": "0x00",
          "D005A2": "0x00",
          "ixBytes": [
            "0x39",
            "0xC3",
            "0x08",
            "0xB5",
            "0x19",
            "0x00",
            "0xFF",
            "0xFF",
            "0xFF",
            "0xFF",
            "0xFF",
            "0xFF"
          ]
        },
        "stackTop": [
          {
            "addr": "0xD1A84E",
            "value": "0x03F998"
          },
          {
            "addr": "0xD1A851",
            "value": "0x03D058"
          },
          {
            "addr": "0xD1A854",
            "value": "0xD1A8A1"
          },
          {
            "addr": "0xD1A857",
            "value": "0xD00080"
          },
          {
            "addr": "0xD1A85A",
            "value": "0xD1A860"
          },
          {
            "addr": "0xD1A85D",
            "value": "0x05C67C"
          }
        ],
        "ixFrame": {
          "IX-45": "0xD1A83C",
          "IX-42": "0x001C54",
          "IX-39": "0x000002",
          "IX-30": "0x001C54",
          "IX-27": "0x006816",
          "IX-24": "0x60",
          "IX-20": "0x980017",
          "IX-17": "0x5803F9",
          "IX-11": "0x80D1A8",
          "IX-8": "0x00",
          "IX-7": "0xD0",
          "IX-6": "0xD1A860",
          "IX-3": "0x05C67C",
          "IX+0": "0x08C339",
          "IX+3": "0x0019B5",
          "IX+6": "0xFFFFFF",
          "IX+9": "0xFFFFFF"
        },
        "callStackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentBlocks": [
          "0x001CE4",
          "0x001C54",
          "0x006816",
          "0x00681E",
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
          "0x03D04C",
          "0x03D054",
          "0x03F994",
          "0x0003D4",
          "0x003CC2",
          "0x003CD4",
          "0x003CE0"
        ]
      },
      "pre003cee": {
        "block": 108,
        "pc": "0x003CEE",
        "state": {
          "pc": "0x003CEE",
          "sp": "0xD1A84E",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "af": "0xA042",
          "bc": "0x00A008",
          "de": "0x0080C0",
          "hl": "0x00FF00",
          "flags": {
            "z": true,
            "c": false,
            "n": true
          },
          "D00080": "0x08",
          "D0008D": "0x0E",
          "D0009F": "0x20",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x0F",
          "D0058C": "0x0F",
          "D0058D": "0x0F",
          "D0058E": "0x0F",
          "D00596": "0x00",
          "D0059C": "0xD4202C",
          "D005A0": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0xD1A8A3",
          "D02590": "0xD3FE81",
          "D0259A": "0xD3FE81",
          "vramPixels": 8549
        },
        "memory": {
          "low0059c": "0x095CC3",
          "low005a0": "0x06F3C3",
          "D00596": "0x00",
          "D0059C": "0xD4202C",
          "D005A0": "0x00",
          "D005A1": "0x00",
          "D005A2": "0x00",
          "ixBytes": [
            "0x39",
            "0xC3",
            "0x08",
            "0xB5",
            "0x19",
            "0x00",
            "0xFF",
            "0xFF",
            "0xFF",
            "0xFF",
            "0xFF",
            "0xFF"
          ]
        },
        "stackTop": [
          {
            "addr": "0xD1A84E",
            "value": "0x03F998"
          },
          {
            "addr": "0xD1A851",
            "value": "0x03D058"
          },
          {
            "addr": "0xD1A854",
            "value": "0xD1A8A1"
          },
          {
            "addr": "0xD1A857",
            "value": "0xD00080"
          },
          {
            "addr": "0xD1A85A",
            "value": "0xD1A860"
          },
          {
            "addr": "0xD1A85D",
            "value": "0x05C67C"
          }
        ],
        "ixFrame": {
          "IX-45": "0xD1A83C",
          "IX-42": "0x001C54",
          "IX-39": "0x000002",
          "IX-30": "0x001C54",
          "IX-27": "0x006816",
          "IX-24": "0x60",
          "IX-20": "0x980017",
          "IX-17": "0x5803F9",
          "IX-11": "0x80D1A8",
          "IX-8": "0x00",
          "IX-7": "0xD0",
          "IX-6": "0xD1A860",
          "IX-3": "0x05C67C",
          "IX+0": "0x08C339",
          "IX+3": "0x0019B5",
          "IX+6": "0xFFFFFF",
          "IX+9": "0xFFFFFF"
        },
        "callStackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentBlocks": [
          "0x001C54",
          "0x006816",
          "0x00681E",
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
          "0x03D04C",
          "0x03D054",
          "0x03F994",
          "0x0003D4",
          "0x003CC2",
          "0x003CD4",
          "0x003CE0",
          "0x003CEE"
        ]
      },
      "pre003cf3": {
        "block": 109,
        "pc": "0x003CF3",
        "state": {
          "pc": "0x003CF3",
          "sp": "0xD1A84E",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "af": "0x0842",
          "bc": "0x00A008",
          "de": "0x0080C0",
          "hl": "0x00FF00",
          "flags": {
            "z": true,
            "c": false,
            "n": true
          },
          "D00080": "0x08",
          "D0008D": "0x0E",
          "D0009F": "0x20",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x0F",
          "D0058C": "0x0F",
          "D0058D": "0x0F",
          "D0058E": "0x0F",
          "D00596": "0x00",
          "D0059C": "0xD4202C",
          "D005A0": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0xD1A8A3",
          "D02590": "0xD3FE81",
          "D0259A": "0xD3FE81",
          "vramPixels": 8549
        },
        "memory": {
          "low0059c": "0x095CC3",
          "low005a0": "0x06F3C3",
          "D00596": "0x00",
          "D0059C": "0xD4202C",
          "D005A0": "0x00",
          "D005A1": "0x00",
          "D005A2": "0x00",
          "ixBytes": [
            "0x39",
            "0xC3",
            "0x08",
            "0xB5",
            "0x19",
            "0x00",
            "0xFF",
            "0xFF",
            "0xFF",
            "0xFF",
            "0xFF",
            "0xFF"
          ]
        },
        "stackTop": [
          {
            "addr": "0xD1A84E",
            "value": "0x03F998"
          },
          {
            "addr": "0xD1A851",
            "value": "0x03D058"
          },
          {
            "addr": "0xD1A854",
            "value": "0xD1A8A1"
          },
          {
            "addr": "0xD1A857",
            "value": "0xD00080"
          },
          {
            "addr": "0xD1A85A",
            "value": "0xD1A860"
          },
          {
            "addr": "0xD1A85D",
            "value": "0x05C67C"
          }
        ],
        "ixFrame": {
          "IX-45": "0xD1A83C",
          "IX-42": "0x001C54",
          "IX-39": "0x000002",
          "IX-30": "0x001C54",
          "IX-27": "0x006816",
          "IX-24": "0x60",
          "IX-20": "0x980017",
          "IX-17": "0x5803F9",
          "IX-11": "0x80D1A8",
          "IX-8": "0x00",
          "IX-7": "0xD0",
          "IX-6": "0xD1A860",
          "IX-3": "0x05C67C",
          "IX+0": "0x08C339",
          "IX+3": "0x0019B5",
          "IX+6": "0xFFFFFF",
          "IX+9": "0xFFFFFF"
        },
        "callStackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentBlocks": [
          "0x006816",
          "0x00681E",
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
          "0x03D04C",
          "0x03D054",
          "0x03F994",
          "0x0003D4",
          "0x003CC2",
          "0x003CD4",
          "0x003CE0",
          "0x003CEE",
          "0x003CF3"
        ]
      },
      "pre001428": {
        "block": 50213,
        "pc": "0x001428",
        "state": {
          "pc": "0x001428",
          "sp": "0xD1A87E",
          "ix": "0x000000",
          "iy": "0xD00080",
          "af": "0x0042",
          "bc": "0x00A55A",
          "de": "0xD65800",
          "hl": "0x000000",
          "flags": {
            "z": true,
            "c": false,
            "n": true
          },
          "D00080": "0x00",
          "D0008D": "0x00",
          "D0009F": "0x00",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000000",
          "D005A0": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D02590": "0xD3FE81",
          "D0259A": "0xD3FE81",
          "vramPixels": 0
        },
        "memory": {
          "low0059c": "0x095CC3",
          "low005a0": "0x06F3C3",
          "D00596": "0x00",
          "D0059C": "0x000000",
          "D005A0": "0x00",
          "D005A1": "0x00",
          "D005A2": "0x00",
          "ixBytes": [
            "0xF3",
            "0xED",
            "0x7E",
            "0x5B",
            "0xC3",
            "0x58",
            "0x06",
            "0x00",
            "0xF3",
            "0xED",
            "0x7E",
            "0x5B"
          ]
        },
        "stackTop": [
          {
            "addr": "0xD1A87E",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A881",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A884",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A887",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A88A",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A88D",
            "value": "0x008000"
          }
        ],
        "ixFrame": {
          "IX-45": "0x000000",
          "IX-42": "0x000000",
          "IX-39": "0x000000",
          "IX-30": "0xB30000",
          "IX-27": "0x00D140",
          "IX-24": "0x00",
          "IX-20": "0x000000",
          "IX-17": "0x000000",
          "IX-11": "0x001C00",
          "IX-8": "0x00",
          "IX-7": "0xB3",
          "IX-6": "0x00D140",
          "IX-3": "0x000000",
          "IX+0": "0x7EEDF3",
          "IX+3": "0x58C35B",
          "IX+6": "0xF30006",
          "IX+9": "0x5B7EED"
        },
        "callStackTail": [],
        "recentBlocks": [
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C1F",
          "0x003C27",
          "0x0061E5",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C42",
          "0x003B0D",
          "0x003B17",
          "0x0013F4",
          "0x0013F8",
          "0x0028D1",
          "0x0013FC",
          "0x001405",
          "0x003CBC",
          "0x003CC6",
          "0x003CD4",
          "0x003CE0",
          "0x003CEE",
          "0x003CF3",
          "0x001409",
          "0x001424",
          "0x0008BB",
          "0x001428"
        ]
      },
      "pre00142c": {
        "block": 50214,
        "pc": "0x00142C",
        "state": {
          "pc": "0x00142C",
          "sp": "0xD1A87E",
          "ix": "0x000000",
          "iy": "0xD00080",
          "af": "0x0042",
          "bc": "0x00A55A",
          "de": "0xD65800",
          "hl": "0x000000",
          "flags": {
            "z": true,
            "c": false,
            "n": true
          },
          "D00080": "0x00",
          "D0008D": "0x00",
          "D0009F": "0x00",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000000",
          "D005A0": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D02590": "0xD3FE81",
          "D0259A": "0xD3FE81",
          "vramPixels": 0
        },
        "memory": {
          "low0059c": "0x095CC3",
          "low005a0": "0x06F3C3",
          "D00596": "0x00",
          "D0059C": "0x000000",
          "D005A0": "0x00",
          "D005A1": "0x00",
          "D005A2": "0x00",
          "ixBytes": [
            "0xF3",
            "0xED",
            "0x7E",
            "0x5B",
            "0xC3",
            "0x58",
            "0x06",
            "0x00",
            "0xF3",
            "0xED",
            "0x7E",
            "0x5B"
          ]
        },
        "stackTop": [
          {
            "addr": "0xD1A87E",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A881",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A884",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A887",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A88A",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A88D",
            "value": "0x008000"
          }
        ],
        "ixFrame": {
          "IX-45": "0x000000",
          "IX-42": "0x000000",
          "IX-39": "0x000000",
          "IX-30": "0xB30000",
          "IX-27": "0x00D140",
          "IX-24": "0x00",
          "IX-20": "0x000000",
          "IX-17": "0x000000",
          "IX-11": "0x001C00",
          "IX-8": "0x00",
          "IX-7": "0xB3",
          "IX-6": "0x00D140",
          "IX-3": "0x000000",
          "IX+0": "0x7EEDF3",
          "IX+3": "0x58C35B",
          "IX+6": "0xF30006",
          "IX+9": "0x5B7EED"
        },
        "callStackTail": [],
        "recentBlocks": [
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C1F",
          "0x003C27",
          "0x0061E5",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C42",
          "0x003B0D",
          "0x003B17",
          "0x0013F4",
          "0x0013F8",
          "0x0028D1",
          "0x0013FC",
          "0x001405",
          "0x003CBC",
          "0x003CC6",
          "0x003CD4",
          "0x003CE0",
          "0x003CEE",
          "0x003CF3",
          "0x001409",
          "0x001424",
          "0x0008BB",
          "0x001428",
          "0x00142C"
        ]
      }
    },
    "seedWindow": {
      "block": 50215,
      "pc": "0x000721",
      "state": {
        "pc": "0x000721",
        "sp": "0xD1A87E",
        "ix": "0x000000",
        "iy": "0xD00080",
        "af": "0x0042",
        "bc": "0x00A55A",
        "de": "0xD65800",
        "hl": "0x000000",
        "flags": {
          "z": true,
          "c": false,
          "n": true
        },
        "D00080": "0x00",
        "D0008D": "0x00",
        "D0009F": "0x00",
        "D00121": "0x000000",
        "D00124": "0x00",
        "D00587": "0x00",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00",
        "D00596": "0x00",
        "D0059C": "0x000000",
        "D005A0": "0x00",
        "D007CA": "0x0585E9",
        "D008E0": "0xD1A863",
        "D0231A": "0x000000",
        "D0243A": "0x000000",
        "D02590": "0xD3FE81",
        "D0259A": "0xD3FE81",
        "vramPixels": 0
      },
      "memory": {
        "low0059c": "0x095CC3",
        "low005a0": "0x06F3C3",
        "D00596": "0x00",
        "D0059C": "0x000000",
        "D005A0": "0x00",
        "D005A1": "0x00",
        "D005A2": "0x00",
        "ixBytes": [
          "0xF3",
          "0xED",
          "0x7E",
          "0x5B",
          "0xC3",
          "0x58",
          "0x06",
          "0x00",
          "0xF3",
          "0xED",
          "0x7E",
          "0x5B"
        ]
      },
      "stackTop": [
        {
          "addr": "0xD1A87E",
          "value": "0x000000"
        },
        {
          "addr": "0xD1A881",
          "value": "0x000000"
        },
        {
          "addr": "0xD1A884",
          "value": "0x000000"
        },
        {
          "addr": "0xD1A887",
          "value": "0x000000"
        },
        {
          "addr": "0xD1A88A",
          "value": "0x000000"
        },
        {
          "addr": "0xD1A88D",
          "value": "0x008000"
        }
      ],
      "ixFrame": {
        "IX-45": "0x000000",
        "IX-42": "0x000000",
        "IX-39": "0x000000",
        "IX-30": "0xB30000",
        "IX-27": "0x00D140",
        "IX-24": "0x00",
        "IX-20": "0x000000",
        "IX-17": "0x000000",
        "IX-11": "0x001C00",
        "IX-8": "0x00",
        "IX-7": "0xB3",
        "IX-6": "0x00D140",
        "IX-3": "0x000000",
        "IX+0": "0x7EEDF3",
        "IX+3": "0x58C35B",
        "IX+6": "0xF30006",
        "IX+9": "0x5B7EED"
      },
      "callStackTail": [],
      "recentBlocks": [
        "0x0061FD",
        "0x006202",
        "0x003C1F",
        "0x003C27",
        "0x0061E5",
        "0x0061E9",
        "0x0061FD",
        "0x006202",
        "0x003C42",
        "0x003B0D",
        "0x003B17",
        "0x0013F4",
        "0x0013F8",
        "0x0028D1",
        "0x0013FC",
        "0x001405",
        "0x003CBC",
        "0x003CC6",
        "0x003CD4",
        "0x003CE0",
        "0x003CEE",
        "0x003CF3",
        "0x001409",
        "0x001424",
        "0x0008BB",
        "0x001428",
        "0x00142C",
        "0x000721"
      ]
    },
    "seedTail": {
      "seed013d00": {
        "block": 50216,
        "pc": "0x013D00",
        "state": {
          "pc": "0x013D00",
          "sp": "0xD1A87B",
          "ix": "0x000000",
          "iy": "0xD00080",
          "af": "0x0042",
          "bc": "0x00A55A",
          "de": "0xD65800",
          "hl": "0x000000",
          "flags": {
            "z": true,
            "c": false,
            "n": true
          },
          "D00080": "0x00",
          "D0008D": "0x00",
          "D0009F": "0x00",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000000",
          "D005A0": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D02590": "0xD3FE81",
          "D0259A": "0xD3FE81",
          "vramPixels": 0
        },
        "memory": {
          "low0059c": "0x095CC3",
          "low005a0": "0x06F3C3",
          "D00596": "0x00",
          "D0059C": "0x000000",
          "D005A0": "0x00",
          "D005A1": "0x00",
          "D005A2": "0x00",
          "ixBytes": [
            "0xF3",
            "0xED",
            "0x7E",
            "0x5B",
            "0xC3",
            "0x58",
            "0x06",
            "0x00",
            "0xF3",
            "0xED",
            "0x7E",
            "0x5B"
          ]
        },
        "stackTop": [
          {
            "addr": "0xD1A87B",
            "value": "0x000725"
          },
          {
            "addr": "0xD1A87E",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A881",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A884",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A887",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A88A",
            "value": "0x000000"
          }
        ],
        "ixFrame": {
          "IX-45": "0x000000",
          "IX-42": "0x000000",
          "IX-39": "0x000000",
          "IX-30": "0xB30000",
          "IX-27": "0x00D140",
          "IX-24": "0x00",
          "IX-20": "0x000000",
          "IX-17": "0x000000",
          "IX-11": "0x001C00",
          "IX-8": "0x00",
          "IX-7": "0xB3",
          "IX-6": "0x00D140",
          "IX-3": "0x000000",
          "IX+0": "0x7EEDF3",
          "IX+3": "0x58C35B",
          "IX+6": "0xF30006",
          "IX+9": "0x5B7EED"
        },
        "callStackTail": [
          "0x000721"
        ],
        "recentBlocks": [
          "0x006202",
          "0x003C1F",
          "0x003C27",
          "0x0061E5",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C42",
          "0x003B0D",
          "0x003B17",
          "0x0013F4",
          "0x0013F8",
          "0x0028D1",
          "0x0013FC",
          "0x001405",
          "0x003CBC",
          "0x003CC6",
          "0x003CD4",
          "0x003CE0",
          "0x003CEE",
          "0x003CF3",
          "0x001409",
          "0x001424",
          "0x0008BB",
          "0x001428",
          "0x00142C",
          "0x000721",
          "0x013D00"
        ]
      },
      "seed005ba6": {
        "block": 50217,
        "pc": "0x005BA6",
        "state": {
          "pc": "0x005BA6",
          "sp": "0xD1A86F",
          "ix": "0x000000",
          "iy": "0xD00080",
          "af": "0x0040",
          "bc": "0x00A55A",
          "de": "0xD65800",
          "hl": "0x000000",
          "flags": {
            "z": true,
            "c": false,
            "n": false
          },
          "D00080": "0x00",
          "D0008D": "0x00",
          "D0009F": "0x00",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000000",
          "D005A0": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D02590": "0xD3FE81",
          "D0259A": "0xD3FE81",
          "vramPixels": 0
        },
        "memory": {
          "low0059c": "0x095CC3",
          "low005a0": "0x06F3C3",
          "D00596": "0x00",
          "D0059C": "0x000000",
          "D005A0": "0x00",
          "D005A1": "0x00",
          "D005A2": "0x00",
          "ixBytes": [
            "0xF3",
            "0xED",
            "0x7E",
            "0x5B",
            "0xC3",
            "0x58",
            "0x06",
            "0x00",
            "0xF3",
            "0xED",
            "0x7E",
            "0x5B"
          ]
        },
        "stackTop": [
          {
            "addr": "0xD1A86F",
            "value": "0x013D11"
          },
          {
            "addr": "0xD1A872",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A875",
            "value": "0xD00080"
          },
          {
            "addr": "0xD1A878",
            "value": "0x000040"
          },
          {
            "addr": "0xD1A87B",
            "value": "0x000725"
          },
          {
            "addr": "0xD1A87E",
            "value": "0x000000"
          }
        ],
        "ixFrame": {
          "IX-45": "0x000000",
          "IX-42": "0x000000",
          "IX-39": "0x000000",
          "IX-30": "0xB30000",
          "IX-27": "0x00D140",
          "IX-24": "0x00",
          "IX-20": "0x000000",
          "IX-17": "0x000000",
          "IX-11": "0x001C00",
          "IX-8": "0x00",
          "IX-7": "0xB3",
          "IX-6": "0x00D140",
          "IX-3": "0x000000",
          "IX+0": "0x7EEDF3",
          "IX+3": "0x58C35B",
          "IX+6": "0xF30006",
          "IX+9": "0x5B7EED"
        },
        "callStackTail": [
          "0x000721",
          "0x013D00"
        ],
        "recentBlocks": [
          "0x003C1F",
          "0x003C27",
          "0x0061E5",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C42",
          "0x003B0D",
          "0x003B17",
          "0x0013F4",
          "0x0013F8",
          "0x0028D1",
          "0x0013FC",
          "0x001405",
          "0x003CBC",
          "0x003CC6",
          "0x003CD4",
          "0x003CE0",
          "0x003CEE",
          "0x003CF3",
          "0x001409",
          "0x001424",
          "0x0008BB",
          "0x001428",
          "0x00142C",
          "0x000721",
          "0x013D00",
          "0x005BA6"
        ]
      },
      "seed013d11": {
        "block": 50218,
        "pc": "0x013D11",
        "state": {
          "pc": "0x013D11",
          "sp": "0xD1A872",
          "ix": "0x000000",
          "iy": "0xD00080",
          "af": "0x0040",
          "bc": "0x00A55A",
          "de": "0xD65800",
          "hl": "0x000000",
          "flags": {
            "z": true,
            "c": false,
            "n": false
          },
          "D00080": "0x00",
          "D0008D": "0x00",
          "D0009F": "0x00",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000000",
          "D005A0": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D02590": "0xD3FE81",
          "D0259A": "0xD3FE81",
          "vramPixels": 0
        },
        "memory": {
          "low0059c": "0x095CC3",
          "low005a0": "0x06F3C3",
          "D00596": "0x00",
          "D0059C": "0x000000",
          "D005A0": "0x00",
          "D005A1": "0x00",
          "D005A2": "0x00",
          "ixBytes": [
            "0xF3",
            "0xED",
            "0x7E",
            "0x5B",
            "0xC3",
            "0x58",
            "0x06",
            "0x00",
            "0xF3",
            "0xED",
            "0x7E",
            "0x5B"
          ]
        },
        "stackTop": [
          {
            "addr": "0xD1A872",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A875",
            "value": "0xD00080"
          },
          {
            "addr": "0xD1A878",
            "value": "0x000040"
          },
          {
            "addr": "0xD1A87B",
            "value": "0x000725"
          },
          {
            "addr": "0xD1A87E",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A881",
            "value": "0x000000"
          }
        ],
        "ixFrame": {
          "IX-45": "0x000000",
          "IX-42": "0x000000",
          "IX-39": "0x000000",
          "IX-30": "0xB30000",
          "IX-27": "0x00D140",
          "IX-24": "0x00",
          "IX-20": "0x000000",
          "IX-17": "0x000000",
          "IX-11": "0x001C00",
          "IX-8": "0x00",
          "IX-7": "0xB3",
          "IX-6": "0x00D140",
          "IX-3": "0x000000",
          "IX+0": "0x7EEDF3",
          "IX+3": "0x58C35B",
          "IX+6": "0xF30006",
          "IX+9": "0x5B7EED"
        },
        "callStackTail": [
          "0x000721"
        ],
        "recentBlocks": [
          "0x003C27",
          "0x0061E5",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C42",
          "0x003B0D",
          "0x003B17",
          "0x0013F4",
          "0x0013F8",
          "0x0028D1",
          "0x0013FC",
          "0x001405",
          "0x003CBC",
          "0x003CC6",
          "0x003CD4",
          "0x003CE0",
          "0x003CEE",
          "0x003CF3",
          "0x001409",
          "0x001424",
          "0x0008BB",
          "0x001428",
          "0x00142C",
          "0x000721",
          "0x013D00",
          "0x005BA6",
          "0x013D11"
        ]
      },
      "display0059c6": {
        "block": 50219,
        "pc": "0x0059C6",
        "state": {
          "pc": "0x0059C6",
          "sp": "0xD1A86F",
          "ix": "0x000000",
          "iy": "0xD00080",
          "af": "0x2040",
          "bc": "0x000E5A",
          "de": "0xD65800",
          "hl": "0x000000",
          "flags": {
            "z": true,
            "c": false,
            "n": false
          },
          "D00080": "0x00",
          "D0008D": "0x00",
          "D0009F": "0x00",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000000",
          "D005A0": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D02590": "0xD3FE81",
          "D0259A": "0xD3FE81",
          "vramPixels": 0
        },
        "memory": {
          "low0059c": "0x095CC3",
          "low005a0": "0x06F3C3",
          "D00596": "0x00",
          "D0059C": "0x000000",
          "D005A0": "0x00",
          "D005A1": "0x00",
          "D005A2": "0x00",
          "ixBytes": [
            "0xF3",
            "0xED",
            "0x7E",
            "0x5B",
            "0xC3",
            "0x58",
            "0x06",
            "0x00",
            "0xF3",
            "0xED",
            "0x7E",
            "0x5B"
          ]
        },
        "stackTop": [
          {
            "addr": "0xD1A86F",
            "value": "0x013D1D"
          },
          {
            "addr": "0xD1A872",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A875",
            "value": "0xD00080"
          },
          {
            "addr": "0xD1A878",
            "value": "0x000040"
          },
          {
            "addr": "0xD1A87B",
            "value": "0x000725"
          },
          {
            "addr": "0xD1A87E",
            "value": "0x000000"
          }
        ],
        "ixFrame": {
          "IX-45": "0x000000",
          "IX-42": "0x000000",
          "IX-39": "0x000000",
          "IX-30": "0xB30000",
          "IX-27": "0x00D140",
          "IX-24": "0x00",
          "IX-20": "0x000000",
          "IX-17": "0x000000",
          "IX-11": "0x001C00",
          "IX-8": "0x00",
          "IX-7": "0xB3",
          "IX-6": "0x00D140",
          "IX-3": "0x000000",
          "IX+0": "0x7EEDF3",
          "IX+3": "0x58C35B",
          "IX+6": "0xF30006",
          "IX+9": "0x5B7EED"
        },
        "callStackTail": [
          "0x000721",
          "0x013D11"
        ],
        "recentBlocks": [
          "0x0061E5",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C42",
          "0x003B0D",
          "0x003B17",
          "0x0013F4",
          "0x0013F8",
          "0x0028D1",
          "0x0013FC",
          "0x001405",
          "0x003CBC",
          "0x003CC6",
          "0x003CD4",
          "0x003CE0",
          "0x003CEE",
          "0x003CF3",
          "0x001409",
          "0x001424",
          "0x0008BB",
          "0x001428",
          "0x00142C",
          "0x000721",
          "0x013D00",
          "0x005BA6",
          "0x013D11",
          "0x0059C6"
        ]
      }
    },
    "transferSamples": {
      "display005b92": {
        "block": 50299,
        "pc": "0x005B92",
        "state": {
          "pc": "0x005B92",
          "sp": "0xD1A857",
          "ix": "0xD005C1",
          "iy": "0xD00080",
          "af": "0xFF42",
          "bc": "0xFF0005",
          "de": "0x0000FF",
          "hl": "0xD005A0",
          "flags": {
            "z": true,
            "c": false,
            "n": true
          },
          "D00080": "0x00",
          "D0008D": "0x00",
          "D0009F": "0x00",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000002",
          "D005A0": "0x35",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D02590": "0xD3FE81",
          "D0259A": "0xD3FE81",
          "vramPixels": 0
        },
        "memory": {
          "low0059c": "0x095CC3",
          "low005a0": "0x06F3C3",
          "D00596": "0x00",
          "D0059C": "0x000002",
          "D005A0": "0x35",
          "D005A1": "0x00",
          "D005A2": "0x00",
          "ixBytes": [
            "0x00",
            "0x00",
            "0x00",
            "0x00",
            "0x00",
            "0x00",
            "0x00",
            "0x00",
            "0x00",
            "0x00",
            "0x00",
            "0x00"
          ]
        },
        "stackTop": [
          {
            "addr": "0xD1A857",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A85A",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A85D",
            "value": "0xD65800"
          },
          {
            "addr": "0xD1A860",
            "value": "0x000E5A"
          },
          {
            "addr": "0xD1A863",
            "value": "0x00201B"
          },
          {
            "addr": "0xD1A866",
            "value": "0x0059DA"
          }
        ],
        "ixFrame": {
          "IX-45": "0x000000",
          "IX-42": "0x000000",
          "IX-39": "0x020000",
          "IX-30": "0x000000",
          "IX-27": "0x000000",
          "IX-24": "0x00",
          "IX-20": "0x000000",
          "IX-17": "0x000000",
          "IX-11": "0x000000",
          "IX-8": "0x00",
          "IX-7": "0x00",
          "IX-6": "0x000000",
          "IX-3": "0x000000",
          "IX+0": "0x000000",
          "IX+3": "0x000000",
          "IX+6": "0x000000",
          "IX+9": "0x000000"
        },
        "callStackTail": [
          "0x000721",
          "0x013D11",
          "0x0059C6"
        ],
        "recentBlocks": [
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005B92"
        ]
      },
      "transfer0017fc": {
        "block": 57733,
        "pc": "0x0017FC",
        "state": {
          "pc": "0x0017FC",
          "sp": "0xD1A834",
          "ix": "0xD1A866",
          "iy": "0xD00080",
          "af": "0x2F00",
          "bc": "0x09D6B4",
          "de": "0x008000",
          "hl": "0x0017DA",
          "flags": {
            "z": false,
            "c": false,
            "n": false
          },
          "D00080": "0x00",
          "D0008D": "0x00",
          "D0009F": "0x00",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00596": "0x13",
          "D0059C": "0x0000DA",
          "D005A0": "0x85",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D02590": "0xD3FE81",
          "D0259A": "0xD3FE81",
          "vramPixels": 3040
        },
        "memory": {
          "low0059c": "0x095CC3",
          "low005a0": "0x06F3C3",
          "D00596": "0x13",
          "D0059C": "0x0000DA",
          "D005A0": "0x85",
          "D005A1": "0x00",
          "D005A2": "0x00",
          "ixBytes": [
            "0x78",
            "0xA8",
            "0xD1",
            "0x68",
            "0x39",
            "0x01",
            "0x00",
            "0x00",
            "0x02",
            "0x80",
            "0x00",
            "0xD0"
          ]
        },
        "stackTop": [
          {
            "addr": "0xD1A834",
            "value": "0x00090C"
          },
          {
            "addr": "0xD1A837",
            "value": "0x006486"
          },
          {
            "addr": "0xD1A83A",
            "value": "0x0BD6BA"
          },
          {
            "addr": "0xD1A83D",
            "value": "0x1700D1"
          },
          {
            "addr": "0xD1A840",
            "value": "0x740017"
          },
          {
            "addr": "0xD1A843",
            "value": "0x080059"
          }
        ],
        "ixFrame": {
          "IX-45": "0xD6BA00",
          "IX-42": "0x00D10B",
          "IX-39": "0x001717",
          "IX-30": "0xFFFFFC",
          "IX-27": "0xFF0105",
          "IX-24": "0x00",
          "IX-20": "0x08013D",
          "IX-17": "0x5A0000",
          "IX-11": "0x7E002E",
          "IX-8": "0xA8",
          "IX-7": "0xD1",
          "IX-6": "0x000000",
          "IX-3": "0x0138F9",
          "IX+0": "0xD1A878",
          "IX+3": "0x013968",
          "IX+6": "0x020000",
          "IX+9": "0xD00080"
        },
        "callStackTail": [],
        "recentBlocks": [
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005B92",
          "0x005A19",
          "0x0059DA",
          "0x0059E6",
          "0x0017FC"
        ]
      },
      "low0064d0": {
        "block": 57859,
        "pc": "0x0064D0",
        "state": {
          "pc": "0x0064D0",
          "sp": "0xD1A83A",
          "ix": "0xD1A866",
          "iy": "0xD00080",
          "af": "0x0A42",
          "bc": "0x002000",
          "de": "0x000240",
          "hl": "0x0017DB",
          "flags": {
            "z": true,
            "c": false,
            "n": true
          },
          "D00080": "0x00",
          "D0008D": "0x00",
          "D0009F": "0x00",
          "D00121": "0x000000",
          "D00124": "0x0A",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00596": "0x13",
          "D0059C": "0x0000DA",
          "D005A0": "0x85",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D02590": "0xD3FE81",
          "D0259A": "0xD3FE81",
          "vramPixels": 3031
        },
        "memory": {
          "low0059c": "0x095CC3",
          "low005a0": "0x06F3C3",
          "D00596": "0x13",
          "D0059C": "0x0000DA",
          "D005A0": "0x85",
          "D005A1": "0x00",
          "D005A2": "0x00",
          "ixBytes": [
            "0x78",
            "0xA8",
            "0xD1",
            "0x68",
            "0x39",
            "0x01",
            "0x00",
            "0x00",
            "0x02",
            "0x80",
            "0x00",
            "0xD0"
          ]
        },
        "stackTop": [
          {
            "addr": "0xD1A83A",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A83D",
            "value": "0x1700D1"
          },
          {
            "addr": "0xD1A840",
            "value": "0x740017"
          },
          {
            "addr": "0xD1A843",
            "value": "0x080059"
          },
          {
            "addr": "0xD1A846",
            "value": "0xFC0005"
          },
          {
            "addr": "0xD1A849",
            "value": "0x05FFFF"
          }
        ],
        "ixFrame": {
          "IX-45": "0x000000",
          "IX-42": "0x00D100",
          "IX-39": "0x001717",
          "IX-30": "0xFFFFFC",
          "IX-27": "0xFF0105",
          "IX-24": "0x00",
          "IX-20": "0x08013D",
          "IX-17": "0x5A0000",
          "IX-11": "0xC0002E",
          "IX-8": "0xD7",
          "IX-7": "0x0B",
          "IX-6": "0x000104",
          "IX-3": "0x09D7BE",
          "IX+0": "0xD1A878",
          "IX+3": "0x013968",
          "IX+6": "0x020000",
          "IX+9": "0xD00080"
        },
        "callStackTail": [],
        "recentBlocks": [
          "0x005B16",
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005B92",
          "0x005A19",
          "0x0059DA",
          "0x0059E6",
          "0x0017FC",
          "0x0064D0"
        ]
      },
      "low006cc6": {
        "block": 57860,
        "pc": "0x006CC6",
        "state": {
          "pc": "0x006CC6",
          "sp": "0xD1A834",
          "ix": "0xD1A866",
          "iy": "0xD00080",
          "af": "0x0A42",
          "bc": "0x020000",
          "de": "0x000240",
          "hl": "0x000000",
          "flags": {
            "z": true,
            "c": false,
            "n": true
          },
          "D00080": "0x00",
          "D0008D": "0x00",
          "D0009F": "0x00",
          "D00121": "0x000000",
          "D00124": "0x0A",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00596": "0x13",
          "D0059C": "0x0000DA",
          "D005A0": "0x85",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D02590": "0xD3FE81",
          "D0259A": "0xD3FE81",
          "vramPixels": 3031
        },
        "memory": {
          "low0059c": "0x095CC3",
          "low005a0": "0x06F3C3",
          "D00596": "0x13",
          "D0059C": "0x0000DA",
          "D005A0": "0x85",
          "D005A1": "0x00",
          "D005A2": "0x00",
          "ixBytes": [
            "0x78",
            "0xA8",
            "0xD1",
            "0x68",
            "0x39",
            "0x01",
            "0x00",
            "0x00",
            "0x02",
            "0x80",
            "0x00",
            "0xD0"
          ]
        },
        "stackTop": [
          {
            "addr": "0xD1A834",
            "value": "0x0064DE"
          },
          {
            "addr": "0xD1A837",
            "value": "0x020000"
          },
          {
            "addr": "0xD1A83A",
            "value": "0x000100"
          },
          {
            "addr": "0xD1A83D",
            "value": "0x1700D1"
          },
          {
            "addr": "0xD1A840",
            "value": "0x740017"
          },
          {
            "addr": "0xD1A843",
            "value": "0x080059"
          }
        ],
        "ixFrame": {
          "IX-45": "0x010002",
          "IX-42": "0x00D100",
          "IX-39": "0x001717",
          "IX-30": "0xFFFFFC",
          "IX-27": "0xFF0105",
          "IX-24": "0x00",
          "IX-20": "0x08013D",
          "IX-17": "0x5A0000",
          "IX-11": "0xC0002E",
          "IX-8": "0xD7",
          "IX-7": "0x0B",
          "IX-6": "0x000104",
          "IX-3": "0x09D7BE",
          "IX+0": "0xD1A878",
          "IX+3": "0x013968",
          "IX+6": "0x020000",
          "IX+9": "0xD00080"
        },
        "callStackTail": [
          "0x0064D0"
        ],
        "recentBlocks": [
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005B92",
          "0x005A19",
          "0x0059DA",
          "0x0059E6",
          "0x0017FC",
          "0x0064D0",
          "0x006CC6"
        ]
      }
    },
    "seedTransitions": [
      {
        "name": "pre003cd4",
        "hit": 1,
        "block": 106,
        "pc": "0x003CD4",
        "previous": "0x003CC2",
        "sp": "0xD1A84E",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
          "0x03CFE5",
          "0x03CFEA",
          "0x03D029",
          "0x03D033",
          "0x03D038",
          "0x03D044",
          "0x03D04C",
          "0x03D054",
          "0x03F994",
          "0x0003D4",
          "0x003CC2",
          "0x003CD4"
        ]
      },
      {
        "name": "pre003ce0",
        "hit": 1,
        "block": 107,
        "pc": "0x003CE0",
        "previous": "0x003CD4",
        "sp": "0xD1A84E",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
          "0x03CFEA",
          "0x03D029",
          "0x03D033",
          "0x03D038",
          "0x03D044",
          "0x03D04C",
          "0x03D054",
          "0x03F994",
          "0x0003D4",
          "0x003CC2",
          "0x003CD4",
          "0x003CE0"
        ]
      },
      {
        "name": "pre003cee",
        "hit": 1,
        "block": 108,
        "pc": "0x003CEE",
        "previous": "0x003CE0",
        "sp": "0xD1A84E",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
          "0x03D029",
          "0x03D033",
          "0x03D038",
          "0x03D044",
          "0x03D04C",
          "0x03D054",
          "0x03F994",
          "0x0003D4",
          "0x003CC2",
          "0x003CD4",
          "0x003CE0",
          "0x003CEE"
        ]
      },
      {
        "name": "pre003cf3",
        "hit": 1,
        "block": 109,
        "pc": "0x003CF3",
        "previous": "0x003CEE",
        "sp": "0xD1A84E",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
          "0x03D033",
          "0x03D038",
          "0x03D044",
          "0x03D04C",
          "0x03D054",
          "0x03F994",
          "0x0003D4",
          "0x003CC2",
          "0x003CD4",
          "0x003CE0",
          "0x003CEE",
          "0x003CF3"
        ]
      },
      {
        "name": "pre003cd4",
        "hit": 2,
        "block": 338,
        "pc": "0x003CD4",
        "previous": "0x003CC2",
        "sp": "0xD1A845",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
          "0x03CFE5",
          "0x03CFEA",
          "0x03D029",
          "0x03D033",
          "0x03D038",
          "0x03D044",
          "0x03D04C",
          "0x03D054",
          "0x03F994",
          "0x0003D4",
          "0x003CC2",
          "0x003CD4"
        ]
      },
      {
        "name": "pre003ce0",
        "hit": 2,
        "block": 339,
        "pc": "0x003CE0",
        "previous": "0x003CD4",
        "sp": "0xD1A845",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
          "0x03CFEA",
          "0x03D029",
          "0x03D033",
          "0x03D038",
          "0x03D044",
          "0x03D04C",
          "0x03D054",
          "0x03F994",
          "0x0003D4",
          "0x003CC2",
          "0x003CD4",
          "0x003CE0"
        ]
      },
      {
        "name": "pre003cee",
        "hit": 2,
        "block": 340,
        "pc": "0x003CEE",
        "previous": "0x003CE0",
        "sp": "0xD1A845",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
          "0x03D029",
          "0x03D033",
          "0x03D038",
          "0x03D044",
          "0x03D04C",
          "0x03D054",
          "0x03F994",
          "0x0003D4",
          "0x003CC2",
          "0x003CD4",
          "0x003CE0",
          "0x003CEE"
        ]
      },
      {
        "name": "pre003cf3",
        "hit": 2,
        "block": 341,
        "pc": "0x003CF3",
        "previous": "0x003CEE",
        "sp": "0xD1A845",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
          "0x03D033",
          "0x03D038",
          "0x03D044",
          "0x03D04C",
          "0x03D054",
          "0x03F994",
          "0x0003D4",
          "0x003CC2",
          "0x003CD4",
          "0x003CE0",
          "0x003CEE",
          "0x003CF3"
        ]
      },
      {
        "name": "pre003cd4",
        "hit": 3,
        "block": 1734,
        "pc": "0x003CD4",
        "previous": "0x003CC2",
        "sp": "0xD1A842",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
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
          "0x003CD4"
        ]
      },
      {
        "name": "pre003ce0",
        "hit": 3,
        "block": 1735,
        "pc": "0x003CE0",
        "previous": "0x003CD4",
        "sp": "0xD1A842",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
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
          "0x003CE0"
        ]
      },
      {
        "name": "pre003cee",
        "hit": 3,
        "block": 1736,
        "pc": "0x003CEE",
        "previous": "0x003CE0",
        "sp": "0xD1A842",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
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
          "0x003CEE"
        ]
      },
      {
        "name": "pre003cf3",
        "hit": 3,
        "block": 1737,
        "pc": "0x003CF3",
        "previous": "0x003CEE",
        "sp": "0xD1A842",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
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
          "0x003CF3"
        ]
      },
      {
        "name": "pre003cd4",
        "hit": 4,
        "block": 1907,
        "pc": "0x003CD4",
        "previous": "0x003CC2",
        "sp": "0xD1A84E",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
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
          "0x003CD4"
        ]
      },
      {
        "name": "pre003ce0",
        "hit": 4,
        "block": 1908,
        "pc": "0x003CE0",
        "previous": "0x003CD4",
        "sp": "0xD1A84E",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
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
          "0x003CE0"
        ]
      },
      {
        "name": "pre003cee",
        "hit": 4,
        "block": 1909,
        "pc": "0x003CEE",
        "previous": "0x003CE0",
        "sp": "0xD1A84E",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
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
          "0x003CEE"
        ]
      },
      {
        "name": "pre003cf3",
        "hit": 4,
        "block": 1910,
        "pc": "0x003CF3",
        "previous": "0x003CEE",
        "sp": "0xD1A84E",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
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
          "0x003CF3"
        ]
      },
      {
        "name": "pre003cd4",
        "hit": 5,
        "block": 20799,
        "pc": "0x003CD4",
        "previous": "0x003CC2",
        "sp": "0xD1A80F",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
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
          "0x003CD4"
        ]
      },
      {
        "name": "pre003ce0",
        "hit": 5,
        "block": 20800,
        "pc": "0x003CE0",
        "previous": "0x003CD4",
        "sp": "0xD1A80F",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
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
          "0x003CE0"
        ]
      },
      {
        "name": "pre003cee",
        "hit": 5,
        "block": 20801,
        "pc": "0x003CEE",
        "previous": "0x003CE0",
        "sp": "0xD1A80F",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
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
          "0x003CEE"
        ]
      },
      {
        "name": "pre003cf3",
        "hit": 5,
        "block": 20802,
        "pc": "0x003CF3",
        "previous": "0x003CEE",
        "sp": "0xD1A80F",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
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
          "0x003CF3"
        ]
      },
      {
        "name": "pre003cd4",
        "hit": 6,
        "block": 20914,
        "pc": "0x003CD4",
        "previous": "0x003CC2",
        "sp": "0xD1A80F",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
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
          "0x003CD4"
        ]
      },
      {
        "name": "pre003ce0",
        "hit": 6,
        "block": 20915,
        "pc": "0x003CE0",
        "previous": "0x003CD4",
        "sp": "0xD1A80F",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
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
          "0x003CE0"
        ]
      },
      {
        "name": "pre003cee",
        "hit": 6,
        "block": 20916,
        "pc": "0x003CEE",
        "previous": "0x003CE0",
        "sp": "0xD1A80F",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
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
          "0x003CEE"
        ]
      },
      {
        "name": "pre003cf3",
        "hit": 6,
        "block": 20917,
        "pc": "0x003CF3",
        "previous": "0x003CEE",
        "sp": "0xD1A80F",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
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
          "0x003CF3"
        ]
      },
      {
        "name": "pre003cd4",
        "hit": 7,
        "block": 21107,
        "pc": "0x003CD4",
        "previous": "0x003CC2",
        "sp": "0xD1A821",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
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
          "0x003CD4"
        ]
      },
      {
        "name": "pre003ce0",
        "hit": 7,
        "block": 21108,
        "pc": "0x003CE0",
        "previous": "0x003CD4",
        "sp": "0xD1A821",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
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
          "0x003CE0"
        ]
      },
      {
        "name": "pre003cee",
        "hit": 7,
        "block": 21109,
        "pc": "0x003CEE",
        "previous": "0x003CE0",
        "sp": "0xD1A821",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
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
          "0x003CEE"
        ]
      },
      {
        "name": "pre003cf3",
        "hit": 7,
        "block": 21110,
        "pc": "0x003CF3",
        "previous": "0x003CEE",
        "sp": "0xD1A821",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
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
          "0x003CF3"
        ]
      },
      {
        "name": "pre003cd4",
        "hit": 8,
        "block": 31002,
        "pc": "0x003CD4",
        "previous": "0x003CC2",
        "sp": "0xD1A851",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
          "0x03CFE5",
          "0x03CFEA",
          "0x03D029",
          "0x03D033",
          "0x03D038",
          "0x03D044",
          "0x03D04C",
          "0x03D054",
          "0x03F994",
          "0x0003D4",
          "0x003CC2",
          "0x003CD4"
        ]
      },
      {
        "name": "pre003ce0",
        "hit": 8,
        "block": 31003,
        "pc": "0x003CE0",
        "previous": "0x003CD4",
        "sp": "0xD1A851",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
          "0x03CFEA",
          "0x03D029",
          "0x03D033",
          "0x03D038",
          "0x03D044",
          "0x03D04C",
          "0x03D054",
          "0x03F994",
          "0x0003D4",
          "0x003CC2",
          "0x003CD4",
          "0x003CE0"
        ]
      },
      {
        "name": "pre003cee",
        "hit": 8,
        "block": 31004,
        "pc": "0x003CEE",
        "previous": "0x003CE0",
        "sp": "0xD1A851",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
          "0x03D029",
          "0x03D033",
          "0x03D038",
          "0x03D044",
          "0x03D04C",
          "0x03D054",
          "0x03F994",
          "0x0003D4",
          "0x003CC2",
          "0x003CD4",
          "0x003CE0",
          "0x003CEE"
        ]
      },
      {
        "name": "pre003cf3",
        "hit": 8,
        "block": 31005,
        "pc": "0x003CF3",
        "previous": "0x003CEE",
        "sp": "0xD1A851",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
          "0x03D033",
          "0x03D038",
          "0x03D044",
          "0x03D04C",
          "0x03D054",
          "0x03F994",
          "0x0003D4",
          "0x003CC2",
          "0x003CD4",
          "0x003CE0",
          "0x003CEE",
          "0x003CF3"
        ]
      },
      {
        "name": "pre003cd4",
        "hit": 9,
        "block": 31116,
        "pc": "0x003CD4",
        "previous": "0x003CC2",
        "sp": "0xD1A851",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
          "0x03CFE5",
          "0x03CFEA",
          "0x03D029",
          "0x03D033",
          "0x03D038",
          "0x03D044",
          "0x03D04C",
          "0x03D054",
          "0x03F994",
          "0x0003D4",
          "0x003CC2",
          "0x003CD4"
        ]
      },
      {
        "name": "pre003ce0",
        "hit": 9,
        "block": 31117,
        "pc": "0x003CE0",
        "previous": "0x003CD4",
        "sp": "0xD1A851",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
          "0x03CFEA",
          "0x03D029",
          "0x03D033",
          "0x03D038",
          "0x03D044",
          "0x03D04C",
          "0x03D054",
          "0x03F994",
          "0x0003D4",
          "0x003CC2",
          "0x003CD4",
          "0x003CE0"
        ]
      },
      {
        "name": "pre003cee",
        "hit": 9,
        "block": 31118,
        "pc": "0x003CEE",
        "previous": "0x003CE0",
        "sp": "0xD1A851",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
          "0x03D029",
          "0x03D033",
          "0x03D038",
          "0x03D044",
          "0x03D04C",
          "0x03D054",
          "0x03F994",
          "0x0003D4",
          "0x003CC2",
          "0x003CD4",
          "0x003CE0",
          "0x003CEE"
        ]
      },
      {
        "name": "pre003cf3",
        "hit": 9,
        "block": 31119,
        "pc": "0x003CF3",
        "previous": "0x003CEE",
        "sp": "0xD1A851",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
          "0x03D033",
          "0x03D038",
          "0x03D044",
          "0x03D04C",
          "0x03D054",
          "0x03F994",
          "0x0003D4",
          "0x003CC2",
          "0x003CD4",
          "0x003CE0",
          "0x003CEE",
          "0x003CF3"
        ]
      },
      {
        "name": "pre003cd4",
        "hit": 10,
        "block": 32452,
        "pc": "0x003CD4",
        "previous": "0x003CC2",
        "sp": "0xD1A845",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
          "0x03CFE5",
          "0x03CFEA",
          "0x03D029",
          "0x03D033",
          "0x03D038",
          "0x03D044",
          "0x03D04C",
          "0x03D054",
          "0x03F994",
          "0x0003D4",
          "0x003CC2",
          "0x003CD4"
        ]
      },
      {
        "name": "pre003ce0",
        "hit": 10,
        "block": 32453,
        "pc": "0x003CE0",
        "previous": "0x003CD4",
        "sp": "0xD1A845",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
          "0x03CFEA",
          "0x03D029",
          "0x03D033",
          "0x03D038",
          "0x03D044",
          "0x03D04C",
          "0x03D054",
          "0x03F994",
          "0x0003D4",
          "0x003CC2",
          "0x003CD4",
          "0x003CE0"
        ]
      },
      {
        "name": "pre003cee",
        "hit": 10,
        "block": 32454,
        "pc": "0x003CEE",
        "previous": "0x003CE0",
        "sp": "0xD1A845",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
          "0x03D029",
          "0x03D033",
          "0x03D038",
          "0x03D044",
          "0x03D04C",
          "0x03D054",
          "0x03F994",
          "0x0003D4",
          "0x003CC2",
          "0x003CD4",
          "0x003CE0",
          "0x003CEE"
        ]
      },
      {
        "name": "pre003cf3",
        "hit": 10,
        "block": 32455,
        "pc": "0x003CF3",
        "previous": "0x003CEE",
        "sp": "0xD1A845",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
          "0x03D033",
          "0x03D038",
          "0x03D044",
          "0x03D04C",
          "0x03D054",
          "0x03F994",
          "0x0003D4",
          "0x003CC2",
          "0x003CD4",
          "0x003CE0",
          "0x003CEE",
          "0x003CF3"
        ]
      },
      {
        "name": "pre003cd4",
        "hit": 11,
        "block": 32706,
        "pc": "0x003CD4",
        "previous": "0x003CC2",
        "sp": "0xD1A84E",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
          "0x03CFE5",
          "0x03CFEA",
          "0x03D029",
          "0x03D033",
          "0x03D038",
          "0x03D044",
          "0x03D04C",
          "0x03D054",
          "0x03F994",
          "0x0003D4",
          "0x003CC2",
          "0x003CD4"
        ]
      },
      {
        "name": "pre003ce0",
        "hit": 11,
        "block": 32707,
        "pc": "0x003CE0",
        "previous": "0x003CD4",
        "sp": "0xD1A84E",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
          "0x03CFEA",
          "0x03D029",
          "0x03D033",
          "0x03D038",
          "0x03D044",
          "0x03D04C",
          "0x03D054",
          "0x03F994",
          "0x0003D4",
          "0x003CC2",
          "0x003CD4",
          "0x003CE0"
        ]
      },
      {
        "name": "pre003cee",
        "hit": 11,
        "block": 32708,
        "pc": "0x003CEE",
        "previous": "0x003CE0",
        "sp": "0xD1A84E",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
          "0x03D029",
          "0x03D033",
          "0x03D038",
          "0x03D044",
          "0x03D04C",
          "0x03D054",
          "0x03F994",
          "0x0003D4",
          "0x003CC2",
          "0x003CD4",
          "0x003CE0",
          "0x003CEE"
        ]
      },
      {
        "name": "pre003cf3",
        "hit": 11,
        "block": 32709,
        "pc": "0x003CF3",
        "previous": "0x003CEE",
        "sp": "0xD1A84E",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
          "0x03D033",
          "0x03D038",
          "0x03D044",
          "0x03D04C",
          "0x03D054",
          "0x03F994",
          "0x0003D4",
          "0x003CC2",
          "0x003CD4",
          "0x003CE0",
          "0x003CEE",
          "0x003CF3"
        ]
      },
      {
        "name": "pre003cd4",
        "hit": 12,
        "block": 33519,
        "pc": "0x003CD4",
        "previous": "0x003CC2",
        "sp": "0xD1A842",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
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
          "0x003CD4"
        ]
      },
      {
        "name": "pre003ce0",
        "hit": 12,
        "block": 33520,
        "pc": "0x003CE0",
        "previous": "0x003CD4",
        "sp": "0xD1A842",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
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
          "0x003CE0"
        ]
      },
      {
        "name": "pre003cee",
        "hit": 12,
        "block": 33521,
        "pc": "0x003CEE",
        "previous": "0x003CE0",
        "sp": "0xD1A842",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
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
          "0x003CEE"
        ]
      },
      {
        "name": "pre003cf3",
        "hit": 12,
        "block": 33522,
        "pc": "0x003CF3",
        "previous": "0x003CEE",
        "sp": "0xD1A842",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
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
          "0x003CF3"
        ]
      },
      {
        "name": "pre003cd4",
        "hit": 13,
        "block": 33707,
        "pc": "0x003CD4",
        "previous": "0x003CC2",
        "sp": "0xD1A842",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
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
          "0x003CD4"
        ]
      },
      {
        "name": "pre003ce0",
        "hit": 13,
        "block": 33708,
        "pc": "0x003CE0",
        "previous": "0x003CD4",
        "sp": "0xD1A842",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
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
          "0x003CE0"
        ]
      },
      {
        "name": "pre003cee",
        "hit": 13,
        "block": 33709,
        "pc": "0x003CEE",
        "previous": "0x003CE0",
        "sp": "0xD1A842",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
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
          "0x003CEE"
        ]
      },
      {
        "name": "pre003cf3",
        "hit": 13,
        "block": 33710,
        "pc": "0x003CF3",
        "previous": "0x003CEE",
        "sp": "0xD1A842",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
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
          "0x003CF3"
        ]
      },
      {
        "name": "pre003cd4",
        "hit": 14,
        "block": 46164,
        "pc": "0x003CD4",
        "previous": "0x003CC2",
        "sp": "0xD1A851",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
          "0x03CFE5",
          "0x03CFEA",
          "0x03D029",
          "0x03D033",
          "0x03D038",
          "0x03D044",
          "0x03D04C",
          "0x03D054",
          "0x03F994",
          "0x0003D4",
          "0x003CC2",
          "0x003CD4"
        ]
      },
      {
        "name": "pre003ce0",
        "hit": 14,
        "block": 46165,
        "pc": "0x003CE0",
        "previous": "0x003CD4",
        "sp": "0xD1A851",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
          "0x03CFEA",
          "0x03D029",
          "0x03D033",
          "0x03D038",
          "0x03D044",
          "0x03D04C",
          "0x03D054",
          "0x03F994",
          "0x0003D4",
          "0x003CC2",
          "0x003CD4",
          "0x003CE0"
        ]
      },
      {
        "name": "pre003cee",
        "hit": 14,
        "block": 46166,
        "pc": "0x003CEE",
        "previous": "0x003CE0",
        "sp": "0xD1A851",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
          "0x03D029",
          "0x03D033",
          "0x03D038",
          "0x03D044",
          "0x03D04C",
          "0x03D054",
          "0x03F994",
          "0x0003D4",
          "0x003CC2",
          "0x003CD4",
          "0x003CE0",
          "0x003CEE"
        ]
      },
      {
        "name": "pre003cf3",
        "hit": 14,
        "block": 46167,
        "pc": "0x003CF3",
        "previous": "0x003CEE",
        "sp": "0xD1A851",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
          "0x03D033",
          "0x03D038",
          "0x03D044",
          "0x03D04C",
          "0x03D054",
          "0x03F994",
          "0x0003D4",
          "0x003CC2",
          "0x003CD4",
          "0x003CE0",
          "0x003CEE",
          "0x003CF3"
        ]
      },
      {
        "name": "pre003cd4",
        "hit": 15,
        "block": 46306,
        "pc": "0x003CD4",
        "previous": "0x003CC2",
        "sp": "0xD1A83F",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
          "0x03CFE5",
          "0x03CFEA",
          "0x03D029",
          "0x03D033",
          "0x03D038",
          "0x03D044",
          "0x03D04C",
          "0x03D054",
          "0x03F994",
          "0x0003D4",
          "0x003CC2",
          "0x003CD4"
        ]
      },
      {
        "name": "pre003ce0",
        "hit": 15,
        "block": 46307,
        "pc": "0x003CE0",
        "previous": "0x003CD4",
        "sp": "0xD1A83F",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
          "0x03CFEA",
          "0x03D029",
          "0x03D033",
          "0x03D038",
          "0x03D044",
          "0x03D04C",
          "0x03D054",
          "0x03F994",
          "0x0003D4",
          "0x003CC2",
          "0x003CD4",
          "0x003CE0"
        ]
      },
      {
        "name": "pre003cee",
        "hit": 15,
        "block": 46308,
        "pc": "0x003CEE",
        "previous": "0x003CE0",
        "sp": "0xD1A83F",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
          "0x03D029",
          "0x03D033",
          "0x03D038",
          "0x03D044",
          "0x03D04C",
          "0x03D054",
          "0x03F994",
          "0x0003D4",
          "0x003CC2",
          "0x003CD4",
          "0x003CE0",
          "0x003CEE"
        ]
      },
      {
        "name": "pre003cf3",
        "hit": 15,
        "block": 46309,
        "pc": "0x003CF3",
        "previous": "0x003CEE",
        "sp": "0xD1A83F",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
          "0x03D033",
          "0x03D038",
          "0x03D044",
          "0x03D04C",
          "0x03D054",
          "0x03F994",
          "0x0003D4",
          "0x003CC2",
          "0x003CD4",
          "0x003CE0",
          "0x003CEE",
          "0x003CF3"
        ]
      },
      {
        "name": "pre003cd4",
        "hit": 16,
        "block": 46923,
        "pc": "0x003CD4",
        "previous": "0x003CC2",
        "sp": "0xD1A845",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
          "0x03CFE5",
          "0x03CFEA",
          "0x03D029",
          "0x03D033",
          "0x03D038",
          "0x03D044",
          "0x03D04C",
          "0x03D054",
          "0x03F994",
          "0x0003D4",
          "0x003CC2",
          "0x003CD4"
        ]
      },
      {
        "name": "pre003ce0",
        "hit": 16,
        "block": 46924,
        "pc": "0x003CE0",
        "previous": "0x003CD4",
        "sp": "0xD1A845",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
          "0x03CFEA",
          "0x03D029",
          "0x03D033",
          "0x03D038",
          "0x03D044",
          "0x03D04C",
          "0x03D054",
          "0x03F994",
          "0x0003D4",
          "0x003CC2",
          "0x003CD4",
          "0x003CE0"
        ]
      },
      {
        "name": "pre003cee",
        "hit": 16,
        "block": 46925,
        "pc": "0x003CEE",
        "previous": "0x003CE0",
        "sp": "0xD1A845",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
          "0x03D029",
          "0x03D033",
          "0x03D038",
          "0x03D044",
          "0x03D04C",
          "0x03D054",
          "0x03F994",
          "0x0003D4",
          "0x003CC2",
          "0x003CD4",
          "0x003CE0",
          "0x003CEE"
        ]
      },
      {
        "name": "pre003cf3",
        "hit": 16,
        "block": 46926,
        "pc": "0x003CF3",
        "previous": "0x003CEE",
        "sp": "0xD1A845",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
          "0x03D033",
          "0x03D038",
          "0x03D044",
          "0x03D04C",
          "0x03D054",
          "0x03F994",
          "0x0003D4",
          "0x003CC2",
          "0x003CD4",
          "0x003CE0",
          "0x003CEE",
          "0x003CF3"
        ]
      },
      {
        "name": "pre003cd4",
        "hit": 17,
        "block": 47106,
        "pc": "0x003CD4",
        "previous": "0x003CC2",
        "sp": "0xD1A82C",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
          "0x03CFE5",
          "0x03CFEA",
          "0x03D029",
          "0x03D033",
          "0x03D038",
          "0x03D044",
          "0x03D04C",
          "0x03D054",
          "0x03F994",
          "0x0003D4",
          "0x003CC2",
          "0x003CD4"
        ]
      },
      {
        "name": "pre003ce0",
        "hit": 17,
        "block": 47107,
        "pc": "0x003CE0",
        "previous": "0x003CD4",
        "sp": "0xD1A82C",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
          "0x03CFEA",
          "0x03D029",
          "0x03D033",
          "0x03D038",
          "0x03D044",
          "0x03D04C",
          "0x03D054",
          "0x03F994",
          "0x0003D4",
          "0x003CC2",
          "0x003CD4",
          "0x003CE0"
        ]
      },
      {
        "name": "pre003cee",
        "hit": 17,
        "block": 47108,
        "pc": "0x003CEE",
        "previous": "0x003CE0",
        "sp": "0xD1A82C",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
          "0x03D029",
          "0x03D033",
          "0x03D038",
          "0x03D044",
          "0x03D04C",
          "0x03D054",
          "0x03F994",
          "0x0003D4",
          "0x003CC2",
          "0x003CD4",
          "0x003CE0",
          "0x003CEE"
        ]
      },
      {
        "name": "pre003cf3",
        "hit": 17,
        "block": 47109,
        "pc": "0x003CF3",
        "previous": "0x003CEE",
        "sp": "0xD1A82C",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
          "0x03D033",
          "0x03D038",
          "0x03D044",
          "0x03D04C",
          "0x03D054",
          "0x03F994",
          "0x0003D4",
          "0x003CC2",
          "0x003CD4",
          "0x003CE0",
          "0x003CEE",
          "0x003CF3"
        ]
      },
      {
        "name": "pre003cd4",
        "hit": 18,
        "block": 47331,
        "pc": "0x003CD4",
        "previous": "0x003CC2",
        "sp": "0xD1A82C",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
          "0x03CFE5",
          "0x03CFEA",
          "0x03D029",
          "0x03D033",
          "0x03D038",
          "0x03D044",
          "0x03D04C",
          "0x03D054",
          "0x03F994",
          "0x0003D4",
          "0x003CC2",
          "0x003CD4"
        ]
      },
      {
        "name": "pre003ce0",
        "hit": 18,
        "block": 47332,
        "pc": "0x003CE0",
        "previous": "0x003CD4",
        "sp": "0xD1A82C",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
          "0x03CFEA",
          "0x03D029",
          "0x03D033",
          "0x03D038",
          "0x03D044",
          "0x03D04C",
          "0x03D054",
          "0x03F994",
          "0x0003D4",
          "0x003CC2",
          "0x003CD4",
          "0x003CE0"
        ]
      },
      {
        "name": "pre003cee",
        "hit": 18,
        "block": 47333,
        "pc": "0x003CEE",
        "previous": "0x003CE0",
        "sp": "0xD1A82C",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
          "0x03D029",
          "0x03D033",
          "0x03D038",
          "0x03D044",
          "0x03D04C",
          "0x03D054",
          "0x03F994",
          "0x0003D4",
          "0x003CC2",
          "0x003CD4",
          "0x003CE0",
          "0x003CEE"
        ]
      },
      {
        "name": "pre003cf3",
        "hit": 18,
        "block": 47334,
        "pc": "0x003CF3",
        "previous": "0x003CEE",
        "sp": "0xD1A82C",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
          "0x03D033",
          "0x03D038",
          "0x03D044",
          "0x03D04C",
          "0x03D054",
          "0x03F994",
          "0x0003D4",
          "0x003CC2",
          "0x003CD4",
          "0x003CE0",
          "0x003CEE",
          "0x003CF3"
        ]
      },
      {
        "name": "pre003cd4",
        "hit": 19,
        "block": 47506,
        "pc": "0x003CD4",
        "previous": "0x003CC2",
        "sp": "0xD1A823",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
          "0x03CFE5",
          "0x03CFEA",
          "0x03D029",
          "0x03D033",
          "0x03D038",
          "0x03D044",
          "0x03D04C",
          "0x03D054",
          "0x03F994",
          "0x0003D4",
          "0x003CC2",
          "0x003CD4"
        ]
      },
      {
        "name": "pre003ce0",
        "hit": 19,
        "block": 47507,
        "pc": "0x003CE0",
        "previous": "0x003CD4",
        "sp": "0xD1A823",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
          "0x03CFEA",
          "0x03D029",
          "0x03D033",
          "0x03D038",
          "0x03D044",
          "0x03D04C",
          "0x03D054",
          "0x03F994",
          "0x0003D4",
          "0x003CC2",
          "0x003CD4",
          "0x003CE0"
        ]
      },
      {
        "name": "pre003cee",
        "hit": 19,
        "block": 47508,
        "pc": "0x003CEE",
        "previous": "0x003CE0",
        "sp": "0xD1A823",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
          "0x03D029",
          "0x03D033",
          "0x03D038",
          "0x03D044",
          "0x03D04C",
          "0x03D054",
          "0x03F994",
          "0x0003D4",
          "0x003CC2",
          "0x003CD4",
          "0x003CE0",
          "0x003CEE"
        ]
      },
      {
        "name": "pre003cf3",
        "hit": 19,
        "block": 47509,
        "pc": "0x003CF3",
        "previous": "0x003CEE",
        "sp": "0xD1A823",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
          "0x03D033",
          "0x03D038",
          "0x03D044",
          "0x03D04C",
          "0x03D054",
          "0x03F994",
          "0x0003D4",
          "0x003CC2",
          "0x003CD4",
          "0x003CE0",
          "0x003CEE",
          "0x003CF3"
        ]
      },
      {
        "name": "pre003cd4",
        "hit": 20,
        "block": 47881,
        "pc": "0x003CD4",
        "previous": "0x003CC2",
        "sp": "0xF9DCFF",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
          "0x03CFE5",
          "0x03CFEA",
          "0x03D029",
          "0x03D033",
          "0x03D038",
          "0x03D044",
          "0x03D04C",
          "0x03D054",
          "0x03F994",
          "0x0003D4",
          "0x003CC2",
          "0x003CD4"
        ]
      },
      {
        "name": "pre003ce0",
        "hit": 20,
        "block": 47882,
        "pc": "0x003CE0",
        "previous": "0x003CD4",
        "sp": "0xF9DCFF",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
          "0x03CFEA",
          "0x03D029",
          "0x03D033",
          "0x03D038",
          "0x03D044",
          "0x03D04C",
          "0x03D054",
          "0x03F994",
          "0x0003D4",
          "0x003CC2",
          "0x003CD4",
          "0x003CE0"
        ]
      },
      {
        "name": "pre003cee",
        "hit": 20,
        "block": 47883,
        "pc": "0x003CEE",
        "previous": "0x003CE0",
        "sp": "0xF9DCFF",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
          "0x03D029",
          "0x03D033",
          "0x03D038",
          "0x03D044",
          "0x03D04C",
          "0x03D054",
          "0x03F994",
          "0x0003D4",
          "0x003CC2",
          "0x003CD4",
          "0x003CE0",
          "0x003CEE"
        ]
      },
      {
        "name": "pre003cf3",
        "hit": 20,
        "block": 47884,
        "pc": "0x003CF3",
        "previous": "0x003CEE",
        "sp": "0xF9DCFF",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
          "0x03D033",
          "0x03D038",
          "0x03D044",
          "0x03D04C",
          "0x03D054",
          "0x03F994",
          "0x0003D4",
          "0x003CC2",
          "0x003CD4",
          "0x003CE0",
          "0x003CEE",
          "0x003CF3"
        ]
      },
      {
        "name": "pre0028d1",
        "hit": 1,
        "block": 50201,
        "pc": "0x0028D1",
        "previous": "0x0013F8",
        "sp": "0xD1A87B",
        "top": "0x0013FC",
        "stackTail": [
          "0x0013F8"
        ],
        "recentTail": [
          "0x003C1F",
          "0x003C27",
          "0x0061E5",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C42",
          "0x003B0D",
          "0x003B17",
          "0x0013F4",
          "0x0013F8",
          "0x0028D1"
        ]
      },
      {
        "name": "pre0013fc",
        "hit": 1,
        "block": 50202,
        "pc": "0x0013FC",
        "previous": "0x0028D1",
        "sp": "0xD1A87E",
        "top": "0x000000",
        "stackTail": [],
        "recentTail": [
          "0x003C27",
          "0x0061E5",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C42",
          "0x003B0D",
          "0x003B17",
          "0x0013F4",
          "0x0013F8",
          "0x0028D1",
          "0x0013FC"
        ]
      },
      {
        "name": "pre001405",
        "hit": 1,
        "block": 50203,
        "pc": "0x001405",
        "previous": "0x0013FC",
        "sp": "0xD1A87E",
        "top": "0x000000",
        "stackTail": [],
        "recentTail": [
          "0x0061E5",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C42",
          "0x003B0D",
          "0x003B17",
          "0x0013F4",
          "0x0013F8",
          "0x0028D1",
          "0x0013FC",
          "0x001405"
        ]
      },
      {
        "name": "pre003cbc",
        "hit": 1,
        "block": 50204,
        "pc": "0x003CBC",
        "previous": "0x001405",
        "sp": "0xD1A87B",
        "top": "0x001409",
        "stackTail": [
          "0x001405"
        ],
        "recentTail": [
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C42",
          "0x003B0D",
          "0x003B17",
          "0x0013F4",
          "0x0013F8",
          "0x0028D1",
          "0x0013FC",
          "0x001405",
          "0x003CBC"
        ]
      },
      {
        "name": "pre003cc6",
        "hit": 1,
        "block": 50205,
        "pc": "0x003CC6",
        "previous": "0x003CBC",
        "sp": "0xD1A87B",
        "top": "0x001409",
        "stackTail": [
          "0x001405"
        ],
        "recentTail": [
          "0x0061FD",
          "0x006202",
          "0x003C42",
          "0x003B0D",
          "0x003B17",
          "0x0013F4",
          "0x0013F8",
          "0x0028D1",
          "0x0013FC",
          "0x001405",
          "0x003CBC",
          "0x003CC6"
        ]
      },
      {
        "name": "pre003cd4",
        "hit": 21,
        "block": 50206,
        "pc": "0x003CD4",
        "previous": "0x003CC6",
        "sp": "0xD1A87B",
        "top": "0x001409",
        "stackTail": [
          "0x001405"
        ],
        "recentTail": [
          "0x006202",
          "0x003C42",
          "0x003B0D",
          "0x003B17",
          "0x0013F4",
          "0x0013F8",
          "0x0028D1",
          "0x0013FC",
          "0x001405",
          "0x003CBC",
          "0x003CC6",
          "0x003CD4"
        ]
      },
      {
        "name": "pre003ce0",
        "hit": 21,
        "block": 50207,
        "pc": "0x003CE0",
        "previous": "0x003CD4",
        "sp": "0xD1A87B",
        "top": "0x001409",
        "stackTail": [
          "0x001405"
        ],
        "recentTail": [
          "0x003C42",
          "0x003B0D",
          "0x003B17",
          "0x0013F4",
          "0x0013F8",
          "0x0028D1",
          "0x0013FC",
          "0x001405",
          "0x003CBC",
          "0x003CC6",
          "0x003CD4",
          "0x003CE0"
        ]
      },
      {
        "name": "pre003cee",
        "hit": 21,
        "block": 50208,
        "pc": "0x003CEE",
        "previous": "0x003CE0",
        "sp": "0xD1A87B",
        "top": "0x001409",
        "stackTail": [
          "0x001405"
        ],
        "recentTail": [
          "0x003B0D",
          "0x003B17",
          "0x0013F4",
          "0x0013F8",
          "0x0028D1",
          "0x0013FC",
          "0x001405",
          "0x003CBC",
          "0x003CC6",
          "0x003CD4",
          "0x003CE0",
          "0x003CEE"
        ]
      },
      {
        "name": "pre003cf3",
        "hit": 21,
        "block": 50209,
        "pc": "0x003CF3",
        "previous": "0x003CEE",
        "sp": "0xD1A87B",
        "top": "0x001409",
        "stackTail": [
          "0x001405"
        ],
        "recentTail": [
          "0x003B17",
          "0x0013F4",
          "0x0013F8",
          "0x0028D1",
          "0x0013FC",
          "0x001405",
          "0x003CBC",
          "0x003CC6",
          "0x003CD4",
          "0x003CE0",
          "0x003CEE",
          "0x003CF3"
        ]
      },
      {
        "name": "pre001428",
        "hit": 1,
        "block": 50213,
        "pc": "0x001428",
        "previous": "0x0008BB",
        "sp": "0xD1A87E",
        "top": "0x000000",
        "stackTail": [],
        "recentTail": [
          "0x0013FC",
          "0x001405",
          "0x003CBC",
          "0x003CC6",
          "0x003CD4",
          "0x003CE0",
          "0x003CEE",
          "0x003CF3",
          "0x001409",
          "0x001424",
          "0x0008BB",
          "0x001428"
        ]
      },
      {
        "name": "pre00142c",
        "hit": 1,
        "block": 50214,
        "pc": "0x00142C",
        "previous": "0x001428",
        "sp": "0xD1A87E",
        "top": "0x000000",
        "stackTail": [],
        "recentTail": [
          "0x001405",
          "0x003CBC",
          "0x003CC6",
          "0x003CD4",
          "0x003CE0",
          "0x003CEE",
          "0x003CF3",
          "0x001409",
          "0x001424",
          "0x0008BB",
          "0x001428",
          "0x00142C"
        ]
      },
      {
        "name": "seed000721",
        "hit": 1,
        "block": 50215,
        "pc": "0x000721",
        "previous": "0x00142C",
        "sp": "0xD1A87E",
        "top": "0x000000",
        "stackTail": [],
        "recentTail": [
          "0x003CBC",
          "0x003CC6",
          "0x003CD4",
          "0x003CE0",
          "0x003CEE",
          "0x003CF3",
          "0x001409",
          "0x001424",
          "0x0008BB",
          "0x001428",
          "0x00142C",
          "0x000721"
        ]
      },
      {
        "name": "seed013d00",
        "hit": 1,
        "block": 50216,
        "pc": "0x013D00",
        "previous": "0x000721",
        "sp": "0xD1A87B",
        "top": "0x000725",
        "stackTail": [
          "0x000721"
        ],
        "recentTail": [
          "0x003CC6",
          "0x003CD4",
          "0x003CE0",
          "0x003CEE",
          "0x003CF3",
          "0x001409",
          "0x001424",
          "0x0008BB",
          "0x001428",
          "0x00142C",
          "0x000721",
          "0x013D00"
        ]
      },
      {
        "name": "seed005ba6",
        "hit": 1,
        "block": 50217,
        "pc": "0x005BA6",
        "previous": "0x013D00",
        "sp": "0xD1A86F",
        "top": "0x013D11",
        "stackTail": [
          "0x000721",
          "0x013D00"
        ],
        "recentTail": [
          "0x003CD4",
          "0x003CE0",
          "0x003CEE",
          "0x003CF3",
          "0x001409",
          "0x001424",
          "0x0008BB",
          "0x001428",
          "0x00142C",
          "0x000721",
          "0x013D00",
          "0x005BA6"
        ]
      },
      {
        "name": "seed013d11",
        "hit": 1,
        "block": 50218,
        "pc": "0x013D11",
        "previous": "0x005BA6",
        "sp": "0xD1A872",
        "top": "0x000000",
        "stackTail": [
          "0x000721"
        ],
        "recentTail": [
          "0x003CE0",
          "0x003CEE",
          "0x003CF3",
          "0x001409",
          "0x001424",
          "0x0008BB",
          "0x001428",
          "0x00142C",
          "0x000721",
          "0x013D00",
          "0x005BA6",
          "0x013D11"
        ]
      },
      {
        "name": "display0059c6",
        "hit": 1,
        "block": 50219,
        "pc": "0x0059C6",
        "previous": "0x013D11",
        "sp": "0xD1A86F",
        "top": "0x013D1D",
        "stackTail": [
          "0x000721",
          "0x013D11"
        ],
        "recentTail": [
          "0x003CEE",
          "0x003CF3",
          "0x001409",
          "0x001424",
          "0x0008BB",
          "0x001428",
          "0x00142C",
          "0x000721",
          "0x013D00",
          "0x005BA6",
          "0x013D11",
          "0x0059C6"
        ]
      },
      {
        "name": "display0059c6",
        "hit": 2,
        "block": 50305,
        "pc": "0x0059C6",
        "previous": "0x013D19",
        "sp": "0xD1A86F",
        "top": "0x013D1D",
        "stackTail": [
          "0x013D19"
        ],
        "recentTail": [
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005B92",
          "0x005A19",
          "0x0059DA",
          "0x0059E6",
          "0x013D1D",
          "0x013D19",
          "0x0059C6"
        ]
      },
      {
        "name": "display0059c6",
        "hit": 3,
        "block": 50391,
        "pc": "0x0059C6",
        "previous": "0x013D19",
        "sp": "0xD1A86F",
        "top": "0x013D1D",
        "stackTail": [
          "0x013D19"
        ],
        "recentTail": [
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005B92",
          "0x005A19",
          "0x0059DA",
          "0x0059E6",
          "0x013D1D",
          "0x013D19",
          "0x0059C6"
        ]
      },
      {
        "name": "display0059c6",
        "hit": 4,
        "block": 50477,
        "pc": "0x0059C6",
        "previous": "0x013D19",
        "sp": "0xD1A86F",
        "top": "0x013D1D",
        "stackTail": [
          "0x013D19"
        ],
        "recentTail": [
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005B92",
          "0x005A19",
          "0x0059DA",
          "0x0059E6",
          "0x013D1D",
          "0x013D19",
          "0x0059C6"
        ]
      },
      {
        "name": "display0059c6",
        "hit": 5,
        "block": 50563,
        "pc": "0x0059C6",
        "previous": "0x013D19",
        "sp": "0xD1A86F",
        "top": "0x013D1D",
        "stackTail": [
          "0x013D19"
        ],
        "recentTail": [
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005B92",
          "0x005A19",
          "0x0059DA",
          "0x0059E6",
          "0x013D1D",
          "0x013D19",
          "0x0059C6"
        ]
      },
      {
        "name": "display0059c6",
        "hit": 6,
        "block": 50649,
        "pc": "0x0059C6",
        "previous": "0x013D19",
        "sp": "0xD1A86F",
        "top": "0x013D1D",
        "stackTail": [
          "0x013D19"
        ],
        "recentTail": [
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005B92",
          "0x005A19",
          "0x0059DA",
          "0x0059E6",
          "0x013D1D",
          "0x013D19",
          "0x0059C6"
        ]
      },
      {
        "name": "display0059c6",
        "hit": 7,
        "block": 50735,
        "pc": "0x0059C6",
        "previous": "0x013D19",
        "sp": "0xD1A86F",
        "top": "0x013D1D",
        "stackTail": [
          "0x013D19"
        ],
        "recentTail": [
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005B92",
          "0x005A19",
          "0x0059DA",
          "0x0059E6",
          "0x013D1D",
          "0x013D19",
          "0x0059C6"
        ]
      },
      {
        "name": "display0059c6",
        "hit": 8,
        "block": 50821,
        "pc": "0x0059C6",
        "previous": "0x013D19",
        "sp": "0xD1A86F",
        "top": "0x013D1D",
        "stackTail": [
          "0x013D19"
        ],
        "recentTail": [
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005B92",
          "0x005A19",
          "0x0059DA",
          "0x0059E6",
          "0x013D1D",
          "0x013D19",
          "0x0059C6"
        ]
      },
      {
        "name": "display0059c6",
        "hit": 9,
        "block": 50907,
        "pc": "0x0059C6",
        "previous": "0x013D19",
        "sp": "0xD1A86F",
        "top": "0x013D1D",
        "stackTail": [
          "0x013D19"
        ],
        "recentTail": [
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005B92",
          "0x005A19",
          "0x0059DA",
          "0x0059E6",
          "0x013D1D",
          "0x013D19",
          "0x0059C6"
        ]
      },
      {
        "name": "display0059c6",
        "hit": 10,
        "block": 50993,
        "pc": "0x0059C6",
        "previous": "0x013D19",
        "sp": "0xD1A86F",
        "top": "0x013D1D",
        "stackTail": [
          "0x013D19"
        ],
        "recentTail": [
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005B92",
          "0x005A19",
          "0x0059DA",
          "0x0059E6",
          "0x013D1D",
          "0x013D19",
          "0x0059C6"
        ]
      },
      {
        "name": "display0059c6",
        "hit": 11,
        "block": 51079,
        "pc": "0x0059C6",
        "previous": "0x013D19",
        "sp": "0xD1A86F",
        "top": "0x013D1D",
        "stackTail": [
          "0x013D19"
        ],
        "recentTail": [
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005B92",
          "0x005A19",
          "0x0059DA",
          "0x0059E6",
          "0x013D1D",
          "0x013D19",
          "0x0059C6"
        ]
      },
      {
        "name": "display0059c6",
        "hit": 12,
        "block": 51165,
        "pc": "0x0059C6",
        "previous": "0x013D19",
        "sp": "0xD1A86F",
        "top": "0x013D1D",
        "stackTail": [
          "0x013D19"
        ],
        "recentTail": [
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005B92",
          "0x005A19",
          "0x0059DA",
          "0x0059E6",
          "0x013D1D",
          "0x013D19",
          "0x0059C6"
        ]
      },
      {
        "name": "display0059c6",
        "hit": 13,
        "block": 51251,
        "pc": "0x0059C6",
        "previous": "0x013D19",
        "sp": "0xD1A86F",
        "top": "0x013D1D",
        "stackTail": [
          "0x013D19"
        ],
        "recentTail": [
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005B92",
          "0x005A19",
          "0x0059DA",
          "0x0059E6",
          "0x013D1D",
          "0x013D19",
          "0x0059C6"
        ]
      },
      {
        "name": "display0059c6",
        "hit": 14,
        "block": 51337,
        "pc": "0x0059C6",
        "previous": "0x013D19",
        "sp": "0xD1A86F",
        "top": "0x013D1D",
        "stackTail": [
          "0x013D19"
        ],
        "recentTail": [
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005B92",
          "0x005A19",
          "0x0059DA",
          "0x0059E6",
          "0x013D1D",
          "0x013D19",
          "0x0059C6"
        ]
      },
      {
        "name": "display0059c6",
        "hit": 15,
        "block": 51425,
        "pc": "0x0059C6",
        "previous": "0x0059F3",
        "sp": "0xD1A866",
        "top": "0x0059F7",
        "stackTail": [
          "0x013D1F",
          "0x0059E9",
          "0x0059F3"
        ],
        "recentTail": [
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005B92",
          "0x005A19",
          "0x0059DA",
          "0x0059E6",
          "0x013D1D",
          "0x013D1F",
          "0x0059E9",
          "0x0059F3",
          "0x0059C6"
        ]
      },
      {
        "name": "display0059c6",
        "hit": 16,
        "block": 51512,
        "pc": "0x0059C6",
        "previous": "0x0059F3",
        "sp": "0xD1A866",
        "top": "0x0059F7",
        "stackTail": [
          "0x0059F3"
        ],
        "recentTail": [
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005B92",
          "0x005A19",
          "0x0059DA",
          "0x0059E6",
          "0x0059F7",
          "0x0059ED",
          "0x0059F3",
          "0x0059C6"
        ]
      },
      {
        "name": "display0059c6",
        "hit": 17,
        "block": 51599,
        "pc": "0x0059C6",
        "previous": "0x0059F3",
        "sp": "0xD1A866",
        "top": "0x0059F7",
        "stackTail": [
          "0x0059F3"
        ],
        "recentTail": [
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005B92",
          "0x005A19",
          "0x0059DA",
          "0x0059E6",
          "0x0059F7",
          "0x0059ED",
          "0x0059F3",
          "0x0059C6"
        ]
      },
      {
        "name": "display0059c6",
        "hit": 18,
        "block": 51686,
        "pc": "0x0059C6",
        "previous": "0x0059F3",
        "sp": "0xD1A866",
        "top": "0x0059F7",
        "stackTail": [
          "0x0059F3"
        ],
        "recentTail": [
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005B92",
          "0x005A19",
          "0x0059DA",
          "0x0059E6",
          "0x0059F7",
          "0x0059ED",
          "0x0059F3",
          "0x0059C6"
        ]
      },
      {
        "name": "display0059c6",
        "hit": 19,
        "block": 51773,
        "pc": "0x0059C6",
        "previous": "0x0059F3",
        "sp": "0xD1A866",
        "top": "0x0059F7",
        "stackTail": [
          "0x0059F3"
        ],
        "recentTail": [
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005B92",
          "0x005A19",
          "0x0059DA",
          "0x0059E6",
          "0x0059F7",
          "0x0059ED",
          "0x0059F3",
          "0x0059C6"
        ]
      },
      {
        "name": "display0059c6",
        "hit": 20,
        "block": 51860,
        "pc": "0x0059C6",
        "previous": "0x0059F3",
        "sp": "0xD1A866",
        "top": "0x0059F7",
        "stackTail": [
          "0x0059F3"
        ],
        "recentTail": [
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005B92",
          "0x005A19",
          "0x0059DA",
          "0x0059E6",
          "0x0059F7",
          "0x0059ED",
          "0x0059F3",
          "0x0059C6"
        ]
      }
    ],
    "tailTransitions": [
      {
        "name": "display005b92",
        "hit": 1,
        "block": 50299,
        "pc": "0x005B92",
        "previous": "0x005B4B",
        "sp": "0xD1A857",
        "top": "0x000000",
        "stackTail": [
          "0x000721",
          "0x013D11",
          "0x0059C6"
        ],
        "recentTail": [
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005B92"
        ]
      },
      {
        "name": "display005b92",
        "hit": 2,
        "block": 50385,
        "pc": "0x005B92",
        "previous": "0x005B4B",
        "sp": "0xD1A857",
        "top": "0x000000",
        "stackTail": [
          "0x013D19",
          "0x0059C6"
        ],
        "recentTail": [
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005B92"
        ]
      },
      {
        "name": "display005b92",
        "hit": 3,
        "block": 50471,
        "pc": "0x005B92",
        "previous": "0x005B4B",
        "sp": "0xD1A857",
        "top": "0x000000",
        "stackTail": [
          "0x013D19",
          "0x0059C6"
        ],
        "recentTail": [
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005B92"
        ]
      },
      {
        "name": "display005b92",
        "hit": 4,
        "block": 50557,
        "pc": "0x005B92",
        "previous": "0x005B4B",
        "sp": "0xD1A857",
        "top": "0x000000",
        "stackTail": [
          "0x013D19",
          "0x0059C6"
        ],
        "recentTail": [
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005B92"
        ]
      },
      {
        "name": "display005b92",
        "hit": 5,
        "block": 50643,
        "pc": "0x005B92",
        "previous": "0x005B4B",
        "sp": "0xD1A857",
        "top": "0x000000",
        "stackTail": [
          "0x013D19",
          "0x0059C6"
        ],
        "recentTail": [
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005B92"
        ]
      },
      {
        "name": "display005b92",
        "hit": 6,
        "block": 50729,
        "pc": "0x005B92",
        "previous": "0x005B4B",
        "sp": "0xD1A857",
        "top": "0x000000",
        "stackTail": [
          "0x013D19",
          "0x0059C6"
        ],
        "recentTail": [
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005B92"
        ]
      },
      {
        "name": "display005b92",
        "hit": 7,
        "block": 50815,
        "pc": "0x005B92",
        "previous": "0x005B4B",
        "sp": "0xD1A857",
        "top": "0x000000",
        "stackTail": [
          "0x013D19",
          "0x0059C6"
        ],
        "recentTail": [
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005B92"
        ]
      },
      {
        "name": "display005b92",
        "hit": 8,
        "block": 50901,
        "pc": "0x005B92",
        "previous": "0x005B4B",
        "sp": "0xD1A857",
        "top": "0x000000",
        "stackTail": [
          "0x013D19",
          "0x0059C6"
        ],
        "recentTail": [
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005B92"
        ]
      },
      {
        "name": "display005b92",
        "hit": 9,
        "block": 50987,
        "pc": "0x005B92",
        "previous": "0x005B4B",
        "sp": "0xD1A857",
        "top": "0x000000",
        "stackTail": [
          "0x013D19",
          "0x0059C6"
        ],
        "recentTail": [
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005B92"
        ]
      },
      {
        "name": "display005b92",
        "hit": 10,
        "block": 51073,
        "pc": "0x005B92",
        "previous": "0x005B4B",
        "sp": "0xD1A857",
        "top": "0x000000",
        "stackTail": [
          "0x013D19",
          "0x0059C6"
        ],
        "recentTail": [
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005B92"
        ]
      },
      {
        "name": "display005b92",
        "hit": 11,
        "block": 51159,
        "pc": "0x005B92",
        "previous": "0x005B4B",
        "sp": "0xD1A857",
        "top": "0x000000",
        "stackTail": [
          "0x013D19",
          "0x0059C6"
        ],
        "recentTail": [
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005B92"
        ]
      },
      {
        "name": "display005b92",
        "hit": 12,
        "block": 51245,
        "pc": "0x005B92",
        "previous": "0x005B4B",
        "sp": "0xD1A857",
        "top": "0x000000",
        "stackTail": [
          "0x013D19",
          "0x0059C6"
        ],
        "recentTail": [
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005B92"
        ]
      },
      {
        "name": "display005b92",
        "hit": 13,
        "block": 51331,
        "pc": "0x005B92",
        "previous": "0x005B4B",
        "sp": "0xD1A857",
        "top": "0x000000",
        "stackTail": [
          "0x013D19",
          "0x0059C6"
        ],
        "recentTail": [
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005B92"
        ]
      },
      {
        "name": "display005b92",
        "hit": 14,
        "block": 51417,
        "pc": "0x005B92",
        "previous": "0x005B4B",
        "sp": "0xD1A857",
        "top": "0x000000",
        "stackTail": [
          "0x013D19",
          "0x0059C6"
        ],
        "recentTail": [
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005B92"
        ]
      },
      {
        "name": "display005b92",
        "hit": 15,
        "block": 51505,
        "pc": "0x005B92",
        "previous": "0x005B4B",
        "sp": "0xD1A84E",
        "top": "0x000000",
        "stackTail": [
          "0x013D1F",
          "0x0059E9",
          "0x0059F3",
          "0x0059C6"
        ],
        "recentTail": [
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005B92"
        ]
      },
      {
        "name": "display005b92",
        "hit": 16,
        "block": 51592,
        "pc": "0x005B92",
        "previous": "0x005B4B",
        "sp": "0xD1A84E",
        "top": "0x000000",
        "stackTail": [
          "0x0059F3",
          "0x0059C6"
        ],
        "recentTail": [
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005B92"
        ]
      },
      {
        "name": "display005b92",
        "hit": 17,
        "block": 51679,
        "pc": "0x005B92",
        "previous": "0x005B4B",
        "sp": "0xD1A84E",
        "top": "0x000000",
        "stackTail": [
          "0x0059F3",
          "0x0059C6"
        ],
        "recentTail": [
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005B92"
        ]
      },
      {
        "name": "display005b92",
        "hit": 18,
        "block": 51766,
        "pc": "0x005B92",
        "previous": "0x005B4B",
        "sp": "0xD1A84E",
        "top": "0x000000",
        "stackTail": [
          "0x0059F3",
          "0x0059C6"
        ],
        "recentTail": [
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005B92"
        ]
      },
      {
        "name": "display005b92",
        "hit": 19,
        "block": 51853,
        "pc": "0x005B92",
        "previous": "0x005B4B",
        "sp": "0xD1A84E",
        "top": "0x000000",
        "stackTail": [
          "0x0059F3",
          "0x0059C6"
        ],
        "recentTail": [
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005B92"
        ]
      },
      {
        "name": "display005b92",
        "hit": 20,
        "block": 51940,
        "pc": "0x005B92",
        "previous": "0x005B4B",
        "sp": "0xD1A84E",
        "top": "0x000000",
        "stackTail": [
          "0x0059F3",
          "0x0059C6"
        ],
        "recentTail": [
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005B92"
        ]
      }
    ],
    "hotBlocks": [
      {
        "pc": "0x09EFDE",
        "count": 5760
      },
      {
        "pc": "0x0A19A4",
        "count": 5024
      },
      {
        "pc": "0x0A18C4",
        "count": 2912
      },
      {
        "pc": "0x0A1A83",
        "count": 2464
      },
      {
        "pc": "0x005AE8",
        "count": 1392
      },
      {
        "pc": "0x005B16",
        "count": 1392
      },
      {
        "pc": "0x005B4B",
        "count": 1392
      },
      {
        "pc": "0x005AB6",
        "count": 1305
      },
      {
        "pc": "0x0A1854",
        "count": 1040
      },
      {
        "pc": "0x0A187C",
        "count": 1040
      },
      {
        "pc": "0x0A188A",
        "count": 1040
      },
      {
        "pc": "0x0A189E",
        "count": 1040
      },
      {
        "pc": "0x0A191F",
        "count": 1040
      },
      {
        "pc": "0x0A1939",
        "count": 1040
      },
      {
        "pc": "0x0A1969",
        "count": 1040
      },
      {
        "pc": "0x0A1976",
        "count": 1040
      },
      {
        "pc": "0x0A1980",
        "count": 1040
      },
      {
        "pc": "0x0A19D7",
        "count": 1040
      },
      {
        "pc": "0x0A1A1D",
        "count": 1040
      },
      {
        "pc": "0x0A18A6",
        "count": 992
      },
      {
        "pc": "0x0A18AF",
        "count": 992
      },
      {
        "pc": "0x0A18C1",
        "count": 992
      },
      {
        "pc": "0x0A18CA",
        "count": 992
      },
      {
        "pc": "0x0A18E9",
        "count": 992
      },
      {
        "pc": "0x0A1988",
        "count": 992
      },
      {
        "pc": "0x0A1994",
        "count": 992
      },
      {
        "pc": "0x0A19AA",
        "count": 992
      },
      {
        "pc": "0x0A19B5",
        "count": 992
      },
      {
        "pc": "0x0A19B7",
        "count": 992
      },
      {
        "pc": "0x0A190D",
        "count": 560
      }
    ],
    "lastBlocks": [
      "0x001717",
      "0x001718",
      "0x005974",
      "0x005998",
      "0x005A8B",
      "0x005A48",
      "0x005A96",
      "0x005A53",
      "0x005AA2",
      "0x005AAE",
      "0x005AE8",
      "0x005B16",
      "0x005B4B",
      "0x005AB6",
      "0x005AE8",
      "0x005B16",
      "0x005B4B",
      "0x005AB6",
      "0x005AE8",
      "0x005B16",
      "0x005B4B",
      "0x005AB6",
      "0x005AE8",
      "0x005B16",
      "0x005B4B",
      "0x005AB6",
      "0x005AE8",
      "0x005B16",
      "0x005B4B",
      "0x005AB6",
      "0x005AE8",
      "0x005B16",
      "0x005B4B",
      "0x005AB6",
      "0x005AE8",
      "0x005B16",
      "0x005B4B",
      "0x005AB6",
      "0x005AE8",
      "0x005B16",
      "0x005B4B",
      "0x005AB6",
      "0x005AE8",
      "0x005B16",
      "0x005B4B",
      "0x005AB6",
      "0x005AE8",
      "0x005B16",
      "0x005B4B",
      "0x005AB6",
      "0x005AE8",
      "0x005B16",
      "0x005B4B",
      "0x005AB6",
      "0x005AE8",
      "0x005B16",
      "0x005B4B",
      "0x005AB6",
      "0x005AE8",
      "0x005B16",
      "0x005B4B",
      "0x005AB6",
      "0x005AE8",
      "0x005B16",
      "0x005B4B",
      "0x005AB6",
      "0x005AE8",
      "0x005B16",
      "0x005B4B",
      "0x005AB6",
      "0x005AE8",
      "0x005B16",
      "0x005B4B",
      "0x005B92",
      "0x005A19",
      "0x0059DA",
      "0x0059E6",
      "0x0017FC",
      "0x0064D0",
      "0x006CC6"
    ],
    "final": {
      "pc": "0x006CC6",
      "sp": "0xD1A834",
      "ix": "0xD1A866",
      "iy": "0xD00080",
      "af": "0x0A42",
      "bc": "0x020000",
      "de": "0x000240",
      "hl": "0x000000",
      "flags": {
        "z": true,
        "c": false,
        "n": true
      },
      "D00080": "0x00",
      "D0008D": "0x00",
      "D0009F": "0x00",
      "D00121": "0x000000",
      "D00124": "0x0A",
      "D00587": "0x00",
      "D0058C": "0x00",
      "D0058D": "0x00",
      "D0058E": "0x00",
      "D00596": "0x13",
      "D0059C": "0x0000DA",
      "D005A0": "0x85",
      "D007CA": "0x0585E9",
      "D008E0": "0xD1A863",
      "D0231A": "0x000000",
      "D0243A": "0x000000",
      "D02590": "0xD3FE81",
      "D0259A": "0xD3FE81",
      "vramPixels": 3031
    }
  },
  {
    "key": "Digit2",
    "result": {
      "steps": 20278,
      "termination": "after-low-frame-selection",
      "lastPc": "0x006CC6",
      "lastMode": "adl"
    },
    "counts": {
      "outerLoop08c331": 1,
      "cxMain0585e9": 2,
      "eolClear0a2150": 0,
      "bulkClear001879": 1,
      "pre0028d1": 1,
      "pre0013fc": 1,
      "pre001405": 1,
      "pre003cbc": 1,
      "pre003cc6": 1,
      "pre003cd4": 19,
      "pre003ce0": 19,
      "pre003cee": 19,
      "pre003cf3": 19,
      "pre001428": 1,
      "pre00142c": 1,
      "seed000721": 1,
      "seed013d00": 1,
      "seed005ba6": 1,
      "seed013d11": 1,
      "display0059c6": 87,
      "display005b92": 87,
      "transfer0017fc": 2,
      "low0064d0": 1,
      "low006cc6": 1,
      "token08f5e1": 0,
      "token090992": 0,
      "token08f54b": 0
    },
    "restorations": [
      {
        "label": "after-0x001879-bulk-clear",
        "atBlock": 10972,
        "atPc": "0x0018F8",
        "afterD007CA": "0x0585E9",
        "afterD008E0": "0xD1A863",
        "afterD02590": "0xD3FE81"
      }
    ],
    "immediatePredecessor": "0x00142C",
    "preSeedSamples": {
      "pre0028d1": {
        "block": 12619,
        "pc": "0x0028D1",
        "state": {
          "pc": "0x0028D1",
          "sp": "0xD1A87B",
          "ix": "0x000000",
          "iy": "0xD00080",
          "af": "0x0480",
          "bc": "0x000044",
          "de": "0xD65800",
          "hl": "0xD657FF",
          "flags": {
            "z": false,
            "c": false,
            "n": false
          },
          "D00080": "0x00",
          "D0008D": "0x00",
          "D0009F": "0x00",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000000",
          "D005A0": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D02590": "0xD3FE81",
          "D0259A": "0xD3FE81",
          "vramPixels": 0
        },
        "memory": {
          "low0059c": "0x095CC3",
          "low005a0": "0x06F3C3",
          "D00596": "0x00",
          "D0059C": "0x000000",
          "D005A0": "0x00",
          "D005A1": "0x00",
          "D005A2": "0x00",
          "ixBytes": [
            "0xF3",
            "0xED",
            "0x7E",
            "0x5B",
            "0xC3",
            "0x58",
            "0x06",
            "0x00",
            "0xF3",
            "0xED",
            "0x7E",
            "0x5B"
          ]
        },
        "stackTop": [
          {
            "addr": "0xD1A87B",
            "value": "0x0013FC"
          },
          {
            "addr": "0xD1A87E",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A881",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A884",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A887",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A88A",
            "value": "0x000000"
          }
        ],
        "ixFrame": {
          "IX-45": "0x000000",
          "IX-42": "0x000000",
          "IX-39": "0x000000",
          "IX-30": "0xB30000",
          "IX-27": "0x00D140",
          "IX-24": "0x00",
          "IX-20": "0x000000",
          "IX-17": "0x000000",
          "IX-11": "0x001C00",
          "IX-8": "0x00",
          "IX-7": "0xB3",
          "IX-6": "0x00D140",
          "IX-3": "0x000000",
          "IX+0": "0x7EEDF3",
          "IX+3": "0x58C35B",
          "IX+6": "0xF30006",
          "IX+9": "0x5B7EED"
        },
        "callStackTail": [
          "0x0013F8"
        ],
        "recentBlocks": [
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003BF5",
          "0x003BFD",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C0E",
          "0x003C16",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C1F",
          "0x003C27",
          "0x0061E5",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C42",
          "0x003B0D",
          "0x003B17",
          "0x0013F4",
          "0x0013F8",
          "0x0028D1"
        ]
      },
      "pre0013fc": {
        "block": 12620,
        "pc": "0x0013FC",
        "state": {
          "pc": "0x0013FC",
          "sp": "0xD1A87E",
          "ix": "0x000000",
          "iy": "0xD00080",
          "af": "0x0480",
          "bc": "0x000044",
          "de": "0xD65800",
          "hl": "0xD657FF",
          "flags": {
            "z": false,
            "c": false,
            "n": false
          },
          "D00080": "0x00",
          "D0008D": "0x00",
          "D0009F": "0x00",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000000",
          "D005A0": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D02590": "0xD3FE81",
          "D0259A": "0xD3FE81",
          "vramPixels": 0
        },
        "memory": {
          "low0059c": "0x095CC3",
          "low005a0": "0x06F3C3",
          "D00596": "0x00",
          "D0059C": "0x000000",
          "D005A0": "0x00",
          "D005A1": "0x00",
          "D005A2": "0x00",
          "ixBytes": [
            "0xF3",
            "0xED",
            "0x7E",
            "0x5B",
            "0xC3",
            "0x58",
            "0x06",
            "0x00",
            "0xF3",
            "0xED",
            "0x7E",
            "0x5B"
          ]
        },
        "stackTop": [
          {
            "addr": "0xD1A87E",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A881",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A884",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A887",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A88A",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A88D",
            "value": "0x008000"
          }
        ],
        "ixFrame": {
          "IX-45": "0x000000",
          "IX-42": "0x000000",
          "IX-39": "0x000000",
          "IX-30": "0xB30000",
          "IX-27": "0x00D140",
          "IX-24": "0x00",
          "IX-20": "0x000000",
          "IX-17": "0x000000",
          "IX-11": "0x001C00",
          "IX-8": "0x00",
          "IX-7": "0xB3",
          "IX-6": "0x00D140",
          "IX-3": "0x000000",
          "IX+0": "0x7EEDF3",
          "IX+3": "0x58C35B",
          "IX+6": "0xF30006",
          "IX+9": "0x5B7EED"
        },
        "callStackTail": [],
        "recentBlocks": [
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003BF5",
          "0x003BFD",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C0E",
          "0x003C16",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C1F",
          "0x003C27",
          "0x0061E5",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C42",
          "0x003B0D",
          "0x003B17",
          "0x0013F4",
          "0x0013F8",
          "0x0028D1",
          "0x0013FC"
        ]
      },
      "pre001405": {
        "block": 12621,
        "pc": "0x001405",
        "state": {
          "pc": "0x001405",
          "sp": "0xD1A87E",
          "ix": "0x000000",
          "iy": "0xD00080",
          "af": "0xEE54",
          "bc": "0x000044",
          "de": "0xD65800",
          "hl": "0xD657FF",
          "flags": {
            "z": true,
            "c": false,
            "n": false
          },
          "D00080": "0x00",
          "D0008D": "0x00",
          "D0009F": "0x00",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000000",
          "D005A0": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D02590": "0xD3FE81",
          "D0259A": "0xD3FE81",
          "vramPixels": 0
        },
        "memory": {
          "low0059c": "0x095CC3",
          "low005a0": "0x06F3C3",
          "D00596": "0x00",
          "D0059C": "0x000000",
          "D005A0": "0x00",
          "D005A1": "0x00",
          "D005A2": "0x00",
          "ixBytes": [
            "0xF3",
            "0xED",
            "0x7E",
            "0x5B",
            "0xC3",
            "0x58",
            "0x06",
            "0x00",
            "0xF3",
            "0xED",
            "0x7E",
            "0x5B"
          ]
        },
        "stackTop": [
          {
            "addr": "0xD1A87E",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A881",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A884",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A887",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A88A",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A88D",
            "value": "0x008000"
          }
        ],
        "ixFrame": {
          "IX-45": "0x000000",
          "IX-42": "0x000000",
          "IX-39": "0x000000",
          "IX-30": "0xB30000",
          "IX-27": "0x00D140",
          "IX-24": "0x00",
          "IX-20": "0x000000",
          "IX-17": "0x000000",
          "IX-11": "0x001C00",
          "IX-8": "0x00",
          "IX-7": "0xB3",
          "IX-6": "0x00D140",
          "IX-3": "0x000000",
          "IX+0": "0x7EEDF3",
          "IX+3": "0x58C35B",
          "IX+6": "0xF30006",
          "IX+9": "0x5B7EED"
        },
        "callStackTail": [],
        "recentBlocks": [
          "0x0061FD",
          "0x006202",
          "0x003BF5",
          "0x003BFD",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C0E",
          "0x003C16",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C1F",
          "0x003C27",
          "0x0061E5",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C42",
          "0x003B0D",
          "0x003B17",
          "0x0013F4",
          "0x0013F8",
          "0x0028D1",
          "0x0013FC",
          "0x001405"
        ]
      },
      "pre003cbc": {
        "block": 12622,
        "pc": "0x003CBC",
        "state": {
          "pc": "0x003CBC",
          "sp": "0xD1A87B",
          "ix": "0x000000",
          "iy": "0xD00080",
          "af": "0xEE54",
          "bc": "0x000044",
          "de": "0xD65800",
          "hl": "0xD657FF",
          "flags": {
            "z": true,
            "c": false,
            "n": false
          },
          "D00080": "0x00",
          "D0008D": "0x00",
          "D0009F": "0x00",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000000",
          "D005A0": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D02590": "0xD3FE81",
          "D0259A": "0xD3FE81",
          "vramPixels": 0
        },
        "memory": {
          "low0059c": "0x095CC3",
          "low005a0": "0x06F3C3",
          "D00596": "0x00",
          "D0059C": "0x000000",
          "D005A0": "0x00",
          "D005A1": "0x00",
          "D005A2": "0x00",
          "ixBytes": [
            "0xF3",
            "0xED",
            "0x7E",
            "0x5B",
            "0xC3",
            "0x58",
            "0x06",
            "0x00",
            "0xF3",
            "0xED",
            "0x7E",
            "0x5B"
          ]
        },
        "stackTop": [
          {
            "addr": "0xD1A87B",
            "value": "0x001409"
          },
          {
            "addr": "0xD1A87E",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A881",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A884",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A887",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A88A",
            "value": "0x000000"
          }
        ],
        "ixFrame": {
          "IX-45": "0x000000",
          "IX-42": "0x000000",
          "IX-39": "0x000000",
          "IX-30": "0xB30000",
          "IX-27": "0x00D140",
          "IX-24": "0x00",
          "IX-20": "0x000000",
          "IX-17": "0x000000",
          "IX-11": "0x001C00",
          "IX-8": "0x00",
          "IX-7": "0xB3",
          "IX-6": "0x00D140",
          "IX-3": "0x000000",
          "IX+0": "0x7EEDF3",
          "IX+3": "0x58C35B",
          "IX+6": "0xF30006",
          "IX+9": "0x5B7EED"
        },
        "callStackTail": [
          "0x001405"
        ],
        "recentBlocks": [
          "0x006202",
          "0x003BF5",
          "0x003BFD",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C0E",
          "0x003C16",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C1F",
          "0x003C27",
          "0x0061E5",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C42",
          "0x003B0D",
          "0x003B17",
          "0x0013F4",
          "0x0013F8",
          "0x0028D1",
          "0x0013FC",
          "0x001405",
          "0x003CBC"
        ]
      },
      "pre003cc6": {
        "block": 12623,
        "pc": "0x003CC6",
        "state": {
          "pc": "0x003CC6",
          "sp": "0xD1A87B",
          "ix": "0x000000",
          "iy": "0xD00080",
          "af": "0xEE54",
          "bc": "0x000044",
          "de": "0xD65800",
          "hl": "0xD657FF",
          "flags": {
            "z": true,
            "c": false,
            "n": false
          },
          "D00080": "0x00",
          "D0008D": "0x00",
          "D0009F": "0x00",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000000",
          "D005A0": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D02590": "0xD3FE81",
          "D0259A": "0xD3FE81",
          "vramPixels": 0
        },
        "memory": {
          "low0059c": "0x095CC3",
          "low005a0": "0x06F3C3",
          "D00596": "0x00",
          "D0059C": "0x000000",
          "D005A0": "0x00",
          "D005A1": "0x00",
          "D005A2": "0x00",
          "ixBytes": [
            "0xF3",
            "0xED",
            "0x7E",
            "0x5B",
            "0xC3",
            "0x58",
            "0x06",
            "0x00",
            "0xF3",
            "0xED",
            "0x7E",
            "0x5B"
          ]
        },
        "stackTop": [
          {
            "addr": "0xD1A87B",
            "value": "0x001409"
          },
          {
            "addr": "0xD1A87E",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A881",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A884",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A887",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A88A",
            "value": "0x000000"
          }
        ],
        "ixFrame": {
          "IX-45": "0x000000",
          "IX-42": "0x000000",
          "IX-39": "0x000000",
          "IX-30": "0xB30000",
          "IX-27": "0x00D140",
          "IX-24": "0x00",
          "IX-20": "0x000000",
          "IX-17": "0x000000",
          "IX-11": "0x001C00",
          "IX-8": "0x00",
          "IX-7": "0xB3",
          "IX-6": "0x00D140",
          "IX-3": "0x000000",
          "IX+0": "0x7EEDF3",
          "IX+3": "0x58C35B",
          "IX+6": "0xF30006",
          "IX+9": "0x5B7EED"
        },
        "callStackTail": [
          "0x001405"
        ],
        "recentBlocks": [
          "0x003BF5",
          "0x003BFD",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C0E",
          "0x003C16",
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C1F",
          "0x003C27",
          "0x0061E5",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C42",
          "0x003B0D",
          "0x003B17",
          "0x0013F4",
          "0x0013F8",
          "0x0028D1",
          "0x0013FC",
          "0x001405",
          "0x003CBC",
          "0x003CC6"
        ]
      },
      "pre003cd4": {
        "block": 106,
        "pc": "0x003CD4",
        "state": {
          "pc": "0x003CD4",
          "sp": "0xD1A84E",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "af": "0xA042",
          "bc": "0x00A000",
          "de": "0x0080C0",
          "hl": "0x000000",
          "flags": {
            "z": true,
            "c": false,
            "n": true
          },
          "D00080": "0x08",
          "D0008D": "0x0E",
          "D0009F": "0x20",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x1A",
          "D0058C": "0x90",
          "D0058D": "0x90",
          "D0058E": "0x90",
          "D00596": "0x00",
          "D0059C": "0xD4202C",
          "D005A0": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0xD1A8A3",
          "D02590": "0xD3FE81",
          "D0259A": "0xD3FE81",
          "vramPixels": 8549
        },
        "memory": {
          "low0059c": "0x095CC3",
          "low005a0": "0x06F3C3",
          "D00596": "0x00",
          "D0059C": "0xD4202C",
          "D005A0": "0x00",
          "D005A1": "0x00",
          "D005A2": "0x00",
          "ixBytes": [
            "0x39",
            "0xC3",
            "0x08",
            "0xB5",
            "0x19",
            "0x00",
            "0xFF",
            "0xFF",
            "0xFF",
            "0xFF",
            "0xFF",
            "0xFF"
          ]
        },
        "stackTop": [
          {
            "addr": "0xD1A84E",
            "value": "0x03F998"
          },
          {
            "addr": "0xD1A851",
            "value": "0x03D058"
          },
          {
            "addr": "0xD1A854",
            "value": "0xD1A8A1"
          },
          {
            "addr": "0xD1A857",
            "value": "0xD00080"
          },
          {
            "addr": "0xD1A85A",
            "value": "0xD1A860"
          },
          {
            "addr": "0xD1A85D",
            "value": "0x05C67C"
          }
        ],
        "ixFrame": {
          "IX-45": "0xD1A83C",
          "IX-42": "0x001C54",
          "IX-39": "0x000002",
          "IX-30": "0x001C54",
          "IX-27": "0x006816",
          "IX-24": "0x60",
          "IX-20": "0x980017",
          "IX-17": "0x5803F9",
          "IX-11": "0x80D1A8",
          "IX-8": "0x00",
          "IX-7": "0xD0",
          "IX-6": "0xD1A860",
          "IX-3": "0x05C67C",
          "IX+0": "0x08C339",
          "IX+3": "0x0019B5",
          "IX+6": "0xFFFFFF",
          "IX+9": "0xFFFFFF"
        },
        "callStackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentBlocks": [
          "0x001CCA",
          "0x001CE4",
          "0x001C54",
          "0x006816",
          "0x00681E",
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
          "0x03D04C",
          "0x03D054",
          "0x03F994",
          "0x0003D4",
          "0x003CC2",
          "0x003CD4"
        ]
      },
      "pre003ce0": {
        "block": 107,
        "pc": "0x003CE0",
        "state": {
          "pc": "0x003CE0",
          "sp": "0xD1A84E",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "af": "0xA042",
          "bc": "0x00A00C",
          "de": "0x0080C0",
          "hl": "0x000000",
          "flags": {
            "z": true,
            "c": false,
            "n": true
          },
          "D00080": "0x08",
          "D0008D": "0x0E",
          "D0009F": "0x20",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x1A",
          "D0058C": "0x90",
          "D0058D": "0x90",
          "D0058E": "0x90",
          "D00596": "0x00",
          "D0059C": "0xD4202C",
          "D005A0": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0xD1A8A3",
          "D02590": "0xD3FE81",
          "D0259A": "0xD3FE81",
          "vramPixels": 8549
        },
        "memory": {
          "low0059c": "0x095CC3",
          "low005a0": "0x06F3C3",
          "D00596": "0x00",
          "D0059C": "0xD4202C",
          "D005A0": "0x00",
          "D005A1": "0x00",
          "D005A2": "0x00",
          "ixBytes": [
            "0x39",
            "0xC3",
            "0x08",
            "0xB5",
            "0x19",
            "0x00",
            "0xFF",
            "0xFF",
            "0xFF",
            "0xFF",
            "0xFF",
            "0xFF"
          ]
        },
        "stackTop": [
          {
            "addr": "0xD1A84E",
            "value": "0x03F998"
          },
          {
            "addr": "0xD1A851",
            "value": "0x03D058"
          },
          {
            "addr": "0xD1A854",
            "value": "0xD1A8A1"
          },
          {
            "addr": "0xD1A857",
            "value": "0xD00080"
          },
          {
            "addr": "0xD1A85A",
            "value": "0xD1A860"
          },
          {
            "addr": "0xD1A85D",
            "value": "0x05C67C"
          }
        ],
        "ixFrame": {
          "IX-45": "0xD1A83C",
          "IX-42": "0x001C54",
          "IX-39": "0x000002",
          "IX-30": "0x001C54",
          "IX-27": "0x006816",
          "IX-24": "0x60",
          "IX-20": "0x980017",
          "IX-17": "0x5803F9",
          "IX-11": "0x80D1A8",
          "IX-8": "0x00",
          "IX-7": "0xD0",
          "IX-6": "0xD1A860",
          "IX-3": "0x05C67C",
          "IX+0": "0x08C339",
          "IX+3": "0x0019B5",
          "IX+6": "0xFFFFFF",
          "IX+9": "0xFFFFFF"
        },
        "callStackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentBlocks": [
          "0x001CE4",
          "0x001C54",
          "0x006816",
          "0x00681E",
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
          "0x03D04C",
          "0x03D054",
          "0x03F994",
          "0x0003D4",
          "0x003CC2",
          "0x003CD4",
          "0x003CE0"
        ]
      },
      "pre003cee": {
        "block": 108,
        "pc": "0x003CEE",
        "state": {
          "pc": "0x003CEE",
          "sp": "0xD1A84E",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "af": "0xA042",
          "bc": "0x00A008",
          "de": "0x0080C0",
          "hl": "0x00FF00",
          "flags": {
            "z": true,
            "c": false,
            "n": true
          },
          "D00080": "0x08",
          "D0008D": "0x0E",
          "D0009F": "0x20",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x1A",
          "D0058C": "0x90",
          "D0058D": "0x90",
          "D0058E": "0x90",
          "D00596": "0x00",
          "D0059C": "0xD4202C",
          "D005A0": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0xD1A8A3",
          "D02590": "0xD3FE81",
          "D0259A": "0xD3FE81",
          "vramPixels": 8549
        },
        "memory": {
          "low0059c": "0x095CC3",
          "low005a0": "0x06F3C3",
          "D00596": "0x00",
          "D0059C": "0xD4202C",
          "D005A0": "0x00",
          "D005A1": "0x00",
          "D005A2": "0x00",
          "ixBytes": [
            "0x39",
            "0xC3",
            "0x08",
            "0xB5",
            "0x19",
            "0x00",
            "0xFF",
            "0xFF",
            "0xFF",
            "0xFF",
            "0xFF",
            "0xFF"
          ]
        },
        "stackTop": [
          {
            "addr": "0xD1A84E",
            "value": "0x03F998"
          },
          {
            "addr": "0xD1A851",
            "value": "0x03D058"
          },
          {
            "addr": "0xD1A854",
            "value": "0xD1A8A1"
          },
          {
            "addr": "0xD1A857",
            "value": "0xD00080"
          },
          {
            "addr": "0xD1A85A",
            "value": "0xD1A860"
          },
          {
            "addr": "0xD1A85D",
            "value": "0x05C67C"
          }
        ],
        "ixFrame": {
          "IX-45": "0xD1A83C",
          "IX-42": "0x001C54",
          "IX-39": "0x000002",
          "IX-30": "0x001C54",
          "IX-27": "0x006816",
          "IX-24": "0x60",
          "IX-20": "0x980017",
          "IX-17": "0x5803F9",
          "IX-11": "0x80D1A8",
          "IX-8": "0x00",
          "IX-7": "0xD0",
          "IX-6": "0xD1A860",
          "IX-3": "0x05C67C",
          "IX+0": "0x08C339",
          "IX+3": "0x0019B5",
          "IX+6": "0xFFFFFF",
          "IX+9": "0xFFFFFF"
        },
        "callStackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentBlocks": [
          "0x001C54",
          "0x006816",
          "0x00681E",
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
          "0x03D04C",
          "0x03D054",
          "0x03F994",
          "0x0003D4",
          "0x003CC2",
          "0x003CD4",
          "0x003CE0",
          "0x003CEE"
        ]
      },
      "pre003cf3": {
        "block": 109,
        "pc": "0x003CF3",
        "state": {
          "pc": "0x003CF3",
          "sp": "0xD1A84E",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "af": "0x0842",
          "bc": "0x00A008",
          "de": "0x0080C0",
          "hl": "0x00FF00",
          "flags": {
            "z": true,
            "c": false,
            "n": true
          },
          "D00080": "0x08",
          "D0008D": "0x0E",
          "D0009F": "0x20",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x1A",
          "D0058C": "0x90",
          "D0058D": "0x90",
          "D0058E": "0x90",
          "D00596": "0x00",
          "D0059C": "0xD4202C",
          "D005A0": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0xD1A8A3",
          "D02590": "0xD3FE81",
          "D0259A": "0xD3FE81",
          "vramPixels": 8549
        },
        "memory": {
          "low0059c": "0x095CC3",
          "low005a0": "0x06F3C3",
          "D00596": "0x00",
          "D0059C": "0xD4202C",
          "D005A0": "0x00",
          "D005A1": "0x00",
          "D005A2": "0x00",
          "ixBytes": [
            "0x39",
            "0xC3",
            "0x08",
            "0xB5",
            "0x19",
            "0x00",
            "0xFF",
            "0xFF",
            "0xFF",
            "0xFF",
            "0xFF",
            "0xFF"
          ]
        },
        "stackTop": [
          {
            "addr": "0xD1A84E",
            "value": "0x03F998"
          },
          {
            "addr": "0xD1A851",
            "value": "0x03D058"
          },
          {
            "addr": "0xD1A854",
            "value": "0xD1A8A1"
          },
          {
            "addr": "0xD1A857",
            "value": "0xD00080"
          },
          {
            "addr": "0xD1A85A",
            "value": "0xD1A860"
          },
          {
            "addr": "0xD1A85D",
            "value": "0x05C67C"
          }
        ],
        "ixFrame": {
          "IX-45": "0xD1A83C",
          "IX-42": "0x001C54",
          "IX-39": "0x000002",
          "IX-30": "0x001C54",
          "IX-27": "0x006816",
          "IX-24": "0x60",
          "IX-20": "0x980017",
          "IX-17": "0x5803F9",
          "IX-11": "0x80D1A8",
          "IX-8": "0x00",
          "IX-7": "0xD0",
          "IX-6": "0xD1A860",
          "IX-3": "0x05C67C",
          "IX+0": "0x08C339",
          "IX+3": "0x0019B5",
          "IX+6": "0xFFFFFF",
          "IX+9": "0xFFFFFF"
        },
        "callStackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentBlocks": [
          "0x006816",
          "0x00681E",
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
          "0x03D04C",
          "0x03D054",
          "0x03F994",
          "0x0003D4",
          "0x003CC2",
          "0x003CD4",
          "0x003CE0",
          "0x003CEE",
          "0x003CF3"
        ]
      },
      "pre001428": {
        "block": 12631,
        "pc": "0x001428",
        "state": {
          "pc": "0x001428",
          "sp": "0xD1A87E",
          "ix": "0x000000",
          "iy": "0xD00080",
          "af": "0x0042",
          "bc": "0x00A55A",
          "de": "0xD65800",
          "hl": "0x000000",
          "flags": {
            "z": true,
            "c": false,
            "n": true
          },
          "D00080": "0x00",
          "D0008D": "0x00",
          "D0009F": "0x00",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000000",
          "D005A0": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D02590": "0xD3FE81",
          "D0259A": "0xD3FE81",
          "vramPixels": 0
        },
        "memory": {
          "low0059c": "0x095CC3",
          "low005a0": "0x06F3C3",
          "D00596": "0x00",
          "D0059C": "0x000000",
          "D005A0": "0x00",
          "D005A1": "0x00",
          "D005A2": "0x00",
          "ixBytes": [
            "0xF3",
            "0xED",
            "0x7E",
            "0x5B",
            "0xC3",
            "0x58",
            "0x06",
            "0x00",
            "0xF3",
            "0xED",
            "0x7E",
            "0x5B"
          ]
        },
        "stackTop": [
          {
            "addr": "0xD1A87E",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A881",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A884",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A887",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A88A",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A88D",
            "value": "0x008000"
          }
        ],
        "ixFrame": {
          "IX-45": "0x000000",
          "IX-42": "0x000000",
          "IX-39": "0x000000",
          "IX-30": "0xB30000",
          "IX-27": "0x00D140",
          "IX-24": "0x00",
          "IX-20": "0x000000",
          "IX-17": "0x000000",
          "IX-11": "0x001C00",
          "IX-8": "0x00",
          "IX-7": "0xB3",
          "IX-6": "0x00D140",
          "IX-3": "0x000000",
          "IX+0": "0x7EEDF3",
          "IX+3": "0x58C35B",
          "IX+6": "0xF30006",
          "IX+9": "0x5B7EED"
        },
        "callStackTail": [],
        "recentBlocks": [
          "0x0061E3",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C1F",
          "0x003C27",
          "0x0061E5",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C42",
          "0x003B0D",
          "0x003B17",
          "0x0013F4",
          "0x0013F8",
          "0x0028D1",
          "0x0013FC",
          "0x001405",
          "0x003CBC",
          "0x003CC6",
          "0x003CD4",
          "0x003CE0",
          "0x003CEE",
          "0x003CF3",
          "0x001409",
          "0x001424",
          "0x0008BB",
          "0x001428"
        ]
      },
      "pre00142c": {
        "block": 12632,
        "pc": "0x00142C",
        "state": {
          "pc": "0x00142C",
          "sp": "0xD1A87E",
          "ix": "0x000000",
          "iy": "0xD00080",
          "af": "0x0042",
          "bc": "0x00A55A",
          "de": "0xD65800",
          "hl": "0x000000",
          "flags": {
            "z": true,
            "c": false,
            "n": true
          },
          "D00080": "0x00",
          "D0008D": "0x00",
          "D0009F": "0x00",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000000",
          "D005A0": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D02590": "0xD3FE81",
          "D0259A": "0xD3FE81",
          "vramPixels": 0
        },
        "memory": {
          "low0059c": "0x095CC3",
          "low005a0": "0x06F3C3",
          "D00596": "0x00",
          "D0059C": "0x000000",
          "D005A0": "0x00",
          "D005A1": "0x00",
          "D005A2": "0x00",
          "ixBytes": [
            "0xF3",
            "0xED",
            "0x7E",
            "0x5B",
            "0xC3",
            "0x58",
            "0x06",
            "0x00",
            "0xF3",
            "0xED",
            "0x7E",
            "0x5B"
          ]
        },
        "stackTop": [
          {
            "addr": "0xD1A87E",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A881",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A884",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A887",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A88A",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A88D",
            "value": "0x008000"
          }
        ],
        "ixFrame": {
          "IX-45": "0x000000",
          "IX-42": "0x000000",
          "IX-39": "0x000000",
          "IX-30": "0xB30000",
          "IX-27": "0x00D140",
          "IX-24": "0x00",
          "IX-20": "0x000000",
          "IX-17": "0x000000",
          "IX-11": "0x001C00",
          "IX-8": "0x00",
          "IX-7": "0xB3",
          "IX-6": "0x00D140",
          "IX-3": "0x000000",
          "IX+0": "0x7EEDF3",
          "IX+3": "0x58C35B",
          "IX+6": "0xF30006",
          "IX+9": "0x5B7EED"
        },
        "callStackTail": [],
        "recentBlocks": [
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C1F",
          "0x003C27",
          "0x0061E5",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C42",
          "0x003B0D",
          "0x003B17",
          "0x0013F4",
          "0x0013F8",
          "0x0028D1",
          "0x0013FC",
          "0x001405",
          "0x003CBC",
          "0x003CC6",
          "0x003CD4",
          "0x003CE0",
          "0x003CEE",
          "0x003CF3",
          "0x001409",
          "0x001424",
          "0x0008BB",
          "0x001428",
          "0x00142C"
        ]
      }
    },
    "seedWindow": {
      "block": 12633,
      "pc": "0x000721",
      "state": {
        "pc": "0x000721",
        "sp": "0xD1A87E",
        "ix": "0x000000",
        "iy": "0xD00080",
        "af": "0x0042",
        "bc": "0x00A55A",
        "de": "0xD65800",
        "hl": "0x000000",
        "flags": {
          "z": true,
          "c": false,
          "n": true
        },
        "D00080": "0x00",
        "D0008D": "0x00",
        "D0009F": "0x00",
        "D00121": "0x000000",
        "D00124": "0x00",
        "D00587": "0x00",
        "D0058C": "0x00",
        "D0058D": "0x00",
        "D0058E": "0x00",
        "D00596": "0x00",
        "D0059C": "0x000000",
        "D005A0": "0x00",
        "D007CA": "0x0585E9",
        "D008E0": "0xD1A863",
        "D0231A": "0x000000",
        "D0243A": "0x000000",
        "D02590": "0xD3FE81",
        "D0259A": "0xD3FE81",
        "vramPixels": 0
      },
      "memory": {
        "low0059c": "0x095CC3",
        "low005a0": "0x06F3C3",
        "D00596": "0x00",
        "D0059C": "0x000000",
        "D005A0": "0x00",
        "D005A1": "0x00",
        "D005A2": "0x00",
        "ixBytes": [
          "0xF3",
          "0xED",
          "0x7E",
          "0x5B",
          "0xC3",
          "0x58",
          "0x06",
          "0x00",
          "0xF3",
          "0xED",
          "0x7E",
          "0x5B"
        ]
      },
      "stackTop": [
        {
          "addr": "0xD1A87E",
          "value": "0x000000"
        },
        {
          "addr": "0xD1A881",
          "value": "0x000000"
        },
        {
          "addr": "0xD1A884",
          "value": "0x000000"
        },
        {
          "addr": "0xD1A887",
          "value": "0x000000"
        },
        {
          "addr": "0xD1A88A",
          "value": "0x000000"
        },
        {
          "addr": "0xD1A88D",
          "value": "0x008000"
        }
      ],
      "ixFrame": {
        "IX-45": "0x000000",
        "IX-42": "0x000000",
        "IX-39": "0x000000",
        "IX-30": "0xB30000",
        "IX-27": "0x00D140",
        "IX-24": "0x00",
        "IX-20": "0x000000",
        "IX-17": "0x000000",
        "IX-11": "0x001C00",
        "IX-8": "0x00",
        "IX-7": "0xB3",
        "IX-6": "0x00D140",
        "IX-3": "0x000000",
        "IX+0": "0x7EEDF3",
        "IX+3": "0x58C35B",
        "IX+6": "0xF30006",
        "IX+9": "0x5B7EED"
      },
      "callStackTail": [],
      "recentBlocks": [
        "0x0061FD",
        "0x006202",
        "0x003C1F",
        "0x003C27",
        "0x0061E5",
        "0x0061E9",
        "0x0061FD",
        "0x006202",
        "0x003C42",
        "0x003B0D",
        "0x003B17",
        "0x0013F4",
        "0x0013F8",
        "0x0028D1",
        "0x0013FC",
        "0x001405",
        "0x003CBC",
        "0x003CC6",
        "0x003CD4",
        "0x003CE0",
        "0x003CEE",
        "0x003CF3",
        "0x001409",
        "0x001424",
        "0x0008BB",
        "0x001428",
        "0x00142C",
        "0x000721"
      ]
    },
    "seedTail": {
      "seed013d00": {
        "block": 12634,
        "pc": "0x013D00",
        "state": {
          "pc": "0x013D00",
          "sp": "0xD1A87B",
          "ix": "0x000000",
          "iy": "0xD00080",
          "af": "0x0042",
          "bc": "0x00A55A",
          "de": "0xD65800",
          "hl": "0x000000",
          "flags": {
            "z": true,
            "c": false,
            "n": true
          },
          "D00080": "0x00",
          "D0008D": "0x00",
          "D0009F": "0x00",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000000",
          "D005A0": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D02590": "0xD3FE81",
          "D0259A": "0xD3FE81",
          "vramPixels": 0
        },
        "memory": {
          "low0059c": "0x095CC3",
          "low005a0": "0x06F3C3",
          "D00596": "0x00",
          "D0059C": "0x000000",
          "D005A0": "0x00",
          "D005A1": "0x00",
          "D005A2": "0x00",
          "ixBytes": [
            "0xF3",
            "0xED",
            "0x7E",
            "0x5B",
            "0xC3",
            "0x58",
            "0x06",
            "0x00",
            "0xF3",
            "0xED",
            "0x7E",
            "0x5B"
          ]
        },
        "stackTop": [
          {
            "addr": "0xD1A87B",
            "value": "0x000725"
          },
          {
            "addr": "0xD1A87E",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A881",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A884",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A887",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A88A",
            "value": "0x000000"
          }
        ],
        "ixFrame": {
          "IX-45": "0x000000",
          "IX-42": "0x000000",
          "IX-39": "0x000000",
          "IX-30": "0xB30000",
          "IX-27": "0x00D140",
          "IX-24": "0x00",
          "IX-20": "0x000000",
          "IX-17": "0x000000",
          "IX-11": "0x001C00",
          "IX-8": "0x00",
          "IX-7": "0xB3",
          "IX-6": "0x00D140",
          "IX-3": "0x000000",
          "IX+0": "0x7EEDF3",
          "IX+3": "0x58C35B",
          "IX+6": "0xF30006",
          "IX+9": "0x5B7EED"
        },
        "callStackTail": [
          "0x000721"
        ],
        "recentBlocks": [
          "0x006202",
          "0x003C1F",
          "0x003C27",
          "0x0061E5",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C42",
          "0x003B0D",
          "0x003B17",
          "0x0013F4",
          "0x0013F8",
          "0x0028D1",
          "0x0013FC",
          "0x001405",
          "0x003CBC",
          "0x003CC6",
          "0x003CD4",
          "0x003CE0",
          "0x003CEE",
          "0x003CF3",
          "0x001409",
          "0x001424",
          "0x0008BB",
          "0x001428",
          "0x00142C",
          "0x000721",
          "0x013D00"
        ]
      },
      "seed005ba6": {
        "block": 12635,
        "pc": "0x005BA6",
        "state": {
          "pc": "0x005BA6",
          "sp": "0xD1A86F",
          "ix": "0x000000",
          "iy": "0xD00080",
          "af": "0x0040",
          "bc": "0x00A55A",
          "de": "0xD65800",
          "hl": "0x000000",
          "flags": {
            "z": true,
            "c": false,
            "n": false
          },
          "D00080": "0x00",
          "D0008D": "0x00",
          "D0009F": "0x00",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000000",
          "D005A0": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D02590": "0xD3FE81",
          "D0259A": "0xD3FE81",
          "vramPixels": 0
        },
        "memory": {
          "low0059c": "0x095CC3",
          "low005a0": "0x06F3C3",
          "D00596": "0x00",
          "D0059C": "0x000000",
          "D005A0": "0x00",
          "D005A1": "0x00",
          "D005A2": "0x00",
          "ixBytes": [
            "0xF3",
            "0xED",
            "0x7E",
            "0x5B",
            "0xC3",
            "0x58",
            "0x06",
            "0x00",
            "0xF3",
            "0xED",
            "0x7E",
            "0x5B"
          ]
        },
        "stackTop": [
          {
            "addr": "0xD1A86F",
            "value": "0x013D11"
          },
          {
            "addr": "0xD1A872",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A875",
            "value": "0xD00080"
          },
          {
            "addr": "0xD1A878",
            "value": "0x000040"
          },
          {
            "addr": "0xD1A87B",
            "value": "0x000725"
          },
          {
            "addr": "0xD1A87E",
            "value": "0x000000"
          }
        ],
        "ixFrame": {
          "IX-45": "0x000000",
          "IX-42": "0x000000",
          "IX-39": "0x000000",
          "IX-30": "0xB30000",
          "IX-27": "0x00D140",
          "IX-24": "0x00",
          "IX-20": "0x000000",
          "IX-17": "0x000000",
          "IX-11": "0x001C00",
          "IX-8": "0x00",
          "IX-7": "0xB3",
          "IX-6": "0x00D140",
          "IX-3": "0x000000",
          "IX+0": "0x7EEDF3",
          "IX+3": "0x58C35B",
          "IX+6": "0xF30006",
          "IX+9": "0x5B7EED"
        },
        "callStackTail": [
          "0x000721",
          "0x013D00"
        ],
        "recentBlocks": [
          "0x003C1F",
          "0x003C27",
          "0x0061E5",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C42",
          "0x003B0D",
          "0x003B17",
          "0x0013F4",
          "0x0013F8",
          "0x0028D1",
          "0x0013FC",
          "0x001405",
          "0x003CBC",
          "0x003CC6",
          "0x003CD4",
          "0x003CE0",
          "0x003CEE",
          "0x003CF3",
          "0x001409",
          "0x001424",
          "0x0008BB",
          "0x001428",
          "0x00142C",
          "0x000721",
          "0x013D00",
          "0x005BA6"
        ]
      },
      "seed013d11": {
        "block": 12636,
        "pc": "0x013D11",
        "state": {
          "pc": "0x013D11",
          "sp": "0xD1A872",
          "ix": "0x000000",
          "iy": "0xD00080",
          "af": "0x0040",
          "bc": "0x00A55A",
          "de": "0xD65800",
          "hl": "0x000000",
          "flags": {
            "z": true,
            "c": false,
            "n": false
          },
          "D00080": "0x00",
          "D0008D": "0x00",
          "D0009F": "0x00",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000000",
          "D005A0": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D02590": "0xD3FE81",
          "D0259A": "0xD3FE81",
          "vramPixels": 0
        },
        "memory": {
          "low0059c": "0x095CC3",
          "low005a0": "0x06F3C3",
          "D00596": "0x00",
          "D0059C": "0x000000",
          "D005A0": "0x00",
          "D005A1": "0x00",
          "D005A2": "0x00",
          "ixBytes": [
            "0xF3",
            "0xED",
            "0x7E",
            "0x5B",
            "0xC3",
            "0x58",
            "0x06",
            "0x00",
            "0xF3",
            "0xED",
            "0x7E",
            "0x5B"
          ]
        },
        "stackTop": [
          {
            "addr": "0xD1A872",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A875",
            "value": "0xD00080"
          },
          {
            "addr": "0xD1A878",
            "value": "0x000040"
          },
          {
            "addr": "0xD1A87B",
            "value": "0x000725"
          },
          {
            "addr": "0xD1A87E",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A881",
            "value": "0x000000"
          }
        ],
        "ixFrame": {
          "IX-45": "0x000000",
          "IX-42": "0x000000",
          "IX-39": "0x000000",
          "IX-30": "0xB30000",
          "IX-27": "0x00D140",
          "IX-24": "0x00",
          "IX-20": "0x000000",
          "IX-17": "0x000000",
          "IX-11": "0x001C00",
          "IX-8": "0x00",
          "IX-7": "0xB3",
          "IX-6": "0x00D140",
          "IX-3": "0x000000",
          "IX+0": "0x7EEDF3",
          "IX+3": "0x58C35B",
          "IX+6": "0xF30006",
          "IX+9": "0x5B7EED"
        },
        "callStackTail": [
          "0x000721"
        ],
        "recentBlocks": [
          "0x003C27",
          "0x0061E5",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C42",
          "0x003B0D",
          "0x003B17",
          "0x0013F4",
          "0x0013F8",
          "0x0028D1",
          "0x0013FC",
          "0x001405",
          "0x003CBC",
          "0x003CC6",
          "0x003CD4",
          "0x003CE0",
          "0x003CEE",
          "0x003CF3",
          "0x001409",
          "0x001424",
          "0x0008BB",
          "0x001428",
          "0x00142C",
          "0x000721",
          "0x013D00",
          "0x005BA6",
          "0x013D11"
        ]
      },
      "display0059c6": {
        "block": 12637,
        "pc": "0x0059C6",
        "state": {
          "pc": "0x0059C6",
          "sp": "0xD1A86F",
          "ix": "0x000000",
          "iy": "0xD00080",
          "af": "0x2040",
          "bc": "0x000E5A",
          "de": "0xD65800",
          "hl": "0x000000",
          "flags": {
            "z": true,
            "c": false,
            "n": false
          },
          "D00080": "0x00",
          "D0008D": "0x00",
          "D0009F": "0x00",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000000",
          "D005A0": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D02590": "0xD3FE81",
          "D0259A": "0xD3FE81",
          "vramPixels": 0
        },
        "memory": {
          "low0059c": "0x095CC3",
          "low005a0": "0x06F3C3",
          "D00596": "0x00",
          "D0059C": "0x000000",
          "D005A0": "0x00",
          "D005A1": "0x00",
          "D005A2": "0x00",
          "ixBytes": [
            "0xF3",
            "0xED",
            "0x7E",
            "0x5B",
            "0xC3",
            "0x58",
            "0x06",
            "0x00",
            "0xF3",
            "0xED",
            "0x7E",
            "0x5B"
          ]
        },
        "stackTop": [
          {
            "addr": "0xD1A86F",
            "value": "0x013D1D"
          },
          {
            "addr": "0xD1A872",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A875",
            "value": "0xD00080"
          },
          {
            "addr": "0xD1A878",
            "value": "0x000040"
          },
          {
            "addr": "0xD1A87B",
            "value": "0x000725"
          },
          {
            "addr": "0xD1A87E",
            "value": "0x000000"
          }
        ],
        "ixFrame": {
          "IX-45": "0x000000",
          "IX-42": "0x000000",
          "IX-39": "0x000000",
          "IX-30": "0xB30000",
          "IX-27": "0x00D140",
          "IX-24": "0x00",
          "IX-20": "0x000000",
          "IX-17": "0x000000",
          "IX-11": "0x001C00",
          "IX-8": "0x00",
          "IX-7": "0xB3",
          "IX-6": "0x00D140",
          "IX-3": "0x000000",
          "IX+0": "0x7EEDF3",
          "IX+3": "0x58C35B",
          "IX+6": "0xF30006",
          "IX+9": "0x5B7EED"
        },
        "callStackTail": [
          "0x000721",
          "0x013D11"
        ],
        "recentBlocks": [
          "0x0061E5",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C42",
          "0x003B0D",
          "0x003B17",
          "0x0013F4",
          "0x0013F8",
          "0x0028D1",
          "0x0013FC",
          "0x001405",
          "0x003CBC",
          "0x003CC6",
          "0x003CD4",
          "0x003CE0",
          "0x003CEE",
          "0x003CF3",
          "0x001409",
          "0x001424",
          "0x0008BB",
          "0x001428",
          "0x00142C",
          "0x000721",
          "0x013D00",
          "0x005BA6",
          "0x013D11",
          "0x0059C6"
        ]
      }
    },
    "transferSamples": {
      "display005b92": {
        "block": 12717,
        "pc": "0x005B92",
        "state": {
          "pc": "0x005B92",
          "sp": "0xD1A857",
          "ix": "0xD005C1",
          "iy": "0xD00080",
          "af": "0xFF42",
          "bc": "0xFF0005",
          "de": "0x0000FF",
          "hl": "0xD005A0",
          "flags": {
            "z": true,
            "c": false,
            "n": true
          },
          "D00080": "0x00",
          "D0008D": "0x00",
          "D0009F": "0x00",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000002",
          "D005A0": "0x35",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D02590": "0xD3FE81",
          "D0259A": "0xD3FE81",
          "vramPixels": 0
        },
        "memory": {
          "low0059c": "0x095CC3",
          "low005a0": "0x06F3C3",
          "D00596": "0x00",
          "D0059C": "0x000002",
          "D005A0": "0x35",
          "D005A1": "0x00",
          "D005A2": "0x00",
          "ixBytes": [
            "0x00",
            "0x00",
            "0x00",
            "0x00",
            "0x00",
            "0x00",
            "0x00",
            "0x00",
            "0x00",
            "0x00",
            "0x00",
            "0x00"
          ]
        },
        "stackTop": [
          {
            "addr": "0xD1A857",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A85A",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A85D",
            "value": "0xD65800"
          },
          {
            "addr": "0xD1A860",
            "value": "0x000E5A"
          },
          {
            "addr": "0xD1A863",
            "value": "0x00201B"
          },
          {
            "addr": "0xD1A866",
            "value": "0x0059DA"
          }
        ],
        "ixFrame": {
          "IX-45": "0x000000",
          "IX-42": "0x000000",
          "IX-39": "0x020000",
          "IX-30": "0x000000",
          "IX-27": "0x000000",
          "IX-24": "0x00",
          "IX-20": "0x000000",
          "IX-17": "0x000000",
          "IX-11": "0x000000",
          "IX-8": "0x00",
          "IX-7": "0x00",
          "IX-6": "0x000000",
          "IX-3": "0x000000",
          "IX+0": "0x000000",
          "IX+3": "0x000000",
          "IX+6": "0x000000",
          "IX+9": "0x000000"
        },
        "callStackTail": [
          "0x000721",
          "0x013D11",
          "0x0059C6"
        ],
        "recentBlocks": [
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005B92"
        ]
      },
      "transfer0017fc": {
        "block": 20151,
        "pc": "0x0017FC",
        "state": {
          "pc": "0x0017FC",
          "sp": "0xD1A834",
          "ix": "0xD1A866",
          "iy": "0xD00080",
          "af": "0x2F00",
          "bc": "0x09D6B4",
          "de": "0x008000",
          "hl": "0x0017DA",
          "flags": {
            "z": false,
            "c": false,
            "n": false
          },
          "D00080": "0x00",
          "D0008D": "0x00",
          "D0009F": "0x00",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00596": "0x13",
          "D0059C": "0x0000DA",
          "D005A0": "0x85",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D02590": "0xD3FE81",
          "D0259A": "0xD3FE81",
          "vramPixels": 3040
        },
        "memory": {
          "low0059c": "0x095CC3",
          "low005a0": "0x06F3C3",
          "D00596": "0x13",
          "D0059C": "0x0000DA",
          "D005A0": "0x85",
          "D005A1": "0x00",
          "D005A2": "0x00",
          "ixBytes": [
            "0x78",
            "0xA8",
            "0xD1",
            "0x68",
            "0x39",
            "0x01",
            "0x00",
            "0x00",
            "0x02",
            "0x80",
            "0x00",
            "0xD0"
          ]
        },
        "stackTop": [
          {
            "addr": "0xD1A834",
            "value": "0x00090C"
          },
          {
            "addr": "0xD1A837",
            "value": "0x006486"
          },
          {
            "addr": "0xD1A83A",
            "value": "0x0BD6BA"
          },
          {
            "addr": "0xD1A83D",
            "value": "0x1700D1"
          },
          {
            "addr": "0xD1A840",
            "value": "0x740017"
          },
          {
            "addr": "0xD1A843",
            "value": "0x080059"
          }
        ],
        "ixFrame": {
          "IX-45": "0xD6BA00",
          "IX-42": "0x00D10B",
          "IX-39": "0x001717",
          "IX-30": "0xFFFFFC",
          "IX-27": "0xFF0105",
          "IX-24": "0x00",
          "IX-20": "0x08013D",
          "IX-17": "0x5A0000",
          "IX-11": "0x7E002E",
          "IX-8": "0xA8",
          "IX-7": "0xD1",
          "IX-6": "0x000000",
          "IX-3": "0x0138F9",
          "IX+0": "0xD1A878",
          "IX+3": "0x013968",
          "IX+6": "0x020000",
          "IX+9": "0xD00080"
        },
        "callStackTail": [],
        "recentBlocks": [
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005B92",
          "0x005A19",
          "0x0059DA",
          "0x0059E6",
          "0x0017FC"
        ]
      },
      "low0064d0": {
        "block": 20277,
        "pc": "0x0064D0",
        "state": {
          "pc": "0x0064D0",
          "sp": "0xD1A83A",
          "ix": "0xD1A866",
          "iy": "0xD00080",
          "af": "0x0A42",
          "bc": "0x002000",
          "de": "0x000240",
          "hl": "0x0017DB",
          "flags": {
            "z": true,
            "c": false,
            "n": true
          },
          "D00080": "0x00",
          "D0008D": "0x00",
          "D0009F": "0x00",
          "D00121": "0x000000",
          "D00124": "0x0A",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00596": "0x13",
          "D0059C": "0x0000DA",
          "D005A0": "0x85",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D02590": "0xD3FE81",
          "D0259A": "0xD3FE81",
          "vramPixels": 3031
        },
        "memory": {
          "low0059c": "0x095CC3",
          "low005a0": "0x06F3C3",
          "D00596": "0x13",
          "D0059C": "0x0000DA",
          "D005A0": "0x85",
          "D005A1": "0x00",
          "D005A2": "0x00",
          "ixBytes": [
            "0x78",
            "0xA8",
            "0xD1",
            "0x68",
            "0x39",
            "0x01",
            "0x00",
            "0x00",
            "0x02",
            "0x80",
            "0x00",
            "0xD0"
          ]
        },
        "stackTop": [
          {
            "addr": "0xD1A83A",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A83D",
            "value": "0x1700D1"
          },
          {
            "addr": "0xD1A840",
            "value": "0x740017"
          },
          {
            "addr": "0xD1A843",
            "value": "0x080059"
          },
          {
            "addr": "0xD1A846",
            "value": "0xFC0005"
          },
          {
            "addr": "0xD1A849",
            "value": "0x05FFFF"
          }
        ],
        "ixFrame": {
          "IX-45": "0x000000",
          "IX-42": "0x00D100",
          "IX-39": "0x001717",
          "IX-30": "0xFFFFFC",
          "IX-27": "0xFF0105",
          "IX-24": "0x00",
          "IX-20": "0x08013D",
          "IX-17": "0x5A0000",
          "IX-11": "0xC0002E",
          "IX-8": "0xD7",
          "IX-7": "0x0B",
          "IX-6": "0x000104",
          "IX-3": "0x09D7BE",
          "IX+0": "0xD1A878",
          "IX+3": "0x013968",
          "IX+6": "0x020000",
          "IX+9": "0xD00080"
        },
        "callStackTail": [],
        "recentBlocks": [
          "0x005B16",
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005B92",
          "0x005A19",
          "0x0059DA",
          "0x0059E6",
          "0x0017FC",
          "0x0064D0"
        ]
      },
      "low006cc6": {
        "block": 20278,
        "pc": "0x006CC6",
        "state": {
          "pc": "0x006CC6",
          "sp": "0xD1A834",
          "ix": "0xD1A866",
          "iy": "0xD00080",
          "af": "0x0A42",
          "bc": "0x020000",
          "de": "0x000240",
          "hl": "0x000000",
          "flags": {
            "z": true,
            "c": false,
            "n": true
          },
          "D00080": "0x00",
          "D0008D": "0x00",
          "D0009F": "0x00",
          "D00121": "0x000000",
          "D00124": "0x0A",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00596": "0x13",
          "D0059C": "0x0000DA",
          "D005A0": "0x85",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D02590": "0xD3FE81",
          "D0259A": "0xD3FE81",
          "vramPixels": 3031
        },
        "memory": {
          "low0059c": "0x095CC3",
          "low005a0": "0x06F3C3",
          "D00596": "0x13",
          "D0059C": "0x0000DA",
          "D005A0": "0x85",
          "D005A1": "0x00",
          "D005A2": "0x00",
          "ixBytes": [
            "0x78",
            "0xA8",
            "0xD1",
            "0x68",
            "0x39",
            "0x01",
            "0x00",
            "0x00",
            "0x02",
            "0x80",
            "0x00",
            "0xD0"
          ]
        },
        "stackTop": [
          {
            "addr": "0xD1A834",
            "value": "0x0064DE"
          },
          {
            "addr": "0xD1A837",
            "value": "0x020000"
          },
          {
            "addr": "0xD1A83A",
            "value": "0x000100"
          },
          {
            "addr": "0xD1A83D",
            "value": "0x1700D1"
          },
          {
            "addr": "0xD1A840",
            "value": "0x740017"
          },
          {
            "addr": "0xD1A843",
            "value": "0x080059"
          }
        ],
        "ixFrame": {
          "IX-45": "0x010002",
          "IX-42": "0x00D100",
          "IX-39": "0x001717",
          "IX-30": "0xFFFFFC",
          "IX-27": "0xFF0105",
          "IX-24": "0x00",
          "IX-20": "0x08013D",
          "IX-17": "0x5A0000",
          "IX-11": "0xC0002E",
          "IX-8": "0xD7",
          "IX-7": "0x0B",
          "IX-6": "0x000104",
          "IX-3": "0x09D7BE",
          "IX+0": "0xD1A878",
          "IX+3": "0x013968",
          "IX+6": "0x020000",
          "IX+9": "0xD00080"
        },
        "callStackTail": [
          "0x0064D0"
        ],
        "recentBlocks": [
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005B92",
          "0x005A19",
          "0x0059DA",
          "0x0059E6",
          "0x0017FC",
          "0x0064D0",
          "0x006CC6"
        ]
      }
    },
    "seedTransitions": [
      {
        "name": "pre003cd4",
        "hit": 1,
        "block": 106,
        "pc": "0x003CD4",
        "previous": "0x003CC2",
        "sp": "0xD1A84E",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
          "0x03CFE5",
          "0x03CFEA",
          "0x03D029",
          "0x03D033",
          "0x03D038",
          "0x03D044",
          "0x03D04C",
          "0x03D054",
          "0x03F994",
          "0x0003D4",
          "0x003CC2",
          "0x003CD4"
        ]
      },
      {
        "name": "pre003ce0",
        "hit": 1,
        "block": 107,
        "pc": "0x003CE0",
        "previous": "0x003CD4",
        "sp": "0xD1A84E",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
          "0x03CFEA",
          "0x03D029",
          "0x03D033",
          "0x03D038",
          "0x03D044",
          "0x03D04C",
          "0x03D054",
          "0x03F994",
          "0x0003D4",
          "0x003CC2",
          "0x003CD4",
          "0x003CE0"
        ]
      },
      {
        "name": "pre003cee",
        "hit": 1,
        "block": 108,
        "pc": "0x003CEE",
        "previous": "0x003CE0",
        "sp": "0xD1A84E",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
          "0x03D029",
          "0x03D033",
          "0x03D038",
          "0x03D044",
          "0x03D04C",
          "0x03D054",
          "0x03F994",
          "0x0003D4",
          "0x003CC2",
          "0x003CD4",
          "0x003CE0",
          "0x003CEE"
        ]
      },
      {
        "name": "pre003cf3",
        "hit": 1,
        "block": 109,
        "pc": "0x003CF3",
        "previous": "0x003CEE",
        "sp": "0xD1A84E",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
          "0x03D033",
          "0x03D038",
          "0x03D044",
          "0x03D04C",
          "0x03D054",
          "0x03F994",
          "0x0003D4",
          "0x003CC2",
          "0x003CD4",
          "0x003CE0",
          "0x003CEE",
          "0x003CF3"
        ]
      },
      {
        "name": "pre003cd4",
        "hit": 2,
        "block": 338,
        "pc": "0x003CD4",
        "previous": "0x003CC2",
        "sp": "0xD1A845",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
          "0x03CFE5",
          "0x03CFEA",
          "0x03D029",
          "0x03D033",
          "0x03D038",
          "0x03D044",
          "0x03D04C",
          "0x03D054",
          "0x03F994",
          "0x0003D4",
          "0x003CC2",
          "0x003CD4"
        ]
      },
      {
        "name": "pre003ce0",
        "hit": 2,
        "block": 339,
        "pc": "0x003CE0",
        "previous": "0x003CD4",
        "sp": "0xD1A845",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
          "0x03CFEA",
          "0x03D029",
          "0x03D033",
          "0x03D038",
          "0x03D044",
          "0x03D04C",
          "0x03D054",
          "0x03F994",
          "0x0003D4",
          "0x003CC2",
          "0x003CD4",
          "0x003CE0"
        ]
      },
      {
        "name": "pre003cee",
        "hit": 2,
        "block": 340,
        "pc": "0x003CEE",
        "previous": "0x003CE0",
        "sp": "0xD1A845",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
          "0x03D029",
          "0x03D033",
          "0x03D038",
          "0x03D044",
          "0x03D04C",
          "0x03D054",
          "0x03F994",
          "0x0003D4",
          "0x003CC2",
          "0x003CD4",
          "0x003CE0",
          "0x003CEE"
        ]
      },
      {
        "name": "pre003cf3",
        "hit": 2,
        "block": 341,
        "pc": "0x003CF3",
        "previous": "0x003CEE",
        "sp": "0xD1A845",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
          "0x03D033",
          "0x03D038",
          "0x03D044",
          "0x03D04C",
          "0x03D054",
          "0x03F994",
          "0x0003D4",
          "0x003CC2",
          "0x003CD4",
          "0x003CE0",
          "0x003CEE",
          "0x003CF3"
        ]
      },
      {
        "name": "pre003cd4",
        "hit": 3,
        "block": 1734,
        "pc": "0x003CD4",
        "previous": "0x003CC2",
        "sp": "0xD1A842",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
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
          "0x003CD4"
        ]
      },
      {
        "name": "pre003ce0",
        "hit": 3,
        "block": 1735,
        "pc": "0x003CE0",
        "previous": "0x003CD4",
        "sp": "0xD1A842",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
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
          "0x003CE0"
        ]
      },
      {
        "name": "pre003cee",
        "hit": 3,
        "block": 1736,
        "pc": "0x003CEE",
        "previous": "0x003CE0",
        "sp": "0xD1A842",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
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
          "0x003CEE"
        ]
      },
      {
        "name": "pre003cf3",
        "hit": 3,
        "block": 1737,
        "pc": "0x003CF3",
        "previous": "0x003CEE",
        "sp": "0xD1A842",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
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
          "0x003CF3"
        ]
      },
      {
        "name": "pre003cd4",
        "hit": 4,
        "block": 1907,
        "pc": "0x003CD4",
        "previous": "0x003CC2",
        "sp": "0xD1A84B",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
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
          "0x003CD4"
        ]
      },
      {
        "name": "pre003ce0",
        "hit": 4,
        "block": 1908,
        "pc": "0x003CE0",
        "previous": "0x003CD4",
        "sp": "0xD1A84B",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
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
          "0x003CE0"
        ]
      },
      {
        "name": "pre003cee",
        "hit": 4,
        "block": 1909,
        "pc": "0x003CEE",
        "previous": "0x003CE0",
        "sp": "0xD1A84B",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
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
          "0x003CEE"
        ]
      },
      {
        "name": "pre003cf3",
        "hit": 4,
        "block": 1910,
        "pc": "0x003CF3",
        "previous": "0x003CEE",
        "sp": "0xD1A84B",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
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
          "0x003CF3"
        ]
      },
      {
        "name": "pre003cd4",
        "hit": 5,
        "block": 2107,
        "pc": "0x003CD4",
        "previous": "0x003CC2",
        "sp": "0xD1A83C",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
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
          "0x003CD4"
        ]
      },
      {
        "name": "pre003ce0",
        "hit": 5,
        "block": 2108,
        "pc": "0x003CE0",
        "previous": "0x003CD4",
        "sp": "0xD1A83C",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
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
          "0x003CE0"
        ]
      },
      {
        "name": "pre003cee",
        "hit": 5,
        "block": 2109,
        "pc": "0x003CEE",
        "previous": "0x003CE0",
        "sp": "0xD1A83C",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
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
          "0x003CEE"
        ]
      },
      {
        "name": "pre003cf3",
        "hit": 5,
        "block": 2110,
        "pc": "0x003CF3",
        "previous": "0x003CEE",
        "sp": "0xD1A83C",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
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
          "0x003CF3"
        ]
      },
      {
        "name": "pre003cd4",
        "hit": 6,
        "block": 3580,
        "pc": "0x003CD4",
        "previous": "0x003CC2",
        "sp": "0xD1A851",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
          "0x03CFE5",
          "0x03CFEA",
          "0x03D029",
          "0x03D033",
          "0x03D038",
          "0x03D044",
          "0x03D04C",
          "0x03D054",
          "0x03F994",
          "0x0003D4",
          "0x003CC2",
          "0x003CD4"
        ]
      },
      {
        "name": "pre003ce0",
        "hit": 6,
        "block": 3581,
        "pc": "0x003CE0",
        "previous": "0x003CD4",
        "sp": "0xD1A851",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
          "0x03CFEA",
          "0x03D029",
          "0x03D033",
          "0x03D038",
          "0x03D044",
          "0x03D04C",
          "0x03D054",
          "0x03F994",
          "0x0003D4",
          "0x003CC2",
          "0x003CD4",
          "0x003CE0"
        ]
      },
      {
        "name": "pre003cee",
        "hit": 6,
        "block": 3582,
        "pc": "0x003CEE",
        "previous": "0x003CE0",
        "sp": "0xD1A851",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
          "0x03D029",
          "0x03D033",
          "0x03D038",
          "0x03D044",
          "0x03D04C",
          "0x03D054",
          "0x03F994",
          "0x0003D4",
          "0x003CC2",
          "0x003CD4",
          "0x003CE0",
          "0x003CEE"
        ]
      },
      {
        "name": "pre003cf3",
        "hit": 6,
        "block": 3583,
        "pc": "0x003CF3",
        "previous": "0x003CEE",
        "sp": "0xD1A851",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
          "0x03D033",
          "0x03D038",
          "0x03D044",
          "0x03D04C",
          "0x03D054",
          "0x03F994",
          "0x0003D4",
          "0x003CC2",
          "0x003CD4",
          "0x003CE0",
          "0x003CEE",
          "0x003CF3"
        ]
      },
      {
        "name": "pre003cd4",
        "hit": 7,
        "block": 3706,
        "pc": "0x003CD4",
        "previous": "0x003CC2",
        "sp": "0xD1A83F",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
          "0x03CFE5",
          "0x03CFEA",
          "0x03D029",
          "0x03D033",
          "0x03D038",
          "0x03D044",
          "0x03D04C",
          "0x03D054",
          "0x03F994",
          "0x0003D4",
          "0x003CC2",
          "0x003CD4"
        ]
      },
      {
        "name": "pre003ce0",
        "hit": 7,
        "block": 3707,
        "pc": "0x003CE0",
        "previous": "0x003CD4",
        "sp": "0xD1A83F",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
          "0x03CFEA",
          "0x03D029",
          "0x03D033",
          "0x03D038",
          "0x03D044",
          "0x03D04C",
          "0x03D054",
          "0x03F994",
          "0x0003D4",
          "0x003CC2",
          "0x003CD4",
          "0x003CE0"
        ]
      },
      {
        "name": "pre003cee",
        "hit": 7,
        "block": 3708,
        "pc": "0x003CEE",
        "previous": "0x003CE0",
        "sp": "0xD1A83F",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
          "0x03D029",
          "0x03D033",
          "0x03D038",
          "0x03D044",
          "0x03D04C",
          "0x03D054",
          "0x03F994",
          "0x0003D4",
          "0x003CC2",
          "0x003CD4",
          "0x003CE0",
          "0x003CEE"
        ]
      },
      {
        "name": "pre003cf3",
        "hit": 7,
        "block": 3709,
        "pc": "0x003CF3",
        "previous": "0x003CEE",
        "sp": "0xD1A83F",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
          "0x03D033",
          "0x03D038",
          "0x03D044",
          "0x03D04C",
          "0x03D054",
          "0x03F994",
          "0x0003D4",
          "0x003CC2",
          "0x003CD4",
          "0x003CE0",
          "0x003CEE",
          "0x003CF3"
        ]
      },
      {
        "name": "pre003cd4",
        "hit": 8,
        "block": 5031,
        "pc": "0x003CD4",
        "previous": "0x003CC2",
        "sp": "0xD1A845",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
          "0x03CFE5",
          "0x03CFEA",
          "0x03D029",
          "0x03D033",
          "0x03D038",
          "0x03D044",
          "0x03D04C",
          "0x03D054",
          "0x03F994",
          "0x0003D4",
          "0x003CC2",
          "0x003CD4"
        ]
      },
      {
        "name": "pre003ce0",
        "hit": 8,
        "block": 5032,
        "pc": "0x003CE0",
        "previous": "0x003CD4",
        "sp": "0xD1A845",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
          "0x03CFEA",
          "0x03D029",
          "0x03D033",
          "0x03D038",
          "0x03D044",
          "0x03D04C",
          "0x03D054",
          "0x03F994",
          "0x0003D4",
          "0x003CC2",
          "0x003CD4",
          "0x003CE0"
        ]
      },
      {
        "name": "pre003cee",
        "hit": 8,
        "block": 5033,
        "pc": "0x003CEE",
        "previous": "0x003CE0",
        "sp": "0xD1A845",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
          "0x03D029",
          "0x03D033",
          "0x03D038",
          "0x03D044",
          "0x03D04C",
          "0x03D054",
          "0x03F994",
          "0x0003D4",
          "0x003CC2",
          "0x003CD4",
          "0x003CE0",
          "0x003CEE"
        ]
      },
      {
        "name": "pre003cf3",
        "hit": 8,
        "block": 5034,
        "pc": "0x003CF3",
        "previous": "0x003CEE",
        "sp": "0xD1A845",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
          "0x03D033",
          "0x03D038",
          "0x03D044",
          "0x03D04C",
          "0x03D054",
          "0x03F994",
          "0x0003D4",
          "0x003CC2",
          "0x003CD4",
          "0x003CE0",
          "0x003CEE",
          "0x003CF3"
        ]
      },
      {
        "name": "pre003cd4",
        "hit": 9,
        "block": 5985,
        "pc": "0x003CD4",
        "previous": "0x003CC2",
        "sp": "0xD1A842",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
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
          "0x003CD4"
        ]
      },
      {
        "name": "pre003ce0",
        "hit": 9,
        "block": 5986,
        "pc": "0x003CE0",
        "previous": "0x003CD4",
        "sp": "0xD1A842",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
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
          "0x003CE0"
        ]
      },
      {
        "name": "pre003cee",
        "hit": 9,
        "block": 5987,
        "pc": "0x003CEE",
        "previous": "0x003CE0",
        "sp": "0xD1A842",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
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
          "0x003CEE"
        ]
      },
      {
        "name": "pre003cf3",
        "hit": 9,
        "block": 5988,
        "pc": "0x003CF3",
        "previous": "0x003CEE",
        "sp": "0xD1A842",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
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
          "0x003CF3"
        ]
      },
      {
        "name": "pre003cd4",
        "hit": 10,
        "block": 6107,
        "pc": "0x003CD4",
        "previous": "0x003CC2",
        "sp": "0xD1A84E",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
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
          "0x003CD4"
        ]
      },
      {
        "name": "pre003ce0",
        "hit": 10,
        "block": 6108,
        "pc": "0x003CE0",
        "previous": "0x003CD4",
        "sp": "0xD1A84E",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
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
          "0x003CE0"
        ]
      },
      {
        "name": "pre003cee",
        "hit": 10,
        "block": 6109,
        "pc": "0x003CEE",
        "previous": "0x003CE0",
        "sp": "0xD1A84E",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
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
          "0x003CEE"
        ]
      },
      {
        "name": "pre003cf3",
        "hit": 10,
        "block": 6110,
        "pc": "0x003CF3",
        "previous": "0x003CEE",
        "sp": "0xD1A84E",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
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
          "0x003CF3"
        ]
      },
      {
        "name": "pre003cd4",
        "hit": 11,
        "block": 6307,
        "pc": "0x003CD4",
        "previous": "0x003CC2",
        "sp": "0xD1A842",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
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
          "0x003CD4"
        ]
      },
      {
        "name": "pre003ce0",
        "hit": 11,
        "block": 6308,
        "pc": "0x003CE0",
        "previous": "0x003CD4",
        "sp": "0xD1A842",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
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
          "0x003CE0"
        ]
      },
      {
        "name": "pre003cee",
        "hit": 11,
        "block": 6309,
        "pc": "0x003CEE",
        "previous": "0x003CE0",
        "sp": "0xD1A842",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
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
          "0x003CEE"
        ]
      },
      {
        "name": "pre003cf3",
        "hit": 11,
        "block": 6310,
        "pc": "0x003CF3",
        "previous": "0x003CEE",
        "sp": "0xD1A842",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
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
          "0x003CF3"
        ]
      },
      {
        "name": "pre003cd4",
        "hit": 12,
        "block": 6507,
        "pc": "0x003CD4",
        "previous": "0x003CC2",
        "sp": "0xD1A839",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
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
          "0x003CD4"
        ]
      },
      {
        "name": "pre003ce0",
        "hit": 12,
        "block": 6508,
        "pc": "0x003CE0",
        "previous": "0x003CD4",
        "sp": "0xD1A839",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
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
          "0x003CE0"
        ]
      },
      {
        "name": "pre003cee",
        "hit": 12,
        "block": 6509,
        "pc": "0x003CEE",
        "previous": "0x003CE0",
        "sp": "0xD1A839",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
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
          "0x003CEE"
        ]
      },
      {
        "name": "pre003cf3",
        "hit": 12,
        "block": 6510,
        "pc": "0x003CF3",
        "previous": "0x003CEE",
        "sp": "0xD1A839",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
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
          "0x003CF3"
        ]
      },
      {
        "name": "pre003cd4",
        "hit": 13,
        "block": 7946,
        "pc": "0x003CD4",
        "previous": "0x003CC2",
        "sp": "0xD1A851",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
          "0x03CFE5",
          "0x03CFEA",
          "0x03D029",
          "0x03D033",
          "0x03D038",
          "0x03D044",
          "0x03D04C",
          "0x03D054",
          "0x03F994",
          "0x0003D4",
          "0x003CC2",
          "0x003CD4"
        ]
      },
      {
        "name": "pre003ce0",
        "hit": 13,
        "block": 7947,
        "pc": "0x003CE0",
        "previous": "0x003CD4",
        "sp": "0xD1A851",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
          "0x03CFEA",
          "0x03D029",
          "0x03D033",
          "0x03D038",
          "0x03D044",
          "0x03D04C",
          "0x03D054",
          "0x03F994",
          "0x0003D4",
          "0x003CC2",
          "0x003CD4",
          "0x003CE0"
        ]
      },
      {
        "name": "pre003cee",
        "hit": 13,
        "block": 7948,
        "pc": "0x003CEE",
        "previous": "0x003CE0",
        "sp": "0xD1A851",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
          "0x03D029",
          "0x03D033",
          "0x03D038",
          "0x03D044",
          "0x03D04C",
          "0x03D054",
          "0x03F994",
          "0x0003D4",
          "0x003CC2",
          "0x003CD4",
          "0x003CE0",
          "0x003CEE"
        ]
      },
      {
        "name": "pre003cf3",
        "hit": 13,
        "block": 7949,
        "pc": "0x003CF3",
        "previous": "0x003CEE",
        "sp": "0xD1A851",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
          "0x03D033",
          "0x03D038",
          "0x03D044",
          "0x03D04C",
          "0x03D054",
          "0x03F994",
          "0x0003D4",
          "0x003CC2",
          "0x003CD4",
          "0x003CE0",
          "0x003CEE",
          "0x003CF3"
        ]
      },
      {
        "name": "pre003cd4",
        "hit": 14,
        "block": 9250,
        "pc": "0x003CD4",
        "previous": "0x003CC2",
        "sp": "0xD1A845",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
          "0x03CFE5",
          "0x03CFEA",
          "0x03D029",
          "0x03D033",
          "0x03D038",
          "0x03D044",
          "0x03D04C",
          "0x03D054",
          "0x03F994",
          "0x0003D4",
          "0x003CC2",
          "0x003CD4"
        ]
      },
      {
        "name": "pre003ce0",
        "hit": 14,
        "block": 9251,
        "pc": "0x003CE0",
        "previous": "0x003CD4",
        "sp": "0xD1A845",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
          "0x03CFEA",
          "0x03D029",
          "0x03D033",
          "0x03D038",
          "0x03D044",
          "0x03D04C",
          "0x03D054",
          "0x03F994",
          "0x0003D4",
          "0x003CC2",
          "0x003CD4",
          "0x003CE0"
        ]
      },
      {
        "name": "pre003cee",
        "hit": 14,
        "block": 9252,
        "pc": "0x003CEE",
        "previous": "0x003CE0",
        "sp": "0xD1A845",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
          "0x03D029",
          "0x03D033",
          "0x03D038",
          "0x03D044",
          "0x03D04C",
          "0x03D054",
          "0x03F994",
          "0x0003D4",
          "0x003CC2",
          "0x003CD4",
          "0x003CE0",
          "0x003CEE"
        ]
      },
      {
        "name": "pre003cf3",
        "hit": 14,
        "block": 9253,
        "pc": "0x003CF3",
        "previous": "0x003CEE",
        "sp": "0xD1A845",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
          "0x03D033",
          "0x03D038",
          "0x03D044",
          "0x03D04C",
          "0x03D054",
          "0x03F994",
          "0x0003D4",
          "0x003CC2",
          "0x003CD4",
          "0x003CE0",
          "0x003CEE",
          "0x003CF3"
        ]
      },
      {
        "name": "pre003cd4",
        "hit": 15,
        "block": 9506,
        "pc": "0x003CD4",
        "previous": "0x003CC2",
        "sp": "0xD1A823",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
          "0x03CFE5",
          "0x03CFEA",
          "0x03D029",
          "0x03D033",
          "0x03D038",
          "0x03D044",
          "0x03D04C",
          "0x03D054",
          "0x03F994",
          "0x0003D4",
          "0x003CC2",
          "0x003CD4"
        ]
      },
      {
        "name": "pre003ce0",
        "hit": 15,
        "block": 9507,
        "pc": "0x003CE0",
        "previous": "0x003CD4",
        "sp": "0xD1A823",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
          "0x03CFEA",
          "0x03D029",
          "0x03D033",
          "0x03D038",
          "0x03D044",
          "0x03D04C",
          "0x03D054",
          "0x03F994",
          "0x0003D4",
          "0x003CC2",
          "0x003CD4",
          "0x003CE0"
        ]
      },
      {
        "name": "pre003cee",
        "hit": 15,
        "block": 9508,
        "pc": "0x003CEE",
        "previous": "0x003CE0",
        "sp": "0xD1A823",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
          "0x03D029",
          "0x03D033",
          "0x03D038",
          "0x03D044",
          "0x03D04C",
          "0x03D054",
          "0x03F994",
          "0x0003D4",
          "0x003CC2",
          "0x003CD4",
          "0x003CE0",
          "0x003CEE"
        ]
      },
      {
        "name": "pre003cf3",
        "hit": 15,
        "block": 9509,
        "pc": "0x003CF3",
        "previous": "0x003CEE",
        "sp": "0xD1A823",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
          "0x03D033",
          "0x03D038",
          "0x03D044",
          "0x03D04C",
          "0x03D054",
          "0x03F994",
          "0x0003D4",
          "0x003CC2",
          "0x003CD4",
          "0x003CE0",
          "0x003CEE",
          "0x003CF3"
        ]
      },
      {
        "name": "pre003cd4",
        "hit": 16,
        "block": 9706,
        "pc": "0x003CD4",
        "previous": "0x003CC2",
        "sp": "0xD1A82C",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
          "0x03CFE5",
          "0x03CFEA",
          "0x03D029",
          "0x03D033",
          "0x03D038",
          "0x03D044",
          "0x03D04C",
          "0x03D054",
          "0x03F994",
          "0x0003D4",
          "0x003CC2",
          "0x003CD4"
        ]
      },
      {
        "name": "pre003ce0",
        "hit": 16,
        "block": 9707,
        "pc": "0x003CE0",
        "previous": "0x003CD4",
        "sp": "0xD1A82C",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
          "0x03CFEA",
          "0x03D029",
          "0x03D033",
          "0x03D038",
          "0x03D044",
          "0x03D04C",
          "0x03D054",
          "0x03F994",
          "0x0003D4",
          "0x003CC2",
          "0x003CD4",
          "0x003CE0"
        ]
      },
      {
        "name": "pre003cee",
        "hit": 16,
        "block": 9708,
        "pc": "0x003CEE",
        "previous": "0x003CE0",
        "sp": "0xD1A82C",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
          "0x03D029",
          "0x03D033",
          "0x03D038",
          "0x03D044",
          "0x03D04C",
          "0x03D054",
          "0x03F994",
          "0x0003D4",
          "0x003CC2",
          "0x003CD4",
          "0x003CE0",
          "0x003CEE"
        ]
      },
      {
        "name": "pre003cf3",
        "hit": 16,
        "block": 9709,
        "pc": "0x003CF3",
        "previous": "0x003CEE",
        "sp": "0xD1A82C",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
          "0x03D033",
          "0x03D038",
          "0x03D044",
          "0x03D04C",
          "0x03D054",
          "0x03F994",
          "0x0003D4",
          "0x003CC2",
          "0x003CD4",
          "0x003CE0",
          "0x003CEE",
          "0x003CF3"
        ]
      },
      {
        "name": "pre003cd4",
        "hit": 17,
        "block": 9906,
        "pc": "0x003CD4",
        "previous": "0x003CC2",
        "sp": "0xD1A829",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
          "0x03CFE5",
          "0x03CFEA",
          "0x03D029",
          "0x03D033",
          "0x03D038",
          "0x03D044",
          "0x03D04C",
          "0x03D054",
          "0x03F994",
          "0x0003D4",
          "0x003CC2",
          "0x003CD4"
        ]
      },
      {
        "name": "pre003ce0",
        "hit": 17,
        "block": 9907,
        "pc": "0x003CE0",
        "previous": "0x003CD4",
        "sp": "0xD1A829",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
          "0x03CFEA",
          "0x03D029",
          "0x03D033",
          "0x03D038",
          "0x03D044",
          "0x03D04C",
          "0x03D054",
          "0x03F994",
          "0x0003D4",
          "0x003CC2",
          "0x003CD4",
          "0x003CE0"
        ]
      },
      {
        "name": "pre003cee",
        "hit": 17,
        "block": 9908,
        "pc": "0x003CEE",
        "previous": "0x003CE0",
        "sp": "0xD1A829",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
          "0x03D029",
          "0x03D033",
          "0x03D038",
          "0x03D044",
          "0x03D04C",
          "0x03D054",
          "0x03F994",
          "0x0003D4",
          "0x003CC2",
          "0x003CD4",
          "0x003CE0",
          "0x003CEE"
        ]
      },
      {
        "name": "pre003cf3",
        "hit": 17,
        "block": 9909,
        "pc": "0x003CF3",
        "previous": "0x003CEE",
        "sp": "0xD1A829",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
          "0x03D033",
          "0x03D038",
          "0x03D044",
          "0x03D04C",
          "0x03D054",
          "0x03F994",
          "0x0003D4",
          "0x003CC2",
          "0x003CD4",
          "0x003CE0",
          "0x003CEE",
          "0x003CF3"
        ]
      },
      {
        "name": "pre003cd4",
        "hit": 18,
        "block": 10299,
        "pc": "0x003CD4",
        "previous": "0x003CC2",
        "sp": "0xF9DCFF",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
          "0x03CFE5",
          "0x03CFEA",
          "0x03D029",
          "0x03D033",
          "0x03D038",
          "0x03D044",
          "0x03D04C",
          "0x03D054",
          "0x03F994",
          "0x0003D4",
          "0x003CC2",
          "0x003CD4"
        ]
      },
      {
        "name": "pre003ce0",
        "hit": 18,
        "block": 10300,
        "pc": "0x003CE0",
        "previous": "0x003CD4",
        "sp": "0xF9DCFF",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
          "0x03CFEA",
          "0x03D029",
          "0x03D033",
          "0x03D038",
          "0x03D044",
          "0x03D04C",
          "0x03D054",
          "0x03F994",
          "0x0003D4",
          "0x003CC2",
          "0x003CD4",
          "0x003CE0"
        ]
      },
      {
        "name": "pre003cee",
        "hit": 18,
        "block": 10301,
        "pc": "0x003CEE",
        "previous": "0x003CE0",
        "sp": "0xF9DCFF",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
          "0x03D029",
          "0x03D033",
          "0x03D038",
          "0x03D044",
          "0x03D04C",
          "0x03D054",
          "0x03F994",
          "0x0003D4",
          "0x003CC2",
          "0x003CD4",
          "0x003CE0",
          "0x003CEE"
        ]
      },
      {
        "name": "pre003cf3",
        "hit": 18,
        "block": 10302,
        "pc": "0x003CF3",
        "previous": "0x003CEE",
        "sp": "0xF9DCFF",
        "top": "0x03F998",
        "stackTail": [
          "0x03D054",
          "0x03F994"
        ],
        "recentTail": [
          "0x03D033",
          "0x03D038",
          "0x03D044",
          "0x03D04C",
          "0x03D054",
          "0x03F994",
          "0x0003D4",
          "0x003CC2",
          "0x003CD4",
          "0x003CE0",
          "0x003CEE",
          "0x003CF3"
        ]
      },
      {
        "name": "pre0028d1",
        "hit": 1,
        "block": 12619,
        "pc": "0x0028D1",
        "previous": "0x0013F8",
        "sp": "0xD1A87B",
        "top": "0x0013FC",
        "stackTail": [
          "0x0013F8"
        ],
        "recentTail": [
          "0x003C1F",
          "0x003C27",
          "0x0061E5",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C42",
          "0x003B0D",
          "0x003B17",
          "0x0013F4",
          "0x0013F8",
          "0x0028D1"
        ]
      },
      {
        "name": "pre0013fc",
        "hit": 1,
        "block": 12620,
        "pc": "0x0013FC",
        "previous": "0x0028D1",
        "sp": "0xD1A87E",
        "top": "0x000000",
        "stackTail": [],
        "recentTail": [
          "0x003C27",
          "0x0061E5",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C42",
          "0x003B0D",
          "0x003B17",
          "0x0013F4",
          "0x0013F8",
          "0x0028D1",
          "0x0013FC"
        ]
      },
      {
        "name": "pre001405",
        "hit": 1,
        "block": 12621,
        "pc": "0x001405",
        "previous": "0x0013FC",
        "sp": "0xD1A87E",
        "top": "0x000000",
        "stackTail": [],
        "recentTail": [
          "0x0061E5",
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C42",
          "0x003B0D",
          "0x003B17",
          "0x0013F4",
          "0x0013F8",
          "0x0028D1",
          "0x0013FC",
          "0x001405"
        ]
      },
      {
        "name": "pre003cbc",
        "hit": 1,
        "block": 12622,
        "pc": "0x003CBC",
        "previous": "0x001405",
        "sp": "0xD1A87B",
        "top": "0x001409",
        "stackTail": [
          "0x001405"
        ],
        "recentTail": [
          "0x0061E9",
          "0x0061FD",
          "0x006202",
          "0x003C42",
          "0x003B0D",
          "0x003B17",
          "0x0013F4",
          "0x0013F8",
          "0x0028D1",
          "0x0013FC",
          "0x001405",
          "0x003CBC"
        ]
      },
      {
        "name": "pre003cc6",
        "hit": 1,
        "block": 12623,
        "pc": "0x003CC6",
        "previous": "0x003CBC",
        "sp": "0xD1A87B",
        "top": "0x001409",
        "stackTail": [
          "0x001405"
        ],
        "recentTail": [
          "0x0061FD",
          "0x006202",
          "0x003C42",
          "0x003B0D",
          "0x003B17",
          "0x0013F4",
          "0x0013F8",
          "0x0028D1",
          "0x0013FC",
          "0x001405",
          "0x003CBC",
          "0x003CC6"
        ]
      },
      {
        "name": "pre003cd4",
        "hit": 19,
        "block": 12624,
        "pc": "0x003CD4",
        "previous": "0x003CC6",
        "sp": "0xD1A87B",
        "top": "0x001409",
        "stackTail": [
          "0x001405"
        ],
        "recentTail": [
          "0x006202",
          "0x003C42",
          "0x003B0D",
          "0x003B17",
          "0x0013F4",
          "0x0013F8",
          "0x0028D1",
          "0x0013FC",
          "0x001405",
          "0x003CBC",
          "0x003CC6",
          "0x003CD4"
        ]
      },
      {
        "name": "pre003ce0",
        "hit": 19,
        "block": 12625,
        "pc": "0x003CE0",
        "previous": "0x003CD4",
        "sp": "0xD1A87B",
        "top": "0x001409",
        "stackTail": [
          "0x001405"
        ],
        "recentTail": [
          "0x003C42",
          "0x003B0D",
          "0x003B17",
          "0x0013F4",
          "0x0013F8",
          "0x0028D1",
          "0x0013FC",
          "0x001405",
          "0x003CBC",
          "0x003CC6",
          "0x003CD4",
          "0x003CE0"
        ]
      },
      {
        "name": "pre003cee",
        "hit": 19,
        "block": 12626,
        "pc": "0x003CEE",
        "previous": "0x003CE0",
        "sp": "0xD1A87B",
        "top": "0x001409",
        "stackTail": [
          "0x001405"
        ],
        "recentTail": [
          "0x003B0D",
          "0x003B17",
          "0x0013F4",
          "0x0013F8",
          "0x0028D1",
          "0x0013FC",
          "0x001405",
          "0x003CBC",
          "0x003CC6",
          "0x003CD4",
          "0x003CE0",
          "0x003CEE"
        ]
      },
      {
        "name": "pre003cf3",
        "hit": 19,
        "block": 12627,
        "pc": "0x003CF3",
        "previous": "0x003CEE",
        "sp": "0xD1A87B",
        "top": "0x001409",
        "stackTail": [
          "0x001405"
        ],
        "recentTail": [
          "0x003B17",
          "0x0013F4",
          "0x0013F8",
          "0x0028D1",
          "0x0013FC",
          "0x001405",
          "0x003CBC",
          "0x003CC6",
          "0x003CD4",
          "0x003CE0",
          "0x003CEE",
          "0x003CF3"
        ]
      },
      {
        "name": "pre001428",
        "hit": 1,
        "block": 12631,
        "pc": "0x001428",
        "previous": "0x0008BB",
        "sp": "0xD1A87E",
        "top": "0x000000",
        "stackTail": [],
        "recentTail": [
          "0x0013FC",
          "0x001405",
          "0x003CBC",
          "0x003CC6",
          "0x003CD4",
          "0x003CE0",
          "0x003CEE",
          "0x003CF3",
          "0x001409",
          "0x001424",
          "0x0008BB",
          "0x001428"
        ]
      },
      {
        "name": "pre00142c",
        "hit": 1,
        "block": 12632,
        "pc": "0x00142C",
        "previous": "0x001428",
        "sp": "0xD1A87E",
        "top": "0x000000",
        "stackTail": [],
        "recentTail": [
          "0x001405",
          "0x003CBC",
          "0x003CC6",
          "0x003CD4",
          "0x003CE0",
          "0x003CEE",
          "0x003CF3",
          "0x001409",
          "0x001424",
          "0x0008BB",
          "0x001428",
          "0x00142C"
        ]
      },
      {
        "name": "seed000721",
        "hit": 1,
        "block": 12633,
        "pc": "0x000721",
        "previous": "0x00142C",
        "sp": "0xD1A87E",
        "top": "0x000000",
        "stackTail": [],
        "recentTail": [
          "0x003CBC",
          "0x003CC6",
          "0x003CD4",
          "0x003CE0",
          "0x003CEE",
          "0x003CF3",
          "0x001409",
          "0x001424",
          "0x0008BB",
          "0x001428",
          "0x00142C",
          "0x000721"
        ]
      },
      {
        "name": "seed013d00",
        "hit": 1,
        "block": 12634,
        "pc": "0x013D00",
        "previous": "0x000721",
        "sp": "0xD1A87B",
        "top": "0x000725",
        "stackTail": [
          "0x000721"
        ],
        "recentTail": [
          "0x003CC6",
          "0x003CD4",
          "0x003CE0",
          "0x003CEE",
          "0x003CF3",
          "0x001409",
          "0x001424",
          "0x0008BB",
          "0x001428",
          "0x00142C",
          "0x000721",
          "0x013D00"
        ]
      },
      {
        "name": "seed005ba6",
        "hit": 1,
        "block": 12635,
        "pc": "0x005BA6",
        "previous": "0x013D00",
        "sp": "0xD1A86F",
        "top": "0x013D11",
        "stackTail": [
          "0x000721",
          "0x013D00"
        ],
        "recentTail": [
          "0x003CD4",
          "0x003CE0",
          "0x003CEE",
          "0x003CF3",
          "0x001409",
          "0x001424",
          "0x0008BB",
          "0x001428",
          "0x00142C",
          "0x000721",
          "0x013D00",
          "0x005BA6"
        ]
      },
      {
        "name": "seed013d11",
        "hit": 1,
        "block": 12636,
        "pc": "0x013D11",
        "previous": "0x005BA6",
        "sp": "0xD1A872",
        "top": "0x000000",
        "stackTail": [
          "0x000721"
        ],
        "recentTail": [
          "0x003CE0",
          "0x003CEE",
          "0x003CF3",
          "0x001409",
          "0x001424",
          "0x0008BB",
          "0x001428",
          "0x00142C",
          "0x000721",
          "0x013D00",
          "0x005BA6",
          "0x013D11"
        ]
      },
      {
        "name": "display0059c6",
        "hit": 1,
        "block": 12637,
        "pc": "0x0059C6",
        "previous": "0x013D11",
        "sp": "0xD1A86F",
        "top": "0x013D1D",
        "stackTail": [
          "0x000721",
          "0x013D11"
        ],
        "recentTail": [
          "0x003CEE",
          "0x003CF3",
          "0x001409",
          "0x001424",
          "0x0008BB",
          "0x001428",
          "0x00142C",
          "0x000721",
          "0x013D00",
          "0x005BA6",
          "0x013D11",
          "0x0059C6"
        ]
      },
      {
        "name": "display0059c6",
        "hit": 2,
        "block": 12723,
        "pc": "0x0059C6",
        "previous": "0x013D19",
        "sp": "0xD1A86F",
        "top": "0x013D1D",
        "stackTail": [
          "0x013D19"
        ],
        "recentTail": [
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005B92",
          "0x005A19",
          "0x0059DA",
          "0x0059E6",
          "0x013D1D",
          "0x013D19",
          "0x0059C6"
        ]
      },
      {
        "name": "display0059c6",
        "hit": 3,
        "block": 12809,
        "pc": "0x0059C6",
        "previous": "0x013D19",
        "sp": "0xD1A86F",
        "top": "0x013D1D",
        "stackTail": [
          "0x013D19"
        ],
        "recentTail": [
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005B92",
          "0x005A19",
          "0x0059DA",
          "0x0059E6",
          "0x013D1D",
          "0x013D19",
          "0x0059C6"
        ]
      },
      {
        "name": "display0059c6",
        "hit": 4,
        "block": 12895,
        "pc": "0x0059C6",
        "previous": "0x013D19",
        "sp": "0xD1A86F",
        "top": "0x013D1D",
        "stackTail": [
          "0x013D19"
        ],
        "recentTail": [
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005B92",
          "0x005A19",
          "0x0059DA",
          "0x0059E6",
          "0x013D1D",
          "0x013D19",
          "0x0059C6"
        ]
      },
      {
        "name": "display0059c6",
        "hit": 5,
        "block": 12981,
        "pc": "0x0059C6",
        "previous": "0x013D19",
        "sp": "0xD1A86F",
        "top": "0x013D1D",
        "stackTail": [
          "0x013D19"
        ],
        "recentTail": [
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005B92",
          "0x005A19",
          "0x0059DA",
          "0x0059E6",
          "0x013D1D",
          "0x013D19",
          "0x0059C6"
        ]
      },
      {
        "name": "display0059c6",
        "hit": 6,
        "block": 13067,
        "pc": "0x0059C6",
        "previous": "0x013D19",
        "sp": "0xD1A86F",
        "top": "0x013D1D",
        "stackTail": [
          "0x013D19"
        ],
        "recentTail": [
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005B92",
          "0x005A19",
          "0x0059DA",
          "0x0059E6",
          "0x013D1D",
          "0x013D19",
          "0x0059C6"
        ]
      },
      {
        "name": "display0059c6",
        "hit": 7,
        "block": 13153,
        "pc": "0x0059C6",
        "previous": "0x013D19",
        "sp": "0xD1A86F",
        "top": "0x013D1D",
        "stackTail": [
          "0x013D19"
        ],
        "recentTail": [
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005B92",
          "0x005A19",
          "0x0059DA",
          "0x0059E6",
          "0x013D1D",
          "0x013D19",
          "0x0059C6"
        ]
      },
      {
        "name": "display0059c6",
        "hit": 8,
        "block": 13239,
        "pc": "0x0059C6",
        "previous": "0x013D19",
        "sp": "0xD1A86F",
        "top": "0x013D1D",
        "stackTail": [
          "0x013D19"
        ],
        "recentTail": [
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005B92",
          "0x005A19",
          "0x0059DA",
          "0x0059E6",
          "0x013D1D",
          "0x013D19",
          "0x0059C6"
        ]
      },
      {
        "name": "display0059c6",
        "hit": 9,
        "block": 13325,
        "pc": "0x0059C6",
        "previous": "0x013D19",
        "sp": "0xD1A86F",
        "top": "0x013D1D",
        "stackTail": [
          "0x013D19"
        ],
        "recentTail": [
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005B92",
          "0x005A19",
          "0x0059DA",
          "0x0059E6",
          "0x013D1D",
          "0x013D19",
          "0x0059C6"
        ]
      },
      {
        "name": "display0059c6",
        "hit": 10,
        "block": 13411,
        "pc": "0x0059C6",
        "previous": "0x013D19",
        "sp": "0xD1A86F",
        "top": "0x013D1D",
        "stackTail": [
          "0x013D19"
        ],
        "recentTail": [
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005B92",
          "0x005A19",
          "0x0059DA",
          "0x0059E6",
          "0x013D1D",
          "0x013D19",
          "0x0059C6"
        ]
      },
      {
        "name": "display0059c6",
        "hit": 11,
        "block": 13497,
        "pc": "0x0059C6",
        "previous": "0x013D19",
        "sp": "0xD1A86F",
        "top": "0x013D1D",
        "stackTail": [
          "0x013D19"
        ],
        "recentTail": [
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005B92",
          "0x005A19",
          "0x0059DA",
          "0x0059E6",
          "0x013D1D",
          "0x013D19",
          "0x0059C6"
        ]
      },
      {
        "name": "display0059c6",
        "hit": 12,
        "block": 13583,
        "pc": "0x0059C6",
        "previous": "0x013D19",
        "sp": "0xD1A86F",
        "top": "0x013D1D",
        "stackTail": [
          "0x013D19"
        ],
        "recentTail": [
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005B92",
          "0x005A19",
          "0x0059DA",
          "0x0059E6",
          "0x013D1D",
          "0x013D19",
          "0x0059C6"
        ]
      },
      {
        "name": "display0059c6",
        "hit": 13,
        "block": 13669,
        "pc": "0x0059C6",
        "previous": "0x013D19",
        "sp": "0xD1A86F",
        "top": "0x013D1D",
        "stackTail": [
          "0x013D19"
        ],
        "recentTail": [
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005B92",
          "0x005A19",
          "0x0059DA",
          "0x0059E6",
          "0x013D1D",
          "0x013D19",
          "0x0059C6"
        ]
      },
      {
        "name": "display0059c6",
        "hit": 14,
        "block": 13755,
        "pc": "0x0059C6",
        "previous": "0x013D19",
        "sp": "0xD1A86F",
        "top": "0x013D1D",
        "stackTail": [
          "0x013D19"
        ],
        "recentTail": [
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005B92",
          "0x005A19",
          "0x0059DA",
          "0x0059E6",
          "0x013D1D",
          "0x013D19",
          "0x0059C6"
        ]
      },
      {
        "name": "display0059c6",
        "hit": 15,
        "block": 13843,
        "pc": "0x0059C6",
        "previous": "0x0059F3",
        "sp": "0xD1A866",
        "top": "0x0059F7",
        "stackTail": [
          "0x013D1F",
          "0x0059E9",
          "0x0059F3"
        ],
        "recentTail": [
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005B92",
          "0x005A19",
          "0x0059DA",
          "0x0059E6",
          "0x013D1D",
          "0x013D1F",
          "0x0059E9",
          "0x0059F3",
          "0x0059C6"
        ]
      },
      {
        "name": "display0059c6",
        "hit": 16,
        "block": 13930,
        "pc": "0x0059C6",
        "previous": "0x0059F3",
        "sp": "0xD1A866",
        "top": "0x0059F7",
        "stackTail": [
          "0x0059F3"
        ],
        "recentTail": [
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005B92",
          "0x005A19",
          "0x0059DA",
          "0x0059E6",
          "0x0059F7",
          "0x0059ED",
          "0x0059F3",
          "0x0059C6"
        ]
      },
      {
        "name": "display0059c6",
        "hit": 17,
        "block": 14017,
        "pc": "0x0059C6",
        "previous": "0x0059F3",
        "sp": "0xD1A866",
        "top": "0x0059F7",
        "stackTail": [
          "0x0059F3"
        ],
        "recentTail": [
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005B92",
          "0x005A19",
          "0x0059DA",
          "0x0059E6",
          "0x0059F7",
          "0x0059ED",
          "0x0059F3",
          "0x0059C6"
        ]
      },
      {
        "name": "display0059c6",
        "hit": 18,
        "block": 14104,
        "pc": "0x0059C6",
        "previous": "0x0059F3",
        "sp": "0xD1A866",
        "top": "0x0059F7",
        "stackTail": [
          "0x0059F3"
        ],
        "recentTail": [
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005B92",
          "0x005A19",
          "0x0059DA",
          "0x0059E6",
          "0x0059F7",
          "0x0059ED",
          "0x0059F3",
          "0x0059C6"
        ]
      },
      {
        "name": "display0059c6",
        "hit": 19,
        "block": 14191,
        "pc": "0x0059C6",
        "previous": "0x0059F3",
        "sp": "0xD1A866",
        "top": "0x0059F7",
        "stackTail": [
          "0x0059F3"
        ],
        "recentTail": [
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005B92",
          "0x005A19",
          "0x0059DA",
          "0x0059E6",
          "0x0059F7",
          "0x0059ED",
          "0x0059F3",
          "0x0059C6"
        ]
      },
      {
        "name": "display0059c6",
        "hit": 20,
        "block": 14278,
        "pc": "0x0059C6",
        "previous": "0x0059F3",
        "sp": "0xD1A866",
        "top": "0x0059F7",
        "stackTail": [
          "0x0059F3"
        ],
        "recentTail": [
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005B92",
          "0x005A19",
          "0x0059DA",
          "0x0059E6",
          "0x0059F7",
          "0x0059ED",
          "0x0059F3",
          "0x0059C6"
        ]
      },
      {
        "name": "display0059c6",
        "hit": 21,
        "block": 14365,
        "pc": "0x0059C6",
        "previous": "0x0059F3",
        "sp": "0xD1A866",
        "top": "0x0059F7",
        "stackTail": [
          "0x0059F3"
        ],
        "recentTail": [
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005B92",
          "0x005A19",
          "0x0059DA",
          "0x0059E6",
          "0x0059F7",
          "0x0059ED",
          "0x0059F3",
          "0x0059C6"
        ]
      },
      {
        "name": "display0059c6",
        "hit": 22,
        "block": 14452,
        "pc": "0x0059C6",
        "previous": "0x0059F3",
        "sp": "0xD1A866",
        "top": "0x0059F7",
        "stackTail": [
          "0x0059F3"
        ],
        "recentTail": [
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005B92",
          "0x005A19",
          "0x0059DA",
          "0x0059E6",
          "0x0059F7",
          "0x0059ED",
          "0x0059F3",
          "0x0059C6"
        ]
      },
      {
        "name": "display0059c6",
        "hit": 23,
        "block": 14539,
        "pc": "0x0059C6",
        "previous": "0x0059F3",
        "sp": "0xD1A866",
        "top": "0x0059F7",
        "stackTail": [
          "0x0059F3"
        ],
        "recentTail": [
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005B92",
          "0x005A19",
          "0x0059DA",
          "0x0059E6",
          "0x0059F7",
          "0x0059ED",
          "0x0059F3",
          "0x0059C6"
        ]
      },
      {
        "name": "display0059c6",
        "hit": 24,
        "block": 14626,
        "pc": "0x0059C6",
        "previous": "0x0059F3",
        "sp": "0xD1A866",
        "top": "0x0059F7",
        "stackTail": [
          "0x0059F3"
        ],
        "recentTail": [
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005B92",
          "0x005A19",
          "0x0059DA",
          "0x0059E6",
          "0x0059F7",
          "0x0059ED",
          "0x0059F3",
          "0x0059C6"
        ]
      },
      {
        "name": "display0059c6",
        "hit": 25,
        "block": 14713,
        "pc": "0x0059C6",
        "previous": "0x0059F3",
        "sp": "0xD1A866",
        "top": "0x0059F7",
        "stackTail": [
          "0x0059F3"
        ],
        "recentTail": [
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005B92",
          "0x005A19",
          "0x0059DA",
          "0x0059E6",
          "0x0059F7",
          "0x0059ED",
          "0x0059F3",
          "0x0059C6"
        ]
      }
    ],
    "tailTransitions": [
      {
        "name": "display005b92",
        "hit": 1,
        "block": 12717,
        "pc": "0x005B92",
        "previous": "0x005B4B",
        "sp": "0xD1A857",
        "top": "0x000000",
        "stackTail": [
          "0x000721",
          "0x013D11",
          "0x0059C6"
        ],
        "recentTail": [
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005B92"
        ]
      },
      {
        "name": "display005b92",
        "hit": 2,
        "block": 12803,
        "pc": "0x005B92",
        "previous": "0x005B4B",
        "sp": "0xD1A857",
        "top": "0x000000",
        "stackTail": [
          "0x013D19",
          "0x0059C6"
        ],
        "recentTail": [
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005B92"
        ]
      },
      {
        "name": "display005b92",
        "hit": 3,
        "block": 12889,
        "pc": "0x005B92",
        "previous": "0x005B4B",
        "sp": "0xD1A857",
        "top": "0x000000",
        "stackTail": [
          "0x013D19",
          "0x0059C6"
        ],
        "recentTail": [
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005B92"
        ]
      },
      {
        "name": "display005b92",
        "hit": 4,
        "block": 12975,
        "pc": "0x005B92",
        "previous": "0x005B4B",
        "sp": "0xD1A857",
        "top": "0x000000",
        "stackTail": [
          "0x013D19",
          "0x0059C6"
        ],
        "recentTail": [
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005B92"
        ]
      },
      {
        "name": "display005b92",
        "hit": 5,
        "block": 13061,
        "pc": "0x005B92",
        "previous": "0x005B4B",
        "sp": "0xD1A857",
        "top": "0x000000",
        "stackTail": [
          "0x013D19",
          "0x0059C6"
        ],
        "recentTail": [
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005B92"
        ]
      },
      {
        "name": "display005b92",
        "hit": 6,
        "block": 13147,
        "pc": "0x005B92",
        "previous": "0x005B4B",
        "sp": "0xD1A857",
        "top": "0x000000",
        "stackTail": [
          "0x013D19",
          "0x0059C6"
        ],
        "recentTail": [
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005B92"
        ]
      },
      {
        "name": "display005b92",
        "hit": 7,
        "block": 13233,
        "pc": "0x005B92",
        "previous": "0x005B4B",
        "sp": "0xD1A857",
        "top": "0x000000",
        "stackTail": [
          "0x013D19",
          "0x0059C6"
        ],
        "recentTail": [
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005B92"
        ]
      },
      {
        "name": "display005b92",
        "hit": 8,
        "block": 13319,
        "pc": "0x005B92",
        "previous": "0x005B4B",
        "sp": "0xD1A857",
        "top": "0x000000",
        "stackTail": [
          "0x013D19",
          "0x0059C6"
        ],
        "recentTail": [
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005B92"
        ]
      },
      {
        "name": "display005b92",
        "hit": 9,
        "block": 13405,
        "pc": "0x005B92",
        "previous": "0x005B4B",
        "sp": "0xD1A857",
        "top": "0x000000",
        "stackTail": [
          "0x013D19",
          "0x0059C6"
        ],
        "recentTail": [
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005B92"
        ]
      },
      {
        "name": "display005b92",
        "hit": 10,
        "block": 13491,
        "pc": "0x005B92",
        "previous": "0x005B4B",
        "sp": "0xD1A857",
        "top": "0x000000",
        "stackTail": [
          "0x013D19",
          "0x0059C6"
        ],
        "recentTail": [
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005B92"
        ]
      },
      {
        "name": "display005b92",
        "hit": 11,
        "block": 13577,
        "pc": "0x005B92",
        "previous": "0x005B4B",
        "sp": "0xD1A857",
        "top": "0x000000",
        "stackTail": [
          "0x013D19",
          "0x0059C6"
        ],
        "recentTail": [
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005B92"
        ]
      },
      {
        "name": "display005b92",
        "hit": 12,
        "block": 13663,
        "pc": "0x005B92",
        "previous": "0x005B4B",
        "sp": "0xD1A857",
        "top": "0x000000",
        "stackTail": [
          "0x013D19",
          "0x0059C6"
        ],
        "recentTail": [
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005B92"
        ]
      },
      {
        "name": "display005b92",
        "hit": 13,
        "block": 13749,
        "pc": "0x005B92",
        "previous": "0x005B4B",
        "sp": "0xD1A857",
        "top": "0x000000",
        "stackTail": [
          "0x013D19",
          "0x0059C6"
        ],
        "recentTail": [
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005B92"
        ]
      },
      {
        "name": "display005b92",
        "hit": 14,
        "block": 13835,
        "pc": "0x005B92",
        "previous": "0x005B4B",
        "sp": "0xD1A857",
        "top": "0x000000",
        "stackTail": [
          "0x013D19",
          "0x0059C6"
        ],
        "recentTail": [
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005B92"
        ]
      },
      {
        "name": "display005b92",
        "hit": 15,
        "block": 13923,
        "pc": "0x005B92",
        "previous": "0x005B4B",
        "sp": "0xD1A84E",
        "top": "0x000000",
        "stackTail": [
          "0x013D1F",
          "0x0059E9",
          "0x0059F3",
          "0x0059C6"
        ],
        "recentTail": [
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005B92"
        ]
      },
      {
        "name": "display005b92",
        "hit": 16,
        "block": 14010,
        "pc": "0x005B92",
        "previous": "0x005B4B",
        "sp": "0xD1A84E",
        "top": "0x000000",
        "stackTail": [
          "0x0059F3",
          "0x0059C6"
        ],
        "recentTail": [
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005B92"
        ]
      },
      {
        "name": "display005b92",
        "hit": 17,
        "block": 14097,
        "pc": "0x005B92",
        "previous": "0x005B4B",
        "sp": "0xD1A84E",
        "top": "0x000000",
        "stackTail": [
          "0x0059F3",
          "0x0059C6"
        ],
        "recentTail": [
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005B92"
        ]
      },
      {
        "name": "display005b92",
        "hit": 18,
        "block": 14184,
        "pc": "0x005B92",
        "previous": "0x005B4B",
        "sp": "0xD1A84E",
        "top": "0x000000",
        "stackTail": [
          "0x0059F3",
          "0x0059C6"
        ],
        "recentTail": [
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005B92"
        ]
      },
      {
        "name": "display005b92",
        "hit": 19,
        "block": 14271,
        "pc": "0x005B92",
        "previous": "0x005B4B",
        "sp": "0xD1A84E",
        "top": "0x000000",
        "stackTail": [
          "0x0059F3",
          "0x0059C6"
        ],
        "recentTail": [
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005B92"
        ]
      },
      {
        "name": "display005b92",
        "hit": 20,
        "block": 14358,
        "pc": "0x005B92",
        "previous": "0x005B4B",
        "sp": "0xD1A84E",
        "top": "0x000000",
        "stackTail": [
          "0x0059F3",
          "0x0059C6"
        ],
        "recentTail": [
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005B92"
        ]
      },
      {
        "name": "display005b92",
        "hit": 21,
        "block": 14445,
        "pc": "0x005B92",
        "previous": "0x005B4B",
        "sp": "0xD1A84E",
        "top": "0x000000",
        "stackTail": [
          "0x0059F3",
          "0x0059C6"
        ],
        "recentTail": [
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005B92"
        ]
      },
      {
        "name": "display005b92",
        "hit": 22,
        "block": 14532,
        "pc": "0x005B92",
        "previous": "0x005B4B",
        "sp": "0xD1A84E",
        "top": "0x000000",
        "stackTail": [
          "0x0059F3",
          "0x0059C6"
        ],
        "recentTail": [
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005B92"
        ]
      },
      {
        "name": "display005b92",
        "hit": 23,
        "block": 14619,
        "pc": "0x005B92",
        "previous": "0x005B4B",
        "sp": "0xD1A84E",
        "top": "0x000000",
        "stackTail": [
          "0x0059F3",
          "0x0059C6"
        ],
        "recentTail": [
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005B92"
        ]
      },
      {
        "name": "display005b92",
        "hit": 24,
        "block": 14706,
        "pc": "0x005B92",
        "previous": "0x005B4B",
        "sp": "0xD1A84E",
        "top": "0x000000",
        "stackTail": [
          "0x0059F3",
          "0x0059C6"
        ],
        "recentTail": [
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005AB6",
          "0x005AE8",
          "0x005B16",
          "0x005B4B",
          "0x005B92"
        ]
      }
    ],
    "hotBlocks": [
      {
        "pc": "0x005AE8",
        "count": 1392
      },
      {
        "pc": "0x005B16",
        "count": 1392
      },
      {
        "pc": "0x005B4B",
        "count": 1392
      },
      {
        "pc": "0x005AB6",
        "count": 1305
      },
      {
        "pc": "0x0A19A4",
        "count": 912
      },
      {
        "pc": "0x0A18C4",
        "count": 496
      },
      {
        "pc": "0x0A1A83",
        "count": 432
      },
      {
        "pc": "0x0060B3",
        "count": 255
      },
      {
        "pc": "0x001377",
        "count": 254
      },
      {
        "pc": "0x0A1854",
        "count": 176
      },
      {
        "pc": "0x0A187C",
        "count": 176
      },
      {
        "pc": "0x0A188A",
        "count": 176
      },
      {
        "pc": "0x0A189E",
        "count": 176
      },
      {
        "pc": "0x0A18A6",
        "count": 176
      },
      {
        "pc": "0x0A18AF",
        "count": 176
      },
      {
        "pc": "0x0A18C1",
        "count": 176
      },
      {
        "pc": "0x0A18CA",
        "count": 176
      },
      {
        "pc": "0x0A18E9",
        "count": 176
      },
      {
        "pc": "0x0A191F",
        "count": 176
      },
      {
        "pc": "0x0A1939",
        "count": 176
      },
      {
        "pc": "0x0A1969",
        "count": 176
      },
      {
        "pc": "0x0A1976",
        "count": 176
      },
      {
        "pc": "0x0A1980",
        "count": 176
      },
      {
        "pc": "0x0A1988",
        "count": 176
      },
      {
        "pc": "0x0A1994",
        "count": 176
      },
      {
        "pc": "0x0A19AA",
        "count": 176
      },
      {
        "pc": "0x0A19B5",
        "count": 176
      },
      {
        "pc": "0x0A19B7",
        "count": 176
      },
      {
        "pc": "0x0A19D7",
        "count": 176
      },
      {
        "pc": "0x0A1A1D",
        "count": 176
      }
    ],
    "lastBlocks": [
      "0x001717",
      "0x001718",
      "0x005974",
      "0x005998",
      "0x005A8B",
      "0x005A48",
      "0x005A96",
      "0x005A53",
      "0x005AA2",
      "0x005AAE",
      "0x005AE8",
      "0x005B16",
      "0x005B4B",
      "0x005AB6",
      "0x005AE8",
      "0x005B16",
      "0x005B4B",
      "0x005AB6",
      "0x005AE8",
      "0x005B16",
      "0x005B4B",
      "0x005AB6",
      "0x005AE8",
      "0x005B16",
      "0x005B4B",
      "0x005AB6",
      "0x005AE8",
      "0x005B16",
      "0x005B4B",
      "0x005AB6",
      "0x005AE8",
      "0x005B16",
      "0x005B4B",
      "0x005AB6",
      "0x005AE8",
      "0x005B16",
      "0x005B4B",
      "0x005AB6",
      "0x005AE8",
      "0x005B16",
      "0x005B4B",
      "0x005AB6",
      "0x005AE8",
      "0x005B16",
      "0x005B4B",
      "0x005AB6",
      "0x005AE8",
      "0x005B16",
      "0x005B4B",
      "0x005AB6",
      "0x005AE8",
      "0x005B16",
      "0x005B4B",
      "0x005AB6",
      "0x005AE8",
      "0x005B16",
      "0x005B4B",
      "0x005AB6",
      "0x005AE8",
      "0x005B16",
      "0x005B4B",
      "0x005AB6",
      "0x005AE8",
      "0x005B16",
      "0x005B4B",
      "0x005AB6",
      "0x005AE8",
      "0x005B16",
      "0x005B4B",
      "0x005AB6",
      "0x005AE8",
      "0x005B16",
      "0x005B4B",
      "0x005B92",
      "0x005A19",
      "0x0059DA",
      "0x0059E6",
      "0x0017FC",
      "0x0064D0",
      "0x006CC6"
    ],
    "final": {
      "pc": "0x006CC6",
      "sp": "0xD1A834",
      "ix": "0xD1A866",
      "iy": "0xD00080",
      "af": "0x0A42",
      "bc": "0x020000",
      "de": "0x000240",
      "hl": "0x000000",
      "flags": {
        "z": true,
        "c": false,
        "n": true
      },
      "D00080": "0x00",
      "D0008D": "0x00",
      "D0009F": "0x00",
      "D00121": "0x000000",
      "D00124": "0x0A",
      "D00587": "0x00",
      "D0058C": "0x00",
      "D0058D": "0x00",
      "D0058E": "0x00",
      "D00596": "0x13",
      "D0059C": "0x0000DA",
      "D005A0": "0x85",
      "D007CA": "0x0585E9",
      "D008E0": "0xD1A863",
      "D0231A": "0x000000",
      "D0243A": "0x000000",
      "D02590": "0xD3FE81",
      "D0259A": "0xD3FE81",
      "vramPixels": 3031
    }
  }
]
```

## Static Snippets

### 0x0028D1

```text
0x0028D1  c9               ret
```

Exits: `[{"type":"return"}]`

### 0x0013FC

```text
0x0013FC  ed 38 03         in0 a, (0x03)
0x0013FF  cb 67            bit 4, a
0x001401  c4 30 59 01      call nz, 0x015930
```

Exits: `[{"type":"call","target":88368,"targetMode":"adl"},{"type":"call-return","target":5125,"targetMode":"adl"}]`

### 0x001405

```text
0x001405  cd bc 3c 00      call 0x003cbc
```

Exits: `[{"type":"call","target":15548,"targetMode":"adl"},{"type":"call-return","target":5129,"targetMode":"adl"}]`

### 0x003CBC

```text
0x003CBC  fd cb 2c c6      set 0, (iy+44)
0x003CC0  18 04            jr 0x003cc6
```

Exits: `[{"type":"jump","target":15558,"targetMode":"adl"}]`

### 0x003CC6

```text
0x003CC6  40 01 00 a0      ld bc, 0x00a000
0x003CCA  3e 01            ld a, 0x01
0x003CCC  ed 79            out (c), a
0x003CCE  78               ld a, b
0x003CCF  fe a0            cp 0xa0
0x003CD1  28 01            jr z, 0x003cd4
```

Exits: `[{"type":"branch","condition":"z","target":15572,"targetMode":"adl"},{"type":"fallthrough","target":15571,"targetMode":"adl"}]`

### 0x003CD4

```text
0x003CD4  0e 0c            ld c, 0x0c
0x003CD6  3e 04            ld a, 0x04
0x003CD8  ed 79            out (c), a
0x003CDA  78               ld a, b
0x003CDB  fe a0            cp 0xa0
0x003CDD  28 01            jr z, 0x003ce0
```

Exits: `[{"type":"branch","condition":"z","target":15584,"targetMode":"adl"},{"type":"fallthrough","target":15583,"targetMode":"adl"}]`

### 0x003CE0

```text
0x003CE0  0e 08            ld c, 0x08
0x003CE2  40 21 00 ff      ld hl, 0x00ff00
0x003CE6  ed 61            out (c), h
0x003CE8  78               ld a, b
0x003CE9  fe a0            cp 0xa0
0x003CEB  28 01            jr z, 0x003cee
```

Exits: `[{"type":"branch","condition":"z","target":15598,"targetMode":"adl"},{"type":"fallthrough","target":15597,"targetMode":"adl"}]`

### 0x003CEE

```text
0x003CEE  79               ld a, c
0x003CEF  fe 08            cp 0x08
0x003CF1  20 fa            jr nz, 0x003ced
```

Exits: `[{"type":"branch","condition":"nz","target":15597,"targetMode":"adl"},{"type":"fallthrough","target":15603,"targetMode":"adl"}]`

### 0x003CF3

```text
0x003CF3  af               xor a
0x003CF4  ed 78            in a, (c)
0x003CF6  c8               ret z
```

Exits: `[{"type":"return-conditional","condition":"z"},{"type":"fallthrough","target":15607,"targetMode":"adl"}]`

### 0x001428

```text
0x001428  c2 c9 14 00      jp nz, 0x0014c9
```

Exits: `[{"type":"branch","condition":"nz","target":5321,"targetMode":"adl"},{"type":"fallthrough","target":5164,"targetMode":"adl"}]`

### 0x00142C

```text
0x00142C  c3 21 07 00      jp 0x000721
```

Exits: `[{"type":"jump","target":1825,"targetMode":"adl"}]`

### 0x000721

```text
0x000721  cd 00 3d 01      call 0x013d00
```

Exits: `[{"type":"call","target":81152,"targetMode":"adl"},{"type":"call-return","target":1829,"targetMode":"adl"}]`

### 0x013D00

```text
0x013D00  ed 57            ld a, i
0x013D02  f5               push af
0x013D03  f3               di
0x013D04  fd e5            push iy
0x013D06  dd e5            push ix
0x013D08  fd 21 80 00 d0   ld iy, 0xd00080
0x013D0D  cd a6 5b 00      call 0x005ba6
```

Exits: `[{"type":"call","target":23462,"targetMode":"adl"},{"type":"call-return","target":81169,"targetMode":"adl"}]`

### 0x005BA6

```text
0x005BA6  e5               push hl
0x005BA7  21 00 00 00      ld hl, 0x000000
0x005BAB  22 95 05 d0      ld (0xd00595), hl
0x005BAF  e1               pop hl
0x005BB0  c9               ret
```

Exits: `[{"type":"return"}]`

### 0x013D11

```text
0x013D11  fd cb 05 9e      res 3, (iy+5)
0x013D15  3e 20            ld a, 0x20
0x013D17  06 0e            ld b, 0x0e
0x013D19  cd c6 59 00      call 0x0059c6
```

Exits: `[{"type":"call","target":22982,"targetMode":"adl"},{"type":"call-return","target":81181,"targetMode":"adl"}]`

### 0x013D32

```text
0x013D32  13               inc de
0x013D33  10 f4            djnz 0x013d29
```

Exits: `[{"type":"branch","condition":"djnz","target":81193,"targetMode":"adl"},{"type":"fallthrough","target":81205,"targetMode":"adl"}]`

### 0x013D35

```text
0x013D35  dd e1            pop ix
0x013D37  fd e1            pop iy
0x013D39  18 4c            jr 0x013d87
```

Exits: `[{"type":"jump","target":81287,"targetMode":"adl"}]`

### 0x013D87

```text
0x013D87  f1               pop af
0x013D88  e2 8d 3d 01      jp po, 0x013d8d
```

Exits: `[{"type":"branch","condition":"po","target":81293,"targetMode":"adl"},{"type":"fallthrough","target":81292,"targetMode":"adl"}]`

### 0x013D8D

```text
0x013D8D  c9               ret
```

Exits: `[{"type":"return"}]`

### 0x000725

```text
0x000725  21 00 00 00      ld hl, 0x000000
0x000729  cd a6 58 01      call 0x0158a6
```

Exits: `[{"type":"call","target":88230,"targetMode":"adl"},{"type":"call-return","target":1837,"targetMode":"adl"}]`

### 0x0158A6

```text
0x0158A6  c5               push bc
0x0158A7  47               ld b, a
0x0158A8  3a 7e 00 00      ld a, (0x00007e)
0x0158AC  fe ff            cp 0xff
0x0158AE  78               ld a, b
0x0158AF  c1               pop bc
0x0158B0  c9               ret
```

Exits: `[{"type":"return"}]`

### 0x00072D

```text
0x00072D  cc f1 38 01      call z, 0x0138f1
```

Exits: `[{"type":"call","target":80113,"targetMode":"adl"},{"type":"call-return","target":1841,"targetMode":"adl"}]`

### 0x0138F1

```text
0x0138F1  21 fd ff ff      ld hl, 0xfffffd
0x0138F5  cd 97 21 00      call 0x002197
```

Exits: `[{"type":"call","target":8599,"targetMode":"adl"},{"type":"call-return","target":80121,"targetMode":"adl"}]`

### 0x002197

```text
0x002197  dd e3            ex (sp), ix
0x002199  ed 12 00         lea de, ix+0
0x00219C  dd 21 00 00 00   ld ix, 0x000000
0x0021A1  dd 39            add ix, sp
0x0021A3  39               add hl, sp
0x0021A4  f9               ld sp, hl
0x0021A5  eb               ex de, hl
0x0021A6  e9               jp (hl)
```

Exits: `[{"type":"jump-indirect","via":"hl"}]`

### 0x0138F9

```text
0x0138F9  01 01 00 00      ld bc, 0x000001
0x0138FD  dd 0f fd         ld (ix+-3), bc
0x013900  ed 57            ld a, i
0x013902  f5               push af
0x013903  f3               di
0x013904  fd e5            push iy
0x013906  fd 21 80 00 d0   ld iy, 0xd00080
0x01390B  f5               push af
0x01390C  f3               di
0x01390D  3e 8c            ld a, 0x8c
0x01390F  ed 39 24         out0 (0x24), a
0x013912  fe 8c            cp 0x8c
0x013914  c2 66 00 00      jp nz, 0x000066
```

Exits: `[{"type":"branch","condition":"nz","target":102,"targetMode":"adl"},{"type":"fallthrough","target":80152,"targetMode":"adl"}]`

### 0x013918

```text
0x013918  ed 38 06         in0 a, (0x06)
0x01391B  cb d7            set 2, a
0x01391D  ed 39 06         out0 (0x06), a
0x013920  00               nop
0x013921  00               nop
0x013922  3e 04            ld a, 0x04
0x013924  f3               di
0x013925  18 00            jr 0x013927
```

Exits: `[{"type":"jump","target":80167,"targetMode":"adl"}]`

### 0x013927

```text
0x013927  f3               di
0x013928  ed 7e            stmix
0x01392A  ed 56            im 1
0x01392C  ed 39 28         out0 (0x28), a
0x01392F  ed 38 28         in0 a, (0x28)
0x013932  cb 57            bit 2, a
0x013934  c5               push bc
0x013935  d5               push de
0x013936  e5               push hl
0x013937  ed 73 3f 05 d0   ld (0xd0053f), sp
0x01393C  2a 3f 05 d0      ld hl, (0xd0053f)
0x013940  01 7e 98 d1      ld bc, 0xd1987e
0x013944  11 7e a8 d1      ld de, 0xd1a87e
0x013948  b7               or a
0x013949  e5               push hl
0x01394A  ed 42            sbc hl, bc
0x01394C  38 07            jr c, 0x013955
```

Exits: `[{"type":"branch","condition":"c","target":80213,"targetMode":"adl"},{"type":"fallthrough","target":80206,"targetMode":"adl"}]`

### 0x01394E

```text
0x01394E  e1               pop hl
0x01394F  e5               push hl
0x013950  d5               push de
0x013951  eb               ex de, hl
0x013952  ed 52            sbc hl, de
0x013954  d1               pop de
0x013955  3f               ccf
0x013956  e1               pop hl
0x013957  d2 66 00 00      jp nc, 0x000066
```

Exits: `[{"type":"branch","condition":"nc","target":102,"targetMode":"adl"},{"type":"fallthrough","target":80219,"targetMode":"adl"}]`

### 0x01395B

```text
0x01395B  e1               pop hl
0x01395C  d1               pop de
0x01395D  c1               pop bc
0x01395E  f1               pop af
0x01395F  01 00 00 02      ld bc, 0x020000
0x013963  c5               push bc
0x013964  cd 47 64 00      call 0x006447
```

Exits: `[{"type":"call","target":25671,"targetMode":"adl"},{"type":"call-return","target":80232,"targetMode":"adl"}]`

### 0x006447

```text
0x006447  dd e5            push ix
0x006449  dd 21 00 00 00   ld ix, 0x000000
0x00644E  dd 39            add ix, sp
0x006450  e5               push hl
0x006451  ed 22 d7         lea hl, ix-41
0x006454  f9               ld sp, hl
0x006455  dd 27 fd         ld hl, (ix+-3)
0x006458  01 00 00 00      ld bc, 0x000000
0x00645C  dd 0f fa         ld (ix+-6), bc
0x00645F  dd 27 06         ld hl, (ix+6)
0x006462  11 00 80 00      ld de, 0x008000
0x006466  7e               ld a, (hl)
0x006467  ba               cp d
0x006468  c2 7b 65 00      jp nz, 0x00657b
```

Exits: `[{"type":"branch","condition":"nz","target":25979,"targetMode":"adl"},{"type":"fallthrough","target":25708,"targetMode":"adl"}]`

### 0x00646C

```text
0x00646C  23               inc hl
0x00646D  7e               ld a, (hl)
0x00646E  e6 f0            and 0xf0
0x006470  bb               cp e
0x006471  c2 7b 65 00      jp nz, 0x00657b
```

Exits: `[{"type":"branch","condition":"nz","target":25979,"targetMode":"adl"},{"type":"fallthrough","target":25717,"targetMode":"adl"}]`

### 0x006475

```text
0x006475  cd 7d 1c 00      call 0x001c7d
```

Exits: `[{"type":"call","target":7293,"targetMode":"adl"},{"type":"call-return","target":25721,"targetMode":"adl"}]`

### 0x00647D

```text
0x00647D  e5               push hl
0x00647E  21 04 12 00      ld hl, 0x001204
0x006482  cd dd 17 00      call 0x0017dd
```

Exits: `[{"type":"call","target":6109,"targetMode":"adl"},{"type":"call-return","target":25734,"targetMode":"adl"}]`

### 0x0064C7

```text
0x0064C7  e5               push hl
0x0064C8  21 04 12 00      ld hl, 0x001204
0x0064CC  cd dd 17 00      call 0x0017dd
```

Exits: `[{"type":"call","target":6109,"targetMode":"adl"},{"type":"call-return","target":25808,"targetMode":"adl"}]`

### 0x0064D0

```text
0x0064D0  e1               pop hl
0x0064D1  01 00 01 00      ld bc, 0x000100
0x0064D5  c5               push bc
0x0064D6  dd 07 06         ld bc, (ix+6)
0x0064D9  c5               push bc
0x0064DA  cd c6 6c 00      call 0x006cc6
```

Exits: `[{"type":"call","target":27846,"targetMode":"adl"},{"type":"call-return","target":25822,"targetMode":"adl"}]`

### 0x006CC6

```text
0x006CC6  dd e5            push ix
0x006CC8  dd 21 00 00 00   ld ix, 0x000000
0x006CCD  dd 39            add ix, sp
0x006CCF  c5               push bc
0x006CD0  c5               push bc
0x006CD1  3a 21 01 d0      ld a, (0xd00121)
0x006CD5  e6 3f            and 0x3f
0x006CD7  ed 62            sbc hl, hl
0x006CD9  6f               ld l, a
0x006CDA  dd 2f fa         ld (ix+-6), hl
0x006CDD  18 7e            jr 0x006d5d
```

Exits: `[{"type":"jump","target":27997,"targetMode":"adl"}]`


## Interpretation

The missing caller above the one-shot renderer seed is now narrowed to the low-ROM path ending at `0x00142C`. In both preserved key bursts, the trace reaches `0x001428 -> 0x00142C -> 0x000721`; at `0x000721`, SP is back at `0xD1A87E` and the dynamic call-stack approximation is empty. That means the renderer seed is not reached as a nested call from cxMain or the token/tail engine. It is scheduled by a low-ROM branch/return path after the interrupt/status chain finishes.

Static decode in this report should be used as the next starting point: `0x00142C` is the immediate dynamic predecessor to the seed, while the post-seed unwind later shows `0x000725 -> 0x0158A6 -> 0x00072D -> 0x0138F1 -> ... -> 0x006475`. The next useful probe is therefore to decode/trace the `0x0013FC/0x001405 -> 0x003Cxx -> 0x001428/0x00142C` branch inputs and return mechanics, not more state restoration around cx/VAT.
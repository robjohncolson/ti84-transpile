# Phase 743: Browser vs Proven Probe Route Diff

Probe: `probe-phase743-browser-vs-probe-route-diff.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase743-browser-vs-probe-route-diff.mjs`  
Exit: 0

## Summary

- **** Direct/proven EOL recipe reached the token engine first: route=token-engine-then-low-006d-route, token hits=244, later 0x006D hits=20176, result=halt 0x0019B5.
- *** Browser EOL route=unclassified; watched hits=0, 0x006D hits=0, final lastPc=0x202020.
- **** Current browser EOL diverges before the requested selector set: it jumps to missing block `0x202020` after 7366 steps, with post-run D007CA/D008E0/D02590 also reading `0x202020` in the captured browser state.
- *** Browser leg did not report the shipped EOL control-pre-stop path.
- *** No shared 0x005Axx/low selector sample was captured. One-sided selector evidence: status0059da=direct:yes/browser:no, displayLoop005ab6=direct:yes/browser:no, displayCaller005b92=direct:yes/browser:no, lowSelect0064d0=direct:yes/browser:no, lowFrame006cc6=direct:yes/browser:no.
- No shell/runtime/transpiler files were edited; browser instrumentation was served only from an in-memory HTML copy.

## Target Hits

| Target | Direct hits | Browser hits | Direct first block | Browser first block |
|---|---:|---:|---:|---:|
| status0059da | 300 | 0 | 126596 | - |
| displayLoop005ab6 | 4500 | 0 | 126534 | - |
| displayCaller005b92 | 300 | 0 | 126594 | - |
| lowSelect0064d0 | 1 | 0 | 134154 | - |
| lowFrame006cc6 | 5 | 0 | 134155 | - |
| lowCall006d5d | 10088 | 0 | 134156 | - |
| lowBackedge006d64 | 10088 | 0 | 134158 | - |
| tokenOuter08f3b8 | 0 | 0 | - | - |
| tokenTuple08f54b | 2 | 0 | 26057 | - |
| tokenExit08f5e1 | 41 | 0 | 23707 | - |
| tokenGate090992 | 201 | 0 | 3305 | - |
| cleanup001879 | 2 | 0 | 124848 | - |
| cleanupTail0018f8 | 2 | 0 | 124849 | - |
| postInsertGate0158de | 3 | 0 | 124642 | - |
| postInsertReturn0013da | 1 | 0 | 124743 | - |

## Shared Selector Field Diff

Shared target: none

No shared selector sample was available.

## Shared Selector Stack Diff

No shared stack sample was available.

## Compact Evidence

```json
{
  "direct": {
    "result": {
      "steps": 316825,
      "termination": "halt",
      "lastPc": "0x0019B5",
      "lastMode": "adl"
    },
    "route": "token-engine-then-low-006d-route",
    "counts": {
      "status0059da": 300,
      "displayLoop005ab6": 4500,
      "displayCaller005b92": 300,
      "lowSelect0064d0": 1,
      "lowFrame006cc6": 5,
      "lowCall006d5d": 10088,
      "lowBackedge006d64": 10088,
      "tokenTuple08f54b": 2,
      "tokenExit08f5e1": 41,
      "tokenGate090992": 201,
      "cleanup001879": 2,
      "cleanupTail0018f8": 2,
      "postInsertGate0158de": 3,
      "postInsertReturn0013da": 1
    },
    "selectorSamples": {
      "status0059da": {
        "label": "status0059da",
        "block": 126596,
        "pc": "0x0059DA",
        "fields": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02A28": "0x00",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x35",
          "D0059C": "0x000002",
          "D007CA": "0x000000",
          "D008E0": "0x000000",
          "D02590": "0x000000",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00"
        },
        "cpu": {
          "pc": "0x0059DA",
          "sp": "0xD1A869",
          "ix": "0x000000",
          "iy": "0xD00080",
          "af": "0x201B",
          "bc": "0x000E5A",
          "de": "0xD65800",
          "hl": "0x000000",
          "f": "0x1B",
          "halted": false,
          "iff1": 0,
          "iff2": 0,
          "mbase": 208,
          "madl": 1
        },
        "stackTop": [
          {
            "addr": "0xD1A869",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A86C",
            "value": "0x002040"
          },
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
          }
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
          "0x005B92",
          "0x005A19",
          "0x0059DA"
        ],
        "callStackTail": []
      },
      "displayLoop005ab6": {
        "label": "displayLoop005ab6",
        "block": 126534,
        "pc": "0x005AB6",
        "fields": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02A28": "0x00",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x26",
          "D0059C": "0x000002",
          "D007CA": "0x000000",
          "D008E0": "0x000000",
          "D02590": "0x000000",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00"
        },
        "cpu": {
          "pc": "0x005AB6",
          "sp": "0xD1A857",
          "ix": "0xD005A3",
          "iy": "0xD00080",
          "af": "0xFF1A",
          "bc": "0xFF0F05",
          "de": "0x0000FF",
          "hl": "0xD005A0",
          "f": "0x1A",
          "halted": false,
          "iff1": 0,
          "iff2": 0,
          "mbase": 208,
          "madl": 1
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
        "recentBlocks": [
          "0x0059D6",
          "0x005A75",
          "0x005A82",
          "0x00596E",
          "0x001713",
          "0x0008BB",
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
          "0x005AB6"
        ],
        "callStackTail": [
          "0x000721",
          "0x013D11",
          "0x0059C6"
        ]
      },
      "displayCaller005b92": {
        "label": "displayCaller005b92",
        "block": 126594,
        "pc": "0x005B92",
        "fields": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02A28": "0x00",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x35",
          "D0059C": "0x000002",
          "D007CA": "0x000000",
          "D008E0": "0x000000",
          "D02590": "0x000000",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00"
        },
        "cpu": {
          "pc": "0x005B92",
          "sp": "0xD1A857",
          "ix": "0xD005C1",
          "iy": "0xD00080",
          "af": "0xFF42",
          "bc": "0xFF0005",
          "de": "0x0000FF",
          "hl": "0xD005A0",
          "f": "0x42",
          "halted": false,
          "iff1": 0,
          "iff2": 0,
          "mbase": 208,
          "madl": 1
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
          "0x005B92"
        ],
        "callStackTail": [
          "0x000721",
          "0x013D11",
          "0x0059C6"
        ]
      },
      "lowSelect0064d0": {
        "label": "lowSelect0064d0",
        "block": 134154,
        "pc": "0x0064D0",
        "fields": {
          "D00595": "0x04",
          "D00596": "0x13",
          "D00085": "0x00",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02A28": "0x00",
          "D00121": "0x000000",
          "D00124": "0x0A",
          "D005A0": "0x85",
          "D0059C": "0x0000DA",
          "D007CA": "0x000000",
          "D008E0": "0x000000",
          "D02590": "0x000000",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00"
        },
        "cpu": {
          "pc": "0x0064D0",
          "sp": "0xD1A83A",
          "ix": "0xD1A866",
          "iy": "0xD00080",
          "af": "0x0A42",
          "bc": "0x002000",
          "de": "0x000240",
          "hl": "0x0017DB",
          "f": "0x42",
          "halted": false,
          "iff1": 0,
          "iff2": 0,
          "mbase": 208,
          "madl": 1
        },
        "stackTop": [
          {
            "addr": "0xD1A83A",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A83D",
            "value": "0x174800"
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
          "0x005B92",
          "0x005A19",
          "0x0059DA",
          "0x0059E6",
          "0x0017FC",
          "0x0064D0"
        ],
        "callStackTail": []
      },
      "lowFrame006cc6": {
        "label": "lowFrame006cc6",
        "block": 134155,
        "pc": "0x006CC6",
        "fields": {
          "D00595": "0x04",
          "D00596": "0x13",
          "D00085": "0x00",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02A28": "0x00",
          "D00121": "0x000000",
          "D00124": "0x0A",
          "D005A0": "0x85",
          "D0059C": "0x0000DA",
          "D007CA": "0x000000",
          "D008E0": "0x000000",
          "D02590": "0x000000",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00"
        },
        "cpu": {
          "pc": "0x006CC6",
          "sp": "0xD1A834",
          "ix": "0xD1A866",
          "iy": "0xD00080",
          "af": "0x0A42",
          "bc": "0x020000",
          "de": "0x000240",
          "hl": "0x000000",
          "f": "0x42",
          "halted": false,
          "iff1": 0,
          "iff2": 0,
          "mbase": 208,
          "madl": 1
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
            "value": "0x174800"
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
          "0x005B92",
          "0x005A19",
          "0x0059DA",
          "0x0059E6",
          "0x0017FC",
          "0x0064D0",
          "0x006CC6"
        ],
        "callStackTail": [
          "0x0064D0"
        ]
      }
    },
    "tokenSamples": {
      "tokenTuple08f54b": {
        "label": "tokenTuple08f54b",
        "block": 26057,
        "pc": "0x08F54B",
        "fields": {
          "D00595": "0x06",
          "D00596": "0x00",
          "D00085": "0x00",
          "D0243A": "0xD1A92B",
          "D0243D": "0xD2A814",
          "D02A28": "0x00",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x06",
          "D0059C": "0xD43204",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A866",
          "D02590": "0xD3FE81",
          "D00587": "0x0F",
          "D0058C": "0x0F",
          "D0058D": "0x00",
          "D0058E": "0x0F",
          "D00080": "0x08",
          "D0009F": "0x00"
        },
        "cpu": {
          "pc": "0x08F54B",
          "sp": "0xD1A82A",
          "ix": "0xD005C1",
          "iy": "0xD00080",
          "af": "0x2A28",
          "bc": "0x000009",
          "de": "0x00000E",
          "hl": "0xD1A8C4",
          "f": "0x28",
          "halted": false,
          "iff1": 1,
          "iff2": 1,
          "mbase": 208,
          "madl": 1
        },
        "stackTop": [
          {
            "addr": "0xD1A82A",
            "value": "0x00000E"
          },
          {
            "addr": "0xD1A82D",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A830",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A833",
            "value": "0xD1A8E5"
          },
          {
            "addr": "0xD1A836",
            "value": "0xD1A8A3"
          },
          {
            "addr": "0xD1A839",
            "value": "0x000025"
          }
        ],
        "recentBlocks": [
          "0x003CF3",
          "0x03F998",
          "0x03F99A",
          "0x03F9AB",
          "0x03F9AE",
          "0x03F9B0",
          "0x03F9B8",
          "0x03D058",
          "0x03D060",
          "0x03D0E0",
          "0x08F479",
          "0x08F47D",
          "0x04C973",
          "0x08F48A",
          "0x08F547",
          "0x08F33E",
          "0x090755",
          "0x090378",
          "0x04C90D",
          "0x08F54B"
        ],
        "callStackTail": []
      },
      "tokenExit08f5e1": {
        "label": "tokenExit08f5e1",
        "block": 23707,
        "pc": "0x08F5E1",
        "fields": {
          "D00595": "0x06",
          "D00596": "0x00",
          "D00085": "0x00",
          "D0243A": "0xD1A92B",
          "D0243D": "0xD2A814",
          "D02A28": "0x00",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x06",
          "D0059C": "0xD43204",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A866",
          "D02590": "0xD3FE81",
          "D00587": "0x0F",
          "D0058C": "0x0F",
          "D0058D": "0x00",
          "D0058E": "0x0F",
          "D00080": "0x08",
          "D0009F": "0x00"
        },
        "cpu": {
          "pc": "0x08F5E1",
          "sp": "0xD1A83F",
          "ix": "0xD005C1",
          "iy": "0xD00080",
          "af": "0x0042",
          "bc": "0x000033",
          "de": "0x000000",
          "hl": "0xD1A8F9",
          "f": "0x42",
          "halted": false,
          "iff1": 1,
          "iff2": 1,
          "mbase": 208,
          "madl": 1
        },
        "stackTop": [
          {
            "addr": "0xD1A83F",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A842",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A845",
            "value": "0x08E412"
          },
          {
            "addr": "0xD1A848",
            "value": "0x08E2B3"
          },
          {
            "addr": "0xD1A84B",
            "value": "0x00004A"
          },
          {
            "addr": "0xD1A84E",
            "value": "0x000002"
          }
        ],
        "recentBlocks": [
          "0x04C973",
          "0x090927",
          "0x090891",
          "0x0908F4",
          "0x090897",
          "0x090899",
          "0x080065",
          "0x09089E",
          "0x09089F",
          "0x04C92E",
          "0x0908A6",
          "0x09092E",
          "0x08F3DC",
          "0x090933",
          "0x090934",
          "0x04C973",
          "0x09093F",
          "0x0908AB",
          "0x08F458",
          "0x08F5E1"
        ],
        "callStackTail": []
      },
      "tokenGate090992": {
        "label": "tokenGate090992",
        "block": 3305,
        "pc": "0x090992",
        "fields": {
          "D00595": "0x06",
          "D00596": "0x00",
          "D00085": "0x00",
          "D0243A": "0xD1A92B",
          "D0243D": "0xD2A814",
          "D02A28": "0x00",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x06",
          "D0059C": "0xD43204",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A866",
          "D02590": "0xD3FE81",
          "D00587": "0x0F",
          "D0058C": "0x0F",
          "D0058D": "0x00",
          "D0058E": "0x0F",
          "D00080": "0x08",
          "D0009F": "0x00"
        },
        "cpu": {
          "pc": "0x090992",
          "sp": "0xD1A842",
          "ix": "0xD005C1",
          "iy": "0xD00080",
          "af": "0x0040",
          "bc": "0x000000",
          "de": "0xD00893",
          "hl": "0xD00879",
          "f": "0x40",
          "halted": false,
          "iff1": 1,
          "iff2": 1,
          "mbase": 208,
          "madl": 1
        },
        "stackTop": [
          {
            "addr": "0xD1A842",
            "value": "0x0907E3"
          },
          {
            "addr": "0xD1A845",
            "value": "0x08FB61"
          },
          {
            "addr": "0xD1A848",
            "value": "0xFFFFFF"
          },
          {
            "addr": "0xD1A84B",
            "value": "0xD1A8F9"
          },
          {
            "addr": "0xD1A84E",
            "value": "0x08F87C"
          },
          {
            "addr": "0xD1A851",
            "value": "0x090E88"
          }
        ],
        "recentBlocks": [
          "0x04C92E",
          "0x0908A6",
          "0x09092E",
          "0x08F3DC",
          "0x090933",
          "0x090934",
          "0x04C973",
          "0x09093F",
          "0x0908AB",
          "0x08FB59",
          "0x08FB5D",
          "0x0907DB",
          "0x0A2B53",
          "0x0A2A68",
          "0x0A2AF9",
          "0x0A2B16",
          "0x0A2B51",
          "0x0A2B57",
          "0x0907DF",
          "0x090992"
        ],
        "callStackTail": [
          "0x08FB59",
          "0x08FB5D",
          "0x0907DF"
        ]
      }
    }
  },
  "browser": {
    "route": "unclassified",
    "before": {
      "status": "Coldboot complete. OS event loop is ready.",
      "preserve": true,
      "autoRunText": "AutoRun",
      "phase743": {
        "runtimeMode": "coldboot",
        "lastPc": "0x08C331",
        "lastMode": "adl",
        "totalSteps": 637707,
        "cpu": {
          "pc": "0x0019B5",
          "sp": "0xD1A866",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "af": "0x1054",
          "bc": "0x000000",
          "de": "0xD2A815",
          "hl": "0xD1A8A3",
          "f": "0x54",
          "halted": true,
          "iff1": 0,
          "iff2": 0,
          "mbase": 208,
          "madl": 1
        },
        "fields": {
          "D00595": "0x00",
          "D00596": "0x00",
          "D00085": "0x00",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02A28": "0x00",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D005A0": "0x00",
          "D0059C": "0xD4202C",
          "D007CA": "0x0585E9",
          "D008E0": "0x000000",
          "D02590": "0xD3FE81",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009F": "0x00"
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
            "D0243D": 13805630,
            "D02A40": 13805630,
            "D02A28": 0
          }
        },
        "vramPixels": 8549,
        "status": "Coldboot complete. OS event loop is ready.",
        "lastKey": null
      },
      "lastKey": null,
      "errors": []
    },
    "after": {
      "status": "Key: CLEAR → 7366 steps (missing_block, peak 8585px)",
      "preserve": true,
      "autoRunText": "AutoRun",
      "phase743": {
        "runtimeMode": "coldboot",
        "lastPc": "0x202020",
        "lastMode": "adl",
        "totalSteps": 645073,
        "cpu": {
          "pc": "0x0A22A4",
          "sp": "0xD1A854",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "af": "0x0040",
          "bc": "0x000000",
          "de": "0xD006C1",
          "hl": "0xD006C0",
          "f": "0x40",
          "halted": false,
          "iff1": 1,
          "iff2": 1,
          "mbase": 208,
          "madl": 1
        },
        "fields": {
          "D00595": "0xFF",
          "D00596": "0xFF",
          "D00085": "0xFF",
          "D0243A": "0x202020",
          "D0243D": "0x202020",
          "D02A28": "0x20",
          "D00121": "0xFFFFFF",
          "D00124": "0xFF",
          "D005A0": "0xFF",
          "D0059C": "0xFFFFFF",
          "D007CA": "0x202020",
          "D008E0": "0x202020",
          "D02590": "0x202020",
          "D00587": "0x00",
          "D0058C": "0xFF",
          "D0058D": "0xFF",
          "D0058E": "0xFF",
          "D00080": "0xF7",
          "D0009F": "0xFF"
        },
        "diagnostics": {
          "tokenGate": 32,
          "tokenA": 255,
          "tokenB": 255,
          "tuple": {
            "D02A29": 8224,
            "D02A2B": 8224,
            "D02A1B": 8224,
            "D0059A": 255,
            "D01150": 8224,
            "D0243D": 2105376,
            "D02A40": 2105376,
            "D02A28": 32
          }
        },
        "vramPixels": 76800,
        "status": "Key: CLEAR → 7366 steps (missing_block, peak 8585px)",
        "lastKey": {
          "code": "Escape",
          "label": "CLEAR",
          "expectedInsertByte": null,
          "controlPreStopPc": 6265,
          "controlPreStopLabel": "clear-bulk-clear-body",
          "cursorBefore": null,
          "insertBlock": null,
          "postInsertGateBlock": null,
          "stoppedAtPostInsertGate": false,
          "D000C2Bit7Restored": false,
          "controlStopBlock": null,
          "controlStopPc": null,
          "uiClearApplied": false,
          "uiClearResult": null,
          "stoppedBeforeControlClear": false,
          "steps": 7366,
          "termination": "missing_block",
          "wipes": 0,
          "D0243A": 2105376,
          "D0243D": 2105376,
          "D007CA": 2105376,
          "D008E0": 2105376,
          "D02590": 2105376,
          "D000C2": 255,
          "buffer": [
            32,
            32,
            32,
            32,
            32,
            32,
            32,
            32
          ],
          "vramPeak": 8585,
          "vramCurrent": 76800
        }
      },
      "lastKey": {
        "code": "Escape",
        "label": "CLEAR",
        "expectedInsertByte": null,
        "controlPreStopPc": 6265,
        "controlPreStopLabel": "clear-bulk-clear-body",
        "cursorBefore": null,
        "insertBlock": null,
        "postInsertGateBlock": null,
        "stoppedAtPostInsertGate": false,
        "D000C2Bit7Restored": false,
        "controlStopBlock": null,
        "controlStopPc": null,
        "uiClearApplied": false,
        "uiClearResult": null,
        "stoppedBeforeControlClear": false,
        "steps": 7366,
        "termination": "missing_block",
        "wipes": 0,
        "D0243A": 2105376,
        "D0243D": 2105376,
        "D007CA": 2105376,
        "D008E0": 2105376,
        "D02590": 2105376,
        "D000C2": 255,
        "buffer": [
          32,
          32,
          32,
          32,
          32,
          32,
          32,
          32
        ],
        "vramPeak": 8585,
        "vramCurrent": 76800
      },
      "errors": []
    },
    "counts": {},
    "selectorSamples": {},
    "lowSamples": {},
    "tokenSamples": {},
    "lastKey": {
      "code": "Escape",
      "label": "CLEAR",
      "expectedInsertByte": null,
      "controlPreStopPc": 6265,
      "controlPreStopLabel": "clear-bulk-clear-body",
      "cursorBefore": null,
      "insertBlock": null,
      "postInsertGateBlock": null,
      "stoppedAtPostInsertGate": false,
      "D000C2Bit7Restored": false,
      "controlStopBlock": null,
      "controlStopPc": null,
      "uiClearApplied": false,
      "uiClearResult": null,
      "stoppedBeforeControlClear": false,
      "steps": 7366,
      "termination": "missing_block",
      "wipes": 0,
      "D0243A": 2105376,
      "D0243D": 2105376,
      "D007CA": 2105376,
      "D008E0": 2105376,
      "D02590": 2105376,
      "D000C2": 255,
      "buffer": [
        32,
        32,
        32,
        32,
        32,
        32,
        32,
        32
      ],
      "vramPeak": 8585,
      "vramCurrent": 76800
    },
    "errors": []
  },
  "shared": null
}
```

## Interpretation

The direct/proven recipe and current browser EOL route did not meet at a selector sample. The important new constraint is that current `browser-shell.html` has moved EOL away from the old low-loop reproduction path: its control-pre-stop at `0x001879` prevents the `0x006D5D`/`0x006D64` hot loop for this key. A future diff should either use the older no-control-stop browser recipe or switch to a key that still reproduces the low route in the current shell.

No runtime, transpiler, browser, or scheduler source files were modified.


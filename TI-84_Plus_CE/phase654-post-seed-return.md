# Phase 654: Post-Seed Return Mechanics

Probe: `probe-phase654-post-seed-return.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase654-post-seed-return.mjs`

## Summary

- 4-star Both key cases follow the same post-seed chain: `0x000721 -> 0x013D00 -> 0x005BA6 -> 0x013D11 -> 0x000725 -> 0x0158A6 -> 0x00072D -> 0x0138F1 -> 0x002197 -> 0x0138F9 -> 0x013927 -> 0x01395B -> 0x006447 -> 0x006475 -> 0x0064D0 -> 0x006CC6`.
- 4-star `0x0158A6` leaves Z=true at `0x00072D`, so the conditional `CALL Z,0x0138F1` is taken in both traces.
- 4-star The `0x002197` frame trampoline sees `0x0138F9` on the stack and resumes at `0x0138F9`; first-case continuation state is IX=0xD1A878, SP=0xD1A875.
- 4-star The continuation reaches `0x006447` with pushed arg 0x020000, then `0x006475/0x0064D0/0x006CC6`; first-case low-transfer IX+6=0x020000.
- 3-star Token/tail hooks remain bypassed: `0x08F5E1`, `0x090992`, and `0x08F54B` stay at zero hits.
- No runtime, transpiler, browser, or scheduler source files were modified.

## Scenario Results

| Key | Trace | Post-seed path | 0x000725 stack top | 0x00072D flags | 0x002197 stack top / IX | 0x0138F9 IX / SP | 0x006447 arg | Low transfer IX+6 | Token/tail |
|---|---|---|---|---|---|---|---|---|---:|
| EOL/CLEAR | after-low-frame-selection 0x006CC6 | 0x000721 -> 0x013D00 -> 0x005BA6 -> 0x013D11 -> 0x000725 -> 0x0158A6 -> 0x00072D -> 0x0138F1 -> 0x002197 -> 0x0138F9 -> 0x013927 -> 0x01395B -> 0x006447 -> 0x006475 -> 0x0064D0 -> 0x006CC6 | 0x000000 | Z=true AF=0x0042 | 0x0138F9 / IX=0x000000 | IX=0xD1A878 SP=0xD1A875 | 0x020000 | 0x020000 via 0x006475/0x0064D0/0x006CC6=1/1/1 | 0 |
| Digit2 | after-low-frame-selection 0x006CC6 | 0x000721 -> 0x013D00 -> 0x005BA6 -> 0x013D11 -> 0x000725 -> 0x0158A6 -> 0x00072D -> 0x0138F1 -> 0x002197 -> 0x0138F9 -> 0x013927 -> 0x01395B -> 0x006447 -> 0x006475 -> 0x0064D0 -> 0x006CC6 | 0x000000 | Z=true AF=0x0042 | 0x0138F9 / IX=0x000000 | IX=0xD1A878 SP=0xD1A875 | 0x020000 | 0x020000 via 0x006475/0x0064D0/0x006CC6=1/1/1 | 0 |

## Branch Evidence

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
    "path": "0x000721 -> 0x013D00 -> 0x005BA6 -> 0x013D11 -> 0x000725 -> 0x0158A6 -> 0x00072D -> 0x0138F1 -> 0x002197 -> 0x0138F9 -> 0x013927 -> 0x01395B -> 0x006447 -> 0x006475 -> 0x0064D0 -> 0x006CC6",
    "counts": {
      "seed000721": 1,
      "seed013d00": 1,
      "seed005ba6": 1,
      "seed013d11": 1,
      "post000725": 1,
      "post0158a6": 4,
      "post00072d": 1,
      "post0138f1": 1,
      "trampoline002197": 13,
      "post0138f9": 1,
      "post013927": 1,
      "post01395b": 1,
      "transfer006447": 1,
      "transfer006475": 1,
      "transfer00647d": 1,
      "transfer0064c7": 1,
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
    "postSeedTransitions": [
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
        "name": "post000725",
        "hit": 1,
        "block": 57624,
        "pc": "0x000725",
        "previous": "0x013D8D",
        "sp": "0xD1A87E",
        "top": "0x000000",
        "stackTail": [],
        "recentTail": [
          "0x005B92",
          "0x005A19",
          "0x0059DA",
          "0x0059E6",
          "0x0059F7",
          "0x0059ED",
          "0x0059FE",
          "0x013D32",
          "0x013D35",
          "0x013D87",
          "0x013D8D",
          "0x000725"
        ]
      },
      {
        "name": "post0158a6",
        "hit": 4,
        "block": 57625,
        "pc": "0x0158A6",
        "previous": "0x000725",
        "sp": "0xD1A87B",
        "top": "0x00072D",
        "stackTail": [
          "0x000725"
        ],
        "recentTail": [
          "0x005A19",
          "0x0059DA",
          "0x0059E6",
          "0x0059F7",
          "0x0059ED",
          "0x0059FE",
          "0x013D32",
          "0x013D35",
          "0x013D87",
          "0x013D8D",
          "0x000725",
          "0x0158A6"
        ]
      },
      {
        "name": "post00072d",
        "hit": 1,
        "block": 57626,
        "pc": "0x00072D",
        "previous": "0x0158A6",
        "sp": "0xD1A87E",
        "top": "0x000000",
        "stackTail": [],
        "recentTail": [
          "0x0059DA",
          "0x0059E6",
          "0x0059F7",
          "0x0059ED",
          "0x0059FE",
          "0x013D32",
          "0x013D35",
          "0x013D87",
          "0x013D8D",
          "0x000725",
          "0x0158A6",
          "0x00072D"
        ]
      },
      {
        "name": "post0138f1",
        "hit": 1,
        "block": 57627,
        "pc": "0x0138F1",
        "previous": "0x00072D",
        "sp": "0xD1A87B",
        "top": "0x000731",
        "stackTail": [
          "0x00072D"
        ],
        "recentTail": [
          "0x0059E6",
          "0x0059F7",
          "0x0059ED",
          "0x0059FE",
          "0x013D32",
          "0x013D35",
          "0x013D87",
          "0x013D8D",
          "0x000725",
          "0x0158A6",
          "0x00072D",
          "0x0138F1"
        ]
      },
      {
        "name": "trampoline002197",
        "hit": 13,
        "block": 57628,
        "pc": "0x002197",
        "previous": "0x0138F1",
        "sp": "0xD1A878",
        "top": "0x0138F9",
        "stackTail": [
          "0x00072D",
          "0x0138F1"
        ],
        "recentTail": [
          "0x0059F7",
          "0x0059ED",
          "0x0059FE",
          "0x013D32",
          "0x013D35",
          "0x013D87",
          "0x013D8D",
          "0x000725",
          "0x0158A6",
          "0x00072D",
          "0x0138F1",
          "0x002197"
        ]
      },
      {
        "name": "post0138f9",
        "hit": 1,
        "block": 57629,
        "pc": "0x0138F9",
        "previous": "0x002197",
        "sp": "0xD1A875",
        "top": "0xD00080",
        "stackTail": [
          "0x00072D",
          "0x0138F1",
          "0x002197"
        ],
        "recentTail": [
          "0x0059ED",
          "0x0059FE",
          "0x013D32",
          "0x013D35",
          "0x013D87",
          "0x013D8D",
          "0x000725",
          "0x0158A6",
          "0x00072D",
          "0x0138F1",
          "0x002197",
          "0x0138F9"
        ]
      },
      {
        "name": "post013927",
        "hit": 1,
        "block": 57631,
        "pc": "0x013927",
        "previous": "0x013918",
        "sp": "0xD1A86C",
        "top": "0x000041",
        "stackTail": [
          "0x00072D",
          "0x0138F1",
          "0x002197",
          "0x0138F9"
        ],
        "recentTail": [
          "0x013D32",
          "0x013D35",
          "0x013D87",
          "0x013D8D",
          "0x000725",
          "0x0158A6",
          "0x00072D",
          "0x0138F1",
          "0x002197",
          "0x0138F9",
          "0x013918",
          "0x013927"
        ]
      },
      {
        "name": "post01395b",
        "hit": 1,
        "block": 57633,
        "pc": "0x01395B",
        "previous": "0x01394E",
        "sp": "0xD1A863",
        "top": "0x0138F9",
        "stackTail": [
          "0x00072D",
          "0x0138F1",
          "0x002197",
          "0x0138F9"
        ],
        "recentTail": [
          "0x013D87",
          "0x013D8D",
          "0x000725",
          "0x0158A6",
          "0x00072D",
          "0x0138F1",
          "0x002197",
          "0x0138F9",
          "0x013918",
          "0x013927",
          "0x01394E",
          "0x01395B"
        ]
      },
      {
        "name": "transfer006447",
        "hit": 1,
        "block": 57634,
        "pc": "0x006447",
        "previous": "0x01395B",
        "sp": "0xD1A869",
        "top": "0x013968",
        "stackTail": [
          "0x00072D",
          "0x0138F1"
        ],
        "recentTail": [
          "0x013D8D",
          "0x000725",
          "0x0158A6",
          "0x00072D",
          "0x0138F1",
          "0x002197",
          "0x0138F9",
          "0x013918",
          "0x013927",
          "0x01394E",
          "0x01395B",
          "0x006447"
        ]
      },
      {
        "name": "transfer006475",
        "hit": 1,
        "block": 57636,
        "pc": "0x006475",
        "previous": "0x00646C",
        "sp": "0xD1A83D",
        "top": "0x1700D1",
        "stackTail": [
          "0x00072D",
          "0x0138F1"
        ],
        "recentTail": [
          "0x0158A6",
          "0x00072D",
          "0x0138F1",
          "0x002197",
          "0x0138F9",
          "0x013918",
          "0x013927",
          "0x01394E",
          "0x01395B",
          "0x006447",
          "0x00646C",
          "0x006475"
        ]
      },
      {
        "name": "transfer00647d",
        "hit": 1,
        "block": 57647,
        "pc": "0x00647D",
        "previous": "0x006479",
        "sp": "0xD1A83D",
        "top": "0x1700D1",
        "stackTail": [
          "0x00072D"
        ],
        "recentTail": [
          "0x006475",
          "0x001C7D",
          "0x001CA6",
          "0x001CC0",
          "0x001CCA",
          "0x001CCE",
          "0x001CD5",
          "0x001CE5",
          "0x001C81",
          "0x001C82",
          "0x006479",
          "0x00647D"
        ]
      },
      {
        "name": "transfer0064c7",
        "hit": 1,
        "block": 57772,
        "pc": "0x0064C7",
        "previous": "0x006CB7",
        "sp": "0xD1A83D",
        "top": "0x1700D1",
        "stackTail": [],
        "recentTail": [
          "0x001C38",
          "0x001C3C",
          "0x001C42",
          "0x00649B",
          "0x00649D",
          "0x0064BE",
          "0x006C8E",
          "0x006C9C",
          "0x006CA1",
          "0x006CB2",
          "0x006CB7",
          "0x0064C7"
        ]
      },
      {
        "name": "low0064d0",
        "hit": 1,
        "block": 57859,
        "pc": "0x0064D0",
        "previous": "0x0017FC",
        "sp": "0xD1A83A",
        "top": "0x000000",
        "stackTail": [],
        "recentTail": [
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
      {
        "name": "low006cc6",
        "hit": 1,
        "block": 57860,
        "pc": "0x006CC6",
        "previous": "0x0064D0",
        "sp": "0xD1A834",
        "top": "0x0064DE",
        "stackTail": [
          "0x0064D0"
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
          "0x0017FC",
          "0x0064D0",
          "0x006CC6"
        ]
      }
    ],
    "postSeedSamples": {
      "seed000721": {
        "block": 50215,
        "pc": "0x000721",
        "state": {
          "af": "0x0042",
          "bc": "0x00A55A",
          "de": "0xD65800",
          "hl": "0x000000",
          "sp": "0xD1A87E",
          "ix": "0x000000",
          "iy": "0xD00080",
          "flags": {
            "z": true,
            "c": false,
            "n": true
          },
          "D000AC": "0x01",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000000",
          "D005A0": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
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
          },
          {
            "addr": "0xD1A890",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A893",
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
        "recentBlocks": [
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
        ],
        "callStackTail": []
      },
      "seed013d00": {
        "block": 50216,
        "pc": "0x013D00",
        "state": {
          "af": "0x0042",
          "bc": "0x00A55A",
          "de": "0xD65800",
          "hl": "0x000000",
          "sp": "0xD1A87B",
          "ix": "0x000000",
          "iy": "0xD00080",
          "flags": {
            "z": true,
            "c": false,
            "n": true
          },
          "D000AC": "0x01",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000000",
          "D005A0": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
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
          },
          {
            "addr": "0xD1A88D",
            "value": "0x008000"
          },
          {
            "addr": "0xD1A890",
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
        "recentBlocks": [
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
        ],
        "callStackTail": [
          "0x000721"
        ]
      },
      "seed005ba6": {
        "block": 50217,
        "pc": "0x005BA6",
        "state": {
          "af": "0x0040",
          "bc": "0x00A55A",
          "de": "0xD65800",
          "hl": "0x000000",
          "sp": "0xD1A86F",
          "ix": "0x000000",
          "iy": "0xD00080",
          "flags": {
            "z": true,
            "c": false,
            "n": false
          },
          "D000AC": "0x01",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000000",
          "D005A0": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
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
          },
          {
            "addr": "0xD1A881",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A884",
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
        "recentBlocks": [
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
        ],
        "callStackTail": [
          "0x000721",
          "0x013D00"
        ]
      },
      "seed013d11": {
        "block": 50218,
        "pc": "0x013D11",
        "state": {
          "af": "0x0040",
          "bc": "0x00A55A",
          "de": "0xD65800",
          "hl": "0x000000",
          "sp": "0xD1A872",
          "ix": "0x000000",
          "iy": "0xD00080",
          "flags": {
            "z": true,
            "c": false,
            "n": false
          },
          "D000AC": "0x01",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000000",
          "D005A0": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
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
          },
          {
            "addr": "0xD1A884",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A887",
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
        "recentBlocks": [
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
        ],
        "callStackTail": [
          "0x000721"
        ]
      },
      "post000725": {
        "block": 57624,
        "pc": "0x000725",
        "state": {
          "af": "0x0040",
          "bc": "0x00005A",
          "de": "0x000009",
          "hl": "0x013D87",
          "sp": "0xD1A87E",
          "ix": "0x000000",
          "iy": "0xD00080",
          "flags": {
            "z": true,
            "c": false,
            "n": false
          },
          "D000AC": "0x01",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00596": "0x0A",
          "D0059C": "0x00006E",
          "D005A0": "0xD5",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "vramPixels": 3011
        },
        "memory": {
          "low0059c": "0x095CC3",
          "low005a0": "0x06F3C3",
          "D00596": "0x0A",
          "D0059C": "0x00006E",
          "D005A0": "0xD5",
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
          },
          {
            "addr": "0xD1A890",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A893",
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
        "recentBlocks": [
          "0x005B92",
          "0x005A19",
          "0x0059DA",
          "0x0059E6",
          "0x0059F7",
          "0x0059ED",
          "0x0059FE",
          "0x013D32",
          "0x013D35",
          "0x013D87",
          "0x013D8D",
          "0x000725"
        ],
        "callStackTail": []
      },
      "post0158a6": {
        "block": 57625,
        "pc": "0x0158A6",
        "state": {
          "af": "0x0040",
          "bc": "0x00005A",
          "de": "0x000009",
          "hl": "0x000000",
          "sp": "0xD1A87B",
          "ix": "0x000000",
          "iy": "0xD00080",
          "flags": {
            "z": true,
            "c": false,
            "n": false
          },
          "D000AC": "0x01",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00596": "0x0A",
          "D0059C": "0x00006E",
          "D005A0": "0xD5",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "vramPixels": 3011
        },
        "memory": {
          "low0059c": "0x095CC3",
          "low005a0": "0x06F3C3",
          "D00596": "0x0A",
          "D0059C": "0x00006E",
          "D005A0": "0xD5",
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
            "value": "0x00072D"
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
          },
          {
            "addr": "0xD1A88D",
            "value": "0x008000"
          },
          {
            "addr": "0xD1A890",
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
        "recentBlocks": [
          "0x005A19",
          "0x0059DA",
          "0x0059E6",
          "0x0059F7",
          "0x0059ED",
          "0x0059FE",
          "0x013D32",
          "0x013D35",
          "0x013D87",
          "0x013D8D",
          "0x000725",
          "0x0158A6"
        ],
        "callStackTail": [
          "0x000725"
        ]
      },
      "post00072d": {
        "block": 57626,
        "pc": "0x00072D",
        "state": {
          "af": "0x0042",
          "bc": "0x00005A",
          "de": "0x000009",
          "hl": "0x000000",
          "sp": "0xD1A87E",
          "ix": "0x000000",
          "iy": "0xD00080",
          "flags": {
            "z": true,
            "c": false,
            "n": true
          },
          "D000AC": "0x01",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00596": "0x0A",
          "D0059C": "0x00006E",
          "D005A0": "0xD5",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "vramPixels": 3011
        },
        "memory": {
          "low0059c": "0x095CC3",
          "low005a0": "0x06F3C3",
          "D00596": "0x0A",
          "D0059C": "0x00006E",
          "D005A0": "0xD5",
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
          },
          {
            "addr": "0xD1A890",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A893",
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
        "recentBlocks": [
          "0x0059DA",
          "0x0059E6",
          "0x0059F7",
          "0x0059ED",
          "0x0059FE",
          "0x013D32",
          "0x013D35",
          "0x013D87",
          "0x013D8D",
          "0x000725",
          "0x0158A6",
          "0x00072D"
        ],
        "callStackTail": []
      },
      "post0138f1": {
        "block": 57627,
        "pc": "0x0138F1",
        "state": {
          "af": "0x0042",
          "bc": "0x00005A",
          "de": "0x000009",
          "hl": "0x000000",
          "sp": "0xD1A87B",
          "ix": "0x000000",
          "iy": "0xD00080",
          "flags": {
            "z": true,
            "c": false,
            "n": true
          },
          "D000AC": "0x01",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00596": "0x0A",
          "D0059C": "0x00006E",
          "D005A0": "0xD5",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "vramPixels": 3011
        },
        "memory": {
          "low0059c": "0x095CC3",
          "low005a0": "0x06F3C3",
          "D00596": "0x0A",
          "D0059C": "0x00006E",
          "D005A0": "0xD5",
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
            "value": "0x000731"
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
          },
          {
            "addr": "0xD1A88D",
            "value": "0x008000"
          },
          {
            "addr": "0xD1A890",
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
        "recentBlocks": [
          "0x0059E6",
          "0x0059F7",
          "0x0059ED",
          "0x0059FE",
          "0x013D32",
          "0x013D35",
          "0x013D87",
          "0x013D8D",
          "0x000725",
          "0x0158A6",
          "0x00072D",
          "0x0138F1"
        ],
        "callStackTail": [
          "0x00072D"
        ]
      },
      "trampoline002197": {
        "block": 57628,
        "pc": "0x002197",
        "state": {
          "af": "0x0042",
          "bc": "0x00005A",
          "de": "0x000009",
          "hl": "0xFFFFFD",
          "sp": "0xD1A878",
          "ix": "0x000000",
          "iy": "0xD00080",
          "flags": {
            "z": true,
            "c": false,
            "n": true
          },
          "D000AC": "0x01",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00596": "0x0A",
          "D0059C": "0x00006E",
          "D005A0": "0xD5",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "vramPixels": 3011
        },
        "memory": {
          "low0059c": "0x095CC3",
          "low005a0": "0x06F3C3",
          "D00596": "0x0A",
          "D0059C": "0x00006E",
          "D005A0": "0xD5",
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
            "addr": "0xD1A878",
            "value": "0x0138F9"
          },
          {
            "addr": "0xD1A87B",
            "value": "0x000731"
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
        "recentBlocks": [
          "0x0059F7",
          "0x0059ED",
          "0x0059FE",
          "0x013D32",
          "0x013D35",
          "0x013D87",
          "0x013D8D",
          "0x000725",
          "0x0158A6",
          "0x00072D",
          "0x0138F1",
          "0x002197"
        ],
        "callStackTail": [
          "0x00072D",
          "0x0138F1"
        ]
      },
      "post0138f9": {
        "block": 57629,
        "pc": "0x0138F9",
        "state": {
          "af": "0x0051",
          "bc": "0x00005A",
          "de": "0xD1A875",
          "hl": "0x0138F9",
          "sp": "0xD1A875",
          "ix": "0xD1A878",
          "iy": "0xD00080",
          "flags": {
            "z": true,
            "c": true,
            "n": false
          },
          "D000AC": "0x01",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00596": "0x0A",
          "D0059C": "0x00006E",
          "D005A0": "0xD5",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "vramPixels": 3011
        },
        "memory": {
          "low0059c": "0x095CC3",
          "low005a0": "0x06F3C3",
          "D00596": "0x0A",
          "D0059C": "0x00006E",
          "D005A0": "0xD5",
          "D005A1": "0x00",
          "D005A2": "0x00",
          "ixBytes": [
            "0x00",
            "0x00",
            "0x00",
            "0x31",
            "0x07",
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
            "addr": "0xD1A875",
            "value": "0xD00080"
          },
          {
            "addr": "0xD1A878",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A87B",
            "value": "0x000731"
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
          "IX-45": "0xFF0105",
          "IX-42": "0x000000",
          "IX-39": "0x013D86",
          "IX-30": "0x002E0B",
          "IX-27": "0x0059DA",
          "IX-24": "0x86",
          "IX-20": "0xF7002E",
          "IX-17": "0x450059",
          "IX-11": "0x320001",
          "IX-8": "0x3D",
          "IX-7": "0x01",
          "IX-6": "0x000000",
          "IX-3": "0xD00080",
          "IX+0": "0x000000",
          "IX+3": "0x000731",
          "IX+6": "0x000000",
          "IX+9": "0x000000"
        },
        "recentBlocks": [
          "0x0059ED",
          "0x0059FE",
          "0x013D32",
          "0x013D35",
          "0x013D87",
          "0x013D8D",
          "0x000725",
          "0x0158A6",
          "0x00072D",
          "0x0138F1",
          "0x002197",
          "0x0138F9"
        ],
        "callStackTail": [
          "0x00072D",
          "0x0138F1",
          "0x002197"
        ]
      },
      "post013927": {
        "block": 57631,
        "pc": "0x013927",
        "state": {
          "af": "0x0480",
          "bc": "0x000001",
          "de": "0xD1A875",
          "hl": "0x0138F9",
          "sp": "0xD1A86C",
          "ix": "0xD1A878",
          "iy": "0xD00080",
          "flags": {
            "z": false,
            "c": false,
            "n": false
          },
          "D000AC": "0x01",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00596": "0x0A",
          "D0059C": "0x00006E",
          "D005A0": "0xD5",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "vramPixels": 3011
        },
        "memory": {
          "low0059c": "0x095CC3",
          "low005a0": "0x06F3C3",
          "D00596": "0x0A",
          "D0059C": "0x00006E",
          "D005A0": "0xD5",
          "D005A1": "0x00",
          "D005A2": "0x00",
          "ixBytes": [
            "0x00",
            "0x00",
            "0x00",
            "0x31",
            "0x07",
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
            "addr": "0xD1A86C",
            "value": "0x000041"
          },
          {
            "addr": "0xD1A86F",
            "value": "0xD00080"
          },
          {
            "addr": "0xD1A872",
            "value": "0x000041"
          },
          {
            "addr": "0xD1A875",
            "value": "0x000001"
          },
          {
            "addr": "0xD1A878",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A87B",
            "value": "0x000731"
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
          "IX-45": "0xFF0105",
          "IX-42": "0x000000",
          "IX-39": "0x013D86",
          "IX-30": "0x002E0B",
          "IX-27": "0x0059DA",
          "IX-24": "0x86",
          "IX-20": "0xF7002E",
          "IX-17": "0x450059",
          "IX-11": "0x800000",
          "IX-8": "0x00",
          "IX-7": "0xD0",
          "IX-6": "0x000041",
          "IX-3": "0x000001",
          "IX+0": "0x000000",
          "IX+3": "0x000731",
          "IX+6": "0x000000",
          "IX+9": "0x000000"
        },
        "recentBlocks": [
          "0x013D32",
          "0x013D35",
          "0x013D87",
          "0x013D8D",
          "0x000725",
          "0x0158A6",
          "0x00072D",
          "0x0138F1",
          "0x002197",
          "0x0138F9",
          "0x013918",
          "0x013927"
        ],
        "callStackTail": [
          "0x00072D",
          "0x0138F1",
          "0x002197",
          "0x0138F9"
        ]
      },
      "post01395b": {
        "block": 57633,
        "pc": "0x01395B",
        "state": {
          "af": "0x0001",
          "bc": "0xD1987E",
          "de": "0xD1A87E",
          "hl": "0xD1A863",
          "sp": "0xD1A863",
          "ix": "0xD1A878",
          "iy": "0xD00080",
          "flags": {
            "z": false,
            "c": true,
            "n": false
          },
          "D000AC": "0x01",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00596": "0x0A",
          "D0059C": "0x00006E",
          "D005A0": "0xD5",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "vramPixels": 3011
        },
        "memory": {
          "low0059c": "0x095CC3",
          "low005a0": "0x06F3C3",
          "D00596": "0x0A",
          "D0059C": "0x00006E",
          "D005A0": "0xD5",
          "D005A1": "0x00",
          "D005A2": "0x00",
          "ixBytes": [
            "0x00",
            "0x00",
            "0x00",
            "0x31",
            "0x07",
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
            "addr": "0xD1A863",
            "value": "0x0138F9"
          },
          {
            "addr": "0xD1A866",
            "value": "0xD1A875"
          },
          {
            "addr": "0xD1A869",
            "value": "0x000001"
          },
          {
            "addr": "0xD1A86C",
            "value": "0x000041"
          },
          {
            "addr": "0xD1A86F",
            "value": "0xD00080"
          },
          {
            "addr": "0xD1A872",
            "value": "0x000041"
          },
          {
            "addr": "0xD1A875",
            "value": "0x000001"
          },
          {
            "addr": "0xD1A878",
            "value": "0x000000"
          }
        ],
        "ixFrame": {
          "IX-45": "0xFF0105",
          "IX-42": "0x000000",
          "IX-39": "0x013D86",
          "IX-30": "0x002E0B",
          "IX-27": "0xD1A87E",
          "IX-24": "0x63",
          "IX-20": "0x750138",
          "IX-17": "0x01D1A8",
          "IX-11": "0x800000",
          "IX-8": "0x00",
          "IX-7": "0xD0",
          "IX-6": "0x000041",
          "IX-3": "0x000001",
          "IX+0": "0x000000",
          "IX+3": "0x000731",
          "IX+6": "0x000000",
          "IX+9": "0x000000"
        },
        "recentBlocks": [
          "0x013D87",
          "0x013D8D",
          "0x000725",
          "0x0158A6",
          "0x00072D",
          "0x0138F1",
          "0x002197",
          "0x0138F9",
          "0x013918",
          "0x013927",
          "0x01394E",
          "0x01395B"
        ],
        "callStackTail": [
          "0x00072D",
          "0x0138F1",
          "0x002197",
          "0x0138F9"
        ]
      },
      "transfer006447": {
        "block": 57634,
        "pc": "0x006447",
        "state": {
          "af": "0x0041",
          "bc": "0x020000",
          "de": "0xD1A875",
          "hl": "0x0138F9",
          "sp": "0xD1A869",
          "ix": "0xD1A878",
          "iy": "0xD00080",
          "flags": {
            "z": true,
            "c": true,
            "n": false
          },
          "D000AC": "0x01",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00596": "0x0A",
          "D0059C": "0x00006E",
          "D005A0": "0xD5",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "vramPixels": 3011
        },
        "memory": {
          "low0059c": "0x095CC3",
          "low005a0": "0x06F3C3",
          "D00596": "0x0A",
          "D0059C": "0x00006E",
          "D005A0": "0xD5",
          "D005A1": "0x00",
          "D005A2": "0x00",
          "ixBytes": [
            "0x00",
            "0x00",
            "0x00",
            "0x31",
            "0x07",
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
            "addr": "0xD1A869",
            "value": "0x013968"
          },
          {
            "addr": "0xD1A86C",
            "value": "0x020000"
          },
          {
            "addr": "0xD1A86F",
            "value": "0xD00080"
          },
          {
            "addr": "0xD1A872",
            "value": "0x000041"
          },
          {
            "addr": "0xD1A875",
            "value": "0x000001"
          },
          {
            "addr": "0xD1A878",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A87B",
            "value": "0x000731"
          },
          {
            "addr": "0xD1A87E",
            "value": "0x000000"
          }
        ],
        "ixFrame": {
          "IX-45": "0xFF0105",
          "IX-42": "0x000000",
          "IX-39": "0x013D86",
          "IX-30": "0x002E0B",
          "IX-27": "0xD1A87E",
          "IX-24": "0x63",
          "IX-20": "0x750138",
          "IX-17": "0x68D1A8",
          "IX-11": "0x800200",
          "IX-8": "0x00",
          "IX-7": "0xD0",
          "IX-6": "0x000041",
          "IX-3": "0x000001",
          "IX+0": "0x000000",
          "IX+3": "0x000731",
          "IX+6": "0x000000",
          "IX+9": "0x000000"
        },
        "recentBlocks": [
          "0x013D8D",
          "0x000725",
          "0x0158A6",
          "0x00072D",
          "0x0138F1",
          "0x002197",
          "0x0138F9",
          "0x013918",
          "0x013927",
          "0x01394E",
          "0x01395B",
          "0x006447"
        ],
        "callStackTail": [
          "0x00072D",
          "0x0138F1"
        ]
      },
      "transfer006475": {
        "block": 57636,
        "pc": "0x006475",
        "state": {
          "af": "0x0042",
          "bc": "0x000000",
          "de": "0x008000",
          "hl": "0x020001",
          "sp": "0xD1A83D",
          "ix": "0xD1A866",
          "iy": "0xD00080",
          "flags": {
            "z": true,
            "c": false,
            "n": true
          },
          "D000AC": "0x01",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00596": "0x0A",
          "D0059C": "0x00006E",
          "D005A0": "0xD5",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "vramPixels": 3011
        },
        "memory": {
          "low0059c": "0x095CC3",
          "low005a0": "0x06F3C3",
          "D00596": "0x0A",
          "D0059C": "0x00006E",
          "D005A0": "0xD5",
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
          },
          {
            "addr": "0xD1A84C",
            "value": "0x00FF01"
          },
          {
            "addr": "0xD1A84F",
            "value": "0x860000"
          },
          {
            "addr": "0xD1A852",
            "value": "0x08013D"
          }
        ],
        "ixFrame": {
          "IX-45": "0x450000",
          "IX-42": "0x00D1A8",
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
        "recentBlocks": [
          "0x0158A6",
          "0x00072D",
          "0x0138F1",
          "0x002197",
          "0x0138F9",
          "0x013918",
          "0x013927",
          "0x01394E",
          "0x01395B",
          "0x006447",
          "0x00646C",
          "0x006475"
        ],
        "callStackTail": [
          "0x00072D",
          "0x0138F1"
        ]
      },
      "transfer00647d": {
        "block": 57647,
        "pc": "0x00647D",
        "state": {
          "af": "0x090C",
          "bc": "0x09D6B4",
          "de": "0x008000",
          "hl": "0x0BD6BA",
          "sp": "0xD1A83D",
          "ix": "0xD1A866",
          "iy": "0xD00080",
          "flags": {
            "z": false,
            "c": false,
            "n": false
          },
          "D000AC": "0x01",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00596": "0x0A",
          "D0059C": "0x00006E",
          "D005A0": "0xD5",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "vramPixels": 3011
        },
        "memory": {
          "low0059c": "0x095CC3",
          "low005a0": "0x06F3C3",
          "D00596": "0x0A",
          "D0059C": "0x00006E",
          "D005A0": "0xD5",
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
          },
          {
            "addr": "0xD1A84C",
            "value": "0x00FF01"
          },
          {
            "addr": "0xD1A84F",
            "value": "0x860000"
          },
          {
            "addr": "0xD1A852",
            "value": "0x08013D"
          }
        ],
        "ixFrame": {
          "IX-45": "0x647900",
          "IX-42": "0x00D100",
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
        "recentBlocks": [
          "0x006475",
          "0x001C7D",
          "0x001CA6",
          "0x001CC0",
          "0x001CCA",
          "0x001CCE",
          "0x001CD5",
          "0x001CE5",
          "0x001C81",
          "0x001C82",
          "0x006479",
          "0x00647D"
        ],
        "callStackTail": [
          "0x00072D"
        ]
      },
      "transfer0064c7": {
        "block": 57772,
        "pc": "0x0064C7",
        "state": {
          "af": "0x0A42",
          "bc": "0x002000",
          "de": "0x000240",
          "hl": "0x000000",
          "sp": "0xD1A83D",
          "ix": "0xD1A866",
          "iy": "0xD00080",
          "flags": {
            "z": true,
            "c": false,
            "n": true
          },
          "D000AC": "0x01",
          "D00121": "0x000000",
          "D00124": "0x0A",
          "D00596": "0x13",
          "D0059C": "0x0000DA",
          "D005A0": "0x85",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
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
          },
          {
            "addr": "0xD1A84C",
            "value": "0x00FF01"
          },
          {
            "addr": "0xD1A84F",
            "value": "0x860000"
          },
          {
            "addr": "0xD1A852",
            "value": "0x08013D"
          }
        ],
        "ixFrame": {
          "IX-45": "0x64C700",
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
        "recentBlocks": [
          "0x001C38",
          "0x001C3C",
          "0x001C42",
          "0x00649B",
          "0x00649D",
          "0x0064BE",
          "0x006C8E",
          "0x006C9C",
          "0x006CA1",
          "0x006CB2",
          "0x006CB7",
          "0x0064C7"
        ],
        "callStackTail": []
      },
      "low0064d0": {
        "block": 57859,
        "pc": "0x0064D0",
        "state": {
          "af": "0x0A42",
          "bc": "0x002000",
          "de": "0x000240",
          "hl": "0x0017DB",
          "sp": "0xD1A83A",
          "ix": "0xD1A866",
          "iy": "0xD00080",
          "flags": {
            "z": true,
            "c": false,
            "n": true
          },
          "D000AC": "0x01",
          "D00121": "0x000000",
          "D00124": "0x0A",
          "D00596": "0x13",
          "D0059C": "0x0000DA",
          "D005A0": "0x85",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
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
          },
          {
            "addr": "0xD1A84C",
            "value": "0x00FF01"
          },
          {
            "addr": "0xD1A84F",
            "value": "0x860000"
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
        "recentBlocks": [
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
      "low006cc6": {
        "block": 57860,
        "pc": "0x006CC6",
        "state": {
          "af": "0x0A42",
          "bc": "0x020000",
          "de": "0x000240",
          "hl": "0x000000",
          "sp": "0xD1A834",
          "ix": "0xD1A866",
          "iy": "0xD00080",
          "flags": {
            "z": true,
            "c": false,
            "n": true
          },
          "D000AC": "0x01",
          "D00121": "0x000000",
          "D00124": "0x0A",
          "D00596": "0x13",
          "D0059C": "0x0000DA",
          "D005A0": "0x85",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
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
        "recentBlocks": [
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
    "final": {
      "pc": "0x006CC6",
      "af": "0x0A42",
      "sp": "0xD1A834",
      "D000AC": "0x01",
      "D007CA": "0x0585E9",
      "D008E0": "0xD1A863",
      "D02590": "0xD3FE81",
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
    "path": "0x000721 -> 0x013D00 -> 0x005BA6 -> 0x013D11 -> 0x000725 -> 0x0158A6 -> 0x00072D -> 0x0138F1 -> 0x002197 -> 0x0138F9 -> 0x013927 -> 0x01395B -> 0x006447 -> 0x006475 -> 0x0064D0 -> 0x006CC6",
    "counts": {
      "seed000721": 1,
      "seed013d00": 1,
      "seed005ba6": 1,
      "seed013d11": 1,
      "post000725": 1,
      "post0158a6": 6,
      "post00072d": 1,
      "post0138f1": 1,
      "trampoline002197": 13,
      "post0138f9": 1,
      "post013927": 1,
      "post01395b": 1,
      "transfer006447": 1,
      "transfer006475": 1,
      "transfer00647d": 1,
      "transfer0064c7": 1,
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
    "postSeedTransitions": [
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
        "name": "post000725",
        "hit": 1,
        "block": 20042,
        "pc": "0x000725",
        "previous": "0x013D8D",
        "sp": "0xD1A87E",
        "top": "0x000000",
        "stackTail": [],
        "recentTail": [
          "0x005B92",
          "0x005A19",
          "0x0059DA",
          "0x0059E6",
          "0x0059F7",
          "0x0059ED",
          "0x0059FE",
          "0x013D32",
          "0x013D35",
          "0x013D87",
          "0x013D8D",
          "0x000725"
        ]
      },
      {
        "name": "post0158a6",
        "hit": 6,
        "block": 20043,
        "pc": "0x0158A6",
        "previous": "0x000725",
        "sp": "0xD1A87B",
        "top": "0x00072D",
        "stackTail": [
          "0x000725"
        ],
        "recentTail": [
          "0x005A19",
          "0x0059DA",
          "0x0059E6",
          "0x0059F7",
          "0x0059ED",
          "0x0059FE",
          "0x013D32",
          "0x013D35",
          "0x013D87",
          "0x013D8D",
          "0x000725",
          "0x0158A6"
        ]
      },
      {
        "name": "post00072d",
        "hit": 1,
        "block": 20044,
        "pc": "0x00072D",
        "previous": "0x0158A6",
        "sp": "0xD1A87E",
        "top": "0x000000",
        "stackTail": [],
        "recentTail": [
          "0x0059DA",
          "0x0059E6",
          "0x0059F7",
          "0x0059ED",
          "0x0059FE",
          "0x013D32",
          "0x013D35",
          "0x013D87",
          "0x013D8D",
          "0x000725",
          "0x0158A6",
          "0x00072D"
        ]
      },
      {
        "name": "post0138f1",
        "hit": 1,
        "block": 20045,
        "pc": "0x0138F1",
        "previous": "0x00072D",
        "sp": "0xD1A87B",
        "top": "0x000731",
        "stackTail": [
          "0x00072D"
        ],
        "recentTail": [
          "0x0059E6",
          "0x0059F7",
          "0x0059ED",
          "0x0059FE",
          "0x013D32",
          "0x013D35",
          "0x013D87",
          "0x013D8D",
          "0x000725",
          "0x0158A6",
          "0x00072D",
          "0x0138F1"
        ]
      },
      {
        "name": "trampoline002197",
        "hit": 13,
        "block": 20046,
        "pc": "0x002197",
        "previous": "0x0138F1",
        "sp": "0xD1A878",
        "top": "0x0138F9",
        "stackTail": [
          "0x00072D",
          "0x0138F1"
        ],
        "recentTail": [
          "0x0059F7",
          "0x0059ED",
          "0x0059FE",
          "0x013D32",
          "0x013D35",
          "0x013D87",
          "0x013D8D",
          "0x000725",
          "0x0158A6",
          "0x00072D",
          "0x0138F1",
          "0x002197"
        ]
      },
      {
        "name": "post0138f9",
        "hit": 1,
        "block": 20047,
        "pc": "0x0138F9",
        "previous": "0x002197",
        "sp": "0xD1A875",
        "top": "0xD00080",
        "stackTail": [
          "0x00072D",
          "0x0138F1",
          "0x002197"
        ],
        "recentTail": [
          "0x0059ED",
          "0x0059FE",
          "0x013D32",
          "0x013D35",
          "0x013D87",
          "0x013D8D",
          "0x000725",
          "0x0158A6",
          "0x00072D",
          "0x0138F1",
          "0x002197",
          "0x0138F9"
        ]
      },
      {
        "name": "post013927",
        "hit": 1,
        "block": 20049,
        "pc": "0x013927",
        "previous": "0x013918",
        "sp": "0xD1A86C",
        "top": "0x000041",
        "stackTail": [
          "0x00072D",
          "0x0138F1",
          "0x002197",
          "0x0138F9"
        ],
        "recentTail": [
          "0x013D32",
          "0x013D35",
          "0x013D87",
          "0x013D8D",
          "0x000725",
          "0x0158A6",
          "0x00072D",
          "0x0138F1",
          "0x002197",
          "0x0138F9",
          "0x013918",
          "0x013927"
        ]
      },
      {
        "name": "post01395b",
        "hit": 1,
        "block": 20051,
        "pc": "0x01395B",
        "previous": "0x01394E",
        "sp": "0xD1A863",
        "top": "0x0138F9",
        "stackTail": [
          "0x00072D",
          "0x0138F1",
          "0x002197",
          "0x0138F9"
        ],
        "recentTail": [
          "0x013D87",
          "0x013D8D",
          "0x000725",
          "0x0158A6",
          "0x00072D",
          "0x0138F1",
          "0x002197",
          "0x0138F9",
          "0x013918",
          "0x013927",
          "0x01394E",
          "0x01395B"
        ]
      },
      {
        "name": "transfer006447",
        "hit": 1,
        "block": 20052,
        "pc": "0x006447",
        "previous": "0x01395B",
        "sp": "0xD1A869",
        "top": "0x013968",
        "stackTail": [
          "0x00072D",
          "0x0138F1"
        ],
        "recentTail": [
          "0x013D8D",
          "0x000725",
          "0x0158A6",
          "0x00072D",
          "0x0138F1",
          "0x002197",
          "0x0138F9",
          "0x013918",
          "0x013927",
          "0x01394E",
          "0x01395B",
          "0x006447"
        ]
      },
      {
        "name": "transfer006475",
        "hit": 1,
        "block": 20054,
        "pc": "0x006475",
        "previous": "0x00646C",
        "sp": "0xD1A83D",
        "top": "0x1700D1",
        "stackTail": [
          "0x00072D",
          "0x0138F1"
        ],
        "recentTail": [
          "0x0158A6",
          "0x00072D",
          "0x0138F1",
          "0x002197",
          "0x0138F9",
          "0x013918",
          "0x013927",
          "0x01394E",
          "0x01395B",
          "0x006447",
          "0x00646C",
          "0x006475"
        ]
      },
      {
        "name": "transfer00647d",
        "hit": 1,
        "block": 20065,
        "pc": "0x00647D",
        "previous": "0x006479",
        "sp": "0xD1A83D",
        "top": "0x1700D1",
        "stackTail": [
          "0x00072D"
        ],
        "recentTail": [
          "0x006475",
          "0x001C7D",
          "0x001CA6",
          "0x001CC0",
          "0x001CCA",
          "0x001CCE",
          "0x001CD5",
          "0x001CE5",
          "0x001C81",
          "0x001C82",
          "0x006479",
          "0x00647D"
        ]
      },
      {
        "name": "transfer0064c7",
        "hit": 1,
        "block": 20190,
        "pc": "0x0064C7",
        "previous": "0x006CB7",
        "sp": "0xD1A83D",
        "top": "0x1700D1",
        "stackTail": [],
        "recentTail": [
          "0x001C38",
          "0x001C3C",
          "0x001C42",
          "0x00649B",
          "0x00649D",
          "0x0064BE",
          "0x006C8E",
          "0x006C9C",
          "0x006CA1",
          "0x006CB2",
          "0x006CB7",
          "0x0064C7"
        ]
      },
      {
        "name": "low0064d0",
        "hit": 1,
        "block": 20277,
        "pc": "0x0064D0",
        "previous": "0x0017FC",
        "sp": "0xD1A83A",
        "top": "0x000000",
        "stackTail": [],
        "recentTail": [
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
      {
        "name": "low006cc6",
        "hit": 1,
        "block": 20278,
        "pc": "0x006CC6",
        "previous": "0x0064D0",
        "sp": "0xD1A834",
        "top": "0x0064DE",
        "stackTail": [
          "0x0064D0"
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
          "0x0017FC",
          "0x0064D0",
          "0x006CC6"
        ]
      }
    ],
    "postSeedSamples": {
      "seed000721": {
        "block": 12633,
        "pc": "0x000721",
        "state": {
          "af": "0x0042",
          "bc": "0x00A55A",
          "de": "0xD65800",
          "hl": "0x000000",
          "sp": "0xD1A87E",
          "ix": "0x000000",
          "iy": "0xD00080",
          "flags": {
            "z": true,
            "c": false,
            "n": true
          },
          "D000AC": "0x01",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000000",
          "D005A0": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
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
          },
          {
            "addr": "0xD1A890",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A893",
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
        "recentBlocks": [
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
        ],
        "callStackTail": []
      },
      "seed013d00": {
        "block": 12634,
        "pc": "0x013D00",
        "state": {
          "af": "0x0042",
          "bc": "0x00A55A",
          "de": "0xD65800",
          "hl": "0x000000",
          "sp": "0xD1A87B",
          "ix": "0x000000",
          "iy": "0xD00080",
          "flags": {
            "z": true,
            "c": false,
            "n": true
          },
          "D000AC": "0x01",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000000",
          "D005A0": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
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
          },
          {
            "addr": "0xD1A88D",
            "value": "0x008000"
          },
          {
            "addr": "0xD1A890",
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
        "recentBlocks": [
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
        ],
        "callStackTail": [
          "0x000721"
        ]
      },
      "seed005ba6": {
        "block": 12635,
        "pc": "0x005BA6",
        "state": {
          "af": "0x0040",
          "bc": "0x00A55A",
          "de": "0xD65800",
          "hl": "0x000000",
          "sp": "0xD1A86F",
          "ix": "0x000000",
          "iy": "0xD00080",
          "flags": {
            "z": true,
            "c": false,
            "n": false
          },
          "D000AC": "0x01",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000000",
          "D005A0": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
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
          },
          {
            "addr": "0xD1A881",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A884",
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
        "recentBlocks": [
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
        ],
        "callStackTail": [
          "0x000721",
          "0x013D00"
        ]
      },
      "seed013d11": {
        "block": 12636,
        "pc": "0x013D11",
        "state": {
          "af": "0x0040",
          "bc": "0x00A55A",
          "de": "0xD65800",
          "hl": "0x000000",
          "sp": "0xD1A872",
          "ix": "0x000000",
          "iy": "0xD00080",
          "flags": {
            "z": true,
            "c": false,
            "n": false
          },
          "D000AC": "0x01",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000000",
          "D005A0": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
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
          },
          {
            "addr": "0xD1A884",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A887",
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
        "recentBlocks": [
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
        ],
        "callStackTail": [
          "0x000721"
        ]
      },
      "post000725": {
        "block": 20042,
        "pc": "0x000725",
        "state": {
          "af": "0x0040",
          "bc": "0x00005A",
          "de": "0x000009",
          "hl": "0x013D87",
          "sp": "0xD1A87E",
          "ix": "0x000000",
          "iy": "0xD00080",
          "flags": {
            "z": true,
            "c": false,
            "n": false
          },
          "D000AC": "0x01",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00596": "0x0A",
          "D0059C": "0x00006E",
          "D005A0": "0xD5",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "vramPixels": 3011
        },
        "memory": {
          "low0059c": "0x095CC3",
          "low005a0": "0x06F3C3",
          "D00596": "0x0A",
          "D0059C": "0x00006E",
          "D005A0": "0xD5",
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
          },
          {
            "addr": "0xD1A890",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A893",
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
        "recentBlocks": [
          "0x005B92",
          "0x005A19",
          "0x0059DA",
          "0x0059E6",
          "0x0059F7",
          "0x0059ED",
          "0x0059FE",
          "0x013D32",
          "0x013D35",
          "0x013D87",
          "0x013D8D",
          "0x000725"
        ],
        "callStackTail": []
      },
      "post0158a6": {
        "block": 20043,
        "pc": "0x0158A6",
        "state": {
          "af": "0x0040",
          "bc": "0x00005A",
          "de": "0x000009",
          "hl": "0x000000",
          "sp": "0xD1A87B",
          "ix": "0x000000",
          "iy": "0xD00080",
          "flags": {
            "z": true,
            "c": false,
            "n": false
          },
          "D000AC": "0x01",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00596": "0x0A",
          "D0059C": "0x00006E",
          "D005A0": "0xD5",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "vramPixels": 3011
        },
        "memory": {
          "low0059c": "0x095CC3",
          "low005a0": "0x06F3C3",
          "D00596": "0x0A",
          "D0059C": "0x00006E",
          "D005A0": "0xD5",
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
            "value": "0x00072D"
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
          },
          {
            "addr": "0xD1A88D",
            "value": "0x008000"
          },
          {
            "addr": "0xD1A890",
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
        "recentBlocks": [
          "0x005A19",
          "0x0059DA",
          "0x0059E6",
          "0x0059F7",
          "0x0059ED",
          "0x0059FE",
          "0x013D32",
          "0x013D35",
          "0x013D87",
          "0x013D8D",
          "0x000725",
          "0x0158A6"
        ],
        "callStackTail": [
          "0x000725"
        ]
      },
      "post00072d": {
        "block": 20044,
        "pc": "0x00072D",
        "state": {
          "af": "0x0042",
          "bc": "0x00005A",
          "de": "0x000009",
          "hl": "0x000000",
          "sp": "0xD1A87E",
          "ix": "0x000000",
          "iy": "0xD00080",
          "flags": {
            "z": true,
            "c": false,
            "n": true
          },
          "D000AC": "0x01",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00596": "0x0A",
          "D0059C": "0x00006E",
          "D005A0": "0xD5",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "vramPixels": 3011
        },
        "memory": {
          "low0059c": "0x095CC3",
          "low005a0": "0x06F3C3",
          "D00596": "0x0A",
          "D0059C": "0x00006E",
          "D005A0": "0xD5",
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
          },
          {
            "addr": "0xD1A890",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A893",
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
        "recentBlocks": [
          "0x0059DA",
          "0x0059E6",
          "0x0059F7",
          "0x0059ED",
          "0x0059FE",
          "0x013D32",
          "0x013D35",
          "0x013D87",
          "0x013D8D",
          "0x000725",
          "0x0158A6",
          "0x00072D"
        ],
        "callStackTail": []
      },
      "post0138f1": {
        "block": 20045,
        "pc": "0x0138F1",
        "state": {
          "af": "0x0042",
          "bc": "0x00005A",
          "de": "0x000009",
          "hl": "0x000000",
          "sp": "0xD1A87B",
          "ix": "0x000000",
          "iy": "0xD00080",
          "flags": {
            "z": true,
            "c": false,
            "n": true
          },
          "D000AC": "0x01",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00596": "0x0A",
          "D0059C": "0x00006E",
          "D005A0": "0xD5",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "vramPixels": 3011
        },
        "memory": {
          "low0059c": "0x095CC3",
          "low005a0": "0x06F3C3",
          "D00596": "0x0A",
          "D0059C": "0x00006E",
          "D005A0": "0xD5",
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
            "value": "0x000731"
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
          },
          {
            "addr": "0xD1A88D",
            "value": "0x008000"
          },
          {
            "addr": "0xD1A890",
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
        "recentBlocks": [
          "0x0059E6",
          "0x0059F7",
          "0x0059ED",
          "0x0059FE",
          "0x013D32",
          "0x013D35",
          "0x013D87",
          "0x013D8D",
          "0x000725",
          "0x0158A6",
          "0x00072D",
          "0x0138F1"
        ],
        "callStackTail": [
          "0x00072D"
        ]
      },
      "trampoline002197": {
        "block": 20046,
        "pc": "0x002197",
        "state": {
          "af": "0x0042",
          "bc": "0x00005A",
          "de": "0x000009",
          "hl": "0xFFFFFD",
          "sp": "0xD1A878",
          "ix": "0x000000",
          "iy": "0xD00080",
          "flags": {
            "z": true,
            "c": false,
            "n": true
          },
          "D000AC": "0x01",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00596": "0x0A",
          "D0059C": "0x00006E",
          "D005A0": "0xD5",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "vramPixels": 3011
        },
        "memory": {
          "low0059c": "0x095CC3",
          "low005a0": "0x06F3C3",
          "D00596": "0x0A",
          "D0059C": "0x00006E",
          "D005A0": "0xD5",
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
            "addr": "0xD1A878",
            "value": "0x0138F9"
          },
          {
            "addr": "0xD1A87B",
            "value": "0x000731"
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
        "recentBlocks": [
          "0x0059F7",
          "0x0059ED",
          "0x0059FE",
          "0x013D32",
          "0x013D35",
          "0x013D87",
          "0x013D8D",
          "0x000725",
          "0x0158A6",
          "0x00072D",
          "0x0138F1",
          "0x002197"
        ],
        "callStackTail": [
          "0x00072D",
          "0x0138F1"
        ]
      },
      "post0138f9": {
        "block": 20047,
        "pc": "0x0138F9",
        "state": {
          "af": "0x0051",
          "bc": "0x00005A",
          "de": "0xD1A875",
          "hl": "0x0138F9",
          "sp": "0xD1A875",
          "ix": "0xD1A878",
          "iy": "0xD00080",
          "flags": {
            "z": true,
            "c": true,
            "n": false
          },
          "D000AC": "0x01",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00596": "0x0A",
          "D0059C": "0x00006E",
          "D005A0": "0xD5",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "vramPixels": 3011
        },
        "memory": {
          "low0059c": "0x095CC3",
          "low005a0": "0x06F3C3",
          "D00596": "0x0A",
          "D0059C": "0x00006E",
          "D005A0": "0xD5",
          "D005A1": "0x00",
          "D005A2": "0x00",
          "ixBytes": [
            "0x00",
            "0x00",
            "0x00",
            "0x31",
            "0x07",
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
            "addr": "0xD1A875",
            "value": "0xD00080"
          },
          {
            "addr": "0xD1A878",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A87B",
            "value": "0x000731"
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
          "IX-45": "0xFF0105",
          "IX-42": "0x000000",
          "IX-39": "0x013D86",
          "IX-30": "0x002E0B",
          "IX-27": "0x0059DA",
          "IX-24": "0x86",
          "IX-20": "0xF7002E",
          "IX-17": "0x450059",
          "IX-11": "0x320001",
          "IX-8": "0x3D",
          "IX-7": "0x01",
          "IX-6": "0x000000",
          "IX-3": "0xD00080",
          "IX+0": "0x000000",
          "IX+3": "0x000731",
          "IX+6": "0x000000",
          "IX+9": "0x000000"
        },
        "recentBlocks": [
          "0x0059ED",
          "0x0059FE",
          "0x013D32",
          "0x013D35",
          "0x013D87",
          "0x013D8D",
          "0x000725",
          "0x0158A6",
          "0x00072D",
          "0x0138F1",
          "0x002197",
          "0x0138F9"
        ],
        "callStackTail": [
          "0x00072D",
          "0x0138F1",
          "0x002197"
        ]
      },
      "post013927": {
        "block": 20049,
        "pc": "0x013927",
        "state": {
          "af": "0x0480",
          "bc": "0x000001",
          "de": "0xD1A875",
          "hl": "0x0138F9",
          "sp": "0xD1A86C",
          "ix": "0xD1A878",
          "iy": "0xD00080",
          "flags": {
            "z": false,
            "c": false,
            "n": false
          },
          "D000AC": "0x01",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00596": "0x0A",
          "D0059C": "0x00006E",
          "D005A0": "0xD5",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "vramPixels": 3011
        },
        "memory": {
          "low0059c": "0x095CC3",
          "low005a0": "0x06F3C3",
          "D00596": "0x0A",
          "D0059C": "0x00006E",
          "D005A0": "0xD5",
          "D005A1": "0x00",
          "D005A2": "0x00",
          "ixBytes": [
            "0x00",
            "0x00",
            "0x00",
            "0x31",
            "0x07",
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
            "addr": "0xD1A86C",
            "value": "0x000041"
          },
          {
            "addr": "0xD1A86F",
            "value": "0xD00080"
          },
          {
            "addr": "0xD1A872",
            "value": "0x000041"
          },
          {
            "addr": "0xD1A875",
            "value": "0x000001"
          },
          {
            "addr": "0xD1A878",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A87B",
            "value": "0x000731"
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
          "IX-45": "0xFF0105",
          "IX-42": "0x000000",
          "IX-39": "0x013D86",
          "IX-30": "0x002E0B",
          "IX-27": "0x0059DA",
          "IX-24": "0x86",
          "IX-20": "0xF7002E",
          "IX-17": "0x450059",
          "IX-11": "0x800000",
          "IX-8": "0x00",
          "IX-7": "0xD0",
          "IX-6": "0x000041",
          "IX-3": "0x000001",
          "IX+0": "0x000000",
          "IX+3": "0x000731",
          "IX+6": "0x000000",
          "IX+9": "0x000000"
        },
        "recentBlocks": [
          "0x013D32",
          "0x013D35",
          "0x013D87",
          "0x013D8D",
          "0x000725",
          "0x0158A6",
          "0x00072D",
          "0x0138F1",
          "0x002197",
          "0x0138F9",
          "0x013918",
          "0x013927"
        ],
        "callStackTail": [
          "0x00072D",
          "0x0138F1",
          "0x002197",
          "0x0138F9"
        ]
      },
      "post01395b": {
        "block": 20051,
        "pc": "0x01395B",
        "state": {
          "af": "0x0001",
          "bc": "0xD1987E",
          "de": "0xD1A87E",
          "hl": "0xD1A863",
          "sp": "0xD1A863",
          "ix": "0xD1A878",
          "iy": "0xD00080",
          "flags": {
            "z": false,
            "c": true,
            "n": false
          },
          "D000AC": "0x01",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00596": "0x0A",
          "D0059C": "0x00006E",
          "D005A0": "0xD5",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "vramPixels": 3011
        },
        "memory": {
          "low0059c": "0x095CC3",
          "low005a0": "0x06F3C3",
          "D00596": "0x0A",
          "D0059C": "0x00006E",
          "D005A0": "0xD5",
          "D005A1": "0x00",
          "D005A2": "0x00",
          "ixBytes": [
            "0x00",
            "0x00",
            "0x00",
            "0x31",
            "0x07",
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
            "addr": "0xD1A863",
            "value": "0x0138F9"
          },
          {
            "addr": "0xD1A866",
            "value": "0xD1A875"
          },
          {
            "addr": "0xD1A869",
            "value": "0x000001"
          },
          {
            "addr": "0xD1A86C",
            "value": "0x000041"
          },
          {
            "addr": "0xD1A86F",
            "value": "0xD00080"
          },
          {
            "addr": "0xD1A872",
            "value": "0x000041"
          },
          {
            "addr": "0xD1A875",
            "value": "0x000001"
          },
          {
            "addr": "0xD1A878",
            "value": "0x000000"
          }
        ],
        "ixFrame": {
          "IX-45": "0xFF0105",
          "IX-42": "0x000000",
          "IX-39": "0x013D86",
          "IX-30": "0x002E0B",
          "IX-27": "0xD1A87E",
          "IX-24": "0x63",
          "IX-20": "0x750138",
          "IX-17": "0x01D1A8",
          "IX-11": "0x800000",
          "IX-8": "0x00",
          "IX-7": "0xD0",
          "IX-6": "0x000041",
          "IX-3": "0x000001",
          "IX+0": "0x000000",
          "IX+3": "0x000731",
          "IX+6": "0x000000",
          "IX+9": "0x000000"
        },
        "recentBlocks": [
          "0x013D87",
          "0x013D8D",
          "0x000725",
          "0x0158A6",
          "0x00072D",
          "0x0138F1",
          "0x002197",
          "0x0138F9",
          "0x013918",
          "0x013927",
          "0x01394E",
          "0x01395B"
        ],
        "callStackTail": [
          "0x00072D",
          "0x0138F1",
          "0x002197",
          "0x0138F9"
        ]
      },
      "transfer006447": {
        "block": 20052,
        "pc": "0x006447",
        "state": {
          "af": "0x0041",
          "bc": "0x020000",
          "de": "0xD1A875",
          "hl": "0x0138F9",
          "sp": "0xD1A869",
          "ix": "0xD1A878",
          "iy": "0xD00080",
          "flags": {
            "z": true,
            "c": true,
            "n": false
          },
          "D000AC": "0x01",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00596": "0x0A",
          "D0059C": "0x00006E",
          "D005A0": "0xD5",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "vramPixels": 3011
        },
        "memory": {
          "low0059c": "0x095CC3",
          "low005a0": "0x06F3C3",
          "D00596": "0x0A",
          "D0059C": "0x00006E",
          "D005A0": "0xD5",
          "D005A1": "0x00",
          "D005A2": "0x00",
          "ixBytes": [
            "0x00",
            "0x00",
            "0x00",
            "0x31",
            "0x07",
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
            "addr": "0xD1A869",
            "value": "0x013968"
          },
          {
            "addr": "0xD1A86C",
            "value": "0x020000"
          },
          {
            "addr": "0xD1A86F",
            "value": "0xD00080"
          },
          {
            "addr": "0xD1A872",
            "value": "0x000041"
          },
          {
            "addr": "0xD1A875",
            "value": "0x000001"
          },
          {
            "addr": "0xD1A878",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A87B",
            "value": "0x000731"
          },
          {
            "addr": "0xD1A87E",
            "value": "0x000000"
          }
        ],
        "ixFrame": {
          "IX-45": "0xFF0105",
          "IX-42": "0x000000",
          "IX-39": "0x013D86",
          "IX-30": "0x002E0B",
          "IX-27": "0xD1A87E",
          "IX-24": "0x63",
          "IX-20": "0x750138",
          "IX-17": "0x68D1A8",
          "IX-11": "0x800200",
          "IX-8": "0x00",
          "IX-7": "0xD0",
          "IX-6": "0x000041",
          "IX-3": "0x000001",
          "IX+0": "0x000000",
          "IX+3": "0x000731",
          "IX+6": "0x000000",
          "IX+9": "0x000000"
        },
        "recentBlocks": [
          "0x013D8D",
          "0x000725",
          "0x0158A6",
          "0x00072D",
          "0x0138F1",
          "0x002197",
          "0x0138F9",
          "0x013918",
          "0x013927",
          "0x01394E",
          "0x01395B",
          "0x006447"
        ],
        "callStackTail": [
          "0x00072D",
          "0x0138F1"
        ]
      },
      "transfer006475": {
        "block": 20054,
        "pc": "0x006475",
        "state": {
          "af": "0x0042",
          "bc": "0x000000",
          "de": "0x008000",
          "hl": "0x020001",
          "sp": "0xD1A83D",
          "ix": "0xD1A866",
          "iy": "0xD00080",
          "flags": {
            "z": true,
            "c": false,
            "n": true
          },
          "D000AC": "0x01",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00596": "0x0A",
          "D0059C": "0x00006E",
          "D005A0": "0xD5",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "vramPixels": 3011
        },
        "memory": {
          "low0059c": "0x095CC3",
          "low005a0": "0x06F3C3",
          "D00596": "0x0A",
          "D0059C": "0x00006E",
          "D005A0": "0xD5",
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
          },
          {
            "addr": "0xD1A84C",
            "value": "0x00FF01"
          },
          {
            "addr": "0xD1A84F",
            "value": "0x860000"
          },
          {
            "addr": "0xD1A852",
            "value": "0x08013D"
          }
        ],
        "ixFrame": {
          "IX-45": "0x450000",
          "IX-42": "0x00D1A8",
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
        "recentBlocks": [
          "0x0158A6",
          "0x00072D",
          "0x0138F1",
          "0x002197",
          "0x0138F9",
          "0x013918",
          "0x013927",
          "0x01394E",
          "0x01395B",
          "0x006447",
          "0x00646C",
          "0x006475"
        ],
        "callStackTail": [
          "0x00072D",
          "0x0138F1"
        ]
      },
      "transfer00647d": {
        "block": 20065,
        "pc": "0x00647D",
        "state": {
          "af": "0x090C",
          "bc": "0x09D6B4",
          "de": "0x008000",
          "hl": "0x0BD6BA",
          "sp": "0xD1A83D",
          "ix": "0xD1A866",
          "iy": "0xD00080",
          "flags": {
            "z": false,
            "c": false,
            "n": false
          },
          "D000AC": "0x01",
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00596": "0x0A",
          "D0059C": "0x00006E",
          "D005A0": "0xD5",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
          "vramPixels": 3011
        },
        "memory": {
          "low0059c": "0x095CC3",
          "low005a0": "0x06F3C3",
          "D00596": "0x0A",
          "D0059C": "0x00006E",
          "D005A0": "0xD5",
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
          },
          {
            "addr": "0xD1A84C",
            "value": "0x00FF01"
          },
          {
            "addr": "0xD1A84F",
            "value": "0x860000"
          },
          {
            "addr": "0xD1A852",
            "value": "0x08013D"
          }
        ],
        "ixFrame": {
          "IX-45": "0x647900",
          "IX-42": "0x00D100",
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
        "recentBlocks": [
          "0x006475",
          "0x001C7D",
          "0x001CA6",
          "0x001CC0",
          "0x001CCA",
          "0x001CCE",
          "0x001CD5",
          "0x001CE5",
          "0x001C81",
          "0x001C82",
          "0x006479",
          "0x00647D"
        ],
        "callStackTail": [
          "0x00072D"
        ]
      },
      "transfer0064c7": {
        "block": 20190,
        "pc": "0x0064C7",
        "state": {
          "af": "0x0A42",
          "bc": "0x002000",
          "de": "0x000240",
          "hl": "0x000000",
          "sp": "0xD1A83D",
          "ix": "0xD1A866",
          "iy": "0xD00080",
          "flags": {
            "z": true,
            "c": false,
            "n": true
          },
          "D000AC": "0x01",
          "D00121": "0x000000",
          "D00124": "0x0A",
          "D00596": "0x13",
          "D0059C": "0x0000DA",
          "D005A0": "0x85",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
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
          },
          {
            "addr": "0xD1A84C",
            "value": "0x00FF01"
          },
          {
            "addr": "0xD1A84F",
            "value": "0x860000"
          },
          {
            "addr": "0xD1A852",
            "value": "0x08013D"
          }
        ],
        "ixFrame": {
          "IX-45": "0x64C700",
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
        "recentBlocks": [
          "0x001C38",
          "0x001C3C",
          "0x001C42",
          "0x00649B",
          "0x00649D",
          "0x0064BE",
          "0x006C8E",
          "0x006C9C",
          "0x006CA1",
          "0x006CB2",
          "0x006CB7",
          "0x0064C7"
        ],
        "callStackTail": []
      },
      "low0064d0": {
        "block": 20277,
        "pc": "0x0064D0",
        "state": {
          "af": "0x0A42",
          "bc": "0x002000",
          "de": "0x000240",
          "hl": "0x0017DB",
          "sp": "0xD1A83A",
          "ix": "0xD1A866",
          "iy": "0xD00080",
          "flags": {
            "z": true,
            "c": false,
            "n": true
          },
          "D000AC": "0x01",
          "D00121": "0x000000",
          "D00124": "0x0A",
          "D00596": "0x13",
          "D0059C": "0x0000DA",
          "D005A0": "0x85",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
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
          },
          {
            "addr": "0xD1A84C",
            "value": "0x00FF01"
          },
          {
            "addr": "0xD1A84F",
            "value": "0x860000"
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
        "recentBlocks": [
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
      "low006cc6": {
        "block": 20278,
        "pc": "0x006CC6",
        "state": {
          "af": "0x0A42",
          "bc": "0x020000",
          "de": "0x000240",
          "hl": "0x000000",
          "sp": "0xD1A834",
          "ix": "0xD1A866",
          "iy": "0xD00080",
          "flags": {
            "z": true,
            "c": false,
            "n": true
          },
          "D000AC": "0x01",
          "D00121": "0x000000",
          "D00124": "0x0A",
          "D00596": "0x13",
          "D0059C": "0x0000DA",
          "D005A0": "0x85",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D02590": "0xD3FE81",
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
        "recentBlocks": [
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
    "final": {
      "pc": "0x006CC6",
      "af": "0x0A42",
      "sp": "0xD1A834",
      "D000AC": "0x01",
      "D007CA": "0x0585E9",
      "D008E0": "0xD1A863",
      "D02590": "0xD3FE81",
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

### 0x001409

```text
0x001409  fe 06            cp 0x06
0x00140B  20 17            jr nz, 0x001424
```

Exits: `[{"type":"branch","condition":"nz","target":5156,"targetMode":"adl"},{"type":"fallthrough","target":5133,"targetMode":"adl"}]`

### 0x00140D

```text
0x00140D  7d               ld a, l
0x00140E  fe a0            cp 0xa0
0x001410  ca bd 14 00      jp z, 0x0014bd
```

Exits: `[{"type":"branch","condition":"z","target":5309,"targetMode":"adl"},{"type":"fallthrough","target":5140,"targetMode":"adl"}]`

### 0x001414

```text
0x001414  fe 22            cp 0x22
0x001416  20 0c            jr nz, 0x001424
```

Exits: `[{"type":"branch","condition":"nz","target":5156,"targetMode":"adl"},{"type":"fallthrough","target":5144,"targetMode":"adl"}]`

### 0x001424

```text
0x001424  cd bb 08 00      call 0x0008bb
```

Exits: `[{"type":"call","target":2235,"targetMode":"adl"},{"type":"call-return","target":5160,"targetMode":"adl"}]`

### 0x0008BB

```text
0x0008BB  2a 00 01 02      ld hl, (0x020100)
0x0008BF  01 5a a5 00      ld bc, 0x00a55a
0x0008C3  b7               or a
0x0008C4  52 ed 42         sbc hl, bc
0x0008C7  c9               ret
```

Exits: `[{"type":"return"}]`

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

### 0x0014C9

```text
0x0014C9  f5               push af
0x0014CA  fd e5            push iy
0x0014CC  cd bb 08 00      call 0x0008bb
```

Exits: `[{"type":"call","target":2235,"targetMode":"adl"},{"type":"call-return","target":5328,"targetMode":"adl"}]`

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

### 0x003CF7

```text
0x003CF7  0e 00            ld c, 0x00
0x003CF9  3e 03            ld a, 0x03
0x003CFB  ed 79            out (c), a
0x003CFD  0e 0c            ld c, 0x0c
0x003CFF  3e 01            ld a, 0x01
0x003D01  ed 79            out (c), a
0x003D03  78               ld a, b
0x003D04  fe a0            cp 0xa0
0x003D06  28 01            jr z, 0x003d09
```

Exits: `[{"type":"branch","condition":"z","target":15625,"targetMode":"adl"},{"type":"fallthrough","target":15624,"targetMode":"adl"}]`

### 0x003D09

```text
0x003D09  0e 08            ld c, 0x08
0x003D0B  ed 61            out (c), h
0x003D0D  ed 78            in a, (c)
0x003D0F  28 fc            jr z, 0x003d0d
```

Exits: `[{"type":"branch","condition":"z","target":15629,"targetMode":"adl"},{"type":"fallthrough","target":15633,"targetMode":"adl"}]`

### 0x003D11

```text
0x003D11  0e 00            ld c, 0x00
0x003D13  af               xor a
0x003D14  ed 79            out (c), a
0x003D16  78               ld a, b
0x003D17  fe a0            cp 0xa0
0x003D19  28 01            jr z, 0x003d1c
```

Exits: `[{"type":"branch","condition":"z","target":15644,"targetMode":"adl"},{"type":"fallthrough","target":15643,"targetMode":"adl"}]`

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

`0x000721` is not a token-tail bridge. It calls the one-shot renderer seed at `0x013D00`; after `0x013D11 -> 0x0059C6` finishes, execution returns to `0x000725`. The `0x0158A6` helper preserves the Z condition that makes `0x00072D` call `0x0138F1`.

`0x0138F1` does not return normally to a token handler. It loads `HL=0xFFFFFD` and calls the frame trampoline `0x002197`, whose dynamic stack top is the continuation `0x0138F9`. The trampoline pivots IX/SP and jumps into that continuation. From there, `0x01395F` pushes `0x020000` and calls `0x006447`, which builds the low transfer frame that reaches `0x006475`, `0x0064D0`, and finally `0x006CC6`. The low-transfer scheduling is therefore the direct post-seed continuation, not a side effect of missing cxMain/VAT restoration.
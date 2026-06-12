# Phase 653: Low-ROM Branch Inputs Into One-Shot Renderer Seed

Probe: `probe-phase653-branch-inputs.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase653-branch-inputs.mjs`

## Summary

- 4-star After `0x0013FC`, A/F is `0xEE54` in both key cases, so the port-`0x03` value has bit 4 clear and the `CALL NZ,0x015930` guard at `0x001401` is not taken.
- 4-star `0x003CBC` is confirmed as a flag set: `D000AC` (`IY+0x2C`) changes `0x00 -> 0x01` before the keyboard/status scan loop.
- 4-star The `0x001424 -> 0x0008BB` signature check is the branch input for `0x001428`: it returns `HL=0x000000`, Z=true, so `JP NZ,0x0014C9` is not taken.
- 4-star Both traces fall through `0x001428 -> 0x00142C -> 0x000721`; `0x0014C9` has zero hits.
- 3-star Token/tail hooks remain bypassed: `0x08F5E1`, `0x090992`, and `0x08F54B` stay at zero hits.
- No runtime, transpiler, browser, or scheduler source files were modified.

## Scenario Results

| Key | Trace | After 0x0013FC A/F | 0x015930 | D000AC before/after 0x003CBC | 0x001409 A/F | 0x001424 | 0x0008BB result at 0x001428 | 0x0014C9 | 0x00142C | 0x000721 | Token/tail | Low 0x006CC6 |
|---|---|---|---:|---|---|---:|---|---:|---:|---:|---:|---:|
| EOL/CLEAR | after-low-frame-selection 0x006CC6 | AF=0xEE54 Z=true | 0 | 0x00 -> 0x01 | AF=0x0044 | 1 | HL=0x000000 Z=true AF=0x0042 | 0 | 1 | 1 | 0 | 1 |
| Digit2 | after-low-frame-selection 0x006CC6 | AF=0xEE54 Z=true | 0 | 0x00 -> 0x01 | AF=0x0044 | 1 | HL=0x000000 Z=true AF=0x0042 | 0 | 1 | 1 | 0 | 1 |

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
    "path": "0x0013FC -> 0x001405 -> 0x003CBC -> 0x001409 -> 0x001424 -> 0x0008BB -> 0x001428 -> 0x00142C -> 0x000721",
    "counts": {
      "guard015930": 0,
      "pre001405": 1,
      "pre003cbc": 1,
      "post001409": 1,
      "alt00140d": 0,
      "alt001414": 0,
      "pre001424": 1,
      "sig0008bb": 110,
      "pre001428": 1,
      "branch0014c9": 0,
      "pre00142c": 1,
      "seed000721": 1,
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
    "branchIo": [
      {
        "type": "read",
        "block": 47109,
        "pc": "0x003CF3",
        "port": "0xA008",
        "value": "0x00",
        "a": "0x00",
        "f": "0x44"
      },
      {
        "type": "write",
        "block": 47330,
        "pc": "0x003CC2",
        "port": "0xA000",
        "value": "0x01",
        "a": "0x01",
        "f": "0x7D"
      },
      {
        "type": "write",
        "block": 47331,
        "pc": "0x003CD4",
        "port": "0xA00C",
        "value": "0x04",
        "a": "0x04",
        "f": "0x42"
      },
      {
        "type": "write",
        "block": 47332,
        "pc": "0x003CE0",
        "port": "0xA008",
        "value": "0xFF",
        "a": "0xA0",
        "f": "0x42"
      },
      {
        "type": "read",
        "block": 47334,
        "pc": "0x003CF3",
        "port": "0xA008",
        "value": "0x00",
        "a": "0x00",
        "f": "0x44"
      },
      {
        "type": "write",
        "block": 47505,
        "pc": "0x003CC2",
        "port": "0xA000",
        "value": "0x01",
        "a": "0x01",
        "f": "0x7D"
      },
      {
        "type": "write",
        "block": 47506,
        "pc": "0x003CD4",
        "port": "0xA00C",
        "value": "0x04",
        "a": "0x04",
        "f": "0x42"
      },
      {
        "type": "write",
        "block": 47507,
        "pc": "0x003CE0",
        "port": "0xA008",
        "value": "0xFF",
        "a": "0xA0",
        "f": "0x42"
      },
      {
        "type": "read",
        "block": 47509,
        "pc": "0x003CF3",
        "port": "0xA008",
        "value": "0x00",
        "a": "0x00",
        "f": "0x44"
      },
      {
        "type": "write",
        "block": 47880,
        "pc": "0x003CC2",
        "port": "0xA000",
        "value": "0x01",
        "a": "0x01",
        "f": "0x7D"
      },
      {
        "type": "write",
        "block": 47881,
        "pc": "0x003CD4",
        "port": "0xA00C",
        "value": "0x04",
        "a": "0x04",
        "f": "0x42"
      },
      {
        "type": "write",
        "block": 47882,
        "pc": "0x003CE0",
        "port": "0xA008",
        "value": "0xFF",
        "a": "0xA0",
        "f": "0x42"
      },
      {
        "type": "read",
        "block": 47884,
        "pc": "0x003CF3",
        "port": "0xA008",
        "value": "0x00",
        "a": "0x00",
        "f": "0x44"
      },
      {
        "type": "write",
        "block": 50206,
        "pc": "0x003CD4",
        "port": "0xA00C",
        "value": "0x04",
        "a": "0x04",
        "f": "0x42"
      },
      {
        "type": "write",
        "block": 50207,
        "pc": "0x003CE0",
        "port": "0xA008",
        "value": "0xFF",
        "a": "0xA0",
        "f": "0x42"
      },
      {
        "type": "read",
        "block": 50209,
        "pc": "0x003CF3",
        "port": "0xA008",
        "value": "0x00",
        "a": "0x00",
        "f": "0x44"
      }
    ],
    "branchSamples": {
      "pre0013fc": {
        "block": 50202,
        "pc": "0x0013FC",
        "af": "0x0480",
        "bc": "0x000044",
        "de": "0xD65800",
        "hl": "0xD657FF",
        "sp": "0xD1A87E",
        "flags": {
          "z": false,
          "c": false,
          "n": false
        },
        "D000AC": "0x00",
        "D007CA": "0x0585E9",
        "D008E0": "0xD1A863",
        "D02590": "0xD3FE81",
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
          }
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
          "0x0013FC"
        ]
      },
      "pre001405": {
        "block": 50203,
        "pc": "0x001405",
        "af": "0xEE54",
        "bc": "0x000044",
        "de": "0xD65800",
        "hl": "0xD657FF",
        "sp": "0xD1A87E",
        "flags": {
          "z": true,
          "c": false,
          "n": false
        },
        "D000AC": "0x00",
        "D007CA": "0x0585E9",
        "D008E0": "0xD1A863",
        "D02590": "0xD3FE81",
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
          }
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
          "0x001405"
        ]
      },
      "pre003cbc": {
        "block": 50204,
        "pc": "0x003CBC",
        "af": "0xEE54",
        "bc": "0x000044",
        "de": "0xD65800",
        "hl": "0xD657FF",
        "sp": "0xD1A87B",
        "flags": {
          "z": true,
          "c": false,
          "n": false
        },
        "D000AC": "0x00",
        "D007CA": "0x0585E9",
        "D008E0": "0xD1A863",
        "D02590": "0xD3FE81",
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
          }
        ],
        "recentBlocks": [
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
        "af": "0xEE54",
        "bc": "0x000044",
        "de": "0xD65800",
        "hl": "0xD657FF",
        "sp": "0xD1A87B",
        "flags": {
          "z": true,
          "c": false,
          "n": false
        },
        "D000AC": "0x01",
        "D007CA": "0x0585E9",
        "D008E0": "0xD1A863",
        "D02590": "0xD3FE81",
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
          }
        ],
        "recentBlocks": [
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
      "pre003cf3": {
        "block": 109,
        "pc": "0x003CF3",
        "af": "0x0842",
        "bc": "0x00A008",
        "de": "0x0080C0",
        "hl": "0x00FF00",
        "sp": "0xD1A84E",
        "flags": {
          "z": true,
          "c": false,
          "n": true
        },
        "D000AC": "0x00",
        "D007CA": "0x0585E9",
        "D008E0": "0xD1A863",
        "D02590": "0xD3FE81",
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
          }
        ],
        "recentBlocks": [
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
      "post001409": {
        "block": 50210,
        "pc": "0x001409",
        "af": "0x0044",
        "bc": "0x00A008",
        "de": "0xD65800",
        "hl": "0x00FF00",
        "sp": "0xD1A87E",
        "flags": {
          "z": true,
          "c": false,
          "n": false
        },
        "D000AC": "0x01",
        "D007CA": "0x0585E9",
        "D008E0": "0xD1A863",
        "D02590": "0xD3FE81",
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
          }
        ],
        "recentBlocks": [
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
          "0x001409"
        ]
      },
      "pre001424": {
        "block": 50211,
        "pc": "0x001424",
        "af": "0x00BB",
        "bc": "0x00A008",
        "de": "0xD65800",
        "hl": "0x00FF00",
        "sp": "0xD1A87E",
        "flags": {
          "z": false,
          "c": true,
          "n": true
        },
        "D000AC": "0x01",
        "D007CA": "0x0585E9",
        "D008E0": "0xD1A863",
        "D02590": "0xD3FE81",
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
          }
        ],
        "recentBlocks": [
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
          "0x001424"
        ]
      },
      "sig0008bb": {
        "block": 8,
        "pc": "0x0008BB",
        "af": "0xD042",
        "bc": "0x00A008",
        "de": "0x0080C0",
        "hl": "0xD1A8A1",
        "sp": "0xD1A84E",
        "flags": {
          "z": true,
          "c": false,
          "n": true
        },
        "D000AC": "0x00",
        "D007CA": "0x0585E9",
        "D008E0": "0xD1A863",
        "D02590": "0xD3FE81",
        "stackTop": [
          {
            "addr": "0xD1A84E",
            "value": "0x001717"
          },
          {
            "addr": "0xD1A851",
            "value": "0x000719"
          },
          {
            "addr": "0xD1A854",
            "value": "0xD1A8A1"
          }
        ],
        "recentBlocks": [
          "0x08C331",
          "0x05C634",
          "0x000038",
          "0x0006F3",
          "0x000704",
          "0x000710",
          "0x001713",
          "0x0008BB"
        ]
      },
      "pre001428": {
        "block": 50213,
        "pc": "0x001428",
        "af": "0x0042",
        "bc": "0x00A55A",
        "de": "0xD65800",
        "hl": "0x000000",
        "sp": "0xD1A87E",
        "flags": {
          "z": true,
          "c": false,
          "n": true
        },
        "D000AC": "0x01",
        "D007CA": "0x0585E9",
        "D008E0": "0xD1A863",
        "D02590": "0xD3FE81",
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
          }
        ],
        "recentBlocks": [
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
        "af": "0x0042",
        "bc": "0x00A55A",
        "de": "0xD65800",
        "hl": "0x000000",
        "sp": "0xD1A87E",
        "flags": {
          "z": true,
          "c": false,
          "n": true
        },
        "D000AC": "0x01",
        "D007CA": "0x0585E9",
        "D008E0": "0xD1A863",
        "D02590": "0xD3FE81",
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
          }
        ],
        "recentBlocks": [
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
    "path": "0x0013FC -> 0x001405 -> 0x003CBC -> 0x001409 -> 0x001424 -> 0x0008BB -> 0x001428 -> 0x00142C -> 0x000721",
    "counts": {
      "guard015930": 0,
      "pre001405": 1,
      "pre003cbc": 1,
      "post001409": 1,
      "alt00140d": 0,
      "alt001414": 0,
      "pre001424": 1,
      "sig0008bb": 109,
      "pre001428": 1,
      "branch0014c9": 0,
      "pre00142c": 1,
      "seed000721": 1,
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
    "branchIo": [
      {
        "type": "read",
        "block": 9509,
        "pc": "0x003CF3",
        "port": "0xA008",
        "value": "0x00",
        "a": "0x00",
        "f": "0x44"
      },
      {
        "type": "write",
        "block": 9705,
        "pc": "0x003CC2",
        "port": "0xA000",
        "value": "0x01",
        "a": "0x01",
        "f": "0x7D"
      },
      {
        "type": "write",
        "block": 9706,
        "pc": "0x003CD4",
        "port": "0xA00C",
        "value": "0x04",
        "a": "0x04",
        "f": "0x42"
      },
      {
        "type": "write",
        "block": 9707,
        "pc": "0x003CE0",
        "port": "0xA008",
        "value": "0xFF",
        "a": "0xA0",
        "f": "0x42"
      },
      {
        "type": "read",
        "block": 9709,
        "pc": "0x003CF3",
        "port": "0xA008",
        "value": "0x00",
        "a": "0x00",
        "f": "0x44"
      },
      {
        "type": "write",
        "block": 9905,
        "pc": "0x003CC2",
        "port": "0xA000",
        "value": "0x01",
        "a": "0x01",
        "f": "0x7D"
      },
      {
        "type": "write",
        "block": 9906,
        "pc": "0x003CD4",
        "port": "0xA00C",
        "value": "0x04",
        "a": "0x04",
        "f": "0x42"
      },
      {
        "type": "write",
        "block": 9907,
        "pc": "0x003CE0",
        "port": "0xA008",
        "value": "0xFF",
        "a": "0xA0",
        "f": "0x42"
      },
      {
        "type": "read",
        "block": 9909,
        "pc": "0x003CF3",
        "port": "0xA008",
        "value": "0x00",
        "a": "0x00",
        "f": "0x44"
      },
      {
        "type": "write",
        "block": 10298,
        "pc": "0x003CC2",
        "port": "0xA000",
        "value": "0x01",
        "a": "0x01",
        "f": "0x7D"
      },
      {
        "type": "write",
        "block": 10299,
        "pc": "0x003CD4",
        "port": "0xA00C",
        "value": "0x04",
        "a": "0x04",
        "f": "0x42"
      },
      {
        "type": "write",
        "block": 10300,
        "pc": "0x003CE0",
        "port": "0xA008",
        "value": "0xFF",
        "a": "0xA0",
        "f": "0x42"
      },
      {
        "type": "read",
        "block": 10302,
        "pc": "0x003CF3",
        "port": "0xA008",
        "value": "0x00",
        "a": "0x00",
        "f": "0x44"
      },
      {
        "type": "write",
        "block": 12624,
        "pc": "0x003CD4",
        "port": "0xA00C",
        "value": "0x04",
        "a": "0x04",
        "f": "0x42"
      },
      {
        "type": "write",
        "block": 12625,
        "pc": "0x003CE0",
        "port": "0xA008",
        "value": "0xFF",
        "a": "0xA0",
        "f": "0x42"
      },
      {
        "type": "read",
        "block": 12627,
        "pc": "0x003CF3",
        "port": "0xA008",
        "value": "0x00",
        "a": "0x00",
        "f": "0x44"
      }
    ],
    "branchSamples": {
      "pre0013fc": {
        "block": 12620,
        "pc": "0x0013FC",
        "af": "0x0480",
        "bc": "0x000044",
        "de": "0xD65800",
        "hl": "0xD657FF",
        "sp": "0xD1A87E",
        "flags": {
          "z": false,
          "c": false,
          "n": false
        },
        "D000AC": "0x00",
        "D007CA": "0x0585E9",
        "D008E0": "0xD1A863",
        "D02590": "0xD3FE81",
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
          }
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
          "0x0013FC"
        ]
      },
      "pre001405": {
        "block": 12621,
        "pc": "0x001405",
        "af": "0xEE54",
        "bc": "0x000044",
        "de": "0xD65800",
        "hl": "0xD657FF",
        "sp": "0xD1A87E",
        "flags": {
          "z": true,
          "c": false,
          "n": false
        },
        "D000AC": "0x00",
        "D007CA": "0x0585E9",
        "D008E0": "0xD1A863",
        "D02590": "0xD3FE81",
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
          }
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
          "0x001405"
        ]
      },
      "pre003cbc": {
        "block": 12622,
        "pc": "0x003CBC",
        "af": "0xEE54",
        "bc": "0x000044",
        "de": "0xD65800",
        "hl": "0xD657FF",
        "sp": "0xD1A87B",
        "flags": {
          "z": true,
          "c": false,
          "n": false
        },
        "D000AC": "0x00",
        "D007CA": "0x0585E9",
        "D008E0": "0xD1A863",
        "D02590": "0xD3FE81",
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
          }
        ],
        "recentBlocks": [
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
        "af": "0xEE54",
        "bc": "0x000044",
        "de": "0xD65800",
        "hl": "0xD657FF",
        "sp": "0xD1A87B",
        "flags": {
          "z": true,
          "c": false,
          "n": false
        },
        "D000AC": "0x01",
        "D007CA": "0x0585E9",
        "D008E0": "0xD1A863",
        "D02590": "0xD3FE81",
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
          }
        ],
        "recentBlocks": [
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
      "pre003cf3": {
        "block": 109,
        "pc": "0x003CF3",
        "af": "0x0842",
        "bc": "0x00A008",
        "de": "0x0080C0",
        "hl": "0x00FF00",
        "sp": "0xD1A84E",
        "flags": {
          "z": true,
          "c": false,
          "n": true
        },
        "D000AC": "0x00",
        "D007CA": "0x0585E9",
        "D008E0": "0xD1A863",
        "D02590": "0xD3FE81",
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
          }
        ],
        "recentBlocks": [
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
      "post001409": {
        "block": 12628,
        "pc": "0x001409",
        "af": "0x0044",
        "bc": "0x00A008",
        "de": "0xD65800",
        "hl": "0x00FF00",
        "sp": "0xD1A87E",
        "flags": {
          "z": true,
          "c": false,
          "n": false
        },
        "D000AC": "0x01",
        "D007CA": "0x0585E9",
        "D008E0": "0xD1A863",
        "D02590": "0xD3FE81",
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
          }
        ],
        "recentBlocks": [
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
          "0x001409"
        ]
      },
      "pre001424": {
        "block": 12629,
        "pc": "0x001424",
        "af": "0x00BB",
        "bc": "0x00A008",
        "de": "0xD65800",
        "hl": "0x00FF00",
        "sp": "0xD1A87E",
        "flags": {
          "z": false,
          "c": true,
          "n": true
        },
        "D000AC": "0x01",
        "D007CA": "0x0585E9",
        "D008E0": "0xD1A863",
        "D02590": "0xD3FE81",
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
          }
        ],
        "recentBlocks": [
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
          "0x001424"
        ]
      },
      "sig0008bb": {
        "block": 8,
        "pc": "0x0008BB",
        "af": "0xD042",
        "bc": "0x00A008",
        "de": "0x0080C0",
        "hl": "0xD1A8A1",
        "sp": "0xD1A84E",
        "flags": {
          "z": true,
          "c": false,
          "n": true
        },
        "D000AC": "0x00",
        "D007CA": "0x0585E9",
        "D008E0": "0xD1A863",
        "D02590": "0xD3FE81",
        "stackTop": [
          {
            "addr": "0xD1A84E",
            "value": "0x001717"
          },
          {
            "addr": "0xD1A851",
            "value": "0x000719"
          },
          {
            "addr": "0xD1A854",
            "value": "0xD1A8A1"
          }
        ],
        "recentBlocks": [
          "0x08C331",
          "0x05C634",
          "0x000038",
          "0x0006F3",
          "0x000704",
          "0x000710",
          "0x001713",
          "0x0008BB"
        ]
      },
      "pre001428": {
        "block": 12631,
        "pc": "0x001428",
        "af": "0x0042",
        "bc": "0x00A55A",
        "de": "0xD65800",
        "hl": "0x000000",
        "sp": "0xD1A87E",
        "flags": {
          "z": true,
          "c": false,
          "n": true
        },
        "D000AC": "0x01",
        "D007CA": "0x0585E9",
        "D008E0": "0xD1A863",
        "D02590": "0xD3FE81",
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
          }
        ],
        "recentBlocks": [
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
        "af": "0x0042",
        "bc": "0x00A55A",
        "de": "0xD65800",
        "hl": "0x000000",
        "sp": "0xD1A87E",
        "flags": {
          "z": true,
          "c": false,
          "n": true
        },
        "D000AC": "0x01",
        "D007CA": "0x0585E9",
        "D008E0": "0xD1A863",
        "D02590": "0xD3FE81",
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
          }
        ],
        "recentBlocks": [
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

The low-ROM path is now explained through the branch inputs visible before the one-shot seed. After the `0x0013FC` block, A/F is `0xEE54`, which means the port-`0x03` value has bit 4 clear and the `CALL NZ,0x015930` path is skipped. The `0x003CBC` helper sets `IY+0x2C` bit 0 and runs its keyboard/status port sequence. Back in the caller, the observed path reaches `0x001424`, calls the ROM signature check at `0x0008BB`, and that check returns Z with `HL=0x000000`; therefore `0x001428 JP NZ,0x0014C9` falls through to `0x00142C JP 0x000721`.

This does not reopen the token/tail route; it explains why the active low-ROM scheduler path deterministically enters the renderer seed. The next useful step is to trace the post-seed continuation return mechanics (`0x000725 -> 0x0158A6 -> 0x00072D -> 0x0138F1 -> 0x002197 -> 0x0138F9 -> 0x006447/0x006475`) or test whether any upstream state can avoid this low-ROM scheduler path before it reaches `0x0013FC`.
# Phase 650: Upstream Renderer Scheduler Trace

Probe: `probe-phase650-renderer-scheduler.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase650-renderer-scheduler.mjs`

## Summary

- **** Clean repaint still halts before both traced key bursts.
- **** Phase645 preservation hooks still restore `D007CA`, `D008E0`, and VAT/heap state after the destructive cleanup blocks.
- **** Both traced keys hit the same one-shot scheduler seed: `0x000721 -> 0x013D00 -> 0x013D11`, then the row renderer at `0x0059C6 -> 0x005A75 -> 0x005A82 -> 0x00596E` repeats 87 times.
- 4-star Both traced keys take the same upstream display/status chain: repeated `0x005AB6/0x005AE8/0x005B16/0x005B4B` loop, then `0x005B92 -> 0x005A19 -> 0x0059DA -> 0x0059E6 -> 0x0017FC -> 0x0064D0`.
- **** The low-transfer setup is also deterministic: both keys hit `0x006475`, `0x00647D`, and `0x0064C7` exactly once before the final `0x0064D0` frame-builder entry.
- **** Both keys select the low route through `0x0017FC -> 0x0064D0 -> 0x006CC6` while preserved `D007CA`/`D008E0`/VAT are live.
- 3-star Probe intentionally stops at first `0x006CC6`; the later hot `0x006Dxx`/`0x000A92` loop was already proven by phase648 and is not rerun here.
- **** Token/tail hooks remain bypassed after preservation: `0x08F5E1`, `0x090992`, and `0x08F54B` all stay at zero hits.

## Scenario Results

| Key | Repaint | Key trace | Restores | 0x000721 | 0x013D00 | 0x013D11 | 0x0059C6 | 0x005A75 | 0x005A82 | 0x00596E | 0x005AB6 | 0x005AE8 | 0x005B16 | 0x005B4B | 0x005B92 | 0x005A19 | 0x0059DA | 0x0059E6 | 0x006475 | 0x00647D | 0x0064C7 | 0x0017FC | 0x0064D0 | 0x006CC6 | Token/tail | Final D005A0 | Final D007CA | Final D008E0 | Final VAT | D00121 | D00124 |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|---|---|---|---|
| EOL/CLEAR | halt 0x0019B5 | after-low-frame-selection 0x0064D0 | 2 | 1 | 1 | 1 | 87 | 87 | 87 | 87 | 1305 | 1392 | 1392 | 1392 | 87 | 87 | 87 | 87 | 1 | 1 | 1 | 2 | 1 | 1 | 0 | 0x85 | 0x0585E9 | 0xD1A863 | 0xD3FE81 | 0x000000 | 0x0A |
| Digit2 | halt 0x0019B5 | after-low-frame-selection 0x0064D0 | 1 | 1 | 1 | 1 | 87 | 87 | 87 | 87 | 1305 | 1392 | 1392 | 1392 | 87 | 87 | 87 | 87 | 1 | 1 | 1 | 2 | 1 | 1 | 0 | 0x85 | 0x0585E9 | 0xD1A863 | 0xD3FE81 | 0x000000 | 0x0A |

## First Low-Frame Inputs

```json
{
  "eolClearFirst006cc6": {
    "name": "lowFrame006cc6",
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
      "D00121": "0x000000",
      "D00124": "0x0A",
      "D00587": "0x00",
      "D00596": "0x13",
      "D0059C": "0x0000DA",
      "D005A0": "0x85",
      "D0058C": "0x00",
      "D0058D": "0x00",
      "D0058E": "0x00",
      "D00080": "0x00",
      "D00081": "0x00",
      "D0009F": "0x00",
      "D000A0": "0x00",
      "D000A3": "0x00",
      "D000C4": "0x00",
      "D007CA": "0x0585E9",
      "D008E0": "0xD1A863",
      "D0231A": "0x000000",
      "D0243A": "0x000000",
      "D0243D": "0x000000",
      "D02590": "0xD3FE81",
      "D02A28": "0x00",
      "D001B8": "0x00",
      "D001D3": "0x00",
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
      "D02A73": "0x00",
      "D02A75": "0x05",
      "ixBytes": [
        "0x78",
        "0xA8",
        "0xD1",
        "0x68",
        "0x39",
        "0x01",
        "0x00",
        "0x00"
      ],
      "hlWord": "0xEDF3"
    },
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
      }
    ],
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
      "0x005B92",
      "0x005A19",
      "0x0059DA",
      "0x0059E6",
      "0x0017FC",
      "0x0064D0",
      "0x006CC6"
    ]
  },
  "digit2First006cc6": {
    "name": "lowFrame006cc6",
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
      "D00121": "0x000000",
      "D00124": "0x0A",
      "D00587": "0x00",
      "D00596": "0x13",
      "D0059C": "0x0000DA",
      "D005A0": "0x85",
      "D0058C": "0x00",
      "D0058D": "0x00",
      "D0058E": "0x00",
      "D00080": "0x00",
      "D00081": "0x00",
      "D0009F": "0x00",
      "D000A0": "0x00",
      "D000A3": "0x00",
      "D000C4": "0x00",
      "D007CA": "0x0585E9",
      "D008E0": "0xD1A863",
      "D0231A": "0x000000",
      "D0243A": "0x000000",
      "D0243D": "0x000000",
      "D02590": "0xD3FE81",
      "D02A28": "0x00",
      "D001B8": "0x00",
      "D001D3": "0x00",
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
      "D02A73": "0x00",
      "D02A75": "0x05",
      "ixBytes": [
        "0x78",
        "0xA8",
        "0xD1",
        "0x68",
        "0x39",
        "0x01",
        "0x00",
        "0x00"
      ],
      "hlWord": "0xEDF3"
    },
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
      }
    ],
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
      "0x005B92",
      "0x005A19",
      "0x0059DA",
      "0x0059E6",
      "0x0017FC",
      "0x0064D0",
      "0x006CC6"
    ]
  }
}
```

## Tail-Exit Windows

These are the final loop-target windows captured at the `0x005B92` exit.

```json
{
  "EOL/CLEAR": [
    {
      "block": 57613,
      "pc": "0x005B92",
      "exitState": {
        "block": 57613,
        "pc": "0x005B92",
        "regs": {
          "af": "0xFF42",
          "bc": "0xFF0005",
          "de": "0x0000FF",
          "hl": "0xD005A0",
          "ix": "0xD005C1",
          "sp": "0xD1A84E",
          "flags": {
            "z": true,
            "c": false,
            "n": true
          }
        },
        "ram": {
          "D00596": "0x09",
          "D005A0": "0xD5",
          "D02A73": "0x38",
          "D02A75": "0x05",
          "low0059c": "0x095CC3",
          "ixBytes": [
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
        "recentBlocks": [
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
      "precedingLoop": [
        {
          "name": "displayLoop005ae8",
          "block": 57590,
          "pc": "0x005AE8",
          "regs": {
            "af": "0x0054",
            "bc": "0xFF0605",
            "de": "0xD40000",
            "hl": "0xD6065C",
            "ix": "0xD005B6",
            "sp": "0xD1A84E",
            "flags": {
              "z": true,
              "c": false,
              "n": false
            }
          },
          "ram": {
            "D00596": "0x09",
            "D005A0": "0xCF",
            "D02A73": "0x00",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
              "0x00",
              "0x00",
              "0x00",
              "0x38",
              "0x80",
              "0x38",
              "0x80",
              "0x38"
            ]
          },
          "recentBlocks": [
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8"
          ]
        },
        {
          "name": "displayLoop005b16",
          "block": 57591,
          "pc": "0x005B16",
          "regs": {
            "af": "0x0054",
            "bc": "0xFF0500",
            "de": "0x0000FF",
            "hl": "0xD6065C",
            "ix": "0xD005B6",
            "sp": "0xD1A84B",
            "flags": {
              "z": true,
              "c": false,
              "n": false
            }
          },
          "ram": {
            "D00596": "0x09",
            "D005A0": "0xCF",
            "D02A73": "0x00",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
              "0x00",
              "0x00",
              "0x00",
              "0x38",
              "0x80",
              "0x38",
              "0x80",
              "0x38"
            ]
          },
          "recentBlocks": [
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16"
          ]
        },
        {
          "name": "displayLoop005b4b",
          "block": 57592,
          "pc": "0x005B4B",
          "regs": {
            "af": "0x007C",
            "bc": "0xFF0500",
            "de": "0x0000FF",
            "hl": "0xD60666",
            "ix": "0xD005B7",
            "sp": "0xD1A84B",
            "flags": {
              "z": true,
              "c": false,
              "n": false
            }
          },
          "ram": {
            "D00596": "0x09",
            "D005A0": "0xCF",
            "D02A73": "0x00",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
              "0x00",
              "0x00",
              "0x38",
              "0x80",
              "0x38",
              "0x80",
              "0x38",
              "0x80"
            ]
          },
          "recentBlocks": [
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B"
          ]
        },
        {
          "name": "displayLoop005ab6",
          "block": 57593,
          "pc": "0x005AB6",
          "regs": {
            "af": "0xFF02",
            "bc": "0xFF0505",
            "de": "0x0000FF",
            "hl": "0xD005A0",
            "ix": "0xD005B7",
            "sp": "0xD1A84E",
            "flags": {
              "z": false,
              "c": false,
              "n": true
            }
          },
          "ram": {
            "D00596": "0x09",
            "D005A0": "0xD0",
            "D02A73": "0x00",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
              "0x00",
              "0x00",
              "0x38",
              "0x80",
              "0x38",
              "0x80",
              "0x38",
              "0x80"
            ]
          },
          "recentBlocks": [
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6"
          ]
        },
        {
          "name": "displayLoop005ae8",
          "block": 57594,
          "pc": "0x005AE8",
          "regs": {
            "af": "0x0054",
            "bc": "0xFF0505",
            "de": "0xD40000",
            "hl": "0xD608DC",
            "ix": "0xD005B8",
            "sp": "0xD1A84E",
            "flags": {
              "z": true,
              "c": false,
              "n": false
            }
          },
          "ram": {
            "D00596": "0x09",
            "D005A0": "0xD0",
            "D02A73": "0x00",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
              "0x00",
              "0x38",
              "0x80",
              "0x38",
              "0x80",
              "0x38",
              "0x80",
              "0x38"
            ]
          },
          "recentBlocks": [
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8"
          ]
        },
        {
          "name": "displayLoop005b16",
          "block": 57595,
          "pc": "0x005B16",
          "regs": {
            "af": "0x0054",
            "bc": "0xFF0500",
            "de": "0x0000FF",
            "hl": "0xD608DC",
            "ix": "0xD005B8",
            "sp": "0xD1A84B",
            "flags": {
              "z": true,
              "c": false,
              "n": false
            }
          },
          "ram": {
            "D00596": "0x09",
            "D005A0": "0xD0",
            "D02A73": "0x00",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
              "0x00",
              "0x38",
              "0x80",
              "0x38",
              "0x80",
              "0x38",
              "0x80",
              "0x38"
            ]
          },
          "recentBlocks": [
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16"
          ]
        },
        {
          "name": "displayLoop005b4b",
          "block": 57596,
          "pc": "0x005B4B",
          "regs": {
            "af": "0x007C",
            "bc": "0xFF0500",
            "de": "0x0000FF",
            "hl": "0xD608E6",
            "ix": "0xD005B9",
            "sp": "0xD1A84B",
            "flags": {
              "z": true,
              "c": false,
              "n": false
            }
          },
          "ram": {
            "D00596": "0x09",
            "D005A0": "0xD0",
            "D02A73": "0x00",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
              "0x38",
              "0x80",
              "0x38",
              "0x80",
              "0x38",
              "0x80",
              "0x38",
              "0x80"
            ]
          },
          "recentBlocks": [
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B"
          ]
        },
        {
          "name": "displayLoop005ab6",
          "block": 57597,
          "pc": "0x005AB6",
          "regs": {
            "af": "0xFF02",
            "bc": "0xFF0405",
            "de": "0x0000FF",
            "hl": "0xD005A0",
            "ix": "0xD005B9",
            "sp": "0xD1A84E",
            "flags": {
              "z": false,
              "c": false,
              "n": true
            }
          },
          "ram": {
            "D00596": "0x09",
            "D005A0": "0xD1",
            "D02A73": "0x00",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
              "0x38",
              "0x80",
              "0x38",
              "0x80",
              "0x38",
              "0x80",
              "0x38",
              "0x80"
            ]
          },
          "recentBlocks": [
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6"
          ]
        },
        {
          "name": "displayLoop005ae8",
          "block": 57598,
          "pc": "0x005AE8",
          "regs": {
            "af": "0x3854",
            "bc": "0xFF0405",
            "de": "0xD40000",
            "hl": "0xD60B5C",
            "ix": "0xD005BA",
            "sp": "0xD1A84E",
            "flags": {
              "z": true,
              "c": false,
              "n": false
            }
          },
          "ram": {
            "D00596": "0x09",
            "D005A0": "0xD1",
            "D02A73": "0x00",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
              "0x80",
              "0x38",
              "0x80",
              "0x38",
              "0x80",
              "0x38",
              "0x80",
              "0x00"
            ]
          },
          "recentBlocks": [
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8"
          ]
        },
        {
          "name": "displayLoop005b16",
          "block": 57599,
          "pc": "0x005B16",
          "regs": {
            "af": "0x3854",
            "bc": "0xFF0538",
            "de": "0x0000FF",
            "hl": "0xD60B5C",
            "ix": "0xD005BA",
            "sp": "0xD1A84B",
            "flags": {
              "z": true,
              "c": false,
              "n": false
            }
          },
          "ram": {
            "D00596": "0x09",
            "D005A0": "0xD1",
            "D02A73": "0x38",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
              "0x80",
              "0x38",
              "0x80",
              "0x38",
              "0x80",
              "0x38",
              "0x80",
              "0x00"
            ]
          },
          "recentBlocks": [
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16"
          ]
        },
        {
          "name": "displayLoop005b4b",
          "block": 57600,
          "pc": "0x005B4B",
          "regs": {
            "af": "0x8055",
            "bc": "0xFF0500",
            "de": "0x0000FF",
            "hl": "0xD60B66",
            "ix": "0xD005BB",
            "sp": "0xD1A84B",
            "flags": {
              "z": true,
              "c": true,
              "n": false
            }
          },
          "ram": {
            "D00596": "0x09",
            "D005A0": "0xD1",
            "D02A73": "0x38",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
              "0x38",
              "0x80",
              "0x38",
              "0x80",
              "0x38",
              "0x80",
              "0x00",
              "0x00"
            ]
          },
          "recentBlocks": [
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B"
          ]
        },
        {
          "name": "displayLoop005ab6",
          "block": 57601,
          "pc": "0x005AB6",
          "regs": {
            "af": "0xFF02",
            "bc": "0xFF0305",
            "de": "0x0000FF",
            "hl": "0xD005A0",
            "ix": "0xD005BB",
            "sp": "0xD1A84E",
            "flags": {
              "z": false,
              "c": false,
              "n": true
            }
          },
          "ram": {
            "D00596": "0x09",
            "D005A0": "0xD2",
            "D02A73": "0x38",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
              "0x38",
              "0x80",
              "0x38",
              "0x80",
              "0x38",
              "0x80",
              "0x00",
              "0x00"
            ]
          },
          "recentBlocks": [
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6"
          ]
        },
        {
          "name": "displayLoop005ae8",
          "block": 57602,
          "pc": "0x005AE8",
          "regs": {
            "af": "0x3854",
            "bc": "0xFF0305",
            "de": "0xD40000",
            "hl": "0xD60DDC",
            "ix": "0xD005BC",
            "sp": "0xD1A84E",
            "flags": {
              "z": true,
              "c": false,
              "n": false
            }
          },
          "ram": {
            "D00596": "0x09",
            "D005A0": "0xD2",
            "D02A73": "0x38",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
              "0x80",
              "0x38",
              "0x80",
              "0x38",
              "0x80",
              "0x00",
              "0x00",
              "0x00"
            ]
          },
          "recentBlocks": [
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8"
          ]
        },
        {
          "name": "displayLoop005b16",
          "block": 57603,
          "pc": "0x005B16",
          "regs": {
            "af": "0x3854",
            "bc": "0xFF0538",
            "de": "0x0000FF",
            "hl": "0xD60DDC",
            "ix": "0xD005BC",
            "sp": "0xD1A84B",
            "flags": {
              "z": true,
              "c": false,
              "n": false
            }
          },
          "ram": {
            "D00596": "0x09",
            "D005A0": "0xD2",
            "D02A73": "0x38",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
              "0x80",
              "0x38",
              "0x80",
              "0x38",
              "0x80",
              "0x00",
              "0x00",
              "0x00"
            ]
          },
          "recentBlocks": [
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16"
          ]
        },
        {
          "name": "displayLoop005b4b",
          "block": 57604,
          "pc": "0x005B4B",
          "regs": {
            "af": "0x8055",
            "bc": "0xFF0500",
            "de": "0x0000FF",
            "hl": "0xD60DE6",
            "ix": "0xD005BD",
            "sp": "0xD1A84B",
            "flags": {
              "z": true,
              "c": true,
              "n": false
            }
          },
          "ram": {
            "D00596": "0x09",
            "D005A0": "0xD2",
            "D02A73": "0x38",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
              "0x38",
              "0x80",
              "0x38",
              "0x80",
              "0x00",
              "0x00",
              "0x00",
              "0x00"
            ]
          },
          "recentBlocks": [
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B"
          ]
        },
        {
          "name": "displayLoop005ab6",
          "block": 57605,
          "pc": "0x005AB6",
          "regs": {
            "af": "0xFF02",
            "bc": "0xFF0205",
            "de": "0x0000FF",
            "hl": "0xD005A0",
            "ix": "0xD005BD",
            "sp": "0xD1A84E",
            "flags": {
              "z": false,
              "c": false,
              "n": true
            }
          },
          "ram": {
            "D00596": "0x09",
            "D005A0": "0xD3",
            "D02A73": "0x38",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
              "0x38",
              "0x80",
              "0x38",
              "0x80",
              "0x00",
              "0x00",
              "0x00",
              "0x00"
            ]
          },
          "recentBlocks": [
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6"
          ]
        },
        {
          "name": "displayLoop005ae8",
          "block": 57606,
          "pc": "0x005AE8",
          "regs": {
            "af": "0x3854",
            "bc": "0xFF0205",
            "de": "0xD40000",
            "hl": "0xD6105C",
            "ix": "0xD005BE",
            "sp": "0xD1A84E",
            "flags": {
              "z": true,
              "c": false,
              "n": false
            }
          },
          "ram": {
            "D00596": "0x09",
            "D005A0": "0xD3",
            "D02A73": "0x38",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
              "0x80",
              "0x38",
              "0x80",
              "0x00",
              "0x00",
              "0x00",
              "0x00",
              "0x00"
            ]
          },
          "recentBlocks": [
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8"
          ]
        },
        {
          "name": "displayLoop005b16",
          "block": 57607,
          "pc": "0x005B16",
          "regs": {
            "af": "0x3854",
            "bc": "0xFF0538",
            "de": "0x0000FF",
            "hl": "0xD6105C",
            "ix": "0xD005BE",
            "sp": "0xD1A84B",
            "flags": {
              "z": true,
              "c": false,
              "n": false
            }
          },
          "ram": {
            "D00596": "0x09",
            "D005A0": "0xD3",
            "D02A73": "0x38",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
              "0x80",
              "0x38",
              "0x80",
              "0x00",
              "0x00",
              "0x00",
              "0x00",
              "0x00"
            ]
          },
          "recentBlocks": [
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16"
          ]
        },
        {
          "name": "displayLoop005b4b",
          "block": 57608,
          "pc": "0x005B4B",
          "regs": {
            "af": "0x8055",
            "bc": "0xFF0500",
            "de": "0x0000FF",
            "hl": "0xD61066",
            "ix": "0xD005BF",
            "sp": "0xD1A84B",
            "flags": {
              "z": true,
              "c": true,
              "n": false
            }
          },
          "ram": {
            "D00596": "0x09",
            "D005A0": "0xD3",
            "D02A73": "0x38",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
              "0x38",
              "0x80",
              "0x00",
              "0x00",
              "0x00",
              "0x00",
              "0x00",
              "0x00"
            ]
          },
          "recentBlocks": [
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B"
          ]
        },
        {
          "name": "displayLoop005ab6",
          "block": 57609,
          "pc": "0x005AB6",
          "regs": {
            "af": "0xFF02",
            "bc": "0xFF0105",
            "de": "0x0000FF",
            "hl": "0xD005A0",
            "ix": "0xD005BF",
            "sp": "0xD1A84E",
            "flags": {
              "z": false,
              "c": false,
              "n": true
            }
          },
          "ram": {
            "D00596": "0x09",
            "D005A0": "0xD4",
            "D02A73": "0x38",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
              "0x38",
              "0x80",
              "0x00",
              "0x00",
              "0x00",
              "0x00",
              "0x00",
              "0x00"
            ]
          },
          "recentBlocks": [
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6"
          ]
        },
        {
          "name": "displayLoop005ae8",
          "block": 57610,
          "pc": "0x005AE8",
          "regs": {
            "af": "0x3854",
            "bc": "0xFF0105",
            "de": "0xD40000",
            "hl": "0xD612DC",
            "ix": "0xD005C0",
            "sp": "0xD1A84E",
            "flags": {
              "z": true,
              "c": false,
              "n": false
            }
          },
          "ram": {
            "D00596": "0x09",
            "D005A0": "0xD4",
            "D02A73": "0x38",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
              "0x80",
              "0x00",
              "0x00",
              "0x00",
              "0x00",
              "0x00",
              "0x00",
              "0x00"
            ]
          },
          "recentBlocks": [
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8"
          ]
        },
        {
          "name": "displayLoop005b16",
          "block": 57611,
          "pc": "0x005B16",
          "regs": {
            "af": "0x3854",
            "bc": "0xFF0538",
            "de": "0x0000FF",
            "hl": "0xD612DC",
            "ix": "0xD005C0",
            "sp": "0xD1A84B",
            "flags": {
              "z": true,
              "c": false,
              "n": false
            }
          },
          "ram": {
            "D00596": "0x09",
            "D005A0": "0xD4",
            "D02A73": "0x38",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
              "0x80",
              "0x00",
              "0x00",
              "0x00",
              "0x00",
              "0x00",
              "0x00",
              "0x00"
            ]
          },
          "recentBlocks": [
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16"
          ]
        },
        {
          "name": "displayLoop005b4b",
          "block": 57612,
          "pc": "0x005B4B",
          "regs": {
            "af": "0x8055",
            "bc": "0xFF0500",
            "de": "0x0000FF",
            "hl": "0xD612E6",
            "ix": "0xD005C1",
            "sp": "0xD1A84B",
            "flags": {
              "z": true,
              "c": true,
              "n": false
            }
          },
          "ram": {
            "D00596": "0x09",
            "D005A0": "0xD4",
            "D02A73": "0x38",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
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
          "recentBlocks": [
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B"
          ]
        },
        {
          "name": "displayCaller005b92",
          "block": 57613,
          "pc": "0x005B92",
          "regs": {
            "af": "0xFF42",
            "bc": "0xFF0005",
            "de": "0x0000FF",
            "hl": "0xD005A0",
            "ix": "0xD005C1",
            "sp": "0xD1A84E",
            "flags": {
              "z": true,
              "c": false,
              "n": true
            }
          },
          "ram": {
            "D00596": "0x09",
            "D005A0": "0xD5",
            "D02A73": "0x38",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
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
          "recentBlocks": [
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
      ]
    },
    {
      "block": 57729,
      "pc": "0x005B92",
      "exitState": {
        "block": 57729,
        "pc": "0x005B92",
        "regs": {
          "af": "0xFF42",
          "bc": "0xFF0005",
          "de": "0x0000FF",
          "hl": "0xD005A0",
          "ix": "0xD005C1",
          "sp": "0xD1A819",
          "flags": {
            "z": true,
            "c": false,
            "n": true
          }
        },
        "ram": {
          "D00596": "0x12",
          "D005A0": "0x85",
          "D02A73": "0x00",
          "D02A75": "0x05",
          "low0059c": "0x095CC3",
          "ixBytes": [
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
        "recentBlocks": [
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
      "precedingLoop": [
        {
          "name": "displayLoop005ae8",
          "block": 57706,
          "pc": "0x005AE8",
          "regs": {
            "af": "0x1854",
            "bc": "0xFF0605",
            "de": "0xD40000",
            "hl": "0xD53F34",
            "ix": "0xD005B6",
            "sp": "0xD1A819",
            "flags": {
              "z": true,
              "c": false,
              "n": false
            }
          },
          "ram": {
            "D00596": "0x12",
            "D005A0": "0x7F",
            "D02A73": "0x08",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
              "0x80",
              "0x38",
              "0x00",
              "0x70",
              "0x00",
              "0xE0",
              "0x00",
              "0xC0"
            ]
          },
          "recentBlocks": [
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8"
          ]
        },
        {
          "name": "displayLoop005b16",
          "block": 57707,
          "pc": "0x005B16",
          "regs": {
            "af": "0x1854",
            "bc": "0xFF0518",
            "de": "0x0000FF",
            "hl": "0xD53F34",
            "ix": "0xD005B6",
            "sp": "0xD1A816",
            "flags": {
              "z": true,
              "c": false,
              "n": false
            }
          },
          "ram": {
            "D00596": "0x12",
            "D005A0": "0x7F",
            "D02A73": "0x18",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
              "0x80",
              "0x38",
              "0x00",
              "0x70",
              "0x00",
              "0xE0",
              "0x00",
              "0xC0"
            ]
          },
          "recentBlocks": [
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16"
          ]
        },
        {
          "name": "displayLoop005b4b",
          "block": 57708,
          "pc": "0x005B4B",
          "regs": {
            "af": "0x8055",
            "bc": "0xFF0500",
            "de": "0x0000FF",
            "hl": "0xD53F3E",
            "ix": "0xD005B7",
            "sp": "0xD1A816",
            "flags": {
              "z": true,
              "c": true,
              "n": false
            }
          },
          "ram": {
            "D00596": "0x12",
            "D005A0": "0x7F",
            "D02A73": "0x18",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
              "0x38",
              "0x00",
              "0x70",
              "0x00",
              "0xE0",
              "0x00",
              "0xC0",
              "0x00"
            ]
          },
          "recentBlocks": [
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B"
          ]
        },
        {
          "name": "displayLoop005ab6",
          "block": 57709,
          "pc": "0x005AB6",
          "regs": {
            "af": "0xFF02",
            "bc": "0xFF0505",
            "de": "0x0000FF",
            "hl": "0xD005A0",
            "ix": "0xD005B7",
            "sp": "0xD1A819",
            "flags": {
              "z": false,
              "c": false,
              "n": true
            }
          },
          "ram": {
            "D00596": "0x12",
            "D005A0": "0x80",
            "D02A73": "0x18",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
              "0x38",
              "0x00",
              "0x70",
              "0x00",
              "0xE0",
              "0x00",
              "0xC0",
              "0x00"
            ]
          },
          "recentBlocks": [
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6"
          ]
        },
        {
          "name": "displayLoop005ae8",
          "block": 57710,
          "pc": "0x005AE8",
          "regs": {
            "af": "0x3854",
            "bc": "0xFF0505",
            "de": "0xD40000",
            "hl": "0xD541B4",
            "ix": "0xD005B8",
            "sp": "0xD1A819",
            "flags": {
              "z": true,
              "c": false,
              "n": false
            }
          },
          "ram": {
            "D00596": "0x12",
            "D005A0": "0x80",
            "D02A73": "0x18",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
              "0x00",
              "0x70",
              "0x00",
              "0xE0",
              "0x00",
              "0xC0",
              "0x00",
              "0x00"
            ]
          },
          "recentBlocks": [
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8"
          ]
        },
        {
          "name": "displayLoop005b16",
          "block": 57711,
          "pc": "0x005B16",
          "regs": {
            "af": "0x3854",
            "bc": "0xFF0538",
            "de": "0x0000FF",
            "hl": "0xD541B4",
            "ix": "0xD005B8",
            "sp": "0xD1A816",
            "flags": {
              "z": true,
              "c": false,
              "n": false
            }
          },
          "ram": {
            "D00596": "0x12",
            "D005A0": "0x80",
            "D02A73": "0x38",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
              "0x00",
              "0x70",
              "0x00",
              "0xE0",
              "0x00",
              "0xC0",
              "0x00",
              "0x00"
            ]
          },
          "recentBlocks": [
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16"
          ]
        },
        {
          "name": "displayLoop005b4b",
          "block": 57712,
          "pc": "0x005B4B",
          "regs": {
            "af": "0x0055",
            "bc": "0xFF0500",
            "de": "0x0000FF",
            "hl": "0xD541BE",
            "ix": "0xD005B9",
            "sp": "0xD1A816",
            "flags": {
              "z": true,
              "c": true,
              "n": false
            }
          },
          "ram": {
            "D00596": "0x12",
            "D005A0": "0x80",
            "D02A73": "0x38",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
              "0x70",
              "0x00",
              "0xE0",
              "0x00",
              "0xC0",
              "0x00",
              "0x00",
              "0x00"
            ]
          },
          "recentBlocks": [
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B"
          ]
        },
        {
          "name": "displayLoop005ab6",
          "block": 57713,
          "pc": "0x005AB6",
          "regs": {
            "af": "0xFF02",
            "bc": "0xFF0405",
            "de": "0x0000FF",
            "hl": "0xD005A0",
            "ix": "0xD005B9",
            "sp": "0xD1A819",
            "flags": {
              "z": false,
              "c": false,
              "n": true
            }
          },
          "ram": {
            "D00596": "0x12",
            "D005A0": "0x81",
            "D02A73": "0x38",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
              "0x70",
              "0x00",
              "0xE0",
              "0x00",
              "0xC0",
              "0x00",
              "0x00",
              "0x00"
            ]
          },
          "recentBlocks": [
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6"
          ]
        },
        {
          "name": "displayLoop005ae8",
          "block": 57714,
          "pc": "0x005AE8",
          "regs": {
            "af": "0x7054",
            "bc": "0xFF0405",
            "de": "0xD40000",
            "hl": "0xD54434",
            "ix": "0xD005BA",
            "sp": "0xD1A819",
            "flags": {
              "z": true,
              "c": false,
              "n": false
            }
          },
          "ram": {
            "D00596": "0x12",
            "D005A0": "0x81",
            "D02A73": "0x38",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
              "0x00",
              "0xE0",
              "0x00",
              "0xC0",
              "0x00",
              "0x00",
              "0x00",
              "0x00"
            ]
          },
          "recentBlocks": [
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8"
          ]
        },
        {
          "name": "displayLoop005b16",
          "block": 57715,
          "pc": "0x005B16",
          "regs": {
            "af": "0x7054",
            "bc": "0xFF0570",
            "de": "0x0000FF",
            "hl": "0xD54434",
            "ix": "0xD005BA",
            "sp": "0xD1A816",
            "flags": {
              "z": true,
              "c": false,
              "n": false
            }
          },
          "ram": {
            "D00596": "0x12",
            "D005A0": "0x81",
            "D02A73": "0x70",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
              "0x00",
              "0xE0",
              "0x00",
              "0xC0",
              "0x00",
              "0x00",
              "0x00",
              "0x00"
            ]
          },
          "recentBlocks": [
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16"
          ]
        },
        {
          "name": "displayLoop005b4b",
          "block": 57716,
          "pc": "0x005B4B",
          "regs": {
            "af": "0x007C",
            "bc": "0xFF0500",
            "de": "0x0000FF",
            "hl": "0xD5443E",
            "ix": "0xD005BB",
            "sp": "0xD1A816",
            "flags": {
              "z": true,
              "c": false,
              "n": false
            }
          },
          "ram": {
            "D00596": "0x12",
            "D005A0": "0x81",
            "D02A73": "0x70",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
              "0xE0",
              "0x00",
              "0xC0",
              "0x00",
              "0x00",
              "0x00",
              "0x00",
              "0x00"
            ]
          },
          "recentBlocks": [
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B"
          ]
        },
        {
          "name": "displayLoop005ab6",
          "block": 57717,
          "pc": "0x005AB6",
          "regs": {
            "af": "0xFF02",
            "bc": "0xFF0305",
            "de": "0x0000FF",
            "hl": "0xD005A0",
            "ix": "0xD005BB",
            "sp": "0xD1A819",
            "flags": {
              "z": false,
              "c": false,
              "n": true
            }
          },
          "ram": {
            "D00596": "0x12",
            "D005A0": "0x82",
            "D02A73": "0x70",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
              "0xE0",
              "0x00",
              "0xC0",
              "0x00",
              "0x00",
              "0x00",
              "0x00",
              "0x00"
            ]
          },
          "recentBlocks": [
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6"
          ]
        },
        {
          "name": "displayLoop005ae8",
          "block": 57718,
          "pc": "0x005AE8",
          "regs": {
            "af": "0xE054",
            "bc": "0xFF0305",
            "de": "0xD40000",
            "hl": "0xD546B4",
            "ix": "0xD005BC",
            "sp": "0xD1A819",
            "flags": {
              "z": true,
              "c": false,
              "n": false
            }
          },
          "ram": {
            "D00596": "0x12",
            "D005A0": "0x82",
            "D02A73": "0x70",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
              "0x00",
              "0xC0",
              "0x00",
              "0x00",
              "0x00",
              "0x00",
              "0x00",
              "0x00"
            ]
          },
          "recentBlocks": [
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8"
          ]
        },
        {
          "name": "displayLoop005b16",
          "block": 57719,
          "pc": "0x005B16",
          "regs": {
            "af": "0xE054",
            "bc": "0xFF05E0",
            "de": "0x0000FF",
            "hl": "0xD546B4",
            "ix": "0xD005BC",
            "sp": "0xD1A816",
            "flags": {
              "z": true,
              "c": false,
              "n": false
            }
          },
          "ram": {
            "D00596": "0x12",
            "D005A0": "0x82",
            "D02A73": "0xE0",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
              "0x00",
              "0xC0",
              "0x00",
              "0x00",
              "0x00",
              "0x00",
              "0x00",
              "0x00"
            ]
          },
          "recentBlocks": [
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16"
          ]
        },
        {
          "name": "displayLoop005b4b",
          "block": 57720,
          "pc": "0x005B4B",
          "regs": {
            "af": "0x007C",
            "bc": "0xFF0500",
            "de": "0x0000FF",
            "hl": "0xD546BE",
            "ix": "0xD005BD",
            "sp": "0xD1A816",
            "flags": {
              "z": true,
              "c": false,
              "n": false
            }
          },
          "ram": {
            "D00596": "0x12",
            "D005A0": "0x82",
            "D02A73": "0xE0",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
              "0xC0",
              "0x00",
              "0x00",
              "0x00",
              "0x00",
              "0x00",
              "0x00",
              "0x00"
            ]
          },
          "recentBlocks": [
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B"
          ]
        },
        {
          "name": "displayLoop005ab6",
          "block": 57721,
          "pc": "0x005AB6",
          "regs": {
            "af": "0xFF02",
            "bc": "0xFF0205",
            "de": "0x0000FF",
            "hl": "0xD005A0",
            "ix": "0xD005BD",
            "sp": "0xD1A819",
            "flags": {
              "z": false,
              "c": false,
              "n": true
            }
          },
          "ram": {
            "D00596": "0x12",
            "D005A0": "0x83",
            "D02A73": "0xE0",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
              "0xC0",
              "0x00",
              "0x00",
              "0x00",
              "0x00",
              "0x00",
              "0x00",
              "0x00"
            ]
          },
          "recentBlocks": [
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6"
          ]
        },
        {
          "name": "displayLoop005ae8",
          "block": 57722,
          "pc": "0x005AE8",
          "regs": {
            "af": "0xC054",
            "bc": "0xFF0205",
            "de": "0xD40000",
            "hl": "0xD54934",
            "ix": "0xD005BE",
            "sp": "0xD1A819",
            "flags": {
              "z": true,
              "c": false,
              "n": false
            }
          },
          "ram": {
            "D00596": "0x12",
            "D005A0": "0x83",
            "D02A73": "0xE0",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
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
          "recentBlocks": [
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8"
          ]
        },
        {
          "name": "displayLoop005b16",
          "block": 57723,
          "pc": "0x005B16",
          "regs": {
            "af": "0xC054",
            "bc": "0xFF05C0",
            "de": "0x0000FF",
            "hl": "0xD54934",
            "ix": "0xD005BE",
            "sp": "0xD1A816",
            "flags": {
              "z": true,
              "c": false,
              "n": false
            }
          },
          "ram": {
            "D00596": "0x12",
            "D005A0": "0x83",
            "D02A73": "0xC0",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
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
          "recentBlocks": [
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16"
          ]
        },
        {
          "name": "displayLoop005b4b",
          "block": 57724,
          "pc": "0x005B4B",
          "regs": {
            "af": "0x007C",
            "bc": "0xFF0500",
            "de": "0x0000FF",
            "hl": "0xD5493E",
            "ix": "0xD005BF",
            "sp": "0xD1A816",
            "flags": {
              "z": true,
              "c": false,
              "n": false
            }
          },
          "ram": {
            "D00596": "0x12",
            "D005A0": "0x83",
            "D02A73": "0xC0",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
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
          "recentBlocks": [
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B"
          ]
        },
        {
          "name": "displayLoop005ab6",
          "block": 57725,
          "pc": "0x005AB6",
          "regs": {
            "af": "0xFF02",
            "bc": "0xFF0105",
            "de": "0x0000FF",
            "hl": "0xD005A0",
            "ix": "0xD005BF",
            "sp": "0xD1A819",
            "flags": {
              "z": false,
              "c": false,
              "n": true
            }
          },
          "ram": {
            "D00596": "0x12",
            "D005A0": "0x84",
            "D02A73": "0xC0",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
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
          "recentBlocks": [
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6"
          ]
        },
        {
          "name": "displayLoop005ae8",
          "block": 57726,
          "pc": "0x005AE8",
          "regs": {
            "af": "0x0054",
            "bc": "0xFF0105",
            "de": "0xD40000",
            "hl": "0xD54BB4",
            "ix": "0xD005C0",
            "sp": "0xD1A819",
            "flags": {
              "z": true,
              "c": false,
              "n": false
            }
          },
          "ram": {
            "D00596": "0x12",
            "D005A0": "0x84",
            "D02A73": "0xC0",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
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
          "recentBlocks": [
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8"
          ]
        },
        {
          "name": "displayLoop005b16",
          "block": 57727,
          "pc": "0x005B16",
          "regs": {
            "af": "0x0054",
            "bc": "0xFF0500",
            "de": "0x0000FF",
            "hl": "0xD54BB4",
            "ix": "0xD005C0",
            "sp": "0xD1A816",
            "flags": {
              "z": true,
              "c": false,
              "n": false
            }
          },
          "ram": {
            "D00596": "0x12",
            "D005A0": "0x84",
            "D02A73": "0x00",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
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
          "recentBlocks": [
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16"
          ]
        },
        {
          "name": "displayLoop005b4b",
          "block": 57728,
          "pc": "0x005B4B",
          "regs": {
            "af": "0x007C",
            "bc": "0xFF0500",
            "de": "0x0000FF",
            "hl": "0xD54BBE",
            "ix": "0xD005C1",
            "sp": "0xD1A816",
            "flags": {
              "z": true,
              "c": false,
              "n": false
            }
          },
          "ram": {
            "D00596": "0x12",
            "D005A0": "0x84",
            "D02A73": "0x00",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
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
          "recentBlocks": [
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B"
          ]
        },
        {
          "name": "displayCaller005b92",
          "block": 57729,
          "pc": "0x005B92",
          "regs": {
            "af": "0xFF42",
            "bc": "0xFF0005",
            "de": "0x0000FF",
            "hl": "0xD005A0",
            "ix": "0xD005C1",
            "sp": "0xD1A819",
            "flags": {
              "z": true,
              "c": false,
              "n": true
            }
          },
          "ram": {
            "D00596": "0x12",
            "D005A0": "0x85",
            "D02A73": "0x00",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
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
          "recentBlocks": [
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
      ]
    },
    {
      "block": 57854,
      "pc": "0x005B92",
      "exitState": {
        "block": 57854,
        "pc": "0x005B92",
        "regs": {
          "af": "0xFF42",
          "bc": "0xFF0005",
          "de": "0x0000FF",
          "hl": "0xD005A0",
          "ix": "0xD005C1",
          "sp": "0xD1A819",
          "flags": {
            "z": true,
            "c": false,
            "n": true
          }
        },
        "ram": {
          "D00596": "0x12",
          "D005A0": "0x85",
          "D02A73": "0x00",
          "D02A75": "0x05",
          "low0059c": "0x095CC3",
          "ixBytes": [
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
        "recentBlocks": [
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
      "precedingLoop": [
        {
          "name": "displayLoop005ae8",
          "block": 57831,
          "pc": "0x005AE8",
          "regs": {
            "af": "0x0054",
            "bc": "0xFF0605",
            "de": "0xD40000",
            "hl": "0xD53F34",
            "ix": "0xD005B6",
            "sp": "0xD1A819",
            "flags": {
              "z": true,
              "c": false,
              "n": false
            }
          },
          "ram": {
            "D00596": "0x12",
            "D005A0": "0x7F",
            "D02A73": "0xF8",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
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
          "recentBlocks": [
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8"
          ]
        },
        {
          "name": "displayLoop005b16",
          "block": 57832,
          "pc": "0x005B16",
          "regs": {
            "af": "0x0054",
            "bc": "0xFF0500",
            "de": "0x0000FF",
            "hl": "0xD53F34",
            "ix": "0xD005B6",
            "sp": "0xD1A816",
            "flags": {
              "z": true,
              "c": false,
              "n": false
            }
          },
          "ram": {
            "D00596": "0x12",
            "D005A0": "0x7F",
            "D02A73": "0x00",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
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
          "recentBlocks": [
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16"
          ]
        },
        {
          "name": "displayLoop005b4b",
          "block": 57833,
          "pc": "0x005B4B",
          "regs": {
            "af": "0x007C",
            "bc": "0xFF0500",
            "de": "0x0000FF",
            "hl": "0xD53F3E",
            "ix": "0xD005B7",
            "sp": "0xD1A816",
            "flags": {
              "z": true,
              "c": false,
              "n": false
            }
          },
          "ram": {
            "D00596": "0x12",
            "D005A0": "0x7F",
            "D02A73": "0x00",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
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
          "recentBlocks": [
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B"
          ]
        },
        {
          "name": "displayLoop005ab6",
          "block": 57834,
          "pc": "0x005AB6",
          "regs": {
            "af": "0xFF02",
            "bc": "0xFF0505",
            "de": "0x0000FF",
            "hl": "0xD005A0",
            "ix": "0xD005B7",
            "sp": "0xD1A819",
            "flags": {
              "z": false,
              "c": false,
              "n": true
            }
          },
          "ram": {
            "D00596": "0x12",
            "D005A0": "0x80",
            "D02A73": "0x00",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
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
          "recentBlocks": [
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6"
          ]
        },
        {
          "name": "displayLoop005ae8",
          "block": 57835,
          "pc": "0x005AE8",
          "regs": {
            "af": "0x0054",
            "bc": "0xFF0505",
            "de": "0xD40000",
            "hl": "0xD541B4",
            "ix": "0xD005B8",
            "sp": "0xD1A819",
            "flags": {
              "z": true,
              "c": false,
              "n": false
            }
          },
          "ram": {
            "D00596": "0x12",
            "D005A0": "0x80",
            "D02A73": "0x00",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
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
          "recentBlocks": [
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8"
          ]
        },
        {
          "name": "displayLoop005b16",
          "block": 57836,
          "pc": "0x005B16",
          "regs": {
            "af": "0x0054",
            "bc": "0xFF0500",
            "de": "0x0000FF",
            "hl": "0xD541B4",
            "ix": "0xD005B8",
            "sp": "0xD1A816",
            "flags": {
              "z": true,
              "c": false,
              "n": false
            }
          },
          "ram": {
            "D00596": "0x12",
            "D005A0": "0x80",
            "D02A73": "0x00",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
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
          "recentBlocks": [
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16"
          ]
        },
        {
          "name": "displayLoop005b4b",
          "block": 57837,
          "pc": "0x005B4B",
          "regs": {
            "af": "0x007C",
            "bc": "0xFF0500",
            "de": "0x0000FF",
            "hl": "0xD541BE",
            "ix": "0xD005B9",
            "sp": "0xD1A816",
            "flags": {
              "z": true,
              "c": false,
              "n": false
            }
          },
          "ram": {
            "D00596": "0x12",
            "D005A0": "0x80",
            "D02A73": "0x00",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
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
          "recentBlocks": [
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B"
          ]
        },
        {
          "name": "displayLoop005ab6",
          "block": 57838,
          "pc": "0x005AB6",
          "regs": {
            "af": "0xFF02",
            "bc": "0xFF0405",
            "de": "0x0000FF",
            "hl": "0xD005A0",
            "ix": "0xD005B9",
            "sp": "0xD1A819",
            "flags": {
              "z": false,
              "c": false,
              "n": true
            }
          },
          "ram": {
            "D00596": "0x12",
            "D005A0": "0x81",
            "D02A73": "0x00",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
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
          "recentBlocks": [
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6"
          ]
        },
        {
          "name": "displayLoop005ae8",
          "block": 57839,
          "pc": "0x005AE8",
          "regs": {
            "af": "0x0054",
            "bc": "0xFF0405",
            "de": "0xD40000",
            "hl": "0xD54434",
            "ix": "0xD005BA",
            "sp": "0xD1A819",
            "flags": {
              "z": true,
              "c": false,
              "n": false
            }
          },
          "ram": {
            "D00596": "0x12",
            "D005A0": "0x81",
            "D02A73": "0x00",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
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
          "recentBlocks": [
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8"
          ]
        },
        {
          "name": "displayLoop005b16",
          "block": 57840,
          "pc": "0x005B16",
          "regs": {
            "af": "0x0054",
            "bc": "0xFF0500",
            "de": "0x0000FF",
            "hl": "0xD54434",
            "ix": "0xD005BA",
            "sp": "0xD1A816",
            "flags": {
              "z": true,
              "c": false,
              "n": false
            }
          },
          "ram": {
            "D00596": "0x12",
            "D005A0": "0x81",
            "D02A73": "0x00",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
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
          "recentBlocks": [
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16"
          ]
        },
        {
          "name": "displayLoop005b4b",
          "block": 57841,
          "pc": "0x005B4B",
          "regs": {
            "af": "0x007C",
            "bc": "0xFF0500",
            "de": "0x0000FF",
            "hl": "0xD5443E",
            "ix": "0xD005BB",
            "sp": "0xD1A816",
            "flags": {
              "z": true,
              "c": false,
              "n": false
            }
          },
          "ram": {
            "D00596": "0x12",
            "D005A0": "0x81",
            "D02A73": "0x00",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
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
          "recentBlocks": [
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B"
          ]
        },
        {
          "name": "displayLoop005ab6",
          "block": 57842,
          "pc": "0x005AB6",
          "regs": {
            "af": "0xFF02",
            "bc": "0xFF0305",
            "de": "0x0000FF",
            "hl": "0xD005A0",
            "ix": "0xD005BB",
            "sp": "0xD1A819",
            "flags": {
              "z": false,
              "c": false,
              "n": true
            }
          },
          "ram": {
            "D00596": "0x12",
            "D005A0": "0x82",
            "D02A73": "0x00",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
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
          "recentBlocks": [
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6"
          ]
        },
        {
          "name": "displayLoop005ae8",
          "block": 57843,
          "pc": "0x005AE8",
          "regs": {
            "af": "0x0054",
            "bc": "0xFF0305",
            "de": "0xD40000",
            "hl": "0xD546B4",
            "ix": "0xD005BC",
            "sp": "0xD1A819",
            "flags": {
              "z": true,
              "c": false,
              "n": false
            }
          },
          "ram": {
            "D00596": "0x12",
            "D005A0": "0x82",
            "D02A73": "0x00",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
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
          "recentBlocks": [
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8"
          ]
        },
        {
          "name": "displayLoop005b16",
          "block": 57844,
          "pc": "0x005B16",
          "regs": {
            "af": "0x0054",
            "bc": "0xFF0500",
            "de": "0x0000FF",
            "hl": "0xD546B4",
            "ix": "0xD005BC",
            "sp": "0xD1A816",
            "flags": {
              "z": true,
              "c": false,
              "n": false
            }
          },
          "ram": {
            "D00596": "0x12",
            "D005A0": "0x82",
            "D02A73": "0x00",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
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
          "recentBlocks": [
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16"
          ]
        },
        {
          "name": "displayLoop005b4b",
          "block": 57845,
          "pc": "0x005B4B",
          "regs": {
            "af": "0x007C",
            "bc": "0xFF0500",
            "de": "0x0000FF",
            "hl": "0xD546BE",
            "ix": "0xD005BD",
            "sp": "0xD1A816",
            "flags": {
              "z": true,
              "c": false,
              "n": false
            }
          },
          "ram": {
            "D00596": "0x12",
            "D005A0": "0x82",
            "D02A73": "0x00",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
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
          "recentBlocks": [
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B"
          ]
        },
        {
          "name": "displayLoop005ab6",
          "block": 57846,
          "pc": "0x005AB6",
          "regs": {
            "af": "0xFF02",
            "bc": "0xFF0205",
            "de": "0x0000FF",
            "hl": "0xD005A0",
            "ix": "0xD005BD",
            "sp": "0xD1A819",
            "flags": {
              "z": false,
              "c": false,
              "n": true
            }
          },
          "ram": {
            "D00596": "0x12",
            "D005A0": "0x83",
            "D02A73": "0x00",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
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
          "recentBlocks": [
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6"
          ]
        },
        {
          "name": "displayLoop005ae8",
          "block": 57847,
          "pc": "0x005AE8",
          "regs": {
            "af": "0x0054",
            "bc": "0xFF0205",
            "de": "0xD40000",
            "hl": "0xD54934",
            "ix": "0xD005BE",
            "sp": "0xD1A819",
            "flags": {
              "z": true,
              "c": false,
              "n": false
            }
          },
          "ram": {
            "D00596": "0x12",
            "D005A0": "0x83",
            "D02A73": "0x00",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
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
          "recentBlocks": [
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8"
          ]
        },
        {
          "name": "displayLoop005b16",
          "block": 57848,
          "pc": "0x005B16",
          "regs": {
            "af": "0x0054",
            "bc": "0xFF0500",
            "de": "0x0000FF",
            "hl": "0xD54934",
            "ix": "0xD005BE",
            "sp": "0xD1A816",
            "flags": {
              "z": true,
              "c": false,
              "n": false
            }
          },
          "ram": {
            "D00596": "0x12",
            "D005A0": "0x83",
            "D02A73": "0x00",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
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
          "recentBlocks": [
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16"
          ]
        },
        {
          "name": "displayLoop005b4b",
          "block": 57849,
          "pc": "0x005B4B",
          "regs": {
            "af": "0x007C",
            "bc": "0xFF0500",
            "de": "0x0000FF",
            "hl": "0xD5493E",
            "ix": "0xD005BF",
            "sp": "0xD1A816",
            "flags": {
              "z": true,
              "c": false,
              "n": false
            }
          },
          "ram": {
            "D00596": "0x12",
            "D005A0": "0x83",
            "D02A73": "0x00",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
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
          "recentBlocks": [
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B"
          ]
        },
        {
          "name": "displayLoop005ab6",
          "block": 57850,
          "pc": "0x005AB6",
          "regs": {
            "af": "0xFF02",
            "bc": "0xFF0105",
            "de": "0x0000FF",
            "hl": "0xD005A0",
            "ix": "0xD005BF",
            "sp": "0xD1A819",
            "flags": {
              "z": false,
              "c": false,
              "n": true
            }
          },
          "ram": {
            "D00596": "0x12",
            "D005A0": "0x84",
            "D02A73": "0x00",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
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
          "recentBlocks": [
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6"
          ]
        },
        {
          "name": "displayLoop005ae8",
          "block": 57851,
          "pc": "0x005AE8",
          "regs": {
            "af": "0x0054",
            "bc": "0xFF0105",
            "de": "0xD40000",
            "hl": "0xD54BB4",
            "ix": "0xD005C0",
            "sp": "0xD1A819",
            "flags": {
              "z": true,
              "c": false,
              "n": false
            }
          },
          "ram": {
            "D00596": "0x12",
            "D005A0": "0x84",
            "D02A73": "0x00",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
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
          "recentBlocks": [
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8"
          ]
        },
        {
          "name": "displayLoop005b16",
          "block": 57852,
          "pc": "0x005B16",
          "regs": {
            "af": "0x0054",
            "bc": "0xFF0500",
            "de": "0x0000FF",
            "hl": "0xD54BB4",
            "ix": "0xD005C0",
            "sp": "0xD1A816",
            "flags": {
              "z": true,
              "c": false,
              "n": false
            }
          },
          "ram": {
            "D00596": "0x12",
            "D005A0": "0x84",
            "D02A73": "0x00",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
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
          "recentBlocks": [
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16"
          ]
        },
        {
          "name": "displayLoop005b4b",
          "block": 57853,
          "pc": "0x005B4B",
          "regs": {
            "af": "0x007C",
            "bc": "0xFF0500",
            "de": "0x0000FF",
            "hl": "0xD54BBE",
            "ix": "0xD005C1",
            "sp": "0xD1A816",
            "flags": {
              "z": true,
              "c": false,
              "n": false
            }
          },
          "ram": {
            "D00596": "0x12",
            "D005A0": "0x84",
            "D02A73": "0x00",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
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
          "recentBlocks": [
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B"
          ]
        },
        {
          "name": "displayCaller005b92",
          "block": 57854,
          "pc": "0x005B92",
          "regs": {
            "af": "0xFF42",
            "bc": "0xFF0005",
            "de": "0x0000FF",
            "hl": "0xD005A0",
            "ix": "0xD005C1",
            "sp": "0xD1A819",
            "flags": {
              "z": true,
              "c": false,
              "n": true
            }
          },
          "ram": {
            "D00596": "0x12",
            "D005A0": "0x85",
            "D02A73": "0x00",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
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
          "recentBlocks": [
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
      ]
    }
  ],
  "Digit2": [
    {
      "block": 20031,
      "pc": "0x005B92",
      "exitState": {
        "block": 20031,
        "pc": "0x005B92",
        "regs": {
          "af": "0xFF42",
          "bc": "0xFF0005",
          "de": "0x0000FF",
          "hl": "0xD005A0",
          "ix": "0xD005C1",
          "sp": "0xD1A84E",
          "flags": {
            "z": true,
            "c": false,
            "n": true
          }
        },
        "ram": {
          "D00596": "0x09",
          "D005A0": "0xD5",
          "D02A73": "0x38",
          "D02A75": "0x05",
          "low0059c": "0x095CC3",
          "ixBytes": [
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
        "recentBlocks": [
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
      "precedingLoop": [
        {
          "name": "displayLoop005ae8",
          "block": 20008,
          "pc": "0x005AE8",
          "regs": {
            "af": "0x0054",
            "bc": "0xFF0605",
            "de": "0xD40000",
            "hl": "0xD6065C",
            "ix": "0xD005B6",
            "sp": "0xD1A84E",
            "flags": {
              "z": true,
              "c": false,
              "n": false
            }
          },
          "ram": {
            "D00596": "0x09",
            "D005A0": "0xCF",
            "D02A73": "0x00",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
              "0x00",
              "0x00",
              "0x00",
              "0x38",
              "0x80",
              "0x38",
              "0x80",
              "0x38"
            ]
          },
          "recentBlocks": [
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8"
          ]
        },
        {
          "name": "displayLoop005b16",
          "block": 20009,
          "pc": "0x005B16",
          "regs": {
            "af": "0x0054",
            "bc": "0xFF0500",
            "de": "0x0000FF",
            "hl": "0xD6065C",
            "ix": "0xD005B6",
            "sp": "0xD1A84B",
            "flags": {
              "z": true,
              "c": false,
              "n": false
            }
          },
          "ram": {
            "D00596": "0x09",
            "D005A0": "0xCF",
            "D02A73": "0x00",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
              "0x00",
              "0x00",
              "0x00",
              "0x38",
              "0x80",
              "0x38",
              "0x80",
              "0x38"
            ]
          },
          "recentBlocks": [
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16"
          ]
        },
        {
          "name": "displayLoop005b4b",
          "block": 20010,
          "pc": "0x005B4B",
          "regs": {
            "af": "0x007C",
            "bc": "0xFF0500",
            "de": "0x0000FF",
            "hl": "0xD60666",
            "ix": "0xD005B7",
            "sp": "0xD1A84B",
            "flags": {
              "z": true,
              "c": false,
              "n": false
            }
          },
          "ram": {
            "D00596": "0x09",
            "D005A0": "0xCF",
            "D02A73": "0x00",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
              "0x00",
              "0x00",
              "0x38",
              "0x80",
              "0x38",
              "0x80",
              "0x38",
              "0x80"
            ]
          },
          "recentBlocks": [
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B"
          ]
        },
        {
          "name": "displayLoop005ab6",
          "block": 20011,
          "pc": "0x005AB6",
          "regs": {
            "af": "0xFF02",
            "bc": "0xFF0505",
            "de": "0x0000FF",
            "hl": "0xD005A0",
            "ix": "0xD005B7",
            "sp": "0xD1A84E",
            "flags": {
              "z": false,
              "c": false,
              "n": true
            }
          },
          "ram": {
            "D00596": "0x09",
            "D005A0": "0xD0",
            "D02A73": "0x00",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
              "0x00",
              "0x00",
              "0x38",
              "0x80",
              "0x38",
              "0x80",
              "0x38",
              "0x80"
            ]
          },
          "recentBlocks": [
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6"
          ]
        },
        {
          "name": "displayLoop005ae8",
          "block": 20012,
          "pc": "0x005AE8",
          "regs": {
            "af": "0x0054",
            "bc": "0xFF0505",
            "de": "0xD40000",
            "hl": "0xD608DC",
            "ix": "0xD005B8",
            "sp": "0xD1A84E",
            "flags": {
              "z": true,
              "c": false,
              "n": false
            }
          },
          "ram": {
            "D00596": "0x09",
            "D005A0": "0xD0",
            "D02A73": "0x00",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
              "0x00",
              "0x38",
              "0x80",
              "0x38",
              "0x80",
              "0x38",
              "0x80",
              "0x38"
            ]
          },
          "recentBlocks": [
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8"
          ]
        },
        {
          "name": "displayLoop005b16",
          "block": 20013,
          "pc": "0x005B16",
          "regs": {
            "af": "0x0054",
            "bc": "0xFF0500",
            "de": "0x0000FF",
            "hl": "0xD608DC",
            "ix": "0xD005B8",
            "sp": "0xD1A84B",
            "flags": {
              "z": true,
              "c": false,
              "n": false
            }
          },
          "ram": {
            "D00596": "0x09",
            "D005A0": "0xD0",
            "D02A73": "0x00",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
              "0x00",
              "0x38",
              "0x80",
              "0x38",
              "0x80",
              "0x38",
              "0x80",
              "0x38"
            ]
          },
          "recentBlocks": [
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16"
          ]
        },
        {
          "name": "displayLoop005b4b",
          "block": 20014,
          "pc": "0x005B4B",
          "regs": {
            "af": "0x007C",
            "bc": "0xFF0500",
            "de": "0x0000FF",
            "hl": "0xD608E6",
            "ix": "0xD005B9",
            "sp": "0xD1A84B",
            "flags": {
              "z": true,
              "c": false,
              "n": false
            }
          },
          "ram": {
            "D00596": "0x09",
            "D005A0": "0xD0",
            "D02A73": "0x00",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
              "0x38",
              "0x80",
              "0x38",
              "0x80",
              "0x38",
              "0x80",
              "0x38",
              "0x80"
            ]
          },
          "recentBlocks": [
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B"
          ]
        },
        {
          "name": "displayLoop005ab6",
          "block": 20015,
          "pc": "0x005AB6",
          "regs": {
            "af": "0xFF02",
            "bc": "0xFF0405",
            "de": "0x0000FF",
            "hl": "0xD005A0",
            "ix": "0xD005B9",
            "sp": "0xD1A84E",
            "flags": {
              "z": false,
              "c": false,
              "n": true
            }
          },
          "ram": {
            "D00596": "0x09",
            "D005A0": "0xD1",
            "D02A73": "0x00",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
              "0x38",
              "0x80",
              "0x38",
              "0x80",
              "0x38",
              "0x80",
              "0x38",
              "0x80"
            ]
          },
          "recentBlocks": [
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6"
          ]
        },
        {
          "name": "displayLoop005ae8",
          "block": 20016,
          "pc": "0x005AE8",
          "regs": {
            "af": "0x3854",
            "bc": "0xFF0405",
            "de": "0xD40000",
            "hl": "0xD60B5C",
            "ix": "0xD005BA",
            "sp": "0xD1A84E",
            "flags": {
              "z": true,
              "c": false,
              "n": false
            }
          },
          "ram": {
            "D00596": "0x09",
            "D005A0": "0xD1",
            "D02A73": "0x00",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
              "0x80",
              "0x38",
              "0x80",
              "0x38",
              "0x80",
              "0x38",
              "0x80",
              "0x00"
            ]
          },
          "recentBlocks": [
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8"
          ]
        },
        {
          "name": "displayLoop005b16",
          "block": 20017,
          "pc": "0x005B16",
          "regs": {
            "af": "0x3854",
            "bc": "0xFF0538",
            "de": "0x0000FF",
            "hl": "0xD60B5C",
            "ix": "0xD005BA",
            "sp": "0xD1A84B",
            "flags": {
              "z": true,
              "c": false,
              "n": false
            }
          },
          "ram": {
            "D00596": "0x09",
            "D005A0": "0xD1",
            "D02A73": "0x38",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
              "0x80",
              "0x38",
              "0x80",
              "0x38",
              "0x80",
              "0x38",
              "0x80",
              "0x00"
            ]
          },
          "recentBlocks": [
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16"
          ]
        },
        {
          "name": "displayLoop005b4b",
          "block": 20018,
          "pc": "0x005B4B",
          "regs": {
            "af": "0x8055",
            "bc": "0xFF0500",
            "de": "0x0000FF",
            "hl": "0xD60B66",
            "ix": "0xD005BB",
            "sp": "0xD1A84B",
            "flags": {
              "z": true,
              "c": true,
              "n": false
            }
          },
          "ram": {
            "D00596": "0x09",
            "D005A0": "0xD1",
            "D02A73": "0x38",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
              "0x38",
              "0x80",
              "0x38",
              "0x80",
              "0x38",
              "0x80",
              "0x00",
              "0x00"
            ]
          },
          "recentBlocks": [
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B"
          ]
        },
        {
          "name": "displayLoop005ab6",
          "block": 20019,
          "pc": "0x005AB6",
          "regs": {
            "af": "0xFF02",
            "bc": "0xFF0305",
            "de": "0x0000FF",
            "hl": "0xD005A0",
            "ix": "0xD005BB",
            "sp": "0xD1A84E",
            "flags": {
              "z": false,
              "c": false,
              "n": true
            }
          },
          "ram": {
            "D00596": "0x09",
            "D005A0": "0xD2",
            "D02A73": "0x38",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
              "0x38",
              "0x80",
              "0x38",
              "0x80",
              "0x38",
              "0x80",
              "0x00",
              "0x00"
            ]
          },
          "recentBlocks": [
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6"
          ]
        },
        {
          "name": "displayLoop005ae8",
          "block": 20020,
          "pc": "0x005AE8",
          "regs": {
            "af": "0x3854",
            "bc": "0xFF0305",
            "de": "0xD40000",
            "hl": "0xD60DDC",
            "ix": "0xD005BC",
            "sp": "0xD1A84E",
            "flags": {
              "z": true,
              "c": false,
              "n": false
            }
          },
          "ram": {
            "D00596": "0x09",
            "D005A0": "0xD2",
            "D02A73": "0x38",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
              "0x80",
              "0x38",
              "0x80",
              "0x38",
              "0x80",
              "0x00",
              "0x00",
              "0x00"
            ]
          },
          "recentBlocks": [
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8"
          ]
        },
        {
          "name": "displayLoop005b16",
          "block": 20021,
          "pc": "0x005B16",
          "regs": {
            "af": "0x3854",
            "bc": "0xFF0538",
            "de": "0x0000FF",
            "hl": "0xD60DDC",
            "ix": "0xD005BC",
            "sp": "0xD1A84B",
            "flags": {
              "z": true,
              "c": false,
              "n": false
            }
          },
          "ram": {
            "D00596": "0x09",
            "D005A0": "0xD2",
            "D02A73": "0x38",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
              "0x80",
              "0x38",
              "0x80",
              "0x38",
              "0x80",
              "0x00",
              "0x00",
              "0x00"
            ]
          },
          "recentBlocks": [
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16"
          ]
        },
        {
          "name": "displayLoop005b4b",
          "block": 20022,
          "pc": "0x005B4B",
          "regs": {
            "af": "0x8055",
            "bc": "0xFF0500",
            "de": "0x0000FF",
            "hl": "0xD60DE6",
            "ix": "0xD005BD",
            "sp": "0xD1A84B",
            "flags": {
              "z": true,
              "c": true,
              "n": false
            }
          },
          "ram": {
            "D00596": "0x09",
            "D005A0": "0xD2",
            "D02A73": "0x38",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
              "0x38",
              "0x80",
              "0x38",
              "0x80",
              "0x00",
              "0x00",
              "0x00",
              "0x00"
            ]
          },
          "recentBlocks": [
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B"
          ]
        },
        {
          "name": "displayLoop005ab6",
          "block": 20023,
          "pc": "0x005AB6",
          "regs": {
            "af": "0xFF02",
            "bc": "0xFF0205",
            "de": "0x0000FF",
            "hl": "0xD005A0",
            "ix": "0xD005BD",
            "sp": "0xD1A84E",
            "flags": {
              "z": false,
              "c": false,
              "n": true
            }
          },
          "ram": {
            "D00596": "0x09",
            "D005A0": "0xD3",
            "D02A73": "0x38",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
              "0x38",
              "0x80",
              "0x38",
              "0x80",
              "0x00",
              "0x00",
              "0x00",
              "0x00"
            ]
          },
          "recentBlocks": [
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6"
          ]
        },
        {
          "name": "displayLoop005ae8",
          "block": 20024,
          "pc": "0x005AE8",
          "regs": {
            "af": "0x3854",
            "bc": "0xFF0205",
            "de": "0xD40000",
            "hl": "0xD6105C",
            "ix": "0xD005BE",
            "sp": "0xD1A84E",
            "flags": {
              "z": true,
              "c": false,
              "n": false
            }
          },
          "ram": {
            "D00596": "0x09",
            "D005A0": "0xD3",
            "D02A73": "0x38",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
              "0x80",
              "0x38",
              "0x80",
              "0x00",
              "0x00",
              "0x00",
              "0x00",
              "0x00"
            ]
          },
          "recentBlocks": [
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8"
          ]
        },
        {
          "name": "displayLoop005b16",
          "block": 20025,
          "pc": "0x005B16",
          "regs": {
            "af": "0x3854",
            "bc": "0xFF0538",
            "de": "0x0000FF",
            "hl": "0xD6105C",
            "ix": "0xD005BE",
            "sp": "0xD1A84B",
            "flags": {
              "z": true,
              "c": false,
              "n": false
            }
          },
          "ram": {
            "D00596": "0x09",
            "D005A0": "0xD3",
            "D02A73": "0x38",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
              "0x80",
              "0x38",
              "0x80",
              "0x00",
              "0x00",
              "0x00",
              "0x00",
              "0x00"
            ]
          },
          "recentBlocks": [
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16"
          ]
        },
        {
          "name": "displayLoop005b4b",
          "block": 20026,
          "pc": "0x005B4B",
          "regs": {
            "af": "0x8055",
            "bc": "0xFF0500",
            "de": "0x0000FF",
            "hl": "0xD61066",
            "ix": "0xD005BF",
            "sp": "0xD1A84B",
            "flags": {
              "z": true,
              "c": true,
              "n": false
            }
          },
          "ram": {
            "D00596": "0x09",
            "D005A0": "0xD3",
            "D02A73": "0x38",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
              "0x38",
              "0x80",
              "0x00",
              "0x00",
              "0x00",
              "0x00",
              "0x00",
              "0x00"
            ]
          },
          "recentBlocks": [
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B"
          ]
        },
        {
          "name": "displayLoop005ab6",
          "block": 20027,
          "pc": "0x005AB6",
          "regs": {
            "af": "0xFF02",
            "bc": "0xFF0105",
            "de": "0x0000FF",
            "hl": "0xD005A0",
            "ix": "0xD005BF",
            "sp": "0xD1A84E",
            "flags": {
              "z": false,
              "c": false,
              "n": true
            }
          },
          "ram": {
            "D00596": "0x09",
            "D005A0": "0xD4",
            "D02A73": "0x38",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
              "0x38",
              "0x80",
              "0x00",
              "0x00",
              "0x00",
              "0x00",
              "0x00",
              "0x00"
            ]
          },
          "recentBlocks": [
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6"
          ]
        },
        {
          "name": "displayLoop005ae8",
          "block": 20028,
          "pc": "0x005AE8",
          "regs": {
            "af": "0x3854",
            "bc": "0xFF0105",
            "de": "0xD40000",
            "hl": "0xD612DC",
            "ix": "0xD005C0",
            "sp": "0xD1A84E",
            "flags": {
              "z": true,
              "c": false,
              "n": false
            }
          },
          "ram": {
            "D00596": "0x09",
            "D005A0": "0xD4",
            "D02A73": "0x38",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
              "0x80",
              "0x00",
              "0x00",
              "0x00",
              "0x00",
              "0x00",
              "0x00",
              "0x00"
            ]
          },
          "recentBlocks": [
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8"
          ]
        },
        {
          "name": "displayLoop005b16",
          "block": 20029,
          "pc": "0x005B16",
          "regs": {
            "af": "0x3854",
            "bc": "0xFF0538",
            "de": "0x0000FF",
            "hl": "0xD612DC",
            "ix": "0xD005C0",
            "sp": "0xD1A84B",
            "flags": {
              "z": true,
              "c": false,
              "n": false
            }
          },
          "ram": {
            "D00596": "0x09",
            "D005A0": "0xD4",
            "D02A73": "0x38",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
              "0x80",
              "0x00",
              "0x00",
              "0x00",
              "0x00",
              "0x00",
              "0x00",
              "0x00"
            ]
          },
          "recentBlocks": [
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16"
          ]
        },
        {
          "name": "displayLoop005b4b",
          "block": 20030,
          "pc": "0x005B4B",
          "regs": {
            "af": "0x8055",
            "bc": "0xFF0500",
            "de": "0x0000FF",
            "hl": "0xD612E6",
            "ix": "0xD005C1",
            "sp": "0xD1A84B",
            "flags": {
              "z": true,
              "c": true,
              "n": false
            }
          },
          "ram": {
            "D00596": "0x09",
            "D005A0": "0xD4",
            "D02A73": "0x38",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
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
          "recentBlocks": [
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B"
          ]
        },
        {
          "name": "displayCaller005b92",
          "block": 20031,
          "pc": "0x005B92",
          "regs": {
            "af": "0xFF42",
            "bc": "0xFF0005",
            "de": "0x0000FF",
            "hl": "0xD005A0",
            "ix": "0xD005C1",
            "sp": "0xD1A84E",
            "flags": {
              "z": true,
              "c": false,
              "n": true
            }
          },
          "ram": {
            "D00596": "0x09",
            "D005A0": "0xD5",
            "D02A73": "0x38",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
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
          "recentBlocks": [
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
      ]
    },
    {
      "block": 20147,
      "pc": "0x005B92",
      "exitState": {
        "block": 20147,
        "pc": "0x005B92",
        "regs": {
          "af": "0xFF42",
          "bc": "0xFF0005",
          "de": "0x0000FF",
          "hl": "0xD005A0",
          "ix": "0xD005C1",
          "sp": "0xD1A819",
          "flags": {
            "z": true,
            "c": false,
            "n": true
          }
        },
        "ram": {
          "D00596": "0x12",
          "D005A0": "0x85",
          "D02A73": "0x00",
          "D02A75": "0x05",
          "low0059c": "0x095CC3",
          "ixBytes": [
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
        "recentBlocks": [
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
      "precedingLoop": [
        {
          "name": "displayLoop005ae8",
          "block": 20124,
          "pc": "0x005AE8",
          "regs": {
            "af": "0x1854",
            "bc": "0xFF0605",
            "de": "0xD40000",
            "hl": "0xD53F34",
            "ix": "0xD005B6",
            "sp": "0xD1A819",
            "flags": {
              "z": true,
              "c": false,
              "n": false
            }
          },
          "ram": {
            "D00596": "0x12",
            "D005A0": "0x7F",
            "D02A73": "0x08",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
              "0x80",
              "0x38",
              "0x00",
              "0x70",
              "0x00",
              "0xE0",
              "0x00",
              "0xC0"
            ]
          },
          "recentBlocks": [
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8"
          ]
        },
        {
          "name": "displayLoop005b16",
          "block": 20125,
          "pc": "0x005B16",
          "regs": {
            "af": "0x1854",
            "bc": "0xFF0518",
            "de": "0x0000FF",
            "hl": "0xD53F34",
            "ix": "0xD005B6",
            "sp": "0xD1A816",
            "flags": {
              "z": true,
              "c": false,
              "n": false
            }
          },
          "ram": {
            "D00596": "0x12",
            "D005A0": "0x7F",
            "D02A73": "0x18",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
              "0x80",
              "0x38",
              "0x00",
              "0x70",
              "0x00",
              "0xE0",
              "0x00",
              "0xC0"
            ]
          },
          "recentBlocks": [
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16"
          ]
        },
        {
          "name": "displayLoop005b4b",
          "block": 20126,
          "pc": "0x005B4B",
          "regs": {
            "af": "0x8055",
            "bc": "0xFF0500",
            "de": "0x0000FF",
            "hl": "0xD53F3E",
            "ix": "0xD005B7",
            "sp": "0xD1A816",
            "flags": {
              "z": true,
              "c": true,
              "n": false
            }
          },
          "ram": {
            "D00596": "0x12",
            "D005A0": "0x7F",
            "D02A73": "0x18",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
              "0x38",
              "0x00",
              "0x70",
              "0x00",
              "0xE0",
              "0x00",
              "0xC0",
              "0x00"
            ]
          },
          "recentBlocks": [
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B"
          ]
        },
        {
          "name": "displayLoop005ab6",
          "block": 20127,
          "pc": "0x005AB6",
          "regs": {
            "af": "0xFF02",
            "bc": "0xFF0505",
            "de": "0x0000FF",
            "hl": "0xD005A0",
            "ix": "0xD005B7",
            "sp": "0xD1A819",
            "flags": {
              "z": false,
              "c": false,
              "n": true
            }
          },
          "ram": {
            "D00596": "0x12",
            "D005A0": "0x80",
            "D02A73": "0x18",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
              "0x38",
              "0x00",
              "0x70",
              "0x00",
              "0xE0",
              "0x00",
              "0xC0",
              "0x00"
            ]
          },
          "recentBlocks": [
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6"
          ]
        },
        {
          "name": "displayLoop005ae8",
          "block": 20128,
          "pc": "0x005AE8",
          "regs": {
            "af": "0x3854",
            "bc": "0xFF0505",
            "de": "0xD40000",
            "hl": "0xD541B4",
            "ix": "0xD005B8",
            "sp": "0xD1A819",
            "flags": {
              "z": true,
              "c": false,
              "n": false
            }
          },
          "ram": {
            "D00596": "0x12",
            "D005A0": "0x80",
            "D02A73": "0x18",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
              "0x00",
              "0x70",
              "0x00",
              "0xE0",
              "0x00",
              "0xC0",
              "0x00",
              "0x00"
            ]
          },
          "recentBlocks": [
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8"
          ]
        },
        {
          "name": "displayLoop005b16",
          "block": 20129,
          "pc": "0x005B16",
          "regs": {
            "af": "0x3854",
            "bc": "0xFF0538",
            "de": "0x0000FF",
            "hl": "0xD541B4",
            "ix": "0xD005B8",
            "sp": "0xD1A816",
            "flags": {
              "z": true,
              "c": false,
              "n": false
            }
          },
          "ram": {
            "D00596": "0x12",
            "D005A0": "0x80",
            "D02A73": "0x38",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
              "0x00",
              "0x70",
              "0x00",
              "0xE0",
              "0x00",
              "0xC0",
              "0x00",
              "0x00"
            ]
          },
          "recentBlocks": [
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16"
          ]
        },
        {
          "name": "displayLoop005b4b",
          "block": 20130,
          "pc": "0x005B4B",
          "regs": {
            "af": "0x0055",
            "bc": "0xFF0500",
            "de": "0x0000FF",
            "hl": "0xD541BE",
            "ix": "0xD005B9",
            "sp": "0xD1A816",
            "flags": {
              "z": true,
              "c": true,
              "n": false
            }
          },
          "ram": {
            "D00596": "0x12",
            "D005A0": "0x80",
            "D02A73": "0x38",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
              "0x70",
              "0x00",
              "0xE0",
              "0x00",
              "0xC0",
              "0x00",
              "0x00",
              "0x00"
            ]
          },
          "recentBlocks": [
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B"
          ]
        },
        {
          "name": "displayLoop005ab6",
          "block": 20131,
          "pc": "0x005AB6",
          "regs": {
            "af": "0xFF02",
            "bc": "0xFF0405",
            "de": "0x0000FF",
            "hl": "0xD005A0",
            "ix": "0xD005B9",
            "sp": "0xD1A819",
            "flags": {
              "z": false,
              "c": false,
              "n": true
            }
          },
          "ram": {
            "D00596": "0x12",
            "D005A0": "0x81",
            "D02A73": "0x38",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
              "0x70",
              "0x00",
              "0xE0",
              "0x00",
              "0xC0",
              "0x00",
              "0x00",
              "0x00"
            ]
          },
          "recentBlocks": [
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6"
          ]
        },
        {
          "name": "displayLoop005ae8",
          "block": 20132,
          "pc": "0x005AE8",
          "regs": {
            "af": "0x7054",
            "bc": "0xFF0405",
            "de": "0xD40000",
            "hl": "0xD54434",
            "ix": "0xD005BA",
            "sp": "0xD1A819",
            "flags": {
              "z": true,
              "c": false,
              "n": false
            }
          },
          "ram": {
            "D00596": "0x12",
            "D005A0": "0x81",
            "D02A73": "0x38",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
              "0x00",
              "0xE0",
              "0x00",
              "0xC0",
              "0x00",
              "0x00",
              "0x00",
              "0x00"
            ]
          },
          "recentBlocks": [
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8"
          ]
        },
        {
          "name": "displayLoop005b16",
          "block": 20133,
          "pc": "0x005B16",
          "regs": {
            "af": "0x7054",
            "bc": "0xFF0570",
            "de": "0x0000FF",
            "hl": "0xD54434",
            "ix": "0xD005BA",
            "sp": "0xD1A816",
            "flags": {
              "z": true,
              "c": false,
              "n": false
            }
          },
          "ram": {
            "D00596": "0x12",
            "D005A0": "0x81",
            "D02A73": "0x70",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
              "0x00",
              "0xE0",
              "0x00",
              "0xC0",
              "0x00",
              "0x00",
              "0x00",
              "0x00"
            ]
          },
          "recentBlocks": [
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16"
          ]
        },
        {
          "name": "displayLoop005b4b",
          "block": 20134,
          "pc": "0x005B4B",
          "regs": {
            "af": "0x007C",
            "bc": "0xFF0500",
            "de": "0x0000FF",
            "hl": "0xD5443E",
            "ix": "0xD005BB",
            "sp": "0xD1A816",
            "flags": {
              "z": true,
              "c": false,
              "n": false
            }
          },
          "ram": {
            "D00596": "0x12",
            "D005A0": "0x81",
            "D02A73": "0x70",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
              "0xE0",
              "0x00",
              "0xC0",
              "0x00",
              "0x00",
              "0x00",
              "0x00",
              "0x00"
            ]
          },
          "recentBlocks": [
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B"
          ]
        },
        {
          "name": "displayLoop005ab6",
          "block": 20135,
          "pc": "0x005AB6",
          "regs": {
            "af": "0xFF02",
            "bc": "0xFF0305",
            "de": "0x0000FF",
            "hl": "0xD005A0",
            "ix": "0xD005BB",
            "sp": "0xD1A819",
            "flags": {
              "z": false,
              "c": false,
              "n": true
            }
          },
          "ram": {
            "D00596": "0x12",
            "D005A0": "0x82",
            "D02A73": "0x70",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
              "0xE0",
              "0x00",
              "0xC0",
              "0x00",
              "0x00",
              "0x00",
              "0x00",
              "0x00"
            ]
          },
          "recentBlocks": [
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6"
          ]
        },
        {
          "name": "displayLoop005ae8",
          "block": 20136,
          "pc": "0x005AE8",
          "regs": {
            "af": "0xE054",
            "bc": "0xFF0305",
            "de": "0xD40000",
            "hl": "0xD546B4",
            "ix": "0xD005BC",
            "sp": "0xD1A819",
            "flags": {
              "z": true,
              "c": false,
              "n": false
            }
          },
          "ram": {
            "D00596": "0x12",
            "D005A0": "0x82",
            "D02A73": "0x70",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
              "0x00",
              "0xC0",
              "0x00",
              "0x00",
              "0x00",
              "0x00",
              "0x00",
              "0x00"
            ]
          },
          "recentBlocks": [
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8"
          ]
        },
        {
          "name": "displayLoop005b16",
          "block": 20137,
          "pc": "0x005B16",
          "regs": {
            "af": "0xE054",
            "bc": "0xFF05E0",
            "de": "0x0000FF",
            "hl": "0xD546B4",
            "ix": "0xD005BC",
            "sp": "0xD1A816",
            "flags": {
              "z": true,
              "c": false,
              "n": false
            }
          },
          "ram": {
            "D00596": "0x12",
            "D005A0": "0x82",
            "D02A73": "0xE0",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
              "0x00",
              "0xC0",
              "0x00",
              "0x00",
              "0x00",
              "0x00",
              "0x00",
              "0x00"
            ]
          },
          "recentBlocks": [
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16"
          ]
        },
        {
          "name": "displayLoop005b4b",
          "block": 20138,
          "pc": "0x005B4B",
          "regs": {
            "af": "0x007C",
            "bc": "0xFF0500",
            "de": "0x0000FF",
            "hl": "0xD546BE",
            "ix": "0xD005BD",
            "sp": "0xD1A816",
            "flags": {
              "z": true,
              "c": false,
              "n": false
            }
          },
          "ram": {
            "D00596": "0x12",
            "D005A0": "0x82",
            "D02A73": "0xE0",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
              "0xC0",
              "0x00",
              "0x00",
              "0x00",
              "0x00",
              "0x00",
              "0x00",
              "0x00"
            ]
          },
          "recentBlocks": [
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B"
          ]
        },
        {
          "name": "displayLoop005ab6",
          "block": 20139,
          "pc": "0x005AB6",
          "regs": {
            "af": "0xFF02",
            "bc": "0xFF0205",
            "de": "0x0000FF",
            "hl": "0xD005A0",
            "ix": "0xD005BD",
            "sp": "0xD1A819",
            "flags": {
              "z": false,
              "c": false,
              "n": true
            }
          },
          "ram": {
            "D00596": "0x12",
            "D005A0": "0x83",
            "D02A73": "0xE0",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
              "0xC0",
              "0x00",
              "0x00",
              "0x00",
              "0x00",
              "0x00",
              "0x00",
              "0x00"
            ]
          },
          "recentBlocks": [
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6"
          ]
        },
        {
          "name": "displayLoop005ae8",
          "block": 20140,
          "pc": "0x005AE8",
          "regs": {
            "af": "0xC054",
            "bc": "0xFF0205",
            "de": "0xD40000",
            "hl": "0xD54934",
            "ix": "0xD005BE",
            "sp": "0xD1A819",
            "flags": {
              "z": true,
              "c": false,
              "n": false
            }
          },
          "ram": {
            "D00596": "0x12",
            "D005A0": "0x83",
            "D02A73": "0xE0",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
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
          "recentBlocks": [
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8"
          ]
        },
        {
          "name": "displayLoop005b16",
          "block": 20141,
          "pc": "0x005B16",
          "regs": {
            "af": "0xC054",
            "bc": "0xFF05C0",
            "de": "0x0000FF",
            "hl": "0xD54934",
            "ix": "0xD005BE",
            "sp": "0xD1A816",
            "flags": {
              "z": true,
              "c": false,
              "n": false
            }
          },
          "ram": {
            "D00596": "0x12",
            "D005A0": "0x83",
            "D02A73": "0xC0",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
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
          "recentBlocks": [
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16"
          ]
        },
        {
          "name": "displayLoop005b4b",
          "block": 20142,
          "pc": "0x005B4B",
          "regs": {
            "af": "0x007C",
            "bc": "0xFF0500",
            "de": "0x0000FF",
            "hl": "0xD5493E",
            "ix": "0xD005BF",
            "sp": "0xD1A816",
            "flags": {
              "z": true,
              "c": false,
              "n": false
            }
          },
          "ram": {
            "D00596": "0x12",
            "D005A0": "0x83",
            "D02A73": "0xC0",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
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
          "recentBlocks": [
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B"
          ]
        },
        {
          "name": "displayLoop005ab6",
          "block": 20143,
          "pc": "0x005AB6",
          "regs": {
            "af": "0xFF02",
            "bc": "0xFF0105",
            "de": "0x0000FF",
            "hl": "0xD005A0",
            "ix": "0xD005BF",
            "sp": "0xD1A819",
            "flags": {
              "z": false,
              "c": false,
              "n": true
            }
          },
          "ram": {
            "D00596": "0x12",
            "D005A0": "0x84",
            "D02A73": "0xC0",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
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
          "recentBlocks": [
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6"
          ]
        },
        {
          "name": "displayLoop005ae8",
          "block": 20144,
          "pc": "0x005AE8",
          "regs": {
            "af": "0x0054",
            "bc": "0xFF0105",
            "de": "0xD40000",
            "hl": "0xD54BB4",
            "ix": "0xD005C0",
            "sp": "0xD1A819",
            "flags": {
              "z": true,
              "c": false,
              "n": false
            }
          },
          "ram": {
            "D00596": "0x12",
            "D005A0": "0x84",
            "D02A73": "0xC0",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
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
          "recentBlocks": [
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8"
          ]
        },
        {
          "name": "displayLoop005b16",
          "block": 20145,
          "pc": "0x005B16",
          "regs": {
            "af": "0x0054",
            "bc": "0xFF0500",
            "de": "0x0000FF",
            "hl": "0xD54BB4",
            "ix": "0xD005C0",
            "sp": "0xD1A816",
            "flags": {
              "z": true,
              "c": false,
              "n": false
            }
          },
          "ram": {
            "D00596": "0x12",
            "D005A0": "0x84",
            "D02A73": "0x00",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
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
          "recentBlocks": [
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16"
          ]
        },
        {
          "name": "displayLoop005b4b",
          "block": 20146,
          "pc": "0x005B4B",
          "regs": {
            "af": "0x007C",
            "bc": "0xFF0500",
            "de": "0x0000FF",
            "hl": "0xD54BBE",
            "ix": "0xD005C1",
            "sp": "0xD1A816",
            "flags": {
              "z": true,
              "c": false,
              "n": false
            }
          },
          "ram": {
            "D00596": "0x12",
            "D005A0": "0x84",
            "D02A73": "0x00",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
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
          "recentBlocks": [
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B"
          ]
        },
        {
          "name": "displayCaller005b92",
          "block": 20147,
          "pc": "0x005B92",
          "regs": {
            "af": "0xFF42",
            "bc": "0xFF0005",
            "de": "0x0000FF",
            "hl": "0xD005A0",
            "ix": "0xD005C1",
            "sp": "0xD1A819",
            "flags": {
              "z": true,
              "c": false,
              "n": true
            }
          },
          "ram": {
            "D00596": "0x12",
            "D005A0": "0x85",
            "D02A73": "0x00",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
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
          "recentBlocks": [
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
      ]
    },
    {
      "block": 20272,
      "pc": "0x005B92",
      "exitState": {
        "block": 20272,
        "pc": "0x005B92",
        "regs": {
          "af": "0xFF42",
          "bc": "0xFF0005",
          "de": "0x0000FF",
          "hl": "0xD005A0",
          "ix": "0xD005C1",
          "sp": "0xD1A819",
          "flags": {
            "z": true,
            "c": false,
            "n": true
          }
        },
        "ram": {
          "D00596": "0x12",
          "D005A0": "0x85",
          "D02A73": "0x00",
          "D02A75": "0x05",
          "low0059c": "0x095CC3",
          "ixBytes": [
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
        "recentBlocks": [
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
      "precedingLoop": [
        {
          "name": "displayLoop005ae8",
          "block": 20249,
          "pc": "0x005AE8",
          "regs": {
            "af": "0x0054",
            "bc": "0xFF0605",
            "de": "0xD40000",
            "hl": "0xD53F34",
            "ix": "0xD005B6",
            "sp": "0xD1A819",
            "flags": {
              "z": true,
              "c": false,
              "n": false
            }
          },
          "ram": {
            "D00596": "0x12",
            "D005A0": "0x7F",
            "D02A73": "0xF8",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
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
          "recentBlocks": [
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8"
          ]
        },
        {
          "name": "displayLoop005b16",
          "block": 20250,
          "pc": "0x005B16",
          "regs": {
            "af": "0x0054",
            "bc": "0xFF0500",
            "de": "0x0000FF",
            "hl": "0xD53F34",
            "ix": "0xD005B6",
            "sp": "0xD1A816",
            "flags": {
              "z": true,
              "c": false,
              "n": false
            }
          },
          "ram": {
            "D00596": "0x12",
            "D005A0": "0x7F",
            "D02A73": "0x00",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
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
          "recentBlocks": [
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16"
          ]
        },
        {
          "name": "displayLoop005b4b",
          "block": 20251,
          "pc": "0x005B4B",
          "regs": {
            "af": "0x007C",
            "bc": "0xFF0500",
            "de": "0x0000FF",
            "hl": "0xD53F3E",
            "ix": "0xD005B7",
            "sp": "0xD1A816",
            "flags": {
              "z": true,
              "c": false,
              "n": false
            }
          },
          "ram": {
            "D00596": "0x12",
            "D005A0": "0x7F",
            "D02A73": "0x00",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
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
          "recentBlocks": [
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B"
          ]
        },
        {
          "name": "displayLoop005ab6",
          "block": 20252,
          "pc": "0x005AB6",
          "regs": {
            "af": "0xFF02",
            "bc": "0xFF0505",
            "de": "0x0000FF",
            "hl": "0xD005A0",
            "ix": "0xD005B7",
            "sp": "0xD1A819",
            "flags": {
              "z": false,
              "c": false,
              "n": true
            }
          },
          "ram": {
            "D00596": "0x12",
            "D005A0": "0x80",
            "D02A73": "0x00",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
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
          "recentBlocks": [
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6"
          ]
        },
        {
          "name": "displayLoop005ae8",
          "block": 20253,
          "pc": "0x005AE8",
          "regs": {
            "af": "0x0054",
            "bc": "0xFF0505",
            "de": "0xD40000",
            "hl": "0xD541B4",
            "ix": "0xD005B8",
            "sp": "0xD1A819",
            "flags": {
              "z": true,
              "c": false,
              "n": false
            }
          },
          "ram": {
            "D00596": "0x12",
            "D005A0": "0x80",
            "D02A73": "0x00",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
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
          "recentBlocks": [
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8"
          ]
        },
        {
          "name": "displayLoop005b16",
          "block": 20254,
          "pc": "0x005B16",
          "regs": {
            "af": "0x0054",
            "bc": "0xFF0500",
            "de": "0x0000FF",
            "hl": "0xD541B4",
            "ix": "0xD005B8",
            "sp": "0xD1A816",
            "flags": {
              "z": true,
              "c": false,
              "n": false
            }
          },
          "ram": {
            "D00596": "0x12",
            "D005A0": "0x80",
            "D02A73": "0x00",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
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
          "recentBlocks": [
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16"
          ]
        },
        {
          "name": "displayLoop005b4b",
          "block": 20255,
          "pc": "0x005B4B",
          "regs": {
            "af": "0x007C",
            "bc": "0xFF0500",
            "de": "0x0000FF",
            "hl": "0xD541BE",
            "ix": "0xD005B9",
            "sp": "0xD1A816",
            "flags": {
              "z": true,
              "c": false,
              "n": false
            }
          },
          "ram": {
            "D00596": "0x12",
            "D005A0": "0x80",
            "D02A73": "0x00",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
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
          "recentBlocks": [
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B"
          ]
        },
        {
          "name": "displayLoop005ab6",
          "block": 20256,
          "pc": "0x005AB6",
          "regs": {
            "af": "0xFF02",
            "bc": "0xFF0405",
            "de": "0x0000FF",
            "hl": "0xD005A0",
            "ix": "0xD005B9",
            "sp": "0xD1A819",
            "flags": {
              "z": false,
              "c": false,
              "n": true
            }
          },
          "ram": {
            "D00596": "0x12",
            "D005A0": "0x81",
            "D02A73": "0x00",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
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
          "recentBlocks": [
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6"
          ]
        },
        {
          "name": "displayLoop005ae8",
          "block": 20257,
          "pc": "0x005AE8",
          "regs": {
            "af": "0x0054",
            "bc": "0xFF0405",
            "de": "0xD40000",
            "hl": "0xD54434",
            "ix": "0xD005BA",
            "sp": "0xD1A819",
            "flags": {
              "z": true,
              "c": false,
              "n": false
            }
          },
          "ram": {
            "D00596": "0x12",
            "D005A0": "0x81",
            "D02A73": "0x00",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
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
          "recentBlocks": [
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8"
          ]
        },
        {
          "name": "displayLoop005b16",
          "block": 20258,
          "pc": "0x005B16",
          "regs": {
            "af": "0x0054",
            "bc": "0xFF0500",
            "de": "0x0000FF",
            "hl": "0xD54434",
            "ix": "0xD005BA",
            "sp": "0xD1A816",
            "flags": {
              "z": true,
              "c": false,
              "n": false
            }
          },
          "ram": {
            "D00596": "0x12",
            "D005A0": "0x81",
            "D02A73": "0x00",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
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
          "recentBlocks": [
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16"
          ]
        },
        {
          "name": "displayLoop005b4b",
          "block": 20259,
          "pc": "0x005B4B",
          "regs": {
            "af": "0x007C",
            "bc": "0xFF0500",
            "de": "0x0000FF",
            "hl": "0xD5443E",
            "ix": "0xD005BB",
            "sp": "0xD1A816",
            "flags": {
              "z": true,
              "c": false,
              "n": false
            }
          },
          "ram": {
            "D00596": "0x12",
            "D005A0": "0x81",
            "D02A73": "0x00",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
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
          "recentBlocks": [
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B"
          ]
        },
        {
          "name": "displayLoop005ab6",
          "block": 20260,
          "pc": "0x005AB6",
          "regs": {
            "af": "0xFF02",
            "bc": "0xFF0305",
            "de": "0x0000FF",
            "hl": "0xD005A0",
            "ix": "0xD005BB",
            "sp": "0xD1A819",
            "flags": {
              "z": false,
              "c": false,
              "n": true
            }
          },
          "ram": {
            "D00596": "0x12",
            "D005A0": "0x82",
            "D02A73": "0x00",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
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
          "recentBlocks": [
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6"
          ]
        },
        {
          "name": "displayLoop005ae8",
          "block": 20261,
          "pc": "0x005AE8",
          "regs": {
            "af": "0x0054",
            "bc": "0xFF0305",
            "de": "0xD40000",
            "hl": "0xD546B4",
            "ix": "0xD005BC",
            "sp": "0xD1A819",
            "flags": {
              "z": true,
              "c": false,
              "n": false
            }
          },
          "ram": {
            "D00596": "0x12",
            "D005A0": "0x82",
            "D02A73": "0x00",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
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
          "recentBlocks": [
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8"
          ]
        },
        {
          "name": "displayLoop005b16",
          "block": 20262,
          "pc": "0x005B16",
          "regs": {
            "af": "0x0054",
            "bc": "0xFF0500",
            "de": "0x0000FF",
            "hl": "0xD546B4",
            "ix": "0xD005BC",
            "sp": "0xD1A816",
            "flags": {
              "z": true,
              "c": false,
              "n": false
            }
          },
          "ram": {
            "D00596": "0x12",
            "D005A0": "0x82",
            "D02A73": "0x00",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
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
          "recentBlocks": [
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16"
          ]
        },
        {
          "name": "displayLoop005b4b",
          "block": 20263,
          "pc": "0x005B4B",
          "regs": {
            "af": "0x007C",
            "bc": "0xFF0500",
            "de": "0x0000FF",
            "hl": "0xD546BE",
            "ix": "0xD005BD",
            "sp": "0xD1A816",
            "flags": {
              "z": true,
              "c": false,
              "n": false
            }
          },
          "ram": {
            "D00596": "0x12",
            "D005A0": "0x82",
            "D02A73": "0x00",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
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
          "recentBlocks": [
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B"
          ]
        },
        {
          "name": "displayLoop005ab6",
          "block": 20264,
          "pc": "0x005AB6",
          "regs": {
            "af": "0xFF02",
            "bc": "0xFF0205",
            "de": "0x0000FF",
            "hl": "0xD005A0",
            "ix": "0xD005BD",
            "sp": "0xD1A819",
            "flags": {
              "z": false,
              "c": false,
              "n": true
            }
          },
          "ram": {
            "D00596": "0x12",
            "D005A0": "0x83",
            "D02A73": "0x00",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
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
          "recentBlocks": [
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6"
          ]
        },
        {
          "name": "displayLoop005ae8",
          "block": 20265,
          "pc": "0x005AE8",
          "regs": {
            "af": "0x0054",
            "bc": "0xFF0205",
            "de": "0xD40000",
            "hl": "0xD54934",
            "ix": "0xD005BE",
            "sp": "0xD1A819",
            "flags": {
              "z": true,
              "c": false,
              "n": false
            }
          },
          "ram": {
            "D00596": "0x12",
            "D005A0": "0x83",
            "D02A73": "0x00",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
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
          "recentBlocks": [
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8"
          ]
        },
        {
          "name": "displayLoop005b16",
          "block": 20266,
          "pc": "0x005B16",
          "regs": {
            "af": "0x0054",
            "bc": "0xFF0500",
            "de": "0x0000FF",
            "hl": "0xD54934",
            "ix": "0xD005BE",
            "sp": "0xD1A816",
            "flags": {
              "z": true,
              "c": false,
              "n": false
            }
          },
          "ram": {
            "D00596": "0x12",
            "D005A0": "0x83",
            "D02A73": "0x00",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
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
          "recentBlocks": [
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16"
          ]
        },
        {
          "name": "displayLoop005b4b",
          "block": 20267,
          "pc": "0x005B4B",
          "regs": {
            "af": "0x007C",
            "bc": "0xFF0500",
            "de": "0x0000FF",
            "hl": "0xD5493E",
            "ix": "0xD005BF",
            "sp": "0xD1A816",
            "flags": {
              "z": true,
              "c": false,
              "n": false
            }
          },
          "ram": {
            "D00596": "0x12",
            "D005A0": "0x83",
            "D02A73": "0x00",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
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
          "recentBlocks": [
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B"
          ]
        },
        {
          "name": "displayLoop005ab6",
          "block": 20268,
          "pc": "0x005AB6",
          "regs": {
            "af": "0xFF02",
            "bc": "0xFF0105",
            "de": "0x0000FF",
            "hl": "0xD005A0",
            "ix": "0xD005BF",
            "sp": "0xD1A819",
            "flags": {
              "z": false,
              "c": false,
              "n": true
            }
          },
          "ram": {
            "D00596": "0x12",
            "D005A0": "0x84",
            "D02A73": "0x00",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
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
          "recentBlocks": [
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6"
          ]
        },
        {
          "name": "displayLoop005ae8",
          "block": 20269,
          "pc": "0x005AE8",
          "regs": {
            "af": "0x0054",
            "bc": "0xFF0105",
            "de": "0xD40000",
            "hl": "0xD54BB4",
            "ix": "0xD005C0",
            "sp": "0xD1A819",
            "flags": {
              "z": true,
              "c": false,
              "n": false
            }
          },
          "ram": {
            "D00596": "0x12",
            "D005A0": "0x84",
            "D02A73": "0x00",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
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
          "recentBlocks": [
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8"
          ]
        },
        {
          "name": "displayLoop005b16",
          "block": 20270,
          "pc": "0x005B16",
          "regs": {
            "af": "0x0054",
            "bc": "0xFF0500",
            "de": "0x0000FF",
            "hl": "0xD54BB4",
            "ix": "0xD005C0",
            "sp": "0xD1A816",
            "flags": {
              "z": true,
              "c": false,
              "n": false
            }
          },
          "ram": {
            "D00596": "0x12",
            "D005A0": "0x84",
            "D02A73": "0x00",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
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
          "recentBlocks": [
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16"
          ]
        },
        {
          "name": "displayLoop005b4b",
          "block": 20271,
          "pc": "0x005B4B",
          "regs": {
            "af": "0x007C",
            "bc": "0xFF0500",
            "de": "0x0000FF",
            "hl": "0xD54BBE",
            "ix": "0xD005C1",
            "sp": "0xD1A816",
            "flags": {
              "z": true,
              "c": false,
              "n": false
            }
          },
          "ram": {
            "D00596": "0x12",
            "D005A0": "0x84",
            "D02A73": "0x00",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
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
          "recentBlocks": [
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B",
            "0x005AB6",
            "0x005AE8",
            "0x005B16",
            "0x005B4B"
          ]
        },
        {
          "name": "displayCaller005b92",
          "block": 20272,
          "pc": "0x005B92",
          "regs": {
            "af": "0xFF42",
            "bc": "0xFF0005",
            "de": "0x0000FF",
            "hl": "0xD005A0",
            "ix": "0xD005C1",
            "sp": "0xD1A819",
            "flags": {
              "z": true,
              "c": false,
              "n": true
            }
          },
          "ram": {
            "D00596": "0x12",
            "D005A0": "0x85",
            "D02A73": "0x00",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
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
          "recentBlocks": [
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
      ]
    }
  ]
}
```

## Static Scheduler/Display Snippets

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

### 0x013D11

```text
0x013D11  fd cb 05 9e      res 3, (iy+5)
0x013D15  3e 20            ld a, 0x20
0x013D17  06 0e            ld b, 0x0e
0x013D19  cd c6 59 00      call 0x0059c6
```

Exits: `[{"type":"call","target":22982,"targetMode":"adl"},{"type":"call-return","target":81181,"targetMode":"adl"}]`

### 0x00596E

```text
0x00596E  f5               push af
0x00596F  e5               push hl
0x005970  cd 13 17 00      call 0x001713
```

Exits: `[{"type":"call","target":5907,"targetMode":"adl"},{"type":"call-return","target":22900,"targetMode":"adl"}]`

### 0x005974

```text
0x005974  e1               pop hl
0x005975  20 21            jr nz, 0x005998
```

Exits: `[{"type":"branch","condition":"nz","target":22936,"targetMode":"adl"},{"type":"fallthrough","target":22903,"targetMode":"adl"}]`

### 0x005998

```text
0x005998  f1               pop af
0x005999  eb               ex de, hl
0x00599A  21 00 00 00      ld hl, 0x000000
0x00599E  22 a1 05 d0      ld (0xd005a1), hl
0x0059A2  22 a3 05 d0      ld (0xd005a3), hl
0x0059A6  21 6e 3d 00      ld hl, 0x003d6e
0x0059AA  19               add hl, de
0x0059AB  11 a5 05 d0      ld de, 0xd005a5
0x0059AF  01 1c 00 00      ld bc, 0x00001c
0x0059B3  ed b0            ldir
0x0059B5  21 a1 05 d0      ld hl, 0xd005a1
0x0059B9  ed a0            ldi
0x0059BB  ed a0            ldi
0x0059BD  ed a0            ldi
0x0059BF  ed a0            ldi
0x0059C1  21 a1 05 d0      ld hl, 0xd005a1
0x0059C5  c9               ret
```

Exits: `[{"type":"return"}]`

### 0x0059C6

```text
0x0059C6  f5               push af
0x0059C7  e5               push hl
0x0059C8  fe d6            cp 0xd6
0x0059CA  20 0a            jr nz, 0x0059d6
```

Exits: `[{"type":"branch","condition":"nz","target":22998,"targetMode":"adl"},{"type":"fallthrough","target":22988,"targetMode":"adl"}]`

### 0x0059DA

```text
0x0059DA  21 96 05 d0      ld hl, 0xd00596
0x0059DE  34               inc (hl)
0x0059DF  7e               ld a, (hl)
0x0059E0  fe 1a            cp 0x1a
0x0059E2  d4 02 5a 00      call nc, 0x005a02
```

Exits: `[{"type":"call","target":23042,"targetMode":"adl"},{"type":"call-return","target":23014,"targetMode":"adl"}]`

### 0x0059E6

```text
0x0059E6  e1               pop hl
0x0059E7  f1               pop af
0x0059E8  c9               ret
```

Exits: `[{"type":"return"}]`

### 0x005A02

```text
0x005A02  f5               push af
0x005A03  c5               push bc
0x005A04  d5               push de
0x005A05  e5               push hl
0x005A06  dd e5            push ix
0x005A08  97               sub a
0x005A09  32 96 05 d0      ld (0xd00596), a
0x005A0D  21 95 05 d0      ld hl, 0xd00595
0x005A11  7e               ld a, (hl)
0x005A12  3c               inc a
0x005A13  fe 0a            cp 0x0a
0x005A15  38 01            jr c, 0x005a18
```

Exits: `[{"type":"branch","condition":"c","target":23064,"targetMode":"adl"},{"type":"fallthrough","target":23063,"targetMode":"adl"}]`

### 0x005A19

```text
0x005A19  dd e1            pop ix
0x005A1B  e1               pop hl
0x005A1C  d1               pop de
0x005A1D  c1               pop bc
0x005A1E  f1               pop af
0x005A1F  c9               ret
```

Exits: `[{"type":"return"}]`

### 0x005A48

```text
0x005A48  87               add a, a
0x005A49  c5               push bc
0x005A4A  47               ld b, a
0x005A4B  87               add a, a
0x005A4C  87               add a, a
0x005A4D  80               add a, b
0x005A4E  87               add a, a
0x005A4F  c6 25            add a, 0x25
0x005A51  c1               pop bc
0x005A52  c9               ret
```

Exits: `[{"type":"return"}]`

### 0x005A53

```text
0x005A53  21 00 00 00      ld hl, 0x000000
0x005A57  87               add a, a
0x005A58  87               add a, a
0x005A59  6f               ld l, a
0x005A5A  87               add a, a
0x005A5B  c6 02            add a, 0x02
0x005A5D  85               add a, l
0x005A5E  6f               ld l, a
0x005A5F  d0               ret nc
```

Exits: `[{"type":"return-conditional","condition":"nc"},{"type":"fallthrough","target":23136,"targetMode":"adl"}]`

### 0x005A75

```text
0x005A75  f3               di
0x005A76  f5               push af
0x005A77  c5               push bc
0x005A78  d5               push de
0x005A79  e5               push hl
0x005A7A  dd e5            push ix
0x005A7C  fe fa            cp 0xfa
0x005A7E  38 02            jr c, 0x005a82
```

Exits: `[{"type":"branch","condition":"c","target":23170,"targetMode":"adl"},{"type":"fallthrough","target":23168,"targetMode":"adl"}]`

### 0x005A82

```text
0x005A82  6f               ld l, a
0x005A83  26 1c            ld h, 0x1c
0x005A85  ed 6c            mlt hl
0x005A87  cd 6e 59 00      call 0x00596e
```

Exits: `[{"type":"call","target":22894,"targetMode":"adl"},{"type":"call-return","target":23179,"targetMode":"adl"}]`

### 0x005A8B

```text
0x005A8B  e5               push hl
0x005A8C  dd e1            pop ix
0x005A8E  3a 95 05 d0      ld a, (0xd00595)
0x005A92  cd 48 5a 00      call 0x005a48
```

Exits: `[{"type":"call","target":23112,"targetMode":"adl"},{"type":"call-return","target":23190,"targetMode":"adl"}]`

### 0x005A96

```text
0x005A96  32 a0 05 d0      ld (0xd005a0), a
0x005A9A  3a 96 05 d0      ld a, (0xd00596)
0x005A9E  cd 53 5a 00      call 0x005a53
```

Exits: `[{"type":"call","target":23123,"targetMode":"adl"},{"type":"call-return","target":23202,"targetMode":"adl"}]`

### 0x005AA2

```text
0x005AA2  1e 0c            ld e, 0x0c
0x005AA4  fd cb 05 5e      bit 3, (iy+5)
0x005AA8  28 04            jr z, 0x005aae
```

Exits: `[{"type":"branch","condition":"z","target":23214,"targetMode":"adl"},{"type":"fallthrough","target":23210,"targetMode":"adl"}]`

### 0x005AAE

```text
0x005AAE  16 00            ld d, 0x00
0x005AB0  40 22 9c 05      ld (0x00059c), hl
0x005AB4  06 10            ld b, 0x10
0x005AB6  11 00 00 00      ld de, 0x000000
0x005ABA  3a a0 05 d0      ld a, (0xd005a0)
0x005ABE  67               ld h, a
0x005ABF  2e a0            ld l, 0xa0
0x005AC1  ed 6c            mlt hl
0x005AC3  29               add hl, hl
0x005AC4  29               add hl, hl
0x005AC5  40 ed 5b 9c 05   ld de, (0x00059c)
0x005ACA  19               add hl, de
0x005ACB  19               add hl, de
0x005ACC  11 00 00 d4      ld de, 0xd40000
0x005AD0  19               add hl, de
0x005AD1  dd 7e 00         ld a, (ix+0)
0x005AD4  dd 23            inc ix
0x005AD6  fd cb 05 5e      bit 3, (iy+5)
0x005ADA  ca e8 5a 00      jp z, 0x005ae8
```

Exits: `[{"type":"branch","condition":"z","target":23272,"targetMode":"adl"},{"type":"fallthrough","target":23262,"targetMode":"adl"}]`

### 0x005AB6

```text
0x005AB6  11 00 00 00      ld de, 0x000000
0x005ABA  3a a0 05 d0      ld a, (0xd005a0)
0x005ABE  67               ld h, a
0x005ABF  2e a0            ld l, 0xa0
0x005AC1  ed 6c            mlt hl
0x005AC3  29               add hl, hl
0x005AC4  29               add hl, hl
0x005AC5  40 ed 5b 9c 05   ld de, (0x00059c)
0x005ACA  19               add hl, de
0x005ACB  19               add hl, de
0x005ACC  11 00 00 d4      ld de, 0xd40000
0x005AD0  19               add hl, de
0x005AD1  dd 7e 00         ld a, (ix+0)
0x005AD4  dd 23            inc ix
0x005AD6  fd cb 05 5e      bit 3, (iy+5)
0x005ADA  ca e8 5a 00      jp z, 0x005ae8
```

Exits: `[{"type":"branch","condition":"z","target":23272,"targetMode":"adl"},{"type":"fallthrough","target":23262,"targetMode":"adl"}]`

### 0x005AE8

```text
0x005AE8  0e 05            ld c, 0x05
0x005AEA  32 73 2a d0      ld (0xd02a73), a
0x005AEE  c5               push bc
0x005AEF  79               ld a, c
0x005AF0  32 75 2a d0      ld (0xd02a75), a
0x005AF4  c1               pop bc
0x005AF5  c5               push bc
0x005AF6  3a 73 2a d0      ld a, (0xd02a73)
0x005AFA  41               ld b, c
0x005AFB  4f               ld c, a
0x005AFC  11 ff 00 00      ld de, 0x0000ff
0x005B00  cb 48            bit 1, b
0x005B02  ca 16 5b 00      jp z, 0x005b16
```

Exits: `[{"type":"branch","condition":"z","target":23318,"targetMode":"adl"},{"type":"fallthrough","target":23302,"targetMode":"adl"}]`

### 0x005B16

```text
0x005B16  7b               ld a, e
0x005B17  cb 21            sla c
0x005B19  8a               adc a, d
0x005B1A  77               ld (hl), a
0x005B1B  23               inc hl
0x005B1C  77               ld (hl), a
0x005B1D  23               inc hl
0x005B1E  7b               ld a, e
0x005B1F  cb 21            sla c
0x005B21  8a               adc a, d
0x005B22  77               ld (hl), a
0x005B23  23               inc hl
0x005B24  77               ld (hl), a
0x005B25  23               inc hl
0x005B26  7b               ld a, e
0x005B27  cb 21            sla c
0x005B29  8a               adc a, d
0x005B2A  77               ld (hl), a
0x005B2B  23               inc hl
0x005B2C  77               ld (hl), a
0x005B2D  23               inc hl
0x005B2E  7b               ld a, e
0x005B2F  cb 21            sla c
0x005B31  8a               adc a, d
0x005B32  77               ld (hl), a
0x005B33  23               inc hl
0x005B34  77               ld (hl), a
0x005B35  23               inc hl
0x005B36  7b               ld a, e
0x005B37  cb 21            sla c
0x005B39  8a               adc a, d
0x005B3A  77               ld (hl), a
0x005B3B  23               inc hl
0x005B3C  77               ld (hl), a
0x005B3D  23               inc hl
0x005B3E  dd 7e 00         ld a, (ix+0)
0x005B41  dd 23            inc ix
0x005B43  fd cb 05 5e      bit 3, (iy+5)
0x005B47  28 02            jr z, 0x005b4b
```

Exits: `[{"type":"branch","condition":"z","target":23371,"targetMode":"adl"},{"type":"fallthrough","target":23369,"targetMode":"adl"}]`

### 0x005B4B

```text
0x005B4B  4f               ld c, a
0x005B4C  11 ff 00 00      ld de, 0x0000ff
0x005B50  7b               ld a, e
0x005B51  cb 21            sla c
0x005B53  8a               adc a, d
0x005B54  77               ld (hl), a
0x005B55  23               inc hl
0x005B56  77               ld (hl), a
0x005B57  23               inc hl
0x005B58  7b               ld a, e
0x005B59  cb 21            sla c
0x005B5B  8a               adc a, d
0x005B5C  77               ld (hl), a
0x005B5D  23               inc hl
0x005B5E  77               ld (hl), a
0x005B5F  23               inc hl
0x005B60  7b               ld a, e
0x005B61  cb 21            sla c
0x005B63  8a               adc a, d
0x005B64  77               ld (hl), a
0x005B65  23               inc hl
0x005B66  77               ld (hl), a
0x005B67  23               inc hl
0x005B68  7b               ld a, e
0x005B69  cb 21            sla c
0x005B6B  8a               adc a, d
0x005B6C  77               ld (hl), a
0x005B6D  23               inc hl
0x005B6E  77               ld (hl), a
0x005B6F  23               inc hl
0x005B70  7b               ld a, e
0x005B71  cb 21            sla c
0x005B73  8a               adc a, d
0x005B74  77               ld (hl), a
0x005B75  23               inc hl
0x005B76  77               ld (hl), a
0x005B77  23               inc hl
0x005B78  7b               ld a, e
0x005B79  cb 21            sla c
0x005B7B  8a               adc a, d
0x005B7C  77               ld (hl), a
0x005B7D  23               inc hl
0x005B7E  77               ld (hl), a
0x005B7F  23               inc hl
0x005B80  7b               ld a, e
0x005B81  cb 21            sla c
0x005B83  8a               adc a, d
0x005B84  77               ld (hl), a
0x005B85  23               inc hl
0x005B86  77               ld (hl), a
0x005B87  c1               pop bc
0x005B88  21 a0 05 d0      ld hl, 0xd005a0
0x005B8C  34               inc (hl)
0x005B8D  05               dec b
0x005B8E  c2 b6 5a 00      jp nz, 0x005ab6
```

Exits: `[{"type":"branch","condition":"nz","target":23222,"targetMode":"adl"},{"type":"fallthrough","target":23442,"targetMode":"adl"}]`

### 0x005B92

```text
0x005B92  c3 19 5a 00      jp 0x005a19
```

Exits: `[{"type":"jump","target":23065,"targetMode":"adl"}]`

### 0x005A19

```text
0x005A19  dd e1            pop ix
0x005A1B  e1               pop hl
0x005A1C  d1               pop de
0x005A1D  c1               pop bc
0x005A1E  f1               pop af
0x005A1F  c9               ret
```

Exits: `[{"type":"return"}]`

### 0x0059DA

```text
0x0059DA  21 96 05 d0      ld hl, 0xd00596
0x0059DE  34               inc (hl)
0x0059DF  7e               ld a, (hl)
0x0059E0  fe 1a            cp 0x1a
0x0059E2  d4 02 5a 00      call nc, 0x005a02
```

Exits: `[{"type":"call","target":23042,"targetMode":"adl"},{"type":"call-return","target":23014,"targetMode":"adl"}]`

### 0x0059E6

```text
0x0059E6  e1               pop hl
0x0059E7  f1               pop af
0x0059E8  c9               ret
```

Exits: `[{"type":"return"}]`

### 0x0017FC

```text
0x0017FC  f1               pop af
0x0017FD  c9               ret
```

Exits: `[{"type":"return"}]`

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

### 0x006CDF

```text
0x006CDF  21 40 00 00      ld hl, 0x000040
0x006CE3  dd 07 fa         ld bc, (ix+-6)
0x006CE6  b7               or a
0x006CE7  ed 42            sbc hl, bc
0x006CE9  dd 2f fd         ld (ix+-3), hl
0x006CEC  dd 07 09         ld bc, (ix+9)
0x006CEF  b7               or a
0x006CF0  ed 42            sbc hl, bc
0x006CF2  38 03            jr c, 0x006cf7
```

Exits: `[{"type":"branch","condition":"c","target":27895,"targetMode":"adl"},{"type":"fallthrough","target":27892,"targetMode":"adl"}]`

### 0x006D38

```text
0x006D38  b7               or a
0x006D39  ed 62            sbc hl, hl
0x006D3B  dd 2f fa         ld (ix+-6), hl
0x006D3E  3a 24 01 d0      ld a, (0xd00124)
0x006D42  01 00 20 00      ld bc, 0x002000
0x006D46  ed 79            out (c), a
0x006D48  f5               push af
0x006D49  78               ld a, b
0x006D4A  fe 20            cp 0x20
0x006D4C  28 01            jr z, 0x006d4f
```

Exits: `[{"type":"branch","condition":"z","target":27983,"targetMode":"adl"},{"type":"fallthrough","target":27982,"targetMode":"adl"}]`

### 0x006D5D

```text
0x006D5D  dd 27 09         ld hl, (ix+9)
0x006D60  cd c2 21 00      call 0x0021c2
```

Exits: `[{"type":"call","target":8642,"targetMode":"adl"},{"type":"call-return","target":28004,"targetMode":"adl"}]`

### 0x006D64

```text
0x006D64  c2 df 6c 00      jp nz, 0x006cdf
```

Exits: `[{"type":"branch","condition":"nz","target":27871,"targetMode":"adl"},{"type":"fallthrough","target":28008,"targetMode":"adl"}]`

### 0x0021C2

```text
0x0021C2  e5               push hl
0x0021C3  d5               push de
0x0021C4  11 00 00 00      ld de, 0x000000
0x0021C8  b7               or a
0x0021C9  ed 52            sbc hl, de
0x0021CB  d1               pop de
0x0021CC  e1               pop hl
0x0021CD  c9               ret
```

Exits: `[{"type":"return"}]`

### 0x000A92

```text
0x000A92  dd 56 f9         ld d, (ix-7)
0x000A95  dd 27 f5         ld hl, (ix+-11)
0x000A98  5e               ld e, (hl)
0x000A99  23               inc hl
0x000A9A  dd 2f f5         ld (ix+-11), hl
0x000A9D  ed 5c            mlt de
0x000A9F  dd 27 ec         ld hl, (ix+-20)
0x000AA2  19               add hl, de
0x000AA3  eb               ex de, hl
0x000AA4  dd 27 06         ld hl, (ix+6)
0x000AA7  23               inc hl
0x000AA8  23               inc hl
0x000AA9  dd 07 ef         ld bc, (ix+-17)
0x000AAC  09               add hl, bc
0x000AAD  03               inc bc
0x000AAE  dd 0f ef         ld (ix+-17), bc
0x000AB1  01 00 00 00      ld bc, 0x000000
0x000AB5  4e               ld c, (hl)
0x000AB6  eb               ex de, hl
0x000AB7  09               add hl, bc
0x000AB8  7d               ld a, l
0x000AB9  12               ld (de), a
0x000ABA  6c               ld l, h
0x000ABB  26 00            ld h, 0x00
0x000ABD  dd 2f ec         ld (ix+-20), hl
0x000AC0  dd 35 f8         dec (ix-8)
0x000AC3  20 cd            jr nz, 0x000a92
```

Exits: `[{"type":"branch","condition":"nz","target":2706,"targetMode":"adl"},{"type":"fallthrough","target":2757,"targetMode":"adl"}]`

### 0x000BFE

```text
0x000BFE  dd 5e e8         ld e, (ix-24)
0x000C01  dd 27 e5         ld hl, (ix+-27)
0x000C04  56               ld d, (hl)
0x000C05  23               inc hl
0x000C06  dd 2f e5         ld (ix+-27), hl
0x000C09  ed 5c            mlt de
0x000C0B  dd 27 d9         ld hl, (ix+-39)
0x000C0E  19               add hl, de
0x000C0F  dd 2f d9         ld (ix+-39), hl
0x000C12  11 00 00 00      ld de, 0x000000
0x000C16  dd 27 e2         ld hl, (ix+-30)
0x000C19  5e               ld e, (hl)
0x000C1A  21 00 00 00      ld hl, 0x000000
0x000C1E  dd 6e d9         ld l, (ix-39)
0x000C21  eb               ex de, hl
0x000C22  b7               or a
0x000C23  ed 52            sbc hl, de
0x000C25  dd 07 d6         ld bc, (ix+-42)
0x000C28  09               add hl, bc
0x000C29  7d               ld a, l
0x000C2A  6c               ld l, h
0x000C2B  dd 2f d6         ld (ix+-42), hl
0x000C2E  dd 27 e2         ld hl, (ix+-30)
0x000C31  77               ld (hl), a
0x000C32  23               inc hl
0x000C33  dd 2f e2         ld (ix+-30), hl
0x000C36  dd 27 d9         ld hl, (ix+-39)
0x000C39  6c               ld l, h
0x000C3A  26 00            ld h, 0x00
0x000C3C  dd 2f d9         ld (ix+-39), hl
0x000C3F  dd 27 d3         ld hl, (ix+-45)
0x000C42  2b               dec hl
0x000C43  dd 2f d3         ld (ix+-45), hl
0x000C46  7d               ld a, l
0x000C47  b4               or h
0x000C48  20 b4            jr nz, 0x000bfe
```

Exits: `[{"type":"branch","condition":"nz","target":3070,"targetMode":"adl"},{"type":"fallthrough","target":3146,"targetMode":"adl"}]`


## Dynamic Evidence

```json
[
  {
    "key": "EOL/CLEAR",
    "keyResult": {
      "steps": 57860,
      "termination": "after-low-frame-selection",
      "lastPc": "0x0064D0",
      "lastMode": "adl"
    },
    "counts": {
      "outerLoop08c331": 1,
      "cxMain0585e9": 2,
      "getCsc03fa09": 2,
      "eolClear0a2150": 1,
      "eolFill0a2156": 25,
      "bulkClear001879": 1,
      "bulkTail0018f8": 1,
      "scheduler000721": 1,
      "rendererScheduler013d00": 1,
      "rendererScheduler013d11": 1,
      "displayEntry00596e": 87,
      "displayPrep005998": 87,
      "displayCaller0059c6": 87,
      "displayAdvance0059da": 87,
      "displayReset005a02": 0,
      "displayReturn005a19": 87,
      "displayRow005a48": 87,
      "displayRow005a53": 152,
      "displayRow005a75": 87,
      "displayRow005a82": 87,
      "displayRow005a8b": 87,
      "displayRow005a96": 87,
      "displayRow005aa2": 87,
      "displayRow005aae": 87,
      "displayLoop005ab6": 1305,
      "displayLoop005ae8": 1392,
      "displayLoop005b16": 1392,
      "displayLoop005b4b": 1392,
      "displayCaller005b92": 87,
      "status005a19": 87,
      "status0059da": 87,
      "status0059e6": 87,
      "transfer006475": 1,
      "transfer00647d": 1,
      "transfer0064c7": 1,
      "lowCaller0017fc": 2,
      "lowSelect0064d0": 1,
      "lowFrame006cc6": 1,
      "lowLoop006cdf": 0,
      "lowPoll006d38": 0,
      "lowCall006d5d": 0,
      "lowBackedge006d64": 0,
      "hot000a92": 0,
      "hot000bfe": 0,
      "tokenExit08f5e1": 0,
      "tokenGate090992": 0,
      "eolTuple08f54b": 0
    },
    "firstHits": {
      "outerLoop08c331": 1,
      "displayRow005a53": 402,
      "cxMain0585e9": 1933,
      "eolClear0a2150": 20931,
      "eolFill0a2156": 20932,
      "getCsc03fa09": 32348,
      "bulkClear001879": 48553,
      "bulkTail0018f8": 48554,
      "scheduler000721": 50215,
      "rendererScheduler013d00": 50216,
      "rendererScheduler013d11": 50218,
      "displayCaller0059c6": 50219,
      "displayRow005a75": 50221,
      "displayRow005a82": 50222,
      "displayEntry00596e": 50223,
      "displayPrep005998": 50229,
      "displayRow005a8b": 50230,
      "displayRow005a48": 50231,
      "displayRow005a96": 50232,
      "displayRow005aa2": 50234,
      "displayRow005aae": 50235,
      "displayLoop005ae8": 50236,
      "displayLoop005b16": 50237,
      "displayLoop005b4b": 50238,
      "displayLoop005ab6": 50239,
      "displayCaller005b92": 50299,
      "displayReturn005a19": 50300,
      "status005a19": 50300,
      "displayAdvance0059da": 50301,
      "status0059da": 50301,
      "status0059e6": 50302,
      "transfer006475": 57636,
      "transfer00647d": 57647,
      "lowCaller0017fc": 57733,
      "transfer0064c7": 57772,
      "lowSelect0064d0": 57859,
      "lowFrame006cc6": 57860
    },
    "restorations": [
      {
        "label": "after-0x0A2150-LDIR",
        "atBlock": 20932,
        "atPc": "0x0A2156",
        "afterD007CA": "0x0585E9",
        "afterD008E0": "0xD1A863",
        "afterD02590": "0xD3FE81",
        "afterD00121": "0x000000",
        "afterD00124": "0x00"
      },
      {
        "label": "after-0x001879-bulk-clear",
        "atBlock": 48554,
        "atPc": "0x0018F8",
        "afterD007CA": "0x0585E9",
        "afterD008E0": "0xD1A863",
        "afterD02590": "0xD3FE81",
        "afterD00121": "0x000000",
        "afterD00124": "0x00"
      }
    ],
    "branchSamples": [
      {
        "name": "scheduler000721",
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
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000000",
          "D005A0": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
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
          "D02A73": "0x00",
          "D02A75": "0x00",
          "ixBytes": [
            "0xF3",
            "0xED",
            "0x7E",
            "0x5B",
            "0xC3",
            "0x58",
            "0x06",
            "0x00"
          ],
          "hlWord": "0xEDF3"
        },
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
          }
        ],
        "callStackTail": [],
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
          "0x001424",
          "0x0008BB",
          "0x001428",
          "0x00142C",
          "0x000721"
        ]
      },
      {
        "name": "rendererScheduler013d00",
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
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000000",
          "D005A0": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
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
          "D02A73": "0x00",
          "D02A75": "0x00",
          "ixBytes": [
            "0xF3",
            "0xED",
            "0x7E",
            "0x5B",
            "0xC3",
            "0x58",
            "0x06",
            "0x00"
          ],
          "hlWord": "0xEDF3"
        },
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
          }
        ],
        "callStackTail": [
          "0x000721"
        ],
        "recentBlocks": [
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
      {
        "name": "rendererScheduler013d11",
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
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000000",
          "D005A0": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
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
          "D02A73": "0x00",
          "D02A75": "0x00",
          "ixBytes": [
            "0xF3",
            "0xED",
            "0x7E",
            "0x5B",
            "0xC3",
            "0x58",
            "0x06",
            "0x00"
          ],
          "hlWord": "0xEDF3"
        },
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
          }
        ],
        "callStackTail": [
          "0x000721"
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
          "0x00142C",
          "0x000721",
          "0x013D00",
          "0x005BA6",
          "0x013D11"
        ]
      },
      {
        "name": "displayEntry00596e",
        "block": 50223,
        "pc": "0x00596E",
        "state": {
          "pc": "0x00596E",
          "sp": "0xD1A854",
          "ix": "0x000000",
          "iy": "0xD00080",
          "af": "0x2033",
          "bc": "0x000E5A",
          "de": "0xD65800",
          "hl": "0x000380",
          "flags": {
            "z": false,
            "c": true,
            "n": true
          },
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000000",
          "D005A0": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
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
          "D02A73": "0x00",
          "D02A75": "0x00",
          "ixBytes": [
            "0xF3",
            "0xED",
            "0x7E",
            "0x5B",
            "0xC3",
            "0x58",
            "0x06",
            "0x00"
          ],
          "hlWord": "0x85C3"
        },
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
        "stackTop": [
          {
            "addr": "0xD1A854",
            "value": "0x005A8B"
          },
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
          }
        ],
        "callStackTail": [
          "0x000721",
          "0x013D11",
          "0x0059C6",
          "0x0059D6",
          "0x005A75",
          "0x005A82"
        ],
        "recentBlocks": [
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
          "0x0059C6",
          "0x0059D6",
          "0x005A75",
          "0x005A82",
          "0x00596E"
        ]
      },
      {
        "name": "displayPrep005998",
        "block": 50229,
        "pc": "0x005998",
        "state": {
          "pc": "0x005998",
          "sp": "0xD1A851",
          "ix": "0x000000",
          "iy": "0xD00080",
          "af": "0x7F28",
          "bc": "0x00A55A",
          "de": "0xD65800",
          "hl": "0x000380",
          "flags": {
            "z": false,
            "c": false,
            "n": false
          },
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000000",
          "D005A0": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
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
          "D02A73": "0x00",
          "D02A75": "0x00",
          "ixBytes": [
            "0xF3",
            "0xED",
            "0x7E",
            "0x5B",
            "0xC3",
            "0x58",
            "0x06",
            "0x00"
          ],
          "hlWord": "0x85C3"
        },
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
        "stackTop": [
          {
            "addr": "0xD1A851",
            "value": "0x002033"
          },
          {
            "addr": "0xD1A854",
            "value": "0x005A8B"
          },
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
          }
        ],
        "callStackTail": [
          "0x000721",
          "0x013D11",
          "0x0059C6",
          "0x0059D6",
          "0x005A75"
        ],
        "recentBlocks": [
          "0x00142C",
          "0x000721",
          "0x013D00",
          "0x005BA6",
          "0x013D11",
          "0x0059C6",
          "0x0059D6",
          "0x005A75",
          "0x005A82",
          "0x00596E",
          "0x001713",
          "0x0008BB",
          "0x001717",
          "0x001718",
          "0x005974",
          "0x005998"
        ]
      },
      {
        "name": "displayCaller0059c6",
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
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000000",
          "D005A0": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
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
          "D02A73": "0x00",
          "D02A75": "0x00",
          "ixBytes": [
            "0xF3",
            "0xED",
            "0x7E",
            "0x5B",
            "0xC3",
            "0x58",
            "0x06",
            "0x00"
          ],
          "hlWord": "0xEDF3"
        },
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
          }
        ],
        "callStackTail": [
          "0x000721",
          "0x013D11"
        ],
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
          "0x000721",
          "0x013D00",
          "0x005BA6",
          "0x013D11",
          "0x0059C6"
        ]
      },
      {
        "name": "displayAdvance0059da",
        "block": 50301,
        "pc": "0x0059DA",
        "state": {
          "pc": "0x0059DA",
          "sp": "0xD1A869",
          "ix": "0x000000",
          "iy": "0xD00080",
          "af": "0x201B",
          "bc": "0x000E5A",
          "de": "0xD65800",
          "hl": "0x000000",
          "flags": {
            "z": false,
            "c": true,
            "n": true
          },
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000002",
          "D005A0": "0x35",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
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
          "D02A73": "0x00",
          "D02A75": "0x05",
          "ixBytes": [
            "0xF3",
            "0xED",
            "0x7E",
            "0x5B",
            "0xC3",
            "0x58",
            "0x06",
            "0x00"
          ],
          "hlWord": "0xEDF3"
        },
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
          }
        ],
        "callStackTail": [],
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
          "0x0059DA"
        ]
      },
      {
        "name": "displayReturn005a19",
        "block": 50300,
        "pc": "0x005A19",
        "state": {
          "pc": "0x005A19",
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
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000002",
          "D005A0": "0x35",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
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
          "D02A73": "0x00",
          "D02A75": "0x05",
          "ixBytes": [
            "0x00",
            "0x00",
            "0x00",
            "0x00",
            "0x00",
            "0x00",
            "0x00",
            "0x00"
          ],
          "hlWord": "0x0035"
        },
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
          }
        ],
        "callStackTail": [
          "0x000721",
          "0x013D11",
          "0x0059C6"
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
          "0x005A19"
        ]
      },
      {
        "name": "displayRow005a48",
        "block": 50231,
        "pc": "0x005A48",
        "state": {
          "pc": "0x005A48",
          "sp": "0xD1A854",
          "ix": "0xD005A1",
          "iy": "0xD00080",
          "af": "0x0024",
          "bc": "0xFFFFFC",
          "de": "0xD005C5",
          "hl": "0xD005A1",
          "flags": {
            "z": false,
            "c": false,
            "n": false
          },
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000000",
          "D005A0": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
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
          "D02A73": "0x00",
          "D02A75": "0x00",
          "ixBytes": [
            "0x00",
            "0x00",
            "0x00",
            "0x00",
            "0x00",
            "0x00",
            "0x00",
            "0x00"
          ],
          "hlWord": "0x0000"
        },
        "ixFrame": {
          "IX-45": "0x000000",
          "IX-42": "0x000000",
          "IX-39": "0x000000",
          "IX-30": "0x000000",
          "IX-27": "0x000000",
          "IX-24": "0x00",
          "IX-20": "0x950000",
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
        "stackTop": [
          {
            "addr": "0xD1A854",
            "value": "0x005A96"
          },
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
          }
        ],
        "callStackTail": [
          "0x000721",
          "0x013D11",
          "0x0059C6",
          "0x005A8B"
        ],
        "recentBlocks": [
          "0x013D00",
          "0x005BA6",
          "0x013D11",
          "0x0059C6",
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
          "0x005A48"
        ]
      },
      {
        "name": "displayRow005a53",
        "block": 402,
        "pc": "0x005A53",
        "state": {
          "pc": "0x005A53",
          "sp": "0xD1A83C",
          "ix": "0xD005A1",
          "iy": "0xD00080",
          "af": "0x0020",
          "bc": "0xFFFFFC",
          "de": "0xD45A00",
          "hl": "0xD3FD80",
          "flags": {
            "z": false,
            "c": false,
            "n": false
          },
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x0F",
          "D00596": "0x00",
          "D0059C": "0xD4202C",
          "D005A0": "0x00",
          "D0058C": "0x0F",
          "D0058D": "0x0F",
          "D0058E": "0x0F",
          "D00080": "0x08",
          "D00081": "0x04",
          "D0009F": "0x20",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0xD1A8A3",
          "D0243D": "0xD2A815",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
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
          "D02A73": "0x00",
          "D02A75": "0x00",
          "ixBytes": [
            "0x00",
            "0x00",
            "0x00",
            "0x00",
            "0xF8",
            "0xF8",
            "0xF8",
            "0xF8"
          ],
          "hlWord": "0x0000"
        },
        "ixFrame": {
          "IX-45": "0x000000",
          "IX-42": "0x000000",
          "IX-39": "0x000000",
          "IX-30": "0x000000",
          "IX-27": "0x000F00",
          "IX-24": "0x00",
          "IX-20": "0x950F0F",
          "IX-17": "0x000000",
          "IX-11": "0x000000",
          "IX-8": "0x00",
          "IX-7": "0x00",
          "IX-6": "0x202C00",
          "IX-3": "0x0000D4",
          "IX+0": "0x000000",
          "IX+3": "0xF8F800",
          "IX+6": "0xF8F8F8",
          "IX+9": "0xF8F8F8"
        },
        "stackTop": [
          {
            "addr": "0xD1A83C",
            "value": "0x0A17E9"
          },
          {
            "addr": "0xD1A83F",
            "value": "0xD1A860"
          },
          {
            "addr": "0xD1A842",
            "value": "0xD100A3"
          },
          {
            "addr": "0xD1A845",
            "value": "0xD2A815"
          },
          {
            "addr": "0xD1A848",
            "value": "0x00E000"
          }
        ],
        "callStackTail": [
          "0x0A17D0"
        ],
        "recentBlocks": [
          "0x0A2A37",
          "0x0A2389",
          "0x0A17AE",
          "0x0A17B2",
          "0x0A17B8",
          "0x07BF3E",
          "0x07BF4D",
          "0x07BF5C",
          "0x000380",
          "0x003D85",
          "0x07BF61",
          "0x0A17C5",
          "0x0A2D4C",
          "0x0A17D0",
          "0x00038C",
          "0x005A53"
        ]
      },
      {
        "name": "displayRow005a75",
        "block": 50221,
        "pc": "0x005A75",
        "state": {
          "pc": "0x005A75",
          "sp": "0xD1A866",
          "ix": "0x000000",
          "iy": "0xD00080",
          "af": "0x201B",
          "bc": "0x000E5A",
          "de": "0xD65800",
          "hl": "0x000000",
          "flags": {
            "z": false,
            "c": true,
            "n": true
          },
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000000",
          "D005A0": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
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
          "D02A73": "0x00",
          "D02A75": "0x00",
          "ixBytes": [
            "0xF3",
            "0xED",
            "0x7E",
            "0x5B",
            "0xC3",
            "0x58",
            "0x06",
            "0x00"
          ],
          "hlWord": "0xEDF3"
        },
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
        "stackTop": [
          {
            "addr": "0xD1A866",
            "value": "0x0059DA"
          },
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
          }
        ],
        "callStackTail": [
          "0x000721",
          "0x013D11",
          "0x0059C6",
          "0x0059D6"
        ],
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
          "0x005BA6",
          "0x013D11",
          "0x0059C6",
          "0x0059D6",
          "0x005A75"
        ]
      },
      {
        "name": "displayRow005a82",
        "block": 50222,
        "pc": "0x005A82",
        "state": {
          "pc": "0x005A82",
          "sp": "0xD1A857",
          "ix": "0x000000",
          "iy": "0xD00080",
          "af": "0x2033",
          "bc": "0x000E5A",
          "de": "0xD65800",
          "hl": "0x000000",
          "flags": {
            "z": false,
            "c": true,
            "n": true
          },
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000000",
          "D005A0": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
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
          "D02A73": "0x00",
          "D02A75": "0x00",
          "ixBytes": [
            "0xF3",
            "0xED",
            "0x7E",
            "0x5B",
            "0xC3",
            "0x58",
            "0x06",
            "0x00"
          ],
          "hlWord": "0xEDF3"
        },
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
          }
        ],
        "callStackTail": [
          "0x000721",
          "0x013D11",
          "0x0059C6",
          "0x0059D6",
          "0x005A75"
        ],
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
          "0x013D11",
          "0x0059C6",
          "0x0059D6",
          "0x005A75",
          "0x005A82"
        ]
      },
      {
        "name": "displayRow005a8b",
        "block": 50230,
        "pc": "0x005A8B",
        "state": {
          "pc": "0x005A8B",
          "sp": "0xD1A857",
          "ix": "0x000000",
          "iy": "0xD00080",
          "af": "0x2024",
          "bc": "0xFFFFFC",
          "de": "0xD005C5",
          "hl": "0xD005A1",
          "flags": {
            "z": false,
            "c": false,
            "n": false
          },
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000000",
          "D005A0": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
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
          "D02A73": "0x00",
          "D02A75": "0x00",
          "ixBytes": [
            "0xF3",
            "0xED",
            "0x7E",
            "0x5B",
            "0xC3",
            "0x58",
            "0x06",
            "0x00"
          ],
          "hlWord": "0x0000"
        },
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
          }
        ],
        "callStackTail": [
          "0x000721",
          "0x013D11",
          "0x0059C6"
        ],
        "recentBlocks": [
          "0x000721",
          "0x013D00",
          "0x005BA6",
          "0x013D11",
          "0x0059C6",
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
          "0x005A8B"
        ]
      },
      {
        "name": "displayRow005a96",
        "block": 50232,
        "pc": "0x005A96",
        "state": {
          "pc": "0x005A96",
          "sp": "0xD1A857",
          "ix": "0xD005A1",
          "iy": "0xD00080",
          "af": "0x2520",
          "bc": "0xFFFFFC",
          "de": "0xD005C5",
          "hl": "0xD005A1",
          "flags": {
            "z": false,
            "c": false,
            "n": false
          },
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000000",
          "D005A0": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
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
          "D02A73": "0x00",
          "D02A75": "0x00",
          "ixBytes": [
            "0x00",
            "0x00",
            "0x00",
            "0x00",
            "0x00",
            "0x00",
            "0x00",
            "0x00"
          ],
          "hlWord": "0x0000"
        },
        "ixFrame": {
          "IX-45": "0x000000",
          "IX-42": "0x000000",
          "IX-39": "0x000000",
          "IX-30": "0x000000",
          "IX-27": "0x000000",
          "IX-24": "0x00",
          "IX-20": "0x950000",
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
          }
        ],
        "callStackTail": [
          "0x000721",
          "0x013D11",
          "0x0059C6"
        ],
        "recentBlocks": [
          "0x005BA6",
          "0x013D11",
          "0x0059C6",
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
          "0x005A96"
        ]
      },
      {
        "name": "displayRow005aa2",
        "block": 50234,
        "pc": "0x005AA2",
        "state": {
          "pc": "0x005AA2",
          "sp": "0xD1A857",
          "ix": "0xD005A1",
          "iy": "0xD00080",
          "af": "0x0200",
          "bc": "0xFFFFFC",
          "de": "0xD005C5",
          "hl": "0x000002",
          "flags": {
            "z": false,
            "c": false,
            "n": false
          },
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000000",
          "D005A0": "0x25",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 0
        },
        "memory": {
          "low0059c": "0x095CC3",
          "low005a0": "0x06F3C3",
          "D00596": "0x00",
          "D0059C": "0x000000",
          "D005A0": "0x25",
          "D005A1": "0x00",
          "D005A2": "0x00",
          "D02A73": "0x00",
          "D02A75": "0x00",
          "ixBytes": [
            "0x00",
            "0x00",
            "0x00",
            "0x00",
            "0x00",
            "0x00",
            "0x00",
            "0x00"
          ],
          "hlWord": "0x5B7E"
        },
        "ixFrame": {
          "IX-45": "0x000000",
          "IX-42": "0x000000",
          "IX-39": "0x000000",
          "IX-30": "0x000000",
          "IX-27": "0x000000",
          "IX-24": "0x00",
          "IX-20": "0x950000",
          "IX-17": "0x000000",
          "IX-11": "0x000000",
          "IX-8": "0x00",
          "IX-7": "0x00",
          "IX-6": "0x000000",
          "IX-3": "0x250000",
          "IX+0": "0x000000",
          "IX+3": "0x000000",
          "IX+6": "0x000000",
          "IX+9": "0x000000"
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
          }
        ],
        "callStackTail": [
          "0x000721",
          "0x013D11",
          "0x0059C6"
        ],
        "recentBlocks": [
          "0x0059C6",
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
          "0x005AA2"
        ]
      },
      {
        "name": "displayRow005aae",
        "block": 50235,
        "pc": "0x005AAE",
        "state": {
          "pc": "0x005AAE",
          "sp": "0xD1A857",
          "ix": "0xD005A1",
          "iy": "0xD00080",
          "af": "0x0254",
          "bc": "0xFFFFFC",
          "de": "0xD0050C",
          "hl": "0x000002",
          "flags": {
            "z": true,
            "c": false,
            "n": false
          },
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000000",
          "D005A0": "0x25",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 0
        },
        "memory": {
          "low0059c": "0x095CC3",
          "low005a0": "0x06F3C3",
          "D00596": "0x00",
          "D0059C": "0x000000",
          "D005A0": "0x25",
          "D005A1": "0x00",
          "D005A2": "0x00",
          "D02A73": "0x00",
          "D02A75": "0x00",
          "ixBytes": [
            "0x00",
            "0x00",
            "0x00",
            "0x00",
            "0x00",
            "0x00",
            "0x00",
            "0x00"
          ],
          "hlWord": "0x5B7E"
        },
        "ixFrame": {
          "IX-45": "0x000000",
          "IX-42": "0x000000",
          "IX-39": "0x000000",
          "IX-30": "0x000000",
          "IX-27": "0x000000",
          "IX-24": "0x00",
          "IX-20": "0x950000",
          "IX-17": "0x000000",
          "IX-11": "0x000000",
          "IX-8": "0x00",
          "IX-7": "0x00",
          "IX-6": "0x000000",
          "IX-3": "0x250000",
          "IX+0": "0x000000",
          "IX+3": "0x000000",
          "IX+6": "0x000000",
          "IX+9": "0x000000"
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
          }
        ],
        "callStackTail": [
          "0x000721",
          "0x013D11",
          "0x0059C6"
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
          "0x005AAE"
        ]
      },
      {
        "name": "displayLoop005ab6",
        "block": 50239,
        "pc": "0x005AB6",
        "state": {
          "pc": "0x005AB6",
          "sp": "0xD1A857",
          "ix": "0xD005A3",
          "iy": "0xD00080",
          "af": "0xFF1A",
          "bc": "0xFF0F05",
          "de": "0x0000FF",
          "hl": "0xD005A0",
          "flags": {
            "z": false,
            "c": false,
            "n": true
          },
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000002",
          "D005A0": "0x26",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 0
        },
        "memory": {
          "low0059c": "0x095CC3",
          "low005a0": "0x06F3C3",
          "D00596": "0x00",
          "D0059C": "0x000002",
          "D005A0": "0x26",
          "D005A1": "0x00",
          "D005A2": "0x00",
          "D02A73": "0x00",
          "D02A75": "0x05",
          "ixBytes": [
            "0x00",
            "0x00",
            "0x00",
            "0x00",
            "0x00",
            "0x00",
            "0x00",
            "0x00"
          ],
          "hlWord": "0x0026"
        },
        "ixFrame": {
          "IX-45": "0x000000",
          "IX-42": "0x000000",
          "IX-39": "0x000000",
          "IX-30": "0x000000",
          "IX-27": "0x000000",
          "IX-24": "0x00",
          "IX-20": "0x000095",
          "IX-17": "0x000000",
          "IX-11": "0x000000",
          "IX-8": "0x00",
          "IX-7": "0x02",
          "IX-6": "0x000000",
          "IX-3": "0x000026",
          "IX+0": "0x000000",
          "IX+3": "0x000000",
          "IX+6": "0x000000",
          "IX+9": "0x000000"
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
          }
        ],
        "callStackTail": [
          "0x000721",
          "0x013D11",
          "0x0059C6"
        ],
        "recentBlocks": [
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
        ]
      },
      {
        "name": "displayLoop005ae8",
        "block": 50236,
        "pc": "0x005AE8",
        "state": {
          "pc": "0x005AE8",
          "sp": "0xD1A857",
          "ix": "0xD005A2",
          "iy": "0xD00080",
          "af": "0x0054",
          "bc": "0xFF10FC",
          "de": "0xD40000",
          "hl": "0xD45C84",
          "flags": {
            "z": true,
            "c": false,
            "n": false
          },
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000002",
          "D005A0": "0x25",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 0
        },
        "memory": {
          "low0059c": "0x095CC3",
          "low005a0": "0x06F3C3",
          "D00596": "0x00",
          "D0059C": "0x000002",
          "D005A0": "0x25",
          "D005A1": "0x00",
          "D005A2": "0x00",
          "D02A73": "0x00",
          "D02A75": "0x00",
          "ixBytes": [
            "0x00",
            "0x00",
            "0x00",
            "0x00",
            "0x00",
            "0x00",
            "0x00",
            "0x00"
          ],
          "hlWord": "0xFFFF"
        },
        "ixFrame": {
          "IX-45": "0x000000",
          "IX-42": "0x000000",
          "IX-39": "0x000000",
          "IX-30": "0x000000",
          "IX-27": "0x000000",
          "IX-24": "0x00",
          "IX-20": "0x009500",
          "IX-17": "0x000000",
          "IX-11": "0x000000",
          "IX-8": "0x00",
          "IX-7": "0x00",
          "IX-6": "0x000002",
          "IX-3": "0x002500",
          "IX+0": "0x000000",
          "IX+3": "0x000000",
          "IX+6": "0x000000",
          "IX+9": "0x000000"
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
          }
        ],
        "callStackTail": [
          "0x000721",
          "0x013D11",
          "0x0059C6"
        ],
        "recentBlocks": [
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
          "0x005AE8"
        ]
      },
      {
        "name": "displayLoop005b16",
        "block": 50237,
        "pc": "0x005B16",
        "state": {
          "pc": "0x005B16",
          "sp": "0xD1A854",
          "ix": "0xD005A2",
          "iy": "0xD00080",
          "af": "0x0054",
          "bc": "0xFF0500",
          "de": "0x0000FF",
          "hl": "0xD45C84",
          "flags": {
            "z": true,
            "c": false,
            "n": false
          },
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000002",
          "D005A0": "0x25",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 0
        },
        "memory": {
          "low0059c": "0x095CC3",
          "low005a0": "0x06F3C3",
          "D00596": "0x00",
          "D0059C": "0x000002",
          "D005A0": "0x25",
          "D005A1": "0x00",
          "D005A2": "0x00",
          "D02A73": "0x00",
          "D02A75": "0x05",
          "ixBytes": [
            "0x00",
            "0x00",
            "0x00",
            "0x00",
            "0x00",
            "0x00",
            "0x00",
            "0x00"
          ],
          "hlWord": "0xFFFF"
        },
        "ixFrame": {
          "IX-45": "0x000000",
          "IX-42": "0x000000",
          "IX-39": "0x000000",
          "IX-30": "0x000000",
          "IX-27": "0x000000",
          "IX-24": "0x00",
          "IX-20": "0x009500",
          "IX-17": "0x000000",
          "IX-11": "0x000000",
          "IX-8": "0x00",
          "IX-7": "0x00",
          "IX-6": "0x000002",
          "IX-3": "0x002500",
          "IX+0": "0x000000",
          "IX+3": "0x000000",
          "IX+6": "0x000000",
          "IX+9": "0x000000"
        },
        "stackTop": [
          {
            "addr": "0xD1A854",
            "value": "0xFF1005"
          },
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
          }
        ],
        "callStackTail": [
          "0x000721",
          "0x013D11",
          "0x0059C6",
          "0x005AE8"
        ],
        "recentBlocks": [
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
          "0x005B16"
        ]
      },
      {
        "name": "displayLoop005b4b",
        "block": 50238,
        "pc": "0x005B4B",
        "state": {
          "pc": "0x005B4B",
          "sp": "0xD1A854",
          "ix": "0xD005A3",
          "iy": "0xD00080",
          "af": "0x007C",
          "bc": "0xFF0500",
          "de": "0x0000FF",
          "hl": "0xD45C8E",
          "flags": {
            "z": true,
            "c": false,
            "n": false
          },
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000002",
          "D005A0": "0x25",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 0
        },
        "memory": {
          "low0059c": "0x095CC3",
          "low005a0": "0x06F3C3",
          "D00596": "0x00",
          "D0059C": "0x000002",
          "D005A0": "0x25",
          "D005A1": "0x00",
          "D005A2": "0x00",
          "D02A73": "0x00",
          "D02A75": "0x05",
          "ixBytes": [
            "0x00",
            "0x00",
            "0x00",
            "0x00",
            "0x00",
            "0x00",
            "0x00",
            "0x00"
          ],
          "hlWord": "0xFFFF"
        },
        "ixFrame": {
          "IX-45": "0x000000",
          "IX-42": "0x000000",
          "IX-39": "0x000000",
          "IX-30": "0x000000",
          "IX-27": "0x000000",
          "IX-24": "0x00",
          "IX-20": "0x000095",
          "IX-17": "0x000000",
          "IX-11": "0x000000",
          "IX-8": "0x00",
          "IX-7": "0x02",
          "IX-6": "0x000000",
          "IX-3": "0x000025",
          "IX+0": "0x000000",
          "IX+3": "0x000000",
          "IX+6": "0x000000",
          "IX+9": "0x000000"
        },
        "stackTop": [
          {
            "addr": "0xD1A854",
            "value": "0xFF1005"
          },
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
          }
        ],
        "callStackTail": [
          "0x000721",
          "0x013D11",
          "0x0059C6",
          "0x005AE8"
        ],
        "recentBlocks": [
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
          "0x005B4B"
        ]
      },
      {
        "name": "displayCaller005b92",
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
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000002",
          "D005A0": "0x35",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
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
          "D02A73": "0x00",
          "D02A75": "0x05",
          "ixBytes": [
            "0x00",
            "0x00",
            "0x00",
            "0x00",
            "0x00",
            "0x00",
            "0x00",
            "0x00"
          ],
          "hlWord": "0x0035"
        },
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
          }
        ],
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
          "0x005B92"
        ]
      },
      {
        "name": "status005a19",
        "block": 50300,
        "pc": "0x005A19",
        "state": {
          "pc": "0x005A19",
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
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000002",
          "D005A0": "0x35",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
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
          "D02A73": "0x00",
          "D02A75": "0x05",
          "ixBytes": [
            "0x00",
            "0x00",
            "0x00",
            "0x00",
            "0x00",
            "0x00",
            "0x00",
            "0x00"
          ],
          "hlWord": "0x0035"
        },
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
          }
        ],
        "callStackTail": [
          "0x000721",
          "0x013D11",
          "0x0059C6"
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
          "0x005A19"
        ]
      },
      {
        "name": "status0059da",
        "block": 50301,
        "pc": "0x0059DA",
        "state": {
          "pc": "0x0059DA",
          "sp": "0xD1A869",
          "ix": "0x000000",
          "iy": "0xD00080",
          "af": "0x201B",
          "bc": "0x000E5A",
          "de": "0xD65800",
          "hl": "0x000000",
          "flags": {
            "z": false,
            "c": true,
            "n": true
          },
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000002",
          "D005A0": "0x35",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
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
          "D02A73": "0x00",
          "D02A75": "0x05",
          "ixBytes": [
            "0xF3",
            "0xED",
            "0x7E",
            "0x5B",
            "0xC3",
            "0x58",
            "0x06",
            "0x00"
          ],
          "hlWord": "0xEDF3"
        },
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
          }
        ],
        "callStackTail": [],
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
          "0x0059DA"
        ]
      },
      {
        "name": "status0059e6",
        "block": 50302,
        "pc": "0x0059E6",
        "state": {
          "pc": "0x0059E6",
          "sp": "0xD1A869",
          "ix": "0x000000",
          "iy": "0xD00080",
          "af": "0x01B3",
          "bc": "0x000E5A",
          "de": "0xD65800",
          "hl": "0xD00596",
          "flags": {
            "z": false,
            "c": true,
            "n": true
          },
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x01",
          "D0059C": "0x000002",
          "D005A0": "0x35",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 0
        },
        "memory": {
          "low0059c": "0x095CC3",
          "low005a0": "0x06F3C3",
          "D00596": "0x01",
          "D0059C": "0x000002",
          "D005A0": "0x35",
          "D005A1": "0x00",
          "D005A2": "0x00",
          "D02A73": "0x00",
          "D02A75": "0x05",
          "ixBytes": [
            "0xF3",
            "0xED",
            "0x7E",
            "0x5B",
            "0xC3",
            "0x58",
            "0x06",
            "0x00"
          ],
          "hlWord": "0x0001"
        },
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
          }
        ],
        "callStackTail": [],
        "recentBlocks": [
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
          "0x0059E6"
        ]
      },
      {
        "name": "transfer006475",
        "block": 57636,
        "pc": "0x006475",
        "state": {
          "pc": "0x006475",
          "sp": "0xD1A83D",
          "ix": "0xD1A866",
          "iy": "0xD00080",
          "af": "0x0042",
          "bc": "0x000000",
          "de": "0x008000",
          "hl": "0x020001",
          "flags": {
            "z": true,
            "c": false,
            "n": true
          },
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x0A",
          "D0059C": "0x00006E",
          "D005A0": "0xD5",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
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
          "D02A73": "0x38",
          "D02A75": "0x05",
          "ixBytes": [
            "0x78",
            "0xA8",
            "0xD1",
            "0x68",
            "0x39",
            "0x01",
            "0x00",
            "0x00"
          ],
          "hlWord": "0x000F"
        },
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
          }
        ],
        "callStackTail": [
          "0x00072D",
          "0x0138F1"
        ],
        "recentBlocks": [
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
        "block": 57647,
        "pc": "0x00647D",
        "state": {
          "pc": "0x00647D",
          "sp": "0xD1A83D",
          "ix": "0xD1A866",
          "iy": "0xD00080",
          "af": "0x090C",
          "bc": "0x09D6B4",
          "de": "0x008000",
          "hl": "0x0BD6BA",
          "flags": {
            "z": false,
            "c": false,
            "n": false
          },
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x0A",
          "D0059C": "0x00006E",
          "D005A0": "0xD5",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
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
          "D02A73": "0x38",
          "D02A75": "0x05",
          "ixBytes": [
            "0x78",
            "0xA8",
            "0xD1",
            "0x68",
            "0x39",
            "0x01",
            "0x00",
            "0x00"
          ],
          "hlWord": "0x3E02"
        },
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
          }
        ],
        "callStackTail": [
          "0x00072D"
        ],
        "recentBlocks": [
          "0x01394E",
          "0x01395B",
          "0x006447",
          "0x00646C",
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
        "block": 57772,
        "pc": "0x0064C7",
        "state": {
          "pc": "0x0064C7",
          "sp": "0xD1A83D",
          "ix": "0xD1A866",
          "iy": "0xD00080",
          "af": "0x0A42",
          "bc": "0x002000",
          "de": "0x000240",
          "hl": "0x000000",
          "flags": {
            "z": true,
            "c": false,
            "n": true
          },
          "D00121": "0x000000",
          "D00124": "0x0A",
          "D00587": "0x00",
          "D00596": "0x13",
          "D0059C": "0x0000DA",
          "D005A0": "0x85",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
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
          "D02A73": "0x00",
          "D02A75": "0x05",
          "ixBytes": [
            "0x78",
            "0xA8",
            "0xD1",
            "0x68",
            "0x39",
            "0x01",
            "0x00",
            "0x00"
          ],
          "hlWord": "0xEDF3"
        },
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
          }
        ],
        "callStackTail": [],
        "recentBlocks": [
          "0x001C81",
          "0x001C82",
          "0x001C48",
          "0x001C33",
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
        "name": "lowCaller0017fc",
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
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x13",
          "D0059C": "0x0000DA",
          "D005A0": "0x85",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
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
          "D02A73": "0x00",
          "D02A75": "0x05",
          "ixBytes": [
            "0x78",
            "0xA8",
            "0xD1",
            "0x68",
            "0x39",
            "0x01",
            "0x00",
            "0x00"
          ],
          "hlWord": "0x2D2F"
        },
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
          }
        ],
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
          "0x005B92",
          "0x005A19",
          "0x0059DA",
          "0x0059E6",
          "0x0017FC"
        ]
      },
      {
        "name": "lowSelect0064d0",
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
          "D00121": "0x000000",
          "D00124": "0x0A",
          "D00587": "0x00",
          "D00596": "0x13",
          "D0059C": "0x0000DA",
          "D005A0": "0x85",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
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
          "D02A73": "0x00",
          "D02A75": "0x05",
          "ixBytes": [
            "0x78",
            "0xA8",
            "0xD1",
            "0x68",
            "0x39",
            "0x01",
            "0x00",
            "0x00"
          ],
          "hlWord": "0x5C2D"
        },
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
          }
        ],
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
          "0x005B92",
          "0x005A19",
          "0x0059DA",
          "0x0059E6",
          "0x0017FC",
          "0x0064D0"
        ]
      },
      {
        "name": "lowFrame006cc6",
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
          "D00121": "0x000000",
          "D00124": "0x0A",
          "D00587": "0x00",
          "D00596": "0x13",
          "D0059C": "0x0000DA",
          "D005A0": "0x85",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
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
          "D02A73": "0x00",
          "D02A75": "0x05",
          "ixBytes": [
            "0x78",
            "0xA8",
            "0xD1",
            "0x68",
            "0x39",
            "0x01",
            "0x00",
            "0x00"
          ],
          "hlWord": "0xEDF3"
        },
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
          }
        ],
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
    "branchOutcomes": [
      {
        "name": "scheduler000721",
        "targetPc": "0x000721",
        "beforeBlock": 50215,
        "afterBlock": 50216,
        "afterPc": "0x013D00",
        "before": {
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
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000000",
          "D005A0": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 0
        },
        "after": {
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
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000000",
          "D005A0": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 0
        }
      },
      {
        "name": "rendererScheduler013d00",
        "targetPc": "0x013D00",
        "beforeBlock": 50216,
        "afterBlock": 50217,
        "afterPc": "0x005BA6",
        "before": {
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
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000000",
          "D005A0": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 0
        },
        "after": {
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
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000000",
          "D005A0": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 0
        }
      },
      {
        "name": "rendererScheduler013d11",
        "targetPc": "0x013D11",
        "beforeBlock": 50218,
        "afterBlock": 50219,
        "afterPc": "0x0059C6",
        "before": {
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
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000000",
          "D005A0": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 0
        },
        "after": {
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
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000000",
          "D005A0": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 0
        }
      },
      {
        "name": "displayEntry00596e",
        "targetPc": "0x00596E",
        "beforeBlock": 50223,
        "afterBlock": 50224,
        "afterPc": "0x001713",
        "before": {
          "pc": "0x00596E",
          "sp": "0xD1A854",
          "ix": "0x000000",
          "iy": "0xD00080",
          "af": "0x2033",
          "bc": "0x000E5A",
          "de": "0xD65800",
          "hl": "0x000380",
          "flags": {
            "z": false,
            "c": true,
            "n": true
          },
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000000",
          "D005A0": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 0
        },
        "after": {
          "pc": "0x001713",
          "sp": "0xD1A84B",
          "ix": "0x000000",
          "iy": "0xD00080",
          "af": "0x2033",
          "bc": "0x000E5A",
          "de": "0xD65800",
          "hl": "0x000380",
          "flags": {
            "z": false,
            "c": true,
            "n": true
          },
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000000",
          "D005A0": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 0
        }
      },
      {
        "name": "displayPrep005998",
        "targetPc": "0x005998",
        "beforeBlock": 50229,
        "afterBlock": 50230,
        "afterPc": "0x005A8B",
        "before": {
          "pc": "0x005998",
          "sp": "0xD1A851",
          "ix": "0x000000",
          "iy": "0xD00080",
          "af": "0x7F28",
          "bc": "0x00A55A",
          "de": "0xD65800",
          "hl": "0x000380",
          "flags": {
            "z": false,
            "c": false,
            "n": false
          },
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000000",
          "D005A0": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 0
        },
        "after": {
          "pc": "0x005A8B",
          "sp": "0xD1A857",
          "ix": "0x000000",
          "iy": "0xD00080",
          "af": "0x2024",
          "bc": "0xFFFFFC",
          "de": "0xD005C5",
          "hl": "0xD005A1",
          "flags": {
            "z": false,
            "c": false,
            "n": false
          },
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000000",
          "D005A0": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 0
        }
      },
      {
        "name": "displayCaller0059c6",
        "targetPc": "0x0059C6",
        "beforeBlock": 50219,
        "afterBlock": 50220,
        "afterPc": "0x0059D6",
        "before": {
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
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000000",
          "D005A0": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 0
        },
        "after": {
          "pc": "0x0059D6",
          "sp": "0xD1A869",
          "ix": "0x000000",
          "iy": "0xD00080",
          "af": "0x201B",
          "bc": "0x000E5A",
          "de": "0xD65800",
          "hl": "0x000000",
          "flags": {
            "z": false,
            "c": true,
            "n": true
          },
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000000",
          "D005A0": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 0
        }
      },
      {
        "name": "displayAdvance0059da",
        "targetPc": "0x0059DA",
        "beforeBlock": 50301,
        "afterBlock": 50302,
        "afterPc": "0x0059E6",
        "before": {
          "pc": "0x0059DA",
          "sp": "0xD1A869",
          "ix": "0x000000",
          "iy": "0xD00080",
          "af": "0x201B",
          "bc": "0x000E5A",
          "de": "0xD65800",
          "hl": "0x000000",
          "flags": {
            "z": false,
            "c": true,
            "n": true
          },
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000002",
          "D005A0": "0x35",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 0
        },
        "after": {
          "pc": "0x0059E6",
          "sp": "0xD1A869",
          "ix": "0x000000",
          "iy": "0xD00080",
          "af": "0x01B3",
          "bc": "0x000E5A",
          "de": "0xD65800",
          "hl": "0xD00596",
          "flags": {
            "z": false,
            "c": true,
            "n": true
          },
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x01",
          "D0059C": "0x000002",
          "D005A0": "0x35",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 0
        }
      },
      {
        "name": "displayReturn005a19",
        "targetPc": "0x005A19",
        "beforeBlock": 50300,
        "afterBlock": 50301,
        "afterPc": "0x0059DA",
        "before": {
          "pc": "0x005A19",
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
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000002",
          "D005A0": "0x35",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 0
        },
        "after": {
          "pc": "0x0059DA",
          "sp": "0xD1A869",
          "ix": "0x000000",
          "iy": "0xD00080",
          "af": "0x201B",
          "bc": "0x000E5A",
          "de": "0xD65800",
          "hl": "0x000000",
          "flags": {
            "z": false,
            "c": true,
            "n": true
          },
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000002",
          "D005A0": "0x35",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 0
        }
      },
      {
        "name": "displayRow005a48",
        "targetPc": "0x005A48",
        "beforeBlock": 50231,
        "afterBlock": 50232,
        "afterPc": "0x005A96",
        "before": {
          "pc": "0x005A48",
          "sp": "0xD1A854",
          "ix": "0xD005A1",
          "iy": "0xD00080",
          "af": "0x0024",
          "bc": "0xFFFFFC",
          "de": "0xD005C5",
          "hl": "0xD005A1",
          "flags": {
            "z": false,
            "c": false,
            "n": false
          },
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000000",
          "D005A0": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 0
        },
        "after": {
          "pc": "0x005A96",
          "sp": "0xD1A857",
          "ix": "0xD005A1",
          "iy": "0xD00080",
          "af": "0x2520",
          "bc": "0xFFFFFC",
          "de": "0xD005C5",
          "hl": "0xD005A1",
          "flags": {
            "z": false,
            "c": false,
            "n": false
          },
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000000",
          "D005A0": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 0
        }
      },
      {
        "name": "displayRow005a53",
        "targetPc": "0x005A53",
        "beforeBlock": 402,
        "afterBlock": 403,
        "afterPc": "0x0A17E9",
        "before": {
          "pc": "0x005A53",
          "sp": "0xD1A83C",
          "ix": "0xD005A1",
          "iy": "0xD00080",
          "af": "0x0020",
          "bc": "0xFFFFFC",
          "de": "0xD45A00",
          "hl": "0xD3FD80",
          "flags": {
            "z": false,
            "c": false,
            "n": false
          },
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x0F",
          "D00596": "0x00",
          "D0059C": "0xD4202C",
          "D005A0": "0x00",
          "D0058C": "0x0F",
          "D0058D": "0x0F",
          "D0058E": "0x0F",
          "D00080": "0x08",
          "D00081": "0x04",
          "D0009F": "0x20",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0xD1A8A3",
          "D0243D": "0xD2A815",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 8549
        },
        "after": {
          "pc": "0x0A17E9",
          "sp": "0xD1A83F",
          "ix": "0xD005A1",
          "iy": "0xD00080",
          "af": "0x0200",
          "bc": "0xFFFFFC",
          "de": "0xD45A00",
          "hl": "0x000002",
          "flags": {
            "z": false,
            "c": false,
            "n": false
          },
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x0F",
          "D00596": "0x00",
          "D0059C": "0xD4202C",
          "D005A0": "0x00",
          "D0058C": "0x0F",
          "D0058D": "0x0F",
          "D0058E": "0x0F",
          "D00080": "0x08",
          "D00081": "0x04",
          "D0009F": "0x20",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0xD1A8A3",
          "D0243D": "0xD2A815",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 8549
        }
      },
      {
        "name": "displayRow005a75",
        "targetPc": "0x005A75",
        "beforeBlock": 50221,
        "afterBlock": 50222,
        "afterPc": "0x005A82",
        "before": {
          "pc": "0x005A75",
          "sp": "0xD1A866",
          "ix": "0x000000",
          "iy": "0xD00080",
          "af": "0x201B",
          "bc": "0x000E5A",
          "de": "0xD65800",
          "hl": "0x000000",
          "flags": {
            "z": false,
            "c": true,
            "n": true
          },
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000000",
          "D005A0": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 0
        },
        "after": {
          "pc": "0x005A82",
          "sp": "0xD1A857",
          "ix": "0x000000",
          "iy": "0xD00080",
          "af": "0x2033",
          "bc": "0x000E5A",
          "de": "0xD65800",
          "hl": "0x000000",
          "flags": {
            "z": false,
            "c": true,
            "n": true
          },
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000000",
          "D005A0": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 0
        }
      },
      {
        "name": "displayRow005a82",
        "targetPc": "0x005A82",
        "beforeBlock": 50222,
        "afterBlock": 50223,
        "afterPc": "0x00596E",
        "before": {
          "pc": "0x005A82",
          "sp": "0xD1A857",
          "ix": "0x000000",
          "iy": "0xD00080",
          "af": "0x2033",
          "bc": "0x000E5A",
          "de": "0xD65800",
          "hl": "0x000000",
          "flags": {
            "z": false,
            "c": true,
            "n": true
          },
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000000",
          "D005A0": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 0
        },
        "after": {
          "pc": "0x00596E",
          "sp": "0xD1A854",
          "ix": "0x000000",
          "iy": "0xD00080",
          "af": "0x2033",
          "bc": "0x000E5A",
          "de": "0xD65800",
          "hl": "0x000380",
          "flags": {
            "z": false,
            "c": true,
            "n": true
          },
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000000",
          "D005A0": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 0
        }
      },
      {
        "name": "displayRow005a8b",
        "targetPc": "0x005A8B",
        "beforeBlock": 50230,
        "afterBlock": 50231,
        "afterPc": "0x005A48",
        "before": {
          "pc": "0x005A8B",
          "sp": "0xD1A857",
          "ix": "0x000000",
          "iy": "0xD00080",
          "af": "0x2024",
          "bc": "0xFFFFFC",
          "de": "0xD005C5",
          "hl": "0xD005A1",
          "flags": {
            "z": false,
            "c": false,
            "n": false
          },
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000000",
          "D005A0": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 0
        },
        "after": {
          "pc": "0x005A48",
          "sp": "0xD1A854",
          "ix": "0xD005A1",
          "iy": "0xD00080",
          "af": "0x0024",
          "bc": "0xFFFFFC",
          "de": "0xD005C5",
          "hl": "0xD005A1",
          "flags": {
            "z": false,
            "c": false,
            "n": false
          },
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000000",
          "D005A0": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 0
        }
      },
      {
        "name": "displayRow005a96",
        "targetPc": "0x005A96",
        "beforeBlock": 50232,
        "afterBlock": 50233,
        "afterPc": "0x005A53",
        "before": {
          "pc": "0x005A96",
          "sp": "0xD1A857",
          "ix": "0xD005A1",
          "iy": "0xD00080",
          "af": "0x2520",
          "bc": "0xFFFFFC",
          "de": "0xD005C5",
          "hl": "0xD005A1",
          "flags": {
            "z": false,
            "c": false,
            "n": false
          },
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000000",
          "D005A0": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 0
        },
        "after": {
          "pc": "0x005A53",
          "sp": "0xD1A854",
          "ix": "0xD005A1",
          "iy": "0xD00080",
          "af": "0x0020",
          "bc": "0xFFFFFC",
          "de": "0xD005C5",
          "hl": "0xD005A1",
          "flags": {
            "z": false,
            "c": false,
            "n": false
          },
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000000",
          "D005A0": "0x25",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 0
        }
      },
      {
        "name": "displayRow005aa2",
        "targetPc": "0x005AA2",
        "beforeBlock": 50234,
        "afterBlock": 50235,
        "afterPc": "0x005AAE",
        "before": {
          "pc": "0x005AA2",
          "sp": "0xD1A857",
          "ix": "0xD005A1",
          "iy": "0xD00080",
          "af": "0x0200",
          "bc": "0xFFFFFC",
          "de": "0xD005C5",
          "hl": "0x000002",
          "flags": {
            "z": false,
            "c": false,
            "n": false
          },
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000000",
          "D005A0": "0x25",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 0
        },
        "after": {
          "pc": "0x005AAE",
          "sp": "0xD1A857",
          "ix": "0xD005A1",
          "iy": "0xD00080",
          "af": "0x0254",
          "bc": "0xFFFFFC",
          "de": "0xD0050C",
          "hl": "0x000002",
          "flags": {
            "z": true,
            "c": false,
            "n": false
          },
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000000",
          "D005A0": "0x25",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 0
        }
      },
      {
        "name": "displayRow005aae",
        "targetPc": "0x005AAE",
        "beforeBlock": 50235,
        "afterBlock": 50236,
        "afterPc": "0x005AE8",
        "before": {
          "pc": "0x005AAE",
          "sp": "0xD1A857",
          "ix": "0xD005A1",
          "iy": "0xD00080",
          "af": "0x0254",
          "bc": "0xFFFFFC",
          "de": "0xD0050C",
          "hl": "0x000002",
          "flags": {
            "z": true,
            "c": false,
            "n": false
          },
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000000",
          "D005A0": "0x25",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 0
        },
        "after": {
          "pc": "0x005AE8",
          "sp": "0xD1A857",
          "ix": "0xD005A2",
          "iy": "0xD00080",
          "af": "0x0054",
          "bc": "0xFF10FC",
          "de": "0xD40000",
          "hl": "0xD45C84",
          "flags": {
            "z": true,
            "c": false,
            "n": false
          },
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000002",
          "D005A0": "0x25",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 0
        }
      },
      {
        "name": "displayLoop005ab6",
        "targetPc": "0x005AB6",
        "beforeBlock": 50239,
        "afterBlock": 50240,
        "afterPc": "0x005AE8",
        "before": {
          "pc": "0x005AB6",
          "sp": "0xD1A857",
          "ix": "0xD005A3",
          "iy": "0xD00080",
          "af": "0xFF1A",
          "bc": "0xFF0F05",
          "de": "0x0000FF",
          "hl": "0xD005A0",
          "flags": {
            "z": false,
            "c": false,
            "n": true
          },
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000002",
          "D005A0": "0x26",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 0
        },
        "after": {
          "pc": "0x005AE8",
          "sp": "0xD1A857",
          "ix": "0xD005A4",
          "iy": "0xD00080",
          "af": "0x005C",
          "bc": "0xFF0F05",
          "de": "0xD40000",
          "hl": "0xD45F04",
          "flags": {
            "z": true,
            "c": false,
            "n": false
          },
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000002",
          "D005A0": "0x26",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 0
        }
      },
      {
        "name": "displayLoop005ae8",
        "targetPc": "0x005AE8",
        "beforeBlock": 50236,
        "afterBlock": 50237,
        "afterPc": "0x005B16",
        "before": {
          "pc": "0x005AE8",
          "sp": "0xD1A857",
          "ix": "0xD005A2",
          "iy": "0xD00080",
          "af": "0x0054",
          "bc": "0xFF10FC",
          "de": "0xD40000",
          "hl": "0xD45C84",
          "flags": {
            "z": true,
            "c": false,
            "n": false
          },
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000002",
          "D005A0": "0x25",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 0
        },
        "after": {
          "pc": "0x005B16",
          "sp": "0xD1A854",
          "ix": "0xD005A2",
          "iy": "0xD00080",
          "af": "0x0054",
          "bc": "0xFF0500",
          "de": "0x0000FF",
          "hl": "0xD45C84",
          "flags": {
            "z": true,
            "c": false,
            "n": false
          },
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000002",
          "D005A0": "0x25",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 0
        }
      },
      {
        "name": "displayLoop005b16",
        "targetPc": "0x005B16",
        "beforeBlock": 50237,
        "afterBlock": 50238,
        "afterPc": "0x005B4B",
        "before": {
          "pc": "0x005B16",
          "sp": "0xD1A854",
          "ix": "0xD005A2",
          "iy": "0xD00080",
          "af": "0x0054",
          "bc": "0xFF0500",
          "de": "0x0000FF",
          "hl": "0xD45C84",
          "flags": {
            "z": true,
            "c": false,
            "n": false
          },
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000002",
          "D005A0": "0x25",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 0
        },
        "after": {
          "pc": "0x005B4B",
          "sp": "0xD1A854",
          "ix": "0xD005A3",
          "iy": "0xD00080",
          "af": "0x007C",
          "bc": "0xFF0500",
          "de": "0x0000FF",
          "hl": "0xD45C8E",
          "flags": {
            "z": true,
            "c": false,
            "n": false
          },
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000002",
          "D005A0": "0x25",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 0
        }
      },
      {
        "name": "displayLoop005b4b",
        "targetPc": "0x005B4B",
        "beforeBlock": 50238,
        "afterBlock": 50239,
        "afterPc": "0x005AB6",
        "before": {
          "pc": "0x005B4B",
          "sp": "0xD1A854",
          "ix": "0xD005A3",
          "iy": "0xD00080",
          "af": "0x007C",
          "bc": "0xFF0500",
          "de": "0x0000FF",
          "hl": "0xD45C8E",
          "flags": {
            "z": true,
            "c": false,
            "n": false
          },
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000002",
          "D005A0": "0x25",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 0
        },
        "after": {
          "pc": "0x005AB6",
          "sp": "0xD1A857",
          "ix": "0xD005A3",
          "iy": "0xD00080",
          "af": "0xFF1A",
          "bc": "0xFF0F05",
          "de": "0x0000FF",
          "hl": "0xD005A0",
          "flags": {
            "z": false,
            "c": false,
            "n": true
          },
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000002",
          "D005A0": "0x26",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 0
        }
      },
      {
        "name": "displayCaller005b92",
        "targetPc": "0x005B92",
        "beforeBlock": 50299,
        "afterBlock": 50300,
        "afterPc": "0x005A19",
        "before": {
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
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000002",
          "D005A0": "0x35",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 0
        },
        "after": {
          "pc": "0x005A19",
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
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000002",
          "D005A0": "0x35",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 0
        }
      },
      {
        "name": "status005a19",
        "targetPc": "0x005A19",
        "beforeBlock": 50300,
        "afterBlock": 50301,
        "afterPc": "0x0059DA",
        "before": {
          "pc": "0x005A19",
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
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000002",
          "D005A0": "0x35",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 0
        },
        "after": {
          "pc": "0x0059DA",
          "sp": "0xD1A869",
          "ix": "0x000000",
          "iy": "0xD00080",
          "af": "0x201B",
          "bc": "0x000E5A",
          "de": "0xD65800",
          "hl": "0x000000",
          "flags": {
            "z": false,
            "c": true,
            "n": true
          },
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000002",
          "D005A0": "0x35",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 0
        }
      },
      {
        "name": "status0059da",
        "targetPc": "0x0059DA",
        "beforeBlock": 50301,
        "afterBlock": 50302,
        "afterPc": "0x0059E6",
        "before": {
          "pc": "0x0059DA",
          "sp": "0xD1A869",
          "ix": "0x000000",
          "iy": "0xD00080",
          "af": "0x201B",
          "bc": "0x000E5A",
          "de": "0xD65800",
          "hl": "0x000000",
          "flags": {
            "z": false,
            "c": true,
            "n": true
          },
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000002",
          "D005A0": "0x35",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 0
        },
        "after": {
          "pc": "0x0059E6",
          "sp": "0xD1A869",
          "ix": "0x000000",
          "iy": "0xD00080",
          "af": "0x01B3",
          "bc": "0x000E5A",
          "de": "0xD65800",
          "hl": "0xD00596",
          "flags": {
            "z": false,
            "c": true,
            "n": true
          },
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x01",
          "D0059C": "0x000002",
          "D005A0": "0x35",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 0
        }
      },
      {
        "name": "status0059e6",
        "targetPc": "0x0059E6",
        "beforeBlock": 50302,
        "afterBlock": 50303,
        "afterPc": "0x013D1D",
        "before": {
          "pc": "0x0059E6",
          "sp": "0xD1A869",
          "ix": "0x000000",
          "iy": "0xD00080",
          "af": "0x01B3",
          "bc": "0x000E5A",
          "de": "0xD65800",
          "hl": "0xD00596",
          "flags": {
            "z": false,
            "c": true,
            "n": true
          },
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x01",
          "D0059C": "0x000002",
          "D005A0": "0x35",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 0
        },
        "after": {
          "pc": "0x013D1D",
          "sp": "0xD1A872",
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
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x01",
          "D0059C": "0x000002",
          "D005A0": "0x35",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 0
        }
      },
      {
        "name": "transfer006475",
        "targetPc": "0x006475",
        "beforeBlock": 57636,
        "afterBlock": 57637,
        "afterPc": "0x001C7D",
        "before": {
          "pc": "0x006475",
          "sp": "0xD1A83D",
          "ix": "0xD1A866",
          "iy": "0xD00080",
          "af": "0x0042",
          "bc": "0x000000",
          "de": "0x008000",
          "hl": "0x020001",
          "flags": {
            "z": true,
            "c": false,
            "n": true
          },
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x0A",
          "D0059C": "0x00006E",
          "D005A0": "0xD5",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 3011
        },
        "after": {
          "pc": "0x001C7D",
          "sp": "0xD1A83A",
          "ix": "0xD1A866",
          "iy": "0xD00080",
          "af": "0x0042",
          "bc": "0x000000",
          "de": "0x008000",
          "hl": "0x020001",
          "flags": {
            "z": true,
            "c": false,
            "n": true
          },
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x0A",
          "D0059C": "0x00006E",
          "D005A0": "0xD5",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 3011
        }
      },
      {
        "name": "transfer00647d",
        "targetPc": "0x00647D",
        "beforeBlock": 57647,
        "afterBlock": 57648,
        "afterPc": "0x0017DD",
        "before": {
          "pc": "0x00647D",
          "sp": "0xD1A83D",
          "ix": "0xD1A866",
          "iy": "0xD00080",
          "af": "0x090C",
          "bc": "0x09D6B4",
          "de": "0x008000",
          "hl": "0x0BD6BA",
          "flags": {
            "z": false,
            "c": false,
            "n": false
          },
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x0A",
          "D0059C": "0x00006E",
          "D005A0": "0xD5",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 3011
        },
        "after": {
          "pc": "0x0017DD",
          "sp": "0xD1A837",
          "ix": "0xD1A866",
          "iy": "0xD00080",
          "af": "0x090C",
          "bc": "0x09D6B4",
          "de": "0x008000",
          "hl": "0x001204",
          "flags": {
            "z": false,
            "c": false,
            "n": false
          },
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x0A",
          "D0059C": "0x00006E",
          "D005A0": "0xD5",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 3011
        }
      },
      {
        "name": "transfer0064c7",
        "targetPc": "0x0064C7",
        "beforeBlock": 57772,
        "afterBlock": 57773,
        "afterPc": "0x0017DD",
        "before": {
          "pc": "0x0064C7",
          "sp": "0xD1A83D",
          "ix": "0xD1A866",
          "iy": "0xD00080",
          "af": "0x0A42",
          "bc": "0x002000",
          "de": "0x000240",
          "hl": "0x000000",
          "flags": {
            "z": true,
            "c": false,
            "n": true
          },
          "D00121": "0x000000",
          "D00124": "0x0A",
          "D00587": "0x00",
          "D00596": "0x13",
          "D0059C": "0x0000DA",
          "D005A0": "0x85",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 3040
        },
        "after": {
          "pc": "0x0017DD",
          "sp": "0xD1A837",
          "ix": "0xD1A866",
          "iy": "0xD00080",
          "af": "0x0A42",
          "bc": "0x002000",
          "de": "0x000240",
          "hl": "0x001204",
          "flags": {
            "z": true,
            "c": false,
            "n": true
          },
          "D00121": "0x000000",
          "D00124": "0x0A",
          "D00587": "0x00",
          "D00596": "0x13",
          "D0059C": "0x0000DA",
          "D005A0": "0x85",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 3040
        }
      },
      {
        "name": "lowCaller0017fc",
        "targetPc": "0x0017FC",
        "beforeBlock": 57733,
        "afterBlock": 57734,
        "afterPc": "0x006486",
        "before": {
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
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x13",
          "D0059C": "0x0000DA",
          "D005A0": "0x85",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 3040
        },
        "after": {
          "pc": "0x006486",
          "sp": "0xD1A83A",
          "ix": "0xD1A866",
          "iy": "0xD00080",
          "af": "0x090C",
          "bc": "0x09D6B4",
          "de": "0x008000",
          "hl": "0x0017DA",
          "flags": {
            "z": false,
            "c": false,
            "n": false
          },
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x13",
          "D0059C": "0x0000DA",
          "D005A0": "0x85",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 3040
        }
      },
      {
        "name": "lowSelect0064d0",
        "targetPc": "0x0064D0",
        "beforeBlock": 57859,
        "afterBlock": 57860,
        "afterPc": "0x006CC6",
        "before": {
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
          "D00121": "0x000000",
          "D00124": "0x0A",
          "D00587": "0x00",
          "D00596": "0x13",
          "D0059C": "0x0000DA",
          "D005A0": "0x85",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 3031
        },
        "after": {
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
          "D00121": "0x000000",
          "D00124": "0x0A",
          "D00587": "0x00",
          "D00596": "0x13",
          "D0059C": "0x0000DA",
          "D005A0": "0x85",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 3031
        }
      }
    ],
    "tailWindows": [
      {
        "block": 57613,
        "pc": "0x005B92",
        "exitState": {
          "block": 57613,
          "pc": "0x005B92",
          "regs": {
            "af": "0xFF42",
            "bc": "0xFF0005",
            "de": "0x0000FF",
            "hl": "0xD005A0",
            "ix": "0xD005C1",
            "sp": "0xD1A84E",
            "flags": {
              "z": true,
              "c": false,
              "n": true
            }
          },
          "ram": {
            "D00596": "0x09",
            "D005A0": "0xD5",
            "D02A73": "0x38",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
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
          "recentBlocks": [
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
        "precedingLoop": [
          {
            "name": "displayLoop005ae8",
            "block": 57590,
            "pc": "0x005AE8",
            "regs": {
              "af": "0x0054",
              "bc": "0xFF0605",
              "de": "0xD40000",
              "hl": "0xD6065C",
              "ix": "0xD005B6",
              "sp": "0xD1A84E",
              "flags": {
                "z": true,
                "c": false,
                "n": false
              }
            },
            "ram": {
              "D00596": "0x09",
              "D005A0": "0xCF",
              "D02A73": "0x00",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
                "0x00",
                "0x00",
                "0x00",
                "0x38",
                "0x80",
                "0x38",
                "0x80",
                "0x38"
              ]
            },
            "recentBlocks": [
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8"
            ]
          },
          {
            "name": "displayLoop005b16",
            "block": 57591,
            "pc": "0x005B16",
            "regs": {
              "af": "0x0054",
              "bc": "0xFF0500",
              "de": "0x0000FF",
              "hl": "0xD6065C",
              "ix": "0xD005B6",
              "sp": "0xD1A84B",
              "flags": {
                "z": true,
                "c": false,
                "n": false
              }
            },
            "ram": {
              "D00596": "0x09",
              "D005A0": "0xCF",
              "D02A73": "0x00",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
                "0x00",
                "0x00",
                "0x00",
                "0x38",
                "0x80",
                "0x38",
                "0x80",
                "0x38"
              ]
            },
            "recentBlocks": [
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16"
            ]
          },
          {
            "name": "displayLoop005b4b",
            "block": 57592,
            "pc": "0x005B4B",
            "regs": {
              "af": "0x007C",
              "bc": "0xFF0500",
              "de": "0x0000FF",
              "hl": "0xD60666",
              "ix": "0xD005B7",
              "sp": "0xD1A84B",
              "flags": {
                "z": true,
                "c": false,
                "n": false
              }
            },
            "ram": {
              "D00596": "0x09",
              "D005A0": "0xCF",
              "D02A73": "0x00",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
                "0x00",
                "0x00",
                "0x38",
                "0x80",
                "0x38",
                "0x80",
                "0x38",
                "0x80"
              ]
            },
            "recentBlocks": [
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B"
            ]
          },
          {
            "name": "displayLoop005ab6",
            "block": 57593,
            "pc": "0x005AB6",
            "regs": {
              "af": "0xFF02",
              "bc": "0xFF0505",
              "de": "0x0000FF",
              "hl": "0xD005A0",
              "ix": "0xD005B7",
              "sp": "0xD1A84E",
              "flags": {
                "z": false,
                "c": false,
                "n": true
              }
            },
            "ram": {
              "D00596": "0x09",
              "D005A0": "0xD0",
              "D02A73": "0x00",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
                "0x00",
                "0x00",
                "0x38",
                "0x80",
                "0x38",
                "0x80",
                "0x38",
                "0x80"
              ]
            },
            "recentBlocks": [
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6"
            ]
          },
          {
            "name": "displayLoop005ae8",
            "block": 57594,
            "pc": "0x005AE8",
            "regs": {
              "af": "0x0054",
              "bc": "0xFF0505",
              "de": "0xD40000",
              "hl": "0xD608DC",
              "ix": "0xD005B8",
              "sp": "0xD1A84E",
              "flags": {
                "z": true,
                "c": false,
                "n": false
              }
            },
            "ram": {
              "D00596": "0x09",
              "D005A0": "0xD0",
              "D02A73": "0x00",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
                "0x00",
                "0x38",
                "0x80",
                "0x38",
                "0x80",
                "0x38",
                "0x80",
                "0x38"
              ]
            },
            "recentBlocks": [
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8"
            ]
          },
          {
            "name": "displayLoop005b16",
            "block": 57595,
            "pc": "0x005B16",
            "regs": {
              "af": "0x0054",
              "bc": "0xFF0500",
              "de": "0x0000FF",
              "hl": "0xD608DC",
              "ix": "0xD005B8",
              "sp": "0xD1A84B",
              "flags": {
                "z": true,
                "c": false,
                "n": false
              }
            },
            "ram": {
              "D00596": "0x09",
              "D005A0": "0xD0",
              "D02A73": "0x00",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
                "0x00",
                "0x38",
                "0x80",
                "0x38",
                "0x80",
                "0x38",
                "0x80",
                "0x38"
              ]
            },
            "recentBlocks": [
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16"
            ]
          },
          {
            "name": "displayLoop005b4b",
            "block": 57596,
            "pc": "0x005B4B",
            "regs": {
              "af": "0x007C",
              "bc": "0xFF0500",
              "de": "0x0000FF",
              "hl": "0xD608E6",
              "ix": "0xD005B9",
              "sp": "0xD1A84B",
              "flags": {
                "z": true,
                "c": false,
                "n": false
              }
            },
            "ram": {
              "D00596": "0x09",
              "D005A0": "0xD0",
              "D02A73": "0x00",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
                "0x38",
                "0x80",
                "0x38",
                "0x80",
                "0x38",
                "0x80",
                "0x38",
                "0x80"
              ]
            },
            "recentBlocks": [
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B"
            ]
          },
          {
            "name": "displayLoop005ab6",
            "block": 57597,
            "pc": "0x005AB6",
            "regs": {
              "af": "0xFF02",
              "bc": "0xFF0405",
              "de": "0x0000FF",
              "hl": "0xD005A0",
              "ix": "0xD005B9",
              "sp": "0xD1A84E",
              "flags": {
                "z": false,
                "c": false,
                "n": true
              }
            },
            "ram": {
              "D00596": "0x09",
              "D005A0": "0xD1",
              "D02A73": "0x00",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
                "0x38",
                "0x80",
                "0x38",
                "0x80",
                "0x38",
                "0x80",
                "0x38",
                "0x80"
              ]
            },
            "recentBlocks": [
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6"
            ]
          },
          {
            "name": "displayLoop005ae8",
            "block": 57598,
            "pc": "0x005AE8",
            "regs": {
              "af": "0x3854",
              "bc": "0xFF0405",
              "de": "0xD40000",
              "hl": "0xD60B5C",
              "ix": "0xD005BA",
              "sp": "0xD1A84E",
              "flags": {
                "z": true,
                "c": false,
                "n": false
              }
            },
            "ram": {
              "D00596": "0x09",
              "D005A0": "0xD1",
              "D02A73": "0x00",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
                "0x80",
                "0x38",
                "0x80",
                "0x38",
                "0x80",
                "0x38",
                "0x80",
                "0x00"
              ]
            },
            "recentBlocks": [
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8"
            ]
          },
          {
            "name": "displayLoop005b16",
            "block": 57599,
            "pc": "0x005B16",
            "regs": {
              "af": "0x3854",
              "bc": "0xFF0538",
              "de": "0x0000FF",
              "hl": "0xD60B5C",
              "ix": "0xD005BA",
              "sp": "0xD1A84B",
              "flags": {
                "z": true,
                "c": false,
                "n": false
              }
            },
            "ram": {
              "D00596": "0x09",
              "D005A0": "0xD1",
              "D02A73": "0x38",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
                "0x80",
                "0x38",
                "0x80",
                "0x38",
                "0x80",
                "0x38",
                "0x80",
                "0x00"
              ]
            },
            "recentBlocks": [
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16"
            ]
          },
          {
            "name": "displayLoop005b4b",
            "block": 57600,
            "pc": "0x005B4B",
            "regs": {
              "af": "0x8055",
              "bc": "0xFF0500",
              "de": "0x0000FF",
              "hl": "0xD60B66",
              "ix": "0xD005BB",
              "sp": "0xD1A84B",
              "flags": {
                "z": true,
                "c": true,
                "n": false
              }
            },
            "ram": {
              "D00596": "0x09",
              "D005A0": "0xD1",
              "D02A73": "0x38",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
                "0x38",
                "0x80",
                "0x38",
                "0x80",
                "0x38",
                "0x80",
                "0x00",
                "0x00"
              ]
            },
            "recentBlocks": [
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B"
            ]
          },
          {
            "name": "displayLoop005ab6",
            "block": 57601,
            "pc": "0x005AB6",
            "regs": {
              "af": "0xFF02",
              "bc": "0xFF0305",
              "de": "0x0000FF",
              "hl": "0xD005A0",
              "ix": "0xD005BB",
              "sp": "0xD1A84E",
              "flags": {
                "z": false,
                "c": false,
                "n": true
              }
            },
            "ram": {
              "D00596": "0x09",
              "D005A0": "0xD2",
              "D02A73": "0x38",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
                "0x38",
                "0x80",
                "0x38",
                "0x80",
                "0x38",
                "0x80",
                "0x00",
                "0x00"
              ]
            },
            "recentBlocks": [
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6"
            ]
          },
          {
            "name": "displayLoop005ae8",
            "block": 57602,
            "pc": "0x005AE8",
            "regs": {
              "af": "0x3854",
              "bc": "0xFF0305",
              "de": "0xD40000",
              "hl": "0xD60DDC",
              "ix": "0xD005BC",
              "sp": "0xD1A84E",
              "flags": {
                "z": true,
                "c": false,
                "n": false
              }
            },
            "ram": {
              "D00596": "0x09",
              "D005A0": "0xD2",
              "D02A73": "0x38",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
                "0x80",
                "0x38",
                "0x80",
                "0x38",
                "0x80",
                "0x00",
                "0x00",
                "0x00"
              ]
            },
            "recentBlocks": [
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8"
            ]
          },
          {
            "name": "displayLoop005b16",
            "block": 57603,
            "pc": "0x005B16",
            "regs": {
              "af": "0x3854",
              "bc": "0xFF0538",
              "de": "0x0000FF",
              "hl": "0xD60DDC",
              "ix": "0xD005BC",
              "sp": "0xD1A84B",
              "flags": {
                "z": true,
                "c": false,
                "n": false
              }
            },
            "ram": {
              "D00596": "0x09",
              "D005A0": "0xD2",
              "D02A73": "0x38",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
                "0x80",
                "0x38",
                "0x80",
                "0x38",
                "0x80",
                "0x00",
                "0x00",
                "0x00"
              ]
            },
            "recentBlocks": [
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16"
            ]
          },
          {
            "name": "displayLoop005b4b",
            "block": 57604,
            "pc": "0x005B4B",
            "regs": {
              "af": "0x8055",
              "bc": "0xFF0500",
              "de": "0x0000FF",
              "hl": "0xD60DE6",
              "ix": "0xD005BD",
              "sp": "0xD1A84B",
              "flags": {
                "z": true,
                "c": true,
                "n": false
              }
            },
            "ram": {
              "D00596": "0x09",
              "D005A0": "0xD2",
              "D02A73": "0x38",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
                "0x38",
                "0x80",
                "0x38",
                "0x80",
                "0x00",
                "0x00",
                "0x00",
                "0x00"
              ]
            },
            "recentBlocks": [
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B"
            ]
          },
          {
            "name": "displayLoop005ab6",
            "block": 57605,
            "pc": "0x005AB6",
            "regs": {
              "af": "0xFF02",
              "bc": "0xFF0205",
              "de": "0x0000FF",
              "hl": "0xD005A0",
              "ix": "0xD005BD",
              "sp": "0xD1A84E",
              "flags": {
                "z": false,
                "c": false,
                "n": true
              }
            },
            "ram": {
              "D00596": "0x09",
              "D005A0": "0xD3",
              "D02A73": "0x38",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
                "0x38",
                "0x80",
                "0x38",
                "0x80",
                "0x00",
                "0x00",
                "0x00",
                "0x00"
              ]
            },
            "recentBlocks": [
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6"
            ]
          },
          {
            "name": "displayLoop005ae8",
            "block": 57606,
            "pc": "0x005AE8",
            "regs": {
              "af": "0x3854",
              "bc": "0xFF0205",
              "de": "0xD40000",
              "hl": "0xD6105C",
              "ix": "0xD005BE",
              "sp": "0xD1A84E",
              "flags": {
                "z": true,
                "c": false,
                "n": false
              }
            },
            "ram": {
              "D00596": "0x09",
              "D005A0": "0xD3",
              "D02A73": "0x38",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
                "0x80",
                "0x38",
                "0x80",
                "0x00",
                "0x00",
                "0x00",
                "0x00",
                "0x00"
              ]
            },
            "recentBlocks": [
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8"
            ]
          },
          {
            "name": "displayLoop005b16",
            "block": 57607,
            "pc": "0x005B16",
            "regs": {
              "af": "0x3854",
              "bc": "0xFF0538",
              "de": "0x0000FF",
              "hl": "0xD6105C",
              "ix": "0xD005BE",
              "sp": "0xD1A84B",
              "flags": {
                "z": true,
                "c": false,
                "n": false
              }
            },
            "ram": {
              "D00596": "0x09",
              "D005A0": "0xD3",
              "D02A73": "0x38",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
                "0x80",
                "0x38",
                "0x80",
                "0x00",
                "0x00",
                "0x00",
                "0x00",
                "0x00"
              ]
            },
            "recentBlocks": [
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16"
            ]
          },
          {
            "name": "displayLoop005b4b",
            "block": 57608,
            "pc": "0x005B4B",
            "regs": {
              "af": "0x8055",
              "bc": "0xFF0500",
              "de": "0x0000FF",
              "hl": "0xD61066",
              "ix": "0xD005BF",
              "sp": "0xD1A84B",
              "flags": {
                "z": true,
                "c": true,
                "n": false
              }
            },
            "ram": {
              "D00596": "0x09",
              "D005A0": "0xD3",
              "D02A73": "0x38",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
                "0x38",
                "0x80",
                "0x00",
                "0x00",
                "0x00",
                "0x00",
                "0x00",
                "0x00"
              ]
            },
            "recentBlocks": [
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B"
            ]
          },
          {
            "name": "displayLoop005ab6",
            "block": 57609,
            "pc": "0x005AB6",
            "regs": {
              "af": "0xFF02",
              "bc": "0xFF0105",
              "de": "0x0000FF",
              "hl": "0xD005A0",
              "ix": "0xD005BF",
              "sp": "0xD1A84E",
              "flags": {
                "z": false,
                "c": false,
                "n": true
              }
            },
            "ram": {
              "D00596": "0x09",
              "D005A0": "0xD4",
              "D02A73": "0x38",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
                "0x38",
                "0x80",
                "0x00",
                "0x00",
                "0x00",
                "0x00",
                "0x00",
                "0x00"
              ]
            },
            "recentBlocks": [
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6"
            ]
          },
          {
            "name": "displayLoop005ae8",
            "block": 57610,
            "pc": "0x005AE8",
            "regs": {
              "af": "0x3854",
              "bc": "0xFF0105",
              "de": "0xD40000",
              "hl": "0xD612DC",
              "ix": "0xD005C0",
              "sp": "0xD1A84E",
              "flags": {
                "z": true,
                "c": false,
                "n": false
              }
            },
            "ram": {
              "D00596": "0x09",
              "D005A0": "0xD4",
              "D02A73": "0x38",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
                "0x80",
                "0x00",
                "0x00",
                "0x00",
                "0x00",
                "0x00",
                "0x00",
                "0x00"
              ]
            },
            "recentBlocks": [
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8"
            ]
          },
          {
            "name": "displayLoop005b16",
            "block": 57611,
            "pc": "0x005B16",
            "regs": {
              "af": "0x3854",
              "bc": "0xFF0538",
              "de": "0x0000FF",
              "hl": "0xD612DC",
              "ix": "0xD005C0",
              "sp": "0xD1A84B",
              "flags": {
                "z": true,
                "c": false,
                "n": false
              }
            },
            "ram": {
              "D00596": "0x09",
              "D005A0": "0xD4",
              "D02A73": "0x38",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
                "0x80",
                "0x00",
                "0x00",
                "0x00",
                "0x00",
                "0x00",
                "0x00",
                "0x00"
              ]
            },
            "recentBlocks": [
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16"
            ]
          },
          {
            "name": "displayLoop005b4b",
            "block": 57612,
            "pc": "0x005B4B",
            "regs": {
              "af": "0x8055",
              "bc": "0xFF0500",
              "de": "0x0000FF",
              "hl": "0xD612E6",
              "ix": "0xD005C1",
              "sp": "0xD1A84B",
              "flags": {
                "z": true,
                "c": true,
                "n": false
              }
            },
            "ram": {
              "D00596": "0x09",
              "D005A0": "0xD4",
              "D02A73": "0x38",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
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
            "recentBlocks": [
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B"
            ]
          },
          {
            "name": "displayCaller005b92",
            "block": 57613,
            "pc": "0x005B92",
            "regs": {
              "af": "0xFF42",
              "bc": "0xFF0005",
              "de": "0x0000FF",
              "hl": "0xD005A0",
              "ix": "0xD005C1",
              "sp": "0xD1A84E",
              "flags": {
                "z": true,
                "c": false,
                "n": true
              }
            },
            "ram": {
              "D00596": "0x09",
              "D005A0": "0xD5",
              "D02A73": "0x38",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
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
            "recentBlocks": [
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
        ]
      },
      {
        "block": 57729,
        "pc": "0x005B92",
        "exitState": {
          "block": 57729,
          "pc": "0x005B92",
          "regs": {
            "af": "0xFF42",
            "bc": "0xFF0005",
            "de": "0x0000FF",
            "hl": "0xD005A0",
            "ix": "0xD005C1",
            "sp": "0xD1A819",
            "flags": {
              "z": true,
              "c": false,
              "n": true
            }
          },
          "ram": {
            "D00596": "0x12",
            "D005A0": "0x85",
            "D02A73": "0x00",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
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
          "recentBlocks": [
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
        "precedingLoop": [
          {
            "name": "displayLoop005ae8",
            "block": 57706,
            "pc": "0x005AE8",
            "regs": {
              "af": "0x1854",
              "bc": "0xFF0605",
              "de": "0xD40000",
              "hl": "0xD53F34",
              "ix": "0xD005B6",
              "sp": "0xD1A819",
              "flags": {
                "z": true,
                "c": false,
                "n": false
              }
            },
            "ram": {
              "D00596": "0x12",
              "D005A0": "0x7F",
              "D02A73": "0x08",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
                "0x80",
                "0x38",
                "0x00",
                "0x70",
                "0x00",
                "0xE0",
                "0x00",
                "0xC0"
              ]
            },
            "recentBlocks": [
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8"
            ]
          },
          {
            "name": "displayLoop005b16",
            "block": 57707,
            "pc": "0x005B16",
            "regs": {
              "af": "0x1854",
              "bc": "0xFF0518",
              "de": "0x0000FF",
              "hl": "0xD53F34",
              "ix": "0xD005B6",
              "sp": "0xD1A816",
              "flags": {
                "z": true,
                "c": false,
                "n": false
              }
            },
            "ram": {
              "D00596": "0x12",
              "D005A0": "0x7F",
              "D02A73": "0x18",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
                "0x80",
                "0x38",
                "0x00",
                "0x70",
                "0x00",
                "0xE0",
                "0x00",
                "0xC0"
              ]
            },
            "recentBlocks": [
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16"
            ]
          },
          {
            "name": "displayLoop005b4b",
            "block": 57708,
            "pc": "0x005B4B",
            "regs": {
              "af": "0x8055",
              "bc": "0xFF0500",
              "de": "0x0000FF",
              "hl": "0xD53F3E",
              "ix": "0xD005B7",
              "sp": "0xD1A816",
              "flags": {
                "z": true,
                "c": true,
                "n": false
              }
            },
            "ram": {
              "D00596": "0x12",
              "D005A0": "0x7F",
              "D02A73": "0x18",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
                "0x38",
                "0x00",
                "0x70",
                "0x00",
                "0xE0",
                "0x00",
                "0xC0",
                "0x00"
              ]
            },
            "recentBlocks": [
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B"
            ]
          },
          {
            "name": "displayLoop005ab6",
            "block": 57709,
            "pc": "0x005AB6",
            "regs": {
              "af": "0xFF02",
              "bc": "0xFF0505",
              "de": "0x0000FF",
              "hl": "0xD005A0",
              "ix": "0xD005B7",
              "sp": "0xD1A819",
              "flags": {
                "z": false,
                "c": false,
                "n": true
              }
            },
            "ram": {
              "D00596": "0x12",
              "D005A0": "0x80",
              "D02A73": "0x18",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
                "0x38",
                "0x00",
                "0x70",
                "0x00",
                "0xE0",
                "0x00",
                "0xC0",
                "0x00"
              ]
            },
            "recentBlocks": [
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6"
            ]
          },
          {
            "name": "displayLoop005ae8",
            "block": 57710,
            "pc": "0x005AE8",
            "regs": {
              "af": "0x3854",
              "bc": "0xFF0505",
              "de": "0xD40000",
              "hl": "0xD541B4",
              "ix": "0xD005B8",
              "sp": "0xD1A819",
              "flags": {
                "z": true,
                "c": false,
                "n": false
              }
            },
            "ram": {
              "D00596": "0x12",
              "D005A0": "0x80",
              "D02A73": "0x18",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
                "0x00",
                "0x70",
                "0x00",
                "0xE0",
                "0x00",
                "0xC0",
                "0x00",
                "0x00"
              ]
            },
            "recentBlocks": [
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8"
            ]
          },
          {
            "name": "displayLoop005b16",
            "block": 57711,
            "pc": "0x005B16",
            "regs": {
              "af": "0x3854",
              "bc": "0xFF0538",
              "de": "0x0000FF",
              "hl": "0xD541B4",
              "ix": "0xD005B8",
              "sp": "0xD1A816",
              "flags": {
                "z": true,
                "c": false,
                "n": false
              }
            },
            "ram": {
              "D00596": "0x12",
              "D005A0": "0x80",
              "D02A73": "0x38",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
                "0x00",
                "0x70",
                "0x00",
                "0xE0",
                "0x00",
                "0xC0",
                "0x00",
                "0x00"
              ]
            },
            "recentBlocks": [
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16"
            ]
          },
          {
            "name": "displayLoop005b4b",
            "block": 57712,
            "pc": "0x005B4B",
            "regs": {
              "af": "0x0055",
              "bc": "0xFF0500",
              "de": "0x0000FF",
              "hl": "0xD541BE",
              "ix": "0xD005B9",
              "sp": "0xD1A816",
              "flags": {
                "z": true,
                "c": true,
                "n": false
              }
            },
            "ram": {
              "D00596": "0x12",
              "D005A0": "0x80",
              "D02A73": "0x38",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
                "0x70",
                "0x00",
                "0xE0",
                "0x00",
                "0xC0",
                "0x00",
                "0x00",
                "0x00"
              ]
            },
            "recentBlocks": [
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B"
            ]
          },
          {
            "name": "displayLoop005ab6",
            "block": 57713,
            "pc": "0x005AB6",
            "regs": {
              "af": "0xFF02",
              "bc": "0xFF0405",
              "de": "0x0000FF",
              "hl": "0xD005A0",
              "ix": "0xD005B9",
              "sp": "0xD1A819",
              "flags": {
                "z": false,
                "c": false,
                "n": true
              }
            },
            "ram": {
              "D00596": "0x12",
              "D005A0": "0x81",
              "D02A73": "0x38",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
                "0x70",
                "0x00",
                "0xE0",
                "0x00",
                "0xC0",
                "0x00",
                "0x00",
                "0x00"
              ]
            },
            "recentBlocks": [
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6"
            ]
          },
          {
            "name": "displayLoop005ae8",
            "block": 57714,
            "pc": "0x005AE8",
            "regs": {
              "af": "0x7054",
              "bc": "0xFF0405",
              "de": "0xD40000",
              "hl": "0xD54434",
              "ix": "0xD005BA",
              "sp": "0xD1A819",
              "flags": {
                "z": true,
                "c": false,
                "n": false
              }
            },
            "ram": {
              "D00596": "0x12",
              "D005A0": "0x81",
              "D02A73": "0x38",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
                "0x00",
                "0xE0",
                "0x00",
                "0xC0",
                "0x00",
                "0x00",
                "0x00",
                "0x00"
              ]
            },
            "recentBlocks": [
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8"
            ]
          },
          {
            "name": "displayLoop005b16",
            "block": 57715,
            "pc": "0x005B16",
            "regs": {
              "af": "0x7054",
              "bc": "0xFF0570",
              "de": "0x0000FF",
              "hl": "0xD54434",
              "ix": "0xD005BA",
              "sp": "0xD1A816",
              "flags": {
                "z": true,
                "c": false,
                "n": false
              }
            },
            "ram": {
              "D00596": "0x12",
              "D005A0": "0x81",
              "D02A73": "0x70",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
                "0x00",
                "0xE0",
                "0x00",
                "0xC0",
                "0x00",
                "0x00",
                "0x00",
                "0x00"
              ]
            },
            "recentBlocks": [
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16"
            ]
          },
          {
            "name": "displayLoop005b4b",
            "block": 57716,
            "pc": "0x005B4B",
            "regs": {
              "af": "0x007C",
              "bc": "0xFF0500",
              "de": "0x0000FF",
              "hl": "0xD5443E",
              "ix": "0xD005BB",
              "sp": "0xD1A816",
              "flags": {
                "z": true,
                "c": false,
                "n": false
              }
            },
            "ram": {
              "D00596": "0x12",
              "D005A0": "0x81",
              "D02A73": "0x70",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
                "0xE0",
                "0x00",
                "0xC0",
                "0x00",
                "0x00",
                "0x00",
                "0x00",
                "0x00"
              ]
            },
            "recentBlocks": [
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B"
            ]
          },
          {
            "name": "displayLoop005ab6",
            "block": 57717,
            "pc": "0x005AB6",
            "regs": {
              "af": "0xFF02",
              "bc": "0xFF0305",
              "de": "0x0000FF",
              "hl": "0xD005A0",
              "ix": "0xD005BB",
              "sp": "0xD1A819",
              "flags": {
                "z": false,
                "c": false,
                "n": true
              }
            },
            "ram": {
              "D00596": "0x12",
              "D005A0": "0x82",
              "D02A73": "0x70",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
                "0xE0",
                "0x00",
                "0xC0",
                "0x00",
                "0x00",
                "0x00",
                "0x00",
                "0x00"
              ]
            },
            "recentBlocks": [
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6"
            ]
          },
          {
            "name": "displayLoop005ae8",
            "block": 57718,
            "pc": "0x005AE8",
            "regs": {
              "af": "0xE054",
              "bc": "0xFF0305",
              "de": "0xD40000",
              "hl": "0xD546B4",
              "ix": "0xD005BC",
              "sp": "0xD1A819",
              "flags": {
                "z": true,
                "c": false,
                "n": false
              }
            },
            "ram": {
              "D00596": "0x12",
              "D005A0": "0x82",
              "D02A73": "0x70",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
                "0x00",
                "0xC0",
                "0x00",
                "0x00",
                "0x00",
                "0x00",
                "0x00",
                "0x00"
              ]
            },
            "recentBlocks": [
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8"
            ]
          },
          {
            "name": "displayLoop005b16",
            "block": 57719,
            "pc": "0x005B16",
            "regs": {
              "af": "0xE054",
              "bc": "0xFF05E0",
              "de": "0x0000FF",
              "hl": "0xD546B4",
              "ix": "0xD005BC",
              "sp": "0xD1A816",
              "flags": {
                "z": true,
                "c": false,
                "n": false
              }
            },
            "ram": {
              "D00596": "0x12",
              "D005A0": "0x82",
              "D02A73": "0xE0",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
                "0x00",
                "0xC0",
                "0x00",
                "0x00",
                "0x00",
                "0x00",
                "0x00",
                "0x00"
              ]
            },
            "recentBlocks": [
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16"
            ]
          },
          {
            "name": "displayLoop005b4b",
            "block": 57720,
            "pc": "0x005B4B",
            "regs": {
              "af": "0x007C",
              "bc": "0xFF0500",
              "de": "0x0000FF",
              "hl": "0xD546BE",
              "ix": "0xD005BD",
              "sp": "0xD1A816",
              "flags": {
                "z": true,
                "c": false,
                "n": false
              }
            },
            "ram": {
              "D00596": "0x12",
              "D005A0": "0x82",
              "D02A73": "0xE0",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
                "0xC0",
                "0x00",
                "0x00",
                "0x00",
                "0x00",
                "0x00",
                "0x00",
                "0x00"
              ]
            },
            "recentBlocks": [
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B"
            ]
          },
          {
            "name": "displayLoop005ab6",
            "block": 57721,
            "pc": "0x005AB6",
            "regs": {
              "af": "0xFF02",
              "bc": "0xFF0205",
              "de": "0x0000FF",
              "hl": "0xD005A0",
              "ix": "0xD005BD",
              "sp": "0xD1A819",
              "flags": {
                "z": false,
                "c": false,
                "n": true
              }
            },
            "ram": {
              "D00596": "0x12",
              "D005A0": "0x83",
              "D02A73": "0xE0",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
                "0xC0",
                "0x00",
                "0x00",
                "0x00",
                "0x00",
                "0x00",
                "0x00",
                "0x00"
              ]
            },
            "recentBlocks": [
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6"
            ]
          },
          {
            "name": "displayLoop005ae8",
            "block": 57722,
            "pc": "0x005AE8",
            "regs": {
              "af": "0xC054",
              "bc": "0xFF0205",
              "de": "0xD40000",
              "hl": "0xD54934",
              "ix": "0xD005BE",
              "sp": "0xD1A819",
              "flags": {
                "z": true,
                "c": false,
                "n": false
              }
            },
            "ram": {
              "D00596": "0x12",
              "D005A0": "0x83",
              "D02A73": "0xE0",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
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
            "recentBlocks": [
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8"
            ]
          },
          {
            "name": "displayLoop005b16",
            "block": 57723,
            "pc": "0x005B16",
            "regs": {
              "af": "0xC054",
              "bc": "0xFF05C0",
              "de": "0x0000FF",
              "hl": "0xD54934",
              "ix": "0xD005BE",
              "sp": "0xD1A816",
              "flags": {
                "z": true,
                "c": false,
                "n": false
              }
            },
            "ram": {
              "D00596": "0x12",
              "D005A0": "0x83",
              "D02A73": "0xC0",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
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
            "recentBlocks": [
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16"
            ]
          },
          {
            "name": "displayLoop005b4b",
            "block": 57724,
            "pc": "0x005B4B",
            "regs": {
              "af": "0x007C",
              "bc": "0xFF0500",
              "de": "0x0000FF",
              "hl": "0xD5493E",
              "ix": "0xD005BF",
              "sp": "0xD1A816",
              "flags": {
                "z": true,
                "c": false,
                "n": false
              }
            },
            "ram": {
              "D00596": "0x12",
              "D005A0": "0x83",
              "D02A73": "0xC0",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
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
            "recentBlocks": [
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B"
            ]
          },
          {
            "name": "displayLoop005ab6",
            "block": 57725,
            "pc": "0x005AB6",
            "regs": {
              "af": "0xFF02",
              "bc": "0xFF0105",
              "de": "0x0000FF",
              "hl": "0xD005A0",
              "ix": "0xD005BF",
              "sp": "0xD1A819",
              "flags": {
                "z": false,
                "c": false,
                "n": true
              }
            },
            "ram": {
              "D00596": "0x12",
              "D005A0": "0x84",
              "D02A73": "0xC0",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
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
            "recentBlocks": [
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6"
            ]
          },
          {
            "name": "displayLoop005ae8",
            "block": 57726,
            "pc": "0x005AE8",
            "regs": {
              "af": "0x0054",
              "bc": "0xFF0105",
              "de": "0xD40000",
              "hl": "0xD54BB4",
              "ix": "0xD005C0",
              "sp": "0xD1A819",
              "flags": {
                "z": true,
                "c": false,
                "n": false
              }
            },
            "ram": {
              "D00596": "0x12",
              "D005A0": "0x84",
              "D02A73": "0xC0",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
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
            "recentBlocks": [
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8"
            ]
          },
          {
            "name": "displayLoop005b16",
            "block": 57727,
            "pc": "0x005B16",
            "regs": {
              "af": "0x0054",
              "bc": "0xFF0500",
              "de": "0x0000FF",
              "hl": "0xD54BB4",
              "ix": "0xD005C0",
              "sp": "0xD1A816",
              "flags": {
                "z": true,
                "c": false,
                "n": false
              }
            },
            "ram": {
              "D00596": "0x12",
              "D005A0": "0x84",
              "D02A73": "0x00",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
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
            "recentBlocks": [
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16"
            ]
          },
          {
            "name": "displayLoop005b4b",
            "block": 57728,
            "pc": "0x005B4B",
            "regs": {
              "af": "0x007C",
              "bc": "0xFF0500",
              "de": "0x0000FF",
              "hl": "0xD54BBE",
              "ix": "0xD005C1",
              "sp": "0xD1A816",
              "flags": {
                "z": true,
                "c": false,
                "n": false
              }
            },
            "ram": {
              "D00596": "0x12",
              "D005A0": "0x84",
              "D02A73": "0x00",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
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
            "recentBlocks": [
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B"
            ]
          },
          {
            "name": "displayCaller005b92",
            "block": 57729,
            "pc": "0x005B92",
            "regs": {
              "af": "0xFF42",
              "bc": "0xFF0005",
              "de": "0x0000FF",
              "hl": "0xD005A0",
              "ix": "0xD005C1",
              "sp": "0xD1A819",
              "flags": {
                "z": true,
                "c": false,
                "n": true
              }
            },
            "ram": {
              "D00596": "0x12",
              "D005A0": "0x85",
              "D02A73": "0x00",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
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
            "recentBlocks": [
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
        ]
      },
      {
        "block": 57854,
        "pc": "0x005B92",
        "exitState": {
          "block": 57854,
          "pc": "0x005B92",
          "regs": {
            "af": "0xFF42",
            "bc": "0xFF0005",
            "de": "0x0000FF",
            "hl": "0xD005A0",
            "ix": "0xD005C1",
            "sp": "0xD1A819",
            "flags": {
              "z": true,
              "c": false,
              "n": true
            }
          },
          "ram": {
            "D00596": "0x12",
            "D005A0": "0x85",
            "D02A73": "0x00",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
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
          "recentBlocks": [
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
        "precedingLoop": [
          {
            "name": "displayLoop005ae8",
            "block": 57831,
            "pc": "0x005AE8",
            "regs": {
              "af": "0x0054",
              "bc": "0xFF0605",
              "de": "0xD40000",
              "hl": "0xD53F34",
              "ix": "0xD005B6",
              "sp": "0xD1A819",
              "flags": {
                "z": true,
                "c": false,
                "n": false
              }
            },
            "ram": {
              "D00596": "0x12",
              "D005A0": "0x7F",
              "D02A73": "0xF8",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
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
            "recentBlocks": [
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8"
            ]
          },
          {
            "name": "displayLoop005b16",
            "block": 57832,
            "pc": "0x005B16",
            "regs": {
              "af": "0x0054",
              "bc": "0xFF0500",
              "de": "0x0000FF",
              "hl": "0xD53F34",
              "ix": "0xD005B6",
              "sp": "0xD1A816",
              "flags": {
                "z": true,
                "c": false,
                "n": false
              }
            },
            "ram": {
              "D00596": "0x12",
              "D005A0": "0x7F",
              "D02A73": "0x00",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
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
            "recentBlocks": [
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16"
            ]
          },
          {
            "name": "displayLoop005b4b",
            "block": 57833,
            "pc": "0x005B4B",
            "regs": {
              "af": "0x007C",
              "bc": "0xFF0500",
              "de": "0x0000FF",
              "hl": "0xD53F3E",
              "ix": "0xD005B7",
              "sp": "0xD1A816",
              "flags": {
                "z": true,
                "c": false,
                "n": false
              }
            },
            "ram": {
              "D00596": "0x12",
              "D005A0": "0x7F",
              "D02A73": "0x00",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
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
            "recentBlocks": [
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B"
            ]
          },
          {
            "name": "displayLoop005ab6",
            "block": 57834,
            "pc": "0x005AB6",
            "regs": {
              "af": "0xFF02",
              "bc": "0xFF0505",
              "de": "0x0000FF",
              "hl": "0xD005A0",
              "ix": "0xD005B7",
              "sp": "0xD1A819",
              "flags": {
                "z": false,
                "c": false,
                "n": true
              }
            },
            "ram": {
              "D00596": "0x12",
              "D005A0": "0x80",
              "D02A73": "0x00",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
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
            "recentBlocks": [
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6"
            ]
          },
          {
            "name": "displayLoop005ae8",
            "block": 57835,
            "pc": "0x005AE8",
            "regs": {
              "af": "0x0054",
              "bc": "0xFF0505",
              "de": "0xD40000",
              "hl": "0xD541B4",
              "ix": "0xD005B8",
              "sp": "0xD1A819",
              "flags": {
                "z": true,
                "c": false,
                "n": false
              }
            },
            "ram": {
              "D00596": "0x12",
              "D005A0": "0x80",
              "D02A73": "0x00",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
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
            "recentBlocks": [
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8"
            ]
          },
          {
            "name": "displayLoop005b16",
            "block": 57836,
            "pc": "0x005B16",
            "regs": {
              "af": "0x0054",
              "bc": "0xFF0500",
              "de": "0x0000FF",
              "hl": "0xD541B4",
              "ix": "0xD005B8",
              "sp": "0xD1A816",
              "flags": {
                "z": true,
                "c": false,
                "n": false
              }
            },
            "ram": {
              "D00596": "0x12",
              "D005A0": "0x80",
              "D02A73": "0x00",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
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
            "recentBlocks": [
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16"
            ]
          },
          {
            "name": "displayLoop005b4b",
            "block": 57837,
            "pc": "0x005B4B",
            "regs": {
              "af": "0x007C",
              "bc": "0xFF0500",
              "de": "0x0000FF",
              "hl": "0xD541BE",
              "ix": "0xD005B9",
              "sp": "0xD1A816",
              "flags": {
                "z": true,
                "c": false,
                "n": false
              }
            },
            "ram": {
              "D00596": "0x12",
              "D005A0": "0x80",
              "D02A73": "0x00",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
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
            "recentBlocks": [
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B"
            ]
          },
          {
            "name": "displayLoop005ab6",
            "block": 57838,
            "pc": "0x005AB6",
            "regs": {
              "af": "0xFF02",
              "bc": "0xFF0405",
              "de": "0x0000FF",
              "hl": "0xD005A0",
              "ix": "0xD005B9",
              "sp": "0xD1A819",
              "flags": {
                "z": false,
                "c": false,
                "n": true
              }
            },
            "ram": {
              "D00596": "0x12",
              "D005A0": "0x81",
              "D02A73": "0x00",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
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
            "recentBlocks": [
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6"
            ]
          },
          {
            "name": "displayLoop005ae8",
            "block": 57839,
            "pc": "0x005AE8",
            "regs": {
              "af": "0x0054",
              "bc": "0xFF0405",
              "de": "0xD40000",
              "hl": "0xD54434",
              "ix": "0xD005BA",
              "sp": "0xD1A819",
              "flags": {
                "z": true,
                "c": false,
                "n": false
              }
            },
            "ram": {
              "D00596": "0x12",
              "D005A0": "0x81",
              "D02A73": "0x00",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
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
            "recentBlocks": [
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8"
            ]
          },
          {
            "name": "displayLoop005b16",
            "block": 57840,
            "pc": "0x005B16",
            "regs": {
              "af": "0x0054",
              "bc": "0xFF0500",
              "de": "0x0000FF",
              "hl": "0xD54434",
              "ix": "0xD005BA",
              "sp": "0xD1A816",
              "flags": {
                "z": true,
                "c": false,
                "n": false
              }
            },
            "ram": {
              "D00596": "0x12",
              "D005A0": "0x81",
              "D02A73": "0x00",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
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
            "recentBlocks": [
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16"
            ]
          },
          {
            "name": "displayLoop005b4b",
            "block": 57841,
            "pc": "0x005B4B",
            "regs": {
              "af": "0x007C",
              "bc": "0xFF0500",
              "de": "0x0000FF",
              "hl": "0xD5443E",
              "ix": "0xD005BB",
              "sp": "0xD1A816",
              "flags": {
                "z": true,
                "c": false,
                "n": false
              }
            },
            "ram": {
              "D00596": "0x12",
              "D005A0": "0x81",
              "D02A73": "0x00",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
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
            "recentBlocks": [
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B"
            ]
          },
          {
            "name": "displayLoop005ab6",
            "block": 57842,
            "pc": "0x005AB6",
            "regs": {
              "af": "0xFF02",
              "bc": "0xFF0305",
              "de": "0x0000FF",
              "hl": "0xD005A0",
              "ix": "0xD005BB",
              "sp": "0xD1A819",
              "flags": {
                "z": false,
                "c": false,
                "n": true
              }
            },
            "ram": {
              "D00596": "0x12",
              "D005A0": "0x82",
              "D02A73": "0x00",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
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
            "recentBlocks": [
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6"
            ]
          },
          {
            "name": "displayLoop005ae8",
            "block": 57843,
            "pc": "0x005AE8",
            "regs": {
              "af": "0x0054",
              "bc": "0xFF0305",
              "de": "0xD40000",
              "hl": "0xD546B4",
              "ix": "0xD005BC",
              "sp": "0xD1A819",
              "flags": {
                "z": true,
                "c": false,
                "n": false
              }
            },
            "ram": {
              "D00596": "0x12",
              "D005A0": "0x82",
              "D02A73": "0x00",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
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
            "recentBlocks": [
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8"
            ]
          },
          {
            "name": "displayLoop005b16",
            "block": 57844,
            "pc": "0x005B16",
            "regs": {
              "af": "0x0054",
              "bc": "0xFF0500",
              "de": "0x0000FF",
              "hl": "0xD546B4",
              "ix": "0xD005BC",
              "sp": "0xD1A816",
              "flags": {
                "z": true,
                "c": false,
                "n": false
              }
            },
            "ram": {
              "D00596": "0x12",
              "D005A0": "0x82",
              "D02A73": "0x00",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
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
            "recentBlocks": [
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16"
            ]
          },
          {
            "name": "displayLoop005b4b",
            "block": 57845,
            "pc": "0x005B4B",
            "regs": {
              "af": "0x007C",
              "bc": "0xFF0500",
              "de": "0x0000FF",
              "hl": "0xD546BE",
              "ix": "0xD005BD",
              "sp": "0xD1A816",
              "flags": {
                "z": true,
                "c": false,
                "n": false
              }
            },
            "ram": {
              "D00596": "0x12",
              "D005A0": "0x82",
              "D02A73": "0x00",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
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
            "recentBlocks": [
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B"
            ]
          },
          {
            "name": "displayLoop005ab6",
            "block": 57846,
            "pc": "0x005AB6",
            "regs": {
              "af": "0xFF02",
              "bc": "0xFF0205",
              "de": "0x0000FF",
              "hl": "0xD005A0",
              "ix": "0xD005BD",
              "sp": "0xD1A819",
              "flags": {
                "z": false,
                "c": false,
                "n": true
              }
            },
            "ram": {
              "D00596": "0x12",
              "D005A0": "0x83",
              "D02A73": "0x00",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
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
            "recentBlocks": [
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6"
            ]
          },
          {
            "name": "displayLoop005ae8",
            "block": 57847,
            "pc": "0x005AE8",
            "regs": {
              "af": "0x0054",
              "bc": "0xFF0205",
              "de": "0xD40000",
              "hl": "0xD54934",
              "ix": "0xD005BE",
              "sp": "0xD1A819",
              "flags": {
                "z": true,
                "c": false,
                "n": false
              }
            },
            "ram": {
              "D00596": "0x12",
              "D005A0": "0x83",
              "D02A73": "0x00",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
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
            "recentBlocks": [
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8"
            ]
          },
          {
            "name": "displayLoop005b16",
            "block": 57848,
            "pc": "0x005B16",
            "regs": {
              "af": "0x0054",
              "bc": "0xFF0500",
              "de": "0x0000FF",
              "hl": "0xD54934",
              "ix": "0xD005BE",
              "sp": "0xD1A816",
              "flags": {
                "z": true,
                "c": false,
                "n": false
              }
            },
            "ram": {
              "D00596": "0x12",
              "D005A0": "0x83",
              "D02A73": "0x00",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
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
            "recentBlocks": [
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16"
            ]
          },
          {
            "name": "displayLoop005b4b",
            "block": 57849,
            "pc": "0x005B4B",
            "regs": {
              "af": "0x007C",
              "bc": "0xFF0500",
              "de": "0x0000FF",
              "hl": "0xD5493E",
              "ix": "0xD005BF",
              "sp": "0xD1A816",
              "flags": {
                "z": true,
                "c": false,
                "n": false
              }
            },
            "ram": {
              "D00596": "0x12",
              "D005A0": "0x83",
              "D02A73": "0x00",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
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
            "recentBlocks": [
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B"
            ]
          },
          {
            "name": "displayLoop005ab6",
            "block": 57850,
            "pc": "0x005AB6",
            "regs": {
              "af": "0xFF02",
              "bc": "0xFF0105",
              "de": "0x0000FF",
              "hl": "0xD005A0",
              "ix": "0xD005BF",
              "sp": "0xD1A819",
              "flags": {
                "z": false,
                "c": false,
                "n": true
              }
            },
            "ram": {
              "D00596": "0x12",
              "D005A0": "0x84",
              "D02A73": "0x00",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
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
            "recentBlocks": [
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6"
            ]
          },
          {
            "name": "displayLoop005ae8",
            "block": 57851,
            "pc": "0x005AE8",
            "regs": {
              "af": "0x0054",
              "bc": "0xFF0105",
              "de": "0xD40000",
              "hl": "0xD54BB4",
              "ix": "0xD005C0",
              "sp": "0xD1A819",
              "flags": {
                "z": true,
                "c": false,
                "n": false
              }
            },
            "ram": {
              "D00596": "0x12",
              "D005A0": "0x84",
              "D02A73": "0x00",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
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
            "recentBlocks": [
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8"
            ]
          },
          {
            "name": "displayLoop005b16",
            "block": 57852,
            "pc": "0x005B16",
            "regs": {
              "af": "0x0054",
              "bc": "0xFF0500",
              "de": "0x0000FF",
              "hl": "0xD54BB4",
              "ix": "0xD005C0",
              "sp": "0xD1A816",
              "flags": {
                "z": true,
                "c": false,
                "n": false
              }
            },
            "ram": {
              "D00596": "0x12",
              "D005A0": "0x84",
              "D02A73": "0x00",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
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
            "recentBlocks": [
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16"
            ]
          },
          {
            "name": "displayLoop005b4b",
            "block": 57853,
            "pc": "0x005B4B",
            "regs": {
              "af": "0x007C",
              "bc": "0xFF0500",
              "de": "0x0000FF",
              "hl": "0xD54BBE",
              "ix": "0xD005C1",
              "sp": "0xD1A816",
              "flags": {
                "z": true,
                "c": false,
                "n": false
              }
            },
            "ram": {
              "D00596": "0x12",
              "D005A0": "0x84",
              "D02A73": "0x00",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
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
            "recentBlocks": [
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B"
            ]
          },
          {
            "name": "displayCaller005b92",
            "block": 57854,
            "pc": "0x005B92",
            "regs": {
              "af": "0xFF42",
              "bc": "0xFF0005",
              "de": "0x0000FF",
              "hl": "0xD005A0",
              "ix": "0xD005C1",
              "sp": "0xD1A819",
              "flags": {
                "z": true,
                "c": false,
                "n": true
              }
            },
            "ram": {
              "D00596": "0x12",
              "D005A0": "0x85",
              "D02A73": "0x00",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
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
            "recentBlocks": [
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
      "D00081": "0x00",
      "D0008D": "0x00",
      "D0009F": "0x00",
      "D000A0": "0x00",
      "D000A3": "0x00",
      "D000A8": "0x00",
      "D000C2": "0x00",
      "D000C4": "0x00",
      "D00121": "0x000000",
      "D00124": "0x0A",
      "D00587": "0x00",
      "D00596": "0x13",
      "D0059C": "0x0000DA",
      "D005A0": "0x85",
      "D0058C": "0x00",
      "D0058D": "0x00",
      "D0058E": "0x00",
      "D007CA": "0x0585E9",
      "D007CD": "0x058B19",
      "D007D0": "0x058B7E",
      "D008E0": "0xD1A863",
      "D0231A": "0x000000",
      "D0243A": "0x000000",
      "D0243D": "0x000000",
      "D02590": "0xD3FE81",
      "D02593": "0xD3FE81",
      "D0259A": "0xD3FE81",
      "D0259D": "0xD3FECD",
      "D025C5": "0x0C0000",
      "D02A28": "0x00",
      "D001B8": "0x00",
      "D001D3": "0x00",
      "vramPixels": 3031
    }
  },
  {
    "key": "Digit2",
    "keyResult": {
      "steps": 20278,
      "termination": "after-low-frame-selection",
      "lastPc": "0x0064D0",
      "lastMode": "adl"
    },
    "counts": {
      "outerLoop08c331": 1,
      "cxMain0585e9": 2,
      "getCsc03fa09": 2,
      "eolClear0a2150": 0,
      "eolFill0a2156": 0,
      "bulkClear001879": 1,
      "bulkTail0018f8": 1,
      "scheduler000721": 1,
      "rendererScheduler013d00": 1,
      "rendererScheduler013d11": 1,
      "displayEntry00596e": 87,
      "displayPrep005998": 87,
      "displayCaller0059c6": 87,
      "displayAdvance0059da": 87,
      "displayReset005a02": 0,
      "displayReturn005a19": 87,
      "displayRow005a48": 87,
      "displayRow005a53": 98,
      "displayRow005a75": 87,
      "displayRow005a82": 87,
      "displayRow005a8b": 87,
      "displayRow005a96": 87,
      "displayRow005aa2": 87,
      "displayRow005aae": 87,
      "displayLoop005ab6": 1305,
      "displayLoop005ae8": 1392,
      "displayLoop005b16": 1392,
      "displayLoop005b4b": 1392,
      "displayCaller005b92": 87,
      "status005a19": 87,
      "status0059da": 87,
      "status0059e6": 87,
      "transfer006475": 1,
      "transfer00647d": 1,
      "transfer0064c7": 1,
      "lowCaller0017fc": 2,
      "lowSelect0064d0": 1,
      "lowFrame006cc6": 1,
      "lowLoop006cdf": 0,
      "lowPoll006d38": 0,
      "lowCall006d5d": 0,
      "lowBackedge006d64": 0,
      "hot000a92": 0,
      "hot000bfe": 0,
      "tokenExit08f5e1": 0,
      "tokenGate090992": 0,
      "eolTuple08f54b": 0
    },
    "firstHits": {
      "outerLoop08c331": 1,
      "displayRow005a53": 402,
      "cxMain0585e9": 1953,
      "getCsc03fa09": 4927,
      "bulkClear001879": 10971,
      "bulkTail0018f8": 10972,
      "scheduler000721": 12633,
      "rendererScheduler013d00": 12634,
      "rendererScheduler013d11": 12636,
      "displayCaller0059c6": 12637,
      "displayRow005a75": 12639,
      "displayRow005a82": 12640,
      "displayEntry00596e": 12641,
      "displayPrep005998": 12647,
      "displayRow005a8b": 12648,
      "displayRow005a48": 12649,
      "displayRow005a96": 12650,
      "displayRow005aa2": 12652,
      "displayRow005aae": 12653,
      "displayLoop005ae8": 12654,
      "displayLoop005b16": 12655,
      "displayLoop005b4b": 12656,
      "displayLoop005ab6": 12657,
      "displayCaller005b92": 12717,
      "displayReturn005a19": 12718,
      "status005a19": 12718,
      "displayAdvance0059da": 12719,
      "status0059da": 12719,
      "status0059e6": 12720,
      "transfer006475": 20054,
      "transfer00647d": 20065,
      "lowCaller0017fc": 20151,
      "transfer0064c7": 20190,
      "lowSelect0064d0": 20277,
      "lowFrame006cc6": 20278
    },
    "restorations": [
      {
        "label": "after-0x001879-bulk-clear",
        "atBlock": 10972,
        "atPc": "0x0018F8",
        "afterD007CA": "0x0585E9",
        "afterD008E0": "0xD1A863",
        "afterD02590": "0xD3FE81",
        "afterD00121": "0x000000",
        "afterD00124": "0x00"
      }
    ],
    "branchSamples": [
      {
        "name": "scheduler000721",
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
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000000",
          "D005A0": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
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
          "D02A73": "0x00",
          "D02A75": "0x00",
          "ixBytes": [
            "0xF3",
            "0xED",
            "0x7E",
            "0x5B",
            "0xC3",
            "0x58",
            "0x06",
            "0x00"
          ],
          "hlWord": "0xEDF3"
        },
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
          }
        ],
        "callStackTail": [],
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
          "0x001424",
          "0x0008BB",
          "0x001428",
          "0x00142C",
          "0x000721"
        ]
      },
      {
        "name": "rendererScheduler013d00",
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
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000000",
          "D005A0": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
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
          "D02A73": "0x00",
          "D02A75": "0x00",
          "ixBytes": [
            "0xF3",
            "0xED",
            "0x7E",
            "0x5B",
            "0xC3",
            "0x58",
            "0x06",
            "0x00"
          ],
          "hlWord": "0xEDF3"
        },
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
          }
        ],
        "callStackTail": [
          "0x000721"
        ],
        "recentBlocks": [
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
      {
        "name": "rendererScheduler013d11",
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
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000000",
          "D005A0": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
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
          "D02A73": "0x00",
          "D02A75": "0x00",
          "ixBytes": [
            "0xF3",
            "0xED",
            "0x7E",
            "0x5B",
            "0xC3",
            "0x58",
            "0x06",
            "0x00"
          ],
          "hlWord": "0xEDF3"
        },
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
          }
        ],
        "callStackTail": [
          "0x000721"
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
          "0x00142C",
          "0x000721",
          "0x013D00",
          "0x005BA6",
          "0x013D11"
        ]
      },
      {
        "name": "displayEntry00596e",
        "block": 12641,
        "pc": "0x00596E",
        "state": {
          "pc": "0x00596E",
          "sp": "0xD1A854",
          "ix": "0x000000",
          "iy": "0xD00080",
          "af": "0x2033",
          "bc": "0x000E5A",
          "de": "0xD65800",
          "hl": "0x000380",
          "flags": {
            "z": false,
            "c": true,
            "n": true
          },
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000000",
          "D005A0": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
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
          "D02A73": "0x00",
          "D02A75": "0x00",
          "ixBytes": [
            "0xF3",
            "0xED",
            "0x7E",
            "0x5B",
            "0xC3",
            "0x58",
            "0x06",
            "0x00"
          ],
          "hlWord": "0x85C3"
        },
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
        "stackTop": [
          {
            "addr": "0xD1A854",
            "value": "0x005A8B"
          },
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
          }
        ],
        "callStackTail": [
          "0x000721",
          "0x013D11",
          "0x0059C6",
          "0x0059D6",
          "0x005A75",
          "0x005A82"
        ],
        "recentBlocks": [
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
          "0x0059C6",
          "0x0059D6",
          "0x005A75",
          "0x005A82",
          "0x00596E"
        ]
      },
      {
        "name": "displayPrep005998",
        "block": 12647,
        "pc": "0x005998",
        "state": {
          "pc": "0x005998",
          "sp": "0xD1A851",
          "ix": "0x000000",
          "iy": "0xD00080",
          "af": "0x7F28",
          "bc": "0x00A55A",
          "de": "0xD65800",
          "hl": "0x000380",
          "flags": {
            "z": false,
            "c": false,
            "n": false
          },
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000000",
          "D005A0": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
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
          "D02A73": "0x00",
          "D02A75": "0x00",
          "ixBytes": [
            "0xF3",
            "0xED",
            "0x7E",
            "0x5B",
            "0xC3",
            "0x58",
            "0x06",
            "0x00"
          ],
          "hlWord": "0x85C3"
        },
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
        "stackTop": [
          {
            "addr": "0xD1A851",
            "value": "0x002033"
          },
          {
            "addr": "0xD1A854",
            "value": "0x005A8B"
          },
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
          }
        ],
        "callStackTail": [
          "0x000721",
          "0x013D11",
          "0x0059C6",
          "0x0059D6",
          "0x005A75"
        ],
        "recentBlocks": [
          "0x00142C",
          "0x000721",
          "0x013D00",
          "0x005BA6",
          "0x013D11",
          "0x0059C6",
          "0x0059D6",
          "0x005A75",
          "0x005A82",
          "0x00596E",
          "0x001713",
          "0x0008BB",
          "0x001717",
          "0x001718",
          "0x005974",
          "0x005998"
        ]
      },
      {
        "name": "displayCaller0059c6",
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
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000000",
          "D005A0": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
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
          "D02A73": "0x00",
          "D02A75": "0x00",
          "ixBytes": [
            "0xF3",
            "0xED",
            "0x7E",
            "0x5B",
            "0xC3",
            "0x58",
            "0x06",
            "0x00"
          ],
          "hlWord": "0xEDF3"
        },
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
          }
        ],
        "callStackTail": [
          "0x000721",
          "0x013D11"
        ],
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
          "0x000721",
          "0x013D00",
          "0x005BA6",
          "0x013D11",
          "0x0059C6"
        ]
      },
      {
        "name": "displayAdvance0059da",
        "block": 12719,
        "pc": "0x0059DA",
        "state": {
          "pc": "0x0059DA",
          "sp": "0xD1A869",
          "ix": "0x000000",
          "iy": "0xD00080",
          "af": "0x201B",
          "bc": "0x000E5A",
          "de": "0xD65800",
          "hl": "0x000000",
          "flags": {
            "z": false,
            "c": true,
            "n": true
          },
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000002",
          "D005A0": "0x35",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
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
          "D02A73": "0x00",
          "D02A75": "0x05",
          "ixBytes": [
            "0xF3",
            "0xED",
            "0x7E",
            "0x5B",
            "0xC3",
            "0x58",
            "0x06",
            "0x00"
          ],
          "hlWord": "0xEDF3"
        },
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
          }
        ],
        "callStackTail": [],
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
          "0x0059DA"
        ]
      },
      {
        "name": "displayReturn005a19",
        "block": 12718,
        "pc": "0x005A19",
        "state": {
          "pc": "0x005A19",
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
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000002",
          "D005A0": "0x35",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
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
          "D02A73": "0x00",
          "D02A75": "0x05",
          "ixBytes": [
            "0x00",
            "0x00",
            "0x00",
            "0x00",
            "0x00",
            "0x00",
            "0x00",
            "0x00"
          ],
          "hlWord": "0x0035"
        },
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
          }
        ],
        "callStackTail": [
          "0x000721",
          "0x013D11",
          "0x0059C6"
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
          "0x005A19"
        ]
      },
      {
        "name": "displayRow005a48",
        "block": 12649,
        "pc": "0x005A48",
        "state": {
          "pc": "0x005A48",
          "sp": "0xD1A854",
          "ix": "0xD005A1",
          "iy": "0xD00080",
          "af": "0x0024",
          "bc": "0xFFFFFC",
          "de": "0xD005C5",
          "hl": "0xD005A1",
          "flags": {
            "z": false,
            "c": false,
            "n": false
          },
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000000",
          "D005A0": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
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
          "D02A73": "0x00",
          "D02A75": "0x00",
          "ixBytes": [
            "0x00",
            "0x00",
            "0x00",
            "0x00",
            "0x00",
            "0x00",
            "0x00",
            "0x00"
          ],
          "hlWord": "0x0000"
        },
        "ixFrame": {
          "IX-45": "0x000000",
          "IX-42": "0x000000",
          "IX-39": "0x000000",
          "IX-30": "0x000000",
          "IX-27": "0x000000",
          "IX-24": "0x00",
          "IX-20": "0x950000",
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
        "stackTop": [
          {
            "addr": "0xD1A854",
            "value": "0x005A96"
          },
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
          }
        ],
        "callStackTail": [
          "0x000721",
          "0x013D11",
          "0x0059C6",
          "0x005A8B"
        ],
        "recentBlocks": [
          "0x013D00",
          "0x005BA6",
          "0x013D11",
          "0x0059C6",
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
          "0x005A48"
        ]
      },
      {
        "name": "displayRow005a53",
        "block": 402,
        "pc": "0x005A53",
        "state": {
          "pc": "0x005A53",
          "sp": "0xD1A83C",
          "ix": "0xD005A1",
          "iy": "0xD00080",
          "af": "0x0020",
          "bc": "0xFFFFFC",
          "de": "0xD45A00",
          "hl": "0xD3FD80",
          "flags": {
            "z": false,
            "c": false,
            "n": false
          },
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x1A",
          "D00596": "0x00",
          "D0059C": "0xD4202C",
          "D005A0": "0x00",
          "D0058C": "0x90",
          "D0058D": "0x90",
          "D0058E": "0x90",
          "D00080": "0x08",
          "D00081": "0x04",
          "D0009F": "0x20",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0xD1A8A3",
          "D0243D": "0xD2A815",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
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
          "D02A73": "0x00",
          "D02A75": "0x00",
          "ixBytes": [
            "0x00",
            "0x00",
            "0x00",
            "0x00",
            "0xF8",
            "0xF8",
            "0xF8",
            "0xF8"
          ],
          "hlWord": "0x0000"
        },
        "ixFrame": {
          "IX-45": "0x000000",
          "IX-42": "0x000000",
          "IX-39": "0x000000",
          "IX-30": "0x000000",
          "IX-27": "0x001A00",
          "IX-24": "0x00",
          "IX-20": "0x959090",
          "IX-17": "0x000000",
          "IX-11": "0x000000",
          "IX-8": "0x00",
          "IX-7": "0x00",
          "IX-6": "0x202C00",
          "IX-3": "0x0000D4",
          "IX+0": "0x000000",
          "IX+3": "0xF8F800",
          "IX+6": "0xF8F8F8",
          "IX+9": "0xF8F8F8"
        },
        "stackTop": [
          {
            "addr": "0xD1A83C",
            "value": "0x0A17E9"
          },
          {
            "addr": "0xD1A83F",
            "value": "0xD1A860"
          },
          {
            "addr": "0xD1A842",
            "value": "0xD100A3"
          },
          {
            "addr": "0xD1A845",
            "value": "0xD2A815"
          },
          {
            "addr": "0xD1A848",
            "value": "0x00E000"
          }
        ],
        "callStackTail": [
          "0x0A17D0"
        ],
        "recentBlocks": [
          "0x0A2A37",
          "0x0A2389",
          "0x0A17AE",
          "0x0A17B2",
          "0x0A17B8",
          "0x07BF3E",
          "0x07BF4D",
          "0x07BF5C",
          "0x000380",
          "0x003D85",
          "0x07BF61",
          "0x0A17C5",
          "0x0A2D4C",
          "0x0A17D0",
          "0x00038C",
          "0x005A53"
        ]
      },
      {
        "name": "displayRow005a75",
        "block": 12639,
        "pc": "0x005A75",
        "state": {
          "pc": "0x005A75",
          "sp": "0xD1A866",
          "ix": "0x000000",
          "iy": "0xD00080",
          "af": "0x201B",
          "bc": "0x000E5A",
          "de": "0xD65800",
          "hl": "0x000000",
          "flags": {
            "z": false,
            "c": true,
            "n": true
          },
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000000",
          "D005A0": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
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
          "D02A73": "0x00",
          "D02A75": "0x00",
          "ixBytes": [
            "0xF3",
            "0xED",
            "0x7E",
            "0x5B",
            "0xC3",
            "0x58",
            "0x06",
            "0x00"
          ],
          "hlWord": "0xEDF3"
        },
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
        "stackTop": [
          {
            "addr": "0xD1A866",
            "value": "0x0059DA"
          },
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
          }
        ],
        "callStackTail": [
          "0x000721",
          "0x013D11",
          "0x0059C6",
          "0x0059D6"
        ],
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
          "0x005BA6",
          "0x013D11",
          "0x0059C6",
          "0x0059D6",
          "0x005A75"
        ]
      },
      {
        "name": "displayRow005a82",
        "block": 12640,
        "pc": "0x005A82",
        "state": {
          "pc": "0x005A82",
          "sp": "0xD1A857",
          "ix": "0x000000",
          "iy": "0xD00080",
          "af": "0x2033",
          "bc": "0x000E5A",
          "de": "0xD65800",
          "hl": "0x000000",
          "flags": {
            "z": false,
            "c": true,
            "n": true
          },
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000000",
          "D005A0": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
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
          "D02A73": "0x00",
          "D02A75": "0x00",
          "ixBytes": [
            "0xF3",
            "0xED",
            "0x7E",
            "0x5B",
            "0xC3",
            "0x58",
            "0x06",
            "0x00"
          ],
          "hlWord": "0xEDF3"
        },
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
          }
        ],
        "callStackTail": [
          "0x000721",
          "0x013D11",
          "0x0059C6",
          "0x0059D6",
          "0x005A75"
        ],
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
          "0x013D11",
          "0x0059C6",
          "0x0059D6",
          "0x005A75",
          "0x005A82"
        ]
      },
      {
        "name": "displayRow005a8b",
        "block": 12648,
        "pc": "0x005A8B",
        "state": {
          "pc": "0x005A8B",
          "sp": "0xD1A857",
          "ix": "0x000000",
          "iy": "0xD00080",
          "af": "0x2024",
          "bc": "0xFFFFFC",
          "de": "0xD005C5",
          "hl": "0xD005A1",
          "flags": {
            "z": false,
            "c": false,
            "n": false
          },
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000000",
          "D005A0": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
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
          "D02A73": "0x00",
          "D02A75": "0x00",
          "ixBytes": [
            "0xF3",
            "0xED",
            "0x7E",
            "0x5B",
            "0xC3",
            "0x58",
            "0x06",
            "0x00"
          ],
          "hlWord": "0x0000"
        },
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
          }
        ],
        "callStackTail": [
          "0x000721",
          "0x013D11",
          "0x0059C6"
        ],
        "recentBlocks": [
          "0x000721",
          "0x013D00",
          "0x005BA6",
          "0x013D11",
          "0x0059C6",
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
          "0x005A8B"
        ]
      },
      {
        "name": "displayRow005a96",
        "block": 12650,
        "pc": "0x005A96",
        "state": {
          "pc": "0x005A96",
          "sp": "0xD1A857",
          "ix": "0xD005A1",
          "iy": "0xD00080",
          "af": "0x2520",
          "bc": "0xFFFFFC",
          "de": "0xD005C5",
          "hl": "0xD005A1",
          "flags": {
            "z": false,
            "c": false,
            "n": false
          },
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000000",
          "D005A0": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
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
          "D02A73": "0x00",
          "D02A75": "0x00",
          "ixBytes": [
            "0x00",
            "0x00",
            "0x00",
            "0x00",
            "0x00",
            "0x00",
            "0x00",
            "0x00"
          ],
          "hlWord": "0x0000"
        },
        "ixFrame": {
          "IX-45": "0x000000",
          "IX-42": "0x000000",
          "IX-39": "0x000000",
          "IX-30": "0x000000",
          "IX-27": "0x000000",
          "IX-24": "0x00",
          "IX-20": "0x950000",
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
          }
        ],
        "callStackTail": [
          "0x000721",
          "0x013D11",
          "0x0059C6"
        ],
        "recentBlocks": [
          "0x005BA6",
          "0x013D11",
          "0x0059C6",
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
          "0x005A96"
        ]
      },
      {
        "name": "displayRow005aa2",
        "block": 12652,
        "pc": "0x005AA2",
        "state": {
          "pc": "0x005AA2",
          "sp": "0xD1A857",
          "ix": "0xD005A1",
          "iy": "0xD00080",
          "af": "0x0200",
          "bc": "0xFFFFFC",
          "de": "0xD005C5",
          "hl": "0x000002",
          "flags": {
            "z": false,
            "c": false,
            "n": false
          },
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000000",
          "D005A0": "0x25",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 0
        },
        "memory": {
          "low0059c": "0x095CC3",
          "low005a0": "0x06F3C3",
          "D00596": "0x00",
          "D0059C": "0x000000",
          "D005A0": "0x25",
          "D005A1": "0x00",
          "D005A2": "0x00",
          "D02A73": "0x00",
          "D02A75": "0x00",
          "ixBytes": [
            "0x00",
            "0x00",
            "0x00",
            "0x00",
            "0x00",
            "0x00",
            "0x00",
            "0x00"
          ],
          "hlWord": "0x5B7E"
        },
        "ixFrame": {
          "IX-45": "0x000000",
          "IX-42": "0x000000",
          "IX-39": "0x000000",
          "IX-30": "0x000000",
          "IX-27": "0x000000",
          "IX-24": "0x00",
          "IX-20": "0x950000",
          "IX-17": "0x000000",
          "IX-11": "0x000000",
          "IX-8": "0x00",
          "IX-7": "0x00",
          "IX-6": "0x000000",
          "IX-3": "0x250000",
          "IX+0": "0x000000",
          "IX+3": "0x000000",
          "IX+6": "0x000000",
          "IX+9": "0x000000"
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
          }
        ],
        "callStackTail": [
          "0x000721",
          "0x013D11",
          "0x0059C6"
        ],
        "recentBlocks": [
          "0x0059C6",
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
          "0x005AA2"
        ]
      },
      {
        "name": "displayRow005aae",
        "block": 12653,
        "pc": "0x005AAE",
        "state": {
          "pc": "0x005AAE",
          "sp": "0xD1A857",
          "ix": "0xD005A1",
          "iy": "0xD00080",
          "af": "0x0254",
          "bc": "0xFFFFFC",
          "de": "0xD0050C",
          "hl": "0x000002",
          "flags": {
            "z": true,
            "c": false,
            "n": false
          },
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000000",
          "D005A0": "0x25",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 0
        },
        "memory": {
          "low0059c": "0x095CC3",
          "low005a0": "0x06F3C3",
          "D00596": "0x00",
          "D0059C": "0x000000",
          "D005A0": "0x25",
          "D005A1": "0x00",
          "D005A2": "0x00",
          "D02A73": "0x00",
          "D02A75": "0x00",
          "ixBytes": [
            "0x00",
            "0x00",
            "0x00",
            "0x00",
            "0x00",
            "0x00",
            "0x00",
            "0x00"
          ],
          "hlWord": "0x5B7E"
        },
        "ixFrame": {
          "IX-45": "0x000000",
          "IX-42": "0x000000",
          "IX-39": "0x000000",
          "IX-30": "0x000000",
          "IX-27": "0x000000",
          "IX-24": "0x00",
          "IX-20": "0x950000",
          "IX-17": "0x000000",
          "IX-11": "0x000000",
          "IX-8": "0x00",
          "IX-7": "0x00",
          "IX-6": "0x000000",
          "IX-3": "0x250000",
          "IX+0": "0x000000",
          "IX+3": "0x000000",
          "IX+6": "0x000000",
          "IX+9": "0x000000"
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
          }
        ],
        "callStackTail": [
          "0x000721",
          "0x013D11",
          "0x0059C6"
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
          "0x005AAE"
        ]
      },
      {
        "name": "displayLoop005ab6",
        "block": 12657,
        "pc": "0x005AB6",
        "state": {
          "pc": "0x005AB6",
          "sp": "0xD1A857",
          "ix": "0xD005A3",
          "iy": "0xD00080",
          "af": "0xFF1A",
          "bc": "0xFF0F05",
          "de": "0x0000FF",
          "hl": "0xD005A0",
          "flags": {
            "z": false,
            "c": false,
            "n": true
          },
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000002",
          "D005A0": "0x26",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 0
        },
        "memory": {
          "low0059c": "0x095CC3",
          "low005a0": "0x06F3C3",
          "D00596": "0x00",
          "D0059C": "0x000002",
          "D005A0": "0x26",
          "D005A1": "0x00",
          "D005A2": "0x00",
          "D02A73": "0x00",
          "D02A75": "0x05",
          "ixBytes": [
            "0x00",
            "0x00",
            "0x00",
            "0x00",
            "0x00",
            "0x00",
            "0x00",
            "0x00"
          ],
          "hlWord": "0x0026"
        },
        "ixFrame": {
          "IX-45": "0x000000",
          "IX-42": "0x000000",
          "IX-39": "0x000000",
          "IX-30": "0x000000",
          "IX-27": "0x000000",
          "IX-24": "0x00",
          "IX-20": "0x000095",
          "IX-17": "0x000000",
          "IX-11": "0x000000",
          "IX-8": "0x00",
          "IX-7": "0x02",
          "IX-6": "0x000000",
          "IX-3": "0x000026",
          "IX+0": "0x000000",
          "IX+3": "0x000000",
          "IX+6": "0x000000",
          "IX+9": "0x000000"
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
          }
        ],
        "callStackTail": [
          "0x000721",
          "0x013D11",
          "0x0059C6"
        ],
        "recentBlocks": [
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
        ]
      },
      {
        "name": "displayLoop005ae8",
        "block": 12654,
        "pc": "0x005AE8",
        "state": {
          "pc": "0x005AE8",
          "sp": "0xD1A857",
          "ix": "0xD005A2",
          "iy": "0xD00080",
          "af": "0x0054",
          "bc": "0xFF10FC",
          "de": "0xD40000",
          "hl": "0xD45C84",
          "flags": {
            "z": true,
            "c": false,
            "n": false
          },
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000002",
          "D005A0": "0x25",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 0
        },
        "memory": {
          "low0059c": "0x095CC3",
          "low005a0": "0x06F3C3",
          "D00596": "0x00",
          "D0059C": "0x000002",
          "D005A0": "0x25",
          "D005A1": "0x00",
          "D005A2": "0x00",
          "D02A73": "0x00",
          "D02A75": "0x00",
          "ixBytes": [
            "0x00",
            "0x00",
            "0x00",
            "0x00",
            "0x00",
            "0x00",
            "0x00",
            "0x00"
          ],
          "hlWord": "0xFFFF"
        },
        "ixFrame": {
          "IX-45": "0x000000",
          "IX-42": "0x000000",
          "IX-39": "0x000000",
          "IX-30": "0x000000",
          "IX-27": "0x000000",
          "IX-24": "0x00",
          "IX-20": "0x009500",
          "IX-17": "0x000000",
          "IX-11": "0x000000",
          "IX-8": "0x00",
          "IX-7": "0x00",
          "IX-6": "0x000002",
          "IX-3": "0x002500",
          "IX+0": "0x000000",
          "IX+3": "0x000000",
          "IX+6": "0x000000",
          "IX+9": "0x000000"
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
          }
        ],
        "callStackTail": [
          "0x000721",
          "0x013D11",
          "0x0059C6"
        ],
        "recentBlocks": [
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
          "0x005AE8"
        ]
      },
      {
        "name": "displayLoop005b16",
        "block": 12655,
        "pc": "0x005B16",
        "state": {
          "pc": "0x005B16",
          "sp": "0xD1A854",
          "ix": "0xD005A2",
          "iy": "0xD00080",
          "af": "0x0054",
          "bc": "0xFF0500",
          "de": "0x0000FF",
          "hl": "0xD45C84",
          "flags": {
            "z": true,
            "c": false,
            "n": false
          },
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000002",
          "D005A0": "0x25",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 0
        },
        "memory": {
          "low0059c": "0x095CC3",
          "low005a0": "0x06F3C3",
          "D00596": "0x00",
          "D0059C": "0x000002",
          "D005A0": "0x25",
          "D005A1": "0x00",
          "D005A2": "0x00",
          "D02A73": "0x00",
          "D02A75": "0x05",
          "ixBytes": [
            "0x00",
            "0x00",
            "0x00",
            "0x00",
            "0x00",
            "0x00",
            "0x00",
            "0x00"
          ],
          "hlWord": "0xFFFF"
        },
        "ixFrame": {
          "IX-45": "0x000000",
          "IX-42": "0x000000",
          "IX-39": "0x000000",
          "IX-30": "0x000000",
          "IX-27": "0x000000",
          "IX-24": "0x00",
          "IX-20": "0x009500",
          "IX-17": "0x000000",
          "IX-11": "0x000000",
          "IX-8": "0x00",
          "IX-7": "0x00",
          "IX-6": "0x000002",
          "IX-3": "0x002500",
          "IX+0": "0x000000",
          "IX+3": "0x000000",
          "IX+6": "0x000000",
          "IX+9": "0x000000"
        },
        "stackTop": [
          {
            "addr": "0xD1A854",
            "value": "0xFF1005"
          },
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
          }
        ],
        "callStackTail": [
          "0x000721",
          "0x013D11",
          "0x0059C6",
          "0x005AE8"
        ],
        "recentBlocks": [
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
          "0x005B16"
        ]
      },
      {
        "name": "displayLoop005b4b",
        "block": 12656,
        "pc": "0x005B4B",
        "state": {
          "pc": "0x005B4B",
          "sp": "0xD1A854",
          "ix": "0xD005A3",
          "iy": "0xD00080",
          "af": "0x007C",
          "bc": "0xFF0500",
          "de": "0x0000FF",
          "hl": "0xD45C8E",
          "flags": {
            "z": true,
            "c": false,
            "n": false
          },
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000002",
          "D005A0": "0x25",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 0
        },
        "memory": {
          "low0059c": "0x095CC3",
          "low005a0": "0x06F3C3",
          "D00596": "0x00",
          "D0059C": "0x000002",
          "D005A0": "0x25",
          "D005A1": "0x00",
          "D005A2": "0x00",
          "D02A73": "0x00",
          "D02A75": "0x05",
          "ixBytes": [
            "0x00",
            "0x00",
            "0x00",
            "0x00",
            "0x00",
            "0x00",
            "0x00",
            "0x00"
          ],
          "hlWord": "0xFFFF"
        },
        "ixFrame": {
          "IX-45": "0x000000",
          "IX-42": "0x000000",
          "IX-39": "0x000000",
          "IX-30": "0x000000",
          "IX-27": "0x000000",
          "IX-24": "0x00",
          "IX-20": "0x000095",
          "IX-17": "0x000000",
          "IX-11": "0x000000",
          "IX-8": "0x00",
          "IX-7": "0x02",
          "IX-6": "0x000000",
          "IX-3": "0x000025",
          "IX+0": "0x000000",
          "IX+3": "0x000000",
          "IX+6": "0x000000",
          "IX+9": "0x000000"
        },
        "stackTop": [
          {
            "addr": "0xD1A854",
            "value": "0xFF1005"
          },
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
          }
        ],
        "callStackTail": [
          "0x000721",
          "0x013D11",
          "0x0059C6",
          "0x005AE8"
        ],
        "recentBlocks": [
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
          "0x005B4B"
        ]
      },
      {
        "name": "displayCaller005b92",
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
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000002",
          "D005A0": "0x35",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
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
          "D02A73": "0x00",
          "D02A75": "0x05",
          "ixBytes": [
            "0x00",
            "0x00",
            "0x00",
            "0x00",
            "0x00",
            "0x00",
            "0x00",
            "0x00"
          ],
          "hlWord": "0x0035"
        },
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
          }
        ],
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
          "0x005B92"
        ]
      },
      {
        "name": "status005a19",
        "block": 12718,
        "pc": "0x005A19",
        "state": {
          "pc": "0x005A19",
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
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000002",
          "D005A0": "0x35",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
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
          "D02A73": "0x00",
          "D02A75": "0x05",
          "ixBytes": [
            "0x00",
            "0x00",
            "0x00",
            "0x00",
            "0x00",
            "0x00",
            "0x00",
            "0x00"
          ],
          "hlWord": "0x0035"
        },
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
          }
        ],
        "callStackTail": [
          "0x000721",
          "0x013D11",
          "0x0059C6"
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
          "0x005A19"
        ]
      },
      {
        "name": "status0059da",
        "block": 12719,
        "pc": "0x0059DA",
        "state": {
          "pc": "0x0059DA",
          "sp": "0xD1A869",
          "ix": "0x000000",
          "iy": "0xD00080",
          "af": "0x201B",
          "bc": "0x000E5A",
          "de": "0xD65800",
          "hl": "0x000000",
          "flags": {
            "z": false,
            "c": true,
            "n": true
          },
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000002",
          "D005A0": "0x35",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
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
          "D02A73": "0x00",
          "D02A75": "0x05",
          "ixBytes": [
            "0xF3",
            "0xED",
            "0x7E",
            "0x5B",
            "0xC3",
            "0x58",
            "0x06",
            "0x00"
          ],
          "hlWord": "0xEDF3"
        },
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
          }
        ],
        "callStackTail": [],
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
          "0x0059DA"
        ]
      },
      {
        "name": "status0059e6",
        "block": 12720,
        "pc": "0x0059E6",
        "state": {
          "pc": "0x0059E6",
          "sp": "0xD1A869",
          "ix": "0x000000",
          "iy": "0xD00080",
          "af": "0x01B3",
          "bc": "0x000E5A",
          "de": "0xD65800",
          "hl": "0xD00596",
          "flags": {
            "z": false,
            "c": true,
            "n": true
          },
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x01",
          "D0059C": "0x000002",
          "D005A0": "0x35",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 0
        },
        "memory": {
          "low0059c": "0x095CC3",
          "low005a0": "0x06F3C3",
          "D00596": "0x01",
          "D0059C": "0x000002",
          "D005A0": "0x35",
          "D005A1": "0x00",
          "D005A2": "0x00",
          "D02A73": "0x00",
          "D02A75": "0x05",
          "ixBytes": [
            "0xF3",
            "0xED",
            "0x7E",
            "0x5B",
            "0xC3",
            "0x58",
            "0x06",
            "0x00"
          ],
          "hlWord": "0x0001"
        },
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
          }
        ],
        "callStackTail": [],
        "recentBlocks": [
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
          "0x0059E6"
        ]
      },
      {
        "name": "transfer006475",
        "block": 20054,
        "pc": "0x006475",
        "state": {
          "pc": "0x006475",
          "sp": "0xD1A83D",
          "ix": "0xD1A866",
          "iy": "0xD00080",
          "af": "0x0042",
          "bc": "0x000000",
          "de": "0x008000",
          "hl": "0x020001",
          "flags": {
            "z": true,
            "c": false,
            "n": true
          },
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x0A",
          "D0059C": "0x00006E",
          "D005A0": "0xD5",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
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
          "D02A73": "0x38",
          "D02A75": "0x05",
          "ixBytes": [
            "0x78",
            "0xA8",
            "0xD1",
            "0x68",
            "0x39",
            "0x01",
            "0x00",
            "0x00"
          ],
          "hlWord": "0x000F"
        },
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
          }
        ],
        "callStackTail": [
          "0x00072D",
          "0x0138F1"
        ],
        "recentBlocks": [
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
        "block": 20065,
        "pc": "0x00647D",
        "state": {
          "pc": "0x00647D",
          "sp": "0xD1A83D",
          "ix": "0xD1A866",
          "iy": "0xD00080",
          "af": "0x090C",
          "bc": "0x09D6B4",
          "de": "0x008000",
          "hl": "0x0BD6BA",
          "flags": {
            "z": false,
            "c": false,
            "n": false
          },
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x0A",
          "D0059C": "0x00006E",
          "D005A0": "0xD5",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
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
          "D02A73": "0x38",
          "D02A75": "0x05",
          "ixBytes": [
            "0x78",
            "0xA8",
            "0xD1",
            "0x68",
            "0x39",
            "0x01",
            "0x00",
            "0x00"
          ],
          "hlWord": "0x3E02"
        },
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
          }
        ],
        "callStackTail": [
          "0x00072D"
        ],
        "recentBlocks": [
          "0x01394E",
          "0x01395B",
          "0x006447",
          "0x00646C",
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
        "block": 20190,
        "pc": "0x0064C7",
        "state": {
          "pc": "0x0064C7",
          "sp": "0xD1A83D",
          "ix": "0xD1A866",
          "iy": "0xD00080",
          "af": "0x0A42",
          "bc": "0x002000",
          "de": "0x000240",
          "hl": "0x000000",
          "flags": {
            "z": true,
            "c": false,
            "n": true
          },
          "D00121": "0x000000",
          "D00124": "0x0A",
          "D00587": "0x00",
          "D00596": "0x13",
          "D0059C": "0x0000DA",
          "D005A0": "0x85",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
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
          "D02A73": "0x00",
          "D02A75": "0x05",
          "ixBytes": [
            "0x78",
            "0xA8",
            "0xD1",
            "0x68",
            "0x39",
            "0x01",
            "0x00",
            "0x00"
          ],
          "hlWord": "0xEDF3"
        },
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
          }
        ],
        "callStackTail": [],
        "recentBlocks": [
          "0x001C81",
          "0x001C82",
          "0x001C48",
          "0x001C33",
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
        "name": "lowCaller0017fc",
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
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x13",
          "D0059C": "0x0000DA",
          "D005A0": "0x85",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
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
          "D02A73": "0x00",
          "D02A75": "0x05",
          "ixBytes": [
            "0x78",
            "0xA8",
            "0xD1",
            "0x68",
            "0x39",
            "0x01",
            "0x00",
            "0x00"
          ],
          "hlWord": "0x2D2F"
        },
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
          }
        ],
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
          "0x005B92",
          "0x005A19",
          "0x0059DA",
          "0x0059E6",
          "0x0017FC"
        ]
      },
      {
        "name": "lowSelect0064d0",
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
          "D00121": "0x000000",
          "D00124": "0x0A",
          "D00587": "0x00",
          "D00596": "0x13",
          "D0059C": "0x0000DA",
          "D005A0": "0x85",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
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
          "D02A73": "0x00",
          "D02A75": "0x05",
          "ixBytes": [
            "0x78",
            "0xA8",
            "0xD1",
            "0x68",
            "0x39",
            "0x01",
            "0x00",
            "0x00"
          ],
          "hlWord": "0x5C2D"
        },
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
          }
        ],
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
          "0x005B92",
          "0x005A19",
          "0x0059DA",
          "0x0059E6",
          "0x0017FC",
          "0x0064D0"
        ]
      },
      {
        "name": "lowFrame006cc6",
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
          "D00121": "0x000000",
          "D00124": "0x0A",
          "D00587": "0x00",
          "D00596": "0x13",
          "D0059C": "0x0000DA",
          "D005A0": "0x85",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
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
          "D02A73": "0x00",
          "D02A75": "0x05",
          "ixBytes": [
            "0x78",
            "0xA8",
            "0xD1",
            "0x68",
            "0x39",
            "0x01",
            "0x00",
            "0x00"
          ],
          "hlWord": "0xEDF3"
        },
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
          }
        ],
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
    "branchOutcomes": [
      {
        "name": "scheduler000721",
        "targetPc": "0x000721",
        "beforeBlock": 12633,
        "afterBlock": 12634,
        "afterPc": "0x013D00",
        "before": {
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
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000000",
          "D005A0": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 0
        },
        "after": {
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
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000000",
          "D005A0": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 0
        }
      },
      {
        "name": "rendererScheduler013d00",
        "targetPc": "0x013D00",
        "beforeBlock": 12634,
        "afterBlock": 12635,
        "afterPc": "0x005BA6",
        "before": {
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
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000000",
          "D005A0": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 0
        },
        "after": {
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
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000000",
          "D005A0": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 0
        }
      },
      {
        "name": "rendererScheduler013d11",
        "targetPc": "0x013D11",
        "beforeBlock": 12636,
        "afterBlock": 12637,
        "afterPc": "0x0059C6",
        "before": {
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
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000000",
          "D005A0": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 0
        },
        "after": {
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
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000000",
          "D005A0": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 0
        }
      },
      {
        "name": "displayEntry00596e",
        "targetPc": "0x00596E",
        "beforeBlock": 12641,
        "afterBlock": 12642,
        "afterPc": "0x001713",
        "before": {
          "pc": "0x00596E",
          "sp": "0xD1A854",
          "ix": "0x000000",
          "iy": "0xD00080",
          "af": "0x2033",
          "bc": "0x000E5A",
          "de": "0xD65800",
          "hl": "0x000380",
          "flags": {
            "z": false,
            "c": true,
            "n": true
          },
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000000",
          "D005A0": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 0
        },
        "after": {
          "pc": "0x001713",
          "sp": "0xD1A84B",
          "ix": "0x000000",
          "iy": "0xD00080",
          "af": "0x2033",
          "bc": "0x000E5A",
          "de": "0xD65800",
          "hl": "0x000380",
          "flags": {
            "z": false,
            "c": true,
            "n": true
          },
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000000",
          "D005A0": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 0
        }
      },
      {
        "name": "displayPrep005998",
        "targetPc": "0x005998",
        "beforeBlock": 12647,
        "afterBlock": 12648,
        "afterPc": "0x005A8B",
        "before": {
          "pc": "0x005998",
          "sp": "0xD1A851",
          "ix": "0x000000",
          "iy": "0xD00080",
          "af": "0x7F28",
          "bc": "0x00A55A",
          "de": "0xD65800",
          "hl": "0x000380",
          "flags": {
            "z": false,
            "c": false,
            "n": false
          },
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000000",
          "D005A0": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 0
        },
        "after": {
          "pc": "0x005A8B",
          "sp": "0xD1A857",
          "ix": "0x000000",
          "iy": "0xD00080",
          "af": "0x2024",
          "bc": "0xFFFFFC",
          "de": "0xD005C5",
          "hl": "0xD005A1",
          "flags": {
            "z": false,
            "c": false,
            "n": false
          },
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000000",
          "D005A0": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 0
        }
      },
      {
        "name": "displayCaller0059c6",
        "targetPc": "0x0059C6",
        "beforeBlock": 12637,
        "afterBlock": 12638,
        "afterPc": "0x0059D6",
        "before": {
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
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000000",
          "D005A0": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 0
        },
        "after": {
          "pc": "0x0059D6",
          "sp": "0xD1A869",
          "ix": "0x000000",
          "iy": "0xD00080",
          "af": "0x201B",
          "bc": "0x000E5A",
          "de": "0xD65800",
          "hl": "0x000000",
          "flags": {
            "z": false,
            "c": true,
            "n": true
          },
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000000",
          "D005A0": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 0
        }
      },
      {
        "name": "displayAdvance0059da",
        "targetPc": "0x0059DA",
        "beforeBlock": 12719,
        "afterBlock": 12720,
        "afterPc": "0x0059E6",
        "before": {
          "pc": "0x0059DA",
          "sp": "0xD1A869",
          "ix": "0x000000",
          "iy": "0xD00080",
          "af": "0x201B",
          "bc": "0x000E5A",
          "de": "0xD65800",
          "hl": "0x000000",
          "flags": {
            "z": false,
            "c": true,
            "n": true
          },
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000002",
          "D005A0": "0x35",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 0
        },
        "after": {
          "pc": "0x0059E6",
          "sp": "0xD1A869",
          "ix": "0x000000",
          "iy": "0xD00080",
          "af": "0x01B3",
          "bc": "0x000E5A",
          "de": "0xD65800",
          "hl": "0xD00596",
          "flags": {
            "z": false,
            "c": true,
            "n": true
          },
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x01",
          "D0059C": "0x000002",
          "D005A0": "0x35",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 0
        }
      },
      {
        "name": "displayReturn005a19",
        "targetPc": "0x005A19",
        "beforeBlock": 12718,
        "afterBlock": 12719,
        "afterPc": "0x0059DA",
        "before": {
          "pc": "0x005A19",
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
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000002",
          "D005A0": "0x35",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 0
        },
        "after": {
          "pc": "0x0059DA",
          "sp": "0xD1A869",
          "ix": "0x000000",
          "iy": "0xD00080",
          "af": "0x201B",
          "bc": "0x000E5A",
          "de": "0xD65800",
          "hl": "0x000000",
          "flags": {
            "z": false,
            "c": true,
            "n": true
          },
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000002",
          "D005A0": "0x35",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 0
        }
      },
      {
        "name": "displayRow005a48",
        "targetPc": "0x005A48",
        "beforeBlock": 12649,
        "afterBlock": 12650,
        "afterPc": "0x005A96",
        "before": {
          "pc": "0x005A48",
          "sp": "0xD1A854",
          "ix": "0xD005A1",
          "iy": "0xD00080",
          "af": "0x0024",
          "bc": "0xFFFFFC",
          "de": "0xD005C5",
          "hl": "0xD005A1",
          "flags": {
            "z": false,
            "c": false,
            "n": false
          },
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000000",
          "D005A0": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 0
        },
        "after": {
          "pc": "0x005A96",
          "sp": "0xD1A857",
          "ix": "0xD005A1",
          "iy": "0xD00080",
          "af": "0x2520",
          "bc": "0xFFFFFC",
          "de": "0xD005C5",
          "hl": "0xD005A1",
          "flags": {
            "z": false,
            "c": false,
            "n": false
          },
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000000",
          "D005A0": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 0
        }
      },
      {
        "name": "displayRow005a53",
        "targetPc": "0x005A53",
        "beforeBlock": 402,
        "afterBlock": 403,
        "afterPc": "0x0A17E9",
        "before": {
          "pc": "0x005A53",
          "sp": "0xD1A83C",
          "ix": "0xD005A1",
          "iy": "0xD00080",
          "af": "0x0020",
          "bc": "0xFFFFFC",
          "de": "0xD45A00",
          "hl": "0xD3FD80",
          "flags": {
            "z": false,
            "c": false,
            "n": false
          },
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x1A",
          "D00596": "0x00",
          "D0059C": "0xD4202C",
          "D005A0": "0x00",
          "D0058C": "0x90",
          "D0058D": "0x90",
          "D0058E": "0x90",
          "D00080": "0x08",
          "D00081": "0x04",
          "D0009F": "0x20",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0xD1A8A3",
          "D0243D": "0xD2A815",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 8549
        },
        "after": {
          "pc": "0x0A17E9",
          "sp": "0xD1A83F",
          "ix": "0xD005A1",
          "iy": "0xD00080",
          "af": "0x0200",
          "bc": "0xFFFFFC",
          "de": "0xD45A00",
          "hl": "0x000002",
          "flags": {
            "z": false,
            "c": false,
            "n": false
          },
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x1A",
          "D00596": "0x00",
          "D0059C": "0xD4202C",
          "D005A0": "0x00",
          "D0058C": "0x90",
          "D0058D": "0x90",
          "D0058E": "0x90",
          "D00080": "0x08",
          "D00081": "0x04",
          "D0009F": "0x20",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0xD1A8A3",
          "D0243D": "0xD2A815",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 8549
        }
      },
      {
        "name": "displayRow005a75",
        "targetPc": "0x005A75",
        "beforeBlock": 12639,
        "afterBlock": 12640,
        "afterPc": "0x005A82",
        "before": {
          "pc": "0x005A75",
          "sp": "0xD1A866",
          "ix": "0x000000",
          "iy": "0xD00080",
          "af": "0x201B",
          "bc": "0x000E5A",
          "de": "0xD65800",
          "hl": "0x000000",
          "flags": {
            "z": false,
            "c": true,
            "n": true
          },
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000000",
          "D005A0": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 0
        },
        "after": {
          "pc": "0x005A82",
          "sp": "0xD1A857",
          "ix": "0x000000",
          "iy": "0xD00080",
          "af": "0x2033",
          "bc": "0x000E5A",
          "de": "0xD65800",
          "hl": "0x000000",
          "flags": {
            "z": false,
            "c": true,
            "n": true
          },
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000000",
          "D005A0": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 0
        }
      },
      {
        "name": "displayRow005a82",
        "targetPc": "0x005A82",
        "beforeBlock": 12640,
        "afterBlock": 12641,
        "afterPc": "0x00596E",
        "before": {
          "pc": "0x005A82",
          "sp": "0xD1A857",
          "ix": "0x000000",
          "iy": "0xD00080",
          "af": "0x2033",
          "bc": "0x000E5A",
          "de": "0xD65800",
          "hl": "0x000000",
          "flags": {
            "z": false,
            "c": true,
            "n": true
          },
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000000",
          "D005A0": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 0
        },
        "after": {
          "pc": "0x00596E",
          "sp": "0xD1A854",
          "ix": "0x000000",
          "iy": "0xD00080",
          "af": "0x2033",
          "bc": "0x000E5A",
          "de": "0xD65800",
          "hl": "0x000380",
          "flags": {
            "z": false,
            "c": true,
            "n": true
          },
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000000",
          "D005A0": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 0
        }
      },
      {
        "name": "displayRow005a8b",
        "targetPc": "0x005A8B",
        "beforeBlock": 12648,
        "afterBlock": 12649,
        "afterPc": "0x005A48",
        "before": {
          "pc": "0x005A8B",
          "sp": "0xD1A857",
          "ix": "0x000000",
          "iy": "0xD00080",
          "af": "0x2024",
          "bc": "0xFFFFFC",
          "de": "0xD005C5",
          "hl": "0xD005A1",
          "flags": {
            "z": false,
            "c": false,
            "n": false
          },
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000000",
          "D005A0": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 0
        },
        "after": {
          "pc": "0x005A48",
          "sp": "0xD1A854",
          "ix": "0xD005A1",
          "iy": "0xD00080",
          "af": "0x0024",
          "bc": "0xFFFFFC",
          "de": "0xD005C5",
          "hl": "0xD005A1",
          "flags": {
            "z": false,
            "c": false,
            "n": false
          },
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000000",
          "D005A0": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 0
        }
      },
      {
        "name": "displayRow005a96",
        "targetPc": "0x005A96",
        "beforeBlock": 12650,
        "afterBlock": 12651,
        "afterPc": "0x005A53",
        "before": {
          "pc": "0x005A96",
          "sp": "0xD1A857",
          "ix": "0xD005A1",
          "iy": "0xD00080",
          "af": "0x2520",
          "bc": "0xFFFFFC",
          "de": "0xD005C5",
          "hl": "0xD005A1",
          "flags": {
            "z": false,
            "c": false,
            "n": false
          },
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000000",
          "D005A0": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 0
        },
        "after": {
          "pc": "0x005A53",
          "sp": "0xD1A854",
          "ix": "0xD005A1",
          "iy": "0xD00080",
          "af": "0x0020",
          "bc": "0xFFFFFC",
          "de": "0xD005C5",
          "hl": "0xD005A1",
          "flags": {
            "z": false,
            "c": false,
            "n": false
          },
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000000",
          "D005A0": "0x25",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 0
        }
      },
      {
        "name": "displayRow005aa2",
        "targetPc": "0x005AA2",
        "beforeBlock": 12652,
        "afterBlock": 12653,
        "afterPc": "0x005AAE",
        "before": {
          "pc": "0x005AA2",
          "sp": "0xD1A857",
          "ix": "0xD005A1",
          "iy": "0xD00080",
          "af": "0x0200",
          "bc": "0xFFFFFC",
          "de": "0xD005C5",
          "hl": "0x000002",
          "flags": {
            "z": false,
            "c": false,
            "n": false
          },
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000000",
          "D005A0": "0x25",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 0
        },
        "after": {
          "pc": "0x005AAE",
          "sp": "0xD1A857",
          "ix": "0xD005A1",
          "iy": "0xD00080",
          "af": "0x0254",
          "bc": "0xFFFFFC",
          "de": "0xD0050C",
          "hl": "0x000002",
          "flags": {
            "z": true,
            "c": false,
            "n": false
          },
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000000",
          "D005A0": "0x25",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 0
        }
      },
      {
        "name": "displayRow005aae",
        "targetPc": "0x005AAE",
        "beforeBlock": 12653,
        "afterBlock": 12654,
        "afterPc": "0x005AE8",
        "before": {
          "pc": "0x005AAE",
          "sp": "0xD1A857",
          "ix": "0xD005A1",
          "iy": "0xD00080",
          "af": "0x0254",
          "bc": "0xFFFFFC",
          "de": "0xD0050C",
          "hl": "0x000002",
          "flags": {
            "z": true,
            "c": false,
            "n": false
          },
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000000",
          "D005A0": "0x25",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 0
        },
        "after": {
          "pc": "0x005AE8",
          "sp": "0xD1A857",
          "ix": "0xD005A2",
          "iy": "0xD00080",
          "af": "0x0054",
          "bc": "0xFF10FC",
          "de": "0xD40000",
          "hl": "0xD45C84",
          "flags": {
            "z": true,
            "c": false,
            "n": false
          },
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000002",
          "D005A0": "0x25",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 0
        }
      },
      {
        "name": "displayLoop005ab6",
        "targetPc": "0x005AB6",
        "beforeBlock": 12657,
        "afterBlock": 12658,
        "afterPc": "0x005AE8",
        "before": {
          "pc": "0x005AB6",
          "sp": "0xD1A857",
          "ix": "0xD005A3",
          "iy": "0xD00080",
          "af": "0xFF1A",
          "bc": "0xFF0F05",
          "de": "0x0000FF",
          "hl": "0xD005A0",
          "flags": {
            "z": false,
            "c": false,
            "n": true
          },
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000002",
          "D005A0": "0x26",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 0
        },
        "after": {
          "pc": "0x005AE8",
          "sp": "0xD1A857",
          "ix": "0xD005A4",
          "iy": "0xD00080",
          "af": "0x005C",
          "bc": "0xFF0F05",
          "de": "0xD40000",
          "hl": "0xD45F04",
          "flags": {
            "z": true,
            "c": false,
            "n": false
          },
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000002",
          "D005A0": "0x26",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 0
        }
      },
      {
        "name": "displayLoop005ae8",
        "targetPc": "0x005AE8",
        "beforeBlock": 12654,
        "afterBlock": 12655,
        "afterPc": "0x005B16",
        "before": {
          "pc": "0x005AE8",
          "sp": "0xD1A857",
          "ix": "0xD005A2",
          "iy": "0xD00080",
          "af": "0x0054",
          "bc": "0xFF10FC",
          "de": "0xD40000",
          "hl": "0xD45C84",
          "flags": {
            "z": true,
            "c": false,
            "n": false
          },
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000002",
          "D005A0": "0x25",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 0
        },
        "after": {
          "pc": "0x005B16",
          "sp": "0xD1A854",
          "ix": "0xD005A2",
          "iy": "0xD00080",
          "af": "0x0054",
          "bc": "0xFF0500",
          "de": "0x0000FF",
          "hl": "0xD45C84",
          "flags": {
            "z": true,
            "c": false,
            "n": false
          },
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000002",
          "D005A0": "0x25",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 0
        }
      },
      {
        "name": "displayLoop005b16",
        "targetPc": "0x005B16",
        "beforeBlock": 12655,
        "afterBlock": 12656,
        "afterPc": "0x005B4B",
        "before": {
          "pc": "0x005B16",
          "sp": "0xD1A854",
          "ix": "0xD005A2",
          "iy": "0xD00080",
          "af": "0x0054",
          "bc": "0xFF0500",
          "de": "0x0000FF",
          "hl": "0xD45C84",
          "flags": {
            "z": true,
            "c": false,
            "n": false
          },
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000002",
          "D005A0": "0x25",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 0
        },
        "after": {
          "pc": "0x005B4B",
          "sp": "0xD1A854",
          "ix": "0xD005A3",
          "iy": "0xD00080",
          "af": "0x007C",
          "bc": "0xFF0500",
          "de": "0x0000FF",
          "hl": "0xD45C8E",
          "flags": {
            "z": true,
            "c": false,
            "n": false
          },
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000002",
          "D005A0": "0x25",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 0
        }
      },
      {
        "name": "displayLoop005b4b",
        "targetPc": "0x005B4B",
        "beforeBlock": 12656,
        "afterBlock": 12657,
        "afterPc": "0x005AB6",
        "before": {
          "pc": "0x005B4B",
          "sp": "0xD1A854",
          "ix": "0xD005A3",
          "iy": "0xD00080",
          "af": "0x007C",
          "bc": "0xFF0500",
          "de": "0x0000FF",
          "hl": "0xD45C8E",
          "flags": {
            "z": true,
            "c": false,
            "n": false
          },
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000002",
          "D005A0": "0x25",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 0
        },
        "after": {
          "pc": "0x005AB6",
          "sp": "0xD1A857",
          "ix": "0xD005A3",
          "iy": "0xD00080",
          "af": "0xFF1A",
          "bc": "0xFF0F05",
          "de": "0x0000FF",
          "hl": "0xD005A0",
          "flags": {
            "z": false,
            "c": false,
            "n": true
          },
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000002",
          "D005A0": "0x26",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 0
        }
      },
      {
        "name": "displayCaller005b92",
        "targetPc": "0x005B92",
        "beforeBlock": 12717,
        "afterBlock": 12718,
        "afterPc": "0x005A19",
        "before": {
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
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000002",
          "D005A0": "0x35",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 0
        },
        "after": {
          "pc": "0x005A19",
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
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000002",
          "D005A0": "0x35",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 0
        }
      },
      {
        "name": "status005a19",
        "targetPc": "0x005A19",
        "beforeBlock": 12718,
        "afterBlock": 12719,
        "afterPc": "0x0059DA",
        "before": {
          "pc": "0x005A19",
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
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000002",
          "D005A0": "0x35",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 0
        },
        "after": {
          "pc": "0x0059DA",
          "sp": "0xD1A869",
          "ix": "0x000000",
          "iy": "0xD00080",
          "af": "0x201B",
          "bc": "0x000E5A",
          "de": "0xD65800",
          "hl": "0x000000",
          "flags": {
            "z": false,
            "c": true,
            "n": true
          },
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000002",
          "D005A0": "0x35",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 0
        }
      },
      {
        "name": "status0059da",
        "targetPc": "0x0059DA",
        "beforeBlock": 12719,
        "afterBlock": 12720,
        "afterPc": "0x0059E6",
        "before": {
          "pc": "0x0059DA",
          "sp": "0xD1A869",
          "ix": "0x000000",
          "iy": "0xD00080",
          "af": "0x201B",
          "bc": "0x000E5A",
          "de": "0xD65800",
          "hl": "0x000000",
          "flags": {
            "z": false,
            "c": true,
            "n": true
          },
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x00",
          "D0059C": "0x000002",
          "D005A0": "0x35",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 0
        },
        "after": {
          "pc": "0x0059E6",
          "sp": "0xD1A869",
          "ix": "0x000000",
          "iy": "0xD00080",
          "af": "0x01B3",
          "bc": "0x000E5A",
          "de": "0xD65800",
          "hl": "0xD00596",
          "flags": {
            "z": false,
            "c": true,
            "n": true
          },
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x01",
          "D0059C": "0x000002",
          "D005A0": "0x35",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 0
        }
      },
      {
        "name": "status0059e6",
        "targetPc": "0x0059E6",
        "beforeBlock": 12720,
        "afterBlock": 12721,
        "afterPc": "0x013D1D",
        "before": {
          "pc": "0x0059E6",
          "sp": "0xD1A869",
          "ix": "0x000000",
          "iy": "0xD00080",
          "af": "0x01B3",
          "bc": "0x000E5A",
          "de": "0xD65800",
          "hl": "0xD00596",
          "flags": {
            "z": false,
            "c": true,
            "n": true
          },
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x01",
          "D0059C": "0x000002",
          "D005A0": "0x35",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 0
        },
        "after": {
          "pc": "0x013D1D",
          "sp": "0xD1A872",
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
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x01",
          "D0059C": "0x000002",
          "D005A0": "0x35",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 0
        }
      },
      {
        "name": "transfer006475",
        "targetPc": "0x006475",
        "beforeBlock": 20054,
        "afterBlock": 20055,
        "afterPc": "0x001C7D",
        "before": {
          "pc": "0x006475",
          "sp": "0xD1A83D",
          "ix": "0xD1A866",
          "iy": "0xD00080",
          "af": "0x0042",
          "bc": "0x000000",
          "de": "0x008000",
          "hl": "0x020001",
          "flags": {
            "z": true,
            "c": false,
            "n": true
          },
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x0A",
          "D0059C": "0x00006E",
          "D005A0": "0xD5",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 3011
        },
        "after": {
          "pc": "0x001C7D",
          "sp": "0xD1A83A",
          "ix": "0xD1A866",
          "iy": "0xD00080",
          "af": "0x0042",
          "bc": "0x000000",
          "de": "0x008000",
          "hl": "0x020001",
          "flags": {
            "z": true,
            "c": false,
            "n": true
          },
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x0A",
          "D0059C": "0x00006E",
          "D005A0": "0xD5",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 3011
        }
      },
      {
        "name": "transfer00647d",
        "targetPc": "0x00647D",
        "beforeBlock": 20065,
        "afterBlock": 20066,
        "afterPc": "0x0017DD",
        "before": {
          "pc": "0x00647D",
          "sp": "0xD1A83D",
          "ix": "0xD1A866",
          "iy": "0xD00080",
          "af": "0x090C",
          "bc": "0x09D6B4",
          "de": "0x008000",
          "hl": "0x0BD6BA",
          "flags": {
            "z": false,
            "c": false,
            "n": false
          },
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x0A",
          "D0059C": "0x00006E",
          "D005A0": "0xD5",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 3011
        },
        "after": {
          "pc": "0x0017DD",
          "sp": "0xD1A837",
          "ix": "0xD1A866",
          "iy": "0xD00080",
          "af": "0x090C",
          "bc": "0x09D6B4",
          "de": "0x008000",
          "hl": "0x001204",
          "flags": {
            "z": false,
            "c": false,
            "n": false
          },
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x0A",
          "D0059C": "0x00006E",
          "D005A0": "0xD5",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 3011
        }
      },
      {
        "name": "transfer0064c7",
        "targetPc": "0x0064C7",
        "beforeBlock": 20190,
        "afterBlock": 20191,
        "afterPc": "0x0017DD",
        "before": {
          "pc": "0x0064C7",
          "sp": "0xD1A83D",
          "ix": "0xD1A866",
          "iy": "0xD00080",
          "af": "0x0A42",
          "bc": "0x002000",
          "de": "0x000240",
          "hl": "0x000000",
          "flags": {
            "z": true,
            "c": false,
            "n": true
          },
          "D00121": "0x000000",
          "D00124": "0x0A",
          "D00587": "0x00",
          "D00596": "0x13",
          "D0059C": "0x0000DA",
          "D005A0": "0x85",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 3040
        },
        "after": {
          "pc": "0x0017DD",
          "sp": "0xD1A837",
          "ix": "0xD1A866",
          "iy": "0xD00080",
          "af": "0x0A42",
          "bc": "0x002000",
          "de": "0x000240",
          "hl": "0x001204",
          "flags": {
            "z": true,
            "c": false,
            "n": true
          },
          "D00121": "0x000000",
          "D00124": "0x0A",
          "D00587": "0x00",
          "D00596": "0x13",
          "D0059C": "0x0000DA",
          "D005A0": "0x85",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 3040
        }
      },
      {
        "name": "lowCaller0017fc",
        "targetPc": "0x0017FC",
        "beforeBlock": 20151,
        "afterBlock": 20152,
        "afterPc": "0x006486",
        "before": {
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
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x13",
          "D0059C": "0x0000DA",
          "D005A0": "0x85",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 3040
        },
        "after": {
          "pc": "0x006486",
          "sp": "0xD1A83A",
          "ix": "0xD1A866",
          "iy": "0xD00080",
          "af": "0x090C",
          "bc": "0x09D6B4",
          "de": "0x008000",
          "hl": "0x0017DA",
          "flags": {
            "z": false,
            "c": false,
            "n": false
          },
          "D00121": "0x000000",
          "D00124": "0x00",
          "D00587": "0x00",
          "D00596": "0x13",
          "D0059C": "0x0000DA",
          "D005A0": "0x85",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 3040
        }
      },
      {
        "name": "lowSelect0064d0",
        "targetPc": "0x0064D0",
        "beforeBlock": 20277,
        "afterBlock": 20278,
        "afterPc": "0x006CC6",
        "before": {
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
          "D00121": "0x000000",
          "D00124": "0x0A",
          "D00587": "0x00",
          "D00596": "0x13",
          "D0059C": "0x0000DA",
          "D005A0": "0x85",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 3031
        },
        "after": {
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
          "D00121": "0x000000",
          "D00124": "0x0A",
          "D00587": "0x00",
          "D00596": "0x13",
          "D0059C": "0x0000DA",
          "D005A0": "0x85",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D00081": "0x00",
          "D0009F": "0x00",
          "D000A0": "0x00",
          "D000A3": "0x00",
          "D000C4": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0xD3FE81",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 3031
        }
      }
    ],
    "tailWindows": [
      {
        "block": 20031,
        "pc": "0x005B92",
        "exitState": {
          "block": 20031,
          "pc": "0x005B92",
          "regs": {
            "af": "0xFF42",
            "bc": "0xFF0005",
            "de": "0x0000FF",
            "hl": "0xD005A0",
            "ix": "0xD005C1",
            "sp": "0xD1A84E",
            "flags": {
              "z": true,
              "c": false,
              "n": true
            }
          },
          "ram": {
            "D00596": "0x09",
            "D005A0": "0xD5",
            "D02A73": "0x38",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
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
          "recentBlocks": [
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
        "precedingLoop": [
          {
            "name": "displayLoop005ae8",
            "block": 20008,
            "pc": "0x005AE8",
            "regs": {
              "af": "0x0054",
              "bc": "0xFF0605",
              "de": "0xD40000",
              "hl": "0xD6065C",
              "ix": "0xD005B6",
              "sp": "0xD1A84E",
              "flags": {
                "z": true,
                "c": false,
                "n": false
              }
            },
            "ram": {
              "D00596": "0x09",
              "D005A0": "0xCF",
              "D02A73": "0x00",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
                "0x00",
                "0x00",
                "0x00",
                "0x38",
                "0x80",
                "0x38",
                "0x80",
                "0x38"
              ]
            },
            "recentBlocks": [
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8"
            ]
          },
          {
            "name": "displayLoop005b16",
            "block": 20009,
            "pc": "0x005B16",
            "regs": {
              "af": "0x0054",
              "bc": "0xFF0500",
              "de": "0x0000FF",
              "hl": "0xD6065C",
              "ix": "0xD005B6",
              "sp": "0xD1A84B",
              "flags": {
                "z": true,
                "c": false,
                "n": false
              }
            },
            "ram": {
              "D00596": "0x09",
              "D005A0": "0xCF",
              "D02A73": "0x00",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
                "0x00",
                "0x00",
                "0x00",
                "0x38",
                "0x80",
                "0x38",
                "0x80",
                "0x38"
              ]
            },
            "recentBlocks": [
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16"
            ]
          },
          {
            "name": "displayLoop005b4b",
            "block": 20010,
            "pc": "0x005B4B",
            "regs": {
              "af": "0x007C",
              "bc": "0xFF0500",
              "de": "0x0000FF",
              "hl": "0xD60666",
              "ix": "0xD005B7",
              "sp": "0xD1A84B",
              "flags": {
                "z": true,
                "c": false,
                "n": false
              }
            },
            "ram": {
              "D00596": "0x09",
              "D005A0": "0xCF",
              "D02A73": "0x00",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
                "0x00",
                "0x00",
                "0x38",
                "0x80",
                "0x38",
                "0x80",
                "0x38",
                "0x80"
              ]
            },
            "recentBlocks": [
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B"
            ]
          },
          {
            "name": "displayLoop005ab6",
            "block": 20011,
            "pc": "0x005AB6",
            "regs": {
              "af": "0xFF02",
              "bc": "0xFF0505",
              "de": "0x0000FF",
              "hl": "0xD005A0",
              "ix": "0xD005B7",
              "sp": "0xD1A84E",
              "flags": {
                "z": false,
                "c": false,
                "n": true
              }
            },
            "ram": {
              "D00596": "0x09",
              "D005A0": "0xD0",
              "D02A73": "0x00",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
                "0x00",
                "0x00",
                "0x38",
                "0x80",
                "0x38",
                "0x80",
                "0x38",
                "0x80"
              ]
            },
            "recentBlocks": [
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6"
            ]
          },
          {
            "name": "displayLoop005ae8",
            "block": 20012,
            "pc": "0x005AE8",
            "regs": {
              "af": "0x0054",
              "bc": "0xFF0505",
              "de": "0xD40000",
              "hl": "0xD608DC",
              "ix": "0xD005B8",
              "sp": "0xD1A84E",
              "flags": {
                "z": true,
                "c": false,
                "n": false
              }
            },
            "ram": {
              "D00596": "0x09",
              "D005A0": "0xD0",
              "D02A73": "0x00",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
                "0x00",
                "0x38",
                "0x80",
                "0x38",
                "0x80",
                "0x38",
                "0x80",
                "0x38"
              ]
            },
            "recentBlocks": [
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8"
            ]
          },
          {
            "name": "displayLoop005b16",
            "block": 20013,
            "pc": "0x005B16",
            "regs": {
              "af": "0x0054",
              "bc": "0xFF0500",
              "de": "0x0000FF",
              "hl": "0xD608DC",
              "ix": "0xD005B8",
              "sp": "0xD1A84B",
              "flags": {
                "z": true,
                "c": false,
                "n": false
              }
            },
            "ram": {
              "D00596": "0x09",
              "D005A0": "0xD0",
              "D02A73": "0x00",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
                "0x00",
                "0x38",
                "0x80",
                "0x38",
                "0x80",
                "0x38",
                "0x80",
                "0x38"
              ]
            },
            "recentBlocks": [
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16"
            ]
          },
          {
            "name": "displayLoop005b4b",
            "block": 20014,
            "pc": "0x005B4B",
            "regs": {
              "af": "0x007C",
              "bc": "0xFF0500",
              "de": "0x0000FF",
              "hl": "0xD608E6",
              "ix": "0xD005B9",
              "sp": "0xD1A84B",
              "flags": {
                "z": true,
                "c": false,
                "n": false
              }
            },
            "ram": {
              "D00596": "0x09",
              "D005A0": "0xD0",
              "D02A73": "0x00",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
                "0x38",
                "0x80",
                "0x38",
                "0x80",
                "0x38",
                "0x80",
                "0x38",
                "0x80"
              ]
            },
            "recentBlocks": [
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B"
            ]
          },
          {
            "name": "displayLoop005ab6",
            "block": 20015,
            "pc": "0x005AB6",
            "regs": {
              "af": "0xFF02",
              "bc": "0xFF0405",
              "de": "0x0000FF",
              "hl": "0xD005A0",
              "ix": "0xD005B9",
              "sp": "0xD1A84E",
              "flags": {
                "z": false,
                "c": false,
                "n": true
              }
            },
            "ram": {
              "D00596": "0x09",
              "D005A0": "0xD1",
              "D02A73": "0x00",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
                "0x38",
                "0x80",
                "0x38",
                "0x80",
                "0x38",
                "0x80",
                "0x38",
                "0x80"
              ]
            },
            "recentBlocks": [
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6"
            ]
          },
          {
            "name": "displayLoop005ae8",
            "block": 20016,
            "pc": "0x005AE8",
            "regs": {
              "af": "0x3854",
              "bc": "0xFF0405",
              "de": "0xD40000",
              "hl": "0xD60B5C",
              "ix": "0xD005BA",
              "sp": "0xD1A84E",
              "flags": {
                "z": true,
                "c": false,
                "n": false
              }
            },
            "ram": {
              "D00596": "0x09",
              "D005A0": "0xD1",
              "D02A73": "0x00",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
                "0x80",
                "0x38",
                "0x80",
                "0x38",
                "0x80",
                "0x38",
                "0x80",
                "0x00"
              ]
            },
            "recentBlocks": [
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8"
            ]
          },
          {
            "name": "displayLoop005b16",
            "block": 20017,
            "pc": "0x005B16",
            "regs": {
              "af": "0x3854",
              "bc": "0xFF0538",
              "de": "0x0000FF",
              "hl": "0xD60B5C",
              "ix": "0xD005BA",
              "sp": "0xD1A84B",
              "flags": {
                "z": true,
                "c": false,
                "n": false
              }
            },
            "ram": {
              "D00596": "0x09",
              "D005A0": "0xD1",
              "D02A73": "0x38",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
                "0x80",
                "0x38",
                "0x80",
                "0x38",
                "0x80",
                "0x38",
                "0x80",
                "0x00"
              ]
            },
            "recentBlocks": [
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16"
            ]
          },
          {
            "name": "displayLoop005b4b",
            "block": 20018,
            "pc": "0x005B4B",
            "regs": {
              "af": "0x8055",
              "bc": "0xFF0500",
              "de": "0x0000FF",
              "hl": "0xD60B66",
              "ix": "0xD005BB",
              "sp": "0xD1A84B",
              "flags": {
                "z": true,
                "c": true,
                "n": false
              }
            },
            "ram": {
              "D00596": "0x09",
              "D005A0": "0xD1",
              "D02A73": "0x38",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
                "0x38",
                "0x80",
                "0x38",
                "0x80",
                "0x38",
                "0x80",
                "0x00",
                "0x00"
              ]
            },
            "recentBlocks": [
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B"
            ]
          },
          {
            "name": "displayLoop005ab6",
            "block": 20019,
            "pc": "0x005AB6",
            "regs": {
              "af": "0xFF02",
              "bc": "0xFF0305",
              "de": "0x0000FF",
              "hl": "0xD005A0",
              "ix": "0xD005BB",
              "sp": "0xD1A84E",
              "flags": {
                "z": false,
                "c": false,
                "n": true
              }
            },
            "ram": {
              "D00596": "0x09",
              "D005A0": "0xD2",
              "D02A73": "0x38",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
                "0x38",
                "0x80",
                "0x38",
                "0x80",
                "0x38",
                "0x80",
                "0x00",
                "0x00"
              ]
            },
            "recentBlocks": [
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6"
            ]
          },
          {
            "name": "displayLoop005ae8",
            "block": 20020,
            "pc": "0x005AE8",
            "regs": {
              "af": "0x3854",
              "bc": "0xFF0305",
              "de": "0xD40000",
              "hl": "0xD60DDC",
              "ix": "0xD005BC",
              "sp": "0xD1A84E",
              "flags": {
                "z": true,
                "c": false,
                "n": false
              }
            },
            "ram": {
              "D00596": "0x09",
              "D005A0": "0xD2",
              "D02A73": "0x38",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
                "0x80",
                "0x38",
                "0x80",
                "0x38",
                "0x80",
                "0x00",
                "0x00",
                "0x00"
              ]
            },
            "recentBlocks": [
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8"
            ]
          },
          {
            "name": "displayLoop005b16",
            "block": 20021,
            "pc": "0x005B16",
            "regs": {
              "af": "0x3854",
              "bc": "0xFF0538",
              "de": "0x0000FF",
              "hl": "0xD60DDC",
              "ix": "0xD005BC",
              "sp": "0xD1A84B",
              "flags": {
                "z": true,
                "c": false,
                "n": false
              }
            },
            "ram": {
              "D00596": "0x09",
              "D005A0": "0xD2",
              "D02A73": "0x38",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
                "0x80",
                "0x38",
                "0x80",
                "0x38",
                "0x80",
                "0x00",
                "0x00",
                "0x00"
              ]
            },
            "recentBlocks": [
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16"
            ]
          },
          {
            "name": "displayLoop005b4b",
            "block": 20022,
            "pc": "0x005B4B",
            "regs": {
              "af": "0x8055",
              "bc": "0xFF0500",
              "de": "0x0000FF",
              "hl": "0xD60DE6",
              "ix": "0xD005BD",
              "sp": "0xD1A84B",
              "flags": {
                "z": true,
                "c": true,
                "n": false
              }
            },
            "ram": {
              "D00596": "0x09",
              "D005A0": "0xD2",
              "D02A73": "0x38",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
                "0x38",
                "0x80",
                "0x38",
                "0x80",
                "0x00",
                "0x00",
                "0x00",
                "0x00"
              ]
            },
            "recentBlocks": [
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B"
            ]
          },
          {
            "name": "displayLoop005ab6",
            "block": 20023,
            "pc": "0x005AB6",
            "regs": {
              "af": "0xFF02",
              "bc": "0xFF0205",
              "de": "0x0000FF",
              "hl": "0xD005A0",
              "ix": "0xD005BD",
              "sp": "0xD1A84E",
              "flags": {
                "z": false,
                "c": false,
                "n": true
              }
            },
            "ram": {
              "D00596": "0x09",
              "D005A0": "0xD3",
              "D02A73": "0x38",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
                "0x38",
                "0x80",
                "0x38",
                "0x80",
                "0x00",
                "0x00",
                "0x00",
                "0x00"
              ]
            },
            "recentBlocks": [
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6"
            ]
          },
          {
            "name": "displayLoop005ae8",
            "block": 20024,
            "pc": "0x005AE8",
            "regs": {
              "af": "0x3854",
              "bc": "0xFF0205",
              "de": "0xD40000",
              "hl": "0xD6105C",
              "ix": "0xD005BE",
              "sp": "0xD1A84E",
              "flags": {
                "z": true,
                "c": false,
                "n": false
              }
            },
            "ram": {
              "D00596": "0x09",
              "D005A0": "0xD3",
              "D02A73": "0x38",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
                "0x80",
                "0x38",
                "0x80",
                "0x00",
                "0x00",
                "0x00",
                "0x00",
                "0x00"
              ]
            },
            "recentBlocks": [
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8"
            ]
          },
          {
            "name": "displayLoop005b16",
            "block": 20025,
            "pc": "0x005B16",
            "regs": {
              "af": "0x3854",
              "bc": "0xFF0538",
              "de": "0x0000FF",
              "hl": "0xD6105C",
              "ix": "0xD005BE",
              "sp": "0xD1A84B",
              "flags": {
                "z": true,
                "c": false,
                "n": false
              }
            },
            "ram": {
              "D00596": "0x09",
              "D005A0": "0xD3",
              "D02A73": "0x38",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
                "0x80",
                "0x38",
                "0x80",
                "0x00",
                "0x00",
                "0x00",
                "0x00",
                "0x00"
              ]
            },
            "recentBlocks": [
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16"
            ]
          },
          {
            "name": "displayLoop005b4b",
            "block": 20026,
            "pc": "0x005B4B",
            "regs": {
              "af": "0x8055",
              "bc": "0xFF0500",
              "de": "0x0000FF",
              "hl": "0xD61066",
              "ix": "0xD005BF",
              "sp": "0xD1A84B",
              "flags": {
                "z": true,
                "c": true,
                "n": false
              }
            },
            "ram": {
              "D00596": "0x09",
              "D005A0": "0xD3",
              "D02A73": "0x38",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
                "0x38",
                "0x80",
                "0x00",
                "0x00",
                "0x00",
                "0x00",
                "0x00",
                "0x00"
              ]
            },
            "recentBlocks": [
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B"
            ]
          },
          {
            "name": "displayLoop005ab6",
            "block": 20027,
            "pc": "0x005AB6",
            "regs": {
              "af": "0xFF02",
              "bc": "0xFF0105",
              "de": "0x0000FF",
              "hl": "0xD005A0",
              "ix": "0xD005BF",
              "sp": "0xD1A84E",
              "flags": {
                "z": false,
                "c": false,
                "n": true
              }
            },
            "ram": {
              "D00596": "0x09",
              "D005A0": "0xD4",
              "D02A73": "0x38",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
                "0x38",
                "0x80",
                "0x00",
                "0x00",
                "0x00",
                "0x00",
                "0x00",
                "0x00"
              ]
            },
            "recentBlocks": [
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6"
            ]
          },
          {
            "name": "displayLoop005ae8",
            "block": 20028,
            "pc": "0x005AE8",
            "regs": {
              "af": "0x3854",
              "bc": "0xFF0105",
              "de": "0xD40000",
              "hl": "0xD612DC",
              "ix": "0xD005C0",
              "sp": "0xD1A84E",
              "flags": {
                "z": true,
                "c": false,
                "n": false
              }
            },
            "ram": {
              "D00596": "0x09",
              "D005A0": "0xD4",
              "D02A73": "0x38",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
                "0x80",
                "0x00",
                "0x00",
                "0x00",
                "0x00",
                "0x00",
                "0x00",
                "0x00"
              ]
            },
            "recentBlocks": [
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8"
            ]
          },
          {
            "name": "displayLoop005b16",
            "block": 20029,
            "pc": "0x005B16",
            "regs": {
              "af": "0x3854",
              "bc": "0xFF0538",
              "de": "0x0000FF",
              "hl": "0xD612DC",
              "ix": "0xD005C0",
              "sp": "0xD1A84B",
              "flags": {
                "z": true,
                "c": false,
                "n": false
              }
            },
            "ram": {
              "D00596": "0x09",
              "D005A0": "0xD4",
              "D02A73": "0x38",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
                "0x80",
                "0x00",
                "0x00",
                "0x00",
                "0x00",
                "0x00",
                "0x00",
                "0x00"
              ]
            },
            "recentBlocks": [
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16"
            ]
          },
          {
            "name": "displayLoop005b4b",
            "block": 20030,
            "pc": "0x005B4B",
            "regs": {
              "af": "0x8055",
              "bc": "0xFF0500",
              "de": "0x0000FF",
              "hl": "0xD612E6",
              "ix": "0xD005C1",
              "sp": "0xD1A84B",
              "flags": {
                "z": true,
                "c": true,
                "n": false
              }
            },
            "ram": {
              "D00596": "0x09",
              "D005A0": "0xD4",
              "D02A73": "0x38",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
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
            "recentBlocks": [
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B"
            ]
          },
          {
            "name": "displayCaller005b92",
            "block": 20031,
            "pc": "0x005B92",
            "regs": {
              "af": "0xFF42",
              "bc": "0xFF0005",
              "de": "0x0000FF",
              "hl": "0xD005A0",
              "ix": "0xD005C1",
              "sp": "0xD1A84E",
              "flags": {
                "z": true,
                "c": false,
                "n": true
              }
            },
            "ram": {
              "D00596": "0x09",
              "D005A0": "0xD5",
              "D02A73": "0x38",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
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
            "recentBlocks": [
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
        ]
      },
      {
        "block": 20147,
        "pc": "0x005B92",
        "exitState": {
          "block": 20147,
          "pc": "0x005B92",
          "regs": {
            "af": "0xFF42",
            "bc": "0xFF0005",
            "de": "0x0000FF",
            "hl": "0xD005A0",
            "ix": "0xD005C1",
            "sp": "0xD1A819",
            "flags": {
              "z": true,
              "c": false,
              "n": true
            }
          },
          "ram": {
            "D00596": "0x12",
            "D005A0": "0x85",
            "D02A73": "0x00",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
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
          "recentBlocks": [
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
        "precedingLoop": [
          {
            "name": "displayLoop005ae8",
            "block": 20124,
            "pc": "0x005AE8",
            "regs": {
              "af": "0x1854",
              "bc": "0xFF0605",
              "de": "0xD40000",
              "hl": "0xD53F34",
              "ix": "0xD005B6",
              "sp": "0xD1A819",
              "flags": {
                "z": true,
                "c": false,
                "n": false
              }
            },
            "ram": {
              "D00596": "0x12",
              "D005A0": "0x7F",
              "D02A73": "0x08",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
                "0x80",
                "0x38",
                "0x00",
                "0x70",
                "0x00",
                "0xE0",
                "0x00",
                "0xC0"
              ]
            },
            "recentBlocks": [
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8"
            ]
          },
          {
            "name": "displayLoop005b16",
            "block": 20125,
            "pc": "0x005B16",
            "regs": {
              "af": "0x1854",
              "bc": "0xFF0518",
              "de": "0x0000FF",
              "hl": "0xD53F34",
              "ix": "0xD005B6",
              "sp": "0xD1A816",
              "flags": {
                "z": true,
                "c": false,
                "n": false
              }
            },
            "ram": {
              "D00596": "0x12",
              "D005A0": "0x7F",
              "D02A73": "0x18",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
                "0x80",
                "0x38",
                "0x00",
                "0x70",
                "0x00",
                "0xE0",
                "0x00",
                "0xC0"
              ]
            },
            "recentBlocks": [
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16"
            ]
          },
          {
            "name": "displayLoop005b4b",
            "block": 20126,
            "pc": "0x005B4B",
            "regs": {
              "af": "0x8055",
              "bc": "0xFF0500",
              "de": "0x0000FF",
              "hl": "0xD53F3E",
              "ix": "0xD005B7",
              "sp": "0xD1A816",
              "flags": {
                "z": true,
                "c": true,
                "n": false
              }
            },
            "ram": {
              "D00596": "0x12",
              "D005A0": "0x7F",
              "D02A73": "0x18",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
                "0x38",
                "0x00",
                "0x70",
                "0x00",
                "0xE0",
                "0x00",
                "0xC0",
                "0x00"
              ]
            },
            "recentBlocks": [
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B"
            ]
          },
          {
            "name": "displayLoop005ab6",
            "block": 20127,
            "pc": "0x005AB6",
            "regs": {
              "af": "0xFF02",
              "bc": "0xFF0505",
              "de": "0x0000FF",
              "hl": "0xD005A0",
              "ix": "0xD005B7",
              "sp": "0xD1A819",
              "flags": {
                "z": false,
                "c": false,
                "n": true
              }
            },
            "ram": {
              "D00596": "0x12",
              "D005A0": "0x80",
              "D02A73": "0x18",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
                "0x38",
                "0x00",
                "0x70",
                "0x00",
                "0xE0",
                "0x00",
                "0xC0",
                "0x00"
              ]
            },
            "recentBlocks": [
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6"
            ]
          },
          {
            "name": "displayLoop005ae8",
            "block": 20128,
            "pc": "0x005AE8",
            "regs": {
              "af": "0x3854",
              "bc": "0xFF0505",
              "de": "0xD40000",
              "hl": "0xD541B4",
              "ix": "0xD005B8",
              "sp": "0xD1A819",
              "flags": {
                "z": true,
                "c": false,
                "n": false
              }
            },
            "ram": {
              "D00596": "0x12",
              "D005A0": "0x80",
              "D02A73": "0x18",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
                "0x00",
                "0x70",
                "0x00",
                "0xE0",
                "0x00",
                "0xC0",
                "0x00",
                "0x00"
              ]
            },
            "recentBlocks": [
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8"
            ]
          },
          {
            "name": "displayLoop005b16",
            "block": 20129,
            "pc": "0x005B16",
            "regs": {
              "af": "0x3854",
              "bc": "0xFF0538",
              "de": "0x0000FF",
              "hl": "0xD541B4",
              "ix": "0xD005B8",
              "sp": "0xD1A816",
              "flags": {
                "z": true,
                "c": false,
                "n": false
              }
            },
            "ram": {
              "D00596": "0x12",
              "D005A0": "0x80",
              "D02A73": "0x38",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
                "0x00",
                "0x70",
                "0x00",
                "0xE0",
                "0x00",
                "0xC0",
                "0x00",
                "0x00"
              ]
            },
            "recentBlocks": [
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16"
            ]
          },
          {
            "name": "displayLoop005b4b",
            "block": 20130,
            "pc": "0x005B4B",
            "regs": {
              "af": "0x0055",
              "bc": "0xFF0500",
              "de": "0x0000FF",
              "hl": "0xD541BE",
              "ix": "0xD005B9",
              "sp": "0xD1A816",
              "flags": {
                "z": true,
                "c": true,
                "n": false
              }
            },
            "ram": {
              "D00596": "0x12",
              "D005A0": "0x80",
              "D02A73": "0x38",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
                "0x70",
                "0x00",
                "0xE0",
                "0x00",
                "0xC0",
                "0x00",
                "0x00",
                "0x00"
              ]
            },
            "recentBlocks": [
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B"
            ]
          },
          {
            "name": "displayLoop005ab6",
            "block": 20131,
            "pc": "0x005AB6",
            "regs": {
              "af": "0xFF02",
              "bc": "0xFF0405",
              "de": "0x0000FF",
              "hl": "0xD005A0",
              "ix": "0xD005B9",
              "sp": "0xD1A819",
              "flags": {
                "z": false,
                "c": false,
                "n": true
              }
            },
            "ram": {
              "D00596": "0x12",
              "D005A0": "0x81",
              "D02A73": "0x38",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
                "0x70",
                "0x00",
                "0xE0",
                "0x00",
                "0xC0",
                "0x00",
                "0x00",
                "0x00"
              ]
            },
            "recentBlocks": [
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6"
            ]
          },
          {
            "name": "displayLoop005ae8",
            "block": 20132,
            "pc": "0x005AE8",
            "regs": {
              "af": "0x7054",
              "bc": "0xFF0405",
              "de": "0xD40000",
              "hl": "0xD54434",
              "ix": "0xD005BA",
              "sp": "0xD1A819",
              "flags": {
                "z": true,
                "c": false,
                "n": false
              }
            },
            "ram": {
              "D00596": "0x12",
              "D005A0": "0x81",
              "D02A73": "0x38",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
                "0x00",
                "0xE0",
                "0x00",
                "0xC0",
                "0x00",
                "0x00",
                "0x00",
                "0x00"
              ]
            },
            "recentBlocks": [
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8"
            ]
          },
          {
            "name": "displayLoop005b16",
            "block": 20133,
            "pc": "0x005B16",
            "regs": {
              "af": "0x7054",
              "bc": "0xFF0570",
              "de": "0x0000FF",
              "hl": "0xD54434",
              "ix": "0xD005BA",
              "sp": "0xD1A816",
              "flags": {
                "z": true,
                "c": false,
                "n": false
              }
            },
            "ram": {
              "D00596": "0x12",
              "D005A0": "0x81",
              "D02A73": "0x70",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
                "0x00",
                "0xE0",
                "0x00",
                "0xC0",
                "0x00",
                "0x00",
                "0x00",
                "0x00"
              ]
            },
            "recentBlocks": [
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16"
            ]
          },
          {
            "name": "displayLoop005b4b",
            "block": 20134,
            "pc": "0x005B4B",
            "regs": {
              "af": "0x007C",
              "bc": "0xFF0500",
              "de": "0x0000FF",
              "hl": "0xD5443E",
              "ix": "0xD005BB",
              "sp": "0xD1A816",
              "flags": {
                "z": true,
                "c": false,
                "n": false
              }
            },
            "ram": {
              "D00596": "0x12",
              "D005A0": "0x81",
              "D02A73": "0x70",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
                "0xE0",
                "0x00",
                "0xC0",
                "0x00",
                "0x00",
                "0x00",
                "0x00",
                "0x00"
              ]
            },
            "recentBlocks": [
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B"
            ]
          },
          {
            "name": "displayLoop005ab6",
            "block": 20135,
            "pc": "0x005AB6",
            "regs": {
              "af": "0xFF02",
              "bc": "0xFF0305",
              "de": "0x0000FF",
              "hl": "0xD005A0",
              "ix": "0xD005BB",
              "sp": "0xD1A819",
              "flags": {
                "z": false,
                "c": false,
                "n": true
              }
            },
            "ram": {
              "D00596": "0x12",
              "D005A0": "0x82",
              "D02A73": "0x70",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
                "0xE0",
                "0x00",
                "0xC0",
                "0x00",
                "0x00",
                "0x00",
                "0x00",
                "0x00"
              ]
            },
            "recentBlocks": [
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6"
            ]
          },
          {
            "name": "displayLoop005ae8",
            "block": 20136,
            "pc": "0x005AE8",
            "regs": {
              "af": "0xE054",
              "bc": "0xFF0305",
              "de": "0xD40000",
              "hl": "0xD546B4",
              "ix": "0xD005BC",
              "sp": "0xD1A819",
              "flags": {
                "z": true,
                "c": false,
                "n": false
              }
            },
            "ram": {
              "D00596": "0x12",
              "D005A0": "0x82",
              "D02A73": "0x70",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
                "0x00",
                "0xC0",
                "0x00",
                "0x00",
                "0x00",
                "0x00",
                "0x00",
                "0x00"
              ]
            },
            "recentBlocks": [
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8"
            ]
          },
          {
            "name": "displayLoop005b16",
            "block": 20137,
            "pc": "0x005B16",
            "regs": {
              "af": "0xE054",
              "bc": "0xFF05E0",
              "de": "0x0000FF",
              "hl": "0xD546B4",
              "ix": "0xD005BC",
              "sp": "0xD1A816",
              "flags": {
                "z": true,
                "c": false,
                "n": false
              }
            },
            "ram": {
              "D00596": "0x12",
              "D005A0": "0x82",
              "D02A73": "0xE0",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
                "0x00",
                "0xC0",
                "0x00",
                "0x00",
                "0x00",
                "0x00",
                "0x00",
                "0x00"
              ]
            },
            "recentBlocks": [
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16"
            ]
          },
          {
            "name": "displayLoop005b4b",
            "block": 20138,
            "pc": "0x005B4B",
            "regs": {
              "af": "0x007C",
              "bc": "0xFF0500",
              "de": "0x0000FF",
              "hl": "0xD546BE",
              "ix": "0xD005BD",
              "sp": "0xD1A816",
              "flags": {
                "z": true,
                "c": false,
                "n": false
              }
            },
            "ram": {
              "D00596": "0x12",
              "D005A0": "0x82",
              "D02A73": "0xE0",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
                "0xC0",
                "0x00",
                "0x00",
                "0x00",
                "0x00",
                "0x00",
                "0x00",
                "0x00"
              ]
            },
            "recentBlocks": [
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B"
            ]
          },
          {
            "name": "displayLoop005ab6",
            "block": 20139,
            "pc": "0x005AB6",
            "regs": {
              "af": "0xFF02",
              "bc": "0xFF0205",
              "de": "0x0000FF",
              "hl": "0xD005A0",
              "ix": "0xD005BD",
              "sp": "0xD1A819",
              "flags": {
                "z": false,
                "c": false,
                "n": true
              }
            },
            "ram": {
              "D00596": "0x12",
              "D005A0": "0x83",
              "D02A73": "0xE0",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
                "0xC0",
                "0x00",
                "0x00",
                "0x00",
                "0x00",
                "0x00",
                "0x00",
                "0x00"
              ]
            },
            "recentBlocks": [
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6"
            ]
          },
          {
            "name": "displayLoop005ae8",
            "block": 20140,
            "pc": "0x005AE8",
            "regs": {
              "af": "0xC054",
              "bc": "0xFF0205",
              "de": "0xD40000",
              "hl": "0xD54934",
              "ix": "0xD005BE",
              "sp": "0xD1A819",
              "flags": {
                "z": true,
                "c": false,
                "n": false
              }
            },
            "ram": {
              "D00596": "0x12",
              "D005A0": "0x83",
              "D02A73": "0xE0",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
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
            "recentBlocks": [
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8"
            ]
          },
          {
            "name": "displayLoop005b16",
            "block": 20141,
            "pc": "0x005B16",
            "regs": {
              "af": "0xC054",
              "bc": "0xFF05C0",
              "de": "0x0000FF",
              "hl": "0xD54934",
              "ix": "0xD005BE",
              "sp": "0xD1A816",
              "flags": {
                "z": true,
                "c": false,
                "n": false
              }
            },
            "ram": {
              "D00596": "0x12",
              "D005A0": "0x83",
              "D02A73": "0xC0",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
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
            "recentBlocks": [
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16"
            ]
          },
          {
            "name": "displayLoop005b4b",
            "block": 20142,
            "pc": "0x005B4B",
            "regs": {
              "af": "0x007C",
              "bc": "0xFF0500",
              "de": "0x0000FF",
              "hl": "0xD5493E",
              "ix": "0xD005BF",
              "sp": "0xD1A816",
              "flags": {
                "z": true,
                "c": false,
                "n": false
              }
            },
            "ram": {
              "D00596": "0x12",
              "D005A0": "0x83",
              "D02A73": "0xC0",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
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
            "recentBlocks": [
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B"
            ]
          },
          {
            "name": "displayLoop005ab6",
            "block": 20143,
            "pc": "0x005AB6",
            "regs": {
              "af": "0xFF02",
              "bc": "0xFF0105",
              "de": "0x0000FF",
              "hl": "0xD005A0",
              "ix": "0xD005BF",
              "sp": "0xD1A819",
              "flags": {
                "z": false,
                "c": false,
                "n": true
              }
            },
            "ram": {
              "D00596": "0x12",
              "D005A0": "0x84",
              "D02A73": "0xC0",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
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
            "recentBlocks": [
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6"
            ]
          },
          {
            "name": "displayLoop005ae8",
            "block": 20144,
            "pc": "0x005AE8",
            "regs": {
              "af": "0x0054",
              "bc": "0xFF0105",
              "de": "0xD40000",
              "hl": "0xD54BB4",
              "ix": "0xD005C0",
              "sp": "0xD1A819",
              "flags": {
                "z": true,
                "c": false,
                "n": false
              }
            },
            "ram": {
              "D00596": "0x12",
              "D005A0": "0x84",
              "D02A73": "0xC0",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
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
            "recentBlocks": [
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8"
            ]
          },
          {
            "name": "displayLoop005b16",
            "block": 20145,
            "pc": "0x005B16",
            "regs": {
              "af": "0x0054",
              "bc": "0xFF0500",
              "de": "0x0000FF",
              "hl": "0xD54BB4",
              "ix": "0xD005C0",
              "sp": "0xD1A816",
              "flags": {
                "z": true,
                "c": false,
                "n": false
              }
            },
            "ram": {
              "D00596": "0x12",
              "D005A0": "0x84",
              "D02A73": "0x00",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
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
            "recentBlocks": [
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16"
            ]
          },
          {
            "name": "displayLoop005b4b",
            "block": 20146,
            "pc": "0x005B4B",
            "regs": {
              "af": "0x007C",
              "bc": "0xFF0500",
              "de": "0x0000FF",
              "hl": "0xD54BBE",
              "ix": "0xD005C1",
              "sp": "0xD1A816",
              "flags": {
                "z": true,
                "c": false,
                "n": false
              }
            },
            "ram": {
              "D00596": "0x12",
              "D005A0": "0x84",
              "D02A73": "0x00",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
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
            "recentBlocks": [
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B"
            ]
          },
          {
            "name": "displayCaller005b92",
            "block": 20147,
            "pc": "0x005B92",
            "regs": {
              "af": "0xFF42",
              "bc": "0xFF0005",
              "de": "0x0000FF",
              "hl": "0xD005A0",
              "ix": "0xD005C1",
              "sp": "0xD1A819",
              "flags": {
                "z": true,
                "c": false,
                "n": true
              }
            },
            "ram": {
              "D00596": "0x12",
              "D005A0": "0x85",
              "D02A73": "0x00",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
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
            "recentBlocks": [
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
        ]
      },
      {
        "block": 20272,
        "pc": "0x005B92",
        "exitState": {
          "block": 20272,
          "pc": "0x005B92",
          "regs": {
            "af": "0xFF42",
            "bc": "0xFF0005",
            "de": "0x0000FF",
            "hl": "0xD005A0",
            "ix": "0xD005C1",
            "sp": "0xD1A819",
            "flags": {
              "z": true,
              "c": false,
              "n": true
            }
          },
          "ram": {
            "D00596": "0x12",
            "D005A0": "0x85",
            "D02A73": "0x00",
            "D02A75": "0x05",
            "low0059c": "0x095CC3",
            "ixBytes": [
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
          "recentBlocks": [
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
        "precedingLoop": [
          {
            "name": "displayLoop005ae8",
            "block": 20249,
            "pc": "0x005AE8",
            "regs": {
              "af": "0x0054",
              "bc": "0xFF0605",
              "de": "0xD40000",
              "hl": "0xD53F34",
              "ix": "0xD005B6",
              "sp": "0xD1A819",
              "flags": {
                "z": true,
                "c": false,
                "n": false
              }
            },
            "ram": {
              "D00596": "0x12",
              "D005A0": "0x7F",
              "D02A73": "0xF8",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
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
            "recentBlocks": [
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8"
            ]
          },
          {
            "name": "displayLoop005b16",
            "block": 20250,
            "pc": "0x005B16",
            "regs": {
              "af": "0x0054",
              "bc": "0xFF0500",
              "de": "0x0000FF",
              "hl": "0xD53F34",
              "ix": "0xD005B6",
              "sp": "0xD1A816",
              "flags": {
                "z": true,
                "c": false,
                "n": false
              }
            },
            "ram": {
              "D00596": "0x12",
              "D005A0": "0x7F",
              "D02A73": "0x00",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
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
            "recentBlocks": [
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16"
            ]
          },
          {
            "name": "displayLoop005b4b",
            "block": 20251,
            "pc": "0x005B4B",
            "regs": {
              "af": "0x007C",
              "bc": "0xFF0500",
              "de": "0x0000FF",
              "hl": "0xD53F3E",
              "ix": "0xD005B7",
              "sp": "0xD1A816",
              "flags": {
                "z": true,
                "c": false,
                "n": false
              }
            },
            "ram": {
              "D00596": "0x12",
              "D005A0": "0x7F",
              "D02A73": "0x00",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
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
            "recentBlocks": [
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B"
            ]
          },
          {
            "name": "displayLoop005ab6",
            "block": 20252,
            "pc": "0x005AB6",
            "regs": {
              "af": "0xFF02",
              "bc": "0xFF0505",
              "de": "0x0000FF",
              "hl": "0xD005A0",
              "ix": "0xD005B7",
              "sp": "0xD1A819",
              "flags": {
                "z": false,
                "c": false,
                "n": true
              }
            },
            "ram": {
              "D00596": "0x12",
              "D005A0": "0x80",
              "D02A73": "0x00",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
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
            "recentBlocks": [
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6"
            ]
          },
          {
            "name": "displayLoop005ae8",
            "block": 20253,
            "pc": "0x005AE8",
            "regs": {
              "af": "0x0054",
              "bc": "0xFF0505",
              "de": "0xD40000",
              "hl": "0xD541B4",
              "ix": "0xD005B8",
              "sp": "0xD1A819",
              "flags": {
                "z": true,
                "c": false,
                "n": false
              }
            },
            "ram": {
              "D00596": "0x12",
              "D005A0": "0x80",
              "D02A73": "0x00",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
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
            "recentBlocks": [
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8"
            ]
          },
          {
            "name": "displayLoop005b16",
            "block": 20254,
            "pc": "0x005B16",
            "regs": {
              "af": "0x0054",
              "bc": "0xFF0500",
              "de": "0x0000FF",
              "hl": "0xD541B4",
              "ix": "0xD005B8",
              "sp": "0xD1A816",
              "flags": {
                "z": true,
                "c": false,
                "n": false
              }
            },
            "ram": {
              "D00596": "0x12",
              "D005A0": "0x80",
              "D02A73": "0x00",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
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
            "recentBlocks": [
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16"
            ]
          },
          {
            "name": "displayLoop005b4b",
            "block": 20255,
            "pc": "0x005B4B",
            "regs": {
              "af": "0x007C",
              "bc": "0xFF0500",
              "de": "0x0000FF",
              "hl": "0xD541BE",
              "ix": "0xD005B9",
              "sp": "0xD1A816",
              "flags": {
                "z": true,
                "c": false,
                "n": false
              }
            },
            "ram": {
              "D00596": "0x12",
              "D005A0": "0x80",
              "D02A73": "0x00",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
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
            "recentBlocks": [
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B"
            ]
          },
          {
            "name": "displayLoop005ab6",
            "block": 20256,
            "pc": "0x005AB6",
            "regs": {
              "af": "0xFF02",
              "bc": "0xFF0405",
              "de": "0x0000FF",
              "hl": "0xD005A0",
              "ix": "0xD005B9",
              "sp": "0xD1A819",
              "flags": {
                "z": false,
                "c": false,
                "n": true
              }
            },
            "ram": {
              "D00596": "0x12",
              "D005A0": "0x81",
              "D02A73": "0x00",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
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
            "recentBlocks": [
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6"
            ]
          },
          {
            "name": "displayLoop005ae8",
            "block": 20257,
            "pc": "0x005AE8",
            "regs": {
              "af": "0x0054",
              "bc": "0xFF0405",
              "de": "0xD40000",
              "hl": "0xD54434",
              "ix": "0xD005BA",
              "sp": "0xD1A819",
              "flags": {
                "z": true,
                "c": false,
                "n": false
              }
            },
            "ram": {
              "D00596": "0x12",
              "D005A0": "0x81",
              "D02A73": "0x00",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
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
            "recentBlocks": [
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8"
            ]
          },
          {
            "name": "displayLoop005b16",
            "block": 20258,
            "pc": "0x005B16",
            "regs": {
              "af": "0x0054",
              "bc": "0xFF0500",
              "de": "0x0000FF",
              "hl": "0xD54434",
              "ix": "0xD005BA",
              "sp": "0xD1A816",
              "flags": {
                "z": true,
                "c": false,
                "n": false
              }
            },
            "ram": {
              "D00596": "0x12",
              "D005A0": "0x81",
              "D02A73": "0x00",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
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
            "recentBlocks": [
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16"
            ]
          },
          {
            "name": "displayLoop005b4b",
            "block": 20259,
            "pc": "0x005B4B",
            "regs": {
              "af": "0x007C",
              "bc": "0xFF0500",
              "de": "0x0000FF",
              "hl": "0xD5443E",
              "ix": "0xD005BB",
              "sp": "0xD1A816",
              "flags": {
                "z": true,
                "c": false,
                "n": false
              }
            },
            "ram": {
              "D00596": "0x12",
              "D005A0": "0x81",
              "D02A73": "0x00",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
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
            "recentBlocks": [
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B"
            ]
          },
          {
            "name": "displayLoop005ab6",
            "block": 20260,
            "pc": "0x005AB6",
            "regs": {
              "af": "0xFF02",
              "bc": "0xFF0305",
              "de": "0x0000FF",
              "hl": "0xD005A0",
              "ix": "0xD005BB",
              "sp": "0xD1A819",
              "flags": {
                "z": false,
                "c": false,
                "n": true
              }
            },
            "ram": {
              "D00596": "0x12",
              "D005A0": "0x82",
              "D02A73": "0x00",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
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
            "recentBlocks": [
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6"
            ]
          },
          {
            "name": "displayLoop005ae8",
            "block": 20261,
            "pc": "0x005AE8",
            "regs": {
              "af": "0x0054",
              "bc": "0xFF0305",
              "de": "0xD40000",
              "hl": "0xD546B4",
              "ix": "0xD005BC",
              "sp": "0xD1A819",
              "flags": {
                "z": true,
                "c": false,
                "n": false
              }
            },
            "ram": {
              "D00596": "0x12",
              "D005A0": "0x82",
              "D02A73": "0x00",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
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
            "recentBlocks": [
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8"
            ]
          },
          {
            "name": "displayLoop005b16",
            "block": 20262,
            "pc": "0x005B16",
            "regs": {
              "af": "0x0054",
              "bc": "0xFF0500",
              "de": "0x0000FF",
              "hl": "0xD546B4",
              "ix": "0xD005BC",
              "sp": "0xD1A816",
              "flags": {
                "z": true,
                "c": false,
                "n": false
              }
            },
            "ram": {
              "D00596": "0x12",
              "D005A0": "0x82",
              "D02A73": "0x00",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
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
            "recentBlocks": [
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16"
            ]
          },
          {
            "name": "displayLoop005b4b",
            "block": 20263,
            "pc": "0x005B4B",
            "regs": {
              "af": "0x007C",
              "bc": "0xFF0500",
              "de": "0x0000FF",
              "hl": "0xD546BE",
              "ix": "0xD005BD",
              "sp": "0xD1A816",
              "flags": {
                "z": true,
                "c": false,
                "n": false
              }
            },
            "ram": {
              "D00596": "0x12",
              "D005A0": "0x82",
              "D02A73": "0x00",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
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
            "recentBlocks": [
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B"
            ]
          },
          {
            "name": "displayLoop005ab6",
            "block": 20264,
            "pc": "0x005AB6",
            "regs": {
              "af": "0xFF02",
              "bc": "0xFF0205",
              "de": "0x0000FF",
              "hl": "0xD005A0",
              "ix": "0xD005BD",
              "sp": "0xD1A819",
              "flags": {
                "z": false,
                "c": false,
                "n": true
              }
            },
            "ram": {
              "D00596": "0x12",
              "D005A0": "0x83",
              "D02A73": "0x00",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
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
            "recentBlocks": [
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6"
            ]
          },
          {
            "name": "displayLoop005ae8",
            "block": 20265,
            "pc": "0x005AE8",
            "regs": {
              "af": "0x0054",
              "bc": "0xFF0205",
              "de": "0xD40000",
              "hl": "0xD54934",
              "ix": "0xD005BE",
              "sp": "0xD1A819",
              "flags": {
                "z": true,
                "c": false,
                "n": false
              }
            },
            "ram": {
              "D00596": "0x12",
              "D005A0": "0x83",
              "D02A73": "0x00",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
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
            "recentBlocks": [
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8"
            ]
          },
          {
            "name": "displayLoop005b16",
            "block": 20266,
            "pc": "0x005B16",
            "regs": {
              "af": "0x0054",
              "bc": "0xFF0500",
              "de": "0x0000FF",
              "hl": "0xD54934",
              "ix": "0xD005BE",
              "sp": "0xD1A816",
              "flags": {
                "z": true,
                "c": false,
                "n": false
              }
            },
            "ram": {
              "D00596": "0x12",
              "D005A0": "0x83",
              "D02A73": "0x00",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
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
            "recentBlocks": [
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16"
            ]
          },
          {
            "name": "displayLoop005b4b",
            "block": 20267,
            "pc": "0x005B4B",
            "regs": {
              "af": "0x007C",
              "bc": "0xFF0500",
              "de": "0x0000FF",
              "hl": "0xD5493E",
              "ix": "0xD005BF",
              "sp": "0xD1A816",
              "flags": {
                "z": true,
                "c": false,
                "n": false
              }
            },
            "ram": {
              "D00596": "0x12",
              "D005A0": "0x83",
              "D02A73": "0x00",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
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
            "recentBlocks": [
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B"
            ]
          },
          {
            "name": "displayLoop005ab6",
            "block": 20268,
            "pc": "0x005AB6",
            "regs": {
              "af": "0xFF02",
              "bc": "0xFF0105",
              "de": "0x0000FF",
              "hl": "0xD005A0",
              "ix": "0xD005BF",
              "sp": "0xD1A819",
              "flags": {
                "z": false,
                "c": false,
                "n": true
              }
            },
            "ram": {
              "D00596": "0x12",
              "D005A0": "0x84",
              "D02A73": "0x00",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
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
            "recentBlocks": [
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6"
            ]
          },
          {
            "name": "displayLoop005ae8",
            "block": 20269,
            "pc": "0x005AE8",
            "regs": {
              "af": "0x0054",
              "bc": "0xFF0105",
              "de": "0xD40000",
              "hl": "0xD54BB4",
              "ix": "0xD005C0",
              "sp": "0xD1A819",
              "flags": {
                "z": true,
                "c": false,
                "n": false
              }
            },
            "ram": {
              "D00596": "0x12",
              "D005A0": "0x84",
              "D02A73": "0x00",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
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
            "recentBlocks": [
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8"
            ]
          },
          {
            "name": "displayLoop005b16",
            "block": 20270,
            "pc": "0x005B16",
            "regs": {
              "af": "0x0054",
              "bc": "0xFF0500",
              "de": "0x0000FF",
              "hl": "0xD54BB4",
              "ix": "0xD005C0",
              "sp": "0xD1A816",
              "flags": {
                "z": true,
                "c": false,
                "n": false
              }
            },
            "ram": {
              "D00596": "0x12",
              "D005A0": "0x84",
              "D02A73": "0x00",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
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
            "recentBlocks": [
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16"
            ]
          },
          {
            "name": "displayLoop005b4b",
            "block": 20271,
            "pc": "0x005B4B",
            "regs": {
              "af": "0x007C",
              "bc": "0xFF0500",
              "de": "0x0000FF",
              "hl": "0xD54BBE",
              "ix": "0xD005C1",
              "sp": "0xD1A816",
              "flags": {
                "z": true,
                "c": false,
                "n": false
              }
            },
            "ram": {
              "D00596": "0x12",
              "D005A0": "0x84",
              "D02A73": "0x00",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
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
            "recentBlocks": [
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B",
              "0x005AB6",
              "0x005AE8",
              "0x005B16",
              "0x005B4B"
            ]
          },
          {
            "name": "displayCaller005b92",
            "block": 20272,
            "pc": "0x005B92",
            "regs": {
              "af": "0xFF42",
              "bc": "0xFF0005",
              "de": "0x0000FF",
              "hl": "0xD005A0",
              "ix": "0xD005C1",
              "sp": "0xD1A819",
              "flags": {
                "z": true,
                "c": false,
                "n": true
              }
            },
            "ram": {
              "D00596": "0x12",
              "D005A0": "0x85",
              "D02A73": "0x00",
              "D02A75": "0x05",
              "low0059c": "0x095CC3",
              "ixBytes": [
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
            "recentBlocks": [
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
      "D00081": "0x00",
      "D0008D": "0x00",
      "D0009F": "0x00",
      "D000A0": "0x00",
      "D000A3": "0x00",
      "D000A8": "0x00",
      "D000C2": "0x00",
      "D000C4": "0x00",
      "D00121": "0x000000",
      "D00124": "0x0A",
      "D00587": "0x00",
      "D00596": "0x13",
      "D0059C": "0x0000DA",
      "D005A0": "0x85",
      "D0058C": "0x00",
      "D0058D": "0x00",
      "D0058E": "0x00",
      "D007CA": "0x0585E9",
      "D007CD": "0x058B19",
      "D007D0": "0x058B7E",
      "D008E0": "0xD1A863",
      "D0231A": "0x000000",
      "D0243A": "0x000000",
      "D0243D": "0x000000",
      "D02590": "0xD3FE81",
      "D02593": "0xD3FE81",
      "D0259A": "0xD3FE81",
      "D0259D": "0xD3FECD",
      "D025C5": "0x0C0000",
      "D02A28": "0x00",
      "D001B8": "0x00",
      "D001D3": "0x00",
      "vramPixels": 3031
    }
  }
]
```

## Interpretation

The upstream scheduler path is now visible in the dynamic trace, and it is a one-shot seed rather than a per-row caller. Both key cases hit `0x000721 -> 0x013D00 -> 0x013D11` exactly once after cleanup preservation. Static decode shows `0x000721` calls `0x013D00`; the traced `0x013D11` tail clears `(IY+5)` bit 3, loads `A=0x20`, loads `B=0x0E`, then calls `0x0059C6`. From that seed, the row renderer path `0x0059C6 -> 0x005A75 -> 0x005A82 -> 0x00596E` repeats 87 times before the transfer setup. The captured stack top and IX frame are emitted for first samples and final tail windows below.

The display/status loop remains the same 16-pass row/bits renderer. Static decode shows `0x005AAE` seeds the low row pointer at `0x00059C` and outer `B=0x10`; `0x005AB6` derives a VRAM row address from `D005A0`, that low pointer, and base `0xD40000`; `0x005AE8` saves the glyph/status byte in `D02A73`, stores the inner constant `0x05` at `D02A75`, then uses `B=5`/`C=<glyph-byte>` for the bit-to-pixel store sequence; `0x005B16` and `0x005B4B` shift bits from C into repeated two-pixel stores; and `0x005B4B` increments `D005A0`, restores/decrements the outer B, and either loops back to `0x005AB6` or falls through to `0x005B92`.

Dynamic tail windows show the final fallthrough occurs after the 16th outer pass in both key cases. The counts line up exactly: `0x005AE8`/`0x005B16`/`0x005B4B` hit 1,392 times = 87 row-renderer calls * 16 passes, while standalone `0x005AB6` hits 1,305 times = 87 * 15 because the first pass is embedded in the `0x005AAE` block. At each `0x005B92` tail, the renderer has consumed the same IX-byte stream and then unwinds through `0x005A19 -> 0x0059DA -> 0x0059E6`; the `0x0059DA` row/status advance is the repeated scheduler inside the seeded frame. After 87 row advances, the same caller path performs the one-shot transfer setup (`0x006475`, `0x00647D`, `0x0064C7`) and returns through `0x0017FC` into `0x0064D0`.

At `0x0064D0`, the frame builder discards the caller HL (`POP HL`), pushes constant `BC=0x000100`, pushes `BC=(IX+6)=0x020000`, then calls `0x006CC6`. `0x006CC6` seeds `IX-6` from `D00121 & 0x3F` and jumps straight to `0x006D5D`; the low loop then calls the zero-compare helper `0x0021C2` on `IX+9`, and `0x006D64` loops back to `0x006CDF` while the compare is NZ. This is a low display/status transfer frame with fixed IX-frame inputs, not a route reopened by preserving cx/VAT.

The route decision is therefore a normal completion of a low helper scheduled renderer/transfer frame, not a missed restore of cx/VAT/key/edit fields. The remaining unknown has moved one level higher: why the active caller schedules the one-shot `0x000721 -> 0x013D00 -> 0x013D11` display/status seed instead of returning toward the `0x08Fxxx` token/tail engine.

No runtime, transpiler, browser, or scheduler source files were modified.


# Phase 686: D000C2 / 0x0158DE Gate A/B

Probe: `probe-phase686-d000c2-gate-ab.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase686-d000c2-gate-ab.mjs`

## Result

- Overall: **PASS**
- VAT snapshot captured: true
- Main finding: probe-only D000C2 bit7 gate is a clean pre-owner bypass: setting bit 7 at 0x0158DE returns to 0x0013DA before 0x0158E8/0x0158BC, preserves buffer/cursor/context/full-VRAM equivalence with browser early-stop except D000C2=0x80, and still allows a subsequent digit insert with the bit left set

## First-Insert Policies

| policy | termination | steps | insert block | release block | gate set block | 0x0158E8 hits | 0x0158BC hits | 0x001879 hits | 0x0018F8 hits | D000C2 | D007CA | D0243A | D02590 | buffer | VRAM hash/nonWhite | second termination | second buffer | second D0243A |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|---|---:|
| early-stop-before-0158bc | stop_0158e8_before_owner | 6308 | 2601 | 2601 | - | 1 | 0 | 0 | 0 | 0x00 | 0x0585E9 | 0xD1A8CD | 0xD3FE81 | 0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00 | 0x4BBD1039/8754 | insert_stop | 0x32 0x32 0x00 0x00 0x00 0x00 0x00 0x00 | 0xD1A8CE |
| d000c2-bit7-at-0158de-stop-return | gate_return_0013da | 6809 | 2890 | 2890 | 6790 | 0 | 0 | 0 | 0 | 0x80 | 0x0585E9 | 0xD1A8CD | 0xD3FE81 | 0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00 | 0x4BBD1039/8754 | insert_stop | 0x32 0x32 0x00 0x00 0x00 0x00 0x00 0x00 | 0xD1A8CE |

## Equivalence

- Core state equivalent after first insert: true
- Exact VRAM hash match: true
- Intentional D000C2 delta: early-stop=0x00, gate-bypass=0x80
- Second insert works from early-stop state: true
- Second insert works from gate-bypass state with D000C2 still set: true

## Event Samples

```json
{
  "earlyStop": [
    {
      "kind": "inserted-prefix",
      "block": 2601,
      "steps": 2607,
      "pc": "0x05E372",
      "state": {
        "pc": "0x05E372",
        "a": "0x00",
        "f": "0x44",
        "bc": "0x009000",
        "de": "0x000032",
        "hl": "0xD1A8CD",
        "ix": "0xD1A860",
        "iy": "0xD00080",
        "sp": "0xD1A842",
        "stack24": [
          "0x05E352",
          "0x003662",
          "0x05E654",
          "0x000032"
        ],
        "D00080": "0x18",
        "D0009B": "0x00",
        "D0009F": "0x00",
        "D000A3": "0x0A",
        "D000C2": "0x00",
        "D00587": "0x1A",
        "D0058C": "0x90",
        "D0058D": "0x1A",
        "D0058E": "0x90",
        "D007CA": "0x0585E9",
        "D008E0": "0xD1A863",
        "D0231A": "0xD2A83E",
        "D0243A": "0xD1A8CD",
        "D0243D": "0xD2A83E",
        "D02587": "0xD3A854",
        "D02590": "0xD3FE81",
        "D02593": "0xD3FE81",
        "D0259A": "0xD3FE81",
        "D0259D": "0xD3FECD",
        "buffer": "0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
        "matrix3": "0xFD",
        "vram": {
          "hash": "0x1DBBAFE7",
          "nonWhite": 8585,
          "nonZero": 76764,
          "bbox": "0-48/0-319"
        }
      },
      "expectedPrefix": "0x32"
    },
    {
      "kind": "release-matrix",
      "block": 2601,
      "steps": 2607,
      "pc": "0x05E372",
      "state": {
        "pc": "0x05E372",
        "a": "0x00",
        "f": "0x44",
        "bc": "0x009000",
        "de": "0x000032",
        "hl": "0xD1A8CD",
        "ix": "0xD1A860",
        "iy": "0xD00080",
        "sp": "0xD1A842",
        "stack24": [
          "0x05E352",
          "0x003662",
          "0x05E654",
          "0x000032"
        ],
        "D00080": "0x10",
        "D0009B": "0x00",
        "D0009F": "0x00",
        "D000A3": "0x0A",
        "D000C2": "0x00",
        "D00587": "0x00",
        "D0058C": "0x90",
        "D0058D": "0x1A",
        "D0058E": "0x90",
        "D007CA": "0x0585E9",
        "D008E0": "0xD1A863",
        "D0231A": "0xD2A83E",
        "D0243A": "0xD1A8CD",
        "D0243D": "0xD2A83E",
        "D02587": "0xD3A854",
        "D02590": "0xD3FE81",
        "D02593": "0xD3FE81",
        "D0259A": "0xD3FE81",
        "D0259D": "0xD3FECD",
        "buffer": "0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
        "matrix3": "0xFF",
        "vram": {
          "hash": "0x1DBBAFE7",
          "nonWhite": 8585,
          "nonZero": 76764,
          "bbox": "0-48/0-319"
        }
      }
    },
    {
      "kind": "gate-entry-before-policy",
      "block": 6293,
      "steps": 6307,
      "pc": "0x0158DE",
      "state": {
        "pc": "0x0158DE",
        "a": "0xD0",
        "f": "0x42",
        "bc": "0x00A005",
        "de": "0xD1A7FC",
        "hl": "0x000000",
        "ix": "0x000000",
        "iy": "0xD00080",
        "sp": "0xD1A87B",
        "stack24": [
          "0x0013DA",
          "0x000000",
          "0x000000",
          "0x000000"
        ],
        "D00080": "0x18",
        "D0009B": "0x00",
        "D0009F": "0x00",
        "D000A3": "0x0A",
        "D000C2": "0x00",
        "D00587": "0x00",
        "D0058C": "0x00",
        "D0058D": "0x1A",
        "D0058E": "0x00",
        "D007CA": "0x0585E9",
        "D008E0": "0xD1A863",
        "D0231A": "0xD2A83E",
        "D0243A": "0xD1A8CD",
        "D0243D": "0xD2A83E",
        "D02587": "0xD3A854",
        "D02590": "0xD3FE81",
        "D02593": "0xD3FE81",
        "D0259A": "0xD3FE81",
        "D0259D": "0xD3FECD",
        "buffer": "0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
        "matrix3": "0xFF",
        "vram": {
          "hash": "0x4BBD1039",
          "nonWhite": 8754,
          "nonZero": 76595,
          "bbox": "0-52/0-319"
        }
      }
    },
    {
      "kind": "stop-before-0158bc",
      "block": 6294,
      "steps": 6308,
      "pc": "0x0158E8",
      "state": {
        "pc": "0x0158E8",
        "a": "0xD0",
        "f": "0x54",
        "bc": "0x00A005",
        "de": "0xD1A7FC",
        "hl": "0x000000",
        "ix": "0x000000",
        "iy": "0xD00080",
        "sp": "0xD1A87B",
        "stack24": [
          "0x0013DA",
          "0x000000",
          "0x000000",
          "0x000000"
        ],
        "D00080": "0x18",
        "D0009B": "0x00",
        "D0009F": "0x00",
        "D000A3": "0x0A",
        "D000C2": "0x00",
        "D00587": "0x00",
        "D0058C": "0x00",
        "D0058D": "0x1A",
        "D0058E": "0x00",
        "D007CA": "0x0585E9",
        "D008E0": "0xD1A863",
        "D0231A": "0xD2A83E",
        "D0243A": "0xD1A8CD",
        "D0243D": "0xD2A83E",
        "D02587": "0xD3A854",
        "D02590": "0xD3FE81",
        "D02593": "0xD3FE81",
        "D0259A": "0xD3FE81",
        "D0259D": "0xD3FECD",
        "buffer": "0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
        "matrix3": "0xFF",
        "vram": {
          "hash": "0x4BBD1039",
          "nonWhite": 8754,
          "nonZero": 76595,
          "bbox": "0-52/0-319"
        }
      }
    }
  ],
  "gateBypass": [
    {
      "kind": "inserted-prefix",
      "block": 2890,
      "steps": 2898,
      "pc": "0x05E372",
      "state": {
        "pc": "0x05E372",
        "a": "0x00",
        "f": "0x44",
        "bc": "0x009000",
        "de": "0x000032",
        "hl": "0xD1A8CD",
        "ix": "0xD1A860",
        "iy": "0xD00080",
        "sp": "0xD1A842",
        "stack24": [
          "0x05E352",
          "0x003662",
          "0x05E654",
          "0x000032"
        ],
        "D00080": "0x18",
        "D0009B": "0x00",
        "D0009F": "0x00",
        "D000A3": "0x0A",
        "D000C2": "0x00",
        "D00587": "0x1A",
        "D0058C": "0x90",
        "D0058D": "0x1A",
        "D0058E": "0x90",
        "D007CA": "0x0585E9",
        "D008E0": "0xD1A863",
        "D0231A": "0xD2A83E",
        "D0243A": "0xD1A8CD",
        "D0243D": "0xD2A83E",
        "D02587": "0xD3A854",
        "D02590": "0xD3FE81",
        "D02593": "0xD3FE81",
        "D0259A": "0xD3FE81",
        "D0259D": "0xD3FECD",
        "buffer": "0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
        "matrix3": "0xFD",
        "vram": {
          "hash": "0x1DBBAFE7",
          "nonWhite": 8585,
          "nonZero": 76764,
          "bbox": "0-48/0-319"
        }
      },
      "expectedPrefix": "0x32"
    },
    {
      "kind": "release-matrix",
      "block": 2890,
      "steps": 2898,
      "pc": "0x05E372",
      "state": {
        "pc": "0x05E372",
        "a": "0x00",
        "f": "0x44",
        "bc": "0x009000",
        "de": "0x000032",
        "hl": "0xD1A8CD",
        "ix": "0xD1A860",
        "iy": "0xD00080",
        "sp": "0xD1A842",
        "stack24": [
          "0x05E352",
          "0x003662",
          "0x05E654",
          "0x000032"
        ],
        "D00080": "0x10",
        "D0009B": "0x00",
        "D0009F": "0x00",
        "D000A3": "0x0A",
        "D000C2": "0x00",
        "D00587": "0x00",
        "D0058C": "0x90",
        "D0058D": "0x1A",
        "D0058E": "0x90",
        "D007CA": "0x0585E9",
        "D008E0": "0xD1A863",
        "D0231A": "0xD2A83E",
        "D0243A": "0xD1A8CD",
        "D0243D": "0xD2A83E",
        "D02587": "0xD3A854",
        "D02590": "0xD3FE81",
        "D02593": "0xD3FE81",
        "D0259A": "0xD3FE81",
        "D0259D": "0xD3FECD",
        "buffer": "0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
        "matrix3": "0xFF",
        "vram": {
          "hash": "0x1DBBAFE7",
          "nonWhite": 8585,
          "nonZero": 76764,
          "bbox": "0-48/0-319"
        }
      }
    },
    {
      "kind": "gate-entry-before-policy",
      "block": 6790,
      "steps": 6808,
      "pc": "0x0158DE",
      "state": {
        "pc": "0x0158DE",
        "a": "0xD0",
        "f": "0x42",
        "bc": "0x00A005",
        "de": "0xD1A7FC",
        "hl": "0x000000",
        "ix": "0x000000",
        "iy": "0xD00080",
        "sp": "0xD1A87B",
        "stack24": [
          "0x0013DA",
          "0x000000",
          "0x000000",
          "0x000000"
        ],
        "D00080": "0x18",
        "D0009B": "0x00",
        "D0009F": "0x00",
        "D000A3": "0x0A",
        "D000C2": "0x00",
        "D00587": "0x00",
        "D0058C": "0x00",
        "D0058D": "0x1A",
        "D0058E": "0x00",
        "D007CA": "0x0585E9",
        "D008E0": "0xD1A863",
        "D0231A": "0xD2A83E",
        "D0243A": "0xD1A8CD",
        "D0243D": "0xD2A83E",
        "D02587": "0xD3A854",
        "D02590": "0xD3FE81",
        "D02593": "0xD3FE81",
        "D0259A": "0xD3FE81",
        "D0259D": "0xD3FECD",
        "buffer": "0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
        "matrix3": "0xFF",
        "vram": {
          "hash": "0x4BBD1039",
          "nonWhite": 8754,
          "nonZero": 76595,
          "bbox": "0-52/0-319"
        }
      }
    },
    {
      "kind": "gate-bit7-set",
      "block": 6790,
      "steps": 6808,
      "pc": "0x0158DE",
      "state": {
        "pc": "0x0158DE",
        "a": "0xD0",
        "f": "0x42",
        "bc": "0x00A005",
        "de": "0xD1A7FC",
        "hl": "0x000000",
        "ix": "0x000000",
        "iy": "0xD00080",
        "sp": "0xD1A87B",
        "stack24": [
          "0x0013DA",
          "0x000000",
          "0x000000",
          "0x000000"
        ],
        "D00080": "0x18",
        "D0009B": "0x00",
        "D0009F": "0x00",
        "D000A3": "0x0A",
        "D000C2": "0x80",
        "D00587": "0x00",
        "D0058C": "0x00",
        "D0058D": "0x1A",
        "D0058E": "0x00",
        "D007CA": "0x0585E9",
        "D008E0": "0xD1A863",
        "D0231A": "0xD2A83E",
        "D0243A": "0xD1A8CD",
        "D0243D": "0xD2A83E",
        "D02587": "0xD3A854",
        "D02590": "0xD3FE81",
        "D02593": "0xD3FE81",
        "D0259A": "0xD3FE81",
        "D0259D": "0xD3FECD",
        "buffer": "0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
        "matrix3": "0xFF",
        "vram": {
          "hash": "0x4BBD1039",
          "nonWhite": 8754,
          "nonZero": 76595,
          "bbox": "0-52/0-319"
        }
      }
    },
    {
      "kind": "gate-return-stop",
      "block": 6791,
      "steps": 6809,
      "pc": "0x0013DA",
      "state": {
        "pc": "0x0013DA",
        "a": "0xD0",
        "f": "0x90",
        "bc": "0x00A005",
        "de": "0xD1A7FC",
        "hl": "0x000000",
        "ix": "0x000000",
        "iy": "0xD00080",
        "sp": "0xD1A87E",
        "stack24": [
          "0x000000",
          "0x000000",
          "0x000000",
          "0x000000"
        ],
        "D00080": "0x18",
        "D0009B": "0x00",
        "D0009F": "0x00",
        "D000A3": "0x0A",
        "D000C2": "0x80",
        "D00587": "0x00",
        "D0058C": "0x00",
        "D0058D": "0x1A",
        "D0058E": "0x00",
        "D007CA": "0x0585E9",
        "D008E0": "0xD1A863",
        "D0231A": "0xD2A83E",
        "D0243A": "0xD1A8CD",
        "D0243D": "0xD2A83E",
        "D02587": "0xD3A854",
        "D02590": "0xD3FE81",
        "D02593": "0xD3FE81",
        "D0259A": "0xD3FE81",
        "D0259D": "0xD3FECD",
        "buffer": "0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
        "matrix3": "0xFF",
        "vram": {
          "hash": "0x4BBD1039",
          "nonWhite": 8754,
          "nonZero": 76595,
          "bbox": "0-52/0-319"
        }
      }
    }
  ],
  "earlySecond": [
    {
      "kind": "inserted-prefix",
      "block": 3505,
      "steps": 3513,
      "pc": "0x05E372",
      "state": {
        "pc": "0x05E372",
        "a": "0x00",
        "f": "0x44",
        "bc": "0x009005",
        "de": "0x000032",
        "hl": "0xD1A8CE",
        "ix": "0xD1A860",
        "iy": "0xD00080",
        "sp": "0xD1A842",
        "stack24": [
          "0x05E352",
          "0x003662",
          "0x05E654",
          "0x000032"
        ],
        "D00080": "0x18",
        "D0009B": "0x00",
        "D0009F": "0x00",
        "D000A3": "0x0A",
        "D000C2": "0x00",
        "D00587": "0x1A",
        "D0058C": "0x90",
        "D0058D": "0x1A",
        "D0058E": "0x90",
        "D007CA": "0x0585E9",
        "D008E0": "0xD1A863",
        "D0231A": "0xD2A83E",
        "D0243A": "0xD1A8CE",
        "D0243D": "0xD2A83E",
        "D02587": "0xD3A854",
        "D02590": "0xD3FE81",
        "D02593": "0xD3FE81",
        "D0259A": "0xD3FE81",
        "D0259D": "0xD3FECD",
        "buffer": "0x32 0x32 0x00 0x00 0x00 0x00 0x00 0x00",
        "matrix3": "0xFD",
        "vram": {
          "hash": "0xE51C6171",
          "nonWhite": 8650,
          "nonZero": 76699,
          "bbox": "0-52/0-319"
        }
      },
      "expectedPrefix": "0x32 0x32"
    },
    {
      "kind": "release-matrix",
      "block": 3505,
      "steps": 3513,
      "pc": "0x05E372",
      "state": {
        "pc": "0x05E372",
        "a": "0x00",
        "f": "0x44",
        "bc": "0x009005",
        "de": "0x000032",
        "hl": "0xD1A8CE",
        "ix": "0xD1A860",
        "iy": "0xD00080",
        "sp": "0xD1A842",
        "stack24": [
          "0x05E352",
          "0x003662",
          "0x05E654",
          "0x000032"
        ],
        "D00080": "0x10",
        "D0009B": "0x00",
        "D0009F": "0x00",
        "D000A3": "0x0A",
        "D000C2": "0x00",
        "D00587": "0x00",
        "D0058C": "0x90",
        "D0058D": "0x1A",
        "D0058E": "0x90",
        "D007CA": "0x0585E9",
        "D008E0": "0xD1A863",
        "D0231A": "0xD2A83E",
        "D0243A": "0xD1A8CE",
        "D0243D": "0xD2A83E",
        "D02587": "0xD3A854",
        "D02590": "0xD3FE81",
        "D02593": "0xD3FE81",
        "D0259A": "0xD3FE81",
        "D0259D": "0xD3FECD",
        "buffer": "0x32 0x32 0x00 0x00 0x00 0x00 0x00 0x00",
        "matrix3": "0xFF",
        "vram": {
          "hash": "0xE51C6171",
          "nonWhite": 8650,
          "nonZero": 76699,
          "bbox": "0-52/0-319"
        }
      }
    }
  ],
  "gateSecond": [
    {
      "kind": "inserted-prefix",
      "block": 3215,
      "steps": 3221,
      "pc": "0x05E372",
      "state": {
        "pc": "0x05E372",
        "a": "0x00",
        "f": "0x44",
        "bc": "0x009005",
        "de": "0x000032",
        "hl": "0xD1A8CE",
        "ix": "0xD1A860",
        "iy": "0xD00080",
        "sp": "0xD1A842",
        "stack24": [
          "0x05E352",
          "0x003662",
          "0x05E654",
          "0x000032"
        ],
        "D00080": "0x18",
        "D0009B": "0x00",
        "D0009F": "0x00",
        "D000A3": "0x0A",
        "D000C2": "0x80",
        "D00587": "0x1A",
        "D0058C": "0x90",
        "D0058D": "0x1A",
        "D0058E": "0x90",
        "D007CA": "0x0585E9",
        "D008E0": "0xD1A863",
        "D0231A": "0xD2A83E",
        "D0243A": "0xD1A8CE",
        "D0243D": "0xD2A83E",
        "D02587": "0xD3A854",
        "D02590": "0xD3FE81",
        "D02593": "0xD3FE81",
        "D0259A": "0xD3FE81",
        "D0259D": "0xD3FECD",
        "buffer": "0x32 0x32 0x00 0x00 0x00 0x00 0x00 0x00",
        "matrix3": "0xFD",
        "vram": {
          "hash": "0xE51C6171",
          "nonWhite": 8650,
          "nonZero": 76699,
          "bbox": "0-52/0-319"
        }
      },
      "expectedPrefix": "0x32 0x32"
    },
    {
      "kind": "release-matrix",
      "block": 3215,
      "steps": 3221,
      "pc": "0x05E372",
      "state": {
        "pc": "0x05E372",
        "a": "0x00",
        "f": "0x44",
        "bc": "0x009005",
        "de": "0x000032",
        "hl": "0xD1A8CE",
        "ix": "0xD1A860",
        "iy": "0xD00080",
        "sp": "0xD1A842",
        "stack24": [
          "0x05E352",
          "0x003662",
          "0x05E654",
          "0x000032"
        ],
        "D00080": "0x10",
        "D0009B": "0x00",
        "D0009F": "0x00",
        "D000A3": "0x0A",
        "D000C2": "0x80",
        "D00587": "0x00",
        "D0058C": "0x90",
        "D0058D": "0x1A",
        "D0058E": "0x90",
        "D007CA": "0x0585E9",
        "D008E0": "0xD1A863",
        "D0231A": "0xD2A83E",
        "D0243A": "0xD1A8CE",
        "D0243D": "0xD2A83E",
        "D02587": "0xD3A854",
        "D02590": "0xD3FE81",
        "D02593": "0xD3FE81",
        "D0259A": "0xD3FE81",
        "D0259D": "0xD3FECD",
        "buffer": "0x32 0x32 0x00 0x00 0x00 0x00 0x00 0x00",
        "matrix3": "0xFF",
        "vram": {
          "hash": "0xE51C6171",
          "nonWhite": 8650,
          "nonZero": 76699,
          "bbox": "0-52/0-319"
        }
      }
    }
  ]
}
```

## Compact JSON

```json
{
  "phases": [
    {
      "name": "coldboot",
      "termination": "max_steps",
      "steps": 20000,
      "lastPc": "0x001CC0"
    },
    {
      "name": "kernel",
      "termination": "max_steps",
      "steps": 100000,
      "lastPc": "0x000A92"
    },
    {
      "name": "postinit",
      "termination": "max_steps",
      "steps": 100,
      "lastPc": "0x0158BC"
    },
    {
      "name": "warm-idle",
      "termination": "halt",
      "steps": 192290,
      "lastPc": "0x0019B5"
    },
    {
      "name": "launch-home",
      "termination": "halt",
      "steps": 275843,
      "lastPc": "0x0019B5"
    },
    {
      "name": "repaint",
      "termination": "halt",
      "steps": 49474,
      "lastPc": "0x0019B5"
    }
  ],
  "base": {
    "pc": "0x0019B5",
    "a": "0x10",
    "f": "0x54",
    "bc": "0x000000",
    "de": "0xD2A815",
    "hl": "0xD1A8A3",
    "ix": "0xD1A860",
    "iy": "0xD00080",
    "sp": "0xD1A866",
    "stack24": [
      "0xFFFFFF",
      "0xFFFFFF",
      "0xFFFFFF",
      "0xFFFFFF"
    ],
    "D00080": "0x08",
    "D0009B": "0x00",
    "D0009F": "0x20",
    "D000A3": "0x0A",
    "D000C2": "0x00",
    "D00587": "0x1A",
    "D0058C": "0x90",
    "D0058D": "0x90",
    "D0058E": "0x90",
    "D007CA": "0x0585E9",
    "D008E0": "0x000000",
    "D0231A": "0xD2A83E",
    "D0243A": "0xD1A8CC",
    "D0243D": "0xD2A83E",
    "D02587": "0xD3A854",
    "D02590": "0xD3FE81",
    "D02593": "0xD3FE81",
    "D0259A": "0xD3FE81",
    "D0259D": "0xD3FECD",
    "buffer": "0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
    "matrix3": "0xFF",
    "vram": {
      "hash": "0xA5610B57",
      "nonWhite": 8549,
      "nonZero": 76800,
      "bbox": "0-29/0-319"
    }
  },
  "earlyStop": {
    "termination": "stop_0158e8_before_owner",
    "steps": 6308,
    "counts": {
      "getcsc": 1,
      "cxMain": 1,
      "gate": 1,
      "preOwnerCall": 1,
      "cleanupOwner": 0,
      "cleanupEntry": 0,
      "wipe": 0
    },
    "after": {
      "pc": "0x0158E8",
      "a": "0xD0",
      "f": "0x54",
      "bc": "0x00A005",
      "de": "0xD1A7FC",
      "hl": "0x000000",
      "ix": "0x000000",
      "iy": "0xD00080",
      "sp": "0xD1A87B",
      "stack24": [
        "0x0013DA",
        "0x000000",
        "0x000000",
        "0x000000"
      ],
      "D00080": "0x18",
      "D0009B": "0x00",
      "D0009F": "0x00",
      "D000A3": "0x0A",
      "D000C2": "0x00",
      "D00587": "0x00",
      "D0058C": "0x00",
      "D0058D": "0x1A",
      "D0058E": "0x00",
      "D007CA": "0x0585E9",
      "D008E0": "0xD1A863",
      "D0231A": "0xD2A83E",
      "D0243A": "0xD1A8CD",
      "D0243D": "0xD2A83E",
      "D02587": "0xD3A854",
      "D02590": "0xD3FE81",
      "D02593": "0xD3FE81",
      "D0259A": "0xD3FE81",
      "D0259D": "0xD3FECD",
      "buffer": "0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
      "matrix3": "0xFF",
      "vram": {
        "hash": "0x4BBD1039",
        "nonWhite": 8754,
        "nonZero": 76595,
        "bbox": "0-52/0-319"
      }
    }
  },
  "gateBypass": {
    "termination": "gate_return_0013da",
    "steps": 6809,
    "counts": {
      "getcsc": 1,
      "cxMain": 1,
      "gate": 1,
      "preOwnerCall": 0,
      "cleanupOwner": 0,
      "cleanupEntry": 0,
      "wipe": 0
    },
    "after": {
      "pc": "0x0013DA",
      "a": "0xD0",
      "f": "0x90",
      "bc": "0x00A005",
      "de": "0xD1A7FC",
      "hl": "0x000000",
      "ix": "0x000000",
      "iy": "0xD00080",
      "sp": "0xD1A87E",
      "stack24": [
        "0x000000",
        "0x000000",
        "0x000000",
        "0x000000"
      ],
      "D00080": "0x18",
      "D0009B": "0x00",
      "D0009F": "0x00",
      "D000A3": "0x0A",
      "D000C2": "0x80",
      "D00587": "0x00",
      "D0058C": "0x00",
      "D0058D": "0x1A",
      "D0058E": "0x00",
      "D007CA": "0x0585E9",
      "D008E0": "0xD1A863",
      "D0231A": "0xD2A83E",
      "D0243A": "0xD1A8CD",
      "D0243D": "0xD2A83E",
      "D02587": "0xD3A854",
      "D02590": "0xD3FE81",
      "D02593": "0xD3FE81",
      "D0259A": "0xD3FE81",
      "D0259D": "0xD3FECD",
      "buffer": "0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
      "matrix3": "0xFF",
      "vram": {
        "hash": "0x4BBD1039",
        "nonWhite": 8754,
        "nonZero": 76595,
        "bbox": "0-52/0-319"
      }
    }
  },
  "earlySecond": {
    "termination": "insert_stop",
    "steps": 3513,
    "counts": {
      "getcsc": 0,
      "cxMain": 1,
      "gate": 0,
      "preOwnerCall": 0,
      "cleanupOwner": 0,
      "cleanupEntry": 0,
      "wipe": 0
    },
    "after": {
      "pc": "0x05E372",
      "a": "0x00",
      "f": "0x44",
      "bc": "0x009005",
      "de": "0x000032",
      "hl": "0xD1A8CE",
      "ix": "0xD1A860",
      "iy": "0xD00080",
      "sp": "0xD1A842",
      "stack24": [
        "0x05E352",
        "0x003662",
        "0x05E654",
        "0x000032"
      ],
      "D00080": "0x10",
      "D0009B": "0x00",
      "D0009F": "0x00",
      "D000A3": "0x0A",
      "D000C2": "0x00",
      "D00587": "0x00",
      "D0058C": "0x90",
      "D0058D": "0x1A",
      "D0058E": "0x90",
      "D007CA": "0x0585E9",
      "D008E0": "0xD1A863",
      "D0231A": "0xD2A83E",
      "D0243A": "0xD1A8CE",
      "D0243D": "0xD2A83E",
      "D02587": "0xD3A854",
      "D02590": "0xD3FE81",
      "D02593": "0xD3FE81",
      "D0259A": "0xD3FE81",
      "D0259D": "0xD3FECD",
      "buffer": "0x32 0x32 0x00 0x00 0x00 0x00 0x00 0x00",
      "matrix3": "0xFF",
      "vram": {
        "hash": "0xE51C6171",
        "nonWhite": 8650,
        "nonZero": 76699,
        "bbox": "0-52/0-319"
      }
    }
  },
  "gateSecond": {
    "termination": "insert_stop",
    "steps": 3221,
    "counts": {
      "getcsc": 0,
      "cxMain": 1,
      "gate": 0,
      "preOwnerCall": 0,
      "cleanupOwner": 0,
      "cleanupEntry": 0,
      "wipe": 0
    },
    "after": {
      "pc": "0x05E372",
      "a": "0x00",
      "f": "0x44",
      "bc": "0x009005",
      "de": "0x000032",
      "hl": "0xD1A8CE",
      "ix": "0xD1A860",
      "iy": "0xD00080",
      "sp": "0xD1A842",
      "stack24": [
        "0x05E352",
        "0x003662",
        "0x05E654",
        "0x000032"
      ],
      "D00080": "0x10",
      "D0009B": "0x00",
      "D0009F": "0x00",
      "D000A3": "0x0A",
      "D000C2": "0x80",
      "D00587": "0x00",
      "D0058C": "0x90",
      "D0058D": "0x1A",
      "D0058E": "0x90",
      "D007CA": "0x0585E9",
      "D008E0": "0xD1A863",
      "D0231A": "0xD2A83E",
      "D0243A": "0xD1A8CE",
      "D0243D": "0xD2A83E",
      "D02587": "0xD3A854",
      "D02590": "0xD3FE81",
      "D02593": "0xD3FE81",
      "D0259A": "0xD3FE81",
      "D0259D": "0xD3FECD",
      "buffer": "0x32 0x32 0x00 0x00 0x00 0x00 0x00 0x00",
      "matrix3": "0xFF",
      "vram": {
        "hash": "0xE51C6171",
        "nonWhite": 8650,
        "nonZero": 76699,
        "bbox": "0-52/0-319"
      }
    }
  },
  "equivalence": {
    "coreState": true,
    "vramHash": true
  },
  "secondPass": {
    "early": true,
    "gate": true
  }
}
```

## Interpretation

- Setting `D000C2` bit 7 at the entry of `0x0158DE` makes the local `RET NZ` return to `0x0013DA` before the `0x0158E8 -> 0x0158BC` owner call.
- The resulting memory/display state matches the existing browser-style early stop before `0x0158BC` for the tested edit/VAT fields and full-VRAM hash. The only intentional difference is `D000C2=0x80`.
- A subsequent Digit2 insert reaches the second buffer byte from both states. The gate-bypass case was intentionally left with `D000C2` bit 7 still set, so the flag does not block the next browser-framed key insert in this probe.


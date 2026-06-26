# Phase 842: 0x006Dxx MMIO/Port Poll Identification

Probe: `probe-phase842-006dxx-mmio-poll.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase842-006dxx-mmio-poll.mjs`

## Summary

- **** Faithful-state input: OS launch-home init plus clean home repaint, then probe-local physical edit-context seed D0243A=0xD1A8CC/D0243D=0xD2A83E; pre-key fields were `D0243A=0xD1A8CC`, `D0243D=0xD2A83E`, `D02A29=0x0000`, then CLEAR scancode `0x0F` was seeded without any browser `0x0A229D` pre-stop.
- **** The run reached the expected low loop and stopped after sampling it: termination=`sampled-006dxx-poll`, steps=20966, low-region hits=330, `0x0A229D` hits=0, `0x08F54B` hits=0.
- **** Exact polled port: block `0x006D4F` executes `IN A,(C)` at `0x006D57` with `BC=0x002001`, so the status port is `0x2001`. The next instructions are `BIT 3,A` at `0x006D59` and `JR NZ,0x006D57` at `0x006D5B`.
- *** Dynamic values: sampled 64 reads from port `0x2001`; values=0x00; bit 3 was always clear. With current `peripherals.js`, this means the inner hardware busy-poll falls through immediately.
- *** The continuing hot loop is therefore the surrounding `0x006D64 JP NZ,0x006CDF` condition, not a busy bit stuck high at `0x006D57`. At first sampled `0x006D64`, JP NZ to 0x006CDF; `HL/IX+9` were non-zero in the loop frame.

## Scenario Attempts

| Scenario | Termination | Steps | Low 0x006D Hits | Poll Reads | Top PCs |
| --- | --- | ---: | ---: | ---: | --- |
| captured-preclear-ram | max_steps | 220000 | 0 | 0 | 0x09EFDE:30393, 0x026815:7856, 0x02681A:7856 |
| in-memory-launch-home-repaint | sampled-006dxx-poll | 20966 | 330 | 64 | 0x09EFDE:2880, 0x005AE8:1392, 0x005B16:1392 |

## Poll Samples

| # | Block | Instruction | Address | Value | Bit | Branch Meaning |
| ---: | --- | --- | --- | --- | --- | --- |
| 1 | 0x006D4F | 0x006D57 | port 0x2001 | 0x00 | bit3=0 | fall through to 0x006D5D |
| 2 | 0x006D4F | 0x006D57 | port 0x2001 | 0x00 | bit3=0 | fall through to 0x006D5D |
| 3 | 0x006D4F | 0x006D57 | port 0x2001 | 0x00 | bit3=0 | fall through to 0x006D5D |
| 4 | 0x006D4F | 0x006D57 | port 0x2001 | 0x00 | bit3=0 | fall through to 0x006D5D |
| 5 | 0x006D4F | 0x006D57 | port 0x2001 | 0x00 | bit3=0 | fall through to 0x006D5D |
| 6 | 0x006D4F | 0x006D57 | port 0x2001 | 0x00 | bit3=0 | fall through to 0x006D5D |
| 7 | 0x006D4F | 0x006D57 | port 0x2001 | 0x00 | bit3=0 | fall through to 0x006D5D |
| 8 | 0x006D4F | 0x006D57 | port 0x2001 | 0x00 | bit3=0 | fall through to 0x006D5D |
| 9 | 0x006D4F | 0x006D57 | port 0x2001 | 0x00 | bit3=0 | fall through to 0x006D5D |
| 10 | 0x006D4F | 0x006D57 | port 0x2001 | 0x00 | bit3=0 | fall through to 0x006D5D |
| 11 | 0x006D4F | 0x006D57 | port 0x2001 | 0x00 | bit3=0 | fall through to 0x006D5D |
| 12 | 0x006D4F | 0x006D57 | port 0x2001 | 0x00 | bit3=0 | fall through to 0x006D5D |
| 13 | 0x006D4F | 0x006D57 | port 0x2001 | 0x00 | bit3=0 | fall through to 0x006D5D |
| 14 | 0x006D4F | 0x006D57 | port 0x2001 | 0x00 | bit3=0 | fall through to 0x006D5D |
| 15 | 0x006D4F | 0x006D57 | port 0x2001 | 0x00 | bit3=0 | fall through to 0x006D5D |
| 16 | 0x006D4F | 0x006D57 | port 0x2001 | 0x00 | bit3=0 | fall through to 0x006D5D |

## Port Writes In The Loop

| # | Block | Instruction | Address | Value | Bit | Branch Meaning |
| ---: | --- | --- | --- | --- | --- | --- |
| 1 | 0x006D38 | 0x006D46 | port 0x2000 | 0x0A | - | - |
| 2 | 0x006D38 | 0x006D46 | port 0x2000 | 0x0E | - | - |
| 3 | 0x006D38 | 0x006D46 | port 0x2000 | 0x0E | - | - |
| 4 | 0x006D38 | 0x006D46 | port 0x2000 | 0x0E | - | - |
| 5 | 0x006D38 | 0x006D46 | port 0x2000 | 0x0E | - | - |
| 6 | 0x006D38 | 0x006D46 | port 0x2000 | 0x0E | - | - |
| 7 | 0x006D38 | 0x006D46 | port 0x2000 | 0x0E | - | - |
| 8 | 0x006D38 | 0x006D46 | port 0x2000 | 0x0E | - | - |
| 9 | 0x006D38 | 0x006D46 | port 0x2000 | 0x0E | - | - |
| 10 | 0x006D38 | 0x006D46 | port 0x2000 | 0x0E | - | - |
| 11 | 0x006D38 | 0x006D46 | port 0x2000 | 0x0E | - | - |
| 12 | 0x006D38 | 0x006D46 | port 0x2000 | 0x0E | - | - |
| 13 | 0x006D38 | 0x006D46 | port 0x2000 | 0x0E | - | - |
| 14 | 0x006D38 | 0x006D46 | port 0x2000 | 0x0E | - | - |
| 15 | 0x006D38 | 0x006D46 | port 0x2000 | 0x0E | - | - |
| 16 | 0x006D38 | 0x006D46 | port 0x2000 | 0x0E | - | - |

## MMIO Reads In The Loop

| # | Block | Instruction | Address | Value | Bit | Branch Meaning |
| ---: | --- | --- | --- | --- | --- | --- |
| - | - | - | - | - | - | - |

## Loop Counts

| Block | Count |
| --- | ---: |
| 0x006CDF | 65 |
| 0x006CF7 | 63 |
| 0x006D0F | 65 |
| 0x006D38 | 64 |
| 0x006D4F | 64 |
| 0x006D5D | 68 |
| 0x0021C2 | 71 |
| 0x006D64 | 67 |

## Peripheral Cross-Check

Current `peripherals.js` already handles this as part of the flash/NAND controller range:

| Line | Source |
| ---: | --- |
| 142 | `function createFlashControllerHandler(state) {` |
| 145 | `if (port === 0x2001) {` |
| 146 | `return 0x00;` |
| 149 | `return 0x00;` |
| 721 | `register({ start: 0x2000, end: 0x200f }, createFlashControllerHandler(state));` |

Interpretation: `0x2001` currently returns `0x00`, which clears bit 3. A probe-local Phase 843 override should start by testing whether some other loop-state/status side effect must also advance, because merely forcing bit 3 clear is already the committed behavior.

## Key Snapshots

### First 0x2001 Poll

```json
{
  "pc": "0x006D4F",
  "currentBlockPc": "0x006D4F",
  "sp": "0xD1A82B",
  "ix": "0xD1A831",
  "iy": "0xD00080",
  "af": "0x0E42",
  "bc": "0x002001",
  "de": "0x002010",
  "hl": "0x000000",
  "flags": {
    "z": true,
    "c": false
  },
  "fields": {
    "D007CA": "0x000000",
    "D008E0": "0x000000",
    "D0243A": "0x000000",
    "D0243D": "0x000000",
    "D02590": "0x000000",
    "D0259D": "0x000000",
    "D02A29": "0x0000",
    "D00080": "0x00",
    "D0009F": "0x00",
    "D00587": "0x00",
    "D0058C": "0x00",
    "D0058E": "0x00",
    "D00121": "0x000040",
    "D00124": "0x0E"
  },
  "ixFrame": {
    "IX-6": "0x000000",
    "IX-3": "0x000040",
    "IX+0": "0xD1A866",
    "IX+3": "0x0064DE",
    "IX+6": "0x020000",
    "IX+9": "0x0000C0"
  }
}
```

### First 0x006D64 Branch

```json
{
  "pc": "0x006D64",
  "currentBlockPc": "0x006D64",
  "sp": "0xD1A82B",
  "ix": "0xD1A831",
  "iy": "0xD00080",
  "af": "0x0002",
  "bc": "0x020000",
  "de": "0x000240",
  "hl": "0x000100",
  "flags": {
    "z": false,
    "c": false
  },
  "fields": {
    "D007CA": "0x000000",
    "D008E0": "0x000000",
    "D0243A": "0x000000",
    "D0243D": "0x000000",
    "D02590": "0x000000",
    "D0259D": "0x000000",
    "D02A29": "0x0000",
    "D00080": "0x00",
    "D0009F": "0x00",
    "D00587": "0x00",
    "D0058C": "0x00",
    "D0058E": "0x00",
    "D00121": "0x000000",
    "D00124": "0x0A"
  },
  "ixFrame": {
    "IX-6": "0x000000",
    "IX-3": "0x020000",
    "IX+0": "0xD1A866",
    "IX+3": "0x0064DE",
    "IX+6": "0x020000",
    "IX+9": "0x000100"
  }
}
```

## Static Loop Blocks

### 0x006CDF

```text
0x006CDF  21 40 00 00    ld hl, 0x000040
0x006CE3  dd 07 fa       ld bc, (ix+-6)
0x006CE6  b7             or a
0x006CE7  ed 42          sbc hl, bc
0x006CE9  dd 2f fd       ld (ix+-3), hl
0x006CEC  dd 07 09       ld bc, (ix+9)
0x006CEF  b7             or a
0x006CF0  ed 42          sbc hl, bc
0x006CF2  38 03          jr c, 0x006cf7
```

Exits: `[{"type":"branch","condition":"c","target":27895,"targetMode":"adl"},{"type":"fallthrough","target":27892,"targetMode":"adl"}]`

### 0x006D38

```text
0x006D38  b7             or a
0x006D39  ed 62          sbc hl, hl
0x006D3B  dd 2f fa       ld (ix+-6), hl
0x006D3E  3a 24 01 d0    ld a, (0xd00124)
0x006D42  01 00 20 00    ld bc, 0x002000
0x006D46  ed 79          out (c), a
0x006D48  f5             push af
0x006D49  78             ld a, b
0x006D4A  fe 20          cp 0x20
0x006D4C  28 01          jr z, 0x006d4f
```

Exits: `[{"type":"branch","condition":"z","target":27983,"targetMode":"adl"},{"type":"fallthrough","target":27982,"targetMode":"adl"}]`

### 0x006D4F

```text
0x006D4F  f1             pop af
0x006D50  3e 0e          ld a, 0x0e
0x006D52  32 24 01 d0    ld (0xd00124), a
0x006D56  03             inc bc
0x006D57  ed 78          in a, (c)
0x006D59  cb 5f          bit 3, a
0x006D5B  20 fa          jr nz, 0x006d57
```

Exits: `[{"type":"branch","condition":"nz","target":27991,"targetMode":"adl"},{"type":"fallthrough","target":27997,"targetMode":"adl"}]`

### 0x006D5D

```text
0x006D5D  dd 27 09       ld hl, (ix+9)
0x006D60  cd c2 21 00    call 0x0021c2
```

Exits: `[{"type":"call","target":8642,"targetMode":"adl"},{"type":"call-return","target":28004,"targetMode":"adl"}]`

### 0x0021C2

```text
0x0021C2  e5             push hl
0x0021C3  d5             push de
0x0021C4  11 00 00 00    ld de, 0x000000
0x0021C8  b7             or a
0x0021C9  ed 52          sbc hl, de
0x0021CB  d1             pop de
0x0021CC  e1             pop hl
0x0021CD  c9             ret
```

Exits: `[{"type":"return"}]`

### 0x006D64

```text
0x006D64  c2 df 6c 00    jp nz, 0x006cdf
```

Exits: `[{"type":"branch","condition":"nz","target":27871,"targetMode":"adl"},{"type":"fallthrough","target":28008,"targetMode":"adl"}]`

## Full JSON

```json
{
  "probe": "phase842-006dxx-mmio-poll",
  "pass": true,
  "result": {
    "scenario": "in-memory-launch-home-repaint",
    "inputDescription": "OS launch-home init plus clean home repaint, then probe-local physical edit-context seed D0243A=0xD1A8CC/D0243D=0xD2A83E",
    "phases": [
      {
        "name": "p1-coldboot",
        "result": {
          "steps": 20000,
          "termination": "max_steps",
          "lastPc": 7360,
          "lastMode": "adl"
        }
      },
      {
        "name": "p2-kernel",
        "result": {
          "steps": 100000,
          "termination": "max_steps",
          "lastPc": 2706,
          "lastMode": "adl"
        }
      },
      {
        "name": "p3-postinit",
        "result": {
          "steps": 100,
          "termination": "max_steps",
          "lastPc": 88252,
          "lastMode": "adl"
        }
      },
      {
        "name": "p4-warm-idle",
        "result": {
          "steps": 192290,
          "termination": "halt",
          "lastPc": 6581,
          "lastMode": "adl"
        }
      }
    ],
    "phase5": {
      "result": {
        "steps": 275843,
        "termination": "halt",
        "lastPc": 6581,
        "lastMode": "adl"
      },
      "targetCounts": {
        "launchHome09dd62": 1,
        "memInit09dee0": 1,
        "clear001879": 2,
        "cleanup0018f8": 2,
        "halt0019b5": 1
      },
      "snapshot": {
        "block": 84130,
        "pc": 6265,
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
        }
      },
      "fieldsAfter": {
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
      }
    },
    "restoredFields": {
      "D007CA": 361961,
      "D008E0": 13740134,
      "D0243A": 0,
      "D0243D": 0,
      "D02590": 13893249,
      "D0259D": 13893325,
      "D02A29": 0,
      "D00080": 0,
      "D0009F": 0,
      "D00587": 0,
      "D0058C": 0,
      "D0058E": 0,
      "D00121": 0,
      "D00124": 0
    },
    "repaint": {
      "result": {
        "steps": 49474,
        "termination": "halt",
        "lastPc": 6581,
        "lastMode": "adl"
      },
      "counts": {
        "homeRepaint058241": 1,
        "cleanup0018f8": 0,
        "halt0019b5": 1
      },
      "blocks": 49398,
      "fields": {
        "D007CA": 361961,
        "D008E0": 0,
        "D0243A": 13740195,
        "D0243D": 13805589,
        "D02590": 13893249,
        "D0259D": 13893325,
        "D02A29": 0,
        "D00080": 0,
        "D0009F": 0,
        "D00587": 0,
        "D0058C": 0,
        "D0058E": 0,
        "D00121": 0,
        "D00124": 0
      }
    },
    "physicalEditSeed": {
      "D0243A": "0xD1A8CC",
      "D0243D": "0xD2A83E",
      "D02A29": "0x0000"
    },
    "initialFields": {
      "D007CA": "0x0585E9",
      "D008E0": "0x000000",
      "D0243A": "0xD1A8CC",
      "D0243D": "0xD2A83E",
      "D02590": "0xD3FE81",
      "D0259D": "0xD3FECD",
      "D02A29": "0x0000",
      "D00080": "0x00",
      "D0009F": "0x00",
      "D00587": "0x00",
      "D0058C": "0x00",
      "D0058E": "0x00",
      "D00121": "0x000000",
      "D00124": "0x00"
    },
    "seededFields": {
      "D007CA": "0x0585E9",
      "D008E0": "0xD1A863",
      "D0243A": "0xD1A8CC",
      "D0243D": "0xD2A83E",
      "D02590": "0xD3FE81",
      "D0259D": "0xD3FECD",
      "D02A29": "0x0000",
      "D00080": "0x08",
      "D0009F": "0x20",
      "D00587": "0x0F",
      "D0058C": "0x0F",
      "D0058E": "0x0F",
      "D00121": "0x000000",
      "D00124": "0x00"
    },
    "result": {
      "steps": 20966,
      "termination": "sampled-006dxx-poll",
      "lastPc": 27997,
      "lastMode": "adl"
    },
    "stopReason": "sampled-006dxx-poll",
    "hitTargets": {
      "preStop0A229D": 0,
      "low006DRegion": 330,
      "eolTuple08F54B": 0,
      "cleanup0018F8": 1
    },
    "firstHits": {
      "cleanup0018F8": {
        "blockIndex": 11129,
        "pc": "0x0018F8",
        "cpu": {
          "pc": "0x0018F8",
          "currentBlockPc": "0x0018F8",
          "sp": "0xD1A87B",
          "ix": "0x000000",
          "iy": "0xD00080",
          "af": "0x5200",
          "bc": "0x0000FF",
          "de": "0xD3FF00",
          "hl": "0xD3FEFF",
          "flags": {
            "z": false,
            "c": false
          },
          "fields": {
            "D007CA": "0x000000",
            "D008E0": "0x000000",
            "D0243A": "0x000000",
            "D0243D": "0x000000",
            "D02590": "0x000000",
            "D0259D": "0x000000",
            "D02A29": "0x0000",
            "D00080": "0x00",
            "D0009F": "0x00",
            "D00587": "0x00",
            "D0058C": "0x00",
            "D0058E": "0x00",
            "D00121": "0x000000",
            "D00124": "0x00"
          },
          "ixFrame": {
            "IX-6": "0x00D140",
            "IX-3": "0x000000",
            "IX+0": "0x7EEDF3",
            "IX+3": "0x58C35B",
            "IX+6": "0xF30006",
            "IX+9": "0x5B7EED"
          }
        }
      },
      "loop006D64": {
        "blockIndex": 20438,
        "pc": "0x006D64",
        "cpu": {
          "pc": "0x006D64",
          "currentBlockPc": "0x006D64",
          "sp": "0xD1A82B",
          "ix": "0xD1A831",
          "iy": "0xD00080",
          "af": "0x0002",
          "bc": "0x020000",
          "de": "0x000240",
          "hl": "0x000100",
          "flags": {
            "z": false,
            "c": false
          },
          "fields": {
            "D007CA": "0x000000",
            "D008E0": "0x000000",
            "D0243A": "0x000000",
            "D0243D": "0x000000",
            "D02590": "0x000000",
            "D0259D": "0x000000",
            "D02A29": "0x0000",
            "D00080": "0x00",
            "D0009F": "0x00",
            "D00587": "0x00",
            "D0058C": "0x00",
            "D0058E": "0x00",
            "D00121": "0x000000",
            "D00124": "0x0A"
          },
          "ixFrame": {
            "IX-6": "0x000000",
            "IX-3": "0x020000",
            "IX+0": "0xD1A866",
            "IX+3": "0x0064DE",
            "IX+6": "0x020000",
            "IX+9": "0x000100"
          }
        }
      },
      "loop006D4F": {
        "blockIndex": 20443,
        "pc": "0x006D4F",
        "cpu": {
          "pc": "0x006D4F",
          "currentBlockPc": "0x006D4F",
          "sp": "0xD1A828",
          "ix": "0xD1A831",
          "iy": "0xD00080",
          "af": "0x2042",
          "bc": "0x002000",
          "de": "0x002010",
          "hl": "0x000000",
          "flags": {
            "z": true,
            "c": false
          },
          "fields": {
            "D007CA": "0x000000",
            "D008E0": "0x000000",
            "D0243A": "0x000000",
            "D0243D": "0x000000",
            "D02590": "0x000000",
            "D0259D": "0x000000",
            "D02A29": "0x0000",
            "D00080": "0x00",
            "D0009F": "0x00",
            "D00587": "0x00",
            "D0058C": "0x00",
            "D0058E": "0x00",
            "D00121": "0x000040",
            "D00124": "0x0A"
          },
          "ixFrame": {
            "IX-6": "0x000000",
            "IX-3": "0x000040",
            "IX+0": "0xD1A866",
            "IX+3": "0x0064DE",
            "IX+6": "0x020000",
            "IX+9": "0x0000C0"
          }
        }
      }
    },
    "loopCounts": {
      "0x006CDF": 65,
      "0x006CF7": 63,
      "0x006D0F": 65,
      "0x006D38": 64,
      "0x006D4F": 64,
      "0x006D5D": 68,
      "0x0021C2": 71,
      "0x006D64": 67
    },
    "samples": {
      "ioReads": [
        {
          "block": "0x006D4F",
          "instructionPc": "0x006D57",
          "port": "0x2001",
          "value": "0x00",
          "bit3Set": false,
          "bit3Branch": "fall through to 0x006D5D",
          "cpu": {
            "pc": "0x006D4F",
            "currentBlockPc": "0x006D4F",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0E42",
            "bc": "0x002001",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000040",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x0064DE",
              "IX+6": "0x020000",
              "IX+9": "0x0000C0"
            }
          }
        },
        {
          "block": "0x006D4F",
          "instructionPc": "0x006D57",
          "port": "0x2001",
          "value": "0x00",
          "bit3Set": false,
          "bit3Branch": "fall through to 0x006D5D",
          "cpu": {
            "pc": "0x006D4F",
            "currentBlockPc": "0x006D4F",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0E42",
            "bc": "0x002001",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000080",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x0064DE",
              "IX+6": "0x020000",
              "IX+9": "0x000080"
            }
          }
        },
        {
          "block": "0x006D4F",
          "instructionPc": "0x006D57",
          "port": "0x2001",
          "value": "0x00",
          "bit3Set": false,
          "bit3Branch": "fall through to 0x006D5D",
          "cpu": {
            "pc": "0x006D4F",
            "currentBlockPc": "0x006D4F",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0E42",
            "bc": "0x002001",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x0000C0",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x0064DE",
              "IX+6": "0x020000",
              "IX+9": "0x000040"
            }
          }
        },
        {
          "block": "0x006D4F",
          "instructionPc": "0x006D57",
          "port": "0x2001",
          "value": "0x00",
          "bit3Set": false,
          "bit3Branch": "fall through to 0x006D5D",
          "cpu": {
            "pc": "0x006D4F",
            "currentBlockPc": "0x006D4F",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0E42",
            "bc": "0x002001",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000100",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x0064DE",
              "IX+6": "0x020000",
              "IX+9": "0x000000"
            }
          }
        },
        {
          "block": "0x006D4F",
          "instructionPc": "0x006D57",
          "port": "0x2001",
          "value": "0x00",
          "bit3Set": false,
          "bit3Branch": "fall through to 0x006D5D",
          "cpu": {
            "pc": "0x006D4F",
            "currentBlockPc": "0x006D4F",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0E42",
            "bc": "0x002001",
            "de": "0x002014",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000140",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x00003C",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D67E"
            }
          }
        },
        {
          "block": "0x006D4F",
          "instructionPc": "0x006D57",
          "port": "0x2001",
          "value": "0x00",
          "bit3Set": false,
          "bit3Branch": "fall through to 0x006D5D",
          "cpu": {
            "pc": "0x006D4F",
            "currentBlockPc": "0x006D4F",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0E42",
            "bc": "0x002001",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000180",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D63E"
            }
          }
        },
        {
          "block": "0x006D4F",
          "instructionPc": "0x006D57",
          "port": "0x2001",
          "value": "0x00",
          "bit3Set": false,
          "bit3Branch": "fall through to 0x006D5D",
          "cpu": {
            "pc": "0x006D4F",
            "currentBlockPc": "0x006D4F",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0E42",
            "bc": "0x002001",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x0001C0",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D5FE"
            }
          }
        },
        {
          "block": "0x006D4F",
          "instructionPc": "0x006D57",
          "port": "0x2001",
          "value": "0x00",
          "bit3Set": false,
          "bit3Branch": "fall through to 0x006D5D",
          "cpu": {
            "pc": "0x006D4F",
            "currentBlockPc": "0x006D4F",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0E42",
            "bc": "0x002001",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000200",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D5BE"
            }
          }
        },
        {
          "block": "0x006D4F",
          "instructionPc": "0x006D57",
          "port": "0x2001",
          "value": "0x00",
          "bit3Set": false,
          "bit3Branch": "fall through to 0x006D5D",
          "cpu": {
            "pc": "0x006D4F",
            "currentBlockPc": "0x006D4F",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0E42",
            "bc": "0x002001",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000240",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D57E"
            }
          }
        },
        {
          "block": "0x006D4F",
          "instructionPc": "0x006D57",
          "port": "0x2001",
          "value": "0x00",
          "bit3Set": false,
          "bit3Branch": "fall through to 0x006D5D",
          "cpu": {
            "pc": "0x006D4F",
            "currentBlockPc": "0x006D4F",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0E42",
            "bc": "0x002001",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000280",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D53E"
            }
          }
        },
        {
          "block": "0x006D4F",
          "instructionPc": "0x006D57",
          "port": "0x2001",
          "value": "0x00",
          "bit3Set": false,
          "bit3Branch": "fall through to 0x006D5D",
          "cpu": {
            "pc": "0x006D4F",
            "currentBlockPc": "0x006D4F",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0E42",
            "bc": "0x002001",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x0002C0",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D4FE"
            }
          }
        },
        {
          "block": "0x006D4F",
          "instructionPc": "0x006D57",
          "port": "0x2001",
          "value": "0x00",
          "bit3Set": false,
          "bit3Branch": "fall through to 0x006D5D",
          "cpu": {
            "pc": "0x006D4F",
            "currentBlockPc": "0x006D4F",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0E42",
            "bc": "0x002001",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000300",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D4BE"
            }
          }
        },
        {
          "block": "0x006D4F",
          "instructionPc": "0x006D57",
          "port": "0x2001",
          "value": "0x00",
          "bit3Set": false,
          "bit3Branch": "fall through to 0x006D5D",
          "cpu": {
            "pc": "0x006D4F",
            "currentBlockPc": "0x006D4F",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0E42",
            "bc": "0x002001",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000340",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D47E"
            }
          }
        },
        {
          "block": "0x006D4F",
          "instructionPc": "0x006D57",
          "port": "0x2001",
          "value": "0x00",
          "bit3Set": false,
          "bit3Branch": "fall through to 0x006D5D",
          "cpu": {
            "pc": "0x006D4F",
            "currentBlockPc": "0x006D4F",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0E42",
            "bc": "0x002001",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000380",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D43E"
            }
          }
        },
        {
          "block": "0x006D4F",
          "instructionPc": "0x006D57",
          "port": "0x2001",
          "value": "0x00",
          "bit3Set": false,
          "bit3Branch": "fall through to 0x006D5D",
          "cpu": {
            "pc": "0x006D4F",
            "currentBlockPc": "0x006D4F",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0E42",
            "bc": "0x002001",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x0003C0",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D3FE"
            }
          }
        },
        {
          "block": "0x006D4F",
          "instructionPc": "0x006D57",
          "port": "0x2001",
          "value": "0x00",
          "bit3Set": false,
          "bit3Branch": "fall through to 0x006D5D",
          "cpu": {
            "pc": "0x006D4F",
            "currentBlockPc": "0x006D4F",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0E42",
            "bc": "0x002001",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000400",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D3BE"
            }
          }
        },
        {
          "block": "0x006D4F",
          "instructionPc": "0x006D57",
          "port": "0x2001",
          "value": "0x00",
          "bit3Set": false,
          "bit3Branch": "fall through to 0x006D5D",
          "cpu": {
            "pc": "0x006D4F",
            "currentBlockPc": "0x006D4F",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0E42",
            "bc": "0x002001",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000440",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D37E"
            }
          }
        },
        {
          "block": "0x006D4F",
          "instructionPc": "0x006D57",
          "port": "0x2001",
          "value": "0x00",
          "bit3Set": false,
          "bit3Branch": "fall through to 0x006D5D",
          "cpu": {
            "pc": "0x006D4F",
            "currentBlockPc": "0x006D4F",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0E42",
            "bc": "0x002001",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000480",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D33E"
            }
          }
        },
        {
          "block": "0x006D4F",
          "instructionPc": "0x006D57",
          "port": "0x2001",
          "value": "0x00",
          "bit3Set": false,
          "bit3Branch": "fall through to 0x006D5D",
          "cpu": {
            "pc": "0x006D4F",
            "currentBlockPc": "0x006D4F",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0E42",
            "bc": "0x002001",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x0004C0",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D2FE"
            }
          }
        },
        {
          "block": "0x006D4F",
          "instructionPc": "0x006D57",
          "port": "0x2001",
          "value": "0x00",
          "bit3Set": false,
          "bit3Branch": "fall through to 0x006D5D",
          "cpu": {
            "pc": "0x006D4F",
            "currentBlockPc": "0x006D4F",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0E42",
            "bc": "0x002001",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000500",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D2BE"
            }
          }
        },
        {
          "block": "0x006D4F",
          "instructionPc": "0x006D57",
          "port": "0x2001",
          "value": "0x00",
          "bit3Set": false,
          "bit3Branch": "fall through to 0x006D5D",
          "cpu": {
            "pc": "0x006D4F",
            "currentBlockPc": "0x006D4F",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0E42",
            "bc": "0x002001",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000540",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D27E"
            }
          }
        },
        {
          "block": "0x006D4F",
          "instructionPc": "0x006D57",
          "port": "0x2001",
          "value": "0x00",
          "bit3Set": false,
          "bit3Branch": "fall through to 0x006D5D",
          "cpu": {
            "pc": "0x006D4F",
            "currentBlockPc": "0x006D4F",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0E42",
            "bc": "0x002001",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000580",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D23E"
            }
          }
        },
        {
          "block": "0x006D4F",
          "instructionPc": "0x006D57",
          "port": "0x2001",
          "value": "0x00",
          "bit3Set": false,
          "bit3Branch": "fall through to 0x006D5D",
          "cpu": {
            "pc": "0x006D4F",
            "currentBlockPc": "0x006D4F",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0E42",
            "bc": "0x002001",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x0005C0",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D1FE"
            }
          }
        },
        {
          "block": "0x006D4F",
          "instructionPc": "0x006D57",
          "port": "0x2001",
          "value": "0x00",
          "bit3Set": false,
          "bit3Branch": "fall through to 0x006D5D",
          "cpu": {
            "pc": "0x006D4F",
            "currentBlockPc": "0x006D4F",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0E42",
            "bc": "0x002001",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000600",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D1BE"
            }
          }
        },
        {
          "block": "0x006D4F",
          "instructionPc": "0x006D57",
          "port": "0x2001",
          "value": "0x00",
          "bit3Set": false,
          "bit3Branch": "fall through to 0x006D5D",
          "cpu": {
            "pc": "0x006D4F",
            "currentBlockPc": "0x006D4F",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0E42",
            "bc": "0x002001",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000640",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D17E"
            }
          }
        },
        {
          "block": "0x006D4F",
          "instructionPc": "0x006D57",
          "port": "0x2001",
          "value": "0x00",
          "bit3Set": false,
          "bit3Branch": "fall through to 0x006D5D",
          "cpu": {
            "pc": "0x006D4F",
            "currentBlockPc": "0x006D4F",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0E42",
            "bc": "0x002001",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000680",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D13E"
            }
          }
        },
        {
          "block": "0x006D4F",
          "instructionPc": "0x006D57",
          "port": "0x2001",
          "value": "0x00",
          "bit3Set": false,
          "bit3Branch": "fall through to 0x006D5D",
          "cpu": {
            "pc": "0x006D4F",
            "currentBlockPc": "0x006D4F",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0E42",
            "bc": "0x002001",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x0006C0",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D0FE"
            }
          }
        },
        {
          "block": "0x006D4F",
          "instructionPc": "0x006D57",
          "port": "0x2001",
          "value": "0x00",
          "bit3Set": false,
          "bit3Branch": "fall through to 0x006D5D",
          "cpu": {
            "pc": "0x006D4F",
            "currentBlockPc": "0x006D4F",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0E42",
            "bc": "0x002001",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000700",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D0BE"
            }
          }
        },
        {
          "block": "0x006D4F",
          "instructionPc": "0x006D57",
          "port": "0x2001",
          "value": "0x00",
          "bit3Set": false,
          "bit3Branch": "fall through to 0x006D5D",
          "cpu": {
            "pc": "0x006D4F",
            "currentBlockPc": "0x006D4F",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0E42",
            "bc": "0x002001",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000740",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D07E"
            }
          }
        },
        {
          "block": "0x006D4F",
          "instructionPc": "0x006D57",
          "port": "0x2001",
          "value": "0x00",
          "bit3Set": false,
          "bit3Branch": "fall through to 0x006D5D",
          "cpu": {
            "pc": "0x006D4F",
            "currentBlockPc": "0x006D4F",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0E42",
            "bc": "0x002001",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000780",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D03E"
            }
          }
        },
        {
          "block": "0x006D4F",
          "instructionPc": "0x006D57",
          "port": "0x2001",
          "value": "0x00",
          "bit3Set": false,
          "bit3Branch": "fall through to 0x006D5D",
          "cpu": {
            "pc": "0x006D4F",
            "currentBlockPc": "0x006D4F",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0E42",
            "bc": "0x002001",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x0007C0",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09CFFE"
            }
          }
        },
        {
          "block": "0x006D4F",
          "instructionPc": "0x006D57",
          "port": "0x2001",
          "value": "0x00",
          "bit3Set": false,
          "bit3Branch": "fall through to 0x006D5D",
          "cpu": {
            "pc": "0x006D4F",
            "currentBlockPc": "0x006D4F",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0E42",
            "bc": "0x002001",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000800",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09CFBE"
            }
          }
        },
        {
          "block": "0x006D4F",
          "instructionPc": "0x006D57",
          "port": "0x2001",
          "value": "0x00",
          "bit3Set": false,
          "bit3Branch": "fall through to 0x006D5D",
          "cpu": {
            "pc": "0x006D4F",
            "currentBlockPc": "0x006D4F",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0E42",
            "bc": "0x002001",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000840",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09CF7E"
            }
          }
        },
        {
          "block": "0x006D4F",
          "instructionPc": "0x006D57",
          "port": "0x2001",
          "value": "0x00",
          "bit3Set": false,
          "bit3Branch": "fall through to 0x006D5D",
          "cpu": {
            "pc": "0x006D4F",
            "currentBlockPc": "0x006D4F",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0E42",
            "bc": "0x002001",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000880",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09CF3E"
            }
          }
        },
        {
          "block": "0x006D4F",
          "instructionPc": "0x006D57",
          "port": "0x2001",
          "value": "0x00",
          "bit3Set": false,
          "bit3Branch": "fall through to 0x006D5D",
          "cpu": {
            "pc": "0x006D4F",
            "currentBlockPc": "0x006D4F",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0E42",
            "bc": "0x002001",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x0008C0",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09CEFE"
            }
          }
        },
        {
          "block": "0x006D4F",
          "instructionPc": "0x006D57",
          "port": "0x2001",
          "value": "0x00",
          "bit3Set": false,
          "bit3Branch": "fall through to 0x006D5D",
          "cpu": {
            "pc": "0x006D4F",
            "currentBlockPc": "0x006D4F",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0E42",
            "bc": "0x002001",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000900",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09CEBE"
            }
          }
        },
        {
          "block": "0x006D4F",
          "instructionPc": "0x006D57",
          "port": "0x2001",
          "value": "0x00",
          "bit3Set": false,
          "bit3Branch": "fall through to 0x006D5D",
          "cpu": {
            "pc": "0x006D4F",
            "currentBlockPc": "0x006D4F",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0E42",
            "bc": "0x002001",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000940",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09CE7E"
            }
          }
        },
        {
          "block": "0x006D4F",
          "instructionPc": "0x006D57",
          "port": "0x2001",
          "value": "0x00",
          "bit3Set": false,
          "bit3Branch": "fall through to 0x006D5D",
          "cpu": {
            "pc": "0x006D4F",
            "currentBlockPc": "0x006D4F",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0E42",
            "bc": "0x002001",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000980",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09CE3E"
            }
          }
        },
        {
          "block": "0x006D4F",
          "instructionPc": "0x006D57",
          "port": "0x2001",
          "value": "0x00",
          "bit3Set": false,
          "bit3Branch": "fall through to 0x006D5D",
          "cpu": {
            "pc": "0x006D4F",
            "currentBlockPc": "0x006D4F",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0E42",
            "bc": "0x002001",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x0009C0",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09CDFE"
            }
          }
        },
        {
          "block": "0x006D4F",
          "instructionPc": "0x006D57",
          "port": "0x2001",
          "value": "0x00",
          "bit3Set": false,
          "bit3Branch": "fall through to 0x006D5D",
          "cpu": {
            "pc": "0x006D4F",
            "currentBlockPc": "0x006D4F",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0E42",
            "bc": "0x002001",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000A00",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09CDBE"
            }
          }
        },
        {
          "block": "0x006D4F",
          "instructionPc": "0x006D57",
          "port": "0x2001",
          "value": "0x00",
          "bit3Set": false,
          "bit3Branch": "fall through to 0x006D5D",
          "cpu": {
            "pc": "0x006D4F",
            "currentBlockPc": "0x006D4F",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0E42",
            "bc": "0x002001",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000A40",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09CD7E"
            }
          }
        },
        {
          "block": "0x006D4F",
          "instructionPc": "0x006D57",
          "port": "0x2001",
          "value": "0x00",
          "bit3Set": false,
          "bit3Branch": "fall through to 0x006D5D",
          "cpu": {
            "pc": "0x006D4F",
            "currentBlockPc": "0x006D4F",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0E42",
            "bc": "0x002001",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000A80",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09CD3E"
            }
          }
        },
        {
          "block": "0x006D4F",
          "instructionPc": "0x006D57",
          "port": "0x2001",
          "value": "0x00",
          "bit3Set": false,
          "bit3Branch": "fall through to 0x006D5D",
          "cpu": {
            "pc": "0x006D4F",
            "currentBlockPc": "0x006D4F",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0E42",
            "bc": "0x002001",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000AC0",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09CCFE"
            }
          }
        },
        {
          "block": "0x006D4F",
          "instructionPc": "0x006D57",
          "port": "0x2001",
          "value": "0x00",
          "bit3Set": false,
          "bit3Branch": "fall through to 0x006D5D",
          "cpu": {
            "pc": "0x006D4F",
            "currentBlockPc": "0x006D4F",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0E42",
            "bc": "0x002001",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000B00",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09CCBE"
            }
          }
        },
        {
          "block": "0x006D4F",
          "instructionPc": "0x006D57",
          "port": "0x2001",
          "value": "0x00",
          "bit3Set": false,
          "bit3Branch": "fall through to 0x006D5D",
          "cpu": {
            "pc": "0x006D4F",
            "currentBlockPc": "0x006D4F",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0E42",
            "bc": "0x002001",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000B40",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09CC7E"
            }
          }
        },
        {
          "block": "0x006D4F",
          "instructionPc": "0x006D57",
          "port": "0x2001",
          "value": "0x00",
          "bit3Set": false,
          "bit3Branch": "fall through to 0x006D5D",
          "cpu": {
            "pc": "0x006D4F",
            "currentBlockPc": "0x006D4F",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0E42",
            "bc": "0x002001",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000B80",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09CC3E"
            }
          }
        },
        {
          "block": "0x006D4F",
          "instructionPc": "0x006D57",
          "port": "0x2001",
          "value": "0x00",
          "bit3Set": false,
          "bit3Branch": "fall through to 0x006D5D",
          "cpu": {
            "pc": "0x006D4F",
            "currentBlockPc": "0x006D4F",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0E42",
            "bc": "0x002001",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000BC0",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09CBFE"
            }
          }
        },
        {
          "block": "0x006D4F",
          "instructionPc": "0x006D57",
          "port": "0x2001",
          "value": "0x00",
          "bit3Set": false,
          "bit3Branch": "fall through to 0x006D5D",
          "cpu": {
            "pc": "0x006D4F",
            "currentBlockPc": "0x006D4F",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0E42",
            "bc": "0x002001",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000C00",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09CBBE"
            }
          }
        },
        {
          "block": "0x006D4F",
          "instructionPc": "0x006D57",
          "port": "0x2001",
          "value": "0x00",
          "bit3Set": false,
          "bit3Branch": "fall through to 0x006D5D",
          "cpu": {
            "pc": "0x006D4F",
            "currentBlockPc": "0x006D4F",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0E42",
            "bc": "0x002001",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000C40",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09CB7E"
            }
          }
        },
        {
          "block": "0x006D4F",
          "instructionPc": "0x006D57",
          "port": "0x2001",
          "value": "0x00",
          "bit3Set": false,
          "bit3Branch": "fall through to 0x006D5D",
          "cpu": {
            "pc": "0x006D4F",
            "currentBlockPc": "0x006D4F",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0E42",
            "bc": "0x002001",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000C80",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09CB3E"
            }
          }
        },
        {
          "block": "0x006D4F",
          "instructionPc": "0x006D57",
          "port": "0x2001",
          "value": "0x00",
          "bit3Set": false,
          "bit3Branch": "fall through to 0x006D5D",
          "cpu": {
            "pc": "0x006D4F",
            "currentBlockPc": "0x006D4F",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0E42",
            "bc": "0x002001",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000CC0",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09CAFE"
            }
          }
        },
        {
          "block": "0x006D4F",
          "instructionPc": "0x006D57",
          "port": "0x2001",
          "value": "0x00",
          "bit3Set": false,
          "bit3Branch": "fall through to 0x006D5D",
          "cpu": {
            "pc": "0x006D4F",
            "currentBlockPc": "0x006D4F",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0E42",
            "bc": "0x002001",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000D00",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09CABE"
            }
          }
        },
        {
          "block": "0x006D4F",
          "instructionPc": "0x006D57",
          "port": "0x2001",
          "value": "0x00",
          "bit3Set": false,
          "bit3Branch": "fall through to 0x006D5D",
          "cpu": {
            "pc": "0x006D4F",
            "currentBlockPc": "0x006D4F",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0E42",
            "bc": "0x002001",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000D40",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09CA7E"
            }
          }
        },
        {
          "block": "0x006D4F",
          "instructionPc": "0x006D57",
          "port": "0x2001",
          "value": "0x00",
          "bit3Set": false,
          "bit3Branch": "fall through to 0x006D5D",
          "cpu": {
            "pc": "0x006D4F",
            "currentBlockPc": "0x006D4F",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0E42",
            "bc": "0x002001",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000D80",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09CA3E"
            }
          }
        },
        {
          "block": "0x006D4F",
          "instructionPc": "0x006D57",
          "port": "0x2001",
          "value": "0x00",
          "bit3Set": false,
          "bit3Branch": "fall through to 0x006D5D",
          "cpu": {
            "pc": "0x006D4F",
            "currentBlockPc": "0x006D4F",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0E42",
            "bc": "0x002001",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000DC0",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09C9FE"
            }
          }
        },
        {
          "block": "0x006D4F",
          "instructionPc": "0x006D57",
          "port": "0x2001",
          "value": "0x00",
          "bit3Set": false,
          "bit3Branch": "fall through to 0x006D5D",
          "cpu": {
            "pc": "0x006D4F",
            "currentBlockPc": "0x006D4F",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0E42",
            "bc": "0x002001",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000E00",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09C9BE"
            }
          }
        },
        {
          "block": "0x006D4F",
          "instructionPc": "0x006D57",
          "port": "0x2001",
          "value": "0x00",
          "bit3Set": false,
          "bit3Branch": "fall through to 0x006D5D",
          "cpu": {
            "pc": "0x006D4F",
            "currentBlockPc": "0x006D4F",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0E42",
            "bc": "0x002001",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000E40",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09C97E"
            }
          }
        },
        {
          "block": "0x006D4F",
          "instructionPc": "0x006D57",
          "port": "0x2001",
          "value": "0x00",
          "bit3Set": false,
          "bit3Branch": "fall through to 0x006D5D",
          "cpu": {
            "pc": "0x006D4F",
            "currentBlockPc": "0x006D4F",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0E42",
            "bc": "0x002001",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000E80",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09C93E"
            }
          }
        },
        {
          "block": "0x006D4F",
          "instructionPc": "0x006D57",
          "port": "0x2001",
          "value": "0x00",
          "bit3Set": false,
          "bit3Branch": "fall through to 0x006D5D",
          "cpu": {
            "pc": "0x006D4F",
            "currentBlockPc": "0x006D4F",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0E42",
            "bc": "0x002001",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000EC0",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09C8FE"
            }
          }
        },
        {
          "block": "0x006D4F",
          "instructionPc": "0x006D57",
          "port": "0x2001",
          "value": "0x00",
          "bit3Set": false,
          "bit3Branch": "fall through to 0x006D5D",
          "cpu": {
            "pc": "0x006D4F",
            "currentBlockPc": "0x006D4F",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0E42",
            "bc": "0x002001",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000F00",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09C8BE"
            }
          }
        },
        {
          "block": "0x006D4F",
          "instructionPc": "0x006D57",
          "port": "0x2001",
          "value": "0x00",
          "bit3Set": false,
          "bit3Branch": "fall through to 0x006D5D",
          "cpu": {
            "pc": "0x006D4F",
            "currentBlockPc": "0x006D4F",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0E42",
            "bc": "0x002001",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000F40",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09C87E"
            }
          }
        },
        {
          "block": "0x006D4F",
          "instructionPc": "0x006D57",
          "port": "0x2001",
          "value": "0x00",
          "bit3Set": false,
          "bit3Branch": "fall through to 0x006D5D",
          "cpu": {
            "pc": "0x006D4F",
            "currentBlockPc": "0x006D4F",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0E42",
            "bc": "0x002001",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000F80",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09C83E"
            }
          }
        },
        {
          "block": "0x006D4F",
          "instructionPc": "0x006D57",
          "port": "0x2001",
          "value": "0x00",
          "bit3Set": false,
          "bit3Branch": "fall through to 0x006D5D",
          "cpu": {
            "pc": "0x006D4F",
            "currentBlockPc": "0x006D4F",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0E42",
            "bc": "0x002001",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000FC0",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09C7FE"
            }
          }
        },
        {
          "block": "0x006D4F",
          "instructionPc": "0x006D57",
          "port": "0x2001",
          "value": "0x00",
          "bit3Set": false,
          "bit3Branch": "fall through to 0x006D5D",
          "cpu": {
            "pc": "0x006D4F",
            "currentBlockPc": "0x006D4F",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0E42",
            "bc": "0x002001",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x001000",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09C7BE"
            }
          }
        }
      ],
      "ioWrites": [
        {
          "block": "0x006D38",
          "instructionPc": "0x006D46",
          "port": "0x2000",
          "value": "0x0A",
          "cpu": {
            "pc": "0x006D38",
            "currentBlockPc": "0x006D38",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0A42",
            "bc": "0x002000",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000040",
              "D00124": "0x0A"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x0064DE",
              "IX+6": "0x020000",
              "IX+9": "0x0000C0"
            }
          }
        },
        {
          "block": "0x006D38",
          "instructionPc": "0x006D46",
          "port": "0x2000",
          "value": "0x0E",
          "cpu": {
            "pc": "0x006D38",
            "currentBlockPc": "0x006D38",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0E42",
            "bc": "0x002000",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000080",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x0064DE",
              "IX+6": "0x020000",
              "IX+9": "0x000080"
            }
          }
        },
        {
          "block": "0x006D38",
          "instructionPc": "0x006D46",
          "port": "0x2000",
          "value": "0x0E",
          "cpu": {
            "pc": "0x006D38",
            "currentBlockPc": "0x006D38",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0E42",
            "bc": "0x002000",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x0000C0",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x0064DE",
              "IX+6": "0x020000",
              "IX+9": "0x000040"
            }
          }
        },
        {
          "block": "0x006D38",
          "instructionPc": "0x006D46",
          "port": "0x2000",
          "value": "0x0E",
          "cpu": {
            "pc": "0x006D38",
            "currentBlockPc": "0x006D38",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0E42",
            "bc": "0x002000",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000100",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x0064DE",
              "IX+6": "0x020000",
              "IX+9": "0x000000"
            }
          }
        },
        {
          "block": "0x006D38",
          "instructionPc": "0x006D46",
          "port": "0x2000",
          "value": "0x0E",
          "cpu": {
            "pc": "0x006D38",
            "currentBlockPc": "0x006D38",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0E42",
            "bc": "0x002000",
            "de": "0x002014",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000140",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x00003C",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D67E"
            }
          }
        },
        {
          "block": "0x006D38",
          "instructionPc": "0x006D46",
          "port": "0x2000",
          "value": "0x0E",
          "cpu": {
            "pc": "0x006D38",
            "currentBlockPc": "0x006D38",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0E42",
            "bc": "0x002000",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000180",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D63E"
            }
          }
        },
        {
          "block": "0x006D38",
          "instructionPc": "0x006D46",
          "port": "0x2000",
          "value": "0x0E",
          "cpu": {
            "pc": "0x006D38",
            "currentBlockPc": "0x006D38",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0E42",
            "bc": "0x002000",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x0001C0",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D5FE"
            }
          }
        },
        {
          "block": "0x006D38",
          "instructionPc": "0x006D46",
          "port": "0x2000",
          "value": "0x0E",
          "cpu": {
            "pc": "0x006D38",
            "currentBlockPc": "0x006D38",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0E42",
            "bc": "0x002000",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000200",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D5BE"
            }
          }
        },
        {
          "block": "0x006D38",
          "instructionPc": "0x006D46",
          "port": "0x2000",
          "value": "0x0E",
          "cpu": {
            "pc": "0x006D38",
            "currentBlockPc": "0x006D38",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0E42",
            "bc": "0x002000",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000240",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D57E"
            }
          }
        },
        {
          "block": "0x006D38",
          "instructionPc": "0x006D46",
          "port": "0x2000",
          "value": "0x0E",
          "cpu": {
            "pc": "0x006D38",
            "currentBlockPc": "0x006D38",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0E42",
            "bc": "0x002000",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000280",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D53E"
            }
          }
        },
        {
          "block": "0x006D38",
          "instructionPc": "0x006D46",
          "port": "0x2000",
          "value": "0x0E",
          "cpu": {
            "pc": "0x006D38",
            "currentBlockPc": "0x006D38",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0E42",
            "bc": "0x002000",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x0002C0",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D4FE"
            }
          }
        },
        {
          "block": "0x006D38",
          "instructionPc": "0x006D46",
          "port": "0x2000",
          "value": "0x0E",
          "cpu": {
            "pc": "0x006D38",
            "currentBlockPc": "0x006D38",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0E42",
            "bc": "0x002000",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000300",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D4BE"
            }
          }
        },
        {
          "block": "0x006D38",
          "instructionPc": "0x006D46",
          "port": "0x2000",
          "value": "0x0E",
          "cpu": {
            "pc": "0x006D38",
            "currentBlockPc": "0x006D38",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0E42",
            "bc": "0x002000",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000340",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D47E"
            }
          }
        },
        {
          "block": "0x006D38",
          "instructionPc": "0x006D46",
          "port": "0x2000",
          "value": "0x0E",
          "cpu": {
            "pc": "0x006D38",
            "currentBlockPc": "0x006D38",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0E42",
            "bc": "0x002000",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000380",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D43E"
            }
          }
        },
        {
          "block": "0x006D38",
          "instructionPc": "0x006D46",
          "port": "0x2000",
          "value": "0x0E",
          "cpu": {
            "pc": "0x006D38",
            "currentBlockPc": "0x006D38",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0E42",
            "bc": "0x002000",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x0003C0",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D3FE"
            }
          }
        },
        {
          "block": "0x006D38",
          "instructionPc": "0x006D46",
          "port": "0x2000",
          "value": "0x0E",
          "cpu": {
            "pc": "0x006D38",
            "currentBlockPc": "0x006D38",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0E42",
            "bc": "0x002000",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000400",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D3BE"
            }
          }
        },
        {
          "block": "0x006D38",
          "instructionPc": "0x006D46",
          "port": "0x2000",
          "value": "0x0E",
          "cpu": {
            "pc": "0x006D38",
            "currentBlockPc": "0x006D38",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0E42",
            "bc": "0x002000",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000440",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D37E"
            }
          }
        },
        {
          "block": "0x006D38",
          "instructionPc": "0x006D46",
          "port": "0x2000",
          "value": "0x0E",
          "cpu": {
            "pc": "0x006D38",
            "currentBlockPc": "0x006D38",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0E42",
            "bc": "0x002000",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000480",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D33E"
            }
          }
        },
        {
          "block": "0x006D38",
          "instructionPc": "0x006D46",
          "port": "0x2000",
          "value": "0x0E",
          "cpu": {
            "pc": "0x006D38",
            "currentBlockPc": "0x006D38",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0E42",
            "bc": "0x002000",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x0004C0",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D2FE"
            }
          }
        },
        {
          "block": "0x006D38",
          "instructionPc": "0x006D46",
          "port": "0x2000",
          "value": "0x0E",
          "cpu": {
            "pc": "0x006D38",
            "currentBlockPc": "0x006D38",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0E42",
            "bc": "0x002000",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000500",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D2BE"
            }
          }
        },
        {
          "block": "0x006D38",
          "instructionPc": "0x006D46",
          "port": "0x2000",
          "value": "0x0E",
          "cpu": {
            "pc": "0x006D38",
            "currentBlockPc": "0x006D38",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0E42",
            "bc": "0x002000",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000540",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D27E"
            }
          }
        },
        {
          "block": "0x006D38",
          "instructionPc": "0x006D46",
          "port": "0x2000",
          "value": "0x0E",
          "cpu": {
            "pc": "0x006D38",
            "currentBlockPc": "0x006D38",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0E42",
            "bc": "0x002000",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000580",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D23E"
            }
          }
        },
        {
          "block": "0x006D38",
          "instructionPc": "0x006D46",
          "port": "0x2000",
          "value": "0x0E",
          "cpu": {
            "pc": "0x006D38",
            "currentBlockPc": "0x006D38",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0E42",
            "bc": "0x002000",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x0005C0",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D1FE"
            }
          }
        },
        {
          "block": "0x006D38",
          "instructionPc": "0x006D46",
          "port": "0x2000",
          "value": "0x0E",
          "cpu": {
            "pc": "0x006D38",
            "currentBlockPc": "0x006D38",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0E42",
            "bc": "0x002000",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000600",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D1BE"
            }
          }
        },
        {
          "block": "0x006D38",
          "instructionPc": "0x006D46",
          "port": "0x2000",
          "value": "0x0E",
          "cpu": {
            "pc": "0x006D38",
            "currentBlockPc": "0x006D38",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0E42",
            "bc": "0x002000",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000640",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D17E"
            }
          }
        },
        {
          "block": "0x006D38",
          "instructionPc": "0x006D46",
          "port": "0x2000",
          "value": "0x0E",
          "cpu": {
            "pc": "0x006D38",
            "currentBlockPc": "0x006D38",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0E42",
            "bc": "0x002000",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000680",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D13E"
            }
          }
        },
        {
          "block": "0x006D38",
          "instructionPc": "0x006D46",
          "port": "0x2000",
          "value": "0x0E",
          "cpu": {
            "pc": "0x006D38",
            "currentBlockPc": "0x006D38",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0E42",
            "bc": "0x002000",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x0006C0",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D0FE"
            }
          }
        },
        {
          "block": "0x006D38",
          "instructionPc": "0x006D46",
          "port": "0x2000",
          "value": "0x0E",
          "cpu": {
            "pc": "0x006D38",
            "currentBlockPc": "0x006D38",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0E42",
            "bc": "0x002000",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000700",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D0BE"
            }
          }
        },
        {
          "block": "0x006D38",
          "instructionPc": "0x006D46",
          "port": "0x2000",
          "value": "0x0E",
          "cpu": {
            "pc": "0x006D38",
            "currentBlockPc": "0x006D38",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0E42",
            "bc": "0x002000",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000740",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D07E"
            }
          }
        },
        {
          "block": "0x006D38",
          "instructionPc": "0x006D46",
          "port": "0x2000",
          "value": "0x0E",
          "cpu": {
            "pc": "0x006D38",
            "currentBlockPc": "0x006D38",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0E42",
            "bc": "0x002000",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000780",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D03E"
            }
          }
        },
        {
          "block": "0x006D38",
          "instructionPc": "0x006D46",
          "port": "0x2000",
          "value": "0x0E",
          "cpu": {
            "pc": "0x006D38",
            "currentBlockPc": "0x006D38",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0E42",
            "bc": "0x002000",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x0007C0",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09CFFE"
            }
          }
        },
        {
          "block": "0x006D38",
          "instructionPc": "0x006D46",
          "port": "0x2000",
          "value": "0x0E",
          "cpu": {
            "pc": "0x006D38",
            "currentBlockPc": "0x006D38",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0E42",
            "bc": "0x002000",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000800",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09CFBE"
            }
          }
        },
        {
          "block": "0x006D38",
          "instructionPc": "0x006D46",
          "port": "0x2000",
          "value": "0x0E",
          "cpu": {
            "pc": "0x006D38",
            "currentBlockPc": "0x006D38",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0E42",
            "bc": "0x002000",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000840",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09CF7E"
            }
          }
        },
        {
          "block": "0x006D38",
          "instructionPc": "0x006D46",
          "port": "0x2000",
          "value": "0x0E",
          "cpu": {
            "pc": "0x006D38",
            "currentBlockPc": "0x006D38",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0E42",
            "bc": "0x002000",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000880",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09CF3E"
            }
          }
        },
        {
          "block": "0x006D38",
          "instructionPc": "0x006D46",
          "port": "0x2000",
          "value": "0x0E",
          "cpu": {
            "pc": "0x006D38",
            "currentBlockPc": "0x006D38",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0E42",
            "bc": "0x002000",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x0008C0",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09CEFE"
            }
          }
        },
        {
          "block": "0x006D38",
          "instructionPc": "0x006D46",
          "port": "0x2000",
          "value": "0x0E",
          "cpu": {
            "pc": "0x006D38",
            "currentBlockPc": "0x006D38",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0E42",
            "bc": "0x002000",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000900",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09CEBE"
            }
          }
        },
        {
          "block": "0x006D38",
          "instructionPc": "0x006D46",
          "port": "0x2000",
          "value": "0x0E",
          "cpu": {
            "pc": "0x006D38",
            "currentBlockPc": "0x006D38",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0E42",
            "bc": "0x002000",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000940",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09CE7E"
            }
          }
        },
        {
          "block": "0x006D38",
          "instructionPc": "0x006D46",
          "port": "0x2000",
          "value": "0x0E",
          "cpu": {
            "pc": "0x006D38",
            "currentBlockPc": "0x006D38",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0E42",
            "bc": "0x002000",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000980",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09CE3E"
            }
          }
        },
        {
          "block": "0x006D38",
          "instructionPc": "0x006D46",
          "port": "0x2000",
          "value": "0x0E",
          "cpu": {
            "pc": "0x006D38",
            "currentBlockPc": "0x006D38",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0E42",
            "bc": "0x002000",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x0009C0",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09CDFE"
            }
          }
        },
        {
          "block": "0x006D38",
          "instructionPc": "0x006D46",
          "port": "0x2000",
          "value": "0x0E",
          "cpu": {
            "pc": "0x006D38",
            "currentBlockPc": "0x006D38",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0E42",
            "bc": "0x002000",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000A00",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09CDBE"
            }
          }
        },
        {
          "block": "0x006D38",
          "instructionPc": "0x006D46",
          "port": "0x2000",
          "value": "0x0E",
          "cpu": {
            "pc": "0x006D38",
            "currentBlockPc": "0x006D38",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0E42",
            "bc": "0x002000",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000A40",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09CD7E"
            }
          }
        },
        {
          "block": "0x006D38",
          "instructionPc": "0x006D46",
          "port": "0x2000",
          "value": "0x0E",
          "cpu": {
            "pc": "0x006D38",
            "currentBlockPc": "0x006D38",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0E42",
            "bc": "0x002000",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000A80",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09CD3E"
            }
          }
        },
        {
          "block": "0x006D38",
          "instructionPc": "0x006D46",
          "port": "0x2000",
          "value": "0x0E",
          "cpu": {
            "pc": "0x006D38",
            "currentBlockPc": "0x006D38",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0E42",
            "bc": "0x002000",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000AC0",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09CCFE"
            }
          }
        },
        {
          "block": "0x006D38",
          "instructionPc": "0x006D46",
          "port": "0x2000",
          "value": "0x0E",
          "cpu": {
            "pc": "0x006D38",
            "currentBlockPc": "0x006D38",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0E42",
            "bc": "0x002000",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000B00",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09CCBE"
            }
          }
        },
        {
          "block": "0x006D38",
          "instructionPc": "0x006D46",
          "port": "0x2000",
          "value": "0x0E",
          "cpu": {
            "pc": "0x006D38",
            "currentBlockPc": "0x006D38",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0E42",
            "bc": "0x002000",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000B40",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09CC7E"
            }
          }
        },
        {
          "block": "0x006D38",
          "instructionPc": "0x006D46",
          "port": "0x2000",
          "value": "0x0E",
          "cpu": {
            "pc": "0x006D38",
            "currentBlockPc": "0x006D38",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0E42",
            "bc": "0x002000",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000B80",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09CC3E"
            }
          }
        },
        {
          "block": "0x006D38",
          "instructionPc": "0x006D46",
          "port": "0x2000",
          "value": "0x0E",
          "cpu": {
            "pc": "0x006D38",
            "currentBlockPc": "0x006D38",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0E42",
            "bc": "0x002000",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000BC0",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09CBFE"
            }
          }
        },
        {
          "block": "0x006D38",
          "instructionPc": "0x006D46",
          "port": "0x2000",
          "value": "0x0E",
          "cpu": {
            "pc": "0x006D38",
            "currentBlockPc": "0x006D38",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0E42",
            "bc": "0x002000",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000C00",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09CBBE"
            }
          }
        },
        {
          "block": "0x006D38",
          "instructionPc": "0x006D46",
          "port": "0x2000",
          "value": "0x0E",
          "cpu": {
            "pc": "0x006D38",
            "currentBlockPc": "0x006D38",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0E42",
            "bc": "0x002000",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000C40",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09CB7E"
            }
          }
        },
        {
          "block": "0x006D38",
          "instructionPc": "0x006D46",
          "port": "0x2000",
          "value": "0x0E",
          "cpu": {
            "pc": "0x006D38",
            "currentBlockPc": "0x006D38",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0E42",
            "bc": "0x002000",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000C80",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09CB3E"
            }
          }
        },
        {
          "block": "0x006D38",
          "instructionPc": "0x006D46",
          "port": "0x2000",
          "value": "0x0E",
          "cpu": {
            "pc": "0x006D38",
            "currentBlockPc": "0x006D38",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0E42",
            "bc": "0x002000",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000CC0",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09CAFE"
            }
          }
        },
        {
          "block": "0x006D38",
          "instructionPc": "0x006D46",
          "port": "0x2000",
          "value": "0x0E",
          "cpu": {
            "pc": "0x006D38",
            "currentBlockPc": "0x006D38",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0E42",
            "bc": "0x002000",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000D00",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09CABE"
            }
          }
        },
        {
          "block": "0x006D38",
          "instructionPc": "0x006D46",
          "port": "0x2000",
          "value": "0x0E",
          "cpu": {
            "pc": "0x006D38",
            "currentBlockPc": "0x006D38",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0E42",
            "bc": "0x002000",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000D40",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09CA7E"
            }
          }
        },
        {
          "block": "0x006D38",
          "instructionPc": "0x006D46",
          "port": "0x2000",
          "value": "0x0E",
          "cpu": {
            "pc": "0x006D38",
            "currentBlockPc": "0x006D38",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0E42",
            "bc": "0x002000",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000D80",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09CA3E"
            }
          }
        },
        {
          "block": "0x006D38",
          "instructionPc": "0x006D46",
          "port": "0x2000",
          "value": "0x0E",
          "cpu": {
            "pc": "0x006D38",
            "currentBlockPc": "0x006D38",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0E42",
            "bc": "0x002000",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000DC0",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09C9FE"
            }
          }
        },
        {
          "block": "0x006D38",
          "instructionPc": "0x006D46",
          "port": "0x2000",
          "value": "0x0E",
          "cpu": {
            "pc": "0x006D38",
            "currentBlockPc": "0x006D38",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0E42",
            "bc": "0x002000",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000E00",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09C9BE"
            }
          }
        },
        {
          "block": "0x006D38",
          "instructionPc": "0x006D46",
          "port": "0x2000",
          "value": "0x0E",
          "cpu": {
            "pc": "0x006D38",
            "currentBlockPc": "0x006D38",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0E42",
            "bc": "0x002000",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000E40",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09C97E"
            }
          }
        },
        {
          "block": "0x006D38",
          "instructionPc": "0x006D46",
          "port": "0x2000",
          "value": "0x0E",
          "cpu": {
            "pc": "0x006D38",
            "currentBlockPc": "0x006D38",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0E42",
            "bc": "0x002000",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000E80",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09C93E"
            }
          }
        },
        {
          "block": "0x006D38",
          "instructionPc": "0x006D46",
          "port": "0x2000",
          "value": "0x0E",
          "cpu": {
            "pc": "0x006D38",
            "currentBlockPc": "0x006D38",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0E42",
            "bc": "0x002000",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000EC0",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09C8FE"
            }
          }
        },
        {
          "block": "0x006D38",
          "instructionPc": "0x006D46",
          "port": "0x2000",
          "value": "0x0E",
          "cpu": {
            "pc": "0x006D38",
            "currentBlockPc": "0x006D38",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0E42",
            "bc": "0x002000",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000F00",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09C8BE"
            }
          }
        },
        {
          "block": "0x006D38",
          "instructionPc": "0x006D46",
          "port": "0x2000",
          "value": "0x0E",
          "cpu": {
            "pc": "0x006D38",
            "currentBlockPc": "0x006D38",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0E42",
            "bc": "0x002000",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000F40",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09C87E"
            }
          }
        },
        {
          "block": "0x006D38",
          "instructionPc": "0x006D46",
          "port": "0x2000",
          "value": "0x0E",
          "cpu": {
            "pc": "0x006D38",
            "currentBlockPc": "0x006D38",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0E42",
            "bc": "0x002000",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000F80",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09C83E"
            }
          }
        },
        {
          "block": "0x006D38",
          "instructionPc": "0x006D46",
          "port": "0x2000",
          "value": "0x0E",
          "cpu": {
            "pc": "0x006D38",
            "currentBlockPc": "0x006D38",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0E42",
            "bc": "0x002000",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000FC0",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09C7FE"
            }
          }
        },
        {
          "block": "0x006D38",
          "instructionPc": "0x006D46",
          "port": "0x2000",
          "value": "0x0E",
          "cpu": {
            "pc": "0x006D38",
            "currentBlockPc": "0x006D38",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0E42",
            "bc": "0x002000",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x001000",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09C7BE"
            }
          }
        }
      ],
      "mmioReads": [],
      "loopBlockEntries": [
        {
          "blockIndex": 9941,
          "pc": "0x0021C2",
          "cpu": {
            "pc": "0x0021C2",
            "currentBlockPc": "0x0021C2",
            "sp": "0xD1A835",
            "ix": "0xD1A838",
            "iy": "0xD00080",
            "af": "0x1042",
            "bc": "0x003010",
            "de": "0xD00080",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x04",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000000",
              "D00124": "0x00"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x040FCD",
              "IX+0": "0xD1A845",
              "IX+3": "0x048D77",
              "IX+6": "0x000000",
              "IX+9": "0x000000"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 9992,
          "pc": "0x0021C2",
          "cpu": {
            "pc": "0x0021C2",
            "currentBlockPc": "0x0021C2",
            "sp": "0xD1A835",
            "ix": "0xD1A83B",
            "iy": "0xD00080",
            "af": "0x2062",
            "bc": "0x003082",
            "de": "0x00FF00",
            "hl": "0x000020",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x04",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000000",
              "D00124": "0x00"
            },
            "ixFrame": {
              "IX-6": "0x041A8D",
              "IX-3": "0x000020",
              "IX+0": "0xD1A845",
              "IX+3": "0x048E00",
              "IX+6": "0x000000",
              "IX+9": "0xA86000"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 10236,
          "pc": "0x0021C2",
          "cpu": {
            "pc": "0x0021C2",
            "currentBlockPc": "0x0021C2",
            "sp": "0xD1A7F0",
            "ix": "0xD1A7FF",
            "iy": "0xD15D80",
            "af": "0x0D08",
            "bc": "0x000002",
            "de": "0x000420",
            "hl": "0x3B000E",
            "flags": {
              "z": false,
              "c": false
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x04",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000000",
              "D00124": "0x00"
            },
            "ixFrame": {
              "IX-6": "0x2E4017",
              "IX-3": "0x000002",
              "IX+0": "0xFFFFFF",
              "IX+3": "0x02B16B",
              "IX+6": "0x000045",
              "IX+9": "0x253600"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 10330,
          "pc": "0x0021C2",
          "cpu": {
            "pc": "0x0021C2",
            "currentBlockPc": "0x0021C2",
            "sp": "0xD1A802",
            "ix": "0xFFFFFF",
            "iy": "0x3B001A",
            "af": "0x2062",
            "bc": "0xD140B3",
            "de": "0x000420",
            "hl": "0xD140B3",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x04",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000000",
              "D00124": "0x00"
            },
            "ixFrame": {
              "IX-6": "0xD140B3",
              "IX-3": "0x000000",
              "IX+0": "0xEDF300",
              "IX+3": "0xC35B7E",
              "IX+6": "0x000658",
              "IX+9": "0x7EEDF3"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20436,
          "pc": "0x006D5D",
          "cpu": {
            "pc": "0x006D5D",
            "currentBlockPc": "0x006D5D",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0042",
            "bc": "0x020000",
            "de": "0x000240",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000000",
              "D00124": "0x0A"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x020000",
              "IX+0": "0xD1A866",
              "IX+3": "0x0064DE",
              "IX+6": "0x020000",
              "IX+9": "0x000100"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20437,
          "pc": "0x0021C2",
          "cpu": {
            "pc": "0x0021C2",
            "currentBlockPc": "0x0021C2",
            "sp": "0xD1A828",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0042",
            "bc": "0x020000",
            "de": "0x000240",
            "hl": "0x000100",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000000",
              "D00124": "0x0A"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x020000",
              "IX+0": "0xD1A866",
              "IX+3": "0x0064DE",
              "IX+6": "0x020000",
              "IX+9": "0x000100"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20438,
          "pc": "0x006D64",
          "cpu": {
            "pc": "0x006D64",
            "currentBlockPc": "0x006D64",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0002",
            "bc": "0x020000",
            "de": "0x000240",
            "hl": "0x000100",
            "flags": {
              "z": false,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000000",
              "D00124": "0x0A"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x020000",
              "IX+0": "0xD1A866",
              "IX+3": "0x0064DE",
              "IX+6": "0x020000",
              "IX+9": "0x000100"
            }
          },
          "outerBranch": "JP NZ to 0x006CDF"
        },
        {
          "blockIndex": 20439,
          "pc": "0x006CDF",
          "cpu": {
            "pc": "0x006CDF",
            "currentBlockPc": "0x006CDF",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0002",
            "bc": "0x020000",
            "de": "0x000240",
            "hl": "0x000100",
            "flags": {
              "z": false,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000000",
              "D00124": "0x0A"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x020000",
              "IX+0": "0xD1A866",
              "IX+3": "0x0064DE",
              "IX+6": "0x020000",
              "IX+9": "0x000100"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20440,
          "pc": "0x006CF7",
          "cpu": {
            "pc": "0x006CF7",
            "currentBlockPc": "0x006CF7",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0093",
            "bc": "0x000100",
            "de": "0x000240",
            "hl": "0xFFFF40",
            "flags": {
              "z": false,
              "c": true
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000000",
              "D00124": "0x0A"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x0064DE",
              "IX+6": "0x020000",
              "IX+9": "0x000100"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20441,
          "pc": "0x006D0F",
          "cpu": {
            "pc": "0x006D0F",
            "currentBlockPc": "0x006D0F",
            "sp": "0xD1A828",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x2042",
            "bc": "0x000040",
            "de": "0x002010",
            "hl": "0x020000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000000",
              "D00124": "0x0A"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x0064DE",
              "IX+6": "0x020000",
              "IX+9": "0x000100"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20442,
          "pc": "0x006D38",
          "cpu": {
            "pc": "0x006D38",
            "currentBlockPc": "0x006D38",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0042",
            "bc": "0x000040",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000040",
              "D00124": "0x0A"
            },
            "ixFrame": {
              "IX-6": "0x000040",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x0064DE",
              "IX+6": "0x020000",
              "IX+9": "0x0000C0"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20443,
          "pc": "0x006D4F",
          "cpu": {
            "pc": "0x006D4F",
            "currentBlockPc": "0x006D4F",
            "sp": "0xD1A828",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x2042",
            "bc": "0x002000",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000040",
              "D00124": "0x0A"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x0064DE",
              "IX+6": "0x020000",
              "IX+9": "0x0000C0"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20444,
          "pc": "0x006D5D",
          "cpu": {
            "pc": "0x006D5D",
            "currentBlockPc": "0x006D5D",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0054",
            "bc": "0x002001",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000040",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x0064DE",
              "IX+6": "0x020000",
              "IX+9": "0x0000C0"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20445,
          "pc": "0x0021C2",
          "cpu": {
            "pc": "0x0021C2",
            "currentBlockPc": "0x0021C2",
            "sp": "0xD1A828",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0054",
            "bc": "0x002001",
            "de": "0x002010",
            "hl": "0x0000C0",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000040",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x0064DE",
              "IX+6": "0x020000",
              "IX+9": "0x0000C0"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20446,
          "pc": "0x006D64",
          "cpu": {
            "pc": "0x006D64",
            "currentBlockPc": "0x006D64",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0002",
            "bc": "0x002001",
            "de": "0x002010",
            "hl": "0x0000C0",
            "flags": {
              "z": false,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000040",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x0064DE",
              "IX+6": "0x020000",
              "IX+9": "0x0000C0"
            }
          },
          "outerBranch": "JP NZ to 0x006CDF"
        },
        {
          "blockIndex": 20447,
          "pc": "0x006CDF",
          "cpu": {
            "pc": "0x006CDF",
            "currentBlockPc": "0x006CDF",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0002",
            "bc": "0x002001",
            "de": "0x002010",
            "hl": "0x0000C0",
            "flags": {
              "z": false,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000040",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x0064DE",
              "IX+6": "0x020000",
              "IX+9": "0x0000C0"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20448,
          "pc": "0x006CF7",
          "cpu": {
            "pc": "0x006CF7",
            "currentBlockPc": "0x006CF7",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0093",
            "bc": "0x0000C0",
            "de": "0x002010",
            "hl": "0xFFFF80",
            "flags": {
              "z": false,
              "c": true
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000040",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x0064DE",
              "IX+6": "0x020000",
              "IX+9": "0x0000C0"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20449,
          "pc": "0x006D0F",
          "cpu": {
            "pc": "0x006D0F",
            "currentBlockPc": "0x006D0F",
            "sp": "0xD1A828",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x2042",
            "bc": "0x000040",
            "de": "0x002010",
            "hl": "0x020000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000040",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x0064DE",
              "IX+6": "0x020000",
              "IX+9": "0x0000C0"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20450,
          "pc": "0x006D38",
          "cpu": {
            "pc": "0x006D38",
            "currentBlockPc": "0x006D38",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0042",
            "bc": "0x000040",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000080",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000040",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x0064DE",
              "IX+6": "0x020000",
              "IX+9": "0x000080"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20451,
          "pc": "0x006D4F",
          "cpu": {
            "pc": "0x006D4F",
            "currentBlockPc": "0x006D4F",
            "sp": "0xD1A828",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x2042",
            "bc": "0x002000",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000080",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x0064DE",
              "IX+6": "0x020000",
              "IX+9": "0x000080"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20452,
          "pc": "0x006D5D",
          "cpu": {
            "pc": "0x006D5D",
            "currentBlockPc": "0x006D5D",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0054",
            "bc": "0x002001",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000080",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x0064DE",
              "IX+6": "0x020000",
              "IX+9": "0x000080"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20453,
          "pc": "0x0021C2",
          "cpu": {
            "pc": "0x0021C2",
            "currentBlockPc": "0x0021C2",
            "sp": "0xD1A828",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0054",
            "bc": "0x002001",
            "de": "0x002010",
            "hl": "0x000080",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000080",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x0064DE",
              "IX+6": "0x020000",
              "IX+9": "0x000080"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20454,
          "pc": "0x006D64",
          "cpu": {
            "pc": "0x006D64",
            "currentBlockPc": "0x006D64",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0002",
            "bc": "0x002001",
            "de": "0x002010",
            "hl": "0x000080",
            "flags": {
              "z": false,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000080",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x0064DE",
              "IX+6": "0x020000",
              "IX+9": "0x000080"
            }
          },
          "outerBranch": "JP NZ to 0x006CDF"
        },
        {
          "blockIndex": 20455,
          "pc": "0x006CDF",
          "cpu": {
            "pc": "0x006CDF",
            "currentBlockPc": "0x006CDF",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0002",
            "bc": "0x002001",
            "de": "0x002010",
            "hl": "0x000080",
            "flags": {
              "z": false,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000080",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x0064DE",
              "IX+6": "0x020000",
              "IX+9": "0x000080"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20456,
          "pc": "0x006CF7",
          "cpu": {
            "pc": "0x006CF7",
            "currentBlockPc": "0x006CF7",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0093",
            "bc": "0x000080",
            "de": "0x002010",
            "hl": "0xFFFFC0",
            "flags": {
              "z": false,
              "c": true
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000080",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x0064DE",
              "IX+6": "0x020000",
              "IX+9": "0x000080"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20457,
          "pc": "0x006D0F",
          "cpu": {
            "pc": "0x006D0F",
            "currentBlockPc": "0x006D0F",
            "sp": "0xD1A828",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x2042",
            "bc": "0x000040",
            "de": "0x002010",
            "hl": "0x020000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000080",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x0064DE",
              "IX+6": "0x020000",
              "IX+9": "0x000080"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20458,
          "pc": "0x006D38",
          "cpu": {
            "pc": "0x006D38",
            "currentBlockPc": "0x006D38",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0042",
            "bc": "0x000040",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x0000C0",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000040",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x0064DE",
              "IX+6": "0x020000",
              "IX+9": "0x000040"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20459,
          "pc": "0x006D4F",
          "cpu": {
            "pc": "0x006D4F",
            "currentBlockPc": "0x006D4F",
            "sp": "0xD1A828",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x2042",
            "bc": "0x002000",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x0000C0",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x0064DE",
              "IX+6": "0x020000",
              "IX+9": "0x000040"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20460,
          "pc": "0x006D5D",
          "cpu": {
            "pc": "0x006D5D",
            "currentBlockPc": "0x006D5D",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0054",
            "bc": "0x002001",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x0000C0",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x0064DE",
              "IX+6": "0x020000",
              "IX+9": "0x000040"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20461,
          "pc": "0x0021C2",
          "cpu": {
            "pc": "0x0021C2",
            "currentBlockPc": "0x0021C2",
            "sp": "0xD1A828",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0054",
            "bc": "0x002001",
            "de": "0x002010",
            "hl": "0x000040",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x0000C0",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x0064DE",
              "IX+6": "0x020000",
              "IX+9": "0x000040"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20462,
          "pc": "0x006D64",
          "cpu": {
            "pc": "0x006D64",
            "currentBlockPc": "0x006D64",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0002",
            "bc": "0x002001",
            "de": "0x002010",
            "hl": "0x000040",
            "flags": {
              "z": false,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x0000C0",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x0064DE",
              "IX+6": "0x020000",
              "IX+9": "0x000040"
            }
          },
          "outerBranch": "JP NZ to 0x006CDF"
        },
        {
          "blockIndex": 20463,
          "pc": "0x006CDF",
          "cpu": {
            "pc": "0x006CDF",
            "currentBlockPc": "0x006CDF",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0002",
            "bc": "0x002001",
            "de": "0x002010",
            "hl": "0x000040",
            "flags": {
              "z": false,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x0000C0",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x0064DE",
              "IX+6": "0x020000",
              "IX+9": "0x000040"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20465,
          "pc": "0x006D0F",
          "cpu": {
            "pc": "0x006D0F",
            "currentBlockPc": "0x006D0F",
            "sp": "0xD1A828",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x2042",
            "bc": "0x000040",
            "de": "0x002010",
            "hl": "0x020000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x0000C0",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x0064DE",
              "IX+6": "0x020000",
              "IX+9": "0x000040"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20466,
          "pc": "0x006D38",
          "cpu": {
            "pc": "0x006D38",
            "currentBlockPc": "0x006D38",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0042",
            "bc": "0x000040",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000100",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000040",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x0064DE",
              "IX+6": "0x020000",
              "IX+9": "0x000000"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20467,
          "pc": "0x006D4F",
          "cpu": {
            "pc": "0x006D4F",
            "currentBlockPc": "0x006D4F",
            "sp": "0xD1A828",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x2042",
            "bc": "0x002000",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000100",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x0064DE",
              "IX+6": "0x020000",
              "IX+9": "0x000000"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20468,
          "pc": "0x006D5D",
          "cpu": {
            "pc": "0x006D5D",
            "currentBlockPc": "0x006D5D",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0054",
            "bc": "0x002001",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000100",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x0064DE",
              "IX+6": "0x020000",
              "IX+9": "0x000000"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20469,
          "pc": "0x0021C2",
          "cpu": {
            "pc": "0x0021C2",
            "currentBlockPc": "0x0021C2",
            "sp": "0xD1A828",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0054",
            "bc": "0x002001",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000100",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x0064DE",
              "IX+6": "0x020000",
              "IX+9": "0x000000"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20470,
          "pc": "0x006D64",
          "cpu": {
            "pc": "0x006D64",
            "currentBlockPc": "0x006D64",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0042",
            "bc": "0x002001",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000100",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x0064DE",
              "IX+6": "0x020000",
              "IX+9": "0x000000"
            }
          },
          "outerBranch": "fall through; IX+9/HL was zero"
        },
        {
          "blockIndex": 20474,
          "pc": "0x006D5D",
          "cpu": {
            "pc": "0x006D5D",
            "currentBlockPc": "0x006D5D",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0042",
            "bc": "0x00658A",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000100",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x00658A",
              "IX+0": "0xD1A866",
              "IX+3": "0x0064EE",
              "IX+6": "0x00658A",
              "IX+9": "0x000004"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20475,
          "pc": "0x0021C2",
          "cpu": {
            "pc": "0x0021C2",
            "currentBlockPc": "0x0021C2",
            "sp": "0xD1A828",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0042",
            "bc": "0x00658A",
            "de": "0x002010",
            "hl": "0x000004",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000100",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x00658A",
              "IX+0": "0xD1A866",
              "IX+3": "0x0064EE",
              "IX+6": "0x00658A",
              "IX+9": "0x000004"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20476,
          "pc": "0x006D64",
          "cpu": {
            "pc": "0x006D64",
            "currentBlockPc": "0x006D64",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0002",
            "bc": "0x00658A",
            "de": "0x002010",
            "hl": "0x000004",
            "flags": {
              "z": false,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000100",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x00658A",
              "IX+0": "0xD1A866",
              "IX+3": "0x0064EE",
              "IX+6": "0x00658A",
              "IX+9": "0x000004"
            }
          },
          "outerBranch": "JP NZ to 0x006CDF"
        },
        {
          "blockIndex": 20477,
          "pc": "0x006CDF",
          "cpu": {
            "pc": "0x006CDF",
            "currentBlockPc": "0x006CDF",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0002",
            "bc": "0x00658A",
            "de": "0x002010",
            "hl": "0x000004",
            "flags": {
              "z": false,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000100",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x00658A",
              "IX+0": "0xD1A866",
              "IX+3": "0x0064EE",
              "IX+6": "0x00658A",
              "IX+9": "0x000004"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20479,
          "pc": "0x006D0F",
          "cpu": {
            "pc": "0x006D0F",
            "currentBlockPc": "0x006D0F",
            "sp": "0xD1A828",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x2042",
            "bc": "0x000004",
            "de": "0x002010",
            "hl": "0x00658A",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000100",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000004",
              "IX+0": "0xD1A866",
              "IX+3": "0x0064EE",
              "IX+6": "0x00658A",
              "IX+9": "0x000004"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20480,
          "pc": "0x006D5D",
          "cpu": {
            "pc": "0x006D5D",
            "currentBlockPc": "0x006D5D",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0093",
            "bc": "0x000040",
            "de": "0x002010",
            "hl": "0xFFFFC4",
            "flags": {
              "z": false,
              "c": true
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000104",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000004",
              "IX-3": "0x000004",
              "IX+0": "0xD1A866",
              "IX+3": "0x0064EE",
              "IX+6": "0x00658A",
              "IX+9": "0x000000"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20481,
          "pc": "0x0021C2",
          "cpu": {
            "pc": "0x0021C2",
            "currentBlockPc": "0x0021C2",
            "sp": "0xD1A828",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0093",
            "bc": "0x000040",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": false,
              "c": true
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000104",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000004",
              "IX-3": "0x000004",
              "IX+0": "0xD1A866",
              "IX+3": "0x0064EE",
              "IX+6": "0x00658A",
              "IX+9": "0x000000"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20482,
          "pc": "0x006D64",
          "cpu": {
            "pc": "0x006D64",
            "currentBlockPc": "0x006D64",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0042",
            "bc": "0x000040",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000104",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000004",
              "IX-3": "0x000004",
              "IX+0": "0xD1A866",
              "IX+3": "0x0064EE",
              "IX+6": "0x00658A",
              "IX+9": "0x000000"
            }
          },
          "outerBranch": "fall through; IX+9/HL was zero"
        },
        {
          "blockIndex": 20486,
          "pc": "0x006D5D",
          "cpu": {
            "pc": "0x006D5D",
            "currentBlockPc": "0x006D5D",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0442",
            "bc": "0x020104",
            "de": "0x002010",
            "hl": "0x000004",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000104",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000004",
              "IX-3": "0x020104",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D6BA"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20487,
          "pc": "0x0021C2",
          "cpu": {
            "pc": "0x0021C2",
            "currentBlockPc": "0x0021C2",
            "sp": "0xD1A828",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0442",
            "bc": "0x020104",
            "de": "0x002010",
            "hl": "0x09D6BA",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000104",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000004",
              "IX-3": "0x020104",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D6BA"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20488,
          "pc": "0x006D64",
          "cpu": {
            "pc": "0x006D64",
            "currentBlockPc": "0x006D64",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0402",
            "bc": "0x020104",
            "de": "0x002010",
            "hl": "0x09D6BA",
            "flags": {
              "z": false,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000104",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000004",
              "IX-3": "0x020104",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D6BA"
            }
          },
          "outerBranch": "JP NZ to 0x006CDF"
        },
        {
          "blockIndex": 20489,
          "pc": "0x006CDF",
          "cpu": {
            "pc": "0x006CDF",
            "currentBlockPc": "0x006CDF",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0402",
            "bc": "0x020104",
            "de": "0x002010",
            "hl": "0x09D6BA",
            "flags": {
              "z": false,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000104",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000004",
              "IX-3": "0x020104",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D6BA"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20490,
          "pc": "0x006CF7",
          "cpu": {
            "pc": "0x006CF7",
            "currentBlockPc": "0x006CF7",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0493",
            "bc": "0x09D6BA",
            "de": "0x002010",
            "hl": "0xF62982",
            "flags": {
              "z": false,
              "c": true
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000104",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000004",
              "IX-3": "0x00003C",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D6BA"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20491,
          "pc": "0x006D0F",
          "cpu": {
            "pc": "0x006D0F",
            "currentBlockPc": "0x006D0F",
            "sp": "0xD1A828",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x2042",
            "bc": "0x00003C",
            "de": "0x002014",
            "hl": "0x020104",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000104",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000004",
              "IX-3": "0x00003C",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D6BA"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20492,
          "pc": "0x006D38",
          "cpu": {
            "pc": "0x006D38",
            "currentBlockPc": "0x006D38",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0442",
            "bc": "0x000040",
            "de": "0x002014",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000140",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000040",
              "IX-3": "0x00003C",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D67E"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20493,
          "pc": "0x006D4F",
          "cpu": {
            "pc": "0x006D4F",
            "currentBlockPc": "0x006D4F",
            "sp": "0xD1A828",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x2042",
            "bc": "0x002000",
            "de": "0x002014",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000140",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x00003C",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D67E"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20494,
          "pc": "0x006D5D",
          "cpu": {
            "pc": "0x006D5D",
            "currentBlockPc": "0x006D5D",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0054",
            "bc": "0x002001",
            "de": "0x002014",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000140",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x00003C",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D67E"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20495,
          "pc": "0x0021C2",
          "cpu": {
            "pc": "0x0021C2",
            "currentBlockPc": "0x0021C2",
            "sp": "0xD1A828",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0054",
            "bc": "0x002001",
            "de": "0x002014",
            "hl": "0x09D67E",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000140",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x00003C",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D67E"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20496,
          "pc": "0x006D64",
          "cpu": {
            "pc": "0x006D64",
            "currentBlockPc": "0x006D64",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0002",
            "bc": "0x002001",
            "de": "0x002014",
            "hl": "0x09D67E",
            "flags": {
              "z": false,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000140",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x00003C",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D67E"
            }
          },
          "outerBranch": "JP NZ to 0x006CDF"
        },
        {
          "blockIndex": 20497,
          "pc": "0x006CDF",
          "cpu": {
            "pc": "0x006CDF",
            "currentBlockPc": "0x006CDF",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0002",
            "bc": "0x002001",
            "de": "0x002014",
            "hl": "0x09D67E",
            "flags": {
              "z": false,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000140",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x00003C",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D67E"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20498,
          "pc": "0x006CF7",
          "cpu": {
            "pc": "0x006CF7",
            "currentBlockPc": "0x006CF7",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0093",
            "bc": "0x09D67E",
            "de": "0x002014",
            "hl": "0xF629C2",
            "flags": {
              "z": false,
              "c": true
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000140",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D67E"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20499,
          "pc": "0x006D0F",
          "cpu": {
            "pc": "0x006D0F",
            "currentBlockPc": "0x006D0F",
            "sp": "0xD1A828",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x2042",
            "bc": "0x000040",
            "de": "0x002010",
            "hl": "0x020104",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000140",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D67E"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20500,
          "pc": "0x006D38",
          "cpu": {
            "pc": "0x006D38",
            "currentBlockPc": "0x006D38",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0042",
            "bc": "0x000040",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000180",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000040",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D63E"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20501,
          "pc": "0x006D4F",
          "cpu": {
            "pc": "0x006D4F",
            "currentBlockPc": "0x006D4F",
            "sp": "0xD1A828",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x2042",
            "bc": "0x002000",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000180",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D63E"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20502,
          "pc": "0x006D5D",
          "cpu": {
            "pc": "0x006D5D",
            "currentBlockPc": "0x006D5D",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0054",
            "bc": "0x002001",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000180",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D63E"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20503,
          "pc": "0x0021C2",
          "cpu": {
            "pc": "0x0021C2",
            "currentBlockPc": "0x0021C2",
            "sp": "0xD1A828",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0054",
            "bc": "0x002001",
            "de": "0x002010",
            "hl": "0x09D63E",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000180",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D63E"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20504,
          "pc": "0x006D64",
          "cpu": {
            "pc": "0x006D64",
            "currentBlockPc": "0x006D64",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0002",
            "bc": "0x002001",
            "de": "0x002010",
            "hl": "0x09D63E",
            "flags": {
              "z": false,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000180",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D63E"
            }
          },
          "outerBranch": "JP NZ to 0x006CDF"
        },
        {
          "blockIndex": 20505,
          "pc": "0x006CDF",
          "cpu": {
            "pc": "0x006CDF",
            "currentBlockPc": "0x006CDF",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0002",
            "bc": "0x002001",
            "de": "0x002010",
            "hl": "0x09D63E",
            "flags": {
              "z": false,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000180",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D63E"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20506,
          "pc": "0x006CF7",
          "cpu": {
            "pc": "0x006CF7",
            "currentBlockPc": "0x006CF7",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0093",
            "bc": "0x09D63E",
            "de": "0x002010",
            "hl": "0xF62A02",
            "flags": {
              "z": false,
              "c": true
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000180",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D63E"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20507,
          "pc": "0x006D0F",
          "cpu": {
            "pc": "0x006D0F",
            "currentBlockPc": "0x006D0F",
            "sp": "0xD1A828",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x2042",
            "bc": "0x000040",
            "de": "0x002010",
            "hl": "0x020104",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000180",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D63E"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20508,
          "pc": "0x006D38",
          "cpu": {
            "pc": "0x006D38",
            "currentBlockPc": "0x006D38",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0042",
            "bc": "0x000040",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x0001C0",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000040",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D5FE"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20509,
          "pc": "0x006D4F",
          "cpu": {
            "pc": "0x006D4F",
            "currentBlockPc": "0x006D4F",
            "sp": "0xD1A828",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x2042",
            "bc": "0x002000",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x0001C0",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D5FE"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20510,
          "pc": "0x006D5D",
          "cpu": {
            "pc": "0x006D5D",
            "currentBlockPc": "0x006D5D",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0054",
            "bc": "0x002001",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x0001C0",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D5FE"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20511,
          "pc": "0x0021C2",
          "cpu": {
            "pc": "0x0021C2",
            "currentBlockPc": "0x0021C2",
            "sp": "0xD1A828",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0054",
            "bc": "0x002001",
            "de": "0x002010",
            "hl": "0x09D5FE",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x0001C0",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D5FE"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20512,
          "pc": "0x006D64",
          "cpu": {
            "pc": "0x006D64",
            "currentBlockPc": "0x006D64",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0002",
            "bc": "0x002001",
            "de": "0x002010",
            "hl": "0x09D5FE",
            "flags": {
              "z": false,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x0001C0",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D5FE"
            }
          },
          "outerBranch": "JP NZ to 0x006CDF"
        },
        {
          "blockIndex": 20513,
          "pc": "0x006CDF",
          "cpu": {
            "pc": "0x006CDF",
            "currentBlockPc": "0x006CDF",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0002",
            "bc": "0x002001",
            "de": "0x002010",
            "hl": "0x09D5FE",
            "flags": {
              "z": false,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x0001C0",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D5FE"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20514,
          "pc": "0x006CF7",
          "cpu": {
            "pc": "0x006CF7",
            "currentBlockPc": "0x006CF7",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0093",
            "bc": "0x09D5FE",
            "de": "0x002010",
            "hl": "0xF62A42",
            "flags": {
              "z": false,
              "c": true
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x0001C0",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D5FE"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20515,
          "pc": "0x006D0F",
          "cpu": {
            "pc": "0x006D0F",
            "currentBlockPc": "0x006D0F",
            "sp": "0xD1A828",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x2042",
            "bc": "0x000040",
            "de": "0x002010",
            "hl": "0x020104",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x0001C0",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D5FE"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20516,
          "pc": "0x006D38",
          "cpu": {
            "pc": "0x006D38",
            "currentBlockPc": "0x006D38",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0042",
            "bc": "0x000040",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000200",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000040",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D5BE"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20517,
          "pc": "0x006D4F",
          "cpu": {
            "pc": "0x006D4F",
            "currentBlockPc": "0x006D4F",
            "sp": "0xD1A828",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x2042",
            "bc": "0x002000",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000200",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D5BE"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20518,
          "pc": "0x006D5D",
          "cpu": {
            "pc": "0x006D5D",
            "currentBlockPc": "0x006D5D",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0054",
            "bc": "0x002001",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000200",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D5BE"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20519,
          "pc": "0x0021C2",
          "cpu": {
            "pc": "0x0021C2",
            "currentBlockPc": "0x0021C2",
            "sp": "0xD1A828",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0054",
            "bc": "0x002001",
            "de": "0x002010",
            "hl": "0x09D5BE",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000200",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D5BE"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20520,
          "pc": "0x006D64",
          "cpu": {
            "pc": "0x006D64",
            "currentBlockPc": "0x006D64",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0002",
            "bc": "0x002001",
            "de": "0x002010",
            "hl": "0x09D5BE",
            "flags": {
              "z": false,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000200",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D5BE"
            }
          },
          "outerBranch": "JP NZ to 0x006CDF"
        },
        {
          "blockIndex": 20521,
          "pc": "0x006CDF",
          "cpu": {
            "pc": "0x006CDF",
            "currentBlockPc": "0x006CDF",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0002",
            "bc": "0x002001",
            "de": "0x002010",
            "hl": "0x09D5BE",
            "flags": {
              "z": false,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000200",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D5BE"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20522,
          "pc": "0x006CF7",
          "cpu": {
            "pc": "0x006CF7",
            "currentBlockPc": "0x006CF7",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0093",
            "bc": "0x09D5BE",
            "de": "0x002010",
            "hl": "0xF62A82",
            "flags": {
              "z": false,
              "c": true
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000200",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D5BE"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20523,
          "pc": "0x006D0F",
          "cpu": {
            "pc": "0x006D0F",
            "currentBlockPc": "0x006D0F",
            "sp": "0xD1A828",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x2042",
            "bc": "0x000040",
            "de": "0x002010",
            "hl": "0x020104",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000200",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D5BE"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20524,
          "pc": "0x006D38",
          "cpu": {
            "pc": "0x006D38",
            "currentBlockPc": "0x006D38",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0042",
            "bc": "0x000040",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000240",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000040",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D57E"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20525,
          "pc": "0x006D4F",
          "cpu": {
            "pc": "0x006D4F",
            "currentBlockPc": "0x006D4F",
            "sp": "0xD1A828",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x2042",
            "bc": "0x002000",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000240",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D57E"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20526,
          "pc": "0x006D5D",
          "cpu": {
            "pc": "0x006D5D",
            "currentBlockPc": "0x006D5D",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0054",
            "bc": "0x002001",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000240",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D57E"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20527,
          "pc": "0x0021C2",
          "cpu": {
            "pc": "0x0021C2",
            "currentBlockPc": "0x0021C2",
            "sp": "0xD1A828",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0054",
            "bc": "0x002001",
            "de": "0x002010",
            "hl": "0x09D57E",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000240",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D57E"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20528,
          "pc": "0x006D64",
          "cpu": {
            "pc": "0x006D64",
            "currentBlockPc": "0x006D64",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0002",
            "bc": "0x002001",
            "de": "0x002010",
            "hl": "0x09D57E",
            "flags": {
              "z": false,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000240",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D57E"
            }
          },
          "outerBranch": "JP NZ to 0x006CDF"
        },
        {
          "blockIndex": 20529,
          "pc": "0x006CDF",
          "cpu": {
            "pc": "0x006CDF",
            "currentBlockPc": "0x006CDF",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0002",
            "bc": "0x002001",
            "de": "0x002010",
            "hl": "0x09D57E",
            "flags": {
              "z": false,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000240",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D57E"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20530,
          "pc": "0x006CF7",
          "cpu": {
            "pc": "0x006CF7",
            "currentBlockPc": "0x006CF7",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0093",
            "bc": "0x09D57E",
            "de": "0x002010",
            "hl": "0xF62AC2",
            "flags": {
              "z": false,
              "c": true
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000240",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D57E"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20531,
          "pc": "0x006D0F",
          "cpu": {
            "pc": "0x006D0F",
            "currentBlockPc": "0x006D0F",
            "sp": "0xD1A828",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x2042",
            "bc": "0x000040",
            "de": "0x002010",
            "hl": "0x020104",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000240",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D57E"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20532,
          "pc": "0x006D38",
          "cpu": {
            "pc": "0x006D38",
            "currentBlockPc": "0x006D38",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0042",
            "bc": "0x000040",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000280",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000040",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D53E"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20533,
          "pc": "0x006D4F",
          "cpu": {
            "pc": "0x006D4F",
            "currentBlockPc": "0x006D4F",
            "sp": "0xD1A828",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x2042",
            "bc": "0x002000",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000280",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D53E"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20534,
          "pc": "0x006D5D",
          "cpu": {
            "pc": "0x006D5D",
            "currentBlockPc": "0x006D5D",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0054",
            "bc": "0x002001",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000280",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D53E"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20535,
          "pc": "0x0021C2",
          "cpu": {
            "pc": "0x0021C2",
            "currentBlockPc": "0x0021C2",
            "sp": "0xD1A828",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0054",
            "bc": "0x002001",
            "de": "0x002010",
            "hl": "0x09D53E",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000280",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D53E"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20536,
          "pc": "0x006D64",
          "cpu": {
            "pc": "0x006D64",
            "currentBlockPc": "0x006D64",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0002",
            "bc": "0x002001",
            "de": "0x002010",
            "hl": "0x09D53E",
            "flags": {
              "z": false,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000280",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D53E"
            }
          },
          "outerBranch": "JP NZ to 0x006CDF"
        },
        {
          "blockIndex": 20537,
          "pc": "0x006CDF",
          "cpu": {
            "pc": "0x006CDF",
            "currentBlockPc": "0x006CDF",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0002",
            "bc": "0x002001",
            "de": "0x002010",
            "hl": "0x09D53E",
            "flags": {
              "z": false,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000280",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D53E"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20538,
          "pc": "0x006CF7",
          "cpu": {
            "pc": "0x006CF7",
            "currentBlockPc": "0x006CF7",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0093",
            "bc": "0x09D53E",
            "de": "0x002010",
            "hl": "0xF62B02",
            "flags": {
              "z": false,
              "c": true
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000280",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D53E"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20539,
          "pc": "0x006D0F",
          "cpu": {
            "pc": "0x006D0F",
            "currentBlockPc": "0x006D0F",
            "sp": "0xD1A828",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x2042",
            "bc": "0x000040",
            "de": "0x002010",
            "hl": "0x020104",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000280",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D53E"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20540,
          "pc": "0x006D38",
          "cpu": {
            "pc": "0x006D38",
            "currentBlockPc": "0x006D38",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0042",
            "bc": "0x000040",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x0002C0",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000040",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D4FE"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20541,
          "pc": "0x006D4F",
          "cpu": {
            "pc": "0x006D4F",
            "currentBlockPc": "0x006D4F",
            "sp": "0xD1A828",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x2042",
            "bc": "0x002000",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x0002C0",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D4FE"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20542,
          "pc": "0x006D5D",
          "cpu": {
            "pc": "0x006D5D",
            "currentBlockPc": "0x006D5D",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0054",
            "bc": "0x002001",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x0002C0",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D4FE"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20543,
          "pc": "0x0021C2",
          "cpu": {
            "pc": "0x0021C2",
            "currentBlockPc": "0x0021C2",
            "sp": "0xD1A828",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0054",
            "bc": "0x002001",
            "de": "0x002010",
            "hl": "0x09D4FE",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x0002C0",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D4FE"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20544,
          "pc": "0x006D64",
          "cpu": {
            "pc": "0x006D64",
            "currentBlockPc": "0x006D64",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0002",
            "bc": "0x002001",
            "de": "0x002010",
            "hl": "0x09D4FE",
            "flags": {
              "z": false,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x0002C0",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D4FE"
            }
          },
          "outerBranch": "JP NZ to 0x006CDF"
        },
        {
          "blockIndex": 20545,
          "pc": "0x006CDF",
          "cpu": {
            "pc": "0x006CDF",
            "currentBlockPc": "0x006CDF",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0002",
            "bc": "0x002001",
            "de": "0x002010",
            "hl": "0x09D4FE",
            "flags": {
              "z": false,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x0002C0",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D4FE"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20546,
          "pc": "0x006CF7",
          "cpu": {
            "pc": "0x006CF7",
            "currentBlockPc": "0x006CF7",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0093",
            "bc": "0x09D4FE",
            "de": "0x002010",
            "hl": "0xF62B42",
            "flags": {
              "z": false,
              "c": true
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x0002C0",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D4FE"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20547,
          "pc": "0x006D0F",
          "cpu": {
            "pc": "0x006D0F",
            "currentBlockPc": "0x006D0F",
            "sp": "0xD1A828",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x2042",
            "bc": "0x000040",
            "de": "0x002010",
            "hl": "0x020104",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x0002C0",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D4FE"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20548,
          "pc": "0x006D38",
          "cpu": {
            "pc": "0x006D38",
            "currentBlockPc": "0x006D38",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0042",
            "bc": "0x000040",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000300",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000040",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D4BE"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20549,
          "pc": "0x006D4F",
          "cpu": {
            "pc": "0x006D4F",
            "currentBlockPc": "0x006D4F",
            "sp": "0xD1A828",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x2042",
            "bc": "0x002000",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000300",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D4BE"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20550,
          "pc": "0x006D5D",
          "cpu": {
            "pc": "0x006D5D",
            "currentBlockPc": "0x006D5D",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0054",
            "bc": "0x002001",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000300",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D4BE"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20551,
          "pc": "0x0021C2",
          "cpu": {
            "pc": "0x0021C2",
            "currentBlockPc": "0x0021C2",
            "sp": "0xD1A828",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0054",
            "bc": "0x002001",
            "de": "0x002010",
            "hl": "0x09D4BE",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000300",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D4BE"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20552,
          "pc": "0x006D64",
          "cpu": {
            "pc": "0x006D64",
            "currentBlockPc": "0x006D64",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0002",
            "bc": "0x002001",
            "de": "0x002010",
            "hl": "0x09D4BE",
            "flags": {
              "z": false,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000300",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D4BE"
            }
          },
          "outerBranch": "JP NZ to 0x006CDF"
        },
        {
          "blockIndex": 20553,
          "pc": "0x006CDF",
          "cpu": {
            "pc": "0x006CDF",
            "currentBlockPc": "0x006CDF",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0002",
            "bc": "0x002001",
            "de": "0x002010",
            "hl": "0x09D4BE",
            "flags": {
              "z": false,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000300",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D4BE"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20554,
          "pc": "0x006CF7",
          "cpu": {
            "pc": "0x006CF7",
            "currentBlockPc": "0x006CF7",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0093",
            "bc": "0x09D4BE",
            "de": "0x002010",
            "hl": "0xF62B82",
            "flags": {
              "z": false,
              "c": true
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000300",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D4BE"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20555,
          "pc": "0x006D0F",
          "cpu": {
            "pc": "0x006D0F",
            "currentBlockPc": "0x006D0F",
            "sp": "0xD1A828",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x2042",
            "bc": "0x000040",
            "de": "0x002010",
            "hl": "0x020104",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000300",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D4BE"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20556,
          "pc": "0x006D38",
          "cpu": {
            "pc": "0x006D38",
            "currentBlockPc": "0x006D38",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0042",
            "bc": "0x000040",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000340",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000040",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D47E"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20557,
          "pc": "0x006D4F",
          "cpu": {
            "pc": "0x006D4F",
            "currentBlockPc": "0x006D4F",
            "sp": "0xD1A828",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x2042",
            "bc": "0x002000",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000340",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D47E"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20558,
          "pc": "0x006D5D",
          "cpu": {
            "pc": "0x006D5D",
            "currentBlockPc": "0x006D5D",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0054",
            "bc": "0x002001",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000340",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D47E"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20559,
          "pc": "0x0021C2",
          "cpu": {
            "pc": "0x0021C2",
            "currentBlockPc": "0x0021C2",
            "sp": "0xD1A828",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0054",
            "bc": "0x002001",
            "de": "0x002010",
            "hl": "0x09D47E",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000340",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D47E"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20560,
          "pc": "0x006D64",
          "cpu": {
            "pc": "0x006D64",
            "currentBlockPc": "0x006D64",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0002",
            "bc": "0x002001",
            "de": "0x002010",
            "hl": "0x09D47E",
            "flags": {
              "z": false,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000340",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D47E"
            }
          },
          "outerBranch": "JP NZ to 0x006CDF"
        },
        {
          "blockIndex": 20561,
          "pc": "0x006CDF",
          "cpu": {
            "pc": "0x006CDF",
            "currentBlockPc": "0x006CDF",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0002",
            "bc": "0x002001",
            "de": "0x002010",
            "hl": "0x09D47E",
            "flags": {
              "z": false,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000340",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D47E"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20562,
          "pc": "0x006CF7",
          "cpu": {
            "pc": "0x006CF7",
            "currentBlockPc": "0x006CF7",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0093",
            "bc": "0x09D47E",
            "de": "0x002010",
            "hl": "0xF62BC2",
            "flags": {
              "z": false,
              "c": true
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000340",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D47E"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20563,
          "pc": "0x006D0F",
          "cpu": {
            "pc": "0x006D0F",
            "currentBlockPc": "0x006D0F",
            "sp": "0xD1A828",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x2042",
            "bc": "0x000040",
            "de": "0x002010",
            "hl": "0x020104",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000340",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D47E"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20564,
          "pc": "0x006D38",
          "cpu": {
            "pc": "0x006D38",
            "currentBlockPc": "0x006D38",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0042",
            "bc": "0x000040",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000380",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000040",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D43E"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20565,
          "pc": "0x006D4F",
          "cpu": {
            "pc": "0x006D4F",
            "currentBlockPc": "0x006D4F",
            "sp": "0xD1A828",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x2042",
            "bc": "0x002000",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000380",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D43E"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20566,
          "pc": "0x006D5D",
          "cpu": {
            "pc": "0x006D5D",
            "currentBlockPc": "0x006D5D",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0054",
            "bc": "0x002001",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000380",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D43E"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20567,
          "pc": "0x0021C2",
          "cpu": {
            "pc": "0x0021C2",
            "currentBlockPc": "0x0021C2",
            "sp": "0xD1A828",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0054",
            "bc": "0x002001",
            "de": "0x002010",
            "hl": "0x09D43E",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000380",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D43E"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20568,
          "pc": "0x006D64",
          "cpu": {
            "pc": "0x006D64",
            "currentBlockPc": "0x006D64",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0002",
            "bc": "0x002001",
            "de": "0x002010",
            "hl": "0x09D43E",
            "flags": {
              "z": false,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000380",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D43E"
            }
          },
          "outerBranch": "JP NZ to 0x006CDF"
        },
        {
          "blockIndex": 20569,
          "pc": "0x006CDF",
          "cpu": {
            "pc": "0x006CDF",
            "currentBlockPc": "0x006CDF",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0002",
            "bc": "0x002001",
            "de": "0x002010",
            "hl": "0x09D43E",
            "flags": {
              "z": false,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000380",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D43E"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20570,
          "pc": "0x006CF7",
          "cpu": {
            "pc": "0x006CF7",
            "currentBlockPc": "0x006CF7",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0093",
            "bc": "0x09D43E",
            "de": "0x002010",
            "hl": "0xF62C02",
            "flags": {
              "z": false,
              "c": true
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000380",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D43E"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20571,
          "pc": "0x006D0F",
          "cpu": {
            "pc": "0x006D0F",
            "currentBlockPc": "0x006D0F",
            "sp": "0xD1A828",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x2042",
            "bc": "0x000040",
            "de": "0x002010",
            "hl": "0x020104",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000380",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D43E"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20572,
          "pc": "0x006D38",
          "cpu": {
            "pc": "0x006D38",
            "currentBlockPc": "0x006D38",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0042",
            "bc": "0x000040",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x0003C0",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000040",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D3FE"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20573,
          "pc": "0x006D4F",
          "cpu": {
            "pc": "0x006D4F",
            "currentBlockPc": "0x006D4F",
            "sp": "0xD1A828",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x2042",
            "bc": "0x002000",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x0003C0",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D3FE"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20574,
          "pc": "0x006D5D",
          "cpu": {
            "pc": "0x006D5D",
            "currentBlockPc": "0x006D5D",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0054",
            "bc": "0x002001",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x0003C0",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D3FE"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20575,
          "pc": "0x0021C2",
          "cpu": {
            "pc": "0x0021C2",
            "currentBlockPc": "0x0021C2",
            "sp": "0xD1A828",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0054",
            "bc": "0x002001",
            "de": "0x002010",
            "hl": "0x09D3FE",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x0003C0",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D3FE"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20576,
          "pc": "0x006D64",
          "cpu": {
            "pc": "0x006D64",
            "currentBlockPc": "0x006D64",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0002",
            "bc": "0x002001",
            "de": "0x002010",
            "hl": "0x09D3FE",
            "flags": {
              "z": false,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x0003C0",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D3FE"
            }
          },
          "outerBranch": "JP NZ to 0x006CDF"
        },
        {
          "blockIndex": 20577,
          "pc": "0x006CDF",
          "cpu": {
            "pc": "0x006CDF",
            "currentBlockPc": "0x006CDF",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0002",
            "bc": "0x002001",
            "de": "0x002010",
            "hl": "0x09D3FE",
            "flags": {
              "z": false,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x0003C0",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D3FE"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20578,
          "pc": "0x006CF7",
          "cpu": {
            "pc": "0x006CF7",
            "currentBlockPc": "0x006CF7",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0093",
            "bc": "0x09D3FE",
            "de": "0x002010",
            "hl": "0xF62C42",
            "flags": {
              "z": false,
              "c": true
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x0003C0",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D3FE"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20579,
          "pc": "0x006D0F",
          "cpu": {
            "pc": "0x006D0F",
            "currentBlockPc": "0x006D0F",
            "sp": "0xD1A828",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x2042",
            "bc": "0x000040",
            "de": "0x002010",
            "hl": "0x020104",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x0003C0",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D3FE"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20580,
          "pc": "0x006D38",
          "cpu": {
            "pc": "0x006D38",
            "currentBlockPc": "0x006D38",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0042",
            "bc": "0x000040",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000400",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000040",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D3BE"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20581,
          "pc": "0x006D4F",
          "cpu": {
            "pc": "0x006D4F",
            "currentBlockPc": "0x006D4F",
            "sp": "0xD1A828",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x2042",
            "bc": "0x002000",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000400",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D3BE"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20582,
          "pc": "0x006D5D",
          "cpu": {
            "pc": "0x006D5D",
            "currentBlockPc": "0x006D5D",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0054",
            "bc": "0x002001",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000400",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D3BE"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20583,
          "pc": "0x0021C2",
          "cpu": {
            "pc": "0x0021C2",
            "currentBlockPc": "0x0021C2",
            "sp": "0xD1A828",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0054",
            "bc": "0x002001",
            "de": "0x002010",
            "hl": "0x09D3BE",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000400",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D3BE"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20584,
          "pc": "0x006D64",
          "cpu": {
            "pc": "0x006D64",
            "currentBlockPc": "0x006D64",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0002",
            "bc": "0x002001",
            "de": "0x002010",
            "hl": "0x09D3BE",
            "flags": {
              "z": false,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000400",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D3BE"
            }
          },
          "outerBranch": "JP NZ to 0x006CDF"
        },
        {
          "blockIndex": 20585,
          "pc": "0x006CDF",
          "cpu": {
            "pc": "0x006CDF",
            "currentBlockPc": "0x006CDF",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0002",
            "bc": "0x002001",
            "de": "0x002010",
            "hl": "0x09D3BE",
            "flags": {
              "z": false,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000400",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D3BE"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20586,
          "pc": "0x006CF7",
          "cpu": {
            "pc": "0x006CF7",
            "currentBlockPc": "0x006CF7",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0093",
            "bc": "0x09D3BE",
            "de": "0x002010",
            "hl": "0xF62C82",
            "flags": {
              "z": false,
              "c": true
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000400",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D3BE"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20587,
          "pc": "0x006D0F",
          "cpu": {
            "pc": "0x006D0F",
            "currentBlockPc": "0x006D0F",
            "sp": "0xD1A828",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x2042",
            "bc": "0x000040",
            "de": "0x002010",
            "hl": "0x020104",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000400",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D3BE"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20588,
          "pc": "0x006D38",
          "cpu": {
            "pc": "0x006D38",
            "currentBlockPc": "0x006D38",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0042",
            "bc": "0x000040",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000440",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000040",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D37E"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20589,
          "pc": "0x006D4F",
          "cpu": {
            "pc": "0x006D4F",
            "currentBlockPc": "0x006D4F",
            "sp": "0xD1A828",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x2042",
            "bc": "0x002000",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000440",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D37E"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20590,
          "pc": "0x006D5D",
          "cpu": {
            "pc": "0x006D5D",
            "currentBlockPc": "0x006D5D",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0054",
            "bc": "0x002001",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000440",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D37E"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20591,
          "pc": "0x0021C2",
          "cpu": {
            "pc": "0x0021C2",
            "currentBlockPc": "0x0021C2",
            "sp": "0xD1A828",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0054",
            "bc": "0x002001",
            "de": "0x002010",
            "hl": "0x09D37E",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000440",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D37E"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20592,
          "pc": "0x006D64",
          "cpu": {
            "pc": "0x006D64",
            "currentBlockPc": "0x006D64",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0002",
            "bc": "0x002001",
            "de": "0x002010",
            "hl": "0x09D37E",
            "flags": {
              "z": false,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000440",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D37E"
            }
          },
          "outerBranch": "JP NZ to 0x006CDF"
        },
        {
          "blockIndex": 20593,
          "pc": "0x006CDF",
          "cpu": {
            "pc": "0x006CDF",
            "currentBlockPc": "0x006CDF",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0002",
            "bc": "0x002001",
            "de": "0x002010",
            "hl": "0x09D37E",
            "flags": {
              "z": false,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000440",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D37E"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20594,
          "pc": "0x006CF7",
          "cpu": {
            "pc": "0x006CF7",
            "currentBlockPc": "0x006CF7",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0093",
            "bc": "0x09D37E",
            "de": "0x002010",
            "hl": "0xF62CC2",
            "flags": {
              "z": false,
              "c": true
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000440",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D37E"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20595,
          "pc": "0x006D0F",
          "cpu": {
            "pc": "0x006D0F",
            "currentBlockPc": "0x006D0F",
            "sp": "0xD1A828",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x2042",
            "bc": "0x000040",
            "de": "0x002010",
            "hl": "0x020104",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000440",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D37E"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20596,
          "pc": "0x006D38",
          "cpu": {
            "pc": "0x006D38",
            "currentBlockPc": "0x006D38",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0042",
            "bc": "0x000040",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000480",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000040",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D33E"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20597,
          "pc": "0x006D4F",
          "cpu": {
            "pc": "0x006D4F",
            "currentBlockPc": "0x006D4F",
            "sp": "0xD1A828",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x2042",
            "bc": "0x002000",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000480",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D33E"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20598,
          "pc": "0x006D5D",
          "cpu": {
            "pc": "0x006D5D",
            "currentBlockPc": "0x006D5D",
            "sp": "0xD1A82B",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0054",
            "bc": "0x002001",
            "de": "0x002010",
            "hl": "0x000000",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000480",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D33E"
            }
          },
          "outerBranch": null
        },
        {
          "blockIndex": 20599,
          "pc": "0x0021C2",
          "cpu": {
            "pc": "0x0021C2",
            "currentBlockPc": "0x0021C2",
            "sp": "0xD1A828",
            "ix": "0xD1A831",
            "iy": "0xD00080",
            "af": "0x0054",
            "bc": "0x002001",
            "de": "0x002010",
            "hl": "0x09D33E",
            "flags": {
              "z": true,
              "c": false
            },
            "fields": {
              "D007CA": "0x000000",
              "D008E0": "0x000000",
              "D0243A": "0x000000",
              "D0243D": "0x000000",
              "D02590": "0x000000",
              "D0259D": "0x000000",
              "D02A29": "0x0000",
              "D00080": "0x00",
              "D0009F": "0x00",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058E": "0x00",
              "D00121": "0x000480",
              "D00124": "0x0E"
            },
            "ixFrame": {
              "IX-6": "0x000000",
              "IX-3": "0x000040",
              "IX+0": "0xD1A866",
              "IX+3": "0x006512",
              "IX+6": "0x020104",
              "IX+9": "0x09D33E"
            }
          },
          "outerBranch": null
        }
      ],
      "pollReadCount": 64,
      "bit3BusyReads": 0,
      "bit3ClearReads": 64
    },
    "topHotBlocks": [
      {
        "pc": "0x09EFDE",
        "count": 2880
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
        "pc": "0x0A19A4",
        "count": 560
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
        "pc": "0x006129",
        "count": 173
      },
      {
        "pc": "0x00612E",
        "count": 173
      },
      {
        "pc": "0x0A1A83",
        "count": 160
      },
      {
        "pc": "0x001CA6",
        "count": 154
      },
      {
        "pc": "0x001CC0",
        "count": 142
      },
      {
        "pc": "0x001CCA",
        "count": 141
      },
      {
        "pc": "0x001C33",
        "count": 134
      },
      {
        "pc": "0x001C38",
        "count": 132
      },
      {
        "pc": "0x0A3408",
        "count": 132
      },
      {
        "pc": "0x0A1854",
        "count": 128
      },
      {
        "pc": "0x0A187C",
        "count": 128
      },
      {
        "pc": "0x0A188A",
        "count": 128
      },
      {
        "pc": "0x0A189E",
        "count": 128
      },
      {
        "pc": "0x0A190D",
        "count": 128
      },
      {
        "pc": "0x0A191F",
        "count": 128
      },
      {
        "pc": "0x0A1939",
        "count": 128
      }
    ],
    "finalFields": {
      "D007CA": "0x000000",
      "D008E0": "0x000000",
      "D0243A": "0x000000",
      "D0243D": "0x000000",
      "D02590": "0x000000",
      "D0259D": "0x000000",
      "D02A29": "0x0000",
      "D00080": "0x00",
      "D0009F": "0x00",
      "D00587": "0x00",
      "D0058C": "0x00",
      "D0058E": "0x00",
      "D00121": "0x001000",
      "D00124": "0x0E"
    }
  },
  "attempts": [
    {
      "scenario": "captured-preclear-ram",
      "inputDescription": "captured CEmu-WASM pre-CLEAR RAM with real typed digit state",
      "result": {
        "steps": 220000,
        "termination": "max_steps",
        "lastPc": 249764,
        "lastMode": "adl"
      },
      "hitTargets": {
        "preStop0A229D": 0,
        "low006DRegion": 0,
        "eolTuple08F54B": 0,
        "cleanup0018F8": 0
      },
      "pollReadCount": 0,
      "pollValues": [],
      "topHotBlocks": [
        {
          "pc": "0x09EFDE",
          "count": 30393
        },
        {
          "pc": "0x026815",
          "count": 7856
        },
        {
          "pc": "0x02681A",
          "count": 7856
        },
        {
          "pc": "0x026823",
          "count": 7856
        },
        {
          "pc": "0x026810",
          "count": 7647
        },
        {
          "pc": "0x001CA6",
          "count": 7602
        },
        {
          "pc": "0x001CC0",
          "count": 7602
        },
        {
          "pc": "0x001CCA",
          "count": 7602
        }
      ],
      "initialFields": {
        "D007CA": "0x0585E9",
        "D008E0": "0xD1A86C",
        "D0243A": "0xD1A8CD",
        "D0243D": "0xD2A83E",
        "D02590": "0xD3FE81",
        "D0259D": "0xD3FECD",
        "D02A29": "0x000C",
        "D00080": "0x00",
        "D0009F": "0x00",
        "D00587": "0x00",
        "D0058C": "0x00",
        "D0058E": "0x00",
        "D00121": "0x000000",
        "D00124": "0x00"
      },
      "finalFields": {
        "D007CA": "0x0585E9",
        "D008E0": "0xD1A863",
        "D0243A": "0xD1A8CC",
        "D0243D": "0xD2A83E",
        "D02590": "0xD3FE81",
        "D0259D": "0xD3FECD",
        "D02A29": "0x0000",
        "D00080": "0x00",
        "D0009F": "0x00",
        "D00587": "0x00",
        "D0058C": "0x00",
        "D0058E": "0x00",
        "D00121": "0x000000",
        "D00124": "0x00"
      }
    },
    {
      "scenario": "in-memory-launch-home-repaint",
      "inputDescription": "OS launch-home init plus clean home repaint, then probe-local physical edit-context seed D0243A=0xD1A8CC/D0243D=0xD2A83E",
      "result": {
        "steps": 20966,
        "termination": "sampled-006dxx-poll",
        "lastPc": 27997,
        "lastMode": "adl"
      },
      "hitTargets": {
        "preStop0A229D": 0,
        "low006DRegion": 330,
        "eolTuple08F54B": 0,
        "cleanup0018F8": 1
      },
      "pollReadCount": 64,
      "pollValues": [
        "0x00"
      ],
      "topHotBlocks": [
        {
          "pc": "0x09EFDE",
          "count": 2880
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
          "pc": "0x0A19A4",
          "count": 560
        },
        {
          "pc": "0x0060B3",
          "count": 255
        },
        {
          "pc": "0x001377",
          "count": 254
        }
      ],
      "initialFields": {
        "D007CA": "0x0585E9",
        "D008E0": "0x000000",
        "D0243A": "0xD1A8CC",
        "D0243D": "0xD2A83E",
        "D02590": "0xD3FE81",
        "D0259D": "0xD3FECD",
        "D02A29": "0x0000",
        "D00080": "0x00",
        "D0009F": "0x00",
        "D00587": "0x00",
        "D0058C": "0x00",
        "D0058E": "0x00",
        "D00121": "0x000000",
        "D00124": "0x00"
      },
      "finalFields": {
        "D007CA": "0x000000",
        "D008E0": "0x000000",
        "D0243A": "0x000000",
        "D0243D": "0x000000",
        "D02590": "0x000000",
        "D0259D": "0x000000",
        "D02A29": "0x0000",
        "D00080": "0x00",
        "D0009F": "0x00",
        "D00587": "0x00",
        "D0058C": "0x00",
        "D0058E": "0x00",
        "D00121": "0x001000",
        "D00124": "0x0E"
      }
    }
  ],
  "pollSummary": {
    "pollReadCount": 64,
    "totalPollReads": 64,
    "distinctValues": [
      0
    ],
    "allBit3Clear": true,
    "anyBit3Busy": false,
    "first": {
      "block": "0x006D4F",
      "instructionPc": "0x006D57",
      "port": "0x2001",
      "value": "0x00",
      "bit3Set": false,
      "bit3Branch": "fall through to 0x006D5D",
      "cpu": {
        "pc": 27983,
        "currentBlockPc": 27983,
        "sp": 13740075,
        "ix": 13740081,
        "iy": 13631616,
        "af": 3650,
        "bc": 8193,
        "de": 8208,
        "hl": 0,
        "flags": {
          "z": true,
          "c": false
        },
        "fields": {
          "D007CA": 0,
          "D008E0": 0,
          "D0243A": 0,
          "D0243D": 0,
          "D02590": 0,
          "D0259D": 0,
          "D02A29": 0,
          "D00080": 0,
          "D0009F": 0,
          "D00587": 0,
          "D0058C": 0,
          "D0058E": 0,
          "D00121": 64,
          "D00124": 14
        },
        "ixFrame": {
          "IX-6": 0,
          "IX-3": 64,
          "IX+0": 13740134,
          "IX+3": 25822,
          "IX+6": 131072,
          "IX+9": 192
        }
      }
    }
  },
  "peripheralsCrossCheck": [
    {
      "line": 142,
      "text": "function createFlashControllerHandler(state) {"
    },
    {
      "line": 145,
      "text": "if (port === 0x2001) {"
    },
    {
      "line": 146,
      "text": "return 0x00;"
    },
    {
      "line": 149,
      "text": "return 0x00;"
    },
    {
      "line": 721,
      "text": "register({ start: 0x2000, end: 0x200f }, createFlashControllerHandler(state));"
    }
  ]
}
```

No runtime, transpiler, browser-shell, decoder, peripheral, scheduler, or ROM artifact files were changed.


# Phase 848: Bounded Post-0x0064DE Owner / Exit Trace

Probe: `probe-phase848-post-0064de-owner-trace.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase848-post-0064de-owner-trace.mjs`

## Summary

- Single bounded case used the Phase847 best route: faithful physical CLEAR setup, cx/anchor oracle preservation at `0x001879 -> 0x0018F8`, and probe-local `0x006D64` completion override.
- Termination: `post-exit-cleanup-loop-0x000A92-threshold` after 21278 blocks; first post-`0x006Dxx` exit was 0x0064DE from 0x006D68.
- Post-exit watched-field writes: 0. First write: none before stop.
- Cleanup-loop boundary hit summary: 0x000A92:16, 0x001C33:1.
- Oracle result stayed at 6/10; final core fields: D007CA=0x0585E9, D008E0=0xD1A86C, D0243A=0x000000, D0243D=0x000000, D02590=0x000000, D0259D=0x000000, D02A29=0x0000.
- Overall probe result: PASS.

## Case

| Case | Termination | Steps | Low 0x006D Hits | First Exit | Preserves | 0x006D64 Overrides | 0x001879/0x0018F8 | Oracle | Final Core Fields |
| --- | --- | ---: | ---: | --- | ---: | ---: | --- | ---: | --- |
| preserve-cx-oracle-force006d64-post-exit | post-exit-cleanup-loop-0x000A92-threshold | 21278 | 24 | 0x0064DE | 1 | 5 | 1/1 | 6/10 | D007CA=0x0585E9<br>D008E0=0xD1A86C<br>D0243A=0x000000<br>D0243D=0x000000<br>D02590=0x000000<br>D0259D=0x000000<br>D02A29=0x0000 |

## Post-Exit Trace

| Post-Exit Block | PC | Previous PC | Watched Fields |
| ---: | --- | --- | --- |
| 0 | 0x0064DE | 0x006D68 | D007CA=0x0585E9<br>D008E0=0xD1A86C<br>D0243A=0x000000<br>D0243D=0x000000<br>D02590=0x000000<br>D0259D=0x000000 |
| 1 | 0x006CC6 | 0x0064DE | D007CA=0x0585E9<br>D008E0=0xD1A86C<br>D0243A=0x000000<br>D0243D=0x000000<br>D02590=0x000000<br>D0259D=0x000000 |
| 2 | 0x006D5D | 0x006CC6 | D007CA=0x0585E9<br>D008E0=0xD1A86C<br>D0243A=0x000000<br>D0243D=0x000000<br>D02590=0x000000<br>D0259D=0x000000 |
| 3 | 0x0021C2 | 0x006D5D | D007CA=0x0585E9<br>D008E0=0xD1A86C<br>D0243A=0x000000<br>D0243D=0x000000<br>D02590=0x000000<br>D0259D=0x000000 |
| 4 | 0x006D64 | 0x0021C2 | D007CA=0x0585E9<br>D008E0=0xD1A86C<br>D0243A=0x000000<br>D0243D=0x000000<br>D02590=0x000000<br>D0259D=0x000000 |
| 5 | 0x006D68 | 0x006D64 | D007CA=0x0585E9<br>D008E0=0xD1A86C<br>D0243A=0x000000<br>D0243D=0x000000<br>D02590=0x000000<br>D0259D=0x000000 |
| 6 | 0x0064EE | 0x006D68 | D007CA=0x0585E9<br>D008E0=0xD1A86C<br>D0243A=0x000000<br>D0243D=0x000000<br>D02590=0x000000<br>D0259D=0x000000 |
| 7 | 0x006CC6 | 0x0064EE | D007CA=0x0585E9<br>D008E0=0xD1A86C<br>D0243A=0x000000<br>D0243D=0x000000<br>D02590=0x000000<br>D0259D=0x000000 |
| 8 | 0x006D5D | 0x006CC6 | D007CA=0x0585E9<br>D008E0=0xD1A86C<br>D0243A=0x000000<br>D0243D=0x000000<br>D02590=0x000000<br>D0259D=0x000000 |
| 9 | 0x0021C2 | 0x006D5D | D007CA=0x0585E9<br>D008E0=0xD1A86C<br>D0243A=0x000000<br>D0243D=0x000000<br>D02590=0x000000<br>D0259D=0x000000 |
| 10 | 0x006D64 | 0x0021C2 | D007CA=0x0585E9<br>D008E0=0xD1A86C<br>D0243A=0x000000<br>D0243D=0x000000<br>D02590=0x000000<br>D0259D=0x000000 |
| 11 | 0x006D68 | 0x006D64 | D007CA=0x0585E9<br>D008E0=0xD1A86C<br>D0243A=0x000000<br>D0243D=0x000000<br>D02590=0x000000<br>D0259D=0x000000 |
| 12 | 0x006512 | 0x006D68 | D007CA=0x0585E9<br>D008E0=0xD1A86C<br>D0243A=0x000000<br>D0243D=0x000000<br>D02590=0x000000<br>D0259D=0x000000 |
| 13 | 0x0017DD | 0x006512 | D007CA=0x0585E9<br>D008E0=0xD1A86C<br>D0243A=0x000000<br>D0243D=0x000000<br>D02590=0x000000<br>D0259D=0x000000 |
| 14 | 0x0059C6 | 0x0017DD | D007CA=0x0585E9<br>D008E0=0xD1A86C<br>D0243A=0x000000<br>D0243D=0x000000<br>D02590=0x000000<br>D0259D=0x000000 |
| 15 | 0x0059D6 | 0x0059C6 | D007CA=0x0585E9<br>D008E0=0xD1A86C<br>D0243A=0x000000<br>D0243D=0x000000<br>D02590=0x000000<br>D0259D=0x000000 |
| 16 | 0x005A75 | 0x0059D6 | D007CA=0x0585E9<br>D008E0=0xD1A86C<br>D0243A=0x000000<br>D0243D=0x000000<br>D02590=0x000000<br>D0259D=0x000000 |
| 17 | 0x005A82 | 0x005A75 | D007CA=0x0585E9<br>D008E0=0xD1A86C<br>D0243A=0x000000<br>D0243D=0x000000<br>D02590=0x000000<br>D0259D=0x000000 |
| 18 | 0x00596E | 0x005A82 | D007CA=0x0585E9<br>D008E0=0xD1A86C<br>D0243A=0x000000<br>D0243D=0x000000<br>D02590=0x000000<br>D0259D=0x000000 |
| 19 | 0x001713 | 0x00596E | D007CA=0x0585E9<br>D008E0=0xD1A86C<br>D0243A=0x000000<br>D0243D=0x000000<br>D02590=0x000000<br>D0259D=0x000000 |
| 20 | 0x0008BB | 0x001713 | D007CA=0x0585E9<br>D008E0=0xD1A86C<br>D0243A=0x000000<br>D0243D=0x000000<br>D02590=0x000000<br>D0259D=0x000000 |
| 21 | 0x001717 | 0x0008BB | D007CA=0x0585E9<br>D008E0=0xD1A86C<br>D0243A=0x000000<br>D0243D=0x000000<br>D02590=0x000000<br>D0259D=0x000000 |
| 22 | 0x001718 | 0x001717 | D007CA=0x0585E9<br>D008E0=0xD1A86C<br>D0243A=0x000000<br>D0243D=0x000000<br>D02590=0x000000<br>D0259D=0x000000 |
| 23 | 0x005974 | 0x001718 | D007CA=0x0585E9<br>D008E0=0xD1A86C<br>D0243A=0x000000<br>D0243D=0x000000<br>D02590=0x000000<br>D0259D=0x000000 |
| 24 | 0x005998 | 0x005974 | D007CA=0x0585E9<br>D008E0=0xD1A86C<br>D0243A=0x000000<br>D0243D=0x000000<br>D02590=0x000000<br>D0259D=0x000000 |
| 25 | 0x005A8B | 0x005998 | D007CA=0x0585E9<br>D008E0=0xD1A86C<br>D0243A=0x000000<br>D0243D=0x000000<br>D02590=0x000000<br>D0259D=0x000000 |
| 26 | 0x005A48 | 0x005A8B | D007CA=0x0585E9<br>D008E0=0xD1A86C<br>D0243A=0x000000<br>D0243D=0x000000<br>D02590=0x000000<br>D0259D=0x000000 |
| 27 | 0x005A96 | 0x005A48 | D007CA=0x0585E9<br>D008E0=0xD1A86C<br>D0243A=0x000000<br>D0243D=0x000000<br>D02590=0x000000<br>D0259D=0x000000 |
| 28 | 0x005A53 | 0x005A96 | D007CA=0x0585E9<br>D008E0=0xD1A86C<br>D0243A=0x000000<br>D0243D=0x000000<br>D02590=0x000000<br>D0259D=0x000000 |
| 29 | 0x005AA2 | 0x005A53 | D007CA=0x0585E9<br>D008E0=0xD1A86C<br>D0243A=0x000000<br>D0243D=0x000000<br>D02590=0x000000<br>D0259D=0x000000 |
| 30 | 0x005AAE | 0x005AA2 | D007CA=0x0585E9<br>D008E0=0xD1A86C<br>D0243A=0x000000<br>D0243D=0x000000<br>D02590=0x000000<br>D0259D=0x000000 |
| 31 | 0x005AE8 | 0x005AAE | D007CA=0x0585E9<br>D008E0=0xD1A86C<br>D0243A=0x000000<br>D0243D=0x000000<br>D02590=0x000000<br>D0259D=0x000000 |
| 32 | 0x005B16 | 0x005AE8 | D007CA=0x0585E9<br>D008E0=0xD1A86C<br>D0243A=0x000000<br>D0243D=0x000000<br>D02590=0x000000<br>D0259D=0x000000 |
| 33 | 0x005B4B | 0x005B16 | D007CA=0x0585E9<br>D008E0=0xD1A86C<br>D0243A=0x000000<br>D0243D=0x000000<br>D02590=0x000000<br>D0259D=0x000000 |
| 34 | 0x005AB6 | 0x005B4B | D007CA=0x0585E9<br>D008E0=0xD1A86C<br>D0243A=0x000000<br>D0243D=0x000000<br>D02590=0x000000<br>D0259D=0x000000 |
| 35 | 0x005AE8 | 0x005AB6 | D007CA=0x0585E9<br>D008E0=0xD1A86C<br>D0243A=0x000000<br>D0243D=0x000000<br>D02590=0x000000<br>D0259D=0x000000 |
| 36 | 0x005B16 | 0x005AE8 | D007CA=0x0585E9<br>D008E0=0xD1A86C<br>D0243A=0x000000<br>D0243D=0x000000<br>D02590=0x000000<br>D0259D=0x000000 |
| 37 | 0x005B4B | 0x005B16 | D007CA=0x0585E9<br>D008E0=0xD1A86C<br>D0243A=0x000000<br>D0243D=0x000000<br>D02590=0x000000<br>D0259D=0x000000 |
| 38 | 0x005AB6 | 0x005B4B | D007CA=0x0585E9<br>D008E0=0xD1A86C<br>D0243A=0x000000<br>D0243D=0x000000<br>D02590=0x000000<br>D0259D=0x000000 |
| 39 | 0x005AE8 | 0x005AB6 | D007CA=0x0585E9<br>D008E0=0xD1A86C<br>D0243A=0x000000<br>D0243D=0x000000<br>D02590=0x000000<br>D0259D=0x000000 |
| 40 | 0x005B16 | 0x005AE8 | D007CA=0x0585E9<br>D008E0=0xD1A86C<br>D0243A=0x000000<br>D0243D=0x000000<br>D02590=0x000000<br>D0259D=0x000000 |
| 41 | 0x005B4B | 0x005B16 | D007CA=0x0585E9<br>D008E0=0xD1A86C<br>D0243A=0x000000<br>D0243D=0x000000<br>D02590=0x000000<br>D0259D=0x000000 |
| 42 | 0x005AB6 | 0x005B4B | D007CA=0x0585E9<br>D008E0=0xD1A86C<br>D0243A=0x000000<br>D0243D=0x000000<br>D02590=0x000000<br>D0259D=0x000000 |
| 43 | 0x005AE8 | 0x005AB6 | D007CA=0x0585E9<br>D008E0=0xD1A86C<br>D0243A=0x000000<br>D0243D=0x000000<br>D02590=0x000000<br>D0259D=0x000000 |
| 44 | 0x005B16 | 0x005AE8 | D007CA=0x0585E9<br>D008E0=0xD1A86C<br>D0243A=0x000000<br>D0243D=0x000000<br>D02590=0x000000<br>D0259D=0x000000 |
| 45 | 0x005B4B | 0x005B16 | D007CA=0x0585E9<br>D008E0=0xD1A86C<br>D0243A=0x000000<br>D0243D=0x000000<br>D02590=0x000000<br>D0259D=0x000000 |
| 46 | 0x005AB6 | 0x005B4B | D007CA=0x0585E9<br>D008E0=0xD1A86C<br>D0243A=0x000000<br>D0243D=0x000000<br>D02590=0x000000<br>D0259D=0x000000 |
| 47 | 0x005AE8 | 0x005AB6 | D007CA=0x0585E9<br>D008E0=0xD1A86C<br>D0243A=0x000000<br>D0243D=0x000000<br>D02590=0x000000<br>D0259D=0x000000 |

## Post-Exit Watched-Field Writes

| Post-Exit Block | PC | Kind | Address | Fields | Before Bytes | After Bytes |
| ---: | --- | --- | --- | --- | --- | --- |
| - | - | - | - | - | - | - |

## Oracle Comparison

Compared against `captures/realram-home-afterCLEAR-D00000-D657FF.bin`.

| Field | Actual | Oracle | Match |
| --- | --- | --- | --- |
| D007CA | 0x0585E9 | 0x0585E9 | yes |
| D008E0 | 0xD1A86C | 0xD1A86C | yes |
| D0243A | 0x000000 | 0xD1A8CC | no |
| D0243D | 0x000000 | 0xD2A83E | no |
| D02590 | 0x000000 | 0xD3FE81 | no |
| D0259D | 0x000000 | 0xD3FECD | no |
| D02A29 | 0x0000 | 0x0000 | yes |
| D00587 | 0x00 | 0x00 | yes |
| D0058C | 0x00 | 0x00 | yes |
| D0058E | 0x00 | 0x00 | yes |

## First 0x006D64 Override

```json
{
  "blockIndex": 20438,
  "ix9Value": "0x000100",
  "before": {
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
      "D007CA": "0x0585E9",
      "D008E0": "0xD1A86C",
      "D0243A": "0x000000",
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
  "after": {
    "pc": "0x006D64",
    "currentBlockPc": "0x006D64",
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
      "D007CA": "0x0585E9",
      "D008E0": "0xD1A86C",
      "D0243A": "0x000000",
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
      "IX+9": "0x000000"
    }
  }
}
```

## Preservation Events

```json
[
  {
    "name": "preserve-cx-oracle-at-001879-to-0018F8",
    "blockIndex": 11129,
    "ownerPc": "0x001879",
    "entryPc": "0x0018F8",
    "restoredFields": [
      "D007CA",
      "D008E0"
    ],
    "sourceMode": "override-target",
    "sourceFields": {
      "D007CA": "0x0585E9",
      "D008E0": "0xD1A86C"
    },
    "beforeRestore": {
      "D007CA": "0x000000",
      "D008E0": "0x000000"
    },
    "afterRestore": {
      "D007CA": "0x0585E9",
      "D008E0": "0xD1A86C"
    },
    "beforeCpu": {
      "pc": "0x001879",
      "currentBlockPc": "0x001879",
      "sp": "0xD1A87B",
      "ix": "0x000000",
      "iy": "0xD00080",
      "af": "0xEE54",
      "bc": "0x000003",
      "de": "0x000430",
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
        "IX-6": "0x00D140",
        "IX-3": "0x000000",
        "IX+0": "0x7EEDF3",
        "IX+3": "0x58C35B",
        "IX+6": "0xF30006",
        "IX+9": "0x5B7EED"
      }
    },
    "afterCpu": {
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
        "D007CA": "0x0585E9",
        "D008E0": "0xD1A86C",
        "D0243A": "0x000000",
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
  }
]
```

## Static Blocks

### 0x0064DE

```text
0x0064DE  c1             pop bc
0x0064DF  c1             pop bc
0x0064E0  01 04 00 00    ld bc, 0x000004
0x0064E4  c5             push bc
0x0064E5  01 8a 65 00    ld bc, 0x00658a
0x0064E9  c5             push bc
0x0064EA  cd c6 6c 00    call 0x006cc6
```

Exits: `[{"type":"call","target":27846,"targetMode":"adl"},{"type":"call-return","target":25838,"targetMode":"adl"}]`

### 0x006CC6

```text
0x006CC6  dd e5          push ix
0x006CC8  dd 21 00 00 00 ld ix, 0x000000
0x006CCD  dd 39          add ix, sp
0x006CCF  c5             push bc
0x006CD0  c5             push bc
0x006CD1  3a 21 01 d0    ld a, (0xd00121)
0x006CD5  e6 3f          and 0x3f
0x006CD7  ed 62          sbc hl, hl
0x006CD9  6f             ld l, a
0x006CDA  dd 2f fa       ld (ix+-6), hl
0x006CDD  18 7e          jr 0x006d5d
```

Exits: `[{"type":"jump","target":27997,"targetMode":"adl"}]`

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

### 0x006D68

```text
0x006D68  dd f9          ld sp, ix
0x006D6A  dd e1          pop ix
0x006D6C  c9             ret
```

Exits: `[{"type":"return"}]`

### 0x0064EE

```text
0x0064EE  c1             pop bc
0x0064EF  c1             pop bc
0x0064F0  e5             push hl
0x0064F1  dd 27 fd       ld hl, (ix+-3)
0x0064F4  01 04 01 00    ld bc, 0x000104
0x0064F8  b7             or a
0x0064F9  ed 42          sbc hl, bc
0x0064FB  e5             push hl
0x0064FC  c1             pop bc
0x0064FD  e1             pop hl
0x0064FE  c5             push bc
0x0064FF  e5             push hl
0x006500  dd 27 06       ld hl, (ix+6)
0x006503  01 04 01 00    ld bc, 0x000104
0x006507  b7             or a
0x006508  ed 4a          adc hl, bc
0x00650A  e5             push hl
0x00650B  c1             pop bc
0x00650C  e1             pop hl
0x00650D  c5             push bc
0x00650E  cd c6 6c 00    call 0x006cc6
```

Exits: `[{"type":"call","target":27846,"targetMode":"adl"},{"type":"call-return","target":25874,"targetMode":"adl"}]`

## Full JSON

```json
{
  "probe": "phase848-post-0064de-owner-trace",
  "pass": true,
  "case": {
    "scenario": "preserve-cx-oracle-force006d64-post-exit",
    "description": "Restore D007CA/D008E0 to oracle targets at 0x001879 -> 0x0018F8, force 0x006D64 completion once, then continue beyond 0x0064DE only until the first watched-field owner or bounded cleanup loop.",
    "termination": "post-exit-cleanup-loop-0x000A92-threshold",
    "steps": 21278,
    "low006DRegion": 24,
    "hits0A229D": 0,
    "hits08F54B": 0,
    "hits001879": 1,
    "hits0018F8": 1,
    "hits0019B5": 0,
    "pollReadCount": 0,
    "pollValues": [],
    "allBit3Clear": false,
    "loop006D64": 5,
    "overrideCount": 5,
    "preservationCount": 1,
    "preservationEvents": [
      {
        "name": "preserve-cx-oracle-at-001879-to-0018F8",
        "blockIndex": 11129,
        "ownerPc": "0x001879",
        "entryPc": "0x0018F8",
        "restoredFields": [
          "D007CA",
          "D008E0"
        ],
        "sourceMode": "override-target",
        "sourceFields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A86C"
        },
        "beforeRestore": {
          "D007CA": "0x000000",
          "D008E0": "0x000000"
        },
        "afterRestore": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A86C"
        },
        "beforeCpu": {
          "pc": "0x001879",
          "currentBlockPc": "0x001879",
          "sp": "0xD1A87B",
          "ix": "0x000000",
          "iy": "0xD00080",
          "af": "0xEE54",
          "bc": "0x000003",
          "de": "0x000430",
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
            "IX-6": "0x00D140",
            "IX-3": "0x000000",
            "IX+0": "0x7EEDF3",
            "IX+3": "0x58C35B",
            "IX+6": "0xF30006",
            "IX+9": "0x5B7EED"
          }
        },
        "afterCpu": {
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
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0x000000",
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
      }
    ],
    "firstOverride": {
      "blockIndex": 20438,
      "ix9Value": "0x000100",
      "before": {
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
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A86C",
          "D0243A": "0x000000",
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
      "after": {
        "pc": "0x006D64",
        "currentBlockPc": "0x006D64",
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
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A86C",
          "D0243A": "0x000000",
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
          "IX+9": "0x000000"
        }
      }
    },
    "firstExitAfter006D": {
      "blockIndex": 20440,
      "pc": "0x0064DE",
      "previousPc": "0x006D68",
      "cpu": {
        "pc": "0x0064DE",
        "currentBlockPc": "0x0064DE",
        "sp": "0xD1A837",
        "ix": "0xD1A866",
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
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A86C",
          "D0243A": "0x000000",
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
          "IX-6": "0x000104",
          "IX-3": "0x09D7BE",
          "IX+0": "0xD1A878",
          "IX+3": "0x013968",
          "IX+6": "0x020000",
          "IX+9": "0xD00080"
        }
      }
    },
    "firstHits": {
      "clear001879": {
        "blockIndex": 11128,
        "pc": "0x001879",
        "cpu": {
          "pc": "0x001879",
          "currentBlockPc": "0x001879",
          "sp": "0xD1A87B",
          "ix": "0x000000",
          "iy": "0xD00080",
          "af": "0xEE54",
          "bc": "0x000003",
          "de": "0x000430",
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
            "IX-6": "0x00D140",
            "IX-3": "0x000000",
            "IX+0": "0x7EEDF3",
            "IX+3": "0x58C35B",
            "IX+6": "0xF30006",
            "IX+9": "0x5B7EED"
          }
        }
      },
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
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0x000000",
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
          "af": "0x0042",
          "bc": "0x020000",
          "de": "0x000240",
          "hl": "0x000000",
          "flags": {
            "z": true,
            "c": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0x000000",
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
            "IX+9": "0x000000"
          }
        }
      }
    },
    "postExitTrace": [
      {
        "blockIndex": 20440,
        "postExitBlock": 0,
        "pc": "0x0064DE",
        "previousPc": "0x006D68",
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A86C",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D0259D": "0x000000"
        },
        "cpu": {
          "pc": "0x0064DE",
          "currentBlockPc": "0x0064DE",
          "sp": "0xD1A837",
          "ix": "0xD1A866",
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
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0x000000",
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
            "IX-6": "0x000104",
            "IX-3": "0x09D7BE",
            "IX+0": "0xD1A878",
            "IX+3": "0x013968",
            "IX+6": "0x020000",
            "IX+9": "0xD00080"
          }
        }
      },
      {
        "blockIndex": 20441,
        "postExitBlock": 1,
        "pc": "0x006CC6",
        "previousPc": "0x0064DE",
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A86C",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D0259D": "0x000000"
        },
        "cpu": {
          "pc": "0x006CC6",
          "currentBlockPc": "0x006CC6",
          "sp": "0xD1A834",
          "ix": "0xD1A866",
          "iy": "0xD00080",
          "af": "0x0042",
          "bc": "0x00658A",
          "de": "0x000240",
          "hl": "0x000000",
          "flags": {
            "z": true,
            "c": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0x000000",
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
            "IX-6": "0x000104",
            "IX-3": "0x09D7BE",
            "IX+0": "0xD1A878",
            "IX+3": "0x013968",
            "IX+6": "0x020000",
            "IX+9": "0xD00080"
          }
        }
      },
      {
        "blockIndex": 20442,
        "postExitBlock": 2,
        "pc": "0x006D5D",
        "previousPc": "0x006CC6",
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A86C",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D0259D": "0x000000"
        },
        "cpu": {
          "pc": "0x006D5D",
          "currentBlockPc": "0x006D5D",
          "sp": "0xD1A82B",
          "ix": "0xD1A831",
          "iy": "0xD00080",
          "af": "0x0042",
          "bc": "0x00658A",
          "de": "0x000240",
          "hl": "0x000000",
          "flags": {
            "z": true,
            "c": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0x000000",
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
            "IX-3": "0x00658A",
            "IX+0": "0xD1A866",
            "IX+3": "0x0064EE",
            "IX+6": "0x00658A",
            "IX+9": "0x000004"
          }
        }
      },
      {
        "blockIndex": 20443,
        "postExitBlock": 3,
        "pc": "0x0021C2",
        "previousPc": "0x006D5D",
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A86C",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D0259D": "0x000000"
        },
        "cpu": {
          "pc": "0x0021C2",
          "currentBlockPc": "0x0021C2",
          "sp": "0xD1A828",
          "ix": "0xD1A831",
          "iy": "0xD00080",
          "af": "0x0042",
          "bc": "0x00658A",
          "de": "0x000240",
          "hl": "0x000004",
          "flags": {
            "z": true,
            "c": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0x000000",
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
            "IX-3": "0x00658A",
            "IX+0": "0xD1A866",
            "IX+3": "0x0064EE",
            "IX+6": "0x00658A",
            "IX+9": "0x000004"
          }
        }
      },
      {
        "blockIndex": 20444,
        "postExitBlock": 4,
        "pc": "0x006D64",
        "previousPc": "0x0021C2",
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A86C",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D0259D": "0x000000"
        },
        "cpu": {
          "pc": "0x006D64",
          "currentBlockPc": "0x006D64",
          "sp": "0xD1A82B",
          "ix": "0xD1A831",
          "iy": "0xD00080",
          "af": "0x0042",
          "bc": "0x00658A",
          "de": "0x000240",
          "hl": "0x000000",
          "flags": {
            "z": true,
            "c": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0x000000",
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
            "IX-3": "0x00658A",
            "IX+0": "0xD1A866",
            "IX+3": "0x0064EE",
            "IX+6": "0x00658A",
            "IX+9": "0x000000"
          }
        }
      },
      {
        "blockIndex": 20445,
        "postExitBlock": 5,
        "pc": "0x006D68",
        "previousPc": "0x006D64",
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A86C",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D0259D": "0x000000"
        },
        "cpu": {
          "pc": "0x006D68",
          "currentBlockPc": "0x006D68",
          "sp": "0xD1A82B",
          "ix": "0xD1A831",
          "iy": "0xD00080",
          "af": "0x0042",
          "bc": "0x00658A",
          "de": "0x000240",
          "hl": "0x000000",
          "flags": {
            "z": true,
            "c": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0x000000",
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
            "IX-3": "0x00658A",
            "IX+0": "0xD1A866",
            "IX+3": "0x0064EE",
            "IX+6": "0x00658A",
            "IX+9": "0x000000"
          }
        }
      },
      {
        "blockIndex": 20446,
        "postExitBlock": 6,
        "pc": "0x0064EE",
        "previousPc": "0x006D68",
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A86C",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D0259D": "0x000000"
        },
        "cpu": {
          "pc": "0x0064EE",
          "currentBlockPc": "0x0064EE",
          "sp": "0xD1A837",
          "ix": "0xD1A866",
          "iy": "0xD00080",
          "af": "0x0042",
          "bc": "0x00658A",
          "de": "0x000240",
          "hl": "0x000000",
          "flags": {
            "z": true,
            "c": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0x000000",
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
            "IX-6": "0x000104",
            "IX-3": "0x09D7BE",
            "IX+0": "0xD1A878",
            "IX+3": "0x013968",
            "IX+6": "0x020000",
            "IX+9": "0xD00080"
          }
        }
      },
      {
        "blockIndex": 20447,
        "postExitBlock": 7,
        "pc": "0x006CC6",
        "previousPc": "0x0064EE",
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A86C",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D0259D": "0x000000"
        },
        "cpu": {
          "pc": "0x006CC6",
          "currentBlockPc": "0x006CC6",
          "sp": "0xD1A834",
          "ix": "0xD1A866",
          "iy": "0xD00080",
          "af": "0x0000",
          "bc": "0x020104",
          "de": "0x000240",
          "hl": "0x000000",
          "flags": {
            "z": false,
            "c": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0x000000",
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
            "IX-6": "0x000104",
            "IX-3": "0x09D7BE",
            "IX+0": "0xD1A878",
            "IX+3": "0x013968",
            "IX+6": "0x020000",
            "IX+9": "0xD00080"
          }
        }
      },
      {
        "blockIndex": 20448,
        "postExitBlock": 8,
        "pc": "0x006D5D",
        "previousPc": "0x006CC6",
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A86C",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D0259D": "0x000000"
        },
        "cpu": {
          "pc": "0x006D5D",
          "currentBlockPc": "0x006D5D",
          "sp": "0xD1A82B",
          "ix": "0xD1A831",
          "iy": "0xD00080",
          "af": "0x0042",
          "bc": "0x020104",
          "de": "0x000240",
          "hl": "0x000000",
          "flags": {
            "z": true,
            "c": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0x000000",
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
            "IX-3": "0x020104",
            "IX+0": "0xD1A866",
            "IX+3": "0x006512",
            "IX+6": "0x020104",
            "IX+9": "0x09D6BA"
          }
        }
      },
      {
        "blockIndex": 20449,
        "postExitBlock": 9,
        "pc": "0x0021C2",
        "previousPc": "0x006D5D",
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A86C",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D0259D": "0x000000"
        },
        "cpu": {
          "pc": "0x0021C2",
          "currentBlockPc": "0x0021C2",
          "sp": "0xD1A828",
          "ix": "0xD1A831",
          "iy": "0xD00080",
          "af": "0x0042",
          "bc": "0x020104",
          "de": "0x000240",
          "hl": "0x09D6BA",
          "flags": {
            "z": true,
            "c": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0x000000",
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
            "IX-3": "0x020104",
            "IX+0": "0xD1A866",
            "IX+3": "0x006512",
            "IX+6": "0x020104",
            "IX+9": "0x09D6BA"
          }
        }
      },
      {
        "blockIndex": 20450,
        "postExitBlock": 10,
        "pc": "0x006D64",
        "previousPc": "0x0021C2",
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A86C",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D0259D": "0x000000"
        },
        "cpu": {
          "pc": "0x006D64",
          "currentBlockPc": "0x006D64",
          "sp": "0xD1A82B",
          "ix": "0xD1A831",
          "iy": "0xD00080",
          "af": "0x0042",
          "bc": "0x020104",
          "de": "0x000240",
          "hl": "0x000000",
          "flags": {
            "z": true,
            "c": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0x000000",
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
            "IX-3": "0x020104",
            "IX+0": "0xD1A866",
            "IX+3": "0x006512",
            "IX+6": "0x020104",
            "IX+9": "0x000000"
          }
        }
      },
      {
        "blockIndex": 20451,
        "postExitBlock": 11,
        "pc": "0x006D68",
        "previousPc": "0x006D64",
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A86C",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D0259D": "0x000000"
        },
        "cpu": {
          "pc": "0x006D68",
          "currentBlockPc": "0x006D68",
          "sp": "0xD1A82B",
          "ix": "0xD1A831",
          "iy": "0xD00080",
          "af": "0x0042",
          "bc": "0x020104",
          "de": "0x000240",
          "hl": "0x000000",
          "flags": {
            "z": true,
            "c": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0x000000",
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
            "IX-3": "0x020104",
            "IX+0": "0xD1A866",
            "IX+3": "0x006512",
            "IX+6": "0x020104",
            "IX+9": "0x000000"
          }
        }
      },
      {
        "blockIndex": 20452,
        "postExitBlock": 12,
        "pc": "0x006512",
        "previousPc": "0x006D68",
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A86C",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D0259D": "0x000000"
        },
        "cpu": {
          "pc": "0x006512",
          "currentBlockPc": "0x006512",
          "sp": "0xD1A837",
          "ix": "0xD1A866",
          "iy": "0xD00080",
          "af": "0x0042",
          "bc": "0x020104",
          "de": "0x000240",
          "hl": "0x000000",
          "flags": {
            "z": true,
            "c": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0x000000",
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
            "IX-6": "0x000104",
            "IX-3": "0x09D7BE",
            "IX+0": "0xD1A878",
            "IX+3": "0x013968",
            "IX+6": "0x020000",
            "IX+9": "0xD00080"
          }
        }
      },
      {
        "blockIndex": 20453,
        "postExitBlock": 13,
        "pc": "0x0017DD",
        "previousPc": "0x006512",
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A86C",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D0259D": "0x000000"
        },
        "cpu": {
          "pc": "0x0017DD",
          "currentBlockPc": "0x0017DD",
          "sp": "0xD1A83A",
          "ix": "0xD1A866",
          "iy": "0xD00080",
          "af": "0x0042",
          "bc": "0x000000",
          "de": "0x000240",
          "hl": "0x001204",
          "flags": {
            "z": true,
            "c": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0x000000",
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
            "IX-6": "0x000104",
            "IX-3": "0x09D7BE",
            "IX+0": "0xD1A878",
            "IX+3": "0x013968",
            "IX+6": "0x020000",
            "IX+9": "0xD00080"
          }
        }
      },
      {
        "blockIndex": 20454,
        "postExitBlock": 14,
        "pc": "0x0059C6",
        "previousPc": "0x0017DD",
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A86C",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D0259D": "0x000000"
        },
        "cpu": {
          "pc": "0x0059C6",
          "currentBlockPc": "0x0059C6",
          "sp": "0xD1A834",
          "ix": "0xD1A866",
          "iy": "0xD00080",
          "af": "0x5C00",
          "bc": "0x000000",
          "de": "0x000240",
          "hl": "0x0017DC",
          "flags": {
            "z": false,
            "c": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0x000000",
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
            "IX-6": "0x000104",
            "IX-3": "0x09D7BE",
            "IX+0": "0xD1A878",
            "IX+3": "0x013968",
            "IX+6": "0x020000",
            "IX+9": "0xD00080"
          }
        }
      },
      {
        "blockIndex": 20455,
        "postExitBlock": 15,
        "pc": "0x0059D6",
        "previousPc": "0x0059C6",
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A86C",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D0259D": "0x000000"
        },
        "cpu": {
          "pc": "0x0059D6",
          "currentBlockPc": "0x0059D6",
          "sp": "0xD1A82E",
          "ix": "0xD1A866",
          "iy": "0xD00080",
          "af": "0x5C87",
          "bc": "0x000000",
          "de": "0x000240",
          "hl": "0x0017DC",
          "flags": {
            "z": false,
            "c": true
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0x000000",
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
            "IX-6": "0x000104",
            "IX-3": "0x09D7BE",
            "IX+0": "0xD1A878",
            "IX+3": "0x013968",
            "IX+6": "0x020000",
            "IX+9": "0xD00080"
          }
        }
      },
      {
        "blockIndex": 20456,
        "postExitBlock": 16,
        "pc": "0x005A75",
        "previousPc": "0x0059D6",
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A86C",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D0259D": "0x000000"
        },
        "cpu": {
          "pc": "0x005A75",
          "currentBlockPc": "0x005A75",
          "sp": "0xD1A82B",
          "ix": "0xD1A866",
          "iy": "0xD00080",
          "af": "0x5C87",
          "bc": "0x000000",
          "de": "0x000240",
          "hl": "0x0017DC",
          "flags": {
            "z": false,
            "c": true
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0x000000",
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
            "IX-6": "0x000104",
            "IX-3": "0x09D7BE",
            "IX+0": "0xD1A878",
            "IX+3": "0x013968",
            "IX+6": "0x020000",
            "IX+9": "0xD00080"
          }
        }
      },
      {
        "blockIndex": 20457,
        "postExitBlock": 17,
        "pc": "0x005A82",
        "previousPc": "0x005A75",
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A86C",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D0259D": "0x000000"
        },
        "cpu": {
          "pc": "0x005A82",
          "currentBlockPc": "0x005A82",
          "sp": "0xD1A81C",
          "ix": "0xD1A866",
          "iy": "0xD00080",
          "af": "0x5C23",
          "bc": "0x000000",
          "de": "0x000240",
          "hl": "0x0017DC",
          "flags": {
            "z": false,
            "c": true
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0x000000",
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
            "IX-6": "0x000104",
            "IX-3": "0x09D7BE",
            "IX+0": "0xD1A878",
            "IX+3": "0x013968",
            "IX+6": "0x020000",
            "IX+9": "0xD00080"
          }
        }
      },
      {
        "blockIndex": 20458,
        "postExitBlock": 18,
        "pc": "0x00596E",
        "previousPc": "0x005A82",
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A86C",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D0259D": "0x000000"
        },
        "cpu": {
          "pc": "0x00596E",
          "currentBlockPc": "0x00596E",
          "sp": "0xD1A819",
          "ix": "0xD1A866",
          "iy": "0xD00080",
          "af": "0x5C23",
          "bc": "0x000000",
          "de": "0x000240",
          "hl": "0x000A10",
          "flags": {
            "z": false,
            "c": true
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0x000000",
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
            "IX-6": "0x000104",
            "IX-3": "0x09D7BE",
            "IX+0": "0xD1A878",
            "IX+3": "0x013968",
            "IX+6": "0x020000",
            "IX+9": "0xD00080"
          }
        }
      },
      {
        "blockIndex": 20459,
        "postExitBlock": 19,
        "pc": "0x001713",
        "previousPc": "0x00596E",
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A86C",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D0259D": "0x000000"
        },
        "cpu": {
          "pc": "0x001713",
          "currentBlockPc": "0x001713",
          "sp": "0xD1A810",
          "ix": "0xD1A866",
          "iy": "0xD00080",
          "af": "0x5C23",
          "bc": "0x000000",
          "de": "0x000240",
          "hl": "0x000A10",
          "flags": {
            "z": false,
            "c": true
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0x000000",
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
            "IX-6": "0x000104",
            "IX-3": "0x09D7BE",
            "IX+0": "0xD1A878",
            "IX+3": "0x013968",
            "IX+6": "0x020000",
            "IX+9": "0xD00080"
          }
        }
      },
      {
        "blockIndex": 20460,
        "postExitBlock": 20,
        "pc": "0x0008BB",
        "previousPc": "0x001713",
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A86C",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D0259D": "0x000000"
        },
        "cpu": {
          "pc": "0x0008BB",
          "currentBlockPc": "0x0008BB",
          "sp": "0xD1A80D",
          "ix": "0xD1A866",
          "iy": "0xD00080",
          "af": "0x5C23",
          "bc": "0x000000",
          "de": "0x000240",
          "hl": "0x000A10",
          "flags": {
            "z": false,
            "c": true
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0x000000",
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
            "IX-6": "0x000104",
            "IX-3": "0x09D7BE",
            "IX+0": "0xD1A878",
            "IX+3": "0x013968",
            "IX+6": "0x020000",
            "IX+9": "0xD00080"
          }
        }
      },
      {
        "blockIndex": 20461,
        "postExitBlock": 21,
        "pc": "0x001717",
        "previousPc": "0x0008BB",
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A86C",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D0259D": "0x000000"
        },
        "cpu": {
          "pc": "0x001717",
          "currentBlockPc": "0x001717",
          "sp": "0xD1A810",
          "ix": "0xD1A866",
          "iy": "0xD00080",
          "af": "0x5C4A",
          "bc": "0x00A55A",
          "de": "0x000240",
          "hl": "0x000000",
          "flags": {
            "z": true,
            "c": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0x000000",
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
            "IX-6": "0x000104",
            "IX-3": "0x09D7BE",
            "IX+0": "0xD1A878",
            "IX+3": "0x013968",
            "IX+6": "0x020000",
            "IX+9": "0xD00080"
          }
        }
      },
      {
        "blockIndex": 20462,
        "postExitBlock": 22,
        "pc": "0x001718",
        "previousPc": "0x001717",
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A86C",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D0259D": "0x000000"
        },
        "cpu": {
          "pc": "0x001718",
          "currentBlockPc": "0x001718",
          "sp": "0xD1A810",
          "ix": "0xD1A866",
          "iy": "0xD00080",
          "af": "0x5C4A",
          "bc": "0x00A55A",
          "de": "0x000240",
          "hl": "0x000000",
          "flags": {
            "z": true,
            "c": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0x000000",
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
            "IX-6": "0x000104",
            "IX-3": "0x09D7BE",
            "IX+0": "0xD1A878",
            "IX+3": "0x013968",
            "IX+6": "0x020000",
            "IX+9": "0xD00080"
          }
        }
      },
      {
        "blockIndex": 20463,
        "postExitBlock": 23,
        "pc": "0x005974",
        "previousPc": "0x001718",
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A86C",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D0259D": "0x000000"
        },
        "cpu": {
          "pc": "0x005974",
          "currentBlockPc": "0x005974",
          "sp": "0xD1A813",
          "ix": "0xD1A866",
          "iy": "0xD00080",
          "af": "0x7F28",
          "bc": "0x00A55A",
          "de": "0x000240",
          "hl": "0x000000",
          "flags": {
            "z": false,
            "c": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0x000000",
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
            "IX-6": "0x000104",
            "IX-3": "0x09D7BE",
            "IX+0": "0xD1A878",
            "IX+3": "0x013968",
            "IX+6": "0x020000",
            "IX+9": "0xD00080"
          }
        }
      },
      {
        "blockIndex": 20464,
        "postExitBlock": 24,
        "pc": "0x005998",
        "previousPc": "0x005974",
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A86C",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D0259D": "0x000000"
        },
        "cpu": {
          "pc": "0x005998",
          "currentBlockPc": "0x005998",
          "sp": "0xD1A816",
          "ix": "0xD1A866",
          "iy": "0xD00080",
          "af": "0x7F28",
          "bc": "0x00A55A",
          "de": "0x000240",
          "hl": "0x000A10",
          "flags": {
            "z": false,
            "c": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0x000000",
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
            "IX-6": "0x000104",
            "IX-3": "0x09D7BE",
            "IX+0": "0xD1A878",
            "IX+3": "0x013968",
            "IX+6": "0x020000",
            "IX+9": "0xD00080"
          }
        }
      },
      {
        "blockIndex": 20465,
        "postExitBlock": 25,
        "pc": "0x005A8B",
        "previousPc": "0x005998",
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A86C",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D0259D": "0x000000"
        },
        "cpu": {
          "pc": "0x005A8B",
          "currentBlockPc": "0x005A8B",
          "sp": "0xD1A81C",
          "ix": "0xD1A866",
          "iy": "0xD00080",
          "af": "0x5C24",
          "bc": "0xFFFFFC",
          "de": "0xD005C5",
          "hl": "0xD005A1",
          "flags": {
            "z": false,
            "c": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0x000000",
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
            "IX-6": "0x000104",
            "IX-3": "0x09D7BE",
            "IX+0": "0xD1A878",
            "IX+3": "0x013968",
            "IX+6": "0x020000",
            "IX+9": "0xD00080"
          }
        }
      },
      {
        "blockIndex": 20466,
        "postExitBlock": 26,
        "pc": "0x005A48",
        "previousPc": "0x005A8B",
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A86C",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D0259D": "0x000000"
        },
        "cpu": {
          "pc": "0x005A48",
          "currentBlockPc": "0x005A48",
          "sp": "0xD1A819",
          "ix": "0xD005A1",
          "iy": "0xD00080",
          "af": "0x0424",
          "bc": "0xFFFFFC",
          "de": "0xD005C5",
          "hl": "0xD005A1",
          "flags": {
            "z": false,
            "c": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0x000000",
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
            "IX-6": "0x00DA00",
            "IX-3": "0x850000",
            "IX+0": "0x000000",
            "IX+3": "0x000000",
            "IX+6": "0xC00080",
            "IX+9": "0x00E000"
          }
        }
      },
      {
        "blockIndex": 20467,
        "postExitBlock": 27,
        "pc": "0x005A96",
        "previousPc": "0x005A48",
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A86C",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D0259D": "0x000000"
        },
        "cpu": {
          "pc": "0x005A96",
          "currentBlockPc": "0x005A96",
          "sp": "0xD1A81C",
          "ix": "0xD005A1",
          "iy": "0xD00080",
          "af": "0x7520",
          "bc": "0xFFFFFC",
          "de": "0xD005C5",
          "hl": "0xD005A1",
          "flags": {
            "z": false,
            "c": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0x000000",
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
            "IX-6": "0x00DA00",
            "IX-3": "0x850000",
            "IX+0": "0x000000",
            "IX+3": "0x000000",
            "IX+6": "0xC00080",
            "IX+9": "0x00E000"
          }
        }
      },
      {
        "blockIndex": 20468,
        "postExitBlock": 28,
        "pc": "0x005A53",
        "previousPc": "0x005A96",
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A86C",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D0259D": "0x000000"
        },
        "cpu": {
          "pc": "0x005A53",
          "currentBlockPc": "0x005A53",
          "sp": "0xD1A819",
          "ix": "0xD005A1",
          "iy": "0xD00080",
          "af": "0x1220",
          "bc": "0xFFFFFC",
          "de": "0xD005C5",
          "hl": "0xD005A1",
          "flags": {
            "z": false,
            "c": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0x000000",
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
            "IX-6": "0x00DA00",
            "IX-3": "0x750000",
            "IX+0": "0x000000",
            "IX+3": "0x000000",
            "IX+6": "0xC00080",
            "IX+9": "0x00E000"
          }
        }
      },
      {
        "blockIndex": 20469,
        "postExitBlock": 29,
        "pc": "0x005AA2",
        "previousPc": "0x005A53",
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A86C",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D0259D": "0x000000"
        },
        "cpu": {
          "pc": "0x005AA2",
          "currentBlockPc": "0x005AA2",
          "sp": "0xD1A81C",
          "ix": "0xD005A1",
          "iy": "0xD00080",
          "af": "0xDA88",
          "bc": "0xFFFFFC",
          "de": "0xD005C5",
          "hl": "0x0000DA",
          "flags": {
            "z": false,
            "c": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0x000000",
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
            "IX-6": "0x00DA00",
            "IX-3": "0x750000",
            "IX+0": "0x000000",
            "IX+3": "0x000000",
            "IX+6": "0xC00080",
            "IX+9": "0x00E000"
          }
        }
      },
      {
        "blockIndex": 20470,
        "postExitBlock": 30,
        "pc": "0x005AAE",
        "previousPc": "0x005AA2",
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A86C",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D0259D": "0x000000"
        },
        "cpu": {
          "pc": "0x005AAE",
          "currentBlockPc": "0x005AAE",
          "sp": "0xD1A81C",
          "ix": "0xD005A1",
          "iy": "0xD00080",
          "af": "0xDA5C",
          "bc": "0xFFFFFC",
          "de": "0xD0050C",
          "hl": "0x0000DA",
          "flags": {
            "z": true,
            "c": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0x000000",
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
            "IX-6": "0x00DA00",
            "IX-3": "0x750000",
            "IX+0": "0x000000",
            "IX+3": "0x000000",
            "IX+6": "0xC00080",
            "IX+9": "0x00E000"
          }
        }
      },
      {
        "blockIndex": 20471,
        "postExitBlock": 31,
        "pc": "0x005AE8",
        "previousPc": "0x005AAE",
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A86C",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D0259D": "0x000000"
        },
        "cpu": {
          "pc": "0x005AE8",
          "currentBlockPc": "0x005AE8",
          "sp": "0xD1A81C",
          "ix": "0xD005A2",
          "iy": "0xD00080",
          "af": "0x005C",
          "bc": "0xFF10FC",
          "de": "0xD40000",
          "hl": "0xD52634",
          "flags": {
            "z": true,
            "c": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0x000000",
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
            "IX-6": "0x0000DA",
            "IX-3": "0x007500",
            "IX+0": "0x000000",
            "IX+3": "0x800000",
            "IX+6": "0x00C000",
            "IX+9": "0x7000E0"
          }
        }
      },
      {
        "blockIndex": 20472,
        "postExitBlock": 32,
        "pc": "0x005B16",
        "previousPc": "0x005AE8",
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A86C",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D0259D": "0x000000"
        },
        "cpu": {
          "pc": "0x005B16",
          "currentBlockPc": "0x005B16",
          "sp": "0xD1A819",
          "ix": "0xD005A2",
          "iy": "0xD00080",
          "af": "0x005C",
          "bc": "0xFF0500",
          "de": "0x0000FF",
          "hl": "0xD52634",
          "flags": {
            "z": true,
            "c": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0x000000",
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
            "IX-6": "0x0000DA",
            "IX-3": "0x007500",
            "IX+0": "0x000000",
            "IX+3": "0x800000",
            "IX+6": "0x00C000",
            "IX+9": "0x7000E0"
          }
        }
      },
      {
        "blockIndex": 20473,
        "postExitBlock": 33,
        "pc": "0x005B4B",
        "previousPc": "0x005B16",
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A86C",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D0259D": "0x000000"
        },
        "cpu": {
          "pc": "0x005B4B",
          "currentBlockPc": "0x005B4B",
          "sp": "0xD1A819",
          "ix": "0xD005A3",
          "iy": "0xD00080",
          "af": "0x007C",
          "bc": "0xFF0500",
          "de": "0x0000FF",
          "hl": "0xD5263E",
          "flags": {
            "z": true,
            "c": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0x000000",
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
            "IX-3": "0x000075",
            "IX+0": "0x000000",
            "IX+3": "0x008000",
            "IX+6": "0xE000C0",
            "IX+9": "0x007000"
          }
        }
      },
      {
        "blockIndex": 20474,
        "postExitBlock": 34,
        "pc": "0x005AB6",
        "previousPc": "0x005B4B",
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A86C",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D0259D": "0x000000"
        },
        "cpu": {
          "pc": "0x005AB6",
          "currentBlockPc": "0x005AB6",
          "sp": "0xD1A81C",
          "ix": "0xD005A3",
          "iy": "0xD00080",
          "af": "0xFF1A",
          "bc": "0xFF0F05",
          "de": "0x0000FF",
          "hl": "0xD005A0",
          "flags": {
            "z": false,
            "c": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0x000000",
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
            "IX-3": "0x000076",
            "IX+0": "0x000000",
            "IX+3": "0x008000",
            "IX+6": "0xE000C0",
            "IX+9": "0x007000"
          }
        }
      },
      {
        "blockIndex": 20475,
        "postExitBlock": 35,
        "pc": "0x005AE8",
        "previousPc": "0x005AB6",
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A86C",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D0259D": "0x000000"
        },
        "cpu": {
          "pc": "0x005AE8",
          "currentBlockPc": "0x005AE8",
          "sp": "0xD1A81C",
          "ix": "0xD005A4",
          "iy": "0xD00080",
          "af": "0x005C",
          "bc": "0xFF0F05",
          "de": "0xD40000",
          "hl": "0xD528B4",
          "flags": {
            "z": true,
            "c": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0x000000",
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
            "IX-6": "0x760000",
            "IX-3": "0x000000",
            "IX+0": "0x000000",
            "IX+3": "0xC00080",
            "IX+6": "0x00E000",
            "IX+9": "0x380070"
          }
        }
      },
      {
        "blockIndex": 20476,
        "postExitBlock": 36,
        "pc": "0x005B16",
        "previousPc": "0x005AE8",
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A86C",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D0259D": "0x000000"
        },
        "cpu": {
          "pc": "0x005B16",
          "currentBlockPc": "0x005B16",
          "sp": "0xD1A819",
          "ix": "0xD005A4",
          "iy": "0xD00080",
          "af": "0x005C",
          "bc": "0xFF0500",
          "de": "0x0000FF",
          "hl": "0xD528B4",
          "flags": {
            "z": true,
            "c": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0x000000",
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
            "IX-6": "0x760000",
            "IX-3": "0x000000",
            "IX+0": "0x000000",
            "IX+3": "0xC00080",
            "IX+6": "0x00E000",
            "IX+9": "0x380070"
          }
        }
      },
      {
        "blockIndex": 20477,
        "postExitBlock": 37,
        "pc": "0x005B4B",
        "previousPc": "0x005B16",
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A86C",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D0259D": "0x000000"
        },
        "cpu": {
          "pc": "0x005B4B",
          "currentBlockPc": "0x005B4B",
          "sp": "0xD1A819",
          "ix": "0xD005A5",
          "iy": "0xD00080",
          "af": "0x007C",
          "bc": "0xFF0500",
          "de": "0x0000FF",
          "hl": "0xD528BE",
          "flags": {
            "z": true,
            "c": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0x000000",
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
            "IX-6": "0x007600",
            "IX-3": "0x000000",
            "IX+0": "0x800000",
            "IX+3": "0x00C000",
            "IX+6": "0x7000E0",
            "IX+9": "0x003800"
          }
        }
      },
      {
        "blockIndex": 20478,
        "postExitBlock": 38,
        "pc": "0x005AB6",
        "previousPc": "0x005B4B",
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A86C",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D0259D": "0x000000"
        },
        "cpu": {
          "pc": "0x005AB6",
          "currentBlockPc": "0x005AB6",
          "sp": "0xD1A81C",
          "ix": "0xD005A5",
          "iy": "0xD00080",
          "af": "0xFF0A",
          "bc": "0xFF0E05",
          "de": "0x0000FF",
          "hl": "0xD005A0",
          "flags": {
            "z": false,
            "c": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0x000000",
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
            "IX-6": "0x007700",
            "IX-3": "0x000000",
            "IX+0": "0x800000",
            "IX+3": "0x00C000",
            "IX+6": "0x7000E0",
            "IX+9": "0x003800"
          }
        }
      },
      {
        "blockIndex": 20479,
        "postExitBlock": 39,
        "pc": "0x005AE8",
        "previousPc": "0x005AB6",
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A86C",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D0259D": "0x000000"
        },
        "cpu": {
          "pc": "0x005AE8",
          "currentBlockPc": "0x005AE8",
          "sp": "0xD1A81C",
          "ix": "0xD005A6",
          "iy": "0xD00080",
          "af": "0x005C",
          "bc": "0xFF0E05",
          "de": "0xD40000",
          "hl": "0xD52B34",
          "flags": {
            "z": true,
            "c": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0x000000",
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
            "IX-6": "0x000077",
            "IX-3": "0x000000",
            "IX+0": "0x008000",
            "IX+3": "0xE000C0",
            "IX+6": "0x007000",
            "IX+9": "0x180038"
          }
        }
      },
      {
        "blockIndex": 20480,
        "postExitBlock": 40,
        "pc": "0x005B16",
        "previousPc": "0x005AE8",
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A86C",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D0259D": "0x000000"
        },
        "cpu": {
          "pc": "0x005B16",
          "currentBlockPc": "0x005B16",
          "sp": "0xD1A819",
          "ix": "0xD005A6",
          "iy": "0xD00080",
          "af": "0x005C",
          "bc": "0xFF0500",
          "de": "0x0000FF",
          "hl": "0xD52B34",
          "flags": {
            "z": true,
            "c": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0x000000",
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
            "IX-6": "0x000077",
            "IX-3": "0x000000",
            "IX+0": "0x008000",
            "IX+3": "0xE000C0",
            "IX+6": "0x007000",
            "IX+9": "0x180038"
          }
        }
      },
      {
        "blockIndex": 20481,
        "postExitBlock": 41,
        "pc": "0x005B4B",
        "previousPc": "0x005B16",
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A86C",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D0259D": "0x000000"
        },
        "cpu": {
          "pc": "0x005B4B",
          "currentBlockPc": "0x005B4B",
          "sp": "0xD1A819",
          "ix": "0xD005A7",
          "iy": "0xD00080",
          "af": "0x007C",
          "bc": "0xFF0500",
          "de": "0x0000FF",
          "hl": "0xD52B3E",
          "flags": {
            "z": true,
            "c": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0x000000",
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
            "IX-3": "0x000000",
            "IX+0": "0xC00080",
            "IX+3": "0x00E000",
            "IX+6": "0x380070",
            "IX+9": "0x801800"
          }
        }
      },
      {
        "blockIndex": 20482,
        "postExitBlock": 42,
        "pc": "0x005AB6",
        "previousPc": "0x005B4B",
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A86C",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D0259D": "0x000000"
        },
        "cpu": {
          "pc": "0x005AB6",
          "currentBlockPc": "0x005AB6",
          "sp": "0xD1A81C",
          "ix": "0xD005A7",
          "iy": "0xD00080",
          "af": "0xFF0A",
          "bc": "0xFF0D05",
          "de": "0x0000FF",
          "hl": "0xD005A0",
          "flags": {
            "z": false,
            "c": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0x000000",
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
            "IX-3": "0x000000",
            "IX+0": "0xC00080",
            "IX+3": "0x00E000",
            "IX+6": "0x380070",
            "IX+9": "0x801800"
          }
        }
      },
      {
        "blockIndex": 20483,
        "postExitBlock": 43,
        "pc": "0x005AE8",
        "previousPc": "0x005AB6",
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A86C",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D0259D": "0x000000"
        },
        "cpu": {
          "pc": "0x005AE8",
          "currentBlockPc": "0x005AE8",
          "sp": "0xD1A81C",
          "ix": "0xD005A8",
          "iy": "0xD00080",
          "af": "0x805C",
          "bc": "0xFF0D05",
          "de": "0xD40000",
          "hl": "0xD52DB4",
          "flags": {
            "z": true,
            "c": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0x000000",
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
            "IX-3": "0x800000",
            "IX+0": "0x00C000",
            "IX+3": "0x7000E0",
            "IX+6": "0x003800",
            "IX+9": "0x088018"
          }
        }
      },
      {
        "blockIndex": 20484,
        "postExitBlock": 44,
        "pc": "0x005B16",
        "previousPc": "0x005AE8",
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A86C",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D0259D": "0x000000"
        },
        "cpu": {
          "pc": "0x005B16",
          "currentBlockPc": "0x005B16",
          "sp": "0xD1A819",
          "ix": "0xD005A8",
          "iy": "0xD00080",
          "af": "0x805C",
          "bc": "0xFF0580",
          "de": "0x0000FF",
          "hl": "0xD52DB4",
          "flags": {
            "z": true,
            "c": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0x000000",
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
            "IX-3": "0x800000",
            "IX+0": "0x00C000",
            "IX+3": "0x7000E0",
            "IX+6": "0x003800",
            "IX+9": "0x088018"
          }
        }
      },
      {
        "blockIndex": 20485,
        "postExitBlock": 45,
        "pc": "0x005B4B",
        "previousPc": "0x005B16",
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A86C",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D0259D": "0x000000"
        },
        "cpu": {
          "pc": "0x005B4B",
          "currentBlockPc": "0x005B4B",
          "sp": "0xD1A819",
          "ix": "0xD005A9",
          "iy": "0xD00080",
          "af": "0x007C",
          "bc": "0xFF0500",
          "de": "0x0000FF",
          "hl": "0xD52DBE",
          "flags": {
            "z": true,
            "c": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0x000000",
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
            "IX-3": "0x008000",
            "IX+0": "0xE000C0",
            "IX+3": "0x007000",
            "IX+6": "0x180038",
            "IX+9": "0xC00880"
          }
        }
      },
      {
        "blockIndex": 20486,
        "postExitBlock": 46,
        "pc": "0x005AB6",
        "previousPc": "0x005B4B",
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A86C",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D0259D": "0x000000"
        },
        "cpu": {
          "pc": "0x005AB6",
          "currentBlockPc": "0x005AB6",
          "sp": "0xD1A81C",
          "ix": "0xD005A9",
          "iy": "0xD00080",
          "af": "0xFF0A",
          "bc": "0xFF0C05",
          "de": "0x0000FF",
          "hl": "0xD005A0",
          "flags": {
            "z": false,
            "c": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0x000000",
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
            "IX-3": "0x008000",
            "IX+0": "0xE000C0",
            "IX+3": "0x007000",
            "IX+6": "0x180038",
            "IX+9": "0xC00880"
          }
        }
      },
      {
        "blockIndex": 20487,
        "postExitBlock": 47,
        "pc": "0x005AE8",
        "previousPc": "0x005AB6",
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A86C",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D0259D": "0x000000"
        },
        "cpu": {
          "pc": "0x005AE8",
          "currentBlockPc": "0x005AE8",
          "sp": "0xD1A81C",
          "ix": "0xD005AA",
          "iy": "0xD00080",
          "af": "0xC05C",
          "bc": "0xFF0C05",
          "de": "0xD40000",
          "hl": "0xD53034",
          "flags": {
            "z": true,
            "c": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0x000000",
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
            "IX-3": "0xC00080",
            "IX+0": "0x00E000",
            "IX+3": "0x380070",
            "IX+6": "0x801800",
            "IX+9": "0x00C008"
          }
        }
      },
      {
        "blockIndex": 20488,
        "postExitBlock": 48,
        "pc": "0x005B16",
        "previousPc": "0x005AE8",
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A86C",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D0259D": "0x000000"
        },
        "cpu": {
          "pc": "0x005B16",
          "currentBlockPc": "0x005B16",
          "sp": "0xD1A819",
          "ix": "0xD005AA",
          "iy": "0xD00080",
          "af": "0xC05C",
          "bc": "0xFF05C0",
          "de": "0x0000FF",
          "hl": "0xD53034",
          "flags": {
            "z": true,
            "c": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0x000000",
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
            "IX-3": "0xC00080",
            "IX+0": "0x00E000",
            "IX+3": "0x380070",
            "IX+6": "0x801800",
            "IX+9": "0x00C008"
          }
        }
      },
      {
        "blockIndex": 20489,
        "postExitBlock": 49,
        "pc": "0x005B4B",
        "previousPc": "0x005B16",
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A86C",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D0259D": "0x000000"
        },
        "cpu": {
          "pc": "0x005B4B",
          "currentBlockPc": "0x005B4B",
          "sp": "0xD1A819",
          "ix": "0xD005AB",
          "iy": "0xD00080",
          "af": "0x007C",
          "bc": "0xFF0500",
          "de": "0x0000FF",
          "hl": "0xD5303E",
          "flags": {
            "z": true,
            "c": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0x000000",
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
            "IX-6": "0x800000",
            "IX-3": "0x00C000",
            "IX+0": "0x7000E0",
            "IX+3": "0x003800",
            "IX+6": "0x088018",
            "IX+9": "0xE000C0"
          }
        }
      },
      {
        "blockIndex": 20490,
        "postExitBlock": 50,
        "pc": "0x005AB6",
        "previousPc": "0x005B4B",
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A86C",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D0259D": "0x000000"
        },
        "cpu": {
          "pc": "0x005AB6",
          "currentBlockPc": "0x005AB6",
          "sp": "0xD1A81C",
          "ix": "0xD005AB",
          "iy": "0xD00080",
          "af": "0xFF0A",
          "bc": "0xFF0B05",
          "de": "0x0000FF",
          "hl": "0xD005A0",
          "flags": {
            "z": false,
            "c": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0x000000",
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
            "IX-6": "0x800000",
            "IX-3": "0x00C000",
            "IX+0": "0x7000E0",
            "IX+3": "0x003800",
            "IX+6": "0x088018",
            "IX+9": "0xE000C0"
          }
        }
      },
      {
        "blockIndex": 20491,
        "postExitBlock": 51,
        "pc": "0x005AE8",
        "previousPc": "0x005AB6",
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A86C",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D0259D": "0x000000"
        },
        "cpu": {
          "pc": "0x005AE8",
          "currentBlockPc": "0x005AE8",
          "sp": "0xD1A81C",
          "ix": "0xD005AC",
          "iy": "0xD00080",
          "af": "0xE05C",
          "bc": "0xFF0B05",
          "de": "0xD40000",
          "hl": "0xD532B4",
          "flags": {
            "z": true,
            "c": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0x000000",
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
            "IX-6": "0x008000",
            "IX-3": "0xE000C0",
            "IX+0": "0x007000",
            "IX+3": "0x180038",
            "IX+6": "0xC00880",
            "IX+9": "0x00E000"
          }
        }
      },
      {
        "blockIndex": 20492,
        "postExitBlock": 52,
        "pc": "0x005B16",
        "previousPc": "0x005AE8",
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A86C",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D0259D": "0x000000"
        },
        "cpu": {
          "pc": "0x005B16",
          "currentBlockPc": "0x005B16",
          "sp": "0xD1A819",
          "ix": "0xD005AC",
          "iy": "0xD00080",
          "af": "0xE05C",
          "bc": "0xFF05E0",
          "de": "0x0000FF",
          "hl": "0xD532B4",
          "flags": {
            "z": true,
            "c": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0x000000",
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
            "IX-6": "0x008000",
            "IX-3": "0xE000C0",
            "IX+0": "0x007000",
            "IX+3": "0x180038",
            "IX+6": "0xC00880",
            "IX+9": "0x00E000"
          }
        }
      },
      {
        "blockIndex": 20493,
        "postExitBlock": 53,
        "pc": "0x005B4B",
        "previousPc": "0x005B16",
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A86C",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D0259D": "0x000000"
        },
        "cpu": {
          "pc": "0x005B4B",
          "currentBlockPc": "0x005B4B",
          "sp": "0xD1A819",
          "ix": "0xD005AD",
          "iy": "0xD00080",
          "af": "0x007C",
          "bc": "0xFF0500",
          "de": "0x0000FF",
          "hl": "0xD532BE",
          "flags": {
            "z": true,
            "c": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0x000000",
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
            "IX-6": "0xC00080",
            "IX-3": "0x00E000",
            "IX+0": "0x380070",
            "IX+3": "0x801800",
            "IX+6": "0x00C008",
            "IX+9": "0x7000E0"
          }
        }
      },
      {
        "blockIndex": 20494,
        "postExitBlock": 54,
        "pc": "0x005AB6",
        "previousPc": "0x005B4B",
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A86C",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D0259D": "0x000000"
        },
        "cpu": {
          "pc": "0x005AB6",
          "currentBlockPc": "0x005AB6",
          "sp": "0xD1A81C",
          "ix": "0xD005AD",
          "iy": "0xD00080",
          "af": "0xFF0A",
          "bc": "0xFF0A05",
          "de": "0x0000FF",
          "hl": "0xD005A0",
          "flags": {
            "z": false,
            "c": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0x000000",
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
            "IX-6": "0xC00080",
            "IX-3": "0x00E000",
            "IX+0": "0x380070",
            "IX+3": "0x801800",
            "IX+6": "0x00C008",
            "IX+9": "0x7000E0"
          }
        }
      },
      {
        "blockIndex": 20495,
        "postExitBlock": 55,
        "pc": "0x005AE8",
        "previousPc": "0x005AB6",
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A86C",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D0259D": "0x000000"
        },
        "cpu": {
          "pc": "0x005AE8",
          "currentBlockPc": "0x005AE8",
          "sp": "0xD1A81C",
          "ix": "0xD005AE",
          "iy": "0xD00080",
          "af": "0x705C",
          "bc": "0xFF0A05",
          "de": "0xD40000",
          "hl": "0xD53534",
          "flags": {
            "z": true,
            "c": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0x000000",
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
            "IX-6": "0x00C000",
            "IX-3": "0x7000E0",
            "IX+0": "0x003800",
            "IX+3": "0x088018",
            "IX+6": "0xE000C0",
            "IX+9": "0x007000"
          }
        }
      },
      {
        "blockIndex": 20496,
        "postExitBlock": 56,
        "pc": "0x005B16",
        "previousPc": "0x005AE8",
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A86C",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D0259D": "0x000000"
        },
        "cpu": {
          "pc": "0x005B16",
          "currentBlockPc": "0x005B16",
          "sp": "0xD1A819",
          "ix": "0xD005AE",
          "iy": "0xD00080",
          "af": "0x705C",
          "bc": "0xFF0570",
          "de": "0x0000FF",
          "hl": "0xD53534",
          "flags": {
            "z": true,
            "c": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0x000000",
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
            "IX-6": "0x00C000",
            "IX-3": "0x7000E0",
            "IX+0": "0x003800",
            "IX+3": "0x088018",
            "IX+6": "0xE000C0",
            "IX+9": "0x007000"
          }
        }
      },
      {
        "blockIndex": 20497,
        "postExitBlock": 57,
        "pc": "0x005B4B",
        "previousPc": "0x005B16",
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A86C",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D0259D": "0x000000"
        },
        "cpu": {
          "pc": "0x005B4B",
          "currentBlockPc": "0x005B4B",
          "sp": "0xD1A819",
          "ix": "0xD005AF",
          "iy": "0xD00080",
          "af": "0x007C",
          "bc": "0xFF0500",
          "de": "0x0000FF",
          "hl": "0xD5353E",
          "flags": {
            "z": true,
            "c": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0x000000",
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
            "IX-6": "0xE000C0",
            "IX-3": "0x007000",
            "IX+0": "0x180038",
            "IX+3": "0xC00880",
            "IX+6": "0x00E000",
            "IX+9": "0x380070"
          }
        }
      },
      {
        "blockIndex": 20498,
        "postExitBlock": 58,
        "pc": "0x005AB6",
        "previousPc": "0x005B4B",
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A86C",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D0259D": "0x000000"
        },
        "cpu": {
          "pc": "0x005AB6",
          "currentBlockPc": "0x005AB6",
          "sp": "0xD1A81C",
          "ix": "0xD005AF",
          "iy": "0xD00080",
          "af": "0xFF0A",
          "bc": "0xFF0905",
          "de": "0x0000FF",
          "hl": "0xD005A0",
          "flags": {
            "z": false,
            "c": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0x000000",
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
            "IX-6": "0xE000C0",
            "IX-3": "0x007000",
            "IX+0": "0x180038",
            "IX+3": "0xC00880",
            "IX+6": "0x00E000",
            "IX+9": "0x380070"
          }
        }
      },
      {
        "blockIndex": 20499,
        "postExitBlock": 59,
        "pc": "0x005AE8",
        "previousPc": "0x005AB6",
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A86C",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D0259D": "0x000000"
        },
        "cpu": {
          "pc": "0x005AE8",
          "currentBlockPc": "0x005AE8",
          "sp": "0xD1A81C",
          "ix": "0xD005B0",
          "iy": "0xD00080",
          "af": "0x385C",
          "bc": "0xFF0905",
          "de": "0xD40000",
          "hl": "0xD537B4",
          "flags": {
            "z": true,
            "c": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0x000000",
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
            "IX-6": "0x00E000",
            "IX-3": "0x380070",
            "IX+0": "0x801800",
            "IX+3": "0x00C008",
            "IX+6": "0x7000E0",
            "IX+9": "0x003800"
          }
        }
      },
      {
        "blockIndex": 20500,
        "postExitBlock": 60,
        "pc": "0x005B16",
        "previousPc": "0x005AE8",
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A86C",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D0259D": "0x000000"
        },
        "cpu": {
          "pc": "0x005B16",
          "currentBlockPc": "0x005B16",
          "sp": "0xD1A819",
          "ix": "0xD005B0",
          "iy": "0xD00080",
          "af": "0x385C",
          "bc": "0xFF0538",
          "de": "0x0000FF",
          "hl": "0xD537B4",
          "flags": {
            "z": true,
            "c": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0x000000",
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
            "IX-6": "0x00E000",
            "IX-3": "0x380070",
            "IX+0": "0x801800",
            "IX+3": "0x00C008",
            "IX+6": "0x7000E0",
            "IX+9": "0x003800"
          }
        }
      },
      {
        "blockIndex": 20501,
        "postExitBlock": 61,
        "pc": "0x005B4B",
        "previousPc": "0x005B16",
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A86C",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D0259D": "0x000000"
        },
        "cpu": {
          "pc": "0x005B4B",
          "currentBlockPc": "0x005B4B",
          "sp": "0xD1A819",
          "ix": "0xD005B1",
          "iy": "0xD00080",
          "af": "0x0055",
          "bc": "0xFF0500",
          "de": "0x0000FF",
          "hl": "0xD537BE",
          "flags": {
            "z": true,
            "c": true
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0x000000",
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
            "IX-6": "0x7000E0",
            "IX-3": "0x003800",
            "IX+0": "0x088018",
            "IX+3": "0xE000C0",
            "IX+6": "0x007000",
            "IX+9": "0x180038"
          }
        }
      },
      {
        "blockIndex": 20502,
        "postExitBlock": 62,
        "pc": "0x005AB6",
        "previousPc": "0x005B4B",
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A86C",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D0259D": "0x000000"
        },
        "cpu": {
          "pc": "0x005AB6",
          "currentBlockPc": "0x005AB6",
          "sp": "0xD1A81C",
          "ix": "0xD005B1",
          "iy": "0xD00080",
          "af": "0xFF0A",
          "bc": "0xFF0805",
          "de": "0x0000FF",
          "hl": "0xD005A0",
          "flags": {
            "z": false,
            "c": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0x000000",
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
            "IX-6": "0x7000E0",
            "IX-3": "0x003800",
            "IX+0": "0x088018",
            "IX+3": "0xE000C0",
            "IX+6": "0x007000",
            "IX+9": "0x180038"
          }
        }
      },
      {
        "blockIndex": 20503,
        "postExitBlock": 63,
        "pc": "0x005AE8",
        "previousPc": "0x005AB6",
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A86C",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D0259D": "0x000000"
        },
        "cpu": {
          "pc": "0x005AE8",
          "currentBlockPc": "0x005AE8",
          "sp": "0xD1A81C",
          "ix": "0xD005B2",
          "iy": "0xD00080",
          "af": "0x185C",
          "bc": "0xFF0805",
          "de": "0xD40000",
          "hl": "0xD53A34",
          "flags": {
            "z": true,
            "c": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0x000000",
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
            "IX-6": "0x007000",
            "IX-3": "0x180038",
            "IX+0": "0xC00880",
            "IX+3": "0x00E000",
            "IX+6": "0x380070",
            "IX+9": "0x001800"
          }
        }
      },
      {
        "blockIndex": 20504,
        "postExitBlock": 64,
        "pc": "0x005B16",
        "previousPc": "0x005AE8",
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A86C",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D0259D": "0x000000"
        },
        "cpu": {
          "pc": "0x005B16",
          "currentBlockPc": "0x005B16",
          "sp": "0xD1A819",
          "ix": "0xD005B2",
          "iy": "0xD00080",
          "af": "0x185C",
          "bc": "0xFF0518",
          "de": "0x0000FF",
          "hl": "0xD53A34",
          "flags": {
            "z": true,
            "c": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0x000000",
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
            "IX-6": "0x007000",
            "IX-3": "0x180038",
            "IX+0": "0xC00880",
            "IX+3": "0x00E000",
            "IX+6": "0x380070",
            "IX+9": "0x001800"
          }
        }
      },
      {
        "blockIndex": 20505,
        "postExitBlock": 65,
        "pc": "0x005B4B",
        "previousPc": "0x005B16",
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A86C",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D0259D": "0x000000"
        },
        "cpu": {
          "pc": "0x005B4B",
          "currentBlockPc": "0x005B4B",
          "sp": "0xD1A819",
          "ix": "0xD005B3",
          "iy": "0xD00080",
          "af": "0x8055",
          "bc": "0xFF0500",
          "de": "0x0000FF",
          "hl": "0xD53A3E",
          "flags": {
            "z": true,
            "c": true
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0x000000",
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
            "IX-6": "0x380070",
            "IX-3": "0x801800",
            "IX+0": "0x00C008",
            "IX+3": "0x7000E0",
            "IX+6": "0x003800",
            "IX+9": "0x080018"
          }
        }
      },
      {
        "blockIndex": 20506,
        "postExitBlock": 66,
        "pc": "0x005AB6",
        "previousPc": "0x005B4B",
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A86C",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D0259D": "0x000000"
        },
        "cpu": {
          "pc": "0x005AB6",
          "currentBlockPc": "0x005AB6",
          "sp": "0xD1A81C",
          "ix": "0xD005B3",
          "iy": "0xD00080",
          "af": "0xFF02",
          "bc": "0xFF0705",
          "de": "0x0000FF",
          "hl": "0xD005A0",
          "flags": {
            "z": false,
            "c": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0x000000",
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
            "IX-6": "0x380070",
            "IX-3": "0x801800",
            "IX+0": "0x00C008",
            "IX+3": "0x7000E0",
            "IX+6": "0x003800",
            "IX+9": "0x080018"
          }
        }
      },
      {
        "blockIndex": 20507,
        "postExitBlock": 67,
        "pc": "0x005AE8",
        "previousPc": "0x005AB6",
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A86C",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D0259D": "0x000000"
        },
        "cpu": {
          "pc": "0x005AE8",
          "currentBlockPc": "0x005AE8",
          "sp": "0xD1A81C",
          "ix": "0xD005B4",
          "iy": "0xD00080",
          "af": "0x0854",
          "bc": "0xFF0705",
          "de": "0xD40000",
          "hl": "0xD53CB4",
          "flags": {
            "z": true,
            "c": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0x000000",
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
            "IX-6": "0x003800",
            "IX-3": "0x088018",
            "IX+0": "0xE000C0",
            "IX+3": "0x007000",
            "IX+6": "0x180038",
            "IX+9": "0x000800"
          }
        }
      },
      {
        "blockIndex": 20508,
        "postExitBlock": 68,
        "pc": "0x005B16",
        "previousPc": "0x005AE8",
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A86C",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D0259D": "0x000000"
        },
        "cpu": {
          "pc": "0x005B16",
          "currentBlockPc": "0x005B16",
          "sp": "0xD1A819",
          "ix": "0xD005B4",
          "iy": "0xD00080",
          "af": "0x0854",
          "bc": "0xFF0508",
          "de": "0x0000FF",
          "hl": "0xD53CB4",
          "flags": {
            "z": true,
            "c": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0x000000",
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
            "IX-6": "0x003800",
            "IX-3": "0x088018",
            "IX+0": "0xE000C0",
            "IX+3": "0x007000",
            "IX+6": "0x180038",
            "IX+9": "0x000800"
          }
        }
      },
      {
        "blockIndex": 20509,
        "postExitBlock": 69,
        "pc": "0x005B4B",
        "previousPc": "0x005B16",
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A86C",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D0259D": "0x000000"
        },
        "cpu": {
          "pc": "0x005B4B",
          "currentBlockPc": "0x005B4B",
          "sp": "0xD1A819",
          "ix": "0xD005B5",
          "iy": "0xD00080",
          "af": "0xC055",
          "bc": "0xFF0500",
          "de": "0x0000FF",
          "hl": "0xD53CBE",
          "flags": {
            "z": true,
            "c": true
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0x000000",
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
            "IX-6": "0x180038",
            "IX-3": "0xC00880",
            "IX+0": "0x00E000",
            "IX+3": "0x380070",
            "IX+6": "0x001800",
            "IX+9": "0x000008"
          }
        }
      },
      {
        "blockIndex": 20510,
        "postExitBlock": 70,
        "pc": "0x005AB6",
        "previousPc": "0x005B4B",
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A86C",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D0259D": "0x000000"
        },
        "cpu": {
          "pc": "0x005AB6",
          "currentBlockPc": "0x005AB6",
          "sp": "0xD1A81C",
          "ix": "0xD005B5",
          "iy": "0xD00080",
          "af": "0xFF02",
          "bc": "0xFF0605",
          "de": "0x0000FF",
          "hl": "0xD005A0",
          "flags": {
            "z": false,
            "c": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0x000000",
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
            "IX-6": "0x180038",
            "IX-3": "0xC00880",
            "IX+0": "0x00E000",
            "IX+3": "0x380070",
            "IX+6": "0x001800",
            "IX+9": "0x000008"
          }
        }
      },
      {
        "blockIndex": 20511,
        "postExitBlock": 71,
        "pc": "0x005AE8",
        "previousPc": "0x005AB6",
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A86C",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D0259D": "0x000000"
        },
        "cpu": {
          "pc": "0x005AE8",
          "currentBlockPc": "0x005AE8",
          "sp": "0xD1A81C",
          "ix": "0xD005B6",
          "iy": "0xD00080",
          "af": "0x0054",
          "bc": "0xFF0605",
          "de": "0xD40000",
          "hl": "0xD53F34",
          "flags": {
            "z": true,
            "c": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0x000000",
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
            "IX-6": "0x801800",
            "IX-3": "0x00C008",
            "IX+0": "0x7000E0",
            "IX+3": "0x003800",
            "IX+6": "0x080018",
            "IX+9": "0x000000"
          }
        }
      },
      {
        "blockIndex": 20512,
        "postExitBlock": 72,
        "pc": "0x005B16",
        "previousPc": "0x005AE8",
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A86C",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D0259D": "0x000000"
        },
        "cpu": {
          "pc": "0x005B16",
          "currentBlockPc": "0x005B16",
          "sp": "0xD1A819",
          "ix": "0xD005B6",
          "iy": "0xD00080",
          "af": "0x0054",
          "bc": "0xFF0500",
          "de": "0x0000FF",
          "hl": "0xD53F34",
          "flags": {
            "z": true,
            "c": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0x000000",
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
            "IX-6": "0x801800",
            "IX-3": "0x00C008",
            "IX+0": "0x7000E0",
            "IX+3": "0x003800",
            "IX+6": "0x080018",
            "IX+9": "0x000000"
          }
        }
      },
      {
        "blockIndex": 20513,
        "postExitBlock": 73,
        "pc": "0x005B4B",
        "previousPc": "0x005B16",
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A86C",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D0259D": "0x000000"
        },
        "cpu": {
          "pc": "0x005B4B",
          "currentBlockPc": "0x005B4B",
          "sp": "0xD1A819",
          "ix": "0xD005B7",
          "iy": "0xD00080",
          "af": "0xE07C",
          "bc": "0xFF0500",
          "de": "0x0000FF",
          "hl": "0xD53F3E",
          "flags": {
            "z": true,
            "c": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0x000000",
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
            "IX-6": "0x088018",
            "IX-3": "0xE000C0",
            "IX+0": "0x007000",
            "IX+3": "0x180038",
            "IX+6": "0x000800",
            "IX+9": "0x000000"
          }
        }
      },
      {
        "blockIndex": 20514,
        "postExitBlock": 74,
        "pc": "0x005AB6",
        "previousPc": "0x005B4B",
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A86C",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D0259D": "0x000000"
        },
        "cpu": {
          "pc": "0x005AB6",
          "currentBlockPc": "0x005AB6",
          "sp": "0xD1A81C",
          "ix": "0xD005B7",
          "iy": "0xD00080",
          "af": "0xFF02",
          "bc": "0xFF0505",
          "de": "0x0000FF",
          "hl": "0xD005A0",
          "flags": {
            "z": false,
            "c": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0x000000",
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
            "IX-6": "0x088018",
            "IX-3": "0xE000C0",
            "IX+0": "0x007000",
            "IX+3": "0x180038",
            "IX+6": "0x000800",
            "IX+9": "0x000000"
          }
        }
      },
      {
        "blockIndex": 20515,
        "postExitBlock": 75,
        "pc": "0x005AE8",
        "previousPc": "0x005AB6",
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A86C",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D0259D": "0x000000"
        },
        "cpu": {
          "pc": "0x005AE8",
          "currentBlockPc": "0x005AE8",
          "sp": "0xD1A81C",
          "ix": "0xD005B8",
          "iy": "0xD00080",
          "af": "0x0054",
          "bc": "0xFF0505",
          "de": "0xD40000",
          "hl": "0xD541B4",
          "flags": {
            "z": true,
            "c": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0x000000",
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
            "IX-6": "0xC00880",
            "IX-3": "0x00E000",
            "IX+0": "0x380070",
            "IX+3": "0x001800",
            "IX+6": "0x000008",
            "IX+9": "0x000000"
          }
        }
      },
      {
        "blockIndex": 20516,
        "postExitBlock": 76,
        "pc": "0x005B16",
        "previousPc": "0x005AE8",
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A86C",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D0259D": "0x000000"
        },
        "cpu": {
          "pc": "0x005B16",
          "currentBlockPc": "0x005B16",
          "sp": "0xD1A819",
          "ix": "0xD005B8",
          "iy": "0xD00080",
          "af": "0x0054",
          "bc": "0xFF0500",
          "de": "0x0000FF",
          "hl": "0xD541B4",
          "flags": {
            "z": true,
            "c": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0x000000",
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
            "IX-6": "0xC00880",
            "IX-3": "0x00E000",
            "IX+0": "0x380070",
            "IX+3": "0x001800",
            "IX+6": "0x000008",
            "IX+9": "0x000000"
          }
        }
      },
      {
        "blockIndex": 20517,
        "postExitBlock": 77,
        "pc": "0x005B4B",
        "previousPc": "0x005B16",
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A86C",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D0259D": "0x000000"
        },
        "cpu": {
          "pc": "0x005B4B",
          "currentBlockPc": "0x005B4B",
          "sp": "0xD1A819",
          "ix": "0xD005B9",
          "iy": "0xD00080",
          "af": "0x707C",
          "bc": "0xFF0500",
          "de": "0x0000FF",
          "hl": "0xD541BE",
          "flags": {
            "z": true,
            "c": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0x000000",
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
            "IX-6": "0x00C008",
            "IX-3": "0x7000E0",
            "IX+0": "0x003800",
            "IX+3": "0x080018",
            "IX+6": "0x000000",
            "IX+9": "0x000000"
          }
        }
      },
      {
        "blockIndex": 20518,
        "postExitBlock": 78,
        "pc": "0x005AB6",
        "previousPc": "0x005B4B",
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A86C",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D0259D": "0x000000"
        },
        "cpu": {
          "pc": "0x005AB6",
          "currentBlockPc": "0x005AB6",
          "sp": "0xD1A81C",
          "ix": "0xD005B9",
          "iy": "0xD00080",
          "af": "0xFF02",
          "bc": "0xFF0405",
          "de": "0x0000FF",
          "hl": "0xD005A0",
          "flags": {
            "z": false,
            "c": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0x000000",
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
            "IX-6": "0x00C008",
            "IX-3": "0x7000E0",
            "IX+0": "0x003800",
            "IX+3": "0x080018",
            "IX+6": "0x000000",
            "IX+9": "0x000000"
          }
        }
      },
      {
        "blockIndex": 20519,
        "postExitBlock": 79,
        "pc": "0x005AE8",
        "previousPc": "0x005AB6",
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A86C",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D0259D": "0x000000"
        },
        "cpu": {
          "pc": "0x005AE8",
          "currentBlockPc": "0x005AE8",
          "sp": "0xD1A81C",
          "ix": "0xD005BA",
          "iy": "0xD00080",
          "af": "0x0054",
          "bc": "0xFF0405",
          "de": "0xD40000",
          "hl": "0xD54434",
          "flags": {
            "z": true,
            "c": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0x000000",
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
            "IX-6": "0xE000C0",
            "IX-3": "0x007000",
            "IX+0": "0x180038",
            "IX+3": "0x000800",
            "IX+6": "0x000000",
            "IX+9": "0x000000"
          }
        }
      },
      {
        "blockIndex": 20520,
        "postExitBlock": 80,
        "pc": "0x005B16",
        "previousPc": "0x005AE8",
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A86C",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D0259D": "0x000000"
        },
        "cpu": {
          "pc": "0x005B16",
          "currentBlockPc": "0x005B16",
          "sp": "0xD1A819",
          "ix": "0xD005BA",
          "iy": "0xD00080",
          "af": "0x0054",
          "bc": "0xFF0500",
          "de": "0x0000FF",
          "hl": "0xD54434",
          "flags": {
            "z": true,
            "c": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0x000000",
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
            "IX-6": "0xE000C0",
            "IX-3": "0x007000",
            "IX+0": "0x180038",
            "IX+3": "0x000800",
            "IX+6": "0x000000",
            "IX+9": "0x000000"
          }
        }
      },
      {
        "blockIndex": 20521,
        "postExitBlock": 81,
        "pc": "0x005B4B",
        "previousPc": "0x005B16",
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A86C",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D0259D": "0x000000"
        },
        "cpu": {
          "pc": "0x005B4B",
          "currentBlockPc": "0x005B4B",
          "sp": "0xD1A819",
          "ix": "0xD005BB",
          "iy": "0xD00080",
          "af": "0x387C",
          "bc": "0xFF0500",
          "de": "0x0000FF",
          "hl": "0xD5443E",
          "flags": {
            "z": true,
            "c": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0x000000",
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
            "IX-6": "0x00E000",
            "IX-3": "0x380070",
            "IX+0": "0x001800",
            "IX+3": "0x000008",
            "IX+6": "0x000000",
            "IX+9": "0x000000"
          }
        }
      },
      {
        "blockIndex": 20522,
        "postExitBlock": 82,
        "pc": "0x005AB6",
        "previousPc": "0x005B4B",
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A86C",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D0259D": "0x000000"
        },
        "cpu": {
          "pc": "0x005AB6",
          "currentBlockPc": "0x005AB6",
          "sp": "0xD1A81C",
          "ix": "0xD005BB",
          "iy": "0xD00080",
          "af": "0xFF02",
          "bc": "0xFF0305",
          "de": "0x0000FF",
          "hl": "0xD005A0",
          "flags": {
            "z": false,
            "c": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0x000000",
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
            "IX-6": "0x00E000",
            "IX-3": "0x380070",
            "IX+0": "0x001800",
            "IX+3": "0x000008",
            "IX+6": "0x000000",
            "IX+9": "0x000000"
          }
        }
      },
      {
        "blockIndex": 20523,
        "postExitBlock": 83,
        "pc": "0x005AE8",
        "previousPc": "0x005AB6",
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A86C",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D0259D": "0x000000"
        },
        "cpu": {
          "pc": "0x005AE8",
          "currentBlockPc": "0x005AE8",
          "sp": "0xD1A81C",
          "ix": "0xD005BC",
          "iy": "0xD00080",
          "af": "0x0054",
          "bc": "0xFF0305",
          "de": "0xD40000",
          "hl": "0xD546B4",
          "flags": {
            "z": true,
            "c": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0x000000",
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
            "IX-6": "0x7000E0",
            "IX-3": "0x003800",
            "IX+0": "0x080018",
            "IX+3": "0x000000",
            "IX+6": "0x000000",
            "IX+9": "0x000000"
          }
        }
      },
      {
        "blockIndex": 20524,
        "postExitBlock": 84,
        "pc": "0x005B16",
        "previousPc": "0x005AE8",
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A86C",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D0259D": "0x000000"
        },
        "cpu": {
          "pc": "0x005B16",
          "currentBlockPc": "0x005B16",
          "sp": "0xD1A819",
          "ix": "0xD005BC",
          "iy": "0xD00080",
          "af": "0x0054",
          "bc": "0xFF0500",
          "de": "0x0000FF",
          "hl": "0xD546B4",
          "flags": {
            "z": true,
            "c": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0x000000",
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
            "IX-6": "0x7000E0",
            "IX-3": "0x003800",
            "IX+0": "0x080018",
            "IX+3": "0x000000",
            "IX+6": "0x000000",
            "IX+9": "0x000000"
          }
        }
      },
      {
        "blockIndex": 20525,
        "postExitBlock": 85,
        "pc": "0x005B4B",
        "previousPc": "0x005B16",
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A86C",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D0259D": "0x000000"
        },
        "cpu": {
          "pc": "0x005B4B",
          "currentBlockPc": "0x005B4B",
          "sp": "0xD1A819",
          "ix": "0xD005BD",
          "iy": "0xD00080",
          "af": "0x187C",
          "bc": "0xFF0500",
          "de": "0x0000FF",
          "hl": "0xD546BE",
          "flags": {
            "z": true,
            "c": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0x000000",
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
            "IX-6": "0x007000",
            "IX-3": "0x180038",
            "IX+0": "0x000800",
            "IX+3": "0x000000",
            "IX+6": "0x000000",
            "IX+9": "0x000000"
          }
        }
      },
      {
        "blockIndex": 20526,
        "postExitBlock": 86,
        "pc": "0x005AB6",
        "previousPc": "0x005B4B",
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A86C",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D0259D": "0x000000"
        },
        "cpu": {
          "pc": "0x005AB6",
          "currentBlockPc": "0x005AB6",
          "sp": "0xD1A81C",
          "ix": "0xD005BD",
          "iy": "0xD00080",
          "af": "0xFF02",
          "bc": "0xFF0205",
          "de": "0x0000FF",
          "hl": "0xD005A0",
          "flags": {
            "z": false,
            "c": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0x000000",
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
            "IX-6": "0x007000",
            "IX-3": "0x180038",
            "IX+0": "0x000800",
            "IX+3": "0x000000",
            "IX+6": "0x000000",
            "IX+9": "0x000000"
          }
        }
      },
      {
        "blockIndex": 20527,
        "postExitBlock": 87,
        "pc": "0x005AE8",
        "previousPc": "0x005AB6",
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A86C",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D0259D": "0x000000"
        },
        "cpu": {
          "pc": "0x005AE8",
          "currentBlockPc": "0x005AE8",
          "sp": "0xD1A81C",
          "ix": "0xD005BE",
          "iy": "0xD00080",
          "af": "0x0054",
          "bc": "0xFF0205",
          "de": "0xD40000",
          "hl": "0xD54934",
          "flags": {
            "z": true,
            "c": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0x000000",
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
            "IX-6": "0x380070",
            "IX-3": "0x001800",
            "IX+0": "0x000008",
            "IX+3": "0x000000",
            "IX+6": "0x000000",
            "IX+9": "0x000000"
          }
        }
      },
      {
        "blockIndex": 20528,
        "postExitBlock": 88,
        "pc": "0x005B16",
        "previousPc": "0x005AE8",
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A86C",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D0259D": "0x000000"
        },
        "cpu": {
          "pc": "0x005B16",
          "currentBlockPc": "0x005B16",
          "sp": "0xD1A819",
          "ix": "0xD005BE",
          "iy": "0xD00080",
          "af": "0x0054",
          "bc": "0xFF0500",
          "de": "0x0000FF",
          "hl": "0xD54934",
          "flags": {
            "z": true,
            "c": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0x000000",
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
            "IX-6": "0x380070",
            "IX-3": "0x001800",
            "IX+0": "0x000008",
            "IX+3": "0x000000",
            "IX+6": "0x000000",
            "IX+9": "0x000000"
          }
        }
      },
      {
        "blockIndex": 20529,
        "postExitBlock": 89,
        "pc": "0x005B4B",
        "previousPc": "0x005B16",
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A86C",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D0259D": "0x000000"
        },
        "cpu": {
          "pc": "0x005B4B",
          "currentBlockPc": "0x005B4B",
          "sp": "0xD1A819",
          "ix": "0xD005BF",
          "iy": "0xD00080",
          "af": "0x087C",
          "bc": "0xFF0500",
          "de": "0x0000FF",
          "hl": "0xD5493E",
          "flags": {
            "z": true,
            "c": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0x000000",
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
            "IX-6": "0x003800",
            "IX-3": "0x080018",
            "IX+0": "0x000000",
            "IX+3": "0x000000",
            "IX+6": "0x000000",
            "IX+9": "0x000000"
          }
        }
      },
      {
        "blockIndex": 20530,
        "postExitBlock": 90,
        "pc": "0x005AB6",
        "previousPc": "0x005B4B",
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A86C",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D0259D": "0x000000"
        },
        "cpu": {
          "pc": "0x005AB6",
          "currentBlockPc": "0x005AB6",
          "sp": "0xD1A81C",
          "ix": "0xD005BF",
          "iy": "0xD00080",
          "af": "0xFF02",
          "bc": "0xFF0105",
          "de": "0x0000FF",
          "hl": "0xD005A0",
          "flags": {
            "z": false,
            "c": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0x000000",
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
            "IX-6": "0x003800",
            "IX-3": "0x080018",
            "IX+0": "0x000000",
            "IX+3": "0x000000",
            "IX+6": "0x000000",
            "IX+9": "0x000000"
          }
        }
      },
      {
        "blockIndex": 20531,
        "postExitBlock": 91,
        "pc": "0x005AE8",
        "previousPc": "0x005AB6",
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A86C",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D0259D": "0x000000"
        },
        "cpu": {
          "pc": "0x005AE8",
          "currentBlockPc": "0x005AE8",
          "sp": "0xD1A81C",
          "ix": "0xD005C0",
          "iy": "0xD00080",
          "af": "0x0054",
          "bc": "0xFF0105",
          "de": "0xD40000",
          "hl": "0xD54BB4",
          "flags": {
            "z": true,
            "c": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0x000000",
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
            "IX-6": "0x180038",
            "IX-3": "0x000800",
            "IX+0": "0x000000",
            "IX+3": "0x000000",
            "IX+6": "0x000000",
            "IX+9": "0x000000"
          }
        }
      },
      {
        "blockIndex": 20532,
        "postExitBlock": 92,
        "pc": "0x005B16",
        "previousPc": "0x005AE8",
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A86C",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D0259D": "0x000000"
        },
        "cpu": {
          "pc": "0x005B16",
          "currentBlockPc": "0x005B16",
          "sp": "0xD1A819",
          "ix": "0xD005C0",
          "iy": "0xD00080",
          "af": "0x0054",
          "bc": "0xFF0500",
          "de": "0x0000FF",
          "hl": "0xD54BB4",
          "flags": {
            "z": true,
            "c": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0x000000",
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
            "IX-6": "0x180038",
            "IX-3": "0x000800",
            "IX+0": "0x000000",
            "IX+3": "0x000000",
            "IX+6": "0x000000",
            "IX+9": "0x000000"
          }
        }
      },
      {
        "blockIndex": 20533,
        "postExitBlock": 93,
        "pc": "0x005B4B",
        "previousPc": "0x005B16",
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A86C",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D0259D": "0x000000"
        },
        "cpu": {
          "pc": "0x005B4B",
          "currentBlockPc": "0x005B4B",
          "sp": "0xD1A819",
          "ix": "0xD005C1",
          "iy": "0xD00080",
          "af": "0x007C",
          "bc": "0xFF0500",
          "de": "0x0000FF",
          "hl": "0xD54BBE",
          "flags": {
            "z": true,
            "c": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0x000000",
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
            "IX-6": "0x001800",
            "IX-3": "0x000008",
            "IX+0": "0x000000",
            "IX+3": "0x000000",
            "IX+6": "0x000000",
            "IX+9": "0x000000"
          }
        }
      },
      {
        "blockIndex": 20534,
        "postExitBlock": 94,
        "pc": "0x005B92",
        "previousPc": "0x005B4B",
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A86C",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D0259D": "0x000000"
        },
        "cpu": {
          "pc": "0x005B92",
          "currentBlockPc": "0x005B92",
          "sp": "0xD1A81C",
          "ix": "0xD005C1",
          "iy": "0xD00080",
          "af": "0xFF42",
          "bc": "0xFF0005",
          "de": "0x0000FF",
          "hl": "0xD005A0",
          "flags": {
            "z": true,
            "c": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0x000000",
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
            "IX-6": "0x001800",
            "IX-3": "0x000008",
            "IX+0": "0x000000",
            "IX+3": "0x000000",
            "IX+6": "0x000000",
            "IX+9": "0x000000"
          }
        }
      },
      {
        "blockIndex": 20535,
        "postExitBlock": 95,
        "pc": "0x005A19",
        "previousPc": "0x005B92",
        "fields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A86C",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D0259D": "0x000000"
        },
        "cpu": {
          "pc": "0x005A19",
          "currentBlockPc": "0x005A19",
          "sp": "0xD1A81C",
          "ix": "0xD005C1",
          "iy": "0xD00080",
          "af": "0xFF42",
          "bc": "0xFF0005",
          "de": "0x0000FF",
          "hl": "0xD005A0",
          "flags": {
            "z": true,
            "c": false
          },
          "fields": {
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A86C",
            "D0243A": "0x000000",
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
            "IX-6": "0x001800",
            "IX-3": "0x000008",
            "IX+0": "0x000000",
            "IX+3": "0x000000",
            "IX+6": "0x000000",
            "IX+9": "0x000000"
          }
        }
      }
    ],
    "postExitFieldWrites": [],
    "cleanupLoopHits": {
      "0x000A92": 16,
      "0x000BFE": 0,
      "0x001C33": 1,
      "0x0158BC": 0
    },
    "topHotBlocks": [
      {
        "pc": "0x09EFDE",
        "count": 2880
      },
      {
        "pc": "0x005AE8",
        "count": 1424
      },
      {
        "pc": "0x005B16",
        "count": 1424
      },
      {
        "pc": "0x005B4B",
        "count": 1424
      },
      {
        "pc": "0x005AB6",
        "count": 1335
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
        "count": 156
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
    "finalFields": {
      "D007CA": "0x0585E9",
      "D008E0": "0xD1A86C",
      "D0243A": "0x000000",
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
    "oracleMatches": 6,
    "oracle": [
      {
        "name": "D007CA",
        "actual": 361961,
        "expected": 361961,
        "match": true,
        "actualHex": "0x0585E9",
        "expectedHex": "0x0585E9"
      },
      {
        "name": "D008E0",
        "actual": 13740140,
        "expected": 13740140,
        "match": true,
        "actualHex": "0xD1A86C",
        "expectedHex": "0xD1A86C"
      },
      {
        "name": "D0243A",
        "actual": 0,
        "expected": 13740236,
        "match": false,
        "actualHex": "0x000000",
        "expectedHex": "0xD1A8CC"
      },
      {
        "name": "D0243D",
        "actual": 0,
        "expected": 13805630,
        "match": false,
        "actualHex": "0x000000",
        "expectedHex": "0xD2A83E"
      },
      {
        "name": "D02590",
        "actual": 0,
        "expected": 13893249,
        "match": false,
        "actualHex": "0x000000",
        "expectedHex": "0xD3FE81"
      },
      {
        "name": "D0259D",
        "actual": 0,
        "expected": 13893325,
        "match": false,
        "actualHex": "0x000000",
        "expectedHex": "0xD3FECD"
      },
      {
        "name": "D02A29",
        "actual": 0,
        "expected": 0,
        "match": true,
        "actualHex": "0x0000",
        "expectedHex": "0x0000"
      },
      {
        "name": "D00587",
        "actual": 0,
        "expected": 0,
        "match": true,
        "actualHex": "0x00",
        "expectedHex": "0x00"
      },
      {
        "name": "D0058C",
        "actual": 0,
        "expected": 0,
        "match": true,
        "actualHex": "0x00",
        "expectedHex": "0x00"
      },
      {
        "name": "D0058E",
        "actual": 0,
        "expected": 0,
        "match": true,
        "actualHex": "0x00",
        "expectedHex": "0x00"
      }
    ],
    "recentPcs": [
      "0x000AEE",
      "0x000A79",
      "0x000AC5",
      "0x000AD9",
      "0x000AEE",
      "0x000A79",
      "0x000AC5",
      "0x000AD9",
      "0x000AEE",
      "0x000A79",
      "0x000AC5",
      "0x000AD9",
      "0x000AEE",
      "0x000A79",
      "0x000AC5",
      "0x000AD9",
      "0x000AEE",
      "0x000A79",
      "0x000AC5",
      "0x000AD9",
      "0x000AEE",
      "0x000A79",
      "0x000AC5",
      "0x000AD9",
      "0x000AEE",
      "0x000A79",
      "0x000AC5",
      "0x000AD9",
      "0x000AEE",
      "0x000A79",
      "0x000AC5",
      "0x000AD9",
      "0x000AEE",
      "0x000A79",
      "0x000AC5",
      "0x000AD9",
      "0x000AEE",
      "0x000A79",
      "0x000AC5",
      "0x000AD9",
      "0x000AEE",
      "0x000A79",
      "0x000AC5",
      "0x000AD9",
      "0x000AEE",
      "0x000A79",
      "0x000AC5",
      "0x000AD9",
      "0x000AEE",
      "0x000A79",
      "0x000AC5",
      "0x000AD9",
      "0x000AEE",
      "0x000A79",
      "0x000AC5",
      "0x000AD9",
      "0x000AEE",
      "0x000A79",
      "0x000AC5",
      "0x000AD9",
      "0x000AEE",
      "0x000A79",
      "0x000AC5",
      "0x000AD9",
      "0x000AEE",
      "0x000A79",
      "0x000AC5",
      "0x000AD9",
      "0x000AEE",
      "0x000A79",
      "0x000AC5",
      "0x000AD9",
      "0x000AEE",
      "0x000A79",
      "0x000AC5",
      "0x000AD9",
      "0x000AEE",
      "0x000A79",
      "0x000AC5",
      "0x000AD9",
      "0x000AFD",
      "0x000B19",
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
      "0x000B83",
      "0x000BCB",
      "0x000C80",
      "0x000C8D",
      "0x000CA0",
      "0x000CA4",
      "0x0009E8",
      "0x00096C",
      "0x000984",
      "0x0009F3",
      "0x0009F9",
      "0x000A2E",
      "0x000A5D",
      "0x000A72",
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
    ]
  }
}
```

No runtime, transpiler, browser-shell, decoder, peripheral, scheduler, or ROM artifact files were changed.


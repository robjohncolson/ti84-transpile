# Phase 643: Low 0x006Dxx Route Cause After Clean Repaint

Probe: `probe-phase643-low-route-cause.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase643-low-route-cause.mjs`

## Summary

- **** Clean-repaint prerequisite held: replaying the valid Phase 5 VAT/context snapshot before `0x058241` still produced a clean repaint halt for every scenario.
- **** The low route is a deterministic post-cleanup wait/retry path: both keys hit cleanup, then enter the `0x006CDF -> 0x006D38 -> 0x006D5D -> 0x0021C2 -> 0x006D64 -> 0x006CDF` cycle with `D007CA`/`D008E0`/VAT already zero by first low-route entry.
- *** The token/tuple hooks are bypassed before this low route begins: `0x08F5E1`, `0x090992`, and `0x08F54B` all stayed at 0 hits while `_GetCSC` and `cxMain` did run.
- *** Static blocks identify the hot low route as a framed hardware/status transfer loop, not the token-display engine: `0x006D5D` loads `HL=(IX+9)`, calls `0x0021C2`, and `0x006D64` jumps back to `0x006CDF` while NZ; `0x006D4F` writes `D00124=0x0E`, performs port I/O, and polls bit 3 before retrying.

## Scenario Results

| Key | Repaint | Key result | First cleanup | First low | cxMain | GetCSC | 0x08F5E1 | 0x090992 | 0x08F54B | 0x006D5D | 0x006D38 | 0x000A92 | 0x000BFE | Low region | Final PC |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| EOL/CLEAR | halt 0x0019B5 | sampled-low-route-cycle | 34288 | 43595 | 1 | 1 | 0 | 0 | 0 | 10088 | 10080 | 16256 | 512 | 50432 | 0x000BFE |
| Digit2 | halt 0x0019B5 | sampled-low-route-cycle | 10972 | 20279 | 2 | 2 | 0 | 0 | 0 | 10088 | 10080 | 16256 | 512 | 50432 | 0x000BFE |

## Static Low-Route Blocks

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

### 0x006CF7

```text
0x006CF7  dd 07 fd       ld bc, (ix+-3)
0x006CFA  dd 17 fa       ld de, (ix+-6)
0x006CFD  21 10 20 00    ld hl, 0x002010
0x006D01  19             add hl, de
0x006D02  eb             ex de, hl
0x006D03  dd 27 06       ld hl, (ix+6)
0x006D06  ed b4          nop
0x006D08  f5             push af
0x006D09  7a             ld a, d
0x006D0A  fe 20          cp 0x20
0x006D0C  28 01          jr z, 0x006d0f
```

Exits: `[{"type":"branch","condition":"z","target":27919,"targetMode":"adl"},{"type":"fallthrough","target":27918,"targetMode":"adl"}]`

### 0x006D0F

```text
0x006D0F  f1             pop af
0x006D10  dd 2f 06       ld (ix+6), hl
0x006D13  dd 27 09       ld hl, (ix+9)
0x006D16  dd 07 fd       ld bc, (ix+-3)
0x006D19  b7             or a
0x006D1A  ed 42          sbc hl, bc
0x006D1C  dd 2f 09       ld (ix+9), hl
0x006D1F  2a 21 01 d0    ld hl, (0xd00121)
0x006D23  09             add hl, bc
0x006D24  22 21 01 d0    ld (0xd00121), hl
0x006D28  dd 27 fa       ld hl, (ix+-6)
0x006D2B  09             add hl, bc
0x006D2C  dd 2f fa       ld (ix+-6), hl
0x006D2F  01 40 00 00    ld bc, 0x000040
0x006D33  b7             or a
0x006D34  ed 42          sbc hl, bc
0x006D36  38 25          jr c, 0x006d5d
```

Exits: `[{"type":"branch","condition":"c","target":27997,"targetMode":"adl"},{"type":"fallthrough","target":27960,"targetMode":"adl"}]`

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

### 0x006D64

```text
0x006D64  c2 df 6c 00    jp nz, 0x006cdf
```

Exits: `[{"type":"branch","condition":"nz","target":27871,"targetMode":"adl"},{"type":"fallthrough","target":28008,"targetMode":"adl"}]`

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

### 0x000A92

```text
0x000A92  dd 56 f9       ld d, (ix-7)
0x000A95  dd 27 f5       ld hl, (ix+-11)
0x000A98  5e             ld e, (hl)
0x000A99  23             inc hl
0x000A9A  dd 2f f5       ld (ix+-11), hl
0x000A9D  ed 5c          mlt de
0x000A9F  dd 27 ec       ld hl, (ix+-20)
0x000AA2  19             add hl, de
0x000AA3  eb             ex de, hl
0x000AA4  dd 27 06       ld hl, (ix+6)
0x000AA7  23             inc hl
0x000AA8  23             inc hl
0x000AA9  dd 07 ef       ld bc, (ix+-17)
0x000AAC  09             add hl, bc
0x000AAD  03             inc bc
0x000AAE  dd 0f ef       ld (ix+-17), bc
0x000AB1  01 00 00 00    ld bc, 0x000000
0x000AB5  4e             ld c, (hl)
0x000AB6  eb             ex de, hl
0x000AB7  09             add hl, bc
0x000AB8  7d             ld a, l
0x000AB9  12             ld (de), a
0x000ABA  6c             ld l, h
0x000ABB  26 00          ld h, 0x00
0x000ABD  dd 2f ec       ld (ix+-20), hl
0x000AC0  dd 35 f8       dec (ix-8)
0x000AC3  20 cd          jr nz, 0x000a92
```

Exits: `[{"type":"branch","condition":"nz","target":2706,"targetMode":"adl"},{"type":"fallthrough","target":2757,"targetMode":"adl"}]`

### 0x000BFE

```text
0x000BFE  dd 5e e8       ld e, (ix-24)
0x000C01  dd 27 e5       ld hl, (ix+-27)
0x000C04  56             ld d, (hl)
0x000C05  23             inc hl
0x000C06  dd 2f e5       ld (ix+-27), hl
0x000C09  ed 5c          mlt de
0x000C0B  dd 27 d9       ld hl, (ix+-39)
0x000C0E  19             add hl, de
0x000C0F  dd 2f d9       ld (ix+-39), hl
0x000C12  11 00 00 00    ld de, 0x000000
0x000C16  dd 27 e2       ld hl, (ix+-30)
0x000C19  5e             ld e, (hl)
0x000C1A  21 00 00 00    ld hl, 0x000000
0x000C1E  dd 6e d9       ld l, (ix-39)
0x000C21  eb             ex de, hl
0x000C22  b7             or a
0x000C23  ed 52          sbc hl, de
0x000C25  dd 07 d6       ld bc, (ix+-42)
0x000C28  09             add hl, bc
0x000C29  7d             ld a, l
0x000C2A  6c             ld l, h
0x000C2B  dd 2f d6       ld (ix+-42), hl
0x000C2E  dd 27 e2       ld hl, (ix+-30)
0x000C31  77             ld (hl), a
0x000C32  23             inc hl
0x000C33  dd 2f e2       ld (ix+-30), hl
0x000C36  dd 27 d9       ld hl, (ix+-39)
0x000C39  6c             ld l, h
0x000C3A  26 00          ld h, 0x00
0x000C3C  dd 2f d9       ld (ix+-39), hl
0x000C3F  dd 27 d3       ld hl, (ix+-45)
0x000C42  2b             dec hl
0x000C43  dd 2f d3       ld (ix+-45), hl
0x000C46  7d             ld a, l
0x000C47  b4             or h
0x000C48  20 b4          jr nz, 0x000bfe
```

Exits: `[{"type":"branch","condition":"nz","target":3070,"targetMode":"adl"},{"type":"fallthrough","target":3146,"targetMode":"adl"}]`


## Focused Dynamic Samples

```json
[
  {
    "key": "eol-clear",
    "phase5Snapshot": {
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
    "repaint": {
      "steps": 49474,
      "termination": "halt",
      "lastPc": "0x0019B5",
      "lastMode": "adl"
    },
    "keyResult": {
      "steps": 142622,
      "termination": "sampled-low-route-cycle",
      "lastPc": "0x000BFE",
      "lastMode": "adl"
    },
    "firstLowBlock": 43595,
    "firstCleanupBlock": 34288,
    "targetCounts": {
      "loop08c331": 1,
      "cxMain0585e9": 1,
      "getCsc03fa09": 1,
      "cleanup0018f8": 1,
      "low0064d0": 1,
      "low006cc6": 5,
      "low006cdf": 10083,
      "low006cf7": 10078,
      "low006d0f": 10083,
      "low006d38": 10080,
      "low006d4f": 10080,
      "low006d5d": 10088,
      "low006d64": 10088,
      "helper0021c2": 10088,
      "hot000a92": 16256,
      "hot000bfe": 512,
      "tokenExit08f5e1": 0,
      "tokenGate090992": 0,
      "eolTuple08f54b": 0
    },
    "regionCounts": {
      "low006d00_006dff": 50432,
      "token08f000_090fff": 0,
      "display090000_091fff": 0,
      "cleanup001000_001fff": 1881
    },
    "final": {
      "D007CA": "0x000000",
      "D008E0": "0x000000",
      "D02590": "0x000000",
      "D00121": "0x09D800",
      "D00124": "0x0E",
      "D00587": "0x00",
      "D0058C": "0x00",
      "D0058D": "0x00",
      "D0058E": "0x00",
      "vramPixels": 3031,
      "vramPeak": 11493
    },
    "lowEntrySamples": [
      {
        "name": "first-low-006dxx",
        "block": 43595,
        "pc": "0x006D5D",
        "sp": "0xD1A82B",
        "ix": "0xD1A831",
        "hl": "0x000000",
        "bc": "0x020000",
        "flags": {
          "z": true,
          "c": false
        },
        "state": {
          "D007CA": "0x000000",
          "D008E0": "0x000000",
          "D02590": "0x000000",
          "D00121": "0x000000",
          "D00124": "0x0A",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 3039
        },
        "ixFrame": {
          "IX-39": "0x001717",
          "IX-27": "0xFF0105",
          "IX-24": "0x66",
          "IX-20": "0x400017",
          "IX-11": "0xDA007C",
          "IX-7": "0x00",
          "IX-6": "0x000000",
          "IX-3": "0x020000",
          "IX+0": "0xD1A866",
          "IX+3": "0x0064DE",
          "IX+6": "0x020000",
          "IX+9": "0x000100"
        },
        "callStackTail": [
          "0x013D29",
          "0x0059E9",
          "0x0059F3",
          "0x0059F3",
          "0x0059F3",
          "0x0059F3",
          "0x0059F3",
          "0x0059F3",
          "0x00072D",
          "0x0138F1",
          "0x006475",
          "0x00647D",
          "0x001C44",
          "0x0064C7",
          "0x0064D0",
          "0x006CC6"
        ],
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
          "0x006CC6",
          "0x006D5D"
        ]
      }
    ],
    "stableSamples": [
      {
        "name": "low006d5d-hit-1",
        "block": 43595,
        "pc": "0x006D5D",
        "sp": "0xD1A82B",
        "ix": "0xD1A831",
        "hl": "0x000000",
        "bc": "0x020000",
        "flags": {
          "z": true,
          "c": false
        },
        "state": {
          "D007CA": "0x000000",
          "D008E0": "0x000000",
          "D02590": "0x000000",
          "D00121": "0x000000",
          "D00124": "0x0A",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 3039
        },
        "ixFrame": {
          "IX-39": "0x001717",
          "IX-27": "0xFF0105",
          "IX-24": "0x66",
          "IX-20": "0x400017",
          "IX-11": "0xDA007C",
          "IX-7": "0x00",
          "IX-6": "0x000000",
          "IX-3": "0x020000",
          "IX+0": "0xD1A866",
          "IX+3": "0x0064DE",
          "IX+6": "0x020000",
          "IX+9": "0x000100"
        },
        "callStackTail": [
          "0x013D29",
          "0x0059E9",
          "0x0059F3",
          "0x0059F3",
          "0x0059F3",
          "0x0059F3",
          "0x0059F3",
          "0x0059F3",
          "0x00072D",
          "0x0138F1",
          "0x006475",
          "0x00647D",
          "0x001C44",
          "0x0064C7",
          "0x0064D0",
          "0x006CC6"
        ],
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
          "0x006CC6",
          "0x006D5D"
        ]
      },
      {
        "name": "low006cdf-hit-1",
        "block": 43598,
        "pc": "0x006CDF",
        "sp": "0xD1A82B",
        "ix": "0xD1A831",
        "hl": "0x000100",
        "bc": "0x020000",
        "flags": {
          "z": false,
          "c": false
        },
        "state": {
          "D007CA": "0x000000",
          "D008E0": "0x000000",
          "D02590": "0x000000",
          "D00121": "0x000000",
          "D00124": "0x0A",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 3039
        },
        "ixFrame": {
          "IX-39": "0x001717",
          "IX-27": "0xFF0105",
          "IX-24": "0x66",
          "IX-20": "0x400017",
          "IX-11": "0x640001",
          "IX-7": "0x00",
          "IX-6": "0x000000",
          "IX-3": "0x020000",
          "IX+0": "0xD1A866",
          "IX+3": "0x0064DE",
          "IX+6": "0x020000",
          "IX+9": "0x000100"
        },
        "callStackTail": [
          "0x013D29",
          "0x0059E9",
          "0x0059F3",
          "0x0059F3",
          "0x0059F3",
          "0x0059F3",
          "0x0059F3",
          "0x0059F3",
          "0x00072D",
          "0x0138F1",
          "0x006475",
          "0x00647D",
          "0x001C44",
          "0x0064C7",
          "0x0064D0",
          "0x006CC6"
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
          "0x006CC6",
          "0x006D5D",
          "0x0021C2",
          "0x006D64",
          "0x006CDF"
        ]
      },
      {
        "name": "low006d38-hit-1",
        "block": 43601,
        "pc": "0x006D38",
        "sp": "0xD1A82B",
        "ix": "0xD1A831",
        "hl": "0x000000",
        "bc": "0x000040",
        "flags": {
          "z": true,
          "c": false
        },
        "state": {
          "D007CA": "0x000000",
          "D008E0": "0x000000",
          "D02590": "0x000000",
          "D00121": "0x000040",
          "D00124": "0x0A",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 3039
        },
        "ixFrame": {
          "IX-39": "0x001717",
          "IX-27": "0xFF0105",
          "IX-24": "0x66",
          "IX-20": "0x400017",
          "IX-11": "0x800001",
          "IX-7": "0x00",
          "IX-6": "0x000040",
          "IX-3": "0x000040",
          "IX+0": "0xD1A866",
          "IX+3": "0x0064DE",
          "IX+6": "0x020000",
          "IX+9": "0x0000C0"
        },
        "callStackTail": [
          "0x013D29",
          "0x0059E9",
          "0x0059F3",
          "0x0059F3",
          "0x0059F3",
          "0x0059F3",
          "0x0059F3",
          "0x0059F3",
          "0x00072D",
          "0x0138F1",
          "0x006475",
          "0x00647D",
          "0x001C44",
          "0x0064C7",
          "0x0064D0",
          "0x006CC6"
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
          "0x005B92",
          "0x005A19",
          "0x0059DA",
          "0x0059E6",
          "0x0017FC",
          "0x0064D0",
          "0x006CC6",
          "0x006D5D",
          "0x0021C2",
          "0x006D64",
          "0x006CDF",
          "0x006CF7",
          "0x006D0F",
          "0x006D38"
        ]
      },
      {
        "name": "low006d5d-hit-512",
        "block": 47677,
        "pc": "0x006D5D",
        "sp": "0xD1A82B",
        "ix": "0xD1A831",
        "hl": "0x000000",
        "bc": "0x002001",
        "flags": {
          "z": true,
          "c": false
        },
        "state": {
          "D007CA": "0x000000",
          "D008E0": "0x000000",
          "D02590": "0x000000",
          "D00121": "0x007F00",
          "D00124": "0x0E",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 3039
        },
        "ixFrame": {
          "IX-39": "0x001717",
          "IX-27": "0xFF0105",
          "IX-24": "0x66",
          "IX-20": "0x400017",
          "IX-11": "0x420958",
          "IX-7": "0x00",
          "IX-6": "0x000000",
          "IX-3": "0x000040",
          "IX+0": "0xD1A866",
          "IX+3": "0x006512",
          "IX+6": "0x020104",
          "IX+9": "0x0958BE"
        },
        "callStackTail": [
          "0x0059F3",
          "0x0059F3",
          "0x0059F3",
          "0x0059F3",
          "0x00072D",
          "0x0138F1",
          "0x006475",
          "0x00647D",
          "0x001C44",
          "0x0064C7",
          "0x0064D0",
          "0x006CC6",
          "0x0064DE",
          "0x006CC6",
          "0x0064EE",
          "0x006CC6"
        ],
        "recentBlocks": [
          "0x0021C2",
          "0x006D64",
          "0x006CDF",
          "0x006CF7",
          "0x006D0F",
          "0x006D38",
          "0x006D4F",
          "0x006D5D",
          "0x0021C2",
          "0x006D64",
          "0x006CDF",
          "0x006CF7",
          "0x006D0F",
          "0x006D38",
          "0x006D4F",
          "0x006D5D",
          "0x0021C2",
          "0x006D64",
          "0x006CDF",
          "0x006CF7",
          "0x006D0F",
          "0x006D38",
          "0x006D4F",
          "0x006D5D"
        ]
      },
      {
        "name": "low006cdf-hit-512",
        "block": 47696,
        "pc": "0x006CDF",
        "sp": "0xD1A82B",
        "ix": "0xD1A831",
        "hl": "0x09583E",
        "bc": "0x002001",
        "flags": {
          "z": false,
          "c": false
        },
        "state": {
          "D007CA": "0x000000",
          "D008E0": "0x000000",
          "D02590": "0x000000",
          "D00121": "0x007F80",
          "D00124": "0x0E",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 3039
        },
        "ixFrame": {
          "IX-39": "0x001717",
          "IX-27": "0xFF0105",
          "IX-24": "0x66",
          "IX-20": "0x400017",
          "IX-11": "0x640958",
          "IX-7": "0x00",
          "IX-6": "0x000000",
          "IX-3": "0x000040",
          "IX+0": "0xD1A866",
          "IX+3": "0x006512",
          "IX+6": "0x020104",
          "IX+9": "0x09583E"
        },
        "callStackTail": [
          "0x0059F3",
          "0x0059F3",
          "0x0059F3",
          "0x0059F3",
          "0x00072D",
          "0x0138F1",
          "0x006475",
          "0x00647D",
          "0x001C44",
          "0x0064C7",
          "0x0064D0",
          "0x006CC6",
          "0x0064DE",
          "0x006CC6",
          "0x0064EE",
          "0x006CC6"
        ],
        "recentBlocks": [
          "0x006CF7",
          "0x006D0F",
          "0x006D38",
          "0x006D4F",
          "0x006D5D",
          "0x0021C2",
          "0x006D64",
          "0x006CDF",
          "0x006CF7",
          "0x006D0F",
          "0x006D38",
          "0x006D4F",
          "0x006D5D",
          "0x0021C2",
          "0x006D64",
          "0x006CDF",
          "0x006CF7",
          "0x006D0F",
          "0x006D38",
          "0x006D4F",
          "0x006D5D",
          "0x0021C2",
          "0x006D64",
          "0x006CDF"
        ]
      },
      {
        "name": "low006d38-hit-512",
        "block": 47707,
        "pc": "0x006D38",
        "sp": "0xD1A82B",
        "ix": "0xD1A831",
        "hl": "0x000000",
        "bc": "0x000040",
        "flags": {
          "z": true,
          "c": false
        },
        "state": {
          "D007CA": "0x000000",
          "D008E0": "0x000000",
          "D02590": "0x000000",
          "D00121": "0x008000",
          "D00124": "0x0E",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 3039
        },
        "ixFrame": {
          "IX-39": "0x001717",
          "IX-27": "0xFF0105",
          "IX-24": "0x66",
          "IX-20": "0x400017",
          "IX-11": "0x800957",
          "IX-7": "0x00",
          "IX-6": "0x000040",
          "IX-3": "0x000040",
          "IX+0": "0xD1A866",
          "IX+3": "0x006512",
          "IX+6": "0x020104",
          "IX+9": "0x0957BE"
        },
        "callStackTail": [
          "0x0059F3",
          "0x0059F3",
          "0x0059F3",
          "0x0059F3",
          "0x00072D",
          "0x0138F1",
          "0x006475",
          "0x00647D",
          "0x001C44",
          "0x0064C7",
          "0x0064D0",
          "0x006CC6",
          "0x0064DE",
          "0x006CC6",
          "0x0064EE",
          "0x006CC6"
        ],
        "recentBlocks": [
          "0x006D4F",
          "0x006D5D",
          "0x0021C2",
          "0x006D64",
          "0x006CDF",
          "0x006CF7",
          "0x006D0F",
          "0x006D38",
          "0x006D4F",
          "0x006D5D",
          "0x0021C2",
          "0x006D64",
          "0x006CDF",
          "0x006CF7",
          "0x006D0F",
          "0x006D38",
          "0x006D4F",
          "0x006D5D",
          "0x0021C2",
          "0x006D64",
          "0x006CDF",
          "0x006CF7",
          "0x006D0F",
          "0x006D38"
        ]
      },
      {
        "name": "low006d5d-hit-2048",
        "block": 59965,
        "pc": "0x006D5D",
        "sp": "0xD1A82B",
        "ix": "0xD1A831",
        "hl": "0x000000",
        "bc": "0x002001",
        "flags": {
          "z": true,
          "c": false
        },
        "state": {
          "D007CA": "0x000000",
          "D008E0": "0x000000",
          "D02590": "0x000000",
          "D00121": "0x01FF00",
          "D00124": "0x0E",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 3039
        },
        "ixFrame": {
          "IX-39": "0x001717",
          "IX-27": "0xFF0105",
          "IX-24": "0x66",
          "IX-20": "0x400017",
          "IX-11": "0x4207D8",
          "IX-7": "0x00",
          "IX-6": "0x000000",
          "IX-3": "0x000040",
          "IX+0": "0xD1A866",
          "IX+3": "0x006512",
          "IX+6": "0x020104",
          "IX+9": "0x07D8BE"
        },
        "callStackTail": [
          "0x0059F3",
          "0x0059F3",
          "0x0059F3",
          "0x0059F3",
          "0x00072D",
          "0x0138F1",
          "0x006475",
          "0x00647D",
          "0x001C44",
          "0x0064C7",
          "0x0064D0",
          "0x006CC6",
          "0x0064DE",
          "0x006CC6",
          "0x0064EE",
          "0x006CC6"
        ],
        "recentBlocks": [
          "0x0021C2",
          "0x006D64",
          "0x006CDF",
          "0x006CF7",
          "0x006D0F",
          "0x006D38",
          "0x006D4F",
          "0x006D5D",
          "0x0021C2",
          "0x006D64",
          "0x006CDF",
          "0x006CF7",
          "0x006D0F",
          "0x006D38",
          "0x006D4F",
          "0x006D5D",
          "0x0021C2",
          "0x006D64",
          "0x006CDF",
          "0x006CF7",
          "0x006D0F",
          "0x006D38",
          "0x006D4F",
          "0x006D5D"
        ]
      },
      {
        "name": "low006cdf-hit-2048",
        "block": 59984,
        "pc": "0x006CDF",
        "sp": "0xD1A82B",
        "ix": "0xD1A831",
        "hl": "0x07D83E",
        "bc": "0x002001",
        "flags": {
          "z": false,
          "c": false
        },
        "state": {
          "D007CA": "0x000000",
          "D008E0": "0x000000",
          "D02590": "0x000000",
          "D00121": "0x01FF80",
          "D00124": "0x0E",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 3039
        },
        "ixFrame": {
          "IX-39": "0x001717",
          "IX-27": "0xFF0105",
          "IX-24": "0x66",
          "IX-20": "0x400017",
          "IX-11": "0x6407D8",
          "IX-7": "0x00",
          "IX-6": "0x000000",
          "IX-3": "0x000040",
          "IX+0": "0xD1A866",
          "IX+3": "0x006512",
          "IX+6": "0x020104",
          "IX+9": "0x07D83E"
        },
        "callStackTail": [
          "0x0059F3",
          "0x0059F3",
          "0x0059F3",
          "0x0059F3",
          "0x00072D",
          "0x0138F1",
          "0x006475",
          "0x00647D",
          "0x001C44",
          "0x0064C7",
          "0x0064D0",
          "0x006CC6",
          "0x0064DE",
          "0x006CC6",
          "0x0064EE",
          "0x006CC6"
        ],
        "recentBlocks": [
          "0x006CF7",
          "0x006D0F",
          "0x006D38",
          "0x006D4F",
          "0x006D5D",
          "0x0021C2",
          "0x006D64",
          "0x006CDF",
          "0x006CF7",
          "0x006D0F",
          "0x006D38",
          "0x006D4F",
          "0x006D5D",
          "0x0021C2",
          "0x006D64",
          "0x006CDF",
          "0x006CF7",
          "0x006D0F",
          "0x006D38",
          "0x006D4F",
          "0x006D5D",
          "0x0021C2",
          "0x006D64",
          "0x006CDF"
        ]
      },
      {
        "name": "low006d38-hit-2048",
        "block": 59995,
        "pc": "0x006D38",
        "sp": "0xD1A82B",
        "ix": "0xD1A831",
        "hl": "0x000000",
        "bc": "0x000040",
        "flags": {
          "z": true,
          "c": false
        },
        "state": {
          "D007CA": "0x000000",
          "D008E0": "0x000000",
          "D02590": "0x000000",
          "D00121": "0x020000",
          "D00124": "0x0E",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 3039
        },
        "ixFrame": {
          "IX-39": "0x001717",
          "IX-27": "0xFF0105",
          "IX-24": "0x66",
          "IX-20": "0x400017",
          "IX-11": "0x8007D7",
          "IX-7": "0x00",
          "IX-6": "0x000040",
          "IX-3": "0x000040",
          "IX+0": "0xD1A866",
          "IX+3": "0x006512",
          "IX+6": "0x020104",
          "IX+9": "0x07D7BE"
        },
        "callStackTail": [
          "0x0059F3",
          "0x0059F3",
          "0x0059F3",
          "0x0059F3",
          "0x00072D",
          "0x0138F1",
          "0x006475",
          "0x00647D",
          "0x001C44",
          "0x0064C7",
          "0x0064D0",
          "0x006CC6",
          "0x0064DE",
          "0x006CC6",
          "0x0064EE",
          "0x006CC6"
        ],
        "recentBlocks": [
          "0x006D4F",
          "0x006D5D",
          "0x0021C2",
          "0x006D64",
          "0x006CDF",
          "0x006CF7",
          "0x006D0F",
          "0x006D38",
          "0x006D4F",
          "0x006D5D",
          "0x0021C2",
          "0x006D64",
          "0x006CDF",
          "0x006CF7",
          "0x006D0F",
          "0x006D38",
          "0x006D4F",
          "0x006D5D",
          "0x0021C2",
          "0x006D64",
          "0x006CDF",
          "0x006CF7",
          "0x006D0F",
          "0x006D38"
        ]
      },
      {
        "name": "hot000a92-hit-1",
        "block": 125079,
        "pc": "0x000A92",
        "sp": "0xD1A3BC",
        "ix": "0xD1A3E9",
        "hl": "0x0000E2",
        "bc": "0x000000",
        "flags": {
          "z": false,
          "c": false
        },
        "state": {
          "D007CA": "0x000000",
          "D008E0": "0x000000",
          "D02590": "0x000000",
          "D00121": "0x09D800",
          "D00124": "0x0E",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 3031
        },
        "ixFrame": {
          "IX-39": "0x00002E",
          "IX-27": "0x006C8E",
          "IX-24": "0x00",
          "IX-20": "0x0000E2",
          "IX-11": "0xD1A602",
          "IX-7": "0xF1",
          "IX-6": "0xD1A601",
          "IX-3": "0x000080",
          "IX+0": "0xD1A708",
          "IX+3": "0x000A0A",
          "IX+6": "0xD1A3FB",
          "IX+9": "0xD1A5FF"
        },
        "callStackTail": [
          "0x006475",
          "0x00647D",
          "0x001C44",
          "0x0064C7",
          "0x0064D0",
          "0x006CC6",
          "0x0064DE",
          "0x006CC6",
          "0x0064EE",
          "0x00651C",
          "0x006DCB",
          "0x006CC6",
          "0x00652C",
          "0x00653D",
          "0x00654E",
          "0x00655D"
        ],
        "recentBlocks": [
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
          "0x000A92"
        ]
      }
    ],
    "stateTransitions": [
      {
        "block": 20932,
        "pc": "0x0A2156",
        "D007CA": [
          "0x0585E9",
          "0x000000"
        ],
        "D008E0": [
          "0xD1A863",
          "0x000000"
        ],
        "D02590": [
          "0xD3FE81",
          "0xD3FE81"
        ]
      },
      {
        "block": 34288,
        "pc": "0x0018F8",
        "D007CA": [
          "0x000000",
          "0x000000"
        ],
        "D008E0": [
          "0x000000",
          "0x000000"
        ],
        "D02590": [
          "0xD3FE81",
          "0x000000"
        ]
      }
    ],
    "ioSamples": [
      {
        "dir": "in",
        "port": "0x0006",
        "value": "0xD0",
        "pc": "0x0006F3",
        "sp": "0xD1A857"
      },
      {
        "dir": "in",
        "port": "0x0003",
        "value": "0xEE",
        "pc": "0x006816",
        "sp": "0xD1A848"
      },
      {
        "dir": "in",
        "port": "0x5016",
        "value": "0x00",
        "pc": "0x03CF7D",
        "sp": "0xD1A854"
      },
      {
        "dir": "in",
        "port": "0x5015",
        "value": "0x00",
        "pc": "0x03CFA4",
        "sp": "0xD1A854"
      },
      {
        "dir": "in",
        "port": "0x5014",
        "value": "0x10",
        "pc": "0x03CFCF",
        "sp": "0xD1A854"
      },
      {
        "dir": "out",
        "port": "0x5008",
        "value": "0x10",
        "pc": "0x03D029",
        "sp": "0xD1A854"
      },
      {
        "dir": "out",
        "port": "0xA000",
        "value": "0x01",
        "pc": "0x003CC2",
        "sp": "0xD1A84E"
      },
      {
        "dir": "out",
        "port": "0xA00C",
        "value": "0x04",
        "pc": "0x003CD4",
        "sp": "0xD1A84E"
      },
      {
        "dir": "out",
        "port": "0xA008",
        "value": "0xFF",
        "pc": "0x003CE0",
        "sp": "0xD1A84E"
      },
      {
        "dir": "in",
        "port": "0xA008",
        "value": "0x00",
        "pc": "0x003CF3",
        "sp": "0xD1A84E"
      },
      {
        "dir": "in",
        "port": "0x0006",
        "value": "0xD0",
        "pc": "0x0006F3",
        "sp": "0xD1A84E"
      },
      {
        "dir": "in",
        "port": "0x0003",
        "value": "0xEE",
        "pc": "0x006816",
        "sp": "0xD1A83F"
      },
      {
        "dir": "in",
        "port": "0x5016",
        "value": "0x00",
        "pc": "0x03CF7D",
        "sp": "0xD1A84B"
      },
      {
        "dir": "in",
        "port": "0x5015",
        "value": "0x00",
        "pc": "0x03CFA4",
        "sp": "0xD1A84B"
      },
      {
        "dir": "in",
        "port": "0x5014",
        "value": "0x10",
        "pc": "0x03CFCF",
        "sp": "0xD1A84B"
      },
      {
        "dir": "out",
        "port": "0x5008",
        "value": "0x10",
        "pc": "0x03D029",
        "sp": "0xD1A84B"
      },
      {
        "dir": "out",
        "port": "0xA000",
        "value": "0x01",
        "pc": "0x003CC2",
        "sp": "0xD1A845"
      },
      {
        "dir": "out",
        "port": "0xA00C",
        "value": "0x04",
        "pc": "0x003CD4",
        "sp": "0xD1A845"
      },
      {
        "dir": "out",
        "port": "0xA008",
        "value": "0xFF",
        "pc": "0x003CE0",
        "sp": "0xD1A845"
      },
      {
        "dir": "in",
        "port": "0xA008",
        "value": "0x00",
        "pc": "0x003CF3",
        "sp": "0xD1A845"
      },
      {
        "dir": "in",
        "port": "0x0006",
        "value": "0xD0",
        "pc": "0x0006F3",
        "sp": "0xD1A84B"
      },
      {
        "dir": "in",
        "port": "0x0003",
        "value": "0xEE",
        "pc": "0x006816",
        "sp": "0xD1A83C"
      },
      {
        "dir": "in",
        "port": "0x5016",
        "value": "0x00",
        "pc": "0x03CF7D",
        "sp": "0xD1A848"
      },
      {
        "dir": "in",
        "port": "0x5015",
        "value": "0x00",
        "pc": "0x03CFA4",
        "sp": "0xD1A848"
      }
    ],
    "ioCounts": [
      {
        "key": "in:0x0006:0xD0",
        "count": 15
      },
      {
        "key": "in:0x0003:0xEE",
        "count": 36
      },
      {
        "key": "in:0x5016:0x00",
        "count": 14
      },
      {
        "key": "in:0x5015:0x00",
        "count": 14
      },
      {
        "key": "in:0x5014:0x10",
        "count": 13
      },
      {
        "key": "out:0x5008:0x10",
        "count": 13
      },
      {
        "key": "out:0xA000:0x01",
        "count": 14
      },
      {
        "key": "out:0xA00C:0x04",
        "count": 14
      },
      {
        "key": "out:0xA008:0xFF",
        "count": 14
      },
      {
        "key": "in:0xA008:0x00",
        "count": 14
      },
      {
        "key": "in:0x5014:0x00",
        "count": 1
      },
      {
        "key": "out:0x0001:0x00",
        "count": 1
      },
      {
        "key": "out:0x1005:0x02",
        "count": 1
      },
      {
        "key": "out:0x0007:0x02",
        "count": 1
      },
      {
        "key": "out:0x0009:0x02",
        "count": 1
      },
      {
        "key": "out:0x1002:0x06",
        "count": 1
      },
      {
        "key": "out:0x001D:0x00",
        "count": 1
      },
      {
        "key": "out:0x001E:0x00",
        "count": 1
      },
      {
        "key": "out:0x001F:0x02",
        "count": 1
      },
      {
        "key": "out:0x0020:0x7C",
        "count": 1
      },
      {
        "key": "out:0x0021:0x88",
        "count": 1
      },
      {
        "key": "out:0x0022:0xD1",
        "count": 1
      },
      {
        "key": "out:0x0023:0x7C",
        "count": 1
      },
      {
        "key": "out:0x0024:0x88",
        "count": 1
      }
    ],
    "watchedWrites": [
      {
        "kind": "write8",
        "addr": "0xD007CA",
        "width": 1,
        "value": "0x00",
        "pc": "0x0A2150",
        "sp": "0xD1A81E"
      },
      {
        "kind": "write8",
        "addr": "0xD007CB",
        "width": 1,
        "value": "0x00",
        "pc": "0x0A2150",
        "sp": "0xD1A81E"
      },
      {
        "kind": "write8",
        "addr": "0xD007CC",
        "width": 1,
        "value": "0x00",
        "pc": "0x0A2150",
        "sp": "0xD1A81E"
      },
      {
        "kind": "write8",
        "addr": "0xD00121",
        "width": 1,
        "value": "0x00",
        "pc": "0x001879",
        "sp": "0xD1A87B"
      },
      {
        "kind": "write8",
        "addr": "0xD00122",
        "width": 1,
        "value": "0x00",
        "pc": "0x001879",
        "sp": "0xD1A87B"
      },
      {
        "kind": "write8",
        "addr": "0xD00123",
        "width": 1,
        "value": "0x00",
        "pc": "0x001879",
        "sp": "0xD1A87B"
      },
      {
        "kind": "write8",
        "addr": "0xD00124",
        "width": 1,
        "value": "0x00",
        "pc": "0x001879",
        "sp": "0xD1A87B"
      },
      {
        "kind": "write8",
        "addr": "0xD007CA",
        "width": 1,
        "value": "0x00",
        "pc": "0x001879",
        "sp": "0xD1A87B"
      },
      {
        "kind": "write8",
        "addr": "0xD007CB",
        "width": 1,
        "value": "0x00",
        "pc": "0x001879",
        "sp": "0xD1A87B"
      },
      {
        "kind": "write8",
        "addr": "0xD007CC",
        "width": 1,
        "value": "0x00",
        "pc": "0x001879",
        "sp": "0xD1A87B"
      },
      {
        "kind": "write8",
        "addr": "0xD02590",
        "width": 1,
        "value": "0x00",
        "pc": "0x001879",
        "sp": "0xD1A87B"
      },
      {
        "kind": "write8",
        "addr": "0xD02591",
        "width": 1,
        "value": "0x00",
        "pc": "0x001879",
        "sp": "0xD1A87B"
      },
      {
        "kind": "write8",
        "addr": "0xD02592",
        "width": 1,
        "value": "0x00",
        "pc": "0x001879",
        "sp": "0xD1A87B"
      },
      {
        "kind": "write8",
        "addr": "0xD02593",
        "width": 1,
        "value": "0x00",
        "pc": "0x001879",
        "sp": "0xD1A87B"
      },
      {
        "kind": "write8",
        "addr": "0xD02594",
        "width": 1,
        "value": "0x00",
        "pc": "0x001879",
        "sp": "0xD1A87B"
      },
      {
        "kind": "write8",
        "addr": "0xD02595",
        "width": 1,
        "value": "0x00",
        "pc": "0x001879",
        "sp": "0xD1A87B"
      },
      {
        "kind": "write8",
        "addr": "0xD02596",
        "width": 1,
        "value": "0x00",
        "pc": "0x001879",
        "sp": "0xD1A87B"
      },
      {
        "kind": "write8",
        "addr": "0xD02597",
        "width": 1,
        "value": "0x00",
        "pc": "0x001879",
        "sp": "0xD1A87B"
      },
      {
        "kind": "write8",
        "addr": "0xD02598",
        "width": 1,
        "value": "0x00",
        "pc": "0x001879",
        "sp": "0xD1A87B"
      },
      {
        "kind": "write8",
        "addr": "0xD02599",
        "width": 1,
        "value": "0x00",
        "pc": "0x001879",
        "sp": "0xD1A87B"
      },
      {
        "kind": "write8",
        "addr": "0xD0259A",
        "width": 1,
        "value": "0x00",
        "pc": "0x001879",
        "sp": "0xD1A87B"
      },
      {
        "kind": "write8",
        "addr": "0xD0259B",
        "width": 1,
        "value": "0x00",
        "pc": "0x001879",
        "sp": "0xD1A87B"
      },
      {
        "kind": "write8",
        "addr": "0xD0259C",
        "width": 1,
        "value": "0x00",
        "pc": "0x001879",
        "sp": "0xD1A87B"
      },
      {
        "kind": "write8",
        "addr": "0xD0259D",
        "width": 1,
        "value": "0x00",
        "pc": "0x001879",
        "sp": "0xD1A87B"
      },
      {
        "kind": "write8",
        "addr": "0xD0259E",
        "width": 1,
        "value": "0x00",
        "pc": "0x001879",
        "sp": "0xD1A87B"
      },
      {
        "kind": "write8",
        "addr": "0xD0259F",
        "width": 1,
        "value": "0x00",
        "pc": "0x001879",
        "sp": "0xD1A87B"
      },
      {
        "kind": "write24",
        "addr": "0xD00121",
        "width": 3,
        "value": "0x000000",
        "pc": "0x006CB7",
        "sp": "0xD1A83A"
      },
      {
        "kind": "write8",
        "addr": "0xD00124",
        "width": 1,
        "value": "0x0A",
        "pc": "0x006CB7",
        "sp": "0xD1A83A"
      },
      {
        "kind": "write24",
        "addr": "0xD00121",
        "width": 3,
        "value": "0x000040",
        "pc": "0x006D0F",
        "sp": "0xD1A82B"
      },
      {
        "kind": "write8",
        "addr": "0xD00124",
        "width": 1,
        "value": "0x0E",
        "pc": "0x006D4F",
        "sp": "0xD1A82B"
      },
      {
        "kind": "write24",
        "addr": "0xD00121",
        "width": 3,
        "value": "0x000080",
        "pc": "0x006D0F",
        "sp": "0xD1A82B"
      },
      {
        "kind": "write8",
        "addr": "0xD00124",
        "width": 1,
        "value": "0x0E",
        "pc": "0x006D4F",
        "sp": "0xD1A82B"
      },
      {
        "kind": "write24",
        "addr": "0xD00121",
        "width": 3,
        "value": "0x0000C0",
        "pc": "0x006D0F",
        "sp": "0xD1A82B"
      },
      {
        "kind": "write8",
        "addr": "0xD00124",
        "width": 1,
        "value": "0x0E",
        "pc": "0x006D4F",
        "sp": "0xD1A82B"
      },
      {
        "kind": "write24",
        "addr": "0xD00121",
        "width": 3,
        "value": "0x000100",
        "pc": "0x006D0F",
        "sp": "0xD1A82B"
      },
      {
        "kind": "write8",
        "addr": "0xD00124",
        "width": 1,
        "value": "0x0E",
        "pc": "0x006D4F",
        "sp": "0xD1A82B"
      },
      {
        "kind": "write24",
        "addr": "0xD00121",
        "width": 3,
        "value": "0x000104",
        "pc": "0x006D0F",
        "sp": "0xD1A82B"
      },
      {
        "kind": "write24",
        "addr": "0xD00121",
        "width": 3,
        "value": "0x000140",
        "pc": "0x006D0F",
        "sp": "0xD1A82B"
      },
      {
        "kind": "write8",
        "addr": "0xD00124",
        "width": 1,
        "value": "0x0E",
        "pc": "0x006D4F",
        "sp": "0xD1A82B"
      },
      {
        "kind": "write24",
        "addr": "0xD00121",
        "width": 3,
        "value": "0x000180",
        "pc": "0x006D0F",
        "sp": "0xD1A82B"
      }
    ],
    "hotBlocks": [
      {
        "pc": "0x000A92",
        "count": 16256
      },
      {
        "pc": "0x006D5D",
        "count": 10088
      },
      {
        "pc": "0x0021C2",
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
        "pc": "0x0A19A4",
        "count": 3792
      },
      {
        "pc": "0x09EFDE",
        "count": 2880
      },
      {
        "pc": "0x0A18C4",
        "count": 2224
      },
      {
        "pc": "0x0A1A83",
        "count": 1872
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
        "pc": "0x0A1854",
        "count": 752
      },
      {
        "pc": "0x0A187C",
        "count": 752
      },
      {
        "pc": "0x0A188A",
        "count": 752
      },
      {
        "pc": "0x0A189E",
        "count": 752
      },
      {
        "pc": "0x0A18A6",
        "count": 752
      },
      {
        "pc": "0x0A18AF",
        "count": 752
      },
      {
        "pc": "0x0A18C1",
        "count": 752
      }
    ],
    "lastBlocks": [
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
      "0x000B7C",
      "0x000B81",
      "0x000B72",
      "0x000B7F",
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
      "0x000BC1",
      "0x000BC3",
      "0x000BBC",
      "0x000BCB",
      "0x000BD3",
      "0x000BFE",
      "0x000C4A",
      "0x000C80",
      "0x000B37",
      "0x000B5A",
      "0x000B88",
      "0x000BCB",
      "0x000BD3",
      "0x000BFE"
    ]
  },
  {
    "key": "digit2",
    "phase5Snapshot": {
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
    "repaint": {
      "steps": 49474,
      "termination": "halt",
      "lastPc": "0x0019B5",
      "lastMode": "adl"
    },
    "keyResult": {
      "steps": 119306,
      "termination": "sampled-low-route-cycle",
      "lastPc": "0x000BFE",
      "lastMode": "adl"
    },
    "firstLowBlock": 20279,
    "firstCleanupBlock": 10972,
    "targetCounts": {
      "loop08c331": 1,
      "cxMain0585e9": 2,
      "getCsc03fa09": 2,
      "cleanup0018f8": 1,
      "low0064d0": 1,
      "low006cc6": 5,
      "low006cdf": 10083,
      "low006cf7": 10078,
      "low006d0f": 10083,
      "low006d38": 10080,
      "low006d4f": 10080,
      "low006d5d": 10088,
      "low006d64": 10088,
      "helper0021c2": 10092,
      "hot000a92": 16256,
      "hot000bfe": 512,
      "tokenExit08f5e1": 0,
      "tokenGate090992": 0,
      "eolTuple08f54b": 0
    },
    "regionCounts": {
      "low006d00_006dff": 50432,
      "token08f000_090fff": 0,
      "display090000_091fff": 0,
      "cleanup001000_001fff": 2420
    },
    "final": {
      "D007CA": "0x000000",
      "D008E0": "0x000000",
      "D02590": "0x000000",
      "D00121": "0x09D800",
      "D00124": "0x0E",
      "D00587": "0x00",
      "D0058C": "0x00",
      "D0058D": "0x00",
      "D0058E": "0x00",
      "vramPixels": 3039,
      "vramPeak": 8819
    },
    "lowEntrySamples": [
      {
        "name": "first-low-006dxx",
        "block": 20279,
        "pc": "0x006D5D",
        "sp": "0xD1A82B",
        "ix": "0xD1A831",
        "hl": "0x000000",
        "bc": "0x020000",
        "flags": {
          "z": true,
          "c": false
        },
        "state": {
          "D007CA": "0x000000",
          "D008E0": "0x000000",
          "D02590": "0x000000",
          "D00121": "0x000000",
          "D00124": "0x0A",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 3031
        },
        "ixFrame": {
          "IX-39": "0x001717",
          "IX-27": "0xFF0105",
          "IX-24": "0x66",
          "IX-20": "0x400017",
          "IX-11": "0xDA002D",
          "IX-7": "0x00",
          "IX-6": "0x000000",
          "IX-3": "0x020000",
          "IX+0": "0xD1A866",
          "IX+3": "0x0064DE",
          "IX+6": "0x020000",
          "IX+9": "0x000100"
        },
        "callStackTail": [
          "0x013D29",
          "0x0059E9",
          "0x0059F3",
          "0x0059F3",
          "0x0059F3",
          "0x0059F3",
          "0x0059F3",
          "0x0059F3",
          "0x00072D",
          "0x0138F1",
          "0x006475",
          "0x00647D",
          "0x001C44",
          "0x0064C7",
          "0x0064D0",
          "0x006CC6"
        ],
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
          "0x006CC6",
          "0x006D5D"
        ]
      }
    ],
    "stableSamples": [
      {
        "name": "low006d5d-hit-1",
        "block": 20279,
        "pc": "0x006D5D",
        "sp": "0xD1A82B",
        "ix": "0xD1A831",
        "hl": "0x000000",
        "bc": "0x020000",
        "flags": {
          "z": true,
          "c": false
        },
        "state": {
          "D007CA": "0x000000",
          "D008E0": "0x000000",
          "D02590": "0x000000",
          "D00121": "0x000000",
          "D00124": "0x0A",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 3031
        },
        "ixFrame": {
          "IX-39": "0x001717",
          "IX-27": "0xFF0105",
          "IX-24": "0x66",
          "IX-20": "0x400017",
          "IX-11": "0xDA002D",
          "IX-7": "0x00",
          "IX-6": "0x000000",
          "IX-3": "0x020000",
          "IX+0": "0xD1A866",
          "IX+3": "0x0064DE",
          "IX+6": "0x020000",
          "IX+9": "0x000100"
        },
        "callStackTail": [
          "0x013D29",
          "0x0059E9",
          "0x0059F3",
          "0x0059F3",
          "0x0059F3",
          "0x0059F3",
          "0x0059F3",
          "0x0059F3",
          "0x00072D",
          "0x0138F1",
          "0x006475",
          "0x00647D",
          "0x001C44",
          "0x0064C7",
          "0x0064D0",
          "0x006CC6"
        ],
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
          "0x006CC6",
          "0x006D5D"
        ]
      },
      {
        "name": "low006cdf-hit-1",
        "block": 20282,
        "pc": "0x006CDF",
        "sp": "0xD1A82B",
        "ix": "0xD1A831",
        "hl": "0x000100",
        "bc": "0x020000",
        "flags": {
          "z": false,
          "c": false
        },
        "state": {
          "D007CA": "0x000000",
          "D008E0": "0x000000",
          "D02590": "0x000000",
          "D00121": "0x000000",
          "D00124": "0x0A",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 3031
        },
        "ixFrame": {
          "IX-39": "0x001717",
          "IX-27": "0xFF0105",
          "IX-24": "0x66",
          "IX-20": "0x400017",
          "IX-11": "0x640001",
          "IX-7": "0x00",
          "IX-6": "0x000000",
          "IX-3": "0x020000",
          "IX+0": "0xD1A866",
          "IX+3": "0x0064DE",
          "IX+6": "0x020000",
          "IX+9": "0x000100"
        },
        "callStackTail": [
          "0x013D29",
          "0x0059E9",
          "0x0059F3",
          "0x0059F3",
          "0x0059F3",
          "0x0059F3",
          "0x0059F3",
          "0x0059F3",
          "0x00072D",
          "0x0138F1",
          "0x006475",
          "0x00647D",
          "0x001C44",
          "0x0064C7",
          "0x0064D0",
          "0x006CC6"
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
          "0x006CC6",
          "0x006D5D",
          "0x0021C2",
          "0x006D64",
          "0x006CDF"
        ]
      },
      {
        "name": "low006d38-hit-1",
        "block": 20285,
        "pc": "0x006D38",
        "sp": "0xD1A82B",
        "ix": "0xD1A831",
        "hl": "0x000000",
        "bc": "0x000040",
        "flags": {
          "z": true,
          "c": false
        },
        "state": {
          "D007CA": "0x000000",
          "D008E0": "0x000000",
          "D02590": "0x000000",
          "D00121": "0x000040",
          "D00124": "0x0A",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 3031
        },
        "ixFrame": {
          "IX-39": "0x001717",
          "IX-27": "0xFF0105",
          "IX-24": "0x66",
          "IX-20": "0x400017",
          "IX-11": "0x800001",
          "IX-7": "0x00",
          "IX-6": "0x000040",
          "IX-3": "0x000040",
          "IX+0": "0xD1A866",
          "IX+3": "0x0064DE",
          "IX+6": "0x020000",
          "IX+9": "0x0000C0"
        },
        "callStackTail": [
          "0x013D29",
          "0x0059E9",
          "0x0059F3",
          "0x0059F3",
          "0x0059F3",
          "0x0059F3",
          "0x0059F3",
          "0x0059F3",
          "0x00072D",
          "0x0138F1",
          "0x006475",
          "0x00647D",
          "0x001C44",
          "0x0064C7",
          "0x0064D0",
          "0x006CC6"
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
          "0x005B92",
          "0x005A19",
          "0x0059DA",
          "0x0059E6",
          "0x0017FC",
          "0x0064D0",
          "0x006CC6",
          "0x006D5D",
          "0x0021C2",
          "0x006D64",
          "0x006CDF",
          "0x006CF7",
          "0x006D0F",
          "0x006D38"
        ]
      },
      {
        "name": "low006d5d-hit-512",
        "block": 24361,
        "pc": "0x006D5D",
        "sp": "0xD1A82B",
        "ix": "0xD1A831",
        "hl": "0x000000",
        "bc": "0x002001",
        "flags": {
          "z": true,
          "c": false
        },
        "state": {
          "D007CA": "0x000000",
          "D008E0": "0x000000",
          "D02590": "0x000000",
          "D00121": "0x007F00",
          "D00124": "0x0E",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 3031
        },
        "ixFrame": {
          "IX-39": "0x001717",
          "IX-27": "0xFF0105",
          "IX-24": "0x66",
          "IX-20": "0x400017",
          "IX-11": "0x420958",
          "IX-7": "0x00",
          "IX-6": "0x000000",
          "IX-3": "0x000040",
          "IX+0": "0xD1A866",
          "IX+3": "0x006512",
          "IX+6": "0x020104",
          "IX+9": "0x0958BE"
        },
        "callStackTail": [
          "0x0059F3",
          "0x0059F3",
          "0x0059F3",
          "0x0059F3",
          "0x00072D",
          "0x0138F1",
          "0x006475",
          "0x00647D",
          "0x001C44",
          "0x0064C7",
          "0x0064D0",
          "0x006CC6",
          "0x0064DE",
          "0x006CC6",
          "0x0064EE",
          "0x006CC6"
        ],
        "recentBlocks": [
          "0x0021C2",
          "0x006D64",
          "0x006CDF",
          "0x006CF7",
          "0x006D0F",
          "0x006D38",
          "0x006D4F",
          "0x006D5D",
          "0x0021C2",
          "0x006D64",
          "0x006CDF",
          "0x006CF7",
          "0x006D0F",
          "0x006D38",
          "0x006D4F",
          "0x006D5D",
          "0x0021C2",
          "0x006D64",
          "0x006CDF",
          "0x006CF7",
          "0x006D0F",
          "0x006D38",
          "0x006D4F",
          "0x006D5D"
        ]
      },
      {
        "name": "low006cdf-hit-512",
        "block": 24380,
        "pc": "0x006CDF",
        "sp": "0xD1A82B",
        "ix": "0xD1A831",
        "hl": "0x09583E",
        "bc": "0x002001",
        "flags": {
          "z": false,
          "c": false
        },
        "state": {
          "D007CA": "0x000000",
          "D008E0": "0x000000",
          "D02590": "0x000000",
          "D00121": "0x007F80",
          "D00124": "0x0E",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 3031
        },
        "ixFrame": {
          "IX-39": "0x001717",
          "IX-27": "0xFF0105",
          "IX-24": "0x66",
          "IX-20": "0x400017",
          "IX-11": "0x640958",
          "IX-7": "0x00",
          "IX-6": "0x000000",
          "IX-3": "0x000040",
          "IX+0": "0xD1A866",
          "IX+3": "0x006512",
          "IX+6": "0x020104",
          "IX+9": "0x09583E"
        },
        "callStackTail": [
          "0x0059F3",
          "0x0059F3",
          "0x0059F3",
          "0x0059F3",
          "0x00072D",
          "0x0138F1",
          "0x006475",
          "0x00647D",
          "0x001C44",
          "0x0064C7",
          "0x0064D0",
          "0x006CC6",
          "0x0064DE",
          "0x006CC6",
          "0x0064EE",
          "0x006CC6"
        ],
        "recentBlocks": [
          "0x006CF7",
          "0x006D0F",
          "0x006D38",
          "0x006D4F",
          "0x006D5D",
          "0x0021C2",
          "0x006D64",
          "0x006CDF",
          "0x006CF7",
          "0x006D0F",
          "0x006D38",
          "0x006D4F",
          "0x006D5D",
          "0x0021C2",
          "0x006D64",
          "0x006CDF",
          "0x006CF7",
          "0x006D0F",
          "0x006D38",
          "0x006D4F",
          "0x006D5D",
          "0x0021C2",
          "0x006D64",
          "0x006CDF"
        ]
      },
      {
        "name": "low006d38-hit-512",
        "block": 24391,
        "pc": "0x006D38",
        "sp": "0xD1A82B",
        "ix": "0xD1A831",
        "hl": "0x000000",
        "bc": "0x000040",
        "flags": {
          "z": true,
          "c": false
        },
        "state": {
          "D007CA": "0x000000",
          "D008E0": "0x000000",
          "D02590": "0x000000",
          "D00121": "0x008000",
          "D00124": "0x0E",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 3031
        },
        "ixFrame": {
          "IX-39": "0x001717",
          "IX-27": "0xFF0105",
          "IX-24": "0x66",
          "IX-20": "0x400017",
          "IX-11": "0x800957",
          "IX-7": "0x00",
          "IX-6": "0x000040",
          "IX-3": "0x000040",
          "IX+0": "0xD1A866",
          "IX+3": "0x006512",
          "IX+6": "0x020104",
          "IX+9": "0x0957BE"
        },
        "callStackTail": [
          "0x0059F3",
          "0x0059F3",
          "0x0059F3",
          "0x0059F3",
          "0x00072D",
          "0x0138F1",
          "0x006475",
          "0x00647D",
          "0x001C44",
          "0x0064C7",
          "0x0064D0",
          "0x006CC6",
          "0x0064DE",
          "0x006CC6",
          "0x0064EE",
          "0x006CC6"
        ],
        "recentBlocks": [
          "0x006D4F",
          "0x006D5D",
          "0x0021C2",
          "0x006D64",
          "0x006CDF",
          "0x006CF7",
          "0x006D0F",
          "0x006D38",
          "0x006D4F",
          "0x006D5D",
          "0x0021C2",
          "0x006D64",
          "0x006CDF",
          "0x006CF7",
          "0x006D0F",
          "0x006D38",
          "0x006D4F",
          "0x006D5D",
          "0x0021C2",
          "0x006D64",
          "0x006CDF",
          "0x006CF7",
          "0x006D0F",
          "0x006D38"
        ]
      },
      {
        "name": "low006d5d-hit-2048",
        "block": 36649,
        "pc": "0x006D5D",
        "sp": "0xD1A82B",
        "ix": "0xD1A831",
        "hl": "0x000000",
        "bc": "0x002001",
        "flags": {
          "z": true,
          "c": false
        },
        "state": {
          "D007CA": "0x000000",
          "D008E0": "0x000000",
          "D02590": "0x000000",
          "D00121": "0x01FF00",
          "D00124": "0x0E",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 3031
        },
        "ixFrame": {
          "IX-39": "0x001717",
          "IX-27": "0xFF0105",
          "IX-24": "0x66",
          "IX-20": "0x400017",
          "IX-11": "0x4207D8",
          "IX-7": "0x00",
          "IX-6": "0x000000",
          "IX-3": "0x000040",
          "IX+0": "0xD1A866",
          "IX+3": "0x006512",
          "IX+6": "0x020104",
          "IX+9": "0x07D8BE"
        },
        "callStackTail": [
          "0x0059F3",
          "0x0059F3",
          "0x0059F3",
          "0x0059F3",
          "0x00072D",
          "0x0138F1",
          "0x006475",
          "0x00647D",
          "0x001C44",
          "0x0064C7",
          "0x0064D0",
          "0x006CC6",
          "0x0064DE",
          "0x006CC6",
          "0x0064EE",
          "0x006CC6"
        ],
        "recentBlocks": [
          "0x0021C2",
          "0x006D64",
          "0x006CDF",
          "0x006CF7",
          "0x006D0F",
          "0x006D38",
          "0x006D4F",
          "0x006D5D",
          "0x0021C2",
          "0x006D64",
          "0x006CDF",
          "0x006CF7",
          "0x006D0F",
          "0x006D38",
          "0x006D4F",
          "0x006D5D",
          "0x0021C2",
          "0x006D64",
          "0x006CDF",
          "0x006CF7",
          "0x006D0F",
          "0x006D38",
          "0x006D4F",
          "0x006D5D"
        ]
      },
      {
        "name": "low006cdf-hit-2048",
        "block": 36668,
        "pc": "0x006CDF",
        "sp": "0xD1A82B",
        "ix": "0xD1A831",
        "hl": "0x07D83E",
        "bc": "0x002001",
        "flags": {
          "z": false,
          "c": false
        },
        "state": {
          "D007CA": "0x000000",
          "D008E0": "0x000000",
          "D02590": "0x000000",
          "D00121": "0x01FF80",
          "D00124": "0x0E",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 3031
        },
        "ixFrame": {
          "IX-39": "0x001717",
          "IX-27": "0xFF0105",
          "IX-24": "0x66",
          "IX-20": "0x400017",
          "IX-11": "0x6407D8",
          "IX-7": "0x00",
          "IX-6": "0x000000",
          "IX-3": "0x000040",
          "IX+0": "0xD1A866",
          "IX+3": "0x006512",
          "IX+6": "0x020104",
          "IX+9": "0x07D83E"
        },
        "callStackTail": [
          "0x0059F3",
          "0x0059F3",
          "0x0059F3",
          "0x0059F3",
          "0x00072D",
          "0x0138F1",
          "0x006475",
          "0x00647D",
          "0x001C44",
          "0x0064C7",
          "0x0064D0",
          "0x006CC6",
          "0x0064DE",
          "0x006CC6",
          "0x0064EE",
          "0x006CC6"
        ],
        "recentBlocks": [
          "0x006CF7",
          "0x006D0F",
          "0x006D38",
          "0x006D4F",
          "0x006D5D",
          "0x0021C2",
          "0x006D64",
          "0x006CDF",
          "0x006CF7",
          "0x006D0F",
          "0x006D38",
          "0x006D4F",
          "0x006D5D",
          "0x0021C2",
          "0x006D64",
          "0x006CDF",
          "0x006CF7",
          "0x006D0F",
          "0x006D38",
          "0x006D4F",
          "0x006D5D",
          "0x0021C2",
          "0x006D64",
          "0x006CDF"
        ]
      },
      {
        "name": "low006d38-hit-2048",
        "block": 36679,
        "pc": "0x006D38",
        "sp": "0xD1A82B",
        "ix": "0xD1A831",
        "hl": "0x000000",
        "bc": "0x000040",
        "flags": {
          "z": true,
          "c": false
        },
        "state": {
          "D007CA": "0x000000",
          "D008E0": "0x000000",
          "D02590": "0x000000",
          "D00121": "0x020000",
          "D00124": "0x0E",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 3031
        },
        "ixFrame": {
          "IX-39": "0x001717",
          "IX-27": "0xFF0105",
          "IX-24": "0x66",
          "IX-20": "0x400017",
          "IX-11": "0x8007D7",
          "IX-7": "0x00",
          "IX-6": "0x000040",
          "IX-3": "0x000040",
          "IX+0": "0xD1A866",
          "IX+3": "0x006512",
          "IX+6": "0x020104",
          "IX+9": "0x07D7BE"
        },
        "callStackTail": [
          "0x0059F3",
          "0x0059F3",
          "0x0059F3",
          "0x0059F3",
          "0x00072D",
          "0x0138F1",
          "0x006475",
          "0x00647D",
          "0x001C44",
          "0x0064C7",
          "0x0064D0",
          "0x006CC6",
          "0x0064DE",
          "0x006CC6",
          "0x0064EE",
          "0x006CC6"
        ],
        "recentBlocks": [
          "0x006D4F",
          "0x006D5D",
          "0x0021C2",
          "0x006D64",
          "0x006CDF",
          "0x006CF7",
          "0x006D0F",
          "0x006D38",
          "0x006D4F",
          "0x006D5D",
          "0x0021C2",
          "0x006D64",
          "0x006CDF",
          "0x006CF7",
          "0x006D0F",
          "0x006D38",
          "0x006D4F",
          "0x006D5D",
          "0x0021C2",
          "0x006D64",
          "0x006CDF",
          "0x006CF7",
          "0x006D0F",
          "0x006D38"
        ]
      },
      {
        "name": "hot000a92-hit-1",
        "block": 101763,
        "pc": "0x000A92",
        "sp": "0xD1A3BC",
        "ix": "0xD1A3E9",
        "hl": "0x0000E2",
        "bc": "0x000000",
        "flags": {
          "z": false,
          "c": false
        },
        "state": {
          "D007CA": "0x000000",
          "D008E0": "0x000000",
          "D02590": "0x000000",
          "D00121": "0x09D800",
          "D00124": "0x0E",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D02A28": "0x00",
          "D001B8": "0x00",
          "D001D3": "0x00",
          "vramPixels": 3039
        },
        "ixFrame": {
          "IX-39": "0x00002E",
          "IX-27": "0x006C8E",
          "IX-24": "0x00",
          "IX-20": "0x0000E2",
          "IX-11": "0xD1A602",
          "IX-7": "0xF1",
          "IX-6": "0xD1A601",
          "IX-3": "0x000080",
          "IX+0": "0xD1A708",
          "IX+3": "0x000A0A",
          "IX+6": "0xD1A3FB",
          "IX+9": "0xD1A5FF"
        },
        "callStackTail": [
          "0x006475",
          "0x00647D",
          "0x001C44",
          "0x0064C7",
          "0x0064D0",
          "0x006CC6",
          "0x0064DE",
          "0x006CC6",
          "0x0064EE",
          "0x00651C",
          "0x006DCB",
          "0x006CC6",
          "0x00652C",
          "0x00653D",
          "0x00654E",
          "0x00655D"
        ],
        "recentBlocks": [
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
          "0x000A92"
        ]
      }
    ],
    "stateTransitions": [
      {
        "block": 10972,
        "pc": "0x0018F8",
        "D007CA": [
          "0x0585E9",
          "0x000000"
        ],
        "D008E0": [
          "0xD1A863",
          "0x000000"
        ],
        "D02590": [
          "0xD3FE81",
          "0x000000"
        ]
      }
    ],
    "ioSamples": [
      {
        "dir": "in",
        "port": "0x0006",
        "value": "0xD0",
        "pc": "0x0006F3",
        "sp": "0xD1A857"
      },
      {
        "dir": "in",
        "port": "0x0003",
        "value": "0xEE",
        "pc": "0x006816",
        "sp": "0xD1A848"
      },
      {
        "dir": "in",
        "port": "0x5016",
        "value": "0x00",
        "pc": "0x03CF7D",
        "sp": "0xD1A854"
      },
      {
        "dir": "in",
        "port": "0x5015",
        "value": "0x00",
        "pc": "0x03CFA4",
        "sp": "0xD1A854"
      },
      {
        "dir": "in",
        "port": "0x5014",
        "value": "0x10",
        "pc": "0x03CFCF",
        "sp": "0xD1A854"
      },
      {
        "dir": "out",
        "port": "0x5008",
        "value": "0x10",
        "pc": "0x03D029",
        "sp": "0xD1A854"
      },
      {
        "dir": "out",
        "port": "0xA000",
        "value": "0x01",
        "pc": "0x003CC2",
        "sp": "0xD1A84E"
      },
      {
        "dir": "out",
        "port": "0xA00C",
        "value": "0x04",
        "pc": "0x003CD4",
        "sp": "0xD1A84E"
      },
      {
        "dir": "out",
        "port": "0xA008",
        "value": "0xFF",
        "pc": "0x003CE0",
        "sp": "0xD1A84E"
      },
      {
        "dir": "in",
        "port": "0xA008",
        "value": "0x00",
        "pc": "0x003CF3",
        "sp": "0xD1A84E"
      },
      {
        "dir": "in",
        "port": "0x0006",
        "value": "0xD0",
        "pc": "0x0006F3",
        "sp": "0xD1A84E"
      },
      {
        "dir": "in",
        "port": "0x0003",
        "value": "0xEE",
        "pc": "0x006816",
        "sp": "0xD1A83F"
      },
      {
        "dir": "in",
        "port": "0x5016",
        "value": "0x00",
        "pc": "0x03CF7D",
        "sp": "0xD1A84B"
      },
      {
        "dir": "in",
        "port": "0x5015",
        "value": "0x00",
        "pc": "0x03CFA4",
        "sp": "0xD1A84B"
      },
      {
        "dir": "in",
        "port": "0x5014",
        "value": "0x10",
        "pc": "0x03CFCF",
        "sp": "0xD1A84B"
      },
      {
        "dir": "out",
        "port": "0x5008",
        "value": "0x10",
        "pc": "0x03D029",
        "sp": "0xD1A84B"
      },
      {
        "dir": "out",
        "port": "0xA000",
        "value": "0x01",
        "pc": "0x003CC2",
        "sp": "0xD1A845"
      },
      {
        "dir": "out",
        "port": "0xA00C",
        "value": "0x04",
        "pc": "0x003CD4",
        "sp": "0xD1A845"
      },
      {
        "dir": "out",
        "port": "0xA008",
        "value": "0xFF",
        "pc": "0x003CE0",
        "sp": "0xD1A845"
      },
      {
        "dir": "in",
        "port": "0xA008",
        "value": "0x00",
        "pc": "0x003CF3",
        "sp": "0xD1A845"
      },
      {
        "dir": "in",
        "port": "0x0006",
        "value": "0xD0",
        "pc": "0x0006F3",
        "sp": "0xD1A84B"
      },
      {
        "dir": "in",
        "port": "0x0003",
        "value": "0xEE",
        "pc": "0x006816",
        "sp": "0xD1A83C"
      },
      {
        "dir": "in",
        "port": "0x5016",
        "value": "0x00",
        "pc": "0x03CF7D",
        "sp": "0xD1A848"
      },
      {
        "dir": "in",
        "port": "0x5015",
        "value": "0x00",
        "pc": "0x03CFA4",
        "sp": "0xD1A848"
      }
    ],
    "ioCounts": [
      {
        "key": "in:0x0006:0xD0",
        "count": 22
      },
      {
        "key": "in:0x0003:0xEE",
        "count": 44
      },
      {
        "key": "in:0x5016:0x00",
        "count": 21
      },
      {
        "key": "in:0x5015:0x00",
        "count": 21
      },
      {
        "key": "in:0x5014:0x10",
        "count": 18
      },
      {
        "key": "out:0x5008:0x10",
        "count": 18
      },
      {
        "key": "out:0xA000:0x01",
        "count": 19
      },
      {
        "key": "out:0xA00C:0x04",
        "count": 19
      },
      {
        "key": "out:0xA008:0xFF",
        "count": 19
      },
      {
        "key": "in:0xA008:0x00",
        "count": 19
      },
      {
        "key": "in:0x5014:0x00",
        "count": 3
      },
      {
        "key": "in:0x5004:0x11",
        "count": 2
      },
      {
        "key": "in:0x5005:0x00",
        "count": 1
      },
      {
        "key": "out:0x5005:0x00",
        "count": 1
      },
      {
        "key": "in:0x3114:0xFF",
        "count": 1
      },
      {
        "key": "out:0x3114:0xFF",
        "count": 1
      },
      {
        "key": "in:0x31CB:0xFF",
        "count": 1
      },
      {
        "key": "out:0x31CB:0x7F",
        "count": 1
      },
      {
        "key": "in:0x3040:0xFF",
        "count": 1
      },
      {
        "key": "out:0x3040:0xBF",
        "count": 1
      },
      {
        "key": "in:0x3100:0xFF",
        "count": 2
      },
      {
        "key": "out:0x3100:0xFF",
        "count": 2
      },
      {
        "key": "in:0x3010:0xFF",
        "count": 4
      },
      {
        "key": "out:0x3010:0xEF",
        "count": 1
      }
    ],
    "watchedWrites": [
      {
        "kind": "write8",
        "addr": "0xD00121",
        "width": 1,
        "value": "0x00",
        "pc": "0x001879",
        "sp": "0xD1A87B"
      },
      {
        "kind": "write8",
        "addr": "0xD00122",
        "width": 1,
        "value": "0x00",
        "pc": "0x001879",
        "sp": "0xD1A87B"
      },
      {
        "kind": "write8",
        "addr": "0xD00123",
        "width": 1,
        "value": "0x00",
        "pc": "0x001879",
        "sp": "0xD1A87B"
      },
      {
        "kind": "write8",
        "addr": "0xD00124",
        "width": 1,
        "value": "0x00",
        "pc": "0x001879",
        "sp": "0xD1A87B"
      },
      {
        "kind": "write8",
        "addr": "0xD007CA",
        "width": 1,
        "value": "0x00",
        "pc": "0x001879",
        "sp": "0xD1A87B"
      },
      {
        "kind": "write8",
        "addr": "0xD007CB",
        "width": 1,
        "value": "0x00",
        "pc": "0x001879",
        "sp": "0xD1A87B"
      },
      {
        "kind": "write8",
        "addr": "0xD007CC",
        "width": 1,
        "value": "0x00",
        "pc": "0x001879",
        "sp": "0xD1A87B"
      },
      {
        "kind": "write8",
        "addr": "0xD02590",
        "width": 1,
        "value": "0x00",
        "pc": "0x001879",
        "sp": "0xD1A87B"
      },
      {
        "kind": "write8",
        "addr": "0xD02591",
        "width": 1,
        "value": "0x00",
        "pc": "0x001879",
        "sp": "0xD1A87B"
      },
      {
        "kind": "write8",
        "addr": "0xD02592",
        "width": 1,
        "value": "0x00",
        "pc": "0x001879",
        "sp": "0xD1A87B"
      },
      {
        "kind": "write8",
        "addr": "0xD02593",
        "width": 1,
        "value": "0x00",
        "pc": "0x001879",
        "sp": "0xD1A87B"
      },
      {
        "kind": "write8",
        "addr": "0xD02594",
        "width": 1,
        "value": "0x00",
        "pc": "0x001879",
        "sp": "0xD1A87B"
      },
      {
        "kind": "write8",
        "addr": "0xD02595",
        "width": 1,
        "value": "0x00",
        "pc": "0x001879",
        "sp": "0xD1A87B"
      },
      {
        "kind": "write8",
        "addr": "0xD02596",
        "width": 1,
        "value": "0x00",
        "pc": "0x001879",
        "sp": "0xD1A87B"
      },
      {
        "kind": "write8",
        "addr": "0xD02597",
        "width": 1,
        "value": "0x00",
        "pc": "0x001879",
        "sp": "0xD1A87B"
      },
      {
        "kind": "write8",
        "addr": "0xD02598",
        "width": 1,
        "value": "0x00",
        "pc": "0x001879",
        "sp": "0xD1A87B"
      },
      {
        "kind": "write8",
        "addr": "0xD02599",
        "width": 1,
        "value": "0x00",
        "pc": "0x001879",
        "sp": "0xD1A87B"
      },
      {
        "kind": "write8",
        "addr": "0xD0259A",
        "width": 1,
        "value": "0x00",
        "pc": "0x001879",
        "sp": "0xD1A87B"
      },
      {
        "kind": "write8",
        "addr": "0xD0259B",
        "width": 1,
        "value": "0x00",
        "pc": "0x001879",
        "sp": "0xD1A87B"
      },
      {
        "kind": "write8",
        "addr": "0xD0259C",
        "width": 1,
        "value": "0x00",
        "pc": "0x001879",
        "sp": "0xD1A87B"
      },
      {
        "kind": "write8",
        "addr": "0xD0259D",
        "width": 1,
        "value": "0x00",
        "pc": "0x001879",
        "sp": "0xD1A87B"
      },
      {
        "kind": "write8",
        "addr": "0xD0259E",
        "width": 1,
        "value": "0x00",
        "pc": "0x001879",
        "sp": "0xD1A87B"
      },
      {
        "kind": "write8",
        "addr": "0xD0259F",
        "width": 1,
        "value": "0x00",
        "pc": "0x001879",
        "sp": "0xD1A87B"
      },
      {
        "kind": "write24",
        "addr": "0xD00121",
        "width": 3,
        "value": "0x000000",
        "pc": "0x006CB7",
        "sp": "0xD1A83A"
      },
      {
        "kind": "write8",
        "addr": "0xD00124",
        "width": 1,
        "value": "0x0A",
        "pc": "0x006CB7",
        "sp": "0xD1A83A"
      },
      {
        "kind": "write24",
        "addr": "0xD00121",
        "width": 3,
        "value": "0x000040",
        "pc": "0x006D0F",
        "sp": "0xD1A82B"
      },
      {
        "kind": "write8",
        "addr": "0xD00124",
        "width": 1,
        "value": "0x0E",
        "pc": "0x006D4F",
        "sp": "0xD1A82B"
      },
      {
        "kind": "write24",
        "addr": "0xD00121",
        "width": 3,
        "value": "0x000080",
        "pc": "0x006D0F",
        "sp": "0xD1A82B"
      },
      {
        "kind": "write8",
        "addr": "0xD00124",
        "width": 1,
        "value": "0x0E",
        "pc": "0x006D4F",
        "sp": "0xD1A82B"
      },
      {
        "kind": "write24",
        "addr": "0xD00121",
        "width": 3,
        "value": "0x0000C0",
        "pc": "0x006D0F",
        "sp": "0xD1A82B"
      },
      {
        "kind": "write8",
        "addr": "0xD00124",
        "width": 1,
        "value": "0x0E",
        "pc": "0x006D4F",
        "sp": "0xD1A82B"
      },
      {
        "kind": "write24",
        "addr": "0xD00121",
        "width": 3,
        "value": "0x000100",
        "pc": "0x006D0F",
        "sp": "0xD1A82B"
      },
      {
        "kind": "write8",
        "addr": "0xD00124",
        "width": 1,
        "value": "0x0E",
        "pc": "0x006D4F",
        "sp": "0xD1A82B"
      },
      {
        "kind": "write24",
        "addr": "0xD00121",
        "width": 3,
        "value": "0x000104",
        "pc": "0x006D0F",
        "sp": "0xD1A82B"
      },
      {
        "kind": "write24",
        "addr": "0xD00121",
        "width": 3,
        "value": "0x000140",
        "pc": "0x006D0F",
        "sp": "0xD1A82B"
      },
      {
        "kind": "write8",
        "addr": "0xD00124",
        "width": 1,
        "value": "0x0E",
        "pc": "0x006D4F",
        "sp": "0xD1A82B"
      },
      {
        "kind": "write24",
        "addr": "0xD00121",
        "width": 3,
        "value": "0x000180",
        "pc": "0x006D0F",
        "sp": "0xD1A82B"
      },
      {
        "kind": "write8",
        "addr": "0xD00124",
        "width": 1,
        "value": "0x0E",
        "pc": "0x006D4F",
        "sp": "0xD1A82B"
      },
      {
        "kind": "write24",
        "addr": "0xD00121",
        "width": 3,
        "value": "0x0001C0",
        "pc": "0x006D0F",
        "sp": "0xD1A82B"
      },
      {
        "kind": "write8",
        "addr": "0xD00124",
        "width": 1,
        "value": "0x0E",
        "pc": "0x006D4F",
        "sp": "0xD1A82B"
      }
    ],
    "hotBlocks": [
      {
        "pc": "0x000A92",
        "count": 16256
      },
      {
        "pc": "0x0021C2",
        "count": 10092
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
        "count": 912
      },
      {
        "pc": "0x000BFE",
        "count": 512
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
        "pc": "0x000AC5",
        "count": 256
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
        "pc": "0x000AEE",
        "count": 254
      },
      {
        "pc": "0x000A79",
        "count": 254
      },
      {
        "pc": "0x0A1854",
        "count": 176
      },
      {
        "pc": "0x0A187C",
        "count": 176
      }
    ],
    "lastBlocks": [
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
      "0x000B7C",
      "0x000B81",
      "0x000B72",
      "0x000B7F",
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
      "0x000BC1",
      "0x000BC3",
      "0x000BBC",
      "0x000BCB",
      "0x000BD3",
      "0x000BFE",
      "0x000C4A",
      "0x000C80",
      "0x000B37",
      "0x000B5A",
      "0x000B88",
      "0x000BCB",
      "0x000BD3",
      "0x000BFE"
    ]
  }
]
```

## Interpretation

The clean repaint fixes the VAT-search residual but does not preserve a dispatchable OS state through the first key cleanup. In both tested keys, `_GetCSC`/`cxMain` are reached before cleanup, then context/VAT state is zero by the first low-route entry. The transition samples show EOL/CLEAR clears `D007CA`/`D008E0` earlier at `0x0A2156` and clears VAT at `0x0018F8`; Digit2 clears the watched context/VAT fields at `0x0018F8`. The next durable hot path is the low-level `0x006Dxx` transfer/status loop, with no visits to the token-size/token-buffer/EOL tuple addresses. That explains the max-step behavior: the run is no longer in the token-display path by the time it becomes hot; it is waiting/retrying in a low ROM hardware/status loop using the `D00121/D00124` frame state.

No runtime, transpiler, or browser source files were modified.


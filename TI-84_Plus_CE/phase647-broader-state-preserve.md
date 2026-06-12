# Phase 647: Broader State Preservation Test

Probe: `probe-phase647-broader-state-preserve.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase647-broader-state-preserve.mjs`

## Summary

- **** Clean repaint still halts before all preservation variants.
- **** Restore hooks fired for every core and broad preservation variant.
- **** Every variant reached a bounded diagnostic outcome: low/hot route, repeated early-clear loop, or token/tail hit.
- *** Low/hot route remains active in 3/4 variants.
- *** Broad EOL restoration changes the failure mode: 1 variant enters a repeated `0x0A2150` clear loop before low-route selection.
- **** Token/tail hooks remain bypassed in all variants: `0x08F5E1`, `0x090992`, and `0x08F54B` all stay at zero hits.
- **** Broad IY/key/edit/low-frame restoration is negative: it preserves more RAM but does not reopen the token/tail route.

## Scenario Results

| Key | Preserve mode | Key trace | Restores | 0x0017FC | 0x0064D0 | 0x006CC6 | 0x006D5D | 0x006D64 | 0x000A92 | 0x000BFE | Token/tail | Final D007CA | Final D008E0 | Final VAT | D0058E | D00121 | D00124 |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|---|---|---|
| EOL/CLEAR | core | after-hot-low-loop-inputs 0x000BFE | 2 | 4 | 1 | 5 | 10088 | 10088 | 16256 | 18 | 0 | 0x0585E9 | 0xD1A863 | 0xD3FE81 | 0x00 | 0x09D800 | 0x0E |
| EOL/CLEAR | broad | repeated-0x0A2150-clear-loop 0x0A2150 | 3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0x0585E9 | 0xD1A863 | 0xD3FE81 | 0x0F | 0x000000 | 0x00 |
| Digit2 | core | after-hot-low-loop-inputs 0x000BFE | 1 | 4 | 1 | 5 | 10088 | 10088 | 16256 | 18 | 0 | 0x0585E9 | 0xD1A863 | 0xD3FE81 | 0x00 | 0x09D800 | 0x0E |
| Digit2 | broad | after-hot-low-loop-inputs 0x000BFE | 1 | 4 | 1 | 5 | 10088 | 10088 | 16256 | 18 | 0 | 0x0585E9 | 0xD1A863 | 0xD3FE81 | 0x90 | 0x09D800 | 0x0E |

## Clean Repaint Controls

```json
{
  "eol-clear": {
    "steps": 49474,
    "termination": "halt",
    "lastPc": "0x0019B5",
    "lastMode": "adl"
  },
  "digit2": {
    "steps": 49474,
    "termination": "halt",
    "lastPc": "0x0019B5",
    "lastMode": "adl"
  }
}
```

## First Broad Low-Frame Inputs

```json
{
  "eolClearBroadFirst006cc6": null,
  "digit2BroadFirst006cc6": {
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
      "D00587": "0x1A",
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
      "vramPixels": 3031
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

## Static Low-Route Snippets

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
    "preserveMode": "core",
    "preserveLabel": "Core cx/VAT restore",
    "keyResult": {
      "steps": 156231,
      "termination": "after-hot-low-loop-inputs",
      "lastPc": "0x000BFE",
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
      "lowCaller0017fc": 4,
      "lowSelect0064d0": 1,
      "lowFrame006cc6": 5,
      "lowLoop006cdf": 10083,
      "lowPoll006d38": 10080,
      "lowCall006d5d": 10088,
      "lowBackedge006d64": 10088,
      "hot000a92": 16256,
      "hot000bfe": 18,
      "tokenExit08f5e1": 0,
      "tokenGate090992": 0,
      "eolTuple08f54b": 0
    },
    "firstHits": {
      "outerLoop08c331": 1,
      "cxMain0585e9": 1933,
      "eolClear0a2150": 20931,
      "eolFill0a2156": 20932,
      "getCsc03fa09": 32348,
      "bulkClear001879": 48553,
      "bulkTail0018f8": 48554,
      "lowCaller0017fc": 57733,
      "lowSelect0064d0": 57859,
      "lowFrame006cc6": 57860,
      "lowCall006d5d": 57861,
      "lowBackedge006d64": 57863,
      "lowLoop006cdf": 57864,
      "lowPoll006d38": 57867,
      "hot000a92": 139345,
      "hot000bfe": 156214
    },
    "restorations": [
      {
        "label": "after-0x0A2150-LDIR",
        "atBlock": 20932,
        "atPc": "0x0A2156",
        "afterD007CA": "0x0585E9",
        "afterD008E0": "0xD1A863",
        "afterD02590": "0xD3FE81",
        "afterD0058E": "0x0F",
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
        "afterD0058E": "0x00",
        "afterD00121": "0x000000",
        "afterD00124": "0x00"
      }
    ],
    "branchSamples": [
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
      {
        "name": "lowCall006d5d",
        "block": 57861,
        "pc": "0x006D5D",
        "state": {
          "pc": "0x006D5D",
          "sp": "0xD1A82B",
          "ix": "0xD1A831",
          "iy": "0xD00080",
          "af": "0x0042",
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
        "ixFrame": {
          "IX-45": "0x004502",
          "IX-42": "0x360000",
          "IX-39": "0x001717",
          "IX-30": "0xFFFFFC",
          "IX-27": "0xFF0105",
          "IX-24": "0x66",
          "IX-20": "0x400017",
          "IX-17": "0x000002",
          "IX-11": "0xDA002D",
          "IX-8": "0x59",
          "IX-7": "0x00",
          "IX-6": "0x000000",
          "IX-3": "0x020000",
          "IX+0": "0xD1A866",
          "IX+3": "0x0064DE",
          "IX+6": "0x020000",
          "IX+9": "0x000100"
        },
        "stackTop": [
          {
            "addr": "0xD1A82B",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A82E",
            "value": "0x020000"
          },
          {
            "addr": "0xD1A831",
            "value": "0xD1A866"
          },
          {
            "addr": "0xD1A834",
            "value": "0x0064DE"
          },
          {
            "addr": "0xD1A837",
            "value": "0x020000"
          }
        ],
        "callStackTail": [
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
        "name": "lowBackedge006d64",
        "block": 57863,
        "pc": "0x006D64",
        "state": {
          "pc": "0x006D64",
          "sp": "0xD1A82B",
          "ix": "0xD1A831",
          "iy": "0xD00080",
          "af": "0x0002",
          "bc": "0x020000",
          "de": "0x000240",
          "hl": "0x000100",
          "flags": {
            "z": false,
            "c": false,
            "n": true
          },
          "D00121": "0x000000",
          "D00124": "0x0A",
          "D00587": "0x00",
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
        "ixFrame": {
          "IX-45": "0x004502",
          "IX-42": "0x360000",
          "IX-39": "0x001717",
          "IX-30": "0xFFFFFC",
          "IX-27": "0xFF0105",
          "IX-24": "0x66",
          "IX-20": "0x400017",
          "IX-17": "0x400002",
          "IX-11": "0x640001",
          "IX-8": "0x6D",
          "IX-7": "0x00",
          "IX-6": "0x000000",
          "IX-3": "0x020000",
          "IX+0": "0xD1A866",
          "IX+3": "0x0064DE",
          "IX+6": "0x020000",
          "IX+9": "0x000100"
        },
        "stackTop": [
          {
            "addr": "0xD1A82B",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A82E",
            "value": "0x020000"
          },
          {
            "addr": "0xD1A831",
            "value": "0xD1A866"
          },
          {
            "addr": "0xD1A834",
            "value": "0x0064DE"
          },
          {
            "addr": "0xD1A837",
            "value": "0x020000"
          }
        ],
        "callStackTail": [
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
          "0x005B92",
          "0x005A19",
          "0x0059DA",
          "0x0059E6",
          "0x0017FC",
          "0x0064D0",
          "0x006CC6",
          "0x006D5D",
          "0x0021C2",
          "0x006D64"
        ]
      },
      {
        "name": "hot000a92",
        "block": 139345,
        "pc": "0x000A92",
        "state": {
          "pc": "0x000A92",
          "sp": "0xD1A3BC",
          "ix": "0xD1A3E9",
          "iy": "0xD00080",
          "af": "0xE13E",
          "bc": "0x000000",
          "de": "0xD1A3FD",
          "hl": "0x0000E2",
          "flags": {
            "z": false,
            "c": false,
            "n": true
          },
          "D00121": "0x09D800",
          "D00124": "0x0E",
          "D00587": "0x00",
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
          "vramPixels": 3039
        },
        "ixFrame": {
          "IX-45": "0x000000",
          "IX-42": "0x000000",
          "IX-39": "0x00002E",
          "IX-30": "0xD1A47D",
          "IX-27": "0x006C8E",
          "IX-24": "0x00",
          "IX-20": "0x0000E2",
          "IX-17": "0x000001",
          "IX-11": "0xD1A602",
          "IX-8": "0x7F",
          "IX-7": "0xF1",
          "IX-6": "0xD1A601",
          "IX-3": "0x000080",
          "IX+0": "0xD1A708",
          "IX+3": "0x000A0A",
          "IX+6": "0xD1A3FB",
          "IX+9": "0xD1A5FF"
        },
        "stackTop": [
          {
            "addr": "0xD1A3BC",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A3BF",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A3C2",
            "value": "0x00002E"
          },
          {
            "addr": "0xD1A3C5",
            "value": "0x00EADA"
          },
          {
            "addr": "0xD1A3C8",
            "value": "0x002ECA"
          }
        ],
        "callStackTail": [
          "0x0009F9"
        ],
        "recentBlocks": [
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
      },
      {
        "name": "hot000bfe",
        "block": 156214,
        "pc": "0x000BFE",
        "state": {
          "pc": "0x000BFE",
          "sp": "0xD1A3BC",
          "ix": "0xD1A3E9",
          "iy": "0xD00080",
          "af": "0x7F28",
          "bc": "0x000000",
          "de": "0x000005",
          "hl": "0x00007F",
          "flags": {
            "z": false,
            "c": false,
            "n": false
          },
          "D00121": "0x09D800",
          "D00124": "0x0E",
          "D00587": "0x00",
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
          "vramPixels": 3039
        },
        "ixFrame": {
          "IX-45": "0x00007F",
          "IX-42": "0x000000",
          "IX-39": "0x000001",
          "IX-30": "0xD1A47D",
          "IX-27": "0x006C0F",
          "IX-24": "0x09",
          "IX-20": "0x000008",
          "IX-17": "0x000100",
          "IX-11": "0xD1A681",
          "IX-8": "0x00",
          "IX-7": "0x2E",
          "IX-6": "0xD1A680",
          "IX-3": "0x000080",
          "IX+0": "0xD1A708",
          "IX+3": "0x000A0A",
          "IX+6": "0xD1A3FB",
          "IX+9": "0xD1A5FF"
        },
        "stackTop": [
          {
            "addr": "0xD1A3BC",
            "value": "0x00007F"
          },
          {
            "addr": "0xD1A3BF",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A3C2",
            "value": "0x000001"
          },
          {
            "addr": "0xD1A3C5",
            "value": "0x00EADA"
          },
          {
            "addr": "0xD1A3C8",
            "value": "0x088D5B"
          }
        ],
        "callStackTail": [
          "0x0009F9"
        ],
        "recentBlocks": [
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
          "0x000B7F",
          "0x000B83",
          "0x000BCB",
          "0x000BD3",
          "0x000BFE"
        ]
      }
    ],
    "branchOutcomes": [
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
      },
      {
        "name": "lowFrame006cc6",
        "targetPc": "0x006CC6",
        "beforeBlock": 57860,
        "afterBlock": 57861,
        "afterPc": "0x006D5D",
        "before": {
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
          "pc": "0x006D5D",
          "sp": "0xD1A82B",
          "ix": "0xD1A831",
          "iy": "0xD00080",
          "af": "0x0042",
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
      },
      {
        "name": "lowCall006d5d",
        "targetPc": "0x006D5D",
        "beforeBlock": 57861,
        "afterBlock": 57862,
        "afterPc": "0x0021C2",
        "before": {
          "pc": "0x006D5D",
          "sp": "0xD1A82B",
          "ix": "0xD1A831",
          "iy": "0xD00080",
          "af": "0x0042",
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
          "pc": "0x0021C2",
          "sp": "0xD1A828",
          "ix": "0xD1A831",
          "iy": "0xD00080",
          "af": "0x0042",
          "bc": "0x020000",
          "de": "0x000240",
          "hl": "0x000100",
          "flags": {
            "z": true,
            "c": false,
            "n": true
          },
          "D00121": "0x000000",
          "D00124": "0x0A",
          "D00587": "0x00",
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
      },
      {
        "name": "lowBackedge006d64",
        "targetPc": "0x006D64",
        "beforeBlock": 57863,
        "afterBlock": 57864,
        "afterPc": "0x006CDF",
        "before": {
          "pc": "0x006D64",
          "sp": "0xD1A82B",
          "ix": "0xD1A831",
          "iy": "0xD00080",
          "af": "0x0002",
          "bc": "0x020000",
          "de": "0x000240",
          "hl": "0x000100",
          "flags": {
            "z": false,
            "c": false,
            "n": true
          },
          "D00121": "0x000000",
          "D00124": "0x0A",
          "D00587": "0x00",
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
          "pc": "0x006CDF",
          "sp": "0xD1A82B",
          "ix": "0xD1A831",
          "iy": "0xD00080",
          "af": "0x0002",
          "bc": "0x020000",
          "de": "0x000240",
          "hl": "0x000100",
          "flags": {
            "z": false,
            "c": false,
            "n": true
          },
          "D00121": "0x000000",
          "D00124": "0x0A",
          "D00587": "0x00",
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
      },
      {
        "name": "hot000a92",
        "targetPc": "0x000A92",
        "beforeBlock": 139345,
        "afterBlock": 139346,
        "afterPc": "0x000A92",
        "before": {
          "pc": "0x000A92",
          "sp": "0xD1A3BC",
          "ix": "0xD1A3E9",
          "iy": "0xD00080",
          "af": "0xE13E",
          "bc": "0x000000",
          "de": "0xD1A3FD",
          "hl": "0x0000E2",
          "flags": {
            "z": false,
            "c": false,
            "n": true
          },
          "D00121": "0x09D800",
          "D00124": "0x0E",
          "D00587": "0x00",
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
          "vramPixels": 3039
        },
        "after": {
          "pc": "0x000A92",
          "sp": "0xD1A3BC",
          "ix": "0xD1A3E9",
          "iy": "0xD00080",
          "af": "0xD02A",
          "bc": "0x000000",
          "de": "0xD1A3FE",
          "hl": "0x0000C2",
          "flags": {
            "z": false,
            "c": false,
            "n": true
          },
          "D00121": "0x09D800",
          "D00124": "0x0E",
          "D00587": "0x00",
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
          "vramPixels": 3039
        }
      },
      {
        "name": "hot000bfe",
        "targetPc": "0x000BFE",
        "beforeBlock": 156214,
        "afterBlock": 156215,
        "afterPc": "0x000BFE",
        "before": {
          "pc": "0x000BFE",
          "sp": "0xD1A3BC",
          "ix": "0xD1A3E9",
          "iy": "0xD00080",
          "af": "0x7F28",
          "bc": "0x000000",
          "de": "0x000005",
          "hl": "0x00007F",
          "flags": {
            "z": false,
            "c": false,
            "n": false
          },
          "D00121": "0x09D800",
          "D00124": "0x0E",
          "D00587": "0x00",
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
          "vramPixels": 3039
        },
        "after": {
          "pc": "0x000BFE",
          "sp": "0xD1A3BC",
          "ix": "0xD1A3E9",
          "iy": "0xD00080",
          "af": "0x7E2C",
          "bc": "0x000000",
          "de": "0x00005D",
          "hl": "0x00007E",
          "flags": {
            "z": false,
            "c": false,
            "n": false
          },
          "D00121": "0x09D800",
          "D00124": "0x0E",
          "D00587": "0x00",
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
          "vramPixels": 3039
        }
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
      }
    ],
    "lastBlocks": [
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
      "0x000B37",
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
      "0x000B7F",
      "0x000B72",
      "0x000B7C",
      "0x000B81",
      "0x000B72",
      "0x000B7C",
      "0x000B81",
      "0x000B72",
      "0x000B7F",
      "0x000B83",
      "0x000BCB",
      "0x000BD3",
      "0x000BFE"
    ],
    "final": {
      "pc": "0x000BFE",
      "sp": "0xD1A3BC",
      "ix": "0xD1A3E9",
      "iy": "0xD00080",
      "af": "0x6E28",
      "bc": "0xFFFFFF",
      "de": "0x0000D8",
      "hl": "0x00006E",
      "flags": {
        "z": false,
        "c": false,
        "n": false
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
      "D00121": "0x09D800",
      "D00124": "0x0E",
      "D00587": "0x00",
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
      "vramPixels": 3039
    }
  },
  {
    "key": "EOL/CLEAR",
    "preserveMode": "broad",
    "preserveLabel": "Broad IY/key/edit/low-frame restore",
    "keyResult": {
      "steps": 58990,
      "termination": "repeated-0x0A2150-clear-loop",
      "lastPc": "0x0A2150",
      "lastMode": "adl"
    },
    "counts": {
      "outerLoop08c331": 1,
      "cxMain0585e9": 1,
      "getCsc03fa09": 0,
      "eolClear0a2150": 3,
      "eolFill0a2156": 51,
      "bulkClear001879": 0,
      "bulkTail0018f8": 0,
      "lowCaller0017fc": 0,
      "lowSelect0064d0": 0,
      "lowFrame006cc6": 0,
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
      "cxMain0585e9": 1933,
      "eolClear0a2150": 20931,
      "eolFill0a2156": 20932
    },
    "restorations": [
      {
        "label": "after-0x0A2150-LDIR",
        "atBlock": 20932,
        "atPc": "0x0A2156",
        "afterD007CA": "0x0585E9",
        "afterD008E0": "0xD1A863",
        "afterD02590": "0xD3FE81",
        "afterD0058E": "0x0F",
        "afterD00121": "0x000000",
        "afterD00124": "0x00"
      },
      {
        "label": "after-0x0A2150-LDIR",
        "atBlock": 39961,
        "atPc": "0x0A2156",
        "afterD007CA": "0x0585E9",
        "afterD008E0": "0xD1A863",
        "afterD02590": "0xD3FE81",
        "afterD0058E": "0x0F",
        "afterD00121": "0x000000",
        "afterD00124": "0x00"
      },
      {
        "label": "after-0x0A2150-LDIR",
        "atBlock": 58990,
        "atPc": "0x0A2156",
        "afterD007CA": "0x0585E9",
        "afterD008E0": "0xD1A863",
        "afterD02590": "0xD3FE81",
        "afterD0058E": "0x0F",
        "afterD00121": "0x000000",
        "afterD00124": "0x00"
      }
    ],
    "branchSamples": [],
    "branchOutcomes": [],
    "hotBlocks": [
      {
        "pc": "0x09EFDE",
        "count": 8640
      },
      {
        "pc": "0x0A19A4",
        "count": 6464
      },
      {
        "pc": "0x0A18C4",
        "count": 3776
      },
      {
        "pc": "0x0A1A83",
        "count": 3184
      },
      {
        "pc": "0x0A1854",
        "count": 1280
      },
      {
        "pc": "0x0A187C",
        "count": 1280
      },
      {
        "pc": "0x0A188A",
        "count": 1280
      },
      {
        "pc": "0x0A189E",
        "count": 1280
      },
      {
        "pc": "0x0A18A6",
        "count": 1280
      },
      {
        "pc": "0x0A18AF",
        "count": 1280
      },
      {
        "pc": "0x0A18C1",
        "count": 1280
      },
      {
        "pc": "0x0A18CA",
        "count": 1280
      },
      {
        "pc": "0x0A18E9",
        "count": 1280
      },
      {
        "pc": "0x0A191F",
        "count": 1280
      },
      {
        "pc": "0x0A1939",
        "count": 1280
      },
      {
        "pc": "0x0A1969",
        "count": 1280
      },
      {
        "pc": "0x0A1976",
        "count": 1280
      },
      {
        "pc": "0x0A1980",
        "count": 1280
      },
      {
        "pc": "0x0A1988",
        "count": 1280
      },
      {
        "pc": "0x0A1994",
        "count": 1280
      },
      {
        "pc": "0x0A19AA",
        "count": 1280
      },
      {
        "pc": "0x0A19B5",
        "count": 1280
      },
      {
        "pc": "0x0A19B7",
        "count": 1280
      },
      {
        "pc": "0x0A19D7",
        "count": 1280
      },
      {
        "pc": "0x0A1A1D",
        "count": 1280
      },
      {
        "pc": "0x0A18EB",
        "count": 656
      },
      {
        "pc": "0x0A190D",
        "count": 656
      },
      {
        "pc": "0x0A18F9",
        "count": 624
      },
      {
        "pc": "0x0A18FD",
        "count": 624
      },
      {
        "pc": "0x04C973",
        "count": 157
      }
    ],
    "lastBlocks": [
      "0x001C44",
      "0x001C7D",
      "0x001CA6",
      "0x001CC0",
      "0x001CCA",
      "0x001CE4",
      "0x001C81",
      "0x001C82",
      "0x001C48",
      "0x001C33",
      "0x001C38",
      "0x001C3C",
      "0x001C42",
      "0x006810",
      "0x006812",
      "0x001C4F",
      "0x001CA6",
      "0x001CC0",
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
      "0x003CD4",
      "0x003CE0",
      "0x003CEE",
      "0x003CF3",
      "0x03F998",
      "0x03F99A",
      "0x03F9AB",
      "0x03F9AE",
      "0x03D058",
      "0x03D060",
      "0x03D0E0",
      "0x0A20A8",
      "0x0A212C",
      "0x0A2A37",
      "0x0A2133",
      "0x0A2A37",
      "0x0A214B",
      "0x0A2150",
      "0x0A2156"
    ],
    "final": {
      "pc": "0x0A2156",
      "sp": "0xD1A81E",
      "ix": "0xD02504",
      "iy": "0xD00080",
      "af": "0x20A8",
      "bc": "0x001900",
      "de": "0xD020A7",
      "hl": "0xD020C0",
      "flags": {
        "z": false,
        "c": false,
        "n": false
      },
      "D00080": "0x08",
      "D00081": "0x04",
      "D0008D": "0x0E",
      "D0009F": "0x20",
      "D000A0": "0x00",
      "D000A3": "0x00",
      "D000A8": "0x00",
      "D000C2": "0x00",
      "D000C4": "0x00",
      "D00121": "0x000000",
      "D00124": "0x00",
      "D00587": "0x0F",
      "D0058C": "0x0F",
      "D0058D": "0x0F",
      "D0058E": "0x0F",
      "D007CA": "0x0585E9",
      "D007CD": "0x058B19",
      "D007D0": "0x058B7E",
      "D008E0": "0xD1A863",
      "D0231A": "0x000000",
      "D0243A": "0xD1A8A3",
      "D0243D": "0xD2A815",
      "D02590": "0xD3FE81",
      "D02593": "0xD3FE81",
      "D0259A": "0xD3FE81",
      "D0259D": "0xD3FECD",
      "D025C5": "0x0C0000",
      "D02A28": "0x00",
      "D001B8": "0x00",
      "D001D3": "0x00",
      "vramPixels": 11429
    }
  },
  {
    "key": "Digit2",
    "preserveMode": "core",
    "preserveLabel": "Core cx/VAT restore",
    "keyResult": {
      "steps": 118649,
      "termination": "after-hot-low-loop-inputs",
      "lastPc": "0x000BFE",
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
      "lowCaller0017fc": 4,
      "lowSelect0064d0": 1,
      "lowFrame006cc6": 5,
      "lowLoop006cdf": 10083,
      "lowPoll006d38": 10080,
      "lowCall006d5d": 10088,
      "lowBackedge006d64": 10088,
      "hot000a92": 16256,
      "hot000bfe": 18,
      "tokenExit08f5e1": 0,
      "tokenGate090992": 0,
      "eolTuple08f54b": 0
    },
    "firstHits": {
      "outerLoop08c331": 1,
      "cxMain0585e9": 1953,
      "getCsc03fa09": 4927,
      "bulkClear001879": 10971,
      "bulkTail0018f8": 10972,
      "lowCaller0017fc": 20151,
      "lowSelect0064d0": 20277,
      "lowFrame006cc6": 20278,
      "lowCall006d5d": 20279,
      "lowBackedge006d64": 20281,
      "lowLoop006cdf": 20282,
      "lowPoll006d38": 20285,
      "hot000a92": 101763,
      "hot000bfe": 118632
    },
    "restorations": [
      {
        "label": "after-0x001879-bulk-clear",
        "atBlock": 10972,
        "atPc": "0x0018F8",
        "afterD007CA": "0x0585E9",
        "afterD008E0": "0xD1A863",
        "afterD02590": "0xD3FE81",
        "afterD0058E": "0x00",
        "afterD00121": "0x000000",
        "afterD00124": "0x00"
      }
    ],
    "branchSamples": [
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
      {
        "name": "lowCall006d5d",
        "block": 20279,
        "pc": "0x006D5D",
        "state": {
          "pc": "0x006D5D",
          "sp": "0xD1A82B",
          "ix": "0xD1A831",
          "iy": "0xD00080",
          "af": "0x0042",
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
        "ixFrame": {
          "IX-45": "0x004502",
          "IX-42": "0xD1A800",
          "IX-39": "0x001717",
          "IX-30": "0xFFFFFC",
          "IX-27": "0xFF0105",
          "IX-24": "0x66",
          "IX-20": "0x400017",
          "IX-17": "0x000002",
          "IX-11": "0xDA002D",
          "IX-8": "0x59",
          "IX-7": "0x00",
          "IX-6": "0x000000",
          "IX-3": "0x020000",
          "IX+0": "0xD1A866",
          "IX+3": "0x0064DE",
          "IX+6": "0x020000",
          "IX+9": "0x000100"
        },
        "stackTop": [
          {
            "addr": "0xD1A82B",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A82E",
            "value": "0x020000"
          },
          {
            "addr": "0xD1A831",
            "value": "0xD1A866"
          },
          {
            "addr": "0xD1A834",
            "value": "0x0064DE"
          },
          {
            "addr": "0xD1A837",
            "value": "0x020000"
          }
        ],
        "callStackTail": [
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
        "name": "lowBackedge006d64",
        "block": 20281,
        "pc": "0x006D64",
        "state": {
          "pc": "0x006D64",
          "sp": "0xD1A82B",
          "ix": "0xD1A831",
          "iy": "0xD00080",
          "af": "0x0002",
          "bc": "0x020000",
          "de": "0x000240",
          "hl": "0x000100",
          "flags": {
            "z": false,
            "c": false,
            "n": true
          },
          "D00121": "0x000000",
          "D00124": "0x0A",
          "D00587": "0x00",
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
        "ixFrame": {
          "IX-45": "0x004502",
          "IX-42": "0xD1A800",
          "IX-39": "0x001717",
          "IX-30": "0xFFFFFC",
          "IX-27": "0xFF0105",
          "IX-24": "0x66",
          "IX-20": "0x400017",
          "IX-17": "0x400002",
          "IX-11": "0x640001",
          "IX-8": "0x6D",
          "IX-7": "0x00",
          "IX-6": "0x000000",
          "IX-3": "0x020000",
          "IX+0": "0xD1A866",
          "IX+3": "0x0064DE",
          "IX+6": "0x020000",
          "IX+9": "0x000100"
        },
        "stackTop": [
          {
            "addr": "0xD1A82B",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A82E",
            "value": "0x020000"
          },
          {
            "addr": "0xD1A831",
            "value": "0xD1A866"
          },
          {
            "addr": "0xD1A834",
            "value": "0x0064DE"
          },
          {
            "addr": "0xD1A837",
            "value": "0x020000"
          }
        ],
        "callStackTail": [
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
          "0x005B92",
          "0x005A19",
          "0x0059DA",
          "0x0059E6",
          "0x0017FC",
          "0x0064D0",
          "0x006CC6",
          "0x006D5D",
          "0x0021C2",
          "0x006D64"
        ]
      },
      {
        "name": "hot000a92",
        "block": 101763,
        "pc": "0x000A92",
        "state": {
          "pc": "0x000A92",
          "sp": "0xD1A3BC",
          "ix": "0xD1A3E9",
          "iy": "0xD00080",
          "af": "0xE13E",
          "bc": "0x000000",
          "de": "0xD1A3FD",
          "hl": "0x0000E2",
          "flags": {
            "z": false,
            "c": false,
            "n": true
          },
          "D00121": "0x09D800",
          "D00124": "0x0E",
          "D00587": "0x00",
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
          "vramPixels": 3039
        },
        "ixFrame": {
          "IX-45": "0x000000",
          "IX-42": "0x000000",
          "IX-39": "0x00002E",
          "IX-30": "0xD1A47D",
          "IX-27": "0x006C8E",
          "IX-24": "0x00",
          "IX-20": "0x0000E2",
          "IX-17": "0x000001",
          "IX-11": "0xD1A602",
          "IX-8": "0x7F",
          "IX-7": "0xF1",
          "IX-6": "0xD1A601",
          "IX-3": "0x000080",
          "IX+0": "0xD1A708",
          "IX+3": "0x000A0A",
          "IX+6": "0xD1A3FB",
          "IX+9": "0xD1A5FF"
        },
        "stackTop": [
          {
            "addr": "0xD1A3BC",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A3BF",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A3C2",
            "value": "0x00002E"
          },
          {
            "addr": "0xD1A3C5",
            "value": "0x00EADA"
          },
          {
            "addr": "0xD1A3C8",
            "value": "0x002ECA"
          }
        ],
        "callStackTail": [
          "0x0009F9"
        ],
        "recentBlocks": [
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
      },
      {
        "name": "hot000bfe",
        "block": 118632,
        "pc": "0x000BFE",
        "state": {
          "pc": "0x000BFE",
          "sp": "0xD1A3BC",
          "ix": "0xD1A3E9",
          "iy": "0xD00080",
          "af": "0x7F28",
          "bc": "0x000000",
          "de": "0x000005",
          "hl": "0x00007F",
          "flags": {
            "z": false,
            "c": false,
            "n": false
          },
          "D00121": "0x09D800",
          "D00124": "0x0E",
          "D00587": "0x00",
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
          "vramPixels": 3039
        },
        "ixFrame": {
          "IX-45": "0x00007F",
          "IX-42": "0x000000",
          "IX-39": "0x000001",
          "IX-30": "0xD1A47D",
          "IX-27": "0x006C0F",
          "IX-24": "0x09",
          "IX-20": "0x000008",
          "IX-17": "0x000100",
          "IX-11": "0xD1A681",
          "IX-8": "0x00",
          "IX-7": "0x2E",
          "IX-6": "0xD1A680",
          "IX-3": "0x000080",
          "IX+0": "0xD1A708",
          "IX+3": "0x000A0A",
          "IX+6": "0xD1A3FB",
          "IX+9": "0xD1A5FF"
        },
        "stackTop": [
          {
            "addr": "0xD1A3BC",
            "value": "0x00007F"
          },
          {
            "addr": "0xD1A3BF",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A3C2",
            "value": "0x000001"
          },
          {
            "addr": "0xD1A3C5",
            "value": "0x00EADA"
          },
          {
            "addr": "0xD1A3C8",
            "value": "0x088D5B"
          }
        ],
        "callStackTail": [
          "0x0009F9"
        ],
        "recentBlocks": [
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
          "0x000B7F",
          "0x000B83",
          "0x000BCB",
          "0x000BD3",
          "0x000BFE"
        ]
      }
    ],
    "branchOutcomes": [
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
      },
      {
        "name": "lowFrame006cc6",
        "targetPc": "0x006CC6",
        "beforeBlock": 20278,
        "afterBlock": 20279,
        "afterPc": "0x006D5D",
        "before": {
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
          "pc": "0x006D5D",
          "sp": "0xD1A82B",
          "ix": "0xD1A831",
          "iy": "0xD00080",
          "af": "0x0042",
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
      },
      {
        "name": "lowCall006d5d",
        "targetPc": "0x006D5D",
        "beforeBlock": 20279,
        "afterBlock": 20280,
        "afterPc": "0x0021C2",
        "before": {
          "pc": "0x006D5D",
          "sp": "0xD1A82B",
          "ix": "0xD1A831",
          "iy": "0xD00080",
          "af": "0x0042",
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
          "pc": "0x0021C2",
          "sp": "0xD1A828",
          "ix": "0xD1A831",
          "iy": "0xD00080",
          "af": "0x0042",
          "bc": "0x020000",
          "de": "0x000240",
          "hl": "0x000100",
          "flags": {
            "z": true,
            "c": false,
            "n": true
          },
          "D00121": "0x000000",
          "D00124": "0x0A",
          "D00587": "0x00",
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
      },
      {
        "name": "lowBackedge006d64",
        "targetPc": "0x006D64",
        "beforeBlock": 20281,
        "afterBlock": 20282,
        "afterPc": "0x006CDF",
        "before": {
          "pc": "0x006D64",
          "sp": "0xD1A82B",
          "ix": "0xD1A831",
          "iy": "0xD00080",
          "af": "0x0002",
          "bc": "0x020000",
          "de": "0x000240",
          "hl": "0x000100",
          "flags": {
            "z": false,
            "c": false,
            "n": true
          },
          "D00121": "0x000000",
          "D00124": "0x0A",
          "D00587": "0x00",
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
          "pc": "0x006CDF",
          "sp": "0xD1A82B",
          "ix": "0xD1A831",
          "iy": "0xD00080",
          "af": "0x0002",
          "bc": "0x020000",
          "de": "0x000240",
          "hl": "0x000100",
          "flags": {
            "z": false,
            "c": false,
            "n": true
          },
          "D00121": "0x000000",
          "D00124": "0x0A",
          "D00587": "0x00",
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
      },
      {
        "name": "hot000a92",
        "targetPc": "0x000A92",
        "beforeBlock": 101763,
        "afterBlock": 101764,
        "afterPc": "0x000A92",
        "before": {
          "pc": "0x000A92",
          "sp": "0xD1A3BC",
          "ix": "0xD1A3E9",
          "iy": "0xD00080",
          "af": "0xE13E",
          "bc": "0x000000",
          "de": "0xD1A3FD",
          "hl": "0x0000E2",
          "flags": {
            "z": false,
            "c": false,
            "n": true
          },
          "D00121": "0x09D800",
          "D00124": "0x0E",
          "D00587": "0x00",
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
          "vramPixels": 3039
        },
        "after": {
          "pc": "0x000A92",
          "sp": "0xD1A3BC",
          "ix": "0xD1A3E9",
          "iy": "0xD00080",
          "af": "0xD02A",
          "bc": "0x000000",
          "de": "0xD1A3FE",
          "hl": "0x0000C2",
          "flags": {
            "z": false,
            "c": false,
            "n": true
          },
          "D00121": "0x09D800",
          "D00124": "0x0E",
          "D00587": "0x00",
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
          "vramPixels": 3039
        }
      },
      {
        "name": "hot000bfe",
        "targetPc": "0x000BFE",
        "beforeBlock": 118632,
        "afterBlock": 118633,
        "afterPc": "0x000BFE",
        "before": {
          "pc": "0x000BFE",
          "sp": "0xD1A3BC",
          "ix": "0xD1A3E9",
          "iy": "0xD00080",
          "af": "0x7F28",
          "bc": "0x000000",
          "de": "0x000005",
          "hl": "0x00007F",
          "flags": {
            "z": false,
            "c": false,
            "n": false
          },
          "D00121": "0x09D800",
          "D00124": "0x0E",
          "D00587": "0x00",
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
          "vramPixels": 3039
        },
        "after": {
          "pc": "0x000BFE",
          "sp": "0xD1A3BC",
          "ix": "0xD1A3E9",
          "iy": "0xD00080",
          "af": "0x7E2C",
          "bc": "0x000000",
          "de": "0x00005D",
          "hl": "0x00007E",
          "flags": {
            "z": false,
            "c": false,
            "n": false
          },
          "D00121": "0x09D800",
          "D00124": "0x0E",
          "D00587": "0x00",
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
          "vramPixels": 3039
        }
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
      }
    ],
    "lastBlocks": [
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
      "0x000B37",
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
      "0x000B7F",
      "0x000B72",
      "0x000B7C",
      "0x000B81",
      "0x000B72",
      "0x000B7C",
      "0x000B81",
      "0x000B72",
      "0x000B7F",
      "0x000B83",
      "0x000BCB",
      "0x000BD3",
      "0x000BFE"
    ],
    "final": {
      "pc": "0x000BFE",
      "sp": "0xD1A3BC",
      "ix": "0xD1A3E9",
      "iy": "0xD00080",
      "af": "0x6E28",
      "bc": "0xFFFFFF",
      "de": "0x0000D8",
      "hl": "0x00006E",
      "flags": {
        "z": false,
        "c": false,
        "n": false
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
      "D00121": "0x09D800",
      "D00124": "0x0E",
      "D00587": "0x00",
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
      "vramPixels": 3039
    }
  },
  {
    "key": "Digit2",
    "preserveMode": "broad",
    "preserveLabel": "Broad IY/key/edit/low-frame restore",
    "keyResult": {
      "steps": 118649,
      "termination": "after-hot-low-loop-inputs",
      "lastPc": "0x000BFE",
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
      "lowCaller0017fc": 4,
      "lowSelect0064d0": 1,
      "lowFrame006cc6": 5,
      "lowLoop006cdf": 10083,
      "lowPoll006d38": 10080,
      "lowCall006d5d": 10088,
      "lowBackedge006d64": 10088,
      "hot000a92": 16256,
      "hot000bfe": 18,
      "tokenExit08f5e1": 0,
      "tokenGate090992": 0,
      "eolTuple08f54b": 0
    },
    "firstHits": {
      "outerLoop08c331": 1,
      "cxMain0585e9": 1953,
      "getCsc03fa09": 4927,
      "bulkClear001879": 10971,
      "bulkTail0018f8": 10972,
      "lowCaller0017fc": 20151,
      "lowSelect0064d0": 20277,
      "lowFrame006cc6": 20278,
      "lowCall006d5d": 20279,
      "lowBackedge006d64": 20281,
      "lowLoop006cdf": 20282,
      "lowPoll006d38": 20285,
      "hot000a92": 101763,
      "hot000bfe": 118632
    },
    "restorations": [
      {
        "label": "after-0x001879-bulk-clear",
        "atBlock": 10972,
        "atPc": "0x0018F8",
        "afterD007CA": "0x0585E9",
        "afterD008E0": "0xD1A863",
        "afterD02590": "0xD3FE81",
        "afterD0058E": "0x90",
        "afterD00121": "0x000000",
        "afterD00124": "0x00"
      }
    ],
    "branchSamples": [
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
          "D00587": "0x1A",
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
          "vramPixels": 3040
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
          "D00587": "0x1A",
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
          "vramPixels": 3031
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
          "D00587": "0x1A",
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
          "vramPixels": 3031
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
      {
        "name": "lowCall006d5d",
        "block": 20279,
        "pc": "0x006D5D",
        "state": {
          "pc": "0x006D5D",
          "sp": "0xD1A82B",
          "ix": "0xD1A831",
          "iy": "0xD00080",
          "af": "0x0042",
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
          "D00587": "0x1A",
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
          "vramPixels": 3031
        },
        "ixFrame": {
          "IX-45": "0x004502",
          "IX-42": "0xD1A800",
          "IX-39": "0x001717",
          "IX-30": "0xFFFFFC",
          "IX-27": "0xFF0105",
          "IX-24": "0x66",
          "IX-20": "0x400017",
          "IX-17": "0x000002",
          "IX-11": "0xDA002D",
          "IX-8": "0x59",
          "IX-7": "0x00",
          "IX-6": "0x000000",
          "IX-3": "0x020000",
          "IX+0": "0xD1A866",
          "IX+3": "0x0064DE",
          "IX+6": "0x020000",
          "IX+9": "0x000100"
        },
        "stackTop": [
          {
            "addr": "0xD1A82B",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A82E",
            "value": "0x020000"
          },
          {
            "addr": "0xD1A831",
            "value": "0xD1A866"
          },
          {
            "addr": "0xD1A834",
            "value": "0x0064DE"
          },
          {
            "addr": "0xD1A837",
            "value": "0x020000"
          }
        ],
        "callStackTail": [
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
        "name": "lowBackedge006d64",
        "block": 20281,
        "pc": "0x006D64",
        "state": {
          "pc": "0x006D64",
          "sp": "0xD1A82B",
          "ix": "0xD1A831",
          "iy": "0xD00080",
          "af": "0x0002",
          "bc": "0x020000",
          "de": "0x000240",
          "hl": "0x000100",
          "flags": {
            "z": false,
            "c": false,
            "n": true
          },
          "D00121": "0x000000",
          "D00124": "0x0A",
          "D00587": "0x1A",
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
          "vramPixels": 3031
        },
        "ixFrame": {
          "IX-45": "0x004502",
          "IX-42": "0xD1A800",
          "IX-39": "0x001717",
          "IX-30": "0xFFFFFC",
          "IX-27": "0xFF0105",
          "IX-24": "0x66",
          "IX-20": "0x400017",
          "IX-17": "0x400002",
          "IX-11": "0x640001",
          "IX-8": "0x6D",
          "IX-7": "0x00",
          "IX-6": "0x000000",
          "IX-3": "0x020000",
          "IX+0": "0xD1A866",
          "IX+3": "0x0064DE",
          "IX+6": "0x020000",
          "IX+9": "0x000100"
        },
        "stackTop": [
          {
            "addr": "0xD1A82B",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A82E",
            "value": "0x020000"
          },
          {
            "addr": "0xD1A831",
            "value": "0xD1A866"
          },
          {
            "addr": "0xD1A834",
            "value": "0x0064DE"
          },
          {
            "addr": "0xD1A837",
            "value": "0x020000"
          }
        ],
        "callStackTail": [
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
          "0x005B92",
          "0x005A19",
          "0x0059DA",
          "0x0059E6",
          "0x0017FC",
          "0x0064D0",
          "0x006CC6",
          "0x006D5D",
          "0x0021C2",
          "0x006D64"
        ]
      },
      {
        "name": "hot000a92",
        "block": 101763,
        "pc": "0x000A92",
        "state": {
          "pc": "0x000A92",
          "sp": "0xD1A3BC",
          "ix": "0xD1A3E9",
          "iy": "0xD00080",
          "af": "0xE13E",
          "bc": "0x000000",
          "de": "0xD1A3FD",
          "hl": "0x0000E2",
          "flags": {
            "z": false,
            "c": false,
            "n": true
          },
          "D00121": "0x09D800",
          "D00124": "0x0E",
          "D00587": "0x1A",
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
          "vramPixels": 3039
        },
        "ixFrame": {
          "IX-45": "0x000000",
          "IX-42": "0x000000",
          "IX-39": "0x00002E",
          "IX-30": "0xD1A47D",
          "IX-27": "0x006C8E",
          "IX-24": "0x00",
          "IX-20": "0x0000E2",
          "IX-17": "0x000001",
          "IX-11": "0xD1A602",
          "IX-8": "0x7F",
          "IX-7": "0xF1",
          "IX-6": "0xD1A601",
          "IX-3": "0x000080",
          "IX+0": "0xD1A708",
          "IX+3": "0x000A0A",
          "IX+6": "0xD1A3FB",
          "IX+9": "0xD1A5FF"
        },
        "stackTop": [
          {
            "addr": "0xD1A3BC",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A3BF",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A3C2",
            "value": "0x00002E"
          },
          {
            "addr": "0xD1A3C5",
            "value": "0x00EADA"
          },
          {
            "addr": "0xD1A3C8",
            "value": "0x002ECA"
          }
        ],
        "callStackTail": [
          "0x0009F9"
        ],
        "recentBlocks": [
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
      },
      {
        "name": "hot000bfe",
        "block": 118632,
        "pc": "0x000BFE",
        "state": {
          "pc": "0x000BFE",
          "sp": "0xD1A3BC",
          "ix": "0xD1A3E9",
          "iy": "0xD00080",
          "af": "0x7F28",
          "bc": "0x000000",
          "de": "0x000005",
          "hl": "0x00007F",
          "flags": {
            "z": false,
            "c": false,
            "n": false
          },
          "D00121": "0x09D800",
          "D00124": "0x0E",
          "D00587": "0x1A",
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
          "vramPixels": 3039
        },
        "ixFrame": {
          "IX-45": "0x00007F",
          "IX-42": "0x000000",
          "IX-39": "0x000001",
          "IX-30": "0xD1A47D",
          "IX-27": "0x006C0F",
          "IX-24": "0x09",
          "IX-20": "0x000008",
          "IX-17": "0x000100",
          "IX-11": "0xD1A681",
          "IX-8": "0x00",
          "IX-7": "0x2E",
          "IX-6": "0xD1A680",
          "IX-3": "0x000080",
          "IX+0": "0xD1A708",
          "IX+3": "0x000A0A",
          "IX+6": "0xD1A3FB",
          "IX+9": "0xD1A5FF"
        },
        "stackTop": [
          {
            "addr": "0xD1A3BC",
            "value": "0x00007F"
          },
          {
            "addr": "0xD1A3BF",
            "value": "0x000000"
          },
          {
            "addr": "0xD1A3C2",
            "value": "0x000001"
          },
          {
            "addr": "0xD1A3C5",
            "value": "0x00EADA"
          },
          {
            "addr": "0xD1A3C8",
            "value": "0x088D5B"
          }
        ],
        "callStackTail": [
          "0x0009F9"
        ],
        "recentBlocks": [
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
          "0x000B7F",
          "0x000B83",
          "0x000BCB",
          "0x000BD3",
          "0x000BFE"
        ]
      }
    ],
    "branchOutcomes": [
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
          "D00587": "0x1A",
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
          "D00587": "0x1A",
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
          "D00587": "0x1A",
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
          "D00587": "0x1A",
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
          "vramPixels": 3031
        }
      },
      {
        "name": "lowFrame006cc6",
        "targetPc": "0x006CC6",
        "beforeBlock": 20278,
        "afterBlock": 20279,
        "afterPc": "0x006D5D",
        "before": {
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
          "D00587": "0x1A",
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
          "vramPixels": 3031
        },
        "after": {
          "pc": "0x006D5D",
          "sp": "0xD1A82B",
          "ix": "0xD1A831",
          "iy": "0xD00080",
          "af": "0x0042",
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
          "D00587": "0x1A",
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
          "vramPixels": 3031
        }
      },
      {
        "name": "lowCall006d5d",
        "targetPc": "0x006D5D",
        "beforeBlock": 20279,
        "afterBlock": 20280,
        "afterPc": "0x0021C2",
        "before": {
          "pc": "0x006D5D",
          "sp": "0xD1A82B",
          "ix": "0xD1A831",
          "iy": "0xD00080",
          "af": "0x0042",
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
          "D00587": "0x1A",
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
          "vramPixels": 3031
        },
        "after": {
          "pc": "0x0021C2",
          "sp": "0xD1A828",
          "ix": "0xD1A831",
          "iy": "0xD00080",
          "af": "0x0042",
          "bc": "0x020000",
          "de": "0x000240",
          "hl": "0x000100",
          "flags": {
            "z": true,
            "c": false,
            "n": true
          },
          "D00121": "0x000000",
          "D00124": "0x0A",
          "D00587": "0x1A",
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
          "vramPixels": 3031
        }
      },
      {
        "name": "lowBackedge006d64",
        "targetPc": "0x006D64",
        "beforeBlock": 20281,
        "afterBlock": 20282,
        "afterPc": "0x006CDF",
        "before": {
          "pc": "0x006D64",
          "sp": "0xD1A82B",
          "ix": "0xD1A831",
          "iy": "0xD00080",
          "af": "0x0002",
          "bc": "0x020000",
          "de": "0x000240",
          "hl": "0x000100",
          "flags": {
            "z": false,
            "c": false,
            "n": true
          },
          "D00121": "0x000000",
          "D00124": "0x0A",
          "D00587": "0x1A",
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
          "vramPixels": 3031
        },
        "after": {
          "pc": "0x006CDF",
          "sp": "0xD1A82B",
          "ix": "0xD1A831",
          "iy": "0xD00080",
          "af": "0x0002",
          "bc": "0x020000",
          "de": "0x000240",
          "hl": "0x000100",
          "flags": {
            "z": false,
            "c": false,
            "n": true
          },
          "D00121": "0x000000",
          "D00124": "0x0A",
          "D00587": "0x1A",
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
          "vramPixels": 3031
        }
      },
      {
        "name": "hot000a92",
        "targetPc": "0x000A92",
        "beforeBlock": 101763,
        "afterBlock": 101764,
        "afterPc": "0x000A92",
        "before": {
          "pc": "0x000A92",
          "sp": "0xD1A3BC",
          "ix": "0xD1A3E9",
          "iy": "0xD00080",
          "af": "0xE13E",
          "bc": "0x000000",
          "de": "0xD1A3FD",
          "hl": "0x0000E2",
          "flags": {
            "z": false,
            "c": false,
            "n": true
          },
          "D00121": "0x09D800",
          "D00124": "0x0E",
          "D00587": "0x1A",
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
          "vramPixels": 3039
        },
        "after": {
          "pc": "0x000A92",
          "sp": "0xD1A3BC",
          "ix": "0xD1A3E9",
          "iy": "0xD00080",
          "af": "0xD02A",
          "bc": "0x000000",
          "de": "0xD1A3FE",
          "hl": "0x0000C2",
          "flags": {
            "z": false,
            "c": false,
            "n": true
          },
          "D00121": "0x09D800",
          "D00124": "0x0E",
          "D00587": "0x1A",
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
          "vramPixels": 3039
        }
      },
      {
        "name": "hot000bfe",
        "targetPc": "0x000BFE",
        "beforeBlock": 118632,
        "afterBlock": 118633,
        "afterPc": "0x000BFE",
        "before": {
          "pc": "0x000BFE",
          "sp": "0xD1A3BC",
          "ix": "0xD1A3E9",
          "iy": "0xD00080",
          "af": "0x7F28",
          "bc": "0x000000",
          "de": "0x000005",
          "hl": "0x00007F",
          "flags": {
            "z": false,
            "c": false,
            "n": false
          },
          "D00121": "0x09D800",
          "D00124": "0x0E",
          "D00587": "0x1A",
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
          "vramPixels": 3039
        },
        "after": {
          "pc": "0x000BFE",
          "sp": "0xD1A3BC",
          "ix": "0xD1A3E9",
          "iy": "0xD00080",
          "af": "0x7E2C",
          "bc": "0x000000",
          "de": "0x00005D",
          "hl": "0x00007E",
          "flags": {
            "z": false,
            "c": false,
            "n": false
          },
          "D00121": "0x09D800",
          "D00124": "0x0E",
          "D00587": "0x1A",
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
          "vramPixels": 3039
        }
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
      }
    ],
    "lastBlocks": [
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
      "0x000B37",
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
      "0x000B7F",
      "0x000B72",
      "0x000B7C",
      "0x000B81",
      "0x000B72",
      "0x000B7C",
      "0x000B81",
      "0x000B72",
      "0x000B7F",
      "0x000B83",
      "0x000BCB",
      "0x000BD3",
      "0x000BFE"
    ],
    "final": {
      "pc": "0x000BFE",
      "sp": "0xD1A3BC",
      "ix": "0xD1A3E9",
      "iy": "0xD00080",
      "af": "0x6E28",
      "bc": "0xFFFFFF",
      "de": "0x0000D8",
      "hl": "0x00006E",
      "flags": {
        "z": false,
        "c": false,
        "n": false
      },
      "D00080": "0x08",
      "D00081": "0x04",
      "D0008D": "0x0E",
      "D0009F": "0x20",
      "D000A0": "0x00",
      "D000A3": "0x00",
      "D000A8": "0x00",
      "D000C2": "0x00",
      "D000C4": "0x00",
      "D00121": "0x09D800",
      "D00124": "0x0E",
      "D00587": "0x1A",
      "D0058C": "0x90",
      "D0058D": "0x90",
      "D0058E": "0x90",
      "D007CA": "0x0585E9",
      "D007CD": "0x058B19",
      "D007D0": "0x058B7E",
      "D008E0": "0xD1A863",
      "D0231A": "0x000000",
      "D0243A": "0xD1A8A3",
      "D0243D": "0xD2A815",
      "D02590": "0xD3FE81",
      "D02593": "0xD3FE81",
      "D0259A": "0xD3FE81",
      "D0259D": "0xD3FECD",
      "D025C5": "0x0C0000",
      "D02A28": "0x00",
      "D001B8": "0x00",
      "D001D3": "0x00",
      "vramPixels": 3039
    }
  }
]
```

## Interpretation

The branch into the low status/transfer machinery is not fixed by restoring a broader pre-key state. The broad variant restores the previous core tuple plus `D00080-D000FF`, `D00587-D0058E`, `D02317-D02448`, and `D00121-D00124` after the destructive cleanup blocks. Digit2 still follows the same low route into `0x006CC6`, `0x006Dxx`, and hot `0x000A92`/`0x000BFE`. Broad EOL does not reopen token/tail either; it repeatedly re-enters the `0x0A2150` context-clear path with `D0058E=0x0F` restored, so preserving the pending EOL key appears to keep the cleanup branch alive.

The actionable next target is therefore upstream control flow into `0x005B92 -> 0x005A19 -> 0x0059DA -> 0x0059E6 -> 0x0017FC -> 0x0064D0`, not a simple missing RAM tuple in the tested ranges. The broad restore also means the token/tail miss is not explained by key buffers, IY flag bytes, edit descriptors, or low-frame bytes being zero after cleanup.

No runtime, transpiler, browser, or scheduler source files were modified.


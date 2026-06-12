# Phase 648: Display/Status Caller Route to 0x0064D0

Probe: `probe-phase648-display-status-caller.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase648-display-status-caller.mjs`

## Summary

- **** Clean repaint still halts before both traced key bursts.
- **** Phase645 preservation hooks still restore `D007CA`, `D008E0`, and VAT/heap state after the destructive cleanup blocks.
- **** Both traced keys take the same upstream display/status chain: repeated `0x005AB6/0x005AE8/0x005B16/0x005B4B` loop, then `0x005B92 -> 0x005A19 -> 0x0059DA -> 0x0059E6 -> 0x0017FC -> 0x0064D0`.
- **** The low-transfer setup is also deterministic: both keys hit `0x006475`, `0x00647D`, and `0x0064C7` exactly once before the final `0x0064D0` frame-builder entry.
- **** Both keys select the low route through `0x0017FC -> 0x0064D0 -> 0x006CC6` while preserved `D007CA`/`D008E0`/VAT are live.
- *** Both keys continue past first low-route entry into the hot helper loops at `0x000A92` and `0x000BFE`.
- **** Token/tail hooks remain bypassed after preservation: `0x08F5E1`, `0x090992`, and `0x08F54B` all stay at zero hits.

## Scenario Results

| Key | Repaint | Key trace | Restores | 0x005B92 | 0x005A19 | 0x0059DA | 0x0059E6 | 0x006475 | 0x00647D | 0x0064C7 | 0x0017FC | 0x0064D0 | 0x006CC6 | 0x006D5D | 0x006D64 | 0x000A92 | 0x000BFE | Token/tail | Final D007CA | Final D008E0 | Final VAT | D00121 | D00124 |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|---|---|
| EOL/CLEAR | halt 0x0019B5 | after-hot-low-loop-inputs 0x000BFE | 2 | 89 | 89 | 89 | 89 | 1 | 1 | 1 | 4 | 1 | 5 | 10088 | 10088 | 16256 | 18 | 0 | 0x0585E9 | 0xD1A863 | 0xD3FE81 | 0x09D800 | 0x0E |
| Digit2 | halt 0x0019B5 | after-hot-low-loop-inputs 0x000BFE | 1 | 89 | 89 | 89 | 89 | 1 | 1 | 1 | 4 | 1 | 5 | 10088 | 10088 | 16256 | 18 | 0 | 0x0585E9 | 0xD1A863 | 0xD3FE81 | 0x09D800 | 0x0E |

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
  }
}
```

## Static Low-Route Snippets

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
      "displayLoop005ab6": 1335,
      "displayLoop005ae8": 1424,
      "displayLoop005b16": 1424,
      "displayLoop005b4b": 1424,
      "displayCaller005b92": 89,
      "status005a19": 89,
      "status0059da": 89,
      "status0059e6": 89,
      "transfer006475": 1,
      "transfer00647d": 1,
      "transfer0064c7": 1,
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
      "displayLoop005ae8": 50236,
      "displayLoop005b16": 50237,
      "displayLoop005b4b": 50238,
      "displayLoop005ab6": 50239,
      "displayCaller005b92": 50299,
      "status005a19": 50300,
      "status0059da": 50301,
      "status0059e6": 50302,
      "transfer006475": 57636,
      "transfer00647d": 57647,
      "lowCaller0017fc": 57733,
      "transfer0064c7": 57772,
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
    "key": "Digit2",
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
      "displayLoop005ab6": 1335,
      "displayLoop005ae8": 1424,
      "displayLoop005b16": 1424,
      "displayLoop005b4b": 1424,
      "displayCaller005b92": 89,
      "status005a19": 89,
      "status0059da": 89,
      "status0059e6": 89,
      "transfer006475": 1,
      "transfer00647d": 1,
      "transfer0064c7": 1,
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
      "displayLoop005ae8": 12654,
      "displayLoop005b16": 12655,
      "displayLoop005b4b": 12656,
      "displayLoop005ab6": 12657,
      "displayCaller005b92": 12717,
      "status005a19": 12718,
      "status0059da": 12719,
      "status0059e6": 12720,
      "transfer006475": 20054,
      "transfer00647d": 20065,
      "lowCaller0017fc": 20151,
      "transfer0064c7": 20190,
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
        "afterD00121": "0x000000",
        "afterD00124": "0x00"
      }
    ],
    "branchSamples": [
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
  }
]
```

## Interpretation

The route to `0x0064D0` is not selected by the context table, key buffer, or VAT state directly. Both key bursts first churn in the display/status loop (`0x005AB6`, `0x005AE8`, `0x005B16`, `0x005B4B`), then leave through the repeated tail `0x005B92 -> 0x005A19 -> 0x0059DA -> 0x0059E6`. That tail executes 89 times in both runs. Near the end of the same caller path, both keys take a one-shot transfer setup sequence: `0x006475` calls `0x001C7D`, `0x00647D` calls `0x0017DD`, `0x0017FC` performs `POP AF; RET`, `0x0064C7` calls `0x0017DD`, and the final `0x0017FC` return lands at `0x0064D0`.

At `0x0064D0`, the frame builder discards the caller HL (`POP HL`), pushes constant `BC=0x000100`, pushes `BC=(IX+6)=0x020000`, then calls `0x006CC6`. `0x006CC6` seeds `IX-6` from `D00121 & 0x3F` and jumps straight to `0x006D5D`; the low loop then calls the zero-compare helper `0x0021C2` on `IX+9`, and `0x006D64` loops back to `0x006CDF` while the compare is NZ. This is a low display/status transfer frame with fixed IX-frame inputs, not a route reopened by preserving cx/VAT.

The next useful question is one level upstream of `0x005B92`: why the display/status loop decides to exit through this transfer tail instead of returning toward the `0x08Fxxx/0x090xxx` token/tail engine. The recent-block windows point to `0x005AB6/0x005AE8/0x005B16/0x005B4B` as the branch neighborhood to decode next.

No runtime, transpiler, browser, or scheduler source files were modified.


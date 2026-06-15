# Phase 685: Low-ROM Wrapper Trace

Probe: `probe-phase685-low-rom-wrapper-trace.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase685-low-rom-wrapper-trace.mjs`

## Result

- Overall: **PASS**
- VAT snapshot captured: true
- Main finding: low-ROM wrapper route fully traced: 0x001377 counts B down, port-3 setup falls through to 0x0013C3, 0x001988 preserves BC through 0x0019B3 dynamic RET to 0x0013C7, and 0x0158DE falls through because D000C2 bit 7 is clear; this routes all variants into 0x0158E8 -> 0x0158BC while edit/VAT state is still live

## Variants

| variant | termination | steps | deposit1 | release block | clear RAM block | first 0x0158BC | owner delta | owner stack24 | D00587 | D0058C | D0058D | D0058E | D007CA | D0243A | D02590 | buffer |
|---|---|---:|---:|---:|---:|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|---|
| release-matrix-at-deposit-stop-owner | first_0158bc_owner | 6309 | 2601 | 2601 | - | 6295 | 3694 | 0x0158EC/0x0013DA/0x000000/0x000000 | 0x00 | 0x00 | 0x1A | 0x00 | 0x0585E9 | 0xD1A8CD | 0xD3FE81 | 0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00 |
| clear-ram-at-deposit-while-held-stop-owner | first_0158bc_owner | 7239 | 2890 | - | 2890 | 7220 | 4330 | 0x0158EC/0x0013DA/0x000000/0x000000 | 0x00 | 0x00 | 0x00 | 0x00 | 0x0585E9 | 0xD1A8CD | 0xD3FE81 | 0x32 0x00 0x00 0x00 0x00 0x00 0x00 0x00 |
| no-pending-no-matrix-control-stop-owner | first_0158bc_owner | 3260 | - | - | - | 3251 | 3250 | 0x0158EC/0x0013DA/0x000000/0x000000 | 0x00 | 0x00 | 0x00 | 0x00 | 0x0585E9 | 0xD1A8CC | 0xD3FE81 | 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 |

## Primary Owner State

```json
{
  "block": 6295,
  "delta": 3694,
  "steps": 6309,
  "state": {
    "pc": "0x0158BC",
    "a": "0xD0",
    "f": "0x54",
    "bc": "0x00A005",
    "de": "0xD1A7FC",
    "hl": "0x000000",
    "ix": "0x000000",
    "iy": "0xD00080",
    "sp": "0xD1A878",
    "stack24": [
      "0x0158EC",
      "0x0013DA",
      "0x000000",
      "0x000000",
      "0x000000",
      "0x000000"
    ],
    "errSp": "0xD1A863",
    "D00587": "0x00",
    "D0058C": "0x00",
    "D0058D": "0x1A",
    "D0058E": "0x00",
    "D00080": "0x18",
    "D0009B": "0x00",
    "D0009F": "0x00",
    "D000A3": "0x0A",
    "D000C2": "0x00",
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
    "matrix3": "0xFF"
  },
  "returnHints": [
    {
      "ret": "0x0158EC",
      "hint": "return to 0x0158EC carry gate after 0x0158BC"
    },
    {
      "ret": "0x0013DA",
      "hint": "return to low-ROM wrapper A after owner scan"
    },
    {
      "ret": "0x000000",
      "hint": ""
    },
    {
      "ret": "0x000000",
      "hint": ""
    },
    {
      "ret": "0x000000",
      "hint": ""
    },
    {
      "ret": "0x000000",
      "hint": ""
    }
  ]
}
```

## Primary Branch Summary

```json
{
  "variant": "release-matrix-at-deposit-stop-owner",
  "countdownBlocks": 82,
  "countdownFirstBC": "0x005224",
  "countdownLastBC": "0x000124",
  "fallthroughBC": "0x000024",
  "port3Input": "0xEE",
  "port3PostFlags": "0x54",
  "wrapperCallState": {
    "pc": "0x0013C3",
    "a": "0x08",
    "f": "0x42",
    "bc": "0x00A005",
    "de": "0xD1A7FC",
    "hl": "0x000000",
    "ix": "0x000000",
    "iy": "0x3B001A",
    "sp": "0xD1A87E",
    "stack24": [
      "0x000000",
      "0x000000",
      "0x000000",
      "0x000000",
      "0x000000",
      "0x008000"
    ],
    "errSp": "0xD1A863",
    "D00587": "0x00",
    "D0058C": "0x00",
    "D0058D": "0x1A",
    "D0058E": "0x00",
    "D00080": "0x18",
    "D0009B": "0x00",
    "D0009F": "0x00",
    "D000A3": "0x0A",
    "D000C2": "0x00",
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
    "matrix3": "0xFF"
  },
  "helperEntryStack": [
    "0x0013C7",
    "0x000000",
    "0x000000"
  ],
  "helperReturnState": {
    "pc": "0x0019B3",
    "a": "0x03",
    "f": "0x42",
    "bc": "0x001005",
    "de": "0xD1A7FC",
    "hl": "0x000000",
    "ix": "0x000000",
    "iy": "0x3B001A",
    "sp": "0xD1A878",
    "stack24": [
      "0x00A005",
      "0x0013C7",
      "0x000000",
      "0x000000",
      "0x000000",
      "0x000000"
    ],
    "errSp": "0xD1A863",
    "D00587": "0x00",
    "D0058C": "0x00",
    "D0058D": "0x1A",
    "D0058E": "0x00",
    "D00080": "0x18",
    "D0009B": "0x00",
    "D0009F": "0x00",
    "D000A3": "0x0A",
    "D000C2": "0x00",
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
    "matrix3": "0xFF"
  },
  "wrapperResumeState": {
    "pc": "0x0013C7",
    "a": "0x03",
    "f": "0x42",
    "bc": "0x00A005",
    "de": "0xD1A7FC",
    "hl": "0x000000",
    "ix": "0x000000",
    "iy": "0x3B001A",
    "sp": "0xD1A87E",
    "stack24": [
      "0x000000",
      "0x000000",
      "0x000000",
      "0x000000",
      "0x000000",
      "0x008000"
    ],
    "errSp": "0xD1A863",
    "D00587": "0x00",
    "D0058C": "0x00",
    "D0058D": "0x1A",
    "D0058E": "0x00",
    "D00080": "0x18",
    "D0009B": "0x00",
    "D0009F": "0x00",
    "D000A3": "0x0A",
    "D000C2": "0x00",
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
    "matrix3": "0xFF"
  },
  "d000c2At0158DE": "0x00",
  "d000c2Bit7Clear": true,
  "preOwnerStack": [
    "0x0013DA",
    "0x000000",
    "0x000000"
  ],
  "ownerStack": [
    "0x0158EC",
    "0x0013DA",
    "0x000000"
  ]
}
```

## Primary Low-ROM Wrapper Path

| block | delta | pc | first insn | last insn | A | F | BC | IY | D0009B | D000C2 | stack24 | meaning |
|---:|---:|---:|---|---|---:|---:|---:|---:|---:|---:|---|---|
| 6199 | 3598 | 0x001377 | djnz 0x001377 | djnz 0x001377 | 0x76 | 0x42 | 0x005224 | 0x3B001A | 0x00 | 0x00 | 0x000000/0x000000/0x000000 | B countdown; fallthrough only after B reaches 0 |
| 6200 | 3599 | 0x001377 | djnz 0x001377 | djnz 0x001377 | 0x76 | 0x42 | 0x005124 | 0x3B001A | 0x00 | 0x00 | 0x000000/0x000000/0x000000 | B countdown; fallthrough only after B reaches 0 |
| 6201 | 3600 | 0x001377 | djnz 0x001377 | djnz 0x001377 | 0x76 | 0x42 | 0x005024 | 0x3B001A | 0x00 | 0x00 | 0x000000/0x000000/0x000000 | B countdown; fallthrough only after B reaches 0 |
| 6202 | 3601 | 0x001377 | djnz 0x001377 | djnz 0x001377 | 0x76 | 0x42 | 0x004F24 | 0x3B001A | 0x00 | 0x00 | 0x000000/0x000000/0x000000 | B countdown; fallthrough only after B reaches 0 |
| 6203 | 3602 | 0x001377 | djnz 0x001377 | djnz 0x001377 | 0x76 | 0x42 | 0x004E24 | 0x3B001A | 0x00 | 0x00 | 0x000000/0x000000/0x000000 | B countdown; fallthrough only after B reaches 0 |
| 6204 | 3603 | 0x001377 | djnz 0x001377 | djnz 0x001377 | 0x76 | 0x42 | 0x004D24 | 0x3B001A | 0x00 | 0x00 | 0x000000/0x000000/0x000000 | B countdown; fallthrough only after B reaches 0 |
| 6205 | 3604 | 0x001377 | djnz 0x001377 | djnz 0x001377 | 0x76 | 0x42 | 0x004C24 | 0x3B001A | 0x00 | 0x00 | 0x000000/0x000000/0x000000 | B countdown; fallthrough only after B reaches 0 |
| 6206 | 3605 | 0x001377 | djnz 0x001377 | djnz 0x001377 | 0x76 | 0x42 | 0x004B24 | 0x3B001A | 0x00 | 0x00 | 0x000000/0x000000/0x000000 | B countdown; fallthrough only after B reaches 0 |
| 6207 | 3606 | 0x001377 | djnz 0x001377 | djnz 0x001377 | 0x76 | 0x42 | 0x004A24 | 0x3B001A | 0x00 | 0x00 | 0x000000/0x000000/0x000000 | B countdown; fallthrough only after B reaches 0 |
| 6208 | 3607 | 0x001377 | djnz 0x001377 | djnz 0x001377 | 0x76 | 0x42 | 0x004924 | 0x3B001A | 0x00 | 0x00 | 0x000000/0x000000/0x000000 | B countdown; fallthrough only after B reaches 0 |
| 6209 | 3608 | 0x001377 | djnz 0x001377 | djnz 0x001377 | 0x76 | 0x42 | 0x004824 | 0x3B001A | 0x00 | 0x00 | 0x000000/0x000000/0x000000 | B countdown; fallthrough only after B reaches 0 |
| 6210 | 3609 | 0x001377 | djnz 0x001377 | djnz 0x001377 | 0x76 | 0x42 | 0x004724 | 0x3B001A | 0x00 | 0x00 | 0x000000/0x000000/0x000000 | B countdown; fallthrough only after B reaches 0 |
| 6211 | 3610 | 0x001377 | djnz 0x001377 | djnz 0x001377 | 0x76 | 0x42 | 0x004624 | 0x3B001A | 0x00 | 0x00 | 0x000000/0x000000/0x000000 | B countdown; fallthrough only after B reaches 0 |
| 6212 | 3611 | 0x001377 | djnz 0x001377 | djnz 0x001377 | 0x76 | 0x42 | 0x004524 | 0x3B001A | 0x00 | 0x00 | 0x000000/0x000000/0x000000 | B countdown; fallthrough only after B reaches 0 |
| 6213 | 3612 | 0x001377 | djnz 0x001377 | djnz 0x001377 | 0x76 | 0x42 | 0x004424 | 0x3B001A | 0x00 | 0x00 | 0x000000/0x000000/0x000000 | B countdown; fallthrough only after B reaches 0 |
| 6214 | 3613 | 0x001377 | djnz 0x001377 | djnz 0x001377 | 0x76 | 0x42 | 0x004324 | 0x3B001A | 0x00 | 0x00 | 0x000000/0x000000/0x000000 | B countdown; fallthrough only after B reaches 0 |
| 6215 | 3614 | 0x001377 | djnz 0x001377 | djnz 0x001377 | 0x76 | 0x42 | 0x004224 | 0x3B001A | 0x00 | 0x00 | 0x000000/0x000000/0x000000 | B countdown; fallthrough only after B reaches 0 |
| 6216 | 3615 | 0x001377 | djnz 0x001377 | djnz 0x001377 | 0x76 | 0x42 | 0x004124 | 0x3B001A | 0x00 | 0x00 | 0x000000/0x000000/0x000000 | B countdown; fallthrough only after B reaches 0 |
| 6217 | 3616 | 0x001377 | djnz 0x001377 | djnz 0x001377 | 0x76 | 0x42 | 0x004024 | 0x3B001A | 0x00 | 0x00 | 0x000000/0x000000/0x000000 | B countdown; fallthrough only after B reaches 0 |
| 6218 | 3617 | 0x001377 | djnz 0x001377 | djnz 0x001377 | 0x76 | 0x42 | 0x003F24 | 0x3B001A | 0x00 | 0x00 | 0x000000/0x000000/0x000000 | B countdown; fallthrough only after B reaches 0 |
| 6219 | 3618 | 0x001377 | djnz 0x001377 | djnz 0x001377 | 0x76 | 0x42 | 0x003E24 | 0x3B001A | 0x00 | 0x00 | 0x000000/0x000000/0x000000 | B countdown; fallthrough only after B reaches 0 |
| 6220 | 3619 | 0x001377 | djnz 0x001377 | djnz 0x001377 | 0x76 | 0x42 | 0x003D24 | 0x3B001A | 0x00 | 0x00 | 0x000000/0x000000/0x000000 | B countdown; fallthrough only after B reaches 0 |
| 6221 | 3620 | 0x001377 | djnz 0x001377 | djnz 0x001377 | 0x76 | 0x42 | 0x003C24 | 0x3B001A | 0x00 | 0x00 | 0x000000/0x000000/0x000000 | B countdown; fallthrough only after B reaches 0 |
| 6222 | 3621 | 0x001377 | djnz 0x001377 | djnz 0x001377 | 0x76 | 0x42 | 0x003B24 | 0x3B001A | 0x00 | 0x00 | 0x000000/0x000000/0x000000 | B countdown; fallthrough only after B reaches 0 |
| 6223 | 3622 | 0x001377 | djnz 0x001377 | djnz 0x001377 | 0x76 | 0x42 | 0x003A24 | 0x3B001A | 0x00 | 0x00 | 0x000000/0x000000/0x000000 | B countdown; fallthrough only after B reaches 0 |
| 6224 | 3623 | 0x001377 | djnz 0x001377 | djnz 0x001377 | 0x76 | 0x42 | 0x003924 | 0x3B001A | 0x00 | 0x00 | 0x000000/0x000000/0x000000 | B countdown; fallthrough only after B reaches 0 |
| 6225 | 3624 | 0x001377 | djnz 0x001377 | djnz 0x001377 | 0x76 | 0x42 | 0x003824 | 0x3B001A | 0x00 | 0x00 | 0x000000/0x000000/0x000000 | B countdown; fallthrough only after B reaches 0 |
| 6226 | 3625 | 0x001377 | djnz 0x001377 | djnz 0x001377 | 0x76 | 0x42 | 0x003724 | 0x3B001A | 0x00 | 0x00 | 0x000000/0x000000/0x000000 | B countdown; fallthrough only after B reaches 0 |
| 6227 | 3626 | 0x001377 | djnz 0x001377 | djnz 0x001377 | 0x76 | 0x42 | 0x003624 | 0x3B001A | 0x00 | 0x00 | 0x000000/0x000000/0x000000 | B countdown; fallthrough only after B reaches 0 |
| 6228 | 3627 | 0x001377 | djnz 0x001377 | djnz 0x001377 | 0x76 | 0x42 | 0x003524 | 0x3B001A | 0x00 | 0x00 | 0x000000/0x000000/0x000000 | B countdown; fallthrough only after B reaches 0 |
| 6229 | 3628 | 0x001377 | djnz 0x001377 | djnz 0x001377 | 0x76 | 0x42 | 0x003424 | 0x3B001A | 0x00 | 0x00 | 0x000000/0x000000/0x000000 | B countdown; fallthrough only after B reaches 0 |
| 6230 | 3629 | 0x001377 | djnz 0x001377 | djnz 0x001377 | 0x76 | 0x42 | 0x003324 | 0x3B001A | 0x00 | 0x00 | 0x000000/0x000000/0x000000 | B countdown; fallthrough only after B reaches 0 |
| 6231 | 3630 | 0x001377 | djnz 0x001377 | djnz 0x001377 | 0x76 | 0x42 | 0x003224 | 0x3B001A | 0x00 | 0x00 | 0x000000/0x000000/0x000000 | B countdown; fallthrough only after B reaches 0 |
| 6232 | 3631 | 0x001377 | djnz 0x001377 | djnz 0x001377 | 0x76 | 0x42 | 0x003124 | 0x3B001A | 0x00 | 0x00 | 0x000000/0x000000/0x000000 | B countdown; fallthrough only after B reaches 0 |
| 6233 | 3632 | 0x001377 | djnz 0x001377 | djnz 0x001377 | 0x76 | 0x42 | 0x003024 | 0x3B001A | 0x00 | 0x00 | 0x000000/0x000000/0x000000 | B countdown; fallthrough only after B reaches 0 |
| 6234 | 3633 | 0x001377 | djnz 0x001377 | djnz 0x001377 | 0x76 | 0x42 | 0x002F24 | 0x3B001A | 0x00 | 0x00 | 0x000000/0x000000/0x000000 | B countdown; fallthrough only after B reaches 0 |
| 6235 | 3634 | 0x001377 | djnz 0x001377 | djnz 0x001377 | 0x76 | 0x42 | 0x002E24 | 0x3B001A | 0x00 | 0x00 | 0x000000/0x000000/0x000000 | B countdown; fallthrough only after B reaches 0 |
| 6236 | 3635 | 0x001377 | djnz 0x001377 | djnz 0x001377 | 0x76 | 0x42 | 0x002D24 | 0x3B001A | 0x00 | 0x00 | 0x000000/0x000000/0x000000 | B countdown; fallthrough only after B reaches 0 |
| 6237 | 3636 | 0x001377 | djnz 0x001377 | djnz 0x001377 | 0x76 | 0x42 | 0x002C24 | 0x3B001A | 0x00 | 0x00 | 0x000000/0x000000/0x000000 | B countdown; fallthrough only after B reaches 0 |
| 6238 | 3637 | 0x001377 | djnz 0x001377 | djnz 0x001377 | 0x76 | 0x42 | 0x002B24 | 0x3B001A | 0x00 | 0x00 | 0x000000/0x000000/0x000000 | B countdown; fallthrough only after B reaches 0 |
| 6239 | 3638 | 0x001377 | djnz 0x001377 | djnz 0x001377 | 0x76 | 0x42 | 0x002A24 | 0x3B001A | 0x00 | 0x00 | 0x000000/0x000000/0x000000 | B countdown; fallthrough only after B reaches 0 |
| 6240 | 3639 | 0x001377 | djnz 0x001377 | djnz 0x001377 | 0x76 | 0x42 | 0x002924 | 0x3B001A | 0x00 | 0x00 | 0x000000/0x000000/0x000000 | B countdown; fallthrough only after B reaches 0 |
| 6241 | 3640 | 0x001377 | djnz 0x001377 | djnz 0x001377 | 0x76 | 0x42 | 0x002824 | 0x3B001A | 0x00 | 0x00 | 0x000000/0x000000/0x000000 | B countdown; fallthrough only after B reaches 0 |
| 6242 | 3641 | 0x001377 | djnz 0x001377 | djnz 0x001377 | 0x76 | 0x42 | 0x002724 | 0x3B001A | 0x00 | 0x00 | 0x000000/0x000000/0x000000 | B countdown; fallthrough only after B reaches 0 |
| 6243 | 3642 | 0x001377 | djnz 0x001377 | djnz 0x001377 | 0x76 | 0x42 | 0x002624 | 0x3B001A | 0x00 | 0x00 | 0x000000/0x000000/0x000000 | B countdown; fallthrough only after B reaches 0 |
| 6244 | 3643 | 0x001377 | djnz 0x001377 | djnz 0x001377 | 0x76 | 0x42 | 0x002524 | 0x3B001A | 0x00 | 0x00 | 0x000000/0x000000/0x000000 | B countdown; fallthrough only after B reaches 0 |
| 6245 | 3644 | 0x001377 | djnz 0x001377 | djnz 0x001377 | 0x76 | 0x42 | 0x002424 | 0x3B001A | 0x00 | 0x00 | 0x000000/0x000000/0x000000 | B countdown; fallthrough only after B reaches 0 |
| 6246 | 3645 | 0x001377 | djnz 0x001377 | djnz 0x001377 | 0x76 | 0x42 | 0x002324 | 0x3B001A | 0x00 | 0x00 | 0x000000/0x000000/0x000000 | B countdown; fallthrough only after B reaches 0 |
| 6247 | 3646 | 0x001377 | djnz 0x001377 | djnz 0x001377 | 0x76 | 0x42 | 0x002224 | 0x3B001A | 0x00 | 0x00 | 0x000000/0x000000/0x000000 | B countdown; fallthrough only after B reaches 0 |
| 6248 | 3647 | 0x001377 | djnz 0x001377 | djnz 0x001377 | 0x76 | 0x42 | 0x002124 | 0x3B001A | 0x00 | 0x00 | 0x000000/0x000000/0x000000 | B countdown; fallthrough only after B reaches 0 |
| 6249 | 3648 | 0x001377 | djnz 0x001377 | djnz 0x001377 | 0x76 | 0x42 | 0x002024 | 0x3B001A | 0x00 | 0x00 | 0x000000/0x000000/0x000000 | B countdown; fallthrough only after B reaches 0 |
| 6250 | 3649 | 0x001377 | djnz 0x001377 | djnz 0x001377 | 0x76 | 0x42 | 0x001F24 | 0x3B001A | 0x00 | 0x00 | 0x000000/0x000000/0x000000 | B countdown; fallthrough only after B reaches 0 |
| 6251 | 3650 | 0x001377 | djnz 0x001377 | djnz 0x001377 | 0x76 | 0x42 | 0x001E24 | 0x3B001A | 0x00 | 0x00 | 0x000000/0x000000/0x000000 | B countdown; fallthrough only after B reaches 0 |
| 6252 | 3651 | 0x001377 | djnz 0x001377 | djnz 0x001377 | 0x76 | 0x42 | 0x001D24 | 0x3B001A | 0x00 | 0x00 | 0x000000/0x000000/0x000000 | B countdown; fallthrough only after B reaches 0 |
| 6253 | 3652 | 0x001377 | djnz 0x001377 | djnz 0x001377 | 0x76 | 0x42 | 0x001C24 | 0x3B001A | 0x00 | 0x00 | 0x000000/0x000000/0x000000 | B countdown; fallthrough only after B reaches 0 |
| 6254 | 3653 | 0x001377 | djnz 0x001377 | djnz 0x001377 | 0x76 | 0x42 | 0x001B24 | 0x3B001A | 0x00 | 0x00 | 0x000000/0x000000/0x000000 | B countdown; fallthrough only after B reaches 0 |
| 6255 | 3654 | 0x001377 | djnz 0x001377 | djnz 0x001377 | 0x76 | 0x42 | 0x001A24 | 0x3B001A | 0x00 | 0x00 | 0x000000/0x000000/0x000000 | B countdown; fallthrough only after B reaches 0 |
| 6256 | 3655 | 0x001377 | djnz 0x001377 | djnz 0x001377 | 0x76 | 0x42 | 0x001924 | 0x3B001A | 0x00 | 0x00 | 0x000000/0x000000/0x000000 | B countdown; fallthrough only after B reaches 0 |
| 6257 | 3656 | 0x001377 | djnz 0x001377 | djnz 0x001377 | 0x76 | 0x42 | 0x001824 | 0x3B001A | 0x00 | 0x00 | 0x000000/0x000000/0x000000 | B countdown; fallthrough only after B reaches 0 |
| 6258 | 3657 | 0x001377 | djnz 0x001377 | djnz 0x001377 | 0x76 | 0x42 | 0x001724 | 0x3B001A | 0x00 | 0x00 | 0x000000/0x000000/0x000000 | B countdown; fallthrough only after B reaches 0 |
| 6259 | 3658 | 0x001377 | djnz 0x001377 | djnz 0x001377 | 0x76 | 0x42 | 0x001624 | 0x3B001A | 0x00 | 0x00 | 0x000000/0x000000/0x000000 | B countdown; fallthrough only after B reaches 0 |
| 6260 | 3659 | 0x001377 | djnz 0x001377 | djnz 0x001377 | 0x76 | 0x42 | 0x001524 | 0x3B001A | 0x00 | 0x00 | 0x000000/0x000000/0x000000 | B countdown; fallthrough only after B reaches 0 |
| 6261 | 3660 | 0x001377 | djnz 0x001377 | djnz 0x001377 | 0x76 | 0x42 | 0x001424 | 0x3B001A | 0x00 | 0x00 | 0x000000/0x000000/0x000000 | B countdown; fallthrough only after B reaches 0 |
| 6262 | 3661 | 0x001377 | djnz 0x001377 | djnz 0x001377 | 0x76 | 0x42 | 0x001324 | 0x3B001A | 0x00 | 0x00 | 0x000000/0x000000/0x000000 | B countdown; fallthrough only after B reaches 0 |
| 6263 | 3662 | 0x001377 | djnz 0x001377 | djnz 0x001377 | 0x76 | 0x42 | 0x001224 | 0x3B001A | 0x00 | 0x00 | 0x000000/0x000000/0x000000 | B countdown; fallthrough only after B reaches 0 |
| 6264 | 3663 | 0x001377 | djnz 0x001377 | djnz 0x001377 | 0x76 | 0x42 | 0x001124 | 0x3B001A | 0x00 | 0x00 | 0x000000/0x000000/0x000000 | B countdown; fallthrough only after B reaches 0 |
| 6265 | 3664 | 0x001377 | djnz 0x001377 | djnz 0x001377 | 0x76 | 0x42 | 0x001024 | 0x3B001A | 0x00 | 0x00 | 0x000000/0x000000/0x000000 | B countdown; fallthrough only after B reaches 0 |
| 6266 | 3665 | 0x001377 | djnz 0x001377 | djnz 0x001377 | 0x76 | 0x42 | 0x000F24 | 0x3B001A | 0x00 | 0x00 | 0x000000/0x000000/0x000000 | B countdown; fallthrough only after B reaches 0 |
| 6267 | 3666 | 0x001377 | djnz 0x001377 | djnz 0x001377 | 0x76 | 0x42 | 0x000E24 | 0x3B001A | 0x00 | 0x00 | 0x000000/0x000000/0x000000 | B countdown; fallthrough only after B reaches 0 |
| 6268 | 3667 | 0x001377 | djnz 0x001377 | djnz 0x001377 | 0x76 | 0x42 | 0x000D24 | 0x3B001A | 0x00 | 0x00 | 0x000000/0x000000/0x000000 | B countdown; fallthrough only after B reaches 0 |
| 6269 | 3668 | 0x001377 | djnz 0x001377 | djnz 0x001377 | 0x76 | 0x42 | 0x000C24 | 0x3B001A | 0x00 | 0x00 | 0x000000/0x000000/0x000000 | B countdown; fallthrough only after B reaches 0 |
| 6270 | 3669 | 0x001377 | djnz 0x001377 | djnz 0x001377 | 0x76 | 0x42 | 0x000B24 | 0x3B001A | 0x00 | 0x00 | 0x000000/0x000000/0x000000 | B countdown; fallthrough only after B reaches 0 |
| 6271 | 3670 | 0x001377 | djnz 0x001377 | djnz 0x001377 | 0x76 | 0x42 | 0x000A24 | 0x3B001A | 0x00 | 0x00 | 0x000000/0x000000/0x000000 | B countdown; fallthrough only after B reaches 0 |
| 6272 | 3671 | 0x001377 | djnz 0x001377 | djnz 0x001377 | 0x76 | 0x42 | 0x000924 | 0x3B001A | 0x00 | 0x00 | 0x000000/0x000000/0x000000 | B countdown; fallthrough only after B reaches 0 |
| 6273 | 3672 | 0x001377 | djnz 0x001377 | djnz 0x001377 | 0x76 | 0x42 | 0x000824 | 0x3B001A | 0x00 | 0x00 | 0x000000/0x000000/0x000000 | B countdown; fallthrough only after B reaches 0 |
| 6274 | 3673 | 0x001377 | djnz 0x001377 | djnz 0x001377 | 0x76 | 0x42 | 0x000724 | 0x3B001A | 0x00 | 0x00 | 0x000000/0x000000/0x000000 | B countdown; fallthrough only after B reaches 0 |
| 6275 | 3674 | 0x001377 | djnz 0x001377 | djnz 0x001377 | 0x76 | 0x42 | 0x000624 | 0x3B001A | 0x00 | 0x00 | 0x000000/0x000000/0x000000 | B countdown; fallthrough only after B reaches 0 |
| 6276 | 3675 | 0x001377 | djnz 0x001377 | djnz 0x001377 | 0x76 | 0x42 | 0x000524 | 0x3B001A | 0x00 | 0x00 | 0x000000/0x000000/0x000000 | B countdown; fallthrough only after B reaches 0 |
| 6277 | 3676 | 0x001377 | djnz 0x001377 | djnz 0x001377 | 0x76 | 0x42 | 0x000424 | 0x3B001A | 0x00 | 0x00 | 0x000000/0x000000/0x000000 | B countdown; fallthrough only after B reaches 0 |
| 6278 | 3677 | 0x001377 | djnz 0x001377 | djnz 0x001377 | 0x76 | 0x42 | 0x000324 | 0x3B001A | 0x00 | 0x00 | 0x000000/0x000000/0x000000 | B countdown; fallthrough only after B reaches 0 |
| 6279 | 3678 | 0x001377 | djnz 0x001377 | djnz 0x001377 | 0x76 | 0x42 | 0x000224 | 0x3B001A | 0x00 | 0x00 | 0x000000/0x000000/0x000000 | B countdown; fallthrough only after B reaches 0 |
| 6280 | 3679 | 0x001377 | djnz 0x001377 | djnz 0x001377 | 0x76 | 0x42 | 0x000124 | 0x3B001A | 0x00 | 0x00 | 0x000000/0x000000/0x000000 | B countdown; fallthrough only after B reaches 0 |
| 6281 | 3680 | 0x001379 | in0 a, (0x03) | jr z, 0x00138a | 0x76 | 0x42 | 0x000024 | 0x3B001A | 0x00 | 0x00 | 0x000000/0x000000/0x000000 | read port 0x03 after countdown |
| 6282 | 3681 | 0x00138A | ld a, 0x26 | jr nz, 0x00139c | 0xEE | 0x54 | 0x000024 | 0x3B001A | 0x00 | 0x00 | 0x000000/0x000000/0x000000 | configure low-ROM port state after port-3 read |
| 6283 | 3682 | 0x001393 | ld a, 0x03 | jr z, 0x00139d | 0x26 | 0x42 | 0x000024 | 0x3B001A | 0x00 | 0x00 | 0x000000/0x000000/0x000000 | select/write port 0x03 and branch to setup |
| 6284 | 3683 | 0x00139D | ld bc, 0x00a000 | jr nz, 0x00139c | 0x03 | 0x42 | 0x000024 | 0x3B001A | 0x00 | 0x00 | 0x000000/0x000000/0x000000 | prepare BC=0x00A005 and A=0x08 |
| 6285 | 3684 | 0x0013C3 | call 0x001988 | call 0x001988 | 0x08 | 0x42 | 0x00A005 | 0x3B001A | 0x00 | 0x00 | 0x000000/0x000000/0x000000 | call 0x001988 helper |
| 6286 | 3685 | 0x001988 | di | jr nz, 0x0019a9 | 0x08 | 0x42 | 0x00A005 | 0x3B001A | 0x00 | 0x00 | 0x0013C7/0x000000/0x000000 | DI helper entry; pushes original BC |
| 6287 | 3686 | 0x001991 | ld bc, 0x001005 | jr z, 0x00199e | 0xEE | 0x54 | 0x00A005 | 0x3B001A | 0x00 | 0x00 | 0x00A005/0x0013C7/0x000000 | force BC=0x001005 for helper port sequence |
| 6288 | 3687 | 0x00199E | ld a, b | jr z, 0x0019a4 | 0x04 | 0x42 | 0x001005 | 0x3B001A | 0x00 | 0x00 | 0x00A005/0x0013C7/0x000000 | load A from B |
| 6289 | 3688 | 0x0019A4 | ld a, c | jr nz, 0x0019a3 | 0x10 | 0x42 | 0x001005 | 0x3B001A | 0x00 | 0x00 | 0x00A005/0x0013C7/0x000000 | load A from C |
| 6290 | 3689 | 0x0019A9 | ld a, 0x03 | jr z, 0x0019b3 | 0x05 | 0x42 | 0x001005 | 0x3B001A | 0x00 | 0x00 | 0x00A005/0x0013C7/0x000000 | select port 0x03; CP 0x03 sets Z |
| 6291 | 3690 | 0x0019B3 | pop bc | ret | 0x03 | 0x42 | 0x001005 | 0x3B001A | 0x00 | 0x00 | 0x00A005/0x0013C7/0x000000 | POP BC; RET dynamically to 0x0013C7 |
| 6292 | 3691 | 0x0013C7 | ld a, 0xd0 | call 0x0158de | 0x03 | 0x42 | 0x00A005 | 0x3B001A | 0x00 | 0x00 | 0x000000/0x000000/0x000000 | restore MB/IY/flags and call 0x0158DE |
| 6293 | 3692 | 0x0158DE | ld iy, 0xd00080 | ret nz | 0xD0 | 0x42 | 0x00A005 | 0xD00080 | 0x00 | 0x00 | 0x0013DA/0x000000/0x000000 | BIT 7,(IY+66)=D000C2; fallthrough when clear |
| 6294 | 3693 | 0x0158E8 | call 0x0158bc | call 0x0158bc | 0xD0 | 0x54 | 0x00A005 | 0xD00080 | 0x00 | 0x00 | 0x0013DA/0x000000/0x000000 | CALL 0x0158BC owner with 0x0013DA as next return |

## Clear-Key-RAM Branch Summary

```json
{
  "variant": "clear-ram-at-deposit-while-held-stop-owner",
  "countdownBlocks": 82,
  "countdownFirstBC": "0x005224",
  "countdownLastBC": "0x000124",
  "fallthroughBC": "0x000024",
  "port3Input": "0xEE",
  "port3PostFlags": "0x54",
  "wrapperCallState": {
    "pc": "0x0013C3",
    "a": "0x08",
    "f": "0x42",
    "bc": "0x00A005",
    "de": "0xD1A7FC",
    "hl": "0x000000",
    "ix": "0x000000",
    "iy": "0x3B001A",
    "sp": "0xD1A87E",
    "stack24": [
      "0x000000",
      "0x000000",
      "0x000000",
      "0x000000",
      "0x000000",
      "0x008000"
    ],
    "errSp": "0xD1A863",
    "D00587": "0x00",
    "D0058C": "0x00",
    "D0058D": "0x00",
    "D0058E": "0x00",
    "D00080": "0x10",
    "D0009B": "0x00",
    "D0009F": "0x00",
    "D000A3": "0x0A",
    "D000C2": "0x00",
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
    "matrix3": "0xFD"
  },
  "helperEntryStack": [
    "0x0013C7",
    "0x000000",
    "0x000000"
  ],
  "helperReturnState": {
    "pc": "0x0019B3",
    "a": "0x03",
    "f": "0x42",
    "bc": "0x001005",
    "de": "0xD1A7FC",
    "hl": "0x000000",
    "ix": "0x000000",
    "iy": "0x3B001A",
    "sp": "0xD1A878",
    "stack24": [
      "0x00A005",
      "0x0013C7",
      "0x000000",
      "0x000000",
      "0x000000",
      "0x000000"
    ],
    "errSp": "0xD1A863",
    "D00587": "0x00",
    "D0058C": "0x00",
    "D0058D": "0x00",
    "D0058E": "0x00",
    "D00080": "0x10",
    "D0009B": "0x00",
    "D0009F": "0x00",
    "D000A3": "0x0A",
    "D000C2": "0x00",
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
    "matrix3": "0xFD"
  },
  "wrapperResumeState": {
    "pc": "0x0013C7",
    "a": "0x03",
    "f": "0x42",
    "bc": "0x00A005",
    "de": "0xD1A7FC",
    "hl": "0x000000",
    "ix": "0x000000",
    "iy": "0x3B001A",
    "sp": "0xD1A87E",
    "stack24": [
      "0x000000",
      "0x000000",
      "0x000000",
      "0x000000",
      "0x000000",
      "0x008000"
    ],
    "errSp": "0xD1A863",
    "D00587": "0x00",
    "D0058C": "0x00",
    "D0058D": "0x00",
    "D0058E": "0x00",
    "D00080": "0x10",
    "D0009B": "0x00",
    "D0009F": "0x00",
    "D000A3": "0x0A",
    "D000C2": "0x00",
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
    "matrix3": "0xFD"
  },
  "d000c2At0158DE": "0x00",
  "d000c2Bit7Clear": true,
  "preOwnerStack": [
    "0x0013DA",
    "0x000000",
    "0x000000"
  ],
  "ownerStack": [
    "0x0158EC",
    "0x0013DA",
    "0x000000"
  ]
}
```

## No-Pending Control Branch Summary

```json
{
  "variant": "no-pending-no-matrix-control-stop-owner",
  "countdownBlocks": 82,
  "countdownFirstBC": "0x005224",
  "countdownLastBC": "0x000124",
  "fallthroughBC": "0x000024",
  "port3Input": "0xEE",
  "port3PostFlags": "0x54",
  "wrapperCallState": {
    "pc": "0x0013C3",
    "a": "0x08",
    "f": "0x42",
    "bc": "0x00A005",
    "de": "0xD1A7FC",
    "hl": "0x000000",
    "ix": "0x000000",
    "iy": "0x3B001A",
    "sp": "0xD1A87E",
    "stack24": [
      "0x000000",
      "0x000000",
      "0x000000",
      "0x000000",
      "0x000000",
      "0x008000"
    ],
    "errSp": "0xD1A863",
    "D00587": "0x00",
    "D0058C": "0x00",
    "D0058D": "0x00",
    "D0058E": "0x00",
    "D00080": "0x00",
    "D0009B": "0x00",
    "D0009F": "0x00",
    "D000A3": "0x0A",
    "D000C2": "0x00",
    "D007CA": "0x0585E9",
    "D008E0": "0xD1A863",
    "D0231A": "0xD2A83E",
    "D0243A": "0xD1A8CC",
    "D0243D": "0xD2A83E",
    "D02587": "0xD3A854",
    "D02590": "0xD3FE81",
    "D02593": "0xD3FE81",
    "D0259A": "0xD3FE81",
    "D0259D": "0xD3FECD",
    "buffer": "0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
    "matrix3": "0xFF"
  },
  "helperEntryStack": [
    "0x0013C7",
    "0x000000",
    "0x000000"
  ],
  "helperReturnState": {
    "pc": "0x0019B3",
    "a": "0x03",
    "f": "0x42",
    "bc": "0x001005",
    "de": "0xD1A7FC",
    "hl": "0x000000",
    "ix": "0x000000",
    "iy": "0x3B001A",
    "sp": "0xD1A878",
    "stack24": [
      "0x00A005",
      "0x0013C7",
      "0x000000",
      "0x000000",
      "0x000000",
      "0x000000"
    ],
    "errSp": "0xD1A863",
    "D00587": "0x00",
    "D0058C": "0x00",
    "D0058D": "0x00",
    "D0058E": "0x00",
    "D00080": "0x00",
    "D0009B": "0x00",
    "D0009F": "0x00",
    "D000A3": "0x0A",
    "D000C2": "0x00",
    "D007CA": "0x0585E9",
    "D008E0": "0xD1A863",
    "D0231A": "0xD2A83E",
    "D0243A": "0xD1A8CC",
    "D0243D": "0xD2A83E",
    "D02587": "0xD3A854",
    "D02590": "0xD3FE81",
    "D02593": "0xD3FE81",
    "D0259A": "0xD3FE81",
    "D0259D": "0xD3FECD",
    "buffer": "0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
    "matrix3": "0xFF"
  },
  "wrapperResumeState": {
    "pc": "0x0013C7",
    "a": "0x03",
    "f": "0x42",
    "bc": "0x00A005",
    "de": "0xD1A7FC",
    "hl": "0x000000",
    "ix": "0x000000",
    "iy": "0x3B001A",
    "sp": "0xD1A87E",
    "stack24": [
      "0x000000",
      "0x000000",
      "0x000000",
      "0x000000",
      "0x000000",
      "0x008000"
    ],
    "errSp": "0xD1A863",
    "D00587": "0x00",
    "D0058C": "0x00",
    "D0058D": "0x00",
    "D0058E": "0x00",
    "D00080": "0x00",
    "D0009B": "0x00",
    "D0009F": "0x00",
    "D000A3": "0x0A",
    "D000C2": "0x00",
    "D007CA": "0x0585E9",
    "D008E0": "0xD1A863",
    "D0231A": "0xD2A83E",
    "D0243A": "0xD1A8CC",
    "D0243D": "0xD2A83E",
    "D02587": "0xD3A854",
    "D02590": "0xD3FE81",
    "D02593": "0xD3FE81",
    "D0259A": "0xD3FE81",
    "D0259D": "0xD3FECD",
    "buffer": "0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
    "matrix3": "0xFF"
  },
  "d000c2At0158DE": "0x00",
  "d000c2Bit7Clear": true,
  "preOwnerStack": [
    "0x0013DA",
    "0x000000",
    "0x000000"
  ],
  "ownerStack": [
    "0x0158EC",
    "0x0013DA",
    "0x000000"
  ]
}
```

## Primary Window Before First 0x0158BC

| block | delta | pc | label | first insn | state |
|---:|---:|---:|---|---|---|
| 6259 | 3658 | 0x001377 | countdownLoop | djnz 0x001377 | a=0x76 f=0x42 bc=0x001624 de=0xD1A7FC hl=0xD18C7C ix=0x000000 iy=0x3B001A sp=0xD1A87E stk=0x000000/0x000000/0x000000/0x000000 key=0x00/0x00/0x1A/0x00 flags=0x18/0x00/0x00/0x0A/0x00 cx=0x0585E9 cur=0xD1A8CD vat=0xD3FE81/0xD3FE81/0xD3FE81/0xD3FECD |
| 6260 | 3659 | 0x001377 | countdownLoop | djnz 0x001377 | a=0x76 f=0x42 bc=0x001524 de=0xD1A7FC hl=0xD18C7C ix=0x000000 iy=0x3B001A sp=0xD1A87E stk=0x000000/0x000000/0x000000/0x000000 key=0x00/0x00/0x1A/0x00 flags=0x18/0x00/0x00/0x0A/0x00 cx=0x0585E9 cur=0xD1A8CD vat=0xD3FE81/0xD3FE81/0xD3FE81/0xD3FECD |
| 6261 | 3660 | 0x001377 | countdownLoop | djnz 0x001377 | a=0x76 f=0x42 bc=0x001424 de=0xD1A7FC hl=0xD18C7C ix=0x000000 iy=0x3B001A sp=0xD1A87E stk=0x000000/0x000000/0x000000/0x000000 key=0x00/0x00/0x1A/0x00 flags=0x18/0x00/0x00/0x0A/0x00 cx=0x0585E9 cur=0xD1A8CD vat=0xD3FE81/0xD3FE81/0xD3FE81/0xD3FECD |
| 6262 | 3661 | 0x001377 | countdownLoop | djnz 0x001377 | a=0x76 f=0x42 bc=0x001324 de=0xD1A7FC hl=0xD18C7C ix=0x000000 iy=0x3B001A sp=0xD1A87E stk=0x000000/0x000000/0x000000/0x000000 key=0x00/0x00/0x1A/0x00 flags=0x18/0x00/0x00/0x0A/0x00 cx=0x0585E9 cur=0xD1A8CD vat=0xD3FE81/0xD3FE81/0xD3FE81/0xD3FECD |
| 6263 | 3662 | 0x001377 | countdownLoop | djnz 0x001377 | a=0x76 f=0x42 bc=0x001224 de=0xD1A7FC hl=0xD18C7C ix=0x000000 iy=0x3B001A sp=0xD1A87E stk=0x000000/0x000000/0x000000/0x000000 key=0x00/0x00/0x1A/0x00 flags=0x18/0x00/0x00/0x0A/0x00 cx=0x0585E9 cur=0xD1A8CD vat=0xD3FE81/0xD3FE81/0xD3FE81/0xD3FECD |
| 6264 | 3663 | 0x001377 | countdownLoop | djnz 0x001377 | a=0x76 f=0x42 bc=0x001124 de=0xD1A7FC hl=0xD18C7C ix=0x000000 iy=0x3B001A sp=0xD1A87E stk=0x000000/0x000000/0x000000/0x000000 key=0x00/0x00/0x1A/0x00 flags=0x18/0x00/0x00/0x0A/0x00 cx=0x0585E9 cur=0xD1A8CD vat=0xD3FE81/0xD3FE81/0xD3FE81/0xD3FECD |
| 6265 | 3664 | 0x001377 | countdownLoop | djnz 0x001377 | a=0x76 f=0x42 bc=0x001024 de=0xD1A7FC hl=0xD18C7C ix=0x000000 iy=0x3B001A sp=0xD1A87E stk=0x000000/0x000000/0x000000/0x000000 key=0x00/0x00/0x1A/0x00 flags=0x18/0x00/0x00/0x0A/0x00 cx=0x0585E9 cur=0xD1A8CD vat=0xD3FE81/0xD3FE81/0xD3FE81/0xD3FECD |
| 6266 | 3665 | 0x001377 | countdownLoop | djnz 0x001377 | a=0x76 f=0x42 bc=0x000F24 de=0xD1A7FC hl=0xD18C7C ix=0x000000 iy=0x3B001A sp=0xD1A87E stk=0x000000/0x000000/0x000000/0x000000 key=0x00/0x00/0x1A/0x00 flags=0x18/0x00/0x00/0x0A/0x00 cx=0x0585E9 cur=0xD1A8CD vat=0xD3FE81/0xD3FE81/0xD3FE81/0xD3FECD |
| 6267 | 3666 | 0x001377 | countdownLoop | djnz 0x001377 | a=0x76 f=0x42 bc=0x000E24 de=0xD1A7FC hl=0xD18C7C ix=0x000000 iy=0x3B001A sp=0xD1A87E stk=0x000000/0x000000/0x000000/0x000000 key=0x00/0x00/0x1A/0x00 flags=0x18/0x00/0x00/0x0A/0x00 cx=0x0585E9 cur=0xD1A8CD vat=0xD3FE81/0xD3FE81/0xD3FE81/0xD3FECD |
| 6268 | 3667 | 0x001377 | countdownLoop | djnz 0x001377 | a=0x76 f=0x42 bc=0x000D24 de=0xD1A7FC hl=0xD18C7C ix=0x000000 iy=0x3B001A sp=0xD1A87E stk=0x000000/0x000000/0x000000/0x000000 key=0x00/0x00/0x1A/0x00 flags=0x18/0x00/0x00/0x0A/0x00 cx=0x0585E9 cur=0xD1A8CD vat=0xD3FE81/0xD3FE81/0xD3FE81/0xD3FECD |
| 6269 | 3668 | 0x001377 | countdownLoop | djnz 0x001377 | a=0x76 f=0x42 bc=0x000C24 de=0xD1A7FC hl=0xD18C7C ix=0x000000 iy=0x3B001A sp=0xD1A87E stk=0x000000/0x000000/0x000000/0x000000 key=0x00/0x00/0x1A/0x00 flags=0x18/0x00/0x00/0x0A/0x00 cx=0x0585E9 cur=0xD1A8CD vat=0xD3FE81/0xD3FE81/0xD3FE81/0xD3FECD |
| 6270 | 3669 | 0x001377 | countdownLoop | djnz 0x001377 | a=0x76 f=0x42 bc=0x000B24 de=0xD1A7FC hl=0xD18C7C ix=0x000000 iy=0x3B001A sp=0xD1A87E stk=0x000000/0x000000/0x000000/0x000000 key=0x00/0x00/0x1A/0x00 flags=0x18/0x00/0x00/0x0A/0x00 cx=0x0585E9 cur=0xD1A8CD vat=0xD3FE81/0xD3FE81/0xD3FE81/0xD3FECD |
| 6271 | 3670 | 0x001377 | countdownLoop | djnz 0x001377 | a=0x76 f=0x42 bc=0x000A24 de=0xD1A7FC hl=0xD18C7C ix=0x000000 iy=0x3B001A sp=0xD1A87E stk=0x000000/0x000000/0x000000/0x000000 key=0x00/0x00/0x1A/0x00 flags=0x18/0x00/0x00/0x0A/0x00 cx=0x0585E9 cur=0xD1A8CD vat=0xD3FE81/0xD3FE81/0xD3FE81/0xD3FECD |
| 6272 | 3671 | 0x001377 | countdownLoop | djnz 0x001377 | a=0x76 f=0x42 bc=0x000924 de=0xD1A7FC hl=0xD18C7C ix=0x000000 iy=0x3B001A sp=0xD1A87E stk=0x000000/0x000000/0x000000/0x000000 key=0x00/0x00/0x1A/0x00 flags=0x18/0x00/0x00/0x0A/0x00 cx=0x0585E9 cur=0xD1A8CD vat=0xD3FE81/0xD3FE81/0xD3FE81/0xD3FECD |
| 6273 | 3672 | 0x001377 | countdownLoop | djnz 0x001377 | a=0x76 f=0x42 bc=0x000824 de=0xD1A7FC hl=0xD18C7C ix=0x000000 iy=0x3B001A sp=0xD1A87E stk=0x000000/0x000000/0x000000/0x000000 key=0x00/0x00/0x1A/0x00 flags=0x18/0x00/0x00/0x0A/0x00 cx=0x0585E9 cur=0xD1A8CD vat=0xD3FE81/0xD3FE81/0xD3FE81/0xD3FECD |
| 6274 | 3673 | 0x001377 | countdownLoop | djnz 0x001377 | a=0x76 f=0x42 bc=0x000724 de=0xD1A7FC hl=0xD18C7C ix=0x000000 iy=0x3B001A sp=0xD1A87E stk=0x000000/0x000000/0x000000/0x000000 key=0x00/0x00/0x1A/0x00 flags=0x18/0x00/0x00/0x0A/0x00 cx=0x0585E9 cur=0xD1A8CD vat=0xD3FE81/0xD3FE81/0xD3FE81/0xD3FECD |
| 6275 | 3674 | 0x001377 | countdownLoop | djnz 0x001377 | a=0x76 f=0x42 bc=0x000624 de=0xD1A7FC hl=0xD18C7C ix=0x000000 iy=0x3B001A sp=0xD1A87E stk=0x000000/0x000000/0x000000/0x000000 key=0x00/0x00/0x1A/0x00 flags=0x18/0x00/0x00/0x0A/0x00 cx=0x0585E9 cur=0xD1A8CD vat=0xD3FE81/0xD3FE81/0xD3FE81/0xD3FECD |
| 6276 | 3675 | 0x001377 | countdownLoop | djnz 0x001377 | a=0x76 f=0x42 bc=0x000524 de=0xD1A7FC hl=0xD18C7C ix=0x000000 iy=0x3B001A sp=0xD1A87E stk=0x000000/0x000000/0x000000/0x000000 key=0x00/0x00/0x1A/0x00 flags=0x18/0x00/0x00/0x0A/0x00 cx=0x0585E9 cur=0xD1A8CD vat=0xD3FE81/0xD3FE81/0xD3FE81/0xD3FECD |
| 6277 | 3676 | 0x001377 | countdownLoop | djnz 0x001377 | a=0x76 f=0x42 bc=0x000424 de=0xD1A7FC hl=0xD18C7C ix=0x000000 iy=0x3B001A sp=0xD1A87E stk=0x000000/0x000000/0x000000/0x000000 key=0x00/0x00/0x1A/0x00 flags=0x18/0x00/0x00/0x0A/0x00 cx=0x0585E9 cur=0xD1A8CD vat=0xD3FE81/0xD3FE81/0xD3FE81/0xD3FECD |
| 6278 | 3677 | 0x001377 | countdownLoop | djnz 0x001377 | a=0x76 f=0x42 bc=0x000324 de=0xD1A7FC hl=0xD18C7C ix=0x000000 iy=0x3B001A sp=0xD1A87E stk=0x000000/0x000000/0x000000/0x000000 key=0x00/0x00/0x1A/0x00 flags=0x18/0x00/0x00/0x0A/0x00 cx=0x0585E9 cur=0xD1A8CD vat=0xD3FE81/0xD3FE81/0xD3FE81/0xD3FECD |
| 6279 | 3678 | 0x001377 | countdownLoop | djnz 0x001377 | a=0x76 f=0x42 bc=0x000224 de=0xD1A7FC hl=0xD18C7C ix=0x000000 iy=0x3B001A sp=0xD1A87E stk=0x000000/0x000000/0x000000/0x000000 key=0x00/0x00/0x1A/0x00 flags=0x18/0x00/0x00/0x0A/0x00 cx=0x0585E9 cur=0xD1A8CD vat=0xD3FE81/0xD3FE81/0xD3FE81/0xD3FECD |
| 6280 | 3679 | 0x001377 | countdownLoop | djnz 0x001377 | a=0x76 f=0x42 bc=0x000124 de=0xD1A7FC hl=0xD18C7C ix=0x000000 iy=0x3B001A sp=0xD1A87E stk=0x000000/0x000000/0x000000/0x000000 key=0x00/0x00/0x1A/0x00 flags=0x18/0x00/0x00/0x0A/0x00 cx=0x0585E9 cur=0xD1A8CD vat=0xD3FE81/0xD3FE81/0xD3FE81/0xD3FECD |
| 6281 | 3680 | 0x001379 | port3Read | in0 a, (0x03) | a=0x76 f=0x42 bc=0x000024 de=0xD1A7FC hl=0xD18C7C ix=0x000000 iy=0x3B001A sp=0xD1A87E stk=0x000000/0x000000/0x000000/0x000000 key=0x00/0x00/0x1A/0x00 flags=0x18/0x00/0x00/0x0A/0x00 cx=0x0585E9 cur=0xD1A8CD vat=0xD3FE81/0xD3FE81/0xD3FE81/0xD3FECD |
| 6282 | 3681 | 0x00138A | port3PostRead | ld a, 0x26 | a=0xEE f=0x54 bc=0x000024 de=0xD1A7FC hl=0xD18C7C ix=0x000000 iy=0x3B001A sp=0xD1A87E stk=0x000000/0x000000/0x000000/0x000000 key=0x00/0x00/0x1A/0x00 flags=0x18/0x00/0x00/0x0A/0x00 cx=0x0585E9 cur=0xD1A8CD vat=0xD3FE81/0xD3FE81/0xD3FE81/0xD3FECD |
| 6283 | 3682 | 0x001393 | port3Prep | ld a, 0x03 | a=0x26 f=0x42 bc=0x000024 de=0xD1A7FC hl=0xD18C7C ix=0x000000 iy=0x3B001A sp=0xD1A87E stk=0x000000/0x000000/0x000000/0x000000 key=0x00/0x00/0x1A/0x00 flags=0x18/0x00/0x00/0x0A/0x00 cx=0x0585E9 cur=0xD1A8CD vat=0xD3FE81/0xD3FE81/0xD3FE81/0xD3FECD |
| 6284 | 3683 | 0x00139D | wrapperSetup | ld bc, 0x00a000 | a=0x03 f=0x42 bc=0x000024 de=0xD1A7FC hl=0xD18C7C ix=0x000000 iy=0x3B001A sp=0xD1A87E stk=0x000000/0x000000/0x000000/0x000000 key=0x00/0x00/0x1A/0x00 flags=0x18/0x00/0x00/0x0A/0x00 cx=0x0585E9 cur=0xD1A8CD vat=0xD3FE81/0xD3FE81/0xD3FE81/0xD3FECD |
| 6285 | 3684 | 0x0013C3 | wrapperCall | call 0x001988 | a=0x08 f=0x42 bc=0x00A005 de=0xD1A7FC hl=0x000000 ix=0x000000 iy=0x3B001A sp=0xD1A87E stk=0x000000/0x000000/0x000000/0x000000 key=0x00/0x00/0x1A/0x00 flags=0x18/0x00/0x00/0x0A/0x00 cx=0x0585E9 cur=0xD1A8CD vat=0xD3FE81/0xD3FE81/0xD3FE81/0xD3FECD |
| 6286 | 3685 | 0x001988 | helperEntry | di | a=0x08 f=0x42 bc=0x00A005 de=0xD1A7FC hl=0x000000 ix=0x000000 iy=0x3B001A sp=0xD1A87B stk=0x0013C7/0x000000/0x000000/0x000000 key=0x00/0x00/0x1A/0x00 flags=0x18/0x00/0x00/0x0A/0x00 cx=0x0585E9 cur=0xD1A8CD vat=0xD3FE81/0xD3FE81/0xD3FE81/0xD3FECD |
| 6287 | 3686 | 0x001991 | helperStackSave | ld bc, 0x001005 | a=0xEE f=0x54 bc=0x00A005 de=0xD1A7FC hl=0x000000 ix=0x000000 iy=0x3B001A sp=0xD1A878 stk=0x00A005/0x0013C7/0x000000/0x000000 key=0x00/0x00/0x1A/0x00 flags=0x18/0x00/0x00/0x0A/0x00 cx=0x0585E9 cur=0xD1A8CD vat=0xD3FE81/0xD3FE81/0xD3FE81/0xD3FECD |
| 6288 | 3687 | 0x00199E | helperLoadB | ld a, b | a=0x04 f=0x42 bc=0x001005 de=0xD1A7FC hl=0x000000 ix=0x000000 iy=0x3B001A sp=0xD1A878 stk=0x00A005/0x0013C7/0x000000/0x000000 key=0x00/0x00/0x1A/0x00 flags=0x18/0x00/0x00/0x0A/0x00 cx=0x0585E9 cur=0xD1A8CD vat=0xD3FE81/0xD3FE81/0xD3FE81/0xD3FECD |
| 6289 | 3688 | 0x0019A4 | helperLoadC | ld a, c | a=0x10 f=0x42 bc=0x001005 de=0xD1A7FC hl=0x000000 ix=0x000000 iy=0x3B001A sp=0xD1A878 stk=0x00A005/0x0013C7/0x000000/0x000000 key=0x00/0x00/0x1A/0x00 flags=0x18/0x00/0x00/0x0A/0x00 cx=0x0585E9 cur=0xD1A8CD vat=0xD3FE81/0xD3FE81/0xD3FE81/0xD3FECD |
| 6290 | 3689 | 0x0019A9 | helperPortSelect | ld a, 0x03 | a=0x05 f=0x42 bc=0x001005 de=0xD1A7FC hl=0x000000 ix=0x000000 iy=0x3B001A sp=0xD1A878 stk=0x00A005/0x0013C7/0x000000/0x000000 key=0x00/0x00/0x1A/0x00 flags=0x18/0x00/0x00/0x0A/0x00 cx=0x0585E9 cur=0xD1A8CD vat=0xD3FE81/0xD3FE81/0xD3FE81/0xD3FECD |
| 6291 | 3690 | 0x0019B3 | helperDynamicReturn | pop bc | a=0x03 f=0x42 bc=0x001005 de=0xD1A7FC hl=0x000000 ix=0x000000 iy=0x3B001A sp=0xD1A878 stk=0x00A005/0x0013C7/0x000000/0x000000 key=0x00/0x00/0x1A/0x00 flags=0x18/0x00/0x00/0x0A/0x00 cx=0x0585E9 cur=0xD1A8CD vat=0xD3FE81/0xD3FE81/0xD3FE81/0xD3FECD |
| 6292 | 3691 | 0x0013C7 | wrapperResume | ld a, 0xd0 | a=0x03 f=0x42 bc=0x00A005 de=0xD1A7FC hl=0x000000 ix=0x000000 iy=0x3B001A sp=0xD1A87E stk=0x000000/0x000000/0x000000/0x000000 key=0x00/0x00/0x1A/0x00 flags=0x18/0x00/0x00/0x0A/0x00 cx=0x0585E9 cur=0xD1A8CD vat=0xD3FE81/0xD3FE81/0xD3FE81/0xD3FECD |
| 6293 | 3692 | 0x0158DE | preOwnerFlagGate | ld iy, 0xd00080 | a=0xD0 f=0x42 bc=0x00A005 de=0xD1A7FC hl=0x000000 ix=0x000000 iy=0xD00080 sp=0xD1A87B stk=0x0013DA/0x000000/0x000000/0x000000 key=0x00/0x00/0x1A/0x00 flags=0x18/0x00/0x00/0x0A/0x00 cx=0x0585E9 cur=0xD1A8CD vat=0xD3FE81/0xD3FE81/0xD3FE81/0xD3FECD |
| 6294 | 3693 | 0x0158E8 | preOwnerCall | call 0x0158bc | a=0xD0 f=0x54 bc=0x00A005 de=0xD1A7FC hl=0x000000 ix=0x000000 iy=0xD00080 sp=0xD1A87B stk=0x0013DA/0x000000/0x000000/0x000000 key=0x00/0x00/0x1A/0x00 flags=0x18/0x00/0x00/0x0A/0x00 cx=0x0585E9 cur=0xD1A8CD vat=0xD3FE81/0xD3FE81/0xD3FE81/0xD3FECD |

## Primary Recent Dynamic Targets

| block | delta | from | target | mode |
|---:|---:|---:|---:|---|
| 5790 | 3189 | 0x0021C2 | 0x02B175 | adl |
| 5801 | 3200 | 0x002197 | 0x0BCB37 | adl |
| 5802 | 3201 | 0x0BCB37 | 0x02B31D | adl |
| 5818 | 3217 | 0x0008BB | 0x001717 | adl |
| 5829 | 3228 | 0x001CE5 | 0x001C54 | adl |
| 5830 | 3229 | 0x001C54 | 0x006808 | adl |
| 5840 | 3239 | 0x001CE4 | 0x001C81 | adl |
| 5842 | 3241 | 0x001C82 | 0x001C48 | adl |
| 5852 | 3251 | 0x001CE4 | 0x001C81 | adl |
| 5854 | 3253 | 0x001C82 | 0x001C48 | adl |
| 5864 | 3263 | 0x001CE4 | 0x001C81 | adl |
| 5866 | 3265 | 0x001C82 | 0x001C48 | adl |
| 5876 | 3275 | 0x001CE4 | 0x001C81 | adl |
| 5878 | 3277 | 0x001C82 | 0x001C48 | adl |
| 5883 | 3282 | 0x001C42 | 0x006810 | adl |
| 5890 | 3289 | 0x001CE4 | 0x001C54 | adl |
| 5891 | 3290 | 0x001C54 | 0x006816 | adl |
| 5894 | 3293 | 0x006828 | 0x001727 | adl |
| 5895 | 3294 | 0x001727 | 0x000719 | adl |
| 5919 | 3318 | 0x003CF3 | 0x03F998 | adl |
| 5925 | 3324 | 0x03F9B8 | 0x03D058 | adl |
| 5927 | 3326 | 0x05C623 | 0x03D060 | adl |
| 5929 | 3328 | 0x03D0E0 | 0x000000 | adl |
| 6291 | 3690 | 0x0019B3 | 0x0013C7 | adl |

## Clear-Key-RAM Window Before First 0x0158BC

| block | delta | pc | label | first insn | state |
|---:|---:|---:|---|---|---|
| 7196 | 4306 | 0x001377 | countdownLoop | djnz 0x001377 | a=0x76 f=0x42 bc=0x000A24 de=0xD1A7FC hl=0xD18C7C ix=0x000000 iy=0x3B001A sp=0xD1A87E stk=0x000000/0x000000/0x000000/0x000000 key=0x00/0x00/0x00/0x00 flags=0x10/0x00/0x00/0x0A/0x00 cx=0x0585E9 cur=0xD1A8CD vat=0xD3FE81/0xD3FE81/0xD3FE81/0xD3FECD |
| 7197 | 4307 | 0x001377 | countdownLoop | djnz 0x001377 | a=0x76 f=0x42 bc=0x000924 de=0xD1A7FC hl=0xD18C7C ix=0x000000 iy=0x3B001A sp=0xD1A87E stk=0x000000/0x000000/0x000000/0x000000 key=0x00/0x00/0x00/0x00 flags=0x10/0x00/0x00/0x0A/0x00 cx=0x0585E9 cur=0xD1A8CD vat=0xD3FE81/0xD3FE81/0xD3FE81/0xD3FECD |
| 7198 | 4308 | 0x001377 | countdownLoop | djnz 0x001377 | a=0x76 f=0x42 bc=0x000824 de=0xD1A7FC hl=0xD18C7C ix=0x000000 iy=0x3B001A sp=0xD1A87E stk=0x000000/0x000000/0x000000/0x000000 key=0x00/0x00/0x00/0x00 flags=0x10/0x00/0x00/0x0A/0x00 cx=0x0585E9 cur=0xD1A8CD vat=0xD3FE81/0xD3FE81/0xD3FE81/0xD3FECD |
| 7199 | 4309 | 0x001377 | countdownLoop | djnz 0x001377 | a=0x76 f=0x42 bc=0x000724 de=0xD1A7FC hl=0xD18C7C ix=0x000000 iy=0x3B001A sp=0xD1A87E stk=0x000000/0x000000/0x000000/0x000000 key=0x00/0x00/0x00/0x00 flags=0x10/0x00/0x00/0x0A/0x00 cx=0x0585E9 cur=0xD1A8CD vat=0xD3FE81/0xD3FE81/0xD3FE81/0xD3FECD |
| 7200 | 4310 | 0x001377 | countdownLoop | djnz 0x001377 | a=0x76 f=0x42 bc=0x000624 de=0xD1A7FC hl=0xD18C7C ix=0x000000 iy=0x3B001A sp=0xD1A87E stk=0x000000/0x000000/0x000000/0x000000 key=0x00/0x00/0x00/0x00 flags=0x10/0x00/0x00/0x0A/0x00 cx=0x0585E9 cur=0xD1A8CD vat=0xD3FE81/0xD3FE81/0xD3FE81/0xD3FECD |
| 7201 | 4311 | 0x001377 | countdownLoop | djnz 0x001377 | a=0x76 f=0x42 bc=0x000524 de=0xD1A7FC hl=0xD18C7C ix=0x000000 iy=0x3B001A sp=0xD1A87E stk=0x000000/0x000000/0x000000/0x000000 key=0x00/0x00/0x00/0x00 flags=0x10/0x00/0x00/0x0A/0x00 cx=0x0585E9 cur=0xD1A8CD vat=0xD3FE81/0xD3FE81/0xD3FE81/0xD3FECD |
| 7202 | 4312 | 0x001377 | countdownLoop | djnz 0x001377 | a=0x76 f=0x42 bc=0x000424 de=0xD1A7FC hl=0xD18C7C ix=0x000000 iy=0x3B001A sp=0xD1A87E stk=0x000000/0x000000/0x000000/0x000000 key=0x00/0x00/0x00/0x00 flags=0x10/0x00/0x00/0x0A/0x00 cx=0x0585E9 cur=0xD1A8CD vat=0xD3FE81/0xD3FE81/0xD3FE81/0xD3FECD |
| 7203 | 4313 | 0x001377 | countdownLoop | djnz 0x001377 | a=0x76 f=0x42 bc=0x000324 de=0xD1A7FC hl=0xD18C7C ix=0x000000 iy=0x3B001A sp=0xD1A87E stk=0x000000/0x000000/0x000000/0x000000 key=0x00/0x00/0x00/0x00 flags=0x10/0x00/0x00/0x0A/0x00 cx=0x0585E9 cur=0xD1A8CD vat=0xD3FE81/0xD3FE81/0xD3FE81/0xD3FECD |
| 7204 | 4314 | 0x001377 | countdownLoop | djnz 0x001377 | a=0x76 f=0x42 bc=0x000224 de=0xD1A7FC hl=0xD18C7C ix=0x000000 iy=0x3B001A sp=0xD1A87E stk=0x000000/0x000000/0x000000/0x000000 key=0x00/0x00/0x00/0x00 flags=0x10/0x00/0x00/0x0A/0x00 cx=0x0585E9 cur=0xD1A8CD vat=0xD3FE81/0xD3FE81/0xD3FE81/0xD3FECD |
| 7205 | 4315 | 0x001377 | countdownLoop | djnz 0x001377 | a=0x76 f=0x42 bc=0x000124 de=0xD1A7FC hl=0xD18C7C ix=0x000000 iy=0x3B001A sp=0xD1A87E stk=0x000000/0x000000/0x000000/0x000000 key=0x00/0x00/0x00/0x00 flags=0x10/0x00/0x00/0x0A/0x00 cx=0x0585E9 cur=0xD1A8CD vat=0xD3FE81/0xD3FE81/0xD3FE81/0xD3FECD |
| 7206 | 4316 | 0x001379 | port3Read | in0 a, (0x03) | a=0x76 f=0x42 bc=0x000024 de=0xD1A7FC hl=0xD18C7C ix=0x000000 iy=0x3B001A sp=0xD1A87E stk=0x000000/0x000000/0x000000/0x000000 key=0x00/0x00/0x00/0x00 flags=0x10/0x00/0x00/0x0A/0x00 cx=0x0585E9 cur=0xD1A8CD vat=0xD3FE81/0xD3FE81/0xD3FE81/0xD3FECD |
| 7207 | 4317 | 0x00138A | port3PostRead | ld a, 0x26 | a=0xEE f=0x54 bc=0x000024 de=0xD1A7FC hl=0xD18C7C ix=0x000000 iy=0x3B001A sp=0xD1A87E stk=0x000000/0x000000/0x000000/0x000000 key=0x00/0x00/0x00/0x00 flags=0x10/0x00/0x00/0x0A/0x00 cx=0x0585E9 cur=0xD1A8CD vat=0xD3FE81/0xD3FE81/0xD3FE81/0xD3FECD |
| 7208 | 4318 | 0x001393 | port3Prep | ld a, 0x03 | a=0x26 f=0x42 bc=0x000024 de=0xD1A7FC hl=0xD18C7C ix=0x000000 iy=0x3B001A sp=0xD1A87E stk=0x000000/0x000000/0x000000/0x000000 key=0x00/0x00/0x00/0x00 flags=0x10/0x00/0x00/0x0A/0x00 cx=0x0585E9 cur=0xD1A8CD vat=0xD3FE81/0xD3FE81/0xD3FE81/0xD3FECD |
| 7209 | 4319 | 0x00139D | wrapperSetup | ld bc, 0x00a000 | a=0x03 f=0x42 bc=0x000024 de=0xD1A7FC hl=0xD18C7C ix=0x000000 iy=0x3B001A sp=0xD1A87E stk=0x000000/0x000000/0x000000/0x000000 key=0x00/0x00/0x00/0x00 flags=0x10/0x00/0x00/0x0A/0x00 cx=0x0585E9 cur=0xD1A8CD vat=0xD3FE81/0xD3FE81/0xD3FE81/0xD3FECD |
| 7210 | 4320 | 0x0013C3 | wrapperCall | call 0x001988 | a=0x08 f=0x42 bc=0x00A005 de=0xD1A7FC hl=0x000000 ix=0x000000 iy=0x3B001A sp=0xD1A87E stk=0x000000/0x000000/0x000000/0x000000 key=0x00/0x00/0x00/0x00 flags=0x10/0x00/0x00/0x0A/0x00 cx=0x0585E9 cur=0xD1A8CD vat=0xD3FE81/0xD3FE81/0xD3FE81/0xD3FECD |
| 7211 | 4321 | 0x001988 | helperEntry | di | a=0x08 f=0x42 bc=0x00A005 de=0xD1A7FC hl=0x000000 ix=0x000000 iy=0x3B001A sp=0xD1A87B stk=0x0013C7/0x000000/0x000000/0x000000 key=0x00/0x00/0x00/0x00 flags=0x10/0x00/0x00/0x0A/0x00 cx=0x0585E9 cur=0xD1A8CD vat=0xD3FE81/0xD3FE81/0xD3FE81/0xD3FECD |
| 7212 | 4322 | 0x001991 | helperStackSave | ld bc, 0x001005 | a=0xEE f=0x54 bc=0x00A005 de=0xD1A7FC hl=0x000000 ix=0x000000 iy=0x3B001A sp=0xD1A878 stk=0x00A005/0x0013C7/0x000000/0x000000 key=0x00/0x00/0x00/0x00 flags=0x10/0x00/0x00/0x0A/0x00 cx=0x0585E9 cur=0xD1A8CD vat=0xD3FE81/0xD3FE81/0xD3FE81/0xD3FECD |
| 7213 | 4323 | 0x00199E | helperLoadB | ld a, b | a=0x04 f=0x42 bc=0x001005 de=0xD1A7FC hl=0x000000 ix=0x000000 iy=0x3B001A sp=0xD1A878 stk=0x00A005/0x0013C7/0x000000/0x000000 key=0x00/0x00/0x00/0x00 flags=0x10/0x00/0x00/0x0A/0x00 cx=0x0585E9 cur=0xD1A8CD vat=0xD3FE81/0xD3FE81/0xD3FE81/0xD3FECD |
| 7214 | 4324 | 0x0019A4 | helperLoadC | ld a, c | a=0x10 f=0x42 bc=0x001005 de=0xD1A7FC hl=0x000000 ix=0x000000 iy=0x3B001A sp=0xD1A878 stk=0x00A005/0x0013C7/0x000000/0x000000 key=0x00/0x00/0x00/0x00 flags=0x10/0x00/0x00/0x0A/0x00 cx=0x0585E9 cur=0xD1A8CD vat=0xD3FE81/0xD3FE81/0xD3FE81/0xD3FECD |
| 7215 | 4325 | 0x0019A9 | helperPortSelect | ld a, 0x03 | a=0x05 f=0x42 bc=0x001005 de=0xD1A7FC hl=0x000000 ix=0x000000 iy=0x3B001A sp=0xD1A878 stk=0x00A005/0x0013C7/0x000000/0x000000 key=0x00/0x00/0x00/0x00 flags=0x10/0x00/0x00/0x0A/0x00 cx=0x0585E9 cur=0xD1A8CD vat=0xD3FE81/0xD3FE81/0xD3FE81/0xD3FECD |
| 7216 | 4326 | 0x0019B3 | helperDynamicReturn | pop bc | a=0x03 f=0x42 bc=0x001005 de=0xD1A7FC hl=0x000000 ix=0x000000 iy=0x3B001A sp=0xD1A878 stk=0x00A005/0x0013C7/0x000000/0x000000 key=0x00/0x00/0x00/0x00 flags=0x10/0x00/0x00/0x0A/0x00 cx=0x0585E9 cur=0xD1A8CD vat=0xD3FE81/0xD3FE81/0xD3FE81/0xD3FECD |
| 7217 | 4327 | 0x0013C7 | wrapperResume | ld a, 0xd0 | a=0x03 f=0x42 bc=0x00A005 de=0xD1A7FC hl=0x000000 ix=0x000000 iy=0x3B001A sp=0xD1A87E stk=0x000000/0x000000/0x000000/0x000000 key=0x00/0x00/0x00/0x00 flags=0x10/0x00/0x00/0x0A/0x00 cx=0x0585E9 cur=0xD1A8CD vat=0xD3FE81/0xD3FE81/0xD3FE81/0xD3FECD |
| 7218 | 4328 | 0x0158DE | preOwnerFlagGate | ld iy, 0xd00080 | a=0xD0 f=0x42 bc=0x00A005 de=0xD1A7FC hl=0x000000 ix=0x000000 iy=0xD00080 sp=0xD1A87B stk=0x0013DA/0x000000/0x000000/0x000000 key=0x00/0x00/0x00/0x00 flags=0x10/0x00/0x00/0x0A/0x00 cx=0x0585E9 cur=0xD1A8CD vat=0xD3FE81/0xD3FE81/0xD3FE81/0xD3FECD |
| 7219 | 4329 | 0x0158E8 | preOwnerCall | call 0x0158bc | a=0xD0 f=0x54 bc=0x00A005 de=0xD1A7FC hl=0x000000 ix=0x000000 iy=0xD00080 sp=0xD1A87B stk=0x0013DA/0x000000/0x000000/0x000000 key=0x00/0x00/0x00/0x00 flags=0x10/0x00/0x00/0x0A/0x00 cx=0x0585E9 cur=0xD1A8CD vat=0xD3FE81/0xD3FE81/0xD3FE81/0xD3FECD |

## No-Pending Control Window Before First 0x0158BC

| block | delta | pc | label | first insn | state |
|---:|---:|---:|---|---|---|
| 3227 | 3226 | 0x001377 | countdownLoop | djnz 0x001377 | a=0x76 f=0x42 bc=0x000A24 de=0xD1A7FC hl=0xD18C7C ix=0x000000 iy=0x3B001A sp=0xD1A87E stk=0x000000/0x000000/0x000000/0x000000 key=0x00/0x00/0x00/0x00 flags=0x00/0x00/0x00/0x0A/0x00 cx=0x0585E9 cur=0xD1A8CC vat=0xD3FE81/0xD3FE81/0xD3FE81/0xD3FECD |
| 3228 | 3227 | 0x001377 | countdownLoop | djnz 0x001377 | a=0x76 f=0x42 bc=0x000924 de=0xD1A7FC hl=0xD18C7C ix=0x000000 iy=0x3B001A sp=0xD1A87E stk=0x000000/0x000000/0x000000/0x000000 key=0x00/0x00/0x00/0x00 flags=0x00/0x00/0x00/0x0A/0x00 cx=0x0585E9 cur=0xD1A8CC vat=0xD3FE81/0xD3FE81/0xD3FE81/0xD3FECD |
| 3229 | 3228 | 0x001377 | countdownLoop | djnz 0x001377 | a=0x76 f=0x42 bc=0x000824 de=0xD1A7FC hl=0xD18C7C ix=0x000000 iy=0x3B001A sp=0xD1A87E stk=0x000000/0x000000/0x000000/0x000000 key=0x00/0x00/0x00/0x00 flags=0x00/0x00/0x00/0x0A/0x00 cx=0x0585E9 cur=0xD1A8CC vat=0xD3FE81/0xD3FE81/0xD3FE81/0xD3FECD |
| 3230 | 3229 | 0x001377 | countdownLoop | djnz 0x001377 | a=0x76 f=0x42 bc=0x000724 de=0xD1A7FC hl=0xD18C7C ix=0x000000 iy=0x3B001A sp=0xD1A87E stk=0x000000/0x000000/0x000000/0x000000 key=0x00/0x00/0x00/0x00 flags=0x00/0x00/0x00/0x0A/0x00 cx=0x0585E9 cur=0xD1A8CC vat=0xD3FE81/0xD3FE81/0xD3FE81/0xD3FECD |
| 3231 | 3230 | 0x001377 | countdownLoop | djnz 0x001377 | a=0x76 f=0x42 bc=0x000624 de=0xD1A7FC hl=0xD18C7C ix=0x000000 iy=0x3B001A sp=0xD1A87E stk=0x000000/0x000000/0x000000/0x000000 key=0x00/0x00/0x00/0x00 flags=0x00/0x00/0x00/0x0A/0x00 cx=0x0585E9 cur=0xD1A8CC vat=0xD3FE81/0xD3FE81/0xD3FE81/0xD3FECD |
| 3232 | 3231 | 0x001377 | countdownLoop | djnz 0x001377 | a=0x76 f=0x42 bc=0x000524 de=0xD1A7FC hl=0xD18C7C ix=0x000000 iy=0x3B001A sp=0xD1A87E stk=0x000000/0x000000/0x000000/0x000000 key=0x00/0x00/0x00/0x00 flags=0x00/0x00/0x00/0x0A/0x00 cx=0x0585E9 cur=0xD1A8CC vat=0xD3FE81/0xD3FE81/0xD3FE81/0xD3FECD |
| 3233 | 3232 | 0x001377 | countdownLoop | djnz 0x001377 | a=0x76 f=0x42 bc=0x000424 de=0xD1A7FC hl=0xD18C7C ix=0x000000 iy=0x3B001A sp=0xD1A87E stk=0x000000/0x000000/0x000000/0x000000 key=0x00/0x00/0x00/0x00 flags=0x00/0x00/0x00/0x0A/0x00 cx=0x0585E9 cur=0xD1A8CC vat=0xD3FE81/0xD3FE81/0xD3FE81/0xD3FECD |
| 3234 | 3233 | 0x001377 | countdownLoop | djnz 0x001377 | a=0x76 f=0x42 bc=0x000324 de=0xD1A7FC hl=0xD18C7C ix=0x000000 iy=0x3B001A sp=0xD1A87E stk=0x000000/0x000000/0x000000/0x000000 key=0x00/0x00/0x00/0x00 flags=0x00/0x00/0x00/0x0A/0x00 cx=0x0585E9 cur=0xD1A8CC vat=0xD3FE81/0xD3FE81/0xD3FE81/0xD3FECD |
| 3235 | 3234 | 0x001377 | countdownLoop | djnz 0x001377 | a=0x76 f=0x42 bc=0x000224 de=0xD1A7FC hl=0xD18C7C ix=0x000000 iy=0x3B001A sp=0xD1A87E stk=0x000000/0x000000/0x000000/0x000000 key=0x00/0x00/0x00/0x00 flags=0x00/0x00/0x00/0x0A/0x00 cx=0x0585E9 cur=0xD1A8CC vat=0xD3FE81/0xD3FE81/0xD3FE81/0xD3FECD |
| 3236 | 3235 | 0x001377 | countdownLoop | djnz 0x001377 | a=0x76 f=0x42 bc=0x000124 de=0xD1A7FC hl=0xD18C7C ix=0x000000 iy=0x3B001A sp=0xD1A87E stk=0x000000/0x000000/0x000000/0x000000 key=0x00/0x00/0x00/0x00 flags=0x00/0x00/0x00/0x0A/0x00 cx=0x0585E9 cur=0xD1A8CC vat=0xD3FE81/0xD3FE81/0xD3FE81/0xD3FECD |
| 3237 | 3236 | 0x001379 | port3Read | in0 a, (0x03) | a=0x76 f=0x42 bc=0x000024 de=0xD1A7FC hl=0xD18C7C ix=0x000000 iy=0x3B001A sp=0xD1A87E stk=0x000000/0x000000/0x000000/0x000000 key=0x00/0x00/0x00/0x00 flags=0x00/0x00/0x00/0x0A/0x00 cx=0x0585E9 cur=0xD1A8CC vat=0xD3FE81/0xD3FE81/0xD3FE81/0xD3FECD |
| 3238 | 3237 | 0x00138A | port3PostRead | ld a, 0x26 | a=0xEE f=0x54 bc=0x000024 de=0xD1A7FC hl=0xD18C7C ix=0x000000 iy=0x3B001A sp=0xD1A87E stk=0x000000/0x000000/0x000000/0x000000 key=0x00/0x00/0x00/0x00 flags=0x00/0x00/0x00/0x0A/0x00 cx=0x0585E9 cur=0xD1A8CC vat=0xD3FE81/0xD3FE81/0xD3FE81/0xD3FECD |
| 3239 | 3238 | 0x001393 | port3Prep | ld a, 0x03 | a=0x26 f=0x42 bc=0x000024 de=0xD1A7FC hl=0xD18C7C ix=0x000000 iy=0x3B001A sp=0xD1A87E stk=0x000000/0x000000/0x000000/0x000000 key=0x00/0x00/0x00/0x00 flags=0x00/0x00/0x00/0x0A/0x00 cx=0x0585E9 cur=0xD1A8CC vat=0xD3FE81/0xD3FE81/0xD3FE81/0xD3FECD |
| 3240 | 3239 | 0x00139D | wrapperSetup | ld bc, 0x00a000 | a=0x03 f=0x42 bc=0x000024 de=0xD1A7FC hl=0xD18C7C ix=0x000000 iy=0x3B001A sp=0xD1A87E stk=0x000000/0x000000/0x000000/0x000000 key=0x00/0x00/0x00/0x00 flags=0x00/0x00/0x00/0x0A/0x00 cx=0x0585E9 cur=0xD1A8CC vat=0xD3FE81/0xD3FE81/0xD3FE81/0xD3FECD |
| 3241 | 3240 | 0x0013C3 | wrapperCall | call 0x001988 | a=0x08 f=0x42 bc=0x00A005 de=0xD1A7FC hl=0x000000 ix=0x000000 iy=0x3B001A sp=0xD1A87E stk=0x000000/0x000000/0x000000/0x000000 key=0x00/0x00/0x00/0x00 flags=0x00/0x00/0x00/0x0A/0x00 cx=0x0585E9 cur=0xD1A8CC vat=0xD3FE81/0xD3FE81/0xD3FE81/0xD3FECD |
| 3242 | 3241 | 0x001988 | helperEntry | di | a=0x08 f=0x42 bc=0x00A005 de=0xD1A7FC hl=0x000000 ix=0x000000 iy=0x3B001A sp=0xD1A87B stk=0x0013C7/0x000000/0x000000/0x000000 key=0x00/0x00/0x00/0x00 flags=0x00/0x00/0x00/0x0A/0x00 cx=0x0585E9 cur=0xD1A8CC vat=0xD3FE81/0xD3FE81/0xD3FE81/0xD3FECD |
| 3243 | 3242 | 0x001991 | helperStackSave | ld bc, 0x001005 | a=0xEE f=0x54 bc=0x00A005 de=0xD1A7FC hl=0x000000 ix=0x000000 iy=0x3B001A sp=0xD1A878 stk=0x00A005/0x0013C7/0x000000/0x000000 key=0x00/0x00/0x00/0x00 flags=0x00/0x00/0x00/0x0A/0x00 cx=0x0585E9 cur=0xD1A8CC vat=0xD3FE81/0xD3FE81/0xD3FE81/0xD3FECD |
| 3244 | 3243 | 0x00199E | helperLoadB | ld a, b | a=0x04 f=0x42 bc=0x001005 de=0xD1A7FC hl=0x000000 ix=0x000000 iy=0x3B001A sp=0xD1A878 stk=0x00A005/0x0013C7/0x000000/0x000000 key=0x00/0x00/0x00/0x00 flags=0x00/0x00/0x00/0x0A/0x00 cx=0x0585E9 cur=0xD1A8CC vat=0xD3FE81/0xD3FE81/0xD3FE81/0xD3FECD |
| 3245 | 3244 | 0x0019A4 | helperLoadC | ld a, c | a=0x10 f=0x42 bc=0x001005 de=0xD1A7FC hl=0x000000 ix=0x000000 iy=0x3B001A sp=0xD1A878 stk=0x00A005/0x0013C7/0x000000/0x000000 key=0x00/0x00/0x00/0x00 flags=0x00/0x00/0x00/0x0A/0x00 cx=0x0585E9 cur=0xD1A8CC vat=0xD3FE81/0xD3FE81/0xD3FE81/0xD3FECD |
| 3246 | 3245 | 0x0019A9 | helperPortSelect | ld a, 0x03 | a=0x05 f=0x42 bc=0x001005 de=0xD1A7FC hl=0x000000 ix=0x000000 iy=0x3B001A sp=0xD1A878 stk=0x00A005/0x0013C7/0x000000/0x000000 key=0x00/0x00/0x00/0x00 flags=0x00/0x00/0x00/0x0A/0x00 cx=0x0585E9 cur=0xD1A8CC vat=0xD3FE81/0xD3FE81/0xD3FE81/0xD3FECD |
| 3247 | 3246 | 0x0019B3 | helperDynamicReturn | pop bc | a=0x03 f=0x42 bc=0x001005 de=0xD1A7FC hl=0x000000 ix=0x000000 iy=0x3B001A sp=0xD1A878 stk=0x00A005/0x0013C7/0x000000/0x000000 key=0x00/0x00/0x00/0x00 flags=0x00/0x00/0x00/0x0A/0x00 cx=0x0585E9 cur=0xD1A8CC vat=0xD3FE81/0xD3FE81/0xD3FE81/0xD3FECD |
| 3248 | 3247 | 0x0013C7 | wrapperResume | ld a, 0xd0 | a=0x03 f=0x42 bc=0x00A005 de=0xD1A7FC hl=0x000000 ix=0x000000 iy=0x3B001A sp=0xD1A87E stk=0x000000/0x000000/0x000000/0x000000 key=0x00/0x00/0x00/0x00 flags=0x00/0x00/0x00/0x0A/0x00 cx=0x0585E9 cur=0xD1A8CC vat=0xD3FE81/0xD3FE81/0xD3FE81/0xD3FECD |
| 3249 | 3248 | 0x0158DE | preOwnerFlagGate | ld iy, 0xd00080 | a=0xD0 f=0x42 bc=0x00A005 de=0xD1A7FC hl=0x000000 ix=0x000000 iy=0xD00080 sp=0xD1A87B stk=0x0013DA/0x000000/0x000000/0x000000 key=0x00/0x00/0x00/0x00 flags=0x00/0x00/0x00/0x0A/0x00 cx=0x0585E9 cur=0xD1A8CC vat=0xD3FE81/0xD3FE81/0xD3FE81/0xD3FECD |
| 3250 | 3249 | 0x0158E8 | preOwnerCall | call 0x0158bc | a=0xD0 f=0x54 bc=0x00A005 de=0xD1A7FC hl=0x000000 ix=0x000000 iy=0xD00080 sp=0xD1A87B stk=0x0013DA/0x000000/0x000000/0x000000 key=0x00/0x00/0x00/0x00 flags=0x00/0x00/0x00/0x0A/0x00 cx=0x0585E9 cur=0xD1A8CC vat=0xD3FE81/0xD3FE81/0xD3FE81/0xD3FECD |

## Primary Metadata For Return Frames

```json
{
  "importantMetas": {
    "0x000038": {
      "pc": "0x000038",
      "mode": "adl",
      "first": "ex af, af'",
      "last": "jp 0x0006f3",
      "instructions": [
        "ex af, af'",
        "exx",
        "push ix",
        "push iy",
        "ld iy, 0xd00080",
        "jp 0x0006f3"
      ],
      "exits": [
        {
          "type": "jump",
          "target": "0x0006F3",
          "targetMode": "adl"
        }
      ]
    },
    "0x0585E9": {
      "pc": "0x0585E9",
      "mode": "adl",
      "first": "res 6, (iy+73)",
      "last": "call nz, 0x0239b3",
      "instructions": [
        "res 6, (iy+73)",
        "ld b, a",
        "ld a, 0x01",
        "bit 4, (iy+52)",
        "call nz, 0x0239b3"
      ],
      "exits": [
        {
          "type": "call",
          "target": "0x0239B3",
          "targetMode": "adl"
        },
        {
          "type": "call-return",
          "target": "0x0585F8",
          "targetMode": "adl"
        }
      ]
    },
    "0x058EDA": {
      "pc": "0x058EDA",
      "mode": "adl",
      "first": "cp 0xfa",
      "last": "ret nz",
      "instructions": [
        "cp 0xfa",
        "ret nz"
      ],
      "exits": [
        {
          "type": "return-conditional",
          "target": null,
          "targetMode": null
        },
        {
          "type": "fallthrough",
          "target": "0x058EDD",
          "targetMode": "adl"
        }
      ]
    },
    "0x03FA09": {
      "pc": "0x03FA09",
      "mode": "adl",
      "first": "ld hl, 0xd00587",
      "last": "jp nz, 0x03fb9a",
      "instructions": [
        "ld hl, 0xd00587",
        "di",
        "ld a, (hl)",
        "ld (hl), 0x00",
        "res 3, (iy+0)",
        "ei",
        "push af",
        "or a",
        "jp nz, 0x03fb9a"
      ],
      "exits": [
        {
          "type": "branch",
          "target": "0x03FB9A",
          "targetMode": "adl"
        },
        {
          "type": "fallthrough",
          "target": "0x03FA1C",
          "targetMode": "adl"
        }
      ]
    },
    "0x001377": {
      "pc": "0x001377",
      "mode": "adl",
      "first": "djnz 0x001377",
      "last": "djnz 0x001377",
      "instructions": [
        "djnz 0x001377"
      ],
      "exits": [
        {
          "type": "branch",
          "target": "0x001377",
          "targetMode": "adl"
        },
        {
          "type": "fallthrough",
          "target": "0x001379",
          "targetMode": "adl"
        }
      ]
    },
    "0x001379": {
      "pc": "0x001379",
      "mode": "adl",
      "first": "in0 a, (0x03)",
      "last": "jr z, 0x00138a",
      "instructions": [
        "in0 a, (0x03)",
        "bit 4, a",
        "jr z, 0x00138a"
      ],
      "exits": [
        {
          "type": "branch",
          "target": "0x00138A",
          "targetMode": "adl"
        },
        {
          "type": "fallthrough",
          "target": "0x001380",
          "targetMode": "adl"
        }
      ]
    },
    "0x00138A": {
      "pc": "0x00138A",
      "mode": "adl",
      "first": "ld a, 0x26",
      "last": "jr nz, 0x00139c",
      "instructions": [
        "ld a, 0x26",
        "out0 (0x05), a",
        "cp 0x26",
        "jr nz, 0x00139c"
      ],
      "exits": [
        {
          "type": "branch",
          "target": "0x00139C",
          "targetMode": "adl"
        },
        {
          "type": "fallthrough",
          "target": "0x001393",
          "targetMode": "adl"
        }
      ]
    },
    "0x001393": {
      "pc": "0x001393",
      "mode": "adl",
      "first": "ld a, 0x03",
      "last": "jr z, 0x00139d",
      "instructions": [
        "ld a, 0x03",
        "out0 (0x06), a",
        "cp 0x03",
        "jr z, 0x00139d"
      ],
      "exits": [
        {
          "type": "branch",
          "target": "0x00139D",
          "targetMode": "adl"
        },
        {
          "type": "fallthrough",
          "target": "0x00139C",
          "targetMode": "adl"
        }
      ]
    },
    "0x00139D": {
      "pc": "0x00139D",
      "mode": "adl",
      "first": "ld bc, 0x00a000",
      "last": "jr nz, 0x00139c",
      "instructions": [
        "ld bc, 0x00a000",
        "xor a",
        "out (c), a",
        "inc c",
        "ld a, 0x0f",
        "out (c), a",
        "inc c",
        "xor a",
        "out (c), a",
        "inc c",
        "ld a, 0x0f",
        "out (c), a",
        "inc c",
        "ld a, 0x08",
        "out (c), a",
        "inc c"
      ],
      "exits": [
        {
          "type": "branch",
          "target": "0x00139C",
          "targetMode": "adl"
        },
        {
          "type": "fallthrough",
          "target": "0x0013C3",
          "targetMode": "adl"
        }
      ]
    },
    "0x0013C3": {
      "pc": "0x0013C3",
      "mode": "adl",
      "first": "call 0x001988",
      "last": "call 0x001988",
      "instructions": [
        "call 0x001988"
      ],
      "exits": [
        {
          "type": "call",
          "target": "0x001988",
          "targetMode": "adl"
        },
        {
          "type": "call-return",
          "target": "0x0013C7",
          "targetMode": "adl"
        }
      ]
    },
    "0x001988": {
      "pc": "0x001988",
      "mode": "adl",
      "first": "di",
      "last": "jr nz, 0x0019a9",
      "instructions": [
        "di",
        "push bc",
        "in0 a, (0x03)",
        "bit 4, a",
        "jr nz, 0x0019a9"
      ],
      "exits": [
        {
          "type": "branch",
          "target": "0x0019A9",
          "targetMode": "adl"
        },
        {
          "type": "fallthrough",
          "target": "0x001991",
          "targetMode": "adl"
        }
      ]
    },
    "0x001991": {
      "pc": "0x001991",
      "mode": "adl",
      "first": "ld bc, 0x001005",
      "last": "jr z, 0x00199e",
      "instructions": [
        "ld bc, 0x001005",
        "ld a, 0x04",
        "out (c), a",
        "cp 0x04",
        "jr z, 0x00199e"
      ],
      "exits": [
        {
          "type": "branch",
          "target": "0x00199E",
          "targetMode": "adl"
        },
        {
          "type": "fallthrough",
          "target": "0x00199D",
          "targetMode": "adl"
        }
      ]
    },
    "0x00199E": {
      "pc": "0x00199E",
      "mode": "adl",
      "first": "ld a, b",
      "last": "jr z, 0x0019a4",
      "instructions": [
        "ld a, b",
        "cp 0x10",
        "jr z, 0x0019a4"
      ],
      "exits": [
        {
          "type": "branch",
          "target": "0x0019A4",
          "targetMode": "adl"
        },
        {
          "type": "fallthrough",
          "target": "0x0019A3",
          "targetMode": "adl"
        }
      ]
    },
    "0x0019A4": {
      "pc": "0x0019A4",
      "mode": "adl",
      "first": "ld a, c",
      "last": "jr nz, 0x0019a3",
      "instructions": [
        "ld a, c",
        "cp 0x05",
        "jr nz, 0x0019a3"
      ],
      "exits": [
        {
          "type": "branch",
          "target": "0x0019A3",
          "targetMode": "adl"
        },
        {
          "type": "fallthrough",
          "target": "0x0019A9",
          "targetMode": "adl"
        }
      ]
    },
    "0x0019A9": {
      "pc": "0x0019A9",
      "mode": "adl",
      "first": "ld a, 0x03",
      "last": "jr z, 0x0019b3",
      "instructions": [
        "ld a, 0x03",
        "out0 (0x01), a",
        "cp 0x03",
        "jr z, 0x0019b3"
      ],
      "exits": [
        {
          "type": "branch",
          "target": "0x0019B3",
          "targetMode": "adl"
        },
        {
          "type": "fallthrough",
          "target": "0x0019B2",
          "targetMode": "adl"
        }
      ]
    },
    "0x0019B3": {
      "pc": "0x0019B3",
      "mode": "adl",
      "first": "pop bc",
      "last": "ret",
      "instructions": [
        "pop bc",
        "ret"
      ],
      "exits": [
        {
          "type": "return",
          "target": null,
          "targetMode": null
        }
      ]
    },
    "0x0013C7": {
      "pc": "0x0013C7",
      "mode": "adl",
      "first": "ld a, 0xd0",
      "last": "call 0x0158de",
      "instructions": [
        "ld a, 0xd0",
        "??? tag=ld-mb-a",
        "im 1",
        "ld iy, 0xd00080",
        "res 6, (iy+27)",
        "call 0x0158de"
      ],
      "exits": [
        {
          "type": "call",
          "target": "0x0158DE",
          "targetMode": "adl"
        },
        {
          "type": "call-return",
          "target": "0x0013DA",
          "targetMode": "adl"
        }
      ]
    },
    "0x0158DE": {
      "pc": "0x0158DE",
      "mode": "adl",
      "first": "ld iy, 0xd00080",
      "last": "ret nz",
      "instructions": [
        "ld iy, 0xd00080",
        "bit 7, (iy+66)",
        "ret nz"
      ],
      "exits": [
        {
          "type": "return-conditional",
          "target": null,
          "targetMode": null
        },
        {
          "type": "fallthrough",
          "target": "0x0158E8",
          "targetMode": "adl"
        }
      ]
    },
    "0x0158E8": {
      "pc": "0x0158E8",
      "mode": "adl",
      "first": "call 0x0158bc",
      "last": "call 0x0158bc",
      "instructions": [
        "call 0x0158bc"
      ],
      "exits": [
        {
          "type": "call",
          "target": "0x0158BC",
          "targetMode": "adl"
        },
        {
          "type": "call-return",
          "target": "0x0158EC",
          "targetMode": "adl"
        }
      ]
    },
    "0x0158BC": {
      "pc": "0x0158BC",
      "mode": "adl",
      "first": "ld de, 0x000330",
      "last": "call 0x001c55",
      "instructions": [
        "ld de, 0x000330",
        "call 0x001c55"
      ],
      "exits": [
        {
          "type": "call",
          "target": "0x001C55",
          "targetMode": "adl"
        },
        {
          "type": "call-return",
          "target": "0x0158C4",
          "targetMode": "adl"
        }
      ]
    }
  },
  "returnMetas": {
    "0x0158EC": {
      "pc": "0x0158EC",
      "mode": "adl",
      "first": "jr c, 0x0158f8",
      "last": "jr c, 0x0158f8",
      "instructions": [
        "jr c, 0x0158f8"
      ],
      "exits": [
        {
          "type": "branch",
          "target": "0x0158F8",
          "targetMode": "adl"
        },
        {
          "type": "fallthrough",
          "target": "0x0158EE",
          "targetMode": "adl"
        }
      ]
    },
    "0x0013DA": {
      "pc": "0x0013DA",
      "mode": "adl",
      "first": "jr z, 0x0013e4",
      "last": "jr z, 0x0013e4",
      "instructions": [
        "jr z, 0x0013e4"
      ],
      "exits": [
        {
          "type": "branch",
          "target": "0x0013E4",
          "targetMode": "adl"
        },
        {
          "type": "fallthrough",
          "target": "0x0013DC",
          "targetMode": "adl"
        }
      ]
    },
    "0x000000": {
      "pc": "0x000000",
      "mode": "adl",
      "first": "di",
      "last": "jp 0x000658",
      "instructions": [
        "di",
        "stmix",
        "jp 0x000658"
      ],
      "exits": [
        {
          "type": "jump",
          "target": "0x000658",
          "targetMode": "adl"
        }
      ]
    }
  }
}
```

## Interpretation

- The probe stops at the first `0x0158BC` owner hit after the successful insert, before entering `0x001879` or `0x0018F8`.
- `0x001377` is a pure B-countdown gate. In the primary insert run this captured window starts at `BC=0x005224`, decrements through `BC=0x000124`, then falls through to `0x001379` with `BC=0x000024`.
- The port-3 read at `0x001379` produces `A=0xEE` / `F=0x54` at `0x00138A`, but no variant branches away there; all variants continue through `0x00139D` into `0x0013C3` with `A=0x08`, `BC=0x00A005`, `HL=0x000000`.
- `0x001988` is a stack-preserving port helper: it pushes the caller BC, temporarily forces `BC=0x001005`, runs the `B`/`C`/port-select sequence, then `0x0019A9` sets `A=0x03`, `CP 0x03` makes Z true, and `0x0019B3` pops the saved `BC=0x00A005` and RETs dynamically to `0x0013C7`.
- `0x0013C7` restores low-memory execution context (`MB=0xD0`, `IY=0xD00080`, `RES 6,(IY+27)` / `D0009B`) and calls `0x0158DE`. At `0x0158DE`, `D000C2` is `0x00`, so bit 7 is clear and the `RET NZ` is not taken; this is the final branch/state that routes into `0x0158E8 -> 0x0158BC`.
- Releasing the matrix, clearing pending key RAM, and the no-pending/no-matrix control all follow the same wrapper route and have `D000C2` bit 7 clear at `0x0158DE`. The selector is therefore not held-key RAM state; it is the low-ROM wrapper path plus the clear `D000C2` gate.

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
      "0xFFFFFF",
      "0xFFFFFF",
      "0xFFFFFF"
    ],
    "errSp": "0x000000",
    "D00587": "0x1A",
    "D0058C": "0x90",
    "D0058D": "0x90",
    "D0058E": "0x90",
    "D00080": "0x08",
    "D0009B": "0x00",
    "D0009F": "0x20",
    "D000A3": "0x0A",
    "D000C2": "0x00",
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
    "matrix3": "0xFF"
  },
  "results": [
    {
      "name": "release-matrix-at-deposit-stop-owner",
      "termination": "first_0158bc_owner",
      "steps": 6309,
      "depositBlock": 2601,
      "releaseBlock": 2601,
      "clearRamBlock": null,
      "firstOwnerHit": {
        "block": 6295,
        "delta": 3694,
        "steps": 6309,
        "state": {
          "pc": "0x0158BC",
          "a": "0xD0",
          "f": "0x54",
          "bc": "0x00A005",
          "de": "0xD1A7FC",
          "hl": "0x000000",
          "ix": "0x000000",
          "iy": "0xD00080",
          "sp": "0xD1A878",
          "stack24": [
            "0x0158EC",
            "0x0013DA",
            "0x000000",
            "0x000000",
            "0x000000",
            "0x000000"
          ],
          "errSp": "0xD1A863",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x1A",
          "D0058E": "0x00",
          "D00080": "0x18",
          "D0009B": "0x00",
          "D0009F": "0x00",
          "D000A3": "0x0A",
          "D000C2": "0x00",
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
          "matrix3": "0xFF"
        },
        "returnHints": [
          {
            "ret": "0x0158EC",
            "hint": "return to 0x0158EC carry gate after 0x0158BC"
          },
          {
            "ret": "0x0013DA",
            "hint": "return to low-ROM wrapper A after owner scan"
          },
          {
            "ret": "0x000000",
            "hint": ""
          },
          {
            "ret": "0x000000",
            "hint": ""
          },
          {
            "ret": "0x000000",
            "hint": ""
          },
          {
            "ret": "0x000000",
            "hint": ""
          }
        ],
        "priorRouteTail": [
          {
            "block": 6247,
            "delta": 3646,
            "steps": 6261,
            "pc": "0x001377",
            "label": "countdownLoop",
            "state": {
              "pc": "0x001377",
              "a": "0x76",
              "f": "0x42",
              "bc": "0x002224",
              "de": "0xD1A7FC",
              "hl": "0xD18C7C",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A87E",
              "stack24": [
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x008000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x1A",
              "D0058E": "0x00",
              "D00080": "0x18",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
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
              "matrix3": "0xFF"
            },
            "meta": {
              "pc": "0x001377",
              "mode": "adl",
              "first": "djnz 0x001377",
              "last": "djnz 0x001377",
              "instructions": [
                "djnz 0x001377"
              ],
              "exits": [
                {
                  "type": "branch",
                  "target": "0x001377",
                  "targetMode": "adl"
                },
                {
                  "type": "fallthrough",
                  "target": "0x001379",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 6248,
            "delta": 3647,
            "steps": 6262,
            "pc": "0x001377",
            "label": "countdownLoop",
            "state": {
              "pc": "0x001377",
              "a": "0x76",
              "f": "0x42",
              "bc": "0x002124",
              "de": "0xD1A7FC",
              "hl": "0xD18C7C",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A87E",
              "stack24": [
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x008000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x1A",
              "D0058E": "0x00",
              "D00080": "0x18",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
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
              "matrix3": "0xFF"
            },
            "meta": {
              "pc": "0x001377",
              "mode": "adl",
              "first": "djnz 0x001377",
              "last": "djnz 0x001377",
              "instructions": [
                "djnz 0x001377"
              ],
              "exits": [
                {
                  "type": "branch",
                  "target": "0x001377",
                  "targetMode": "adl"
                },
                {
                  "type": "fallthrough",
                  "target": "0x001379",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 6249,
            "delta": 3648,
            "steps": 6263,
            "pc": "0x001377",
            "label": "countdownLoop",
            "state": {
              "pc": "0x001377",
              "a": "0x76",
              "f": "0x42",
              "bc": "0x002024",
              "de": "0xD1A7FC",
              "hl": "0xD18C7C",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A87E",
              "stack24": [
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x008000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x1A",
              "D0058E": "0x00",
              "D00080": "0x18",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
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
              "matrix3": "0xFF"
            },
            "meta": {
              "pc": "0x001377",
              "mode": "adl",
              "first": "djnz 0x001377",
              "last": "djnz 0x001377",
              "instructions": [
                "djnz 0x001377"
              ],
              "exits": [
                {
                  "type": "branch",
                  "target": "0x001377",
                  "targetMode": "adl"
                },
                {
                  "type": "fallthrough",
                  "target": "0x001379",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 6250,
            "delta": 3649,
            "steps": 6264,
            "pc": "0x001377",
            "label": "countdownLoop",
            "state": {
              "pc": "0x001377",
              "a": "0x76",
              "f": "0x42",
              "bc": "0x001F24",
              "de": "0xD1A7FC",
              "hl": "0xD18C7C",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A87E",
              "stack24": [
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x008000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x1A",
              "D0058E": "0x00",
              "D00080": "0x18",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
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
              "matrix3": "0xFF"
            },
            "meta": {
              "pc": "0x001377",
              "mode": "adl",
              "first": "djnz 0x001377",
              "last": "djnz 0x001377",
              "instructions": [
                "djnz 0x001377"
              ],
              "exits": [
                {
                  "type": "branch",
                  "target": "0x001377",
                  "targetMode": "adl"
                },
                {
                  "type": "fallthrough",
                  "target": "0x001379",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 6251,
            "delta": 3650,
            "steps": 6265,
            "pc": "0x001377",
            "label": "countdownLoop",
            "state": {
              "pc": "0x001377",
              "a": "0x76",
              "f": "0x42",
              "bc": "0x001E24",
              "de": "0xD1A7FC",
              "hl": "0xD18C7C",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A87E",
              "stack24": [
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x008000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x1A",
              "D0058E": "0x00",
              "D00080": "0x18",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
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
              "matrix3": "0xFF"
            },
            "meta": {
              "pc": "0x001377",
              "mode": "adl",
              "first": "djnz 0x001377",
              "last": "djnz 0x001377",
              "instructions": [
                "djnz 0x001377"
              ],
              "exits": [
                {
                  "type": "branch",
                  "target": "0x001377",
                  "targetMode": "adl"
                },
                {
                  "type": "fallthrough",
                  "target": "0x001379",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 6252,
            "delta": 3651,
            "steps": 6266,
            "pc": "0x001377",
            "label": "countdownLoop",
            "state": {
              "pc": "0x001377",
              "a": "0x76",
              "f": "0x42",
              "bc": "0x001D24",
              "de": "0xD1A7FC",
              "hl": "0xD18C7C",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A87E",
              "stack24": [
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x008000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x1A",
              "D0058E": "0x00",
              "D00080": "0x18",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
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
              "matrix3": "0xFF"
            },
            "meta": {
              "pc": "0x001377",
              "mode": "adl",
              "first": "djnz 0x001377",
              "last": "djnz 0x001377",
              "instructions": [
                "djnz 0x001377"
              ],
              "exits": [
                {
                  "type": "branch",
                  "target": "0x001377",
                  "targetMode": "adl"
                },
                {
                  "type": "fallthrough",
                  "target": "0x001379",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 6253,
            "delta": 3652,
            "steps": 6267,
            "pc": "0x001377",
            "label": "countdownLoop",
            "state": {
              "pc": "0x001377",
              "a": "0x76",
              "f": "0x42",
              "bc": "0x001C24",
              "de": "0xD1A7FC",
              "hl": "0xD18C7C",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A87E",
              "stack24": [
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x008000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x1A",
              "D0058E": "0x00",
              "D00080": "0x18",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
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
              "matrix3": "0xFF"
            },
            "meta": {
              "pc": "0x001377",
              "mode": "adl",
              "first": "djnz 0x001377",
              "last": "djnz 0x001377",
              "instructions": [
                "djnz 0x001377"
              ],
              "exits": [
                {
                  "type": "branch",
                  "target": "0x001377",
                  "targetMode": "adl"
                },
                {
                  "type": "fallthrough",
                  "target": "0x001379",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 6254,
            "delta": 3653,
            "steps": 6268,
            "pc": "0x001377",
            "label": "countdownLoop",
            "state": {
              "pc": "0x001377",
              "a": "0x76",
              "f": "0x42",
              "bc": "0x001B24",
              "de": "0xD1A7FC",
              "hl": "0xD18C7C",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A87E",
              "stack24": [
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x008000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x1A",
              "D0058E": "0x00",
              "D00080": "0x18",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
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
              "matrix3": "0xFF"
            },
            "meta": {
              "pc": "0x001377",
              "mode": "adl",
              "first": "djnz 0x001377",
              "last": "djnz 0x001377",
              "instructions": [
                "djnz 0x001377"
              ],
              "exits": [
                {
                  "type": "branch",
                  "target": "0x001377",
                  "targetMode": "adl"
                },
                {
                  "type": "fallthrough",
                  "target": "0x001379",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 6255,
            "delta": 3654,
            "steps": 6269,
            "pc": "0x001377",
            "label": "countdownLoop",
            "state": {
              "pc": "0x001377",
              "a": "0x76",
              "f": "0x42",
              "bc": "0x001A24",
              "de": "0xD1A7FC",
              "hl": "0xD18C7C",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A87E",
              "stack24": [
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x008000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x1A",
              "D0058E": "0x00",
              "D00080": "0x18",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
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
              "matrix3": "0xFF"
            },
            "meta": {
              "pc": "0x001377",
              "mode": "adl",
              "first": "djnz 0x001377",
              "last": "djnz 0x001377",
              "instructions": [
                "djnz 0x001377"
              ],
              "exits": [
                {
                  "type": "branch",
                  "target": "0x001377",
                  "targetMode": "adl"
                },
                {
                  "type": "fallthrough",
                  "target": "0x001379",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 6256,
            "delta": 3655,
            "steps": 6270,
            "pc": "0x001377",
            "label": "countdownLoop",
            "state": {
              "pc": "0x001377",
              "a": "0x76",
              "f": "0x42",
              "bc": "0x001924",
              "de": "0xD1A7FC",
              "hl": "0xD18C7C",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A87E",
              "stack24": [
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x008000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x1A",
              "D0058E": "0x00",
              "D00080": "0x18",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
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
              "matrix3": "0xFF"
            },
            "meta": {
              "pc": "0x001377",
              "mode": "adl",
              "first": "djnz 0x001377",
              "last": "djnz 0x001377",
              "instructions": [
                "djnz 0x001377"
              ],
              "exits": [
                {
                  "type": "branch",
                  "target": "0x001377",
                  "targetMode": "adl"
                },
                {
                  "type": "fallthrough",
                  "target": "0x001379",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 6257,
            "delta": 3656,
            "steps": 6271,
            "pc": "0x001377",
            "label": "countdownLoop",
            "state": {
              "pc": "0x001377",
              "a": "0x76",
              "f": "0x42",
              "bc": "0x001824",
              "de": "0xD1A7FC",
              "hl": "0xD18C7C",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A87E",
              "stack24": [
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x008000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x1A",
              "D0058E": "0x00",
              "D00080": "0x18",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
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
              "matrix3": "0xFF"
            },
            "meta": {
              "pc": "0x001377",
              "mode": "adl",
              "first": "djnz 0x001377",
              "last": "djnz 0x001377",
              "instructions": [
                "djnz 0x001377"
              ],
              "exits": [
                {
                  "type": "branch",
                  "target": "0x001377",
                  "targetMode": "adl"
                },
                {
                  "type": "fallthrough",
                  "target": "0x001379",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 6258,
            "delta": 3657,
            "steps": 6272,
            "pc": "0x001377",
            "label": "countdownLoop",
            "state": {
              "pc": "0x001377",
              "a": "0x76",
              "f": "0x42",
              "bc": "0x001724",
              "de": "0xD1A7FC",
              "hl": "0xD18C7C",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A87E",
              "stack24": [
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x008000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x1A",
              "D0058E": "0x00",
              "D00080": "0x18",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
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
              "matrix3": "0xFF"
            },
            "meta": {
              "pc": "0x001377",
              "mode": "adl",
              "first": "djnz 0x001377",
              "last": "djnz 0x001377",
              "instructions": [
                "djnz 0x001377"
              ],
              "exits": [
                {
                  "type": "branch",
                  "target": "0x001377",
                  "targetMode": "adl"
                },
                {
                  "type": "fallthrough",
                  "target": "0x001379",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 6259,
            "delta": 3658,
            "steps": 6273,
            "pc": "0x001377",
            "label": "countdownLoop",
            "state": {
              "pc": "0x001377",
              "a": "0x76",
              "f": "0x42",
              "bc": "0x001624",
              "de": "0xD1A7FC",
              "hl": "0xD18C7C",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A87E",
              "stack24": [
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x008000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x1A",
              "D0058E": "0x00",
              "D00080": "0x18",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
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
              "matrix3": "0xFF"
            },
            "meta": {
              "pc": "0x001377",
              "mode": "adl",
              "first": "djnz 0x001377",
              "last": "djnz 0x001377",
              "instructions": [
                "djnz 0x001377"
              ],
              "exits": [
                {
                  "type": "branch",
                  "target": "0x001377",
                  "targetMode": "adl"
                },
                {
                  "type": "fallthrough",
                  "target": "0x001379",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 6260,
            "delta": 3659,
            "steps": 6274,
            "pc": "0x001377",
            "label": "countdownLoop",
            "state": {
              "pc": "0x001377",
              "a": "0x76",
              "f": "0x42",
              "bc": "0x001524",
              "de": "0xD1A7FC",
              "hl": "0xD18C7C",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A87E",
              "stack24": [
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x008000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x1A",
              "D0058E": "0x00",
              "D00080": "0x18",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
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
              "matrix3": "0xFF"
            },
            "meta": {
              "pc": "0x001377",
              "mode": "adl",
              "first": "djnz 0x001377",
              "last": "djnz 0x001377",
              "instructions": [
                "djnz 0x001377"
              ],
              "exits": [
                {
                  "type": "branch",
                  "target": "0x001377",
                  "targetMode": "adl"
                },
                {
                  "type": "fallthrough",
                  "target": "0x001379",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 6261,
            "delta": 3660,
            "steps": 6275,
            "pc": "0x001377",
            "label": "countdownLoop",
            "state": {
              "pc": "0x001377",
              "a": "0x76",
              "f": "0x42",
              "bc": "0x001424",
              "de": "0xD1A7FC",
              "hl": "0xD18C7C",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A87E",
              "stack24": [
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x008000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x1A",
              "D0058E": "0x00",
              "D00080": "0x18",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
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
              "matrix3": "0xFF"
            },
            "meta": {
              "pc": "0x001377",
              "mode": "adl",
              "first": "djnz 0x001377",
              "last": "djnz 0x001377",
              "instructions": [
                "djnz 0x001377"
              ],
              "exits": [
                {
                  "type": "branch",
                  "target": "0x001377",
                  "targetMode": "adl"
                },
                {
                  "type": "fallthrough",
                  "target": "0x001379",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 6262,
            "delta": 3661,
            "steps": 6276,
            "pc": "0x001377",
            "label": "countdownLoop",
            "state": {
              "pc": "0x001377",
              "a": "0x76",
              "f": "0x42",
              "bc": "0x001324",
              "de": "0xD1A7FC",
              "hl": "0xD18C7C",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A87E",
              "stack24": [
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x008000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x1A",
              "D0058E": "0x00",
              "D00080": "0x18",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
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
              "matrix3": "0xFF"
            },
            "meta": {
              "pc": "0x001377",
              "mode": "adl",
              "first": "djnz 0x001377",
              "last": "djnz 0x001377",
              "instructions": [
                "djnz 0x001377"
              ],
              "exits": [
                {
                  "type": "branch",
                  "target": "0x001377",
                  "targetMode": "adl"
                },
                {
                  "type": "fallthrough",
                  "target": "0x001379",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 6263,
            "delta": 3662,
            "steps": 6277,
            "pc": "0x001377",
            "label": "countdownLoop",
            "state": {
              "pc": "0x001377",
              "a": "0x76",
              "f": "0x42",
              "bc": "0x001224",
              "de": "0xD1A7FC",
              "hl": "0xD18C7C",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A87E",
              "stack24": [
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x008000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x1A",
              "D0058E": "0x00",
              "D00080": "0x18",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
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
              "matrix3": "0xFF"
            },
            "meta": {
              "pc": "0x001377",
              "mode": "adl",
              "first": "djnz 0x001377",
              "last": "djnz 0x001377",
              "instructions": [
                "djnz 0x001377"
              ],
              "exits": [
                {
                  "type": "branch",
                  "target": "0x001377",
                  "targetMode": "adl"
                },
                {
                  "type": "fallthrough",
                  "target": "0x001379",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 6264,
            "delta": 3663,
            "steps": 6278,
            "pc": "0x001377",
            "label": "countdownLoop",
            "state": {
              "pc": "0x001377",
              "a": "0x76",
              "f": "0x42",
              "bc": "0x001124",
              "de": "0xD1A7FC",
              "hl": "0xD18C7C",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A87E",
              "stack24": [
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x008000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x1A",
              "D0058E": "0x00",
              "D00080": "0x18",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
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
              "matrix3": "0xFF"
            },
            "meta": {
              "pc": "0x001377",
              "mode": "adl",
              "first": "djnz 0x001377",
              "last": "djnz 0x001377",
              "instructions": [
                "djnz 0x001377"
              ],
              "exits": [
                {
                  "type": "branch",
                  "target": "0x001377",
                  "targetMode": "adl"
                },
                {
                  "type": "fallthrough",
                  "target": "0x001379",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 6265,
            "delta": 3664,
            "steps": 6279,
            "pc": "0x001377",
            "label": "countdownLoop",
            "state": {
              "pc": "0x001377",
              "a": "0x76",
              "f": "0x42",
              "bc": "0x001024",
              "de": "0xD1A7FC",
              "hl": "0xD18C7C",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A87E",
              "stack24": [
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x008000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x1A",
              "D0058E": "0x00",
              "D00080": "0x18",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
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
              "matrix3": "0xFF"
            },
            "meta": {
              "pc": "0x001377",
              "mode": "adl",
              "first": "djnz 0x001377",
              "last": "djnz 0x001377",
              "instructions": [
                "djnz 0x001377"
              ],
              "exits": [
                {
                  "type": "branch",
                  "target": "0x001377",
                  "targetMode": "adl"
                },
                {
                  "type": "fallthrough",
                  "target": "0x001379",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 6266,
            "delta": 3665,
            "steps": 6280,
            "pc": "0x001377",
            "label": "countdownLoop",
            "state": {
              "pc": "0x001377",
              "a": "0x76",
              "f": "0x42",
              "bc": "0x000F24",
              "de": "0xD1A7FC",
              "hl": "0xD18C7C",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A87E",
              "stack24": [
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x008000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x1A",
              "D0058E": "0x00",
              "D00080": "0x18",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
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
              "matrix3": "0xFF"
            },
            "meta": {
              "pc": "0x001377",
              "mode": "adl",
              "first": "djnz 0x001377",
              "last": "djnz 0x001377",
              "instructions": [
                "djnz 0x001377"
              ],
              "exits": [
                {
                  "type": "branch",
                  "target": "0x001377",
                  "targetMode": "adl"
                },
                {
                  "type": "fallthrough",
                  "target": "0x001379",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 6267,
            "delta": 3666,
            "steps": 6281,
            "pc": "0x001377",
            "label": "countdownLoop",
            "state": {
              "pc": "0x001377",
              "a": "0x76",
              "f": "0x42",
              "bc": "0x000E24",
              "de": "0xD1A7FC",
              "hl": "0xD18C7C",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A87E",
              "stack24": [
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x008000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x1A",
              "D0058E": "0x00",
              "D00080": "0x18",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
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
              "matrix3": "0xFF"
            },
            "meta": {
              "pc": "0x001377",
              "mode": "adl",
              "first": "djnz 0x001377",
              "last": "djnz 0x001377",
              "instructions": [
                "djnz 0x001377"
              ],
              "exits": [
                {
                  "type": "branch",
                  "target": "0x001377",
                  "targetMode": "adl"
                },
                {
                  "type": "fallthrough",
                  "target": "0x001379",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 6268,
            "delta": 3667,
            "steps": 6282,
            "pc": "0x001377",
            "label": "countdownLoop",
            "state": {
              "pc": "0x001377",
              "a": "0x76",
              "f": "0x42",
              "bc": "0x000D24",
              "de": "0xD1A7FC",
              "hl": "0xD18C7C",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A87E",
              "stack24": [
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x008000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x1A",
              "D0058E": "0x00",
              "D00080": "0x18",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
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
              "matrix3": "0xFF"
            },
            "meta": {
              "pc": "0x001377",
              "mode": "adl",
              "first": "djnz 0x001377",
              "last": "djnz 0x001377",
              "instructions": [
                "djnz 0x001377"
              ],
              "exits": [
                {
                  "type": "branch",
                  "target": "0x001377",
                  "targetMode": "adl"
                },
                {
                  "type": "fallthrough",
                  "target": "0x001379",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 6269,
            "delta": 3668,
            "steps": 6283,
            "pc": "0x001377",
            "label": "countdownLoop",
            "state": {
              "pc": "0x001377",
              "a": "0x76",
              "f": "0x42",
              "bc": "0x000C24",
              "de": "0xD1A7FC",
              "hl": "0xD18C7C",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A87E",
              "stack24": [
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x008000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x1A",
              "D0058E": "0x00",
              "D00080": "0x18",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
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
              "matrix3": "0xFF"
            },
            "meta": {
              "pc": "0x001377",
              "mode": "adl",
              "first": "djnz 0x001377",
              "last": "djnz 0x001377",
              "instructions": [
                "djnz 0x001377"
              ],
              "exits": [
                {
                  "type": "branch",
                  "target": "0x001377",
                  "targetMode": "adl"
                },
                {
                  "type": "fallthrough",
                  "target": "0x001379",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 6270,
            "delta": 3669,
            "steps": 6284,
            "pc": "0x001377",
            "label": "countdownLoop",
            "state": {
              "pc": "0x001377",
              "a": "0x76",
              "f": "0x42",
              "bc": "0x000B24",
              "de": "0xD1A7FC",
              "hl": "0xD18C7C",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A87E",
              "stack24": [
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x008000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x1A",
              "D0058E": "0x00",
              "D00080": "0x18",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
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
              "matrix3": "0xFF"
            },
            "meta": {
              "pc": "0x001377",
              "mode": "adl",
              "first": "djnz 0x001377",
              "last": "djnz 0x001377",
              "instructions": [
                "djnz 0x001377"
              ],
              "exits": [
                {
                  "type": "branch",
                  "target": "0x001377",
                  "targetMode": "adl"
                },
                {
                  "type": "fallthrough",
                  "target": "0x001379",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 6271,
            "delta": 3670,
            "steps": 6285,
            "pc": "0x001377",
            "label": "countdownLoop",
            "state": {
              "pc": "0x001377",
              "a": "0x76",
              "f": "0x42",
              "bc": "0x000A24",
              "de": "0xD1A7FC",
              "hl": "0xD18C7C",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A87E",
              "stack24": [
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x008000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x1A",
              "D0058E": "0x00",
              "D00080": "0x18",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
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
              "matrix3": "0xFF"
            },
            "meta": {
              "pc": "0x001377",
              "mode": "adl",
              "first": "djnz 0x001377",
              "last": "djnz 0x001377",
              "instructions": [
                "djnz 0x001377"
              ],
              "exits": [
                {
                  "type": "branch",
                  "target": "0x001377",
                  "targetMode": "adl"
                },
                {
                  "type": "fallthrough",
                  "target": "0x001379",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 6272,
            "delta": 3671,
            "steps": 6286,
            "pc": "0x001377",
            "label": "countdownLoop",
            "state": {
              "pc": "0x001377",
              "a": "0x76",
              "f": "0x42",
              "bc": "0x000924",
              "de": "0xD1A7FC",
              "hl": "0xD18C7C",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A87E",
              "stack24": [
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x008000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x1A",
              "D0058E": "0x00",
              "D00080": "0x18",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
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
              "matrix3": "0xFF"
            },
            "meta": {
              "pc": "0x001377",
              "mode": "adl",
              "first": "djnz 0x001377",
              "last": "djnz 0x001377",
              "instructions": [
                "djnz 0x001377"
              ],
              "exits": [
                {
                  "type": "branch",
                  "target": "0x001377",
                  "targetMode": "adl"
                },
                {
                  "type": "fallthrough",
                  "target": "0x001379",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 6273,
            "delta": 3672,
            "steps": 6287,
            "pc": "0x001377",
            "label": "countdownLoop",
            "state": {
              "pc": "0x001377",
              "a": "0x76",
              "f": "0x42",
              "bc": "0x000824",
              "de": "0xD1A7FC",
              "hl": "0xD18C7C",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A87E",
              "stack24": [
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x008000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x1A",
              "D0058E": "0x00",
              "D00080": "0x18",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
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
              "matrix3": "0xFF"
            },
            "meta": {
              "pc": "0x001377",
              "mode": "adl",
              "first": "djnz 0x001377",
              "last": "djnz 0x001377",
              "instructions": [
                "djnz 0x001377"
              ],
              "exits": [
                {
                  "type": "branch",
                  "target": "0x001377",
                  "targetMode": "adl"
                },
                {
                  "type": "fallthrough",
                  "target": "0x001379",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 6274,
            "delta": 3673,
            "steps": 6288,
            "pc": "0x001377",
            "label": "countdownLoop",
            "state": {
              "pc": "0x001377",
              "a": "0x76",
              "f": "0x42",
              "bc": "0x000724",
              "de": "0xD1A7FC",
              "hl": "0xD18C7C",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A87E",
              "stack24": [
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x008000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x1A",
              "D0058E": "0x00",
              "D00080": "0x18",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
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
              "matrix3": "0xFF"
            },
            "meta": {
              "pc": "0x001377",
              "mode": "adl",
              "first": "djnz 0x001377",
              "last": "djnz 0x001377",
              "instructions": [
                "djnz 0x001377"
              ],
              "exits": [
                {
                  "type": "branch",
                  "target": "0x001377",
                  "targetMode": "adl"
                },
                {
                  "type": "fallthrough",
                  "target": "0x001379",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 6275,
            "delta": 3674,
            "steps": 6289,
            "pc": "0x001377",
            "label": "countdownLoop",
            "state": {
              "pc": "0x001377",
              "a": "0x76",
              "f": "0x42",
              "bc": "0x000624",
              "de": "0xD1A7FC",
              "hl": "0xD18C7C",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A87E",
              "stack24": [
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x008000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x1A",
              "D0058E": "0x00",
              "D00080": "0x18",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
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
              "matrix3": "0xFF"
            },
            "meta": {
              "pc": "0x001377",
              "mode": "adl",
              "first": "djnz 0x001377",
              "last": "djnz 0x001377",
              "instructions": [
                "djnz 0x001377"
              ],
              "exits": [
                {
                  "type": "branch",
                  "target": "0x001377",
                  "targetMode": "adl"
                },
                {
                  "type": "fallthrough",
                  "target": "0x001379",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 6276,
            "delta": 3675,
            "steps": 6290,
            "pc": "0x001377",
            "label": "countdownLoop",
            "state": {
              "pc": "0x001377",
              "a": "0x76",
              "f": "0x42",
              "bc": "0x000524",
              "de": "0xD1A7FC",
              "hl": "0xD18C7C",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A87E",
              "stack24": [
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x008000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x1A",
              "D0058E": "0x00",
              "D00080": "0x18",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
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
              "matrix3": "0xFF"
            },
            "meta": {
              "pc": "0x001377",
              "mode": "adl",
              "first": "djnz 0x001377",
              "last": "djnz 0x001377",
              "instructions": [
                "djnz 0x001377"
              ],
              "exits": [
                {
                  "type": "branch",
                  "target": "0x001377",
                  "targetMode": "adl"
                },
                {
                  "type": "fallthrough",
                  "target": "0x001379",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 6277,
            "delta": 3676,
            "steps": 6291,
            "pc": "0x001377",
            "label": "countdownLoop",
            "state": {
              "pc": "0x001377",
              "a": "0x76",
              "f": "0x42",
              "bc": "0x000424",
              "de": "0xD1A7FC",
              "hl": "0xD18C7C",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A87E",
              "stack24": [
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x008000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x1A",
              "D0058E": "0x00",
              "D00080": "0x18",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
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
              "matrix3": "0xFF"
            },
            "meta": {
              "pc": "0x001377",
              "mode": "adl",
              "first": "djnz 0x001377",
              "last": "djnz 0x001377",
              "instructions": [
                "djnz 0x001377"
              ],
              "exits": [
                {
                  "type": "branch",
                  "target": "0x001377",
                  "targetMode": "adl"
                },
                {
                  "type": "fallthrough",
                  "target": "0x001379",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 6278,
            "delta": 3677,
            "steps": 6292,
            "pc": "0x001377",
            "label": "countdownLoop",
            "state": {
              "pc": "0x001377",
              "a": "0x76",
              "f": "0x42",
              "bc": "0x000324",
              "de": "0xD1A7FC",
              "hl": "0xD18C7C",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A87E",
              "stack24": [
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x008000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x1A",
              "D0058E": "0x00",
              "D00080": "0x18",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
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
              "matrix3": "0xFF"
            },
            "meta": {
              "pc": "0x001377",
              "mode": "adl",
              "first": "djnz 0x001377",
              "last": "djnz 0x001377",
              "instructions": [
                "djnz 0x001377"
              ],
              "exits": [
                {
                  "type": "branch",
                  "target": "0x001377",
                  "targetMode": "adl"
                },
                {
                  "type": "fallthrough",
                  "target": "0x001379",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 6279,
            "delta": 3678,
            "steps": 6293,
            "pc": "0x001377",
            "label": "countdownLoop",
            "state": {
              "pc": "0x001377",
              "a": "0x76",
              "f": "0x42",
              "bc": "0x000224",
              "de": "0xD1A7FC",
              "hl": "0xD18C7C",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A87E",
              "stack24": [
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x008000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x1A",
              "D0058E": "0x00",
              "D00080": "0x18",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
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
              "matrix3": "0xFF"
            },
            "meta": {
              "pc": "0x001377",
              "mode": "adl",
              "first": "djnz 0x001377",
              "last": "djnz 0x001377",
              "instructions": [
                "djnz 0x001377"
              ],
              "exits": [
                {
                  "type": "branch",
                  "target": "0x001377",
                  "targetMode": "adl"
                },
                {
                  "type": "fallthrough",
                  "target": "0x001379",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 6280,
            "delta": 3679,
            "steps": 6294,
            "pc": "0x001377",
            "label": "countdownLoop",
            "state": {
              "pc": "0x001377",
              "a": "0x76",
              "f": "0x42",
              "bc": "0x000124",
              "de": "0xD1A7FC",
              "hl": "0xD18C7C",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A87E",
              "stack24": [
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x008000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x1A",
              "D0058E": "0x00",
              "D00080": "0x18",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
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
              "matrix3": "0xFF"
            },
            "meta": {
              "pc": "0x001377",
              "mode": "adl",
              "first": "djnz 0x001377",
              "last": "djnz 0x001377",
              "instructions": [
                "djnz 0x001377"
              ],
              "exits": [
                {
                  "type": "branch",
                  "target": "0x001377",
                  "targetMode": "adl"
                },
                {
                  "type": "fallthrough",
                  "target": "0x001379",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 6281,
            "delta": 3680,
            "steps": 6295,
            "pc": "0x001379",
            "label": "port3Read",
            "state": {
              "pc": "0x001379",
              "a": "0x76",
              "f": "0x42",
              "bc": "0x000024",
              "de": "0xD1A7FC",
              "hl": "0xD18C7C",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A87E",
              "stack24": [
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x008000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x1A",
              "D0058E": "0x00",
              "D00080": "0x18",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
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
              "matrix3": "0xFF"
            },
            "meta": {
              "pc": "0x001379",
              "mode": "adl",
              "first": "in0 a, (0x03)",
              "last": "jr z, 0x00138a",
              "instructions": [
                "in0 a, (0x03)",
                "bit 4, a",
                "jr z, 0x00138a"
              ],
              "exits": [
                {
                  "type": "branch",
                  "target": "0x00138A",
                  "targetMode": "adl"
                },
                {
                  "type": "fallthrough",
                  "target": "0x001380",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 6282,
            "delta": 3681,
            "steps": 6296,
            "pc": "0x00138A",
            "label": "port3PostRead",
            "state": {
              "pc": "0x00138A",
              "a": "0xEE",
              "f": "0x54",
              "bc": "0x000024",
              "de": "0xD1A7FC",
              "hl": "0xD18C7C",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A87E",
              "stack24": [
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x008000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x1A",
              "D0058E": "0x00",
              "D00080": "0x18",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
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
              "matrix3": "0xFF"
            },
            "meta": {
              "pc": "0x00138A",
              "mode": "adl",
              "first": "ld a, 0x26",
              "last": "jr nz, 0x00139c",
              "instructions": [
                "ld a, 0x26",
                "out0 (0x05), a",
                "cp 0x26",
                "jr nz, 0x00139c"
              ],
              "exits": [
                {
                  "type": "branch",
                  "target": "0x00139C",
                  "targetMode": "adl"
                },
                {
                  "type": "fallthrough",
                  "target": "0x001393",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 6283,
            "delta": 3682,
            "steps": 6297,
            "pc": "0x001393",
            "label": "port3Prep",
            "state": {
              "pc": "0x001393",
              "a": "0x26",
              "f": "0x42",
              "bc": "0x000024",
              "de": "0xD1A7FC",
              "hl": "0xD18C7C",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A87E",
              "stack24": [
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x008000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x1A",
              "D0058E": "0x00",
              "D00080": "0x18",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
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
              "matrix3": "0xFF"
            },
            "meta": {
              "pc": "0x001393",
              "mode": "adl",
              "first": "ld a, 0x03",
              "last": "jr z, 0x00139d",
              "instructions": [
                "ld a, 0x03",
                "out0 (0x06), a",
                "cp 0x03",
                "jr z, 0x00139d"
              ],
              "exits": [
                {
                  "type": "branch",
                  "target": "0x00139D",
                  "targetMode": "adl"
                },
                {
                  "type": "fallthrough",
                  "target": "0x00139C",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 6284,
            "delta": 3683,
            "steps": 6298,
            "pc": "0x00139D",
            "label": "wrapperSetup",
            "state": {
              "pc": "0x00139D",
              "a": "0x03",
              "f": "0x42",
              "bc": "0x000024",
              "de": "0xD1A7FC",
              "hl": "0xD18C7C",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A87E",
              "stack24": [
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x008000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x1A",
              "D0058E": "0x00",
              "D00080": "0x18",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
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
              "matrix3": "0xFF"
            },
            "meta": {
              "pc": "0x00139D",
              "mode": "adl",
              "first": "ld bc, 0x00a000",
              "last": "jr nz, 0x00139c",
              "instructions": [
                "ld bc, 0x00a000",
                "xor a",
                "out (c), a",
                "inc c",
                "ld a, 0x0f",
                "out (c), a",
                "inc c",
                "xor a",
                "out (c), a",
                "inc c",
                "ld a, 0x0f",
                "out (c), a",
                "inc c",
                "ld a, 0x08",
                "out (c), a",
                "inc c"
              ],
              "exits": [
                {
                  "type": "branch",
                  "target": "0x00139C",
                  "targetMode": "adl"
                },
                {
                  "type": "fallthrough",
                  "target": "0x0013C3",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 6285,
            "delta": 3684,
            "steps": 6299,
            "pc": "0x0013C3",
            "label": "wrapperCall",
            "state": {
              "pc": "0x0013C3",
              "a": "0x08",
              "f": "0x42",
              "bc": "0x00A005",
              "de": "0xD1A7FC",
              "hl": "0x000000",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A87E",
              "stack24": [
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x008000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x1A",
              "D0058E": "0x00",
              "D00080": "0x18",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
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
              "matrix3": "0xFF"
            },
            "meta": {
              "pc": "0x0013C3",
              "mode": "adl",
              "first": "call 0x001988",
              "last": "call 0x001988",
              "instructions": [
                "call 0x001988"
              ],
              "exits": [
                {
                  "type": "call",
                  "target": "0x001988",
                  "targetMode": "adl"
                },
                {
                  "type": "call-return",
                  "target": "0x0013C7",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 6286,
            "delta": 3685,
            "steps": 6300,
            "pc": "0x001988",
            "label": "helperEntry",
            "state": {
              "pc": "0x001988",
              "a": "0x08",
              "f": "0x42",
              "bc": "0x00A005",
              "de": "0xD1A7FC",
              "hl": "0x000000",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A87B",
              "stack24": [
                "0x0013C7",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x1A",
              "D0058E": "0x00",
              "D00080": "0x18",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
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
              "matrix3": "0xFF"
            },
            "meta": {
              "pc": "0x001988",
              "mode": "adl",
              "first": "di",
              "last": "jr nz, 0x0019a9",
              "instructions": [
                "di",
                "push bc",
                "in0 a, (0x03)",
                "bit 4, a",
                "jr nz, 0x0019a9"
              ],
              "exits": [
                {
                  "type": "branch",
                  "target": "0x0019A9",
                  "targetMode": "adl"
                },
                {
                  "type": "fallthrough",
                  "target": "0x001991",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 6287,
            "delta": 3686,
            "steps": 6301,
            "pc": "0x001991",
            "label": "helperStackSave",
            "state": {
              "pc": "0x001991",
              "a": "0xEE",
              "f": "0x54",
              "bc": "0x00A005",
              "de": "0xD1A7FC",
              "hl": "0x000000",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A878",
              "stack24": [
                "0x00A005",
                "0x0013C7",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x1A",
              "D0058E": "0x00",
              "D00080": "0x18",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
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
              "matrix3": "0xFF"
            },
            "meta": {
              "pc": "0x001991",
              "mode": "adl",
              "first": "ld bc, 0x001005",
              "last": "jr z, 0x00199e",
              "instructions": [
                "ld bc, 0x001005",
                "ld a, 0x04",
                "out (c), a",
                "cp 0x04",
                "jr z, 0x00199e"
              ],
              "exits": [
                {
                  "type": "branch",
                  "target": "0x00199E",
                  "targetMode": "adl"
                },
                {
                  "type": "fallthrough",
                  "target": "0x00199D",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 6288,
            "delta": 3687,
            "steps": 6302,
            "pc": "0x00199E",
            "label": "helperLoadB",
            "state": {
              "pc": "0x00199E",
              "a": "0x04",
              "f": "0x42",
              "bc": "0x001005",
              "de": "0xD1A7FC",
              "hl": "0x000000",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A878",
              "stack24": [
                "0x00A005",
                "0x0013C7",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x1A",
              "D0058E": "0x00",
              "D00080": "0x18",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
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
              "matrix3": "0xFF"
            },
            "meta": {
              "pc": "0x00199E",
              "mode": "adl",
              "first": "ld a, b",
              "last": "jr z, 0x0019a4",
              "instructions": [
                "ld a, b",
                "cp 0x10",
                "jr z, 0x0019a4"
              ],
              "exits": [
                {
                  "type": "branch",
                  "target": "0x0019A4",
                  "targetMode": "adl"
                },
                {
                  "type": "fallthrough",
                  "target": "0x0019A3",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 6289,
            "delta": 3688,
            "steps": 6303,
            "pc": "0x0019A4",
            "label": "helperLoadC",
            "state": {
              "pc": "0x0019A4",
              "a": "0x10",
              "f": "0x42",
              "bc": "0x001005",
              "de": "0xD1A7FC",
              "hl": "0x000000",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A878",
              "stack24": [
                "0x00A005",
                "0x0013C7",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x1A",
              "D0058E": "0x00",
              "D00080": "0x18",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
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
              "matrix3": "0xFF"
            },
            "meta": {
              "pc": "0x0019A4",
              "mode": "adl",
              "first": "ld a, c",
              "last": "jr nz, 0x0019a3",
              "instructions": [
                "ld a, c",
                "cp 0x05",
                "jr nz, 0x0019a3"
              ],
              "exits": [
                {
                  "type": "branch",
                  "target": "0x0019A3",
                  "targetMode": "adl"
                },
                {
                  "type": "fallthrough",
                  "target": "0x0019A9",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 6290,
            "delta": 3689,
            "steps": 6304,
            "pc": "0x0019A9",
            "label": "helperPortSelect",
            "state": {
              "pc": "0x0019A9",
              "a": "0x05",
              "f": "0x42",
              "bc": "0x001005",
              "de": "0xD1A7FC",
              "hl": "0x000000",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A878",
              "stack24": [
                "0x00A005",
                "0x0013C7",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x1A",
              "D0058E": "0x00",
              "D00080": "0x18",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
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
              "matrix3": "0xFF"
            },
            "meta": {
              "pc": "0x0019A9",
              "mode": "adl",
              "first": "ld a, 0x03",
              "last": "jr z, 0x0019b3",
              "instructions": [
                "ld a, 0x03",
                "out0 (0x01), a",
                "cp 0x03",
                "jr z, 0x0019b3"
              ],
              "exits": [
                {
                  "type": "branch",
                  "target": "0x0019B3",
                  "targetMode": "adl"
                },
                {
                  "type": "fallthrough",
                  "target": "0x0019B2",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 6291,
            "delta": 3690,
            "steps": 6305,
            "pc": "0x0019B3",
            "label": "helperDynamicReturn",
            "state": {
              "pc": "0x0019B3",
              "a": "0x03",
              "f": "0x42",
              "bc": "0x001005",
              "de": "0xD1A7FC",
              "hl": "0x000000",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A878",
              "stack24": [
                "0x00A005",
                "0x0013C7",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x1A",
              "D0058E": "0x00",
              "D00080": "0x18",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
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
              "matrix3": "0xFF"
            },
            "meta": {
              "pc": "0x0019B3",
              "mode": "adl",
              "first": "pop bc",
              "last": "ret",
              "instructions": [
                "pop bc",
                "ret"
              ],
              "exits": [
                {
                  "type": "return",
                  "target": null,
                  "targetMode": null
                }
              ]
            }
          },
          {
            "block": 6292,
            "delta": 3691,
            "steps": 6306,
            "pc": "0x0013C7",
            "label": "wrapperResume",
            "state": {
              "pc": "0x0013C7",
              "a": "0x03",
              "f": "0x42",
              "bc": "0x00A005",
              "de": "0xD1A7FC",
              "hl": "0x000000",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A87E",
              "stack24": [
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x008000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x1A",
              "D0058E": "0x00",
              "D00080": "0x18",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
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
              "matrix3": "0xFF"
            },
            "meta": {
              "pc": "0x0013C7",
              "mode": "adl",
              "first": "ld a, 0xd0",
              "last": "call 0x0158de",
              "instructions": [
                "ld a, 0xd0",
                "??? tag=ld-mb-a",
                "im 1",
                "ld iy, 0xd00080",
                "res 6, (iy+27)",
                "call 0x0158de"
              ],
              "exits": [
                {
                  "type": "call",
                  "target": "0x0158DE",
                  "targetMode": "adl"
                },
                {
                  "type": "call-return",
                  "target": "0x0013DA",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 6293,
            "delta": 3692,
            "steps": 6307,
            "pc": "0x0158DE",
            "label": "preOwnerFlagGate",
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
                "0x000000",
                "0x000000",
                "0x000000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x1A",
              "D0058E": "0x00",
              "D00080": "0x18",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
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
              "matrix3": "0xFF"
            },
            "meta": {
              "pc": "0x0158DE",
              "mode": "adl",
              "first": "ld iy, 0xd00080",
              "last": "ret nz",
              "instructions": [
                "ld iy, 0xd00080",
                "bit 7, (iy+66)",
                "ret nz"
              ],
              "exits": [
                {
                  "type": "return-conditional",
                  "target": null,
                  "targetMode": null
                },
                {
                  "type": "fallthrough",
                  "target": "0x0158E8",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 6294,
            "delta": 3693,
            "steps": 6308,
            "pc": "0x0158E8",
            "label": "preOwnerCall",
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
                "0x000000",
                "0x000000",
                "0x000000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x1A",
              "D0058E": "0x00",
              "D00080": "0x18",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
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
              "matrix3": "0xFF"
            },
            "meta": {
              "pc": "0x0158E8",
              "mode": "adl",
              "first": "call 0x0158bc",
              "last": "call 0x0158bc",
              "instructions": [
                "call 0x0158bc"
              ],
              "exits": [
                {
                  "type": "call",
                  "target": "0x0158BC",
                  "targetMode": "adl"
                },
                {
                  "type": "call-return",
                  "target": "0x0158EC",
                  "targetMode": "adl"
                }
              ]
            }
          }
        ],
        "recentDynamicTargets": [
          {
            "block": 5790,
            "delta": 3189,
            "steps": 5804,
            "fromPc": "0x0021C2",
            "target": "0x02B175",
            "mode": "adl"
          },
          {
            "block": 5801,
            "delta": 3200,
            "steps": 5815,
            "fromPc": "0x002197",
            "target": "0x0BCB37",
            "mode": "adl"
          },
          {
            "block": 5802,
            "delta": 3201,
            "steps": 5816,
            "fromPc": "0x0BCB37",
            "target": "0x02B31D",
            "mode": "adl"
          },
          {
            "block": 5818,
            "delta": 3217,
            "steps": 5833,
            "fromPc": "0x0008BB",
            "target": "0x001717",
            "mode": "adl"
          },
          {
            "block": 5829,
            "delta": 3228,
            "steps": 5844,
            "fromPc": "0x001CE5",
            "target": "0x001C54",
            "mode": "adl"
          },
          {
            "block": 5830,
            "delta": 3229,
            "steps": 5845,
            "fromPc": "0x001C54",
            "target": "0x006808",
            "mode": "adl"
          },
          {
            "block": 5840,
            "delta": 3239,
            "steps": 5855,
            "fromPc": "0x001CE4",
            "target": "0x001C81",
            "mode": "adl"
          },
          {
            "block": 5842,
            "delta": 3241,
            "steps": 5857,
            "fromPc": "0x001C82",
            "target": "0x001C48",
            "mode": "adl"
          },
          {
            "block": 5852,
            "delta": 3251,
            "steps": 5867,
            "fromPc": "0x001CE4",
            "target": "0x001C81",
            "mode": "adl"
          },
          {
            "block": 5854,
            "delta": 3253,
            "steps": 5869,
            "fromPc": "0x001C82",
            "target": "0x001C48",
            "mode": "adl"
          },
          {
            "block": 5864,
            "delta": 3263,
            "steps": 5879,
            "fromPc": "0x001CE4",
            "target": "0x001C81",
            "mode": "adl"
          },
          {
            "block": 5866,
            "delta": 3265,
            "steps": 5881,
            "fromPc": "0x001C82",
            "target": "0x001C48",
            "mode": "adl"
          },
          {
            "block": 5876,
            "delta": 3275,
            "steps": 5891,
            "fromPc": "0x001CE4",
            "target": "0x001C81",
            "mode": "adl"
          },
          {
            "block": 5878,
            "delta": 3277,
            "steps": 5893,
            "fromPc": "0x001C82",
            "target": "0x001C48",
            "mode": "adl"
          },
          {
            "block": 5883,
            "delta": 3282,
            "steps": 5898,
            "fromPc": "0x001C42",
            "target": "0x006810",
            "mode": "adl"
          },
          {
            "block": 5890,
            "delta": 3289,
            "steps": 5905,
            "fromPc": "0x001CE4",
            "target": "0x001C54",
            "mode": "adl"
          },
          {
            "block": 5891,
            "delta": 3290,
            "steps": 5906,
            "fromPc": "0x001C54",
            "target": "0x006816",
            "mode": "adl"
          },
          {
            "block": 5894,
            "delta": 3293,
            "steps": 5909,
            "fromPc": "0x006828",
            "target": "0x001727",
            "mode": "adl"
          },
          {
            "block": 5895,
            "delta": 3294,
            "steps": 5910,
            "fromPc": "0x001727",
            "target": "0x000719",
            "mode": "adl"
          },
          {
            "block": 5919,
            "delta": 3318,
            "steps": 5934,
            "fromPc": "0x003CF3",
            "target": "0x03F998",
            "mode": "adl"
          },
          {
            "block": 5925,
            "delta": 3324,
            "steps": 5940,
            "fromPc": "0x03F9B8",
            "target": "0x03D058",
            "mode": "adl"
          },
          {
            "block": 5927,
            "delta": 3326,
            "steps": 5942,
            "fromPc": "0x05C623",
            "target": "0x03D060",
            "mode": "adl"
          },
          {
            "block": 5929,
            "delta": 3328,
            "steps": 5944,
            "fromPc": "0x03D0E0",
            "target": "0x000000",
            "mode": "adl"
          },
          {
            "block": 6291,
            "delta": 3690,
            "steps": 6306,
            "fromPc": "0x0019B3",
            "target": "0x0013C7",
            "mode": "adl"
          }
        ]
      },
      "branchSummary": {
        "variant": "release-matrix-at-deposit-stop-owner",
        "countdownBlocks": 82,
        "countdownFirstBC": "0x005224",
        "countdownLastBC": "0x000124",
        "fallthroughBC": "0x000024",
        "port3Input": "0xEE",
        "port3PostFlags": "0x54",
        "wrapperCallState": {
          "pc": "0x0013C3",
          "a": "0x08",
          "f": "0x42",
          "bc": "0x00A005",
          "de": "0xD1A7FC",
          "hl": "0x000000",
          "ix": "0x000000",
          "iy": "0x3B001A",
          "sp": "0xD1A87E",
          "stack24": [
            "0x000000",
            "0x000000",
            "0x000000",
            "0x000000",
            "0x000000",
            "0x008000"
          ],
          "errSp": "0xD1A863",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x1A",
          "D0058E": "0x00",
          "D00080": "0x18",
          "D0009B": "0x00",
          "D0009F": "0x00",
          "D000A3": "0x0A",
          "D000C2": "0x00",
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
          "matrix3": "0xFF"
        },
        "helperEntryStack": [
          "0x0013C7",
          "0x000000",
          "0x000000"
        ],
        "helperReturnState": {
          "pc": "0x0019B3",
          "a": "0x03",
          "f": "0x42",
          "bc": "0x001005",
          "de": "0xD1A7FC",
          "hl": "0x000000",
          "ix": "0x000000",
          "iy": "0x3B001A",
          "sp": "0xD1A878",
          "stack24": [
            "0x00A005",
            "0x0013C7",
            "0x000000",
            "0x000000",
            "0x000000",
            "0x000000"
          ],
          "errSp": "0xD1A863",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x1A",
          "D0058E": "0x00",
          "D00080": "0x18",
          "D0009B": "0x00",
          "D0009F": "0x00",
          "D000A3": "0x0A",
          "D000C2": "0x00",
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
          "matrix3": "0xFF"
        },
        "wrapperResumeState": {
          "pc": "0x0013C7",
          "a": "0x03",
          "f": "0x42",
          "bc": "0x00A005",
          "de": "0xD1A7FC",
          "hl": "0x000000",
          "ix": "0x000000",
          "iy": "0x3B001A",
          "sp": "0xD1A87E",
          "stack24": [
            "0x000000",
            "0x000000",
            "0x000000",
            "0x000000",
            "0x000000",
            "0x008000"
          ],
          "errSp": "0xD1A863",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x1A",
          "D0058E": "0x00",
          "D00080": "0x18",
          "D0009B": "0x00",
          "D0009F": "0x00",
          "D000A3": "0x0A",
          "D000C2": "0x00",
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
          "matrix3": "0xFF"
        },
        "d000c2At0158DE": "0x00",
        "d000c2Bit7Clear": true,
        "preOwnerStack": [
          "0x0013DA",
          "0x000000",
          "0x000000"
        ],
        "ownerStack": [
          "0x0158EC",
          "0x0013DA",
          "0x000000"
        ]
      },
      "wrapperPath": [
        {
          "block": 6199,
          "delta": 3598,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x005224",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 6200,
          "delta": 3599,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x005124",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 6201,
          "delta": 3600,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x005024",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 6202,
          "delta": 3601,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x004F24",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 6203,
          "delta": 3602,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x004E24",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 6204,
          "delta": 3603,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x004D24",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 6205,
          "delta": 3604,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x004C24",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 6206,
          "delta": 3605,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x004B24",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 6207,
          "delta": 3606,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x004A24",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 6208,
          "delta": 3607,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x004924",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 6209,
          "delta": 3608,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x004824",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 6210,
          "delta": 3609,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x004724",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 6211,
          "delta": 3610,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x004624",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 6212,
          "delta": 3611,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x004524",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 6213,
          "delta": 3612,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x004424",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 6214,
          "delta": 3613,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x004324",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 6215,
          "delta": 3614,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x004224",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 6216,
          "delta": 3615,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x004124",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 6217,
          "delta": 3616,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x004024",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 6218,
          "delta": 3617,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x003F24",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 6219,
          "delta": 3618,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x003E24",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 6220,
          "delta": 3619,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x003D24",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 6221,
          "delta": 3620,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x003C24",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 6222,
          "delta": 3621,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x003B24",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 6223,
          "delta": 3622,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x003A24",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 6224,
          "delta": 3623,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x003924",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 6225,
          "delta": 3624,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x003824",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 6226,
          "delta": 3625,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x003724",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 6227,
          "delta": 3626,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x003624",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 6228,
          "delta": 3627,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x003524",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 6229,
          "delta": 3628,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x003424",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 6230,
          "delta": 3629,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x003324",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 6231,
          "delta": 3630,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x003224",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 6232,
          "delta": 3631,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x003124",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 6233,
          "delta": 3632,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x003024",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 6234,
          "delta": 3633,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x002F24",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 6235,
          "delta": 3634,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x002E24",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 6236,
          "delta": 3635,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x002D24",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 6237,
          "delta": 3636,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x002C24",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 6238,
          "delta": 3637,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x002B24",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 6239,
          "delta": 3638,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x002A24",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 6240,
          "delta": 3639,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x002924",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 6241,
          "delta": 3640,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x002824",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 6242,
          "delta": 3641,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x002724",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 6243,
          "delta": 3642,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x002624",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 6244,
          "delta": 3643,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x002524",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 6245,
          "delta": 3644,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x002424",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 6246,
          "delta": 3645,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x002324",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 6247,
          "delta": 3646,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x002224",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 6248,
          "delta": 3647,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x002124",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 6249,
          "delta": 3648,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x002024",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 6250,
          "delta": 3649,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x001F24",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 6251,
          "delta": 3650,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x001E24",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 6252,
          "delta": 3651,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x001D24",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 6253,
          "delta": 3652,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x001C24",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 6254,
          "delta": 3653,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x001B24",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 6255,
          "delta": 3654,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x001A24",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 6256,
          "delta": 3655,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x001924",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 6257,
          "delta": 3656,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x001824",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 6258,
          "delta": 3657,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x001724",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 6259,
          "delta": 3658,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x001624",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 6260,
          "delta": 3659,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x001524",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 6261,
          "delta": 3660,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x001424",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 6262,
          "delta": 3661,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x001324",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 6263,
          "delta": 3662,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x001224",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 6264,
          "delta": 3663,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x001124",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 6265,
          "delta": 3664,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x001024",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 6266,
          "delta": 3665,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x000F24",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 6267,
          "delta": 3666,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x000E24",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 6268,
          "delta": 3667,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x000D24",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 6269,
          "delta": 3668,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x000C24",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 6270,
          "delta": 3669,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x000B24",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 6271,
          "delta": 3670,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x000A24",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 6272,
          "delta": 3671,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x000924",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 6273,
          "delta": 3672,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x000824",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 6274,
          "delta": 3673,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x000724",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 6275,
          "delta": 3674,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x000624",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 6276,
          "delta": 3675,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x000524",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 6277,
          "delta": 3676,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x000424",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 6278,
          "delta": 3677,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x000324",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 6279,
          "delta": 3678,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x000224",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 6280,
          "delta": 3679,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x000124",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 6281,
          "delta": 3680,
          "pc": "0x001379",
          "first": "in0 a, (0x03)",
          "last": "jr z, 0x00138a",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x000024",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 6282,
          "delta": 3681,
          "pc": "0x00138A",
          "first": "ld a, 0x26",
          "last": "jr nz, 0x00139c",
          "state": {
            "a": "0xEE",
            "f": "0x54",
            "bc": "0x000024",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 6283,
          "delta": 3682,
          "pc": "0x001393",
          "first": "ld a, 0x03",
          "last": "jr z, 0x00139d",
          "state": {
            "a": "0x26",
            "f": "0x42",
            "bc": "0x000024",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 6284,
          "delta": 3683,
          "pc": "0x00139D",
          "first": "ld bc, 0x00a000",
          "last": "jr nz, 0x00139c",
          "state": {
            "a": "0x03",
            "f": "0x42",
            "bc": "0x000024",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 6285,
          "delta": 3684,
          "pc": "0x0013C3",
          "first": "call 0x001988",
          "last": "call 0x001988",
          "state": {
            "a": "0x08",
            "f": "0x42",
            "bc": "0x00A005",
            "hl": "0x000000",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 6286,
          "delta": 3685,
          "pc": "0x001988",
          "first": "di",
          "last": "jr nz, 0x0019a9",
          "state": {
            "a": "0x08",
            "f": "0x42",
            "bc": "0x00A005",
            "hl": "0x000000",
            "iy": "0x3B001A",
            "sp": "0xD1A87B",
            "stack24": [
              "0x0013C7",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 6287,
          "delta": 3686,
          "pc": "0x001991",
          "first": "ld bc, 0x001005",
          "last": "jr z, 0x00199e",
          "state": {
            "a": "0xEE",
            "f": "0x54",
            "bc": "0x00A005",
            "hl": "0x000000",
            "iy": "0x3B001A",
            "sp": "0xD1A878",
            "stack24": [
              "0x00A005",
              "0x0013C7",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 6288,
          "delta": 3687,
          "pc": "0x00199E",
          "first": "ld a, b",
          "last": "jr z, 0x0019a4",
          "state": {
            "a": "0x04",
            "f": "0x42",
            "bc": "0x001005",
            "hl": "0x000000",
            "iy": "0x3B001A",
            "sp": "0xD1A878",
            "stack24": [
              "0x00A005",
              "0x0013C7",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 6289,
          "delta": 3688,
          "pc": "0x0019A4",
          "first": "ld a, c",
          "last": "jr nz, 0x0019a3",
          "state": {
            "a": "0x10",
            "f": "0x42",
            "bc": "0x001005",
            "hl": "0x000000",
            "iy": "0x3B001A",
            "sp": "0xD1A878",
            "stack24": [
              "0x00A005",
              "0x0013C7",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 6290,
          "delta": 3689,
          "pc": "0x0019A9",
          "first": "ld a, 0x03",
          "last": "jr z, 0x0019b3",
          "state": {
            "a": "0x05",
            "f": "0x42",
            "bc": "0x001005",
            "hl": "0x000000",
            "iy": "0x3B001A",
            "sp": "0xD1A878",
            "stack24": [
              "0x00A005",
              "0x0013C7",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 6291,
          "delta": 3690,
          "pc": "0x0019B3",
          "first": "pop bc",
          "last": "ret",
          "state": {
            "a": "0x03",
            "f": "0x42",
            "bc": "0x001005",
            "hl": "0x000000",
            "iy": "0x3B001A",
            "sp": "0xD1A878",
            "stack24": [
              "0x00A005",
              "0x0013C7",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 6292,
          "delta": 3691,
          "pc": "0x0013C7",
          "first": "ld a, 0xd0",
          "last": "call 0x0158de",
          "state": {
            "a": "0x03",
            "f": "0x42",
            "bc": "0x00A005",
            "hl": "0x000000",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 6293,
          "delta": 3692,
          "pc": "0x0158DE",
          "first": "ld iy, 0xd00080",
          "last": "ret nz",
          "state": {
            "a": "0xD0",
            "f": "0x42",
            "bc": "0x00A005",
            "hl": "0x000000",
            "iy": "0xD00080",
            "sp": "0xD1A87B",
            "stack24": [
              "0x0013DA",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 6294,
          "delta": 3693,
          "pc": "0x0158E8",
          "first": "call 0x0158bc",
          "last": "call 0x0158bc",
          "state": {
            "a": "0xD0",
            "f": "0x54",
            "bc": "0x00A005",
            "hl": "0x000000",
            "iy": "0xD00080",
            "sp": "0xD1A87B",
            "stack24": [
              "0x0013DA",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        }
      ],
      "firstCleanupBlock": null,
      "firstWipeBlock": null,
      "events": [
        {
          "kind": "deposit1",
          "block": 2601,
          "delta": 0,
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
              "0x000032",
              "0x003662",
              "0x058B18"
            ],
            "errSp": "0xD1A863",
            "D00587": "0x1A",
            "D0058C": "0x90",
            "D0058D": "0x1A",
            "D0058E": "0x90",
            "D00080": "0x18",
            "D0009B": "0x00",
            "D0009F": "0x00",
            "D000A3": "0x0A",
            "D000C2": "0x00",
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
            "matrix3": "0xFD"
          }
        },
        {
          "kind": "release-matrix",
          "block": 2601,
          "delta": 0,
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
              "0x000032",
              "0x003662",
              "0x058B18"
            ],
            "errSp": "0xD1A863",
            "D00587": "0x00",
            "D0058C": "0x90",
            "D0058D": "0x1A",
            "D0058E": "0x90",
            "D00080": "0x10",
            "D0009B": "0x00",
            "D0009F": "0x00",
            "D000A3": "0x0A",
            "D000C2": "0x00",
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
            "matrix3": "0xFF"
          }
        },
        {
          "kind": "first-0158bc-owner-stop",
          "block": 6295,
          "delta": 3694,
          "steps": 6309,
          "pc": "0x0158BC",
          "state": {
            "pc": "0x0158BC",
            "a": "0xD0",
            "f": "0x54",
            "bc": "0x00A005",
            "de": "0xD1A7FC",
            "hl": "0x000000",
            "ix": "0x000000",
            "iy": "0xD00080",
            "sp": "0xD1A878",
            "stack24": [
              "0x0158EC",
              "0x0013DA",
              "0x000000",
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "errSp": "0xD1A863",
            "D00587": "0x00",
            "D0058C": "0x00",
            "D0058D": "0x1A",
            "D0058E": "0x00",
            "D00080": "0x18",
            "D0009B": "0x00",
            "D0009F": "0x00",
            "D000A3": "0x0A",
            "D000C2": "0x00",
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
            "matrix3": "0xFF"
          }
        }
      ],
      "importantMetas": {
        "0x000038": {
          "pc": "0x000038",
          "mode": "adl",
          "first": "ex af, af'",
          "last": "jp 0x0006f3",
          "instructions": [
            "ex af, af'",
            "exx",
            "push ix",
            "push iy",
            "ld iy, 0xd00080",
            "jp 0x0006f3"
          ],
          "exits": [
            {
              "type": "jump",
              "target": "0x0006F3",
              "targetMode": "adl"
            }
          ]
        },
        "0x0585E9": {
          "pc": "0x0585E9",
          "mode": "adl",
          "first": "res 6, (iy+73)",
          "last": "call nz, 0x0239b3",
          "instructions": [
            "res 6, (iy+73)",
            "ld b, a",
            "ld a, 0x01",
            "bit 4, (iy+52)",
            "call nz, 0x0239b3"
          ],
          "exits": [
            {
              "type": "call",
              "target": "0x0239B3",
              "targetMode": "adl"
            },
            {
              "type": "call-return",
              "target": "0x0585F8",
              "targetMode": "adl"
            }
          ]
        },
        "0x058EDA": {
          "pc": "0x058EDA",
          "mode": "adl",
          "first": "cp 0xfa",
          "last": "ret nz",
          "instructions": [
            "cp 0xfa",
            "ret nz"
          ],
          "exits": [
            {
              "type": "return-conditional",
              "target": null,
              "targetMode": null
            },
            {
              "type": "fallthrough",
              "target": "0x058EDD",
              "targetMode": "adl"
            }
          ]
        },
        "0x03FA09": {
          "pc": "0x03FA09",
          "mode": "adl",
          "first": "ld hl, 0xd00587",
          "last": "jp nz, 0x03fb9a",
          "instructions": [
            "ld hl, 0xd00587",
            "di",
            "ld a, (hl)",
            "ld (hl), 0x00",
            "res 3, (iy+0)",
            "ei",
            "push af",
            "or a",
            "jp nz, 0x03fb9a"
          ],
          "exits": [
            {
              "type": "branch",
              "target": "0x03FB9A",
              "targetMode": "adl"
            },
            {
              "type": "fallthrough",
              "target": "0x03FA1C",
              "targetMode": "adl"
            }
          ]
        },
        "0x001377": {
          "pc": "0x001377",
          "mode": "adl",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "instructions": [
            "djnz 0x001377"
          ],
          "exits": [
            {
              "type": "branch",
              "target": "0x001377",
              "targetMode": "adl"
            },
            {
              "type": "fallthrough",
              "target": "0x001379",
              "targetMode": "adl"
            }
          ]
        },
        "0x001379": {
          "pc": "0x001379",
          "mode": "adl",
          "first": "in0 a, (0x03)",
          "last": "jr z, 0x00138a",
          "instructions": [
            "in0 a, (0x03)",
            "bit 4, a",
            "jr z, 0x00138a"
          ],
          "exits": [
            {
              "type": "branch",
              "target": "0x00138A",
              "targetMode": "adl"
            },
            {
              "type": "fallthrough",
              "target": "0x001380",
              "targetMode": "adl"
            }
          ]
        },
        "0x00138A": {
          "pc": "0x00138A",
          "mode": "adl",
          "first": "ld a, 0x26",
          "last": "jr nz, 0x00139c",
          "instructions": [
            "ld a, 0x26",
            "out0 (0x05), a",
            "cp 0x26",
            "jr nz, 0x00139c"
          ],
          "exits": [
            {
              "type": "branch",
              "target": "0x00139C",
              "targetMode": "adl"
            },
            {
              "type": "fallthrough",
              "target": "0x001393",
              "targetMode": "adl"
            }
          ]
        },
        "0x001393": {
          "pc": "0x001393",
          "mode": "adl",
          "first": "ld a, 0x03",
          "last": "jr z, 0x00139d",
          "instructions": [
            "ld a, 0x03",
            "out0 (0x06), a",
            "cp 0x03",
            "jr z, 0x00139d"
          ],
          "exits": [
            {
              "type": "branch",
              "target": "0x00139D",
              "targetMode": "adl"
            },
            {
              "type": "fallthrough",
              "target": "0x00139C",
              "targetMode": "adl"
            }
          ]
        },
        "0x00139D": {
          "pc": "0x00139D",
          "mode": "adl",
          "first": "ld bc, 0x00a000",
          "last": "jr nz, 0x00139c",
          "instructions": [
            "ld bc, 0x00a000",
            "xor a",
            "out (c), a",
            "inc c",
            "ld a, 0x0f",
            "out (c), a",
            "inc c",
            "xor a",
            "out (c), a",
            "inc c",
            "ld a, 0x0f",
            "out (c), a",
            "inc c",
            "ld a, 0x08",
            "out (c), a",
            "inc c"
          ],
          "exits": [
            {
              "type": "branch",
              "target": "0x00139C",
              "targetMode": "adl"
            },
            {
              "type": "fallthrough",
              "target": "0x0013C3",
              "targetMode": "adl"
            }
          ]
        },
        "0x0013C3": {
          "pc": "0x0013C3",
          "mode": "adl",
          "first": "call 0x001988",
          "last": "call 0x001988",
          "instructions": [
            "call 0x001988"
          ],
          "exits": [
            {
              "type": "call",
              "target": "0x001988",
              "targetMode": "adl"
            },
            {
              "type": "call-return",
              "target": "0x0013C7",
              "targetMode": "adl"
            }
          ]
        },
        "0x001988": {
          "pc": "0x001988",
          "mode": "adl",
          "first": "di",
          "last": "jr nz, 0x0019a9",
          "instructions": [
            "di",
            "push bc",
            "in0 a, (0x03)",
            "bit 4, a",
            "jr nz, 0x0019a9"
          ],
          "exits": [
            {
              "type": "branch",
              "target": "0x0019A9",
              "targetMode": "adl"
            },
            {
              "type": "fallthrough",
              "target": "0x001991",
              "targetMode": "adl"
            }
          ]
        },
        "0x001991": {
          "pc": "0x001991",
          "mode": "adl",
          "first": "ld bc, 0x001005",
          "last": "jr z, 0x00199e",
          "instructions": [
            "ld bc, 0x001005",
            "ld a, 0x04",
            "out (c), a",
            "cp 0x04",
            "jr z, 0x00199e"
          ],
          "exits": [
            {
              "type": "branch",
              "target": "0x00199E",
              "targetMode": "adl"
            },
            {
              "type": "fallthrough",
              "target": "0x00199D",
              "targetMode": "adl"
            }
          ]
        },
        "0x00199E": {
          "pc": "0x00199E",
          "mode": "adl",
          "first": "ld a, b",
          "last": "jr z, 0x0019a4",
          "instructions": [
            "ld a, b",
            "cp 0x10",
            "jr z, 0x0019a4"
          ],
          "exits": [
            {
              "type": "branch",
              "target": "0x0019A4",
              "targetMode": "adl"
            },
            {
              "type": "fallthrough",
              "target": "0x0019A3",
              "targetMode": "adl"
            }
          ]
        },
        "0x0019A4": {
          "pc": "0x0019A4",
          "mode": "adl",
          "first": "ld a, c",
          "last": "jr nz, 0x0019a3",
          "instructions": [
            "ld a, c",
            "cp 0x05",
            "jr nz, 0x0019a3"
          ],
          "exits": [
            {
              "type": "branch",
              "target": "0x0019A3",
              "targetMode": "adl"
            },
            {
              "type": "fallthrough",
              "target": "0x0019A9",
              "targetMode": "adl"
            }
          ]
        },
        "0x0019A9": {
          "pc": "0x0019A9",
          "mode": "adl",
          "first": "ld a, 0x03",
          "last": "jr z, 0x0019b3",
          "instructions": [
            "ld a, 0x03",
            "out0 (0x01), a",
            "cp 0x03",
            "jr z, 0x0019b3"
          ],
          "exits": [
            {
              "type": "branch",
              "target": "0x0019B3",
              "targetMode": "adl"
            },
            {
              "type": "fallthrough",
              "target": "0x0019B2",
              "targetMode": "adl"
            }
          ]
        },
        "0x0019B3": {
          "pc": "0x0019B3",
          "mode": "adl",
          "first": "pop bc",
          "last": "ret",
          "instructions": [
            "pop bc",
            "ret"
          ],
          "exits": [
            {
              "type": "return",
              "target": null,
              "targetMode": null
            }
          ]
        },
        "0x0013C7": {
          "pc": "0x0013C7",
          "mode": "adl",
          "first": "ld a, 0xd0",
          "last": "call 0x0158de",
          "instructions": [
            "ld a, 0xd0",
            "??? tag=ld-mb-a",
            "im 1",
            "ld iy, 0xd00080",
            "res 6, (iy+27)",
            "call 0x0158de"
          ],
          "exits": [
            {
              "type": "call",
              "target": "0x0158DE",
              "targetMode": "adl"
            },
            {
              "type": "call-return",
              "target": "0x0013DA",
              "targetMode": "adl"
            }
          ]
        },
        "0x0158DE": {
          "pc": "0x0158DE",
          "mode": "adl",
          "first": "ld iy, 0xd00080",
          "last": "ret nz",
          "instructions": [
            "ld iy, 0xd00080",
            "bit 7, (iy+66)",
            "ret nz"
          ],
          "exits": [
            {
              "type": "return-conditional",
              "target": null,
              "targetMode": null
            },
            {
              "type": "fallthrough",
              "target": "0x0158E8",
              "targetMode": "adl"
            }
          ]
        },
        "0x0158E8": {
          "pc": "0x0158E8",
          "mode": "adl",
          "first": "call 0x0158bc",
          "last": "call 0x0158bc",
          "instructions": [
            "call 0x0158bc"
          ],
          "exits": [
            {
              "type": "call",
              "target": "0x0158BC",
              "targetMode": "adl"
            },
            {
              "type": "call-return",
              "target": "0x0158EC",
              "targetMode": "adl"
            }
          ]
        },
        "0x0158BC": {
          "pc": "0x0158BC",
          "mode": "adl",
          "first": "ld de, 0x000330",
          "last": "call 0x001c55",
          "instructions": [
            "ld de, 0x000330",
            "call 0x001c55"
          ],
          "exits": [
            {
              "type": "call",
              "target": "0x001C55",
              "targetMode": "adl"
            },
            {
              "type": "call-return",
              "target": "0x0158C4",
              "targetMode": "adl"
            }
          ]
        }
      },
      "returnMetas": {
        "0x0158EC": {
          "pc": "0x0158EC",
          "mode": "adl",
          "first": "jr c, 0x0158f8",
          "last": "jr c, 0x0158f8",
          "instructions": [
            "jr c, 0x0158f8"
          ],
          "exits": [
            {
              "type": "branch",
              "target": "0x0158F8",
              "targetMode": "adl"
            },
            {
              "type": "fallthrough",
              "target": "0x0158EE",
              "targetMode": "adl"
            }
          ]
        },
        "0x0013DA": {
          "pc": "0x0013DA",
          "mode": "adl",
          "first": "jr z, 0x0013e4",
          "last": "jr z, 0x0013e4",
          "instructions": [
            "jr z, 0x0013e4"
          ],
          "exits": [
            {
              "type": "branch",
              "target": "0x0013E4",
              "targetMode": "adl"
            },
            {
              "type": "fallthrough",
              "target": "0x0013DC",
              "targetMode": "adl"
            }
          ]
        },
        "0x000000": {
          "pc": "0x000000",
          "mode": "adl",
          "first": "di",
          "last": "jp 0x000658",
          "instructions": [
            "di",
            "stmix",
            "jp 0x000658"
          ],
          "exits": [
            {
              "type": "jump",
              "target": "0x000658",
              "targetMode": "adl"
            }
          ]
        }
      }
    },
    {
      "name": "clear-ram-at-deposit-while-held-stop-owner",
      "termination": "first_0158bc_owner",
      "steps": 7239,
      "depositBlock": 2890,
      "releaseBlock": null,
      "clearRamBlock": 2890,
      "firstOwnerHit": {
        "block": 7220,
        "delta": 4330,
        "steps": 7239,
        "state": {
          "pc": "0x0158BC",
          "a": "0xD0",
          "f": "0x54",
          "bc": "0x00A005",
          "de": "0xD1A7FC",
          "hl": "0x000000",
          "ix": "0x000000",
          "iy": "0xD00080",
          "sp": "0xD1A878",
          "stack24": [
            "0x0158EC",
            "0x0013DA",
            "0x000000",
            "0x000000",
            "0x000000",
            "0x000000"
          ],
          "errSp": "0xD1A863",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x10",
          "D0009B": "0x00",
          "D0009F": "0x00",
          "D000A3": "0x0A",
          "D000C2": "0x00",
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
          "matrix3": "0xFD"
        },
        "returnHints": [
          {
            "ret": "0x0158EC",
            "hint": "return to 0x0158EC carry gate after 0x0158BC"
          },
          {
            "ret": "0x0013DA",
            "hint": "return to low-ROM wrapper A after owner scan"
          },
          {
            "ret": "0x000000",
            "hint": ""
          },
          {
            "ret": "0x000000",
            "hint": ""
          },
          {
            "ret": "0x000000",
            "hint": ""
          },
          {
            "ret": "0x000000",
            "hint": ""
          }
        ],
        "priorRouteTail": [
          {
            "block": 7172,
            "delta": 4282,
            "steps": 7191,
            "pc": "0x001377",
            "label": "countdownLoop",
            "state": {
              "pc": "0x001377",
              "a": "0x76",
              "f": "0x42",
              "bc": "0x002224",
              "de": "0xD1A7FC",
              "hl": "0xD18C7C",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A87E",
              "stack24": [
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x008000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x00",
              "D0058E": "0x00",
              "D00080": "0x10",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
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
              "matrix3": "0xFD"
            },
            "meta": {
              "pc": "0x001377",
              "mode": "adl",
              "first": "djnz 0x001377",
              "last": "djnz 0x001377",
              "instructions": [
                "djnz 0x001377"
              ],
              "exits": [
                {
                  "type": "branch",
                  "target": "0x001377",
                  "targetMode": "adl"
                },
                {
                  "type": "fallthrough",
                  "target": "0x001379",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 7173,
            "delta": 4283,
            "steps": 7192,
            "pc": "0x001377",
            "label": "countdownLoop",
            "state": {
              "pc": "0x001377",
              "a": "0x76",
              "f": "0x42",
              "bc": "0x002124",
              "de": "0xD1A7FC",
              "hl": "0xD18C7C",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A87E",
              "stack24": [
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x008000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x00",
              "D0058E": "0x00",
              "D00080": "0x10",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
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
              "matrix3": "0xFD"
            },
            "meta": {
              "pc": "0x001377",
              "mode": "adl",
              "first": "djnz 0x001377",
              "last": "djnz 0x001377",
              "instructions": [
                "djnz 0x001377"
              ],
              "exits": [
                {
                  "type": "branch",
                  "target": "0x001377",
                  "targetMode": "adl"
                },
                {
                  "type": "fallthrough",
                  "target": "0x001379",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 7174,
            "delta": 4284,
            "steps": 7193,
            "pc": "0x001377",
            "label": "countdownLoop",
            "state": {
              "pc": "0x001377",
              "a": "0x76",
              "f": "0x42",
              "bc": "0x002024",
              "de": "0xD1A7FC",
              "hl": "0xD18C7C",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A87E",
              "stack24": [
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x008000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x00",
              "D0058E": "0x00",
              "D00080": "0x10",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
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
              "matrix3": "0xFD"
            },
            "meta": {
              "pc": "0x001377",
              "mode": "adl",
              "first": "djnz 0x001377",
              "last": "djnz 0x001377",
              "instructions": [
                "djnz 0x001377"
              ],
              "exits": [
                {
                  "type": "branch",
                  "target": "0x001377",
                  "targetMode": "adl"
                },
                {
                  "type": "fallthrough",
                  "target": "0x001379",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 7175,
            "delta": 4285,
            "steps": 7194,
            "pc": "0x001377",
            "label": "countdownLoop",
            "state": {
              "pc": "0x001377",
              "a": "0x76",
              "f": "0x42",
              "bc": "0x001F24",
              "de": "0xD1A7FC",
              "hl": "0xD18C7C",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A87E",
              "stack24": [
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x008000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x00",
              "D0058E": "0x00",
              "D00080": "0x10",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
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
              "matrix3": "0xFD"
            },
            "meta": {
              "pc": "0x001377",
              "mode": "adl",
              "first": "djnz 0x001377",
              "last": "djnz 0x001377",
              "instructions": [
                "djnz 0x001377"
              ],
              "exits": [
                {
                  "type": "branch",
                  "target": "0x001377",
                  "targetMode": "adl"
                },
                {
                  "type": "fallthrough",
                  "target": "0x001379",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 7176,
            "delta": 4286,
            "steps": 7195,
            "pc": "0x001377",
            "label": "countdownLoop",
            "state": {
              "pc": "0x001377",
              "a": "0x76",
              "f": "0x42",
              "bc": "0x001E24",
              "de": "0xD1A7FC",
              "hl": "0xD18C7C",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A87E",
              "stack24": [
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x008000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x00",
              "D0058E": "0x00",
              "D00080": "0x10",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
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
              "matrix3": "0xFD"
            },
            "meta": {
              "pc": "0x001377",
              "mode": "adl",
              "first": "djnz 0x001377",
              "last": "djnz 0x001377",
              "instructions": [
                "djnz 0x001377"
              ],
              "exits": [
                {
                  "type": "branch",
                  "target": "0x001377",
                  "targetMode": "adl"
                },
                {
                  "type": "fallthrough",
                  "target": "0x001379",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 7177,
            "delta": 4287,
            "steps": 7196,
            "pc": "0x001377",
            "label": "countdownLoop",
            "state": {
              "pc": "0x001377",
              "a": "0x76",
              "f": "0x42",
              "bc": "0x001D24",
              "de": "0xD1A7FC",
              "hl": "0xD18C7C",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A87E",
              "stack24": [
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x008000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x00",
              "D0058E": "0x00",
              "D00080": "0x10",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
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
              "matrix3": "0xFD"
            },
            "meta": {
              "pc": "0x001377",
              "mode": "adl",
              "first": "djnz 0x001377",
              "last": "djnz 0x001377",
              "instructions": [
                "djnz 0x001377"
              ],
              "exits": [
                {
                  "type": "branch",
                  "target": "0x001377",
                  "targetMode": "adl"
                },
                {
                  "type": "fallthrough",
                  "target": "0x001379",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 7178,
            "delta": 4288,
            "steps": 7197,
            "pc": "0x001377",
            "label": "countdownLoop",
            "state": {
              "pc": "0x001377",
              "a": "0x76",
              "f": "0x42",
              "bc": "0x001C24",
              "de": "0xD1A7FC",
              "hl": "0xD18C7C",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A87E",
              "stack24": [
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x008000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x00",
              "D0058E": "0x00",
              "D00080": "0x10",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
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
              "matrix3": "0xFD"
            },
            "meta": {
              "pc": "0x001377",
              "mode": "adl",
              "first": "djnz 0x001377",
              "last": "djnz 0x001377",
              "instructions": [
                "djnz 0x001377"
              ],
              "exits": [
                {
                  "type": "branch",
                  "target": "0x001377",
                  "targetMode": "adl"
                },
                {
                  "type": "fallthrough",
                  "target": "0x001379",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 7179,
            "delta": 4289,
            "steps": 7198,
            "pc": "0x001377",
            "label": "countdownLoop",
            "state": {
              "pc": "0x001377",
              "a": "0x76",
              "f": "0x42",
              "bc": "0x001B24",
              "de": "0xD1A7FC",
              "hl": "0xD18C7C",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A87E",
              "stack24": [
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x008000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x00",
              "D0058E": "0x00",
              "D00080": "0x10",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
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
              "matrix3": "0xFD"
            },
            "meta": {
              "pc": "0x001377",
              "mode": "adl",
              "first": "djnz 0x001377",
              "last": "djnz 0x001377",
              "instructions": [
                "djnz 0x001377"
              ],
              "exits": [
                {
                  "type": "branch",
                  "target": "0x001377",
                  "targetMode": "adl"
                },
                {
                  "type": "fallthrough",
                  "target": "0x001379",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 7180,
            "delta": 4290,
            "steps": 7199,
            "pc": "0x001377",
            "label": "countdownLoop",
            "state": {
              "pc": "0x001377",
              "a": "0x76",
              "f": "0x42",
              "bc": "0x001A24",
              "de": "0xD1A7FC",
              "hl": "0xD18C7C",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A87E",
              "stack24": [
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x008000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x00",
              "D0058E": "0x00",
              "D00080": "0x10",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
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
              "matrix3": "0xFD"
            },
            "meta": {
              "pc": "0x001377",
              "mode": "adl",
              "first": "djnz 0x001377",
              "last": "djnz 0x001377",
              "instructions": [
                "djnz 0x001377"
              ],
              "exits": [
                {
                  "type": "branch",
                  "target": "0x001377",
                  "targetMode": "adl"
                },
                {
                  "type": "fallthrough",
                  "target": "0x001379",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 7181,
            "delta": 4291,
            "steps": 7200,
            "pc": "0x001377",
            "label": "countdownLoop",
            "state": {
              "pc": "0x001377",
              "a": "0x76",
              "f": "0x42",
              "bc": "0x001924",
              "de": "0xD1A7FC",
              "hl": "0xD18C7C",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A87E",
              "stack24": [
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x008000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x00",
              "D0058E": "0x00",
              "D00080": "0x10",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
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
              "matrix3": "0xFD"
            },
            "meta": {
              "pc": "0x001377",
              "mode": "adl",
              "first": "djnz 0x001377",
              "last": "djnz 0x001377",
              "instructions": [
                "djnz 0x001377"
              ],
              "exits": [
                {
                  "type": "branch",
                  "target": "0x001377",
                  "targetMode": "adl"
                },
                {
                  "type": "fallthrough",
                  "target": "0x001379",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 7182,
            "delta": 4292,
            "steps": 7201,
            "pc": "0x001377",
            "label": "countdownLoop",
            "state": {
              "pc": "0x001377",
              "a": "0x76",
              "f": "0x42",
              "bc": "0x001824",
              "de": "0xD1A7FC",
              "hl": "0xD18C7C",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A87E",
              "stack24": [
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x008000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x00",
              "D0058E": "0x00",
              "D00080": "0x10",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
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
              "matrix3": "0xFD"
            },
            "meta": {
              "pc": "0x001377",
              "mode": "adl",
              "first": "djnz 0x001377",
              "last": "djnz 0x001377",
              "instructions": [
                "djnz 0x001377"
              ],
              "exits": [
                {
                  "type": "branch",
                  "target": "0x001377",
                  "targetMode": "adl"
                },
                {
                  "type": "fallthrough",
                  "target": "0x001379",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 7183,
            "delta": 4293,
            "steps": 7202,
            "pc": "0x001377",
            "label": "countdownLoop",
            "state": {
              "pc": "0x001377",
              "a": "0x76",
              "f": "0x42",
              "bc": "0x001724",
              "de": "0xD1A7FC",
              "hl": "0xD18C7C",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A87E",
              "stack24": [
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x008000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x00",
              "D0058E": "0x00",
              "D00080": "0x10",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
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
              "matrix3": "0xFD"
            },
            "meta": {
              "pc": "0x001377",
              "mode": "adl",
              "first": "djnz 0x001377",
              "last": "djnz 0x001377",
              "instructions": [
                "djnz 0x001377"
              ],
              "exits": [
                {
                  "type": "branch",
                  "target": "0x001377",
                  "targetMode": "adl"
                },
                {
                  "type": "fallthrough",
                  "target": "0x001379",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 7184,
            "delta": 4294,
            "steps": 7203,
            "pc": "0x001377",
            "label": "countdownLoop",
            "state": {
              "pc": "0x001377",
              "a": "0x76",
              "f": "0x42",
              "bc": "0x001624",
              "de": "0xD1A7FC",
              "hl": "0xD18C7C",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A87E",
              "stack24": [
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x008000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x00",
              "D0058E": "0x00",
              "D00080": "0x10",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
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
              "matrix3": "0xFD"
            },
            "meta": {
              "pc": "0x001377",
              "mode": "adl",
              "first": "djnz 0x001377",
              "last": "djnz 0x001377",
              "instructions": [
                "djnz 0x001377"
              ],
              "exits": [
                {
                  "type": "branch",
                  "target": "0x001377",
                  "targetMode": "adl"
                },
                {
                  "type": "fallthrough",
                  "target": "0x001379",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 7185,
            "delta": 4295,
            "steps": 7204,
            "pc": "0x001377",
            "label": "countdownLoop",
            "state": {
              "pc": "0x001377",
              "a": "0x76",
              "f": "0x42",
              "bc": "0x001524",
              "de": "0xD1A7FC",
              "hl": "0xD18C7C",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A87E",
              "stack24": [
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x008000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x00",
              "D0058E": "0x00",
              "D00080": "0x10",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
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
              "matrix3": "0xFD"
            },
            "meta": {
              "pc": "0x001377",
              "mode": "adl",
              "first": "djnz 0x001377",
              "last": "djnz 0x001377",
              "instructions": [
                "djnz 0x001377"
              ],
              "exits": [
                {
                  "type": "branch",
                  "target": "0x001377",
                  "targetMode": "adl"
                },
                {
                  "type": "fallthrough",
                  "target": "0x001379",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 7186,
            "delta": 4296,
            "steps": 7205,
            "pc": "0x001377",
            "label": "countdownLoop",
            "state": {
              "pc": "0x001377",
              "a": "0x76",
              "f": "0x42",
              "bc": "0x001424",
              "de": "0xD1A7FC",
              "hl": "0xD18C7C",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A87E",
              "stack24": [
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x008000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x00",
              "D0058E": "0x00",
              "D00080": "0x10",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
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
              "matrix3": "0xFD"
            },
            "meta": {
              "pc": "0x001377",
              "mode": "adl",
              "first": "djnz 0x001377",
              "last": "djnz 0x001377",
              "instructions": [
                "djnz 0x001377"
              ],
              "exits": [
                {
                  "type": "branch",
                  "target": "0x001377",
                  "targetMode": "adl"
                },
                {
                  "type": "fallthrough",
                  "target": "0x001379",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 7187,
            "delta": 4297,
            "steps": 7206,
            "pc": "0x001377",
            "label": "countdownLoop",
            "state": {
              "pc": "0x001377",
              "a": "0x76",
              "f": "0x42",
              "bc": "0x001324",
              "de": "0xD1A7FC",
              "hl": "0xD18C7C",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A87E",
              "stack24": [
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x008000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x00",
              "D0058E": "0x00",
              "D00080": "0x10",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
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
              "matrix3": "0xFD"
            },
            "meta": {
              "pc": "0x001377",
              "mode": "adl",
              "first": "djnz 0x001377",
              "last": "djnz 0x001377",
              "instructions": [
                "djnz 0x001377"
              ],
              "exits": [
                {
                  "type": "branch",
                  "target": "0x001377",
                  "targetMode": "adl"
                },
                {
                  "type": "fallthrough",
                  "target": "0x001379",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 7188,
            "delta": 4298,
            "steps": 7207,
            "pc": "0x001377",
            "label": "countdownLoop",
            "state": {
              "pc": "0x001377",
              "a": "0x76",
              "f": "0x42",
              "bc": "0x001224",
              "de": "0xD1A7FC",
              "hl": "0xD18C7C",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A87E",
              "stack24": [
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x008000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x00",
              "D0058E": "0x00",
              "D00080": "0x10",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
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
              "matrix3": "0xFD"
            },
            "meta": {
              "pc": "0x001377",
              "mode": "adl",
              "first": "djnz 0x001377",
              "last": "djnz 0x001377",
              "instructions": [
                "djnz 0x001377"
              ],
              "exits": [
                {
                  "type": "branch",
                  "target": "0x001377",
                  "targetMode": "adl"
                },
                {
                  "type": "fallthrough",
                  "target": "0x001379",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 7189,
            "delta": 4299,
            "steps": 7208,
            "pc": "0x001377",
            "label": "countdownLoop",
            "state": {
              "pc": "0x001377",
              "a": "0x76",
              "f": "0x42",
              "bc": "0x001124",
              "de": "0xD1A7FC",
              "hl": "0xD18C7C",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A87E",
              "stack24": [
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x008000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x00",
              "D0058E": "0x00",
              "D00080": "0x10",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
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
              "matrix3": "0xFD"
            },
            "meta": {
              "pc": "0x001377",
              "mode": "adl",
              "first": "djnz 0x001377",
              "last": "djnz 0x001377",
              "instructions": [
                "djnz 0x001377"
              ],
              "exits": [
                {
                  "type": "branch",
                  "target": "0x001377",
                  "targetMode": "adl"
                },
                {
                  "type": "fallthrough",
                  "target": "0x001379",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 7190,
            "delta": 4300,
            "steps": 7209,
            "pc": "0x001377",
            "label": "countdownLoop",
            "state": {
              "pc": "0x001377",
              "a": "0x76",
              "f": "0x42",
              "bc": "0x001024",
              "de": "0xD1A7FC",
              "hl": "0xD18C7C",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A87E",
              "stack24": [
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x008000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x00",
              "D0058E": "0x00",
              "D00080": "0x10",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
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
              "matrix3": "0xFD"
            },
            "meta": {
              "pc": "0x001377",
              "mode": "adl",
              "first": "djnz 0x001377",
              "last": "djnz 0x001377",
              "instructions": [
                "djnz 0x001377"
              ],
              "exits": [
                {
                  "type": "branch",
                  "target": "0x001377",
                  "targetMode": "adl"
                },
                {
                  "type": "fallthrough",
                  "target": "0x001379",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 7191,
            "delta": 4301,
            "steps": 7210,
            "pc": "0x001377",
            "label": "countdownLoop",
            "state": {
              "pc": "0x001377",
              "a": "0x76",
              "f": "0x42",
              "bc": "0x000F24",
              "de": "0xD1A7FC",
              "hl": "0xD18C7C",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A87E",
              "stack24": [
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x008000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x00",
              "D0058E": "0x00",
              "D00080": "0x10",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
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
              "matrix3": "0xFD"
            },
            "meta": {
              "pc": "0x001377",
              "mode": "adl",
              "first": "djnz 0x001377",
              "last": "djnz 0x001377",
              "instructions": [
                "djnz 0x001377"
              ],
              "exits": [
                {
                  "type": "branch",
                  "target": "0x001377",
                  "targetMode": "adl"
                },
                {
                  "type": "fallthrough",
                  "target": "0x001379",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 7192,
            "delta": 4302,
            "steps": 7211,
            "pc": "0x001377",
            "label": "countdownLoop",
            "state": {
              "pc": "0x001377",
              "a": "0x76",
              "f": "0x42",
              "bc": "0x000E24",
              "de": "0xD1A7FC",
              "hl": "0xD18C7C",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A87E",
              "stack24": [
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x008000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x00",
              "D0058E": "0x00",
              "D00080": "0x10",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
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
              "matrix3": "0xFD"
            },
            "meta": {
              "pc": "0x001377",
              "mode": "adl",
              "first": "djnz 0x001377",
              "last": "djnz 0x001377",
              "instructions": [
                "djnz 0x001377"
              ],
              "exits": [
                {
                  "type": "branch",
                  "target": "0x001377",
                  "targetMode": "adl"
                },
                {
                  "type": "fallthrough",
                  "target": "0x001379",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 7193,
            "delta": 4303,
            "steps": 7212,
            "pc": "0x001377",
            "label": "countdownLoop",
            "state": {
              "pc": "0x001377",
              "a": "0x76",
              "f": "0x42",
              "bc": "0x000D24",
              "de": "0xD1A7FC",
              "hl": "0xD18C7C",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A87E",
              "stack24": [
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x008000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x00",
              "D0058E": "0x00",
              "D00080": "0x10",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
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
              "matrix3": "0xFD"
            },
            "meta": {
              "pc": "0x001377",
              "mode": "adl",
              "first": "djnz 0x001377",
              "last": "djnz 0x001377",
              "instructions": [
                "djnz 0x001377"
              ],
              "exits": [
                {
                  "type": "branch",
                  "target": "0x001377",
                  "targetMode": "adl"
                },
                {
                  "type": "fallthrough",
                  "target": "0x001379",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 7194,
            "delta": 4304,
            "steps": 7213,
            "pc": "0x001377",
            "label": "countdownLoop",
            "state": {
              "pc": "0x001377",
              "a": "0x76",
              "f": "0x42",
              "bc": "0x000C24",
              "de": "0xD1A7FC",
              "hl": "0xD18C7C",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A87E",
              "stack24": [
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x008000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x00",
              "D0058E": "0x00",
              "D00080": "0x10",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
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
              "matrix3": "0xFD"
            },
            "meta": {
              "pc": "0x001377",
              "mode": "adl",
              "first": "djnz 0x001377",
              "last": "djnz 0x001377",
              "instructions": [
                "djnz 0x001377"
              ],
              "exits": [
                {
                  "type": "branch",
                  "target": "0x001377",
                  "targetMode": "adl"
                },
                {
                  "type": "fallthrough",
                  "target": "0x001379",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 7195,
            "delta": 4305,
            "steps": 7214,
            "pc": "0x001377",
            "label": "countdownLoop",
            "state": {
              "pc": "0x001377",
              "a": "0x76",
              "f": "0x42",
              "bc": "0x000B24",
              "de": "0xD1A7FC",
              "hl": "0xD18C7C",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A87E",
              "stack24": [
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x008000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x00",
              "D0058E": "0x00",
              "D00080": "0x10",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
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
              "matrix3": "0xFD"
            },
            "meta": {
              "pc": "0x001377",
              "mode": "adl",
              "first": "djnz 0x001377",
              "last": "djnz 0x001377",
              "instructions": [
                "djnz 0x001377"
              ],
              "exits": [
                {
                  "type": "branch",
                  "target": "0x001377",
                  "targetMode": "adl"
                },
                {
                  "type": "fallthrough",
                  "target": "0x001379",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 7196,
            "delta": 4306,
            "steps": 7215,
            "pc": "0x001377",
            "label": "countdownLoop",
            "state": {
              "pc": "0x001377",
              "a": "0x76",
              "f": "0x42",
              "bc": "0x000A24",
              "de": "0xD1A7FC",
              "hl": "0xD18C7C",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A87E",
              "stack24": [
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x008000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x00",
              "D0058E": "0x00",
              "D00080": "0x10",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
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
              "matrix3": "0xFD"
            },
            "meta": {
              "pc": "0x001377",
              "mode": "adl",
              "first": "djnz 0x001377",
              "last": "djnz 0x001377",
              "instructions": [
                "djnz 0x001377"
              ],
              "exits": [
                {
                  "type": "branch",
                  "target": "0x001377",
                  "targetMode": "adl"
                },
                {
                  "type": "fallthrough",
                  "target": "0x001379",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 7197,
            "delta": 4307,
            "steps": 7216,
            "pc": "0x001377",
            "label": "countdownLoop",
            "state": {
              "pc": "0x001377",
              "a": "0x76",
              "f": "0x42",
              "bc": "0x000924",
              "de": "0xD1A7FC",
              "hl": "0xD18C7C",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A87E",
              "stack24": [
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x008000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x00",
              "D0058E": "0x00",
              "D00080": "0x10",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
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
              "matrix3": "0xFD"
            },
            "meta": {
              "pc": "0x001377",
              "mode": "adl",
              "first": "djnz 0x001377",
              "last": "djnz 0x001377",
              "instructions": [
                "djnz 0x001377"
              ],
              "exits": [
                {
                  "type": "branch",
                  "target": "0x001377",
                  "targetMode": "adl"
                },
                {
                  "type": "fallthrough",
                  "target": "0x001379",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 7198,
            "delta": 4308,
            "steps": 7217,
            "pc": "0x001377",
            "label": "countdownLoop",
            "state": {
              "pc": "0x001377",
              "a": "0x76",
              "f": "0x42",
              "bc": "0x000824",
              "de": "0xD1A7FC",
              "hl": "0xD18C7C",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A87E",
              "stack24": [
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x008000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x00",
              "D0058E": "0x00",
              "D00080": "0x10",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
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
              "matrix3": "0xFD"
            },
            "meta": {
              "pc": "0x001377",
              "mode": "adl",
              "first": "djnz 0x001377",
              "last": "djnz 0x001377",
              "instructions": [
                "djnz 0x001377"
              ],
              "exits": [
                {
                  "type": "branch",
                  "target": "0x001377",
                  "targetMode": "adl"
                },
                {
                  "type": "fallthrough",
                  "target": "0x001379",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 7199,
            "delta": 4309,
            "steps": 7218,
            "pc": "0x001377",
            "label": "countdownLoop",
            "state": {
              "pc": "0x001377",
              "a": "0x76",
              "f": "0x42",
              "bc": "0x000724",
              "de": "0xD1A7FC",
              "hl": "0xD18C7C",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A87E",
              "stack24": [
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x008000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x00",
              "D0058E": "0x00",
              "D00080": "0x10",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
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
              "matrix3": "0xFD"
            },
            "meta": {
              "pc": "0x001377",
              "mode": "adl",
              "first": "djnz 0x001377",
              "last": "djnz 0x001377",
              "instructions": [
                "djnz 0x001377"
              ],
              "exits": [
                {
                  "type": "branch",
                  "target": "0x001377",
                  "targetMode": "adl"
                },
                {
                  "type": "fallthrough",
                  "target": "0x001379",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 7200,
            "delta": 4310,
            "steps": 7219,
            "pc": "0x001377",
            "label": "countdownLoop",
            "state": {
              "pc": "0x001377",
              "a": "0x76",
              "f": "0x42",
              "bc": "0x000624",
              "de": "0xD1A7FC",
              "hl": "0xD18C7C",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A87E",
              "stack24": [
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x008000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x00",
              "D0058E": "0x00",
              "D00080": "0x10",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
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
              "matrix3": "0xFD"
            },
            "meta": {
              "pc": "0x001377",
              "mode": "adl",
              "first": "djnz 0x001377",
              "last": "djnz 0x001377",
              "instructions": [
                "djnz 0x001377"
              ],
              "exits": [
                {
                  "type": "branch",
                  "target": "0x001377",
                  "targetMode": "adl"
                },
                {
                  "type": "fallthrough",
                  "target": "0x001379",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 7201,
            "delta": 4311,
            "steps": 7220,
            "pc": "0x001377",
            "label": "countdownLoop",
            "state": {
              "pc": "0x001377",
              "a": "0x76",
              "f": "0x42",
              "bc": "0x000524",
              "de": "0xD1A7FC",
              "hl": "0xD18C7C",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A87E",
              "stack24": [
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x008000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x00",
              "D0058E": "0x00",
              "D00080": "0x10",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
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
              "matrix3": "0xFD"
            },
            "meta": {
              "pc": "0x001377",
              "mode": "adl",
              "first": "djnz 0x001377",
              "last": "djnz 0x001377",
              "instructions": [
                "djnz 0x001377"
              ],
              "exits": [
                {
                  "type": "branch",
                  "target": "0x001377",
                  "targetMode": "adl"
                },
                {
                  "type": "fallthrough",
                  "target": "0x001379",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 7202,
            "delta": 4312,
            "steps": 7221,
            "pc": "0x001377",
            "label": "countdownLoop",
            "state": {
              "pc": "0x001377",
              "a": "0x76",
              "f": "0x42",
              "bc": "0x000424",
              "de": "0xD1A7FC",
              "hl": "0xD18C7C",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A87E",
              "stack24": [
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x008000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x00",
              "D0058E": "0x00",
              "D00080": "0x10",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
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
              "matrix3": "0xFD"
            },
            "meta": {
              "pc": "0x001377",
              "mode": "adl",
              "first": "djnz 0x001377",
              "last": "djnz 0x001377",
              "instructions": [
                "djnz 0x001377"
              ],
              "exits": [
                {
                  "type": "branch",
                  "target": "0x001377",
                  "targetMode": "adl"
                },
                {
                  "type": "fallthrough",
                  "target": "0x001379",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 7203,
            "delta": 4313,
            "steps": 7222,
            "pc": "0x001377",
            "label": "countdownLoop",
            "state": {
              "pc": "0x001377",
              "a": "0x76",
              "f": "0x42",
              "bc": "0x000324",
              "de": "0xD1A7FC",
              "hl": "0xD18C7C",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A87E",
              "stack24": [
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x008000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x00",
              "D0058E": "0x00",
              "D00080": "0x10",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
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
              "matrix3": "0xFD"
            },
            "meta": {
              "pc": "0x001377",
              "mode": "adl",
              "first": "djnz 0x001377",
              "last": "djnz 0x001377",
              "instructions": [
                "djnz 0x001377"
              ],
              "exits": [
                {
                  "type": "branch",
                  "target": "0x001377",
                  "targetMode": "adl"
                },
                {
                  "type": "fallthrough",
                  "target": "0x001379",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 7204,
            "delta": 4314,
            "steps": 7223,
            "pc": "0x001377",
            "label": "countdownLoop",
            "state": {
              "pc": "0x001377",
              "a": "0x76",
              "f": "0x42",
              "bc": "0x000224",
              "de": "0xD1A7FC",
              "hl": "0xD18C7C",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A87E",
              "stack24": [
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x008000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x00",
              "D0058E": "0x00",
              "D00080": "0x10",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
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
              "matrix3": "0xFD"
            },
            "meta": {
              "pc": "0x001377",
              "mode": "adl",
              "first": "djnz 0x001377",
              "last": "djnz 0x001377",
              "instructions": [
                "djnz 0x001377"
              ],
              "exits": [
                {
                  "type": "branch",
                  "target": "0x001377",
                  "targetMode": "adl"
                },
                {
                  "type": "fallthrough",
                  "target": "0x001379",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 7205,
            "delta": 4315,
            "steps": 7224,
            "pc": "0x001377",
            "label": "countdownLoop",
            "state": {
              "pc": "0x001377",
              "a": "0x76",
              "f": "0x42",
              "bc": "0x000124",
              "de": "0xD1A7FC",
              "hl": "0xD18C7C",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A87E",
              "stack24": [
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x008000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x00",
              "D0058E": "0x00",
              "D00080": "0x10",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
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
              "matrix3": "0xFD"
            },
            "meta": {
              "pc": "0x001377",
              "mode": "adl",
              "first": "djnz 0x001377",
              "last": "djnz 0x001377",
              "instructions": [
                "djnz 0x001377"
              ],
              "exits": [
                {
                  "type": "branch",
                  "target": "0x001377",
                  "targetMode": "adl"
                },
                {
                  "type": "fallthrough",
                  "target": "0x001379",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 7206,
            "delta": 4316,
            "steps": 7225,
            "pc": "0x001379",
            "label": "port3Read",
            "state": {
              "pc": "0x001379",
              "a": "0x76",
              "f": "0x42",
              "bc": "0x000024",
              "de": "0xD1A7FC",
              "hl": "0xD18C7C",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A87E",
              "stack24": [
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x008000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x00",
              "D0058E": "0x00",
              "D00080": "0x10",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
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
              "matrix3": "0xFD"
            },
            "meta": {
              "pc": "0x001379",
              "mode": "adl",
              "first": "in0 a, (0x03)",
              "last": "jr z, 0x00138a",
              "instructions": [
                "in0 a, (0x03)",
                "bit 4, a",
                "jr z, 0x00138a"
              ],
              "exits": [
                {
                  "type": "branch",
                  "target": "0x00138A",
                  "targetMode": "adl"
                },
                {
                  "type": "fallthrough",
                  "target": "0x001380",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 7207,
            "delta": 4317,
            "steps": 7226,
            "pc": "0x00138A",
            "label": "port3PostRead",
            "state": {
              "pc": "0x00138A",
              "a": "0xEE",
              "f": "0x54",
              "bc": "0x000024",
              "de": "0xD1A7FC",
              "hl": "0xD18C7C",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A87E",
              "stack24": [
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x008000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x00",
              "D0058E": "0x00",
              "D00080": "0x10",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
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
              "matrix3": "0xFD"
            },
            "meta": {
              "pc": "0x00138A",
              "mode": "adl",
              "first": "ld a, 0x26",
              "last": "jr nz, 0x00139c",
              "instructions": [
                "ld a, 0x26",
                "out0 (0x05), a",
                "cp 0x26",
                "jr nz, 0x00139c"
              ],
              "exits": [
                {
                  "type": "branch",
                  "target": "0x00139C",
                  "targetMode": "adl"
                },
                {
                  "type": "fallthrough",
                  "target": "0x001393",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 7208,
            "delta": 4318,
            "steps": 7227,
            "pc": "0x001393",
            "label": "port3Prep",
            "state": {
              "pc": "0x001393",
              "a": "0x26",
              "f": "0x42",
              "bc": "0x000024",
              "de": "0xD1A7FC",
              "hl": "0xD18C7C",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A87E",
              "stack24": [
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x008000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x00",
              "D0058E": "0x00",
              "D00080": "0x10",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
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
              "matrix3": "0xFD"
            },
            "meta": {
              "pc": "0x001393",
              "mode": "adl",
              "first": "ld a, 0x03",
              "last": "jr z, 0x00139d",
              "instructions": [
                "ld a, 0x03",
                "out0 (0x06), a",
                "cp 0x03",
                "jr z, 0x00139d"
              ],
              "exits": [
                {
                  "type": "branch",
                  "target": "0x00139D",
                  "targetMode": "adl"
                },
                {
                  "type": "fallthrough",
                  "target": "0x00139C",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 7209,
            "delta": 4319,
            "steps": 7228,
            "pc": "0x00139D",
            "label": "wrapperSetup",
            "state": {
              "pc": "0x00139D",
              "a": "0x03",
              "f": "0x42",
              "bc": "0x000024",
              "de": "0xD1A7FC",
              "hl": "0xD18C7C",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A87E",
              "stack24": [
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x008000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x00",
              "D0058E": "0x00",
              "D00080": "0x10",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
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
              "matrix3": "0xFD"
            },
            "meta": {
              "pc": "0x00139D",
              "mode": "adl",
              "first": "ld bc, 0x00a000",
              "last": "jr nz, 0x00139c",
              "instructions": [
                "ld bc, 0x00a000",
                "xor a",
                "out (c), a",
                "inc c",
                "ld a, 0x0f",
                "out (c), a",
                "inc c",
                "xor a",
                "out (c), a",
                "inc c",
                "ld a, 0x0f",
                "out (c), a",
                "inc c",
                "ld a, 0x08",
                "out (c), a",
                "inc c"
              ],
              "exits": [
                {
                  "type": "branch",
                  "target": "0x00139C",
                  "targetMode": "adl"
                },
                {
                  "type": "fallthrough",
                  "target": "0x0013C3",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 7210,
            "delta": 4320,
            "steps": 7229,
            "pc": "0x0013C3",
            "label": "wrapperCall",
            "state": {
              "pc": "0x0013C3",
              "a": "0x08",
              "f": "0x42",
              "bc": "0x00A005",
              "de": "0xD1A7FC",
              "hl": "0x000000",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A87E",
              "stack24": [
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x008000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x00",
              "D0058E": "0x00",
              "D00080": "0x10",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
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
              "matrix3": "0xFD"
            },
            "meta": {
              "pc": "0x0013C3",
              "mode": "adl",
              "first": "call 0x001988",
              "last": "call 0x001988",
              "instructions": [
                "call 0x001988"
              ],
              "exits": [
                {
                  "type": "call",
                  "target": "0x001988",
                  "targetMode": "adl"
                },
                {
                  "type": "call-return",
                  "target": "0x0013C7",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 7211,
            "delta": 4321,
            "steps": 7230,
            "pc": "0x001988",
            "label": "helperEntry",
            "state": {
              "pc": "0x001988",
              "a": "0x08",
              "f": "0x42",
              "bc": "0x00A005",
              "de": "0xD1A7FC",
              "hl": "0x000000",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A87B",
              "stack24": [
                "0x0013C7",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x00",
              "D0058E": "0x00",
              "D00080": "0x10",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
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
              "matrix3": "0xFD"
            },
            "meta": {
              "pc": "0x001988",
              "mode": "adl",
              "first": "di",
              "last": "jr nz, 0x0019a9",
              "instructions": [
                "di",
                "push bc",
                "in0 a, (0x03)",
                "bit 4, a",
                "jr nz, 0x0019a9"
              ],
              "exits": [
                {
                  "type": "branch",
                  "target": "0x0019A9",
                  "targetMode": "adl"
                },
                {
                  "type": "fallthrough",
                  "target": "0x001991",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 7212,
            "delta": 4322,
            "steps": 7231,
            "pc": "0x001991",
            "label": "helperStackSave",
            "state": {
              "pc": "0x001991",
              "a": "0xEE",
              "f": "0x54",
              "bc": "0x00A005",
              "de": "0xD1A7FC",
              "hl": "0x000000",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A878",
              "stack24": [
                "0x00A005",
                "0x0013C7",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x00",
              "D0058E": "0x00",
              "D00080": "0x10",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
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
              "matrix3": "0xFD"
            },
            "meta": {
              "pc": "0x001991",
              "mode": "adl",
              "first": "ld bc, 0x001005",
              "last": "jr z, 0x00199e",
              "instructions": [
                "ld bc, 0x001005",
                "ld a, 0x04",
                "out (c), a",
                "cp 0x04",
                "jr z, 0x00199e"
              ],
              "exits": [
                {
                  "type": "branch",
                  "target": "0x00199E",
                  "targetMode": "adl"
                },
                {
                  "type": "fallthrough",
                  "target": "0x00199D",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 7213,
            "delta": 4323,
            "steps": 7232,
            "pc": "0x00199E",
            "label": "helperLoadB",
            "state": {
              "pc": "0x00199E",
              "a": "0x04",
              "f": "0x42",
              "bc": "0x001005",
              "de": "0xD1A7FC",
              "hl": "0x000000",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A878",
              "stack24": [
                "0x00A005",
                "0x0013C7",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x00",
              "D0058E": "0x00",
              "D00080": "0x10",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
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
              "matrix3": "0xFD"
            },
            "meta": {
              "pc": "0x00199E",
              "mode": "adl",
              "first": "ld a, b",
              "last": "jr z, 0x0019a4",
              "instructions": [
                "ld a, b",
                "cp 0x10",
                "jr z, 0x0019a4"
              ],
              "exits": [
                {
                  "type": "branch",
                  "target": "0x0019A4",
                  "targetMode": "adl"
                },
                {
                  "type": "fallthrough",
                  "target": "0x0019A3",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 7214,
            "delta": 4324,
            "steps": 7233,
            "pc": "0x0019A4",
            "label": "helperLoadC",
            "state": {
              "pc": "0x0019A4",
              "a": "0x10",
              "f": "0x42",
              "bc": "0x001005",
              "de": "0xD1A7FC",
              "hl": "0x000000",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A878",
              "stack24": [
                "0x00A005",
                "0x0013C7",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x00",
              "D0058E": "0x00",
              "D00080": "0x10",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
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
              "matrix3": "0xFD"
            },
            "meta": {
              "pc": "0x0019A4",
              "mode": "adl",
              "first": "ld a, c",
              "last": "jr nz, 0x0019a3",
              "instructions": [
                "ld a, c",
                "cp 0x05",
                "jr nz, 0x0019a3"
              ],
              "exits": [
                {
                  "type": "branch",
                  "target": "0x0019A3",
                  "targetMode": "adl"
                },
                {
                  "type": "fallthrough",
                  "target": "0x0019A9",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 7215,
            "delta": 4325,
            "steps": 7234,
            "pc": "0x0019A9",
            "label": "helperPortSelect",
            "state": {
              "pc": "0x0019A9",
              "a": "0x05",
              "f": "0x42",
              "bc": "0x001005",
              "de": "0xD1A7FC",
              "hl": "0x000000",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A878",
              "stack24": [
                "0x00A005",
                "0x0013C7",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x00",
              "D0058E": "0x00",
              "D00080": "0x10",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
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
              "matrix3": "0xFD"
            },
            "meta": {
              "pc": "0x0019A9",
              "mode": "adl",
              "first": "ld a, 0x03",
              "last": "jr z, 0x0019b3",
              "instructions": [
                "ld a, 0x03",
                "out0 (0x01), a",
                "cp 0x03",
                "jr z, 0x0019b3"
              ],
              "exits": [
                {
                  "type": "branch",
                  "target": "0x0019B3",
                  "targetMode": "adl"
                },
                {
                  "type": "fallthrough",
                  "target": "0x0019B2",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 7216,
            "delta": 4326,
            "steps": 7235,
            "pc": "0x0019B3",
            "label": "helperDynamicReturn",
            "state": {
              "pc": "0x0019B3",
              "a": "0x03",
              "f": "0x42",
              "bc": "0x001005",
              "de": "0xD1A7FC",
              "hl": "0x000000",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A878",
              "stack24": [
                "0x00A005",
                "0x0013C7",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x00",
              "D0058E": "0x00",
              "D00080": "0x10",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
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
              "matrix3": "0xFD"
            },
            "meta": {
              "pc": "0x0019B3",
              "mode": "adl",
              "first": "pop bc",
              "last": "ret",
              "instructions": [
                "pop bc",
                "ret"
              ],
              "exits": [
                {
                  "type": "return",
                  "target": null,
                  "targetMode": null
                }
              ]
            }
          },
          {
            "block": 7217,
            "delta": 4327,
            "steps": 7236,
            "pc": "0x0013C7",
            "label": "wrapperResume",
            "state": {
              "pc": "0x0013C7",
              "a": "0x03",
              "f": "0x42",
              "bc": "0x00A005",
              "de": "0xD1A7FC",
              "hl": "0x000000",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A87E",
              "stack24": [
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x008000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x00",
              "D0058E": "0x00",
              "D00080": "0x10",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
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
              "matrix3": "0xFD"
            },
            "meta": {
              "pc": "0x0013C7",
              "mode": "adl",
              "first": "ld a, 0xd0",
              "last": "call 0x0158de",
              "instructions": [
                "ld a, 0xd0",
                "??? tag=ld-mb-a",
                "im 1",
                "ld iy, 0xd00080",
                "res 6, (iy+27)",
                "call 0x0158de"
              ],
              "exits": [
                {
                  "type": "call",
                  "target": "0x0158DE",
                  "targetMode": "adl"
                },
                {
                  "type": "call-return",
                  "target": "0x0013DA",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 7218,
            "delta": 4328,
            "steps": 7237,
            "pc": "0x0158DE",
            "label": "preOwnerFlagGate",
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
                "0x000000",
                "0x000000",
                "0x000000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x00",
              "D0058E": "0x00",
              "D00080": "0x10",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
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
              "matrix3": "0xFD"
            },
            "meta": {
              "pc": "0x0158DE",
              "mode": "adl",
              "first": "ld iy, 0xd00080",
              "last": "ret nz",
              "instructions": [
                "ld iy, 0xd00080",
                "bit 7, (iy+66)",
                "ret nz"
              ],
              "exits": [
                {
                  "type": "return-conditional",
                  "target": null,
                  "targetMode": null
                },
                {
                  "type": "fallthrough",
                  "target": "0x0158E8",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 7219,
            "delta": 4329,
            "steps": 7238,
            "pc": "0x0158E8",
            "label": "preOwnerCall",
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
                "0x000000",
                "0x000000",
                "0x000000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x00",
              "D0058E": "0x00",
              "D00080": "0x10",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
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
              "matrix3": "0xFD"
            },
            "meta": {
              "pc": "0x0158E8",
              "mode": "adl",
              "first": "call 0x0158bc",
              "last": "call 0x0158bc",
              "instructions": [
                "call 0x0158bc"
              ],
              "exits": [
                {
                  "type": "call",
                  "target": "0x0158BC",
                  "targetMode": "adl"
                },
                {
                  "type": "call-return",
                  "target": "0x0158EC",
                  "targetMode": "adl"
                }
              ]
            }
          }
        ],
        "recentDynamicTargets": [
          {
            "block": 6687,
            "delta": 3797,
            "steps": 6706,
            "fromPc": "0x0021C2",
            "target": "0x02B175",
            "mode": "adl"
          },
          {
            "block": 6698,
            "delta": 3808,
            "steps": 6717,
            "fromPc": "0x002197",
            "target": "0x0BCB37",
            "mode": "adl"
          },
          {
            "block": 6699,
            "delta": 3809,
            "steps": 6718,
            "fromPc": "0x0BCB37",
            "target": "0x02B31D",
            "mode": "adl"
          },
          {
            "block": 6715,
            "delta": 3825,
            "steps": 6735,
            "fromPc": "0x0008BB",
            "target": "0x001717",
            "mode": "adl"
          },
          {
            "block": 6726,
            "delta": 3836,
            "steps": 6746,
            "fromPc": "0x001CE5",
            "target": "0x001C54",
            "mode": "adl"
          },
          {
            "block": 6727,
            "delta": 3837,
            "steps": 6747,
            "fromPc": "0x001C54",
            "target": "0x006808",
            "mode": "adl"
          },
          {
            "block": 6737,
            "delta": 3847,
            "steps": 6757,
            "fromPc": "0x001CE4",
            "target": "0x001C81",
            "mode": "adl"
          },
          {
            "block": 6739,
            "delta": 3849,
            "steps": 6759,
            "fromPc": "0x001C82",
            "target": "0x001C48",
            "mode": "adl"
          },
          {
            "block": 6749,
            "delta": 3859,
            "steps": 6769,
            "fromPc": "0x001CE4",
            "target": "0x001C81",
            "mode": "adl"
          },
          {
            "block": 6751,
            "delta": 3861,
            "steps": 6771,
            "fromPc": "0x001C82",
            "target": "0x001C48",
            "mode": "adl"
          },
          {
            "block": 6761,
            "delta": 3871,
            "steps": 6781,
            "fromPc": "0x001CE4",
            "target": "0x001C81",
            "mode": "adl"
          },
          {
            "block": 6763,
            "delta": 3873,
            "steps": 6783,
            "fromPc": "0x001C82",
            "target": "0x001C48",
            "mode": "adl"
          },
          {
            "block": 6773,
            "delta": 3883,
            "steps": 6793,
            "fromPc": "0x001CE4",
            "target": "0x001C81",
            "mode": "adl"
          },
          {
            "block": 6775,
            "delta": 3885,
            "steps": 6795,
            "fromPc": "0x001C82",
            "target": "0x001C48",
            "mode": "adl"
          },
          {
            "block": 6780,
            "delta": 3890,
            "steps": 6800,
            "fromPc": "0x001C42",
            "target": "0x006810",
            "mode": "adl"
          },
          {
            "block": 6787,
            "delta": 3897,
            "steps": 6807,
            "fromPc": "0x001CE4",
            "target": "0x001C54",
            "mode": "adl"
          },
          {
            "block": 6788,
            "delta": 3898,
            "steps": 6808,
            "fromPc": "0x001C54",
            "target": "0x006816",
            "mode": "adl"
          },
          {
            "block": 6791,
            "delta": 3901,
            "steps": 6811,
            "fromPc": "0x006828",
            "target": "0x001727",
            "mode": "adl"
          },
          {
            "block": 6792,
            "delta": 3902,
            "steps": 6812,
            "fromPc": "0x001727",
            "target": "0x000719",
            "mode": "adl"
          },
          {
            "block": 6842,
            "delta": 3952,
            "steps": 6862,
            "fromPc": "0x003D45",
            "target": "0x03F998",
            "mode": "adl"
          },
          {
            "block": 6850,
            "delta": 3960,
            "steps": 6870,
            "fromPc": "0x03F9C2",
            "target": "0x03D058",
            "mode": "adl"
          },
          {
            "block": 6852,
            "delta": 3962,
            "steps": 6872,
            "fromPc": "0x05C623",
            "target": "0x03D060",
            "mode": "adl"
          },
          {
            "block": 6854,
            "delta": 3964,
            "steps": 6874,
            "fromPc": "0x03D0E0",
            "target": "0x000000",
            "mode": "adl"
          },
          {
            "block": 7216,
            "delta": 4326,
            "steps": 7236,
            "fromPc": "0x0019B3",
            "target": "0x0013C7",
            "mode": "adl"
          }
        ]
      },
      "branchSummary": {
        "variant": "clear-ram-at-deposit-while-held-stop-owner",
        "countdownBlocks": 82,
        "countdownFirstBC": "0x005224",
        "countdownLastBC": "0x000124",
        "fallthroughBC": "0x000024",
        "port3Input": "0xEE",
        "port3PostFlags": "0x54",
        "wrapperCallState": {
          "pc": "0x0013C3",
          "a": "0x08",
          "f": "0x42",
          "bc": "0x00A005",
          "de": "0xD1A7FC",
          "hl": "0x000000",
          "ix": "0x000000",
          "iy": "0x3B001A",
          "sp": "0xD1A87E",
          "stack24": [
            "0x000000",
            "0x000000",
            "0x000000",
            "0x000000",
            "0x000000",
            "0x008000"
          ],
          "errSp": "0xD1A863",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x10",
          "D0009B": "0x00",
          "D0009F": "0x00",
          "D000A3": "0x0A",
          "D000C2": "0x00",
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
          "matrix3": "0xFD"
        },
        "helperEntryStack": [
          "0x0013C7",
          "0x000000",
          "0x000000"
        ],
        "helperReturnState": {
          "pc": "0x0019B3",
          "a": "0x03",
          "f": "0x42",
          "bc": "0x001005",
          "de": "0xD1A7FC",
          "hl": "0x000000",
          "ix": "0x000000",
          "iy": "0x3B001A",
          "sp": "0xD1A878",
          "stack24": [
            "0x00A005",
            "0x0013C7",
            "0x000000",
            "0x000000",
            "0x000000",
            "0x000000"
          ],
          "errSp": "0xD1A863",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x10",
          "D0009B": "0x00",
          "D0009F": "0x00",
          "D000A3": "0x0A",
          "D000C2": "0x00",
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
          "matrix3": "0xFD"
        },
        "wrapperResumeState": {
          "pc": "0x0013C7",
          "a": "0x03",
          "f": "0x42",
          "bc": "0x00A005",
          "de": "0xD1A7FC",
          "hl": "0x000000",
          "ix": "0x000000",
          "iy": "0x3B001A",
          "sp": "0xD1A87E",
          "stack24": [
            "0x000000",
            "0x000000",
            "0x000000",
            "0x000000",
            "0x000000",
            "0x008000"
          ],
          "errSp": "0xD1A863",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x10",
          "D0009B": "0x00",
          "D0009F": "0x00",
          "D000A3": "0x0A",
          "D000C2": "0x00",
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
          "matrix3": "0xFD"
        },
        "d000c2At0158DE": "0x00",
        "d000c2Bit7Clear": true,
        "preOwnerStack": [
          "0x0013DA",
          "0x000000",
          "0x000000"
        ],
        "ownerStack": [
          "0x0158EC",
          "0x0013DA",
          "0x000000"
        ]
      },
      "wrapperPath": [
        {
          "block": 7124,
          "delta": 4234,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x005224",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 7125,
          "delta": 4235,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x005124",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 7126,
          "delta": 4236,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x005024",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 7127,
          "delta": 4237,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x004F24",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 7128,
          "delta": 4238,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x004E24",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 7129,
          "delta": 4239,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x004D24",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 7130,
          "delta": 4240,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x004C24",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 7131,
          "delta": 4241,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x004B24",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 7132,
          "delta": 4242,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x004A24",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 7133,
          "delta": 4243,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x004924",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 7134,
          "delta": 4244,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x004824",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 7135,
          "delta": 4245,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x004724",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 7136,
          "delta": 4246,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x004624",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 7137,
          "delta": 4247,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x004524",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 7138,
          "delta": 4248,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x004424",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 7139,
          "delta": 4249,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x004324",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 7140,
          "delta": 4250,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x004224",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 7141,
          "delta": 4251,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x004124",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 7142,
          "delta": 4252,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x004024",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 7143,
          "delta": 4253,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x003F24",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 7144,
          "delta": 4254,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x003E24",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 7145,
          "delta": 4255,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x003D24",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 7146,
          "delta": 4256,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x003C24",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 7147,
          "delta": 4257,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x003B24",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 7148,
          "delta": 4258,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x003A24",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 7149,
          "delta": 4259,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x003924",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 7150,
          "delta": 4260,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x003824",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 7151,
          "delta": 4261,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x003724",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 7152,
          "delta": 4262,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x003624",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 7153,
          "delta": 4263,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x003524",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 7154,
          "delta": 4264,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x003424",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 7155,
          "delta": 4265,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x003324",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 7156,
          "delta": 4266,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x003224",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 7157,
          "delta": 4267,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x003124",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 7158,
          "delta": 4268,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x003024",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 7159,
          "delta": 4269,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x002F24",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 7160,
          "delta": 4270,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x002E24",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 7161,
          "delta": 4271,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x002D24",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 7162,
          "delta": 4272,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x002C24",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 7163,
          "delta": 4273,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x002B24",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 7164,
          "delta": 4274,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x002A24",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 7165,
          "delta": 4275,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x002924",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 7166,
          "delta": 4276,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x002824",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 7167,
          "delta": 4277,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x002724",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 7168,
          "delta": 4278,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x002624",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 7169,
          "delta": 4279,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x002524",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 7170,
          "delta": 4280,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x002424",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 7171,
          "delta": 4281,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x002324",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 7172,
          "delta": 4282,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x002224",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 7173,
          "delta": 4283,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x002124",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 7174,
          "delta": 4284,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x002024",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 7175,
          "delta": 4285,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x001F24",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 7176,
          "delta": 4286,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x001E24",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 7177,
          "delta": 4287,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x001D24",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 7178,
          "delta": 4288,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x001C24",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 7179,
          "delta": 4289,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x001B24",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 7180,
          "delta": 4290,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x001A24",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 7181,
          "delta": 4291,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x001924",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 7182,
          "delta": 4292,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x001824",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 7183,
          "delta": 4293,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x001724",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 7184,
          "delta": 4294,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x001624",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 7185,
          "delta": 4295,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x001524",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 7186,
          "delta": 4296,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x001424",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 7187,
          "delta": 4297,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x001324",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 7188,
          "delta": 4298,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x001224",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 7189,
          "delta": 4299,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x001124",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 7190,
          "delta": 4300,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x001024",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 7191,
          "delta": 4301,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x000F24",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 7192,
          "delta": 4302,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x000E24",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 7193,
          "delta": 4303,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x000D24",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 7194,
          "delta": 4304,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x000C24",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 7195,
          "delta": 4305,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x000B24",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 7196,
          "delta": 4306,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x000A24",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 7197,
          "delta": 4307,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x000924",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 7198,
          "delta": 4308,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x000824",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 7199,
          "delta": 4309,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x000724",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 7200,
          "delta": 4310,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x000624",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 7201,
          "delta": 4311,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x000524",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 7202,
          "delta": 4312,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x000424",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 7203,
          "delta": 4313,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x000324",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 7204,
          "delta": 4314,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x000224",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 7205,
          "delta": 4315,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x000124",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 7206,
          "delta": 4316,
          "pc": "0x001379",
          "first": "in0 a, (0x03)",
          "last": "jr z, 0x00138a",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x000024",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 7207,
          "delta": 4317,
          "pc": "0x00138A",
          "first": "ld a, 0x26",
          "last": "jr nz, 0x00139c",
          "state": {
            "a": "0xEE",
            "f": "0x54",
            "bc": "0x000024",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 7208,
          "delta": 4318,
          "pc": "0x001393",
          "first": "ld a, 0x03",
          "last": "jr z, 0x00139d",
          "state": {
            "a": "0x26",
            "f": "0x42",
            "bc": "0x000024",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 7209,
          "delta": 4319,
          "pc": "0x00139D",
          "first": "ld bc, 0x00a000",
          "last": "jr nz, 0x00139c",
          "state": {
            "a": "0x03",
            "f": "0x42",
            "bc": "0x000024",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 7210,
          "delta": 4320,
          "pc": "0x0013C3",
          "first": "call 0x001988",
          "last": "call 0x001988",
          "state": {
            "a": "0x08",
            "f": "0x42",
            "bc": "0x00A005",
            "hl": "0x000000",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 7211,
          "delta": 4321,
          "pc": "0x001988",
          "first": "di",
          "last": "jr nz, 0x0019a9",
          "state": {
            "a": "0x08",
            "f": "0x42",
            "bc": "0x00A005",
            "hl": "0x000000",
            "iy": "0x3B001A",
            "sp": "0xD1A87B",
            "stack24": [
              "0x0013C7",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 7212,
          "delta": 4322,
          "pc": "0x001991",
          "first": "ld bc, 0x001005",
          "last": "jr z, 0x00199e",
          "state": {
            "a": "0xEE",
            "f": "0x54",
            "bc": "0x00A005",
            "hl": "0x000000",
            "iy": "0x3B001A",
            "sp": "0xD1A878",
            "stack24": [
              "0x00A005",
              "0x0013C7",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 7213,
          "delta": 4323,
          "pc": "0x00199E",
          "first": "ld a, b",
          "last": "jr z, 0x0019a4",
          "state": {
            "a": "0x04",
            "f": "0x42",
            "bc": "0x001005",
            "hl": "0x000000",
            "iy": "0x3B001A",
            "sp": "0xD1A878",
            "stack24": [
              "0x00A005",
              "0x0013C7",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 7214,
          "delta": 4324,
          "pc": "0x0019A4",
          "first": "ld a, c",
          "last": "jr nz, 0x0019a3",
          "state": {
            "a": "0x10",
            "f": "0x42",
            "bc": "0x001005",
            "hl": "0x000000",
            "iy": "0x3B001A",
            "sp": "0xD1A878",
            "stack24": [
              "0x00A005",
              "0x0013C7",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 7215,
          "delta": 4325,
          "pc": "0x0019A9",
          "first": "ld a, 0x03",
          "last": "jr z, 0x0019b3",
          "state": {
            "a": "0x05",
            "f": "0x42",
            "bc": "0x001005",
            "hl": "0x000000",
            "iy": "0x3B001A",
            "sp": "0xD1A878",
            "stack24": [
              "0x00A005",
              "0x0013C7",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 7216,
          "delta": 4326,
          "pc": "0x0019B3",
          "first": "pop bc",
          "last": "ret",
          "state": {
            "a": "0x03",
            "f": "0x42",
            "bc": "0x001005",
            "hl": "0x000000",
            "iy": "0x3B001A",
            "sp": "0xD1A878",
            "stack24": [
              "0x00A005",
              "0x0013C7",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 7217,
          "delta": 4327,
          "pc": "0x0013C7",
          "first": "ld a, 0xd0",
          "last": "call 0x0158de",
          "state": {
            "a": "0x03",
            "f": "0x42",
            "bc": "0x00A005",
            "hl": "0x000000",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 7218,
          "delta": 4328,
          "pc": "0x0158DE",
          "first": "ld iy, 0xd00080",
          "last": "ret nz",
          "state": {
            "a": "0xD0",
            "f": "0x42",
            "bc": "0x00A005",
            "hl": "0x000000",
            "iy": "0xD00080",
            "sp": "0xD1A87B",
            "stack24": [
              "0x0013DA",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 7219,
          "delta": 4329,
          "pc": "0x0158E8",
          "first": "call 0x0158bc",
          "last": "call 0x0158bc",
          "state": {
            "a": "0xD0",
            "f": "0x54",
            "bc": "0x00A005",
            "hl": "0x000000",
            "iy": "0xD00080",
            "sp": "0xD1A87B",
            "stack24": [
              "0x0013DA",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        }
      ],
      "firstCleanupBlock": null,
      "firstWipeBlock": null,
      "events": [
        {
          "kind": "deposit1",
          "block": 2890,
          "delta": 0,
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
              "0x000032",
              "0x003662",
              "0x058B18"
            ],
            "errSp": "0xD1A863",
            "D00587": "0x1A",
            "D0058C": "0x90",
            "D0058D": "0x1A",
            "D0058E": "0x90",
            "D00080": "0x18",
            "D0009B": "0x00",
            "D0009F": "0x00",
            "D000A3": "0x0A",
            "D000C2": "0x00",
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
            "matrix3": "0xFD"
          }
        },
        {
          "kind": "clear-key-ram",
          "block": 2890,
          "delta": 0,
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
              "0x000032",
              "0x003662",
              "0x058B18"
            ],
            "errSp": "0xD1A863",
            "D00587": "0x00",
            "D0058C": "0x00",
            "D0058D": "0x00",
            "D0058E": "0x00",
            "D00080": "0x10",
            "D0009B": "0x00",
            "D0009F": "0x00",
            "D000A3": "0x0A",
            "D000C2": "0x00",
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
            "matrix3": "0xFD"
          }
        },
        {
          "kind": "first-0158bc-owner-stop",
          "block": 7220,
          "delta": 4330,
          "steps": 7239,
          "pc": "0x0158BC",
          "state": {
            "pc": "0x0158BC",
            "a": "0xD0",
            "f": "0x54",
            "bc": "0x00A005",
            "de": "0xD1A7FC",
            "hl": "0x000000",
            "ix": "0x000000",
            "iy": "0xD00080",
            "sp": "0xD1A878",
            "stack24": [
              "0x0158EC",
              "0x0013DA",
              "0x000000",
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "errSp": "0xD1A863",
            "D00587": "0x00",
            "D0058C": "0x00",
            "D0058D": "0x00",
            "D0058E": "0x00",
            "D00080": "0x10",
            "D0009B": "0x00",
            "D0009F": "0x00",
            "D000A3": "0x0A",
            "D000C2": "0x00",
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
            "matrix3": "0xFD"
          }
        }
      ],
      "importantMetas": {
        "0x000038": {
          "pc": "0x000038",
          "mode": "adl",
          "first": "ex af, af'",
          "last": "jp 0x0006f3",
          "instructions": [
            "ex af, af'",
            "exx",
            "push ix",
            "push iy",
            "ld iy, 0xd00080",
            "jp 0x0006f3"
          ],
          "exits": [
            {
              "type": "jump",
              "target": "0x0006F3",
              "targetMode": "adl"
            }
          ]
        },
        "0x0585E9": {
          "pc": "0x0585E9",
          "mode": "adl",
          "first": "res 6, (iy+73)",
          "last": "call nz, 0x0239b3",
          "instructions": [
            "res 6, (iy+73)",
            "ld b, a",
            "ld a, 0x01",
            "bit 4, (iy+52)",
            "call nz, 0x0239b3"
          ],
          "exits": [
            {
              "type": "call",
              "target": "0x0239B3",
              "targetMode": "adl"
            },
            {
              "type": "call-return",
              "target": "0x0585F8",
              "targetMode": "adl"
            }
          ]
        },
        "0x058EDA": {
          "pc": "0x058EDA",
          "mode": "adl",
          "first": "cp 0xfa",
          "last": "ret nz",
          "instructions": [
            "cp 0xfa",
            "ret nz"
          ],
          "exits": [
            {
              "type": "return-conditional",
              "target": null,
              "targetMode": null
            },
            {
              "type": "fallthrough",
              "target": "0x058EDD",
              "targetMode": "adl"
            }
          ]
        },
        "0x03FA09": {
          "pc": "0x03FA09",
          "mode": "adl",
          "first": "ld hl, 0xd00587",
          "last": "jp nz, 0x03fb9a",
          "instructions": [
            "ld hl, 0xd00587",
            "di",
            "ld a, (hl)",
            "ld (hl), 0x00",
            "res 3, (iy+0)",
            "ei",
            "push af",
            "or a",
            "jp nz, 0x03fb9a"
          ],
          "exits": [
            {
              "type": "branch",
              "target": "0x03FB9A",
              "targetMode": "adl"
            },
            {
              "type": "fallthrough",
              "target": "0x03FA1C",
              "targetMode": "adl"
            }
          ]
        },
        "0x001377": {
          "pc": "0x001377",
          "mode": "adl",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "instructions": [
            "djnz 0x001377"
          ],
          "exits": [
            {
              "type": "branch",
              "target": "0x001377",
              "targetMode": "adl"
            },
            {
              "type": "fallthrough",
              "target": "0x001379",
              "targetMode": "adl"
            }
          ]
        },
        "0x001379": {
          "pc": "0x001379",
          "mode": "adl",
          "first": "in0 a, (0x03)",
          "last": "jr z, 0x00138a",
          "instructions": [
            "in0 a, (0x03)",
            "bit 4, a",
            "jr z, 0x00138a"
          ],
          "exits": [
            {
              "type": "branch",
              "target": "0x00138A",
              "targetMode": "adl"
            },
            {
              "type": "fallthrough",
              "target": "0x001380",
              "targetMode": "adl"
            }
          ]
        },
        "0x00138A": {
          "pc": "0x00138A",
          "mode": "adl",
          "first": "ld a, 0x26",
          "last": "jr nz, 0x00139c",
          "instructions": [
            "ld a, 0x26",
            "out0 (0x05), a",
            "cp 0x26",
            "jr nz, 0x00139c"
          ],
          "exits": [
            {
              "type": "branch",
              "target": "0x00139C",
              "targetMode": "adl"
            },
            {
              "type": "fallthrough",
              "target": "0x001393",
              "targetMode": "adl"
            }
          ]
        },
        "0x001393": {
          "pc": "0x001393",
          "mode": "adl",
          "first": "ld a, 0x03",
          "last": "jr z, 0x00139d",
          "instructions": [
            "ld a, 0x03",
            "out0 (0x06), a",
            "cp 0x03",
            "jr z, 0x00139d"
          ],
          "exits": [
            {
              "type": "branch",
              "target": "0x00139D",
              "targetMode": "adl"
            },
            {
              "type": "fallthrough",
              "target": "0x00139C",
              "targetMode": "adl"
            }
          ]
        },
        "0x00139D": {
          "pc": "0x00139D",
          "mode": "adl",
          "first": "ld bc, 0x00a000",
          "last": "jr nz, 0x00139c",
          "instructions": [
            "ld bc, 0x00a000",
            "xor a",
            "out (c), a",
            "inc c",
            "ld a, 0x0f",
            "out (c), a",
            "inc c",
            "xor a",
            "out (c), a",
            "inc c",
            "ld a, 0x0f",
            "out (c), a",
            "inc c",
            "ld a, 0x08",
            "out (c), a",
            "inc c"
          ],
          "exits": [
            {
              "type": "branch",
              "target": "0x00139C",
              "targetMode": "adl"
            },
            {
              "type": "fallthrough",
              "target": "0x0013C3",
              "targetMode": "adl"
            }
          ]
        },
        "0x0013C3": {
          "pc": "0x0013C3",
          "mode": "adl",
          "first": "call 0x001988",
          "last": "call 0x001988",
          "instructions": [
            "call 0x001988"
          ],
          "exits": [
            {
              "type": "call",
              "target": "0x001988",
              "targetMode": "adl"
            },
            {
              "type": "call-return",
              "target": "0x0013C7",
              "targetMode": "adl"
            }
          ]
        },
        "0x001988": {
          "pc": "0x001988",
          "mode": "adl",
          "first": "di",
          "last": "jr nz, 0x0019a9",
          "instructions": [
            "di",
            "push bc",
            "in0 a, (0x03)",
            "bit 4, a",
            "jr nz, 0x0019a9"
          ],
          "exits": [
            {
              "type": "branch",
              "target": "0x0019A9",
              "targetMode": "adl"
            },
            {
              "type": "fallthrough",
              "target": "0x001991",
              "targetMode": "adl"
            }
          ]
        },
        "0x001991": {
          "pc": "0x001991",
          "mode": "adl",
          "first": "ld bc, 0x001005",
          "last": "jr z, 0x00199e",
          "instructions": [
            "ld bc, 0x001005",
            "ld a, 0x04",
            "out (c), a",
            "cp 0x04",
            "jr z, 0x00199e"
          ],
          "exits": [
            {
              "type": "branch",
              "target": "0x00199E",
              "targetMode": "adl"
            },
            {
              "type": "fallthrough",
              "target": "0x00199D",
              "targetMode": "adl"
            }
          ]
        },
        "0x00199E": {
          "pc": "0x00199E",
          "mode": "adl",
          "first": "ld a, b",
          "last": "jr z, 0x0019a4",
          "instructions": [
            "ld a, b",
            "cp 0x10",
            "jr z, 0x0019a4"
          ],
          "exits": [
            {
              "type": "branch",
              "target": "0x0019A4",
              "targetMode": "adl"
            },
            {
              "type": "fallthrough",
              "target": "0x0019A3",
              "targetMode": "adl"
            }
          ]
        },
        "0x0019A4": {
          "pc": "0x0019A4",
          "mode": "adl",
          "first": "ld a, c",
          "last": "jr nz, 0x0019a3",
          "instructions": [
            "ld a, c",
            "cp 0x05",
            "jr nz, 0x0019a3"
          ],
          "exits": [
            {
              "type": "branch",
              "target": "0x0019A3",
              "targetMode": "adl"
            },
            {
              "type": "fallthrough",
              "target": "0x0019A9",
              "targetMode": "adl"
            }
          ]
        },
        "0x0019A9": {
          "pc": "0x0019A9",
          "mode": "adl",
          "first": "ld a, 0x03",
          "last": "jr z, 0x0019b3",
          "instructions": [
            "ld a, 0x03",
            "out0 (0x01), a",
            "cp 0x03",
            "jr z, 0x0019b3"
          ],
          "exits": [
            {
              "type": "branch",
              "target": "0x0019B3",
              "targetMode": "adl"
            },
            {
              "type": "fallthrough",
              "target": "0x0019B2",
              "targetMode": "adl"
            }
          ]
        },
        "0x0019B3": {
          "pc": "0x0019B3",
          "mode": "adl",
          "first": "pop bc",
          "last": "ret",
          "instructions": [
            "pop bc",
            "ret"
          ],
          "exits": [
            {
              "type": "return",
              "target": null,
              "targetMode": null
            }
          ]
        },
        "0x0013C7": {
          "pc": "0x0013C7",
          "mode": "adl",
          "first": "ld a, 0xd0",
          "last": "call 0x0158de",
          "instructions": [
            "ld a, 0xd0",
            "??? tag=ld-mb-a",
            "im 1",
            "ld iy, 0xd00080",
            "res 6, (iy+27)",
            "call 0x0158de"
          ],
          "exits": [
            {
              "type": "call",
              "target": "0x0158DE",
              "targetMode": "adl"
            },
            {
              "type": "call-return",
              "target": "0x0013DA",
              "targetMode": "adl"
            }
          ]
        },
        "0x0158DE": {
          "pc": "0x0158DE",
          "mode": "adl",
          "first": "ld iy, 0xd00080",
          "last": "ret nz",
          "instructions": [
            "ld iy, 0xd00080",
            "bit 7, (iy+66)",
            "ret nz"
          ],
          "exits": [
            {
              "type": "return-conditional",
              "target": null,
              "targetMode": null
            },
            {
              "type": "fallthrough",
              "target": "0x0158E8",
              "targetMode": "adl"
            }
          ]
        },
        "0x0158E8": {
          "pc": "0x0158E8",
          "mode": "adl",
          "first": "call 0x0158bc",
          "last": "call 0x0158bc",
          "instructions": [
            "call 0x0158bc"
          ],
          "exits": [
            {
              "type": "call",
              "target": "0x0158BC",
              "targetMode": "adl"
            },
            {
              "type": "call-return",
              "target": "0x0158EC",
              "targetMode": "adl"
            }
          ]
        },
        "0x0158BC": {
          "pc": "0x0158BC",
          "mode": "adl",
          "first": "ld de, 0x000330",
          "last": "call 0x001c55",
          "instructions": [
            "ld de, 0x000330",
            "call 0x001c55"
          ],
          "exits": [
            {
              "type": "call",
              "target": "0x001C55",
              "targetMode": "adl"
            },
            {
              "type": "call-return",
              "target": "0x0158C4",
              "targetMode": "adl"
            }
          ]
        }
      },
      "returnMetas": {
        "0x0158EC": {
          "pc": "0x0158EC",
          "mode": "adl",
          "first": "jr c, 0x0158f8",
          "last": "jr c, 0x0158f8",
          "instructions": [
            "jr c, 0x0158f8"
          ],
          "exits": [
            {
              "type": "branch",
              "target": "0x0158F8",
              "targetMode": "adl"
            },
            {
              "type": "fallthrough",
              "target": "0x0158EE",
              "targetMode": "adl"
            }
          ]
        },
        "0x0013DA": {
          "pc": "0x0013DA",
          "mode": "adl",
          "first": "jr z, 0x0013e4",
          "last": "jr z, 0x0013e4",
          "instructions": [
            "jr z, 0x0013e4"
          ],
          "exits": [
            {
              "type": "branch",
              "target": "0x0013E4",
              "targetMode": "adl"
            },
            {
              "type": "fallthrough",
              "target": "0x0013DC",
              "targetMode": "adl"
            }
          ]
        },
        "0x000000": {
          "pc": "0x000000",
          "mode": "adl",
          "first": "di",
          "last": "jp 0x000658",
          "instructions": [
            "di",
            "stmix",
            "jp 0x000658"
          ],
          "exits": [
            {
              "type": "jump",
              "target": "0x000658",
              "targetMode": "adl"
            }
          ]
        }
      }
    },
    {
      "name": "no-pending-no-matrix-control-stop-owner",
      "termination": "first_0158bc_owner",
      "steps": 3260,
      "depositBlock": null,
      "releaseBlock": null,
      "clearRamBlock": null,
      "firstOwnerHit": {
        "block": 3251,
        "delta": 3250,
        "steps": 3260,
        "state": {
          "pc": "0x0158BC",
          "a": "0xD0",
          "f": "0x54",
          "bc": "0x00A005",
          "de": "0xD1A7FC",
          "hl": "0x000000",
          "ix": "0x000000",
          "iy": "0xD00080",
          "sp": "0xD1A878",
          "stack24": [
            "0x0158EC",
            "0x0013DA",
            "0x000000",
            "0x000000",
            "0x000000",
            "0x000000"
          ],
          "errSp": "0xD1A863",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009B": "0x00",
          "D0009F": "0x00",
          "D000A3": "0x0A",
          "D000C2": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0xD2A83E",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02587": "0xD3A854",
          "D02590": "0xD3FE81",
          "D02593": "0xD3FE81",
          "D0259A": "0xD3FE81",
          "D0259D": "0xD3FECD",
          "buffer": "0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
          "matrix3": "0xFF"
        },
        "returnHints": [
          {
            "ret": "0x0158EC",
            "hint": "return to 0x0158EC carry gate after 0x0158BC"
          },
          {
            "ret": "0x0013DA",
            "hint": "return to low-ROM wrapper A after owner scan"
          },
          {
            "ret": "0x000000",
            "hint": ""
          },
          {
            "ret": "0x000000",
            "hint": ""
          },
          {
            "ret": "0x000000",
            "hint": ""
          },
          {
            "ret": "0x000000",
            "hint": ""
          }
        ],
        "priorRouteTail": [
          {
            "block": 3203,
            "delta": 3202,
            "steps": 3212,
            "pc": "0x001377",
            "label": "countdownLoop",
            "state": {
              "pc": "0x001377",
              "a": "0x76",
              "f": "0x42",
              "bc": "0x002224",
              "de": "0xD1A7FC",
              "hl": "0xD18C7C",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A87E",
              "stack24": [
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x008000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x00",
              "D0058E": "0x00",
              "D00080": "0x00",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
              "D0231A": "0xD2A83E",
              "D0243A": "0xD1A8CC",
              "D0243D": "0xD2A83E",
              "D02587": "0xD3A854",
              "D02590": "0xD3FE81",
              "D02593": "0xD3FE81",
              "D0259A": "0xD3FE81",
              "D0259D": "0xD3FECD",
              "buffer": "0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
              "matrix3": "0xFF"
            },
            "meta": {
              "pc": "0x001377",
              "mode": "adl",
              "first": "djnz 0x001377",
              "last": "djnz 0x001377",
              "instructions": [
                "djnz 0x001377"
              ],
              "exits": [
                {
                  "type": "branch",
                  "target": "0x001377",
                  "targetMode": "adl"
                },
                {
                  "type": "fallthrough",
                  "target": "0x001379",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 3204,
            "delta": 3203,
            "steps": 3213,
            "pc": "0x001377",
            "label": "countdownLoop",
            "state": {
              "pc": "0x001377",
              "a": "0x76",
              "f": "0x42",
              "bc": "0x002124",
              "de": "0xD1A7FC",
              "hl": "0xD18C7C",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A87E",
              "stack24": [
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x008000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x00",
              "D0058E": "0x00",
              "D00080": "0x00",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
              "D0231A": "0xD2A83E",
              "D0243A": "0xD1A8CC",
              "D0243D": "0xD2A83E",
              "D02587": "0xD3A854",
              "D02590": "0xD3FE81",
              "D02593": "0xD3FE81",
              "D0259A": "0xD3FE81",
              "D0259D": "0xD3FECD",
              "buffer": "0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
              "matrix3": "0xFF"
            },
            "meta": {
              "pc": "0x001377",
              "mode": "adl",
              "first": "djnz 0x001377",
              "last": "djnz 0x001377",
              "instructions": [
                "djnz 0x001377"
              ],
              "exits": [
                {
                  "type": "branch",
                  "target": "0x001377",
                  "targetMode": "adl"
                },
                {
                  "type": "fallthrough",
                  "target": "0x001379",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 3205,
            "delta": 3204,
            "steps": 3214,
            "pc": "0x001377",
            "label": "countdownLoop",
            "state": {
              "pc": "0x001377",
              "a": "0x76",
              "f": "0x42",
              "bc": "0x002024",
              "de": "0xD1A7FC",
              "hl": "0xD18C7C",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A87E",
              "stack24": [
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x008000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x00",
              "D0058E": "0x00",
              "D00080": "0x00",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
              "D0231A": "0xD2A83E",
              "D0243A": "0xD1A8CC",
              "D0243D": "0xD2A83E",
              "D02587": "0xD3A854",
              "D02590": "0xD3FE81",
              "D02593": "0xD3FE81",
              "D0259A": "0xD3FE81",
              "D0259D": "0xD3FECD",
              "buffer": "0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
              "matrix3": "0xFF"
            },
            "meta": {
              "pc": "0x001377",
              "mode": "adl",
              "first": "djnz 0x001377",
              "last": "djnz 0x001377",
              "instructions": [
                "djnz 0x001377"
              ],
              "exits": [
                {
                  "type": "branch",
                  "target": "0x001377",
                  "targetMode": "adl"
                },
                {
                  "type": "fallthrough",
                  "target": "0x001379",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 3206,
            "delta": 3205,
            "steps": 3215,
            "pc": "0x001377",
            "label": "countdownLoop",
            "state": {
              "pc": "0x001377",
              "a": "0x76",
              "f": "0x42",
              "bc": "0x001F24",
              "de": "0xD1A7FC",
              "hl": "0xD18C7C",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A87E",
              "stack24": [
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x008000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x00",
              "D0058E": "0x00",
              "D00080": "0x00",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
              "D0231A": "0xD2A83E",
              "D0243A": "0xD1A8CC",
              "D0243D": "0xD2A83E",
              "D02587": "0xD3A854",
              "D02590": "0xD3FE81",
              "D02593": "0xD3FE81",
              "D0259A": "0xD3FE81",
              "D0259D": "0xD3FECD",
              "buffer": "0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
              "matrix3": "0xFF"
            },
            "meta": {
              "pc": "0x001377",
              "mode": "adl",
              "first": "djnz 0x001377",
              "last": "djnz 0x001377",
              "instructions": [
                "djnz 0x001377"
              ],
              "exits": [
                {
                  "type": "branch",
                  "target": "0x001377",
                  "targetMode": "adl"
                },
                {
                  "type": "fallthrough",
                  "target": "0x001379",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 3207,
            "delta": 3206,
            "steps": 3216,
            "pc": "0x001377",
            "label": "countdownLoop",
            "state": {
              "pc": "0x001377",
              "a": "0x76",
              "f": "0x42",
              "bc": "0x001E24",
              "de": "0xD1A7FC",
              "hl": "0xD18C7C",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A87E",
              "stack24": [
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x008000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x00",
              "D0058E": "0x00",
              "D00080": "0x00",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
              "D0231A": "0xD2A83E",
              "D0243A": "0xD1A8CC",
              "D0243D": "0xD2A83E",
              "D02587": "0xD3A854",
              "D02590": "0xD3FE81",
              "D02593": "0xD3FE81",
              "D0259A": "0xD3FE81",
              "D0259D": "0xD3FECD",
              "buffer": "0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
              "matrix3": "0xFF"
            },
            "meta": {
              "pc": "0x001377",
              "mode": "adl",
              "first": "djnz 0x001377",
              "last": "djnz 0x001377",
              "instructions": [
                "djnz 0x001377"
              ],
              "exits": [
                {
                  "type": "branch",
                  "target": "0x001377",
                  "targetMode": "adl"
                },
                {
                  "type": "fallthrough",
                  "target": "0x001379",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 3208,
            "delta": 3207,
            "steps": 3217,
            "pc": "0x001377",
            "label": "countdownLoop",
            "state": {
              "pc": "0x001377",
              "a": "0x76",
              "f": "0x42",
              "bc": "0x001D24",
              "de": "0xD1A7FC",
              "hl": "0xD18C7C",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A87E",
              "stack24": [
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x008000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x00",
              "D0058E": "0x00",
              "D00080": "0x00",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
              "D0231A": "0xD2A83E",
              "D0243A": "0xD1A8CC",
              "D0243D": "0xD2A83E",
              "D02587": "0xD3A854",
              "D02590": "0xD3FE81",
              "D02593": "0xD3FE81",
              "D0259A": "0xD3FE81",
              "D0259D": "0xD3FECD",
              "buffer": "0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
              "matrix3": "0xFF"
            },
            "meta": {
              "pc": "0x001377",
              "mode": "adl",
              "first": "djnz 0x001377",
              "last": "djnz 0x001377",
              "instructions": [
                "djnz 0x001377"
              ],
              "exits": [
                {
                  "type": "branch",
                  "target": "0x001377",
                  "targetMode": "adl"
                },
                {
                  "type": "fallthrough",
                  "target": "0x001379",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 3209,
            "delta": 3208,
            "steps": 3218,
            "pc": "0x001377",
            "label": "countdownLoop",
            "state": {
              "pc": "0x001377",
              "a": "0x76",
              "f": "0x42",
              "bc": "0x001C24",
              "de": "0xD1A7FC",
              "hl": "0xD18C7C",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A87E",
              "stack24": [
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x008000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x00",
              "D0058E": "0x00",
              "D00080": "0x00",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
              "D0231A": "0xD2A83E",
              "D0243A": "0xD1A8CC",
              "D0243D": "0xD2A83E",
              "D02587": "0xD3A854",
              "D02590": "0xD3FE81",
              "D02593": "0xD3FE81",
              "D0259A": "0xD3FE81",
              "D0259D": "0xD3FECD",
              "buffer": "0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
              "matrix3": "0xFF"
            },
            "meta": {
              "pc": "0x001377",
              "mode": "adl",
              "first": "djnz 0x001377",
              "last": "djnz 0x001377",
              "instructions": [
                "djnz 0x001377"
              ],
              "exits": [
                {
                  "type": "branch",
                  "target": "0x001377",
                  "targetMode": "adl"
                },
                {
                  "type": "fallthrough",
                  "target": "0x001379",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 3210,
            "delta": 3209,
            "steps": 3219,
            "pc": "0x001377",
            "label": "countdownLoop",
            "state": {
              "pc": "0x001377",
              "a": "0x76",
              "f": "0x42",
              "bc": "0x001B24",
              "de": "0xD1A7FC",
              "hl": "0xD18C7C",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A87E",
              "stack24": [
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x008000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x00",
              "D0058E": "0x00",
              "D00080": "0x00",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
              "D0231A": "0xD2A83E",
              "D0243A": "0xD1A8CC",
              "D0243D": "0xD2A83E",
              "D02587": "0xD3A854",
              "D02590": "0xD3FE81",
              "D02593": "0xD3FE81",
              "D0259A": "0xD3FE81",
              "D0259D": "0xD3FECD",
              "buffer": "0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
              "matrix3": "0xFF"
            },
            "meta": {
              "pc": "0x001377",
              "mode": "adl",
              "first": "djnz 0x001377",
              "last": "djnz 0x001377",
              "instructions": [
                "djnz 0x001377"
              ],
              "exits": [
                {
                  "type": "branch",
                  "target": "0x001377",
                  "targetMode": "adl"
                },
                {
                  "type": "fallthrough",
                  "target": "0x001379",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 3211,
            "delta": 3210,
            "steps": 3220,
            "pc": "0x001377",
            "label": "countdownLoop",
            "state": {
              "pc": "0x001377",
              "a": "0x76",
              "f": "0x42",
              "bc": "0x001A24",
              "de": "0xD1A7FC",
              "hl": "0xD18C7C",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A87E",
              "stack24": [
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x008000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x00",
              "D0058E": "0x00",
              "D00080": "0x00",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
              "D0231A": "0xD2A83E",
              "D0243A": "0xD1A8CC",
              "D0243D": "0xD2A83E",
              "D02587": "0xD3A854",
              "D02590": "0xD3FE81",
              "D02593": "0xD3FE81",
              "D0259A": "0xD3FE81",
              "D0259D": "0xD3FECD",
              "buffer": "0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
              "matrix3": "0xFF"
            },
            "meta": {
              "pc": "0x001377",
              "mode": "adl",
              "first": "djnz 0x001377",
              "last": "djnz 0x001377",
              "instructions": [
                "djnz 0x001377"
              ],
              "exits": [
                {
                  "type": "branch",
                  "target": "0x001377",
                  "targetMode": "adl"
                },
                {
                  "type": "fallthrough",
                  "target": "0x001379",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 3212,
            "delta": 3211,
            "steps": 3221,
            "pc": "0x001377",
            "label": "countdownLoop",
            "state": {
              "pc": "0x001377",
              "a": "0x76",
              "f": "0x42",
              "bc": "0x001924",
              "de": "0xD1A7FC",
              "hl": "0xD18C7C",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A87E",
              "stack24": [
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x008000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x00",
              "D0058E": "0x00",
              "D00080": "0x00",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
              "D0231A": "0xD2A83E",
              "D0243A": "0xD1A8CC",
              "D0243D": "0xD2A83E",
              "D02587": "0xD3A854",
              "D02590": "0xD3FE81",
              "D02593": "0xD3FE81",
              "D0259A": "0xD3FE81",
              "D0259D": "0xD3FECD",
              "buffer": "0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
              "matrix3": "0xFF"
            },
            "meta": {
              "pc": "0x001377",
              "mode": "adl",
              "first": "djnz 0x001377",
              "last": "djnz 0x001377",
              "instructions": [
                "djnz 0x001377"
              ],
              "exits": [
                {
                  "type": "branch",
                  "target": "0x001377",
                  "targetMode": "adl"
                },
                {
                  "type": "fallthrough",
                  "target": "0x001379",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 3213,
            "delta": 3212,
            "steps": 3222,
            "pc": "0x001377",
            "label": "countdownLoop",
            "state": {
              "pc": "0x001377",
              "a": "0x76",
              "f": "0x42",
              "bc": "0x001824",
              "de": "0xD1A7FC",
              "hl": "0xD18C7C",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A87E",
              "stack24": [
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x008000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x00",
              "D0058E": "0x00",
              "D00080": "0x00",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
              "D0231A": "0xD2A83E",
              "D0243A": "0xD1A8CC",
              "D0243D": "0xD2A83E",
              "D02587": "0xD3A854",
              "D02590": "0xD3FE81",
              "D02593": "0xD3FE81",
              "D0259A": "0xD3FE81",
              "D0259D": "0xD3FECD",
              "buffer": "0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
              "matrix3": "0xFF"
            },
            "meta": {
              "pc": "0x001377",
              "mode": "adl",
              "first": "djnz 0x001377",
              "last": "djnz 0x001377",
              "instructions": [
                "djnz 0x001377"
              ],
              "exits": [
                {
                  "type": "branch",
                  "target": "0x001377",
                  "targetMode": "adl"
                },
                {
                  "type": "fallthrough",
                  "target": "0x001379",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 3214,
            "delta": 3213,
            "steps": 3223,
            "pc": "0x001377",
            "label": "countdownLoop",
            "state": {
              "pc": "0x001377",
              "a": "0x76",
              "f": "0x42",
              "bc": "0x001724",
              "de": "0xD1A7FC",
              "hl": "0xD18C7C",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A87E",
              "stack24": [
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x008000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x00",
              "D0058E": "0x00",
              "D00080": "0x00",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
              "D0231A": "0xD2A83E",
              "D0243A": "0xD1A8CC",
              "D0243D": "0xD2A83E",
              "D02587": "0xD3A854",
              "D02590": "0xD3FE81",
              "D02593": "0xD3FE81",
              "D0259A": "0xD3FE81",
              "D0259D": "0xD3FECD",
              "buffer": "0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
              "matrix3": "0xFF"
            },
            "meta": {
              "pc": "0x001377",
              "mode": "adl",
              "first": "djnz 0x001377",
              "last": "djnz 0x001377",
              "instructions": [
                "djnz 0x001377"
              ],
              "exits": [
                {
                  "type": "branch",
                  "target": "0x001377",
                  "targetMode": "adl"
                },
                {
                  "type": "fallthrough",
                  "target": "0x001379",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 3215,
            "delta": 3214,
            "steps": 3224,
            "pc": "0x001377",
            "label": "countdownLoop",
            "state": {
              "pc": "0x001377",
              "a": "0x76",
              "f": "0x42",
              "bc": "0x001624",
              "de": "0xD1A7FC",
              "hl": "0xD18C7C",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A87E",
              "stack24": [
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x008000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x00",
              "D0058E": "0x00",
              "D00080": "0x00",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
              "D0231A": "0xD2A83E",
              "D0243A": "0xD1A8CC",
              "D0243D": "0xD2A83E",
              "D02587": "0xD3A854",
              "D02590": "0xD3FE81",
              "D02593": "0xD3FE81",
              "D0259A": "0xD3FE81",
              "D0259D": "0xD3FECD",
              "buffer": "0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
              "matrix3": "0xFF"
            },
            "meta": {
              "pc": "0x001377",
              "mode": "adl",
              "first": "djnz 0x001377",
              "last": "djnz 0x001377",
              "instructions": [
                "djnz 0x001377"
              ],
              "exits": [
                {
                  "type": "branch",
                  "target": "0x001377",
                  "targetMode": "adl"
                },
                {
                  "type": "fallthrough",
                  "target": "0x001379",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 3216,
            "delta": 3215,
            "steps": 3225,
            "pc": "0x001377",
            "label": "countdownLoop",
            "state": {
              "pc": "0x001377",
              "a": "0x76",
              "f": "0x42",
              "bc": "0x001524",
              "de": "0xD1A7FC",
              "hl": "0xD18C7C",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A87E",
              "stack24": [
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x008000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x00",
              "D0058E": "0x00",
              "D00080": "0x00",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
              "D0231A": "0xD2A83E",
              "D0243A": "0xD1A8CC",
              "D0243D": "0xD2A83E",
              "D02587": "0xD3A854",
              "D02590": "0xD3FE81",
              "D02593": "0xD3FE81",
              "D0259A": "0xD3FE81",
              "D0259D": "0xD3FECD",
              "buffer": "0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
              "matrix3": "0xFF"
            },
            "meta": {
              "pc": "0x001377",
              "mode": "adl",
              "first": "djnz 0x001377",
              "last": "djnz 0x001377",
              "instructions": [
                "djnz 0x001377"
              ],
              "exits": [
                {
                  "type": "branch",
                  "target": "0x001377",
                  "targetMode": "adl"
                },
                {
                  "type": "fallthrough",
                  "target": "0x001379",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 3217,
            "delta": 3216,
            "steps": 3226,
            "pc": "0x001377",
            "label": "countdownLoop",
            "state": {
              "pc": "0x001377",
              "a": "0x76",
              "f": "0x42",
              "bc": "0x001424",
              "de": "0xD1A7FC",
              "hl": "0xD18C7C",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A87E",
              "stack24": [
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x008000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x00",
              "D0058E": "0x00",
              "D00080": "0x00",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
              "D0231A": "0xD2A83E",
              "D0243A": "0xD1A8CC",
              "D0243D": "0xD2A83E",
              "D02587": "0xD3A854",
              "D02590": "0xD3FE81",
              "D02593": "0xD3FE81",
              "D0259A": "0xD3FE81",
              "D0259D": "0xD3FECD",
              "buffer": "0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
              "matrix3": "0xFF"
            },
            "meta": {
              "pc": "0x001377",
              "mode": "adl",
              "first": "djnz 0x001377",
              "last": "djnz 0x001377",
              "instructions": [
                "djnz 0x001377"
              ],
              "exits": [
                {
                  "type": "branch",
                  "target": "0x001377",
                  "targetMode": "adl"
                },
                {
                  "type": "fallthrough",
                  "target": "0x001379",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 3218,
            "delta": 3217,
            "steps": 3227,
            "pc": "0x001377",
            "label": "countdownLoop",
            "state": {
              "pc": "0x001377",
              "a": "0x76",
              "f": "0x42",
              "bc": "0x001324",
              "de": "0xD1A7FC",
              "hl": "0xD18C7C",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A87E",
              "stack24": [
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x008000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x00",
              "D0058E": "0x00",
              "D00080": "0x00",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
              "D0231A": "0xD2A83E",
              "D0243A": "0xD1A8CC",
              "D0243D": "0xD2A83E",
              "D02587": "0xD3A854",
              "D02590": "0xD3FE81",
              "D02593": "0xD3FE81",
              "D0259A": "0xD3FE81",
              "D0259D": "0xD3FECD",
              "buffer": "0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
              "matrix3": "0xFF"
            },
            "meta": {
              "pc": "0x001377",
              "mode": "adl",
              "first": "djnz 0x001377",
              "last": "djnz 0x001377",
              "instructions": [
                "djnz 0x001377"
              ],
              "exits": [
                {
                  "type": "branch",
                  "target": "0x001377",
                  "targetMode": "adl"
                },
                {
                  "type": "fallthrough",
                  "target": "0x001379",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 3219,
            "delta": 3218,
            "steps": 3228,
            "pc": "0x001377",
            "label": "countdownLoop",
            "state": {
              "pc": "0x001377",
              "a": "0x76",
              "f": "0x42",
              "bc": "0x001224",
              "de": "0xD1A7FC",
              "hl": "0xD18C7C",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A87E",
              "stack24": [
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x008000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x00",
              "D0058E": "0x00",
              "D00080": "0x00",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
              "D0231A": "0xD2A83E",
              "D0243A": "0xD1A8CC",
              "D0243D": "0xD2A83E",
              "D02587": "0xD3A854",
              "D02590": "0xD3FE81",
              "D02593": "0xD3FE81",
              "D0259A": "0xD3FE81",
              "D0259D": "0xD3FECD",
              "buffer": "0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
              "matrix3": "0xFF"
            },
            "meta": {
              "pc": "0x001377",
              "mode": "adl",
              "first": "djnz 0x001377",
              "last": "djnz 0x001377",
              "instructions": [
                "djnz 0x001377"
              ],
              "exits": [
                {
                  "type": "branch",
                  "target": "0x001377",
                  "targetMode": "adl"
                },
                {
                  "type": "fallthrough",
                  "target": "0x001379",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 3220,
            "delta": 3219,
            "steps": 3229,
            "pc": "0x001377",
            "label": "countdownLoop",
            "state": {
              "pc": "0x001377",
              "a": "0x76",
              "f": "0x42",
              "bc": "0x001124",
              "de": "0xD1A7FC",
              "hl": "0xD18C7C",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A87E",
              "stack24": [
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x008000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x00",
              "D0058E": "0x00",
              "D00080": "0x00",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
              "D0231A": "0xD2A83E",
              "D0243A": "0xD1A8CC",
              "D0243D": "0xD2A83E",
              "D02587": "0xD3A854",
              "D02590": "0xD3FE81",
              "D02593": "0xD3FE81",
              "D0259A": "0xD3FE81",
              "D0259D": "0xD3FECD",
              "buffer": "0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
              "matrix3": "0xFF"
            },
            "meta": {
              "pc": "0x001377",
              "mode": "adl",
              "first": "djnz 0x001377",
              "last": "djnz 0x001377",
              "instructions": [
                "djnz 0x001377"
              ],
              "exits": [
                {
                  "type": "branch",
                  "target": "0x001377",
                  "targetMode": "adl"
                },
                {
                  "type": "fallthrough",
                  "target": "0x001379",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 3221,
            "delta": 3220,
            "steps": 3230,
            "pc": "0x001377",
            "label": "countdownLoop",
            "state": {
              "pc": "0x001377",
              "a": "0x76",
              "f": "0x42",
              "bc": "0x001024",
              "de": "0xD1A7FC",
              "hl": "0xD18C7C",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A87E",
              "stack24": [
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x008000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x00",
              "D0058E": "0x00",
              "D00080": "0x00",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
              "D0231A": "0xD2A83E",
              "D0243A": "0xD1A8CC",
              "D0243D": "0xD2A83E",
              "D02587": "0xD3A854",
              "D02590": "0xD3FE81",
              "D02593": "0xD3FE81",
              "D0259A": "0xD3FE81",
              "D0259D": "0xD3FECD",
              "buffer": "0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
              "matrix3": "0xFF"
            },
            "meta": {
              "pc": "0x001377",
              "mode": "adl",
              "first": "djnz 0x001377",
              "last": "djnz 0x001377",
              "instructions": [
                "djnz 0x001377"
              ],
              "exits": [
                {
                  "type": "branch",
                  "target": "0x001377",
                  "targetMode": "adl"
                },
                {
                  "type": "fallthrough",
                  "target": "0x001379",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 3222,
            "delta": 3221,
            "steps": 3231,
            "pc": "0x001377",
            "label": "countdownLoop",
            "state": {
              "pc": "0x001377",
              "a": "0x76",
              "f": "0x42",
              "bc": "0x000F24",
              "de": "0xD1A7FC",
              "hl": "0xD18C7C",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A87E",
              "stack24": [
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x008000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x00",
              "D0058E": "0x00",
              "D00080": "0x00",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
              "D0231A": "0xD2A83E",
              "D0243A": "0xD1A8CC",
              "D0243D": "0xD2A83E",
              "D02587": "0xD3A854",
              "D02590": "0xD3FE81",
              "D02593": "0xD3FE81",
              "D0259A": "0xD3FE81",
              "D0259D": "0xD3FECD",
              "buffer": "0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
              "matrix3": "0xFF"
            },
            "meta": {
              "pc": "0x001377",
              "mode": "adl",
              "first": "djnz 0x001377",
              "last": "djnz 0x001377",
              "instructions": [
                "djnz 0x001377"
              ],
              "exits": [
                {
                  "type": "branch",
                  "target": "0x001377",
                  "targetMode": "adl"
                },
                {
                  "type": "fallthrough",
                  "target": "0x001379",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 3223,
            "delta": 3222,
            "steps": 3232,
            "pc": "0x001377",
            "label": "countdownLoop",
            "state": {
              "pc": "0x001377",
              "a": "0x76",
              "f": "0x42",
              "bc": "0x000E24",
              "de": "0xD1A7FC",
              "hl": "0xD18C7C",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A87E",
              "stack24": [
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x008000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x00",
              "D0058E": "0x00",
              "D00080": "0x00",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
              "D0231A": "0xD2A83E",
              "D0243A": "0xD1A8CC",
              "D0243D": "0xD2A83E",
              "D02587": "0xD3A854",
              "D02590": "0xD3FE81",
              "D02593": "0xD3FE81",
              "D0259A": "0xD3FE81",
              "D0259D": "0xD3FECD",
              "buffer": "0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
              "matrix3": "0xFF"
            },
            "meta": {
              "pc": "0x001377",
              "mode": "adl",
              "first": "djnz 0x001377",
              "last": "djnz 0x001377",
              "instructions": [
                "djnz 0x001377"
              ],
              "exits": [
                {
                  "type": "branch",
                  "target": "0x001377",
                  "targetMode": "adl"
                },
                {
                  "type": "fallthrough",
                  "target": "0x001379",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 3224,
            "delta": 3223,
            "steps": 3233,
            "pc": "0x001377",
            "label": "countdownLoop",
            "state": {
              "pc": "0x001377",
              "a": "0x76",
              "f": "0x42",
              "bc": "0x000D24",
              "de": "0xD1A7FC",
              "hl": "0xD18C7C",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A87E",
              "stack24": [
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x008000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x00",
              "D0058E": "0x00",
              "D00080": "0x00",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
              "D0231A": "0xD2A83E",
              "D0243A": "0xD1A8CC",
              "D0243D": "0xD2A83E",
              "D02587": "0xD3A854",
              "D02590": "0xD3FE81",
              "D02593": "0xD3FE81",
              "D0259A": "0xD3FE81",
              "D0259D": "0xD3FECD",
              "buffer": "0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
              "matrix3": "0xFF"
            },
            "meta": {
              "pc": "0x001377",
              "mode": "adl",
              "first": "djnz 0x001377",
              "last": "djnz 0x001377",
              "instructions": [
                "djnz 0x001377"
              ],
              "exits": [
                {
                  "type": "branch",
                  "target": "0x001377",
                  "targetMode": "adl"
                },
                {
                  "type": "fallthrough",
                  "target": "0x001379",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 3225,
            "delta": 3224,
            "steps": 3234,
            "pc": "0x001377",
            "label": "countdownLoop",
            "state": {
              "pc": "0x001377",
              "a": "0x76",
              "f": "0x42",
              "bc": "0x000C24",
              "de": "0xD1A7FC",
              "hl": "0xD18C7C",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A87E",
              "stack24": [
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x008000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x00",
              "D0058E": "0x00",
              "D00080": "0x00",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
              "D0231A": "0xD2A83E",
              "D0243A": "0xD1A8CC",
              "D0243D": "0xD2A83E",
              "D02587": "0xD3A854",
              "D02590": "0xD3FE81",
              "D02593": "0xD3FE81",
              "D0259A": "0xD3FE81",
              "D0259D": "0xD3FECD",
              "buffer": "0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
              "matrix3": "0xFF"
            },
            "meta": {
              "pc": "0x001377",
              "mode": "adl",
              "first": "djnz 0x001377",
              "last": "djnz 0x001377",
              "instructions": [
                "djnz 0x001377"
              ],
              "exits": [
                {
                  "type": "branch",
                  "target": "0x001377",
                  "targetMode": "adl"
                },
                {
                  "type": "fallthrough",
                  "target": "0x001379",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 3226,
            "delta": 3225,
            "steps": 3235,
            "pc": "0x001377",
            "label": "countdownLoop",
            "state": {
              "pc": "0x001377",
              "a": "0x76",
              "f": "0x42",
              "bc": "0x000B24",
              "de": "0xD1A7FC",
              "hl": "0xD18C7C",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A87E",
              "stack24": [
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x008000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x00",
              "D0058E": "0x00",
              "D00080": "0x00",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
              "D0231A": "0xD2A83E",
              "D0243A": "0xD1A8CC",
              "D0243D": "0xD2A83E",
              "D02587": "0xD3A854",
              "D02590": "0xD3FE81",
              "D02593": "0xD3FE81",
              "D0259A": "0xD3FE81",
              "D0259D": "0xD3FECD",
              "buffer": "0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
              "matrix3": "0xFF"
            },
            "meta": {
              "pc": "0x001377",
              "mode": "adl",
              "first": "djnz 0x001377",
              "last": "djnz 0x001377",
              "instructions": [
                "djnz 0x001377"
              ],
              "exits": [
                {
                  "type": "branch",
                  "target": "0x001377",
                  "targetMode": "adl"
                },
                {
                  "type": "fallthrough",
                  "target": "0x001379",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 3227,
            "delta": 3226,
            "steps": 3236,
            "pc": "0x001377",
            "label": "countdownLoop",
            "state": {
              "pc": "0x001377",
              "a": "0x76",
              "f": "0x42",
              "bc": "0x000A24",
              "de": "0xD1A7FC",
              "hl": "0xD18C7C",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A87E",
              "stack24": [
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x008000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x00",
              "D0058E": "0x00",
              "D00080": "0x00",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
              "D0231A": "0xD2A83E",
              "D0243A": "0xD1A8CC",
              "D0243D": "0xD2A83E",
              "D02587": "0xD3A854",
              "D02590": "0xD3FE81",
              "D02593": "0xD3FE81",
              "D0259A": "0xD3FE81",
              "D0259D": "0xD3FECD",
              "buffer": "0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
              "matrix3": "0xFF"
            },
            "meta": {
              "pc": "0x001377",
              "mode": "adl",
              "first": "djnz 0x001377",
              "last": "djnz 0x001377",
              "instructions": [
                "djnz 0x001377"
              ],
              "exits": [
                {
                  "type": "branch",
                  "target": "0x001377",
                  "targetMode": "adl"
                },
                {
                  "type": "fallthrough",
                  "target": "0x001379",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 3228,
            "delta": 3227,
            "steps": 3237,
            "pc": "0x001377",
            "label": "countdownLoop",
            "state": {
              "pc": "0x001377",
              "a": "0x76",
              "f": "0x42",
              "bc": "0x000924",
              "de": "0xD1A7FC",
              "hl": "0xD18C7C",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A87E",
              "stack24": [
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x008000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x00",
              "D0058E": "0x00",
              "D00080": "0x00",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
              "D0231A": "0xD2A83E",
              "D0243A": "0xD1A8CC",
              "D0243D": "0xD2A83E",
              "D02587": "0xD3A854",
              "D02590": "0xD3FE81",
              "D02593": "0xD3FE81",
              "D0259A": "0xD3FE81",
              "D0259D": "0xD3FECD",
              "buffer": "0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
              "matrix3": "0xFF"
            },
            "meta": {
              "pc": "0x001377",
              "mode": "adl",
              "first": "djnz 0x001377",
              "last": "djnz 0x001377",
              "instructions": [
                "djnz 0x001377"
              ],
              "exits": [
                {
                  "type": "branch",
                  "target": "0x001377",
                  "targetMode": "adl"
                },
                {
                  "type": "fallthrough",
                  "target": "0x001379",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 3229,
            "delta": 3228,
            "steps": 3238,
            "pc": "0x001377",
            "label": "countdownLoop",
            "state": {
              "pc": "0x001377",
              "a": "0x76",
              "f": "0x42",
              "bc": "0x000824",
              "de": "0xD1A7FC",
              "hl": "0xD18C7C",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A87E",
              "stack24": [
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x008000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x00",
              "D0058E": "0x00",
              "D00080": "0x00",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
              "D0231A": "0xD2A83E",
              "D0243A": "0xD1A8CC",
              "D0243D": "0xD2A83E",
              "D02587": "0xD3A854",
              "D02590": "0xD3FE81",
              "D02593": "0xD3FE81",
              "D0259A": "0xD3FE81",
              "D0259D": "0xD3FECD",
              "buffer": "0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
              "matrix3": "0xFF"
            },
            "meta": {
              "pc": "0x001377",
              "mode": "adl",
              "first": "djnz 0x001377",
              "last": "djnz 0x001377",
              "instructions": [
                "djnz 0x001377"
              ],
              "exits": [
                {
                  "type": "branch",
                  "target": "0x001377",
                  "targetMode": "adl"
                },
                {
                  "type": "fallthrough",
                  "target": "0x001379",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 3230,
            "delta": 3229,
            "steps": 3239,
            "pc": "0x001377",
            "label": "countdownLoop",
            "state": {
              "pc": "0x001377",
              "a": "0x76",
              "f": "0x42",
              "bc": "0x000724",
              "de": "0xD1A7FC",
              "hl": "0xD18C7C",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A87E",
              "stack24": [
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x008000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x00",
              "D0058E": "0x00",
              "D00080": "0x00",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
              "D0231A": "0xD2A83E",
              "D0243A": "0xD1A8CC",
              "D0243D": "0xD2A83E",
              "D02587": "0xD3A854",
              "D02590": "0xD3FE81",
              "D02593": "0xD3FE81",
              "D0259A": "0xD3FE81",
              "D0259D": "0xD3FECD",
              "buffer": "0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
              "matrix3": "0xFF"
            },
            "meta": {
              "pc": "0x001377",
              "mode": "adl",
              "first": "djnz 0x001377",
              "last": "djnz 0x001377",
              "instructions": [
                "djnz 0x001377"
              ],
              "exits": [
                {
                  "type": "branch",
                  "target": "0x001377",
                  "targetMode": "adl"
                },
                {
                  "type": "fallthrough",
                  "target": "0x001379",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 3231,
            "delta": 3230,
            "steps": 3240,
            "pc": "0x001377",
            "label": "countdownLoop",
            "state": {
              "pc": "0x001377",
              "a": "0x76",
              "f": "0x42",
              "bc": "0x000624",
              "de": "0xD1A7FC",
              "hl": "0xD18C7C",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A87E",
              "stack24": [
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x008000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x00",
              "D0058E": "0x00",
              "D00080": "0x00",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
              "D0231A": "0xD2A83E",
              "D0243A": "0xD1A8CC",
              "D0243D": "0xD2A83E",
              "D02587": "0xD3A854",
              "D02590": "0xD3FE81",
              "D02593": "0xD3FE81",
              "D0259A": "0xD3FE81",
              "D0259D": "0xD3FECD",
              "buffer": "0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
              "matrix3": "0xFF"
            },
            "meta": {
              "pc": "0x001377",
              "mode": "adl",
              "first": "djnz 0x001377",
              "last": "djnz 0x001377",
              "instructions": [
                "djnz 0x001377"
              ],
              "exits": [
                {
                  "type": "branch",
                  "target": "0x001377",
                  "targetMode": "adl"
                },
                {
                  "type": "fallthrough",
                  "target": "0x001379",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 3232,
            "delta": 3231,
            "steps": 3241,
            "pc": "0x001377",
            "label": "countdownLoop",
            "state": {
              "pc": "0x001377",
              "a": "0x76",
              "f": "0x42",
              "bc": "0x000524",
              "de": "0xD1A7FC",
              "hl": "0xD18C7C",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A87E",
              "stack24": [
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x008000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x00",
              "D0058E": "0x00",
              "D00080": "0x00",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
              "D0231A": "0xD2A83E",
              "D0243A": "0xD1A8CC",
              "D0243D": "0xD2A83E",
              "D02587": "0xD3A854",
              "D02590": "0xD3FE81",
              "D02593": "0xD3FE81",
              "D0259A": "0xD3FE81",
              "D0259D": "0xD3FECD",
              "buffer": "0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
              "matrix3": "0xFF"
            },
            "meta": {
              "pc": "0x001377",
              "mode": "adl",
              "first": "djnz 0x001377",
              "last": "djnz 0x001377",
              "instructions": [
                "djnz 0x001377"
              ],
              "exits": [
                {
                  "type": "branch",
                  "target": "0x001377",
                  "targetMode": "adl"
                },
                {
                  "type": "fallthrough",
                  "target": "0x001379",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 3233,
            "delta": 3232,
            "steps": 3242,
            "pc": "0x001377",
            "label": "countdownLoop",
            "state": {
              "pc": "0x001377",
              "a": "0x76",
              "f": "0x42",
              "bc": "0x000424",
              "de": "0xD1A7FC",
              "hl": "0xD18C7C",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A87E",
              "stack24": [
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x008000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x00",
              "D0058E": "0x00",
              "D00080": "0x00",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
              "D0231A": "0xD2A83E",
              "D0243A": "0xD1A8CC",
              "D0243D": "0xD2A83E",
              "D02587": "0xD3A854",
              "D02590": "0xD3FE81",
              "D02593": "0xD3FE81",
              "D0259A": "0xD3FE81",
              "D0259D": "0xD3FECD",
              "buffer": "0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
              "matrix3": "0xFF"
            },
            "meta": {
              "pc": "0x001377",
              "mode": "adl",
              "first": "djnz 0x001377",
              "last": "djnz 0x001377",
              "instructions": [
                "djnz 0x001377"
              ],
              "exits": [
                {
                  "type": "branch",
                  "target": "0x001377",
                  "targetMode": "adl"
                },
                {
                  "type": "fallthrough",
                  "target": "0x001379",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 3234,
            "delta": 3233,
            "steps": 3243,
            "pc": "0x001377",
            "label": "countdownLoop",
            "state": {
              "pc": "0x001377",
              "a": "0x76",
              "f": "0x42",
              "bc": "0x000324",
              "de": "0xD1A7FC",
              "hl": "0xD18C7C",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A87E",
              "stack24": [
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x008000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x00",
              "D0058E": "0x00",
              "D00080": "0x00",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
              "D0231A": "0xD2A83E",
              "D0243A": "0xD1A8CC",
              "D0243D": "0xD2A83E",
              "D02587": "0xD3A854",
              "D02590": "0xD3FE81",
              "D02593": "0xD3FE81",
              "D0259A": "0xD3FE81",
              "D0259D": "0xD3FECD",
              "buffer": "0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
              "matrix3": "0xFF"
            },
            "meta": {
              "pc": "0x001377",
              "mode": "adl",
              "first": "djnz 0x001377",
              "last": "djnz 0x001377",
              "instructions": [
                "djnz 0x001377"
              ],
              "exits": [
                {
                  "type": "branch",
                  "target": "0x001377",
                  "targetMode": "adl"
                },
                {
                  "type": "fallthrough",
                  "target": "0x001379",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 3235,
            "delta": 3234,
            "steps": 3244,
            "pc": "0x001377",
            "label": "countdownLoop",
            "state": {
              "pc": "0x001377",
              "a": "0x76",
              "f": "0x42",
              "bc": "0x000224",
              "de": "0xD1A7FC",
              "hl": "0xD18C7C",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A87E",
              "stack24": [
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x008000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x00",
              "D0058E": "0x00",
              "D00080": "0x00",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
              "D0231A": "0xD2A83E",
              "D0243A": "0xD1A8CC",
              "D0243D": "0xD2A83E",
              "D02587": "0xD3A854",
              "D02590": "0xD3FE81",
              "D02593": "0xD3FE81",
              "D0259A": "0xD3FE81",
              "D0259D": "0xD3FECD",
              "buffer": "0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
              "matrix3": "0xFF"
            },
            "meta": {
              "pc": "0x001377",
              "mode": "adl",
              "first": "djnz 0x001377",
              "last": "djnz 0x001377",
              "instructions": [
                "djnz 0x001377"
              ],
              "exits": [
                {
                  "type": "branch",
                  "target": "0x001377",
                  "targetMode": "adl"
                },
                {
                  "type": "fallthrough",
                  "target": "0x001379",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 3236,
            "delta": 3235,
            "steps": 3245,
            "pc": "0x001377",
            "label": "countdownLoop",
            "state": {
              "pc": "0x001377",
              "a": "0x76",
              "f": "0x42",
              "bc": "0x000124",
              "de": "0xD1A7FC",
              "hl": "0xD18C7C",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A87E",
              "stack24": [
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x008000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x00",
              "D0058E": "0x00",
              "D00080": "0x00",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
              "D0231A": "0xD2A83E",
              "D0243A": "0xD1A8CC",
              "D0243D": "0xD2A83E",
              "D02587": "0xD3A854",
              "D02590": "0xD3FE81",
              "D02593": "0xD3FE81",
              "D0259A": "0xD3FE81",
              "D0259D": "0xD3FECD",
              "buffer": "0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
              "matrix3": "0xFF"
            },
            "meta": {
              "pc": "0x001377",
              "mode": "adl",
              "first": "djnz 0x001377",
              "last": "djnz 0x001377",
              "instructions": [
                "djnz 0x001377"
              ],
              "exits": [
                {
                  "type": "branch",
                  "target": "0x001377",
                  "targetMode": "adl"
                },
                {
                  "type": "fallthrough",
                  "target": "0x001379",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 3237,
            "delta": 3236,
            "steps": 3246,
            "pc": "0x001379",
            "label": "port3Read",
            "state": {
              "pc": "0x001379",
              "a": "0x76",
              "f": "0x42",
              "bc": "0x000024",
              "de": "0xD1A7FC",
              "hl": "0xD18C7C",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A87E",
              "stack24": [
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x008000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x00",
              "D0058E": "0x00",
              "D00080": "0x00",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
              "D0231A": "0xD2A83E",
              "D0243A": "0xD1A8CC",
              "D0243D": "0xD2A83E",
              "D02587": "0xD3A854",
              "D02590": "0xD3FE81",
              "D02593": "0xD3FE81",
              "D0259A": "0xD3FE81",
              "D0259D": "0xD3FECD",
              "buffer": "0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
              "matrix3": "0xFF"
            },
            "meta": {
              "pc": "0x001379",
              "mode": "adl",
              "first": "in0 a, (0x03)",
              "last": "jr z, 0x00138a",
              "instructions": [
                "in0 a, (0x03)",
                "bit 4, a",
                "jr z, 0x00138a"
              ],
              "exits": [
                {
                  "type": "branch",
                  "target": "0x00138A",
                  "targetMode": "adl"
                },
                {
                  "type": "fallthrough",
                  "target": "0x001380",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 3238,
            "delta": 3237,
            "steps": 3247,
            "pc": "0x00138A",
            "label": "port3PostRead",
            "state": {
              "pc": "0x00138A",
              "a": "0xEE",
              "f": "0x54",
              "bc": "0x000024",
              "de": "0xD1A7FC",
              "hl": "0xD18C7C",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A87E",
              "stack24": [
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x008000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x00",
              "D0058E": "0x00",
              "D00080": "0x00",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
              "D0231A": "0xD2A83E",
              "D0243A": "0xD1A8CC",
              "D0243D": "0xD2A83E",
              "D02587": "0xD3A854",
              "D02590": "0xD3FE81",
              "D02593": "0xD3FE81",
              "D0259A": "0xD3FE81",
              "D0259D": "0xD3FECD",
              "buffer": "0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
              "matrix3": "0xFF"
            },
            "meta": {
              "pc": "0x00138A",
              "mode": "adl",
              "first": "ld a, 0x26",
              "last": "jr nz, 0x00139c",
              "instructions": [
                "ld a, 0x26",
                "out0 (0x05), a",
                "cp 0x26",
                "jr nz, 0x00139c"
              ],
              "exits": [
                {
                  "type": "branch",
                  "target": "0x00139C",
                  "targetMode": "adl"
                },
                {
                  "type": "fallthrough",
                  "target": "0x001393",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 3239,
            "delta": 3238,
            "steps": 3248,
            "pc": "0x001393",
            "label": "port3Prep",
            "state": {
              "pc": "0x001393",
              "a": "0x26",
              "f": "0x42",
              "bc": "0x000024",
              "de": "0xD1A7FC",
              "hl": "0xD18C7C",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A87E",
              "stack24": [
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x008000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x00",
              "D0058E": "0x00",
              "D00080": "0x00",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
              "D0231A": "0xD2A83E",
              "D0243A": "0xD1A8CC",
              "D0243D": "0xD2A83E",
              "D02587": "0xD3A854",
              "D02590": "0xD3FE81",
              "D02593": "0xD3FE81",
              "D0259A": "0xD3FE81",
              "D0259D": "0xD3FECD",
              "buffer": "0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
              "matrix3": "0xFF"
            },
            "meta": {
              "pc": "0x001393",
              "mode": "adl",
              "first": "ld a, 0x03",
              "last": "jr z, 0x00139d",
              "instructions": [
                "ld a, 0x03",
                "out0 (0x06), a",
                "cp 0x03",
                "jr z, 0x00139d"
              ],
              "exits": [
                {
                  "type": "branch",
                  "target": "0x00139D",
                  "targetMode": "adl"
                },
                {
                  "type": "fallthrough",
                  "target": "0x00139C",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 3240,
            "delta": 3239,
            "steps": 3249,
            "pc": "0x00139D",
            "label": "wrapperSetup",
            "state": {
              "pc": "0x00139D",
              "a": "0x03",
              "f": "0x42",
              "bc": "0x000024",
              "de": "0xD1A7FC",
              "hl": "0xD18C7C",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A87E",
              "stack24": [
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x008000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x00",
              "D0058E": "0x00",
              "D00080": "0x00",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
              "D0231A": "0xD2A83E",
              "D0243A": "0xD1A8CC",
              "D0243D": "0xD2A83E",
              "D02587": "0xD3A854",
              "D02590": "0xD3FE81",
              "D02593": "0xD3FE81",
              "D0259A": "0xD3FE81",
              "D0259D": "0xD3FECD",
              "buffer": "0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
              "matrix3": "0xFF"
            },
            "meta": {
              "pc": "0x00139D",
              "mode": "adl",
              "first": "ld bc, 0x00a000",
              "last": "jr nz, 0x00139c",
              "instructions": [
                "ld bc, 0x00a000",
                "xor a",
                "out (c), a",
                "inc c",
                "ld a, 0x0f",
                "out (c), a",
                "inc c",
                "xor a",
                "out (c), a",
                "inc c",
                "ld a, 0x0f",
                "out (c), a",
                "inc c",
                "ld a, 0x08",
                "out (c), a",
                "inc c"
              ],
              "exits": [
                {
                  "type": "branch",
                  "target": "0x00139C",
                  "targetMode": "adl"
                },
                {
                  "type": "fallthrough",
                  "target": "0x0013C3",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 3241,
            "delta": 3240,
            "steps": 3250,
            "pc": "0x0013C3",
            "label": "wrapperCall",
            "state": {
              "pc": "0x0013C3",
              "a": "0x08",
              "f": "0x42",
              "bc": "0x00A005",
              "de": "0xD1A7FC",
              "hl": "0x000000",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A87E",
              "stack24": [
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x008000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x00",
              "D0058E": "0x00",
              "D00080": "0x00",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
              "D0231A": "0xD2A83E",
              "D0243A": "0xD1A8CC",
              "D0243D": "0xD2A83E",
              "D02587": "0xD3A854",
              "D02590": "0xD3FE81",
              "D02593": "0xD3FE81",
              "D0259A": "0xD3FE81",
              "D0259D": "0xD3FECD",
              "buffer": "0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
              "matrix3": "0xFF"
            },
            "meta": {
              "pc": "0x0013C3",
              "mode": "adl",
              "first": "call 0x001988",
              "last": "call 0x001988",
              "instructions": [
                "call 0x001988"
              ],
              "exits": [
                {
                  "type": "call",
                  "target": "0x001988",
                  "targetMode": "adl"
                },
                {
                  "type": "call-return",
                  "target": "0x0013C7",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 3242,
            "delta": 3241,
            "steps": 3251,
            "pc": "0x001988",
            "label": "helperEntry",
            "state": {
              "pc": "0x001988",
              "a": "0x08",
              "f": "0x42",
              "bc": "0x00A005",
              "de": "0xD1A7FC",
              "hl": "0x000000",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A87B",
              "stack24": [
                "0x0013C7",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x00",
              "D0058E": "0x00",
              "D00080": "0x00",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
              "D0231A": "0xD2A83E",
              "D0243A": "0xD1A8CC",
              "D0243D": "0xD2A83E",
              "D02587": "0xD3A854",
              "D02590": "0xD3FE81",
              "D02593": "0xD3FE81",
              "D0259A": "0xD3FE81",
              "D0259D": "0xD3FECD",
              "buffer": "0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
              "matrix3": "0xFF"
            },
            "meta": {
              "pc": "0x001988",
              "mode": "adl",
              "first": "di",
              "last": "jr nz, 0x0019a9",
              "instructions": [
                "di",
                "push bc",
                "in0 a, (0x03)",
                "bit 4, a",
                "jr nz, 0x0019a9"
              ],
              "exits": [
                {
                  "type": "branch",
                  "target": "0x0019A9",
                  "targetMode": "adl"
                },
                {
                  "type": "fallthrough",
                  "target": "0x001991",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 3243,
            "delta": 3242,
            "steps": 3252,
            "pc": "0x001991",
            "label": "helperStackSave",
            "state": {
              "pc": "0x001991",
              "a": "0xEE",
              "f": "0x54",
              "bc": "0x00A005",
              "de": "0xD1A7FC",
              "hl": "0x000000",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A878",
              "stack24": [
                "0x00A005",
                "0x0013C7",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x00",
              "D0058E": "0x00",
              "D00080": "0x00",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
              "D0231A": "0xD2A83E",
              "D0243A": "0xD1A8CC",
              "D0243D": "0xD2A83E",
              "D02587": "0xD3A854",
              "D02590": "0xD3FE81",
              "D02593": "0xD3FE81",
              "D0259A": "0xD3FE81",
              "D0259D": "0xD3FECD",
              "buffer": "0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
              "matrix3": "0xFF"
            },
            "meta": {
              "pc": "0x001991",
              "mode": "adl",
              "first": "ld bc, 0x001005",
              "last": "jr z, 0x00199e",
              "instructions": [
                "ld bc, 0x001005",
                "ld a, 0x04",
                "out (c), a",
                "cp 0x04",
                "jr z, 0x00199e"
              ],
              "exits": [
                {
                  "type": "branch",
                  "target": "0x00199E",
                  "targetMode": "adl"
                },
                {
                  "type": "fallthrough",
                  "target": "0x00199D",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 3244,
            "delta": 3243,
            "steps": 3253,
            "pc": "0x00199E",
            "label": "helperLoadB",
            "state": {
              "pc": "0x00199E",
              "a": "0x04",
              "f": "0x42",
              "bc": "0x001005",
              "de": "0xD1A7FC",
              "hl": "0x000000",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A878",
              "stack24": [
                "0x00A005",
                "0x0013C7",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x00",
              "D0058E": "0x00",
              "D00080": "0x00",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
              "D0231A": "0xD2A83E",
              "D0243A": "0xD1A8CC",
              "D0243D": "0xD2A83E",
              "D02587": "0xD3A854",
              "D02590": "0xD3FE81",
              "D02593": "0xD3FE81",
              "D0259A": "0xD3FE81",
              "D0259D": "0xD3FECD",
              "buffer": "0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
              "matrix3": "0xFF"
            },
            "meta": {
              "pc": "0x00199E",
              "mode": "adl",
              "first": "ld a, b",
              "last": "jr z, 0x0019a4",
              "instructions": [
                "ld a, b",
                "cp 0x10",
                "jr z, 0x0019a4"
              ],
              "exits": [
                {
                  "type": "branch",
                  "target": "0x0019A4",
                  "targetMode": "adl"
                },
                {
                  "type": "fallthrough",
                  "target": "0x0019A3",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 3245,
            "delta": 3244,
            "steps": 3254,
            "pc": "0x0019A4",
            "label": "helperLoadC",
            "state": {
              "pc": "0x0019A4",
              "a": "0x10",
              "f": "0x42",
              "bc": "0x001005",
              "de": "0xD1A7FC",
              "hl": "0x000000",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A878",
              "stack24": [
                "0x00A005",
                "0x0013C7",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x00",
              "D0058E": "0x00",
              "D00080": "0x00",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
              "D0231A": "0xD2A83E",
              "D0243A": "0xD1A8CC",
              "D0243D": "0xD2A83E",
              "D02587": "0xD3A854",
              "D02590": "0xD3FE81",
              "D02593": "0xD3FE81",
              "D0259A": "0xD3FE81",
              "D0259D": "0xD3FECD",
              "buffer": "0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
              "matrix3": "0xFF"
            },
            "meta": {
              "pc": "0x0019A4",
              "mode": "adl",
              "first": "ld a, c",
              "last": "jr nz, 0x0019a3",
              "instructions": [
                "ld a, c",
                "cp 0x05",
                "jr nz, 0x0019a3"
              ],
              "exits": [
                {
                  "type": "branch",
                  "target": "0x0019A3",
                  "targetMode": "adl"
                },
                {
                  "type": "fallthrough",
                  "target": "0x0019A9",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 3246,
            "delta": 3245,
            "steps": 3255,
            "pc": "0x0019A9",
            "label": "helperPortSelect",
            "state": {
              "pc": "0x0019A9",
              "a": "0x05",
              "f": "0x42",
              "bc": "0x001005",
              "de": "0xD1A7FC",
              "hl": "0x000000",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A878",
              "stack24": [
                "0x00A005",
                "0x0013C7",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x00",
              "D0058E": "0x00",
              "D00080": "0x00",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
              "D0231A": "0xD2A83E",
              "D0243A": "0xD1A8CC",
              "D0243D": "0xD2A83E",
              "D02587": "0xD3A854",
              "D02590": "0xD3FE81",
              "D02593": "0xD3FE81",
              "D0259A": "0xD3FE81",
              "D0259D": "0xD3FECD",
              "buffer": "0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
              "matrix3": "0xFF"
            },
            "meta": {
              "pc": "0x0019A9",
              "mode": "adl",
              "first": "ld a, 0x03",
              "last": "jr z, 0x0019b3",
              "instructions": [
                "ld a, 0x03",
                "out0 (0x01), a",
                "cp 0x03",
                "jr z, 0x0019b3"
              ],
              "exits": [
                {
                  "type": "branch",
                  "target": "0x0019B3",
                  "targetMode": "adl"
                },
                {
                  "type": "fallthrough",
                  "target": "0x0019B2",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 3247,
            "delta": 3246,
            "steps": 3256,
            "pc": "0x0019B3",
            "label": "helperDynamicReturn",
            "state": {
              "pc": "0x0019B3",
              "a": "0x03",
              "f": "0x42",
              "bc": "0x001005",
              "de": "0xD1A7FC",
              "hl": "0x000000",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A878",
              "stack24": [
                "0x00A005",
                "0x0013C7",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x00",
              "D0058E": "0x00",
              "D00080": "0x00",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
              "D0231A": "0xD2A83E",
              "D0243A": "0xD1A8CC",
              "D0243D": "0xD2A83E",
              "D02587": "0xD3A854",
              "D02590": "0xD3FE81",
              "D02593": "0xD3FE81",
              "D0259A": "0xD3FE81",
              "D0259D": "0xD3FECD",
              "buffer": "0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
              "matrix3": "0xFF"
            },
            "meta": {
              "pc": "0x0019B3",
              "mode": "adl",
              "first": "pop bc",
              "last": "ret",
              "instructions": [
                "pop bc",
                "ret"
              ],
              "exits": [
                {
                  "type": "return",
                  "target": null,
                  "targetMode": null
                }
              ]
            }
          },
          {
            "block": 3248,
            "delta": 3247,
            "steps": 3257,
            "pc": "0x0013C7",
            "label": "wrapperResume",
            "state": {
              "pc": "0x0013C7",
              "a": "0x03",
              "f": "0x42",
              "bc": "0x00A005",
              "de": "0xD1A7FC",
              "hl": "0x000000",
              "ix": "0x000000",
              "iy": "0x3B001A",
              "sp": "0xD1A87E",
              "stack24": [
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x000000",
                "0x008000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x00",
              "D0058E": "0x00",
              "D00080": "0x00",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
              "D0231A": "0xD2A83E",
              "D0243A": "0xD1A8CC",
              "D0243D": "0xD2A83E",
              "D02587": "0xD3A854",
              "D02590": "0xD3FE81",
              "D02593": "0xD3FE81",
              "D0259A": "0xD3FE81",
              "D0259D": "0xD3FECD",
              "buffer": "0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
              "matrix3": "0xFF"
            },
            "meta": {
              "pc": "0x0013C7",
              "mode": "adl",
              "first": "ld a, 0xd0",
              "last": "call 0x0158de",
              "instructions": [
                "ld a, 0xd0",
                "??? tag=ld-mb-a",
                "im 1",
                "ld iy, 0xd00080",
                "res 6, (iy+27)",
                "call 0x0158de"
              ],
              "exits": [
                {
                  "type": "call",
                  "target": "0x0158DE",
                  "targetMode": "adl"
                },
                {
                  "type": "call-return",
                  "target": "0x0013DA",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 3249,
            "delta": 3248,
            "steps": 3258,
            "pc": "0x0158DE",
            "label": "preOwnerFlagGate",
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
                "0x000000",
                "0x000000",
                "0x000000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x00",
              "D0058E": "0x00",
              "D00080": "0x00",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
              "D0231A": "0xD2A83E",
              "D0243A": "0xD1A8CC",
              "D0243D": "0xD2A83E",
              "D02587": "0xD3A854",
              "D02590": "0xD3FE81",
              "D02593": "0xD3FE81",
              "D0259A": "0xD3FE81",
              "D0259D": "0xD3FECD",
              "buffer": "0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
              "matrix3": "0xFF"
            },
            "meta": {
              "pc": "0x0158DE",
              "mode": "adl",
              "first": "ld iy, 0xd00080",
              "last": "ret nz",
              "instructions": [
                "ld iy, 0xd00080",
                "bit 7, (iy+66)",
                "ret nz"
              ],
              "exits": [
                {
                  "type": "return-conditional",
                  "target": null,
                  "targetMode": null
                },
                {
                  "type": "fallthrough",
                  "target": "0x0158E8",
                  "targetMode": "adl"
                }
              ]
            }
          },
          {
            "block": 3250,
            "delta": 3249,
            "steps": 3259,
            "pc": "0x0158E8",
            "label": "preOwnerCall",
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
                "0x000000",
                "0x000000",
                "0x000000"
              ],
              "errSp": "0xD1A863",
              "D00587": "0x00",
              "D0058C": "0x00",
              "D0058D": "0x00",
              "D0058E": "0x00",
              "D00080": "0x00",
              "D0009B": "0x00",
              "D0009F": "0x00",
              "D000A3": "0x0A",
              "D000C2": "0x00",
              "D007CA": "0x0585E9",
              "D008E0": "0xD1A863",
              "D0231A": "0xD2A83E",
              "D0243A": "0xD1A8CC",
              "D0243D": "0xD2A83E",
              "D02587": "0xD3A854",
              "D02590": "0xD3FE81",
              "D02593": "0xD3FE81",
              "D0259A": "0xD3FE81",
              "D0259D": "0xD3FECD",
              "buffer": "0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
              "matrix3": "0xFF"
            },
            "meta": {
              "pc": "0x0158E8",
              "mode": "adl",
              "first": "call 0x0158bc",
              "last": "call 0x0158bc",
              "instructions": [
                "call 0x0158bc"
              ],
              "exits": [
                {
                  "type": "call",
                  "target": "0x0158BC",
                  "targetMode": "adl"
                },
                {
                  "type": "call-return",
                  "target": "0x0158EC",
                  "targetMode": "adl"
                }
              ]
            }
          }
        ],
        "recentDynamicTargets": [
          {
            "block": 2758,
            "delta": 2757,
            "steps": 2767,
            "fromPc": "0x001C54",
            "target": "0x006816",
            "mode": "adl"
          },
          {
            "block": 2761,
            "delta": 2760,
            "steps": 2770,
            "fromPc": "0x006828",
            "target": "0x001727",
            "mode": "adl"
          },
          {
            "block": 2762,
            "delta": 2761,
            "steps": 2771,
            "fromPc": "0x001727",
            "target": "0x000719",
            "mode": "adl"
          },
          {
            "block": 2786,
            "delta": 2785,
            "steps": 2795,
            "fromPc": "0x003CF3",
            "target": "0x03F998",
            "mode": "adl"
          },
          {
            "block": 2790,
            "delta": 2789,
            "steps": 2799,
            "fromPc": "0x03F9AE",
            "target": "0x03D058",
            "mode": "adl"
          },
          {
            "block": 2792,
            "delta": 2791,
            "steps": 2801,
            "fromPc": "0x05C623",
            "target": "0x03D060",
            "mode": "adl"
          },
          {
            "block": 2800,
            "delta": 2799,
            "steps": 2810,
            "fromPc": "0x0008BB",
            "target": "0x001717",
            "mode": "adl"
          },
          {
            "block": 2811,
            "delta": 2810,
            "steps": 2821,
            "fromPc": "0x001CE5",
            "target": "0x001C54",
            "mode": "adl"
          },
          {
            "block": 2812,
            "delta": 2811,
            "steps": 2822,
            "fromPc": "0x001C54",
            "target": "0x006808",
            "mode": "adl"
          },
          {
            "block": 2822,
            "delta": 2821,
            "steps": 2832,
            "fromPc": "0x001CE4",
            "target": "0x001C81",
            "mode": "adl"
          },
          {
            "block": 2824,
            "delta": 2823,
            "steps": 2834,
            "fromPc": "0x001C82",
            "target": "0x001C48",
            "mode": "adl"
          },
          {
            "block": 2834,
            "delta": 2833,
            "steps": 2844,
            "fromPc": "0x001CE4",
            "target": "0x001C81",
            "mode": "adl"
          },
          {
            "block": 2836,
            "delta": 2835,
            "steps": 2846,
            "fromPc": "0x001C82",
            "target": "0x001C48",
            "mode": "adl"
          },
          {
            "block": 2846,
            "delta": 2845,
            "steps": 2856,
            "fromPc": "0x001CE4",
            "target": "0x001C81",
            "mode": "adl"
          },
          {
            "block": 2848,
            "delta": 2847,
            "steps": 2858,
            "fromPc": "0x001C82",
            "target": "0x001C48",
            "mode": "adl"
          },
          {
            "block": 2858,
            "delta": 2857,
            "steps": 2868,
            "fromPc": "0x001CE4",
            "target": "0x001C81",
            "mode": "adl"
          },
          {
            "block": 2860,
            "delta": 2859,
            "steps": 2870,
            "fromPc": "0x001C82",
            "target": "0x001C48",
            "mode": "adl"
          },
          {
            "block": 2865,
            "delta": 2864,
            "steps": 2875,
            "fromPc": "0x001C42",
            "target": "0x006810",
            "mode": "adl"
          },
          {
            "block": 2872,
            "delta": 2871,
            "steps": 2882,
            "fromPc": "0x001CE4",
            "target": "0x001C54",
            "mode": "adl"
          },
          {
            "block": 2873,
            "delta": 2872,
            "steps": 2883,
            "fromPc": "0x001C54",
            "target": "0x006816",
            "mode": "adl"
          },
          {
            "block": 2876,
            "delta": 2875,
            "steps": 2886,
            "fromPc": "0x006828",
            "target": "0x001727",
            "mode": "adl"
          },
          {
            "block": 2877,
            "delta": 2876,
            "steps": 2887,
            "fromPc": "0x001727",
            "target": "0x000719",
            "mode": "adl"
          },
          {
            "block": 2885,
            "delta": 2884,
            "steps": 2895,
            "fromPc": "0x03D0E0",
            "target": "0x000000",
            "mode": "adl"
          },
          {
            "block": 3247,
            "delta": 3246,
            "steps": 3257,
            "fromPc": "0x0019B3",
            "target": "0x0013C7",
            "mode": "adl"
          }
        ]
      },
      "branchSummary": {
        "variant": "no-pending-no-matrix-control-stop-owner",
        "countdownBlocks": 82,
        "countdownFirstBC": "0x005224",
        "countdownLastBC": "0x000124",
        "fallthroughBC": "0x000024",
        "port3Input": "0xEE",
        "port3PostFlags": "0x54",
        "wrapperCallState": {
          "pc": "0x0013C3",
          "a": "0x08",
          "f": "0x42",
          "bc": "0x00A005",
          "de": "0xD1A7FC",
          "hl": "0x000000",
          "ix": "0x000000",
          "iy": "0x3B001A",
          "sp": "0xD1A87E",
          "stack24": [
            "0x000000",
            "0x000000",
            "0x000000",
            "0x000000",
            "0x000000",
            "0x008000"
          ],
          "errSp": "0xD1A863",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009B": "0x00",
          "D0009F": "0x00",
          "D000A3": "0x0A",
          "D000C2": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0xD2A83E",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02587": "0xD3A854",
          "D02590": "0xD3FE81",
          "D02593": "0xD3FE81",
          "D0259A": "0xD3FE81",
          "D0259D": "0xD3FECD",
          "buffer": "0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
          "matrix3": "0xFF"
        },
        "helperEntryStack": [
          "0x0013C7",
          "0x000000",
          "0x000000"
        ],
        "helperReturnState": {
          "pc": "0x0019B3",
          "a": "0x03",
          "f": "0x42",
          "bc": "0x001005",
          "de": "0xD1A7FC",
          "hl": "0x000000",
          "ix": "0x000000",
          "iy": "0x3B001A",
          "sp": "0xD1A878",
          "stack24": [
            "0x00A005",
            "0x0013C7",
            "0x000000",
            "0x000000",
            "0x000000",
            "0x000000"
          ],
          "errSp": "0xD1A863",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009B": "0x00",
          "D0009F": "0x00",
          "D000A3": "0x0A",
          "D000C2": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0xD2A83E",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02587": "0xD3A854",
          "D02590": "0xD3FE81",
          "D02593": "0xD3FE81",
          "D0259A": "0xD3FE81",
          "D0259D": "0xD3FECD",
          "buffer": "0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
          "matrix3": "0xFF"
        },
        "wrapperResumeState": {
          "pc": "0x0013C7",
          "a": "0x03",
          "f": "0x42",
          "bc": "0x00A005",
          "de": "0xD1A7FC",
          "hl": "0x000000",
          "ix": "0x000000",
          "iy": "0x3B001A",
          "sp": "0xD1A87E",
          "stack24": [
            "0x000000",
            "0x000000",
            "0x000000",
            "0x000000",
            "0x000000",
            "0x008000"
          ],
          "errSp": "0xD1A863",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058D": "0x00",
          "D0058E": "0x00",
          "D00080": "0x00",
          "D0009B": "0x00",
          "D0009F": "0x00",
          "D000A3": "0x0A",
          "D000C2": "0x00",
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A863",
          "D0231A": "0xD2A83E",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02587": "0xD3A854",
          "D02590": "0xD3FE81",
          "D02593": "0xD3FE81",
          "D0259A": "0xD3FE81",
          "D0259D": "0xD3FECD",
          "buffer": "0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
          "matrix3": "0xFF"
        },
        "d000c2At0158DE": "0x00",
        "d000c2Bit7Clear": true,
        "preOwnerStack": [
          "0x0013DA",
          "0x000000",
          "0x000000"
        ],
        "ownerStack": [
          "0x0158EC",
          "0x0013DA",
          "0x000000"
        ]
      },
      "wrapperPath": [
        {
          "block": 3155,
          "delta": 3154,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x005224",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 3156,
          "delta": 3155,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x005124",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 3157,
          "delta": 3156,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x005024",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 3158,
          "delta": 3157,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x004F24",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 3159,
          "delta": 3158,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x004E24",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 3160,
          "delta": 3159,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x004D24",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 3161,
          "delta": 3160,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x004C24",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 3162,
          "delta": 3161,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x004B24",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 3163,
          "delta": 3162,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x004A24",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 3164,
          "delta": 3163,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x004924",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 3165,
          "delta": 3164,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x004824",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 3166,
          "delta": 3165,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x004724",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 3167,
          "delta": 3166,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x004624",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 3168,
          "delta": 3167,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x004524",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 3169,
          "delta": 3168,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x004424",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 3170,
          "delta": 3169,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x004324",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 3171,
          "delta": 3170,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x004224",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 3172,
          "delta": 3171,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x004124",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 3173,
          "delta": 3172,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x004024",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 3174,
          "delta": 3173,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x003F24",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 3175,
          "delta": 3174,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x003E24",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 3176,
          "delta": 3175,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x003D24",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 3177,
          "delta": 3176,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x003C24",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 3178,
          "delta": 3177,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x003B24",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 3179,
          "delta": 3178,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x003A24",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 3180,
          "delta": 3179,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x003924",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 3181,
          "delta": 3180,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x003824",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 3182,
          "delta": 3181,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x003724",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 3183,
          "delta": 3182,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x003624",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 3184,
          "delta": 3183,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x003524",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 3185,
          "delta": 3184,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x003424",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 3186,
          "delta": 3185,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x003324",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 3187,
          "delta": 3186,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x003224",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 3188,
          "delta": 3187,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x003124",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 3189,
          "delta": 3188,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x003024",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 3190,
          "delta": 3189,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x002F24",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 3191,
          "delta": 3190,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x002E24",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 3192,
          "delta": 3191,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x002D24",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 3193,
          "delta": 3192,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x002C24",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 3194,
          "delta": 3193,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x002B24",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 3195,
          "delta": 3194,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x002A24",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 3196,
          "delta": 3195,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x002924",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 3197,
          "delta": 3196,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x002824",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 3198,
          "delta": 3197,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x002724",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 3199,
          "delta": 3198,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x002624",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 3200,
          "delta": 3199,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x002524",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 3201,
          "delta": 3200,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x002424",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 3202,
          "delta": 3201,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x002324",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 3203,
          "delta": 3202,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x002224",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 3204,
          "delta": 3203,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x002124",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 3205,
          "delta": 3204,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x002024",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 3206,
          "delta": 3205,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x001F24",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 3207,
          "delta": 3206,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x001E24",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 3208,
          "delta": 3207,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x001D24",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 3209,
          "delta": 3208,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x001C24",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 3210,
          "delta": 3209,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x001B24",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 3211,
          "delta": 3210,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x001A24",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 3212,
          "delta": 3211,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x001924",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 3213,
          "delta": 3212,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x001824",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 3214,
          "delta": 3213,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x001724",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 3215,
          "delta": 3214,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x001624",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 3216,
          "delta": 3215,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x001524",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 3217,
          "delta": 3216,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x001424",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 3218,
          "delta": 3217,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x001324",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 3219,
          "delta": 3218,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x001224",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 3220,
          "delta": 3219,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x001124",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 3221,
          "delta": 3220,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x001024",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 3222,
          "delta": 3221,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x000F24",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 3223,
          "delta": 3222,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x000E24",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 3224,
          "delta": 3223,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x000D24",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 3225,
          "delta": 3224,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x000C24",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 3226,
          "delta": 3225,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x000B24",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 3227,
          "delta": 3226,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x000A24",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 3228,
          "delta": 3227,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x000924",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 3229,
          "delta": 3228,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x000824",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 3230,
          "delta": 3229,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x000724",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 3231,
          "delta": 3230,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x000624",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 3232,
          "delta": 3231,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x000524",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 3233,
          "delta": 3232,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x000424",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 3234,
          "delta": 3233,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x000324",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 3235,
          "delta": 3234,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x000224",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 3236,
          "delta": 3235,
          "pc": "0x001377",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x000124",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 3237,
          "delta": 3236,
          "pc": "0x001379",
          "first": "in0 a, (0x03)",
          "last": "jr z, 0x00138a",
          "state": {
            "a": "0x76",
            "f": "0x42",
            "bc": "0x000024",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 3238,
          "delta": 3237,
          "pc": "0x00138A",
          "first": "ld a, 0x26",
          "last": "jr nz, 0x00139c",
          "state": {
            "a": "0xEE",
            "f": "0x54",
            "bc": "0x000024",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 3239,
          "delta": 3238,
          "pc": "0x001393",
          "first": "ld a, 0x03",
          "last": "jr z, 0x00139d",
          "state": {
            "a": "0x26",
            "f": "0x42",
            "bc": "0x000024",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 3240,
          "delta": 3239,
          "pc": "0x00139D",
          "first": "ld bc, 0x00a000",
          "last": "jr nz, 0x00139c",
          "state": {
            "a": "0x03",
            "f": "0x42",
            "bc": "0x000024",
            "hl": "0xD18C7C",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 3241,
          "delta": 3240,
          "pc": "0x0013C3",
          "first": "call 0x001988",
          "last": "call 0x001988",
          "state": {
            "a": "0x08",
            "f": "0x42",
            "bc": "0x00A005",
            "hl": "0x000000",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 3242,
          "delta": 3241,
          "pc": "0x001988",
          "first": "di",
          "last": "jr nz, 0x0019a9",
          "state": {
            "a": "0x08",
            "f": "0x42",
            "bc": "0x00A005",
            "hl": "0x000000",
            "iy": "0x3B001A",
            "sp": "0xD1A87B",
            "stack24": [
              "0x0013C7",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 3243,
          "delta": 3242,
          "pc": "0x001991",
          "first": "ld bc, 0x001005",
          "last": "jr z, 0x00199e",
          "state": {
            "a": "0xEE",
            "f": "0x54",
            "bc": "0x00A005",
            "hl": "0x000000",
            "iy": "0x3B001A",
            "sp": "0xD1A878",
            "stack24": [
              "0x00A005",
              "0x0013C7",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 3244,
          "delta": 3243,
          "pc": "0x00199E",
          "first": "ld a, b",
          "last": "jr z, 0x0019a4",
          "state": {
            "a": "0x04",
            "f": "0x42",
            "bc": "0x001005",
            "hl": "0x000000",
            "iy": "0x3B001A",
            "sp": "0xD1A878",
            "stack24": [
              "0x00A005",
              "0x0013C7",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 3245,
          "delta": 3244,
          "pc": "0x0019A4",
          "first": "ld a, c",
          "last": "jr nz, 0x0019a3",
          "state": {
            "a": "0x10",
            "f": "0x42",
            "bc": "0x001005",
            "hl": "0x000000",
            "iy": "0x3B001A",
            "sp": "0xD1A878",
            "stack24": [
              "0x00A005",
              "0x0013C7",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 3246,
          "delta": 3245,
          "pc": "0x0019A9",
          "first": "ld a, 0x03",
          "last": "jr z, 0x0019b3",
          "state": {
            "a": "0x05",
            "f": "0x42",
            "bc": "0x001005",
            "hl": "0x000000",
            "iy": "0x3B001A",
            "sp": "0xD1A878",
            "stack24": [
              "0x00A005",
              "0x0013C7",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 3247,
          "delta": 3246,
          "pc": "0x0019B3",
          "first": "pop bc",
          "last": "ret",
          "state": {
            "a": "0x03",
            "f": "0x42",
            "bc": "0x001005",
            "hl": "0x000000",
            "iy": "0x3B001A",
            "sp": "0xD1A878",
            "stack24": [
              "0x00A005",
              "0x0013C7",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 3248,
          "delta": 3247,
          "pc": "0x0013C7",
          "first": "ld a, 0xd0",
          "last": "call 0x0158de",
          "state": {
            "a": "0x03",
            "f": "0x42",
            "bc": "0x00A005",
            "hl": "0x000000",
            "iy": "0x3B001A",
            "sp": "0xD1A87E",
            "stack24": [
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 3249,
          "delta": 3248,
          "pc": "0x0158DE",
          "first": "ld iy, 0xd00080",
          "last": "ret nz",
          "state": {
            "a": "0xD0",
            "f": "0x42",
            "bc": "0x00A005",
            "hl": "0x000000",
            "iy": "0xD00080",
            "sp": "0xD1A87B",
            "stack24": [
              "0x0013DA",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        },
        {
          "block": 3250,
          "delta": 3249,
          "pc": "0x0158E8",
          "first": "call 0x0158bc",
          "last": "call 0x0158bc",
          "state": {
            "a": "0xD0",
            "f": "0x54",
            "bc": "0x00A005",
            "hl": "0x000000",
            "iy": "0xD00080",
            "sp": "0xD1A87B",
            "stack24": [
              "0x0013DA",
              "0x000000",
              "0x000000"
            ],
            "D0009B": "0x00",
            "D000C2": "0x00"
          }
        }
      ],
      "firstCleanupBlock": null,
      "firstWipeBlock": null,
      "events": [
        {
          "kind": "first-0158bc-owner-stop",
          "block": 3251,
          "delta": 3250,
          "steps": 3260,
          "pc": "0x0158BC",
          "state": {
            "pc": "0x0158BC",
            "a": "0xD0",
            "f": "0x54",
            "bc": "0x00A005",
            "de": "0xD1A7FC",
            "hl": "0x000000",
            "ix": "0x000000",
            "iy": "0xD00080",
            "sp": "0xD1A878",
            "stack24": [
              "0x0158EC",
              "0x0013DA",
              "0x000000",
              "0x000000",
              "0x000000",
              "0x000000"
            ],
            "errSp": "0xD1A863",
            "D00587": "0x00",
            "D0058C": "0x00",
            "D0058D": "0x00",
            "D0058E": "0x00",
            "D00080": "0x00",
            "D0009B": "0x00",
            "D0009F": "0x00",
            "D000A3": "0x0A",
            "D000C2": "0x00",
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D0231A": "0xD2A83E",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02587": "0xD3A854",
            "D02590": "0xD3FE81",
            "D02593": "0xD3FE81",
            "D0259A": "0xD3FE81",
            "D0259D": "0xD3FECD",
            "buffer": "0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00",
            "matrix3": "0xFF"
          }
        }
      ],
      "importantMetas": {
        "0x000038": {
          "pc": "0x000038",
          "mode": "adl",
          "first": "ex af, af'",
          "last": "jp 0x0006f3",
          "instructions": [
            "ex af, af'",
            "exx",
            "push ix",
            "push iy",
            "ld iy, 0xd00080",
            "jp 0x0006f3"
          ],
          "exits": [
            {
              "type": "jump",
              "target": "0x0006F3",
              "targetMode": "adl"
            }
          ]
        },
        "0x03FA09": {
          "pc": "0x03FA09",
          "mode": "adl",
          "first": "ld hl, 0xd00587",
          "last": "jp nz, 0x03fb9a",
          "instructions": [
            "ld hl, 0xd00587",
            "di",
            "ld a, (hl)",
            "ld (hl), 0x00",
            "res 3, (iy+0)",
            "ei",
            "push af",
            "or a",
            "jp nz, 0x03fb9a"
          ],
          "exits": [
            {
              "type": "branch",
              "target": "0x03FB9A",
              "targetMode": "adl"
            },
            {
              "type": "fallthrough",
              "target": "0x03FA1C",
              "targetMode": "adl"
            }
          ]
        },
        "0x001377": {
          "pc": "0x001377",
          "mode": "adl",
          "first": "djnz 0x001377",
          "last": "djnz 0x001377",
          "instructions": [
            "djnz 0x001377"
          ],
          "exits": [
            {
              "type": "branch",
              "target": "0x001377",
              "targetMode": "adl"
            },
            {
              "type": "fallthrough",
              "target": "0x001379",
              "targetMode": "adl"
            }
          ]
        },
        "0x001379": {
          "pc": "0x001379",
          "mode": "adl",
          "first": "in0 a, (0x03)",
          "last": "jr z, 0x00138a",
          "instructions": [
            "in0 a, (0x03)",
            "bit 4, a",
            "jr z, 0x00138a"
          ],
          "exits": [
            {
              "type": "branch",
              "target": "0x00138A",
              "targetMode": "adl"
            },
            {
              "type": "fallthrough",
              "target": "0x001380",
              "targetMode": "adl"
            }
          ]
        },
        "0x00138A": {
          "pc": "0x00138A",
          "mode": "adl",
          "first": "ld a, 0x26",
          "last": "jr nz, 0x00139c",
          "instructions": [
            "ld a, 0x26",
            "out0 (0x05), a",
            "cp 0x26",
            "jr nz, 0x00139c"
          ],
          "exits": [
            {
              "type": "branch",
              "target": "0x00139C",
              "targetMode": "adl"
            },
            {
              "type": "fallthrough",
              "target": "0x001393",
              "targetMode": "adl"
            }
          ]
        },
        "0x001393": {
          "pc": "0x001393",
          "mode": "adl",
          "first": "ld a, 0x03",
          "last": "jr z, 0x00139d",
          "instructions": [
            "ld a, 0x03",
            "out0 (0x06), a",
            "cp 0x03",
            "jr z, 0x00139d"
          ],
          "exits": [
            {
              "type": "branch",
              "target": "0x00139D",
              "targetMode": "adl"
            },
            {
              "type": "fallthrough",
              "target": "0x00139C",
              "targetMode": "adl"
            }
          ]
        },
        "0x00139D": {
          "pc": "0x00139D",
          "mode": "adl",
          "first": "ld bc, 0x00a000",
          "last": "jr nz, 0x00139c",
          "instructions": [
            "ld bc, 0x00a000",
            "xor a",
            "out (c), a",
            "inc c",
            "ld a, 0x0f",
            "out (c), a",
            "inc c",
            "xor a",
            "out (c), a",
            "inc c",
            "ld a, 0x0f",
            "out (c), a",
            "inc c",
            "ld a, 0x08",
            "out (c), a",
            "inc c"
          ],
          "exits": [
            {
              "type": "branch",
              "target": "0x00139C",
              "targetMode": "adl"
            },
            {
              "type": "fallthrough",
              "target": "0x0013C3",
              "targetMode": "adl"
            }
          ]
        },
        "0x0013C3": {
          "pc": "0x0013C3",
          "mode": "adl",
          "first": "call 0x001988",
          "last": "call 0x001988",
          "instructions": [
            "call 0x001988"
          ],
          "exits": [
            {
              "type": "call",
              "target": "0x001988",
              "targetMode": "adl"
            },
            {
              "type": "call-return",
              "target": "0x0013C7",
              "targetMode": "adl"
            }
          ]
        },
        "0x001988": {
          "pc": "0x001988",
          "mode": "adl",
          "first": "di",
          "last": "jr nz, 0x0019a9",
          "instructions": [
            "di",
            "push bc",
            "in0 a, (0x03)",
            "bit 4, a",
            "jr nz, 0x0019a9"
          ],
          "exits": [
            {
              "type": "branch",
              "target": "0x0019A9",
              "targetMode": "adl"
            },
            {
              "type": "fallthrough",
              "target": "0x001991",
              "targetMode": "adl"
            }
          ]
        },
        "0x001991": {
          "pc": "0x001991",
          "mode": "adl",
          "first": "ld bc, 0x001005",
          "last": "jr z, 0x00199e",
          "instructions": [
            "ld bc, 0x001005",
            "ld a, 0x04",
            "out (c), a",
            "cp 0x04",
            "jr z, 0x00199e"
          ],
          "exits": [
            {
              "type": "branch",
              "target": "0x00199E",
              "targetMode": "adl"
            },
            {
              "type": "fallthrough",
              "target": "0x00199D",
              "targetMode": "adl"
            }
          ]
        },
        "0x00199E": {
          "pc": "0x00199E",
          "mode": "adl",
          "first": "ld a, b",
          "last": "jr z, 0x0019a4",
          "instructions": [
            "ld a, b",
            "cp 0x10",
            "jr z, 0x0019a4"
          ],
          "exits": [
            {
              "type": "branch",
              "target": "0x0019A4",
              "targetMode": "adl"
            },
            {
              "type": "fallthrough",
              "target": "0x0019A3",
              "targetMode": "adl"
            }
          ]
        },
        "0x0019A4": {
          "pc": "0x0019A4",
          "mode": "adl",
          "first": "ld a, c",
          "last": "jr nz, 0x0019a3",
          "instructions": [
            "ld a, c",
            "cp 0x05",
            "jr nz, 0x0019a3"
          ],
          "exits": [
            {
              "type": "branch",
              "target": "0x0019A3",
              "targetMode": "adl"
            },
            {
              "type": "fallthrough",
              "target": "0x0019A9",
              "targetMode": "adl"
            }
          ]
        },
        "0x0019A9": {
          "pc": "0x0019A9",
          "mode": "adl",
          "first": "ld a, 0x03",
          "last": "jr z, 0x0019b3",
          "instructions": [
            "ld a, 0x03",
            "out0 (0x01), a",
            "cp 0x03",
            "jr z, 0x0019b3"
          ],
          "exits": [
            {
              "type": "branch",
              "target": "0x0019B3",
              "targetMode": "adl"
            },
            {
              "type": "fallthrough",
              "target": "0x0019B2",
              "targetMode": "adl"
            }
          ]
        },
        "0x0019B3": {
          "pc": "0x0019B3",
          "mode": "adl",
          "first": "pop bc",
          "last": "ret",
          "instructions": [
            "pop bc",
            "ret"
          ],
          "exits": [
            {
              "type": "return",
              "target": null,
              "targetMode": null
            }
          ]
        },
        "0x0013C7": {
          "pc": "0x0013C7",
          "mode": "adl",
          "first": "ld a, 0xd0",
          "last": "call 0x0158de",
          "instructions": [
            "ld a, 0xd0",
            "??? tag=ld-mb-a",
            "im 1",
            "ld iy, 0xd00080",
            "res 6, (iy+27)",
            "call 0x0158de"
          ],
          "exits": [
            {
              "type": "call",
              "target": "0x0158DE",
              "targetMode": "adl"
            },
            {
              "type": "call-return",
              "target": "0x0013DA",
              "targetMode": "adl"
            }
          ]
        },
        "0x0158DE": {
          "pc": "0x0158DE",
          "mode": "adl",
          "first": "ld iy, 0xd00080",
          "last": "ret nz",
          "instructions": [
            "ld iy, 0xd00080",
            "bit 7, (iy+66)",
            "ret nz"
          ],
          "exits": [
            {
              "type": "return-conditional",
              "target": null,
              "targetMode": null
            },
            {
              "type": "fallthrough",
              "target": "0x0158E8",
              "targetMode": "adl"
            }
          ]
        },
        "0x0158E8": {
          "pc": "0x0158E8",
          "mode": "adl",
          "first": "call 0x0158bc",
          "last": "call 0x0158bc",
          "instructions": [
            "call 0x0158bc"
          ],
          "exits": [
            {
              "type": "call",
              "target": "0x0158BC",
              "targetMode": "adl"
            },
            {
              "type": "call-return",
              "target": "0x0158EC",
              "targetMode": "adl"
            }
          ]
        },
        "0x0158BC": {
          "pc": "0x0158BC",
          "mode": "adl",
          "first": "ld de, 0x000330",
          "last": "call 0x001c55",
          "instructions": [
            "ld de, 0x000330",
            "call 0x001c55"
          ],
          "exits": [
            {
              "type": "call",
              "target": "0x001C55",
              "targetMode": "adl"
            },
            {
              "type": "call-return",
              "target": "0x0158C4",
              "targetMode": "adl"
            }
          ]
        }
      },
      "returnMetas": {
        "0x0158EC": {
          "pc": "0x0158EC",
          "mode": "adl",
          "first": "jr c, 0x0158f8",
          "last": "jr c, 0x0158f8",
          "instructions": [
            "jr c, 0x0158f8"
          ],
          "exits": [
            {
              "type": "branch",
              "target": "0x0158F8",
              "targetMode": "adl"
            },
            {
              "type": "fallthrough",
              "target": "0x0158EE",
              "targetMode": "adl"
            }
          ]
        },
        "0x0013DA": {
          "pc": "0x0013DA",
          "mode": "adl",
          "first": "jr z, 0x0013e4",
          "last": "jr z, 0x0013e4",
          "instructions": [
            "jr z, 0x0013e4"
          ],
          "exits": [
            {
              "type": "branch",
              "target": "0x0013E4",
              "targetMode": "adl"
            },
            {
              "type": "fallthrough",
              "target": "0x0013DC",
              "targetMode": "adl"
            }
          ]
        },
        "0x000000": {
          "pc": "0x000000",
          "mode": "adl",
          "first": "di",
          "last": "jp 0x000658",
          "instructions": [
            "di",
            "stmix",
            "jp 0x000658"
          ],
          "exits": [
            {
              "type": "jump",
              "target": "0x000658",
              "targetMode": "adl"
            }
          ]
        }
      }
    }
  ]
}
```


# Phase 851: Upstream Owner Chain Decode for 0x0A31E2 Input State

Probe: `probe-phase851-upstream-owner-chain.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase851-upstream-owner-chain.mjs`

## Summary

- Result: PASS. Phase850 dynamic evidence was parsed successfully and the owner-chain windows decoded coherently.
- `0x0A322B` does not initialize a new descriptor; it hardcodes `IX=0xD02504`, sets `(IY+5)` bit2, and calls `0x0A31FD`. The bad value is therefore already in the `D02504/D02505` window before this owner chain.
- `0x0A31FD` early-returns only when `(IX+1) - (IX+0) - 1 == 0`, meaning `IX+1 == IX+0 + 1`. With lifted `IX+0=0x00` and `IX+1=0x00`, the computed value is `0xFF`, so `RET Z` correctly does not fire and the chain falls through.
- Real captures show `D02504=0x00` and `D02505=0x0A` both before and after CLEAR. The lifted Phase850 sample has the 24-bit `IX+0` window as zero, so the specific mismatched input is **`D02505` / `IX+1` (lifted 0x00 vs real 0x0A)**, not `D02504`.
- `(IY+0x4A)` is bit3 clear in both lifted trace and real capture (`0x21`), so selecting the `D031F6` branch at `0x0A31D8` is not itself the bad branch.
- Nearby static decode confirms `0x058D65` can write `D02505=0x0A`; Phase850 recent path includes `0x058D60 -> 0x058D89`, which is the Z cleanup branch that skips that writer. The concrete next diagnostic is to confirm whether missed/cleared `D02505=0x0A` is the upstream state defect.

## Dynamic Samples From Phase850

| Sample | PC | Block # | AF | BC | DE | HL | SP | IX+0/IX+1/IX+2 bytes |
| --- | --- | ---: | --- | --- | --- | --- | --- | --- |
| owner entry 0x0A322B | - | - | - | - | - | - | - | - |
| gate entry 0x0A31FD | 0x0A31FD | 4972 | 0x0044 | 0x000100 | 0xD00595 | 0xD02504 | 0xD1A81B | 0x00 / 0x00 / 0x00 |
| fallthrough 0x0A3205 | 0x0A3205 | 4973 | 0xFFBA | 0x000100 | 0xD00595 | 0xD02504 | 0xD1A81B | 0x00 / 0x00 / 0x00 |
| branch test 0x0A31D8 | 0x0A31D8 | 4984 | 0x0600 | 0x00EC14 | 0xD031F6 | 0x000117 | 0xD1A815 | 0x00 / 0x00 / 0x00 |
| destructive owner 0x0A31E2 | 0x0A31E2 | 4985 | 0x0654 | 0x00EC14 | 0xD031F6 | 0x000117 | 0xD1A815 | 0x00 / 0x00 / 0x00 |

## Real Capture Inputs

| Name | Address | Real before byte | Real after byte | Real before 24-bit | Real after 24-bit |
| --- | --- | --- | --- | --- | --- |
| D02504 / IX+0 | 0xD02504 | 0x00 | 0x00 | 0x000A00 | 0x000A00 |
| D02505 / IX+1 | 0xD02505 | 0x0A | 0x0A | 0x00000A | 0x00000A |
| D02506 / IX+2 | 0xD02506 | 0x00 | 0x00 | 0x000000 | 0x000000 |
| D000CA / IY+0x4A | 0xD000CA | 0x21 | 0x21 | 0x000021 | 0x000021 |
| D0243A edit cursor | 0xD0243A | 0xCD | 0xCC | 0xD1A8CD | 0xD1A8CC |
| D02590 OPBase | 0xD02590 | 0x81 | 0x81 | 0xD3FE81 | 0xD3FE81 |

## Descriptor Algebra

```json
{
  "lifted": {
    "ix0": "0x00",
    "ix1": "0x00",
    "iy4a": "0x21",
    "afterSub": "0x00",
    "afterDec": "0xFF",
    "retZ": false,
    "bAfter3205": "0xEC",
    "aAfter2d4c": "0x25",
    "dAfter3216": "0x24",
    "firstCopyCount": "0x24E00",
    "destructiveCopyCount": "0x24E0",
    "firstDestEnd": "0xD45C7F",
    "secondBranchBase": "0xD031F6"
  },
  "realCapture": {
    "ix0": "0x00",
    "ix1": "0x0A",
    "iy4a": "0x21",
    "afterSub": "0x0A",
    "afterDec": "0x09",
    "retZ": false,
    "bAfter3205": "0xB4",
    "aAfter2d4c": "0xED",
    "dAfter3216": "0xEC",
    "firstCopyCount": "0x1C200",
    "destructiveCopyCount": "0x1C20",
    "firstDestEnd": "0xD6507F",
    "secondBranchBase": "0xD031F6"
  }
}
```

Interpretation: the lifted zeroed `D02505` expands the fallthrough value to `0xFF`, producing `B=0xEC` and the observed `0x24E0` destructive copy. The real `D02505=0x0A` would produce a different geometry (`B=0xB4`, destructive count `0x1C20`) before any later branch/copy effects.

## Decoded Owner Chain

### Immediate parent 0x0A20CC..0x0A20EE

| PC | Bytes | Decode |
| --- | --- | --- |
| 0x0A20CC | `F5` | `PUSH AF` |
| 0x0A20CD | `D5` | `PUSH DE` |
| 0x0A20CE | `E5` | `PUSH HL` |
| 0x0A20CF | `3E 19` | `LD A,0x19` |
| 0x0A20D1 | `40 32 96 05` | `LD (0x000596),A` |
| 0x0A20D5 | `11 95 05 D0` | `LD DE,0xD00595` |
| 0x0A20D9 | `1A` | `LD A,(DE)` |
| 0x0A20DA | `3D` | `DEC A` |
| 0x0A20DB | `21 04 25 D0` | `LD HL,0xD02504` |
| 0x0A20DF | `BE` | `CP (HL)` |
| 0x0A20E0 | `F2 F0 20 0A` | `JP P,0x0A20F0` |
| 0x0A20E4 | `FD CB 0D 56` | `BIT 2,(IY+13)` |
| 0x0A20E8 | `28 06` | `JR Z,0x0A20F0` |
| 0x0A20EA | `CD 1D 32 0A` | `CALL 0x0A321D` |

### Owner entry/save 0x0A321D..0x0A323A

| PC | Bytes | Decode |
| --- | --- | --- |
| 0x0A321D | `F5` | `PUSH AF` |
| 0x0A321E | `C5` | `PUSH BC` |
| 0x0A321F | `D5` | `PUSH DE` |
| 0x0A3220 | `E5` | `PUSH HL` |
| 0x0A3221 | `DD E5` | `PUSH IX` |
| 0x0A3223 | `ED 57` | `LD A,I` |
| 0x0A3225 | `EA 2B 32 0A` | `JP PE,0x0A322B` |
| 0x0A3229 | `ED 57` | `LD A,I` |
| 0x0A322B | `F3` | `DI` |
| 0x0A322C | `F5` | `PUSH AF` |
| 0x0A322D | `DD 21 04 25 D0` | `LD IX,0xD02504` |
| 0x0A3232 | `FD CB 05 D6` | `SET 2,(IY+5)` |
| 0x0A3236 | `CD FD 31 0A` | `CALL 0x0A31FD` |

### Descriptor gate 0x0A31FD..0x0A3216

| PC | Bytes | Decode |
| --- | --- | --- |
| 0x0A31FD | `DD 7E 01` | `LD A,(IX+1)` |
| 0x0A3200 | `DD 96 00` | `SUB (IX+0)` |
| 0x0A3203 | `3D` | `DEC A` |
| 0x0A3204 | `C8` | `RET Z` |
| 0x0A3205 | `FD CB 4C FE` | `SET 7,(IY+76)` |
| 0x0A3209 | `6F` | `LD L,A` |
| 0x0A320A | `26 14` | `LD H,0x14` |
| 0x0A320C | `ED 6C` | `MLT HL` |
| 0x0A320E | `45` | `LD B,L` |
| 0x0A320F | `DD 7E 01` | `LD A,(IX+1)` |
| 0x0A3212 | `CD 4C 2D 0A` | `CALL 0x0A2D4C` |

### Index transform 0x0A2D4C..0x0A2D57

| PC | Bytes | Decode |
| --- | --- | --- |
| 0x0A2D4C | `87` | `ADD A` |
| 0x0A2D4D | `C5` | `PUSH BC` |
| 0x0A2D4E | `47` | `LD B,A` |
| 0x0A2D4F | `87` | `ADD A` |
| 0x0A2D50 | `87` | `ADD A` |
| 0x0A2D51 | `80` | `ADD B` |
| 0x0A2D52 | `87` | `ADD A` |
| 0x0A2D53 | `C6 25` | `ADD 0x25` |
| 0x0A2D55 | `C1` | `POP BC` |
| 0x0A2D56 | `C9` | `RET` |

### Post-transform dispatch 0x0A3216..0x0A321D

| PC | Bytes | Decode |
| --- | --- | --- |
| 0x0A3216 | `3D` | `DEC A` |
| 0x0A3217 | `0E 14` | `LD C,0x14` |
| 0x0A3219 | `C3 46 31 0A` | `JP 0x0A3146` |

### Interrupt-save/copy setup 0x0A3146..0x0A3166

| PC | Bytes | Decode |
| --- | --- | --- |
| 0x0A3146 | `57` | `LD D,A` |
| 0x0A3147 | `ED 57` | `LD A,I` |
| 0x0A3149 | `EA 4F 31 0A` | `JP PE,0x0A314F` |
| 0x0A314D | `ED 57` | `LD A,I` |
| 0x0A314F | `F3` | `DI` |
| 0x0A3150 | `F5` | `PUSH AF` |
| 0x0A3151 | `D5` | `PUSH DE` |
| 0x0A3152 | `C5` | `PUSH BC` |
| 0x0A3153 | `69` | `LD L,C` |
| 0x0A3154 | `CD F6 31 0A` | `CALL 0x0A31F6` |
| 0x0A3158 | `E5` | `PUSH HL` |
| 0x0A3159 | `FD CB 4C 7E` | `BIT 7,(IY+76)` |
| 0x0A315D | `C2 A6 31 0A` | `JP NZ,0x0A31A6` |
| 0x0A3161 | `6A` | `LD L,D` |
| 0x0A3162 | `CD F6 31 0A` | `CALL 0x0A31F6` |

### Scale helper 0x0A31F6..0x0A31FD

| PC | Bytes | Decode |
| --- | --- | --- |
| 0x0A31F6 | `26 A0` | `LD H,0xA0` |
| 0x0A31F8 | `ED 6C` | `MLT HL` |
| 0x0A31FA | `29` | `ADD HL,HL` |
| 0x0A31FB | `29` | `ADD HL,HL` |
| 0x0A31FC | `C9` | `RET` |

### Second geometry leg 0x0A3158..0x0A3166

| PC | Bytes | Decode |
| --- | --- | --- |
| 0x0A3158 | `E5` | `PUSH HL` |
| 0x0A3159 | `FD CB 4C 7E` | `BIT 7,(IY+76)` |
| 0x0A315D | `C2 A6 31 0A` | `JP NZ,0x0A31A6` |
| 0x0A3161 | `6A` | `LD L,D` |
| 0x0A3162 | `CD F6 31 0A` | `CALL 0x0A31F6` |

### Destination/source setup 0x0A31A6..0x0A31B8

| PC | Bytes | Decode |
| --- | --- | --- |
| 0x0A31A6 | `6A` | `LD L,D` |
| 0x0A31A7 | `2C` | `INC L` |
| 0x0A31A8 | `CD F6 31 0A` | `CALL 0x0A31F6` |
| 0x0A31AC | `2B` | `DEC HL` |
| 0x0A31AD | `11 00 00 D4` | `LD DE,0xD40000` |
| 0x0A31B1 | `19` | `ADD HL,DE` |
| 0x0A31B2 | `EB` | `EX DE,HL` |
| 0x0A31B3 | `68` | `LD L,B` |
| 0x0A31B4 | `CD F6 31 0A` | `CALL 0x0A31F6` |

### Bulk copy pair 0x0A31B8..0x0A31F6

| PC | Bytes | Decode |
| --- | --- | --- |
| 0x0A31B8 | `E5` | `PUSH HL` |
| 0x0A31B9 | `C1` | `POP BC` |
| 0x0A31BA | `E1` | `POP HL` |
| 0x0A31BB | `EB` | `EX DE,HL` |
| 0x0A31BC | `E5` | `PUSH HL` |
| 0x0A31BD | `B7` | `OR A` |
| 0x0A31BE | `ED 52` | `SBC HL,DE` |
| 0x0A31C0 | `D1` | `POP DE` |
| 0x0A31C1 | `ED B8` | `LDDR` |
| 0x0A31C3 | `C1` | `POP BC` |
| 0x0A31C4 | `F1` | `POP AF` |
| 0x0A31C5 | `69` | `LD L,C` |
| 0x0A31C6 | `26 28` | `LD H,0x28` |
| 0x0A31C8 | `ED 6C` | `MLT HL` |
| 0x0A31CA | `E5` | `PUSH HL` |
| 0x0A31CB | `D6 1E` | `SUB 0x1E` |
| 0x0A31CD | `6F` | `LD L,A` |
| 0x0A31CE | `2C` | `INC L` |
| 0x0A31CF | `26 28` | `LD H,0x28` |
| 0x0A31D1 | `ED 6C` | `MLT HL` |
| 0x0A31D3 | `2B` | `DEC HL` |
| 0x0A31D4 | `11 F6 31 D0` | `LD DE,0xD031F6` |
| 0x0A31D8 | `FD CB 4A 5E` | `BIT 3,(IY+74)` |
| 0x0A31DC | `28 04` | `JR Z,0x0A31E2` |
| 0x0A31DE | `11 C6 52 D0` | `LD DE,0xD052C6` |
| 0x0A31E2 | `19` | `ADD HL,DE` |
| 0x0A31E3 | `EB` | `EX DE,HL` |
| 0x0A31E4 | `68` | `LD L,B` |
| 0x0A31E5 | `26 28` | `LD H,0x28` |
| 0x0A31E7 | `ED 6C` | `MLT HL` |
| 0x0A31E9 | `E5` | `PUSH HL` |
| 0x0A31EA | `C1` | `POP BC` |
| 0x0A31EB | `E1` | `POP HL` |
| 0x0A31EC | `EB` | `EX DE,HL` |
| 0x0A31ED | `E5` | `PUSH HL` |
| 0x0A31EE | `B7` | `OR A` |
| 0x0A31EF | `ED 52` | `SBC HL,DE` |
| 0x0A31F1 | `D1` | `POP DE` |
| 0x0A31F2 | `ED B8` | `LDDR` |
| 0x0A31F4 | `18 AC` | `JR 0x0A31A2` |

### Nearby D02505 writer 0x058D54..0x058D8E

| PC | Bytes | Decode |
| --- | --- | --- |
| 0x058D54 | `CD C6 8E 05` | `CALL 0x058EC6` |
| 0x058D58 | `FD CB 45 BE` | `RES 7,(IY+69)` |
| 0x058D5C | `CD A8 00 08` | `CALL 0x0800A8` |
| 0x058D60 | `28 27` | `JR Z,0x058D89` |
| 0x058D62 | `F5` | `PUSH AF` |
| 0x058D63 | `3E 0A` | `LD A,0x0A` |
| 0x058D65 | `32 05 25 D0` | `LD (0xD02505),A` |
| 0x058D69 | `40 ED 5B 53 11` | `LD DE,(0x001153)` |
| 0x058D6E | `16 00` | `LD D,0x00` |
| 0x058D70 | `CD 41 D3 0B` | `CALL 0x0BD341` |
| 0x058D74 | `3A 85 26 D0` | `LD A,(0xD02685)` |
| 0x058D78 | `32 87 26 D0` | `LD (0xD02687),A` |
| 0x058D7C | `CD 8D 9A 06` | `CALL 0x069A8D` |
| 0x058D80 | `FD CB 0C A6` | `RES 4,(IY+12)` |
| 0x058D84 | `CD 65 8C 05` | `CALL 0x058C65` |
| 0x058D88 | `F1` | `POP AF` |
| 0x058D89 | `FD CB 01 9E` | `RES 3,(IY+1)` |
| 0x058D8D | `C9` | `RET` |

## Fix Direction for Next Phase

- Phase852 should test the narrow upstream input, not a downstream force-restore: set only `D02505=0x0A` at the `0x0A322B`/`0x0A31FD` boundary and verify whether the `0x0A31F2` source/destination no longer zeroes `D0243A/D0243D/D02590/D0259D` or enters the closed `0x0A1854` artifact.
- If that A/B confirms the direction, the later real fix should trace why the lifted CLEAR route reaches this owner with `D02505=0x00` despite real hardware holding `0x0A`; likely writer candidates include the non-Z path through `0x058D54..0x058D65` or other display-window setup routines already decoded around `0x0A2802`/`0x0A223A`.

## Machine Summary

```json
{
  "probe": "phase851-upstream-owner-chain",
  "pass": true,
  "checks": {
    "phase850Pass": true,
    "criticalSamplesPresent": true,
    "gateHasRetZ": true,
    "ownerHardcodesIx": true,
    "branchReadsIy4a": true,
    "d02505WriterDecoded": true,
    "liftedIx1Zero": true,
    "realIx1Ten": true,
    "iy4aBranchMatchesReal": true,
    "liftedRetZFalse": true,
    "phase850RecentPathSkipsD02505Writer": true
  },
  "phase850Result": {
    "steps": 4986,
    "termination": "captured-0a31e2-to-0a31a2",
    "lastPc": "0x0A31A2",
    "lastMode": "adl",
    "stopReason": "captured-0a31e2-to-0a31a2"
  },
  "phase850RecentPath": [
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
    "0x03D1C3",
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
    "0x080259",
    "0x0800B2",
    "0x058D60",
    "0x058D89",
    "0x0589E9",
    "0x0589EF",
    "0x058A0C",
    "0x058A10",
    "0x058212",
    "0x0800B8",
    "0x058216",
    "0x05821D",
    "0x05E3E3",
    "0x05E3F5",
    "0x04C973",
    "0x05E3E7",
    "0x05E3E8",
    "0x04C973",
    "0x058221",
    "0x058A14",
    "0x058A2C",
    "0x0800B8",
    "0x058A30",
    "0x058A4C",
    "0x05E7CD",
    "0x05E242",
    "0x05E3E8",
    "0x04C973",
    "0x05E246",
    "0x05E247",
    "0x05E3EC",
    "0x04C973",
    "0x05E24C",
    "0x05E250",
    "0x080064",
    "0x05E256",
    "0x05E26C",
    "0x05E7D1",
    "0x05E7D2",
    "0x0A2B72",
    "0x0A2A68",
    "0x0A2AF9",
    "0x0A2B16",
    "0x0A2B51",
    "0x0A2B7E",
    "0x0A2B8F",
    "0x0A2BEB",
    "0x0A2C0C",
    "0x0A2C10",
    "0x0A20CC",
    "0x0A20E4",
    "0x0A20EA",
    "0x0A321D",
    "0x0A322B",
    "0x0A31FD",
    "0x0A3205",
    "0x0A2D4C",
    "0x0A3216",
    "0x0A3146",
    "0x0A314D",
    "0x0A31F6",
    "0x0A3158",
    "0x0A31A6",
    "0x0A31F6",
    "0x0A31AC",
    "0x0A31F6",
    "0x0A31B8",
    "0x0A31E2"
  ],
  "liftedInputs": {
    "ixWindow24At0A31FD": "0x000000",
    "ix0": "0x00",
    "ix1": "0x00",
    "iy4a": "0x21"
  },
  "realInputs": {
    "D02504 / IX+0": {
      "name": "D02504 / IX+0",
      "addr": "0xD02504",
      "preByte": "0x00",
      "afterByte": "0x00",
      "pre24": "0x000A00",
      "after24": "0x000A00"
    },
    "D02505 / IX+1": {
      "name": "D02505 / IX+1",
      "addr": "0xD02505",
      "preByte": "0x0A",
      "afterByte": "0x0A",
      "pre24": "0x00000A",
      "after24": "0x00000A"
    },
    "D02506 / IX+2": {
      "name": "D02506 / IX+2",
      "addr": "0xD02506",
      "preByte": "0x00",
      "afterByte": "0x00",
      "pre24": "0x000000",
      "after24": "0x000000"
    },
    "D000CA / IY+0x4A": {
      "name": "D000CA / IY+0x4A",
      "addr": "0xD000CA",
      "preByte": "0x21",
      "afterByte": "0x21",
      "pre24": "0x000021",
      "after24": "0x000021"
    },
    "D0243A edit cursor": {
      "name": "D0243A edit cursor",
      "addr": "0xD0243A",
      "preByte": "0xCD",
      "afterByte": "0xCC",
      "pre24": "0xD1A8CD",
      "after24": "0xD1A8CC"
    },
    "D02590 OPBase": {
      "name": "D02590 OPBase",
      "addr": "0xD02590",
      "preByte": "0x81",
      "afterByte": "0x81",
      "pre24": "0xD3FE81",
      "after24": "0xD3FE81"
    }
  }
}
```

No runtime, transpiler, browser-shell, decoder, peripheral, scheduler, or ROM artifact files were changed.

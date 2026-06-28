# Phase 872: D010 Mirror Packet / Port-Bit A/B Adjudication

Probe: `probe-phase872-d010-port-bit-ab.mjs`  
Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase872-d010-port-bit-ab.mjs`

## Summary

- Result: PASS.
- D010-only replay observed: yes; route changed vs baseline: no.
- Port-bit skip observed: yes; bypassed 0x001879/0x0018F8: no.
- Combined D010+port skip observed: yes; bypassed wipe: no.
- Adjudication: D010-only replay does not change the live route: it still falls through 0x001872 to 0x001879 and the post-key core fields remain non-oracle. Forcing port 0x03 bit 4 set was observed, but it was not sufficient to avoid the wipe in the bounded route. Combining D010 replay with the port-bit skip still does not produce an oracle-compatible post-key state.

## Variant Counts

| Variant | D010 replay | Port override | 0x001872 | 0x0018AF | 0x001879 | 0x0018F8 | 0x006D64 | Wipes | Termination | Core oracle? |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: |
| baseline | 0 | 0 | 1 | 0 | 1 | 1 | 9167 | 1 | max_steps | 0 |
| D010 replay only | 1 | 0 | 1 | 0 | 1 | 1 | 9167 | 1 | max_steps | 0 |
| port bit skip only | 0 | 1 | 1 | 1 | 0 | 1 | 9041 | 1 | max_steps | 0 |
| D010 replay + port bit skip | 1 | 1 | 1 | 1 | 0 | 1 | 9041 | 1 | max_steps | 0 |

## D010 Replay Check

| Variant | Replay applied | After-boot D010EF | After-boot D010FE | After-boot D010F4 | Matches oracle after boot? |
| --- | ---: | --- | --- | --- | ---: |
| baseline | 0 | 0x000000 | 0x000000 | 0x00 | 0 |
| D010 replay only | 1 | 0xD2A83E | 0xD1A8CC | 0x1F | 1 |
| port bit skip only | 0 | 0x000000 | 0x000000 | 0x00 | 0 |
| D010 replay + port bit skip | 1 | 0xD2A83E | 0xD1A8CC | 0x1F | 1 |
| oracle | - | 0xD2A83E | 0xD1A8CC | 0x1F | - |

## Branch Edges

| Variant | 0x001872 outcome | Skip entry | 0x001879 entry | 0x0018F8 entry |
| --- | --- | --- | --- | --- |
| baseline | 0x001872 -> 0x001879 | - -> - | 0x001872 -> 0x001879 | 0x001879 -> 0x0018F8 |
| D010 replay only | 0x001872 -> 0x001879 | - -> - | 0x001872 -> 0x001879 | 0x001879 -> 0x0018F8 |
| port bit skip only | 0x001872 -> 0x0018AF | 0x001872 -> 0x0018AF | - -> - | 0x001881 -> 0x0018F8 |
| D010 replay + port bit skip | 0x001872 -> 0x0018AF | 0x001872 -> 0x0018AF | - -> - | 0x001881 -> 0x0018F8 |

## Post-Key Field Comparison

| Field | Oracle after CLEAR | baseline | D010 replay only | port bit skip only | D010 replay + port bit skip |
| --- | --- | --- | --- | --- | --- |
| D007CA | 0x0585E9 | 0x000000 | 0x000000 | 0x000000 | 0x000000 |
| D008E0 | 0xD1A86C | 0x000000 | 0x000000 | 0x000000 | 0x000000 |
| D010EF | 0xD2A83E | 0x000000 | 0x000000 | 0x000000 | 0x000000 |
| D010FE | 0xD1A8CC | 0x000000 | 0x000000 | 0x000000 | 0x000000 |
| D010F4 | 0x1F | 0x00 | 0x00 | 0x00 | 0x00 |
| D02437 | 0xD1A8CC | 0x000000 | 0x000000 | 0x000000 | 0x000000 |
| D0243A | 0xD1A8CC | 0x000000 | 0x000000 | 0x000000 | 0x000000 |
| D0243D | 0xD2A83E | 0x000000 | 0x000000 | 0x000000 | 0x000000 |
| D02440 | 0xD2A83E | 0x000000 | 0x000000 | 0x000000 | 0x000000 |
| D02505 | 0x0A | 0x00 | 0x00 | 0x00 | 0x00 |
| D02590 | 0xD3FE81 | 0x000000 | 0x000000 | 0x000000 | 0x000000 |
| D0259D | 0xD3FECD | 0x000000 | 0x000000 | 0x000000 | 0x000000 |
| D02A29 | 0x0000 | 0x0000 | 0x0000 | 0x0000 | 0x0000 |

## Static Decode: 0x001872 Port Branch

| PC | Bytes | Instruction |
| --- | --- | --- |
| 0x00186A | `FD CB 42 BE` | indexed-cb-res {"bit":7,"indexRegister":"iy","displacement":66,"mode":"adl","modePrefix":null} |
| 0x00186E | `CD DE 58 01` | CALL 0x0158DE |
| 0x001872 | `ED 38 03` | in0 {"reg":"a","port":3,"mode":"adl","modePrefix":null} |
| 0x001875 | `CB 67` | bit-test {"bit":4,"reg":"a","mode":"adl","modePrefix":null} |
| 0x001877 | `20 36` | JR NZ, 0x0018AF |
| 0x001879 | `ED 38 09` | in0 {"reg":"a","port":9,"mode":"adl","modePrefix":null} |
| 0x00187C | `CB E7` | bit-set {"bit":4,"reg":"a","mode":"adl","modePrefix":null} |
| 0x00187E | `ED 39 09` | out0 {"reg":"a","port":9,"mode":"adl","modePrefix":null} |
| 0x001881 | `21 00 00 D0` | LD HL, 0xD00000 |
| 0x001885 | `11 01 00 D0` | LD DE, 0xD00001 |
| 0x001889 | `01 D7 3F 01` | LD BC, 0x013FD7 |
| 0x00188D | `36 00` | LD (?), 0x00 |
| 0x00188F | `ED B0` | LDIR |
| 0x001891 | `21 7C 78 D1` | LD HL, 0xD1787C |
| 0x001895 | `11 7D 78 D1` | LD DE, 0xD1787D |
| 0x001899 | `01 01 20 00` | LD BC, 0x002001 |
| 0x00189D | `36 00` | LD (?), 0x00 |
| 0x00189F | `ED B0` | LDIR |
| 0x0018A1 | `21 FF FE D3` | LD HL, 0xD3FEFF |
| 0x0018A5 | `11 00 FF D3` | LD DE, 0xD3FF00 |
| 0x0018A9 | `01 FF 00 00` | LD BC, 0x0000FF |
| 0x0018AD | `18 49` | JR 0x0018F8 |
| 0x0018AF | `ED 38 07` | in0 {"reg":"a","port":7,"mode":"adl","modePrefix":null} |

## Static Decode: D010FE Consumer / Edit-Pointer Writer Window

| PC | Bytes | Instruction |
| --- | --- | --- |
| 0x0A2DC0 | `08` | ex-af {"mode":"adl","modePrefix":null} |
| 0x0A2DC1 | `78` | ld-reg-reg {"dest":"a","src":"b","mode":"adl","modePrefix":null} |
| 0x0A2DC2 | `C3 09 C5 08` | JP 0x08C509 |
| 0x0A2DC6 | `CD 0D C9 04` | CALL 0x04C90D |
| 0x0A2DCA | `D5` | PUSH DE |
| 0x0A2DCB | `CD 0D C9 04` | CALL 0x04C90D |
| 0x0A2DCF | `22 37 24 D0` | ld-pair-mem {"pair":"hl","addr":13640759,"direction":"to-mem","mode":"adl","modePrefix":null} |
| 0x0A2DD3 | `19` | ADD HL, DE |
| 0x0A2DD4 | `22 3A 24 D0` | ld-pair-mem {"pair":"hl","addr":13640762,"direction":"to-mem","mode":"adl","modePrefix":null} |
| 0x0A2DD8 | `EB` | EX DE,HL |
| 0x0A2DD9 | `2A FE 10 D0` | ld-pair-mem {"pair":"hl","addr":13635838,"direction":"from-mem","mode":"adl","modePrefix":null} |
| 0x0A2DDD | `B7` | OR A |
| 0x0A2DDE | `ED 52` | sbc-pair {"src":"de","mode":"adl","modePrefix":null} |
| 0x0A2DE0 | `F5` | PUSH AF |

## Machine JSON

```json
{
  "pass": true,
  "adjudication": {
    "pass": true,
    "variants": {
      "baseline": {
        "label": "baseline",
        "routeKind": "live-browser-baseline",
        "status": "Key: CLEAR → 160000 steps (max_steps, peak 8689px)",
        "config": {
          "forceD02437": null,
          "replayD010Packet": false,
          "forcePort03Bit4": false
        },
        "d010ReplayApplied": false,
        "port03OverrideApplied": false,
        "termination": "max_steps",
        "steps": 160000,
        "wipes": 1,
        "vramPeak": 8689,
        "vramCurrent": 3031,
        "pageErrors": [],
        "counts": {
          "anchor0A229D": 1,
          "branch001872": 1,
          "skip0018AF": 0,
          "preWipe001879": 1,
          "cleanup0018F8": 1,
          "poll006D64": 9167,
          "owner0A31FD": 0
        },
        "afterBootD010": {
          "D010EF": "0x000000",
          "D010FE": "0x000000",
          "D010F4": "0x00"
        },
        "postD010ReplayFields": {
          "D010EF": "0x000000",
          "D010FE": "0x000000",
          "D010F4": "0x00"
        },
        "endFields": {
          "D007CA": "0x000000",
          "D008E0": "0x000000",
          "D010EF": "0x000000",
          "D010FE": "0x000000",
          "D010F4": "0x00",
          "D02437": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02440": "0x000000",
          "D02505": "0x00",
          "D02590": "0x000000",
          "D0259D": "0x000000",
          "D02A29": "0x0000"
        },
        "keyFields": {
          "D007CA": "0x000000",
          "D008E0": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D000C2": "0x00"
        },
        "matches": {
          "afterBootD010MatchesOracle": false,
          "postKeyD010MatchesOracle": false,
          "postKeyCoreMatchesOracle": false
        },
        "branchEdge": {
          "from": {
            "index": 5400,
            "block": 77343,
            "pc": "0x001872",
            "prevPc": "0x0158F8",
            "af": "0x0044",
            "bc": "0x000003",
            "de": "0x000430",
            "hl": "0x000000",
            "sp": "0xD1A87B",
            "stack0": "0x0013E8",
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D010EF": "0x000000",
            "D010FE": "0x000000",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D0066F": "0xD1A8A1",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD"
          },
          "to": {
            "index": 5400,
            "block": 77344,
            "pc": "0x001879",
            "prevPc": "0x001872",
            "af": "0xEE54",
            "bc": "0x000003",
            "de": "0x000430",
            "hl": "0x000000",
            "sp": "0xD1A87B",
            "stack0": "0x0013E8",
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D010EF": "0x000000",
            "D010FE": "0x000000",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D0066F": "0xD1A8A1",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD"
          }
        },
        "skipEdge": null,
        "preWipeEdge": {
          "from": {
            "pc": "0x001872"
          },
          "to": {
            "index": 5400,
            "block": 77344,
            "pc": "0x001879",
            "prevPc": "0x001872",
            "af": "0xEE54",
            "bc": "0x000003",
            "de": "0x000430",
            "hl": "0x000000",
            "sp": "0xD1A87B",
            "stack0": "0x0013E8",
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D010EF": "0x000000",
            "D010FE": "0x000000",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D0066F": "0xD1A8A1",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD"
          }
        },
        "cleanupEdge": {
          "from": {
            "pc": "0x001879"
          },
          "to": {
            "index": 5400,
            "block": 77345,
            "pc": "0x0018F8",
            "prevPc": "0x001879",
            "af": "0x5200",
            "bc": "0x0000FF",
            "de": "0xD3FF00",
            "hl": "0xD3FEFF",
            "sp": "0xD1A87B",
            "stack0": "0x0013E8",
            "D007CA": "0x000000",
            "D008E0": "0x000000",
            "D010EF": "0x000000",
            "D010FE": "0x000000",
            "D02317": "0x000000",
            "D0231A": "0x000000",
            "D0231D": "0x000000",
            "D0066F": "0x000000",
            "D02437": "0x000000",
            "D0243A": "0x000000",
            "D0243D": "0x000000",
            "D02440": "0x000000",
            "D02505": "0x00",
            "D02590": "0x000000",
            "D0259D": "0x000000"
          }
        }
      },
      "d010Replay": {
        "label": "D010 replay only",
        "routeKind": "live-browser-d010-replay",
        "status": "Key: CLEAR → 160000 steps (max_steps, peak 8689px)",
        "config": {
          "forceD02437": null,
          "replayD010Packet": true,
          "forcePort03Bit4": false
        },
        "d010ReplayApplied": true,
        "port03OverrideApplied": false,
        "termination": "max_steps",
        "steps": 160000,
        "wipes": 1,
        "vramPeak": 8689,
        "vramCurrent": 3031,
        "pageErrors": [],
        "counts": {
          "anchor0A229D": 1,
          "branch001872": 1,
          "skip0018AF": 0,
          "preWipe001879": 1,
          "cleanup0018F8": 1,
          "poll006D64": 9167,
          "owner0A31FD": 0
        },
        "afterBootD010": {
          "D010EF": "0xD2A83E",
          "D010FE": "0xD1A8CC",
          "D010F4": "0x1F"
        },
        "postD010ReplayFields": {
          "D010EF": "0xD2A83E",
          "D010FE": "0xD1A8CC",
          "D010F4": "0x1F"
        },
        "endFields": {
          "D007CA": "0x000000",
          "D008E0": "0x000000",
          "D010EF": "0x000000",
          "D010FE": "0x000000",
          "D010F4": "0x00",
          "D02437": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02440": "0x000000",
          "D02505": "0x00",
          "D02590": "0x000000",
          "D0259D": "0x000000",
          "D02A29": "0x0000"
        },
        "keyFields": {
          "D007CA": "0x000000",
          "D008E0": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D000C2": "0x00"
        },
        "matches": {
          "afterBootD010MatchesOracle": true,
          "postKeyD010MatchesOracle": false,
          "postKeyCoreMatchesOracle": false
        },
        "branchEdge": {
          "from": {
            "index": 5400,
            "block": 77343,
            "pc": "0x001872",
            "prevPc": "0x0158F8",
            "af": "0x0044",
            "bc": "0x000003",
            "de": "0x000430",
            "hl": "0x000000",
            "sp": "0xD1A87B",
            "stack0": "0x0013E8",
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D010EF": "0xD2A83E",
            "D010FE": "0xD1A8CC",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D0066F": "0xD1A8A1",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD"
          },
          "to": {
            "index": 5400,
            "block": 77344,
            "pc": "0x001879",
            "prevPc": "0x001872",
            "af": "0xEE54",
            "bc": "0x000003",
            "de": "0x000430",
            "hl": "0x000000",
            "sp": "0xD1A87B",
            "stack0": "0x0013E8",
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D010EF": "0xD2A83E",
            "D010FE": "0xD1A8CC",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D0066F": "0xD1A8A1",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD"
          }
        },
        "skipEdge": null,
        "preWipeEdge": {
          "from": {
            "pc": "0x001872"
          },
          "to": {
            "index": 5400,
            "block": 77344,
            "pc": "0x001879",
            "prevPc": "0x001872",
            "af": "0xEE54",
            "bc": "0x000003",
            "de": "0x000430",
            "hl": "0x000000",
            "sp": "0xD1A87B",
            "stack0": "0x0013E8",
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D010EF": "0xD2A83E",
            "D010FE": "0xD1A8CC",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D0066F": "0xD1A8A1",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD"
          }
        },
        "cleanupEdge": {
          "from": {
            "pc": "0x001879"
          },
          "to": {
            "index": 5400,
            "block": 77345,
            "pc": "0x0018F8",
            "prevPc": "0x001879",
            "af": "0x5200",
            "bc": "0x0000FF",
            "de": "0xD3FF00",
            "hl": "0xD3FEFF",
            "sp": "0xD1A87B",
            "stack0": "0x0013E8",
            "D007CA": "0x000000",
            "D008E0": "0x000000",
            "D010EF": "0x000000",
            "D010FE": "0x000000",
            "D02317": "0x000000",
            "D0231A": "0x000000",
            "D0231D": "0x000000",
            "D0066F": "0x000000",
            "D02437": "0x000000",
            "D0243A": "0x000000",
            "D0243D": "0x000000",
            "D02440": "0x000000",
            "D02505": "0x00",
            "D02590": "0x000000",
            "D0259D": "0x000000"
          }
        }
      },
      "portSkip": {
        "label": "port bit skip only",
        "routeKind": "live-browser-port03-bit4-skip",
        "status": "Key: CLEAR → 160000 steps (max_steps, peak 8689px)",
        "config": {
          "forceD02437": null,
          "replayD010Packet": false,
          "forcePort03Bit4": true
        },
        "d010ReplayApplied": false,
        "port03OverrideApplied": true,
        "termination": "max_steps",
        "steps": 160000,
        "wipes": 1,
        "vramPeak": 8689,
        "vramCurrent": 3031,
        "pageErrors": [],
        "counts": {
          "anchor0A229D": 1,
          "branch001872": 1,
          "skip0018AF": 1,
          "preWipe001879": 0,
          "cleanup0018F8": 1,
          "poll006D64": 9041,
          "owner0A31FD": 0
        },
        "afterBootD010": {
          "D010EF": "0x000000",
          "D010FE": "0x000000",
          "D010F4": "0x00"
        },
        "postD010ReplayFields": {
          "D010EF": "0x000000",
          "D010FE": "0x000000",
          "D010F4": "0x00"
        },
        "endFields": {
          "D007CA": "0x000000",
          "D008E0": "0x000000",
          "D010EF": "0x000000",
          "D010FE": "0x000000",
          "D010F4": "0x00",
          "D02437": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02440": "0x000000",
          "D02505": "0x00",
          "D02590": "0x000000",
          "D0259D": "0x000000",
          "D02A29": "0x0000"
        },
        "keyFields": {
          "D007CA": "0x000000",
          "D008E0": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D000C2": "0x00"
        },
        "matches": {
          "afterBootD010MatchesOracle": false,
          "postKeyD010MatchesOracle": false,
          "postKeyCoreMatchesOracle": false
        },
        "branchEdge": {
          "from": {
            "index": 5400,
            "block": 78211,
            "pc": "0x001872",
            "prevPc": "0x0158F8",
            "af": "0x0044",
            "bc": "0x000003",
            "de": "0x000430",
            "hl": "0x000000",
            "sp": "0xD1A87B",
            "stack0": "0x0013E8",
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D010EF": "0x000000",
            "D010FE": "0x000000",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D0066F": "0xD1A8A1",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD"
          },
          "to": {
            "index": 5400,
            "block": 78212,
            "pc": "0x0018AF",
            "prevPc": "0x001872",
            "af": "0xFE10",
            "bc": "0x000003",
            "de": "0x000430",
            "hl": "0x000000",
            "sp": "0xD1A87B",
            "stack0": "0x0013E8",
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D010EF": "0x000000",
            "D010FE": "0x000000",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D0066F": "0xD1A8A1",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD"
          }
        },
        "skipEdge": {
          "from": {
            "pc": "0x001872"
          },
          "to": {
            "index": 5400,
            "block": 78212,
            "pc": "0x0018AF",
            "prevPc": "0x001872",
            "af": "0xFE10",
            "bc": "0x000003",
            "de": "0x000430",
            "hl": "0x000000",
            "sp": "0xD1A87B",
            "stack0": "0x0013E8",
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D010EF": "0x000000",
            "D010FE": "0x000000",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D0066F": "0xD1A8A1",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD"
          }
        },
        "preWipeEdge": null,
        "cleanupEdge": {
          "from": {
            "pc": "0x001881"
          },
          "to": {
            "index": 5400,
            "block": 78215,
            "pc": "0x0018F8",
            "prevPc": "0x001881",
            "af": "0x5281",
            "bc": "0x0000FF",
            "de": "0xD3FF00",
            "hl": "0xD3FEFF",
            "sp": "0xD1A87B",
            "stack0": "0x0013E8",
            "D007CA": "0x000000",
            "D008E0": "0x000000",
            "D010EF": "0x000000",
            "D010FE": "0x000000",
            "D02317": "0x000000",
            "D0231A": "0x000000",
            "D0231D": "0x000000",
            "D0066F": "0x000000",
            "D02437": "0x000000",
            "D0243A": "0x000000",
            "D0243D": "0x000000",
            "D02440": "0x000000",
            "D02505": "0x00",
            "D02590": "0x000000",
            "D0259D": "0x000000"
          }
        }
      },
      "combined": {
        "label": "D010 replay + port bit skip",
        "routeKind": "live-browser-d010-plus-port03-bit4-skip",
        "status": "Key: CLEAR → 160000 steps (max_steps, peak 8689px)",
        "config": {
          "forceD02437": null,
          "replayD010Packet": true,
          "forcePort03Bit4": true
        },
        "d010ReplayApplied": true,
        "port03OverrideApplied": true,
        "termination": "max_steps",
        "steps": 160000,
        "wipes": 1,
        "vramPeak": 8689,
        "vramCurrent": 3031,
        "pageErrors": [],
        "counts": {
          "anchor0A229D": 1,
          "branch001872": 1,
          "skip0018AF": 1,
          "preWipe001879": 0,
          "cleanup0018F8": 1,
          "poll006D64": 9041,
          "owner0A31FD": 0
        },
        "afterBootD010": {
          "D010EF": "0xD2A83E",
          "D010FE": "0xD1A8CC",
          "D010F4": "0x1F"
        },
        "postD010ReplayFields": {
          "D010EF": "0xD2A83E",
          "D010FE": "0xD1A8CC",
          "D010F4": "0x1F"
        },
        "endFields": {
          "D007CA": "0x000000",
          "D008E0": "0x000000",
          "D010EF": "0x000000",
          "D010FE": "0x000000",
          "D010F4": "0x00",
          "D02437": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02440": "0x000000",
          "D02505": "0x00",
          "D02590": "0x000000",
          "D0259D": "0x000000",
          "D02A29": "0x0000"
        },
        "keyFields": {
          "D007CA": "0x000000",
          "D008E0": "0x000000",
          "D0243A": "0x000000",
          "D0243D": "0x000000",
          "D02590": "0x000000",
          "D000C2": "0x00"
        },
        "matches": {
          "afterBootD010MatchesOracle": true,
          "postKeyD010MatchesOracle": false,
          "postKeyCoreMatchesOracle": false
        },
        "branchEdge": {
          "from": {
            "index": 5400,
            "block": 78211,
            "pc": "0x001872",
            "prevPc": "0x0158F8",
            "af": "0x0044",
            "bc": "0x000003",
            "de": "0x000430",
            "hl": "0x000000",
            "sp": "0xD1A87B",
            "stack0": "0x0013E8",
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D010EF": "0xD2A83E",
            "D010FE": "0xD1A8CC",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D0066F": "0xD1A8A1",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD"
          },
          "to": {
            "index": 5400,
            "block": 78212,
            "pc": "0x0018AF",
            "prevPc": "0x001872",
            "af": "0xFE10",
            "bc": "0x000003",
            "de": "0x000430",
            "hl": "0x000000",
            "sp": "0xD1A87B",
            "stack0": "0x0013E8",
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D010EF": "0xD2A83E",
            "D010FE": "0xD1A8CC",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D0066F": "0xD1A8A1",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD"
          }
        },
        "skipEdge": {
          "from": {
            "pc": "0x001872"
          },
          "to": {
            "index": 5400,
            "block": 78212,
            "pc": "0x0018AF",
            "prevPc": "0x001872",
            "af": "0xFE10",
            "bc": "0x000003",
            "de": "0x000430",
            "hl": "0x000000",
            "sp": "0xD1A87B",
            "stack0": "0x0013E8",
            "D007CA": "0x0585E9",
            "D008E0": "0xD1A863",
            "D010EF": "0xD2A83E",
            "D010FE": "0xD1A8CC",
            "D02317": "0xD2A83E",
            "D0231A": "0xD2A83E",
            "D0231D": "0xD2A83D",
            "D0066F": "0xD1A8A1",
            "D02437": "0xD1A8CC",
            "D0243A": "0xD1A8CC",
            "D0243D": "0xD2A83E",
            "D02440": "0xD2A83E",
            "D02505": "0x0A",
            "D02590": "0xD3FE81",
            "D0259D": "0xD3FECD"
          }
        },
        "preWipeEdge": null,
        "cleanupEdge": {
          "from": {
            "pc": "0x001881"
          },
          "to": {
            "index": 5400,
            "block": 78215,
            "pc": "0x0018F8",
            "prevPc": "0x001881",
            "af": "0x5281",
            "bc": "0x0000FF",
            "de": "0xD3FF00",
            "hl": "0xD3FEFF",
            "sp": "0xD1A87B",
            "stack0": "0x0013E8",
            "D007CA": "0x000000",
            "D008E0": "0x000000",
            "D010EF": "0x000000",
            "D010FE": "0x000000",
            "D02317": "0x000000",
            "D0231A": "0x000000",
            "D0231D": "0x000000",
            "D0066F": "0x000000",
            "D02437": "0x000000",
            "D0243A": "0x000000",
            "D0243D": "0x000000",
            "D02440": "0x000000",
            "D02505": "0x00",
            "D02590": "0x000000",
            "D0259D": "0x000000"
          }
        }
      }
    },
    "d010ChangesRoute": false,
    "d010ReplayObserved": true,
    "portSkipObserved": true,
    "combinedObserved": true,
    "portSkipBypassesWipe": false,
    "combinedBypassesWipe": false,
    "allErrorFree": true,
    "conclusion": "D010-only replay does not change the live route: it still falls through 0x001872 to 0x001879 and the post-key core fields remain non-oracle. Forcing port 0x03 bit 4 set was observed, but it was not sufficient to avoid the wipe in the bounded route. Combining D010 replay with the port-bit skip still does not produce an oracle-compatible post-key state."
  },
  "oracleAfter": {
    "D00359_SAVE_D02437": "0x000000",
    "D0035C_SAVE_D0243A": "0x000000",
    "D0035F_SAVE_D0243D": "0x000000",
    "D00362_SAVE_D02440": "0x000000",
    "D0066F": "0xD1A8A1",
    "D007CA": "0x0585E9",
    "D008E0": "0xD1A86C",
    "D010EF": "0xD2A83E",
    "D010FE": "0xD1A8CC",
    "D02317": "0xD2A83E",
    "D0231A": "0xD2A83E",
    "D0231D": "0xD2A83D",
    "D02437": "0xD1A8CC",
    "D0243A": "0xD1A8CC",
    "D0243D": "0xD2A83E",
    "D02440": "0xD2A83E",
    "D010F4": "0x1F",
    "D02504": "0x00",
    "D02505": "0x0A",
    "D02506": "0x00",
    "D02590": "0xD3FE81",
    "D0259D": "0xD3FECD",
    "D02A29": "0x0000",
    "D00595": "0x25",
    "D00596": "0x00",
    "D0059A": "0x02",
    "D00587": "0x00",
    "D0058C": "0x00",
    "D0058E": "0x00",
    "D000CA_IY4A": "0x21",
    "D000C4_IY44": "0x2E",
    "D000CC_IY4C": "0x00",
    "D000B2_IY32": "0x00"
  },
  "live": {
    "baseline": {
      "status": "Key: CLEAR → 160000 steps (max_steps, peak 8689px)",
      "keyState": {
        "code": "Escape",
        "label": "CLEAR",
        "expectedInsertByte": null,
        "controlPreStopPc": null,
        "controlPreStopLabel": null,
        "cursorBefore": null,
        "insertBlock": null,
        "postInsertGateBlock": null,
        "stoppedAtPostInsertGate": false,
        "D000C2Bit7Restored": false,
        "controlStopBlock": null,
        "controlStopPc": null,
        "controlStopCursorBefore": null,
        "controlStopCursorAfter": null,
        "controlStopCursorRestored": false,
        "uiClearApplied": false,
        "uiClearResult": null,
        "stoppedBeforeControlClear": false,
        "contextVectorRestoreEnabled": false,
        "contextVectorRestored": false,
        "contextVectorRestoreBlock": null,
        "contextVectorRestorePc": null,
        "contextVectorD007CABefore": null,
        "contextVectorD007CAAfter": null,
        "steps": 160000,
        "termination": "max_steps",
        "wipes": 1,
        "D0243A": 0,
        "D0243D": 0,
        "D007CA": 0,
        "D008E0": 0,
        "D02590": 0,
        "D000C2": 0,
        "buffer": [
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0
        ],
        "vramPeak": 8689,
        "vramCurrent": 3031
      },
      "afterBoot": {
        "label": "afterBoot",
        "status": "Coldboot complete. OS event loop is ready.",
        "runtimeMode": "coldboot",
        "lastPc": 574257,
        "lastMode": "adl",
        "totalSteps": 637707,
        "cpu": {
          "pc": "0x0019B5",
          "currentBlockPc": "0x0019B5",
          "stepCount": 49473,
          "sp": "0xD1A866",
          "af": "0x1054",
          "bc": "0x000000",
          "de": "0xD2A815",
          "hl": "0xD1A8A3",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "f": 84
        },
        "fields": {
          "D00359_SAVE_D02437": "0x000000",
          "D0035C_SAVE_D0243A": "0x000000",
          "D0035F_SAVE_D0243D": "0x000000",
          "D00362_SAVE_D02440": "0x000000",
          "D0066F": "0xD1A8A1",
          "D007CA": "0x0585E9",
          "D008E0": "0x000000",
          "D010EF": "0x000000",
          "D010FE": "0x000000",
          "D02317": "0xD2A83E",
          "D0231A": "0xD2A83E",
          "D0231D": "0xD2A83D",
          "D02437": "0xD1A8CC",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02440": "0xD2A83E",
          "D010F4": "0x00",
          "D02504": "0x00",
          "D02505": "0x0A",
          "D02506": "0x00",
          "D02590": "0xD3FE81",
          "D0259D": "0xD3FECD",
          "D02A29": "0x0000",
          "D00595": "0x00",
          "D00596": "0x00",
          "D0059A": "0x00",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058E": "0x00",
          "D000CA_IY4A": "0x20",
          "D000C4_IY44": "0x00",
          "D000CC_IY4C": "0x00",
          "D000B2_IY32": "0x00"
        },
        "bootSnapshot": [
          {
            "name": "D007CA",
            "addr": 13633482,
            "len": 3,
            "value": 361961
          },
          {
            "name": "D008E0",
            "addr": 13633760,
            "len": 3,
            "value": 13740134
          },
          {
            "name": "D02505",
            "addr": 13640965,
            "len": 1,
            "value": 10
          },
          {
            "name": "D02587",
            "addr": 13641095,
            "len": 3,
            "value": 13805794
          },
          {
            "name": "D0258A",
            "addr": 13641098,
            "len": 3,
            "value": 13805794
          },
          {
            "name": "D0258D",
            "addr": 13641101,
            "len": 3,
            "value": 13805794
          },
          {
            "name": "D02590",
            "addr": 13641104,
            "len": 3,
            "value": 13893249
          },
          {
            "name": "D02593",
            "addr": 13641107,
            "len": 3,
            "value": 13893249
          },
          {
            "name": "D0259A",
            "addr": 13641114,
            "len": 3,
            "value": 13893249
          },
          {
            "name": "D0259D",
            "addr": 13641117,
            "len": 3,
            "value": 13893325
          },
          {
            "name": "D025A0",
            "addr": 13641120,
            "len": 3,
            "value": 13805732
          },
          {
            "name": "D025C5",
            "addr": 13641157,
            "len": 3,
            "value": 786432
          }
        ],
        "replayApplied": true,
        "postReplayFields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A866",
          "D02505": "0x0A",
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
        "d010ReplayApplied": false,
        "postD010Fields": {
          "D010EF": "0x000000",
          "D010FE": "0x000000",
          "D010F4": "0x00"
        },
        "port03OverrideApplied": false,
        "lastKey": null,
        "pageErrors": []
      },
      "targetCounts": {
        "flagCaller058A10": 1,
        "flagOwner058212": 1,
        "flagGate0800B8": 3,
        "flagBranch058216": 1,
        "flagMode09142B": 0,
        "flagModeCheck090B81": 0,
        "flagCompare05E3E3": 1,
        "flagCompareD0243D05E3F5": 1,
        "flagCompareD0243A05E3E8": 1,
        "flagCompare04C973": 8,
        "flagReturn058A14": 1,
        "clearCaller058A16": 1,
        "clearEntry0A223A": 1,
        "tailHelper0A2A37": 12,
        "anchor0A229D": 1,
        "spaceFill0A22A4": 1,
        "liveSpin0A1854": 112,
        "owner0A31FD": 0,
        "ownerSetup0A322B": 0,
        "ownerEntry0A321D": 0,
        "copySetup0A31B8": 0,
        "destructiveCopy0A31E2": 0,
        "postCopy0A31A2": 0,
        "portBranch001872": 1,
        "preWipe001879": 1,
        "portSkip0018AF": 0,
        "cleanup0018F8": 1,
        "poll006D64": 9167
      },
      "pageErrors": []
    },
    "d010Replay": {
      "status": "Key: CLEAR → 160000 steps (max_steps, peak 8689px)",
      "keyState": {
        "code": "Escape",
        "label": "CLEAR",
        "expectedInsertByte": null,
        "controlPreStopPc": null,
        "controlPreStopLabel": null,
        "cursorBefore": null,
        "insertBlock": null,
        "postInsertGateBlock": null,
        "stoppedAtPostInsertGate": false,
        "D000C2Bit7Restored": false,
        "controlStopBlock": null,
        "controlStopPc": null,
        "controlStopCursorBefore": null,
        "controlStopCursorAfter": null,
        "controlStopCursorRestored": false,
        "uiClearApplied": false,
        "uiClearResult": null,
        "stoppedBeforeControlClear": false,
        "contextVectorRestoreEnabled": false,
        "contextVectorRestored": false,
        "contextVectorRestoreBlock": null,
        "contextVectorRestorePc": null,
        "contextVectorD007CABefore": null,
        "contextVectorD007CAAfter": null,
        "steps": 160000,
        "termination": "max_steps",
        "wipes": 1,
        "D0243A": 0,
        "D0243D": 0,
        "D007CA": 0,
        "D008E0": 0,
        "D02590": 0,
        "D000C2": 0,
        "buffer": [
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0
        ],
        "vramPeak": 8689,
        "vramCurrent": 3031
      },
      "afterBoot": {
        "label": "afterBoot",
        "status": "Coldboot complete. OS event loop is ready.",
        "runtimeMode": "coldboot",
        "lastPc": 574257,
        "lastMode": "adl",
        "totalSteps": 637707,
        "cpu": {
          "pc": "0x0019B5",
          "currentBlockPc": "0x0019B5",
          "stepCount": 49473,
          "sp": "0xD1A866",
          "af": "0x1054",
          "bc": "0x000000",
          "de": "0xD2A815",
          "hl": "0xD1A8A3",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "f": 84
        },
        "fields": {
          "D00359_SAVE_D02437": "0x000000",
          "D0035C_SAVE_D0243A": "0x000000",
          "D0035F_SAVE_D0243D": "0x000000",
          "D00362_SAVE_D02440": "0x000000",
          "D0066F": "0xD1A8A1",
          "D007CA": "0x0585E9",
          "D008E0": "0x000000",
          "D010EF": "0xD2A83E",
          "D010FE": "0xD1A8CC",
          "D02317": "0xD2A83E",
          "D0231A": "0xD2A83E",
          "D0231D": "0xD2A83D",
          "D02437": "0xD1A8CC",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02440": "0xD2A83E",
          "D010F4": "0x1F",
          "D02504": "0x00",
          "D02505": "0x0A",
          "D02506": "0x00",
          "D02590": "0xD3FE81",
          "D0259D": "0xD3FECD",
          "D02A29": "0x0000",
          "D00595": "0x00",
          "D00596": "0x00",
          "D0059A": "0x00",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058E": "0x00",
          "D000CA_IY4A": "0x20",
          "D000C4_IY44": "0x00",
          "D000CC_IY4C": "0x00",
          "D000B2_IY32": "0x00"
        },
        "bootSnapshot": [
          {
            "name": "D007CA",
            "addr": 13633482,
            "len": 3,
            "value": 361961
          },
          {
            "name": "D008E0",
            "addr": 13633760,
            "len": 3,
            "value": 13740134
          },
          {
            "name": "D02505",
            "addr": 13640965,
            "len": 1,
            "value": 10
          },
          {
            "name": "D02587",
            "addr": 13641095,
            "len": 3,
            "value": 13805794
          },
          {
            "name": "D0258A",
            "addr": 13641098,
            "len": 3,
            "value": 13805794
          },
          {
            "name": "D0258D",
            "addr": 13641101,
            "len": 3,
            "value": 13805794
          },
          {
            "name": "D02590",
            "addr": 13641104,
            "len": 3,
            "value": 13893249
          },
          {
            "name": "D02593",
            "addr": 13641107,
            "len": 3,
            "value": 13893249
          },
          {
            "name": "D0259A",
            "addr": 13641114,
            "len": 3,
            "value": 13893249
          },
          {
            "name": "D0259D",
            "addr": 13641117,
            "len": 3,
            "value": 13893325
          },
          {
            "name": "D025A0",
            "addr": 13641120,
            "len": 3,
            "value": 13805732
          },
          {
            "name": "D025C5",
            "addr": 13641157,
            "len": 3,
            "value": 786432
          }
        ],
        "replayApplied": true,
        "postReplayFields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A866",
          "D02505": "0x0A",
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
        "d010ReplayApplied": true,
        "postD010Fields": {
          "D010EF": "0xD2A83E",
          "D010FE": "0xD1A8CC",
          "D010F4": "0x1F"
        },
        "port03OverrideApplied": false,
        "lastKey": null,
        "pageErrors": []
      },
      "targetCounts": {
        "flagCaller058A10": 1,
        "flagOwner058212": 1,
        "flagGate0800B8": 3,
        "flagBranch058216": 1,
        "flagMode09142B": 0,
        "flagModeCheck090B81": 0,
        "flagCompare05E3E3": 1,
        "flagCompareD0243D05E3F5": 1,
        "flagCompareD0243A05E3E8": 1,
        "flagCompare04C973": 8,
        "flagReturn058A14": 1,
        "clearCaller058A16": 1,
        "clearEntry0A223A": 1,
        "tailHelper0A2A37": 12,
        "anchor0A229D": 1,
        "spaceFill0A22A4": 1,
        "liveSpin0A1854": 112,
        "owner0A31FD": 0,
        "ownerSetup0A322B": 0,
        "ownerEntry0A321D": 0,
        "copySetup0A31B8": 0,
        "destructiveCopy0A31E2": 0,
        "postCopy0A31A2": 0,
        "portBranch001872": 1,
        "preWipe001879": 1,
        "portSkip0018AF": 0,
        "cleanup0018F8": 1,
        "poll006D64": 9167
      },
      "pageErrors": []
    },
    "portSkip": {
      "status": "Key: CLEAR → 160000 steps (max_steps, peak 8689px)",
      "keyState": {
        "code": "Escape",
        "label": "CLEAR",
        "expectedInsertByte": null,
        "controlPreStopPc": null,
        "controlPreStopLabel": null,
        "cursorBefore": null,
        "insertBlock": null,
        "postInsertGateBlock": null,
        "stoppedAtPostInsertGate": false,
        "D000C2Bit7Restored": false,
        "controlStopBlock": null,
        "controlStopPc": null,
        "controlStopCursorBefore": null,
        "controlStopCursorAfter": null,
        "controlStopCursorRestored": false,
        "uiClearApplied": false,
        "uiClearResult": null,
        "stoppedBeforeControlClear": false,
        "contextVectorRestoreEnabled": false,
        "contextVectorRestored": false,
        "contextVectorRestoreBlock": null,
        "contextVectorRestorePc": null,
        "contextVectorD007CABefore": null,
        "contextVectorD007CAAfter": null,
        "steps": 160000,
        "termination": "max_steps",
        "wipes": 1,
        "D0243A": 0,
        "D0243D": 0,
        "D007CA": 0,
        "D008E0": 0,
        "D02590": 0,
        "D000C2": 0,
        "buffer": [
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0
        ],
        "vramPeak": 8689,
        "vramCurrent": 3031
      },
      "afterBoot": {
        "label": "afterBoot",
        "status": "Coldboot complete. OS event loop is ready.",
        "runtimeMode": "coldboot",
        "lastPc": 574257,
        "lastMode": "adl",
        "totalSteps": 637707,
        "cpu": {
          "pc": "0x0019B5",
          "currentBlockPc": "0x0019B5",
          "stepCount": 49473,
          "sp": "0xD1A866",
          "af": "0x1054",
          "bc": "0x000000",
          "de": "0xD2A815",
          "hl": "0xD1A8A3",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "f": 84
        },
        "fields": {
          "D00359_SAVE_D02437": "0x000000",
          "D0035C_SAVE_D0243A": "0x000000",
          "D0035F_SAVE_D0243D": "0x000000",
          "D00362_SAVE_D02440": "0x000000",
          "D0066F": "0xD1A8A1",
          "D007CA": "0x0585E9",
          "D008E0": "0x000000",
          "D010EF": "0x000000",
          "D010FE": "0x000000",
          "D02317": "0xD2A83E",
          "D0231A": "0xD2A83E",
          "D0231D": "0xD2A83D",
          "D02437": "0xD1A8CC",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02440": "0xD2A83E",
          "D010F4": "0x00",
          "D02504": "0x00",
          "D02505": "0x0A",
          "D02506": "0x00",
          "D02590": "0xD3FE81",
          "D0259D": "0xD3FECD",
          "D02A29": "0x0000",
          "D00595": "0x00",
          "D00596": "0x00",
          "D0059A": "0x00",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058E": "0x00",
          "D000CA_IY4A": "0x20",
          "D000C4_IY44": "0x00",
          "D000CC_IY4C": "0x00",
          "D000B2_IY32": "0x00"
        },
        "bootSnapshot": [
          {
            "name": "D007CA",
            "addr": 13633482,
            "len": 3,
            "value": 361961
          },
          {
            "name": "D008E0",
            "addr": 13633760,
            "len": 3,
            "value": 13740134
          },
          {
            "name": "D02505",
            "addr": 13640965,
            "len": 1,
            "value": 10
          },
          {
            "name": "D02587",
            "addr": 13641095,
            "len": 3,
            "value": 13805794
          },
          {
            "name": "D0258A",
            "addr": 13641098,
            "len": 3,
            "value": 13805794
          },
          {
            "name": "D0258D",
            "addr": 13641101,
            "len": 3,
            "value": 13805794
          },
          {
            "name": "D02590",
            "addr": 13641104,
            "len": 3,
            "value": 13893249
          },
          {
            "name": "D02593",
            "addr": 13641107,
            "len": 3,
            "value": 13893249
          },
          {
            "name": "D0259A",
            "addr": 13641114,
            "len": 3,
            "value": 13893249
          },
          {
            "name": "D0259D",
            "addr": 13641117,
            "len": 3,
            "value": 13893325
          },
          {
            "name": "D025A0",
            "addr": 13641120,
            "len": 3,
            "value": 13805732
          },
          {
            "name": "D025C5",
            "addr": 13641157,
            "len": 3,
            "value": 786432
          }
        ],
        "replayApplied": true,
        "postReplayFields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A866",
          "D02505": "0x0A",
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
        "d010ReplayApplied": false,
        "postD010Fields": {
          "D010EF": "0x000000",
          "D010FE": "0x000000",
          "D010F4": "0x00"
        },
        "port03OverrideApplied": false,
        "lastKey": null,
        "pageErrors": []
      },
      "targetCounts": {
        "flagCaller058A10": 1,
        "flagOwner058212": 1,
        "flagGate0800B8": 3,
        "flagBranch058216": 1,
        "flagMode09142B": 0,
        "flagModeCheck090B81": 0,
        "flagCompare05E3E3": 1,
        "flagCompareD0243D05E3F5": 1,
        "flagCompareD0243A05E3E8": 1,
        "flagCompare04C973": 8,
        "flagReturn058A14": 1,
        "clearCaller058A16": 1,
        "clearEntry0A223A": 1,
        "tailHelper0A2A37": 12,
        "anchor0A229D": 1,
        "spaceFill0A22A4": 1,
        "liveSpin0A1854": 112,
        "owner0A31FD": 0,
        "ownerSetup0A322B": 0,
        "ownerEntry0A321D": 0,
        "copySetup0A31B8": 0,
        "destructiveCopy0A31E2": 0,
        "postCopy0A31A2": 0,
        "portBranch001872": 1,
        "preWipe001879": 0,
        "portSkip0018AF": 1,
        "cleanup0018F8": 1,
        "poll006D64": 9041
      },
      "pageErrors": []
    },
    "combined": {
      "status": "Key: CLEAR → 160000 steps (max_steps, peak 8689px)",
      "keyState": {
        "code": "Escape",
        "label": "CLEAR",
        "expectedInsertByte": null,
        "controlPreStopPc": null,
        "controlPreStopLabel": null,
        "cursorBefore": null,
        "insertBlock": null,
        "postInsertGateBlock": null,
        "stoppedAtPostInsertGate": false,
        "D000C2Bit7Restored": false,
        "controlStopBlock": null,
        "controlStopPc": null,
        "controlStopCursorBefore": null,
        "controlStopCursorAfter": null,
        "controlStopCursorRestored": false,
        "uiClearApplied": false,
        "uiClearResult": null,
        "stoppedBeforeControlClear": false,
        "contextVectorRestoreEnabled": false,
        "contextVectorRestored": false,
        "contextVectorRestoreBlock": null,
        "contextVectorRestorePc": null,
        "contextVectorD007CABefore": null,
        "contextVectorD007CAAfter": null,
        "steps": 160000,
        "termination": "max_steps",
        "wipes": 1,
        "D0243A": 0,
        "D0243D": 0,
        "D007CA": 0,
        "D008E0": 0,
        "D02590": 0,
        "D000C2": 0,
        "buffer": [
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0
        ],
        "vramPeak": 8689,
        "vramCurrent": 3031
      },
      "afterBoot": {
        "label": "afterBoot",
        "status": "Coldboot complete. OS event loop is ready.",
        "runtimeMode": "coldboot",
        "lastPc": 574257,
        "lastMode": "adl",
        "totalSteps": 637707,
        "cpu": {
          "pc": "0x0019B5",
          "currentBlockPc": "0x0019B5",
          "stepCount": 49473,
          "sp": "0xD1A866",
          "af": "0x1054",
          "bc": "0x000000",
          "de": "0xD2A815",
          "hl": "0xD1A8A3",
          "ix": "0xD1A860",
          "iy": "0xD00080",
          "f": 84
        },
        "fields": {
          "D00359_SAVE_D02437": "0x000000",
          "D0035C_SAVE_D0243A": "0x000000",
          "D0035F_SAVE_D0243D": "0x000000",
          "D00362_SAVE_D02440": "0x000000",
          "D0066F": "0xD1A8A1",
          "D007CA": "0x0585E9",
          "D008E0": "0x000000",
          "D010EF": "0xD2A83E",
          "D010FE": "0xD1A8CC",
          "D02317": "0xD2A83E",
          "D0231A": "0xD2A83E",
          "D0231D": "0xD2A83D",
          "D02437": "0xD1A8CC",
          "D0243A": "0xD1A8CC",
          "D0243D": "0xD2A83E",
          "D02440": "0xD2A83E",
          "D010F4": "0x1F",
          "D02504": "0x00",
          "D02505": "0x0A",
          "D02506": "0x00",
          "D02590": "0xD3FE81",
          "D0259D": "0xD3FECD",
          "D02A29": "0x0000",
          "D00595": "0x00",
          "D00596": "0x00",
          "D0059A": "0x00",
          "D00587": "0x00",
          "D0058C": "0x00",
          "D0058E": "0x00",
          "D000CA_IY4A": "0x20",
          "D000C4_IY44": "0x00",
          "D000CC_IY4C": "0x00",
          "D000B2_IY32": "0x00"
        },
        "bootSnapshot": [
          {
            "name": "D007CA",
            "addr": 13633482,
            "len": 3,
            "value": 361961
          },
          {
            "name": "D008E0",
            "addr": 13633760,
            "len": 3,
            "value": 13740134
          },
          {
            "name": "D02505",
            "addr": 13640965,
            "len": 1,
            "value": 10
          },
          {
            "name": "D02587",
            "addr": 13641095,
            "len": 3,
            "value": 13805794
          },
          {
            "name": "D0258A",
            "addr": 13641098,
            "len": 3,
            "value": 13805794
          },
          {
            "name": "D0258D",
            "addr": 13641101,
            "len": 3,
            "value": 13805794
          },
          {
            "name": "D02590",
            "addr": 13641104,
            "len": 3,
            "value": 13893249
          },
          {
            "name": "D02593",
            "addr": 13641107,
            "len": 3,
            "value": 13893249
          },
          {
            "name": "D0259A",
            "addr": 13641114,
            "len": 3,
            "value": 13893249
          },
          {
            "name": "D0259D",
            "addr": 13641117,
            "len": 3,
            "value": 13893325
          },
          {
            "name": "D025A0",
            "addr": 13641120,
            "len": 3,
            "value": 13805732
          },
          {
            "name": "D025C5",
            "addr": 13641157,
            "len": 3,
            "value": 786432
          }
        ],
        "replayApplied": true,
        "postReplayFields": {
          "D007CA": "0x0585E9",
          "D008E0": "0xD1A866",
          "D02505": "0x0A",
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
        "d010ReplayApplied": true,
        "postD010Fields": {
          "D010EF": "0xD2A83E",
          "D010FE": "0xD1A8CC",
          "D010F4": "0x1F"
        },
        "port03OverrideApplied": false,
        "lastKey": null,
        "pageErrors": []
      },
      "targetCounts": {
        "flagCaller058A10": 1,
        "flagOwner058212": 1,
        "flagGate0800B8": 3,
        "flagBranch058216": 1,
        "flagMode09142B": 0,
        "flagModeCheck090B81": 0,
        "flagCompare05E3E3": 1,
        "flagCompareD0243D05E3F5": 1,
        "flagCompareD0243A05E3E8": 1,
        "flagCompare04C973": 8,
        "flagReturn058A14": 1,
        "clearCaller058A16": 1,
        "clearEntry0A223A": 1,
        "tailHelper0A2A37": 12,
        "anchor0A229D": 1,
        "spaceFill0A22A4": 1,
        "liveSpin0A1854": 112,
        "owner0A31FD": 0,
        "ownerSetup0A322B": 0,
        "ownerEntry0A321D": 0,
        "copySetup0A31B8": 0,
        "destructiveCopy0A31E2": 0,
        "postCopy0A31A2": 0,
        "portBranch001872": 1,
        "preWipe001879": 0,
        "portSkip0018AF": 1,
        "cleanup0018F8": 1,
        "poll006D64": 9041
      },
      "pageErrors": []
    }
  }
}
```

No runtime, transpiler, browser-shell, decoder, peripheral, scheduler, ROM artifact, or `follow-alongs/` files were changed.

